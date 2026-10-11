# Native Azure App Service hosting alternative — 10 October 2026

## Decision

Native Linux App Service is a viable private-beta alternative to the quota-blocked Container Apps environment, subject to a hosted packaging/soak gate. It uses no Dockerfile, local container engine, WSL, reused app workload, or employer tenant. It retains private PostgreSQL networking, Node 24, HTTPS/WSS, the durable supervisor, email verification, finite inference admission, and the existing application-owned authentication/tenant boundaries.

The current source head is `8e408fa`, following a 1,134-test full pass and eight focused engine-ping guard checks. Hosted runtime/browser evidence remains a separate gate.

The viable shape is one new dedicated Linux App Service plan with one instance and three code apps:

1. Next standalone web application.
2. Existing public voice + private continuous-speech WSS gateway (`/voice`, `/private-speech`).
3. Existing private Voice Live WSS gateway (`/private-voice-live`).

The private-call supervisor runs as a continuous Linux WebJob attached only to the web app. A single combined gateway app is not currently truthful: the repository has two independent HTTP/WebSocket listeners and App Service exposes one listener per web app. Combining them requires an application-owned dispatcher/reverse proxy and new authority/lifecycle tests. Three apps in one plan add no second plan charge and preserve the existing server contracts.

## Current Azure evidence

One explicitly authorized, nonbillable management mutation registered Microsoft.Web after guards confirmed `NotRegistered` plus `Microsoft.Web/register/action`. One POST returned `Registering`; bounded readback later returned `Registered`. No role, resource, key, email or inference operation accompanied it. The management identity has plan, site, site-config, VNet-integration, ZIP-publish, network, PostgreSQL, diagnostics and budget writes in the approved scope. It still lacks role-assignment authority, but this design does not need a runtime identity or Key Vault role: App Service app settings are encrypted at rest and injected as environment variables. Contributors with app configuration access can read those values, so this is a bounded beta tradeoff rather than equivalent Key Vault rotation/audit.

No App Service plan or web app exists in the target group. After registration, the correct 2025-05-01 regional usage endpoint returned 200 with generic East US 2 usage of 0 against a 30-instance limit; the subscription SKU endpoint returned 200 with an empty SKU collection. Synthetic-secret ARM validation accepted both B2 and B3. A B2 ARM what-if completed `Succeeded`, proposing 24 creates and 36 ignores with no deletes/modifies; raw IDs and names were discarded. Deployment-time capacity can still fail, but no B2/B3 SKU/quota rejection remains in current control-plane validation.

## Runtime contracts

Microsoft currently documents `NODE|24-lts` and `WEBSITE_NODE_DEFAULT_VERSION=~24` for Linux App Service. Microsoft patches the major runtime and does not guarantee an exact Node 24 minor/patch, so the hosted build and runtime suites must be rerun after provisioning.

Linux non-Free App Service documents roughly 50,000 concurrent WebSockets per instance; the application caps are vastly lower. Linux has WebSockets enabled, while the template also declares it explicitly. Always On is enabled for every app. It is mandatory for the continuous WebJob and avoids the normal 20-minute unload.

The supervisor WebJob uses the documented `app_data/jobs/continuous` layout, Kudu agent, singleton setting and 30-second stop allowance. Its wrapper watches `WEBJOBS_SHUTDOWN_FILE`, sends SIGTERM to the existing supervisor process, and preserves the durable heartbeat/uncertain-stop semantics. Both gateway apps set `WEBJOBS_STOPPED=1`, preventing duplicate supervisors. Supervisor readiness remains the database heartbeat already required by call admission; an unrelated HTTP health response must not stand in for it.

App Service Easy Auth stays disabled. The product already owns password/session/email-verification flows, anonymous public-agent capabilities, role checks and tenant-scoped data access. Enabling platform auth would obstruct signup, account links and public talk routes without replacing those authorization contracts.

## Network and data

The new VNet contains a `/26` subnet delegated to `Microsoft.Web/serverFarms` and a separate `/28` subnet delegated to PostgreSQL Flexible Server. All three apps use same-region regional VNet integration and route application traffic through it. PostgreSQL remains B1ms, 32 GiB, PostgreSQL 16, no HA, seven-day backup, private DNS, and `publicNetworkAccess=Disabled`. `DATABASE_URL` must keep `sslmode=verify-full` or `verify-ca`.

Current Microsoft documentation supports regional VNet integration on Basic and higher tiers with no separate integration charge. This path avoids the Container Apps custom-VNet load balancer/public-IP charges. It does not weaken the database boundary or use the broad “allow Azure services” firewall rule.

## Capacity and cost

The 10 October Azure Retail Prices API reports East US 2 Linux Basic rates:

