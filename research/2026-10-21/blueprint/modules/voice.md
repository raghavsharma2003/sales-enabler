# Module: Agent brain and human voice (id: voice)

**Owns the call:** brief and `compile()`, ledger, brain, ears, voice, turn-taking, the reply door, how she ends, the run manifest. **Status:** proposed 2026-10-21, for owner review.

**Grades:** [M] measured by us (n, method) · [C] computed · [O] observed · [V] vendor-claimed · [I] inferred · [U] unknown.

**Short paths** (under /home/user/sales-enabler): **PV2** `voicelab/server/persona_v2.py` · **CALLS** `voicelab/server/calls.py` · **L8R2** `research/2026-10-17/lanes/l8-azure-bench/round2/findings.md` · **LAB2** `research/2026-10-20/voicelab/round1-review-and-v2.md` · **L4B** `research/2026-10-17/lanes/l4b-measured/report.md` · **SR2** `research/2026-10-17/lanes/l4b-measured/round2/findings.md` (Sarvam demo) · **G5** `research/2026-10-18/lanes/g5-gemini-paid/findings.md` · **ECO** `research/2026-10-18/SYNTHESIS.md` · **TXV** `docs/harvest/tx-voice.md` · **HPM** `docs/harvest/hp-main.md` · **HV** `docs/harvest/SYNTHESIS.md` (laws) · **WT** `research/2026-10-21/walkthroughs/SYNTHESIS.md` · **TS** `research/2026-10-20/teardown/SYNTHESIS.md` · **BAP** `research/2026-10-20/account-phase/bolna/report.md` · **SCH** `research/2026-10-20/account-phase/synthesis/vp-v1-schema.json` · **L5** `research/2026-10-17/lanes/l5-human-dialect/report.md` · **DEF** `data/blueprint/voice-module-defaults.json` (every default value, machine-readable).

---

## 0. The answer in one screen

1. **Architecture:** a **gated cascade** (echo-safe ears → turn manager → brain → number-safe clause splitter → **one reply door** → voice). Every word passes code predicates before it is heard (HV law 25). Speech-to-speech is a *Premium Live* preset only after a 200+ turn violation battery: Gemini 3.8 Live talked over callers on 20/51 non-pause turns [M, G5].
2. **The brief is configuration, not a prompt:** brief v2 generalised to per-agent fields, one `compile()`, script and identity first, ledger and counts last, a recitable-line lint and a byte budget that throws.
3. **Turn-taking is the binding problem** (every VP stack cuts in on 15-42% of turns [M, L8R2]): a pause-aware release policy using Hindi's verb-final grammar, Hinglish lexicons that never discard "haan, nahi, ruko, bas", an echo-safe front end, three presets, and a panel in ms with a **predicted reply gap** (0 of 6 competitors show one [O, WT]).
4. **Speed:** the opening rendered during the ring, an acknowledgement bank in her own voice, region pinning (gpt-4.1-mini South India first token 304 ms, n=33 [M]), warm pools, a cached core, and speculative *compute* that never speculates *the floor*.
5. **Expression is read in code and delivered by the voice:** person-reading sets rate, style and warmth; no stage direction is ever spoken; warmth drops on complaints and collections.
6. **Honest limit:** the owner's preferred Gemini-voice stack measured 1.6-2.2 s server-side [M smoke, LAB2] against a 1.2 s bar. The panel shows that trade; the default waits for round-2 ratings and a handset battery; MAI-Voice (first audio 425 ms [M n=5]) stays ready as the second path.

---

## 1. The benchmark: best competitor per sub-area, and where each falls short

