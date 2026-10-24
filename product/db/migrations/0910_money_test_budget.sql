-- Money: the daily test-call budget becomes a workspace cap like the others (owner directive 2026-10-24,
-- calling-first-build-all). Scope 'test', period 'daily', with the most one test call may hold (per_call_inr_milli).
-- Test calls do not reserve through the ledger; their spend is what the calls module records on test conversations
-- since IST midnight, so the row holds the cap and the hold, not a running total. The ledger's reserve() reads only
-- workspace, campaign and api_key caps, so a 'test' row never limits real calls.
ALTER TABLE budget DROP CONSTRAINT IF EXISTS budget_scope_type_check;
ALTER TABLE budget ADD CONSTRAINT budget_scope_type_check CHECK (scope_type IN ('workspace','campaign','api_key','test'));
ALTER TABLE budget ADD COLUMN IF NOT EXISTS per_call_inr_milli bigint CHECK (per_call_inr_milli IS NULL OR per_call_inr_milli > 0);

-- Code defaults (the workspace blueprint's ₹200 a day, ₹50 held per test call). A deployment may override the daily
-- figure for new workspaces with VP_TEST_BUDGET_DEFAULT_INR (product/ops/STAGING.md); production leaves it unset.
ALTER TABLE money_config ADD COLUMN IF NOT EXISTS default_test_budget_inr_milli bigint NOT NULL DEFAULT 200000 CHECK (default_test_budget_inr_milli > 0);
ALTER TABLE money_config ADD COLUMN IF NOT EXISTS default_test_hold_inr_milli bigint NOT NULL DEFAULT 50000 CHECK (default_test_hold_inr_milli > 0);
