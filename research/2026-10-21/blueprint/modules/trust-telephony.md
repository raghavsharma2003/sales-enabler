# trust-telephony: the rails and the rules

**This module answers four questions:**
- what may be dialled;
- from which number;
- saying what;
- who can see it.

**Status:** proposed for owner review, 2026-10-21 (`directive.2026-10-21.blueprint-end-to-end`).

**Machine-readable defaults:** `data/blueprint/trust-telephony-defaults.json`. They match the campaigns windows and budgets, the workspace roles and risk classes, the voice lint L7 and crisis rule R5, and the memory opt-out write.

**Grades:**
- [M] measured by us;
- [C] computed;
- [O] observed;
- [V] vendor-claimed;
- [I] inferred;
- [U] unknown;
- [P] proposed product choice.

**Tags and ids.** Short tags follow the spine: RS, TS, WT, AS, SCH, HV, L1, L5, R2R, SY2, SY18. Claim ids are the dossiers' own: EXO-, BOL-/ACB-, SAR-, RET-/RAP-, EL-, VAP-/AP-, SYN-, SQS-.

**Legal readings.** Every legal reading here is a desk reading of primary text, not legal advice. Items marked "counsel" wait for a lawyer.

## 0. The module on one page

**Rails.**
- Numbers sit in the tenant's name on licensed Indian carriers: Plivo primary, then Vobiz and Exotel AgentStream.
- VP is software that drives the tenant's line. It never connects a PSTN call itself.
- VP holds one line of its own: a trial line that rings only numbers their owners have verified.

**Rules.** Four engines in code, never in prompts:
1. **The dial gate.** One path for every attempt: campaign, API, test, retry, callback and transfer.
2. **The reply door.** Every word passes it before TTS.
3. **compile() lint.** It checks every brief on every creation path: dashboard, API, MCP, template and copilot.
4. **The data gate.** It governs every read of personal data: roles, redaction, residency and tenant isolation.

These enforce HV laws 3, 10, 11, 12, 16, 17 and 18, and spine invariants 1, 2, 5 and 6.

**The visible promise.** Every call shows *why it was allowed*. Every blocked attempt names the rule that stopped it and the fix. Every line shows four things:
- its series;
- its A2P declaration;
- its health;
- its display name.

Every person shows consent, suppression and attempts.

**Why this matters even though buyers rarely complain about compliance.**
- Compliance is 6 of 459 coded Indian complaints (1.3%, RS-45 [M]). It is a floor, not the pitch.
- But it fails suddenly, and the failure lands on the tenant's own numbers. In Q1 FY27: 137,053 resources barred, 46,786 disconnected for a year, 263 senders blacklisted. About 75% of April disconnections were SIP/PRI lines (RS-39 [O]).
- A first proven violation bars all of a sender's resources at all operators for 15 days (RS-43 [O]).

**What no competitor ships today** (0 of 8 vendors; TS §3, RS §2.12 [O]):
- an A2P declaration export;
- an in-call promotion fence;
- a category-derived series router;
- a consent ledger;
- a non-removable AI disclosure.

## 1. Benchmark: who is best at each part, and where each falls short

