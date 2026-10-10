import test from 'node:test';
import assert from 'node:assert/strict';
import { azureCallConfigurationDigest, classifyAzureCallLocation, hangupAzureCall, parseAzureCallLocation } from '../lib/voice/call-control';
import { getVoiceServerAdapter, VoiceCallAllocationError, VoiceConnectionError, voiceAllocationNotStarted } from '../lib/voice/server';

const env = { VOICE_PROVIDER: 'azure', AZURE_OPENAI_ENDPOINT: 'https://fixture.openai.azure.com', AZURE_OPENAI_API_KEY: 'fixture-key', AZURE_OPENAI_REALTIME_DEPLOYMENT: 'fixture' };
const reference = { providerCallRef: 'rtc_fixture', providerConfigurationDigest: azureCallConfigurationDigest(env)! };

test('Azure Location accepts only exact configured call paths and bounded plain IDs', () => {
  for (const location of ['/openai/v1/realtime/calls/rtc_fixture', '/v1/realtime/calls/rtc_fixture', 'https://fixture.openai.azure.com/openai/v1/realtime/calls/rtc_fixture', 'https://fixture.openai.azure.com/v1/realtime/calls/rtc_fixture', 'rtc_fixture']) assert.deepEqual(parseAzureCallLocation(location, env), reference);
  for (const location of [null, '', '/openai/v1/realtime/calls/', '/openai/v1/realtime/calls/rtc_fixture/hangup', 'https://other.openai.azure.com/openai/v1/realtime/calls/rtc_fixture', 'https://u:p@fixture.openai.azure.com/openai/v1/realtime/calls/rtc_fixture', '//fixture.openai.azure.com/openai/v1/realtime/calls/rtc_fixture', '/openai/v1/realtime/calls/rtc_fixture?key=secret', '/openai/v1/realtime/calls/rtc_fixture#x', '/openai/v1/realtime/calls/a/../rtc_fixture', '/openai/v1/realtime/calls/%72tc_fixture', '/openai/v1/realtime/calls/rtc_fixture\\bad', '/openai/v1/realtime/calls/rtc_fixture\r\nx:evil']) assert.equal(parseAzureCallLocation(location, env), null);
});

test('documented Azure compatible Location creates a controllable reference on the fixed Azure API base', async () => {
  let negotiations = 0, hangups = 0;
  const adapter = getVoiceServerAdapter(env, (async url => {
    if (String(url).endsWith('/client_secrets')) return Response.json({ value: 'fixture-token' });
    negotiations++;
    return new Response('v=0\r\nm=audio', { status: 201, headers: { Location: '/v1/realtime/calls/rtc_fixture' } });
  }) as typeof fetch);
  const result = await adapter.connect({ sdp: 'v=0\r\nm=audio', userId: 'u', organizationId: 'o', instructions: '{}' });
  assert.equal(result.providerCallRef, 'rtc_fixture');
  const outcome = await hangupAzureCall({ providerCallRef: result.providerCallRef!, providerConfigurationDigest: result.providerConfigurationDigest! }, { env, transport: (async url => {
    hangups++;
    assert.equal(url, 'https://fixture.openai.azure.com/openai/v1/realtime/calls/rtc_fixture/hangup');
    return new Response(null, { status: 200 });
  }) as typeof fetch });
  assert.equal(outcome.confirmed, true); assert.equal(negotiations, 1); assert.equal(hangups, 1);
});

