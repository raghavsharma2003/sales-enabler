# sales-enabler ("Relay") — live run, 2026-10-15

How this was run: `next dev` on 127.0.0.1:3000, Node 22.22, local SQLite (SQLITE_PATH in the scratchpad, no DATABASE_URL),
`AUTH_REQUIRE_EMAIL_VERIFICATION=true`, `AUTH_DEV_MAIL_OUTBOX` set, `INFERENCE_ALLOW_LOCAL=true`, `VOICE_PROVIDER=none`.
Azure OpenAI endpoint and key came from the scratchpad env. The only deployment that answers is `gpt-4.1-mini`
(gpt-4o-mini, gpt-5-mini, gpt-4.1 and gpt-5-chat all return 404). Everything was driven with Playwright (chromium 1194).
Fake tenant: "Kavach Steel Exports Pvt Ltd", an Indian HR-coil, TMT and aluminium exporter selling to the EU.

Screenshots are in `/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/shots/`. There are 86 PNGs:
`<view>-1440.png` and `<view>-390.png` for every view, `flow-*.png` for each flow step, and `report.json` with the load
time, HTTP errors and horizontal-overflow check for each view.

Side effect: `next dev` rewrites the tracked files `AGENTS.md` and `next-env.d.ts`. Both were restored with `git checkout`
after the run.

## Overall verdict

The app works much better than "basic/stale" suggests. Every flow I tried completed end-to-end against real Azure:
signup, email verification, company profile, CSV intake, brain extraction and approval, offering discovery, agent
build, release, public deployment, public text chat, and a campaign up to its launch gate. No view crashed and no API
call returned 5xx. No view has horizontal overflow at 390px.

The product is still the wrong shape for the command-centre vision:
- It is a "voice-agent studio plus governance ledger".
- There is no company/account entity in the CRM, no pipeline or deal object, and no ERP.
- There is no outbound telephony. Campaign channels are browser voice and email only.
- The UX has heavy copy, warns on every surface, and treats the operator as a compliance auditor rather than a seller.

The design system (indigo, Inter-like type, cards, left nav grouped into 6 areas) is clean and consistent but
generic SaaS. `/prototype` is a separate warmer concept (serif, dark-green sidebar, terracotta) with simulated data. It
is visually the most attractive surface in the repo.

## Flows exercised

