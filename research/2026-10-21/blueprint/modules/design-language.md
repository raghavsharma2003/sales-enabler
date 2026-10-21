# Design language: how VP looks, moves, sounds and speaks

**Module id:** `design-language` · **Status:** proposed, for owner review, 2026-10-21 (`directive.2026-10-21.blueprint-end-to-end`) · **Machine-readable tokens and rules:** `data/blueprint/design-language.json`.

**Grades.** [M] measured by us · [C] computed by this module (contrast ratios use the WCAG relative-luminance formula) · [O] observed in a capture · [V] vendor-claimed · [I] inferred · [U] unknown. **WT** = `research/2026-10-21/walkthroughs/SYNTHESIS.md`; vendor captures are cited as `vendor file.png` from WT. Every "VP beats X" below is a design hypothesis until the 5-user sessions and the owner's visual review run (§11). The walkthroughs were static screenshots at 1280x720 with no calls placed, so incumbent **motion, sound, phone-width layout and call-detail pages with data are unobserved [U]**. Where I compare on those, I compare against nothing, and I say so. All people and companies in the screen specs (Saanjh Insurance Brokers, Sunita Verma, Priya, Asha) are fictional samples, and mock-ups carry the SAMPLE watermark.

## 0. The decision in one paragraph

VP looks like **a modern Indian ledger**: warm paper, dark-green ink, a terracotta seal on whatever needs you. It sets display text in a warm serif and runs in one Indian multi-script sans. It shows its working with grades, n and dates, and it is honest about money in rupees and time in milliseconds. Audio is the hero object: every call is a two-lane stereo waveform with a transcript you can click. Every voice is chosen by ear, from the same Hinglish line in three registers. Motion appears only when something real happens: a ring, a connect, a card arriving, a diff resolving. Three quiet sound cues exist, all off until you opt in. The operator you talk to is called **Saarthi** (सारथी, the charioteer who drives while you decide). It speaks like a capable colleague in plain Indian English, or in Hinglish if you write Hinglish. It never asks for approval in words; only a tap approves. Every screen has distinct empty, zero, loading, failed, not-measured, under-powered, sample and stale states, because the incumbents conflate them (§1).

## 1. Benchmark: who does each part best, and where each falls short

