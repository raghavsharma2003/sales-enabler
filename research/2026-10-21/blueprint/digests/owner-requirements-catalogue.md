# What the owner wants VP to be: the full catalogue

**Sources read in full:**
- `data/blueprint/owner-messages.md`: 60 entries, 2026-10-15 to 10-21. Four of them are compaction summaries rather than owner words; I used them only where they quote the owner.
- Every `requirement`/`directive.*` node in `context/graph.json` (68 requirement-typed).
- `context/DIRECTION.md`, `AGENTS.md`, `context/STATE.md`.
- `docs/competitive-build-map-v4.md`, `docs/product-decisions.md`, `docs/voice-platform-blueprint.md`, `docs/product-ux-reset-2026-10-01.md` and the v6/v7 Relay specs.
- `research/2026-10-20/product/teardown-brief.md`.

**Machine-readable copy:** `data/blueprint/owner-requirements.json` (68 requirements: 36 must, 26 strong, 6 nice).

**How to read it:**
- Quotes are the owner's own voice-typed words, lightly trimmed.
- The "×N" counts are how many separate messages or days carry the idea. The duplicated 10-17 message counts once.
- Priorities:
  - **must** = called core, or repeated 3 or more times;
  - **strong** = clear but stated once or twice;
  - **nice** = idea-level, deferred by the owner, or Relay-era and not restated since the 2026-10-15 reset.

---

## 1. The non-negotiables (what the blueprint fails without)

1. **The voice is the product.** It must be emotional, relational, expressive and exactly human in sound and behaviour (×7: 10-17, 10-18, 10-19, 10-20 ×3, 10-21).
   - "the emotional and relational exactly human like sounding agents are the main thing" (10-18).
2. **Voice over margin.** "margin we can basically compremise with but the voice need to be really good" (10-19). Price matters, but never at the voice's expense.
3. **Human conversation, not a script.**
   - Open with something useful, read the person, never waste their time, talk more if they want, then ask clearly. The agenda gets done subtly (10-20 ×3).
   - "if you just be call and say you are an AI agent and blah blah ... they will just cut the call" (10-20).
4. **Better than every competitor in every sense:** UI, UX, product design, cost, speed, user flow, convenience, usability, vibe and results (10-20, 10-20 18:52, 10-21).
   - Parity is the floor: "all the rest features what any other player ... we should have all of them obviously" (10-17).
5. **LLM-native, just talk.** The client talks to VP's agent, which explains and then does the work (10-20, 10-21).
   - "he just have to talk" (10-21).
6. **Campaigns end to end**, with a full view of the campaign and of each call, every recording, and deep AI analysis (10-15, 10-17, 10-20, 10-21).
7. **Memory, personalisation and self-learning are in the blueprint.**
   - The call-100 to call-101 example appears twice (10-17, 10-20) and the theme again on 10-21.
   - Sequencing: v1 ships competitor parity made better. Memory, personalisation and emotional intelligence come before self-learning (10-20).
8. **About ₹2/min or under, "missing nothing"** (×5).
9. **Speed:** latency good, first word fast (10-18, 10-20 complaint, 10-21).
10. **Keep learning from competitors always**, and store everything so no effort is wasted (×4 each).
11. **Trust floor (project rules plus the Relay-era owner clarification):**
    - she never denies being an AI and discloses once, lightly;
    - no manipulation; crisis lines 14416/112 stay;
    - synthetic test data only.
12. **Test integrity:** no model swap mid-call, and results are filed under the combination that actually ran (10-20).

---

## 2. Requirements by theme

### 2.1 Voice and conversation (the core)

| id | requirement | owner's words | date | × |
|---|---|---|---|---|
| req-01 | Emotional, relational, exactly-human voice is THE core | "emotional and relational voice calling agents which are extremely human like in sound and behaviour too"; "emotive and relational voice" | 10-17 → 10-21 | 7 |
| req-02 | Voice beats margin | "margin we can basically compremise with but the voice need to be really good" | 10-19 | 2 |
| req-03 | Human conversation, not agenda repetition; the caller feels comfortable | "proper conversations like a human would instead of just repeating the agenda again and again"; "not be in a robotics behaviour but a human behavior so that personal feel comfortable" | 10-20 | 3 |
| req-04 | World-class telecalling | "do something interesting and nice and talk about it, and then basically certainly ask ... Even without wasting the user's time ... if ... user is willing to talk more ... she can talk more ... she will be able to judge the user" | 10-20 | 2 |
| req-05 | Expressive: emotion, voice modality, reaction, emotional intelligence | "the feel of emotion and voice modality and reaction etc is not good"; "We need more expressive and human like" | 10-20, 10-21 | 3 |
| req-06 | She hangs up herself when it is done | "when the call is done or she feels like it's done she should be able to cut it from her end" | 10-20 | 1 |
| req-07 | Register | "friendly and human like still professional but intresting and nice to talk to" | 10-20 | 1 |
| req-08 | A strong brain, better than gpt-oss and better than industry standard; track new cheap and fast models | "we need a better brain then gpt oss ... do better then the industry standards"; "new strong and cheap models comming everyday" | 10-19, 10-20 | 2 |
| req-09 | Hinglish and Hindi expressiveness; learn from Maya | "gemini voice are good in hinglish. maya voice is good and expressive to specially in hindi"; "you can Learn from maya" | 10-19, 10-20 | 2 |
| req-12 | Relational continuity over long and frequent conversations | "relational thing, emotional thing, in long running conversations, in frequent conversation with same client" | 10-20 | 2 |

