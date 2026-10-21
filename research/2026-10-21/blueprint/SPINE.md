# Vyakti Platform (VP): the product spine

**Status.** Blueprint spine for owner review, 2026-10-21 (`directive.2026-10-21.blueprint-end-to-end`). *Proposed* items wait for the owner; *open* items name the evidence that closes them.

**Grades.** [M] measured by us (n, method) · [C] computed (model or simulation) · [O] observed (capture, API read-back, code) · [V] vendor-claimed · [I] inferred · [U] unknown.

**Short paths** (under /home/user/sales-enabler): req-NN ids `data/blueprint/owner-requirements.json` · DIR `context/DIRECTION.md` · WT `research/2026-10-21/walkthroughs/SYNTHESIS.md` · TS `research/2026-10-20/teardown/SYNTHESIS.md` · AS `research/2026-10-20/account-phase/SYNTHESIS.md` · SCH `research/2026-10-20/account-phase/synthesis/vp-v1-schema.json` · WIN `research/2026-10-20/teardown/synthesis/where-we-win.json` · RS `research/2026-10-20/teardown/regulation-segment/report.md` · LAB `research/2026-10-20/voicelab/round1-review-and-v2.md` · ECO `research/2026-10-18/SYNTHESIS.md` · L6 `research/2026-10-17/lanes/l6-self-learning/report.md` · L5 `research/2026-10-17/lanes/l5-human-dialect/report.md` · L4B `research/2026-10-17/lanes/l4b-measured/report.md` · R2 `research/2026-10-17/lanes/r2-untouched-raw/findings.md` · HV `docs/harvest/SYNTHESIS.md`.

## 0. How module designers use this spine

1. The spine fixes the thesis, principles, outcomes, personas, objects, VP's own agents, surfaces, journey, phases and module seams. Build inside it. Changing a spine item needs evidence and a reversal condition (HV law 38).
2. Every "better than X" is a hypothesis until VP runs the same task: W1-W10 with pass and kill bars (WIN) on tasks T0-T9 (TS §7.3). Product copy never claims what VP has not measured.
3. Inherited laws bind every module (HV §2): shapes, not lines (quoted lines recited 4/5, 0 after removal [M]); position is mechanism (a rule fired 0/8 mid-brief, 8/8 last [M]); budgets throw; one `compile()`, one reply door; safety by predicate; the model chooses, code enforces; a model never grades its own work; metrics do not pick voices; no writer means "not measured", never zero.
4. Standing rules (DIR): she never denies being an AI and discloses once, lightly; no manipulation; Tele-MANAS 14416 and 112 stay; synthetic data in tests; no model swap mid-test-call; every call is filed under the combination that actually ran.

## 1. Thesis

**What VP is.** A self-serve voice-agent platform for Indian businesses calling their own customers. The client talks to VP's own agents, in Hinglish or English, by text or voice; they build the calling agent, clean the list, set the rules, launch, watch, analyse and improve. The call is the product: an emotional, relational, human-sounding Hinglish voice that opens with something useful, reads the person, never wastes their time, gets the agenda done subtly, says once and lightly that it is an AI, and remembers the person next time (req-01, req-03, req-04, req-13, req-14, req-32).

**For whom.**
- **Buyers:** Indian businesses, SMB to enterprise, with a recurring reason to call their own customers: insurance intermediaries, lenders, subscriptions and utilities, clinics, education, real estate with consented inquiries (req-19). Not consumer-internet giants with in-house teams (req-56).
- **First jobs** (a go-to-market input, not the product boundary: `directive.2026-10-20.intent-better-product`): post-sale service calls, because they need no explicit consent, are not blocked by DND from about 2026-11-03 and have no TRAI band (RS §0 [O]): renewal and pre-due payment reminders, appointment reminders, onboarding follow-up. Wave 2: consented inbound leads inside the 7-day window. Not v1: cold outbound, default-stage collections, surveys before counsel (`decision.2026-10-20.synthesis-postsale-first`, proposed).

**The promise.** Just talk to VP: it builds the agent, cleans your list and makes calls your customers are glad to take, in their language and inside the rules, then shows you every call, every rupee and what it will do better next time.

**Why VP beats each of them** (limits stated):

