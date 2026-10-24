# Buyer walkthrough, round 2: friction log (2026-10-24)

**Method.** Two buyers each took a new workspace from nothing to a campaign that is ready to launch. This ran on the dev server
(`product/web/dev/serve.ts`) with real tools and a fresh Postgres 16. The voice runtime ran on fake providers (devsim) and
Chromium supplied a fake microphone, so the browser test call ran end to end. The assistant's model was the scripted stand-in.
- **NBFC collections** (Deccan Fincorp, EMI reminders for two-wheeler loans, *EMI pre-due reminder* template), walked on desktop
  at 1440 px: `shots/nbfc-d/`.
- **Hospital chain** (Nirmal Hospitals, OPD appointment confirmations, *Clinic appointment confirmation* template), walked on a
  phone at 390 px: `shots/hospital-m/`.
- **Review** (the seeded workspace): Today, calls, three call pages, campaigns, agents, Insights, contacts, audiences, numbers,
  all eleven Settings tabs and Activity, plus the assistant asked for real tasks, at both widths: `shots/review-d/`,
  `shots/review-m/`.
- **Driver and log.** The driver is `walk.mjs`. `log.json` records every step with its timing, error and any horizontal scroll.
  Paths below are relative to `shots/`.

**Results.**
- 136 steps ran and 7 failed.
  - Three of the failures are NBFC-desktop selector errors in the walk script: 31 (cap), 34 (numbers) and 39 (approval). The
    script was fixed, and the hospital walk passed those steps.
  - Two are the call page's Play button, which never appears because no seeded call has a recording.
  - Two are the review's approval step, because the scripted assistant answered with a plan card and no Review button.
- 0 screens scrolled sideways.
- Every screenshot was opened and looked at. The tall pages (the stack page, the job tab, Insights) were cropped and read in
  parts.
- The judging bar is the competitor teardown's must-be list (`research/2026-10-21/walkthroughs/SYNTHESIS.md` §5): A (price and
  latency at every stack choice), B (contacts, DND, attempts), C (bounded defaults), D (state integrity), plus the sharpened items.

**Not walked, and why.**
- **The assistant doing real work.** Every chat reply on the dev server is scripted. Examples:
  - "Top up 5000" becomes a ₹500 card.
  - "What is stopping this campaign?" gets the stock greeting.
  - The plan creates a "Pune renewals" audience in an NBFC workspace.

  So the Operator's judgement cannot be judged here. Its cards, approvals and receipts can. The real-model Operator bench
  (round 2, 48 tasks) is the evidence for its quality.
- **Hearing her.** The browser call connects, shows captions from both sides, hangs up and files a test call. Devsim speaks
  canned lines, so the voice itself is not heard.
- **Practice callers.** They show "0 of 6 passed" on the stand-in model (`nbfc-d/18-practice-run.png`), as in round 1. This is
  dev only.
- **Recording playback.** No seeded call has a recording. The browser flow `Call page: with a recording…` covers it.
- **Renting a number and a real DND answer.** Telephony is off on the dev server, and the DND provider is a stand-in.

Severity: **blocks** = the buyer cannot finish or does the wrong thing; **slows** = finishes with effort or doubt; **polish** =
reads wrong or rough.

## Fixed in this pass (web)

Each fix has a browser flow in `product/web/e2e/flows.test.mjs` (section "Second buyer walkthrough") or a unit test in
`product/tests/web-walkthrough2.test.ts`. All 12 new flows were run against the old build first and all 12 failed. After the
fixes they pass.