| Sub-area | Best today and its best version | Where it falls short |
|---|---|---|
| Indian number path | **Sarvam** shows Rent (via Vobiz) beside Bring-your-own with 7 providers (WT sarvam 23 [O]). **Bolna** puts India in the buy dialog, lists KYC documents before the click, has per-number Truecaller verify and SIP Health / Active calls / Last call columns (bolna 25, 36 [O]). | All 6 dashboards show no number price before purchase and no 140, 1600 or 1601 series (WT §2.12 [O]). Sarvam rents 10-digit numbers only (SAR-45). Bolna shows a US "615" helper in its India flow. ElevenLabs is import-only, with Region defaulting to Singapore under +91 (elevenlabs 34). Retell puts a Persona ID wall before any country or price (retell 30). Vapi cannot terminate Indian calls (VAP-42). |
| Regulated series and rails | **Exotel** has 140xx with DLT, 1600 via a UL VNO licence (EXO-50 [V]), a Transactional/Promotional call-type field, Mumbai hosting, and Airtel, Tata, Jio and Vi carriers. | The bot path enforces neither windows, DND nor opt-out (EXO-45 [O]). KYC takes 1-3 business days. It bills 60 s pulses. AgentStream is priced by quote. It spans three consoles. |
| Pre-dial control | **Vapi** has a blocking campaign.predial webhook: an error or timeout means no call (AP-27 [O]). It is the only pre-dial veto in 5 APIs. | The buyer must bring the scrub list. It has no contact object (AP-12) and no India path. |
| In-call opt-out | **SquadStack** has a typed dnd_request closing tool (SQS-72 [O]) and DLT fields on campaign blocks (SQS-03). | It sells "spam number rotation" (SQS-48). Its opt-out row is predicted to be dialled unless blacklisted (SQS-P04). Sign-in is allowlisted. |
| Suppression that holds | **None.** Retell's DNC is off by default and its docs say batch calls skip it (RET-43; open.2026-10-21.wt-retell-dnc-skip-claim). | Synthflow's only opt-out signal is a post-call judge field that did not run for 2 h 50 m on 2026-08-07, while webhooks fired empty (SYN-07/66 [O]). Sarvam has DND by API only (SAR-44). Bolna has none (BOL-46). |
| Calling windows | **Retell** has multi-range windows with days of the week, and its dashboard defaults to Asia/Calcutta (retell 24/25 [O]). | Its window defaults to 00:00-23:59. Bolna and Exotel publish 9-21, while the primary text gives 10:00-21:00 for promotional calls (RS-16). Vapi allows one absolute range per campaign (VAP-46). |
| A2P export, category fence, consent ledger, sector packs | **Nobody** (0 of 8). | Exotel even says voice needs no DLT; the primary texts contradict this (RS-17). |
| AI disclosure | **Retell** seeds an "AI Disclosure When Asked" preset on agents created in the dashboard (RAP-19/20 [O]). | API-created agents get nothing. Sarvam's demo claimed to be human in 6 of 6 calls where asked (R2 §1 [M]). Vapi's demo: 1 clear disclosure, 3 hedged, 4 talked over (L4B [M]). SquadStack rewards passing as human (SQS-58/59). |
| Live safety | **Exotel Harmony "Monitored Bot"**: Sentiment Crash and Repetition Loop alerts, with a human able to barge in. | It needs a person watching. No crisis-line predicate exists anywhere. |
| Announcements and answering machines | **Exotel AMD beta** returns a result 3-5 s after answer, enabled by an account manager. | It is not in the dashboard. Bolna waits for 7+ words, checking every 7 s for up to 30 s while billing, with no Hindi operator messages (ACB-41). SquadStack classifies only after the call (SQS-11). |
| Transfer | **Retell** offers Cold, Warm and Agentic Warm modes in plain words, with REFER/INVITE and the displayed caller ID (retell 08 [O]). | No Indian CLI. Bolna's transfer posts no summary after a fixed 2 s sleep (ACB). Exotel's warm transfer needs Harmony. |
| Number health | **Bolna**: per-number Truecaller verify plus trunk health columns. | Nobody paces against the TRAI reg 21A signals: recipient diversity, short calls, and the incoming:outgoing ratio (L1 claim 11 [O]). |
| Roles and audit | **Retell**: fixed Admin, Developer and Member roles on a trial, with a scrubbed-history viewer (retell 6z-roles [O]). Vapi keeps an append-only traffic-split ledger with actor and key id (AP-21). | No audit log, SSO or residency selector was seen at any of the 6 (WT §2.16). Team members are a paid feature at Bolna. |
| Keys and widgets | **ElevenLabs**: per-agent auth plus a red "Any host will be able to connect" warning (elevenlabs 54 [O]). | Open by default. 0 of 5 API-tested vendors have a spend cap per key (AS XS-26..28). |
| PII and retention | **Retell**: 14 PII categories plus storage and retention choices (retell 13 [O]). | Its defaults are "Everything, Keep forever", with no Aadhaar or PAN. ElevenLabs retention is Unlimited. Exotel's masking is opt-in, post-call only, and leaves audio and live webhooks unmasked (EXO-47). |
| Residency and telemetry | **Exotel**: Mumbai, with the region fixed at sign-up. | Sarvam claims PII stays in India, but its dashboard replay sends unmasked sessions to PostHog US (SAR-63 [O]). ElevenLabs offers India residency on Enterprise only (EL-39). Only 4 of 8 vendors keep the call path in India by default (TS §5). |

## 2. Module laws (inherited, made concrete)

1. **One dial path.** Every check runs inside the transaction that claims the attempt. Rejected precedent: `rejected.harvest.07` (multiple send paths and enroll-time-only checks made opt-outs fail) and HV law 18.
2. **One reply door with predicates on bytes.** Prompt-only safety leaked 57-98%; predicates leaked 0 (HV law 10 [M]; `rejected.harvest.03`).
3. **Approvals live in code.** A model-emitted "approved" means nothing (HV law 12; `rejected.harvest.04`).
4. **Identifiers are checked by provenance, not by blocklist** (HV law 11). Redaction never touches Tele-MANAS 14416, 112 or the tenant's published numbers.
5. **Nothing silent.** A check that cannot run blocks the attempt, names itself and raises an issue. Grounds: HV law 21, `rejected.harvest.16`, and Synthflow's silent judge.
6. **Outcomes are confirmed, not_executed or unknown.** An unknown outcome is never auto-retried (HV law 17).
7. **Consent is append-only** and checked against its original time inside the write (HV law 16).
8. **Per tenant only.** No cross-tenant suppression or learning pool (`rejected.2026-10-17.cross-tenant-pooling`; DPDP s.8(2)).

## 3. Telephony design

### 3.1 Rails: the tenant's line, VP's software

**Why the numbers sit in the tenant's name.**
- Sanctions land on telecom resources.
- A CPaaS that lends CLIs is treated as the sender (RS-43, REG-12).
- So if VP held the numbers, one abusive tenant could bar every VP number at every operator.

**Why VP cannot carry calls itself.**
- Unauthorised telecom service carries a penalty of up to INR 10 lakh.
- A VNO costs about INR 12.5 lakh per service area plus 8% of AGR (secondary [V]), and still needs a parent network.

| Carrier | Role | Rate and pulse | Number | KYC and time | Path |
|---|---|---|---|---|---|
| Plivo | primary | INR 0.38/min, 30 s pulse [O rate card] | INR 200/month | 10-digit: [U]. 1600: about 7-14 business days via a telemarketer registered in Mumbai or Karnataka (REG-22/23) | Media stream, G.711 μ-law 8 kHz. The lab adapter is ported (`decision.2026-10-19.plivo-mulaw`); L16 is rejected (`rejected.2026-10-19.plivo-l16`). |
| Vobiz | secondary | INR 0.40/min | INR 59 per 30 days | PAN + Aadhaar or PAN + GSTIN (WT bolna 36 [O]) | Plivo-compatible protocol |
| Exotel AgentStream | Bring-your-own for tenants already on Exotel or holding 140/1600 there | INR 0.80-1.00 on 60 s pulses, plus an unpublished stream fee: +0.46 to 0.69/min over Plivo (EXO-37 [I]) | the tenant's | 1-3 business days plus an enablement email | WebSocket 8 kHz PCM with mark/clear, via Pipecat's ExotelFrameSerializer (EXO-12, EXO-V05). Needs written terms that override ToS 6.2. |

