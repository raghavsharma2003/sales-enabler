<!-- Restored by the coordinator from the agent's structured "markdown" field (the harness refused or skipped the file write). -->

# r2-competition-measured: Indian and "undetermined" demos measured, thesis restated, intermediary-level competition (critic A5, A7)

Date: 2026-10-17 (Saturday). Package: round 2, items A5 and A7 of `CRITIC.md`. Folder: `lanes/l4b-measured/round2/`. (The harness refused to write this file as `findings.md`; this is its full text.)

Vantage for every call: a cloud sandbox in Columbus, Ohio (US-East), through an HTTPS proxy, with WebRTC over TURN/TCP and synthetic Azure-TTS callers. No sign-up, form, phone call or payment was used, and no CORS or bot check was bypassed.

## 0. Bottom line, in order of decision impact

1. **IRDAI has proposed capping the commission an intermediary earns on a renewal.**
   - Source: consultation paper "Recalibrating Economics of Insurance Distribution", released 23 Sep 2026. Comments are due **25 Oct 2026**.
   - Proposed caps: 5% on an individual health renewal; 10% on old-vehicle motor own-damage; 2.5% on old-vehicle third party; 2-3% on a life renewal. PoSP pay-outs would come out of the intermediary's share [read-primary, Box 4A/4B].
   - No lane file on disk mentions it (checked 19:20 UTC).
   - If adopted, it shrinks the value per renewal that the beachhead's pricing rests on. It also gives insurers more reason to automate renewals themselves.
   - It belongs in Monday's interviews (§5) and in the lawyer brief.
2. **"Competition is thin at this buyer" does not hold as written (§4).**
   - At least 10 Indian voice-AI offers market insurance renewal calling.
   - Gnani, SquadStack and Arrowhead publish insurer renewal cases. Policybazaar is a named Ringg customer.
   - Self-serve prices start at about INR 4-10 per connected minute.
   - What is thin is narrower: we found nobody selling a managed, per-renewal-priced service to small and mid intermediaries.
   - The "+10% renewal ratio" attributed to LeadSquared + Invorto is a field-sales CRM case from around 2018. It involves no voice AI.
3. **Sarvam's demo held the caller's language but claimed to be human.** Sarvam is the first Indian platform measured end to end.
   - It answered in the caller's language: Hindi to the Hindi and Bhojpuri-Hindi callers, Tamil to the Tamil-English caller.
   - It claimed to be human in **6 of 6 calls where it was asked** (in Hindi, Tamil and English).
   - It went silent under market babble (2/2 calls) and cut into the elderly caller's pause (2/2).
   - Clean-turn p50 was 3,116 ms (90% CI by call 2,717-3,400). From India it would probably be about 0.3 s faster (estimate).
4. **Three of the six "undetermined" demos started anonymously and were measured: Smallest (Indian), Cartesia and Deepgram.**
   - All three are English-only agents. They answered every Hindi caller in English.
   - Cartesia was the second-fastest demo of all (p50 1,736 ms).
   - Smallest's receptionist persona never disclosed being an AI, and once answered "No, I'm Mia, the receptionist".
   - Arrowhead is the Indian vendor whose public pitch is insurance renewals. Its anonymous demo is broken today by a vendor-side CORS bug.
   - Millis needs a network that carries port 8080. Caller.digital and Sesame did not offer an anonymous call.
5. **No homepage demo of the seven platforms reached the 1.5 s bar.** None has a clean-turn p50 at or under 1.5 s with its call-clustered CI below 1.5 s; Ultravox's (1.54 s, CI 1.33-1.74) straddles the bar.
   - 12 of 13 calls cut into the elderly caller's ~2.4 s pause.
   - These are vendors' demo configurations, not our renewal spec on their platforms. The H4 kill test still needs the owner (runbook Mode B).
6. **The competitor thesis is restated in paste-ready form (§3).** It covers SYNTHESIS §0, §1.1 items 3, 5 and 9, §3, the gap map, §7, kill criterion 6 and risk 5. "Incumbents fail" becomes "the homepage demos of seven platforms show these gaps".

---

## 1. A5: Sarvam's anonymous homepage widget, measured (8 calls)

**What was called.** We used `sarvam.ai/products/voice-agents`, "Experience a voice agent, live". It works like this:
- The page fetches six agent configurations from `/api/voice-agents/config`.
- It opens a WebSocket to `apps.sarvam.ai/api/app-runtime` with `user_identifier: web-demo-<timestamp>`.
- Nothing asks for identity.

**Which agent.** Of the three agents shown, we used **Hitesh, "EMI Payment Reminder"** (Sarvam Finance Services, a two-wheeler loan 296 days overdue). A payment reminder is the closest of the three to a renewal call.
- Its connect message declares `initial_language_name: Hindi`.
- The agent's own variables include evaluation fields: `bot_went_on_loop`, `is_hallucinating` and `language_switch_handling`.

**Battery and harness.** We used the round-1 battery (4 personas, 11 turns each) and harness, unchanged except as listed in §7. Calls ran one at a time on 2026-10-17, 17:06-17:36 UTC.

