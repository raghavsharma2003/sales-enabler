# sales-enabler deep audit (se-audit)

- Repo: `/home/user/sales-enabler`, branch `claude/serene-franklin-9w7f1v`, HEAD `a56aa60`.
- Date: 2026-10-15. This was a read-only audit: nothing was changed except this file, and nothing was committed.
- Baseline used: `context/graph.json` node `evidence.2026-10-15.baseline-tests` (npm ci ok, tsc clean, 1153/1153 unit tests on Node 22.22). I did not re-run the 322 s suite for this audit. Every count below comes from `wc`, `grep` or `find` against the working tree.
- Measured against the 2026-10-15 vision: an AI company command centre covering ERP, CRM, campaigns, lead generation, omnichannel, company brain, voice and chat agents, and orchestration. Azure-only. Neon allowed. Telephony later.

## 0. Summary

The codebase is a large, careful prototype for one workflow, built by Codex. That workflow is: company data, reviewed brain, AI campaign plan, browser voice call, reviewed learning. The code treats provenance, idempotency, compare-and-set (CAS) writes and "uncertain outcome" bookkeeping very seriously. Several mechanisms are worth keeping. The product shell is not:

- One client-side hash-routed page.
- A single JSON-blob `entities` table, written with raw SQL from 44+ files.
- No migrations, no real CRM or ERP objects, no lead generation, no telephony.
- Never deployed.
- About half of all code and tests is voice research tooling.

Voice is spread over five stacks. The only one with repeated live evidence is the private Azure OpenAI Realtime WebRTC path. It has never been tested with a real microphone.

**Recommendation:** rebuild the shell, the data model and the UI. Harvest about 15 mechanisms (section 7). Delete the Gemini/Maya and OpenAI-direct paths, GroupAI, `/prototype`, the Taxila audition, and most of the evidence/proof UI.

## 1. Size: lines per area (wc)

| area | files | lines | notes |
|---|---|---|---|
| `lib/` | 172 tracked | 22,008 | voice alone is 7,717 (35%) |
| `components/` | 69 | 9,649 (tsx 7,182) | 218 lines are over 500 chars; one line is 10,820 chars (`components/company-model-workbench.tsx`) |
| `app/` (pages, css, 72 API routes) | 103 | 2,744 (ts/tsx 1,928) | `app/page.tsx` is 178 lines and is the whole workspace shell |
| `scripts/` | 26 | 2,506 | 6 long-running processes plus smokes |
| `tests/` | 145 | 20,745 | 1,107 statically counted `test(` calls; the runner reports 1,153 |
| `infrastructure/azure` | 29 | 925 | Bicep for Container Apps and App Service; never applied |
| `docs/` + `research/` | 103 + 65 | n/a | heavy doc sprawl; dated increments v1 to v7 plus oct01, oct09, oct10 |
| `context/` | 3 | 297 KB | graph.json has 235 nodes (89 evidence, 75 component, 24 decision, 7 risk) |

**Line counts understate the code.** Average line length is 113 chars in `components/` and 76 in `lib/`. `lib/` holds 1.68 M chars, which is about 40k ordinary lines. `components/` holds 0.81 M chars, about 20k ordinary lines. Much of the code is dense one-liners.

### lib/ per directory (lines, files)

voice 7717/56 · platform 2442/20 · evaluations 1389/8 · public-agent 1160/7 · integrations 1145/11 · regression 808/2 · server 704/8 · ingestion 642/7 · data-intake 499/4 · channel-agents 450/3 · business 432/3 · messaging 414/3 · campaign-results 402/3 · delivery 330/3 · usage 313/2 · learning 312/4 · deployments 310/2 · campaign-planning 303/1 · campaign-brief 275/3 · company 273/3 · automation 263/2 · brain 253/2 · auth-lifecycle 224/5 · ai 212/3 · learning-jobs 192/2 · agent-revision 170/1 · operations 164/1 · team 159/2 · client 51/1

### Tests per area (static `test(` count; files grouped by name)