| Sub-area | Best today | What they do best | Where they fall short (all six) |
|---|---|---|---|
| Identity and shell | Sarvam for India relevance; ElevenLabs for polish [O] | Sarvam: native-script glyphs, India-vertical chips on the Agents hero (sarvam 02, 08). ElevenLabs: calm, explained settings (elevenlabs 44) | Exotel ships three shells with three design languages (exotel-01, 02). Bolna's two banners take about 90 of 720 px and the sidebar clips at 1280x720 (bolna report). Retell clips its primary button at 1280 px (retell 02, 75). Vapi clips its OBSERVE group (vapi 33). Exotel's onboarding is one 9-10 px banner (exotel-01). VP's own Relay look (DM Sans, indigo #5148ce, 13 px body) was rejected three times (DESIGN.md; `decision.product-ux-structural-reset-2026-10-01`; `directive.2026-10-15.codex-baseline-stale`). |
| First run | Retell checklist; Sarvam prompt hero [O] | 7 locked steps with previews (retell 71); "What should your voice agent do?" box (sarvam 02) | Retell's tour sits on every page and covers the canvas (retell 41, 76, 80). Vapi's welcome wall repeats (vapi 01). Bolna and Exotel test only by phone (bolna 01, exotel-02). Sarvam's homepage runs an anonymous Hindi EMI persona before sign-up, but it claimed to be human 6/6 when asked and shows no latency or register choice (R2 §1 [M]). |
| Copilot in the page | Sarvam Genie docked; Retell Conductor diffs and page chips [O] | Genie beside every builder tab (sarvam 03); per-setting diffs (RET-03); chips like "Summarize call patterns" (retell 41) | None was exercised, so output quality is [U]. ElevenLabs Architect is Alpha and free only to the end of October 2026 (elevenlabs 8-architect). Copilot setup is parity in 5 of 6 (WT §1.8). |
| Stack trade-offs | Vapi [O] | Latency, cost and a quality score on every row; four presets; stage-coloured bars (vapi 33, 51) | Its headline sums components and leaves out telephony and the 1.5 s turn wait (1,530 ms shown against our measured 2,319 ms demo p50 [M], l4b). Scores have no scale. ElevenLabs latency ranges span about 10x (844 ms to 8.93 s, elevenlabs 61). Bolna, Sarvam and Exotel show names only. |
| Setting explanations | ElevenLabs [O] | 1-2 sentences under every setting incl. cost; locks explained (elevenlabs 44) | Units are enums and whole seconds; no predicted reply gap anywhere (0 of 6, WT §1.2). |
| Price in the builder | Bolna [O] | Persistent per-minute bar with components on every tab (bolna 01, 16) | USD with an INR overlay; cents, dollars and rupees mixed (bolna 34, 40). |
| Gates and disabled actions | Sarvam inline gate; Bolna "Create one" [O] | "This version is not committed" with the Commit button in place (sarvam 26) | Vapi Next and Retell Send are disabled with no reason (vapi 83, retell 24). Bolna shows the India compliance gate only after the country is chosen (bolna 25). |
| Empty, zero and failed states | ElevenLabs [O] | "---" and "No data has been collected" (elevenlabs 7-analytics) | A chart drawn on no data and "0 ms" at Sarvam (sarvam 29). "0, 0s, 0ms" tiles at Retell (retell 43). A blank frame at Exotel (exotel-23). Unlabelled sample QA data at Retell (retell 46). "Great news! no active issues" with no monitors at Vapi (vapi 71). |
| Versions and state integrity | Exotel pill and log column; Retell draft/publish [O/API] | "Stable / Live" pill and "Test this version" (exotel-04-rollout) | Vapi creates and publishes a tool on a menu click and autosaves on a dropdown (vapi 57, 80). Sarvam has no save control (sarvam 03). |
| Indic display | Sarvam [O] | Glyphs, "Output numbers in Indic", 199+ voices with job tags (sarvam 08) | No Hinglish option in 6 of 6. Companion, therapist and romance voices sit in business catalogues (Sarvam voices.txt; Bolna 19). |
| Number step | Sarvam rent vs bring-your-own [O] | Rent and 7 BYO providers side by side (sarvam 23) | No Indian number price before purchase in 6 of 6. Retell asks for a Persona ID check before showing any country (retell 30). ElevenLabs defaults Region to Singapore under +91 (elevenlabs 34). |
| Live operations | Exotel concurrency meter; Retell live monitor [O/V] | "0/5" with last-updated time (exotel-25); listen and take-over (RET-07) | Vapi's Mission Control is flag-gated (VAP-06). No live spend meter seen anywhere. |
| Call detail with data | [U] | Retell's 13-column history (retell 41); Vapi and Retell per-turn latency in the API (AP-34, RAP-51) | No call was placed, so no incumbent call page with audio was seen. |
| Billing UI | Sarvam INR rate table; Bolna INR recharge [O] | Units per plan and Rs 2 per simulated run (sarvam 22); INR minutes per tier (bolna 40) | Sarvam shows an overdrawn balance (-36.58) in normal type (sarvam 20); 60 s pulse. |
| Motion, sound, phone width | [U] | Not observable in static 1280 px captures | Not observable. |

Synthflow (review-gated, USD 30k a year floor) and SquadStack (managed and sales-led) were not walked; their UI is [U].

**What I take from each:** Vapi's per-row latency, cost and grade. ElevenLabs' description under every setting and its honest empties. Bolna's persistent cost bar. Sarvam's inline gate with the fix, plus native-script glyphs. Retell's plain transfer copy, page-aware chips and draft/publish. Exotel's version pill and live concurrency meter. Each needs one fix before VP uses it. Vapi's scores become INR, India-measured p50/p90 with n and date, and a sample to hear, never an unscaled "92". Bolna's bar becomes INR incl. GST with telephony. Exotel's meter gets a spend meter beside it.

## 2. Identity

**North star: "Naya bahi-khata", the modern ledger.** The bahi-khata, the red-cloth ledger of Indian merchants, is the most trusted business object in the country. VP's job is to make every call and every rupee as accountable as that book, so the identity borrows its ruled lines, its inked figures and its warmth. It does not borrow its ornament. It starts from `/prototype`, the best look in the repo (`asset.se-live.prototype-visual-concept`: serif display, warm paper, dark-green nav, terracotta), and fixes its faults: Arial body, 10-12 px text, and a primary button of white on coral at 4.38:1 [C], below AA. Never used: generic SaaS indigo, auditor-style warning walls (Relay's failure per `docs/harvest/se-live.md`), mascots, stock illustration, paisley, sitar stings, dark-pattern urgency.

