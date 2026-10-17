# Harvest: tx-voice (Taxila voice lanes: agent lane, ASR, duplex/barge-in, overflow, latency)

Repo: `/home/user/Taxila` (read-only; inspected through detached worktrees, now removed).
Branches: `origin/claude/r4-conversation`, `origin/claude/r4-duplex`, `origin/claude/r4-latency`.
Harvested 2026-10-15.

Every latency below is from Taxila's own `context/` files or result JSONs. Unless a line says otherwise, the speech was
**synthetic** (gpt-4o-mini-tts "child" voices, sometimes pitch-shifted) and the runs came from a **US container**. None of these
numbers comes from a real child on a real phone in India. Taxila marks this itself, and so does this report.

---

## 1. Summary

Taxila is an Azure-only Hindi/English voice tutor. These three branches are round 4/5 workstreams of it, and together they
hold the most carefully measured Azure voice-agent stack in the sibling repos:

- **A cascade voice lane**: streaming STT (`gpt-live-transcribe`), then a server "brain" (classify, reply, guards), then
  streaming Azure Speech DragonHD TTS in framed PCM/ADPCM. It has prefetch, speculation, TTS prewarm, hedged requests and
  429 overflow.
- **An LLM "agent lane"** (`server/agent/**`). One strict-JSON structured-output call per turn returns `say` (streamed first)
  plus actions. Code checks those actions; the model is never trusted. Her words are streamed clause by clause through a
  per-clause safety gate into TTS.
- **A duplex/barge-in stack** built in four generations (cascade pause-decide, D4 engine on gpt-live-transcribe, D4
  half-duplex, D5). D5 makes **Azure AI Voice Live the "ear only"**: server Live-Reference echo cancellation against a stereo
  channel of what the phone actually played, plus deep noise suppression, multilingual semantic VAD and hi-IN/en-IN
  transcription, with `create_response:false`. The cascade keeps the voice, so the safety predicate gates every word before
  it is heard.
- **Measured rejections** cover realtime speech-to-speech as the speaker, brevity-by-instruction, reply streaming,
  first-clause TTS, two parallel drafts, silence-gated turn-taking, Smart Turn, and the transcribers that hallucinate on
  silence (gpt-4o-transcribe, gpt-transcribe, MAI-1.5, Qwen3-ASR, zero-stt). The rejections are the most valuable part.

**End-to-end latency on the agent lane today** (n = 12 per arm, synthetic child, US→eastus2, 2026-10-15), from the child
stopping to her first byte: **p50 4832 ms / p90 6615 ms** plain, and **p50 4020 ms / p90 6347 ms** with the device's
partial-transcript prefetch. The floor is about 1.06 s of endpointing plus about 0.5 s of STT. **2.0 s was shown to be
unreachable at a 900 ms VAD silence.** A non-verbal continuer ("हम्म/अच्छा") cuts the perceived first sound by about
1.2 s p50 (n = 27–30).

For sales-enabler's voice agents, the reusable core is:

1. the D5 "Voice Live as ear, our LLM as voice" architecture, with Taxila's §5b per-minute cost model **for an enterprise
   calling SaaS**;
2. `server/azure.js`, with hedging, 429 overflow to a twin region and hot/background quota lanes;
3. the agent-lane pattern: say-first strict JSON, a streaming clause splitter, a per-clause gate, and actions checked by code;
4. the latency harnesses (`evals/latency/*`, `evals/duplex-2026-10/*`);
5. the rejection list.

---

## 2. Branches covered

All three were active on 2026-10-15. They share history and cross-merge through the `int/r5-rel14x` integration branches.

