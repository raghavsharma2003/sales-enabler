import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { permitsAzureAction } from '../lib/rbac-permissions.mjs';

const apply = process.argv.includes('--apply');
const observe = process.argv.includes('--observe');
if (apply && observe) throw new Error('Observed what-if and deployment apply are separate operations.');
const args = process.argv.filter(value => !['--apply', '--observe'].includes(value));
const management = parseEnv(readFileSync(resolve(args[2] || '.env.azure-management.local'), 'utf8'));
const privateParameters = JSON.parse(readFileSync(resolve(args[3] || 'infrastructure/azure/appservice.parameters.local.json'), 'utf8')).parameters || {};
const secrets = parseEnv(readFileSync(resolve(args[4] || '.env.appservice.local'), 'utf8'));
const template = JSON.parse(readFileSync(resolve(args[5] || process.env.SALES_ENABLER_APPSERVICE_TEMPLATE || ''), 'utf8'));
const secureMap = {
  postgresAdministratorPassword: 'SALES_ENABLER_POSTGRES_ADMIN_PASSWORD', databaseUrl: 'SALES_ENABLER_DATABASE_URL',
  connectorEncryptionKey: 'SALES_ENABLER_CONNECTOR_ENCRYPTION_KEY', authLifecycleKey: 'SALES_ENABLER_AUTH_LIFECYCLE_KEY',
  publicSessionHashSecret: 'SALES_ENABLER_PUBLIC_SESSION_HASH_SECRET', azureOpenAiKey: 'SALES_ENABLER_AZURE_OPENAI_KEY',
  azureSpeechKey: 'SALES_ENABLER_AZURE_SPEECH_KEY', accountEmailAccessKey: 'SALES_ENABLER_ACS_EMAIL_ACCESS_KEY',
};
for (const envName of Object.values(secureMap)) if (!secrets[envName]?.trim()) throw new Error(`Private deployment secret slot is missing: ${envName}.`);
const parameters = { ...privateParameters, ...Object.fromEntries(Object.entries(secureMap).map(([parameter, envName]) => [parameter, { value: secrets[envName] }])) };
if (privateParameters.appServiceSku?.value !== 'B2' || privateParameters.monthlyBudgetUsd?.value !== 150 || privateParameters.inferenceAllowedOrganizationIds?.value !== 'pending-private-beta-activation') throw new Error('Private deployment no longer matches the reviewed B2, USD 150, inference-denied boundary.');
if (!['westus3', 'centralindia'].includes(privateParameters.location?.value)) throw new Error('Private deployment region is outside the reviewed replacement choices.');

