import { randomUUID, createHash } from 'node:crypto';
import { db, WriteConflictError } from './db';
import type { AuthUser } from './auth';
import { field, HttpError } from './http';
import { getRecord } from '../platform/records';
import { compileRelationalRuntime } from '../voice/relational-runtime';
import type { RelationshipContext } from '../voice/relationship';
import type { AgentConfig } from '../platform/agents';
import { customerCatalogGuard, existingCustomerMatch } from '../ingestion/customer-catalog';
import { customerPhone } from '../platform/phone';
import { normalizeVoiceDiagnostics } from '../voice/diagnostics';
import { normalizeVoiceTools } from '../voice/tools/contracts';
import { listVoiceToolReceipts } from '../voice/tools/service';
import { operatorMembershipFence } from '../team/service';

export type Entity = { id: string; createdAt: string; status?: string; [key: string]: unknown };
export type Kind = 'contact' | 'knowledge' | 'memory' | 'action' | 'session' | 'agent';
function decode(row: Record<string, unknown>): Entity {
  const data = JSON.parse(String(row.data));
  return { ...data, id: String(row.id), createdAt: String(row.created_at), ...(row.status ? { status: String(row.status) } : {}) };
}
export async function listEntities(organizationId: string, kind: Kind): Promise<Entity[]> {
  const rows = await (await db()).all('SELECT id, data, status, created_at FROM entities WHERE organization_id = ? AND kind = ? ORDER BY created_at DESC, id DESC', [organizationId, kind]);
  return rows.map(decode);
}
export async function getEntity(organizationId: string, kind: Kind, id: string): Promise<Entity> {
  const [row] = await (await db()).all('SELECT id, data, status, created_at FROM entities WHERE organization_id = ? AND kind = ? AND id = ?', [organizationId, kind, id]);
  if (!row) throw new HttpError(404, 'Record not found in this workspace.');
  return decode(row);
}
export async function insertEntity(user: AuthUser, kind: Kind, data: Record<string, unknown>, status?: string, stableId?: string): Promise<Entity> {
  const id = stableId || randomUUID(); const createdAt = new Date().toISOString();
  await (await db()).batch([
    { sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, user.organizationId, kind, status ?? null, JSON.stringify(data), createdAt] },
    { sql: 'INSERT INTO audit_events (id, organization_id, user_id, entity_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [randomUUID(), user.organizationId, user.id, id, `${kind}.created`, createdAt] },
  ]);
  return { ...data, id, createdAt, ...(status ? { status } : {}) };
}
export async function optionalContact(user: AuthUser, body: Record<string, unknown>, required = false): Promise<string | undefined> {
  const contactId = field(body, 'contactId', 100, required);
  if (contactId) await getEntity(user.organizationId, 'contact', contactId);
  return contactId || undefined;
}