**Not used:**
- Twilio for India: INR 4.7-6.6/min and a +1 caller ID.
- ACS: `rejected.2026-10-17.acs-direct-routing`.

**How the tenant connects.**
- The tenant owns the carrier account.
- VP keeps scoped credentials in a KMS-backed vault and shows them once.
- "Managed rails" would make VP the carrier partner of record: numbers still KYC'd in the tenant's name, carrier cost passed through at cost. This happens only if a carrier's partner terms allow it [U]. The question goes into the KC5 quote round.

**Cost seam.**
- On bring-your-own, the carrier bills the tenant directly.
- VP's all-in INR per connected minute adds the carrier's rate-card line, labelled "billed by Plivo to you".
- That line is reconciled against carrier CDRs. economics-platform owns the meter.

### 3.2 India media edge and the run manifest

**Media path.** Media lands at the carrier's Indian edge and streams to VP's gateway in Azure Central India. India server-side clean-turn p50 was 1.0 s. US-East numbers had overstated latency 2-5x (`rejected.2026-10-17.ohio-latency` [M]).

**The telephony leg of every run manifest records:**
- carrier, CLI, series and A2P declaration reference;
- media region, codec and pulse;
- carrier call id and carrier hang-up code;
- whether early media was seen.

**Why.** Calls are filed under what actually ran: req-49, and `rejected.2026-10-20.preset-override-attribution`.

**Test calls never fall back.** See `rejected.2026-10-20.silent-fallback-in-tests`.

### 3.3 The trial line and real-phone tests (req-55)

1. **A browser call needs nothing:** no number, no KYC.
2. **"Test on a real phone."**
   - The person gives a missed call from their phone to VP's trial line.
   - The caller ID is read on the answer webhook, and the call is rejected unanswered, so it costs nothing (`decision.2026-10-19.missed-call-verify`).
3. **A confirm call, because caller ID can be spoofed.** That spoofing risk is the decision's own reversal condition.
   - The first ring is a 10-second confirm call.
   - Press 1 to accept test calls from this workspace.
   - Press 9 to block all VP trial calls to this number.
4. **Friends test too.** The owner shares an invite link, and each friend verifies their own number the same way. This meets req-55 without VP ever ringing a stranger.
5. **Caps [P]:**
   - 5 verified numbers per trial workspace;
   - 20 calls per number per day per workspace, and 30 across all workspaces;
   - 300 s per call;
   - 09:00-21:00 only.

**VP's role on the trial line.**
- VP is the sender for trial calls and declares its trial CLI as A2P.
- Test traffic never shares quota or CLIs with production (`rejected.harvest.14`).

### 3.4 Indian announcements and answering machines

**Classes:**
- switched off;
- not reachable;
- busy message;
- invalid or unallocated;
- caller tune then silence;
- voicemail;
- IVR.

**Method.**
- A streaming lexicon match on announcement text, starting in Hindi and English in v1, with 8 more Indian languages in v2.
- A tone and silence detector alongside it.
- Where the carrier forwards early media, classification happens before answer, which costs no billed seconds. Whether each carrier forwards it is [U].

**Each class writes three things:**
- a reason code;
- the carrier code;
- the billed seconds.

**Target:** a median of 4 s to hang-up (shared with voice) and a p90 of 6 s, with all 5 of 5 classified correctly on T4.

### 3.5 Transfers

**Modes.**
- **Cold:** a straight bridge.
- **Warm:** a one-way spoken brief to the human first.
- **Agentic warm:** a two-way brief in which the human can ask, then the bridge.

**The brief.**
- It follows the human's language preference (Hinglish or English).
- It runs under about 15 s and covers who, why, what is done and what is needed.
- The hand-off card shows the same with play-from-here.

**The caller's side.**
- The agent keeps the caller company, with dead air of 3 s or less.
- If no human answers in 25 s, she offers a callback at a stated time, inside the window and the budget.

**Toll-fraud guard.** Destinations are only verified staff numbers or SIP endpoints in the workspace directory.

**IRDAI pack.** Persuasion, re-quotes and alternatives route to a *named certified* human.

### 3.6 DTMF, display name and failover

**DTMF.**
- Receive is on: confirm, menu and an opt-out key.
- Send is off unless a tool needs it.
- In a PII context the digits are redacted.

**CNAP display name.**
- The Brand step captures the registered trademark or GST trade name. CNAP starts 2026-11-01 on 4G and above (R2R 4.2 [O]).
- The Line keeper files the preferred-name request.
- Whether SIP/PRI 1600 lines show a name is [U]. VP measures it on a test handset and shows the status: requested, shown, or unknown.

**Carrier failover is pre-dial only.**
- Each carrier is probed every minute: API status, answer-seizure ratio, and post-dial delay against a 7-day baseline.
- New attempts move to a secondary carrier **only** through a declared CLI of the same brand, series and display name. Otherwise the campaign pauses with a reason.
- Targets: detect in 2 min or less, notify in 5 min or less.
- There is no carrier switch mid-call. Mid-call behaviour follows the voice failover policy (`open.2026-10-20.product-failover-policy`).
- Bolna's record is the benchmark for doing better: 9 of 18 incidents were upstream Indian telephony, with no carrier failover (BOL-40).

