# Must-be audit of the current tree (2026-10-24)

**Tree audited:** `87187d7e50987007173ea33159782e92c80490c7` ("CI: typecheck the web app too"), branch
`claude/serene-franklin-9w7f1v`, detached worktree `/dev/shm/wt-mustbe`.

While the audit ran, origin moved to `fc5cac5` (two commits: `6245d4e` analysis r6 outcome-first contract and `fc5cac5`
safety lint owns T-L6/T-L7). Those commits touch `shared/safety/*`, `agents/guard.ts`, `calls/analysis.ts`,
`voice/vpvoice/rules.py`, tests and the tool catalog. They change no status below. They were not re-audited line by line.

Paths are under `product/` unless they begin with `research/` or `context/`. Machine-readable copy: `audit.json`.

## Method

- **The list.** The 21 Kano must-be items (`research/2026-10-20/teardown/SYNTHESIS.md` §3) are judged against their
  sharpened forms in `research/2026-10-21/walkthroughs/SYNTHESIS.md` §5. The additions A-D and the AI-disclosure promotion
  come from `decision.2026-10-21.wt-synthesis-must-be-changes`. The 10 defining decisions are in `BLUEPRINT.md` §1.
- **Code.** Read only. Every claim cites `file:line`. "Built" means the behaviour runs end to end in code. A tool, a
  table or a switch whose effect nothing consumes counts as not built.
- **Tests.** Each cited test was opened and its assertions read. A test name alone was not taken as evidence. No test
  was run.
- **Screens.** The React screens in `web/src` were read. Screenshots in `web/shots/` are named, not opened. No browser
  was run.
- **Walkthroughs.**
  - Round 1: `research/2026-10-23/walkthrough/FRICTION.md`. It has no graph node of its own.
  - Round 2: `measure.2026-10-24.web-buyer-walkthrough-2` and `research/2026-10-24/walkthrough/FRICTION.md`.
  - Their open items were re-checked against the code.
- **Status rules.**
  - **done:** built, with a test that would fail without it.
  - **partial:** built in part. The table says what is missing.
  - **missing:** nothing a buyer can use exists.
  - **blocked:** the next step needs an owner decision, named by its node.

**Counts (26 items): done 5 · partial 12 · missing 5 · blocked on owner 4.**

## The table

