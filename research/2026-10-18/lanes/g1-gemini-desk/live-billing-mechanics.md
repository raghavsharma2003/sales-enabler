# Gemini Live API: billing and session mechanics (desk read, 2026-10-18)

Lane g1-gemini-desk. Method: read-primary. Every statement below is taken from a Google page fetched on 2026-10-18,
unless it is marked *computed* (our arithmetic) or *Meera-measured* (html-portfolio `context/measurements.md`).
Raw copies of the pages are in
`/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw-1018/g1-gemini-desk/`.

## 1. How a Live session is billed

**Each turn re-bills the whole context.** Source: <https://ai.google.dev/gemini-api/docs/live-api/best-practices#pricing-and-billing>.
The Agent Platform (formerly Vertex AI) pricing page prints the same rule.

> "The API charges you per turn for all tokens present in the session context window. A 'turn' is defined as one user
> input and the model's corresponding response."
> "Past tokens are re-processed and accounted for in each new turn, up to your configured context window size. As a
> session lengthens, the cost per turn increases because the conversational history is re-processed."
> "The API bills you for the accumulated native audio tokens at the standard audio input rate on every turn."

What this means:

- **History is kept as audio.** The model "retains conversational history as raw audio tokens", at 25 tokens per second
  of audio.
  - The agent's own past speech is billed once at the output rate ($12 per 1M tokens). It is then billed again on every
    later turn at the audio input rate ($3 per 1M tokens).
- **The system instruction is in the context window, so it is billed on every turn.** The docs do not exempt it, and
  "System instructions … will always remain" in the window after sliding-window eviction (API reference, SlidingWindow).
- **No caching discount.** The model cards for `gemini-3.1-flash-live-preview` and `gemini-3.8-live` list "Caching: Not
  supported", and so does the Agent Platform model page. `usageMetadata` does carry a `cachedContentTokenCount` field.
  g2 should check whether it is ever non-zero.
- **Transcription is billed on top.** When input or output transcription is on, "the API charges for all text tokens
  generated for transcription at the text token output rate" ($4.50 per 1M for 3.x Live; $2.00 for 2.5 native audio).
- **Proactive audio bills listening time.** When it is on, "the API charges for input tokens the entire time the Live API
  is listening, and charges for output tokens only when the API responds".
  - Proactive audio is **permanently on** in `gemini-3.8-live` and `-extended-thinking`. Setting `proactive_audio: false`
    returns an error.
  - It is **not supported** in `gemini-3.1-flash-live-preview`, "for this model, the API bills only for audio when you
    actively stream input".
- **Default turn coverage excludes silence.** For Gemini 3.1 and later the default is
  `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO`: "audio activity means speech and excludes silence". The user's silence
  therefore does not enter the turn on 3.1. Video frames all do.
- **A per-turn constant that is not documented** (Meera-measured, 2026-08-25, n=3, `gemini-3.1-flash-live-preview`):
  - Declaring `speechConfig.voiceConfig` added **+201 AUDIO prompt tokens on every turn**, with zero audio sent.
  - `languageCode` alone added 0.
  - At $3 per 1M tokens and 6 turns a minute this is about ₹0.34 a minute.
- **Published per-minute equivalents ignore compounding.** The pricing page prints "$3.00 or $0.005/min (audio)" input
  and "$12.00 or $0.018/min (audio)" output. That is 1,500 tokens a minute billed once. It is not the per-turn context
  re-billing above.

**Our formula** (computed). For a call of N turns, where S is the system-instruction text tokens, τ is the per-turn
constant, Uₖ and Aₖ are the user and agent audio tokens of turn k, and Hₖ is the retained history before turn k:

```
input_text_tokens  = N·S                                   (at $0.75/1M)
input_audio_tokens = Σk (τ + H(k-1) + Uk)                   (at $3/1M);  H grows by Uk+Ak per turn
output_audio       = Σk Ak                                  (at $12/1M)
output_text        = transcripts (+ thinking, if any)       (at $4.50/1M)
```

Without compression, H grows linearly, so cost per minute grows linearly with call length.

## 2. Context-window compression (sliding window)

Source: <https://ai.google.dev/api/live#contextwindowcompressionconfig> and the session-management guide.

- `contextWindowCompression: { slidingWindow: {} }` enables eviction of the oldest turns. The context always restarts at
  a user turn, and system instructions and `prefixTurns` are always kept.
- `triggerTokens` default: "80% of the model's context window limit". For the 131,072-token Live models that is about
  **104,858 tokens**.
- `targetTokens` default: `trigger_tokens/2`, about **52,429 tokens**.
- "Any compression operation will cause a temporary latency increase, so they should not be triggered frequently."
- The billing consequence: "The API then bills subsequent turns only for the retained history plus any new tokens." The
  docs' own example is a trigger of 25,000 and a target of 8,000.

