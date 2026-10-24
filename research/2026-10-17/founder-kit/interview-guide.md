# Discovery interview guide (Mom-Test, past behaviour only)

Date: 2026-10-17, round 2. For the founder. The round-1 version is kept as `interview-guide.round1.md`.

Each call runs 40 minutes, with one interviewer and, if possible, a second person taking notes. Insurance calls may run to 45 minutes; the
items marked **(opt)** are the ones to drop if time runs short.

**What the guide tests.** It tests the beachhead's kill criteria (`../SYNTHESIS.md` §1.2, KC1-KC7, as restated in
`scoring.md` §2) and the two alternates' kill criteria (§2). Every question names the criterion it feeds. `scoring.md` turns
answers into decisions. `kc-answer-sheet.md` is the one-page version to keep open during the call. `note-template.md` is the
page you fill in.

**What changed in round 2 (insurance only; real estate and lending are unchanged).**
1. **Strata.** Every insurance target now has a stratum in `targets.csv`:
   - A: small/mid retail broker;
   - B: non-bank corporate agent;
   - C: IMF;
   - D: large broker or PoSP platform.

   Kill criteria are read per stratum, then weighted back to the pool (`scoring.md` §2.1).
2. **New probes.** Eleven are added, each tied to a criterion or to a model input that nobody has measured (§6-§13, Appendix C):
   - attrition;
   - connect rate and attempts;
   - insurer-direct and aggregator renewals;
   - fear of fake renewal calls;
   - who answers escalations at 8 pm;
   - where the premium figure comes from;
   - seasonality;
   - holdout acceptance;
   - which number they call from (now a 1600 compliance probe);
   - QA and Bima Bharosa complaints;
   - whether they re-quote or sell at renewal.
3. **A real price card.** It is set per line from the round-2 per-renewal model (`../lanes/l2-economics/round2/`). §13 and
   Appendix A carry the numbers, with the verifier's caveats.

**Segment tags.**
- **[INS]**: insurance intermediaries' renewal desks (the beachhead). [INS-A], [INS-B], [INS-C] and [INS-D] mark
  stratum-specific probes.
- **[RE]**: real estate, own digital inquiries to site visits (alternate 1).
- **[LEN]**: lending pre-due and DPD 0-30 (alternate 2).

A question with no tag applies to all three. **M** marks an insurance must-ask: if it is not in the note, the hypothesis it
feeds scores 0.

---

## 1. Rules for the interviewer

1. **Ask about the last time, not "usually" or "would you".**
   - Good: "Walk me through last month's renewal list."
   - Bad: "How do you generally handle renewals?"
   - Worst: "Would you use a tool that ...?"
2. **Get numbers with their source.** For every number, ask "where does that number come from?" Then mark it in the note:
   - **A**: the person showed a document or report.
   - **B**: a specific recalled figure tied to a period.
   - **C**: a rough estimate.
   - **D**: an opinion.

   Only A and B evidence can fire a kill criterion (`scoring.md` §3).
3. **No pitching before section 13.** If they ask what you're building, say: "Happy to tell you at the end. I don't want to
   colour your answers."
4. **Deflect compliments and hypotheticals back to the past.**
   - "That sounds great" → "When did you last try to fix this? What did you do?"
   - "We'd definitely use that" → "What are you using today, and what did it cost you last month?"
5. **Dig on anything emotional or specific.** For example: "You sighed when you said lapses. Tell me about the worst month."
6. **Talk about 20% of the time.** Silence is fine. Count to five before rescuing them.
7. **Never ask for, write down or accept customer personal data.** That covers names, phone numbers, policy numbers and loan
   account numbers. If they start reading one out: "No need for the name, the number of cases is enough."
8. **Never tell them they are non-compliant.** The 1600 and IMF questions in §11 are asked to learn what they do. They are
   not an audit. Never give legal advice.
9. **Write the note within two hours** (`note-template.md`). Memory decays fast and starts to invent.

---

## 2. Before the call (10 minutes of prep)

- [ ] **Read the company's row in `targets.csv`:**
  - evidence line, buyer role, **stratum**, **selection** (website / signal / random / size) and **stratum_rule**;
  - one specific thing to ask about, for example "you're hiring telecallers for insurance sales in Munirka".
- [ ] **Know what the stratum rule means for this call:**
  - **[INS-C] IMF:** interview only. Make no pilot or LOI ask until counsel has answered the IMF question. IMF distance
    marketing may be done only "without engaging tele-marketer(s)", with prior IRDAI approval and "only through ISPs"
    (IMF Regs reg 3(d), unchanged by the 2026 amendment; l1 round 2, U6-INS-2).
  - **[INS-D] large broker or PoSP platform:** a learning interview. It is reported separately and weighted by renewal
    volume, never in the KC1 firm count.
  - **Register-random rows** (selection = random) are the unbiased read of how common renewal desks are. Treat them exactly
    like the others, and do not drop them because they look small. A small firm is the finding.
- [ ] **Open the note.** Copy `note-template.md` to `data/discovery/YYYY-MM-DD_<target-id>.md`. `data/` is gitignored.
- [ ] **Have these open:** `kc-answer-sheet.md`, the price card (§13.2) and Appendix A's live table.
- [ ] **Write the one thing you most need to learn** at the top of the note.

---

## 3. Time plan

| # | section | minutes | feeds |
|---|---|---|---|
| 0 | Opening and consent | 2 | (ethics) |
| 1 | Role, book mix, size | 3 | qualification, stratum check |
| 2 | Current calling workflow, last cycle | 7 | KC1, KC3, re-quote (solicitation), competition, escalation |
| 3 | Volumes and the model inputs | 6 | KC1 (due/month, due per seat), KC3 (baseline), connect rate, seasonality |
| 4 | Costs and commission | 4 | KC2/KC3 value per save, attrition, H2b |
| 5 | Tools and premium source | 2 | integration, H8, mis-quote risk |
| 6 | Failures, leakage and fear of fake calls | 3 | KC3, trust design |
| 7 | Compliance: number, recording, QA, complaints | 4 | KC5 input, 1600 probe, IMF reg 3(d) |
| 8 | Decision process | 2 | KC4, H10 |
| 9-11 | Concept card, price card, holdout | 7 | KC2, H2b, KC7 design |
| 12 | Close: artefacts, referrals, next step | 2 | KC4, KC7 setup |
| | **total** | **about 42** | Drop (opt) items to stay near 40 |

[RE] and [LEN] calls keep the round-1 timings: about 40 minutes with their own modules.

---

## 4. Section 0: Opening and consent (read close to verbatim)

> "Thanks for making time. Quickly, so you know what this is: I'm starting a company that builds phone-calling software for
> Indian businesses. Right now I'm only doing research. There's no product and I'm not selling anything today.
>
> I'd like to ask about how your team actually worked over the last month or so. I'm not after opinions about products. You
> can skip any question.
>
> Please don't share any customer's name, number or policy or loan number. Counts and examples without names are perfect.
>
> Is it OK if I record this for my own notes? I'll delete the recording once I've written them up, and nothing I share later
> will name you or [Company]."

