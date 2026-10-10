import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import { attachProviderCall, beginVoiceAttempt, bindVoiceAttemptCall, claimStop, getUsageSnapshot, listDueAttempts, markAttemptProvisioning, requestVoiceStop } from '../lib/usage/service';
import { azureCallConfigurationDigest } from '../lib/voice/call-control';
import { privateVoiceSupervisorHeartbeat, runPrivateVoiceSupervisor, runPrivateVoiceSupervisorTick, stopPrivateVoiceAttempt } from '../lib/voice/supervisor';
import { sourceDigest, type ToolRow } from '../lib/voice/tools/authority';
import { assertPrivateVoiceContactScope } from '../lib/voice/private-scope';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const env = { NODE_ENV: 'test', AZURE_OPENAI_ENDPOINT: 'https://fixture.openai.azure.com', AZURE_OPENAI_API_KEY: 'fixture-key' };
async function fixture() {
  const database = await db(), id = randomUUID();
  let time = Date.parse('2026-10-10T10:00:00.000Z');
  const user = { id, email: `${id}@example.test`, organizationId: `org-${id}` };
  await database.run('DELETE FROM entities WHERE kind = ?', ['voice:attempt']);
  await database.run('DELETE FROM service_heartbeats WHERE service = ?', ['private-voice-supervisor']);
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Fictional supervisor fixture', new Date(time).toISOString()] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [id, user.email, 'unused', user.organizationId, new Date(time).toISOString()] },
  ]);
  const deps = { database, env, now: () => new Date(time) };
  const receipt = await beginVoiceAttempt(user, { requestId: randomUUID(), provider: 'azure', purpose: 'private_webrtc', maxSeconds: 60 }, deps);
  const provision = async () => {
    assert.equal(await markAttemptProvisioning(user, receipt.id, deps), true);
    await attachProviderCall(user, receipt.id, 'rtc_fixture', deps, azureCallConfigurationDigest(env)!);
  };
  return { user, receipt, deps, provision, advance: (ms: number) => { time += ms; } };
}

test('deadline delegates authenticated hangup once across concurrent supervisor claims', async () => {
  const f = await fixture(); await f.provision();
  let calls = 0;
  const transport = (async () => { calls++; return new Response(null, { status: 200 }); }) as typeof fetch;
  assert.equal((await runPrivateVoiceSupervisorTick({ ...f.deps, transport })).claimed, 0);
  f.advance(60001);
  const results = await Promise.all([runPrivateVoiceSupervisorTick({ ...f.deps, transport }), runPrivateVoiceSupervisorTick({ ...f.deps, transport })]);
  assert.equal(calls, 1); assert.equal(results.reduce((n, r) => n + r.closed, 0), 1);
  const snapshot = await getUsageSnapshot(f.user, f.deps);
  assert.equal(snapshot.voice.live, 0); assert.equal(snapshot.voice.reservedSeconds, 60);
});

test('unconfirmed stop retains capacity, survives a new worker and caps durable retries', async () => {
  const f = await fixture(); await f.provision(); await requestVoiceStop(f.user, f.receipt.id, f.deps);
  let calls = 0;
  const transport = (async () => { calls++; return new Response(null, { status: 500 }); }) as typeof fetch;
  for (let i = 0; i < 5; i++) {
    const result = await runPrivateVoiceSupervisorTick({ ...f.deps, transport });
    assert.equal(result.uncertain, 1);
    assert.equal((await listDueAttempts(f.deps)).length, 0);
    f.advance(30000 * 2 ** i);
  }
  assert.equal((await runPrivateVoiceSupervisorTick({ ...f.deps, transport })).claimed, 0);
  assert.equal(calls, 5);
  const snapshot = await getUsageSnapshot(f.user, f.deps);
  assert.equal(snapshot.voice.live, 1); assert.equal(snapshot.voice.attemptsSummary[0].state, 'uncertain');
  assert.equal(JSON.stringify(snapshot).includes('rtc_fixture'), false);
  assert.equal(JSON.stringify(snapshot).includes('ConfigurationDigest'), false);
});

