-- VP schema 0006: contact memory (a quoted, permissioned ledger) and metered money.
-- Memory facts keep the caller's exact words and a span into the recording; they can be
-- played, edited or forgotten. Cost lines are written by the meter, never by an agent.

CREATE TABLE memory_fact (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversation(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('preference','commitment','context','objection')),
  key           text,                       -- e.g. 'language', 'pace', 'best_time', 'formality'
  value         jsonb NOT NULL,
  quote         text NOT NULL,              -- the caller's exact words
  span          jsonb,                      -- {start_ms, end_ms}
  purpose       text NOT NULL,
  basis         text NOT NULL,
  tier          text NOT NULL DEFAULT 'auto' CHECK (tier IN ('instant','auto','review')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('proposed','active','rejected','forgotten')),
  undo_until    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  forgotten_at  timestamptz
);
CREATE INDEX memory_contact ON memory_fact (contact_id, status);

CREATE TABLE forget_request (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  contact_id    uuid REFERENCES contact(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'received' CHECK (status IN ('received','done')),
  receipt       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  done_at       timestamptz
);

CREATE TABLE cost_line (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversation(id) ON DELETE CASCADE,
  attempt_id    uuid REFERENCES attempt(id) ON DELETE SET NULL,
  component     text NOT NULL CHECK (component IN ('telephony','ears','brain','voice','platform','analysis','memory')),
  provider      text,
  quantity      numeric NOT NULL,
  unit          text NOT NULL,              -- 'second', 'token', 'char', 'call'
  inr_milli     bigint NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cost_conv ON cost_line (conversation_id);
CREATE INDEX cost_ws_time ON cost_line (workspace_id, created_at DESC);

-- A reservation holds wallet funds before a dial so a cap is never overshot.
CREATE TABLE reservation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  attempt_id    uuid REFERENCES attempt(id) ON DELETE CASCADE,
  inr_milli     bigint NOT NULL,
  status        text NOT NULL DEFAULT 'held' CHECK (status IN ('held','settled','released')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Usage is metered now; a rate card and invoices come later (decision.2026-10-21.pricing-deferred).
CREATE TABLE usage_period (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  period_start  date NOT NULL,
  connected_seconds bigint NOT NULL DEFAULT 0,
  cost_inr_milli    bigint NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, period_start)
);
