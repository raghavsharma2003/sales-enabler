# Hosted readiness audit — 10 October 2026

## Verdict

The repository now has reviewable deployment IaC but is **not deployed or hosted-verified**. The smallest defensible private-beta shape is: reuse the existing Basic ACR, Log Analytics workspace, and Azure Communication Services Email/domain; create a project-specific VNet-integrated Container Apps environment, PostgreSQL Flexible Server, Key Vault, and user-assigned identity; then deploy the scale-to-zero web app and WSS gateway plus one always-on private-call supervisor. No cloud mutation, provider invocation, key listing, endpoint disclosure, or deployment occurred in this audit/preparation.

The current application head is `596b890` with 1,054 integrated tests and 32 focused shutdown-review checks passing; its final production build/package verification is still in progress. This is strong application evidence, but it contains no hosted database, ingress, email, worker, backup, quota, or cost proof.

The user-reported approximately USD 4,000 startup balance remains planning input only. ARM read access is healthy, but the credit-summary request returned 401. Microsoft says startup credits apply to eligible standard Azure consumption in the sponsored subscription, including Container Apps, ACR, and PostgreSQL, but this audit cannot prove that this is the sponsored subscription, the remaining balance, expiry, or post-credit behavior.

## What is actually provisioned

Read-only ARM inspection found an enabled subscription, a readable approved resource group, all required resource providers registered, and foundation write permissions at that group. The deployment identity does **not** have role-assignment or resource-lock write permission. The group contains:

| Reusable now, after compatibility checks | Not present for sales-enabler |
|---|---|
| One succeeded Basic ACR; three succeeded Consumption Container Apps environments; one 30-day Log Analytics workspace with a 1 GB/day cap; ACS, Email, one linked verified Azure-managed domain, and one sender username; existing action/metric/log alerts | No target-named Container App or Job, no project PostgreSQL server, Key Vault, user-assigned identity, deployment parameter file, budget, immutable image, or hosted readiness evidence |

The existing apps/jobs are other workloads: none is target-named, they use mutable images and do not establish this application's deployment. Key Vaults, identities, and one PostgreSQL server exist elsewhere in the subscription, outside the approved group; do not repurpose them without separate scope and ownership evidence.

The existing Container Apps environments are not a safe shortcut for database networking. A current app reports 401 possible outbound addresses. A broad “allow Azure services” PostgreSQL rule would expose the database network boundary to unrelated Azure tenants, while hundreds of individual rules are not a maintainable beta design.

## Recommended private-beta topology

Use East US 2 to remain with the existing registry/logging footprint and current model resources, subject to quota checks.

1. Reuse the existing Basic ACR with a dedicated repository prefix and immutable `repository@sha256:digest` references. The target identity must use managed-identity pull; never use the registry admin credential.
2. Reuse the existing Log Analytics workspace, its 30-day retention and 1 GB/day safeguard. Add target-specific queries/alerts so shared-workspace traffic cannot hide this app's failures.
3. Create a project VNet with separate delegated subnets, a workload-profiles v2 Container Apps environment using only the Consumption profile, PostgreSQL private access, and linked private DNS. This adds Standard Load Balancer/public-IP networking charges for an external custom-VNet environment, but avoids an overbroad database firewall and a NAT Gateway.
4. Create PostgreSQL Flexible Server B1ms, 32 GiB, no HA, seven-day locally/zone-redundant managed backup as region support dictates, TLS verification, one application database, and a dedicated application role. B1ms is a private-beta tier, not a production availability claim.
5. Create a project Key Vault Standard with RBAC, soft delete, purge protection, and a project user-assigned identity. Store the database URL, connector key, lifecycle key, public-session key, ACS key, and existing Azure inference/Speech keys there. Grant only ACR pull and Key Vault secret read to the runtime identity.
6. Deploy web and voice-gateway at 0.5 vCPU/1 GiB, `minReplicas=0`, `maxReplicas=1`. Container Apps ingress terminates TLS and supports WebSockets; publish `/voice` and `/private-speech` on the gateway hostname. Run the private-call supervisor at 0.25 vCPU/0.5 GiB and exactly one replica because durable deadlines cannot wait for incoming traffic. Keep public-session limits at the existing conservative defaults.
7. Enable email verification. The ACS resource, linked Azure-managed domain, and sender record exist. The application still needs its HMAC access key in Key Vault and one real verification/reset round trip before invitations.
8. Run the automation worker for scheduled beta work. Keep channel worker off unless Telegram/WhatsApp is explicitly in beta; keep learning worker off until reviewed learning is explicitly enabled. For lower cost, convert automation and learning to scheduled Container Apps Jobs using their existing `--once` mode. Channel processing needs an always-on worker if sub-minute replies are required.