- If they say **yes**, note `recording: yes, consent given at 00:00` and start recording.
- If they say **no**, take notes only. Don't push.
- If you use any AI transcription tool, **say so** and get a separate yes: "I'd also use an automatic transcription tool for
  the notes; is that OK?"

---

## 5. Section 1: Role, book mix and size (3 minutes)

1. "What's your role, and what does your team own? Who do you report to?"
2. **[INS] M:** "Roughly what's the mix of your retail book: two-wheeler, car, health, life? And mostly individual customers,
   or mostly companies and groups?"
   - *Qualification (`scoring.md` §1):* a book that is mostly commercial or group is out of scope. Finish politely and record
     "not qualified".
   - **[INS-B]** If the firm is an NBFC or finance company selling to its own borrowers, ask: "Is most of it credit-linked
     cover sold with a loan?" Credit-linked cover is often single premium, so there may be no renewal to call about. Record it.
3. **[INS] M:** "How many retail policies fell due for renewal last month, by line? Is that typical?" Record the number per
   line with its grade.
   - This is the KC1 numerator in its round-2 form (due renewals a month; `scoring.md` §2.2).
   - It also gives the per-line bill in §13.
4. **[INS] Stratum check:** "Are you registered as a broker, a corporate agent or an IMF? Do you also run PoSPs?" If the answer
   contradicts the `targets.csv` stratum, record the true type. Score by the **true** type and log the mismatch.
5. **[RE]**: "Are you a developer selling your own projects, or a channel partner working several developers' inventory?"
6. **[LEN]**: "What do you lend, and what's a typical EMI? For agencies: whose accounts do you work, and in which buckets?"

---

## 6. Section 2: Current calling workflow, last cycle (7 minutes)

This is the core of the interview. Get one concrete story, end to end.

**[INS] main question (M):** "Take last month's renewals. When did the list of policies falling due arrive, from where, and in
what form? Then walk me through what happened to it, step by step."

Probes:
- **M** "Who made the calls? How many people, full-time on renewals or mixed with other work?" (KC1, round-1 form)
- "How many days before expiry do you start calling?"
- "What happens when the customer says yes? How do they pay: link, cash, autopay?"
- "What happens to the ones who didn't answer, or said 'later'?"
- **M: competition.** "Before your team reaches the customer, who else has already contacted them about this renewal: the
  insurer's own team or bot, an online aggregator, the car dealer? How often do you find they've already renewed elsewhere?"
  (KC3)
  - Why: Gnani (Renewal365) and SquadStack sell motor and life renewal automation to insurers, and Policybazaar runs renewals
    in-house. The intermediary competes with an insurer automating the same call (vendor claims,
    `../lanes/l4b-measured/round2/competition-intermediary.csv`).
- **M: re-quote and selling at renewal.** "On a motor renewal, how often does your caller quote other insurers, change the IDV
  or add-ons, or switch the customer to a new insurer? Who on the team does that, and are they certified?" (Solicitation
  question.)
  - Why: stating the insurer's renewal premium is information. Offering a different plan, insurer or discount is promotional
    and may be "solicitation".
    - Promotional content tips the whole call to the 140 series (TCCCPR def (av) proviso).
    - Telephonic solicitation is reserved for certified persons (Authorised Verifiers or Specified Persons; CA Regs Sch VII;
      WA Regs Sch).
  - If most motor renewal value comes from re-quotes, the AI's role shrinks to reminders and payment links, and KC2 and KC3
    must be re-tested on that narrower role (l1 round 2, U6-INS-3; confidence medium).
- **M: escalation at 8 pm.** "When a customer calls back at 8 in the evening, or on a Sunday, wanting to talk about the renewal,
  who picks up? What happened the last time?"
  - Why: the model assumes 5-25% of reached customers ask for a human, at 2-6 minutes each, with VP paying for it. That
    assumption moves launch gross margin by 7-21 points on the per-renewal card (`../lanes/l2-economics/round2/verify.md` §2-3).
    Who staffs the queue decides who bears the cost.
- (opt) "Do you also cross-sell or upsell on that same call?" One offer line makes the call promotional (SYNTHESIS §6.2).

**[RE] main question:** "Take the last enquiry that came in from your website or a portal. What happened to it, minute by
minute, until it became a site visit or died?"

Probes:
- "Where did last month's enquiries come from: your own site, Google or Meta ads, 99acres/MagicBricks/Housing, channel
  partners, bought data, walk-ins? Roughly what share each?" (RE-K1)
- "How fast was the first call? Who called? How many attempts before you give up?"
- "Who books the site visit, and how is it confirmed?"
- "What happens to enquiries that come in at night or on Sundays?"

**[LEN] main question:** "Take last month's EMI cycle. Starting about a week before the due date, walk me through who got
called, when, by whom, and what happened by day 30."

Probes:
- "How many accounts were due? How many got a call before the due date? How many fell into 1-30 days past due?"
- "What does the caller say? Is there a script? Who wrote it?" (Ask for it at the end.)
- "What happens after a promise to pay? Who checks whether it was kept?"
- "**[Agencies]** What exactly does the lender hand you, and when? Which buckets? What do they pay you, per account or as a
  percentage?"

### What the answers mean

| answer pattern | reading | criterion |
|---|---|---|
| **[INS]** At least 3 people work renewals by phone, or there is a named renewal desk | Desk exists (round-1 form) | I1-desk, toward **KC1** passing |
| **[INS]** Renewals happen only through PoSPs, branch staff or the insurer, with no central phone effort | No desk to sell to | Against **KC1**. If common in a stratum, the buyer is the platform, not the firm |
| **[INS]** The insurer, an aggregator or the dealer usually reaches the customer first, and many renew elsewhere | The intermediary is losing the race already | Leakage exists (good for **KC3**), but the AI must call earlier than the insurer. Record how many days before expiry the insurer calls |
| **[INS]** Motor renewals are mostly won by re-quoting or switching insurer | The service-only call may not fit | **I11 −1**. Re-test KC2/KC3 on a reminder-only role. Note for counsel (solicitation question) |
| **[INS]** Nobody answers after hours, or callbacks wait until the next day | VP would carry the escalation load | Use the "VP pays escalation" floor in `scoring.md` §2.3 |
| **[INS]** A named person or team takes evening callbacks | The buyer carries the escalation load | Use the lower floor (2W ₹22, not ₹29) |
| **[INS]** The renewal list is a spreadsheet or insurer-portal export | Integration is easy | **I5**. Record the format exactly |
| **[RE]** Most volume comes from their own digital inquiries | The 140xx 7-day-window design fits | Against **RE-K1** (good) |
| **[RE]** Most volume comes from bought or cold lists | The consented design does not fit | Fires **RE-K1** if this is the majority |
| **[LEN]** There is a phone desk for pre-due and 1-30 DPD, beyond field visits | Buyer exists | Qualifies the lead for LEN scoring |
| **[LEN]** MFI collection is entirely through group meetings and field staff | Weak fit for MFIs | If most MFIs say this, drop MFIs from alternate 2 |

