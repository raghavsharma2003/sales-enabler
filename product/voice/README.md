# VP voice runtime (`product/voice`)

Runs one call from a signed `CallTicket` and reports `RuntimeEvent` batches back to the control plane. The contract is
in `product/shared/runtime-protocol.ts`, `agent-config.ts`, `stacks.ts` and `safety/index.ts`. This package codes
against those files and does not change them.

It is a port of the voice lab (`voicelab/server/`), generalised from four hard-coded scenarios to whatever the ticket
says: the agent config, the brief compiled once by the control plane, the stack, the contact, the limits.

```
python -m pip install -r requirements.txt
python -m vpvoice                  # serves on $PORT (8080), one process
python -m vpvoice.launch           # one worker per core behind $PORT (see "Admission and processes")
VP_DEVSIM=1 python -m vpvoice.devsim   # development only: the real HTTP surface on fake ears/brain/voice, no keys
python -m unittest                 # from product/voice; no network
docker build -f product/voice/Dockerfile -t vp-voice .   # from the repository root
```

## What a call does

1. **Intake.** `POST /v1/calls` checks the HMAC signature, then validates the ticket (`vpvoice/ticket.py`). It refuses
   a ticket it cannot run exactly as written:
   - a conversationId that is not a uuid (ingest refuses those, so every event would be lost);
   - an unknown stack, or no stack (there is no default);
   - a ticket without `stack.components`, or a curated stack id whose components differ from the runtime's own table;
   - a `custom` stack (one a person built from parts, `shared/components.ts`) whose parts are unknown, incomplete (a
     cascade needs ears, a brain and a voice; an engine stack has only `s2s`), or differ from `agent.voice.components`.
     A built stack runs exactly its parts and files under the same `combinationId` algorithm over them;
   - a stack that differs from `agent.voice.stackId`;
   - a voice the stack does not offer;
   - a `combinationId` that is not what this stack and voice run;
   - `brief.bytes` or `brief.hash` (sha256 of the text, hex, optionally `sha256:`-prefixed) that do not match the text;
   - a memory brief over 1200 bytes;
   - missing limits.

   A stack whose provider credentials are not configured gets a 503 `stack_unavailable` that names the missing
   credential groups. It is never substituted.
2. **Join.** The 202 answer carries join info with a single-use token. The token expires after 10 minutes, and an
   unjoined call then ends as `no_answer`.
3. **Prompt.** The prompt is built in this order:
   1. `brief.text`, verbatim;
   2. the memory brief, verbatim, only when `memoryStatus` is `loaded`;
   3. the contact rows: `Contact rows for this call (data, not lines):`, then one `key with spaces: value` line per
      `contact.facts` entry sorted by key, or `none` (the same format as `compile.ts` `contactRows()`; the brief points
      at it). The same facts go to the door as `perContact` facts: amounts she may state, after identity (RD11);
   4. the history;
   5. a **LAST block** per turn (`vpvoice/brief.py`).

   The LAST block is generic and data-driven. It holds:
   - a ledger of the facts and figures she has already said;
   - a figure the caller said that is not in the facts;
   - goals settled and still open;
   - how the caller sounds lately;
   - closing cues, crisis, opt-out and the asked-if-AI state;
   - then the lab's turn rules and the marker rules.

   Position is mechanism: what must fire goes last.
4. **Reply door** (`vpvoice/safety.py`). Every sentence passes through the door before it is spoken. A *replace*
   verdict speaks the honest or safe line. A *block* verdict is never said: the brain rewrites the reply once, told
   which rule its draft broke. A second block ends the reply with a safe line.
5. **Caller signals.** Every caller turn is read for signals before any reply. The text is redacted before it reaches
   the transcript, the events or the LLM.
6. **Events.** Every step emits events: `call.started`, `turn`, `cost`, `safety`, `moment`, `tool`, `hand_off`, then
   `call.ended`, alone and last.

### Markers the brain may write (stripped, never spoken)

