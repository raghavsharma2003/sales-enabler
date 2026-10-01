# Project handoff v7

**Current override — 1 October 2026:** start with `context/STATE.md`, `docs/voice-conversation-phase-verification.md` and the current-request section of `docs/azure-access-setup.md`. This document retains the earlier v7 inventory. The later 88-check voice/playback checkpoint and Foundry agent setup supersede older unverified-provider statements below. Docker/Compose examples are historical or for another host: the employer laptop must use Node locally, with any image builds performed in Azure. The new Foundry child project stays in the existing subscription/account and does not require a new resource group.

**Date:** 27 September 2026 (Asia/Kolkata)  
**State:** v7 bounded local verification is complete at 526/526 with a clean packaged build and scoped visual ship disposition; real microphone/barge-in/device/perceptual voice evaluation, signed-in Azure inspection and live deployment remain open.

This is the current startup contract for the next agent. It supersedes the v6 handoff for product scope and v7 implementation inventory while retaining v6 verification as historical bounded evidence. No Azure deployment, public hostname, external account connection, customer delivery or production release is claimed by this document.

## Product contract

The target is a sellable, general Indian-organization AI application layer with thoughtful review-first UX. A company should be able to configure its identity and brand, authenticate its team, ingest a manual dump or connected organizational data, map uncertain rows to canonical people and offerings with review, publish a bounded public or private agent, run web/voice/Telegram/WhatsApp interactions, and learn from source-backed reviewed outcomes. The UX should make uncertainty, provenance, consent, limits, pause/stop, handoff and provider-uncertain outcomes legible at the point of action. Relational and emotional behavior are bounded delivery and memory controls derived from explicit evidence; they do not prove inner emotion, human identity or universal language understanding.

The public agent always discloses that it is AI. Public visitors remain anonymous and unverified, and a supplied name, phone or email does not grant customer identity. A channel account is a provider identity, not a verified human. The system must not impersonate a person or claim competitor superiority without comparable evidence. “Exact human” remains a quality ambition only.

The first accessible buyer configuration is an Indian study-abroad consultancy, while the schema and workflows remain general. Company branding and authentication are configuration layers, not proof that a final brand, custom domain, mailbox or SSO is configured. “Dall-E/Dalio” from the latest dictated feedback is unresolved; plausible customer-research candidates remain in `research/2026-09-27/feedback-product-cases.md` until the user provides a URL or logo.

## v7 implementation inventory

The following contracts and surfaces are implemented in the local tree and have scoped authored tests or documentation. Root reports **526/526 integrated tests passing**, a clean packaged Next production build with postbuild package check and no private database copy, a separate typecheck, all six runtime bundles compiling, packaged-server readiness HTTP 200, and automation/learning heartbeat checks. Company, Deployments and Account navigation is mounted, CSV customer-tables mode is mounted, and AutoLearning jobs/hooks/UI/worker are present but default off for hosted operation. Anonymous public/unverified channel calls are restricted to feedback-only proposals, while linked private customer calls retain reviewed memory/action paths; no historic backfill is authorized. Public branding is browser-verified. Independent interruption review closed 9/9 own tests and 35/35 focused checks. The scoped visual reviewer disposition is ship after the mobile badge fix and 18 valid recaptures. The truncate implementation/browser-execution gate is closed by the offline proof and refreshed browser call; real microphone/barge-in/device/perceptual voice evaluation remains open.