| # | Item | Status | Evidence (code; test) | Gap | Lane |
|---|---|---|---|---|---|
| 1 | Test call from the builder: browser voice and text, no number, no KYC, docked | **done** | `calls/tools.ts:109-140` `test.browser_call`; `test-panel.tsx:40-47` inside the assistant dock (`operator.tsx:94`); `agents/index.ts:585` `test.simulate`. Tests: `tests/calls.test.ts:277`, `:322`; `agents-tools.test.ts:313`; flows `:256` (devsim only), `:237`, `:1134`. Shots: `agent-test-d/m`, `browser-call-live` | No typed chat where the buyer plays the caller; text testing is LLM practice callers only. The live browser-call flow skips in CI (no devsim). "Ring my phone" needs Plivo `systemCall`, which is not wired (`campaigns/telephony.ts:105`) | web, voice |
| 2 | List/CSV campaign with per-row variables | **partial** | `intake/sources.ts:23` (csv, tsv, pasted sheet), `:221-228` per-row verdicts; `mapping.ts:26-41`; `store.ts:66-73` dedupe; `campaigns/worker.ts:115-117` per-contact language, `:153-217` per-row facts. Tests: `intake.test.ts:121`, `:175`; `campaigns.test.ts:764`; `agents-languages.test.ts:142`; `agents-walkthrough-r2.test.ts:88`. Shots: `contacts-import-d/m` | No Excel ("save as CSV first", `contacts.tsx:143`); 900 KB web limit (`:127`). The web import never sends `agentId` to `source.map`, so the agent's column contract is not shown. No per-row voice or first-message override | intake, web |
| 3 | Recurring window with days, derived from the call category | **partial** | `campaigns/defaults.ts:19-30`; `campaigns/index.ts:231`; gate G6 `gate.ts:257`. Tests: `campaigns-units.test.ts:28`, `:39`, `:48`; `campaigns.test.ts:310`. Shots: `campaign-new-d/m` | The web form always sends 10:00-19:00 Mon-Sat (`campaigns.tsx:50`, `:62`), so the category default never applies from the UI. The risk is low because the UI window is never wider | web |
| 4 | Retries by outcome, on the campaign form | **partial** | `campaigns/defaults.ts:55-71` ladder; `campaigns/index.ts:734-770`; `calls/followups.ts:26-38`, `:57-58`. Tests: `campaigns.test.ts:467`; `calls.test.ts:620` | The ladder is one global constant, not on the form. The "Retry pattern" select (`campaigns.tsx:78`) changes nothing: the form always sends `budgets`, which `campaign.draft` reads first (`campaigns/index.ts:255`). The preset only sets attempt counts anyway. A stated callback time is never passed (`followups.ts:58`), so the call comes back after +2 h (`index.ts:165`) | campaigns (blocked), web |
| 5 | Inbound: number to agent, caller lookup | **missing** | Only the table `db/migrations/0004_calling.sql:121` (no tool writes it), read at `campaigns/gate.ts:370`. The runtime accepts `direction:'inbound'` (`voice/vpvoice/server.py:154`). No route receives a carrier's inbound call (`campaigns/index.ts:777-779` and `calls/index.ts:13-15` are the only hooks). No test | Everything: bind a number to an agent, an answer hook, caller lookup by E.164 with facts and memory, a Numbers screen | voice, campaigns (blocked) |
| 6 | Transfer to a human, warm context | **partial** | `voice/vpvoice/session.py:178-206`; `server.py:409-419` Plivo bridge; `calls/ingest.ts:206-210` writes a `hand_off` row `queued`; `calls.tsx:112`. Tests: `voice/tests/test_sim.py:190`, `:199`; flows `:1086` | **Queue and callback targets go nowhere:** no reader, screen, task or alert for the `queued` row. `warmSummary` (`shared/agent-config.ts:65`, toggle `agent-builder.tsx:208`) is never read by the runtime. The Plivo bridge has no test. No human alert in a crisis. The bridge line is Hindi only | voice, calls, safety, web |
| 7 | Voicemail / IVR detection, Indian operator announcements | **missing** | `voicemail` is only an end reason (`session.py:10`, `calls/taxonomy.ts:64`, `followups.ts:33`). Nothing produces it. `plivo_dial` (`transports.py:127-130`) asks for no machine detection. `sip_hangup` (`server.py:392-398`) never yields `switched_off`. No test | Machine and operator-announcement detection (Hindi/English "switched off / not reachable"), early exit, a ladder class | voice |
| 8 | DTMF | **missing** | `grep -ri dtmf product/` finds 0 matches | Send DTMF (IVR navigation, "press 1") and receive it | voice |
| 9 | Knowledge base | **partial** | `workspace/knowledge.ts:1-40` (text, PDF, DOCX to spans); `workspace/offering.ts` (facts from approved spans, never-say). Tests: `workspace-knowledge.test.ts:15`, `:50`, `:88`. Shots: `settings-knowledge-d/m` | **Nothing carries knowledge or offering facts to an agent or a call.** No agent references an offering, `compile()` never reads them, and `kb_query` is inert. The compile error even says "move long facts to knowledge" (`agents/compile.ts:32`) | agents, workspace |
| 10 | HTTP tools in-call | **missing** | `agents/index.ts:153-156` grantable names, `:532-553` `tool.attach`. `voice/vpvoice/conversation.py:445-449` only emits `status:'requested'`; `calls/ingest.ts:201-204` stores it. Switches: `web/src/catalog.ts:39-46`, `agent-builder.tsx:233-235`. Test `agents-tools.test.ts:277` covers the grant only | No tool definition (URL, auth, schema, timeout), no execution, no result returned to her. "Look up an order", "Book a slot", "Send a link on WhatsApp" and "Note a callback time" are switches that do nothing. That is the fault `rejected.2026-10-24.tools-tab-endcall-transfer-switches` rejected | voice, agents |
| 11 | Post-call judge, typed extraction, visible editable defaults | **partial** | `calls/analysis.ts:1-7`, `:326` judge versions, `:431` summary; `calls/tools.ts:311` `outcome.define`, `:379` `judge.edit`, `:392` `judge.calibrate`. Tests: `calls.test.ts:205`, `:404`; `calls-analysis-tier.test.ts:117`. Shots: `call-d/m`, `insights-d/m` | No screen shows or edits the outcome or the judge (the web reads only `analysis.settings.get`, `settings.tsx:154`). No sentiment. No buyer-defined typed fields (amount, date, reason) | calls, web |
| 12 | Post-call webhook, full record, signed | **partial** | `workspace/webhooks.ts:136-147` create (signed), `:103` delivery with retries, `:197-208` `webhook.emit`; timer `workspace/index.ts:110`. Tests: `workspace-integrations.test.ts:81`, `:153` | **No module calls `webhook.emit`; only tests do.** No `call.ended` payload is defined. No webhook screen in Settings (`settings.tsx:18`). Integrations (`integrations.ts:14-23`) are stored, but `integrationSecrets` has no caller | workspace, calls |
| 13 | Call log: recording, transcript, cost, reason, latency, version | **partial** | `calls.tsx:30-33` (outcome, reason, cost); `call-review.tsx:11-27` reply timing; server joins agent and version (`calls/tools.ts:30-33`, `:201`, `:250`). Tests: `calls-log-agent.test.ts:24`; `calls-live.test.ts:178`; flows `:1107`, `:920`, `:961`. Shots: `calls-d/m`, `call-d/m` | The web ignores the version the server sends (`types.ts:71` has no `agent`; list and call page omit it). No per-call latency column in the list | web |
| 14 | Export with extracted fields | **missing** | Only `contact.export` (`intake/contacts.ts:325-345`: phone, name, language, imported attributes) and `report.create` (`calls/tools.ts:459-484`, counts only). Test `intake.test.ts:476` covers contacts. Shots: `contacts-export-d/m` (contacts) | A per-call export with outcome and grade, reason, extracted fields, cost, version and recording link | calls, web |
| 15 | Agent versions and publish, with a diff; version in the call log | **partial** | `agents/index.ts:607` `version.publish` (A2, bound to the draft hash); the card names stack, practice result and field changes. Tests: `agents-tools.test.ts:194`; `agents-walkthrough-r2.test.ts:104`; `agents-restore.test.ts:42`; `describe-labels.test.ts:63`. Shots: `approval-d/m`, `agent-builder-d/m` | Version not shown in the web call log (the same fix as 13) | web |
| 16 | Indian CLI path, KYC, time and price stated first | **blocked** | `campaigns/telephony.ts:20-26` series router; `:75-107` Plivo: search and rent wired; KYC, BYO and system call throw "not wired". `campaigns/index.ts:613-624` A2P declare, `:629` export. Tests: `campaigns.test.ts:222`, `:626`, `:718`, `:750`. Shots: `numbers-d/m` | KYC adapter, BYO and dial path wait for the owner's "go" (DIRECTION open threads; `decision.2026-10-23.autonomy-scope`); KC5 (`open.2026-10-21.blueprint-owner-decisions`). `open.2026-10-24.numbers-kyc-before-search` is still open | campaigns |
| 17 | Hindi/Hinglish plus major Indic: Hinglish mode, voices by language with counts | **partial** | `shared/agent-config.ts:25` (12 languages incl. `hinglish`); `shared/stacks.ts:174-197` per-part matrix; `agents/index.ts:143`; `campaigns/languages.ts:32-41`. Tests: `agents-languages.test.ts:33`, `:88`, `:117`, `:142` | The web never shows a stack's languages and filters only by kind (`stack-picker.tsx:68`, `:98`). **The runtime's fixed lines are Hindi on every agent:** bridge, limit and take-over (`session.py:15-26`), silence (`cascade.py:559`). Seven new lexicons not native-reviewed (owner) | voice, web |
| 18 | Suppression/DNC on every outbound path; in-call opt-out on | **done** | `campaigns/gate.ts:2` (one gate for every path), `:199-216` G3/G4; `intake/contacts.ts:207`. Tests: `campaigns.test.ts:300`, `:167`; `intake.test.ts:242`, `:283`; `campaigns-review.test.ts:176`; `calls.test.ts:388`; `safety-optout-e2e.test.ts:162`; `voice/tests/test_sim.py:184`; flows `:612`, `:156`. Shots: `contact-suppressed-d/m`, `call-optout-d/m` | Real NCPR lookup is a stand-in (`open.2026-10-22.dnd-provider`). The e2e opt-out test skips without the voice Python packages | intake |
| 19 | INR billing with GST (UPI); pulse ≤ 30 s, stated | **blocked** | `money/money.ts:14` GST 18%, `:215` "usage statement, not a tax invoice"; `money/prices.ts:63-64` Plivo 60 s pulse; `money/gateway.ts:1-3` real gateway off. Tests: `money.test.ts:308`, `:222`, `:296`; `money-wallet.test.ts:69`, `:76`; flows `:1051`. Shots: `settings-billing-d/m` | Customer price, tax invoice, GSTIN, receipts, a live UPI gateway and the trial credit. Nodes: `decision.2026-10-21.pricing-deferred`, `open.2026-10-20.reprice-tiers`, `open.2026-10-24.enterprise-billing-documents`, `open.2026-10-22.trial-credit-amount`, `open.2026-10-24.test-spend-vs-empty-wallet`. The only wired carrier pulses at 60 s | money |
| 20 | Team roles, fixed, on every plan | **done** | `workspace/members.ts:68`; five fixed roles, no plan gating; role checks in `server/tools.ts`. Tests: `workspace-team.test.ts:73`, `:90`, `:107`; `kernel.test.ts:118`; `web.test.ts:56`; flows `:1153`. Shots: `settings-team-d/m` | No SSO or SCIM (enterprise lane, outside this item) | enterprise |
| 21 | India data residency (architecture and contract) | **blocked** | Each part states where audio is processed (`shared/components.ts:18`); `ops/STAGING.md:36` centralindia; Azure ears in India | **The default stack's brain and voice are Gemini, processed globally** (`directive.2026-10-22.processing-anywhere`), so "India call path by default" is false. The BFSI terms are unwritten. Nodes: `open.2026-10-17.kc6-vs-kc10`, counsel KC8 | voice, enterprise |
| A | Price and India-measured latency at every stack choice; all-in ₹/min | **blocked** | `agents/index.ts:486` `stack.list` priced by `money.estimate`; parts in ₹ (`money.parts`); `shared/stacks.ts:32`, `:44-97` reply gap with grade and source; `stack-picker.tsx:123`, `:186`, `:202`. Tests: `agents-tools.test.ts:146`; `money-parts.test.ts:39`, `:64`, `:75`; `shared.test.ts:93`; flows `:310`, `:443`. Shots: `agent-stack-d/m` | The mechanics are done. The headline is "Provider cost per minute", not the buyer's price (`decision.2026-10-21.pricing-deferred`). Figures are server-side, not at the handset | money |
| B | Contacts: E.164, DND status, attempt history, memory slot | **done** | `shared/phone.ts`; `intake/contacts.ts:110-132`, `:239`; `contacts.tsx:183-201`. Tests: `shared.test.ts:8-27`; `intake.test.ts:402`; `e2e.test.ts:321`, `:556`; flows `:612`, `:1074`, `:887`. Shots: `contact-d/m`, `contacts-d/m` | Real DND provider (`open.2026-10-22.dnd-provider`) | intake |
| C | Bounded call and spend defaults | **partial** | `agents/templates.ts:27` (300 s, 10 s silence, 40 turns); `session.py:92`; `cascade.py:556-560`; `server/ledger.ts:46-55` workspace, campaign and API-key caps; `workspace/apikeys.ts:23` (₹2,000 a day per key); launch needs a cap; review stop after 20 dials (`campaigns/defaults.ts:101`). Tests: `voice/tests/test_sim.py:218`, `:224`; `money.test.ts:108`; `workspace-review.test.ts:40`; `campaigns.test.ts:557`. Shots: `campaign-cap-d/m` | The silence hang-up has no test, does not exist on the speech-to-speech path (`s2s.py`), and says goodbye in Hindi only. No default workspace cap (only the wallet bounds spend). "Burst opt-in" is not modelled | voice, money |
| D | State integrity | **partial** | `ui.tsx:14-18`: a disabled button must give a reason (type-checked). `web.test.ts:128` "no page writes from a menu". `agent-builder.tsx:31-41`, `:65`, `:74-75` unsaved marker and guard. `ui.tsx:182-189` loading, failed, empty and missing states. Flows `:722`, `:429`, `:371` | The fix link is optional and used 4 times. In-app navigation away from an unsaved draft is not guarded (`beforeunload` only). **Four controls show something that does not run:** the tool switches (10), "Retry pattern" (4), "Give a one-line summary first" (6), and integrations shown as connected (12) | web |
| E | AI disclosure on every creation path | **done** | `agents/guard.ts:62` on every draft write (`agents/index.ts:40`, `:430`, `:663`, `:754`, `:808`; `draft.ts:55`); `shared/safety/disclosure.ts`; RD1 door on the opening. Tests: `agents-guard.test.ts:59`, `:82`; `safety-disclosure.test.ts:41`; `safety.test.ts:85`; `voice/tests/test_disclosure.py:44`, `:80`; `agents-restore.test.ts:83`; `learning.test.ts:641`; `measure.2026-10-24.staging-openings-e9fdde3` (6/6). Shots: `call-d/m`, `settings-compliance-d/m` | Disclosure lines in kn, te, ml, mr, gu, pa and or need native review (owner) | safety |

