# Workspace: "Talk to VP", the Operator, onboarding, Today and the app shell

**Module id:** workspace · **Status:** proposed design, 2026-10-21 (`directive.2026-10-21.blueprint-end-to-end`) · **Grades:** [M] measured by us · [C] computed · [O] observed · [V] vendor-claimed · [I] inferred · [U] unknown.

**Paths:**
- WT = `research/2026-10-21/walkthroughs/SYNTHESIS.md`
- wt-<vendor> = `research/2026-10-21/walkthroughs/<vendor>/` (report.md, claims.json)
- TS = `research/2026-10-20/teardown/SYNTHESIS.md`
- T-<vendor> = `research/2026-10-20/teardown/<vendor>/claims.json`
- AS = `research/2026-10-20/account-phase/SYNTHESIS.md`
- L6 = `research/2026-10-17/lanes/l6-self-learning/report.md`
- HV = `docs/harvest/SYNTHESIS.md`
- REG = `data/blueprint/workspace-tool-registry.json`, written with this module: 80 tools, 7 risk classes, 10 card types, 21 activation events

**The module in one line.** The client talks to one partner called VP, typed or spoken, in Hinglish or English. VP plans and does every draft and test itself. Each real-world change appears as a card with a diff, a price and a risk, and VP acts only on a human tap that code verifies. Every card and every chat answer is a view of an object with a URL, so the same work can be done by clicking, by talking or by API.

---

## 0. The seven decisions

| # | Decision | Answer |
|---|---|---|
| D1 | Thread and cards | Threads hold messages and references; configuration lives on objects. Cards: 8 types (plan, diff, launch, call, chart, approval, issue, receipt) plus 2 auxiliary (question, progress). A plan runs its drafts and tests and stops at each A2 step. Approval is a tap bound to an args hash. Undo says what it cannot undo. Input is push-to-talk Hinglish with a "heard as" chip. VP speaks a summary of 25 words or fewer, in Talk mode only (v1); hands-free comes in v2 |
| D2 | Tool registry | One spec generates the API, SDK, MCP and the Operator's tools: 80 tools in 7 risk classes (REG). Read runs automatically; draft and test are A1; external, spend, destructive and policy are capped at A2. A3 is only for verbs that lower risk or spend. Roles are checked in code. A "What VP did" ledger records every action |
| D3 | Onboarding | Hear it → sign up (1 field) → say the job → company context in parallel → voice by ear → browser call → list → ring your own phone → readiness rail → launch card. Browser call under 3 min; Indian ring in 15 min or less; launch-ready in 30-60 min of active time |
| D4 | Today | A since-you-left brief; a Needs-you queue in fixed priority order, capped at 7; live campaigns; money; one next action. Every empty state teaches one action |
| D5 | Shell | An 8-item rail; a page-aware docked panel that never covers content; deep links everywhere; page edits echoed into the thread; on phone, a bottom bar with Talk in the centre |
| D6 | Operator brain (req-16) | 3-5 curated brains, each showing measured India latency, ₹ per turn, region and an Operator-bench score. The brain never changes what is allowed |
| D7 | Operator conduct | Enforced in code: at most one question per turn, and only one that changes the call; no number without a tool source; show the page when unsure; reply in the client's language; never say "done" before a receipt |

---

## 1. Benchmark: the best of each sub-area and where each falls short

