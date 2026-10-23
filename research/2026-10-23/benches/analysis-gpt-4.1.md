# Analysis-quality bench

2026-10-23T21:17:15.793Z · mode **real** · model: gpt-4.1 (gpt-4.1-2025-04-14) · crisis judge off

84 of 84 synthetic calls, 12 templates, languages: hinglish, tamil-english, bengali-english, marathi-english. Scored by code against hand-written keys; the model never grades.

| Field | Accuracy |
|---|---|
| Outcome | 100.0% (84/84; 95% CI 95.6-100.0%) |
| Reason code (all) | 100.0% (84/84; 95% CI 95.6-100.0%) |
| Reason code, model-refined calls | 100.0% (57/57; 95% CI 93.7-100.0%) |
| Reason code, decided by code | 100.0% (27/27; 95% CI 87.5-100.0%) |
| Moments found (recall) | 93.1% (67/72; 95% CI 84.8-97.0%) |
| Every moment found | 94.0% (79/84; 95% CI 86.8-97.4%) |
| Crisis signal | 100.0% (84/84; 95% CI 95.6-100.0%) |
| Crisis recall | 100.0% (6/6; 95% CI 61.0-100.0%) |
| Opt-out, analysis | 100.0% (84/84; 95% CI 95.6-100.0%) |
| Opt-out recall, analysis | 100.0% (9/9; 95% CI 70.1-100.0%) |
| Opt-out recall, deterministic floor | 66.7% (6/9; 95% CI 35.4-87.9%) |
| Follow-ups owed | 100.0% (84/84; 95% CI 95.6-100.0%) |
| Grounded quotes (kept / proposed) | 100.0% (277/277; 95% CI 98.6-100.0%) |

**Cost:** 78 model calls, 50692 input and 14332 output tokens, 834 tokens per call, about ₹0.263 per call.

## Cross-call slice

36 calls with 3 planted objection themes; 36 sampled; 4 themes returned.

| Measure | Result |
|---|---|
| Planted themes recalled (2+ quotes, all from that theme's calls) | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Themes whose quotes all come from one planted theme | 100.0% (4/4; 95% CI 51.0-100.0%) |
| Model quotes that were verbatim | 100.0% (11/11; 95% CI 74.1-100.0%) |

## Misses

- `objection_resolved.lending.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [commitment] (key [objection, commitment])
- `objection_resolved.healthcare.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [commitment] (key [objection, commitment])
- `objection_resolved.education.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [commitment] (key [objection, commitment])
- `objection_resolved.telecom.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [commitment] (key [objection, commitment])
- `objection_resolved.realestate.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [commitment] (key [objection, commitment])

## Harness ledger (every model request)

79 requests, 55287 input and 14773 output tokens, ₹21.73 at prices.ts list rates (₹95/$); 429 retries 0, HTTP errors 0, network errors 0, refused by cap 0. Served model: gpt-4.1-2025-04-14.