| Competitor | VP wins because | Honest limit |
|---|---|---|
| Vapi | It is developer plumbing: no contact, consent or Indian CLI; US-hosted; USD; 35% collisions on its demo [M L4B]. VP is an India-native operator product run by chat | Its QA and observability depth is the bar |
| Retell | Best US builder, but US/CA numbers only, an ID wall before any country, batch ignores DNC, 0 Indian voices [O]. VP matches the builder, owns the India path | Unmeasured on calls; 72-86% infra margin [I] |
| Bolna | Indian and cheap (about INR 5.7/min shown [O]), but compliance off by default, short Hindi replies discarded, a hidden 500 + 900 ms hold, hidden judges [O]. VP: compliance on, visible turn-taking, visible judges, one campaign object | Its costs let it follow a price cut |
| ElevenLabs | Strongest voice stack, but a batch form with no India layer, US SIP signalling, import-only numbers, spend-raising defaults, AI-only support [O]. VP wins the India layer, bounded defaults, chat-run operation | Not on raw voice; hidden campaigns and memory may ship within a quarter |
| Sarvam | Closest Indian rival (held Hindi 38/40 turns [M]), but disclosure is a prompt line (demo claimed human 6/6 [M]), 60 s pulses, 10-digit numbers only, no memory, no authoring API. VP: disclosure by predicate, series and compliance by default, short pulses, memory, full API | Not on language hold |
| Exotel | Owns rails and 140/1600 numbers, but three shells, quote-gated prices, KYC in days, bot-path compliance off [O]. VP rides Exotel as BYO rails; one shell, same-day start, published price | Its carrier relationships |
| Synthflow | Review-gated, USD 30k a year floor, no India. VP is self-serve in INR | - |
| SquadStack | Managed, sales-led; rewards passing as human [O]. VP is self-serve, transparent, honest by construction | Indic depth unproven against it |

**Better in every sense the owner named** (req-38):

| Sense | VP commitment | Proof (pass bar) |
|---|---|---|
| UI | One warm, Indian, voice-first shell; empty, zero, loading and failed never look alike | 5-user sessions vs incumbent captures (WT §7) |
| UX | Talk or click, same result; no click creates anything; every disabled action names its fix | T1 by chat, 0 silent drops (W10) |
| Product design | The person and the calling policy are first-class; one campaign object | T2: 48/50 messy rows right in under 5 min (W2) |
| Cost | One all-in INR per connected minute incl. telephony, pulse and turn wait; per-second billing; caps | T7: invoice within 1% of rate card (W8) |
| Speed | India media edge, pause-aware turn release, opening rendered during the ring | p50 0.3 s below the best incumbent, p90 2.5 s or less, cut-ins 5% or less (W3) |
| User flow | Browser call under 3 min from sign-up; first Indian ring 15 min or less | T0 (W7) |
| Convenience | Hinglish chat or voice, daily brief, one-tap approvals | Share of setup done by chat |
| Usability | Plain words, ms and INR, a reason beside every outcome | Failed call found with reason and action in under 60 s (W6) |
| Vibe | A voice people enjoy; an honest product | Blind listener panel vs human references (L5) |
| Results | Commitments captured and followed through; outcomes earned in code | Cost per earned outcome vs the client's baseline (§3) |

**Not claimed until measured:** price as the wedge (`rejected.2026-10-17.parity-undercut`); better raw voice than ElevenLabs; better language hold than Sarvam or SquadStack; "learns on its own from every call" below about 1,000 calls a day on one script (L6 §1); a turn-taking win, since every VP stack still cuts in on 15-42% of turns [M] (`open.2026-10-19.turn-taking`).

**What VP is not.** Not a carrier: numbers sit in the tenant's name on licensed carriers (RS §2.11). Not a managed telemarketer (`rejected.2026-10-17.managed-telemarketer`). Not a CRM: it plugs in; the company command centre is the long-run expansion (req-18).

**Where advantage compounds** [I]: measured Hinglish conversation craft; per-tenant memory and outcome data; the India operator layer; an operator that can do every action.

## 2. Product principles

