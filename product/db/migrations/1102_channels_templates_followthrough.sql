-- VP schema 1102 (channels): message templates and follow-through after a call.
-- A template is drafted here, submitted to Meta for review, and sent only once Meta approves it. Its values ({{1}},
-- {{2}}, ...) are bound from the contact's own record or from what the call earned (a callback time the caller stated),
-- never typed per send. Marketing templates are never sent to a person without their own marketing opt-in.
-- A follow-through rule says: after a call (of this agent or campaign) that ended with this outcome, or an attempt that
-- was not answered, send this approved utility template. A person approves the rule once (A2, bound to the template
-- version); each send is then gated like any other message and metered.

CREATE TABLE channel_template (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  connection_id   uuid NOT NULL REFERENCES channel_connection(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (name ~ '^[a-z0-9_]+$' AND length(name) <= 512),
  language        text NOT NULL CHECK (language ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  category        text NOT NULL CHECK (category IN ('utility','marketing')),
  body            text NOT NULL,
  variables       jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{source, sample}] for {{1}}, {{2}}, ... in order
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','paused','disabled')),
  provider_template_id text,
  reject_reason   text,
  version         integer NOT NULL DEFAULT 1,
  submitted_at    timestamptz,
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, name, language)
);
CREATE INDEX channel_template_ws ON channel_template (workspace_id, status);

ALTER TABLE channel_message ADD CONSTRAINT channel_message_template_fk FOREIGN KEY (template_id) REFERENCES channel_template(id) ON DELETE SET NULL;

CREATE TABLE channel_followthrough (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name            text NOT NULL,
  template_id     uuid NOT NULL REFERENCES channel_template(id) ON DELETE CASCADE,
  agent_id        uuid REFERENCES agent(id) ON DELETE CASCADE,          -- calls of this agent (null: any)
  campaign_id     uuid REFERENCES campaign(id) ON DELETE CASCADE,       -- calls of this campaign (null: any)
  trigger_kind    text NOT NULL CHECK (trigger_kind IN ('outcome','reason_code','asked_whatsapp','not_answered')),
  trigger_value   text,                                                 -- the outcome value or reason code
  purpose         text NOT NULL DEFAULT 'follow_up',
  daily_limit     integer NOT NULL DEFAULT 200 CHECK (daily_limit BETWEEN 1 AND 100000),
  enabled         boolean NOT NULL DEFAULT true,
  version         integer NOT NULL DEFAULT 1,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX channel_followthrough_ws ON channel_followthrough (workspace_id, enabled);

-- Each rule acts on a call (or an unanswered attempt) once, and says what it did.
CREATE TABLE channel_followthrough_run (
  rule_id         uuid NOT NULL REFERENCES channel_followthrough(id) ON DELETE CASCADE,
  source_key      text NOT NULL,                                        -- 'call:<id>' or 'attempt:<id>'
  workspace_id    uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES contact(id) ON DELETE SET NULL,
  message_id      uuid REFERENCES channel_message(id) ON DELETE SET NULL,
  result          text NOT NULL,                                        -- sent | blocked:<reasons> | skipped:<why> | failed | unknown
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, source_key)
);
CREATE INDEX channel_followthrough_run_ws ON channel_followthrough_run (workspace_id, created_at DESC);

-- A caller who asked for WhatsApp on a call ("WhatsApp pe bhej do") is read once per call.
CREATE TABLE channel_call_read (
  conversation_id uuid PRIMARY KEY REFERENCES conversation(id) ON DELETE CASCADE,
  workspace_id    uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  asked_whatsapp  boolean NOT NULL,
  quote           text,
  consent_id      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
