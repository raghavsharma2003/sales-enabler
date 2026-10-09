<!-- Current calling workbench: see docs/calling-workbench.md for setup and verification. -->
# Sales Enabler / Relay

**Employer laptop:** no local Docker. Use the Node preview and [Azure-side deployment](docs/azure-no-local-docker-options.md). Follow [Azure access setup](docs/azure-access-setup.md) to provide a separate deployment service principal without sharing secrets in chat.

## Current v7 checkpoint — 27 September 2026

The product target is a sellable general Indian-organization AI application layer: company branding and accountable authentication, reviewed CSV customer-tables intake, source-backed relational learning, and bounded web voice/chat plus Telegram and WhatsApp deployment. Company, Deployments and Account navigation is mounted. AutoLearning is present but defaults off for hosted operation; anonymous public/unverified channel calls are restricted to feedback-only proposals, while linked private customer calls retain reviewed memory/action paths. No historic backfill is authorized. Public branding is browser-verified.

The current local verification record reports **526/526 tests passing**, a clean packaged production build with postbuild package check and no private database copy, separate typecheck, all six runtime bundles compiling, packaged-server readiness HTTP 200, and automation/learning heartbeat checks. Local SQLite online backup/restore to new private directories was verified. Independent interruption review closed 9/9 own tests and 35/35 focused checks. The scoped visual reviewer marked the 18-recapture fix packet ship, and a refreshed Listen & type call closed the truncate implementation/browser-execution gate. Real microphone/barge-in/device/perceptual voice evaluation remain open. Local preview permits SQLite and disables email verification; hosted defaults are PostgreSQL and email verification enabled. No host deployment occurred. See [v7 verification](docs/platform-v7-verification.md).

Azure is the only approved paid inference provider and only new public route. Keep external provider setup, public hosting, final domain, live Telegram/WhatsApp delivery and final verification explicitly gated. See [v7 project handoff](docs/project-handoff-v7.md) and [implementation status](docs/implementation-status.md).

## Active v5/v6 handoff — 22 September 2026

The current implementation is extending the browser-first company workspace from source intake and reviewed Brain records into explicit offerings/signals, identity and campaign-column review, offering-aware intent, relational voice, pause/stop/failure control, product/customer analytics and reviewed learning. Plain-English agent changes produce an allowlisted proposal and draft revision; they do not fine-tune model weights. Study abroad is the first buyer configuration, Android browser is the mobile target, and Company Brain/GroupAI remain existing shared context. v5 also contains bounded in-call tools with reviewed proposals, team roles/invites, a native WhatsApp inbox and durable email worker code.

The historical v5/v6 record is 313/313 integrated tests passing, production build and standalone typecheck passing, scoped visual review passing, and nine adversarial race regressions passing after eight reviewed defects were corrected. The current v7 record is in [platform v7 verification](docs/platform-v7-verification.md); see [v6 verification](docs/platform-v6-verification.md) and [v6 project handoff](docs/project-handoff-v6.md) for the older bounded evidence and open production gates.

A browser-first company operations workspace, with relational voice as its main development focus. Relay is a provisional working name. The application and research live together so product decisions remain traceable.

**Implementation resumed on 22 September 2026.** The application at `/` now has a persisted Build → Test → Release → Operate workflow. It includes company onboarding, bounded unstructured-source ingestion and review, canonical company-brain Q&A, AI sales/feedback plans, a sectioned agent builder, immutable versions, configuration/authority checks, guarded browser releases, customer records and consent, campaign run queues, GroupAI context inspection, conversations, reviewed learning and owned commitments. The Integrations workbench exposes 19 bounded adapters, including Telegram; telephone remains deferred. See [implementation status](docs/implementation-status.md) for exact coverage and verification.

