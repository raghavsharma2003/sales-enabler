# Competitor teardown brief: the deeper version (proposed 2026-10-20, awaiting the owner's go)

This rewrites the owner's 2026-10-20 product brief (`directive.2026-10-20.product-brief`): crack every voice-AI company
"to its quanta" using REA. The aim is depth, not breadth. The teardown exists to settle three build decisions. Material
that serves none of the three is not collected.

## What already exists (don't redo it)

All in `research/2026-10-17/lanes/`:
- **Parity matrix:** 24 features × 23 vendors, every cell with evidence (`l4a-competitors/parity.csv`).
- **Prices:** 46 dated price points for 16 vendors (`pricing-history.json`).
- **Complaints:**
  - 869 items: Retell's community threads plus Bolna's GitHub issues;
  - 459 Indian voice-of-customer complaints, coded (`l4a`, `r2-untouched-raw`): support 114, billing 107,
    account/UI 99, reliability 71, telephony 36. Usability, support and billing account for about 70%.
- **Company financials:** for 21 companies.
- **Measured homepage demos:** 8 vendors (`l4b-measured`):
  - Vapi replied in Gujarati to a Hinglish caller on 17 of 18 turns;
  - Sarvam's demo claimed to be human in 6 of 6 calls.
- **Already rejected:** a feature-parity and price-undercut *wedge* (`rejected.2026-10-17.parity-undercut`). Incumbents
  ship 10–12 of 12 headline features, and Indian list prices are ₹3.5–7 per minute.

**The gap.** The critic's note was that *demos are not platforms*. Nobody has used these products as a customer:
onboarding, configuring, uploading real data, running a campaign, handling failures, reading the analytics. That is
exactly where the owner wants to win: better design, usability, case handling and intelligence. The complaint data
says that is where Indian buyers hurt.

## The three decisions

1. **Pre-sale or post-sale first, and which job.**
   - In India this is partly a regulatory question. Promotional calls need the 140-series, consent, NCPR scrubbing and
     time windows. A neutral service call, such as a renewal reminder, is lighter (`ledger.REG-35`).
   - Most platforms leave compliance to the buyer (`ledger.CMP-27`).
   - The earlier proposed beachhead was insurance renewals (`decision.2026-10-17.beachhead-v2`), which is post-sale.
     Test that against the owner's broader enterprise framing.
2. **The v1 parity floor.** List the features an Indian enterprise buyer will not switch without. Classify them with
   Kano: must-be / performance / delighter.
3. **Where we will be measurably better.** Pick 3–5 places where each incumbent fails a task we can run, plus how each
   one handles memory, personalisation and learning. That last part is recorded for v2, not built now.

## Scope: deep on few, radar on many

**Deep set: 8, swappable.**
- Bolna: Indian, open-source, self-serve leader.
- Sarvam: Indian full stack.
- Vapi and Retell: developer-platform references.
- ElevenLabs Agents.
- Synthflow: the no-code UX reference.
- SquadStack: managed AI telecalling in India.
- Exotel's voice bot: the CPaaS incumbent the buyer already has.

**Radar: one page each, triaged.** Bland, Ultravox, Smallest Atoms, Ringg, Gnani, Haptik, Ozonetel, Knowlarity, Cartesia,
Deepgram, Millis, Caller.digital, Ravan, Pipecat and LiveKit (the frameworks many of these are built on), and eval tools
(Hamming, Coval).

**New entrants.** A monthly sweep of launch sources. A triage rubric decides whether a newcomer joins the deep set.

## Per deep-set company

1. **Product surface map.** Every screen and flow, recorded under our own trial account. Builder, data import, campaigns,
   telephony setup, compliance, analytics, billing, team roles, API, and the chat or copilot builder if there is one.
2. **Time and motion.** Minutes and clicks from sign-up to the first live call to our phone. Then a fixed task list run
   twice:
   - build the standard agent;
   - upload a messy 50-row synthetic CSV (duplicates, bad numbers, Hindi names, empty columns, an opt-out row);
   - schedule within calling hours;
   - handle a voicemail and a transfer;
   - find a failed call and its reason;
   - export results.
   Score each task: success, time, errors.