---

## 7. Section 3: Volumes and the model inputs (6 minutes)

Ask for last month's figures. If they don't know, ask "where would I find that number?" and request the report at the end. For
[INS], these are the inputs the per-renewal model assumed and nobody has measured. Record each **per line** where you can.

| | [INS] | [RE] | [LEN] |
|---|---|---|---|
| list size per month | **M** policies falling due, by line | new enquiries, by source | accounts due; accounts entering 1-30 DPD |
| calls | **M** dials per day per person; connected calls per day per person | first-call time; attempts per enquiry | calls per account; connect rate |
| outcome | **M** renewals collected, by line | site visits booked, and visits that happened | paid on time; cured within the cycle; promises kept |
| talk time | average minutes per connected call | same | same |
| people | **M** renewal callers (FTE) | pre-sales callers (FTE) | tele-callers (FTE) on this bucket |

**[INS] model-input probes:**
1. **M: due renewals worked per caller.** "How many due policies does one caller handle in a month: dialling, quoting, chasing
   the payment?"
   - This is the first of the two unmeasured inputs that decide whether AI beats the buyer's own desk.
   - The model assumed 800-3,000 a month (mode 1,500). Under the "talk-minutes" method a seat would have to work
     6,500-19,600 due a month for the desk to be as cheap as the model says, which is implausible (`verify.md` §5).
   - Their number replaces both.
2. **M: connect rate and attempts.** "Out of 100 customers on the list, how many did you actually speak to? How many attempts
   before you stop? What share of numbers are wrong or switched off?"
   - The model assumed 30-55% answer per attempt (mode 42%, from a vendor blog's 46-48% for all telecalling), 75-95% right
     party, and 75-95% reachable at all.
3. **M: renewals before the first call, and among the never-reached.** "Of last month's renewals, how many paid before anyone
   called them? Of the customers you never managed to reach, roughly how many renewed anyway?"
   - The first is the model's `s_pre`. It decides whether per-renewal billing charges for renewals that would have happened
     anyway (19-29% of billed renewals in the model; `verify.md` §3a).
   - The second is the closest thing to a no-call baseline (KC3).
4. **M: renewal ratio by line.** "Last year, what share of your two-wheeler, car, health and life (year 2+) policies renewed
   with you? Where does that figure come from?" (KC3, `scoring.md` §2.4.)
   - Policybazaar's own disclosures give first-renewal health leakage of 13.4-15% (JFM'26 / FY26, by policy count), and
     overall-book leakage of about 11%.
   - Star Health reports 95-98% by premium. Ask which basis their figure uses: policies or premium.
5. **M: seasonality.** "Which month had the biggest due list last year, and which the smallest? Roughly how big was the
   smallest month compared with an average month?"
   - The model assumed a trough of 70-90% of the average month for motor and 55-85% for life, from the January-March
     new-business peak.
   - A monthly minimum collides with the trough month (§13).
6. (opt) "Of the customers you did reach and who were going to lapse, roughly how many did your best caller turn around?
   And an average caller?"
   - This is the human save rate. It anchors the second unmeasured input: AI-human persuasion parity, which the model assumed
     at 0.5-1.05 of human, mode 0.8.
   - Ask only about past results. Never ask "would an AI do as well".