The [voice-platform blueprint](docs/voice-platform-blueprint.md) remains the complete product direction, informed by the v4 [company operating flow](docs/product-operating-flow-v4.md), the refreshed [competitive workflow research](research/2026-09-22/brain-omnichannel-product-depth-v4.md), and the [source-port ledgers](research/2026-09-22/command-group-port-ledger-v4.json). The old `/prototype` is rejected historical sample code, not the current product.

## Run locally

Requires Node.js 24 (the local adapter uses `node:sqlite`).

```sh
npm install
npm run dev
```

Open http://localhost:3000 and create a local workspace. Company and agent records persist in `data/workspace.sqlite`. No AI credentials are needed to create sources, customers, agents, test configuration, manage GroupAI or operate manual workflows. Existing saved platform, company, CRM, campaign, manual-commitment and GroupAI workflows remain usable; released versions are immutable.

A useful first path is the connected local loop: Company brief → upload/paste a messy TXT, CSV, PDF or DOCX source → review exact quoted suggestions → apply approved brain facts → ask a cited brain question → generate and review a sales or feedback plan → apply its voice brief → configure/capture/check/publish the representative → preflight and queue one sample → open the campaign-bound browser studio → record an internal outcome → review learning cards and convert an approved follow-up into a commitment. Create a Customer and record channel consent before a customer campaign. Browser calls require provider setup; campaign queues and recorded manual outcomes never imply automatic dispatch.

Copy `.env.example` to `.env.local` when configuring services. The verified paid route selects Azure OpenAI Realtime with the existing Azure resource, `gpt-realtime-2.1-mini` deployment and `marin` voice. The explicit `maya-despina` Gemini profile has separate bounded synthetic and Listen & type evidence, but is not a paid fallback. Text tasks use metered, idempotent Azure routing and currently fall back to `gpt-4.1-mini` after two candidate role probes returned 404. Keep credentials in the ignored `.env.local`; no secret values belong in this guide.

