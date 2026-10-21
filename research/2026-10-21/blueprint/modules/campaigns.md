# Campaigns: how a list becomes calls, and how calls become follow-through

Module id `campaigns`. Proposed for owner review, 2026-10-21 (`directive.2026-10-21.blueprint-end-to-end`). Grades: [M] measured by us, [C] computed, [O] observed, [V] vendor-claimed, [I] inferred, [U] unknown, [P] a product default we set and will tune on measured campaigns. Build-ready defaults (state machine, ladders, budgets, windows, reason codes, the messy-50 expected result): `data/blueprint/campaigns-module-defaults.json`. Paths are under /home/user/sales-enabler. Phone numbers never appear here; examples write [phone].

## 0. The decisions on one screen

1. **Category first.** Service, transactional or promotional is the first question. It sets the window ceiling, the number series, the consent rule per row, the follow-up template category and the in-call promotion fence: one choice, enforced at the dial gate, the reply door and the template.
2. **One campaign object, one dial path.** Every attempt (campaign, API, single, test, retry, callback) is claimed through one precheck inside the transaction that claims it. A blocked or deferred attempt names its rule and the next allowed time.
3. **Attempt separate from call.** An attempt is a dial with a precheck result, a carrier and the raw carrier code. A call exists only when someone or something answered.
4. **Never reject a file, never guess a country.** India-default E.164, cross-format and cross-script dedupe, a reason on every row, a failed-rows file to fix and re-upload. A bare number that is not an Indian mobile is rejected, never prefixed with "+" or "+1".
5. **Retries by outcome, budgets per person and per number**, sticky caller ID per person, reserved inbound capacity, a canary start, and resume after an outage with zero double dials. Unknown outcomes are never auto-retried.
6. **Follow-through is part of the campaign**: WhatsApp utility, DLT SMS, callbacks, human hand-off and outcome watches run from one durable outbox.
7. **The client talks; VP's agents prepare; the client taps once.** Launch is one card with a sample rendered from a real row, checks, cost and outcome ranges. A disabled Launch names its blocker and links to the fix.

## 1. Benchmark: who is best at each part, and where each falls short

| Sub-area | Best today | What they do best | Where they fall short |
|---|---|---|---|
| Retry and pacing policy | Sarvam | Retry ladder per outcome (busy, failed, no_answer, short_duration, provider_error, internal_error; max 0-20), 0.1-500 attempts/s, phone rotation, allowed_schedule with days [O SAR-16, research/2026-10-20/teardown/sarvam/claims.json] | Free-form window, no category or consent field; DND only as an API recipe card [O sarvam 33]; rotates 10-digit CLIs [I SAR-47]; carrier field always null [O SAC-19]; a short wallet cancels campaigns and releases numbers [O research/2026-10-20/account-phase/sarvam/report.md]; wizard steps 2-4 never seen [U] |
| Attempt and interaction split | Sarvam | Attempt (30 fields) and 0..1 interaction (31 fields); cohorts with valid/rejected counts and a rejected_records file [O SAR-16] | No duplicate, DND or consent counters [O] |
| Row hygiene | Bolna (workflow campaigns) | Row codes invalid_phone, missing_required_value, duplicate_reference_id, empty_row; corrective re-upload; +91 default; 150,000 rows / 32 MB [O ACB-19/20, research/2026-10-20/account-phase/bolna/report.md s1.7; WT bolna [46]] | Dedupe on reference_id, not phone; two outbound systems (Batches report counts only); Campaigns are Beta and need a published workflow [O bolna 22, 23]; guardrails off on create, whole hours, a wrong 9-21 window [O] |
| CSV contract | ElevenLabs | Contract before upload: phone_number required; prompt, first_message, voice_id, language optional; other columns become variables; 25 MB; a Test call [O EL-05, 33-batch-telephony-form] | One start time and timezone; no window, retries, scrub, dedupe or +91 normalisation [O 35-batch-schedule]; Submit disabled with the reason in a placeholder, no link [O] |
| Windows and concurrency | Retell | Multi-range windows with days of week; "Concurrency allocated to batch calling: 15" (20 minus 5 reserved) [O retell 24, 25] | Default 00:00-23:59 Mon-Sun, no legal-hours note; no retries, no pacing, no agent selector; Send disabled with no reason; batch calls skip do_not_call [O RET-05, RET-43]; batch API is create-only |
| Call type and throttle | Exotel | Transactional vs Promotional call type; retries 0-3 linear or exponential on busy, no-answer, failed; throttle in calls/min; callbacks [O EXO-15] | One absolute send_at/end_at, recurrence unsupported; numbers with spaces or dashes rejected, not normalised; duplicates dropped silently by default [O EXO-15/16]; a bot campaign spans two consoles plus App Bazaar; call type not shown driving a window [WT §2.13] |
| One canvas for bot, human and SMS | SquadStack | Campaign blocks Voice Bot, Lead Router, human Call, IVR, SMS with Sender ID and DLT Entity ID, Email; closing tools incl. dnd_request and schedule_callback [O SQS-03, SQS-72] | Managed and allowlisted, no self-serve; lead-ingestion API only [O SQS-13]; sells "spam number rotation" [O SQS-48]; no builder screen ever seen |
| Veto before dial | Vapi | campaign.predial blocking webhook; error or timeout means no call [O AP-27] | No contact, consent or retry object; one absolute window up to 7 days ahead; its CSV normaliser makes a 10-digit Indian mobile +98..., one bad row rejects the file [O VAP-46, VAP-49]; campaign calls were not retried after its 4 h outage [O VAP-54] |
| Campaign scale | Synthflow | Up to 1,000,000 recipients per campaign [O SYN-05] | Enterprise and API only; cancelled after 7 days; failed recipients not retried; window cannot cross midnight; no holidays or per-recipient timezone [O SYN-05, SYN-63] |

