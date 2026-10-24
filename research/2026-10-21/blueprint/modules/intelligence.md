# Intelligence: every call and every campaign, understood

**Module id:** `intelligence` · **Status:** proposed, for owner review, 2026-10-21 (`directive.2026-10-21.blueprint-end-to-end`) · **Grades:** [M] measured, [C] computed, [O] observed, [V] vendor-claimed, [I] inferred, [U] unknown · **Companion data (build-grade):** `data/blueprint/intelligence-module.json` (34 reason codes, 20 default monitors, 22-metric layer, judge defaults, export schema, webhook and state rules).

**What this module owns.** How the client sees and understands every call and every campaign: the call page, outcomes and judges, failure explanation, the campaign view, live mission control with the Supervisor, issues and monitors, Q&A ("Ask VP"), reports, export, signed webhooks and CRM write-back. It consumes calls, turns, attempts, outcomes and cost lines; it produces analyses, issues, signals for the learning module and cards for the Operator.

**The promise in one line.** Open any call and know in ten seconds what happened, why, what it cost and what to do next; open any campaign and see where every rupee and every person went, in plain words, with nothing claimed that was not earned.

**Owner requirements honoured.**

| req | Owner words | Where it lands |
|---|---|---|
| req-21 | "give him the whole view of the campign and each call" | Campaign view (funnel to outcome, cost, drivers, drop-off ribbon, objections, best/worst) and the call page |
| req-22 | "they can see the voice, every voice call recording" | Stereo recording on every recorded call, play-from-here everywhere, links in export. Only exception: the caller declined recording or retention ended; the page says which |
| req-25 | "overview analytics and extremely depth analysis" | Today brief and campaign overview for the owner; call page turn timeline, run manifest and compliance trace for depth |
| req-26 | "amazing ai analysis of those" | Call analyst agent: summaries, outcomes with quoted evidence, objection clusters, drivers, Q&A with play-from-here |
| req-27 | "see the how it's changing for them" | "How she changed for you" timeline with measured deltas and intervals (shared with learning). Honest limit: never "self-improving on its own" below about 1,000 calls a day on one script (L6 s.1) |
| req-45 | "really value adding in real life ... not on the paper" | The headline is cost per **earned** outcome against the client's own desk cost; outcomes from systems of record, not model opinion |
| req-46 | "full filling every requirement of our clients ... amazing result and experience" | Client-owned outcome definitions in business language, CRM write-back, one-file export, daily brief, every failure with an action |

---

## 1. The benchmark: best competitor per sub-area, and where each falls short

Nobody has placed a billable call on any of these platforms for us yet, so everything below is what their dashboards, APIs and docs show, not how they behave under load.

