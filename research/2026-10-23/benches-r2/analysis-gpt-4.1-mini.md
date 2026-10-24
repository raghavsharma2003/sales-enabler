# Analysis-quality bench

2026-10-23T22:11:39.902Z · mode **real** · split **test** · model: gpt-4.1-mini (gpt-4.1-mini-2025-04-14) · crisis judge off

42 of 42 synthetic calls, 12 templates, languages: hinglish, tamil-english, bengali-english, marathi-english. Scored by code against hand-written keys; the model never grades.

| Field | Accuracy |
|---|---|
| Outcome | 90.5% (38/42; 95% CI 77.9-96.2%) |
| Reason code (all) | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Reason code, model-refined calls | 100.0% (28/28; 95% CI 87.9-100.0%) |
| Reason code, decided by code | 100.0% (14/14; 95% CI 78.5-100.0%) |
| Moments found (recall) | 91.7% (33/36; 95% CI 78.2-97.1%) |
| Every moment found | 92.9% (39/42; 95% CI 81.0-97.5%) |
| Crisis signal | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Crisis recall | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Opt-out, analysis | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Opt-out recall, analysis | 100.0% (5/5; 95% CI 56.6-100.0%) |
| Opt-out recall, deterministic floor | 100.0% (5/5; 95% CI 56.6-100.0%) |
| Follow-ups owed | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Grounded quotes (kept / proposed) | 100.0% (104/104; 95% CI 96.4-100.0%) |

**Cost:** 39 model calls, 23968 input and 4186 output tokens, 722 tokens per call, about ₹0.044 per call.

## Cross-call slice

16 calls with 3 planted objection themes; 16 sampled; 5 themes returned.

| Measure | Result |
|---|---|
| Planted themes recalled (2+ quotes, all from that theme's calls) | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Themes whose quotes all come from one planted theme | 100.0% (5/5; 95% CI 56.6-100.0%) |
| Model quotes that were verbatim | 86.7% (13/15; 95% CI 62.1-96.3%) |

Funnel over the seeded slice: dialled 16, connected 16, talked 16, goal reached 4 ({"verified":0,"manager":0,"ai_guess":4}).

## Misses

- `complaint.education.hinglish`: outcome needs_human (key needs_human), reason CONV_COMPLAINT (key CONV_COMPLAINT), moments [] (key [objection])
- `complaint.realestate.hinglish`: outcome needs_human (key needs_human), reason CONV_COMPLAINT (key CONV_COMPLAINT), moments [] (key [objection])
- `language_mismatch.ecommerce.hinglish`: outcome wrong_person (key —), reason CONV_LANGUAGE_MISMATCH (key CONV_LANGUAGE_MISMATCH), moments [confusion] (key [confusion])
- `language_mismatch.realestate.hinglish`: outcome wrong_person (key —), reason CONV_LANGUAGE_MISMATCH (key CONV_LANGUAGE_MISMATCH), moments [confusion] (key [confusion])
- `crisis.ecommerce.hinglish`: outcome needs_human (key —), reason END_CRISIS (key END_CRISIS), moments [] (key [])
- `crisis.realestate.hinglish`: outcome needs_human (key —), reason END_CRISIS (key END_CRISIS), moments [objection] (key [])
- `objection_resolved.realestate.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [commitment] (key [objection, commitment])

## Harness ledger (every model request)

40 requests, 26176 input and 4746 output tokens, ₹1.89 at prices.ts list rates (₹95/$); 429 retries 40, HTTP errors 0, network errors 0, refused by cap 0. Served model: gpt-4.1-mini-2025-04-14. By model: gpt-4.1-mini: 40 requests, 26176 in / 4746 out, ₹1.89.