Also ask:
- **[INS]** "Does that change by month? When is the peak?" (Covered by item 5 if asked.)

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| **[INS]** Due renewals a month ≥ 3 × their own due-per-caller (or ≥ about 6,800 if they can't say) | A 3-seat-desk-equivalent book | **I1 +1** (KC1, round-2 form) |
| **[INS]** Due renewals a month below that, even with 3+ people on the phone | People exist but the book is small (or the callers do mostly new business) | **I1 −1** on the round-2 form, even if I1-desk is +1. Record both |
| **[INS]** Main-line renewal ratio without calling is at or above that line's break-even (2W 63%, car 96%, health 97%, life 93%), with A/B evidence | No fee window on that line | **I2 −1** (KC3). Old rule: ≥90% (`scoring.md` §2.4) |
| **[INS]** Main-line ratio below break-even, and they can show it | Leakage exists | **I2 +1** |
| **[INS]** Due per caller well above 1,500 a month | Their desk is cheaper than the model assumed | Weakens "AI is cheaper than the desk". Record for the model |
| **[INS]** Connect rate per attempt well below 30%, or many wrong numbers | Fewer reachable customers; AI minutes per renewal rise | Record. Lowers the yield per minute and the save count |
| **[INS]** A large share renew before any call | Per-renewal billing charges for renewals that would happen anyway | Expect pushback in §13.4. Use the post-first-attempt floor if they refuse |
| **[INS]** Trough month below about 70% of average | The ₹15k minimum may exceed usage in that month | Note it for the minimum in §13 |
| Calls per month and minutes per call | Inputs for the conversion | Appendix A and H7. SYNTHESIS's 9,440 calls a month for insurance is assumption-driven |
| **[RE]** Fewer than about 300 enquiries a month | Too small to measure anything | Note for H7 (l6: 3.5% of RE buyers can test a +10% lift in month one) |

---

## 8. Section 4: Costs and commission (4 minutes)

1. "What does a [renewal / pre-sales / collection] caller cost you a month, all in: salary, incentive, seat, phone, data?"
   - Anchor: Apna's median posted telecaller pay is ₹17,000 (n=1,234, l2). Don't say the number. Check theirs against it
     afterwards.
2. **M: attrition.** "Last year, how many callers left, out of how many? How long does a new one take to be useful? What does
   replacing one cost you?" The brief names attrition explicitly, and round 1 never asked it.
3. "What do you pay for telephony or a dialler? Per minute, per seat, or a flat fee?" (**H2b**: what unit they already buy in)
4. **[INS] M: commission by line.** "On an average renewal, what commission do you actually receive, as a percentage, for a
   two-wheeler, a car, a health policy and a life policy in year 2 or later? Did that change after October 2025?"
   - Why: the model's commission rates are assumptions, and commission is the input that sets the value of a save.
   - Observed life renewal-commission ratios are lower than the model assumed: industry 3.7% in FY26, private insurers 0-3.2%.
     At those rates life's value per save halves, to about ₹1,040 (`verify.md` §1).
   - Insurers reportedly cut retail health and individual life commissions by about 15-18% from 2025-10-01 (secondary source,
     low confidence).
5. **[INS] M:** "Who earns the commission if the policy lapses and the customer later renews directly with the insurer, or buys
   elsewhere? Have you ever lost a renewal code that way?" (KC3: commission at risk)
6. (opt) **[INS]** "IRDAI's consultation paper of 23 September proposes caps on renewal commission. Have you looked at it? What
   would it do to how you work renewals?"
   - Comments are due on 25 October 2026. The proposed maximums for distribution entities are:
     - individual health renewal 5%;
     - old-vehicle motor: TP 2.5%, OD 10%;
     - life renewal 2-3%.
   - This is a proposal only (`../lanes/l4b-measured/round2/irdai-distribution-consultation-excerpts.txt`).
   - An opinion answer, so grade D. It is context for KC2 and KC3, never a firing input. Do not explain the paper to them.
7. **[RE]** "What is a site visit worth to you? What share of visits book? What's your commission or margin on a booking?"
   (**RE-K2** anchor)
8. **[LEN]** "What does an account rolling from 1-30 into 31-60 cost you? **[Agencies]** What do lenders pay you, per account or
   as a percentage of collection?" (**LEN-K2** anchor)
9. "Have you paid any outside vendor for calling, such as a BPO, an agency or a bot? What did it cost, and what happened?"

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| They already pay a vendor per minute | The per-minute frame is entrenched | **H2b** evidence against outcome pricing. Record the rate |
| They pay agencies or BPOs per outcome | The outcome frame already exists | **H2b** supported |
| **[INS]** The original agent or PoSP keeps the commission on lapse, or the firm loses nothing | No money at risk for this buyer | **I2 −1** (KC3) |
| **[INS]** The firm names a commission it loses | Pain has a price | Compute value per save = premium × their commission % (`scoring.md` §7) |
| **[INS]** Life renewal commission at or below about 3% | Life value per save about ₹1,000, not ₹1,941 | Life fee on the card fails the buyer test (`scoring.md` §2.3). Treat life like 2W |
| **[INS]** Attrition above about 50% a year, or ramp-up above a month | Desk capacity is fragile | Pain evidence. Raises the true cost of the desk; supports the coverage argument |
| Callers cost well above or below ₹17k | The local cost baseline differs | Feeds the ₹6-9 per connected minute comparison (l2v) |

---

## 9. Section 5: Tools and the premium figure (2 minutes)

1. "What does the list live in: Excel or Google Sheets, an insurer portal, a CRM (which one), something you built?"
2. **[INS] M: premium source.** "When your caller tells a customer the renewal premium, where does that figure come from: the
   insurer's renewal notice, a fresh quote from the insurer's portal, or the list? How often has a quoted premium turned out
   wrong?"
   - Why: motor renewal premiums move with NCB and IDV, and quotes come from each insurer's portal. A stale figure read out by
     an AI is a mis-selling risk.
   - Round 1's "integration ease 4" has no source (critic A12 and §6.5).
3. "What do your callers dial from? A mobile, a desk phone, a cloud dialler? Which provider?" (Detail in §11.)
4. "Do you send WhatsApp reminders? Through which provider? Templates or manual messages?"
5. "Have you tried an IVR, robocall or voice bot? What happened? What did it cost?"
   - Small intermediaries can already self-serve Indian voice AI. For example, MyOperator lists ₹10,000 a month including
     2,000 minutes, and Ringg's self-serve plan is $0.10 a connected minute (vendor claims).
6. **[RE]** "Does your CRM call the lead automatically? Sell.Do, LeadSquared and others now offer this."
7. "If you added a new calling tool, would it have to sit inside your CRM, or could it be separate?" (**H8**) Then: "When you
   last added a tool, did it plug in, or did someone copy data across?"

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| Spreadsheet or CSV upload is normal | A thin console works | **I5 +1** |
| **[INS]** Premium comes from a fresh insurer-portal quote per policy | The AI needs a quote integration or a pre-filled field per policy | **I14**. Integration cost rises; the list alone is not enough |
| **[INS]** Premium comes from the insurer's renewal notice, already on the list | A list field is enough | **I14 +1** |
| They are on LeadSquared or Sell.Do and already testing its voice AI | The incumbent is in the door | Context for **RE-K3** and insurance competition. Ask what it costs and whether it works |
| They tried a cheap self-serve bot and stopped | The category is known and was found wanting | Ask why. Strong evidence for the quality thesis, or against the category |
| They'd only buy inside a replacement CRM | The suite matters | **I7 −1**. Five or more of the first 15 triggers the H8 revisit |
| Mobile phones on personal SIMs | No dialler data, and the number path is unmanaged | See §11 |

---

## 10. Section 6: Failures, leakage and fear of fake calls (3 minutes)

1. "Tell me about the last month that went badly. What happened?"
2. **[INS] M:** "Think of the last few policies that lapsed. Why did they lapse? Did anyone call them? How many calls?"
3. **[INS] M: fear of fake renewal calls.** "How often does a customer refuse to pay, or hang up, because they think your
   renewal call or payment link is a fraud? What do your callers do to prove they're genuine? Has a customer of yours been
   cheated by a fake renewal caller?"
   - Why: police have raided fake motor-renewal call centres. One in Navi Mumbai was linked to 145 complaints and ₹14.08 lakh;
     in Delhi, owners' details were bought at ₹5 a record.
   - IRDAI's own annual report says spurious calls impersonating insurers "pose a significant threat" (secondary and primary
     sources, `../lanes/r2-untouched-raw/trust-fraud-evidence.csv`).
   - An AI voice plus a WhatsApp payment link looks like that pattern.
4. **[RE]** "Think of the last few good enquiries you lost. What happened?"
5. **[LEN]** "Think of the last few accounts that rolled into 31+. Were they called before the due date? What did they say?"
6. "What complaints have you had about your calls, from customers, the regulator, a telecom operator or a principal?"
   (**LEN-K3**, **KC5**). Bima Bharosa detail is in §11.
7. "When callers talk to older customers, or customers who don't speak Hindi or English, what goes wrong?"
   - This feeds the battery personas and **KC6**. Our measured demo agents cut into an elderly caller's pause on 5 of 6 calls
     (l4bv).
8. "What have you done about any of this in the last six months? Did you spend money on it?" (Mom-Test: if they haven't tried
   to fix it, it may not hurt enough.)

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| Lapses happen because nobody reached the customer in time | AI's strength is coverage | Supports the wedge; pain score |
| Lapses happen because of price, claims experience or a competitor's offer | Calling won't fix it | Weakens the pain; lowers the value per save |
| **[INS]** Customers often suspect fraud; callers send ID or insurer links to prove themselves | Trust is a live barrier | **I17 −1** for a link-first design. Product must work without a cold payment link (insurer-portal renewal, autopay, callback to a known number). Feeds the listener panel |
| **[INS]** "Customers know our callers; nobody asks" | Trust rides on known people | Watch the number question (§11): a switch to 1600 or to AI may lose that trust |
| They hired, bought a tool or ran a campaign in the last 6 months | Real pain with budget | Pain score 3 |
| "It's fine, it's just how it is" and nothing tried | Low pain | Pain score 0-1 |
| **[LEN]** Complaints about tone, harassment or calling hours | Conduct sensitivity is high | Context for **LEN-K3** |
| Callers struggle with language mix or older customers | Quality bar matters to them | **I9 +1**. Record which languages |

---

## 11. Section 7: Compliance, number, QA and complaints (4 minutes)

Ask these neutrally. You are learning what they do, not auditing them.

