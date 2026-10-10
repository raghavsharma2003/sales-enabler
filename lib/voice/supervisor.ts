import { db, type Database } from '../server/db';
import { HttpError } from '../server/http';
import { assertInferenceAccess, claimStop, listDueAttempts, recordStop, requestVoiceStop } from '../usage/service';
import type { UsageDependencies, VoiceAttemptRecord, VoiceAttemptRef, VoiceStopOutcomeReason } from '../usage/contracts';
import { hangupAzureCall } from './call-control';
import { rowData, sourceDigest, type ToolRow } from './tools/authority';
import { assertPrivateVoiceContactScope } from './private-scope';
import { purgeExpiredEvaluationAudioArtifacts } from '../evaluations/audio-artifacts';

export const PRIVATE_VOICE_SUPERVISOR_SERVICE = 'private-voice-supervisor';
export type VoiceSupervisorOptions = UsageDependencies & { transport?: typeof fetch; signal?: AbortSignal; scopeAfterId?: string; waitForClaimMs?: number };

async function callScopeIsCurrent(attempt: VoiceAttemptRecord, database: Database, now: number): Promise<boolean> {
  const row = async (kind: string, id: string) => (await database.all('SELECT id,kind,status,data,created_at FROM entities WHERE organization_id = ? AND kind = ? AND id = ?', [attempt.organizationId, kind, id]))[0] as ToolRow | undefined;
  const account = await row('auth:account', `auth:account:${attempt.userId}`);
  if (account && (account.status !== 'active' || (rowData(account).required && !rowData(account).verifiedAt))) return false;
  if (!attempt.callRecord) return true; // Allocation may still be waiting for its call snapshot.
  const call = await row(`platform:${attempt.callRecord.kind}`, attempt.callRecord.id);
  if (!call || call.status !== 'connection_issued') return false;
  const data = rowData(call), authority = data.toolAuthority;
  if (data.requestedBy !== attempt.userId || data.toolEndedAt || data.provider !== 'azure') return false;
  if (authority && (!Number.isFinite(Date.parse(authority.expiresAt)) || Date.parse(authority.expiresAt) <= now)) return false;
  if (attempt.callRecord.kind === 'voice_connection') {
    const release = typeof data.releaseId === 'string' ? await row('platform:release', data.releaseId) : undefined;
    const released = release && rowData(release);
    if (!release || release.status !== 'active' || released!.channel !== 'browser' || released!.agentId !== data.agentId || released!.versionId !== data.versionId) return false;
  }
  await assertPrivateVoiceContactScope(attempt, data.contactId, { database });
  for (const source of authority?.sources ?? []) {
    const current = await row(source.kind, source.id);
    if (!current || sourceDigest(current) !== source.digest) return false;
  }
  if (data.campaignRunId) {
    const campaign = await row('platform:campaign_run', data.campaignRunId), run = campaign && rowData(campaign);
    if (!campaign || campaign.status !== 'active' || run!.snapshot?.agentReleaseId !== data.releaseId || !run!.recipients?.some((r: { contactId: string; status: string }) => r.contactId === data.contactId && r.status === 'queued')) return false;
  }
  return true;
}

export async function privateVoiceSupervisorHeartbeat(status: 'healthy' | 'stopped' | 'unhealthy', deps: UsageDependencies = {}): Promise<void> {
  await (deps.database ?? await db()).run('INSERT INTO service_heartbeats (id,service,status,updated_at) VALUES (?,?,?,?) ON CONFLICT (id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at',
    [PRIVATE_VOICE_SUPERVISOR_SERVICE, PRIVATE_VOICE_SUPERVISOR_SERVICE, status, (deps.now?.() ?? new Date()).toISOString()]);
}

/** Safe to return to an already-authorized caller: no provider identity is exposed. */
export type PrivateVoiceStopResult = { state: 'closed' | 'uncertain' | 'deferred' | 'not_claimed'; claimed: boolean };

async function waitForExistingStop(ref: VoiceAttemptRef, database: Database, requestedMs: number): Promise<PrivateVoiceStopResult> {
  const waitMs = Math.min(11_000, Math.max(0, Number.isFinite(requestedMs) ? requestedMs : 0));
  if (!waitMs) return { state: 'not_claimed', claimed: false };
  const deadline = Date.now() + waitMs;
  // Poll reads only: never steal a live lease or issue a second provider request.
  for (let polls = 0; polls <= Math.ceil(waitMs / 250); polls++) {
    const [row] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [ref.id, ref.organizationId, 'voice:attempt']);
    if (!row) return { state: 'not_claimed', claimed: false };
    const attempt = JSON.parse(String(row.data)) as VoiceAttemptRecord;
    if (attempt.state === 'closed' || attempt.state === 'uncertain') return { state: attempt.state, claimed: false };
    const remaining = deadline - Date.now();
    if (attempt.state !== 'stopping' || remaining <= 0) return { state: 'not_claimed', claimed: false };
    await new Promise(resolve => setTimeout(resolve, Math.min(250, remaining)));
  }
  return { state: 'not_claimed', claimed: false };
}

