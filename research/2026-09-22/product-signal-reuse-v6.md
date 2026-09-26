# Product signal reuse v6

**Date:** 22 September 2026. **Scope:** targeted read-only reuse audit for the next product loop:

`CRM / LMS / ERP / email / manual material → source-backed signals → product identity and explicit offerings → customer journey → plain-English campaign intent → founder clarifying questions → reviewed feedback analytics → approved agent evolution`

I read the existing v4 ledgers and the current local implementation first. I inspected exact files from the read-only `command_centre`, `html-portfolio`, and `Vyakti-GroupAI` source clones. I did not run source applications or tests, contact providers, import data, or read credentials. The source pins below are provenance, not runtime proof.

## Current local boundary

The local application already has the useful evidence primitives: bounded source artifacts and blocks (`lib/ingestion/contracts.ts`, `lib/ingestion/engine.ts`), reviewed candidate types including `offer`, `company_fact`, `faq`, `contact`, `feedback`, and `action`, exact quote/span checks, customer conflict guards, grounded company answers, campaign plans with exact source citations, reviewed conversation candidates, agent versions, configuration checks, and releases.

The missing domain layer is a durable, tenant-scoped signal model. Imported connector items are currently staged as ingestion sources; they do not become normalized CRM/LMS/ERP observations with source system, external record, observed time, authority, freshness, conflict, or reviewer outcome. Offers are candidate types and source text rather than explicit versioned product/offer records. Campaign planning accepts a goal, kind, channel, contacts and approved source IDs; its `missingInputs` are model output, not a founder question queue linked to unresolved product identity or journey decisions. Feedback analysis is per saved browser session and produces review cards; it does not aggregate themes across journeys/cohorts or produce a governed agent-evolution proposal. Agent versions pin knowledge digests and configuration, but no reviewed feedback evidence is required before changing an agent.

That means the next abstraction should be an append-only, source-bound `signal`/`claim` record plus explicit `offering`, `journey_stage`, `campaign_intent`, `clarifying_question`, `feedback_theme`, and `agent_evolution_proposal` records. A signal is evidence; a claim is a reviewed interpretation; a campaign intent is a proposed business decision. These should not be collapsed into one model output.

## Three best mechanisms to reuse

### 1. Reviewed source mapping and signal promotion

**Source evidence:** Command Centre `origin/main` at `c8fd321407d7b628b7e79d105887b6a182760100`:

- `components/import/import-wizard.tsx`, blob `dacc1f9aff94566fd616008006c86172fc747ab9`
- `lib/import-reconciliation.ts`, blob `111cd1fa2432cc7e5bcb6880047c1975dba9f6b2`
- `lib/import-review.ts`, blob `2f906923668b0d0cc7c26a338fca35be34219d3c`
- `lib/importer-offer.ts`, blob `4993b829d23ef47fc16832c8a8811ce4bc4b8fc7`

The functional mechanism is a reviewable import boundary. The wizard preserves the original row, normalized fields, field changes and row audit; reconciliation proposes exact company/domain/phone matches and returns multiple candidates when the top scores are too close; review code sanitizes fields and builds an explicit patch; the importer offer module resolves a source record into display identity, category, product text, known/unknown product status and a scenario-specific offering calculation. These are separate steps, which is the useful shape for CRM, LMS, ERP and email material.

The source is not an identity policy. `reconcileLeadRow` is single-tenant, scans an in-memory lead list, strips legal suffixes and non-ASCII characters, uses last-ten-phone-digit matching, derives domains from email, and uses fixed fuzzy thresholds. `importer-offer.ts` is CBAM-specific and assumes a single product scenario. Neither carries source permissions, freshness, a cross-system authority rank, or a reviewer-safe claim lifecycle.

**Adaptation and local targets:** retain the current immutable `ingestion_source`/`ingestion_proposal` quote contracts, then add a server-side signal mapper around `lib/ingestion/engine.ts` and `lib/ingestion/contracts.ts`:

- `platform:signal`: source ID/digest, external system and record ID, field or event name, raw/normalized value, observed/source-updated time, authority rank, freshness, confidence, exact quote/span, and lifecycle (`proposed`, `reviewed`, `superseded`, `revoked`);
- `platform:offering`: explicit product/service identity, version, audience/problem, evidence anchors, unknowns and approval state;
- `platform:journey_stage`: configurable stage key, entry/exit evidence, current source authority and customer/account binding;
- a `platform:signal_review` or proposal record that resolves `new`, `merge`, `conflict`, `reject`, or `needs-founder-answer`.

Use `lib/ingestion/contact-review.ts` as the transaction pattern: re-read the source and proposal, compare digests/revisions, fence the source and catalog, create a durable receipt, and return a conflict instead of silently merging. The root implementation targets are `lib/platform/signals.ts`, `lib/platform/offers.ts`, `lib/platform/journeys.ts`, and a review surface beside the existing Company brain/import review. A raw CRM/LMS/ERP/email pull should create evidence and signals; it must not silently create a canonical offering, journey stage, consent, or customer identity.