1. **[INS] M: the number.** "What number do customers see when your team calls about a renewal: a caller's own mobile, a
   company mobile, a landline, a 140 number, a 1600 number? Who set that up, and when?"
   - **What the rule says.** IRDAI's circular of 06-01-2026 is addressed to "All Insurers and Insurance Intermediaries". From
     15-02-2026 it requires 1600-series numbers "for all service and transactional voice calls", with no such calls from other
     numbers "irrespective of explicit or inferred customer consent".
   - **Who is covered.** Brokers, corporate agents, IMFs and web aggregators. Coverage of PoSPs calling from personal phones
     is unclear (l1 round 2, verify §1; U6-INS-1 and U6-INS-6).
   - **So this is a compliance probe.** An answer of "personal mobiles" or "10-digit numbers" means the firm has been
     non-compliant since 2026-02-15. Score it **both ways**: as a possible **buying trigger** (they need a compliant path) and
     as evidence the rule is **not enforced**.
   - Then ask (M): "Has anyone, such as your insurer partners, a telecom provider or IRDAI, raised the 1600 numbers with you?
     What did you do?"
   - Do not tell them they are non-compliant.
2. **[INS]** (opt) "If you moved to a 1600 number, what do you think would happen to how many customers pick up?" (Grade D.)
   - The only number found is Truecaller's claim that its users ignored 79% of 1600-series calls over the eight months to
     July 2026. That is an interested party's data, with no baseline.
   - From 2026-11-01, CNAP shows the caller's KYC name on 4G calls. A telecaller on a personal SIM will show the telecaller's
     own name, not the firm's (DoT circular 13-10-2026).
3. "Have you registered headers or templates on a DLT portal? Who did that for you?"
4. "Has any operator, TRAI or the regulator ever flagged, blocked or warned about your numbers?"
   - Personal SIMs making 80-150 calls a day sit in the top ~0.13% of TRAI's P2P distribution, which is what operator spam
     detection looks at (TRAI CP 28-08-2024, inference).
5. **[INS] M: QA and Bima Bharosa.**
   - "Do you record renewal calls? How many does anyone listen to, and who? How long do you keep recordings?"
   - "When a customer complains, to you, the insurer or IRDAI's Bima Bharosa, how does it reach you and who handles it? How
     many did you have last year, and what about?"
   - Why: IRDAI recorded 2,57,790 grievances in 2024-25. Life "unfair business practices" (mis-selling) grievances rose to
     26,667 (IRDAI Annual Report 2024-25).
   - An AI renewal caller needs recording retention, call sampling, dispute handling and a grievance route. None of these is in
     the round-1 product thesis.
   - Required records sit in India for at least 10 years (IRDAI Maintenance of Information Regulations 2025, reg 13 and 16;
     l1 round 2).
6. **[INS-C] IMF only, M:** "Does the firm do any selling or renewal calling by phone today? Who makes those calls: your own
   certified ISPs, or other staff? Did you take IRDAI approval for distance marketing?"
   - Ask to learn, not to audit. IMF Regs reg 3(d) allows IMF distance marketing only without telemarketers, only through ISPs
     and only with prior approval.
   - Answers here go to counsel's IMF question (`plan.md` §8).
7. "How do you know a customer agreed to be called? Where is that recorded?"
   - **[RE]** "Your enquiry form says the consent overrides DND. What happens with enquiries from numbers on DND?" (**RE-K5**)
8. "Do you tell customers the call is recorded?"
   - **[LEN]** "What are you changing for 1 January 2027?" Do not lecture them on the rules.
9. **[LEN]** "When you hire a calling vendor, do they go through your recovery-agency empanelment or DRA certification?"
   (**LEN-K1**)
   - **[Agencies]** "Do you call from your own numbers or the lender's?" (**LEN-K4**)
10. **[LEN]**, **[INS-D]**, larger firms: "Do your contracts with vendors require data to stay in India? Who signs off?"
    (**LEN-K5**, residency)

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| **[INS]** Already on 1600 through a CPaaS | A compliant path exists for at least some intermediaries; the TRAI comparison then says the l3 seat model is high | **I8 +1** (KC5 input). Record the CPaaS name |
| **[INS]** Personal mobiles or 10-digit numbers, and they knew about 1600 and did nothing | The rule is not biting yet | **I8 −1**, plus a "not enforced" mark. Also explains why TRAI's 1600 volume undercounts in-reach calling |
| **[INS]** Personal mobiles, and they are worried or have been asked by an insurer to move | A dated compliance trigger | **I8 −1**, plus a "buying trigger" mark. Strong positive for the pilot conversation (number set up in their name) |
| **[INS]** Recordings kept and sampled; a named grievance owner | The buyer has a QA habit VP must plug into | **I18 +1**. Record the retention period |
| **[INS]** No recordings, no QA, complaints handled ad hoc | VP would have to supply QA and grievance routing | **I18 −1**. Product requirement, not a kill |
| **[INS-C]** Phone renewal or sales calls made by non-ISP staff, without IRDAI distance-marketing approval | IMF reg 3(d) exposure | Input to counsel. **No pilot ask** to this firm until counsel answers (stratum rule) |
| **[RE]** A large share of inquiry numbers are on DND, and they "just call anyway" | The legal route is narrow | Toward **RE-K5** |
| **[LEN]** Vendors must be empanelled as recovery agencies | AI-as-agency question is live | Input to **LEN-K1** |
| **[LEN]** Agencies call from the lender's 1600 numbers | One path exists | Against **LEN-K4** |
| Data must stay in India, contractually | Residency is binding | Toward **LEN-K5** (no centralindia meter for the GPT-6 family, §6.11) |

---

## 12. Section 8: Decision process (2 minutes)

Use the last real purchase.
1. "What was the last tool or service you bought for this team?"
2. "Who first found it? Who had to say yes? How long from first conversation to paying?"
3. "Did you run a trial or pilot first? Was it paid? What did it have to show?"
4. "How did you pay: monthly invoice, annual, advance? Who holds that budget?"
5. "If something like this needed approval, who else would be in the room?" Ask for the role only.

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| The founder or principal officer decides alone, in weeks | Matches **H10** | **I6 +1**. **KC4** feasible |
| Procurement, IT security and compliance sign-off, in months | Platform-like cycle (3-9 months, l4c) | **I6 −1**. Expected for [INS-D] |
| They have paid for a pilot before | They will pay for proof | Strong positive for **KC4** |
| "We only use free trials" | Paid-pilot proof is hard here | Against **KC4** |

---

## 13. Sections 9-11: Concept card, price card and holdout (7 minutes)

Ask pricing **last**, after the facts. Pricing answers are hypothetical, so they are weaker evidence than everything before them.
Treat them as ranges, not commitments.

### 13.1 Read the concept card verbatim

Same words for everyone. No adjectives. No claims about quality.

**[INS]**
> "Here's one idea we're weighing. It doesn't exist yet in this form. A service, run by us, phones the customers on a renewal
> list you give us, from a 1600 number set up in your firm's name. At the start it says it is an automated assistant calling
> for [your firm], with your IRDAI registration number. It speaks the customer's language, tells them the due date and the
> insurer's renewal premium from your data, answers simple questions about their own policy, and sends a payment or autopay
> link on WhatsApp. It never quotes another insurer, never changes the cover and never sells anything new: anyone who wants
> that, or wants a person, goes to your team."