## Gaps ranked by what an Indian enterprise buyer hits first in a trial

The ranking follows a trial as a medium-to-large buyer runs it:
1. Their IT team asks how results reach the CRM.
2. The builder wires the business's facts and systems into the agent.
3. They get a line and money onto it.
4. Live calls meet voicemail, transfers and inbound.
5. Finance asks for an invoice.

Severity breaks ties.

| Rank | Gap | Items | Lane |
|---|---|---|---|
| 1 | Results never leave Vyakti: no webhook fires, integrations are inert, there is no call export | 12, 14 | workspace, calls |
| 2 | No real line and no money on it: KYC, BYO and system calls not wired; nothing stated before search; the wallet cannot be funded | 16, 19 | campaigns, money (blocked on owner) |
| 3 | In-call tools are switches that do nothing; no HTTP tool | 10 | voice, agents |
| 4 | Knowledge and offerings never reach a call | 9 | agents |
| 5 | Voicemail, IVR and operator announcements are not detected | 7 | voice |
| 6 | Hand-offs dead-end: queue and callback targets go nowhere, the warm summary is unspoken, a crisis alerts no one | 6 | voice, calls, safety, web |
| 7 | The judge and extraction cannot be seen or edited; no typed fields, no sentiment | 11 | calls, web |
| 8 | Inbound does not exist | 5 | voice, campaigns |
| 9 | Import: no Excel, the agent's column contract is not shown, no per-row voice or first message | 2 | intake, web |
| 10 | Hindi-only fixed lines on every agent; no language shown or filtered on stacks | 17 | voice, web |
| 11 | DTMF | 8 | voice |
| 12 | Price, GST tax invoice, GSTIN; a 60 s pulse on the only carrier | A, 19 | money (blocked on owner) |
| 13 | Residency: the default stack is processed outside India | 21 | voice, enterprise (blocked on owner) |
| 14 | Retries: an inert form select, a fixed ladder, a stated callback time lost | 4 | campaigns, web |
| 15 | The call log hides the version and per-call latency | 13, 15 | web |
| 16 | State-integrity leftovers: optional fix links, unguarded in-app navigation | D | web |
| 17 | Bounded-default leftovers: no silence test or speech-to-speech silence, no default workspace cap, no burst | C | voice, money |
| 18 | The campaign form ignores the category's window | 3 | web |
| 19 | No typed text test chat | 1 | web |