### 2. Intent compilation, offering-aware campaigns, and founder questions

**Current local contract:** `lib/campaign-planning/engine.ts` already validates a bounded `PlanDraft` containing `objective`, `message`, `callBrief`, `successCriteria`, `journeySteps`, `missingInputs`, and exact `PlanCitation` offsets. It hashes the request, source revisions and contact IDs, fences approved sources during generation and apply, and preserves a campaign snapshot. This is the strongest existing base for turning plain English into an explainable campaign intent.

**Source evidence:** Command Centre `origin/main` at `c8fd321407d7b628b7e79d105887b6a182760100`:

- `lib/cold-email/sequence-engine.ts`, blob `38df3687ec07a0912433f265ce42b8b3bef7ecff`
- `lib/outreach-workflow.ts`, blob `bfb27071fca320d338308828e880e65e98db68be`
- `lib/proposal-analytics.ts`, blob `26ab13ab74c5a8ca745459437c10f926e5ba452`
- `lib/proposal-data.ts`, blob `ffcef5c92d85a5bc457ce1e2bd9fb5942af38a70`
- `lib/lead-stage-journey.ts`, blob `3983c68c7c3b372fef8f5e7cc220678de25a0847`
- `supabase/migrations/20260609_journey_tracking.sql`, blob `1242d670266ab379f4478601015a32b024ee8d24`

The functional reuse is broader than “send email.” The sequence engine models an audience enrollment with a current step, next-send time, stop-on-reply/open rules, local business-window alignment, suppression checks, and a conditional ten-minute claim before provider work. `outreach-workflow.ts` separates draft/ready/approved/sent records and emits an event row for each state. `proposal-analytics.ts` records proposal-page events, filters obvious bots, deduplicates first engagement, promotes only still-top-of-funnel leads, and creates a next-action/SLA signal. `lead-stage-journey.ts` makes stage-entry timestamps and stage-specific dates deterministic. `proposal-data.ts` turns a known panel/product code into a bounded offering label; the importer path demonstrates how an audience-specific offering can carry “known” versus “unknown” product identity.

The source limits are material: CarbonSettle/CBAM fields, one-company assumptions, legacy auth, old send paths and provider-specific analytics. Proposal engagement is a useful behavioral signal, not a confirmed human decision. The source does not provide a general product catalog, founder question loop, or evidence-backed agent evolution.

**Adaptation and local targets:** evolve `CampaignPlan` into a reviewed `CampaignIntent` that includes:

- `objective` in plain language;
- selected `offeringId` and offering revision;
- journey stage and transition hypothesis;
- audience rule plus exclusions and evidence;
- channel and agent/tool capability request;
- `clarifyingQuestions[]` with answer status and source anchors;
- success signal definition and stop rules;
- citations to reviewed signals/offering claims.

`missingInputs` should become explicit `platform:clarifying_question` records. The founder can answer, reject, or defer each question; the plan compiler must revalidate unresolved high-impact questions before producing a launchable intent. The model may suggest a question, but a model-generated question does not establish a company fact.

Use the current `lib/automation/engine.ts` and `docs/automation-v5.md` as the local schedule/dispatch seam. It already keeps one reviewed run digest, recipient eligibility snapshot, review token, team permission, consent and source rechecks, and the canonical delivery engine. Keep `sequence-engine.ts` as a behavioral reference for due-time and suppression, not as a drop-in sender. `lib/proposal-analytics.ts` should inform a tenant-safe event taxonomy (`signal.observed`, `campaign.engaged`, `journey.transition_proposed`) rather than be copied into the new source model.

### 3. Feedback analytics to approved agent evolution

**Current local contracts:**

- `lib/learning/validation.ts` binds every candidate to a real user turn and exact contiguous quote.
- `lib/learning/engine.ts` separates feedback themes, practical concerns, explicit preferences, corrections and commitment requests; it supports review overrides and routes them to feedback evidence, customer memory review, or manual action review.
- `lib/platform/agents.ts` captures immutable agent versions, approved-knowledge digests, configuration checks, source revision fences, and publish/rollback state.
- `lib/evaluations/schema.ts` and `lib/evaluations/service.ts` preserve rubric versions, bounded transcript evidence, operator reviews and matched evaluation conditions.

These provide the correct “feedback is evidence; evolution is reviewed” boundary. They do not yet aggregate feedback across customers or connect a reviewed theme to a proposed prompt/tool/knowledge change. A feedback card currently ends as evidence, a memory proposal, or a manual action. Agent tests verify identity/language/knowledge authority, not whether a proposed change improves a measured feedback theme.

**Source evidence:** html-portfolio `origin/main` at `3a9217981b27636745fc70ac490aacf9ef3f392d`:

- `api/consolidate.js`, blob `a218df19edd5a1662bd88d7c6ae35fb0ccce23d7`
- `api/consolidate-sweep.js`, blob `e187323c9837921ef8402fd8799ca1aa9e3beda3`
- `src/engine/observation.ts`, blob `ce38fb4f89ab0fd605502e72fef852a689ad21df`
- `src/engine/memory.ts`, blob `782619403c56d68d61f5ec470e10cd9c6e75aca4`
- `docs/CONSOLIDATION.md`, blob `aa83a17ab44708751d2fba619f898eef5060c3ae`