3. **Call behaviour on real Indian lines.**
   - Their agent calls our Plivo number.
   - We run the standard caller battery from `l4b`: busy, skeptic, elderly pause, angry, confused, Hinglish
     code-switching, babble, "are you a bot?".
   - Record in stereo and measure handset-side reply gap, cut-ins, language hold, disclosure and task success.
4. **Architecture, with every claim graded** as observed, inferred with evidence, vendor-claimed or unknown.
   Inference methods:
   - HAR captures of the dashboard and web-call widget (WebRTC signalling shows LiveKit, Daily or Twilio);
   - JavaScript bundles and source maps via REA;
   - TLS SNI and DNS (which providers and regions they call);
   - SDKs from npm and PyPI;
   - TTS identification by voice fingerprint (speaker-embedding similarity against vendor voice libraries);
   - STT identification by error pattern on a fixed utterance set.
5. **Unit economics.** Their likely cost of goods from the identified stack (`research/2026-10-18/model/`), giving
   their price floor and margin.
6. **Failure modes.** Their top complaint codes traced back to the raw threads, and confirmed or refuted by our own runs.
7. **India operating plumbing.** DLT, 140/160-series numbers, NCPR, consent, calling windows, DPDP, data residency:
   what they do and what they leave to the buyer.
8. **v2 notes, recorded only.** Memory across calls, personalisation, any learning or optimisation loop. Marketing
   claims are checked against the docs (`ledger.CMP-01`: marketing contradicts docs on memory).

## Calibrate the method before trusting it

Bolna is open source. **Infer Bolna's architecture blind first**, from the black box alone. Then check every inference
against its code. The hit rate says how far to trust the same inferences on closed vendors.

Pre-register predictions in `predictions.md` before measuring, e.g. "vendor X's Hindi voice is TTS Y" or "p50 on Indian
PSTN ≥ 2 s". Score them afterwards.

## What shows the result is right (other than the agent or the owner)

- **Observations:** network captures, fingerprint matches, SDK lines, Bolna's source.
- **Pre-registered predictions** scored against measurement.
- **Indian buyers:** 10–15 operations leads who use or left these tools. They confirm or refute the failure modes and
  the parity floor. The founder kit and interview guide exist (`research/2026-10-17/founder-kit/`).
- **A blind listener panel** of Indian listeners rating competitor calls against ours (`listener-panel/`).
- **Usability sessions:** 5 target users run our onboarding against the best competitor's, measured on task success
  and time.
- **External yardsticks** where they exist (public TTS arenas, independent voice-agent evaluations), as a consistency
  check.

## Boundaries

We reverse-engineer only what a customer or the public is shown:
- trial accounts we own;
- public pages, open code, our own captured traffic.

We do not:
- bypass logins or bot protection;
- extract their prompts by jailbreaking;
- copy code, UI or assets.

Learn patterns; build our own. This matches REA's own disclaimer. Test data is synthetic. Calls go only to our own
verified numbers.

## Outputs, all stored durably

- **Per company:** `research/2026-10-2x/teardown/<vendor>/`, holding the surface map, recordings index, time and
  motion, architecture with grades, economics, failures, plumbing and v2 notes. Raw captures and recordings go to the
  `vpresearchraw1017` blob with a sha256 manifest.
- **Cross-company:**
  - the parity floor (Kano);
  - the "where we win" list with the task that proves each point;
  - the pre-sale vs post-sale recommendation with evidence;
  - the v1 spec outline;
  - the radar table;
  - the change-watch setup.
- **Every finding becomes a graph node** through `context/inbox/` and is merged by the main loop
  (`context/PROTOCOL.md`).

## Execution

**One workflow:**
- 8 deep lanes plus 1 lane each for regulation/segment, radar, and buyer-interview prep;
- an adversarial verifier per architecture claim;
- a synthesis step.

**Constraints:**
- Lanes run autonomously inside this session's permissions.
- No Google credentials from the sandbox.
- Trial accounts need sign-up email and phone OTPs, so the owner (or Instinct) creates them, using a team email and a
  spend cap. Credentials go to a scratchpad env file, never chat.

**Later, v2:** harness2's propose → probe → compose loop over the eight agent-harness components (prompt, guardrails,
memory, tool guidance, subagents, skills, scripts, plugins), with `voicelab/evals/convo_bench.py` as the probe, becomes
the basis of the self-learning agent.
