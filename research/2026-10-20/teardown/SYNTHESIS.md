---

# Competitor teardown synthesis: account-free phase (2026-10-20)

**Scope.** This is the synthesis lane of wf_560edf6c-5d6. It read every output of the account-free phase:
- 8 deep vendors: Bolna (the blind lane plus its code check), Sarvam, Vapi, Retell, ElevenLabs Agents, Synthflow, SquadStack and Exotel. For each it read claims.json, report.md and the verifier output: verify.md for Sarvam, ElevenLabs, Synthflow and Exotel; verification blocks in claims.json for Vapi and Retell; verification.json for SquadStack.
- The Bolna calibration. It lives in `bolna/calibration.json`, because calibration.md was never written (inbox open.2026-10-20.bolna-check-md-not-written).
- The regulation-segment and radar lanes.
- For cross-reference only: the API-key ("authorized-surface") phase synthesis, research/2026-10-20/account-phase/SYNTHESIS.md. I use it wherever it settles or contradicts a public-phase claim.

This lane made no network calls.

**Grades:** o = observed, i = inferred, v = vendor-claimed, u = unknown.

**Id prefixes:**
- Lane claims: BOL, BI/BC, SAR, VAP, RET, EL, SYN, SQS, EXO, RS (regulation), RAD (radar).
- API-key phase: ACB, AP, RAP, AP-EL, SAC, XS.
- 2026-10-17 ledger rows: REG, CMP, ECO, RAW.
- This synthesis: TS-nn (synthesis/claims.json), predictions TP-nnn (synthesis/predictions-consolidated.json), hypotheses W1-W10 (synthesis/where-we-win.json).

**Base.** 662 lane claims: 478 observed, 105 inferred, 64 vendor-claimed, 15 unknown. This lane adds 25 synthesis claims: 16 observed, 8 inferred, 1 unknown.

## 0. The short version

1. **Method (TS-01..05).**
   - **Accuracy.** Blind inference on Bolna was 0.90 correct (lenient) and 0.75 (strict), with 0 wrong.
   - **Recall is weak.** It missed 16 material features, and timing constants cannot be read from outside the product.
   - **Verifiers.** On the closed vendors, adversarial verifiers kept 89% of 309 re-checked claims in substance, but only 57% verbatim.
   - **Rule.** Trust observed claims, weight inferred claims by evidence class (§1.3), and treat these as unknown: server-side framework identity, analogue-based margins and timing.
2. **Decision 1: post-sale first** (TS-06..09).
   - **Lead jobs:** due-date reminders (renewal, pre-due EMI/payment, service appointments), then onboarding and application follow-up.
   - **Pre-sale** comes only as consented inbound-lead follow-up, inside the 7-day window, in a second wave. No cold outbound.
   - **Confidence:** high on the regulatory asymmetry; medium on the job choice until the 10-15 buyer interviews.
   - **Beachhead-v2** becomes the first vertical preset, not the product boundary.
3. **Decision 2: the floor is long and well defined** (TS-10..12; kano.csv).
   - 21 must-be items, plus AI disclosure as a VP rule.
   - 10 of the must-be items are present at all 8 vendors.
   - The India-specific must-be items are thinly covered: suppression on every path (2/8), recurring windows (2/8), an Indian CLI path (4/8), INR+GST billing (3/8), India residency (2/8).
   - Chat-driven setup ships at 5 of 8 vendors, so it is parity, not a wedge.
4. **Decision 3: 10 hypotheses** (W1-W10), each with a task, a pass bar and a kill bar.
   - Strongest on the desk evidence: compliance by default and CSV hygiene (W1, W2), failure explainability (W6), and time to the first Indian-CLI ring (W7) against the global platforms.
   - W3 (reply gap) and W4 (Hinglish turn-taking) are unproven for VP itself: our own stacks still cut in on 15-42% of turns.
   - Price is not a wedge (TS-20).
5. **Architecture** (TS-17, TS-18).
   - Only 4 of 8 vendors run the call path in India by default: Bolna, Sarvam, SquadStack and Exotel.
   - Retell, Vapi, Synthflow and default ElevenLabs are US-anchored.
   - No single framework dominates.
6. **Economics** (TS-19, TS-20).
   - The cheapest Indian list is Sarvam at INR 3.4-3.9 on whole-minute calls, but 4.4-7.4 on 30-90 s calls.
   - The global platforms cost INR 8-37 per Indian minute.
   - Every incumbent whose cost can be reconstructed keeps enough margin to follow a price cut.
7. **Account phase** (§7).
   - 7 vendors: Gupshup replaces Synthflow; SquadStack is covered by interviews.
   - Tasks T0-T9, run twice per vendor.
   - A 50-row messy CSV, with a fail-closed renderer that stops the test list ringing strangers (TS-13, TS-14).
   - The l4b battery, answered on our Plivo number.
   - Owner decisions are listed in §7.2.
8. **Predictions** (§8).
   - 125 are pre-registered: 105 open, 1 already hit, 6 partly supported by API reads, 9 with weakened premises, 2 not scoreable as written.

## 1. Method calibration

### 1.1 Bolna: blind inference scored against its code

The code checked is bolna-ai/bolna at commit bc59921. The source is `bolna/calibration.json` (TS-01..03).

**Hit rates**

| Set | n | Correct | Partly | Wrong | Hit rate | Brier |
|---|---|---|---|---|---|---|
| Pre-registered, lenient | 20 | 16 | 4 | 0 | 0.90 | 0.089 |
| Pre-registered, strict (detail errors count as partly) | 20 | 10 | 10 | 0 | 0.75 | 0.066 |
| Contamination-free only, lenient / strict | 18 | 15 / 9 | 3 / 9 | 0 | 0.917 / 0.75 | 0.096 / 0.071 |
| Second independent rater (acct-bolna) | 20 | 14 | 6 | 0 | 0.85 | 0.086 |

- **Rater agreement:** 18/20 against the lenient verdicts (kappa 0.74), 14/20 against the strict ones (kappa 0.40).
- **Interval:** the correct-only rate is 16/20 = 0.80, with a Wilson 95% interval of about 0.58-0.92.
- **Calibration:** mean stated confidence was 0.69. Under lenient scoring the pass was under-confident. Under strict scoring it was about calibrated in the 0.70-0.85 bins (stated 0.72, observed 0.73, n=11).

**By evidence class**

| Primary evidence | n | Lenient | Strict |
|---|---|---|---|
| Docs | 14 | 0.96 | 0.79 |
| JS bundle | 5 | 0.70 | 0.60 |
| Network / DNS | 1 | 1.00 | 1.00 |

- **Structure claims** (5/5) and **absence claims** (4/4) held.
- **Mechanisms read from bundle config flags** got only 1 of 4 fully right:
  - ambient_noise has no mixing code;
  - use_fillers only adds a prompt note, and its audio path is dead code;
  - synthesizer.caching is a per-call cache.

**Recall (TS-03).** The code shows 16 material features the blind pass never inferred.
- 5 were extraction misses: they were in docs the lane had already downloaded. They were speech-to-speech mode, the speculative LLM call on EagerEndOfTurn, the web-search tool, end_call-tool hangup and multi-agent routing.
- 10 are code-only. Among them: short finals spoken over the agent are discarded, the language switch is decided by a judge (Claude Haiku via LiteLLM), and there is a self-hosted nemotron-asr-hi.
- OSS defaults differ from the hosted dashboard defaults (BC-05). Timing constants have to be measured.

**Correction on file.** The API-key phase synthesis (XS-18) weights inferences by a 0.85 hit rate. That figure is the second rater's. The pre-registered rates are 0.90 (lenient) and 0.75 (strict).

**Caveats.**
- n=20 is small.
- One rater was not blind.
- Bolna's docs are unusually deep (llms-full.txt is 1.9 MB), so docs-led rates will not transfer to thin-doc vendors such as SquadStack and Exotel.

### 1.2 What the verifiers changed on the 7 closed vendors (TS-04, TS-05)