| # | Principle | Evidence or owner requirement | What it forces |
|---|---|---|---|
| P1 | **The client just talks; VP's agents do all the work.** | req-13, req-14, req-17; chat setup is parity (5 of 6 dashboards ship a copilot, WT §1 [O]) | Every dashboard action is one API/MCP operation with the same auth (W10); plans and diffs before acting; a ledger of what VP did |
| P2 | **The voice is the product; voice beats margin.** | req-01 (7 times), req-02; Azure won 15/15 on metrics and lost by ear [M] (HV law 26) | Voices chosen by ear in blind tests, accent as its own axis; expressive delivery from tone notes, never spoken stage directions |
| P3 | **Conversation shapes, not scripts.** Useful first, read the person, short turns, one question at most, earn the ask, she ends the call | req-03, req-04, req-06; brief v2: words per turn 33 to 20, question endings 62-76% to 13-29%, abrupt hang-ups 17-40% to 0 [M text bench, LAB] | Structured brief; must-fire rules last; an agenda ledger in code each turn, incl. how the caller sounds |
| P4 | **Competence is the warmth.** | AI collectors got 21 pp fewer promises but were not hung up on more; anthropomorphism hurts angry callers (L5, third-party [M]) | Numbers from data, clean turn-taking, a specific next step and follow-through; warmth lower on complaints and collections |
| P5 | **Honest by construction.** | Prompt-only safety leaked 57-98% vs 0 for predicates (HV law 10 [M]); 0 of 8 vendors make disclosure non-removable; fake renewal scams use real policy data (R2 §4.1) | Predicates at one reply door on every creation path; no payment on the call, only links on the client's domain |
| P6 | **India by default, compliant by default.** | 0 of 6 campaign forms carry consent, DND or DLT (WT §1 [O]); compliance is 1.3% of complaints: a floor, not the pitch (RS) | Call category first, setting window and number series; suppression on one dial path; A2P export; DPDP notice and retention |
| P7 | **What you see is what runs.** | 4 of 4 writable incumbents drift from their docs, 3 drop unknown fields (AS XS-07/08 [O]); Vapi publishes on a menu click (WT) | One publish path; resolved config; unknown fields refused; every call pinned to a version and a run manifest |
| P8 | **Every number tells the truth.** | Vapi shows ~1,530 ms; its demo measured 2,319 ms p50 (WT; L4B) | All-in INR; India-measured latency with n and date; vendor figures labelled; "not measured", never zero |
| P9 | **Bounded by default.** | Retell burst on, 10 min silence, keep forever; ElevenLabs end-call off (WT §3 [O]) | End-call on, silence ladder, max duration, premium opt-in, spend caps per workspace and key, retention chosen, PII redaction on |
| P10 | **Results are earned, not asserted.** | No incumbent has a business-outcome field (AS XS-20); a 90%-accurate LLM label inflates sample needs 1.8-2.4x (L6) | Outcomes from systems of record or verified keys; holdouts when powered, else "observed, not causal" |
| P11 | **Remember the person, with permission.** | `rejected.2026-10-20.raw-fact-memory`; pooling gave the wrong winner to 48-55% of dissimilar tenants [C] (`rejected.2026-10-17.cross-tenant-pooling`) | Facts carry the caller's exact quote, consent and purpose; viewable, editable, forgettable; no pooling |
| P12 | **Learn with honest statistics; keep learning from the market.** | Daily two-arm dashboards: 52-62% false winners in A/A (`rejected.2026-10-17.k2-dashboards`); req-34, req-60, req-61 | Dense signals first; human approval; fixed-horizon proof; winners expire; "under-powered" as a state; a standing competitor radar |

## 3. North-star outcomes

**Client north star: cost per earned outcome, at a human-quality conversation.** An outcome is the business result earned in code (renewal-paid webhook, promise to pay with date and amount, booking confirmed), compared with the client's own baseline and, once powered, a never-billed holdout.

| Client measure | Bar | How measured |
|---|---|---|
| Cost per earned outcome | Below the client's own desk (human about INR 6-9 per connected minute [I]) | Outcome webhooks or CRM write-back joined to INR cost lines |
| Agenda completion, commitments kept | Rising per version | Agenda ledger in code; commitment matched to later payment or booking |
| Early hang-up under 10 s | Falling (15% to 10% is detectable at 686 calls per arm [C], L6) | Hang-up time against TTS clause timestamps |
| Opt-outs and complaints | Never rise after a change | In-call capture, complaint tags |
| Conversation floor (KC6, W3, W4) | Reply gap p50 1.2 s server and 1.5 s handset, p90 2.5 s; cut-ins 5%; short replies 90%; language hold 95%; AI denials 0 | Stereo handset battery (30+ clean turns per stack); per-turn telemetry |
| Trust | 0 dials to suppressed or out-of-window contacts; invoice within 1% | Dial-path log; T7 |
| Time to value | Browser call under 3 min; Indian ring 15 min or less; live campaign same day, KYC permitting | T0 recordings; product events |
| Operator effort | Failed call found with reason and action under 60 s | T5; action ledger |

**VP north star: outcome-bearing connected minutes per week** (minutes in campaigns whose outcome is wired to a system of record); it grows only when clients run work whose value they can see. Supporting: live campaign within 7 days of sign-up; retention and expansion per cohort; gross margin at the owner's floor, the voice winning any conflict (req-02); AI cost per minute falling toward the INR 2 path; human support reply under 2 h in IST hours (W9); minutes to detect and notify an incident; the W1-W10 scoreboard; A/A false winners 5% or less.

## 4. Personas and their jobs

| Persona | Who | Jobs | Sees first | Approves |
|---|---|---|---|---|
| The person called | Often older, Hindi-belt, busy, wary of scam calls | Get the useful fact fast; respect; act easily; stop calls | Company name, a light AI line and something useful in the first breath | Consent, opt-out, forget |
| Owner | Runs a 10-500 person firm, on a phone, in Hinglish | Decide, fund, trust; see results and money without configuring | Today brief; launch and budget cards | Spend, launch, numbers, deletion |
| Campaign manager | Runs the renewals, reminders or success desk | Import, launch, watch, fix, report, improve | Mission control; failed-call finder; learning inbox | Launches in budget, publishes, proposals |
| Ops agent (human closer) | Telecaller, certified agent, support rep | Warm transfers with a brief; hot callbacks; what the AI must not do (IRDAI solicitation) | Hand-off queue with summary and play-from-here | Dispositions |
| Compliance officer | In-house compliance or DPO, or the owner | Category, windows, series, consent, recordings, retention, DPDP requests, audit | Compliance centre, A2P export, audit log | Policy changes, template categories |
| Developer | Engineer or integrator | CRM, webhooks, API/MCP, bring-your-own carrier, SSO | Keys, logs, webhook replay | Keys, webhooks |

