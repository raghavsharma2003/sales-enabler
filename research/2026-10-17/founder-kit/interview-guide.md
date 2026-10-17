# Discovery interview guide (Mom-Test, past behaviour only)

Date: 2026-10-17. For the founder. Each call runs 30-40 minutes, with one interviewer and, if possible, a second person taking notes.

**What the guide tests.** It tests the beachhead's kill criteria (`../SYNTHESIS.md` §1.2, KC1-KC7) and the two alternates' kill criteria (§2). Every question below names the criterion it feeds. `scoring.md` turns the answers into decisions, and `note-template.md` is the page you fill in during the call.

**Segment tags.**
- **[INS]**: insurance intermediaries' renewal desks (the beachhead).
- **[RE]**: real estate, own digital inquiries to site visits (alternate 1).
- **[LEN]**: lending pre-due and DPD 0-30 (alternate 2).

A question with no tag applies to all three.

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
   Only A and B evidence can fire a kill criterion (`scoring.md` §2).
3. **No pitching before section 11.**
   - If they ask what you're building, say: "Happy to tell you at the end. I don't want to colour your answers."
4. **Deflect compliments and hypotheticals back to the past.**
   - When you hear "That sounds great", ask: "When did you last try to fix this? What did you do?"
   - When you hear "We'd definitely use that", ask: "What are you using today, and what did it cost you last month?"
5. **Dig on anything emotional or specific.**
   - "You sighed when you said lapses. Tell me about the worst month." "Why does that matter to you?"
6. **Talk about 20% of the time.** Silence is fine. Count to five before rescuing them.
7. **Never ask for, write down or accept customer personal data.** That covers names, phone numbers, policy numbers and loan account numbers.
   - If they start reading one out, stop them politely: "No need for the name, the number of cases is enough."
8. **Write the note within two hours** (`note-template.md`). Memory decays fast and starts to invent.

---

## 2. Before the call (10 minutes of prep)

- [ ] Read the company's row in `targets.csv`: the evidence line, priority and buyer role. Note one specific thing to ask about. Examples:
  - "you're hiring a telecalling manager to follow up EMI dues";
  - "your website sends enquiries into Sell.Do".
- [ ] Open `note-template.md` as a new file named `data/discovery/YYYY-MM-DD_<target-id>.md`.
  - `data/` is gitignored. Notes never go in `research/` or `context/` until anonymised (`plan.md` §7).
- [ ] Have the GG ladder (§13.3) and the conversion table (Appendix A) open.
- [ ] Decide which segment module you are running. Skim its "what it means" tables.
- [ ] Ask yourself: what is the one thing I most need to learn from this person? Write it at the top of the note.

---

## 3. Time plan

| # | section | minutes | feeds |
|---|---|---|---|
| 0 | Opening and consent | 2 | (ethics) |
| 1 | Their role and context | 2 | qualification |
| 2 | Current calling workflow, last cycle | 7 | KC1, RE-K1, LEN qualification |
| 3 | Volumes | 4 | KC1, KC2 conversion, H7 volume |
| 4 | Costs | 4 | KC2 anchor, H2b |
| 5 | Tools | 3 | integration, H8, RE-K3 |
| 6 | Failures and leakage | 4 | KC3, RE-K1, LEN-K3 |
| 7 | Compliance | 4 | KC5, RE-K5, LEN-K1/K4/K5 |
| 8 | Decision process | 3 | KC4, H10 |
| 9-11 | Concept card and pricing | 6 | KC2, RE-K2, H2b |
| 12 | Close: artefacts, referrals, next step | 2 | KC4, KC7 setup |
| | **total** | **about 40** | to stay near 30, drop the optional probes marked (opt) |

---

## 4. Section 0: Opening and consent (read close to verbatim)

> "Thanks for making time. Quickly, so you know what this is: I'm starting a company that builds phone-calling software for Indian businesses. Right now I'm only doing research. There's no product and I'm not selling anything today.
>
> I'd like to ask about how your team actually worked over the last month or so. I'm not after opinions about products. You can skip any question.
>
> Please don't share any customer's name, number or policy or loan number. Counts and examples without names are perfect.
>
> Is it OK if I record this for my own notes? I'll delete the recording once I've written them up, and nothing I share later will name you or [Company]."

