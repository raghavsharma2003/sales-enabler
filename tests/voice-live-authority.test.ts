import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { db, type Database } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';
import { createRecord, getRecord, updateRecord } from '../lib/platform/records';
import { parseAgentConfig } from '../lib/platform/agents';
import { getUsageSnapshot, requestVoiceStop } from '../lib/usage/service';
import { activateVoiceLiveAuthority, claimVoiceLiveTicket, finishVoiceLiveAuthority, issueVoiceLiveGrant, recheckVoiceLiveAuthority, voiceLiveGatewayConfiguration } from '../lib/voice/voice-live-authority';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const origin = 'https://workspace.example.test';
const env = { NODE_ENV: 'test', VOICE_LIVE_GATEWAY_URL: 'wss://gateway.example.test/private-voice-live', AZURE_VOICE_LIVE_ENDPOINT: 'https://fixture.services.ai.azure.com', AZURE_SPEECH_KEY: 'fixture-only-not-a-real-key-123456789' };
const time = Date.parse('2026-10-10T12:00:00.000Z');
const relationship = { preferences: [], openCommitments: [], sourceIds: [], guidance: '', omittedCount: 0 };

async function fixture(options: { knowledge?: boolean; inputMode?: 'text' | 'microphone' } = {}) {
  const database = await db(), id = randomUUID(), organizationId = randomUUID();
  const user = { id, organizationId, email: `${id}@example.test` };
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [organizationId, 'Fictional Voice Live workspace', new Date(time).toISOString()] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [id, user.email, 'unused', organizationId, new Date(time).toISOString()] },
    ...ownerRegistrationStatements(user),
  ]);
  const source = options.knowledge ? await createRecord(user, 'brain_source', { title: 'Fixture knowledge', content: 'Synthetic source.' }, 'approved') : undefined;
  const config = parseAgentConfig({ name: 'Fixture AI', role: 'Company information', objective: 'Explain approved fictional company information.', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief', memoryScope: 'none', escalation: 'Refer unsupported questions to a human operator.', knowledgeIds: source ? [source.id] : [], enabledTools: [], liveVoice: { version: 1, engine: 'azure-voice-live', preset: 'taxila-diya' } });
  const data = { requestedBy: user.id, provider: 'azure', voiceTransport: 'voice_live', mode: 'internal_draft_test', inputMode: options.inputMode ?? 'text',
    config, contextDigest: 'fixture-context-digest', instructions: 'Server-compiled private instructions for a synthetic fixture.', openingMessage: 'I am an AI assistant. How can I help?', relationship,
    toolAuthority: { version: 1, contextMode: 'internal_operator_browser', contextDigest: 'fixture-context-digest', enabledTools: [], sources: [], expiresAt: new Date(time + 1800000).toISOString(), identityVerified: false } };
  const preview = await createRecord(user, 'voice_preview', data, 'connection_issued');
  let clock = time;
  const deps = { database, env, now: () => new Date(clock) };
  const requestId = randomUUID();
  const issue = () => issueVoiceLiveGrant(user, { previewId: preview.id, requestId, consent: true }, origin, deps);
  return { user, database, config, data, preview, source, deps, requestId, issue, advance: (ms: number) => { clock += ms; } };
}

test('gateway URLs require exact secure route or explicitly opted-in loopback', () => {
  assert.deepEqual(voiceLiveGatewayConfiguration({ PUBLIC_VOICE_GATEWAY_URL: 'wss://gateway.example.test/voice' }), { configured: true, url: 'wss://gateway.example.test/private-voice-live' });
  for (const url of ['ws://gateway.example.test/private-voice-live', 'wss://gateway.example.test/wrong', 'wss://key@gateway.example.test/private-voice-live', 'wss://gateway.example.test/private-voice-live?ticket=bad', 'ws://localhost:3001/private-voice-live']) assert.equal(voiceLiveGatewayConfiguration({ VOICE_LIVE_GATEWAY_URL: url }).configured, false);
  assert.equal(voiceLiveGatewayConfiguration({ VOICE_LIVE_GATEWAY_URL: 'ws://localhost:3001/private-voice-live', INFERENCE_ALLOW_LOCAL: 'true' }).configured, true);
});
test('grant contains only a single-use opaque token and reservation; claim binds the exact private engine context', async () => {
  const f = await fixture({ inputMode: 'microphone' }), grant = await f.issue();
  assert.deepEqual(Object.keys(grant).sort(), ['expiresAt', 'token', 'url', 'voiceAttemptId']);
  assert.match(grant.token, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(grant).includes(f.data.instructions), false);
  assert.equal(JSON.stringify(grant).includes(env.AZURE_SPEECH_KEY), false);
  const [ticket] = await f.database.all('SELECT data FROM entities WHERE organization_id = ? AND kind = ?', [f.user.organizationId, 'voice:live-ticket']);
  assert.equal(String(ticket.data).includes(grant.token), false);
  assert.equal(String(ticket.data).includes(f.data.instructions), false);
  const authority = await claimVoiceLiveTicket(grant.token, origin, f.deps);
  assert.equal(authority.userId, f.user.id); assert.equal(authority.voiceAttemptId, grant.voiceAttemptId);
  assert.equal(authority.instructions, f.data.instructions); assert.equal(authority.inputMode, 'microphone');
  assert.equal(authority.liveVoiceProfile.engine, 'azure-voice-live');
  assert.deepEqual(authority.behaviorContext.relationship, relationship);
  await recheckVoiceLiveAuthority(authority, f.deps);
  await activateVoiceLiveAuthority(authority, f.deps);
  assert.equal((await getUsageSnapshot(f.user, f.deps)).voice.attemptsSummary[0].state, 'active');
  await assert.rejects(claimVoiceLiveTicket(grant.token, origin, f.deps), /already used/);
  await assert.rejects(f.issue(), /already authorized/);
  assert.equal((await getUsageSnapshot(f.user, f.deps)).voice.attempts, 1);
});
test('concurrent ticket claims permit exactly one provider allocation authority', async () => {
  const f = await fixture(), grant = await f.issue();
  const results = await Promise.allSettled([claimVoiceLiveTicket(grant.token, origin, f.deps), claimVoiceLiveTicket(grant.token, origin, f.deps)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const [attempt] = await f.database.all('SELECT status,data FROM entities WHERE id = ?', [grant.voiceAttemptId]);
  assert.equal(attempt.status, 'connecting'); assert.equal(JSON.parse(String(attempt.data)).providerProvisioningStartedAt, new Date(time).toISOString());
});
test('expired tickets and incorrect origins cannot start paid upstream sessions', async () => {
  const f = await fixture(), grant = await f.issue();
  await assert.rejects(claimVoiceLiveTicket(grant.token, 'https://foreign.example.test', f.deps), /authorization is no longer available/);
  f.advance(60001);
  await assert.rejects(claimVoiceLiveTicket(grant.token, origin, f.deps), /expired or was already used/);
  assert.equal((await getUsageSnapshot(f.user, f.deps)).voice.attemptsSummary[0].state, 'reserved');
});
test('foreign tenants and actors cannot issue a grant for another preview', async () => {
  const f = await fixture(), other = await fixture();
  await assert.rejects(issueVoiceLiveGrant(other.user, { previewId: f.preview.id, requestId: randomUUID(), consent: true }, origin, other.deps), /not found/);
  await assert.rejects(issueVoiceLiveGrant({ ...other.user, organizationId: f.user.organizationId }, { previewId: f.preview.id, requestId: randomUUID(), consent: true }, origin, f.deps), /access has been removed/);
  assert.equal((await getUsageSnapshot(other.user, other.deps)).voice.attempts, 0);
});
test('a changed compiled preview or source revokes a claimed authority even without enabled tools', async () => {
  const f = await fixture({ knowledge: true }), grant = await f.issue(), authority = await claimVoiceLiveTicket(grant.token, origin, f.deps);
  await updateRecord(f.user, f.source!, { ...f.source!.data, content: 'Different source.' });
  await assert.rejects(recheckVoiceLiveAuthority(authority, f.deps), /authorization is no longer available/);
  await finishVoiceLiveAuthority(authority, { outcome: 'failed' }, f.deps);
  assert.equal((await getUsageSnapshot(f.user, f.deps)).voice.live, 0);
  const g = await fixture(), next = await g.issue(), claimed = await claimVoiceLiveTicket(next.token, origin, g.deps);
  const preview = await getRecord(g.user.organizationId, 'voice_preview', g.preview.id);
  await updateRecord(g.user, preview, { ...preview.data, instructions: 'Changed server context.' });
  await assert.rejects(recheckVoiceLiveAuthority(claimed, g.deps), /authorization is no longer available/);
});
test('cancellation and member removal revoke authority while confirmed owned closure still releases capacity', async () => {
  const f = await fixture(), grant = await f.issue(), authority = await claimVoiceLiveTicket(grant.token, origin, f.deps);
  await requestVoiceStop(f.user, grant.voiceAttemptId, f.deps);
  await assert.rejects(activateVoiceLiveAuthority(authority, f.deps), /authorization is no longer available/);
  await assert.rejects(recheckVoiceLiveAuthority(authority, f.deps), /authorization is no longer available/);
  await finishVoiceLiveAuthority(authority, { outcome: 'failed' }, f.deps);
  assert.equal((await getUsageSnapshot(f.user, f.deps)).voice.live, 0);
  const g = await fixture(), next = await g.issue(), claimed = await claimVoiceLiveTicket(next.token, origin, g.deps);
  await g.database.run('UPDATE entities SET status = ? WHERE id = ?', ['removed', `team:member:${g.user.id}`]);
  await assert.rejects(recheckVoiceLiveAuthority(claimed, g.deps), /access has been removed/);
  await finishVoiceLiveAuthority(claimed, { outcome: 'failed' }, g.deps);
  assert.equal((await getUsageSnapshot(g.user, g.deps)).voice.live, 0);
});
test('uncertain closure retains capacity and cannot replay; later actual closure releases once and ends tool authority', async () => {
  const f = await fixture(), grant = await f.issue(), authority = await claimVoiceLiveTicket(grant.token, origin, f.deps);
  await activateVoiceLiveAuthority(authority, f.deps);
  await finishVoiceLiveAuthority(authority, { outcome: 'uncertain' }, f.deps);
  assert.equal((await getUsageSnapshot(f.user, f.deps)).voice.live, 1);
  await assert.rejects(recheckVoiceLiveAuthority(authority, f.deps), /authorization is no longer available/);
  await assert.rejects(claimVoiceLiveTicket(grant.token, origin, f.deps), /already used/);
  const preview = await getRecord(f.user.organizationId, 'voice_preview', f.preview.id);
  assert.equal(preview.status, 'connection_issued'); assert.equal(typeof preview.data.toolEndedAt, 'string');
  await finishVoiceLiveAuthority(authority, { outcome: 'failed' }, f.deps);
  await finishVoiceLiveAuthority(authority, { outcome: 'failed' }, f.deps);
  const usage = await getUsageSnapshot(f.user, f.deps);
  assert.equal(usage.voice.live, 0); assert.equal(usage.voice.attempts, 1); assert.equal(usage.voice.reservedSeconds, 600);
});
test('mutated projection and replacement epoch cannot operate or finish another session', async () => {
  const f = await fixture(), grant = await f.issue(), authority = await claimVoiceLiveTicket(grant.token, origin, f.deps);
  await assert.rejects(recheckVoiceLiveAuthority({ ...authority, instructions: 'Forged instructions' }, f.deps), /authorization is no longer available/);
  await assert.rejects(finishVoiceLiveAuthority({ ...authority, sessionEpoch: randomUUID() }, { outcome: 'complete' }, f.deps), /authorization is no longer available/);
  assert.equal((await getUsageSnapshot(f.user, f.deps)).voice.live, 1);
});
test('stop racing the ticket claim rolls back both provisioning and ticket consumption', async () => {
  const f = await fixture(), grant = await f.issue(); let injected = false;
  const database: Database = { all: f.database.all.bind(f.database), run: f.database.run.bind(f.database), async batch(statements) {
    if (!injected && statements.some(s => s.params?.includes('claimed'))) {
      injected = true; await requestVoiceStop(f.user, grant.voiceAttemptId, f.deps);
    }
    return f.database.batch(statements);
  } };
  await assert.rejects(claimVoiceLiveTicket(grant.token, origin, { ...f.deps, database }), /expired or was cancelled/);
  const [ticket] = await f.database.all('SELECT status FROM entities WHERE organization_id = ? AND kind = ?', [f.user.organizationId, 'voice:live-ticket']);
  assert.equal(ticket.status, 'issued');
  const [attempt] = await f.database.all('SELECT data,status FROM entities WHERE id = ?', [grant.voiceAttemptId]);
  assert.equal(attempt.status, 'reserved'); assert.equal(JSON.parse(String(attempt.data)).providerProvisioningStartedAt, undefined);
});
