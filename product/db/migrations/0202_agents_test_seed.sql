-- Agents module: seeded batch simulations record their seed, so a run can be repeated exactly.
ALTER TABLE agent_test_run ADD COLUMN IF NOT EXISTS seed integer;
