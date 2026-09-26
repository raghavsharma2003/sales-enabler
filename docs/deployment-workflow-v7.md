# Deployment workspace v7

The Deployments workspace packages one exact active agent release for one public channel. It keeps four states separate:

1. A **draft** is an immutable registry snapshot. It cannot serve public sessions.
2. **Published** means the registry authority passed its current server checks. For Telegram and WhatsApp, this does not mean the provider webhook is installed.
3. **Paused** blocks new sessions while retaining the snapshot and public ID. Republishing requires the source acknowledgement and repeats the authority checks.
4. **Stopped** is permanent. The owner must create a replacement draft.

Only the workspace owner can create, publish, pause, stop, or activate a channel. Operators and viewers receive the same readable registry and public-boundary review without mutation controls. This deliberately does not assume that operators may pause deployments.

## Prerequisites and snapshot

A deployable release must be active, point to an immutable agent version, and carry a passing exact-version configuration check. Public deployment accepts only the Azure `provider-default` voice profile. The private Maya original / Gemini Despina profile remains available in internal testing but is blocked by the registry for public use. This restriction is a routing and authority decision; it is not an acoustic-quality claim.

The owner selects at most 20 approved Company Brain sources from the tested version. The public runtime receives only that subset. It also forces `memoryScope: none`, disables agent tools, and excludes customer records, private memories, GroupAI context, nonselected knowledge, connector credentials, and authorization versions. The owner can inspect the exact tested prompt before publishing, but the public page does not render the raw prompt.

Draft creation uses three compact steps: **Agent & channel**, **Knowledge & behavior**, then **Brand & usage**. Back and Continue preserve the in-memory draft. Each Continue validates the current step and moves keyboard focus to the next step heading. Messaging identity and unknown-sender policy remain visible where the channel is chosen; public-source selection and metered reviewed learning remain visible together; brand, exact origins and required limits remain visible before saving. Save still creates an immutable draft for the unchanged owner publication review.

Public brand name and welcome text are authored explicitly, initially copied from the current workspace name. The optional **Copy company brand** action reads only the safe `publicBrand` export from `/api/company`: public name, six-digit accent, derived readable foreground, and a validated bounded logo data URI. It never copies the company description, website, operating preferences, raw profile, or private workspace fields.

After copying, the owner may edit the deployment name and welcome, choose or clear the optional accent, and choose, replace, or remove the optional logo. Logos are limited to validated PNG, JPEG, or WebP content up to 256 KB and 16–2,048 pixels. Clearing the accent restores the Relay indigo fallback and monogram behavior. Saving the draft freezes these public-brand values inside the immutable deployment snapshot; later Company profile edits do not mutate a draft or published deployment. The server derives `onAccent` from the submitted accent instead of trusting browser-supplied contrast metadata.

## Reviewed learning opt-in

Each immutable deployment snapshot has an `autoLearning` boolean. It defaults to `false` and appears as a separate owner choice while the draft is configured. Changing the setting requires a replacement draft; publishing, pausing, and stopping preserve the saved value.

When opted in and `LEARNING_WORKER_ENABLED=1`, an eligible completed server-captured public conversation can enqueue bounded metered Azure analysis. The result is a proposal pending operator review through the existing conversation-learning flow. It never promotes a memory, edits a prompt, or creates a new agent version automatically. Human-authored channel replies are excluded. Per-deployment and workspace daily job budgets, immutable conversation receipts, deployment revision, current owner authority, current source/release authority, and source digests are rechecked by the worker.

The selected deployment reads `GET /api/learning-jobs?deploymentId={id}` and shows the worker switch plus the latest durable jobs. `ready` means a saved proposal awaits review. `uncertain` may have incurred provider usage and is retained without automatic retry. The UI refreshes the read-only status periodically while the opted-in worker is enabled; reads never trigger inference. Operators and viewers may inspect organization-scoped receipts without gaining publication or promotion authority.

