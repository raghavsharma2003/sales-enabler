# Use-case coverage v6

22 September 2026. Coverage of the full company operating model, not a feature-count checklist. The architecture snapshot precedes root's final v5/v6 verification. “Existing” means code or bounded prior evidence; it is not a production-readiness verdict.

**D** = discovery/understanding; **W** = product workflow/design; **R** = runtime quality; **O** = operational reliability. Each row names a concrete user case, current boundary and completion evidence. **Slice** marks the coherent next implementation in [product-operating-model-v6.md](product-operating-model-v6.md). **Later** remains intended product work, rather than silently disappearing from scope.

## Company understanding and decisions

| ID / axis | Case and decision | Current coverage | Completion evidence / disposition |
|---|---|---|---|
| D01 / D,W | Founder pastes unstructured notes before connecting any system | Existing bounded ingestion and approved brain facts; observed local loop | Source retained; proposal reviewed; reload resumes. Extend same entry into offering/signal review. Slice |
| D02 / D,O | Import brochure, CRM export and team notes together | Bounded formats/parsers exist; broad cross-source reconciliation incomplete | Show each input, parser result and omission; no whole-company-reading claim from a truncated excerpt. Slice boundaries, later scale |
| D03 / D,W | Two services appear in one brochure; campaign could choose the wrong one | Extracted `offer` becomes knowledge; canonical offering selection absent at architecture snapshot | Two distinct offering records and explicit selected offering in plan/run. Slice |
| D04 / D,W | Brochure fee differs from founder's current note | Exact-source review exists; no complete founder clarification loop | Both claims visible; answered question saved as founder evidence; approved choice retains provenance. Slice |
| D05 / D,W | Founder answers “I don't know yet” about eligibility | General manual review exists | Unknown persists; dependent campaign blocked or narrowed; unrelated work continues. Slice |
| D06 / D,O | Two family members share a phone/email or have similar names | Contact review and epoch protections exist; full identity resolution not claimed | No automatic merge; candidate match reviewed; authority and old IDs retained. Existing + later identity depth |
| D07 / D,W | Source describes a prospect without enough identity information | PII routing guard and reviewed customer creation exist | Signal remains unbound; no consent or identity invented. Slice |
| D08 / D,W | AI detects a possible missed follow-up opportunity | Existing learning proposes feedback/commitments; persistent cross-source business signal absent | Observation, evidence, interpretation, uncertainty and suggested action reviewed separately. Slice |
| D09 / D,W | Three documents repeat one customer's complaint | No verified deduplicated trend analytics | Count distinct evidence units/customers with denominator; duplicate documents do not inflate prevalence. Later |
| D10 / D,O | A document contains instructions to send data or override rules | Existing bounded extraction/quote validation | Treat document text as evidence only; forged instructions grant no authority. Existing guards, extend tests |
| D11 / D,O | AI extraction fails halfway or source exceeds limits | Existing bounded job/proposal state and omissions | Preserve completed review, explicit failed-unit retry and honest completeness. Existing + later durable chunk work |
| D12 / D,O | Founder corrects or revokes previously approved material | Source revisions and revocation exist | New plans/calls reject obsolete authority; old snapshots retain historical labels. Extend to offering/signals in slice |
| D13 / D,W | Signal evidence includes private customer history | Customer-scoped memory/learning exists | Keep private evidence scoped; do not copy into shared brain to satisfy signal API. Private evidence union later |
| D14 / D,W | Founder wants a product overview rather than an agent editor | Command flow exists but product/service entity is missing | Brain presents approved offerings, open questions, signals and related campaigns in one flow. Slice |
| D15 / D,W | Parent, learner and billing contact use one service under different roles | General customer records exist; explicit product/role journey associations incomplete | Preserve source-specific relationship and contact point; review which person can answer which question. Later |
| D16 / D,O | Connector is authorized but indexing or permission updates are incomplete | Connection checks exist; broad sync/currentness not verified | Separate connected/syncing/ready/stale/revoked; incomplete ingestion cannot claim complete company knowledge. Later operations |

