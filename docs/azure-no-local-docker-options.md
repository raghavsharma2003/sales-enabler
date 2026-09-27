# Azure deployment without local Docker

27 September 2026. This is a planning and access note only. No Azure resource, credential, role assignment, image, deployment, or paid service was created or changed. The current subscription contents, role assignments, quotas, regions, registry role-assignment mode, networking, and Startup-credit eligibility were not inspected.

## Recommendation

Use the existing Azure Container Apps design and build its images remotely with Azure Container Registry Tasks (`az acr build`), preferably from Azure Cloud Shell or a controlled CI workflow. This requires no Docker installation or Docker engine on the employer laptop. Microsoft documents ACR quick builds as cloud-native builds that build and push an image from a Dockerfile without a local Docker installation.[^acr-build] It also preserves the reviewed separation already expressed in `infrastructure/azure/main.bicep`: one Next standalone web process, three independently gated and monitored workers, and one independently hosted WebSocket gateway.

Do not move this release to native App Service code/ZIP deployment merely to avoid local Docker. Native App Service is technically possible, including the current Node 24 runtime,[^node24] but it is an architecture and deployment rewrite rather than a change of build location. It should be evaluated later only if eliminating custom containers from Azure itself is a product goal.

The recommended sequence is therefore:

1. Use the personal/startup Microsoft account and its startup tenant/subscription, never the employer tenant or employer-managed identity.
2. In Azure Cloud Shell, select and verify the exact subscription before doing anything else. Cloud Shell avoids installing Azure CLI or Docker locally.
3. Create or select one dedicated startup resource group. Put the app's Container Apps environment, ACR, Key Vault, database, managed identity, monitoring, and application resources in that group unless a reviewed network design requires separate scopes.
4. Build each selected target remotely in ACR from its existing Dockerfile using unique, immutable tags. `az acr build --registry <acr-name> --image <repository>:<unique-tag> --file <dockerfile> <source-directory>` sends the build context to Azure, builds there, and pushes to the registry.[^acr-build] Do not put secrets in the build context, Dockerfile, build arguments, command line, or logs.
5. Resolve every pushed image to its digest and supply `registry/repository@sha256:<digest>` to the existing Bicep parameters. Run image/package/security checks before deployment. A successful ACR build is not a security scan.
6. Keep the four optional processes disabled until their individual hosted gates are satisfied. In particular, enabling a worker can produce inference spend or external delivery.

This route still uses Dockerfiles and OCI images in Azure. “No local Docker” means no Docker Desktop, daemon, or Docker command on the laptop; it does not mean a container-free Azure architecture.

## Option A: remote ACR builds plus Container Apps

This is the direct fit for the repository. The Bicep template expects an existing Container Apps managed environment, ACR, user-assigned managed identity, Key Vault secrets, managed PostgreSQL database, and immutable images. It then deploys separate Container Apps for:

| Runtime | Hosting shape | Reason to keep separate |
|---|---|---|
| Next standalone web | External HTTPS ingress, port 3000, one replica initially | Own readiness probe and HTTP scaling boundary |
| Automation worker | No ingress, always-running replica when explicitly enabled | Durable scheduling and external-delivery authority |
| Channel worker | No ingress, always-running replica when explicitly enabled | Independent external messaging and inference gate |
| Learning worker | No ingress, always-running replica when explicitly enabled | Independent paid inference and review pipeline |
| Voice gateway | External WSS/HTTPS ingress, port 3001 | Separate WebSocket process, origin checks, health probes, and scaling boundary |

Container Apps exposes each ingress-enabled app on its own hostname, so the web process and the port-3001 gateway remain cleanly separated. The published gateway value must be its final `wss://.../voice` URL. This matches the existing code and Bicep rather than combining two listening processes behind one site.

Operational constraints remain unchanged: use managed PostgreSQL with verified TLS, keep secrets in Key Vault, alert on durable worker heartbeat age, keep one replica until shared rate-limit and database load tests pass, and verify the final custom-domain/OAuth/origin configuration. The current Bicep creates none of the prerequisites and creates no role assignments.