| Lane | Re-checked | Unchanged | Kept grade/substance | Downgraded or refuted in part |
|---|---|---|---|---|
| Sarvam | 52 | 30 | 46 | 2 refuted, 3 down, 1 regraded, 1 split |
| Vapi | 49 | 27 | 45 | 4 down, 1 refuted in part |
| Retell | 41 | 23 | 37 | 4 down, 5 sub-claims refuted |
| ElevenLabs | 37 | 18 | 34 | 2 to unknown, 1 sub-claim refuted |
| Synthflow | 50 | 30 | 46 | 2 down, 2 split |
| SquadStack | 36 | 19 | 28 | 5 refuted in part, 2 down |
| Exotel | 44 | 29 | 39 | 5 down, 3 sub-claims refuted |
| **Total** | **309** | **176 (57%)** | **275 (89%)** | **34 (11%)** |

The downgrades cluster in the same classes the Bolna test flagged:
- **Server-side framework identity read from client artefacts:** SAR-26, RET-22/24 (to RET-22b unknown), EXO-22 (to unknown), SYN-25/26, EL-18 (narrowed) and SQS-23 (observed to inferred). A browser bundle cannot show what runs behind a WebSocket.
- **Margins built on analogue COGS:** EL-33, VAP-36, SAR-39b and RET-36b went to unknown; the SQS-41 frame was refuted.
- **Media anchoring read from signalling DNS:** EL-21 went to unknown.
- **Defaults read from bundle constants:** SQS-21, where a hide-list was misread as the TTS default.

These held: hosting and region from DNS plus cloud IP ranges, transport from our own captures, and bounded negative searches over saved docs. The negatives needed minor count fixes only.

### 1.3 Weights for inferred claims on closed vendors (proposed: decision.2026-10-20.synthesis-inference-weights)

| Class | Weight | Examples in this synthesis |
|---|---|---|
| Hosting and region from DNS plus cloud IP ranges; transport from our own capture; structure and absence from a bounded docs search | about 0.9 (face value) | Retell US-West, Sarvam Azure Central India, Vapi on Daily, SIP regions |
| Mechanism read from docs | about 0.75 | Retell DNC behaviour, Sarvam retry ladder |
| Mechanism read from bundle constants or flags | about 0.5 | SquadStack window, Vapi CSV normaliser (VAP-49 is code, so it stays observed, but its behaviour on the server is untested) |
| Server-side framework; margins on analogues; media anchoring from DNS; any timing constant | treat as unknown | Retell/ElevenLabs/Sarvam/Synthflow/Exotel orchestration; ElevenLabs and Vapi margins |

**Further rules.**
- For thin-doc vendors (SquadStack, Exotel), discount one class further.
- Never treat the absence of an inference as absence of the feature: the Bolna pass missed 16.

**Reverse if** a second open-source calibration target, or the account phase, contradicts more than 20% of a face-value class, or confirms more than 80% of a class treated as unknown.

### 1.4 How to read the tables below

- Cells graded o rest on a page, code line or capture we saved.
- Cells graded i are trustworthy when they come from docs or DNS.
- Every behaviour cell (reply gap, language hold, what a dashboard actually does with a CSV) is unknown until the account phase. That is why the Kano table carries an "account-only" column.

## 2. Decision 1: pre-sale or post-sale first, and which job

### 2.1 Recommendation (proposed: decision.2026-10-20.synthesis-postsale-first, inferred)

**Post-sale first, on one shared post-sale core.**

- **Lead job family 1: due-date reminders.**
  - Renewal reminders before expiry.
  - Pre-due payment/EMI reminders.
  - Service-appointment reminders.
- **Lead job family 2: onboarding and application follow-up.**
  - Welcome and activation calls, documents pending, application incomplete.
  - No KYC data is collected by voice.
- **Fast-follow:** feedback/NPS, once counsel classifies it (RS-05, regulation Q1).
- **Customer-success check-ins:** only after the promotion fence is proven.
- **Second wave:** consented inbound-lead follow-up inside TRAI's 7-day inquiry window, with the consent/inquiry ledger.
- **Not in v1:**
  - cold outbound and win-back;
  - market surveys;
  - collections in default. That is phase 2, with a dated trigger: the RBI rules take effect on 2027-01-01.

**Fit with the owner's framing.** The owner's brief lists pre-sale "selling, market surveys, outreach" and post-sale "feedback, surveys, customer success" (directive.2026-10-20.product-brief). This recommendation orders those jobs; it does not drop them.

### 2.2 Evidence

**The regulatory asymmetry, from primary text** (TS-07; regulation lane RS-03/04/07/10/12/13/15/32, observed).

| | Neutral service call (3rd Amdt (bh)(i)) | Promotional call |
|---|---|---|
| Consent | none explicit; inferred for the contract's life (memo para 39) | explicit; CRF-registered for DND numbers; CRF upload open to 11 pilot banks only |
| DND preference | not blocked once FULLY BLOCK migrates to BLOCK PROMO (about 2026-11-03) | blocked without registered consent |
| Window | no TRAI band (RBI 08:00-19:00 for lender collection from 2027-01-01) | 10:00-21:00 default |
| Series | 1600 for RBI/SEBI/IRDAI/PFRDA entities; 1601 utilities/logistics; declared 10-digit otherwise | 140xx |
| DPDP | s.7(a) covers calling a customer about what she bought | bought lists lose their basis about 2027-05-13 |
| Evidence to keep | none beyond the relationship | inquiry gives 7 days; an application gives 3 months |

This also settles the Bolna open question on the window (open.2026-10-20.bolna-blind-calling-window). The primary text gives 10:00-21:00 for promotional calls and no band for service calls. Bolna's and Exotel's "9-21" is wrong on both counts (RS-15, RS-16).

**Every incumbent leaves this to the buyer** (TS-06; evidence.2026-10-20.synthesis-compliance-left-to-buyer; observed bounded negatives).

| Vendor | Compliance stance | Evidence |
|---|---|---|
| Bolna | Optional whole-hour window, off by default and bypassable. Consent only as proof uploaded after a violation report. No NCPR scrub, though its security page claims one. DLT/PE registration left to the buyer. | BOL-44..48, RS-19/20 |
| Sarvam | Org DND list on every campaign. "Calling compliance is your responsibility." 0 mentions of NCPR, DLT, 140, 1601, A2P or DPDP. Only 10-digit rented numbers. | SAR-44/45 |
| Vapi | Cannot terminate Indian SIP. Retries, attempt budgets and suppression are "owned" by the buyer. US-shaped compliance. | VAP-42..47 |
| Retell | 0 mentions of TRAI, DLT, NCPR or DPDP. DNC off by default and ignored by batch calls. Windows default to LA time. | RET-42..44 |
| ElevenLabs | 0 India compliance pages; the only telemarketing page is TCPA. Batch calls have no window, DNC or consent field. | EL-38..44 |
| Synthflow | 0 India mentions. Opt-out exists only as a post-call judge flag, which failed silently for 2 h 50 m on 2026-08-07. | SYN-60..66 |
| SquadStack | DNC blacklist plus an in-call dnd_request. No 140 or 1600; sells "spam number rotation". A 09:00-23:00 calling pause in code. | SQS-47..49, SQS-71/72 |
| Exotel | 140 with DLT, an NCPR whitelist, claimed NDNC filtering. Windows advisory only on the API path. Says voice needs no DLT, which the primary text contradicts. | EXO-42..46, RS-17 |

- The API-key phase found 0 of 5 vendors with consent, DLT or number-series objects (measure.2026-10-20.acct-synthesis-india-operator-layer).
- No vendor mentions the A2P CLI declaration, due around 2026-11-18 (RS-08, RS-26).

### 2.3 What argues against (recorded, not dismissed)

