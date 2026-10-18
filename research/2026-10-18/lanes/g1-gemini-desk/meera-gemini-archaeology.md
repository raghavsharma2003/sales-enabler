# Meera/Maya on Gemini: code archaeology and the origin of "~₹1.3 per minute"

Lane g1-gemini-desk, 2026-10-18. Read-only work. Files were read with `git show <branch>:<path>`; no worktree was needed
and nothing was checked out or modified. Repos:

- `/home/user/html-portfolio`, three branches:

  | branch | head | date |
  |---|---|---|
  | `main` | 3a921798 | 2026-08-25 |
  | `origin/claude/ai-companion-app-rkt1lv` (Maya) | f4f78ade | 2026-10-14 |
  | `origin/codex/meera-forget-integrity-oct09` | 32f15233 | 2026-10-09 |

- `/home/user/sales-enabler/lib/voice/` (the Maya port).

## 1. The answer in one paragraph

**Where ₹1.3 comes from.** The owner's "~₹1.3 per minute" is Meera's `callcost-2026-08-23` figure of **$0.0142 per
typical minute** for live voice, converted to rupees.

**How that figure was made.**

- It was *computed* from list prices fetched from ai.google.dev on 2026-08-23. It was **not measured** from per-turn
  `usageMetadata`; the entry itself ranks "real usageMetadata per call" first among things still unmeasured.
- It used the **paid** list price, not the free tier. The real cash cost at the time was $0, because calls ran on a
  free-tier pool of about 48-51 AI Studio keys.
