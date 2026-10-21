-- Money: Gemini through OpenRouter is retired (decision.2026-10-21.gemini-vertex-only); stack v2-flashlite-or no longer
-- exists in shared/stacks.ts. Its cost card rows go inactive (a price row is never deleted, only retired).
UPDATE cost_card SET active = false WHERE stack_id = 'v2-flashlite-or' AND active;