export async function createContact(user: AuthUser, body: Record<string, unknown>): Promise<Entity> {
  const actor = await operatorMembershipFence(user);
  const name = field(body, 'name', 160);
  const email = field(body, 'email', 254, false);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const data = { name, email, phone: customerPhone(body.phone), stage: field(body, 'stage', 80, false) || 'New', notes: field(body, 'notes', 10000, false) };
  const database = await db(), guard = await customerCatalogGuard(database, user.organizationId);
  const match = await existingCustomerMatch(database, user.organizationId, name, email);
  if (match) throw new HttpError(409, `A customer with this ${match.reason === 'email_match' ? 'email' : 'name'} already exists. Review that record before creating another.`);
  const id = randomUUID(), now = new Date().toISOString();
  try {
    await database.batch([
      guard,
      actor,
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [id, user.organizationId, 'contact', null, JSON.stringify(data), now] },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, id, 'contact.created', now] },
    ]);
  } catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Customer directory changed. Refresh and review again.'); throw error; }
  return { ...data, id, createdAt: now };
}
export async function createKnowledge(user: AuthUser, body: Record<string, unknown>): Promise<Entity> {
  return insertEntity(user, 'knowledge', { title: field(body, 'title', 200), content: field(body, 'content', 50000), source: 'Staff-authored company knowledge', ownerId: user.id });
}
export async function createMemory(user: AuthUser, body: Record<string, unknown>): Promise<Entity> {
  if (body.status !== undefined && body.status !== 'proposed') throw new HttpError(400, 'New memories must be proposed for review.');
  const contactId = await optionalContact(user, body, true);
  return insertEntity(user, 'memory', { contactId, content: field(body, 'content', 10000), source: field(body, 'source', 1000), proposedBy: user.id }, 'proposed');
}
export async function createAction(user: AuthUser, body: Record<string, unknown>): Promise<Entity> {
  if (body.status !== undefined && body.status !== 'proposed') throw new HttpError(400, 'New actions must be proposed for review.');
  return insertEntity(user, 'action', { contactId: await optionalContact(user, body), title: field(body, 'title', 200), description: field(body, 'description', 10000, false), execution: 'manual' }, 'proposed');
}
export async function createSession(user: AuthUser, body: Record<string, unknown>): Promise<Entity> {
  let contactId = await optionalContact(user, body);
  const agentId = field(body, 'agentId', 100, false);
  const agentVersionId = field(body, 'agentVersionId', 100, false);
  const releaseId = field(body, 'releaseId', 100, false);
  const source = field(body, 'source', 40, false);
  const previewId = field(body, 'previewId', 100, false);
  const connectionId = field(body, 'connectionId', 100, false);
  let connectionMetadata: Record<string, unknown> | undefined;
  if (connectionId && source !== 'browser_voice') throw new HttpError(400, 'A released connection belongs to a released voice session.');
  if (body.inputMode !== undefined && body.inputMode !== 'text' && body.inputMode !== 'microphone') throw new HttpError(400, 'Invalid conversation input mode.');
  let previewMetadata: Record<string, unknown> | undefined;
  let runtimeSettings: AgentConfig | undefined;
  let runtimeRelationship: RelationshipContext | undefined;
  if (source && source !== 'browser_voice' && source !== 'browser_preview') throw new HttpError(400, 'Unsupported session source.');
  if (source === 'browser_preview') {
    if (!previewId || agentVersionId || releaseId) throw new HttpError(400, 'Draft test sessions need a preview connection and cannot claim a published release.');
    const preview = await getRecord(user.organizationId, 'voice_preview', previewId);
    if (preview.status !== 'connection_issued' || preview.data.requestedBy !== user.id) throw new HttpError(403, 'Use the preview connection issued to your account.');
    if (contactId && preview.data.contactId !== contactId) throw new HttpError(400, 'The preview customer does not match this conversation.');
    if (agentId && preview.data.agentId !== agentId) throw new HttpError(400, 'The preview agent does not match this conversation.');
    contactId = preview.data.contactId as string | undefined;
    runtimeSettings = preview.data.config as AgentConfig;
    runtimeRelationship = preview.data.relationship as RelationshipContext | undefined;
    previewMetadata = { previewId, agentId: preview.data.agentId, previewConfig: preview.data.config, contextDigest: preview.data.contextDigest, provider: preview.data.provider, inputMode: preview.data.inputMode, mode: 'internal_draft_test', enabledTools: normalizeVoiceTools((preview.data.toolAuthority as { enabledTools?: unknown } | undefined)?.enabledTools) };
  } else if (agentId || agentVersionId || releaseId || source || previewId) {
    if (!agentId || !agentVersionId || !releaseId || source !== 'browser_voice' || previewId) throw new HttpError(400, 'Browser voice sessions require the agent, version and release.');
    const [version, release] = await Promise.all([getRecord(user.organizationId, 'agent_version', agentVersionId), getRecord(user.organizationId, 'release', releaseId)]);
    runtimeSettings = version.data.config as AgentConfig;
    if (version.data.agentId !== agentId || release.data.agentId !== agentId || release.data.versionId !== agentVersionId || release.data.channel !== 'browser') throw new HttpError(400, 'Session agent, version and release do not match.');
    if (connectionId) {
      const issued = await getRecord(user.organizationId, 'voice_connection', connectionId);
      if (issued.status !== 'connection_issued' || issued.data.requestedBy !== user.id) throw new HttpError(403, 'Use the voice connection issued to your account.');
      if (issued.data.agentId !== agentId || issued.data.versionId !== agentVersionId || issued.data.releaseId !== releaseId || (issued.data.contactId || '') !== (contactId || '')) throw new HttpError(400, 'This connection belongs to a different release or customer.');
      runtimeSettings = issued.data.config as AgentConfig;
      runtimeRelationship = issued.data.relationship as RelationshipContext | undefined;
      connectionMetadata = { connectionId, provider: issued.data.provider, inputMode: issued.data.inputMode, contextDigest: issued.data.contextDigest, enabledTools: normalizeVoiceTools((issued.data.toolAuthority as { enabledTools?: unknown } | undefined)?.enabledTools),
        ...(issued.data.campaignRunId ? { campaignRunId: issued.data.campaignRunId, campaignDigest: issued.data.campaignDigest } : {}) };
    }
  }
  if (!Array.isArray(body.transcript) || body.transcript.length < 1 || body.transcript.length > 500) throw new HttpError(400, 'Transcript must contain between 1 and 500 messages.');
  const transcript = body.transcript.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new HttpError(400, 'Invalid transcript message.');
    const message = item as Record<string, unknown>;
    if (message.role !== 'user' && message.role !== 'assistant') throw new HttpError(400, 'Transcript roles must be user or assistant.');
    const receivedAt = field(message, 'receivedAt', 40, false);
    if (receivedAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(receivedAt)) throw new HttpError(400, 'receivedAt must be an ISO UTC timestamp.');
    if (receivedAt && !Number.isFinite(Date.parse(receivedAt))) throw new HttpError(400, 'receivedAt must be a valid timestamp.');
    return { role: message.role, text: field(message, 'text', 10000), ...(receivedAt ? { receivedAt } : {}) };
  });
  const idempotencyKey = field(body, 'idempotencyKey', 36, false);
  const diagnostics = normalizeVoiceDiagnostics(body.diagnostics);
  if (body.diagnostics !== undefined && (!diagnostics || (!previewMetadata && !connectionMetadata))) throw new HttpError(400, 'Call diagnostics require valid browser observations and an issued connection.');
  const toolReceipts = previewMetadata ? await listVoiceToolReceipts(user, { previewId }) : connectionMetadata ? await listVoiceToolReceipts(user, { connectionId }) : undefined;
  if (idempotencyKey && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(idempotencyKey)) throw new HttpError(400, 'idempotencyKey must be a UUID.');
  const runtimeEvidence = compileRelationalRuntime({ entries: transcript.map((turn, index) => ({ ...turn, id: `saved-${index}`, role: turn.role as "user" | "assistant" })), relationship: runtimeRelationship, settings: runtimeSettings });
  const data = { contactId, transcript, runtimeEvidence, ...(diagnostics ? { diagnostics } : {}), ...(toolReceipts ? { toolReceipts } : {}), runtimeContextBasis: source === 'browser_preview' ? 'issued_preview' : connectionId ? 'issued_connection' : 'version_only', provider: field(body, 'provider', 80, false) || 'text', summary: field(body, 'summary', 10000, false), ...(body.inputMode ? { inputMode: body.inputMode } : {}), ...(source === 'browser_preview' ? { source, ...previewMetadata } : source ? { source, agentId, agentVersionId, releaseId, ...connectionMetadata } : {}), transcriptSource: 'Browser-submitted; timestamps are client receipt times, not verified speech events' };
  const id = idempotencyKey ? `session:${createHash('sha256').update(`${user.organizationId}:${idempotencyKey}`).digest('hex')}` : undefined;
  try { return await insertEntity(user, 'session', data, undefined, id); }
  catch (error) {
    if (!id) throw error;
    const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, user.organizationId, 'session']);
    if (!row) throw error;
    if (row.data !== JSON.stringify(data)) throw new HttpError(409, 'This session key was already used with a different transcript.');
    return getEntity(user.organizationId, 'session', id);
  }
}