**Colour** (light; dark in the JSON). Hex values live only in `tokens.css`, and a lint bans colour literals elsewhere. Text pairs must reach 5:1 or more, the inherited law (`docs/harvest/tx-content-ui.md` l.21). One accent marks "needs you" per region. Status is never shown by colour alone.

| Token | Hex | Role | Contrast [C] |
|---|---|---|---|
| paper / surface / sunk | #FBF8F2 / #FFFDF8 / #F2EDE3 | page, raised cards, wells | - |
| ink / ink-2 / ink-3 | #1D2A24 / #4F5A53 / #5A635C | text, secondary, tertiary | 14.06 / 6.78 / 5.87 on paper |
| forest | #1F3B30 | brand chrome, nav | nav text #D9DED6 8.90 |
| terracotta / terracotta-ink | #A9472A / #8E3A21 | "needs you", primary action; links | white on button 5.80; link 7.13 |
| peacock | #1C5F70 | caller lane, information | 6.78 |
| leaf | #2D6A45 | live, done, verified | 6.08 |
| marigold-ink / fill | #7A5200 / #C98A1B | attention, stale, estimate | 6.53 |
| brick | #A12F27 | blocked, failed, overdrawn | 6.71 |
| line / line-strong | #E2DBCD / #857E70 | hairlines; input borders | line-strong 3.80 (non-text) |

Dark mode ("night desk") follows the OS by default and can be set per user. Paper #121915, ink #EEE8DC (14.64), terracotta #E28B66 with dark button text (6.91), peacock #6CB8CB (7.96). Both themes go through the same contrast gate.

