# Voice lab round 1 review, and the round-2 system (2026-10-20)

## What round 1 measured (lab VM data, pulled 2026-10-20)

- **Volume:** 65 real calls (54 browser, 11 real phone calls over Plivo) from 4 testers, and 33 rated calls (20 Raghav, 13 Aryan).
- **Small n:** n is 1–4 ratings per stack, so the ranking is indicative only.

| Stack | n | Overall /10 | Voice /5 | Emotion /5 | Talk /5 | Would pick |
|---|---|---|---|---|---|---|
| Gemini 3.1 Live (Despina, speech-to-speech) | 2 | 7.0 | 3.5 | 4.0 | 4.0 | 2/2 |
| Sarvam speech + gpt-oss + Bulbul | 2 | 6.0 | 2.5 | 2.5 | 3.0 | 0/2 |
| Gemini 3.8 Live | 1 | 6.0 | 3.0 | 3.0 | 2.0 | 0/1 |
| gpt-oss + Gemini voice | 3 | 6.0 | 2.7 | 2.7 | 3.0 | 0/3 |
| Asha's stack (gpt-4o-transcribe + GPT-4.1 + DragonHD) | 1 | 6.0 | 3.0 | 3.0 | 3.0 | 0/1 |
| All-Gemini | 2 | 5.5 | 3.0 | 3.5 | 3.5 | 0/2 |
| … all Azure-voice stacks | 2 each | 1.5–4.5 | 1.0–2.0 | 1.0–2.0 | 2.0–3.0 | 0 |

**What testers said, in their own notes.** The themes were:
- robotic, slow and flat;
- "keeps repeating the same thing", "mai samajh sakti hu";
- no breathing, humming or modulation;
- the accent changing mid-sentence on Azure multilingual voices;
- not listening while she talks;
- "she says 'say in a warm tone' out loud";
- "called me Riya / Diya".

### Measured robotic signature (316 of her turns, renewal scenario)

| Measure | Value |
|---|---|
| Turns ending on a question | 53% |
| Turns mentioning the link, callback or advisor | 19% |
| Words per turn | median 22, p90 37 |
| Turns re-stating "I'm an AI assistant" | 21% |

### Reply gap from the caller's end of speech (server-side medians)

| Stacks | Median gap |
|---|---|
| Azure-voice cascades | 0.95–1.4 s |
| Gemini-voice cascades | 2.4–2.8 s (Gemini TTS first audio was 0.84–1.16 s of that) |
| Asha | 4.9 s |

Browser-measured, the median was 1.74 s (n=199 replies).

### Bugs found

1. **The Gemini TTS style prefix was spoken.** Gemini 3.8 TTS reads its text verbatim, so `Say in a {style} tone:` was read aloud. The g5 check had said it wasn't; that was wrong on real Hindi lines.
2. **The caller's name was invented.** The brief never gave the policyholder's name, so brains invented one ("Diya"), or took the agent's own name.
3. **Memory was polluted.** Per-tester memory accumulated the brief's facts, contradictions and gender errors, and was re-injected on every call.
4. **"Speak faster" had no effect.** There is no rate control in the pipeline.

## Why every brain sounded robotic: the brief

Meera/Maya measured three laws (from html-portfolio `context/`):
- quoted text gets recited;
- position is mechanism: a rule mid-brief fired 0/8, the same rule appended last fired 8/8;
- a brief alone repeats itself, so state must be tracked in code.

The v1 brief broke all three:
- the agenda had no state;
- humanness rules sat mid-brief;
- about a dozen instructions asked questions;
- empathy was phrased as labels.

**Brief v2** (`voicelab/server/persona_v2.py`) contains:
- shapes, not lines;
- react first, then a view before any question; empathy shown, never named;
- a business-friendly spoken register;
- the counts and goal check last;
- an **agenda ledger** derived in code from the transcript each turn: what's already said, offers and their outcomes, wrong numbers from the caller, recent laughter, whether they sound ready to finish;
- her own **hang-up** (`<end_call>` / an `end_call` tool, honoured only after a real goodbye and not straight after a question; on a call she also waits 1.5 s and stays on if the caller speaks);
- a cleaner preference-only memory.

## Text bake-off (`voicelab/evals/convo_bench.py`)

**Setup:**
- 6 simulated callers: busy, skeptic/joker, worried elder, chatty, angry, confused.
- The caller simulator is GPT-4.1. Each call runs 10 turns, so each brain holds 6 calls.
- Every pair of brains is judged blind by two judges from different families, GPT-4.1 and Gemini 3.8 Flash. That is 540 verdicts in total.
- First-token times in this table are from the US sandbox.

### v1 → v2 brief, same brains (gpt-4.1-mini, gemini-3.5-flash-lite)

| Measure | v1 | v2 |
|---|---|---|
| Words per turn | 33.7 / 32.7 | 20.9 / 18.7 |
| Turns ending on a question | 62% / 76% | 13% / 29% |
| Stock phrases per call | 1.8 / 2.7 | 0.7 / 0 |
| Agenda turns (flash-lite) | 100% | 51% |