export async function saveAgent(user: AuthUser, body: Record<string, unknown>): Promise<Entity> {
  const data = {
    name: field(body, 'name', 80), role: field(body, 'role', 300),
    language: field(body, 'language', 80, false) || 'English',
    tone: field(body, 'tone', 200, false) || 'Warm, clear, and concise',
    greeting: field(body, 'greeting', 500, false), instructions: field(body, 'instructions', 2000, false),
  };
  const id = `agent:${user.organizationId}`; const now = new Date().toISOString();
  await (await db()).batch([
    { sql: `INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, 'agent', NULL, ?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data`, params: [id, user.organizationId, JSON.stringify(data), now] },
    { sql: 'INSERT INTO audit_events (id, organization_id, user_id, entity_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [randomUUID(), user.organizationId, user.id, id, 'agent.configured', now] },
  ]);
  return getEntity(user.organizationId, 'agent', id);
}

export async function transition(user: AuthUser, kind: 'memory' | 'action', id: string, status: string): Promise<Entity> {
  const entity = await getEntity(user.organizationId, kind, id);
  const allowed = kind === 'memory'
    ? { proposed: ['approved', 'revoked'], approved: ['revoked'], revoked: [] }
    : { proposed: ['approved', 'dismissed'], approved: ['completed', 'dismissed'], completed: [], dismissed: [] };
  if (!Object.keys(allowed).includes(status)) throw new HttpError(400, 'Unknown status.');
  if (entity.status === status) return entity;
  if (!(allowed[entity.status as keyof typeof allowed] as string[] | undefined)?.includes(status)) throw new HttpError(409, `Cannot change ${entity.status} to ${status}.`);
  const database = await db();
  const approvalFences: { sql: string; params: (string | number | null)[]; expectedChanges: number }[] = [];
  let memoryPreimage: string | undefined;
  if (kind === 'memory' && status === 'approved') {
    const [memoryRow] = await database.all('SELECT data,status FROM entities WHERE id=? AND organization_id=? AND kind=?', [id, user.organizationId, 'memory']);
    if (!memoryRow || memoryRow.status !== entity.status) throw new HttpError(409, 'Memory changed. Refresh and review again.');
    memoryPreimage = String(memoryRow.data);
    const memory = JSON.parse(memoryPreimage) as Record<string, unknown>;
    const hasLearningLineage = ['sourceSessionId', 'sourceDigest', 'sourceRef', 'sourceQuote', 'sourceAnalysisId', 'sourceCandidateId'].some(key => memory[key] !== undefined);
    if (hasLearningLineage) {
      const sessionId = memory.sourceSessionId, expectedDigest = memory.sourceDigest, quote = memory.sourceQuote;
      const ref = memory.sourceRef;
      if (typeof sessionId !== 'string' || !sessionId || typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest) ||
        typeof quote !== 'string' || quote.length < 3 || quote.length > 400 || !ref || typeof ref !== 'object' || Array.isArray(ref))
        throw new HttpError(409, 'Learning memory has incomplete source evidence. Review it again.');
      const { turnIndex, start, end } = ref as Record<string, unknown>;
      if (!Number.isSafeInteger(turnIndex) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
        Number(turnIndex) < 0 || Number(start) < 0 || Number(end) <= Number(start))
        throw new HttpError(409, 'Learning memory has invalid source evidence. Review it again.');
      const [sessionRow] = await database.all('SELECT data,status,created_at FROM entities WHERE id=? AND organization_id=? AND kind=?', [sessionId, user.organizationId, 'session']);
      if (!sessionRow) throw new HttpError(409, 'The source conversation is unavailable. Review the memory again.');
      const sessionRaw = String(sessionRow.data);
      const actualDigest = createHash('sha256').update(JSON.stringify(sessionRaw)).digest('hex');
      const session = JSON.parse(sessionRaw) as { contactId?: string; transcript?: { role?: string; text?: string }[] };
      const turn = Array.isArray(session.transcript) ? session.transcript[Number(turnIndex)] : undefined;
      if (actualDigest !== expectedDigest || !memory.contactId || session.contactId !== memory.contactId ||
        !turn || turn.role !== 'user' || typeof turn.text !== 'string' || Number(end) > turn.text.length ||
        turn.text.slice(Number(start), Number(end)) !== quote)
        throw new HttpError(409, 'The source conversation changed or its caller quote no longer matches. Review the memory again.');
      // The source preimage is checked inside the same transaction as approval.
      approvalFences.push({
        sql: `UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND data=? AND created_at=? AND ${sessionRow.status === null ? 'status IS NULL' : 'status=?'}`,
        params: sessionRow.status === null ? [sessionId, user.organizationId, 'session', sessionRaw, String(sessionRow.created_at)] : [sessionId, user.organizationId, 'session', sessionRaw, String(sessionRow.created_at), String(sessionRow.status)],
        expectedChanges: 1,
      });
    }
  }
  // A compare-and-set guards concurrent approvals and writes their audit event in the same transaction.
  try {
    await database.batch([
      ...approvalFences,
      { sql: `UPDATE entities SET status = ? WHERE id = ? AND organization_id = ? AND kind = ? AND status = ?${memoryPreimage === undefined ? '' : ' AND data = ?'}`, params: memoryPreimage === undefined ? [status, id, user.organizationId, kind, entity.status!] : [status, id, user.organizationId, kind, entity.status!, memoryPreimage], expectedChanges: 1 },
      { sql: 'INSERT INTO audit_events (id, organization_id, user_id, entity_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [randomUUID(), user.organizationId, user.id, id, `${kind}.${status}`, new Date().toISOString()] },
    ]);
  } catch (error) {
    if (error instanceof WriteConflictError) throw new HttpError(409, 'This record changed while you were editing. Refresh and try again.');
    throw error;
  }
  const updated = await getEntity(user.organizationId, kind, id);
  if (updated.status !== status) throw new HttpError(409, 'This record changed while you were editing. Refresh and try again.');
  return updated;
}

export async function workspace(user: AuthUser) {
  const [organization] = await (await db()).all('SELECT id, name FROM organizations WHERE id = ?', [user.organizationId]);
  if (!organization) throw new HttpError(404, 'Workspace not found.');
  const [contacts, knowledge, memories, actions, sessions, agents] = await Promise.all(
    (['contact', 'knowledge', 'memory', 'action', 'session', 'agent'] as Kind[]).map((kind) => listEntities(user.organizationId, kind)),
  );
  return { user: { id: user.id, email: user.email, role: user.role, emailVerified: user.emailVerified, verificationRequired: user.verificationRequired }, organization, contacts, knowledge, memories, actions, sessions, agents };
}
