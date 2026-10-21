-- Agents module: stored simulation results, and the per-contact rows a simulated caller's agent is given.
-- A test run records the exact draft and brief it ran against, so a result is filed under what actually ran.

ALTER TABLE sim_caller ADD COLUMN IF NOT EXISTS contact jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS sim_caller_ws ON sim_caller (workspace_id, agent_id);

CREATE TABLE IF NOT EXISTS agent_test_run (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id       uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  sim_caller_id  uuid REFERENCES sim_caller(id) ON DELETE SET NULL,
  draft_hash     text NOT NULL,
  brief_hash     text NOT NULL,
  transcript     jsonb NOT NULL,
  door           jsonb NOT NULL DEFAULT '[]'::jsonb,
  grades         jsonb NOT NULL,
  passed         boolean NOT NULL,
  ended_by       text NOT NULL,
  usage          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_test_run_agent ON agent_test_run (workspace_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_version_agent ON agent_version (agent_id, number DESC);
