import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

const managementPath = resolve(process.argv[2] || '.env.azure-management.local');
const runtimePath = resolve(process.argv[3] || '.env.local');
const parameterPath = resolve('infrastructure/azure/appservice.parameters.local.json');
const secretPath = resolve('.env.appservice.local');
const budgetEmail = process.env.SALES_ENABLER_BUDGET_EMAIL?.trim() || '';
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(budgetEmail)) throw new Error('Set SALES_ENABLER_BUDGET_EMAIL privately before preparing parameters.');
for (const path of [parameterPath, secretPath]) {
  const relative = path.slice(resolve('.').length + 1).replaceAll('\\', '/');
  if (spawnSync('git', ['ls-files', '--error-unmatch', '--', relative], { cwd: resolve('.'), stdio: 'ignore' }).status === 0) throw new Error('Refusing to write private values into a tracked file.');
  if (spawnSync('git', ['check-ignore', '--no-index', '-q', relative], { cwd: resolve('.') }).status !== 0) throw new Error('Private output path is not ignored by Git.');
}

const management = parseEnv(readFileSync(managementPath, 'utf8'));
const runtime = parseEnv(readFileSync(runtimePath, 'utf8'));
const existingSecrets = existsSync(secretPath) ? parseEnv(readFileSync(secretPath, 'utf8')) : {};
const requiredManagement = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SUBSCRIPTION_ID', 'AZURE_RESOURCE_GROUP'];
if (requiredManagement.some(name => !management[name]?.trim())) throw new Error('Management configuration is incomplete.');

async function getJson(url, headers) {
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error('Read-only Azure metadata request failed.'); }
  return response.json();
}
const tokenResponse = await fetch(`https://login.microsoftonline.com/${management.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, redirect: 'error', signal: AbortSignal.timeout(20_000),
  body: new URLSearchParams({ client_id: management.AZURE_CLIENT_ID, client_secret: management.AZURE_CLIENT_SECRET, grant_type: 'client_credentials', scope: 'https://management.azure.com/.default' }),
});
if (!tokenResponse.ok) { await tokenResponse.body?.cancel(); throw new Error('Azure management identity failed.'); }
const headers = { Authorization: `Bearer ${(await tokenResponse.json()).access_token}` };
const group = `https://management.azure.com/subscriptions/${management.AZURE_SUBSCRIPTION_ID}/resourceGroups/${encodeURIComponent(management.AZURE_RESOURCE_GROUP)}`;
const inventory = (await getJson(`${group}/resources?api-version=2021-04-01&$top=1000`, headers)).value || [];
const ofType = type => inventory.filter(item => String(item.type).toLowerCase() === type.toLowerCase());
const workspaces = ofType('Microsoft.OperationalInsights/workspaces');
const communications = ofType('Microsoft.Communication/communicationServices');
const domains = ofType('Microsoft.Communication/emailServices/domains');
if (workspaces.length !== 1 || communications.length !== 1 || domains.length !== 1) throw new Error('Approved shared Log Analytics or ACS inventory is ambiguous.');
const communication = await getJson(`https://management.azure.com${communications[0].id}?api-version=2023-03-31`, headers);
const domain = await getJson(`https://management.azure.com${domains[0].id}?api-version=2023-03-31`, headers);
const senders = await getJson(`https://management.azure.com${domains[0].id}/senderUsernames?api-version=2023-03-31`, headers);
if (!communication.properties?.hostName || !domain.properties?.fromSenderDomain || !Array.isArray(senders.value) || senders.value.length !== 1 || !senders.value[0].properties?.username) throw new Error('Approved ACS endpoint or sender metadata is incomplete.');
const domainName = String(domain.properties.fromSenderDomain);
const sender = `${senders.value[0].properties.username}@${domainName}`;
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) throw new Error('Approved ACS sender metadata is invalid.');