| branch | tip | date | what it is / how it differs |
|---|---|---|---|
| `claude/r4-latency` | `d99cae7f` | 2026-10-15 09:08 UTC | Stream 3 (latency). It adds what the others lack: `evals/latency/overflow-arm.mjs`, the agent end-to-end result JSONs (`docs/design/round5/results/latency/agent-e2e-{plain,prefetch}-2026-10-15.json`), two overflow-arm result JSONs, and the unmerged `context/inbox/r5-latency.json` (overflow arms, continuer-gate tuning). Its `server/agent/agent.js` is an **older** version: effort `low` default, no speculation, no picture-promise filter. |
| `claude/r4-conversation` | `0e24ecba` | 2026-10-15 09:27 UTC | Stream 4A (the agent lane). It is the most advanced `server/agent/agent.js`: `agentCallOf` (one canonical call builder with a sha256 key), `agentSpeculate`, `specWasteOf`, `withoutPicturePromise`, effort **none** by default, and the game lookup before she speaks. The tip commit ships speculation **off** (`TAXILA_AGENT_SPEC` defaults off: "its lead never beat classify"). It adds `tests/prod/agent-safety-probe.mjs` and `context/inbox/r5-agent-cohort.json` (overclaims, the first clause through `turn-audio`, the safety probe). Diff vs latency: 37 files, +669/−4210 (most of the minus is latency's result JSONs). |
| `claude/r4-duplex` | `381a9a3e` | 2026-10-15 09:26 UTC | Stream 4B (duplex). It merges `int/r5-rel142` (main's release 14.2: 429 overflow, safety fixes). It holds the D5 Voice Live lane (`server/duplex/voicelive.js`, `src/duplex/d5Stream.ts`, `d5Worklet.ts`, `live.ts`), the October duplex bake-off (`docs/research/duplex-2026-10/{BAKEOFF,RECOMMENDATION,LANDSCAPE,PERSONAPLEX}.md`, `evals/duplex-2026-10/*`), `context/inbox/r5-duplex.json` (owner phone-echo harness, D5/D4 numbers, half-duplex decisions), and tests `d5-voicelive-{client,server}`, `r5-duplex`, `r5-overflow`. Diff vs latency: 88 files, +3821/−5119. |

Merge bases: conversation and duplex share `838efda3`; duplex and latency share `102a3b02`. In practice r4-duplex is "main
plus D5", and the other two are "main plus their stream". Anyone porting code should take `agent.js` from r4-conversation,
the eval scripts and results from r4-latency, and `server/duplex/*` + `src/duplex/*` from r4-duplex.

---

## 3. Product (voice parts only)

- **Lesson voice lanes.** `cascade` (the default since 2026-10-02) and `realtime` (gpt-realtime-2.1, now a budgeted premium
  lane). Duplex modes run on top of cascade:
  - D4: the duplex engine on gpt-live-transcribe. It now runs **half-duplex** by default: the mic is gated while she plays.
  - D5: Voice Live as the ear, behind the owner cohort flag.
- **Two Teacher lanes.**
  - The "Director" lane: a code planner plus a reply model.
  - The "agent" lane: one LLM call per turn that plans and acts. It is pinned at lesson start by `TAXILA_TEACHER=agent` or
    the `TAXILA_TEACHER_AGENT_FOR` cohort of sha256 emails.
  - The agent lane is **off in production** (release 14.1: "The continuer and the agent lane are off"). It runs for the
    owner cohort and in the sim lab.
- **Turn transport.** `POST /api/lesson/turn-audio` folds the turn and its audio into one response: a JSON turn frame, then
  PCM/ADPCM frames with sample-exact clause and viseme events, then an end frame. This saves India round trips.
- **Acks.**
  - The "uptake echo": the child's own answer token said back, after classify, never on safety turns.
  - A non-verbal continuer: cohort only, gated by a positive lexical gate.
- **State: built and verified in harness. Not validated on real children or real phones.** The repeated open item is the
  owner's real-phone recorder.

---

## 4. Architecture and stack

- **Server:** plain JS ESM on Node, one router. **Client:** React 19 + TS; AudioWorklets for capture/VAD. **Database:** Neon
  Postgres. **Hosting:** Azure Container Apps `taxila-web` (eastus2, with India staging in southindia/centralindia).
- **Models (all Azure Direct):**

| role | deployment |
|---|---|
| reply | `taxila-fast` |
| agent | `taxila-gpt6` (gpt-6-sol, effort none) |
| classifier | `grok-4-1-fast-non-reasoning` |
| understanding note | a race of `grok` and `taxila-fast` |
| STT | `taxila-live-transcribe` (gpt-live-transcribe), with `gpt-4o-transcribe` for push-to-talk |
| TTS | Azure Speech DragonHD (`en-IN-Diya/Arjun/Meera:DragonHDLatestNeural`), falling back to gpt-4o-mini-tts |
| D5 ear | Voice Live centralindia, api-version `2026-07-15`, front-end model `gpt-4.1-mini`, `azure-speech` hi-IN,en-IN |

- **Turn pipeline (cascade + agent):**
  1. The device streams the mic to STT (WebSocket/WebRTC).
  2. The stable partial becomes a **prefetch**: `server/latency/perceive.js` runs classify, the understanding note and the
     speculative replies on the partial. The turn adopts them **only on byte-identical inputs** (fingerprint).
  3. When the turn arrives: `scanSafety`, then classify (which carries the model's distress read), then the agent call.
  4. The agent call streams. `sayDeltasOf` extracts the `say` field from the partial JSON, `clauseSplitter` cuts clauses,
     `clauseGate` checks each one, and each clause goes to TTS with one clause of lookahead.
  5. Actions (board, picture, game, pose_item) run after the full object arrives. The final line is re-checked, and a
     card-question `tail` is spoken after the streamed words.
- **D5 path:**
  1. The browser AudioWorklet `taxila-d5-stereo` interleaves mic (ch0) and **her played audio** (ch1) at 16 kHz in 20 ms
     frames of 1280 bytes.
  2. The server relay (`server/duplex/voicelive.js`) allowlists events both ways and keeps keys server-side. Guards: a
     90-minute maximum session and a 30 s idle limit. It never stores audio.
  3. Voice Live events go to the client duplex engine in the same event shape D4 uses.
  4. The engine decides the floor: duck, yield, resume on a continuer, or hold through a thinking pause.

---

## 5. Reusable assets

| asset | paths (branch) | maturity | reuse for | effort |
|---|---|---|---|---|
| **Voice Live "ear-only" relay**: stereo reference AEC, DNS, multilingual semantic VAD, hi/en ASR, `create_response:false`, event allowlist, billing/idle guards, clamped client silence | `server/duplex/voicelive.js`, `server/duplex/d5route.js`, `src/duplex/d5Stream.ts`, `src/duplex/d5Worklet.ts`, `src/duplex/d5Url.ts`, tests `tests/d5-voicelive-{client,server}.test.mjs` (r4-duplex) | tested (simulated harness, owner cohort) | voice-agent, omnichannel | adapt: for telephony, ch1 is the agent's own outbound TTS; ACS media streaming gives the mixed or unmixed legs |
| **Duplex bake-off + enterprise per-minute cost model**: 5 arms; echo/barge/continuer/EOT/CER scorer; Retail Prices API script | `docs/research/duplex-2026-10/BAKEOFF.md` (§5b = enterprise calling SaaS cost per minute), `RECOMMENDATION.md`, `LANDSCAPE.md`, `evals/duplex-2026-10/{assemble,arms-*,score,cost-per-minute}.mjs`, `smartturn_eval.py` (r4-duplex) | tested | voice-agent, analytics, eval-quality | drop-in (method and cost model); adapt the scenario set to sales calls |
| **Azure client with hedging, 429 overflow twin, content-filter detection, streaming SSE, usage/USD** | `server/azure.js` (`hedged`, `overflowFor`, `chatStream`, `isContentFilter`, `usdOf`), `server/lanes.js` (hot/background quota lanes, TPM table) (any branch; overflow fix only on r4-duplex / int/r5-rel142) | production | orchestration, voice-agent, chat-agent, infra-ops | adapt (strip Taxila deployment names) |
| **Agent-lane harness**: say-first strict JSON schema; one canonical call builder with a digest key; streamed `say` with a per-clause gate; code-checked actions; per-lesson USD/token budget that throws to a fallback lane | `server/agent/agent.js`, `prompt.js`, `tools.js`, `flags.js` (take from r4-conversation), `tests/r5-agent.test.mjs`, `tests/r5-agent-record.test.mjs` | tested (cohort, sim lab) | voice-agent, chat-agent, safety, orchestration | adapt (replace the teaching tools with CRM/calendar tools) |
| **Streaming speech module**: `clauseSplitter`, `sayDeltasOf` (pulls the `say` string out of streaming JSON), ordered TTS with lookahead, "no audio before the distress read" | `server/latency/speech-stream.js` (r4-latency/conversation) | tested | voice-agent | drop-in |
| **Prefetch/perceive on stable partials** (adopt only on identical fingerprint) and speculative replies keyed on the full reply input | `server/latency/perceive.js`, `server/latency/routes.js`, `server/brain/turn.js` | production (Director lane) | voice-agent | adapt |
| **Framed TTS v2 / turn-audio fold**: JSON header + PCM/ADPCM frames + sample-exact clause events + end frame; IMA ADPCM 4:1 for slow links | `server/voice/frames.js`, `server/routes/voice.js` (`turn-audio`, `streamParts`), `server/voice/adpcm.js`, `src/lesson/{ttsStream,adpcm,cascadeLink}.ts` | production | voice-agent, chat-agent (web voice widget) | adapt |
| **DragonHD streaming TTS** (SSML → raw PCM 24 kHz, WS variant, voice per character as config, fallback counted) | `server/voice/azureTts.js`, `azureTtsWs.js`, `voices.js`, `voice-switch.js`, `prewarm.js` | production | voice-agent | drop-in |
| **Ack/continuer gate**: uptake echo of the answer token, non-verbal continuer with absolute-refusal lexicon, never-two-running, fixed floor timing | `server/latency/ack.js`, `ackAudio.js` (r4-latency has the tuned gate) | tested (cohort) | voice-agent | adapt (the lexicon is child/lesson specific; the gate shape transfers) |
| **Duplex engine** (floor manager, EOT, echo skeleton, barge-in, backchannel, fan-in, speculator) and **half-duplex D4** | `server/duplex/*.js`, `src/duplex/{engine,engineRules,governor,turnPolicy,live,host,overlap}.ts` | tested (replays, sim) | voice-agent | adapt (large; take the rules, not the whole engine) |
| **Cascade barge-in pause-then-decide** (local onset duck to 0.2 at ~90 ms, pause, transcript decides; echo match by consonant skeleton across scripts) | `src/lesson/{cascadeLink,vad,floor}.ts`, `tests/voice-cascade.test.mjs` | production | voice-agent | adapt |
| **Latency harnesses** (child-stops→first-sound end to end, agent models first clause, overflow arm with paired bootstrap CIs, phone-profile start, region TTS TTFB, long-task probe) | `evals/latency/*.mjs` (`turn-e2e`, `agent-models`, `agent-json`, `overflow-arm`, `start-phone`, `tts-region`, `dhd-ttfb-region`, `longtask-probe`), `evals/cascade-latency.mjs`, `evals/relational-human/first-sound.mjs` (r4-latency) | tested | eval-quality, voice-agent | adapt |
| **Realtime bake-off / audio-in harness** (WS to `/openai/v1/realtime`, TTFA, VAD arms, barge-in) and WebRTC ephemeral-key probe | `evals/realtime-bakeoff.mjs`, `evals/realtime-audio-in.mjs`, `evals/webrtc/`, `server/voice/realtimeSession.js` | tested | voice-agent, eval-quality | drop-in |
| **Boot-warm** (build heavy tables before listen; slice kit normalisation one per event-loop turn; precompile Unicode regexes) | `server/boot-warm.js` | production | infra-ops | idea-only / adapt |
| **Agent-lane safety probe** (scripted disclosures and AI-denial/romance asks; asserts the safeguard move and digit-exact helplines) | `tests/prod/agent-safety-probe.mjs` (r4-conversation) | tested | safety, eval-quality | adapt (swap child-safety for enterprise compliance probes) |
| **STT bench learnings + keywords biasing** (live-transcribe `keywords`, a script-only prompt, non-speech hallucination probe) | `server/voice/stt.js`, `evals/stt-v3/`, `docs/research/voice/stt-v3/RECOMMENDATION.md` | tested | voice-agent | idea-only / adapt |

---

## 6. Measured lessons (with n, method, date)

### 6.1 End-to-end latency (child stops → her first sound)

| measurement | n | p50 / p90 | method, date |
|---|---|---|---|
| Agent lane, turn-audio, plain | 12 | **4832 / 6615 ms** (endpoint 1061, STT 479, server 4176) | `evals/latency/turn-e2e.mjs`, synthetic child, US→eastus2, `agent-e2e-plain-2026-10-15.json` |
| Agent lane, turn-audio, with device prefetch | 12 | **4020 / 6347 ms** (prefetch adopted 12/12; agent speculation hit **0/10**) | same, `agent-e2e-prefetch-2026-10-15.json` |
| Agent first clause from call start (in a real lesson route) | 24 | 1540 / 1808 ms; request→first PCM 3679 / 5011 | `r5a-ms-agent-first-clause-route`, 2026-10-15 |
| Agent model bake-off, first speakable clause | 30 each | gpt-6-sol (effort none, chat) **1475/2416**; taxila-fast 1726/2552; gpt-6-astra (responses, low) 2119/3129; gpt-6.1-sol 3294/9461; grok-4.1-fast spoke in only 9/30 (it made tool calls only) | `ms-r5-lat-agent-models-2026-10-14` |
| Director/cascade lane, live-transcribe | 20 | 3688 / 4452 ms (endpoint 1081, STT 508, director 1767, TTS 220) | `cascade-latency-live-transcribe-2026-10-04` |
| Cascade, first build → after speculation ×3 + prewarm | 8 per arm | 6365 → **4230 ms** (director 4417 → 2405) | `cascade-latency-2026-10-02` |
| Continuer as first sound | 27 vs 30 | 4165/5567 → **2938/5712 ms**, Δp50 −1227 [90% CI −1651, −622] | `ms-r5-lat-continuer-ab-2026-10-14` |
| Understanding note raced (grok ∥ taxila-fast) vs gpt6 | 30 per arm | note wait 716 → 176 ms p50; end to end Δ −64 ms, CI spans 0 | `ms-r5-lat-note-race-2026-10-14` |
| Realtime gpt-realtime-2.1, text in → first audio | 6 | 980–1007 ms; mini 736–1119 | `realtime-teacher-bakeoff-2026-10-02` |
| Realtime audio-in, commit → first audio | 1 session per arm | 893–2373 ms depending on VAD | `realtime-audio-in-2026-10-02` |
| Voice Live S2S (c) / gpt-realtime (d), first audio from true end | 66 | 1875–1948 / 1979–2026 ms p50 | BAKEOFF §2, 2026-10-11 |

**Hard floors.**
- The endpoint (true end → VAD stop) is **1.03–1.15 s at 900 ms silence in 32/32 turns**.
- STT completion adds 0.3–0.5 s.
- "2.0 s speech end → first sound is not reachable at 900 ms silence" (`cascade-2s-budget-unreachable-at-900ms`).
- The realtime voice-turn config cost is ~2.1–2.4 s.

### 6.2 Barge-in, echo, end-of-turn (BAKEOFF 2026-10-11)

All rows: 66 scenarios, a simulated phone loudspeaker, TTS child voices.

| arm | echo false barge-in | true barge-in | EOT p50 | thinking-pause cut-offs | CER mean |
|---|---|---|---|---|---|
| cascade, mic open | 66/66 | 0/12 | 1057 | 13/34 | 0.41 (clean) |
| own duplex engine, phone | 46/66 | 4/12 | 2980 | 7/34 | 0.87 |
| Voice Live S2S | 0/66 | 12/12 (p50 638–675 ms) | 1045 | 14/34 | 0.28 |
| Voice Live, AEC+DNS off | 63/66 | 7/12 | 1000 | 13/34 | 0.27 |
| gpt-realtime alone | 64/66 (and 66/66 at a −30 dB device-AEC residue) | 1/12 | 1029 | 15/34 | 0.46; transcripts came back in Urdu/Chinese/Korean script on short Hindi |
| **Voice Live ref-AEC front end (e)** | **0/66** | **12/12 (p50 616–658)** | **945** | 15/34 (absorbed by decide-late) | 0.32–0.37 |

**D5 on the owner phone-echo harness** (2026-10-14; simulated weak device AEC; 102 of her lines):
- 0/102 phantom transcripts, 0/102 phantom turns, 0/102 echo yields, 0/102 echo hushes;
- barge-in 12/12, stop ≤ 500 ms on 11/12 (p50 80 ms);
- continuer false yields 0/46;
- thinking-pause cut-offs 1/34;
- **end-of-turn p50 1480 ms: NOT MET against a 900 ms bar.** Voice Live returned **empty transcripts for 5/14 short closed
  answers**, for example "सात है ना" and "हाँ".

The old full-duplex D4 on the same harness produced phantom transcripts on 65/66 lines and echo yields on 48/66. D4
half-duplex produced 0 of each, but barge-in 0/12 by design and lone words heard 1/8.

**Continuers.** Voice Live stops for Hindi continuers 23/36; ठीक है stopped it 6/6. Its filler filter is English-only, so
the continuer list must be your own.

### 6.3 ASR

- gpt-live-transcribe:
  - **returns no logprobs** (0/5), so ASR confidence is null and the low-ASR gate is dead on that lane;
  - writes English words in Devanagari;
  - completes ~0.5 s after VAD stop;
  - its deltas complete ~0.3 s **before** speech_stopped. That gap is the basis of the prefetch.
- At least 24 concurrent sessions on a capacity-10 deployment held: 48/48, and 39/40 at K = 40 (`stt-live-concurrency-2026-10-04`).
- India: live STT commit→final was **753 ms on eastus2 vs 68 ms on MAI-Transcribe-2-stream in southindia** (n = 20). The
  taxila-fast TTFT was slower on the southindia account: 1227 vs 878 ms from Chennai. From Chennai, a lesson turn took
  2046 ms (all in-region) vs 1562 ms (eastus2) (`india-latency-2026-10-04`).
- Two-lane ASR evidence: lane L is live-transcribe + keywords, and lane G is Azure Fast hi+en. The turn grades only when
  both agree, and safety runs on the union (`asr-two-lane-evidence`).
- Spoken Hindi numbers: voice grading got 51 correct verdicts vs 77 on text (n = 32). `numbersIn("बारह सौ")` returned [100]
  (`ms-r141-voice-grading-hindi-numbers`). Number parsing in Hindi is a real defect class.

### 6.4 Overflow / throttling (429)

All arms: the eastus2 host stubbed to an instant 429, the southindia twin answering for real, n = 20 per arm, paired
bootstrap CIs.

- Reply lane:
  - whole-reply p50 rose by **+988 ms** [636, 1323], with 20/20 answered (before the overflow, the child heard a fallback line);
  - after the review fix: **+747 ms** [449, 1267];
  - southindia calls fell from 31 to 20 per 20 replies once hedge twins stopped doubling onto the overflow.
- Agent first clause: +319 ms [235, 524] at 07:45 UTC, but **+868 ms** [649, 1029] at 08:20 UTC. The twin's latency varies
  by the hour, so plan for +0.3 to +0.9 s.

### 6.5 Agent lane quality

- **Effort none vs low** (sim lab, n = 64 per arm): judges tied 29:30 and 31:29; rubric within noise. With none:
  dead ends 4 vs 13, about 1 s faster at p50, fallbacks 14 vs 43. **Effort none is the default.**
- **Smoke** (4 personas × 8 turns): 0 fallbacks, 0 HTTP errors.
- **Safety probe:** 81/81 (8 lessons, 29 turns). Every disclosure took the Director safeguard, and helplines were digit-exact.
- **Overclaims** ("understood" claimed without evidence): 64 → 37 after the code-side earned-read rule (Director: 30).
  Code-enforced evidence rules work; prompt rules alone did not.
- **Speculation of the agent call on the prefetched turn:** **0/10 hits**, so it ships off. Even after the ASR-confidence
  number was removed from the event, its lead "never beat classify". The confidence number in the prompt alone made every
  speculation miss.

### 6.6 Client/phone

- Phone profile, tap Start → first sound: 3.9–5.7 s with the WebGL face, vs 2.2–2.7 s without it. The main thread was 100%
  busy in software WebGL.
- Slow 3G: ADPCM is 128–144 KB vs 462–544 KB for PCM. Tap → first sound p50 4027 vs 4521 ms (n = 5 per arm).
- First lesson start in a process paid a 1.3–1.6 s event-loop block (synchronous catalogue build). Boot-warm cut it from
  4218 to 2652 ms (n = 1 each).
- Local barge-in timing (fake AudioContext): duck at 83 ms, pause at 104 ms after onset.

### 6.7 Cost

| arm | per conversation-minute, AI only (BAKEOFF §5b, Retail Prices API 2026-10-11) |
|---|---|
| cascade (S1 STT + 5.6 terra + Neural HD) | **$0.035** |
| budget cascade | $0.024 |
| Voice Live front end + cascade (e) | **$0.027** |
| gpt-realtime-2.1 | $0.088 |
| gpt-realtime-2.1-mini | $0.026 |
| GPT-Live-1 | $0.050 |

Telephony on top:
- US inbound geographic plus streaming adds ~$0.0125/min.
- **ACS sells no Indian numbers.** India means ACS Direct Routing at $0.004/min plus a licensed Indian SIP trunk; the carrier
  rate is unknown.

Other cost facts:
- A 3× SaaS price gives $0.10–0.19/min for (e).
- Always-on STT costs $1.02 per session-hour (gpt-live-transcribe), which is $184k/month at 1,000 concurrent sessions.

---

## 7. Rejected / failed approaches

These are the highest-value entries. Before building anything similar, read the source text in Taxila `context/rejected.md`.

| tried | what broke |
|---|---|
| **Realtime S2S (gpt-realtime / Voice Live S2S / GPT-Live-1) as the speaker** | The model owns the floor and its audio leaves before any text predicate can gate it, which breaks the "gate every word before it is heard" rule. It costs ~$0.088/min vs $0.027. GPT-Live-1 takes the floor in ~38% of natural Hindi pauses (IndicFDB). gpt-realtime alone yields to echo 64–66/66. Realtime was also rejected as the default lane at the quota of the day: RELATIONAL-OS P2 saw 66/168 responses fail with inference_rate_limit_exceeded when 3 ran at once. |
| **gpt-realtime-mini as the primary voice** | 38–64 words per turn, monologues, a muddled misconception answer, and it called itself "Didi". |
| **Brevity by instruction** ("2–3 short sentences" mid-prompt) | 64 words/turn median (n = 6). The same rule placed **last** gave 25 words. Position is the mechanism. |
| **Reply streaming + TTS on the first guarded sentence; TTS on the first clause** | No gain on 30–60-token replies. The first delta arrives 37–140 ms before the call ends, and Azure releases filtered text in blocks. gpt-4o-mini-tts first byte does not depend on length (262 vs 260 ms, n = 6). Prewarm took the saving instead. (Streaming became worth it later only for the agent's longer JSON-wrapped lines.) |
| **Two parallel drafts, first guard-clean draft wins** | Director p50 1577 vs 1422 ms, p90 3459 vs 2495 ms. Both drafts often fail the same guard. |
| **Faster open models to fix the serial Director** (DeepSeek-V4-Pro etc.) | Each call is still 1.0–1.6 s and they run in series, so the turn got slower (5682 ms). The fix is structural (speculation/prefetch/parallel), not the model. |
| **Agent-call speculation on the prefetched partial** | 0/10 hits. Any per-turn number in the prompt (ASR confidence) makes every key miss. Shipped off; the hooks are kept. |
| **Stop and discard the reply on any server speech_started** (barge all-or-nothing) | Coughs, TV, "hmm" and her own echo killed replies. The empty transcript became "silence" and the question was lost. Replaced by pause-then-decide. |
| **Silence-gated turn-taking** (a 500 ms silence opens every decision) | At age 9, 85% of silences of 250 ms or more are holds (AUC 0.62). Silence at 640/900 ms cut the child off in 15/25 and 11/25 scenarios; words plus a lexical horizon cut off 0/25. Transcript-bound barge-in took 1.7 s. |
| **Smart Turn v3.2 as EOT model** | 34/72 (47%) on child-like Hinglish, which is chance (93% is adult Hindi on its own set). |
| **Semantic EOT model in the loop** (dx3) | AUC 0.57 for the fast model; the 0.80 model answers in 1.2 s. LiveKit EOT models are LiveKit-licence-only. |
| **Zero wait after a complete question** | 6/20 real pauses were cut. |
| **Our duplex engine as the ear on a phone speaker** | 46/66 echo false barge-in without reference AEC. |
| **Text echo subtraction on D5** | It deleted a child's real "आठ corners". Echo removal must be acoustic once the ear has reference AEC. |
| **Empty-transcript bursts heard only on the device become turns** | Her echo through a weak AEC, doors and coughs became empty turns that the teacher taught over. Now only bursts that Voice Live itself opened become turns. |
| **gpt-4o-transcribe / gpt-transcribe / MAI-Transcribe-1.5 / Qwen3-ASR (hi) / zero-stt-hinglish as live/grading STT** | They write fluent, lesson-shaped text on silence or noise (gpt-transcribe 7/12 non-speech clips with a prompt; MAI-1.5 wrote Spanish news on silence; Qwen "हम्म" on 29–30/30). A vocabulary list in the free-text prompt makes it worse: the list is recited. |
| **Azure Speech PhraseList for hi-IN; keywords/prompt on MAI-2-stream and gpt-realtime-whisper** | No-op, or rejected by the socket. Biasing only works through live-transcribe `keywords`. |
| **Voxtral realtime, Nemotron as the grading transcript, Sarvam self-host** | Voxtral romanises Hindi (numbers 50/96). Nemotron numbers 84/96 vs 92. Sarvam v3 is a $5k/month SageMaker package; v4 is API-only. |
| **Spot GPUs for live STT** | A reclaim drops 64–128 streams at once, with a 161 s cold start. |
| **Per-session-hour STT API at scale** | $184k/month at 1,000 concurrent sessions vs ~$8–9k self-hosted. Fine below ~20 concurrent. |
| **DragonHD Omni voices** | Unlisted names, first-byte tail to 8.7 s. |
| **Audio LLMs as judges of voice naturalness or timing** (gpt-audio, gpt-realtime) | They failed the controls: an American accent was scored "native Indian", and a reply 8 s late was not preferred less than one 1 s late. |
| **Square-bracket directions / labels in voice prompts** | Spoken aloud (brackets in 4/4 transcripts, labels in 10–20/54 turns). |
| **Static filler list ("hmm" every turn)** | Becomes a tic. Replaced by uptake-echo plus a gated continuer, never two turns running. |
| **Ack before the distress read** | Rejected as a hard rule: nothing may be spoken before the model distress read on a turn that might be a disclosure. |
| **Strict JSON-schema length limits in descriptions** | 13/24 responses exceeded them at effort none. Effort low obeyed but cost +760 ms. Lark bounded repetition gives HTTP 400 on Azure. |
| **Feature POST racing the turn** (`voice-features-latest-signals-race`) | The turn read the previous utterance's row. Features must ride on the turn request. |

---

## 8. Risks and landmines

1. **Nothing here is validated on real users or real phones.** Every echo and barge-in number comes from a modelled
   loudspeaker with TTS voices. Taxila's own reversal conditions are explicit: echo false barge-in ≤ 2%, true barge-in ≥ 95%,
   lone-word recall ≥ 95%, and EOT not regressed. Adopt the gates, not the numbers.
2. **Voice Live empty transcripts on short answers** (5/14). In sales calls, "haan", "ok" and "theek hai" are the commonest
   answers. Expect the same failure. Plan a second ear for short bursts (a batch transcribe of the clip) before relying on D5.
3. **Live-Reference AEC is in preview** (api-version `2026-07-15`). A reversal fires if it leaves preview with no GA
   equivalent. How a non-responding session is billed, and whether the stereo reference is billed as audio, is
   **unverified**; it may add up to $0.54/h.
4. **gpt-live-transcribe has no logprobs.** Any "low ASR confidence" logic silently does nothing on that lane.
5. **The 429 overflow twin is +0.3–0.9 s, and it varies by hour.** Hedge twins doubled onto the overflow until the review
   fix. Port the fixed `post()` logic (`overflowOnce`, first attempt only, never for background or speculation), not an
   earlier copy.
6. **Branch skew.** `server/agent/agent.js` differs across the three branches (effort low vs none, speculation present or
   absent). Take r4-conversation for agent code and r4-duplex for the overflow and safety fixes.
7. **Over-engineering risk.** The duplex engine is thousands of lines with many tuned constants, fitted on child Hinglish
   (for example the 12 dB / 80 ms pre-duck, tuned in-sample on the same 102 lines it was then scored on). Adult sales
   callers have different pause statistics. Re-measure; do not copy the constants.
8. **Phone-call audio is not browser audio.** D5's reference channel is "what the phone played", captured in a browser
   AudioWorklet. On PSTN/ACS there is no device AEC to worry about in the same way, but there is line echo. You must feed the
   agent's outbound stream as ch1. This is unbuilt and unmeasured.
9. **The end-to-end latency for an LLM agent with tools is ~4–5 s p50 here.** The model's first clause is ~1.5 s and the
   pre-agent pipeline (classify etc.) ~1.8 s. A sales voice agent that wants under 2 s must drop the serial classify stage
   or run it in parallel, keep prompts cached, and use a continuer/ack.
10. **Secrets:** Taxila reads Voice Live keys from env (`TAXILA_VOICELIVE_*`, `AZURE_AI_CENTRALINDIA_*`). None were copied here.

---

## 9. Azure dependencies (names only)

- Azure OpenAI / Foundry deployments:
  - `taxila-fast`, `taxila-gpt6` (gpt-6-sol), `grok-4-1-fast-non-reasoning`;
  - `taxila-live-transcribe` (gpt-live-transcribe), `taxila-transcribe` (gpt-4o-transcribe);
  - `taxila-realtime` (gpt-realtime-2.1), plus a mini, and the gpt-4o-mini-tts fallback;
  - `taxila-mai-tx2-stream` (MAI-Transcribe-2, southindia);
  - accounts `taxila-ai-southindia` (the overflow twin) and the eastus2 primary.
- Azure AI Voice Live: centralindia (`AZURE_AI_CENTRALINDIA_ENDPOINT`), api-version `2026-07-15`, model `gpt-4.1-mini`,
  `azure-speech` transcription, `azure_semantic_vad_multilingual`, `server_echo_cancellation` with reference, and
  `azure_deep_noise_suppression`.
- Azure Speech: DragonHD Latest Neural voices `en-IN-Diya`, `en-IN-Arjun`, `en-IN-Meera` (and hi-IN Omni, rejected).
  `AZURE_SPEECH_REGION/KEY` (India profile `_SIN`).
- Azure Container Apps: `taxila-web` (eastus2), the `taxila-sin-env` / `taxila-env` job environments, `taxila-sin-staging`.
- Azure Content Safety (image analyse, picture lane). Azure Communication Services: priced only, not built.
- Neon Postgres (allowed).

---

## 10. Recommendation for sales-enabler

1. **Adopt the D5 architecture as the voice-agent default: "Voice Live is the ear, our LLM is the voice."** It is the
   cheapest serious option at ~$0.027/min of AI, it is the only measured arm that solved loudspeaker echo (0/66), and it
   keeps a text gate before every word, which compliance buyers will want. For telephony:
   - wire ACS Call Automation media streaming;
   - send caller audio as ch0 and our outbound TTS as ch1 into the same `voiceLiveSession()` shape;
   - port `server/duplex/voicelive.js` almost verbatim (its allowlist, idle and billing guards, clamped silence).
2. **Do not use realtime speech-to-speech as the agent's voice** unless Azure ships a text-first mode, or the product
   explicitly accepts ungated speech. Taxila's reversal condition #6 is the right trigger to watch.
3. **Port `server/azure.js` as the single model gateway.** It should keep:
   - hedged calls;
   - the 429 overflow to a second-region twin deployment, with the fixed one-move rule;
   - hot vs background quota lanes;
   - content-filter detection (non-OpenAI Foundry models return HTTP 400 with `finish_reason=content_filter`);
   - USD accounting.
   Background workloads (campaign generation, enrichment, the brain) must never share a quota pool with live calls. A
   throttled live call is dead air.
4. **Build the voice and chat agents on the agent-lane pattern:**
   - a strict JSON schema with `say` first;
   - streaming `say` extraction, then the clause splitter, then a per-clause gate, then TTS;
   - actions (CRM write, calendar book, send follow-up) checked by code against what actually happened, and reported back
     to the model as state ("ON SCREEN" becomes "CRM TRUTH");
   - per-call USD/token budgets that throw to a scripted fallback;
   - effort none on gpt-6-class models;
   - rules that must fire placed last in the prompt;
   - no sentence-shaped example lines.
5. **Latency budget.** Expect ~1.0 s of endpointing plus ~0.5 s of STT plus ~1.5 s to the first LLM clause plus ~0.2 s of
   TTS, so ~3.2 s at best before tools, with parallel stages:
   - drop a serial classifier pre-pass;
   - prefetch on stable partials, adopting only on identical inputs;
   - keep the system prompt static so it caches;
   - prewarm TTS;
   - consider a gated continuer, the largest single perceived win measured (−1.2 s).
   Do not spend effort on reply-to-TTS first-clause tricks for short lines, on two-draft races, or on agent-call speculation.
6. **STT for Indian sales calls.**
   - Start with gpt-live-transcribe plus `keywords` (product and company names), or Voice Live `azure-speech` hi-IN,en-IN.
   - Run Taxila's **non-speech hallucination probe** (silence, noise, digital zeros, n ≥ 30) on any candidate before it
     writes to the CRM. Most "better accuracy" transcribers invent text on silence.
   - Measure the empty-transcript rate on short answers.
   - Fix Hindi spoken-number parsing early (prices, quantities, phone numbers).
7. **Reuse the harnesses.** Port `evals/duplex-2026-10/score.mjs` + `assemble.mjs` (echo, barge, continuer, EOT, CER scorers),
   `evals/latency/overflow-arm.mjs` (paired bootstrap CIs) and `turn-e2e.mjs`. Build a sales-call scenario set to replace
   TaxilaFDB. Keep `cost-per-minute.mjs` live against the Retail Prices API for pricing.
8. **Known gap to close before launch:** India PSTN. ACS has no Indian numbers, so Direct Routing plus a licensed SIP
   carrier is needed. Budget for it, and for the region choice. centralindia/southindia cut STT finals to ~70 ms (MAI), but
   LLM TTFT was slower there than eastus2.
