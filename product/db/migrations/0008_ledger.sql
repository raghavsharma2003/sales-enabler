-- A hold counts against the wallet once and against every cap it was checked under (budget_ids),
-- so concurrent holds under one campaign cap see each other.
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS budget_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS settled_inr_milli bigint;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS settled_at timestamptz;
CREATE INDEX IF NOT EXISTS reservation_held ON reservation (workspace_id) WHERE status = 'held';