## Campaign design and customer work

| ID / axis | Case and decision | Current coverage | Completion evidence / disposition |
|---|---|---|---|
| C01 / W | Sell a chosen service to relevant enquiries | Existing sales planner chooses goal, sources and contacts | Approved offering + evidence-required outcome + reviewed audience travel through plan and run. Slice |
| C02 / W | Interview people who actually received a service | Existing feedback kind and voice brief; service-history targeting incomplete | Reviewed recipient rationale; missing history visible; nonresponse never counted as satisfaction. Slice rationale, later relationship data |
| C03 / W | Pick desired outcome: qualification, requested callback or confirmed appointment | Free-text success criteria exist | Review outcome meaning/evidence; request and confirmed completion remain distinct. Slice |
| C04 / W | Review which columns the interview should fill | Existing result handling lacks typed collection schema | Review named typed columns before launch; empty values remain unknown. Schema slice, extraction later |
| C05 / W,O | Audience seems relevant but lacks contact permission | Existing deterministic preflight | Relevance never grants consent; exclusion reason visible before launch and rechecked before dispatch. Existing, regression in slice |
| C06 / W | Create plan with no eligible customers yet | Existing planning permits empty selection; preflight blocks run | Plan/test still useful; precise audience/permission dependency visible. Slice continuity |
| C07 / W | Plan must use more than three source facts | Existing planner caps three approved source records and 1,800-character excerpts | State source selection/omission; bounded evidence-pack retrieval and citation quality needed before widening. Later |
| C08 / W | AI proposes email then voice follow-up | Existing channel-specific campaigns; durable email scheduler added v5 | Distinguish proposed journey prose from executable steps; explicit step authority and stop rules before automation claim. Later journey engine |
| C09 / W,O | Founder edits offering, audience or outcome after reviewing plan | Existing source and plan revision guards; intent absent | Invalidate affected intent review; re-review; preserve fields on normal campaign update. Slice |
| C10 / W | Test the representative with one customer's permitted context | Existing preview and campaign-bound calls | Persist exact draft/context and selected person; preview cannot count as outcome. Existing + later saved person scenario suite |
| C11 / W | Tune the representative in plain English | Existing manual prompt/settings controls | Saved allowlisted diff, questions, apply-once draft revision, then test/version/release. Slice |
| C12 / W,O | “Change the price and send to everyone” is entered in agent instructions | No NL change service at snapshot | Separate factual clarification, draft behavior and execution authority; no publish/send from model proposal. Slice |
| C13 / W,O | Launch supported browser work | Existing snapshot/preflight/operator queue; observed fictional run | New intent/offer anchors included; actual run customer/release-bound conversation supplies evidence. Slice extension |
| C14 / W,O | Pause, resume or stop active work | Existing campaign controls; v5 scheduler checks pending full verification | New dispatch stops; provider-accepted results retained; resume rechecks eligibility; cancellation is not message recall. Existing + verify |
| C15 / W,O | Retry a failed recipient after an ambiguous send | Durable accepted/rejected/uncertain email state exists | Uncertain result held for reconciliation; no automatic resend. Explicit bounded retry only for proven safe failure. Existing + verify |
| C16 / W,O | Schedule a campaign and close the browser | v5 durable worker/schedule implementation pending full verification | Actual worker claim/resume/stop/restart evidence; show overdue/worker absent, no browser-only scheduling claim. Pending verification |
| C17 / W,O | Choose automated email instead of manual email | Executor supports email; planner only browser/manual_email at snapshot | Explicit mailbox/channel; consistent planner/apply/dispatch contract; no silent conversion. Slice compatibility requirement |
| C18 / W | Reopen a campaign created before product/service records existed | Existing legacy campaigns have no offering linkage | Display “Offering not recorded”; preserve operation; optional reviewed attachment only before launch. Slice |
| C19 / W | Compare two approaches on the same person scenario | Evidence lab and exact versions exist; persisted paired suite incomplete | Same defined scenario/context, separate immutable variants and reviewer result. Later |
| C20 / W,O | Run a real A/B campaign | No verified assignment/exposure/analysis engine | Stable unit assignment, exact variants, exposure log, shared primary outcome/window and sample counts; no causal lift from anecdotes. Later |
| C21 / W,O | Telephone customer does not answer or reaches voicemail | Telephone integration deferred; browser queue has no dial disposition | Later adapter must distinguish no-answer/busy/voicemail/provider failure, attempt budget and allowed follow-up; do not copy these labels onto browser sessions. Later telephone |
| C22 / W,O | Duplicate row or webhook might start the same customer twice | Existing durable email idempotency; no telephone ledger | Stable run/person/attempt keys, append-only events and deduplicated ingest; intentional new attempt requires explicit retry policy. Later telephone, preserve existing email guards |

