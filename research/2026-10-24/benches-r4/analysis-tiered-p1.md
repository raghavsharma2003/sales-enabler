# Analysis-quality bench

2026-10-24T00:50:57.457Z · mode **real** · split **test** · model: gpt-4.1-mini-2025-04-14 · setting {"mode":"tiered","model":"gpt-4.1-mini","escalateModel":"gpt-4.1","threshold":0.6} · crisis judge off

42 of 42 synthetic calls, 12 templates, languages: hinglish, tamil-english, bengali-english, marathi-english. Scored by code against hand-written keys; the model never grades.

| Field | Accuracy |
|---|---|
| Outcome | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Reason code (all) | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Reason code, model-refined calls | 100.0% (28/28; 95% CI 87.9-100.0%) |
| Reason code, decided by code | 100.0% (14/14; 95% CI 78.5-100.0%) |
| Moments found (recall) | 94.4% (34/36; 95% CI 81.9-98.5%) |
| Every moment found | 95.2% (40/42; 95% CI 84.2-98.7%) |
| Crisis signal | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Crisis recall | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Opt-out, analysis | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Opt-out recall, analysis | 100.0% (5/5; 95% CI 56.6-100.0%) |
| Opt-out recall, deterministic floor | 100.0% (5/5; 95% CI 56.6-100.0%) |
| Follow-ups owed | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Grounded quotes (kept / proposed) | 100.0% (99/99; 95% CI 96.3-100.0%) |

**Cost:** 39 model calls, 27868 input and 4084 output tokens, 819 tokens per call, bench single-rate estimate (not valid for two models; see the ledger below) ₹0.047 per call.

## Tiered analysis

Escalated: 0.0% (0/39; 95% CI 0.0-9.0%); why: {}; second pass failed: 0.

| Model | Calls | Input tokens | Output tokens |
|---|---|---|---|
| gpt-4.1-mini-2025-04-14 | 39 | 27868 | 4084 |

## Cross-call slice

16 calls with 3 planted objection themes; 16 sampled; 4 themes returned.

| Measure | Result |
|---|---|
| Planted themes recalled (2+ quotes, all from that theme's calls) | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Themes whose quotes all come from one planted theme | 100.0% (4/4; 95% CI 51.0-100.0%) |
| Model quotes that were verbatim | 90.9% (10/11; 95% CI 62.3-98.4%) |

Funnel over the seeded slice: dialled 16, connected 16, talked 16, goal reached 4 ({"verified":0,"manager":0,"ai_guess":4}).

## Misses

- `complaint.realestate.hinglish`: outcome needs_human (key needs_human), reason CONV_COMPLAINT (key CONV_COMPLAINT), moments [] (key [objection])
- `objection_resolved.realestate.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [commitment] (key [objection, commitment])

## Harness ledger (every model request)

40 requests, 30076 input and 4495 output tokens, ₹2.01 at prices.ts list rates (₹95/$); 429 retries 0, HTTP errors 0, network errors 0, refused by cap 0. Served model: gpt-4.1-mini-2025-04-14. By model: gpt-4.1-mini: 40 requests, 30076 in / 4495 out, ₹2.01.