Before relying on ACR Tasks, inspect the registry's **Role assignment permissions mode**. Microsoft calls out extra source authentication handling for an ABAC-enabled source registry (`--source-acr-auth-id [caller]`).[^acr-build] Determine the exact ACR roles from the actual mode; do not assume legacy `AcrPush` is sufficient for an ABAC-enabled registry. Also verify that ACR Tasks is available in the subscription/region and that the submitted source context does not contain ignored local secrets or data.

## Option B: native Node App Service with ZIP/code deployment

App Service can run a Linux code app on the built-in `NODE|24-lts` runtime.[^node24] A ZIP can contain a prebuilt Next standalone artifact with `server.js`, `.next/static`, `public`, production dependencies, and the other runtime bundles. ZIP deployment requires the ZIP contents at its root rather than inside an extra parent directory.[^zip] The app must listen on the platform-provided `PORT`; a startup command would need to launch the packaged server accordingly.[^node-quickstart]

The topology would require at least two web apps:

- a native Node web app for Next; and
- a separate native Node web app for the voice gateway, because App Service exposes only one HTTP port per app.[^one-port]

App Service supports WebSockets, but WebSockets must be enabled in configuration and the gateway must listen on the provided app port rather than relying on public port 3001.[^app-config] Its public URL would remain `wss://<gateway-app-host>/voice`.

The three long-running workers could be continuous Linux WebJobs. Microsoft currently documents WebJobs support for Linux code apps and continuous jobs, including Node.js scripts.[^webjobs] For Linux apps, the current quickstart requires Always On and `WEBSITE_SKIP_RUNNING_KUDUAGENT=false`.[^webjobs-quickstart] Continuous WebJobs scale with the App Service plan and can run on multiple instances; `WEBJOBS_RUN_ONCE` can restrict execution to one instance.[^webjobs] That coupling is material for these durable workers: scaling the web app must not accidentally duplicate schedulers or external delivery. Separate worker apps/plans or a different managed worker service would restore isolation, but increases design and operational work.

Additional unresolved App Service work includes validating that the repository's packaged Next standalone output runs unchanged under the built-in image; defining atomic ZIP and separately deployed WebJob packaging; proving shutdown behavior and heartbeat monitoring; confirming writable paths; replacing Container Apps probes and identity/Key Vault configuration; and redesigning Bicep. Run-from-package also makes the app content read-only and requires WebJobs to be deployed separately.[^run-package] None of this has hosted evidence in this repository. Native App Service is therefore a possible future container-free design, not the recommended shortcut for this deployment.

## Management identity and least-privilege access

For the exact browser-only setup selected for this project, including the user's requested subscription-wide operations, follow [Azure access setup](azure-access-setup.md). The resource-group-only Contributor pattern below is the narrower alternative when subscription-wide provisioning is not required; it does not supersede the explicitly selected grant-subscription Contributor assignment in that guide.

An inference API key is data-plane authority for calling the existing AI deployment. It cannot create ACR, Container Apps, databases, identities, Key Vaults, role assignments, or model deployments. Azure resource provisioning needs a Microsoft Entra identity plus Azure Resource Manager RBAC.

Keep three authorities distinct:

1. **Human bootstrap identity.** Use the personal/startup account that owns or administers the Founders Hub subscription. Confirm the portal directory and subscription ID before every bootstrap session. Do not invite or authenticate the employer account, and do not seek employer tenant/global administrator access. Microsoft says the current Startups offer uses an eligible personal Microsoft account rather than a work or school account.[^startup-account]
2. **Deployment identity.** Create a dedicated service principal or workload identity for this application/deployment boundary, not a credential with tenant-wide or employer-wide access. For a local/manual first deployment, interactive Cloud Shell under the startup account avoids leaving a long-lived client secret on the laptop. For GitHub automation, Microsoft recommends workload identity federation rather than long-lived secrets.[^startup-credits]
3. **Runtime identity.** Use the existing user-assigned managed identity for ACR pull and only the selected Key Vault secrets. The runtime does not need Contributor, Owner, or subscription-wide access.

### Recommended scopes

Grant the deployment identity **Contributor on the dedicated project resource group**. Contributor can create and manage resources in that group but cannot create Azure RBAC role assignments; Microsoft explicitly distinguishes it from Owner and recommends the smallest useful scope.[^rbac-steps]

Handle the few required role assignments in one of these ways, in preference order:

1. The human bootstrap identity creates the managed identity's narrowly scoped ACR-pull and Key Vault secret-read assignments, then the deployment identity remains only Resource Group Contributor. This fits the current Bicep, which consumes an already-authorized identity and declares no role assignments.
2. If infrastructure automation must create role assignments, add **Role Based Access Control Administrator at the project resource-group scope**, ideally with an Azure RBAC delegation condition restricting which roles and principal types it can assign. Remove that privileged assignment after bootstrap if it is not continuously needed. Role Based Access Control Administrator has `roleAssignments/write`; Contributor does not.[^rbac-steps] Unconditioned RBAC Administrator or Owner can enable privilege escalation within its scope, so it should not be treated as an ordinary deployment credential.

Do not grant subscription Owner merely because “whole-account access” is convenient. If the startup truly wants the automation identity to create new resource groups anywhere in this one startup subscription, the wider fallback is **Contributor at subscription scope**, with a human Owner/RBAC Administrator performing access grants. Add subscription-scoped RBAC Administrator only for a reviewed, unavoidable role-assignment workflow. Neither case requires Microsoft Entra Global Administrator, access to the employer tenant, or access to other subscriptions.

### Exact bootstrap pattern (placeholders only; do not paste real secrets into chat or source control)

Run these interactively in Azure Cloud Shell while signed into the startup account. First establish the target, then verify it before creating anything:

```bash
az account list --output table
az account set --subscription '<STARTUP_SUBSCRIPTION_ID>'
az account show --query '{subscription:id,name:name,tenant:tenantId,user:user.name}' --output json
```

The tenant ID must be the startup/personal subscription tenant, and the subscription ID must be the credit-bearing subscription. Stop if either is the employer tenant/subscription.

For a service principal with only project-resource-group management authority, create the resource group first under the human account, then create the identity and assignment:

```bash
az group create --name '<PROJECT_RESOURCE_GROUP>' --location '<AZURE_REGION>'
az ad sp create-for-rbac \
  --name '<DEPLOYMENT_IDENTITY_NAME>' \
  --role Contributor \
  --scopes '/subscriptions/<STARTUP_SUBSCRIPTION_ID>/resourceGroups/<PROJECT_RESOURCE_GROUP>'
```

The command returns a client ID, tenant ID, and client secret once. Microsoft warns that this output contains credentials that must be protected and never committed.[^sp-cli] Prefer creating it in a secure personal environment or immediately placing it in the authorized CI secret store; do not save it in this repository, command history, project context, chat, screenshots, or employer password stores. Record only non-secret IDs in deployment configuration. Rotate or delete the credential after migrating to federation.

Before relying on it, verify assignments without exposing a secret:

```bash
az role assignment list \
  --assignee '<DEPLOYMENT_SERVICE_PRINCIPAL_OBJECT_ID>' \
  --all \
  --query '[].{role:roleDefinitionName,scope:scope}' \
  --output table
```

Expected baseline: `Contributor` at exactly the project resource-group resource ID. Any inherited subscription Owner, broad RBAC Administrator, employer scope, or unrelated resource assignment requires review and removal. If CI uses workload identity federation, create the federated credential for the exact repository/environment/branch subject and do not create a client secret; the Azure resource scope remains the same.

The human bootstrap identity should separately assign the runtime managed identity only the required data access at each resource. For a conventional ACR this ordinarily includes image pull on that registry; ABAC-enabled ACR uses its repository-level roles and must be checked against the registry configuration. Key Vault permissions should cover only `get` (and only `list` if demonstrably needed) for the named secrets or the narrowest supported scope. Database application privileges belong inside PostgreSQL and are not supplied by Azure Contributor.

## Foundry and model permissions

Keep the working API key if key-based inference is the chosen runtime mechanism; store it in Key Vault and expose it only to the runtime identity through the selected secret reference. The key's existence proves only inference access, not management access or available quota.