### Briefs for the top 10

1. **Results out (workspace + calls).**
   - **Emit events.** Calls emits `call.ended` through `webhook.emit` after analysis settles (`calls/analysis.ts`, next to `afterCall`). Also emit `campaign.state_changed`, `contact.opted_out` and `hand_off.created`.
   - **Payload.** Define one versioned full record: ids, contact E.164 (masked per role), campaign, agent and version, outcome and grade, reason code and label, transcript, extracted fields, cost lines, duration, a signed recording link and the run manifest.
   - **Settings screen.** Add a Webhooks tab: create (secret shown once), send a test event, deliveries, replay.
   - **Export.** Add `call.export` (policy, approved like `contact.export`) that streams a CSV of the calls-list filter.
   - **Integrations.** Either wire at least one integration (Google Sheets append, or custom HTTP) through `integrationSecrets`, or label integrations "stored, not used yet".
   - **Tests:** a call that ends produces exactly one signed delivery; a test call produces none; another workspace's endpoint never receives it; the export escapes formulas and leaves out suppressed and erased people.

2. **A real line with money on it (campaigns + money; blocked on owner).**
   - **Owner decisions:** the campaigns "go" (Plivo KYC adapter and dial path), the trial credit (`open.2026-10-22.trial-credit-amount`), and a live gateway (Razorpay, UPI).
   - **Buildable now:**
     - `number.search` returns, per series, the KYC checklist, typical time and monthly price, even with telephony off (`open.2026-10-24.numbers-kyc-before-search`, `campaigns/index.ts:523`).
     - `PlivoTelephony.systemCall` (`telephony.ts:105`), so "ring my phone" verification works the moment keys exist.
     - A decision on what test spend draws on (`open.2026-10-24.test-spend-vs-empty-wallet`), stated on Today and Billing.

