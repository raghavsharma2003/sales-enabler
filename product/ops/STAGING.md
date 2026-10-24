# Private staging on the India lab VM

What the control plane (`product/server`, `server/main.ts`) and the voice runtime (`product/voice`) need to run a private
staging there, so a person can open the product, build an agent and hear it with **Call me in the browser**.

**Names only.** Values live in the VM's env files (mode 600) and never in this repo, a commit, a log or a chat.

## Shape

```
browser ──https──▶ reverse proxy (TLS, one hostname) ──▶ control plane   127.0.0.1:8080   (/, /v1/..., /hooks/runtime)
        └─wss────▶                 /rt/  (strip /rt) ──▶ voice runtime   127.0.0.1:8090   (/v1/calls, /v1/media/...)
control plane ──signed HTTP──▶ voice runtime (VP_RUNTIME_URL)
voice runtime ──signed event batches──▶ control plane /hooks/runtime (VP_CONTROL_URL)
```

The runtime's paths (`/v1/calls`, `/v1/health`, `/v1/media/...`) overlap the control plane's `/v1/...`. Give the runtime
its own path prefix on the proxy, or its own hostname.

**HTTPS is required.** Browsers allow the microphone only on a secure page, and a secure page may open only `wss://`
sockets. So the runtime's public URL must be https, behind the same proxy.

## Voice runtime (`product/voice`)

The runtime is one process, `python -m vpvoice`. With several cores, run `python -m vpvoice.launch` instead (see
`product/voice/README.md`, "Admission and processes"). Python 3.12, `pip install -r product/voice/requirements.txt`.

**Signing and URLs**

| Name | What |
|---|---|
| `VP_RUNTIME_SECRET` | The same value as the control plane's (at least 32 characters) |
| `VP_CONTROL_URL` | Where events go: the control plane's base URL as the runtime reaches it (e.g. its loopback address) |
| `VP_PUBLIC_URL` | The runtime's public https base, as the browser reaches it (with the `/rt` prefix if one is used). Join URLs are built from it |
| `PORT`, `VP_BIND` | Listen port and address (bind to loopback behind the proxy) |
| `VP_REGION` | `centralindia`: required for any Google part (Vertex is called only from India) |

**Providers** (only those the chosen stacks need)

