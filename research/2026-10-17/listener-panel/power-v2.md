# Power simulation, panel v2 (seed 20261017, 500 simulated panels per cell)

Assumptions (the pilot measures them; re-run before freezing): per-listener logit ability sd 0.8 and item (question) sd 0.5 for comprehension; per-listener logit preference sd 0.5 or 1.0, item sd 0.3, 15% "no difference" answers; rating slopes sd 0.6 and residual sd 1.3 (7-point). Verdicts come from the same functions the analysis uses.

## E1 comprehension floor (60+ panel; 3 neural-default cards x 2 questions = 6 items per listener)

| true accuracy | n=36 P(PASS) / P(FAIL) | n=48 P(PASS) / P(FAIL) | n=60 P(PASS) / P(FAIL) |
|---|---|---|---|
| 0.65 | 0.00 / 0.98 | 0.00 / 0.99 | 0.00 / 1.00 |
| 0.70 | 0.00 / 0.90 | 0.00 / 0.98 | 0.00 / 0.97 |
| 0.75 | 0.04 / 0.61 | 0.01 / 0.75 | 0.01 / 0.81 |
| 0.80 | 0.15 / 0.21 | 0.20 / 0.23 | 0.14 / 0.30 |
| 0.85 | 0.65 / 0.02 | 0.70 / 0.02 | 0.71 / 0.02 |
| 0.90 | 0.99 / 0.00 | 0.98 / 0.00 | 1.00 / 0.00 |

## E2 slow-pace superiority (60+; 6 slow vs 6 default items per listener; baseline 0.78)

| true gain | n=36 P(PASS) | n=48 P(PASS) | n=60 P(PASS) |
|---|---|---|---|
| +0.00 | 0.04 | 0.04 | 0.04 |
| +0.05 | 0.32 | 0.37 | 0.44 |
| +0.08 | 0.61 | 0.75 | 0.82 |
| +0.10 | 0.82 | 0.94 | 0.95 |
| +0.15 | 1.00 | 1.00 | 1.00 |

## Pair preferences (PREFERRED / NOT_PREFERRED shares)

### T1 HD vs neural, pooled renewal panels: 4 pairs per listener

| true p | sd_u | n=60 | n=84 | n=96 |
|---|---|---|---|---|
| 0.50 | 0.5 | P 0.03 / K 0.58 | P 0.03 / K 0.66 | P 0.02 / K 0.73 |
| 0.58 | 0.5 | P 0.43 / K 0.09 | P 0.43 / K 0.06 | P 0.47 / K 0.07 |
| 0.65 | 0.5 | P 0.90 / K 0.00 | P 0.93 / K 0.00 | P 0.95 / K 0.00 |
| 0.70 | 0.5 | P 1.00 / K 0.00 | P 1.00 / K 0.00 | P 1.00 / K 0.00 |
| 0.50 | 1.0 | P 0.02 / K 0.48 | P 0.03 / K 0.62 | P 0.02 / K 0.65 |
| 0.58 | 1.0 | P 0.35 / K 0.06 | P 0.36 / K 0.08 | P 0.39 / K 0.11 |
| 0.65 | 1.0 | P 0.78 / K 0.00 | P 0.88 / K 0.00 | P 0.88 / K 0.01 |
| 0.70 | 1.0 | P 0.96 / K 0.00 | P 0.99 / K 0.00 | P 0.99 / K 0.00 |

### S1 safety vs plain, pooled: 2 pairs per listener

| true p | sd_u | n=60 | n=84 | n=96 |
|---|---|---|---|---|
| 0.50 | 0.5 | P 0.05 / K 0.37 | P 0.03 / K 0.51 | P 0.05 / K 0.53 |
| 0.58 | 0.5 | P 0.35 / K 0.03 | P 0.42 / K 0.05 | P 0.44 / K 0.07 |
| 0.65 | 0.5 | P 0.76 / K 0.00 | P 0.87 / K 0.00 | P 0.90 / K 0.00 |
| 0.70 | 0.5 | P 0.94 / K 0.00 | P 0.97 / K 0.00 | P 0.99 / K 0.00 |
| 0.50 | 1.0 | P 0.03 / K 0.32 | P 0.05 / K 0.40 | P 0.04 / K 0.45 |
| 0.58 | 1.0 | P 0.24 / K 0.05 | P 0.30 / K 0.06 | P 0.32 / K 0.08 |
| 0.65 | 1.0 | P 0.66 / K 0.00 | P 0.77 / K 0.00 | P 0.82 / K 0.00 |
| 0.70 | 1.0 | P 0.87 / K 0.00 | P 0.97 / K 0.00 | P 0.96 / K 0.00 |

### E3 slow vs default, 60+: 3 pairs per listener

