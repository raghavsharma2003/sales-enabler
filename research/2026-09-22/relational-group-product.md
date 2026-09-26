# Relationship-aware voice operations: proposed product architecture

22 September 2026. Design synthesis of the existing audits, not new runtime verification or permission to resume production. **The user clarified that “GroupID” means the existing GroupAI mechanism. This proposal introduces no GroupID entity.** “Best humanlike voice” is the quality ambition; no comparative superiority is established.

## The product to build

A company representative that remembers the right context, speaks naturally, coordinates the right people, and completes verifiable next steps across the customer lifecycle. The command centre is where people supervise that work. Voice, customer memory, campaigns and team execution share records; they are not separate demonstrations.

The distinguishing loop is **prepare with authorized relationship context → converse and adjust → confirm commitments → execute with receipts → improve the next interaction**. A warmer voice alone does not deliver this loop. A dashboard that never changes the next conversation does not deliver it either.

Browser voice remains first; telephone integration is later. Study abroad supplies the first configuration, without hard-coding student admissions into the core.

## GroupAI: use the actual relational mechanism

GroupAI already models social worlds, people, verified surface identity links, conversations, audience epochs, events, memories, relationships and disclosure. Adapt these contracts to customer/family/team coordination. Its value is authorized continuity across private and shared interactions, not a universal group identifier or blanket shared memory.

| Object | Concrete purpose and boundary |
|---|---|
| Organization — new business layer | Company tenancy, staff membership, service catalogue and operating configuration. |
| Person + verified identity links | One person and verified channel identities. A phone number, shared household device or similar name cannot establish identity alone. |
| GroupAI social world | Scoped relational context containing people, agents and conversations. Map to a reviewed business boundary; world membership does not grant access to every memory. |
| Case — new business layer | One bounded objective: consultation, application, purchase, onboarding, support recovery or renewal. Several cases may coexist in one world. |
| Conversation / room surface | Communication episode with an actual audience. GroupAI audience epochs capture participant changes. A private call stays private when its participants also share a world. |
| Grant / disclosure decision | Who may use which evidence, for what purpose, action, destination and period. Evaluated separately from membership and again before disclosure/action. |
| Agent + new specialist execution | Existing agent identity extended with assigned objective, permitted tools, budget and expiry. It receives scoped context, not the world's entire memory. |

Example: a student, parent and counsellor share an application world. The parent may see agreed deadlines and an authorized fee summary. A student's private uncertainty remains in its permitted audience. A document specialist receives document requirements and status; it does not need private interview excerpts. Adding a parent or replacing the counsellor triggers explicit access review, never historical blanket sharing.

Business world creation/linkage needs reviewed identity evidence; linkage cannot silently merge people or grants. The product shows “People and access,” “Conversations” and “What the agent can use,” with world scope in the technical audit view.

The runtime binds a claimed turn, authorized preparation/citation-bearing capsule, intervention decision, model request/result, privacy revalidation and reply commit. Separate delivery contracts govern transport. The capsule consumes already-authorized evidence; it does not verify identity or consent. `intervention-policy` describes silent/react/reply/ask-permission/move-to-DM/action outcomes, but `packages/agent-orchestrator/src/orchestrator.ts` executes **only silent and reply**; other decisions return `action_not_implemented` without output. Business actions, specialist handoffs and permission prompts need new composition, real providers and transport workers.

## RelationalOS and EmotionalOS as usable behavior

RelationalOS should govern continuity: preferred name and honorific, language/register, stated needs, known history, outstanding promises, boundaries and unresolved friction. These are scoped, source-bearing records. The existing dyadic trust/rupture machinery is a reference, not a business scoring model.

EmotionalOS is a proposed response policy, not a proven source subsystem or emotion detector. It adapts turn length, pace, acknowledgements and escalation to explicit statements and tentative interaction signals. Do not store “anxious customer” as a durable fact because a classifier inferred it.

| Observed situation | Voice behavior | Operator/customer control |
|---|---|---|
| “Please explain in Hindi” | Switch register; check understanding without repeating the entire pitch. | Language control; remember preference only with appropriate scope. |
| “I'm worried about the fees” | Acknowledge the expressed concern; explain approved options; ask what information would help. | Source-linked concern, editable summary; no inferred income or emotional persuasion. |
| Customer interrupts or asks for brevity | Stop playback, acknowledge correction and shorten the next turn. | Visible interruption state, “slow down,” “short answer,” mute/end controls. |
| Company missed a promised callback | Name the missed promise, apologize once and offer an accountable next step. | Open recovery action with owner/due date; no invented resolution or automatic “trust restored.” |
| A second person joins | Re-establish audience and use only evidence authorized for that audience. | Participant indicator; private-note boundary; explicit share preview. |
| Uncertain answer or requested exception | State the limit, retain the question and hand off with a concise permitted brief. | Human takeover, editable handoff, visible unresolved question. |

Humanlike means attentive timing, natural prosody, competent repair and continuity. The representative introduces itself as AI. Optional authorized brand voices do not authorize impersonating a human employee or claiming feelings, lived experiences or personal attachment.

## The concrete before/during/after loop

**Before:** an enquiry enters an import/reconciliation queue. An operator confirms identity and world/case linkage. A campaign selects an eligible audience and objective. The call brief shows approved company facts, authorized relationship notes, previous commitments, unknowns, contact constraints and available actions. Preview exactly what the agent can know and say for this audience. Recheck context freshness, suppression and action authority at execution.