Cross-cutting: 0 of 6 dashboards put consent, DND or DLT on the campaign form [O research/2026-10-21/walkthroughs/SYNTHESIS.md §2.13]; 0 of 8 vendors ship category-aware windows [O research/2026-10-20/teardown/SYNTHESIS.md §2.2]; no walkthrough reached a ring on an Indian line. Every "VP is better" below is a hypothesis until VP passes W1, W2, W6 and W10 on tasks T2, T3, T5 and T9b (research/2026-10-20/teardown/synthesis/where-we-win.json).

## 2. What this module owns, and its seams

- **Owns:** intake from CSV, XLSX, Sheets and API push to an audience; Source, Receipt and RowResult; Campaign and CampaignRun with their state machine; the dial queue, claim and pacing (the Campaign runner engine); Attempt; the retry ladder; caller-ID pool selection; follow-ups, callbacks and the hand-off queue; inbound routing; presets; the launch card and checklist.
- **Consumes:** Contact, Identifier, ConsentRecord, Suppression and CRM connectors (memory-omni); dial-gate rules, numbers, series, A2P state, answering-machine detection and transfer mechanics (trust-telephony owns the rules; this module evaluates them inside its claim); published agent versions (voice); the meter and caps (economics-platform); outcomes (intelligence).
- **Produces:** attempts, follow-ups and the events attempt.*, campaign.*, followup.*, handoff.*, which intelligence turns into the funnel and the call page.

## 3. Objects and defaults

