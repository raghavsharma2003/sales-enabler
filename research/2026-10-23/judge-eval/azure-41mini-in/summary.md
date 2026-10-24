# Crisis judge eval: azure-41mini-in (2026-10-23)

Sources: heldout-6. Judged 120/120 lines (30 crisis, 90 non-crisis) at ≤1 req/s.
Threshold 0.5, timeout 800 ms. Unavailable: 2/120 (1.7%, CI 0.5-5.9) {"error":1,"timeout":1}.
Latency p50 416 ms, p95 480 ms. Tokens per turn 443 in / 18.5 out. Cost ₹2.59 total, ₹21.62 per 1,000 turns.

| Slice | Recall: floor | Recall: judge | Recall: floor or judge | FP: judge | FP: floor or judge |
|---|---|---|---|---|---|
| overall | 30/30 (100.0%, CI 88.6-100.0) | 29/30 (96.7%, CI 83.3-99.4) | 30/30 (100.0%, CI 88.6-100.0) | 4/90 (4.4%, CI 1.7-10.9) | 4/90 (4.4%, CI 1.7-10.9) |
| source heldout-6 | 30/30 (100.0%, CI 88.6-100.0) | 29/30 (96.7%, CI 83.3-99.4) | 30/30 (100.0%, CI 88.6-100.0) | 4/90 (4.4%, CI 1.7-10.9) | 4/90 (4.4%, CI 1.7-10.9) |
| lang bn-en | 7/7 (100.0%, CI 64.6-100.0) | 7/7 (100.0%, CI 64.6-100.0) | 7/7 (100.0%, CI 64.6-100.0) | 1/7 (14.3%, CI 2.6-51.3) | 1/7 (14.3%, CI 2.6-51.3) |
| lang en | - | - | - | 2/19 (10.5%, CI 2.9-31.4) | 2/19 (10.5%, CI 2.9-31.4) |
| lang hi-deva | 8/8 (100.0%, CI 67.6-100.0) | 8/8 (100.0%, CI 67.6-100.0) | 8/8 (100.0%, CI 67.6-100.0) | 0/12 (0.0%, CI 0.0-24.2) | 0/12 (0.0%, CI 0.0-24.2) |
| lang hinglish | 8/8 (100.0%, CI 67.6-100.0) | 8/8 (100.0%, CI 67.6-100.0) | 8/8 (100.0%, CI 67.6-100.0) | 1/44 (2.3%, CI 0.4-11.8) | 1/44 (2.3%, CI 0.4-11.8) |
| lang ta-en | 7/7 (100.0%, CI 64.6-100.0) | 6/7 (85.7%, CI 48.7-97.4) | 7/7 (100.0%, CI 64.6-100.0) | 0/8 (0.0%, CI 0.0-32.4) | 0/8 (0.0%, CI 0.0-32.4) |

Intervals are Wilson 95%. The floor was tuned on the sets it has seen (in-sample for the floor); the judge prompt was not tuned on any set. Language tags on sets 1-6 are heuristic; sets dev-7 and heldout-7 carry the writer's tags.
