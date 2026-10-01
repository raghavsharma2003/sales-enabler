# Azure hosting readiness and bounded pilot plan — 1 October 2026

This is a design and readiness record. It did not create or change an Azure resource, role assignment, credential, application file, image, database, or deployment. It does not establish remaining grant credit, grant coverage, production readiness, or live capacity.

## Decision

Keep the existing Azure Container Apps architecture and build its OCI images remotely with Azure Container Registry (ACR) Tasks. This is the smallest reusable path because it uses the checked-in `Dockerfile` targets and `infrastructure/azure/main.bicep` without installing or running Docker, WSL, or Azure CLI on the employer laptop. Run the eventual build from Azure Cloud Shell or a controlled Azure pipeline.

Do not move the pilot to native Node App Service merely to avoid local Docker. App Service can host Node 24 code and Linux WebJobs, but this repository has five independently gated processes, two listeners, separate health boundaries, and immutable container packaging already reviewed. Replacing that with two native web apps plus three WebJobs would require new packaging, startup, shutdown, monitoring, identity, probe, and rollback evidence. Its possible low-end compute price is not enough to justify that release-path rewrite before a hosted measurement.

The first hosted pilot should contain only the Next web app and voice gateway. Keep the automation, channel, and learning workers disabled. This preserves the primary web/voice experience while bounding external-delivery authority, inference spend, database connections, and failure modes.

## Current evidence and hard blockers

A 1 October read-only access check reported that the deployment identity now has Contributor on the existing startup resource group. The effective permissions cover Web App, Container Apps, and PostgreSQL resource writes and deny `Microsoft.Authorization/roleAssignments/write`, as expected for Contributor. The resource group currently contains the existing AI account and two child projects; no hosting, registry, vault, managed identity, or database resource is present. Subscription state is Enabled and the spending-limit property is Off. The remaining startup-credit balance and expiry have not been verified, so **no billable resource should be created yet**.

The provider check reported these relevant registrations:

| Resource provider | State and consequence |
|---|---|
| `Microsoft.App`, `Microsoft.ContainerRegistry`, `Microsoft.ManagedIdentity`, `Microsoft.KeyVault`, `Microsoft.OperationalInsights`, `Microsoft.Storage` | Registered; the resource-group Contributor can create their resource types in the group, subject to policy, quota, and regional availability. |
| `Microsoft.DBforPostgreSQL` | Not registered; a principal with subscription-scope provider-registration permission must register it before PostgreSQL creation. Resource-group Contributor is insufficient. |
| `Microsoft.Communication` | Not registered; register only if the pilot will enable hosted email verification through Azure Communication Services (ACS). |
| `Microsoft.Web` | Not registered; needed only for the App Service alternative. Do not register it for the recommended Container Apps path. |

The read-only report did not state the registration status of `Microsoft.Insights` or `Microsoft.Consumption`; verify them before creating metric alerts, diagnostic settings, or a budget. Provider registration and RBAC are separate prerequisites. Register only providers actually used. Microsoft recommends registering a provider when ready to use it because registration adds an application for that provider to the tenant.[^providers]

The current `main.bicep` creates only Container Apps. Before it can be applied, the following must already exist and be usable:

- one workload-profiles v2 Container Apps environment using its Consumption profile;
- one Basic ACR and immutable per-target image digests;
- one user-assigned managed identity;
- one Standard Key Vault containing `DATABASE_URL`, connector key, account lifecycle key, public-session hash secret, and the selected Azure/ACS keys when those features are enabled;
- one reachable PostgreSQL Flexible Server and application database;
- final HTTPS and WSS origins, even if the pilot initially uses the Azure-generated hostnames; and
- a private deployment parameter file containing resource references, never secret values.

ACR Tasks is the correct remote builder: Microsoft describes `az acr build` as a cloud build that accepts a Dockerfile context, builds without a local Docker engine, and pushes the result to ACR.[^acr-tasks] However, Microsoft currently warns that **ACR Task runs are temporarily paused for Azure free-credit subscriptions**. The actual Startup offer must therefore pass a small, non-secret ACR Tasks availability check before relying on this route. If the offer blocks ACR Tasks, open an Azure support case; do not silently build on the employer laptop or change architecture as a workaround.

