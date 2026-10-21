-- VP schema 0001: tenancy, identity, money, audit.
-- Every tenant-scoped row carries workspace_id for isolation. Money is stored as
-- integer milli-rupees (INR x 1000) so metering never uses floats.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE workspace (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  region        text NOT NULL DEFAULT 'india',
  plan          text NOT NULL DEFAULT 'base',
  status        text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','suspended','closed')),
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- A person in a workspace. Roles decide what they may approve, in code, not here.
CREATE TABLE member (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  email         text NOT NULL,
  name          text,
  role          text NOT NULL DEFAULT 'operator'
                 CHECK (role IN ('owner','builder','operator','compliance','viewer')),
  status        text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('invited','active','disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

-- API keys are scoped and capped; only the hash is stored.
CREATE TABLE api_key (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name          text NOT NULL,
  prefix        text NOT NULL,
  hash          text NOT NULL,
  scopes        text[] NOT NULL DEFAULT '{}',
  daily_cap_inr_milli  bigint NOT NULL DEFAULT 2000000,
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_key_ws ON api_key (workspace_id);

-- Prepaid INR wallet, one per workspace. Live calls are never cut for money.
CREATE TABLE wallet (
  workspace_id  uuid PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  balance_inr_milli  bigint NOT NULL DEFAULT 0,
  state         text NOT NULL DEFAULT 'empty'
                 CHECK (state IN ('empty','low','ok','blocked','overdrawn')),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Spend caps at workspace / campaign / api-key scope.
CREATE TABLE budget (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  scope_type    text NOT NULL CHECK (scope_type IN ('workspace','campaign','api_key')),
  scope_id      uuid,
  period        text NOT NULL DEFAULT 'total' CHECK (period IN ('total','daily','monthly')),
  cap_inr_milli bigint NOT NULL,
  spent_inr_milli bigint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX budget_ws ON budget (workspace_id, scope_type, scope_id);

-- Hash-chained audit log. Every A2/A3 action and every config change appends a row;
-- hash = sha256(prev_hash || canonical(payload)) is set by the application.
CREATE TABLE audit_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  actor_type    text NOT NULL CHECK (actor_type IN ('member','agent','vp_success','system')),
  actor_id      text,
  action        text NOT NULL,
  object_type   text,
  object_id     uuid,
  args_hash     text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash     text,
  hash          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_ws_time ON audit_event (workspace_id, created_at DESC);

-- Operator chat: threads, messages, and the actions proposed inside them with their
-- hash-bound approval. A spoken "haan" never approves; approval_token is minted by the server.
CREATE TABLE thread (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  member_id     uuid REFERENCES member(id) ON DELETE SET NULL,
  title         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX thread_ws ON thread (workspace_id, created_at DESC);

CREATE TABLE message (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     uuid NOT NULL REFERENCES thread(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('user','vp','system')),
  content       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_thread ON message (thread_id, created_at);

CREATE TABLE action (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  thread_id     uuid REFERENCES thread(id) ON DELETE SET NULL,
  tool          text NOT NULL,
  args          jsonb NOT NULL DEFAULT '{}'::jsonb,
  args_hash     text NOT NULL,
  risk_class    text NOT NULL CHECK (risk_class IN ('read','draft','test','external','spend','destructive','policy')),
  status        text NOT NULL DEFAULT 'proposed'
                 CHECK (status IN ('proposed','approved','executed','failed','cancelled','expired')),
  result        jsonb,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX action_ws ON action (workspace_id, status, created_at DESC);

CREATE TABLE approval_token (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id     uuid NOT NULL REFERENCES action(id) ON DELETE CASCADE,
  approver_id   uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  args_hash     text NOT NULL,
  object_version text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
