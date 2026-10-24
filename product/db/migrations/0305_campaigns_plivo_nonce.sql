-- Carrier callbacks are signed (X-Plivo-Signature-V3) with a per-request nonce; each nonce is accepted once, so a
-- captured request cannot be replayed (campaigns/plivo-signature.ts). Rows older than a day are pruned by a job.
CREATE TABLE plivo_nonce (
  nonce   text PRIMARY KEY,
  seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plivo_nonce_seen ON plivo_nonce (seen_at);
