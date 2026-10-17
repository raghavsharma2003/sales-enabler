# Evidence notes: H5 (human-likeness), H7 (learning) and H10 (distribution)

Date: 2026-10-17 (Saturday). Author: round-2 synthesis lead. These are brief deliverables 6 (H5 and H7 evidence notes) and 9
(the distribution note). The critic (item A9) found that until now they existed only as CSVs, code and verifier files.
Nothing here is new research: each note gathers what lanes l4c, l5 and l6, their verifiers and the round-2 packages
found, in one readable place. Ledger ids (`[HUM-03]` and so on) point to `ledger.json`, which carries the source URLs,
method, n and verifier verdict for every claim.

**Limits that apply to all three notes.** No buyer has been interviewed. No listener has rated a clip. All callers in our
measurements were synthetic Azure voices. The human-likeness literature is mostly Chinese fintech plus one working paper
known only from its abstract.

---

## H5. Does a human-like, warm voice change outcomes?

**The prediction (prior 0.65).** There is little rigorous outcome evidence that "emotional/relational" voice lifts
conversion. There is some evidence that naturalness reduces early hang-ups. Warmth is a risk in collections.

**Verdict: supported, with corrections.** The first and third parts hold. The second part, naturalness reducing early
hang-ups, is weak.

### What the evidence says

1. **Disclosure used to kill conversion. A 2026 abstract says it no longer does.**
   - In a pre-2019 outbound sales experiment (n = 6,255), disclosing the AI bot before the conversation cut purchases from
     0.237 to 0.048. 56.3% of those callees hung up within 5 seconds. An undisclosed bot sold about as well as proficient
     humans (0.251) [HUM-01; Luo et al., *Marketing Science* 2019, Table 3, read-primary].
   - A 2026 working paper reports that disclosure "no longer reduces conversion rates relative to nondisclosure"
     (n = 1,337). In a second experiment AI voice agents "still substantially underperform human sales agents" on
     sales-process discipline (n = 366). Customers recognise AI voices whatever the disclosure (n = 238) and are "less
     willing to continue" talking to them [HUM-02; Habel, Zawadzki, Freise, SSRN 7013259; abstract only, through Crossref;
     country, industry and effect sizes unknown].
   - **Reading.** If people recognise the AI anyway, hiding it buys nothing and risks trust. Disclosure at the start of the
     call is free on this evidence, as long as the agent is competent.
2. **In collections, human presence is worth the most, and the measured gap is about commitments, not hang-ups.**
   - Scripted AI collectors (a seven-category bot, China, 2021-23, debts of about USD 42 or less) collected 9 percentage
     points less NPV at about one month (regression discontinuity) and 12 points less by day 5 (randomised). The AI was
     **not** hung up on more often within 10 seconds. Its conversations were 31 s shorter, and 21 points fewer borrowers
     promised to repay. The authors say weaker promises "may contribute"; humans also called almost once more a day
     [HUM-03; NBER WP 33669, read-primary; the l5 verifier weakened the causal framing].
   - A two-way phone call from a bank agent raised timely repayment by 34.4 points against a written notice (LATE; the
     average effect is about half). Borrowers who reached the four agents with the most likeable voices paid within 45 days
     at 84.5%, against 71.6% for the other four [CMP-20; Laudenbach, Pirschel, Siegel, *Journal of Finance* 2025].
   - **Reading.** Voice and presence can matter in obligation tasks. The mechanism in the one AI-versus-human study is
     binding commitments, which a competent agent can design for (a clear ask, a date, a confirmation), not warmth as such.
3. **Naturalness and early hang-ups: weak.**
   - The only direct number is vendor-funded: across about 99,400 US survey calls that all opened with an AI disclosure,
     intro hang-ups were 87.9%, 89.7% and 90.3% for three TTS vendors, a spread of at most 2.4 points [HUM-04;
     vendor-claim].
   - The collections study above found no early-hang-up gap at all.
   - So "a more natural voice keeps people on the line" is not supported beyond a couple of points. That also removes the
     round-1 gap-map argument that natural voices mean fewer short calls and so fewer spam flags [HUM-13]. On 1600 numbers
     the point is moot anyway: operators may not flag them and caller-ID apps may not tag them [RAW-03].