**During:** the agent discloses AI identity, confirms the purpose and negotiates language. A live workspace shows listening/speaking/interruption/reconnecting/fallback states, participants, permitted context citations, unresolved questions and proposed next steps. Specialist work can run behind the conversation, but the speaking agent remains coherent and specialist output is checked before use. Availability lookup is distinct from booking. A proposed appointment becomes confirmed only after a booking receipt. The operator can take over with the same authorized brief.

**After:** present a structured outcome: customer statements, uncertain interpretations, agreed actions, memory proposals and disclosure scope. Corrections replace affected projections with retained provenance. Authorized execution produces accepted/confirmed/failed/uncertain receipts; uncertain dispatches go to reconciliation, not blind retry. The next conversation inherits the corrected facts and unfinished commitments. A feedback interview creates a service-recovery action or evidenced improvement theme; completing the task and notifying the customer remain separate outcomes.

## Screens and actions that make the architecture tangible

| Surface | Records shown and meaningful actions |
|---|---|
| Command centre | Today's conversations, unresolved promises, blocked actions, campaign exceptions and outcomes. Drill into evidence; assign owner, pause campaign, take over or reconcile delivery. |
| Customer relationship workspace | Participants/roles, linked cases, shared timeline and private/shared sections filtered for viewer. Review membership, invite participant, preview sharing, open case and inspect identity matches. |
| Memory and evidence drawer | Exact source excerpt, author, observed/reported/inferred status, audience, purpose, freshness and correction history. Correct, dispute, restrict, forget or inspect downstream uses. |
| Live conversation | Audio/transcript, audience, call brief, action proposals and connection status. Interrupt, change language, request human, approve eligible action or end. |
| Campaign studio | Objective, audience exclusions, sequence, representative, timing, budget and person-specific preview. Test, review, schedule, pause/resume and inspect launch version. |
| Commitments and service workspace | Agreed action, assenting participants, owner, due date, delivery receipt and outcome. Accept, amend, dispute, complete and separately notify. |
| Agent studio | Disclosure, permitted roles/tools, language examples, pronunciation, pacing and handoff policy. Compare recordings, inspect failures and publish a reviewed version. |
| Company brain and improvements | Approved services/answers alongside feedback excerpts and themes. Resolve conflict, publish correction, assign improvement and measure follow-through. |

The lifecycle is acquisition → qualification → consultation → offer/decision → onboarding → service → feedback/recovery → renewal/referral. Cases and campaigns change; customer identity and authorized continuity persist. Pricing/quotes, onboarding plans, service and renewal objects are new product work, not existing CommandCentre features relabelled.

## Preserve, extract and build: exact provenance

All source claims below are static audit findings. **Preserved** means preserve an existing source capability in the target design; **extract** means future selective adaptation, not code already imported.

| Disposition | Repository, branch and exact paths | Target use and limit |
|---|---|---|
| Preserve + extract | `html-portfolio`, `claude/ai-companion-app-rkt1lv` (`f4d3fe4…`): `src/components/useCallEngine.ts`, `src/engine/compiler.ts`, `src/engine/relstate.ts`, `src/voice/liveCall.ts`, `src/voice/speech.ts` | Context compilation, exclusive audio ownership, interruption/reconnect and relationship continuity. Replace companion identity/dyadic assumptions; device/provider quality unverified. |
| Extract | `html-portfolio`, `claude/vyakti-cloning-platform-aq05n4` (`6d7d9bc…`): `api/_experience-compiler/relational-materializer.js`, `api/_voice/hindi-text-frontend.js`, `api/_voice/registry.js` | Source-grounded accepted claims, bounded Hinglish frontend and provider seams. Branch states runtime/live SQL pending. |
| Preserve + extract | `Vyakti-GroupAI`, `codex/relational-core` (`4bae159…`): `packages/relational-core/src/memory.ts`, `packages/relational-core/src/privacy.ts`, `packages/context-capsule`, `packages/postgres-runtime/src/world-scope.ts`, `packages/delivery-runtime/src/runtime.ts`, `packages/follow-through-core` | Scoped evidence, audience-bound context, disclosure, reliable delivery and consented commitments. Source orchestrator executes only silent/reply; providers, transports and end-user product remain absent. |
| Preserve + extract | `command_centre`, `main` (`c8fd321…`): `components/import/import-wizard.tsx`, `components/pipeline/lead-detail-sheet.tsx`, `lib/cold-email/sequence-engine.ts`, `lib/cold-email/suppression.ts`, `app/cold-email/journeys/page.tsx` | Reconciliation, CRM, campaigns, suppression and evidence-backed journeys. Replace tenancy/auth assumptions and unify action dispatch; production operation unverified here. |
| New build | `sales-enabler` proposed layer | GroupAI-backed case/membership UX; business permissions; specialist orchestration; company onboarding; commercial/service objects; shared action control; memory review; emotional response controls; feedback-to-improvement loop. No source audit establishes these as complete. |

Acceptance must demonstrate authorized cross-conversation recall, corrected memory, audience changes without disclosure, interruption recovery, accurate language/numbers, truthful action receipts and completed follow-through. Evaluate voice and task outcomes separately; attractive simulations and historical source harnesses cannot establish live quality.

Evidence: [HTML runtime audit](../html-second-pass.md), [31-head ledger](../html-capability-coverage.json), [reuse provenance](../../docs/reuse-provenance.md), [GroupAI audit](../vyakti-audit.md), [CommandCentre product audit](../command-centre-product-second-pass.md), [product flow v2](../../docs/product-flow-v2.md).
