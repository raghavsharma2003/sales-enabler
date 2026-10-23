# The self-learning loop, walked end to end (2026-10-23)

**What was done.** The harness2 loop was walked on the dev server (`web/dev/serve.ts`). The model is faked there: the dev
sample analysis for calls, a scripted coach for proposals, and a plain reply for simulated calls. The walk acted as the
seeded workspace admin (Asha, Saanjh Services) through the same HTTP tool API the web uses.

**How.**
- Calls arrived the way the voice runtime reports them: signed `POST /hooks/runtime`. The dialler is not run. Its attempt
  and conversation rows were written directly, and that is said wherever it happens.
- The driver is `product/web/dev/learning-walk.mts` (steps: `calls`, `learn`, `propose`, `probe`, `accept`, `start`,
  `outcomes`, `more`, `split N`, `check`, `adopt`, `publish`, `state`).
- The Insights page was captured with `product/web/dev/insights-shot.mjs`, and each shot was looked at before the UI
  shipped.
- All people, numbers and outcomes are synthetic.

**Result.** The loop now closes. On the dev walk:
1. 30 calls ran on version 2, 14 of them early hang-ups.
2. The early hang-up monitor fired (8 of the last 20, 40%, against a 35% threshold).
3. A proposal was drafted from that issue and simulated on 12 library caller × seed pairs.
4. A test was approved: about 1,208 calls with a recorded outcome, to prove 40% → 48%.
5. The shadow A/A passed at 110 contacts.
6. The split ran 545 / 555 contacts, and no contact landed in both arms.
7. The verdict was a win of +20.3 points (95% CI 15.1 to 25.4).
8. The 100% rollout was approved. The change was adopted into the agent draft and a lesson was recorded.
9. Version 3 was published, and its brief carries the new opening.

The same loop runs as one automated test, on the real modules, in
`product/tests/learning-loop-e2e.test.ts`.

## The loop, step by step

Status: **ok** = worked as walked; **fixed** = broke and is fixed here; **open** = still a gap, listed at the end.

| # | Step | Status | What happened | Fix (commit) | Test |
|---|------|--------|---------------|--------------|------|
| 1 | Calls finish | ok | 30 signed runtime reports were accepted, and each call ended with a reason code (early hang-up under 10 s). | — | e2e |
| 2 | Analysis | ok | The dev sample analysis (02ef5ff) analysed every call with no model. | — | e2e |
| 3 | Cross-call insight | ok | `insight.refresh` ran. Its themes are empty on sample analyses, which is expected and not a gap. | — | — |
| 4 | Issue / monitor fires | ok | The early hang-up rate monitor opened an issue after analysis. Its detail was raw JSON on Insights, and it now reads as a sentence. | b921e26 (UI) | e2e; learning-issues |
| 5 | Learning drafts a proposal | ok | The `learning.propose_from_issues` job drafted one opening change citing the issue. Nothing launched. | — | learning-issues; e2e |
| 6 | Simulate (probe) | **fixed** | It stopped with `no_sim_callers` when the workspace had no practice callers of its own. The probe also ignored the boolean guardrail metrics (hung up, safety, disclosure), so those three were silently skipped. | 670620f | learning (library fallback); learning.stats (booleans) |
| 7 | Readiness before approval | **fixed** | A person held to approve "Test this on real calls", and only then saw it refused ("no success values"). The calls needed were shown only after approval. Now `proposal.readiness` names the first blocker in words, and the card states the calls needed. | cd5b974 | learning (readiness and card) |
| 8 | Success values | **fixed** | Goal values were found only through `campaign.deployment_id`. Campaigns store `campaign.agent_version_id`, so accept failed after approval. | 670620f | learning (agent_version_id link) |
| 9 | Approval (A2) | ok | Approving `proposal.accept` created the treatment version and the experiment, waiting for its A/A check. | — | e2e |
| 10 | Start | **fixed** | `experiment.start` existed, but no screen offered it, so a test waited forever unless someone called the tool. Insights now shows "Waiting to start", the reason, and a Start button. | b921e26 | e2e (start before and after the A/A check) |
| 11 | Split on new calls | **fixed** | The readout counted every live call on either version since the start, including calls the experiment never placed. The walk's control arm held 752 contacts where 642 were assigned. Arms are now stored per contact at first assignment, and only assigned contacts count. A contact seen on both versions is a crossover: it counts in neither arm and is reported. | 8069484 | learning (only assigned; never two arms); e2e (sticky) |
| 12 | Result with its CI | ok | The verdict shows the difference and its 95% interval in points. It is shown only at the horizon: no peeking. | b921e26 (UI words) | learning; e2e |
| 13 | Adopt or roll back | **fixed** | A win produced a rollout card and nothing more. The agent draft kept the old text, so the next publish silently dropped the learned change. Now the win is adopted only when the binding's latest deployment runs the treatment at 100%. The draft is then edited through `brief.edit` and the proposal becomes promoted. A declined or expired card is recorded as "won but not adopted". | 510592e | learning (approve and decline); e2e |
| 14 | Lesson recorded | **fixed** | No lesson was written for a win, only for losses and stops. "Adopted: …" and "Won but not adopted: …" are now recorded, and Insights has a "What has been learned" card. | 510592e, b921e26 | learning; e2e |
| 15 | Next brief carries it | ok after 13 | Version 3, published from the draft, carries the new opening in its brief. | — | e2e |

