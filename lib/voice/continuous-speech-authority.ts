import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, WriteConflictError, type Database } from '../server/db';
import { field, HttpError } from '../server/http';
import { operatorMembershipFence } from '../team/service';
import { rowData, type ToolRow } from './tools/authority';
import { CONTINUOUS_SPEECH_MAX_SECONDS, CONTINUOUS_SPEECH_PCM, type ContinuousSpeechGrant } from './continuous-speech-contracts';

type Statement = Parameters<Database['batch']>[0][number];
type Environment = Record<string, string | undefined>;
export type ContinuousSpeechDependencies = { database?: Database; now?: () => number; env?: Environment };
export type ContinuousSpeechAuthority = {
  id: string; organizationId: string; userId: string; callId: string;
  callKind: 'platform:voice_preview' | 'platform:voice_connection'; origin: string;
  language: 'en-IN' | 'hi-IN'; recognitionLanguages?: Array<'en-IN' | 'hi-IN'>; sessionEpoch: string; expiresAt: string; concurrencyKey: string;
};
type StoredAuthority = ContinuousSpeechAuthority & { claimExpiresAt: string; consent: true; memberDigest: string; accountDigest: string };
export type ContinuousSpeechSummary = { reason?: string; audioBytes?: number; hypotheses?: number; durationMs?: number };
const ticketKind = 'voice:speech-ticket', leaseKind = 'voice:speech-lease';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const unavailable = () => new HttpError(403, 'Continuous speech authorization is no longer available.');
const expired = () => new HttpError(410, 'Continuous speech authorization expired or was already used.');

