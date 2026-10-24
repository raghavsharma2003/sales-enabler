-- Money: the carrier's billing pulse is stated, not folded into a flat per-call allowance (blueprint decision 10).
-- Plivo's public India pages (fetched 2026-10-24, research/2026-10-24/carrier-pulse/) state a 30-second pulse at
-- ₹0.38/min outbound. The estimate now bills each call's pulse-rounded seconds, so the telephony rows carry no per-call
-- extra. Stored rows are kept in step with prices.ts (tests/money.test.ts checks the two never drift).
UPDATE cost_card SET inr_micro_per_call = 0,
       unit_price = '₹0.38/min, 30-second pulse',
       usage = 'per connected minute; each call is billed in whole 30-second pulses, which the estimate adds per call',
       source = 'https://www.plivo.com/voice/pricing/in/ (fetched 2026-10-24)'
 WHERE component = 'telephony' AND active;

-- Each line records the pulse its carrier bills in (null: not published), so a choice over 30 s can be marked.
ALTER TABLE phone_number ADD COLUMN IF NOT EXISTS billing_pulse_s integer CHECK (billing_pulse_s IS NULL OR billing_pulse_s > 0);