const previousParameters = existsSync(parameterPath) ? JSON.parse(readFileSync(parameterPath, 'utf8')).parameters || {} : {};
const previous = name => previousParameters[name]?.value;
const preserved = (name, fallback) => previous(name) ?? fallback;
const suffix = previous('webAppName')?.split('-').at(-1) || randomBytes(5).toString('hex');
if (!/^[a-f0-9]{10}$/.test(suffix)) throw new Error('Existing private resource suffix is invalid.');
const names = {
  plan: previous('planName') || `sales-enabler-beta-plan-${suffix}`,
  web: previous('webAppName') || `sales-enabler-beta-web-${suffix}`,
  gateway: previous('gatewayAppName') || `sales-enabler-beta-gateway-${suffix}`,
  voiceLive: previous('voiceLiveAppName') || `sales-enabler-beta-live-${suffix}`,
  postgres: previous('postgresServerName') || `sales-enabler-beta-pg-${suffix}`,
};

const requireRuntime = name => {
  const value = runtime[name]?.trim();
  if (!value) throw new Error(`Existing private runtime configuration is missing ${name}.`);
  return value;
};
const connectorKey = existingSecrets.SALES_ENABLER_CONNECTOR_ENCRYPTION_KEY || requireRuntime('CONNECTOR_ENCRYPTION_KEY');
const lifecycleKey = existingSecrets.SALES_ENABLER_AUTH_LIFECYCLE_KEY || requireRuntime('AUTH_LIFECYCLE_KEY');
const sessionKey = existingSecrets.SALES_ENABLER_PUBLIC_SESSION_HASH_SECRET || requireRuntime('PUBLIC_SESSION_HASH_SECRET');
if (!/^[a-fA-F0-9]{64}$/.test(connectorKey) || !/^[a-fA-F0-9]{64}$/.test(lifecycleKey) || sessionKey.length < 32) throw new Error('Existing stable application keys are invalid.');
const postgresPassword = existingSecrets.SALES_ENABLER_POSTGRES_ADMIN_PASSWORD || `${randomBytes(24).toString('base64url')}Aa1!`;
const databaseUrl = existingSecrets.SALES_ENABLER_DATABASE_URL || `postgresql://seadmin:${encodeURIComponent(postgresPassword)}@${names.postgres}.postgres.database.azure.com/sales_enabler?sslmode=verify-full`;
const voiceLiveRaw = runtime.AZURE_VOICE_LIVE_ENDPOINT?.trim() || requireRuntime('AZURE_FOUNDRY_PROJECT_ENDPOINT');
let voiceLiveEndpoint;
try {
  const parsed = new URL(voiceLiveRaw);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !/^[a-z0-9][a-z0-9.-]*\.(services\.ai\.azure\.com|cognitiveservices\.azure\.com)$/i.test(parsed.hostname)) throw new Error();
  voiceLiveEndpoint = parsed.origin;
} catch { throw new Error('Existing private Voice Live/Foundry endpoint is invalid.'); }

