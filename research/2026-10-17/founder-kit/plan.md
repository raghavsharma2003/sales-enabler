# Founder interview plan: 25-40 interviews in 3 weeks, starting Monday 19 October

Date: 2026-10-17 (Saturday), round 2. The interviews run Monday 2026-10-19 to Friday 2026-11-06, with spill-over to 11-13.
The round-1 version is `plan.round1.md`.

The other files in this kit:
- `targets.csv`: 69 verified companies. 29 are insurance rows; **20 are active**, and each carries a stratum.
- `register-sample-frame.csv`: the company-level IRDAI register frame in seeded draw order, for screening and for
  replacements.
- `outreach.md`: messages.
- `interview-guide.md`: the call.
- `kc-answer-sheet.md`: the one page to keep open during calls.
- `note-template.md`: the write-up.
- `scoring.md`: the pre-registered decision rules.
- The round-2 write-up (what changed and why) was returned to the main loop as package `r2-founder-kit`. The harness refused a
  `findings.md` file, so it is not in this folder.
- `code/strata.py` and `code/caps_sensitivity.py`: the stratum counts, the seeded draw and the commission-cap sensitivity.

Nothing in this kit has been sent, and nobody has been contacted.

---

## 1. What this programme must decide, and what counts as proof

It answers SYNTHESIS §8 item 1:
- 15 qualified insurance intermediaries first;
- then about 10 real-estate firms and 5-10 lenders;
- 25-40 interviews in total, with artefacts.

It decides, by the rules in `scoring.md` §2 and §8:
- **KC1** (enough buyers): due renewals a month against a 3-seat-desk equivalent, read per stratum and weighted back to the
  pool;
- **KC2** (price): per-renewal GG-max against each line's 40%-margin floor;
- **KC3** (leakage): no-call renewal ratio against each line's break-even;
- **RE-K1/K2** and the switch test for alternate 1;
- inputs for alternate 2, for counsel (1600, IMF reg 3(d), solicitation) and for the per-renewal model (§5 of `scoring.md`);
- the first data point for **KC4/RE-K4** (channel).

**Proof** is buyers' money. Brief §6 sets the bar at **3 paid pilots or signed LOIs at a stated price, from 15 qualified
prospects**. Stated interest does not count, and compliments score 0.

---

## 2. Inputs, and the limits of this kit

1. **Sources read for round 2:**
   - `../CRITIC.md` items A12 and A4;
   - `../lanes/l1-regulation/round2/` (`verify.md` and `usecase-map-insurance.csv`; no `findings.md` exists on disk);
   - `../lanes/l2-economics/round2/` (`verify.md`, `renewal-*.csv`, `renewal-model.json`, Handbook extracts);
   - `../lanes/l4b-measured/round2/competition-intermediary.csv` and the IRDAI distribution-consultation excerpts;
   - `../lanes/r2-untouched-raw/trust-fraud-evidence.csv`.
2. **Why the targets changed.** The round-1 20 were 13 brokers, 4 PoSP platforms, 2 corporate agents and 1 IMF. The in-reach
   pool is IMF-heavy by firm count. Kill criterion 1 would therefore have been biased upward (critic A12).
   - The active 20 are now: A small/mid brokers 6, B non-bank CAs 5, C IMFs 6, D large brokers and platforms 3.
   - Nine round-1 rows are kept as **reserve**, with stable IDs.
   - Within A, B and C, the rows mix three selection types: website (picked for visible renewal flows), signal (a phone-team
     job post) and random (a seeded register draw). The random rows were **not** selected on any phone signal; they are the
     unbiased read.
3. **Verification.**
   - All 9 new rows were found in the IRDAI register pages fetched live at 2026-10-17 20:08 UTC:
     - IMFs by registration code;
     - corporate agents by CA number;
     - the broker by CoR.
   - Saggio's own site (saggioinsurance.com) also names the entity and says it is IRDAI-regulated.
   - The four new Apna evidence URLs exist in the l3 crawl.
   - The random draw used seed 20261019 over:
     - the 496 IMFs whose register validity runs past 2026-10-17;
     - the 66 valid, non-bank, non-NBFC corporate agents with insurance or advisory names (composite or general).
   - `code/strata.py` reproduces the draw from the saved register pages.
