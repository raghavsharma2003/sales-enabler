# Turn-taking bench, 2026-10-23 (72c28c0), split test, 55 clips, VAD SileroVAD

params {'HOLD_MS': 0, 'STATEMENT_HOLD_MS': 1200, 'LONG_HOLD_MS': 1400, 'BARGE_MS': 300, 'BARGE_WORDS': 2, 'BARGE_LONG_MS': 700, 'BARGE_NOD': True, 'BARGE_NOD_LONG_MS': 1500, 'partial_ms': 0}

| metric | value | n | 95% CI |
|---|---|---|---|
| end_of_turn_ms (median ms) | 750 | 53 | [740, 813] |
| end_of_turn_statement_ms (median ms) | 1308 | 49 | [1306, 1324] |
| no_reply_statement | 0.0 (0) | 50 | [0.0, 0.071] |
| premature_cut_in_per_turn | 0.036 (2) | 55 | [0.01, 0.123] |
| premature_cut_in_per_pause | 0.013 (2) | 157 | [0.004, 0.045] |
| talk_over_per_turn | 0.036 (2) | 55 | [0.01, 0.123] |
| no_reply_per_turn | 0.0 (0) | 55 | [0.0, 0.065] |
| missed_barge_in | 0.036 (2) | 55 | [0.01, 0.123] |
| barge_in_ms (median ms) | 728 | 55 | [722, 747] |
| false_barge_in_backchannel | 0.0 (0) | 55 | [0.0, 0.065] |
| false_barge_in_noise | 0.0 (0) | 55 | [0.0, 0.065] |
| false_barge_in_nod_500ms | 0.0 (0) | 55 | [0.0, 0.065] |
| false_barge_in_nod_700ms | 0.0 (0) | 55 | [0.0, 0.065] |

end of caller speech -> her first audio; includes the fakes fixed 450 ms (brain + voice), not the 250 ms final
