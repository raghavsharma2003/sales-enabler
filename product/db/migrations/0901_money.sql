-- Money module (09xx): the provider cost card, an empty price card, plans with no price yet, top-ups and manual
-- credits, per-workspace thresholds, period caps that reset at Asia/Kolkata midnight, and wallet states kept by a
-- trigger so every balance change (including the kernel ledger's settle) moves the state and raises an issue.
-- No customer price is set here (decision.2026-10-21.pricing-deferred): prices stay NULL until the owner sets them.

-- What VP pays providers, per stack and component, per connected minute (micro-rupees: INR x 1e6, so a
-- 0.26125/min ears line keeps its precision). Global, not tenant data. A new price is a new row; old rows go inactive.
CREATE TABLE cost_card (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stack_id        text NOT NULL,
  component       text NOT NULL CHECK (component IN ('telephony','ears','brain','voice','platform','analysis','memory')),
  provider        text NOT NULL,
  inr_micro_per_min bigint NOT NULL CHECK (inr_micro_per_min >= 0),
  inr_micro_per_call bigint NOT NULL DEFAULT 0 CHECK (inr_micro_per_call >= 0),
  unit_price      text NOT NULL,              -- the list price as published, e.g. '$6/1M audio tokens'
  usage           text NOT NULL,              -- the minute-profile assumption that turns it into per-minute
  grade           text NOT NULL CHECK (grade IN ('measured','computed','vendor','report','not_measured')),
  source          text NOT NULL,
  as_of           date NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cost_card_active ON cost_card (stack_id, component, provider) WHERE active;

-- Plans exist so plan logic can run; none has a price (NULL = 'not set').
CREATE TABLE money_plan (
  id              text PRIMARY KEY,
  label           text NOT NULL,
  features        jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_concurrent  integer,
  per_min_inr_milli bigint,                   -- NULL until the owner sets a rate card
  active          boolean NOT NULL DEFAULT true
);
INSERT INTO money_plan (id, label, features, max_concurrent) VALUES
  ('base', 'Base', '["ear-picked voice stack","reply door","analysis","90-day recordings"]', 10),
  ('plus', 'Plus', '["relational memory brief","learning inbox","1-year retention"]', 25),
  ('premium', 'Premium', '["deep personalisation","India-resident stack option","SSO"]', 100);

-- The customer price card: EMPTY by default. A row is only read when active; margin checks run against the cost card.
CREATE TABLE price_card (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         text NOT NULL REFERENCES money_plan(id),
  stack_id        text,                       -- NULL = the plan's rate for every stack
  per_min_inr_milli bigint NOT NULL CHECK (per_min_inr_milli > 0),
  gst_bp          integer NOT NULL DEFAULT 1800,   -- 18% in basis points, shown beside the price
  active          boolean NOT NULL DEFAULT false,
  set_by          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Per-workspace money settings: the low-balance threshold (blueprint 2.5: under INR 1,000 available).
CREATE TABLE money_settings (
  workspace_id    uuid PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  low_threshold_inr_milli bigint NOT NULL DEFAULT 1000000 CHECK (low_threshold_inr_milli >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Money in: gateway top-ups and VP-success manual credits (with a reason). Idempotent on the gateway's reference.
CREATE TABLE wallet_topup (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('payment','manual_credit')),
  inr_milli       bigint NOT NULL CHECK (inr_milli > 0),
  gateway         text,
  gateway_ref     text,
  status          text NOT NULL CHECK (status IN ('created','captured','failed')),
  reason          text,
  actor           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'manual_credit' OR (reason IS NOT NULL AND length(reason) >= 5)),
  UNIQUE (gateway, gateway_ref)
);
CREATE INDEX wallet_topup_ws ON wallet_topup (workspace_id, created_at DESC);

-- Period caps: the start of the period the budget's spent_inr_milli belongs to (IST date).
ALTER TABLE budget ADD COLUMN IF NOT EXISTS period_start date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date);

-- Reset daily and monthly caps whose period has ended, at Asia/Kolkata midnight. Returns how many were reset.
-- Holds still in flight stay counted (they are tagged by budget id), so a reset never frees money a live call holds.
CREATE OR REPLACE FUNCTION money_roll_periods(ws uuid, at timestamptz) RETURNS integer LANGUAGE sql AS $$
  WITH d AS (SELECT (at AT TIME ZONE 'Asia/Kolkata')::date AS day,
                    date_trunc('month', at AT TIME ZONE 'Asia/Kolkata')::date AS month),
  upd AS (
    UPDATE budget b SET spent_inr_milli = 0,
           period_start = CASE b.period WHEN 'daily' THEN d.day ELSE d.month END
    FROM d
    WHERE (ws IS NULL OR b.workspace_id = ws)
      AND ((b.period = 'daily' AND b.period_start < d.day) OR (b.period = 'monthly' AND b.period_start < d.month))
    RETURNING 1)
  SELECT count(*)::integer FROM upd
$$;

-- Wallet state follows the balance on every write: overdrawn < 0 = empty < low threshold <= ok.
-- 'blocked' is sticky: only an explicit write of another state lifts it (and the state is then recomputed).
CREATE OR REPLACE FUNCTION money_wallet_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE th bigint;
BEGIN
  IF NEW.state = 'blocked' THEN RETURN NEW; END IF;
  SELECT low_threshold_inr_milli INTO th FROM money_settings WHERE workspace_id = NEW.workspace_id;
  th := coalesce(th, 1000000);
  NEW.state := CASE WHEN NEW.balance_inr_milli < 0 THEN 'overdrawn'
                    WHEN NEW.balance_inr_milli = 0 THEN 'empty'
                    WHEN NEW.balance_inr_milli < th THEN 'low'
                    ELSE 'ok' END;
  RETURN NEW;
END $$;
CREATE TRIGGER wallet_state BEFORE INSERT OR UPDATE ON wallet FOR EACH ROW EXECUTE FUNCTION money_wallet_state();

-- An issue opens when the wallet moves into low / empty / overdrawn (one open issue at a time) and resolves at ok.
CREATE OR REPLACE FUNCTION money_wallet_issue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN RETURN NULL; END IF;
  IF NEW.state IN ('low','empty','overdrawn') THEN
    IF NOT EXISTS (SELECT 1 FROM issue WHERE workspace_id = NEW.workspace_id AND category = 'wallet_low' AND status <> 'resolved') THEN
      INSERT INTO issue (workspace_id, category, severity, subject_type, detail)
      VALUES (NEW.workspace_id, 'wallet_low', CASE WHEN NEW.state = 'low' THEN 'warning' ELSE 'critical' END, 'wallet',
              jsonb_build_object('state', NEW.state, 'balance_inr_milli', NEW.balance_inr_milli,
                                 'fix', 'top up the wallet; live calls always finish, new attempts wait'));
    ELSE
      UPDATE issue SET detail = detail || jsonb_build_object('state', NEW.state, 'balance_inr_milli', NEW.balance_inr_milli),
             severity = CASE WHEN NEW.state = 'low' THEN severity ELSE 'critical' END
      WHERE workspace_id = NEW.workspace_id AND category = 'wallet_low' AND status <> 'resolved';
    END IF;
  ELSIF NEW.state = 'ok' THEN
    UPDATE issue SET status = 'resolved', resolved_at = now()
    WHERE workspace_id = NEW.workspace_id AND category = 'wallet_low' AND status <> 'resolved';
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER wallet_issue AFTER UPDATE ON wallet FOR EACH ROW EXECUTE FUNCTION money_wallet_issue();