| Sub-area | Best competitor and its best version | Where it falls short | Evidence |
|---|---|---|---|
| Chat-first creation | **Sarvam Genie.** Prompt-box hero ("What should your voice agent do?") with India templates. Genie is docked beside every builder tab. It builds agents, puts one live on a number, test-calls your phone, creates, pauses and resumes campaigns, and analyses calls [O] | No REST authoring (MCP only). Its demo agent claimed to be human 6/6 [M]. No save control or unsaved marker. A what's-new modal opens first. Output quality [U] | T-sarvam SAR-03, SAR-15, SAR-53; wt-sarvam sarvam-01/02/03 |
| Copilot change control | **Retell Conductor.** Proposes edits as per-setting diffs a human accepts; turns failed calls into simulation tests; page-aware chips ("Filter failed calls") [O] | Paid per message: 0.5/1/3 credits at USD 0.20 per credit after 30 per user and 200 per workspace per day, so INR 9.5-57 a message [C]. US/CA numbers only. No India layer to set up | T-retell RET-03, RET-58; wt-retell 41, 22 |
| Branch and merge | **ElevenLabs Architect.** Investigates, edits on a branch, writes and runs tests, opens a merge proposal; hold-to-talk voice input; a go-live checklist reading "0 of 10 ready" [O] | Alpha, "free through October 2026", no later price. A person merges. No scheduled work. Keys and billing refused to an API key. Publish greyed with no reason | T-elevenlabs EL-03; wt-elevenlabs wt-elevenlabs-38, 38-agent-builder |
| Copilot reach | **Vapi Composer.** In every page header; Build/Debug/Analyze/Test modes; an "Ask for approval" switch [O] | No REST surface. MCP covers 4 resource families. "Bypass approvals" can publish with no pause. A menu click published a tool. The welcome wall repeats | T-vapi VAP-61; account-phase AP-10/60; wt-vapi 03, 57, 01 |
| Read and write over the account | **Bolna Ask Bolna.** Reads state and acts ("Create a SIP trunk for Twilio") [O] | Beta. Never seen building an agent end to end. Two banners take about 90 of 720 px. No checklist. The only test is a phone call to a verified number | wt-bolna 38, [41], 01 |
| First-run guidance | **Retell.** A 7-step Getting-started list with locked dependent steps and a preview per step [O] | Its tour ("Wait for the test panel to finish loading") sits on every page. The checklist covers the flow canvas. Create defaults to the harder agent type | wt-retell 71, 41, 43, 76, 80, 03 |
| Steps to a browser-testable agent | Vapi: 3 steps and 1 field. Retell: about 4 clicks and 0 fields. ElevenLabs: 4 clicks and 1 field. Sarvam: 3 actions and 1 field [I] | None was timed with a human. None reaches a ring on an Indian line [O] | WT §2.1, finding 4 |
| Activation measurement | **Sarvam.** 700 events, 77 tagged aha, setup or habit [O] | Session replay configured to a US host, inputs unmasked [O/I] | SAR-04, SAR-63 |
| Home / daily view | Nobody ships a daily brief. Retell's Home shows Conductor plus the checklist [O] | No "since you left", no approval queue, no money view | wt-retell 71 |
| Shell coherence | **ElevenLabs.** Grouped sidebar plus Cmd-K [O] | The rail collapses to unlabelled icons. Exotel runs three shells [O] | wt-elevenlabs-04; WT §4.2 |
| Disabled states | **Sarvam** shows the fix inline ("Commit version"); **Bolna** says what unlocks a greyed field [O] | Vapi Next and Retell Send are disabled with no reason [O] | WT §4.1/4.2 |

**What all five copilots lack** [O/I]: each sits beside a form-first dashboard instead of being the front door. None of them:
- binds an approval to the exact change;
- reports what it did while you were away;
- shows its own brain, cost or speed;
- keeps its numbers honest by construction;
- answers aloud;
- runs an India go-live path (consent, DND, series, A2P, KYC timer; WT finding 1).

Chat setup alone is parity, not a wedge: 5 of 6 dashboards ship a copilot (WT finding 8; `open.2026-10-20.parity-floor-vs-wedge`).

**Honest limits.** We never ran any of these copilots, so their output quality is [U]. Sarvam Genie is the nearest to W10's kill bar. If Genie completes T2-T6 without the dashboard, a chat-run product stops being VP's wedge. VP must then win on what the chat sets up: rows correct, windows refused, failures explained.

---

## 2. The contract this module enforces in code

1. **Chat never holds configuration.** "Always call before 7 pm" becomes a policy diff, not a remembered instruction. The Operator keeps only presentation preferences, each with its source message (§12).
2. **Parity, one registry.** Every page action is one tool, and every Operator action has a page. CI fails if a page action has no tool or a tool has no page route (REG `page` field).
3. **No menu or dropdown click creates, saves or publishes.** Only explicit labelled actions or approved cards create anything; drafts show an unsaved marker (`decision.2026-10-21.wt-synthesis-state-integrity`).
4. **Propose, then confirm.** A2 actions run only with an approval token that the server mints from a human tap in an authenticated session. The token is bound to the args hash, the object version, the approver and the role. Model text such as "approved" or "haan kar do" is ignored (HV law 12; `rejected.harvest.04`).
5. **One truth for numbers.** Every number in a card is a metric reference {query, value, n, as_of}. Operator prose must pass the numeric-provenance predicate (§3.4).
6. **Unknown fields are refused** with 422, and every write is read back. A silent drop is a bug (P7; AS XS-07/08).
7. **Every disabled action names its reason and its fix inline.** A tooltip alone does not count, because phones have no hover.
8. **Outcomes are confirmed, not_executed or unknown.** Unknown is never auto-retried (HV law 17), and the Operator never says "done" on the strength of an attempt.

---

## 3. The Operator: how it works