**The default setting does almost nothing for cost** (computed).

- A 10-minute call with a 1.5k-token prompt reaches only about 13.7k tokens of context at 6 turns a minute. That is far
  below the default trigger.
- Even with the 3.8 proactive-listening upper bound (all listening time kept in context, about 1,500 tokens a minute
  input plus about 600 output), 10 minutes reaches only about 22k tokens.
- So `slidingWindow: {}` with defaults, which is exactly Meera's setting, mainly lifts the 15-minute session cap. It does
  not cap per-turn cost in calls under 15 minutes.
- To cap cost, `triggerTokens` must be set explicitly just above the system prompt. Example: trigger = S + 4k,
  target = S + 2k.
- A trigger below the system-prompt size evicts every past turn on every turn, so the agent forgets the call. A 12k-token
  persona with the 10k trigger in an early draft of our model did exactly this.

## 3. Session lifetime, connection lifetime, goAway, resumption

Sources: <https://ai.google.dev/gemini-api/docs/live-api/session-management> and
<https://ai.google.dev/gemini-api/docs/live-api/capabilities#limitations>.

| item | documented value |
|---|---|
| audio-only session without compression | 15 minutes |
| audio + video session without compression | 2 minutes |
| with compression | "unlimited" |
| connection (WebSocket) lifetime | "around 10 minutes"; the session ends with it unless resumption is configured |
| `GoAway` | sent before the connection ends; carries `timeLeft`, which "will never be less than a model-specific minimum" |
| session resumption | `sessionResumption: {handle}`. The server sends `SessionResumptionUpdate{newHandle, resumable}`. `resumable=false` while generating or executing function calls |
| resumption handle validity | "valid for 2 hr after the last sessions termination" (Gemini API). The Agent Platform zero-data-retention page says resumption caches text, audio and video prompt data and outputs for up to 24 hours |
| context window | 128k tokens for native-audio models (131,072 per `models.list`); 32k for other Live models |
| ephemeral tokens | defaults: 1 minute to start a session (`newSessionExpireTime`), 30 minutes to send (`expireTime`), `uses: 1` |

**Billing consequences** (computed; not documented explicitly):

- **Resumption keeps compounding.** A resumed session keeps its context, so per-turn re-billing continues across
  connections.
- **A fresh session resets cost and memory together.** A new session without resumption, as in Meera's goAway rotation,
  starts with only the system instruction. Re-billing restarts, and the call loses its memory.

## 4. Audio formats and voice activity detection

- **Input.** Raw 16-bit little-endian PCM, native 16 kHz. Other rates are resampled if the MIME type states them
  (`audio/pcm;rate=16000`). Send 20-40 ms chunks; do not buffer about 1 s.
- **Output.** Always 24 kHz 16-bit PCM.
- **Automatic VAD.**
  - `silenceDurationMs`: the "server's internal default is approximately 800ms". 500-800 ms is recommended. Below
    100-200 ms, utterances fragment and quality drops.
  - `startOfSpeechSensitivity` defaults to HIGH.
  - With manual VAD, the server adds no pre-speech buffer and no silence tolerance.
- **Meera's VAD and barge-in settings.**
  - Meera ran `silenceDurationMs: 300`, `END_SENSITIVITY_HIGH` and `prefixPaddingMs: 60`, with about 250 ms of
    client-side hangover. That is below Google's recommended range.
  - A Meera code comment (`src/voice/liveCall.ts`, not a `context/` entry) says `startOfSpeechSensitivity` LOW versus HIGH
    made no difference to barge-in (14 sessions).

## 5. Feature availability by model (Gemini API docs, 2026-10-18)

| feature | gemini-3.8-live | gemini-3.8-live-extended-thinking | gemini-3.1-flash-live-preview | gemini-2.5-flash-native-audio-preview-12-2025 |
|---|---|---|---|---|
| status | GA 2026-09-15; "default option" | GA 2026-09-15 | **legacy preview**; earliest shutdown **2026-11-17** | preview; earliest shutdown **2026-11-17** |
| response modality | AUDIO only ("Audio is the supported response modality") | AUDIO | AUDIO (native-audio models "only support AUDIO response modality") | AUDIO |
| text out | only via `outputAudioTranscription` | same | same | same |
| thinking | interleaved; `thinkingLevel` not supported (omit it) | `thinkingLevel` low, medium or high (`minimal` not supported) | `thinkingLevel` minimal, low, medium or high; default `minimal` | `thinkingBudget` |
| proactive audio | permanently on; billed for listening time | permanently on | **not supported** | supported (v1beta) |
| affective dialog | "removed from the API" (Gemini API migration note). **Conflict:** the Agent Platform Live overview lists "Affective dialog" for `gemini-3.8-live` | n/a | **not supported** | supported (v1beta `enable_affective_dialog`) |
| async function calling | default (`NON_BLOCKING`); scheduling supported | async only | **not supported** (blocking) | supported |
| turn coverage default | audio activity + all video | same | same | `TURN_INCLUDES_ONLY_ACTIVITY` |
| caching | not supported | not supported | not supported | n/a |
| price per 1M (text in / audio in / text out / audio out) | 0.75 / 3.00 / 4.50 / 12.00 | same | same | 0.50 / 3.00 / 2.00 / 12.00 |

