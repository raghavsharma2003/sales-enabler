import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReadiness, configurationIssues } from '../lib/server/health';
import { GET } from '../app/api/health/route';

const valid = { NODE_ENV: 'production', APP_URL: 'https://workspace.example.test', CONNECTOR_ENCRYPTION_KEY: 'a'.repeat(64), AUTH_LIFECYCLE_KEY: 'b'.repeat(64), AUTH_REQUIRE_EMAIL_VERIFICATION: 'false', DATABASE_URL: 'postgresql://user:private-password@database.example.test/workspace?sslmode=verify-full', VOICE_PROVIDER: 'none' };

test('readiness enforces production origin, encryption, database TLS and explicit local SQLite opt-in', () => {
  assert.deepEqual(configurationIssues(valid), []);
  const issues = configurationIssues({ ...valid, APP_URL: 'http://public.example.test', CONNECTOR_ENCRYPTION_KEY: '', DATABASE_URL: '' });
  assert.deepEqual(issues.map(issue => issue.code), ['invalid_app_origin', 'invalid_connector_key', 'postgresql_required']);
  assert.deepEqual(configurationIssues({ ...valid, APP_URL: 'http://localhost:3000', DATABASE_URL: '', ALLOW_SQLITE_PRODUCTION: '1' }), []);
  assert.ok(configurationIssues({ ...valid, DATABASE_URL: 'postgresql://user:secret@database.example.test/workspace' }).some(issue => issue.code === 'database_tls_required'));
});

test('readiness validates selected provider and paired OAuth configuration without exposing values', () => {
  const issues = configurationIssues({ ...valid, VOICE_PROVIDER: 'azure', GOOGLE_CLIENT_ID: 'private-client' });
  assert.equal(issues.filter(issue => issue.code === 'missing_provider_configuration').length, 3);
  assert.ok(issues.some(issue => issue.code === 'incomplete_oauth_configuration'));
  assert.ok(!JSON.stringify(issues).includes('private-client'));
  assert.ok(configurationIssues({ ...valid, VOICE_PROVIDER: 'openai' }).some(issue => issue.code === 'paid_provider_policy'));
});

test('readiness never probes invalid configuration and redacts database failures', async () => {
  let called = false;
  assert.equal((await checkReadiness({ env: {}, probe: async () => { called = true; return true; } })).ready, false);
  assert.equal(called, false);
  const result = await checkReadiness({ env: valid, probe: async () => { throw new Error(valid.DATABASE_URL); } });
  assert.deepEqual(result, { ready: false, issues: [{ code: 'database_unavailable', variables: [] }] });
  assert.ok(!JSON.stringify(result).includes('private-password'));
});

test('worker readiness is separately requested and never required for web readiness', async () => {
  assert.equal((await checkReadiness({ env: valid, probe: async worker => !worker })).ready, true);
  assert.deepEqual(await checkReadiness({ env: valid, requireWorker: true, probe: async worker => !worker }), { ready: false, issues: [{ code: 'worker_unavailable', variables: [] }] });
});

test('production email verification defaults on and requires existing ACS configuration and lifecycle key', () => {
  const issues = configurationIssues({ ...valid, AUTH_REQUIRE_EMAIL_VERIFICATION: undefined, AUTH_LIFECYCLE_KEY: undefined });
  assert.ok(issues.some(issue => issue.code === 'invalid_auth_lifecycle_key'));
  assert.equal(issues.filter(issue => issue.code === 'missing_account_email_configuration').length, 3);
  const configured = { ...valid, AUTH_REQUIRE_EMAIL_VERIFICATION: 'true', AZURE_COMMUNICATION_EMAIL_ENDPOINT: 'https://synthetic.communication.azure.com', AZURE_COMMUNICATION_EMAIL_ACCESS_KEY: Buffer.alloc(32, 7).toString('base64'), AZURE_COMMUNICATION_EMAIL_SENDER: 'sender@example.test' };
  assert.deepEqual(configurationIssues(configured), []);
  assert.ok(configurationIssues({ ...configured, AZURE_COMMUNICATION_EMAIL_ENDPOINT: 'https://untrusted.example.test' }).some(issue => issue.code === 'invalid_account_email_endpoint'));
});

test('channel worker readiness is an independent opt-in probe', async () => {
  assert.deepEqual(await checkReadiness({ env: valid, requireChannelWorker: true, probe: async (_worker, channelWorker) => !channelWorker }), { ready: false, issues: [{ code: 'channel_worker_unavailable', variables: [] }] });
  assert.ok(configurationIssues({ ...valid, CHANNEL_WORKER_ENABLED: 'true' }).some(issue => issue.variables.includes('CHANNEL_WORKER_ENABLED')));
});

test('learning worker readiness is independent and explicit inference enablement validates Azure settings', async () => {
  assert.deepEqual(await checkReadiness({ env: valid, requireLearningWorker: true, probe: async (_worker, _channelWorker, learningWorker) => !learningWorker }), { ready: false, issues: [{ code: 'learning_worker_unavailable', variables: [] }] });
  assert.ok(configurationIssues({ ...valid, LEARNING_WORKER_ENABLED: 'true' }).some(issue => issue.variables.includes('LEARNING_WORKER_ENABLED')));
  assert.equal(configurationIssues({ ...valid, LEARNING_WORKER_ENABLED: '1' }).filter(issue => issue.code === 'missing_provider_configuration').length, 3);
});

test('public voice configuration requires scoped WS ingress and a private session key', () => {
  assert.ok(configurationIssues({ ...valid, PUBLIC_VOICE_GATEWAY_URL: 'ws://localhost:3001/voice' }).some(issue => issue.code === 'missing_public_session_secret'));
  const configured = { ...valid, PUBLIC_VOICE_GATEWAY_URL: 'wss://gateway.example.test/voice', PUBLIC_SESSION_HASH_SECRET: 'synthetic-private-session-key-0000' };
  assert.deepEqual(configurationIssues(configured), []);
  assert.ok(configurationIssues({ ...configured, PUBLIC_VOICE_GATEWAY_URL: 'ws://external.example.test/voice' }).some(issue => issue.code === 'invalid_public_voice_gateway'));
});

test('public health distinguishes liveness from readiness without disclosing configuration', async () => {
  const previous = process.env.APP_URL;
  process.env.APP_URL = 'private-invalid-configuration';
  try {
    const live = await GET(new Request('http://localhost/api/health'));
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { status: 'alive' });
    const ready = await GET(new Request('http://localhost/api/health?ready=1'));
    assert.equal(ready.status, 503);
    assert.equal(ready.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await ready.json(), { status: 'unavailable' });
  } finally {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  }
});