| Sub-area | Best today | What they do best | Where they fall short |
|---|---|---|---|
| Call log and call detail | **Retell** (Synthflow for telephony depth) | 13-column Call History with Cost, End Reason, Session Outcome, User Sentiment, End-to-End Latency [O wt-retell-40, `research/2026-10-21/walkthroughs/retell/report.md` s.10]; per-product per-second cost lines and per-component latency (asr, llm, tts, e2e) on every call, PCAP, rerunnable analysis [O RAP-36/51, RET-15]. Synthflow: SIP ladder, per-leg RTT/jitter/loss/MOS [O SYN-08] | Retell: 39 engineering reasons only; business outcome is a custom field; "Session" vocabulary; export not visible; India reasons absent. Synthflow: failure labels are raw Python exceptions and internal URLs [O SYN-71] |
| Failure reasons | **Sarvam** for structure | Attempt separate from interaction, failure_reason and ended_by, retry counters [O SAR-16/17] | carrier field deprecated and always null; Vapi has 638 provider-keyed codes and shows them truncated (`call.start.error-get-assista...`) [O VAP-13, wt-vapi-38/39]; ElevenLabs 5 call results [O EL-12]; none names DND, CLI/DLT rejection, an operator announcement or a window; none has a business outcome field (XS-20, `research/2026-10-20/account-phase/SYNTHESIS.md` l.119) |
| Outcomes and judges | **Retell** (visible defaults) and **Vapi** (programmable QA) | Retell seeds Call Summary, Call Successful, User Sentiment visibly [O retell 76]; Vapi structured outputs feed scorecards, 51 of 143 public operations are QA [O AP-16, XS-37]; Sarvam's collections disposition model with self-QA flags `bot_went_on_loop`, `is_hallucinating` [O SAR-60] | Bolna writes two judges into every agent within 25 s and hides them from its list endpoints [O `evidence.2026-10-20.acct-bolna-auto-judges`]; nobody pins the judge model visibly or measures judge agreement with the client's truth; a 90%-accurate label inflates sample needs 1.8-2.4x [C L6 L09] |
| Campaign analytics | **ElevenLabs** (breadth, honesty), **Bolna** (funnel) | 12 analytics tabs, group-by, branch filter, IST date, honest `---` on empty data [O `7-analytics.png`]; Bolna campaigns ship funnel and termination-reason reports [O `research/2026-10-20/account-phase/bolna/report.md` s.11] | 0 of 5 APIs group cost by campaign or contact [O XS-27/28]; Vapi /analytics cannot group by campaign or contact [O AP-37]; Retell and Sarvam draw "0 ms" or a decorative line on no data [O retell 43, sarvam 29]; Exotel renders a blank broken frame [O exotel-23]; Bolna's Metabase iframe has no cost, latency or outcome chart [O bolna walkthrough s.10] |
| Monitoring and issues | **Vapi** | Issues with Critical/Warning, MTTR, Calls Impacted 1h/24h/7d, categories incl. Compliance; free default monitors offered [O wt-vapi-37, `71-mon-issues.png`, `72-mon-monitors.png`] | Alpha; "Great news! There are no active issues" with zero monitors configured [O wt-vapi-37]; Retell Alerting rows show mismatched titles and metrics [I wt-retell-42] |
| Live control | **Retell** (API) and **Exotel Harmony** (supervisor UX) | Retell: listen-live subscribe-only, take-over, update-live-call injects context and can force a regenerate [O RAP-40, `research/2026-10-20/account-phase/retell/report.md` l.109]. Exotel Harmony "Monitored Bot": live sentiment, Sentiment Crash and Repetition Loop alerts, barge in [V/O `research/2026-10-20/teardown/exotel/report.md` l.9] | Retell's take-over controls are only hinted in the dashboard [O wt-retell-52]; Exotel's is a separate contact-centre product; Vapi's Mission Control is flag-gated alpha [O VAP-06]; nobody ties crisis words to a predicate and a helpline |
| Q&A over calls | **Retell Conductor**, **Sarvam Boards** | Page-aware chips "Summarize call patterns", "Filter failed calls" [O retell 41]; Sarvam: AI-drafted read-only SQL boards over ClickHouse with cron email/Slack [O account-phase sarvam report] | Answers are not tied to quotes with play-from-here, and nothing guarantees the chat number equals the page number |
| Export, webhooks, CRM | **ElevenLabs** (signed hooks), **Vapi** (Export All) | HMAC signatures, auto-disable after 10+ failures [O ElevenLabs account-phase report s.4]; Vapi log Export All [O wt-vapi-38] | Sarvam webhooks unsigned, post-call only, English-only transcript [O `evidence.2026-10-20.acct-sarvam-webhook-model`]; Vapi default delivery has no retry and sends the whole call on every event [O AP-29/31]; Exotel admits mislabelled outcomes and duplicate rows [O EXO-58] |
| Search and retention | **Retell / Vapi** | Filters by agent, number, type, time [O wt-vapi-38] | Vapi free history 14 days [O]; SquadStack call search presets end at 10 days and failures show only as aggregate counts [O SQS-18/28] |
| Cost visibility | **ElevenLabs** | Per-conversation charging block: platform, LLM irreversible vs speculative, TTS, ASR, analysis, burst [O ElevenLabs account-phase s.5] | USD only; no grouping by campaign, contact or outcome anywhere; Retell's AI QA is a separate USD 0.10/min meter, INR 28.5 for a 3-minute call [O RET-58; C at FX 95] |
| Freshness and versions | **Exotel** | A version column in the call log and a live concurrency meter with last-updated time; reports state "up to 30 mins" lag [O exotel-22/24/25] | 30-minute lag; three shells |