What the owner said about round 1 (10-20): "the conversation and content part and emotional and relational part were not good in any of them." This was measured: every stack was robotic, and brief v2 fixed most of the content metrics (`context/DIRECTION.md`).

### 2.2 LLM-driven, just-talk application

- **req-13 (must):** "They should be coming and talking to a chatbot only to basically do all these things. It should not be basically doing a same structure and figuring it out" (10-20). Repeated on 10-21: "how our whole application will be llm driven."
- **req-15 (strong):** "every part of it is driven by AI and the whole thing too" (10-15); "all should be ai driven" (10-17).
- **req-16 (strong):** the client can choose "the overall brain of the whole product also" (10-20). This means the copilot's LLM, not only the call stack.

### 2.3 Agents that do the work

- **req-14 (must):** "how everything will be handled for him by our agents and he just have to talk" (10-21).
- **req-17 (must):** "I have this CSV I want to upload ... and fire this, then he will tell how to do it and he will do it themselves" (10-20). The agent both explains and does.
- **req-18 (nice, deferred):** the company command centre: AI CRM, AI ERP, lead gen, scraping, WhatsApp agent, email campaigns, SEO/AEO, company brain.
  - Raised 10-15 and 10-17: "basically a system that control the whole company".
  - Parked 10-18: "not command cent".
  - Keep it as the long-run horizon; it is not v1.

### 2.4 Campaigns end to end

- **req-19 (must):** Indian enterprises fire agents at their customers:
  - pre-sale: selling, surveys, outreach;
  - post-sale: feedback, surveys, customer success, "predictions".
  - Stated 10-17 and 10-20. On 10-20 18:52 the owner demoted pre-sale vs post-sale to an input: "this pre sale and post sale thing you have focused more on the intent was to understand and reverse engineer..."
- **req-20 (must):** "campaign launch analyse and grow" (10-15); "how we handle the campaign end to end" (10-21).
- **req-21 (must):** "give him the whole view of the campign and each call" (10-21).
- **req-22 (must):** "they can see the voice, every voice call recording" (10-20).
- **req-24 (must):** "whole product flow, whole user flow, handling all the cases around it" and "better case handling" (10-20).
- **req-23 (strong, Relay 09-21):** a customer-feedback campaign is a full loop: interview, analysis, team improvement, follow-up.
- **req-66 (nice, Relay 09-22):** each campaign names offering, outcome, audience and evidence, with identity and column review before launch.

### 2.5 Per-call and campaign AI analysis

- **req-25 (must):** "the overview analytics and extremely depth analysis" (10-20).
- **req-26 (must):** "amazing ai analysis of those" (each call and the campaign) (10-21).
- **req-27 (strong):** show improvement over time: "see the how it's changing for them in long running conversations ... how it's recursively self-improving" (10-20).

### 2.6 Omni-channel data

- **req-28 (must):** "any type of the data they put on to a product, and the product takes it and give them an option to fire an agent" (10-20).
- **req-29 (must, ×4):**
  - "omni channel data" (10-15, 10-17);
  - "the handling of the data that the client will put in, the omni-channel data, how it will be managed, how all the cases will be handled" (10-20);
  - "how he will connect onmi channel data how we take usefull from that" (10-21).
- **req-30 (strong):** company context at onboarding: "it will be better if the voice ai have the context of company too" (10-17). Ties to the "company brain" (10-15).
- **req-31 (nice):** personalise from other sources: "what he have done on some app etc" (10-17).

### 2.7 Personalisation and memory

