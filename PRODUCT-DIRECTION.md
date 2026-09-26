# Product direction for discussion

2026-09-21 · Proposed direction, not a validated market claim or approved build specification.

## Recommendation

Build a configurable AI platform for running customer work: it understands the company, keeps an accurate record of each customer relationship, carries out permitted follow-ups and operational tasks, and gives the team control over exceptions and outcomes.

The first customer-specific offer should be for the Indian study-abroad consultancy the founder can reach. Its promise should concern completed student journeys and counsellor capacity. The underlying product should use general concepts that can later support other consultative businesses.

Suggested plain-language promise:

> Your team has the full customer context. Routine follow-through happens. People step in where their judgment matters. You can see what was completed and what still needs attention.

The company brain, intelligent CRM, command centre and voice agents are complementary parts of this product. Each must contribute to a customer outcome. Merely putting them in one interface does not establish a reason to switch.

## What the market already has

[Meritto's study-abroad product](https://www.meritto.com/study-abroad-education-consultant-crm-software/) already describes enquiry handling, document/application tracking, communications, partner management and reporting. Its [Mio offering](https://www.meritto.com/) includes conversational, voice and counsellor-assistance products. [LeadSquared's overseas education CRM](https://www.leadsquared.com/crm-for-overseas-education/) also covers the student journey, portals and omnichannel engagement. These are vendor-published capabilities; availability and effectiveness for our customer require evaluation.

We should therefore compete against a well-configured incumbent, not against an imaginary spreadsheet-only competitor. The wider market also contains company knowledge platforms, AI CRMs and packaged voice infrastructure. See [the market evidence](research/market-evidence.md).

A company can buy us because deployment is easier, workflow fit is better, actual execution is more reliable, or verified economics are better. We do not need to invent an entirely new category. We do need to prove an advantage for a defined customer.

## Which product business to choose

| Candidate | Assessment |
| --- | --- |
| General customer-operations platform, delivered through configured workflows | Recommended. Combines the ambition with a buyer who can assess a completed business outcome |
| Standalone voice-agent platform | Keep voice as a capability. Competing on infrastructure or naturalness alone does not exploit the strongest case-management and relationship work |
| Relationship-memory and permission SDK | A possible future developer product if other builders want the kernel. It has a different buyer, integration burden and sales motion; internal code reuse is not yet demand for an SDK |
| Complete replacement for every company system | Preserve interoperability and a useful native workspace. Rebuilding CRM, helpdesk, recruiting, ERP and communications together would delay establishing which customer value deserves investment |

These are strategic judgments, not predictions that the alternatives cannot succeed. The first recommendation best matches the founder's stated vision and available customer access.

## One core, configurable businesses

Use three layers:

1. **Shared platform:** customer and organization records, relationships, permissions, knowledge, conversations, cases, tasks, actions, audit history and metrics.
2. **Industry pack:** objects, stages, requirements, domain vocabulary, standard workflows and evaluation scenarios. Study abroad is the first pack.
3. **Company configuration:** that customer's offerings, teams, approved facts, assignment rules, channels, tone, permitted actions, integrations and targets.

Tailoring should usually mean configuration, approved knowledge and integration mapping. Model fine-tuning is a separate, optional technique, justified only if a measured problem survives those approaches. Frequently changing fees, deadlines or policies should not depend on retraining a model.

General does not mean every industry is turnkey on day one. We can make the core reusable while honestly supporting one pack first. Validate the boundary later by configuring a second business without a separate codebase.

| General concept | Study-abroad configuration | Another business example |
| --- | --- | --- |
| Person and relationship | Student, parent, sponsor, counsellor | Buyer, procurement lead, account manager |
| Case or opportunity | Intended intake and education goal | Consulting engagement or purchase |
| Child case | Each university/program application | Each quote or work order |
| Requirement | Transcript, reference, language test result | Purchase order, brief, signed agreement |
| Commitment | Send shortlist by Friday | Send revised quote by Friday |
| Approved knowledge | Program facts and company service terms | Product specs and service terms |
| Workflow | Counselling and application coordination | Discovery and proposal coordination |
| Business outcome | Verified enrolment and received commission | Completed engagement and received payment |

## Product capabilities and their value

| Capability | What it must do | Value in the first consultancy |
| --- | --- | --- |
| Company brain | Retrieve approved facts with sources, owners and freshness; distinguish policy from speculation | Counsellors and agents answer from the same current information |
| Intelligent CRM | Maintain people, cases, stages, source-linked history, concerns and explicit next actions | Less manual logging; fewer lost handoffs and duplicate enquiries |
| Work execution | Schedule, assign, follow up, collect missing items, verify completion and escalate | Fewer cases stall because nobody completed the next step |
| Voice and messaging | Natural calls, WhatsApp/email continuity, preference-aware timing and human transfer | Routine qualification, appointment coordination and status updates at useful scale |
| Counsellor workspace | Briefings, relevant facts, draft responses and a prioritized queue | More time for judgement-intensive counselling |
| Customer workspace | Clear status, secure uploads, appointments and outstanding requirements | Students know what to do without repeatedly asking staff |
| Command centre | Show blockers, overdue commitments, action failures, approvals and outcome trends | Managers can intervene where work is stuck |
| Learning and research | Convert reviewed corrections and recurring issues into proposed knowledge/workflow changes | The service improves without silently changing company policy |
| Platform administration | Separate tenants and roles, record consent, meter usage, manage integrations and export data | A repeatable SaaS deployment rather than a bespoke internal tool |

The company brain needs three different information types: authoritative company knowledge, individual customer history, and live operational state. A conversation summary cannot substitute for a confirmed booking, and an old brochure cannot silently override a current published requirement.

## Shared rules that configuration must preserve

**One authority for each field and event.** If we integrate an existing CRM, specify which system owns contact details, case stages, bookings and payments. Keep source versions, resolve conflicts, handle late updates and preserve explicit human corrections. A native workspace must not become a second, contradictory record.

**Completion requires evidence.** Distinguish an action being proposed, authorized, attempted, accepted by a provider and confirmed complete. A timeout after sending can mean the result is unknown; reconcile it before retrying. An AI message saying "done" is not a receipt.

**Access boundaries are part of the core.** Enforce tenant, person, role and case permissions. Verify identities and student-parent relationships before disclosure; access must reflect revocation and changes in relationship. Company configuration can narrow these boundaries, not bypass them.

**Sources cannot grant authority.** Uploaded documents, customer messages and retrieved pages are evidence to interpret, not instructions that may authorize actions or rewrite company policy. Extracted claims need a defined status, source and applicable review before becoming authoritative.

Before a live pilot, demonstrate these rules on cross-tenant access, changed consent, corrected facts, duplicate/late callbacks, uncertain provider outcomes and human takeover. Monitoring alone is not sufficient for these foundational guarantees.

## The first customer journey

### 1. Enquiry to attended counselling

Capture enquiries from agreed channels, resolve duplicates cautiously, establish language and contact preferences, collect basic goals and qualifications, and book the appropriate counsellor. Follow up on a missed appointment with a rescheduling option. Record an attended appointment separately from a booking.

Qualification should help route a student and prepare the counsellor. It should not invent an admission probability or discard a person because a voice model inferred low interest.

### 2. Counselling to an actionable plan

Prepare a brief of stated goals, constraints, prior conversations and missing information. Support the counsellor with source-backed program comparisons and cost components. Save the approved plan, responsibilities and due dates. Keep the student's preferences distinct from the consultancy's commercial preferences.

Start with the consultancy's supported destinations and approved program sources. A comprehensive worldwide university database is a different undertaking and not necessary to prove initial value.

### 3. Plan to complete application

Create a separate application case for each program. Generate a requirements checklist, request missing material, receive uploads, flag unreadable or apparently mismatched files for review, and track the responsible person. Stop reminders when the item is received or the case changes. Distinguish received, reviewed and accepted documents.

Submission, institution decisions and visa decisions are explicit events with evidence. The system must not mark an application submitted simply because it sent a message. Start with human-confirmed submission if a partner portal has no supported integration.

### 4. Application to enrolment

Coordinate queries, offers, confirmed deadlines, accepted offers and required next steps. Answer routine status questions from the case record. Escalate contradictory information or a decision requiring a counsellor. Keep payment requested, payment received, enrolment verified and commission received as separate states.

Routine coordination can be automated. Final advice, disputed requirements and consequential commitments stay with the appropriate professional.

### 5. Continued customer care

Provide the agreed post-enrolment handoff and track unresolved service issues. Later, support referrals or other services only where relevant and with appropriate permissions. Do not add unrelated upselling simply because the platform can send it.

## A concrete example of the intended difference

A student asks about a master's program on WhatsApp. They later say on a call that they are waiting for a transcript and that their parent wants a clearer cost breakdown. The counsellor promises a revised shortlist tomorrow.

The system should preserve three separate obligations: the transcript is pending from the student; the approved cost information needs to be supplied; the counsellor owes a shortlist. It should know which application each obligation affects, whether any deadline is confirmed, and which facts can be shared with the parent.

After the transcript arrives, the reminder stops. If the counsellor is unavailable, their promised task is reassigned or escalated. If the cost data is stale, the agent requests review instead of improvising. The student's next conversation starts from that state. The manager sees whether these tasks were completed and whether the case progressed.

This is an acceptance scenario for our product, not a claim that no competitor can do it.

## Voice and emotional responsiveness

Build around observable service behaviors: accurate code switching, good turn taking, respectful pacing, remembering explicitly stated concerns, offering clarification and transferring to a human when needed. AI identity should be clear. Warmth should help a person make an informed decision.

Avoid hidden emotion-based lead scoring, artificial intimacy, or treating tone as proof of financial capacity or intent. A general-purpose companion personality is not the right starting policy for a company agent.

Cloning a specific person's voice is optional. It should not delay proving that calls and follow-through solve a business problem. Existing audio work needs new evaluation on actual phone conditions and business scenarios; see [voice and future research](research/voice-and-future-research.md).

## The command centre should answer operational questions

- Which cases need attention today, and what evidence explains the priority?
- Which commitments did our team or AI make, and which are overdue?
- Which applications are blocked on a student, a counsellor, an institution or our own system?
- Which calls, messages or integrations failed, and what is the recovery action?
- What has improved in the funnel, and what did it cost?
- Which answers or workflows need review before they are used again?

Every priority should open the underlying case and evidence. Suggested actions should show their effect before approval; pre-authorized routine actions should have a clear history and stop control. An unreadable wall of agent activity is not the management experience.

## Build order by value, not by calendar

**Foundation and first proof:** choose the customer's actual CRM, channel and scheduling integrations; establish identity, source-linked knowledge and case state; give counsellors usable briefings and an exception queue. Compare against current practice.

**First automated workflow:** enquiry qualification, booking and attended-counselling follow-through, or document completion if discovery shows that is the more expensive bottleneck. Pick one primary outcome. The choice comes from case evidence rather than an assumed universal preference for voice.

**Connected journey:** connect qualification and counselling with application requirements and status; expand autonomy only for actions with reliable authorization and completion checks.

**Repeatable product:** deploy the same study-abroad pack to a second consultancy with different rules. Track setup work and separate true configuration from custom engineering.

**General platform proof:** configure a second business type using the same concepts, runtime and controls. Add capabilities such as support or research when the same buyer and data make them useful.

This preserves the founder's broad ambition without requiring every possible workflow before there is a useful product.

## What should wait

| Item | Decision and reason |
| --- | --- |
| Full enterprise CRM replacement | Keep a basic native case workspace; integrate the first customer's system where practical. Replacing all reporting, custom objects and integrations creates a migration project |
| An unlimited agent builder | Ship reviewed workflow templates before a blank canvas; buyers need useful operations, not orchestration homework |
| Broad outbound prospecting engine | Focus first on the permitted customer journey; cold acquisition is a separate performance and channel problem |
| General hiring/ATS product | Different buyer, records, decisions and evaluation; shared primitives can support it later |
| Generic market-research product | Start with source refresh and actionable domain research for existing cases |
| Consumer companion features | Different purpose and success metrics; retain useful interaction engineering only |
| Universal voice cloning | Optional brand capability, not the first reason the consultancy pays |
| Autonomous university/visa guarantees | External decisions cannot be guaranteed by the product |
| Full loan, forex, accommodation and commission marketplace | Integrate only what the first workflow needs; building the marketplace itself is another business |
| Custom model training for every company | Use configuration and current knowledge first; fine-tune only against a specific demonstrated need |

## Where an upper hand could come from

**What we have now:** direct access to one plausible customer, an internal operational codebase, and substantial experiments in conversational continuity and information boundaries. These are development and discovery advantages. They are not yet a proven SaaS moat.

**What we could earn:** faster setup for this kind of company; better completion of work across its actual tools; reliable multilingual conversations; a tested distinction between student, parent and counsellor context; and credible evidence that the product improves outcomes at an acceptable cost.

Competitors can pursue each of these. Our benchmark must include their available configuration. If an incumbent meets the need at lower total cost and less disruption, we should find a more specific unresolved workflow or reconsider the offer.

Longer-term advantage would come from repeatable integrations and packs, customer trust, distribution, and permissioned evaluation data describing real failure cases and successful interventions. Do not assume one customer's confidential information can become another customer's training set.

## How the existing repositories should influence the product

| Source | Useful head start | Important limitation |
| --- | --- | --- |
| CommandCentre | Lead and outreach workflows, reply handling, suppression, operational history and CRM interaction patterns | Designed around one company's processes; shared app authentication is not SaaS identity, and some send-retry paths need redesign |
| html-portfolio / RelationalOS | Voice interaction engineering, source-grounded memory, consent boundaries, provider contracts and evaluation lessons | Companion and creator workflows need translation; some private-voice work is explicitly unreleased, and authored tests are not proof of a working customer-calling deployment |
| Vyakti-GroupAI | Multi-party disclosure, evidence-bearing context, durable execution, uncertain-delivery reconciliation and follow-through primitives | A kernel rather than a complete application; real business adapters, organization access and product operations remain to be built |

Use [the architecture review](research/architecture-reuse.md) and branch reports to select individual contracts and modules. Do not merge the repositories wholesale. Different branches contain different product generations, and similarly named relational modules are not necessarily equivalent implementations. Reproduce relevant tests and evaluate business behavior when implementation begins.

One concrete reason the branch review mattered: CommandCentre's unmerged `claude/context-project-review-0x0i6g` branch contains authentication, webhook and send-policy hardening that is absent from the audited `main`. GroupAI's non-main branches contain substantial relational-runtime work beyond its main baseline. A reuse decision based on default branches would miss both.

The general product can replace any of these parts. Their purpose is to reduce development risk, not dictate what customers need.

## How to establish value

For the first consultancy, agree on definitions before deployment:

| Metric | Definition discipline |
| --- | --- |
| Response and contact | Track first response, successful contact and meaningful qualification separately |
| Counselling | Booked and attended are different; include no-shows and cancellations |
| Applications | Count by application and by unique student; one student may apply several times |
| Completion | A reviewed, complete application is not the same as a document upload |
| Enrolment | Confirm the event from an agreed source; do not equate an offer with enrolment |
| Revenue | Separate expected commission, earned commission and cash received; account for refunds or reversals |
| Efficiency | Measure counsellor minutes per completed case or stage, including time reviewing AI errors |
| Service quality | Track wrong answers, repeated contacts, opt-outs, complaints and handoff quality |
| Reliability | Track action failures, duplicate actions, stale facts and permission mistakes |

Use a randomized or comparable concurrent cohort where feasible. If volume is too small, use reviewed case histories and an explicit uncertainty statement. Intake cycles, destinations, lead sources and counsellors can change outcomes independently of the AI.

Calculate customer value from incremental contribution margin and verified capacity savings, subtracting new operating costs. Do not claim the full value of every enrolment touched by AI, and do not count the same saved staff time twice.

Pricing should be tested after measuring usage and service effort. A platform fee with bounded usage is a sensible initial hypothesis; a pure per-enrolment fee has delayed attribution and refund complications. No rupee price or promised conversion uplift is validated today.

For an illustrative calculation only: if a measured comparison eventually supports five additional enrolments, and the consultancy's actual net contribution per enrolment is ₹40,000 after variable costs, the contribution gain would be ₹2,00,000 before our fee and additional customer effort. Neither the five enrolments nor ₹40,000 is a market estimate. The exercise shows why actual contribution and causal uplift matter more than call volume or a large tuition total.

## What the first discovery session must establish

Ask the consultancy to walk through recent successful, stalled and lost cases, with permission and minimal necessary data. Identify its actual systems, handoffs, contact channels, languages and bottlenecks. Determine who owns the budget and which event makes revenue real.

The strongest evidence is a repeated failure that the buyer can show in real cases, that existing tools do not solve acceptably, and that they will pay to fix. The output should be one prioritized workflow, a baseline, required access, permitted actions and a measurable acceptance test.

## Decisions proposed for the founder

Adopt the general platform plus industry/company configuration structure. Use study abroad as the first evidence-producing customer case. Prioritize accurate context and completed work; include voice where it improves that work. Keep the broader modules on an expansion path. Select existing code only after checking the relevant implementation and its limits.

The reports in [research](research/) provide the branch audits, competitive evidence, alternative markets and reuse assessment behind this discussion. No product implementation or deployment is part of this phase.