**The common hole.** Every incumbent describes the *call* in engineering terms. None describes the *business result* with evidence, none explains an Indian failure in Indian terms, and none tells the client how much to believe a number.

---

## 2. Rules this module lives by (derived from the evidence)

1. **One metric layer.** Every number on a page, in a chat answer, in the daily brief and in an export comes from one catalogue of named metrics defined once in code (22 metrics in the companion JSON). The Call analyst composes questions from the catalogue; it never writes a number itself (HV law 11, "identifiers are checked by provenance").
2. **Outcomes are earned, labels are guesses until calibrated.** A system-of-record event (payment webhook, CRM disposition, booking) makes an outcome *verified*. An LLM extraction is an "AI guess" until its agreement with verified outcomes is measured (P10; L6 L09).
3. **Quotes are spans.** Every quote anywhere is an exact substring of the stored transcript at a cited audio offset, checked in code before display; unverifiable quotes are dropped and counted.
4. **Code first, model second.** Agenda completion, latency, cut-ins, heard text, hang-up moment, compliance trace and cost come from code. The model writes summaries, clusters objections, extracts with spans and explains. A model never grades its own work (HV law 9; `rejected.harvest.12`).
5. **No writer means "not measured", never zero** (HV law 21). Empty, zero, loading, failed, not measured, under-powered and sample look different everywhere.
6. **Observed is not causal.** Drivers outside a randomised experiment carry "observed, not causal"; small groups carry "under-powered: about N more calls". No "winner" badge from daily two-arm peeks (`rejected.2026-10-17.k2-dashboards`).
7. **Honest health.** No "all good" unless monitors are on and have been read back at least once.
8. **India by default.** Reasons, codes, windows and categories in Indian terms; IST; INR; Devanagari and Latin both first-class; numbers masked by role.

---

## 3. Objects this module adds or fills (extends spine §5)

| Object | Key fields |
|---|---|
| **Call** (filled) | version, combination id, run manifest, stereo recording ref, transcript {native, romanised, english?}, engineering reason, carrier code {SIP, Q.850, provider name}, reason code (catalogue), business outcome {value, source verified/extracted, earned_at}, judge results, cost lines, compliance trace, memory proposals, analysis status |
| **Turn** (filled) | speaker, audio start/end offsets, heard text vs planned text, language, latency segments {ears final lag, hold, brain first token, first clause, voice first audio, phone leg (I)}, overlap flag, ledger events, person-reading state |
| **ReasonCode** | code, stage (precheck, dial, connected, conversation), business reason EN and Hinglish, action, retry rule, who fixes, charged? |
| **OutcomeDefinition** | name, values in business language, verified source (webhook, CRM field, booking table), leading indicator (e.g. payment link opened), delay window, owner |
| **JudgeVersion** | name, kind (code, LLM extraction, LLM text), dated model id, prompt hash, temperature 0, created_by (person or "VP default"), visible: always |
| **Calibration** | judge version, paired calls (n), agreement, Wilson 95% interval, per-value confusion, status {uncalibrated, calibrating n/50, trusted, not trusted}, next audit |
| **Monitor** | signal, threshold, window, severity, auto action (with autonomy class), last evaluated, last read back |
| **Issue** | cause, category {Safety, Compliance, Telephony, Conversation, Speed, Integration, Cost, Analysis}, severity, calls impacted 1h/24h/7d, first seen, MTTR, status {open, acknowledged, fixing, resolved, verified}, fix link, owner, linked proposal |
| **LiveSession** | call id, listeners (audited), whispers (text, author, time), take-over (human id, time) |
| **Insight** | claim, metric query, n, interval, label {observed/causal/under-powered}, cited calls and spans |
| **Report / Export / Delivery** | schedule, recipients, channel, contents, PII class, audit row, delivery status |

