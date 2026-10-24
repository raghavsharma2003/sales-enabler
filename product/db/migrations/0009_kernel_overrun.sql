-- A call that costs more than its hold is charged only the hold; the excess is recorded here for VP to
-- absorb or dispute, so a customer's cap or wallet is never pushed past what they agreed to.
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS overrun_inr_milli bigint NOT NULL DEFAULT 0;