### 3.7 Pulses

- Recommended paths bill 30 s or shorter pulses.
- A 60 s-pulse carrier such as Exotel is allowed as bring-your-own. Its effective INR per connected minute on 30, 45 and 90 s calls is shown before it is connected.
- Pulse matters as much as the rate: Sarvam's INR 3.50 becomes INR 7.40 on a 30 s call (TS-19 [I]).

## 4. The number step

### 4.1 Series router (code; the dial gate refuses any other CLI)

| Category | Sector | Series | Evidence |
|---|---|---|---|
| Promotional (v2) | any | 140xx only; 10:00-21:00 hard | RS-07, RS-15 |
| Service or transactional | RBI, SEBI, IRDAI or PFRDA regulated entity | 1600xx, mandatory even with consent | RS-07, REG-20 |
| Service or transactional | utilities, logistics | 1601xx (migration about 2026-11-08) | L1 claim 10 |
| Service or transactional | everyone else | declared 10-digit | RS-07 |

**The 1600-optional fallback for small BFSI.** TRAI wrote that small BFSI players "may be exempted" from mandatory 1600, but no direction has been found (R15). If an exemption arrives, VP offers a declared 10-digit fallback for them. It carries a spam-flag and A2P-charge exposure warning, because declared 10-digit numbers get neither of the protections 1600 gets (RS-09).

### 4.2 Flow (the Line keeper does it; the Owner approves)

1. **Two questions:** "What calls will you make?" and "What is your business?"
   - VP proposes the series and cites the rule.
   - Example: "IRDAI entities call from 1600 for service calls, even with consent."
2. **One card, before any credential:**
   - the documents needed;
   - the expected time;
   - the monthly rent;
   - INR per minute and the pulse;
   - the carrier options.

   Unknowns say so. Example: "1600 per-minute price is not published anywhere (REG-24); quote requested." This is the Bolna KYC list plus the Sarvam side-by-side layout, plus the series that 0 of 6 dashboards show.
3. **Rent in your name, or connect your carrier.** This is an A2P approval (spend or policy) by the Owner.
4. **A KYC timer runs.** Example: "Day 2 of about 7-14 business days."
   - Browser and trial-line tests continue meanwhile.
   - Production waits.
5. **A test call to a member's phone.** The result card shows:
   - the CLI the carrier presented and the series detected;
   - media round trip in ms;
   - codec and pulse.
6. **The display-name (CNAP) request is filed.**
7. **The A2P declaration pack is drafted.**
   - Compliance reviews it, the tenant submits it to the operator, and uploads the reference.
   - The line's status becomes "declared".
8. **The line goes live.**
   - Health watch starts.
   - A new 10-digit line ramps: 100 unique recipients on day 1, doubling daily to a ceiling of 800 [P].

### 4.3 The A2P declaration pack (must exist before 2026-11-17)

**Why it is needed.**
- Every AI call is A2P. TRAI rejected every carve-out.
- Senders must pre-declare A2P use and CLI ranges on DLT. Plan for 2026-11-17; the strict reading is 11-18, and the Gazette date is unconfirmed (RS-08, R2R 1.1 [O]).
- An undeclared call is unsolicited commercial communication (UCC).

**The pack holds:**
- legal entity and PE/DLT id;
- CLIs and ranges with their series;
- "A2P: AI voice = yes";
- the category per CLI;
- daily and peak volumes;
- operator and carrier;
- sector registration;
- who prepared it and who reviewed it.

**Formats:** CSV, PDF and JSON.

**Status per CLI:** not started, pack ready, submitted, confirmed, lapsed.

**The gate.**
- Before the due date: an amber launch warning.
- From the due date on: the dial gate refuses any undeclared CLI.

**Open:** the operator-side format (`risk.2026-10-20.regulation-segment-a2p-declaration`). The Line keeper confirms it with Plivo, Vobiz and Exotel.

### 4.4 Line health against TRAI reg 21A

**What operators flag.**
- Their AI flags short-call, many-recipient, low-incoming CLIs.
- 5 flagged CLIs in 10 days leads to KYC re-verification, then a 15-day bar, then a year's disconnection (L1 claim 11 [O]).
- 140, 1600 and 1601 cannot be AI-flagged (RS-09). So pacing matters mostly for declared 10-digit lines. Every series is still watched for opt-out and complaint spikes.

**Daily signals per CLI:**
- unique recipients;
- the share of connected calls under 10 s;
- the inbound:outbound ratio;
- answer rate by hour;
- opt-outs per 1,000 connects;
- complaint tags;
- "Suspected UCC" notices the tenant forwards. The ingest path is [U].

**Actions.**
- **Amber** (short calls above 40%, inbound:outbound below 1:50, or opt-outs above 15 per 1,000 [P]): the line's new-recipient pacing slows.
- **Red** (any Suspected UCC notice or carrier block code): the Line keeper pauses the line (A3, with undo), and every campaign using it waits.

**The pool rule.**
- A caller-ID pool may hold only declared CLIs of one brand, one series and one display name.
- Each person is sticky to one CLI.
- Rotating lines to evade a flag is refused. That is the opposite of SquadStack's "spam number rotation".

Operator thresholds are unpublished [U]. VP's thresholds are proposed and calibrated on carrier feedback.

## 5. The compliance core (M1-M7)

