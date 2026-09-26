# Company operating flow, version 4

22 September 2026. Implementation specification grounded in the current repository. This joins the company operating model to the existing voice workbench; it does not replace the visual system or claim that planned connectors already work. The root implementation owner should record adopted decisions in the continuity graph and event log after implementation. This document changes no production code.

## Product and first value

A company gives the workspace its context, customer information and goal. AI organizes the information into evidence-linked proposals, helps the operator resolve uncertainty, and prepares a coherent customer campaign. A natural, relationship-aware representative uses the approved company brain. Actual interactions produce measured outcomes and reviewable improvements to that brain.

The first value is **“This is what we understood about your company, these are the conflicts we found, and here is a useful first campaign you can test.”** It is not creating an agent from a blank prompt. An experienced builder can still open the agent editor directly.

The intended advantage is natural Indian business conversations with appropriate emotional response, relationship continuity and low cost per useful outcome. Each requires evidence. Current Listen & type tests do not establish microphone quality, customer success, or competitor superiority. Keep Azure as the default and only paid inference route; preserve the explicitly selected Maya/Despina free-pool profile without enabling it as a fallback.

## Repository baseline and gaps

| Stage | Existing implementation | Missing work that creates the complete flow |
|---|---|---|
| Company registration | Account and organization creation in `app/api/auth/route.ts`; empty workspace | Persisted company profile, onboarding progress, goal and next useful step |
| Input | Manual `brain.create`, manual customers and source approval | Actual local uploads, retained source snapshots, AI extraction and reconciliation |
| Brain | Approved `brain_source` records, revision checks, revocation and agent knowledge digests | Structured extracted proposals, exact evidence spans, conflict decisions and lineage back to imports |
| Campaign | Sales/feedback drafts, contact selection, browser/manual-email channels, preflight and immutable run snapshot | Goal-to-plan generation, useful audience rationale, AI-written messages and representative configuration; later a real multistep executor |
| Voice | Draft previews, exact configuration snapshots, released browser calls, saved sessions, relational runtime | Connect generated campaign to the tested representative; microphone/device evaluation and in-call business tools remain separate work |
| Execution | Operator run queue, manual-email evidence, release-matched browser-session evidence | OAuth connectors, durable outbound dispatcher and provider receipts; telephone stays deferred |
| Learning | Manual feedback, proposed memories, commitments, quality view | AI analysis of actual saved sessions with accepted/rejected learning proposals and linked brain revisions |
| GroupAI | Audience-aware records, capsules and internal Azure text replies | Real external participant identity/delivery; do not present internal rooms as working omnichannel transport |

Relevant source files are `components/platform/{command,brain,campaigns,agents,customers,conversations,integrations}-view.tsx`, `lib/platform/{customer-ops,campaigns,agents,records}.ts`, `lib/ai/azure-text.ts`, `lib/server/store.ts` and `docs/integration-contracts.md`. Historical prototype files remain excluded from implementation.

## Information architecture

Keep the existing application shell, typography, colors, panels, focus treatment and mobile drawer defined in `DESIGN.md`. This is an Operate surface. Its hierarchy should explain the work before exposing configuration details.

| Existing destination | Primary job and contained flow |
|---|---|
| Command centre | Resume onboarding or the current goal; show the next required decision and actual campaign progress. One prominent next-action panel, then evidence-backed exceptions. |
| Company brain | **Sources → Review → Approved knowledge** as local views. Upload/paste and source status live here. Company profile is editable context here, not another product. |
| Campaigns | **Goal → Plan → Test & review → Run → Results** within the selected campaign. Persist progress, show completed steps, allow return without losing work. |
| Customers | One customer record with identity, contact permission, relationship memory, conversations, commitments and campaign participation. |
| Agents | Existing representative editor and live tester. Link a campaign directly to its generated draft and back. Test lab and Releases remain available to builders. |
| Conversations | Source evidence and call inspection; launch analysis and view its proposed outcomes. |
| Quality and Commitments | Evidence-backed improvements and owned follow-through. Campaign results link to these exact records. |
| Integrations | Connection setup and capabilities, import freshness, outbound readiness and recovery. Distinguish data read from send permission. |
| GroupAI | Existing internal shared context and discussion when relevant to a customer or improvement. Never an onboarding requirement or substitute for customer cohorts. |

