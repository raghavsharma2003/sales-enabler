# Analysis-quality bench

2026-10-23T23:28:20.380Z · mode **real** · split **test** · model: gpt-4.1-mini-2025-04-14 · setting {"mode":"tiered","model":"gpt-4.1-mini","escalateModel":"gpt-4.1","threshold":0.6} · crisis judge off

42 of 42 synthetic calls, 12 templates, languages: hinglish, tamil-english, bengali-english, marathi-english. Scored by code against hand-written keys; the model never grades.

| Field | Accuracy |
|---|---|
| Outcome | 97.6% (41/42; 95% CI 87.7-99.6%) |
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
| Grounded quotes (kept / proposed) | 100.0% (113/113; 95% CI 96.7-100.0%) |

**Cost:** 47 model calls, 30759 input and 5547 output tokens, 772 tokens per call, bench single-rate estimate (not valid for two models; see the ledger below) ₹0.047 per call.

## Tiered analysis

Escalated: 20.5% (8/39; 95% CI 10.8-35.5%); why: {"no outcome":8}; second pass failed: 0.

| Model | Calls | Input tokens | Output tokens |
|---|---|---|---|
| gpt-4.1-mini-2025-04-14 | 39 | 25528 | 3926 |
| gpt-4.1-2025-04-14 | 8 | 5231 | 1621 |

## Cross-call slice

16 calls with 3 planted objection themes; 16 sampled; 3 themes returned.

| Measure | Result |
|---|---|
| Planted themes recalled (2+ quotes, all from that theme's calls) | 66.7% (2/3; 95% CI 20.8-93.9%) |
| Themes whose quotes all come from one planted theme | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Model quotes that were verbatim | 88.9% (8/9; 95% CI 56.5-98.0%) |

Funnel over the seeded slice: dialled 16, connected 16, talked 16, goal reached 4 ({"verified":0,"manager":0,"ai_guess":4}).

## Misses

- `opt_out.telecom.marathi-english`: outcome callback (key not_interested), reason END_OPTED_OUT (key END_OPTED_OUT), moments [opt_out] (key [opt_out])

## Harness ledger (every model request)

48 requests, 32967 input and 5886 output tokens, ₹4.10 at prices.ts list rates (₹95/$); 429 retries 0, HTTP errors 0, network errors 0, refused by cap 0. Served model: gpt-4.1-2025-04-14, gpt-4.1-mini-2025-04-14. By model: gpt-4.1-mini: 40 requests, 27736 in / 4265 out, ₹1.87; gpt-4.1: 8 requests, 5231 in / 1621 out, ₹2.23.
