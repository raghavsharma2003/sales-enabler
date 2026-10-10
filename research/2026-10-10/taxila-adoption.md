# Taxila all-branch audit and adoption map

Repository: `https://github.com/raghavsharma2003/Taxila`  
Audited remote heads: **1 of 1 available**  
Available branch: `claude/blissful-mayer-icwe2j`  
Pinned commit: `00aab4bdcc787050e65703dd4bb428ce3d9b8679`  
Pinned tree: `93ecdb8a5cfbb0a8236a611baf452e2542e4319f`

## Result

Taxila currently advertises exactly one remote head. It contains 389 reachable commits and 24,110 files. The all-branch equivalence analysis therefore has one singleton cluster and no branch-pair diffs: there is only one available code tree to compare. All 389 commits are unique relative to the empty set of other available heads.

This statement is deliberately limited to the refs GitHub advertised on 2026-10-10. The audit did not recover deleted or access-restricted branch tips. It did fetch the complete reachable history of the available head into the bare mirror at `data/source-audits/Taxila.git`.

The repository is unusually large because it contains a research and evaluation corpus alongside the product: 12,195 files under `docs/`, 6,076 under `evals/`, 1,778 under `art/`, and thousands of PNG, WAV, PCM, MP3 and WebP assets. The production-shaped code is much smaller: 445 files under `server/`, 513 under `src/`, 49 under `shared/`, and 308 tests. Reuse should target named modules, not vendor the 3.76 GiB mirror or copy the repository wholesale.

## Branch and variant manifest

| Available branch | Head | Commit date | Reachable commits | Unique vs other available heads | Tree | Meaningful branch variant |
|---|---|---:|---:|---:|---|---|
| `claude/blissful-mayer-icwe2j` | `00aab4bdcc787050e65703dd4bb428ce3d9b8679` | 2026-10-10 05:13:29Z | 389 | 389 | `93ecdb8a5cfbb0a8236a611baf452e2542e4319f` | Current and only available code tree |

There are no pairwise branch diffs to list. The meaningful variants live inside this tree:

