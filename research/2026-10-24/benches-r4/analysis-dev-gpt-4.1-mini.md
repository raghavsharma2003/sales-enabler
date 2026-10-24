# Analysis-quality bench

2026-10-24T00:44:34.152Z · mode **real** · split **dev** · model: gpt-4.1-mini (gpt-4.1-mini-2025-04-14) · crisis judge off

42 of 42 synthetic calls, 12 templates, languages: hinglish, tamil-english, bengali-english, marathi-english. Scored by code against hand-written keys; the model never grades.

| Field | Accuracy |
|---|---|
| Outcome | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Reason code (all) | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Reason code, model-refined calls | 100.0% (29/29; 95% CI 88.3-100.0%) |
| Reason code, decided by code | 100.0% (13/13; 95% CI 77.2-100.0%) |
| Moments found (recall) | 94.4% (34/36; 95% CI 81.9-98.5%) |
| Every moment found | 95.2% (40/42; 95% CI 84.2-98.7%) |
| Crisis signal | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Crisis recall | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Opt-out, analysis | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Opt-out recall, analysis | 100.0% (4/4; 95% CI 51.0-100.0%) |
| Opt-out recall, deterministic floor | 100.0% (4/4; 95% CI 51.0-100.0%) |
| Follow-ups owed | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Grounded quotes (kept / proposed) | 100.0% (108/108; 95% CI 96.6-100.0%) |

**Cost:** 39 model calls, 27894 input and 4555 output tokens, 832 tokens per call, about ₹0.049 per call.

## Cross-call slice

20 calls with 3 planted objection themes; 20 sampled; 5 themes returned.

| Measure | Result |
|---|---|
| Planted themes recalled (2+ quotes, all from that theme's calls) | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Themes whose quotes all come from one planted theme | 100.0% (5/5; 95% CI 56.6-100.0%) |
| Model quotes that were verbatim | 100.0% (13/13; 95% CI 77.2-100.0%) |

Funnel over the seeded slice: dialled 20, connected 20, talked 20, goal reached 5 ({"verified":0,"manager":0,"ai_guess":5}).

## Misses

- `complaint.lending.hinglish`: outcome needs_human (key needs_human), reason CONV_COMPLAINT (key CONV_COMPLAINT), moments [] (key [objection])
- `objection_resolved.telecom.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [commitment] (key [objection, commitment])

## Harness ledger (every model request)

40 requests, 30588 input and 5035 output tokens, ₹2.12 at prices.ts list rates (₹95/$); 429 retries 0, HTTP errors 0, network errors 0, refused by cap 0. Served model: gpt-4.1-mini-2025-04-14. By model: gpt-4.1-mini: 40 requests, 30588 in / 5035 out, ₹2.12.