Internal users: VP's success team (IST hours) and VP's owner (radar).

## 5. Core object model

Extends the proposed schema kit (SCH; `decision.2026-10-20.acct-synthesis-vp-data-model`).

| Group | Objects |
|---|---|
| Tenant, governance | **Workspace** (plan, wallet, caps, concurrency, region) · **Member/Role** (Owner, Builder, Operator, Compliance, Viewer with PII scrubbed) · **ApiKey** (scopes, expiry, spend cap) · **AuditEvent** (every write and approval; actor is a person or a named VP agent) |
| Business context | **Brand** (legal entity, CNAP trade name, DLT entity, sector) · **Offering** (facts, prices, dates in data, never in prompt prose, HV law 22; never-say list) · **KnowledgeSource** (company brain with evidence spans) |
| People, data | **Contact** · **Identifier** (phone in India-default E.164 with aliases, email, CRM id, WhatsApp id, policy or loan number) · **ConsentRecord** (append-only: purpose, basis, evidence, expiry) · **Suppression** (tenant-wide; never cleared by import) · **Tombstone** (hashed ids of erased people) · **Source/Receipt** (immutable upload or pull, mapping, per-row results) · **Audience** (list or saved query) |
| Agent | **Agent** · **Brief** (identity with locked disclosure, situation, value opening, agenda must/nice/never, speaking style, language variants) · **Voice** (catalogue entry: languages, registers, India-measured first audio, INR price, sample) · **Stack** (ears, brain, voice or speech-to-speech, turn policy) · **Tool** (HTTP, transfer, end-call, SMS/WhatsApp, knowledge, code; pre/in/post; mock; risk class) · **Version** (immutable: hash, parent, author, resolved config) · **Deployment** (version or split bound to number, web or campaign) · **Test** (simulated caller with hidden keys, assertions incl. latency) |
| Calling | **Number** (series 10-digit/140/1600/1601, carrier or BYO, KYC, A2P declared, CNAP name, health) · **Campaign** (goal, outcome definition, category, audience, deployment, window, retry ladder, attempt budget, pacing, caller-ID pool, predial, budget, follow-ups, state) · **Attempt** (precheck result naming any blocking rule, dial status, carrier code, next action) · **Call** (version, run manifest, transcript native, romanised and translated, stereo recording, cost lines, engineering reason, business outcome, judges, extraction, compliance trace) · **Turn** (heard text, language, latency segments, ledger state) · **FollowUp** (WhatsApp, SMS, callback, hand-off; durable outbox) |
| Results, learning | **OutcomeDefinition** (client-owned values with a verified source) · **Outcome** (earned: source, delay, leading indicator) · **JudgeResult** (visible, editable, agreement with keys) · **Fact** (memory: exact quote with call and span, purpose, consent, status) · **Insight** (with citations) · **Issue** (cause, severity, calls impacted, fix link) · **Experiment** (arms are versions; pre-registered metric, minimum n, stop rule, guardrails, expiry) · **Proposal** · **Lesson** (no personal data) |
| Money | **CostLine** (INR per call per second: telephony, ears, brain incl. cached and speculative, voice, platform, analysis) · **Budget** · **Invoice** (GST) · **PricePlan** |
| Operator | **Thread** · **Plan** (actions with risk classes) · **Action** (each tool call, linked to Approval and AuditEvent) |

**Relations** (diagram-ready):
- Workspace → Brand → Offering → KnowledgeSource
- Workspace → Contact → {Identifier, ConsentRecord, Suppression, Fact}; Contact → Attempt → Call → Turn
- Agent → Version → {Brief, Stack, Tools, KnowledgeSource} → Deployment
- Campaign → {Audience, Deployment, Numbers, OutcomeDefinition, Budget} → Attempt
- Call → {CostLine, Outcome, JudgeResult, Fact, FollowUp, Issue}
- Experiment → Versions → Proposal → Approval → new Version
- Thread → Plan → Action → Approval → AuditEvent

**Invariants (code, never prompt):**
1. **One dial path.** Every attempt (campaign, API, test, retry, callback) passes one precheck inside the write that claims it: local-time window, suppression, consent or basis, attempt budget, balance and caps, number health (HV law 18; `rejected.harvest.07`).
2. **One reply door.** Every utterance passes the same predicates before TTS: disclosure spent and never denied, crisis lines, promotion fence on service calls, numbers only from data, no payment or OTP asks (HV laws 3, 10, 25).
3. **One `compile()`**: fixed order, must-fire rules last, a throwing byte budget (HV laws 1, 2, 4).
4. **Immutable versions; edits never publish.** Each call carries a run manifest: combination, regions, brief hash, ledger version, turn parameters, telephony leg (`decision.2026-10-20.combo-identity`).
5. **Consent is append-only; suppression is never cleared by import; tombstones stop resurrection.**
6. **Outbound outcomes are confirmed, not executed or unknown; unknown is never auto-retried** (HV law 17).
7. **Identity is a contact id**, never a phone number, device or channel handle (HV law 15).
8. **Money is INR with GST**, written by the meter that measured it.

