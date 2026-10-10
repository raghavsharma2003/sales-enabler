import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, WriteConflictError, type Database } from '../server/db';
import { HttpError } from '../server/http';
import { operatorMembershipFence } from '../team/service';
import { parseAgentConfig } from '../platform/agents';
import { activateOwnedVoiceAttempt, assertInferenceAccess, beginVoiceAttempt, closeOwnedVoiceAttempt, failVoiceAttempt, markAttemptProvisioning } from '../usage/service';
import type { UsageDependencies, VoiceAttemptRecord } from '../usage/contracts';
import { azureVoiceLiveConfiguration } from './voice-live-session';
import type { LiveVoiceProfile } from './live-voice';
import type { SpeechDeliveryProfile } from './speech-delivery';
import type { RelationshipContext } from './relationship';
import type { VoiceBehaviorContext } from './contracts';
import { isVoiceToolName, type VoiceToolName } from './tools/contracts';
import { rowData, sourceDigest, type ToolRow } from './tools/authority';

type Statement = Parameters<Database['batch']>[0][number];
type Environment = Record<string, string | undefined>;
type EngineProjection = {
  instructions: string; openingMessage: string; inputMode: 'text' | 'microphone'; model: string;
  liveVoiceProfile: LiveVoiceProfile; enabledTools: VoiceToolName[]; speechVocabulary?: string[];
  settings: { allowedLanguages: string[]; primaryLanguage: string; responseStyle: string };
  relationship: RelationshipContext; speechDelivery?: SpeechDeliveryProfile; behaviorContext: VoiceBehaviorContext;
};
/** Server-only projection. Never return this authority from an HTTP API. */
export type VoiceLiveAuthority = EngineProjection & {
  id: string; organizationId: string; userId: string; previewId: string; voiceAttemptId: string;
  sessionEpoch: string; origin: string; deadlineAt: string;
};
export type VoiceLiveGrant = { token: string; url: string; expiresAt: string; voiceAttemptId: string };
type StoredTicket = Omit<VoiceLiveAuthority, keyof EngineProjection> & {
  claimExpiresAt: string; consent: true; snapshotDigest: string; engineDigest: string;
  memberDigest: string; accountDigest: string; sourcesDigest: string; providerConfigurationDigest: string;
  endedAt?: string; outcome?: 'complete' | 'failed' | 'uncertain';
};
const ticketKind = 'voice:live-ticket';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const nowFor = (deps: UsageDependencies) => (deps.now?.() ?? new Date()).getTime();
const unavailable = () => new HttpError(403, 'Voice Live authorization is no longer available.');
const expired = () => new HttpError(410, 'Voice Live authorization expired or was already used.');
const databaseFor = (deps: UsageDependencies) => deps.database ? Promise.resolve(deps.database) : db();

