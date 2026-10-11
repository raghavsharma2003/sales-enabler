import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { permitsAzureAction } from '../lib/rbac-permissions.mjs';

const managementPath = resolve(process.argv[2] || '.env.azure-management.local');
const secretPath = resolve(process.argv[3] || '.env.appservice.local');
const relativeSecretPath = secretPath.slice(resolve('.').length + 1).replaceAll('\\', '/');
if (spawnSync('git', ['ls-files', '--error-unmatch', '--', relativeSecretPath], { cwd: resolve('.'), stdio: 'ignore' }).status === 0) throw new Error('Refusing to write an ACS key into a tracked file.');
if (spawnSync('git', ['check-ignore', '--no-index', '-q', relativeSecretPath], { cwd: resolve('.') }).status !== 0) throw new Error('ACS key destination is not ignored by Git.');
const management = parseEnv(readFileSync(managementPath, 'utf8'));
const secrets = parseEnv(readFileSync(secretPath, 'utf8'));
if (secrets.SALES_ENABLER_ACS_EMAIL_ACCESS_KEY?.trim()) {
  console.log(JSON.stringify({ ok: true, retrievalAttempted: false, retrievalRequests: 0, keyAlreadyPresent: true, valuesLogged: false }));
  process.exit(0);
}
const form = new URLSearchParams({ client_id: management.AZURE_CLIENT_ID, client_secret: management.AZURE_CLIENT_SECRET, grant_type: 'client_credentials', scope: 'https://management.azure.com/.default' });
const tokenResponse = await fetch(`https://login.microsoftonline.com/${management.AZURE_TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, redirect: 'error', signal: AbortSignal.timeout(20_000) });
if (!tokenResponse.ok) { await tokenResponse.body?.cancel(); throw new Error('Azure management identity failed.'); }
const headers = { Authorization: `Bearer ${(await tokenResponse.json()).access_token}` };
const group = `https://management.azure.com/subscriptions/${management.AZURE_SUBSCRIPTION_ID}/resourceGroups/${encodeURIComponent(management.AZURE_RESOURCE_GROUP)}`;
const [permissionsResponse, inventoryResponse] = await Promise.all([
  fetch(`${group}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`, { headers, signal: AbortSignal.timeout(20_000) }),
  fetch(`${group}/resources?api-version=2021-04-01&$top=1000`, { headers, signal: AbortSignal.timeout(20_000) }),
]);
if (!permissionsResponse.ok || !inventoryResponse.ok) { await permissionsResponse.body?.cancel(); await inventoryResponse.body?.cancel(); throw new Error('ACS preflight read failed.'); }
const grants = (await permissionsResponse.json()).value || [];
if (!permitsAzureAction(grants, 'Microsoft.Communication/communicationServices/listKeys/action')) throw new Error('Configured identity lacks the approved in-scope ACS key-read action.');
const resources = (await inventoryResponse.json()).value || [];
const services = resources.filter(item => String(item.type).toLowerCase() === 'microsoft.communication/communicationservices');
if (services.length !== 1) throw new Error('Approved ACS resource inventory is ambiguous.');
const keyResponse = await fetch(`https://management.azure.com${services[0].id}/listKeys?api-version=2023-03-31`, { method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(20_000) });
if (!keyResponse.ok) { await keyResponse.body?.cancel(); throw new Error('Single authorized ACS key retrieval failed.'); }
const primaryKey = (await keyResponse.json()).primaryKey;
if (typeof primaryKey !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(primaryKey) || Buffer.from(primaryKey, 'base64').length < 32) throw new Error('ACS returned an invalid primary key.');
secrets.SALES_ENABLER_ACS_EMAIL_ACCESS_KEY = primaryKey;
const temporary = `${secretPath}.${process.pid}.tmp`;
writeFileSync(temporary, `${Object.entries(secrets).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n')}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
renameSync(temporary, secretPath);
console.log(JSON.stringify({ ok: true, retrievalAttempted: true, retrievalRequests: 1, keyStored: true, valuesLogged: false, resourceWrites: 0, roleWrites: 0 }));
