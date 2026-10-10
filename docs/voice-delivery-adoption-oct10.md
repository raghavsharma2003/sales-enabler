# Voice delivery source adoption — 10 October 2026

Status: source audit plus implementation reconciliation. The source findings
and original recommendation below informed the bounded implementation at
`cbe5f49dc915da0b93fd3ed2083eb5d9873188db`. Where the original proposal is
stricter than the committed contract, it is labeled as a future hardening idea
rather than current behavior.

## Decision

The adopted increment is one small, Azure-only, versioned speech-delivery
profile for requested acoustic speaking speed. The existing relational compiler
remains responsible for content, language choice, brevity and conversational
repair. A prompt that says “speak slowly” is not structured acoustic control;
an exactly acknowledged provider `speed` value establishes only that Azure
accepted the requested setting, not that a listener perceived the intended
pace. The broader EmotionalOS vibe model, Chatterbox style dials, companion
identity, inferred mood and Mirror training purpose were not ported.

### Implemented contract at `cbe5f49`

`lib/voice/speech-delivery.ts` implements this exact public shape:

```ts
type SpeechDeliveryProfile = {
  version: 1;
  pace: 'standard' | 'unhurried';
  adaptToRequests: boolean;
};

type SpeechDeliveryDecision = {
  speed: 1 | 0.9;
  pace: 'standard' | 'unhurried';
  basis: 'agent_default' | 'caller_request';
  sourceTurnId?: string;
};
```

`docs/speech-delivery-contract-oct10.md` is the canonical behavioral contract
for these fields and the finite request grammar.

All profile fields are required when the object is present; unknown keys,
versions and coerced values are rejected. Absence remains absence so historical
snapshots and hashes do not gain a new field. `0.9` is a conservative authored
condition, not a calibrated “human” or “calm” rate. With `adaptToRequests`
enabled, the finite anchored grammar recognizes direct slow/normal requests in
English, Hindi and Hinglish, including the bounded “explain the next step
slowly, one point at a time” proof form. Concern, confusion, the self-report
“overwhelmed”, response length, language choice, a relationship cue and a model
guess do not independently change speed. The decision replays over ordered,
committed final user turns; replacement/deletion of a turn removes its effect.

### Original proposal that was not implemented

The first audit sketch called the setting `adaptToExplicitRequests` and proposed
a versioned decision carrying cue text SHA-256, UTF-16 span and rule ID. The
implementation instead uses `adaptToRequests` and records only `sourceTurnId`
on a caller-request decision. Those hash/span/rule fields remain a possible
future provenance hardening, not evidence currently stored by the runtime.

