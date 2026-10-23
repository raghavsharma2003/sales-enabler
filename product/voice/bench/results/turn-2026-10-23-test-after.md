# Turn-taking bench, 2026-10-23 (0e9b9ee), split test, 55 clips, VAD SileroVAD

params {'HOLD_MS': 0, 'STATEMENT_HOLD_MS': 1200, 'LONG_HOLD_MS': 1400, 'BARGE_MS': 300, 'BARGE_WORDS': 2, 'BARGE_LONG_MS': 700}

| metric | value | n | 95% CI |
|---|---|---|---|
| end_of_turn_ms (median ms) | 998 | 53 | [989, 1079] |
| end_of_turn_statement_ms (median ms) | 1314 | 49 | [1303, 1326] |
| no_reply_statement | 0.0 (0) | 50 | [0.0, 0.071] |
| premature_cut_in_per_turn | 0.036 (2) | 55 | [0.01, 0.123] |
| premature_cut_in_per_pause | 0.013 (2) | 157 | [0.004, 0.045] |
| talk_over_per_turn | 0.036 (2) | 55 | [0.01, 0.123] |
| no_reply_per_turn | 0.0 (0) | 55 | [0.0, 0.065] |
| missed_barge_in | 0.036 (2) | 55 | [0.01, 0.123] |
| barge_in_ms (median ms) | 724 | 55 | [708, 738] |
| false_barge_in_backchannel | 0.0 (0) | 55 | [0.0, 0.065] |
| false_barge_in_noise | 0.0 (0) | 55 | [0.0, 0.065] |

end of caller speech -> her first audio; includes the fakes fixed 450 ms (brain + voice), not the 250 ms final
