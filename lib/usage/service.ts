import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, WriteConflictError, type Database } from '../server/db';
import { HttpError } from '../server/http';
import { operatorMembershipFence } from '../team/service';
import type { InferenceMode, UsageDependencies, UsageSnapshot, VoiceAttemptInput, VoiceAttemptReceipt, VoiceAttemptRecord, VoiceAttemptRef } from './contracts';

type Statement = Parameters<Database['batch']>[0][number];
type LiveState = { live: Array<{ id: string; userId: string }> };
type DayState = { attempts: number; reservedSeconds: number };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const instant = (deps: UsageDependencies) => (deps.now?.() ?? new Date()).toISOString();
const store = (deps: UsageDependencies) => deps.database ? Promise.resolve(deps.database) : db();
const liveId = (org: string) => `voice:capacity:${sha(org)}`;
const dayId = (org: string, date: string) => `voice:budget:${sha(JSON.stringify([org, date]))}`;
const attemptId = (org: string, request: string) => `voice:attempt:${sha(JSON.stringify([org, request]))}`;

export function inferenceConfiguration(env: Record<string, string | undefined> = process.env) {
  let mode: InferenceMode = 'hosted';
  const raw = env.APP_URL?.trim();
  if (!raw && env.NODE_ENV === 'test') mode = 'test';
  else if (!raw) throw new HttpError(503, 'Configure the application origin before enabling inference.');
  else if (raw) {
    let url: URL;
    try { url = new URL(raw); } catch { throw new HttpError(503, 'Inference application origin is misconfigured.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new HttpError(503, 'Inference application origin is misconfigured.');
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && env.INFERENCE_ALLOW_LOCAL === 'true') mode = 'local';
  }
  const allowedOrganizations = new Set((env.INFERENCE_ALLOWED_ORGANIZATION_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
  return { mode, allowedOrganizations, aiTokenLimit: finiteLimit(env, 'AI_DAILY_ORG_TOKEN_BUDGET', 100000), voiceAttemptLimit: finiteLimit(env, 'VOICE_DAILY_ORG_ATTEMPT_BUDGET', 60), voiceSecondsLimit: finiteLimit(env, 'VOICE_DAILY_ORG_SECONDS_BUDGET', 36000), userLiveLimit: finiteLimit(env, 'VOICE_MAX_LIVE_PER_USER', 1), organizationLiveLimit: finiteLimit(env, 'VOICE_MAX_LIVE_PER_ORG', 3) };
}
function finiteLimit(env: Record<string, string | undefined>, key: string, fallback: number) {
  const raw = env[key]?.trim(), value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000000000) throw new HttpError(503, 'Inference usage limits are misconfigured.');
  return value;
}
/** Operator entitlement is environment-owned. Workspace owners cannot self-activate. */
export async function assertInferenceAccess(user: AuthUser, deps: UsageDependencies = {}): Promise<void> {
  const config = inferenceConfiguration(deps.env ?? process.env);
  if (config.mode === 'hosted' && !config.allowedOrganizations.has(user.organizationId)) throw new HttpError(403, 'AI activation is pending. A platform operator must approve this workspace.');
  // A persisted membership check also rejects removed users and forged tenant identities.
  await operatorMembershipFence(user, await store(deps));
}
async function requireHeartbeat(database: Database, deps: UsageDependencies) {
  if (inferenceConfiguration(deps.env ?? process.env).mode === 'test') return;
  const [heartbeat] = await database.all('SELECT status, updated_at FROM service_heartbeats WHERE id = ? AND service = ?', ['private-voice-supervisor', 'private-voice-supervisor']);
  const age = heartbeat ? Date.parse(instant(deps)) - Date.parse(String(heartbeat.updated_at)) : NaN;
  if (!heartbeat || heartbeat.status !== 'healthy' || !Number.isFinite(age) || age < -5000 || age > 30000) throw new HttpError(503, 'Private voice supervision is unavailable. Try again after the service is restored.');
}
async function initialize(database: Database, id: string, org: string, kind: string, value: unknown, now: string) {
  await database.run('INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', [id, org, kind, 'active', JSON.stringify(value), now]);
}
async function readJson<T>(database: Database, id: string, org: string, kind: string): Promise<{ value: T; raw: string }> {
  const [row] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, org, kind]);
  if (!row) throw new HttpError(404, 'Usage record not found.');
  const raw = String(row.data); return { value: JSON.parse(raw) as T, raw };
}
function replace(id: string, org: string, kind: string, raw: string, value: unknown, status = 'active'): Statement {
  return { sql: 'UPDATE entities SET data = ?, status = ? WHERE id = ? AND organization_id = ? AND kind = ? AND data = ?', params: [JSON.stringify(value), status, id, org, kind, raw], expectedChanges: 1 };
}
async function attempt(database: Database, ref: VoiceAttemptRef) { return readJson<VoiceAttemptRecord>(database, ref.id, ref.organizationId, 'voice:attempt'); }
function receipt(value: VoiceAttemptRecord, replayed: boolean): VoiceAttemptReceipt { return { id: value.id, deadlineAt: value.deadlineAt, state: value.state, replayed }; }
function own(user: AuthUser, value: VoiceAttemptRecord) { if (value.userId !== user.id || value.organizationId !== user.organizationId) throw new HttpError(404, 'Voice attempt not found.'); }
function requireActiveAttempt(value: VoiceAttemptRecord, deps: UsageDependencies) {
  if (value.state !== 'active' || value.stopRequestedAt || value.deadlineAt <= instant(deps)) throw new HttpError(409, 'The call was cancelled or expired. Its server cleanup is being tracked.');
}
/** Final server response guard; never exposes the private provider reference. */
export async function assertVoiceAttemptActive(user: AuthUser, id: string, deps: UsageDependencies = {}): Promise<void> {
  const saved = await attempt(await store(deps), { id, organizationId: user.organizationId });
  own(user, saved.value); requireActiveAttempt(saved.value, deps);
}

