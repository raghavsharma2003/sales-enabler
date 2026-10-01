# New Foundry project — 1 October 2026

The user supplied the missing deployment identity values and explicitly authorized continuing in the same subscription and existing Foundry account. Values were written only to ignored private configuration. The object ID and secret ID were not used as authentication credentials.

## Verified cloud action

- Entra client-credentials authentication succeeded. Exact existing-account inspection returned HTTP 200 and a ready AIServices account with project management enabled.
- The target **sales-enabler** project initially returned 404. Exactly one child-project PUT was issued, returning 201.
- Azure returned the child name in `account/project` form. The original helper rejected that shape and reported an uncertain result instead of retrying. A separate GET confirmed the exact resource ID, system-assigned identity and **Succeeded** provisioning state.
- The helper now accepts only the expected bare child name or expected account-qualified name. Eleven offline tests passed, and a final read-only invocation confirmed the project is ready without another PUT.
- The existing resource region is **eastus2**. The account's configured project origin matched its ARM metadata. This identifies the resource location; it does not establish Personal Voice eligibility, quota or grant coverage for every service.
- Local project-administration configuration now points to the new project. The original project and original Company Brain agent were not deleted or modified.

Sanitized readback receipts are retained under ignored `data/azure-foundry/`. Resource identifiers, endpoints, credentials and bearer tokens are not copied into context or committed artifacts.

## Access boundary and unresolved agent setup

**Later Contributor verification:** after the user added the role, the exact group and subscription reads returned 200. App and database creation actions are present at group scope; role-assignment writes are excluded. Subscription-level permissions list is empty. PostgreSQL/Web/Communication providers are not registered. The billing-property read is 403 and spendingLimit is Off, leaving grant balance and expiry unverified. See the hosting plan; no billable infrastructure was created.

The identity can read/manage the existing AI account and its child project. Reading the existing resource group returned **403**. The group resource list returned a filtered inventory of accessible AI resources; this is not proof that no other resources exist. The user was asked to assign **Contributor on the existing resource group** to the deployment app for subsequent website/database provisioning. No new subscription or group was requested. Arbitrary role grants, quota, credit coverage and production hosting remain separate checks.

Foundry agent-list reads succeeded, including an empty agent list in the new project. Other data-plane reads then failed intermittently with transport timeouts, using both Node and Windows' HTTPS client. One Company Brain agent creation attempt through the Windows client ended without a definitive response; its subsequent readback also failed. **That agent creation is unresolved, not verified successful or verified failed.** Do not issue another creation POST until a successful read reconciles the fixed agent name. No successful new-project inference call is claimed.

No TLS verification, firewall, proxy or account network controls were disabled or changed. The management-plane project creation is proven independently of the data-plane connectivity problem.

## Next steps

1. Reconcile the new project's fixed Company Brain agent by read-only GET when its API is reachable; only create if absence is confirmed.
2. Once the additional group role is present, inspect hosting/database permissions and prepare the Azure deployment with cost and service-availability evidence.
3. Continue local voice evidence, source-port and quality work independently. The new Foundry project is not a hosted SaaS website or customer database.

References: [project creation API](https://learn.microsoft.com/en-us/rest/api/microsoftfoundry/accountmanagement/projects/create?view=rest-microsoftfoundry-accountmanagement-2025-06-01), [prompt-agent API flow](https://learn.microsoft.com/en-us/azure/foundry/agents/quickstarts/prompt-agent).
