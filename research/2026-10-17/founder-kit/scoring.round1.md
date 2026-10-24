# Scoring interviews against the hypotheses

Date: 2026-10-17. **Pre-registered.** These rules are fixed before the first interview, the same way the weights in `lanes/l3-segments/weights.json` were frozen before data.

If a rule changes after interviews start, keep the old rule. Log the change at the bottom of this file under "Deviations", with the date and reason, and report results under both rules. Changing a threshold after seeing the data is how a beachhead survives its own kill criteria.

**Where things live.** The criteria are in `../SYNTHESIS.md`:
- §1.2: insurance KC1-KC7, and the rule for switching to real estate;
- §2: real-estate RE-K1 to K5 and lending LEN-K1 to K5.

Interviews can **fire** some criteria and only **feed** others: counsel decides KC5 and LEN-K1, the battery decides KC6, and the pilot decides KC7. §5 says which is which.

---

## 1. Who counts: the qualification rules (the denominators)

Kill criteria count "qualified" firms. Decide qualification from the facts in the note, before scoring anything else. An unqualified interview is still useful, but it is left out of every count below.

| segment | qualified when ALL hold |
|---|---|
| **[INS]** | 1. IRDAI-registered IMF, direct or composite broker, non-bank corporate agent, or PoSP platform. 2. Retail (individual) motor, health or life policies are ≥50% of the book. 3. The interviewee decides on renewals or reports directly to whoever does. 4. ≥300 retail renewals fall due per month. Evidence for 2-4 may be grade C; record it. |
| **[RE]** | 1. A developer selling its own projects, or a channel partner with mandated developer inventory. 2. ≥300 inquiries a month. 3. The interviewee owns pre-sales or sales, or reports to whoever does. |
| **[LEN]** | 1. An RBI-registered NBFC or NBFC-MFI, or a collection agency working NBFC or bank portfolios. 2. ≥1,000 accounts due a month, or ≥300 entering 1-30 DPD. 3. The interviewee owns collections or reports to whoever does. |

The ≥300 and ≥1,000 floors are assumptions chosen so that each firm has enough volume for a local-metric test (l6v: about 600-1,200 calls). Score both with and without the floor, and report both.

---

## 2. Evidence grades and the per-interview hypothesis score

The grades come from `note-template.md`:
- **A** (shown) has weight 1.0.
- **B** (specific past figure) has weight 0.7.
- **C** (estimate) has weight 0.3.
- **D** (opinion or hypothetical) has weight 0.

**Rule: a kill criterion can only fire on A or B evidence.** C evidence can only trigger a follow-up request for the artefact.

For each hypothesis, record one value per interview:
- **+1**: the evidence supports the hypothesis;
- **−1**: the evidence contradicts it;
- **0**: no evidence.

Record the grade next to it. The rule column says how many A/B **+1**s or **−1**s it takes.

### 2.1 Beachhead: insurance [INS]