Do not add separate “AI tools”, “data cleaning”, “workflow designer”, “campaign intelligence”, “brain trainer” or “learning dashboard” destinations. These are operations on the same records. Existing sidebar sections need not be reorganized before the connected journey works. Breadcrumbs and return links must carry record IDs, not return users to unselected lists.

## One onboarding journey

1. **Create company.** Existing registration supplies identity and workspace. Continue into a compact company brief: what the company offers, whom it serves, preferred customer languages and the first business goal. Industry is optional configuration. Country/time zone may default to India/Asia–Kolkata with an editable value; do not infer consent or legal eligibility from it. Save before moving on.
2. **Bring information.** Choose upload, paste, or a configured connector. Offer a short text description as the fastest starting path. Accept messy company information and customer data in the same intake, then show how each source will be used. An optional founder interview produces source material through the same review pipeline. Connector setup can wait; it must not block local first value.
3. **Let AI organize it.** Show real phases: reading the source, extracting claims, comparing existing records, ready for review. Display completed source/chunk counts, not fabricated time estimates or model reasoning. Save the job so navigation does not lose the result.
4. **Review understanding.** Present company facts, offerings, customer candidates, possible duplicates, conflicting values and unanswered questions. Each proposed fact expands to the original quote and source. Show current value alongside the proposed value. Accept/edit/reject each proposal or accept a selection of non-conflicting proposals. Edited claims retain their original evidence plus the operator correction.
5. **Confirm the first plan.** The user's business goal and the approved brain generate an editable campaign plan. Show audience, reason for exclusions, message/interview outline, representative behavior, human handoff, outcome definition, permitted channels and execution readiness. Suggestions without adequate company evidence remain questions or drafts.
6. **Hear the representative.** Generate a draft from that plan and open the existing call tester with its knowledge selection. The primary experience is trying a useful conversation immediately. Preserve provider choice, AI disclosure, language/register, corrected names, pacing and escalation. Configuration checks and live preview evidence are distinct.
7. **Start real work.** Publish a suitable tested version, run preflight, review the concrete audience/content, then start the supported run. Current browser runs create an operator queue. Manual email prepares messages for an operator and records the operator's evidence. Show both truths before starting.
8. **Learn and continue.** After actual saved sessions, AI proposes feedback, customer memory, commitments and brain changes. Review evidence and accept the useful changes. The next representative version and campaign explicitly use the revised approved brain.

Do not force users through empty stages: no customers means the company brain and generic representative can still be tested; no channel permission means a plan can still be reviewed; no connector means upload still works. Make the outstanding dependency specific at the point it matters.

## Concrete end-to-end example

An Indian consultancy uploads a service brochure as text and a contact export, then pastes recent team notes. The brochure says a consultation costs ₹1,000; newer notes say ₹1,500. Two contact rows share an email and have different spellings. AI presents the conflicting price with both quotes, and proposes a possible duplicate. It does not silently choose a price or join two people. The owner confirms the current price and the correct contact, retaining both original inputs and the decision.

The owner asks, “Help these new enquiries decide whether a consultation is useful.” The plan uses the approved offering and price, proposes a short introduction, selects only the operator-confirmed intended cohort and explains any missing contact permission. The generated representative introduces itself as AI, asks one useful question at a time, follows the customer's chosen Hindi/English register, acknowledges expressed cost concern and avoids pressure. A test correction of the fee must survive the rest of the conversation. Publishing captures the exact approved knowledge and configuration.

An eligible customer participates in a released browser session. The campaign records that conversation, not a prior draft preview. A requested appointment becomes a proposed commitment; it is not counted as a confirmed booking. After a feedback interview, a quoted service complaint can create an owned improvement and a customer-specific memory proposal. Completing the improvement and notifying the customer remain separate outcomes. A reviewed brain update can change future answers; it never rewrites the historical conversation or the prior campaign snapshot.

The same sequence supports a service-feedback goal: cohort = confirmed recipients of the service; interview asks what worked and what failed; metrics count completed interviews, supported themes, owned fixes and confirmed follow-up. Non-response is not satisfaction, and theme counts retain their denominator and source sessions.

## Shared entities and authority

Extend the existing tenant-scoped entity/record store. Do not introduce another customer database or store authoritative business data only in a chat history.

