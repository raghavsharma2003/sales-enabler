# Voice lab smoke results from the India VM (2026-10-19)

**Method.** A headless caller (`voicelab/tests/sim_caller.py`) ran on the lab VM (Central India) against the lab
server. It played 3 synthetic Hinglish caller turns from the g5 battery (persona P1, Neha). Each call was one
renewal scenario. Values are the server-side reply gap: from the caller's end of speech (Silero VAD) to the agent's
first audio leaving the server. Browser and network time is not included; locally the browser measured about 80 ms
more. n is one call per stack, about 2–3 replies each. **These are smoke numbers, not a benchmark.**

## Reply gap per stack (ms), cost of that call

| Stack | Reply gaps (ms) | ₹/min on that call | Where the time goes (medians) |
|---|---|---|---|
| Base: gated Gemini STT + gpt-oss (Groq) + Azure Swara | 490, 875, 907 | 1.83 (short call, opening included) | STT 456, brain 330, voice 54 |
| Base, ungated | 636, 862, 1083 | 1.48 | STT 451, brain 322, voice 38 |
| All-Azure gated (GPT-4.1 mini India) | 1174, 1367, 1424 | 1.23 | STT 590, brain 722, voice 30 |
| All-Azure full stream | 1472, 1712 | 2.27 | STT 587, brain 787, voice 29 |
| Base + Azure HD | 995, 1525 | 0.99 | brain 881, voice 165 |
| Azure STT + GPT-4.1 mini + Azure HD | 1130, 1477 | 2.75 | voice 164 |
| Gemini STT + 3.5 Flash-Lite + Azure | 1201, 1253 | 1.26 | brain 1001 |
| Gated + gpt-oss + Gemini voice (after the TTS fix) | 3187, 2177 | 0.63 | Gemini TTS first audio |
| All-Gemini (after the TTS fix) | 2184, 2553, 2352 | 1.64 | Gemini TTS first audio |
| gpt-realtime-mini (semantic VAD medium) | 2608, 2665, 2354 | 1.76 | model's own turn detection |
| Gemini 3.1 Live (Maya) | 1601, 1640, 1644 | 2.61 | — |
| Gemini 3.8 Live | 1863, 2086, 9794 | 2.58 | one long wait for the caller |
| Asha-style (gpt-4o-transcribe + GPT-4.1 + DragonHD) | 1231, 2064, 2871 | 2.64 | STT ~1071, brain ~1741 |
| MAI-Voice emotional (GPT-4.1 mini) | 1839, 1520, 1571 | 1.21 | — |
| Maya-voice cascade (3.5 Flash-Lite + Gemini TTS + notes) | 2600, 3086, 3161 | 1.21 | Gemini TTS first audio |
| Base with gpt-chat-latest as brain | 2796, 2334 | 2.18 | premium brain |

## Fixed during the smoke run

- **Gemini TTS through the Interactions API with L16** did not stream progressively: first audio came after 3.8–4.9 s.
  Switching to `streamGenerateContent` (the path g5 measured) brought it to about 1–1.5 s.
- **Gemini 3.8 Flash as a brain** had a 2.6 s median time to first token, with thinking "low" as the minimum it
  accepts. It was replaced in the two new stacks.
- **Every brain agreed with the caller's wrong figure** for last year's premium (₹25,000 against the facts block's
  ₹16,900) until a correction rule was added to the final rules block. After the rule, every brain bench sample
  corrected the caller.

## Brain time to first token from India

Source: `brain-bench-india-2026-10-19.txt`. Six rounds, interleaved, renewal brief, 5 caller turns.

| Brain | Median time to first token (ms) |
|---|---|
| gpt-oss-120b on Groq | 483 |
| GPT-4.1 mini (South India, regional) | 641 |
| Gemini 3.5 Flash-Lite | 826 |
| Llama 4 Maverick | 1060 |
| gpt-oss-120b on Azure | 1466 |
| Gemini 3.6 Flash | 1496 |
| Mistral Medium 3.5 | 1508 |
| Kimi K2.6 | 1629 |
| GPT-4.1 | 1765 |
| Gemini 3.8 Flash | 2577 |
| Gemini 3.1 Flash-Lite | 2843 |

gpt-chat-latest rejected `temperature` on the first run. It was fixed and has not yet been benched.

## Sarvam stacks, added later on 2026-10-19 (owner's Sarvam key)

Same method as above, run from the India VM. "Sarvam speech + gpt-oss + Bulbul" had 2 calls; "All-Sarvam" had 3 calls
after the keep-alive fix (9 replies).

| Stack | Reply gaps (ms) | ₹/min on the call | Where the time goes (typical) |
|---|---|---|---|
| Sarvam speech + gpt-oss (Groq) + Bulbul v4 Flash | 1213, 2305, 1340, 2890 | 1.31–1.32 | STT ~700, brain 220–1879, voice ~250 |
| All-Sarvam: Saaras v4 + Sarvam-105B conversations + Bulbul v4 Flash | 1047, 1043, 1181, 1065, 1134, 968, 1108, 1102, 977 | 1.39–1.51 | STT ~700, brain ~100, voice ~230 |

- **Sarvam-105B** has the fastest time to first token measured in the lab, about 100 ms from India.
- **The voice is most of the cost.** Bulbul at ₹20 per 10K characters is ₹0.7–1.3 per minute of call.
- **One cold Bulbul socket** took 4.3 s to its first audio (5.1 s reply). A 25 s keep-alive and an immediate reopen
  after an interruption fixed it.
- **Both Sarvam-brain and gpt-oss calls repeated the caller's wrong "25,000 last year"** as if it were true, even with
  the correction rule. This is a brain-quality difference for the owner's ratings to capture.