Then ask, **before any price**: "What's the first thing that worries you about that?" Write the answer down word for word. That
is the objection list.

**[RE]**
> "Here's one idea we're weighing; it doesn't exist yet. A service, run by us, calls each new enquiry from your website, ads and
> portals within minutes, inside the permitted hours and consent rules. It says it is an automated assistant for [your firm],
> asks your qualifying questions, offers site-visit slots from your team's calendar, sends a WhatsApp confirmation and hands hot
> leads to your sales person. You'd pay per qualified site visit booked, with a monthly minimum."

**[LEN]**
> "Here's one idea we're weighing; it doesn't exist yet. A service, run by us, calls borrowers before the EMI date and in the
> first 30 days overdue. It says it is an automated assistant for [lender], states the amount and due date from your data,
> calls only in permitted hours, records every call and keeps logs, takes a promise to pay or sends a payment link on WhatsApp,
> and passes disputes and hardship cases to your team. You'd pay per account brought current, with a monthly minimum."

### 13.2 [INS] The price card (read it, then show the bill on their own numbers)

> "If we built it, the price would work like this. You'd pay only for renewals collected from the list we work:
> - ₹50 for each car renewal;
> - ₹15 for each health renewal;
> - ₹15 for each life renewal premium in year 2 or later;
> - ₹20 for each two-wheeler renewal.
>
> There's a monthly minimum of ₹15,000, and whatever you use counts against it.
>
> We'd also leave a random 1 in 10 of your list to your usual process. We'd never bill for those, and every quarter we'd show
> you the difference between the two groups."

Then compute their monthly bill **live** from the due numbers in §5 and §7 (Appendix A, table A2). Say it as a rupee total:
"On last month's list that would have come to about ₹__."

**Where the card comes from.** It is the round-2 per-renewal Monte Carlo (`../lanes/l2-economics/round2/renewal-model.json`,
n = 20,000, reproduced byte-identical by its verifier).
- **The rule** (`renewal_model.py`, step 3). Each fee is the highest rung at which the buyer gains against no calling with
  probability ≥ 0.8 and against its own desk with probability ≥ 0.6. Two-wheeler is exempt from the desk test. The model assumes
  a human desk works only 10-60% of a 2W list, because the ticket is small.
- **Model gross margin at launch scale** (VP at 100k minutes a month in aggregate):
  - car ₹50: 67%;
  - health ₹15: 45%;
  - life ₹15: 33% (50% at ₹20);
  - two-wheeler ₹20: 13%.
- **In per-minute terms** these fees equal ₹10-23 per AI-connected minute. Per-minute pricing at ₹6-8 loses money in every
  line at launch costs (gross margin −47% to +1%).

**Caveats you must know** (`verify.md` §3-4; do not read these to the buyer):
1. **Life is the weakest line.** At observed private renewal-commission rates (≤3.2%), life fails the buyer test at ₹15, and at
   ₹10 its margin is about 0%. Treat life like two-wheeler until §8 item 4 says otherwise.
2. **The minimum excludes small buyers.** ₹15,000 is a judgement call, not a model output. It exceeds modelled usage below about
   935 due renewals a month (about 1,150 in the trough month). For a 150-due agency it is 7× usage and 2.2× its whole
   commission gain. The card therefore prices out most IMFs and small agencies. Record their reaction; do not offer a lower
   minimum on the call.
3. **Health may be overstated.** Health value is probably about 15% lower after the post-GST commission cuts.
4. **The proposed IRDAI caps would cut values further** (computed here, proposal only). Under the 23-09-2026 consultation caps,
   the value per save falls:

   | line | value per save under caps, p50 | ratio to the model value |
   |---|---|---|
   | two-wheeler | about ₹116 | 0.42 |
   | car | about ₹1,060 | 0.43 |
   | health | about ₹915 | 0.33 |
   | life | about ₹955 | 0.49 |

   Scale the buyer's ceilings in A1 by the same ratios (an approximation). The car fee then still sits below the ceiling
   against no calling (about ₹80) and against the desk (about ₹27-32).
   - The health, life and two-wheeler card fees would exceed what the buyer gains against its own desk: about ₹7-11 for
     health and ₹9-15 for life.
   - The two-wheeler fee would exceed even the ceiling against no calling (about ₹15).

### 13.3 [INS] Two definitions that move the margin (ask both, M)

1. **What counts as a renewal collected (M).** "Some customers pay before we'd even have called them. Would you expect to pay the
   fee on those too, or only on renewals that came in after our first call?"
   - If "only after our first call", the 40%-margin fees rise: car ₹35, health ₹19, life ₹24 (`verify.md` §3a).
   - Under that billing, the card's health and life fees fail on margin. Record the answer; it switches the floor used in
     `scoring.md` §2.3.
2. **Who handles the hand-offs (M).** "When a customer asks for a person, would your team take those calls, including in the
   evening, or would you expect us to?"
   - If their team takes them, the two-wheeler floor falls from ₹29 to ₹22 and every line's margin rises.

### 13.4 [INS] The holdout (M)

> "About the 1 in 10 we'd leave to your usual process: if the service works, those customers would renew a little less often
> than the rest. On your list that might cost you roughly ₹__ a month in commission (Appendix A, A3). Would you accept that, to
> see the difference for yourself? If not 1 in 10, what would you accept?"

- Record the answer as accept / smaller share (which) / refuse. This is **I10** (KC7 pilot design).
- Then say plainly, because it is true: "For car and two-wheeler on a list your size, the difference should show within a few
  months. For health and life it may take a year or more, unless the list is very large."
  - **Basis** (`renewal-mde.csv`; 10% holdout, median modelled lift, no seasonality):

    | due a month | 2W | car | health | life |
    |---|---|---|---|---|
    | 1,500 | 2.9 months | 5.4 | 25.8 | 20.7 |
    | 25,000 | 0.2 months | 0.3 | 1.6 | 1.2 |

  - Below about 25,000 due a month, health and life lift cannot be measured monthly.
- Never promise a lift percentage.

### 13.5 [INS] Gabor-Granger on their main line (3-4 asks, step up or down)

Run it on the line with the most due renewals (from §5). For the other lines ask only: "And at ₹[card fee] for [line]?" (one
answer each).

> "At ₹[price] per [car / health / life / two-wheeler] renewal collected, which on last month's list comes to about ₹[monthly
> figure], with the ₹15,000 monthly minimum, would you approve a 6-week **paid** pilot on next month's list?"

Answer options: definitely / probably / not sure / probably not / definitely not.
- If **definitely** or **probably**, step **up** one rung. Otherwise step **down** one rung.
- Stop after 4 asks, or at the top or bottom rung.
- Record the highest price with a "definitely" or "probably" as **GG-max**.

