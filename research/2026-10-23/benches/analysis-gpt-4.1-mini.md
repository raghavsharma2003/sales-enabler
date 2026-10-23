# Analysis-quality bench

2026-10-23T20:54:36.602Z · mode **real** · model: gpt-4.1-mini (gpt-4.1-mini-2025-04-14) · crisis judge off

84 of 84 synthetic calls, 12 templates, languages: hinglish, tamil-english, bengali-english, marathi-english. Scored by code against hand-written keys; the model never grades.

| Field | Accuracy |
|---|---|
| Outcome | 83.3% (70/84; 95% CI 73.9-89.8%) |
| Reason code (all) | 97.6% (82/84; 95% CI 91.7-99.3%) |
| Reason code, model-refined calls | 96.5% (55/57; 95% CI 88.1-99.0%) |
| Reason code, decided by code | 100.0% (27/27; 95% CI 87.5-100.0%) |
| Moments found (recall) | 79.2% (57/72; 95% CI 68.4-86.9%) |
| Every moment found | 82.1% (69/84; 95% CI 72.6-88.9%) |
| Crisis signal | 100.0% (84/84; 95% CI 95.6-100.0%) |
| Crisis recall | 100.0% (6/6; 95% CI 61.0-100.0%) |
| Opt-out, analysis | 100.0% (84/84; 95% CI 95.6-100.0%) |
| Opt-out recall, analysis | 100.0% (9/9; 95% CI 70.1-100.0%) |
| Opt-out recall, deterministic floor | 66.7% (6/9; 95% CI 35.4-87.9%) |
| Follow-ups owed | 100.0% (84/84; 95% CI 95.6-100.0%) |
| Grounded quotes (kept / proposed) | 100.0% (230/230; 95% CI 98.4-100.0%) |

**Cost:** 78 model calls, 50692 input and 9587 output tokens, 773 tokens per call, about ₹0.048 per call.

## Cross-call slice

36 calls with 3 planted objection themes; 36 sampled; 5 themes returned.

| Measure | Result |
|---|---|
| Planted themes recalled (2+ quotes, all from that theme's calls) | 100.0% (3/3; 95% CI 43.9-100.0%) |
| Themes whose quotes all come from one planted theme | 100.0% (5/5; 95% CI 56.6-100.0%) |
| Model quotes that were verbatim | 100.0% (15/15; 95% CI 79.6-100.0%) |

## Misses

- `agreed.ecommerce.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [] (key [commitment])
- `agreed.healthcare.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [] (key [commitment])
- `agreed.education.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [] (key [commitment])
- `agreed.telecom.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [] (key [commitment])
- `wrong_person.lending.hinglish`: outcome — (key wrong_person), reason CONV_WRONG_PERSON (key CONV_WRONG_PERSON), moments [] (key [])
- `wrong_person.ecommerce.hinglish`: outcome — (key wrong_person), reason CONV_WRONG_PERSON (key CONV_WRONG_PERSON), moments [] (key [])
- `wrong_person.healthcare.hinglish`: outcome — (key wrong_person), reason CONV_WRONG_PERSON (key CONV_WRONG_PERSON), moments [] (key [])
- `wrong_person.telecom.hinglish`: outcome — (key wrong_person), reason CONV_WRONG_PERSON (key CONV_WRONG_PERSON), moments [] (key [])
- `wrong_person.realestate.hinglish`: outcome — (key wrong_person), reason CONV_WRONG_PERSON (key CONV_WRONG_PERSON), moments [] (key [])
- `opt_out.education.hinglish`: outcome — (key not_interested), reason END_OPTED_OUT (key END_OPTED_OUT), moments [opt_out] (key [opt_out])
- `complaint.lending.hinglish`: outcome — (key needs_human), reason CONV_NEEDS_HUMAN (key CONV_COMPLAINT), moments [objection] (key [objection])
- `complaint.ecommerce.hinglish`: outcome — (key needs_human), reason CONV_NEEDS_HUMAN (key CONV_COMPLAINT), moments [objection] (key [objection])
- `complaint.healthcare.hinglish`: outcome — (key needs_human), reason END_HANDED_OFF (key CONV_COMPLAINT), moments [objection] (key [objection])
- `complaint.education.hinglish`: outcome — (key needs_human), reason CONV_NEEDS_HUMAN (key CONV_COMPLAINT), moments [objection] (key [objection])
- `complaint.telecom.hinglish`: outcome — (key needs_human), reason CONV_NEEDS_HUMAN (key CONV_COMPLAINT), moments [objection] (key [objection])
- `complaint.realestate.hinglish`: outcome — (key needs_human), reason END_HANDED_OFF (key CONV_COMPLAINT), moments [objection] (key [objection])
- `question_then_agreed.ecommerce.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [question] (key [question, commitment])
- `question_then_agreed.healthcare.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [question] (key [question, commitment])
- `question_then_agreed.education.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [question] (key [question, commitment])
- `question_then_agreed.telecom.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [question] (key [question, commitment])
- `objection_resolved.lending.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [commitment] (key [objection, commitment])
- `objection_resolved.ecommerce.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [objection] (key [objection, commitment])
- `objection_resolved.healthcare.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [objection] (key [objection, commitment])
- `objection_resolved.education.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [objection] (key [objection, commitment])
- `objection_resolved.telecom.hinglish`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [objection] (key [objection, commitment])
- `agreed.healthcare.bengali-english`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [question] (key [commitment])
- `opt_out.healthcare.bengali-english`: outcome — (key not_interested), reason END_OPTED_OUT (key END_OPTED_OUT), moments [opt_out] (key [opt_out])
- `agreed.telecom.marathi-english`: outcome agreed (key agreed), reason CONV_GOAL_DONE (key CONV_GOAL_DONE), moments [question] (key [commitment])
- `opt_out.telecom.marathi-english`: outcome — (key not_interested), reason END_OPTED_OUT (key END_OPTED_OUT), moments [opt_out] (key [opt_out])

## Harness ledger (every model request)

79 requests, 55287 input and 10158 output tokens, ₹4.01 at prices.ts list rates (₹95/$); 429 retries 0, HTTP errors 0, network errors 0, refused by cap 0. Served model: gpt-4.1-mini-2025-04-14.