## Cost boundary

The 10 October official retail API still reports East US 2 PostgreSQL B1ms at USD 0.017/hour and storage at USD 0.115/GiB-month: about USD 16.09/month for compute plus 32 GiB. The always-on 0.25-vCPU/0.5-GiB supervisor is roughly USD 6–20/month at all-idle versus all-active rates before any free allowance; web and gateway are usage-priced from zero replicas. Each optional always-on 0.5-vCPU/1-GiB worker adds roughly USD 12–39/month. Key Vault operations are USD 0.03/10,000; email is USD 0.00025/message plus USD 0.00012/MB in Central India. Custom-VNet load balancer/public IPs, ACR build/storage, logs, bandwidth, inference, and restore-drill overlap are additional.

Create a USD 150/month resource-group budget with actual/forecast alerts at 50/75/90/100 percent, but treat it as notification only. Hard controls are one replica, B1ms/no HA, disabled optional workers, usage/session caps, verified model-rate configuration, and preserved rollback digests. There is currently no budget at resource-group or subscription scope.

## Preparation completed; execution gates remain

- `prerequisites.bicep` now creates private networking/DNS, a v2 Consumption environment, B1ms PostgreSQL, Key Vault, runtime identity, diagnostics and a USD 150 alert budget. A separate Owner-run template adds narrow roles and delete locks. `main.bicep` wires Speech/WSS, finite inference activation/budgets, a four-connection pool and the durable supervisor. All three templates compile.
- Redacted live checks show the deployment identity has all foundation writes and ACR task control, but no role-assignment/lock permission and no repository data write. A human Owner must review/apply only `AcrPush` for the deployer, `AcrPull` and Key Vault secret read for runtime, Key Vault secret write for the deployer, and the two delete locks.
- ARM validation reaches the platform but is stopped by `MaxNumberOfGlobalEnvironmentsInSubExceeded`: six Container Apps environments already exist subscription-wide, although East US 2 reports two of five regional slots used. Obtain a managed-environment quota increase; do not reuse the three unapproved shared environments or delete another workload as a workaround.
- The final tested commit must be available at the reviewed remote. The prepared ACR script builds only that exact commit and only web/gateway/supervisor targets. ACR's free-credit task-run warning still requires one remote availability probe; never fall back to local Docker/WSL.
- Startup remains additive `CREATE ... IF NOT EXISTS`; freeze schema for this beta. Versioned migration/rollback remains required before later schema changes.
- Populate the new vault privately, review both what-if outputs, then prove hosted readiness, email verification/reset, WSS origin controls, supervisor heartbeat/stop, budget accounting, a fictional-data soak, and PostgreSQL restore-to-new-server.
- Optional workers remain always-on apps. Enable automation only when scheduled beta execution needs it; keep channel/learning off until their external scopes are included. Scheduled Jobs remain a later cost improvement.

## Inputs that cannot be discovered under the authorized checks

No previously supplied key needs to be requested again. The ignored local configuration already contains the approved Azure inference/Speech and stable application keys; the ACS key must still be placed privately into the new vault. The private parameter set also needs a PostgreSQL password/database URL and one budget-alert email. Credit balance/expiry remains API-inaccessible, but the user has explicitly authorized operations within the declared grant; treat the USD 150 budget and portal monitoring as the boundary rather than asking again. A custom domain, OAuth client apps, customer data, and additional provider keys are not required.

## Primary sources

[Container Apps billing](https://learn.microsoft.com/en-us/azure/container-apps/billing) · [custom VNet charges](https://learn.microsoft.com/en-in/azure/container-apps/custom-virtual-networks?tabs=workload-profiles-env) · [managed-identity ACR pull](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull) · [ACR Tasks and free-credit warning](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-tasks-overview) · [PostgreSQL private networking](https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private) · [PostgreSQL backup/PITR](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore) · [Azure-managed email domains](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/email/add-azure-managed-domains) · [startup-credit coverage](https://learn.microsoft.com/en-in/microsoft-for-startups/benefits/use-azure-credits) · [Azure Retail Prices API](https://prices.azure.com/api/retail/prices)
