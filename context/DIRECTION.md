# Direction — read this first

_Last rewritten 2026-10-24. Rewrite it, don't append, whenever the phase, a directive or the next step changes (`context/PROTOCOL.md`)._

## What we are building

Working name: **Vyakti Platform (VP)** (`directive.2026-10-17.vp-venture`).

**What it is**
- A **self-serve voice-agent platform, Vapi-like**, for Indian businesses (`directive.2026-10-18.self-serve`).
  It is aimed at **medium-to-large enterprises** first, and small ones only by use case (`directive.2026-10-22.enterprise-english-ui`).
- **The UI is professional English, never Hindi or Hinglish.** Hinglish is how the agent speaks on calls, not product copy.
  The bar (`directive.2026-10-22.product-bar`): beat every competitor on quality, value and price; run the product through
  LLM agents; build LLM-driven analytics and learning; nothing gimmicky.
- The core product is **emotional, relational, exactly-human-sounding Hinglish voice** (`directive.2026-10-18.voice-core`).

**What "world-class telecalling" means** (`directive.2026-10-20.world-class-telecalling`):
- open with something interesting and useful;
- read the person; talk more if they want; never waste their time;
- get the agenda done subtly, then ask clearly.

**Pricing**
- The ambition is about ₹2 per minute (`directive.2026-10-17.price-target`).
- The owner accepts a lower margin, but not a worse voice (`directive.2026-10-19.hear-before-choose`).
- Learning agents and deep personalisation are higher tiers.

## Phase now: product build, start to end (since 2026-10-20)

- **The product brief is in** (`directive.2026-10-20.product-brief`). The product serves Indian enterprises calling
  their customers, pre-sale and post-sale.
  - v1: what competitors have, made better on design, usability, case handling and intelligence.
  - Setup is LLM-native and chat-driven (`directive.2026-10-20.llm-native`).
  - v2 brings memory, personalisation and self-learning, built on harness2.
- **Step 1, the competitor teardown, is complete (2026-10-21).** Three passes, all with 0 agent errors and 0 spend:
  1. Public material: `research/2026-10-20/teardown/SYNTHESIS.md`. Covers 8 vendors; 344 claims verified; 125
     predictions; W1–W10 hypotheses; 21 must-be items.
  2. Authorised API/SDK on our own keys: `research/2026-10-20/account-phase/SYNTHESIS.md`.
  3. Instinct's dashboard walk-throughs of Vapi, Retell, Bolna, ElevenLabs, Sarvam and Exotel:
     `research/2026-10-21/walkthroughs/SYNTHESIS.md`. Per-vendor `report.md`, `claims.json` (344) and `defaults.json`
     (346) sit beside it.

  Pass 3 proposes 4 must-be additions (`decision.2026-10-21.wt-synthesis-must-be-changes`):
  - **A.** Price and India-measured latency at every stack choice, plus an all-in INR per minute.
  - **B.** Contacts with DND and attempt history.
  - **C.** Bounded call and spend defaults.
  - **D.** State integrity: no click-to-publish, unsaved markers, a reason on every disabled action.

  It also promotes AI disclosure to a must-be, and moves India data residency into architecture and contract terms.
- **What all six dashboards confirm:**
  - 0 of 6 put consent, DND or DLT on the campaign form;
  - 0 of 6 show a predicted reply gap;
  - 0 of 6 offer a Hinglish mode;
  - none reached a ring on an Indian line.
- **What stays unproven:** W3 and W4 (reply gap, Hinglish turn-taking), W2 (CSV) and W7 (first Indian ring). They need
  live calls. The ordered plan is `open.2026-10-21.wt-synthesis-evidence-plan`.
- **The blueprint is written (2026-10-21).** The owner chose blueprint-first (`directive.2026-10-21.blueprint-end-to-end`).
  - The document: `research/2026-10-21/blueprint/BLUEPRINT.md` (`evidence.2026-10-21.vp-blueprint`).
  - The visual page for the owner: https://claude.ai/artifact/8ChmABjjcftL7ksC9r89yq, source in
    `research/2026-10-21/blueprint/page/`.
  - Inputs and working: digests, the spine, 9 modules, the red team and defaults, all in the same folder.
  - Its 10 defining decisions are proposed, not approved (`decision.2026-10-21.blueprint-defining-decisions`).
  - It says plainly where VP loses today (`risk.2026-10-21.blueprint-not-better-yet`).