| Record | Purpose | Who can make it authoritative |
|---|---|---|
| Company profile | Description, offerings context, goal, languages and onboarding progress | Authenticated workspace operator; AI suggests field edits |
| Import source | Original source snapshot, file metadata, digest, capture time, access scope and parser version | Server establishes identity and integrity; content remains evidence |
| Analysis job | Input digests, task/prompt/schema version, attempt, status, model and usage receipt | Server state machine; model supplies proposed content only |
| Proposal | Typed extraction/plan/learning payload and exact source references | Schema/evidence validation allows review; operator acceptance authorizes the selected writes |
| Brain source | Approved company knowledge linked to originating proposals | Existing approval/revision machinery; revocation immediately affects new use |
| Contact + customer profile | Shared identity, current business fields, explicit channel permissions | Existing customer operations and identity review; AI never grants permission |
| Campaign + run | Editable plan, then immutable audience/content/version snapshot | Existing launch preflight and transactional run creation |
| Agent/version/release | Draft behavior and immutable executable configuration | Existing exact-version checks and release authority |
| Session/feedback/memory/commitment | Observed conversation and reviewed follow-through | Server validates provenance; customer statements, interpretation and approved fact remain separate |
| Integration execution receipt | Accepted, confirmed, failed or uncertain external operation | Server executor plus provider evidence; never model prose |

Normalize safe formats deterministically: trim whitespace, canonicalize an email for comparison, parse declared CSV columns, and validate dates. Retain raw values. Exact email equality can identify a possible match; it is not always proof of a single person. Names alone never justify a merge. Do not automatically normalize ambiguous Indian dates, invent country codes, convert missing currency, or infer a phone number/email.

Use field-level provenance for disagreements. A newer upload is not inherently more authoritative than an operator-approved source. Explicitly reviewed company knowledge, verified connector claims and customer statements have different scopes. A customer statement about their experience may update their case; it cannot autonomously change the company's service price. Follow the existing `DataAuthorityClaim`/freshness/conflict concepts in `docs/integration-contracts.md`.

## Minimum data contract for the new AI layer

The following is a proposed implementation contract, not a claim that these record kinds already exist. Names can adapt to the repository as long as the invariants remain.

```ts
type EvidenceRef = {
  sourceId: string; sourceDigest: string;
  start: number; end: number; quote: string;
}; // Offsets refer to the retained normalized source text, end-exclusive.

type Proposal = {
  schemaVersion: 1;
  task: 'extract' | 'plan_campaign' | 'learn_from_session';
  inputRefs: { id: string; revision?: number; digest: string }[];
  items: {
    itemId: string; // Server-issued; model may return only bounded local references.
    kind: 'company_fact' | 'customer' | 'conflict' | 'campaign' |
          'agent_config' | 'feedback' | 'memory' | 'commitment';
    payload: Record<string, unknown>; // Validate with a per-kind allowlist/schema.
    evidence: EvidenceRef[];
    interpretation?: string;
    disposition: 'pending' | 'accepted' | 'rejected';
    appliedRecordIds?: string[];
  }[];
};
```

Server responsibilities:

- Load all sources and existing record candidates under the authenticated organization. Do not trust client-supplied organization, owner, contact target, release, source URL or model-generated database ID.
- Treat source text as untrusted data. Instructions found inside a brochure, CSV cell, email or transcript cannot grant tool access or change the extraction task. The extraction/planning model receives no dispatch tools.
- Parse one bounded structured response; reject unknown fields, invalid enums, excess arrays, fabricated references and incomplete output. Validate quote equality against the retained source slice. An exact quote verifies origin, not truth or semantic entailment; review remains necessary.
- Retain conflicts and missing values as explicit unresolved items. Avoid meaningless percentage confidence. Useful reasons are “two differing prices”, “email missing” and “source has no date”.
- Apply selected items only against matching proposal/input revisions. Stale input returns a conflict and a visible re-review path. A saved proposal must not be regenerated because the page reloaded.
- Make applying proposals atomic and idempotent. Use a durable apply key/receipt and map proposal item IDs to created record IDs. Repeated clicks return those records. Existing handlers express validation rules; multiple calls to independently transactional handlers alone do not create an atomic bulk import.
- Reuse `brain_source`, contact/customer-profile, agent and campaign invariants through shared validators/services. Do not bypass them with arbitrary generic record writes. An extraction approval must not accidentally approve an external action.
- Save model/deployment, prompt/schema version, input digests and available token usage. Record missing usage as unknown. A failed or interrupted provider call may still have incurred cost; never display zero solely because there is no receipt.

