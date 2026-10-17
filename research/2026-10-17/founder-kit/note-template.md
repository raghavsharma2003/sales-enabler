# Interview note template

**Instructions:**
- Copy this file to `data/discovery/YYYY-MM-DD_<target-id>.md` for each interview. `data/` is gitignored.
- Fill it in within two hours of the call.
- Only the anonymised score row (`scoring.md` §6) ever leaves `data/`.

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

Only **A** and **B** count toward a kill criterion (`scoring.md` §2).

---

```
# <target-id> · <segment> · YYYY-MM-DD

## Meta
- target id (targets.csv):            INS-__ / RE-__ / LEN-__   (or NEW-__ if not on the list)
- company type:                        broker / IMF / corporate agent / PoSP platform / developer / channel partner / NBFC / MFI / agency
- interviewee role (title only):
- decision power:                      decides / recommends to: <role> / no influence
- how we met:                          cold email / LinkedIn / warm intro (from: <role, firm type>) / referral from <target-id>
- format, duration:                    phone / video, __ min
- interviewer / note-taker:
- recording:                           yes (consent at 00:00) / no
- AI transcription used:               yes (separate consent) / no
- the one thing I most needed to learn (written BEFORE the call):

## Qualification (scoring.md §1)
- in scope for segment?                yes / no. Reason:
- [INS] retail (individual) share of book:      __% (grade _)
- [INS] renewals due per month:                 __ (grade _)
- [RE] own digital inquiries per month:         __ (grade _)
- [LEN] accounts due per month / entering 1-30 DPD: __ / __ (grade _)
- QUALIFIED:                                    yes / no

## Workflow, last cycle (the story, in order)
1.
2.
3.
- list or lead format and where it lives:
- who calls; FTE on this work:          __ (grade _)
- attempts per contact; first-call timing:
- how the customer pays or books:

## Volumes, last month
| metric | value | period | grade | source said |
|---|---|---|---|---|
| list size (due policies / inquiries / accounts) | | | | |
| calls dialled / connected | | | | |
| avg minutes per connected call | | | | |
| outcomes (renewed / visits booked / cured) | | | | |
| [INS] renewal ratio by line: motor / health / life | | | | |
| [RE] share from own site / ads / portals / CP / bought lists | | | | |
| [LEN] connect rate; PTP kept rate | | | | |

## Costs
- caller cost per month, all-in:        ₹__ (grade _)
- attrition last year:                  __ of __ (grade _)
- telephony / dialler: provider, unit (per min / seat / flat), price:
- outside vendors for calling (who, unit, price, result):
- [INS] commission per renewal (motor / health / life); who keeps it on lapse:
- [RE] value per visit; visit-to-booking rate; commission or margin:
- [LEN] cost of a roll to 31-60; agency fee basis:

## Tools
- list or CRM:                          (name; spreadsheet / portal / CRM / in-house)
- dialler / numbers:
- WhatsApp provider; template use:
- bots / IVR tried, and what happened:
- point tool OK, or must sit inside the CRM? (with the past example):

## Failures and leakage
- worst recent month and what happened:
- why the last few losses happened (capacity / price / product / competitor / other):
- complaints (customer / regulator / operator / principal):
- language and age issues heard:
- what they did about it in the last 6 months, and the money spent:

## Compliance (what they do; no judgement)
- number customers see (mobile / landline / 140 / 1600 / other); set up by:
- DLT registration (who did it):
- operator flags or blocks ever:
- how consent is captured and stored:
- [RE] what happens with DND numbers; estimated DND share:   __% (grade _)
- recording notice; retention period:
- [LEN] 2027-01-01 preparations; vendor empanelment or DRA; whose numbers agencies use:
- data-residency or outsourcing clauses:

## Decision process (last real purchase)
- what they bought; who found it; who approved; days to pay:
- pilot: paid or free; what it had to show:
- payment terms; budget holder (role):

## Pricing (hypothetical, so weaker evidence)
- first worry after the concept card (verbatim):
- Van Westendorp, in unit [₹/renewal | ₹/qualified visit | ₹/account cured]:
  - too cheap: ₹__  bargain: ₹__  getting expensive: ₹__  too expensive: ₹__
- Gabor-Granger asks (price → answer):  ₹__ → __ ; ₹__ → __ ; ₹__ → __ ; ₹__ → __
- GG-max (highest "definitely" or "probably"): ₹__
- converted ₹/AI-connected-min (interview-guide Appendix A):  ₹__  (show inputs: k=__, m=__, r=__)
- value per outcome (stated):           ₹__ per saved renewal / visit / cure (grade _)
- unit they preferred, if they pushed back (per min / seat / outcome / flat):

## Quotes (short, verbatim, no personal data)
- "…"
- "…"

## Commitments given (Mom-Test currency; scoring.md §3)
- [ ] none / compliments only                          (0)
- [ ] agreed to a specific follow-up meeting           (1)
- [ ] introduced us to a boss or peer (count: __)      (2)
- [ ] shared an artefact (list below)                  (3)
- [ ] signed an LOI at a stated price                  (4)
- [ ] paid pilot / purchase order                      (5)
- highest level reached: __

## Artefacts received or promised
| artefact | promised / received | redacted? | stored where (data/discovery/artefacts/...) | delete by |
|---|---|---|---|---|
| | | | | |

## My read (kept separate from the facts above)
- surprises:
- what I got wrong going in:
- hypotheses this moves (H-ids, scoring.md §2):
- follow-ups I owe them (summary, artefact handling, intro thank-you):
- next step agreed (date):
```