- **Source** (immutable): kind (csv, xlsx, sheet, api, crm), file hash, sheet and tab, uploader, mapping version. **Receipt**: a preview hash bound to apply, so what was reviewed is what lands (Relay's pattern, `lib/data-intake/contracts.ts` IntakeReceipt), counters, failed-rows link. **RowResult**: original cells, normalised values, code, plain reason, fix, contact id.
- **Audience**: a static list (snapshot at launch) or a live query or Sheet (recurring). Member = contact x identifier x row variables x per-row overrides.
- **Campaign** (a versioned policy; a running campaign changes by revision with a diff): goal, preset, **category (first, required)**, sector, outcome definition (preset default), audience, deployment (a published version or split, pinned), caller-ID pool, window policy, schedule and recurrence, retry ladder, attempt budgets, ring timeout 40 s [P; ElevenLabs 60 s, Retell 30 s], pacing, predial (built-in always; customer veto optional), budget cap (required) and estimate, follow-up rules, hand-off targets, auto-resume after outage (on), first-campaign review stop (on for a workspace's first campaign), state.
- **CampaignRun**: one execution; a recurring campaign spawns runs, each with its own estimate and period budget.
- **Attempt**: kind (campaign, api, single, test, retry, callback); contact; identifier; CLI; version; precheck {allowed, blocked or deferred; rules evaluated with their versions; blocking rule; next eligible time}; idempotency token; dial status; carrier and raw code (SIP/Q.850 and the carrier's string); ring time and post-dial delay; answer class (human, voicemail, operator message, IVR); outcome class; call id (0..1); counts_to_budget; next action {type, at, reason}; retry_of.
- **FollowUp**: rule, type, channel, template id and category, operation id, state (confirmed, not executed, unknown), due time.
- **HandOff**: reason, target group, mode (warm transfer or hot callback), SLA, the agent's brief, play-from-here, the human's disposition.
- **InboundRoute**: number to deployment, business hours, after-hours mode, overflow, lookup policy.

## 4. State machines

**Campaign:** draft -> ready (checklist all green, recomputed on every change; back to draft if any item turns red) -> scheduled or running (a person's tap at A2, or an API key with the campaign.launch scope inside its spend cap) <-> paused -> completed -> recurring (when recurrence is on) -> running (next run). Cancelled from any non-terminal state; in-flight calls finish. Running shows a sub-state: dialing, waiting for window ("next window Mon 10:00"), throttled (pacing or CLI cap), draining.

**Pauses carry a cause.** Person pauses and guard pauses for an opt-out spike, a complaint, a flagged number or a canary guardrail never auto-resume. A provider-outage pause resumes on its own only when health has been green for 10 minutes, inside the window, and only because the launch card stated this rule (default on). Low wallet or a spend cap pauses at a call boundary. VP never cancels a campaign or releases numbers for lack of balance (Sarvam does both [O]).

**Attempt:** created -> prechecked -> blocked or deferred, or queued -> dialing -> ringing -> connected, no answer, busy, switched off, not reachable, invalid, carrier-blocked, provider error, or unknown -> classified -> ended -> next action. **Unknown** means the carrier never confirmed a call leg (for example a create-call timeout). A reconciler checks the carrier's record by our token for 15 minutes; if it is still unknown it becomes an issue card and is never auto-retried (HV law 17, `rejected.harvest.05`).

## 5. Intake: from any file to an audience

### 5.1 The flow (chat and page edit the same objects)

1. **Contract before upload,** generated from the preset and the agent's variables rather than a generic list: "Your renewal agent needs name, phone, policy no, due date. Helps: premium, product, language, preferred time. Anything else becomes a variable." A sample CSV with synthetic Hinglish rows.
2. **Drop or connect.**
   - CSV or XLSX up to 200,000 rows or 100 MB in v1 [P]; benchmarks are Bolna 150,000 / 32 MB, Exotel 1,00,000 / 60 MB, ElevenLabs 25 MB, Vapi 10,000 / 5 MB.
   - A Google Sheet, read-only, one sheet; it syncs for recurring campaigns.
   - API push: 1-1,000 rows per request, external_id idempotency, per-row results, unknown fields refused with 422 (P7).
   - CRMs through memory-omni connectors.
   - The first 200 rows preview in 3 s or less [P]; full validation streams with progress and never blocks the page.
3. **Mapping.** Header synonyms first (Mobile, Mob No, Contact No, फ़ोन, मोबाइल, Policy No, Due Dt). A model sees only headers and value shapes for unresolved columns, never personal values. One tap confirms it, and the mapping is remembered per source ("same as last time").
4. **At most three questions, and only ones that change the call,** each with the default the steward would pick: ambiguous dates, amount units, two phone columns, offers inside a service list.
5. **Normalise, dedupe and decide per row** (5.2-5.3). Show counters and a row table that filters by any counter.
6. **Fix loop.** Download the failed rows (original values, code, plain reason, fix, an empty fixed_value column); re-upload merges by row id. Or fix inline, or tell VP ("R27 ka number adhoora hai, skip kar do").
7. **Hear a row.** "Ring my phone as R01" places a test call to the member's verified phone, or the browser, with R01's variables, so the user hears what Sunita will hear. It never dials the row's number; test calls take the same dial path with the test rule (verified member numbers only).

### 5.2 India-default E.164 (deterministic code, never a model)

- Strip spaces, dashes, dots, brackets, quotes and Excel's leading apostrophe; convert Devanagari and other Indic digits.
- +91, 91, 0091 or 0 followed by 10 digits starting 6-9, or a bare 10-digit number starting 6-9: an Indian mobile, written +91.
- 0 + STD code + subscriber with 10 significant digits is a landline; a truncated one is LANDLINE_TRUNCATED.
- An extension is dropped and flagged. Two numbers in one cell are held, never guessed. Scientific notation is rejected: "Excel turned this into 9.1E+11 and lost digits; export the column as text."
- **Stranger guard.** A bare number that is not an Indian mobile is rejected, never given a "+" or "+1". An explicit foreign code is flagged non-Indian and not dialled in an Indian campaign. This answers `risk.2026-10-20.synthesis-test-list-dials-strangers`: Vapi's normaliser turns a 10-digit mobile into +98 [O VAP-49] and Retell's contact import into +1 [O RAP-34].

### 5.3 Dedupe and identity

- **Same person:** same E.164 and the same record key (policy, loan or customer id with hyphens and case removed). With no record key: same E.164 and the same transliteration key (honorifics such as Smt., Shri, ji stripped; case and spacing folded; Devanagari or Tamil to a Latin key).
- **Near matches** are flagged for review, never merged. memory-omni keeps identity to exact matches, and a merge into an existing contact needs A2.
- **Shared numbers:** same E.164 with a different record key means two people on one phone. The dialer rings that number at most once per 120-minute slot and 3 times a day across all campaigns and the API [P]. Even a missed dedupe therefore cannot ring a phone twice in a slot.
- **Conflicts:** opt-out wins; the first complete valid value wins; every conflict is listed. Import can add suppression (A3, at once) and can never remove it (invariant 5).
- **Variables:**
  - a variable the agent requires that is missing holds the row;
  - an optional one that is missing still dials, marked unknown so the reply door never speaks a blank or a template token;
  - impossible dates are never spoken, and emoji are stripped for speech;
  - amounts parse "₹ 24500", "24,500", "24.5k" and "2.45 L".

### 5.4 Counters, codes and overrides

- **Counters on the card:** rows read · ready (new, linked) · normalised · duplicates · suppressed · DND held · consent held · other holds · rejected · skipped.
- **Codes** are in the defaults file: OK_NEW, DUPLICATE_OF_ROW, SHARED_NUMBER, OPTED_OUT_IN_FILE, HELD_PROMO_NO_CONSENT, HELD_PROMO_DND, HELD_MULTI_NUMBER, NSN_STARTS_0, LANDLINE_TRUNCATED, NON_INDIAN, REPEATED_HEADER and the rest.
- **Whole-file refusal** happens only when a file cannot be parsed at all (encrypted, binary), and states why and how to fix it.
- **Per-row overrides:** language, voice (from the agent's approved list), variables, preferred time.
- **Not overridable per row:** prompt, first message, category, disclosure. ElevenLabs allows a per-row prompt and first message [O EL-05]. In VP that would bypass compile(), the recitation lint and the reply door (HV laws 2, 3, 10).

### 5.5 The messy-50 under these rules (T2; research/2026-10-20/teardown/synthesis/messy-50.spec.json)

- **50 rows become 4 people to call on 3 numbers:** Sunita (R01); Rakesh (R07, shared number, a later slot); Karthik (R13); Meena (R17, a service call, which BLOCK PROMO never blocks, RS-10).
- **10 duplicates merged:** R02-R06, R08, R10, R11, R14, R15.
- **1 opted-out person:** R09; R11's "no" loses to the opt-out.
- **3 held:** R12 (two numbers), R16 (promotional with no consent), R18 (promotional to a DND number).
- **26 not dialable:** 24 rejected and 2 non-Indian (R28, R29). **6 broken rows skipped:** R33-R38.
- **One question:** "2 rows offer an upgrade inside a service renewal list; hold them (default) or start a promotional campaign?"
- **Rings on the opt-out number N2: 0.**

The rules are built to score 50/50. The pass bar is 48/50 in under 5 minutes with 0 manual edits, measured on our own numbers (W2).

## 6. Category-first policy

The campaign opens with "Ye call kis baare mein hai?" and three cards:
- **Service:** about something they already have (renewal due, EMI due, appointment, onboarding); no offers.
  - No TRAI band (RS-15).
  - Not DND-blocked from about 2026-11-03 (RS-10).
  - Relationship basis (RS-03/04/12).
- **Transactional:** about a transaction they just made.
- **Promotional:** anything that sells.
  - 140xx only; 10:00-21:00, hard.
  - Explicit consent; CRF-registered consent for DND numbers (RS-13).
  - In v1, promotional rows are held with a reason. Launchable promotional campaigns with the consent ledger come in v2 (`decision.2026-10-20.synthesis-postsale-first`).

**What the category drives:**
- the window ceiling;
- the series the Line keeper allows;
- the consent rule per row;
- the follow-up template category (wrong-category templates are blacklisted from about 2026-12-17/18, RS-06);
- the in-call promotion fence (trust-telephony M1).

One offer line makes a call promotional (RS §1.1). So the Compliance guard reads the brief and flags offer lines in a service brief, and the reply door blocks them during the call.

**Windows** [P unless sourced]:
- **Defaults:** service presets Mon-Sat 10:00-19:00 in the contact's local time; lending pre-due 08:00-19:00 (RBI/2026-27/230 from 2027-01-01, applied now, RS-36); appointments 09:00-20:00 every day; promotional 10:00-21:00, which no role can widen.
- **Control:** multi-range windows and days of the week (Retell's control). The workspace's outer band for service is 08:00-21:00, set by the Compliance role.
- **Holidays:** Republic Day, Independence Day, Gandhi Jayanti and Diwali are off by default, plus a tenant list. State holidays apply only from a State column. They are never inferred from the number series, because MNP keeps the series (research/2026-10-17/lanes/l5-human-dialect/report.md §(c)).
- **Across midnight:** service and transactional only, set by the Compliance role with a reason; caps and holidays count on the start date; refused for promotional.
- **The person's own time** ("kal shaam 7 baje") is honoured inside the outer band and the budget; otherwise she offers the nearest slot.

**T3 pass bar:** promotional at 09:30 or 21:30 is refused at the form, by the API (422 with the rule id) and at the dial gate. Service at 09:30 is allowed when the user sets it. A cross-midnight service window is accepted with a warning; promotional across midnight is refused.

## 7. How hard to try

**Retry ladder, service default [P]:**

| Outcome | Retries | Max | Counts to the person's budget |
|---|---|---|---|
| Busy | +30 min, +2 h | 2 | yes |
| No answer (40 s ring) | +3 h, next day in the other half of the window | 2 | yes |
| Switched off, not reachable | +4 h, next day | 2 | no (own cap of 3) |
| Voicemail or IVR (hang up, no message) | +4 h, next day | 2 | yes |
| Short call (under 10 s, caller ended, nothing captured) | next day, other half | 1 | yes |
| Provider error, confirmed no ring | +2, +10, +30 min | 3 | no |
| Dropped by VP mid-call | one recovery call at +5 min; the opener owns the drop | 1 | yes |
| Call me later; a relative answered | stated time, else nearest slot | 2; 1 | yes |
| Unknown | never automatic | 0 | - |
| Opt-out, wrong party, invalid, operator UCC/DND block | suppress, flag the identifier or raise an issue | 0 | - |

Sarvam's ladder covers six classes [O SAR-16]. VP adds voicemail, call-me-later, wrong party, opt-out, dropped-by-us and unknown. It also separates "rang the person" from "never reached the phone", so a carrier fault never spends a person's patience.

**Budgets [P]:**
- renewal: 2 per person a day, 5 a week, 6 a run;
- lending: 2/6/6, with exportable call-time and count logs;
- subscriptions: 1/3/4; promotional: 1/3/3.
- Workspace ceiling (trust-telephony M4): 3 rings per number a day across all campaigns and the API, at least 120 minutes apart.

**Pacing [P]:**
- **Canary:** the first 20 calls at 3 starts a minute. The run pauses (A3) on 3 opt-outs, early hang-ups above 50%, 5 provider errors or 2 promotion-fence blocks.
- **Steady rate:** min(30, 3 x concurrency) starts a minute (range 1-1,200), jittered over the first 10 minutes of each window (no burst at 10:00:00), and bounded by the carrier's calls per second (Plivo India limit [U]).
- **Reserved inbound:** max(1, 20% of workspace concurrency) whenever an inbound number is bound, shown the way Retell does: "10 of 12 lines for this campaign · 2 held for inbound".
- **First campaign:** a workspace's first campaign stops after 20 calls for a person's review.

**Caller ID:**
- **The pool:** every number matches the category-by-sector series, is A2P-declared, KYC-valid and healthy, and shows the same CNAP name.
- **Sticky per person:** Sunita always sees the same number, so she can recognise it and call back. VP never rotates numbers to dodge flags; SquadStack sells "spam number rotation" [O SQS-48] and Sarvam rotates 10-digit CLIs [I SAR-47].
- **Flags:** a flagged number is paused (A3) and named, never silently replaced.
- **Caps:** declared 10-digit CLIs get 200 dials a day [P], because operators flag on short calls, recipient diversity and a low incoming ratio (research/2026-10-17/lanes/l1-regulation/report.md claim 11). 140, 1600 and 1601 numbers cannot be AI-flagged (research/2026-10-17/lanes/r2-untouched-raw/findings.md §1.3).

**Predial.** The built-in precheck cannot be removed. An optional customer veto webhook (signed, 800 ms) fails closed with PREDIAL_TIMEOUT; above 5% fail-closed in 10 minutes, the campaign pauses. Vapi has the only veto today, and it needs the buyer's own scrub list [O AP-27].

**Budget and estimate:**
- **Formula:** eligible people x expected attempts x P(connect) x minutes x all-in INR per connected minute, plus messages and the A2P line.
- **Priors:** preset priors, labelled "assumption, no history", until 50 calls; then the campaign's own rates with n.
- **Shown as** p10-p90 incl. GST. A cap is required (default p90 rounded up); it stops at a call boundary.
- **Context:** no vendor groups cost by campaign (0 of 5 by API).

**Resume after an outage.** The dial queue is durable (Postgres with leased claims; every queue names its caller, HV law 31).
- On a carrier or model outage the Supervisor pauses the run (A3). Attempts that never rang go back to their slot, and unknown ones are reconciled.
- After 10 minutes of green health inside the window the run resumes, and the run page reports "lost to outage 2 h 14 min; 86 attempts moved; 0 double dials".
- End dates never extend silently; VP offers the extension as a card.
- Benchmarks: Vapi's campaign calls did not run and were not retried in its 4 h outage [O VAP-54]; Bolna had "scheduled calls not placed (India region)" on 2026-10-13 [O BOL-40].

## 8. One dial path

**Entry points:** the campaign runner, API create-call, a single call from a contact page, a test call, a retry and a callback. All of them go through dial.claim(), which runs the precheck in the same database transaction that claims the attempt and increments the budget counters (HV law 18). This avoids `rejected.harvest.07`, where several send paths and enroll-time-only checks let opt-outs through.

**Rules evaluated** (owned and versioned by trust-telephony):
- window and holiday in local time;
- suppression and tombstones;
- consent or basis for the category, and DND for promotional;
- person, run and number budgets and gaps;
- contact already in a call, or called by another campaign today;
- identifier valid and not wrong-party;
- wallet and caps;
- CLI health, series, A2P declaration and KYC;
- agent version published;
- test mode limited to verified member numbers;
- the customer veto.

Each blocked or deferred attempt carries its code, the rule version and the next allowed time, so "Sunita ko call kyun nahi gaya?" has a one-line answer.

**Carrier codes are kept raw,** beside a class and a business reason: switched off, not reachable, number does not exist, busy, barred, UCC or DND block, CLI rejected (DLT mismatch). Sarvam's carrier field is null [O]; Vapi has 638 engineering codes and no business outcome [O VAP-13]. Intelligence turns these into the failed-call finder (W6).

## 9. Follow-through after the call

Every outcome maps to zero or more follow-ups in a durable outbox, with a stable operation id and the states confirmed, not executed or unknown (HV law 17). "After the call" is a table with one line per outcome, and each rule states its contract, as Bolna's nodes do [O bolna 23]:
- **"Renew karunga"** -> a WhatsApp utility template with the renewal link on the client's domain within 2 minutes. It needs a WhatsApp opt-in; otherwise the DLT SMS template is used (entity id, header and template id sit on the rule).
- **A promise to pay by a date** -> an **outcome watch** waits for the payment webhook until the date plus 1 day. Paid closes it; unpaid gets one gentle reminder call inside the budget.
- **"Call me later"** -> a callback at the stated time inside the band and budget, confirmed on the call.
- **A re-quote, a discount or a human** -> hand-off.
  - A warm transfer when someone in the target group is online: she speaks a brief, then bridges.
  - Otherwise a hot-callback task with a 2-hour SLA in business hours, the brief and play-from-here.
  - In the insurance preset this is mandatory for any persuasion (only certified humans solicit, REG-26/27 in research/2026-10-17/SYNTHESIS-v2.md).
- **No contact after the last attempt** -> one DLT SMS giving the reason for the call and the number to call back.
- **Opt-out** -> nothing beyond the DPDP notice link (trust-telephony M6).

SquadStack's canvas mixes bot, human, IVR and SMS with DLT fields [O SQS-03]. VP keeps that on the campaign itself rather than in a separate workflow product; Bolna requires a published workflow before a campaign [O bolna 22].

## 10. Inbound

**Routing and lookup.** Each number maps to an agent version or split, with business hours. Caller lookup is by exact E.164:
- one contact -> her pre-call brief;
- several (a shared phone) -> she confirms who is speaking before any account detail;
- none -> a general agent.

**Callback continuity.** If VP rang this person from this number in the last 7 days, the inbound call continues that campaign's agenda ("Ji, humne kal aapko renewal ke baare mein call kiya tha"). The attempt is marked reached-by-callback and pending retries are cancelled.

**After hours (default):** the same agent answers, and any hand-off becomes a callback in the next business hours, which she says plainly. Alternatives: an after-hours version, forwarding to an on-call phone, or taking a message with an SMS acknowledgement.

**Capacity and abuse:**
- Overflow queues for up to 30 s, then forwards to a human or promises a callback.
- Reserved capacity means outbound never makes an inbound caller hear busy.
- More than 10 calls an hour from one caller ends politely.

Bolna has caller lookup and spam caps [O]; nobody links an inbound call to the campaign that caused it.

## 11. Presets (written as shapes, never lines)

1. **Insurance renewal (IRDAI pack).**
   - Service on a 1600xx number (IRDAI from 2026-02-15, REG-20).
   - Inform, confirm, hand off.
   - A due-date cadence of T-30, T-15, T-7 and T-2 that stops on a renewal-paid webhook.
   - Required columns: name, phone, policy no, due date.
   - A WhatsApp link on the intermediary's or insurer's domain; a recording notice; a 10-year India retention class.
   - Anti-scam: no payment on the call; no "lapsed, pay to revive", "bonus" or "refund" framing; a verifiable callback number (R2R §4.1).
   - Counsel is still open on solicitation (KC8).
2. **Lending pre-due (RBI-ready logs).**
   - Service on 1600xx; 08:00-19:00.
   - States the due date and amount, captures a promise with date and mode, and links to the lender's page.
   - Call-time and count logs per borrower; two-way recordings kept 6 months with notice; the grievance officer named in the SMS.
   - Low warmth, high competence (P4).
   - Default-stage collections wait for counsel and 2027-01-01.
3. **Appointment reminder.** Service on a declared 10-digit number; T-24 h and T-2 h; confirm, reschedule through the booking tool, or cancel; an address link by SMS.
4. **Subscription or utility reminder.** Service; 1601xx for utilities and logistics (about 2026-11-08), declared 10-digit otherwise; a bill or renewal link.

There is deliberately no cold-outbound preset (`rejected.2026-10-20.regulation-segment-cold-outbound-lead`).

## 12. The launch card, and a Launch that explains itself

**The card:**
- **Who:** 1,182 people, with held and suppressed counts as links.
- **What she will say:** a 20-second sample rendered from a real row through the published version, with "AI disclosure: once, after the useful opening" ticked.
- **When:** a 7-day strip of windows with a predicted finish ("about 1,050 reached by Thu 18:00", labelled as an assumption).
- **From:** number, series, CNAP name.
- **Checks.**
- **Money:** INR 4,100-6,300 incl. GST; cap INR 7,000 (illustrative).
- **Outcome:** "renewals confirmed: no history yet; your first 100 calls set the baseline".
- **After the call.**
- **Launch:** hold for 1.2 s. Approval binds to a hash of the exact arguments, goes stale when any input changes, and re-estimates after 2 h (data/blueprint/workspace-tool-registry.json).

**A disabled Launch names every blocker in priority order,** each with the role needed, a link to the fix and an "Ask VP to fix" chip:
- "1600 number [phone] is not declared for A2P on DLT -> Export declaration (Compliance)"
- "Agent v7 is a draft and v6 is live -> Publish v7 (diff) or use v6"
- "No budget cap -> Set cap (Owner)"
- "12 rows need a due date -> Review rows"

This is Sarvam's inline commit gate [O sarvam-26] and Bolna's greyed fields with reasons [O bolna 22], applied to every blocker. Vapi, Retell and ElevenLabs disable the primary button with no reason, or only a placeholder [O vapi 83, retell 24, elevenlabs 33].

**Schedule preview.** Before launch, VP runs the precheck for every person across the next 7 days and draws who is called when, and who waits and why. Nothing is dialled.

## 13. What VP's agents do, and what the client sees and approves

| Agent | Does here | Client sees | Client approves |
|---|---|---|---|
| Data steward | parse, map, normalise, dedupe, reasons, at most 3 questions | the import card with counters | identity merges (A2) |
| Strategist | campaign draft from the goal and preset, cadence, follow-ups | the draft with a diff and reasons | nothing until launch |
| Compliance guard | category check, offer lines in a service brief, the checklist | checks with reasons | category override (Compliance role, with a reason) |
| Line keeper | compliant pool, A2P state, health | the number line on the card | renting numbers (A2) |
| Treasurer | estimate and cap | the money line | cap and top-ups |
| Test pilot | six simulated callers on rows shaped like this list | passes and transcripts | - |
| Campaign runner (engine) | claims, pacing, retries, resume | the run page | launch (A2); then acts at A3 inside it |
| Supervisor | canary and guardrails; pauses | a pause card with cause and undo | resume |
| Memory keeper | applies opt-out at once; records call-later and preferred time | the contact timeline | commitments |
| Operator | the thread and the daily brief | everything, as cards | every external or spend action |

A spoken or typed "haan launch karo" only renders the Launch card; only a tap approves (`rejected.harvest.04`). Every action above is an API and MCP tool under the same auth (W10), including import by API key, which Retell refuses (`rejected.2026-10-20.acct-retell-csv-import-by-api-key`). Campaign tools: source.upload, source.map, audience.create, campaign.draft, campaign.estimate, campaign.preview_schedule, campaign.test_row, campaign.launch, campaign.pause, campaign.resume, campaign.stop, campaign.window.narrow (A3 when live), campaign.window.widen, campaign.audience.add, followup.rule.set, inbound.route.set, attempt.explain, attempt.retry_unknown (A2), call.place_single.

**Worked example (illustrative numbers).**
- **Client:** "Ye November renewals ki list hai, kal se call karna shuru karo."
- **VP:** "1,240 rows padhe. 1,182 log call ho sakte hain. 37 numbers theek kiye (10-digit -> +91). 12 numbers galat hain; reasons wali file ready hai. 9 log pehle mana kar chuke hain, unhe call nahi hoga. Ek sawaal: 3 rows mein upgrade offer likha hai, aur renewal call mein offer nahi ja sakta. Unhe hold kar doon?"
- **Client:** "haan"
- **VP** drafts a service renewal campaign (1600 number, Mon-Sat 10:00-19:00, due-date cadence, WhatsApp link) and runs six simulated callers, which pass. It offers "R01 ki tarah apne phone pe sun lijiye?". The client hears the call, opens the launch card and taps.
- **Next morning:** "Kal 412 calls hue, 238 connect hue, 96 ne renewal confirm kiya (41 ka payment webhook aa gaya). 3 log insaan se baat karna chahte the; woh Priya ki queue mein hain. Pune mein switched-off zyada the, isliye retry shaam ko rakha hai."

## 14. Beyond everyone

1. A hear-a-row test call to your own phone with a real row's variables, and a launch sample rendered from a real row.
2. A stranger guard: no number is dialled whose country was a guess.
3. One category compiled into three enforcement points (dial gate, reply door, template category).
4. Sticky caller ID plus callback continuity: she can call back, and the agent knows why she was called.
5. Due-date cadences that stop on the outcome webhook. Incumbents offer one absolute window or start time [O VAP-46, EXO-15, EL-05].
6. Per-number fairness: a shared family phone rings at most once per slot, and 3 times a day across everything.
7. A canary launch with guardrails, and a review stop on a workspace's first campaign.
8. Outage accounting with zero double dials and no silent extension of the end date.
9. A schedule preview over the real audience before any dial.
10. "Why wasn't she called?" answered from the precheck trace with rule versions.
11. Outcome watches that close the loop on promises.
12. Hinglish-native intake: Indic digits, Hindi headers, transliteration-aware dedupe, honorific stripping.
13. Corrective re-upload of the failed-rows file by row id.

## 15. Emotional voice, memory, personalisation and self-learning here

- **Emotional voice:**
  - the ladder protects goodwill: a short hang-up is not redialled in the same hour, and voicemail gets no robotic message;
  - the second call's opener knows why it is calling again ("aapne shaam ko bola tha");
  - a dropped call is owned;
  - a hand-off carries her brief, so nobody has to repeat themselves.
- **Memory** (preference memory late in v1, relational memory in v2):
  - a stated time narrows that person's window (applied automatically, with undo);
  - language and channel preferences carry across campaigns;
  - the last summary and any open commitment feed the next attempt's pre-call brief;
  - opt-out is tenant-wide and immediate.
- **Personalisation:** per-row language, voice and variables; per-person windows; cadence relative to each person's due date; follow-ups on the channel she prefers.
- **Self-learning** (v2/v3):
  - best hour by segment and retry spacing arrive as Coach proposals, tested with pre-registered fixed-horizon tests;
  - never daily two-arm dashboards (`rejected.2026-10-17.k2-dashboards`: 52-62% false winners in A/A);
  - never pooled across tenants (`rejected.2026-10-17.cross-tenant-pooling`);
  - bandits only near 1,000 calls a day on one script (research/2026-10-17/lanes/l6-self-learning/report.md §4.3).

## 16. Metrics (targets; method)

- **Rings on suppressed or opted-out numbers, on every path: 0.** T2 (N2) and T9b; a daily audit joins the dial log to the suppression ledger, and any ring is Sev-1.
- **Rings out of window or on a holiday: 0.** Dial log against the policy version at dial time.
- **Messy-50: at least 48/50 in under 5 minutes with 0 manual edits.** T2, stopwatch, our own numbers.
- **T3:** promotional at 09:30 and 21:30 refused at the form, the API and the gate; service at 09:30 allowed.
- **Double rings on a number inside its slot or above its ceiling: 0.**
- **Speed of intake:** file drop to launch-ready, median 5 minutes or less for up to 5,000 rows; first-200-row preview p95 3 s or less.
- **Import effort:** manual row fixes on real customer files, median 2% or less; questions per import at most 3 (median 1).
- **Launch blockers fixed through their linked fix without support: at least 90%.**
- **Unknown-outcome attempts:** below 0.1%, with 0 auto-retried.
- **Outage drill:** 100% of outage pauses resume within 15 minutes of green health, inside the window, with 0 double dials.
- **Follow-up delivery:** confirmed within 2 minutes at p95.
- **Hot callbacks:** at least 90% inside 2 business hours.
- **Estimate accuracy:** actual spend inside p10-p90 on at least 80% of runs.
- **Reach and precheck speed:** people reached within budget is reported per preset with n, and stays "not measured" until three design partners give baselines; precheck p95 is 50 ms or less.
- **Chat-run:** T2-T6 by chat only, with 0 silent config drops (W10).

## 17. Phasing

- **v1: parity made better, India-native.**
  - **Scope:**
    - intake (CSV, XLSX, Sheets, API) with the normaliser, dedupe, codes and the failed-rows loop;
    - the category-first campaign and state machine, including recurring and due-date cadences;
    - the retry ladder, budgets, pacing with canary and reserved inbound, sticky CLI pools, and predial;
    - the estimate and cap, and resume after an outage;
    - follow-ups (WhatsApp utility, DLT SMS, callback, hand-off queue, outcome watch);
    - inbound with callback continuity;
    - four post-sale presets, the launch card, schedule preview and hear-a-row.
  - **Evidence:** 0 of 6 forms carry compliance (WT §2.13); the A2P deadline of about 2026-11-17/18 (RS-08); post-sale first (`decision.2026-10-20.synthesis-postsale-first`).
  - **Exit:** W1 and W2 pass; T3 and T9b pass; 30 days of zero-ring audits at three design partners.
- **v2: she remembers; consented leads.**
  - **Scope:**
    - memory-fed attempts and preferred times;
    - promotional campaigns on the consent ledger and 140xx, with a speed-to-lead trigger (a ring within 60 s, inside the window);
    - the feedback and NPS loop after counsel (req-23);
    - CRM write-back once two customers need it;
    - collections after RBI 2027-01-01 and counsel;
    - best-time proposals.
  - **Evidence:** the 7-day inquiry window (RS-12); the owner's order of memory before learning (req-32, req-34).
- **v3: learns at scale.**
  - **Scope:** bandit timing and pacing for tenants at about 1,000+ calls a day on one script; regional languages; multi-desk lead routing towards the command centre (req-18).

## 18. Risks, rejected ideas avoided, open questions, owner requirements

**Risks:**
- Tenants mislabel a sales call as service; the fence and guard catch the lines, and the tenant stays the Sender.
- VP cannot scrub NCPR (RS-11), so promotional rows with an unknown DND status stay held until a carrier DND lookup exists.
- 1600 pickup and streaming are unknown (KC5).
- Over-holding frustrates users.
- Sticky CLIs concentrate volume.
- Without outcome webhooks, a cadence may call people who have already renewed.
- ElevenLabs' hidden campaigns product and SquadStack's self-serve switch could close the gap.
- Carrier lookups for unknown dials are unverified.
- WhatsApp opt-in is rare, so most follow-ups fall back to DLT SMS.

**Rejected ideas avoided:**
- `rejected.harvest.07`: several send paths with enroll-time-only checks.
- `rejected.harvest.05`: auto-retrying unknown outcomes.
- `rejected.harvest.04`: model-emitted approvals.
- `rejected.harvest.03`: safety by instruction.
- `rejected.harvest.14`: test traffic on production quota.
- `rejected.2026-10-20.regulation-segment-cold-outbound-lead`.
- `rejected.2026-10-17.k2-dashboards` and `rejected.2026-10-17.cross-tenant-pooling`.
- `rejected.2026-10-17.parity-undercut`: no price claims.
- `rejected.2026-10-17.managed-telemarketer`: numbers stay in the tenant's name.
- `rejected.2026-10-20.raw-fact-memory`.
- `rejected.2026-10-20.silent-fallback-in-tests`.
- `rejected.2026-10-17.dialect-tts-wedge`: no dialect is inferred from a number.

**Owner requirements:**
- **req-17:** CSV in; VP explains and does it (§5, §13).
- **req-19:** Indian businesses calling their customers. Post-sale presets in v1; pre-sale through the promotional category in v2; cold outbound is not a preset, and the reason is stated.
- **req-20:** launch, analyse and grow, through runs, recurrence and outcome watches; deep analysis belongs to intelligence.
- **req-21:** the whole view, through the run page, the contact trace and every attempt linked to its call.
- **req-23:** in v2, once counsel classifies feedback calls: an interview campaign, then intelligence's clusters, a team task, and a follow-up campaign to the same people.
- **req-24:** the case tables in §5 and §7.
- **req-28:** any data, through CSV, XLSX, Sheets, the API and CRMs.
- **req-65:** pause and stop are A3; resume and unknown retries need a person; guard pauses explain themselves.
- **req-66:** offering, outcome, audience and evidence are named, and identity and columns are reviewed before launch.