**Type.** Display: **Fraunces** (Latin) with **Tiro Devanagari Hindi** (Devanagari). UI and text: **Anek Latin + Anek Devanagari** from Ek Type, an Indian foundry. One family covers ten Indian scripts, so a Tamil name in v3 sits on the same grid as a Hindi one. Fallback: Noto Sans + Noto Sans Devanagari. Mono: IBM Plex Mono, for ids and run manifests only. Body is 16 px (Relay's was 13). Dense tables run 15 px, small text 14 px, and only badges go to 12 px. Devanagari runs at 1.06x size with 1.65 line height. Serif is used only for page titles, the Today masthead and money or outcome figures at 28 px and above. Tables use tabular figures and Indian grouping (₹1,24,500). **Lock gate:** a type specimen must pass on a mid-range Android and a 1280 laptop at 14/16/18 px. It covers conjuncts क्ष त्र ज्ञ श्र, nukta, stacked matras, Hinglish transcript lines, ₹ (U+20B9) and tabular figures, and the owner signs it by eye. If Anek fails tabular figures or Devanagari legibility at 14 px, the UI switches to the Noto fallback.

**Space and shape.** A 4-pt scale (4-64). Radius 6 for controls, 10 for cards, 16 for sheets. Shadows appear only on floating layers. Touch targets are 44 px, the inherited measured fix (`docs/harvest/hp-multimodal-groupai.md` l.144). Icons are a 1.5 px rounded line set, plus custom glyphs: ring, waveform, rupee, ledger, seal (a predicate passed) and hand-off. Imagery follows one rule: real captures only. The public site shows only screens the app draws (`asset.tx-content-ui.real-capture-marketing-site-pipeline`). **Mark (proposed):** a bindu and one arc, the person and the voice reaching them. The wordmark sets "Vyakti" in Fraunces, locked up with व्यक्ति. The name is a working name; `evidence.brand-check` is a preliminary screen only.

**Layout.** At 1280 px the rail is 64 px collapsed or 216 px expanded, Talk docks at 360 px on every page, and Talk itself runs rail 64 + thread 760 + "Working on" pane 456. At 390 px there are 16 px gutters and a bottom bar: Today · Campaigns · **Talk** (centre, mic) · Calls · More. All 11 key screens are specified at both widths. No horizontal scroll is allowed, and a layout gate checks it at 390, 834 and 1280 px (`asset.hp-gurukul-late.secret-free-signed-in-layout-gate`).

**Accessibility floor.** WCAG 2.2 AA, plus the stricter inherited 5:1 for text. Every card, approval and player works by keyboard. Hold-to-confirm has an accessible alternative: a second tap within 5 s. Live tiles announce through aria-live, throttled to one update per 10 s. The caller and agent lanes differ by position and label, not colour alone. The transcript is the caption.

## 3. Voice-first UI: audio is the hero object

1. **Two-lane stereo player.** The caller lane (peacock) sits above, the agent lane (terracotta) below, both on the playback clock. Pins mark moments: disclosure spoken, objection, commitment, opt-out, cut-in, hand-off. Controls: 1x/1.5x/2x and skip silence. Waveform peaks are computed on the server (about 20 KB per 3-minute call), so the browser never decodes a WAV. Play-start target: 300 ms p75 or less.
2. **Transcript synced to audio.** The current turn is highlighted, any turn can be clicked to seek, and auto-scroll pauses when the reader scrolls. Three views: **native script** (Devanagari where spoken Hindi), **romanised**, **English translation**. Each turn carries a reply-gap chip ("1.3 s") and a cut-in marker. Turn text is only what the caller actually heard, matching the lab's heard-text truncation (`voicelab/server/calls.py`).
3. **Play-from-here everywhere.** Every quote in the app is a link to its second of audio: in a summary, an objection, a memory fact, a learning card or a Today item.
4. **Voice cards: one Hinglish line, three registers.** Each card plays the same line as Warm, Calm and Brisk, so the buyer chooses by ear (`directive.2026-10-19.hear-before-choose`; `rejected.harvest.09`: metrics alone pick the wrong voice). Each card shows languages, India-measured first audio with n and date, and INR per minute. Sample lines live in the catalogue, and a compile lint refuses them inside any brief, because sentence-shaped text gets recited (HV law 1). No card shows a "humanness 92".
5. **Live listen strip.** One tap to listen. Whisper and take-over sit behind the role check. The real carrier ringback is heard; no fake ringtone is played.
6. **Sound cues: three, quiet, opt-in.** *Connect* is two plucked notes rising a fourth (160 ms, -20 dBFS peak). *Approved* is a soft wooden "tok" (90 ms). *Needs you* is two notes falling a minor third (220 ms, at most once a minute). The timbre is a soft mallet pluck with a santoor-like attack. All three are off until a one-time question after the first browser call, with a preview button for each. Recordings never autoplay. One audio bus: starting anything pauses the rest, and live listen ducks the cues by 12 dB. When the tab is hidden, only Critical alerts sound, as system notifications.

## 4. Motion: only to show the system working

Durations are 80 / 120 / 180 / 240 / 400 ms, with a hard ceiling of 800 ms for milestones. Easing out is cubic-bezier(0.2, 0, 0, 1). The motion catalogue:

- A **ringing** tile pulses once every 1.2 s, using opacity and scale up to 1.08.
- A **connected** tile settles, and its level meter is driven by real audio levels.
- **Cards** rise 8 px over 180 ms.
- **Progress** is driven by real counts. A progress bar never runs more than 2 s without a text update.
- **Funnels** grow to their real values once, over 400 ms.
- **Diffs** resolve over 240 ms: the old value strikes through and the new one tints leaf.
- **Hold-to-confirm** fills a ring over 1.2 s. The hold is the safety mechanism (`data/blueprint/workspace-tool-registry.json` approval_token).
- **Money** never rolls; a changed value tints marigold for 600 ms.
- **Milestones**: the first real ring and the first verified outcome each ink a ledger line once, in 800 ms or less, with no confetti. This follows the inherited juice limit (`asset.tx-content-ui.juice-limits-module`).

**Banned:** decorative loops, parallax, confetti, animating layout properties, auto-scrolling a transcript the person is reading.

**Reduced motion:** every transition jumps to its end state, a pulse becomes a static "Ringing" badge, and meters step at 4 Hz. A test asserts the final states match.

**Performance budget** (mid-range Android, Fast 4G): LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less at p75; 170 KB gzipped JS per route; 100 KB of first-paint fonts (Latin and Devanagari subsets); audio start 300 ms p75. Mission control draws 50 live tiles on one canvas at 30 fps within 4 ms of script per frame. Only transform and opacity animate, and a lint enforces it.

## 5. Words

**VP's voice** is plain, warm Indian English, and Hinglish when the client writes Hinglish. It is never an auditor. Formats:
- Money: ₹ with en-IN grouping, with "incl. GST" or "+ GST" always stated.
- Latency: ms below 10 s ("1,480 ms"), always with p50/p90, n, date and vantage (server, handset or browser). Vantage matters because US-proxy numbers overstated our latency 2-5x (`rejected.2026-10-17.ohio-latency`).
- Durations: "2 m 41 s". Time: 12-hour with IST or the contact's zone.

**Patterns.**
- *What happened · why · what you can do [button]*.
- Lead with the answer, then the number, then the choice.
- One warning line per region at most; the rest live in the preflight checklist.
- Never "0" where the truth is "not measured".

**Banned in visible copy** (copy gate): "Oops", "Great news", "All good" unless monitors are live and read back, exclamation marks, ALL CAPS, emoji, em-dashes, and AI-tell words. Below learning level L4, "self-learning", "learns on its own" and "improves automatically" are also banned (`data/blueprint/learning-module-defaults.json` copy_rules).

**The Operator is named Saarthi** (सारथी), shown as "Saarthi · VP's operator".
- *Why this name:* VP's agents drive and the client decides, which is the owner's "he just has to talk" (req-13, req-14). It is a role, not a human first name, so VP's own agent never blurs being an AI. It is respectful without being a companion, and two syllables in both scripts.
- *Alternates:* plain "VP", or "Munim".
- *Reverse if:* users in the 5-user sessions take Saarthi for a person or a separate product, or a brand screen finds a conflict.

**How Saarthi speaks:**
- First person for its own work: "Maine 1,240 rows padh liye; 37 numbers theek kiye."
- Receipts name the VP agent that acted ("by Data steward") for provenance (req-68).
- At most three sentences before a card. Numbers come only from page queries, never typed by the model.
- One question at a time, with the default stated ("Main DD/MM maan raha hoon").
- It never asks for approval in words. "Haan launch karo" renders the Launch card, and only a tap approves (`rejected.harvest.04`).
- It apologises once, then fixes.

**Evidence chips in client words:** Measured · n · date / Computed / Seen / Vendor says / Estimate / Not known yet. Vendor figures never share a column with measured ones.

## 6. Persona defaults, agreed with the voice module

- **Default register** for the calling agent (req-07): **Friendly professional**. Warm on service and renewal calls, low-warm with the straight answer first on complaints and collections, light humour, *aap* with plural verbs (`data/blueprint/voice-module-defaults.json` register_defaults).
- **The persona card** shows four plain words, not sliders: Warmth, Pace, Humour, Formality. It also shows the locked disclosure line, said once and lightly after value, which cannot be removed (P5; `rejected.harvest.03`).
- **Catalogue registers allowed:** Friendly professional, Calm reassuring, Brisk efficient, Patient (elderly).
- **No companion or romance voices.** The catalogue ingest refuses names and tags such as companion, girlfriend, romance, flirty, night, therapist and ASMR, and every new voice gets a human review. The offenders seen are Sarvam's "Warm Night Companion" and "Therapist Voice" and Bolna's "Girlfriend Voice" (WT §2.5).
- **No "added office ambience" by default.** Sarvam's "Quiet office" ON pushes human mimicry (sarvam 08).

## 7. Components

1. **Thread cards** (the workspace module's 10 types): plan, diff, launch, call, chart, approval, issue, receipt, question, progress.
   - Every card is bound to object versions and an argument hash.
   - A card goes **stale** when an input changes ("List changed 4 min ago. Re-check, about 8 s") and expires after 24 h.
   - Card states: fresh, waiting for you, approved (receipt), rejected, stale, expired, failed. A receipt says *confirmed*, *not executed* or *unknown*, never "sent" on an attempt (`rejected.harvest.05`).
   - A1 work shows a receipt after the fact; A2 work needs a hold. That keeps review visible without adding friction (req-68).
2. **Evidence-graded table.** Each column header carries a grade chip. Hovering a cell shows its n and as-of time. "Not measured" cells use a dotted underline. Sorting never mixes vendor and measured figures.
3. **Readouts.**
   - *INR readout:* amount, incl./excl. GST, unit (per connected minute, per call, per outcome), n, as-of.
   - *ms readout:* p50/p90, n, date, vantage.
   - *Predicted reply gap bar:* stacked ears + hold + brain + voice + phone leg, beside the measured India p50, or "not measured" (formula in voice-module-defaults.json predicted_gap).
4. **Timelines.**
   - *Call turn timeline:* latency segments per turn.
   - *Contact timeline:* across call, WhatsApp, SMS and payment webhooks.
   - *Version story:* "how she changed for you".
5. **Funnel with reasons at every drop.** Rows → valid → callable → dialled → connected → agenda done → outcome, each drop linking to its reason codes.
6. **Meters:** concurrency ("8/10 · updated 2 s ago") beside spend ("₹1,284 of ₹5,600 cap"), in every campaign header.
7. **Version pill:** "v4 · Live 100%", "v5 · Draft · unsaved", "v5 · Testing 10%". The same pill appears in every call row.
8. **Preflight checklist:** persistent; every red item links to its fix in place (Sarvam's gate, made permanent).
9. **Disabled-with-reason button:** the reason sits under the control with a Fix link. A crawler fails the build on any silent disabled primary button.
10. **State tokens:** empty, zero, loading, failed, not measured, under-powered, sample (diagonal watermark), stale, redacted, unsaved, locked-by-role ("Ask Priya, Owner"), vendor says.

## 8. Flows, and who does what

| Step | What VP's agents do (A1 unless marked) | What the client sees and approves |
|---|---|---|
| 1 Hear it first (public, 0 min) | Operator runs a 2-minute browser demo in Hinglish | One big button "Sunke dekhiye"; three job chips; voice cards; after the call, "Her replies took 1.4 s at the median on this call (n=9 turns, measured in your browser)" |
| 2 Sign up (under 1 min) | - | Phone OTP or Google; business name; optional website |
| 3 Say the job (2-5 min) | Saarthi reads the website with evidence spans; Brief writer drafts | Talk screen; a question card with a default; a diff card of the brief with one reason per section |
| 4 Pick a voice by ear (1 min) | Brief writer proposes a register | Three voice cards, one line, three registers |
| 5 Talk to your agent (under 3 min from sign-up) | Test pilot runs the browser call | Docked browser call; "thoda slow" or "discount mat bolna" becomes a diff card |
| 6 Bring the list | Data steward maps, normalises and dedupes; Compliance guard flags | Receipt card: 1,240 in · 1,219 callable · 12 skipped (reasons) · 9 suppressed; one question |
| 7 Ring a real phone (15 min or less) | Line keeper verifies by missed call, then a confirm call | Number step, trial section; the first ring inks the milestone line once |
| 8 Go-live checks | Line keeper, Compliance guard, Treasurer, Test pilot | Preflight checklist; KYC timer with documents, time and price before any credential |
| 9 Launch | Strategist and Treasurer build the card | **Launch card, hold 1.2 s** (A2) |
| 10 Watch | Campaign runner and Supervisor (A3 only to pause, suppress or end runaway calls, with undo) | Mission control; sound cue on Critical; pause is one tap with undo |
| 11 Results | Call analyst | Call page, funnel, cost per outcome, Today brief |
| 12 Grow (v2) | Coach and Learner | Learning inbox, at most 3 cards a day, with honest statistics |

**Onboarding time (req-39).** Hearing, signing up, the first browser call and the first real ring fit in 15-20 minutes. A same-day production launch fits inside the hour for declared 10-digit numbers once KYC clears. A BFSI 1600xx number takes about 7-14 business days (`data/blueprint/trust-telephony-defaults.json`). The UI shows that timer honestly, and tests and simulations keep running while production waits.

## 9. Beyond everyone (no competitor does these; observed absent in 6 of 6 dashboards unless marked [U])

1. **Hear it before sign-up, in three registers, with honest numbers**: the same Hinglish line as Warm, Calm and Brisk, a live demo that discloses it is an AI, and the reply gap measured on that very call in the visitor's browser. Sarvam's homepage demo comes closest, but it denied being an AI 6/6 and shows no numbers (R2 §1).
2. **A predicted reply gap bar in ms** beside the measured India p50 with n and date (0 of 6 show any, WT §1.2).
3. **Evidence grades and "not measured" in the client UI.** Every number says how we know it.
4. **A two-lane stereo player with moment pins, and a synced transcript in three views**: native script, romanised and English. Sarvam stores original and English transcripts (A, interaction schema); incumbent call pages with data are [U].
5. **A compliance trace on every call**: why this call was allowed (window, suppression, basis, series, disclosure spoken at 0:06). No vendor has the fields (WT §1.1).
6. **A line-hazard ribbon over the brief**: where callers hung up, with intervals, labelled under-powered until n is enough.
7. **Agenda-ledger chips on live tiles**: what she has covered in the call so far.
8. **Approvals bound to an argument hash, with hold-to-confirm.** Spoken or typed "yes" never executes; it renders the card.
9. **Two-way chat and page awareness** [U at incumbents; no copilot was exercised]: a page edit appears in the thread ("window moved to 11 am-7 pm; cost down 4%").
10. **The Today masthead as a morning paper**, with outcomes from systems of record, not call counts.
11. **"How she changed for you"**: versions told as a story with before and after audio, labelled "fixed, not randomised" or "proved on N calls".
12. **The contact timeline as a memory you can audit**: each fact with the caller's exact quote, play-from-here, consent and a forget button.
13. **Indian money and time by default**: lakh grouping, IST and per-contact local time, GST beside every price.
14. **Opt-in, rate-limited UI sound with an Indian timbre**; incumbents' UI sound is [U].
15. **Real-capture marketing**: the site cannot show a screen the app does not draw.

## 10. Emotional voice, memory, personalisation and self-learning in this module

- **Emotional voice.**
  - Voices are picked by ear in three registers.
  - The call page draws a **mood path** under the waveform (hurried, irritated, worried, calm), labelled "signals, not diagnosis". The source is code signals plus an LLM label, not trusted until calibrated (intelligence-module.json judges_default).
  - The agent's own backchannels ("haan ji", "achha") show as small marks on her lane, so a manager can hear whether she sounds like she is listening.
- **Memory (late v1 preferences, v2 relational).**
  - The call page shows "Used from memory" chips: prefers evenings, aap, last promise 5 Nov. Each links to the call and the second it was said.
  - The contact timeline is the audit surface: approve, edit, forget.
  - Memory facts never appear without a quote (`rejected.2026-10-20.raw-fact-memory`).
- **Personalisation.**
  - The launch card shows the language split and "what she'll say to row 12", a rendered opening for a real row.
  - Per-row variables are validated against the CSV contract, with problems flagged inline.
- **Self-learning (v2 onward).**
  - The learning inbox, the levels badge (L0 Listening to L4 Optimising) and the version story.
  - The copy gate blocks "self-learning" claims below L4.
  - A/B results never show as daily winner badges (`rejected.2026-10-17.k2-dashboards`); "under-powered" is a designed state.

## 11. Metrics (targets and how measured; none measured yet)

| Metric | Target | How |
|---|---|---|
| Task success, 5 users at 1280 px | 24/25 tasks (agent+test, number step, launch, find failed call, approve a diff) | Moderated sessions; the same users repeat 2 tasks on Retell and Sarvam trials for time and error comparison |
| Same at 390 px | 22/25 | Same protocol on a mid-range Android |
| Failed call found with reason and action (W6) | under 60 s each, 5/5 correct | T5 induced failures, screen-recorded |
| Hear-it-first tap to first audio | 2.5 s p75 or less | RUM events hear_started → hear_first_audio |
| Sign-up to first browser-call audio | under 3 min median | signup_completed → browser_call_first_audio |
| State integrity | 0 violations | CI crawler: 0 server writes from menus or dropdowns, 100% reasoned disabled primaries, 0 charts at n=0, 0 "0 ms" or "₹0" on empty data, 0 unlabelled samples |
| Contrast | 100% of text pairs 5:1 or more, both themes | CI contrast gate over tokens.css |
| Type and targets | no text under 12 px; body 16 px; 44 px targets at 390 | Layout gate at 390, 834 and 1280 px |
| Web performance | LCP 2.5 s, INP 200 ms, CLS 0.1 at p75 | Lab Lighthouse on Fast 4G Android profile plus RUM |
| Audio play start | 300 ms p75 or less | RUM: tap to first sample |
| Copy honesty | 0 banned phrases; 0 below-L4 learning claims; 0 unlabelled vendor figures | Copy gate on proven-visible strings |
| Owner visual review (req-40) | direction approved in 2 rounds or fewer (Relay: rejected 3 times); all 11 screens signed | Visual review artifact at both widths |
| SUS | 80 or more | 5-user sessions |
| Sound cue mute rate | 30% or less after 7 days among opted-in users | Product events |

## 12. Phasing

| Phase | Scope | Evidence that sets it |
|---|---|---|
| **v1** | Tokens in light and dark; the type specimen gate; 11 key screens at 1280 and 390; thread cards; state tokens; player, transcript sync and play-from-here; voice cards; predicted-gap and INR readouts; mission control; compliance trace; three sound cues; motion catalogue; copy, contrast, layout, motion and state-integrity gates; English UI with a Hinglish Saarthi; Devanagari rendering for names and transcripts | Must-be D (state integrity) and A (INR and latency at every choice) in `decision.2026-10-21.wt-synthesis-must-be-changes`; three owner rejections of the look; 0 of 6 show a predicted gap or Hinglish |
| **v2** | Contact timeline with memory facts; learning inbox and version story; mood path calibrated against human labels; a Hindi (Devanagari) UI option; a spoken or WhatsApp Today brief with consent | The spine puts memory and learning in v2 (req-32, req-34); the brief needs consent and a channel decision |
| **v3** | Regional-script UI (Anek covers 10 scripts); enterprise brand accents inside token rules; command-centre surfaces (req-18); an AAA high-contrast mode | Regional languages and command-centre layers sit in spine v3 |

## 13. Risks, rejected ideas avoided, open questions

**Risks.**
- The serif and warm palette may read "traditional" to developer buyers; a 5-second preference test against Vapi and Retell captures checks this.
- Anek may fail tabular figures or 14 px Devanagari; the specimen gate decides.
- Old Android WebViews may break Devanagari shaping.
- Sound may annoy; it is opt-in, with mute metrics.
- Hold-to-confirm may slow power users; it applies to A2 only, with a second-tap alternative.
- "Not measured" everywhere at launch may look empty; that state is designed as a first-class look.
- The owner may reject the taste a fourth time; mitigate with a visual review before build.
- Saarthi needs a brand check.
- Mission control performance at 50+ live calls on low-end phones is unknown.
- Pages and chat may drift apart; one tool registry is the defence.

**Rejected ideas avoided:**
- `rejected.harvest.12`: no 1-10 holistic score badges.
- `rejected.harvest.09`: voice picked by ear, not "humanness".
- `rejected.harvest.03`: disclosure locked and enforced in code; the UI shows the trace.
- `rejected.harvest.04`: only taps approve.
- `rejected.harvest.05`: receipts carry three outcomes.
- `rejected.harvest.13`: charts are named queries, never model-drawn.
- `rejected.harvest.16`: no "all good" without live monitors.
- `rejected.harvest.19`: build the hear-it-first to browser-call journey first.
- `rejected.2026-10-17.k2-dashboards`; `rejected.2026-10-17.ohio-latency`: vantage on every latency figure.
- `rejected.2026-10-20.preset-override-attribution`: the call page shows "Ran:" with the actual combination.
- `rejected.2026-10-20.silent-fallback-in-tests`: the test panel shows invalid-with-reason.
- `rejected.2026-10-17.parity-undercut`: no price-led hero.
- `rejected.2026-10-17.cross-tenant-pooling`: no "industry benchmark" from other tenants.
- `rejected.2026-10-17.dialect-tts-wedge`: no dialect picker as a headline.
- `rejected.2026-10-20.raw-fact-memory`.
- `rejected.2026-10-20.gemini-tts-style-prefix`: no free-text style box that gets spoken.

**Owner requirements.**
- req-07: persona default and catalogue rules (§6).
- req-37: the motion and flow system (§4, §8).
- req-38: §1 and the comparison.
- req-39: §8. The hour holds for non-BFSI numbers; it cannot hold for 1600xx KYC, and I say why.
- req-40: `data/blueprint/design-language.json` drives the visual mock-ups, plus the owner review gate.
- req-68: provenance chips, receipts and grades, kept light (§7.1).
