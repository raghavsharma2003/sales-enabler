# Research brief: a human-sounding Indian voice agent at about ₹2 a minute

Status: draft for owner approval, 2026-10-18. A deeper rewrite of the owner's request to analyse Gemini and other
providers.

## 0. Fixed context

- **The core product.** Emotional, relational, exactly-human-sounding voice agents are VP's core product. Learning
  agents and deep personalisation can sit in a higher pricing tier. The product form is a self-serve platform like
  Vapi; the command centre waits.
- **Providers.** Azure-only is relaxed for this evaluation. Gemini (Live and TTS, through both the Gemini API and Vertex
  AI), models routed through OpenRouter, and any other provider may be measured. The build choice follows the
  measurements.
- **Inherited evidence** (`docs/harvest/`, `research/2026-10-17/`):
  - our India-hosted cascade replies in about 1.0 s but cuts callers off on 15-50% of turns;
  - managed Azure costs ₹5.88 per minute at launch;
  - Indian list prices run ₹3.5-7 per minute;
  - realtime speech-to-speech was rejected in four repos because it cannot be checked before it speaks (law 25);
  - Meera ran on Gemini Live 3.1 flash with a free-tier key pool.
- **No free-tier key rotation.** We use paid tiers only: the paid Gemini API, Vertex AI and OpenRouter. Rotating
  free-tier keys across accounts circumvents per-account quotas, may let the provider train on customer audio, and
  hides the real unit cost.

## 1. The decision this research supports

Which stack, or which tiered set of stacks, delivers calls that Indian listeners rate as human-like and warm, at a
**price** of about ₹2 per connected minute with a sustainable margin and a reply time that feels human? For each
candidate stack, the research also answers what it costs, how it fails, and what would make us switch.

**First, turn the price into a cost budget.**
- ₹2 price minus GST treatment, minus telephony (₹0.38-0.48), minus a target gross margin (state it: 40-60% for a
  platform) leaves the **allowed AI cost per minute**, probably ₹0.5-1.0.
- Every candidate is judged against that budget, not against ₹2.

## 2. Separate the three layers that make a call feel human

Score each layer separately. Then score whole calls.

1. **Voice:** timbre, prosody, emotion, Hindi, Hinglish and regional naturalness, and getting numbers right.
2. **Behaviour:** empathy that fits the moment, memory of the person, warmth without manipulation, brevity, honesty
   about being an AI.
3. **Timing:** reply gap, backchannels ("haan", "hmm"), waiting through pauses, handling barge-in.

A stack can win one layer and lose another. The best design may mix providers.

## 3. Hypotheses: prediction before, test, kill condition

**V1. The Maya cost claim.**
- Meera's in-app Gemini Live calling cost about ₹1.3 a minute at **paid list price**.
- Test: re-derive it from raw per-turn usage metadata (input and output tokens by modality, including the conversation
  context re-billed on every turn) and from the current price page.
- Check the announced price change (with its date) and how cost grows with call length (1, 3, 5 and 10 minutes) under
  each context-management setting (sliding window or compression, session resumption).
- Kill: the paid-tier cost of a 5-minute call exceeds the AI budget from §1.

**V2. Expressive speech-to-speech wins on human-likeness.**
- Gemini Live native audio is rated more human-like than expressive text-to-speech cascades.
- Candidates for comparison: Gemini TTS; ElevenLabs v3/Flash; Cartesia Sonic; Sarvam Bulbul; Azure DragonHD with styles;
  Hume Octave; MiniMax; open Indic and expressive models (Maya Research Veena, IndicF5, Indic Parler, Orpheus,
  Chatterbox, Sesame CSM, Dia).
- Kill: a cascade ties within the noise floor at lower cost or better control.

**V3. Speech-to-speech can be made safe enough.**
- Measure the **gate lag**: how much audio plays before an output-transcript check catches a violation (a wrong number,
  a denial of being AI, a promise or price not in the data). Measure the violation rate on an attack battery.
- Test hybrids:
  - speech-to-speech for small talk and backchannels, with gated text and TTS for facts;
  - Live in text mode followed by expressive TTS.
- Kill: violations are audible before the stop on more than 1% of attack turns, and no hybrid keeps the
  human-likeness.

**V4. Latency feels human from India.**
- Caller end-of-speech to first agent audio, p50 and p90, measured from an India-hosted machine, for each stack.
- Compare Google's Mumbai and Delhi regions (Vertex) with Gemini API global endpoints and Azure India.
- Kill: p50 above 1.2 s or a cut-in rate above 5% on the elderly and Hinglish personas.

**V5. The cheapest human-like path.**
- Find the lowest-cost stack whose human-likeness score is within the noise floor of the best.
- Candidates:
  - small or flash LLMs via OpenRouter, Groq or Cerebras in a cascade;
  - expressive TTS from Indian vendors priced in rupees;
  - self-hosted open expressive TTS and ASR on Indian GPU clouds (E2E Networks, Yotta) against Azure GPUs, priced at
    real utilisation;
  - committed-use and provisioned-throughput discounts.
