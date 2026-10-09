# Launch-centre product patterns — 9 October 2026

## Decision

Build a **Launch centre** around the existing immutable agent version, test run, release and deployment records. It should answer a founder’s practical questions in one place: *What changed? What evidence do I have? Where will it run? What remains unproven? What can I do next?* The current Publish panel already sequences readiness checks → publish → channels, while Test Lab, Release history and Deployments hold the deeper evidence. Preserve those records and actions; make the handoff coherent rather than inventing another release system.

The comparisons below use first-party public documentation already reviewed on 9 October. They establish documented product patterns, not signed-in parity, quality or reliability.

## 1. One launch packet, written in founder language

Show one review packet for the exact candidate: purpose; concise before/after change summary; affected knowledge, instructions, actions and privacy; originating conversation or request; applicable evidence; target channels; rollout; and rollback. AI may draft the change summary and identify affected tests from the structured diff, saving the founder from reconstructing it across screens. Every assertion must link to the underlying record.

**Accept:** adapt ElevenLabs’ proposal pattern into “Prepare launch,” backed by Relay’s existing records. Keep the current publish action for an owner/operator and existing owner-only public deployment acknowledgement. **Reject:** branches, merge conflicts and commit vocabulary; a mandatory second approver for ordinary founder-led launches; or an AI-generated summary without inspectable fields. ElevenLabs documents configuration diffs, test pass rates, recent conversations and review in one proposal, but its workflow is alpha and its planned required tests must not be presented as shipped. [ElevenLabs merge proposals](https://elevenlabs.io/docs/eleven-agents/operate/merge-proposals) · [5 October changelog](https://elevenlabs.io/docs/changelog#october-5-2026)

## 2. An exact-version evidence ladder, not one green score

Use four rows: **Configuration**, **Conversation cases**, **Voice/device**, and **Channel/host**. Each row is Passed, Failed, Missing or Not applicable, names the exact version/profile/environment, and offers one next action. Required evidence blocks only the destination that needs it: text can support a chat launch, but cannot satisfy microphone, latency, interruption or audio-quality evidence for voice. Informational checks remain visible without blocking.

AI should turn raw failures into a short grouped explanation and suggest the smallest rerun set; it must not convert missing or unmeasurable evidence into a pass. **Accept:** Vapi’s required versus informational limits and explicit measurements, plus Retell’s staged testing and version/environment binding. **Reject:** a composite readiness percentage, cross-version pass reuse, or “voice ready” from transcript-only rehearsal. [Vapi simulation latency limits](https://docs.vapi.ai/observability/simulations-advanced#set-latency-limits) · [Retell testing overview](https://docs.retellai.com/test/test-overview) · [Retell versions and tags](https://docs.retellai.com/agent/version)

## 3. A continuous Release → Channel handoff

After **Publish version**, keep the founder in the same journey and prefill a channel draft with that exact release. Show a short state rail: **Release active → Registry published → Provider activated → First live evidence**. Each state carries its own receipt and timestamp. For web, opening the public assistant can produce the first bounded session receipt. For messaging, provider webhook confirmation remains distinct. Pause, replace and rollback stay beside the affected state.

**Accept:** the existing `release:{id}` prefill, immutable deployment snapshot and separate Telegram activation receipt; surface them as one handoff. **Reject:** a generic “Live” badge after registry publication, silently switching the active release under an existing deployment, or claiming availability from a configuration check. Retell’s tags show the value of explicit version-to-environment bindings; ElevenLabs’ deployment history supports keeping an inspectable operational trail. [Retell versions and tags](https://docs.retellai.com/agent/version) · [ElevenLabs 5 October changelog](https://elevenlabs.io/docs/changelog#october-5-2026)

## 4. Test as the intended audience and public boundary

For each target channel, offer **Rehearse this launch** using the exact candidate, selected public sources, memory scope, tools, origin policy, usage limits and audience fixture. Display any difference from the editor preview before the run. AI can generate representative questions from approved source headings and changed instructions, then the operator reviews the proposed cases once; failed runs can become reusable, redacted regression cases.

**Accept:** Intercom’s audience-aware batch-test idea and conversation-derived questions, strengthened with Relay’s exact deployment snapshot. **Reject:** a playground that sees more knowledge than production, synthetic persona claims presented as real customers, or automatic promotion of generated cases. Intercom explicitly documents audience targeting and warns that its Voice Playground can use knowledge unavailable to a live caller; that is the failure mode to prevent. [Manage Fin audiences](https://www.intercom.com/help/en/articles/9357948-manage-audiences-for-fin-and-copilot) · [Fin Voice FAQs](https://www.intercom.com/help/en/articles/16248514-fin-voice-faqs)

## 5. Close launch with first-proof and exception work

A launch is complete only to the level actually observed. After deployment, show the latest meaningful receipt: first session issued, first provider activation, first conversation saved, or no live evidence yet. Route failures, disputed AI judgments, source drift and unknown provider outcomes into a small exception queue ordered by launch impact. AI may cluster duplicates, quote the triggering turn/tool receipt and draft a regression case or fix proposal; a person corrects the evidence or changes the product.

**Accept:** Retell’s transcript-linked QA and Intercom’s inspect-and-improve loop as triage patterns. **Reject:** call count, “resolution rate” or sentiment as launch proof; evaluator labels as ground truth; automatic prompt edits; and another approval step merely to acknowledge normal telemetry. [Retell AI QA](https://docs.retellai.com/ai-qa/overview) · [Intercom Fin analysis](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained#analyze)

## Recommended build order

First unify the launch packet and evidence ladder around the current Agent Publish surface. Next preserve context into the existing Deployments draft and add the four-state receipt rail. Then add audience-faithful rehearsal and the post-launch exception queue. This sequence reduces navigation and manual comparison immediately while preserving today’s authority checks, explicit publication actions and honest evidence boundaries.
