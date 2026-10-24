# Harvest: command_centre non-main branches (cluster `cc-branches`)

Repo: `/home/user/command_centre` (CarbonSettle CommandCentre). Inspected 2026-10-15, read-only, via
`git log origin/main..origin/<b>`, `git diff --stat origin/main...origin/<b>`, per-file
`git diff --quiet origin/main origin/<b> -- <f>` (to check whether branch content had landed in main by
another route), and `git show <branch>:<path>` for reading. No worktrees were needed and none were left.
`main` itself is described in `cc-main.md`; this report covers only what the 20 side branches hold
that main does not.

## Summary

- **20 branches; 8 hold nothing that isn't in main.** Five are ancestors of main (ahead = 0). Three
  (`codex/fix-import-csv-errors-20260429`, `claude/mobile-apps-ios-android-4r54ys`,
  `fix/team-chat-reaction-mobile`) come from the history from before main was re-rooted. Main's
  oldest commit is 2026-07-16 and these branches share no merge base with it, but checking file by
  file shows their content is in main, apart from one CSS line.
- **The most important finding is a security and guardrail fix set that never merged.**
  `claude/context-project-review-0x0i6g` holds the 2026-07-23 review: 6 parallel agents, 136/136
  tests, tsc and build clean. It fixes `verifyUnsubscribeToken`, which **rejects every real email
  address**. It also adds suppression and scope guards to every send path, an atomic claim and
  daily cap for the WhatsApp executor, a replacement for the vulnerable `xlsx@0.18.5`, cookie
  signing that no longer uses the password as the key, and constant-time secret comparison.
  **I checked `origin/main` today and the bugs are still there.** The 3-part split in
  `lib/cold-email/unsubscribe-token.ts` is unchanged, `package.json` still pins
  `"xlsx": "^0.18.5"`, `lib/secure-compare.ts` is absent, `lead-followup.ts` has no
  `isSuppressed`, and the emailer cron has no kill-switch. This is the most reusable code in the
  cluster: the correctness lessons and new test suites carry over to any outbound engine.
- **Data held only on branches:** data-hunt Lane N (356 audited EU-importer rows across 13 countries)
  and Lane B (252 rows across IT/ES/PT/GR). Both were imported into the live `eu_importers` table on
  2026-08-03; main's import log says "neither branch was merged into main". Their REPORT files are
  the best written method for an evidence-gated lead-gen harvest found anywhere in this repo
  family.
- **Business ops material held only on branches:** a reconstruction of the KNL deal and a
  negotiation brief, a GST invoice renderer (HTML and a ~6 KB compact PDF), and a generator for a
  CBAM data-collection workbook (KNL branch). There is also an inventory of 14 acquisition channels
  with measured yields, an SEO analysis, a press/LinkedIn "phase 2" kit (acquisition-channels
  branch), the growth-insight op (project-review branch), mill-outreach campaign records
  (precursor-emissions branch), and a script that sends through the production HTTPS app
  (send-the-4 and email-replies-smtp branches).

## Branches covered

