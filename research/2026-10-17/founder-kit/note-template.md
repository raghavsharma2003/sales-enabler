# Interview note template

Round 2 (2026-10-17). The round-1 version is `note-template.round1.md`.

**Instructions:**
- Copy this file to `data/discovery/YYYY-MM-DD_<target-id>.md` for each interview. `data/` is gitignored.
- Fill it in within two hours of the call.
- Only the anonymised score row (`scoring.md` §9) ever leaves `data/`.

**Privacy rules for this file:**
- Write the interviewee's **role**, not their name.
- Don't write any customer name, phone number, policy number or loan number, even if one was said aloud.
- Quotes stay short and contain no personal data.

**Evidence grades.** Tag every number, and every claim you'll score, with one of these:

| grade | meaning | example |
|---|---|---|
| **A** | Shown: a document, report or screen | "showed dialler report: 41% connect, Sept" |
| **B** | A specific past figure, with a period | "Sept: 3,200 motor policies due, we renewed 2,450" |
| **C** | An estimate or generalisation | "usually around 70%" |
| **D** | An opinion or hypothetical | "we'd probably pay more for that" |

Only **A** and **B** count toward a kill criterion (`scoring.md` §3). **M** marks an insurance must-ask; if it is blank, the
hypothesis it feeds scores 0.

---