- **req-32 (must, ×3):** "extract so much of data from the previous conversation with the customer and the customer attributes by themselves and do personalization there"; "the memory of the voice AI, the persistent of the voice AI, the personalization" (10-20); "when we call the same person again we have so much learning from his past call" (10-17).
- **req-10 (strong):** regional language and accent: "calling to a south india customer then we should be talking to them in there region accent and language ... bihari accent and even bihari-hindi mix" (10-17). The owner called this "just one angle ... just top level."
- **req-33 (strong):** "learning from the user and group of users" (10-17).
- **req-36 (strong):** deeper personalisation and learning can be higher-priced tiers (10-18).

### 2.8 Self-learning

- **req-34 (must, ×3):** "in 100 90 were drop of just after some line ... in the 101 call that line should be modified ... it should not be just this simple it should be on the go self improvement in every way" (10-17). Restated on 10-20 ("after 100 calls ... in the 101 call ... our self-learning AI will change and pivot") and on 10-21 ("self learning calling voice ai").
- **req-35 (strong):** build on google-research/harness2 fundamentals (10-20).
- **Timing:** the owner places this in "second scope" / later (10-20), but wants it designed into the blueprint now (10-21).

### 2.9 UI, UX and vibe

- **req-37 (must):** "extremely good product with extremely great product design and usability, amazing UI UX, animation design, whole product flow, whole user flow" (10-20). Also: "highly thoughtful about the product we are building."
- **req-38 (must, ×3):** "better product then them in every sense (ui,ux, product design, cost, speed, user flow, convinence, usability, vibe and results" (10-21). Also "better product design, better vibe, better usability, better case handling ... more intelligence, more smartness" (10-20).
- **req-39 (strong):** "onboard themselves in an hour or in a half an hour" (10-20).
- **req-40 (strong):** visual deliverables: "gimme a visual report" (10-15); "im a visual learner" (10-21).
- **req-68 (nice, Relay 09-27):** review-first AI UX showing provenance and control. This must coexist with just-talk.

### 2.10 Cost and speed

- **req-41 (must, ×5):** "preferably under 2rs per mint ... missing nothing" (10-17).
  - "how can we have the calling cosst at 2 without lossing the human like voice" (10-18).
  - "a cheaper product than them" (10-20).
  - "cost" (10-21).
- **req-42 (strong, in tension):** "every part i wanna build in house only" (10-17), but "self hosting model im not fan rn until we have enough volume and clients" (10-19).
- **req-43 (strong):** "a better product than them, a cheaper product than them, a higher quality product than them" (10-20).
- **req-44 (strong):** "how the charging, pricing will be handled" (10-20).
- **req-11 (must):** "the latency also has to be good" (10-18).
  - 10-20 complaint: "latency is extremely high and the first word of initialization is also extremely late."
  - 10-21: "speed".

### 2.11 Results for clients

- **req-45 (must):** "really value adding in real life to our clients and not just be value adding on the paper(theory)" (10-17).
- **req-46 (must):** "full filling every requirement of our clients and they have amazing result and experience with the product" (10-21).
- From the Relay era (`docs/product-decisions.md`): judge results by useful outcomes, not call counts or sentiment.

### 2.12 Compliance and trust

- **req-47 (must):**
  - Never deny being an AI; disclose once, lightly (Relay `constraint.no-ai-identity-deception-v6`, a user clarification on 09-22, plus the standing rule).
  - The owner's 10-20 objection is to *leading with* "I am an AI agent" and repeating it, not to disclosure itself.
- **req-48 (must, standing rule):** no manipulation; Tele-MANAS 14416 and 112 stay; synthetic data in tests.
- **req-49 (must):** "we don't want the model to change in between of testing since it might make us do wrong judgment"; track the brain actually selected on a preset; "If the quota is not there, tell me, I will buy some" (10-20).
- **req-65 (strong, Relay 09-22):** pause, stop, retry and failure keep operator authority.
- **Gap:** the owner has said nothing about DND, TRAI or DLT. That compliance comes from research (`decision.2026-10-21.wt-synthesis-must-be-changes`).

### 2.13 Platform, self-serve and stack choice

- **req-50 (must):** "make a serve serve like platform like vapi" (10-18).
- **req-51 (must, ×3):** parity with Bolna, Vapi and ElevenLabs, "then make it better" (10-17, 10-20 ×2).
- **req-52 (must, ×3):** the client chooses the stack:
  - "select the TTS, the brain and the STT" plus "4 or 5 the best combination" and "select various models ... for each use case" (10-20 08:45);
  - "give the user also an option to select the stack" (10-20 15:06);
  - again on 10-20 15:44.
