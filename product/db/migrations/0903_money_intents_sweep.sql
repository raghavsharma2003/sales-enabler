-- Money (review MA-08, MA-09).
-- A top-up is a payment intent written BEFORE the gateway is charged, keyed on the approval it came from, so one
-- action can reach the gateway only once. An outcome lost in transit is 'unknown' and is resolved against the
-- gateway by a job, never retried blind. Crediting happens once (credited_at).
ALTER TABLE wallet_topup DROP CONSTRAINT IF EXISTS wallet_topup_status_check;
ALTER TABLE wallet_topup ADD CONSTRAINT wallet_topup_status_check CHECK (status IN ('created','captured','failed','unknown'));
ALTER TABLE wallet_topup ADD COLUMN IF NOT EXISTS idempotency_key text UNIQUE;
ALTER TABLE wallet_topup ADD COLUMN IF NOT EXISTS action_id uuid REFERENCES action(id) ON DELETE SET NULL;
ALTER TABLE wallet_topup ADD COLUMN IF NOT EXISTS credited_at timestamptz;
ALTER TABLE wallet_topup ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE wallet_topup SET credited_at = created_at WHERE status = 'captured' AND credited_at IS NULL;

-- A hold the sweep released (dial never confirmed, or the runtime went silent past the longest possible call).
-- If cost arrives later it is charged under a new hold and flagged, never dropped.
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS released_reason text;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS released_at timestamptz;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS late_of uuid REFERENCES reservation(id) ON DELETE SET NULL;