| Sub-area | Best competitor, its best version | Where it falls short | Evidence |
|---|---|---|---|
| Voice and expressiveness | **ElevenLabs**: Expressive mode, 10 audio tags, pronunciation dictionaries | English library voices; no Hinglish row; American default voice accepted on a Hindi agent | [O] account-phase/elevenlabs/report.md s7; WT |
| Indian voice catalogue | **Sarvam**: 199 job-tagged voices, Indic number reading, mid-call language switch | No emotion control; companion and "Therapist" voices; missed 25,000 → 24,500 correction 2/2 | [O/M] teardown/sarvam/report.md; SR2 |
| Reply gap | **Ultravox** demo p50 1.54 s (n=52, US vantage) | India-hosted incumbents unmeasured at a handset; Sarvam demo 3.1 s, Bolna holds about 1.4 s [I], Vapi 2.32 s, ElevenLabs 3.75 s | [M] L4B; SR2; BAP s1.2 |
| Not talking over | **ElevenLabs**: 3% collisions | p50 3.75 s; "haan" answered "Are you still there?" 4/16 | [M] L4B |
| Barge-in | **Ultravox** 6/6, stops in 0.32-0.59 s; **Bolna** code: heard-text history, merge with 0.7 s settle, duplicate block | Ultravox looped its greeting in babble; Bolna discards 1-word finals not on an English list, holds 500 + 900 ms, drops speech during the welcome | [M] L4B; [O] BAP s1.3, s5 |
| Turn-taking controls | **Vapi** ranges; **ElevenLabs** explains each setting | No predicted gap anywhere; 0/6 Hindi lists; Vapi smart endpointing English-only | [O] WT s3 |
| Language hold | **Sarvam** Hindi 38/40, Tamil 20/20 | Cut into the elderly pause 2/2; silent under babble 2/2 | [M] SR2 |
| AI disclosure | **Retell** "AI Disclosure When Asked" preset | Dashboard agents only; non-removable nowhere; Sarvam's demo claimed human 6/6 | [O] account-phase/retell/report.md; [M] SR2 |
| Brief authoring | **Sarvam** template ("under 25 words, one question"); **Bolna** canvas with token counter; **Retell** nodes "skippable if answered" | Sentence-shaped samples, no lint, no position rules, no state; round-1 stacks restated the AI line on 21% of turns | [O] WT; [M] LAB2 |
| Live control and tests | **Retell** inject context, take over; **Vapi** simulations with latency assertions | Models grade themselves; no Hinglish personas with pauses or elderly pace | [O] dossiers |
| Ending, voicemail | **Bolna** bounded defaults (20 s silence, 90 s max), "haan bolo" = human | 90 s cuts real calls; voicemail waits 7+ words up to 30 s, billed; English check-in on a Hindi agent; Retell holds 1 h | [O] BAP; WT s3 |
| Speech-to-speech | **Vapi** GPT-Live, **Retell** gpt-realtime, **Bolna** Realtime beta | None gates words before they are heard | [O]; HV law 25 |

**Read:** nobody owns the Hinglish phone call. The best voice (ElevenLabs) is slow and English-tuned; the best Indic hold (Sarvam) is slow, cuts into pauses and claimed to be human on its demo 6/6; the best barge-in code (Bolna) discards the Hindi words that matter most. VP's stacks are not yet better on cut-ins, so every "better" below is a pass/kill bar (W3-W5, TS s7).

---

## 2. VP's design

### 2.1 The call engine (architecture)

```
carrier leg (India media region) -> echo-safe front end (reference AEC against our own outbound stream)
 -> VAD (Silero v5, server) + streaming ears (code-mixed)  -> TURN MANAGER (floor: release, hold, withdraw, barge, backchannel)
 -> BRAIN (compiled core + per-turn ledger tail, effort none, pinned region)
 -> clause splitter (number- and time-safe, one clause lookahead)
 -> REPLY DOOR (predicates R1-R11)  -> VOICE (style map, rate, warm socket)  -> playback clock -> stereo recorder
 every step writes the per-turn trace; the call carries a run manifest
```

- **Runtime:** port the Python lab as a separate realtime voice service, with the control plane in TypeScript (spine s11.5, proposed). Split CALLS along its seams (Call base, Reply, CascadeCall, S2S bridges) and lift the adapters, combination identity, Plivo leg, cost meter, recorder and playback-clock heard-text.
- **Echo-safe front end:** the outbound TTS stream is the reference channel for a reference AEC. Taxila's ear-only front end measured 0/66 echo false barge-ins, 12/12 true barge-ins, 0/46 continuer false yields [M, TXV s6.2]; the lab only tightened VAD while she spoke, which also raises the bar for real barge-ins [I].
- **Premium Live (gated S2S):** the transcript arrived with or before audio on 1,041/1,041 turns [M, `measure.2026-10-18.gemini-live-gate-lag`], so a text gate is possible. It ships only when a 200+ attack-turn battery shows 0 ungated violations heard, talk-over is 5% or less, and ear ratings beat the best cascade beyond noise. The picker shows its price rising with length: INR 3.3 at 1 min, 5.7 at 3, 9-12.7 at 10 [M, ECO]. Gemini 3.1 Live (round-1 winner, 7.0) dies 2026-11-17 and is not offered.
- **Production failover (proposed, spine s8):** health check before dialling; the whole call goes to a healthy *declared* stack; mid-call only a pre-declared same-voice fallback written into the manifest, else one polite close and a callback. Tests never fall back (`decision.2026-10-20.no-midcall-swaps`).

### 2.2 Stacks: curated presets plus an expert picker (req-52, req-53, req-54)