## Exact access still needed

Contributor supplies broad resource control-plane actions but excludes access management. Microsoft documents `Microsoft.Authorization/roleAssignments/write` as the permission required to create role assignments.[^rbac] A human Owner or Role Based Access Control Administrator should perform the following narrow bootstrap assignments. The deployment identity does not need permanent Owner.

| Principal | Scope | Required role | Why |
|---|---|---|---|
| Runtime user-assigned identity | Exact ACR repositories used by this app | `Container Registry Repository Reader` for an ABAC-enabled registry; otherwise `AcrPull` | Container Apps must pull the immutable images. Legacy `AcrPull` is not honored when ACR repository ABAC mode is enabled.[^acr-rbac] |
| Deployment/build identity | Exact app repository prefix in ACR | `Container Registry Repository Writer` for ABAC; otherwise `AcrPush` | Contributor covers ACR control-plane and task operations, but not repository data-plane writes. This role permits build output to be written. |
| Runtime user-assigned identity | Key Vault, preferably narrowed to the selected secrets if the chosen scope model supports it | `Key Vault Secrets User` | Container Apps Key Vault references require managed-identity secret-read permission.[^aca-secrets] |
| Human bootstrap identity, or deployment identity only if automation must populate secrets | Key Vault | `Key Vault Secrets Officer` | Contributor does not grant Key Vault secret data-plane writes. Avoid giving this role to the runtime identity. |

Before assigning the ACR roles, inspect the registry's Role assignment permissions mode. For an ABAC-enabled registry, use repository roles and scope conditions for the application repository prefix. For an RBAC-only registry, use `AcrPush`/`AcrPull`. Contributor alone is control plane only in ABAC-enabled registries.[^acr-abac]

PostgreSQL access is also a data-plane concern. Azure Resource Manager Contributor can create the server but does not grant SQL privileges inside it. The application bootstrap needs a dedicated database role able to connect and create the current tables and indexes, followed by normal `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations. Keep the administrative credential outside application configuration, put only the application connection string in Key Vault, require TLS verification (`sslmode=verify-full`), and do not use `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Recommended pilot resources and capacity

Use East US 2 if each SKU is available there so hosting remains near the existing Foundry account. Use a single resource group and consistent `product=sales-enabler`, `environment=pilot`, and owner tags.

| Resource | Pilot choice | Hard boundary |
|---|---|---|
| Container Apps environment | Workload-profiles v2, Consumption profile, external ingress | No Dedicated workload profile, private endpoint, NAT Gateway, or zone-redundant environment in this pilot. |
| Web Container App | Existing `web` target, 0.5 vCPU/1 GiB, min 1/max 1, port 3000 | One replica. No scale-out claim until shared auth limiting and PostgreSQL load tests pass. |
| Voice Container App | Existing `voice-gateway` target, 0.5 vCPU/1 GiB, min 1/max 1, port 3001 through HTTPS/WSS ingress | One replica. Container Apps HTTP ingress supports WebSockets and TLS termination.[^aca-ingress] |
| Optional workers | Existing targets, all disabled (`enableWorker=false`, `enableChannelWorker=false`, `enableLearningWorker=false`) | Enable at most one worker on the initial database tier, and only after its authority, heartbeat, and external-delivery gate passes. |
| ACR | Basic, one region, classic registry RBAC matching the current template | Retain only recent successful immutable builds plus the rollback generation. Basic includes 10 GiB; add a retention/cleanup procedure before repeated builds.[^acr-skus] |
| Key Vault | Standard, RBAC permission model, soft delete and purge protection | Runtime gets secret read only; secret population/rotation remains a separate bootstrap authority. |
| PostgreSQL Flexible Server | Burstable B1ms, 1 vCore/2 GiB, 32 GiB storage, 7-day operational backup, no HA | Pilot/staging only. Microsoft describes Burstable as primarily for nonproduction and it does not support HA.[^pg-compute] |
| Logs | One Log Analytics workspace; start with only required Container Apps system/console logs and short retention | Apply ingestion filtering and a low daily safeguard. A daily cap can overshoot and creates a monitoring blind spot, so it is not a guaranteed cost ceiling.[^log-cap] |
| Email | For a public account pilot, ACS Email with the free Azure Managed Domain and account verification enabled | Requires `Microsoft.Communication`, an ACS secret, and a real send/recovery test. The managed sender avoids requiring a custom DNS domain for the first bounded pilot.[^acs-domain] |