## Results, evolution and collaboration

| ID / axis | Case and decision | Current coverage | Completion evidence / disposition |
|---|---|---|---|
| E01 / W | See an offering's campaign results and the affected customers | Existing campaign/customer/session records; canonical offering absent | Same offering/intent shown at result and customer entry points; clickable evidence. Slice |
| E02 / W | View clear visual campaign analytics | Existing operational counts; full product-linked analytics incomplete | Funnel/outcome bars with denominator, excluded/unknown counts and row drill-down; no fabricated revenue. Later analytics |
| E03 / D,W | AI extracts interview answers into the reviewed columns | Existing conversation learning has typed proposals, not this schema | Cell value + exact evidence + unknown/observed/reviewed status; correction survives reload. Later |
| E04 / D,W | Customer explicitly prefers short Hindi replies | Existing source-linked learning and memory review; bounded observed correction | Approve scoped memory; subsequent permitted context uses it; revocation removes new use. Existing |
| E05 / D,W | One dissatisfied customer triggers a product improvement proposal | Feedback and commitments exist | Preserve quote/scope; owned improvement linked to offering; one complaint not represented as company-wide prevalence. Slice link, later synthesis |
| E06 / W,O | Team completes a fix and tells the customer | Existing completion and notification records are separate | Proof of completion and notification separately visible; proposal never claims either happened. Existing |
| E07 / W | Founder accepts learning and updates the representative | Existing source/version/release system; NL changes proposed | New draft and exact tested release uses approved revision; old sessions unchanged. Slice |
| E08 / W,O | Invite operator or viewer and assign follow-up | v5 team roles/invitations pending full verification | Expiry/revocation/tenant isolation; viewer cannot execute; removed operator cannot leave active authority. Pending verification |
| E09 / D,W,O | Discuss evidence in a GroupAI room | Existing audience/capsule mechanism and bounded Azure room reply | Room membership/scope enforced; no cohort-to-room identity shortcut; transport delivery remains separately unverified. Existing subset |
| E10 / W,O | Reply to a WhatsApp customer | v5 inbox/webhook/reply code pending full verification | Verified account/webhook identity, valid context/window, consent, durable receipt; real send proof required. Pending verification |
| E11 / W | Founder asks why the system recommended a campaign | Source-backed plan citations exist; signal/intent missing | Link observation → signal decision → offering → outcome → audience rationale, with uncertainty. Slice |
| E12 / W | Customer asks to correct remembered information | Existing correction/revocation patterns | Review affected scope and versions; corrected information used subsequently, historical evidence retained appropriately. Existing + integrated journey later |

## Runtime quality and operations: separate proof track