**M1: call category and the in-call fence.**
- The Compliance guard proposes the category (service, transactional or promotional) from the goal, the brief and the offering facts.
- The campaign manager confirms it. Moving to a looser category needs the Compliance role.
- Why the fence: one promotional line makes a call promotional (RS-02), and no offer may ride a service message (RS-04).
- compile() therefore drops offer, discount and cross-sell facts from service briefs, with a visible note.
- The reply door blocks any offer line that still appears and regenerates the turn (RD7).
- If the caller asks about offers, the agent does not pitch. She routes to a human. In v2, after counsel, she logs an inquiry with the caller's exact words.
- Each campaign carries a tenant attestation: "these are my customers; this call is about what they hold."

**M2: series routing, the A2P pack and line health** (§4).

**M3: windows in the contact's local time.**

| Rule | Value | Grade |
|---|---|---|
| Promotional | 10:00-21:00; no role can widen it | O (RS-15) |
| Service default | Mon-Sat 10:00-19:00 (campaigns preset) | P |
| Transactional default | all days 09:00-21:00 | P |
| Workspace outer band | 08:00-21:00; Compliance can set it within the absolute bounds | P |
| Quiet hours for individuals | 22:00-07:00: no outbound attempt on any path, category or role | P (a humane rule) |
| RBI lending pack | 08:00-19:00 hard, applied now, required from 2027-01-01 | O (RS-36) |
| The person's own request | narrows the window or moves the slot. It can reach 07:00-08:00 or 21:00-22:00 for service calls only, never quiet hours. Inside RBI's band for lenders. | O/P |
| Start cutoff | window end minus the campaign's p90 connected duration (8 min until measured) | P |
| Holidays | national list off by default; state holidays only from a State column, never guessed from the number series | P |

**M4: suppression on every path.**
- **Sources:**
  - in-call phrases (a Hinglish and English lexicon plus a classifier, for example "dobara call mat karna", "mera number hata do", "band karo ye calls");
  - a CSV column;
  - a WhatsApp or SMS STOP;
  - the verify page;
  - an operator DND-blocked result;
  - a Compliance entry.
- **Scopes:** voice tenant-wide, all channels, or this campaign only.
- **"Not interested" is not "don't call me".** "Not interested" ends this campaign for the person. "Don't call me again" suppresses voice tenant-wide.
- **The write.** The Supervisor or Memory keeper writes the suppression at once (A3), in the same transaction as the memory opt-out.
- **She confirms in one light line** and closes warmly. She never argues.
- **Suppression holds.**
  - It is never cleared by an import.
  - It is released only by the Compliance role with evidence, and the release is audited.
  - Tombstones stop erased people coming back.
- **Attempt ceilings:**
  - per-person presets from the campaigns module;
  - a workspace ceiling of 3 attempts per number per day across all campaigns and the API, with a 120 min gap.
- **NCPR.** NCPR scrubbing is never marketed, because on 140 the operator scrubs (RS-11). An operator DND-blocked result shows as a reason and suppresses that person for promotional calls.

**M5: consent ledger (wave 2).**
- **Append-only records:** purpose; basis (contract, inquiry for 7 days, application for 3 months, or explicit); evidence; expiry.
- **Checked inside the claim write** against the original time.
- **Exportable inside the operator's 3-business-day verification clock** (RS-12/13).
- This is what makes 140xx promotional campaigns possible for consented leads.

**M6: DPDP, recording, retention and residency.**
- **Spoken recording notice.** One short clause in the second turn, taken from data.
  - It is mandatory while recording in the IRDAI and RBI packs.
  - Elsewhere, Compliance may move it to the post-call notice (a policy change that needs approval).
  - "Record mat karo" stops recording for the rest of the call (RD10).
- **Post-call notice.** An SMS on the tenant's DLT header with a service-category template that VP drafts, so it cannot be blacklisted for the wrong category from about 2026-12-17 (RS-06). WhatsApp utility is used only with opt-in.
  - It carries the brand, why we called, and a link to the verify page.
  - The verify page lets the person stop calls, see their data, and learn how the recording is used.
  - It is required when the basis is consent (Rule 3). It is on by default for s.7(a) calls too (RS-28).
- **Retention** is chosen at onboarding and never indefinite.
  - Recordings: 90, 180, 365 or 3,650 days.
  - Audit log: at least 1 year (Rule 6), 3 years by default.
  - Sector minimums: IRDAI intermediary call records 10 years in India; RBI recovery recordings 6 months.
- **Residency.**
  - Storage is in India.
  - Processing location is shown per component.
  - An India-only processing mode exists for BFSI.

**M7: sector packs.**
- **IRDAI.**
  - 1600.
  - The call shape is "inform, confirm, hand off".
  - Solicitation fence RD8 routes persuasion and re-quotes to a named certified human.
  - Records stay in India for 10 years, and the recording notice is spoken.
  - Counsel: KC8.
- **RBI lending.**
  - 08:00-19:00.
  - Per-borrower logs of call times and counts.
  - Two-way recordings kept 6 months, with notice.
  - The grievance officer's details in every dues message.
  - Harsh-practice fence RD9.
  - Collections in default wait for counsel.
- **SEBI and PFRDA:** 1600.
- **Utilities and logistics:** 1601.

## 6. The dial gate: the order of checks inside the claim write