| area | files | tests | test lines |
|---|---|---|---|
| voice (realtime, voice-live, continuous, audio, maya, public-voice, private-*) | 67 | 534 | 10,514 |
| data / brain / CRM (ingestion, intake, contacts, customers, business, company) | 15 | 115 | 1,924 |
| agents / release / eval / regression | 18 | 112 | 2,232 |
| campaign / delivery | 10 | 102 | 1,707 |
| core / UI / auth / navigation | 11 | 86 | 1,460 |
| ops / infra (readiness, azure, db, usage, automation) | 15 | 76 | 1,302 |
| integrations / channels (oauth, telegram, whatsapp) | 6 | 60 | 1,089 |
| learning / GroupAI | 3 | 22 | 517 |

All of these are node:test unit or contract tests with mocked transports. There are no browser end-to-end tests, no live-provider tests, and no Postgres tests in CI. `evals/` has only `scenarios.json` and a README, and the README says no live evaluation was ever run.

## 2. Module and feature inventory with verdicts

Verdict scale: **E2E** = works end to end against real providers. **Local** = works locally, bounded evidence only. **Partial**, **Stub**, **Dead**.

The recommendation (keep, refactor, rewrite, delete) is measured against the command-centre vision.

### 2.1 Workspace views

All views live in the single page `app/page.tsx`. Navigation is hash-based, defined in `lib/platform/navigation.ts`, and the page renders one section at a time. There are 19 sections in 6 areas.

