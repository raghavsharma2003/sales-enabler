# Harvest synthesis: what the AI company command centre inherits

Date: 2026-10-15. Inputs: the 18 cluster reports in this folder (`hp-*` = html-portfolio Meera/Maya/Vyakti line,
`tx-*` = Taxila, `cc-*` = CarbonSettle CommandCentre, `se-*` = the current sales-enabler). Every claim below is
traced to a cluster report; numbers carry the n and source those reports give. Nothing here was re-measured.

Target: an AI-run company command centre in `/home/user/sales-enabler`: ERP, CRM, campaigns (launch/analyse/grow),
lead generator, omnichannel, company brain, voice and chat agents, and orchestration. **Azure-only AI and compute**
(Foundry/Azure OpenAI direct models, Azure Speech / Voice Live, Container Apps, ACS email). Neon Postgres allowed.
Telephony provider deferred.

Reading order for a builder: section 4 (verdict), section 1 (matrix), section 2 (laws), section 3 (do not repeat),
section 5 (conflicts). Section 6 is the build order this implies.

---

## 0. The one-paragraph answer

Build a new, lean, multi-tenant Node/TS service on Azure Container Apps + Neon, using **Taxila's platform spine**
(model gateway with quota lanes and overflow, Conductor actor runtime, agent-in-harness, fact-cited reports, gated
canary deploys, sim lab) as the skeleton, **CommandCentre's measured go-to-market engines and lessons** (sequence
engine, sender throttle, inbox and 14-intent classifier, ICP gates, HUMAN/MACHINE classifier, send guardrails) as
the CRM/campaign/lead-gen domain, and **the html-portfolio safety and honesty substrate** (one compiler, one gated
reply door, predicate safety, surface contract, provider budget ledger, ACS outbox, capability-absence codes) as the
cross-cutting layer. The current sales-enabler code is a careful prototype of the wrong product shape: keep about a
dozen mechanisms, rebuild the shell, data model and UI. Voice is a **cascade with Azure Voice Live as the ear and our
LLM as the voice**, not realtime speech-to-speech. The biggest uncovered work is a real CRM/ERP object model,
Indian telephony, and a command-centre UX nobody has yet built or validated.

---

## 1. Reuse matrix

Format per module: best assets (source cluster + path), why it wins, and the gap that no repo covers.
"Port pattern" means re-implement small against our schema; "lift" means copy and rename.

### 1.1 CRM

| asset | source | why |
|---|---|---|
| Person x Agent x Surface tenancy, with `org_id` added above it | hp-main `db/migrations/009_agents.sql`, `010_agent_strict.sql`, `013_surface_room_binding.sql`, `api/_agentscope.js` | Production-proven split: memory hangs off (agent, contact), never off the channel or device; agent state agent-scoped, relationship state person-scoped. |
| Approval-as-one-SQL-clause for every AI-proposed record change | hp-gurukul-early `api/_mirrorcall-store.js` (`decideMirrorDelta`), `evals/mirrorcall.mjs` | Write upstream of the state flip, state predicate in the same statement, eval that strikes the clause must see the leak. Exactly what "AI proposes a CRM/ERP edit, human approves" needs. |
| DB audit trigger (full old/new jsonb, changed_fields, actor) + rollback script | cc-main `supabase/migrations/20260715_*audit*.sql`, `scripts/audit-rollback.mjs`, `docs/audit-and-rollback.md` | Production, drop-in; an AI-operated CRM needs a per-row undo from day one. |
| AI-assisted CSV/JSON column mapping with review | se-live / se-audit `lib/data-intake/*`, `/api/data-intake` | Measured live: gpt-4.1-mini mapped name/email/phone/stage correctly in ~4.2 s; review-then-apply flow works end to end. Needs a heuristic first pass and custom fields. |

**Gap:** no repo has a multi-tenant CRM object model. CC's `leads` table is single-tenant and CBAM-shaped;
sales-enabler has contacts only (no accounts, deals, pipeline, activities, custom fields, quotes). Nobody models
quoting/pricing, although CC's data says closing (no price ever quoted, 1 of 7,538 leads in a commercial stage) was
the real bottleneck. Lead scoring that is "earned in code" exists only as a Taxila pattern, not as CRM code.

### 1.2 ERP

| asset | source | why |
|---|---|---|
| Payment provider seam + ledger + one HMAC webhook door + receipts numbered per financial year | hp-vyakti-completion `api/_payments.js`, `api/_payments/providers/{fake,razorpay}.js`, `api/_receipt.js`, `evals/payments*`, `evals/org-billing` | Tested (148/0, 69/0, 52/0 offline); tier flip as an SQL predicate in the webhook's statement; fake-reference contract fixed for restarts. |
| GST invoice pipeline (JSON to HTML/PDF, ~6 KB compact PDF, DRAFT banner on any `TO-CONFIRM`, signatory gating, Rule 46 checklist) | cc-branches `claude/knl-deal-negotiation-tr6zdw`: `docs/invoice/*`, `scripts/render-invoice.py`, `scripts/render-invoice-compact.py` | Only artefact that issued real Indian invoices. Port to a Container Apps job; strip KNL data and the signature PNG. |
| Schema-driven client workbook generator | cc-branches same branch: `scripts/generate-knl-cbam-workbook.py` | Real client-sent xlsx with fill-by roles and validation; generalise into a schema-driven builder. |
| Suites: B2B org, seats, seat-covers-tier billing | hp-vyakti-completion `api/_org.js`, `api/_creator-tier.js`, `evals/suites-self-serve` | Only org/seat/billing model in the family; also the price-witness eval idea. |

**Gap:** essentially all of ERP. No inventory, orders, purchasing, GL/double-entry accounting, GST e-invoicing (IRN)
or e-way bills, Tally/Zoho integration, or expense flow exists anywhere. Razorpay was never called live. Treat ERP as
greenfield built on the audit trigger, approval clause and Conductor patterns.

### 1.3 Campaigns

| asset | source | why |
|---|---|---|
| Sequence/send engine (enrollment-as-queue with `next_send_at`, atomic lease, transient vs permanent classification, timezone business windows, sticky A/B) + sender picker/throttle/ramp, **with the unmerged guardrail sweep applied** | cc-main `lib/cold-email/{sequence-engine,mailbox-picker,throttle,ramp-scheduler,send-limits,timezone-resolver}.ts`; guardrails from cc-branches `claude/context-project-review-0x0i6g` (`lib/secure-compare.ts`, suppression/scope re-checks, `unsubscribe-token.ts` + 199-line test) | The only engine that really sent (~9k emails); guardrail sweep fixes live P0s (unsubscribe rejects every real address; quarantined leads re-armable). Generalise "mailbox" to "sender identity". |
| ACS Email durable outbox (stable Operation-Id, encrypted payload, admitted to succeeded/failed/reconcile_required, reconcile sweep) | hp-vyakti-latest `codex/vyakti-azure-authmail-oct10`: `api/_auth-email{,-azure,-crypto,-store}.js`, `api/auth-email-sweep.js`, `db/migrations/174_vyakti_auth_email_outbox.sql`, `evals/auth-email/run.mjs` | The only Azure-native send code; already designed for ACS's 5-minute repeatability and 202-is-not-delivery. Never sent a real email; remove the 50-slot pilot sequence. |
| Quiet-hours-aware proactive messaging ("never on silence", one shared due-select SQL fragment, idempotency row per period) | hp-vyakti-completion `api/_checkins.js`, `api/_quiet-hours.js`, `api/_renewals.js`, `api/_dormancy.js` | Encodes "outreach needs a citable reason" and per-recipient timezone in one place for every channel. |
| Signed per-lead link tokens + durable offer page (deleted lead degrades to generic page) | cc-main `lib/cold-email/proposal-link.ts`, `app/p/[token]/*`; dual-secret version on cc-branches | Production; per-lead landing pages and attribution without exposing ids. |

