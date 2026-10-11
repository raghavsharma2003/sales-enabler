import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

const management = parseEnv(readFileSync(process.argv[2] || '.env.azure-management.local', 'utf8'));
const parameters = JSON.parse(readFileSync(process.argv[3] || 'infrastructure/azure/appservice.parameters.local.json', 'utf8')).parameters || {};
const outputPath = resolve(process.argv[4] || 'infrastructure/azure/appservice.cleanup.local.json');
const relative = outputPath.slice(resolve('.').length + 1).replaceAll('\\', '/');
if (spawnSync('git', ['ls-files', '--error-unmatch', '--', relative], { cwd: resolve('.'), stdio: 'ignore' }).status === 0) throw new Error('Cleanup manifest path is tracked.');
if (spawnSync('git', ['check-ignore', '--no-index', '-q', relative], { cwd: resolve('.') }).status !== 0) throw new Error('Cleanup manifest path is not ignored.');
async function request(url, headers, timeout = 30_000) {
  const absoluteUrl = url.startsWith('/') ? `https://management.azure.com${url}` : url;
  const response = await fetch(absoluteUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(timeout) });
  if (!response.ok) { await response.body?.cancel(); return { ok: false, status: response.status, value: {} }; }
  return { ok: true, status: response.status, value: await response.json() };
}
const form = new URLSearchParams({ client_id: management.AZURE_CLIENT_ID, client_secret: management.AZURE_CLIENT_SECRET, grant_type: 'client_credentials', scope: 'https://management.azure.com/.default' });
const tokenResponse = await fetch(`https://login.microsoftonline.com/${management.AZURE_TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(20_000) });
if (!tokenResponse.ok) { await tokenResponse.body?.cancel(); throw new Error('Azure management identity failed.'); }
const token = (await tokenResponse.json()).access_token;
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
const headers = { Authorization: `Bearer ${token}` };
const subscription = `https://management.azure.com/subscriptions/${management.AZURE_SUBSCRIPTION_ID}`;
const group = `${subscription}/resourceGroups/${encodeURIComponent(management.AZURE_RESOURCE_GROUP)}`;
const names = {
  plan: parameters.planName.value, web: parameters.webAppName.value, gateway: parameters.gatewayAppName.value,
  voiceLive: parameters.voiceLiveAppName.value, postgres: parameters.postgresServerName.value,
  vnet: `${parameters.namePrefix.value}-appservice-vnet`, dns: parameters.postgresPrivateDnsZoneName.value,
  dnsLink: `${parameters.namePrefix.value}-appservice-link`, budget: `${parameters.namePrefix.value}-appservice-monthly`,
};
const expectedTags = { product: 'sales-enabler', environment: 'private-beta', architecture: 'native-app-service', managedBy: 'bicep' };
const resourceRequests = {
  plan: [`${group}/providers/Microsoft.Web/serverfarms/${encodeURIComponent(names.plan)}?api-version=2024-11-01`, 'Microsoft.Web/serverfarms'],
  web: [`${group}/providers/Microsoft.Web/sites/${encodeURIComponent(names.web)}?api-version=2025-03-01`, 'Microsoft.Web/sites'],
  gateway: [`${group}/providers/Microsoft.Web/sites/${encodeURIComponent(names.gateway)}?api-version=2025-03-01`, 'Microsoft.Web/sites'],
  voiceLive: [`${group}/providers/Microsoft.Web/sites/${encodeURIComponent(names.voiceLive)}?api-version=2025-03-01`, 'Microsoft.Web/sites'],
  vnet: [`${group}/providers/Microsoft.Network/virtualNetworks/${encodeURIComponent(names.vnet)}?api-version=2025-01-01`, 'Microsoft.Network/virtualNetworks'],
  dns: [`${group}/providers/Microsoft.Network/privateDnsZones/${encodeURIComponent(names.dns)}?api-version=2024-06-01`, 'Microsoft.Network/privateDnsZones'],
  dnsLink: [`${group}/providers/Microsoft.Network/privateDnsZones/${encodeURIComponent(names.dns)}/virtualNetworkLinks/${encodeURIComponent(names.dnsLink)}?api-version=2024-06-01`, 'Microsoft.Network/privateDnsZones/virtualNetworkLinks'],
};
const resources = {};
for (const [key, [url, expectedType]] of Object.entries(resourceRequests)) {
  const result = await request(url, headers);
  if (!result.ok || String(result.value.type).toLowerCase() !== expectedType.toLowerCase() || String(result.value.name).split('/').at(-1) !== names[key]) throw new Error(`Cleanup target ${key} is absent or mismatched.`);
  for (const [tag, expected] of Object.entries(expectedTags)) if (result.value.tags?.[tag] !== expected) throw new Error(`Cleanup target ${key} failed ownership tags.`);
  resources[key] = result.value;
}
const postgres = await request(`${group}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${encodeURIComponent(names.postgres)}?api-version=2025-08-01`, headers);
if (postgres.ok || postgres.status !== 404) throw new Error('PostgreSQL absence is not established.');
const postgresResourceId = `/subscriptions/${management.AZURE_SUBSCRIPTION_ID}/resourceGroups/${management.AZURE_RESOURCE_GROUP}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${names.postgres}`;
const deployment = await request(`${group}/providers/Microsoft.Resources/deployments/sales-enabler-native-private-beta?api-version=2022-09-01`, headers);
const operations = await request(`${group}/providers/Microsoft.Resources/deployments/sales-enabler-native-private-beta/operations?api-version=2022-09-01`, headers);
if (!deployment.ok || deployment.value.properties?.provisioningState !== 'Failed' || !operations.ok) throw new Error('Failed deployment evidence is unavailable.');
const successfulTargets = new Set((operations.value.value || []).filter(item => item.properties?.provisioningState === 'Succeeded').map(item => String(item.properties?.targetResource?.id || '').toLowerCase()));
for (const resource of Object.values(resources)) if (!successfulTargets.has(String(resource.id).toLowerCase()) && !String(resource.type).toLowerCase().endsWith('/virtualnetworklinks')) throw new Error('Cleanup target lacks successful creation evidence in the failed deployment.');
const planApps = await request(`${group}/providers/Microsoft.Web/serverfarms/${encodeURIComponent(names.plan)}/sites?api-version=2025-05-01`, headers);
if (!planApps.ok) throw new Error('Dedicated plan membership is unreadable.');
const expectedAppIds = new Set([resources.web.id, resources.gateway.id, resources.voiceLive.id].map(value => value.toLowerCase()));
const actualAppIds = new Set((planApps.value.value || []).map(item => String(item.id).toLowerCase()));
if (actualAppIds.size !== 3 || [...actualAppIds].some(id => !expectedAppIds.has(id))) throw new Error('Dedicated plan contains an unexpected app.');
const sourceDeploymentCounts = {};
for (const key of ['web', 'gateway', 'voiceLive']) {
  const deployments = await request(`${resources[key].id}/deployments?api-version=2025-05-01`, headers, 45_000);
  if (!deployments.ok) throw new Error(`Source-deployment history for ${key} is unreadable.`);
  sourceDeploymentCounts[key] = (deployments.value.value || []).length;
  if (sourceDeploymentCounts[key] !== 0) throw new Error(`Source deployment exists for ${key}; cleanup requires new review.`);
}
const peerings = await request(`${resources.vnet.id}/virtualNetworkPeerings?api-version=2025-01-01`, headers);
const dnsLinks = await request(`${resources.dns.id}/virtualNetworkLinks?api-version=2024-06-01`, headers);
if (!peerings.ok || (peerings.value.value || []).length !== 0) throw new Error('Owned VNet has unexpected peerings.');
if (!dnsLinks.ok || (dnsLinks.value.value || []).length !== 1 || String(dnsLinks.value.value[0].id).toLowerCase() !== String(resources.dnsLink.id).toLowerCase()) throw new Error('Owned private DNS zone has unexpected links.');
const subnets = resources.vnet.properties?.subnets || [];
if (subnets.length !== 2 || !subnets.every(subnet => ['appservice-integration', 'postgresql'].includes(subnet.name))) throw new Error('Owned VNet subnet inventory drifted.');
const appSubnet = subnets.find(subnet => subnet.name === 'appservice-integration');
const postgresSubnet = subnets.find(subnet => subnet.name === 'postgresql');
const appAssociations = appSubnet.properties?.serviceAssociationLinks || [];
if (appAssociations.length !== 1 || appAssociations[0].properties?.linkedResourceType !== 'Microsoft.Web/serverfarms' || String(appAssociations[0].properties?.link || '').toLowerCase() !== String(resources.plan.id).toLowerCase()) throw new Error('Owned App Service subnet has an unexpected service association.');
if ((postgresSubnet.properties?.serviceAssociationLinks || []).length !== 0) throw new Error('Owned PostgreSQL subnet has an unexpected service association.');
const budget = await request(`${group}/providers/Microsoft.Consumption/budgets/${encodeURIComponent(names.budget)}?api-version=2023-05-01`, headers);
if (!budget.ok || budget.value.properties?.amount !== 150) throw new Error('Reusable resource-group budget is unavailable or drifted.');

const deleteOrder = [
  ...['web', 'gateway', 'voiceLive'].map(key => ({ order: 10, role: key, type: resources[key].type, name: resources[key].name, id: resources[key].id, tags: resources[key].tags, createdAt: resources[key].systemData?.createdAt || null })),
  { order: 20, role: 'plan', type: resources.plan.type, name: resources.plan.name, id: resources.plan.id, tags: resources.plan.tags, createdAt: resources.plan.systemData?.createdAt || null },
  { order: 30, role: 'dnsLink', type: resources.dnsLink.type, name: resources.dnsLink.name, id: resources.dnsLink.id, tags: resources.dnsLink.tags, createdAt: resources.dnsLink.systemData?.createdAt || null },
  { order: 40, role: 'vnet', type: resources.vnet.type, name: resources.vnet.name, id: resources.vnet.id, tags: resources.vnet.tags, createdAt: resources.vnet.systemData?.createdAt || null },
  { order: 50, role: 'dns', type: resources.dns.type, name: resources.dns.name, id: resources.dns.id, tags: resources.dns.tags, createdAt: resources.dns.systemData?.createdAt || null },
];
const manifest = {
  schemaVersion: 1, preparedAt: new Date().toISOString(), subscriptionId: management.AZURE_SUBSCRIPTION_ID,
  tenantId: management.AZURE_TENANT_ID, resourceGroup: management.AZURE_RESOURCE_GROUP,
  deployment: { name: deployment.value.name, state: deployment.value.properties.provisioningState, timestamp: deployment.value.properties.timestamp || null },
  ownership: { expectedTags, createdByObjectId: claims.oid, reviewedWhatIf: { creates: 24, ignores: 36, destructiveOrModify: 0 }, postgresAbsent: true, postgresResourceId, sourceDeploymentCounts, planAppCount: 3, vnetSubnetCount: 2, expectedAppServiceAssociationCount: 1, unexpectedServiceAssociationCount: 0, vnetPeeringCount: 0, dnsLinkCount: 1 },
  retain: [{ type: budget.value.type, name: budget.value.name, id: budget.value.id, reason: 'Reusable resource-group spending alert budget.' }],
  deleteOrder,
  excludedSharedTypes: ['Microsoft.OperationalInsights/workspaces', 'Microsoft.Communication/communicationServices', 'Microsoft.Communication/emailServices', 'Microsoft.CognitiveServices/accounts', 'Microsoft.ContainerRegistry/registries'],
};
const temporary = `${outputPath}.${process.pid}.tmp`;
writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
renameSync(temporary, outputPath);
console.log(JSON.stringify({ ok: true, manifestIgnored: true, deleteTargets: deleteOrder.length, retainedResources: 1, appTargets: 3, sourceDeployments: 0, planUnexpectedApps: 0, vnetPeerings: 0, vnetSubnets: 2, expectedAppServiceAssociations: 1, unexpectedServiceAssociations: 0, dnsLinks: 1, postgresAbsent: true, sharedResourcesIncluded: 0, valuesLogged: false }));