---

## 4. What VP's agents do, and what the client sees and approves

| Agent | Does for the client | Client sees | Client approves |
|---|---|---|---|
| **Call analyst** | Runs the post-call pass; writes summary, outcome extraction, objections, commitments, memory proposals; clusters objections; builds drivers, best/worst calls; answers questions | Analyses with quotes and play-from-here; "AI guess" or "verified" on every outcome | Outcome definitions, judge edits (each creates a version and re-baselines), calibration labels |
| **Supervisor** | Watches every live call for crisis words, loops, anger, opt-outs, AI-identity questions, payment asks; ends runaway calls through the hang-up guard (A3); keeps crisis calls open | Live tiles with alert chips; a timeline of what it did, with undo where possible | Nothing per alert; take-over is human only and never exposed to a model (`workspace-tool-registry.json` live.takeover) |
| **Operator** ("VP") | Daily brief, answers in chat or voice, turns issues into cards | Today brief; cards with diff, cost, risk | Card actions (A2) |
| **Concierge** | Finds the failing call when asked "Ramesh ko call kyun nahi gayi?", explains, proposes the fix, escalates to a human in IST hours | The call, the reason, the action | The fix |
| **Treasurer** | Cost lines, cost per outcome, spend pace; stops at caps (A3) | INR everywhere, per call, contact, campaign, outcome | Cap changes (A2, Owner) |
| **Line keeper** | Pauses a CLI whose early-hang-up ratio threatens a TRAI reg 21A flag (A3) | Number health with the reason | Re-enable or replace (A2) |
| **Memory keeper** | Proposes facts with exact quotes from each call | Memory proposals on the call page | Commitments and money facts; opt-out applies at once |
| **Coach / Learner** | Turn issues and drop-off flags into proposals and tests | Learning inbox; "How she changed for you" | Proposals and experiments (learning module) |

Nothing in this module launches, publishes, spends or deletes. Its only A3 actions lower risk or spend (pause a CLI, pause a campaign on an opt-out spike, stop at a cap, end a runaway call), each with a notification and undo.

---

## 5. Flows, step by step

**F1. A call ends and becomes understood (target: complete page p95 within 60 s of hang-up).**
1. Hang-up event with engineering reason and carrier code (1 s).
2. Meter writes INR cost lines per second (5 s).
3. Transcript of record: ASR finals ordered by audio offset with `\p{M}` kept (HV law 29); a non-speech probe flags spans where the transcriber may have invented text (HV law 27, `rejected.harvest.10`); romanised copy by deterministic transliteration (no model, no cost).
4. Code analyses: ledger completion, latency segments, cut-ins from the two stereo channels, heard-vs-planned text, mood per turn (voice module `person_reading` signals), reply-door interventions, compliance trace, the moment at hang-up.
5. One LLM pass with cached instructions: summary, outcome extraction, objections, commitments, memory proposals, each with spans. Cost about INR 0.17 per 3-minute call [C: gemini-3.5-flash-lite list price, `research/2026-10-18/lanes/g3-cascade-measured/results/cost_inputs.csv`], shown as the "analysis" cost line. English translation runs only on demand (about INR 0.43 per 3-minute call [C]), cached.
6. Span check in code; failures dropped and counted.
7. Signed webhooks; CRM write-back through the durable outbox (confirmed / not_executed / unknown; unknown never auto-retried, HV law 17).
8. Monitors evaluate; Issues open or update; Supervisor and Operator notified.
9. Later, when the payment or CRM event arrives, the outcome flips to *verified*, cost per outcome updates, and judge agreement gains one paired call.