- If they say **yes**, note `recording: yes, consent given at 00:00` and start recording.
- If they say **no**, take notes only. Don't push.
- If you use any AI transcription tool, **say so** and get a separate yes:
  > "I'd also use an automatic transcription tool for the notes; is that OK?"

---

## 5. Section 1: Role and context (2 minutes)

1. "What's your role, and what does your team own?" Then: "Who do you report to?"
2. **[INS]**: "Roughly what's the mix of your book: motor, health, life? Mostly individual customers or mostly companies?"
   - *Qualification (`scoring.md` §1):* a mostly commercial or group book is out of scope. Finish politely and record "not qualified".
3. **[RE]**: "Are you a developer selling your own projects, or a channel partner working several developers' inventory?"
4. **[LEN]**: "What do you lend, and what's a typical EMI? For agencies: whose accounts do you work, and in which buckets?"

---

## 6. Section 2: Current calling workflow, last cycle (7 minutes)

This is the core of the interview. Get one concrete story, end to end.

**[INS] main question:** "Take last month's renewals. When did the list of policies falling due arrive, from where, and in what form? Then walk me through what happened to it, step by step."

Probes:
- "Who made the calls? How many people, full-time on renewals or mixed with other work?" (KC1)
- "How many days before expiry do you start calling? How many attempts per customer?"
- "What happens when the customer says yes? How do they pay? Link, cash, autopay?"
- "What happens to the ones who didn't answer or said 'later'?"
- "Who else touches renewals: PoSPs, branch staff, the insurer's own team?"
- (opt) "Do you also call for cross-sell or upsell on that same call?" This is a regulatory flag: one offer line makes the call promotional (SYNTHESIS §6.2).

**[RE] main question:** "Take the last enquiry that came in from your website or a portal. What happened to it, minute by minute, until it became a site visit or died?"

Probes:
- "Where did last month's enquiries come from: your own site, Google or Meta ads, 99acres/MagicBricks/Housing, channel partners, bought data, walk-ins? Roughly what share each?" (RE-K1)
- "How fast was the first call? Who called? How many attempts before you give up?"
- "Who books the site visit, and how is it confirmed?"
- "What happens to enquiries that come in at night or on Sundays?"

**[LEN] main question:** "Take last month's EMI cycle. Starting about a week before the due date, walk me through who got called, when, by whom, and what happened by day 30."

Probes:
- "How many accounts were due? How many got a call before the due date? How many fell into 1-30 days past due?"
- "What does the caller say? Is there a script? Who wrote it?" (Ask for it at the end.)
- "What happens after a promise to pay? Who checks whether it was kept?"
- "**[Agencies]** What exactly does the lender hand you, and when? Which buckets? What do they pay you per account or as a percentage?"

### What the answers mean

| answer pattern | reading | criterion |
|---|---|---|
| **[INS]** At least 3 people work renewals by phone, or there is a named renewal desk or team | Desk exists | Counts toward **KC1** (needs ≥5 of 15 qualified) |
| **[INS]** Renewals happen only through PoSPs, branch staff or the insurer, with no central phone effort | No desk to sell to | Counts against **KC1**. If common, the buyer may be the platform rather than the intermediary |
| **[INS]** The renewal list is a spreadsheet or insurer-portal export | Integration is easy | Supports the unsourced "lists are spreadsheets" claim (§1.3). Record the format exactly |
| **[INS]** Renewal calls include a cross-sell pitch as standard | Our service-call design conflicts with how they work | Note for counsel (§6.2). Tests whether a service-only call is acceptable to them |
| **[RE]** Most volume comes from their own digital inquiries (site, ads, portal leads addressed to them) | The 140xx 7-day-window design fits | Against **RE-K1** (good) |
| **[RE]** Most volume comes from bought or cold lists | The consented design does not fit | Fires **RE-K1** if this is the majority across interviews |
| **[LEN]** There is a phone desk for pre-due and 1-30 DPD, beyond field visits | Buyer exists | Qualifies the lead for LEN scoring |
| **[LEN]** MFI collection is entirely through group meetings and field staff, with no phone reminders | Weak fit for MFIs | Record. If most MFIs say this, drop MFIs from alternate 2's buyer list |