## 6. VP's own agent system

**Two layers.** *Agents* (LLMs) understand, plan, draft, analyse and explain. *Engines* (code) enforce and execute: `compile()`, the dial path, the reply door, predicates, the dialer, statistics, metering and the ledgers.

**One tool registry.** Agents act only through the public API/MCP tools any developer gets. Each tool has a risk class: read, draft, test, external (reaches a real person), spend, destructive, policy. Approval rules per class live in code; a model-emitted "approved" means nothing (HV law 12; `rejected.harvest.04`).

**Autonomy levels.** **A0 Suggest:** writes nothing. **A1 Draft:** drafts and simulations within a test budget; no real person, no money. **A2 Ask:** a card with diff, cost and risk; a role holder approves in one tap. **A3 Guard:** acts at once inside an approved policy when the action only lowers risk or spend (pause on a breach, suppress after an opt-out, end a runaway call, retry per the ladder), then notifies with undo. Publish, launch, buy, raise a cap, change policy and delete always need A2. No agent overrides a predicate.

| Cluster | Agent | Does | In → out | Autonomy; human approves |
|---|---|---|---|---|
| Front door | **Operator** ("VP") | The client's one partner, text or voice, Hinglish or English: understands, plans, delegates, acts through tools, explains, reports | Messages, files, state → plans, cards, actions, reports | A1; A2 for external, spend, publish. Client picks its brain (req-16); predicates do not depend on it |
| Front door | **Concierge** | Support: finds the failing call, explains, proposes the fix, hands to a human in IST hours | Tickets, call records → answers, escalations | A1 |
| Build | **Strategist** | Goal to campaign plan: job template, category, audience, agenda, outcome definition, follow-ups, schedule, cost and outcome ranges | Goal, data, history → plan, campaign draft | A1; launch card |
| Build | **Brief writer** | Writes and compiles the brief; lints recitable lines; derives and freezes the agent's ledger patterns at publish; proposes the voice register | Offering, knowledge, goal → brief, version draft | A1; publish with diff |
| Build | **Data steward** | Mapping, E.164, cross-format dedupe, per-row reasons and basis; customer rows never enter company knowledge | Files, connectors → staged contacts, audience, receipt | A1; A2 for identity merges; never decides consent |
| Build | **Test pilot** | Simulated Hinglish callers with hidden keys (busy, sceptical, elderly 2.4 s pause, noisy, angry, wrong person); latency and memory tests; gates publish | Versions → results with transcripts | A1 |
| Build | **Line keeper** | Series by category and sector; KYC documents, time and cost before credentials; BYO set-up with a test call; CLI health; A2P; CNAP | Sector, documents → numbers, declarations | A2 to rent; A3 to pause a flagged CLI |
| Run | **Compliance guard** | Classifies category, flags offer lines in service briefs, drafts DPDP notice and A2P export, runs the launch checklist; enforcement is code | Brief, campaign → checklist, blocks with reasons | Blocks always on; policy needs the Compliance role |
| Run | **Campaign runner** | The dialer: pacing, windows, retries, follow-ups, resume after outage | Policy → attempts, follow-ups, events | Engine; A3 inside the launched policy |
| Run | **Supervisor** | Watches live calls for loops, anger, crisis words, risk; whispers context; hands off; ends runaway calls | Live events → interventions, alerts | A3; take-over is human |
| Run | **Treasurer** | Estimates, spend vs budget, caps, low balance, invoices, GST | Meter, plans → estimates, alerts | A3 to stop at caps; A2 for top-ups |
| Learn | **Call analyst** | Per call: outcome against keys, commitment, objections, summary, sentiment path, agenda completion, failure reason with carrier code and action. Per campaign: drivers, line hazard, objection clusters; answers with quotes and play-from-here | Calls, turns, outcomes, costs → analyses, issues | A1; judge edits by the manager |
| Learn | **Memory keeper** | Proposes facts with exact quotes, checks consent and purpose, compiles the bounded pre-call brief, executes forget everywhere | Calls, channel episodes → facts, memory brief | A3 for opt-out; auto with undo for language, pace, register; review for commitments and money |
| Learn | **Coach** | Finds where calls fail; propose, probe, compose on simulated callers; inbox cards with diff, contrasts, calls needed to prove | Analyses, simulations → proposals | A1; live changes need A2 |
| Learn | **Learner** | Statistics in code: A/A, power, pre-registration, fixed-horizon tests, guardrail auto-stop, expiry; bandits only at volume | Experiments, outcomes → decisions with intervals | A3 to stop; A2 to promote |
| VP-internal | **Scout** | Competitor radar: diffs changelogs, docs, APIs, prices, status; fires tripwires | Watchlist → digests, graph inbox entries | A1; read by VP's owner |

