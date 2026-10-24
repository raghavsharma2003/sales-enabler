-- VP schema 0004: numbers, campaigns, attempts, conversations, turns, follow-through.
-- An attempt is the dial; a conversation is what happened if it connected. A blocked
-- attempt records which rule blocked it. Every conversation carries a run manifest.

CREATE TABLE phone_number (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  e164          text NOT NULL,
  series        text NOT NULL DEFAULT 'ten_digit' CHECK (series IN ('ten_digit','140','1600','1601','trial')),
  carrier       text NOT NULL,
  byo           boolean NOT NULL DEFAULT false,
  kyc_status    text NOT NULL DEFAULT 'none' CHECK (kyc_status IN ('none','submitted','verified','rejected')),
  a2p_status    text NOT NULL DEFAULT 'undeclared' CHECK (a2p_status IN ('undeclared','declared','rejected')),
  cnap_name     text,
  health        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','released')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, e164)
);

-- A campaign is a versioned policy. call_category comes first and drives the allowed window
-- and number series. state transitions are enforced in code.
CREATE TABLE campaign (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name          text NOT NULL,
  deployment_id uuid REFERENCES deployment(id) ON DELETE SET NULL,
  audience_id   uuid REFERENCES audience(id) ON DELETE SET NULL,
  call_category text NOT NULL CHECK (call_category IN ('service','transactional','promotional')),
  policy        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- window, retry ladder, budgets, pacing, caller-id pool
  policy_version integer NOT NULL DEFAULT 1,
  outcome_definition_id uuid,
  state         text NOT NULL DEFAULT 'draft'
                 CHECK (state IN ('draft','scheduled','running','paused','completed','cancelled')),
  pause_cause   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_ws ON campaign (workspace_id, state);

CREATE TABLE attempt (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  campaign_id   uuid REFERENCES campaign(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  number_id     uuid REFERENCES phone_number(id) ON DELETE SET NULL,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  precheck      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- each gate's verdict and rule version
  status        text NOT NULL DEFAULT 'created'
                 CHECK (status IN ('created','blocked','queued','dialing','ringing','connected',
                                   'no_answer','busy','failed','invalid_number','carrier_blocked','unknown')),
  blocked_by    text,                                  -- the rule that blocked it, if any
  carrier       text,
  carrier_code  text,
  retry_of      uuid REFERENCES attempt(id) ON DELETE SET NULL,
  next_action   jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attempt_campaign ON attempt (campaign_id, status);
CREATE INDEX attempt_due ON attempt (workspace_id, status, scheduled_for);
CREATE INDEX attempt_contact ON attempt (contact_id, created_at DESC);

CREATE TABLE conversation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  attempt_id    uuid REFERENCES attempt(id) ON DELETE SET NULL,
  contact_id    uuid REFERENCES contact(id) ON DELETE SET NULL,
  agent_version_id uuid REFERENCES agent_version(id) ON DELETE SET NULL,
  channel       text NOT NULL DEFAULT 'phone' CHECK (channel IN ('phone','web','test')),
  direction     text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  status        text NOT NULL DEFAULT 'live' CHECK (status IN ('live','ended','processing','done','failed','invalid')),
  run_manifest  jsonb NOT NULL DEFAULT '{}'::jsonb,   -- the combination that actually ran
  end_reason    text,                                  -- engineering reason
  reason_code   text,                                  -- business reason (one of the 34 codes)
  outcome       text,                                  -- business outcome value
  transcript    jsonb NOT NULL DEFAULT '[]'::jsonb,
  recording_uri text,
  analysis      jsonb,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz
);
CREATE INDEX conv_ws_time ON conversation (workspace_id, started_at DESC);
CREATE INDEX conv_contact ON conversation (contact_id, started_at DESC);

CREATE TABLE turn (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  idx           integer NOT NULL,
  speaker       text NOT NULL CHECK (speaker IN ('agent','caller')),
  text          text NOT NULL,
  heard_text    text,
  latency       jsonb,                 -- {ears_ms, hold_ms, brain_ms, voice_ms, gap_ms}
  interrupted   boolean NOT NULL DEFAULT false,
  started_ms    integer,
  ended_ms      integer,
  UNIQUE (conversation_id, idx)
);

CREATE TABLE follow_up (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversation(id) ON DELETE CASCADE,
  channel       text NOT NULL CHECK (channel IN ('whatsapp','sms','callback','email')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','uncertain','cancelled')),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  due_at        timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hand_off (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversation(id) ON DELETE CASCADE,
  mode          text NOT NULL CHECK (mode IN ('cold','warm','hot_callback')),
  destination   text,
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','connected','missed','done')),
  brief         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inbound_route (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  number_id     uuid NOT NULL REFERENCES phone_number(id) ON DELETE CASCADE,
  deployment_id uuid REFERENCES deployment(id) ON DELETE SET NULL,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