4. **Warmth and anthropomorphism can backfire.**
   - Anthropomorphic chatbots lowered satisfaction and purchase intent among customers who arrived angry, through inflated
     expectations [HUM-05; Crolic et al., *Journal of Marketing*, abstract].
   - Humanising a text chatbot raised conversion and also raised price sensitivity [HUM-05; Schanke, Burtch, Ray, *ISR*].
   - Chatbot disclosure lowers retention through reduced trust when the service is critical; when the bot fails,
     disclosure helps [l5 evidence E07; Mozafari et al., abstract].
   - In Indian collections, warmth also collides with RBI and CCPA conduct rules [l5].
5. **What round 2 added.**
   - **A leading Indian platform's showcase agent says it is human.** Asked "aap robot ho? AI ho?", Sarvam's homepage
     EMI-reminder persona answered that it was a person in 6 of 6 calls where the question was reached, in Hindi, Tamil and
     English [CMP-07; measured; no human ear has checked the recordings yet]. ElevenLabs' demo disclosed 7 of 7 times, and
     Smallest's evaded every time [CMP-10]. Disclosure is a prompt choice, so "never deny being AI" has to be enforced in
     code.
   - **The renewal call has the same shape as a known scam.** Fake vehicle-renewal call centres and "your policy lapsed,
     pay to revive" calls that quote correct policy data are documented by police cases, IRDAI warnings and consumer posts
     [RAW-09, RAW-10, RAW-11]. IRDAI itself tells the public to distrust such calls. For the beachhead, trust markers (a
     1600 number, the firm's name, a verifiable callback path, no cold payment link) probably matter more than warmth. The
     listener panel's S1 test is pre-registered to measure exactly this [HUM-14].
   - **Under IRDAI rules, persuasion is the regulated act.** In the telemarketing channel only certified Authorised
     Verifiers, who state their name and IRDAI certificate number, may solicit [REG-27]. A software agent cannot truthfully
     do that, which is one more reason the wedge's call is "inform, confirm, hand off" rather than a warm sales pitch.

### What it means for VP

- Build a **human-competent** agent, not a human-pretending one: language lock, turn-taking, backchannels, short replies,
  safe numbers, and commitments that bind (a date, an amount, a confirmation read back).
- Disclose at the start of every call and never deny being AI, enforced as a code gate.
- Do not sell "emotional" or "relational" voice as a claim. Measure warmth only inside a pilot, against a holdout.
- For older policyholders, put comprehension and trust first (panel tests E1 and S1), ahead of voice tier (T1) and
  dialect.

### What is not known, and what would change the verdict

- There is no Indian outcome evidence and no renewal-call evidence of any kind.
- **The verdict moves** if a pilot with a holdout shows that a warmer script or voice raises renewal saves by more than its
  minimum detectable effect, or if the 60+ panel prefers a warmer register and understands it better. It moves the other
  way if the S1 safety line does not lift trust in the payment hand-off.
- **Next tests.** The interview probe on whether buyers would want the agent to claim to be human (record a "yes" as a
  risk, never as a requirement). The listener panel after the owner's listen-checks. Then the concierge pilot.

---

## H7. What can an agent learn from its own calls, and how fast?

**The prediction (prior 0.80).** One script line cannot be validated from 100 calls; a 5-point effect needs 800+ calls
per arm. Per-contact memory and personalisation are feasible immediately. Script learning is feasible only pooled across
a tenant or segment.

**Verdict: mixed.** Part 1 holds, with the sample size understated. Part 2 holds statistically but failed its only live
trial. Part 3, "only pooled", is refuted.

### What the evidence says (all simulation or arithmetic unless marked)

1. **100 calls tell you almost nothing about one line.**
   - At 100 calls per arm the minimum detectable drop is 13-19 points. A 95% interval on an observed 50% runs from 40.4%
     to 59.6% [LRN-01].
   - A 5-point effect needs 906-3,554 calls per arm depending on the baseline (50% to 45% needs 1,565), not "800+"
     [LRN-01]. The round-2 corrections fixed a Cohen's h column that had halved these numbers in one file; the figures
     quoted here were always the correct ones.
2. **Dashboards that are checked daily invent winners.** Two-variant A/A tests checked every day and stopped at
   P(best) ≥ 0.95 declared a false winner in 52-62% of runs by day 90; with four variants it was 4-14% [LRN-02]. This is the
   split every vendor ships. Retell, Vapi, ElevenLabs and Bland document fixed traffic splits with manual promotion and no
   statistics. SquadStack markets continuous script tuning without a documented method [LRN-09]. Always-valid sequential
   tests are the fix (Johari, Pekelis and Walsh, arXiv:1512.04922).
3. **What does work, per tenant, without pooling.**
   - **Line mining.** A line that doubles the hang-up hazard (5% to 10%) is flagged 67% of the time at 500 calls and 76-94%
     at 1,000, but only 19-37% at 100-200 calls [LRN-03].
   - **Fix confirmation on a local metric** (did people stay past the line?) needs about 592 calls per arm [LRN-04].
   - **Outcome-level optimisation** (renewals, not minutes) needs volume: Thompson sampling over four variants picks the
     right one 86-99% of the time at about 1,000 calls a day per script [LRN-05].
4. **Pooling helps only when tenants are alike.** When 30 simulated tenants differed, pooled learning gave 48-55% of them
   the wrong winner, under the lane's empirical-Bayes estimator [LRN-06]. Cross-tenant pooling of WhatsApp data is barred
   by Meta's terms, and DPDP processor contracts limit pooling of personal data [l1, l6].
5. **Labels are a hidden cost.** If outcomes are extracted by an LLM judge that is 90% accurate, the calls needed rise
   1.8-2.4x (3.6-5.5x at 80%). Outcome-extraction accuracy on sales transcripts has never been measured; the inherited
   judge failures were on companion-chat replies [LRN-07].
6. **Memory: statistically immediate, practically unproven.** The owner's episodic memory reached recall@8 of 95.7%
   (from 73.9%) at about USD 0.0007 per person per night (l6 evidence L13, inherited). The only live trial of a stored
   preference failed: a correction stored "Hindi" and the next reply came in English [LRN-08].
7. **What round 2 added: the renewal holdout is slow.** At 1,500 due renewals a month and a 10% holdout, detecting the
   median modelled lift takes about 2.9 months for two-wheeler, 5.4 for car, 25.8 for health and 20.7 for life [REN-13].
   A mixed 1,500-due broker has only about 375 health and 75 life renewals due a month. So a quarterly holdout report is
   noise for health and life except at the largest platforms. Pooling the holdout across buyers, or reporting per line
   only once it is powered, is the honest alternative.

### What it means for VP

- Ship scoped learning: per-contact memory with provenance and a live adherence test; line mining at 500-1,000 calls;
  fix confirmation on local metrics; always-valid tests with a visible "under-powered" verdict; winners that expire.
- Do not claim autonomous outcome optimisation, and do not show K=2 "winning" dashboards.
- For renewals, attribution is a product feature: the holdout design, its duration per buyer size and line, and an
  explicit statement of what cannot yet be shown.

### What is not known, and what would change the verdict

- There is no empirical prior on the size of real script effects, no mSPRT simulation, and no measured outcome lag per
  segment.
- **The verdict moves** if real pilot data show script effects much larger than +10% relative (learning is then faster),
  or if LLM outcome extraction proves ≥ 95% accurate against human labels (the label penalty then mostly disappears).
- **Next test.** At the concierge pilot: measure LLM outcome-extraction accuracy on 200 hand-labelled renewal calls before
  any learning loop is switched on.

---

## H10. How mid-market Indian B2C buyers buy, and through whom

**The prediction (prior 0.50).** Mid-market Indian B2C buyers buy through founders or ops heads, at ₹25k-2L a month,
with a 2-8 week sales cycle. CPaaS and telephony vendors and CRM partner ecosystems are major channels.

**Verdict: mixed.** The ticket band holds for sales-led sellers. The cycle holds for pilots, not production. The buyer
role is untested. "Partners are major channels" is refuted.

### What the evidence says

1. **Ticket size depends on the motion, not the market.** Revenue per customer is about ₹4.9k a month for self-serve
   Bolna (1,050+ paying customers, 75% of revenue self-serve) against ₹26-37k for Ozonetel, up to ~₹50k for Exotel, ~₹1.7
   lakh for LeadSquared and ~₹2.3 lakh for Gnani [CMP-19; MCA-derived revenue through press, divided by stated customer
   counts]. Those denominators mix pass-through revenue and global customers, so they are bounds, not prices. The ₹25k-2L
   band needs a sales-led motion.
2. **Cycle.** Pilots run 2-8 weeks (SquadStack's FAQ says 3-8, Caller.digital 2-4). Production takes 8-12+ weeks, and BFSI
   enterprise deals carry 90-day commitments [CMP-24; vendor claims].
3. **Channels.**
   - **CPaaS and telephony vendors are infrastructure and competitors at once.** Exotel, Ozonetel, Gupshup/Knowlarity,
     MyOperator and TTBS all sell their own voice bots [CMP-22]. VP still needs one of them for numbers and the 1600 series,
     through a bring-your-own-bot path (Exotel AgentStream, ElevenLabs on Ozonetel, Vobiz) [CMP-23].
   - **CRM partner ecosystems are crowded.** LeadSquared's partner channel was high single-digit percent of revenue
     (2021). The Zoho Marketplace returns 737 results for "telephony" [CMP-22]. Indian SMBs mostly adopt point tools first,
     but 24% of Zoho One buyers start on the suite [CMP-21].
   - **Founder-led direct sales to an enumerable list** is the only channel with a clear fit for insurance renewals. It is
     cheap in cash and expensive in founder time [l4c channels.csv].
4. **No CAC or churn data exists** for Indian SMB voice AI; only unverified consultancy estimates (CAC USD 80-250) [CMP-25].
   The only outbound measurement we own is the inherited CarbonSettle cold-email funnel: 8,784 sends, 88 replies, 21
   positive, 3 meetings, 0 won. That was a different buyer and a different product, so it shows mechanics, not demand
   [CMP-26].
5. **What round 2 changed for the beachhead's channel.**
   - **The sample is now the pool.** The 20 active insurance targets are 6 small/mid retail brokers, 5 non-bank corporate
     agents, 6 IMFs and 3 large brokers or platforms; 5 rows come from a seeded random register draw. Wave 1 (15 contacts)
     goes out on Monday 2026-10-19 [FK-01]. The founder kit asks for warm introductions through insurers' channel managers
     for IMFs and corporate agents.
   - **Regulation narrows the channel.** IMFs may not use telemarketers and may phone-sell only through their own ISPs with
     IRDAI approval [REG-29], so IMFs are interview-only until counsel answers. Large brokers and platforms run renewals in
     house: Policybazaar earns about 80% contribution margin on renewals [REN-22], and TurtlemintPro sells renewal reminders
     to its advisors [CMP-17].
   - **The insurer route is partly closed to our stack.** LIC buys AI renewal reminders per minute (about 24 lakh minutes a
     year) but bars GPT, Claude, Gemini and foreign-hosted APIs and wants India self-hosting [RAW-05].
   - **Small buyers cannot pay enterprise-style fees.** Competitors' enterprise onboarding (2-3 weeks of scoping, ₹1-3 lakh
     a month platform fees) prices out a 150-renewals-a-month IMF [CMP-13, CMP-16]. VP's own ₹15k minimum does the same
     below about 935 due renewals a month [REN-12].
   - **Time to first paid pilot is gated by paperwork, not the sale.** Counsel's answer is requested by about Fri
     2026-11-13, and Plivo states about 7-14 business days to provision 1600 numbers [REG-23]. If both run back to back, the
     first live pilot call lands about 2026-11-24 to 2026-12-03 [calc]. That sits inside l4c's estimate of 4-10 weeks from
     first contact (2026-11-16 to 2026-12-28) [calc from l4c estimate].

### What it means for VP

- Sell founder-led, to named intermediaries, with a concierge pilot. Do not plan on CPaaS or CRM partners as the
  channel. Plan on them as the number path and the data source.
- Start the 1600 paperwork with the first buyer that signs an LOI, in parallel with counsel, so the pilot is not waiting
  on provisioning.
- Track the funnel from contact one; kill criterion 4 is decided by it (fewer than 10 discovery calls or fewer than 3 paid
  pilots from 60 targeted intermediaries within 10 weeks).

### What is not known, and what would change the verdict

- Buyer role, CAC, payment terms and churn are all unmeasured.
- **The verdict moves** if 5 or more of the first 15 qualified prospects would buy only through a CRM or a CPaaS they
  already use (partners then matter), or if the first 60 contacts produce fewer than 10 discovery calls (the founder-led
  channel fails, which is kill criterion 4).
- **Next test.** The interview programme's tracker, from Mon 2026-10-19, with an interim check on Thu 2026-10-29 and final
  scoring by about Fri 2026-11-13.