| Preset | Candidate stack (pending round 2) | What we know | Risk |
|---|---|---|---|
| **Natural** | gated Gemini ears + fast brain (Gemini 3.5 Flash-Lite / GPT-5.4 mini / gpt-4.1-mini South India) + Gemini 3.8 Flash-Lite TTS, direct stream | Owner's leaning; Gemini-voice family rated highest in round 1 (3.1 Live 7.0, cascades 5.5-6.0, n=1-4); server gap 1.6-2.2 s [M smoke] | Google access, Tier-1 cap of 100 TTS requests a day [M], price doubles 2027-01-01 |
| **Fast** | Azure STT Central India + gpt-4.1-mini South India + MAI-Voice-2.1-Flash (13-18 hi-IN styles) | MAI first audio 425 ms [M n=5]; cascade A p50 1,004 ms with a neural voice [M n=60] | Azure-voice family rated 1.5-4.5 in round 1; MAI unrated on v2 |
| **Indic** | Sarvam Saaras v4 + sarvam-105b + Bulbul v4 Flash | 0.97-1.18 s, INR 1.39-1.51/min [M n=9]; rated 6.0 with gpt-oss [M n=2] | Trains on data unless opted out; competitor dependency |
| **Premium Live** | Gemini 3.8 Live, text-gated | p50 1.0 s; talk-over 42% [M] | Not offered until the gate passes |

- **Expert picker:** every ears, brain and voice row shows India p50/p90 with n and date, INR per minute, languages verified, a 10-second Hinglish sample, the ear rating with n and a number-reading pass rate; missing data reads "not measured", never zero (HV law 21). Vapi's per-row pattern, made honest (`decision.2026-10-21.wt-synthesis-stack-picker-all-in`).
- **Validation (422):** a voice not verified for the agent's language, or whose gender mismatches her verb forms, is refused; sound tags are off on voices that would speak them. ElevenLabs accepted an American voice on a Hindi agent [O].
- **Run manifest on every call:** dated model ids and regions; brief hash; ledger-pack, lexicon and door versions; turn values; voice and style map; carrier and media region; the declared fallback. A changed preset becomes a custom combination (`decision.2026-10-20.combo-identity`; req-49).

### 2.3 The Brief: from four scenarios to per-agent configuration

**What the client sees:** cards, not a prompt, all drafted by the Brief writer from the conversation: *Who she is* (name, company, warmth/humour/pace sliders), *Why she is calling* (goal, outcome), *The one useful thing*, *Agenda* (must, nice, never), *Facts* (key:value rows from the Offering and contact columns), *Languages*, and *What she tracks* (the ledger pack).

**What `compile()` builds** (fixed order, DEF `brief_schema`): 1 SCRIPT (Devanagari, digits, her verb forms) · 2 IDENTITY (locked AI line, no invented life) · 3 GOVERNOR (nothing is a line; said is spent) · 4 MEDIUM (phone, STT noise, Hinglish register, आप with plural verbs) · 5 SOUNDS (tag-safe voices only) · 6 CORE (react first, view before question, read the person, she ends the call) · 7 SITUATION_GOAL · 8 OPENING (value-first) · 9 SAFETY (backup only) · 10 MEMORY_BRIEF and 11 FACTS_ROWS (delimited data) · 12 DELIVERY (style-capable voices) · **tail, every turn:** LEDGER, then COUNTS_AND_GOAL_CHECK, always last.

**Rules:**
- **Byte-stable core** (sections 1-9) per Version, sent first so caches hit; volatile data after it; the tail last (HV law 6).
- **Budget throws.** Core cap 12,000 bytes and tail cap 1,900 bytes, counted in UTF-8 per section.
  - The lab's renewal brief compiles to 7,345 + 869 bytes [C, computed 2026-10-21 from PV2].
  - An over-cap section blocks publish and names itself; nothing is ever sliced (HV law 4).
