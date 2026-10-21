-- Agents module: workspace practice callers keep their shape (label, goal, temperament, language mix, trap), and a
-- test run records which library caller it used when that caller is a server default rather than a row.
ALTER TABLE sim_caller ADD COLUMN IF NOT EXISTS shape jsonb;
ALTER TABLE agent_test_run ADD COLUMN IF NOT EXISTS sim_caller_key text;
