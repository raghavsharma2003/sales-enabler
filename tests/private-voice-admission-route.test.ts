import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { POST as connect } from '../app/api/voice/connect/route';
import { POST as control } from '../app/api/voice/control/route';
import { db } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';
import { createContact } from '../lib/server/store';
import { createRecord } from '../lib/platform/records';
import { getUsageSnapshot } from '../lib/usage/service';
import { privateVoiceSupervisorHeartbeat } from '../lib/voice/supervisor';
import { azureCallConfigurationDigest } from '../lib/voice/call-control';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const origin = 'http://localhost:3000';
const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const draft = { name: 'Fixture assistant', role: 'Company information', objective: 'Answer approved company questions clearly.',
  disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief and clear',
  memoryScope: 'none', escalation: 'Refer unsupported requests to a human.', knowledgeIds: [], enabledTools: [] };
const baselineEnv: Record<string, string | undefined> = {
  NODE_ENV: 'development', APP_URL: origin, AUTH_REQUIRE_EMAIL_VERIFICATION: 'false', INFERENCE_ALLOW_LOCAL: 'true',
  INFERENCE_ALLOWED_ORGANIZATION_IDS: undefined, VOICE_PROVIDER: 'azure', VOICE_TRANSPORT: undefined,
  AZURE_OPENAI_ENDPOINT: 'https://fixture.openai.azure.com', AZURE_OPENAI_API_KEY: 'fixture-resource-secret',
  AZURE_OPENAI_REALTIME_DEPLOYMENT: 'fixture-realtime', AZURE_OPENAI_REALTIME_VOICE: 'marin',
  VOICE_MAX_LIVE_PER_USER: '1', VOICE_MAX_LIVE_PER_ORG: '3', VOICE_DAILY_ORG_ATTEMPT_BUDGET: '50', VOICE_DAILY_ORG_SECONDS_BUDGET: '30000',
};

