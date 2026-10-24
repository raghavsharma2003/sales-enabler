# Barge-in from the audio, turn bench DEV split, 2026-10-24 (47 clips, Silero VAD, barge + backchannel)

Staging-like recogniser: partials 850 ms behind speech, final 590 ms after the VAD's end of speech (staging
partialLagMs median 858 ms). Nods: 300 ms "haan", 500 ms "haan ji", 700 ms "achha haan ji" per clip (141), plus a
300 ms noise burst. A false stop = she yielded and never carried on with her own opening (a pause she resumes from is
not a stop). Stop time = caller speech onset to her audio cut at the far end.

| run | BARGE_AUDIO | AUDIO_MS | RESUME_MS | stop time median ms [95% CI] | missed barge-ins | false stops, all nods | of them 700 ms nods | noise | paused on a nod | resume gap median ms |
|---|---|---|---|---|---|---|---|---|---|---|
| words2 | True | 200 | 400 | 735 [725, 750] | 0/47 | 36/141 | 35/47 | 0/47 | 36/141 | None |
| a150 | True | 200 | 400 | 210 [205, 217] | 1/47 | 0/141 | 0/47 | 0/47 | 130/141 | 683 |
| a200b | True | 200 | 400 | 245 [239, 255] | 0/47 | 0/141 | 0/47 | 0/47 | 130/141 | 658 |
| a300b | True | 200 | 400 | 336 [331, 341] | 0/47 | 0/141 | 0/47 | 0/47 | 130/141 | 561 |
| a200_r250 | True | 200 | 400 | 244 [242, 251] | 9/47 | 0/141 | 0/47 | 0/47 | 130/141 | 494 |

Notes: a150 and a200_r250 were scored before the fix that counts a resume only when it is her opening's own audio
(their false-stop column may count a new reply as a resume; their stop times and missed counts are unaffected).
RESUME_MS 250 resumes over real interruptions (9/47 missed), so 400 stays. Chosen: BARGE_AUDIO on, 200 ms (stop
~245 ms, target < 400) with RESUME_MS 400. The cost: she pauses on most nods and carries on after ~0.66 s.