---

## 7. Section 3: Volumes (4 minutes)

Ask for last month's figures. If they don't know, ask "where would I find that number?" and request the report at the end.

| | [INS] | [RE] | [LEN] |
|---|---|---|---|
| list size per month | policies falling due (by line) | new enquiries (by source) | accounts due; accounts entering 1-30 DPD |
| calls | dials and connected calls per day per person | first-call time; attempts per enquiry | calls per account; connect rate |
| outcome | renewals collected (by line) | site visits booked, and visits that happened | paid on time; cured within the cycle; promises kept |
| talk time | average minutes per connected call | same | same |
| people | renewal callers (FTE) | pre-sales callers (FTE) | tele-callers (FTE) on this bucket |

Also ask:
- **[INS]** "Last year, what share of your motor policies renewed with you? Health? Life? Where does that figure come from?" (**KC3**: the 90% line)
- **[INS]** "Does that change by month? When is the peak?"

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| **[INS]** Renewal ratio on their main line ≥90% (A/B evidence) without calling, or with only a WhatsApp or SMS nudge | Little leakage to recover | Counts toward **KC3** firing |
| **[INS]** Ratio below 90% on motor or health, and they can show it | Leakage exists at the buyer we'd sell to | Counts against **KC3**. This is the pain evidence SYNTHESIS §1.1 item 2 lacks |
| Calls per month and minutes per call | Inputs for the conversion | Feeds **KC2** (Appendix A) and H7. SYNTHESIS's 9,440 calls/month median for insurance is assumption-driven (§1.1 item 7); real numbers replace it |
| **[RE]** Fewer than about 300 enquiries a month | Too small to measure anything | Note for H7. l6 found only 3.5% of real-estate buyers can test a +10% lift in month one |

---

## 8. Section 4: Costs (4 minutes)

1. "What does a [renewal / pre-sales / collection] caller cost you a month, all in: salary, incentive, seat, phone, data?"
   - Anchor: Apna's median posted telecaller pay is ₹17,000 (n=1,234, l2).
   - Don't say the number. Just check theirs against it afterwards.
2. "Last year, how many callers left? How long does a new one take to be useful?"
3. "What do you pay for telephony or a dialler? Per minute, per seat, or a flat fee?" (**H2b**: what unit they already buy in)
4. **[INS]** "On an average motor renewal, what commission do you earn? Health? Who earns it if the policy lapses and the customer buys elsewhere?" (**KC3**: commission at risk)
5. **[RE]** "What is a site visit worth to you? What share of visits book? What's your commission or margin on a booking?" (**RE-K2** anchor)
6. **[LEN]** "What does an account rolling from 1-30 into 31-60 cost you? **[Agencies]** What do lenders pay you, per account or as a percentage of collection?" (**LEN-K2** anchor)
7. "Have you paid any outside vendor for calling, such as a BPO, an agency or a bot? What did it cost, and what happened?"

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| They already pay a vendor per minute | The per-minute frame is entrenched | **H2b** evidence against outcome pricing. Record the rate |
| They pay agencies or BPOs per outcome (per account, % collected, per visit) | The outcome frame already exists | **H2b** supported. Helps **KC2** |
| **[INS]** The original agent or PoSP keeps the commission on lapse, or the firm loses nothing | No money at risk for this buyer | Counts toward **KC3** firing |
| **[INS]** The firm loses commission it can name | Pain has a price | Use it in the value-per-save calculation (`scoring.md` §4) |
| Callers cost well above or below ₹17k | The local cost baseline differs | Feeds the ₹6-9 per connected minute comparison (l2v) |

---

## 9. Section 5: Tools (3 minutes)