const parameters = {
  '$schema': 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
  contentVersion: '1.0.0.0',
  parameters: {
    location: { value: 'eastus2' }, namePrefix: { value: 'sales-enabler-beta' },
    planName: { value: names.plan }, webAppName: { value: names.web }, gatewayAppName: { value: names.gateway }, voiceLiveAppName: { value: names.voiceLive },
    logAnalyticsWorkspaceName: { value: workspaces[0].name }, postgresServerName: { value: names.postgres }, postgresAdministratorLogin: { value: 'seadmin' }, postgresDatabaseName: { value: 'sales_enabler' },
    appServiceSku: { value: preserved('appServiceSku', 'B2') }, virtualNetworkAddressPrefix: { value: preserved('virtualNetworkAddressPrefix', '10.43.0.0/16') }, appServiceSubnetPrefix: { value: preserved('appServiceSubnetPrefix', '10.43.0.0/26') }, postgresSubnetPrefix: { value: preserved('postgresSubnetPrefix', '10.43.1.0/28') }, postgresPrivateDnsZoneName: { value: preserved('postgresPrivateDnsZoneName', 'sales-enabler-appservice.postgres.database.azure.com') },
    azureOpenAiEndpoint: { value: preserved('azureOpenAiEndpoint', requireRuntime('AZURE_OPENAI_ENDPOINT')) }, azureTextDeployment: { value: preserved('azureTextDeployment', requireRuntime('AZURE_OPENAI_TEXT_DEPLOYMENT')) }, azureRealtimeDeployment: { value: preserved('azureRealtimeDeployment', requireRuntime('AZURE_OPENAI_REALTIME_DEPLOYMENT')) },
    azureSpeechRegion: { value: preserved('azureSpeechRegion', requireRuntime('AZURE_SPEECH_REGION')) }, azureVoiceLiveEndpoint: { value: preserved('azureVoiceLiveEndpoint', voiceLiveEndpoint) },
    accountEmailEndpoint: { value: preserved('accountEmailEndpoint', `https://${communication.properties.hostName}`) }, accountEmailSender: { value: preserved('accountEmailSender', sender) },
    inferenceAllowedOrganizationIds: { value: preserved('inferenceAllowedOrganizationIds', 'pending-private-beta-activation') }, azureDeploymentPricesJson: { value: preserved('azureDeploymentPricesJson', runtime.AZURE_OPENAI_DEPLOYMENT_PRICES_JSON?.trim() || '') },
    aiDailyOrgTokenBudget: { value: preserved('aiDailyOrgTokenBudget', 50000) }, voiceDailyOrgAttemptBudget: { value: preserved('voiceDailyOrgAttemptBudget', 20) }, voiceDailyOrgSecondsBudget: { value: preserved('voiceDailyOrgSecondsBudget', 3600) }, voiceMaxLivePerUser: { value: preserved('voiceMaxLivePerUser', 1) }, voiceMaxLivePerOrg: { value: preserved('voiceMaxLivePerOrg', 2) }, databasePoolMax: { value: preserved('databasePoolMax', 4) },
    monthlyBudgetUsd: { value: preserved('monthlyBudgetUsd', 150) }, budgetStartDate: { value: preserved('budgetStartDate', '2026-10-01T00:00:00Z') }, budgetContactEmails: { value: [budgetEmail] },
  },
};
const secretValues = {
  SALES_ENABLER_POSTGRES_ADMIN_PASSWORD: postgresPassword,
  SALES_ENABLER_DATABASE_URL: databaseUrl,
  SALES_ENABLER_CONNECTOR_ENCRYPTION_KEY: connectorKey,
  SALES_ENABLER_AUTH_LIFECYCLE_KEY: lifecycleKey,
  SALES_ENABLER_PUBLIC_SESSION_HASH_SECRET: sessionKey,
  SALES_ENABLER_AZURE_OPENAI_KEY: existingSecrets.SALES_ENABLER_AZURE_OPENAI_KEY || requireRuntime('AZURE_OPENAI_API_KEY'),
  SALES_ENABLER_AZURE_SPEECH_KEY: existingSecrets.SALES_ENABLER_AZURE_SPEECH_KEY || requireRuntime('AZURE_SPEECH_KEY'),
  SALES_ENABLER_ACS_EMAIL_ACCESS_KEY: existingSecrets.SALES_ENABLER_ACS_EMAIL_ACCESS_KEY || '',
};

function atomicWrite(path, contents) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  renameSync(temporary, path);
}
atomicWrite(parameterPath, `${JSON.stringify(parameters, null, 2)}\n`);
atomicWrite(secretPath, `${Object.entries(secretValues).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n')}\n`);
console.log(JSON.stringify({ ok: true, parameterFileIgnored: true, secretFileIgnored: true, namedResources: 5, secretSlots: Object.keys(secretValues).length, reusedStableApplicationKeys: 3, generatedPostgresCredential: !existingSecrets.SALES_ENABLER_POSTGRES_ADMIN_PASSWORD, acsKeyPresent: Boolean(secretValues.SALES_ENABLER_ACS_EMAIL_ACCESS_KEY), inferenceDeniedBySentinel: parameters.parameters.inferenceAllowedOrganizationIds.value === 'pending-private-beta-activation', valuesLogged: false }));
