# Product/UX reset verification — 1 October 2026

## Scope and current disposition

Implementation commit: `083dc52`; research checkpoint: `c0df837`.

This record covers the first implementation pass driven by the whole-product UX reset. It verifies the new shell, Overview readiness guidance, Agent workspace, exact-version publication flow, navigation protection and a bounded private voice retry. It does not establish whole-product approval: Campaign structure, source intake and transcript-to-regression remain the next product phase.

The final automated checkpoint passed **614/614 tests**, the third production build and postbuild package validation, standalone typecheck and packaged readiness HTTP 200. Before the last three Home corrections, 612 tests plus build/package and typecheck had passed; after those fixes, 10 focused Home tests passed. This preserves the verification sequence without treating the earlier result as the final count.

## Implemented behavior

- The primary shell has five working areas—Overview, Company, Agents, Campaigns and Activity—plus Settings. The former 18 section destinations remain reachable through deep aliases, anchors, search records and contextual links rather than appearing as peer navigation items.
- History navigation participates in the same indexed unsaved-work guard as direct navigation. Cancel keeps the dirty value and URL; confirming a retried Back action produces one confirmation and goes to the intended prior working area rather than replaying an older history entry.
- Overview derives company readiness and one next action. The final review found and the implementation corrected three issues: only current unresolved failed checks remain visible as attention items; active campaigns rank above optional deployment setup; and Create agent carries a focus target into the new Agent workspace.
- Agents uses a two-column workspace with six task sections beginning with Setup and a persistently mounted test dock. The test action focuses the active mode/call controls rather than the dock heading.
- Publish captures an already-saved draft as a version, runs readiness checks against that exact immutable version, requires a separate explicit publish and then prefills Channels with the exact approved release. Publication never activates a public channel by implication.

## Browser evidence

The authenticated fictional workspace was exercised at 1280 px desktop and 390 px mobile widths.

- A Company profile industry and description were saved as revision 1.
- A new Feedback-agent preset was saved and navigation resolved to its real generated agent route.
- Readiness was captured for version 1, passed, explicitly published and handed to a new Channel draft preselected to that exact release. No public channel was published.
- Dirty-name Back navigation was cancelled once, preserving both name and URL. Retrying Back displayed one confirmation; accepting it navigated to Overview rather than an older page.
- The skip link retained the Agent route and focused the main region.
- The 390 px view had no horizontal overflow and its drawer links remained usable.
- The Test agent action focused the active test-mode/call controls.

These are browser observations in fictional local data, not a user study, production acceptance test or external-channel delivery.

Final recaptures at 1280 px desktop and 390 px mobile were valid, with no horizontal overflow. After reload, browser warning and error logs were empty. Overview's Create agent action was rechecked after its focus fix: it opened `#Agents/new`, selected Setup and presented an empty name field.

## Private voice recovery

The first private Listen & type run received a live Azure greeting and one user reply, then ended with a provider error. The interrupted test’s transcript was saved. Code inspection found that the private browser `session.update` payload omitted the `session.type` discriminant required by the Azure GA realtime contract documented in Microsoft's migration guide.

`lib/voice/browser-session.ts` now sends that discriminant, with two regression tests covering the payload. A retry on the same fictional agent received a greeting, user turn and assistant reply for a three-turn exchange. The session remained live while moving through Knowledge and Publish, then was manually ended and saved. This is bounded typed-input/live-network evidence. It does not prove physical-microphone behavior, perceptual quality, latency, external delivery or competitor superiority. No transcript, personal identifier, endpoint or credential is recorded here.

This compatibility fix does not add private-browser current-turn acknowledgement ordering before a response request. The public gateway already has acknowledgement gating; the private path still needs that separate voice-engineering correction and verification.

## Review boundary and remaining work

The final reviewer initially returned **FIX** because failed checks could disappear from attention, optional deployment could outrank active campaigns, and Overview's Create agent action dropped its intended focus target. All three were corrected. The rerun reviewer marked all three findings resolved and returned **SHIP** for this scoped fix packet. That disposition closes the three corrections, not whole-product usability approval.

The next structural product work remains:

1. Make Campaign one durable phased object from intent through results.
2. Make source intake expose processing, identity/result mapping, valid/unresolved/rejected rows and exact blockers.
3. Turn transcript/audio/tool evidence into reusable regression cases connected to a proposed change, rerun and publish decision.

Azure grant-only paid inference and the no-local-Docker employer-laptop constraint are unchanged. This pass did not create cloud resources, connect OAuth accounts, publish an external channel, deploy production hosting or add another paid provider.