async function fixture(t: TestContext, options: {
  env?: Record<string, string | undefined>; heartbeat?: boolean; secretStatus?: number; callStatus?: number;
  location?: string | null; answer?: string; hangupStatus?: number; onCall?: () => Promise<void>;
} = {}) {
  const environment = { ...baselineEnv, ...options.env };
  const savedEnv = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(environment)) value === undefined ? delete process.env[key] : process.env[key] = value;
  const fetchBefore = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = fetchBefore;
    for (const [key, value] of Object.entries(savedEnv)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });
  const database = await db(), id = randomUUID(), organizationId = randomUUID(), now = new Date().toISOString();
  const user = { id, organizationId, email: `${id}@example.test` }, token = randomBytes(32).toString('hex');
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [organizationId, 'Synthetic route fixture', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [id, user.email, 'unused', organizationId, now] },
    ...ownerRegistrationStatements(user),
    { sql: 'INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)', params: [createHash('sha256').update(token).digest('hex'), id, new Date(Date.now() + 3600000).toISOString()] },
  ]);
  await privateVoiceSupervisorHeartbeat(options.heartbeat === false ? 'stopped' : 'healthy');
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input); calls.push({ url, init });
    assert.ok(url.startsWith('https://fixture.openai.azure.com/openai/v1/realtime/'), 'all vendor traffic stays in the mock');
    if (url.endsWith('/client_secrets')) {
      assert.equal(new Headers(init?.headers).get('api-key'), baselineEnv.AZURE_OPENAI_API_KEY);
      return Response.json({ value: 'fixture-ephemeral-secret' }, { status: options.secretStatus ?? 200 });
    }
    if (url.endsWith('/calls')) {
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-ephemeral-secret');
      assert.equal(init?.body, sdp);
      await options.onCall?.();
      return new Response(options.answer ?? sdp, { status: options.callStatus ?? 201,
        headers: options.location === null ? {} : { Location: options.location ?? '/openai/v1/realtime/calls/rtc_fixture' } });
    }
    assert.equal(url, 'https://fixture.openai.azure.com/openai/v1/realtime/calls/rtc_fixture/hangup');
    return new Response(null, { status: options.hangupStatus ?? 200 });
  }) as typeof fetch;
  const requestId = randomUUID();
  const request = (path: string, body: object, signal?: AbortSignal) => new Request(`${process.env.APP_URL}${path}`, {
    method: 'POST', headers: { Origin: process.env.APP_URL!, Cookie: `company_session=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal,
  });
  const start = (body: object = {}, signal?: AbortSignal) => connect(request('/api/voice/connect', { mode: 'preview', draft, sdp, consent: true, requestId, ...body }, signal));
  const end = () => control(request('/api/voice/control', { action: 'end', requestId }));
  const attempts = async () => (await database.all('SELECT data FROM entities WHERE organization_id = ? AND kind = ?', [organizationId, 'voice:attempt'])).map(row => JSON.parse(String(row.data)));
  const issued = () => database.all('SELECT id,data FROM entities WHERE organization_id = ? AND kind IN (?,?)', [organizationId, 'platform:voice_preview', 'platform:voice_connection']);
  return { user, database, calls, requestId, start, end, attempts, issued };
}

test('real connect route binds an issued call and never returns provider secrets or duplicate allocations', { concurrency: false }, async t => {
  const f = await fixture(t), response = await f.start(), result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  const serialized = JSON.stringify(result);
  for (const privateValue of ['providerCallRef', 'providerConfigurationDigest', 'rtc_fixture', 'fixture-resource-secret', 'fixture-ephemeral-secret', azureCallConfigurationDigest(process.env)!]) assert.equal(serialized.includes(privateValue), false);
  const [attempt] = await f.attempts(), [record] = await f.issued();
  assert.equal(attempt.providerCallRef, 'rtc_fixture'); assert.equal(attempt.providerConfigurationDigest, azureCallConfigurationDigest(process.env));
  assert.equal(attempt.state, 'active'); assert.equal(attempt.id, result.voiceAttemptId);
  assert.deepEqual(attempt.callRecord, { kind: 'voice_preview', id: result.previewId });
  assert.equal(JSON.parse(String(record.data)).data.voiceAttemptId, attempt.id);
  assert.equal(f.calls.length, 2);
  assert.equal((await f.start()).status, 409); assert.equal(f.calls.length, 2, 'a replay cannot mint a new client secret or call');
  const end = await f.end(); assert.equal(end.status, 200); assert.equal((await end.json()).state, 'closed');
  assert.equal((await getUsageSnapshot(f.user)).voice.live, 0);
  await f.end(); assert.equal(f.calls.filter(call => call.url.endsWith('/hangup')).length, 1);
});

test('released calling binds the issued connection to its admitted attempt', { concurrency: false }, async t => {
  const f = await fixture(t), agentId = randomUUID();
  const version = await createRecord(f.user, 'agent_version', { agentId, config: draft, knowledgeDigests: {} }, 'published');
  const release = await createRecord(f.user, 'release', { agentId, versionId: version.id, channel: 'browser' }, 'active');
  const response = await f.start({ mode: 'release', agentId, versionId: version.id, releaseId: release.id });
  const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.previewId, undefined);
  const [attempt] = await f.attempts(), [record] = await f.issued();
  assert.deepEqual(attempt.callRecord, { kind: 'voice_connection', id: result.connectionId });
  assert.equal(JSON.parse(String(record.data)).data.voiceAttemptId, result.voiceAttemptId);
  assert.equal(JSON.stringify(result).includes('rtc_fixture'), false);
  assert.equal((await (await f.end()).json()).state, 'closed');
});

for (const gate of ['hosted', 'supervisor'] as const) test(`${gate} admission fails before vendor allocation`, { concurrency: false }, async t => {
  const f = await fixture(t, gate === 'hosted' ? { env: { APP_URL: 'https://unapproved.example.test' } } : { heartbeat: false });
  const response = await f.start();
  assert.equal(response.status, gate === 'hosted' ? 403 : 503);
  assert.equal(f.calls.length, 0); assert.equal((await f.attempts()).length, 0); assert.equal((await f.issued()).length, 0);
});

test('unconsented contact preflight prevents both reservation and vendor traffic', { concurrency: false }, async t => {
  const f = await fixture(t), contact = await createContact(f.user, { name: 'Synthetic unconsented customer' });
  const response = await f.start({ contactId: contact.id });
  assert.equal(response.status, 403); assert.match((await response.json()).error, /consent/i);
  assert.equal(f.calls.length, 0); assert.equal((await f.attempts()).length, 0);
});

test('client-secret failure is definitively pre-allocation and releases live capacity', { concurrency: false }, async t => {
  const f = await fixture(t, { secretStatus: 503 });
  assert.equal((await f.start()).status, 502);
  assert.equal(f.calls.length, 1); assert.equal((await f.issued()).length, 0);
  const usage = await getUsageSnapshot(f.user);
  assert.equal(usage.voice.live, 0); assert.equal(usage.voice.attempts, 1); assert.equal(usage.voice.reservedSeconds, 600);
});

for (const failure of ['missing-location', 'call-5xx'] as const) test(`${failure} stays uncertain and retains live capacity`, { concurrency: false }, async t => {
  const f = await fixture(t, { location: null, ...(failure === 'call-5xx' ? { callStatus: 503 } : {}) });
  assert.equal((await f.start()).status, 502);
  assert.equal((await f.issued()).length, 0);
  const [attempt] = await f.attempts();
  assert.notEqual(attempt.state, 'closed'); assert.equal(attempt.providerCallRef, undefined);
  assert.equal((await getUsageSnapshot(f.user)).voice.live, 1);
  assert.equal((await f.end()).status, 200); assert.equal(f.calls.length, 2, 'no handle means no guessed hangup');
});

test('malformed SDP keeps a valid Location for durable confirmed cleanup', { concurrency: false }, async t => {
  const f = await fixture(t, { answer: 'invalid answer' });
  assert.equal((await f.start()).status, 502); assert.equal((await f.issued()).length, 0);
  assert.equal((await f.attempts())[0].providerCallRef, 'rtc_fixture');
  assert.equal((await getUsageSnapshot(f.user)).voice.live, 1);
  assert.equal((await (await f.end()).json()).state, 'closed');
  assert.equal((await getUsageSnapshot(f.user)).voice.live, 0);
});

test('control before connect durably cancels the exact request without allocating', { concurrency: false }, async t => {
  const f = await fixture(t);
  assert.equal((await (await f.end()).json()).state, 'closed');
  assert.equal((await f.start()).status, 409);
  assert.equal(f.calls.length, 0); assert.equal((await f.issued()).length, 0);
  assert.equal((await getUsageSnapshot(f.user)).voice.attempts, 0);
});

test('control during negotiation fences ready issuance and retains the late cleanup handle', { concurrency: false }, async t => {
  let cancel!: () => Promise<Response>, controlResult: any;
  const f = await fixture(t, { onCall: async () => { controlResult = await (await cancel()).json(); } });
  cancel = f.end;
  const response = await f.start();
  assert.equal(response.status, 409); assert.equal(controlResult.state, 'deferred');
  assert.equal((await f.issued()).length, 0);
  const [attempt] = await f.attempts();
  assert.equal(attempt.providerCallRef, 'rtc_fixture'); assert.notEqual(attempt.state, 'active');
  assert.equal((await getUsageSnapshot(f.user)).voice.live, 1);
  assert.equal((await (await f.end()).json()).state, 'closed');
});

test('browser request abort during negotiation cannot discard the returned provider handle', { concurrency: false }, async t => {
  const abort = new AbortController(), f = await fixture(t, { onCall: async () => { abort.abort(); } });
  assert.equal((await f.start({}, abort.signal)).status, 409);
  assert.equal((await f.issued()).length, 0); assert.equal((await f.attempts())[0].providerCallRef, 'rtc_fixture');
  assert.equal((await (await f.end()).json()).state, 'closed');
});

test('a non-200 hangup cannot falsely release route-owned live capacity', { concurrency: false }, async t => {
  const f = await fixture(t, { hangupStatus: 404 });
  assert.equal((await f.start()).status, 200);
  assert.equal((await (await f.end()).json()).state, 'uncertain');
  assert.equal((await getUsageSnapshot(f.user)).voice.live, 1);
});
