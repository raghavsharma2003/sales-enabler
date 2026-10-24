# Buyer walkthrough: friction log (2026-10-23)

**Method.** Three buyers each took a new workspace from nothing to a drafted campaign on the dev server (real tools, the voice
runtime on fake providers for the browser call, a scripted stand-in for the assistant's model), then reviewed calls, Insights,
Settings and Activity in the seeded workspace, then every main screen at 390 px wide.
- **Bank collections** (Karnataka Commercial Bank, EMI reminders, template route): `shots/bank/`.
- **D2C brand** (Haveli Home Goods, COD confirmation, template route): `shots/d2c/`.
- **Hospital** (Sahyadri Care Hospitals, appointment reminders, template route): `shots/hospital/`.
- **Review** (seeded workspace; calls, Insights, Settings, Activity): `shots/review/`.
- Driver: `walk.mjs`. Raw log of every step with timings and failures: `log.json`. Paths below are relative to `shots/`.
- 137 steps, 3 failed, and all 3 are the same: the walk clicked a table row on the contacts list and nothing opened (F4).
- Every shot was opened except the three D2C and hospital Settings sets, which are the same screens as `review/` and were
  skimmed through `review/` only.

**Not walked, and why.**
- The *assistant* route for "describe your calling job": the dev server's scripted assistant answers every sentence with the same
  greeting, so it cannot build an agent. It needs a real model. Screen: `bank/04-assistant-describe.png`.
- Hearing her: the browser call opens and shows "No microphone was found", because a headless browser has none. The call view,
  captions and disclosure are covered by the browser flow with a fake microphone, not here.
- Practice callers: all six show "Failed" because the stand-in model gives no real answers (`bank/15-practice-callers-run.png`).
  A buyer would read that as a broken agent. It is a dev-only effect, and on a real model the verdicts mean something.

Severity: **blocks** = the buyer cannot finish or does the wrong thing; **slows** = finishes with effort or doubt; **polish** = reads
wrong or rough. "Web" = fixable in `product/web`; "Server" = needs a server change.

## Fixed in this pass (web only)

| # | Sev | Friction | Evidence | Fix |
|---|---|---|---|---|
| F1 | blocks | The guided start counts "Launch a test campaign" as done the moment a *draft* exists, then disappears from Today, although launch is still blocked (no number, no cap). The buyer is left with no guide at the hardest step. | `bank/31-today-after.png` | Step 4 is done only once a campaign has launched. A draft shows "Finish your campaign: N checks to fix" and links to it. |
| F2 | blocks | The campaign form does not know the agent's call category. All three buyers picked a category that did not match the agent and met "This agent was built for transaction calls, but the campaign is set up for service calls" only *after* saving. | `bank/28-campaign-draft.png`, `d2c/28-campaign-draft.png` | Choosing the agent pre-selects its category; a mismatch is flagged on the form before saving, with the reason. |
| F3 | blocks | "Set a spending limit for this campaign" can only be fixed by asking the assistant. The estimate even suggests a cap (₹100) but there is no way to apply it. Launch cannot be reached without the assistant. | `bank/29-campaign-estimate.png` | The Window card gets "Set a spending cap" with the suggested amount as a one-tap fill, saved through the campaign's own draft tool. |
| F4 | slows | Contacts list rows are not clickable. Only the name is a link. Three walks timed out on it. | `log.json` step `24-contact-page`; `bank/23-contacts-list.png` | The whole row opens the contact (keyboard and mouse), the name stays a link. |
| F5 | polish | The approval sheet shows the raw draft hash ("Draft hash 204816021e3e87d4…"), and the assistant's receipt says "Publish agent 1ab031a3 from the draft you reviewed (204816021e3e)". | `bank/18-publish-sheet.png`, `bank/19-published.png` | Hash-like and id-like values are hidden from the sheet's detail rows; the assistant's receipt uses the plain words for the action. The server's own summary text is item S2. |
| F6 | slows | Wallet shows "₹0 Empty" on Today and the sidebar with no way to add money; it is only in Settings → Billing, three clicks away. A buyer cannot rent a number or launch with an empty wallet. | `bank/31-today-after.png`, `review/` wallet card | "Add money" link on the Today wallet card and in the sidebar wallet, to Billing. |
| F7 | polish | Objection and approach fields on the Objections tab are single-line inputs that cut the text off ("stay calm and practical; note when th"). The buyer cannot read what the agent will do. | `bank/10-agent-rules.png` | Multi-line fields that grow with the text. |
| F8 | blocks | An agent made from a template carries the template's *placeholder business name* ("Sahaj Finance", "Arogya Dental Clinic", "Haveli…" for none) instead of the buyer's, and says it on calls. The Brand card in Settings is empty, a second place for the same fact. | `bank/07-agent-created.png`, `hospital/07-agent-created.png`, `review/07-settings-brand.png` | After a template agent is created, the agent's business name and spoken name are set to the workspace's name (a draft edit the buyer can see and change). Server-side default is S1. |
| F9 | slows | The template picker is 16 cards in one long list (about 4,000 px on a phone). | `bank/05-start-templates.png`, `bank/m-*` | Industry filter chips above the list. |
| F10 | polish | The Hear her button is labelled with the agent's full name ("Hear Health insurance renewal reminder"). | `start-agent-done-m.png` (guided start shots) | "Hear her now". |

## Needs a server change (routed to the integrator)

| # | Sev | Friction | Evidence | Suggested fix |
|---|---|---|---|---|
| S1 | blocks | `agent.create` from a template keeps the template's placeholder business name. F8 is a web workaround; the right fix is to fill it from the workspace's brand or name at creation. | `bank/07-agent-created.png` | `agent.create` takes `brand.name` and `brand.spokenName` from the workspace brand, else the workspace name. |
| S2 | polish | Approval summaries contain ids and hashes: "Publish agent 1ab031a3 from the draft you reviewed (204816021e3e)". | `bank/19-published.png` | `describe` for `version.publish` says "Publish <agent name>". |
| S3 | polish | The estimate's "How we know" starts "What VP pays its providers…", and Billing says "amounts shown are what VP pays providers". "VP" is the internal name. | `bank/29-campaign-estimate.png`, `review/09-settings-billing.png` | Say Vyakti in `money.ts`. |
| S4 | slows | Activity says "ran a practice call" six times with no agent named (already logged as `open.2026-10-21.activity-row-subject`). | `bank/32-activity.png` | A `subject` per activity row. |
| S5 | slows | Every number is "DND not checked", and the stand-in provider answers "no answer" for all, so promotional calls can never be tried in dev. A real buyer needs to know whether the real register is connected. | `bank/23-contacts-list.png` | `contact.dnd_refresh` should say which provider answered and whether it is a stand-in. |
| S6 | slows | After the campaign is saved, the launch checks are good, but "Get a number" needs a wallet balance and the product never says so; the number flow stops at "Renting spends money". | `bank/30-numbers.png` | The blocker's `why` should name the wallet when it is empty. |
| S7 | polish | Calls on the seeded workspace show "No outcome yet" for finished calls and "The written summary could not be made this time", because no analysis model runs in dev. | `review/02-call.png` | Dev only; give the dev server a canned analysis model so screens show a finished state. |

## Observed and left alone

- Mobile: no horizontal scroll on any screen walked (7 per buyer, 6 in the review). The tab strips on the agent page cut the
  fourth tab ("Objec…") without a hint that it scrolls (`bank/m-agent.png`). Polish, left for a later pass.
- Full-page shots of phone-width pages show the fixed bottom bar and the toast mid-page. That is how a full-page screenshot is
  taken, not a layout fault.
- The "Describe your calling job" path, "Hear her" with real audio and a real DND answer were not exercised here (see above).
