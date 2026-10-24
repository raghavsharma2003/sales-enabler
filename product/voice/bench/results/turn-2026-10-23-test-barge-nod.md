# Turn-taking bench, 2026-10-24 (72c28c0), split test, 55 clips, VAD SileroVAD

params {'HOLD_MS': 0, 'STATEMENT_HOLD_MS': 1200, 'LONG_HOLD_MS': 1400, 'BARGE_MS': 300, 'BARGE_WORDS': 2, 'BARGE_LONG_MS': 700, 'BARGE_NOD': True, 'BARGE_NOD_LONG_MS': 1500, 'partial_ms': 300}

| metric | value | n | 95% CI |
|---|---|---|---|
| missed_barge_in | 0.073 (4) | 55 | [0.029, 0.173] |
| barge_in_ms (median ms) | 748 | 55 | [738, 771] |
| false_barge_in_backchannel | 0.0 (0) | 55 | [0.0, 0.065] |
| false_barge_in_noise | 0.0 (0) | 55 | [0.0, 0.065] |
| false_barge_in_nod_500ms | 0.0 (0) | 55 | [0.0, 0.065] |
| false_barge_in_nod_700ms | 0.0 (0) | 55 | [0.0, 0.065] |

end of caller speech -> her first audio; includes the fakes fixed 450 ms (brain + voice), not the 250 ms final