```
# <target-id> · <segment> · YYYY-MM-DD

## Meta
- target id (targets.csv):            INS-__ / RE-__ / LEN-__   (or NEW-__ if not on the list)
- stratum in targets.csv / TRUE stratum:   __ / __   (A broker small-mid · B non-bank CA · C IMF · D large/platform)
- selection (targets.csv):             website / signal / random / size / referral
- company type:                        broker / IMF / corporate agent / PoSP platform / developer / channel partner / NBFC / MFI / agency
- interviewee role (title only):
- decision power:                      decides / recommends to: <role> / no influence
- how we met:                          cold email / LinkedIn / warm intro (from: <role, firm type>) / referral from <target-id>
- format, duration:                    phone / video, __ min
- interviewer / note-taker:
- recording:                           yes (consent at 00:00) / no
- AI transcription used:               yes (separate consent) / no
- the one thing I most needed to learn (written BEFORE the call):

## Scope and qualification (scoring.md §1)
- in scope? (registered type; retail >=50%; decision-maker reached):   yes / no. Reason:
- [INS] M retail share of book:                              __% (grade _)
- [INS] M book mix, retail: 2W __% · car __% · health __% · life __%   (grade _)
- [INS-B] credit-linked cover sold with loans? share:        __% (grade _)
- [INS] M due renewals LAST MONTH by line: 2W __ · car __ · health __ · life(yr2+) __ · total __   (grade _)
- [INS] main line (most due):                                __
- [RE] own digital inquiries per month:                      __ (grade _)
- [LEN] accounts due per month / entering 1-30 DPD:          __ / __ (grade _)
- QUALIFIED (adds the >=300 due / volume floor):             yes / no

## Workflow, last cycle (the story, in order)
1.
2.
3.
- list format and where it lives:
- M who calls; FTE on renewal calls:   __ (grade _)       named renewal desk? yes / no
- days before expiry calling starts:
- how the customer pays (link / cash / autopay / insurer portal):
- what happens to no-answer / "later":
- M who reaches the customer first (insurer team or bot / aggregator / dealer / us); how often already renewed elsewhere:   (grade _)
- M re-quotes at renewal: share of motor renewals with other-insurer quotes, IDV/add-on changes or switches __%; who does it; certified (BQP / SP / AV / ISP)?   (grade _)
- M evening / Sunday callbacks: who answers; what happened last time:
- cross-sell on renewal calls? yes / no

## Volumes and model inputs, last month (record per line where possible)
| metric | 2W | car | health | life | period | grade | source said |
|---|---|---|---|---|---|---|---|
| M due policies | | | | | | | |
| M renewals collected | | | | | | | |
| M renewed BEFORE the first call | | | | | | | |
| M never reached, renewed anyway (share) | | | | | | | |
| M renewal ratio last year (basis: policies / premium) | | | | | | | |
| dials per caller per day | | | | | | | |
| connected calls per caller per day | | | | | | | |
| M answer rate per attempt / max attempts / wrong-or-off numbers % | | | | | | | |
| avg minutes per connected call | | | | | | | |
| (opt) best caller vs average caller save rate | | | | | | | |
- M due renewals ONE caller works per month:        __ (grade _)
- M biggest month / smallest month / smallest as % of average:   __ / __ / __% (grade _)
- [RE] share from own site / ads / portals / CP / bought lists:   (grade _)
- [LEN] connect rate; PTP kept rate:   (grade _)

## Costs and commission
- caller cost per month, all-in:        ₹__ (grade _)
- M attrition last year:                __ left of __ (grade _); weeks to be useful: __; replacement cost: ₹__
- telephony / dialler: provider, unit (per min / seat / flat), price:
- outside vendors for calling (who, unit, price, result):
- [INS] M commission actually received on renewal: 2W __% · car __% · health __% · life yr2+ __%; changed after Oct 2025? (grade _)
- [INS] M who earns it on lapse / direct renewal with the insurer; renewal codes lost?   (grade _)
- [INS] (opt) view of IRDAI's 23-Sep consultation caps (grade D):
- [RE] value per visit; visit-to-booking rate; commission or margin:
- [LEN] cost of a roll to 31-60; agency fee basis:

## Tools and the premium figure
- list or CRM:                          (name; spreadsheet / portal / CRM / in-house)
- M premium figure comes from:          insurer renewal notice on the list / fresh portal quote per policy / other. Wrong-premium incidents:
- dialler / numbers:
- WhatsApp provider; template use:
- bots / IVR tried, cost, what happened:
- point tool OK, or must sit inside the CRM? (with the past example):

## Failures, leakage and trust
- worst recent month and what happened:
- M why the last few lapses happened (capacity / price / claims / competitor / insurer-direct / other):
- M customers suspecting fraud: how often; how callers prove they're genuine; any customer cheated by a fake renewal caller:   (grade _)
- complaints (customer / insurer / Bima Bharosa / operator / regulator):
- language and age issues heard:
- what they did about it in the last 6 months, and the money spent:

## Compliance, number, QA (what they do; no judgement)
- M number customers see (own mobile / company mobile / landline / 140 / 1600 / other); set up by; since:
- M has anyone (insurer, telco, IRDAI) raised 1600 with them? what they did:   -> I8 mark: trigger / not enforced / n.a.
- (opt) expected pickup change on 1600 (grade D):
- DLT registration (who did it):
- operator flags or blocks ever:
- M recordings: kept? share sampled, by whom? retention:
- M complaints last year: count by source; who handles; Bima Bharosa route:
- [INS-C] M phone selling/renewal calls by: own ISPs / other staff; IRDAI distance-marketing approval: yes / no / unknown
- how consent is captured and stored:
- [RE] what happens with DND numbers; estimated DND share:   __% (grade _)
- [LEN] 2027-01-01 preparations; vendor empanelment or DRA; whose numbers agencies use:
- data-residency or outsourcing clauses:

## Decision process (last real purchase)
- what they bought; who found it; who approved; days to pay:
- pilot: paid or free; what it had to show:
- payment terms; budget holder (role):

## Concept card, price card, holdout (hypothetical, so weaker evidence)
- first worry after the concept card (verbatim):
- [INS] live bill shown on last month's list: ₹__ /month (minimum ₹15,000 applies? yes / no)
- [INS] M "renewal collected" — pay on renewals before our first call?   yes / only after first call
- [INS] M hand-offs (incl. evenings) — their team / expect us
- [INS] M holdout: commission cost stated ₹__/month; answer: accept 10% / accept __% / refuse
- [INS] reaction to the ₹15k minimum:
- [INS] equal-bill unit choice: (a) per renewal / (b) per extra renewal at ₹__ / (c) per minute at ₹__ ; reason:
- [INS] other lines at card price: car ₹50 → __ ; health ₹15 → __ ; life ₹15 → __ ; 2W ₹20 → __
- Van Westendorp, main line / unit [₹/renewal | ₹/qualified visit | ₹/account cured]:
  - too cheap: ₹__  bargain: ₹__  getting expensive: ₹__  too expensive: ₹__
- Gabor-Granger asks (price → answer):  ₹__ → __ ; ₹__ → __ ; ₹__ → __ ; ₹__ → __
- GG-max (highest "definitely" or "probably"): ₹__   on line: __   floor used (scoring.md §2.3): ₹__
- value per outcome (stated):           ₹__ per saved renewal / visit / cure (grade _)
- unit they preferred, if they pushed back (per min / seat / outcome / flat):

## Quotes (short, verbatim, no personal data)
- "…"
- "…"

## Commitments given (Mom-Test currency; scoring.md §6)
- [ ] none / compliments only                          (0)
- [ ] agreed to a specific follow-up meeting           (1)
- [ ] introduced us to a boss or peer (count: __)      (2)
- [ ] shared an artefact (list below)                  (3)
- [ ] signed an LOI at a stated price                  (4)
- [ ] paid pilot / purchase order                      (5)
- highest level reached: __
- pilot ask allowed by stratum rule? (C: not before counsel; D: platform talk only)   yes / no

## Artefacts received or promised
| artefact | promised / received | redacted? | stored where (data/discovery/artefacts/...) | delete by |
|---|---|---|---|---|
| | | | | |

## Scores (fill from the facts above; scoring.md §2 and §4)
- I1 __ (grade _) · I1-desk __ · I1-rev __ · I2 __ (line __) · I3 __ (line __, floor ₹__) · I8 __ (mark __)
- I4 __ · I5 __ · I6 __ · I7 __ · I9 __ · I10 __ · I11 __ · I12 __ · I13 __ · I14 __ · I15 __ · I16 __ · I17 __ · I18 __
- pain __ · commitment __

## My read (kept separate from the facts above)
- surprises:
- what I got wrong going in:
- hypotheses this moves (H-ids, scoring.md §2, §4):
- follow-ups I owe them (summary, artefact handling, intro thank-you):
- next step agreed (date):
```