**Worked example: "I have this CSV, fire it"** (illustrative numbers).
1. The Data steward reads 1,240 rows, maps name, mobile, policy number, due date, premium and language, fixes 37 numbers, rejects 12 with reasons, keeps 9 opted-out rows suppressed, and asks one question that changes the call ("due date has two formats; DD/MM?").
2. The Strategist proposes a renewal-reminder service campaign, a humane window in each contact's local time (a product choice: service calls have no TRAI band), a 3-attempt ladder and a WhatsApp follow-up with the client's renewal link.
3. The Brief writer drafts; the Test pilot runs six simulated callers; the Compliance guard confirms no offer rides the service call; the Line keeper confirms the CLI; the Treasurer prices a range.
4. One launch card: who, when, a 20-second sample, green checks, cost and outcome ranges. The manager taps Launch.
5. The runner dials, the Supervisor watches, the Call analyst writes each result, and the Operator gives tomorrow's brief.

## 7. Information architecture and surfaces

**Front door: "Talk to VP".** A full-height conversation on the home route, text or voice. Replies carry live cards: plan, diff, launch, call, chart, approval, issue. The same panel docks on every page and knows the page ("ask about this campaign").

**Left rail:** Today · Campaigns · Calls · Contacts · Agents · Insights · Numbers · Settings (Team, Compliance, Data and privacy, Billing, Integrations, Developers, Brand).

| View | Key content |
|---|---|
| Today | Brief since last visit, approvals, issues, live campaigns, spend, next best action |
| Campaign | Goal, outcome target, state, spend vs budget; funnel (rows, valid, dialled, connected, agenda done, outcome) with a reason at each drop; mission control (live calls, concurrency, listen, whisper, take over); insights; line-hazard ribbon over the script; issues; per-call table; policy |
| Call | Stereo player; transcript (native script, romanised, translated) synced to audio; turn timeline with latency segments and heard text; outcome, reason, carrier code, action; judges; commitments; memory proposals; cost lines; compliance trace (why it was allowed); run manifest |
| Contact | Identifiers, consent ledger, suppression, preferences, facts with quotes and play-from-here, cross-channel timeline, forget |
| Agent | Lifecycle (pre-call, call, post-call, follow-up); brief editor; stack picker (India p50/p90, INR per minute, languages, sample per row); turn-taking panel (ms, predicted gap, Hinglish lexicons, presets); tools; knowledge; tests; versions, diff, publish, split; docked test (browser, chat, phone) |
| Insights | Reports, experiments, learning inbox, "how she changed for you", cost per outcome trends |
| Numbers | Rent and bring-your-own side by side, series, KYC, A2P declaration, health, CNAP name |
| Settings | Roles, compliance centre, retention, INR wallet with GST and caps, integrations, developers (keys, signed webhooks with replay, MCP, logs), brand |

**The chat and direct manipulation contract:**
1. **Parity:** every page action is an Operator tool and every Operator action has a page; one registry.
2. **Objects, not chat state:** the chat creates and edits objects with URLs; cards deep-link.
3. **Propose, then confirm:** writes appear as cards with diff, cost and risk; one tap approves; nothing changes from a menu click.
4. **Two-way awareness:** page edits appear in the thread ("window moved to 11:00-19:00; cost down 4%").
5. **One truth:** chat numbers come from the page queries, with n and "not measured" states.
6. **History and undo** on every action.
7. **Phone and voice:** everything works on a phone and the client can speak to VP; a spoken or WhatsApp daily brief, with consent, is a v2 idea [I].

## 8. The end-to-end journey and the daily loop

| # | Step | What happens | Agents | Target |
|---|---|---|---|---|
| 1 | Hear it | Talk to a VP agent in Hinglish on the public page | Operator | 0 min |
| 2 | Sign up | Phone or Google; business name; no card for browser tests | - | under 1 min |
| 3 | Say the job | "Renewal reminders for my motor policies", or paste a website; context ingested with evidence spans | Operator, Data steward | 2-5 min |
| 4 | Pick a voice by ear | Three voices, three registers, one Hinglish line | Brief writer | 1 min |
| 5 | Talk to your agent | Docked browser call; tweak by talking ("thoda slow", "discount mat bolna") | Test pilot, Brief writer | Under 3 min from sign-up |
| 6 | Bring the list | CSV, Sheet or CRM; contract, preview, fixes, reasons, suppression | Data steward, Compliance guard | 48/50 messy rows in under 5 min (W2) |
| 7 | Ring a real phone | Verify own number by missed call; ring from a trial line or BYO | Line keeper | 15 min or less (W7) |
| 8 | Go-live checks | Series, KYC timer, A2P declaration, category, window, budget, simulations | Line keeper, Compliance guard, Treasurer, Test pilot | KYC may take days; the timer is shown |
| 9 | Launch | One card: who, when, sample, checks, cost and outcome ranges | Strategist, Operator | One tap |
| 10 | Watch | Mission control, listen, issues with reasons | Supervisor, runner | Live |
| 11 | Results | Outcomes, funnel, cost per outcome, best and worst calls, why people dropped; CRM write-back; follow-ups | Call analyst, Operator | Same day |
| 12 | Grow | Recurring campaigns, memory, learning inbox | Coach, Learner, Memory keeper | Weekly |