3. **In-call tools that work (voice + agents).**
   - **Now (web):** label the four inert switches "Not available yet" (`catalog.ts:39-46`, `agent-builder.tsx:233-235`) until each runs.
   - **Define a tool:** a workspace `tool` row with name, input schema, URL, method, the integration that holds its secret, a timeout of 2.5 s or less and a risk class.
   - **Voice runtime:** run `requested` tools with a pre-rendered hold line. Return the result as data to the brain, with numbers in it checked by the reply door ("numbers only from data"). On a failure she says a graceful line, and the call is not billed for the tool's time.
   - **Built-ins:** `mark_callback` sets a stated callback time that feeds the ladder (item 4). `send_whatsapp_link` and `send_sms` go through the dial gate's consent and DLT checks.
   - **Tests:** an attached `lookup_order` against a local HTTP stub changes what she says; a timeout gives the hold line; a granted tool is never called unless a turn requests it.

4. **Knowledge on calls (agents).**
   - **Config.** Add `offeringIds` (or `knowledge: { offeringId, purposes }`) to `AgentConfig`.
   - **Compile.** `compile()` pulls approved offering facts into the facts section by purpose. The T-L3 fence still drops offers from service calls, and the budget still throws.
   - **Never-say.** Make the offering's never-say part of the agent's never-say at the door.
   - **Error text.** Fix the "move long facts to knowledge" error: either make that true, or say "shorten".
   - **`kb_query`.** Make it a real in-call tool (span retrieval returning quoted spans), or remove it from `IN_CALL_TOOLS`.
   - **Test:** an approved span's fact appears in the compiled brief of a linked agent and never in a service brief when its purpose is `offer`.