| id | hypothesis | +1 when (A/B) | −1 when (A/B) | segment-level rule | criterion |
|---|---|---|---|---|---|
| **I1** | The buyer runs a renewal desk | ≥3 FTE make renewal calls, or there is a named renewal desk or team | Renewals happen only through PoSPs, branches or the insurer, or fewer than 3 people make occasional calls | **Fires KC1** if fewer than **5 of the first 15** qualified score +1 | KC1 |
| **I2** | Renewal leakage exists at this buyer | The renewal ratio on the main retail line is <90% **and** the firm names commission it loses on lapses | The ratio is ≥90% *without* phone calling, **or** the firm loses no commission on lapse (for example, the original agent keeps it) | **Fires KC3** if **≥8 of 15** qualified score −1 (majority) | KC3 |
| **I3** | The price clears both floors | GG-max converts to ≥ ₹6/AI-connected-min (§4) **and** the stated value per saved renewal is ≥ ₹150 | Either one fails | **Fires KC2** if fewer than **3** qualified score +1. Three is the brief's proof bar of 3 pilots from 15 | KC2 |
| I4 | Buyers compare against cost per outcome | They already pay a vendor per outcome, or reason in ₹ per renewal | They insist on per-minute or per-seat pricing | Report the counts. If **≥8 of 15** score −1, reopen the pricing unit (§5 of SYNTHESIS) | H2b |
| I5 | Renewal lists are spreadsheets or exports | The list is a spreadsheet, CSV or insurer-portal export | It sits only inside a CRM with no export, or on paper | Confirms or refutes the unsourced claim (§1.3) by majority | integration |
| I6 | Founder- or ops-led buying in weeks | The last purchase was approved by the founder, principal officer or ops head in ≤8 weeks | It needed procurement, IT or compliance, or took >8 weeks | Report the counts. Feeds H10 and the realism of KC4 | H10 |
| I7 | A point tool is acceptable | They have added a tool beside the CRM before, or would use one | "It must live inside a new CRM" (past example required) | **Revisit the command centre** if **≥5 of the first 15** score −1 (§3.1 idea 7) | H8 |
| I8 | A compliant number path exists | They call from 1600xx today through a CPaaS | Personal mobiles, or 10-digit numbers with no plan | Report the counts **to counsel**. KC5 is decided by counsel, not by interviews | KC5 input |
| I9 | Quality is salient to them | They name language, older-customer or call-quality failures from past calls | "Any voice is fine" | Feeds the battery personas (KC6). Not a kill test | KC6 input |

### 2.2 Alternate 1: real estate [RE]

| id | hypothesis | +1 when (A/B) | −1 when (A/B) | segment-level rule | criterion |
|---|---|---|---|---|---|
| **R1** | Most call volume comes from own digital inquiries | ≥50% of last month's called leads were their own site, ad or portal inquiries | ≥50% came from bought or cold lists | **Fires RE-K1** if **a majority** of qualified RE score −1 | RE-K1 |
| **R2** | They pay ₹300-500 per qualified site visit | GG-max ≥ ₹300 per qualified visit | GG-max < ₹300 | **Fires RE-K2** if fewer than **3 of 10** qualified score +1 | RE-K2 |
| R3 | The price clears ₹6/min at their own rates | GG-max ≥ p\* = 6·k·m/r using their k, m and r | GG-max < p\* | Report the counts. A pass on R2 with a fail on R3 means visit rates are too low for per-visit pricing | economics |
| R4 | An incumbent bundle is already in use | They are not using Sell.Do or LSQ voice AI | They already use a CRM-bundled voice bot that "works" | Report the counts. RE-K3 fires only on the battery, but a −1 majority makes RE-K3 likely | RE-K3 input |
| R5 | DND share is workable | Estimated DND share of inquiry numbers ≤ about 20%, or they hold operator-registered consent | They call DND numbers on a form checkbox and the share is large | Report to **counsel**. RE-K5 is a legal finding | RE-K5 input |

### 2.3 Alternate 2: lending [LEN]

| id | hypothesis | +1 when (A/B) | −1 when (A/B) | segment-level rule | criterion |
|---|---|---|---|---|---|
| L1 | A phone desk works pre-due and 1-30 DPD | ≥3 FTE make these calls | Field or group-meeting collection only | Report the counts. If MFIs mostly score −1, drop MFIs from the alternate's buyer list | qualification |
| L2 | 2027-01-01 is a live buying trigger | They name a change they must make (recording, hours, logs) and an owner or budget | "Not relevant" or "the vendor handles it" | Report the counts. Supports the "dated trigger" claim (§2) | trigger |
| L3 | The price clears the lending floor | GG-max per account cured ≥ p\* at their rates | Below p\*, or they compare only against a ≤ ₹3/min bot | Report the counts. A ≤ ₹3/min incumbent comparison is context for LEN-K2 | LEN-K2 input |
| L4 | Conduct sensitivity is manageable | Few complaints about calls; they have a grievance process | Recent tone or harassment complaints or regulator notices | Report the counts. Any warmth claim must face these | LEN-K3 input |
| L5 | Agencies can use the lender's 1600 numbers | The agency calls on the lender's 1600 series | Agencies use their own 10-digit numbers or mobiles | Report to **counsel** | LEN-K4 input |
| L6 | No hard residency clause | Contracts allow processing outside India, or are silent | An India-only processing clause | Report the counts. A majority −1 makes LEN-K5 likely given no centralindia GPT-6 meter (§6.11) | LEN-K5 input |
| L7 | Vendors are not treated as recovery agencies | Calling vendors are onboarded as tech or BPO vendors | They must be empanelled or certified as recovery agents | Report to **counsel** | LEN-K1 input |