## Guardrails (each with a test)

- **An experiment never changes safety rules, disclosure or opt-out handling.**
  - The gates refuse any proposal that touches the disclosure, hand-off, recording, never-say list, sector packs or
    category.
  - A running test's treatment is checked to equal the current version on every locked part: brand, category, packs,
    never-say, hand-off, recording, memory, voice, tools, facts and disclosure.
  - Test: `learning.test.ts`, "locked parts never change". It passes without code changes; it guards what the gates
    already did.
  - The e2e test also checks that the published version keeps its disclosure.
- **The split never puts a contact into two arms.**
  - `experiment_assignment` has the primary key (experiment, contact), and the first arm stored wins.
  - The readout leaves crossovers out.
  - Tests:
    - `learning.test.ts`, "never in two arms";
    - the e2e test asks for every contact twice and checks there are no duplicate rows.
- **A regression stops the experiment.**
  - Harm codes (opt-out, complaint, crisis) and any safety violation in the treatment arm already stopped it.
  - A worse goal rate did not: a change that did worse would run to its horizon.
  - Now an always-valid mSPRT on "did not reach the goal" stops it at once, with 30 or more outcomes per side. It reverts
    through the A3 verb, opens an issue and records a lesson.
  - Test: `learning.test.ts`, "goal regression stops". It failed before the fix.

## Insights page states (dev server, desktop)

Each was looked at before the UI shipped.

1. `learning-loop/01-issue-and-proposal.png`: the open issue as a sentence. The drafted proposal shows its agent, "from
   the early hang-up issue", and the change as Now → Would be.
2. `learning-loop/02-accepted-aa-pending.png`: the test is approved and waiting to start. The reason is in words (the A/A
   check needs 100 calls with an outcome, n more), with a Start button.
3. `learning-loop/03-running.png`: a progress meter per version against the calls needed. No winner is shown before the
   horizon.
4. `learning-loop/04-won-waiting-rollout.png`: the verdict with its 95% interval in points, and "Review it in Needs you"
   for the rollout card.
5. `learning-loop/05-adopted.png`: adopted, taken before the last label fix. The adopted proposal still read Now → Would
   be, which was wrong for a change already in use.
6. `learning-loop/06-adopted-final.png`: the same state after the fix. The adopted change reads Before → Now, and "What
   has been learned" lists the lesson. Its "1410" was stored before the number formatting fix; new lessons say "1,410".
   The early hang-up issue above it is still open (open item 3).

## Still open (not fixed here, in order of how much they get in the way)

1. **The agents module lists the candidate version as the latest.**
   - The `agent.get` versions list puts the experiment's treatment version first.
   - Anything that takes "the latest version" as the live one picks the candidate. The walk script did this: it posted
     control calls on the treatment until it was changed to read `campaign.agent_version_id`.
   - Belongs to the agents module: mark candidate versions, or order by published-and-live.
2. **Simulation passes when both versions fail everything.**
   - With no simulation model in dev, both versions score 0 of 12, and "no regression" reads as a pass.
   - With a real model this is a real comparison. A probe where the current version passes nothing should say
     "inconclusive" rather than "passed".
3. **The issue stays open after adoption.**
   - The early hang-up issue that started the loop is not linked to the result.
   - It should be annotated "a change was adopted on <date>; watching", and closed by its monitor once the rate falls.
4. **The default pickers.**
   - The Insights agent picker and the funnel's campaign picker default to the first item, not the one with open work.
   - Small, but on a busy workspace the loop's cards can be off-screen.
5. **`outcome.define` duplicates.** Defining "Renewal" twice makes two definitions. It should offer to reuse the existing
   one.
6. **Seeded call times** in `web/dev/seed.ts` can be later than now. Dev only.

Two things look like gaps but are designed states:
- **The 7-day minimum and the 100-outcome A/A minimum.** The walk simulated 7 days by backdating `started_at`, and the
  e2e test passes `minDays: 0`, which is a real input.
- **AI guesses never count as outcomes** until the outcome's judge is calibrated. Outcomes come from a system of record
  (`outcome.record_verified`, integrations only) or a manager's label (`outcome.label`).