/** Stop only this tenant-scoped attempt. Caller must first request its durable stop. */
export async function stopPrivateVoiceAttempt(ref: VoiceAttemptRef, options: VoiceSupervisorOptions = {}): Promise<PrivateVoiceStopResult> {
  const database = options.database ?? await db(), deps = { ...options, database };
  const [row] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [ref.id, ref.organizationId, 'voice:attempt']);
  if (!row) return { state: 'not_claimed', claimed: false };
  const current = JSON.parse(String(row.data)) as VoiceAttemptRecord;
  if (current.state === 'closed') return { state: 'closed', claimed: false };
  // A bounded provider handshake may still return a handle after the browser ends.
  // Do not burn a durable stop attempt while that allocation is still in flight.
  const provisionedAt = current.providerProvisioningStartedAt ?? current.createdAt;
  const allocationAge = (deps.now?.() ?? new Date()).getTime() - Date.parse(provisionedAt);
  // Secret exchange and SDP negotiation each have a 25s timeout; allow their full bound.
  if (!current.providerCallRef && current.state !== 'reserved' && allocationAge >= 0 && allocationAge < 55_000) return { state: 'deferred', claimed: false };
  const attempt = await claimStop(ref, deps);
  if (!attempt) return waitForExistingStop(ref, database, options.waitForClaimMs ?? 0);
  const reference = attempt.providerCallRef && attempt.providerConfigurationDigest
    ? { providerCallRef: attempt.providerCallRef, providerConfigurationDigest: attempt.providerConfigurationDigest } : undefined;
  const outcome: { confirmed: boolean; reason: VoiceStopOutcomeReason; httpStatus?: number } = attempt.stopFromState === 'reserved' && !attempt.providerCallRef
    ? { confirmed: true, reason: 'not_allocated' } : reference && attempt.purpose === 'private_webrtc'
      ? await hangupAzureCall(reference, options) : { confirmed: false, reason: attempt.purpose === 'audio_proof' ? 'owned_transport_required' : 'missing_reference' };
  const saved = await recordStop(attempt, attempt.stopToken, { ...outcome, ...(reference ? { providerCallRef: reference.providerCallRef } : {}) }, deps);
  return { state: saved?.state === 'closed' ? 'closed' : 'uncertain', claimed: true };
}

/** Durable deadlines, stop leases and bounded retries are owned by the usage store. */
export async function runPrivateVoiceSupervisorTick(options: VoiceSupervisorOptions = {}) {
  const database = options.database ?? await db(), deps = { ...options, database };
  const counts = { claimed: 0, closed: 0, uncertain: 0, revoked: 0 };
  // Membership/entitlement revocation is a stop request, never proof of provider closure.
  const rows = await database.all('SELECT id,data FROM entities WHERE kind = ? AND status IN (?, ?, ?) AND id > ? ORDER BY id ASC LIMIT 100', ['voice:attempt', 'reserved', 'connecting', 'active', options.scopeAfterId ?? '']);
  for (const row of rows) {
    const attempt = JSON.parse(String(row.data)) as import('../usage/contracts').VoiceAttemptRecord;
    const user = { id: attempt.userId, organizationId: attempt.organizationId, email: '' };
    try {
      await assertInferenceAccess(user, deps);
      if (!await callScopeIsCurrent(attempt, database, (deps.now?.() ?? new Date()).getTime())) throw new HttpError(403, 'Voice authority was revoked.');
    }
    catch (error) {
      if (!(error instanceof HttpError) || error.status !== 403) throw error;
      await requestVoiceStop(user, attempt.id, deps);
      counts.revoked++;
    }
  }
  const due = (await listDueAttempts(deps)).slice(0, 5);
  await Promise.all(due.map(async ref => {
    const result = await stopPrivateVoiceAttempt(ref, options);
    if (!result.claimed) return;
    counts.claimed++;
    if (result.state === 'closed') counts.closed++;
    else counts.uncertain++;
  }));
  return { ...counts, scopeAfterId: rows.length === 100 ? String(rows[rows.length - 1].id) : '' };
}

function waitForPoll(signal: AbortSignal, milliseconds: number) {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener('abort', done, { once: true });
  });
}

/** Access expires immediately; this bounded sweep removes expired stored bytes.
 * A retention fault is recorded separately and cannot disable call hangup. */
export async function runAudioArtifactMaintenance(options: UsageDependencies = {}) {
  const database = options.database ?? await db();
  const now = options.now?.() ?? new Date();
  let purged = 0, healthy = true;
  try { purged = await purgeExpiredEvaluationAudioArtifacts(database, now, 100); }
  catch { healthy = false; }
  await database.run('INSERT INTO service_heartbeats (id,service,status,updated_at) VALUES (?,?,?,?) ON CONFLICT (id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at',
    ['audio-artifact-retention', 'audio-artifact-retention', healthy ? 'healthy' : 'unhealthy', now.toISOString()]).catch(() => {});
  return { healthy, purged };
}

/** Start explicitly as a worker; no import-time provider calls or JS-only deadlines. */
export async function runPrivateVoiceSupervisor(options: VoiceSupervisorOptions & { signal: AbortSignal; once?: boolean }) {
  let scopeAfterId = '';
  let nextRetentionSweep = 0;
  try {
    while (!options.signal.aborted) {
      // Publish health only after a successful pass through the durable store.
      const result = await runPrivateVoiceSupervisorTick({ ...options, scopeAfterId });
      scopeAfterId = result.scopeAfterId;
      if (options.signal.aborted) break;
      const time = (options.now?.() ?? new Date()).getTime();
      if (time >= nextRetentionSweep) {
        await runAudioArtifactMaintenance(options);
        nextRetentionSweep = time + 60_000;
      }
      await privateVoiceSupervisorHeartbeat('healthy', options);
      if (options.once) break;
      await waitForPoll(options.signal, 1000);
    }
  } catch (error) {
    await privateVoiceSupervisorHeartbeat('unhealthy', options);
    throw error;
  } finally { await privateVoiceSupervisorHeartbeat('stopped', options); }
}