| true p | sd_u | n=36 | n=48 | n=60 |
|---|---|---|---|---|
| 0.50 | 0.5 | P 0.02 / K 0.32 | P 0.03 / K 0.40 | P 0.04 / K 0.48 |
| 0.58 | 0.5 | P 0.24 / K 0.03 | P 0.36 / K 0.05 | P 0.39 / K 0.04 |
| 0.65 | 0.5 | P 0.69 / K 0.00 | P 0.82 / K 0.00 | P 0.88 / K 0.00 |
| 0.70 | 0.5 | P 0.92 / K 0.00 | P 0.98 / K 0.00 | P 0.99 / K 0.00 |
| 0.50 | 1.0 | P 0.04 / K 0.26 | P 0.04 / K 0.34 | P 0.03 / K 0.39 |
| 0.58 | 1.0 | P 0.19 / K 0.04 | P 0.28 / K 0.06 | P 0.24 / K 0.07 |
| 0.65 | 1.0 | P 0.53 / K 0.00 | P 0.67 / K 0.01 | P 0.77 / K 0.00 |
| 0.70 | 1.0 | P 0.81 / K 0.00 | P 0.90 / K 0.00 | P 0.92 / K 0.00 |

### L1 Tamil vs Hinglish (5 pairs): 5 pairs per listener

| true p | sd_u | n=30 | n=36 | n=48 |
|---|---|---|---|---|
| 0.50 | 0.5 | P 0.05 / K 0.36 | P 0.04 / K 0.42 | P 0.02 / K 0.54 |
| 0.58 | 0.5 | P 0.29 / K 0.05 | P 0.42 / K 0.04 | P 0.45 / K 0.07 |
| 0.65 | 0.5 | P 0.80 / K 0.00 | P 0.85 / K 0.00 | P 0.90 / K 0.00 |
| 0.70 | 0.5 | P 0.94 / K 0.00 | P 0.98 / K 0.00 | P 0.99 / K 0.00 |
| 0.50 | 1.0 | P 0.03 / K 0.29 | P 0.03 / K 0.38 | P 0.04 / K 0.42 |
| 0.58 | 1.0 | P 0.24 / K 0.04 | P 0.28 / K 0.07 | P 0.33 / K 0.07 |
| 0.65 | 1.0 | P 0.57 / K 0.01 | P 0.66 / K 0.01 | P 0.74 / K 0.00 |
| 0.70 | 1.0 | P 0.80 / K 0.00 | P 0.88 / K 0.00 | P 0.97 / K 0.00 |

### L4 Marathi vs Hinglish / D1 Bhojpuri (8 pairs): 8 pairs per listener

| true p | sd_u | n=24 | n=30 | n=36 |
|---|---|---|---|---|
| 0.50 | 0.5 | P 0.04 / K 0.40 | P 0.05 / K 0.47 | P 0.04 / K 0.52 |
| 0.58 | 0.5 | P 0.39 / K 0.05 | P 0.46 / K 0.06 | P 0.43 / K 0.07 |
| 0.65 | 0.5 | P 0.86 / K 0.00 | P 0.88 / K 0.00 | P 0.92 / K 0.00 |
| 0.70 | 0.5 | P 0.98 / K 0.00 | P 0.99 / K 0.00 | P 0.99 / K 0.00 |
| 0.50 | 1.0 | P 0.04 / K 0.28 | P 0.02 / K 0.34 | P 0.03 / K 0.42 |
| 0.58 | 1.0 | P 0.19 / K 0.04 | P 0.26 / K 0.07 | P 0.32 / K 0.08 |
| 0.65 | 1.0 | P 0.63 / K 0.00 | P 0.71 / K 0.01 | P 0.72 / K 0.00 |
| 0.70 | 1.0 | P 0.80 / K 0.00 | P 0.92 / K 0.00 | P 0.95 / K 0.00 |

### K1 ours vs competitor (pooled renewal panels, about 1 pair per listener per vendor; 3 per listener over all vendors)

| true p(ours) | 1 pair, n=84 | 3 pairs, n=84 |
|---|---|---|
| 0.30 | ours 0.00 / other 0.88 | ours 0.00 / other 1.00 |
| 0.42 | ours 0.00 / other 0.25 | ours 0.00 / other 0.42 |
| 0.50 | ours 0.04 / other 0.03 | ours 0.02 / other 0.04 |
| 0.58 | ours 0.25 / other 0.00 | ours 0.45 / other 0.00 |
| 0.70 | ours 0.90 / other 0.00 | ours 1.00 / other 0.00 |

## Non-inferiority, P(PASS) when there is no difference / P(FAIL) when clearly worse

| test | n | no difference: P(PASS) | clearly worse: P(FAIL) |
|---|---|---|---|
| P5 patronising slow vs default, 60+ (3 vs 3 cards; worse = +1.0) | 48 | 0.90 | 0.91 |
| P5 same, 18-59 | 36 | 0.72 | 0.76 |
| regional patronising (4 vs 4 cards) | 36 | 0.85 | 0.85 |
| regional naturalness (4 vs 4; worse = -0.6) | 36 | 0.82 | 0.84 |