- **req-53 (strong):** "generally I like the Gemini TTS" (10-20); "for stt we will be needing gemini only" (10-20). The final pick waits for round 2.
- **req-54 (strong):** provider-open by measurement.
  - Use: Gemini, Azure/Foundry under the grant, OpenRouter, Sarvam.
  - Avoid: "inworld lets avoid"; "lets avoid aws now".
  - This supersedes 10-15 "lets use azure only".
- **req-55 (strong):** real Indian phone calls; "my friends could send out a call on their phone and test"; multiple testers (10-19).
- **req-56 (strong):** Indian businesses, "probably will be b2c"; exclude Blinkit, Swiggy, Zepto and Zomato-type in-house teams (10-17).
- **req-57 (nice):** extra product layers like Bolna's ("they have CRM also, they have their layer also") (10-20).
- **req-58 (strong):** "we need to build frontier product for society we need frontier tech here" (10-20).
- **req-67 (nice, Relay 09-27):** brand and team auth; web, voice, WhatsApp and Telegram deployment.

### 2.14 Learning from competitors

- **req-59 (must, ×4):** "crack all these top voice calling AI products and companies to their core"; "to there quantas"; "use rea extremely deeply" (10-20); "understand these players deeply" (10-21).
- **req-60 (must, ×3):** "in voice ai there is new breakthrough literally everyday" (10-17); "upcoming voice AI company also ... All of them we need to basically crack" (10-20); "learn and get the best from all these companies always" (10-21).
- **req-61 (must, ×4):** "always keep writing the context as a graph" (10-15); "Keep saving and storing all the knowledge ... tokes are not waskted" (10-20); "store and log everything so that we dont loss the data" (10-20).
- **From the pool, the best of everything:** "get the best out of everything, and then we will make a single product which will be just amazing" (10-20).

### 2.15 Working method (for the blueprint process itself)

- **req-62:** "I want a deeper version of this task, not a bigger one" (×3: 10-17, 10-18, 10-20).
- **req-63:** model policy. The main chat runs the top model at extra-high; elsewhere the model is chosen per use case (×7 on 10-20): "if mixure of the model and efforts will give better performace at lower tokens then why waste more."
- **req-64:** autonomy and parallelism: "just behave autonomously" (10-20); "keep working throughout autonomously" (10-15).

---

## 3. What the owner rejected or called stale

| What | Owner's words / record | Date |
|---|---|---|
| Codex-built Relay baseline (`app/`, `lib/`) | "kinda fuckedup and very basic and stale" | 10-15 |
| Relay `/prototype` | rejected; led to `docs/voice-platform-blueprint.md` | 09-22 |
| Whole Relay design and usability | "rejects the product's overall design and usability" (`decision.product-ux-structural-reset-2026-10-01`) | 10-01 |
| command_centre as a product | "cc is basic and old and we would be making 100x better product" | 10-17 |
| Every round-1 stack's conversation | "conversation and content part and emotional and relational part were not good in any of them" | 10-20 |
| Opening with an AI announcement and repeating | "say you are an AI agent and blah blah ... they will just cut the call" | 10-20 |
| gpt-oss as brain | "we need a better brain then gpt oss" | 10-19 |
| Taxila Asha voice | "okay not good but okay" | 10-19 |
| Silent model swap in tests | "we don't want the model to change in between of testing" | 10-20 |
| Inworld; AWS for now; self-hosting before volume | "inworld lets avoid"; "lets avoid aws now"; "self hosting model im not fan rn" | 10-19 |
| Azure-only (own directive reversed) | 10-15 "lets use azure only", then 10-18 "should we use some different service like gemini" | 10-18 |
| Over-focus on pre-sale vs post-sale | "the intent was to understand and reverse engineer these product end to end" | 10-20 |
| Opus 4.8 for workflows (process) | "its a stupid model"; "dont change model to 4.8 opus again" | 10-20 |
| "Policies" | a dictation error, not a module (`decision.dictation-correction`) | 09-21 |
| Study abroad as first buyer | owner-supplied in the Relay era; research then rejected it as beachhead (`rejected.2026-10-17.study-abroad-beachhead`) | 10-17 |

**What the owner asked for and the agent declined:**
- Per-call rotation across about 40 free Gemini keys, asked 10-18 and 10-20 (`rejected.2026-10-20.free-key-rotation`).
- Automated dashboard logins.

Neither may reappear as a product mechanism (no quota laundering).

---

## 4. Tensions the blueprint must resolve (owner wish vs measured evidence)

