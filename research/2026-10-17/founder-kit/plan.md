# Founder interview plan: 25-40 interviews in 3 weeks

Date: 2026-10-17 (Saturday). The interviews run Monday 2026-10-19 to Friday 2026-11-06.

The other files in this kit:
- `targets.csv`: 60 verified companies.
- `outreach.md`: messages.
- `interview-guide.md`: the call.
- `note-template.md`: the write-up.
- `scoring.md`: the pre-registered decision rules.

Nothing in this kit has been sent, and nobody has been contacted.

---

## 1. What this programme must decide, and what counts as proof

It answers SYNTHESIS §8 item 1:
- 15 qualified insurance intermediaries first;
- then about 10 real-estate firms and 5-10 lenders;
- 25-40 interviews in total, with artefacts.

It decides, by the rules in `scoring.md` §5:
- **KC1** (renewal desks exist), **KC2** (price) and **KC3** (leakage) for the beachhead;
- **RE-K1/K2** and the switch test for alternate 1;
- inputs for alternate 2;
- the first data point for **KC4/RE-K4** (channel).

**Proof** is buyers' money. Brief §6 sets the bar at **3 paid pilots or signed LOIs at a stated price, from 15 qualified prospects**. Stated interest does not count. Compliments score 0 (`scoring.md` §3).

---

## 2. Inputs, and the limits of this kit

1. **Sources read:**
   - `../SYNTHESIS.md` (beachhead, alternates, kill criteria);
   - `../vp-research-brief.md`;
   - `../lanes/l3-segments/verify.md` and the lane's data files.
   - The task named `lanes/l3-segments/report.md`, but **it does not exist**. SYNTHESIS also notes that no lane wrote a report.md. The l3 verifier's file and the lane's CSVs were used instead.
2. **How the 60 companies were found.** Web search was unavailable: the shared search budget was already used up when this kit was built. Companies were found from three primary sources:
   - **IRDAI registers** (broker, IMF and corporate-agent lists, fetched and parsed 2026-10-17);
   - **the l3 lane's Apna crawl** (about 6,300 telecalling-type postings dated 2026-10, with employer names, from the session scratchpad);
   - **direct fetches** of company websites, including the developers and lenders added by name.
   Every company was then checked against its register entry or its own site.
3. **Verification rule.**
   - Segment 1 is verified against the IRDAI register by registration number.
   - Segments 2 and 3 are verified against the company's own website (HTTP 200 on 2026-10-17, page names the entity and its business).
   - All 58 non-Apna URLs in `targets.csv` were re-checked at HTTP 200, and all 40 Apna URLs exist in the crawl.
   - The RBI NBFC register download is behind a bot challenge, so we could not check lenders against it. Their RBI status rests on what their own sites say, which `targets.csv` records in the `subtype` column:
     - Sindhuja shows its registration number. SATYA cites its section 45-IA certificate.
     - Pahal, Svamaan, Dhanam, Kalyan, Finnable, Mufin, Moneyboxx and Light state that they are RBI-registered NBFCs or NBFC-MFIs.
     - Arman, Ashv, Midland and Jagaran do not state it on the fetched homepage. Treat their status as unverified.
   - Collection agencies are not RBI-registered entities. They are verified by their own sites only.
   - `build_targets.py` regenerates the CSV from the hand-verified rows and refuses any row containing an email address or phone number.
4. **Three wrong-entity traps were caught.** The founder should not repeat them:
   - `gibl.in` is GreenLife Insurance Broking (CoR 450), not Global India Insurance Brokers.
   - `wealthclinic.com` is a US coaching firm. The Noida channel partner is `wealth-clinic.com`.
   - `goldenarm.in` is a sports turf, not Golden Arm Insurance.
   This matches the harvest lesson that guessing domains is dangerous.
5. **Apna caveats** (l3v):
   - The crawl is a one-month snapshot of a blue-collar board.
   - `no_of_openings` defaults to 10, so only non-10 values mean anything. RB Insurance Marketing's 70 openings is one.
   - Posts show a phone team exists, not that it does *renewal* or *pre-due* work. That is what the interview tests.