/** Public-safe status only: no provider URL, resource key, or configuration digest. */
export function voiceLiveGatewayConfiguration(env: Environment = process.env): { configured: boolean; url?: string; reason?: string } {
  const explicit = env.VOICE_LIVE_GATEWAY_URL?.trim();
  const raw = explicit || env.PRIVATE_SPEECH_GATEWAY_URL?.trim() || env.CONTINUOUS_SPEECH_GATEWAY_URL?.trim() || env.PUBLIC_VOICE_GATEWAY_URL?.trim();
  if (!raw) return { configured: false, reason: 'Voice Live gateway is not configured.' };
  try {
    const url = new URL(raw);
    const local = env.INFERENCE_ALLOW_LOCAL === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local)) || url.username || url.password || url.search || url.hash ||
      (explicit ? url.pathname !== '/private-voice-live' : !['/voice', '/private-speech', '/private-voice-live'].includes(url.pathname))) throw new Error();
    url.pathname = '/private-voice-live';
    return { configured: true, url: url.toString() };
  } catch { return { configured: false, reason: 'Configure a secure Voice Live gateway at /private-voice-live.' }; }
}
function exactOrigin(origin: string, env: Environment): string {
  try {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || (env.APP_URL && new URL(env.APP_URL).origin !== origin)) throw new Error();
    return origin;
  } catch { throw new HttpError(403, 'Voice Live requires the configured browser origin.'); }
}
async function row(database: Database, organizationId: string, kind: string, id: string): Promise<ToolRow | undefined> {
  return (await database.all('SELECT id,kind,status,data,created_at FROM entities WHERE organization_id = ? AND kind = ? AND id = ?', [organizationId, kind, id]))[0] as ToolRow | undefined;
}
function fence(organizationId: string, record: ToolRow): Statement {
  return { sql: `UPDATE entities SET data = data WHERE id = ? AND organization_id = ? AND kind = ? AND data = ? AND ${record.status === null ? 'status IS NULL' : 'status = ?'}`,
    params: [record.id, organizationId, record.kind, record.data, ...(record.status === null ? [] : [record.status])], expectedChanges: 1 };
}
function ticketWrite(record: ToolRow, stored: StoredTicket, status: string): Statement {
  return { sql: 'UPDATE entities SET status = ?, data = ? WHERE id = ? AND organization_id = ? AND kind = ? AND status = ? AND data = ?',
    params: [status, JSON.stringify(stored), record.id, stored.organizationId, ticketKind, record.status, record.data], expectedChanges: 1 };
}
async function commit(database: Database, statements: Statement[]) {
  try { await database.batch(statements); }
  catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Voice Live authority changed. Start a new preview after reviewing its status.'); throw error; }
}
function projection(value: EngineProjection): EngineProjection {
  return { instructions: value.instructions, openingMessage: value.openingMessage, inputMode: value.inputMode, model: value.model,
    liveVoiceProfile: value.liveVoiceProfile, enabledTools: value.enabledTools, ...(value.speechVocabulary ? { speechVocabulary: value.speechVocabulary } : {}),
    settings: value.settings, relationship: value.relationship, ...(value.speechDelivery ? { speechDelivery: value.speechDelivery } : {}), behaviorContext: value.behaviorContext };
}
function actor(stored: StoredTicket): AuthUser { return { id: stored.userId, organizationId: stored.organizationId, email: '' }; }

