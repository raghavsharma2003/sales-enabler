-- Money (must-be audit gap C). Two things:
-- 1. The limit on money held at once by calls in progress was called 'burst' (0907). The blueprint's "burst" is a
--    different thing (a campaign going past its steady pace, opt-in), so this limit is renamed 'in_flight'.
-- 2. Campaign burst (decision.2026-10-24.campaign-burst-reading): off by default. An owner's approval lets one campaign
--    use more lines than the workspace's steady limit, up to its own ceiling of money held at once. The ceiling is a
--    campaign-scope 'in_flight' cap, so the kernel's reserve() enforces it under its own lock.

ALTER TABLE budget DROP CONSTRAINT IF EXISTS budget_period_check;
UPDATE budget SET period = 'in_flight' WHERE period = 'burst';
ALTER TABLE budget ADD CONSTRAINT budget_period_check CHECK (period IN ('total','daily','monthly','in_flight'));

ALTER TABLE money_config RENAME COLUMN default_burst_inr_milli TO default_in_flight_inr_milli;

CREATE OR REPLACE FUNCTION money_burst_never_spends() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.period = 'in_flight' THEN NEW.spent_inr_milli := 0; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION money_default_limits(ws uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO budget (workspace_id, scope_type, scope_id, period, cap_inr_milli, period_start)
  SELECT ws, 'workspace', NULL, p.period, p.cap, (now() AT TIME ZONE 'Asia/Kolkata')::date
  FROM (SELECT 'daily'::text AS period, default_daily_cap_inr_milli AS cap FROM money_config
        UNION ALL SELECT 'in_flight', default_in_flight_inr_milli FROM money_config) p
  WHERE NOT EXISTS (SELECT 1 FROM budget b WHERE b.workspace_id = ws AND b.scope_type = 'workspace' AND b.scope_id IS NULL AND b.period = p.period)
$$;

-- The most lines a burst may ask for, as a multiple of the workspace's steady line limit (Vyakti's config).
ALTER TABLE money_config ADD COLUMN IF NOT EXISTS burst_max_lines_factor integer NOT NULL DEFAULT 3 CHECK (burst_max_lines_factor >= 1);