If the deployment identity must create or update standard Azure OpenAI/Foundry model deployments, assign **Cognitive Services OpenAI Contributor** (classic Azure OpenAI) or the current documented Foundry control-plane role at the **specific AI account**, rather than widening the general deployment identity to subscription Owner. Microsoft documents Cognitive Services OpenAI Contributor as able to write/delete deployments and invoke OpenAI data actions, while it cannot create new Azure OpenAI resources.[^ai-roles] Current Foundry guidance recommends Cognitive Services Contributor on the Foundry account for managed-compute deployment operation, and Foundry User for Entra-authenticated inference.[^foundry-rbac] Which role is correct depends on whether the existing endpoint is a classic Azure OpenAI account, a Foundry resource, and whether it uses standard or managed-compute deployments. Inspect the actual resource type and existing assignments before adding anything.

Creating the AI account itself is a control-plane operation that can be covered by Resource Group Contributor. Calling it through Microsoft Entra ID requires an appropriate data-plane role even when the caller has a control-plane role; an API-key runtime does not gain that authority from Contributor. Existing data-plane roles should be listed and preserved unless the migration explicitly replaces key authentication.

## Costs, grants, and unknowns that must be resolved

Startup credits apply to eligible Azure services billed as standard Azure consumption, while non-Azure products, support plans, Marketplace purchases, and partner/community models may not be covered.[^credit-coverage] Microsoft states that models sold directly by Azure are covered while partner and community models can be billed separately.[^startup-credits] This does not prove that this particular subscription, offer, region, Container Apps usage, ACR Tasks usage, PostgreSQL tier, egress, model/SKU, or quota is covered.

Before the first paid or mutating operation, verify in the startup account:

- the exact credit-bearing subscription ID, offer, remaining balance, expiration, spending behavior, and payment method;
- eligibility of ACR, ACR Tasks, Container Apps, managed PostgreSQL, Key Vault, monitoring/log ingestion, bandwidth, ACS Email, and the exact first-party model/SKU;
- region availability, model quota, Container Apps quota, ACR Tasks availability, and resource-provider registration;
- whether credit exhaustion or expiry converts the subscription to pay-as-you-go (Microsoft says Startup subscriptions can transition to pay-as-you-go);[^startup-activation]
- a budget and alerts before enabling always-on replicas or paid inference; and
- the actual role assignments, policy restrictions, network paths, private endpoints/DNS, and Key Vault/ACR modes.

No command in this note establishes grant coverage. Use Cost Management and the Startups portal/support for the actual subscription, and stop before provisioning if coverage or post-credit billing is unacceptable.

[^acr-build]: [Build a container image on demand in Azure](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-quickstart-task-cli)
[^node24]: [Configure a Node.js app in Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs)
[^zip]: [Deploy files to Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/deploy-zip)
[^node-quickstart]: [Create a Node.js web app in Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs)
[^one-port]: [Configure a custom container for Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/configure-custom-container#configure-port-number)
[^app-config]: [Configure an App Service app](https://learn.microsoft.com/en-us/azure/app-service/configure-common)
[^webjobs]: [App Service WebJobs overview](https://learn.microsoft.com/en-us/azure/app-service/overview-webjobs)
[^webjobs-quickstart]: [Create a scheduled WebJob](https://learn.microsoft.com/en-us/azure/app-service/quickstart-webjobs)
[^run-package]: [Run an App Service app from a ZIP package](https://learn.microsoft.com/en-us/azure/app-service/deploy-run-package)
[^startup-account]: [Microsoft for Startups account and Azure-credit questions](https://learn.microsoft.com/en-us/startups/other)
[^startup-credits]: [Best ways to use startup credits](https://learn.microsoft.com/en-us/startups/benefits/use-azure-credits)
[^rbac-steps]: [Steps to assign an Azure role](https://learn.microsoft.com/en-us/azure/role-based-access-control/role-assignments-steps)
[^sp-cli]: [Azure CLI `az ad sp` reference](https://learn.microsoft.com/en-us/cli/azure/ad/sp?view=azure-cli-latest#az-ad-sp-create-for-rbac)
[^ai-roles]: [Azure built-in roles for AI and machine learning](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/ai-machine-learning)
[^foundry-rbac]: [Role-based access control for Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/concepts/rbac-foundry)
[^credit-coverage]: [Use Microsoft for Startups credits](https://learn.microsoft.com/en-in/microsoft-for-startups/benefits/use-azure-credits)
[^startup-activation]: [Activate Azure credits](https://learn.microsoft.com/en-us/startups/benefits/azure-activation-faqs)