- **Market size.** 140-series volume was about 11 times 1600-series volume in Q1 FY27 (13.16 bn vs 1.15 bn; RS-46). Post-sale first is a choice for friction and risk, not for size.
- **Compliance does not make buyers switch.** It is 1.3% (6 of 459) of coded Indian complaints (RS-45). It is a must-be that fails suddenly, when numbers are barred at every operator. The wedge has to come from decision 3.
- **Post-sale is contested** (TS-08):
  - Sarvam's deepest post-sale investment is collections: an EMI agent with a full disposition model and a Tata Capital testimonial (SAR-60/62).
  - Funded BFSI specialists sell post-sale: Desible (a "Policy Renewal Agent" and an "Insurance Post-Sales & Onboarding Agent"), Navana (claims 100M+ BFSI minutes) and Gnani (claims 12M+ renewals). None can be trialled (RAD-42/43/49).
  - Bolna is hiring BFSI enterprise sales (BOL-43).
  - SquadStack is strongest in pre-sale BFSI conversion.
- **Rejected again.** This reconfirms rejected.2026-10-17.thin-competition at the job level.

### 2.4 Beachhead-v2

Beachhead-v2 matches on side and job family: a neutral renewal reminder ("inform, confirm, hand off") on the intermediary's own 1600 number, with VP as software. It is, however, the most regulated variant of that family: IRDAI solicitation rules, certified humans for persuasion, the IMF telemarketer ban, and records kept 10 years or more (REG-26/27/29/31).

**Under the self-serve framing, ship one post-sale core with a due-date-reminder template and three presets:**
- insurance renewal (IRDAI pack; the first design partners);
- lending pre-due (RBI window and logs);
- subscriptions and utilities (1601 or declared numbers).

KC8 stays beachhead-v2's main risk.

### 2.5 Reverse if

| | Condition | What changes |
|---|---|---|
| R1 | Interviews show the main self-serve job is inbound-lead follow-up | Move it into v1 with the consent ledger |
| R2 | TRAI opens CRF upload to all senders, or DPDP consent managers ship APIs | Re-rank pre-sale |
| R3 | Counsel rules non-BFSI, non-1601 senders may not make service calls from declared 10-digit numbers | Post-sale first, BFSI only |
| R4 | TRAI adds an AI-specific consent rule or series for service calls | Re-rank |
| R5 | The A2P charge rises toward INR 0.50/min or becomes per-attempt for declared numbers | Re-rank |
| R6 | Counsel holds intermediary renewal reminders are solicitation (KC8) | Drop the insurance preset only |
| R7 | Measured pickup on 1600 or declared CLIs is too low for reminders | Re-rank |
| R8 (new) | The account phase shows a post-sale specialist already passes W1, W2 and W6 by default | Post-sale first still holds, but the plumbing edge disappears and the presets must win on voice quality and economics |

### 2.6 What the account phase adds to decision 1

- Score the regulation lane's predictions REG-P1 to P8 (TP-112..119):
  - promotional start at 09:30 accepted;
  - no category control;
  - no A2P export;
  - upsell line spoken unblocked;
  - opt-out not carried across campaigns;
  - default templates do not disclose;
  - the Exotel and Sarvam DND claims.
- The 10-15 buyer interviews must name Desible, Navana and Gnani (RAD-P6).

## 3. Decision 2: draft v1 parity floor (Kano), across the 8 vendors

**How to read the table.**
- Cells are "coverage:grade". Coverage: Y yes, P partial, N no, ? unknown. Grade: o, i, v or u.
- Columns: Bo Bolna, Sa Sarvam, Va Vapi, Re Retell, EL ElevenLabs, Sy Synthflow, SQ SquadStack, Ex Exotel.
- Evidence ids per row are in `synthesis/kano.csv`.
- The Kano classes are our proposal; the buyer interviews must confirm them.

| Feature | Kano | Bo | Sa | Va | Re | EL | Sy | SQ | Ex | Ships | Account-only |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Test call from the builder | must-be | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | P:o | 7Y/1P | time |
| List/CSV campaign with per-row variables | must-be | Y:o | Y:o | Y:o | Y:o | Y:o | P:o | P:o | Y:o | 6Y/2P | behaviour |
| Recurring calling window with days | must-be | P:o | Y:o | N:o | Y:o | N:o | P:o | P:i | P:o | 2Y/4P | enforcement |
| Retries by outcome | must-be | Y:o | Y:o | N:o | N:o | P:o | N:o | Y:i | Y:o | 4Y/1P | behaviour |
| Inbound: number to agent, caller lookup | must-be | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | P:o | Y:o | 7Y/1P | - |
| Transfer to a human | must-be | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | P:o | P:o | 6Y/2P | warm context |
| Voicemail / IVR detection | must-be | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | P:o | P:o | 6Y/2P | Indian operator announcements |
| DTMF | must-be | Y:o | N:o | Y:o | Y:o | Y:o | P:o | ?:u | Y:o | 5Y/1P | - |
| Knowledge base | must-be | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | 8Y | - |
| HTTP tools in-call | must-be | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | Y:i | Y:o | 8Y | - |
| Post-call judge, typed extraction | must-be | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | 8Y | quality |
| Post-call webhook (full record) | must-be | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | 8Y | delivery; signed at only 3 of the 5 API-tested vendors |
| Call log: recording, transcript, cost, reason | must-be | Y:o | P:o | Y:o | Y:o | Y:o | Y:o | P:o | P:o | 5Y/3P | reason quality |
| Export with extracted fields | must-be | Y:o | P:o | Y:o | P:o | P:o | Y:o | Y:o | P:o | 4Y/4P | contents, time |
| Agent versions and publish | must-be | P:o | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | 7Y/1P | - |
| Indian CLI path | must-be | Y:o | Y:o | N:o | P:o | P:o | N:i | Y:i | Y:o | 4Y/2P | CLI series seen |
| Hindi/Hinglish + major Indic | must-be | Y:o | Y:o | P:o | P:o | Y:o | P:o | Y:v | P:v | 4Y/4P | language hold |
| Suppression/DNC on every outbound path | must-be | N:o | Y:o | N:o | P:o | N:o | N:o | Y:o | P:o | 2Y/2P | cross-campaign |
| INR billing with GST (UPI) | must-be | P:o | Y:o | N:o | N:o | P:v | N:o | Y:o | Y:o | 3Y/2P | checkout |
| Team roles | must-be | P:o | Y:o | P:o | P:o | Y:o | P:o | Y:o | ?:u | 3Y/4P | - |
| India data residency option | must-be (BFSI) | P:o | Y:v | N:o | N:o | P:o | N:o | P:o | Y:o | 2Y/3P | contract |
| AI disclosure as a platform default | VP rule (buyer class unknown) | N:i | N:o | N:i | P:o | N:o | P:o | P:v | N:i | 0Y/3P | default behaviour |
| PSTN reply gap and turn-taking | performance | ?:u | ?:u | ?:u | ?:u | ?:u | ?:u | ?:u | ?:u | - | battery |
| Language hold on code-switched turns | performance | ?:u | ?:u | ?:u | ?:u | ?:u | ?:u | ?:u | ?:u | - | battery |
| All-in price and pulse length | performance | §6 | §6 | §6 | §6 | §6 | §6 | §6 | §6 | - | invoice |
| Simulated-caller tests / evals | performance | P:o | Y:o | Y:o | Y:o | Y:o | Y:o | P:o | P:o | 5Y/3P | - |
| Chat/copilot builder (LLM-native setup) | performance (parity, not a wedge) | Y:o | Y:o | Y:o | Y:o | Y:o | P:o | ?:u | P:o | 5Y/2P | what it writes |
| MCP server / API breadth | performance | Y:o | Y:o | Y:o | Y:o | Y:v | Y:o | N:o | Y:o | 7Y | - |
| Live listen / take over | performance | P:o | ?:u | P:o | Y:o | P:o | Y:o | ?:u | Y:v | 3Y/3P | - |
| A/B traffic split | performance | N:o | N:o | Y:o | Y:o | Y:o | N:o | P:v | Y:o | 4Y/1P | - |
| Analytics / dashboards | performance | P:o | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | Y:o | 7Y/1P | - |
| WhatsApp follow-up, same agent | performance (radar: must-be) | P:o | P:o | ?:u | N:o | Y:o | Y:o | P:i | Y:o | 3Y/3P | - |
| CRM integrations | performance | P:o | ?:u | P:o | Y:o | Y:o | Y:o | Y:o | Y:o | 5Y/2P | - |
| Typed per-call cost on the record | performance | Y:o | N:o | Y:o | Y:o | Y:o | ?:u | ?:u | ?:u | 4Y | invoice match |
| Failure reasons a person can act on | performance | P:o | Y:o | P:o | P:o | P:o | P:o | N:o | P:o | 1Y/6P | task T5 |
| Cross-format dedupe + India-default normalisation + per-row reasons | performance (full form: delighter) | P:o | P:o | N:o | N:o | N:i | N:o | P:i | P:o | 0Y/4P | task T2 |
| Category-aware windows (service/promo/RBI) | delighter | N:o | N:o | N:o | N:o | N:o | N:o | N:i | N:o | 0 | hidden setting? |
| In-call promotion fence | delighter | N:i | N:i | N:i | N:i | N:i | N:i | N:i | N:i | 0 | REG-P4 |
| A2P CLI-range declaration export | delighter; must-be from about 2026-11-18 | N:o | N:o | N:o | N:o | N:o | N:o | N:o | N:o | 0 | REG-P3 |
| 140/1600/1601 provisioning done for the buyer | delighter | P:o | N:o | N:o | N:o | P:i | N:o | N:o | P:v | 0Y/3P | time to a CLI |
| Consent/inquiry ledger with expiry | delighter (pre-sale must-be) | N:o | N:o | N:o | N:o | N:o | N:o | N:o | N:o | 0 | - |
| Cross-call memory (v2) | delighter | N:o | N:o | N:i | Y:o | P:o | Y:o | P:v | N:o | 2Y/2P | recall quality |
| Automatic improvement loop, no human gate (v2) | delighter | N:o | N:o | N:o | N:o | N:o | N:o | N:v | N:o | 0 | - |
| Carrier failover | delighter | N:i | ?:u | ?:u | ?:u | ?:u | ?:u | ?:u | ?:u | 0 | induced failure |
| Business-language outcome owned by the customer | delighter | N:o | P:o | N:o | N:o | N:o | N:o | P:o | P:o | 0Y/3P | - |
| Every dashboard action on API/MCP | delighter | N:o | N:o | N:o | N:o | N:o | ?:u | N:o | ?:u | 0 | - |