test('a crashed stop claimant is reclaimed after its durable lease', async () => {
  const f = await fixture(); await f.provision(); f.advance(60001);
  const claim = await claimStop({ id: f.receipt.id, organizationId: f.user.organizationId }, f.deps);
  assert.ok(claim);
  let calls = 0;
  const transport = (async () => { calls++; return new Response(null, { status: 200 }); }) as typeof fetch;
  assert.equal((await runPrivateVoiceSupervisorTick({ ...f.deps, transport })).claimed, 0);
  f.advance(30001);
  assert.equal((await runPrivateVoiceSupervisorTick({ ...f.deps, transport })).closed, 1);
  assert.equal(calls, 1);
});

test('allocation without a handle stays uncertain while an unprovisioned reservation closes safely', async () => {
  const f = await fixture();
  await markAttemptProvisioning(f.user, f.receipt.id, f.deps); f.advance(60001);
  const transport = (async () => { assert.fail('no call reference'); }) as typeof fetch;
  assert.equal((await runPrivateVoiceSupervisorTick({ ...f.deps, transport })).uncertain, 1);
  assert.equal((await getUsageSnapshot(f.user, f.deps)).voice.live, 1);
  const g = await fixture(); g.advance(60001);
  assert.equal((await runPrivateVoiceSupervisorTick({ ...g.deps, transport })).closed, 1);
});

test('changed provider configuration leaves the slot uncertain without outbound control', async () => {
  const f = await fixture(); await f.provision(); f.advance(60001);
  const outcome = await runPrivateVoiceSupervisorTick({ ...f.deps, env: { ...env, AZURE_OPENAI_API_KEY: 'rotated' }, transport: (async () => { assert.fail('configuration changed'); }) as typeof fetch });
  assert.equal(outcome.uncertain, 1);
  assert.equal((await getUsageSnapshot(f.user, f.deps)).voice.live, 1);
});

test('membership revocation and call-end binding trigger early confirmed cleanup', async () => {
  const f = await fixture(); await f.provision();
  await f.deps.database.run('UPDATE entities SET status = ? WHERE id = ?', ['removed', `team:member:${f.user.id}`]);
  let result = await runPrivateVoiceSupervisorTick({ ...f.deps, transport: (async () => new Response(null, { status: 200 })) as typeof fetch });
  assert.equal(result.revoked, 1); assert.equal(result.closed, 1);
  const g = await fixture(); await g.provision();
  const call = { requestedBy: g.user.id, provider: 'azure', mode: 'internal_draft_test', voiceAttemptId: g.receipt.id };
  await g.deps.database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', ['fixture-preview', g.user.organizationId, 'platform:voice_preview', 'connection_issued', JSON.stringify({ data: call, revision: 1 }), g.deps.now().toISOString()]);
  await bindVoiceAttemptCall(g.user, g.receipt.id, { kind: 'voice_preview', id: 'fixture-preview' }, g.deps);
  await g.deps.database.run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify({ data: { ...call, toolEndedAt: g.deps.now().toISOString() }, revision: 2 }), 'fixture-preview']);
  result = await runPrivateVoiceSupervisorTick({ ...g.deps, transport: (async () => new Response(null, { status: 200 })) as typeof fetch });
  assert.equal(result.revoked, 1); assert.equal(result.closed, 1);
});

test('revoked source anchors stop a bound call before its deadline', async () => {
  const f = await fixture(); await f.provision();
  const source: ToolRow = { id: 'supervisor-memory', kind: 'memory', status: 'approved', data: JSON.stringify({ text: 'fictional approved note' }), created_at: f.deps.now().toISOString() };
  await f.deps.database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [source.id, f.user.organizationId, source.kind, source.status, source.data, source.created_at]);
  const call = { requestedBy: f.user.id, provider: 'azure', mode: 'internal_draft_test', voiceAttemptId: f.receipt.id, toolAuthority: { expiresAt: new Date(f.deps.now().getTime() + 60000).toISOString(), sources: [{ id: source.id, kind: source.kind, digest: sourceDigest(source) }] } };
  await f.deps.database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', ['source-preview', f.user.organizationId, 'platform:voice_preview', 'connection_issued', JSON.stringify({ data: call, revision: 1 }), f.deps.now().toISOString()]);
  await bindVoiceAttemptCall(f.user, f.receipt.id, { kind: 'voice_preview', id: 'source-preview' }, f.deps);
  let calls = 0;
  const transport = (async () => { calls++; return new Response(null, { status: 200 }); }) as typeof fetch;
  assert.equal((await runPrivateVoiceSupervisorTick({ ...f.deps, transport })).claimed, 0);
  await f.deps.database.run('UPDATE entities SET status = ? WHERE id = ?', ['revoked', source.id]);
  const result = await runPrivateVoiceSupervisorTick({ ...f.deps, transport });
  assert.equal(result.revoked, 1); assert.equal(result.closed, 1); assert.equal(calls, 1);
});