| # | Check | Reason code |
|---|---|---|
| G1 | Workspace active; production requires a verified brand | workspace_not_verified |
| G2 | Valid E.164 number. +91 only by default; premium-rate, short-code and international numbers are blocked | identifier_invalid / destination_blocked |
| G3 | Tombstone: hashed identifier of an erased person | erased |
| G4 | Suppression: tenant voice, campaign, or the trial-line block | suppressed:<source> |
| G5 | Basis for the category: a relationship receipt for service; consent in date for promotional | no_basis / consent_expired / dnd_blocked_by_operator |
| G6 | Window, intersected with policy and the person's request, minus quiet hours and holidays, before the start cutoff | out_of_window:next_eligible_at |
| G7 | Per-person and per-number budgets, with the minimum gap | budget_exhausted |
| G8 | CLI series allowed; A2P declared; KYC active; line not paused | cli_wrong_series / cli_undeclared / cli_paused / kyc_lapsed |
| G9 | Wallet and caps for workspace, campaign and API key, reserved before I/O (HV law 24) | cap_reached / wallet_low |
| G10 | Version published; lint passed for this category; sector pack active | version_not_publishable / pack_missing |
| G11 | Optional tenant predial hook, 800 ms, fails closed (Vapi's semantics) | predial_veto / predial_timeout |
| G12 | Concurrency | deferred_concurrency |

**How the gate holds.**
- Every check fails closed. A check that cannot run returns `check_unavailable` and raises an issue.
- Carrier CDRs are reconciled daily against the gate log. Any CDR without a gate pass is a sev-1 incident. The carrier's record, not VP's own log, grades VP's honesty.

## 7. The reply door: safety predicates on every word

**RD1 Disclosure ledger.**
- The first breath carries the brand name, one AI clause from data and something useful, for example the clause "[Brand] ki AI assistant".
- Playback marks check that the caller heard it.
- It is never repeated unless the caller asks.
- If the caller talks over it, she offers it once more at the next natural turn.
- This meets req-47 ("disclose once, lightly, never as an opener that makes people hang up"): one clause, not a sentence about AI. It is also prefixed if the IT Rules 2026 audio duty applies (RS-35 [V]).

**RD2 Denial block.**
- Any outgoing text that denies being an AI, or claims to be a human or a staff member, is blocked.
- An honest answer from data replaces it.
- The question "aap AI ho?" always gets the honest answer.

**RD3 Crisis.**
- A caller-side detector suspends the goal.
- She gives Tele-MANAS 14416 and 112, offers a human and alerts the Supervisor.
- She never ends a crisis call first.
- Further agenda attempts to that person wait for human review.

**RD4 No OTP, PIN, CVV, card, UPI PIN, password or full Aadhaar asks.**
- If the caller starts reading such digits, she stops them kindly.
- Redaction masks the span.

**RD5 No payment on the call.** Only a link on the brand's verified domain or app, or an autopay option, sent after the call.

**RD6 Anti-scam framing.** No refund, bonus or fund-value framing, no "lapsed, pay to revive", and no deadline threats. Fake renewal and revival calls that use real policy data are a documented pattern: the Navi Mumbai raid found 32 telecallers and at least INR 14.08 lakh lost; Delhi police found data sold at INR 5 a record (R2R 4.1 [O]).

**RD7 Promotion fence** on service and transactional calls.

**RD8 Solicitation fence** in the IRDAI pack.

**RD9 Harsh-practice fence** in the RBI pack and on any dues call.

**RD10 Recording refusal.**

**RD11 Identity before account details** (shared with voice).

**compile() lint (trust rules), checked on every creation path:**
- **T-L1** refuses text that tells the agent to claim to be human, hide being an AI, or deny it (task T9c).
- **T-L2** drops offer facts from service briefs.
- **T-L3** drops facts whose purpose tag does not match the category.
- **T-L4** refuses payment links outside the brand's verified domains.
- **T-L5** warns when office ambience is switched on; it is off by default. Sarvam's "Quiet office" ambience is on by default.

These sit alongside voice lint L7.

## 8. Security and governance

**Roles: fixed on every plan, including trial.**
- **OW (Owner):** money, numbers, deletion, policy.
- **BU (Builder):** agents, data, keys with developer scope.
- **OP (Operator):** campaigns and launches inside budget.
- **CO (Compliance):** policy, consent, suppression release, retention, DPDP requests, audit.
- **VI (Viewer):** read-only, with PII scrubbed.

**Approvals follow the workspace risk classes.**
- External and spend actions need a one-tap approval card.
- Policy and destructive actions need CO or OW plus re-authentication.

**Audit log.**
- **What it records:** every write, approval, export, key use, policy change and PII reveal.
- **Who did it:** a person, or a named VP agent plus the approval card it acted under. Example: "Line keeper, under Meena's approval #A-112".
- **Integrity:** append-only and hash-chained, reconciled nightly against the database change stream at 100%.
- **Export:** CSV or JSON.

**API keys.**
- **Scopes:** read, draft, test, calls.external, campaigns.launch, spend, admin.
- **Expiry:** 90 days by default, 365 at most.
- **Spend cap:** INR 5,000 a day by default [P].
- **Other controls:** an optional IP allowlist, keys shown once, `vp_live_` and `vp_test_` prefixes for secret scanning, and a 24 h overlap when rotating.
- **Test keys** reach only the trial line and verified numbers.

**Widget keys: closed by default.**
- A key does nothing until an origin is allowlisted.
- Browser only, never the phone network.
- 5 sessions per IP per hour, and 10 minutes per session.

**PII redaction: on by default.**
- **What is redacted:**
  - Aadhaar (with a Verhoeff check, including spoken digit groups);
  - PAN;
  - bank account numbers (with context words);
  - card numbers (Luhn check);
  - CVV, OTP and UPI PIN contexts.
- **Where:** transcripts, summaries, analytics, logs, analysis inputs, and webhooks that lack the pii.read scope. Recording audio spans follow in v2.
- **Exemptions by provenance:** helplines and the tenant's published numbers.

**Residency and telemetry.**
- All personal data is stored in India.
- A per-call **data passport** shows where each component ran.
- Product analytics are India-hosted, with inputs masked and no replay of call content.

**Tenant-isolation leak battery.**
- Synthetic tenants are seeded with canaries in every object type.
- At least 10,000 probes per release go through REST, MCP, the Operator chat (including injection attempts), exports, webhooks, search, analytics and memory-brief compile.
- The pass bar is 0 hits. It is a release gate.
- Enforcement: tenant_id on every row, Postgres row-level security, and per-tenant envelope keys for recordings.

**Know-your-business before production.**
- **Checks:** GSTIN; legal name; display trade name; regulator registration checked against public registers where enumerable (about 2,500 IRDAI intermediaries); published helpline; payment-link domains.
- **Holds:** a regulated brand with no matching registration, or payment framing in a brief, triggers a review.
- **Why:** this is anti-scam for VP itself. A self-serve voice platform is exactly what a fake renewal call centre would want.

## 9. Liability and counsel

**Roles.**
- **The tenant** is the TCCCPR Sender (def (bf)), the DPDP Data Fiduciary and the regulated entity.
- **VP** is a processor (s.8(2)) and software.

**Product artefacts:**
- a processor agreement (DPA) generated at onboarding;
- a sub-processor list generated from what actually ran. SquadStack's list omits several providers (SQS-24/52).
- per-campaign attestations;
- the audit trail.

**VP's terms forbid:**
- managed recovery calling;
- bought or cold lists (`rejected.2026-10-20.regulation-segment-cold-outbound-lead`);
- operating VP as a telemarketer (`rejected.2026-10-17.managed-telemarketer`).

**Counsel, in priority order:**
1. KC8: is a neutral renewal reminder solicitation?
2. Is bring-your-own-carrier software a Sender under (bf)(iii)?
3. Is a recovery agency involved in pre-due calls?
4. Does the IT Rules audio duty apply to VP, and does first-breath placement satisfy it?
5. Is a feedback or NPS call commercial?
6. May inference run outside India while records stay in India?
7. Does the A2P declaration apply on 1600?
8. Is an inquiry made during a service call valid consent?
9. May an IMF use AI software at all?

## 10. VP's agents versus what the client sees and approves

| Action | VP agent | Autonomy | Client sees | Approves |
|---|---|---|---|---|
| Recommend series and carrier | Line keeper | A1 | the number-step card | OW taps Start |
| Rent a number or submit KYC | Line keeper | A2 | docs, time and INR | OW |
| Connect bring-your-own carrier, then a test call | Line keeper | A1 | guided form and result card | OW or BU |
| Draft the A2P pack | Line keeper and Compliance guard | A1 | pack and countdown | CO marks it submitted |
| Pause a flagged line | Line keeper | A3 | notice with undo | OP resumes after the fix |
| Classify the campaign category | Compliance guard | A1 | category and reasons | OP confirms; CO for a looser category |
| Opt-out goes to suppression | Supervisor or Memory keeper | A3 | Today feed | release by CO only |
| Crisis | Supervisor | A3 alert | live alert | a human takes over |
| Window, retention or residency policy | Compliance guard drafts | A2 policy | before/after diff | CO or OW plus re-auth |
| DPDP erasure | Memory keeper | A3 if the person asked; else A2 | queue and receipt | CO |
| Keys and roles | none | A2 policy | key or role card | OW (BU for keys) |
| Lint or predicate block | engines | always | the safety event | cannot be overridden |

**In chat it reads like this:**

> **Client:** "Mera 1600 abhi tak nahi aaya, campaign kaise chalega?"
>
> **VP:** "IRDAI wale service calls 1600 se hi ho sakte hain, isliye production 1600 aane tak ruki rahegi (day 4 of about 7-14). Tab tak browser aur verified phones par tests chalte rahenge. A2P pack bhi ready hai, review karein?"

## 11. Key flows

**A. In-call opt-out.**
1. The caller says "dobara call mat karna".
2. The detector fires and she confirms lightly.
3. Suppression is written in the same transaction, before the call ends.
4. The gate blocks every later path, including another campaign, an API call or a retry (the T9b scenario).
5. Today shows it with play-from-here.

**B. Crisis.**
1. A crisis cue fires.
2. RD3 takes over: goal suspended, 14416 and 112 given, a human offered.
3. The Supervisor alert must be acknowledged within 30 s, and a human can take over.
4. The person's agenda calls are held for review.

**C. Launch gate.**
- The campaign launch card has a "Trust checks" row: category reasons, series, declaration, window, held rows with reasons, and the fence and disclosure self-test.
- Every red item links to its fix.

**D. DPDP request.**
1. The request comes from the verify page or a call.
2. It is executed across stores, with tombstones.
3. A receipt is read back.
4. The audit log records it.

## 12. Beyond everyone

1. **"Why this call was allowed"** on every call, and "why it was blocked" on every attempt, with values for each gate check.
2. **The A2P declaration pack** with a countdown, and a gate on undeclared CLIs (0 of 8 vendors).
3. **A promotion fence in the reply door**, plus purpose-bound facts in compile().
4. **A category-first series router.** No campaign can dial from the wrong series.
5. **Non-removable disclosure** with a denial blocker, and a T9c lint on every creation path.
6. **One face per contact.** A sticky declared CLI plus the display name, the opposite of spam rotation. When a contact name is saved in the callee's phone it takes precedence on screen (R2R 4.2).
7. **Callback verify.**
   - The person can call back the brand's published number, or the CLI where inbound works, and the same brand's agent confirms the call from the attempt log.
   - If there was no such call, she says so: "humne aapko call nahi kiya".
   - The verify page sits on the tenant's domain via CNAME.
   - It also raises the line's incoming:outgoing ratio, one of the reg 21A health signals.
8. **Know-your-business** cross-checked against regulator registers, shown on the verify page.
9. **Line health against reg 21A signals**, with ramp, pacing and pause.
10. **An Indian-announcement AMD lexicon**, with billed seconds shown.
11. **A tamper-evident audit log** where VP's agents are named actors under the approvals they acted on.
12. **A tenant-isolation leak battery** as a release gate.
13. **A visible safety-events inbox:** blocked denials, fence hits, OTP refusals, crisis alerts.
14. **A compliance calendar inside Today**, dated to this workspace.
15. **A per-call data passport.**
16. **A global trial-line block:** press 9 once, never rung again.

## 13. Emotional voice, memory, personalisation and self-learning here

**Voice.** The predicates decide *what* may be said; the voice module decides *how*.
- Each trust event carries a tone note from data. Crisis: slow, soft, unhurried. Opt-out: gracious, brief. OTP refusal: protective, warm ("please, OTP kisi ko mat bataiye, humein bhi nahi").
- No stage direction is ever spoken.
- Disclosure is delivered in the warm register, inside the greeting, never as a separate announcement.
- Competence is the warmth (spine P4). Clean refusals and a fast human hand-off build trust more than charm does.

**Memory.**
- Suppression, consent and recording refusal live in typed ledgers, never in model memory (`rejected.2026-10-20.raw-fact-memory`).
- Window and language preferences narrow the gate.
- Facts carry a purpose tag, so a fact captured for service never enters a promotional brief (T-L3).
- Forgetting follows the person everywhere, with tombstones.

**Personalisation.**
- One face per contact, the brand display name, the person's own window, and a verify page in the brand's look.

**Self-learning.**
- Pickup by line, hour and series feeds pacing (v2).
- Opt-out, complaint and "is this a scam?" utterance rates are guardrails that auto-stop any experiment (Learner, A3).
- The Coach may never propose edits to locked sections: disclosure presence, crisis, opt-out, fence, recording notice. This is SquadStack's Lift pattern, enforced in code.
- Disclosure *wording and placement* may be tested. Its *presence* may not (spine Phase 0: at most a 5-point hang-up cost).

## 14. Metrics

All metrics are listed in the metrics field. The core ones:
- 0 rings to suppressed, out-of-window or tombstoned contacts, graded on carrier CDRs;
- 0 promotional lines on service calls;
- 0 AI denials;
- disclosure heard on 99.5% or more of calls;
- 100% of CLIs declared;
- first Indian ring in 15 min or less;
- 0 isolation leaks;
- redaction recall of 99% or more.

## 15. Phasing

**Phase 0: gates.**
- KC5 quotes by about 2026-10-30.
- Counsel by about 2026-11-13.
- A2P export by 2026-11-16.
- T9a/b/c and W1 on VP's own stack.
- The listener-panel disclosure test.
- A green leak battery.

**v1.**
- Plivo bring-your-own, Vobiz, and Exotel bring-your-own under written terms.
- The trial line.
- The number step for 10-digit, 1600 and 1601.
- The A2P pack and health v1.
- M1, M3, M4, M6, and M7 IRDAI plus RBI-lite.
- RD1-RD11 and the T-L lints.
- Roles, audit, keys, widgets and redaction.
- AMD in Hindi and English.
- Transfers, DTMF and the display name.

**v2.**
- M5 and 140xx after counsel.
- The full RBI pack from 2027-01-01.
- The callee rights portal before DPDP core duties (about 2027-05-13).
- Carrier failover.
- A CNAME verify page and callback verify.
- Purpose-bound memory.
- SSO.
- Audio redaction.
- Regional AMD.
- Learned pacing.

**v3.**
- A self-hosted India-only processing option (the LIC-type step).
- Consent-manager interoperability.
- CRF upload, if TRAI opens it.
- SIEM streaming.
- Managed rails, if carriers allow it.
- Multi-entity groups.

## 16. Risks, rejected ideas avoided, open questions

**Risks** are listed in the risks field. The largest:
- KC5: no 1600 streaming;
- VP read as a Sender;
- predicate false positives hurting results;
- the A2P format being unknown;
- spoofed verification;
- abuse by scammers.

**Rejected ideas avoided:**
- `rejected.harvest.03`, `.04`, `.05`, `.07`, `.08`, `.12`, `.14` and `.16`;
- `rejected.2026-10-17.acs-direct-routing`, `.managed-telemarketer`, `.cross-tenant-pooling`, `.harvest-trai-ai-rule` (VP never claims a "TRAI AI rule") and `.parity-undercut`;
- `rejected.2026-10-19.plivo-l16`;
- `rejected.2026-10-20.silent-fallback-in-tests`, `.preset-override-attribution`, `.unguarded-hangup`, `.raw-fact-memory`, `.regulation-segment-cold-outbound-lead` and `.free-key-rotation` (its analogue here: no line rotation to dodge flags).

**Also refused:** a VP-wide cross-tenant do-not-call list. It would pool one fiduciary's data into another's.

## 17. Seams with other modules

- **campaigns** owns retries and pacing; this module owns the gate, the ceilings and the window bounds. The campaigns cross-midnight service setting is bounded by quiet hours for individuals.
- **voice** owns delivery and lint L7 and crisis rule R5; this module owns the predicate set.
- **memory-omni** writes opt-outs into Suppression in the same transaction.
- **economics-platform** owns the meter, caps and the API; this module owns key security.
- **intelligence** shows the trust trace.
- **workspace** renders the cards.