| # | Sev | Friction | Evidence | Fix |
|---|---|---|---|---|
| W1 | blocks | **Billing shows ₹0.00 on every line under a non-zero total** (seeded workspace: ₹10.92 total, telephony line ₹0.00). The page read `inrMilli`, but `invoice.get` sends `costInrMilli`. A buyer reconciling spend sees numbers that do not add up. | `nbfc-d/35-billing.png`, `review-d/18-settings-billing.png` | Lines read `costInrMilli`. A "By campaign" list links each campaign. Flow: *Billing: each line is the server's own figure, and the lines add up to the total*. |
| W2 | blocks | **Number search shows a server instruction**: "telephony provider is not enabled (search); set VP_TELEPHONY_LIVE=1 with credentials on the server". | `hospital-m/34-numbers-search.png` | `plainReason()` (labels.ts) turns a refusal that names an environment variable into what it means for the buyer. This applies to every tool refusal (`run` and `act`). Flow *Numbers: …* and unit test. The server copy is R1. |
| W3 | slows | **The agent tab strip cuts the fourth tab on phone ("Objec") with no sign that it scrolls** (round 1's leftover). On desktop beside the assistant the same strip wraps "Versions" onto a second row, and so do Settings' tabs. | `hospital-m/07-agent-created.png`, `nbfc-d/07-agent-created.png`, `review-m/14-settings-team.png` | `Tabs` is one row everywhere. When tabs are hidden, that side fades and gets an arrow button ("More builder sections"). The chosen tab is scrolled into view, and arrow keys move focus. Desktop tab padding is 12 px, so all seven agent tabs fit at 1440. Flow *Tabs: …*. |
| W4 | slows | **Tools tab: "End the call herself" and "Connect to a person" are switches that read OFF on the EMI template, but they do nothing.** The runtime always lets her end after a real goodbye (`compile.ts` markerRules, `vpvoice/conversation.py:447`). Hand-off follows the hand-off tab's situations. A buyer reads "she cannot hang up" against must-be C. | `nbfc-d/11-agent-tools.png` | The two rows state what is true: "Always on" for ending the call, and "On: hands over to the collections-desk queue in N situations" for hand-off, with a link to change it. Only the real abilities stay as switches. Flow *Agent tools: …*. |
| W5 | slows | **Goals and fact values are one-line fields that cut the text off.** Examples: "take payment on the call, change the amount, waive charges, discuss the loan w…", and on phone "the appointment is confirmed, or mc". Purpose shows raw codes ("identity", "service"). | `nbfc-d/09-agent-job.png`, `hospital-m/09-agent-job.png` | Text boxes that grow with the text (`field-sizing: content`). Purposes read Service / Offer / Identity / Logistics. Flow *Agent job: …*. |
| W6 | slows | **The calls list on phone drops "Why it ended" and the cost**, the two columns must-be 13 asks for. The list has no campaign column and filters only by name. | `review-m/02-calls.png`, `review-d/02-calls.png` | Both columns show on phone. A Campaign column and a "Why it ended" filter were added, and the call page header names and links the campaign. Flow *Calls: …*. |
| W7 | slows | **The campaign page never says which agent or which list it calls.** "Version: Calling rules, version 1" reads like the agent's version. | `nbfc-d/30-campaign-draft.png`, `review-d/07-campaign.png` | "Agent: EMI reminders…, version 1" and "Who to call: …" rows, each a link; the policy row reads "Calling rules: Version 1". Flow *Campaign page: …*. |
| W8 | slows | **"Hear her now" lands below six practice-caller chips. On phone, the call's Hang up button sits under the fold while she talks.** The panel and the assistant's "Seeing" chip call an unpublished agent "v0". | `hospital-m/19-browser-call.png`, `nbfc-d/19-browser-call.png` | "Hear her yourself" comes first. A live call scrolls itself into view. An unpublished agent reads "Saved draft · not published". Flow *Test panel: …*. |
| W9 | slows | **The stack page is 9,771 px tall on a phone** because "Build your own" lists all 25 parts open. | `hospital-m/15-stack.png` | "Build your own" is a disclosure ("Show the parts"). It is open when the agent already runs its own parts. The seeded EMI agent's stack page is now 6,410 px on a phone. Flow *Voice stack: "Build your own" is closed until wanted…*. The five existing build flows open it as a person would. |
| W10 | slows | **The contact's DND card contradicts itself**: "Status: DND not checked" next to "Check: Recent enough for promotional calls". List columns show as raw keys ("emi amount", "due date"). | `nbfc-d/28-contact-dnd.png` | A number with no answer reads "Last tried … / Answer: The register gave no answer" (or "Never looked up"). Detail labels are capitalised. Flow *Contact: …*. |
| W11 | polish | **The approval sheet says "Asked by Vyakti"** when the buyer pressed Publish or Add money themselves. | `nbfc-d/21-publish-sheet.png`, `hospital-m/40-approval-from-today.png` | Reads "You asked for this" for the person's own actions, and "Waiting for approval" for queued ones. The server does not send the requester yet (R7). Flow *Approval sheet: …*. |
| W12 | polish | **Today on a brand-new workspace says "Since you left: Vyakti did 1 thing"**, and later "Vyakti did 20 things", which were all the buyer's own actions. "Needs you: 3 waiting" shows one item, because three identical top-ups were grouped with no count. | `nbfc-d/02-today-first-run.png`, `nbfc-d/40-today-after.png` | No "Since you left" before anything has happened. Later it reads "20 changes in this workspace: … See who did what". Grouped requests say "Asked 3 times. Approving one does not approve the others." |
| W13 | polish | **Activity lists six identical "ran a practice call" rows.** | `nbfc-d/41-activity.png` | Neighbouring identical rows fold into one row with "(6 times)". Unit test `foldRepeats`. |
| W14 | polish | **Team roles are lowercase codes** ("owner", "builder") in the list, the select and the hints. | `review-m/14-settings-team.png` | Owner / Builder / Operator / Compliance / Viewer. Flow *Team: …*. |
| W15 | polish | The assistant's receipt shows "Approved" twice for an audience it saved without any approval. | `nbfc-d/38-op-plan.png` | A receipt says what happened once, in its header: "Done". |
| W16 | polish | Page context and chips are wrong in places. On /audiences the top bar and the assistant both say "Vyakti". On /contacts/import they say "Contact". A new or draft campaign offers "Why is pickup low?" and "Pause this campaign". | `nbfc-d/25-import-saved.png`, `nbfc-d/29-campaign-new.png` | The labels now read "Audiences", "Import contacts" and "New campaign". The campaign chips fit a draft and a live campaign. Unit test. |
| W17 | polish | On the campaign form, the name field and the agent select are half width and cut off ("-wheeler loans pilot", "EMI reminders, tv"). The default audience name is "Imported list" every time, so the third import is the third "Imported list". | `nbfc-d/29-campaign-new.png`, `nbfc-d/24-import-checked.png` | Both are full width. The audience name defaults to "Import of 24 Oct". |
| W19 | slows | **Any amount whose paise round up to the next rupee prints wrong**, for example ₹1.995 as "₹1.100". The paise were rounded after the rupees were split off. This was found by the W1 billing flow on the e2e database, not seen in a screenshot. The bug is in `product/shared/money.ts` `formatInr`, so it hit the server's display strings too. | e2e run, `Billing: …` flow | Round to the paisa, then split. Unit test (₹1.995 → ₹2.00, ₹999.995 → ₹1,000.00). |
| W18 | polish | Smaller copy and layout fixes. The guided start says "The assistant opens beside this page" on a phone, where it replaces the page. "Add money" breaks across two lines in the Money card. A call's moment chips centre wrapped text. | `hospital-m/02-today-first-run.png`, `nbfc-d/02-today-first-run.png`, `review-d/04-call-2.png` | Copy and CSS fixes. |

## Needs a server change (routed to the integrator)

Nodes for these are in `context/inbox/web-2026-10-24.json`.

| # | Sev | Friction | Evidence | Pointer and suggested fix |
|---|---|---|---|---|
| R1 | blocks | `TelephonyDisabled` puts an environment variable and "credentials on the server" in a buyer-facing refusal. W2 hides it in the web app, but API and MCP callers still get it. | `hospital-m/34-numbers-search.png` | `product/server/modules/campaigns/telephony.ts:43`. Plain message plus a code (`telephony_disabled`). Keep the env-var hint in the server log only. |
| R2 | slows | **Campaign launch checks don't compare the agent's languages with the list's.** Deccan Fincorp's list is Kannada, Bengali, Tamil and Telugu speakers, and the EMI agent speaks Hindi, English and Hinglish. Nothing warns. | `nbfc-d/26-contacts.png`, `nbfc-d/30-campaign-draft.png` | `product/server/modules/campaigns/index.ts:76` (`launchBlockers`). Add a warning such as "4 of 6 people prefer a language this agent does not speak", with a fix link to the agent's languages. |
| R3 | slows | **Nothing checks that the agent's per-contact facts have a column.** `emi_amount` and `emi_due` say "from the contact record", but the CSV's columns are "EMI amount" and "Due date", and no step shows the match. | `nbfc-d/09-agent-job.png`, `nbfc-d/24-import-checked.png` | `launchBlockers` (same file) or `source.preview`. List every per-contact fact with no matching attribute. |
| R4 | slows | **"Build your own" prices parts in US dollars** ("$1.00 per audio hour", "$0.30 in, $2.50 out per million tokens"), while every stack card is in ₹ per minute (must-be A). | `nbfc-d/15-stack.png` | `product/shared/components.ts:43` (and each part's `price`). Give a ₹ figure per part at the money module's rate, with USD as the basis note. |
| R5 | polish | "VP" is still in money copy: "What VP pays its providers…" on every estimate, and "what VP pays providers" twice on Billing. This was round 1's S3 and is still visible. | `nbfc-d/30-campaign-draft.png`, `nbfc-d/35-billing.png` | `product/server/modules/money/money.ts:59,72,214`; `money/index.ts:55`. Say Vyakti. |
| R6 | polish | Activity names the wrong thing: "saved a campaign draft: Imported list" gives the audience, not the campaign. Publishing reads "asked for approval to make a change". | `nbfc-d/41-activity.png` | `product/server/subject.ts:8`: for `campaign.draft`, the created campaign is the subject, not the first matching input key. The proposal line should name the tool. |
| R7 | polish | `brief.today` sends approval requests without who asked, so the sheet cannot say "the assistant asked" or "Meera asked". | `nbfc-d/40-today-after.png` | `product/server/modules/operator/tools.ts:41`: add the requester's actor type and name to `needsTap.items`. |
| R8 | slows | **Publish shows no diff and nothing about what goes live**: no stack, no practice-caller result, no change since the last version. The sharpened must-be 15 is "explicit publish with a diff". | `nbfc-d/21-publish-sheet.png` | `product/server/modules/agents/index.ts:502` (`version.publish` describe). Include the agent, the stack, the last practice result and a field diff from the previous version. The sheet already renders detail rows. |
| R9 | slows | Billing is a usage statement only: no tax invoice, GSTIN, payment method or receipts. Enterprise buyers ask for these first (must-be 19, INR billing with GST). | `nbfc-d/35-billing.png` | `product/server/modules/money/index.ts:75` (`invoice.get`). This waits on price (deferred) and needs a decision; open question. |
| R10 | slows | **Numbers doesn't state KYC documents, time or price before the search** (sharpened must-be 16), and no real offers list could be judged with telephony off. | `nbfc-d/33-numbers.png` | `product/server/modules/campaigns/index.ts:442` (`number.search`). Return the series' KYC checklist, typical time and monthly price, even when telephony is off. |
| R11 | polish | `call.search` and `call.get` carry `agent_version_id` but no agent name or version number. The call log can't show the version, which must-be 13 asks for, without N+1 agent reads. | `review-d/02-calls.png`, `review-d/04-call-2.png` | `product/server/modules/calls/tools.ts:184`. Join the agent name and version number. The web app already resolves campaign names. |
| R12 | polish | Today shows "Spend today ₹0.09" while the wallet is ₹0 and Empty: practice calls are charged, but against what? | `nbfc-d/40-today-after.png` | Open question: should test spend draw on the wallet, a test allowance or nothing? Then say it on Today and Billing. |
| R13 | polish | Every stack card says "Hear it: No sample recorded yet". A buyer choosing a voice can't hear one without building an agent first. | `nbfc-d/15-stack.png` | Record one sample per curated stack on the VM, once Vertex is allowed: a voice task, not web. |

## Observed and left alone

- Fact names and outcome names are snake_case keys (`emi_due`, `payment_intent`). They are the keys a CSV column maps to and that
  Calls and Insights show. Renaming them is a model decision, not a label fix.
- "Can she call?" has rows for service and promotional calls only, and transactional is not named. The server's `contact.get`
  decides which check applies to transactional calls, and the web app should not guess.
- Practice-caller rows show "Failed" with the reason one click away, inside the row. That is acceptable as is. Dev-only failures
  make it look worse than it is.
- The assistant's replies, the first-run toast sitting mid-page in full-page shots, and the fixed bottom bar on phone shots are
  artefacts of the stand-in model and of full-page screenshots.
- The seeded campaign is a draft with five attempts, and its funnel says 0 dialled. That is seed data (`web/dev/seed.ts` inserts
  attempts directly), not a product fault.
- Calls on the seeded workspace say "No outcome yet" next to a "Call analysis · Dev-script ₹0.00" cost line. Dev only (round 1
  S7).