5. **Voicemail and announcements (voice).**
   - **Plivo.** Turn on Plivo machine detection on `plivo_dial`, and map `HangupCause` to `switched_off` and `voicemail`.
   - **Announcement detector.** On the first caller audio, before her opening, run a lexicon of Indian operator announcements: Hindi and English "switched off", "not reachable", "busy on another call", "does not exist". It ends the call as `voicemail` or `switched_off` with no opening spoken and no analysis model run.
   - **Ladder.** Feed `followups.retryClass`.
   - **Tests:** canned announcement transcripts end the call before any agent turn; a real "hello" does not.

6. **Hand-offs that land (voice + calls + safety + web).**
   - **Queue.** Add `handoff.list` and `handoff.claim` over the `hand_off` rows. Show a Hand-offs queue (Today card and page) with the warm brief, and send a webhook and email or Slack notification.
   - **Callbacks.** A `callback` target creates a due callback task with the time the caller stated.
   - **Warm summary.** The runtime honours `warmSummary` by whispering `summary_line()` to the bridged leg before connecting (Plivo `Dial` with a `confirmSound` or `play` URL).
   - **Crisis.** A crisis hand-off raises an alert to on-duty members within 5 s.
   - **Language.** Bridge lines come in the agent's language.
   - **Tests:** a Plivo-bridge unit test with a fake `plivo_request`; a queued hand-off appears in the queue; a crisis hand-off notifies.