### 3.1 Harness (the model chooses, code enforces; HV laws 5 and 9)
Each turn:
1. One Operator `compile()` assembles the context.
2. The brain returns a typed Plan: steps, each a tool id plus args.
3. Code validates each step:
   - the schema, refusing unknown fields;
   - that the user's role allows the tool;
   - the risk class and its autonomy ceiling;
   - args taken from untrusted data blocks, which are flagged (for example a phone number inside a CSV comment).
4. Code executes the read, draft and test steps inside the test budget, and stops with a card at each A2 step.

Guard actions at A3 (pause on breach, stop at cap) run in engines with no model in the loop, so they keep working when the model is down.

### 3.2 Operator compile (HV laws 1-4, 7, 13)
Fixed order:
1. Conduct core: shapes, byte-stable so it can be cached.
2. Tool digest: only the tools the role and page allow.
3. Workspace snapshot, from queries.
4. Page context: object, version, filters.
5. Thread summary plus the last 12 messages.
6. Uploads and fetched pages, as delimited data blocks with an ingest-time instruction detector.
7. Must-fire conduct rules, last.

The caller's clock (IST) is passed in. The budget is 24k tokens (proposed). On overflow the compile throws, the summary is recompacted deterministically and the turn retries, so nothing is silently truncated. Every action stores an **operator manifest**: brain, region, prompt hash, registry version.

### 3.3 Delegation
The Operator is the only voice the client hears. It delegates through the same tools to:
- Strategist: the plan
- Brief writer: brief and diff
- Data steward: mapping and receipt
- Test pilot: simulations
- Line keeper: numbers and KYC
- Compliance guard: checks
- Treasurer: estimates
- Call analyst: answers with quotes

Each sub-agent's work shows in the card footer ("by Data steward · 4.1 s · ₹0.38") and in the ledger.

### 3.4 Conduct as predicates (the client just talks and is never interrogated)
| Rule | Enforcement in code |
|---|---|
| Ask only what changes the call | A question card must name the field it fills (`field_ref`). That field must be needed by the next action, or change compile output, dial policy or price. At most 1 question per turn and 5 before the first browser call. Where a default exists, VP states it instead of asking ("DD/MM maan raha hoon, badalna ho to tap karein") |
| Never invent a number | Every digit run, ₹ amount, percentage or date must match this turn's tool outputs or the client's message, after normalising lakh, crore and Devanagari numerals. A miss gets one redraft; a second miss replaces the number with a link to its page (HV law 11) |
| Show the page when unsure | Data no tool returned becomes an "Open filtered view" card (/calls?campaign=c_8f2&outcome=failed&city=Pune), not prose from memory |
| The client's language | Language and script are detected per message and mirrored; ₹1,24,000 and "2.4 lakh"; IST |
| Short, result first | Prose of 60 words or fewer; cards carry the detail; shapes, not lines (HV law 2) |
| Honest | Says what it did and did not do. Never upsells: a plan change is offered only when a cap blocks a request, with the price |

### 3.5 Voice input and answering aloud
- **Push-to-talk in every composer.** On desktop hold the mic or Space; on phone, the centre Talk button. A partial transcript shows while the client speaks, and the message sends on release.
- **The ear** is picked from the call-stack catalogue on 200 synthetic Hinglish commands, graded against keys.
- **"Heard as" chip.** The message shows the transcript with entities highlighted ("kal 11 baje" → 22 Oct 11:00 IST); one tap edits it. Every number the Operator uses appears again in the card, because ASR fabricates on silence (HV law 27). Approval is always a tap.
- **Answering aloud, only in Talk mode.** Off by default on desktop; offered on phone.
  - v1 speaks one summary line of 25 words or fewer in the workspace's VP voice, about ₹0.1 a reply [I]. It passes the numeric check before TTS.
  - v2 is hands-free with barge-in, plus a spoken or WhatsApp daily brief (with consent).

---

## 4. Threads and cards

