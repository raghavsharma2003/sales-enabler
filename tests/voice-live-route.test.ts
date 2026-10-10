import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { POST as connect } from '../app/api/voice/connect/route';
import { POST as control } from '../app/api/voice/control/route';
import { GET as configuration } from '../app/api/voice/config/route';
import { db } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';
import { createRecord, getRecord } from '../lib/platform/records';
import { createSession } from '../lib/server/store';
import { privateVoiceSupervisorHeartbeat } from '../lib/voice/supervisor';
import { claimVoiceLiveTicket, finishVoiceLiveAuthority } from '../lib/voice/voice-live-authority';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const origin = 'http://localhost:3000';
const liveVoice = { version: 1, engine: 'azure-voice-live', preset: 'taxila-diya' };
const draft = { name: 'Fixture assistant', role: 'Company information', objective: 'Answer approved company questions clearly.',
  disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief and clear',
  memoryScope: 'none', escalation: 'Refer unsupported requests to a human.', knowledgeIds: [], enabledTools: [], liveVoice };

async function fixture(t: TestContext, overrides: Record<string, string | undefined> = {}) {
  const environment: Record<string, string | undefined> = { NODE_ENV: 'test', APP_URL: origin, AUTH_REQUIRE_EMAIL_VERIFICATION: 'false', INFERENCE_ALLOW_LOCAL: 'true',
    INFERENCE_ALLOWED_ORGANIZATION_IDS: undefined, VOICE_PROVIDER: 'azure', AZURE_OPENAI_ENDPOINT: undefined, AZURE_OPENAI_API_KEY: undefined,
    AZURE_OPENAI_REALTIME_DEPLOYMENT: undefined, AZURE_VOICE_LIVE_ENDPOINT: 'https://fixture.services.ai.azure.com',
    AZURE_SPEECH_KEY: 'fixture-not-real-speech-secret-123456789', VOICE_LIVE_GATEWAY_URL: 'wss://gateway.example.test/private-voice-live', ...overrides };
  const saved = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(environment)) value === undefined ? delete process.env[key] : process.env[key] = value;
  let networkCalls = 0;
  globalThis.fetch = (async () => { networkCalls++; throw new Error('Unexpected network in Voice Live admission fixture.'); }) as typeof fetch;
  t.after(() => { globalThis.fetch = oldFetch; for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value; });
  const database = await db(), now = new Date().toISOString(), organizationId = randomUUID(), id = randomUUID();
  const user = { id, organizationId, email: `${id}@example.test` }, token = randomBytes(32).toString('hex');
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [organizationId, 'Synthetic Voice Live route', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [id, user.email, 'unused', organizationId, now] },
    ...ownerRegistrationStatements(user),
    { sql: 'INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)', params: [createHash('sha256').update(token).digest('hex'), id, new Date(Date.now() + 3600000).toISOString()] },
  ]);
  await privateVoiceSupervisorHeartbeat('healthy');
  const requestId = randomUUID();
  const request = (path: string, body?: object, requestOrigin = origin) => new Request(`${origin}${path}`, {
    method: body ? 'POST' : 'GET', headers: { Origin: requestOrigin, Cookie: `company_session=${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const start = (body: object = {}, requestOrigin = origin) => connect(request('/api/voice/connect', { mode: 'preview', inputMode: 'text', draft, consent: true, requestId, ...body }, requestOrigin));
  const end = () => control(request('/api/voice/control', { action: 'end', requestId }));
  const records = (kind: string) => database.all('SELECT id,status,data FROM entities WHERE organization_id = ? AND kind = ?', [organizationId, kind]);
  return { user, database, requestId, request, start, end, records, networkCalls: () => networkCalls };
}

test('Voice Live connect issues only a gateway ticket without SDP, provider secrets or Realtime fallback', async t => {
  const f = await fixture(t), response = await f.start({ provider: 'gemini', transport: 'webrtc', instructions: 'FORGED', voice: 'FORGED' });
  const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.provider, 'azure'); assert.equal(result.transport, 'voice-live'); assert.match(result.ticket, /^[a-f0-9]{64}$/);
  assert.equal(result.url, 'wss://gateway.example.test/private-voice-live'); assert.equal(result.sdp, undefined); assert.equal(f.networkCalls(), 0);
  for (const value of ['fixture-not-real-speech-secret', 'fixture.services.ai.azure.com', 'providerConfigurationDigest', 'sessionEpoch', 'memberDigest', 'sourcesDigest', 'FORGED']) assert.equal(JSON.stringify(result).includes(value), false, value);
  const [attempt] = await f.records('voice:attempt'); assert.equal(attempt.status, 'reserved'); assert.equal(JSON.parse(String(attempt.data)).purpose, 'voice_live');
  const [ticket] = await f.records('voice:live-ticket'); assert.equal(String(ticket.data).includes(result.ticket), false);
  const authority = await claimVoiceLiveTicket(result.ticket, origin);
  assert.equal(authority.previewId, result.previewId); assert.deepEqual(authority.liveVoiceProfile, liveVoice);
  assert.equal((await f.start()).status, 409); assert.equal(f.networkCalls(), 0);
  await finishVoiceLiveAuthority(authority, { outcome: 'complete' });
});

test('invalid selection, viewer role and foreign origin fail before ticket issuance or provider traffic', async t => {
  const f = await fixture(t);
  assert.equal((await f.start({ draft: { ...draft, liveVoice: { ...liveVoice, preset: 'arbitrary' } } })).status, 400);
  assert.equal((await f.start({}, 'https://foreign.example.test')).status, 403);
  const [row] = await f.database.all('SELECT data FROM entities WHERE id = ?', [`team:member:${f.user.id}`]);
  await f.database.run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify({ ...JSON.parse(String(row.data)), role: 'viewer' }), `team:member:${f.user.id}`]);
  assert.equal((await f.start()).status, 403);
  assert.equal((await f.records('voice:attempt')).length, 0); assert.equal((await f.records('voice:live-ticket')).length, 0); assert.equal(f.networkCalls(), 0);
});

test('released Voice Live snapshots cannot connect or be exposed as released voice configuration', async t => {
  const f = await fixture(t), agentId = randomUUID();
  const version = await createRecord(f.user, 'agent_version', { agentId, config: draft, knowledgeDigests: {} }, 'published');
  const release = await createRecord(f.user, 'release', { agentId, versionId: version.id, channel: 'browser' }, 'active');
  assert.equal((await f.start({ mode: 'release', agentId, versionId: version.id, releaseId: release.id })).status, 409);
  assert.equal((await configuration(f.request(`/api/voice/config?releaseId=${release.id}`))).status, 409);
  assert.equal((await f.records('voice:attempt')).length, 0); assert.equal(f.networkCalls(), 0);
});

test('private config query returns safe engine capability without granting allocation authority', async t => {
  const f = await fixture(t), path = `/api/voice/config?liveVoice=${encodeURIComponent(JSON.stringify(liveVoice))}`;
  const response = await configuration(f.request(path)), result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.configured, true); assert.equal(result.engine, 'azure-voice-live');
  for (const value of ['ticket', 'apiKey', 'fixture.services.ai.azure.com', 'fixture-not-real-speech-secret', 'providerConfigurationDigest']) assert.equal(JSON.stringify(result).includes(value), false);
  assert.equal((await configuration(new Request(`${origin}${path}`))).status, 401);
  assert.equal((await configuration(f.request(`${path}&releaseId=${randomUUID()}`))).status, 400);
  assert.equal((await f.records('voice:attempt')).length, 0); assert.equal(f.networkCalls(), 0);
});

test('End before connect and End after a lost grant forbid later ticket claims', async t => {
  const f = await fixture(t); assert.equal((await f.end()).status, 200); assert.equal((await f.start()).status, 409);
  const requestId = randomUUID(), response = await f.start({ requestId }), result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result));
  const ended = await control(f.request('/api/voice/control', { action: 'end', requestId })); assert.equal(ended.status, 200);
  await assert.rejects(claimVoiceLiveTicket(result.ticket, origin)); assert.equal(f.networkCalls(), 0);
});

test('confirmed gateway closure preserves issued-preview save authority and rejects foreign preview saves', async t => {
  const f = await fixture(t), result = await (await f.start()).json();
  const authority = await claimVoiceLiveTicket(result.ticket, origin); await finishVoiceLiveAuthority(authority, { outcome: 'complete' });
  const preview = await getRecord(f.user.organizationId, 'voice_preview', result.previewId);
  assert.equal(preview.status, 'connection_issued'); assert.ok(preview.data.toolEndedAt);
  const body = { source: 'browser_preview', previewId: result.previewId, channel: 'voice', transcript: [{ id: 'final-user', role: 'user', text: 'Synthetic question.' }] };
  const saved = await createSession(f.user, body); assert.equal(saved.previewId, result.previewId);
  assert.deepEqual(saved.previewConfig && (saved.previewConfig as { liveVoice: unknown }).liveVoice, liveVoice);
  await assert.rejects(createSession({ ...f.user, id: randomUUID() }, body), /issued to your account/);
  assert.equal(f.networkCalls(), 0);
});

for (const provider of ['openai', 'gemini']) test(`explicit Azure Realtime draft and release reject global ${provider} while absent legacy selection stays unchanged`, async t => {
  const f = await fixture(t, { VOICE_PROVIDER: provider, VOICE_TRANSPORT: undefined,
    OPENAI_API_KEY: 'fixture-openai-not-a-real-key', OPENAI_REALTIME_VOICE: undefined,
    GEMINI_API_KEY: 'fixture-gemini-not-a-real-key', GEMINI_LIVE_VOICE: undefined });
  const realtime = { version: 1, engine: 'azure-openai-realtime', preset: 'provider-default' };
  const selectedDraft = { ...draft, liveVoice: realtime };
  const selectedConfig = `/api/voice/config?liveVoice=${encodeURIComponent(JSON.stringify(realtime))}`;
  const response = await f.start({ draft: selectedDraft, sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' });
  assert.equal(response.status, 503); assert.match((await response.json()).error, /requires Azure OpenAI Realtime/);
  assert.equal((await configuration(f.request(selectedConfig))).status, 503);

  const agentId = randomUUID();
  const version = await createRecord(f.user, 'agent_version', { agentId, config: selectedDraft, knowledgeDigests: {} }, 'published');
  const release = await createRecord(f.user, 'release', { agentId, versionId: version.id, channel: 'browser' }, 'active');
  assert.equal((await configuration(f.request(`/api/voice/config?releaseId=${release.id}`))).status, 503);
  assert.equal((await f.start({ mode: 'release', agentId, versionId: version.id, releaseId: release.id, sdp: 'v=0\r\nm=audio' })).status, 503);

  const legacy = await configuration(f.request('/api/voice/config'));
  const legacyResult = await legacy.json(); assert.equal(legacy.status, 200);
  assert.equal(legacyResult.provider, provider); assert.equal(legacyResult.configured, true);
  const { liveVoice: _selection, ...legacyDraft } = draft;
  const legacyAgentId = randomUUID();
  const legacyVersion = await createRecord(f.user, 'agent_version', { agentId: legacyAgentId, config: legacyDraft, knowledgeDigests: {} }, 'published');
  const legacyRelease = await createRecord(f.user, 'release', { agentId: legacyAgentId, versionId: legacyVersion.id, channel: 'browser' }, 'active');
  const legacyReleaseResponse = await configuration(f.request(`/api/voice/config?releaseId=${legacyRelease.id}`));
  assert.equal(legacyReleaseResponse.status, 200); assert.deepEqual(await legacyReleaseResponse.json(), legacyResult);
  assert.equal((await f.records('voice:attempt')).length, 0); assert.equal((await f.records('voice:live-ticket')).length, 0);
  assert.equal(f.networkCalls(), 0);
});