test('supervisor heartbeat enables local admission and stops on graceful shutdown', async () => {
  const f = await fixture();
  const local = { ...f.deps, env: { ...env, APP_URL: 'http://localhost:3000', INFERENCE_ALLOW_LOCAL: 'true', VOICE_MAX_LIVE_PER_USER: '3' } };
  await assert.rejects(beginVoiceAttempt(f.user, { requestId: randomUUID(), provider: 'azure', purpose: 'private_webrtc' }, local), /supervision is unavailable/);
  await privateVoiceSupervisorHeartbeat('healthy', local);
  await beginVoiceAttempt(f.user, { requestId: randomUUID(), provider: 'azure', purpose: 'private_webrtc' }, local);
  f.advance(30001);
  await assert.rejects(beginVoiceAttempt(f.user, { requestId: randomUUID(), provider: 'azure', purpose: 'private_webrtc' }, local), /supervision is unavailable/);
  const controller = new AbortController();
  const database = { ...f.deps.database, run: async (sql: string, params?: Array<string | number | null>) => {
    const result = await f.deps.database.run(sql, params);
    if (sql.startsWith('INSERT INTO service_heartbeats') && params?.[2] === 'healthy') controller.abort();
    return result;
  } };
  await runPrivateVoiceSupervisor({ ...f.deps, database, signal: controller.signal });
  const [row] = await f.deps.database.all('SELECT status FROM service_heartbeats WHERE service = ?', ['private-voice-supervisor']);
  assert.equal(row.status, 'stopped');
});

test('linked contact preflight and ongoing supervisor use the same consent boundary', async () => {
  const f = await fixture(), contactId = randomUUID();
  await assertPrivateVoiceContactScope(f.user, undefined, { database: f.deps.database });
  await assert.rejects(assertPrivateVoiceContactScope(f.user, contactId, { database: f.deps.database }), /Browser voice consent is required/);
  const profileId = `customer-profile:${createHash('sha256').update(JSON.stringify([f.user.organizationId, contactId])).digest('hex')}`;
  await f.deps.database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [contactId, f.user.organizationId, 'contact', 'active', '{}', f.deps.now().toISOString()]);
  const profile = { data: { contactId, consent: { browser_voice: { granted: true } } }, revision: 1 };
  await f.deps.database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [profileId, f.user.organizationId, 'platform:customer_profile', 'active', JSON.stringify(profile), f.deps.now().toISOString()]);
  await assertPrivateVoiceContactScope(f.user, contactId, { database: f.deps.database });
  await assert.rejects(assertPrivateVoiceContactScope({ organizationId: 'other-org' }, contactId, { database: f.deps.database }), /Browser voice consent is required/);
  await f.provision();
  const call = { requestedBy: f.user.id, provider: 'azure', mode: 'internal_draft_test', voiceAttemptId: f.receipt.id, contactId };
  const callId = randomUUID();
  await f.deps.database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [callId, f.user.organizationId, 'platform:voice_preview', 'connection_issued', JSON.stringify({ data: call, revision: 1 }), f.deps.now().toISOString()]);
  await bindVoiceAttemptCall(f.user, f.receipt.id, { kind: 'voice_preview', id: callId }, f.deps);
  let calls = 0;
  const transport = (async () => { calls++; return new Response(null, { status: 200 }); }) as typeof fetch;
  assert.equal((await runPrivateVoiceSupervisorTick({ ...f.deps, transport })).claimed, 0);
  for (const restriction of [{ optOut: true }, { doNotContact: true }, { consent: 'denied' }]) {
    await f.deps.database.run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify(restriction), contactId]);
    await assert.rejects(assertPrivateVoiceContactScope(f.user, contactId, { database: f.deps.database }), /Browser voice consent is required/);
  }
  await f.deps.database.run('UPDATE entities SET data = ? WHERE id = ?', ['{}', contactId]);
  await f.deps.database.run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify({ data: { ...profile.data, consent: { browser_voice: { granted: false } } }, revision: 2 }), profileId]);
  await assert.rejects(assertPrivateVoiceContactScope(f.user, contactId, { database: f.deps.database }), /Browser voice consent is required/);
  const result = await runPrivateVoiceSupervisorTick({ ...f.deps, transport });
  assert.equal(result.revoked, 1); assert.equal(result.closed, 1); assert.equal(calls, 1);
});

