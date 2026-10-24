# Safety (shared)

The deterministic floor and the model judges that sit behind it. Both the TS door (control plane, practice runs,
previews) and the Python door (`product/voice`) read the same data:

| File | What it holds |
|---|---|
| `rules.json` | Reply-door rules RD1-RD11, caller signals, redaction, compile lints, the shared normalisation, lexicon, spoken amounts. |
| `cases.json` | Every test vector, with its source (authored, blind sets 1-6, the adversarial review, sweeps). Both doors must pass all of them. |
| `judge.json` | The judge contract: prompt, schema, modes, threshold, timeout, events. |
| `index.ts` | `replyDoor`, `callerSignals`, `redact`, `lintAgentConfig` (the floor). |
| `judge.ts` | `judgeCallerCrisis`, `judgeTranscriptCrisis` (the raise-only crisis judge). |

## The judge in one paragraph

One model call reads two labels, crisis and opt_out (judge id `caller_crisis`, kept for the runtime protocol).
A judge can only ADD a signal, never remove one; an opt-out is never raised while a call is in crisis. The floor runs first and its verdict stands. With no model
configured (`VP_LLM_SAFETY_JUDGE_URL/KEY/MODEL`, or `VP_LLM_DEFAULT_*`) the judge is never called and spends nothing.
Modes are `off`, `shadow` (default: asks the model, logs `judge_shadow`, changes nothing) and `raise` (adds the crisis
signal; production only on the owner's go), set by `VP_SAFETY_JUDGE_MODE`. A timeout (1,500 ms), an error or bad
output logs `judge_unavailable` and leaves the floor's verdict. The caller's text is redacted before it leaves and is
passed as quoted data under a fixed instruction prompt. In a call it runs beside the brain and the reply never waits
for it: a verdict in before her first sentence acts on that reply, a later one from her next sentence or turn
(decision.2026-10-23.judge-flashlite-nonblocking). Recommended model: judge.json `model_recommended`.

## Judge eval (run on the lab VM)

`product/scripts/judge-eval.mjs` scores the crisis judge on caller vectors from `cases.json` (choose them with
`--source`, e.g. `heldout-6` for blind set 6). It always asks the model, so the judge's own recall is measured even on
lines the floor already catches. It reports recall and false positives for the floor, the judge and the two combined,
with Wilson 95% intervals per slice (overall, per source set, per language), p50/p95 latency, tokens per turn and cost.

Environment (names only; values come from `/opt/voicelab/.env`, mode 600, never the repo or shell history):

| Name | What |
|---|---|
| `VP_LLM_SAFETY_JUDGE_URL` | Full OpenAI-compatible chat-completions URL (Azure Foundry deployment, Vertex OpenAI-compatible endpoint, OpenRouter). |
| `VP_LLM_SAFETY_JUDGE_KEY` | Key or bearer token (for Vertex, a fresh `gcloud auth print-access-token`; it expires in about an hour). |
| `VP_LLM_SAFETY_JUDGE_KEY_HEADER` | `api-key` for Azure; leave unset for `authorization: Bearer`. |
| `VP_LLM_SAFETY_JUDGE_MODEL` | Model or deployment id (or pass it as the first argument). |

One model per run. `--task` picks the label scored: `crisis` (default), `opt_out` or `both`; each line is judged
once and both labels come from that one call. `--set` takes the measurement files kept out of `cases.json`
(`sets/heldout-7.json` for crisis, `sets/heldout-optout.json` for opt-out; the task follows the file's shape).

```
set -a; . /opt/voicelab/.env; set +a        # then export the four names above for this model
# BLIND: crisis (set 6 + set 7) and opt-out (the opt-out blind set), one call per line
node product/scripts/judge-eval.mjs --task both --source heldout-6 \
  --set product/shared/safety/sets/heldout-7.json,product/shared/safety/sets/heldout-optout.json \
  --rps 1 --concurrency 1 --price-in <INR per 1M input tokens> --price-out <INR per 1M output tokens> \
  --max-cost-inr 80 --max-requests 700 --label <short-label> --out-dir /tmp/judge-eval/<short-label>
# DEV only (for prompt work): the DEV sets in cases.json
node product/scripts/judge-eval.mjs --task both --source dev-7,optout-dev --rps 1 --concurrency 1 \
  --price-in <...> --price-out <...> --max-cost-inr 50 --max-requests 600 --label <short-label>-dev --out-dir /tmp/judge-eval/<short-label>-dev
```

### Check-in and DEV tuning (open.2026-10-23.judge-raise-soft-checkin)

- **The check-in** (judge.json `checkin`, env `VP_SAFETY_JUDGE_CHECKIN=1`, off by default, only in mode `raise`).
  - A crisis raised by the judge alone (the floor did not fire) makes her pause the agenda and check in, in her own
    words, from the shapes in rules.json `checkin`. They are never lines she could recite.
  - The event record is one `safety` RD3 `flagged`, with no hand-off yet.
  - The floor at any time, or a crisis verdict from the judge on the caller's answer, takes the full crisis path:
    14416 and 112, goal suspended, a human offered.
  - A calm answer ends the round, and the agenda may return when they invite it.
- **Tune on DEV only.** One DEV run gives the whole threshold curve. The summary's threshold sweep reads recall and
  FP at 0.3–0.9 from the recorded confidences.
  - `--prompt-file <file>` tries a prompt variant. It refuses any heldout set, so a prompt is never shaped on a
    blind line.
  - Pick the threshold and prompt on `dev-7,optout-dev`.
  - Then score `sets/heldout-8.json` (BLIND 8: written by a separate agent, unread by the builder) once, at the
    threshold in judge.json:

```
node product/scripts/judge-eval.mjs --task crisis --source dev-7 --rps 1 --concurrency 1 --price-in <...> --price-out <...> \
  --max-cost-inr 30 --label flashlite-dev7 --out-dir /tmp/judge-eval/flashlite-dev7            # baseline + sweep
node product/scripts/judge-eval.mjs --task crisis --source dev-7 --prompt-file /tmp/candidate.txt ... --label flashlite-dev7-p2
node product/scripts/judge-eval.mjs --task crisis --set product/shared/safety/sets/heldout-8.json ... --label flashlite-blind8   # ONCE
```

- **Budget.** `--rps` is a hard rate shared by all workers (default 1/s). `--max-requests` (default 2000) and
  `--max-cost-inr` (needs both prices) stop the run; the report says if it stopped early. Lines are interleaved
  crisis / non-crisis so a capped run still covers both sides.
- **Outputs** in `--out-dir`: `report.json` (all slices with k, n, rate, Wilson CI, the threshold sweep and the prompt
  used), `results.json` (one row per line: floor, judge, confidence, kind, opt-out value, latency, failure reason) and `summary.md` (the table). The markdown also prints to
  stdout. No key or URL is ever written.
- **Where.** Run from the India lab VM so latency is what a call sees. Google credentials only from that VM,
  rate-limited (≤ 1 req/s). No paid upgrade without the owner's go.
- **Reading it.** Report a measurement node per model: n, method, date, recall and FP with CIs per slice, p50/p95,
  ₹ per 1,000 turns. The floor is in-sample on the sets it has seen; the judge prompt was not tuned on any set.
  Language tags on sets 1-6 are heuristic; dev-7 and heldout-7 carry the writer's tags.
- **Dry run** without a network: `VP_JUDGE_EVAL_FAKE=<module exporting a fake LLM fn>` with any URL/KEY values.

## Brief review (model check on brief text)

`agents/review.ts`, contract `shared/safety/brief-review.json` (owner go on open.2026-10-24.tl1-model-check).
- **Order.** The regex door (T-L1 here, plus crisis lines and manipulation in `agents/guard.ts`) runs first and is
  never weakened. The model reads a brief the rules let through, field by field, and can only ADD a finding: claiming
  or implying being human, hiding or dodging being an AI, removing crisis lines, or manipulation. Its prompt is shapes,
  not example lines.
- **Publish** (`version.publish`, and `version.candidate`, which can take traffic without a publish) blocks on a
  finding at or above `threshold`, with the rule, the field, the model's reason and the fix.
- **Save** (`agent.create`, `brief.edit`) returns the review as advisory (`review.findings`, each marked "blocked until
  fixed"); a regex hard finding still refuses the save, as before.
- **No model** (`VP_LLM_BRIEF_REVIEW_URL/KEY/MODEL`, falling back to `VP_LLM_DEFAULT_*`): publish goes ahead on the
  rules and the card says "AI-honesty review: rules only (no model configured)". A timeout, error or bad output says
  "rules only (the model review was unavailable: <reason>)". Never silent.
- **Model.** `model_recommended`: GPT-4.1 through the Azure routing (`VP_LLM_BRIEF_REVIEW_KEY_HEADER=api-key`);
  Flash-Lite on Vertex is the alternative.
- **Eval.** `--task brief-review` reads `flag` / `pass` lists (a snippet's lines become several persona notes on a
  template) and reports the regex floor, the model, and the two combined, with the threshold sweep. DEV:
  `sets/dev-brief-review.json` (`--prompt-file` allowed). BLIND: `sets/heldout-brief-review.json`, written by a
  separate agent and unread by the builder; score it once.

```
node product/scripts/judge-eval.mjs --task brief-review --set product/shared/safety/sets/dev-brief-review.json \
  --rps 1 --concurrency 1 --price-in <...> --price-out <...> --label gpt41-review-dev --out-dir /tmp/judge-eval/gpt41-review-dev
node product/scripts/judge-eval.mjs --task brief-review --set product/shared/safety/sets/heldout-brief-review.json ... --label gpt41-review-blind   # ONCE
```
