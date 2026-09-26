# The product to align on

> Historical version 1. The user requested a broader company and campaign flow. See [product-flow-v2.md](product-flow-v2.md) for the current proposal, including full customer-feedback campaigns. This document preserves the earlier conversation-centred concept and is not the current scope.

**A voice-led customer operations workspace that remembers the right context and carries customer work through to a visible outcome.** Relay is a working name. Maya is the sample agent name; final branding remains open.

We are designing one connected product with six surfaces: command centre, voice agents, people and relationships, company knowledge, follow-through, and company setup/connections. Voice is the primary interaction engine. The other surfaces make voice accurate, useful and accountable.

## The experience from start to finish

| Stage | What a company user does | What the product does | What the customer experiences |
| --- | --- | --- | --- |
| 1. Establish the company | Create workspace, assign operators, choose an industry template | Set tenant boundaries and editable company configuration | No customer interaction yet |
| 2. Teach the company brain | Add service details, policies, approved answers, source owners and freshness; connect relevant systems | Index permissioned sources, expose conflicts and missing answers | Consistent, current answers with uncertainty when needed |
| 3. Configure the agent | Set role, languages, speaking style, pronunciation, allowed tasks, disclosure, handoff and memory rules | Produce a testable agent version; keep voice provider replaceable | A natural, patient AI representative with an honest identity |
| 4. Bring in a customer | Import or capture an enquiry; resolve duplicates and assign an owner | Create a person/case with history, verified relationships, preferences and consent | Appropriate contact through an agreed channel |
| 5. Prepare the conversation | Inspect the customer brief or let the approved workflow start | Assemble only relevant, permitted company and customer context | Less repetition; no disclosure of another person's information |
| 6. Converse | Monitor or test Maya; intervene if needed | Manage turns, interruptions, corrections, multilingual speech, factual answers and proposed next steps | Acknowledgement of expressed concerns, helpful answers, room to think, easy human help |
| 7. Review the result | Inspect summary, source excerpts, proposed memory and actions | Separate what was said from inferred or uncertain facts; identify changed preferences | Corrections and commitments can be inspected and fixed |
| 8. Execute follow-through | Approve actions or configure narrow preapproved policies | Route writes through permission, consent, idempotency and delivery checks | An actual appointment, useful follow-up or resolved request |
| 9. Handle exceptions | Work an exception queue; take ownership | Surface stale knowledge, unanswered questions, uncertain delivery and overdue commitments | A person takes over instead of an endless AI loop |
| 10. Continue and improve | Review business results and conversation evaluations | Use current approved memory on the next interaction; compare agent versions | Continuity that remains correctable and respectful |

Stages describe the intended product. The prototype simulates them; current backend coverage is documented separately in README.md.

## The fictional walkthrough

Northstar Abroad is a fictional consultancy. Aanya Shah is a fictional student considering international study. All fees, statuses, calendars and messages in the prototype are sample content, not actual admissions advice or commercial claims.

1. An operator reviews the company's knowledge and configures Maya to speak English and Hindi with concise, patient turns.
2. Aanya's record shows her enquiry, source-backed preferences, assigned counsellor and open next step.
3. Maya introduces herself as AI. Aanya says she is concerned about the total cost and wants time to discuss it with her family.
4. Maya acknowledges that stated concern, offers the approved fee information, and asks one useful next question. She does not label Aanya's personality or infer her income.
5. A correction or interruption changes the next step. A human-handoff branch shows how the conversation stops and a counsellor receives context.
6. After the sample conversation, the operator reviews a proposed preference memory and a draft follow-up. Each includes evidence; approval and rejection change prototype state.
7. The operator approves a simulated follow-up. Delivery is explicitly simulated, and the case advances only to the corresponding next step—not to an invented enrolment or revenue outcome.

## What emotional and relational intelligence mean here

**Emotional responsiveness:** notice an explicitly expressed concern, acknowledge it specifically, adjust pace and complexity, tolerate pauses, accept corrections, and avoid pressure. Voice prosody is an interaction signal, not a reliable diagnosis or hidden sales score.

**Relational continuity:** remember what the person permitted us to remember; know which customer/case a statement belongs to; preserve where a fact came from; honor changed preferences; repair misunderstandings; keep commitments. Student, parent, counsellor and company contexts have separate disclosure permissions.

**Natural speech:** conversational timing, backchannels, interruption recovery, language switching, clear names/numbers and appropriate vocal delivery. These require recorded evaluations with selected providers. A polished mock cannot prove them.

## Shared core versus company configuration

The shared core contains people, organizations, relationships, cases, conversations, claims/memories, sources, consent, tasks and action outcomes. Industry packs supply terminology, pipeline stages, forms and workflow templates. Company configuration supplies policies, knowledge, team ownership, voice style and integration mappings. An admissions case should not be hard-coded into the core identity model.

Initial delivery should complete a small number of valuable workflows very well: enquiry qualification, contextual follow-up, appointment preparation, support resolution and overdue commitment recovery. Hiring, market research, consumer companionship and unrestricted autonomous outreach are possible later products or modules; adding them now would blur the reviewable customer experience.

## Layer boundaries

- Voice transport produces conversation events; it does not own the permanent customer memory.
- The context service selects knowledge and reviewed memory under permissions.
- The relationship layer tracks provenance, revisions, scope and commitments.
- The action service owns approval, execution, idempotency and uncertain outcomes.
- Connectors translate between this model and the authoritative external systems.
- The command centre shows both normal progress and exceptions that need a person.

## Alignment needed before production resumes

Review whether the primary workspace feels centred on voice and customer progress; whether the review/automation balance fits the intended buyer; and which two workflows should be proven first. The prototype is intended to make those choices concrete. No additional cloud accounts or keys are needed to review it.

See [reuse provenance](reuse-provenance.md) for the exact project/branch/module plan and the distinction between existing assets and newly written foundation code.