**F2. Find a failed call (task T5, target under 60 s each, 5/5 correct, 4+ actionable).** Three doors, all one click from anywhere:
- Today shows open Issues first ("policy_lookup returns 404: 23 calls in 1 h, High").
- Campaign > **Not called / Not connected / Ended early** tabs group every non-outcome by reason with counts and one action per group.
- Ask VP: "Sunita ji ki call kyun fail hui?" returns the call card with reason, carrier code and action.
The five induced failures map to `PRE_NUMBER_INVALID` (fix row 12 in CSV), `DIAL_BUSY` (SIP 486, retry at the shown time), `END_EARLY_HANGUP` (3 s, during the opening, play it), `END_TOOL_ERROR` (404 on the named URL, fix and test the tool) and `PRE_WINDOW` (next slot shown, widen window needs the Compliance role) (companion JSON `t5_mapping`).

**F3. Define the outcome by talking.** Client: "Renewal tabhi maana jaaye jab payment aa jaaye." The Operator drafts an OutcomeDefinition: values `renewal_paid`, `promised_with_date`, `needs_human`, `not_interested`, `wrong_person`; verified source = payment webhook (or CRM field after mapping); leading indicator = payment link opened; delay window 7 days. One A2 card; on approval every past call is re-scored and trends re-baseline. If no source is wired, the card says plainly that outcomes will stay "AI guess" and offers to wire one.

**F4. Calibrate a judge.** For any LLM label, the calibration panel pairs it with verified outcomes as they arrive; where none exist, the manager rates calls in a 10-second keyboard flow (1-5 keys, audio autoplays the decisive span). Status moves uncalibrated → calibrating (n/50) → **Trusted** at agreement 0.90 or more with a Wilson 95% lower bound of 0.80 or more (about 46 of 50 or 88 of 100 [C]) → re-audit monthly on 5% and on any model change. Until Trusted the label cannot feed experiments, the north star or a "winner".

**F5. A live crisis.** The caller says something in the crisis lexicon. The reply door (R5) suspends the agenda and gives Tele-MANAS 14416 and 112; the Supervisor raises a Critical alert to the on-duty person (in-app plus WhatsApp if consented) within 5 s; she never ends that call first. The human listens (audited), can whisper context, or takes over; the agent leaves permanently and the transcript marks "Priya (human) joined 02:14". An Issue records the follow-up owner.

**F6. Ask VP.** The docked panel knows the page ("ask about this campaign"). It maps the question to catalogue metrics and filters, runs the same queries as the page, retrieves supporting spans, verifies them, and answers with number, n, interval, label and up to 3 quotes with play-from-here, plus "How this was computed" and "Open as chart". If the question is causal and no experiment exists, it says "observed, not causal" and offers the test with its sample size.

**F7. The daily brief.** At the client's chosen time (default 09:15 IST, in-app and email; WhatsApp in v2 with consent): outcomes earned yesterday (verified vs AI guess), spend vs plan, cost per outcome vs the client's own baseline, issues opened and resolved with MTTR, one 30-second "listen to this" clip, approvals waiting, what is scheduled today.

**F8. Export and write-back.** One click per campaign: CSV or XLSX with the T6 six (number, outcome, extracted fields, transcript, recording link, cost) plus reason, carrier code, version and commitments. Recording links are signed and expire in 7 days; every export is a PII-egress audit row, watermarked (`contact.export` policy class).

---

## 6. The screens (full specs in the `screens` field)

1. **Call page** (1280 and 390 px). 2. **Failed-call finder** (Calls list with reason groups). 3. **Campaign overview** (funnel with a reason at each drop, cost per outcome, drivers). 4. **Where people drop and what they say** (drop-off ribbon plus objection clusters, best and worst calls). 5. **Mission control** (live). 6. **Issues and monitors.** 7. **Outcomes and judges** (definition, judge versions, calibration). 8. **Ask VP answer card.** 9. **Today: daily brief.** 10. **Export, webhooks and CRM write-back.** 11. **How she changed for you.** 12. **State gallery** (the states every widget can be in).