/** Reserve once before provider allocation. A replay is status only, never a second provider execution. */
export async function beginVoiceAttempt(user: AuthUser, input: VoiceAttemptInput, deps: UsageDependencies = {}): Promise<VoiceAttemptReceipt> {
  await assertInferenceAccess(user, deps);
  if (input.provider !== 'azure' || !['private_webrtc', 'audio_proof', 'voice_live'].includes(input.purpose)) throw new HttpError(400, 'Choose an approved Azure voice purpose.');
  if (typeof input.requestId !== 'string' || !input.requestId.trim() || input.requestId.length > 160 || /[\x00-\x1f]/.test(input.requestId)) throw new HttpError(400, 'A bounded voice request ID is required.');
  const cap = input.purpose === 'audio_proof' ? 45 : 600, maxSeconds = input.maxSeconds ?? cap;
  if (!Number.isSafeInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > cap) throw new HttpError(400, 'Voice duration exceeds the purpose limit.');
  const database = await store(deps), config = inferenceConfiguration(deps.env ?? process.env), now = instant(deps);
  const id = attemptId(user.organizationId, input.requestId), requestHash = sha(JSON.stringify([user.id, input.provider, input.purpose, maxSeconds]));
  const existing = async () => {
    const rows = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, user.organizationId, 'voice:attempt']);
    if (!rows[0]) return null;
    const saved = JSON.parse(String(rows[0].data)) as VoiceAttemptRecord;
    own(user, saved);
    if (!saved.cancelledBeforeReservation && saved.requestHash !== requestHash) throw new HttpError(409, 'This voice request ID was already used for different input.');
    return receipt(saved, true);
  };
  const previous = await existing(); if (previous) return previous;
  await requireHeartbeat(database, deps);
  const capacityId = liveId(user.organizationId), budgetId = dayId(user.organizationId, now.slice(0, 10));
  await initialize(database, capacityId, user.organizationId, 'voice:capacity', { live: [] }, now);
  await initialize(database, budgetId, user.organizationId, 'voice:budget', { attempts: 0, reservedSeconds: 0 }, now);
  const value: VoiceAttemptRecord = { id, organizationId: user.organizationId, userId: user.id, provider: input.provider, purpose: input.purpose, requestHash, state: 'reserved', createdAt: now, deadlineAt: new Date(Date.parse(now) + maxSeconds * 1000).toISOString(), maxSeconds };
  for (let tries = 0; tries < 12; tries++) {
    const replay = await existing(); if (replay) return replay;
    const member = await operatorMembershipFence(user, database);
    const live = await readJson<LiveState>(database, capacityId, user.organizationId, 'voice:capacity');
    const day = await readJson<DayState>(database, budgetId, user.organizationId, 'voice:budget');
    if (live.value.live.length >= config.organizationLiveLimit || live.value.live.filter(a => a.userId === user.id).length >= config.userLiveLimit) throw new HttpError(429, 'The workspace or user has reached its live voice limit. Uncertain attempts retain their slot.');
    if (day.value.attempts >= config.voiceAttemptLimit || day.value.reservedSeconds + maxSeconds > config.voiceSecondsLimit) throw new HttpError(429, 'This workspace has reached its daily voice attempt or reserved-seconds budget.');
    try {
      await database.batch([member,
        replace(capacityId, user.organizationId, 'voice:capacity', live.raw, { live: [...live.value.live, { id, userId: user.id }] }),
        replace(budgetId, user.organizationId, 'voice:budget', day.raw, { attempts: day.value.attempts + 1, reservedSeconds: day.value.reservedSeconds + maxSeconds }),
        { sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, user.organizationId, 'voice:attempt', 'reserved', JSON.stringify(value), now] },
      ]);
      return receipt(value, false);
    } catch (error) {
      const replay = await existing(); if (replay) return replay;
      if (!(error instanceof WriteConflictError)) throw error;
    }
  }
  throw new HttpError(409, 'Voice capacity changed. Retry with the same request ID.');
}

