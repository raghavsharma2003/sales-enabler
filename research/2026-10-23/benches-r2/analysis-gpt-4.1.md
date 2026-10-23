# Analysis-quality bench

2026-10-23T22:13:39.025Z · mode **real** · split **test** · model: gpt-4.1 (gpt-4.1-2025-04-14) · crisis judge off

42 of 42 synthetic calls, 12 templates, languages: hinglish, tamil-english, bengali-english, marathi-english. Scored by code against hand-written keys; the model never grades.

| Field | Accuracy |
|---|---|
| Outcome | 85.7% (36/42; 95% CI 72.2-93.3%) |
| Reason code (all) | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Reason code, model-refined calls | 100.0% (28/28; 95% CI 87.9-100.0%) |
| Reason code, decided by code | 100.0% (14/14; 95% CI 78.5-100.0%) |
| Moments found (recall) | 100.0% (36/36; 95% CI 90.4-100.0%) |
| Every moment found | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Crisis signal | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Crisis recall | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Opt-out, analysis | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Opt-out recall, analysis | 100.0% (5/5; 95% CI 56.6-100.0%) |
| Opt-out recall, deterministic floor | 100.0% (5/5; 95% CI 56.6-100.0%) |
| Follow-ups owed | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Grounded quotes (kept / proposed) | 100.0% (140/140; 95% CI 97.3-100.0%) |

**Cost:** 39 model calls, 23968 input and 6998 output tokens, 794 tokens per call, about ₹0.253 per call.

## Cross-call slice

16 calls with 3 planted objection themes; 16 sampled; 3 themes returned.

| Measure | Result |
|---|---|
| Planted themes recalled (2+ quotes, all from that theme's calls) | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Themes whose quotes all come from one planted theme | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Model quotes that were verbatim | 90.0% (9/10; 95% CI 59.6-98.2%) |

Funnel over the seeded slice: dialled 16, connected 16, talked 16, goal reached 4 ({"verified":0,"manager":0,"ai_guess":4}).

## Misses

- `language_mismatch.ecommerce.hinglish`: outcome needs_human (key —), reason CONV_LANGUAGE_MISMATCH (key CONV_LANGUAGE_MISMATCH), moments [confusion, objection] (key [confusion])
- `language_mismatch.education.hinglish`: outcome not_interested (key —), reason CONV_LANGUAGE_MISMATCH (key CONV_LANGUAGE_MISMATCH), moments [confusion, objection] (key [confusion])
- `language_mismatch.realestate.hinglish`: outcome not_interested (key —), reason CONV_LANGUAGE_MISMATCH (key CONV_LANGUAGE_MISMATCH), moments [confusion, objection] (key [confusion])
- `crisis.ecommerce.hinglish`: outcome needs_human (key —), reason END_CRISIS (key END_CRISIS), moments [objection] (key [])
- `crisis.education.hinglish`: outcome needs_human (key —), reason END_CRISIS (key END_CRISIS), moments [objection] (key [])
- `crisis.realestate.hinglish`: outcome needs_human (key —), reason END_CRISIS (key END_CRISIS), moments [objection] (key [])

## Harness ledger (every model request)

40 requests, 26176 input and 7375 output tokens, ₹10.58 at prices.ts list rates (₹95/$); 429 retries 0, HTTP errors 0, network errors 0, refused by cap 0. Served model: gpt-4.1-2025-04-14. By model: gpt-4.1: 40 requests, 26176 in / 7375 out, ₹10.58.
