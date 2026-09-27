import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REQUIRED = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SUBSCRIPTION_ID'];

async function requestJson(fetcher, url, options, maximum = 1_048_576) {
  let response;
  try { response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
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

/** Token issuance plus read-only ARM inspection. Never provisions or invokes models. */
export async function checkAzureAccess(settings, { fetcher = fetch } = {}) {
  const missing = REQUIRED.filter(key => typeof settings[key] !== 'string' || !settings[key].trim() || settings[key].includes('REPLACE_WITH'));
  const invalid = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_SUBSCRIPTION_ID'].filter(key => !missing.includes(key) && !GUID.test(settings[key]));
  const group = settings.AZURE_RESOURCE_GROUP || 'sales-enabler-prod';
  if (!/^[a-zA-Z0-9_().-]{1,90}$/.test(group) || group.endsWith('.')) invalid.push('AZURE_RESOURCE_GROUP');
  if (missing.length || invalid.length) return { ok: false, stage: 'configuration', missingVariables: missing, invalidVariables: invalid };
  const identity = await requestJson(fetcher, `https://login.microsoftonline.com/${settings.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: settings.AZURE_CLIENT_ID, client_secret: settings.AZURE_CLIENT_SECRET, grant_type: 'client_credentials', scope: 'https://management.azure.com/.default' }).toString(),
  }, 131_072);
  if (!identity.ok || typeof identity.value?.access_token !== 'string' || identity.value.access_token.length < 20) return { ok: false, stage: 'identity', httpStatus: identity.status };
  const prefix = `https://management.azure.com/subscriptions/${settings.AZURE_SUBSCRIPTION_ID}`;
  const options = { method: 'GET', headers: { Authorization: `Bearer ${identity.value.access_token}` } };
  const [subscription, resourceGroup, accounts] = await Promise.all([
    requestJson(fetcher, `${prefix}?api-version=2022-12-01`, options),
    requestJson(fetcher, `${prefix}/resourcegroups/${encodeURIComponent(group)}?api-version=2021-04-01`, options),
    requestJson(fetcher, `${prefix}/resources?api-version=2021-04-01&$filter=${encodeURIComponent("resourceType eq 'Microsoft.CognitiveServices/accounts'")}`, options),
  ]);
  const state = ['Enabled', 'Warned', 'PastDue', 'Disabled', 'Deleted'].includes(subscription.value?.state) ? subscription.value.state : 'unknown';
  return {
    ok: subscription.ok && resourceGroup.ok && accounts.ok && state === 'Enabled',
    stage: 'management-read-check',
    subscription: { readable: subscription.ok, httpStatus: subscription.status, state },
    projectResourceGroup: { readable: resourceGroup.ok, httpStatus: resourceGroup.status },
    aiInventory: { readable: accounts.ok, httpStatus: accounts.status, visibleOnFirstPage: Array.isArray(accounts.value?.value) ? accounts.value.value.length : null, morePages: Boolean(accounts.value?.nextLink) },
    provisioningVerified: false,
    foundryDataPlaneVerified: false,
    grantBalanceVerified: false,
  };
}

async function main() {
  if (process.argv.length > 3) throw new Error();
  const path = resolve(process.argv[2] || '.env.azure-management.local');
  const contents = readFileSync(path, 'utf8');
  if (Buffer.byteLength(contents) > 65_536) throw new Error();
  const result = await checkAzureAccess(parseEnv(contents));
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => {
  console.error('Azure access check could not complete. Check the private credentials file and network access. No credentials, tokens or provider response bodies were logged.');
  process.exitCode = 1;
});