| Section (area) | Component(s) | APIs | Verdict | Rec |
|---|---|---|---|---|
| Command centre (Overview) | `components/platform/command-view.tsx` (+812-line css module) | `/api/company`, `/api/workspace`, `/api/platform` | Local: shows a readiness "next action" plus a resume point for the saved campaign | **rewrite** (the real command centre needs KPIs and orchestration, not a checklist) |
| Company profile | `platform/company-view.tsx` | `/api/company` (`lib/company/*`) | Local: owner-only branding and profile | refactor (becomes tenant settings) |
| Company brain | `platform/brain-view.tsx` → `ingestion-workbench`, `brain-answer`, `company-model-workbench`, `data-intake-workbench` | `/api/ingestion*`, `/api/brain/answer`, `/api/business-context*`, `/api/data-intake`, `/api/knowledge` | Local: PDF/DOCX/CSV ingestion, exact-quote proposals, approve/apply; lexical RRF Q&A with citation revalidation, no embeddings; one live Azure discovery run | **refactor**: keep the review and provenance model, replace retrieval with pgvector or Azure AI Search |
| Customers | `platform/customers-view.tsx` (29 lines; 3.7k-char lines) | `/api/platform` customer.* actions, `/api/contacts`, `/api/contact-import` | Local: contact entity plus `customer_profile` JSON, per-channel consent, journey | **rewrite**: not a CRM (no accounts, deals, pipeline, activities, custom fields) |
| Connections (Integrations) | `platform/integrations-view.tsx` → `integration-catalog` | `/api/integrations*`, `/api/voice/check`, `/api/voice/config` | Partial: 19 adapters (check/read/signed webhook) plus encrypted vault and Google/Microsoft OAuth; no real account was ever connected; telephone is "planned" only | refactor (keep vault, OAuth and adapter registry) |
| Agent studio | `platform/agents-view.tsx` → `voice-studio`, `voice-cloning-panel`, `taxila-voice-audition`, `agent-revision`, `agent-release-panel` | `/api/platform` agent.*, `/api/agents`, `/api/agent-revisions`, `/api/voice/*` | Local: draft config, immutable versions, draft preview calls (live Azure); cloning blocked (catalog 403) | refactor; **delete** taxila-voice-audition and the cloning panel for now |
| Release checks (Test lab) | `platform/tests-view.tsx` → `regression-workbench` (362) | `/api/regression` (`lib/regression/service.ts` 597) | Local: exact-candidate text regression with human review; one live Azure pass | refactor into an eval system |
| Release history | `platform/releases-view.tsx` → `release-review` | `/api/platform` release.* | Local: publish, stop and rollback gated by evidence | keep the concept, refactor |
| Channels (Deployments) | `platform/deployments-view.tsx` (538) → `channel-agent-panel` | `/api/deployments`, `/api/channels`, `/api/learning-jobs`, `/api/public/agent/*` | Partial: immutable public web/voice agent deployments with budgets; Telegram and WhatsApp worker code exists; never hosted, no live channel round trip | refactor (becomes the omnichannel deploy layer) |
| Campaigns | `platform/campaigns-view.tsx` → `campaign-planning-assist`, `campaign-brief-assist`, `campaign-run-panel` | `/api/platform` campaign.*, `/api/campaign-plans*`, `/api/campaign-brief`, `/api/campaign-delivery`, `/api/campaign-results` | Local, closest to E2E: in a fictional workspace, AI plan → brief → consent preflight → launch → live Azure browser call → saved evidence → 4/4 result fields extracted. Email send exists but was never sent externally. Calls are operator-driven browser sessions, not dialled | **refactor heavily**: no audience builder at scale, no multichannel sequencing, no analytics or growth loop |
| Automations | `platform/automations-view.tsx` | `/api/automations` (`lib/automation/engine.ts`) | Partial: durable scheduled email worker; no external send | rewrite as general orchestration |
| Conversations | `platform/conversations-view.tsx` → `voice-studio`, `voice-runtime-evidence`, `conversation-learning`, `campaign-results`, `public-voice-evidence`, `voice-timing-evidence` | `/api/sessions`, `/api/conversation-analysis*` | Local: transcripts, AI analysis proposing memories and follow-ups | refactor (unify with the omnichannel inbox) |
| Inbox | `platform/inbox-view.tsx` | `/api/messaging`, `/api/integrations/whatsapp/webhook/*` | Partial: native WhatsApp inbox and signed webhook, offline-tested; live shows setup-required | **rewrite** as a unified omnichannel inbox |
| Follow-ups (Commitments) | `platform/commitments-view.tsx` | `/api/action-review`, `/api/actions*`, `/api/memories*` | Local: manual commitment and notification-evidence records | refactor (becomes tasks) |
| Evaluation lab (Quality) | `platform/quality-view.tsx` → `voice-evidence-lab`, `voice-audio-proof`, `voice-audio-comparison` | `/api/evaluations*` (`lib/evaluations/*` 1,389) | Local: text judgments, audio proof runs, concealed A/B ratings | slim down: keep the harness ideas, delete most UI |
| GroupAI | `platform/groups-view.tsx` | `/api/group-turns`, `/api/platform` group.* | Local internal simulation only; no delivery or identity | **delete** (not in vision) |
| Team & access | `platform/team-view.tsx` | `/api/team*` (`lib/team`) | Local: owner, operator and viewer roles; invitations | keep, refactor (RBAC) |
| Usage & services | `platform/usage-view.tsx` | `/api/usage`, `/api/ai/usage`, `/api/operations/status` | Local: AI token ledger, voice attempt admission, worker heartbeats | keep (becomes the cost and ops console) |
| Account security | `components/account-access.tsx` + `app/account/{forgot,reset,security,verify}` | `/api/account/*`, `/api/auth` | Local: scrypt auth, email verification and reset over ACS email (dev outbox locally) | keep, refactor (or use Entra External ID) |

Other pages:

| Page | Verdict |
|---|---|
| `app/talk/[publicId]/page.tsx` (public agent, via `components/public-agent-experience.tsx` and `proxy.ts` frame-ancestors CSP) | Local, with the gateway: refactor |
| `app/join/page.tsx` (invitation accept) | keep |
| `app/prototype/page.tsx` | **Dead**: historical fixture, rejected in STATE.md. Delete |
| `components/campaign-planner.tsx`, `components/company-operating-flow.tsx` | **Dead**: imported nowhere. Delete |
| `lib/integrations/testing.ts` | test-only |

### 2.2 API route groups (72 `route.ts` files; the earlier pass's figure of ~75 was approximate)