The B1ms database has 35 default user connections.[^pg-limits] This code creates a PostgreSQL pool with a maximum of eight connections in each long-lived process, while health checks use a separate one-connection pool. Web plus voice can therefore reserve up to 16 application connections, with probe/bootstrap headroom. Adding one worker brings the long-lived maximum to 24. Two or three workers can approach or exceed the B1ms user-connection limit once probes and operational connections are included. Before enabling a second worker, move to at least B2s or provide measured connection pooling; built-in PgBouncer is not supported on the Burstable tier.[^pgbouncer]

For the cheapest pilot, use PostgreSQL public access with firewall rules restricted to the Container Apps environment's currently reported outbound addresses, never “Allow public access from any Azure service.” Container Apps documentation says outbound addresses can change, so monitor this and treat an address change as a potential availability event.[^aca-network] A production release should move the environment and database to reviewed private networking. A custom VNet has extra public-IP and load-balancer charges and should be costed before adoption.[^aca-vnet]

## Indicative retail cost, not a grant-balance claim

The following uses East US 2 public retail prices returned by Microsoft's unauthenticated Azure Retail Prices API on 1 October 2026, 730 hours/month, and the checked-in 0.5-vCPU/1-GiB sizing, assuming the monthly Container Apps free grant remains available. It is an estimate before taxes or offer-specific adjustments. It excludes inference/model tokens, voice/audio, ACS traffic, ACR build duration, Log Analytics ingestion, bandwidth, DNS/custom domain, network appliances, security products, and support. It says nothing about remaining Startup credit or whether each meter is covered.

| Item | Indicative USD/month |
|---|---:|
| Basic ACR | about $5.00 (retail meter $0.1666/day) |
| PostgreSQL B1ms compute | $12.41 (retail meter $0.017/hour) |
| PostgreSQL 32 GiB storage | $3.68 (retail meter $0.115/GiB-month) |
| Web + voice Container Apps, both always present | about $22.03 if every eligible second is billed at idle rates; about $73.44 if every second is billed active, after the monthly 180,000 vCPU-second and 360,000 GiB-second free grants |
| Key Vault Standard | $0.03 per 10,000 ordinary operations; normally immaterial at pilot volume |
| Base subtotal before omitted variable services | about **$43–$95/month** |

Container Apps idle status has platform conditions, including CPU and network thresholds; it must not be assumed. The Consumption plan also includes two million requests/month and then charges per request.[^aca-billing] If all three workers later run continuously at the same checked-in size, total five-app Container Apps compute is roughly $58/month at all-idle rates to $192/month at all-active rates, before the other services. This is why the pilot leaves them off.

For comparison, East US 2 Linux App Service retail is about $12.41/month for B1 (1 core/1.75 GiB) and $24.82/month for B2 (2 cores/3.5 GiB).[^retail] One plan can host multiple apps, but all apps and continuous WebJobs share its VM resources and scaling boundary. There is no evidence that five current Node processes fit B1 or B2 safely. Even B2 plus the same B1ms database and storage starts around $41/month before monitoring, email, inference, and bandwidth. That possible savings against an all-active Container Apps month does not compensate for the untested packaging and process-coupling risk. Reconsider App Service only after measuring actual CPU/memory and only if removing containers is a lasting operational goal.