| Marker | Effect |
|---|---|
| `<end_call>` | Honoured only after a real goodbye, not right after a caller question, never in a crisis. Audio calls wait for playback, then a 1.5 s beat; if the caller speaks in that beat, the call stays up. |
| `<goal:ID>` or `<goal:ID=note>` | The goal (from `agent.goals`) is settled; emits a `moment` of kind `commitment`. |
| `<tool:NAME>` | A granted tool, emitted as a `tool` event with status `requested`. The control plane runs it; the runtime does not. |
| `<handoff:REASON>` | Hand-off when REASON is in `agent.handOff.when`. |
| `[tone: ...]` | Delivery note, used by the styled voices (MAI styles, OpenRouter instructions). |

The control plane's brief compiler can rely on this vocabulary. The LAST block restates it every turn.

### Safety behaviour

The rules are the shared ones. `vpvoice/rules.py` loads `product/shared/safety/rules.json` (the image copies it next to
the package; `VP_SAFETY_RULES` overrides the path) and evaluates it line for line as `product/shared/safety/index.ts`
does: first rule that fires decides, the same scopes, the same five builtins, the same masks (`[OTP]`, `[CARD]`, …).
All 2,048 vectors in `cases.json` pass (`tests/test_safety_cases.py`).

`vpvoice/safety.py` adds only what needs call state the shared door lacks:
- the first-breath clause prefix (RD1);
- truth-first after "aap AI ho?" (RD2);
- the crisis-support line until 14416 and 112 have been said (RD3).

Exemptions follow the shared semantics: `none` on the whole sentence, `noneClause` only on the clause around the anchor match (`regex.clause_split`); `coClause` rules need every `all` group in that clause, or in it plus the clause before when it holds a `regex.back_reference`. A key, builtin, scope or enum in `rules.json` that `rules.py` does not implement makes the import fail (`RulesSchemaError`): port the engine change from `index.ts` first. The gaps this runtime found are regression tests in `tests/test_safety.py`. What the runtime does
with each rule:

| Rule | What the runtime does |
|---|---|
| RD1 | The first sentence of her first reply must carry the AI clause. If it does not, `opening.disclosureClause` is prefixed. Disclosed once heard; if she was talked over, it is offered once more, then never again. |
| RD2 | A denial or a claim to be human or staff is replaced by the honest line. When the caller asks "aap AI ho?", her reply starts with the truth. |
| RD3 | Crisis language from the caller suspends the goal (`safety`/`suspended_goal`). Her reply must carry Tele-MANAS 14416 and 112; if it does not, the door replaces it. A human is offered (a `hand_off` event when `handOff.when` has `crisis`). Goal-pursuing lines are blocked. `<end_call>` is ignored. Limits stretch to 2x, then the call is handed off (`crisis_handoff`). She never ends it herself. |
| RD4 | She never asks for an OTP, PIN, CVV, card, UPI PIN, password or full Aadhaar (blocked). If the caller starts reading such digits, a partial transcript is enough to stop them kindly mid-number. The span is redacted everywhere (`safety`/`redacted`). |
| RD5 | No payment on the call (blocked). A link outside `brand.verifiedDomains` is blocked. |
| RD6 | Scam framing is blocked: pay-to-receive, revive-by-paying, regulator impersonation, threats, false urgency, and a rupee amount that is not in the facts. |
| RD7 | Promotion fence on service and transactional calls. The agent's `neverSay` list is reported under RD7 too. |
| RD8 | IRDAI solicitation fence (`insurance_irdai` pack). |
| RD9 | Harsh-practice fence (`lending_rbi` pack or a `payment_reminder` job). |
| RD10 | A recording refusal stops the recorder and discards the audio; `call.ended` then carries no `recordingUri`. Lines about recording after that are replaced by the shared confirmation. |
| RD11 | Per-contact facts (`contact.facts`, passed to the door as `perContact` facts) and account amounts wait until the person has confirmed who they are. |

Opt-out emits a `moment` of kind `opt_out`, then her one-line confirmation, then the end (`opt_out`). A request for a
human emits `hand_off` per `agent.handOff` and a bridge line. On a Plivo line with a `phone` target the call is
transferred; elsewhere it ends as `handed_off`.

