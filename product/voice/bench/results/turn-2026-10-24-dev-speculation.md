# Speculation on the caller's partial, turn bench DEV split, 2026-10-24 (47 clips, Silero VAD, turn + statement)

Partial lag = how late the fake recogniser's partial carries each word; final = how long after the VAD's end of
speech its final arrives. Staging measured partialLagMs median 858 ms and the final at ~590 ms
(research/2026-10-24/staging/reply-gap.md), so the 850 / 590 rows are the staging-like ones.

| run | partial lag / final ms | speculation | end of turn after questions, median ms [95% CI] | after statements | premature cut-ins | talk-over | kept / settled | starts per turn |
|---|---|---|---|---|---|---|---|---|
| off | 850 / 590 | off | 1328 [1319, 1338] | 1318 | 1/47 | 1/47 | - | 0 |
| s0 | 850 / 590 | on, settle 0 | 1328 [1316, 1337] | 1330 | 1/47 | 1/47 | 4/77 | 1.63 |
| s400 | 850 / 590 | on, settle 400 | 1328 [1318, 1332] | 1325 | 1/47 | 1/47 | 4/77 | 1.33 |
| s800 | 850 / 590 | on, settle 800 | 1324 [1317, 1336] | 1322 | 1/47 | 1/47 | 4/41 | 0.6 |
| off_fast | 300 / 250 | off | 991 [981, 1000] | 1312 | 1/47 | 1/47 | - | 0 |
| s0_fast | 300 / 250 | on, settle 0 | 986 [978, 997] | 1308 | 1/47 | 1/47 | 16/126 | 2.26 |
| s400_fast | 300 / 250 | on, settle 400 | 986 [980, 997] | 1308 | 1/47 | 1/47 | 18/116 | 1.77 |

Reading: with partials that trail speech, speculation saves nothing at end of turn (within 5 ms, inside the CIs) and
its replies are kept 5-16% of the time; waiting for the partial to settle (400 / 800 ms) cuts the starts per turn but
not the waste ratio enough to matter. Staging kept 2 of ~23. The earlier 998 -> 750 ms TEST gain (2026-10-23) was with
partials carrying every word at once (partial lag 0), which no measured recogniser does. So SPECULATE_PARTIAL is now
off by default on every provider; VP_SPECULATE_PARTIAL=1 keeps it for a recogniser that keeps up. Cut-ins and
talk-over are the same in every arm. Note: the barge-in code changed while these arms ran; turn and statement
scenarios do not talk over her, so their numbers are not affected.