**Reading.**
- 10 must-be items are present at all 8 vendors (fully at 6-8 of them). Buyers will not switch without them, and they win nothing (TS-10).
- The India-specific must-be items are where coverage is thin (TS-11). That is VP's room. But see §2.3: buyers rarely name these items as a reason to switch.
- The chat/copilot builder is parity (TS-12). Sarvam's Genie already builds and deploys an agent, places a test call, runs campaigns and diagnoses failed calls (SAR-03).
- Retell has an AI-disclosure preset, but API-created agents do not get it (RET-63, RAP-19). No vendor makes disclosure non-removable.
- SquadStack's naturalness KPI rewards being mistaken for a human (SQS-58/59). Whether disclosure costs hang-ups must be measured in the listener panel and the pilot.

**What only an account can confirm.** The "Account-only" column lists it per row. Docs say what exists; only use shows what it does. The API-key phase found that at 4 of 4 writable vendors the stored config differs from the docs or the dashboard (XS-07/08).

## 4. Decision 3: where we win (hypotheses, not findings)

Full rows, with evidence ids and prediction ids, are in `synthesis/where-we-win.json`.

**Each hypothesis must be measured on VP too.** VP's product does not exist yet. So the account phase can score only the incumbent side; each W closes when VP runs the same task.

| W | Hypothesis | Incumbent failure evidence so far | Task that proves or kills it | Pass bar / kill bar |
|---|---|---|---|---|
| W1 | Compliance by default: suppression on every path, category-aware windows, consent ledger, series routing, A2P export | 8/8 leave it to the buyer (§2.2). Retell batch calls ignore DNC (RET-43). Synthflow's opt-out judge failed silently (SYN-66). Wrong hours published by Bolna and Exotel (RS-16). | T2 messy CSV (rings on N2 must be 0); T3 window battery; T9b opt-out carried to a second campaign | Pass: VP 0 rings on N2 and 0 after opt-out, with incumbents' median at 1 or more. Kill: 2 or more incumbents already score 0 and 0 and refuse a promotional call at 09:30. |
| W2 | CSV hygiene and campaign robustness | Vapi prepends "+" to 10-digit numbers and one empty row rejects the file (VAP-49). Retell turns 10-digit numbers into +1 (RAP-54). No retries at Vapi, Retell or Synthflow. ElevenLabs has one start time. Exotel needs two consoles. Complaint: "batch calling didn't work" (SYN-70). | T2 + T3 | Pass: 48/50 or more rows right in under 5 min. Kill: incumbents' median 45/50 or more in under 5 min. |
| W3 | Lower reply gap on Indian PSTN | Retell is US-West only (RET-25); Vapi us-west-2 (VAP-20). Demos measured: Sarvam p50 3.1 s browser-side (SAR-35), ElevenLabs 3.75 s. Vapi live 3-4 s against 575-1000 ms shown on its dashboard (VAP-52). Bolna's code holds about 1.4 s. | Battery, 30 or more clean turns per vendor | Pass: VP p50 at least 0.3 s below the best incumbent, p90 2.5 s or less, cut-ins 5% or less. Kill: VP not 0.3 s below the best India-hosted vendor. |
| W4 | Hinglish turn-taking that never discards "haan/nahi/ruko/bas" and listens during the opening | Bolna discards short finals spoken over the agent (BC-19) and drops speech during the welcome (ACB-35). Vapi and Bolna ship English lexicons by default (XS-21). ElevenLabs answered "haan" with "Are you still there?" on 4 of 16 turns. Sarvam cut into the elderly pause 2/2 (SAR-53). | Battery short-reply, barge and pause items, plus 4 short Hindi replies spoken over the agent | Pass: VP 90% or more, and stops within 600 ms on barge turns. Kill: VP not above the incumbent median (risk.2026-10-20.acct-synthesis-turn-taking-beat-unproven). |
| W5 | Language hold, numbers and times, against the non-Indian platforms only | Retell: Marathi drift (t/2502), Hindi digits missed (t/2713), no Telugu (t/1645). Synthflow: Hindi only (SYN-65). Vapi replied in Gujarati 17/18 (l4b). The ElevenLabs demo forced English, so that l4b data point is withdrawn (EL-54). | Battery language ID per turn, plus content checks | Pass: VP 95% or more and better than Vapi, Retell, ElevenLabs and Synthflow. Kill: drop W5 if Sarvam or SquadStack is at or above VP (CMP-08). |
| W6 | Find a failed call in under a minute, with a business-language reason, the carrier code and an action | Vapi has 638 engineering codes (VAP-13). Synthflow shows raw Python exceptions (SYN-71). SquadStack gives an outcome label only, searchable for 10 days (SQS-18). Bolna: 9 of 18 incidents were upstream telephony (BOL-40). Exotel admits mislabelled outcomes (EXO-58). MyOperator sells a human "AI Agent Manager" (RAD-15). | T5, five induced failures | Pass: under 60 s each, 5/5 correct, actionable on 4 or more. Kill: incumbents' median under 2 min with 4/5 actionable. |
| W7 | Minutes from sign-up to the first ring on an Indian handset from an Indian CLI | Vapi needs Twilio and a +1 CLI (VAP-42/43). Retell needs Persona KYC and sells US/CA numbers only. Synthflow is review-gated from USD 30k/yr. SquadStack sign-in is allowlisted (SQS-70). Exotel KYC takes 1-3 days. Complaints: Bolna "Booked Demo many times... no response"; Exotel no demo after a week. | T0 | Pass: VP 15 min or less on a BYO or pre-provisioned number, with incumbents' median 45 min or more. Kill: Bolna or Sarvam in 20 min or less. |
| W8 | Fair, transparent billing: per-second or short pulses, one fee line, cost per campaign and contact, a spend cap on the API | Sarvam bills 60 s pulses, so a 30 s call costs INR 7.40/min (SAR-38). Exotel bills 60 s pulses. Retell has a 4k-token multiplier and burst on by default; ElevenLabs has burst on by default. 0 of 5 have a spend cap by API key (XS-28). Billing is 107 of 459 complaints. | T7 invoice audit, 10 calls each at 30, 45 and 90 s | Pass: VP invoice matches its rate card within 1%, and is lowest per effective minute against 5 of 7 incumbents. Kill: interviews do not rank billing in the top 5. |
| W9 | Human support in Indian business hours (an operating promise, not product) | Retell active support runs 21:30-09:30 IST (RET-48). Vapi has no SLA below Core (VAP-56). ElevenLabs routes support to an AI. Synthflow's low reviews are 19/21 about support; Bolna's Trustpilot is 4/4 one-star. Support is the top code (114 of 459). | T8 ticket filed at 11:00 IST | Pass: incumbents' median over 24 h against VP under 2 h. Kill: incumbents' median under 4 h. |
| W10 | The stored config is what runs, and every dashboard action is on API/MCP, so chat runs a campaign end to end | 4/4 writable vendors drift from their docs; 3/4 silently drop unknown fields (XS-07/08). No vendor has full API parity (XS-16). Synthflow silently ignores a GPT model value (SYN-09). | T1 by API and by copilot: read back, call, compare. Then T2-T6 by chat only. | Pass: 0 silent drops and T2-T6 done by chat. Kill: an incumbent copilot (Sarvam Genie is closest) does T2-T6 without the dashboard. |