6. **Excluded by design:**
   - Large consumer-internet firms with in-house teams: PBPartners/Policybazaar, Square Yards, NoBroker, Housing/PropTiger, Navi, KreditBee, Moneyview, Paytm, MobiKwik.
   - Competitors: Credgenics, DPDzero.
   - Generic staffing firms that post on others' behalf.
   - InsuranceDekho and Turtlemint stay in because the segment definition names them. They are priority C (slow procurement, may build in-house).
7. **Strong candidates left out because existence could not be verified** (no website found, and not on a register we could read). Re-check them if the founder finds their sites:
   - Collman Services (Bengaluru; 10 collection-telecaller posts, the strongest lending evidence in the crawl);
   - Maxpremia (Varanasi; "Insurance Sales & Renewal Executive" post; site returned 403);
   - Secure Drive IMF (Vadodara; renewal telecaller; not found in the IMF register under that name);
   - Swicar Technology, Moneymile Marketing, Confiar Policyfirst, Celestia Money, V2S Finance, Credit Kuber Micro Finance, RK Bansal Finance.
   - Also: Kogta Financial (verified, but 290 branches and 6,500 staff make it likely above base layer) and Namra Finance (folded into its parent, Arman).

---

## 3. Sequencing

### 3.1 Why this order

- **Insurance first**, because it is the beachhead and its kill criteria are the cheapest to test by talking.
- **Real estate second**, because the switch rule needs real-estate evidence *while* the insurance result is fresh.
- **Lending last.** Most of its kill criteria are legal or battery questions that interviews only feed.

Inside each segment, go priority A, then B, then C. Use 2-3 C-priority or warm, friendly contacts as **calibration interviews** in the first days. Those still count if they qualify.

### 3.2 Calendar

Two festivals fall in the window (verify the dates locally):
- **Dussehra is around Tue 20 Oct.** Expect a thin first week.
- **Diwali is around Sun 8 Nov**, so 5-6 Nov is pre-Diwali and slow. Real estate is in its festive sales push throughout, so developers' sales heads will be busy. Book them early in the day.

| when | outreach | interviews (target) | other work |
|---|---|---|---|
| **Sat 17 - Sun 18 Oct** (prep) | Personalise and queue messages for all 20 INS rows. Update your LinkedIn headline to say you're researching | 0 | Read this kit. Set up `data/discovery/` and the tracker (§4). Record two mock interviews with a friend, timed. **Brief counsel** (§8) |
| **Week 1, Mon 19 - Fri 23 Oct** | Send all 20 INS. Screen and send **40 more INS** from the IRDAI registers (§3.3). Ask 5-10 people for warm intros to brokers, IMFs and PoSP leaders | **INS 6-8** (the first 2 are calibration) | Score each the same day. **ACS decision due Fri 23 Oct** (SYNTHESIS §8.3, default "no") |
| **Week 2, Mon 26 - Fri 30 Oct** | INS follow-ups (one each). Send all 20 RE plus 20 more from CREDAI chapter lists or developer sites. Warm intros to developers | **INS 7-9**, **RE 5-6** | **Interim INS check on Thu 29 Oct** (`scoring.md` §5). Ask eligible INS for a pilot. Collect artefacts |
| **Week 3, Mon 2 - Fri 6 Nov** | RE follow-ups. Send all 20 LEN plus warm intros through MFIN, Sa-Dhan and lender contacts | **INS 3-5** (to reach 15 qualified), **RE 4-5**, **LEN 5-7** | Pilot and LOI asks. RE switch test once 10 RE are done. Draft the roll-up for `context/` (§7) |
| **Mon 9 - Fri 13 Nov** (spill-over) | No new outreach | Overflow from week 3 (its upper end exceeds 3 a day) and rescheduled calls | Final scoring. Report KC1-KC3 and RE-K1/K2. Log to `context/` |

**Daily rhythm:**
- Mornings: no more than 15 personalised messages, about 5 minutes each.
- Afternoons: no more than 3 interviews, with gaps.
- Write the note within 2 hours of each call. Score it before the next morning.

