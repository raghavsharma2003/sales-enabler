# Project handoff v6

**Date:** 22 September 2026 (Asia/Kolkata)  
**State:** bounded local implementation verified; production and broader runtime gates remain open.

This handoff is the startup record for the current v5/v6 work. The integrated suite is 313/313 with zero failures, the production build passed with TypeScript included, nine adversarial regressions pass after eight reviewed defects were corrected, and the scoped independent visual review passed. It still does not claim whole-platform production completion, physical Android evaluation, better audio, real external channels or competitor superiority.

## Product contract

The general company workspace accepts connected organizational sources or a manual dump, structures them with visible uncertainty, reviews identity and result columns, and requires an explicit product/service, outcome and evidence-based audience before work starts. The relational voice is personalized and emotionally responsive while disclosing that it is AI. Pause, stop, failure and uncertain outcomes remain operator-controlled. Product and customer analytics feed source-backed reviewed learning, plain-English agent revision, person-wise comparison and future A/B testing. Study abroad is the first buyer configuration. Android browser is the current mobile target; native Android is outside this slice. Company Brain and GroupAI are existing shared-context mechanisms. “Exact human” is a quality ambition only: there is no AI identity deception and no unsupported superiority claim.

## Startup and current ports

From the repository root:

```text
npm install
npm run dev
```

The local app uses `http://127.0.0.1:3000` by default (the README also documents `http://localhost:3000`). `APP_URL` must match the origin used for OAuth callbacks. The main workspace is `/`; `/prototype` is rejected historical fixture code. Useful API seams include `/api/business-context`, `/api/agent-revisions`, `/api/voice/tools`, `/api/integrations/*`, `/api/automations` and existing platform/campaign routes. The scheduled worker entry point is `npm run automation:worker`; the local worker ran with zero enabled schedules and a ready global heartbeat, while hosted worker liveness is not verified.

## Database and persistence

SQLite at `data/workspace.sqlite` is the verified local store. PostgreSQL support exists behind `DATABASE_URL` but has not been exercised in this pass. Source, offering, signal, intent, agent proposal, consent, run, receipt and review records are tenant-scoped and persisted locally. Context files contain no raw transcripts, customer names, personal data, resource identifiers or secret values.

## Current stage flow

1. **Bring material:** connector-backed source, bounded upload or pasted/manual dump.
2. **Understand:** AI discovery proposes offerings/signals/questions with exact source anchors and uncertainty; the operator reviews identity, conflicts and omissions.
3. **Clarify:** a founder answer is retained as attributed reviewed brain evidence; unknown remains unknown.
4. **Choose:** approve a product/service, outcome, signal basis, audience rationale and typed result columns.
5. **Prepare:** generate the existing campaign plan and voice brief; plain-English agent requests become an allowlisted before/after draft proposal.
6. **Test:** inspect the exact agent/context/person scenario; draft previews never become campaign outcomes.
7. **Launch/supervise:** preflight and run snapshots recheck source, consent, release, offering and membership authority. Browser work is an operator queue; email/WhatsApp workers preserve accepted/rejected/uncertain states.
8. **Learn:** attach results to the offering, campaign, customer and historical agent version; review memory, signal, follow-up and agent-change proposals before applying/releasing.

## Implementation ledger

| Area | Current state | Evidence / limitation |
|---|---|---|
| Company Brain and ingestion | Implemented local bounded parsers, exact quote review and atomic apply | `docs/ingestion-source-port.md`; no whole-dump completeness claim |
| Offerings/signals/clarifications | Bounded local flow verified | `docs/platform-v6-verification.md`; no universal ERP/LMS reconciliation or inferred identity |
| Campaign intent and columns | Offering-aware plan/run verified with three planned fields | `docs/platform-v6-verification.md`; fields are schema until result extraction is implemented |
| Agent revision | Plain-English allowlisted proposal, original invalid guard rechecked, apply-once draft revision | `docs/agent-revision-v6.md`; does not fine-tune weights or publish automatically |
| In-call tools | Real Maya Listen & type call used all three installed actions; seven entries and three server receipts | `docs/platform-v6-verification.md`; two available, one pending review; no external action |
| Team access | Owner/operator/viewer roles, invitations, join mismatch rejection and revoke | `docs/platform-v6-verification.md`; external teammate not used |
| WhatsApp | Native inbox, signed webhook and operator reply code | `docs/whatsapp-inbox-v5.md`; no real Meta account/delivery proof |
| Email scheduling | Durable schedule/worker and per-recipient uncertain outcomes | `docs/platform-v6-verification.md`; no real email dispatched, hosted worker unverified |
| Relational voice | Azure paid route plus explicit Maya profile and server-saved bounded relational state | `docs/voice-runtime-v5.md`; microphone/device/human listening quality unverified |
| Learning and follow-through | Source-backed reviewed memory, feedback and commitments | `docs/learning-source-port.md`; no automatic outbound completion |