**Gap:** nobody has measured deliverability on ACS (CC's entire playbook is multi-identity Gmail). No multichannel
sequencing that is coupled to deal state (the KNL CFO got a "free" blast 11 days before a ₹96k quote). No
"grow" loop that turns measured campaign outcomes into reviewed changes with an A/A noise floor.

### 1.4 Lead generation

| asset | source | why |
|---|---|---|
| ICP qualification gates: deterministic scope rules, then cached own-site crawl, then LLM judgment on cached pages, then domain-identity match, then a verdict cache | cc-main `scripts/scope-clean-rules.mjs`, `scripts/verify-eu-export*.mjs`, `domain_scope_verdicts` | Measured: pre-labelled `eu_strong` was ~34% reliable; hand-reviewed lanes ≤10% junk vs 33–56% for regex lanes. Rewrite with a per-tenant ICP config. |
| Data-hunt lane method (licence ledger, skip-list before fetch, adversarial audit escalating to a census, evidence in rendered body text, quarantine with reason codes) | cc-branches `data-hunt/SE-2026-07-31` (`docs/data-hunt/out/N-2026-07-31-REPORT.md`), `data-hunt/IT-2026-07-31`; cc-main `docs/data-hunt/SPEC.md` | 0 fabricated emails; census found 23% defects a sample hid. Commit the verifier code this time. |
| Route-table seam for third-party acquisition (one env var picks a route, named refusal per missing credential, provenance echo, no silent fallback) | hp-gurukul-late `api/_channel/extract-routes.js`, `evals/extractroutes.mjs` | The right shape for enrichment vendors and scrapers; never silently degrade. |

**Gap:** no licence-cleared Indian data source, no enrichment provider vetted under Azure-only (Apollo/ELV are
third-party data, misuse measured), and free public sources are near saturation (82% of screened rows already held).
Generalised ICP-as-config does not exist; it is CBAM code today.

### 1.5 Omnichannel

| asset | source | why |
|---|---|---|
| Four-function surface contract (verify/parse/send/render) behind one `gatedReply`; memory never keyed by surface | hp-main `api/_surface.js`, `docs/SURFACES.md`, `evals/surface*`; hp-vyakti-latest `api/whatsapp.js` (X-Hub-Signature-256, 24 h window) | Telegram live; a static eval proves no ungated path. Every channel (ACS email, WhatsApp, web chat, voice, later PSTN) is four functions. |
| Truthful delivery outcome contract (`not_executed` / `unknown`, `retrySafe:false`, stop at first failed fragment) + outbox state design | hp-multimodal-groupai `api/_surface.js` (`deliver`, `sendAccepted`), `evals/surface-delivery/run.mjs`, `docs/gurukul/research/GROUP-DELIVERY-DURABILITY-20261001.md` | Measured false `said:true` and duplicate replay (2 model calls, 2 sends per duplicate event). Build the outbox before any sender. |
| Inbox ingest (UIDVALIDITY poller, warmup filter, DSN bounce parser with the 10-15 fix, reply matcher, suppression) + 14-intent reply classifier with heuristic fallback | cc-main `lib/cold-email/{imap-poller,warmup-filter,bounce-parser,reply-matcher,suppression,reply-classifier}.ts` (bounce fix on `claude/focused-goldberg-2lmqf8`) | Production on ~90 real replies; taxonomy with SUPPRESS_AUTO_REPLY and REDIRECT sets transfers to any channel. |
| Known-consent temporal admission fence (platform sent-time > consent and link instants, repeated inside the SQL write) | hp-multimodal-groupai `api/_group-source-event.js`, `api/_room.js`, `evals/group-sql-authority/*` | DPDP/WhatsApp opt-in evidence that cannot be defeated by delayed delivery or edits. |

**Gap:** no unified inbox exists anywhere; WhatsApp was never sent live in any repo (cold marketing templates are
dropped by Meta error 131049); IMAP-style inbound has no ACS equivalent decided (ACS inbound, Graph or own MX);
**telephony is unbuilt everywhere and ACS sells no Indian numbers** (Direct Routing + licensed SIP trunk needed).

### 1.6 Company brain

| asset | source | why |
|---|---|---|
| Evidence-span intake: source to passages to AI proposals to human approval, with exact-quote revalidation | se-audit / se-live `lib/ingestion/*`, `lib/brain/*`, `/api/ingestion*`, `/api/brain/answer` | Live end to end against Azure; the strongest idea in the current repo. Fix: lossy summaries (MOQ numbers dropped), two offering systems, customer CSV leaking into company material. |
| Context Locker ingestion rules (magic-byte sniffing, named refusals stored as rows, per-tenant quotas, authorship/speaker required, span-verified citations, `assertReadable`) | hp-gurukul-early `api/_context-locker.js`, `api/_context-mining.js`, `api/_context/{extract,pdf,docx,whatsapp,link,limits}.js` | Measured failure modes (glyph-noise PDFs, wrong-speaker chat exports) already fenced. Swap the PDF extractor for Azure Document Intelligence, keep the gate on its output. |
| Cited claim extraction (identifier masking, Foundry strict structured output, citation revalidation) + multimodal evidence projection (modality, locator, limitations) | hp-voice-cloning `api/_claim-extraction/`, `api/_replica-claims.js`; hp-multimodal-groupai `api/_experience-compiler/claim-evidence.js` | Every brain fact carries source id, locator and limitation, and is accepted by a human; fixes the `Number(null)` zero-timestamp class. |
| Semantic recall on Neon (`halfvec(1536)` tenant-filtered exact scan, run in parallel with keyword) | hp-main `api/_embed.js`, `api/memory.js` (`opRecall`), migration 004 | Measured: recall@8 73.9% to 95.7%; DB scan 40 ms p50 vs embed 305 ms, so run in parallel. Lexical alone failed 0/27 on adversarial cases (hp-multimodal-groupai). |

**Gap:** no connector was ever connected to a real account (sales-enabler's 19 adapters, OAuth and vault are
offline-only). Nobody reasons over structured CRM/ERP rows plus documents together. No cross-language retrieval
measured on business content. Material from documents must enter as a delimited data block (hp-vyakti-completion
material block), which no brain implementation yet does.

### 1.7 Voice agent

| asset | source | why |
|---|---|---|
| Voice Live "ear-only" relay (server Live-Reference AEC against our own played audio on ch1, deep noise suppression, multilingual semantic VAD, hi-IN/en-IN ASR, `create_response:false`, event allowlist, idle/billing guards) | tx-voice `claude/r4-duplex`: `server/duplex/voicelive.js`, `server/duplex/d5route.js`, `src/duplex/{d5Stream,d5Worklet,d5Url}.ts`, `tests/d5-voicelive-*` | Only measured arm with 0/66 echo false barge-in and 12/12 true barge-in; ~$0.027/min AI cost; keeps a text gate before every spoken word. For telephony, ch1 is our outbound TTS stream. |
| Agent-lane harness + streaming speech module (strict JSON with `say` first, `sayDeltasOf`, `clauseSplitter`, per-clause gate, code-checked actions, budgets that throw to a scripted fallback, effort none) | tx-voice `claude/r4-conversation`: `server/agent/{agent,prompt,tools,flags}.js`; `server/latency/speech-stream.js` | Beat the scripted lane 57/64 (tx-core); safety probe 81/81. Take agent.js from r4-conversation (newest), overflow/safety fixes from r4-duplex. |
| Azure Speech DragonHD streaming TTS over WebSocket + framed turn-audio (JSON header, PCM/ADPCM frames, sample-exact clause events) + prewarm | tx-voice `server/voice/{azureTts,azureTtsWs,voices,prewarm,adpcm,frames}.js`, `server/routes/voice.js` | First byte 228/287 ms vs 688/931 ms for gpt-4o-mini-tts (tx-core MODEL-STACK). Production. |
| Voice evaluation kit: duplex bake-off scorers + per-minute cost model, earbench blind ABX with accent axis, held-out Wilson gate, spoken Hindi number reader, non-speech hallucination probe | tx-voice `evals/duplex-2026-10/*`, `docs/research/duplex-2026-10/BAKEOFF.md` §5b; hp-gurukul-early `scripts/earbench.mjs`, `evals/earbench/*`; hp-voice-cloning `api/_replica-voice-delivery-policy.js` (`wilsonLower`); tx-core `server/grading/spoken-number.js` | Voice is the module where metrics most often lied (Azure TTS won every metric and lost by ear); this kit makes the choice measurable before code depends on it. |

**Gap:** the telephony leg (ACS Call Automation media streaming feeding ch0 caller / ch1 our TTS) is unbuilt and
unmeasured; India PSTN needs Direct Routing + a licensed carrier with unknown rates. Nothing was measured on real
phones or real callers: end-of-turn p50 1,480 ms missed the 900 ms bar, Voice Live returned empty transcripts on
5/14 short answers ("haan", "ok" are the commonest sales answers), and agent-lane end to end is 4.0–4.8 s p50. No
sales-register voice bake-off (words per turn, accent, Hinglish) has been run on Azure voices.

### 1.8 Chat agent

| asset | source | why |
|---|---|---|
| Agent-in-harness: one strong model per event, tools return verified truth ("CRM TRUTH" instead of "ON SCREEN"), state earned in code, deterministic fallback, env/tenant cohort pinned per session | tx-core `server/agent/*`, `server/studio/tools.js`, `docs/design/round5/AGENT.md` | The measured reversal of "model as full orchestrator" (15/72 hard-rule breaks): the model chooses, code enforces. |
| One `compile()` with CORE/TAIL, section budgets, whole-block drop order, must-fire rules last, throwing budget gate, shape lint for recitable sentences | tx-core `server/compiler/compile.js`, `scripts/check-prompt-budget.mjs`; hp-main `src/engine/compiler.ts`, `src/engine/shapelint.ts`, `__fixtures__/` (CORE byte-identity hash) | Server-side JS from Taxila, plus Meera's byte-stable CORE (prompt caching measured ~9x on cost) and shape lint. |
| Never-rules + delimited material block at the single reply door | hp-vyakti-completion `api/_never-rules.js`, `api/_surface.js`, `evals/room-adversarial-creator/`; tx-core `server/director/safety.js` (`floorViolations`, `neverRuleHits`, `scrubPii`) | Hostile material contained 25/41 to 41/41 once compiled as data; one reader for every lane (the optional `[]` default disabled rules for three days). |
| Output fences: loop/repeat fence and internals-disclosure fence (one unstreamed re-draft) | hp-maya-latest `src/engine/repeat.ts`, `src/engine/internalsFence.ts`, `evals/repeat.mjs`, `evals/behavioral/fence.mjs` | Pure, tested (2/2 severe caught, 0/205 false positives); repeats were the top Director failure (29/32 lessons). |

**Gap:** no streamed web chat with tools wired to a real CRM (sales-enabler's `/talk` chat is non-streamed, 3.2 s,
and duplicates its AI disclosure). No sales-domain eval corpus or buyer personas exist yet.

### 1.9 Orchestration

| asset | source | why |
|---|---|---|
| Conductor: event-sourced actor per entity on Postgres (`ingest_event` idempotent append, fold, decision log, `job`/`complete_job` fencing, `wakeup`/`fire_wakeups` SKIP LOCKED, rate buckets, documented lock order) + worker host (advisory-lock leader, dirty-set loop, refuses unapplied migrations) | tx-core `server/conductor/*`, `db/migrations/004_conductor*.sql`, `server/worker.mjs` | Production on ACA. Rename `child_seq`/`student_event` to `entity_seq`/`entity_event` keyed by tenant and entity (lead, account, deal, campaign, invoice). Durable timers give sequences and follow-ups without a queue product. |
| Durable step DAG + capability-absence codes + sweep with requeue | hp-gurukul-late `api/_replica-processing/{pipeline,contracts,queue,repository,runtime,worker,composition,capability-codes,sweep}.js`; hp-gurukul-early `api/replica-processing-sweep.js` | Production as an ACA Job; for multi-step pipelines (ingest document, transcribe call, enrich lead). Carries the CTE-snapshot fix. |
| Arbitration kernel (pure, deterministic proposals ranked by authority, vetoes, per-turn budgets) | tx-core `server/brain/kernel.js`, `shared/brain.ts` | "Who decides" when several agents act on one entity: compliance > opt-out > tenant caps > cost governor > plan > agent proposals. 23/24 correct in ≤10 ms vs best model 69/72 at +1.4 s. |
| Turn-checkpoint kernel (re-read authority and sources before each effect, sticky invalidation) | hp-multimodal-groupai `api/_group-runtime/checkpoints.js`, `evals/turn-checkpoints/run.mjs` | Drop-in, dependency-free authority re-check before any send, write or disclosure. |

**Gap:** no repo has a company-level planner (goals to plans to agent assignments to measured outcomes), a
cross-module human approval inbox, or orchestration that spans CRM, ERP, campaigns and agents. All existing
orchestration serves one product's own pipeline.

### 1.10 Analytics

| asset | source | why |
|---|---|---|
| Fact-cited report pipeline (facts, claims citing row ids, deterministic render, throwing gate, optional LLM ordering, gate again, independent re-deriving checker) + one "truth" module per metric | tx-core `server/reports/{claims,gate,check,truth,writer,render}.js` | Prevents fabricated numbers and dashboards that disagree; the right shape for executive digests. |
| HUMAN vs MACHINE engagement classifier (≥45 s session, ≥2 heartbeats >8 s apart, first event >10 min after send; rules only move toward MACHINE) | cc-main `lib/engagement-classifier.ts`, `lib/proposal-analytics.ts` | Measured: page views ~3x inflated by mail-security sandboxes (12 humans vs 244 machines). Make it the default for every engagement number. |
| Turn trace / flight recorder (references not copies, off-path writes, counters on drops, rrweb replay) | hp-main `src/engine/trace.ts`, `api/_trace.js`, `docs/TRACE.md`; tx-core `server/trace/*`, `scripts/trace.mjs` | Zero reply-path SQL; the substrate for agent debugging and campaign analytics. Port with tx-qa-release's three silent-loss fixes. |
| Pulse k-anonymous counts (n≥5) + funnel/cohort rows | hp-vyakti-completion `api/_pulse.js`, `api/_room-cohorts.js` | Safe aggregate analytics over customer data. |

**Gap:** no tenant-facing KPI semantic layer across CRM, ERP and campaigns; no attribution model (CC measured a
human visiting 9 days after delivery, so windows must be long); "not measured" as a first-class UI state exists only
as a lesson.

### 1.11 Auth and tenancy

| asset | source | why |
|---|---|---|
| Auth lifecycle (scrypt, email verify/reset over ACS with a dev outbox) + team roles owner/operator/viewer + invitations | se-audit `lib/server/auth.ts`, `lib/auth-lifecycle/*`, `lib/team/*`, `app/account/*`, `app/join` | Live-verified in se-live. Add org→workspace→user RBAC (today one org per user) and move mail onto the ACS outbox. |
| Leak battery (scenario generator x real SQL predicate, negative controls that must fail) | hp-vyakti-completion `evals/room-leak/run.mjs`; hp-main `evals/mp/gate0.mjs` | 16,080 and 31,122 checks with 0 leaks; tenant isolation becomes a gate, not a promise. |
| Persistent SQL-predicate rate limit (one upsert is the check) | hp-vyakti-completion `api/_rate-limit.js` | Race-safe, drop-in. |
| Precondition-naming refusals + API error-mapping rule (4xx keeps status; `*_not_configured` maps to 503) + `secureCompare` and per-purpose secrets | hp-gurukul-late `api/voice-preview.js`, `api/_replica-voice-preview.js`; cc-branches `lib/secure-compare.ts`, `lib/app-auth.ts` | Every permission/eligibility refusal names the first unmet precondition; no secret doubles as cookie key, bearer and query parameter. |

**Gap:** nobody has production multi-tenant B2B auth (CC: one shared password; Meera: device identity; Vyakti:
Supabase, not on our allow-list). SSO/Entra External ID is undecided. Per-tenant Azure quota and cost isolation is
unbuilt.

### 1.12 Infra and ops

| asset | source | why |
|---|---|---|
| Azure model gateway: per-lane endpoints (refuses key A to account B), hot vs background quota lanes (sliding window, not token bucket), hedge at p95, 429 overflow to a twin region (first attempt only, never for background), content-filter category parsing, USD accounting | tx-core `server/azure.js`, `server/endpoints.js`, `server/lanes.js`; overflow fix from `int/r5-rel142` / tx-voice `claude/r4-duplex` | Production; throttled live replies went from 20/20 fallback to 20/20 answered (+747–988 ms). |
| Provider budget ledger (reserve before I/O, begin, settle, uncertain, release; one atomic CTE checks the cap and inserts an idempotent reservation) + Azure-only serving origin policy | hp-vyakti-latest `api/_provider-budget.js`, `vy_provider_budget`/`vy_provider_spend`, `api/_model-serving-policy.js` (`assertAzureServingOrigin`) | Production receipts on Azure calls; enforces the Azure-only directive in code. Generalise meters to ACS email, Speech minutes, telephony. |
| Gated canary deploy over raw ARM REST (per-sha clean-tree gate stamps, migrations gate, ACR build from GitHub, 0% canary revision, smoke on revision URL, one-PATCH rollback) + observability (JSON access log, client-error beacon, Log Analytics KQL alerts) + probe jobs | tx-core `scripts/deploy-azure.mjs`, `infra/{gate,azure,eyes}.mjs`, `infra/probes/*`, `server/router.js`; tx-qa-release packaged-tree check | ~13 production releases in 5 days with rollback; the only deploy pipeline in the family that is Azure-native and proven. |
| ACA Job run-to-completion worker with startup capability self-assertion + wake-then-sign HMAC + Startup-probe recipe | hp-gurukul-late `services/replica-processing-worker/{run-once.js,db.js,infra/main.bicep}`, `providers/azure-voice-evidence.js`; hp-private-voice probe rejections | Zero idle cost; every scale-to-zero trap (60 s skew vs 161–176 s cold start, default liveness probe crash loop) already paid for. |

**Gap:** sales-enabler's Foundry project currently sits on the same eastus2 account as Taxila's live lessons
(tx-core risk); it needs its own account or deployments and quotas. No Key Vault-based secret management in any
web app (all used gitignored `_config.js` or `.env.local`). Neon has no India region (tx-core rejection); data
residency for Indian B2B customers is undecided. Nothing is provisioned for sales-enabler (East US 2 rejected
Postgres; Bicep never applied).

### 1.13 Eval and quality

| asset | source | why |
|---|---|---|
| Sim lab: simulated counterparty from a persona card with a hidden key, decided outcomes in code, cross-family judge that extracts beliefs, code scores against the key, A/A noise floor, run hygiene (cap 4, stagger, drop >2% unavailable) | tx-qa-release `claude/r5-simlab`: `evals/simlab/{personas,child,decide,runner,judge,loop,report,facts,lib}.mjs` | Directly becomes "simulated buyer vs our SDR agent". It is how Taxila found that holistic preference (57/64) and correctness (64% vs 62%) diverge. |
| Behavioral attack battery (predicate graders with severity tiers, cash cap before each call, `--dry` makes zero calls, gate exit codes) | hp-maya-latest `evals/behavioral/{run,grade,attacks.data,fence}.mjs` | Template for disclosure, compliance, objection and loop attacks on sales agents. |
| `verify-release` runner where skips are red + eval registry worker pool (registration enforced in the same edit) + door battery with SQL markers | tx-core `scripts/verify-release.mjs`, `.github/workflows/gates.yml`; hp-vyakti-completion `evals/run.mjs`, `evals/runner-lib.mjs`, `evals/room-doors/` | One command, all gates; an unregistered suite or a skipped browser gate can no longer report "ok". |
| Blind preference and qualification statistics (earbench four-cell counterbalance, catch trials, Wilson lower bound, Bradley-Terry active pairs) | hp-gurukul-early `scripts/earbench.mjs`; hp-voice-cloning `api/_replica-voice-curriculum.js`, `api/_replica-voice-delivery-policy.js` | Reusable for voice, copy and creative choices; under-powered is its own verdict. |

**Gap:** no sales buyer persona corpus, no evaluation on real calls, and no measured link between eval scores and
business outcomes (meetings booked, replies, revenue). Every LLM judge family tested failed a 0.80 agreement bar
(hp-maya-latest), so qualified judges for business tasks do not exist yet.

### 1.14 Design and UI

| asset | source | why |
|---|---|---|
| Token-only design system mechanism (scoped `[data-look][data-theme]`, raw hex in one file, lint banning colour literals, contrast pairs ≥5:1 in CI, one-accent law, reduced motion, parity harness for flag-gated redesigns) | tx-content-ui `src/ui-v3/kaksha/*`, `src/styles/tokens.css`, `tests/r4-kaksha-lint.test.mjs`, `tests/prod/r4-kaksha-parity.mjs`; hp-gurukul-early `src/studio/design/tokens.css`, `docs/gurukul/DESIGN-LAW.md`, `scripts/check-{copy,contrast,motion}.mjs` | Take the mechanism, not the child palette. Copy gate found and fixed 117/120 violations. |
| Honest status UX: you/us blocker class (property eval over 27,648 inputs) + Activity surface (one job shape across all async lanes, no fake percentages, undeployed lane as a named state) | hp-gurukul-late `src/studio/blockerClass.ts`, `wizardModel.ts`, `BlockerNotice.tsx`; hp-gurukul-early `api/_replica-activity.js`, `src/studio/ActivityPanel.tsx` | The operator's view of an AI-run company is mostly "what is waiting on whom"; this is the tested type for it. |
| Signed-in layout gate without secrets (real app in a fixture page, measures chars/line, font floor, track mismatch, contrast) + rendered visual QA at real viewports | hp-gurukul-late `scripts/check-layout.mjs`, `studio-layout-fixture.html`; tx-content-ui `server/forge3/qa/{measure,render,viewports,checks}.js` | Catches the class of bugs (67 px columns, 1.73:1 CTAs) that owners rejected UIs for. |
| `/prototype` visual language (editorial serif, warm palette, KPI row) as the starting direction | se-live / se-audit `app/prototype/page.tsx` (code is dead; keep only screenshots and the look) | se-live judged it the most attractive surface; it is a direction, not validated by the owner. |

**Gap:** the command-centre UI itself. Every prior product UI was rejected by an owner (sales-enabler v1–v7 on
2026-10-01; Vyakti recorder 2026-09-14; Taxila release rated 0/100). No dense B2B data-table, pipeline board or
KPI dashboard design exists in the family. No hover-only controls (cc-branches touch fix).

### 1.15 Content generation

| asset | source | why |
|---|---|---|
| "Model picks enums, code builds" (strict closed-enum schema, field-by-field validation, deadline fallback to a base) | tx-content-ui `server/play/dress.js`, `src/play/engines/core3d/api.ts` (`validateDelta`, `DRESS_ENUMS`) | Free generation measured 0–3/8 valid at 12–30 s; enums plus code building are fast and correct. Campaign templates, landing variants and report charts follow this. |
| One certificate gate per output kind + a test that scans for producers that bypass it | tx-content-ui `server/forge3/tray-gate.js`, `tests/r4-content-tray-gate.test.mjs` | Every outbound asset passes one gate; a new ungated producer fails CI. |
| Fill pipeline with cache identity (canonical-JSON sha over versions + model + inputs) and dead-key memo | tx-content-ui `server/forge/{index,planner,generator,gate,cache}.js` | Memory-hit p95 987 ms to ≤1 ms; deterministic personalised assets. |
| Personalised offer page + PDF brief generator (react-pdf variants, savings calculator) | cc-main `lib/free-quarter/*`, `lib/importer-brief/*`, `app/p/[token]` | Production, but CBAM-specific: idea for per-lead collateral; PDF only on reply (deliverability). |

**Gap:** no brand-safe campaign copy generator wired to the honesty gate (no invented prices, codes, emails) with
offer facts injected from data. Generated images cannot carry labels or numbers (gpt-image-2 Hindi labels wrong
5/32), so marketing imagery needs code-drawn text overlays; none exists.

### 1.16 Memory and learning

| asset | source | why |
|---|---|---|
| Episodic memory design: episodes as citation ground truth, index-only citations, 5% second-family entailment audit that halts above 2% refutation, contradictions as new rows, forget with suppression | hp-main `api/memory.js`, `api/consolidate.js`, `db/schema.sql` (`vy_episode`, `vy_fact`) | Production; consolidation ~$0.0007 per person per night. Rewrite against CRM entities; take the design and tests, not the 4.4k-line files. |
| Per-contact communication preferences (language, script, detail level, correction, forget, reclassification) | hp-handoffs `src/engine/learnerCommunication.ts`, `api/_room-memory-*`, migration 162 | Maps to CRM contact preferences; its only live trial failed (stored Hindi preference, English reply), so ship with a live adherence test. |
| Leakage-safe feedback dataset compiler + per-layer turn feedback (corrections stored as evidence, never as prompt mutation) | hp-voice-cloning `api/_replica-feedback-dataset.js`, `api/_replica-feedback.js`, `docs/FEEDBACK-DATASET.md` | Splits by whole conversation; unsafe sessions forced to holdout. |
| Calibration call with approved deltas (owner talks to their agent, corrections become proposed changes approved by SQL clause) | hp-gurukul-early `api/mirror-call.js`, `api/_mirrorcall*.js`, `docs/gurukul/MIRROR-CALL-SPEC.md` | The right onboarding for a tenant's sales agent: learning is selection plus approval, not accumulation. |

**Gap:** no closed loop from campaign/call outcomes to reviewed agent or campaign revisions has run live anywhere
(sales-enabler's AutoLearning is default off; Vyakti's loop was offline). No memory retention/soft-delete policy has
been decided in any repo, which is what made the 44-row deletion unrecoverable.

### 1.17 Safety

| asset | source | why |
|---|---|---|
| Honesty gate: provenance allowlist (an identifier not in the input counts as invented) with content-preservation controls | hp-main `src/engine/honesty.ts`, `evals/honesty/*` | A pattern blocklist would delete real numbers (it would have deleted the crisis helpline); provenance stops invented prices, emails, discount codes and case numbers in outbound copy and speech. |
| Verified human intent before any LLM-triggered destructive or outbound action, checked in code | hp-maya-latest `src/engine/memory.ts` (`userAskedToForget`, `claimsDeletion`), `evals/forget/intent.mjs` | Born from 44 rows hard-deleted by a model marker with no recovery. Applies to delete, send, call and spend. |
| Send-path guardrails as invariants (suppression and scope re-checked at send time, one send path, atomic claim, DB-side caps, kill switch, right-split unsubscribe tokens) | cc-branches `claude/context-project-review-0x0i6g`: `lib/cold-email/sequence-engine.ts`, `lead-followup.ts`, `lib/whatsapp/executor.ts`, `unsubscribe-token.test.ts` | 136/136 tests; fixes compliance bugs still live on CC main. |
| Consent: append-only consent ledger + content-filter category split with neutral re-probe | hp-maya-latest `db/migrations/016_memory_consent.sql`; tx-core `server/azure.js` (`filterCategories`, `nonHarmFilter`) | Newest row is the current answer, no update path. Filter split took false safeguards from 4/32 to 0/32. |

**Gap:** no TRAI/DND scrubbing or calling-hours enforcement for Indian outbound voice (TRAI outbound-AI rules in
force since 2026-03-10, per hp-maya-latest market sweep); no end-to-end DPDP consent record (full effect
2027-05-14); a realtime voice output cannot be fenced after the fact, so every spoken word must be gated before TTS.

---

## 2. Inherited laws (measured, deduped, binding on the new build)

Each law states the rule, the evidence, and where it was measured. A change that breaks one of these is wrong
unless it comes with new measurement that supersedes the old.

**Prompts and models**

1. **Position is mechanism: rules that must fire go last, and the last slot is scarce.** Same rule 0/8 buried
   mid-brief vs 8/8 appended last (hp-main); brevity mid-prompt 64 words/turn vs 25 when last (tx-core, tx-voice).
2. **Sentence-shaped prompt text gets recited: write shapes and notes, never lines the agent could say.** Example
   quotes recited 4/5 to 0 after removal (hp-main); quoted floor phrases recited in 22/33 replies (tx-core);
   bracketed stage directions and labels are spoken aloud (hp-main, tx-voice).
3. **One `compile()` and one gated reply door for every lane and surface; no second assembler.** A hand-built
   realtime prompt lost two safety blocks and Telegram skipped all gates (hp-main); never-rules defaulting to `[]`
   disabled creator rules on three lanes for three days with green suites (hp-vyakti-completion).
4. **Truncation is silent, so budgets throw; count real UTF-8 bytes per segment after escaping and refuse rather
   than slice.** It once cost the crisis helplines (hp-main); a 65k core passed a byte cap but overflowed the real
   slice (hp-multimodal-groupai).
5. **The prompt sets a ceiling; the model decides how close you get.** grok-4-20 lost 38-2 on an identical prompt
   and gpt-realtime-mini ran 41–53 words/turn regardless of instruction (hp-main); bake off per role, pin the
   deployment, watch drift (a Foundry deployment drifted within 4 days, hp-main).
6. **Caching claims are per provider and per wire shape: keep a byte-stable core, put volatile lines last, read
   cached-token counts off real responses.** `cache_control` was a no-op on Google despite a -85% code comment; moving
   the tail to a user role shifted register and once dropped a helpline (hp-maya-latest); cached vs uncached turn
   cost $0.0017 vs $0.0160 (hp-main).
7. **Pass the caller's clock everywhere; nothing reads the wall clock inside a compiler or gate.** A fixture rotted
   after 43 days with no code change (hp-maya-latest, hp-multimodal-groupai).
8. **Reasoning effort is a latency lever, not a free quality gain.** Effort none vs low tied on quality with ~1 s
   faster p50 and 14 vs 43 fallbacks (tx-voice); reasoning on heavy turns over-triggered helplines 16.7% (hp-main).

**Decisions, state and safety**

9. **The model chooses, code enforces: hard rules, grades and state transitions live in code.** Model as full
   orchestrator broke hard rules in 15/72 runs at +1.4–1.7 s (tx-core); "understood" overclaimed 61/164 until earned
   in code. "Lead qualified", "deal won" and "invoice paid" are earned from evidence, never asserted by a model.
10. **Safety and privacy are predicates on bytes and SQL WHERE clauses, never instructions.** Prompt privacy leaked
    57.1% naturalistic / 98.1% adversarial vs 0 of 31,122 for the SQL predicate (hp-main); 16,080 leak checks, 0
    leaks (hp-vyakti-completion); an honesty instruction still fabricated "your resume arrived" (hp-main).
11. **Identifiers are checked by provenance, not by blocklist.** A pattern blocklist would delete the crisis helpline;
    an identifier absent from the input is invented (hp-main).
12. **Any LLM-triggered destructive, outbound or spending action requires the human's ask verified in code, and a
    retention/soft-delete policy decided before shipping.** 44 rows deleted, PITR 1 day vs 32 h, unrecoverable
    (hp-maya-latest).
13. **Content from documents, customers and creators enters prompts only as a delimited data block, with an
    ingest-time instruction detector.** Contained hostile passages 25/41 to 41/41 (hp-vyakti-completion).
14. **Azure AI Content Safety is never the sole gate; content-filter blocks are split by category and re-probed.**
    Severity 0 on clear violations and no Hindi (tx-core, tx-content-ui); false helplines on maths answers 4/32 to
    0/32 after the split (tx-core).
15. **Agent state is agent-scoped, relationship state is contact-scoped, memory is never keyed by surface or device,
    and identity is an authenticated id.** Per-listener self-facts gave two users contradictory lives (hp-main);
    unscoped memory blocked a second agent (hp-voice-cloning).
16. **Consent is append-only and checked against the original platform sent-time, repeated inside the SQL write.**
    Arrival or edit time lets a delayed message predate its consent (hp-multimodal-groupai, hp-maya-latest).

**Outbound, campaigns and data**

17. **Never report delivery from an attempt: outcomes are confirmed / not_executed / unknown, unknown is never
    auto-retried, and every sender writes through a durable outbox with a stable operation id.** False `said:true`
    and duplicate replay measured (hp-multimodal-groupai); a stateless retry re-mints the link and double-sends, and
    ACS 202 is not delivery (hp-vyakti-latest).
18. **Every send path re-checks suppression and scope at send time, there is exactly one send path, and claims are
    atomic with DB-side caps.** Unsubscribe rejected every real address; quarantined leads re-armable; three
    divergent send paths (cc-branches, cc-main).
19. **ICP accuracy, not volume or deliverability, decides outcomes: pre-labelled pools lie, email verification is
    not fit verification, never guess a domain, and evidence must sit in the company's own rendered body text.**
    `eu_strong` ~34% reliable; 4 of 56 "cbam_strong" genuine; guessed domains sent ~156 emails to strangers (cc-main,
    cc-branches).
20. **Engagement numbers are machine-inflated until classified HUMAN vs MACHINE.** ~3x inflation; 12 humans vs 244
    machines (cc-main).
21. **A metric with no writer is a lie: show "not measured", never a placeholder zero; observability is not live
    until one row has been read back.** `complaints = 0` was hard-coded and bounce alerting read a status nothing
    wrote (cc-main); the ops stream lost every row behind a swallowing catch (hp-maya-latest); three silent trace-loss
    bugs (tx-qa-release).
22. **Offer facts, prices and dates live in data, never in prompt prose.** Stale "April–June free quarter" prompts
    contradicted the live offer (cc-main).
23. **Outreach needs a citable reason and campaign state is coupled to deal state.** Silence-triggered pings banned
    (hp-vyakti-completion); a CFO in negotiation got a cold "free" blast (cc-branches); the founder killed automated
    follow-up sequences (cc-main).
24. **Vendor caps are enforced against the vendor's own billing, with reserve-before-I/O, and research never shares a
    key or quota with production.** Apollo billed 2,500 against a 2K internal cap (cc-main); evals throttled prod
    51/361 and took chat down twice (tx-core, tx-qa-release, hp-main).

**Voice**

25. **Gate every word before it is heard: the voice is a cascade (our LLM text, gated, then TTS); realtime
    speech-to-speech is not the speaker.** Realtime owns the floor before a predicate can run, costs ~$0.088 vs
    $0.027/min, and monologues 41–53 words / 14 s (tx-voice, hp-main, hp-vyakti-latest).
26. **Metrics do not pick voices: every voice choice needs a blind ear test with accent as its own axis, and words
    per turn and turn length are first-class metrics.** Azure TTS won 15/15 pronunciation, 255 ms and 5x cost and was
    rejected by ear as "not human, not Indian" (hp-main, hp-voice-cloning, hp-handoffs); audio LLM judges rated an
    American accent "native Indian" (tx-voice).
27. **Transcribers fabricate on silence: run a non-speech probe (n≥30) before any ASR writes to the CRM, and never
    put vocabulary lists in a free-text ASR prompt.** gpt-transcribe 7/12 invented on non-speech, MAI-1.5 wrote
    Spanish news on silence (tx-voice, tx-core). Text-lane evals overstate voice quality (77 to 51 correct, tx-qa-release).
28. **Barge-in pauses then lets the transcript decide; silence alone does not end a turn.** Kill-on-speech_started
    lost questions to coughs and echo; silence cut users off 11–15/25 vs 0/25 (tx-voice).
29. **Order transcript spans by audio offset and keep `\p{M}` in Indic tokenizers.** A raw 46.6% WER was ordering;
    stripped matras measured code-switch 0.000 (hp-handoffs, hp-vyakti-completion); Hindi spoken numbers are a real
    defect class (tx-voice).

**Infra and process**

30. **Scale-to-zero services: wake, then sign; use an explicit Startup probe; image size is a correctness property;
    warming is a state, not a failure.** 60 s HMAC skew vs 161–176 s cold start gave a guaranteed 401; readiness-only
    probes crash-looped; 45 "failed" rows were normal cold starts (hp-gurukul-late, hp-private-voice, hp-handoffs,
    hp-vyakti-latest).
31. **Every queue names the line that calls its consumer and the schedule that calls that line; every step has an
    adapter and a missing capability throws a named code.** A complete producer and runner with no caller left the
    owner's job queued forever; a degraded scanner would report "clean" (hp-gurukul-early, hp-gurukul-late).
32. **Do not fold 5xx into deterministic aborts or use fixed fuses on a variable upstream; use a classifier plus a
    wall-clock deadline.** One 502 aborted a healthy pool; a 1,400 ms fuse turned a slow night into silence (hp-main,
    hp-voice-cloning).
33. **Offline mocks cannot type-check SQL: smoke every statement against real Postgres (EXPLAIN), cast `::uuid` on
    Neon HTTP, and never let a fake DB re-implement the guard under test.** 5,161 green checks then a 500 on the first
    click (hp-handoffs); a battery passed 10/10 with the fix reverted (hp-vyakti-completion); a CTE cannot see its own
    inserts (hp-gurukul-late).
34. **Gate the packaged image tree, not the checkout, and a skipped gate is red.** `.dockerignore` dropped a runtime
    contract and production refused every artifact (tx-qa-release, tx-content-ui); browser gates "passed" with no
    Chromium (hp-vyakti-completion).
35. **Green gates are not a product: define and run the first real user journey before building ledgers and
    observers, and accept releases only on owner experience tests in real sessions.** Vyakti never ran a signed-in
    journey (hp-handoffs); a green-battery release was rated 0/100 (tx-qa-release).
36. **A dry run spends nothing and resumable state records outcomes, not attempts.** A dry run called the paid model;
    a run reported COMPLETE at 37% coverage (hp-main).
37. **Parallel agents work in isolated worktrees, the coordinator commits, and waves are sized to account limits.**
    A `git reset --hard` destroyed concurrent work (hp-main, hp-vyakti-latest); 16 harvest agents lost 8 to the
    session limit (cc-branches).
38. **Project memory: decisions carry reversal conditions, measurements carry n/method/date, rejections are read
    first, superseded entries get edges, and the graph is validated in CI; keep it per-topic and lean.** Shared by
    hp-main, tx-core and every Vyakti branch; Vyakti's 4–7 MB context and 2.5 MB handoff show the cost of letting it
    sprawl (hp-handoffs, hp-vyakti-completion).

---

## 3. Top rejections not to repeat

Ranked by how likely the new build is to walk into them.

1. **Realtime speech-to-speech (gpt-realtime-2.1-mini, Voice Live S2S, GPT-Live-1) as the speaking agent.** 41–53
   words/turn, 14 s monologues, ungateable audio, ~3x cost, 66/168 rate-limited at 3-wide, 38% pause takeovers
   (hp-main, tx-voice, tx-core). sales-enabler's own "most real" stack A is this model.
2. **A model as the whole decision layer, or confidence-based escalation from a cheap model.** 15/72 hard-rule breaks;
   the cheap model escalated 3% of turns (tx-core).
3. **Safety, privacy or honesty enforced by prompt instruction.** 57–98% leak vs 0 for predicates (hp-main).
4. **Trusting a model-emitted marker to delete, send or spend.** 44 rows irrecoverably deleted (hp-maya-latest).
5. **Reporting delivery from an attempt; stateless "generate link then send"; auto-retrying an unknown outcome.**
   False success and duplicate sends (hp-multimodal-groupai, hp-vyakti-latest).
6. **Trusting pre-labelled lead pools, email-verification-as-ICP, guessed domains, Apollo industry search, snippet
   evidence, or licence-restricted registries (KBO and nine others).** ~30 mis-targeted offers, emails to strangers,
   ~758 credits wasted (cc-main, cc-branches).
7. **Multiple send paths and enroll-time-only suppression or scope checks.** Opt-outs failed; quarantined leads
   re-armed (cc-branches).
8. **Open-tracking pixels or PDF attachments on first cold touch; WhatsApp marketing templates to cold numbers.**
   Placement loss on warming domains; Meta 131049 drops (cc-main, cc-branches).
9. **Choosing a voice or ASR on metrics alone, or with an audio-LLM judge.** Azure coral rejected by ear; judges
   called an American accent Indian (hp-main, tx-voice).
10. **gpt-4o-transcribe / gpt-transcribe / MAI-Transcribe-1.5 / Qwen3-ASR as a transcript of record, and vocabulary
    lists in ASR prompts.** Fluent fabrication on silence (tx-voice, tx-core).
11. **Self-hosted open-weight TTS on scale-to-zero T4 for live calls.** ~5 min cold start, RTF 2–4 for Hindi-capable
    models (hp-private-voice, hp-handoffs).
12. **Holistic 1–10 LLM judges as gates; quoting agreement from a truncated run; mean check-pass as quality.**
    r = -0.17 to 0.63 vs humans; 65% empty replies made 17/17 look good (tx-content-ui, hp-maya-latest).
13. **Free-form live generation of scenes, copy or diagrams, and generated media carrying facts.** 0–3/8 valid at
    12–30 s; wrong labels no gate catches (tx-content-ui).
14. **Evals or test traffic on the production deployment or quota.** 51/361 prod 429s; production chat down twice
    (tx-qa-release, hp-main).
15. **Role-play simulator prompts on Azure ("You are X, never say you are an AI").** Prompt Shields block them as
    jailbreaks; frame as a QA writing task (tx-qa-release).
16. **A queue, cron or adapter with no caller; capabilities that "degrade gracefully" into a success code.**
    (hp-gurukul-early, hp-gurukul-late, hp-main)
17. **Single JSON-blob entity table, CAS by full-JSON equality, RPC-by-string multiplexer, unpaginated "return
    everything" endpoints.** The current sales-enabler data layer (se-audit).
18. **Vercel crons, Supabase auth, OpenRouter/Gemini/OpenAI-direct/Sarvam/ElevenLabs lanes.** Outside the Azure-only
    directive; Gemini free-pool keys in sales-enabler must be deleted (se-audit, hp-gurukul-late, cc-main).
19. **Infrastructure-before-journey sequencing** (ledgers, observers, receipts, handoff bookkeeping before one real
    signed-in journey). Vyakti's own post-mortem (hp-handoffs).
20. **Seven agents in one working tree; 16 agents in one wave; blind retry of a failed production migration.**
    (hp-main, hp-vyakti-latest, cc-branches)

---

## 4. Verdict on the current sales-enabler code

**Rebuild. Harvest about a dozen mechanisms; do not refactor in place.**

What it is (se-audit, se-live): a Codex-built, never-deployed Next 16 / React 19 prototype of one workflow (company
data, reviewed brain, AI campaign plan, browser voice call, reviewed learning). It works better than "basic" suggests:
se-live ran signup to public chat end to end against real Azure gpt-4.1-mini with no 5xx and no 390 px overflow, on
1,153 passing unit tests. It is still the wrong product:

- **Data model:** one `entities(kind, data TEXT)` JSON-blob table written by raw SQL from 44+ files, CAS by full-JSON
  equality, no migrations, one org per user, audio blobs in the DB. CRM/ERP/analytics queries are impossible without a
  redesign. This alone forces a rebuild.
- **Shape:** a voice-agent studio plus governance ledger. No account/company, deal, pipeline, activity, custom field,
  ERP object, lead generation or telephony. Campaign channels are browser voice and email only.
- **Voice:** five stacks (~7.7k lib lines, ~10.5k test lines, ~35% of lib, ~50% of tests). The most-evidenced one is
  gpt-realtime-2.1-mini over WebRTC, which four sibling repos measured and rejected for register; it was never tested
  with a real microphone. One stack (Gemini/Maya on recovered free-pool keys) violates Azure-only.
- **Shell:** one client-rendered hash-routed page, 72 API routes including an action-string multiplexer, seven
  long-running processes, lines up to 10,820 characters, heavy disclaimer copy. The owner rejected the UX on
  2026-10-01 and judged the whole baseline basic, stale and messy on 2026-10-15.
- **Evidence:** contract tests with mocked transports only; no browser e2e, no Postgres test, no live eval.

**Carry forward (re-implemented against the new schema):**

1. Evidence-span brain intake with exact-quote revalidation and human approval (`lib/ingestion/*`, `lib/brain/*`).
2. AI column mapping for CSV/JSON intake (`lib/data-intake/*`), plus a heuristic first pass and custom fields.
3. Idempotent AI task router and token budget ledger ideas (`lib/ai/*`, `lib/usage/*`), merged into the provider
   budget ledger (section 1.12).
4. Durable outbound delivery with explicit uncertain states (`lib/delivery/*`), moved onto ACS.
5. Encrypted connector vault, Google/Microsoft OAuth and the adapter registry (`lib/integrations/*`).
6. Public deployment boundary: frozen snapshot, allowed origins, mandatory caps, public id (`lib/deployments/*`,
   `lib/public-agent/*`).
7. Agent version / release / rollback authority (`lib/agent-revision/*`, release records).
8. Auth lifecycle, team roles and invitations (`lib/server/auth.ts`, `lib/auth-lifecycle/*`, `lib/team/*`).
9. Voice Live protocol facts and gateway shape (`lib/voice/voice-live-*`): initial rate accepted with exact ACK in
   1,969 ms; in-session rate change is not supported; omitted vs null prompt crashed startup.
10. PCM16 AudioWorklet capture (`lib/voice/pcm-capture.ts`) and speech-delivery / vocabulary hint profiles.
11. Server-relay gateway shape for a later PSTN leg (`lib/public-agent/gateway.ts`).
12. Container Apps Bicep and readiness/package checks as reference only (never applied).
13. The `/prototype` visual direction (screenshots, not code).

**Delete:** Gemini/Maya and OpenAI-direct paths and keys (`MAYA_*`, `GEMINI_*`, `OPENAI_API_KEY`, `scripts/maya-*`),
GroupAI, `app/prototype` code, `components/campaign-planner.tsx`, `components/company-operating-flow.tsx`, the Taxila
voice audition, the Personal Voice cloning panel (catalog 403), legacy v1 routes, the research/evidence UI shipped
as product, and four of the five voice stacks.

**Fix before anything reuses it:** the business-model "Approve offering" gate is bypassable by clearing the
questions textarea; customer CSVs appear as company material (PII into knowledge extraction); the duplicated AI
disclosure on `/talk`.

---

## 5. Conflicts between repos, and which evidence wins

| # | conflict | positions | winner and why |
|---|---|---|---|
| 1 | **Voice architecture** | sales-enabler: private gpt-realtime WebRTC (stack A) with Voice Live S2S as target. Meera: Gemini Live native audio. Vyakti: self-hosted Chatterbox on T4. Taxila: cascade with Voice Live as ear (D5) and DragonHD TTS. | **Taxila D5 cascade.** Measured 0/66 echo false barge-in, 12/12 barge-in, ~$0.027/min, and it is the only arm that gates text before audio. Realtime was rejected on register in four repos; Gemini is non-Azure; T4 TTS cold-starts in ~5 min. Open caveats to measure on calls: EOT 1,480 ms, 5/14 empty short-answer transcripts, 4–5 s agent-lane end to end. Keep a single provider-neutral voice contract (hp-voice-cloning `api/_voice/contracts.js`) so the choice stays reversible. |
| 2 | **Which Azure voice sounds right** | Meera/Vyakti: Azure neural TTS rejected by ear. Taxila: DragonHD en-IN voices in production. | **Neither verdict transfers; the method wins.** Meera's rejection was for a 24-year-old companion persona; Taxila never ran a blind accent test. Under Azure-only, DragonHD/neural voices are the only streaming options, so run earbench (accent, naturalness, critical-unit pronunciation, words/turn) on a sales script before committing a default voice. |
| 3 | **Email transport** | CC: multi-identity Google Workspace fleet over SMTP/IMAP with a measured placement playbook. Vyakti/se-audit: ACS Email outbox. | **ACS Email** (the directive names it, and only the outbox design survives retries correctly). CC's deliverability numbers do not transfer: they describe per-mailbox Gmail reputation. Keep CC's sender-identity abstraction, throttle and ramp, and re-measure placement on ACS before claiming parity. Inbound reply ingestion (ACS inbound, Graph or own MX) is an open decision. |
| 4 | **Orchestration substrate** | Taxila Conductor (event-sourced actors, production). Vyakti step DAG on an ACA Job. CC Vercel crons. sales-enabler automation/channel/learning workers. | **Conductor as the core runtime** (durable per-entity state, timers and jobs; production worker on ACA), with the **DAG pattern for multi-step pipelines** run as ACA Jobs. Vercel crons are out (Azure-only, and a 2-minute cron needs leases anyway). One API, one realtime gateway, one worker plus jobs replaces sales-enabler's seven processes. |
| 5 | **Who decides** | Taxila round 1–4: deterministic Director. Taxila model-full-orchestrator: rejected. Taxila round 5: LLM agent in a code harness. | **Agent in harness + arbitration kernel.** The agent won 57/64 on quality, but correctness did not improve (64% vs 62%) and it overclaimed more, so every state claim is earned in code and the kernel holds authority order. |
| 6 | **Spend governance** | hp-voice-cloning / hp-vyakti-latest `_provider-budget.js`; hp-handoffs/hp-private-voice GPU allocation meter; tx-core gateway USD accounting; se-audit token ledger. | **`_provider-budget.js`** (production receipts, one atomic CTE, `uncertain` state) as the ledger, fed by the Taxila gateway's per-call usage. The GPU meter is heavier and unverified on real Postgres; we have no GPU. Note it is a planning reserve, not an invoice cap: reconcile against Azure billing. |
| 7 | **Prompt compiler** | hp-main `compile()` (client-side TS, CORE/TAIL, byte-identity hash, shape lint). tx-core `compile()` (server JS, section caps, throws). | **Taxila's server-side compiler** as the base (a SaaS cannot compile prompts in the browser), **plus Meera's CORE byte-identity fixtures and shape lint** (caching and recitation are the measured reasons). |
| 8 | **Retrieval** | sales-enabler and Vyakti: lexical. hp-multimodal-groupai: lexical recall 0/27 adversarial. Meera: `halfvec` semantic + keyword in parallel. | **Meera's pgvector `halfvec` on Neon in parallel with keyword**, evaluated with the frozen preregistered corpus method (hp-multimodal-groupai) including adversarial distractors. Embeddings: Azure `text-embedding-3-small` (deployed in several repos). |
| 9 | **Judges** | Meera: every judge family fails 0.80. Taxila: holistic judges rejected, yet sim lab uses cross-family judges. | **Both, correctly read:** judges extract beliefs and code scores them against a hidden key; holistic scores are advisory; A/A noise floor and n≥60 per arm before claiming a delta. |
| 10 | **Auth** | CC shared password; Meera device identity; Vyakti Supabase; se-audit and Taxila own scrypt sessions. | **Own scrypt sessions on Neon (se-audit lifecycle, Taxila cookie pattern) with an org→workspace→user→role layer and ACS for auth mail.** Supabase is not on the allow-list; Entra External ID stays the reversal option if enterprise SSO is required. |
| 11 | **Hosting** | CC, Meera, Vyakti, sales-enabler drafts: Vercel or never deployed. Taxila: ACA with canary deploys. | **Azure Container Apps with Taxila's deploy pipeline**, in a **separate** resource group, ACR, Log Analytics and Foundry account from Taxila. The `services/azure-web` adapter (hp-vyakti-latest) is a reference for cron-to-Job conversion only. |
| 12 | **Live ASR** | Vyakti: Sarvam. sales-enabler: Azure Speech SDK sidecar. Taxila: gpt-live-transcribe + keywords, Voice Live azure-speech, MAI-Transcribe-2 in southindia; gpt-4o-transcribe rejected. | **Voice Live `azure-speech` hi-IN,en-IN (inside D5) for live, Azure Fast Transcription for recordings**, each passing the non-speech probe. Sarvam is out. Note gpt-live-transcribe returns no logprobs, so confidence gates are dead on that lane. |
| 13 | **Follow-ups and proactive outreach** | se-audit: scheduled email automations. CC: founder killed multi-step follow-ups; waves instead. Vyakti Rooms: check-ins only for a citable reason. | **Sequences are a capability, not a default.** Every touch needs a citable reason, re-checks deal state, suppression and scope at send time, and follow-ups run as deliberate reviewed waves unless the tenant opts in. |
| 14 | **Process weight** | Vyakti: heavy receipts, intents, observers, 7 MB context. Taxila: fast release train with gates. CC: session-log discipline. | **Taxila's cadence with Vyakti's honesty rules applied selectively** (receipts for money, sends and migrations only). Journey-first (hp-handoffs) overrides any instinct to build governance before a working flow. |
| 15 | **Region and data residency** | Taxila: eastus2 faster for LLM TTFT than southindia (878 vs 1,227 ms from Chennai) but MAI STT 68 vs 753 ms in-region; Neon has no India region. | **Unresolved; measure.** Default to eastus2 for LLM lanes and an India region for Speech/Voice Live if call latency demands it; decide Neon vs Azure Postgres Flexible when the first Indian customer requires residency. |

---

## 6. What this implies for build order

1. **Journey first.** Sign in, create org, import leads (CSV with AI mapping), qualify against a tenant ICP config,
   draft a campaign from approved brain facts, send through the ACS outbox to a test inbox, receive a reply, classify
   it, update the CRM, see it on a fact-cited dashboard. Run it on Azure before building any secondary ledger.
2. **Spine in parallel with step 1:** Neon schema with `org_id` everywhere and migrations as the only source of truth,
   audit trigger, model gateway with quota lanes, provider budget ledger, Azure-only serving policy, one compiler and
   one gated reply door, Conductor worker, canary deploy and verify-release with skips red.
3. **Agents next:** chat agent on the harness with CRM tools; then the voice agent on D5 in the browser; then
   telephony via ACS Call Automation once an Indian carrier path is chosen.
4. **Sim lab before tuning agents:** buyer persona cards with hidden keys, decided outcomes, A/A noise floor, its own
   Azure deployment.
5. **ERP last among core modules,** on the same audit, approval and Conductor patterns, starting with quotes and GST
   invoices because closing was the measured bottleneck.

Separately, outside this rebuild: cc-branches found the CommandCentre unsubscribe bug and the unmerged security sweep
are still live on its main. That repo is not ours to touch; it is recorded here only so the owner knows.