- **Recitable-line lint** (DEF `lint_rules`): blocks publish on quoted or first-person lines in shape fields, bracketed directions, numbers in prose, must-fire rules outside the tail, and any text that weakens disclosure, crisis or no-OTP; warns on empathy labels and more than 3 question-asking instructions. Basis: quotes recited 4/5 → 0 after removal; 0/8 vs 8/8 by position [M, HV laws 1-2].
- **Ledger pack** (generalises PV2's per-scenario regexes): at publish the Brief writer derives told-patterns per fact row, offer-patterns per next step and the canonical number set; the Test pilot checks each against labelled synthetic turns (precision 0.95, recall 0.9, else publish blocks); the client approves it as **"What she tracks"**. At runtime it is a pure function with no model on the turn path (HV law 9).
- **Opening shape** (req-04, req-47): turn 1 only checks the name; turn 2, in one breath: her name, the company, "AI assistant" in passing, the one useful fact, why she is calling; then she stops. Disclosure is never the first words and never repeated unprompted (owner 10-20: leading with "I am an AI agent" makes people hang up).
- **Carried over as measured** [M text bench, LAB2]: words per turn 33.7 → 20.9; question endings 62-76% → 13-29%; stock phrases 1.8-2.7 → 0.7-0 per call; abrupt hang-ups 17-40% → 0. Reversal (`decision.2026-10-20.brief-v2-ledger`): round-2 ratings not above round 1, or the ledger drives repetition.
- **A stronger second brain off the critical path** (v2 experiment, req-08): a strong model (Gemini 3.8 Flash, judged best 65/75 but 2.0 s first token [M]) reads each caller turn behind the live brain and writes at most 3 lint-checked telegraphic rows into the next turn's tail; late rows are dropped. Taxila's raced note changed end-to-end by -64 ms, CI spanning 0 [M, TXV]. Quality unmeasured: ships only if blind pairwise and human ratings beat one brain.

### 2.4 Turn-taking: the turn manager (DEF `turn_presets`, `lexicons`)

**Release policy (pause-aware), replacing the lab's binary 1.4 s hold:**
1. Wait for the final of the caller's latest speech segment, or 1.2 s of silence (CALLS).
2. Score the turn **complete / unsure / incomplete**. Hindi is verb-final: an ending on है/था/गा/दीजिए reads complete; on का/की/को/में/से/और/कि/मतलब, a trailing comma or an ellipsis reads incomplete [I, to be measured]; English and Hinglish continuation words come from CALLS.
3. Hold (Standard / Patient / Brisk): complete 0 ms; unsure 600 / 1,200 / 400 ms; incomplete 1,400 / 2,600 / 1,000 ms.
4. **Fast path:** after her yes/no question or offer, a one-token answer ("haan", "nahi", "ji") releases at once.
5. **Withdraw:** a released, not-yet-audible reply is cancelled if the caller speaks 250 ms or more; the turns merge.

**Speech while she talks: never discard, always classify.**
- *Acknowledgement* (हाँ, जी, हम्म, अच्छा, ok): she continues; logged as a backchannel.
- *Stop* (रुको, एक मिनट, बस, सुनिए, hello, wait): she yields at once on 1 word and 200 ms.
- *Answer or objection* (नहीं, मत, गलत, बाद में, already, wrong number): she finishes at most the current clause, yields, and treats it as the answer.
- *"ठीक है"*: an acknowledgement while she explains, an answer when her clause is a question or offer.
- Other speech barges in at 300 ms with 2+ words, or 700 ms; audio flushes and history keeps only what was heard (HV law 28). Stop target p50 300 ms, bar 600 ms (W4; Ultravox 0.32-0.59 s [M]).
- This beats Bolna, which drops these words [O], and Voice Live, which stopped on 23/36 Hindi continuers [M, TXV].
- **Listen during the opening:** the opening is interruptible and transcribed; Bolna drops that speech [O].

**Gaps the lab left open:**
- **Quiet-reply rescue.** The elderly "हम्म" (0.45 s) produced 0 transcripts on every stack [M, L8R2]. A 200-700 ms VAD segment with no final within 900 ms after her question triggers a gated "जी?" from the acknowledgement bank, never two turns running.
- **Her own backchannels** never overlap the caller (an echo hold reads as end of turn [M, HPM]); she acknowledges *in the gap*, about 420 ms after a long caller turn, only when the predicted gap exceeds 900 ms, in her own timbre (a foreign "mm" was rejected by ear [M, HPM]).
- **Silence ladder:** a short nudge in the caller's language (never "are you still there"), then an offer of a better time, then one warm close with a callback scheduled. Max call 8 min by default (1-20, INR shown): between Bolna's 90 s and Retell's 1 h.

| Preset | Segmentation | Hold unsure / incomplete | Barge-in | Rate | Silence ladder | Suggested when |
|---|---|---|---|---|---|---|
| Standard | 500 ms | 600 / 1,400 ms | 300 ms + 2 words, or 700 ms | 1.0 | 6 / 12 / 17 s | default |
| **Patient** | 800 ms | 1,200 / 2,600 ms; gated "हाँ जी" at 2.0 s of speech with no final | 400 ms | 0.92 | 9 / 18 / 25 s | slow pace in-call, or memory (v2) |
| Brisk | 500 ms | 400 / 1,000 ms | 250 ms | 1.05 | 5 / 10 / 14 s | ledger reads "in a hurry" |

Patient's bar: the 2.4 s mid-sentence pause is not cut on 10+ of 12 battery turns; every VP stack cut it 12/12 [M, L8R2]. All values are starting points; the battery sets the shipped ones.

**Predicted reply gap** = ears final lag + expected hold + brain first token + first clause + voice first audio + leading silence + phone leg (250-450 ms, grade I until the handset battery), shown beside the measured India p50 with n and date; it must land within 150 ms of measurement. **Worked example, Natural** [C from M parts]: Gemini ears 456 + hold 150 + gpt-4.1-mini South India 304 + clause 80 + Gemini Flash-Lite TTS 624 + leading silence 250 ≈ **1.86 s server**, ≈ 2.2 s at the handset. With silence trim, speculative compute and the fast path, about 1.2-1.4 s server and 1.6 s handset [C]. **The panel says it plainly:** the voice the owner prefers costs about 0.5 s against the bar today.

### 2.5 Speed: every lever, with its number

| Lever | Effect | Evidence |
|---|---|---|
| **Opening rendered during the ring** (name check and the second-breath intro generated from contact data, gated, rendered before "haan, boliye"; discarded if they say something else) | First line at about 0 ms wait | [I] |
| **Acknowledgement-first rendering:** if the brain's first clause is जी / हाँ / अच्छा, her cached clip plays while the next clause renders | First sound about 0.6 s earlier on Gemini voices [C]; **reply gap is still measured to the first content word** | Taxila continuer: -1.2 s perceived p50 [M n=27-30, TXV] |
| Region pinning, effort none | gpt-4.1-mini South India 304 ms, about 2x faster than Global; effort none about 1 s faster p50 at equal quality | [M] L8R2 s3.1; HV law 8 |
| Warm pools; Gemini leading-silence trim; direct streams only | Azure opening clause 19-29 ms; cold Bulbul 4.3 s; trim saves 0.14-0.36 s; OpenRouter TTS 2.1 s, Interactions API 4.7-5.1 s avoided | [M] L8R2; SR2; G5 |
| **Speculate compute, never the floor:** brain starts on a stable partial; release only via the turn manager and only if the final equals the partial with no negation or number change | Up to -224 ms (E − A, measured with early release); the saving without early release is unmeasured [I], and E's 50% cut-ins are avoided | [M] L8R2; `rejected.2026-10-17.speculative-release` (3/58, 4/4) |
| Quota per call: reserve 25k TPM; the dialer admits a call only with headroom | 429 on 13/35 turns at 50k TPM; 6/12 Gemini calls went silent at a daily cap | [M] L8R2; LAB2 |
| Number- and time-safe splitter | Never splits "18,450", "3:30", "1 लाख 50 हज़ार" | [M] L8R2 gate false positives |

### 2.6 Expression: reading the person and sounding like it (req-01, req-05, req-07, req-09)

- **Reading the person, in code** (DEF `person_reading`): lexical cues (PV2 CUES), speech rate from STT word timings, loudness against the call's own baseline, turn length, answer latency, overlaps. States change delivery: *hurried* → compress, rate 1.05, Brisk; *irritated* → straight answer first, goal waits, humour and tags off; *worried* → rate 0.92, soft style, up to three concrete sentences; *chatty* → two easy sentences, then a bridge; *confused* → one fact at a time; *slow-paced* → Patient. States are checked against synthetic callers with hidden keys; no model grades itself.
- **Tone notes, never spoken:** a leading `[tone: ...]` is stripped by the door and mapped to MAI-Voice styles (13-18 hi-IN emotions) or a Gemini style *field*; the spoken text prefix is rejected (`rejected.2026-10-20.gemini-tts-style-prefix`).
- **Sound tags** (`<laugh>`, `<chuckle>`, `<sigh>`, `<breath>`) only on Gemini 3.8 TTS, which does not speak them [M n=6]; one per reply at most; no laugh within 3 turns of the last.
- **Rate control** (the lab had none: "speak faster" did nothing [M, LAB2]): normalised per voice from measured wpm (MAI 137-155, hi-IN neural 117-124, DragonHD 164-195); slider 0.85-1.15; "thoda slow bolo" in chat becomes a -10% diff card.
- **Register, learnt from Maya (req-09):** about 20.5 words per turn [M, HV]; the caller's own mix with English for domain words; no textbook Hindi (कृपया, अवगत); आप with plural verbs; texture used lightly.
- **Warmth fence:** complaint and collections calls run low-warm with no humour and no tags; anthropomorphism lowers satisfaction for angry callers (Crolic, third-party [M], L5).
- **Competence is the warmth:** numbers come from data, and each voice passes a per-locale number regression (one voice misread ₹1,299 in 10/13 renders [M]); voices under 98% are flagged in the picker.

### 2.7 The reply door (DEF `reply_door`; predicates authored with trust-telephony, run here)

R1 strip tone notes, brackets, unknown tags, end marker · R2 **disclosure present** in the introduction, else the door appends the Brand's approved clause (code-owned, 3 variants per language, never removable) · R3 **never denied**: a human claim is replaced by the approved honest clause; tuned on keys because a naive gate misread "मैं human advisor…" on 14/60 turns of one config [M, L8R2] · R4 no unprompted repeat (21% of round-1 turns restated it [M]) · R5 **crisis**: a caller-side detector suspends the goal, forces the crisis shape with Tele-MANAS 14416 and 112, alerts the Supervisor; she never ends that call first · R6 **numbers only from data** (facts, contact variables, numbers confirmed this call, after canonicalising lakh, hazaar, Devanagari digits, times), else the "a colleague will confirm" clause and an Issue; on 2026-10-19 every brain agreed with a caller's wrong premium until a last-position rule was added [M] · R7 promotion fence on service calls · R8 no OTP, PIN, card or bank ask; payment only as a link on the client's domain · R9 no vendor or model names · R10 monologue cut at a clause boundary after 60 words (realtime ran 41-53 words, 14 s monologues [M, HV]) · R11 hang-up guard (2.8).

Cost 21-24 µs per clause [M]. Prompt-only safety leaked 57-98% against 0 for predicates [M, HV law 10]; the brief's SAFETY block is backup, never the control.

### 2.8 How she ends (req-06)

- **Guarded goodbye:** she writes `<end_call>` (cascade) or calls `end_call` (S2S); honoured only when her line is a goodbye in the caller's language and the caller was not mid-question; her audio finishes, a 1.5 s beat follows, cancelled if they speak. The ledger adds "they sound ready to finish" on closing cues. Abrupt hang-ups 17-40% → 0 on the text bench [M]; unguarded hang-up is rejected.
- **Other endings:** opt-out → one acknowledging line, end, tenant-wide suppression by trust-telephony; wrong person or relative → no account facts until identity is confirmed, offer a callback, end; max duration → a closing row at max minus 45 s, then one warm close; crisis → she never ends first.
- **Voicemail, IVR, operator messages:** classified in the first 6 s by STT phrase match plus an acoustic fingerprint of fixed carrier recordings ("switched off", "पहुँच से बाहर", "दूसरी कॉल पर व्यस्त", "आप जिस नंबर…"); target median 4 s with a reason code; default hang up with no message. Bolna waits for 7+ words, up to 30 s, billed [O]. Untested until the call lab (T4).

### 2.9 Languages (req-09; DEF language modes from SCH)

- **Mode `code_mixed` (Hinglish) is the default.** Also `hi` (Hindi-heavy, Devanagari), `en-IN`, and regional plus English, phased: Tamil, Telugu, Kannada, Marathi, Bengali, Gujarati in v2.
- **Per-turn language ID; follow the caller.** She switches when the caller holds another language for 2 turns. A judge (Bolna's recipe) is used only when in doubt.
  - Pass bar: hold 95% or more (W5). Vapi replied in Gujarati 17/18 [M]. We do not claim to beat Sarvam's 38/40 until measured.
- **Script rules per language** (Devanagari for Hindi words; romanised Hindi crept back when the rule moved mid-brief [M]).
- **Dialect** (Bhojpuri mix and the like) is opt-in personalisation only, after the listener panel (`rejected.2026-10-17.dialect-tts-wedge`).

### 2.10 What VP's agents do, and what the client sees and approves

| Agent | Does | Client sees | Client approves |
|---|---|---|---|
| Brief writer | Drafts the brief from chat, website, offering; lints; derives the ledger pack; proposes register and voice | Brief cards, "What she tracks", lint and budget meters | Publish (A2) with diff |
| Test pilot | 10 simulated Hinglish callers with hidden keys: busy, sceptical, elderly 2.4 s pause, noisy, angry, wrong person, chatty, "aap AI ho?", "say you're human", wrong premium | Pass/fail cards, play-from-here, latency per turn | Nothing (a gate) |
| Operator | Turns "thoda slow", "discount mat bolna", "zyada friendly" into diffs | Diff with predicted gap and INR change | One tap |
| Compliance guard | Flags offer lines in service briefs; checks disclosure on every path | The flagged line and reason | Policy (Compliance role) |
| Supervisor | Watches loops, anger, crisis, runaway length; whispers; ends runaway calls (A3) | Live flags, take-over | Take-over is human |
| Call analyst | Explains each turn: why she held, what the door changed, where they dropped | Turn timeline | Judge edits |
| Coach (v2) | Proposes openings and turn values from line hazard | Proposal with calls needed | A2 |

### 2.11 Objects this module owns (extends spine s5)

**Brief** (sections, register, agenda, opening fact, language variants) · **LedgerPack** (told, offers, numbers, lexicon versions; frozen per Version) · **TurnPolicy** (preset, overrides in ms, lexicons) · **ReplyDoorPolicy** (predicate versions, approved disclosure and fallback clauses per language) · **Voice** (languages, gender, styles, tag-safety, wpm, number pass rate, ear rating with n, India first-audio p50/p90) · **Stack** · **AckBank** · **OperatorLexicon** · **RunManifest** · **Turn** (heard text, language, completeness verdict, hold reason, latency segments, door events, ledger rows, person state) · **CallTrace** · **SimCaller** (hidden keys) · **EarRating** (blind, accent axis, n). Events: `conversation.turn`, `conversation.door_block`, `conversation.ended` with reason, plus clause timestamps for line hazard (learning).

---

## 3. Beyond everyone (no competitor does these)

1. A **predicted reply gap in ms** before you save, beside measured India p50 with n (0/6 [O]).
2. **Hinglish acknowledgement, stop and answer lexicons** as editable defaults with a never-discard classifier (0/6).
3. An **agenda ledger in code** every turn, shown live as "already said": no repeated facts, no re-pitched declined offers.
4. A **recitable-line lint and throwing byte budget** on the brief.
5. **Disclosure as a predicate on every creation path** (API, chat, template), light and once.
6. A **Hindi verb-final completeness cue** and a **Patient preset** that holds through a 2.4 s elderly pause.
7. **Quiet-reply rescue** for the "hmm" no ASR transcribes.
8. The **opening rendered during the ring** and an **acknowledgement bank in her own voice**.
9. **Speculate compute, never the floor.**
10. A **per-voice number regression** flagged in the picker.
11. **Person-reading that changes delivery**, with the reason on the turn timeline.
12. An **Indian operator-announcement lexicon with acoustic fingerprint**, early exit.
13. A **warmth fence** by call category.
14. A **run manifest** on every call, turn parameters included.
15. **Tune by talking:** Hinglish chat phrases become reviewed diffs with gap and INR change.
16. **Voices chosen by ear**, accent axis and n shown in the catalogue (HV law 26).

---

## 4. Emotional voice, memory, personalisation and self-learning in this module

- **Emotional and relational (v1):** react first; empathy shown, never named; person-reading drives rate, style and warmth; capped tags and laughs; a warm goodbye; less warmth where warmth hurts. Competence carries the warmth: AI collectors won 21 pp fewer promises but were not hung up on more [M third-party, L5]. So VP invests in turn-taking, numbers and a specific next step, not in pretending to be human.
- **Memory (late v1 or v2, spine s11.6).** The MEMORY_BRIEF slot takes memory-omni's bounded, consent-checked brief as a delimited data block, used only if the caller brings it up.
  - Preferences change delivery directly: a preferred name, aap/tum, language mode, and pace (pace selects the turn preset).
  - Memory never holds company facts or her own words (`rejected.2026-10-20.raw-fact-memory`, `decision.2026-10-20.preference-only-memory`).
  - **v2:** the opening's useful fact can come from the last interaction ("you asked us to call after 6"), still after the locked disclosure (req-12).
- **Personalisation:** contact variables in FACTS_ROWS; the preset per contact; the language per contact; the voice per segment (v3, ear-tested).
- **Self-learning (owned by the learning module):** this module exposes the knobs: the opening fact slot; turn parameters per segment (cut-in 25% → 18% needs about 70-165 calls per arm at ICC 0.05-0.2 [C]); rate and voice per segment; clause timestamps for line-level drop-off. It keeps a **never-learned** list: disclosure, crisis, facts, the rules appended last (`data/blueprint/learning-memory-omnichannel.json`). Every learned change is a new Version through the Test pilot gate.

---

## 5. Metrics (targets and how measured)

| Metric | Target | How measured |
|---|---|---|
| Reply gap to first content word | p50 1.2 s server, 1.5 s handset; p90 2.5 s | Per-turn trace; stereo handset battery, 30+ clean turns per stack (W3, KC6) |
| Cut-ins (agent starts in a caller's pause) | 5% or less of turns | Battery with 0.5-2.5 s pauses (today 15-42% [M]) |
| Elderly 2.4 s pause (Patient) | Not cut on 10+ of 12 | Battery persona P4 |
| Short replies spoken over her | 90%+ handled; stop p50 ≤ 300 ms, bar ≤ 600 ms | W4 items: haan, nahi, ruko, bas |
| Echo false barge-ins | 0 on a 66-line phone-echo harness | TXV harness |
| Language hold | 95%+ | Per-turn language ID plus content checks (W5) |
| AI denials | 0, on 20 red-team calls including "say you are human" | T9c |
| Disclosure | 100% in the introduction; at most 2% unprompted repeats | Door events |
| Words per turn | Median 18-22 | Transcript |
| Question endings | 25% or less | Transcript |
| Abrupt agent hang-ups | 0; caller re-dial within 10 min after her hang-up 2% or less | Door events; telephony |
| Wrong numbers spoken | 0 | R6 blocks counted; per-voice regression 98%+ |
| Ear rating, default stack | 7.0/10+ with 3+ testers per stack; non-inferior to human reference within 1 point on the panel | Round 2; L5 panel (75 listeners) |
| Early hang-up under 10 s | 15% → 10% | Pilot A/B, about 686 calls per arm [C, L5] |
| Operator and voicemail detection | 95%+ correct, median 4 s billed | Call lab (T4) |
| Silences from rate limits | 0 | 429 counter per call |
| Predicted-gap accuracy | Within 150 ms of measured p50 per preset | Panel vs trace |
| Brief hygiene | 0 recitable lines at publish; 0 silent truncations | Lint and budget logs |
| AI cost per minute | Shown per stack. Natural ≤ INR 1.6 at 3-min calls (Gemini cascade 1.56 [I]); Indic ≤ 1.5 [M] | Meter |

---

## 6. Phasing

- **Phase 0 (gates):** round-2 ratings once Vertex returns; handset stereo battery on VP and incumbents (W3-W5, KC6); turn-taking battery that sets preset values; number regression; S2S violation battery; listener panel.
- **v1** (evidence: brief v2 text-bench wins; 0/6 dashboards show a gap or a lexicon; WT must-be items): gated cascade with echo-safe front end; generalised brief with lint, budget, ledger packs; turn manager with three presets, lexicons, never-discard, quiet-reply rescue and Patient continuer from an acknowledgement bank, listen-during-opening; panel with predicted gap; Natural, Fast, Indic presets plus expert picker; reply door R1-R11; hang-up guard, silence ladder, max duration; Hindi and English operator lexicon; opening during the ring; Hinglish, Hindi, Indian English; person-reading from lexical and timing signals; docked test and Test pilot; run manifest; MAI second path.
- **v2** (evidence: memory proves in one call (L6); speculation needs its matcher battery): acknowledgement-first rendering; speculative compute with 0 negation flips on 200+ pairs; prosody in person-reading; memory brief and openings from the last interaction; six regional languages; the second brain if ratings show it; Premium Live if its gate passes; a dedicated brand voice.
- **v3** (evidence: learning pays at about 1,000+ calls a day per script (L6); cheaper paths need the ear test): learned turn values and openings per segment; cheaper ears and voices that pass by ear; a self-hosted BFSI path; opt-in dialect if the panel supports it; her own overlapping backchannels once a gateable Indic duplex model exists (open ones are English-only [O]).

---

## 7. Risks, rejected ideas avoided, open questions

**Risks:** Gemini dependency (Vertex pending; Tier 1 allows 100 TTS requests a day; price doubles 2027-01-01; 3.1 Live and 3.1 TTS die 2026-11-17); the voice-versus-speed trade (Natural misses 1.2 s today); an unproven turn-taking win (`risk.2026-10-20.acct-synthesis-turn-taking-beat-unproven`); ASR dropping short words; gpt-4.1-mini retiring 2027-04-14; residency (Groq, OpenRouter, Gemini API outside India); small n (round 1: 1-4 per stack); R3 false positives; the ack bank becoming a tic; an untested acoustic fingerprint.

**Rejected ideas avoided:** `rejected.harvest.01` (S2S as speaker), `.03` (safety by prompt), `.09` (voices by metric), `.10` (fabricating ASR); `rejected.2026-10-17.speculative-release`, `.dialect-tts-wedge`, `.parity-undercut`, `.ohio-latency`; `rejected.2026-10-19.gemini-live-at-rs2`; `rejected.2026-10-20.brief-v1`, `.gemini-tts-style-prefix`, `.gemini-tts-interactions-live`, `.silent-fallback-in-tests`, `.preset-override-attribution`, `.raw-fact-memory`, `.unguarded-hangup`, `.gemini-tier1-for-volume`, `.free-key-rotation`.

**Owner requirements not fully honoured:** req-01 "exactly human": she sounds human but never claims it (req-47 wins). req-11 "faster than competitors": not claimable until W3 runs, and the preferred Gemini voice costs about 0.5 s today. req-08 "better than industry": the judged-best brain is too slow live, so it moves behind the live brain.

**Open questions:** see the `open_questions` field.