---

## 7. Defaults, with values

| Setting | Default | Why |
|---|---|---|
| Funnel stages | Rows → Valid → Eligible → Dialled → Connected (a person) → Conversation (10 s+ and 1+ caller turn) → Agenda done (ledger) → Outcome (verified) | Bolna has a funnel; nobody puts a reason at every drop or separates machines from people (HV law 20) |
| Early hang-up | under 10 s | L6 power tables use it; 15% → 10% needs 686 connected calls per arm [C] |
| Default judges | Summary, Agenda done (code), Outcome, Mood path, Objections, Commitments; created visible and editable | Retell shows its defaults; Bolna hides its own |
| Judge pinning | dated model id, prompt hash, temperature 0, blind to version and arm | Silent model reroutes exist (ElevenLabs: `risk.2026-10-20.acct-elevenlabs-silent-model-fallback`) |
| Trusted label | 0.90 agreement, Wilson lower bound 0.80, n 50+ | C; L6 L09 inflation |
| Under-powered | shown unless the 95% interval excludes 0 and each group has 100+ units | L6 formula, reproduces 686 / 1,565 / 963 |
| Drop-off flag | P(hazard > 1.25x expected) ≥ 0.99, 50+ callers reached that moment | L6 s.4.8 |
| Fast lane | 3x+ expected hazard and 10+ hang-ups at one moment in the first 30 connected → High issue + Coach proposal | Owner's "90 of 100 dropped after a line" is visible in tens of calls [I] |
| Monitors | 20 on by default (companion JSON) | Vapi offers them opt-in and then says "Great news" |
| Live tiles | refresh under 2 s; listen and take-over audited | Retell API pattern |
| Masking | Viewer role sees masked numbers; Aadhaar, PAN, card and CVV redacted in transcripts by default | Retell's PII list lacks Aadhaar/PAN [O] |
| Recording links | signed, 7-day expiry, every access audited | DPDP processor duties (RS-29) |
| Webhooks | HMAC-SHA256 always on; 8 retries over 24 h; replay 30 days; auto-disable after 50 consecutive failures with an Issue | Sarvam unsigned; Vapi no retry by default |
| Search | the full retention period, any field, under 1 s p95 | SquadStack 10 days, Vapi free 14 days |
| Daily brief | 09:15 IST, in-app plus email | owner persona reads on a phone |
| Analysis cost | default pass inside the all-in price, shown as a cost line; translation on demand | Retell AI QA is a separate USD 0.10/min |

---

## 8. Beyond everyone: things no competitor does

1. **Business-language Indian failure reasons with a carrier code and an action** on every attempt, including DND block, caller-ID or DLT rejection, operator announcements and windows (34-code catalogue). Today the best is 638 provider codes.
2. **A drop-off ribbon aligned to the moment she was speaking** (hang-up timestamp against TTS clause events, mapped to agenda moments, with credible intervals and a fast lane for catastrophic moments). No vendor documents per-line hang-up hazards (L6 s.8).
3. **Judge calibration you can see**: agreement with your own CRM truth, an interval, and the calls-needed penalty an untrusted label carries. Bolna hides its judges; nobody measures them.
4. **Heard vs planned transcript**: what the caller actually heard after a barge-in, with the overlap shown on the stereo waveform.
5. **"Why this call was allowed"**: a per-call compliance trace (category, local-time window check, suppression check timestamp, consent basis, attempt n of N, caller-ID series, disclosure at 00:04, reply-door interventions).
6. **Run manifest per call**: the exact combination, regions, brief hash, ledger version, turn preset in ms, and any fallback. Results are filed under what actually ran (`rejected.2026-10-20.preset-override-attribution`).
7. **Answers that quote and play**: every number from the page's own query, every quote a verified span with play-from-here.
8. **Honest health**: never "all good" without live monitors.
9. **Cost per earned outcome against the client's own desk**, plus cost per contact across attempts. 0 of 5 vendors group cost by campaign or contact.
10. **A TRAI reg 21A guard**: early-hang-up ratio per 10-digit caller ID, with an auto-pause before the network flags it.
11. **Emotion you can see adapting**: markers where she slowed down, dropped humour or answered first because the caller sounded hurried, worried or irritated.
12. **"How she changed for you"**: every adopted version with its measured delta and interval, or "under-powered".
13. **A crisis protocol that is a predicate plus a human**, not a prompt line.
14. **Hinglish Q&A by voice or text** on any page.

