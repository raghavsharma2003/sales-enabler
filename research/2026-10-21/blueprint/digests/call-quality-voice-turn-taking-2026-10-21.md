# The call itself: what we know about making a VP call great (2026-10-21)

Scope: human, emotional, relational Hinglish voice; fast replies; turn-taking; the agent ending calls well. Everything below is drawn from research already on disk. No vendor was called, nothing new was measured, and no secret or phone number is reproduced. A machine-readable copy of the facts tables is in `data/blueprint/call-quality-facts.json`.

Grades: **M** measured (we ran it, with n and method), **O** observed (capture or API read-back), **V** vendor-claimed, **I** inferred, **U** unknown.

**Biggest caveat, up front.** No VP stack has been rated by humans on brief v2. Round-1 ratings are n=1-4 per stack. No call has been timed at an Indian handset. Every reply gap below is server-side unless it says otherwise.

---

## 1. Measured facts

### 1.1 Reply gap: caller end of speech to first agent audio

| Stack | Value | n / method | Grade | Source |
|---|---|---|---|---|
| Cascade A, all-Azure India: STT Central India with 500 ms segmentation, gpt-4.1-mini South India, Swara, per-clause gate | p50 **1,004 ms**, p90 1,100; 58/58 turns ≤1.5 s | 60 turns, 6 calls, India VM, l4b battery | M | `research/2026-10-17/lanes/l8-azure-bench/round2/findings.md` §4 |
| Cascade E: A plus speculative LLM/TTS on partial transcripts | p50 **823 ms**, p90 1,029 | 60 turns | M | same |
| Cascade B: 800 ms segmentation | p50 1,348 | 60 turns | M | same |
| D: gpt-6-sol in the EU data zone / F: gpt-5.4-nano Global | 1,546 / 1,360 | 60 turns each | M | same |
| Fast cascades C1, C1g, C3, C6, C6g | p50 989-1,044 ms | 28-60 turns each | M | `research/2026-10-18/SYNTHESIS.md` §3 |
| Lab base: gated Gemini transcribe-live, gpt-oss@Groq, Azure Swara | 0.49-0.91 s (STT 456, brain 330, voice 54 ms) | 1 call × 3 replies (smoke) | M | `research/2026-10-19/voicelab/results/smoke-india-2026-10-19.md` |
| Phone leg through a fake Plivo over TLS, base stack | 641 / 999 / 903 ms | 3 replies, `voicelab/tests/plivo_sim.py` | M | graph `measure.2026-10-19.plivo-sim-gap` |
| All-Sarvam: Saaras v4, Sarvam-105B, Bulbul v4 Flash | 0.97-1.18 s; Sarvam-105B first token about 100 ms | 9 replies | M | graph `measure.2026-10-19.sarvam-india` |
| Gemini 3.8 Live, paid key | p50 1,006 (CI 950-1,253), p90 1,524; **42% talk-over** | 30 turns, 6 calls | M | `research/2026-10-18/lanes/g5-gemini-paid/findings.md` |
| Gemini 3.8 Live, thinkingBudget 0, free key | p50 819; talk-over on 52% of spoken turns | 26 turns | M | `research/2026-10-18/SYNTHESIS.md` §3 |
| Gemini 3.1 flash live (Meera's model), paid | p50 1,950, p90 5,299 | 33 turns | M | same |
| Round-2 smoke: v2-live / v2-flashlite / v2-54mini / v2-luna / v2-38flash | 0.79-1.55 / 1.6-2.2 / 2.0-2.6 / 1.9-3.3 / 2.9-4.2 s | 1 call × about 3 replies each | M (smoke) | `research/2026-10-20/voicelab/round1-review-and-v2.md` |
| Round 1, all stacks | Azure-voice cascades 0.95-1.4 s; Gemini-voice cascades 2.4-2.8 s; Asha stack 4.9 s; **browser-measured median 1.74 s** | 199 browser replies | M | same |
| Gemini-TTS cascades G-D / G-E / G-A | p50 1,842 / 1,978 / 2,532 | computed from measured parts | I | `research/2026-10-18/SYNTHESIS.md` §3 |
| Competitor demo agents, US vantage: Ultravox / Vapi / ElevenLabs | clean-turn p50 1,540 / 2,319 / 3,749 ms | 52 / 40 / 63 turns; harness bias about 60 ms | M (demo agents, not configured platforms) | `research/2026-10-17/lanes/l4b-measured/report.md` |
| Cartesia / Smallest / Deepgram demos | 1,736 / 2,362 / 2,242 ms | l4b round 2 | M (not verified) | graph `ledger.CMP-10` |
| Sarvam demo, browser-side | p50 3.1 s | teardown SAR-35 | M | `research/2026-10-20/teardown/SYNTHESIS.md` W3 |
| ElevenLabs end-of-turn, read from its websocket | user_transcript p50 2,648 ms after the caller stops | 72 turns | M | l4b report §6 |
| Vapi's dashboard headline | about 1,530 ms (410 + 690 + 430), with telephony and turn wait left out | dashboard capture | O | `research/2026-10-21/walkthroughs/SYNTHESIS.md` |
| Twilio's published target | 885 ms platform; 1,115 ms mouth to ear (upper 1,400) | vendor document | V | l8 round2 §6 |

### 1.2 Components, measured from India

- **Brain first token on brief v2** (n=5 medians, India VM):
  - gpt-oss@groq 535 ms; GPT-4.1 mini 567; Gemini 3.5 Flash-Lite 699; GPT-5.4 mini 960.
  - Gemini 3.6 Flash 1,102, with p90 13.3 s; GPT-5.6 Sol (via OpenRouter) 1,174; GPT-6 Luna (via OpenRouter) 1,438.
  - Gemini 3.8 Flash 1,991 (thinking cannot go below "low"); DeepSeek V4.1 Flash 2,800.
  - Grade M. Source: `round1-review-and-v2.md`.
- **gpt-4.1-mini on a South India Standard deployment:** 304 ms TTFT (n=33). That is about 2× faster than any Global or data-zone deployment. Priority tier did not lower TTFT (903 against 773 ms). Grade M, l8 round2 §3.1.
- **Voice first audio** (n=5): Azure MAI-Voice-2.1-Flash 425 ms; Gemini 3.8 Flash-Lite TTS stream 624; Gemini 3.8 Flash TTS stream 772. Gemini TTS through the Interactions API took 4,700-5,100 ms, so it is unusable live. Grade M.
- **Gemini TTS on the paid key** (g5): first byte p50 857 ms for flash-lite and 1,094 for flash, plus **0.14-0.36 s of leading silence**. Grade M.
- **Gemini through OpenRouter:**
  - Gemini TTS first audio 2.14-2.20 s, not progressive (direct stream: 0.62-0.77 s).
  - The AI Studio provider once took 12.8 s, so the provider must be pinned to google-vertex.
  - Grade M, graph `measure.2026-10-20.openrouter-gemini-latency`.
- **Azure TTS over a warm websocket:** Swara 95 ms, DragonHD 188, MAI-Voice-2.1-Flash 363. A short opening clause ("जी,") reached first audio in **19-29 ms**. Grade M.
- **Azure STT, final after end of speech:**
  - 450 ms at 300 ms segmentation, 622 at 500 ms, 985 at 800 ms; Semantic 848 (p90 1,609).
  - The first partial arrives about 925 ms after speech starts.
  - The timeout is not a floor: finals came inside 0.7-0.9 s elderly pauses even at 800 ms.
  - Grade M.
- **Per-clause code gate:** 21-24 µs. Grade M.
- **Phone leg:** India CPaaS is estimated to add **0.25-0.45 s**. Grade I, from Twilio, Plivo and Exotel documents; never measured.

### 1.3 Ratings and conversation quality

- **Round-1 human ratings** (overall /10):

  | Stack | Rating |
  |---|---|
  | Gemini 3.1 Live (Despina) | **7.0**; 2/2 would pick |
  | Sarvam + gpt-oss + Bulbul | 6.0 |
  | Gemini 3.8 Live | 6.0 (n=1) |
  | gpt-oss + Gemini voice | 6.0 |
  | Asha stack | 6.0 |
  | All-Gemini | 5.5 |
  | Azure-voice stacks | **1.5-4.5**; 0 would pick |

  - Every stack's *content* was judged robotic.
  - n: 65 calls (11 on real phones), 33 ratings, 4 testers, n=1-4 per stack. Grade M, small n.
- **Robotic signature** (316 agent turns, renewal scenario): 53% ended on a question; median 22 words (p90 37); 21% restated "I'm an AI assistant"; 19% mentioned the link, a callback or an advisor. Grade M.
- **Brief v1 → v2, same brains** (gpt-4.1-mini / flash-lite; 6 simulated callers × 10 turns):

  | Measure | v1 | v2 |
  |---|---|---|
  | Words per turn | 33.7 / 32.7 | 20.9 / 18.7 |
  | Turns ending on a question | 62% / 76% | 13% / 29% |
  | Stock phrases per call | 1.8 / 2.7 | 0.7 / 0 |
  | Agenda turns (flash-lite) | 100% | 51% |

  Grade M, text bench.
- **Brains on v2** (win %, GPT-4.1 judge / Gemini judge; 540 blind pairwise verdicts):
  - Gemini 3.8 Flash 65/75; DeepSeek V4.1 Flash 57/76 (romanised Hindi 4 times per call); Gemini 3.6 Flash 48/77.
  - Flash-Lite 52/61; GPT-5.4 mini 59/48; GPT-5.6 Sol 61/43.
  - GPT-6 Luna came **last, 28/30**. It is the owner's pick and has not been confirmed by ear (`open.2026-10-20.luna-by-ear`).
  - Grade M. LLM judges rank; they do not decide.
- **Hang-up guard:** abrupt agent hang-ups ran 17-40% unguarded and **0** with `hangup_ok`. Grade M, text bench (`voicelab/evals/convo_bench.py`).
- **Competitor demos:**
  - Words per turn (medians): Vapi 14, Ultravox 19, ElevenLabs 27. Over 40 words: 21% / 7% / 24%.
  - Language:
    - Vapi answered a Hinglish caller in **Gujarati on 17/18 turns**.
    - ElevenLabs answered Hindi callers in English on 18/20 turns.
    - Sarvam held Hindi or Hinglish on 38/40 turns. That last figure is unverified.
  - Grade M (l4b).

### 1.4 Cost per connected minute (₹, AI only, list price, ₹95/$)

| Stack | ₹/min | Grade |
|---|---|---|
| C6g: gated transcribe-live, gpt-oss@Groq, Azure neural | 0.94 at 3 min (Monte Carlo p50 1.07) | M usage × list price |
| G-E: gpt-oss with Gemini 3.8 Flash-Lite TTS | 0.98, rising to 1.34 in 2027 | I, composite |
| G-A: all-Gemini cascade | 1.56, rising to 1.92 in 2027 | I, composite |
| All-Sarvam | 1.39-1.51 (the voice is most of it) | M meter |
| Cascade A, all-Azure India | about 2.4 (STT 1.58 of it) | M |
| Gemini 3.1 flash live | 2.47 at 1 min; 4.19-4.71 at 3 min; 6.38-10.74 at 10 min | M paid meter, n=1-2 per cell |
| Gemini 3.8 Live | 3.31; 5.72; 9.05-12.70 at the same lengths. About 70% is past audio re-billed every turn | M |
| Inworld all-in / self-host IndicConformer + Veena | 0.53 / 0.43 | V, desk; nobody has heard them |
| **AI budget at ₹2 ex-GST** | **0.54** at 50% margin (0.34-0.74 for 60-40%) | computed |

**Gemini TTS price.** It is ₹0.86 per spoken minute for flash-lite and ₹1.29 for flash. Both **double on 2027-01-01**.

**Indian all-in list prices** (computed from rate cards, not invoices): Sarvam 3.4-3.9; Bolna 4.2-8.0; ElevenLabs 8.2-8.9; Retell 8.3-13.6 on a BYO trunk; Vapi 12.5-17.0. Source: graph `measure.2026-10-20.synthesis-india-allin-prices`.

---

## 2. What made calls robotic, and what fixed it (brief v1 → v2)

**What testers said** (round 1, `round1-review-and-v2.md`):
- robotic, slow and flat;
- "keeps repeating the same thing", "mai samajh sakti hu";
- no breathing, humming or modulation;
- the accent switched mid-sentence on Azure multilingual voices;
- she didn't listen while talking;
- she said "say in a warm tone" out loud;
- she called the tester by an invented name ("Riya / Diya").

**Root cause: the brief, not the brains.** v1 broke all three inherited laws:
- the agenda had no state, so the model repeated itself;
- the humanness rules sat mid-brief, where position kills them;
- about 12 instructions asked questions;
- empathy was written as labels, so it came out as stock phrases like "I understand".

**Bugs found:**
- Gemini TTS **spoke the style prefix** (`rejected.2026-10-20.gemini-tts-style-prefix`). An earlier g5 check had said it did not, and that check was wrong on real Hindi lines.
- The brief never gave the caller's name, so the model invented one.
- Per-tester memory filled up with the brief's own facts and gender errors, and was re-injected on every call (`rejected.2026-10-20.raw-fact-memory`).
- There was no speaking-rate control, so "speak faster" did nothing.
- On 2026-10-19 every brain agreed with the caller's wrong premium figure until a correction rule was placed in the final block.

**The fix: brief v2** (`voicelab/server/persona_v2.py`, `decision.2026-10-20.brief-v2-ledger`).

1. **Shapes, not lines.** Nothing in the brief can be read out. A governor says that anything already said on the call is spent.
2. **React, then a view, before any question.** Empathy is shown by reacting to the exact thing said, never by naming a feeling ("no 'I understand'", apologise at most once).
3. **Read the person**:
   - busy → compress;
   - chatty → be good company, then bridge back;
   - worried → slow down, warm and concrete;
   - irritated → give the straight answer first.

   "Concrete facts are the kind thing" was added for worried and confused callers. v1 had won on those personas until then.
4. **A spoken business register**: the caller's own language mix, English for domain words, no textbook Hindi (कृपया, अवगत), आप with plural verb forms. Spoken texture is used lightly; "a reply that has all of it sounds performed".
5. **Script and identity rules sit at the top**: Hindi in Devanagari, numbers as digits, feminine verb forms for herself. Romanised Hindi crept back in when the script rule moved mid-brief.
6. **An agenda ledger, computed in code from the transcript every turn** and placed last. It tracks:
   - facts already said (spent), including the AI disclosure;
   - offers made, with their count and outcome (declined means closed);
   - wrong numbers the caller gave;
   - "you laughed recently";
   - how the caller sounds lately: hurried, irritated, worried, chatty or confused;
   - a goal-stall nudge, suppressed if they are irritated or worried;
   - "they sound ready to finish";
   - "your last turn ended with a question".
7. **Counts and the goal check go last.** Most turns are one short sentence, up to three when they need information. At most one question, and never two question endings in a row. At most one goal step per turn, and never on two turns running.
8. **Value-first opening.** The first turn only checks the person's name. Then, in one breath: her name, the company, the AI disclosure in passing, the one useful or good-news fact, and the reason for the call.
9. **Earn the ask, then ask once.**
10. **Memory holds preferences only** (`decision.2026-10-20.preference-only-memory`): how they like to be addressed, pace, context they shared, open promises. It never holds company facts or the agent's own words.

**Status.** v2 is measured on text only. Human round 2 has not run (`open.2026-10-20.round2-human-ratings`). The reversal condition: v2 human ratings are not above round 1, or the ledger itself drives repetition.

---

## 3. What makes voice feel human and relational

### 3.1 Evidence from outside VP (l5 literature review, `research/2026-10-17/lanes/l5-human-dialect/report.md`)

**The big human-vs-AI gaps are about commitment and process, not voice warmth.**
- AI collectors recovered 9-12 pp less, with 21 pp fewer promises to pay, and were **not** hung up on more within 10 s. Choi, NBER w33669. Grade M (theirs).
- AI sales agents underperformed on qualification, persistence and next-step orchestration (Habel 2026, n=366; abstract only).
- Implication: the agent must win a binding, specific next step.

**Voice likeability helps, on thin samples.**
- +1 SD of likeability was worth about +4 pp repayment, but across only 8 agents (Laudenbach, JF 2025).
- The choice of TTS vendor moved intro hang-ups by at most 2.4 pp (V, vendor-funded).

**Disclosure.**
- 2017: an up-front disclosure cut purchases from 23.7% to 4.8%, and 56% of people hung up within 5 s.
- 2026: no conversion effect (n=1,337), and people recognise AI voices anyway.
- So realism is not for passing as human. It earns its keep through competence: turn-taking, short turns, correct numbers and a trusted accent.

**Limits on warmth.**
- Anthropomorphism lowers satisfaction for **angry** callers (Crolic). That covers complaint, failed-delivery and collections calls.
- Humanising cues raise price sensitivity (Schanke).
- In collections, RBI conduct rules apply from 2027-01-01 (contact 08:00-19:00, recordings kept 6 months).
- There is no study of elderly callers and AI voice.
- No outcome study exists for "emotional/relational" voice in sales. That claim needs a pilot: early hang-up A/B, about 686 calls per arm to detect a drop from 15% to 10%.

**Language matching** is strongly revealed in hiring: 83-91% of Tamil Nadu postings require Tamil. Dialect matching is not: 1 of about 460 Hindi-belt postings asks for one (`rejected.2026-10-17.dialect-tts-wedge`).

### 3.2 Inherited, measured laws (`docs/harvest/SYNTHESIS.md` §2)

- **Sentence-shaped text gets recited.** Example quotes were recited 4/5 times, and 0 after removal. Floor phrases were recited in 22/33 replies. Bracketed stage directions were spoken ("[laughs softly]" came out as "Softly"; brackets in 4/4 transcripts).
- **Position is mechanism.** A rule mid-brief fired 0/8 times and 8/8 when placed last. Brevity mid-prompt gave 64 words per turn; placed last, 25.
- **The register target is about 20.5 words per turn** (Meera). Realtime S2S ran 41-53 words, with 14 s monologues.
- **A static filler list ("hmm" every turn) becomes a tic.** It was replaced by uptake-echo plus a gated continuer, never on two turns running (tx-voice).
- **Backchannels while the user speaks failed in Meera.** The echo-protecting mic hold is digital silence, which reads as end of turn. The fix was an acknowledgement in the gap, about 420 ms after the user stops. A synthesised "mm" was rejected by ear as not her timbre (`docs/harvest/hp-main.md`).
- **Metrics do not pick voices.** Azure TTS won 15/15 pronunciation, was fastest and 5× cheaper, and was rejected by ear as "not human, not Indian". An audio-LLM judge rated an American accent "native Indian". Every voice choice needs a blind ear test with accent as its own axis.
- **Text-lane evals overstate voice quality:** 77 correct verdicts on text against 51 on voice (n=32).

### 3.3 Expressive levers we hold today

- **Sound tags** (`<laugh>`, `<chuckle>`, `<sigh>`, `<breath>`):
  - Gemini 3.8 TTS does not speak them (STT check, n=6). Every other voice gets them stripped (`decision.2026-10-20.sound-tags-gemini-only`).
  - The ledger caps laughter at once in any 3 turns. The brief allows at most one tag per reply, in few replies.
- **Tone notes:** `[tone: …]` maps to MAI-Voice styles (13-18 emotion styles in hi-IN) or to the OpenRouter instructions field. It is always stripped before speech.
- **Speaking rates** (measured):

  | Voice | Rate |
  |---|---|
  | hi-IN neural | 117-124 wpm |
  | MAI-Voice-2.1 | 137-155 wpm |
  | DragonHD Aarti | 164-195 wpm (fast) |
  | Gemini flash | 14.0 chars/s (8.3-25 by style) |

  The pipeline has no rate control yet.
- **Number correctness is part of sounding competent:**
  - one generative voice misread ₹1,299 in 10/13 renders;
  - ASR inverse text normalisation invents digits ("bhej do" became "bhej 2");
  - Tamil normalisation produced "47 September 2,928".
  - Fix: a number regression test per locale, and gate canonicalisation of lakh, hazaar, Devanagari digits and times.

---

## 4. Turn-taking: state of the art, and what is unsolved

### 4.1 Where we stand

- **The binding problem is not speed** (`open.2026-10-19.turn-taking`). Every stack cuts in on **15-42%** of turns. Every stack takes the elderly caller's 2.4 s mid-sentence pause, 100% of the time.
- **The trade-off is direct** (Cascade A-F, n=60 each):
  - **0/30** cut-ins on turns with no internal pause of 0.5 s or more;
  - on 0.9-1.3 s pauses: A 72%, B (800 ms) 17%, E (speculative) **100%**;
  - lower latency buys more cut-ins.
- **What the agent says into a pause depends on the model.** gpt-6-sol and gpt-oss say "go on" (11-12/12). gpt-4.1-mini and flash-lite answer the half-question (12/12).
- **Quiet backchannels vanish.** The elderly "हम्म" (0.45 s) produced 0 transcripts in every cascade and Voice Live arm. Voice Live returned empty transcripts on 5/14 short answers. Azure returned text for only 4/8 one-word answers.
- **ASR fabricates on non-speech.** Open ASR did so on 30/30 clips. Qwen3-ASR wrote "हाँ" on 24/25; gpt-4o-transcribe wrote words on 17/49. Azure real-time wrote 0/49.

### 4.2 The lab's current turn policy (`voicelab/server/calls.py`)

- **VAD:** server-side Silero; on 0.5, off 0.35, minimum speech 96 ms, minimum silence 160 ms.
- **Trigger:** a reply starts only when the STT final for the latest speech segment has arrived, or after 1.2 s of silence (a cough or a breath).
- **Continuation hold:** if the turn ends on a continuation word (और, लेकिन, मतलब, कि, aur, matlab, and, but, um…) or a trailing comma or ellipsis, the reply is held **1.4 s**.
- **Withdraw:** a reply that was released but is not yet audible is cancelled if the caller keeps talking for 250 ms or more. The two turns are merged.
- **Barge-in:** fires on 300 ms or more of caller speech with at least 2 words (or 700 ms). The audio is flushed and the history truncated to what was actually heard (law 28: barge-in pauses, then the transcript decides).
- **Backchannels:** words heard over her without a barge-in are logged as backchannels and not answered.

### 4.3 The market, by grade

**Competitor demos (M, l4b):**
- Collisions: Vapi 35%, Ultravox 18%, ElevenLabs 3%.
- Barge-in handled: Ultravox 6/6 (stops in 0.32-0.59 s), ElevenLabs 3/7, Vapi 2/8.
- 5 of 6 calls cut into the elderly pause.
- Under ~15 dB babble, Ultravox looped its greeting and ElevenLabs slowed to 8 s.

**Competitor code and defaults (O):**
- Bolna discards short finals spoken over the agent and drops speech during the welcome. Its use_fillers audio path is dead code.
- Vapi's smart endpointing is labelled English-only.
- Defaults: Vapi 1.5 s fixed wait; Retell 0 ms added wait with interruption sensitivity 0.9; Bolna 500 + 900 ms (about a 1.4 s hold); ElevenLabs eagerness Normal with Turn V3.
- **0 of 6 dashboards ship a Hindi or Hinglish backchannel or interruption list. 0 of 6 show a predicted reply gap.**

**Turn detectors:**
- LiveKit multilingual turn detector claims Hindi TPR 99.4% and TNR 96.3% on its own set (V).
- Pipecat Smart Turn v3 lists Hindi (V). Taxila measured it at **34/72, chance**, on child Hinglish (M).
- Deepgram Flux (V, language list unread).
- Azure semantic VAD: end of turn p50 1,480 ms against a 900 ms bar; Hindi continuers stopped it on 23/36 (M, Taxila).

**Echo and barge-in, best measured: the Taxila Voice Live reference-AEC "ear-only" front end** (M, `docs/harvest/tx-voice.md`):
- 0/66 echo false barge-ins;
- 12/12 true barge-ins, with a stop p50 of 80 ms on the phone-echo harness;
- 0/46 continuer false yields.

**Full duplex:** every open model card (Moshi, PersonaPlex 7B, Nemotron VoiceChat 11B at about 450 ms) is English-only (O). No gateable Indic speech-to-speech exists.

### 4.4 Unsolved

1. Mid-turn pauses of 0.5-2.5 s. This needs a pause-aware release policy; no tuned one exists.
2. Quiet or short Hinglish replies (haan, hmm, nahi, ruko, bas) that ASR drops.
3. Elderly and slow speakers.
4. Babble robustness.
5. The agent's *own* backchannels, without echo or self-interruption.
6. **Safe speculation.** The string-similarity release accepted truncated transcripts 3/58 and negation flips 4/4 (`rejected.2026-10-17.speculative-release`). It needs a negation-aware matcher.
7. Everything on a real Indian PSTN line.

---

## 5. Latency budget anatomy

| Segment | Fast measured | Typical | Slow | Lever |
|---|---|---|---|---|
| Endpoint: STT final after end of speech | 450 ms (300 ms seg) | 620-660 (500 ms) | 985 (800 ms); Semantic p90 1.6 s | Segmentation trades against cut-ins |
| Turn hold (lab) | 0 | 0 | +1,400 if the turn ends on a continuation word | Pause-aware release |
| Brain first token | 100 (Sarvam-105B), 304 (4.1-mini India), 535 (gpt-oss@groq) | 700 (Flash-Lite), 960 (5.4 mini) | 1,991 (3.8 Flash), 2,800 (DeepSeek) | Region, effort none, short first clause, prompt caching |
| Voice first audio | 19-29 (Azure opening clause), 95 (Swara) | 425 (MAI), 624 (Gemini Flash-Lite TTS) | 772-1,094 (Gemini Flash TTS) + 140-360 leading silence; 2.1 s via OpenRouter; 4.7-5.1 s via Interactions API | Warm pool, streaming, never reuse a cut-off stream |
| Gate | 0.02 | 0.02 | 0.02 | none needed |
| Phone leg | 230-300 (Twilio, V) | 250-450 (I) | unknown | CPaaS media region; Plivo targets <100 ms round trip |
| **Sum, server** | **0.49-0.91 s** (lab base); 0.82 (E); 1.00 (A) | 1.6-2.2 s (v2-flashlite) | 2.9-4.2 s (v2-38flash) | |
| **Caller-perceived (estimate)** | about 1.1-1.45 s for A/E | about 1.9-2.6 s with Gemini TTS | | Unmeasured at the handset |

**Rate limits are latency failures.**
- A 50k-TPM deployment returned 429 on 13/35 turns at three concurrent speculative streams. One concurrent call needs about 13-25k TPM.
- On the 2026-10-19 test day, the Gemini Tier-1 cap of 100 TTS requests a day per model (each reply uses 1-2) was hit within an hour, and 6/12 All-Gemini calls went silent.

**Bars set by earlier research:**
- V4: p50 ≤ 1.2 s and cut-ins ≤ 5%.
- Teardown W3: p50 at least 0.3 s below the best incumbent, p90 ≤ 2.5 s, cut-ins ≤ 5%.
- The Gemini-TTS default does not yet meet the speed bar. The Azure, Sarvam and gpt-oss paths do, server-side.

---

## 6. Stack options, trade-offs, current leaning

| Option | Human quality | Speed (India, server) | AI ₹/min | Gateable? | Risks |
|---|---|---|---|---|---|
| **Gemini 3.8 Live** (S2S; v2-live) | Best-rated family: 3.1 Live 7.0, 3.8 Live 6.0 (n=1) | 0.79-1.55 s smoke; p50 1.0 s | 3.3-5.7 at 1-3 min; 9-12.7 at 10 min | Yes, by text: the transcript arrives with or before the audio on 1,041/1,041 turns. The violation battery has not run. | 42% talk-over; cost grows with call length; no India residency; the "affective dialog" field is documented as both removed and present (conflict); law 25 tension (`open.2026-10-18.s2s-vs-gate-law`) |
| **Gemini cascade** (Gemini ears, 3.5 Flash-Lite, 3.8 Flash-Lite/Flash TTS; v2-flashlite) | Gemini voice plus gpt-oss rated 6.0; tags work | 1.6-2.2 s | about 1.56 (1.92 in 2027) | Yes | Slow first audio; Tier-1 caps; Google access risk; TTS price doubles in 2027 |
| **G-E hybrid** (gpt-oss@Groq brain + Gemini TTS) | Unrated with v2 | computed about 2.0 s | 0.98 (1.34 in 2027) | Yes | Groq runs in the US |
| **Cheapest base, C6g** (Azure neural voice) | Azure voices 1.5-4.5 by ear, 0 would pick | 0.49-1.04 s | 0.94 | Yes | Fails the ear test |
| **MAI-Voice-2.1-Flash** (v2-mai; 13-18 hi-IN styles) | Unrated with v2 | 425 ms first audio | Azure list price | Yes | Preview; Azure-voice family rated low in round 1 |
| **All-Sarvam** | 6.0 (n=2, with gpt-oss) | 0.97-1.18 s | 1.39-1.51 | Yes | Trains on data by default unless opted out; competitor dependency |
| **All-Azure India A/E** | Voices rejected by ear | 0.82-1.00 s | about 2.4 | Yes | India-resident; gpt-4.1-mini retires 2027-04-14 |
| **Premium brain** (Gemini 3.8 Flash) | Best judged: 65/75 | 2.9-4.2 s | — | Yes | Too slow for live turns today |
| **Cheap paths** (Inworld 0.53, self-host 0.43) | Unheard | Unmeasured | V | Yes | Volume bets |

**Current leaning** (`decision.2026-10-20.product-stack-selectable`, DIRECTION.md):
- The stack is a user choice with curated defaults.
- The owner leans to **Gemini TTS** as the default voice.
- The default is chosen only after paid Vertex returns (`voicelab-india`) and round-2 human ratings are in.
- A second voice path stays ready. MAI-Voice at 425 ms is the candidate (`risk.2026-10-20.google-dependency`).

**Live vs cascade.** Live won by ear in round 1, but fails on cost, talk-over and residency, and its winning model dies on 2026-11-17. A cascade keeps the per-clause gate, flat cost per minute and stack choice.

**A synthesis view (I), not a decision:**
- default: cascade with the gate and Gemini (or the best-rated) TTS;
- Live as a selectable premium stack, kept if round 2 shows it beats cascades beyond the noise floor;
- hybrids to test: Live for small talk and gated TTS for facts.

---

## 7. Ending calls well

**The guard** (`decision.2026-10-20.agent-hangup-guard`, `persona_v2.hangup_ok`, `calls.py end_after_playback`):
- She ends the call with `<end_call>` in cascades, or the `end_call` tool on Live and realtime.
- The request is honoured only if her line contains a real goodbye and the caller's last turn was not a question.
- She then lets the goodbye finish playing, waits **1.5 s**, and stays on if the caller speaks.
- The ledger tells her when the caller sounds ready to finish ("one warm closing line, then end").
- The brief says: close with one warm, personal line (not a summary, not a pitch); never end while they are asking, upset or mid-thought; let them go first if they want.

**Evidence:** abrupt hang-ups fell from 17-40% to 0 on the text bench (M). Unguarded hang-up is rejected (`rejected.2026-10-20.unguarded-hangup`). Reversal: testers say she ends too early or never, or callers re-dial after her hang-ups.

**Competitor defaults for silence and limits (O):**

| Vendor | Silence hang-up | Maximum call |
|---|---|---|
| Retell | 10 min | 1 h |
| Bolna | 20 s | 90 s |
| ElevenLabs | disabled | 600 s |
| Sarvam | after unanswered 5 s nudges | 15 min |
| Exotel | 3 nudges at 7 s | off |

**VP design** (from the walkthrough synthesis):
- a silence ladder: a nudge in the caller's language, then a polite close;
- voicemail detection tuned on Indian operator announcements (untested, plan T4);
- bounded call and spend defaults (must-be C).

**Not measured:** hang-up behaviour on voice with human raters; re-dial rate; voicemail accuracy.

---

## 8. Risks

1. **Gemini 3.1 flash live shuts down 2026-11-17** (`risk.2026-10-20.gemini-3.1-live-sunset`). It is not on Vertex, and the round-1 winner dies with it. 3.1 flash TTS has the same date.
2. **Google access.**
   - Gemini API Tier 1 allows 100 requests a day per model for 3.8 Flash TTS, and was exhausted in an hour (`rejected.2026-10-20.gemini-tier1-for-volume`).
   - Vertex project vp-voice is restricted with no reason given.
   - The new paid project sits on CarbonSettle's main Google account (`risk.2026-10-20.carbonsettle-account-exposure`).
   - Tier 2 needs $100 cumulative paid and 3 days.
3. **Lifecycle:**
   - Gemini 3.8 TTS and Flash double in price on 2027-01-01;
   - Hume TTS ends 2026-11-13;
   - gpt-4.1-mini (the fastest India brain) retires 2027-04-14.
4. **Residency:** Groq and OpenRouter run in the US, and the Gemini API and Live have no India residency. Sarvam, ElevenLabs, Cartesia and Deepgram train on data by default unless opted out.
5. **Small n and proxy judges:**
   - round-1 n is 1-4 per stack;
   - LLM judges disagree with each other and with the owner (Luna);
   - text benches overstate voice (77 → 51).
6. **The turn-taking "beat" is unproven** against incumbents on one shared battery (`risk.2026-10-20.acct-synthesis-turn-taking-beat-unproven`).
7. **Rate limits cause silence**, and quota must be sized per concurrent call.
8. **Production failover policy is undecided** (`open.2026-10-20.product-failover-policy`). Tests forbid mid-call swaps; production needs availability.
9. **Plivo trial credit expires 2026-11-16** with an ₹80 monthly cap, which limits real-phone testing.

---

## 9. Open questions (with what would close each)

1. **Round-2 human ratings** of v2-live, v2-flashlite, v2-54mini, v2-38flash, v2-mai and v2-luna. Close with ≥3 testers per stack after Vertex returns. This picks the default stack and confirms or reverses brief v2.
2. **Is GPT-6 Luna good by ear?** Rate v2-luna.
3. **Handset reply gap and cut-ins on Jio, Airtel and Vi.** Use an echo-bot loopback and battery calls, n ≥ 30-60.
4. **A pause-aware release policy** reaching ≤5% cut-ins at p50 ≤ 1.2 s, including the elderly 2.4 s pause and a silence-timer continuer (a gated "जी?" after about 2 s of VAD speech with no final).
5. **Hinglish short-reply and backchannel lists, and a turn classifier.** Close with a VP-vs-incumbent battery (W4).
6. **S2S gate violation rate** on a battery of 200 or more attack turns (V3).
7. **Does Gemini 3.8 Live keep affective behaviour** now that the config field's status conflicts across docs?
8. **Speaking-rate control and an expressive-tag listener check.**
9. **A blind listener panel against human telecaller references**, including a 50+ group. Measure the "person or AI?" detection rate.
10. **Production failover:** a disclosed same-voice fallback, a graceful end, or a retry?
11. **Inworld and self-host quality and latency.** These are the only paths to ₹2.
12. **Re-price the tiers after the default stack is chosen** (`open.2026-10-20.reprice-tiers`).
