# Turn-taking bench, DEV sweep of CascadeSession.STATEMENT_HOLD_MS, 2026-10-23 (turn + statement scenarios, 47 DEV clips, Silero VAD)

Chosen on DEV: 1200 (cut-ins as low as 1400 at 331 ms less statement latency). Reported on TEST: turn-2026-10-23-test-{before,after}.md.

## STATEMENT_HOLD_MS=0
| end_of_turn_ms (median ms) | 987 | 28 | [971, 1000] |
| end_of_turn_statement_ms (median ms) | 977 | 33 | [965, 989] |
| no_reply_statement | 0.025 (1) | 40 | [0.004, 0.129] |
| premature_cut_in_per_turn | 0.404 (19) | 47 | [0.276, 0.547] |
| premature_cut_in_per_pause | 0.101 (15) | 149 | [0.062, 0.159] |
| talk_over_per_turn | 0.383 (18) | 47 | [0.258, 0.526] |
| no_reply_per_turn | 0.0 (0) | 47 | [0.0, 0.076] |

## STATEMENT_HOLD_MS=600
| end_of_turn_ms (median ms) | 985 | 29 | [975, 997] |
| end_of_turn_statement_ms (median ms) | 979 | 33 | [972, 988] |
| no_reply_statement | 0.025 (1) | 40 | [0.004, 0.129] |
| premature_cut_in_per_turn | 0.383 (18) | 47 | [0.258, 0.526] |
| premature_cut_in_per_pause | 0.101 (15) | 149 | [0.062, 0.159] |
| talk_over_per_turn | 0.383 (18) | 47 | [0.258, 0.526] |
| no_reply_per_turn | 0.0 (0) | 47 | [0.0, 0.076] |

## STATEMENT_HOLD_MS=1000
| end_of_turn_ms (median ms) | 990 | 38 | [979, 999] |
| end_of_turn_statement_ms (median ms) | 1116 | 37 | [1108, 1129] |
| no_reply_statement | 0.0 (0) | 40 | [-0.0, 0.088] |
| premature_cut_in_per_turn | 0.191 (9) | 47 | [0.104, 0.325] |
| premature_cut_in_per_pause | 0.027 (4) | 149 | [0.01, 0.067] |
| talk_over_per_turn | 0.17 (8) | 47 | [0.089, 0.301] |
| no_reply_per_turn | 0.0 (0) | 47 | [0.0, 0.076] |

## STATEMENT_HOLD_MS=1200
| end_of_turn_ms (median ms) | 985 | 46 | [976, 995] |
| end_of_turn_statement_ms (median ms) | 1308 | 40 | [1305, 1312] |
| no_reply_statement | 0.0 (0) | 40 | [-0.0, 0.088] |
| premature_cut_in_per_turn | 0.021 (1) | 47 | [0.004, 0.111] |
| premature_cut_in_per_pause | 0.007 (1) | 149 | [0.001, 0.037] |
| talk_over_per_turn | 0.021 (1) | 47 | [0.004, 0.111] |
| no_reply_per_turn | 0.0 (0) | 47 | [0.0, 0.076] |

## STATEMENT_HOLD_MS=1400
| end_of_turn_ms (median ms) | 990 | 46 | [978, 999] |
| end_of_turn_statement_ms (median ms) | 1493 | 40 | [1489, 1504] |
| no_reply_statement | 0.0 (0) | 40 | [-0.0, 0.088] |
| premature_cut_in_per_turn | 0.021 (1) | 47 | [0.004, 0.111] |
| premature_cut_in_per_pause | 0.0 (0) | 149 | [0.0, 0.025] |
| talk_over_per_turn | 0.021 (1) | 47 | [0.004, 0.111] |
| no_reply_per_turn | 0.0 (0) | 47 | [0.0, 0.076] |