---

## 9. Emotional voice, memory, personalisation and self-learning, here

- **Emotional voice.** The call page is audio-first: two-lane stereo waveform, play-from-here on every line, clips in the daily brief. A **mood path** ribbon under the transcript shows the caller's state per turn from code signals (speech rate, loudness against the call's own baseline, overlaps, answer latency, lexical cues; voice module `person_reading`), and **adaptation markers** show what she did about it ("slowed to 0.92x", "straight answer first, goal waits"). Naturalness per call and per version: words per turn, question-ending rate, cut-ins, reply gap, short replies kept, language hold. Warmth is never scored by an audio-LLM judge (`rejected.harvest.09`); it comes from the periodic human listening panel.
- **Memory.** Each call shows **memory proposals** with the exact quote and span ("shaam ko 6 baje ke baad" at 01:42, proposed: best time after 18:00) for approve, edit or reject; opt-outs apply at once; language and pace auto-apply with undo; commitments and money need review (`rejected.2026-10-20.raw-fact-memory`). It also shows **what she used from memory** in this call and whether she used it right. Contact pages show the cross-call timeline (v2).
- **Personalisation.** The call page lists which contact fields and memory items shaped the opening; campaign drivers compare outcomes by segment so a client sees whether personal openers help, labelled observed, not causal, until an experiment runs.
- **Self-learning.** Issues, drop-off flags, objection clusters and empty-short-reply counts are the signals the learning module consumes; every proposal links back to the calls that motivated it; "How she changed for you" closes the loop for the client (req-27). Copy rule: "remembers every customer, shows where calls fail, proves the changes you approve".

---

## 10. Metrics and targets (detail in the `metrics` field)

Proof tasks: **T5** under 60 s each, 5/5 correct, 4+ actionable (W6 pass bar; kill if the incumbent median is under 2 min with 4/5 actionable); **T6** export 6/6 in under 2 min; **judge agreement** ≥ 0.90 with lower bound ≥ 0.80 on verified keys before any label is trusted, and ≥ 0.95 on synthetic hidden-key callers. Speed: call page complete p95 ≤ 60 s after hang-up; live tiles ≤ 2 s; search ≤ 1 s p95. Honesty: 100% of quotes verified spans; 0 chat-vs-page number mismatches in a 200-question audit; 0 "all good" with no live monitors; 100% of crisis calls alerted within 5 s with helplines. Coverage: unknown reasons ≤ 2% of failed attempts after 30 days. Cost: default analysis ≤ INR 0.20 per connected call. Results: 60%+ of live campaigns with an outcome wired to a system of record by day 30.

---

## 11. Phasing

**v1 (design-partner launch).** Call page complete (stereo player, native and romanised transcript, on-demand translation, turn timeline, heard text, run manifest, compliance trace, cost lines, reason and action, visible judges, memory proposals hidden until memory ships); reason catalogue v1 with carrier mapping for the primary carrier; outcome definitions with webhook or CRM verification; calibration panel; failed-call finder; campaign overview (funnel with reasons, cost per outcome and per contact, drivers by hour, number, segment and version with labels, best/worst calls, objection clusters); drop-off by moment with intervals and the fast lane; mission control (live tiles, concurrency, listen, text whisper, take over, crisis/loop/opt-out/AI-question alerts; anger alerts marked beta); issues and 20 default monitors; Ask VP over the metric layer; daily brief in-app and email; T6 export; signed webhooks with replay; CRM write-back for the first partners' CRMs.
*Evidence:* call log with recording, transcript, cost and reason, export with extracted fields and a post-call judge are 3 of the 21 must-be items (WT l.428); W6 is a stated hypothesis with a kill bar (TS l.328); req-21/22/25/26 are must; VP owns the voice pipeline and the Plivo line (`asset.voicelab.plivo-line`, `asset.voicelab.agenda-ledger`, `asset.voicelab.cost-meter`, `asset.voicelab.combo-identity`), so clause-aligned hang-ups and per-turn telemetry are buildable now.
*Exit:* T5 and T6 pass on VP; 3 partners with outcomes wired; at least one judge Trusted per partner.

