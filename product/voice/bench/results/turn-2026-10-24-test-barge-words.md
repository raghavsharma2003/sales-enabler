# Turn-taking bench, 2026-10-24 (251746b), split test, 55 clips, VAD SileroVAD

params {'HOLD_MS': 0, 'STATEMENT_HOLD_MS': 1200, 'LONG_HOLD_MS': 1400, 'BARGE_MS': 300, 'BARGE_WORDS': 2, 'BARGE_LONG_MS': 700, 'BARGE_NOD': True, 'BARGE_NOD_LONG_MS': 1500, 'BARGE_AUDIO': True, 'BARGE_AUDIO_MS': 200, 'RESUME_MS': 400, 'BARGE_PAUSED_MS': 900, 'SPECULATE_STABLE_MS': 400, 'partial_ms': 850, 'final_ms': 590, 'env': {'VP_BARGE_AUDIO': '0'}}

| metric | value | n | 95% CI |
|---|---|---|---|
| missed_barge_in | 0.073 (4) | 55 | [0.029, 0.173] |
| barge_in_ms (median ms) | 735 | 55 | [728, 750] |
| false_barge_in_backchannel | 0.0 (0) | 55 | [0.0, 0.065] |
| false_barge_in_noise | 0.0 (0) | 55 | [0.0, 0.065] |
| paused_on_nod_any | 0.206 (34) | 165 | [0.151, 0.274] |
| false_barge_in_nod_any | 0.206 (34) | 165 | [0.151, 0.274] |
| false_barge_in_nod_500ms | 0.055 (3) | 55 | [0.019, 0.149] |
| false_barge_in_nod_700ms | 0.564 (31) | 55 | [0.433, 0.686] |

end of caller speech -> her first audio; includes the fakes fixed 450 ms (brain + voice), not the 590 ms final
