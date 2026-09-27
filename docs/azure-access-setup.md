# Azure access setup — no local Docker

The employer laptop must not run Docker, Docker Desktop, local image builds or Docker-based development. Use the existing Node preview locally. Build deployment images in Azure ACR Tasks from Cloud Shell or CI; run the services in Azure Container Apps. This still uses containers in Azure, not a Docker engine on the laptop. Native App Service is a separate option described in [hosting options](azure-no-local-docker-options.md). [Microsoft remote-build guide](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-tutorial-quick-task)

## What credential is needed

Create a dedicated **deployment service principal**, an application identity in the startup's Microsoft Entra tenant. It authenticates with a tenant ID, client ID and client secret; Azure roles determine its access. An AI resource key cannot administer the Azure subscription. This deployment credential is separate from customer sign-in, connector OAuth apps and the app's runtime identity. It must never be added to the application `.env.local`, browser code, build context or a runtime container. [Microsoft service-principal overview and setup](https://learn.microsoft.com/en-us/entra/identity-platform/howto-create-service-principal-portal)

## Exact portal steps

1. Open [Azure Portal](https://portal.azure.com/) in a browser profile/private window signed into the **personal/startup account holding the Founders Hub grant**. Select that directory and grant subscription. Do not use the employer directory. Subscription ownership and Entra app-registration permission are different; this setup needs permission to register an application and assign Azure roles.
2. Open **Resource groups → Create**. Select the grant subscription, use the name **sales-enabler-prod**, and choose the region displayed on your existing Foundry resource for the group's metadata location. Create only the group now; hosting, database and other service choices follow account/quota inspection. If this project group already exists, use it.
3. Open **Microsoft Entra ID → App registrations → New registration**. Name it **sales-enabler-deployer**. Select **Accounts in this organizational directory only / Single tenant**. A client-credentials identity needs no redirect URI. Select **Register**. From Overview, copy **Directory (tenant) ID** and **Application (client) ID** into the prepared private file. [App registration guide](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
4. Grant the roles in the table below to **sales-enabler-deployer**. At each listed scope, use **Access control (IAM) → Add → Add role assignment → choose role → Members → User, group, or service principal → Select members → search sales-enabler-deployer → select it → Next**. Verify the application's client ID if names are duplicated. Contributor/Owner may appear under **Privileged administrator roles**. For the **project-group Owner** assignment, on **Conditions**, select **Allow user to assign all roles except privileged administrator roles Owner, UAA, RBAC (Recommended)**, then finish **Review + assign**. This permits normal runtime-role grants without delegating the three privileged administrator roles. If that preset is absent, use the **Allow all except specific roles** condition template and exclude Owner, User Access Administrator and Role Based Access Control Administrator. If Add role assignment is disabled, an owner/access administrator of the startup subscription must complete this step. [Portal role-assignment guide](https://learn.microsoft.com/en-us/azure/role-based-access-control/role-assignments-portal), [delegation conditions](https://learn.microsoft.com/en-us/azure/role-based-access-control/delegate-role-assignments-portal)
5. Return to **App registrations → sales-enabler-deployer → Certificates & secrets → Client secrets → New client secret**. Use a short bootstrap expiry, for example **30 days** through Custom if offered. Copy the **Value**, not the Secret ID, directly into the private file; it is displayed once. Do not replace an existing app's credential or paste this secret into chat. Certificates or workload federation can replace this bootstrap secret later. [Credential instructions](https://learn.microsoft.com/en-us/entra/identity-platform/howto-create-service-principal-portal#option-3-create-a-new-client-secret)
6. In **Subscriptions → your grant subscription → Overview**, confirm its ID matches the private file. Save the file, then tell the agent **“Azure management credentials are ready.”** Do not send the secret itself.

## Roles and their boundaries

| Scope | Role for the deployment identity | Why |
| --- | --- | --- |
| The Founders Hub **grant subscription only** | **Contributor** | The user requested subscription-wide operations. Allows resource management, provider registration and model-deployment inspection without subscription-wide permission administration. If that breadth is unwanted, scope Contributor to the project group instead; a human then handles subscription-level bootstrap. |
| **sales-enabler-prod resource group only** | **Owner**, with the delegation condition above | Allows deployment automation to create the app's managed identities and grant normal runtime roles within this group. It remains privileged inside the group, but cannot delegate Owner, User Access Administrator or RBAC Administrator. It does not grant directory administration. |
| The **existing Foundry resource/account** used by this project | **Foundry Owner**, formerly **Azure AI Owner** | Covers Foundry project development/data operations and model/account management on that resource. This is distinct from generic Azure Owner. Role ID: `c883944f-8b7b-4483-af10-35834be79c4a`. |

Contributor cannot assign Azure roles. Generic Owner provides control-plane administration but does not itself grant Foundry data-plane use. The separate Foundry role matters. No Microsoft Entra Global Administrator or Microsoft Graph directory-wide application permission is requested. The running SaaS will use a narrower managed identity, not this deployment credential. [Azure role definitions](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/privileged), [Foundry roles and rename](https://learn.microsoft.com/en-us/azure/foundry/concepts/rbac-foundry)

Use only this project group's scope for the conditional Owner assignment; do not elevate the identity to subscription Owner to avoid configuring a group. Existing resources outside these scopes may require a separate targeted grant when actually needed. Conditions reduce role delegation, not the Contributor/Owner ability to create, change or delete resources within their allowed scopes.

## Prepared private file and check

Use the repository-root **`.env.azure-management.local`**. It is Git-ignored and excluded from the deployment image context. Keep its quotes around values:

```dotenv
AZURE_TENANT_ID=""
AZURE_CLIENT_ID=""
AZURE_CLIENT_SECRET=""
AZURE_SUBSCRIPTION_ID=""
AZURE_RESOURCE_GROUP="sales-enabler-prod"
```

The private file is prefilled with the subscription ID previously supplied by the user; verify that it is the grant subscription before granting access. No identifier or secret is recorded in this guide or the project context graph.

The agent can run this using the installed Node 24 runtime, with **no Docker or Azure CLI installation**:

```powershell
node scripts/check-azure-access.mjs
```

This obtains a short-lived ARM token and makes only read requests for the subscription, target group and AI-resource inventory. It logs statuses/counts only, not credentials, bearer tokens, endpoints or resource names. Tokens remain in process memory. The test does not create resources, grant permissions or invoke a model. A successful result proves these reads, not write permissions, Foundry inference access, available credit or complete deployment readiness. [Microsoft client-credentials flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow)

After access is confirmed, inspect existing resources, effective scopes, quota, service/region support and credit eligibility before preparing the actual Azure deployment. Subscription access cannot bypass quota, limited-access voice approval, tenant policy, or third-party WhatsApp/Telegram/OAuth ownership. The secret's expiry also remains a real lifecycle boundary.
