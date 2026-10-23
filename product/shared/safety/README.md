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

A judge can only ADD a signal, never remove one. The floor runs first and its verdict stands. With no model
configured (`VP_LLM_SAFETY_JUDGE_URL/KEY/MODEL`, or `VP_LLM_DEFAULT_*`) the judge is never called and spends nothing.
Modes are `off`, `shadow` (default: asks the model, logs `judge_shadow`, changes nothing) and `raise` (adds the crisis
signal; production only on the owner's go), set by `VP_SAFETY_JUDGE_MODE`. A timeout (800 ms), an error or bad
output logs `judge_unavailable` and leaves the floor's verdict. The caller's text is redacted before it leaves and is
passed as quoted data under a fixed instruction prompt.

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

One model per run:

```
set -a; . /opt/voicelab/.env; set +a        # then export the four names above for this model
node product/scripts/judge-eval.mjs --source heldout-6 --rps 1 --concurrency 1 \
  --price-in <INR per 1M input tokens> --price-out <INR per 1M output tokens> \
  --max-cost-inr 50 --max-requests 400 --label <short-label> --out-dir /tmp/judge-eval/<short-label>
```

- **Budget.** `--rps` is a hard rate shared by all workers (default 1/s). `--max-requests` (default 2000) and
  `--max-cost-inr` (needs both prices) stop the run; the report says if it stopped early. Lines are interleaved
  crisis / non-crisis so a capped run still covers both sides.
- **Outputs** in `--out-dir`: `report.json` (all slices with k, n, rate, Wilson CI), `results.json` (one row per line:
  floor, judge, confidence, kind, latency, failure reason) and `summary.md` (the table). The markdown also prints to
  stdout. No key or URL is ever written.
- **Where.** Run from the India lab VM so latency is what a call sees. Google credentials only from that VM,
  rate-limited (≤ 1 req/s). No paid upgrade without the owner's go.
- **Reading it.** Report a measurement node per model: n, method, date, recall and FP with CIs per slice, p50/p95,
  ₹ per 1,000 turns. The floor is in-sample on the sets it has seen; the judge prompt was not tuned on any set.
  Language tags on sets 1-6 are heuristic; dev-7 and heldout-7 carry the writer's tags.
- **Dry run** without a network: `VP_JUDGE_EVAL_FAKE=<module exporting a fake LLM fn>` with any URL/KEY values.