For the present Azure OpenAI Realtime GA route, emit the decision as
`session.audio.output.speed`. Microsoft documents `speed` as a numeric output
field from `0.25` to `1.5`, default `1`, changeable only between model turns:
[Microsoft Foundry Realtime REST reference](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/realtime#openai-realtimesessioncreaterequestgaaudiooutput).
This is distinct from Azure Voice Live's `voice.rate` string and Azure Speech
SSML `<prosody rate>`; neither schema should be sent to the current adapter.
[Voice Live speaking rate](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to#speaking-rate)
and [Speech SSML prosody](https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/speech-synthesis-markup-voice#adjust-prosody)
are future adapter references only.

## What the owned sources actually provide

This audit used the existing local mirrors named in
`research/2026-10-09/branch-inventory.json`; it did not enumerate or fetch the
56 heads again.

### Maya / Meera

The pinned Maya source selects a real acoustic identity but has no structured
rate control. In `raghavsharma2003/html-portfolio`, branch `main`, commit
`3a9217981b27636745fc70ac490aacf9ef3f392d`,
`src/voice/liveCall.ts:3066-3074` configures Gemini Live with Despina and
`hi-IN`; `api/speech.js:218-221,429-430` selects Despina for cascade TTS. The
remaining rhythm, short-turn and punctuation behavior recorded in
`docs/maya-port.md` is prompt or text shaping. It cannot establish a requested
waveform rate, and it cannot be translated into Azure by renaming the voice.

Reuse: retain the existing voice-profile separation and displayed-text versus
spoken-text seam. Do not claim the Despina preset or Maya delivery prompt is a
speed control.

### Measurable delivery observations

The strongest reusable evidence contract is in
`raghavsharma2003/html-portfolio`, branch
`claude/vyakti-cloning-platform-aq05n4`, commit
`ebe16cc061f1db02b2ba2922a96e3dc3e033d07f`.
`api/_experience-compiler/mirror-expression.js:46-61` binds turn duration,
token count, derived words per minute and Latin/Devanagari transition ratio;
`:64-73` keeps RMS as a signal measurement rather than an emotion claim; and
`:76-145` binds consent, source hash, audio span, turn ID, expiry, ruleset and
ASR lineage. This observes delivery after settled ASR. It does not control
delivery, identify language, prove perception, or authorize customer-call
analytics under the source's owner-training consent.

Reuse: copy the evidence shape, not the training purpose—exact turn, digest,
span, derivation version and bounded claim. A later measured-WPM field would be
an observation paired to audio, not proof the provider honored a requested
speed.

### Language switching beyond a prompt

The same branch and commit has an executable spoken-text frontend.
`api/_voice/hindi-text-frontend.js:113-151` changes only reviewed Roman-Hindi,
borrowings and unambiguous symbols while leaving unresolved English intact.
`:244-268` explains why Hinglish is kept in one Hindi-conditioned generation
rather than spliced into separate voices, and `:282-325` emits an audited,
hashed single-utterance synthesis plan with bounded language support and
warnings.

Reuse later in a cascade-TTS adapter: preserve transcript text, derive separate
spoken text, keep one continuous utterance, retain transformations and warn that
code-switch pronunciation is unqualified. The current native Azure Realtime
route has no equivalent application-owned text-to-synthesis seam, so this is
not part of the minimal speed increment. The existing relational runtime can
select an allowed language, but that selection remains an instruction to the
model (`lib/voice/relational-runtime/index.ts:124-130,158-168`), not provider
acknowledgement of acoustic language or pronunciation.

### Vocal style beyond a prompt

The later Vyakti branch does have structured style control, but only for its
Chatterbox path. At the same repository/branch/commit,
`api/_voice/prosody.js:180-223` maps validated vibe/register inputs into closed
rate, energy, pitch-range and pause bands; `:225-269` creates bounded Chatterbox
style deltas; and `:293-315` clamps `exaggeration`, `cfgWeight` and
`temperature` and optionally inserts a pause glyph. `api/room.js:386-416`
passes those deltas into the Chatterbox provider request. Its own comments
correctly call the mapping authored rather than measured.

Reuse: the closed/versioned decision and provider-specific adapter boundary.
Do not copy vibe-to-style inference or Chatterbox numbers into Azure. Azure
OpenAI Realtime currently documents structured speed for this session shape,
not those style fields. The source's `rateBand` is also indirect: the provider
request receives style deltas and text punctuation, not a numeric acoustic
rate.

### RelationalOS, EmotionalOS and GroupAI

The pinned `Vyakti-GroupAI` `codex/relational-core` tip remains
`4bae159631ca3f18da0ede48596f593a55b6728c`. Its delivery runtime concerns
durable message intent, leases, idempotency and confirmed/uncertain receipts;
it has no speech-rate, prosody or language renderer. Current sales-enabler
already uses the useful relational behavior lineage: explicit language and
pacing events (`lib/voice/relational-runtime/index.ts:110-130`) become next-turn
instructions (`:158-184`). “Brief” changes answer length and “unhurried” changes
wording. Neither currently changes waveform speed.

## Current application seam

At baseline commit `5983bd591efd8e0ac427b7bc17040eaad0af244c`,
`AgentConfig` has language, response style and voice profile but no acoustic
delivery contract (`lib/platform/agents.ts:12-22`); the shared session builder
sets only the output voice (`lib/voice/session-config.ts:12-25`); and the
private scheduler gates `response.create` on an exact acknowledged instruction
revision (`lib/voice/private-turn-scheduler.ts:61-102`). The audio proof already
has the right outer evidence boundary: versioned scenario criteria, immutable
audio artifact hashes, a manifest, and a human review bound to both output hash
and manifest digest (`lib/evaluations/audio-schema.ts:20-46,90-170` and
`lib/evaluations/audio-service.ts:200-255`).

Commit `cbe5f49dc915da0b93fd3ed2083eb5d9873188db` implements the bounded
contract. `AgentConfig` accepts the strict profile only for the Azure
`provider-default` voice; old versions without it remain unchanged. Private and
public voice paths resolve speed from committed final caller turns. Their
schedulers include speed in the same pending snapshot as instructions and wait
for an exact `session.updated` echo of `session.type`, the complete instructions
and numeric speed before releasing `response.create`. The Voice Proof Run
records configured profile, initial/final decisions and initial/final provider
acknowledgement booleans in its versioned manifest.

## Implemented provider acknowledgement and evidence pairing

The committed exact gate owns instructions and speed together:

1. It resolves the profile from the immutable agent version and the delivery
   decision from committed final user turns.
2. When no profile exists, it omits `speed` so historical wire behavior and
   config hashes stay unchanged.
3. When a profile exists, it sends one `session.update` between responses containing
   `session.type === "realtime"`, the exact revision-tagged instructions and
   `audio.output.speed`.
4. It accepts only a `session.updated` whose session type, complete instruction
   string and numeric speed equal the pending snapshot. A stale, partial or
   mismatched acknowledgement must not release `response.create`; retain the
   existing bounded timeout and fail closed.
5. It records the implemented decision, including `sourceTurnId` when a caller
   request owns it. The proof manifest stores `runtimeVersion`, a
   `sessionBaseDigest`, configured profile, initial/final decisions and boolean
   initial/final exact-ACK results.
6. It pairs the manifest with agent-version/config digest, provider/model/voice
   references, output artifact SHA-256 and duration. A listening review binds
   the exact output artifact hash and manifest digest. A provider echo proves
   configuration acceptance; the artifact and human review are the evidence
   boundary for perceived delivery.

The committed proof runner requires both initial and final exact
acknowledgements when a profile is configured before it can request and finish
the response. A run without the requested speed acknowledgement cannot become
a pacing pass. Historical runner-v1 manifests remain readable and make no
speed claim.

The earlier recommendation to persist cue text digest/span and requested versus
acknowledged session-tuple digests was not implemented. The committed manifest
uses `sourceTurnId`, `sessionBaseDigest`, the existing session/manifest digests
and exact-ACK booleans. Do not describe the stronger proposed fields as current
evidence.

## Unsafe assumptions to close

- `0.9` has not been perceptually calibrated for the configured Azure voice,
  English, Hindi or Hinglish. It may be inaudible or may reduce naturalness.
- A `session.updated` echo proves accepted configuration, not actual acoustic
  effect. Do not infer words per minute or listener perception from it.
- The committed grammar includes one anchored allowance for the built-in
  “explain the next step slowly” proof sentence. It is intentionally narrow and
  must not be described as general pacing-intent understanding.
- Existing relational “overwhelmed” and “confused” cues are appropriate for
  simpler content, but are unsafe acoustic triggers. Slowing a caller based on
  inferred state can feel patronizing and is not an explicit request.
- The provider permits speed changes only between model turns. Speculative
  instruction ACK work must never change speed while a response is active.
- The committed exact gate checks `session.type`, complete instructions and
  speed together. This closes the draft mismatch noted during the initial
  audit, but still proves configuration acknowledgement rather than perception.
- Source Chatterbox fields, Voice Live `voice.rate`, Speech SSML rate and Azure
  OpenAI Realtime `audio.output.speed` are four different adapter contracts.
- Language selection does not prove pronunciation quality. A multilingual
  voice, real Hindi/Hinglish artifacts and listeners are still required.
- The implemented `sourceTurnId` does not persist the proposed cue digest/span.
  Adding those fields remains optional future hardening and would need to keep
  raw customer text out of generic diagnostics.

## Implemented verification and remaining evaluation

Committed offline tests cover strict profile values/errors, absent-profile
serialization/hash compatibility, Azure/Maya capability separation, both
rates, opt-in adaptation, anchored English/Hindi/Hinglish requests, normal
reset and persistence, contextual guards, same-ID revision/deletion, and pure
replay from final user turns. Runtime tests cover exact
type+instructions+speed acknowledgement, stale/mismatched ordering, active
response guards and provider failure paths. Historical runner-v1 evidence stays
readable without becoming speed evidence.

The implemented paired comparison holds caller fixture/input, prompt, agent
configuration basis, model, Azure resource, voice and known runtime constant;
only delivery profile/speed differs. Realtime generation produced different
assistant wording across the `1.0` and `0.9` runs. That is expected: these are
matched caller-input generative outputs, not two syntheses of identical spoken
output text. Duration differences therefore cannot establish pace, and an
equal-output-text requirement is not part of the implemented gate.

Remaining evaluation is human review of the concealed pair for pace fit,
intelligibility, naturalness and critical-content preservation. Hindi and
Hinglish need their own matched evidence before any language-quality claim. No
profile should be selected, published or described as preferred from provider
ACKs, durations or synthetic timing alone.

The implementation turns one explicit pacing preference into a bounded,
provider-acknowledged speed request with reviewable artifacts. It does not yet
establish a preferred speed or perceived acoustic improvement. Language
pronunciation and broader expressive style remain separate evaluation projects.