async function scope(database: Database, user: AuthUser, previewId: string, deps: UsageDependencies) {
  const now = nowFor(deps), env = deps.env ?? process.env;
  await assertInferenceAccess(user, { ...deps, database });
  const membership = await operatorMembershipFence(user, database);
  const account = await row(database, user.organizationId, 'auth:account', `auth:account:${user.id}`);
  if (account && (account.status !== 'active' || (rowData(account).required && !rowData(account).verifiedAt))) throw unavailable();
  const accountFence: Statement = account ? fence(user.organizationId, account) : { sql: 'UPDATE users SET id = id WHERE id = ? AND organization_id = ? AND NOT EXISTS (SELECT 1 FROM entities WHERE id = ?)', params: [user.id, user.organizationId, `auth:account:${user.id}`], expectedChanges: 1 };
  const preview = await row(database, user.organizationId, 'platform:voice_preview', previewId);
  if (!preview) throw new HttpError(404, 'Voice Live preview not found in this workspace.');
  const data = rowData(preview), tool = data.toolAuthority;
  if (preview.status !== 'connection_issued' || data.requestedBy !== user.id || data.toolEndedAt || data.provider !== 'azure' || data.voiceTransport !== 'voice_live' ||
      data.mode !== 'internal_draft_test' || data.campaignRunId || data.releaseId || !['text', 'microphone'].includes(data.inputMode) ||
      typeof data.instructions !== 'string' || !data.instructions.trim() || data.instructions.length > 60000 ||
      typeof data.openingMessage !== 'string' || !data.openingMessage.trim() || data.openingMessage.length > 2000 || !/\b(ai|artificial intelligence|virtual assistant)\b/i.test(data.openingMessage) ||
      !tool || tool.version !== 1 || tool.contextMode !== 'internal_operator_browser' || tool.contextDigest !== data.contextDigest ||
      (tool.contactId || '') !== (data.contactId || '') || !Number.isFinite(Date.parse(tool.expiresAt)) || Date.parse(tool.expiresAt) <= now ||
      !Array.isArray(tool.enabledTools) || tool.enabledTools.length > 3 || !tool.enabledTools.every(isVoiceToolName) || !Array.isArray(tool.sources) || tool.sources.length > 150) throw unavailable();
  const config = parseAgentConfig(data.config);
  if (config.liveVoice?.engine !== 'azure-voice-live' || config.voiceProfile === 'maya-despina' ||
      JSON.stringify(config.enabledTools ?? []) !== JSON.stringify(tool.enabledTools) || !data.relationship || typeof data.relationship !== 'object' || Array.isArray(data.relationship)) throw unavailable();
  const provider = (() => { try { return azureVoiceLiveConfiguration(env); } catch { throw new HttpError(503, 'Azure Voice Live server configuration is unavailable.'); } })();
  const fences = [membership, accountFence, fence(user.organizationId, preview)];
  if (data.contactId) {
    const contact = await row(database, user.organizationId, 'contact', data.contactId);
    const profile = await row(database, user.organizationId, 'platform:customer_profile', `customer-profile:${hash(JSON.stringify([user.organizationId, data.contactId]))}`);
    const customer = contact && rowData(contact), profileData = profile && rowData(profile);
    if (!contact || customer!.optOut === true || customer!.doNotContact === true || customer!.consent === 'denied' || !profile || profile.status !== 'active' || profileData!.contactId !== data.contactId || profileData!.consent?.browser_voice?.granted !== true) throw unavailable();
    fences.push(fence(user.organizationId, contact), fence(user.organizationId, profile));
  }
  const sources = new Map<string, ToolRow>();
  for (const id of config.knowledgeIds) {
    const source = await row(database, user.organizationId, 'platform:brain_source', id);
    if (!source || source.status !== 'approved') throw unavailable();
    sources.set(`${source.kind}:${id}`, source);
  }
  for (const anchor of tool.sources) {
    if (!anchor || typeof anchor.kind !== 'string' || typeof anchor.id !== 'string' || typeof anchor.digest !== 'string') throw unavailable();
    const source = await row(database, user.organizationId, anchor.kind, anchor.id);
    if (!source || sourceDigest(source) !== anchor.digest) throw unavailable();
    sources.set(`${source.kind}:${source.id}`, source);
  }
  // Relationship anchors remain authoritative even when no optional tools are enabled.
  if (config.memoryScope === 'approved_contact') for (const id of data.relationship.sourceIds ?? []) {
    if (typeof id !== 'string' || id.length > 200) throw unavailable();
    const source = await row(database, user.organizationId, 'memory', id) ?? await row(database, user.organizationId, 'platform:commitment', id);
    if (!source || rowData(source).contactId !== data.contactId || source.status !== (source.kind === 'memory' ? 'approved' : 'open')) throw unavailable();
    sources.set(`${source.kind}:${source.id}`, source);
  }
  for (const source of sources.values()) fences.push(fence(user.organizationId, source));
  const settings = { allowedLanguages: config.allowedLanguages, primaryLanguage: config.primaryLanguage, responseStyle: config.responseStyle };
  const relationship = data.relationship as RelationshipContext;
  const behaviorContext: VoiceBehaviorContext = { settings, relationship, ...(config.speechDelivery ? { speechDelivery: config.speechDelivery } : {}) };
  const engine = projection({ instructions: data.instructions, openingMessage: data.openingMessage, inputMode: data.inputMode, model: provider.model,
    liveVoiceProfile: config.liveVoice, enabledTools: tool.enabledTools, ...(config.speechVocabulary ? { speechVocabulary: config.speechVocabulary } : {}), settings, relationship, ...(config.speechDelivery ? { speechDelivery: config.speechDelivery } : {}), behaviorContext });
  return { preview, data, fences, engine, engineDigest: hash(JSON.stringify(engine)),
    snapshotDigest: hash(JSON.stringify([config, data.contextDigest, tool, engine])), memberDigest: hash(String(membership.params![0])), accountDigest: hash(account?.data ?? 'legacy'),
    sourcesDigest: hash(JSON.stringify([...sources.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, source]) => [id, sourceDigest(source)]))),
    providerConfigurationDigest: provider.providerConfigurationDigest, contextExpiresAt: Date.parse(tool.expiresAt) };
}