| Area | Local state | Boundary |
|---|---|---|
| Company settings and branding | Owner-fenced company profile, display brand, optional website, bounded raster logo and explicit Company Brain draft action | No public profile endpoint; a deployment exposes only an explicit brand snapshot; final domain/TLS is open |
| Account lifecycle | Password reset, email verification, session revocation and Azure Communication Services email adapter with local outbox option | No live mailbox delivery, Entra SSO or hosted PostgreSQL concurrency proof |
| Data intake | Bounded CSV/JSON row mapping with identity candidates, ambiguity, consent and field-level review/audit; customer-tables mode mounted | No universal ERP/LMS mapping or automatic canonical identity/purchase inference |
| Public deployment | Immutable tested release snapshot, selected approved sources, explicit publication acknowledgement, anonymous web voice/chat and hard usage budgets | No live public host, WSS gateway, Azure provider smoke call or public domain |
| Private channel agents | Telegram and WhatsApp deployment authority, webhook/replay/stop/handoff controls and durable worker jobs | No real bot, Meta number, provider webhook installation or external recipient delivery |
| Campaign results | Typed result columns, evidence-backed row review and CSV export | Population from live conversations and measured business outcomes remain open |
| Packaging/readiness | Docker Compose web/worker/gateway shapes, Bicep preparation, readiness and SQLite snapshot/restore artifacts | Azure CLI was absent from PATH during preparation; Docker engine was initially unavailable; no apply or deploy was performed |
| Relational learning | Source and channel provenance, explicit language/address/repair/pacing cues, reviewed memory and correction boundaries; AutoLearning is opt-in and feedback-only | Does not establish emotion, human identity or automatic truth from model output; no historic backfill |

See `docs/deployment-workflow-v7.md`, `docs/agent-deployments-v7.md`, `docs/public-agents-v7.md`, `docs/channel-agents-v7.md`, `docs/data-intake-v7.md`, `docs/campaign-results-v7.md`, `docs/company-settings-v7.md`, `docs/account-access-v7.md` and `docs/deployment-v7.md` for the detailed contracts.

## Provider, hosting and credential gates

Azure is the only approved paid inference provider and the only new public inference route. The existing Maya/Gemini path is an explicitly selected bounded evaluation profile; it is not an automatic fallback and is not eligible for public deployment. Sarvam, Cartesia, Deepgram, Fish, LiveKit Cloud and other alternatives are research references only until a new budget and provider decision are recorded. No paid-provider superiority or latency claim is established.

The Sep 27 voice research requires the root agent to inspect the signed-in Azure/Foundry resource before choosing Voice Live or a half-cascade. Catalog documentation is not evidence that the workspace can deploy a model. Record only redacted readiness facts: model/deployment identifier class, region, API version, voice, VAD mode, grant applicability and usage receipt. Never copy keys, endpoint values, resource IDs, account IDs or customer data into context.

The following gates are still open:

1. Azure management access and a usable subscription/resource group, existing Container Apps environment, registry, identity, Key Vault and managed PostgreSQL path.
2. A final HTTPS application origin and public WSS gateway origin, with exact allowed origins and framing policy.
3. Production database choice. SQLite is the verified local store and is suitable only for single-host local use; PostgreSQL exists but has not been exercised by this pass.
4. OAuth application configuration for real Google/Microsoft accounts, Meta/WhatsApp authorization, Telegram bot ownership/webhook, and Azure Communication Services sender/mailbox setup.
5. Backup/restore, retention/export/deletion, observability, rate/abuse controls, billing/grant verification and provider failure monitoring.

The deployment preparation artifact is intentionally non-destructive: `infrastructure/azure/main.bicep` consumes existing resources and does not create an AI account, database, Container Apps environment, registry, Key Vault or role assignment. The checked-in script currently supports inspection/what-if preparation; it is not an apply command.

## Research and source boundary

The Sep 27 customer-feedback memo compares first-party workflows from Listen, Outset, Dialogue and adjacent research products, and gives a fictional Pune service-company fixture. It supports guide preview, explicit AI disclosure/consent, respondent and offering mapping, denominator visibility, contradiction/no-answer states and decision-to-outcome traceability. It is static desk research, not an account trial or customer result.

The Sep 27 voice-frontier memo separates native realtime audio from a streaming cascade and recommends measuring first audio, endpointing, barge-in, entity accuracy, task correctness and usage on a fixed Indian/telephony corpus. It identifies Azure Voice Live/native realtime, Azure half-cascade and licensed local endpointing as possible implementation choices inside the existing provider-neutral stack. It does not authorize a new provider or establish quality.

