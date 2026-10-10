import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { permitsAzureAction } from './lib/rbac-permissions.mjs';

const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REQUIRED = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SUBSCRIPTION_ID', 'AZURE_RESOURCE_GROUP'];

async function requestJson(url, options = {}, maximum = 1_048_576) {
  let response;
  try { response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
  catch { return { ok: false, status: 0 }; }
  if (!response.ok) { await response.body?.cancel(); return { ok: false, status: response.status }; }
  const reader = response.body?.getReader();
  if (!reader) return { ok: false, status: response.status };
  const chunks = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) { await reader.cancel(); return { ok: false, status: response.status }; }
      chunks.push(part.value);
    }
    return { ok: true, status: response.status, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch { await reader.cancel().catch(() => {}); return { ok: false, status: response.status }; }
}

const lower = value => String(value || '').toLowerCase();

async function main() {
  if (process.argv.length > 4) throw new Error();
  const credentialPath = resolve(process.argv[2] || '.env.azure-management.local');
  const parameterArgument = process.argv[3] || 'infrastructure/azure/prerequisites.parameters.local.json';
  const discoverMode = parameterArgument === '--discover';
  const parameterPath = discoverMode ? '' : resolve(parameterArgument);
  const settings = parseEnv(readFileSync(credentialPath, 'utf8'));
  const missing = REQUIRED.filter(key => !settings[key]?.trim() || settings[key].includes('REPLACE_WITH'));
  const invalid = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_SUBSCRIPTION_ID'].filter(key => !missing.includes(key) && !GUID.test(settings[key]));
  if (missing.length || invalid.length) {
    console.log(JSON.stringify({ ok: false, stage: 'configuration', missingVariables: missing, invalidVariables: invalid }));
    process.exitCode = 1; return;
  }
  const parameters = discoverMode ? {
    namePrefix: { value: 'sales-enabler-beta' },
    registryName: { value: '__discover_single_registry__' },
    logAnalyticsWorkspaceName: { value: '__discover_single_log_workspace__' },
    keyVaultName: { value: '__discover_target_vault__' },
    postgresServerName: { value: '__discover_target_postgres__' },
  } : JSON.parse(readFileSync(parameterPath, 'utf8')).parameters || {};
  const value = name => parameters[name]?.value;
  const expected = ['namePrefix', 'registryName', 'logAnalyticsWorkspaceName', 'keyVaultName', 'postgresServerName'];
  if (!discoverMode && expected.some(name => typeof value(name) !== 'string' || !value(name) || value(name).includes('REPLACE_WITH'))) {
    console.log(JSON.stringify({ ok: false, stage: 'parameter-configuration', missingParameters: expected.filter(name => typeof value(name) !== 'string' || !value(name) || value(name).includes('REPLACE_WITH')) }));
    process.exitCode = 1; return;
  }

  const tokenResponse = await requestJson(`https://login.microsoftonline.com/${settings.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: settings.AZURE_CLIENT_ID, client_secret: settings.AZURE_CLIENT_SECRET, grant_type: 'client_credentials', scope: 'https://management.azure.com/.default' }).toString(),
  }, 131_072);
  if (!tokenResponse.ok || typeof tokenResponse.value?.access_token !== 'string') {
    console.log(JSON.stringify({ ok: false, stage: 'identity', status: tokenResponse.status })); process.exitCode = 1; return;
  }
  const token = tokenResponse.value.access_token;
  const tokenClaims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const headers = { Authorization: `Bearer ${token}` };
  const subscription = `https://management.azure.com/subscriptions/${settings.AZURE_SUBSCRIPTION_ID}`;
  const group = `${subscription}/resourceGroups/${encodeURIComponent(settings.AZURE_RESOURCE_GROUP)}`;
  const providerNames = ['Microsoft.App', 'Microsoft.ContainerRegistry', 'Microsoft.ManagedIdentity', 'Microsoft.KeyVault', 'Microsoft.DBforPostgreSQL', 'Microsoft.Communication', 'Microsoft.OperationalInsights', 'Microsoft.Insights', 'Microsoft.Consumption', 'Microsoft.Network'];
  const [subscriptionResult, groupResult, inventoryResult, permissionsResult, budgetResult, billingResult, environmentInventoryResult, regionalUsageResult, ...providerResults] = await Promise.all([
    requestJson(`${subscription}?api-version=2022-12-01`, { headers }),
    requestJson(`${group}?api-version=2021-04-01`, { headers }),
    requestJson(`${group}/resources?api-version=2021-04-01&$top=1000`, { headers }),
    requestJson(`${group}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`, { headers }),
    requestJson(`${group}/providers/Microsoft.Consumption/budgets?api-version=2023-05-01`, { headers }),
    requestJson(`${subscription}/providers/Microsoft.Billing/billingProperty/default?api-version=2024-04-01`, { headers }),
    requestJson(`${subscription}/providers/Microsoft.App/managedEnvironments?api-version=2025-07-01`, { headers }),
    requestJson(`${subscription}/providers/Microsoft.App/locations/eastus2/usages?api-version=2024-03-01`, { headers }),
    ...providerNames.map(name => requestJson(`${subscription}/providers/${name}?api-version=2021-04-01`, { headers })),
  ]);
  const resources = inventoryResult.value?.value || [], grants = permissionsResult.value?.value || [];
  const find = (type, name) => resources.find(item => lower(item.type) === lower(type) && lower(item.name) === lower(name));
  const count = type => resources.filter(item => lower(item.type) === lower(type)).length;
  const registries = resources.filter(item => lower(item.type) === 'microsoft.containerregistry/registries');
  const workspaces = resources.filter(item => lower(item.type) === 'microsoft.operationalinsights/workspaces');
  const registryMeta = discoverMode && registries.length === 1 ? registries[0] : find('Microsoft.ContainerRegistry/registries', value('registryName'));
  const logMeta = discoverMode && workspaces.length === 1 ? workspaces[0] : find('Microsoft.OperationalInsights/workspaces', value('logAnalyticsWorkspaceName'));
  const registryResult = registryMeta ? await requestJson(`https://management.azure.com${registryMeta.id}?api-version=2025-11-01`, { headers }) : { ok: false, status: 404 };
  const registryScope = registryMeta ? `https://management.azure.com${registryMeta.id}` : '';
  const registryPermissions = registryMeta ? await requestJson(`${registryScope}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`, { headers }) : { ok: false, status: 404 };
  const registryGrants = registryPermissions.value?.value || [];

  const emailDomains = resources.filter(item => lower(item.type) === 'microsoft.communication/emailservices/domains');
  let senderCount = 0, senderReadable = emailDomains.length > 0;
  for (const domain of emailDomains) {
    const senders = await requestJson(`https://management.azure.com${domain.id}/senderUsernames?api-version=2023-03-31`, { headers });
    if (!senders.ok) senderReadable = false;
    else senderCount += Array.isArray(senders.value?.value) ? senders.value.value.length : 0;
  }

  let creditSummary = { attempted: false, readable: false, status: null };
  const billing = billingResult.value?.properties || {};
  const billingAccount = typeof billing.billingAccountId === 'string' ? billing.billingAccountId.split('/').filter(Boolean).at(-1) : '';
  const billingProfile = typeof billing.billingProfileId === 'string' ? billing.billingProfileId.split('/').filter(Boolean).at(-1) : '';
  if (billingResult.ok && billingAccount && billingProfile) {
    const credit = await requestJson(`https://management.azure.com/providers/Microsoft.Billing/billingAccounts/${encodeURIComponent(billingAccount)}/billingProfiles/${encodeURIComponent(billingProfile)}/providers/Microsoft.Consumption/credits/balanceSummary?api-version=2026-06-01`, { headers });
    creditSummary = { attempted: true, readable: credit.ok, status: credit.status };
  }

  const providerRegistration = Object.fromEntries(providerNames.map((name, index) => [name, providerResults[index].value?.registrationState || 'unreadable']));
  const requiredGroupActions = {
    virtualNetworkWrite: 'Microsoft.Network/virtualNetworks/write',
    privateDnsWrite: 'Microsoft.Network/privateDnsZones/write',
    containerEnvironmentWrite: 'Microsoft.App/managedEnvironments/write',
    managedIdentityWrite: 'Microsoft.ManagedIdentity/userAssignedIdentities/write',
    keyVaultWrite: 'Microsoft.KeyVault/vaults/write',
    postgresWrite: 'Microsoft.DBforPostgreSQL/flexibleServers/write',
    diagnosticSettingsWrite: 'Microsoft.Insights/diagnosticSettings/write',
    budgetWrite: 'Microsoft.Consumption/budgets/write',
    roleAssignmentWrite: 'Microsoft.Authorization/roleAssignments/write',
    lockWrite: 'Microsoft.Authorization/locks/write',
  };
  const groupPermissions = Object.fromEntries(Object.entries(requiredGroupActions).map(([key, action]) => [key, permitsAzureAction(grants, action)]));
  const foundationPermissionKeys = ['virtualNetworkWrite', 'privateDnsWrite', 'containerEnvironmentWrite', 'managedIdentityWrite', 'keyVaultWrite', 'postgresWrite', 'diagnosticSettingsWrite', 'budgetWrite'];
  const regionalEnvironmentQuota = (regionalUsageResult.value?.value || []).find(item => item.name?.value === 'ManagedEnvironmentCount');
  const remoteBuild = {
    registryMode: registryResult.value?.properties?.roleAssignmentMode || 'unknown',
    taskControl: permitsAzureAction(registryGrants, 'Microsoft.ContainerRegistry/registries/scheduleRun/action') && permitsAzureAction(registryGrants, 'Microsoft.ContainerRegistry/registries/listBuildSourceUploadUrl/action'),
    repositoryRead: permitsAzureAction(registryGrants, 'Microsoft.ContainerRegistry/registries/repositories/content/read', true),
    repositoryWrite: permitsAzureAction(registryGrants, 'Microsoft.ContainerRegistry/registries/repositories/content/write', true),
  };
  const targetPrefix = lower(value('namePrefix'));
  const targetApps = resources.filter(item => ['microsoft.app/containerapps', 'microsoft.app/jobs'].includes(lower(item.type)) && lower(item.name).startsWith(targetPrefix)).length;
  const targetEnvironment = find('Microsoft.App/managedEnvironments', `${value('namePrefix')}-env`);
  const targetIdentity = find('Microsoft.ManagedIdentity/userAssignedIdentities', `${value('namePrefix')}-runtime`);
  const targetVault = discoverMode ? resources.find(item => lower(item.type) === 'microsoft.keyvault/vaults' && lower(item.name).startsWith(targetPrefix)) : find('Microsoft.KeyVault/vaults', value('keyVaultName'));
  const targetPostgres = discoverMode ? resources.find(item => lower(item.type) === 'microsoft.dbforpostgresql/flexibleservers' && lower(item.name).startsWith(targetPrefix)) : find('Microsoft.DBforPostgreSQL/flexibleServers', value('postgresServerName'));
  const identityResult = targetIdentity ? await requestJson(`https://management.azure.com${targetIdentity.id}?api-version=2024-11-30`, { headers }) : { ok: false, status: 404 };
  const runtimePrincipalId = identityResult.value?.properties?.principalId;
  async function assignedRoleIds(scope, principalId) {
    if (!scope?.id || !GUID.test(principalId || '')) return [];
    const assignments = await requestJson(`https://management.azure.com${scope.id}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&$filter=${encodeURIComponent(`principalId eq '${principalId}'`)}`, { headers });
    return (assignments.value?.value || []).map(item => lower(item.properties?.roleDefinitionId).split('/').filter(Boolean).at(-1));
  }
  const [runtimeRegistryRoles, runtimeVaultRoles, deployerRegistryRoles, deployerVaultRoles] = await Promise.all([
    assignedRoleIds(registryMeta, runtimePrincipalId),
    assignedRoleIds(targetVault, runtimePrincipalId),
    assignedRoleIds(registryMeta, tokenClaims.oid),
    assignedRoleIds(targetVault, tokenClaims.oid),
  ]);
  const legacyAcrPull = '7f951dda-4ed3-4680-a7ca-43fe172d538d', legacyAcrPush = '8311e382-0749-4cb8-b61a-304f252e45ec';
  const secretsUser = '4633458b-17de-408a-b874-0445c86b69e6', secretsOfficer = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7';
  const result = {
    ok: subscriptionResult.ok && subscriptionResult.value?.state === 'Enabled' && groupResult.ok && inventoryResult.ok && permissionsResult.ok && Object.values(providerRegistration).every(state => state === 'Registered'),
    subscription: { readable: subscriptionResult.ok, state: subscriptionResult.value?.state || 'unknown' },
    projectResourceGroup: { readable: groupResult.ok },
    providerRegistration,
    groupPermissions,
    permissionSummary: {
      foundationWriteReady: foundationPermissionKeys.every(key => groupPermissions[key]),
      governanceWriteReady: groupPermissions.roleAssignmentWrite && groupPermissions.lockWrite,
    },
    shared: {
      registry: { present: Boolean(registryMeta), readable: registryResult.ok, sku: registryResult.value?.sku?.name || 'unknown', roleAssignmentMode: remoteBuild.registryMode },
      logAnalytics: { present: Boolean(logMeta) },
      email: { communicationServices: count('Microsoft.Communication/communicationServices'), emailServices: count('Microsoft.Communication/emailServices'), domains: emailDomains.length, senderInventoryReadable: senderReadable, senderCount },
    },
    remoteBuild: { ...remoteBuild, readyBeforeRoleBootstrap: remoteBuild.taskControl && remoteBuild.repositoryWrite, requiredBuildRole: remoteBuild.registryMode === 'LegacyRegistryPermissions' ? 'AcrPush' : 'Container Registry Repository Writer' },
    target: {
      appsOrJobsPresent: targetApps,
      environmentPresent: Boolean(targetEnvironment),
      identityPresent: Boolean(targetIdentity),
      keyVaultPresent: Boolean(targetVault),
      postgresPresent: Boolean(targetPostgres),
    },
    environmentQuota: {
      subscriptionEnvironmentCount: Array.isArray(environmentInventoryResult.value?.value) ? environmentInventoryResult.value.value.length : null,
      eastUs2Current: regionalEnvironmentQuota?.currentValue ?? null,
      eastUs2Limit: regionalEnvironmentQuota?.limit ?? null,
    },
    roleBootstrap: {
      runtimeRegistryRole: remoteBuild.registryMode === 'LegacyRegistryPermissions' ? 'AcrPull' : 'Container Registry Repository Reader',
      runtimeVaultRole: 'Key Vault Secrets User',
      deployerVaultRole: 'Key Vault Secrets Officer',
      assigned: {
        runtimeRegistryPull: targetIdentity ? runtimeRegistryRoles.includes(legacyAcrPull) : null,
        runtimeVaultRead: targetIdentity && targetVault ? runtimeVaultRoles.includes(secretsUser) : null,
        deployerRegistryPush: deployerRegistryRoles.includes(legacyAcrPush),
        deployerVaultWrite: targetVault ? deployerVaultRoles.includes(secretsOfficer) : null,
      },
    },
    budgets: { readable: budgetResult.ok, count: Array.isArray(budgetResult.value?.value) ? budgetResult.value.value.length : null },
    creditSummary,
    mutationsPerformed: false,
    keysRetrieved: false,
  };
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}

main().catch(() => {
  console.error('Hosted access check could not complete. No credentials, tokens, endpoints, resource IDs, keys or provider response bodies were logged.');
  process.exitCode = 1;
});