| group | routes | lines | backing lib | verdict |
|---|---|---|---|---|
| `/api/voice/*` | 11 | 395 | `lib/voice/*` | Local and partial (see section 4) |
| `/api/integrations/*` (+ telegram, whatsapp, generic webhooks, oauth) | 7 | 238 | `lib/integrations`, `lib/channel-agents`, `lib/messaging` | Partial |
| `/api/account/*`, `/api/auth` | 7 | 105 | `lib/server/auth.ts`, `lib/auth-lifecycle` | Local |
| `/api/evaluations/*` | 4 | 145 | `lib/evaluations` | Local, research tooling |
| `/api/public/agent/[publicId]/{,chat,session}` | 3 | 53 | `lib/public-agent`, `lib/deployments` | Local |
| `/api/platform` | 1 | 29 | an action-string multiplexer over agent.*, test.*, release.*, campaign.*, group.*, customer.*, brain.*, commitment.*, memory.*, action.* | Local; **rewrite** (RPC-by-string, and GET returns every platform record) |
| `/api/ingestion*`, `/api/data-intake`, `/api/contact-import`, `/api/knowledge`, `/api/business-context*`, `/api/brain/answer` | 8 | ~200 | ingestion, brain, business | Local |
| `/api/campaign-*` (plans, brief, delivery, results) | 5 | ~97 | campaign-* libs, delivery | Local |
| `/api/channels`, `/api/deployments`, `/api/messaging` | 3 | 71 | channel-agents, deployments, messaging | Partial |
| `/api/regression`, `/api/learning-jobs`, `/api/conversation-analysis*`, `/api/agent-revisions`, `/api/action-review` | 6 | ~112 | regression, learning*, agent-revision | Local |
| `/api/team*`, `/api/usage`, `/api/ai/usage`, `/api/operations/status`, `/api/health`, `/api/company`, `/api/workspace` | 8 | ~110 | team, usage, operations, company | Local |
| legacy `/api/contacts`, `/api/sessions`, `/api/agents`, `/api/memories*`, `/api/actions*` | 7 | ~30 | `lib/server/routes.ts` + `store.ts` | Legacy v1 shims; delete |

### 2.3 Long-running processes (`package.json` scripts)

| process | entry | verdict |
|---|---|---|
| Next app | `next start` (standalone, loopback) | Local |
| `voice:gateway` (port 3001) | `scripts/voice-gateway.ts` → `lib/public-agent/gateway.ts`; hosts the public Realtime relay and the continuous-speech WS | Local (live synthetic smoke) |
| `voice:live-gateway` (port 3002) | `scripts/voice-live-gateway.ts` → `lib/voice/voice-live-host.ts` | Local and partial (2 UI attempts) |
| `voice:supervisor` | `scripts/private-voice-supervisor.ts` → `lib/voice/supervisor.ts` (stops orphaned private calls) | Local |
| `automation:worker` | `scripts/automation-worker.ts` → `lib/automation/engine.ts` (email schedules) | Partial |
| `channel:worker` | `scripts/channel-worker.ts` → `lib/channel-agents/service.ts` (Telegram/WhatsApp jobs) | Partial |
| `learning:worker` | `scripts/learning-worker.ts` → `lib/learning-jobs/engine.ts` | Local, default off |
| ops: `readiness`, `db:bootstrap`, `db:snapshot`, `package:check`, `context:check` | `scripts/*` | keep the ideas |
| smokes: `azure-voice-smoke.mjs`, `azure-streaming-recognition-smoke.mjs`, `public-voice-phase-smoke.ts`, `smoke-public-audio.ts`, `continuous-speech-feature-smoke.ts`, `private-preparation-smoke.ts`, `postgres-hosted-smoke.ts` (never run), `maya-*-smoke.ts`, `select-maya-verified-key.ts` | | keep the Azure smokes; delete the Maya ones |

Seven processes for a product that has never been deployed is an operational red flag. In a rebuild these should become one API, one realtime gateway and one job runner (for example Container Apps Jobs or a queue).

## 3. Data model

### 3.1 Tables (`lib/server/db.ts`; created at boot with `CREATE TABLE IF NOT EXISTS`; no migrations)

