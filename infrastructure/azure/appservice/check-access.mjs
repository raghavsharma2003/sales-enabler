import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { permitsAzureAction } from '../lib/rbac-permissions.mjs';

async function request(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
  catch { return { ok: false, status: 0 }; }
  if (!response.ok) { await response.body?.cancel(); return { ok: false, status: response.status }; }
  try { return { ok: true, status: response.status, value: await response.json() }; }
  catch { return { ok: false, status: response.status }; }
}

async function main() {
  const settings = parseEnv(readFileSync(process.argv[2] || '.env.azure-management.local', 'utf8'));
  const required = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SUBSCRIPTION_ID', 'AZURE_RESOURCE_GROUP'];
  const missing = required.filter(name => !settings[name]?.trim() || settings[name].includes('REPLACE_WITH'));
  if (missing.length) { console.log(JSON.stringify({ ok: false, stage: 'configuration', missingVariables: missing })); process.exitCode = 1; return; }
  const form = new URLSearchParams({ client_id: settings.AZURE_CLIENT_ID, client_secret: settings.AZURE_CLIENT_SECRET, grant_type: 'client_credentials', scope: 'https://management.azure.com/.default' });
  const tokenResult = await request(`https://login.microsoftonline.com/${settings.AZURE_TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  if (!tokenResult.ok || !tokenResult.value?.access_token) { console.log(JSON.stringify({ ok: false, stage: 'identity', status: tokenResult.status })); process.exitCode = 1; return; }
  const headers = { Authorization: `Bearer ${tokenResult.value.access_token}` };
  const subscription = `https://management.azure.com/subscriptions/${settings.AZURE_SUBSCRIPTION_ID}`;
  const group = `${subscription}/resourceGroups/${encodeURIComponent(settings.AZURE_RESOURCE_GROUP)}`;
  const [provider, groupPermissionsResult, subscriptionPermissionsResult, inventory, usage, skuResult] = await Promise.all([
    request(`${subscription}/providers/Microsoft.Web?api-version=2021-04-01`, { headers }),
    request(`${group}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`, { headers }),
    request(`${subscription}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`, { headers }),
    request(`${group}/resources?api-version=2021-04-01&$top=1000`, { headers }),
    request(`${subscription}/providers/Microsoft.Web/locations/eastus2/usages?api-version=2025-05-01`, { headers }),
    request(`${subscription}/providers/Microsoft.Web/skus?api-version=2025-05-01`, { headers }),
  ]);
  const grants = groupPermissionsResult.value?.value || [], subscriptionGrants = subscriptionPermissionsResult.value?.value || [];
  const actions = {
    planWrite: 'Microsoft.Web/serverfarms/write',
    siteWrite: 'Microsoft.Web/sites/write',
    siteConfigWrite: 'Microsoft.Web/sites/config/write',
    vnetIntegrationWrite: 'Microsoft.Web/sites/networkConfig/write',
    zipDeploy: 'Microsoft.Web/sites/publish/Action',
    networkWrite: 'Microsoft.Network/virtualNetworks/write',
    postgresWrite: 'Microsoft.DBforPostgreSQL/flexibleServers/write',
    budgetWrite: 'Microsoft.Consumption/budgets/write',
  };
  const resources = inventory.value?.value || [];
  const quota = (usage.value?.value || []).map(item => ({ name: item.name?.value || 'unknown', current: item.currentValue ?? null, limit: item.limit ?? null, unit: item.unit || 'unknown' }));
  const candidateSkus = (skuResult.value?.skus || []).filter(item => ['B2', 'B3'].includes(String(item.name).toUpperCase()) && (item.locations || []).some(location => String(location).replace(/\s/g, '').toLowerCase() === 'eastus2')).map(item => ({ name: String(item.name).toUpperCase(), tier: item.tier || 'unknown', minimum: item.capacity?.minimum ?? null, maximum: item.capacity?.maximum ?? null, default: item.capacity?.default ?? null }));
  const permissionMap = Object.fromEntries(Object.entries(actions).map(([name, action]) => [name, permitsAzureAction(grants, action)]));
  const result = {
    ok: provider.ok && inventory.ok && groupPermissionsResult.ok,
    microsoftWeb: { readable: provider.ok, registrationState: provider.value?.registrationState || 'unknown' },
    providerRegistrationPermitted: permitsAzureAction(subscriptionGrants, 'Microsoft.Web/register/action'),
    permissions: permissionMap,
    readyForWhatIf: provider.value?.registrationState === 'Registered' && Object.values(permissionMap).every(Boolean),
    targetGroup: {
      appServicePlans: resources.filter(item => String(item.type).toLowerCase() === 'microsoft.web/serverfarms').length,
      webApps: resources.filter(item => String(item.type).toLowerCase() === 'microsoft.web/sites').length,
    },
    regionalUsage: { readable: usage.ok, status: usage.status, quota },
    candidateSkus: { readable: skuResult.ok, status: skuResult.status, values: candidateSkus },
    mutationsPerformed: false,
    keysRetrieved: false,
  };
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}

main().catch(() => {
  console.error('Native App Service access check failed. No credentials, tokens, endpoints, resource IDs, secret values or raw provider bodies were logged.');
  process.exitCode = 1;
});
