# Direction — read this first

_Last rewritten 2026-10-21. Rewrite it, don't append, whenever the phase, a directive or the next step changes (`context/PROTOCOL.md`)._

## What we are building

Working name: **Vyakti Platform (VP)** (`directive.2026-10-17.vp-venture`).

**What it is**
- A **self-serve voice-agent platform, Vapi-like**, for Indian businesses (`directive.2026-10-18.self-serve`).
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
  - stack choice offers the finalised stacks with **no default yet**;
  - price is deferred and shows as "not set";
  - the product is **horizontal**, for every kind of enterprise, not just insurance;
  - self-learning is harness2-style.

  The code is in `product/`; read `product/ARCHITECTURE.md` first. What is in it:
  - a TS control plane: kernel plus 10 modules, about 165 tools, the approval classes A1/A2/A3;
  - the Python voice runtime `product/voice`;
  - the React web app `product/web`;
  - the e2e acceptance test `product/tests/e2e.test.ts`.

  State on 2026-10-21 at 3059bde: tsc clean, 274/275 pass, 0 fail, 1 todo on a fresh Postgres 16. The voice runtime
  passes 91/91 with rules parity against `shared/safety`.

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
- **The voice stack is a user choice** in the product, with curated defaults (`decision.2026-10-20.product-stack-selectable`).
  The default is picked after Vertex returns and round-2 ratings are in. The owner leans towards **Gemini TTS**.
- **The voice lab is paused** (`decision.2026-10-20.pause-lab`):
  - no more re-routing or fixes;
  - resume only when the paid Vertex key arrives (runbook: `research/2026-10-20/voicelab/google-access.md`).
- **Port the lab's pieces into the product.** Don't run two voice stacks. Ported:
  - adapters, combination identity, brief v2 + agenda ledger;
  - hang-up guard, turn-taking, Plivo line, cost meter.
  The `asset.voicelab.*` nodes list them.

## Owner directives in force

| id | in one line |
|---|---|
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

## Open threads with the owner

| Thread | Status |
|---|---|
| Paid Vertex project `voicelab-india` on compliance@carbonsettle.com, via Instinct | Pending. The owner sends the SA JSON. |
| vp-voice appeal | Submission not confirmed. The pasted SA key must be deleted first. |
| Credential hygiene | Rotate the pasted secrets: Plivo token, the free keys, mailbox passwords (`risk.2026-10-20.secrets-pasted`). Not confirmed done. |
| Plivo trial | ₹764 credit expires 2026-11-16, with an ₹80 monthly usage cap. Recharge is the owner's decision. |
| Round-2 human ratings | After Vertex returns (`open.2026-10-20.round2-human-ratings`). |
| Safety second layer | Waiting on the owner (`decision.2026-10-21.safety-second-layer-proposal`). Blind set 6 (n=330, scored once after the review fixes, `measure.2026-10-21.safety-door-blind-set6`):<br>• benign false positives 0/170;<br>• harmful caught 106/160;<br>• indirect crisis talk 4/30 (Tamil-English 0/7, Bengali-English 0/7);<br>• paraphrased AI denials 14/25.<br>Recommendation: start with a raise-only caller-crisis judge. It runs in parallel with the brain, adds no playback delay, and can only add the crisis line. It is being built now in shadow mode; production 'raise' waits for the owner's go. The agent-side judge comes after it. |
| First deploy | Needs the owner's go (it costs money) and real keys: LLM, TTS/STT for the chosen stacks, telephony (Plivo trial line), VP_SECRET_KEY. |
| Teardown account hygiene | Rotate the pasted vendor passwords and keys. Delete the draft objects Instinct left in the vendor accounts (side-effects ledger in Drive `00-FINAL-REPORT.md`). Instinct's Drive captures hold the owner's phone (Exotel 11, 12) and a +1 number (Retell 08); the local copies are gitignored (`risk.2026-10-21.wt-synthesis-capture-hygiene`). |

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