1. `organizations(id, name, created_at)`
2. `users(id, email UNIQUE, password_hash, organization_id, created_at)`: one org per user
3. `auth_sessions(token_hash, user_id, expires_at)`
4. **`entities(id, organization_id, kind, status, data TEXT, created_at)`**: everything else. `data` is JSON in a TEXT column (not JSONB). The only index is `(organization_id, kind, created_at)`.
5. `audit_events(id, organization_id, user_id, entity_id, event, created_at)`
6. `service_heartbeats(id, service, status, updated_at)`
7. `evaluation_audio_artifacts(..., bytes BYTEA, ...)`: audio blobs stored in the DB

The store is SQLite (`node:sqlite`, WAL) by default and `pg` Pool when `DATABASE_URL` is set. Placeholders are translated with a `?` → `$n` regex. Postgres has never been exercised against a real server; the hosted smoke is unrun.

### 3.2 Entity kinds in `entities.kind` (enumerated by grep of literals; about 100)

- **Legacy v1 (unprefixed, `lib/server/store.ts`):** contact, knowledge, memory, action, session, agent
- **`platform:*` (`lib/platform/records.ts` wrapper `{revision, updatedAt, data}`):**
  - Agents and release: agent_definition, agent_version, agent_change_proposal, agent_deployment, release, release_binding, version_binding, test_run, test_epoch
  - Brain and data: brain_source, brain_answer, business_discovery, business_signal, company_profile, offering, ingestion_source, ingestion_proposal, ingestion_job, data_intake_batch, data_intake_row, data_intake_preview, data_intake_review, contact_import_receipt
  - CRM: customer_profile, commitment, feedback, conversation_analysis
  - Campaigns: campaign, campaign_plan, campaign_brief_proposal, campaign_run, automation_schedule
  - Voice: voice_preview, voice_connection, voice_tool_invocation, voice_clone
  - GroupAI: group_world, group_room, group_turn, group_memory
  - Test-only: postgres_smoke_isolation, postgres_smoke_order, postgres_smoke_rollback
- **Namespaced internal ledgers:**
  - ai: run, budget
  - auth: account, token, mail, limit, cooldown
  - team: member, invite, state
  - voice: attempt, budget, capacity, cancellations
  - channel: participant, activation, active, job, thread, gate, daily, offramp
  - integration: vault, sync_item, oauth_flow
  - messaging: whatsapp_thread, whatsapp_inbound, whatsapp_status, whatsapp_intent
  - delivery: email_intent
  - deployment: session, counter, public, issuance, event
  - public: conversation, voice
  - regression: epoch, sequence, run, review, case
  - eval: audio_run, audio_fixture, trial, speech_audition, scenario, rating, listening_review, assessment, assessment_review, audio_comparison, audio_comparison_request, audio_comparison_assignment, audio_comparison_review
  - learning: job, budget
  - campaign: result, answer_row
  - internal: brain_catalog, contact_import_catalog
  - inference: workspace

The model is effectively a document store. Counters, budgets, leases and locks are all rows in the same table, and CAS is done with `UPDATE ... WHERE data = <old json>`. There are no relational keys between business objects, and no typed columns to filter or report on. Analytics, ERP and CRM-scale queries are not possible without a redesign.

## 4. Voice: each stack traced end to end