**Not wedges.**
- **Price.** Sarvam lists at 2.3-3.0 times its own API cost (SAR-40). This is consistent with rejected.2026-10-17.parity-undercut.
- **Chat setup.** It is parity (§3).
- **Voice quality against ElevenLabs.** It owns ASR, TTS, a turn model and speech-to-speech.
- **Language hold against Sarvam or SquadStack.**

**Who is moving into VP's lane (timing risk).**
- ElevenLabs has an unreleased lead-level outbound-campaigns product in its dashboard bundle (16 paths, 18 operations: leads, suppressLead, retry queue; EL-06..08, corrected counts).
- SquadStack has a self-serve builder and a second brand, Osno, both gated today (SQS-04, SQS-68/70).
- Gupshup launched self-serve with Knowlarity numbers on 2026-09-04 (RAD-01/02).
- Tata/TTBS sells Commotion with outcome pricing (RAD-41).
- Changelog pace over 6 months:

| Vendor | Pace |
|---|---|
| ElevenLabs | 195 agent items |
| Vapi | 82 items |
| Bolna | 72 entries |
| Synthflow | 67 entries |
| Sarvam | 58 entries (23 Voice Agents since 08-13) |
| Retell | 80 SDK releases, 4 launch posts |
| Exotel | 17 engineering posts; changelog stale since February |
| SquadStack | no changelog |

**v2 notes (recorded only).**
- **Cross-call memory, live:** Retell (a 2,000-character brief per phone number, saving off by default) and Synthflow (memory groups across voice, SMS and WhatsApp).
- **Cross-call memory, gated:** ElevenLabs (built, but 403 for our workspace: EL-P12 hit).
- **Cross-call memory, claimed only:** SquadStack (the code shows only intra-call memory, SQS-74).
- **No cross-call memory:** Bolna, Sarvam, Vapi, Exotel.
- **Learning loops are human-gated everywhere:** Retell Conductor, ElevenLabs Architect with branches and merge proposals, SquadStack Lift (claimed), Vapi monitors and manual splits, Sarvam Genie suggestions, Exotel's evaluator (in testing).
- **Marketing runs ahead of the docs on memory or learning** at Retell, Synthflow, Exotel and SquadStack (ledger CMP-01). Sarvam's earlier "contradiction" was withdrawn (SAR-58).

## 5. Architecture (graded; synthesis/architecture.csv)

| Vendor | Orchestration | Browser media | Telephony | STT | TTS | LLM | Region |
|---|---|---|---|---|---|---|---|
| Bolna | Own Python asyncio [o code] | SIP.js 0.21 over WSS to FreeSWITCH, mod_audio_stream fork [o] | Vobiz default; Plivo, Twilio, Exotel, SIP (Asterisk legacy, FreeSWITCH new) [o] | Deepgram nova-3 hi default [o]; own nemotron-asr-hi option [o code] | ElevenLabs Turbo v2.5 "Tripti" [o] | Azure gpt-4.1-mini default, direct client; LiteLLM for the long tail [o code] | AWS ap-south-1 + us-east-1 ws [o]; docs say US default [contradiction] |
| Sarvam | Server framework unknown; no LiveKit/Daily room [i] | One JSON WebSocket, headerless 16 kHz PCM [o] | 7 BYO providers + rented 10-digit numbers [o] | Saaras v4 self-hosted [v] | Bulbul v3/v4 [o], self-hosted [v] | sarvam-105b + open-weight mix [v]; members unknown [u] | Runtime Azure Central India, API AWS Mumbai [o]; dashboard replay to PostHog US [o] |
| Vapi | Own pipeline [v blog]; no Pipecat/LiveKit in client [i] | Daily, mediasoup SFU on OCI Ashburn [o capture] | Own SBCs AWS us-west-2/eu-central-1; no Indian termination [o] | 11 providers [o] | 15 providers [o] | 18 providers; routed Azure OpenAI [v] | us-west-2 default, EU (Premier), AUS; no India [o] |
| Retell | Own queues/workers [v]; framework unknown [u] | Own WHIP gateway since SDK 3.0; legacy LiveKit Cloud [o] | US/CA numbers; BYO SIP; some SIP media on LiveKit Inc. blocks [o] | Azure, Deepgram, Soniox, AssemblyAI, Muse [o] | ElevenLabs, Cartesia, MiniMax, Fish, OpenAI, Inworld, Platform [o] | 32 + gpt-realtime [o] | US-West only [o] |
| ElevenLabs | First-party; not separable from LiveKit Agents from outside [u] | Self-hosted LiveKit on GCP [o]; WebSocket [o] | Import Twilio, Exotel (since 06-01), SIP; sells no numbers [o] | Scribe Realtime [o] | Eleven v4 Turbo; turn_v3 [o] | gemini-2.5-flash default [o], via Vertex [i] | Anycast front door; default SIP us-central1; India residency SIP asia-south1 (Enterprise) [o]; media anchoring [u] |
| Synthflow | Probably Python; framework unknown [i] | Janus, TURN relay forced [o]; WebSocket media [o] | Own SBCs, probably Kamailio/RTPEngine/FreeSWITCH [i]; US/CA/AU numbers [o] | Deepgram, Soniox, Synthflow STT [o] | ElevenLabs Flash default; Aura-2; Synthflow TTS [o] | OpenAI + Synthflow LLM (base unknown) [o/u] | GCP us-east1, europe-west3, LATAM; no India [o] |
| SquadStack | Pipecat [i from client SDK] | Daily via pipecat daily-transport [o SDK] | Exotel, Ozonetel, Plivo [o trust centre] | Arth V2 in-house [v]; arc_stt router [o] | ElevenLabs Flash v2.5 default constant; Cartesia, Sarvam [o] | OpenAI, SimpliSmart, Bedrock, OpenRouter [o editor] | AWS ap-south-1 [o]; US subprocessors [o] |
| Exotel | Unknown [u] | AgentStream WebSocket, 8 kHz PCM [o docs]; console SIP.js 0.20.0 [o] | Own carrier interconnects [o]; 140 + DIDs [o]; 1600 via VNO [v] | Deepgram or ElevenLabs certified [v] | Smallest or ElevenLabs "Avni" [v] | Gemma certified [v] | AWS ap-south-1 for CPaaS/voicebot [o]; contact centre on Oracle Mumbai [o] |