| Branch | Last commit | Ahead/behind main | Unique content (not in main) |
|---|---|---|---|
| `claude/knl-deal-negotiation-tr6zdw` | 2026-10-12 | +21 / -5 | KNL negotiation brief, co-founder prep sheet, `docs/invoice/*` (template.html, supplier.json, knl-group-2026.json, README with GST Rule 46 checklist, signature PNG), `scripts/render-invoice.py`, `scripts/render-invoice-compact.py` (reportlab, ~6 KB PDF for email attachment), `scripts/generate-knl-cbam-workbook.py` (openpyxl, 623 lines) + generated xlsx, `docs/clients/knl/cbam-data-requirements-2026-10.md`, `docs/company-details.md`, SESSION-LOG entries (invoice numbering series CS/26-27/1001+). **All unique.** |
| `claude/client-acquisition-channels-120u56` | 2026-09-05 | +12 / -5 | `docs/acquisition-channels-2026-09-04.md` (14-channel inventory with measured yields), `docs/seo-organic-leads-analysis-2026-09-04.md`, `docs/phase2/*` (LinkedIn calendar Sep 7 to Oct 2, journalist pitches, EEPC webinar pitch, 2 guest articles incl. .docx, offsite applications, Mohindra case-study ask, runbook), AGENT-CONTEXT and SESSION-LOG deltas. **All unique.** |
| `claude/tarasha-partners-client-overview-babi7p` | 2026-08-19 | 0 / -64 | Nothing (fully merged). |
| `claude/client-proposal-writeup-udtw8f` | 2026-08-17 | 0 / -38 | Nothing. |
| `claude/startup-context-handoff-m9ubqv` | 2026-08-10 | 0 / -41 | Nothing. |
| `claude/cargo-center-demo-fno48u` | 2026-08-07 | 0 / -42 | Nothing. |
| `data-hunt/SE-2026-07-31` (Lane N) | 2026-08-02 | +25 / -54 | `docs/data-hunt/out/N-*.csv` (13 countries), `N-2026-07-31-REPORT.md` (423 lines), `N-...-REJECTED.csv` (133 quarantined rows with reason codes), a 27,346-domain `known-domains.txt`. Lane-A commits and the spec fold-in also appear here but are already in main. |
| `data-hunt/IT-2026-07-31` (Lane B) | 2026-07-31 | +2 / -55 | `B-{IT,ES,PT,GR}` CSVs, `B-...-REPORT.md` (268 lines), REJECTED (143), and a 6,992-domain skip list rebuilt from the live DB. |
| `claude/data-hunt-lane-a-kwc0g7`, `data-hunt/A-2026-07-31` | 2026-07-31 | 0 / -58 | Nothing (Lane A's 862 rows and the A report are in main). |
| `fix/reports-summary-test-mock` | 2026-07-31 | 0 / -60 | Nothing. |
| `claude/carbonsettle-precursor-emissions-5miavb` | 2026-07-29 | +6 / -74 | `docs/mill-outreach-operation-2026-07-23.md` (243 published contacts at Indian mills), `docs/mill-outreach-campaign-2026-07-27.md` (82 bespoke sends, launch record), a skip-footer rule for 1:1 audiences (commit `292d74b`, cold-email), a reports test mock, and a `.claude/settings.local.json` that should not have been committed. |
| `claude/carbonsettle-business-strategy-tcflss` | 2026-07-28 | +5 / -81 | Read-only MCP permission allowlist in `.claude/settings.json`, a test mock fix, and SESSION-LOG notes on a "strategy suite" (9 research pilots, whose artifacts are not in git). Low value. |
| `claude/context-project-review-0x0i6g` | 2026-07-24 | +9 / -83 | **High value.** `docs/project-review-2026-07-23.md` and `docs/growth-insights-2026-07-24.md`. The security/guardrail sweep touches about 20 API routes and libs, adds `lib/secure-compare.ts`, and adds new tests: `unsubscribe-token.test.ts` (199 lines), `render.test.ts` (212), `proposal-link.test.ts` (89), `template-engine.test.ts` (104). It also adds `npm audit` to `ci.yml`, archives ~40 docs and ~25 one-shot scripts, deletes ~68 KB of dead proposal generators and ~40 MB of sample PDFs, and replaces `xlsx`. **Not merged.** |
| `claude/send-the-4-qro398` | 2026-07-23 | +2 / -83 | Same two scripts as the next row, plus a SESSION-LOG entry ("4/4 sent"). |
| `claude/email-replies-smtp-2wpifv` | 2026-07-22 | +2 / -84 | `scripts/send-via-prod.mjs` (send replies by calling the live app's manual-reply endpoint over HTTPS, because raw SMTP egress is blocked from cloud sessions) and `scripts/send-segment-a-followups.ts`. One-shot, with hard-coded reply IDs and bodies, and no idempotency guard. |
| `claude/supabase-mcp-permissions-v1px7r` | 2026-07-22 | +3 / -84 | `.mcp.json` registering the Neon MCP alongside Supabase, and an MCP permission allowlist. Config only. |
| `fix/team-chat-reaction-mobile` | 2026-06-23 | +223 / -101, no merge base | Pre-re-root history. All files exist in main. The only content difference is the 1-line fix in `app/team/page.tsx`: the reaction button was `hidden ... group-hover:grid`, which made it invisible and unclickable on touch devices, and the fix makes it always `grid`. **Main still has the hover-only version.** |
| `claude/mobile-apps-ios-android-4r54ys` | 2026-06-23 | +222 / -101, no merge base | Pre-re-root history of the Capacitor shell, Web Push, team chat, notification bell and mobile UX. **All of it is in main** (`mobile/`, `public/sw.js`, `lib/messaging/push.ts`, `app/api/push/subscribe`, `components/layout/notification-bell.tsx`). Nothing unique. |
| `codex/fix-import-csv-errors-20260429` | 2026-04-29 | +56 / -101, no merge base | Pre-re-root Codex history (Mar–Apr 2026). The CSV import fix (`sanitizeConstrainedLeadFields` / `normalizeLeadMutationPayload`) **is in main**. The only files absent from main are `docs/aws-ses-spacemail-setup.md` (AWS SES and SpaceMail operator guide), `scripts/test-spacemail.js`, review PDFs/PNGs and a favicon. Not relevant under Azure-only. |

## Product (what these branches add to the picture)

CommandCentre is CarbonSettle's internal CRM and outbound engine for selling CBAM compliance to
Indian steel and aluminium exporters. The branches show the **operating layer** around that
engine, which an AI command centre has to automate:

1. **Deal desk (KNL branch).** An agent rebuilt a full deal history from Gmail, the CRM tables,
   Calendar and the portal DB, marking anything it could not verify as `UNVERIFIED`. It then wrote
   a negotiation brief (stakeholder map with champion, economic buyer, gate and implementer; the
   timeline; one incident where the cold engine sent the CFO a "free" blast 11 days before quoting
   ₹96,000; the levers). It also produced a GST-compliant proforma/tax invoice pipeline from JSON
   data and a client data-collection workbook. This is the "ERP-lite plus deal intelligence" slice
   of the vision, done by hand by an agent.
2. **Channel strategy (acquisition branch).** A 14-channel inventory, each with state, measured
   yield and a verdict. Examples: cold email to Indian exporters gave 8,784 sends and 88 replies;
   cold email to EU importers gave 916 sends and 0 conversations ("do not spend more");
   WhatsApp cannot be used for cold outreach because of Meta error 131049; the pincer play has
   "never run once". It comes with a diagnosis: the bottleneck is follow-through, not lead supply.
3. **Growth-insight op (project-review branch).** An all-source funnel audit of the CRM, portal
   DB, mailbox and analytics produced a ranked rescue plan and a list of named leaks (a CFO's
   scoping data unanswered for 13 days, 4 of 5 claimants never contacted). It also corrected
   several beliefs against the data.
4. **Lead generation (data-hunt lanes).** Parallel agent "lanes" harvest EU importers from
   licence-checked public sources. They use adversarial audits, a census instead of a sample when
   defect rates were high, a skip-list to avoid duplicates, and quarantine files.
5. **Campaign execution (mill outreach).** 82 bespoke one-to-one emails sent through the
   production engine as one single-step sequence per recipient. Scheduled one-shot tasks
   verified the trial send, reported after each batch and wrote the final wrap-up.
6. **Mobile and team messaging (pre-re-root branches).** These are already in main.

## Architecture & stack

Everything sits on top of main's stack: Next.js on Vercel, Supabase Postgres (and Neon via MCP),
an in-house cold-email engine (`lib/cold-email/*`, cron `send-pending` every 2 minutes), the
WhatsApp Cloud API executor, and a Capacitor WebView shell. Branch-only tooling is Python
(`reportlab` and `pillow` for invoices, `openpyxl` for workbooks) and Node one-shot scripts. The
data-hunt lanes ran inside Claude cloud sessions with parallel sub-agents. Their verifier scripts
(`verify_all.py`, `recheck.py`, referenced in the Lane N report) are **not committed**; only their
outputs and reports are.

## Reusable assets

| Asset | Paths (branch) | Maturity | Reuse for | Effort |
|---|---|---|---|---|
| Send-path guardrail sweep: suppression check inside every send path, scope re-gate at send time, kill-switch for the legacy emailer cron, atomic claim + daily cap + scope gate in the WA executor, junk-name guard | `lib/cold-email/sequence-engine.ts`, `lead-followup.ts`, `lib/email-jobs.ts`, `lib/email-dispatcher.ts`, `app/api/cron/emailer/route.ts`, `app/api/cron/send-pending/route.ts`, `lib/whatsapp/executor.ts` (context-project-review) | tested (136/136 tests per doc; tsc and build clean) | campaigns, omnichannel, safety | adapt (port as design invariants; code is Supabase-specific) |
| Unsubscribe token fix: split from the right, plus a 199-line test suite | `lib/cold-email/unsubscribe-token.ts`, `.test.ts` (context-project-review) | tested | campaigns, safety | drop-in pattern |
| `secureCompare` (timingSafeEqual wrapper), app-auth cookie signing secret kept separate from the password, two secrets for proposal links | `lib/secure-compare.ts`, `lib/app-auth.ts`, `lib/cold-email/proposal-link.ts` (+test) (context-project-review) | tested | auth-tenancy, safety | drop-in |
| Pure-function test suites for email render, template engine and proposal links | `lib/cold-email/render.test.ts`, `lib/template-engine.test.ts`, `lib/cold-email/proposal-link.test.ts` | tested | eval-quality, campaigns | adapt |
| Project-review method and findings (P0–P3 ranked, every claim hand-verified against source) | `docs/project-review-2026-07-23.md` | production (doc) | infra-ops, safety | idea-only |
| Growth-insight op: all-source funnel audit, named leaks, ranked plan, "honest corrections" | `docs/growth-insights-2026-07-24.md` | production (doc) | analytics, company-brain | idea-only (template for an automated "growth analyst" agent) |
| Acquisition-channel inventory with measured yields and verdicts | `docs/acquisition-channels-2026-09-04.md` (acquisition) | production (doc) | campaigns, lead-gen, analytics | idea-only |
| SEO / organic-lead analysis with a phased change proposal | `docs/seo-organic-leads-analysis-2026-09-04.md` | prototype | content-gen, lead-gen | idea-only |
| Press/LinkedIn/guest-article content kit | `docs/phase2/*` | prototype | content-gen | idea-only |
| GST invoice pipeline: JSON → HTML template and PDF; compact PDF (~6 KB, standard fonts) for email or connector attachment; DRAFT banner whenever any value is `TO-CONFIRM`; signatory image gating | `docs/invoice/{template.html,supplier.json,README.md}`, `scripts/render-invoice.py`, `scripts/render-invoice-compact.py` (knl) | tested (real invoices issued) | erp | adapt |
| Client data-collection workbook generator (colour-coded fill-by roles, data validation, cell comments) | `scripts/generate-knl-cbam-workbook.py` (knl) | production (sent to client) | erp, crm | adapt (generalise into a schema-driven workbook builder) |
| Deal reconstruction and negotiation brief (verified from mail, CRM, calendar, portal; `UNVERIFIED` markers) | `docs/knl-negotiation-brief-2026-09-04.md`, `docs/knl-cofounder-prep-2026-09-05.md` (knl) | production (doc) | crm, company-brain | idea-only (spec for a "deal brief" agent) |
| Data-hunt lane method: licence ledger, skip-list deduplication before any fetch, adversarial audit escalating to a census, manufacturing-verb pre-filter, evidence must sit in rendered body text, quarantine file with reason codes | `docs/data-hunt/out/N-2026-07-31-REPORT.md`, `B-2026-07-31-REPORT.md`, `known-domains.txt` (data-hunt SE/IT) | tested (imported to the live DB 2026-08-03; fabricated emails = 0) | lead-gen, eval-quality | adapt |
| Bespoke 1:1 campaign mechanics on a sequence engine (one single-step sequence per recipient, mailbox pinning, trial-to-own-inbox gate, scheduled verify and report tasks) | `docs/mill-outreach-campaign-2026-07-27.md` (precursor-emissions) | production (81/81 sent) | campaigns, orchestration | idea-only |
| Send through the production app over HTTPS from a sandbox that has no SMTP egress | `scripts/send-via-prod.mjs` (email-replies-smtp, send-the-4) | prototype (one-shot, no idempotency) | orchestration | rewrite |
| Fix for the touch-device reaction button | `app/team/page.tsx` (fix/team-chat-reaction-mobile) | tested | design-ui | drop-in |

## Measured lessons

- **Unsubscribe links were broken for every real address.** The verifier split `email.ts.sig` on
  `.` and required exactly 3 parts, and every email address contains a dot. Found during the
  2026-07-23 implementation (`docs/project-review-2026-07-23.md`). Still unfixed on main as of
  2026-10-15.
- **CI was red from 2026-07-14 to 2026-07-23.** A stale Supabase mock in the reports-summary test,
  after a pagination change, broke it and nobody noticed. Three branches each fix that same mock
  independently.
- **Loss-framed subjects beat "free" subjects about 2.2× on page views:** 6.1% vs 2.8%, with 80% of
  volume on the weaker subject (`docs/growth-insights-2026-07-24.md`, live CRM, 2026-07-24;
  June/July timing confound noted).
- **Send time:** 16:00 IST gave a 6.5% view rate, 14:00–15:00 about 4.2%, 09:00 1.2%. Friday was
  the worst day (same source).
- **Named contact vs info@: no measurable lift** (3.59% vs 3.32% view rate) (same source).
- **Verified cohorts did not beat broad scrapes in July** (eu_strong 0.8%, research_verified 1.6%,
  June broad scrapes 5.5%). "Verified engages more" is unproven.
- **Funnel:** 5,899 emailed, 208 page viewers, 149 brief readers, 76 replies, 1 trial, 0 won
  (2026-07-24). By 2026-09-04: 8,784 sends, 88 replies (21 positive), 12 verified humans against
  244 machine sessions on the free-quarter page. Page views were about 3× inflated by
  mail-security sandboxes until a classifier was added (human = at least 45 s, at least 2
  heartbeats more than 8 s apart, more than 10 minutes after the send)
  (`docs/acquisition-channels-2026-09-04.md`).
- **EU-importer cold email:** 916 sends to 20 countries produced 2 humans and 0 conversations.
  Germany (319 sends) was the decisive test (same doc).
- **Data hunt Lane N:** a 10% seeded adversarial sample showed a 23% defect rate. A full census of
  443 rows killed 112, and re-quoting recovered 19, leaving 356. Fabricated emails: 0. Registry
  sources had 38.9% junk in NO, 22.6% in FI and 23.1% in EE, even with the correct NACE code.
  415 domains were skipped before any fetch (`N-2026-07-31-REPORT.md`, 2026-08-02).
- **Data hunt Lane B:** 252 rows shipped; 53 duplicates across lanes were caught only at merge.
  At import, 134 of 229 valid rows were already in the DB, leaving 95 net-new. Lane N gave 356
  net-new (main `docs/data-hunt/IMPORT-LOG-2026-08-03.md`).
- **Mill outreach:** 81/81 sent, 3 bounces, 1 association reply. The trial send to an internal
  inbox caught a footer bug before the real sends (precursor-emissions SESSION-LOG, 2026-07-29).
- **Portal adoption: 0 external users ever.** All 12 auth users were staff or test accounts
  (growth-insights, 2026-07-24).

## Rejected / failed approaches

| Tried | What broke |
|---|---|
| Cold email to EU importers (ICP #2) | 916 sends, 0 conversations, so the verdict is "do not spend more" (acquisition-channels). |
| WhatsApp marketing templates sent cold | Meta error 131049 drops them for cold recipients, so WhatsApp is for warm follow-up only. |
| Free-quarter offer as the hook | "Free attracts takers, not buyers": Mohindra and Ratnamani went silent at the price. The cold engine also sent the KNL CFO a "₹0 this quarter" blast 11 days before the ₹96k quote (KNL brief §5), so campaign and deal state were not coupled. |
| Gating companies by product list or self-declared registry activity code | ICP over-inclusion: producers got filed as traders. A correct NACE code still gave 38.9% junk. Fix: gate on the company's own About page and the local manufacturing verb. |
| Quoting search-result snippets as evidence | The snippet is the meta description, so the "evidence" was page chrome rather than prose. Fix: match against rendered body text with `<head>` stripped, inside a single block element. |
| Wholesale quarantine of a source batch with more than 20% junk (as the spec said) | Overridden: with a full census, binning verified-good rows costs rows and gains nothing. Rows stay tagged `source=registry` so the strict reading is still available. |
| Launching 16 harvest agents in one wave | 8 were killed by the account session limit. Lane B was partial, and the killed agents' skip counts were lost. |
| Treating ELV (email verification) as ICP verification | ELV checks deliverability, not fit: 4 genuine of 56 "cbam_strong", about 30 mis-sends (acquisition doc, 2026-07-16 incident). |
| Using `leads.email_status='unsubscribed'` as the opt-out filter | Nothing ever writes that value, so unsubscribed prospects could still get operator follow-ups (review P0 #1). |
| Protecting quarantined leads by un-arming them only | The send worker never re-reads `scope_status`, so any path that re-arms a lead sends to it (review P0 #2, 2026-07-17 incident). |
| Using one secret as cron bearer, operator passphrase and query parameter | It leaks into logs and browser history, and it authorises all sending (review P1 #3). |
| Raw SMTP from a cloud agent session | Egress is blocked. The workaround was calling the production app over HTTPS (send-via-prod). |
| Hover-only action buttons in mobile UI | Invisible and unusable on touch devices (team-chat reaction fix). |
| Arming a second campaign batch | It silently re-stamps `settings.send_window` and defers the first batch. |

## Risks / landmines

1. **The unmerged security branch.** Main still has the unsubscribe-token bug (a compliance
   problem: opt-outs fail), `xlsx@0.18.5` (CVE-2023-30533, CVE-2024-22363) parsing files that
   operators upload, a cookie HMAC keyed by the login password, query-string secrets, a legacy
   emailer with no suppression or scope checks and with open tracking on, and a WhatsApp executor
   with no atomic claim and no cap enforcement. Do not port any send code from main without
   applying this branch's guards. Merging the branch now would conflict, since it is 83 commits
   behind.
2. **PII and secrets hygiene.** The KNL and send-the-4 branches contain named contacts, phone
   numbers, CRM UUIDs and a signature image (`docs/invoice/signatures/*.png`).
   `precursor-emissions` committed `.claude/settings.local.json`. The mill doc lists trigger IDs.
   None of this should move into sales-enabler.
3. **Data that lives only on branches.** The Lane N and B CSVs and reports are not in main, and
   their verifier scripts are not committed anywhere. Deleting the branches would leave the
   2026-08-03 import without its provenance.
4. **Rewritten history.** Three branches have no merge base with main. Comparing them with main
   by commit is meaningless; only file content can be compared.
5. **Scripts with no idempotency guard** (`send-via-prod.mjs`: "Run ONCE with --send"). They are a
   double-send risk if re-run.
6. **Doc numbers go stale.** The growth doc reports 2,491 in-scope active leads, against 4,148 in
   AGENT-CONTEXT. Several docs warn that their own numbers were not re-verified live.

## Azure dependencies

None. These branches use Vercel, Supabase, Neon MCP, Gmail/IMAP/SMTP mailboxes, the Meta WhatsApp
Cloud API, Python reportlab/openpyxl, and (in old Codex history) AWS SES and SpaceMail. The
reusable ideas carry over to Azure as follows:

- Send guardrails → ACS Email plus a Container Apps job.
- Invoice and workbook renderers → a Python Container Apps job.
- Data-hunt lanes → orchestrated Azure OpenAI agents.

## Recommendation for sales-enabler

1. **Make the guardrails from the 2026-07-23 review invariants of the new outbound engine from day
   one, and test them as such:**
   - every send path re-checks suppression and scope at send time, not only at enroll time;
   - there is one send path, with no legacy parallel engine;
   - claim rows atomically before any channel send;
   - daily and hourly caps are enforced with DB-side reservations;
   - unsubscribe tokens are parsed from the right and have tests;
   - secrets are compared in constant time, accepted only in headers, and kept separate per
     purpose;
   - the cookie signing key is not the password;
   - a send to a lead with emailed history blocks hard-delete.

   Port the four test suites (unsubscribe-token, render, template-engine, proposal-link) as the
   seed of the campaigns eval harness.
2. **Build the data-hunt method into the lead-generator module as a pipeline:** licence ledger,
   skip-list deduplication before any fetch, local manufacturing-verb pre-filter, evidence
   required in rendered body text, adversarial audit escalating to a census, quarantine with
   reason codes, and cross-lane deduplication at merge. Commit the verifier code this time.
3. **Productise the agent-written operating documents as agents of the company brain:**
   - a deal-brief agent: reconstruct the history from mail, CRM and calendar, map stakeholders,
     mark anything unverified;
   - a growth-analyst agent: run the funnel, list named leaks, record "honest corrections" and
     rank the plan;
   - a channel-ledger agent: per channel, its state, measured yield and verdict.

   Also couple campaign state to deal state, so a lead in active negotiation is never enrolled in
   a cold blast (the KNL incident).
4. **Generalise the invoice and workbook renderers for the ERP module:** a JSON schema, then
   HTML/PDF output and an xlsx for client data collection. Keep the DRAFT-on-`TO-CONFIRM` and
   signatory-gating patterns, and add Indian GST Rule 46 validation.
5. **Mobile UI rule:** no hover-only controls.
6. **Ignore** the 8 branches with no unique content, the MCP allowlist and permissions branches,
   and the AWS SES guide from the Codex era (not Azure).
7. **Tell the command_centre owner (outside this rebuild)** that the security sweep never merged
   and that the unsubscribe bug is live on main. This harvest made no changes to that repo.
