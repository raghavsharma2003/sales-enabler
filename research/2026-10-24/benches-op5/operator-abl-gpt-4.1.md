# Operator bench, 2026-10-24 03:51 UTC (model gpt-4.1, Azure OpenAI, GlobalStandard)

Passed 5 of 7: 71.4% (95% CI 35.9%-91.8%); a model error counts as a fail.
Not measured (the provider refused the content, so the product was not exercised; not in any count): none.
Reached the model: 7 of 7; of those, passed 5: 71.4% (95% CI 35.9%-91.8%).
Tokens 108941, ₹21.30, wall 137 s. Stopped early: cost cap ₹72.896.

| Category | Passed | 95% CI |
|---|---|---|
| agent | 3/3 | 43.9%-100.0% |
| template | 2/3 | 20.8%-93.9% |
| multi | 0/1 | 0.0%-79.3% |

| Task | Result | Reached model | Model calls | Tool calls | Tokens | Tools offered | Schema chars (mean) | find_tools | ms | Why |
|---|---|---|---|---|---|---|---|---|---|---|
| agent-feedback | pass | yes | 2 | 1 | 10263 | 32-32 | 18997 | 0 | 16926 | agent "Furniture Delivery Feedback" is about feedback |
| agent-sitevisit | pass | yes | 2 | 1 | 10429 | 32-32 | 19359 | 0 | 14976 | agent "Green Acres Realty Site Visit Booker" is about site visit |
| agent-webinar | pass | yes | 2 | 1 | 9757 | 32-32 | 17685 | 0 | 17002 | agent "Webinar Invite & Registration" is about webinar |
| tpl-name | pass | yes | 2 | 1 | 9281 | 30-30 | 17057 | 0 | 6442 | Asha, from the clinic template |
| tpl-nodiscount | fail | yes | 5 | 4 | 30415 | 33-33 | 18742 | 0 | 39857 | never-say: [] |
| edit-hindi | pass | yes | 4 | 3 | 23586 | 30-30 | 19106 | 0 | 31899 | primary hi-IN |
| multi-audience-campaign | fail | yes | 3 | 3 | 15210 | 33-33 | 19064 | 0 | 9932 | model error: The assistant's brain did not answer (could not reach the model: bench guard: spend cap reached). Nothing w |
| multi-template-limits | not_run | no | 0 | 0 | 0 | 0-0 | 0 | 0 | 0 | stopped: cost cap ₹72.896 |

## Harness ledger (every model request)

35 requests, 120836 input and 5295 output tokens, ₹26.98 at prices.ts list rates (₹95/$); 429 retries 0, HTTP errors 0, network errors 0, refused by cap 1. Served model: gpt-4.1-2025-04-14. By model: gpt-4.1: 35 requests, 120836 in / 5295 out, ₹26.98.