**Reading (TS-17, TS-18).**
- The four vendors that keep the call path in India by default (Bolna, Sarvam, SquadStack, Exotel) are the ones W3 must beat.
- The US-anchored four lose about one India-US round trip per turn before any model work. That is an inference. The penalty is measured only in the battery.
- Browser media stacks are all different:
  - FreeSWITCH (Bolna);
  - a JSON WebSocket (Sarvam);
  - Daily (Vapi, SquadStack);
  - its own gateway (Retell);
  - self-hosted LiveKit (ElevenLabs);
  - Janus (Synthflow).
- **For VP's own choice:** transport is not where anyone differentiates. The PSTN edge and turn policy are.

## 6. Economics: list price against reconstructed COGS (synthesis/economics.csv)

All figures are at FX 95, ex GST. All-in prices are computed from rate cards, not invoices.

| Vendor | List price | All-in INR per connected Indian minute | Reconstructed COGS | Implied margin | Grades |
|---|---|---|---|---|---|
| Bolna | USD 0.06 PAYG to ~0.04 (AWS annual); 30 s pulses | 6.1-8.0 PAYG (platform-fee ambiguity); 4.2-6.6 on volume plans | INR 2.0-3.8 default stack (an upper bound: own ASR/LLM options exist, BC-08) | 46-72% PAYG; 18-58% AWS annual | o / i / i |
| Sarvam | INR 3.50-3.00; 60 s agent pulses + INR 0.20 per 30 s telephony | 3.4-3.9 whole-minute; 4.40-7.40 for 30-90 s calls | INR 1.16-1.33 at its own API list (lab 1.39-1.51); self-host cost unknown | list = 2.3-3.0x own API cost | o / i / i, u |
| Vapi | USD 0.05 hosting + pass-through + BYO telephony | 12.5-17.0 via Twilio (INR 9.46 before any AI) | not observable | unknown (VAP-36) | o / i / u |
| Retell | USD 0.055 infra + TTS + LLM; 4k-token multiplier; burst | 8.3-13.6 BYO trunk; 16.7-20.0 if a 6k prompt scales the whole call; 22-37 on Retell numbers | infra 0.055 against ASR 0.006-0.009 plus assumed compute | infra 72-86% (i); calculator default unknown | o / i / i, u |
| ElevenLabs | USD 0.08 all plans; burst 0.16; LLM separate | 8.17-8.92 via Exotel/Plivo; 15.8-16.5 burst; 12.5-15.0 via Twilio | platform fee 3.3-3.9x its own ASR+TTS API list | unknown (EL-33; 82-97% was an analogue) | o / i / u |
| Synthflow | Enterprise from USD 30k/yr | 15.2-25.6 estimate + floor (INR 47.5 at 5k min/month if the floor is a commitment) | INR 3.2-8.1 (infra line is a placeholder) | 39-69% | o / i / i |
| SquadStack | "typically INR 2-5/min" incl. telephony + setup fee per use case; BFSI success fees | 2-5 (vendor statement) | INR 1.95-3.58 on ElevenLabs Flash v2.5; 1.6 with Sarvam TTS; 1.1 self-hosted TTS | -15 to -36% at INR 2; 23-34% at INR 3.5 | v / v / i |
| Exotel | Plans published; VoiceBot/AgentStream per-minute unpublished; PSTN INR 0.80-1.00, 60 s pulses | unknown (quote-gated) | VoiceBot INR 1.42 / 1.95 / 3.60 (lo/mid/hi) | 44-72% mid case | o, v / u / i |
| Caller.digital (radar) | INR 10.15 published, itemised | 10.15 | AI layers INR 3.02 | support + platform fee about half the price | o |
| VP | target about INR 2 | - | re-price after the default stack (open.2026-10-20.reprice-tiers) | - | - |

**Reading (TS-19, TS-20).**
- **Short calls.** Pulse length matters as much as the rate card for Indian reminder calls, which are mostly under 90 s. Sarvam's INR 3.50 becomes INR 7.40 on a 30 s call.
- **The global platforms are 2-7 times the Indian band** on any realistic Indian path.
- **Margins.** Every vendor with a reconstructable cost keeps a margin that lets it follow a cut. SquadStack is the exception: at INR 2 it needs Sarvam or its own TTS.
- **VP on Exotel AgentStream** would pay INR 0.46-0.69/min more than on Plivo (EXO-37, corrected). Keep Plivo primary (risk.2026-10-20.exotel-rails-dependence, inbox).

## 7. Account-phase test plan (proposed: decision.2026-10-20.synthesis-account-phase-coverage; open.2026-10-20.synthesis-account-phase-plan)

### 7.1 Vendors, access status and setup (input for the Instinct prompt)

Access status is from evidence.2026-10-20.trial-accounts-report plus the lanes.

| Vendor | Status | What setup must do | Blockers to expect |
|---|---|---|---|
| Bolna | Account ready (USD 5); trial calls only to verified numbers | Verify our call-receiving numbers. If verification is an SMS OTP, a Plivo voice number cannot receive it: use the owner handset for verification and record the method. Opt out of training where offered. Compliance application (CIN Pvt Ltd + GST) and Vobiz KYC only if we buy an Indian DID. | 2 concurrent calls on trial (BOL P01) |
| Sarvam | team@ credits exhausted (-36.58); owner's personal account has 88.90 | Top up the team@ org (Razorpay, INR). Create a Voice Agents workspace API key (Settings > API Key). Connect BYO Plivo, or rent a number after PAN/Aadhaar KYC. | KYC 1 business day or more (SAR-P02) |
| ElevenLabs | Free account ready (10k credits); free-tier terms are non-commercial (owner override applies) | For the PSTN battery, either import a Twilio number (+1 CLI) or connect Exotel (needs the Exotel Voicebot applet, so Exotel KYC first). Check whether batch calling and the hidden campaigns UI are on the plan. | Exotel route 1 business day or more (EL-P01) |
| Retell | Account ready (USD 10); TOTP at every login | A named person passes Persona ID: one person verifies only one account, and the owner chooses who. Add a payment method (Indian card/UPI acceptance unknown). Retell US number to India, or a BYO SIP trunk (partners suggest Vobiz). | KYC, international CLI |
| Vapi | Account ready (USD 5); email code at every login | A Twilio account with India geo-permission and card is needed to ring an Indian number. Without it, Vapi gets the web-call battery only. | second vendor; +1 CLI (VAP-P02) |
| Exotel | Account exists (150 credits), unverified | Company KYC: COI or GST, business PAN, signatory ID, authorisation letter; 1-3 business days. Add our numbers and the owner handset as verified co-workers. Confirm the INDIA region (fixed at sign-up). Email hello@exotel.com to enable the Stream/Voicebot applet, and ask for prices, 1600/140 support and their position on ToS 6.2. | KYC; ToS 6.2 also bears on Exotel as a future carrier (decision.2026-10-20.teardown-lines) |
| Gupshup Voice AI (replaces Synthflow) | Not created | Self-serve sign-up with team@vyakti.ai (100 free minutes, vendor-claimed). Record Knowlarity number provisioning and the DLT/140/160 steps. | unknown |
| Synthflow | Sales-only | One sign-up attempt with team@ to time the review gate (SYN-P01). No sales conversation unless the owner approves. | review gate, USD 30k floor |
| SquadStack | Sign-in allowlisted to its own domains (SQS-70) | None. A hard stop under "no bypassing authentication". Covered by buyer interviews, or by an owner-approved sales contact under VP's real identity. | - |

**Rules for whoever sets up accounts:**
- Use team@vyakti.ai.
- Credentials go only into a mode-600 scratchpad env file, never into chat (risk.2026-10-20.teardown-creds-pasted).
- Set a spend cap at each vendor before any call.
- Opt out of training on our data where offered.
- Synthetic data only; calls only to our own numbers; low load.
- Log every TOTP or email-code login the dashboard tasks will need, because Vapi and Retell ask at each login.

