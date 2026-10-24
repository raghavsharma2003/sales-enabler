# Buyer walkthrough, round 3: friction log (2026-10-24)

**Method.** This used round 2's method: the dev server with real tools, devsim for the browser call, a fake microphone and the
scripted assistant model. Each buyer took a new workspace from nothing to a launch-ready campaign at both widths, and every
screenshot was opened.
- **D2C skincare brand** (Saffron Kind Skincare: cash-on-delivery confirmation and NDR calls; the *COD order verification*
  template). The list has 242 rows, including a duplicate and a bad number past row 200: `shots/d2c-d/` (1440 px) and
  `shots/d2c-m/` (390 px).
- **Private university admissions** (Westbridge University: counselling follow-ups in English and Hinglish; the *Admissions
  enquiry follow-up* template; Hindi removed from the agent's languages). The list has 40 applicants, some Tamil-speaking:
  `shots/uni-d/` and `shots/uni-m/`.
- **Seeded workspace** at both widths: `shots/review-d/` and `shots/review-m/`.
- **New since round 2, walked on purpose:**
  - language warnings and the fact-column check;
  - the publish card (a second publish, to get a diff) and version history;
  - wallet blockers and rupee part prices;
  - requester names;
  - recordings, erasure and retention;
  - the learning loop ("Look for improvements");
  - voice samples playing.
- **Driver and log:** `walk.mjs` and `log.json`.

**Results.**
- 256 steps ran and 6 failed:
  - **University on a phone (1):** the language step. My selector also matched an `<option>`; the desktop run did the step.
  - **Play (2):** no seeded call has a recording.
  - **Approval step (2):** the scripted assistant answered with a plan card, so there was no Review button.
  - **Insights question on a phone (1):** the walk helper clicked an "Ask the assistant…" button on the page, not the dock.
- 0 screens scrolled sideways. The desktop shots were scaled to 1080 px wide for the repo.

**Not walked, and why** (all as in round 2):
- the assistant's real replies;
- her real voice;
- a recording;
- tiered analysis: the seeded calls still read "No outcome yet" in dev;
- the learning loop past "no real calls yet". Proposals need real calls.

## Fixed in this pass (web)

There are 9 new browser flows in `product/web/e2e/flows.test.mjs` (section "Third buyer walkthrough") and unit tests in
`product/tests/web-walkthrough2.test.ts`. All 9 flows failed on the build before these fixes and pass after.

| # | Sev | Friction | Evidence | Fix |
|---|---|---|---|---|
| T1 | blocks | **Neither buyer could fill the agent's per-contact facts.** Launch was blocked by "Nobody on this list has values for order (maybe the "order_id" column), address…" and, for admissions, "…for enquiry". The blocker said "match a column when you import the list", but the import only offered Name, Phone, Language and "Keep as a detail". It never asked which agent would call the list, so the server's column check (round 2, R3) never ran. | `d2c-d/29-import-checked.png`, `d2c-d/38-campaign-launch-checks.png`, `uni-m/39-campaign-launch-checks.png` | The import asks "Which agent will call this list?" (optional) and passes it to `source.map`. A "What <agent> reads from each person's record" panel lists each fact. A filled fact shows its column; a missing one gets "Which column holds “order”?", with the likely columns first, and the choice is saved under the fact's own key. The launch blocker now has a "Match columns" button to the import. Flow *Import: with the agent chosen…*. |
| T2 | blocks | **The language warning never showed.** The server returned "9 of 40 people prefer a language this agent does not speak (Tamil)" in `campaign.get` (checked on the university's campaign), but the page drew only blockers. | `uni-d/39-campaign-launch-checks.png`, `d2c-d/38-campaign-launch-checks.png` | A "Worth knowing" list under the launch checks shows each warning word for word. "Change the agent's languages" opens that agent. Flow *Campaign page: launch warnings…*. |
| T3 | slows | **The publish card still said only "Publish this agent".** Round 2's R8 summary (the version, the voice, the last practice call, "Changes since version 1: …") was written by the server and hidden by the web's own label. | `d2c-d/25-publish-sheet-2.png` | The sheet lists the server's summary sentence by sentence under the label when it says more: several sentences, or any publish. Never when it carries an id or hash. Flow *Publish: …*; unit test `serverDetail`. |
| T4 | slows | **There was no way to roll back.** `version.restore` exists on the server, but the Versions tab only listed versions, each saying "Published", in a stretched pill. | `d2c-d/27-versions.png`, `uni-m/28-versions.png` | Each earlier version has "Go back to vN…". It goes through the approval sheet, which shows the server's "Roll back … to version N (as version M)…" sentences. Owners and builders can do it; others see why not. The pill no longer stretches. Flow *Versions: …*. Authors are still "A teammate": see R-3.4. |
| T5 | slows | **A 242-row file said "Every row is ready"** next to "1 duplicate, 1 skipped". The preview holds the first 100 rows, and the problem rows were further down. | `d2c-d/29-import-checked.png`, `d2c-m/29-import-checked.png` | "Showing the first 100 of 242 rows", and a "First 100 rows" tab. When problems lie beyond the preview, it says "The first 100 rows are ready", with the duplicate and skipped counts and where they are. Flow *Import: a file longer than the preview…*. |
| T6 | slows | **Contacts stopped at 50** with "more not shown. Narrow the search": a dead end for a 240-person COD list. | `d2c-d/31-contacts.png` | "Show the next 50" pages with `contact.list after`. The DND check covers every row shown. Flow *Contacts: …*. |
| T7 | slows | **The voice tab says "Retention is set in Settings, Privacy", but Privacy had no retention.** Erasure didn't say it deletes recordings, which it now does on the voice server too. | `d2c-d/43-privacy.png` | A "How long data is kept" card on Privacy shows `policy.retention.get` (recordings, transcripts, uploaded files, import problem rows, activity log) and what is always kept. Owners and compliance can change it with a reason, through the approval. The erasure option reads "Erase me completely (details, transcripts and recordings)". Flow *Privacy: …*. |
| T8 | slows | **A brief check listed the same line twice and didn't say where it was** ("numbers belong in facts rows…" ×2), so Publish was disabled with no hint which note to fix. Found when a test note held a number. | flow diagnostics, *Agent: a check on the draft…* | Each check names its tab and field as a link ("Persona, note 3: Numbers belong in facts rows…"), once. Flow *Agent: a check on the draft…*; unit test `lintWhere`. |
| T9 | polish | A practice call's page and list row were titled "Unknown person", and its costs repeated per turn (nine lines for three parts). | `d2c-d/37-test-call-page.png` | Titled "Practice call in the browser". Costs are one line per part and provider. Unit test `groupCost`. The title shows only on devsim browser calls, which CI does not run, so it has no flow. |
| T10 | polish | After the university removed Hindi, "Follow the caller's language" still said "If they switch to Hindi or English, so does she". | `uni-d/08-languages-english.png` | The hint names the agent's own languages ("If they switch to Hinglish or English…"). Flow *Agent basics: …*. |

## Needs a server change (routed to the integrator)

Nodes for these are in `context/inbox/web-2026-10-24-r3.json`.

| # | Sev | Friction | Evidence | Pointer and suggested fix |
|---|---|---|---|---|
| R-3.1 | slows | The fact blocker quotes a column *key* (`maybe the "order_id" column`) where the buyer's file said "Order ID". | `d2c-d/38-campaign-launch-checks.png` | `product/server/modules/agents/columns.ts:55` with the launch blocker in `campaigns/index.ts`. Keep the source header with each attribute key and name the header. |
| R-3.2 | polish | The language warning says "The agent speaks Hindi, English" for an agent set to English and Hinglish with Hindi removed. | `uni-d/39-campaign-launch-checks.png` (API) | `product/server/modules/campaigns/index.ts:144`. Name Hinglish as Hinglish when it is the allowed form, not its parts. |
| R-3.3 | slows | The import preview stops at 100 rows (`source.map previewRows` max 100), so problem rows beyond it cannot be seen or fixed before saving. | `d2c-d/29-import-checked.png` | `product/server/modules/intake/sources.ts:186,207`. Return every non-ready row, capped separately, as well as the first N rows. |
| R-3.4 | polish | `agent.get` versions omit `author_id`, so Versions can only say "A teammate". The web names members once it is sent. | `d2c-d/27-versions.png` | `product/server/modules/agents/index.ts:458`. Add `author_id`, or the author's name. |
| R-3.5 | polish | `contact.list` has no total, so the list can say "and more" but not "of 240". | `d2c-d/31-contacts.png` | `product/server/modules/intake/contacts.ts:102`. Add a `total` (or an estimate over N). |
| R-3.6 | polish | Seeded calls still have no recording and no finished analysis on the dev server, so signed playback, erasure of audio and tiered analysis cannot be seen in a walkthrough. | `review-d/04-call-2.png` | `product/web/dev/seed.ts`: seed one call with a recording through the runtime's signed-link path and one analysed call (dev only). |

## Observed and left alone

- **Rupee part prices** ("₹0.79 a minute, provider cost") read well at both widths. **Requester names** work: "The
  assistant asked for you". **Wallet blockers** say what each call holds and offer "Add money". **Voice samples** play,
  and "What she says" shows the Hindi line. All of these landed as intended.
- The learning loop says "That agent has no real calls yet to learn from, so nothing was proposed". That is honest, and
  real calls are needed to go further.
- Activity's "Open" link wraps under long lines on desktop. This is a layout nit with no effect on use.
- A 240-row list with "Keep as a detail" for every column works. Volume did not slow any screen walked.