- It treated the 44.8k-character system instruction as billed **once per connection** ("per goAway rotation,
  ~$0.0105/rotation"), not once per turn. It did not model the documented per-turn re-billing of conversation history.

**Where it was restated.** "₹1.3/min COGS" appears in `market-sweep-2026-08` (committed 2026-08-25 11:56 UTC). That
document gives no derivation of its own. ₹1.3 equals $0.0142 at about ₹92 to the dollar: ₹1.22 at the entry's implied
~₹86, ₹1.35 at today's ₹95.

**What the documented rule implies instead** (computed). Today's docs say every turn re-bills the whole session context,
including the system instruction and all past audio. On that rule the same Meera configuration computes to:

| call length | ₹ per minute |
|---|---|
| 1 minute | 7.2 |
| 3 minutes | 9.1 |
| 10 minutes | 15.8 |

A lean 1.5k-token prompt computes to ₹2.7 a minute at 1 minute and ₹4.6 at 3 minutes. Whether the meter follows the
documentation is exactly what lane g2 measures.

## 2. What Meera's live call actually configured

Source: `src/voice/liveCall.ts`, around lines 3040-3120, and `api/live-token.js`. The values are identical on all three
branches.

| setting | value | where / note |
|---|---|---|
| model | `models/gemini-3.1-flash-live-preview` | `api/live-token.js` `LIVE_MODEL`. Pinned for the life of a call, and kept across goAway rotations. First committed by 2026-08-23 (65a4a557) |
| why this model | "The model IS the latency." Steady first-audio medians, measured in an established multi-turn session with the production prompt and VAD: 3.1-flash-live **1,550 ms (n=16)**; 2.5-native-audio-09-2025 **2,536 ms (n=21)**; 2.5-native-audio-12-2025 **3,298 ms (n=8)**; `-latest` 3-5.5 s. The interquartile range was about 120 ms for 3.1 against about 1,400 ms for 09-2025 | code comment, not a `context/` entry. **Vantage and date are not recorded**; it was the production client, probably the owner's device in India. Treat as low-confidence latency evidence |
| response modality | `["AUDIO"]` | |
| thinking | `thinkingConfig: { thinkingBudget: 0 }` | "thinking added seconds of dead air (measured 3-5.5 s vs ~0.9 s)". Today's docs say 3.1 uses `thinkingLevel`, with `minimal` as the default |
| voice | `prebuiltVoiceConfig.voiceName: "Despina"`, `languageCode: "hi-IN"` | an A/B without `languageCode` (n=5 each) showed no consistent prosodic gain. The voiceConfig declaration itself bills +201 audio prompt tokens per turn (`watchcost-measured`) |
| affective dialog | not set | the server closed with 1007 "Unknown name enableAffectiveDialog" on v1alpha. Today's docs say it is unsupported on 3.1 |
| proactivity | accepted per the code comment; not set in the setup | 3.1 docs: proactive audio not supported |
| system instruction | about 70 KB setup frame; persona about 44.8k characters | `callcost-2026-08-23`: "44.8k-char system instruction". Our estimate is about 12-14k text tokens |
| transcription | `inputAudioTranscription: {}`, `outputAudioTranscription: {}` | billed at the text output rate |
| VAD | automatic; `END_SENSITIVITY_HIGH`, `silenceDurationMs: 300`, `prefixPaddingMs: 60`; start sensitivity unset (LOW and HIGH measured identical, 14 sessions) | about 550 ms total commit with the client's 250 ms hangover |
| compression | `contextWindowCompression: { slidingWindow: {} }`, defaults | the default trigger is 80% of 131k, about 104.9k tokens, so it **never fires in a normal call**; it only lifts the 15-minute cap |
| session resumption | **not configured** | on `goAway` the client rotates to a fresh session on the same model and voice, with no recap. That is up to `MAX_ROTATES = 6`, mirrored in the Android `LiveWatchEngine.java`. "The new session is a NEW session and has none of the conversation in it." Rotation therefore *resets* the compounding cost, and the call's memory with it |
| context refill | silent `clientContent` notes with `turnComplete:false` re-inject dropped context | |
| audio | uplink 16 kHz PCM (`audio/pcm;rate=16000`); downlink 24 kHz | |
| auth | ephemeral token from `/api/live-token`: `uses: 1`, `expireTime` +30 min, `newSessionExpireTime` +9 min, minted early during ring | |
| keys | `withGeminiKey` rotates a **free AI Studio key pool** (about 48-51 labelled keys, `api/_gkeys.js`). A paid key lane exists behind `PAID_LANE`, **off** | `context/decisions.md` paid-lane decision, 2026-08-25 |
| fallback | cascade on `gemini-3.1-flash-tts-preview` (Despina) when Live fails | |

**Lifecycle risk.** Two of Meera's three Gemini voice models have an announced earliest shutdown of **2026-11-17**,
30 days from today: the live model `gemini-3.1-flash-live-preview` and the TTS model `gemini-3.1-flash-tts-preview`
(<https://ai.google.dev/gemini-api/docs/deprecations>). The recommended replacements are `gemini-3.8-live` and
`gemini-3.8-flash(-lite)-tts`.

## 3. The sales-enabler port (`lib/voice/`)

| setting | value |
|---|---|
| profile | `MAYA_VOICE_PROFILE` (`lib/voice/maya/profile.ts`): provider gemini, preset Despina, liveModel `gemini-3.1-flash-live-preview`, cascadeTtsModel `gemini-3.1-flash-tts-preview`, languageCode `hi-IN` |
| setup actually sent (`lib/voice/server.ts` `connectGemini`) | model = `MAYA_GEMINI_MODEL` or `gemini-3.1-flash-live-preview` for the Maya profile; otherwise `GEMINI_LIVE_MODEL` or **`gemini-3.8-live`** |
| | `responseModalities: ["AUDIO"]`; voice Despina (Maya) or `GEMINI_LIVE_VOICE` or `Kore` |
| | **no `languageCode`** in the setup, even though the profile names `hi-IN` |
| | **no thinking config** |
| | input and output transcription on; optional function declarations |
| | **no `contextWindowCompression`**, so the hard cap is 15 minutes |
| | **no `sessionResumption`** |
| token | setup locked inside a constrained ephemeral token: `uses: 1`, `newSessionExpireTime` +60 s, **`expireTime` +11 min**. Calls longer than about 11 minutes, or past the roughly 10-minute connection lifetime, end with no rotation path |
| keys | the Maya profile **rotates a free Google key pool** (`activeMayaGoogleKeyEntries`, 60 s cooldown on 429). This is the free-tier rotation that the 2026-10-18 brief §0 rejects. Non-Maya profiles use a single `GEMINI_API_KEY` |

## 4. Every cost number Meera logged about Gemini Live

All entries are from `context/measurements.md` on `origin/claude/ai-companion-app-rkt1lv`. The text is identical on the
other two branches.

| entry (date) | number | method | n | free or paid price | does it model per-turn re-billing? |
|---|---|---|---|---|---|
| `callcost-2026-08-23` | live voice **$0.0142 per typical minute**; cascade $0.0289; live + screen share $0.0374; 30 min a day for a month is $13 (Rs 1,096, implied FX about ₹84-86) | computed from "lane constants read from the shipping code" and prices fetched from ai.google.dev on 2026-08-23. Bands are her talk share 0.25/0.39/0.55. The calc script lived in an ephemeral scratchpad and is **lost** | 0 calls | **paid list**; "Today-cost $0 until the free pool's daily budget exhausts" | **No.** The system instruction is "billed per cascade TURN and per goAway rotation (~$0.0105/rotation)". Our reconstruction of non-compounding arithmetic gives $0.0134 a minute, within 6% |
| `cache-plateau` (2026-08-25) | "live 10-min call ≈ $0.13, cacheable share ~8%" ($0.013 a minute) | "list-price sizing, no calls" | 0 | paid list | No |
| `market-sweep-2026-08` (2026-08-25 11:56 UTC) | "vs our ₹1.3/min COGS" | restatement; `docs/research/market-sweep-2026-08-25.md` contains no derivation | n/a | paid list (inherited) | No |
| `watchcost-measured` (2026-08-25 12:20 UTC, after the sweep) | screen-share mode **₹1.1-1.6 a minute**; video about 30 tokens a frame (n=133 frames); burst frames collapse; audio input about 9 tokens a second for room tone and about 23 for speech-like synthetic audio; **+201 AUDIO prompt tokens per turn from voiceConfig** (n=3) | about 25 real sessions on the **paid key**, real `usageMetadata`, production config byte-matched, synthetic audio. Spend under $1 | about 25 sessions | paid | **Partly.** It measured real usage, but "persona text amortized, not live-probed" and "sliding-window behavior over a full 10-min call untested". The system-prompt-per-turn question was not probed |

**How the measured input rates square with the docs** (our inference): about 9 tokens a second for room tone and about 23
for speech, against the documented 25 tokens a second. This fits the 3.1 default turn coverage, under which only speech
activity enters the turn. It does not by itself show whether history is re-billed.

## 5. What this means for V1 (the Maya cost claim)

- **Not reproducible as a measurement.** The ₹1.3 figure is a list-price computation with no per-turn `usageMetadata`
  behind it.
- **Computed under a billing model the docs now contradict.** The docs say history is re-billed per turn, and they print
  the same rule on the Agent Platform pricing page. We cannot see whether the rule was documented in August 2026: the
  Wayback Machine and Common Crawl are blocked from this sandbox.
- **Even taken at face value, ₹1.3 fails the brief's AI budget.** At ₹2 a minute, after GST, telephony of ₹0.38-0.48 and a
  40-60% margin, the allowed AI cost is about ₹0.2-0.8 a minute (computed in `findings.md`).
- **It was paid-price arithmetic for a free-pool product.** Meera's real cash cost was $0. The paid lane was never turned
  on, so there is no Google invoice to reconcile against.
- **What would settle it.**
  - Lane g2's per-turn `promptTokenCount` growth on 1-, 3-, 5- and 10-minute scripted calls, with compression off and on.
  - With owner consent, the aggregate Meera Neon query (call durations only; brief §4). This lane did not run it, because
    consent has not been given.

## 6. Latency evidence inherited (vantage unrecorded, low confidence)

| source | stack | metric | value | n | vantage |
|---|---|---|---|---|---|
| `api/live-token.js` comment (≤ 2026-08-23) | gemini-3.1-flash-live-preview, full prompt, production VAD | end of user speech to first audio chunk, median | 1,550 ms (IQR about 120 ms) | 16 | not recorded (production client) |
| same | gemini-2.5-flash-native-audio-preview-09-2025 | same | 2,536 ms (IQR about 1,400 ms) | 21 | not recorded |
| same | gemini-2.5-flash-native-audio-preview-12-2025 | same | 3,298 ms | 8 | not recorded |
| `rejected.md` `realtime-azure` (2026-08-11) | the then-incumbent Gemini Live lane | steady first-audio median | 1,370 ms | not stated (9 sessions / 72 turns were the Azure arm) | not recorded |
