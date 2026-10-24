// The recording link's signature is the voice runtime's (vpvoice/recordings.py): the same vector is asserted in
// product/voice/tests/test_recordings.py, so a change on either side fails both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordingBase, recordingLink, recordingSignature, RECORDING_LINK_TTL_S } from '../server/recording-url.ts';

const CALL = '0b6f6e1a-1c2d-4e5f-8a9b-000000000001', WS = '11111111-2222-4333-8444-555555555555';

test('the signature matches the runtime\'s vector', () => {
  assert.equal(recordingSignature('test-secret', CALL, WS, 1700000600), 'a0c6a565e5c61a7dbb74033fe0fd5eaf771ed3008fccb9a4b434c1972d5c72b7');
});

test('the link: the public base first, ten minutes, workspace and expiry in the query; no link without a base or a secret', () => {
  const env = { VP_RUNTIME_PUBLIC_URL: 'https://staging.example.test:8443/', VP_RUNTIME_URL: 'http://127.0.0.1:8090', VP_RUNTIME_SECRET: 's'.repeat(40) };
  const l = recordingLink(CALL, WS, { now: 1_700_000_000_000, env })!;
  const u = new URL(l.url);
  assert.equal(u.origin + u.pathname, `https://staging.example.test:8443/v1/recordings/${CALL}`, 'never the loopback address when a public one is set');
  assert.equal(u.searchParams.get('ws'), WS);
  assert.equal(Number(u.searchParams.get('exp')), 1_700_000_000 + RECORDING_LINK_TTL_S);
  assert.equal(u.searchParams.get('sig'), recordingSignature(env.VP_RUNTIME_SECRET, CALL, WS, 1_700_000_600));
  assert.equal(l.expiresAt, new Date(1_700_000_600_000).toISOString());
  assert.equal(recordingBase({ VP_RUNTIME_URL: 'http://127.0.0.1:8090' }), 'http://127.0.0.1:8090', 'development: the runtime URL');
  assert.equal(recordingLink(CALL, WS, { env: { ...env, VP_RUNTIME_SECRET: '' } }), null);
  assert.equal(recordingLink(CALL, WS, { env: { VP_RUNTIME_SECRET: env.VP_RUNTIME_SECRET } }), null);
  assert.equal(recordingBase({ VP_RUNTIME_PUBLIC_URL: 'javascript:alert(1)' }), null, 'only http(s)');
});