**Quirk in `models.list`** (API response, 2026-10-18, GEMINI_TEST_KEY):

- `gemini-3.8-live` and `gemini-3.8-live-extended-thinking` both report `version: "3.1-flash-live-03-2026"`. That is the
  same version string as `gemini-3.1-flash-live-preview`.
- This may be a metadata copy, or 3.8 Live may be a promoted 3.1 Flash Live. It is unverified and worth one A/B
  listen-and-latency check by g2.

**What the "AUDIO only" rule means for V3 hybrids.**

- "Live in text mode followed by expressive TTS" is not available on the native-audio Live models. The text arrives only
  as `outputAudioTranscription`.
- The old half-cascade Live models that supported a TEXT response are shut down: `gemini-2.0-flash-live-001` and
  `gemini-live-2.5-flash-preview`, on 2025-12-09.
- A gated-text hybrid therefore needs either a separate text LLM or the transcript stream from a Live session whose audio
  is discarded. In the second case the audio output tokens are still billed.

## 6. Usage metadata (for g2's token-exact accounting)

The Live server messages carry `usageMetadata` (<https://ai.google.dev/api/live#usagemetadata>), with these fields:

- `promptTokenCount`
- `cachedContentTokenCount`
- `responseTokenCount`
- `toolUsePromptTokenCount`
- `thoughtsTokenCount`
- `totalTokenCount`
- the per-modality arrays `promptTokensDetails[]`, `cacheTokensDetails[]`, `responseTokensDetails[]` and
  `toolUsePromptTokensDetails[]`

If per-turn re-billing is real, `promptTokenCount` per turn should grow by about the previous turn's (user + agent)
audio tokens and include S every turn. That is the single observation that settles V1.

## 7. Computed cost per minute under the documented rule

The script is `live_cost_model.py`, and its full grid of 720 rows is in `live_cost_model.csv`.

**Assumptions:**

- 6 turns a minute.
- User speaks 35% of wall-clock time; agent speaks 40%.
- 25 audio tokens a second, and 175 transcript tokens per speech-minute.
- Per-turn constant τ = 201.
- FX ₹95 to the dollar.
- Prices are Standard paid, and the same for `gemini-3.1-flash-live-preview` and `gemini-3.8-live`.

**₹ per connected minute of AI cost** (computed; not measured):

| prompt profile | compression | 1 min | 3 min | 5 min | 10 min |
|---|---|---|---|---|---|
| lean, 1.5k-token prompt | none, or `slidingWindow:{}` defaults | 2.68 | 4.60 | 6.52 | 11.33 |
| lean, 1.5k-token prompt | history ≤ 4k (trigger S+4k, target S+2k) | 2.68 | 4.60 | 5.47 | 6.04 |
| lean, no voiceConfig constant | none | 2.33 | 4.26 | 6.18 | 10.99 |
| Meera-size, 12k-token prompt | none, or defaults (Meera's setting) | 7.17 | 9.09 | 11.01 | 15.82 |
| Meera-size, 12k-token prompt | history ≤ 4k | 7.17 | 9.09 | 9.95 | 10.53 |
| lean, 3.8 Live, listening billed (proactive) | none | 2.78 | 4.71 | 6.63 | 11.44 |
| lean, 3.8 Live, listening kept in context (upper bound) | none | 3.05 | 5.62 | 8.18 | 14.59 |

**Sensitivity:**

- **Turn rate.** 4 turns a minute gives 2.03 to 7.80 across 1-10 minutes. 10 turns a minute gives 3.97 to 18.40.
- **Talk share.**
  - u = 0.25, a = 0.25 gives 2.09 to 7.86.
  - u = 0.30, a = 0.55 gives 3.03 to 12.84.
- **2.5 native audio** (cheaper text rates) gives 2.43 to 11.09.

**For comparison, the non-compounding arithmetic Meera used** (our reconstruction): about $0.0134 a minute, or ₹1.27 at
₹95, flat with call length.

**The uncertainty that matters most.** These figures assume that Google's actual metering follows the documented
per-turn rule. If `usageMetadata` shows `promptTokenCount` not growing turn over turn, the true cost is near the flat
₹1.2-1.4 a minute. g2's measurement decides which. Until then, budget on the documented rule.