Set a resource-group budget with actual and forecast alerts at 50%, 75%, 90%, and 100% of a pilot target derived from the remaining authorized grant and its expiry, plus alerts for Container Apps replica count, PostgreSQL CPU credits/connections/storage, log ingestion, and inference usage. Azure budgets notify after delayed cost evaluation; they do not stop resources or guarantee a cap.[^budgets] Harder cost controls in this plan are max replicas of one, disabled workers, smallest fixed SKUs, no HA, no Dedicated profile, and ACR retention. `spendingLimit=Off` is not a protective ceiling.

## Deployment, readiness, and rollback sequence

1. **Billing gate.** In the Startup portal/billing scope, verify the exact subscription's remaining credit, expiry, covered-service rules, and post-credit billing behavior. Derive a conservative monthly target within the user’s existing grant-only authorization. Stop if the remaining balance is not visible or overage behavior is unacceptable.
2. **Subscription bootstrap.** A subscription-authorized human registers `Microsoft.DBforPostgreSQL`; also register `Microsoft.Communication` only for the public-email pilot, and verify `Microsoft.Insights`/`Microsoft.Consumption` for alerts and budgets. Confirm East US 2 SKU availability and quotas. Do not register `Microsoft.Web` for this path.
3. **Prerequisite resources.** Create ACR Basic, Key Vault Standard, the runtime user-assigned identity, Log Analytics workspace, Container Apps v2 Consumption environment, and PostgreSQL B1ms. Create the app database and application role. Apply the narrow ACR and Key Vault assignments above with a human RBAC administrator.
4. **Secret/configuration gate.** Populate Key Vault without printing values. Require a TLS-verifying PostgreSQL URL, distinct stable 64-hex connector and lifecycle keys, a public-session secret of at least 32 characters, and existing Azure inference credentials only when voice is enabled. For public accounts, provision ACS Email, an Azure Managed Domain, and sender, then enable verification. Derive the initial HTTPS/WSS origins from the managed environment before generating the private parameter file.
5. **Remote build gate.** In Cloud Shell, obtain source from the reviewed revision, verify `.dockerignore`, and build only the `web` and `voice-gateway` targets in ACR with unique commit-based tags. The checked-in ignore file excludes `.env*`, data, backups, local databases, context, docs, research, and local parameter files. Never add secrets as build arguments or URI parameters. Require the Dockerfile's production build/package checks to pass. Resolve each result to `repository@sha256:digest`; mutable tags are not deployment inputs.
6. **What-if.** Create a private ignored parameter file, run the existing inspection/what-if path, and review every create/change/delete. Initial flags remain: all workers false; voice false for the first web deployment; email and Azure settings true only when their complete dependencies exist.
7. **Web deployment.** Deploy web at one replica against the empty pilot database. Require startup, liveness, and `/api/health?ready=1` readiness; verify TLS database connectivity, account lifecycle, tenant isolation, redacted logs, and the Azure-generated HTTPS origin. Do not import real customer data.
8. **Voice deployment.** Deploy the immutable voice digest, set the final `wss://.../voice` URL and public-session secret, then redeploy web with that exact URL. Verify origin rejection, `/health`, connection provisioning, one disclosed-AI typed call, controlled disconnect, saved evidence, and inference usage. Microphone/device/perceptual claims remain open until physically tested.
9. **Soak.** Run an invite-only, fictional-data soak for at least one normal business day. Watch Container Apps restarts/CPU/memory, WebSocket disconnects, PostgreSQL CPU credits/connections/storage, readiness, log volume, and inference use. B1ms CPU-credit depletion, sustained memory pressure, or more than roughly 70% of available database connections is a stop/resize signal, not permission to raise replicas.
10. **Optional worker progression.** Enable no more than one worker on B1ms. Confirm its durable heartbeat, authority review, backlog behavior, idempotency/uncertain-result handling, and cost before considering another. Upgrade the database and retest before a second worker.