async function mutate(ref: VoiceAttemptRef, deps: UsageDependencies, change: (value: VoiceAttemptRecord) => VoiceAttemptRecord | null, fences: Statement[] = []): Promise<VoiceAttemptRecord | null> {
  const database = await store(deps);
  for (let tries = 0; tries < 12; tries++) {
    const saved = await attempt(database, ref), next = change(saved.value);
    if (!next) return null;
    const statements: Statement[] = [...fences];
    // Every release compares the organization capacity bytes in the same transaction.
    if (next.state === 'closed' && saved.value.state !== 'closed') {
      const live = await readJson<LiveState>(database, liveId(ref.organizationId), ref.organizationId, 'voice:capacity');
      statements.push(replace(liveId(ref.organizationId), ref.organizationId, 'voice:capacity', live.raw, { live: live.value.live.filter(a => a.id !== ref.id) }));
    }
    statements.push(replace(ref.id, ref.organizationId, 'voice:attempt', saved.raw, next, next.state));
    try { await database.batch(statements); return next; }
    catch (error) { if (!(error instanceof WriteConflictError)) throw error; }
  }
  throw new HttpError(409, 'Voice attempt changed concurrently.');
}
export async function markAttemptProvisioning(user: AuthUser, id: string, deps: UsageDependencies = {}, admissionFences: Statement[] = []): Promise<boolean> {
  await assertInferenceAccess(user, deps);
  const database = await store(deps); await requireHeartbeat(database, deps);
  return !!await mutate({ id, organizationId: user.organizationId }, deps, value => {
    own(user, value);
    if (value.state !== 'reserved') return null;
    if (value.stopRequestedAt || value.deadlineAt <= instant(deps)) throw new HttpError(409, 'Voice reservation has expired or was cancelled.');
    return { ...value, state: 'connecting', providerProvisioningStartedAt: instant(deps) };
  }, [await operatorMembershipFence(user, database), ...admissionFences]);
}
/** Owned Voice Live sockets do not have a REST call handle. Activation never clears cancellation. */
export async function activateOwnedVoiceAttempt(user: AuthUser, id: string, deps: UsageDependencies = {}, admissionFences: Statement[] = []): Promise<void> {
  await mutate({ id, organizationId: user.organizationId }, deps, value => {
    own(user, value);
    if (value.purpose !== 'voice_live' || !['connecting', 'active'].includes(value.state) || value.stopRequestedAt || value.deadlineAt <= instant(deps)) throw new HttpError(409, 'The owned voice attempt is no longer active.');
    return { ...value, state: 'active' };
  }, admissionFences);
}
export async function attachProviderCall(user: AuthUser, id: string, providerCallRef: string, deps: UsageDependencies = {}, providerConfigurationDigest?: string): Promise<VoiceAttemptRecord> {
  if (!/^[\w.-]{1,240}$/.test(providerCallRef)) throw new HttpError(502, 'Provider call reference is invalid.');
  if (providerConfigurationDigest !== undefined && !/^[a-f0-9]{64}$/.test(providerConfigurationDigest)) throw new HttpError(502, 'Provider configuration reference is invalid.');
  const result = await mutate({ id, organizationId: user.organizationId }, deps, value => {
    own(user, value);
    if (value.providerCallRef && value.providerCallRef !== providerCallRef) throw new HttpError(409, 'Voice attempt already has a different provider call.');
    if (value.providerConfigurationDigest && value.providerConfigurationDigest !== providerConfigurationDigest) throw new HttpError(409, 'Voice attempt already has a different provider configuration.');
    if (value.state === 'closed') throw new HttpError(409, 'Voice attempt is already closed.');
    if (value.state === 'reserved') throw new HttpError(409, 'Voice provisioning has not been claimed.');
    // A response arriving after stop/timeout still binds for server cleanup; it never reactivates the call.
    const mayActivate = !value.stopRequestedAt && value.deadlineAt > instant(deps);
    const state = value.state === 'connecting' || value.state === 'active' ? mayActivate ? 'active' : 'uncertain' : value.state;
    return { ...value, providerCallRef, providerConfigurationDigest, state };
  });
  return result!;
}
export async function failVoiceAttempt(user: AuthUser, id: string, outcome: { definitivePreProviderFailure: boolean }, deps: UsageDependencies = {}) {
  return mutate({ id, organizationId: user.organizationId }, deps, value => {
    own(user, value);
    if (value.state === 'closed') return value;
    if (outcome.definitivePreProviderFailure && !value.providerCallRef && ['reserved', 'connecting'].includes(value.state)) return { ...value, state: 'closed', closedAt: instant(deps) };
    return { ...value, state: 'uncertain' };
  });
}
export async function requestVoiceStop(user: AuthUser, id: string, deps: UsageDependencies = {}) {
  const result = await mutate({ id, organizationId: user.organizationId }, deps, value => {
    own(user, value);
    if (value.state === 'closed') return value;
    const now = instant(deps);
    return { ...value, stopRequestedAt: value.stopRequestedAt ?? now, deadlineAt: value.deadlineAt < now ? value.deadlineAt : now };
  });
  return receipt(result!, true);
}
/** Cancel-before-start fence. These zero-allocation tombstones never consume voice allowance. */
export async function requestVoiceStopByRequest(user: AuthUser, requestId: string, deps: UsageDependencies = {}): Promise<VoiceAttemptReceipt> {
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 160 || /[\x00-\x1f]/.test(requestId)) throw new HttpError(400, 'A bounded voice request ID is required.');
  const database = await store(deps), id = attemptId(user.organizationId, requestId), now = instant(deps);
  const cancellationId = `voice:cancellations:${sha(JSON.stringify([user.organizationId, user.id]))}`;
  await initialize(database, cancellationId, user.organizationId, 'voice:cancellations', { ids: [] }, now);
  for (let tries = 0; tries < 12; tries++) {
    const [existing] = await database.all('SELECT id FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, user.organizationId, 'voice:attempt']);
    if (existing) return requestVoiceStop(user, id, deps);
    const member = await operatorMembershipFence(user, database);
    const markers = await readJson<{ ids: Array<{ id: string; createdAt: string }> }>(database, cancellationId, user.organizationId, 'voice:cancellations');
    const cutoff = Date.parse(now) - 7 * 86400000;
    const expired = markers.value.ids.filter(a => Date.parse(a.createdAt) < cutoff), kept = markers.value.ids.filter(a => Date.parse(a.createdAt) >= cutoff);
    if (kept.length >= 60) throw new HttpError(429, 'Too many unmatched voice cancellations. Retry an existing request ID.');
    const value: VoiceAttemptRecord = { id, organizationId: user.organizationId, userId: user.id, provider: 'azure', purpose: 'private_webrtc', requestHash: sha(JSON.stringify([user.id, 'cancelled'])), state: 'closed', createdAt: now, deadlineAt: now, closedAt: now, maxSeconds: 0, cancelledBeforeReservation: true };
    try {
      await database.batch([member,
        replace(cancellationId, user.organizationId, 'voice:cancellations', markers.raw, { ids: [...kept, { id, createdAt: now }] }),
        ...expired.map(a => ({ sql: 'DELETE FROM entities WHERE id = ? AND organization_id = ? AND kind = ? AND status = ?', params: [a.id, user.organizationId, 'voice:attempt', 'closed'] })),
        { sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, user.organizationId, 'voice:attempt', 'closed', JSON.stringify(value), now] },
      ]);
      return receipt(value, true);
    } catch (error) {
      if ((await database.all('SELECT id FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, user.organizationId, 'voice:attempt'])).length) return requestVoiceStop(user, id, deps);
      if (!(error instanceof WriteConflictError)) throw error;
    }
  }
  throw new HttpError(409, 'Voice cancellation changed concurrently. Retry the same request ID.');
}
export async function bindVoiceAttemptCall(user: AuthUser, id: string, callRecord: { kind: 'voice_preview' | 'voice_connection'; id: string }, deps: UsageDependencies = {}) {
  if (!['voice_preview', 'voice_connection'].includes(callRecord.kind) || typeof callRecord.id !== 'string' || !callRecord.id || callRecord.id.length > 200) throw new HttpError(400, 'Invalid voice record binding.');
  const database = await store(deps);
  const [row] = await database.all('SELECT data, status FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [callRecord.id, user.organizationId, `platform:${callRecord.kind}`]);
  if (!row) throw new HttpError(404, 'Voice record not found.');
  const data = JSON.parse(String(row.data)).data;
  if (!data || data.requestedBy !== user.id || data.provider !== 'azure' || data.voiceAttemptId !== id) throw new HttpError(403, 'Voice record does not authorize this attempt.');
  return mutate({ id, organizationId: user.organizationId }, deps, value => {
    own(user, value);
    requireActiveAttempt(value, deps);
    if (value.callRecord && (value.callRecord.id !== callRecord.id || value.callRecord.kind !== callRecord.kind)) throw new HttpError(409, 'Voice attempt already has a different record binding.');
    return { ...value, callRecord };
  }, [{ sql: 'UPDATE entities SET data = data WHERE id = ? AND organization_id = ? AND kind = ? AND status = ? AND data = ?', params: [callRecord.id, user.organizationId, `platform:${callRecord.kind}`, String(row.status), String(row.data)], expectedChanges: 1 }]);
}
/** Only a trusted server-owned audio proof runner may acknowledge its socket closure. */
export async function closeOwnedVoiceAttempt(user: AuthUser, id: string, outcome: { outcome: 'complete' | 'failed' | 'uncertain' }, deps: UsageDependencies = {}, admissionFences: Statement[] = []) {
  return mutate({ id, organizationId: user.organizationId }, deps, value => {
    own(user, value);
    if (value.purpose !== 'audio_proof' && value.purpose !== 'voice_live') throw new HttpError(409, 'This voice attempt requires provider-confirmed stop.');
    if (value.state === 'closed') return value;
    return outcome.outcome === 'uncertain' ? { ...value, state: 'uncertain' } : { ...value, state: 'closed', closedAt: instant(deps) };
  }, admissionFences);
}
/** Internal worker API. Results contain provider references and must never leave the server. */
export async function listDueAttempts(deps: UsageDependencies = {}): Promise<VoiceAttemptRecord[]> {
  const rows = await (await store(deps)).all('SELECT data FROM entities WHERE kind = ? AND status <> ? ORDER BY created_at ASC', ['voice:attempt', 'closed']);
  const now = instant(deps);
  const attempts = rows.map(r => JSON.parse(String(r.data)) as VoiceAttemptRecord);
  const exhaustedLease = (a: VoiceAttemptRecord) => a.state === 'stopping' && (a.stopAttempts ?? 0) >= 5 && (!a.stopClaimedAt || Date.parse(now) - Date.parse(a.stopClaimedAt) >= 30000);
  // A crashed final claimant cannot stay "stopping" forever. This is metadata-only:
  // retain its slot and allowance, and never issue a sixth provider stop request.
  for (const saved of attempts.filter(exhaustedLease).slice(0, 100)) await mutate(saved, deps, value => exhaustedLease(value) ? { ...value, state: 'uncertain' } : null);
  return attempts.filter(a => (a.stopAttempts ?? 0) < 5 && (!a.nextStopAt || a.nextStopAt <= now) && a.deadlineAt <= now && (a.state !== 'stopping' || !a.stopClaimedAt || Date.parse(now) - Date.parse(a.stopClaimedAt) >= 30000)).slice(0, 100);
}
export async function claimStop(ref: VoiceAttemptRef, deps: UsageDependencies = {}): Promise<(VoiceAttemptRecord & { stopToken: string }) | null> {
  return await mutate(ref, deps, value => {
    const now = instant(deps);
    if (value.state === 'closed' || (value.stopAttempts ?? 0) >= 5 || (value.nextStopAt && value.nextStopAt > now) || value.deadlineAt > now || (value.state === 'stopping' && value.stopClaimedAt && Date.parse(now) - Date.parse(value.stopClaimedAt) < 30000)) return null;
    return { ...value, state: 'stopping', stopToken: randomUUID(), stopClaimedAt: now, stopFromState: value.stopFromState ?? value.state, stopAttempts: (value.stopAttempts ?? 0) + 1 };
  }) as (VoiceAttemptRecord & { stopToken: string }) | null;
}
export async function recordStop(ref: VoiceAttemptRef, stopToken: string, outcome: { confirmed: boolean; providerCallRef?: string; reason?: import('./contracts').VoiceStopOutcomeReason; httpStatus?: number }, deps: UsageDependencies = {}) {
  return mutate(ref, deps, value => {
    if (value.stopToken !== stopToken || value.state !== 'stopping') return null;
    const confirmed = outcome.confirmed && (value.providerCallRef ? value.providerCallRef === outcome.providerCallRef : value.stopFromState === 'reserved');
    const reasons = ['confirmed', 'not_allocated', 'missing_reference', 'owned_transport_required', 'invalid_reference', 'configuration_changed', 'provider_unconfirmed', 'transport_uncertain', 'authority_changed', 'unreported'];
    const stopOutcomeReason = outcome.confirmed && !confirmed ? 'authority_changed' : outcome.reason && reasons.includes(outcome.reason) ? outcome.reason : confirmed ? 'confirmed' : 'unreported';
    const stopHttpStatus = Number.isInteger(outcome.httpStatus) && outcome.httpStatus! >= 100 && outcome.httpStatus! <= 599 ? outcome.httpStatus : undefined;
    return { ...value, state: confirmed ? 'closed' : 'uncertain', stopOutcomeReason, stopHttpStatus, stopOutcomeAt: instant(deps), ...(confirmed ? { closedAt: instant(deps) } : { nextStopAt: new Date(Date.parse(instant(deps)) + 30000 * 2 ** ((value.stopAttempts ?? 1) - 1)).toISOString() }) };
  });
}

export async function getUsageSnapshot(user: AuthUser, deps: UsageDependencies = {}): Promise<UsageSnapshot> {
  const database = await store(deps), config = inferenceConfiguration(deps.env ?? process.env), date = instant(deps).slice(0, 10);
  const allowed = config.mode !== 'hosted' || config.allowedOrganizations.has(user.organizationId);
  const rows = await database.all('SELECT kind, status, data, created_at FROM entities WHERE organization_id = ? AND kind IN (?, ?, ?, ?) AND (created_at >= ? OR kind = ?)', [user.organizationId, 'voice:attempt', 'voice:budget', 'ai:run', 'ai:budget', `${date}T00:00:00.000Z`, 'voice:attempt']);
  const voice = rows.filter(r => r.kind === 'voice:attempt').map(r => JSON.parse(String(r.data)) as VoiceAttemptRecord);
  const todayVoice = voice.filter(a => !a.cancelledBeforeReservation && a.createdAt.startsWith(date));
  const [heartbeat] = await database.all('SELECT status, updated_at FROM service_heartbeats WHERE id = ? AND service = ?', ['private-voice-supervisor', 'private-voice-supervisor']);
  const heartbeatAge = heartbeat ? Date.parse(instant(deps)) - Date.parse(String(heartbeat.updated_at)) : NaN;
  const supervision = { ready: !!heartbeat && heartbeat.status === 'healthy' && Number.isFinite(heartbeatAge) && heartbeatAge >= -5000 && heartbeatAge <= 30000, lastHeartbeatAt: heartbeat && Number.isFinite(Date.parse(String(heartbeat.updated_at))) ? String(heartbeat.updated_at) : null };
  let reservedTokens = 0, reportedTokens = 0;
  for (const row of rows.filter(r => r.kind === 'ai:run')) {
    const data = JSON.parse(String(row.data));
    if (row.status === 'complete') reportedTokens += (data.inputTokens || 0) + (data.outputTokens || 0);
    else reservedTokens += data.reservedTokens || 0;
  }
  return { date, access: { allowed, mode: config.mode, managedBy: 'platform_operator', message: allowed ? 'AI access is enabled by platform configuration.' : 'AI activation is pending. A platform operator must approve this workspace; workspace owners cannot change this setting.' },
    ai: { dailyTokenLimit: config.aiTokenLimit, budgetTokensUsed: rows.filter(r => r.kind === 'ai:budget').reduce((sum, r) => sum + Number(r.data), 0), reservedTokens, reportedTokens, accounting: 'Reserved tokens cover pending or uncertain attempts. Reported tokens come from completed provider responses. These are usage controls, not an invoice.' },
    voice: { dailyAttemptLimit: config.voiceAttemptLimit, attempts: todayVoice.length, dailyReservedSecondsLimit: config.voiceSecondsLimit, reservedSeconds: todayVoice.reduce((sum, a) => sum + a.maxSeconds, 0), live: voice.filter(a => a.state !== 'closed').length, userLiveLimit: config.userLiveLimit, organizationLiveLimit: config.organizationLiveLimit, supervision, accounting: 'Attempts and reserved seconds are admission allowances, not measured provider billing. Failed and uncertain attempts retain the daily allowance.', attemptsSummary: voice.filter(a => !a.cancelledBeforeReservation).slice(-100).reverse().map(({ id, purpose, state, createdAt, deadlineAt, maxSeconds }) => ({ id, purpose, state, createdAt, deadlineAt, maxSeconds })) } };
}