| flow | result | notes / exact errors |
|---|---|---|
| Signup (`/`, register mode) | works | Redirects to `/account/security` because verification is required. Console shows two 401s on `/api/auth` before login (expected). |
| Email verification | works | "Send verification link" writes `outbox/auth-mail-<id>/message.json`. Opening the URL gives a "Verify email" button, then "Your email is verified". Verified login lands on Overview. |
| Company onboarding (#Company) | works | Saved revision 1. "Add to Company brain" creates a `platform:brain_source` **draft**, which never shows up anywhere obvious and is not counted as an approved source. |
| CSV upload (Company brain → Source intake → Customer tables) | works, clunky | Choosing a file does nothing until you click "Import table". **No heuristic auto-mapping**: a column literally named `Email` stays "Needs your choice". "Suggest mapping with AI" (gpt-4.1-mini, ~4.2s) mapped name/email/phone/stage correctly. Next steps: "Use these suggestions", then "Review mapped rows", then "Prepare valid new customers (4)", then "Apply reviewed batch". 4 customers were created and phones normalised to E.164. **The `Company`, `Country`, `Product` and `Annual tonnes` columns had nowhere to go.** The CRM has only person fields (name/email/phone/stage/notes/context), with no account or company and no custom fields. |
| CSV leaks into company knowledge | bug-ish | The imported customer table also appears in the "Company material" source list (`EU buyer leads Q4 · leads.csv`) and is auto-selected there, with an "Extract suggestions" button. Customer PII can be fed into company-knowledge extraction. |
| Brain fact add/review (paste text → extract → approve) | works | Import of pasted text took about 1s. Extraction (gpt-4.1-mini, about 1.3s server-side) proposed 1 Offering, 3 Company facts and 1 Contact ("review only"). You select checkboxes, then "Approve 4 selected", then "Usable company knowledge". UI bug: after clicking Extract, the panel stayed on "Starting…" until a reload or remount, although the job finished server-side (`ingestion_job completed`). The extraction summary is **lossy**: the MOQ numbers (500 t / 200 t) were summarised into "specified minimum orders". |
| Business model discovery | works, confusing | A **separate** "offering" concept. Ingestion-approved "Offering" items count as "0 approved" offerings here. Discovery over at most 3 sources took about 13s (589 in / 1,406 out tokens) and produced 3 offerings, 3 signals and 8 founder questions. Because of the lossy summary above, it asks for the MOQ that was in the original source. "Approve offering" stays disabled until open questions are cleared, but **deleting the questions text bypasses the gate**. |
| Agent create (#Agents) | works | The "Lead qualification" template prefills fields. 6 tabs (Setup / Conversation / Voice & language / Knowledge / Behaviour & actions / Publish). Knowledge is not attached by default (0 sources) until you tick checkboxes. Then: Save draft, "Run configuration checks" (4 static checks pass), "Review current evidence", "Publish this version". The release checks are config-only; "Conversation cases: none configured". |
| In-studio test call | blocked | "Choose a voice provider in the server configuration to enable browser conversations." There is **no text test inside Agent studio**, even though "Listen & type" exists; it still needs a voice provider. |
| Deployment (#Deployments) | works, long | It is a 3-step wizard plus an owner review. Step 1: name and channel (Web voice / Web chat / Telegram / WhatsApp). Step 2: tick public sources. Step 3: brand, allowed origins and **mandatory usage caps**. Then save the draft, tick an acknowledgement, and publish. Wizard state is lost if you navigate away before saving. |
| Chat test with agent (`/talk/<publicId>`, Web chat) | works | One call: `POST /api/public/agent/<id>/chat`, 200 in 3.2s, not streamed. The reply was grounded (38 days Mundra to Hamburg, verified emissions reports) but stilted: **"I'm an AI assistant for Kavach Steel. I am Kavach Steel's AI assistant."** The disclosure is duplicated because the AI intro and the model's own disclosure stack. The conversation did not appear in Conversations or Overview because it was not ended. |
| Campaign create (#Campaigns) | works up to gate | 6 stages: Intent → Audience → Agent & content → Review → Run → Results. It requires a business-model-approved offering. The audience is a checkbox list of contacts. The channel is Browser voice, Connected email or Manual email task. "Check launch readiness" gives "0 of 4 customers eligible — Browser voice consent has not been recorded as granted". This is correct gating, but there is no bulk consent import, and the CSV mapping has an "opt-out" field but no "consent granted" field. Run and Results were not reached. |

Azure usage over the whole run: 5,163 tokens across 4 text calls (AI mapping, extraction, discovery, chat).
Usage & services shows "Rates not configured" for cost.

## Per-view verdicts (all hash routes, account pages, talk, prototype)

Navigation is 6 areas (Overview, Company, Agents, Campaigns, Activity, Settings) containing 19 sections. Each view loads
in about 3.5–4.9s in dev (Turbopack, first compile excluded). On authenticated pages the only console error is a 404,
probably the favicon.

Two issues apply to every app view:
- **Sticky sidebar in full-page captures:** the sidebar stops at viewport height with a stray 1px indigo rule below it.
- **Mobile:** the Next dev-tools badge overlaps content. That is dev only.

| view (hash) | shows | works? | UX (harsh) | shots |
|---|---|---|---|---|
| Overview `#Command centre` | Continue-campaign hero, campaigns in progress, needs attention, recent agents/conversations, "Workspace journey" checklist | yes | Best screen in the app: clear next action. It is still a setup checklist, not a command centre: no metrics, pipeline, revenue or activity feed. | app-command-centre-1440/390 |
| Company `#Company` | Identity, description, operating prefs (IN / Asia/Kolkata / en,hi defaults), brand preview, "What the records show 0/5" | yes | Reasonable form. Too many disclaimers ("not treated as verified…", "does not fetch it"). The website is stored but never crawled. | app-company-*, flow-company-onboarded-1440 |
| Company brain `#Company brain` | Tabs: Business model / Source intake (Company material \| Customer tables) / Ask company brain (keyword search) | yes | The strongest backend idea (source-span evidence, human approval), but **two offering systems**, a lossy summary step, the CSV mixed into company sources, and nested tabs inside tabs. Ask-brain is keyword search only. | app-company-brain-*, flow-brain-*, flow-csv-* |
| Customers `#Customers` | Person list, record editor, per-channel permission + evidence, journey counts, memory proposals | yes | It is a contact card, not a CRM: no company/account, no deals, no activity timeline, no custom fields, no bulk actions. | app-customers-* |
| Integrations `#Integrations` | Catalog: Telegram, Gmail, Google Cal/Drive, M365 Mail/Cal/Drive, HubSpot, Slack, plus AI usage receipt | UI only | Every connector needs OAuth app setup ("Administrator setup required"). Nothing was connectable locally. Uppercase "SET UP" chips look off-system. | app-integrations-* |
| Agents `#Agents` | Agent studio editor (6 tabs) plus test-call side panel with "EmotionalOS / RelationalOS" inspector tabs | build: yes; test: blocked without voice provider | Dense. The right panel duplicates long consent copy. At 390px it is a 3,088px-tall scroll. Exposing internal jargon (EmotionalOS) to users is a smell. | app-agents-*, flow-agent-* |
| Test lab `#Test lab` | Configuration checks per version, text rehearsal against conversation cases | checks: yes | Checks are static lint (disclosure present, etc.), presented as "release proof". | app-test-lab-* |
| Releases `#Releases` | Release history / evidence review | yes | Duplicates the Publish tab in Agents. | app-releases-* |
| Deployments `#Deployments` | Registry plus 3-step wizard; public share URL and embed code | yes | Solid safety model (frozen snapshot, origins, caps). The wizard is long, and caps should have defaults. | app-deployments-*, flow-deploy-* |
| Campaigns `#Campaigns` | 6-stage stepper | yes up to launch gate | Linear, form-heavy. No audience segmentation or filters, no sequences, no A/B, no analytics before Results. Browser-voice campaigns make little sense for outbound. | app-campaigns-*, flow-campaign-* |
| Automations `#Automations` | Schedule reviewed campaign emails; worker status | UI yes, worker off | Mostly empty-state copy. | app-automations-* |
| Conversations `#Conversations` | Saved sessions list + search | yes (empty) | Empty; the public chat was not captured until the conversation is ended. | app-conversations-* |
| Inbox `#Inbox` | WhatsApp inbox | empty (no WhatsApp connection) | Placeholder. | app-inbox-* |
| Commitments `#Commitments` | Follow-ups with due dates | yes (empty) | Fine. | app-commitments-* |
| Quality `#Quality` | Evaluation lab: Audio proof / Listening comparisons / Transcript evaluations / Workspace coverage | UI yes; audio needs Speech | Built for an internal voice-quality team, not a customer. | app-quality-* |
| GroupAI `#GroupAI` | "Relationship spaces" | UI yes | Unclear purpose for a B2B seller; a Maya/companion holdover. | app-groupai-* |
| Team & access `#Team & access` | Roles owner/operator/viewer, invite link (no email sent) | yes | Clean. | app-team-and-access-* |
| Usage & services `#Usage & services` | Voice/AI allowances, token budget (5,163 / 100,000), background worker status | yes | Honest, useful for ops; too detailed for a business user. | app-usage-and-services-* |
| Account security `#Account security` and `/account/security` | Verification status, change password | yes | Fine. | app-account-security-*, account-security-* |
| `/account/forgot` `/account/reset` `/account/verify` | Recovery / reset / verify forms | yes (verify exercised end-to-end via outbox) | Minimal, fine. | account-forgot/reset/verify-* |
| `/join` | Invitation landing | yes (no token) | Fine. | join-* |
| `/` logged out | Split auth screen ("Relay", sculpture image) | yes | Attractive, but sells "representatives" and not the command-centre vision. | signup-*, post-signup-1440 |
| `/talk/<publicId>` | Public branded assistant, text chat | yes | Clean, Intercom-like. Not streamed, and has the duplicated disclosure line. | talk-*, talk-chat-1440 |
| `/prototype` | Concept "Northstar Abroad" sample workspace, simulated | static | Best visual direction in the repo (editorial serif, warm palette, KPI row). It is all fake data. | prototype-* |

## What to carry into the rebuild
- Keep: the evidence-span brain (source → passages → AI proposals → human approval), the AI column mapping, the deployment
  boundary model (frozen snapshot, origins, caps, public ID), auth with an ACS email outbox, the usage/admission ledger,
  and the `/prototype` visual language.
- Fix or redesign:
  - Add a real CRM model (accounts, contacts, deals, activities, custom fields).
  - Merge the two "offering" systems.
  - Keep extraction from losing numbers.
  - Separate customer tables from company material.
  - Add a text test inside the agent studio.
  - Add streaming chat.
  - Fix the duplicated disclosure.
  - Add outbound telephony.
  - Allow bulk consent import.
  - Cut 70% of the explanatory copy.
