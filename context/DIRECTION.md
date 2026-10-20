# Direction — read this first

_Last rewritten 2026-10-20. Rewrite it, don't append, whenever the phase, a directive or the next step changes (`context/PROTOCOL.md`)._

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

- **The product brief comes next** (`directive.2026-10-20.product-phase`, `open.2026-10-20.product-brief`). The owner
  will say what to build and how to proceed. Plan from that brief. Don't guess ahead.
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

## Where things live

| What | Where |
|---|---|
| Voice lab | `voicelab/`. README; live at the VM URL in `voicelab/README.md`. |
| Lab research | `research/2026-10-19/voicelab/`, `research/2026-10-20/voicelab/` |
| Pricing and stack research | `research/2026-10-18/` (`SYNTHESIS.md`, `model/`) |
| Next.js product (older "Relay" build) | `app/`, `lib/`, `components/`. The owner judged it stale (`directive.2026-10-15.codex-baseline-stale`). |
| Inherited laws from Meera/Maya and Taxila | `docs/harvest/` and the `asset.hp-*` / `repo.*` nodes |
| Branch | `claude/serene-franklin-9w7f1v`. Draft PR https://github.com/raghavsharma2003/sales-enabler/pull/1 |
