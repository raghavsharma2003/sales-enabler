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

`product/scripts/judge-eval.mjs` scores the crisis judge on every crisis line in `cases.json` (Hinglish, Hindi,
Tamil-English, Bengali-English, including blind set 6's indirect lines) against every non-crisis caller line. It
reports recall and false positives for the floor, the judge and the two combined, p50/p95 latency, tokens per turn
and cost per 1,000 turns.

What it needs:

1. Node 22 and the repo with `npm ci` at the root (it uses `tsx`).
2. An OpenAI-compatible chat-completions endpoint and key for the model under test, in the environment only (for
   example from `/opt/voicelab/.env`, mode 600; never in the repo or the shell history):
   - `VP_LLM_SAFETY_JUDGE_URL`: the full chat-completions URL (Azure OpenAI / Foundry, OpenRouter, Gemini's
     OpenAI-compatible endpoint);
   - `VP_LLM_SAFETY_JUDGE_KEY`;
   - `VP_LLM_SAFETY_JUDGE_KEY_HEADER=api-key` for Azure (default is `authorization: Bearer`).
3. Prices, if you want the cost line: INR per 1M input and output tokens for that model, from the provider's price
   page on the day you run it.

```
set -a; . /opt/voicelab/.env; set +a
node product/scripts/judge-eval.mjs <model-id> --price-in <INR/1M in> --price-out <INR/1M out> \
  --concurrency 2 --out /tmp/judge-<model-id>.json
```

- Run it from the India lab VM so latency is what a call sees. Google credentials are used only from that VM and
  rate-limited (keep `--concurrency` at 2 or lower for Google endpoints). No paid upgrade without the owner's go.
- `--limit N` takes the first N crisis and N non-crisis lines, for a quick smoke run.
- Report the result as a measurement node (model, n, method, date, recall, FP, p50/p95, cost per 1k turns). The floor
  is in-sample on these vectors; the judge was not tuned on them. A fresh blind set is still the honest test.
- Dry run without a network: `VP_JUDGE_EVAL_FAKE=<module exporting a fake LLM fn>` with any URL/KEY values.
