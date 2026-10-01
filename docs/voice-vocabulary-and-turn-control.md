# Voice vocabulary and acknowledged turn control

Status: implemented and scoped verified on 1 October 2026. The backend checkpoint is commit `7602798`. Automated verification, the final production rebuild/package check, packaged readiness, voice-gateway health, desktop and 390px mobile browser confirmation, independent review, a live Azure public-gateway synthetic-input call, persisted server-evidence readback, and native transcription-hint acknowledgement are complete for this vocabulary/evidence extension.

## Purpose

Voice agents need help recognizing reviewed company names, product names and multilingual spellings without turning those spellings into company knowledge or assistant instructions. They also need to apply each relational turn update before requesting the next response. This implementation addresses those two concerns independently:

- speech vocabulary is bounded transcription spelling guidance;
- session-update acknowledgement is an Azure public-gateway ordering fence;
- server evidence shown in Conversations reports bounded transport observations after a call.

Vocabulary hints do not add facts, permissions, behavior, a new voice or a new provider. They do not establish better ASR quality. Acknowledgement gating does not establish acoustic quality, latency superiority or competitor superiority.

## Versioned speech vocabulary

An operator can enter short reviewed spellings on an agent draft. The server normalizes Unicode and spacing, preserves whole native-language terms, removes normalized case-insensitive duplicates with the first spelling winning, and validates the result before saving.

The current bounds are:

- at most 32 terms;
- at most 80 Unicode code points per term;
- at most 1,800 Unicode code points in the compiled provider prompt.

Empty terms, control or directional characters, angle brackets, URLs, email addresses and instruction-like text are rejected. The prompt labels the array as operator-reviewed spelling hints and explicitly says to use a hint only when supported by audio and never as a fact, permission or instruction.

The normalized vocabulary is captured in the tested agent version. A later draft edit cannot alter a published version or an already selected public deployment. Empty vocabulary clears the draft field. Vocabulary changes the version context digest, while the ordinary assistant instructions remain unchanged; it is not inserted into company knowledge, greeting instructions or continuation instructions.

For the supported Azure and OpenAI WebRTC adapters, a nonempty vocabulary becomes the `gpt-4o-mini-transcribe` input transcription prompt. An absent or empty vocabulary omits that prompt. The Gemini adapter remains unchanged and does not receive these hints. Public clients cannot provide or override vocabulary, transcription prompts or session configuration; the public gateway derives the hint only from its server-authorized released configuration.

## Azure public-gateway acknowledgement flow

The public voice gateway sends one realtime session update at a time and waits for a matching Azure `session.updated` state before proceeding. It compares the acknowledged realtime session instructions with the pending instructions because the provider acknowledgement describes the resulting session and does not echo the client update identifier.

At connection time the gateway sends the base realtime session, including the released transcription hint when present. It sends `ready` and requests the opening response only after that configuration is acknowledged. For each accepted caller turn, it compiles the current relational instructions, sends the continuation update, waits for its matching acknowledgement, and only then requests the next response. A five-second bounded timeout ends the session with `session_update_timeout`; transport failure ends it without an automatic reconnect or retry.

This acknowledgement contract belongs to the Azure public gateway. It is not a claim that every provider or every voice adapter uses the same event or ordering mechanism.

The gateway also assigns generations to caller turns and interruptions. A newer typed turn, microphone speech start or explicit interrupt invalidates an older response path across authorization and configuration waits. Late or out-of-order ASR completions can be saved and shown as transcript input, but cannot revive an older microphone generation and trigger a response. Duplicate transcription completions and duplicate acknowledgements are ignored. Session shutdown settles any pending update and prevents a late acknowledgement from creating a response.

## Conversations evidence

Public voice Conversations render validated server evidence when a saved public-voice conversation contains it. The panel shows request-to-first-accepted-server-audio time, accepted nonempty audio bytes, terminal state, cancellation request versus provider-confirmed cancellation, event offsets from session start and provider-reported token usage when captured.