**Who runs the tasks matters.** An agent such as Instinct running the dashboard tasks measures an agent's path, not a human buyer's. Usability claims still need the 5-user sessions in the brief.

### 7.2 Owner decisions needed before the phase starts

1. **Spend caps per vendor.** Suggested: about INR 2,000 each. Estimate: about 80 connected minutes per vendor, or about INR 300-1,400 at the §6 rates. Seven vendors come to roughly INR 4,000-9,000, plus number rentals, plus Twilio for Vapi.
2. **Plivo.** The INR 80 monthly usage cap is binding. About 560 inbound minutes at about INR 0.40/min is about INR 225. Raise the cap or recharge (risk.2026-10-20.trial-expiries), and confirm the trial accepts inbound calls from +1 CLIs.
3. **Two more owned numbers.** These are N2 (the opt-out number) and N3 (a second customer), preferably Delhi 11-series (§7.4); about INR 236/month each at the Bengaluru rate. Optional N4: a SIM registered BLOCK PROMO via 1909, for the DND rows.
4. **A Twilio leg for Vapi,** or accept web-call-only results for Vapi.
5. **Exotel KYC documents,** and a named person for Retell's Persona KYC.
6. **The India VM and its Plivo line for the battery.** The voice lab is paused (decision.2026-10-20.pause-lab), so the owner must allow this use. The battery needs a small "caller mode" on the existing PlivoLine: play persona turns instead of running an agent.
7. **Render two new personas** before the run, with the l4b TTS pipeline. P5 is busy and skeptical ("abhi time nahi", "ye scam to nahi?"); P6 is angry or confused. The brief asks for these, and the l4b battery has only P1-P4.

### 7.3 Fixed task list

Each task runs twice per vendor; run 2 measures learnability. Every run is screen-recorded. Each task is scored on success, minutes, clicks and errors.

| Task | What | Measured | Predictions scored |
|---|---|---|---|
| T0 | Sign-up to the first ring on our Plivo number | Minutes and clicks from the first sign-up page to Plivo's inbound webhook timestamp. Blockers (KYC, card, enablement email). CLI series seen in the webhook From field (+1, 10-digit, 140, 1600, 1601). | P01/P02 of each vendor |
| T1 | Build the standard agent "Asha" (l4b agent-spec.md), by the fastest path (copilot if present) and once by API | Minutes and clicks. Defaults written: language, voice, disclosure, turn settings. Exported or read-back JSON. Read back an API-created agent and diff it against what was sent (W10). | SAR-P03, RET-P03, VAP-P03, EL-P02, SYN-P03, EXO-P03, Bolna P03 |
| T2 | Messy 50-row CSV (§7.4) | Per-row outcome against messy-50.spec.json (score /50). Rings on N2 (must be 0). Normalised values, reason text, dedupe. Minutes to a clean upload, including header renames. Whether one bad row rejects the file. | P04 of each vendor |
| T3 | Calling windows | (a) Service campaign, 3 days, 10:00-19:00 IST recurring. (b) Promotional start at 09:30 and end at 21:30 IST. (c) A window crossing midnight. Each scored refused / warned / accepted silently / bypassable. | P05s, REG-P1/P2 |
| T4 | Voicemail and transfer | Our Plivo side plays 5 synthetic Indian operator announcements: switched off (Hindi and English), not reachable, busy message, caller tune then silence. Score classification and seconds to hang-up. Cold and warm transfer to N3: success, and what context the human side hears. | P06s |
| T5 | Find a failed call and its reason | Five induced failures: invalid row, our number rejects as busy, answer then hang up at 3 s, broken tool URL, out-of-window schedule. Seconds to find each; reason correct (0/1); actionability (0-2: 0 = engineering code only, 1 = names the cause, 2 = names the cause and what to do). | P07s, W6 |
| T6 | Export | One file per campaign with number, outcome, extracted fields, transcript, recording link and cost: completeness out of 6, and minutes. | P08s |
| T7 | Billing audit | 10 calls each of 30, 45 and 90 s. Debits and invoice lines compared with the rate card; effective INR per connected minute. | SAR-P13, VAP-P10, RET-P11, EL-P10, EXO-P14, RAD-P1 |
| T8 | Support | One real setup question filed at 11:00 IST on a weekday: hours to the first human reply. | Bolna P13, EXO-P13 |
| T9 | Regulation probes | (a) An upsell line injected into the service script: spoken or blocked (REG-P4). (b) Mid-call "mujhe dobara call mat karna", then a second campaign that includes the same number: any ring is a miss (REG-P5). (c) Default template with a neutral prompt, asked "aap AI ho?", plus a prompt telling the agent to claim to be human: accepted or refused (REG-P6, RET-P12, EL-P09, SAR-P14, EXO-P12). | REG-P4..P6 |

**Why T9c is separate.** The Asha prompt instructs AI disclosure. So the battery's robot turns measure prompt-following, not the platform default (TS-24).

### 7.4 The 50-row messy synthetic CSV

**Files.** Template: synthesis/messy-50.template.csv. Per-row expected VP behaviour: messy-50.spec.json. Renderer: code/messy_csv.py.

**No real people.** Names, policies and amounts are fictional. Every phone cell is one of:
- our own numbers N1-N4, read at render time from a mode-600 env file, never written to the repo;
- a reserved fictional number (+1 202 555 0123; +44 20 7946 0000);
- a string that cannot reach anyone.

**File-level traps:**
- a UTF-8 BOM and CRLF line endings;
- a "Phone Number" header with spaces and capitals;
- an unnamed empty column, and an empty Email column;
- a trailing blank line;
- mixed date and amount formats.

**Row groups:**

| Group | Rows | Content |
|---|---|---|
| A | R01-R08 | N1, customer Sunita, in 8 forms: E.164, exact duplicate, 10-digit, 0-prefixed, 91-prefixed, spaced, bracketed, Excel apostrophe. Devanagari, Latin and caps names; an emoji; a missing premium; "24.5k"; one different customer on the same family phone (a judgement row). |
| B | R09-R12 | N2, the opt-out number: an explicit opt-out, the same person without the flag, a conflicting "no" flag, and a two-number cell "N1 / N2". Any ring on N2 is a failure. |
| C | R13-R16 | N3, Tamil-English: Tamil script, free-text language, an impossible date 31/02/2026, an extension suffix, a comma inside a quoted name, and a promotional row with no consent evidence (should be held). |
| D | R17-R18 | N4, the BLOCK PROMO SIM: a service row (dial) and a promotional row (hold). Rendered invalid if there is no N4. |
| E | R19-R32 | 14 structurally invalid phone cells, each needing a per-row reason. |
| F | R33-R38 | Broken row structure: empty, extra field, truncated, whitespace, repeated header, notes only. |
| H | R39-R50 | 12 rows of unroutable CRM junk ("+91 80 1234", "#N/A", "NULL", "1800", ...). |

**Perfect VP outcome:**
- N1 dialled once (R07 is a judgement row), N3 once, N4 once (service only);
- N2 rung 0 times;
- R16 and R18 held;
- 10 duplicates flagged;
- every invalid row rejected with a reason.

**Safety, and why it matters (TS-13, TS-14; risk.2026-10-20.synthesis-test-list-dials-strangers).**
- Vapi's dashboard prepends "+" to a 10-digit number. Retell's import prepends +1. A 10-digit test row can therefore ring a real stranger abroad.
- The renderer expands each phone cell under every known normaliser: naive "+", US +1, India +91, the 0 and 00 prefixes, and scientific notation. It fails closed unless every candidate is ours, reserved, or impossible.
- **Use Delhi 11-series numbers for N1-N3.** "11XXXXXXXX" under "+" or "+1" lands in NANP area code 1XX, which can never be assigned, so all 50 rows pass.
- With today's Bengaluru (80-series) lab number, R03, R08 and R12 are withheld. This was checked on fictional scratch numbers. Their behaviour stays scored from code (VAP-49, RAP-54).
- **Run order:** render, then upload paused or in draft where the vendor allows it, then screenshot the validation, then launch with concurrency 1.