## What “AI drives everything” means operationally

AI should do the time-consuming interpretation and composition: map messy columns, extract company offerings, propose duplicates, explain conflicting claims, draft messages/interview guides, propose an audience and journey, configure a representative, summarize feedback, suggest relationship memories and propose improvements. The operator edits concrete work rather than filling disconnected blank forms.

Deterministic services must own tenant isolation, authentication/roles, consent and opt-outs, identity matching decisions, source integrity, revision comparisons, channel eligibility, schedules/time zones, stopping rules, amount/currency validation, budgets, accounting, idempotency, dispatch, provider receipts and metric arithmetic. These are reliable execution boundaries. The model can explain a failed gate and propose remediation; it cannot declare the gate passed.

Do not infer emotion as an objective diagnosis or create a permanent “trust score”. Use quoted customer concerns and observable preferences. AI can suggest a calmer, shorter response or a human handoff. Disclosure, private/shared audience scopes and correction/revocation remain enforced independently of that suggestion.

## Exact vertical slice to implement now

Build the connected local loop with existing Azure inference, rather than adding connector placeholders as the main deliverable:

1. Persist company brief and onboarding completion on tenant-scoped platform records; resume into the actual next incomplete step in Command centre.
2. Add real UTF-8 `.txt`, `.md` and `.csv` upload plus pasted text to Company brain. Retain original filename, content and digest locally under tenant authority. State supported formats at selection. PDF/DOCX/scans should return a clear format limitation until real parsers/OCR exist; never claim to read them based on filename or plain UTF-8 decoding.
3. Create bounded source extraction with Azure and a saved job/proposal. Suggested first implementation cap: 50 KB retained text per source, 10 sources per batch, and chunks no larger than 6,000 characters, preserving original offsets. These are proposed product limits, not existing guarantees; server and UI must agree. Parse CSV correctly, including quoted commas/newlines, and report malformed rows.
4. Present a review table with item kind, current/proposed value, source quote, unresolved reason and accept/edit/reject actions. Support safe customer creation and separate duplicate decisions. Approval creates usable reviewed brain sources and links created customer IDs; importing never grants channel permission.
5. Add “Plan with AI” to Campaigns. Input is the goal, approved brain subset and permitted candidate contacts. Output is an editable sales/feedback draft plus compatible representative configuration. Ground factual message claims in approved sources. For the first slice, one executable channel per campaign remains explicit. A proposed email→voice sequence can be shown as future steps but must not be labelled executable automation.
6. “Test representative” opens the existing draft tester. “Prepare run” leads through the existing version/check/release and preflight paths. Use existing launch semantics; readiness shows “Browser run”, “Manual email” or the specific connection dependency.
7. Add “Analyze conversation” for a saved session. Show proposed feedback, customer memory, commitment and company-source corrections with quotes and scope. Accepting creates/updates existing records; company knowledge still needs its appropriate review. Command centre and Campaign results link to these accepted records.
8. Demonstrate closure with one service improvement completed and separately recorded customer follow-up, and a subsequent agent version referencing the revised brain. This is a real local operating loop, with external delivery limitations visible.

`generateAzureText` already uses the existing Azure resource, a configured text deployment or `gpt-4.1-mini`, a 30-second timeout and no cross-provider fallback. It currently limits user text to 12,000 characters and output to 1,600 tokens, requires `finish_reason === 'stop'`, and validates a token receipt. Reuse it with bounded tasks and compact schemas. Do not pass entire 50 KB uploads or large transcripts as one call. Keep chunk state, visible partial completion and explicit retry of failed analysis. Do not silently accept truncated extraction or replay an uncertain request. Complex plan synthesis may use several small validated stages on the same paid provider.

A later production slice adds durable background jobs, document parsers, full journey scheduling, external OAuth/delivery, team roles, deployment/hosted storage and dependable usage accounting. These do not justify postponing the working local loop.

## Connector setup and omnichannel truth