- **Building now (`directive.2026-10-21.build-end-to-end`).** The owner said to go with the blueprint's recommendations
  and build the product end to end. Rules for this build:
  - stack choice: a **provisional default** (`v2-flashlite`, `decision.2026-10-22.default-stack`), the curated stacks,
    or **build your own** from parts. Parts are ears, brain and voice, or one speech-to-speech engine
    (`directive.2026-10-22.full-stack-selection`, `decision.2026-10-22.custom-stack-contract`). A built stack is
    test-calls-only until it is measured;
  - provider routing: Gemini through Vertex; whatever is on Azure Foundry through Azure; OpenRouter only for the rest
    (`directive.2026-10-22.provider-routing`). Gemini ears are retired, because Vertex has no Gemini transcription. Ears
    are Azure Speech (`decision.2026-10-22.ears-azure-not-gemini`);
  - price is deferred and shows as "not set";
  - the product is **horizontal**, for every kind of enterprise, not just insurance;
  - self-learning is harness2-style.

  The code is in `product/`; read `product/ARCHITECTURE.md` first. What is in it:
  - a TS control plane: kernel plus 10 modules, about 165 tools, the approval classes A1/A2/A3;
  - the Python voice runtime `product/voice`;
  - the React web app `product/web`;
  - the e2e acceptance test `product/tests/e2e.test.ts`.

  State on 2026-10-22 at d6b1d97:
  - tsc clean; 379/379 on a fresh Postgres 16, including the browser flows;
  - the voice runtime suite is OK; CI has three jobs (control-plane, web-e2e, voice-runtime).

  Next:
  - three adversarial reviews are running (money and auth; who gets called; what she says);
  - the remaining web gaps;
  - the owner decides the safety second layer (`decision.2026-10-21.safety-second-layer-proposal`; the regex door
    caught 51.5% of blind harmful lines);
  - the owner OKs a deploy;
  - real keys and a real phone line.

  The blueprint's 16 owner decisions (`open.2026-10-21.blueprint-owner-decisions`) and the Phase 0 gates still stand:
  - buyer interviews;
  - the carrier quote round (KC5);
  - the turn-manager redesign;
  - round-2 ratings;
  - counsel (KC8);
  - DLT registration and a VP-owned Google organisation.

  They now run alongside the build, not ahead of it.
  - **Watch:** parity as a *wedge* was rejected on 2026-10-17. v1 has to win on measured task failures, not on feature
    count (`open.2026-10-20.parity-floor-vs-wedge`). The dashboards confirm chat setup is parity (5 of 6 ship a
    copilot).
  - **Watch:** pre-sale vs post-sale is partly a TRAI question (`open.2026-10-20.presale-vs-postsale`). It is a
    go-to-market input, not the organising question (`directive.2026-10-20.intent-better-product`).
- **Screenshots are read by Sonnet, not Haiku.** Haiku failed a pre-registered calibration
  (`decision.2026-10-21.sonnet-reads-screenshots`). Drive's read call returns OCR text only, so screenshots are fetched
  as pixels with `scripts/walkthrough-drive.mjs` (`rejected.2026-10-21.drive-read-for-screenshots`).
- **The goal of the research:** understand each competitor's product end to end, then design VP to be better in every
  dimension, with VP's own features on top. The final brief is a dimension-by-dimension product blueprint
  (`decision.2026-10-20.blueprint-frame`). For each dimension it gives:
  - how the best competitor does it;
  - where each one falls short;
  - VP's better design;
  - where emotional voice, memory, personalisation and later self-learning sit.
- **The voice stack is a user choice** in the product. The default is provisional, and the owner leans towards
  **Gemini TTS**. The default is confirmed or changed by round-2 ratings and the first real use-case calls.
- **The voice lab is live on Vertex again** (2026-10-22). vp-voice was reinstated, and the owner made a new key.
  - The round-2 stacks listen with Azure Speech. Live runs at us-central1, the only region that serves 3.8 Live.
  - Smoke results are in `measure.2026-10-22.round2-smoke-vertex`. All 4 stacks completed with 0 errors:
    - v2-live: 1.1–1.5 s;
    - v2-mai: 1.8–2.1 s;
    - v2-flashlite: 2.0–2.7 s.
  - **No Vertex batches until 2026-10-23 20:00 UTC; after that at most 1 request/s, from the VM only**
    (`decision.2026-10-21.appeal-commitments-binding`).