async function request(url, options = {}, timeout = 30_000) {
  let response;
  try { response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeout) }); }
  catch { return { ok: false, status: 0, value: {}, headers: new Headers() }; }
  let value = {};
  try { value = await response.json(); } catch { await response.body?.cancel().catch(() => {}); }
  return { ok: response.ok, status: response.status, value, headers: response.headers };
}
const form = new URLSearchParams({ client_id: management.AZURE_CLIENT_ID, client_secret: management.AZURE_CLIENT_SECRET, grant_type: 'client_credentials', scope: 'https://management.azure.com/.default' });
const tokenResult = await request(`https://login.microsoftonline.com/${management.AZURE_TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
if (!tokenResult.ok || !tokenResult.value.access_token) throw new Error('Azure management identity failed.');
const headers = { Authorization: `Bearer ${tokenResult.value.access_token}`, 'Content-Type': 'application/json' };
const subscription = `https://management.azure.com/subscriptions/${management.AZURE_SUBSCRIPTION_ID}`;
const group = `${subscription}/resourceGroups/${encodeURIComponent(management.AZURE_RESOURCE_GROUP)}`;
const [provider, permissions, inventory] = await Promise.all([
  request(`${subscription}/providers/Microsoft.Web?api-version=2021-04-01`, { headers }),
  request(`${group}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`, { headers }),
  request(`${group}/resources?api-version=2021-04-01&$top=1000`, { headers }),
]);
if (provider.value.registrationState !== 'Registered' || !permissions.ok || !inventory.ok) throw new Error('Native hosting preflight read failed.');
const grants = permissions.value.value || [];
const requiredActions = ['Microsoft.Web/serverfarms/write', 'Microsoft.Web/sites/write', 'Microsoft.Web/sites/config/write', 'Microsoft.Web/sites/networkConfig/write', 'Microsoft.Network/virtualNetworks/write', 'Microsoft.DBforPostgreSQL/flexibleServers/write', 'Microsoft.Insights/diagnosticSettings/write', 'Microsoft.Consumption/budgets/write'];
if (requiredActions.some(action => !permitsAzureAction(grants, action))) throw new Error('Native hosting write permission changed; deployment stopped.');
const existing = inventory.value.value || [];
const exactNames = new Set(['planName', 'webAppName', 'gatewayAppName', 'voiceLiveAppName', 'postgresServerName'].map(name => String(privateParameters[name]?.value || '').toLowerCase()));
if (existing.some(item => exactNames.has(String(item.name).toLowerCase()))) throw new Error('A reviewed target name now exists; refusing first-deployment semantics.');

const deploymentName = 'sales-enabler-native-private-beta';
const deploymentUrl = `${group}/providers/Microsoft.Resources/deployments/${deploymentName}`;
const body = { properties: { mode: 'Incremental', template, parameters } };
const validation = await request(`${deploymentUrl}/validate?api-version=2022-09-01`, { method: 'POST', headers, body: JSON.stringify(body) });
if (!validation.ok) throw new Error(`Private deployment validation failed with code ${validation.value.error?.code || 'unknown'}.`);
const whatIfBody = { properties: { ...body.properties, whatIfSettings: { resultFormat: 'ResourceIdOnly' } } };
let whatIf = await request(`${deploymentUrl}/whatIf?api-version=2022-09-01`, { method: 'POST', headers, body: JSON.stringify(whatIfBody) });
let whatIfPoll = whatIf.headers.get('azure-asyncoperation') || whatIf.headers.get('location') || '';
for (let attempt = 0; whatIf.status === 202 && whatIfPoll && attempt < 12; attempt++) {
  await new Promise(resolveTimer => setTimeout(resolveTimer, 2000));
  whatIf = await request(whatIfPoll, { headers });
}
const whatIfProperties = whatIf.value.properties || whatIf.value;
const whatIfError = whatIf.value.error || whatIfProperties.error;
const changes = whatIfProperties.changes || [];
const changeCounts = changes.reduce((counts, change) => ({ ...counts, [change.changeType || 'Unknown']: (counts[change.changeType || 'Unknown'] || 0) + 1 }), {});
if (observe) {
  const state = whatIfProperties.provisioningState || whatIf.value.status || 'unknown';
  const malformedChanges = changes.some(change => typeof change.resourceId !== 'string' || typeof change.changeType !== 'string');
  const budgetId = `${group}/providers/Microsoft.Consumption/budgets/${privateParameters.namePrefix.value}-appservice-monthly`.toLowerCase();
  const deployChanges = changes.filter(change => change.changeType === 'Deploy');
  const invalidChange = changes.some(change => !['Create', 'Ignore', 'Deploy'].includes(change.changeType));
  const retainedBudgetOnly = deployChanges.length === 1 && deployChanges[0].resourceId.toLowerCase() === budgetId;
  const budgetSuffixMatches = deployChanges.length === 1 && deployChanges[0].resourceId.toLowerCase().endsWith(`/providers/microsoft.consumption/budgets/${privateParameters.namePrefix.value.toLowerCase()}-appservice-monthly`);
  if (!whatIf.ok || whatIfError || state !== 'Succeeded' || changes.length === 0 || malformedChanges || invalidChange || !retainedBudgetOnly) throw new Error(`Observed replacement what-if was rejected: status=${whatIf.status}, state=${state}, code=${whatIfError?.code || 'none'}, changeCounts=${JSON.stringify(changeCounts)}, deployCount=${deployChanges.length}, budgetSuffixMatches=${budgetSuffixMatches}, exactBudgetIdMatches=${retainedBudgetOnly}.`);
  function resourceType(resourceId) {
    const segments = resourceId.split('/').filter(Boolean);
    const providerIndex = segments.findIndex(segment => segment.toLowerCase() === 'providers');
    if (providerIndex < 0 || providerIndex + 2 >= segments.length) return 'unknown';
    const provider = segments[providerIndex + 1];
    const types = [];
    for (let index = providerIndex + 2; index < segments.length; index += 2) types.push(segments[index]);
    return `${provider}/${types.join('/')}`;
  }
  const byChangeAndType = changes.reduce((result, change) => {
    const key = `${change.changeType}:${resourceType(change.resourceId)}`;
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
  const reviewPath = resolve('infrastructure/azure/appservice.westus3-review.local.json');
  const review = { schemaVersion: 1, observedAt: new Date().toISOString(), subscriptionId: management.AZURE_SUBSCRIPTION_ID, resourceGroup: management.AZURE_RESOURCE_GROUP, region: privateParameters.location.value, validationStatus: validation.status, whatIfState: state, changeCounts, changes: changes.map(change => ({ changeType: change.changeType, resourceType: resourceType(change.resourceId), resourceId: change.resourceId })), retainedBudgetResourceId: deployChanges[0].resourceId };
  const temporary = `${reviewPath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(review, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  renameSync(temporary, reviewPath);
  console.log(JSON.stringify({ stage: 'observed', validationStatus: validation.status, whatIfState: state, region: privateParameters.location.value, creates: changeCounts.Create || 0, ignores: changeCounts.Ignore || 0, retainedBudgetDeploys: deployChanges.length, destructiveOrModifyChanges: 0, byChangeAndType, expectedFixedBaseUsdMonthly: privateParameters.location.value === 'westus3' ? 40.91 : 48.36, budgetUsdMonthly: 150, inferenceDeniedBySentinel: true, reviewManifestWritten: true, valuesLogged: false }));
  process.exit(0);
}
if (!whatIf.ok || whatIfError || changeCounts.Create !== 24 || changeCounts.Ignore !== 36 || Object.entries(changeCounts).some(([type, count]) => !['Create', 'Ignore'].includes(type) && count > 0)) throw new Error('Private deployment what-if drifted from the reviewed 24-create/36-ignore/no-change plan.');
console.log(JSON.stringify({ stage: 'reviewed', validationStatus: validation.status, whatIfState: whatIfProperties.provisioningState || whatIf.value.status || 'unknown', creates: 24, ignores: 36, destructiveOrModifyChanges: 0, expectedFixedBaseUsdMonthly: 40.91, budgetUsdMonthly: 150, inferenceDeniedBySentinel: true, valuesLogged: false }));
if (!apply) process.exit(0);
if (process.env.SALES_ENABLER_APPLY_PHRASE !== 'APPLY REVIEWED NATIVE HOSTING') throw new Error('Explicit private infrastructure apply phrase is missing.');

const started = Date.now();
const applyResult = await request(`${deploymentUrl}?api-version=2022-09-01`, { method: 'PUT', headers, body: JSON.stringify(body) });
if (!applyResult.ok) throw new Error(`Private infrastructure deployment request failed with code ${applyResult.value.error?.code || 'unknown'}.`);
console.log(JSON.stringify({ stage: 'apply-requested', httpStatus: applyResult.status, deploymentRequests: 1, valuesLogged: false }));
let state = applyResult.value.properties?.provisioningState || 'Accepted';
let lastReported = '';
for (let attempt = 0; attempt < 360 && !['Succeeded', 'Failed', 'Canceled'].includes(state); attempt++) {
  await new Promise(resolveTimer => setTimeout(resolveTimer, 5000));
  const readback = await request(`${deploymentUrl}?api-version=2022-09-01`, { headers });
  if (!readback.ok) continue;
  state = readback.value.properties?.provisioningState || 'unknown';
  if (state !== lastReported || attempt % 6 === 0) {
    console.log(JSON.stringify({ stage: 'deployment-progress', state, elapsedSeconds: Math.floor((Date.now() - started) / 1000), valuesLogged: false }));
    lastReported = state;
  }
}
const operations = await request(`${deploymentUrl}/operations?api-version=2022-09-01`, { headers });
const operationSummary = {};
for (const operation of operations.value.value || []) {
  const type = String(operation.properties?.targetResource?.resourceType || 'unknown').toLowerCase();
  const result = String(operation.properties?.provisioningState || operation.properties?.statusCode || 'unknown');
  const key = `${type}:${result}`;
  operationSummary[key] = (operationSummary[key] || 0) + 1;
}
console.log(JSON.stringify({ stage: 'deployment-complete', state, elapsedSeconds: Math.floor((Date.now() - started) / 1000), operationSummary, sourceDeployed: false, inferenceDeniedBySentinel: true, valuesLogged: false }));
if (state !== 'Succeeded') process.exitCode = 1;
