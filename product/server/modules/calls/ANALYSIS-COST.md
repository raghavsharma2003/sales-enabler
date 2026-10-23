# Post-call analysis: cost model

_Written 2026-10-23. Grades: [M] measured, [C] computed from measured numbers and list prices, [I] inferred or assumed._

## The budget

The pricing line allows about **₹0.06 a minute** for analysis, so about **₹0.17 for a 3-minute call** (from the integrator's
brief, 2026-10-23). The crisis judge (one small request per caller line, off by default) is not in these numbers.

## Prices

List prices at ₹95/$ (`server/modules/money/prices.ts`) [M]:

| Model | Input, ₹ per 1M tokens | Output, ₹ per 1M tokens |
|---|---|---|
| GPT-4.1 mini | 41.8 | 167.2 |
| GPT-4.1 | 190 | 760 |

## What the bench measured

84 synthetic calls, 78 of them reaching the model, run on 2026-10-23 at 1 request a second
(`research/2026-10-23/benches/analysis-*.md`) [M]:

| | GPT-4.1 mini | GPT-4.1 |
|---|---|---|
| Tokens per call (input / output) | 650 / 123 | 650 / 184 |
| Cost per call | ₹0.048 | ₹0.263 |
| Outcome right | 70/84 | 84/84 |

Bench transcripts are short: about 5 lines, or 100 tokens. The prompt is the other 550 input tokens. The contract written
on 2026-10-23 is 2,179 characters, about 545 tokens, so the prompt cost is about the same as before [M].

## A real 3-minute call [I]

The assumptions:
- about 400 words spoken in all;
- about 1.6 tokens per romanised Hinglish word, so about 700 transcript tokens;
- input of about 1,250 tokens (the 545-token prompt plus the transcript);
- output of about 125 tokens for mini and 185 for GPT-4.1, at the bench's ratio.

| Design | Cost per 3-minute call [C] | Against ₹0.17 |
|---|---|---|
| GPT-4.1 mini only | about ₹0.073 | under, by more than half |
| GPT-4.1 only | about ₹0.38 | over, by about 2.2x |
| Tiered: mini first, GPT-4.1 on escalation | ₹0.073 + e × ₹0.38 | under while e < 26% |

Here e is the share of calls escalated. On the bench, mini gave no outcome on 14 of 84 calls (16.7%, with the older prompt)
[M]. At that rate the tiered design costs about **₹0.14 a call**, inside the budget [C]. Low-confidence escalations add to
e, and nothing has measured them yet.

## How it is built (server/modules/calls/analysis.ts)

- `call_analysis_setting` (migration 0604) stores the setting per workspace:
  - `single`: one model, or the deployment default when none is set.
  - `tiered`: `model` reads every call first. `escalate_model` reads it again when the first pass fails, finds no outcome
    on a call where the person spoke, or gives an outcome with confidence below `threshold` (default 0.6).
- **Which pass counts.** The escalated pass counts when it succeeds. If it fails, the first pass stands, and
  `analysis.tier.secondFailed` records the failure.
- **Cost lines.** Every pass that got an answer is a cost line, tagged `tier: first | escalated` with its model.
- **Tools.**
  - `analysis.settings.get` (read).
  - `analysis.model.set` (spend: an owner approves it, because it changes what each call costs).
  - Models come only from the deployment's curated list, `VP_ANALYSIS_MODELS`. The default is one pass on `gpt-4.1-mini` when the list has it
    (decision.2026-10-23.analysis-default-mini-single); tiered is opt-in per workspace and never escalates a call whose reason the engine decided.

## What decides the default

The bench's TEST split (`--split test`) on mini alone, GPT-4.1 alone, and tiered (`--model … --escalate-model …`) gives
three numbers each:
- outcome accuracy, with its interval;
- the escalation rate e;
- the measured cost per call.

Choose the cheapest design whose outcome accuracy is not significantly below GPT-4.1's. Then re-check e on real calls,
because the bench's e is not real traffic's e.
