# Round-2 listener-panel stimuli (r2-listener-panel, 2026-10-17)

These are the renewal-call stimuli for listener panel v2 (`../../../listener-panel/protocol.md`). **Do not upload this
folder with the page.** `manifest.csv` holds the blinding key. Use `build_plan.py --bundle`, which copies only the audio
the plans use.

| file | what it is |
|---|---|
| `phone/R2_xxxxxx.mp3` | phone-band clip: 300-3,400 Hz, 8 kHz G.711 μ-law round trip, −16 LUFS, 48 kbps mp3 |
| `wideband/R2_xxxxxx.mp3` | wideband clip: 24 kHz, −16 LUFS, 96 kbps mp3 |
| `manifest.csv` | one row per rendered clip (244 rows). Columns: set, turn, register, script, tier, voice, gender, pace, SSML rate, duration, text, gloss, key tokens, both ASR transcripts, per-engine token checks, `qa_auto`, `render_attempts`. 34 rows are `superseded` (kept for provenance; not used by any plan) |
| `manifest-external.csv` | created by `listener-panel/ingest_external.py` when the owner adds human-reference or competitor recordings (X2_ codes) |
| `stimuli-text.json` | all texts, their authors (hand-written Hinglish; gpt-6-sol regional registers), the LLM prompt and raw output, and the manual edits with reasons |
| `calibration.json` | HD rate-matching: R1-R8 at SSML rate 0 in the neural and HD voices, with the median duration ratio. The resulting rates are Meera −25.2%, Arjun −32.0% |
| `qa-attempts.csv` | every render attempt and its automatic QA status, including the first-attempt failures later re-rendered |

Made by `../harness/stimuli_text_round2.py` and `../harness/render_stimuli_round2.py` (`--dry-run`, `--recheck`,
`--requeue-fail`). Keys are read at run time from the env file; none is stored here.

No person has listened to any of these clips. The automatic QA checks key tokens only.
