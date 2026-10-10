# Hosted readiness audit — 10 October 2026

## Verdict

The repository is **not deploy-ready today**, but the approved Azure resource group now contains enough shared foundation to avoid rebuilding everything. The smallest defensible private-beta shape is: reuse the existing Basic ACR, Log Analytics workspace, and Azure Communication Services Email/domain; create a project-specific VNet-integrated Container Apps environment, PostgreSQL Flexible Server, Key Vault, and user-assigned identity; then deploy the web app, WSS gateway, and only the worker needed by the beta. No cloud mutation, provider invocation, key listing, endpoint disclosure, or deployment occurred in this audit.

The current local baseline is 900/900 integrated tests plus production build/package/typecheck and bounded gateway evidence. That is strong application evidence, but it contains no hosted database, ingress, email, worker, backup, quota, or cost proof.

The user-reported approximately USD 4,000 startup balance remains planning input only. ARM read access is healthy, but the credit-summary request returned 401. Microsoft says startup credits apply to eligible standard Azure consumption in the sponsored subscription, including Container Apps, ACR, and PostgreSQL, but this audit cannot prove that this is the sponsored subscription, the remaining balance, expiry, or post-credit behavior.

## What is actually provisioned

Read-only ARM inspection found an enabled subscription, a readable approved resource group, all required resource providers registered, and write/RBAC permissions at that group. The group contains:

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
6. Deploy web and voice-gateway at 0.5 vCPU/1 GiB, `minReplicas=1`, `maxReplicas=1`. Container Apps ingress terminates TLS and supports WebSockets; publish `/voice` and `/private-speech` on the gateway hostname. Keep public-session limits at the existing conservative defaults.
7. Enable email verification. The ACS resource, linked Azure-managed domain, and sender record exist. The application still needs its HMAC access key in Key Vault and one real verification/reset round trip before invitations.
8. Run the automation worker for scheduled beta work. Keep channel worker off unless Telegram/WhatsApp is explicitly in beta; keep learning worker off until reviewed learning is explicitly enabled. For lower cost, convert automation and learning to scheduled Container Apps Jobs using their existing `--once` mode. Channel processing needs an always-on worker if sub-minute replies are required.

## Cost boundary

The 10 October official retail API still reports East US 2 PostgreSQL B1ms at USD 0.017/hour and storage at USD 0.115/GiB-month: about USD 16.09/month for compute plus 32 GiB. Two always-present 0.5-vCPU/1-GiB Container Apps are about USD 24–79/month at all-idle versus all-active rates **before** any monthly free allowance; existing subscription workloads may already consume that allowance. Each always-on worker adds roughly USD 12–39/month. Key Vault operations are USD 0.03/10,000; email is USD 0.00025/message plus USD 0.00012/MB in Central India. Custom-VNet load balancer/public IPs, ACR build/storage, logs, bandwidth, inference, and restore-drill overlap are additional.

Create a USD 150/month resource-group budget with actual/forecast alerts at 50/75/90/100 percent, but treat it as notification only. Hard controls are one replica, B1ms/no HA, disabled optional workers, usage/session caps, verified model-rate configuration, and preserved rollback digests. There is currently no budget at resource-group or subscription scope.

## Blocking repository work before apply

- `main.bicep` consumes an environment, registry, identity, vault references, and database; it provisions none of the missing prerequisites or private networking. Add a prerequisite module and a reviewed what-if path.
- The voice app wiring omits `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and the web-side `CONTINUOUS_SPEECH_GATEWAY_URL`. Without them, the newly verified private continuous-speech route is unavailable when hosted.
- The current worker resources are always-on Container Apps at one replica. No Job resources, schedules, execution alerts, or job-aware readiness contract exist, although all three scripts support `--once`.
- Every process can open a PostgreSQL pool of eight connections; web, gateway, and three workers can exceed the B1ms default connection budget with probes/operations. Limit pools per role and load-test the chosen process set.
- Startup performs additive `CREATE ... IF NOT EXISTS`; there is no versioned migration/rollback system. Freeze schema for the first beta, run bootstrap once, and add migrations before later schema changes.
- ACR remote-build packaging exists (`Dockerfile`, `.dockerignore`, six targets), but no checked-in CI/task definition exists. Microsoft still warns that ACR Task runs can be paused for Azure free-credit subscriptions. Perform one nonsecret remote-build availability probe before relying on ACR Tasks; never fall back to local Docker/WSL.
- Run a PostgreSQL point-in-time restore to a **new** server, execute read-only integrity/readiness checks, record measured RPO/RTO, and delete the drill server only after evidence review. Managed backups support seven-to-35-day PITR; they do not replace a restore drill.

## Inputs that cannot be discovered under the authorized checks

Only two user-side facts remain required: (1) the exact remaining startup-credit amount, expiry, sponsored subscription match, and pay-as-you-go behavior shown in the Startup/Azure portal; and (2) the existing ACS access key placed directly into Key Vault or privately supplied to the deployment operator. The sender, endpoint, Azure inference/Speech configuration, stable application keys, and management identity are already discoverable or present in ignored local configuration and need not be requested again. A custom domain, OAuth client apps, customer data, and additional provider keys are not required for this private beta.

## Primary sources

[Container Apps billing](https://learn.microsoft.com/en-us/azure/container-apps/billing) · [custom VNet charges](https://learn.microsoft.com/en-in/azure/container-apps/custom-virtual-networks?tabs=workload-profiles-env) · [managed-identity ACR pull](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull) · [ACR Tasks and free-credit warning](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-tasks-overview) · [PostgreSQL private networking](https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private) · [PostgreSQL backup/PITR](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore) · [Azure-managed email domains](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/email/add-azure-managed-domains) · [startup-credit coverage](https://learn.microsoft.com/en-in/microsoft-for-startups/benefits/use-azure-credits) · [Azure Retail Prices API](https://prices.azure.com/api/retail/prices)