- Kill: no stack fits the AI budget at the quality bar. If so, change the price, the tier structure or the target
  segment, not the quality.

**V6. Relational behaviour transfers across stacks.**
- Run the same persona, memory and relational rules (from Meera's RelationalOS and Taxila's compiler) on each stack.
- Measure recall accuracy across repeat calls (simulated returning callers) and preference adherence.
- Kill: a stack ignores stored preferences more than 1 time in 20.

**V7. Vendor risk is acceptable.**
- For each provider:
  - terms on data use, training, retention and residency (DPDP; IRDAI records-in-India);
  - preview and deprecation status, with dates;
  - rate limits and quotas;
  - price-change history;
  - India availability.
- Kill: the only human-like stack fails residency or uses customer data for training.

## 4. Raw material, ahead of anything digested

- **Our own API calls:** usage metadata per turn (tokens by modality, cached tokens), timestamps, and audio, recorded on
  full scripted calls for every stack.
- **Meera's history:**
  - the html-portfolio main and Maya branches (Gemini Live client, prompt compiler, measurements in `context/`);
  - the sales-enabler `lib/voice/maya/` port;
  - with owner consent, aggregate-only read-only queries of call duration and token usage in Meera's Neon project
    (no transcripts).
- **Price and terms primaries:**
  - Gemini API pricing and terms;
  - Google Cloud Billing Catalog API SKUs for Vertex;
  - OpenRouter's models and pricing API;
  - each vendor's price page and its archived history;
  - announcements of price changes, with dates.
- **Model cards, papers and open weights** for the expressive TTS and speech-to-speech candidates.
- **Human reference recordings:** 2-3 Indian telecallers or voice artists performing the same scripts (owner hires).
- **The test battery** from round 1/2, extended with emotional scenes: complaint, confusion, grief or worry,
  celebration, an elderly caller, a rushed caller.

## 5. Methods

- **Cost.** Token-exact accounting from usage metadata. Monte Carlo over call length, talk ratio and turns. A sensitivity
  analysis. Output: ₹ per connected minute and per call, by tier.
- **Human-likeness.** Blind listening by Indian raters on whole calls and on matched turns, with these measures:
  - MOS and comparative MOS for naturalness;
  - human-likeness, rated with a human reference in the mix: "Was this a person or an AI?";
  - warmth and trust;
  - comprehension, for elderly raters.

  Krippendorff's alpha for inter-rater reliability, catch trials, Wilson intervals, an A/A noise floor, and a power
  calculation before recruiting.
- **Behaviour.** An operational rubric (acknowledges emotion before the task, recalls correctly, stays brief, never
  denies being AI, never manipulates), scored by blind human raters. LLM judges only extract beliefs; code scores them.
- **Timing.** The round-2 India harness, extended to each provider, with call-clustered confidence intervals.
- **Safety.** An attack battery of 200 or more turns, with gate-lag timing.
- **Discipline.** Predictions registered before work. An evidence ledger. An adversarial verifier on each load-bearing
  claim.

## 6. What counts as proof, outside us

- Blind Indian listeners from outside the team, including a 50+ group, rating our candidates against human references,
  with the "person or AI?" detection rate reported.
- The providers' own billing (usage exports and invoices) reconciling with our computed ₹ per minute within 10%.
- Latency from an Indian handset over a real phone line (needs a CPaaS trial number).
- A data-use, residency and terms review by counsel.
- Public arenas (Artificial Analysis speech arena, TTS Arena) as a cross-check only; they are mostly English.
- Later: pickup, hang-up and outcome on real consented calls, warm agent against neutral, with a holdout.

## 7. Deliverables

1. A cost model for each stack (₹ per minute and per call, by call length and tier) with sensitivity.
2. Recordings, turn and call, for each stack, plus human references, ready for the listener panel.
3. Latency and cut-in results from India for each stack.
4. Gate-lag and violation results for speech-to-speech, and the hybrid designs.
5. A vendor-risk table (terms, residency, deprecations, rate limits, price changes).
6. A recommended tiered architecture: base (human-like, about ₹2), plus (learning), premium (deep personalisation).
   Each with kill criteria.
7. Updated context graph and ledger; a visual report.

## 8. Execution and limits

- **Parallel lanes,** each with a verifier, then a synthesis:
  - Gemini deep-dive (API and Vertex, Live and TTS, pricing and terms);
  - other speech-to-speech;
  - expressive TTS;
  - cheap LLMs via OpenRouter;
  - self-hosting on Indian GPU clouds;
  - India latency harness;
  - safety and gate lag;
  - Meera and sales-enabler code archaeology.
- **Spend.** Azure stays inside the existing cap. Gemini and OpenRouter spend needs a cap set by the owner.
- **Only the owner can:**
  - provide a paid Gemini API key or a GCP project with billing (for Vertex in Mumbai or Delhi);
  - hire human reference voices;
  - recruit listeners;
  - get a CPaaS trial number;
  - consent to the aggregate Meera usage query.
- **Logging.** Every phase goes to `context/` before the next.
