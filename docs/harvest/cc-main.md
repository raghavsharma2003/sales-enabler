# Harvest: cc-main — CarbonSettle CommandCentre (`command_centre`)

Repo: `/home/user/command_centre` (GitHub `raghavsharma2003/command_centre`). Read-only inspection on 2026-10-15 via a detached worktree of `origin/claude/focused-goldberg-2lmqf8` (a strict superset of `main`). Nothing was pushed, committed or changed in any remote system.

---

## 1. Summary

CommandCentre (CC) is a **production, single-tenant CRM + cold-outbound engine** built in about four months (first commit 2026-07-16 in this history, though the docs trace work back to March 2026 migrations) for CarbonSettle, an Indian CBAM-compliance firm. It is a Next.js 16 / React 19 app on Vercel (region hnd1) with Supabase Postgres. It has really sent about 9,000 cold emails across 12 to 18 warmed Google Workspace mailboxes, received about 90 replies, and runs a signed per-lead offer page (`/p/<token>`) with a personalised PDF brief, a first-party engagement tracker, and a HUMAN-versus-MACHINE session classifier.

Of everything in the sibling repos, this is the **closest thing to the command-centre's CRM, campaigns and lead-gen modules**. Its most valuable content is not the code but the **measured operational lessons**:
- ICP verification is the binding constraint. Deliverability is not.
- Pre-labelled pools lie (eu_strong was about 34% reliable).
- Most "engagement" is mail-security sandboxes.
- "Zero complaints" was a hard-coded placeholder.
- Bounce alerting could never fire.
- Cold email to EU importers is a measured dead channel: 916 sends, 2 humans.
- The real bottleneck was closing. Nobody had ever been quoted a price.

The code is a solid prototype-to-production hybrid, but it is the wrong shape for a multi-tenant SaaS:
- It has no tenancy and no real user auth (one shared password cookie).
- It is OpenRouter-based, not Azure.
- It uses Gmail app passwords over SMTP/IMAP.
- Schema has drifted: about 10 live tables are not in repo migrations.
- Its domain logic is hard-wired to CBAM.

**Recommendation:** harvest the engine patterns, the data-quality gates, the classifier taxonomies and the rejections. Rebuild them on a tenant-aware, Azure-native core rather than forking.

## 2. Branches covered

