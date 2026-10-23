# Analysis-quality bench

2026-10-23T22:15:51.118Z · mode **real** · split **test** · model: gpt-4.1-mini-2025-04-14 · setting {"mode":"tiered","model":"gpt-4.1-mini","escalateModel":"gpt-4.1","threshold":0.6} · crisis judge off

42 of 42 synthetic calls, 12 templates, languages: hinglish, tamil-english, bengali-english, marathi-english. Scored by code against hand-written keys; the model never grades.

| Field | Accuracy |
|---|---|
| Outcome | 81.0% (34/42; 95% CI 66.7-90.0%) |
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
| Grounded quotes (kept / proposed) | 100.0% (115/115; 95% CI 96.8-100.0%) |

**Cost:** 44 model calls, 26933 input and 4867 output tokens, 723 tokens per call, bench single-rate estimate (not valid for two models; see the ledger below) ₹0.044 per call.

## Tiered analysis

Escalated: 12.8% (5/39; 95% CI 5.6-26.7%); why: {"no outcome":5}; second pass failed: 0.

| Model | Calls | Input tokens | Output tokens |
|---|---|---|---|
| gpt-4.1-mini-2025-04-14 | 39 | 23968 | 4282 |
| gpt-4.1-2025-04-14 | 5 | 2965 | 585 |

## Cross-call slice

16 calls with 3 planted objection themes; 16 sampled; 4 themes returned.

| Measure | Result |
|---|---|
| Planted themes recalled (2+ quotes, all from that theme's calls) | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Themes whose quotes all come from one planted theme | 100.0% (4/4; 95% CI 51.0-100.0%) |
| Model quotes that were verbatim | 90.9% (10/11; 95% CI 62.3-98.4%) |

Funnel over the seeded slice: dialled 16, connected 16, talked 16, goal reached 4 ({"verified":0,"manager":0,"ai_guess":4}).

## Misses

- `language_mismatch.ecommerce.hinglish`: outcome wrong_person (key —), reason CONV_LANGUAGE_MISMATCH (key CONV_LANGUAGE_MISMATCH), moments [confusion] (key [confusion])
- `language_mismatch.education.hinglish`: outcome wrong_person (key —), reason CONV_LANGUAGE_MISMATCH (key CONV_LANGUAGE_MISMATCH), moments [confusion] (key [confusion])
- `language_mismatch.realestate.hinglish`: outcome wrong_person (key —), reason CONV_LANGUAGE_MISMATCH (key CONV_LANGUAGE_MISMATCH), moments [confusion] (key [confusion])
- `crisis.ecommerce.hinglish`: outcome needs_human (key —), reason END_CRISIS (key END_CRISIS), moments [] (key [])
- `crisis.education.hinglish`: outcome needs_human (key —), reason END_CRISIS (key END_CRISIS), moments [objection] (key [])
- `crisis.realestate.hinglish`: outcome needs_human (key —), reason END_CRISIS (key END_CRISIS), moments [objection] (key [])
- `early_hangup.ecommerce.hinglish`: outcome needs_human (key —), reason END_EARLY_HANGUP (key END_EARLY_HANGUP), moments [confusion] (key [])
- `early_hangup.education.hinglish`: outcome needs_human (key —), reason END_EARLY_HANGUP (key END_EARLY_HANGUP), moments [confusion] (key [])

## Harness ledger (every model request)

45 requests, 29141 input and 5279 output tokens, ₹2.89 at prices.ts list rates (₹95/$); 429 retries 0, HTTP errors 0, network errors 0, refused by cap 0. Served model: gpt-4.1-2025-04-14, gpt-4.1-mini-2025-04-14. By model: gpt-4.1-mini: 40 requests, 26176 in / 4694 out, ₹1.88; gpt-4.1: 5 requests, 2965 in / 585 out, ₹1.01.

## Tiered cost (per model, from the bench's per-call cost lines; insight excluded)

gpt-4.1-mini: 39 passes, ₹1.718; gpt-4.1: 5 passes, ₹1.008. ₹0.070 per model-analysed call (39), ₹0.065 per bench call (42). Escalated 5/39. The single-rate '₹ per call' line above does not apply to a two-model run.
