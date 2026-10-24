-- Money: trial credit at workspace creation, the Vyakti staff credit key, and user-facing labels that say Vyakti.

-- One row of money settings that are Vyakti's to set, not a workspace's. The trial credit is 0 until the owner
-- decides an amount (open.2026-10-22.trial-credit-amount; the blueprint suggests INR 500).
CREATE TABLE money_config (
  id                      boolean PRIMARY KEY DEFAULT true CHECK (id),
  trial_credit_inr_milli  bigint NOT NULL DEFAULT 0 CHECK (trial_credit_inr_milli >= 0),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
INSERT INTO money_config DEFAULT VALUES;

ALTER TABLE wallet_topup DROP CONSTRAINT IF EXISTS wallet_topup_kind_check;
ALTER TABLE wallet_topup ADD CONSTRAINT wallet_topup_kind_check CHECK (kind IN ('payment','manual_credit','trial_credit'));
CREATE UNIQUE INDEX IF NOT EXISTS wallet_topup_one_trial ON wallet_topup (workspace_id) WHERE kind = 'trial_credit';
-- A staff credit's idempotency key is stored as 'credit:<workspace id>:<caller key>' under the existing unique key, so
-- one ticket key credits a workspace once and may be reused for another workspace.

-- Who has had a trial, kept past workspace deletion (no cascade), so closing and re-creating a workspace for the same
-- owner never earns a second one. The email is stored only as a hash.
CREATE TABLE money_trial_grant (
  owner_email_hash  text PRIMARY KEY,
  workspace_id      uuid NOT NULL,
  inr_milli         bigint NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Applied when the workspace's wallet row is first written (signup writes the workspace, its owner, then the wallet).
-- Named to fire before wallet_state, so the state is computed from the credited balance.
CREATE OR REPLACE FUNCTION money_trial_credit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE amt bigint; owner_hash text;
BEGIN
  SELECT trial_credit_inr_milli INTO amt FROM money_config;
  IF coalesce(amt, 0) <= 0 THEN RETURN NEW; END IF;
  SELECT encode(digest(lower(btrim(email)), 'sha256'), 'hex') INTO owner_hash FROM member
   WHERE workspace_id = NEW.workspace_id AND role = 'owner' ORDER BY created_at LIMIT 1;
  IF owner_hash IS NULL THEN RETURN NEW; END IF;
  INSERT INTO money_trial_grant (owner_email_hash, workspace_id, inr_milli) VALUES (owner_hash, NEW.workspace_id, amt)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO wallet_topup (workspace_id, kind, inr_milli, status, reason, actor, credited_at)
    VALUES (NEW.workspace_id, 'trial_credit', amt, 'captured', 'trial credit at workspace creation', 'system', now());
  NEW.balance_inr_milli := NEW.balance_inr_milli + amt;
  RETURN NEW;
END $$;
CREATE TRIGGER wallet_a_trial BEFORE INSERT ON wallet FOR EACH ROW EXECUTE FUNCTION money_trial_credit();

-- Cost-card labels a buyer reads.
UPDATE cost_card SET provider = 'Vyakti infrastructure' WHERE provider = 'VP infra';
UPDATE cost_card SET provider = 'Vyakti call analysis' WHERE provider = 'VP default analysis';