test('Location diagnostics expose only finite classifications and retain all trust restrictions', () => {
  for (const [location, classification] of [
    [null, 'missing'], ['', 'missing'], ['/v1/realtime/calls/rtc_fixture', 'compatible_api_path'],
    ['/openai/v1/realtime/calls/rtc_fixture', 'azure_api_path'],
    ['https://other.openai.azure.com/v1/realtime/calls/rtc_fixture', 'foreign_origin'],
    ['/v1/realtime/calls/rtc_fixture?secret=fixture-key', 'unsafe_syntax'],
    ['/v1/realtime/calls/rtc_fixture#private', 'unsafe_syntax'],
    ['/v1/realtime/calls/%72tc_fixture', 'unsafe_syntax'],
    ['/v1/realtime/calls/a/../rtc_fixture', 'unsafe_syntax'],
    ['https://u:p@fixture.openai.azure.com/v1/realtime/calls/rtc_fixture', 'unsafe_syntax'],
    ['/v1/realtime/calls/rtc_fixture/hangup', 'unrecognized_path'],
    ['/v1/realtime/calls/', 'unrecognized_path'],
  ] as const) {
    assert.equal(classifyAzureCallLocation(location, env), classification);
    if (!['azure_api_path', 'compatible_api_path'].includes(classification)) assert.equal(parseAzureCallLocation(location, env), null);
  }
});

test('Azure hangup uses fixed authenticated host, rejects redirects, and only 200 confirms', async () => {
  for (const status of [200, 204, 301, 401, 404, 429, 500]) {
    const outcome = await hangupAzureCall(reference, { env, transport: (async (url, init) => {
      assert.equal(url, 'https://fixture.openai.azure.com/openai/v1/realtime/calls/rtc_fixture/hangup');
      assert.equal(init?.redirect, 'error'); assert.equal(init?.method, 'POST');
      assert.equal((init?.headers as Record<string, string>)['api-key'], 'fixture-key');
      return new Response(null, { status });
    }) as typeof fetch });
    assert.equal(outcome.confirmed, status === 200);
  }
  assert.deepEqual(await hangupAzureCall(reference, { env, transport: (async () => { throw new Error('secret upstream'); }) as typeof fetch }), { confirmed: false, reason: 'transport_uncertain' });
});

test('changed endpoint or key and malformed reference never dispatch hangup', async () => {
  const transport = (async () => { assert.fail('must not dispatch'); }) as typeof fetch;
  for (const changed of [{ ...env, AZURE_OPENAI_API_KEY: 'rotated' }, { ...env, AZURE_OPENAI_ENDPOINT: 'https://other.openai.azure.com' }]) assert.equal((await hangupAzureCall(reference, { env: changed, transport })).reason, 'configuration_changed');
  assert.equal((await hangupAzureCall({ ...reference, providerCallRef: '../evil' }, { env, transport })).reason, 'invalid_reference');
});

test('missing Location, interrupted negotiation and invalid SDP retain allocation uncertainty', async () => {
  for (const mode of ['missing', 'foreign', 'invalid-sdp', 'network'] as const) {
    const adapter = getVoiceServerAdapter(env, (async (url, init) => {
      assert.equal(init?.redirect, 'error');
      if (String(url).endsWith('/client_secrets')) return Response.json({ value: 'short-lived-fixture' });
      if (mode === 'network') throw new Error('private upstream');
      return new Response(mode === 'invalid-sdp' ? 'invalid' : 'v=0\r\nm=audio', { status: 201, headers: mode === 'missing' ? {} : { Location: mode === 'foreign' ? 'https://other.openai.azure.com/openai/v1/realtime/calls/rtc_fixture' : '/openai/v1/realtime/calls/rtc_fixture' } });
    }) as typeof fetch);
    await assert.rejects(adapter.connect({ sdp: 'v=0\r\nm=audio', userId: 'u', organizationId: 'o', instructions: '{}' }), error => {
      assert.ok(error instanceof VoiceCallAllocationError);
      assert.equal(error.allocationUncertain, true);
      assert.equal(error.providerCallRef, mode === 'invalid-sdp' ? 'rtc_fixture' : undefined);
      assert.equal(error.locationClassification, mode === 'missing' ? 'missing' : mode === 'foreign' ? 'foreign_origin' : undefined);
      assert.equal(error.message.includes('private upstream'), false);
      assert.equal(JSON.stringify(error).includes('rtc_fixture'), false);
      return true;
    });
  }
});