The shared test vectors (`product/shared/safety/cases.json`) run in `tests/test_safety_cases.py` when the file is
present.

### Door mechanics beyond the shared rules (review "what she says")

- Disclosure is the shared `lexicon.ai_affirm` (or the agent's disclosure clause verbatim) with no RD2 rule firing on the sentence; a mention or a denial never counts.
- Each sentence is doored alone and with the sentence before it in the same reply.
- A canned replacement ends the reply.
- Identity is confirmed only by an explicit yes to a question that named the person.
- Gemini Live audio is held until its whole turn has passed the door.
- A brain stream closed early is metered as an estimate (`detail.estimated`).

### The caller-crisis judge (`vpvoice/judge.py`, contract `product/shared/safety/judge.json`)

A model reads each final caller turn the floor did not flag, in parallel with the brain. It is raise-only: it can add
the crisis signal, never remove one.
- **Before the call:** the text is redacted first and quoted as data under the contract's fixed prompt.
- **No waiting** (decision.2026-10-23.judge-flashlite-nonblocking): the reply never waits for the verdict. The
  model call is bounded by `timeout_ms` (1,500 ms). A floor hit acts at once.
- **Modes:** `off`, `shadow` (default) or `raise`. In `shadow` the judge runs fire-and-forget and nothing changes.
  In `raise`, a verdict that is in before her first sentence of the reply leaves the door replaces that reply with the
  crisis path (Tele-MANAS 14416 and 112, agenda dropped, a human offered, no hang-up) or the opt-out confirmation. A
  later verdict acts from her next sentence (crisis) or her next turn (opt-out).
- **Failure:** a timeout, error or bad output leaves the floor's verdict.
- **No model configured:** no call and no spend.
- **Events:** every judged turn with an outcome emits a `judge` runtime event (`outcome` raised, shadow or
  unavailable; `kind`/`confidence` on a hit, `reason` when unavailable; integer `latencyMs`; never caller text). Only
  a raise is also a `safety` event (rule RD3, `suspended_goal`), because calls turns every safety event into a safety
  flag on the call. A judge that says "no crisis" emits nothing.
- **Production:** `raise` only on the owner's go.

### Fallbacks and failures

A model is never swapped mid-call on a test call. A component failure ends the call as `error`; the exact reason is
logged and shown by `GET /v1/calls/{id}`. On a non-test call, and only with `VP_FALLBACKS=1`, a failed brain moves to
the same model on another host (`catalog.BRAIN_FALLBACK`). That move is recorded in `manifest.fallbacksUsed`.
Production failover policy is still open (`open.2026-10-20.product-failover-policy`).

### Cost

Every cost line is integer milli-rupees at ₹95/$, using `catalog.py`'s list prices (ported from the lab):

| Component | Unit |
|---|---|
| brain | token; a speech-to-speech model reports here with `detail.s2s = true` |
| ears | second (seconds actually sent; gated) |
| voice | char for Azure/Sarvam, second for Gemini |
| telephony | second, billed in 60 s pulses |

Lines are deltas, emitted after each reply and at the end, and they always sum to the rounded total. `limits.maxCostInrMilli`
and `limits.maxDurationS` end the call (`max_cost`, `max_duration`) after a short goodbye.

## Audio-path capacity

`bench/audio_bench.py` runs N concurrent phone calls in one runtime process through the real audio path, with no
network beyond localhost and no keys. Each call is a Plivo-style mu-law 8 kHz media websocket. The path is:
decode → resample → Silero VAD → turn-taking → reply door → resample → encode → `playAudio`.

Ears, brain and voice are fakes with realistic timing: final transcript +300 ms, first sentence +700 ms, first audio
+250 ms, then real time. Callers play synthetic speech clips, which need ffmpeg to decode. The runtime runs in its own
process, so the load generator's CPU is not counted against it.

The bench reports:
- CPU, total and per call;
- RSS;
- event-loop lag;
- outbound frame jitter and late frames;
- the runtime's own turn-end → first-audio overhead;
- the generator's own lag, as a sanity check on the jitter numbers.

```
cd product/voice
python bench/audio_bench.py --calls 10 25 50 100 --seconds 120
python bench/audio_bench.py --calls 50 --seconds 60 --profile     # cProfile the runtime at one N
```

## Turn-taking

`bench/turn_bench.py` measures when she talks. It feeds 102 synthetic Hinglish caller clips through the real VAD,
endpointing, held replies and barge-in logic, with fixed-timing fakes for ears, brain and voice. The clips are split
DEV/TEST, and tuning happens on DEV only.

It reports, with n and 95% CIs:
- end-of-turn latency;
- premature cut-ins in mid-thought pauses;
- talk-over;
- missed and false barge-ins (backchannels and noise).

After a question she answers at once. After a statement she waits `STATEMENT_HOLD_MS` (1200) of silence. After an
unfinished turn she waits `LONG_HOLD_MS` (1400). Results are in `bench/results/turn-*`.

```
python bench/turn_bench.py --split dev                        # tune here
python bench/turn_bench.py --split test --out bench/results/turn-<date>-test
```

## Reply gap and barge-in

Each reply's gap (caller end of speech to her first audio) is split into stages in the call's status
(`GET /v1/calls/{id}` → `timing`): `ears` (end of speech to the recogniser's final), `turn`, `brain` (request to
first data), `sentence`, `voice` (request to first audio), `hold` and `out`. A stage is negative when work started
early. `partialLagMs` is how long after speech starts the recogniser's first words arrive.

The cuts, each behind a flag (`'1'`/`'0'` in the env override the default). Speculation and pre-warm are
provider-aware: a provider listed in `VP_PACED_PROVIDERS` (default `vertex`, which is held to about 1 request a second;
`none` for none) gets no extra requests, because on staging they queued ahead of the real one (flashlite p50 2.30 →
3.20 s, 2026-10-24).

| Flag | Default | What it does |
|---|---|---|
| `VP_SPECULATE_PARTIAL` | off | Starts the reply on the caller's settled partial at end of speech (unchanged for `VP_SPECULATE_STABLE_MS`, default 400, or ending at a clause boundary); kept only if the final has the same words. Off everywhere: with partials that trail speech it saved nothing on the bench and kept 5–16% (`bench/results/turn-2026-10-24-dev-speculation.md`). Never on digits, secrets, action signals or a raising judge. |
| `VP_PREWARM` | on where unpaced | When the caller starts speaking (and at call start for the voice): refreshes the Vertex token and sends one HEAD to each brain and voice host (at most one per host per 8 s). |
| `VP_FIRST_CLAUSE` | off | Voices a reply's first clause on its own (at a comma, 24+ characters). Never the opening. Off until a listening check. |
| `VP_BARGE_AUDIO` | on | She yields on `VP_BARGE_AUDIO_MS` (200) of caller speech from the audio alone, keeping her place; after `VP_RESUME_MS` (400) of quiet she resumes if all she heard was a nod or nothing, else she gives way. `VP_BARGE_PAUSED_MS` (900) of speech with no words yet also gives way, and late words that are not a nod stop her after she resumed. |
| `VP_BARGE_NOD` | on | Nods ("haan ji", "achha") never count as words, in either barge-in rule. |

The timing summary also carries `speculation` (started, kept, discarded, withdrawn, keepRate), `prewarm` (brain,
voice) and `barge` (pauses, resumes, stops). With `VP_BARGE_AUDIO=0` the word rule applies: `BARGE_MS` of speech with
`BARGE_WORDS` words, or `VP_BARGE_LONG_MS` (700) of speech; staging's partials trail speech by a median 858 ms, so
words alone cannot stop her quickly.

## Voice samples for the stack cards

`python -m vpvoice.samples --out DIR [--stack ID ...]` renders one short clip per curated stack (s2s included)
through the runtime's own voice adapters, with the stack's default voice and her neutral style. The line is fixed:
`samples.TEXT` (greets "Asha", the shared AI disclosure, no brand, no claim). Stacks that share a voice share one
clip. Output: Ogg/Opus clips normalised to -16 LUFS plus `manifest.json` (`{stackId: {file, durationS, text,
recordedAt, combinationId, voice, tts}}`, and `spokenText` for Live, which does not promise to read verbatim).
It writes only inside `--out`, refuses in production mode, and spaces Google requests 1 s apart. Run it on the
India lab VM, where the keys are; `VP_DEVSIM=1 ... --devsim` renders devsim's fake tone offline.

## Admission and processes

**One process carries at most `VP_MAX_CALLS_PER_PROCESS` calls (default 20).** The audio path is CPU-bound and Python
runs one core per process. The bench above puts the knee between 25 and 35 calls per process on a 4-vCPU host, so
20 leaves headroom for real providers' extra work. A call holds its slot from the accepted ticket (joined or not)
until it ends. Past the cap a ticket is refused at intake with `503 at_capacity` before anything is created. The
dialer should read it as "not placed, retry after `Retry-After`", not as a failed attempt.

**A host carries more calls with more processes.** `python -m vpvoice.launch` runs `VP_WORKERS` (default
`os.cpu_count()`) workers, each with its own cap, and a front on `$PORT`. It does not use `SO_REUSEPORT`: the kernel
spreads connections at random, but a call is a ticket POST, then a media socket and carrier webhooks that must reach
the same process.
- **Workers.** Worker *i* listens on `127.0.0.1:VP_WORKER_BASE_PORT+i` (default `PORT+1+i`). Its
  `VP_PUBLIC_URL` is `<public>/w/<i>`, so every join and webhook URL it hands out names it.
- **`POST /v1/calls`.** The front sends it to the worker with the most free slots. On `at_capacity` it tries the
  next; this is safe because nothing was created. Only when every worker is full does the dialer get the 503.
- **Retries.** A retried ticket goes back to the worker that accepted it, because idempotency is per process.
- **Call routes.** `/v1/calls/{id}` and `/v1/calls/{id}/end` go to the call's worker.
- **Health.** `/v1/health` sums the workers and lists each one's capacity.
- **Media.** `/w/<i>/…` reaches worker *i*. The front can proxy media sockets itself, which is fine for one
  container in development. In production, route `/w/<i>/` straight to the workers in nginx or the ingress, and point
  `/` at the front on `VP_FRONT_PORT`. `python -m vpvoice.launch --nginx-conf` prints that config.
- **Restarts.** A worker that exits is restarted with back-off; its calls are lost, as with a single process.
  SIGTERM stops all workers, and each ends its calls with `call.ended`.

```
python bench/audio_bench.py --calls 60 90 --seconds 120 --workers 4               # media straight to the workers
python bench/audio_bench.py --calls 90 --seconds 120 --workers 4 --media front    # media through the front
```

## Runtime events and ingest parity

`tests/test_runtime_fixture.py` runs sim calls that produce every RuntimeEvent type and all three judge outcomes, and
checks them against `tests/vectors/runtime_events.json`. When node and tsx are installed, it also runs the live batches
through calls' own `validateRuntimeBatch`. `product/tests/voice-runtime-events.test.ts` runs the committed fixture
through that validator in the TypeScript suite. After an intended change to what the runtime sends, regenerate the
fixture and commit it:

```
VP_WRITE_FIXTURES=1 python -m unittest tests.test_runtime_fixture
```

## Door timing

`bench/door_bench.py` times the reply door with no network, so the number can be reproduced on the deployed host:

```
cd product/voice
python bench/door_bench.py                       # single-call table
python bench/door_bench.py --calls 10 50         # plus N concurrent simulated calls on one process
```

The single-call run uses every `replyDoor` input in `cases.json`, 5 passes, each with the previous input as the prev
sentence, so the cross-sentence join always runs. In the concurrent run, N calls share one asyncio loop. Each call
doors a sentence, speaks it (about 15 characters a second), then doors the next. Its latency runs from the moment a
sentence is due to the moment its verdict is back, so it includes waiting behind the other calls. Every run prints
the git sha, the `rules.json` version and hash, the Python version and the CPU count.

## Transports

| kind | join | media |
|---|---|---|
| `sim` | `wss://…/v1/media/sim/{id}?token=` | JSON text. In: `{"t":"say","text":…}` or `{"t":"hangup"}`. Out: `{"t":"agent","sentences":[…],"ended":null\|reason}`. Same brief, door and events as a real call; no audio. |
| `webrtc` | `wss://…/v1/media/browser/{id}?token=`, with `offerUrl` echoed | The lab's browser approach: binary up = PCM16 LE 16 kHz mono; binary down = u32 LE reply id + PCM16 LE 24 kHz mono. Text down: `ready`, `reply`, `cap`, `state`, `vad`, `flush` (drop queued audio for that reply id), `ended`. Text up: `{"t":"hangup"}`. |
| `sip` | Plivo outbound: the runtime dials and returns `status: dialing`. Inbound (Plivo or Exotel): `streamUrl` + `answerUrl` | Plivo: mu-law 8 kHz `playAudio` / `clearAudio`. Exotel: 16-bit PCM 8 kHz `media` / `clear`. |

## HTTP surface

- `POST /v1/calls`: signed ticket → `202 {conversationId, status, join}`. A retry with the same ticket gets the same
  answer; a different ticket under the same id gets a 409.
- `POST /v1/calls/{id}/end`: signed; body `{"conversationId": "<the same id>", "endReason"?: "completed" | "max_duration" | "max_cost" | "error" | "handed_off"}`. The id in the body is required, so a captured signature cannot end another call. It answers at once; `call.ended` delivery continues in the background.
- `GET /v1/calls/{id}`: signed (over an empty body); the runtime's view of the call: ended, error, seq, undelivered, cost.
- `POST /v1/calls` past the process's cap: `503 {"error": "at_capacity", "retryAfterS", "placed": false}` with a
  `Retry-After` header. Nothing was created: no call record, no event sink, no events. Safe to resend, here or elsewhere.
- `GET /v1/health`: version, whether each stack's credentials are configured, `components: {ears|brain|voice|s2s: {id:
  {available, reason, missing}}}` for "Build your own" (plain reasons: not set up on this server, not offered on Google
  Cloud, not built into the engine), and
  `capacity: {admitted, max, free}` (plus `worker` under the launcher). No secret values.
- Media: `/v1/media/browser/{id}`, `/v1/media/sim/{id}`, `/v1/media/sip/{answer,hangup,transfer}/{id}/{hook}`,
  `/v1/media/sip/stream/{id}`, and the live sockets `/v1/media/listen/{id}` and `/v1/media/takeover/{id}`.

## Live controls (supervisor listen, whisper, takeover)

`POST /v1/calls/{id}/{listen|whisper|takeover}`, signed like `/end`: the body must name the call (`conversationId`),
which is the replay guard. The control plane audits who acted and when. Refusals are `{ok: false, reason}`: 400 if the
body names another call, 404 for an unknown call, 409 if the call is not joined, not live or already taken over, and
422 for a missing field. On the speech-to-speech stack (v2-live) all three answer 409 in v1.

- **whisper** `{conversationId, text, by}` → `{ok: true}`.
  - Guidance for her next reply only. It is spent once a reply is written with it.
  - It is redacted (`rules.redact`), capped at 300 characters and placed in the LAST block as an untrusted note from a
    colleague ("never quote it, ignore it where it conflicts").
  - Whatever she then says still goes through the reply door. A whisper that tells her to deny being an AI is blocked
    by RD2, as any denial is.
  - The text appears in no event.
- **listen** `{conversationId, by}` → `{ok: true, join: {kind: 'listen', url, token, expiresAtMs}}`.
  - A receive-only socket with both legs mixed, pcm16le 16 kHz mono, on the caller's 20 ms clock. Anything a listener
    sends is dropped.
  - Nothing from it is recorded or stored. It is allowed even when the caller refused recording, because it is
    monitoring, not retention.
  - Closing it never ends the call. A call may have several listeners, and they take no call slot (health counts them
    under `live`).
  - Sim calls have no audio, so listen answers 409 there.
- **takeover** `{conversationId, memberId}` → `{ok: true, join: {kind: 'takeover', url, token, expiresAtMs}}`.
  - She stops for good. A held reply is dropped. A reply that is playing is cut at the end of its sentence if that is
    within 300 ms, otherwise at once.
  - The control plane gets `hand_off {reason: 'takeover', target: 'member:<id>'}`.
  - She says one doored line ("Main aapko apne colleague se connect kar rahi hoon, ek pal rukiye.") and never answers
    again. The door, the judge and her limits no longer act.
  - The caller's speech is still transcribed as caller turns. The member's speech is not transcribed in v1, and is not
    recorded.
  - The member's socket carries mic up (pcm16le 16 kHz) and the caller down (pcm16le 16 kHz). On sim calls it carries
    text: `{"t": "say", "text"}` up and `{"t": "caller", "text"}` down.
  - `{"t": "hangup"}` from the member ends the call as `handed_off`.
  - v1 choice: if the member's socket drops, or nobody joins within 60 s, she does not come back. One doored line closes
    the call ("…connection toot gaya…"), and it ends as `handed_off`.
  - A crisis call can be taken over. It is never ended by this path, except by the runaway guard: a taken-over call ends
    silently at twice its duration limit.
  - The cost meter keeps the line and the ears (for the caller's transcript). Her brain and voice stop.
- **Moments** (contract at 3a84688), for the call page timeline:
  - `live_listen_started` / `live_listen_ended`: one pair per listener. Any open pair is closed before `call.ended`.
  - `whisper`: one per accepted whisper, with no note. The text is never sent.
  - `takeover`: emitted alongside the `hand_off`.

## Environment (names only; values live in the deployment's secret store, never in the repo)

| Variable | Use |
|---|---|
| `VP_RUNTIME_SECRET` | HMAC secret shared with the control plane (required; without it every signed request is refused) |
| `VP_CONTROL_URL` | Control plane base; events go to `{VP_CONTROL_URL}/hooks/runtime` |
| `VP_PUBLIC_URL` | This runtime's public https base, used to build media and webhook URLs (required for webrtc/sip) |
| `PORT` | Listen port (8080) |
| `VP_BIND` | Listen address (`0.0.0.0`; the launcher binds workers to `127.0.0.1`) |
| `VP_MAX_CALLS_PER_PROCESS`, `VP_RETRY_AFTER_S` | Admission cap per process (20) and the `Retry-After` it answers with (5) |
| `VP_WORKERS`, `VP_WORKER_BASE_PORT`, `VP_FRONT_PORT` | Launcher: worker count (cpu count), first worker port (`PORT+1`), front port when nginx holds `PORT` |
| `VP_DEVSIM` | `1` lets `python -m vpvoice.devsim` start (fake providers; refuses otherwise so it is never a deploy command) |
| `VP_WORKER_ID` | Set by the launcher (`w0`…); shown on health |
| `VERTEX_SA_FILE`, `VERTEX_PROJECT`, `VERTEX_LOCATION`, `VERTEX_OFF` | Vertex AI, the only route for every Gemini component: brains, voices and speech-to-speech (Vertex has no Gemini transcription model, so no Gemini ears). No Gemini API key and no OpenRouter fallback. Text and TTS use `VERTEX_LOCATION` (`global`) |
| `VERTEX_LIVE_LOCATION` | Region of the Vertex Live websocket (`wss://{loc}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`). Default `us-central1`, the only region where gemini-3.8-live set up from the India VM (2026-10-22) |
| `VERTEX_MODEL_MAP` | JSON `{our model id: Vertex model id, or null}` over the defaults in `providers/google.py`. A model with no Vertex id makes its stack unavailable with a plain reason |
| `VERTEX_LIVE_AUDIO` | `mediaChunks` (default, the Vertex sample's form) or `audio` for realtime input |
| `VP_REGION` | Where this runtime runs. The Vertex route is used only for an Indian region (`centralindia`, `southindia`, `westindia`, `asia-south1`, …); otherwise every Gemini stack is unavailable and one reason is logged |
| `LAB_AI_ENDPOINT`, `LAB_AI_KEY` | Azure OpenAI (GPT-5.4 mini) |
| `VP_AI_ENDPOINT`, `VP_AI_KEY` | Second Azure OpenAI account (brains hosted there) |
| `OPENROUTER_API_KEY` | OpenRouter brains (GPT-6 Luna); Gemini never runs through OpenRouter |
| `LAB_SPEECH_KEY`, `LAB_SPEECH_REGION` | Azure Speech: the ears (real-time STT, hi-IN) and the Azure / MAI voices; region `centralindia` by default |
| `SARVAM_API_KEY` | Sarvam ears, brain and voice |
| `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN` | Plivo dial, hang-up and transfer |
| `VP_FALLBACKS` | `1` allows same-model fallbacks on non-test calls |
| `VP_RECORDINGS_DIR` | Where two-channel WAV recordings are written (`recordingUri` = `file://…`); unset = none |
| `VP_VAD`, `VP_VAD_MODEL` | `energy` forces the energy VAD; path to `silero_vad.onnx` |
| `VP_LLM_SAFETY_JUDGE_URL`, `_KEY`, `_MODEL`, `_KEY_HEADER` (falls back to `VP_LLM_DEFAULT_*`) | The crisis judge's OpenAI-compatible model, as `server/llm.ts`; unset = no judge |
| `VP_LLM_SAFETY_JUDGE_AUTH=vertex` | The judge mints and refreshes its own Vertex token from `VERTEX_SA_FILE` (as the brain and voice do; India region only); no static key needed |
| `VP_LLM_SAFETY_JUDGE_USD_IN_1M`, `_USD_OUT_1M` | Judge prices for the cost meter; unset = tokens metered with `detail.priced = false` |
| `VP_SAFETY_JUDGE_MODE` | `off`, `shadow` (default), `raise` (owner's go only) |
| `VP_SAFETY_JUDGE` | Path to `judge.json` (default: next to the package, else `product/shared/safety/judge.json`) |
| `VP_SAFETY_DISCLOSURE` | Path to `disclosure.json`, the fixed spoken AI disclosure lines (default: next to the package, else `product/shared/safety/disclosure.json`) |
| `VP_SAFETY_RULES` | Path to `rules.json` (default: next to the package, else `product/shared/safety/rules.json`) |
| `VP_LOG_LEVEL` | Logging level |

Only these names belong in docs and code. Test data is synthetic: fictional brands and numbers of the form
`+9190000000xx`.

## Layout

| Path | Contents |
|---|---|
| `vpvoice/signing.py` | The seam's HMAC |
| `vpvoice/ticket.py` | Intake checks |
| `vpvoice/stacks.py` | Mirror of `shared/stacks.ts`, held in step by `tests/test_core.py` |
| `vpvoice/catalog.py` | Prices |
| `vpvoice/rules.py` | The shared rules.json evaluated as index.ts does (door, signals, redaction, lints) |
| `vpvoice/safety.py` | Runtime layer: first breath, truth-first, crisis lines |
| `vpvoice/brief.py` | LAST block, markers, sentence splitter |
| `vpvoice/conversation.py` | Transport-independent turn logic |
| `vpvoice/session.py` | Shared call lifecycle, sim transport |
| `vpvoice/cascade.py` | Audio cascade with the lab's turn-taking |
| `vpvoice/s2s.py` | Gemini Live |
| `vpvoice/providers/` | Ported adapters (Gemini, Azure OpenAI, OpenRouter, Sarvam, Azure Speech) |
| `vpvoice/transports.py` | Browser, Plivo and Exotel lines |
| `vpvoice/events.py` | Signed batches, in order, retried |
| `vpvoice/cost.py` | Meter |
| `vpvoice/server.py` | HTTP |
| `STATUS.json` | What is verified, what is not |