7. **Judges a buyer can see (calls + web).**
   - **Screen.** Add an "Outcomes and checks" section on the agent (or in Settings) showing the outcome definition and its allowed and goal values, the judge's instructions, model and calibration status, editable through `outcome.define` and `judge.edit` (draft, audited).
   - **Fields.** Add typed extraction fields to the outcome definition (`fields: [{key, type: text|number|date|enum, values?}]`), validated in code, with each value quoted from a caller span or left empty.
   - **Sentiment.** Add a sentiment field as a coded scale with a quote.
   - **Tests:** an extracted field without a verifiable quote is dropped and counted; the web shows "uncalibrated" until calibration passes.

8. **Inbound (voice + campaigns).**
   - **Bind.** Add `inbound.route.set` (policy): bind a workspace number to a published agent version and a deployment.
   - **Answer.** Add `POST /hooks/telephony/inbound` (signed). It looks up the caller by E.164 (contact, suppression, memory brief), mints a ticket with `direction:'inbound'` and `consent.basis:'inbound'`, and returns the runtime's stream URL.
   - **Screen.** Show the binding on Numbers.
   - **Tests:** an inbound call from a known contact gets that contact's facts; an erased number gets no memory; another workspace's number is refused.
   - **Ownership.** The Plivo number side waits on the campaigns "go"; the routing can be built against `FakeTelephony` now.

9. **Import a buyer's real file (intake + web).**
   - **Excel.** Accept `.xlsx`, parsed server-side (first sheet, header row), raising the web limit to the 20 MB the upload route already allows (`intake.test.ts:492`).
   - **Agent contract.** Pass `agentId` from the import screen (an optional "Which agent will call them?") so `source.map` lists unmatched per-contact facts before saving.
   - **Overrides.** Add per-row `voice` and `first_message` attributes the ticket honours inside the brief's rules.
   - **Tests:** an xlsx with Devanagari digits imports like its CSV.

10. **Her fixed lines in the agent's language (voice + web).**
    - **Runtime lines.** Move the bridge, limit, take-over and silence lines into the per-language disclosure and crisis tables in `shared/safety`, rendered for `languages.primary`. These are code lines, not brief text, so recitation does not apply.
    - **Stack cards.** Show the languages that `stack.list` already returns (`agents/index.ts:143`), with measured and stated grades, and add a language filter with counts.
    - **Tests:** a Tamil-English agent's hand-off line is not Devanagari; the picker filters to stacks that speak a chosen language.

## Defining decisions the tree contradicts