## Bounded verification facts

`docs/platform-v6-verification.md` is authoritative for the current local proof. Azure discovery produced two draft offerings, one signal and eight questions; optional action-array normalization was preserved and replayed from the cached receipt without another inference. One fictional founder answer became an approved source, supported an approved offering and linked signal, and fed an offering-scoped plan/run that paused, resumed and completed one browser conversation. A Maya draft natural-language revision preserved protected fields after the original invalid guard was corrected and rechecked; a separate real Gemini Despina Listen & type call used source lookup, customer-context recall and follow-up proposal across seven entries, with two available results and one pending review. A product campaign ran for about 140 seconds across five entries with exact binding and internal QA.

Azure analysis produced three cards; operator review corrected a negated follow-up and retained feedback without creating actions, memory or consent. Offering insights linked one plan, campaign, run, recipient slot and three reviewed quotes. A separate AI brief used one Azure request, corrected a false-positive claim guard, replayed its completed receipt and populated editable fields without creating a plan or campaign. The text ledger is twelve completed requests totaling 12,485 tokens (6,996 input and 5,489 output), excluding voice and with rates unknown. Team invitation mismatch/revoke, successful offline join coverage, and an empty-schedule worker heartbeat were verified locally. No external account, email, Meta conversation, telephone, cloned voice, physical Android device or live A/B traffic was used.

The scoped independent visual review covered desktop 1280px and mobile 390px states for company/evidence, plan/run, agent revision/actions, conversation learning, team/join, inbox/setup and automations. Four bounded corrections were recaptured; document width was 375px within the 390px viewport, there was no horizontal overflow, and the latest browser console error list was empty. This is responsive browser evidence, not physical Android evaluation or a whole-product production ship verdict.

## Research ledger

The v6 research set is public first-party static research and selective source audit, not competitor runtime evidence:

- `research/2026-09-22/company-data-workflow-cases-v6.md` — messy sources, identity, permissions/currentness and reviewable data workflows.
- `research/2026-09-22/campaign-case-studies-v6.md` — Vapi, ElevenLabs, Bolna and Retell campaign controls, outcomes, retry/stop and experiments.
- `research/2026-09-22/product-signal-reuse-v6.md` — reviewed source mapping, intent compilation, evidence separation and agent evolution mechanisms.
- `docs/product-operating-model-v6.md` and `docs/use-case-coverage-v6.md` — implementation contract and acceptance evidence.

Earlier v4 ledgers remain provenance for selective reuse. Source repositories are read-only; no source runtime or customer data was imported.

## Credentials and private configuration names

Only variable names belong in this handoff. Values remain in ignored local environment configuration:

`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_REALTIME_DEPLOYMENT`, `AZURE_OPENAI_TEXT_DEPLOYMENT`, `AZURE_OPENAI_FAST_DEPLOYMENT`, `AZURE_OPENAI_REASONING_DEPLOYMENT`, `AZURE_OPENAI_EVALUATION_DEPLOYMENT`, `AZURE_OPENAI_REALTIME_VOICE`, `MAYA_GOOGLE_KEYS`, `MAYA_GOOGLE_ACTIVE_LABELS`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `AZURE_PERSONAL_VOICE_PROJECT_ID`, `AZURE_PERSONAL_VOICE_BASE_VOICE`, `DATABASE_URL`, `APP_URL`, `CONNECTOR_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` and provider-specific WhatsApp configuration names documented in `docs/whatsapp-inbox-v5.md`.

Paid inference is restricted to the user's existing Azure Founders Hub resource. The explicit Maya/Gemini path is a separately selected, privately recovered free-pool validation path and is not default routing. No new paid resource, OpenRouter route or automatic Google fallback is enabled. Azure Personal Voice routes exist but no consent recording, clone or in-call cloned voice is claimed.

## Open release gates

1. Keep typed result-column population, source-backed exact quote extraction and universal ERP/LMS mapping as later work; current result fields are planned schema.
2. Build automated person-wise comparison and A/B traffic assignment with stable assignment, exposure and outcome records.
3. Verify physical Android microphone/background/reconnect behavior separately from the checked responsive 390px browser layout.
4. Keep live external OAuth, sync, email, WhatsApp delivery, caller identity, telephone, cloned voices, human listening and competitor trials marked unverified until actual evidence exists.
5. Decide production PostgreSQL/host, backups/recovery, retention/export/deletion, observability, billing and deployment hardening before any production-readiness statement.

Run `npm run context:check` after continuity edits. It should report valid graph nodes/edges/events and is a context integrity check, not a product verification gate.
