# Voice delivery source adoption — 10 October 2026

## Decision

Adopt one small, Azure-only, versioned speech-delivery profile for **acoustic
speaking speed**. Keep the existing relational compiler responsible for content,
language choice, brevity and conversational repair. A prompt that says “speak
slowly” is not acoustic control; an acknowledged provider `speed` value is. Do
not port the broader EmotionalOS vibe model, Chatterbox style dials, companion
identity, inferred mood or Mirror training purpose.

The smallest honest profile is:

```ts
type SpeechDeliveryProfileV1 = {
  version: 1;
  pace: 'standard' | 'unhurried';
  adaptToExplicitRequests: boolean;
};

type SpeechDeliveryDecisionV1 = {
  version: 1;
  pace: 'standard' | 'unhurried';
  speed: 1 | 0.9;
  basis: 'agent_default' | 'caller_request';
  cue?: {
    turnId: string;
    textSha256: string;
    startUtf16: number;
    endUtf16: number;
    ruleId: 'direct_slower_request_v1' | 'direct_standard_request_v1';
  };
};
```

`0.9` is a conservative authored starting value, not a calibrated “human” or
“calm” rate. Only a direct request such as “please speak more slowly”, “explain
this slowly”, or “normal speed, please” changes it. Concern, confusion,
“overwhelmed”, response length, language choice, a relationship cue and a model
guess must not change acoustic speed. The decision replays over ordered,
committed final user turns; replacement/deletion of a turn removes its effect.

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

A parallel uncommitted draft observed during this read-only audit adds
`SpeechDeliveryProfile`, exact `audio.output.speed` matching in the scheduler,
and delivery data to the audio-proof manifest. Treat it as a candidate until it
is reviewed, tested and committed. Its useful choices are a strict v1 schema,
an absent-field compatibility path, Azure-only rejection for the profile, and
waiting for an echoed speed before `response.create`.

## Provider acknowledgement and evidence pairing

One exact gate should own instructions and speed together:

1. Resolve the profile from the immutable agent version and the delivery
   decision from committed final user turns.
2. When no profile exists, omit `speed` so historical wire behavior and config
   hashes stay unchanged.
3. When it exists, send one `session.update` between responses containing
   `session.type === "realtime"`, the exact revision-tagged instructions and
   `audio.output.speed`.
4. Accept only a `session.updated` whose session type, complete instruction
   string and numeric speed equal the pending snapshot. A stale, partial or
   mismatched acknowledgement must not release `response.create`; retain the
   existing bounded timeout and fail closed.
5. Record a versioned decision with cue turn ID, cue text hash and exact span.
   Record the requested session digest and the acknowledged tuple
   `{type, instructionsDigest, speed}` rather than a bare boolean.
6. Pair that tuple with agent-version/config digest, provider/model/voice
   references, output artifact SHA-256 and duration, manifest digest and the
   human pacing verdict. A provider echo proves configuration acceptance; the
   artifact and human review are the evidence for perceived delivery.

Completion of a speed-aware audio proof should require both initial and final
exact acknowledgements when a profile is configured. A complete audio response
without the requested speed acknowledgement is a failed protocol run, not a
pacing pass. Historical runner-v1 manifests remain readable and make no speed
claim.

## Unsafe assumptions to close

- `0.9` has not been perceptually calibrated for the configured Azure voice,
  English, Hindi or Hinglish. It may be inaudible or may reduce naturalness.
- A `session.updated` echo proves accepted configuration, not actual acoustic
  effect. Do not infer words per minute or listener perception from it.
- The built-in proof sentence says “explain the next step slowly”; a grammar
  limited to “speak/talk/read slowly” misses that explicit cue and can silently
  leave speed at `1` while the rubric expects unhurried delivery.
- Existing relational “overwhelmed” and “confused” cues are appropriate for
  simpler content, but are unsafe acoustic triggers. Slowing a caller based on
  inferred state can feel patronizing and is not an explicit request.
- The provider permits speed changes only between model turns. Speculative
  instruction ACK work must never change speed while a response is active.
- Exact ACK matching must include `session.type`; matching only instructions
  and speed accepts an incomplete or wrong session shape.
- Source Chatterbox fields, Voice Live `voice.rate`, Speech SSML rate and Azure
  OpenAI Realtime `audio.output.speed` are four different adapter contracts.
- Language selection does not prove pronunciation quality. A multilingual
  voice, real Hindi/Hinglish artifacts and listeners are still required.
- Persisting only `sourceTurnId` loses the exact cue after transcript revision.
  Store a digest and span, while keeping raw customer text out of generic
  diagnostics.

## Required tests before adoption

1. Profile parser: exact keys/version/enums, unknown-key refusal, `0.9`/`1`
   mapping, `maya-despina` and non-Azure rejection, and absent-profile byte/wire
   compatibility for old agent snapshots.
2. Cue replay: direct slower/normal requests in English, Hindi and Hinglish;
   “explain slowly”; last explicit request wins; same-ID revision replaces the
   prior value; deletion removes it; assistant, interim and sidecar text cannot
   change it.
3. Adversarial cues: quotation, negation, hypothetical, third-party report,
   prompt-injection text, “slow internet”, “normal price”, long input and
   ambiguous “take your time” all leave acoustic speed unchanged.
4. Scheduler ordering: exact type+instructions+speed ACK releases once; absent,
   stale, reordered, defaulted or mismatched speed never releases; newer speech
   invalidates an old ACK; active response/tool work blocks updates; timeout and
   provider error fail closed.
5. Initial session: configured speed is acknowledged before audio proof input;
   unconfigured sessions omit speed; no automatic provider fallback occurs.
6. Evidence: decision cue hash/span, requested and acknowledged session digests,
   agent version, artifact SHA and review manifest digest all match; tampering
   any member fails review; runner-v1 history remains readable without being
   upgraded into speed evidence.
7. Perceptual calibration: paired `1.0` and `0.9` artifacts using the exact same
   text, voice and model in English, Hindi and Hinglish; blinded human pacing,
   intelligibility and naturalness verdicts; no claim from synthetic duration
   alone.

This is enough to turn one explicit pacing preference into a provider-configured,
reviewable acoustic setting. Language pronunciation and broader expressive
style remain separate evaluation projects.
