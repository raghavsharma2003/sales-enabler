# Buyer walkthrough, round 4: against the best of six competitors (2026-10-24)

**Who and how.**
- **Buyer:** a new enterprise buyer, end to end, as the owner will test it. Ritu Menon, head of collections at
  Kaveri Housing Finance (synthetic), a housing-finance NBFC.
  - EMI pre-due reminders in Hinglish.
  - 24 synthetic borrowers with phones 9000080000+.
- **Widths:** desktop (1440) and phone (390). Shots are in `shots/nbfc-d/` and `shots/nbfc-m/`; desktop shots are scaled to
  1080 px wide.
- **Driver:** `walk.mjs`, writing `log.json`.
- **Comparison:** the six dashboards in `research/2026-10-21/walkthroughs/` (Vapi, Retell, Bolna, ElevenLabs, Sarvam,
  Exotel), read for the best per step (summary from their reports; their screenshots are not in the repo), and the must-be
  list (`research/2026-10-24/must-be-audit/README.md`).
- **Server:** the dev server, with real tools, devsim for the browser call and a scripted assistant model.

**Results.**
- 92 steps ran (46 at each width) and 2 failed.
  - Both are "Launch", which is correctly not offered until the four launch checks are fixed.
  - A third, the phone's assistant question, was a race in the walk helper with the newly lazy dock; it passed after the
    helper waited.
- 0 screens scrolled sideways.

**Not walked, and why.**
- **The assistant's real answers.** The dev model is scripted: "set up reminder calls…" got its generic line, and "what is
  stopping this campaign from launching?" matched its "launch" keyword and saved an unrelated audience. On staging, with a
  real model, the operator's set-up and diagnosis can be judged.
- **Practice-caller verdicts.** The dev caller is the same scripted model, so verdicts are not a judgement of the agent
  (W8 below).
- **A call to their own phone.** Telephony is off on this server: "Phone lines are not switched on for this workspace yet".
  The telephony builder is wiring the dial path.
- Insights with data, which needs real analysed calls.
- Her real voice and a recording.

## Step by step: where we stand against the best of the six

| # | Step | Best of the six (their report) | Us | Verdict |
|---|---|---|---|---|
| 1 | Sign up, first screen | Retell: a 0/7 Getting started checklist with locked steps, ~4 clicks to a testable agent | A four-step Get started card. Each step is done from what is saved, and later steps say what they wait for (`02-first-screen`) | **Worse, now fixed (W1):** two filled buttons competed (Add contacts while step 1 was not done) and a toast covered step 3 |
| 2 | First agent | Sarvam: chat-first creation; ElevenLabs: 45+ templates with previews | Describe the job to the assistant, or one of 16 templates by industry (EMI pre-due reminder), then name her. The draft opens with job, category, languages and sector rules pre-set (`13-agent-created`) | **Level or better:** India-shaped templates (COD, EMI, admissions) against their US-shaped ones |
| 3 | Company data | Retell: web pages, files, text, Drive/OneDrive/Notion in one dialog | Settings > Knowledge: title and text; passages wait for approval (`18`-`19`) | **Worse, routed (R-4.2):** text only here; no URL or file upload on this page |
| 4 | Choose a stack | Vapi: latency, cost and a quality score on every row, plus presets | Seven measured stacks, each with reply gap (graded, with how we know), ₹ per minute (computed, with basis), where each part runs, a sample to hear and the risks (`21-stack`) | **Ahead on evidence; behind on languages, now fixed (W6):** cards did not say which languages they speak, and there was no language filter. Still behind on quick presets (R-4.3) |
| 5 | Test it | Sarvam: a docked panel with Voice, Phone and Chat; ₹2 a simulated run | Docked "Test her": browser call with live captions (`24`), practice chat with the safety door's verdicts inline (`27`), practice callers (`28`) | **Ahead:** a real browser call with the AI disclosure in her first line (Exotel's is "Coming soon", Bolna has none). Practice callers failing 0/6 was the dev fixture (W8) |
| 6 | Import | ElevenLabs: the CSV contract on the form. No vendor showed mapping or row verdicts | Paste or file (Excel, CSV, TSV, 20 MB); columns matched with samples; a verdict per row; consent recorded per list (`33`) | **Ahead**, with one slip now fixed (W3): with one agent, "Which agent will call them?" stayed on "Decide later", so her facts were never matched and launch was blocked later |
| 7 | Campaign | No single best; nobody shows a cost estimate, consent, DND or DLT | Launch checks with fix buttons; cost range including GST with its basis; latency and language warnings; drop-off funnel; window and retries (`37`) | **Ahead.** On a phone the checks' text was squeezed to a few words a line by their buttons, now fixed (W5) |
| 8 | Own phone | Sarvam: a Phone tab that calls your number; Bolna: an India KYC gate | Numbers: verify your phone with a spoken code, then "Hear a test on your phone"; 1600-series search (`39`-`40`) | **Not judged:** telephony off on this server. Friction routed (R-4.1): the page only says lines are off after you type and press |
| 9 | Call log, call page | Vapi: log columns incl. version and cost; nobody showed a single-call page | Log with agent and version and reply gap (gap 15, earlier today); call page with who spoke when, per-turn reply timing, the AI disclosure marked, why it was allowed, cost per part (`42-call-page`) | **Ahead** |
| 10 | Insights | ElevenLabs: 12 tabs; Retell: custom dashboards | Themes, drop-off, issues, monitors to turn on, proposals, tests and lessons, each empty state saying what it waits for (`07-empty-insights`) | **Not judged with data.** The empty page is honest but long, with no single next action (W4, item 3) |

