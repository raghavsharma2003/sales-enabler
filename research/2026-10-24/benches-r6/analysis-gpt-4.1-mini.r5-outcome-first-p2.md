# Analysis-quality bench

2026-10-24T04:37:37.925Z · mode **real** · split **test** · contract **r5-outcome-first** · model: gpt-4.1-mini (gpt-4.1-mini-2025-04-14) · setting {"mode":"single","model":"gpt-4.1-mini","escalateModel":null,"threshold":0.6} · crisis judge off

42 of 42 synthetic calls, 12 templates, languages: hinglish, tamil-english, bengali-english, marathi-english. Scored by code against hand-written keys; the model never grades.

| Field | Accuracy |
|---|---|
| Outcome | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Reason code (all) | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Reason code, model-refined calls | 100.0% (28/28; 95% CI 87.9-100.0%) |
| Reason code, decided by code | 100.0% (14/14; 95% CI 78.5-100.0%) |
| Moments found (recall) | 100.0% (36/36; 95% CI 90.4-100.0%) |
| Objections found (recall) | 100.0% (10/10; 95% CI 72.2-100.0%) |
| Outcome on complaint calls | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Outcome on wrong-person calls | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Every moment found | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Crisis signal | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Crisis recall | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Opt-out, analysis | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Opt-out recall, analysis | 100.0% (5/5; 95% CI 56.6-100.0%) |
| Opt-out recall, deterministic floor | 100.0% (5/5; 95% CI 56.6-100.0%) |
| Follow-ups owed | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Grounded quotes (kept / proposed) | 100.0% (120/120; 95% CI 96.9-100.0%) |

**Cost:** 39 model calls, 29428 input and 4870 output tokens, 879 tokens per call, about ₹0.052 per call.

## Cross-call slice

16 calls with 3 planted objection themes; 16 sampled; 4 themes returned.

| Measure | Result |
|---|---|
| Planted themes recalled (2+ quotes, all from that theme's calls) | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Themes whose quotes all come from one planted theme | 100.0% (4/4; 95% CI 51.0-100.0%) |
| Model quotes that were verbatim | 90.9% (10/11; 95% CI 62.3-98.4%) |

Funnel over the seeded slice: dialled 16, connected 16, talked 16, goal reached 4 ({"verified":0,"manager":0,"ai_guess":4}).

## Misses


## Harness ledger (every model request)

40 requests, 31636 input and 5283 output tokens, ₹2.21 at prices.ts list rates (₹95/$); 429 retries 0, HTTP errors 0, network errors 0, refused by cap 0. Served model: gpt-4.1-mini-2025-04-14. By model: gpt-4.1-mini: 40 requests, 31636 in / 5283 out, ₹2.21.
