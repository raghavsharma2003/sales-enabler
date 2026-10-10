import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { AuthUser } from '../lib/server/auth';
import { db, type Database } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';
import { createRecord, updateRecord } from '../lib/platform/records';
import { runAiTask } from '../lib/ai/task-router';
import { assertInferenceAccess, assertVoiceAttemptActive, attachProviderCall, beginVoiceAttempt, bindVoiceAttemptCall, claimStop, closeOwnedVoiceAttempt, failVoiceAttempt, getUsageSnapshot, inferenceConfiguration, listDueAttempts, markAttemptProvisioning, recordStop, requestVoiceStop, requestVoiceStopByRequest } from '../lib/usage/service';

process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'usage-admission-')), 'test.sqlite');
const fixed = new Date('2026-10-10T12:00:00.000Z');
const deps = { env: { NODE_ENV: 'test' }, now: () => fixed };
const input = (requestId: string = randomUUID()) => ({ requestId, provider: 'azure' as const, purpose: 'private_webrtc' as const });
async function actor(organizationId: string = randomUUID()): Promise<AuthUser> {
  const database = await db(), id = randomUUID(), user = { id, organizationId, email: `${id}@example.test` };
  await database.run('INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING', [organizationId, 'Fictional', fixed.toISOString()]);
  await database.run('INSERT INTO users (id, email, password_hash, organization_id, created_at) VALUES (?, ?, ?, ?, ?)', [id, user.email, 'none', organizationId, fixed.toISOString()]);
  const statements = ownerRegistrationStatements(user);
  if ((await database.all('SELECT id FROM entities WHERE id = ?', [`team:state:${organizationId}`])).length) await database.batch(statements.slice(1));
  else await database.batch(statements);
  return user;
}
async function heartbeat(now = fixed) {
  await (await db()).run('INSERT INTO service_heartbeats (id, service, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET status = ?, updated_at = ?', ['private-voice-supervisor', 'private-voice-supervisor', 'healthy', now.toISOString(), 'healthy', now.toISOString()]);
}
test('hosted origins fail closed even in development; only configured platform activation admits', async () => {
  const user = await actor(), publicEnv = { NODE_ENV: 'development', APP_URL: 'https://workspace.example.test', INFERENCE_ALLOW_LOCAL: 'true' };
  await assert.rejects(assertInferenceAccess(user, { env: publicEnv }), /activation is pending/);
  await assertInferenceAccess(user, { env: { ...publicEnv, INFERENCE_ALLOWED_ORGANIZATION_IDS: user.organizationId } });
  for (const mode of ['production', 'development', undefined]) {
    await assert.rejects(assertInferenceAccess(user, { env: { NODE_ENV: mode } }), error => error instanceof Error && 'status' in error && error.status === 503 && /application origin/.test(error.message));
  }
  await assertInferenceAccess(user, { env: { NODE_ENV: 'test' } });
  await assert.rejects(assertInferenceAccess(user, { env: { NODE_ENV: 'test', APP_URL: 'https://workspace.example.test' } }), /activation is pending/);
  await assert.rejects(assertInferenceAccess(user, { env: { APP_URL: 'http://127.0.0.1:3000' } }), /activation is pending/);
  await assertInferenceAccess(user, { env: { APP_URL: 'http://127.0.0.1:3000', INFERENCE_ALLOW_LOCAL: 'true' } });
  assert.equal(inferenceConfiguration(publicEnv).aiTokenLimit, 100000);
  assert.throws(() => inferenceConfiguration({ ...publicEnv, AI_DAILY_ORG_TOKEN_BUDGET: 'Infinity' }), /misconfigured/);
});
test('unadmitted AI requests never allocate provider or reservation', async () => {
  const user = await actor(); let calls = 0;
  await assert.rejects(runAiTask(user, { requestId: 'blocked', task: 'answer', system: 'Test', input: 'Fictional' }, { env: { NODE_ENV: 'development', APP_URL: 'https://public.example.test' }, fetch: (async () => { calls++; throw new Error(); }) as typeof fetch }), /activation is pending/);
  assert.equal(calls, 0);
  assert.equal((await getUsageSnapshot(user, deps)).ai.budgetTokensUsed, 0);
});
test('concurrent same-ID starts replay one reservation and provision exactly once', async () => {
  const user = await actor(), request = input();
  const starts = await Promise.all([beginVoiceAttempt(user, request, deps), beginVoiceAttempt(user, request, deps)]);
  assert.equal(starts[0].id, starts[1].id);
  assert.equal(starts.filter(r => !r.replayed).length, 1);
  const claims = await Promise.all([markAttemptProvisioning(user, starts[0].id, deps), markAttemptProvisioning(user, starts[0].id, deps)]);
  assert.equal(claims.filter(Boolean).length, 1);
  const [stored] = await (await db()).all('SELECT data FROM entities WHERE id = ?', [starts[0].id]);
  assert.equal(JSON.parse(String(stored.data)).providerProvisioningStartedAt, fixed.toISOString());
  await assert.rejects(beginVoiceAttempt(user, { ...request, maxSeconds: 40 }, deps), /different input/);
  assert.equal((await getUsageSnapshot(user, deps)).voice.attempts, 1);
});
test('organization and daily budgets fence concurrent users, unknown outcomes retain allowances', async () => {
  const first = await actor(), second = await actor(first.organizationId), third = await actor(first.organizationId), fourth = await actor(first.organizationId);
  const results = await Promise.allSettled([first, second, third, fourth].map(user => beginVoiceAttempt(user, input(), deps)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  const granted = results.findIndex(r => r.status === 'fulfilled'), saved = results[granted] as PromiseFulfilledResult<Awaited<ReturnType<typeof beginVoiceAttempt>>>;
  await failVoiceAttempt([first, second, third, fourth][granted], saved.value.id, { definitivePreProviderFailure: false }, deps);
  assert.equal((await getUsageSnapshot(first, deps)).voice.live, 3);
  assert.equal((await getUsageSnapshot(first, deps)).voice.reservedSeconds, 1800);
  const a = await actor(), b = await actor(a.organizationId), budget = { ...deps, env: { NODE_ENV: 'test', VOICE_DAILY_ORG_SECONDS_BUDGET: '600' } };
  const race = await Promise.allSettled([beginVoiceAttempt(a, input(), budget), beginVoiceAttempt(b, input(), budget)]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
});
test('definitive pre-provider failure releases concurrency but not daily attempt or seconds', async () => {
  const user = await actor(), budget = { ...deps, env: { NODE_ENV: 'test', VOICE_DAILY_ORG_ATTEMPT_BUDGET: '1' } };
  const a = await beginVoiceAttempt(user, input(), budget);
  await failVoiceAttempt(user, a.id, { definitivePreProviderFailure: true }, budget);
  const snapshot = await getUsageSnapshot(user, budget);
  assert.equal(snapshot.voice.live, 0); assert.equal(snapshot.voice.attempts, 1); assert.equal(snapshot.voice.reservedSeconds, 600);
  await assert.rejects(beginVoiceAttempt(user, input(), budget), /daily voice/);
  const nextDay = { ...budget, now: () => new Date('2026-10-11T00:00:00.000Z') };
  await beginVoiceAttempt(user, input(), nextDay);
  assert.equal((await getUsageSnapshot(user, nextDay)).voice.attempts, 1);
});
test('foreign identity and inactive actors cannot reserve, provision, or end another attempt', async () => {
  const user = await actor(), other = await actor(), saved = await beginVoiceAttempt(user, input(), deps);
  await assert.rejects(requestVoiceStop(other, saved.id, deps), /not found/);
  await assert.rejects(assertInferenceAccess({ ...user, organizationId: other.organizationId }, deps), /access has been removed/);
  await (await db()).run('UPDATE entities SET status = ? WHERE id = ?', ['removed', `team:member:${user.id}`]);
  await assert.rejects(markAttemptProvisioning(user, saved.id, deps), /access has been removed/);
  await assert.rejects(beginVoiceAttempt(user, input(), deps), /access has been removed/);
});
test('reservation transaction rejects membership revoked after the initial read', async () => {
  const user = await actor(), database = await db(); let revoked = false;
  const injected: Database = { all: database.all.bind(database), run: database.run.bind(database), async batch(statements) {
    if (!revoked && statements.some(s => s.params?.includes('voice:attempt'))) { revoked = true; await database.run('UPDATE entities SET status = ? WHERE id = ?', ['removed', `team:member:${user.id}`]); }
    return database.batch(statements);
  } };
  await assert.rejects(beginVoiceAttempt(user, input(), { ...deps, database: injected }), /access has been removed/);
  assert.equal((await getUsageSnapshot(user, deps)).voice.attempts, 0);
});
test('explicit local voice admission requires fresh supervisor heartbeat', async () => {
  const user = await actor(), local = { ...deps, env: { APP_URL: 'http://localhost:3000', INFERENCE_ALLOW_LOCAL: 'true' } };
  await heartbeat(new Date(fixed.getTime() - 31000));
  await assert.rejects(beginVoiceAttempt(user, input(), local), /supervision is unavailable/);
  await heartbeat(); const a = await beginVoiceAttempt(user, input(), local);
  await heartbeat(new Date(fixed.getTime() - 31000));
  await assert.rejects(markAttemptProvisioning(user, a.id, local), /supervision is unavailable/);
});
test('provider reference is private, stop needs exact confirmed handle, and stale worker cannot close', async () => {
  const user = await actor(), a = await beginVoiceAttempt(user, input(), deps), ref = { id: a.id, organizationId: user.organizationId };
  await markAttemptProvisioning(user, a.id, deps);
  await attachProviderCall(user, a.id, 'private_call_123', deps, 'a'.repeat(64));
  await requestVoiceStop(user, a.id, deps);
  assert.equal((await listDueAttempts(deps)).some(r => r.id === a.id), true);
  const first = await claimStop(ref, deps); assert.ok(first);
  assert.equal(await claimStop(ref, deps), null);
  await recordStop(ref, first.stopToken, { confirmed: true, providerCallRef: 'wrong' }, deps);
  assert.equal((await getUsageSnapshot(user, deps)).voice.live, 1);
  const later = { ...deps, now: () => new Date(fixed.getTime() + 31000) };
  const second = await claimStop(ref, later); assert.ok(second);
  assert.equal(await recordStop(ref, first.stopToken, { confirmed: true, providerCallRef: 'private_call_123' }, later), null);
  await recordStop(ref, second.stopToken, { confirmed: true, providerCallRef: 'private_call_123' }, later);
  const snapshot = await getUsageSnapshot(user, deps);
  assert.equal(snapshot.voice.live, 0);
  assert.equal(JSON.stringify(snapshot).includes('private_call_123'), false);
  assert.equal(JSON.stringify(snapshot).includes('a'.repeat(64)), false);
});
test('connecting with missing handle never refunds, and cleanup retries are durably bounded', async () => {
  const user = await actor(), a = await beginVoiceAttempt(user, input(), deps), ref = { id: a.id, organizationId: user.organizationId };
  await markAttemptProvisioning(user, a.id, deps); await requestVoiceStop(user, a.id, deps);
  let clock = fixed.getTime();
  for (let i = 0; i < 5; i++) {
    const current = { ...deps, now: () => new Date(clock) }, claim = await claimStop(ref, current); assert.ok(claim);
    await recordStop(ref, claim.stopToken, { confirmed: true }, current);
    clock += 1000000;
  }
  assert.equal(await claimStop(ref, { ...deps, now: () => new Date(clock) }), null);
  assert.equal((await getUsageSnapshot(user, deps)).voice.live, 1);
  assert.equal((await getUsageSnapshot(user, deps)).voice.attemptsSummary[0].state, 'uncertain');
});
test('server-owned audio proof closure releases slot only after trusted runner confirmation', async () => {
  const user = await actor(), a = await beginVoiceAttempt(user, { ...input(), purpose: 'audio_proof' }, deps);
  await markAttemptProvisioning(user, a.id, deps);
  await closeOwnedVoiceAttempt(user, a.id, { outcome: 'uncertain' }, deps);
  assert.equal((await getUsageSnapshot(user, deps)).voice.live, 1);
  await closeOwnedVoiceAttempt(user, a.id, { outcome: 'failed' }, deps);
  assert.equal((await getUsageSnapshot(user, deps)).voice.live, 0);
  assert.equal((await getUsageSnapshot(user, deps)).voice.reservedSeconds, 45);
  const privateAttempt = await beginVoiceAttempt(user, input(), deps);
  await assert.rejects(closeOwnedVoiceAttempt(user, privateAttempt.id, { outcome: 'complete' }, deps), /provider-confirmed stop/);
});
test('cancel before reservation fences later allocation and is idempotent without allowance consumption', async () => {
  const user = await actor(), request = input();
  const cancelled = await requestVoiceStopByRequest(user, request.requestId, deps);
  const repeated = await requestVoiceStopByRequest(user, request.requestId, deps);
  const start = await beginVoiceAttempt(user, request, deps);
  assert.equal(start.id, cancelled.id); assert.equal(repeated.id, cancelled.id);
  assert.equal(start.replayed, true); assert.equal(start.state, 'closed');
  assert.equal(await markAttemptProvisioning(user, start.id, deps), false);
  assert.equal((await getUsageSnapshot(user, deps)).voice.attempts, 0);
});
test('concurrent cancel and reservation cannot lose the stop request', async () => {
  for (let i = 0; i < 8; i++) {
    const user = await actor(), request = input();
    const [start] = await Promise.all([beginVoiceAttempt(user, request, deps), requestVoiceStopByRequest(user, request.requestId, deps)]);
    try { assert.equal(await markAttemptProvisioning(user, start.id, deps), false); }
    catch (error) { assert.match(String(error), /expired/); }
    const replay = await beginVoiceAttempt(user, request, deps);
    assert.equal(replay.replayed, true);
    assert.ok(replay.state === 'closed' || replay.deadlineAt <= fixed.toISOString());
  }
});
test('unmatched cancellation markers have a per-user bound and expired markers are safely cleaned', async () => {
  const user = await actor();
  for (let i = 0; i < 60; i++) await requestVoiceStopByRequest(user, `cancel-${i}`, deps);
  await assert.rejects(requestVoiceStopByRequest(user, 'over-limit', deps), /Too many unmatched/);
  await requestVoiceStopByRequest(user, 'cancel-0', deps);
  const future = { ...deps, now: () => new Date(fixed.getTime() + 8 * 86400000) };
  await requestVoiceStopByRequest(user, 'after-retention', future);
  const rows = await (await db()).all('SELECT id FROM entities WHERE organization_id = ? AND kind = ?', [user.organizationId, 'voice:attempt']);
  assert.equal(rows.length, 1);
  assert.equal((await getUsageSnapshot(user, future)).voice.attempts, 0);
});
test('late provider handle remains bound after cancellation and cannot be closed by a no-handle claim', async () => {
  const user = await actor(), a = await beginVoiceAttempt(user, input(), deps), ref = { id: a.id, organizationId: user.organizationId };
  await markAttemptProvisioning(user, a.id, deps); await requestVoiceStop(user, a.id, deps);
  const claim = await claimStop(ref, deps); assert.ok(claim);
  const late = await attachProviderCall(user, a.id, 'late_call_ref', deps, 'b'.repeat(64));
  assert.equal(late.state, 'stopping'); assert.equal(late.deadlineAt, fixed.toISOString());
  await recordStop(ref, claim.stopToken, { confirmed: true }, deps);
  assert.equal((await getUsageSnapshot(user, deps)).voice.live, 1);
  const future = { ...deps, now: () => new Date(fixed.getTime() + 31000) }, retry = await claimStop(ref, future); assert.ok(retry);
  assert.equal(retry.providerCallRef, 'late_call_ref');
  await recordStop(ref, retry.stopToken, { confirmed: true, providerCallRef: retry.providerCallRef }, future);
  assert.equal((await getUsageSnapshot(user, deps)).voice.live, 0);
});
test('voice record binding verifies tenant, actor and exact attempt', async () => {
  for (const kind of ['voice_preview', 'voice_connection'] as const) {
    const user = await actor(), a = await beginVoiceAttempt(user, input(), deps);
    await markAttemptProvisioning(user, a.id, deps);
    await attachProviderCall(user, a.id, 'bound_call', deps, 'c'.repeat(64));
    const data = { requestedBy: user.id, provider: 'azure', voiceAttemptId: a.id };
    const call = await createRecord(user, kind, data, 'connection_issued');
    const bound = await bindVoiceAttemptCall(user, a.id, { kind, id: call.id }, deps);
    assert.equal(bound?.callRecord?.id, call.id);
    const other = await actor();
    await assert.rejects(bindVoiceAttemptCall(other, a.id, { kind, id: call.id }, deps), /not found/);
    await updateRecord(user, call, { ...data, voiceAttemptId: 'wrong' });
    await assert.rejects(bindVoiceAttemptCall(user, a.id, { kind, id: call.id }, deps), /does not authorize/);
  }
});
test('Stop during negotiation without an aborted request cannot reactivate the late provider call', async () => {
  const user = await actor(), a = await beginVoiceAttempt(user, input(), deps);
  await markAttemptProvisioning(user, a.id, deps);
  const stopped = await requestVoiceStop(user, a.id, deps);
  assert.equal(stopped.state, 'connecting');
  const later = { ...deps, now: () => new Date(fixed.getTime() + 10000) };
  const repeated = await requestVoiceStop(user, a.id, later);
  assert.equal(repeated.deadlineAt, fixed.toISOString(), 'End replay must not extend the first stop deadline');
  const late = await attachProviderCall(user, a.id, 'cancelled_late_call', later, 'd'.repeat(64));
  assert.equal(late.providerCallRef, 'cancelled_late_call');
  assert.equal(late.state, 'uncertain');
  assert.equal(late.stopRequestedAt, fixed.toISOString());
  assert.equal(late.deadlineAt, fixed.toISOString());
  await assert.rejects(assertVoiceAttemptActive(user, a.id, later), /cancelled or expired/);
  const call = await createRecord(user, 'voice_preview', { requestedBy: user.id, provider: 'azure', voiceAttemptId: a.id }, 'connection_issued');
  await assert.rejects(bindVoiceAttemptCall(user, a.id, { kind: 'voice_preview', id: call.id }, later), /cancelled or expired/);
  assert.equal((await getUsageSnapshot(user, later)).voice.live, 1);
});
test('an expired hard deadline cannot be extended by End or reactivated by late attachment', async () => {
  const user = await actor(), a = await beginVoiceAttempt(user, { ...input(), maxSeconds: 1 }, deps);
  await markAttemptProvisioning(user, a.id, deps);
  const later = { ...deps, now: () => new Date(fixed.getTime() + 10000) };
  const stopped = await requestVoiceStop(user, a.id, later);
  assert.equal(stopped.deadlineAt, a.deadlineAt);
  const bound = await attachProviderCall(user, a.id, 'expired_call', later, 'e'.repeat(64));
  assert.equal(bound.state, 'uncertain');
  assert.equal(bound.deadlineAt, a.deadlineAt);
  assert.equal((await getUsageSnapshot(user, later)).voice.live, 1);
});
test('a crashed fifth stop claimant becomes uncertain without a sixth provider claim', async () => {
  const user = await actor(), a = await beginVoiceAttempt(user, input(), deps), ref = { id: a.id, organizationId: user.organizationId };
  await markAttemptProvisioning(user, a.id, deps); await requestVoiceStop(user, a.id, deps);
  let time = fixed.getTime();
  for (let i = 0; i < 5; i++) {
    const claim = await claimStop(ref, { ...deps, now: () => new Date(time) });
    assert.ok(claim); assert.equal(claim.stopAttempts, i + 1);
    time += 30001;
  }
  const future = { ...deps, now: () => new Date(time) };
  assert.equal((await listDueAttempts(future)).some(row => row.id === a.id), false);
  assert.equal(await claimStop(ref, future), null);
  const snapshot = await getUsageSnapshot(user, future);
  assert.equal(snapshot.voice.live, 1);
  assert.equal(snapshot.voice.attemptsSummary[0].state, 'uncertain');
});
