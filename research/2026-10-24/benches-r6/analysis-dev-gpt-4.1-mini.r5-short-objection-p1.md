# Analysis-quality bench

2026-10-24T04:19:29.631Z · mode **real** · split **dev** · contract **r5-short-objection** · model: gpt-4.1-mini (gpt-4.1-mini-2025-04-14) · setting {"mode":"single","model":"gpt-4.1-mini","escalateModel":null,"threshold":0.6} · crisis judge off

42 of 42 synthetic calls, 12 templates, languages: hinglish, tamil-english, bengali-english, marathi-english. Scored by code against hand-written keys; the model never grades.

| Field | Accuracy |
|---|---|
| Outcome | 95.2% (40/42; 95% CI 84.2-98.7%) |
| Reason code (all) | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Reason code, model-refined calls | 100.0% (29/29; 95% CI 88.3-100.0%) |
| Reason code, decided by code | 100.0% (13/13; 95% CI 77.2-100.0%) |
| Moments found (recall) | 94.4% (34/36; 95% CI 81.9-98.5%) |
| Objections found (recall) | 81.8% (9/11; 95% CI 52.3-94.9%) |
| Outcome on complaint calls | 33.3% (1/3; 95% CI 6.1-79.2%) |
| Outcome on wrong-person calls | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Every moment found | 95.2% (40/42; 95% CI 84.2-98.7%) |
| Crisis signal | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Crisis recall | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Opt-out, analysis | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Opt-out recall, analysis | 100.0% (4/4; 95% CI 51.0-100.0%) |
| Opt-out recall, deterministic floor | 100.0% (4/4; 95% CI 51.0-100.0%) |
| Follow-ups owed | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Grounded quotes (kept / proposed) | 100.0% (104/104; 95% CI 96.4-100.0%) |

**Cost:** 39 model calls, 28128 input and 4391 output tokens, 834 tokens per call, about ₹0.049 per call.

## Cross-call slice

20 calls with 3 planted objection themes; 20 sampled; 3 themes returned.

| Measure | Result |
|---|---|
| Planted themes recalled (2+ quotes, all from that theme's calls) | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Themes whose quotes all come from one planted theme | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Model quotes that were verbatim | 100.0% (9/9; 95% CI 70.1-100.0%) |

Funnel over the seeded slice: dialled 20, connected 20, talked 20, goal reached 5 ({"verified":0,"manager":0,"ai_guess":5}).

## Misses

- `complaint.lending.hinglish`: outcome — (key needs_human), reason CONV_COMPLAINT (key CONV_COMPLAINT), moments [objection] (key [objection])
- `complaint.healthcare.hinglish`: outcome — (key needs_human), reason CONV_NEEDS_HUMAN (key CONV_COMPLAINT), moments [objection] (key [objection])
- `objection_resolved.lending.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [commitment] (key [objection, commitment])
- `objection_resolved.telecom.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [commitment] (key [objection, commitment])

## Harness ledger (every model request)

40 requests, 30822 input and 4719 output tokens, ₹2.08 at prices.ts list rates (₹95/$); 429 retries 0, HTTP errors 0, network errors 0, refused by cap 0. Served model: gpt-4.1-mini-2025-04-14. By model: gpt-4.1-mini: 40 requests, 30822 in / 4719 out, ₹2.08.
