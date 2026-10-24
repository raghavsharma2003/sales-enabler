# Analysis-quality bench

2026-10-24T02:26:07.677Z · mode **real** · split **test** · contract **current** · model: gpt-4.1-mini (gpt-4.1-mini-2025-04-14) · crisis judge off

42 of 42 synthetic calls, 12 templates, languages: hinglish, tamil-english, bengali-english, marathi-english. Scored by code against hand-written keys; the model never grades.

| Field | Accuracy |
|---|---|
| Outcome | 92.9% (39/42; 95% CI 81.0-97.5%) |
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
| Grounded quotes (kept / proposed) | 100.0% (108/108; 95% CI 96.6-100.0%) |

**Cost:** 39 model calls, 29428 input and 4362 output tokens, 866 tokens per call, about ₹0.050 per call.

## Cross-call slice

16 calls with 3 planted objection themes; 16 sampled; 4 themes returned.

| Measure | Result |
|---|---|
| Planted themes recalled (2+ quotes, all from that theme's calls) | 66.7% (2/3; 95% CI 20.8-93.9%) |
| Themes whose quotes all come from one planted theme | 75.0% (3/4; 95% CI 30.1-95.4%) |
| Model quotes that were verbatim | 91.7% (11/12; 95% CI 64.6-98.5%) |

Funnel over the seeded slice: dialled 16, connected 16, talked 16, goal reached 4 ({"verified":0,"manager":0,"ai_guess":4}).

## Misses

- `wrong_person.realestate.hinglish`: outcome — (key wrong_person), reason CONV_WRONG_PERSON (key CONV_WRONG_PERSON), moments [] (key [])
- `complaint.ecommerce.hinglish`: outcome — (key needs_human), reason CONV_NEEDS_HUMAN (key CONV_COMPLAINT), moments [objection] (key [objection])
- `complaint.education.hinglish`: outcome — (key needs_human), reason CONV_NEEDS_HUMAN (key CONV_COMPLAINT), moments [objection] (key [objection])

## Harness ledger (every model request)

40 requests, 31636 input and 4802 output tokens, ₹2.12 at prices.ts list rates (₹95/$); 429 retries 0, HTTP errors 0, network errors 0, refused by cap 0. Served model: gpt-4.1-mini-2025-04-14. By model: gpt-4.1-mini: 40 requests, 31636 in / 4802 out, ₹2.12.