| Name | What |
|---|---|
| `VERTEX_SA_FILE`, `VERTEX_PROJECT`, `VERTEX_LOCATION`, `VERTEX_LIVE_LOCATION` | Gemini on Vertex: the brains, the voices and the speech-to-speech engine. Live defaults to `us-central1` |
| `LAB_SPEECH_KEY`, `LAB_SPEECH_REGION` | Azure Speech: the ears of every curated stack, and the Azure voices |
| `LAB_AI_ENDPOINT`, `LAB_AI_KEY` | Azure AI Foundry brains (GPT-5.4 mini, GPT-4.1, gpt-oss and others) |
| `VP_AI_ENDPOINT`, `VP_AI_KEY` | The second Foundry account (for example Kimi K2.6) |
| `OPENROUTER_API_KEY` | Brains on neither Vertex nor Foundry (GPT-6 tiers) |
| `SARVAM_API_KEY` | The Sarvam stack |
| `VP_LLM_SAFETY_JUDGE_*` | The caller-crisis judge, optional (`VP_SAFETY_JUDGE_MODE` stays `shadow` without the owner's go) |

**Capacity**

| Name | What |
|---|---|
| `VP_MAX_CALLS_PER_PROCESS` | Admission cap per process, default 20 |
| `VP_RETRY_AFTER_S` | The retry-after the runtime returns when it is full |

**Recording**

| Name | What |
|---|---|
| `VP_RECORDINGS_DIR` | Optional. Where recordings are written. Unset means no recordings. Served only at `GET /v1/recordings/{callId}` with a link the control plane signs (10 minutes, one workspace, Range for seeking); never listed |

`GET /v1/health` shows, part by part, what this runtime can run and why not. Check it before the first call.

## Control plane (`product/server`)

Run `node product/web/build.mjs` once. Then `node --import tsx product/server/main.ts`. Database migrations:
`node product/scripts/migrate.mjs`. Run them with the same `VP_SECRET_KEY` as the server. Migration 0109 seals existing
intake webhook secrets with it, and without the key it stops and changes nothing.

**Core**

| Name | What |
|---|---|
| `DATABASE_URL` | Postgres 16 |
| `PG_POOL_MAX` | Pool size, optional |
| `PORT` | Listen port |
| `NODE_ENV` | `production` |
| `VP_SECRET_KEY` | Seals API keys and integrations (32 bytes, hex) |
| `VP_RUNTIME_URL` | The voice runtime's base as the control plane reaches it (loopback) |
| `VP_RUNTIME_PUBLIC_URL` | The voice runtime's base as a browser reaches it, the same address as the runtime's `VP_PUBLIC_URL` (on staging, the Caddy address on :8443, never 127.0.0.1). The call page plays recordings from signed links on this base. Unset: `VP_RUNTIME_URL` is used, which a browser can reach only in development |
| `VP_RUNTIME_SECRET` | The same value as the runtime's |
| `VP_TRUSTED_PROXIES` | Leave unset behind a local proxy (private addresses are trusted), or `none` |

**Models** (each purpose falls back to `VP_LLM_DEFAULT_*`)

| Name | What |
|---|---|
| `VP_LLM_<PURPOSE>_URL`, `_KEY`, `_MODEL`, `_KEY_HEADER` | Purposes: `OPERATOR`, `COMPILE`, `SIMULATE`, `ANALYSIS`, `INSIGHT`, `LEARNING`, `MEMORY`, `SAFETY_JUDGE` |
| `VP_OPERATOR_BRAINS` | The assistant's model choices |
| `VP_ANALYSIS_MODELS`, `VP_ANALYSIS_DEFAULT_MODEL` | Curated call-analysis models. The default is one pass on `gpt-4.1-mini` when it is in the list (`VP_ANALYSIS_DEFAULT_MODEL` names it if the deployment id differs); otherwise `VP_LLM_ANALYSIS_MODEL` |
| `VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_IN`, `_OUT` | The assistant's model prices |

**Phone calls: the allowlist** (`server/modules/campaigns/allowlist.ts`)

| Name | What |
|---|---|
| `VP_TELEPHONY_ALLOWED_TO` | **Required before any phone call.** Comma-separated phones (E.164 or any Indian shape) that this server may send to the carrier: the person dialled on every attempt kind (campaign, API, single, test, retry, callback), a verification call's target, and an agent's hand-off number. Set it on the control plane **and** the runtime. On staging: the owner's verified phone only |
| `VP_TELEPHONY_ALLOWLIST` | `off` is the only switch that lets a server reach every number. **Never set on staging.** |

Without `VP_TELEPHONY_ALLOWED_TO`, a control plane that can reach a carrier (`VP_TELEPHONY_LIVE=1`, or a real runtime at
`VP_RUNTIME_URL`) refuses every phone attempt at the dial gate (`destination_blocked`, "This server only calls the phones
on its test list") and the Plivo adapter refuses every request: live telephony cannot start without the list.

**Test calls and money on a staging account**

| Name | What |
|---|---|
| `VP_TEST_BUDGET_DEFAULT_INR` | The daily test-call budget, in whole rupees, for workspaces on this deployment that do not have one yet (it is set on a workspace's first test call or Billing visit, then kept). Unset in production: the code default of ₹200 a day holds. Staging sets it so long real test calls fit, e.g. `5000`. The per-call hold stays ₹50 unless an owner changes it |

An owner raises or lowers their own test budget and per-call hold from the assistant or the API (`cap.raise` / `cap.lower` with `scope: 'test'`); a raise is an approval card naming both amounts, as for any buyer. Billing shows it beside the other caps with today's use and each test call's cost. To give the owner's staging account money to spend, credit it as Vyakti staff with `wallet.credit` (a reason and a ticket key); the trial credit (`money_config.trial_credit_inr_milli`) stays 0 until the owner sets a price.

**Keep off on a private staging**

| Name | What |
|---|---|
| `VP_TELEPHONY_LIVE` (with `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `VP_TELEPHONY_WEBHOOK_SECRET`) | Leave off: browser calls need no phone line |
| `VP_PAYMENTS` | Unset (no gateway on staging); never `fake` outside development |
| `VP_JOBS` | `0` only on an extra API-only replica |
| `VP_DEV_AUTH`, `VP_LLM_FAKE`, `VP_WEBHOOK_ALLOW_HTTP`, `VP_WEBHOOK_ALLOW_PRIVATE`, `VP_DEVSIM*` | Development only: never on staging |

## Checks after starting

1. The runtime's `/v1/health` lists the curated stacks as available. Any stack that isn't shows its plain reason.
2. In the product, open an agent, then **Test her**, then **Call me in the browser**:
   - the page asks for the microphone;
   - captions appear from both sides;
   - **Hang up** ends the call.
   The call then shows in Calls as a test call, filed under the stack that ran.
3. The reply gap is in the call's turns (`latencyMs`). That is the number to measure on staging.
