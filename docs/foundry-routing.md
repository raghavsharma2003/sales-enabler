# Azure task routing and usage

`runAiTask(user, input)` is the server-side entry point for bounded text jobs. The caller supplies an authenticated `AuthUser`, a stable tenant-local `requestId`, `task`, `system`, and one `input` chunk of at most 12,000 characters. The system text is also capped at 12,000 characters. Optional `maxOutputTokens` can lower the task cap; `responseFormat: 'json_object'` requests Azure JSON mode. Callers must parse and validate generated JSON against their own schema before acting on it.

| Task | Role | Default and maximum output tokens |
| --- | --- | ---: |
| `extraction` | fast | 1,600 |
| `planning` | reasoning | 3,000 |
| `feedback` | fast | 1,600 |
| `evaluation` | evaluation | 1,600 |
| `answer` | fast | 1,600 |

Roles resolve to `AZURE_OPENAI_FAST_DEPLOYMENT`, `AZURE_OPENAI_REASONING_DEPLOYMENT`, and `AZURE_OPENAI_EVALUATION_DEPLOYMENT`. Each missing role falls back to `AZURE_OPENAI_TEXT_DEPLOYMENT`, then the existing `gpt-4.1-mini` name. These are Azure deployment names on the configured `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY`. Routing never selects a paid non-Azure provider. A model name in this table is routing configuration, not proof that a particular deployment exists or is available in the resource.

The router first stores a claim identified by the hash of organization and request ID. A completed repeat with identical input returns the saved, bounded result with `cached: true`; a changed input under the same ID returns 409. Pending or uncertain repeats return 409 and make no provider call. Network failure, malformed provider output, and provider errors mark the claim uncertain. The single Azure attempt is never automatically retried. The response includes `runId`, actual `model`, `usage.inputTokens`, `usage.outputTokens`, `text`, and `cached`. Callers should retain the request ID across client retries. The stored run contains input and request hashes, task, deployment, token counts, and at most one bounded reply; it contains no prompt or key.

Set `AI_DAILY_ORG_TOKEN_BUDGET` to a positive integer to enforce a UTC day token ceiling per organization. Each claim reserves UTF-8 input bytes plus its output cap and a small message allowance in the same transaction as the claim. A completed receipt reconciles this reservation to Azure's token count. Uncertain attempts retain their reservation because the actual charge is unknown. Budget denial occurs before Azure is called. This guard covers text jobs routed through `runAiTask`; legacy direct text calls and realtime voice have separate paths and are not included. The budget is a token limit, not a currency cap.

`GET /api/ai/usage?days=30` requires the existing signed-in session and accepts 1–90 UTC days. It returns organization-scoped completed token totals, pending and uncertain counts, daily aggregates, and estimated USD cost. It never returns prompts, replies, request IDs, or hashes. Cost remains `null` unless the exact deployment has both `inputUsdPerMillion` and `outputUsdPerMillion` rates in `AZURE_OPENAI_DEPLOYMENT_PRICES_JSON`. Rates are operator supplied estimates, not Azure billing evidence. No price is inferred from a model family or Founders Hub credit. Only completed runs with a known rate contribute to a numeric total; any unknown rate makes the aggregate cost `null`.

## Bounded resource check, 22 September 2026

The existing Azure resource's read-only `/openai/v1/models` listing returned HTTP 200 and included `gpt-4.1-nano`, `gpt-5-mini`, and `gpt-4.1-mini`. This is a model catalog, not a list of usable deployment names. One tiny chat-completion call using `gpt-4.1-nano` as the deployment name returned 404; one using `gpt-5-mini` returned 404. No further inference probes or resource changes were made. The safe probe receipts are in `.impeccable/review/azure-role-probe.json`. The existing `gpt-4.1-mini` text path has prior application evidence; it was not reprobed here. The fast, reasoning, and evaluation roles therefore continue to fall back to that configured text deployment until separately verified role deployments are supplied.

[Microsoft's Azure OpenAI pricing page](https://azure.microsoft.com/en-us/pricing/details/azure-openai/) lists GPT-4.1-nano, GPT-4.1-mini, and GPT-5-mini pricing categories, but its public page currently renders the numeric input and output prices as `$-`. The model's presence on that page or in the resource catalog does not establish this resource's deployment availability or exact billed rate. No price rates were configured from this check.
