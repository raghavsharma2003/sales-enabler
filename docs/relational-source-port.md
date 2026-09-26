# Executable relational voice port

Date: 2026-09-22. This describes the new pure runtime, not proof of microphone
quality, production readiness, or a complete transplant of the companion app.

## Exact source and inspection

Read-only source: `research-sources/html-portfolio`, branch
`origin/claude/ai-companion-app-rkt1lv`, commit
`f4d3fe4e4f9ffc665c116ce022b3f63c8fefbd21`.

Inspected source at this commit: `src/engine/relstate.ts`, `moment.ts`,
`compiler.ts`, `inner.ts`, `localHeart.ts`, and `texture.ts`. Selected this
lineage because it contains the integrated call/compiler and relational state
mechanisms, rather than selecting a later clone branch merely by date.

| Source mechanism | Executable destination | Retained and changed |
| --- | --- | --- |
| `relstate.ruptureRepairShift` | `lib/voice/relational-runtime/relstate.ts` | Direct selective port, preserving symbol, input/result names and branches. A conflict opens repair immediately, re-conflict regresses it, and two distinct caller repair signals move open → repairing → repaired. Assistant apologies never supply a signal. |
| `relstate.honorificShift` | Same module | Direct selective port of asymmetric address movement and its evidence thresholds: explicit invitation, or three episodes over seven days, with immediate regression taking priority. Invalid timestamps are now excluded and span notes use sorted extrema. The active business call supplies no invented historical episodes: only a cited explicit invitation or directed conflict moves register. |
| `moment.detectMomentShape`, `hasDeixis`, `momentGate` | `lib/voice/relational-runtime/moment.ts` | Adapted whole-word, authored vocabulary, single priority gate and current-turn-only recall pull. Business phrases replace broad companion triggers. Blank normalized keys and unsupported punctuation/emoji cannot create a moment; quoted, attributed, hypothetical and negated clauses are excluded. No inferred silence from elapsed time. |
| `compiler.compile`, T2/T4/T6 slots | `index.ts` compiler | Newly implemented business compiler uses the source's one-turn gate, snapshot-before-background ordering, source citations, whole-block JSON budgeting and standing-background versus explicit-pull distinction. No companion core, persona registry or romantic stage is copied. |
| `inner.ts` cause-bound continuity and G1/G6 | `index.ts` carried concern | Newly implemented adaptation, not a verbatim port: the exact caller cause and span travel together with conversational behavior. Removing or revising the source removes the derived concern. Usage timing, silence, acoustic guesses and assistant output cannot create it. It describes unresolved work in this conversation, never a simulated feeling the caller must service. |

`localHeart.ts` was inspected and deliberately not copied: its mood classifier,
random response banks, romantic language, fabricated personal activities and
automatic learned facts are unsuitable for the company agent. `texture.ts` was
inspected for its citation and sample-size gates; its self-reinforcing humor,
profanity and teasing counters are not implemented here. The source's trust
scalar, private-life callbacks, agent IDs, SQL writers, days-based rupture lapse
and affect appraisal are not claimed as ported features.

## Runtime contract

`compileRelationalRuntime({ entries, relationship?, settings?, callId? })`
accepts the complete finalized transcript of one call, server-compiled approved
`RelationshipContext`, and allowed/primary languages. The general agent prompt
continues to own its response style. The runtime is provider-neutral TypeScript,
importable in both browser and server, with no network, filesystem, credentials,
randomness, implicit clock, database import or model call.

It returns `version`, `scope`, `callId`, `sourceRevision`, `sourceIds`, `state`,
the current `moment`/`pulled` gate, `events`, `correctionCandidates`, and
`instructions`. `state` contains `repair_state`, `rupture_open`, `honorific`,
`language`, optional `address`, `formality`, `pace`, `pauseRequested`, and an
optional source-bound `concern`. Event IDs are deterministic within a replay;
each caller event cites the exact entry ID/index and character span. Approved
initial preferences cite their memory IDs. This is a per-call derived ledger,
not a permanent accepted customer-memory ledger.

The caller must replay after each finalized user turn and update provider
instructions **before** asking for that turn's reply. The server should replay
from its authorized saved call inputs when persisting the ledger; do not accept
client-submitted events as trusted records. Instructions are behavior guidance
to a generative voice provider, not a guarantee of its acoustic delivery.

Repeated provider IDs count once; revised text replaces that ID's text at its
original transcript position. Assistant turns cannot alter state. Starting a
new call produces fresh state except for explicitly approved relationship
preferences. Revoked memories must be removed from the supplied approved
context; replay then removes their effects. There is deliberately no prior-state
parameter that could retain a revoked or edited source invisibly.

## Resulting behavior

Language, chosen name, explicit register, requested brevity/unhurried pace and
pause survive ordinary later turns. A clear new preference changes them;
explicit continuation releases a pause. Hindi's professional default is `aap`.
Ordinary use of `tum`, code switching, repeated visits or elapsed time cannot
earn familiarity or establish trust. An initial caller confirmation lowers the
repair intensity; a second distinct caller confirmation closes the repair.
The compiler tells the voice agent to proceed naturally without repeated
apologies or requests for reassurance.

Literal cues remain the bounded observation front end, with the existing
`emotional.ts` detector reused. They now drive a replayable state transition
engine and dynamic instructions rather than only an inspector. The model still
handles ordinary conversational meaning from the full transcript. The phrase
inventory is intentionally incomplete; absence of a match is not evidence of
an emotional state. No inner-emotion diagnosis or numerical trust assessment is
produced. Corrections remain `requires-review`; no permanent fact, permission,
external action, completed commitment or verified identity is created.

## Verification

`npx tsx --test tests/relational-runtime.test.ts` exercises repair hysteresis,
assistant exclusion, deterministic replay, revised/duplicate IDs, exact source
spans, persistent preferences/pacing, pause/resume, language constraints,
negation/quotation, source revocation, blank-turn gates, caller-pulled history,
and the source honorific episode/day thresholds. These are offline behavioral
contracts, not live voice evaluation. Integration and provider verification
are recorded separately by the application workstream.