| line | ladder (₹ per renewal collected); start at the card price in **bold** | model launch GM at each rung | P(buyer gains vs own desk) at each rung |
|---|---|---|---|
| car | 25 · 30 · 40 · **50** · 60 · 75 | 33 · 44 · 58 · 67 · 72 · 78% | .81 · .77 · .68 · .60 · .53 · .42 |
| health | 10 · **15** · 20 · 25 · 30 · 40 | 18 · 45 · 59 · 67 · 73 · 80% | .78 · .64 · .50 · .38 · .29 · .16 |
| life (yr 2+) | 10 · **15** · 20 · 25 · 30 | −1 · 33 · 50 · 60 · 67% | .79 · .63 · .48 · .37 · .27 |
| two-wheeler | 10 · 15 · **20** · 25 · 30 · 40 | −75 · −16 · 13 · 30 · 42 · 56% | .99 · .91 · .77 · .61 · .46 · .25 |

GM is the p50 at 100k aggregate minutes a month. P is the talk-minute desk method. Both come from `renewal-pricing-grid.csv` and
both are assumption-driven. Never show these columns to the buyer.

### 13.6 Van Westendorp (4 questions, in their unit, on the main line)

Units:
- **[INS]**: ₹ per renewal collected on their main line.
- **[RE]**: ₹ per qualified site visit booked.
- **[LEN]**: ₹ per account brought current.

Ask in this order:
1. "At what price per [unit] would this be **so cheap** that you'd doubt it could work?"
2. "At what price would it be **a bargain**?"
3. "At what price would it start to feel **expensive**, though you'd still consider it?"
4. "At what price would it be **too expensive** to consider?"

If they can't answer in the unit, ask the same four questions as a monthly fee, then convert (Appendix A). If they insist on per
minute or per seat, record that: it is **H2b** evidence.

### 13.7 [INS] The unit at an equal bill (one question, I4 / H2b)

> "Same expected monthly bill, three ways to pay it. Which would you sign?
> (a) per renewal collected, as I described;
> (b) only for each extra renewal above the 1-in-10 comparison group, at roughly ₹[X] each;
> (c) per minute of call time, at roughly ₹[Y] a minute."

Fill X and Y for their main line from Appendix A, A4. For example, car: X ≈ ₹640, Y ≈ ₹23.5.

- Choosing (b) is the outcome frame, and it shifts the risk to VP.
- Choosing (c) is the per-minute frame.
- Record the choice and the reason. This is not an offer: say "we're trying to understand how you'd want to buy".

### 13.8 [RE] and [LEN] Gabor-Granger (unchanged from round 1)

> "At ₹[price] per [unit], which on your volumes comes to about ₹[monthly figure] a month, with a ₹25,000 monthly minimum,
> would you approve a 6-week **paid** pilot on next month's list?"

| segment | unit | ladder (₹); start in **bold** |
|---|---|---|
| [RE] | per qualified site visit booked | 150 · 300 · **450** · 600 · 900 · 1,300 |
| [LEN] | per account brought current (from 1-30 DPD within the cycle) | 30 · 50 · **80** · 125 · 200 · 300 |

### 13.9 Value per outcome (one question, past-anchored)

- **[INS]**: "Last year, when a policy lapsed that would have renewed if someone had reached the customer in time, what did that
  one lapse cost you: the commission, plus next year's renewal?"
  - The model's p50 values per saved renewal, at the line's commission, not the insurer's premium, are:
    - two-wheeler ₹265;
    - car ₹2,415;
    - health ₹2,737;
    - life year 2+ ₹1,941 (about ₹1,040 at observed private renewal commission).
  - Their own answer replaces these.
- **[RE]**: "What did your last booked sale earn you? What share of visits book?"
- **[LEN]**: "When an account rolls from 1-30 to 31-60, what does it cost you in provisioning, extra calls and field visits?"

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| **[INS]** GG-max on the main line ≥ that line's 40%-GM floor (`scoring.md` §2.3, chosen by the §13.3 answers) | Price clears VP's launch margin | **I3 +1** (KC2, round-2 form) |
| **[INS]** GG-max below the floor | Price too low for this line | **I3 −1** |
| **[INS]** "Only after your first call" and "you handle the hand-offs" | Both definitions go against VP | Use the strictest floor. Health and life likely fail at the card price |
| **[INS]** Refuses any holdout | Pilot cannot prove lift; non-inferiority needs a quasi-experimental fallback | **I10 −1** (KC7 design). Record the share they would accept |
| **[INS]** ₹15k minimum rejected as above their usage | The card prices out this buyer | Record. Expected for most IMFs and small agencies (§13.2 caveat 2) |
| **[INS]** Picks (b) per extra renewal | Outcome frame | **I4 +1** |
| **[INS]** Picks (c) per minute | Per-minute frame | **I4 −1**. Eight or more of 15 reopens the unit |
| Van Westendorp "too cheap" is above the card price | A low price would hurt credibility | Price higher, not lower |
| **[RE]** GG-max ≥ ₹300 per qualified visit | Price accepted | Against **RE-K2** |
| **[RE]** GG-max < ₹300 | Price too low | Toward **RE-K2** |
| "Definitely" at the top rung | Under-priced, or not taking it seriously | Probe: "What would you need to see in week 6 to keep paying?" |

---

## 14. Section 12: Close (2 minutes)

1. **Artefacts.** Ask for specific items you heard about:
   > "You mentioned [the due-list format / the call script / the disposition sheet / the dialler report / the renewal report].
   > Could you share a copy with customer details removed? Column headers and totals are enough."
   - The full list and redaction rules are in `plan.md` §5.
2. **Recordings:**
   > "Do you keep call recordings? If you'd ever be comfortable letting me listen to three or four with you on a screen-share,
   > with customer details muted, it would help us understand what real calls sound like. No copies needed."
   - Only on their terms (`plan.md` §5.2).
3. **Referrals:**
   > "Who else runs [this kind of team] that I should talk to? Would you introduce me?"
   - For IMFs, also ask: "Which insurer's channel manager looks after IMFs like yours?" Small IMFs are often reachable only
     through that route.
4. **Next step**, only if they qualify, the stratum rule allows it (not [INS-C] before counsel), and the call earned it:
   > "If we did build this and it passed our own quality tests on calls like yours, would you want to talk about a paid pilot
   > on one renewal list?"
5. **Thank them.** Promise the anonymised summary, and send it.

---

## Appendix A: The [INS] numbers to have open during the call

All model figures are p50s from `../lanes/l2-economics/round2/` (seed 20261017, n = 20,000). Every input is assumption-driven
unless the source column says otherwise. Replace them with the interviewee's numbers whenever you have them.

### A1. Per line

