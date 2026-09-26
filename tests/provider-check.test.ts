import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAzureRealtimeDeployment } from '../lib/voice/check';

const azure = {
  VOICE_PROVIDER: 'azure',
  AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com/openai/v1',
  AZURE_OPENAI_API_KEY: 'server-only',
  AZURE_OPENAI_REALTIME_DEPLOYMENT: 'my-realtime-deployment',
};

test('Azure check provisions a short-lived session and returns no secret or upstream body', async () => {
  const result = await checkAzureRealtimeDeployment(azure, (async (url, init) => {
    assert.equal(url, 'https://example.openai.azure.com/openai/v1/realtime/client_secrets');
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>)['api-key'], 'server-only');
    const body = JSON.parse(init?.body as string);
    assert.deepEqual(body.session, { type: 'realtime', model: 'my-realtime-deployment' });
    assert.equal(body.expires_after.seconds, 10);
    return Response.json({ value: 'ephemeral-secret-should-not-return', expires_at: 123 }, { status: 200 });
  }) as typeof fetch);
  assert.deepEqual({ ready: result.ready, provider: result.provider, model: result.model, status: result.status }, { ready: true, provider: 'azure', model: 'my-realtime-deployment', status: 'ready' });
  assert.equal(JSON.stringify(result).includes('ephemeral-secret'), false);
  assert.equal(JSON.stringify(result).includes('server-only'), false);
  assert.ok(Date.parse(result.checkedAt) > 0);
  assert.match(result.message, /browser call.*verify speech/i);
});

test('Azure check maps rejected deployment, key and quota without exposing response text', async () => {
  for (const [code, expected] of [[400, 'needs-deployment'], [404, 'needs-deployment'], [401, 'credentials-rejected'], [403, 'credentials-rejected'], [429, 'quota-unavailable'], [503, 'unavailable']] as const) {
    const result = await checkAzureRealtimeDeployment(azure, (async () => new Response('private Azure diagnostic and secret', { status: code })) as typeof fetch);
    assert.equal(result.ready, false);
    assert.equal(result.status, expected);
    assert.equal(JSON.stringify(result).includes('private Azure diagnostic'), false);
  }
});

test('Azure check reports incomplete configuration without contacting provider', async () => {
  const transport = (async () => { assert.fail('provider must not be called'); }) as typeof fetch;
  assert.equal((await checkAzureRealtimeDeployment({ ...azure, AZURE_OPENAI_REALTIME_DEPLOYMENT: '' }, transport)).status, 'needs-deployment');
  assert.equal((await checkAzureRealtimeDeployment({ ...azure, AZURE_OPENAI_API_KEY: '' }, transport)).status, 'unavailable');
  assert.equal((await checkAzureRealtimeDeployment({ ...azure, VOICE_PROVIDER: 'openai' }, transport)).status, 'unavailable');
  assert.equal((await checkAzureRealtimeDeployment({ ...azure, VOICE_TRANSPORT: 'sip' }, transport)).status, 'unavailable');
});

test('voice connection check route rejects missing origin and unauthenticated requests', async () => {
  const { POST } = await import('../app/api/voice/check/route');
  const noOrigin = await POST(new Request('http://localhost/api/voice/check', { method: 'POST' }));
  assert.equal(noOrigin.status, 403);
  const noUser = await POST(new Request('http://localhost/api/voice/check', { method: 'POST', headers: { Origin: 'http://localhost' } }));
  assert.equal(noUser.status, 401);
});
