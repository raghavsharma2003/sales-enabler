-- Agents module: a typed practice chat kept for review goes in the test-run history beside practice-caller runs,
-- marked as a chat so the publish card's "last practice call" and pass counts read only graded runs.
ALTER TABLE agent_test_run ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'simulate';
DO $$ BEGIN
  ALTER TABLE agent_test_run ADD CONSTRAINT agent_test_run_kind CHECK (kind IN ('simulate', 'chat'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
