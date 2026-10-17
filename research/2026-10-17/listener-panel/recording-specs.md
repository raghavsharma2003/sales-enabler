# Recording specs: human-reference arm and competitor arm (owner actions)

Panel v2, 2026-10-17. Both arms are **placeholders until the owner records or captures the audio**. The page,
`build_plan.py` and `analysis.py` already handle both arms. When the files arrive:

1. List them in a CSV, one row per take, using `recording-templates/recordings-template.csv`.
2. Run `python3 ingest_external.py that.csv`.
3. Run `python3 build_plan.py --qa-sheet`.
4. Listen-check the new rows (protocol M1).
5. Run `python3 build_plan.py`.
6. Add a dated amendment line to `panel-predictions.md` §7 before the first main-panel listener.

Nothing here has been done. No talent, vendor or platform has been contacted.

## 1. What each arm is for, and what it cannot show

| arm | used in | measures | does not measure |
|---|---|---|---|
| Human reference | Block C (human or computer), Block B cell X (one card per listener), Block A pairs "ours vs human" (2 per listener) | How far our TTS is from a real telecaller reading the same words: naturalness, trust, comprehension (H3: 60+ comprehension non-inferior to human, 10 points), the AUC for telling TTS from a person | A human's conversation skill. The talent reads a script |
| Competitor | Block A pairs "ours vs competitor" (3 per listener, rotating vendors and turns), phone band only | Listeners' preference between our product voice (hi-IN Swara, neural, default pace) and a competitor platform's Hindi voice speaking **the identical line**, including how that platform reads our numbers | Their latency, barge-in, language lock and dialogue. The l4b battery measures those (`../lanes/l4b-measured/runbook/`) |

Without these two arms, the panel compares only our own variants. Brief §6 asks for "our demo rated against
competitors", so the report must say this plainly.

## 2. Human-reference arm: exact recording spec

**Talent**
- Two native Hindi speakers: one woman (persona Asha) and one man (persona Amit). A woman alone is the minimum. The
  design then uses the human clip for the F cards, and the M cards fall back to HD slow automatically.
- Age 25-45.
- Neutral urban Hindi, as spoken in Delhi or Lucknow, without a strong regional marking.
- Prefer someone with at least a year of telecalling or renewal-desk experience: we want a good telecaller, not a radio
  announcer. Professional voice-over artists over-articulate, and that would flatter the human side.
- No family or business relation to the study team.

**Consent** (written, signed, in Hindi and English, before recording). It must say:
- the recordings are used only as stimuli in this listening study;
- they will be played to about 200 anonymous adult listeners;
- they will never be used to train, fine-tune or clone any voice model, or to create a synthetic voice. Azure Personal
  Voice needs its own separate consent and is not part of this;
- they are kept for 12 months after the study ends, then deleted;
- the talent may withdraw any time before fielding starts;
- the fee (estimate: ₹3-5k per talent for about 2 hours).

Talent names never enter the manifest. Use the ids `talentF1` and `talentM1`.

**What to record**
- Script: `recording-templates/human-script-hi.md`, which is generated from the stimulus text file.
- Per talent: R1-R8 and C1-C4, plus the optional R7 safety line (the current plan does not use it).
- Read word for word, numbers included:
  - amounts as a telecaller says them;
  - "4 7 2 9" and "4 3 2 1" digit by digit;
  - dates as "पंद्रह नवंबर".
- Natural phone pace. For reference, our neural default runs 10-13 s per line. Do not try to match it, and do not rush.

**Takes**
- Record 3 takes per line, with 1 s of silence before and after each.
- Choose the first take that is word-exact, fluent and free of clicks or breaths. Mark it `chosen=yes` in the CSV.
- **No editing:** no splicing inside a line, no EQ, compression, de-noising, pitch or time change. Trimming and
  loudness are done by the ingest, identically for every arm.

**Room**
- A small furnished room (curtains, soft furnishing). Fans and AC off, phones in airplane mode.
- Record 5 s of room silence first. Re-record if the noise is audible on playback with earphones at normal volume (aim
  for a noise floor of −60 dBFS or lower).

**Equipment**

| | spec |
|---|---|
| **A, preferred** | Cardioid USB or XLR microphone, 15-20 cm from the mouth, pop filter or 45° off-axis. Any recorder (for example Audacity) at **48 kHz, 24-bit (16-bit acceptable), mono WAV**. Gain set so the loudest syllables peak at −12 to −6 dBFS, never clipping. CSV `capture=studio` |
| **B, fallback** | A recent smartphone's voice recorder, set to WAV or lossless, or the highest m4a quality (≥ 128 kbps). Hold it 20 cm in front of the mouth, never at the ear; airplane mode. CSV `capture=phone-recorder` |
| **Not allowed** | Recording over a phone call. The ingest simulates the phone band identically for human and TTS. A real call adds codec and jitter differences that would confound "human vs TTS" with "real line vs simulated line" |