The Sep 27 source delta refresh fetched the three audited source clones read-only. It found **55 current named heads, zero new heads and zero moved existing heads** since the 21 September inventory. Existing source contracts suggest exact public route allowlists, redacted readiness receipts, per-channel provenance, whole-block compaction manifests, typed review/audit decisions and an Azure WebSocket endpointing harness. They are adoption guidance, not newly discovered commits, tests or production evidence. Do not wholesale merge source repositories.

## Verification status

The v6 bounded local record remains **313/313 integrated tests with zero failures**, production build and standalone typecheck pass, nine adversarial regressions, and a scoped desktop/390px visual review. Those facts are historical v6 evidence and do not verify the v7 surfaces as a complete integrated system.

For v7, root reports **526/526 tests passing**, a clean packaged production build and postbuild package check with no private database copy, a separate typecheck, all six runtime bundles compiling, packaged-server readiness HTTP 200, automation/learning heartbeat checks, and local SQLite online backup/restore to new private directories. Multiple Azure Listen & type calls spoke/responded in English and Hinglish; one early provider error and two older clipped replies remain bounded failures. A corrected synthetic speech smoke passed its bounded frame/transcript/turn checks, and the independent interruption review closed 9/9 own tests and 35/35 focused checks. The rebuilt artifact then completed an opening plus one user reply in a short Listen & type call and ended explicitly with no frontend console warnings/errors. The implementation/browser-execution gate for truncate is closed. Public metadata returned expected current/paused local route outcomes, and the scoped visual reviewer marked the fix packet ship after 18 recaptures. Real microphone/barge-in/device/perceptual evaluation, hosted deployment and external delivery remain open. See `docs/platform-v7-verification.md`.

## Contractor command index

Run from the repository root after the root agent confirms private environment and database choice. These commands are a draft index; commands that mutate cloud resources, install webhooks, start workers or send mail/messages require an explicit reviewed deployment step.

```powershell
# Context integrity (required after this handoff is edited)
npm run context:check

# Local packaging/readiness inspection
node --env-file-if-exists=.env.local --import tsx scripts/readiness.ts --config-only
node --env-file-if-exists=.env.local --import tsx scripts/readiness.ts
docker compose --env-file .env.container.local config --quiet

# New service entry points (keep workers off unless explicitly testing)
npm run voice:gateway
npm run channel:worker
npm run learning:worker
npm run readiness
npm run db:bootstrap
npm run db:snapshot
npm run package:check

# Local app checks, only when root begins integrated verification
npm test
npm run typecheck
npm run build

# Optional local service checks after reviewing the database and environment
node --env-file-if-exists=.env.local --import tsx scripts/bootstrap-db.ts
node --env-file-if-exists=.env.local --import tsx scripts/readiness.ts --worker
node --env-file-if-exists=.env.local --import tsx scripts/channel-worker.ts --once
```

Do not print full environment files or expanded Compose configuration. Do not put secrets on command lines. Keep worker, gateway, provider webhook activation and outbound email disabled until their authority, target, recipient and recovery behavior are reviewed. Hosted AutoLearning is off by default; a local synthetic-only check may explicitly set `LEARNING_WORKER_ENABLED=1`, with no historic backfill.

## Continuity rules

- Start with `context/STATE.md`, `context/graph.json`, this handoff and `PRODUCT.md`.
- Append dated JSONL entries to `context/events.jsonl`; preserve prior entries.
- Keep facts, hypotheses and authored test intent distinct from live evidence.
- Keep credentials, resource IDs, customer transcripts, names, emails, phone numbers and raw provider payloads out of context and handoff files.
- Maintain provider-neutral adapters and the Azure-only paid/public decision.
- Preserve source provenance, tenant scope, consent, authorization, idempotency and uncertain-outcome states through every external boundary.
- Never claim company authentication, final branding, custom-domain hosting, human identity, live channel delivery, production readiness, better audio or competitor superiority without direct evidence.
- `npm run context:check` is a context-integrity check, not a product verification gate.
