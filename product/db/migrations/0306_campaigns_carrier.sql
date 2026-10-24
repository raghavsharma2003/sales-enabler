-- Carrier truth on a call (campaigns/carrier.ts, shared/carrier.ts): what the carrier said (hang-up cause, durations,
-- billed seconds, the CDR's INR amount) and when it hung up, so the call log shows the carrier's own numbers and a call
-- the runtime lost is still settled. Which carrier application a number was pointed at when staff attached it.
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS carrier jsonb;
ALTER TABLE conversation ADD COLUMN IF NOT EXISTS carrier_hangup_at timestamptz;
CREATE INDEX IF NOT EXISTS conversation_carrier_live ON conversation (carrier_hangup_at) WHERE status = 'live' AND carrier_hangup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversation_carrier_call_any ON conversation (carrier_call_id) WHERE carrier_call_id IS NOT NULL;
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS inbound_app_ref text;
