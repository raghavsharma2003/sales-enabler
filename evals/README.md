# Voice evaluation corpus

scenarios.json contains repeatable test cases, not test results. Test each candidate on the same microphone, network region, language pair, customer context and tool fixtures. Record provider/model/config versions and consented test recordings separately from this public repository.

Measure time from real customer turn completion to first audible assistant response (median and p95); interruption-to-silence; false interruptions; transcription of names/numbers; corrected-fact use; source accuracy; task completion; inappropriate disclosure; human takeover; and full session cost. Evaluate human-rated naturalness and helpfulness blind to vendor where practical. Keep task correctness and privacy gates separate from subjective voice scores.

At least three repetitions per scenario are useful for debugging, but are not sufficient for broad superiority claims. Agree on a representative corpus and meaningful sample size before publishing comparisons. Benchmarks must show failure counts and configuration, not only a combined score.

No live-provider evaluation has been run as part of this repository's initial implementation. Unit tests cover deterministic adapter and application boundaries only.
