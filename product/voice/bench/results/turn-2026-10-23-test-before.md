# Turn-taking bench, 2026-10-23 (0e9b9ee), split test, 55 clips, VAD SileroVAD

params {'HOLD_MS': 0, 'STATEMENT_HOLD_MS': 0, 'LONG_HOLD_MS': 1400, 'BARGE_MS': 300, 'BARGE_WORDS': 2, 'BARGE_LONG_MS': 700}

| metric | value | n | 95% CI |
|---|---|---|---|
| end_of_turn_ms (median ms) | 1000 | 37 | [974, 1006] |
| end_of_turn_statement_ms (median ms) | 986 | 41 | [976, 1000] |
| no_reply_statement | 0.0 (0) | 50 | [0.0, 0.071] |
| premature_cut_in_per_turn | 0.327 (18) | 55 | [0.218, 0.459] |
| premature_cut_in_per_pause | 0.076 (12) | 157 | [0.044, 0.129] |
| talk_over_per_turn | 0.255 (14) | 55 | [0.158, 0.383] |
| no_reply_per_turn | 0.0 (0) | 55 | [0.0, 0.065] |
| missed_barge_in | 0.036 (2) | 55 | [0.01, 0.123] |
| barge_in_ms (median ms) | 725 | 55 | [708, 739] |
| false_barge_in_backchannel | 0.0 (0) | 55 | [0.0, 0.065] |
| false_barge_in_noise | 0.0 (0) | 55 | [0.0, 0.065] |

end of caller speech -> her first audio; includes the fakes fixed 450 ms (brain + voice), not the 250 ms final
