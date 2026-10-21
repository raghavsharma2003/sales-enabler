# Vyakti Platform (VP): the product blueprint, end to end

**Status.** The integrated blueprint for owner review, 2026-10-21 (`directive.2026-10-21.blueprint-end-to-end`). It merges the spine, the nine module designs and two red-team reviews. *Proposed* items wait for the owner; *open* items name the evidence that closes them. Nothing here has run on a live Indian call or with a buyer yet.

**Grades.** [M] measured by us (n, method) · [C] computed · [O] observed (capture, API read-back, code) · [V] vendor-claimed · [I] inferred · [U] unknown · [P] proposed default. **(IC)** marks an integrator change made in answer to the red teams.

**Short paths** (under /home/user/sales-enabler): REQ `research/2026-10-21/blueprint/data/owner-requirements.json` (req-NN) · WT `research/2026-10-21/walkthroughs/SYNTHESIS.md` · TS `research/2026-10-20/teardown/SYNTHESIS.md` · WIN `.../teardown/synthesis/where-we-win.json` (W1-W10, tasks T0-T9) · AS `research/2026-10-20/account-phase/SYNTHESIS.md` · RS `.../teardown/regulation-segment/report.md` · SV2 `research/2026-10-17/SYNTHESIS-v2.md` (KC gates) · SY18 `research/2026-10-18/SYNTHESIS.md` (cost) · LAB2 `research/2026-10-20/voicelab/round1-review-and-v2.md` · L8R2 `research/2026-10-17/lanes/l8-azure-bench/round2/findings.md` · L4B `.../lanes/l4b-measured/report.md` (SR2 its round2 findings) · G5 `research/2026-10-18/lanes/g5-gemini-paid/findings.md` · L5, L6 `.../lanes/l5-human-dialect/`, `.../l6-self-learning/` · HV `docs/harvest/SYNTHESIS.md` (laws) · TXV `docs/harvest/tx-voice.md` · CAT `voicelab/server/catalog.py` · D-* `research/2026-10-21/blueprint/data/*-defaults.json`, `workspace-tool-registry.json`, `intelligence-module.json` · INT `research/2026-10-21/blueprint/data/integrator-resolutions.json` (resolved defaults, registry additions, proposed graph entries).

---

## 1. The one-page summary

**What VP is.** A self-serve voice-agent platform for Indian businesses that call their own customers. The client talks to VP, typed or spoken, in Hinglish or English. VP's own agents build the calling agent, clean the list, get the number, check the rules, launch, watch, explain every call and propose what to improve; the client approves real-world changes with one tap. The call is the product: a warm, quick, honest Hinglish voice that opens with something useful, reads the person, never wastes their time, gets the job done subtly, says once and lightly that it is an AI, and remembers the person next time (req-01, 03, 04, 13, 14, 32, 47).

**The promise.** *Just talk to VP. It builds the agent, cleans your list, gets your number and makes calls your customers are glad to take, in their language and inside the rules. Then it shows you every call, every rupee, and what it will do better next time.*

**Why VP beats each of them** (honest limit in brackets):
- **Vapi:** developer plumbing, no contacts, consent or Indian caller ID, US-hosted, 35% collisions on its own demo [M L4B]; VP is an India-native operator run by chat. (Its QA depth is the bar.)
- **Retell:** the best US builder, but US/CA numbers only and 0 Indian voices [O WT]; VP matches the builder and owns the India path. (Its flows are parity to ship.)
- **Bolna:** Indian and cheap (~INR 5.7/min [O]) but compliance off by default, short Hindi replies discarded, judges hidden [O AS]; VP: compliance on, never-discard turn-taking, visible judges. (It can follow a price cut.)
- **ElevenLabs:** the strongest voice, but no India layer, import-only numbers, end-call off [O WT]; VP wins the India layer. (Not raw voice; hidden campaigns may ship by ~2027-01-31 [I].)
- **Sarvam:** the closest rival (Hindi held 38/40 [M SR2]), but its demo claimed to be human 6/6 [M], 60 s pulses, no memory; VP: disclosure by predicate, per-second billing, memory. (Not language hold.)
- **Exotel:** rails and 140/1600 numbers, but three consoles, quote-gated prices, bot compliance off [O]; VP rides it as a bring-your-own rail.
- **Synthflow:** review-gated, ~USD 30k a year floor, no India layer [O]; VP is self-serve in INR.
- **SquadStack:** managed, sells "spam number rotation", rewards passing as human [O]; VP is self-serve and honest, with assisted onboarding. (Its human CSMs are the real "just talk" benchmark.)

**The ten decisions that define VP**
1. **Talk to VP is the front door, and every action is a tool.** One spec generates the API, SDK, MCP and the Operator's tools. VP drafts and tests on its own; anything that reaches a person, spends, publishes or changes policy waits for a human tap bound to a hash of the exact change. A spoken "haan" never approves (req-13, 14, 17; HV law 12).
2. **The call is a gated cascade with one reply door.** Every word passes code predicates before it is heard: disclosure, never-deny, crisis lines, numbers only from data, no OTP or payment asks, no offers on service calls. Speech-to-speech only after a 200+ attack-turn battery (HV laws 10, 25).
3. **Conversation is configured as shapes and tracked by an agenda ledger in code.** Must-fire rules last, a lint against recitable lines, budgets that throw. One opening spec: a name check, then one breath with her name, the brand, "AI assistant" in passing and the useful fact. She ends the call with a guarded goodbye (req-03, 04, 06, 47).
4. **Speed and turn-taking are one gate, judged at the handset.** Reply gap p50 ≤ 1.5 s, p90 ≤ 2.5 s, cut-ins ≤ 5% on a stereo battery. The default is the best whole-call rating by ear among stacks that pass; a slower favourite is offered with its wait shown (req-01, 11; open decision 1).
5. **India's rules are on by default, on one dial path.** The call category comes first and sets window, number series, consent and template category. Suppression holds on every path; the A2P declaration pack exists before 2026-11-17; every call shows why it was allowed (W1).
6. **Numbers stay in the tenant's name and can be rented inside VP.** VP drives the tenant's line and never carries calls itself. The Line keeper fills KYC from the Brand step and rents through a carrier partner where terms allow (Vobiz rentals inside Sarvam and Bolna are the precedent [O WT]); bring-your-own is the second path (terms [U] until the KC5 quote round, ~2026-10-30).
7. **Results are earned, not asserted.** Outcomes come from systems of record, including sources that need no developer (a paid-list upload, a Sheet column, an insurer MIS file, a manager's confirmation at a lower grade). The client's north star is cost per earned outcome; every failed call has a business reason, carrier code and next action (req-45, 46; W6).
8. **Memory is a quoted, permissioned ledger.** Preferences (language, pace, aap/tum, time, channel) apply automatically with undo, in Base; relational memory is in Plus. Every fact carries the caller's exact words and can be played, edited or forgotten; nothing pools across tenants (req-12, 32).
9. **Learning is fast where it can be and honest everywhere.** A catastrophic line is caught around call 13-15 and fixed from a phone; slower changes are proved with fixed-horizon tests, shadow A/A and expiry; bandits only at volume; a bounded "standing approval envelope" is proposed for v2 (req-34; open decision 5).
10. **One honest price per connected second.** All-in INR per connected minute, billed per second, caps on workspace, campaign and API key, an estimate before launch. Base follows re-metered cost, never a cheaper voice; INR 2 comes from a pre-registered cost ladder (req-41, 43, 44; open decision 2).

**How we build it.** One real journey first: a v0.5 slice with one non-BFSI service preset, one carrier path and one measured stack, run with three design partners (`rejected.harvest.19`). Then v1 (parity made better, India-native), v2 (she remembers and improves, provably), v3 (learns at scale, costs less).

**What is not true yet, so nobody sells it.** VP is not faster yet: every VP stack cuts in on 15-42% of turns [M L8R2, G5], and the owner's preferred Gemini-voice stack measured 1.6-2.2 s at the server [M smoke, n≈3], predicted 2.0-2.5 s at the handset [C]. VP does not have a better raw voice than ElevenLabs or better Hindi hold than Sarvam. Base is not INR 2 at launch (INR 3.49-3.99 ex-GST on today's numbers [C]). "Learns on its own" is not true below ~1,000 calls a day on one script [C L6]. No buyer interview has run.

---

## 2. Principles

| # | Principle | Evidence | What it forces |
|---|---|---|---|
| P1 | **The client just talks; VP's agents do the work** | req-13, 14, 17; chat setup is parity (5 of 6 ship a copilot [O WT]) | Whole tasks through tools (W10); plans, diffs, a ledger |
| P2 | **The voice is the product; voice beats margin** | req-01, 02; Azure won on metrics, lost by ear [M HV] | Voices by ear on whole calls; tone notes never spoken |
| P3 | **Shapes, not scripts** | Brief v2: words per turn 33 → 20, question endings 62-76% → 13-29% [M LAB2]; quoted lines recited 4/5; a rule fired 0/8 mid-brief, 8/8 last [M HV] | Structured brief; must-fire rules last; a ledger each turn |
| P4 | **Competence is the warmth** | AI collectors: 21 pp fewer promises, no more hang-ups; anthropomorphism hurts angry callers [M third-party, L5] | Numbers from data, clean turns, a next step |
| P5 | **Honest by construction** | Prompt-only safety leaked 57-98% vs 0 for predicates [M HV law 10] | Predicates at one reply door, every creation path |
| P6 | **India and compliance by default** | 0 of 6 campaign forms carry consent, DND or DLT [O WT] | Category first; one dial path; A2P pack |
| P7 | **What you see is what runs** | 4 of 4 writable incumbents drift from docs [O AS] | One publish path; 422 on unknown fields; run manifests |
| P8 | **Every number tells the truth** | Vapi shows ~1,530 ms; its demo measured 2,319 ms [M L4B] | All-in INR; n, date, vantage; "not measured", never 0 |
| P9 | **Bounded by default** | Retell keeps forever; ElevenLabs end-call off [O WT] | End-call on, 8 min max, caps, chosen retention |
| P10 | **Results are earned** | No incumbent has a business-outcome field [O AS] | Verified outcomes; calibrated judges |
| P11 | **Remember with permission** | Raw memory re-injected contradictions; pooling picked wrong winners for 48-55% of tenants [C] | Quoted facts, consent, forget; no pooling |
| P12 | **Learn honestly, from calls and the market** | Daily A/B dashboards: 52-62% false winners in A/A [C L6] | Fixed horizons; "under-powered" as a state; Scout |
| P13 | **One real journey before infrastructure** | `rejected.harvest.19` | The v0.5 slice first |
| P14 | **Every default has one owner** | The modules disagreed on windows, caps, disclosure, tiers | One defaults registry with a CI check (Appendix B) |

