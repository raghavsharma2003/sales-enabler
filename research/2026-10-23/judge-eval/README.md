# Caller-crisis judge eval on the India VM (2026-10-23)

`product/scripts/judge-eval.mjs` (harness at 786b951, run from the staging copy at 46dbbe7) on `heldout-6` from
`product/shared/safety/cases.json`: 120 caller lines, 30 crisis and 90 non-crisis. One model per run, from the lab VM
`vl-vm-cin` (Central India), `--rps 1 --concurrency 1 --max-cost-inr 50 --max-requests 400`. Prices passed in are the
`product/server/modules/money/prices.ts` list prices × 95. Each folder holds that run's `report.json` and `summary.md`
(no keys, no URLs). Intervals are Wilson 95%.

| Label | Model and route | Judge timeout | Recall (judge) | False positives (judge) | Unavailable | Latency p50 / p95 (answered) | ₹ per 1,000 turns |
|---|---|---|---|---|---|---|---|
| `azure-41mini-in` | GPT-4.1 mini, regional South India Azure deployment | 800 ms (contract) | 29/30, 96.7% (83.3–99.4) | 4/90, 4.4% (1.7–10.9) | 2/120 (1 timeout, 1 error) | 416 / 480 ms | 21.62 |
| `azure-41` | GPT-4.1, Azure global deployment | 800 ms (contract) | 19/30, 63.3% (45.5–78.1) | 0/90, 0.0% (0.0–4.1) | 32/120 timeouts | 673 / 731 ms | 73.33 |
| `vertex-flashlite` | Gemini 3.5 Flash-Lite, Vertex global, OpenAI-compatible endpoint | 800 ms (contract) | 0/30 (0.0–11.4) | 0/90 | **120/120 timeouts** | none answered | 0 metered |
| `vertex-flashlite-t3000` | same | 3,000 ms (VM-only copy) | 30/30, 100% (88.6–100) | 1/90, 1.1% (0.2–6.0) | 1/120 timeout | 990 / 1,601 ms | 17.44 |
| `azure-41-t3000` | GPT-4.1, Azure global | 3,000 ms (VM-only copy) | 29/30, 96.7% (83.3–99.4) | 1/90, 1.1% (0.2–6.0) | 1/120 error | 674 / 1,010 ms | 99.22 |

Read this with care:
- **The 800 ms contract timeout decides the outcome for two of the three models.** Gemini Flash-Lite on Vertex answered
  correctly when given time (3 direct probes with the judge's exact request shape: 952, 979 and 1,636 ms, all HTTP 200
  with valid JSON verdicts), but never inside 800 ms, so at the contract it adds nothing. GPT-4.1 lost 32 of 120 to the
  timeout; on the 88 it answered, it caught every crisis line it saw (19/19). Only GPT-4.1 mini in South India fits
  the 800 ms budget (p95 480 ms).
- The two `-t3000` rows are supplementary: the timeout was raised in a VM-only copy of `judge.json`, not in the repo
  contract. They measure classification quality apart from latency.
- **The floor alone caught 30/30 crisis lines on this set** (in-sample for the floor, as the harness caveat says), so
  floor-or-judge recall is 100% in every run and the judge's added recall on heldout-6 is not measurable here. Its
  cost is the false positives it adds: 4/90 for GPT-4.1 mini, 1/90 for the other two at 3 s (the same line,
  `cs.benign.1905`, in both).
- Cost per 1,000 turns counts tokens on answered requests only; a timed-out request may still be billed by the
  provider, so the 800 ms rows for GPT-4.1 and Flash-Lite understate real cost. n = 120 lines per run; one run each.