**v2 (she remembers and gets better).** Calibrated per-tenant expected hazard curves and automatic flags feeding Coach; memory proposals live and contact timeline; "How she changed for you"; custom boards with read-only SQL for developers (Sarvam pattern) on the same metric layer; scheduled reports; WhatsApp daily brief and alerts with consent; Hinglish voice whisper; judge drift monitors; anger and mood alerts promoted out of beta once precision is measured; more CRMs.
*Evidence:* a 2x line is found 67% of the time at 500 calls and 94% at 1,000 [C L6 L07], so partners reach useful flags after weeks, not days; memory and learning are v2 in the spine and owner order (req-32 before req-34).

**v3 (scale).** Consented segment benchmarks (10+ opted-in tenants, about 3,000+ calls a day, aggregates only, contract clause; L6 s.3.4); outcome forecasting with intervals; a self-hosted analysis model for BFSI residency; command-centre layers (req-18).
*Evidence:* pooling raw data gave the wrong winner to 48-55% of dissimilar tenants [C] (`rejected.2026-10-17.cross-tenant-pooling`); self-hosting pays only at volume (ECO s.4).

---

## 12. Risks, rejected ideas avoided, open questions

**Rejected ideas avoided.** `rejected.2026-10-17.k2-dashboards` (no winner badges, drivers labelled); `rejected.harvest.12` (no holistic 1-10 LLM "call quality score"; best/worst ranked by earned outcome and code signals); `rejected.harvest.09` (no audio-LLM judge of voice quality); `rejected.harvest.10` (transcript of record passes a non-speech probe); `rejected.harvest.03` (crisis by predicate); `rejected.harvest.04` (no model-triggered take-over, deletion or send); `rejected.harvest.05` (write-back reports confirmed, not attempted); `rejected.harvest.14` (calibration and Q&A never run on the production voice quota); `rejected.harvest.16` (failures never degrade into success codes); `rejected.harvest.17` (paginated APIs, no return-everything endpoints); `rejected.2026-10-20.preset-override-attribution` and `rejected.2026-10-20.silent-fallback-in-tests` (run manifest of what actually ran); `rejected.2026-10-20.unguarded-hangup` (Supervisor ends calls through the hang-up guard); `rejected.2026-10-20.raw-fact-memory` (memory proposals need quotes); `rejected.2026-10-17.cross-tenant-pooling` (no raw cross-tenant benchmarks); `rejected.2026-10-17.ohio-latency` (latency always labelled with vantage); `rejected.2026-10-17.per-minute-launch` (headline is cost per outcome, not minutes).

**Top risks.** Wrong LLM labels eroding trust (mitigated by verified sources and calibration); clause alignment error from the unknown phone-leg delay (250-450 ms [I]); Indian carriers' codes for DND and CLI rejection unknown until T4; alert fatigue from Hinglish mood detection; PII exposure through listen, export and recording links; whisper as an injection path (it enters as a delimited data block and passes the reply door); clients reading drivers as causes; analysis cost creeping with custom judges; Vapi's flag-gated Mission Control and Call Health leaving alpha (VAP-06).

**Open questions.** Listed in the `open_questions` field; the most important are the Indian carriers' actual codes, whether live listening needs its own notice, which CRMs the first partners use, and the right "Trusted" threshold for buyers.