test('browser abort during allocation does not discard the late Azure call reference', async () => {
  const controller = new AbortController();
  const adapter = getVoiceServerAdapter(env, (async (url, init) => {
    if (String(url).endsWith('/client_secrets')) return Response.json({ value: 'short-lived-fixture' });
    controller.abort();
    assert.equal(init?.signal?.aborted, false);
    return new Response('v=0\r\nm=audio', { status: 201, headers: { Location: '/openai/v1/realtime/calls/rtc_fixture' } });
  }) as typeof fetch);
  const result = await adapter.connect({ sdp: 'v=0\r\nm=audio', userId: 'u', organizationId: 'o', instructions: '{}', signal: controller.signal });
  assert.equal(result.providerCallRef, 'rtc_fixture');
});

test('browser cancellation after client-secret exchange prevents call allocation', async () => {
  const controller = new AbortController(); let requests = 0;
  const adapter = getVoiceServerAdapter(env, (async url => {
    requests++;
    assert.equal(String(url).endsWith('/client_secrets'), true);
    controller.abort();
    return Response.json({ value: 'short-lived-fixture' });
  }) as typeof fetch);
  await assert.rejects(adapter.connect({ sdp: 'v=0\r\nm=audio', userId: 'u', organizationId: 'o', instructions: '{}', signal: controller.signal }), error => voiceAllocationNotStarted(error));
  assert.equal(requests, 1);
});

test('only explicit pre-allocation evidence permits releasing the reservation', async () => {
  assert.equal(voiceAllocationNotStarted(new VoiceConnectionError('unclassified')), false);
  for (const mode of ['bad-offer', 'secret-500', 'secret-network', 'secret-invalid', 'secret-json'] as const) {
    let negotiations = 0;
    const adapter = getVoiceServerAdapter(env, (async url => {
      if (!String(url).endsWith('/client_secrets')) negotiations++;
      if (mode === 'secret-network') throw new Error('private provider timeout');
      if (mode === 'secret-500') return new Response('private provider message', { status: 500 });
      if (mode === 'secret-json') return new Response('malformed-json');
      return Response.json({ value: '' });
    }) as typeof fetch);
    await assert.rejects(adapter.connect({ sdp: mode === 'bad-offer' ? 'invalid' : 'v=0\r\nm=audio', userId: 'u', organizationId: 'o', instructions: '{}' }), error => {
      assert.equal(voiceAllocationNotStarted(error), true);
      assert.equal((error as VoiceCallAllocationError).providerCallRef, undefined);
      assert.equal(String(error).includes('private provider'), false);
      return true;
    });
    assert.equal(negotiations, 0);
  }
});

test('negotiation 4xx rejection is definite, but 5xx, timeout and any allocated handle remain uncertain', async () => {
  for (const status of [400, 401, 403, 404, 408, 422, 429, 500, 503]) {
    for (const withReference of [false, true]) {
      const adapter = getVoiceServerAdapter(env, (async url => String(url).endsWith('/client_secrets')
        ? Response.json({ value: 'short-lived-fixture' })
        : new Response('private upstream', { status, headers: withReference ? { Location: '/openai/v1/realtime/calls/rtc_fixture' } : {} })) as typeof fetch);
      await assert.rejects(adapter.connect({ sdp: 'v=0\r\nm=audio', userId: 'u', organizationId: 'o', instructions: '{}' }), error => {
        const definite = !withReference && status < 500 && status !== 408;
        assert.equal(voiceAllocationNotStarted(error), definite);
        assert.equal(error instanceof VoiceCallAllocationError, !definite);
        assert.equal((error as VoiceCallAllocationError).providerCallRef, withReference ? 'rtc_fixture' : undefined);
        assert.equal(String(error).includes('private upstream'), false);
        return true;
      });
    }
  }
});
