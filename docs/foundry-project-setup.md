# Existing Foundry project — verified API-key setup

27 September 2026. The user explicitly authorized use of the supplied Azure resource key to create the project's AI setup. No new Azure subscription, Foundry account, resource group, hosted container, public website or database was created.

## What actually worked

- A read-only project request using the existing API key returned HTTP 200 for agent listing; there were no agents before this setup.
- The project's deployments API returned HTTP 200 and listed 16 existing ModelDeployment records. This is inventory evidence, not a claim that every listed model has been invoked or that every publisher is covered by startup credits.
- Created **sales-enabler-company-brain**, **version 1**, kind **prompt**, using the existing **gpt-4.1-mini** deployment. Its nonsecret declaration is `infrastructure/azure/foundry-company-brain.agent.json`.
- One bounded call to its authenticated agent Responses endpoint returned HTTP 200 and `completed`. It asked a clarification question before suggesting a fictional feedback campaign with missing service-use mapping. The receipt reported 404 input tokens, 41 output tokens and 445 total tokens. No external action tool was enabled or invoked.

The endpoint and key remain in ignored local configuration. Local receipts contain sanitized status/usage evidence only; no credentials or raw customer records were used. The new agent is an operator-evaluation foundation. Its existence does not mean the SaaS website is hosted in Azure or that local app requests have been migrated to this agent endpoint.

## Where to find it

Open [Microsoft Foundry](https://ai.azure.com/), select the existing project associated with the supplied project endpoint, select **Build**, then **Agents** in the left navigation, and open **sales-enabler-company-brain**. The existing project is reused; no duplicate project was created. [Microsoft portal navigation](https://learn.microsoft.com/en-us/azure/foundry/how-to/navigate-from-classic)

## Permission distinction

The earlier shorthand that the resource key was “inference only” was too narrow. The current Foundry REST introduction documents API-key authentication for project operations, and this account accepted agent creation. New Azure project creation is a separate ARM operation under `management.azure.com`; subscription hosting, PostgreSQL provisioning, role grants and credit administration still require management authorization. [Foundry API authentication](https://learn.microsoft.com/en-us/azure/foundry/reference/foundry-project), [new-project ARM operation](https://learn.microsoft.com/en-us/rest/api/microsoftfoundry/accountmanagement/projects/create?view=rest-microsoftfoundry-accountmanagement-2025-06-01)

Keep the management identity separate from application runtime credentials. Do not switch paid inference to the other listed models until deployment compatibility, usage and grant eligibility are established. The management access setup remains in `docs/azure-access-setup.md`.
