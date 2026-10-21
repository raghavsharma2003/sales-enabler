-- VP schema 1001 (workspace module): invites, brand details, knowledge spans, revisions for undo,
-- one-time secret boxes, integrations, outbound webhooks and share links.
-- Secrets are never stored in clear: secret_box / integration / webhook_endpoint hold AES-256-GCM ciphertext
-- (VP_SECRET_KEY, bound to the workspace); invite and share tokens are stored as hashes or signed, not kept.

ALTER TABLE member ADD COLUMN IF NOT EXISTS invite_token_hash text;
ALTER TABLE member ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;
ALTER TABLE member ADD COLUMN IF NOT EXISTS invited_by text;
CREATE UNIQUE INDEX IF NOT EXISTS member_invite_token ON member (invite_token_hash) WHERE invite_token_hash IS NOT NULL;

ALTER TABLE brand ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE brand ADD COLUMN IF NOT EXISTS tone text;
ALTER TABLE brand ADD COLUMN IF NOT EXISTS logo_uri text;
ALTER TABLE brand ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE offering ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE offering ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE knowledge_source ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE knowledge_source ADD COLUMN IF NOT EXISTS sha256 text;
CREATE UNIQUE INDEX IF NOT EXISTS ks_ws_sha ON knowledge_source (workspace_id, sha256) WHERE sha256 IS NOT NULL;

-- A span is a quoted piece of a source with its location. Only an approved span may back an offering fact.
CREATE TABLE knowledge_span (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  source_id     uuid NOT NULL REFERENCES knowledge_source(id) ON DELETE CASCADE,
  ordinal       integer NOT NULL,
  text          text NOT NULL,
  location      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by    uuid,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, ordinal)
);
CREATE INDEX knowledge_span_ws ON knowledge_span (workspace_id, status);

-- Version history for draft-class objects; action.undo restores `before`.
CREATE TABLE workspace_revision (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  object_type   text NOT NULL,
  object_id     uuid NOT NULL,
  tool          text NOT NULL,
  actor_type    text NOT NULL,
  actor_id      text,
  before        jsonb,
  after         jsonb,
  summary       text NOT NULL,
  undone_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX workspace_revision_obj ON workspace_revision (workspace_id, object_type, object_id, created_at DESC);

-- Short-lived encrypted holder: a secret shown once to the person who approved its creation (purpose 'reveal'),
-- or secret values staged before integration.connect (purpose 'stash'). Deleted on first read.
CREATE TABLE secret_box (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  member_id     uuid,
  purpose       text NOT NULL CHECK (purpose IN ('reveal','stash')),
  ciphertext    text NOT NULL,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX secret_box_ws ON secret_box (workspace_id, purpose);

CREATE TABLE integration (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','disconnected')),
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ciphertext text,
  secret_keys   text[] NOT NULL DEFAULT '{}',
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE webhook_endpoint (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  url           text NOT NULL,
  description   text,
  events        text[] NOT NULL DEFAULT '{*}',
  secret_ciphertext text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_endpoint_ws ON webhook_endpoint (workspace_id, status);

CREATE TABLE webhook_delivery (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  endpoint_id   uuid NOT NULL REFERENCES webhook_endpoint(id) ON DELETE CASCADE,
  event         text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  attempts      integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until  timestamptz,
  response_status integer,
  error         text,
  replay_of     uuid,
  delivered_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX webhook_delivery_due ON webhook_delivery (status, next_attempt_at);
CREATE INDEX webhook_delivery_ws ON webhook_delivery (workspace_id, endpoint_id, created_at DESC);

CREATE TABLE share_link (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  object_type   text NOT NULL CHECK (object_type IN ('agent','campaign','call','offering')),
  object_id     uuid NOT NULL,
  expires_at    timestamptz NOT NULL,
  created_by    text,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX share_link_ws ON share_link (workspace_id);
