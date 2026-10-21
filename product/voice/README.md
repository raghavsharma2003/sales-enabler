# VP voice runtime (`product/voice`)

Runs one call from a signed `CallTicket` and reports `RuntimeEvent` batches back to the control plane. The contract is
in `product/shared/runtime-protocol.ts`, `agent-config.ts`, `stacks.ts` and `safety/index.ts`. This package codes
against those files and does not change them.

It is a port of the voice lab (`voicelab/server/`), generalised from four hard-coded scenarios to whatever the ticket
says: the agent config, the brief compiled once by the control plane, the stack, the contact, the limits.

```
python -m pip install -r requirements.txt
python -m vpvoice                  # serves on $PORT (8080)
python -m unittest                 # from product/voice; no network
docker build -f product/voice/Dockerfile -t vp-voice .   # from the repository root
```

## What a call does

1. **Intake.** `POST /v1/calls` checks the HMAC signature, then validates the ticket (`vpvoice/ticket.py`). It refuses
   a ticket it cannot run exactly as written:
   - an unknown stack, or no stack (there is no default);
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
All 1,979 vectors in `cases.json` pass (`tests/test_safety_cases.py`).

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

- Disclosure is a first-person affirmation the door passed ("main … AI assistant hoon", "I'm an AI"), never a mention.
- Each sentence is doored alone and with the sentence before it in the same reply.
- A canned replacement ends the reply.
- Identity is confirmed only by an explicit yes to a question that named the person.
- Gemini Live audio is held until its whole turn has passed the door.
- A brain stream closed early is metered as an estimate (`detail.estimated`).

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
- `GET /v1/health`: version, and whether each stack's credentials are configured. No secret values.
- Media: `/v1/media/browser/{id}`, `/v1/media/sim/{id}`, `/v1/media/sip/{answer,hangup,transfer}/{id}/{hook}`,
  `/v1/media/sip/stream/{id}`.

## Environment (names only; values live in the deployment's secret store, never in the repo)

| Variable | Use |
|---|---|
| `VP_RUNTIME_SECRET` | HMAC secret shared with the control plane (required; without it every signed request is refused) |
| `VP_CONTROL_URL` | Control plane base; events go to `{VP_CONTROL_URL}/hooks/runtime` |
| `VP_PUBLIC_URL` | This runtime's public https base, used to build media and webhook URLs (required for webrtc/sip) |
| `PORT` | Listen port (8080) |
| `GEMINI_PAID_KEY` | Gemini API: ears (Live transcription), speech-to-speech, and text/TTS unless Vertex is configured |
| `VERTEX_SA_FILE`, `VERTEX_PROJECT`, `VERTEX_LOCATION`, `VERTEX_OFF` | Optional Vertex AI route for Gemini text and TTS; chosen once per call |
| `LAB_AI_ENDPOINT`, `LAB_AI_KEY` | Azure OpenAI (GPT-5.4 mini) |
| `VP_AI_ENDPOINT`, `VP_AI_KEY` | Second Azure OpenAI account (brains hosted there) |
| `OPENROUTER_API_KEY` | OpenRouter brains and the styled Gemini voice |
| `LAB_SPEECH_KEY`, `LAB_SPEECH_REGION` | Azure Speech (MAI-Voice) |
| `SARVAM_API_KEY` | Sarvam ears, brain and voice |
| `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN` | Plivo dial, hang-up and transfer |
| `VP_FALLBACKS` | `1` allows same-model fallbacks on non-test calls |
| `VP_RECORDINGS_DIR` | Where two-channel WAV recordings are written (`recordingUri` = `file://…`); unset = none |
| `VP_VAD`, `VP_VAD_MODEL` | `energy` forces the energy VAD; path to `silero_vad.onnx` |
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
