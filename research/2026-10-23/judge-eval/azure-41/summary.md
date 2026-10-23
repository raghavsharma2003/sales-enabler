# Crisis judge eval: azure-41 (2026-10-23)

Sources: heldout-6. Judged 120/120 lines (30 crisis, 90 non-crisis) at ≤1 req/s.
Threshold 0.5, timeout 800 ms. Unavailable: 32/120 (26.7%, CI 19.6-35.2) {"timeout":32}.
Latency p50 673 ms, p95 731 ms. Tokens per turn 331 in / 13.9 out. Cost ₹8.80 total, ₹73.33 per 1,000 turns.

| Slice | Recall: floor | Recall: judge | Recall: floor or judge | FP: judge | FP: floor or judge |
|---|---|---|---|---|---|
| overall | 30/30 (100.0%, CI 88.6-100.0) | 19/30 (63.3%, CI 45.5-78.1) | 30/30 (100.0%, CI 88.6-100.0) | 0/90 (0.0%, CI 0.0-4.1) | 0/90 (0.0%, CI 0.0-4.1) |
| source heldout-6 | 30/30 (100.0%, CI 88.6-100.0) | 19/30 (63.3%, CI 45.5-78.1) | 30/30 (100.0%, CI 88.6-100.0) | 0/90 (0.0%, CI 0.0-4.1) | 0/90 (0.0%, CI 0.0-4.1) |
| lang bn-en | 7/7 (100.0%, CI 64.6-100.0) | 7/7 (100.0%, CI 64.6-100.0) | 7/7 (100.0%, CI 64.6-100.0) | 0/7 (0.0%, CI 0.0-35.4) | 0/7 (0.0%, CI 0.0-35.4) |
| lang en | - | - | - | 0/19 (0.0%, CI 0.0-16.8) | 0/19 (0.0%, CI 0.0-16.8) |
| lang hi-deva | 8/8 (100.0%, CI 67.6-100.0) | 5/8 (62.5%, CI 30.6-86.3) | 8/8 (100.0%, CI 67.6-100.0) | 0/12 (0.0%, CI 0.0-24.2) | 0/12 (0.0%, CI 0.0-24.2) |
| lang hinglish | 8/8 (100.0%, CI 67.6-100.0) | 4/8 (50.0%, CI 21.5-78.5) | 8/8 (100.0%, CI 67.6-100.0) | 0/44 (0.0%, CI 0.0-8.0) | 0/44 (0.0%, CI 0.0-8.0) |
| lang ta-en | 7/7 (100.0%, CI 64.6-100.0) | 3/7 (42.9%, CI 15.8-75.0) | 7/7 (100.0%, CI 64.6-100.0) | 0/8 (0.0%, CI 0.0-32.4) | 0/8 (0.0%, CI 0.0-32.4) |

Intervals are Wilson 95%. The floor was tuned on the sets it has seen (in-sample for the floor); the judge prompt was not tuned on any set. Language tags on sets 1-6 are heuristic; sets dev-7 and heldout-7 carry the writer's tags.
