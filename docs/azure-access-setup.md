# Azure access setup — no local Docker

## Current request: new project inside the existing subscription and Foundry resource

The user's latest clarification is to keep the existing grant subscription and add a separate Foundry project under the existing Foundry account. A new subscription, account or resource group is not required for this step. The Cloud Shell bootstrap and project-group Owner setup below were prepared for broader hosting work; do not run them as prerequisites for adding the Foundry project.

Target project name: **sales-enabler** (pending creation). The Company Brain prompt agent already created is inside the original project; it has not been migrated to this new project.

From the other device, the user can add the project directly in Foundry: open the existing project, select **Manage → Resource details → Add project**, confirm the existing account, name it **sales-enabler**, and create it. The new project's **Home** page supplies its project endpoint. Keep the existing default project. [Microsoft existing-resource project instructions](https://learn.microsoft.com/en-us/azure/foundry/how-to/create-projects#create-multiple-projects-on-the-same-resource)

To let the agent create and manage it instead, register **sales-enabler-deployer** as a single-tenant app, assign **Foundry Owner** (formerly **Azure AI Owner**) on the existing Foundry account, and create a 30-day client secret. Provide tenant ID, client ID and client-secret value through the separate ignored management file. Foundry Owner at the account scope permits child project creation and project development; subscription Contributor is not required for that bounded operation. There is no universal Azure master API key that replaces Entra/RBAC management authentication. [Foundry role permissions](https://learn.microsoft.com/en-us/azure/foundry/concepts/rbac-foundry)

The older read-only checker assumes subscription inventory access and a configured resource group. If only account-scoped Foundry Owner is granted, test the exact account/project ARM operation instead of treating failed subscription-wide inventory as invalid credentials. The prepared `AZURE_RESOURCE_GROUP` value is provisional; use the existing account's actual resource group when constructing the project request. Broader website/database deployment permissions remain a separate infrastructure requirement. No new project or management access is claimed until verified.

The employer laptop must not run Docker, Docker Desktop, local image builds or Docker-based development. Use the existing Node preview locally. Build deployment images in Azure ACR Tasks from Cloud Shell or CI; run the services in Azure Container Apps. This still uses containers in Azure, not a Docker engine on the laptop. Native App Service is a separate option described in [hosting options](azure-no-local-docker-options.md). [Microsoft remote-build guide](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-tutorial-quick-task)

## What credential is needed

**Verified correction:** the existing resource API key also supports the Foundry project's agent and deployment APIs. It has been used to list 16 deployments, create the `sales-enabler-company-brain` prompt agent, and obtain a bounded live response. That is useful project access, not Azure subscription administration. This management setup is needed for infrastructure such as hosting, new resource groups, PostgreSQL and IAM; it is not a prerequisite for continuing work inside the existing AI project. See [Foundry project setup evidence](foundry-project-setup.md).

Create a dedicated **deployment service principal**, an application identity in the startup's Microsoft Entra tenant. It authenticates with a tenant ID, client ID and client secret; Azure roles determine its access. An AI resource key cannot administer the Azure subscription. This deployment credential is separate from customer sign-in, connector OAuth apps and the app's runtime identity. It must never be added to the application `.env.local`, browser code, build context or a runtime container. [Microsoft service-principal overview and setup](https://learn.microsoft.com/en-us/entra/identity-platform/howto-create-service-principal-portal)

## Using Azure from another device

The user will access Azure Portal from a different device. Use the manual portal alternative below; it requires no repository access, script upload, local CLI or Docker. Register the same dedicated deployment identity and assign the same three bounded roles. Create the client secret only after role assignments are complete. Store the tenant ID, client ID and secret value in the user's own password manager, then transfer them to the already prepared `.env.azure-management.local` on the working laptop. The subscription ID and resource-group name are already filled there. Never request the secret in chat. No management access is established merely by providing this guide.

For the project group's region, open the existing Foundry account's **Overview** page and note **Location**. At every role assignment, choose **User, group, or service principal** and select the registered application by its name, checking the client ID when there are duplicates. If an Assignment type page appears, applications require **Active**, not Eligible. If **Add role assignment** is disabled, the signed-in startup account lacks the necessary permission; report that exact step rather than creating another identity.

## Shorter setup on a device with this file: Cloud Shell script

Use [bootstrap-access.sh](../infrastructure/azure/bootstrap-access.sh) to automate the role setup below, with the same bounded scopes. It creates only a project resource group and a dedicated app/service principal with a 30-day credential. It does not deploy compute, run a model, use Docker locally, or alter an existing app's password.

1. Sign into [Azure Portal](https://portal.azure.com/) with the startup account. Click the **Cloud Shell** (`>_`) icon in the top toolbar.
2. Choose **Bash**. If first-run setup appears, choose **No storage account required**, select the grant subscription, and click **Apply**. If Microsoft.CloudShell is unregistered, use **Subscriptions → grant subscription → Settings → Resource providers → search cloudshell → Microsoft.CloudShell → Register**, then reopen Cloud Shell. [Microsoft Cloud Shell setup](https://learn.microsoft.com/en-us/azure/cloud-shell/get-started/ephemeral)
3. In Cloud Shell's toolbar, click **Manage files → Upload**. In the Windows file chooser's File name box, paste the absolute path to this repository's `infrastructure\azure\bootstrap-access.sh`, then click **Open**.
4. Paste `bash ~/bootstrap-access.sh` into the terminal and press Enter. Supply the grant subscription ID when prompted. Choose the number beside the existing Foundry resource used by this project; the script derives the group location automatically.
5. Read the displayed subscription, resource and role plan. To grant that exact access, type **APPLY SALES ENABLER ACCESS** and press Enter. This is an Azure access change, not an inference request.
6. When it reports completion, click **Manage files → Download**. Paste the **absolute private credential-file path printed by the script**, then click **Download**. Do this before closing an ephemeral Cloud Shell session. [File upload/download controls](https://learn.microsoft.com/en-us/azure/cloud-shell/use-the-shell-window#manage-files-menu)
7. Tell the agent the credential file is downloaded and give its local path. Do not paste the contents into chat. The read-only checker below accepts that path as its optional argument.

If the script fails, stop and share only its nonsecret error text. It preserves a recovery receipt with the new application's identifiers and refuses to overwrite an earlier output. Do not repeatedly create new identities to work around permission errors. The bootstrap's Azure execution and permission propagation remain unverified until the user runs it in the correct tenant.

Local verification: Bash syntax passed, three mocked bootstrap tests passed (success with propagation retry, declined confirmation, and role-grant failure), four management-checker tests passed, and the project typecheck passed. An independent static review found no blocking issue. These checks do not establish real tenant permissions or successful Azure role propagation.

## Manual portal alternative

1. Open [Azure Portal](https://portal.azure.com/) in a browser profile/private window signed into the **personal/startup account holding the Founders Hub grant**. Select that directory and grant subscription. Do not use the employer directory. Subscription ownership and Entra app-registration permission are different; this setup needs permission to register an application and assign Azure roles.
2. Open **Resource groups → Create**. Select the grant subscription, use the name **sales-enabler-prod**, and choose the region displayed on your existing Foundry resource for the group's metadata location. Create only the group now; hosting, database and other service choices follow account/quota inspection. If this project group already exists, use it.
3. Open **Microsoft Entra ID → App registrations → New registration**. Name it **sales-enabler-deployer**. Select **Accounts in this organizational directory only / Single tenant**. A client-credentials identity needs no redirect URI. Select **Register**. From Overview, copy **Directory (tenant) ID** and **Application (client) ID** into the prepared private file. [App registration guide](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
4. Grant the roles in the table below to **sales-enabler-deployer**. At each listed scope, use **Access control (IAM) → Add → Add role assignment → choose role → Members → User, group, or service principal → Select members → search sales-enabler-deployer → select it → Select → Next**. Verify the application's client ID if names are duplicated. Contributor/Owner appear under **Privileged administrator roles**. For the **project-group Owner** assignment, on **Conditions**, choose **Allow user to only assign selected roles to selected principals (fewer privileges) → Select roles and principals → Allow all except specific roles → Configure**. Exclude **Owner**, **User Access Administrator** and **Role Based Access Control Administrator**, then **Save → Review + assign**. This permits normal runtime-role grants without delegating the three privileged administrator roles. If Add role assignment is disabled, an owner/access administrator of the startup subscription must complete this step. [Portal role-assignment guide](https://learn.microsoft.com/en-us/azure/role-based-access-control/role-assignments-portal), [delegation conditions](https://learn.microsoft.com/en-us/azure/role-based-access-control/delegate-role-assignments-portal)
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
