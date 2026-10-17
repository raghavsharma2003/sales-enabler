# What each answer means for each kill criterion (insurance, one page)

Keep this open during [INS] calls. Full rules: `scoring.md` §2. Questions: `interview-guide.md` (§ numbers below). A and B
evidence only can move a kill criterion.

**Key to the effect columns:**
- **pass**: the answer counts against that criterion firing.
- **FIRE**: it counts toward firing.
- **input**: it goes to whoever decides that criterion.
- **·**: no effect.

**The strata:**
- A: small/mid retail brokers;
- B: non-bank corporate agents;
- C: IMFs (interview only until counsel answers);
- D: large brokers and platforms (reported separately).

| you hear (§) | KC1 buyers exist | KC2 price | KC3 leakage | KC5 number path (counsel) | KC7 pilot design | also changes |
|---|---|---|---|---|---|---|
| Due renewals a month ≥ 3 × their own due-per-caller (≥ ~6,800 if unknown) (§5.3, §7.1) | **pass** (I1 +1) | · | · | · | holdout measurable sooner | bill ≥ ₹1.1 L if ≥ 7,000-9,000 mixed |
| 3+ callers on renewals, but due below that line | **FIRE** on round-2 form (I1 −1); round-1 desk form passes | · | · | · | · | desk cheaper or busier than modelled |
| Fewer than 300 due a month | **FIRE** for KC1 (in-scope, I1 −1); not qualified for KC2/KC3 | · | · | · | not pilot-eligible | 2 of 3 in a stratum means the stratum is dropped and the pool re-sized |
| Renewals only via PoSPs, branches or the insurer | **FIRE** (I1 −1) | · | · | · | · | the buyer may be the platform (D) |
| No-call renewal on the main line ≥ break-even: 2W 63%, car 96%, health 97%, life 93% (§7.3-7.4) | · | · | **FIRE** (I2 −1) | · | · | old 90% line reported too |
| No-call renewal below break-even **and** commission lost on lapse named (§8.5) | · | · | **pass** (I2 +1) | · | · | value per save = premium × their commission % |
| Original agent or PoSP keeps the commission; firm loses nothing (§8.5) | · | · | **FIRE** (I2 −1) | · | · | · |
| Insurer, aggregator or dealer usually reaches the customer first (§6) | · | · | pass (leakage exists) | · | call earlier than the insurer | I12 −1; competition is the insurer's AI |
| Life renewal commission ≤ 3.2% (§8.4) | · | **FIRE** on life (I3 −1 at ₹15) | life value ≈ ₹1,040 | · | · | treat life like two-wheeler |
| GG-max on main line ≥ floor: car ₹28, health ₹14, life ₹17, 2W ₹29 (§13.5) | · | **pass** (I3 +1) | · | · | · | use the stricter floors below if they apply |
| "Only bill renewals after your first call" (§13.3) | · | floors rise to car ₹35, health ₹19, life ₹24 | · | · | define "collected" in the LOI | health and life GM −23 to −28 points |
| "You take the hand-offs, evenings too" (§6, §13.3) | · | default floors apply (the card already assumes VP pays for hand-offs) | · | · | VP staffs escalation; cost it in the LOI | I13 −1 |
| "Our team takes callbacks, evenings too" | · | 2W floor falls to ₹22; launch GM rises 7-21 points | · | · | escalation owner named | I13 +1 |
| ₹15k minimum is above their whole bill (§13.2) | · (but signals a small book) | · | · | · | no pilot at card terms | expected below about 935-1,150 due a month |
| Picks per-minute at an equal bill (§13.7) | · | · | · | · | · | I4 −1 (H2b); 8 of 15 reopens the unit |
| Picks per extra renewal above the holdout | · | · | · | · | holdout is the bill basis | I4 +1; VP carries outcome risk |
| Accepts a 10% holdout after hearing its cost (§13.4) | · | · | · | · | **pass** (I10 +1) | · |
| Refuses any holdout | · | · | · | · | **FIRE**-risk: needs a staggered or matched-month design (I10 −1) | · |
| Calls from 1600 via a CPaaS (§11.1) | · | · | · | **input**: a path exists (I8 +1) | · | TRAI check then says the seat model is about 3-6× high |
| Calls from personal mobiles or 10-digit numbers (§11.1) | · | · | · | **input** (I8 −1): non-compliant since 2026-02-15; mark **trigger** or **not enforced** | · | trigger = pilot conversation; CNAP from 1 Nov shows the caller's own KYC name |
| [C] Phone calls by non-ISP staff, no IRDAI distance-marketing approval (§11.6) | · | · | · | **input**: IMF reg 3(d) | no pilot ask | stratum C may be dropped by counsel |
| Motor renewals won mainly by re-quotes or switching insurer (§6) | · | re-test on the reminder-only role | re-test | **input**: solicitation question | AI hands re-quotes to a certified person | I11 −1 |
| Premium needs a fresh insurer-portal quote per policy (§9.2) | · | · | · | · | quote field required in the list | I14 −1; mis-quote risk |
| Trough month below ~70% of average (§7.5) | · | · | · | · | minimum may exceed usage that month | I15 −1; consider a 12-month-averaged minimum |
| Customers often suspect fraud; refuse links (§10.3) | · | · | · | · | track scam-suspicion refusals | I17 −1; no cold payment links; listener-panel item |
| No recordings, no QA, complaints ad hoc (§11.5) | · | · | · | input: records in India | VP supplies QA and grievance routing | I18 −1 |
| Attrition ≥ ~50% a year, or ramp-up ≥ 1 month (§8.2) | · | · | · | · | · | pain +; desk cost higher than modelled |
| Due per caller well above 1,500 a month (§7.1) | · | · | · | · | · | desk cheaper; weakens "AI beats the desk" |
| Answer rate per attempt below 30%, many wrong numbers (§7.2) | · | · | · | · | · | fewer saves and more minutes per renewal |

**Never decided by interviews:**
- KC4: the channel funnel, measured by the tracker over the first 60 contacts;
- KC5: counsel;
- KC6: the battery;
- KC7: the pilot.

**Decisive readouts** (`scoring.md` §2):
- **KC1** fires if p̂_firm < 1/3. That is the firm-weighted share of I1 = +1 across strata A, B and C (weights 0.21 / 0.26 /
  0.52), and it needs ≥ 3 in-scope interviews per stratum.
  - If p̂_vol ≥ 1/3, the beachhead **moves** to the larger strata rather than dying.
- **KC2** fires if fewer than 3 qualified A/B firms clear their line's floor.
- **KC3** fires if the firm-weighted majority has no leakage at the per-line break-even.
- Every result is also reported under the round-1 rules.