1. "What does the list or lead live in: Excel or Google Sheets, an insurer or lender portal, a CRM (which one), something you built?"
2. "What do your callers dial from? A mobile, a desk phone, a cloud dialler? Which provider?"
3. "Do you send WhatsApp reminders? Through which provider? Templates or manual messages?"
4. "Have you tried an IVR, robocall or voice bot? What happened?"
5. **[RE]** "Does your CRM call the lead automatically? Sell.Do, LeadSquared and others now offer this."
   - Our fetches saw Sell.Do lead APIs on two developers' sites and LeadSquared trackers on three (see `targets.csv`).
6. "If you added a new calling tool, would it have to sit inside your CRM, or could it be separate?" (**H8**)
   - Follow with a past-behaviour check: "When you last added a tool, did it plug in, or did someone copy data across?"

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| Spreadsheet or CSV upload is normal | A thin console works | Integration ease confirmed |
| They are on LeadSquared or Sell.Do and already testing its voice AI | The incumbent is in the door | Context for **RE-K3** and insurance competition (§1.1 item 5). Ask what it costs and whether it works |
| They'd only buy inside a replacement CRM | The suite matters | Counts toward the **H8** revisit trigger: 5 or more of the first 15 (§3.1 idea 7) |
| Mobile phones on personal SIMs | No dialler data, and the number path is unmanaged | Raises **KC5** and spam-flag risk. Telephony set-up becomes the gating task |

---

## 10. Section 6: Failures and leakage (4 minutes)

1. "Tell me about the last month that went badly. What happened?"
2. **[INS]** "Think of the last few policies that lapsed. Why did they lapse? Did anyone call them? How many calls?"
3. **[RE]** "Think of the last few good enquiries you lost. What happened?"
4. **[LEN]** "Think of the last few accounts that rolled into 31+. Were they called before the due date? What did they say?"
5. "What complaints have you had about your calls, from customers, the regulator, a telecom operator or a principal?" (**LEN-K3**, **KC5**)
6. "When callers talk to older customers, or customers who don't speak Hindi or English, what goes wrong?"
   - This feeds the battery personas and **KC6**. Our measured demo agents cut into an elderly caller's pause on 5 of 6 calls (l4bv).
7. "What have you done about any of this in the last six months? Did you spend money on it?"
   - Mom-Test: if they haven't tried to fix it, it may not hurt enough.

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| Lapses or losses happen because nobody reached the customer in time (capacity) | AI's strength is coverage | Supports the wedge |
| Losses happen because of price, claims experience or a competitor's offer | Calling won't fix it | Weakens the pain, and the value per save is lower |
| They hired, bought a tool or ran a campaign to fix it in the last 6 months | Real pain with budget | Strong positive. Note the amount |
| "It's fine, it's just how it is" and nothing tried | Low pain | Mark pain as low in `scoring.md` |
| **[LEN]** Complaints about tone, harassment or calling hours | Conduct sensitivity is high | Context for **LEN-K3**. A warm AI must be checked against conduct rules |
| Callers struggle with language mix or older customers | Quality bar matters to them | Supports wedge thesis (a). Record which languages |

---

## 11. Section 7: Compliance (4 minutes)

Ask these neutrally. You are learning what they do, not auditing them. Never tell them they are non-compliant.

1. "What number do customers see when your team calls: a mobile, a landline, a 140 number, a 1600 number? Who set that up?"
   - **[INS]** IRDAI entities must make service calls from 1600xx since 2026-02-15. Whether intermediaries are covered is open question 1 (§1.1, §8).
2. "Have you registered headers or templates on a DLT portal? Who did that for you?"
3. "Has any operator, TRAI or the regulator ever flagged, blocked or warned about your numbers?" (Spam flags: §6.8)
4. "How do you know a customer agreed to be called? Where is that recorded?"
   - **[RE]** "Your enquiry form says the consent overrides DND. What happens with enquiries from numbers on DND?" (**RE-K5**)
   - The 140xx route needs operator-registered consent for DND numbers (§6.5). A form checkbox alone may not meet it. That is counsel's question; don't argue it in the call.
5. "Do you tell customers the call is recorded? Do you keep recordings? For how long?"
   - **[LEN]** "What are you changing for 1 January 2027?" Do not lecture them on the rules.
