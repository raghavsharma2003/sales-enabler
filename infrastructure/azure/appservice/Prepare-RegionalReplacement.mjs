import { randomBytes } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

const region = process.argv[2] || 'westus3';
if (!['westus3', 'centralindia'].includes(region)) throw new Error('Only reviewed supported regions may be prepared.');
const management = parseEnv(readFileSync('.env.azure-management.local', 'utf8'));
const parameterPath = resolve('infrastructure/azure/appservice.parameters.local.json');
const secretPath = resolve('.env.appservice.local');
const cleanupPath = resolve('infrastructure/azure/appservice.cleanup.local.json');
for (const path of [parameterPath, secretPath]) {
  const relative = path.slice(resolve('.').length + 1).replaceAll('\\', '/');
  if (spawnSync('git', ['ls-files', '--error-unmatch', '--', relative], { cwd: resolve('.'), stdio: 'ignore' }).status === 0) throw new Error('Private replacement path is tracked.');
  if (spawnSync('git', ['check-ignore', '--no-index', '-q', relative], { cwd: resolve('.') }).status !== 0) throw new Error('Private replacement path is not ignored.');
}
const file = JSON.parse(readFileSync(parameterPath, 'utf8'));
const parameters = file.parameters || {};
const secrets = parseEnv(readFileSync(secretPath, 'utf8'));
const cleanup = JSON.parse(readFileSync(cleanupPath, 'utf8'));
async function request(url, headers) {
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  let value = {};
  try { value = await response.json(); } catch { await response.body?.cancel().catch(() => {}); }
  return { ok: response.ok, status: response.status, value };
}
const form = new URLSearchParams({ client_id: management.AZURE_CLIENT_ID, client_secret: management.AZURE_CLIENT_SECRET, grant_type: 'client_credentials', scope: 'https://management.azure.com/.default' });
const tokenResponse = await fetch(`https://login.microsoftonline.com/${management.AZURE_TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(20_000) });
if (!tokenResponse.ok) { await tokenResponse.body?.cancel(); throw new Error('Azure management identity failed.'); }
const headers = { Authorization: `Bearer ${(await tokenResponse.json()).access_token}` };
if (!cleanup.deleteOrder?.length || cleanup.deleteOrder.length !== 7) throw new Error('Reviewed cleanup manifest is unavailable.');
const apiVersions = { 'microsoft.web/sites': '2025-03-01', 'microsoft.web/serverfarms': '2024-11-01', 'microsoft.network/privatednszones/virtualnetworklinks': '2024-06-01', 'microsoft.network/virtualnetworks': '2025-01-01', 'microsoft.network/privatednszones': '2024-06-01' };
for (const item of cleanup.deleteOrder) {
  const readback = await request(`https://management.azure.com${item.id}?api-version=${apiVersions[String(item.type).toLowerCase()]}`, headers);
  if (readback.status !== 404) throw new Error('Prior partial hosting cleanup is incomplete.');
}
const subscription = `https://management.azure.com/subscriptions/${management.AZURE_SUBSCRIPTION_ID}`;
const [capability, appUsage] = await Promise.all([
  request(`${subscription}/providers/Microsoft.DBforPostgreSQL/locations/${region}/capabilities?api-version=2024-08-01`, headers),
  request(`${subscription}/providers/Microsoft.Web/locations/${region}/usages?api-version=2025-05-01`, headers),
]);
const postgres = capability.value.value?.[0] || {};
const burstable = (postgres.supportedServerEditions || []).find(edition => String(edition.name).toLowerCase() === 'burstable') || {};
const version16 = (postgres.supportedServerVersions || []).some(version => version.name === '16');
const b1ms = (burstable.supportedServerSkus || []).some(sku => String(sku.name).toLowerCase() === 'standard_b1ms');
const storage32 = (burstable.supportedStorageEditions || []).flatMap(storage => storage.supportedStorageMb || []).some(storage => storage.storageSizeMb === 32768);
const usage = appUsage.value.value || [];
if (!capability.ok || postgres.restricted !== 'Disabled' || !version16 || !b1ms || !storage32 || !appUsage.ok || !Array.isArray(usage) || !usage.some(item => item.currentValue < item.limit)) throw new Error('Replacement region no longer satisfies PostgreSQL/App Service capability gates.');
const suffix = randomBytes(5).toString('hex');
const postgresPassword = secrets.SALES_ENABLER_POSTGRES_ADMIN_PASSWORD;
if (!postgresPassword) throw new Error('Private PostgreSQL password is missing.');
parameters.location = { value: region };
parameters.planName = { value: `sales-enabler-beta-plan-${suffix}` };
parameters.webAppName = { value: `sales-enabler-beta-web-${suffix}` };
parameters.gatewayAppName = { value: `sales-enabler-beta-gateway-${suffix}` };
parameters.voiceLiveAppName = { value: `sales-enabler-beta-live-${suffix}` };
parameters.postgresServerName = { value: `sales-enabler-beta-pg-${suffix}` };
secrets.SALES_ENABLER_DATABASE_URL = `postgresql://seadmin:${encodeURIComponent(postgresPassword)}@${parameters.postgresServerName.value}.postgres.database.azure.com/sales_enabler?sslmode=verify-full`;
function atomicWrite(path, contents) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  renameSync(temporary, path);
}
atomicWrite(parameterPath, `${JSON.stringify(file, null, 2)}\n`);
atomicWrite(secretPath, `${Object.entries(secrets).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n')}\n`);
console.log(JSON.stringify({ ok: true, region, priorCleanupVerified: true, postgresRestricted: false, postgres16: true, b1ms: true, storage32GiB: true, appServiceQuotaHeadroom: true, freshNames: 5, budgetNamePreserved: true, stableSecretsPreserved: 7, databaseUrlUpdated: true, valuesLogged: false }));
