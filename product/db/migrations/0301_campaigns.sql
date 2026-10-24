-- Campaigns module (range 03xx): one dial path. Every attempt (campaign, api, single, test, retry, callback,
-- transfer) is claimed with SELECT ... FOR UPDATE SKIP LOCKED and passes the dial gate G1-G12 inside that claim's
-- transaction. These columns make the claim idempotent (one attempt dials at most once) and explainable.

-- Attempt: kind, target, what the gate picked, and the claim/dispatch stamps.
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'campaign'
  CHECK (kind IN ('campaign','api','single','test','retry','callback','transfer'));
ALTER TABLE attempt ALTER COLUMN contact_id DROP NOT NULL;
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS to_e164 text;               -- test calls: a verified member phone
ALTER TABLE attempt ADD CONSTRAINT attempt_target CHECK (contact_id IS NOT NULL OR (kind = 'test' AND to_e164 IS NOT NULL));
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS agent_version_id uuid REFERENCES agent_version(id) ON DELETE SET NULL;
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS call_category text CHECK (call_category IN ('service','transactional','promotional'));
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS facts jsonb NOT NULL DEFAULT '{}'::jsonb;  -- per-call variables (single/api/test)
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES reservation(id) ON DELETE SET NULL;
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS conversation_id uuid;      -- the ticket's id; the calls module creates the row
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS cli_e164 text;
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS requested_by text;
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS api_key_id uuid;
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS dialed_at timestamptz;     -- set once, when the gate passed
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS dispatched_at timestamptz; -- set when the runtime accepted the ticket
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS counts_to_budget boolean NOT NULL DEFAULT true;
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS outcome_class text;        -- the ladder's input (busy, no_answer, ...)
ALTER TABLE attempt ADD COLUMN IF NOT EXISTS next_eligible_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS attempt_idem ON attempt (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS attempt_due_claim ON attempt (scheduled_for) WHERE status = 'created';
CREATE INDEX IF NOT EXISTS attempt_live ON attempt (workspace_id) WHERE status IN ('dialing','ringing','connected');
CREATE INDEX IF NOT EXISTS attempt_dialed_e164 ON attempt (workspace_id, dialed_at DESC) WHERE dialed_at IS NOT NULL;

ALTER TABLE attempt DROP CONSTRAINT IF EXISTS attempt_status_check;
ALTER TABLE attempt ADD CONSTRAINT attempt_status_check
  CHECK (status IN ('created','blocked','queued','dialing','ringing','connected','no_answer','busy','failed',
                    'invalid_number','carrier_blocked','unknown','cancelled','completed'));

-- Campaign: the pinned agent version, launch stamps and the run's budget.
ALTER TABLE campaign ADD COLUMN IF NOT EXISTS agent_version_id uuid REFERENCES agent_version(id) ON DELETE SET NULL;
ALTER TABLE campaign ADD COLUMN IF NOT EXISTS budget_id uuid REFERENCES budget(id) ON DELETE SET NULL;
ALTER TABLE campaign ADD COLUMN IF NOT EXISTS launched_at timestamptz;
ALTER TABLE campaign ADD COLUMN IF NOT EXISTS launched_by text;

-- Numbers: provider references, pause cause, A2P reference, rent.
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS provider_ref text;
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS pause_cause text;
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS a2p_ref text;
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS kyc_ref text;
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS monthly_rent_inr_milli bigint;
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS display_name text;

-- The workspace's dialling policy: outer band (Compliance sets it inside 07:00-22:00), concurrency, sector for the
-- series router, active sector packs, extra holidays. Versioned; policy.window.set changes it at A2.
CREATE TABLE IF NOT EXISTS dial_policy (
  workspace_id  uuid PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  outer_band    jsonb NOT NULL DEFAULT '{"start":"08:00","end":"21:00"}'::jsonb,
  concurrency   integer NOT NULL DEFAULT 10 CHECK (concurrency BETWEEN 1 AND 1000),
  sector        text,                                   -- e.g. 'utilities', 'logistics' (routes to 1601)
  sector_packs  text[] NOT NULL DEFAULT '{base}',
  holidays      jsonb NOT NULL DEFAULT '[]'::jsonb,     -- extra 'YYYY-MM-DD' dates off for the whole workspace
  version       integer NOT NULL DEFAULT 1,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Phones a member has verified for test calls. Test attempts may dial only these.
CREATE TABLE IF NOT EXISTS verified_test_phone (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  e164          text NOT NULL,
  verified_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, e164)
);