**The campaign manager's day.** Morning: the Today brief (outcomes, spend vs plan, issues fixed, approvals, hand-offs); approve one to three cards. Midday: mission control, flagged calls, warm transfers, hot callbacks. Evening: ask ("why is Pune pickup low?"), clear the learning inbox, schedule tomorrow. Weekly: experiments, "how she changed", compliance digest, invoice.

**Cases handled by default** (req-24; owning module):

| Case | Default handling | Module |
|---|---|---|
| Messy rows (10-digit, 0-prefix, +91, cross-format duplicates, Devanagari names, blanks) | Normalise, dedupe, a reason per row; never reject the file | campaigns |
| Opted out, DND, suppressed | Never dialled on any path; reason shown | trust-telephony |
| Out of window, holiday | Deferred to the next window in local time | campaigns |
| Busy, no answer, switched off, voicemail, IVR | Early detection with a Hindi and regional lexicon, retry ladder, minimal billed seconds | voice, campaigns |
| Wrong person or relative | Confirm identity before account details | voice |
| "Call me later" | Callback inside window and budget | campaigns |
| "Dobara call mat karna" | Opt-out applied tenant-wide at once | trust-telephony |
| "Aap AI ho?" | Honest answer, never a denial | voice |
| Angry, elderly, switching language, noisy line | Warmth down and straight answer; pause-tolerant preset; follow the caller; no greeting loops | voice |
| Crisis words | Tele-MANAS 14416 or 112, and a human alert | trust-telephony |
| Payment on the call | Refused; link on the client's domain by WhatsApp or SMS | trust-telephony |
| Tool or provider failure | Spoken wait line, graceful path, issue logged; failover below | voice, economics-platform |
| Spend cap, flagged or barred number, KYC pending | Pause at a call boundary; pause that CLI; tests continue while production waits | economics-platform, trust-telephony |
| Recording refused, DPDP request | Honoured; forget follows the person | memory-omni, trust-telephony |

**Failover (proposed; `open.2026-10-20.product-failover-policy`).** Test calls never fall back. Production health-checks before dialling and routes the whole call to a healthy declared stack. Mid-call, only a pre-declared same-voice fallback is allowed, written into the run manifest; otherwise she closes politely and a callback is scheduled.

## 9. Phasing skeleton

**Phase 0: prove the call (gates before launch).** Round-2 human ratings pick the default stack, with a second voice path ready (`open.2026-10-20.round2-human-ratings`, `risk.2026-10-20.google-dependency`). Handset stereo battery on VP and incumbents (KC6; W3-W5). Turn-taking at 5% cut-ins or less with p50 1.2 s or less, including the 2.4 s elderly pause. Listener panel vs human references; the light disclosure may cost 5 points of hang-ups at most, and if it costs more its wording and placement change, never its presence. 10-15 buyer interviews (none has run) and counsel on sender status and renewal solicitation (KC8). The A2P declaration export before the first production campaign (due about 2026-11-17/18).

| Phase | Scope | Why (evidence) | Exit criteria |
|---|---|---|---|
| **v1: parity made better, India-native, with the voice** | Talk to VP with full API/MCP parity; brief v2 generalised; measured stack picker with all-in INR; Hinglish mode; turn-taking panel; warm transfer; versions and splits; tests gating publish. Contacts with consent, DND, attempts. Category-first campaigns with retries, budgets, follow-ups, inbound. Guided BYO numbers (Plivo primary, Exotel, Vobiz), A2P export. Trust core M1, M2, M4, M6 with disclosure and crisis predicates. Call page, funnel, mission control, failed-call finder, visible judges, Q&A. INR wallet, per-second metering, caps. Presets: insurance renewal, lending pre-due, reminders. Late v1 (Plus, proposed): preference memory | 21 must-be items plus A-D (WT §5); 0 of 6 ship the India layer; Retell already ships a contact memory brief, so basic memory is parity | W1, W2, W6, W7, W8, W10 pass on VP; KC6 met at the handset; three design partners live with outcomes wired |
| **v2: she remembers and gets better** | Relational memory across voice, WhatsApp, SMS, email; commitments; contact timeline; openers from the contact's data and last interaction; app events with consent. Learning inbox: line hazard, Coach proposals, fixed-horizon tests, per-tenant A/A, expiry, "how she changed for you". Wave 2: consented leads with the consent ledger (M5) and 140xx; feedback after counsel; collections after RBI 2027-01-01. Dedicated brand voice | Owner order: memory and personalisation before self-learning (req-32, req-34); memory needs one call to prove (L6) | Recall 95%+; preferences ignored 1 in 20 or less; p50 still 1.2 s; A/A false winners 5% or less; lifts with intervals |
| **v3: learns at scale, costs less** | Guarded ramping and discounted bandits for tenants at about 1,000+ calls a day on one script; segment priors from consented aggregates (10+ tenants, contract clause); invariant-lessons library. Cheaper ears and voices that pass the ear test (thresholds about 250k-2.5M min/month, ECO §4); self-hosted option for BFSI residency; regional languages; dialect opt-in only; command-centre layers (req-18) | Bandits pay only at volume (L6 §4.3); no measured stack reaches INR 2 at 40% margin (ECO §0) | Measured cost per minute; per-tenant lift with intervals; no guardrail breach |

