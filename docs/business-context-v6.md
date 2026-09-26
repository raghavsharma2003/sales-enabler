# Reviewed company offerings and signals

`lib/business/contracts.ts` defines browser-safe company context and campaign intent. `lib/business/engine.ts` persists reviewed offerings and signals using the existing tenant entity store; no new database schema, graph engine, identity matcher or provider is introduced.

An `offering` is a product or service with a name, summary, intended audience, exact source quotes and open questions. Its state is `draft`, `approved` or `retired`. A `business_signal` separates a source observation, optional interpretation, uncertainty and suggested action; it moves from `proposed` to `approved` or `dismissed`, and approved signals can be dismissed or superseded. Every update resets review. Approval records the operator and time. Unresolved offering questions prevent both approval and campaign intent binding.

Evidence always comes from current approved canonical `platform:brain_source` records in the same tenant. Each `SourceAnchorRef` stores source ID, revision, digest, exact quote and server-located character offsets. The digest includes all canonical source data and review state. Manual citations can quote the full bounded source; AI discovery receives only the first 2,400 characters of up to three selected sources. The server validates AI quotes against those exact excerpts. Source changes, revocations and stale record revisions block approval. Source and record compare-and-set statements run in the same transaction as the reviewed write. Exact quote validation proves provenance, not semantic entailment of every interpretation; human review remains necessary.

Discovery uses the existing metered Azure `runAiTask` planning role. At most four offerings, six signals and eight missing-context questions are accepted. Strict output field checks reject model-created customer IDs, offering bindings and additional authority fields. Offerings remain drafts and signals remain proposals. Deterministic IDs and one atomic transaction save the proposals and their `business_discovery` receipt; the latter is an execution receipt, not a canonical company fact. A replay returns the original receipt without another inference. A failed validation can replay the same router request ID and reuse its durable inference receipt. Changed input or uncertain provider outcomes follow the router's existing conflict behavior; the endpoint never changes request IDs to retry a paid request. All selected sources are fenced, including a discovery that returns only questions.

Only explicit operators can bind a signal to a canonical same-tenant customer. Discovery never chooses a customer, grants consent, verifies identity or automatically qualifies an audience. Structured personal/CRM records are excluded by the existing conservative ingestion scope detector, evaluated per source line. Raw uploads, transcripts, private memories and GroupAI private facts are outside discovery. This detector is a conservative check rather than a general PII classifier; the upstream company-source review boundary remains required.

Founder clarification follows the existing canonical brain lifecycle. `clarification.create` delegates to `handleCustomerAction('brain.create')`, recording an attributed source with a founder-clarification label and draft status. `clarification.approve` delegates to the existing explicit source approval path. The original question/offering should be included in the operator's title or content. Saving a clarification does not resolve an offering question, approve the offering, or initiate inference. After reviewing the source, the operator can cite it while updating the offering or run discovery again. Record editors can manually resolve questions; they remain responsible for checking that the cited evidence supports that resolution.

## API

`GET /api/business-context` returns `{offerings,signals,sources,discoveries}`. Offerings, signals and discoveries use `PlatformRecord<T>`. Sources contain `{id,revision,digest,title,content}` for eligible approved sources only.

`POST /api/business-context` accepts the following actions through the central authenticated, same-origin JSON boundary. Viewers may read but cannot mutate.

Business mutations also reload the actor's current operator membership rather than trusting the request's cached role. The exact validated membership bytes are fenced in the same transaction as record creation, updates and review. Discovery checks operator access immediately before inference and carries that actor fence into its atomic proposal commit; demotion or removal during inference prevents publishing the proposals. Already-started inference cannot be undone, and its durable router receipt remains the cost evidence. Campaign callers must include their own actor fence alongside the evidence fences returned by this module.

| Action | Input | Result |
| --- | --- | --- |
| `discover` | `requestId`, 1–3 `sourceIds` | `discovery` receipt plus current context |
| `offering.create` | name, kind, summary, audienceDescription, sourceRefs, openQuestions | `{record}`, draft |
| `offering.update` | same fields plus id, revision | `{record}`, draft with review cleared |
| `offering.approve` | id, revision | `{record}`, approved if current evidence and no open questions |
| `offering.retire` | id, revision | `{record}`, retired |
| `signal.create` / `signal.update` | title, observation, sourceRefs, uncertainty; optional interpretation, suggestedAction, offeringId, contactId; updates include id/revision | `{record}`, proposed |
| `signal.review` | id, revision, status; optional explicit offeringId/contactId (`""` clears) | `{record}`, reviewed status |
| `clarification.create` | title, content | `{source}`, attributed brain draft |
| `clarification.approve` | sourceId, revision | `{source}`, explicitly approved canonical brain source |

Creation/update source references require `sourceId` and an exact `quote`; revision, digest and offsets are derived by the server. All fields and lists have explicit limits. Closed records require a new proposal.

For AI signal output, `interpretation` and `suggestedAction` are optional text: omit the property or use `""` when there is no supported content. For example, a signal may contain only `title`, `observation`, `sourceRefs` and `uncertainty`. The parser also normalizes `null` and bounded whitespace-only text to absence for those two properties. Discovery alone accepts a `suggestedAction` array of 1–6 nonempty strings, joining them with newlines into at most 1,000 characters. This compatibility rule follows an observed model response shape; manual signal mutations continue to require text. It does not normalize other arrays, objects, booleans, oversized text, required fields or source quotes. The discovery system prompt remains byte-stable for existing router receipts so a validation-only repair can safely replay the same request ID without another paid attempt.

## Campaign integration

`createCampaignIntent(user,input,contactIds)` accepts schemaVersion 1, offeringId, outcome `{label,evidenceRequired:string[]}`, signalIds, audienceRationale and typed reviewColumns. It returns a snapshot with nested offering `{id,revision,digest}`, signal anchors and server-set reviewer metadata. Actual customer IDs remain on the existing plan. A customer-bound signal is accepted only when that customer is explicitly in the selected audience.

`getBusinessIntentEvidence` returns the current offering, signals, sources and database fences. `assertBusinessIntentCurrent` returns those fences for the caller's campaign transaction. Callers must include the returned statements in their atomic generate/apply/launch write, preserving existing source, recipient and release fences. Retiring an offering, reviewing a signal again or changing its underlying source invalidates the intent. Business source digests deliberately cover the full canonical source envelope and should not be compared with older campaign source digest formats.

## Selective source adaptation and verification

The bounded exact-quote proposal/authority recheck pattern follows the already audited html-portfolio `api/_room-memory-authority.js` lineage documented in `docs/ingestion-source-port.md`. The explicit proposal versus canonical review boundary follows command_centre import review (`app/api/import-review/route.ts`, `lib/import-review.ts`). Atomic quoted-source replay and compare-and-set checks follow the local approved implementation documented in `docs/brain-recall-source-port.md`. This work adapts those contracts, rather than copying companion identity, customer matching, external communication or provider fallbacks. Source repositories were not modified.

`npx tsx --test tests/business-context.test.ts` exercises tenant and viewer restrictions, exact server-located citations, unresolved questions, stale source review, atomic discovery/replay, model identity-binding rejection, inference-time revocation, questions-only race protection, structured customer exclusion, clarification approval, explicit customer selection, typed review columns and approval/intent transaction races. Additional regressions cover a stale cached owner role, demotion between review validation and the atomic approval, and demotion during inference, while preserving viewer reads. Tests inject a mock AI runner and make no paid provider requests. SQLite is exercised; no PostgreSQL or live-provider claim follows.