| | two-wheeler | car | health | life (yr 2+) |
|---|---|---|---|---|
| Value of one saved renewal to the intermediary (model) | ₹265 [162-413] | ₹2,415 [1,440-3,881] | ₹2,737 [1,865-3,848] | ₹1,941 [1,170-3,125]; ≈₹1,040 at observed private renewal commission (verifier) |
| Same, under the proposed IRDAI caps (computed here; proposal only) | ≈₹116 | ≈₹1,060 | ≈₹915 | ≈₹955 |
| Card fee | ₹20 | ₹50 | ₹15 | ₹15 |
| Fee equals ₹ per AI-connected minute | 9.7 | 23.5 | 16.1 | 12.4 |
| VP launch GM at the card fee | 13% | 67% | 45% | 33% |
| 40%-GM floor (all renewals billable, VP pays hand-offs) | ₹29 | ₹28 | ₹14 | ₹17 |
| Same, if only renewals after the first call are billable | above ₹35 (not computed) | ₹35 | ₹19 | ₹24 |
| Same, if the buyer staffs hand-offs | ₹22 | lower (not computed) | lower | lower |
| Buyer's ceiling vs no calling | ₹36 | ₹186 | ₹55 | ₹49 |
| Buyer's ceiling vs own desk (talk / seat method) | ₹29 / ₹36 | ₹63 / ₹75 | ₹20 / ₹32 | ₹19 / ₹31 |
| KC3 break-even no-call renewal ratio (mode case) | 63% | 96% | 97% | 93% |
| VP bill per 1,000 due a month at the card | ₹9.4k | ₹29.5k | ₹11.6k | ₹11.1k |
| Holdout cost to the buyer per 1,000 due a month (10% holdout) | ₹1.8k | ₹12.1k | ₹4.7k | ₹4.0k |

### A2. Live bill table (mixed retail book: 40% two-wheeler, 30% car, 25% health, 5% life; ₹16.05k per 1,000 due)

| due renewals a month | 500 | 1,000 | 1,500 | 3,000 | 7,000 | 9,000 | 25,000 (platform mix) |
|---|---|---|---|---|---|---|---|
| bill at the card | ₹8.0k → **₹15k minimum** | ₹16.1k | ₹24.1k | ₹48.2k | ₹1.12 L | ₹1.44 L | ₹3.96 L |

- **A 1,500-due broker.** The model's p50 bill is ₹24,068, falling to ₹19,653 in the trough month. Its commission gain is
  ₹81,195 a month (p50).
- **A 150-due agency.** Its bill is ₹2,103 a month, so the minimum is 7× usage.
- **Other line mixes** move the bill per 1,000 due: two-wheeler-only ₹9.4k, health-only ₹11.6k, life-only ₹11.1k, car-only
  ₹29.5k.
- **The revenue line.** SYNTHESIS's ₹1.1-1.5 lakh a month needs about 7,000-9,000 due a month on a mixed book. Depending on
  the mix, it needs 3,700-16,000.

**Formula for any book:**

  bill ≈ max(₹15,000, Σ over lines of due × 0.9 × renewal rate on the worked list × fee).

### A3. Holdout cost, for §13.4

- Formula: commission forgone ≈ Σ over lines of (due a month ÷ 1,000) × the A1 holdout cost.
- Example: the mixed 1,500-due broker forgoes about ₹8,600 a month (computed).

### A4. Equal-bill equivalents, for §13.7 (computed from the pricing grid)

| | two-wheeler | car | health | life |
|---|---|---|---|---|
| per extra renewal above the comparison group (X) | ≈₹150 | ≈₹640 | ≈₹740 | ≈₹580 |
| per AI-connected minute (Y) | ≈₹9.7 | ≈₹23.5 | ≈₹16.1 | ≈₹12.4 |

### A5. Converting any price to ₹ per AI-connected minute

Kept from round 1 for [RE] and [LEN]:
- Break-even price p\* = 6 × k × m ÷ r, where 6 is SYNTHESIS's ₹6/min floor.
- Defaults:
  - [RE]: k 1.5, m 2.5, r 0.05, giving p\* ≈ ₹450 per visit;
  - [LEN]: k 2.0, m 1.5, r 0.40, giving p\* ≈ ₹45 per account.

For [INS], the per-minute equivalent is in A1. The ₹6/min test is **retired** for insurance: per-minute pricing at ₹6-8 loses
money at launch costs (`scoring.md` §2.3).

## Appendix B: Red-flag phrases and how to redirect

| you hear | it is | redirect |
|---|---|---|
| "That's a great idea" | a compliment, worth nothing | "Thanks. What did you try last time this hurt?" |
| "We would definitely use it" | a future promise | "What are you using today? What did it cost last month?" |
| "Usually we..." / "Generally..." | a generalisation | "Take last Tuesday. What happened?" |
| "Everyone in the industry has this problem" | deflection | "And at [Company], last month?" |
| "Can it do X?" | a feature request | "Why do you need X? When did you last need it? What did you do instead?" |
| "Send me a proposal" | a polite exit, or interest | "Happy to. What would it need to show for you to approve a paid pilot?" |
| "Is this legal with the 1600 rule?" | a compliance question | "That's exactly what we're having a lawyer check. What have you been told?" Never advise |

## Appendix C: Why each round-2 probe exists

| probe | section | the gap it closes | evidence that prompted it |
|---|---|---|---|
| Telecaller attrition | §8 item 2 | The brief names attrition; round 1 never asked | Critic A12, §6 item 8 |
| Connect rate and attempts | §7 item 2 | Model answer rate 30-55% per attempt is a vendor-blog anchor | `renewal_model.py` COMMON `p_ans` |
| Insurer-direct and aggregator renewals | §6 | Insurers automate the same call (Gnani, SquadStack; vendor claims) | `competition-intermediary.csv` |
| Fear of fake renewal calls and links | §10 item 3 | An AI voice plus a payment link matches the scam pattern | `trust-fraud-evidence.csv` |
| Who answers at 8 pm | §6 | VP-paid escalation is 19-26% of launch cost | `verify.md` §2 |
| Premium source | §9 item 2 | Stale NCB/IDV premiums are a mis-selling risk; integration ease is unsourced | Critic §6 item 5 |
| Seasonality | §7 item 5 | A monthly minimum collides with the trough month | Critic §6 item 9; model `trough` |
| Holdout that forgoes commission | §13.4 | KC7 needs a holdout the buyer accepts | Critic §6 item 7; `renewal-mde.csv` |
| Number they call from | §11 item 1 | 1600 is mandatory for all IRDAI intermediaries since 2026-02-15 | IRDAI circular 06-01-2026 (l1 round 2) |
| QA and Bima Bharosa | §11 item 5 | AI calls need recording, sampling and grievance routing | IRDAI AR 2024-25; critic §6 item 10 |
| Re-quote or sell at renewal | §6 | Re-quotes may be solicitation; certified humans only | l1 round 2 U6-INS-3 (medium confidence) |
| Due worked per caller | §7 item 1 | Unmeasured input 1: decides AI vs the desk | `verify.md` §5 |
| Best vs average caller save rate | §7 item 6 | Unmeasured input 2: AI-human persuasion parity | `renewal_model.py` `parity` |
| Renewals before the first call | §7 item 3, §13.3 | Moves health and life GM by 23-28 points | `verify.md` §3a |
| Actual renewal commission % | §8 item 4 | Commission is assumed in every line; life skewed high | `verify.md` §1 |