Connector setup uses the private server environment variables `APP_URL`, `CONNECTOR_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and optional `MICROSOFT_TENANT_ID`. Register the callback described in [OAuth setup](docs/oauth-setup.md), and use [integration setup](docs/integration-setup.md) for the bounded adapter catalog. Client IDs, client secrets and tokens are required for real Google/Microsoft accounts and must remain in the private environment; none are recorded here. SQLite is the verified local database and the production database/host choice remains open.

`DATABASE_URL` selects PostgreSQL (including a suitable Neon connection); otherwise local SQLite is used. Set `APP_URL` to the canonical HTTPS origin for a hosted environment. Production deployment requires the release gates below.

## Engineering checks and continuity

```sh
npm run typecheck
npm test
npm run build
npm run context:check
```

Start future work with [current context](context/STATE.md), the [context graph](context/graph.json), and [system flow](docs/system-flow.md). The event log preserves decision history without customer data or secrets. [Voice scenarios](evals/scenarios.json) are a benchmark corpus, not passed test results.

## Release boundaries

This is a bounded local implementation, not a production-certified or deployed SaaS. The v4 196-test record is historical. Browser voice requires a configured provider and live evaluation; the verified Maya sessions used Listen & type and do not establish microphone/device quality or better audio. The studio is for authenticated operators; real external account activation/sync/send, automated person-wise/A-B experiments, typed result extraction, universal ERP/LMS mapping, public caller identity, phone/live cloned voices, production PostgreSQL/hosting, retention/recovery, billing and deployment remain release work. Telephone integration is deliberately deferred. Follow-through tasks do not send external messages or book appointments. See [implementation status](docs/implementation-status.md), [v6 verification](docs/platform-v6-verification.md), [v5 execution review](docs/v5-execution-review.md), [operating-flow verification](docs/operating-flow-verification-v4.md), [calling workbench](docs/calling-workbench.md), and [voice evidence lab](docs/voice-evidence-lab.md) for current boundaries.

Start with [Product direction](PRODUCT-DIRECTION.md): a general company/customer operations platform, configured first for an Indian study-abroad consultancy.

## Reading guide

| Document | Purpose |
| --- | --- |
| [Product direction](PRODUCT-DIRECTION.md) | Proposed features, customer journey, core/configuration boundary, value, scope and validation |
| [October 9 research synthesis](research/2026-10-09/README.md) | Current product, launch, data and voice research with explicit adoption and evidence boundaries |
| [Duplex and launch verification](docs/duplex-and-launch-verification-oct09.md) | Provisional release-authority and private pre-ACK verification boundary |
| [Research method](research/research-method.md) | Founder brief, updated customer context and evidence limitations |
| [Branch manifest](research/branch-inventory.json) | All 55 named source branches with pinned commits and tree/path metadata |
| [Reuse provenance](docs/reuse-provenance.md) | Current selective Maya, RelationalOS, GroupAI, ingestion, learning and delivery reuse map |
| [Command/GroupAI v4 port ledger](research/2026-09-22/command-group-port-ledger-v4.json) | Primary source-path, branch and authored-test provenance for the refreshed Command Centre/GroupAI audit |
| [HTML v4 port ledger](research/2026-09-22/html-port-ledger-v4.json) | Primary source-path provenance for the refreshed html-portfolio audit |
| [Market evidence](research/market-evidence.md) | Primary competitor capabilities, pricing caveats and study-abroad alternatives |
| [Product options](research/product-options.md) | Industry value map, economics, falsification and possible future markets |
| [Voice and future research](research/voice-and-future-research.md) | Natural interaction, evaluation and future scenarios |
| [Voice competition and implementation](research/voice-competition-implementation.md) | Vapi, Bolna, speech frameworks and company-brain execution patterns |
| [Architecture and reuse](research/architecture-reuse.md) | Code-inspected reusable assets and material gaps |
| [CommandCentre audit](research/command-centre-audit.md) | Branch inventory and operational code assessment |
| [Voice/RelationalOS audit](research/voice-relational-audit.md) | Branch inventory and voice, memory, cloning and research assessment |
| [Voice branch supplement](research/voice-branch-supplement.md) | Additional Claude/Codex branch delta inspection |
| [Vyakti audit](research/vyakti-audit.md) | GroupAI branches and relational execution foundations |
| [CommandCentre second pass](research/command-centre-product-second-pass.md) | Detailed main-tree product flow supplement to the all-branch audit |
| [Product flow benchmarks](research/product-flow-benchmarks.md) | Competitor onboarding, campaign, feedback and analytics workflows |
| [Company operating flow v4](docs/product-operating-flow-v4.md) | Canonical company → brain → campaign → learning workflow and review boundaries |
| [Ingestion source port](docs/ingestion-source-port.md) | PDF/DOCX/CSV/text ingestion, exact quotes and atomic apply |
| [Brain recall source port](docs/brain-recall-source-port.md) | RRF-grounded Q&A and citation/replay authority |
| [Learning source port](docs/learning-source-port.md) | Audited conversation learning, memory and follow-up review |
| [Integration setup](docs/integration-setup.md) | Available adapter catalog, bounded checks/pulls and inbound events |
| [OAuth setup](docs/oauth-setup.md) | Google/Microsoft app setup, refresh and scoped authorization |
| [Campaign delivery port](docs/campaign-delivery-port.md) | Explicit per-recipient email state and uncertainty handling |
| [Voice evidence lab](docs/voice-evidence-lab.md) | Text judgments, human ratings and comparison limits |
| [Name and domain checks](research/name-domain-shortlist.md) | Dated registrar availability and preliminary name collisions; no purchases |

## Status

Research snapshot: updated 22 September 2026. Source repositories are read-only evidence; they have not been wholesale merged. Static review and repository-reported measurements are not runtime verification. The local fictional-workspace verification covers the connected operating loop, not external account activation, human listening quality or competitor superiority. Proposed competitive advantages and willingness to pay require customer validation.

The broad vision is preserved. The first configuration supplies a concrete way to establish whether it creates value.