**Dated constraints:** CNAP 2026-11-01; BLOCK PROMO about 2026-11-03; A2P pre-declaration about 2026-11-17/18; Gemini 3.1 Live and 3.1 flash TTS shut down 2026-11-17; wrong-category template blacklisting about 2026-12-17/18; RBI recovery conduct and the Gemini TTS price doubling 2027-01-01; gpt-4.1-mini retires 2027-04-14; DPDP core duties about 2027-05-13.

## 10. The 9 modules and how they connect

| Module | Owns | Consumes | Produces |
|---|---|---|---|
| workspace | Operator, threads, plans, cards, Today, onboarding, app shell, chat-page contract | All tools via the API | Plans, approvals, actions |
| voice | Brief and `compile()`, agenda ledger, stack catalogue, turn-taking, reply door, voices, simulations | Memory brief, contact variables, offering facts | Calls, turns, run manifests |
| campaigns | Intake to audience, campaign policy, dialer, retries, follow-ups, inbound | Contacts, agents, numbers, budgets | Attempts, follow-ups, events |
| intelligence | Call and campaign analysis, judges, outcomes, funnel, mission control, issues, Q&A | Calls, turns, outcomes, costs | Insights, issues, signals |
| memory-omni | Connectors, sources, contacts, facts, memory brief, forget | Calls, episodes, uploads | Contacts, audiences, memory briefs |
| learning | Hazard detection, propose-probe-compose, experiments, statistics, lessons | Signals, versions, simulations | Proposals, decisions |
| trust-telephony | Predicates, numbers, series, KYC, A2P, DPDP, roles, audit, security, residency | Everything at its gates | Allow or block with reasons; audit |
| economics-platform | Metering, pricing, wallet, caps, architecture, latency budgets, reliability, API/MCP/SDK, integrations, radar | Cost lines, events | Prices, invoices, SLOs, the API, radar digests |
| design-language | Identity, motion, sound, tone, components, key screens | All surfaces | The look, the feel, the words |

**Flows** (diagram-ready):
1. Client ⇄ workspace (Operator) → tool API (economics-platform) → every module.
2. memory-omni → audience → campaigns → attempt → dial gate (trust-telephony) → carrier → voice → call and turns.
3. memory brief → voice → reply door (trust-telephony) → TTS.
4. Call → intelligence → outcomes and issues → workspace cards, and → learning → proposal → approval → new version in voice.
5. Every call and action → meter (economics-platform) → wallet and caps; every write → audit (trust-telephony).
6. Scout → graph inbox → VP's owner.

**Shared contracts:** the object model (§5); events (attempt.*, call.*, campaign.*, outcome.*, proposal.*, predial and pre-call hooks: SCH); the tool registry with risk classes; one `compile()`, one dial path, one reply door; the run manifest; the INR cost-line schema; evidence grades in the UI.

## 11. Decisions the owner still makes

1. **Pricing unit and launch price** after the default stack: all-in per connected second for self-serve, per-outcome only for managed design partners (proposed). The INR 2.99 Base tier assumed a stock Azure voice rated 1.5-4.5 of 10, so it is stale (`open.2026-10-20.reprice-tiers`); INR 2 is a scale-stage target, not a launch gate (ECO §4).
2. **Default voice stack** after round 2 (owner leans to Gemini TTS), plus the second path.
3. **Speech-to-speech** only as a premium stack after a 200+ turn gate-violation battery: Live costs INR 4.2-5.7/min at 3-minute calls against 0.94-1.56 for cascades, and 3.8 Live talked over callers on 42% of turns [M] (`open.2026-10-18.s2s-vs-gate-law`).
4. **Production failover** (§8).
5. **Runtime split** (proposed): port the Python lab as a separate realtime voice service; control plane in TypeScript on Postgres (Neon allowed). Reverse if a TypeScript port matches battery latency with less operations work.
6. **Preference memory in late v1** (proposed) or v2.
7. **First design partners:** insurance intermediaries, lenders or subscription businesses.