## Fixed in this pass (web)

Each fix has a browser flow in `product/web/e2e/flows.test.mjs`. Each flow failed with the change stashed and passes with
it.

| # | Sev | Friction | Evidence | Fix |
|---|---|---|---|---|
| W1 | slows | **Today had no single next action.** Get started showed "Add contacts" as the filled primary button while step 1 (create the agent) was not done, and a "Next best step" card repeated step 4 ("Finish your campaign" and "Open the draft", both primary). | `nbfc-d/02-first-screen`, `nbfc-d/46-today-after` | Only the first step not done gets the primary button; the others stay, quieter. "Next best step" waits until Get started is complete. Flow *Today: in a new workspace the Get started card has one primary action…* (before: "Hear her now \| Add contacts"). |
| W2 | polish | **Toasts covered the middle of a card**: "Your workspace is ready…" over step 3, "Draft created" over the job cards, "Saved as a draft" over the wallet check. | `nbfc-d/02`, `13`, `37` | Toasts sit in the page column's bottom-right corner (left of the dock where it shows); phones keep them above the bottom bar. Checked in flow *Import with one agent…*. |
| W3 | blocks | **With one agent, the import did not pick her**, so her facts (loan, EMI due) were never matched. Launch then said "Nobody on this list has values for loan…" | `nbfc-d/33-import-checked`, `nbfc-d/37-campaign-draft` | With exactly one agent in the workspace she is chosen up front, so the column check runs ("Is it one of these? Use 'Loan ID'"). "Decide later" is kept once chosen. Flow *Import with one agent…*. |
| W5 | slows | **Launch checks read a few words a line** on a phone and in the campaign page's narrow column: each fix button took the side of its sentence. | `nbfc-m/37-campaign-draft` | The sentence takes the row and the button wraps under it, lined up with the text. Looked at both widths. |
| W6 | slows | **Stack cards never said which languages a stack speaks**, and there was no way to find the stacks that speak Tamil (gap 17, must-be 17; queue item 5). | `nbfc-d/21-stack` | Each card lists what `stack.list` says it serves, measured apart from stated ("Measured in our tests: Hinglish · The makers say: Hindi, English, Tamil…", long lists fold). A "Speaks" filter beside the kind filter, with counts ("Tamil (4)"). Flow *Stack languages: …* checks every card and every count against stack.list. |
| W8 | dev | **Practice callers failed 0/6 on an untouched template agent.** The dev agent never carried the AI disclosure, so the reply door held every turn, then it repeated one line. This was a fixture artefact, not the agent. | `nbfc-d/28-practice-callers` | The dev agent's first turn carries the disclosure (not when the caller asks if she is a bot, so the door's own honest answer still shows in the practice-chat flow), and each turn says a different line. Practice-caller verdicts still need staging's real model. |

## Needs another lane (routed)

| # | Sev | Friction | Pointer and suggested fix |
|---|---|---|---|
| R-4.1 | slows | Numbers lets you type your number and press "Ring me with a code" before saying phone lines are off for this workspace. | Telephony (session_01EMpetZaBqaoTD8i89vtAx9): a read that says whether telephony is on (and why not), so the page says so on arrival. The refusal text is `plainReason` in `web/src/labels-core.ts`. |
| R-4.2 | slows (answered after the walk) | Company data is text only on Settings > Knowledge, while Retell takes web pages, files and Drive/OneDrive/Notion in one dialog. | Knowledge owner: `knowledge.ingest` from a URL and a file (PDF, DOCX), behind the same passage approval. **029471b ("Company information end to end: website, documents and price sheets in") landed while this was written up; the next walk re-checks step 3 against Retell.** |
| R-4.3 | polish | No quick stack presets (Vapi: Balanced, Fastest, Cheapest). The page is seven tall cards, 4,300 px on desktop. | Agents (`stack.list`): name a fastest, cheapest and best-judged stack from measured figures, and the web shows them as one-tap filters. |
| R-4.4 | polish | Billing opens on a new workspace with "There is no money to spend…" in red, before the person has done anything. | Money: the wallet warning's words and tone for a new workspace with its test budget ("Add money before real calls; test calls use today's test budget"). |
| R-4.5 | dev | The scripted assistant answers any message containing "launch" or "plan" with a plan that saves a Pune audience. A walkthrough on the dev server can leave stray records. | Web (mine, later): the dev fixture's keywords are also used by browser flows, so they need care to change. Real models on staging do not do this. |

## Observed and left alone
- The browser console showed two failed loads at each width, both expected: a 401 for the signed-out `/v1/me` check
  before sign-up, and a 404 for `/v1/client-events`. That is the workspace builder's route, not landed yet; the beacon ignores
  failures until it does.
- The guided start's four steps mark themselves done from saved data. After the walk, Today showed all three done and one
  clear "Finish your campaign".
- The campaign page's cost range includes GST and says how it is computed. No competitor shows a campaign estimate.
- The browser call's live captions and the AI disclosure in her first line read well at both widths.
- Item 3 (empty and first-run states, W4) is the next piece of work. The walk confirmed which pages lack a next action: the
  Calls and Insights empty states have none, and Campaigns says "Start a campaign" before any agent exists.