Head-to-head, the judges split. v2 won busy, chatty and skeptic callers; v1 won worried, angry and confused callers, because it gave more concrete answers. The fix was "concrete facts are the kind thing" for worried or confused callers, and Hindi script and the feminine rule moved back to the top. Romanised Hindi had crept in when the script rule was moved mid-brief.

### Brains on v2: win rate per judge (%)

| Brain | GPT-4.1 judge | Gemini judge | Words/turn | Agenda turns | Question end |
|---|---|---|---|---|---|
| Gemini 3.8 Flash | **65** | **75** | 25.9 | 0.69 | 0.29 |
| DeepSeek V4.1 Flash | 57 | 76 | 24.2 | 0.80 | 0.17 (romanised Hindi 4/call) |
| Gemini 3.6 Flash | 48 | 77 | 27.9 | 0.80 | 0.28 |
| Gemini 3.5 Flash-Lite | 52 | 61 | 18.7 | 0.48 | 0.11 |
| GPT-5.4 mini | 59 | 48 | 26.4 | 0.77 | 0.19 |
| GPT-5.6 Sol | 61 | 43 | 21.4 | 0.58 | 0.17 |
| GPT-5.6 Terra | 44 | 38 | 21.8 | 0.63 | 0.17 |
| GPT-6 Sol | 39 | 28 | 23.8 | 0.69 | 0.22 |
| GPT-4.1 mini | 46 | 25 | 24.6 | 0.69 | 0.13 |
| GPT-6 Luna | **28** | **30** | 22.8 | 0.76 | 0.22 |

GPT-6 Luna ranked last or second-to-last with both judges. That matches Meera's earlier charm test, where GPT-5.6 Luna was clinical on crisis turns. Judges are a weaker signal than people: they rank, people decide.

## Latency from the India VM (n=5 each, v2 brief, median ms)

**Brain, time to first token:**

| Brain | ms |
|---|---|
| gpt-oss@groq | 535 |
| GPT-4.1 mini (India) | 567 |
| Gemini 3.5 Flash-Lite | 699 |
| GPT-5.4 mini | 960 |
| Gemini 3.6 Flash (p90 13.3 s) | 1102 |
| GPT-5.6 Sol (via OpenRouter) | 1174 |
| GPT-6 Luna (via OpenRouter) | 1438 |
| GPT-5.6 Terra (via OpenRouter) | 1604 |
| GPT-6 Sol (via OpenRouter) | 1739 |
| Gemini 3.8 Flash (thinking can't go below "low") | 1991 |
| DeepSeek V4.1 Flash | 2800 |

**Voice, time to first audio:**

| Voice path | ms |
|---|---|
| Azure MAI-Voice-2.1-Flash | 425 |
| Gemini 3.8 Flash-Lite TTS, streamGenerateContent | 624 |
| Gemini 3.8 Flash TTS, streamGenerateContent | 772 |
| Gemini 3.8 TTS via the Interactions API | 4,700–5,100 |

The Interactions API is the only documented way to give 3.8 TTS a style (`speech_metadata`) and 8 kHz μ-law. A sandbox check confirmed that `<chuckle>`/`<breath>` tags and style are *not* spoken there, but at 5 s it can't be used live.

**Round-2 smoke from India (server reply gap):**

| Stack | Reply gap |
|---|---|
| v2-live (Gemini 3.8 Live) | 0.79–1.55 s |
| v2-flashlite | 1.6–2.2 s |
| v2-54mini | 2.0–2.6 s |
| v2-luna | 1.9–3.3 s |
| v2-38flash | 2.9–4.2 s |

## Round-2 stacks (live in the lab's blind tour)

| id | Ears | Brain | Voice | Why it's in |
|---|---|---|---|---|
| v2-live | Gemini 3.8 Live (native) | Gemini 3.8 Live, with the ledger fed as silent context notes and an `end_call` tool | Despina, native audio | Best-rated in round 1 (3.1 Live); the judges' best brain family; fastest |
| v2-flashlite | Gemini transcribe-live | Gemini 3.5 Flash-Lite | Gemini 3.8 Flash-Lite TTS (Despina) | Owner's cascade shape with the fastest good brain |
| v2-54mini | same | GPT-5.4 mini (Azure) | same | OpenAI fast tier, judge-split |
| v2-38flash | same | Gemini 3.8 Flash | same | Best-judged brain, to hear the quality-vs-delay trade |
| v2-luna | same | GPT-6 Luna (OpenRouter) | same | Owner's pick, to confirm by ear |

## Not measured yet
- Any round-2 human rating.
- The reply gap at the handset on a real phone call.
- Whether Gemini 3.8 Live keeps "affective" behaviour now that the config field is gone.
- GPT-6 Luna from an Azure India deployment: the quota sits with Taxila's deployments, so it was reached through OpenRouter here.
