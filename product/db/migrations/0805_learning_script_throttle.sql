-- VP schema 0805 (learning module): blueprint decision 9's fast lane. When 2 or more harm-class moments fall in any 15
-- consecutive analysed live calls of one script (agent version), the script is throttled: campaigns gate its lines to
-- `factor` of their concurrency (0.25), until a member restores it (script.pacing.restore, A1, audited). One active row
-- per script; restoring keeps the row (restored_at, restored_by) and the moments before it never throttle again.
CREATE TABLE IF NOT EXISTS script_throttle (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id          uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  agent_version_id  uuid NOT NULL REFERENCES agent_version(id) ON DELETE CASCADE,
  factor            numeric NOT NULL CHECK (factor > 0 AND factor <= 1),
  issue_id          uuid REFERENCES issue(id) ON DELETE SET NULL,
  detail            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  restored_at       timestamptz,
  restored_by       text
);
CREATE UNIQUE INDEX IF NOT EXISTS script_throttle_active ON script_throttle (agent_version_id) WHERE restored_at IS NULL;
CREATE INDEX IF NOT EXISTS script_throttle_ws ON script_throttle (workspace_id, created_at DESC);