1. Realtime speech-to-speech teacher: the server mints an ephemeral Azure realtime session and the browser connects over WebRTC. Quota refusal or repeated reconnect failure can move the same lesson to cascade. See [`server/routes/lesson.js:314-360`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/routes/lesson.js#L314-L360), [`server/voice/realtimeSession.js:48-95`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/voice/realtimeSession.js#L48-L95), and [`src/lesson/voiceLink.ts:1-9`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/src/lesson/voiceLink.ts#L1-L9).
2. Cascade teacher: child microphone audio goes to Azure realtime transcription; the server authors and stores the teacher turn; framed PCM TTS returns with clause and viseme timing. The file itself documents the flow in [`src/lesson/cascadeLink.ts:1-20`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/src/lesson/cascadeLink.ts#L1-L20). The streaming client lives at [`src/lesson/ttsStream.ts:222-373`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/src/lesson/ttsStream.ts#L222-L373).
3. Text teacher: it shares the guarded lesson-turn state machine and can optionally read a stored turn aloud. Mode selection is explicit at [`server/routes/lesson.js:149-150`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/routes/lesson.js#L149-L150).
4. Speech engines: a configuration layer selects Azure Speech DragonHD, gated Preview MAI voice, or Azure OpenAI `gpt-4o-mini-tts`; [`server/voice/voice-switch.js:1-59`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/voice/voice-switch.js#L1-L59) defines the switch and its GA/Preview guard.

## Voice and language pipeline

The cascade path is a complete two-stage voice pipeline. [`server/routes/voice.js:101-127`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/routes/voice.js#L101-L127) authorizes the lesson, rechecks guardian consent and rate limits, and mints a short-lived Azure transcription secret. The push-to-talk fallback accepts a bounded clip and uses the same prompt at [`server/routes/voice.js:134-160`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/routes/voice.js#L134-L160).

The STT prompt explicitly accepts Hindi, English, or a Hindi-English mix and asks for Devanagari Hindi plus Latin English. It also sets a 900 ms child-speech silence floor and 300 ms prefix padding. See [`server/voice/stt.js:7-67`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/voice/stt.js#L7-L67). The code records an important limitation: the preferred live-transcribe model measured much better on a synthetic Hinglish set but returned no logprobs, so the low-ASR-confidence gate cannot operate on that lane; structured keyword hints are described as not wired yet.

The browser builds a WebRTC microphone session with echo cancellation, noise suppression and automatic gain control, then parses realtime transcription events. If that setup fails, it falls back to MediaRecorder push-to-talk. See [`src/lesson/cascadeLink.ts:939-1015`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/src/lesson/cascadeLink.ts#L939-L1015) and [`src/lesson/cascadeLink.ts:1185-1224`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/src/lesson/cascadeLink.ts#L1185-L1224). The duplex layer adds 20 ms frame handling, partial/final STT, floor control, barge-in and safe degradation in [`src/duplex/live.ts:1-22`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/src/duplex/live.ts#L1-L22) and [`src/duplex/live.ts:345-367`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/src/duplex/live.ts#L345-L367).

On output, `toSpoken()` chooses a Hinglish, Hindi, or English rendering cell using language, school medium and age band, then converts numbers, notation, formulas, terms and safety numbers into speech-safe forms. See [`server/voice/spoken.js:23-48`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/voice/spoken.js#L23-L48) and [`server/voice/spoken.js:563-598`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/voice/spoken.js#L563-L598). Optional deterministic Roman-Hinglish-to-Devanagari conversion follows at [`server/voice/translit/index.js:1-17`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/voice/translit/index.js#L1-L17) and [`server/voice/translit/index.js:147-173`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/voice/translit/index.js#L147-L173). It deliberately skips English-only text and safety-floor text.

Azure Speech streaming is isolated in [`server/voice/azureTts.js:41-98`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/voice/azureTts.js#L41-L98). Its WebSocket counterpart adds pooled sockets, visemes and word timing at [`server/voice/azureTtsWs.js:139-216`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/voice/azureTtsWs.js#L139-L216). `speech.js` keeps a TTS failure sticky for the reply or lesson so it does not oscillate voices sentence by sentence; the tradeoff is that a DragonHD-to-OpenAI fallback can still change timbre mid-lesson. See [`server/voice/speech.js:278-334`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/voice/speech.js#L278-L334).

## Lesson orchestration

The route layer is intentionally thin. [`server/routes/lesson.js:578-589`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/routes/lesson.js#L578-L589) delegates each turn to `lessonTurn()`. The real orchestration is in `server/brain/turn.js`:

- It loads consent and lesson context, deduplicates/replays a turn sequence, and handles late turns at [`server/brain/turn.js:153-210`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/brain/turn.js#L153-L210).
- It runs classifier, deterministic safety predicate, voice signals and speculative reply work in parallel, then folds them into a code-owned plan at [`server/brain/turn.js:350-480`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/brain/turn.js#L350-L480).
- It arbitrates screen/Studio state, constrains model wording to verified content, fails closed when the content filter blocks a child-bearing reply, and creates a delivery plan at [`server/brain/turn.js:591-755`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/brain/turn.js#L591-L755).
- It commits state, evidence, incidents and the replay record in one guarded transaction at [`server/brain/turn.js:829-870`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/brain/turn.js#L829-L870).

This architecture is more reusable as a design pattern than as a direct copy. Taxila's turn implementation is coupled to child consent, curriculum kits, safeguarding, Studio artifacts, learner models and relational memory. The useful boundary is: code owns authority, budgets, state and safety; models perceive and word; speculative work is discarded unless its input key matches; persistence is atomic.

## Model routing, Gemini pools and YCA

There is no free-Gemini-key pool, Google provider rotation, or product Gemini call in the current tree. The only production-code mention of Gemini is an AI-identity phrase detector that recognizes a child asking whether the teacher is “Google” or “Gemini” at [`server/relational/lexicon/en.js:96`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/relational/lexicon/en.js#L96). Gemini appears elsewhere as research, a reference voice, or an experiment-only audio judge. The router document explicitly says product models are Azure-billed and reference arms are not product calls at [`docs/research/models/MODEL-ROUTER.md:12-14`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/docs/research/models/MODEL-ROUTER.md#L12-L14) and [`docs/research/models/MODEL-ROUTER.md:128-129`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/docs/research/models/MODEL-ROUTER.md#L128-L129).

Taxila does have two kinds of pools, neither a free-provider key pool:

- Azure endpoint lanes can point at separate Azure accounts. [`server/endpoints.js:1-18`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/endpoints.js#L1-L18) rejects an override that targets a different host without its matching lane key, preventing cross-account credential fallback. The lane resolver is at [`server/endpoints.js:40-80`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/endpoints.js#L40-L80).
- Model deployments have hot/background capacity isolation. [`server/lanes.js:1-16`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/lanes.js#L1-L16) states the policy; [`server/lanes.js:95-155`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/lanes.js#L95-L155) implements admission, sliding-window usage and 429 pauses.

The role router itself is compact: [`server/azure.js:12-40`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/azure.js#L12-L40) maps realtime, brain, fast, reply, classify, transcribe, TTS, image and Stagecraft roles to deployments. It is Azure-only, with an image fallback list; it is not a general provider abstraction.

No exact `YCA`/`yca` identifier occurs in the current tree. If “YCA” meant a voice-AI identity concept, the nearest implementation is the relational identity reminder: [`server/relational/session.js:85`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/server/relational/session.js#L85) schedules an app-voice AI reminder, and the English lexicon recognizes identity questions. No credential values were inspected or recorded.

## Ranked adoption

1. **Azure endpoint lane resolver — adopt the pattern first.** `server/endpoints.js` is small, security-relevant and low-coupling. It gives chat, realtime, transcription, TTS, image, Responses and safety lanes explicit endpoint ownership and prevents a primary account key from being sent to another account.
2. **Hot/background quota isolation — adapt to the destination's model registry.** `server/lanes.js` is valuable for keeping interactive voice responsive while evaluations, report writing or content generation run. Preserve the “hot calls never wait; background sheds first” contract, but replace Taxila deployment names and measured TPM values.
3. **Framed speech streaming — adapt.** `server/voice/frames.js` plus `src/lesson/ttsStream.ts` carry audio, clause timing, visemes and turn metadata over one backpressure-aware response and retain compatibility for raw-PCM clients. This is directly useful to a voice-first product.
4. **TTS prewarm, cache, WebSocket pool and sticky fallback — port selectively.** The reliability mechanics in `server/voice/speech.js`, `prewarm.js`, `azureTts.js` and `azureTtsWs.js` are strong. Replace lesson tables, child-specific auth and Taxila cache keys with the destination's contracts.
5. **Hinglish speech renderer and transliteration — evaluate with the destination's real scripts.** `server/voice/spoken.js`, `spoken-lexicon.js` and `translit/` are the richest directly reusable language assets. They include Indian number grouping, formulas, mixed scripts and deterministic safety-number speech. Port only after reviewing language coverage, licensed provenance of lexicons, and real-listener results.
6. **Realtime-to-cascade continuity — port the state-machine ideas.** The explicit quota detection, one retry, lane switch, resume turn and re-voice behavior in `realtimeSession.js`, `realtime.ts`, `voiceLink.ts` and `runtime.ts` address the hardest failure mode in live voice. The code is coupled to lesson semantics, so extract its state transitions rather than copy it whole.
7. **Lesson orchestration — adopt principles, not the module.** `server/brain/turn.js` has good boundaries around policy, model work, safety and atomic persistence, but it is the most Taxila-specific component.

## Constraints and exclusions

Taxila declares Azure-only paid compute and AI, allows Neon Postgres, and says hosting moved to Azure Container Apps; the Vercel project is paused and the API file remains a shim. See [`CLAUDE.md:10-16`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/CLAUDE.md#L10-L16) and [`CLAUDE.md:32-41`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/CLAUDE.md#L32-L41). The Dockerfile states that the image is built in Azure Container Registry at [`Dockerfile:1-11`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/Dockerfile#L1-L11).

No `LICENSE`/`LICENCE` file exists at the audited tree, and `package.json` is `private: true` with no `license` field at [`package.json:1-5`](https://github.com/raghavsharma2003/Taxila/blob/00aab4bdcc787050e65703dd4bb428ce3d9b8679/package.json#L1-L5). Treat reuse outside a confirmed common-owner context as requiring explicit permission and provenance review. Model, voice, asset, research-corpus and dependency terms are separate constraints; the absence of a repository license does not grant rights to those materials.

This was a source audit only. No upstream code was executed, no dependencies or providers were installed, no cloud calls were made, and no `.env` or secret values were read.
