-- Campaigns 0302: the carrier side of the number step. KYC decisions and A2P declarations carry evidence and a time;
-- carrier webhook events are recorded once by (provider, event_id) so a retried delivery changes nothing.
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS kyc_evidence jsonb;
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS kyc_decided_at timestamptz;
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS a2p_evidence text;
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS a2p_declared_at timestamptz;
CREATE INDEX IF NOT EXISTS phone_number_provider_ref ON phone_number (provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS telephony_event (
  provider      text NOT NULL,
  event_id      text NOT NULL,
  workspace_id  uuid REFERENCES workspace(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