export async function issueVoiceLiveGrant(user: AuthUser, input: { previewId: string; requestId: string; consent: true }, origin: string, deps: UsageDependencies = {}): Promise<VoiceLiveGrant> {
  if (input.consent !== true || typeof input.previewId !== 'string' || !input.previewId || input.previewId.length > 100) throw new HttpError(400, 'An issued private preview and voice consent are required.');
  const env = deps.env ?? process.env, configuration = voiceLiveGatewayConfiguration(env);
  exactOrigin(origin, env);
  if (!configuration.configured) throw new HttpError(503, configuration.reason!);
  if (new URL(configuration.url!).protocol === 'ws:' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw unavailable();
  const database = await databaseFor(deps), current = await scope(database, user, input.previewId, deps), now = nowFor(deps);
  if (current.data.voiceLiveAuthorityId || current.data.voiceAttemptId) throw new HttpError(409, 'This Voice Live preview was already authorized.');
  const reservation = await beginVoiceAttempt(user, { requestId: input.requestId, provider: 'azure', purpose: 'voice_live' }, { ...deps, database });
  if (reservation.replayed || reservation.state !== 'reserved') throw new HttpError(409, 'This voice request already exists or was cancelled.');
  try {
    const attemptRow = await row(database, user.organizationId, 'voice:attempt', reservation.id);
    if (!attemptRow) throw unavailable();
    const attempt = JSON.parse(attemptRow.data) as VoiceAttemptRecord;
    if (attempt.userId !== user.id || attempt.purpose !== 'voice_live' || attempt.state !== 'reserved' || attempt.stopRequestedAt || attempt.deadlineAt <= new Date(now).toISOString()) throw unavailable();
    const token = randomBytes(32).toString('hex'), id = `${ticketKind}:${hash(token)}`;
    const deadlineAt = new Date(Math.min(Date.parse(reservation.deadlineAt), current.contextExpiresAt)).toISOString();
    const stored: StoredTicket = { id, organizationId: user.organizationId, userId: user.id, previewId: input.previewId, voiceAttemptId: reservation.id, sessionEpoch: randomUUID(), origin,
      deadlineAt, claimExpiresAt: new Date(Math.min(now + 60000, Date.parse(deadlineAt))).toISOString(), consent: true, snapshotDigest: current.snapshotDigest, engineDigest: current.engineDigest,
      memberDigest: current.memberDigest, accountDigest: current.accountDigest, sourcesDigest: current.sourcesDigest, providerConfigurationDigest: current.providerConfigurationDigest };
    const previewData = JSON.stringify({ ...JSON.parse(current.preview.data), data: { ...current.data, voiceLiveAuthorityId: id, voiceAttemptId: reservation.id } });
    await commit(database, [...current.fences,
      { sql: 'UPDATE entities SET data = ? WHERE id = ? AND organization_id = ? AND kind = ? AND data = ?', params: [previewData, input.previewId, user.organizationId, 'platform:voice_preview', current.preview.data], expectedChanges: 1 },
      { sql: 'UPDATE entities SET data = ? WHERE id = ? AND organization_id = ? AND kind = ? AND status = ? AND data = ?', params: [JSON.stringify({ ...attempt, deadlineAt, callRecord: { kind: 'voice_preview', id: input.previewId } }), attempt.id, user.organizationId, 'voice:attempt', 'reserved', attemptRow.data], expectedChanges: 1 },
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [id, user.organizationId, ticketKind, 'issued', JSON.stringify(stored), new Date(now).toISOString()] },
    ]);
    return { token, url: configuration.url!, expiresAt: stored.claimExpiresAt, voiceAttemptId: stored.voiceAttemptId };
  } catch (error) {
    // No ticket has left this function, so no upstream socket can have been allocated.
    await failVoiceAttempt(user, reservation.id, { definitivePreProviderFailure: true }, { ...deps, database }).catch(() => {});
    throw error;
  }
}

