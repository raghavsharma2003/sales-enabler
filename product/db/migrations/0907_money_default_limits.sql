-- Bounded defaults (must-be audit gap 17, money side): every workspace starts with a daily spend cap and a burst limit,
-- so a runaway campaign, key or loop can never spend without bound before an owner sets their own. Values are Vyakti's
-- config (money_config), owners change them per workspace with cap.raise / cap.lower.
ALTER TABLE money_config ADD COLUMN IF NOT EXISTS default_daily_cap_inr_milli bigint NOT NULL DEFAULT 5000000 CHECK (default_daily_cap_inr_milli > 0);
ALTER TABLE money_config ADD COLUMN IF NOT EXISTS default_burst_inr_milli bigint NOT NULL DEFAULT 2000000 CHECK (default_burst_inr_milli > 0);

-- A 'burst' cap limits the money held at once by calls in flight. The kernel's reserve() checks every workspace cap as
-- spent + held + this hold <= cap; a burst cap's spent stays 0, so it bounds what is held at the same time and nothing else.
ALTER TABLE budget DROP CONSTRAINT IF EXISTS budget_period_check;
ALTER TABLE budget ADD CONSTRAINT budget_period_check CHECK (period IN ('total','daily','monthly','burst'));

CREATE OR REPLACE FUNCTION money_burst_never_spends() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.period = 'burst' THEN NEW.spent_inr_milli := 0; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER budget_burst_never_spends BEFORE INSERT OR UPDATE ON budget FOR EACH ROW EXECUTE FUNCTION money_burst_never_spends();

-- Give a workspace the default daily cap and burst limit, each only if it has none of that kind.
CREATE OR REPLACE FUNCTION money_default_limits(ws uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO budget (workspace_id, scope_type, scope_id, period, cap_inr_milli, period_start)
  SELECT ws, 'workspace', NULL, p.period, p.cap, (now() AT TIME ZONE 'Asia/Kolkata')::date
  FROM (SELECT 'daily'::text AS period, default_daily_cap_inr_milli AS cap FROM money_config
        UNION ALL SELECT 'burst', default_burst_inr_milli FROM money_config) p
  WHERE NOT EXISTS (SELECT 1 FROM budget b WHERE b.workspace_id = ws AND b.scope_type = 'workspace' AND b.scope_id IS NULL AND b.period = p.period)
$$;

CREATE OR REPLACE FUNCTION money_wallet_default_limits() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM money_default_limits(NEW.workspace_id);
  RETURN NULL;
END $$;
CREATE TRIGGER wallet_default_limits AFTER INSERT ON wallet FOR EACH ROW EXECUTE FUNCTION money_wallet_default_limits();

-- Workspaces that exist today get them too.
SELECT money_default_limits(workspace_id) FROM wallet;