4. **Two new wrong-entity traps.** Do not repeat them:
   - `dgvdigital.com` is a Vietnamese software firm, not DGV Digital Insurance (CA1043).
   - `planway.in` is a Tamil Nadu construction firm, not Planway Futuristic IMF.

   Round 1's traps still stand: `gibl.in` is GreenLife (CoR 450), `wealthclinic.com` is a US firm, and `goldenarm.in` is a
   sports turf.
5. **Register caveats.**
   - 940 IMFs are listed, but only 496 show a current validity date. The IRDAI Handbook counts 799 at 31-03-2025.
   - Validity semantics are not verified: renewals may be pending under the 2026 transition.
   - The register pages also carry principal officers' names, phones and e-mails. They are **never** copied into this kit,
     and outreach must not use them (`outreach.md` §1.3).
6. **Apna caveats** (l3v):
   - the crawl is a one-month snapshot of a blue-collar board;
   - `no_of_openings` defaults to 10;
   - a post shows a phone team exists, not that it does renewal work.
7. **Excluded by design** (unchanged):
   - large consumer-internet firms with in-house teams;
   - competitors;
   - generic staffing firms.

---

## 3. Sequencing

### 3.1 Why this order

- **Insurance first.** It is the beachhead, and its kill criteria are the cheapest to test by talking.
- **Within insurance, every stratum from day one.** KC1 needs at least 3 in-scope interviews in each of A, B and C before it can
  be computed (`scoring.md` §2.2). IMFs and small CAs are the slowest to reach.
- **Real estate second**, because the switch rule needs real-estate evidence while the insurance result is fresh.
- **Lending last.** Most of its kill criteria are legal or battery questions that interviews only feed.

### 3.2 The first 15 insurance contacts, Monday 19 October (wave 1)

| stratum | id | company | selection | why it is in the first wave |
|---|---|---|---|---|
| A | INS-03 | Square Insurance Brokers (Jaipur) | website | Multi-line retail renewal flows; Hindi-belt book |
| A | INS-05 | RM Insurance Broking (Jaipur) | website | Dealer-linked motor book: the car line, where per-renewal pricing is most robust |
| A | INS-11 | Clarion Insurance Broking (Ahmedabad) | signal | One in-house phone desk; a typical small broker |
| A | INS-12 | BYR Insurance Brokers (New Delhi) | signal | Health telesales floor; tests whether a sales desk also does renewals |
| A | INS-21 | Saggio Insurance Broking (New Delhi) | signal | New. Outbound life telesales; own site verified |
| B | INS-14 | Mihit Insurance Advisory Services (Noida) | signal | 4 telecaller posts across health, life and motor |
| B | INS-15 | Golden Arm Insurance Financial Services (Bengaluru) | signal | Scripted telecalling on health and life |
| B | INS-27 | NLVD Assurance (OPC) (Noida) | signal | New. A one-person-company CA with phone work |
| B | INS-28 | S. Sood Corporate Advisors | random | New. Register draw #1; may fail the retail test, which is itself a reading |
| C | INS-13 | RB Insurance Marketing (New Delhi) | signal | The largest IMF phone floor found (70 openings) |
| C | INS-22 | Raising Group Insurance Marketing (New Delhi) | signal | New. IMF telecallers on insurance sales |
| C | INS-24 | Riskcovery IMF (Delhi) | random | New. Register draw #1 |
| C | INS-25 | Uniqver Insurance Marketing (Kerala) | random | New. Register draw #2; a 2025 registrant |
| D | INS-10 | Hero Insurance Broking (New Delhi) | size | OEM-linked motor volume. Khaitan lists OEM-linked motor among the distribution models the proposed caps hit hardest |
| D | INS-18 | Turtlemint (Mumbai) | size | PoSP platform; a renewal-reminder tool already ships in its advisor app |