- **Port the lab's pieces into the product.** Don't run two voice stacks. Ported:
  - adapters, combination identity, brief v2 + agenda ledger;
  - hang-up guard, turn-taking, Plivo line, cost meter.
  The `asset.voicelab.*` nodes list them.

## Owner directives in force

| id | in one line |
|---|---|
| `directive.2026-10-22.enterprise-english-ui` | No Hindi or Hinglish anywhere in the UI; enterprise-grade for medium-to-large companies first. |
| `directive.2026-10-22.full-stack-selection` | The user picks the whole stack, part by part, plus a default. |
| `directive.2026-10-22.provider-routing` | Gemini through Vertex; Azure Foundry if available there; OpenRouter only for the rest. |
| `directive.2026-10-22.processing-anywhere` | Gemini may process audio wherever Google does (US, EU, global). |
| `directive.2026-10-21.vertex-for-everything` | Every Google/Gemini call goes through Vertex (project vp-voice, team@vyakti.ai). |
| `directive.2026-10-20.human-conversation` | Human conversation, not agenda repetition; expressive; learn from Maya. |
| `directive.2026-10-20.agent-hangup` | She ends the call herself when it is done; friendly, professional, interesting. |
| `directive.2026-10-20.no-midcall-swap` | A test never changes a model mid-call. Results are filed under the combination that actually ran. |
| `directive.2026-10-20.stop-and-wait` | Don't burn tokens re-routing around provider limits. Wait, or the owner pays for capacity. |
| `directive.2026-10-20.model-clarified` | The main chat runs Opus 5.5 at extra-high. Workflows, subagents and parallel agents get the model and effort the task needs (ladder in `CLAUDE.md`). |
| `directive.2026-10-20.terms-override` | Vendor terms are not a constraint on the teardown (owner's risk). The kept lines in `decision.2026-10-20.teardown-lines` still hold. |
| `directive.2026-10-20.context-before-compact` | Write deep context to the graph before every compaction (`PROTOCOL.md`). |
| `directive.2026-10-18.provider-open` | Not Azure-only any more: Gemini, OpenRouter and others are allowed, chosen by measurement. |
| `directive.2026-10-15.azure-scope` | Shared Azure subscription. Create or modify only VP resources (`vp-research-rg`). Taxila's deployments hold the GPT-6/5.6 quota: never touch them. |

## Standing rules (from incidents; each has a node)

- **No free-key rotation** across accounts, ever. Asked twice, declined twice. Paid tiers only (`decision.2026-10-18.no-free-key-rotation`, `rejected.2026-10-20.free-key-rotation`).
- **Google credentials are used only from the India VM**, rate-limited, with slow ramps. Never from the coding sandbox (`decision.2026-10-20.google-from-india-only`).
- **No silent fallbacks in tests.** A failure invalidates the call with the exact reason (`decision.2026-10-20.no-midcall-swaps`). Production failover policy is still open (`open.2026-10-20.product-failover-policy`).
- **Check real balances, not key limits**, before spending (`decision.2026-10-20.or-balance-preflight`).
- **Secrets** live only in scratchpad env files (mode 600) and `/opt/voicelab/.env` on the VM. Never in the repo, never printed. The owner's test phone number stays out of commits.
- **The agent never denies being an AI.** She discloses once, lightly. No manipulation. Crisis lines (Tele-MANAS 14416, 112) stay in the brief. Synthetic or fictional test data only.
- **No paid upgrade without owner approval.** No model identifiers in commits or PRs.

## What we know (best measured so far)

**Round 1:** the best-rated stack was Gemini 3.1 Live, 7.0/10. It shuts down 2026-11-17. Azure-voice stacks scored 1.5–4.5. **Every stack's content was robotic**, and the cause was the brief, not the brains.

**Brief v2:** words per turn went from 33 to 20, question endings from 62–76% to 13–29%, and abrupt hang-ups from 17–40% to 0. Human round 2 has not run yet.

**Brains on v2** (LLM judges): best was Gemini 3.8 Flash (65/75), but its first token is 2.0 s from India. Gemini 3.5 Flash-Lite took 0.70 s; GPT-5.4 mini took 0.96 s. **GPT-6 Luna was judged last** (28/30), and the owner has not confirmed that by ear.

**Voices, first audio from India:**

| Voice | First audio |
|---|---|
| MAI-Voice 2.1 Flash | 425 ms |
| Gemini 3.8 Flash-Lite TTS | 624 ms |
| Gemini Flash TTS | 772 ms |
| Gemini TTS via OpenRouter | about 2.1 s (non-streaming) |

**Reply gaps (round-2 smoke, India):**

| Stack | Reply gap |
|---|---|
| 3.8 Live | 0.8–1.6 s |
| Flash-Lite cascade | 1.6–2.2 s |
| 3.8 Flash cascade | 2.9–4.2 s |

**Turn-taking is unsolved across all stacks:** 15–42% cut-ins (`open.2026-10-19.turn-taking`).

**Gemini API Tier 1 can't carry voice volume:** 100 requests a day per TTS model.

The tiers proposed on 2026-10-19 assumed gpt-oss plus a stock Azure voice. Round 1 contradicts that, so **re-price after the default stack is chosen** (`open.2026-10-20.reprice-tiers`).

## Now: proving quality on real models (since 2026-10-23)

The owner restored the usage limit and asked for full autonomy twice (`directive.2026-10-23.full-autonomy`, again on
2026-10-23 after a limit). The scope is in `decision.2026-10-23.autonomy-scope`:
- **In:** builders, benches and evals on existing keys within caps, and private staging on the India VM.
- **Still waits for the owner:** new paid resources, a Plivo recharge, calls to real people, a public deploy, secret
  rotation, a customer price, and the trial credit amount.

Every measured decision is re-taken by benches on the real Azure and Vertex models, one run at a time, at most
1 request/s. Vertex runs only from the VM.

### Measured on 2026-10-24 (real models; n, method and tree are in each node)
- **Openings, staging e9fdde3** (`measure.2026-10-24.staging-openings-e9fdde3`):
  - exactly one AI disclosure 6/6;
  - the right name 6/6;
  - guidance read aloud 0/6.
- **Reply gap is the main voice gap.** Staging p50 with the flags off:
  - v2-flashlite 2.30 s;
  - v2-mai 2.05 s;
  - v2-54mini 2.13 s, with the flags on.

  Speculation and prewarm help only unpaced brains (`decision.2026-10-24.latency-flags-provider-aware`). The ears' first
  partial lags 858 ms median (`measure.2026-10-24.staging-partial-lag`), so barge-in stays 700 ms until it comes from
  audio onset (`decision.2026-10-24.barge-long-ms-stays-700`).
- **Operator, op5** (48 tasks, two runs each on 08b5916):
  - gpt-4.1-mini 41 and 41;
  - gpt-4.1 32 and 33.

  gpt-4.1's drop came from a conduct line (`measure.2026-10-24.operator-ablation-conduct-line`), fixed in 6fd8da5. The
  default is re-chosen by `decision.2026-10-24.operator-default-symmetric-rule` on op6.
- **Analysis, r6** (TEST, 42 calls):
  - mini single on the r5-outcome-first contract 42/42 on both passes;
  - tiered 42/42;
  - objections 52/52.

  The default stays tiered (`decision.2026-10-24.analysis-default-tiered`) until a second round matches.
- **Crisis judge, BLIND 8** (Flash-Lite at the pre-registered 0.9):
  - floor or judge recall 75/100 with FP 9/100;
  - judge alone 73/100 with FP 0/100.

  BLIND 9 (PREREG-9: prompt candidates, chosen on DEV) is running.
- **Product quality gates:**
  - axe WCAG 2.1 AA, 0 violations on 24 screens (`decision.2026-10-24.web-a11y-gate`);
  - fresh-DB suite 586/586 at 3515b53;
  - CI green.
- **Shipped today:**
  - signed recordings and audio erasure;
  - version restore;
  - multilingual agents (a per-part capability matrix);
  - real voice samples on 6 of 7 stack cards;
  - the brief review (a model check after the regex door);
  - the hard guard on every draft write;
  - learning's issue-to-adoption loop.

### Running now (builders are separate sessions on this branch; only the main loop holds keys)
| Lane | Doing |
|---|---|
| voice | provider-aware flags, audio-onset barge-in, brand-name guard, Live spokenText fix, AAC/MP3 sample renditions |
| calls | ship r5-outcome-first as the mini-single contract, with the client rule moved with OUTCOME; then round 7 (integrator) |
| web | buyer walkthrough round 3 (D2C COD/NDR, university admissions) |
| enterprise | SSO, SCIM-lite, audit export |
| safety | crisis and manipulation lint moved into shared/safety; disclosure, crisis and opt-out lexicons for 7 more languages (not native-reviewed) |
| agents | stated language lists re-checked against vendor docs; no-cache and Range for samples |
| memory | transcript and analysis-text retention and erasure |
| learning | the 20-run pool check, then evidence shapes on the outcome-first contract |
| main loop | op6 plus the brief-review blind (Azure); BLIND 9 (VM); then the Flash-Lite brief-review blind; staging re-measure after voice lands |
| campaigns | blocked on the owner's "go" |

## Open threads with the owner

| Thread | Status |
|---|---|
| Judge raise mode | Shadow today. Raise mode with a soft check-in (she pauses and asks how they are) is the owner's call (`open.2026-10-23.judge-raise-soft-checkin`). BLIND 9 will report against the bar of floor-or-judge recall ≥90/100 at benign FP ≤2/100. |
| Campaigns "go" | The campaigns builder waits on the owner typing "go" for the Plivo KYC adapter and the dial path. |
| Trial credit | The amount a new workspace starts with. The blueprint recommends ₹500. It is in config, default 0, because price is deferred (`open.2026-10-22.trial-credit-amount`). |
| Price and billing documents | Price is deferred. Tax invoice, GSTIN and receipts wait on it (`open.2026-10-24.enterprise-billing-documents`). What test spend draws on is open too (`open.2026-10-24.test-spend-vs-empty-wallet`). |
| DND lookup | Contract an NCPR lookup, or rely on carrier scrubbing. Until then every number reads "DND not checked" and promotional calls stay blocked (`open.2026-10-22.dnd-provider`). |
| Round-2 human ratings | Ready. The lab's round-2 stacks run on Vertex from India (`open.2026-10-20.round2-human-ratings`). Stack cards now carry real samples. |
| Language review | The new lexicons and disclosure lines for kn, te, ml, mr, gu, pa and or need a native speaker before production. |
| Sarvam sample | A Sarvam key exists but is unused, because Sarvam may train on call data. Using it for one sample is the owner's call (`open.2026-10-24.sarvam-india-sample`). |
| First deploy | Needs the owner's go (it costs money) and real keys: LLM, TTS/STT for the chosen stacks, telephony (Plivo trial line), VP_SECRET_KEY. |
| Plivo trial | ₹764 credit expires 2026-11-16, with an ₹80 monthly usage cap. Recharge is the owner's decision. |
| Credential hygiene | Rotate the pasted secrets: the Plivo token, the free Gemini keys, the Vertex key pasted in chat, and the mailbox and vendor passwords (`risk.2026-10-20.secrets-pasted`, `risk.2026-10-22.vertex-key-in-chat`). Delete Instinct's draft objects in vendor accounts (`risk.2026-10-21.wt-synthesis-capture-hygiene`). Not confirmed done. |

## Where things live

| What | Where |
|---|---|
| Voice lab | `voicelab/`. README; live at the VM URL in `voicelab/README.md`. |
| Lab research | `research/2026-10-19/voicelab/`, `research/2026-10-20/voicelab/` |
| Competitor teardown | `research/2026-10-20/teardown/`, `research/2026-10-20/account-phase/`, `research/2026-10-21/walkthroughs/`; raw captures in `data/walkthroughs/` (gitignored; originals in the owner's Drive folder "Voice-AI Product Evaluation 2026-10-21") |
| Pricing and stack research | `research/2026-10-18/` (`SYNTHESIS.md`, `model/`) |
| Next.js product (older "Relay" build) | `app/`, `lib/`, `components/`. The owner judged it stale (`directive.2026-10-15.codex-baseline-stale`). |
| Inherited laws from Meera/Maya and Taxila | `docs/harvest/` and the `asset.hp-*` / `repo.*` nodes |
| Branch | `claude/serene-franklin-9w7f1v`. Draft PR https://github.com/raghavsharma2003/sales-enabler/pull/1 |