### 7.5 Caller battery adapted to receiving the vendors' outbound calls

**Setup.**
- Each vendor's "Asha" agent calls N1 (our Plivo number).
- Plivo answers with the existing bidirectional mu-law 8 kHz stream (component.voicelab.phone, asset.voicelab.plivo-line).
- A battery-caller process on the India VM plays the persona turns.
- **Stereo recording:** one channel is our injected caller audio (exact play timestamps); the other is the agent audio as received.

**Turn driver.**
- **Opener turn:** "haan hello?". Play it at answer + 0.5 s; in an outbound call the callee speaks first.
- **say / short turns:** play after the agent has been silent for 700 ms.
- **barge turns:** play 1.0 s into an agent utterance.
- **pause turns:** the 1.6 s mid-utterance pause in P4_t03, plus the 2.4 s variant from round 2.
- **silence turns:** play nothing for 5 s.
- **Noise:** P2 runs over the market bed (about 15 dB SNR); P1_t10 has traffic at 5 dB.

**Volume per vendor:**
- P1-P4 (from l4b) and P5-P6 (new), each run twice: about 12 calls and about 130 caller turns. That is 30 or more clean turns for the reply-gap statistic.
- 2 extra default-template calls for T9c.

**Test integrity.**
- No model swaps mid-call. Each result is filed under the stack that actually ran, as logged from the vendor's config or call record (directive.2026-10-20.no-midcall-swap).
- **A failed call is invalidated with its exact reason, never silently retried.**

**What this measures.** The reply gap at our PSTN edge, not at a handset. The difference is the callee's last-mile delay, which is the same for every vendor, so the comparison is fair. It partly closes open.2026-10-20.handset-reply-gap. The handset offset itself stays unmeasured unless the owner records n of 10 or more turns on a real handset.

### 7.6 Metrics and how each is measured

| Metric | Definition | Method |
|---|---|---|
| Reply gap p50/p90 | End of our caller audio to the onset of agent speech | Energy VAD on the agent channel (onset sustained 120 ms or more), checked by hand on a 10% sample; bootstrap 95% CI; 30 or more clean turns |
| First audio after answer | Plivo answer event to the first agent audio | Webhook plus stream timestamps |
| Cut-ins | Agent onset while our caller audio plays (excluding barge turns), and during the 1.6 s and 2.4 s pauses | Overlap on the two channels |
| Barge-in stop latency | Onset of our barge turn to the agent's audio stopping | Agent-channel energy drop |
| Short-reply handling | "haan/hmm/ok/nahi/ruko" handled correctly: continues or stops as meant, never "are you still there" | Transcript code by two raters on disagreement |
| Language hold | Share of agent turns in the caller's language or script | Machine language ID plus a manual read of disagreements |
| Content checks | Numbers, times and corrections repeated correctly | The l4b battery regexes per turn |
| Disclosure | Unprompted disclosure at call start; answers to the robot turn; denials | Transcript, T9c |
| Silence handling | Response to 5 s of silence | Re-prompt / wait / hang up |
| Task success | Callback day and time confirmed, WhatsApp link stated, clean close | Rubric per call |
| T0-T9 scores | §7.3 | Screen recording, Plivo logs, vendor exports |

**Scoring rules.**
- Score every TP-nnn prediction hit, miss or not-testable, with a reason.
- Apply the verifier notes (for example SAR-P02 as two items, SYN-P04 as four sub-items).
- Mark each W1-W10 hypothesis passed or killed on the incumbent side.
- Rerun the same tasks on VP when it exists.

### 7.7 Order

1. **Bolna first.** The code predicts behaviour (the about 1.4 s hold, discarded short replies), so this run also checks the method.
2. **Then Sarvam, ElevenLabs, Retell, Vapi and Gupshup.**
3. **Exotel last,** because KYC takes days.
4. **In parallel:** the 10-15 buyer interviews (Kano classes, W8 and W9 ranks, and RAD-P6).

## 8. Predictions

- **Registry:** 125 pre-registered predictions, consolidated as TP-001..TP-125 in synthesis/predictions-consolidated.json.
- **Wording:** verbatim from each lane, with confidence and scoring rule.
- **predictions.md:** render with consolidate_predictions.py --md.

**Status on 2026-10-20**

| Status | Count | Predictions |
|---|---|---|
| Hit | 1 | EL-P12: memory gated, 403 |
| Partly supported by API reads | 6 | RET-P04, RET-P05, EL-P04, EL-P09, EL-P10, Bolna P09a (supported in mechanism) |
| Premises weakened or contradicted | 9 | Bolna P04c, RET-P03, RET-P12, SQS-P02, SQS-P05, SQS-P07, EXO-P04, EXO-P05, EXO-P06 |
| Not scoreable as written | 2 | RET-P01 sign-up clause; SYN-P04 (split into sub-items) |
| Open | 105 | everything else |

SYN-P05 and the remaining verifier notes are carried in the file.

**Scoring discipline.**
- The pre-registered text is never edited.
- Corrections go into status notes.
- Predictions whose premises were refuted before the run (for example SQS-P05) are still scored as written. Their failure says something about our inputs, not our method.

## 9. What is still unknown, and why

- **Every behavioural claim on an Indian line:** reply gap, cut-ins, language hold, voicemail accuracy, real disclosure behaviour. Neither phase placed a call; the API-key phase deliberately made no billable calls.
- **Real invoices and debits.** No billed call yet, so every all-in figure is a rate-card computation.
- **Server-side orchestration** at Retell, ElevenLabs, Sarvam, Synthflow, SquadStack and Exotel. Client artefacts cannot show it (§1.2). Only a vendor's own disclosure, or an open-source release, would settle it.
- **Margins** at ElevenLabs, Vapi and Sarvam (self-hosted cost). Analogue COGS failed verification; there is no way to observe these from outside.
- **Media streaming on 1600 numbers.** Whether AgentStream, or any CPaaS, streams media to a third-party gateway on 1600 lines is still unconfirmed (REG-25, KC5). Only Exotel's written answer or a provisioned 1600 line can close it.
- **Buyer Kano classes, and whether buyers switch for W1, W2 and W6 at all.** Only the buyer interviews can say.
- **Whether AI disclosure raises hang-ups.** SquadStack's market rewards passing as human; the listener panel and the pilot must measure it.
- **Legal questions for counsel:**
  - whether surveys and feedback calls are commercial communications;
  - whether bring-your-own-carrier software is a TCCCPR Sender;
  - whether RBI 100Y covers pre-due reminders;
  - lapse revival after the contract ends;
  - the IT Rules 2026 audio-disclosure duty.
- **Thin complaint bases.** Platform-buyer complaints are thin for Sarvam (about 7 builder threads) and absent for SquadStack (Capterra 0; G2 and Trustpilot blocked).
- **Blocked sources.** G2, Reddit and Product Hunt returned 403 or 429 across lanes and were not bypassed.
- **Timing of the competitors moving into VP's lane:** when ElevenLabs' campaigns product ships (a scoring horizon of 2027-01-31 is on file, EL-07), and when SquadStack opens self-serve.
- **Vendors torn down only from the radar:** Gupshup, Ringg and Smallest. Desible, Navana and Gnani cannot be trialled at all.
- **Bolna's hosted platform** may lead or lag its open-source code (ACB-57).
- **VP's own numbers on the same battery and task list,** without which no W hypothesis can pass.

## Files (this lane)

- `research/2026-10-20/teardown/synthesis/claims.json` (TS-01..25)
- `kano.csv`, `architecture.csv`, `economics.csv`, `where-we-win.json`
- `predictions-consolidated.json` (TP-001..125)
- `messy-50.template.csv`, `messy-50.spec.json`
- `code/messy_csv.py`, `code/consolidate_predictions.py`, `code/build_tables.py`
- `manifest.csv` (header only: this lane saved no raw artifacts)
- `context/inbox/teardown-synthesis.json`: 13 nodes, 38 edges, 1 event