The functional mechanism is an append-only observation/log boundary followed by bounded, asynchronous consolidation. A live turn is logged with provenance; a lag query finds genuinely unprocessed rows; a person-scoped lease prevents overlapping sweeps; extraction proposes episodes/claims; exact source lineage and entailment checks gate writes; failures leave the source unclaimed so a later run can retry. The consolidation pipeline explicitly excludes observation classes that cannot become durable facts and keeps derived layers separate from the raw log.

The source is a personal companion memory system, not a company product-feedback system. It carries private identity assumptions, personal memory tables, and model/provider choices that must not be imported. Its useful contract is the separation of raw observation, derived proposal, evidence/citation, asynchronous processing, lease/lag state, and approved projection.

**Adaptation and local targets:** add:

- `platform:feedback_signal` for a source-bound customer statement or measurable event;
- `platform:feedback_theme` for a reviewed, cohort-aware interpretation with volume/denominator, counter-evidence, affected offering/journey stage, confidence and time window;
- `platform:agent_evolution_proposal` for a proposed change to prompt, opening, language, knowledge, tool set, escalation rule or campaign brief, linked to theme IDs and exact evidence;
- an evaluation run that tests the proposal against the affected scenarios and records a human review;
- only after approval, a new `agent_version` with the existing knowledge digest and release fences.

Do not convert a theme into an agent change merely because a single model card was accepted. Require a minimum evidence policy suitable for the tenant, expose sparse/contradictory data, and retain the previous version for rollback.

### GroupAI team/product mechanisms: useful guardrails, not a business schema

Vyakti-GroupAI `origin/claude/vyakti-cloning-platform-aq05n4` at `451de5a6a7017dc76eaac69fe551203dc94753d2` contributes two small mechanisms:

- `packages/intervention-policy/src/{types.ts,policy.ts}` blobs `7b8e5365b81a4c890dc16b8d240e8e4f32d69f1a` and `fd2a35c9f843ab787d20953c04cd4fc9c83047e8`: deterministic evidence → decision traces for identity, addressee, privacy, interruption cost, permission and action authorization. Adapt this for “founder question required,” “customer feedback needs review,” and “agent evolution needs approval”; preserve traceable block/select reasons.
- `packages/simulator/src/campaigns.ts`, blob `abc7067d371021d126651fe3f6e81f96bcdb5277`: staged pilot manifests with dependencies, primary metrics, universal hard stops and external prerequisites. Adapt this as product-feedback/evolution campaigns: define cohort, hypothesis, expected outcome, metrics and hard stops before changing a released agent.

These packages do not provide CRM/LMS/ERP connectors, product identity, offering records, or team membership. Do not map `social_world` directly to a company team or customer account. The local `lib/team/service.ts` and `docs/team-access-v5.md` are the correct workspace membership boundary; GroupAI audience rules remain useful for customer/case disclosure scopes.

## Proposed root implementation order

1. Add `signal`, `offering`, `journey_stage`, and `clarifying_question` records around the existing ingestion/source digest and review fences. Start with one connector-shaped fixture for CRM/email plus manual CSV; keep LMS/ERP as adapters to the same contract.
2. Refactor campaign planning around `CampaignIntent` and explicit offering/journey references. Render founder questions before content generation is considered ready. Preserve exact citations and the current immutable run snapshot.
3. Add a feedback theme rollup over reviewed conversation/evaluation evidence. Keep raw event, model proposal, operator review, aggregate theme and agent-evolution proposal distinct.
4. Require an approved evolution proposal to create a new agent version; run the existing configuration/evidence tests plus a scenario rubric tied to the theme. Publish/rollback remain the only release paths.

The first vertical proof should be one offering and one journey transition: import two contradictory source records, resolve the offering and customer stage with a founder answer, generate a cited feedback campaign intent, collect one reviewed customer signal, show aggregate evidence with its denominator, and produce a draft agent-evolution proposal that cannot publish without approval. This proves the product loop without claiming broad connector coverage, automated truth, or competitor superiority.

## Reuse limits and risk

- Do not transplant Command Centre's fuzzy matcher, CBAM terminology, single-tenant tables, proposal copy, or provider-specific retry paths.
- Do not transplant html-portfolio personal memory consolidation, companion identity, inferred emotion, or private-life claims. Reuse the append-only observation/lease/citation pattern only.
- Do not treat GroupAI's pilot metrics or intervention traces as proof of business outcomes. They are guardrails and evaluation structure.
- Keep external provider reads as evidence until reviewed. Keep customer statements, company facts, offering claims, campaign strategy, and agent changes as separate lifecycle records.
- The current Azure-only AI boundary and local SQLite/automation constraints remain in force. This note proposes contracts and file ownership; it does not establish production connector, worker uptime, or model quality.
