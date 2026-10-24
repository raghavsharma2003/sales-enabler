-- Campaigns 0303: member phone verification for test calls, and line pause dates for number.list.
-- A verification stores only a keyed hash of the code. Rate limits count rows: per member per hour, per workspace per
-- day, and per phone per day across ALL workspaces, keyed by a server-wide salted hash so one phone cannot be harassed
-- from many workspaces.
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS paused_at timestamptz;

CREATE TABLE IF NOT EXISTS campaigns_secret (
  name          text PRIMARY KEY,
  value         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS phone_verification (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  e164          text NOT NULL,
  global_hash   text NOT NULL,                 -- HMAC(server salt, e164): the cross-workspace rate-limit key
  code_hash     text,                          -- HMAC(server salt, id + code); never the code
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','expired','locked','call_failed')),
  tries         integer NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  call_ref      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  verified_at   timestamptz
);
CREATE INDEX IF NOT EXISTS phone_verification_member ON phone_verification (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_verification_global ON phone_verification (global_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_verification_ws ON phone_verification (workspace_id, created_at DESC);
