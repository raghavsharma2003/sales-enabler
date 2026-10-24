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

**Carrier callbacks: what must bypass Caddy's basic auth**

Plivo cannot send basic-auth credentials. These paths carry their own proof and must be exempt from basic auth (and
only these). Everything else stays behind it.

| Service | Path (as Plivo reaches it) | Its own proof |
|---|---|---|
| control plane | `POST /hooks/telephony/plivo/speak/*` (and `GET`) | X-Plivo-Signature-V3 + one-time nonce, checked on the public URL (`VP_PUBLIC_URL` + path) |
| runtime | `POST /rt/v1/media/sip/answer/*`, `/hangup/*`, `/transfer/*`, `/machine/*`, `/whisper/*` | the per-call HMAC path segment; X-Plivo-Signature-V3 is asked of the runtime (open item) |
| runtime | `POST /rt/v1/media/sip/inbound/*` | the HMAC path segment; V3 asked of the runtime |
| runtime | `GET /rt/v1/media/sip/stream/*` (WebSocket upgrade) | the single-use token in the URL the answer XML handed Plivo |

`/hooks/runtime` and `/hooks/telephony/inbound` are runtime-to-control-plane (signed `x-vp-signature`); they need no
bypass when the runtime reaches the control plane on loopback (`VP_CONTROL_URL`), which is the staging shape.

For the control plane to check Plivo's signature it needs `VP_PUBLIC_URL` (its public https base, exactly as given to
Plivo) and `PLIVO_AUTH_TOKEN` (the token of the account or sub-account that owns the number; `PLIVO_MAIN_AUTH_TOKEN`
optionally, for Plivo's `X-Plivo-Signature-Ma-V3`). Without them the carrier routes answer 503 and play nothing.

**Keep off on a private staging**

| Name | What |
|---|---|
| `VP_TELEPHONY_LIVE` (with `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `VP_TELEPHONY_WEBHOOK_SECRET`) | Leave off: browser calls need no phone line |
| `VP_PAYMENTS` | Unset (no gateway on staging); never `fake` outside development |
| `VP_WHATSAPP_LIVE` | Leave unset until the owner's WhatsApp Business account exists and the steps below are done. Unset, nothing is sent to Meta: a send is stored as failed with "WhatsApp sending is not switched on" |
| `VP_JOBS` | `0` only on an extra API-only replica |
| `VP_DEV_AUTH`, `VP_LLM_FAKE`, `VP_WEBHOOK_ALLOW_HTTP`, `VP_WEBHOOK_ALLOW_PRIVATE`, `VP_DEVSIM*` | Development only: never on staging |

## WhatsApp (owner blocker: no WhatsApp Business account yet)

Everything in the channels module is tested against a fake Graph API; nothing has ever been sent to Meta. Before the
first real message, the owner (or someone with the owner's Meta Business login) does these, in order:

1. **Meta Business account.** Create or pick the business in Meta Business Suite and complete **business verification**
   (legal name, address, a document). Display names and higher sending limits need it.
2. **WhatsApp Business Account (WABA) and a number.** In the Meta developer dashboard, create an app of type
   *Business*, add the **WhatsApp** product, and add a phone number that is **not** registered on the WhatsApp or
   WhatsApp Business app (a fresh number, or one migrated off the app). Verify it by SMS or voice. Note the
   **Phone number ID** and the **WhatsApp Business Account ID** shown under *API Setup*.
3. **Display name.** Submit the display name (the brand) for review; messages show it once approved.
4. **A permanent token.** In Business Settings, create a **System user** (Admin), assign it the app and the WABA with
   full control, and generate a token with `whatsapp_business_messaging` and `whatsapp_business_management`. The
   temporary 24-hour token from *API Setup* is for a first look only.
5. **App secret.** App settings > Basic > *App secret*. It signs every webhook delivery (X-Hub-Signature-256); the
   control plane refuses unsigned or wrongly signed deliveries.
6. **Payment method.** Add one on the WABA (WhatsApp Manager > Payment settings). Utility templates are about INR 0.115
   and marketing about INR 0.8631 per delivered message in India (rate card effective 2026-10-01); free-form replies
   inside the 24-hour window are free. The meter records each delivered message as a `message` cost line.
7. **In Vyakti.** Integrations > WhatsApp Cloud API: paste the token and the app secret (they go to the encrypted
   vault, never into an approval or a log), and the Phone number ID, WABA ID and display number. Then Settings >
   Channels > *Connect*: an owner approves, and the page shows the **webhook address** and a **verify token** once.
8. **Webhook.** In the app's WhatsApp > Configuration: callback URL `https://<staging host>/hooks/channels/whatsapp/<id>`
   (the address shown), verify token as shown, then subscribe the fields `messages` and
   `message_template_status_update`. Meta calls the GET handshake at once; the page shows the number as connected.
9. **Templates.** Submit utility templates from Settings > Channels > Templates; Meta reviews them (minutes to 24
   hours). Marketing templates are refused for anyone without their own marketing opt-in.
10. **Switch on.** Set `VP_WHATSAPP_LIVE=1` on the control plane and restart. First send: to the owner's own test number
    only, after it has opted in (the owner's number stays out of commits and logs).

Names only, as everywhere in this file: the token and the app secret never go into the repo, a commit, a log or a chat.

## Checks after starting

1. The runtime's `/v1/health` lists the curated stacks as available. Any stack that isn't shows its plain reason.
2. In the product, open an agent, then **Test her**, then **Call me in the browser**:
   - the page asks for the microphone;
   - captions appear from both sides;
   - **Hang up** ends the call.
   The call then shows in Calls as a test call, filed under the stack that ran.
3. The reply gap is in the call's turns (`latencyMs`). That is the number to measure on staging.
