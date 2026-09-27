# Voice and chat conversation phases — 27 September 2026

The shared public prompt previously kept first-response and welcome instructions in every turn. Voice appended a conflicting continuation rule, while chat relied on a bounded recent-history window to imply whether an introduction had already happened. That window eventually drops the first exchange.

The compiler now keeps identity, privacy, approved facts and task instructions invariant. Only the first voice response receives the welcome script. Later voice replies receive continuation instructions, without an unsupported claim that an interrupted introduction was heard. Chat chooses its first/continuing phase from retained server assistant entries, independent of the last twelve entries supplied to the model. The deterministic first-chat AI disclosure remains in place. This follows the explicit conversation-phase approach in the [OpenAI Realtime prompting guide](https://developers.openai.com/api/docs/guides/voice-prompting).

## Local verification

- 42 focused public protocol, service, WebSocket gateway and adversarial public-agent checks passed. These cover eight-turn chat history, interruption before the opening response arrives, truthful identity instructions, public-only knowledge, authorization and playback-history behavior.
- An oversized phase wrapper returns a configuration conflict (409), without a provider request, instead of becoming a generic provider error (502).
- 27 shared Telegram/channel/vault checks passed after the invariant compiler change. The channel worker still applies its explicit AI message label.
- The separate Foundry management helper passed 10 offline tests. After the browser playback fix, four caller-path tests and five playback-ledger tests also passed. The final combined targeted run passed **88/88** checks. This is not a rerun of the historical 526-test integrated suite.
- Typecheck, production build and standalone private-artifact check passed.

## One bounded live Azure conversation

`scripts/public-voice-phase-smoke.ts` runs one synthetic conversation through the production prompt compilers and configured Azure Realtime deployment. The live run completed four responses, acknowledged four session updates and applied the relational runtime to all three caller turns. It returned 1,368,000 bytes of 24 kHz PCM and reported 5,700 total tokens across the four responses.

The synthetic transcript checks passed: the opening disclosed AI identity; ordinary follow-ups did not repeat the introduction; office hours matched supplied facts; the completed-consultation question received one supported next step; and an explicit identity question received a truthful AI answer. The ignored receipt is `data/azure-foundry/voice-phase-live-smoke.json` and contains synthetic inputs/outputs only. The first invocation failed in local TypeScript transformation before connecting; after that correction, exactly one live conversation ran for this script.

This is generated-audio and transcript evidence, not microphone, perceptual listening, acoustic interruption, device or competitor evidence. The sample still contains formulaic caveats; these passing checks do not establish best-in-market naturalness.

## Preview startup correction

The packaged Next server changes its working directory. Restarting with a relative SQLite path initially opened a new empty store under the build output. That temporary store was preserved outside the deployable artifact, and the private local configuration now points to the original workspace database by absolute path. The original database was not replaced. The rebuilt preview's health and existing public demo endpoints then returned HTTP 200; the standalone package check remained clean. Future local standalone launches must preserve the absolute database path.

## Browser follow-up — failure reproduced and bounded retry passed

The existing fictional public demo loaded with working text/voice mode controls. The first Listen & type call displayed its opening transcript, but its first typed follow-up ended with the UI's generic audio-playback interruption message. The Azure gateway had started response two without reporting a provider error. A second run after adding bounded diagnostics identified **queue_full**: a valid Azure reply exceeded the old 20-second queue bound. That run still failed and is retained as failure evidence.

The caller-path regression reproduces a clock advancing between reads: a start time calculated from one `AudioContext.currentTime` can be earlier than a later reading passed to the strict playback ledger. The handler now uses one clock observation for start, queue bound and ledger scheduling, and interruption also reuses one observation. Valid empty PCM chunks are ignored without creating an audio buffer or heard-history record. Malformed PCM, binding, queue and scheduling failures retain termination behavior and emit only a bounded diagnostic enum. The existing playback ledger and its response-ownership, unheard-audio suppression and truncation rules are unchanged. These fixes are regression-tested; the original browser failure did not expose a diagnostic, so its precise triggering branch was not captured.

The queue now permits at most **45 seconds** including the incoming chunk's end, approximately 2.16 MB of PCM16 before browser buffer overhead. A regression accepts 23.5 seconds and rejects a chunk that crosses the total bound. After rebuilding, a third real Listen & type run received both the opening and the same typed follow-up's complete answer, remained connected, and added no new playback warning or console error. The follow-up did not repeat the AI introduction. The earlier warning remains in the tab's historical log and must not be mistaken for a fresh failure.

This closes the specific tested browser continuation failure, not general device/audio quality. The published demo still produced a longer-than-requested answer despite a brevity request; short-turn adherence and phrasing remain explicit quality work. Generated transcript completion and successful browser scheduling do not establish human-rated listening quality or physical microphone/barge-in behavior.

Azure project creation remains blocked on the missing management identity values and actual existing resource-group name. No new Azure project, resource group, subscription, hosting or IAM grant was created in this pass.
