# Turn-taking bench, 2026-10-24 (251746b), split test, 55 clips, VAD SileroVAD

params {'HOLD_MS': 0, 'STATEMENT_HOLD_MS': 1200, 'LONG_HOLD_MS': 1400, 'BARGE_MS': 300, 'BARGE_WORDS': 2, 'BARGE_LONG_MS': 700, 'BARGE_NOD': True, 'BARGE_NOD_LONG_MS': 1500, 'BARGE_AUDIO': True, 'BARGE_AUDIO_MS': 200, 'RESUME_MS': 400, 'BARGE_PAUSED_MS': 900, 'SPECULATE_STABLE_MS': 400, 'partial_ms': 850, 'final_ms': 590, 'env': {}}

| metric | value | n | 95% CI |
|---|---|---|---|
| missed_barge_in | 0.091 (5) | 55 | [0.039, 0.196] |
| barge_in_ms (median ms) | 256 | 55 | [250, 268] |
| false_barge_in_backchannel | 0.0 (0) | 55 | [0.0, 0.065] |
| false_barge_in_noise | 0.0 (0) | 55 | [0.0, 0.065] |
| paused_on_nod_any | 0.836 (138) | 165 | [0.772, 0.885] |
| nod_resume_gap_ms (median ms) | 644 | 138 | [592, 684] |
| false_barge_in_nod_any | 0.0 (0) | 165 | [0.0, 0.023] |
| false_barge_in_nod_500ms | 0.0 (0) | 55 | [0.0, 0.065] |
| false_barge_in_nod_700ms | 0.0 (0) | 55 | [0.0, 0.065] |

end of caller speech -> her first audio; includes the fakes fixed 450 ms (brain + voice), not the 590 ms final