---

## 3. Pain and commitment (Mom-Test currency)

Score both for every interview. They decide who gets the pilot ask (`plan.md` §6).

**Pain (0-3), from the failures section:**

| score | meaning |
|---|---|
| 0 | No pain described |
| 1 | Pain acknowledged, nothing done |
| 2 | Time or people already spent trying to fix it in the last 6 months |
| 3 | **Money** spent on it in the last 6 months (a hire, vendor, tool or campaign) |

**Commitment (0-5):** the highest level reached, from the note template.

| score | meaning |
|---|---|
| 0 | Compliments only |
| 1 | A follow-up meeting with a date |
| 2 | Intro to their boss or a peer |
| 3 | Artefact shared |
| 4 | LOI at a stated price |
| 5 | Paid pilot or purchase order |

A "yes, sounds great" with commitment 0 is a **no** for every decision in this file.

**Pilot-ask eligibility:**
- qualified;
- pain ≥ 2;
- commitment ≥ 2;
- I3 (or R2/L3) not scored −1.

---

## 4. Price conversion: the KC2 / RE-K2 / L3 arithmetic

Use the interviewee's own figures. Fall back to the defaults in `interview-guide.md` Appendix A only when a figure is missing, and mark the result "default-based".

```
list_items   = due policies | inquiries | accounts per month             (section 3)
outcomes     = list_items × r                                             (r: renewal | visit | cure rate)
ai_minutes   = list_items × k × m                                         (k: connected calls per item, m: min per call)
fee          = max(Min, p × outcomes)                                     (Min = 25,000 in the GG ask)
yield_per_min = fee / ai_minutes                                          → must be ≥ ₹6   (KC2 / economics)
break_even_p  = 6 × k × m / r
```