The UI should invite the relevant connection inside the flow and report the exact state. It must not mark a connector connected because an environment variable exists. Connected means a provider identity was verified, declared scopes/capabilities are known, and a bounded check succeeded. Reading a mailbox is separate from sending mail. Imports retain provider record IDs, source revision/change cursor and provenance.

Before implementing a specific OAuth adapter, resolve its actual provider, registered application/client ID, server-side secret or approved credential mechanism, allowed callback URL for the eventual origin, tenant/account restrictions, requested read/send scopes, token storage/refresh strategy, disconnect/revocation behavior, and webhook or incremental-sync approach. Exact scopes and provider eligibility must be verified against current official documentation when that adapter is selected. No secrets belong in chat, project continuity or client bundles.

For email, establish Gmail versus Microsoft 365 or another provider, the authenticated sender/mailbox, read versus send permission, threading/receipt mapping and opt-out handling. For WhatsApp, establish the business/account/number setup, authorized provider, allowed templates/window rules and webhook identity before claiming delivery. For CRM and documents, choose the concrete provider and authoritative object/field mapping. Telephone remains later as already decided.

Connection states are `not_configured`, `authorization_required`, `connecting`, `connected`, `limited_scope`, `reauthorization_required`, `syncing`, `error` and `disconnected`. Preserve useful locally imported information when a provider is temporarily unavailable, while enforcing revocation and source-use rules. Never replace a revoked connection with a different paid provider.

## UI states and recovery

| Situation | User-visible behavior |
|---|---|
| Empty workspace | “Tell us about your company” with a short brief and upload/paste entry; no fabricated activity numbers |
| Empty brain | Explain the first usable input; offer paste or upload, with supported formats |
| Processing | Saved job status and real source/chunk progress; user can navigate away and resume |
| Partially processed | Show completed proposals and the exact failed source/chunk; completeness remains visible |
| Conflicting claims | Side-by-side current/proposed values and quotes; accept a value or leave unresolved |
| No findings | “No supported company facts or customers found”; source still inspectable; edit input or add another source |
| AI unavailable/429/invalid output | Preserve all inputs; state the actual failure; explicit retry; manual source entry remains usable |
| Stale proposal | Explain what changed; re-read current evidence before applying |
| No eligible customers | Show exclusions and the concrete dependency; plan/testing remain available |
| Unsupported outbound channel | Show drafted content plus connection requirement; never a fake send-success toast |
| Voice connection/microphone error | Existing retry or Listen & type path; preserve the tested draft and disclose which mode ran |
| Learning without evidence | No authoritative update; ask for an actual saved session or source |
| Uncertain delivery | Hold further dispatch for that action; inspect provider status/reconcile before a separately authorized resend |

On desktop, review uses a record list/table and a selected evidence panel. On mobile, stack item and evidence with a clear return path; preserve selected item and edits. Show one primary action for the current stage. Use semantic controls, labelled inputs, announced asynchronous errors and keyboard-accessible selection. Keep long source text in an expandable detail view. Do not force horizontal timelines or tiny status pills to carry the entire workflow.

## Measures and acceptance

Measure the chain with explicit denominators: sources processed/selected, claims accepted/proposed, audience eligible/selected, actual sessions completed/queued, interview themes/sessions analyzed, commitments completed/opened, customer notifications confirmed/required, and useful outcomes/attempts. Keep failed, skipped, manual and unverified outcomes separate. A saved transcript is not a booked meeting or collected revenue. Show provider usage when available; only show rupee cost after a configured, versioned price basis exists.

The implemented slice is accepted when a new workspace can persist its brief, ingest a messy real local file, produce a genuine Azure extraction, resolve a sourced conflict, create approved company knowledge and customers without inferred consent, generate a useful editable campaign, test the generated representative, record an actual released browser session, produce evidence-linked learning proposals, and apply an approved improvement visible to a subsequent agent version. Reloading must preserve every stage and double-submitting an approval must not duplicate records.

Necessary checks cover cross-tenant access, fabricated/mismatched quotes, malformed/truncated model output, duplicate apply requests, stale input revisions, unknown/withdrawn consent, contradictory company claims, source revocation, released-versus-preview evidence and learning-scope isolation. Browser verification must walk the whole journey with one meaningful failure/recovery and inspect desktop/mobile. Current 105-test/build evidence describes the pre-existing system; it does not validate this proposed slice.