Container Apps single-revision mode keeps traffic on the old revision until the new revision provisions and passes startup/readiness; failed updates do not receive traffic.[^revisions] Preserve the previous image digests and private parameter manifest for each release. If a regression appears after cutover, redeploy the previous digest and previous non-secret configuration, then confirm readiness and voice health. Do not rebuild the old tag.

Application startup performs additive `CREATE TABLE/INDEX IF NOT EXISTS` bootstrap; it is not a versioned migration or schema rollback. Image rollback therefore leaves additive database changes in place. Before any release that changes schema or data, require a reviewed migration plan and a PostgreSQL restore-to-new-server drill. Flexible Server supplies managed point-in-time backups; backup storage up to the provisioned server storage is included, with excess charged separately.[^pg-backup] Never restore over the running pilot database.

## Smallest user input before provisioning

The immediate missing input is the actual remaining Startup credit, expiry and confirmation that it applies to this subscription. This honors the user’s existing grant-only budget; it is not a request for a new paid budget. Provider registration and the narrow runtime role assignments remain separate prerequisites listed above. **$150/month** is a reasonable initial alert budget for the two-process pilot, leaving room above the $43–$95 base estimate for logs, builds, email, bandwidth, and bounded inference. It is an alert target, not a hard cap.

No custom domain is required for the first bounded pilot: use Azure-generated HTTPS/WSS hostnames and an ACS Azure Managed Domain. A branded application domain and verified custom sender can be supplied later, before any customer-facing launch. No additional identity IDs, secrets, API keys, or customer data should be pasted into chat or committed.

## Official Microsoft sources

[^providers]: [Azure resource providers and types](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/resource-providers-and-types)
[^acr-tasks]: [Automate container builds with Azure Container Registry Tasks](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-tasks-overview)
[^rbac]: [Understand Azure role definitions](https://learn.microsoft.com/en-us/azure/role-based-access-control/role-definitions) and [role-assignment prerequisites](https://learn.microsoft.com/en-us/azure/role-based-access-control/role-assignments-steps)
[^acr-rbac]: [ACR Microsoft Entra permissions and role assignments](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-roles)
[^aca-secrets]: [Manage secrets in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets)
[^acr-abac]: [Azure ABAC repository permissions in ACR](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-rbac-abac-repository-permissions)
[^aca-ingress]: [Ingress in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview)
[^acr-skus]: [Azure Container Registry service tiers](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-skus)
[^pg-compute]: [PostgreSQL Flexible Server compute options](https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-compute) and [reliability/HA support](https://learn.microsoft.com/en-us/azure/reliability/reliability-postgresql-flexible-server)
[^log-cap]: [Set a daily cap on a Log Analytics workspace](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/daily-cap)
[^acs-domain]: [ACS Email domains and sender authentication](https://learn.microsoft.com/en-us/azure/communication-services/concepts/email/email-domain-and-sender-authentication) and [Email pricing](https://learn.microsoft.com/en-us/azure/communication-services/concepts/email-pricing)
[^pg-limits]: [PostgreSQL Flexible Server limits](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-limits)
[^pgbouncer]: [PgBouncer in PostgreSQL Flexible Server](https://learn.microsoft.com/en-us/azure/postgresql/connectivity/concepts-pgbouncer)
[^aca-network]: [Networking in an Azure Container Apps environment](https://learn.microsoft.com/en-us/azure/container-apps/networking)
[^aca-vnet]: [Configure virtual networks in Container Apps environments](https://learn.microsoft.com/en-us/azure/container-apps/custom-virtual-networks)
[^aca-billing]: [Billing in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/billing) and [Azure Retail Prices API](https://prices.azure.com/api/retail/prices)
[^retail]: [Azure Retail Prices API](https://prices.azure.com/api/retail/prices) and [App Service for Linux pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/)
[^budgets]: [Create and manage Azure budgets](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets)
[^revisions]: [Update and deploy changes in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/revisions)
[^pg-backup]: [Backup and restore in PostgreSQL Flexible Server](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore)