---

## 3. Who it serves and the jobs

**Buyers.** Indian businesses, SMB to enterprise, with a recurring reason to call their own customers: insurance intermediaries, lenders, subscriptions and utilities, clinics and service businesses, education, real estate with consented inquiries (req-19). Not consumer-internet firms with in-house teams (req-56).

**First jobs** (a go-to-market input, not the product boundary): post-sale service calls, which need no explicit consent, are not blocked by DND from ~2026-11-03 and have no TRAI time band [O RS]: due-date reminders (renewal, pre-due EMI, subscription), appointment reminders, onboarding follow-up. Wave 2: consented inbound leads, feedback calls after counsel. Not v1: cold outbound (`rejected.2026-10-20.regulation-segment-cold-outbound-lead`), collections in default.

**Design-partner order (IC).** v0.5 starts with at least one non-BFSI partner (appointment or subscription reminders on a declared 10-digit line). Insurance and lending follow the KC5 answer (can 1600 numbers stream to VP?) and the KC8 answer (is a neutral renewal reminder solicitation?), both open [SV2].

| Persona | Jobs | Sees first | Approves | View |
|---|---|---|---|---|
| The person called (often older, busy, wary of scams) | Get the useful fact fast; respect; stop calls | Brand, something useful, a light AI line | Consent, opt-out, forget | Verify page |
| Owner (10-500 people, on a phone, Hinglish) | Decide, fund, trust; see results and money | Today brief; launch and budget cards | Spend, launch, numbers, deletion | Owner |
| Campaign manager | Import, launch, watch, fix, report, improve | Mission control; failed-call finder | Launches in budget, publishes, proposals | Owner, Expert on demand |
| Human closer | Warm transfers, hot callbacks | Hand-off queue with brief | Dispositions | Owner |
| Compliance officer | Category, windows, consent, retention, DPDP, audit | Compliance centre, A2P pack | Policy, suppression release | Expert |
| Developer | CRM, webhooks, API/MCP, own carrier | Keys, logs, replay | Keys, webhooks | Expert |
| VP Success (internal, IC) | Assisted onboarding: carrier, KYC, outcome wiring | The client's ledger | Acts only through the same tools | Expert |

**Two views, one product (IC).** *Owner view* (default for Owners and Viewers) shows outcomes, money, approvals and plain words. *Expert view* (default for Builders, Compliance, Developers) adds intervals, judges, manifests, lexicons and statistics. Same objects and URLs; no view hides a safety state or a blocker.

---

## 4. The experience end to end

Each step: what the client does · what VP's agents do · what the client sees · the wow, against the competitors · the target (a bar, not a measurement).

**4.1 Hear it, then sign up (0-1 min).**
- *Client:* taps "Talk to VP" on the public page, talks, then signs up with Google or phone OTP and a business name. No card.
- *Agents:* the public Operator discloses once, asks about the business and plays "how your customer hears it" in three registers; with consent the chat becomes the setup thread.
- *Sees:* one orb with live captions; voice cards with India first-audio and INR per minute; after the call, "her replies took 1.4 s at the median on this call (n=9 turns, your browser)".
- *Wow vs them:* a voice before a form, honest about being an AI and about its speed. Sarvam's homepage demo claimed to be human 6/6 times when asked [M SR2]; Retell asks for a Persona ID before any country [O WT].
- *Target:* first audio ≤ 2.5 s p75; sign-up ≤ 60 s.

**4.2 The first conversation: say the job (2-5 min).**
- *Client:* "Motor renewal reminders, 1,200 customers", plus a website or brochure if they like.
- *Agents:* the Strategist sets job, category (service) and outcome definition; the Brief writer turns the website into Offering facts with quoted spans (customer rows never enter company knowledge); at most one question per turn, five before the first call, each with VP's default.
- *Sees:* a plan card ("VP will do 1-6 now; 7 waits for you") with a risk chip per step; a facts card to approve or strike; a readiness rail that never covers content.
- *Wow vs them:* the whole job is planned and the drafts already run; Sarvam's prompt box makes only an agent, and Retell's checklist covers its canvas [O WT].

**4.3 The first agent: voice by ear (about 1 min).**
- *Client:* hears three voices in three registers say one Hinglish line with the brand name; picks by ear; says "thoda slow bolo" or "discount mat bolna".
- *Agents:* the Brief writer compiles, lints recitable lines and derives "What she tracks"; the Test pilot pre-runs six simulated callers.
- *Sees:* the brief as cards with a locked disclosure row; the predicted reply gap and all-in INR in the header; a diff card for each spoken tweak.
- *Wow vs them:* speed and price beside every voice; a mismatched voice is refused. Retell has 0 Indian voices; ElevenLabs accepted an American voice on a Hindi agent; Bolna's Hindi list carries romance voices [O].

**4.4 The first test call (browser < 3 min from sign-up; own phone ≤ 15 min).**
- *Client:* "Call me in the browser", then "Kaisi lagi?"; then "Ring my phone": a missed call to VP's trial line and press 1 on a 10 s confirm call.
- *Agents:* the Test pilot runs the call with a made-up customer; feedback becomes diffs with a one-tap re-test; the Line keeper verifies the number spoof-safely and rings from VP's declared trial line.
- *Sees:* live captions, reply gap and cut-in marks per turn, the "already said" ledger, door events ("₹18,450 checked against facts ✓").
- *Wow vs them:* feedback by talking becomes a reviewed change, and her own phone rings within minutes. Bolna tests only by phone; Exotel's web call is "coming soon" [O]. Competitors' ring time is [U] (the walkthroughs placed no calls) and is measured in W7.

**4.5 Data in: any file to an audience (≤ 5 min).**
- *Client:* drops a CSV, Excel, Sheet link or text PDF, or connects a CRM: "isko fire karo".
- *Agents:* the Data steward classifies (people, knowledge, events), maps headers, normalises to India-default E.164 with a stranger guard, dedupes across formats and scripts, applies suppression and tombstones, checks payment freshness, asks at most three questions.
- *Sees:* "1,240 rows → 1,191 callable · 37 numbers fixed · 12 rejected (reasons) · 9 opted out, kept suppressed · 28 duplicates merged · 212 already paid, won't be called"; a failed-rows file with a fix column; "Ring my phone as row 1".
- *Wow vs them:* no file rejected for one bad row, and people who already paid are not called. Vapi turns a 10-digit mobile into +98 and rejects the whole file; Retell imports +91 numbers as +1; Exotel drops duplicates silently [O].
- *Target:* messy-50 ≥ 48/50 in < 5 min, 0 manual edits (W2).

**4.6 The first campaign: number, readiness, launch.**
- *Client:* "kal se chalao"; picks "Rent in my name" or "Connect my carrier"; uploads KYC documents once.
- *Agents:* the Strategist drafts a category-first campaign; the Line keeper picks the series, shows documents, time and price before any credential, and files KYC, the caller-name request and the A2P declaration; the Compliance guard flags offer lines; the Treasurer prices a p10-p90 range and proposes a cap.
- *Sees:* one launch card (who, when, a 20 s sample from a real row, checks, money, outcome "no baseline yet"); hold 1.2 s to launch. A disabled Launch names each blocker, who can fix it and a link.
- *Wow vs them:* the launch explains itself, and tests continue while KYC waits. 0 of 6 campaign forms carry consent, DND or DLT; Vapi and Retell disable the button with no reason [O WT].
- *Target:* launch-ready in 30-60 min of active time on declared 10-digit lines (req-39); 1600 numbers take about 7-14 business days [V SV2], shown as a timer.

**4.7 Live mission control.**
- *Client:* watches, listens, whispers or takes over, or does nothing.
- *Agents:* the Campaign runner starts with a 20-call canary; the Supervisor watches every call for crisis words, loops, anger, opt-outs, "aap AI ho?" and payment asks and pauses on a guardrail (A3, undo); the Treasurer stops at caps between calls; the Line keeper pauses a line nearing a reg 21A flag.
- *Sees:* state, lines in use, spend against cap, the window clock; a funnel with a reason at every drop; live tiles with agenda chips and mood; an alert feed.
- *Wow vs them:* a crisis call gets Tele-MANAS 14416 and 112 from a predicate and a human alert within 5 s. Retell's live controls are API-first; Exotel's alerts live in another product; Vapi's Mission Control is flag-gated [O].

