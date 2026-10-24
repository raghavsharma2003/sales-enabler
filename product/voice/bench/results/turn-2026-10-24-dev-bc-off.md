# Turn-taking bench, 2026-10-24 (a8e5853), split dev, 47 clips, VAD SileroVAD

params {'HOLD_MS': 0, 'STATEMENT_HOLD_MS': 1200, 'LONG_HOLD_MS': 1400, 'BARGE_MS': 300, 'BARGE_WORDS': 2, 'BARGE_LONG_MS': 700, 'BARGE_NOD': True, 'BARGE_NOD_LONG_MS': 1500, 'BARGE_AUDIO': True, 'BARGE_AUDIO_MS': 200, 'RESUME_MS': 400, 'BARGE_PAUSED_MS': 900, 'SPECULATE_STABLE_MS': 400, 'BACKCHANNEL': 0, 'BC_TURN_MS': 4000, 'BC_PAUSE_MS': 350, 'BC_PAUSE_MAX_MS': 700, 'BC_GAP_MS': 8000, 'partial_ms': 300, 'final_ms': 250, 'env': {}}

| metric | value | n | 95% CI |
|---|---|---|---|
| end_of_turn_ms (median ms) | 998 | 46 | [988, 1002] |
| end_of_turn_statement_ms (median ms) | 1304 | 40 | [1294, 1322] |
| no_reply_statement | 0.0 (0) | 40 | [-0.0, 0.088] |
| premature_cut_in_per_turn | 0.021 (1) | 47 | [0.004, 0.111] |
| premature_cut_in_per_pause | 0.007 (1) | 149 | [0.001, 0.037] |
| talk_over_per_turn | 0.021 (1) | 47 | [0.004, 0.111] |
| no_reply_per_turn | 0.0 (0) | 47 | [0.0, 0.076] |
| backchannel_turns_long | 0.0 (0) | 47 | [0.0, 0.076] |
| speculation_started_per_turn (mean) | 0 | 87 | |

end of caller speech -> her first audio; includes the fakes fixed 450 ms (brain + voice), not the 250 ms final