| Plan | vCPU / RAM | Retail hourly | 730-hour month | Disposition |
|---|---:|---:|---:|---|
| B1 | 1 / 1.75 GiB | USD 0.017 | USD 12.41 | Reject: below the reviewed multi-process memory envelope. |
| B2 | 2 / 3.5 GiB | USD 0.034 | USD 24.82 | Smallest evaluation tier; one instance only. |
| B3 | 4 / 7 GiB | USD 0.067 | USD 48.91 | Measured fallback for memory/CPU pressure. |

PostgreSQL B1ms plus 32 GiB remains about USD 16.09/month. The fixed base is therefore approximately USD 40.91/month on B2 or USD 65.00/month on B3, before DNS queries, logs, email, bandwidth, inference, remote builds and restore overlap. App Service plans bill while allocated even when traffic is zero. A USD 150 resource-group budget and the application's existing organization/session/token limits remain mandatory.

All apps and WebJobs share the plan VM. B2 is not a capacity claim: stop or move to B3 on OOM/restarts, sustained high memory/CPU, gateway instability, build/runtime contention, or PostgreSQL connection pressure. `DATABASE_POOL_MAX=4` bounds web, both gateway apps and supervisor to 16 potential application connections, plus separate one-connection probes.

## Native remote build and deployment

`infrastructure/azure/appservice/main.bicep` provisions the plan, three apps, VNet/private PostgreSQL, encrypted app settings, diagnostics and budget. It defaults to B2 and allows only B2/B3. `build.sh` is the App Service/Oryx `RUN_BUILD_COMMAND`: it runs the repository production build/package check, bundles database/readiness/gateway/supervisor entries, completes the Next standalone layout, and installs the continuous WebJob. `Deploy-SourceZip.ps1` accepts only an exact reviewed 40-character Git commit and uploads the same source ZIP to the three roles from Azure Cloud Shell. Each App Service role performs its own Linux Node 24 Oryx build. No local build or container path is involved.

Run-from-package is deliberately not set because App Service remote build requires extraction and Oryx. The gateway roles disable WebJobs. Startup commands are explicit: web bootstraps the frozen schema then starts standalone Next; each gateway binds its existing server to the platform-provided port.

## Exact gates

1. Preserve the final application test/build record for exact head `8e408fa` and require the same commit in the reviewed remote.
2. Rerun the read-only access checker immediately before apply; require Microsoft.Web `Registered`, every scoped write permission true, zero target plans/apps, and no new SKU/quota rejection.
3. Fill an ignored parameter file and private shell secret variables; never store secrets in the checked-in JSON or command logs.
4. Compile and review App Service what-if. Confirm exactly one B2 plan, three apps, one VNet integration subnet, private PostgreSQL/DNS, diagnostics, app settings and budget.
5. Apply infrastructure, then ZIP-deploy the exact tested commit through Azure Cloud Shell. Verify Oryx used Node 24, every bundle exists, only one supervisor WebJob runs, and no secret appears in deployment/application logs.
6. Require web readiness, both gateway health paths, three WSS origin/authority rejection checks, a fresh supervisor heartbeat, private PostgreSQL TLS/schema access, email verification/reset, bounded inference accounting and durable stop behavior.
7. Soak fictional data for one business day. Measure memory/CPU/restarts, WebJob liveness, WebSocket disconnects, PostgreSQL connections/credits, log volume and inference cost. B2 remains accepted only from this evidence.
8. Perform PostgreSQL restore-to-new-server and rollback by redeploying the prior exact commit ZIP. Basic has no deployment-slot release gate; expect a controlled restart during ZIP deployment.

## Remaining blockers

This alternative is not blocked by the Container Apps environment quota or Microsoft.Web registration. It is blocked by private parameters/secrets; exact-commit App Service Oryx packaging; WebJob shutdown/heartbeat evidence; three-app B2 resource measurements; real email/WSS/database checks; and restore/rollback evidence. No master credential, repeated Azure key request, custom domain, or other provider is required.

Primary references: [Node 24 on App Service](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs), [App Service plans](https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans), [Linux pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/), [VNet integration](https://learn.microsoft.com/en-gb/azure/app-service/overview-vnet-integration), [private PostgreSQL from App Service](https://learn.microsoft.com/en-us/azure/postgresql/developer/webapp-server-vnet), [WebJobs](https://learn.microsoft.com/en-us/azure/app-service/webjobs-create), [ZIP remote build](https://learn.microsoft.com/en-us/azure/app-service/deploy-zip), [app-setting encryption](https://learn.microsoft.com/en-us/azure/app-service/web-sites-configure), and [service limits](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits).
