# Barge-in sweep, turn bench DEV split, 2026-10-23 (47 clips, Silero VAD, barge + backchannel scenarios only)

Fakes as in bench/turn_bench.py; `partial_ms` = how late the fake recogniser's partial carries each word. False
barge-ins are counts out of 47 (300 ms "haan", 500 ms "haan ji", 700 ms "achha haan ji", 300 ms noise).

| run | BARGE_MS | WORDS | LONG_MS | NOD | partial_ms | barge-in median ms [95% CI] | missed | haan 300 | nod 500 | nod 700 | noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A_nodoff | 300 | 2 | 700 | 0 | 300 | 733 [728, 747] | 0/47 | 0 | 37 | 44 | 0 |
| B_nod | 300 | 2 | 700 | True | 300 | 742 [728, 748] | 1/47 | 0 | 0 | 0 | 0 |
| C_w1 | 300 | 1 | 700 | True | 300 | 720 [703, 746] | 1/47 | 0 | 0 | 0 | 0 |
| D_w1_b200 | 200 | 1 | 700 | True | 300 | 723 [706, 739] | 1/47 | 0 | 0 | 0 | 0 |
| E_p500 | 300 | 1 | 500 | True | 500 | 532 [524, 542] | 0/47 | 1 | 32 | 40 | 0 |
| E_w1_l500 | 300 | 1 | 500 | True | 300 | 538 [534, 546] | 1/47 | 0 | 0 | 0 | 0 |
| F_w1_b200_l500 | 200 | 1 | 500 | True | 300 | 533 [526, 542] | 1/47 | 0 | 0 | 0 | 0 |
| G_l400 | 300 | 2 | 400 | True | 300 | 440 [431, 446] | 0/47 | 23 | 42 | 45 | 0 |
| H_l400_p500 | 300 | 2 | 400 | True | 500 | 441 [433, 448] | 0/47 | 22 | 43 | 45 | 0 |

Reading: nods counted as words (A) stop her on most 500/700 ms nods. Nod-aware (B-F) stops none at a 300 ms partial
lag. Barge-in time is set by BARGE_LONG_MS, not the word rule, because words arrive late: 700 -> ~730 ms, 500 ->
~535 ms. 500 is safe only while the partial lag stays near 300 ms (E_p500: at 500 ms lag, 32/47 and 40/47 nods stop
her); 400 is not safe even at 300 ms (G). Default kept at 700; VP_BARGE_LONG_MS lets staging try 500 once the
runtime's own partialLagMs (call timing summary) is known.