6. **[LEN]** "When you hire a calling vendor, do they go through your recovery-agency empanelment or DRA certification?" (**LEN-K1** context)
   - **[Agencies]** "Do you call from your own numbers or the lender's?" (**LEN-K4**)
7. **[LEN]**, **[INS]** large firms: "Do your contracts with vendors require data to stay in India? Who signs off?" (**LEN-K5**, §6.11)

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| **[INS]** Already on 1600xx through a CPaaS | A compliant path exists for at least some intermediaries | Evidence against **KC5**. Record the CPaaS name |
| **[INS]** On personal mobiles or 10-digit numbers with no plan | The number path is the bottleneck | Input to counsel. **KC5** fires only on counsel's answer, not an interview answer |
| **[RE]** A large share of inquiry numbers are on DND, and they "just call anyway" | The legal route is narrow | Counts toward **RE-K5**. Record their estimated DND share |
| **[LEN]** Vendors must be empanelled as recovery agencies | AI-as-agency question is live | Input to **LEN-K1** for counsel |
| **[LEN]** Agencies call from the lender's 1600 numbers | One path exists | Evidence against **LEN-K4** |
| **[LEN]** Data must stay in India, contractually | Residency is binding | Counts toward **LEN-K5** (no centralindia meter for the GPT-6 family, §6.11) |

---

## 12. Section 8: Decision process (3 minutes)

Use the last real purchase.
1. "What was the last tool or service you bought for this team?"
2. "Who first found it? Who had to say yes? How long from first conversation to paying?"
3. "Did you run a trial or pilot first? Was it paid? What did it have to show?"
4. "How did you pay: monthly invoice, annual, advance? Who holds that budget?"
5. "If something like this needed approval, who else would be in the room?" Ask for the role only.

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| The founder or principal officer decides alone, in weeks | Matches **H10** (2-8 week pilots) | Supports the founder-led channel. **KC4** is feasible |
| Procurement, IT security and compliance sign-off, in months | Platform-like cycle (3-9 months, l4c) | Slower than **KC4**'s 10-week window. Deprioritise for pilots |
| They have paid for a pilot before | They will pay for proof | Strong positive for **KC4** |
| "We only use free trials" | Paid-pilot proof is hard here | Counts against **KC4**. Note it |

---

## 13. Sections 9-11: Concept card and pricing (6 minutes)

Ask pricing **last**, after the facts. Pricing answers are hypothetical, so they are weaker evidence than everything before them. Treat them as ranges, not commitments.

### 13.1 Read the concept card verbatim

Same words for everyone. No adjectives. No claims about quality.

**[INS]**
> "Here's one idea we're weighing. It doesn't exist yet in this form. A service, run by us, phones the customers on a renewal list you give us. At the start it says it is an automated assistant calling for [your firm]. It speaks the customer's language, reminds them of the due date and premium from your data, answers simple questions about their own policy, and sends a payment or autopay link on WhatsApp. Anyone who wants a person goes to your team. It never sells anything new on the call. You keep calling a random 10-20% of the list your usual way, so we can both see what changed. You'd pay a fee for each renewal collected from the lists it worked, with a monthly minimum."

**[RE]**
> "Here's one idea we're weighing; it doesn't exist yet. A service, run by us, calls each new enquiry from your website, ads and portals within minutes, inside the permitted hours and consent rules. It says it is an automated assistant for [your firm], asks your qualifying questions, offers site-visit slots from your team's calendar, sends a WhatsApp confirmation and hands hot leads to your sales person. You'd pay per qualified site visit booked, with a monthly minimum."

**[LEN]**
> "Here's one idea we're weighing; it doesn't exist yet. A service, run by us, calls borrowers before the EMI date and in the first 30 days overdue. It says it is an automated assistant for [lender], states the amount and due date from your data, calls only in permitted hours, records every call and keeps logs, takes a promise to pay or sends a payment link on WhatsApp, and passes disputes and hardship cases to your team. You'd pay per account brought current, with a monthly minimum."

Then ask, **before any price**: "What's the first thing that worries you about that?" Write the answer down word for word. That's the objection list.

