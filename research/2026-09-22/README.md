# Voice-platform product research — 22 September 2026

This research responds to the user's rejection of the current prototype as incomplete and insufficiently usable. Nine parallel research/design tracks investigated product operating models, India requirements, source reuse and evaluation. A separate synthesis review checks the resulting blueprint. This is a research and product-design deliverable, not a claim that a new production platform or a replacement prototype has been built.

## Start here

- [Revised product blueprint](../../docs/voice-platform-blueprint.md): product definition, screen contracts, detailed layouts, complete journey, existing GroupAI mapping, delivery sequence and next-prototype acceptance criteria.
- [Current prototype diagnosis](prototype-ux-gaps.md): why a scripted campaign demo is not sufficient to review a voice platform.

## Research tracks

| Report | Specific investigation |
|---|---|
| [Vapi](vapi-product.md) | Assistant configuration and versions, pipeline controls, knowledge/tools, Squads, campaigns, testing, artifacts and monitoring |
| [ElevenLabs](elevenlabs-product.md) | Expressive speech, language/voice configuration, knowledge/tools/workflows, testing, conversation analysis, versions and deployment |
| [Bolna](bolna-product.md) | India-oriented onboarding, per-language pipelines, switching, batches, carrier setup, cross-channel workflows and operational traces |
| [Retell, LiveKit and Sarvam](voice-alternatives.md) | QA and live supervision, underlying voice runtime/observability, and Indian-language speech components |
| [India business requirements](india-business-requirements.md) | Language/entities/noise, contact constraints, business integrations, first workflows, outcome measures and core/configuration boundary |
| [Existing GroupAI and relational design](relational-group-product.md) | Exact source mechanisms, current runtime limits, audience-aware continuity, emotional response and business-layer adaptation |
| [Usability diagnosis](prototype-ux-gaps.md) | Missing operating records, agent testing/release loop, command-centre decisions and acceptance criteria |
| [Voice quality benchmark](voice-quality-benchmark.md) | Fair comparison, representative corpus, blind listening, timing/task/memory metrics and claim gates |
| [Company brain and operations](company-brain-operations.md) | Glean, HubSpot Breeze and Attio patterns for permissions, source freshness, canonical records and automation history |

## Consequential findings

**Natural voice is already a competitive category.** Vapi exposes detailed voice-pipeline controls; ElevenLabs exposes expressive delivery; Bolna documents per-language configuration and switching. These are documented capabilities and vendor claims, not measured comparative quality. A distinct product requires a complete and usable relationship-to-outcome loop.

**An agent needs a lifecycle.** Treat its prompt/behaviour, language and voice, knowledge, tools, permissions, evaluation criteria and deployment configuration as a reviewed version. Make tests, traces, release state and rollback visible. A static Maya script cannot demonstrate this.

**Different evaluations answer different questions.** Text decision tests cannot prove speech recognition, natural delivery or interruption recovery. Synthetic calls, controlled live audio, human preference and business outcomes require separate evidence. Product UI must not collapse them into one “quality” badge.

**The control surfaces should differ by role.** Business users need outcomes, exceptions and next actions. Builders need configuration, source context, trace evidence and failed-test diagnosis. Progressive disclosure joins these roles without burying the business user in model options.

**India support is an operating requirement.** Code-switching, entities and pronunciation, local time/date/amount handling, mobile audio, human escalation and real connector/carrier conditions matter together. Language-count or residency marketing alone does not establish fit.

**GroupAI is a real source asset with a boundary.** Its worlds, audience epochs, source-scoped evidence, disclosure and context capsule inform the product. The audited orchestrator executes silent/reply; richer business actions and transports need additional work. Campaign cohorts are separate from GroupAI social worlds.

**Company memory must influence the next interaction.** Show permitted context before the conversation, sources and tools during it, and reviewed corrections/commitments afterward. A relationship graph that does not change authorized behaviour is not a differentiator.

## Evidence and access limits

Reports cite current first-party documentation and relevant primary research. Vendor metrics are attributed and not independently verified. Source-code findings come from the earlier 55-branch audit plus a targeted GroupAI runtime check; source execution and live validation were not performed this round.

The parent task visually inspected Vapi's public homepage and platform page using the browser, including the scenario-demo entry, configuration/observation flow and product navigation. It did not start a call, grant a microphone, register, buy anything or enter credentials. A dashboard navigation attempt did not complete; no authenticated-dashboard observation is claimed. The reports' named dashboard screens are documented surfaces, not independent hands-on verification.

Public documentation cannot establish that a feature is enabled in every plan, works reliably in our target setting, or beats a competitor. Absence from a report means not established in this review, not absent from the product. Price, carrier eligibility, regional processing and legal applicability need specific verification before a live pilot.

No provider has been selected. Production expansion remains paused. The old `/prototype` is historical and user-rejected as the complete product design. The new blueprint is proposed, and its acceptance criteria are not represented as already implemented.