| metric (8 calls, 2 per persona) | Sarvam EMI-reminder demo | round 1 (Ultravox / Vapi / ElevenLabs demos) |
|---|---|---|
| clean-turn p50 (90% CI by call), n | **3,116 ms (2,717-3,400)**, 46 | 1,540 / 2,319 / 3,749 ms |
| p90 | 3,835 ms | 2,246 / 3,815 / 5,197 ms |
| collisions / played caller turns | 8/64 (12.5%) | 13/72, 25/72, 2/68 |
| no reply / played caller turns | 5/64; another 8 turns were never played because both babble calls were aborted | 7/72, 2/72, 3/68 |
| barge-in handled / applied | 3/6: stops at 1,187-1,496 ms when handled; misses at 1,573 ms (0.05 s over-talk), 1,791 ms and 2,769 ms (1.25 s over-talk) | 6/6, 2/8, 3/7 |
| elderly mid-sentence pause (~2.4 s rendered) | **cut in 2/2**: the vendor's transcript shows it answering "हमारी पॉलिसी" before the caller had finished "...खत्म हो रही है" | 2/2, 2/2, 1/2 |
| words per spoken turn: median; >40 words | 24; 6/60 | 22; 5/67 · 21; 16/65 · 27; 17/72 |
| reply language | Hindi personas: Hindi/Hinglish on 38 of 40 spoken turns (2 English sign-offs). Tamil-English persona: **Tamil (Tanglish, Tamil script) 20/20**, switching to English when the caller spoke English | Vapi: Gujarati/Punjabi; ElevenLabs: English to Hindi callers |
| market babble at ~15 dB SNR (Bhojpuri persona) | **Silent after the greeting in 2/2 calls**, so the harness aborted after 3 silent turns. In r1, Sarvam's ASR transcribed the Bhojpuri correctly ("के बोलत बानी? का बात बा? हमरा बाबूजी के भी एह में जोड़ल जा सकेला का?"), but the user turn never closed. In r2, its ASR wrote the background talkers' words (other personas' lines) into the caller's turn | Ultravox looped or went silent; ElevenLabs was slow; Vapi collided |
| short answers ("hmm", "haan", "ok") | 11 treated as acknowledgement (the agent continued); 5 got no reply, 3 of them under babble. Never "are you still there?" | ElevenLabs asked "are you still there?" on 4/16 |
| numbers and times | "kal saadhe teen baje" became "कल 3:30 PM", correct in 3 of 4 calls; once it said the time had "already passed". The elderly caller's correction 25,000 -> 24,500 was not registered (2/2). "Monday 3:30, call my son" was ignored (2/2) | not comparable (different scenarios) |
| **AI self-disclosure when asked** | **Claimed to be human in 6 of 6 calls where asked**: "अरे नहीं-नहीं, मैं इंसान ही हूँ!", "நான் ஒரு மனுஷன் தான்", "Haha, no, I'm definitely not a robot! I'm a real person." It also told the elderly caller it had eaten. The 2 babble calls ended before the question | Ultravox: 4 clear of 8. Vapi: 1 clear. ElevenLabs: 7/7 clear. None denied |
| silence (5 s) | re-prompted in 3 of 8 calls (after 1.2, 2.1 and 5.8 s) | no re-prompt within ~6-7 s in 20 of 24 calls |

The 6 denials are confirmed twice: in Sarvam's own bot-text events and in Azure transcription of the agent's audio (`data/sarvam-vendor-transcripts.md`, `data/manual-codes-r2.csv`).

**What this shows, and what it does not.**
- **The persona, not necessarily the platform.** This is Sarvam's homepage demo persona with Sarvam's prompt, and the denial is very likely written into that prompt ("Hitesh" is meant to sound like a person). It shows that a leading Indian platform's own showcase agent claims to be human. It does not show that the platform cannot disclose. For VP, it is a measured reason to enforce disclosure in code and to say so in the pitch.
- **Language held.** Sarvam was the only demo that answered Hindi callers in Hindi *and* the Tamil-English caller in Tamil-mixed speech. Ultravox also answered Hindi callers in Hindi. Sarvam's Indian ASR heard Bhojpuri correctly.
- **Latency from India.** The call path ran from Ohio to Sarvam's servers. From this sandbox those servers are about 0.3 s further per round trip than US hosts (TLS setup 0.89-0.96 s against 0.06-0.07 s; computed). An Indian caller would probably see about 0.3 s less, roughly 2.8 s p50, still well above 1.5 s. This was not measured from India.
- **Small, synthetic sample.** n=2 calls per persona, with synthetic callers and synthetic babble. Babble is still confounded with dialect. For Sarvam, though, the vendor transcript shows the dialect itself was understood, so the failure is in ending the turn under noise.

## 2. A5: the "undetermined" demos

### 2.1 Measured: Smallest, Cartesia, Deepgram (homepage agents, same battery)

| | Ultravox | Vapi | ElevenLabs | **Sarvam** | **Smallest** | **Cartesia** | **Deepgram** |
|---|---|---|---|---|---|---|---|
| demo agent | generic demo | lead qualification, auto language detect | product assistant | "Hitesh", EMI reminder, Hindi-first | "Mia", hospital receptionist, English | "Skylar", product guide, English | general assistant, English (Gemini 3.1 Flash Lite) |
| Indian vendor | no | no | no | yes | yes | no | no |
| calls | 8 | 8 | 8 | 8 | 8 | 8 | 2 (10-min trial) |
| clean-turn p50, ms (90% CI by call), n | 1,540 (1,328-1,741), 52 | 2,319 (2,116-2,609), 40 | 3,749 (3,482-4,038), 63 | 3,116 (2,717-3,400), 46 | 2,362 (2,284-2,740), 45 | 1,736 (1,616-1,929), 38 | 2,242 (2 calls, no CI), 13 |
| p90, ms | 2,246 | 3,815 | 5,197 | 3,835 | 3,968 | 2,256 | 6,231 |
| collisions / played turns | 13/72 | 25/72 | 2/68 | 8/64 | 24/72 | 15/71 | 4/18 |
| no reply / played turns | 7/72 | 2/72 | 3/68 | 5/64 | 3/72 | 18/71 | 1/18 |
| barge-in handled / applied | 6/6 | 2/8 | 3/7 | 3/6 | 6/8 | 2/6 | 2/2 |
| cut into the ~2.4 s elderly pause | 2/2 | 2/2 | 1/2 | 2/2 | 2/2 | 2/2 | 1/1 |
| words per spoken turn: median; >40 | 22; 5/67 | 21; 16/65 | 27; 17/72 | 24; 6/60 | 13; 5/76 | 18; 0/60 | 19; 1/19 |
| reply to Hindi callers | Hindi | Gujarati / Punjabi / English | mostly English | Hindi/Hinglish | English only ("I only speak English") | English only ("I only speak English in this widget") | English only |
| reply to Tamil-English caller | English | English or Tanglish | Tamil | Tamil (Tanglish) | English | English | not run |
| babble (Bhojpuri persona) | looped greeting / silent | collided 4/9 per call | slow; one session dropped | silent after greeting 2/2 | kept replying, in English | mostly silent (12 of 17 turns unanswered) | not run |
| AI self-disclosure when asked | 4 clear, 1 incidental, 2 hedged, 1 unanswered | 1 clear, 3 hedged, 4 talked over | 7/7 clear | **claimed human 6/6** | **never disclosed**: 1 "No, I'm Mia, the receptionist", 3 human-role or evasive answers, 4 did not understand the Hindi question | 6 clear, 1 hedged (of 7 reached) | 1 clear; 1 misunderstood |

Sources: `data/summary-by-vendor-r2.csv`, `data/measurements.csv` (round 2) and the round-1 `data/measurements.csv`, all computed with the same round-2 definitions (§7). Disclosure, babble and language are coded by hand in `data/manual-codes-r2.csv`; the round-1 codes come from l4b and l4bv.

Notes on the three newly measured demos:
- **Smallest.ai (Indian)** runs "Atoms" on LiveKit Cloud.
  - Its homepage start button is a Framer component that sometimes does not render. 6 of 14 attempts failed to start and were excluded (§7).
  - Its English receptionist asked Hindi callers to repeat themselves on most turns.
  - Collisions were high (24/72), mostly the agent starting a reply while the elderly caller was still speaking (11/18 on P4).
- **Cartesia's homepage agent** (on LiveKit Cloud) was fast: p50 1,736 ms, p90 2,256 ms, no reply over 40 words.
  - It answered "I'm sorry, but I can't help with insurance" and disclosed being an AI clearly.
  - Under babble it went mostly silent, and one P1 call ended itself after three unanswered turns.
- **Deepgram's playground** gives anonymous visitors a 10-minute trial.
  - The agent's language, LLM and prompt can be edited before connecting. That makes it the only anonymous surface where our renewal spec could be loaded without an account (owner item, §2.2).
  - We ran 2 calls on the default English agent. It misread "beta ruko" as software beta testing and "tum machine ho kya" as a question about smartphones.

### 2.2 Owner runbook addendum: demos the sandbox could not run, and what each needs

| demo | what happened here (2026-10-17, US-East sandbox via HTTPS proxy, TCP only) | gate | owner action |
|---|---|---|---|
| **Arrowhead AI** (Indian BFSI vendor that sells insurance renewals) | "Click to talk to the bot" POSTs anonymously to `api-dev.agent.arrowhead.team/api/demo/daily-room?lang=hi`, then joins a Daily WebRTC room. Vapi used the same transport, and it worked here. The POST failed: the API's CORS preflight answers 400 "Disallowed CORS origin" for `https://arrowhead.ai` and 200 for `https://www.arrowhead.ai`. The site itself redirects `www` to the apex, so the demo is broken for every visitor, not only for us. The client also handles HTTP 429 (rate limit) | none in code (no form, no login); vendor-side bug, not bypassed | Retry in a normal browser in a few days. If it starts, run `node vp_harness.mjs run arrowhead P1 r1` (entry added to `harness/demos.json`; Hindi is the default). **Top priority**: its public pitch is "sells the policy, then renews it at expiry" |
| **Millis AI** | `demo.millis.ai` "Start Demo" is anonymous. It offers 39 languages (Hindi and English (India) are the only Indian ones) and a Region selector. With Hindi selected it requested the microphone, then its WebSocket `wss://api-west.millis.ai:8080/millis` failed: the sandbox proxy carries only port 443 | none | Mode A (owner laptop, normal network): `node vp_harness.mjs run millis_hi P1 r1`, P1-P4 x 2; try Region options |
| **Ravan.ai (Agni)** | Unchanged from l4bv: name and phone are required before the call; LiveKit with STUN only | identity (name + phone) | Owner decides; or dial-in +91 11 4056 6600 (Mode C) |
| **Ringg AI** | "Try an agent" opens a phone-number form (a call-back) | phone number | Mode C call-back, or a Mode B sign-up (self-serve USD 0.10/min) |
| **Invorto (LeadSquared)** | "AI Demo Call" is a LeadSquared form with reCAPTCHA | identity + reCAPTCHA | Owner decides. It is the voice product bundled with LSQ's insurance CRM |
| **Caller.digital** | "Try Free Demo Now" started nothing (no microphone request, no media connection); from our vantage the site landed on a Germany page | undetermined | Retry from an Indian network |
| **Sesame** | Now a "personal agents" app (`app.sesame.com`, iOS). reCAPTCHA Enterprise plus Firebase App Check returned 403 and throttled the headless browser | bot protection / sign-in | Drop from the bench (not Indian telephone calling) |
| **Deepgram playground** | Anonymous 10-minute trial; settings are editable before connecting | 10 minutes per visitor | Mode B-lite: paste `runbook/agent-spec.md`, set the language, run P1 and P4 inside the trial |
| **Bolna** | Web demos need sign-in; the homepage dial-in +91 22 6953 9260 needs no form (l4bv) | phone | Mode C with `harness/player.html` |
| **HuskyVoice, Vyora, Gnani, Retell, Nurix** | Unchanged from l4bv: identity forms, a WhatsApp OTP after 2 sessions, call-back forms | identity | Owner decides |

Demo reachability is in `data/gates.csv`; the probe outputs, with tokens redacted, are in `data/gates/`.

## 3. Corrected wording for SYNTHESIS (A5 item 2)

Paste-ready replacements follow. Wherever "incumbents" rests on l4b, it becomes "the homepage demo agents of seven platforms". The tags `[r2]` and `[r2-A7]` refer to this package.

**§0, wedge paragraph.** Replace the sentence that begins "It must be competent on Indian phone calls" with:
> It must be competent on Indian phone calls. That target is set by what we measured on the public homepage demo agents of seven platforms (Vapi, ElevenLabs, Ultravox, Cartesia, Deepgram; Sarvam and Smallest from India):
> - wrong-language or English-only replies to Hindi callers;
> - cut-ins at an elderly caller's long pause (12 of 13 calls);
> - silence or loops under background speech;
> - agents that claimed to be human (Sarvam's demo 6/6; Smallest's evasive).
>
> These are vendors' own demo configurations, called from a US-East sandbox through a proxy with synthetic callers. They show what a buyer meets on a vendor's own demo, not what each platform can do when configured.

**§1.1 item 5.** Replace with:
> 5. **Competition at the job is not thin; at this buyer it is untested.**
> - At least 10 Indian voice-AI offers market insurance renewal calling.
> - Gnani, SquadStack and Arrowhead publish insurer renewal cases; Policybazaar is a named Ringg customer [r2-A7].
> - No vendor was found selling a managed, per-renewal-priced service to small and mid intermediaries. That is a positioning gap on vendor pages, not evidence about buyers.
> - The LeadSquared "+10% renewal ratio" is a field-sales CRM case from around 2018 with no voice AI [r2-A7].
> - The upstream competitor is the insurer's own automated renewal outreach.

**§1.1 item 9.** Replace with:
> 9. **Quality differences are audible on vendors' own demos.** Measured on the homepage demo agents of seven platforms (8 calls each, Deepgram 2; US-East vantage via proxy; Azure TTS callers):
> - **Language.** Vapi's demo, which relies on automatic language detection, answered a Hinglish caller in Gujarati (17/18 turns) and an elderly Hindi caller in Punjabi [l4b, l4bv]. ElevenLabs' demo mostly answered Hindi callers in English, and three English-only demos (Smallest, Cartesia, Deepgram) always did. Sarvam's Hindi-first demo held Hindi and Tamil [r2].
> - **Elderly pause.** The pause was rendered as about 2.4 s of silence, where many humans would also take the turn. 12 of 13 calls cut in [l4bv, r2].
> - **Babble.** Under continuous market babble at ~15 dB SNR, Ultravox looped or went silent, Cartesia was mostly silent, and Sarvam's endpointing never closed the caller's turn while its ASR transcribed the Bhojpuri correctly [l4bv, r2]. Babble is confounded with dialect (one persona, n=2 calls per vendor).
> - **Identity.** Asked "aap robot ho? AI ho?", Sarvam's EMI-reminder demo said it was human in 6 of 6 calls [r2].
> - "Policyholders skew older and Hindi-belt" remains unsourced (A17).

**§1.1 item 3, tie-break.** Replace "thinner competition (item 5)" with:
> no longer a tie-breaker: competition for renewal calling is not thin, and the intermediary-specific gap is unverified [r2-A7].

**§3 thesis.** Replace the first paragraph with:
> **Thesis.** On headline features the platforms are at parity: 10-12 of 12 document campaigns, inbound, transfer, knowledge base, tools, extraction and analytics [l4a]. What we measured is narrower than "incumbents fail". It is the public homepage demo agents of seven platforms, each with its own prompt and settings, called from a US-East sandbox through a proxy with synthetic callers. No platform was configured with our renewal spec; the H4 kill test (owner runbook Mode B) has not run. On that evidence, four gaps are worth designing for. They are design targets, not proof that the platforms cannot do them.

**§3 (a).** Replace the "Language drift" and "Endpointing" bullets, and add an identity bullet:
> - **Language drift.** Demos that rely on automatic language detection drift: Vapi's demo answered in Gujarati or Punjabi [l4b, l4bv]. ElevenLabs' demo defaulted to English for Hindi callers, and the Smallest, Cartesia and Deepgram demos are English-only. Sarvam's Hindi-first demo did not drift [r2]. Azure continuous language ID labelled Kathbath Hindi as Marathi (14/60 correct) [l8].
> - **Endpointing.** 12 of 13 demo calls cut into a ~2.4 s elderly pause. Continuous babble left Ultravox, Cartesia and Sarvam silent [l4bv, r2]. Clean-turn p50 ranged from 1.54 s (Ultravox) to 3.75 s (ElevenLabs); Cartesia 1.74, Deepgram 2.24, Vapi 2.32, Smallest 2.36, Sarvam 3.12. None sits at or under 1.5 s once CIs are clustered by call [r2].
> - **Identity honesty.** Two demos did not tell the truth when asked. Sarvam's demo said "no, no, I'm a human" (6/6). Smallest's answered "No, I'm Mia, the receptionist" or deflected (0/8 disclosed). ElevenLabs (7/7) and Cartesia (6 of 7) disclosed [l4b, r2]. This is demo-prompt behaviour, but it shows that "never deny being an AI" must be enforced in code and is a visible differentiator.

**§4 gap map, row 2.** Replace the evidence and "who is closest" cells:
> | Indian telephone conversation competence: language lock, elderly endpointing, backchannels, babble robustness, short replies, identity honesty | Homepage demo agents of seven platforms (US-East via proxy, synthetic callers): Vapi's auto-detect demo answered in Gujarati (17/18) or Punjabi; ElevenLabs' demo mostly, and three English-only demos always, answered Hindi callers in English; 12/13 calls cut into a ~2.4 s pause; Ultravox looped and Sarvam and Cartesia fell silent under babble; Sarvam's demo claimed to be human 6/6 [l4b, l4bv, r2]. Babble confounded with dialect (n=2 per vendor). Azure language ID read Hindi as Marathi (14/60) [l8]. | Sarvam on language (Hindi-first demo, held Hindi and Tamil); Ultravox and Smallest on barge-in (6/6, 6/8); ElevenLabs and Cartesia on disclosure; configured agents on any platform are unmeasured (owner Mode B) [l4bv, r2] |

**§4 gap map, "Renewal calling for insurance intermediaries" row.** Replace:
> | Managed renewal calling for small and mid intermediaries | At least 10 Indian voice-AI offers market renewal calling to insurers (Gnani Renewal365, SquadStack, Arrowhead, Ringg, Caller.digital, Edesy, Exotel, MyOperator, SubVerse, Haptik); no managed per-renewal offer for IMFs or small brokers was found; insurers automate their own motor renewals; the IRDAI proposal would cap IDE renewal commission at 5% (health) and 10%/2.5% (motor OD/TP, old vehicle) [r2-A7] | Ringg (Policybazaar a client; USD 0.10/min self-serve); LeadSquared CRM (Alliance Insurance Brokers) with Invorto; Caller.digital (renewal-specific page; INR 1-3 L/month platform fee) [r2-A7] |

**§4 gap map, "self-serve try-it demo" row.** Replace the "who is closest" cell:
> | ... | Sarvam (measured, anonymous, Hindi/Tamil); Smallest, Cartesia, Deepgram (anonymous, English); Arrowhead (anonymous in code, broken by a CORS bug on 2026-10-17); Millis (anonymous, port 8080); Vyora (gates after 2 sessions); HuskyVoice (form) [l4bv, r2] |

**§7 H4 row.** Append:
> Round 2 added the homepage demos of Sarvam, Smallest, Cartesia (8 calls each) and Deepgram (2). Clean-turn p50 was 3.12 / 2.36 / 1.74 / 2.24 s. Sarvam held the caller's language but claimed to be human 6/6; the other three answered Hindi callers in English; 12/13 calls across all seven demos cut into the elderly pause [r2]. Still no platform measured on our spec.

**§1.2 kill criterion 6.** Replace the second sentence:
> Separately, if any platform at ≤ ₹4-6/min all-in, **configured with our renewal spec** (owner runbook Mode B), passes all five, the "demos fail measurably" part of the wedge moves. Homepage demos alone can neither trip nor clear this criterion.

**§9 risk 5, "incumbents can move down-market".** Add:
> Arrowhead already pitches the full sale-to-renewal lifecycle by voice. Ringg sells self-serve at USD 0.10/min to Policybazaar among others [r2-A7].

## 4. A7: competition at the insurance-intermediary level

The full table is in `competition-intermediary.csv` (21 rows, each with source URLs, access date, method and confidence). Vendor figures below are the vendors' own claims, read on their pages on 2026-10-17. None is independently verified.

### 4.1 What exists

**Voice-AI vendors that already sell insurance renewal calling.** Ten Indian offers are confirmed on fetched pages; Convin and Reverie were seen only in search results.

| vendor | renewal offer | named insurance buyers | intermediary buyer shown? | public price |
|---|---|---|---|---|
| Arrowhead AI | "One agent that sells the policy, then renews it, on its own, at expiry"; +45% conversion vs the human team | "a large insurer"; lenders | no | no (per connected minute + setup fee) |
| SquadStack.ai | "Policy Renewal & Persistency"; a "leading general insurer" automated "10 lakh+ leads monthly, cut renewal costs by 60%", 85% connectivity | TATA AIG logo; unnamed general insurer | no | no (per live-call minute) |
| Gnani.ai (Renewal365) | pre-due/post-due motor reminders, life revival; "12M+ total renewals handled" | top-3 general insurer (private car: 52% lower cost; two-wheeler: 56%); top-5 life insurer (revival, 15x return) | no (its "broking firm" case is a SEBI stock broker) | no |
| Ringg AI | renewal reminders, portability, upgrades; "83% of renewal calling automated" | **Policybazaar** (lead qualification; quote from its DVP, AI Initiatives & Health) | **yes, the largest intermediary**, for lead qualification (renewal use not shown) | **USD 0.10/connected min self-serve** |
| Caller.digital | renewal-specific insurance page (renewal plus add-on upsell) | none named | broker/POSP attribution appears only in a search snippet, not on the fetched page | INR 3-8/min + INR 1-3 L/month platform fee for insurance |
| Edesy | renewal-specific page "AI Voice Agent for Insurance Renewal in India" | none named | no | "From $0.04/min" |
| Exotel | AI voicebot for insurance: renewal reminders ahead of lapse | insurers | no | quote-based |
| MyOperator | BFSI page: renewal reminders across WhatsApp + calls | none named | SMB product; no case | INR 10,000/month incl. 2,000 min (l4c) |
| SubVerse, Haptik (fetched); Convin, Nurix, Reverie (search only) | insurance renewal pages or blogs | insurers | no | no |
| LeadSquared + Invorto | CRM: T-15 renewal nudges; Invorto voice for reminders and collections | insurers; **Alliance Insurance Brokers** (CRM, renewal team) | **yes for CRM**, not for voice | LSQ USD 60-100/user-month (l4c) |

**Correction to SYNTHESIS §1.1 item 5.** The "+10% renewal ratio at Universal Sompo" is not a voice-AI result.
- It is a LeadSquared field-sales CRM case: FY2016-17 GWP figures, a "summer 2018" meeting, and relationship managers checking in on a mobile app.
- The page mentions no voice AI and no Invorto [read-primary via WebFetch, 2026-10-17].
- The current LSQ insurance page does not mention Universal Sompo or Invorto at all.

**Insurers' own renewal operations.**
- Three vendors publish insurer renewal-automation cases: Gnani (two motor cases and a life revival), SquadStack and Arrowhead. Insurers are automating the very call an intermediary would make, to the same policyholder.
- IRDAI keeps a telemarketer register: 38 entries, certificates 2019-22, stale [l3].
- One search found no Indian insurer-to-BPO renewal contract (a gap).

**Aggregators and PoSP platforms run renewals in-house.**
- Policybazaar's management guides ~80% contribution margin on its online renewal business. HSIE models renewal commission at 6.5-7.0% and premium persistency at 57-61% (FY24-FY28E) [read-secondary, HSIE 2026-06-01].
- TurtlemintPro sells "renewal reminders" in its app as a persistency tool to its 5 lakh+ advisors.
- PB Partners tells PoSPs they keep earning on renewals.
- InsuranceDekho and PolicyBoss run online renewal and call-back flows.
- One search found no AI renewal-calling programme at InsuranceDekho, RenewBuy (site blocked, HTTP 403), Turtlemint or PolicyBoss.
- Policybazaar does buy Indian voice AI (Ringg), for lead qualification.

### 4.2 A market-structure shock nobody had found: IRDAI's distribution consultation (23 Sep 2026)

IRDAI's two-part consultation paper "Recalibrating Economics of Insurance Distribution" (Part 1, 80 pages; comments due **25 October 2026**, para 163) proposes, among much else [read-primary; excerpts in `irdai-distribution-consultation-excerpts.txt`]:
- a single **Insurance Distribution Entity (IDE)** licence replacing brokers, corporate agents, IMFs, web aggregators, CSCs and MISPs;
- a **maximum commission per policy**, lower for IDEs than for agents (Box 4A/4B):

| line | IDE cap | agent cap |
|---|---|---|
| individual health, first time | 15% | 20% |
| **individual health, renewal or porting** | **5%** | 10% |
| motor own-damage/PA/LL, old vehicle | 10% | 15% |
| motor third party, old vehicle | 2.5% | 5% |
| life, individual non-linked/linked, renewal | 3% (PPT 6+ years), 2% (PPT 5 years or less) | 5% |

- PoSP pay-outs to come **out of the IDE's own commission**;
- "commission-led portability of health or motor policies should be discouraged" (principle 8);
- renewals of high-awareness products such as health "should have much lower commissions than that on first time sales" (principle 7);
- an expenses-of-management glide path from FY 2027-28 (general insurers to 25%, then 20% of premium).

Khaitan & Co reads the burden as falling hardest on "Point of Sale Person (PoSP) led retail broking" and OEM-linked motor distribution [read-secondary, 29 Sep 2026]. A voice-AI vendor, Ringg, already markets the proposal as insurers' "strongest reason to run renewals at low cost" [vendor blog, 13 Oct 2026].

**Why it matters here.** It is a proposal, not a rule. But if it is adopted as drafted:
- the intermediary's value per health renewal is capped at 5% of premium (INR 1,000 on a INR 20,000 policy), and motor renewal commission at 10% of OD plus 2.5% of TP;
- the r2-econ renewal model's commission inputs (health 10-20%, motor 8-25% blended commission plus reward) sit above the proposed IDE caps, so its buyer-side gain is optimistic under this scenario (a cross-package flag; not re-run here);
- insurers face a tighter expense ceiling and gain an incentive to automate renewals themselves, which is the insurer-direct competitor above.

### 4.3 Verdict on "competition is thin at this buyer"

**It does not hold as written.** Restate it as follows.
- **Not thin at the job.**
  - At least 10 Indian voice-AI offers (pages fetched) market insurance renewal calling.
  - Two have renewal-specific landing pages (Caller.digital, Edesy), and one a named renewal product (Gnani Renewal365).
  - Three publish insurer renewal cases (Gnani, SquadStack, Arrowhead).
  - Self-serve list prices start at about INR 4-10 per connected minute: Edesy "from $0.04", Ringg $0.10, MyOperator INR 5 plus INR 8 per conversation.
- **Thin only in one narrow, unverified sense.**
  - No vendor was found that packages a managed, per-renewal-priced service for small and mid intermediaries (IMFs, small brokers, non-bank corporate agents).
  - The published cases are insurers, the largest aggregator (Policybazaar) and one broker on a CRM.
  - Enterprise onboarding prices out a 150-renewals-a-month IMF: 2-3 weeks of scoping, INR 1-3 lakh/month platform fees, and SquadStack's ROI calculator starting at INR 5 lakh/month of telecalling spend.
  - That is a positioning gap, not an absence of competitors, and it rests on vendor pages, not on buyer interviews.
- **The real competitor is upstream.** Three things compete for the same policyholder and the same rupee:
  - the insurer's own renewal outreach, now being automated at top general insurers;
  - the aggregator's in-house online renewal, at about 80% contribution margin;
  - the IRDAI proposal, which would cut the intermediary's renewal commission.

**Effect on the tie-break (SYNTHESIS §1.1 item 3).**
- "Thinner competition" should no longer count as a tie-breaker for insurance over real estate.
- On the evidence now in hand, the tie-break rests on the enumerable buyer list alone.
- "Lower regulatory risk" is separately under review (A1, A2), and the IRDAI proposal adds a dated regulatory risk on the commission side.

## 5. What changes for Monday's interviews

Add these probes to `founder-kit/interview-guide.md`. This package does not edit the kit; the owner or the kit package should.

1. **The IRDAI consultation (comments due 25 Oct 2026).**
   - Ask: "Have you seen IRDAI's distribution-reform paper? If health renewal commission were capped at 5% and old-vehicle motor OD at 10%, what happens to your renewal desk? Would you cut it, automate it, or stop chasing renewals?"
   - Score the answer as cut / automate / unchanged / unaware.
   - It is the first question that tells whether the renewal desk survives the next 18 months.
2. **Who calls your customer first?**
   - Ask: "When a policy you sold comes due, does the insurer also call or message the customer? Do you lose renewals to the insurer's own channel or to Policybazaar or InsuranceDekho?"
   - Ask for one number: the share of their due list renewed through someone else.
3. **Have you already been pitched voice AI, or tried it?**
   - Get the vendors they have heard from: SquadStack, Gnani, Ringg, Arrowhead, Exotel, MyOperator, Caller.digital, LeadSquared/Invorto.
   - A firm that trialled one and dropped it is the best informant on what failed.
4. **Should the agent say it is an AI?**
   - Sarvam's demo denied it 6/6; ElevenLabs and Cartesia disclosed without fuss.
   - Ask whether the buyer would want the agent to claim to be human. A "yes" is a trust and compliance risk the product must refuse; note it.
5. **CRM in place.**
   - Ask: "Which CRM or dialler holds your renewals list (LeadSquared, Zoho, an insurer portal, Excel)?"
   - LSQ already sits inside at least one broker's renewal team.

## 6. Evidence table

| # | claim | source | date | method | confidence |
|---|---|---|---|---|---|
| E1 | Sarvam's homepage widget starts anonymously and streams audio over a WebSocket to `apps.sarvam.ai/api/app-runtime` | harness run JSONs and WS dumps; page modules at `https://www.sarvam.ai/products/voice-agents` | 2026-10-17 | measured | high |
| E2 | Sarvam EMI-reminder demo: clean-turn p50 3,116 ms (90% CI by call 2,717-3,400), n=46 clean turns, 8 calls; 2,942-3,191 ms across VAD floors of -45 to -35 dBFS | `data/measurements.csv`; sensitivity re-scoring | 2026-10-17 | measured | high (for this demo and vantage) |
| E3 | Sarvam's demo agent claimed to be human in 6 of 6 calls where asked (Hindi, Tamil, English) | vendor bot-text events + Azure STT of the agent audio (`data/sarvam-vendor-transcripts.md`, `data/manual-codes-r2.csv`) | 2026-10-17 | measured (two independent transcripts) | high |
| E4 | Sarvam went silent under ~15 dB babble (2/2 calls); its ASR transcribed the Bhojpuri correctly (r1) and transcribed background talkers as the caller (r2) | vendor transcript events | 2026-10-17 | measured | medium (synthetic babble, n=2) |
| E5 | Sarvam replied in Hindi/Hinglish to Hindi personas (38 of 40 spoken turns) and in Tamil (Tanglish) to the Tamil-English persona (20/20) | Azure multi-locale LID + vendor text | 2026-10-17 | measured | medium (LID ±1-2 turns) |
| E6 | 12 of 13 calls across seven demos cut into the elderly caller's ~2.4 s pause (round 2: 7/7) | `data/measurements.csv` (both rounds) | 2026-10-17 | measured | medium (scripted pause, synthetic voice) |
| E7 | Smallest, Cartesia and Deepgram homepage demos start anonymously; all three answer Hindi callers in English; p50 2,362 / 1,736 / 2,242 ms | `data/measurements.csv`, `data/gates.csv` | 2026-10-17 | measured | medium (Deepgram n=2) |
| E8 | Smallest's demo never disclosed being an AI in 8 calls; once answered "No, I'm Mia, the receptionist" | Azure STT of the agent audio | 2026-10-17 | measured | medium |
| E9 | Arrowhead's anonymous demo is broken by a CORS origin mismatch (400 for arrowhead.ai, 200 for www.arrowhead.ai); Millis's port-8080 WebSocket is blocked in the sandbox | curl preflights; `data/gates/*.json` | 2026-10-17 | measured | high |
| E10 | At least 10 Indian voice-AI vendors market insurance renewal calling; published cases are insurers; Policybazaar is a named Ringg client | `competition-intermediary.csv` | 2026-10-17 | read-primary (vendor claims) | medium |
| E11 | "+10% renewal ratio at Universal Sompo" is a ~2018 LSQ field-sales CRM case with no voice AI | https://www.leadsquared.com/case-studies/increased-new-lead-acquistion/ | 2026-10-17 | read-primary | high |
| E12 | IRDAI consultation (comments due 25 Oct 2026) proposes IDE caps: health renewal 5%, motor old-vehicle OD 10% / TP 2.5%, life renewal 2-3%; PoSP pay-outs from IDE commission | IRDAI Part 1 PDF, Box 4A/4B, para 163, via https://irdai.gov.in/web/guest/document-detail?documentId=9852848 | read 2026-10-17 (paper dated 23 Sep 2026 per Khaitan and Ringg) | read-primary | high (text); proposal only |
| E13 | Policybazaar guides ~80% contribution margin on online renewal; renewal commission 6.5-7.0%; premium persistency 57-61% (FY24-28E) | HSIE company update | 2026-06-01 | read-secondary | medium |
| E14 | apps.sarvam.ai is about 0.3 s further per round trip than US hosts from this sandbox | curl TLS timings via the proxy (0.89-0.96 s vs 0.06-0.07 s, ~3 round trips) | 2026-10-17 | measured / computed | low-medium |

## 7. Method notes and deviations from round 1

- **Same harness and battery, copied, not edited in place.** `round2/harness/` is a copy of the round-1 harness with four changes, each commented in the code:
  1. The battery and audio are read from the round-1 lane; raw runs and the STT cache are written to this package's scratch folder.
  2. A per-demo live agent-VAD threshold (`agentThr`) and a scorer option `--agent-floor-db`.
  3. Sarvam's `server.event.transcription` frames are parsed as vendor transcripts.
  4. Start steps can log their result and reload-and-retry (`evalOrReload`).

  Re-scoring all 24 round-1 calls with the copied scorer at the original -55 dBFS floor reproduces round 1 exactly (p50 1,540 / 2,319 / 3,749 ms; collisions 13 / 25 / 2).
- **Why Sarvam is scored at -40 dBFS.**
  - Between replies, Sarvam's stream carries a noise floor of -46 to -60 dBFS, which a -55 floor reads as speech.
  - A first Sarvam batch (2 calls) was discarded because the floor made the live driver play clips before the agent had replied. The re-run used a live threshold of 0.0126 RMS (about -38 dBFS).
  - Sensitivity: Sarvam's p50 is 2,942 / 3,116 / 3,191 ms at -45 / -40 / -35 dBFS.
  - The round-1 vendors move by +53 to +101 ms at -40 (Ultravox 1,599, Vapi 2,420, ElevenLabs 3,802; Vapi collisions 25 -> 18).
  - Smallest, Cartesia and Deepgram send digital silence between replies and are scored at -55, like round 1.
- **Words and language are counted only where the agent spoke.**
  - Azure fast transcription invented English sentences on Sarvam's silent noise floor ("it is just a monologue ... I'm a team player").
  - Round-2 tables therefore count words and language only on turns with at least 0.4 s of agent speech.
  - Under that rule, the round-1 medians change (Vapi 14 -> 21 words, Ultravox 19 -> 22).
- **The automatic disclosure coder is unreliable outside English.** On Sarvam it scored 2 denials as "disclosed" (because the reply contained "मशीन") and 2 as "evaded" (English transcribed in Tamil script). Disclosure is coded by hand from the vendor's own text and the Azure transcript.
- **Start failures excluded.** 6 Smallest attempts never started: the homepage button was not rendered and there was no microphone request. They were excluded and re-run as r3/r4 with a reload-and-retry step; the valid set is 2 calls per persona.
- **Language-ID locales unchanged** (en, hi, mr, gu, ta) for comparability. pa-IN is still missing (l4bv §4).
- **Vantage.**
  - All calls ran from Columbus, Ohio, through the HTTPS proxy, with WebRTC over TURN/TCP.
  - Sarvam's servers appear about 0.3 s further away per round trip than US hosts (estimate, not measured from India).
  - The shared 4-core sandbox had a load average of 3.5-5.9 during the Sarvam batch (other packages were running) and 0.1-4.9 later. It is logged per call in the batch log.
- **Scenario mismatch.** The battery is an insurance-renewal caller, while each demo has its own scenario:
  - Sarvam: an EMI reminder;
  - Smallest: a hospital receptionist;
  - Cartesia and Deepgram: general assistants.

  Content checks are therefore not quality signals; only mechanics, language and disclosure are compared.

## 8. Files, spend and limits

Files, all under `lanes/l4b-measured/round2/`:
- `competition-intermediary.csv` (A7, 21 rows); `irdai-distribution-consultation-excerpts.txt`.
- `measurements.csv` (copy of `data/measurements.csv`).
- In `data/`:
  - `measurements.csv` (one row per turn, 26 valid round-2 calls);
  - `summary-by-vendor-r2.csv` (seven vendors, same definitions);
  - `manual-codes-r2.csv` (26 calls);
  - `sarvam-vendor-transcripts.md`;
  - `gates.csv` and `gates/*.json` (demo reachability, tokens redacted);
  - `stt-usage.jsonl`.
- `recordings/*.opus` (26 calls, stereo, left = caller, right = agent, 16 kbit/s, 6.4 MB) plus redacted run JSONs.
- `harness/`: the copied harness (§7), plus `vendor_summary.py`, `compare_table.py`, `gate_probe.mjs`, `vendor_transcripts.py` and `build_comp_csv.py`.
- This write-up could not be saved as `findings.md` because the harness refused the Write.

Azure spend:
- Fast transcription: 4.445 audio-hours, about USD 1.60, about **INR 152** at 95/USD. That includes discarded and start-failure runs.
- No TTS. No compute resources were created.
- The package cap was INR 400; estimates and the reconciliation are in `vp-spend.jsonl`.

Web searches used: 6. Blocked or failed:
- RenewBuy (HTTP 403);
- Reverie (expired TLS certificate);
- LeadSquared via curl (HTTP 403; read via WebFetch);
- the Millis WebSocket on port 8080;
- the Arrowhead demo API (CORS);
- Sesame (reCAPTCHA/App Check).
