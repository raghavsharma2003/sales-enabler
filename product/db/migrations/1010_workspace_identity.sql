-- VP schema 1010 (workspace module): enterprise identity and audit.
--   sso_config     one OIDC connection per workspace; the client secret is AES-256-GCM ciphertext (VP_SECRET_KEY, bound
--                  to the workspace), never clear text. sso_required turns password sign-in off except for one break-glass owner.
--   sso_login      a sign-in in flight: only sha256(state) is stored; the nonce and PKCE verifier are sealed. Single use, 10 minutes.
--   scim_token     provisioning tokens: only sha256(secret) is stored; scoped; rotating replaces the secret in place.
--   audit_export   a signed export of the activity ledger, downloadable for 24 hours, then its content is dropped.
--   audit_anchor   where retention cut the hash chain: the hash of the last purged row, so the chain still verifies.

CREATE TABLE sso_config (
  workspace_id        uuid PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  issuer              text NOT NULL,
  client_id           text NOT NULL,
  client_secret_ciphertext text NOT NULL,
  allowed_domains     text[] NOT NULL,
  default_role        text NOT NULL DEFAULT 'viewer' CHECK (default_role IN ('builder','operator','compliance','viewer')),
  email_verified      text NOT NULL DEFAULT 'required' CHECK (email_verified IN ('required','not_required')),
  enabled             boolean NOT NULL DEFAULT true,
  sso_required        boolean NOT NULL DEFAULT false,
  break_glass_member_id uuid REFERENCES member(id) ON DELETE SET NULL,
  version             integer NOT NULL DEFAULT 1,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- A domain routes to one workspace's sign-in. Claimed first come; see open.2026-10-24.sso-domain-verification.
CREATE TABLE sso_domain (
  domain        text PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE
);
CREATE INDEX sso_domain_ws ON sso_domain (workspace_id);

CREATE TABLE sso_login (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  state_hash    text NOT NULL UNIQUE,
  sealed        text NOT NULL,
  config_version integer NOT NULL,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sso_login_exp ON sso_login (expires_at);

ALTER TABLE member ADD COLUMN IF NOT EXISTS auth_source text NOT NULL DEFAULT 'password' CHECK (auth_source IN ('password','sso','scim'));
ALTER TABLE member ADD COLUMN IF NOT EXISTS sso_subject text;
ALTER TABLE member ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS member_sso_subject ON member (workspace_id, sso_subject) WHERE sso_subject IS NOT NULL;

-- How a session began, so turning on "SSO required" can end the password sessions it no longer allows.
ALTER TABLE session ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'password' CHECK (method IN ('password','sso','break_glass'));

CREATE TABLE scim_token (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name          text NOT NULL,
  prefix        text NOT NULL UNIQUE,
  hash          text NOT NULL,
  scopes        text[] NOT NULL,
  created_by    text,
  rotated_at    timestamptz,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scim_token_ws ON scim_token (workspace_id);

CREATE TABLE audit_export (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  format        text NOT NULL CHECK (format IN ('csv','jsonl')),
  filters       jsonb NOT NULL,
  row_count     integer NOT NULL,
  sha256        text NOT NULL,
  signature     text NOT NULL,
  content       text,
  requested_by  text,
  approved_by   uuid,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_export_ws ON audit_export (workspace_id, created_at DESC);

CREATE TABLE audit_anchor (
  workspace_id  uuid PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  last_hash     text NOT NULL,
  purged_through timestamptz NOT NULL,
  purged_rows   bigint NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