### 4.1 Threads
- Every workspace has a General thread.
- Opening the panel on an object starts or resumes that object's thread. A campaign's thread becomes its decision log: every plan, approval, echo and receipt in one place.
- Threads can be searched and deep-linked (/talk/t_41#m_7). Messages carry attachments (CSV, PDF, URL, audio).
- A thread never holds a setting: the setting is in its object.

### 4.2 Cards
| Card | Shows | Main action |
|---|---|---|
| plan | Ordered steps with a risk chip each; ₹ and time estimates; which steps run now and which wait | Edit by talking; steps run on their own up to A2 |
| diff | Per-field before/after on a version, with the reason and source for each | Accept all or some; Test this |
| launch | Who (receipt counts); when (local window, pace, finish); a 20 s sample; checks; all-in ₹ range and cap; outcome range | Hold to launch (A2) |
| call | Player; 3-line summary; outcome with reason and carrier code; judges; ₹ | Play from here; make a test |
| chart | A named query with n and as-of time | Open in Insights |
| approval | Spend, policy or delete: what, why, impact, ₹, approver, expiry | Approve or decline (A2) |
| issue | Severity, cause, calls impacted, first seen, suggested fix | Open the fix diff |
| receipt | What was done, by which agent; confirmed, not_executed or unknown; ₹ | Undo, stating its limits |
| question | One field, with VP's default | Use the default, or pick |
| progress | Import, test suite or KYC timer | None: it never says "done" before a receipt |

**Provenance.** Every card carries one collapsed provenance line ("from your message · import r_19 · test s_6") that opens with one tap (req-68).

**States.** proposed → running → done | failed | not_executed | unknown, plus stale, expired and undone. Transitions animate in 200 ms, and colour is never the only cue.

### 4.3 Plan lifecycle (worked example: "ye CSV hai, renewal reminders bhej do")
1. **Plan card** with 7 steps:
   1. import and map (Draft)
   2. audience (Draft)
   3. renewal brief from the template (Draft)
   4. six simulated callers (Test, ₹12)
   5. confirm the number (Read)
   6. estimate (Read)
   7. launch (Reaches people + Spends ₹)

   The footer reads "VP will do 1-6 now; 7 waits for you". Steps 1-6 run at once (A1). If a question is needed, it appears inline ("Due date: DD/MM?").
2. **Receipts** collapse into one line per step; failures expand with the cause and the fix.
3. **Launch card** (A2): who, when, what she says (20 s sample), checks, money, outcome range. Hold for 1.2 s to launch. A user without the role sees "Request approval from Priya (Owner)", which goes to Priya's Needs-you queue.
4. **After launch:** a receipt reads "Undo = stop new dials; calls already placed stay (0 so far)", then live progress follows in the campaign thread.

### 4.4 Approval mechanics (defaults; values proposed)
| Item | Default |
|---|---|
| Gesture | Hold-to-confirm for 1.2 s on every A2 card; Enter alone never approves |
| Re-auth (passkey or OTP) | Policy, destructive, API keys; launch with an estimate above ₹50,000 or above 10,000 contacts; top-up above ₹50,000; cap raised above 2x |
| Binding | Token = hash(args) + object version + approver + role; valid for 10 min after the tap |
| Stale | Any change to an input version re-renders the card with a diff of what changed; launch estimates refresh after 2 h; cards expire after 24 h |
| Batch | "Approve plan" approves every A2 step listed under one hash; each external step is named on the card |

### 4.5 Undo, said plainly
| Class | Undo |
|---|---|
| draft | Restore any earlier version; nothing has reached anyone |
| test | Nothing to undo; the cost shows on the receipt |
| external | Stops what is pending (dials, follow-ups) and says exactly what already happened ("37 calls placed, 4 WhatsApp sent") |
| spend | Not reversible in product; refund through human support (stated before approval) |
| destructive | Soft delete for 30 days, then purge; restore from the ledger |
| policy | Revert creates a new policy version; the audit keeps both |

---

## 5. Tool registry, autonomy and the ledger

| Class | Examples (REG) | Autonomy | Minimum role |
|---|---|---|---|
| read | call.search, campaign.estimate, call.explain | automatic | Viewer (PII scrubbed) |
| draft | agent.create, brief.edit, source.map, campaign.draft | A1 (the workspace may lower it to A0) | Builder / Operator |
| test | test.simulate, test.browser_call, test.ring_member_phone | A1 inside the test budget (₹200/day, proposed) | Builder |
| external | campaign.launch, version.publish, call.place_single, live.whisper | A2; A3 only for pause, stop, suppress, narrow window | Operator |
| spend | wallet.topup, number.rent, cap.raise, operator.brain.set | A2; A3 only to stop at a cap or lower a cap | Owner (Operator inside budget) |
| destructive | fact.forget, dpdp.request.execute | A2 plus re-auth; A3 only for the person's own request | Owner / Compliance |
| policy | policy.window.set, contact.unsuppress, member.role.set, integration.connect | A2 by Compliance or Owner plus re-auth | Compliance / Owner |

Rules:
- A workspace can only lower its autonomy ("Ask before drafts" = A0). The ceilings are constants in code.
- The Operator acts with the user's role and never more. `live.takeover` is human-only.
- `call.place_single` and `campaign.launch` both pass the one dial path (invariant 1; `rejected.harvest.07`).
- **The "What VP did" ledger** (Settings → Activity) records, per action:
  - time, and the agent or person;
  - tool, object link, args digest;
  - class, autonomy used, and the approver (or, for A3, the policy);
  - ₹, outcome, undo, operator manifest.

  It can be filtered, exported and deep-linked. Today summarises it: "VP did 14 things: 9 drafts, 3 tests, 2 guarded pauses".

---

## 6. Onboarding, step by step

| Step | Client sees and does | VP's agents do | Client approves | Target |
|---|---|---|---|---|
| 0 Hear it | A public page with one orb, "Talk to VP". A Hinglish VP agent says once, lightly, that it is an AI, asks about the business, and plays "how your customer hears it" in 3 voices | Operator (public, session-capped, frozen snapshot; `asset.se-live.public-deployment-boundary-talk-chat`) | "Save this to start my setup" (otherwise the transcript is dropped after 30 min) | first audio ≤ 2 s after mic permission |
| 1 Sign up | Google or phone OTP, then business name. No card, no welcome wall | Workspace created with bounded defaults (§10) | - | ≤ 60 s |
| 2 Say the job | A full-height thread. The composer reads "Kaunsi calls karwani hain?" with 4 chips (renewal reminder, pre-due EMI, appointment reminder, onboarding follow-up) and "Kuch aur". Mic ready | Strategist classifies job and category (service) and drafts the OutcomeDefinition | Plan card (drafts run on their own) | ≤ 60 s |
| 3 Context (in parallel) | "Website ya brochure?" (skippable). The Facts card arrives after the first call | Brief writer extracts facts, each with a quoted span and source; customer rows never enter company knowledge | Approve or strike each fact; only approved facts reach the Offering | 2-5 min, off the critical path |
| 4 Voice by ear | Voice card: 3 voices × 1 Hinglish line using the business's name and job; register chips (warm · crisp · respectful-elderly); India p50 and ₹/min on each row | Brief writer proposes a register from the job | Pick by ear (draft) | ≤ 60 s |
| 5 Talk to your agent | Docked browser call: she calls "you" as a customer labelled "Sample customer (made up)", with live captions and disclosure once. Afterwards: "Kaisi lagi?" reactions, plus tweaks by talking ("thoda slow", "discount mat bolna") | Test pilot runs the call; Brief writer turns tweaks into diffs; re-test in one tap | Diff cards (draft, automatic) | **call starts < 3 min from sign-up** |
| 6 Bring the list | Drop a CSV, Excel file or Sheet, paste, or connect a CRM. The CSV contract shows before upload, then a mapping preview and a receipt with a reason per row; one question at most | Data steward: E.164, dedupe, suppression, consent basis; Compliance guard | Identity merges (A2); release of a suppression (Compliance) | 48/50 messy rows right in < 5 min (W2; owned by memory-omni and campaigns) |
| 7 Ring your phone | "Apne phone pe sunein": give a missed call to verify, then "Ring me" from VP's declared trial line. Or connect your own number (Exotel / Plivo / Vobiz form with help text) and test | Line keeper: missed-call verification as in the lab (`voicelab/server/phone.py`); test class, member numbers only | - | **first ring ≤ 15 min from sign-up (W7)** |
| 8 Readiness | Rail of predicates: number (tenant's name, series for the category), KYC timer, A2P declaration, category, window, disclosure (always on), call limits, spend cap, 6 simulations passed, list receipt, outcome wired, follow-up link domain | Line keeper, Compliance guard, Treasurer, Test pilot | Each red item has its fix inline | launch-ready in 30-60 min of active time (req-39) |
| 9 Launch | Launch card | Strategist, Treasurer | Hold to launch (A2) | one tap |

**The checklist rail never covers content.**
- It is a 280 px column that pushes the page aside. It collapses to a progress ring, which opens as a bottom sheet on phone.
- Locked steps say why they are locked and what unlocks them (Retell's locking plus Sarvam's inline fix).
- Tips are page-scoped; there is no global tour, and nothing is asked twice.
- The rail returns as "Launch readiness" for each new campaign.

**The 3-minute path.** Sign-up 1:00 + job 0:45 + voice 0:40 + call connect ≤ 0:20 = about 2:45 [I]. Context ingestion, the facts review and list import run off this path. The first call uses the job template, the business name and the synthetic customer.

**KYC and waiting.** Documents, time and cost show before any credential is asked for. While KYC is pending, tests, simulations and browser calls continue; production waits, with the reason and a timer on the rail.

---

## 7. Today

**Layout (desktop ≥ 1280 px).** The main column holds the brief and the Needs-you queue. The right column holds the "Talk to VP" thread, open by default at 440 px. From the top:
1. **Brief, since you left:** 3-5 bullets drawn from queries, for example "Renewals Oct: 412 connected, 63 renewals confirmed by your CRM webhook, ₹18,240 spent of ₹25,000". Each number carries n and as-of, and each bullet a sparkline from its query (req-40: visual first).
2. **Needs you:** at most 7 visible, the rest behind "N more".
3. **Live now:** one strip per campaign with live calls, pace and Pause.
4. **Money:** spend today against budget, wallet, days of runway at current pace.
5. **Next best action:** one suggestion, with its reason.

**Priority order (fixed, in code):**
- **P0** safety or compliance incident: crisis alert, opt-out failure, dial-path block, cap breach.
- **P1** an approval blocking a scheduled launch, or expiring within 2 h.
- **P2** other approvals.
- **P3** issues, ranked by calls impacted × severity.
- **P4** Coach proposals.
- **P5** FYI.

Within a class: deadline first, then impact (calls or ₹).

**By role:** the Owner sees outcomes and money first; the Operator sees live calls and issues; Compliance sees blocks and requests. A Viewer sees the same with PII scrubbed.

**Empty states (one action each):**
- Day 0: "Abhi koi campaign nahi hai. Pehle ek call sun ke dekhiye" → [Browser call].
- Scheduled: "Renewals Oct starts 10:00 IST (in 2 h) · 1,191 contacts" → [See launch card].
- Nothing needs you: "Kuch pending nahi. VP ne 6 kaam kiye" → [See activity].
- No outcome wired: "Outcome not measured: connect your renewal webhook" → [Connect].

Six states never look alike (HV law 21; must-be D): empty (nothing yet), zero (measured 0, with n), not measured (no writer, with the reason), loading, failed and stale.

---

## 8. The shell

**Desktop (≥ 1024 px).**
- **Rail** (224 px; collapses to 64 px with labels on hover and focus): Today · Campaigns · Calls · Contacts · Agents · Insights · Numbers · Settings. At the bottom:
  - a wallet chip (₹, red below 2 days of runway);
  - a workspace switcher;
  - Help (human, IST hours, expected reply time).
- **Top bar:** breadcrumb with a version and state pill. Cmd-K takes navigation or plain language ("pune ki failed calls").
- **Banners:** at most one, 40 px high or less.

**Docked panel.**
- 400 px wide, resizable from 320 to 560. The main column keeps at least 720 px. Below 1180 px the panel becomes a Page | VP switch; it never covers the primary action.
- A context chip shows what VP sees ("Seeing: Renewals Oct · live · v3").
- Chips follow the page:
  - campaign: "Why is pickup low in Pune?";
  - call: "Make a test from this call";
  - agent: "Make her slower".

**Deep links.** Every object, filter, card and message has a URL, and roles are checked on open: /campaigns/c_8f2/calls?outcome=failed, /calls/k_77?t=83.4, /approvals/a_19.

**Echo.** A page edit posts one line to that object's thread, debounced 10 s. Queries compute the effect, not the model: "You moved the window to 11:00-19:00 · est. cost −4% · 212 contacts move to tomorrow · Undo".

**Phone (360-414 px).**
- Bottom bar: Today · Campaigns · Talk (centre mic) · Calls · More.
- Cards run full width; approvals are hold-to-confirm; tables become cards.
- 16 px gutters, no horizontal scroll, one primary action per screen.

---

## 9. Operator brain choice (req-16)

Settings → Operator → "VP's brain" is a curated list. Each row shows:
- India first-token latency;
- ₹ per Operator turn;
- data region;
- the Operator-bench score;
- whether the brain is included in the plan or billed at cost.

| Brain (initial candidates) | India TTFT [M, voice brief, n=6] | ₹ per turn [C] | Region | Note |
|---|---|---|---|---|
| GPT-4.1 mini (India-resident) | 641 ms | 0.60 | India | Retires 2027-04-14; replaced only through the bench |
| Gemini 3.5 Flash-Lite | 826 ms | 0.48 | Google | Google dependency risk |
| GPT-5.4 mini | 960 ms | 1.11 | South India account | Azure meter not read |
| Gemini 3.8 Flash | 1,991 ms | 1.07 | Google | Deep lane only (slow first token) |
| GPT-5.6 Terra | 1,604 ms | 2.96 | outside India | Deep lane; premium, billed at cost |

Source: `voicelab/server/catalog.py` (median TTFT from Central India on the renewal brief, 2026-10-19). ₹ per turn assumes 12k tokens in and 600 out, no caching, FX 95.

**Operator-task accuracy: not measured.** An onboarding of about 40 turns would cost about ₹6-45 [C]. Retell's Conductor, after its free credits, costs ₹9.5-57 per message [C, RET-03].

**Operator bench.** It gates any change of brain or Operator prompt:
- 300 synthetic requests in Hinglish, Hindi and English across 12 intents. Each has a verified key: the expected tools and args, plus forbidden calls.
- 50 adversarial items: "approve it yourself", "skip DND", "script mein bolo human hai", an injection inside a CSV cell, a request for a number no tool returns.
- T1-T6 by chat on a synthetic staging workspace.
- Scored in code; any forbidden call fails. The bench runs off production quota, and no model grades itself (`rejected.harvest.12`, `rejected.harvest.14`).

**Default brain:** the best bench pass rate with p50 first card ≤ 3 s and ≤ ₹1 a turn. An optional deep-lane brain handles plans and analysis.

**What the choice never changes:** roles, ceilings, approval tokens, predicates, budgets, the dial path, schemas.

Also:
- BFSI workspaces can restrict the list to India-resident brains (a policy setting).
- Judges stay fixed per judge version.
- A failing brain is reported in the thread with an offer to retry or switch. It is never swapped silently (`rejected.2026-10-20.silent-fallback-in-tests`).
- Every action records the brain that actually ran (`rejected.2026-10-20.preset-override-attribution`).

---

## 10. Defaults set at workspace creation (values proposed)

| Setting | Default |
|---|---|
| Operator autonomy | read automatic · draft A1 · test A1 inside ₹200/day · external, spend, destructive, policy A2 |
| Language | Mirror the client per message; Hinglish (romanised) first if the sign-up locale is IN |
| Talk mode | Off on desktop; offered on phone |
| Spend cap | ₹2,000/day in trial; a cap is required before the first launch |
| Re-auth thresholds | ₹50,000 / 10,000 contacts / cap raised above 2x |
| Card expiry | 24 h; launch estimates refresh every 2 h |
| Today | 7 visible items; push notification for P0 |
| Echo debounce | 10 s |
| Thread retention | 12 months, chosen by the workspace |
| Product analytics | India-hosted, no PII, no replay of inputs (unlike SAR-63) |

---

## 11. Who does what: VP's agents, the client's view, the client's decision

| Moment | VP's agents do (unasked) | Client sees | Client decides |
|---|---|---|---|
| Build | Brief writer drafts, lints recitable lines, compiles; Test pilot runs 6 simulated callers | A diff with a reason per field; test receipts with transcripts | Publish (A2) |
| Data | Data steward maps, normalises, dedupes, suppresses | A receipt with counts and a reason per row | Identity merges; suppression release (Compliance) |
| Launch | Strategist plans; Treasurer estimates; Compliance guard checks | Launch card | Launch (A2) |
| Run | Runner dials; Supervisor watches and pauses on breach (A3) | Live strip; P0 alerts; receipts with undo | Resume, take over |
| Results | Call analyst writes outcomes, reasons, issues | Today brief; issue cards; call cards | Fix diffs (A2 to publish) |
| Learn | Coach proposes; Learner tests | Proposal card with evidence and the calls needed to prove it | Accept (A2) |

---

## 12. Emotional voice, memory, personalisation and self-learning in this module

- **Emotional voice is the first thing a client meets.**
  - The aha is three moments: the public page, the voice-by-ear card (accent as its own axis, `directive.2026-10-19.hear-before-choose`) and the browser call within 3 minutes.
  - "Kaisi lagi?" turns feeling into diffs: "too fast" moves the pace; "robotic" sends a Brief writer proposal for register and length, with a re-test.
  - Talk mode lets VP itself speak in the workspace's voice.
- **Memory.**
  - *About the client:* "What VP remembers about how you work" (Settings → Operator) lists preferences such as "reports in Hinglish" or "weekly summary on Monday". Each has its source message and can be edited or forgotten. It never holds configuration or permissions, and never everything said (`rejected.2026-10-20.raw-fact-memory`).
  - *About the people called (v2):* memory proposals arrive as cards with the caller's exact quote and play-from-here.
- **Personalisation.** Today is ordered by role. Onboarding pre-fills from the business name, website facts and job. VP learns the client's vocabulary (product and plan names) as Offering terms the client approves.
- **Self-learning.**
  - Coach proposals reach the client only as Proposal cards: a diff, the evidence calls, the number of calls needed to prove it, an expiry, and "observed, not causal" when under-powered (`rejected.2026-10-17.k2-dashboards`).
  - Accepting needs A2. "How she changed for you" is linked from Today.
  - VP's own Operator learns per tenant only, from the defaults the client keeps changing. It proposes a workspace-default change as an A2 card. It never changes a default by itself and never pools across tenants (`rejected.2026-10-17.cross-tenant-pooling`).

---

## 13. Beyond everyone (no competitor capture shows these; detail in the beyond field)

1. **Approve exactly what you saw:** an approval bound to the args hash and object version. Vapi, by contrast, has a "Bypass approvals" mode (VAP-61).
2. **A copilot that cannot invent a number,** and opens the page when unsure.
3. **Page edits echoed into the thread** with their computed effect and an undo.
4. **"What VP did" ledger,** whose undo states what it cannot reverse.
5. **The public demo call becomes the setup thread.**
6. **A readiness rail made of predicates,** with a KYC timer.
7. **The one-question rule,** with stated defaults.
8. **The client chooses VP's own brain,** with India latency and ₹ shown, and the choice cannot change permissions.
9. **Hinglish voice commands** with entity chips, and VP answering aloud in the client's chosen voice.
10. **Object threads as decision logs.**
11. **Role-shaped Today** with a fixed priority order.
12. **Time to first call and first ring measured from India-hosted product events.**

## 14. Metrics (all proposed; none measured yet; full list in the metrics field)

| Metric | Target | How |
|---|---|---|
| Sign-up → browser call first audio | median < 3 min, p90 < 6 min | signup_completed → browser_call_first_audio |
| Sign-up → first Indian ring (W7) | median ≤ 15 min | signup_completed → ring webhook on a member phone |
| Launch-ready active time (req-39) | 30-60 min, KYC wait shown | readiness_all_green minus idle gaps over 10 min |
| T1 by chat; T2-T6 by chat only (W10) | 0 silent drops; 5/5 users finish without opening a settings page | read-back diffs; 5-user sessions against incumbent captures |
| A2 actions without a human token | 0 (sev-1) | daily audit query |
| Invented numbers reaching the client | 0 | predicate log plus a 200-prompt red-team set |
| Questions before first call | median ≤ 3 | question cards per thread |
| Operator speed and cost | first token p50 ≤ 1.2 s; first card ≤ 3 s; ≤ ₹30 per onboarding | operator manifest and meter |
| Failed call found by chat with reason and action (W6) | < 60 s | T5 sessions |

## 15. Phasing (detail in the phases field)

- **v1, parity made better.** Chat setup is parity (WT finding 8), so v1 must win W10 by finishing whole tasks through tools. Scope:
  - the full registry with A0-A3, approval tokens and the ledger;
  - 10 card types; onboarding steps 0-9; Today; the shell; phone web;
  - push-to-talk Hinglish input and a spoken summary line;
  - 3 brains that pass the bench.

  Exit: W10, W7 and the 5-user sessions.
- **v2, she remembers and you just talk.** Memory comes before learning (req-32, req-34). Scope: hands-free Talk mode; a WhatsApp or spoken brief with consent; memory cards; "How she changed"; two-person approvals; scheduled Operator jobs; share links.
- **v3, runs the calling.** Bandits pay only at volume (L6); command-centre layers (req-18). Scope: standing approvals for recurring campaigns inside a budget envelope; agency view; a regional-language Operator.

## 16. Risks, rejected ideas avoided, open questions

**Top risks** (full list in the risks field):
- A wrong plan executes. Bounded by A2, the hash and drafts-only autonomy.
- Sarvam Genie passes T2-T6, and W10 is lost.
- Chat is slower than clicks for experts. Answered by page parity and Cmd-K.
- Prompt injection through uploads.
- Misheard spoken numbers.
- Approval fatigue.
- The legal status of a trial-line ring.

**Rejected ideas avoided:**
- `rejected.harvest.02`, `rejected.harvest.03`, `rejected.harvest.04`, `rejected.harvest.05`, `rejected.harvest.07`, `rejected.harvest.12`, `rejected.harvest.14`, `rejected.harvest.16`, `rejected.harvest.17`, `rejected.harvest.19`;
- `rejected.2026-10-17.parity-undercut`, `rejected.2026-10-17.k2-dashboards`, `rejected.2026-10-17.cross-tenant-pooling`;
- `rejected.2026-10-20.silent-fallback-in-tests`, `rejected.2026-10-20.preset-override-attribution`, `rejected.2026-10-20.raw-fact-memory`, `rejected.2026-10-20.free-key-rotation`;
- the Relay auditor-style UX (`decision.product-ux-structural-reset-2026-10-01`).

**Open questions:** see the open_questions field.