**[INS] value per saved renewal.** I3's second test uses the interviewee's own answer, not our estimate:
- their stated value of one avoided lapse (commission plus next year's renewal) must be ≥ ₹150.

As a sense check, also compute what *they* would pay per incremental save:
- fee ÷ (list_items × Δ), at Δ = 2, 5 and 10 percentage points of lift.
- If that exceeds their stated value at Δ = 5 pp, the deal does not make sense for them at that price. Record it as a soft −1 on I3, even if the GG answer was "probably".

**Van Westendorp with n ≈ 10-15.** Don't compute crossing points; there are too few answers.
- Report the median and the range of each of the four answers, converted to ₹/min.
- Flag it if the median "too expensive" converts below ₹6/min. That is a strong KC2 signal even before GG.

---

## 5. Decision rules: when to look, and what can fire

| checkpoint | when | what to compute | what can happen |
|---|---|---|---|
| **Interim** | After 8 qualified [INS] interviews (planned about 2026-10-29) | I1, I2 and I3 counts so far | If I1 is already ≥5 (+1) and I2 is clearly not majority −1, keep going. If I1 ≤ 1 of 8 **and** I2 ≥ 5 of 8 are −1, move the remaining insurance slots to [RE] early, and log it as a deviation |
| **Beachhead decision** | After 15 qualified [INS] | I1 → KC1, I2 → KC3, I3 → KC2 | Any one firing means the beachhead "dies or moves" (§1.2) |
| **Switch test** | After 10 qualified [RE] | R1, R2 | **Switch to alternate 1** if KC1, KC3 or KC5 fired **and** R1 is majority +1 **and** R2 has ≥3 of 10 at ₹300-500 (§1.2, last paragraph) |
| **Alternate 2 read** | After 5-10 qualified [LEN] | L1-L7 | No firing from interviews alone. Hand L5 and L7 to counsel, and L3 to the battery's price comparison |
| **Channel (KC4, RE-K4)** | Week 10 of outreach | Funnel (`plan.md` §4) | **Fires** if, of 60 targeted intermediaries (or firms), fewer than 10 took a discovery call **or** fewer than 3 accepted a paid pilot |
| **Not decided here** | — | KC5 and LEN-K1/K4 (counsel), KC6 and RE-K3 (battery), KC7 (pilot), LEN-K5 (Azure pricing) | Interviews only supply inputs |

**Small samples: report counts and intervals, never bare percentages.** 90% Wilson intervals for reference:

| result | 90% interval for the true share |
|---|---|
| 3 of 15 | 0.08-0.41 |
| 5 of 15 | 0.17-0.54 |
| 8 of 15 | 0.33-0.72 |
| 10 of 15 | 0.46-0.83 |
| 3 of 10 | 0.13-0.56 |
| 5 of 10 | 0.27-0.73 |

With 15 interviews, "5 of 15" and "8 of 15" have overlapping intervals. The rules above are pre-registered decision lines, not estimates of the market share.

---

## 6. The score row (one per interview)

Append to `data/discovery/scores.csv` (gitignored). Columns:

```
target_id,date,segment,company_type,role,qualified,qual_reason,pain,commitment,
I1,I1_grade,I2,I2_grade,I3,I3_grade,I4,I5,I6,I7,I8,I9,
R1,R1_grade,R2,R2_grade,R3,R4,R5,
L1,L2,L3,L4,L5,L6,L7,
list_items_per_month,k,m,r,gg_max_inr,gg_unit,yield_per_min_inr,value_per_outcome_inr,
vw_too_cheap,vw_bargain,vw_expensive,vw_too_expensive,
artefacts_received,pilot_ask_eligible,scorer,second_scorer,notes_file
```

- `targets.csv` holds no personal data, so `target_id` is safe to keep.
- The `role` column holds a title only.
- The anonymised roll-up for `research/` and `context/` drops `target_id` and `company_type` detail below segment level (`plan.md` §7).

---

## 7. Keeping the scoring honest

1. **Score from the note, not from memory.** If a fact isn't in the note, it scores 0.
2. **Use a second scorer for every [INS] interview, if one is available.**
   - The second scorer reads only the note, then scores blind.
   - Settle disagreements with the grade rules, not by discussion of what the person "meant".
   - If an AI model is the second scorer, give it the redacted note only. Record `second_scorer: model` and treat it as a check, not a vote.
3. **Count disconfirming interviews out loud.** At each checkpoint, write one paragraph headed "What would have to be true for this to be wrong?"
4. **Watch the warm-intro bias.** People introduced by friends are kinder. Report I1-I3 separately for cold-sourced and warm-sourced interviews.
5. **Watch the referral bias.** Referrals cluster: one broker's friends run similar firms. Cap referrals at 3 per seed firm in the 15 qualified [INS] count.

---

## 8. What goes into `context/` when the programme ends

Following the repo's logging rules (`AGENTS.md`):
- **Measurements** with n, method and date. Example: "I1: 6 of 15 qualified intermediaries run ≥3 renewal callers (A/B evidence; interviews 2026-10-19 to 11-06; 90% Wilson 0.22-0.61)".
- **Decisions**, each with its reversal condition. Example: "Beachhead kept: KC1-KC3 did not fire. Reverse if the paid pilot fails non-inferiority (KC7)".
- **Rejections.** Example: "MFIs dropped from alternate 2: 4 of 5 collect only through field and group meetings".
- **Deviations** from this file.

Never write personal data, verbatim artefacts or recordings into `context/`.

---

## Deviations

| date | rule changed | old | new | why | results reported under both? |
|---|---|---|---|---|---|
| | | | | | |
