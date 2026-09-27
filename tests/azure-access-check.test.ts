import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAzureAccess } from '../scripts/check-azure-access.mjs';

const settings = { AZURE_TENANT_ID: '11111111-1111-1111-1111-111111111111', AZURE_CLIENT_ID: '22222222-2222-2222-2222-222222222222', AZURE_SUBSCRIPTION_ID: '33333333-3333-3333-3333-333333333333', AZURE_CLIENT_SECRET: 'fixture-secret-never-log-this', AZURE_RESOURCE_GROUP: 'sales-enabler-prod' };

test('missing configuration and tenant URL injection cannot contact the network', async () => {
  const fetcher: typeof fetch = async () => { throw new Error('Network must not be called'); };
  assert.equal((await checkAzureAccess({}, { fetcher })).stage, 'configuration');
  const bad = await checkAzureAccess({ ...settings, AZURE_TENANT_ID: 'evil.example/steal' }, { fetcher });
  assert.deepEqual(bad.invalidVariables, ['AZURE_TENANT_ID']);
});

test('access check sends a token request then only fixed-host read operations without returning secrets', async () => {
  const token = 'fixture-access-token-never-log-this'; const requests: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); requests.push(url.hostname);
    assert.equal(init?.redirect, 'error');
    if (url.hostname === 'login.microsoftonline.com') {
      assert.equal(init?.method, 'POST');
      assert.equal(new URLSearchParams(String(init.body)).get('scope'), 'https://management.azure.com/.default');
      return Response.json({ access_token: token });
    }
    assert.equal(url.hostname, 'management.azure.com'); assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init.headers).get('Authorization'), `Bearer ${token}`);
    if (url.pathname.endsWith('/resources')) return Response.json({ value: [{ name: 'private-resource-name' }], nextLink: 'https://management.azure.com/another-page' });
    if (url.pathname.includes('/resourcegroups/')) return Response.json({ id: 'private-resource-id' });
    return Response.json({ state: 'Enabled', displayName: 'private-subscription-name' });
  };
  const result = await checkAzureAccess(settings, { fetcher });
  assert.equal(result.ok, true); assert.equal(result.provisioningVerified, false); assert.equal(result.foundryDataPlaneVerified, false);
  assert.equal(result.aiInventory?.visibleOnFirstPage, 1); assert.equal(result.aiInventory?.morePages, true); assert.equal(requests.length, 4);
  assert.doesNotMatch(JSON.stringify(result), /fixture-|private-|33333333/);
});

test('identity failures do not reflect secret-bearing upstream error bodies', async () => {
  const result = await checkAzureAccess(settings, { fetcher: async () => Response.json({ error_description: settings.AZURE_CLIENT_SECRET }, { status: 401 }) });
  assert.deepEqual(result, { ok: false, stage: 'identity', httpStatus: 401 });
});

test('missing resource-group permissions cannot be presented as provisioning readiness', async () => {
  const result = await checkAzureAccess(settings, { fetcher: async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'login.microsoftonline.com') return Response.json({ access_token: 'fixture-access-token-never-log-this' });
    if (url.pathname.includes('/resourcegroups/')) return Response.json({ error: settings.AZURE_CLIENT_SECRET }, { status: 403 });
    if (url.pathname.endsWith('/resources')) return Response.json({ value: [] });
    return Response.json({ state: 'Enabled' });
  } });
  assert.equal(result.ok, false); assert.equal(result.projectResourceGroup?.httpStatus, 403); assert.equal(result.provisioningVerified, false);
  assert.doesNotMatch(JSON.stringify(result), /fixture-/);
});