1. **₹2/min vs the voice.**
   - Gemini Live at ₹2 was rejected: ₹4.2–5.7/min at 3-minute calls (`rejected.2026-10-19.gemini-live-at-rs2`).
   - Per-minute launch pricing was modelled at −47% to +1% margin (`rejected.2026-10-17.per-minute-launch`).
   - Tiers need re-pricing once the stack is chosen (`open.2026-10-20.reprice-tiers`).
   - The owner's rule decides it: voice wins, margin flexes.
2. **"Build in-house" vs "no self-hosting until volume".** Read it as owning the orchestration, brief, memory and learning in-house, and renting models.
3. **Disclosure vs "don't open with I'm an AI".** Disclose once, lightly, after value. Never deny.
4. **Bihari-Hindi accent wish vs evidence.**
   - `rejected.2026-10-17.dialect-tts-wedge`: employers ask for a dialect in 1 of 828 postings, and no dialect TTS locale exists.
   - Keep it as a personalisation feature, not a wedge.
5. **"Learn from groups of users" vs cross-tenant pooling.**
   - Pooling gave the wrong winner to 48–55% of dissimilar tenants and conflicts with DPDP (`rejected.2026-10-17.cross-tenant-pooling`).
   - So learn within a tenant's cohorts.
6. **Self-learning "on the go" vs statistics.**
   - K=2 A/B dashboards gave 52–62% false winners in A/A (`rejected.2026-10-17.k2-dashboards`).
   - A model must not grade its own work.
   - Design it as harness2 propose → probe → compose with a held-out probe and visible, reversible changes.
7. **Parity as wedge vs parity as floor.** `rejected.2026-10-17.parity-undercut` still holds. The wedge must be measured task failures (W1–W10, `research/2026-10-20/teardown/SYNTHESIS.md`).
8. **Just-talk copilot is parity.** 5 of 6 dashboards ship a copilot (ElevenLabs Architect, Bolna Auto Build). VP's copilot must win on doing the whole campaign end to end through tools (W10), not on existing.
9. **Stack choice vs simplicity.** The owner wants STT, brain and TTS choice. The decision reverses to presets if users get confused (`decision.2026-10-20.product-stack-selectable`). So: curated presets first, an expert picker with INR and India-measured latency per row.
10. **Pre-sale selling vs TRAI.** Cold outbound sales was rejected as the lead job (`rejected.2026-10-20.regulation-segment-cold-outbound-lead`). Pre-sale stays supported, with compliance by default.
11. **Command-centre ambition vs a self-serve voice platform now.** Keep the CRM, WhatsApp and omni-channel data that feed voice context; defer ERP and SEO/AEO.
12. **"Any data, from any app" vs DPDP consent.** Personalisation from other sources needs purpose and consent records.

---

## 5. The owner's taste words (the feel they want)

**Voice:**
- "extremely human like in sound and behaviour"; "emotional and relational"; "emotive"; "expressive"; "conversational";
- "friendly and human like still professional but intresting and nice to talk to";
- "something interesting and nice"; "subtlly"; "personal feel comfortable"; "not ... robotics behaviour";
- "relate too" (dialect); "emotional intelligence"; "sound like a human".

**Product:**
- "extremely good product"; "extremely great product design and usability"; "amazing UI UX, animation design";
- "vibe"; "convinence"; "highly thoughtful"; "100x better"; "frontier product for society";
- "just amazing"; "best of everything"; "amazing result and experience".

**Method:**
- "crack them to there quantas"; "to their core"; "deeper ... not bigger";
- "dont do half work and miss out on things"; "really value adding in real life ... not on the paper".

**Interaction model:**
- "he just have to talk"; "talking to a chatbot only"; "he will tell how to do it and he will do it".

---

## 6. Asked for but not yet designed anywhere (blueprint gaps)

- The owner selecting **the copilot's own LLM** (req-16).
- **Visible recursive improvement over time** for the client (req-27). No vendor shows it; Bolna emits the signals but has no loop (`evidence.2026-10-20.bolna-check-no-memory-no-loop`).
- **Personalisation from external app data** (req-31), with its consent model.
- **"Predictions"** as a post-sale job (10-17), undefined.
- **Charging and pricing UX** inside the product (req-44): the INR, pulse and spend-cap work in `decision.2026-10-21.wt-synthesis-must-be-changes` is a start.
- **A continuous competitor-watch loop** (req-60): the radar exists (`research/2026-10-20/teardown/radar`) but there is no recurring sweep.

---

## 7. Hygiene note

`data/blueprint/owner-messages.md` (gitignored under `data/`) still holds unredacted sensitive strings:
- password-like strings around lines 615–704;
- a phone number at line 988.

Redact them before this file feeds any published artifact. They are not reproduced here.