**Totals.**
- Plan: 16-22 INS held, 9-11 RE and 5-7 LEN, so 30-40 interviews.
- About 21 INS held are needed for 15 qualified (§3.3).
- Floor: 25 interviews, with 15 qualified INS.
- If the INS interim check triggers the early-switch rule, move slots to RE. Log it as a deviation.

### 3.3 The funnel math, honestly

**Sixty targets will not produce 25-40 interviews on their own.**
- The only measured cold-outbound number in our files is CommandCentre's: 8,784 cold emails, 88 replies, 3 meetings (SYNTHESIS §9.10).
- That was a sales pitch to EU importers, so it is not comparable. It is still the floor to plan against.
- Research asks to Indian SMB owners, sent by hand, will do better, but by how much is **not measured**.

The plan below therefore uses three levers and **measures the conversion as it goes**:

1. **More targets per segment.** Screen the registers the same way `targets.csv` was screened, holding company names and registration numbers only:
   - IRDAI: 940 IMFs, 874 brokers, 689 corporate agents;
   - CREDAI: 13,000+ developers;
   - RERA agent lists;
   - MFIN and Sa-Dhan member lists.
   Keep personal contact fields out. Add rows as `INS-21`, `INS-22` and so on, with the same evidence standard.
2. **Warm intros first wherever they exist.** Routes from l4c `channels.csv`:
   - insurers' broker-channel managers;
   - IBAI members (523 in 2022);
   - PoSP-platform partner managers;
   - CREDAI city chapters;
   - MFIN and Sa-Dhan;
   - CPaaS account managers who serve these segments.
3. **Referrals from every interview.** Cap at 3 per seed firm in the qualified INS count (`scoring.md` §7).