**File names and delivery**
- Name each take `H_<turn>_<talent>_<take>.wav`, and fill one CSV row per take.
- Run `python3 ingest_external.py recordings.csv`. It needs `VP_AZURE_ENV` for the two-engine ASR check; without it,
  use `--no-asr`, and every clip is then `needs_listen`.

**Optional, later:** a Tamil (F and M) and a Marathi (F and M) talent for the regional Block C. The regional panels'
plans do not use human clips yet.

## 3. Competitor arm: exact capture spec

**Which platforms.** Up to 4, each with a Hindi female voice. In priority order:
1. Sarvam Samvaad;
2. Smallest.ai Atoms;
3. Gnani Inya;
4. one US platform with Hindi voices: ElevenLabs Agents.

**Optional extras:**
- Ringg and Ravan.
- Bolna, only if its default Indian voice is not an Azure voice. Bolna routes to third-party TTS providers, so log
  which one it used.

Sign-ups and builds follow `../lanes/l4b-measured/runbook/owner-runbook.md` Mode B. Build the agent in
`agent-spec.md`, persona Asha.

**Which voice.**
- The platform's default or recommended Hindi female voice, at the default rate.
- Do not tune one vendor more than another.
- Log the TTS provider and the voice id in the CSV `notes`, and in the runbook's `settings-log.csv`.

**Terms of service.**
- Check each platform's terms on evaluation use and on downloading generated audio. If they forbid it, skip that
  vendor and log why.
- The clips are used only inside this blind panel. They are never published, never shown with the brand, and never used
  to build anything (the Azure-only rule).

**Method A: first-message capture (preferred; the same for every vendor)**
1. In the platform, set the agent's **first message** to one line from
   `recording-templates/competitor-first-messages.md` (K_R1 ... K_R8). Paste it exactly, Devanagari and Latin as given.
2. Start the platform's web test call through the l4b harness in owner mode:
   `VP_HEADED=1 VP_PROFILE_DIR=$HOME/.vp-profile VP_VENDOR=<platform> VP_URL='<agent page>' node vp_harness.mjs run manual P1 <platform>-K_R3`.
   - The harness records the agent channel and waits for the greeting before it plays any caller audio.
   - Close the call once the agent has finished the line.
3. Cut the first utterance: `python3 ingest_external.py --first-message <harness>.wav K_R3_<platform>_1.wav`.
4. Take the **first complete capture**, the first one where the agent spoke the whole line.
   - Do not pick the best-sounding of several.
   - If the platform reads a number wrongly or drops words, keep it, because that is the product. Note it.
   - Re-capture only if the call failed or the line was cut off.
5. Use an Indian internet connection (the owner's laptop in India).

**Method B: vendor download (allowed where the platform's voice playground can generate the same text and download
it).**
- Set CSV `capture=vendor-download`.
- It skips the platform's call path. Mixing A and B is allowed, but the method is logged per vendor and the analysis
  reports by vendor.

**Not allowed:**
- recording a phone call with a room microphone;
- re-typing or "fixing" the text for one vendor. The one exception is a romanised line when the platform cannot read
  Devanagari, logged as "romanised input".

**Channel.**
- The harness captures 16 kHz WebRTC (Opus) audio. `build_plan.py` therefore plays competitor pairs on the phone band
  only (300-3,400 Hz), where the bandwidth difference disappears.
- Ingest applies the same trimming and −16 LUFS loudness as our clips.

**Per vendor:** 8 captures (R1-R8). The pairs compare each against our Swara clip of the same line.

## 4. Budget and timing (estimates)

| item | estimate |
|---|---|
| Two Hindi talents, about 2 hours each | ₹6-10k |
| Competitor sign-ups | Free trial credits are usually enough for 8 short test calls per vendor; any paid credit needs the owner's go |
| Owner time | About half a day for talent recording and ingest; about 1-2 hours per vendor for sign-up, build and 8 captures |
| Azure ASR check at ingest | About 40-70 clips × 12 s × 2 engines: under ₹10 |

Both arms can be done in week 1 of the protocol timeline, in parallel with M1 and M7. Neither blocks the pilot.