### 13.2 Van Westendorp (4 questions, in their unit)

Ask in the segment's unit:
- **[INS]**: ₹ per renewal collected.
- **[RE]**: ₹ per qualified site visit booked.
- **[LEN]**: ₹ per account brought current.

Ask in this order:
1. "At what price per [unit] would this be **so cheap** that you'd doubt it could work?"
2. "At what price would it be **a bargain**, a great buy for the money?"
3. "At what price would it start to feel **expensive**, though you'd still consider it?"
4. "At what price would it be **too expensive** to consider?"

If they can't answer in the unit, ask the same four questions as a monthly fee, then convert (Appendix A). If they insist on per minute or per seat, record that. It is evidence for **H2b**.

### 13.3 Gabor-Granger (3-4 asks, step up or down)

Start at the middle price. Ask:

> "At ₹[price] per [unit], which on your volumes comes to about ₹[monthly figure] a month, with a ₹25,000 monthly minimum, would you approve a 6-week **paid** pilot on next month's list?"

Answer options: definitely / probably / not sure / probably not / definitely not.

- If **definitely** or **probably**, step **up** one rung.
- Otherwise, step **down** one rung.
- Stop after 4 asks, or at the top or bottom rung.
- Record the highest price with a "definitely" or "probably" as **GG-max**.

| segment | unit | ladder (₹); start in **bold** |
|---|---|---|
| [INS] | per renewal collected | 15 · 25 · **40** · 60 · 90 · 130 |
| [RE] | per qualified site visit booked | 150 · 300 · **450** · 600 · 900 · 1,300 |
| [LEN] | per account brought current (from 1-30 DPD within the cycle) | 30 · 50 · **80** · 125 · 200 · 300 |

**Why these rungs.**
- The ladders straddle the floors SYNTHESIS sets:
  - ≥ ₹6 per AI-connected minute (KC2);
  - ₹300-500 per qualified site visit (RE-K2);
  - the value gate of ₹200-5,000 per cured account (§2).
- At assumed volumes, about ₹20 per renewal collected, about ₹450 per site visit and about ₹45 per account brought current each equal ₹6/min.
- The break-even depends on the buyer's own rates. Appendix A shows the arithmetic. Work out the monthly figure live from section 3's volumes, so they react to a rupee total they recognise.

### 13.4 Value per outcome (one question, past-anchored)

- **[INS]**: "Last year, when a policy lapsed that would have renewed if someone had reached the customer in time, what did that one lapse cost you? Commission, plus next year's renewal?" (**KC2**: needs ≥ ₹150 per renewal saved)
- **[RE]**: "What did your last booked sale earn you? What share of visits book?" This gives the value per visit.
- **[LEN]**: "When an account rolls from 1-30 to 31-60, what does it cost you in provisioning, extra calls and field visits?"

### What the answers mean

| answer | reading | criterion |
|---|---|---|
| **[INS]** GG-max converts to ≥ ₹6/min (Appendix A) **and** the stated value per saved renewal is ≥ ₹150 | Price clears both floors | Counts against **KC2** (good) |
| **[INS]** GG-max is below ₹6/min-equivalent, or the value per save is below ₹150 | Price too low | Counts toward **KC2** firing |
| **[RE]** GG-max ≥ ₹300 per qualified visit | Price accepted | Against **RE-K2**. Combined with "own inquiries", it builds the switch case (§1.2) |
| **[RE]** GG-max < ₹300 | Price too low | Toward **RE-K2** |
| Van Westendorp "too cheap" answer is above our planned price | Low price would hurt credibility | Note it. Price higher, not lower |
| They want per-minute pricing | The per-minute frame wins here | Against **H2b**. If most say this, revisit the pricing unit (§5 says per-minute selling has no margin) |
| "Definitely" at the top rung | Under-priced, or not taking it seriously | Probe: "What would you need to see in week 6 to keep paying?" |

---

## 14. Section 12: Close (2 minutes)