| Branch | Tip | Date | Relation to main |
|---|---|---|---|
| `main` | `c879f06` (merge PR #17) | 2026-10-14 | Baseline. 101 commits in this history (2026-07-16 → 2026-10-14). |
| `claude/serene-franklin-9w7f1v` | `c879f06` | 2026-10-14 | **Identical to main** (0 commits either way). It is the branch currently checked out in `/home/user/command_centre`. |
| `claude/focused-goldberg-2lmqf8` | `a8a60cc` | 2026-10-15 | main + 3 commits. (1) `6301f21` fix(bounce): `lib/cold-email/bounce-parser.ts` now matches a null Return-Path only when the whole header is `<>` (a substring match fired on newsletters) and never records an own-domain address as bounced, plus `bounce-parser.test.ts` (+31 lines). (2) and (3) are docs only: `docs/SESSION-LOG.md` (+74) and `docs/AGENT-CONTEXT.md` §4 refresh (October wave armed: 2,322 queued for 19–27 Oct). |

The other ~20 `origin/*` branches (data-hunt lanes, whatsapp, KNL deal, mobile apps, etc.) were out of scope for this cluster.

## 3. Product: what CC actually is

**Business context.** CarbonSettle sells CBAM report preparation to Indian manufacturers that export steel or aluminium (CN 72/73/76) to the EU. The ICP rule is absolute: being an EU exporter is required, and being a metal company is not enough. The current offer is "first CBAM report free". The founder runs the company with agents, and the repo is heavily agent-operated (CLAUDE.md, AGENTS.md, AGENT-CONTEXT.md, SESSION-LOG protocol, auto-memory graph).

**Surfaces (all real, in `app/`):**
- **CRM.** `leads` (about 7,500 rows) with `stage`, `scope_status`, `eu_export_evidence`, `source` cohort tags, `poc_name`. Supporting surfaces:
  - `/pipeline` (stage board), `/tasks` (shared_tasks), `/activity` (activity_log + trends), `/calls` (call outcome logging, phone-history, phone verification jobs), `/import` and `/importers` (CSV import with row-level audit and reconciliation), `/hot-leads` (engagement view plus an AI "next best action" score), `/reports`, `/analytics`, `/investor` (a real-numbers board view).
  - DB audit triggers on leads, enrollments and importers (`leads_audit`, `record_audit`) with rollback recipes.
- **Cold-email engine** (`/cold-email/*`, `lib/cold-email/*`, about 12.8k LOC): sequences, steps with subject variants and spintax, enrollments as the send queue, mailbox fleet management, throttle and ramp, placement testing, DNS health, Google Postmaster, suppressions, webhooks out, campaigns/audiences/journeys, per-campaign A/B stats, a "today" ops view, a research-leads review workspace, and harvest.
- **Wave/campaign registries in code:** `lib/cold-email/exporter-followup-def.ts` (`EXPORTER_WAVES`) and `lib/cold-email/importer-campaign.ts` (`IMPORTER_CAMPAIGN_DEFS`, with per-country keys and native DE/IT/ES copy). Each includes a week planner, test-send, enroll and status cron routes.
- **Inbox:** IMAP poller across all mailboxes (UIDVALIDITY-tracked), a warmup-mail filter, a bounce parser, a reply→send matcher, a 14-intent LLM reply classifier with a heuristic fallback, auto-translation of non-English replies, an AI Reply Studio (full-context draft, conversational refine, version history), meeting-time parsing and ICS invites, a daily reply digest, and sent-folder capture plus a historical archive ingest.
- **Prospect-facing offer chain:** signed `/p/<token>` page (company-personalised savings calculator), `/p/<token>/pdf` brief (`@react-pdf/renderer`, several design variants in `lib/free-quarter/`, `lib/importer-brief/`), a claim card writing to `website_leads`, and tracking to `proposal_events` (15 s heartbeat). Also `/wa/<token>` (tracked WhatsApp redirect) and an unsubscribe page with RFC 8058.
- **WhatsApp channel** (`lib/whatsapp/*`, `/whatsapp`): Meta Cloud API templates with a per-lead PDF document header, a campaign executor, a status/inbound webhook, STOP→confirm→unsubscribe friction, and suggested replies per intent. It is live but no real campaign has been sent.
- **Team chat** (`/team`, `lib/messaging/*`): channels, DMs, file upload, reactions, Web Push (VAPID, no Firebase), and per-person passcode identity that gates `/team` only. Realtime is polling, not Supabase Realtime.
- **Website analytics:** a first-party `/collect` endpoint plus funnel, heatmap, people and health views (`lib/site-analytics.ts`).
- **Mobile:** `mobile/` is a Capacitor WebView shell pointing at the prod URL. It has no bundled code.

**Real state (verified from code and docs, not re-measured live):**
- Live and sending: wave 2026-10 armed with 2,322 recipients for 19–27 Oct.
- Tests: 14 test files. The STATE doc claims 47/47 green and tsc clean. I did not re-run them.
- Vercel crons drive everything (`vercel.json`: send every 2 min, IMAP every 3 min, classify every 5 min, webhooks every minute, nightly health/ramp/throttle/placement).

## 4. Architecture and stack

- **App:** Next.js 16.1 (Turbopack, `proxy.ts` replaces middleware), React 19.2, Tailwind 4, Radix, recharts, zustand, sonner. About 81k LOC across `app/`, `lib/` and `components/`, with about 152 API routes.
- **DB:** Supabase Postgres (Tokyo, Free/Nano tier, no PITR). There are 30 migrations in `supabase/migrations/` plus `schema.sql`. **Schema drift:** `research_leads`, `eu_importers`, `eu_importer_contacts`, `domain_scope_verdicts`, `website_leads`, `wa_*` (messages/templates/replies/events/campaigns/opt_outs), `captured_sent`, `archive_messages`, `hot_leads_v` and `deploy_markers` are used in code but **have no CREATE in the repo**. They were created through MCP `apply_migration`. An `exporter_followup_audience()` SQL function holds the audience rule.
- **Mail transport:** nodemailer SMTP and imapflow IMAP against Google Workspace mailboxes on 4 sender domains (.org/.in/.world plus a cbam .com that SURBL lists). Credentials are AES-256-GCM-encrypted at rest (`lib/cold-email/encryption.ts`, scrypt-derived key). The Mailgun adapter doc exists (SES was denied) but Gmail SMTP is the live path.
- **AI:** `lib/ai.ts` is a plain-fetch OpenRouter client with per-task model chains (`classify|draft|parse|default`): free Gemma 4 26B first, then gemini-2.5-flash(-lite), then gpt-4o-mini. Everything is best-effort and null-returning so AI never breaks a flow. `reply-classifier.ts` additionally tries Anthropic Haiku when a key is set.
- **Auth:** `proxy.ts` sets one app-wide password cookie (`CC_APP_PASSWORD`, HMAC-signed). Public prospect paths are allow-listed, and pdf.* / links.* hosts may serve only those paths. Cron routes self-auth with `Bearer CRON_SECRET`. RLS was locked down on 2026-07-14, and the server uses the service-role key.
- **Ops scripts:** `scripts/` holds 104 one-off and resumable `.mjs`/`.ts` scripts (scope-clean, EU-verify, Apollo enrich, ELV verify, harvest worker, backups, audit-rollback, DNS check, dry-run send).

## 5. Reusable assets

| Asset | Paths | Maturity | Reuse for | Effort |
|---|---|---|---|---|
| Sequence/send engine with atomic lease claim, transient-vs-permanent SMTP classification (4xx retry ×3 with 45 min backoff), per-lead timezone business-window alignment, sticky A/B subject assignment persisted pre-send, first-touch-only structural guard, audience-routed send paths | `lib/cold-email/sequence-engine.ts`, `timezone-resolver.ts`, `spintax.ts`, `render.ts` | production | campaigns, omnichannel, orchestration | adapt |
| Mailbox fleet: composite picker (0.4 reputation + 0.2 capacity + 0.4 per-recipient-domain history, 10% sticky threshold), atomic slot reservation, adaptive throttle (7-day bounce ≥2/3/5% → 0.75/0.5/0.25), warmup ramp (15/day +5 per healthy day), auth-failure → disable box not lead, single `GLOBAL_HOURLY_CAP` | `lib/cold-email/mailbox-picker.ts`, `mailbox-store.ts`, `throttle.ts`, `ramp-scheduler.ts`, `send-limits.ts`, `domain-stats.ts`, `health-scorer.ts` | production | campaigns, infra-ops | adapt |
| Inbox pipeline: IMAP poller with UIDVALIDITY, warmup filter, DSN bounce parser (with the 10-15 fix), reply→send matcher, soft-bounce policy, suppression list | `lib/cold-email/imap-poller.ts`, `warmup-filter.ts`, `bounce-parser.ts`, `reply-matcher.ts`, `soft-bounce-policy.ts`, `suppression.ts` | production | omnichannel, crm | adapt |
| 14-intent reply classifier (LLM + high-precision heuristic fallback; SUPPRESS_AUTO_REPLY and REDIRECT intent sets; redirect-email extraction), with tests | `lib/cold-email/reply-classifier.ts`, `reply-classifier.test.ts`, `reply-translator.ts` | tested | chat-agent, omnichannel, crm | adapt |
| HUMAN vs MACHINE engagement classifier (heartbeat cadence, session length, send→first-event delay, shared ip_hash demotion; rules only ever move toward MACHINE) | `lib/engagement-classifier.ts`, `components/proposal/proposal-analytics.tsx`, `lib/proposal-analytics.ts` | tested | analytics, campaigns, eval-quality | drop-in |
| Signed per-lead link tokens (HMAC, typed: proposal/free_quarter/importer), plus a durable "deleted lead degrades to a generic page" rule | `lib/cold-email/proposal-link.ts`, `unsubscribe-token.ts`, `app/p/[token]/*` | production | campaigns, lead-gen | drop-in |
| Personalised offer page + PDF brief generator (react-pdf, multiple variants, savings calculator) | `lib/free-quarter/*`, `lib/importer-brief/*`, `lib/cold-email/lead-savings.ts`, `app/p/[token]` | production | content-gen, campaigns | idea-only (CBAM-specific) |
| ICP data-quality gates: deterministic head-noun scope classifier, domain-verdict cache (classify once), LLM website EU-export verifier (conservative verdicts), domain-identity rule | `scripts/scope-clean-rules.mjs`, `scripts/verify-eu-export.mjs`, `verify-eu-export-leads.mjs`, `domain_scope_verdicts` | tested | lead-gen, company-brain, eval-quality | rewrite (generalise ICP as config) |
| Lead-gen harvest playbook + data-hunt spec (own-site-is-truth, never guess emails, licence check, evidence URL per row; cheap crawl+cache then agent judgment on cached pages) | `docs/data-hunt/SPEC.md`, `docs/eu-importer-scrape-operation.md`, `scripts/eu-importers/*`, `scripts/harvest-worker.mjs` | tested | lead-gen | adapt |
| DIY inbox-placement tester (seed accounts × mailboxes, IMAP check of INBOX vs Junk) | `lib/cold-email/placement-tester.ts`, `app/api/cron/placement-*` | prototype | campaigns, infra-ops | adapt |
| Outbound webhooks dispatcher with delivery log + cleanup cron | `lib/cold-email/webhooks.ts`, `app/api/cron/dispatch-webhooks` | production | orchestration | adapt |
| DB audit trigger (full old/new jsonb, changed_fields, actor) + rollback script and doc | `supabase/migrations/20260715_*audit*.sql`, `scripts/audit-rollback.mjs`, `docs/audit-and-rollback.md` | production | erp, crm, safety | drop-in |
| AI Reply Studio (full-context draft + conversational refine + version history) | `lib/cold-email/ai-draft.ts`, `app/api/cold-email/replies/[id]/{draft,compose}` | production | chat-agent, crm | adapt |
| AI hot-lead scoring (engagement view + reply → score/reason/next action) | `lib/cold-email/ai-lead-score.ts`, `app/api/hot-leads/score`, `hot_leads_v` | prototype | crm, analytics | adapt |
| WhatsApp Cloud API: template+PDF header sends, executor, webhook, STOP confirm friction | `lib/whatsapp/*`, `app/api/whatsapp/*` | tested | omnichannel | adapt |
| Team chat + Web Push (VAPID) + passcode identity | `lib/messaging/*`, `app/team`, `supabase/migrations/20260623_team_messaging.sql` | tested | design-ui, auth-tenancy | idea-only |
| First-party website analytics collector (UTM/referrer source, hashed IP, funnel/heatmap) | `lib/site-analytics.ts`, `app/collect`, `app/api/site-analytics/*` | production | analytics | adapt |
| Provider-agnostic AI client with per-task fallback chains, null-on-failure | `lib/ai.ts` | production | orchestration | adapt (swap to Azure deployments) |
| Agent-operated context system (AGENT-CONTEXT, SESSION-LOG protocol, CLAUDE/AGENTS.md, feedback memory) | `docs/AGENT-CONTEXT.md`, `docs/SESSION-LOG-PROTOCOL.md`, `CLAUDE.md`, `AGENTS.md` | production | memory-learning | idea-only |
| Capacitor WebView mobile shell | `mobile/` | prototype | design-ui | drop-in |

## 6. Measured lessons (with evidence)

1. **Most landing-page "engagement" is mail-security sandboxes.**
   - Evidence: exporter free-quarter campaign, 12 verified humans versus 244 machine sessions. The historic "205 page views / 149 brief reads" was about 3× inflated. Germany importer wave: 0 humans, 5 machines.
   - The human rule is: session ≥45 s, ≥2 heartbeats, >8 s per heartbeat, first event >10 min after send. (`docs/STATE-2026-08-24.md` §2, `lib/engagement-classifier.ts`)
2. **Cold email to EU importers is a dead channel.**
   - Evidence: 916 sends in 20 countries, 2 verified humans, 0 conversations, 0 revenue. Germany (319 sends, native German, correct timing) gave zero human engagement.
   - Source: `docs/STATE-2026-09-02.md` §1, 2026-09-02.
3. **The bottleneck was closing, not lead supply.** There were 88 replies all-time (21 positive, 3 meeting, 8 question). Of 7,538 leads, one was in a commercial stage, and no price had ever been quoted. (STATE-2026-08-24 §3)
4. **Pre-labelled ICP tags lie.**
   - Evidence: an 801-company sample (7 shards) found `eu_strong` about 34% reliable: 51% wrong-industry, 12% wrong-company, about 18% verified.
   - Result: eu_strong went from 1,443 to 488 after the 2026-07-18 verification. The mega-scrape was about 47% junk, and 42% of 7,459 leads were quarantined.
5. **Hand-reviewed lanes beat regex classifiers.** Hand-reviewed lanes had ≤10% junk; regex/directory-label lanes had 33–56%. Affinity alone over-condemned by 4.75× while letting 48% of real junk through. Fetching the company's own site is load-bearing. (SESSION-LOG 2026-07-17)
6. **Guessing domains is dangerous.** The guess-only domain resolver was about 45% junk. The wrong-domain incident sent about 156 emails to 147 strangers (2.15% of 7,257 sends).
7. **Verified emails versus raw MX:** unverified (MX-only) addresses bounced about 6% and throttled the fleet. ELV-verified cohorts bounced 0% (501/501 on 2026-07-08).
8. **Fleet capacity math.** Measured 2026-09-02: `min_gap_seconds=180` with (1+rand×1.5) jitter gives about 9.9 sends per hour per box, so about 71/day per box in a 6.25 h window. Ten usable boxes give about 292/day, and 12 give about 350/day. The best day in 90 days was 637. Raising the global hourly cap alone does not raise throughput.
9. **Gmail Primary-tab placement** came from: plain-text-first, no open pixel, no List-Unsubscribe headers or footer on 1:1 style sends, From name set to a real person, a worded hyperlink instead of a raw token URL, and a fresh subject for each placement test (same subject threads into the old tab).
10. **Engagement can be delayed.** One verified human visited 9 days after delivery, so attribution windows must be long.
11. **Two metrics never existed.**
    - Spam complaints were a hard-coded `const complaints = 0; // placeholder` in `health-scorer.ts`.
    - Bounce alerting read `cold_email_sends.status='bounced'`, which is never written. There were 306 real bounces in 30 days in `email_bounces`.
12. **Supabase RLS can silently report success.** A temporary anon write policy declared `FOR UPDATE` only gives 0-row updates with no error. Always `.update().select("id")` and count the rows.
13. **WhatsApp: Meta error 131049 silently drops MARKETING templates** to cold or unengaged recipients on a new number. This was proven by a utility-versus-marketing A/B test. Free-form replies inside a user-opened 24 h window are exempt, so opt-in-first is the play. Phone data was also thin: 209 usable mobiles out of 7,459 leads.
14. **Supply saturation.** Free public sources are near saturation. In the October data hunt, 82% of 580 screened rows were already held, and the fair crawl yield was about 6%.

## 7. Rejected and failed approaches (highest value)

| Tried | What broke |
|---|---|
| Apollo **industry search** for discovery (lane 2) | Contaminated data. About 758 of 2,500 credits were wasted. Apollo billed the full 2,500 against a 2K internal cap because the internal ledger counted "useful results", not vendor billing. Correct approach: domain-targeted enrichment of an already-verified list. |
| Trusting pre-labelled pools (`send_pool_1_EU_priority`, `cbam_strong` tags) | Only 4 of 56 sent were genuine ICP. About 30 mis-targeted offers went out, and the campaign was hard-stopped. ELV verifies deliverability, not ICP. |
| Name+city company→domain guessing | Indian SMEs were mapped onto unrelated foreign sites (enbridge.com, titanium.com, mastodon.social). The verifier then read the wrong site and stamped eu_strong, and emails went to strangers. Fix: match on domain identity (`ld+json sameAs`, own-site evidence). |
| Self-hosted SMTP email verification | The sending IP was Spamhaus-listed, so probes were 550-rejected and produced false invalids. It is dead, and a paid verifier is needed. |
| Follow-up sequences (multi-step) | The founder killed them on 2026-07-09. Follow-up steps were deleted and the engine now parks any step_order>0 structurally. Later follow-ups are run as step 0 of a new sequence, wave by wave. |
| Open-tracking pixel on cold mail | Hurts placement on warming domains. It is off by default (`track_opens=false`). |
| Attaching the PDF on the first cold email | The research brief estimated a 15–30% deliverability loss. The PDF is now sent on reply only. |
| Cold email to EU importers at scale (DE/FR/NL/GB/IT/ES/Nordics) | 916 sends gave 2 humans. Declared finished. |
| `nemotron` free model on OpenRouter | Leaks chain-of-thought into content and fails JSON mode. |
| OpenAI direct | Account quota dead. The website's blog engine silently died on it for weeks: the CI step exited 0 while doing nothing. |
| KBO Belgium and 9 other registries/associations (WKO AT, CAMIC CZ, APCMC PT, A3M FR, GZS SI, ACCI GR, …) | Their licences forbid direct marketing. Do not re-propose them. |
| `exporter_backref` (inferring EU importers from Indian exporters' logo walls) | Cannot prove an EU import when the buyer has an Indian subsidiary. 59 rows were rejected. |
| NACE registry bulk harvest without a domain resolver | 53% of the DB but only 1.8% strong, with 4,759 rows having no website. |
| Website visual redesign | Rejected by the founder and rolled back. The design chapter is closed. |
| Vercel Deployment Protection to secure the CRM | Cannot cover the prod `*.vercel.app` alias without a paid add-on, so an app-level password gate was built instead. |
| Amazon SES | Account denied, so Mailgun was documented as an alternative and Gmail SMTP stayed live. |
| `carbonsettlecbam.com` sender domain | SURBL-listed (reproduced 3/3), so its 5 boxes were excluded from plans. |

## 8. Risks and landmines

- **Plaintext secret in git:** `docs/SESSION-LOG.md` contains the CC app password in clear text (in two entries). The world-class roadmap also notes Supabase keys leaked in git history. Do not copy those docs into sales-enabler verbatim, and treat the CC password as compromised.
- **No tenancy and no real auth:** one shared password, and RLS bypassed by the service role everywhere. The single-tenant assumption is everywhere (`leads` has no org_id; `workspace-scope.ts` is shallow).
- **Schema drift:** about 10 live tables have no migration in the repo, so the DB cannot be reproduced from source.
- **DB fragility:** Supabase Free/Nano with no backups, and one outage already. Backups are manual scripts.
- **Stale AI prompt copy:**
  - `lib/cold-email/ai-draft.ts` SYSTEM_PROMPT still offers the "April–June 2026 quarter free (start by 30 September 2026)".
  - `lib/whatsapp/agent.ts` still says "free this quarter".
  - Both contradict the current "first report free" offer, which is a live risk of AI replies misquoting the offer. This is why offer facts belong in data, not prompt prose.
- **Hard-coded CBAM domain logic** throughout: savings math, briefs, classifiers, ICP gates, reply-classifier prompt.
- **Gmail app passwords:** 5 of 17 boxes died on revoked app passwords, about 710 sends failed in September, and this went unnoticed until October. Credential rot needs monitoring.
- **Known unfixed defects:**
  - Claim-form CRM leak on importer tokens: the csRef resolves to an eu_importers.id and FK-violates `website_leads.lead_id`.
  - `captureKey` truncation to 64 chars against 102-char tokens.
  - The ack email skips domain sanity.
  - Spillover rescheduling loses local time-of-day (29% of July sends landed 04:00–08:00 local).
  - The campaign-window overwrite trap: arming a second date silently defers the first.
  - An idle throttled box can never recover (`if (sends===0) continue`).
- **Vercel cron reliance:** a 2-min send cron with 5-min maxDuration needs the atomic lease (present). Background jobs on the founder's Windows box get reaped.
- **Duplicate senders:** Outreach, Emailer and the Cold Engine are three send paths with divergent template variables. The roadmap admits they need unifying.

## 9. Azure dependencies

None. CC has **no Azure usage at all**. Its external dependencies are:
- Supabase (Postgres, Storage, Realtime unused) and Vercel (hosting, crons).
- OpenRouter (Gemma, Gemini, GPT-4o-mini) and optionally Anthropic Haiku.
- Google Workspace SMTP/IMAP, Google Postmaster and Search Console.
- Meta WhatsApp Cloud API, Apollo, EmailListVerify (ELV), and optionally Mailgun.

For sales-enabler under the Azure-only rule, each needs a substitute:

| CC dependency | Azure / allowed substitute | Notes |
|---|---|---|
| OpenRouter / Anthropic | Azure OpenAI / Foundry direct models | Keep the `lib/ai.ts` per-task chain pattern. |
| Vercel + crons | Azure Container Apps with Container Apps Jobs or a scheduler | |
| Supabase | Neon Postgres | Allowed. |
| Google Workspace SMTP | ACS Email | **This changes the deliverability model.** CC's whole fleet/warmup/per-mailbox reputation design assumes many Gmail identities, while ACS is a domain-level sender with its own quotas and reputation. IMAP reply ingest would need ACS inbound, Graph/Exchange, or a custom MX. |
| Meta WhatsApp and Apollo/ELV | Third-party vendors | Must be checked against the Azure-only directive. |

## 10. Recommendation for sales-enabler

1. **Do not fork CC.** It is single-tenant, has no migrations for half its schema, has CBAM logic in every layer, and carries a plaintext secret in its docs. **Port its patterns into a tenant-aware Neon schema** (org_id on every row, real auth, migrations as the only source of truth, audit trigger from day one).
2. **Lift these engines nearly as designed and re-implement them cleanly:**
   - Enrollment-as-queue with the `next_send_at` cursor (NULL = parked) and the atomic lease claim.
   - Transient/permanent send classification.
   - Timezone business windows.
   - Sticky A/B subject assignment.
   - Composite sender picker, adaptive throttle and warmup ramp, generalised to "sender identity" so they work for ACS domains, email, WhatsApp and voice lines.
   - Suppression and bounce/reply ingest.
   - The 14-intent reply taxonomy with its suppress/redirect sets.
   - The HUMAN/MACHINE engagement classifier: copy its rule verbatim and make it the default for every analytics number.
3. **Make the ICP gates a first-class "audience qualification" module:**
   - A per-tenant ICP config instead of hard-coded CBAM: deterministic rules, then a cached own-site crawl, then LLM judgment on the cached pages, then domain-identity match, then a verdict cache. Never auto-keep.
   - Every send arms only from qualified audiences.
   - This is CC's single biggest lesson: ICP accuracy, not volume or deliverability, decided outcomes.
4. **Build in the honesty instrumentation CC lacked:**
   - Real complaint measurement and bounce alerting off the true bounce table.
   - A "not measured" state in the UI instead of zero.
   - Billing caps enforced against the vendor's own billing.
   - Credential-health monitoring for every sender.
5. **Keep offer facts and dates in data, not in prompts.** Prompts are shapes, and facts are injected. CC's stale "April–June free quarter" prompt is the cautionary example.
6. **Design the CRM around closing, not supply.** Stage hygiene (claims auto-advance the stage and write activity), a hot-lead next-action queue, quoting/pricing objects, and a pipeline review. CC's data shows replies were wasted for lack of follow-through.
7. **Carry forward the rejection ledger** (§7) into sales-enabler's `context/rejected.md`, especially: Apollo industry search, pre-labelled pools, guessed domains, self-hosted SMTP verification, open pixels and cold PDFs, licence-dead registries, and WhatsApp marketing templates to cold numbers.
8. **Plan the email transport decision explicitly.** ACS Email versus multi-identity Workspace mailboxes is the biggest architectural fork. CC's measured deliverability playbook belongs to the latter, so it must be re-measured on ACS before any claim of parity.