| ID / axis | Case and decision | Current coverage | Completion evidence / disposition |
|---|---|---|---|
| R01 / R | Hindi/English/Hinglish turn feels natural | Bounded Listen & type generated audio and transcript evidence | Human-rated actual audio over scenario corpus; named rating criteria and failures. Pending quality evaluation |
| R02 / R | Customer interrupts the agent acoustically | Microphone permission attempt timed out; no broad acoustic proof | Actual microphone/device barge-in test with audio/timing traces; text interruption is insufficient. Pending |
| R03 / R | Customer corrects a name or becomes frustrated | Relational repair state observed; broad quality not established | Repeated realistic audio scenarios; respect correction and pacing; no diagnosis/trust-score claim. Pending quality evaluation |
| R04 / R | Agent obeys opening/brief across sessions | Bounded follow-up and known earlier opening issue | Exact-version repeated scenarios and error rate, including failures; configuration pass is insufficient. Pending |
| R05 / R,O | In-call tool retrieves company/customer context and proposes follow-up | v5 tools implemented; authority explicitly internal operator browser | Correct scoped tool calls plus permission/race/error tests and real-call evidence; proposal never pretends to book. Pending verification |
| R06 / R,O | Android browser handles permission, audio route and reconnect | Prior narrow 390px visual checks; no actual Android device proof | Real Android microphone, speaker/Bluetooth, background/resume, network loss and teardown; retain permission failures honestly. Pending |
| R07 / R | Compare voice to Vapi, ElevenLabs or Bolna | Researched product patterns; no customer/competitor voice trial | Same scenario/audio/device/rater procedure and comparable outcomes; no superiority claim from docs. Pending |
| R08 / O | Connected source authorization expires or account changes | Existing encrypted vault/OAuth/authorization guards | Actual account tests; queues rechecked after identity/scope changes; cached imports preserve provenance. External live verification pending |
| R09 / O | Two operators approve/edit/launch at once | Existing compare-and-set/transaction patterns | V6 race tests across source/offering/signal/intent and duplicate apply; one authoritative outcome. Slice |
| R10 / O | Deployment process restarts during a dispatch | Durable scheduler/receipts added v5; hosted operations unverified | Restart/claim recovery and no duplicate external action, known/uncertain receipts, worker observability. Pending |
| R11 / O | Company expects auditable cost/usage | Existing metered Azure task receipts; prices absent | Known usage vs unknown billing, versioned configured rates, voice separated; no invented zero or grant claim. Existing limits |
| R12 / O | Source is revoked while a call or queued action is starting | Existing source authority and released-context guards | V6 anchors rechecked at action boundary; cancellation/uncertainty semantics tested. Slice extension |
| R13 / O | A member requests another tenant's product or signal | Existing tenant store/auth | Every v6 list/get/propose/apply/launch rejects cross-tenant references including fabricated evidence IDs. Slice |
| R14 / O | Service is described as production ready | Local SQLite/build/test and bounded browser evidence only | Hosting/storage/backup/recovery/security/real provider/device runbooks and measured operational proof. Later production gate |
| R15 / R,O | Playground test has broader context than the real customer audience | Existing preview and scoped production context are distinct | Display exact preview scope and exclusions; run an audience-equivalent test before claiming safe production behavior. Existing boundary + later suite |

## Reference cases

The [company-data cases](../research/2026-09-22/company-data-workflow-cases-v6.md) informed D02/D06/D09/D12/D15/D16 and C02/C05. The [campaign cases](../research/2026-09-22/campaign-case-studies-v6.md) informed C04/C08/C14–C22 and R01–R07. The [reuse audit](../research/2026-09-22/product-signal-reuse-v6.md) informed D08/E03/E05/E07 and the transaction boundaries. These are documented or statically audited patterns, not tests of the referenced products. Their evidence labels remain authoritative; an undocumented feature is unknown, not proven absent.

## Closure rule

Complete the coherent slice using D03–D08, D12/D14, C01–C06/C09/C11–C13/C18, E01/E07/E11 and their O-axis safeguards. Reuse already implemented execution and learning, then verify the joined journey. This is a delivery sequence within the full product, not permission to replace the full model with unrelated feature tabs.

A case is closed only when its acceptance evidence names the actual record or test path, date, scope and remaining limitation. A design document closes a design decision. A passing unit test closes a bounded invariant. A successful fictional browser walkthrough closes that workflow. Real provider receipts, actual-device audio and human judgments close their respective runtime questions; none can stand in for the others.