**4.8 Results and AI analysis.**
- *Client:* opens a call, or asks "Pune mein pickup kam kyun hai?"
- *Agents:* the Call analyst runs code first (ledger, latency, cut-ins, heard-vs-planned text, compliance trace), then one LLM pass whose quotes are verified spans; the Concierge finds any failed call.
- *Sees:* the call page (two-lane player; transcript in native script, romanised and English; outcome and source; reason, carrier code and action; cost lines; "why this call was allowed"; run manifest); the campaign view (funnel, cost per earned outcome against the client's own desk, drivers labelled observed or under-powered, drop-off, objections); Ask VP with n, interval and quotes that play.
- *Wow vs them:* any failed call found with its business reason and fix in under 60 s. Vapi shows 638 engineering codes, truncated; Sarvam's carrier field is null; 0 of 5 vendor APIs group cost by campaign or contact [O AS].
- *Target:* T5 < 60 s, 5/5, ≥ 4 actionable (W6); T6 export 6/6 in < 2 min.

**4.9 The daily loop.** Morning: the Today brief at 09:15 IST (outcomes earned, verified vs AI guess; spend against plan; cost per outcome against the desk; issues fixed; one 30 s clip; at most 7 approvals; today's schedule). Midday: mission control; warm transfers and hot callbacks arrive with a brief. Evening: ask anything; clear the learning inbox (≤ 3 new cards). Weekly: experiments, "how she changed", compliance digest, invoice. No competitor ships a daily brief or an approval queue [O WT].

**4.10 Improvement over time.**
- *From call 2:* preferences (language, pace, aap/tum, time, channel) apply on the next call, with undo.
- *Around calls 13-30:* the fast lane catches a catastrophic line (90% hang-ups) at a median of call 13-15, with 0 false flags in 4,000 healthy simulated runs [C D-LE]; VP slows that script to 25% and sends a fix card to the approver's phone, so the owner's "90 of 100 dropped after one line" is fixed long before call 101.
- *Calls 100-1,200:* "where callers leave" shows every moment with an interval; each proposal says "calls to prove: about N (about D days)".
- *Week 4 onward:* fixed-horizon tests; winners expire after 60 days; "How she changed for you" lists every change with its interval, including the ones that did nothing.
- *Vs them:* Retell Conductor proposes diffs with a pass rate; Vapi's Bypass mode publishes without a pause; no vendor ships statistics or expiry [O].

**4.11 Cases handled by default (req-24).**

| Case | Default | Owner |
|---|---|---|
| Messy rows (0-prefix, +91, Devanagari digits, duplicates) | Normalise, dedupe, a reason per row; never reject the file or guess a country | campaigns |
| Opted out, DND, suppressed, erased | Never dialled on any path; reason shown | trust |
| Out of window, holiday, quiet hours 22:00-07:00 | Deferred to the next allowed local slot | campaigns |
| Busy, no answer, switched off, voicemail, IVR | Hindi/English announcement lexicon, early exit, retry ladder | voice, campaigns |
| Wrong person, a relative, a minor answers | No account detail before a knowledge check; offer a callback; for a minor, ask when a parent is free | voice |
| "Woh nahi rahe" (bereavement) | Condolence, end, suppress on all campaigns, flag to a human (IC) | voice, trust |
| A new number offered for the person | Proposed identifier, reviewed (A2); never dialled without a basis (IC) | memory |
| A language the campaign lacks | Apologise simply; callback in that language if an agent exists, else a human; store the preference (IC) | voice |
| "WhatsApp pe bhej do" | Channel preference; follow-up there if opted in, else DLT SMS (IC) | campaigns |
| A third party asks for account details | Refuse kindly; offer a callback to the holder (IC) | trust |
| "Call me later" | Callback at that time, inside window and budget | campaigns |
| "Dobara call mat karna" | Opt-out tenant-wide in the same transaction | trust |
| "Aap AI ho?", "say you're human" | Honest answer, never a denial | reply door |
| Angry, elderly, switching language, noisy | Straight answer first, warmth down; Patient preset; follow the caller | voice |
| Crisis words | 14416 and 112, goal suspended, human alert; she never ends first | trust |
| Payment or OTP on the call | Refused; a link on the client's domain after the call | trust |
| Tool or provider failure mid-call | Pre-rendered hold line in her voice, graceful close, one callback, not billed | voice, economics |
| Cap reached, flagged line, KYC pending | Pause at a call boundary; tests continue | economics, trust |
| Recording refused; data request | Recording stops; forget follows the person with a receipt | trust, memory |

---

## 5. VP's agent system: the AI workforce

**Two layers.** *Agents* (LLMs) understand, plan, draft, analyse and explain. *Engines* (code) enforce and execute: `compile()`, the dial gate, the reply door, the dialer, statistics, the meter, the ledgers. No agent can override an engine.

**One registry, seven risk classes:** read, draft, test, external (reaches a person), spend, destructive, policy. Agents act only through the public API/MCP tools any developer gets; approval rules live in code (HV law 12, `rejected.harvest.04`).

**Autonomy.** **A0** suggest. **A1** drafts and simulations inside a test budget, never a real person or money. **A2** a card with diff, cost and risk; a 1.2 s hold makes the server mint a token bound to the args hash, object version, approver and role. **A3** acts at once inside an approved policy, only to lower risk or spend, then notifies with undo. The A3 verbs are a closed list: pause or stop a campaign, suppress after an opt-out, end a runaway call, stop at a cap, pause a flagged line, retry per the ladder, and `deployment.revert_to_last_good` (IC). Revert is allowed only when the fast lane flagged a moment the current version introduced, the previous version ran 200+ connected calls without that flag, and it re-passes today's compile, lint, locked-section, provenance and fact checks; otherwise VP throttles to 25% and sends a card. Launch, publish, buy, raise a cap, change policy and delete always need A2.

| Cluster | Agent | Does | Autonomy |
|---|---|---|---|
| Front door | **Operator ("VP")** | The client's one partner, text or voice: plans, delegates, acts, explains, reports | A1; A2 for external, spend, publish; brain chosen by the client |
| Front door | **Concierge** | Finds the failing call, explains, proposes the fix, hands to a human | A1 |
| Build | **Strategist** | Goal to campaign: preset, category, audience, agenda, outcome, follow-ups | A1; launch card |
| Build | **Brief writer** | Brief, lint, ledger pack, register and voice | A1; publish with diff |
| Build | **Data steward** | Mapping, E.164, dedupe, row reasons, freshness; never decides consent | A1; A2 for merges |
| Build | **Test pilot** | Simulated Hinglish callers with hidden keys; gates publish | A1 |
| Build | **Line keeper** | Series, KYC, rental or own carrier, CNAP, A2P pack, line health | A2 to rent; A3 to pause a line |
| Run | **Compliance guard** | Category, offer lines, DPDP notice, launch checklist | Blocks always on; policy needs Compliance |
| Run | **Campaign runner** (engine) | Pacing, windows, retries, follow-ups, resume | A3 inside the launched policy |
| Run | **Supervisor** | Watches live calls; whispers; ends runaway calls | A3; take-over is human only |
| Run | **Treasurer** | Estimates, reservations, caps, invoices, GST, TDS | A3 to stop at caps; A2 top-ups |
| Learn | **Call analyst** | Outcomes, reasons, objections, summaries, answers with quotes | A1 |
| Learn | **Memory keeper** | Quoted facts, consent checks, pre-call brief, forget | A3 opt-out; preferences auto with undo; review for promises |
| Learn | **Coach** | Proposals from failures, tested on simulated callers | A1; live needs A2 or the v2 envelope |
| Learn | **Learner** (engine) | A/A, power, fixed horizons, guardrails, expiry | A3 to stop; A2 to promote |
| Internal | **Scout** | Competitor radar and tripwires (§10) | A1; read by VP's owner |
| Human | **VP Success** | Assisted onboarding in IST hours, through the same tools (IC) | Named in the ledger |

**Worked example: "ye CSV hai, renewal reminders bhej do"** (illustrative). Data steward: 1,240 rows read, 37 numbers fixed, 12 rejected with reasons, 9 opted-out kept suppressed, one question ("due date DD/MM?"). Strategist: a service campaign, local-time window, 3-attempt ladder, a follow-up with the renewal link. Brief writer drafts; Test pilot runs six simulated callers; Compliance guard confirms no offer rides the call; Line keeper confirms a declared line; Treasurer prices a range. One launch card; the manager holds Launch; tomorrow's brief reports what was earned.

**Standing approval envelope (v2, proposed, open decision 5).** The client pre-approves a class of low-risk changes (turn timing inside preset ranges, reordering middle slots, objection packs from the approved library). Each such change starts as a 10% split, is promoted only on a passing fixed-horizon test, and stops on any guardrail. Everything else stays one tap. This makes "self-learning" true without a model approving itself.

---

## 6. Module by module

Each module: design, screens, defaults, metrics. Full values live in the module defaults files (D-*); Appendix B names the owner of every shared default.

### 6.1 Workspace: Talk to VP, the Operator, onboarding, Today, the shell
**Design.**
- Threads hold messages; configuration lives on objects with URLs. Ten card types (plan, diff, launch, call, chart, approval, issue, receipt, question, progress); receipts say confirmed, not executed or unknown, and what undo cannot reverse.
- The Operator: one `compile()` with a budget that throws; a typed plan validated in code (schema, role, risk class, untrusted arguments flagged); drafts and tests run at once; each A2 step stops at a card; each action records the brain and prompt hash that ran.
- Conduct as predicates: at most one question per turn, only one that fills a named field, with the default stated; no number without a tool source; open the page when unsure; reply in the client's language; never "done" before a receipt.
- Uploads reach the Operator as receipts, headers and value shapes, never raw customer rows; BFSI workspaces use India-resident brains only (IC).
- Push-to-talk Hinglish with a "heard as" chip, its ear chosen on recorded human commands, not TTS renders (IC); spoken summaries (v1), hands-free in v2. The client picks the Operator's brain (req-16) from curated brains showing India first token, INR per turn and a bench score; the brain never changes permissions.
- CI parity: every page action is a tool and every tool has a page; the registry gains 17 tools other modules defined (IC; listed in INT).

**Screens.** Hear-it-first · one-field sign-up · onboarding thread with readiness rail · company facts card · voice-by-ear card · browser call with "Kaisi lagi?" · Ring my phone · launch readiness · Today (desktop, phone) · campaign page with page-aware panel and edit echo · "What VP did" ledger · Operator settings · Hinglish Cmd-K.

**Defaults.** Read automatic; draft and test A1; external, spend, destructive, policy A2; hold 1.2 s; re-auth above INR 50,000, 10,000 contacts or a 2x cap raise; cards expire in 24 h; Today shows ≤ 7 items in fixed priority (safety incident, blocking approval, approvals, issues, proposals, FYI).

**Metrics.** Sign-up to browser first audio < 3 min (median); to trial ring ≤ 15 min; launch-ready in 30-60 active min; T1-T6 by chat, 0 silent drops (W10); A2 actions without a human token 0; invented numbers 0; Operator first card ≤ 3 s; ≤ INR 30 per onboarding.

### 6.2 Voice: brain, voice, turn-taking, reply door
**Design.**
- *Gated cascade:* echo handling → VAD and streaming ears → turn manager → brain (cached core plus a per-turn ledger tail) → number-safe clause splitter → reply door → voice. Every call carries a run manifest (dated models and regions, brief hash, ledger and lexicon versions, turn values, carrier leg, declared fallback).
- *The brief is configuration:* cards compile in fixed order (SCRIPT, IDENTITY with the locked AI line, GOVERNOR, MEDIUM, SOUNDS, CORE, SITUATION_GOAL, OPENING, SAFETY, MEMORY_BRIEF, FACTS_ROWS, DELIVERY; then LEDGER and COUNTS_AND_GOAL_CHECK last, every turn). Core cap 12,000 bytes, tail 1,900; an over-cap section blocks publish by name. The lint blocks quoted lines, stage directions, numbers in prose and anything weakening disclosure, crisis or no-OTP.
- *The opening spec, one for every module (IC):* turn 1 checks it is the right person (the brand may be named; no purpose, no account detail). Turn 2, in one breath: her name, the brand, "AI assistant" in passing, the useful fact, why she is calling; then she stops. A spoken recording notice, where a sector pack needs it, rides her next content turn. Disclosure is spent only when playback marks show it was heard; if talked over, it comes once in her next turn; otherwise it is never repeated unprompted. "Aap AI ho?" always gets the honest answer. Reverse if counsel reads the IT Rules audio duty as requiring the AI clause in the first words.
- *Turn manager:* pause-aware release (complete, unsure, incomplete; Hindi is verb-final, so a turn ending on का, को, और or मतलब reads incomplete [I]); a one-token fast path after her yes/no question; withdraw-and-merge; a never-discard classifier for short speech (acknowledge हाँ, जी; stop रुको, बस; answer नहीं, बाद में); quiet-reply rescue for the "hmm" no ASR transcribes; a silence ladder in the caller's language.
- *Speed:* the name-check clip is cached per voice and first name when the audience is built, and the intro renders on answer, so no TTS is spent on unanswered dials (IC); acknowledgement clips in her own voice; region pinning; warm sockets; silence trim; speculate compute but never release the floor early (`rejected.2026-10-17.speculative-release`); quota reserved per call.
- *Expression:* person-reading in code (hurried, irritated, worried, chatty, confused, slow) sets rate, style, warmth and preset; tone notes never spoken; less warmth on complaints and dues; a per-voice number-reading regression.
- *Reply door R1-R11 (IC):* each predicate is labelled deterministic or classifier-based (human claim, crisis, promotion, solicitation, harsh practice); one clause of lookahead; risky turns (offers, identity, payment, crisis cues) hold the whole reply until checked; a blocked later clause plays a pre-rendered bridge, then regenerates. A Phase 0 battery measures each predicate's errors and latency.
- *Echo (IC):* VP builds reference echo handling against its own outbound audio, tested on the Plivo leg with real handsets and speakerphones; Taxila's 0/66 (Azure Voice Live preview, simulated harness [M TXV]) is not VP evidence.
- *Stacks:* presets plus an expert picker showing India p50/p90 (n, date), INR per minute, a sample, the ear rating (n), residency and sunsets; mismatches refused.
- *Languages:* v0.5 Hinglish; v1 Hinglish, Hindi and Indian English GA plus Tamil, Telugu, Kannada, Marathi and Bengali in beta on the Indic stack, each released only when its opt-out, crisis, disclosure and goodbye lexicons pass and language hold is ≥ 95% (IC). Dialect only by opt-in (`rejected.2026-10-17.dialect-tts-wedge`).

**Screens.** Agent studio · voice by ear (blind, then reveal) · stack chooser · turn-taking panel (predicted gap beside measured p50) · live test call · turn timeline · publish review · simulated caller lab.

**Defaults.** Standard: segmentation 500 ms, hold 600 / 1,400 ms, barge-in at 300 ms + 2 words. Patient: 800 / 1,200 / 2,600 ms, rate 0.92. Brisk: 500 / 400 / 1,000 ms, rate 1.05. Silence ladder 6 / 12 / 17 s; 8 min max; about 20 words a turn; one question at most; aap with plural verbs. The battery sets the shipped values.

**Metrics.** Handset gap p50 ≤ 1.5 s, p90 ≤ 2.5 s; cut-ins ≤ 5%; elderly pause uncut ≥ 10/12; short replies ≥ 90% handled; language hold ≥ 95%; AI denials 0; disclosure heard ≥ 99.5%; wrong numbers spoken 0; ear rating ≥ 7.0 with ≥ 3 testers; predicted gap within 150 ms of measured.

### 6.3 Campaigns: list to calls, calls to follow-through
**Design.**
- Category first; one campaign object (a versioned policy); attempt separate from call; every pause carries its cause; VP never cancels a campaign or releases numbers for lack of balance.
- *Intake:* a contract from the agent's variables before upload; 200,000 rows or 100 MB; header synonyms first, an LLM only on headers and shapes; ≤ 3 questions; the India normaliser with a stranger guard; cross-script dedupe; row codes and a failed-rows file; per-row language, voice and preferred time, never per-row prompts or disclosure.
- *One dial path:* every attempt goes through `dial.claim()`; the customer veto runs in two phases (reserve, call the hook outside the transaction, confirm or release), keeping the precheck ≤ 50 ms p95 (IC).
- *How hard to try:* a 14-class retry ladder by outcome; person, number and network budgets; a sticky caller ID per person; reserved inbound lines; a canary and a first-campaign review stop; resume after an outage with 0 double dials; unknown outcomes never auto-retried.
- *Follow-through:* WhatsApp utility (opt-in) or DLT SMS; callbacks; warm transfer with a spoken brief, or a hot callback with a 2 h SLA; outcome watches; a durable outbox. Template approvals sit on the readiness rail with timers (IC).
- *Inbound:* routing, exact caller-ID lookup, callback continuity with a generic opener until the person is verified (IC), after-hours modes, overflow.
- *Stages (parity, IC):* ordered agenda stages with conditions (identity confirmed, already paid, wants a human, reschedule) drive tools and transfers, plus hand-off to another VP agent with context. The T10 branching task (slot booking with a two-step identity check) proves it before any graph builder is considered.
- *Presets:* appointment and subscription reminders first; insurance renewal (IRDAI) and lending pre-due (RBI-ready) after KC5 and KC8; no cold-outbound preset.

**Screens.** Import · rows and reasons · campaign policy · launch card · run page · person in campaign ("why and when") · schedule preview (7-day precheck dry run) · after the call (follow-through, hand-off queue) · inbound routes · presets.

**Defaults.** Contact local time: service Mon-Sat 10:00-19:00; lending 08:00-19:00; appointments daily 09:00-20:00; promotional 10:00-21:00 hard (v2); quiet hours 22:00-07:00 absolute (no cross-midnight windows). Retries: busy +30 min/+2 h; no answer (40 s ring) +3 h/next day; voicemail, no message. Renewal budget 2 a day, 5 a week; 3 rings per number per day, 120 min apart; canary 20 calls at 3 a minute; predial 800 ms, fail closed.

**Metrics.** Rings to suppressed or out-of-window numbers 0 (sev-1); messy-50 ≥ 48/50 in < 5 min; T3 refusals at form, API and gate; double rings 0; unknown attempts < 0.1%; outage resume within 15 min with 0 double dials; follow-ups p95 ≤ 2 min; spend inside the estimate on ≥ 80% of runs.

### 6.4 Intelligence: every call and campaign, understood
**Design.**
- One metric layer (22 metrics defined in code) feeds pages, chat, briefs and exports; the Call analyst composes queries and never writes a number.
- After hang-up (p95 ≤ 60 s): reason and carrier code; per-second cost lines; transcript of record with a non-speech probe; code analyses (ledger, latency, cut-ins, heard-vs-planned text, mood path, compliance trace); one LLM pass with verified quote spans (≈ INR 0.17 per 3-min call [C]); webhooks and CRM write-back through the outbox.
- *Outcomes (IC):* client-owned definitions; verified sources are payment webhooks and CRM fields plus no-developer sources (a paid-list re-upload or Sheet column, an insurer MIS file parser, a manager's confirmation graded below system-verified); interim results need no integration (promise with a date, callback booked, agenda done, link opened).
- *Judges:* visible, versioned, pinned, temperature 0; extraction calibrated against human quick-rate labels, with promise-to-payment conversion tracked separately (IC); "Trusted" at agreement ≥ 0.90 with a Wilson lower bound ≥ 0.80 on 50+ pairs.
- 34 reason codes in business English and Hinglish with carrier code and one action; 20 monitors on by default including a reg 21A caller-ID guard; never "all good" unless monitors are live and read back.
- Mission control: listen (audited), text whisper (passes the reply door), take over (human only), end politely.
- *Predictions (req-19, IC):* v2 per-contact likelihoods (pickup by hour, renewal) order calls and flag risk, labelled "observed, not causal"; v3 campaign forecasts with intervals.

**Screens.** Call page · failed-call finder · campaign overview · where people drop · mission control · issues and monitors · outcomes and judges · Ask VP card · Today brief · export and webhooks · how she changed · state gallery.

**Defaults.** 8-stage funnel; early hang-up < 10 s; drivers under-powered unless the interval excludes 0 with ≥ 100 per group; drop-off flags FDR-controlled across moments and segments (IC); recording links signed for 7 days; full-retention search ≤ 1 s.

**Metrics.** T5 and T6 pass; crisis alert ≤ 5 s with helplines 100%; quote fidelity 100%; chat-vs-page number mismatches 0; unknown reasons ≤ 2%; analysis ≤ INR 0.20 per call; ≥ 60% of live campaigns with a verified outcome source by day 30.

### 6.5 Memory and omni-channel
**Design.**
- Three stores, never mixed: the company brain (spans, approval), the contact record (systems of record, authority, max age), contact memory (the caller's quoted words).
- Authority by subject: the person wins on preferences and opt-out; systems win on money, dates and identifiers. A caller's "9 hazaar" never overwrites ₹12,400; she speaks the system value and a conflict card appears.
- Seven write gates: exact quote and span; a vocabulary with a never-stored list (no mood scores, inferred caste, age or health, ID numbers); value lint against injected instructions; a 60+ item Hinglish refusal guard; consent and purpose; contradictions as new rows; a risk tier (opt-out instant, preferences auto with 7-day undo, promises and amounts reviewed).
- Read path: prefetch at attempt claim; a ≤ 1,200-byte key=value brief in the delimited data slot; preferences applied as configuration (language mode, STT hint, voice, turn preset); fail open. On a shared or unverified number, memory loads only after an in-call knowledge check, inbound included (IC).
- Omni-channel by value: v1 files, Sheets, API, payment and policy feeds, the first partner's CRM, text PDFs (scanned PDFs by OCR with review, beta, IC); v2 WhatsApp, SMS, email and one purpose-relevant app event per call. Freshness at dial time stops calls to people who already paid.
- DPDP: the tenant is fiduciary, VP processor; purpose and basis per fact; retention per class; forget follows the person everywhere with a tombstone and a receipt; India region; minors excluded; no pooling.

**Screens.** Contact view ("She knows" chips that play) · memory review inbox · what she remembers · your data (sources hub) · fire an agent on any data · privacy and forget · company brain · My Data for the person called (v2).

**Defaults.** Brief cap 1,200 bytes; recordings Base 90 days, Plus 1 year, sector floors above (IRDAI call records 10 years); preferences kept 12 months after last stated; attribute max age: payment 1 h, policy 24 h, upload 30 days.

**Metrics.** Recall across repeat calls ≥ 95% (MEM-SIM 200 × 3); preferences ignored ≤ 1 in 20; memory adds ≤ 50 ms; never-stored leaks 0; dials after opt-out 0; forget in 24 h / 72 h, 0 resurrections; ≤ INR 0.15 per 3-min call.

### 6.6 Learning: getting better, provably
**Design.**
- *Learnable:* turn-taking numbers and Hindi lexicons, the opening and middle slots (as shapes), objection packs, tool guidance, best time inside the window, the memory compile policy; register and voice only through blind listener panels (v3).
- *Never learned (locked in code):* disclosure presence, recording notice, consent and opt-out, crisis lines, identity, prices and dates, the promotion fence, reply-door predicates, the per-turn tail.
- *Fast lane:* flag a moment when hang-ups ≥ 10 and P(hazard > 3x reference) ≥ 0.99; engineering triage first; revert or throttle (§5); a fix card on the approver's phone within 15 min p90.
- *Propose, probe, compose* (harness2 made safe, req-35): failures become patterns re-voiced by synthetic Hinglish personas; ≥ 60 runs per arm, reference spread measured on ≥ 2 pairs (IC); gates that throw (lint, budget, locked-section diff, provenance, manipulation lint, latency); simulator prompts framed as QA writing tasks on test quota only (`rejected.harvest.14`, `.15`); cards show "calls to prove" and the INR effect.
- *Statistics in code:* contact-sticky arms, pre-registration, fixed horizons with the verdict hidden, always-valid tests for harm only, shadow and permutation A/A per tenant at zero call cost, guardrail auto-stop (opt-outs, complaints, disclosure, crisis, reg 21A, minutes per agenda-done call), expiry at 60 days; bandits only at ≥ 1,000 connected a day on one script (v3).
- *Copy:* "remembers every customer, shows where calls fail, proves the changes you approve"; "self-learning" stays blocked below L4 unless the owner adopts the envelope copy (open decision 5).

**Screens.** Learning inbox · proposal review · where callers leave · fast-lane alarm (phone) · experiments · experiment detail · how she changed · what VP may change (lock map) · lessons.

**Defaults.** ≤ 3 new cards a day; one proposal cycle a day inside the INR 200 test budget, two on Plus at INR 400 (IC); first 50 variant calls at 20%; tests run 7-28 days; shadow A/A ceiling 6.5%.

**Metrics.** Shadow A/A false winners ≤ 5%; 0 gate escapes on a 50-proposal red-team set; 90% lines flagged by call 20 in ≥ 95% of runs [C]; ≥ 80% of promoted changes hold; simulation-to-live agreement measured (≥ 70% target [I]); first proved change: turn-taking within 30 days, any slot within 60-90 days at L2 (IC).

### 6.7 Trust and telephony
**Design.**
- *Rails:* numbers in the tenant's name; VP software drives the line. Rent inside VP through a carrier partner where terms allow (Vobiz precedent [O]), or connect your own (Plivo primary, Vobiz, Exotel AgentStream under written terms; generic SIP in v2). India media edge to Azure Central India.
- *Trial line:* VP's own declared caller ID rings only owner-verified numbers (missed call, 10 s confirm call; pressing 9 blocks all VP trial calls). VP registers its own DLT entity and declares the line by 2026-11-14 (IC).
- *Series router:* 140 promotional (v2); 1600 for RBI, SEBI, IRDAI, PFRDA entities; 1601 utilities and logistics; declared 10-digit otherwise. The number step shows documents, time and price before any credential, then a KYC timer, the CNAP request and the A2P pack (CSV, PDF, JSON); from 2026-11-17 the gate refuses undeclared lines.
- *Line health:* pacing against reg 21A signals (recipient diversity, short calls, inbound:outbound) with ramp, amber and red pause; spam-label and pickup checks per line from a test handset; optional Truecaller business verification (IC).
- *Dial gate G1-G12* in the claim transaction, fail closed, reconciled daily against carrier CDRs. *Reply door RD1-RD11* and trust lints on every creation path.
- *Identity before account details (IC):* a knowledge check (e.g. the last 4 of the policy or loan number) before account details or memory on inbound, on lending outbound and when a relative answers; generic callback openers; no purpose on the verify page for lending.
- *Security (IC):* fixed roles; a hash-chained audit log naming VP's agents; scoped, capped keys; closed widget keys; tool arguments bound to the dialled contact's record keys; an egress allowlist for every tenant URL; redaction by context, not checksum; an isolation battery per release; know-your-business and a penetration test before production.

**Screens.** Numbers · which number do I need · connect your carrier · test on real phones · A2P pack · line health · compliance centre · trust checks · call trust trace · suppression ledger · safety events · privacy · team and audit · developers · business identity · verify page.

**Defaults.** Trial: 5 verified numbers, 10 rings per number a day, 30 across workspaces, 300 s, 09:00-21:00. New 10-digit lines ramp 100 → 800 recipients a day. Amber at > 40% short calls or > 15 opt-outs per 1,000. Keys expire in 90 days. Retention chosen at onboarding, never indefinite.

**Metrics.** 0 rings to suppressed, out-of-window or erased contacts on carrier CDRs; 0 promotional lines on service calls (T9a); 0 AI denials (T9c); 100% of production lines declared; isolation hits 0; redaction recall ≥ 99% on spoken digits; carrier incidents detected ≤ 2 min.

### 6.8 Economics and platform
**Design.**
- *Unit:* INR per connected second, quoted per minute, all-in display, GST beside every price; unanswered, busy, failed, blocked and VP-fault calls are not billed.
- *Two billing modes (IC):* on VP-provisioned lines telephony is re-billed at cost where counsel and carrier terms allow; on bring-your-own lines VP bills a platform rate (all-in minus the INR 0.45 telephony allowance), the carrier bills at its own pulse, and the product shows the computed all-in total and effective rate. W8 is judged on the sum of both invoices.
- *Wallet:* prepaid INR (UPI, UPI Autopay up to INR 15,000 a debit, cards, netbanking); invoice and NEFT above INR 15,000 a month; GST invoices; TDS credit; five wallet states; a reservation before each dial; live calls never cut for money; numbers kept 30 days on an empty wallet.
- *Platform:* one OpenAPI spec generates validators, SDKs, MCP, Operator tools and CLI; 422 on unknown fields; idempotency keys; `dry_run` on every write; signed webhooks (72 h retries, 30-day replay); MCP spend or external actions return an approval link for a human tap.
- *Reliability:* v1 call-path SLO 99.5%; synthetic echo-bot calls every 5 min per carrier and preset; an honest status page; failover in §7.3; India disaster recovery (RPO ≤ 15 min, RTO ≤ 4 h [P]), on-call runbooks and a voice-rt load test before v0.5 exits (IC).
- *Integrations v1:* Sheets, payment webhooks (Razorpay, Cashfree, PayU), the first partner's CRM, WhatsApp utility, signed webhooks; more CRMs when two paying customers need one.

**Screens.** Billing and wallet · rate card and "Kitna lagega?" estimator · stack cost and speed strip · spend explorer · developers · health and status · integrations · Scout radar (VP owner only).

**Defaults.** Free trial INR 500 lifetime per verified phone (IC); API keys INR 2,000 a day; reservation = rate × 480 s; concurrency Base 20, Plus 50, Premium 100 subject to quota (IC); caps warn at 80% and stop at a call boundary.

**Metrics.** Invoice within 1% of the rate card (T7); meter within 5% of vendor bills; gross margin p50 ≥ 30% without a voice downgrade; cap overshoot 0 beyond reservations; refunds within 7 working days; availability 99.5% (v1); first human support reply < 2 h in IST hours (W9).

### 6.9 Design language
**Design.**
- "Naya bahi-khata", the modern ledger: warm paper, forest-green ink, a terracotta seal on whatever needs you. Fraunces with Tiro Devanagari for display, Anek Latin and Devanagari for the interface (Noto if the specimen gate fails); 16 px body; ≥ 5:1 contrast in light and dark.
- Audio is the hero object: a two-lane stereo player, a transcript synced in three views, play-from-here on every quote, voice cards in three registers.
- Motion only shows the system working (ringing pulse, connect settle, card rise, diff resolve, hold-to-confirm ring, milestone ink line), with reduced-motion parity; the signature moments (first ring, launch, first verified outcome) are prototyped as rendered motion for the owner before build (IC, req-37). Three opt-in sound cues.
- Words: plain warm Indian English, Hinglish when the client writes Hinglish; "what happened · why · what you can do"; ₹ with lakh grouping and GST; ms with n, date and vantage; no "Oops", "Great news" or exclamation marks.
- Thirteen states: empty, zero, loading, failed, not measured, under-powered, sample, stale, redacted, unsaved, locked by role, vendor says, AI guess.
- One shell (IC): rail 64 or 216 px; Talk docked at 360 px, never covering the primary action; the Talk route is rail + 760 px thread + 456 px "Working on" pane; at 390 px a bottom bar of Today · Campaigns · Talk (centre mic) · Calls · More. The Operator is "VP" in v0.5; "Saarthi" (सारथी) is tested after a brand check (open decision 7).

**Screens.** 11 key screens at 1280 and 390 px, light and dark: Talk, Today, Launch card, Mission control, Call page, Agent builder, Contact timeline, Learning inbox, Number step, Wallet, Hear-it-first.

**Metrics.** 5-user task success 24/25 (1280) and 22/25 (390); SUS ≥ 80; state-integrity violations 0; LCP ≤ 2.5 s on a Fast 4G Android; audio start ≤ 300 ms; owner sign-off in ≤ 2 rounds; incumbents recorded on video at 390 px before any UI claim.

---

## 7. The object model and the architecture

### 7.1 Objects (extends `research/2026-10-20/account-phase/synthesis/vp-v1-schema.json`)

| Group | Objects |
|---|---|
| Tenant | Workspace (plan, wallet, caps, concurrency, region) · Member/Role (Owner, Builder, Operator, Compliance, Viewer) · ApiKey · AuditEvent (actor: person, named VP agent or VP Success) |
| Business | Brand (legal entity, CNAP name, DLT entity, sector) · Offering (facts, prices and dates as data; never-say list) · KnowledgeSource |
| People | Contact · Identifier · Attribute (value, authority, max age) · ConsentRecord (append-only) · Suppression · Tombstone · Source/Receipt · Audience |
| Agent | Agent · Brief · Stage · Voice · Stack · Tool (risk class) · LedgerPack · TurnPolicy · Version (immutable) · Deployment · SimCaller (hidden keys) |
| Calling | Number (series, carrier or BYO, KYC, A2P, CNAP, health) · Campaign · Attempt (precheck and rule versions, carrier code, next action) · Call (run manifest, recording, transcript, cost lines, reason, outcome, compliance trace) · Turn · FollowUp · HandOff · InboundRoute |
| Results, learning | OutcomeDefinition · OutcomeSource (webhook, CRM field, paid list, MIS file, manager confirmation) · Outcome · JudgeVersion · Calibration · Issue · Monitor · Moment · Proposal · Experiment · ShadowAA · Lesson · RevertPolicy · ApprovalEnvelope (v2) |
| Memory | Fact (quote, span, purpose, basis, tier) · Commitment · PreferenceView · MemoryPolicy · MemoryBrief · ForgetRequest |
| Money, Operator | CostLine · Reservation · Budget · Invoice (GST) · BillingMode · Thread · Plan · Action · ApprovalToken |

**Invariants (code, never prompt).** (1) One dial path: one precheck inside the claiming transaction; the tenant veto runs outside it in two phases (HV law 18). (2) One reply door before TTS (HV laws 3, 10, 25). (3) One `compile()`, must-fire rules last, budgets that throw (HV laws 1, 2, 4). (4) Immutable versions; edits never publish; the only automatic change is a conditional revert; every call carries a run manifest. (5) Consent append-only; imports never clear suppression; tombstones stop resurrection. (6) Outcomes are confirmed, not executed or unknown; unknown never auto-retried (HV law 17). (7) Identity is a contact id, never a caller ID or channel handle (HV law 15). (8) Money is INR with GST, written by the meter. (9) Row-level tenant isolation. (10) One owner per shared default.

**Relations (diagram-ready).** Workspace → Brand → Offering → KnowledgeSource · Workspace → Contact → {Identifier, Attribute, Consent, Suppression, Fact} → Attempt → Call → Turn · Agent → Version → {Brief, Stages, Stack, Tools, LedgerPack, TurnPolicy} → Deployment · Campaign → {Audience, Deployment, Numbers, OutcomeDefinition, Budget} → Attempt · Call → {CostLine, Outcome, Judge, Fact, FollowUp, Issue, Moment} · Moment → Flag → Proposal → Approval or Envelope → Experiment → Decision → Version · Thread → Plan → Action → ApprovalToken → AuditEvent.

### 7.2 The runtime

```
Client (web, phone, API, MCP)
 -> control plane: TypeScript, Postgres in India, Azure Container Apps
      registry + Operator | campaigns + dialer | intelligence | memory | meter + wallet | outbox | Scout
      -> signed call ticket (version, manifest, variables, memory brief, reservation, deadlines)
 -> voice-rt: Python asyncio, Azure Central India, >= 2 instances, never scale-to-zero
      carrier adapter (Plivo, Vobiz, Exotel) -> echo handling -> VAD + ears -> turn manager
      -> brain -> clause splitter -> reply door -> voice -> stereo recorder
      -> per-turn trace, per-second cost lines, outcome -> Postgres outbox
```
- **Adapter registry as data:** one row per kind × provider × model × region, with prices (source, date), India p50/p90 (n, date, vantage), languages, data-use default, residency, sunsets and tokens per minute per call; a field with no writer reads "not measured".
- **Quota admission:** each call reserves 13-25k TPM before dialling; live and background lanes are separate, background capped at 30% [M L8R2: a 50k-TPM deployment returned 429 on 13/35 turns].
- **Storage in India:** Azure PostgreSQL Central India unless Neon offers an India region [U]; recordings and backups in India.
- **VP-owned accounts:** a VP Google organisation and Vertex project and VP-owned keys for every provider, with the pasted credentials rotated (`risk.2026-10-20.secrets-pasted`, `risk.2026-10-20.carbonsettle-account-exposure`).

**Flows (diagram-ready).** (1) Client ⇄ Operator → registry → every module. (2) Sources → Data steward → contacts → campaign → `dial.claim()` (G1-G12) → carrier → voice-rt. (3) Memory brief and facts → `compile()` → brain → reply door → voice. (4) Call → intelligence → outcomes, issues, cards → Today; and → learning → proposal → approval → new version. (5) Every second → meter → wallet, caps, invoice; every write → audit. (6) Scout → graph inbox → VP's owner → backlog.

### 7.3 Failover (answers `open.2026-10-20.product-failover-policy`, proposed)
Tests never fall back (`rejected.2026-10-20.silent-fallback-in-tests`). At call start, a red component routes the whole call to the tenant's declared alternate stack, one they heard and approved, filed under what ran; before production that alternate must sit on a different provider. Mid-call, only a pre-declared same-voice, same-model deployment in another region; otherwise a hold line and close in her voice, pre-rendered at publish so they play even when TTS failed, then one callback, not billed. Carriers: probes every minute; new attempts move only to a declared line of the same brand, series and CNAP name, else the campaign pauses with a reason.

---

## 8. Speed and cost

### 8.1 The latency budget at the handset

| Segment | Budget p50 / p90 (ms) | Best measured | Lever |
|---|---|---|---|
| Ears final | 450 / 800 | 450 at 300 ms segmentation; 622 at 500 ms [M L8R2] | Short segmentation plus a completeness hold |
| Hold | 50 / 1,400 | 0 on complete turns | Verb-final and continuation cues |
| Brain first token | 350 / 700 | 304 ms gpt-4.1-mini South India on a 1.6k-token warm prompt (n=33) [M L8R2]; 567-641 ms on brief v2 (n=5-6, cache state unrecorded) [M LAB2, CAT] | Region pinning, cached core, short first clause |
| Voice first audio | 350 / 600 | 95 neural (warm); 425 MAI-Voice; 624 Gemini Flash-Lite TTS plus 140-360 silence [M] | Warm sockets, silence trim, acknowledgement clips |
| Phone leg | 300 / 450 | Never measured; 250-450 estimated [I] | India media edge |
| **Total** | **1,500 / 2,500**, cut-ins ≤ 5% | Server 0.8-1.04 s on fast stacks; cut-ins 15-42% on every stack [M] | The joint gate |

### 8.2 Predicted gap by preset (recomputed with brief-v2 timings, IC)

| Preset | Server gap | Handset (predicted) | Ear rating so far | Note |
|---|---|---|---|---|
| **Indic:** Sarvam Saaras + sarvam-105b + Bulbul | 0.97-1.18 s (n=9 replies) [M] | 1.2-1.6 s [C] | 6.0 with a gpt-oss brain (n=2); this stack unrated | India-hosted; trains on data unless opted out [O]; a competitor |
| **Fast:** Azure STT CI + gpt-4.1-mini SI + MAI-Voice | 1.00 s with a neural voice (n=60) [M]; with MAI unmeasured | 1.6-2.0 s [C] | MAI unrated; Azure neural voices 1.5-4.5/10 [M] | India-resident; gpt-4.1-mini retires 2027-04-14 (KC10) |
| **Natural:** Gemini ears + fast brain + Gemini 3.8 Flash-Lite TTS | 1.6-2.2 s (smoke, n≈3) [M] | 2.0-2.5 s [C] | Gemini-voice cascades 5.5-6.0 (n=2-3) | No India residency; TTS price doubles 2027-01-01 |
| **Premium Live:** Gemini 3.8 Live, text-gated | 0.8-1.6 s ungated [M] | Gated latency unmeasured | 6.0 (n=1) | Talks over callers on ~40% of turns (20/51-22/53) [M G5]; its gate needs the transcript lead-time distribution and the buffered latency, not a count |

Only Indic is predicted inside the 1.5 s handset bar today, and no stack passes the cut-in bar. The turn manager is the binding work; the default waits for the joint gate (Phase 0).

### 8.3 INR per connected minute by tier (ex-GST; provisional until re-metered)

COGS = AI + telephony 0.38-0.48 + pulse 0.03-0.07 + infra 0.03 + analysis 0.06 + memory 0.02-0.05, plus a 2% payment fee. The x1.3 column applies the SY18 persona-and-memory Monte Carlo uplift conservatively to all AI cost.

| Default stack | AI today | AI x1.3 [C] | COGS | Base the rule needs [C] |
|---|---|---|---|---|
| Indic | 1.39-1.51 [M] | 1.81-1.96 | 2.35-2.50 | 3.49 (26-31%) to 3.99 |
| Natural 2026 / 2027 | 1.56 / 1.92 [C] | 2.03 / 2.50 | 2.57 / 3.04 | 3.79 / 4.16 (no step up to 3.99 holds 25% in 2027) |
| Fast | 1.36-2.70 (MAI meter unread) | 1.77-3.51 | 2.31-4.05 | 3.49 if MAI bills like neural; above 3.99 if like HD |

**Rule (D-EC):** Base is the lowest of 2.99, 3.49 or 3.99 that keeps p50 gross margin ≥ 30% in 2026 and ≥ 25% after known 2027 changes, never reached by downgrading the voice. On today's numbers Base lands at **INR 3.49-3.99 + GST** (4.12-4.71 incl.) for Indic, or for Fast if MAI bills like a neural voice. Natural from 2027-01-01 (about 4.16) and Fast if MAI bills like HD need more than 3.99, which no step allows: if the ear picks one of them, VP keeps the voice and the owner chooses a 4.49 step or a lower 2027 margin until a cost lever lands (open decision 2). No price is printed until the default is re-metered on the India VM with brief v2, the ledger and a memory brief.

| Tier | Adds | Price ex-GST (provisional) |
|---|---|---|
| **Base: the human voice** | Ear-picked stack, brief v2 and ledger, turn presets, reply door, analysis, preference memory, fast lane, 90-day recordings, 20 concurrent calls | INR 3.49-3.99 |
| **Plus: she remembers and improves** | Relational memory, promises, cross-channel timeline, learning inbox and tests, 1-year recordings, 50 concurrent | Base + INR 0.50 |
| **Premium: personalisation, your own voice** | Deep personalisation, dedicated brand voice (INR 3.5 lakh/month; approval unverified), SSO, 99.9% SLO, named support, 100 concurrent | INR 6.49 |
| **Sector packs (IRDAI, RBI)** | An India-resident call stack, analysis model and Operator brain, at the Base margin rule; long retention at storage cost (IC: not Premium-only) | Base |
| **Premium Live** | Text-gated Gemini Live | Only after its gate; COGS / 0.65, 5 min cap |

**Fixed costs the model must carry (IC):** the included Operator brain (INR 0.48-0.60 a turn), the test budget, synthetic monitoring (INR 12-36k a month), human support and disputes. Recovery is open decision 12. **Per-outcome pricing** stays for managed design partners only, restated as a software fee per earned outcome while the tenant runs its own number and its own certified humans (`rejected.2026-10-17.managed-telemarketer`), with a never-billed 10% holdout.

### 8.4 The road to INR 2 (req-41), pre-registered
At INR 2 the AI budget is about INR 0.54 a minute at 50% margin [C SY18]. Base drops when measured COGS p50 stays under the trigger for two months, reconciled to invoices within 5%, and the voice still passes the listener panel: **2.99 at COGS ≤ 1.94; 2.49 at ≤ 1.62; 1.99 at ≤ 1.29**. Levers by evidence: gated ears (1.24 → 0.94 measured), a cached core, telephony concurrency plans near 250k min/month, speech commitments, then self-hosted Indic speech on an always-on fleet at about 1.6-2.5M min/month (`rejected.harvest.11`). Inworld (owner exclusion) and AWS (deferred) stay out.

### 8.5 Effective INR per connected minute (rate-card arithmetic, 2026-10-21, no invoice read [C])

| Call | VP Base | Sarvam PAYG | Bolna PAYG | ElevenLabs | Retell (BYO) | Vapi |
|---|---|---|---|---|---|---|
| 30 s | 3.49-3.99 | 7.40 | 5.72 | 8.2+ | 8.3+ | 12.5+ |
| 45 s | 3.49-3.99 | 5.20 | 7.63 | 8.2+ | 8.3+ | 12.5+ |
| 90 s | 3.49-3.99 | 5.07 | 5.72 | 8.2+ | 8.3+ | 12.5+ |

Sarvam Business (3.00 + 0.40) is cheaper on whole-minute calls; SquadStack (2-5) and Bolna enterprise (1.75-2) claim lower floors [V]. VP's honest claim, only after the T7 invoice audit: "the lowest effective price on short calls, per second, with caps". No price-led hero (`rejected.2026-10-17.parity-undercut`).

---

## 9. Better than every competitor, sense by sense

"Beat (paper)" means designed and unmeasured; it becomes a claim only when its proof passes.

| Sense | Best today | VP's design | Status | Proof |
|---|---|---|---|---|
| UI | ElevenLabs polish; Sarvam's Indic glyphs [O WT] | One warm Indian shell; audio as hero; 13 states; Owner and Expert views | Unproven | 5-user sessions; owner sign-off; incumbents recorded at 390 px |
| UX | Sarvam Genie runs campaigns; Retell Conductor diffs [O] | Whole tasks through tools; hash-bound approvals; receipts | Match; beat on approval safety | W10 |
| Product design | Retell flows; Sarvam's attempt split [O] | India objects plus a stages layer | Beat on India objects; flows unproven | W1, W2, T10 |
| Cost | Sarvam Business on whole minutes; SquadStack 2-5 [V] | Per-second all-in, caps, estimates, a cost ladder | Beat on 30-90 s calls only | T7, W8 |
| Speed | ElevenLabs 3% collisions at 3.75 s; Ultravox 1.54 s [M L4B] | India edge, pause-aware release, rendered openings | **Lose today** (cut-ins 15-42%) | Joint gate, then Bolna and Sarvam on one handset (W3) |
| User flow | Sarvam and Bolna rent Indian numbers in-product [O] | Browser call < 3 min; trial ring ≤ 15 min; rental in the tenant's name | **Lose today** on the first production call; fixed if terms allow | W7, W7b |
| Convenience | SquadStack's managed CSMs; Genie + UPI | Just talk; daily brief; one-tap approvals; VP Success | Match | ≥ 70% of setup by chat |
| Usability | ElevenLabs explanations; Sarvam inline fixes [O] | A reason and fix on every disabled action | Beat (paper) | W6 |
| Vibe | ElevenLabs raw voice; Sarvam's 199 Indic voices | Ear-picked voices on whole calls; honest disclosure | **Lose on raw voice**; beat on honesty | Ear ≥ 7.0; panel within 1 point of humans |
| Results | SquadStack sells outcomes [V] | Earned outcomes incl. no-developer sources | Unproven | Cost per outcome below 3 partners' desks |
| Compliance | None (0 of 8) | Category first, one dial path, A2P pack, why-allowed | Beat (paper) | W1, T3, T9 |
| Failure explanation | Sarvam structure; Vapi breadth | 34 business reasons + carrier code + action | Beat (paper) | W6 |
| Memory | Retell ships contact memory today | Quoted ledger; preferences in Base | Lose on timing; beat on design | MEM-SIM ≥ 95% |
| Learning | Retell Conductor (no statistics) | Fast lane, fixed horizons, A/A, expiry | Beat (paper) | Shadow A/A ≤ 5% |
| Languages | Sarvam: 11 Indic, Hindi 38/40 [M] | Hinglish default; 5 regional betas | **Lose to Sarvam** in v1 | W5 vs non-Indian vendors |
| Developer breadth | Vapi (custom LLM, squads, SIP); Retell 109 operations | One spec; custom-LLM endpoint (v1); generic SIP (v2) | Match on API; lose on SIP until v2 | W10 read-back |
| Support | Incumbents > 24 h [I] | Humans in IST hours < 2 h | Promise, costed | W9 |

---

## 10. How VP keeps learning from competitors, always (req-59, 60, 61)
- **Scout watches** 67 baselined URLs across the 8 deep-set vendors plus Pipecat, LiveKit, Ultravox, Ringg, Smallest, Gupshup, Plivo and Bland (`research/2026-10-20/teardown/radar/watchlist.json`): status daily; prices, changelogs, docs, OpenAPI and SDKs every Monday 06:00 IST; new entrants weekly; public pages only; a 403 reads "unreachable", never "no change".
- **Tripwires tied to hypotheses:** an India region (W3); INR or GST billing (W8); TRAI, DLT, A2P or 1600 in docs (W1); a Hinglish mode (W4, W5); memory GA or a DNC-aware campaigns object; spend caps by key or signed webhooks (W8, W10); a new Indian telephony integration (W7); an all-in price ≤ INR 4; funding ≥ USD 5M; a self-serve SquadStack.
- **Measured, not read:** the same call battery runs on competitors quarterly and on any tripwire; a person re-walks dashboards monthly on authorised trials (`decision.2026-10-20.teardown-lines`).
- **Stored, never re-derived:** each change becomes a graded `context/inbox/*.json` entry; a weekly Scout card and monthly owner digest; a market price index; the W1-W10 scoreboard; new models feed the adapter registry. A vendor claim never enters the graph as observed. Buyers too: 10-15 interviews now, then a quarterly design-partner review.

---

## 11. Roadmap

Dates are target windows [I], not commitments; no staffing plan exists yet (open decision 14).

### Phase 0: gates before anything is sold (now to about 2026-11-16)

| By | Gate | Closes |
|---|---|---|
| 2026-10-25 | IRDAI commission-cap consultation closes; re-run the renewal model if adopted | KC9 |
| 10-29 / 11-13 | 10-15 buyer interviews, interim then final (none has run) | KC1-KC3; persona, presets, tiers |
| 2026-10-30 | Carrier quote round (Plivo, Vobiz, Exotel, Tata, Jio, Ozonetel): 1600 price and AI streaming, CNAP on SIP, provisioning time, **rental in the tenant's name inside VP** | KC5; open decision 4 |
| 2026-10-30 | An India-resident fast model deployable on VP's own subscription | KC10 |
| ~2026-11-06 | Turn-manager redesign; stereo handset battery (≥ 30 clean turns per stack per carrier on Jio, Airtel, Vi); round-2 ear ratings on whole calls (≥ 3 testers per stack); re-meter the candidates with brief v2; agenda completion per simulated call against hidden keys; reply-door predicate battery | KC6; open decisions 1, 2 |
| ~2026-11-13 | Counsel: KC8, sender status of software on bring-your-own lines, IT Rules audio disclosure, re-billing telephony | KC8; opening spec; billing mode |
| 2026-11-14 | VP's own DLT registration and trial-line A2P declaration; credentials rotated; a VP-owned Google organisation and Vertex project; the A2P export built | W7 after 11-17; v0.5 entry |
| 2026-11-16 | Owner decision on the Plivo recharge (trial credit expires) | Handset battery |

Also: the disclosure placement test (2-3 placements on the listener panel; never an undisclosed arm) and W7 measured on Bolna and Sarvam with a stopwatch.

### v0.5: one real journey (target: first partner calls in December 2026 [I])
- **Scope:** hear-it-first → sign-up → Talk thread (about 25 core tools) → voice by ear → browser call → CSV intake → ring my phone → one service campaign (category, window, ladder, cap, canary) → dial gate → reply door (disclosure, denial, crisis, numbers, OTP and payment, hang-up guard) → call page (recording, transcript, reason and carrier code, cost lines, why-allowed) → a simple Today → wallet with caps. One non-BFSI preset, one carrier path, one stack (the best that passes the joint gate).
- **Exit:** W1 graded on carrier CDRs; W2 ≥ 48/50; W6 < 60 s; W7 ≤ 15 min; the joint speed gate at the handset; a voice-rt load test; 30 days of zero-ring audits; 3 partners with an outcome source wired (no-developer sources count); a penetration test passed.

### v1: parity made better, India-native (target Q1 2027 [I])
- **Scope:** the full registry, A0-A3 and the activity ledger; the 11 key screens in both themes; Owner and Expert views; all four presets (IRDAI and RBI after KC5/KC8); stages and agent hand-off; inbound with callback continuity; follow-through and outcome watches; full intelligence (calibrated judges, 20 monitors, Ask VP, export, signed webhooks, the first partner's CRM); preference memory in Base; the fast lane; the full trust core; both billing modes; Scout; Hindi and Indian English GA plus five regional betas; a custom-LLM endpoint.
- **Why:** the 21 must-be items plus A-D [WT §5]; 0 of 6 dashboards ship the India layer [O]; Retell already ships contact memory.
- **Exit:** W1, W2, W6, W7, W8 (T7) and W10 pass; the joint gate holds on every GA preset; 5-user sessions 24/25 and 22/25; 3+ partners with cost per outcome below their desk.

### v2: she remembers and improves, provably (target Q2 2027 [I])
- **Scope:** relational memory across voice, WhatsApp, SMS and email; promises feeding openers; app events; My Data for the person called (before DPDP core duties, ~2027-05-13); the learning inbox, tests, shadow A/A, expiry and "how she changed"; the standing approval envelope if approved; predictions as observed call ordering; consented leads on 140 numbers after counsel; the full RBI pack (from 2027-01-01); generic SIP; WhatsApp conversational agents; carrier failover; regional languages GA; a dedicated brand voice; Premium Live only if its gate passes.
- **Exit:** memory recall ≥ 95%, ≤ 1 in 20 preferences ignored; A/A false winners ≤ 5% at 3 partners; one proved change per L2 partner; p50 still inside the speed gate.

### v3: learns at scale, costs less (volume-triggered)
Bandits and guarded ramps at ≥ 1,000 connected calls a day on one script; consented cross-tenant aggregates (≥ 10 tenants, contract clause, never WhatsApp data); the INR 2.49 and 1.99 steps when measured cost crosses the triggers; self-hosted Indic speech at ~1.6-2.5M min/month; an India-only processing option for BFSI; opt-in dialect styles; the command centre (req-18, 57) on the same registry; Telegram on demand.

**Evidence still needed, in order:** live handset calls on VP and two incumbents; whole-call ear ratings; re-metered costs and first invoices; KC5 carrier answers; counsel; buyer interviews; 5-user usability sessions against incumbents recorded at 1280 and 390 px; the disclosure placement test; the T10 branching task; three pilots with verified outcomes.

---

## 12. Metrics

**Client north star:** cost per earned outcome at a human-quality conversation. An outcome is earned in code (a payment or renewal event, a promise with date and amount, a confirmed booking, or a manager's confirmation at a lower grade), compared with the client's own desk and, once powered, a never-billed holdout.

**VP north star (IC):** verified earned outcomes per week across tenants. Connected minutes are a revenue metric, not the north star, because rewarding minutes fights "never waste their time".

| Group | Metric | Target |
|---|---|---|
| Proof | W1-W10 plus W7b (first production call, KYC time included) | Each pass bar in WIN |
| Conversation | Handset gap p50/p90; cut-ins; elderly pause; short replies; language hold; AI denials | ≤ 1.5 s / 2.5 s; ≤ 5%; ≥ 10/12; ≥ 90%; ≥ 95%; 0 |
| Voice | Whole-call ear rating; panel against human references | ≥ 7.0 (≥ 3 testers); within 1 point |
| Trust | Rings to suppressed or out-of-window contacts; promotional lines on service calls; disclosure heard | 0; 0; ≥ 99.5% |
| Results | Campaigns with a verified outcome source by day 30; cost per outcome vs desk | ≥ 60%; below |
| Time to value | Browser call; trial ring; launch-ready; first production call | < 3 min; ≤ 15 min; 30-60 min active; same day after KYC |
| Money | Invoice vs rate card; meter vs bills; gross margin p50 | ≤ 1%; ≤ 5%; ≥ 30% |
| Learning, memory | Shadow A/A false winners; gate escapes; recall; preferences ignored | ≤ 5%; 0; ≥ 95%; ≤ 1 in 20 |
| UX, reliability | Task success; SUS; state-integrity violations; availability; detect/notify | 24/25 and 22/25; ≥ 80; 0; 99.5% (v1); ≤ 5 / 15 min |
| Support | First human reply in IST hours | < 2 h |

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Turn-taking never wins (15-42% cut-ins today) | The binding v0.5 gate; the turn manager is built first; no speed claim before the handset battery |
| The owner's favourite voice is the slow one | Whole-call ratings at the handset decide; Natural stays opt-in with its wait shown |
| KC5 (1600 streaming) or KC8 (solicitation) fails | Non-BFSI partners first; BFSI presets gated; VP stays software the intermediary operates |
| Carriers refuse rental inside VP | Bring-your-own with guided forms and VP Success; track the unassisted share |
| Google dependency (quota, 2027 price doubling, shutdowns) | VP-owned organisation, measured quotas, a cross-provider alternate, MAI and Sarvam kept warm |
| SMB outcomes cannot be verified | No-developer outcome sources; interim metrics; "AI guess" labels |
| Price pressure from Bolna or Sarvam | Compete on honesty, outcomes and the India layer; cut price only on measured cost |
| A sales call mislabelled as service | Brief check plus a live promotion fence; the tenant stays the Sender |
| Classifier predicates block or slow good replies | Per-predicate battery; whole-reply holds only on risky turns |
| Scammers abuse self-serve voice | Know-your-business, payment-framing lint, verified link domains, the verify page |
| Memory feels creepy or leaks on a shared phone | Knowledge check first; minors excluded; play-and-forget controls |
| Approval fatigue | Owner view; ≤ 3 learning cards a day; the v2 envelope |
| Scope creep (`rejected.harvest.19`) | The v0.5 slice and its exit bars first |
| ElevenLabs campaigns or a self-serve SquadStack | Scout tripwires; ship v0.5 before ~2027-01-31 |
| Pasted secrets; a founder's other company account on the voice path | Rotation and VP-owned accounts are v0.5 entry conditions |

---

## 14. Open decisions for the owner (recommendation first; detail in `open_decisions`)

1. **Default stack and the speed-voice rule:** the ear judges whole calls at the handset; the default is the best-rated stack that passes the joint gate; Natural stays opt-in with its wait shown until it passes.
2. **Base price and unit:** per connected second, all-in display; Base by the margin rule after re-metering (INR 3.49-3.99 today); if the ear's pick needs more than 3.99, keep the voice and choose a 4.49 step or a lower 2027 margin; sign that v1 launches above INR 2 and reaches it by the ladder; supersede `rejected.2026-10-17.per-minute-launch` for self-serve.
3. **First design partners:** at least one non-BFSI partner in v0.5; insurance and lending after KC5 and KC8.
4. **Numbers inside VP:** ask for rental in the tenant's name in the quote round; bring-your-own second.
5. **The self-learning promise:** the bounded standing approval envelope in v2, with "improves itself within limits you set, and proves what it changes".
6. **Preference memory:** Base, late v1, behind MEM-SIM and the latency A/B.
7. **The Operator's name:** "VP" for v0.5; test "Saarthi" after a brand check.
8. **Production failover:** §7.3, with a cross-provider alternate before production.
9. **Runtime split:** Python voice-rt plus a TypeScript control plane; reverse if a TypeScript port matches battery latency with less operations work.
10. **Regional languages:** five betas in v1 on the Indic stack, each behind its own safety gate.
11. **Benchmark voices:** add ElevenLabs and Cartesia to the round-2 whole-call ear test so "by ear" means against the best.
12. **Fixed-cost recovery:** INR 500 lifetime trial per verified phone; a credited INR 1,000 first top-up; Operator fair use scaled to spend; no seat or platform fee.
13. **Spend now:** the Plivo recharge, VP's DLT registration, a VP-owned Google organisation and counsel, before 2026-11-14.
14. **Who builds v0.5:** name owners for voice-rt, control plane and design, with a 6-8 week target [I].
15. **Assisted onboarding:** VP Success included for the first 10-20 tenants, through the same tools.
16. **The opening spec:** approve the one spec in §6.2 and test 2-3 placements on the listener panel; wording and placement may change, presence never; no undisclosed arm.

---

## Appendix A. Every owner requirement, and where it is handled

✓ honoured in design · ◐ partly or phased (why) · ⚑ owner decision.

| Req | Where | Status |
|---|---|---|
| 01-07, 09 the human, expressive Hinglish voice; real conversation; she ends the call | §6.2, §6.9, §8.3 rule | ✓; proof needs round 2 and the panel |
| 08 brain better than gpt-oss | §6.2 | ◐ the judged-best brain is too slow live; a second brain off the critical path (v2) |
| 10 regional language and accent | §6.2 | ◐ five betas in v1; dialect opt-in only |
| 11 faster than competitors | §8; defining decision 4 | ◐ not true today; joint gate first ⚑ 1 |
| 12, 32 continuity and memory | §6.5 | ◐ preferences v1; relational v2 |
| 13-17 LLM-native, agents do the work, brain choice, explain then do | §5, §6.1 | ✓; carrier and KYC eased by in-product rental and VP Success |
| 18, 57 command centre, CRM layer | §11 v3 | ◐ deferred by the owner |
| 19 pre-sale and post-sale, incl. predictions | §3, §6.4 | ◐ post-sale first; consented leads v2; surveys after counsel |
| 20-22, 24-26 end to end, whole view, every recording, every case, deep AI analysis | §4, §6.3, §6.4 | ✓ |
| 23 feedback loop | §11 v2 | ◐ after counsel |
| 27 show improvement | §6.6 | ✓ v2, with intervals |
| 28-31 any data, omni-channel, company context, app data | §6.5 | ◐ files, feeds, CRM, PDFs v1; channels and app events v2 |
| 33 individuals and groups | §6.5-6.6 | ◐ per tenant; consented aggregates v3 |
| 34, 35 self-learning, harness2 | §5, §6.6 | ◐ fast lane v1; proofs v2 ⚑ 5 |
| 36 higher tiers | §8.3 | ✓ |
| 37, 38, 40 design and animation, better in every sense, visual | §6.9, §9 | ◐ §9 shows where VP loses today |
| 39 onboard in 30-60 min | §4.6 | ◐ 10-digit yes; 1600 KYC takes days |
| 41 about INR 2 | §8.4 | ◐ not at launch ⚑ 2 |
| 42 in-house, no early self-hosting | §7.2, §8.4 | ✓ |
| 43, 44 cheaper and better, clear charging | §6.8, §8 | ◐ cheapest on short calls only |
| 45, 46 real value, every client requirement | §6.4, §12 | ◐ unproven until pilots |
| 47-49 disclosure, no manipulation, crisis lines, test integrity | §6.2, §6.7, §7.3 | ✓ |
| 50, 51 self-serve, parity floor | §6.3, §9 | ◐ generic SIP, WhatsApp agents v2 |
| 52-54 pick the stack, Gemini leaning, provider-open | §6.2, §8.2 | ✓ ⚑ 1 |
| 55, 56 friends test on phones; Indian businesses | §6.7, §3 | ✓ |
| 58-61 frontier; learn from competitors; store everything | §6, §10, INT | ✓ |
| 62-64 working method | this integration | ✓ |
| 65, 66 operator authority; offering, outcome, audience named | §5, §4.6 | ✓ |
| 67 branding, auth, web, Telegram, WhatsApp | §6.7, §11 | ◐ web v1; WhatsApp agents v2; Telegram v3 |
| 68 review-first AI UX | §6.1 | ✓ kept light in Owner view |

---

## Appendix B. One owner for every shared default

| Default | Conflict found | Resolved | Owner |
|---|---|---|---|
| Disclosure placement and repeats | Four placements across modules | The §6.2 opening spec; repeat only when unheard | voice; trust predicates |
| Recording notice | Overloaded turn 2 | Her next content turn, where a sector pack requires it | trust |
| Cross-midnight windows | Allowed vs quiet hours 22:00-07:00 | Refused for every category | trust |
| Person's requested time | Inside the band vs 07:00-22:00 | Up to 07:00-22:00 for service; RBI pack 08:00-19:00 | trust |
| API key cap | INR 2,000 vs 5,000 a day | INR 2,000 a day, 20,000 a month | economics |
| Trial rings | 5 a day vs 20 per number vs 10 | 5 numbers; 10 rings per number a day; 30 across workspaces | trust |
| Free trial | INR 200 a day for 14 days + 300 | INR 500 lifetime per verified phone | economics |
| Predial timeout | 800 vs 1,500 ms | 800 ms, two-phase, fail closed | campaigns |
| Webhook retries | 8 in 24 h vs 72 h | 72 h exponential; 30-day replay | economics |
| Preference memory tier | Base vs Plus | Preferences Base; relational Plus | economics |
| Fast-lane revert | A3 vs "publish needs A2" | An explicit A3 verb with three conditions | learning; registry |
| Operator name; shell sizes | VP vs Saarthi; 224/400 vs 216/360 | "VP" in v0.5; the design-language shell | design-language |
| Concurrency | Base 10 vs Retell's free 20 | Base 20, Plus 50, Premium 100 | economics |
| Plivo pulse | 30 vs 60 s | Plan on 60 s until the first invoice | economics |
| Live talk-over | 42% vs 20/51 | About 40% (20/51-22/53) | voice |
| Learning test budget | 2 cycles vs INR 200 a day | 1 cycle a day (2 on Plus at INR 400) | learning |
| Recordings retention | 90 days vs IRDAI 10-year call records | By tier (Base 90 days, Plus 1 year); sector packs raise the floor, at storage cost | trust |

A CI check fails when any `research/2026-10-21/blueprint/data/*-defaults.json` disagrees with this table; INT holds the machine-readable copy.