test('immediate stop acts only on the exact tenant-owned requested attempt', async () => {
  const f = await fixture(); await f.provision();
  const deps = { ...f.deps, env: { ...env, VOICE_MAX_LIVE_PER_USER: '3' } };
  const other = await beginVoiceAttempt(f.user, { requestId: randomUUID(), provider: 'azure', purpose: 'private_webrtc', maxSeconds: 60 }, deps);
  await markAttemptProvisioning(f.user, other.id, deps);
  await attachProviderCall(f.user, other.id, 'rtc_other', deps, azureCallConfigurationDigest(env)!);
  let calls = 0;
  const transport = (async url => { calls++; assert.equal(String(url).endsWith('/rtc_fixture/hangup'), true); return new Response(null, { status: 200 }); }) as typeof fetch;
  assert.equal((await stopPrivateVoiceAttempt({ id: f.receipt.id, organizationId: 'wrong-org' }, { ...deps, transport })).state, 'not_claimed');
  assert.equal((await stopPrivateVoiceAttempt({ id: f.receipt.id, organizationId: f.user.organizationId }, { ...deps, transport })).state, 'not_claimed');
  await requestVoiceStop(f.user, f.receipt.id, deps);
  assert.deepEqual(await stopPrivateVoiceAttempt({ id: f.receipt.id, organizationId: f.user.organizationId }, { ...deps, transport }), { state: 'closed', claimed: true });
  assert.equal(calls, 1);
  const snapshot = await getUsageSnapshot(f.user, deps);
  assert.equal(snapshot.voice.live, 1);
  assert.equal(snapshot.voice.attemptsSummary.find(a => a.id === other.id)?.state, 'active');
});

test('stop defers pending allocation without consuming claims and accepts its late call handle', async () => {
  const f = await fixture(); f.advance(50000);
  await markAttemptProvisioning(f.user, f.receipt.id, f.deps);
  await requestVoiceStop(f.user, f.receipt.id, f.deps);
  const ref = { id: f.receipt.id, organizationId: f.user.organizationId };
  let calls = 0;
  const transport = (async () => { calls++; return new Response(null, { status: 200 }); }) as typeof fetch;
  f.advance(10000); // Reservation age exceeds 55s; actual provisioning age does not.
  for (let i = 0; i < 6; i++) assert.deepEqual(await stopPrivateVoiceAttempt(ref, { ...f.deps, transport }), { state: 'deferred', claimed: false });
  const [row] = await f.deps.database.all('SELECT data FROM entities WHERE id = ?', [ref.id]);
  assert.equal(JSON.parse(String(row.data)).stopAttempts, undefined);
  assert.equal(calls, 0);
  await attachProviderCall(f.user, ref.id, 'rtc_late', f.deps, azureCallConfigurationDigest(env)!);
  assert.deepEqual(await stopPrivateVoiceAttempt(ref, { ...f.deps, transport }), { state: 'closed', claimed: true });
  assert.equal(calls, 1);
  const g = await fixture(); await markAttemptProvisioning(g.user, g.receipt.id, g.deps); await requestVoiceStop(g.user, g.receipt.id, g.deps); g.advance(55001);
  assert.deepEqual(await stopPrivateVoiceAttempt({ id: g.receipt.id, organizationId: g.user.organizationId }, { ...g.deps, transport }), { state: 'uncertain', claimed: true });
  assert.equal(calls, 1);
});
