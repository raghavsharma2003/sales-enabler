-- Kernel additions: approvals are single-use and bound to the object version they were shown against,
-- outcomes can be "unknown" (a carrier timed out after the request left), and humans sign in with a
-- password (scrypt) into a server-side session. Only hashes of session tokens are stored.

ALTER TABLE action DROP CONSTRAINT IF EXISTS action_status_check;
ALTER TABLE action ADD CONSTRAINT action_status_check
  CHECK (status IN ('proposed','approved','executed','failed','unknown','cancelled','expired'));
ALTER TABLE action ADD COLUMN IF NOT EXISTS proposed_by text;
ALTER TABLE action ADD COLUMN IF NOT EXISTS object_version text;
ALTER TABLE action ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE action ADD COLUMN IF NOT EXISTS executed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS approval_token_once ON approval_token (action_id);

ALTER TABLE member ADD COLUMN IF NOT EXISTS password_hash text;

CREATE TABLE IF NOT EXISTS session (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz
);
CREATE INDEX IF NOT EXISTS session_member ON session (member_id);