**Planning assumptions** (unmeasured; replace with the tracker's numbers after week 1):

| route | contacts needed per held interview (assumed) |
|---|---|
| cold email or LinkedIn research ask | 8-15 |
| warm intro | 1.5-2.5 |
| referral from an interviewee | about 2 |

About 30% of held [INS] interviews may turn out unqualified (assumed), so 15 qualified needs about 21 held. A plausible mix is 10 warm, 6 referral and 5 cold, which needs about 20 warm intros, 12 referral asks and 40-75 cold contacts. That is why §3.2 adds 40 register-screened INS targets in week 1.

**KC4 is being measured by this very funnel.** SYNTHESIS: "after 60 targeted intermediaries, fewer than 10 take a discovery call or fewer than 3 accept a paid pilot within 10 weeks". Keep the first 60 INS contacts as the KC4 cohort, and record every one in the tracker.

---

## 4. Tracker

Keep it in `data/discovery/tracker.csv` (gitignored). One row per company contacted:

```
target_id,segment,priority,source(list|register|referral|warm),channel(email|linkedin|whatsapp-after-intro),
first_touch,follow_up,reply(yes|no|none),do_not_contact(y/n),booked,held,qualified,pain,commitment,
artefacts,pilot_asked,pilot_outcome(po|loi|declined|pending),kc4_cohort(y/n),notes_file
```

The weekly roll-up records, per segment and per channel, the counts of: sent → replied → booked → held → qualified → pilot asked → LOI or PO.

---

## 5. What to ask for

Ask only for things the person mentioned in the call. Tie every request to a question you could not answer without it.

### 5.1 Artefacts

| artefact | [INS] | [RE] | [LEN] | why we need it | redaction rule |
|---|---|---|---|---|---|
| Call script or talk-track | renewal script | first-call and qualification script | pre-due and 1-30 script | Battery scenarios (KC6). Spotting promotional drift (§6.2) | none needed if it has no customer data |
| Disposition sheet or code list | renewal outcomes | lead stages | PTP and RTP codes | Our outcome taxonomy and extraction schema | codes only |
| Dialler, CRM or phone report | dials, connects, AHT by caller, last month | first-call time, attempts, visit rate | connect, PTP, kept PTP | Replaces k, m and r defaults (Appendix A), and the volume assumptions (§1.1 item 7) | totals only, no rows |
| List format | due-list column headers | lead export headers | allocation file headers | Integration and AI column mapping. Tests the unsourced "spreadsheet" claim | **headers only, zero rows** |
| Renewal or performance report | renewal ratio by line, 12 months | inquiry-to-visit-to-booking | roll rates by bucket | KC3, RE-K1, the LEN value gate | aggregates only |
| Caller pay and attrition | pay band, incentive, exits per year | same | same | ₹6-9 per connected minute baseline (l2v) | no names |
| Vendor invoice or rate card (if they use a bot, BPO or agency) | | | | H2b, LEN-K2 context, incumbents' real prices | amounts only |

**Handling.**
- Store artefacts in `data/discovery/artefacts/<target-id>/`, never in `research/` or `context/`.
- Delete them at programme end + 90 days (about 2027-02-04) unless a signed pilot agreement says otherwise.
- If a file arrives with customer data in it, delete it the same day and tell the sender.

### 5.2 Call recordings

Recordings of their customers are their customers' personal data under DPDP (§6.7). So, in order of preference:

1. **Listen-only sessions.** They play 3-5 recent calls on a screen-share, with names and numbers muted. You take notes on turn-taking, language switches, pauses and number read-backs. No copy changes hands. This is the default.
2. **Their redacted transcripts.**
3. **Audio files, only under a written data-sharing agreement** signed by their authorised person, stating:
   - purpose: evaluation only;
   - that customers were told calls are recorded;
   - storage: an encrypted location in the agreed region;
   - deletion: by a date;
   - no model training.
   This is needed if we want real audio for the battery (§3 thesis (a); SYNTHESIS §9.3 says all caller audio so far is synthetic).

Never ask for recordings of collections calls in which a borrower is in distress. Never use any recording in marketing.

---

## 6. The paid-pilot ask

**When:** only to interviewees who are pilot-eligible (`scoring.md` §3): qualified, pain ≥2, commitment ≥2, and price not scored −1. Ask in a **second** conversation, never in the discovery call, and ideally with the budget holder present.

**What makes it honest:**
- We have no product yet. Live calling can start only after three gates pass:
  1. our agent passes the measured battery on their scripts (KC6);
  2. counsel confirms a compliant number path (KC5);
  3. numbers and DLT are set up in **their** name through their CPaaS (§6.1).
- Say this plainly. Ask for a **signed LOI at a stated price, with those gates as conditions**, or a PO that starts on the date the gates pass. Both count toward the 3-of-15 proof bar.

### 6.1 The ask (adapt; don't read)

> "From what you told me, [their numbers: e.g. 3,000 motor and health renewals due a month, 4 callers, about 72% renewing]. Here's what I'd propose.
>
> A six-week paid pilot on one month's due list. You keep a random 20% on your usual process as the comparison. You pay ₹[pilot fee] a month for the pilot. If it works, it moves to ₹[per-renewal price] per renewal collected with a ₹[minimum] monthly minimum.
>
> It only starts once our system passes our own tests on calls like yours, and once the calling numbers are set up in your name. Would you sign a one-page letter of intent on those terms now, so we can plan around your list?"

### 6.2 One-page pilot outline (for the founder to turn into a document; not legal advice)

| term | [INS] (beachhead) | [RE] (alternate 1) | [LEN] (alternate 2) |
|---|---|---|---|
| Scope | One month's retail due list (motor and/or health), 1,000-3,000 policies | One project's or one source's new inquiries for 4 weeks | One product's pre-due plus 1-30 DPD accounts for one cycle |
| Comparison | Random 10-20% holdout on their usual process, drawn by us from the full list **before** any calls | Random 20% of inquiries handled the usual way | Random 20% holdout |
| Duration | 6 weeks (one cycle plus grace period) | 4 weeks | One EMI cycle plus 30 days |
| Price | Pilot fee ₹25,000-50,000 a month (SYNTHESIS §1). Afterwards: per renewal collected plus a monthly minimum, at the GG-anchored price | ₹300-500 per qualified site visit plus a minimum | Per account brought current plus a minimum |
| Primary measure, agreed in writing **before** start | Renewal rate, AI cohort vs holdout: **not worse than their team** (non-inferiority, KC7) | Qualified visits per 100 inquiries; time to first call | Roll rate from 1-30 to 31+ |
| Secondary measures | Cost per renewal, opt-outs, complaints, correct-language rate, escalations | Same | Same, plus PTP kept, and complaints under the RBI conduct rules |
| Their side | List or CRM export, the approved disclosure line, an escalation contact, numbers and DLT through their CPaaS | Same, plus calendar access | Same, plus recording retention set-up |
| Our side | AI disclosure at the start of every call; no sales on service calls; enforced calling hours; daily review; a kill switch they can use | Same, plus the 7-day-window and consent checks | Same, plus 08:00-19:00 hours (verify against the RBI text) |
| Data | We act as their processor under a DPDP s.8(2) contract. Data stays in the agreed region. Deletion at the end. No training on their data | Same | Same, plus residency confirmed (§6.11) |

**What the pilot can and cannot prove.**
- It can prove "not worse than your team" within a few points.
- Example: with 3,000 policies, a 20% holdout and a 70% renewal rate, the 90% interval on the difference is about ±3.4 points.
- It **cannot** prove a lift in month one. l6v: only 22% of insurance buyers can test a +10% relative lift in month one.
- Say so before they sign, so a "no lift yet" result isn't read as failure.

**Never promise:**
- a lift percentage;
- a start date before the gates pass;
- "human-like" quality;
- compliance before counsel has answered.

---

## 7. Logging, privacy and handover

- **Personal data stays in `data/discovery/`**, which is gitignored: notes, tracker, artefacts and recordings. Delete recordings once notes are written.
- **Only the anonymised roll-up leaves.** That is the score counts by segment, the conversion funnel, the price distributions in ₹/min, and quotes with no identifying detail. It goes to `research/2026-10-17/founder-kit/results-YYYY-MM-DD.md`, and its findings go to `context/` per `AGENTS.md`:
  - `context/STATE.md`;
  - `context/graph.json`;
  - the append-only `context/events.jsonl`.
  Then run `npm run context:check`.
- Each `context/` entry follows `scoring.md` §8: measurements with n, method and date; decisions with reversal conditions; rejections; deviations.
- `targets.csv` contains no personal names or contact details. Keep it that way when adding rows.

---

## 8. Parallel work the interviews depend on (owner)

| item | why it matters to the interviews | when |
|---|---|---|
| **Counsel review** (SYNTHESIS §8.2): must IRDAI intermediaries use 1600xx, and can they get it? Is the tenant-held-number model sound? Recording notice? The DPDP processor contract? For lending, is a vendor-run AI a recovery agency? | KC5 and LEN-K1/K4 are decided here, not in interviews. **No pilot starts without it.** Interviews supply the facts (I8, L5, L7) | Brief counsel by Mon 19 Oct. Ask for an answer by about Fri 13 Nov |
| **ACS decision** | SYNTHESIS §8.3: default "no" | Fri 23 Oct |
| **Telephony quotes** (Exotel AgentStream, Ozonetel SIP, Vobiz, Plivo): 1600 carriage, BYO-bot into Azure, India latency | Needed to write the pilot's "their side" terms truthfully | Weeks 1-2 |
| **Battery on our own agent** with personas from I9 and real scripts | KC6. The pilot's first gate | After the first scripts arrive (week 2 onwards) |
| **Mailbox and LinkedIn** for VP, not CarbonSettle | `outreach.md` §1 | Before Mon 19 Oct |

---

## 9. Owner-only actions (in order)

1. Read `scoring.md` and accept the pre-registered rules as written, or log a deviation **before** the first call.
2. Brief counsel (§8).
3. Set up the VP mailbox, LinkedIn headline, calendar link and `data/discovery/` (tracker, notes and artefacts folders).
4. Run two mock interviews with a friend. Time them against the 40-minute plan.
5. Personalise and send the first 20 INS messages, and ask for warm intros.
6. Screen 40 more INS targets from the IRDAI registers (company-level only) into `targets.csv` as INS-21 onwards.
7. Hold the interviews, write and score the same day, and run the interim check on Thu 29 Oct.
8. Make pilot or LOI asks to eligible prospects in weeks 2-3.
9. Do the final scoring and log to `context/` by about Fri 13 Nov.