1. **Artefacts.** Ask for specific items you heard about.
   > "You mentioned [the due-list format / the call script / the disposition sheet / the dialler report]. Could you share a copy with customer details removed? Column headers and totals are enough."
   - The full list and redaction rules are in `plan.md` §5.
2. **Recordings.**
   > "Do you keep call recordings? If you'd ever be comfortable letting me listen to three or four with you on a screen-share, with customer details muted, it would help us understand what real calls sound like. No copies needed."
   - Only on their terms. The rules are in `plan.md` §5.2.
3. **Referrals.**
   > "Who else runs [this kind of team] that I should talk to? Would you introduce me?"
   - Count intros. They are a commitment signal.
4. **Next step**, only if they qualify and the call earned it.
   > "If we did build this and it passed our own quality tests on calls like yours, would you want to talk about a paid pilot on one renewal list?"
   - Record the exact answer. The pilot ask itself is in `plan.md` §6.
5. **Thank them.** Promise the anonymised summary, and send it.

---

## Appendix A: Converting any price to ₹ per AI-connected minute

The variables:

| symbol | meaning | source |
|---|---|---|
| p | price per outcome | GG-max or Van Westendorp |
| r | outcomes per list item | section 3 |
| k | AI-connected calls per list item | their connect data, or the default |
| m | minutes per connected call | section 3, or the default |
| Min | monthly minimum | ₹25,000 in the GG ask |

The formulas:
- Effective yield = (p × outcomes per month, but not less than Min) ÷ (list items per month × k × m)
- **Break-even price p\* = 6 × k × m ÷ r**, where 6 is SYNTHESIS's ₹6/min floor.

**Defaults.** These are assumptions, labelled as such. Replace them with the interviewee's figures whenever you have them.

| segment | k | m (minutes) | r (outcome rate) | p\* at ₹6/min | sources for defaults |
|---|---|---|---|---|---|
| [INS] | 1.2 | 2.0 | 0.70 renewals collected per due policy | ≈ ₹21 per renewal | "about 2 min each" is SYNTHESIS §5's own assumption. k and r are assumptions |
| [RE] | 1.5 | 2.5 | 0.05 qualified visits per inquiry | ≈ ₹450 per visit | 2.5-minute calls from l2v. k and r are assumptions |
| [LEN] | 2.0 | 1.5 | 0.40 brought current per 1-30 DPD account | ≈ ₹45 per account | all assumptions |

**Worked example [INS].** All inputs are illustrative.
- The due list is 3,000 policies a month, so AI-connected minutes = 3,000 × 1.2 × 2.0 = 7,200.
- At a 70% renewal rate, 2,100 renewals are collected.
- At p = ₹25, revenue = ₹52,500. That is ₹7.3/min, which clears ₹6.
- At p = ₹15, revenue = ₹31,500. That is ₹4.4/min, which fails.

**Quick live table [INS]** (monthly fee at 70% renewal, before the minimum):

| due policies / month | ₹15 | ₹25 | ₹40 | ₹60 | ₹90 |
|---|---|---|---|---|---|
| 1,000 | 10,500 | 17,500 | 28,000 | 42,000 | 63,000 |
| 3,000 | 31,500 | 52,500 | 84,000 | 1,26,000 | 1,89,000 |
| 6,000 | 63,000 | 1,05,000 | 1,68,000 | 2,52,000 | 3,78,000 |
| 10,000 | 1,05,000 | 1,75,000 | 2,80,000 | 4,20,000 | 6,30,000 |

## Appendix B: Red-flag phrases and how to redirect

| you hear | it is | redirect |
|---|---|---|
| "That's a great idea" | a compliment, worth nothing | "Thanks. What did you try last time this hurt?" |
| "We would definitely use it" | a future promise | "What are you using today? What did it cost last month?" |
| "Usually we..." / "Generally..." | a generalisation | "Take last Tuesday. What happened?" |
| "Everyone in the industry has this problem" | deflection | "And at [Company], last month?" |
| "Can it do X?" | a feature request | "Why do you need X? When did you last need it? What did you do instead?" |
| "Send me a proposal" | a polite exit, or interest | "Happy to. What would it need to show for you to approve a paid pilot?" |