| Decision | What the tree does instead | Evidence |
|---|---|---|
| **4.** Speed and turn-taking are one gate; the default is the best by ear among stacks that pass | A provisional default (`v2-flashlite`, p50 2.30 s on staging; cut-ins 15-42% on every stack) and five stacks marked `available` run production campaigns. No stack passes ≤ 1.5 s and ≤ 5%, the gate is not in code (G10 refuses only `beta`), and no human round 2 has run. The owner sanctioned it as provisional (`decision.2026-10-22.default-stack`), but it is still the opposite of the decision | `shared/stacks.ts:62-92`, `:103`; `campaigns/gate.ts:344` |
| **7.** Results are earned from systems of record, including sources that need no developer | `outcome.record_verified` has no caller (`calls/tools.ts:357`). Integrations are stored and never read. There is no upload of a paid list, an MIS file or a Sheet column. Every outcome is an AI guess or a manager's label | `workspace/integrations.ts:27` (no caller) |
| **1.** One spec generates the API, SDK, MCP and the Operator's tools | There is an HTTP tool endpoint and a generated catalog (`scripts/tool-catalog.ts`). There is no MCP server and no SDK; MCP appears only in comments (`server/tools.ts:1`). The in-call "tools" sit outside the registry and do nothing | — |
| **5.** Every call shows why it was allowed | The gate trace is stored on `attempt.precheck` and shown on the contact's attempt list (`contacts.tsx:201`). It is not on the call page, in `call.get` or in `call.explain` | `calls/tools.ts:257-283` |
| **9.** A catastrophic line is caught around calls 13-15, and the script is slowed to 25% | The live fast lane is a rate monitor: early hang-ups above 35% over a 50-call window, at least 20 calls (`calls/analysis.ts:473`). There is no per-moment detection, and nothing throttles a script. Only experiment arms have a harm stop (`learning/index.ts:536`) | — |
| **10.** One honest price per connected second | The price is not set (owner). The only wired carrier path has a 60 s pulse, and the estimate adds half a pulse per call, against the ≤ 30 s rule for recommended paths | `money/prices.ts:63-64`, `:110` |
| Principle **P7**: what you see is what runs | Four inert tool switches, the "Retry pattern" select, the warm-summary toggle, and integrations shown as connected | Items 4, 6, 10, 12 |

Consistent with the tree: decision 2 (speech-to-speech stays `beta`), 3 (opening spec, measured 6/6), 6 (blocked, not
contradicted) and 8 (quoted, permissioned memory).

## Also hit in a trial, outside the 26

- **Reply gap and cut-ins** (voice). Staging p50 is 2.05-2.30 s, and every stack cuts in on 15-42% of turns. A buyer hears
  this on the first browser call.
- **No SSO, SCIM or audit export** (enterprise). `grep -i 'saml|oidc|sso|scim'` finds nothing in `server/`, `shared/` or `web/src`. The
  activity ledger and the hash-chained audit exist (`kernel.test.ts:38`), but they cannot be exported. The lane is in flight.
- **Fixed lines in other paths** (voice). A crisis alert that reaches no person is folded into gap 6.

## What I could not verify

- **No test was run, and no CI log was read.** Statuses rest on reading code and test assertions.
- **The voice-runtime e2e tests probably skip in CI.** These are `safety-optout-e2e.test.ts`, `calls-live.test.ts`, the
  browser-call flow (`flows.test.mjs:256`) and the devsim call-page flow (`:997`). They skip without a Python that has
  `aiohttp` and `numpy`, and neither the `control-plane` job nor the `web-e2e` job in `.github/workflows/product.yml`
  installs them (see also `rejected.2026-10-23.e2e-verified-with-devsim-only`). Items 1, 13 and 18 lean on these tests
  for their end-to-end proof. Their unit-level tests do run in CI.
- **Screenshots were named from the file list, not opened**, so whether each shows the current screen was not checked.
- **Nothing real was exercised:** no voice heard, no carrier call, no machine detection, no DND answer, no payment.
  Everything here is code and test reading.
- **Two claims are only partly verified:**
  - That a memory fact "can be played" (decision 8).
  - Whether `s2s.py` has any other silence ending. I searched for `silence_s`, `maxSilence` and `silence_timeout` and
    found none.
- **The two commits after `87187d7`** (`6245d4e`, `fc5cac5`) were read only as a diff stat.