## Web channels

`web_voice` provides browser microphone voice and a separate Listen & type mode. `web_chat` is text-only. Both use `/talk/{publicId}` and issue short-lived server sessions without putting a credential in the URL.

Web drafts require one to ten exact origins. Hosted origins must use HTTPS. Plain HTTP is accepted only for `localhost`, `127.0.0.1`, or `[::1]`. The application origin must be included for the standalone `/talk/{publicId}` page; embedding parents must also be included. Origins do not contain paths or trailing slashes.

The share panel emits a URL and an iframe snippet. A published web deployment also provides a prominent **Open assistant** action beside Copy URL; paused deployments retain the URL for review without presenting it as available. Voice iframes include `allow="microphone"`; the browser still asks the visitor for microphone consent. Hosting must remove a global frame denial only for the public talk route and apply a deployment-scoped CSP `frame-ancestors` allowlist. The UI describes this requirement but does not claim the CSP is active until the host implements it.

A link under `http://localhost` is functional only on the local computer. The workspace explicitly says it is not internet-accessible until the app is hosted at a final HTTPS origin. Public voice also needs the reviewed WSS gateway host described in `docs/deployment-v7.md`.

## Telegram and WhatsApp

Messaging drafts are created only after the server vault reports a checked connection and a provider identity. The API derives and saves the connection binding; the browser never sends a connection ID, authorization version, or credential.

Publishing the registry and installing a provider webhook are separate actions:

- Telegram exposes an owner-only **Check and activate Telegram** action after registry publication. The server checks the current bot identity and provider webhook, refuses to replace a different webhook unless the owner explicitly acknowledges replacement, installs the reviewed webhook, and stores a local activation receipt. `installed` means Telegram confirmed the installation at the displayed time. External changes after that time are not continuously monitored.
- WhatsApp points the owner to Integrations for the generated HTTPS webhook and Meta registration. The deployment workspace does not show a green activation state because it has no provider registration receipt there.

The channel conversation panel reads real inbound thread and dispatch records from `/api/channels`. Its handoff control pauses or enables AI for the next inbound message. Provider account metadata remains labelled as an unverified human identity.

## Usage boundaries

The creation API defaults `limits.enabled` to false. The UI requires the owner to explicitly enable usage before it saves a publishable draft, then exposes the bounded server fields under one progressive Usage boundaries disclosure:

| Limit | Default | Maximum |
|---|---:|---:|
| Public sessions per day | 25 | 500 |
| Turns per conversation | 12 | 40 |
| Concurrent sessions | 3 | 10 |
| Session seconds | 300 | 600 |
| Sessions per IP per hour | 3 | 10 |

These are enforcement settings, not capacity or throughput claims. IP hashing requires a privately configured `PUBLIC_SESSION_HASH_SECRET`. Publishing rechecks the active release, passing test, knowledge digests, approved source revisions, provider profile, channel binding, and owner authorization.

## UI integration

`components/platform/deployments-view.tsx` exports `DeploymentsView(props: PlatformViewProps)`. It self-loads `/api/deployments`, safe connection views from `/api/integrations`, and channel activation receipts from `/api/channels`. After a registry mutation it calls `act('workspace.refresh')` so the shared platform record set stays current.

The root workspace must:

- mount `DeploymentsView` in the Build navigation;
- import `app/deployments.css` and `app/channel-agents.css`;
- keep the standard `PlatformViewProps` contract unchanged;
- configure scoped response headers for `/talk/{publicId}` so the runtime iframe behavior matches the per-deployment origin authority;
- keep `/talk/{publicId}` available for both web voice and web chat deployments.

The deployment screen never displays connector credentials, sealed values, authorization versions, internal connection IDs, or provider tokens. It shows only the safe checked identity, check time, local activation receipt, public ID, public URL, selected source titles, tested instructions, brand text, allowed origins, and usage limits needed for review.