export function continuousSpeechConfiguration(env: Environment = process.env): { configured: boolean; url?: string; reason?: string } {
  if (!env.CONTINUOUS_SPEECH_GATEWAY_URL) return { configured: false, reason: 'Continuous speech gateway is not configured.' };
  if (!env.AZURE_SPEECH_KEY || !/^[a-z][a-z0-9-]{1,40}$/.test(env.AZURE_SPEECH_REGION || '')) return { configured: false, reason: 'Azure Speech server configuration is required.' };
  try {
    const url = new URL(env.CONTINUOUS_SPEECH_GATEWAY_URL);
    const local = env.CONTINUOUS_SPEECH_ALLOW_LOCAL_WS === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local)) || url.pathname !== '/private-speech' || url.search || url.hash || url.username || url.password) throw new Error();
    return { configured: true, url: url.toString() };
  } catch { return { configured: false, reason: 'Configure a secure continuous speech gateway at /private-speech.' }; }
}
function browserOrigin(origin: string): string {
  try { const url = new URL(origin); if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error(); return origin; }
  catch { throw new HttpError(403, 'An exact browser origin is required.'); }
}
function language(value: unknown): ContinuousSpeechAuthority['language'] {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (['english', 'en', 'en-in', 'hinglish'].includes(normalized)) return 'en-IN';
  if (['hindi', 'hi', 'hi-in'].includes(normalized)) return 'hi-IN';
  throw new HttpError(422, 'Continuous speech currently supports English (India) and Hindi (India) primary languages.');
}
async function row(database: Database, org: string, kind: string, id: string): Promise<ToolRow | undefined> {
  return (await database.all('SELECT id,kind,status,data,created_at FROM entities WHERE organization_id = ? AND kind = ? AND id = ?', [org, kind, id]))[0] as ToolRow | undefined;
}
function fence(org: string, value: ToolRow): Statement {
  return { sql: `UPDATE entities SET data = data WHERE id = ? AND organization_id = ? AND kind = ? AND data = ? AND ${value.status === null ? 'status IS NULL' : 'status = ?'}`,
    params: [value.id, org, value.kind, value.data, ...(value.status === null ? [] : [value.status])], expectedChanges: 1 };
}
function insert(org: string, id: string, kind: string, status: string, value: unknown, now: number): Statement {
  return { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING', params: [id, org, kind, status, JSON.stringify(value), new Date(now).toISOString()], expectedChanges: 1 };
}
async function commit(database: Database, statements: Statement[]) {
  try { await database.batch(statements); }
  catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Continuous speech authorization changed or is already in use.'); throw error; }
}
function reference(body: Record<string, unknown>) {
  const previewId = field(body, 'previewId', 100, false), connectionId = field(body, 'connectionId', 100, false);
  if (Boolean(previewId) === Boolean(connectionId)) throw new HttpError(400, 'Use exactly one issued voice connection or preview.');
  return { callId: previewId || connectionId, callKind: (previewId ? 'platform:voice_preview' : 'platform:voice_connection') as ContinuousSpeechAuthority['callKind'] };
}

/** Independent of enabled tools: recognition never acquires tool or public visitor authority. */
async function scope(database: Database, user: AuthUser, ref: Pick<ContinuousSpeechAuthority, 'callId' | 'callKind'>, now: number) {
  const membership = await operatorMembershipFence(user, database);
  const account = await row(database, user.organizationId, 'auth:account', `auth:account:${user.id}`);
  if (account && (account.status !== 'active' || (rowData(account).required && !rowData(account).verifiedAt))) throw unavailable();
  const accountFence: Statement = account ? fence(user.organizationId, account) : {
    sql: 'UPDATE users SET id = id WHERE id = ? AND organization_id = ? AND NOT EXISTS (SELECT 1 FROM entities WHERE id = ?)',
    params: [user.id, user.organizationId, `auth:account:${user.id}`], expectedChanges: 1,
  };
  const call = await row(database, user.organizationId, ref.callKind, ref.callId);
  if (!call) throw new HttpError(404, 'Voice connection not found in this workspace.');
  const data = rowData(call), tool = data.toolAuthority;
  if (data.requestedBy !== user.id) throw unavailable();
  if (call.status !== 'connection_issued' || data.toolEndedAt || data.provider !== 'azure' || data.inputMode !== 'microphone' ||
      (ref.callKind === 'platform:voice_preview' ? data.mode !== 'internal_draft_test' : data.mode !== 'released_browser_call') ||
      !tool || tool.version !== 1 || tool.contextMode !== 'internal_operator_browser' || tool.contextDigest !== data.contextDigest ||
      (tool.contactId || '') !== (data.contactId || '')) throw unavailable();
  const expiresAt = Math.min(Date.parse(call.created_at) + CONTINUOUS_SPEECH_MAX_SECONDS * 1000, Date.parse(tool.expiresAt));
  if (!Number.isFinite(expiresAt) || expiresAt <= now) throw expired();
  const fences = [membership, accountFence, fence(user.organizationId, call)];
  if (ref.callKind === 'platform:voice_connection') {
    const release = typeof data.releaseId === 'string' ? await row(database, user.organizationId, 'platform:release', data.releaseId) : undefined;
    const released = release && rowData(release);
    if (!release || release.status !== 'active' || released!.channel !== 'browser' || released!.agentId !== data.agentId || released!.versionId !== data.versionId) throw unavailable();
    fences.push(fence(user.organizationId, release));
  }
  if (data.contactId) {
    const contact = await row(database, user.organizationId, 'contact', data.contactId);
    const profile = await row(database, user.organizationId, 'platform:customer_profile', `customer-profile:${hash(JSON.stringify([user.organizationId, data.contactId]))}`);
    const customer = contact && rowData(contact), profileData = profile && rowData(profile);
    if (!contact || customer!.optOut === true || customer!.doNotContact === true || customer!.consent === 'denied' || !profile || profile.status !== 'active' || profileData!.contactId !== data.contactId || profileData!.consent?.browser_voice?.granted !== true) throw unavailable();
    fences.push(fence(user.organizationId, contact), fence(user.organizationId, profile));
  }
  if (data.campaignRunId) {
    const campaign = await row(database, user.organizationId, 'platform:campaign_run', data.campaignRunId), run = campaign && rowData(campaign);
    if (!campaign || campaign.status !== 'active' || run!.snapshot?.agentReleaseId !== data.releaseId || !run!.recipients?.some((r: { contactId: string; status: string }) => r.contactId === data.contactId && r.status === 'queued')) throw unavailable();
    fences.push(fence(user.organizationId, campaign));
  }
  const primary = language(data.config?.primaryLanguage);
  const recognitionLanguages: Array<'en-IN' | 'hi-IN'> = [primary];
  for (const value of Array.isArray(data.config?.allowedLanguages) ? data.config.allowedLanguages : []) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim().toLowerCase();
    const candidates: Array<'en-IN' | 'hi-IN'> = normalized === 'hinglish' ? ['en-IN', 'hi-IN'] : ['english', 'en', 'en-in'].includes(normalized) ? ['en-IN'] : ['hindi', 'hi', 'hi-in'].includes(normalized) ? ['hi-IN'] : [];
    for (const candidate of candidates) if (!recognitionLanguages.includes(candidate)) recognitionLanguages.push(candidate);
  }
  return { call, data, fences, expiresAt, language: primary, recognitionLanguages, memberDigest: hash(String(membership.params![0])), accountDigest: hash(account?.data || 'legacy') };
}
function publicAuthority(stored: StoredAuthority): ContinuousSpeechAuthority {
  const { id, organizationId, userId, callId, callKind, origin, language, recognitionLanguages, sessionEpoch, expiresAt, concurrencyKey } = stored;
  return { id, organizationId, userId, callId, callKind, origin, language, recognitionLanguages, sessionEpoch, expiresAt, concurrencyKey };
}
export async function issueContinuousSpeechGrant(user: AuthUser, body: Record<string, unknown>, origin: string, deps: ContinuousSpeechDependencies = {}): Promise<ContinuousSpeechGrant> {
  if (body.consent !== true) throw new HttpError(400, 'Confirm consent before enabling continuous speech.');
  browserOrigin(origin);
  const config = continuousSpeechConfiguration(deps.env);
  if (!config.configured) throw new HttpError(503, config.reason!);
  if (new URL(config.url!).protocol === 'ws:' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw new HttpError(403, 'Local speech transport requires a local browser origin.');
  const database = deps.database ?? await db(), now = (deps.now ?? Date.now)(), ref = reference(body);
  const current = await scope(database, user, ref, now);
  if (current.data.continuousSpeechAuthorityId) throw new HttpError(409, 'Continuous speech was already authorized for this call.');
  const ticket = randomBytes(32).toString('hex'), id = `voice:speech-ticket:${hash(ticket)}`;
  const stored: StoredAuthority = { id, organizationId: user.organizationId, userId: user.id, ...ref, origin, language: current.language, recognitionLanguages: current.recognitionLanguages,
    sessionEpoch: randomUUID(), expiresAt: new Date(current.expiresAt).toISOString(), concurrencyKey: `voice:speech-user:${hash(JSON.stringify([user.organizationId, user.id]))}`,
    claimExpiresAt: new Date(Math.min(now + 60_000, current.expiresAt)).toISOString(), consent: true, memberDigest: current.memberDigest, accountDigest: current.accountDigest };
  const callData = JSON.stringify({ ...JSON.parse(current.call.data), data: { ...current.data, continuousSpeechAuthorityId: id } });
  await commit(database, [...current.fences, { sql: 'UPDATE entities SET data = ? WHERE id = ? AND data = ?', params: [callData, current.call.id, current.call.data], expectedChanges: 1 }, insert(user.organizationId, id, ticketKind, 'issued', stored, now)]);
  return { transport: 'websocket', url: config.url!, ticket, expiresAt: stored.claimExpiresAt, maxDurationSeconds: Math.floor((current.expiresAt - now) / 1000), language: stored.language, recognitionLanguages: stored.recognitionLanguages, pcm: CONTINUOUS_SPEECH_PCM };
}
async function validateStored(database: Database, record: ToolRow, origin: string, now: number) {
  const stored = JSON.parse(record.data) as StoredAuthority;
  if (stored.origin !== browserOrigin(origin) || stored.consent !== true || Date.parse(stored.expiresAt) <= now) throw unavailable();
  const user = { id: stored.userId, organizationId: stored.organizationId, email: '' };
  const current = await scope(database, user, stored, now);
  if (current.data.continuousSpeechAuthorityId !== stored.id || current.language !== stored.language || JSON.stringify(current.recognitionLanguages) !== JSON.stringify(stored.recognitionLanguages) || current.expiresAt !== Date.parse(stored.expiresAt) || current.memberDigest !== stored.memberDigest || current.accountDigest !== stored.accountDigest) throw unavailable();
  return { stored, current };
}
export async function claimContinuousSpeechTicket(ticket: string, origin: string, deps: ContinuousSpeechDependencies = {}): Promise<ContinuousSpeechAuthority> {
  if (!/^[a-f0-9]{64}$/.test(ticket)) throw expired();
  const database = deps.database ?? await db(), now = (deps.now ?? Date.now)();
  const record = (await database.all('SELECT id,kind,status,data,created_at FROM entities WHERE id = ? AND kind = ?', [`voice:speech-ticket:${hash(ticket)}`, ticketKind]))[0] as ToolRow | undefined;
  if (!record || record.status !== 'issued' || Date.parse(JSON.parse(record.data).claimExpiresAt) <= now) throw expired();
  const { stored, current } = await validateStored(database, record, origin, now);
  const lease = await row(database, stored.organizationId, leaseKind, stored.concurrencyKey);
  if (lease?.status === 'active' && Date.parse(JSON.parse(lease.data).expiresAt) > now) throw new HttpError(429, 'One continuous speech session is allowed per account.');
  const leaseData = { sessionEpoch: stored.sessionEpoch, expiresAt: stored.expiresAt };
  const leaseWrite: Statement = lease ? { sql: 'UPDATE entities SET data = ?, status = ? WHERE id = ? AND data = ? AND status = ?', params: [JSON.stringify(leaseData), 'active', lease.id, lease.data, lease.status], expectedChanges: 1 } : insert(stored.organizationId, stored.concurrencyKey, leaseKind, 'active', leaseData, now);
  await commit(database, [...current.fences, { sql: 'UPDATE entities SET status = ? WHERE id = ? AND status = ? AND data = ?', params: ['claimed', record.id, 'issued', record.data], expectedChanges: 1 }, leaseWrite]);
  return publicAuthority(stored);
}
export async function recheckContinuousSpeechAuthority(authority: ContinuousSpeechAuthority, deps: ContinuousSpeechDependencies = {}): Promise<void> {
  const database = deps.database ?? await db(), now = (deps.now ?? Date.now)();
  const record = await row(database, authority.organizationId, ticketKind, authority.id);
  if (!record || record.status !== 'claimed') throw unavailable();
  const { stored, current } = await validateStored(database, record, authority.origin, now);
  if (JSON.stringify(publicAuthority(stored)) !== JSON.stringify(publicAuthority(authority as StoredAuthority))) throw unavailable();
  const lease = await row(database, stored.organizationId, leaseKind, stored.concurrencyKey);
  if (!lease || lease.status !== 'active' || JSON.parse(lease.data).sessionEpoch !== stored.sessionEpoch) throw unavailable();
  await commit(database, [...current.fences, fence(stored.organizationId, record), fence(stored.organizationId, lease)]);
}
export async function closeContinuousSpeechAuthority(authority: ContinuousSpeechAuthority, summary: ContinuousSpeechSummary = {}, deps: ContinuousSpeechDependencies = {}): Promise<void> {
  const database = deps.database ?? await db(), now = (deps.now ?? Date.now)();
  const reasons = ['ended', 'client', 'configuration', 'authentication', 'capacity', 'backpressure', 'provider', 'expired', 'protocol', 'input_limit', 'microphone'];
  const metadata: Record<string, string | number> = { reason: reasons.includes(summary.reason || '') ? summary.reason! : 'ended' };
  for (const key of ['audioBytes', 'hypotheses', 'durationMs'] as const) if (Number.isSafeInteger(summary[key]) && summary[key]! >= 0) metadata[key] = Math.min(summary[key]!, key === 'audioBytes' ? 19_200_000 : key === 'durationMs' ? 600_000 : 100_000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const record = await row(database, authority.organizationId, ticketKind, authority.id);
    if (!record) return;
    const stored = JSON.parse(record.data) as StoredAuthority;
    if (stored.sessionEpoch !== authority.sessionEpoch || stored.userId !== authority.userId) throw unavailable();
    if (!['issued', 'claimed'].includes(record.status || '')) return;
    const lease = await row(database, stored.organizationId, leaseKind, stored.concurrencyKey);
    try {
      await commit(database, [
        { sql: 'UPDATE entities SET status = ?, data = ? WHERE id = ? AND status = ? AND data = ?', params: ['closed', JSON.stringify({ ...stored, endedAt: new Date(now).toISOString(), summary: metadata }), record.id, record.status, record.data], expectedChanges: 1 },
        ...(lease?.status === 'active' && JSON.parse(lease.data).sessionEpoch === stored.sessionEpoch ? [{ sql: 'UPDATE entities SET status = ? WHERE id = ? AND data = ? AND status = ?', params: ['closed', lease.id, lease.data, 'active'], expectedChanges: 1 } satisfies Statement] : []),
      ]);
      return;
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 409) throw error;
      const latest = await row(database, authority.organizationId, ticketKind, authority.id);
      if (!latest) return;
      const latestAuthority = JSON.parse(latest.data) as StoredAuthority;
      if (latestAuthority.sessionEpoch !== authority.sessionEpoch || latestAuthority.userId !== authority.userId) throw unavailable();
      // Claim can win the issued -> claimed CAS while browser abort is in flight.
      // Reread that same epoch and its newly acquired lease, then close both.
      if (latest.status === 'closed') return;
      if (attempt === 2 || !['issued', 'claimed'].includes(latest.status || '')) throw error;
    }
  }
}
/** Authenticated browser abort revokes a grant even when its socket has not connected. */
export async function endContinuousSpeechGrant(user: AuthUser, body: Record<string, unknown>, origin: string, deps: ContinuousSpeechDependencies = {}): Promise<void> {
  const database = deps.database ?? await db(), ref = reference(body);
  const membership = await operatorMembershipFence(user, database), call = await row(database, user.organizationId, ref.callKind, ref.callId);
  if (!call) throw new HttpError(404, 'Voice connection not found in this workspace.');
  const data = rowData(call);
  if (data.requestedBy !== user.id) throw unavailable();
  await commit(database, [membership, fence(user.organizationId, call)]);
  if (!data.continuousSpeechAuthorityId) return;
  const record = await row(database, user.organizationId, ticketKind, data.continuousSpeechAuthorityId);
  if (!record) return;
  const stored = JSON.parse(record.data) as StoredAuthority;
  if (stored.origin !== browserOrigin(origin)) throw unavailable();
  await closeContinuousSpeechAuthority(publicAuthority(stored), { reason: 'client' }, deps);
}