| # | Stack | Path | Evidence (from context/ and docs/) | Status |
|---|---|---|---|---|
| A | **Private Azure OpenAI Realtime over WebRTC** | `components/voice-studio.tsx` → `lib/voice/browser-session.ts` (SDP offer) → `POST /api/voice/connect` (`app/api/voice/connect/route.ts`: auth, same origin, paid-attempt admission in `lib/usage/service.ts`) → `lib/voice/server.ts` (server key mints a short-lived Realtime client secret, POSTs the SDP, returns the answer) → browser ↔ Azure directly. Turn control: `private-turn-scheduler.ts` (exact `session.update` ACK gating before `response.create`), `client-adapters.ts`, `client-tools.ts` + `tools/*` (company search, customer context, follow-up proposals). Control and stop: `call-control.ts`, `supervisor.ts`. Saved: `/api/sessions` → `store.createSession` recomputes the relational runtime server-side. | Several real "Listen & type" calls (typed input, real Azure audio). A 107 s / 5-entry Hinglish call. Campaign E2E with 4/4 extracted fields. Exact-ACK pre-acknowledgement. **The microphone permission timed out, so microphone, STT, barge-in and perceptual quality were never verified.** Model `gpt-realtime-2.1-mini`, voice `marin`. | **The most real stack.** Refactor and keep. |
| B | **Public Azure Realtime server relay over WebSocket** | `/talk/[publicId]` → `components/public-agent-experience.tsx` + `lib/public-agent/browser.ts`, `playback.ts` → `ws` to `scripts/voice-gateway.ts` → `lib/public-agent/gateway.ts` (resolves the deployment session, claims a voice session, opens server-side Azure Realtime WS via `protocol.ts`, separate opening and continuation instructions, speech-vocabulary hints, `evidence.ts` persists metadata) | A two-turn synthetic-input live smoke. Persisted evidence. Native hint ACK. Restarting the gateway on the final bundle was "blocked by policy". Responses repeat AI introductions and preambles. | Local. Refactor; this server-relay shape is the right base for telephony later. |
| C | **Azure Voice Live (private)** | Agent `liveVoice.engine === 'azure-voice-live'` → `/api/voice/connect` issues a one-use grant (`voice-live-authority.ts`) → browser `voice-live-browser.ts` (560 lines) → `ws://…:3002/private-voice-live` → `voice-live-host.ts` / `voice-live-gateway.ts` → Azure Voice Live using `voice-live-session.ts` (configuration), `voice-live-protocol.ts`, `voice-live-prompt.ts`. Diya/Arjun hi-IN voices, delivery profile 1.0 or 0.9. | 7 configuration-only checks and 2 real UI attempts. Check 7: initial 0.9 accepted, exact ACK in **1,969 ms**. The second preview delivered a Hindi opening plus one grounded tool answer (about 90 words, repeated intro). An in-session 1.0 → 0.9 change was echoed back as 1.0 (unsupported), and the ACK timeout ended the call at about 2:11. The post-fix `9c90644` code has **no live call**. | Partial. Strategically the right Azure-native target (STT, LLM and TTS in one service, India voices). Adapt. |
| D | **Continuous speech sidecar (Azure Speech SDK STT)** | `continuous-understanding.tsx` → `pcm-capture.ts` (16 kHz PCM16 AudioWorklet with a 63-tap FIR fallback) → `continuous-speech-browser.ts` → WS on the public gateway → `continuous-speech-gateway.ts` / `-provider.ts` / `-authority.ts` (one-use origin-bound ticket, single-user lease) | One synthetic lifecycle probe (4 interim revisions and 1 final). No microphone. By design it can never become the response authority. | Local add-on. Adapt the PCM capture only. |
| E | **Maya / Gemini Live (plus the OpenAI-direct adapter)** | `voiceProfile === 'maya-despina'` → `gemini-browser.ts` (direct browser WS with a Google ephemeral token), `lib/voice/maya/*`, `config.ts` reads `MAYA_GOOGLE_KEYS` (a recovered "free pool" key list) | 4.92 s Live and 4.04 s TTS synthetic. A 92 s / 7-entry and a 107 s browser listen-and-type. | **Violates Azure-only. Delete**, including `GEMINI_*`, `MAYA_*`, `OPENAI_API_KEY` and `scripts/maya-*`. |
| F | **Azure Personal Voice cloning + TTS audition** | `voice-cloning-panel.tsx` → `/api/voice/clones*` → `lib/voice/cloning/{azure,service,audio}.ts`; `taxila-voice-audition.tsx` → `/api/voice/auditions` → `speech-audition.ts`, `taxila-speech.ts` | Catalog route returns 403 (Limited Access not approved), so no clone exists. One hi-IN-Swara TTS sample, 9.338 s. | Stub or partial. Defer cloning. Delete the Taxila audition. |

Shared voice brain:

| Module | Content | Rec |
|---|---|---|
| `relational-runtime/*`, `relationship.ts` | repair hysteresis, honorific, language, pacing | adapt as an idea |
| `emotional.ts` | literal cue inspector | adapt as an idea |
| `speech-delivery.ts`, `speech-vocabulary.ts` | delivery profiles and ASR hints | keep |
| `diagnostics.ts`, `timing-view.ts` | metadata-only timing evidence | keep |

**Verdict.** A is the most real: repeated live calls, tool use, persisted transcripts, admission and supervision. C is the strategic Azure-native target but is only half-proven. Five stacks with separate browser clients, gateways and tests account for 7.7k lib lines plus about 10.5k test lines. A rebuild should keep one browser path (C, falling back to A) and one server-relay path (B's shape, so a PSTN or ACS Call Automation leg can attach later).

## 5. Code quality red flags

1. **One JSON-blob table for everything** (`lib/server/db.ts`), with raw SQL against `entities` spread over 44+ files. The `INSERT/UPDATE/SELECT … entities` statements appear in `lib/platform/*`, `lib/voice/*`, `lib/ai/*`, `lib/integrations/*`, two webhook routes and more, so there is no repository layer. The schema cannot evolve safely, and there are no migrations (DDL is re-run at boot).
2. **CAS by full-JSON equality** (`UPDATE … WHERE data = ?` in `lib/platform/records.ts:38` and `lib/server/store.ts` approval fences). This is fragile and expensive. It also ties correctness to byte-identical JSON serialisation.
3. **`GET /api/platform` returns every `platform:%` record for the tenant**, unpaginated (`app/api/platform/route.ts:12`, `listRecords` with `LIKE 'platform:%'`). The client then joins contacts to profiles in the browser (`app/page.tsx` `load()`). This is O(all data) on every page load.
4. **RPC-by-string multiplexer.** `/api/platform` POST dispatches on an `action` string to four handlers (`lib/platform/{agents,campaigns,groups,customer-ops}.ts`). There is no typed API contract.
5. **Single client-rendered page** (`"use client"` `app/page.tsx`) with hash routing and a custom history guard (`lib/platform/history-guard.ts`). It does not use App Router routing, server components or data caching.
6. **Extreme line density.** 826 component lines exceed 200 chars and one is 10,820 chars (`components/company-model-workbench.tsx`). Others: `conversations-view.tsx` 5,321, `deployments-view.tsx` 5,222, `ingestion-workbench.tsx` 4,853. This is effectively unreviewable.
7. **Brain retrieval loads every approved source per question** (`lib/brain/retrieval.ts` `loadApprovedCompanySources`) and ranks in memory with lexical RRF. There are no embeddings and it will not scale.
8. **Non-Azure providers still wired in:**
   - Gemini and Maya free-pool keys (`lib/voice/config.ts:25`, `gemini-browser.ts`).
   - OpenAI direct (`OPENAI_API_KEY`).
   - Campaign email goes through Gmail or Microsoft Graph OAuth (`lib/delivery/providers.ts`), not ACS. ACS is used only for auth mail (`lib/auth-lifecycle/delivery.ts`).
9. **Five voice stacks** (section 4) and seven long-running processes. Voice is about 35% of lib and about 50% of tests, for a product whose vision is much broader.
10. **Research and evidence UI shipped as product:** `voice-audio-proof`, `voice-audio-comparison`, `voice-evidence-lab`, `taxila-voice-audition`, `public-voice-evidence`, `voice-timing-evidence`, `voice-runtime-evidence`. Together that is about 1.2k component lines plus `lib/evaluations` (1.4k).
11. **Dead code:** `app/prototype/page.tsx`, `components/campaign-planner.tsx`, `components/company-operating-flow.tsx`, and the legacy v1 routes in `lib/server/routes.ts`.
12. **One org per user** (`users.organization_id`). Multi-company or agency use is impossible without schema change.
13. **Audio blobs in the DB** (`evaluation_audio_artifacts.bytes BYTEA`) instead of Blob Storage.
14. **Tests are contract-only** (mocked fetch, WS and mic). There are no e2e or Playwright tests. Postgres is never tested. The claim "1153 pass" says little about runtime behaviour.
15. **Doc and context sprawl:** 103 docs plus 65 research files, and a 60 KB `STATE.md` written in hedge-heavy prose ("bounded", "no claim"). Useful as provenance, but hard to act on.
16. **Never deployed.** Bicep exists (`infrastructure/azure/main.bicep`, Container Apps; `appservice/main.bicep`, 25 resources). East US 2 rejected PostgreSQL, West US 3 was reviewed, and nothing is provisioned.
17. **Good counter-signals:** strict input validation, same-origin checks, scrypt hashing, an encrypted connector vault, durable idempotent AI runs, explicit uncertain states for external effects, and tenant scoping on every query.

## 6. Context-derived measured lessons and rejections

**Measured (with source):**

| Lesson | Source |
|---|---|
| Voice Live initial speed 0.9 accepted, exact ACK in 1,969 ms. In-session 1.0 → 0.9 was echoed as 1.0, so in-session rate change is not established. An omitted prompt versus Azure `null` crashed startup until fixed. | STATE.md Oct 10 |
| Voice Live second preview: one grounded tool answer, but repeated introductions and about 90-word turns. The ACK timed out and ended the call at 133,408 ms after 4 updates, 4 ACKs and 3 exact matches. | STATE.md |
| Azure text task routing: 12 requests, 12,485 tokens (6,996 in, 5,489 out); gpt-4.1-mini fallback. | `docs/foundry-routing.md`, STATE.md |
| A Realtime browser call ran 107 s over 5 entries in Hinglish. Microphone permission timed out, so the mic path was never verified. | STATE.md, `docs/calling-workbench.md` |
| Gemini Live synthetic: 236,162 PCM bytes over 4.92 s. TTS 4.04 s. | STATE.md |
| Azure Speech hi-IN-Swara teacher sample: 2 paid attempts; the first produced an invalid WAV; the retry was 9.338 s. | graph `evidence.hinglish-teacher-sample-2026-10-10` |
| Campaign E2E: 4/4 result fields extracted from a live call in a fictional workspace. | graph `verification.campaign-results-e2e-2026-10-02` |
| Test suite grew 196 → 313 → 526 → 731 → 804 → 900 → 983 → 1,054 → 1,153, all unit-level. | graph and STATE |
| Personal Voice: project route reachable, catalog 403. | `docs/azure-speech-setup-status.md` |
| Signed webhook: valid 202, duplicate 200 with `accepted:false`, bad signature 401. | STATE.md |

**Rejected or failed:**

| What was tried | What happened |
|---|---|
| The `/prototype` sample-data concept | superseded by implementation |
| The whole-product UX | rejected by the owner on 2026-10-01; a structural reset followed |
| Noncommercial voice weights (CtrlSpeech, Kyutai RL) | rejected for deployment |
| Tavus/Griffin provider migration | outside the Azure-only boundary |
| East US 2 for PostgreSQL | region rejected; West US 3 is the candidate |
| Local Docker on the laptop | disallowed |
| Restarting the public gateway | blocked by policy |
| The Codex baseline as a whole | judged by the owner to be basic, stale and messy (2026-10-15) |

## 7. Worth keeping (harvest list)

See the structured `techAssets`. In short:

- AI task router with an idempotent, durable run ledger and budget (`lib/ai`, `lib/usage`)
- Private Realtime WebRTC minting, the ACK scheduler and call supervision
- The Voice Live gateway and protocol
- The public server-relay gateway
- PCM AudioWorklet capture
- Speech-delivery and vocabulary hints
- Relational runtime (as an idea)
- Exact-quote ingestion and review; intake mapping
- Grounded answers with citation revalidation
- Encrypted vault, OAuth and the adapter registry
- Durable email intents with uncertain states, plus ACS auth mail
- WhatsApp and Telegram channel workers
- Agent version, release and rollback authority
- Text regression and eval harness
- Auth, team and roles
- Container Apps and App Service Bicep
- Readiness and package checks

## 8. Risks for the rebuild

See the structured `risks`.
