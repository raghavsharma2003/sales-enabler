import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { permitsAzureAction } from '../lib/rbac-permissions.mjs';

const execute = process.argv.includes('--execute');
const resumeAfterApps = process.argv.includes('--resume-after-apps');
const args = process.argv.filter(value => !['--execute', '--resume-after-apps'].includes(value));
const management = parseEnv(readFileSync(resolve(args[2] || '.env.azure-management.local'), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(args[3] || 'infrastructure/azure/appservice.cleanup.local.json'), 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.subscriptionId !== management.AZURE_SUBSCRIPTION_ID || manifest.tenantId !== management.AZURE_TENANT_ID || manifest.resourceGroup !== management.AZURE_RESOURCE_GROUP) throw new Error('Cleanup manifest escaped the reviewed subscription, tenant, or resource group.');
if (!Array.isArray(manifest.deleteOrder) || manifest.deleteOrder.length !== 7 || manifest.retain?.length !== 1) throw new Error('Cleanup manifest target count drifted.');
const expectedRoles = ['web', 'gateway', 'voiceLive', 'plan', 'dnsLink', 'vnet', 'dns'];
if (new Set(manifest.deleteOrder.map(item => item.role)).size !== 7 || expectedRoles.some(role => !manifest.deleteOrder.some(item => item.role === role))) throw new Error('Cleanup manifest roles drifted.');
const groupPrefix = `/subscriptions/${management.AZURE_SUBSCRIPTION_ID}/resourceGroups/${management.AZURE_RESOURCE_GROUP}/`.toLowerCase();
if (manifest.deleteOrder.some(item => !String(item.id).toLowerCase().startsWith(groupPrefix))) throw new Error('Cleanup target escaped the reviewed resource group.');
const expectedTags = manifest.ownership?.expectedTags || {};
for (const item of manifest.deleteOrder) for (const [name, value] of Object.entries(expectedTags)) if (item.tags?.[name] !== value) throw new Error('Cleanup manifest ownership tags drifted.');

async function request(url, options = {}, timeout = 45_000) {
  let response;
  try { response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeout) }); }
  catch { return { ok: false, status: 0, value: {}, headers: new Headers() }; }
  let value = {}, jsonParsed = false;
  try { value = await response.json(); jsonParsed = true; } catch { await response.body?.cancel().catch(() => {}); }
  return { ok: response.ok, status: response.status, value, headers: response.headers, jsonParsed };
}
function requireCompleteCollection(result, label) {
  if (!result.ok || !result.jsonParsed || !Array.isArray(result.value.value) || result.value.nextLink) throw new Error(`${label} collection is unreadable, malformed, or paginated.`);
  return result.value.value;
}
const form = new URLSearchParams({ client_id: management.AZURE_CLIENT_ID, client_secret: management.AZURE_CLIENT_SECRET, grant_type: 'client_credentials', scope: 'https://management.azure.com/.default' });
const tokenResult = await request(`https://login.microsoftonline.com/${management.AZURE_TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
if (!tokenResult.ok || !tokenResult.value.access_token) throw new Error('Azure management identity failed.');
const token = tokenResult.value.access_token;
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
if (claims.tid !== manifest.tenantId) throw new Error('Azure token tenant differs from the cleanup manifest.');
const headers = { Authorization: `Bearer ${token}` };
const subscription = `https://management.azure.com/subscriptions/${management.AZURE_SUBSCRIPTION_ID}`;
const group = `${subscription}/resourceGroups/${encodeURIComponent(management.AZURE_RESOURCE_GROUP)}`;
const permissions = await request(`${group}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`, { headers });
const requiredDeletes = ['Microsoft.Web/sites/delete', 'Microsoft.Web/serverfarms/delete', 'Microsoft.Network/virtualNetworks/delete', 'Microsoft.Network/privateDnsZones/delete', 'Microsoft.Network/privateDnsZones/virtualNetworkLinks/delete'];
if (!permissions.ok || requiredDeletes.some(action => !permitsAzureAction(permissions.value.value || [], action))) throw new Error('Cleanup delete permission is incomplete.');
const apiVersions = {
  'microsoft.web/sites': '2025-03-01', 'microsoft.web/serverfarms': '2024-11-01',
  'microsoft.network/privatednszones/virtualnetworklinks': '2024-06-01', 'microsoft.network/virtualnetworks': '2025-01-01',
  'microsoft.network/privatednszones': '2024-06-01',
};
const byRole = Object.fromEntries(manifest.deleteOrder.map(item => [item.role, item]));
async function readTarget(item) {
  return request(`https://management.azure.com${item.id}?api-version=${apiVersions[String(item.type).toLowerCase()]}`, { headers });
}
for (const item of manifest.deleteOrder) {
  const current = await readTarget(item);
  if (resumeAfterApps && ['web', 'gateway', 'voiceLive'].includes(item.role)) {
    if (current.status !== 404) throw new Error(`Resume requires ${item.role} to remain absent.`);
    continue;
  }
  if (!current.ok || String(current.value.id).toLowerCase() !== String(item.id).toLowerCase() || String(current.value.type).toLowerCase() !== String(item.type).toLowerCase()) throw new Error(`Cleanup target ${item.role} is absent or changed.`);
  for (const [name, value] of Object.entries(expectedTags)) if (current.value.tags?.[name] !== value) throw new Error(`Cleanup target ${item.role} ownership changed.`);
}
const planSites = await request(`https://management.azure.com${byRole.plan.id}/sites?api-version=2025-05-01`, { headers });
const expectedSiteIds = new Set(['web', 'gateway', 'voiceLive'].map(role => String(byRole[role].id).toLowerCase()));
const actualSiteIds = new Set(requireCompleteCollection(planSites, 'Dedicated plan apps').map(item => String(item.id).toLowerCase()));
if (resumeAfterApps) {
  if (actualSiteIds.size !== 0) throw new Error('Resume requires the dedicated plan to contain no apps.');
  if (!['web', 'gateway', 'voiceLive'].every(role => manifest.ownership?.sourceDeploymentCounts?.[role] === 0)) throw new Error('Reviewed zero-source manifest evidence is missing.');
} else {
  if (actualSiteIds.size !== 3 || [...actualSiteIds].some(id => !expectedSiteIds.has(id))) throw new Error('Dedicated plan membership changed.');
  for (const role of ['web', 'gateway', 'voiceLive']) {
    const deployments = await request(`https://management.azure.com${byRole[role].id}/deployments?api-version=2025-05-01`, { headers });
    if (requireCompleteCollection(deployments, `${role} source deployments`).length !== 0) throw new Error(`Source deployment appeared on ${role}; cleanup stopped.`);
  }
}
if (manifest.ownership.postgresAbsent !== true || !String(manifest.ownership.postgresResourceId || '').toLowerCase().startsWith(groupPrefix)) throw new Error('PostgreSQL absence evidence is missing or out of scope.');
const postgres = await request(`https://management.azure.com${manifest.ownership.postgresResourceId}?api-version=2025-08-01`, { headers });
if (postgres.status !== 404) throw new Error('PostgreSQL now exists; cleanup stopped for new review.');
const peerings = await request(`https://management.azure.com${byRole.vnet.id}/virtualNetworkPeerings?api-version=2025-01-01`, { headers });
const dnsLinks = await request(`https://management.azure.com${byRole.dns.id}/virtualNetworkLinks?api-version=2024-06-01`, { headers });
if (requireCompleteCollection(peerings, 'VNet peerings').length !== 0) throw new Error('Network ownership changed.');
const currentDnsLinks = requireCompleteCollection(dnsLinks, 'Private DNS links');
if (currentDnsLinks.length !== 1 || String(currentDnsLinks[0].id).toLowerCase() !== String(byRole.dnsLink.id).toLowerCase()) throw new Error('DNS ownership changed.');
const vnet = await readTarget(byRole.vnet);
const subnets = vnet.value.properties?.subnets || [];
if (subnets.length !== 2 || !subnets.every(subnet => ['appservice-integration', 'postgresql'].includes(subnet.name))) throw new Error('VNet subnet inventory changed.');
const associations = subnets.flatMap(subnet => subnet.properties?.serviceAssociationLinks || []);
if (associations.length > 1 || (associations.length === 1 && String(associations[0].properties?.link || '').toLowerCase() !== String(byRole.plan.id).toLowerCase())) throw new Error('VNet service association changed.');
const budget = await request(`https://management.azure.com${manifest.retain[0].id}?api-version=2023-05-01`, { headers });
if (!budget.ok || budget.value.properties?.amount !== 150) throw new Error('Retained budget is absent or changed.');
const sharedBefore = await request(`${group}/resources?api-version=2021-04-01&$top=1000`, { headers });
const sharedTypes = new Set(manifest.excludedSharedTypes.map(type => type.toLowerCase()));
const sharedCountsBefore = {};
for (const item of requireCompleteCollection(sharedBefore, 'Resource-group inventory')) if (sharedTypes.has(String(item.type).toLowerCase())) sharedCountsBefore[String(item.type).toLowerCase()] = (sharedCountsBefore[String(item.type).toLowerCase()] || 0) + 1;
console.log(JSON.stringify({ stage: 'cleanup-preflight', resumeAfterApps, targetCount: 7, appTargets: 3, sourceDeployments: 0, unexpectedPlanApps: 0, vnetPeerings: 0, expectedOrReleasedServiceAssociations: associations.length, dnsLinks: 1, postgresAbsent: true, budgetRetained: true, sharedResourceTargets: 0, valuesLogged: false }));
if (!execute) process.exit(0);
if (process.env.SALES_ENABLER_DELETE_PHRASE !== 'DELETE REVIEWED EMPTY APPSERVICE PARTIAL') throw new Error('Explicit reviewed cleanup phrase is missing.');

async function deleteAndConfirm(item) {
  const type = String(item.type).toLowerCase();
  const suffix = type === 'microsoft.web/sites' ? '&deleteMetrics=false&deleteEmptyServerFarm=false' : '';
  const deletion = await request(`https://management.azure.com${item.id}?api-version=${apiVersions[type]}${suffix}`, { method: 'DELETE', headers });
  if (!deletion.ok && deletion.status !== 404) throw new Error(`Cleanup deletion failed for ${item.role} with HTTP ${deletion.status}.`);
  for (let attempt = 0; attempt < 90; attempt++) {
    const readback = await readTarget(item);
    if (readback.status === 404) return;
    await new Promise(resolveTimer => setTimeout(resolveTimer, 2000));
  }
  throw new Error(`Cleanup target ${item.role} did not reach 404.`);
}
if (!resumeAfterApps) for (const role of ['web', 'gateway', 'voiceLive']) await deleteAndConfirm(byRole[role]);
const planAfterApps = await request(`https://management.azure.com${byRole.plan.id}/sites?api-version=2025-05-01`, { headers });
if (requireCompleteCollection(planAfterApps, 'Post-app dedicated plan membership').length !== 0) throw new Error('Dedicated plan still contains apps; plan deletion refused.');
await deleteAndConfirm(byRole.plan);
await deleteAndConfirm(byRole.dnsLink);
for (let attempt = 0; attempt < 90; attempt++) {
  const network = await readTarget(byRole.vnet);
  if (!network.ok || !network.jsonParsed || String(network.value.id).toLowerCase() !== String(byRole.vnet.id).toLowerCase()) {
    if (attempt === 89) throw new Error('Owned VNet became unreadable after plan deletion.');
    await new Promise(resolveTimer => setTimeout(resolveTimer, 2000));
    continue;
  }
  const currentSubnets = network.value.properties?.subnets;
  if (!Array.isArray(currentSubnets) || currentSubnets.length !== 2) throw new Error('Owned VNet subnet inventory became malformed.');
  const links = currentSubnets.flatMap(subnet => subnet.properties?.serviceAssociationLinks || []);
  if (links.length === 0) break;
  if (attempt === 89) throw new Error('App Service subnet association did not clear after owned plan deletion.');
  await new Promise(resolveTimer => setTimeout(resolveTimer, 2000));
}
const finalPeerings = await request(`https://management.azure.com${byRole.vnet.id}/virtualNetworkPeerings?api-version=2025-01-01`, { headers });
const finalDnsLinks = await request(`https://management.azure.com${byRole.dns.id}/virtualNetworkLinks?api-version=2024-06-01`, { headers });
if (requireCompleteCollection(finalPeerings, 'Final VNet peerings').length !== 0 || requireCompleteCollection(finalDnsLinks, 'Final private DNS links').length !== 0) throw new Error('Network dependencies remain after owned plan/link deletion.');
await deleteAndConfirm(byRole.vnet);
await deleteAndConfirm(byRole.dns);
const retainedBudget = await request(`https://management.azure.com${manifest.retain[0].id}?api-version=2023-05-01`, { headers });
const sharedAfter = await request(`${group}/resources?api-version=2021-04-01&$top=1000`, { headers });
const sharedCountsAfter = {};
for (const item of requireCompleteCollection(sharedAfter, 'Final resource-group inventory')) if (sharedTypes.has(String(item.type).toLowerCase())) sharedCountsAfter[String(item.type).toLowerCase()] = (sharedCountsAfter[String(item.type).toLowerCase()] || 0) + 1;
const sharedCountKeys = new Set([...Object.keys(sharedCountsBefore), ...Object.keys(sharedCountsAfter)]);
if (!retainedBudget.ok || [...sharedCountKeys].some(type => (sharedCountsBefore[type] || 0) !== (sharedCountsAfter[type] || 0))) throw new Error('Budget or shared-resource counts changed during cleanup.');
console.log(JSON.stringify({ stage: 'cleanup-complete', deletedTargets: 7, allDeleteReadbacks404: true, budgetRetained: true, sharedResourceCountsUnchanged: true, postgresAbsent: true, valuesLogged: false }));