The evidence is best effort. Missing turns or fields stay unknown rather than becoming zero. Request-to-first-server-audio is a server-transport metric; it does not measure browser playback, what a visitor heard, microphone behavior or perceived latency. Invalid evidence renders a neutral not-captured state and does not echo unvalidated payload fields. Non-public-voice conversations do not render this panel.

The evidence panel has only been rendered in a clearly labeled standalone synthetic fixture to exercise the actual component. No populated saved Conversation was observed in the browser, and the fixture did not write forged receipts into the database. A separate read-only database check verified persisted evidence from the successful live Azure public-gateway smoke described below; this database evidence was not used to forge or populate the browser fixture.

## Verification record

Completed automated evidence:

- the full suite passed 585/585;
- 45 focused acknowledgement, vocabulary and gateway checks passed;
- standalone typecheck and context validation passed;
- the initial and final production builds and standalone package checks passed; the final rebuild required stopping the local Node preview to release a Windows file lock;
- packaged localhost readiness returned HTTP 200 and voice-gateway health returned HTTP 200;
- agent UI testing saved three terms including a Hindi term, removed a duplicate `IELTS`, captured an immutable version, and preserved the values after reload;
- contract tests cover Unicode normalization, fixed validation failures, immutable version/release binding, context-digest binding, supported-provider routing, omission when empty, Gemini isolation, public-client override rejection, acknowledgement timeout/mismatch/duplicate handling, turn supersession and late-ASR races;
- component tests cover populated, missing, partial and cancellation evidence states without treating missing values as zero.

The first corrected live smoke attempt ended with `ended_provider_transport`. That failure remains part of the record. A subsequent bounded WebSocket-handshake-only probe connected in 1,352 ms without requesting a response or inference. This new network evidence justified one full retry, which passed through the live Azure public gateway using synthetic PCM input:

- 52 input frames and 245,468 input bytes;
- one user-transcript event and one assistant-transcript event in the smoke counters;
- 56 assistant-audio frames and 1,166,400 assistant-audio bytes;
- two completed turn events.

A read-only database check then found the latest canonical `public_voice` session with valid versioned server evidence: two recorded turns, two captured request-to-first-server-audio timings, terminal states `completed` and `completed`, `inputMode` recorded as `microphone`, outcome `visitor_stopped`, and three stored transcript turns. The audio input was generated synthetic PCM, not a physical microphone. No transcript text, identifiers, endpoints or credentials were logged in this verification record.

A separate bounded native Azure configuration-only check sent the newly compiled three-term English/Hindi transcription hint and received `session.updated` with the exact prompt echoed after 1,478 ms. It did not send `response.create` or request inference. This proves native acceptance of the compiled session configuration, not recognition accuracy.

Two browser usability defects found afterward were fixed: validation blur could insert an error and move the Save target, and the selected mobile tab had weak hover contrast. Final desktop and 390px mobile confirmation verified that an invalid first Save focuses `agent-speech-vocabulary` with `aria-invalid="true"`, the selected-tab contrast fix is present, there is no horizontal overflow, and the browser produced no error logs. The earlier save/reload/version/deduplication exercise remains the evidence for successful vocabulary persistence. An independent reviewer gave this scoped vocabulary/evidence extension a **SHIP** disposition with no material fixes.

The browser and reviewer result is scoped to the new vocabulary and evidence extension. The evidence panel remains an actual-component render in a synthetic static fixture only; no saved Conversation with populated evidence was browser-verified.

The first live smoke invocation exposed a command-line parser defect when `--expected-keyword` was omitted, and that parser was corrected. The initial corrected Azure attempt then ended with `ended_provider_transport`. Later handshake evidence supported the single successful retry documented above; the earlier parser and transport failures remain preserved rather than being treated as successful evidence.

## Remaining gates

Real microphone input, physical-device behavior, Hindi and company-name ASR accuracy, barge-in acoustics, perceived responsiveness, voice naturalness, hosted behavior and comparative quality remain open. The successful smoke used synthetic PCM even though the canonical input mode is `microphone`. Any ASR improvement must be established with labeled audio and measured results; provider acceptance of a hint is configuration evidence only.
