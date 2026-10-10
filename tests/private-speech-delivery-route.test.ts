import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { POST } from '../app/api/voice/connect/route';
import { db } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';
import { createRecord } from '../lib/platform/records';
import { privateVoiceSupervisorHeartbeat } from '../lib/voice/supervisor';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const origin = 'http://localhost:3000';
const speechDelivery = { version: 1, pace: 'unhurried', adaptToRequests: true };
const draft = { name: 'Fixture assistant', role: 'Company information', objective: 'Answer approved company questions clearly.',
  disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief and clear',
  memoryScope: 'none', escalation: 'Refer unsupported requests to a human.', knowledgeIds: [], enabledTools: [], speechDelivery };

for (const mode of ['preview', 'release'] as const) test(`private ${mode} provisions and returns only server-selected frozen speech delivery`, async t => {
  const environment: Record<string, string | undefined> = { NODE_ENV: 'development', APP_URL: origin, AUTH_REQUIRE_EMAIL_VERIFICATION: 'false', INFERENCE_ALLOW_LOCAL: 'true',
    INFERENCE_ALLOWED_ORGANIZATION_IDS: undefined, VOICE_PROVIDER: 'azure', VOICE_TRANSPORT: undefined,
    AZURE_OPENAI_ENDPOINT: 'https://fixture.openai.azure.com', AZURE_OPENAI_API_KEY: 'fixture', AZURE_OPENAI_REALTIME_DEPLOYMENT: 'fixture', AZURE_OPENAI_REALTIME_VOICE: 'marin' };
  const original = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(environment)) value === undefined ? delete process.env[key] : process.env[key] = value;
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; for (const [key, value] of Object.entries(original)) value === undefined ? delete process.env[key] : process.env[key] = value; });
  const database = await db(), id = randomUUID(), organizationId = randomUUID(), now = new Date().toISOString();
  const user = { id, organizationId, email: `${id}@example.test` }, token = randomBytes(32).toString('hex');
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [organizationId, 'Synthetic speech fixture', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [id, user.email, 'unused', organizationId, now] },
    ...ownerRegistrationStatements(user),
    { sql: 'INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)', params: [createHash('sha256').update(token).digest('hex'), id, new Date(Date.now() + 3600000).toISOString()] },
  ]);
  await privateVoiceSupervisorHeartbeat('healthy');
  let provisioned: Record<string, any> | undefined;
  globalThis.fetch = (async (url, init) => {
    assert.ok(String(url).startsWith('https://fixture.openai.azure.com/openai/v1/realtime/'));
    if (String(url).endsWith('/client_secrets')) { provisioned = JSON.parse(String(init?.body)); return Response.json({ value: 'fixture-token' }); }
    return new Response('v=0\r\nm=audio', { status: 201, headers: { Location: '/openai/v1/realtime/calls/rtc_fixture' } });
  }) as typeof fetch;
  let selected: Record<string, unknown> = { draft };
  if (mode === 'release') {
    const agentId = randomUUID();
    const version = await createRecord(user, 'agent_version', { agentId, config: draft, knowledgeDigests: {} }, 'published');
    const release = await createRecord(user, 'release', { agentId, versionId: version.id, channel: 'browser' }, 'active');
    selected = { agentId, versionId: version.id, releaseId: release.id, draft: { ...draft, speechDelivery: { ...speechDelivery, pace: 'standard' } } };
  }
  const response = await POST(new Request(`${origin}/api/voice/connect`, { method: 'POST',
    headers: { Origin: origin, Cookie: `company_session=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, ...selected, sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', consent: true, requestId: randomUUID(),
      speechDelivery: { version: 1, pace: 'standard', adaptToRequests: false } }) }));
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(provisioned?.session.audio.output.speed, 0.9);
  assert.deepEqual(result.behaviorContext.speechDelivery, speechDelivery);
});
