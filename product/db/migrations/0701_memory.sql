-- Memory module (0701): write gates, retention tiers, contradiction chains, a per-workspace policy and
-- switch, per-contact "stop remembering", and one receipt per extraction run. Builds on 0006 memory_fact.
-- memory_fact.tier (0006) stays the WRITE tier (auto = usable after the undo window, review = needs a person).
-- retention is how long a fact lives: ephemeral facts are never stored, call_to_call ~30 days, durable ~12 months.

ALTER TABLE memory_fact ADD COLUMN IF NOT EXISTS retention text NOT NULL DEFAULT 'call_to_call'
  CHECK (retention IN ('call_to_call','durable'));
ALTER TABLE memory_fact ADD COLUMN IF NOT EXISTS category text;            -- a refused category it was allowed under, else null
ALTER TABLE memory_fact ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'caller'
  CHECK (source IN ('caller','operator','upload','observed'));
ALTER TABLE memory_fact ADD COLUMN IF NOT EXISTS authority integer NOT NULL DEFAULT 100;
ALTER TABLE memory_fact ADD COLUMN IF NOT EXISTS said_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE memory_fact ADD COLUMN IF NOT EXISTS expires_at timestamptz;
-- No FK on purpose: when the winner is forgotten the loser must stay superseded, never resurface.
ALTER TABLE memory_fact ADD COLUMN IF NOT EXISTS superseded_by uuid;
ALTER TABLE memory_fact ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE memory_fact ADD COLUMN IF NOT EXISTS approved_at timestamptz;
CREATE INDEX IF NOT EXISTS memory_ws_contact ON memory_fact (workspace_id, contact_id, status);

CREATE TABLE IF NOT EXISTS memory_policy (
  workspace_id  uuid PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  enabled       boolean NOT NULL DEFAULT true,
  undo_minutes  integer NOT NULL DEFAULT 60 CHECK (undo_minutes BETWEEN 0 AND 10080),
  allowed_categories jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {category: basis}; empty = every refused category refused
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- A person said "stop remembering me": the write gate is closed for this contact until it is lifted.
CREATE TABLE IF NOT EXISTS memory_optout (
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, contact_id)
);

-- One row per conversation: what extraction proposed and why each drop happened. Counts only, no personal text.
CREATE TABLE IF NOT EXISTS memory_extraction (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('done','skipped','failed')),
  reason        text,
  counts        jsonb NOT NULL DEFAULT '{}'::jsonb,
  usage         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, conversation_id)
);

ALTER TABLE forget_request ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'forget_memory'
  CHECK (scope IN ('forget_memory','erase_me'));
ALTER TABLE forget_request ADD COLUMN IF NOT EXISTS requested_via text;
ALTER TABLE forget_request ADD COLUMN IF NOT EXISTS evidence jsonb;
CREATE INDEX IF NOT EXISTS forget_ws_status ON forget_request (workspace_id, status);
