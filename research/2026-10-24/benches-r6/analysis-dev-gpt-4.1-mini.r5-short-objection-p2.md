# Analysis-quality bench

2026-10-24T04:28:14.323Z · mode **real** · split **dev** · contract **r5-short-objection** · model: gpt-4.1-mini (gpt-4.1-mini-2025-04-14) · setting {"mode":"single","model":"gpt-4.1-mini","escalateModel":null,"threshold":0.6} · crisis judge off

42 of 42 synthetic calls, 12 templates, languages: hinglish, tamil-english, bengali-english, marathi-english. Scored by code against hand-written keys; the model never grades.

| Field | Accuracy |
|---|---|
| Outcome | 97.6% (41/42; 95% CI 87.7-99.6%) |
| Reason code (all) | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Reason code, model-refined calls | 100.0% (29/29; 95% CI 88.3-100.0%) |
| Reason code, decided by code | 100.0% (13/13; 95% CI 77.2-100.0%) |
| Moments found (recall) | 100.0% (36/36; 95% CI 90.4-100.0%) |
| Objections found (recall) | 100.0% (11/11; 95% CI 74.1-100.0%) |
| Outcome on complaint calls | 66.7% (2/3; 95% CI 20.8-93.9%) |
| Outcome on wrong-person calls | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Every moment found | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Crisis signal | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Crisis recall | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Opt-out, analysis | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Opt-out recall, analysis | 100.0% (4/4; 95% CI 51.0-100.0%) |
| Opt-out recall, deterministic floor | 100.0% (4/4; 95% CI 51.0-100.0%) |
| Follow-ups owed | 100.0% (42/42; 95% CI 91.6-100.0%) |
| Grounded quotes (kept / proposed) | 100.0% (106/106; 95% CI 96.5-100.0%) |

**Cost:** 39 model calls, 28128 input and 4440 output tokens, 835 tokens per call, about ₹0.049 per call.

## Cross-call slice

20 calls with 3 planted objection themes; 20 sampled; 3 themes returned.

| Measure | Result |
|---|---|
| Planted themes recalled (2+ quotes, all from that theme's calls) | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Themes whose quotes all come from one planted theme | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Model quotes that were verbatim | 100.0% (9/9; 95% CI 70.1-100.0%) |

Funnel over the seeded slice: dialled 20, connected 20, talked 20, goal reached 5 ({"verified":0,"manager":0,"ai_guess":5}).

## Misses

- `complaint.telecom.hinglish`: outcome — (key needs_human), reason CONV_NEEDS_HUMAN (key CONV_COMPLAINT), moments [objection] (key [objection])

## Harness ledger (every model request)

40 requests, 30822 input and 4767 output tokens, ₹2.08 at prices.ts list rates (₹95/$); 429 retries 0, HTTP errors 0, network errors 0, refused by cap 0. Served model: gpt-4.1-mini-2025-04-14. By model: gpt-4.1-mini: 40 requests, 30822 in / 4767 out, ₹2.08.