async function validateStored(database: Database, record: ToolRow, origin: string, deps: UsageDependencies, authority?: VoiceLiveAuthority) {
  const stored = JSON.parse(record.data) as StoredTicket, now = nowFor(deps);
  if (stored.origin !== exactOrigin(origin, deps.env ?? process.env) || !stored.consent || Date.parse(stored.deadlineAt) <= now) throw unavailable();
  if (authority && (authority.id !== stored.id || authority.organizationId !== stored.organizationId || authority.userId !== stored.userId || authority.previewId !== stored.previewId || authority.voiceAttemptId !== stored.voiceAttemptId || authority.sessionEpoch !== stored.sessionEpoch || authority.deadlineAt !== stored.deadlineAt || hash(JSON.stringify(projection(authority))) !== stored.engineDigest)) throw unavailable();
  const current = await scope(database, actor(stored), stored.previewId, deps);
  if (current.data.voiceLiveAuthorityId !== stored.id || current.data.voiceAttemptId !== stored.voiceAttemptId || current.snapshotDigest !== stored.snapshotDigest || current.memberDigest !== stored.memberDigest || current.accountDigest !== stored.accountDigest || current.sourcesDigest !== stored.sourcesDigest || current.providerConfigurationDigest !== stored.providerConfigurationDigest) throw unavailable();
  const attemptRow = await row(database, stored.organizationId, 'voice:attempt', stored.voiceAttemptId);
  if (!attemptRow) throw unavailable();
  const attempt = JSON.parse(attemptRow.data) as VoiceAttemptRecord;
  if (attempt.userId !== stored.userId || attempt.purpose !== 'voice_live' || attempt.stopRequestedAt || attempt.deadlineAt <= new Date(now).toISOString() || attempt.deadlineAt !== stored.deadlineAt || attempt.callRecord?.kind !== 'voice_preview' || attempt.callRecord.id !== stored.previewId || !['reserved', 'connecting', 'active'].includes(attempt.state)) throw unavailable();
  return { stored, current, attempt, attemptRow };
}
export async function claimVoiceLiveTicket(token: string, origin: string, deps: UsageDependencies = {}): Promise<VoiceLiveAuthority> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw expired();
  const database = await databaseFor(deps);
  const record = (await database.all('SELECT id,kind,status,data,created_at FROM entities WHERE id = ? AND kind = ?', [`${ticketKind}:${hash(token)}`, ticketKind]))[0] as ToolRow | undefined;
  if (!record || record.status !== 'issued' || Date.parse(JSON.parse(record.data).claimExpiresAt) <= nowFor(deps)) throw expired();
  const { stored, current, attempt } = await validateStored(database, record, origin, deps);
  if (attempt.state !== 'reserved') throw expired();
  if (!await markAttemptProvisioning(actor(stored), stored.voiceAttemptId, { ...deps, database }, [...current.fences, ticketWrite(record, stored, 'claimed')])) throw expired();
  return { id: stored.id, organizationId: stored.organizationId, userId: stored.userId, previewId: stored.previewId, voiceAttemptId: stored.voiceAttemptId,
    sessionEpoch: stored.sessionEpoch, origin: stored.origin, deadlineAt: stored.deadlineAt, ...current.engine };
}
export async function recheckVoiceLiveAuthority(authority: VoiceLiveAuthority, deps: UsageDependencies = {}): Promise<void> {
  const database = await databaseFor(deps), record = await row(database, authority.organizationId, ticketKind, authority.id);
  if (!record || !['claimed', 'active'].includes(record.status ?? '')) throw unavailable();
  const { stored, current, attempt, attemptRow } = await validateStored(database, record, authority.origin, deps, authority);
  if (!['connecting', 'active'].includes(attempt.state)) throw unavailable();
  await commit(database, [...current.fences, fence(stored.organizationId, record), fence(stored.organizationId, attemptRow)]);
}
export async function activateVoiceLiveAuthority(authority: VoiceLiveAuthority, deps: UsageDependencies = {}): Promise<void> {
  const database = await databaseFor(deps), record = await row(database, authority.organizationId, ticketKind, authority.id);
  if (!record || !['claimed', 'active'].includes(record.status ?? '')) throw unavailable();
  const { stored, current } = await validateStored(database, record, authority.origin, deps, authority);
  await activateOwnedVoiceAttempt(actor(stored), stored.voiceAttemptId, { ...deps, database }, [...current.fences, ticketWrite(record, stored, 'active')]);
}
/** Call only after the gateway observes actual owned WebSocket closure; close-request timeout is uncertain. */
export async function finishVoiceLiveAuthority(authority: VoiceLiveAuthority, outcome: { outcome: 'complete' | 'failed' | 'uncertain' }, deps: UsageDependencies = {}): Promise<void> {
  if (!['complete', 'failed', 'uncertain'].includes(outcome.outcome)) throw new HttpError(400, 'Invalid Voice Live terminal outcome.');
  const database = await databaseFor(deps);
  for (let tries = 0; tries < 4; tries++) {
    const record = await row(database, authority.organizationId, ticketKind, authority.id);
    if (!record) throw unavailable();
    const stored = JSON.parse(record.data) as StoredTicket;
    if (stored.userId !== authority.userId || stored.voiceAttemptId !== authority.voiceAttemptId || stored.previewId !== authority.previewId || stored.sessionEpoch !== authority.sessionEpoch || hash(JSON.stringify(projection(authority))) !== stored.engineDigest) throw unavailable();
    if (record.status === 'closed') return;
    if (!['claimed', 'active', 'uncertain'].includes(record.status ?? '')) throw unavailable();
    const now = new Date(nowFor(deps)).toISOString(), next = { ...stored, endedAt: now, outcome: outcome.outcome };
    const fences = [ticketWrite(record, next, outcome.outcome === 'uncertain' ? 'uncertain' : 'closed')];
    const preview = await row(database, stored.organizationId, 'platform:voice_preview', stored.previewId);
    if (preview) {
      const data = rowData(preview);
      if (data.requestedBy === stored.userId && data.voiceAttemptId === stored.voiceAttemptId && data.voiceLiveAuthorityId === stored.id) fences.push({ sql: 'UPDATE entities SET data = ? WHERE id = ? AND organization_id = ? AND kind = ? AND data = ?', params: [JSON.stringify({ ...JSON.parse(preview.data), data: { ...data, toolEndedAt: data.toolEndedAt ?? now, voiceLiveEndedAt: now, voiceLiveOutcome: outcome.outcome } }), preview.id, stored.organizationId, 'platform:voice_preview', preview.data], expectedChanges: 1 });
    }
    try { await closeOwnedVoiceAttempt(actor(stored), stored.voiceAttemptId, outcome, { ...deps, database }, fences); return; }
    catch (error) {
      if (!(error instanceof HttpError) || error.status !== 409 || tries === 3) throw error;
    }
  }
}