**Wave 2, Wed 21 - Fri 23 October:**
- INS-01 Probus (A, website);
- INS-29 DGV Digital Insurance (B, random #2);
- INS-23 Planway Futuristic IMF (C, signal);
- INS-26 Metroxone (C, random #3);
- INS-17 PolicyBoss (D, size).

**Reserve** (use only to replace a "no" in the same stratum and selection type): INS-02, 04, 06, 07, 08, 09, 16, 19 and 20.

**Replacement rule for random rows.** If a random row has no reachable company channel within 3 working days (no website,
LinkedIn page or warm intro), replace it with the next unused row in the same frame of `register-sample-frame.csv`:
- for IMFs: draw positions 4-5, SSI Wealth Management IMF, then Makk Finsol IMF;
- for CAs: positions 3-4, Jarsecure Insurance Services, then Family First Advisory.

Log every replacement. Never replace by convenience, because that re-introduces the bias the random rows exist to remove.

### 3.3 Calendar

Dates to know (verify the festival dates locally):
- **Dussehra is around Tue 20 Oct.** Expect a thin first week.
- **Comments on IRDAI's distribution consultation are due Sat 25 Oct.** Intermediaries will be talking about the proposed
  commission caps. It is a natural topic, but do not lead with it.
- **CNAP goes live Sun 1 Nov** for 4G calls (DoT circular 13-10-2026).
- **Diwali is around Sun 8 Nov**, so 5-6 Nov is slow. Real estate is in its festive sales push throughout.

| when | outreach | interviews (target) | other work |
|---|---|---|---|
| **Sat 17 - Sun 18 Oct** (prep) | Personalise wave 1 (15 messages). Update your LinkedIn headline to say you're researching | 0 | Read this kit and `kc-answer-sheet.md`. Set up `data/discovery/`. Two timed mock interviews, including the §13 price card. **Brief counsel** (§8) |
| **Mon 19 Oct** | **Send wave 1: 15 INS** (A5, B4, C4, D2). Ask 5-10 people for warm intros. For C and B rows with no website, ask insurers' broker/IMF channel managers | 0-1 | Start the tracker. Mark the first 60 INS contacts as the KC4 cohort |
| **Wed 21 - Fri 23 Oct** | Send wave 2 (5 INS). Screen **40 more INS** from `register-sample-frame.csv` by quota: A 14, B 12, C 10, D 4 | **INS 5-7** (the first 2 are calibration) | Score each the same day. **ACS decision due Fri 23 Oct** (default "no"). Stratum check as soon as any stratum has 3 held |
| **Week 2, Mon 26 - Fri 30 Oct** | INS follow-ups (one each). Send all 20 RE plus 20 more. Warm intros to developers | **INS 7-9**, **RE 5-6** | **Interim INS check, Thu 29 Oct** (`scoring.md` §8). Pilot asks only to eligible A/B firms. Collect artefacts |
| **Week 3, Mon 2 - Fri 6 Nov** | RE follow-ups. Send all 20 LEN plus warm intros through MFIN, Sa-Dhan and lender contacts | **INS 3-5** (to reach 15 qualified and n ≥ 3 in each of A, B, C), **RE 4-5**, **LEN 5-7** | Pilot and LOI asks. RE switch test once 10 RE are done. Draft the roll-up for `context/` |
| **Mon 9 - Fri 13 Nov** (spill-over) | No new outreach | Overflow and rescheduled calls | Final scoring under both rule sets. Report KC1-KC3 (p̂_firm and p̂_vol), RE-K1/K2. Log to `context/` |

**Daily rhythm:**
- Mornings: no more than 15 personalised messages, about 5 minutes each.
- Afternoons: no more than 3 interviews, with gaps.
- Write the note within 2 hours. Score it before the next morning.

### 3.4 Target held interviews by stratum, and the funnel math

| stratum | held (target) | expected qualified (assumed) | why |
|---|---|---|---|
| A small/mid brokers | 8 | about 6 | The main KC2/KC3 stratum by volume |
| B non-bank CAs | 6 | about 4 | Firm weight 0.26; life volume 41% of the three channels |
| C IMFs | 4 | about 1 | Firm weight 0.52 but about 2% of volume; most will fall below 300 due a month (prior 0.65 that C meets the drop rule) |
| D large/platforms | 3 | about 3 | Learning only; volume-weighted read |
| **total** | **about 21** | **about 14-15** | |

**Planning assumptions** (unmeasured; replace them with the tracker's numbers after week 1):

| route | contacts needed per held interview (assumed) |
|---|---|
| cold email or LinkedIn research ask | 8-15 |
| warm intro | 1.5-2.5 |
| referral from an interviewee | about 2 |

- The only measured cold-outbound number in our files is CommandCentre's: 8,784 cold emails, 88 replies, 3 meetings (a
  different ICP and a sales pitch). It is a floor, not a forecast.
- Random-draw IMFs and CAs often have no website. Expect them to need warm routes, typically insurers' channel managers or IBAI
  members. Record how many could not be reached at all: that is itself a channel finding for KC4.
- **KC4 is measured by this funnel.** Keep the first 60 INS contacts (the 20 active plus the first 40 screened) as the KC4
  cohort, and report the funnel per stratum and per selection type.

---

## 4. Tracker

Keep it in `data/discovery/tracker.csv` (gitignored). One row per company contacted:

```
target_id,segment,stratum,selection,wave,priority,source(list|register|referral|warm),channel(email|linkedin|whatsapp-after-intro),
contact_route_found(y/n),replaced_by,first_touch,follow_up,reply(yes|no|none),do_not_contact(y/n),booked,held,in_scope,qualified,
pain,commitment,artefacts,pilot_asked,pilot_outcome(po|loi|declined|pending|not-allowed-stratum-C),kc4_cohort(y/n),notes_file
```

The weekly roll-up records, per stratum, per selection type and per channel, the counts of: sent → replied → booked → held →
in-scope → qualified → pilot asked → LOI or PO.

---

## 5. What to ask for

Ask only for things the person mentioned in the call. Tie every request to a question you could not answer without it.

### 5.1 Artefacts

| artefact | [INS] | [RE] | [LEN] | why we need it | redaction rule |
|---|---|---|---|---|---|
| Call script or talk-track | renewal script | first-call and qualification script | pre-due and 1-30 script | Battery scenarios (KC6); spotting promotional drift and re-quoting (I11) | none needed if it has no customer data |
| Disposition sheet or code list | renewal outcomes | lead stages | PTP and RTP codes | Our outcome taxonomy | codes only |
| Dialler, CRM or phone report | dials, connects, attempts, AHT by caller, last month | first-call time, attempts, visit rate | connect, PTP, kept PTP | Replaces the model's answer rate, attempts, minutes and due-per-caller | totals only, no rows |
| List format | due-list column headers, including the premium field | lead export headers | allocation file headers | Integration (I5) and the premium source (I14) | **headers only, zero rows** |
| Renewal report | renewal ratio by line, 12 months, by month | inquiry-to-visit-to-booking | roll rates by bucket | KC3 per line; seasonality (I15) | aggregates only |
| Caller pay and attrition | pay band, incentive, exits per year | same | same | Desk cost baseline; I16 | no names |
| QA and grievance summary | recordings kept, sample rate, complaint counts by source (own, insurer, Bima Bharosa) | | | I18; the product's QA requirement | counts only |
| Telephony invoice or plan | number type (mobile, 10-digit, 1600), provider, rate | same | same | I8 (1600); the real telephony cost | amounts and number type only |
| Vendor invoice or rate card (if they use a bot, BPO or agency) | | | | H2b; incumbents' real prices | amounts only |

**Handling.**
- Store artefacts in `data/discovery/artefacts/<target-id>/`, never in `research/` or `context/`.
- Delete them at programme end + 90 days (about 2027-02-04) unless a signed pilot agreement says otherwise.
- If a file arrives with customer data in it, delete it the same day and tell the sender.

### 5.2 Call recordings

Recordings of their customers are their customers' personal data under DPDP (§6.7). So, in order of preference:

1. **Listen-only sessions.** They play 3-5 recent calls on a screen-share, with names and numbers muted. You take notes on
   turn-taking, language switches, pauses, number read-backs and how the caller proves they are genuine. No copy changes
   hands. This is the default.
2. **Their redacted transcripts.**
3. **Audio files, only under a written data-sharing agreement** signed by their authorised person, stating:
   - purpose: evaluation only;
   - that customers were told calls are recorded;
   - storage: an encrypted location in the agreed region (IRDAI keeps intermediary records in India; l1 round 2);
   - deletion: by a date;
   - no model training.

Never ask for recordings of collections calls in which a borrower is in distress. Never use any recording in marketing.

---

## 6. The paid-pilot ask

**When.** Only to interviewees who are pilot-eligible under `scoring.md` §6:
- qualified;
- stratum A or B (not C until counsel answers the IMF question; D only as a platform conversation);
- pain ≥ 2;
- commitment ≥ 2;
- price not scored −1 on the main line.

Ask in a **second** conversation, never in the discovery call, and ideally with the budget holder present.

**What makes it honest.** We have no product yet. Live calling can start only after three gates pass:
1. our agent passes the measured battery on their scripts (KC6);
2. counsel confirms a compliant path (KC5): 1600 numbers in **their** name, and the call staying a service call;
3. numbers and DLT are set up in **their** name through their CPaaS.

Say this plainly. Ask for a **signed LOI at a stated price, with those gates as conditions**, or a PO that starts on the date the
gates pass. Both count toward the 3-of-15 proof bar.

### 6.1 The ask (adapt; don't read)

> "From what you told me, [their numbers: e.g. 1,500 renewals due a month, 40% two-wheeler, 30% car, 4 callers]. Here's what
> I'd propose.
>
> A six-week paid pilot on one month's due list. We leave a random 1 in 10 to your usual process as the comparison, and never
> bill for those. You'd pay ₹50 per car renewal, ₹15 per health or life renewal and ₹20 per two-wheeler renewal collected from
> the list we work, with a ₹15,000 monthly minimum that your usage counts against. On last month's list that's about ₹[bill].
>
> It only starts once our system passes our own tests on calls like yours, and once a 1600 number is set up in your name.
> Would you sign a one-page letter of intent on those terms now, so we can plan around your list?"

- Use the prices the firm accepted in §13 if they were higher. Never go below the card without logging a deviation.
- If the firm said renewals before the first call should not be billable (§13.3), the prices that keep a 40% margin are car
  ₹35, health ₹19 and life ₹24. Quote those, or decline that line.

### 6.2 One-page pilot outline (for the founder to turn into a document; not legal advice)

| term | [INS] (beachhead) | [RE] (alternate 1) | [LEN] (alternate 2) |
|---|---|---|---|
| Scope | One month's retail due list (car and/or health first; two-wheeler and life only if the firm takes hand-offs and pays the floor), 1,000-3,000 policies | One project's or one source's new inquiries for 4 weeks | One product's pre-due plus 1-30 DPD accounts for one cycle |
| Comparison | Random 10% holdout (or the share the firm accepted) on their usual process, drawn by us from the full list **before** any calls, never billed | Random 20% of inquiries handled the usual way | Random 20% holdout |
| Duration | 6 weeks (one cycle plus grace period) | 4 weeks | One EMI cycle plus 30 days |
| Price | Per renewal collected at the card (car ₹50, health ₹15, life ₹15, two-wheeler ₹20) or higher, with a ₹15k monthly minimum credited against usage. Define "renewal collected" in writing | ₹300-500 per qualified site visit plus a minimum | Per account brought current plus a minimum |
| Primary measure, agreed in writing **before** start | Renewal rate, AI cohort vs holdout: **not worse than their team** (non-inferiority, KC7) | Qualified visits per 100 inquiries; time to first call | Roll rate from 1-30 to 31+ |
| Secondary measures | Cost per renewal, opt-outs, complaints (including Bima Bharosa), scam-suspicion refusals, correct-language rate, escalations | Same | Same, plus PTP kept and complaints under the RBI conduct rules |
| Their side | List or CRM export with the insurer's renewal premium per policy, the approved disclosure line, an escalation owner and hours, 1600 numbers and DLT through their CPaaS | Same, plus calendar access | Same, plus recording retention set-up |
| Our side | AI disclosure plus the firm's IRDAI registration number at the start of every call; no re-quotes, switches or sales on service calls; daily review; recordings retained per their policy; a kill switch they can use | Same, plus the 7-day-window and consent checks | Same, plus 08:00-19:00 hours (verify against the RBI text) |
| Data | We act as their processor under a DPDP s.8(2) contract; data stays in the agreed region; deletion at the end; no training on their data | Same | Same, plus residency confirmed (§6.11) |

**What the pilot can and cannot prove.**
- **It can prove** "not worse than your team" within a few points. For example, with 3,000 policies, a 20% holdout and a 70%
  renewal rate, the 90% interval on the difference is about ±3.4 points. At a 10% holdout it is wider.
- **It cannot prove a lift in month one**, and for health and life usually not within a year. At 1,500 due a month and a 10%
  holdout, detecting the median modelled lift takes:

  | two-wheeler | car | health | life |
  |---|---|---|---|
  | 2.9 months | 5.4 | 25.8 | 20.7 |

  Source: `renewal-mde.csv`.
- Say so before they sign, so a "no lift yet" result isn't read as failure.

**Never promise:**
- a lift percentage;
- a start date before the gates pass;
- "human-like" quality;
- compliance before counsel has answered.

---

## 7. Logging, privacy and handover

- **Personal data stays in `data/discovery/`**, which is gitignored: notes, tracker, artefacts and recordings. Delete
  recordings once notes are written.
- **Only the anonymised roll-up leaves.** It covers:
  - score counts by stratum (never by firm);
  - p̂_firm and p̂_vol;
  - the conversion funnel;
  - price distributions per line;
  - the §5 model inputs;
  - quotes with no identifying detail.

  It goes to `research/2026-10-17/founder-kit/results-YYYY-MM-DD.md`, and its findings go to `context/` per `AGENTS.md`
  (`context/STATE.md`, `context/graph.json` and the append-only `context/events.jsonl`). Then run `npm run context:check`.
- Each `context/` entry follows `scoring.md` §12: measurements with n, method and date; decisions with reversal conditions;
  rejections; deviations.
- `targets.csv` and `register-sample-frame.csv` contain no personal names or contact details. Keep it that way when adding
  rows. `build_targets.py` and `code/strata.py` refuse e-mail addresses and phone numbers.

---

## 8. Parallel work the interviews depend on (owner)

| item | why it matters to the interviews | when |
|---|---|---|
| **Counsel review.** The SYNTHESIS §8.2 questions, plus these from l1 round 2: (1) can a small intermediary obtain 1600 numbers, and may a vendor's software operate calls on them; (2) is a persuasive renewal call by software "solicitation" under each intermediary regulation (Brokers Regs def (t) and WA Regs def (m) define solicitation as *purchase* only); (3) **IMF reg 3(d)**: may an IMF use AI software for neutral renewal reminders at all; (4) the IRDAI telemarketer and Authorised Verifier regime; (5) recording notice and India-located records | KC5 is decided here, not in interviews. **No pilot starts without it, and no IMF pilot ask is made before item 3 is answered.** Interviews supply the facts (I8, I11, IMF answers) | Brief counsel by Mon 19 Oct. Ask for an answer by about Fri 13 Nov |
| **IRDAI distribution consultation** (comments due 25 Oct) | The proposed caps would cut value per save roughly 2-3× (`interview-guide.md` §13.2 caveat 4; `code/caps_sensitivity.py`). Decide whether to submit a comment; it is not needed for the interviews | By Fri 23 Oct if at all |
| **ACS decision** | SYNTHESIS §8.3: default "no" | Fri 23 Oct |
| **Telephony quotes** (Exotel, Ozonetel, Vobiz, Plivo, Tata, Jio) | 1600 provisioning for an intermediary, its price (none is published), media streaming into Azure, India latency. Needed to write the pilot's "their side" terms truthfully. Plivo states about 7-14 business days to provision | Weeks 1-2 |
| **Battery on our own agent** with personas from I9 and real scripts | KC6, the pilot's first gate | After the first scripts arrive (week 2 onwards) |
| **Mailbox and LinkedIn** for VP, not CarbonSettle | `outreach.md` §1 | Before Mon 19 Oct |

---

## 9. Owner-only actions (in order)

1. Read `scoring.md` and accept the pre-registered round-2 rules as written, or log a deviation **before** the first call.
2. Brief counsel (§8), including the IMF reg 3(d) and solicitation questions.
3. Set up the VP mailbox, LinkedIn headline, calendar link and `data/discovery/` (tracker, notes and artefacts folders).
4. Run two mock interviews with a friend, including the price card and the live bill. Time them against the 40-minute plan.
5. On Mon 19 Oct, send wave 1 (the 15 in §3.2) and ask for warm intros, especially insurer channel managers for IMFs and CAs.
6. Wed-Fri: send wave 2 and screen 40 more INS targets from `register-sample-frame.csv` by stratum quota, company-level
   only, into `targets.csv` as INS-30 onwards.
7. Hold the interviews, write and score the same day, run the stratum checks, and run the interim check on Thu 29 Oct.
8. Make pilot or LOI asks to eligible A/B prospects in weeks 2-3.
9. Do the final scoring under both rule sets and log to `context/` by about Fri 13 Nov.
