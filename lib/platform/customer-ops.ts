import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, WriteConflictError, type Database } from '../server/db';
import { createContact, getEntity, listEntities } from '../server/store';
import { field, HttpError } from '../server/http';
import { createRecord, getRecord, listRecords, updateRecord, type PlatformRecord } from './records';
import { brainCatalogGuard } from '../ingestion/brain-catalog';
import { customerCatalogGuard, existingCustomerMatch } from '../ingestion/customer-catalog';
import { customerPhone } from './phone';
import { operatorMembershipFence } from '../team/service';

type CustomerProfile = { contactId: string; name: string; email: string; phone?: string; stage: string; notes: string; consent: Record<string, { granted: boolean; evidence: string; recordedAt: string }> };
type BrainSource = { title: string; content: string; sourceLabel: string; authoredBy: string; approvedAt?: string; approvedBy?: string; revokedAt?: string; correctionReason?: string };
type Commitment = { title: string; description: string; contactId?: string; sourceSessionId?: string; ownerId: string; dueDate: string; completionNote?: string; completedAt?: string; cancellationReason?: string; notification?: { channel: string; evidence: string; recordedAt: string } };
const revision = (body: Record<string, unknown>) => { if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new HttpError(400, 'Current revision required.'); return Number(body.revision); };
const current = async <T extends Record<string, unknown>>(user: AuthUser, kind: string, id: string, body: Record<string, unknown>) => {
  const record = await getRecord(user.organizationId, kind, id) as PlatformRecord<T>;
  if (record.revision !== revision(body)) throw new HttpError(409, 'This record changed. Refresh and try again.');
  return record;
};
const email = (body: Record<string, unknown>) => { const value = field(body, 'email', 254, false); if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new HttpError(400, 'Enter a valid email address.'); return value; };
const dueDate = (body: Record<string, unknown>) => { const value = field(body, 'dueDate', 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new HttpError(400, 'Enter a valid due date.'); return value; };
async function profile(user: AuthUser, contactId: string): Promise<PlatformRecord<CustomerProfile> | undefined> {
  try { return await getRecord(user.organizationId, 'customer_profile', profileId(user.organizationId, contactId)) as PlatformRecord<CustomerProfile>; }
  catch (error) { if (error instanceof HttpError && error.status === 404) return undefined; throw error; }
}
const profileId = (organizationId: string, contactId: string) => `customer-profile:${createHash('sha256').update(JSON.stringify([organizationId, contactId])).digest('hex')}`;
async function createProfile(user: AuthUser, data: CustomerProfile, authority?: { database: Database; guard: Parameters<Database['batch']>[0][number] }): Promise<PlatformRecord<CustomerProfile>> {
  const id = profileId(user.organizationId, data.contactId), now = new Date().toISOString();
  const database = authority?.database || await db();
  const guard = authority?.guard || await customerCatalogGuard(database, user.organizationId);
  const actor = await operatorMembershipFence(user, database);
  try {
    await database.batch([
      guard,
      actor,
      { sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, user.organizationId, 'platform:customer_profile', 'active', JSON.stringify({ revision: 1, updatedAt: now, data }), now] },
      { sql: 'INSERT INTO audit_events (id, organization_id, user_id, entity_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [randomUUID(), user.organizationId, user.id, id, 'customer_profile.created', now] },
    ]);
  } catch (error) {
    if (await profile(user, data.contactId)) throw new HttpError(409, 'This customer changed. Refresh and try again.');
    if (error instanceof WriteConflictError) throw new HttpError(409, 'Customer directory changed. Refresh and try again.');
    throw error;
  }
  return { id, kind: 'customer_profile', status: 'active', revision: 1, createdAt: now, updatedAt: now, data };
}
async function saveProfileIdentity(user: AuthUser, saved: PlatformRecord<CustomerProfile>, data: CustomerProfile, database: Database, guard: Parameters<Database['batch']>[0][number]): Promise<PlatformRecord<CustomerProfile>> {
  const actor = await operatorMembershipFence(user, database);
  const [row] = await database.all('SELECT data,status FROM entities WHERE id=? AND organization_id=? AND kind=?', [saved.id, user.organizationId, 'platform:customer_profile']);
  if (!row) throw new HttpError(404, 'Customer profile not found.');
  const prior = JSON.parse(String(row.data));
  if (prior.revision !== saved.revision || row.status !== saved.status) throw new HttpError(409, 'This customer changed. Refresh and try again.');
  const now = new Date().toISOString();
  const stored = { revision: saved.revision + 1, updatedAt: now, data };
  try {
    await database.batch([
      guard,
      actor,
      { sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND data=? AND status=?', params: [JSON.stringify(stored), 'active', saved.id, user.organizationId, 'platform:customer_profile', String(row.data), saved.status], expectedChanges: 1 },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, saved.id, `customer_profile.updated:active:r${stored.revision}`, now] },
    ]);
  } catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Customer directory changed. Refresh and try again.'); throw error; }
  return { ...saved, status: 'active', revision: stored.revision, updatedAt: now, data };
}
const compactBrain = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
async function assertBrainUnique(user: AuthUser, source: PlatformRecord<BrainSource>): Promise<void> {
  const [brain, legacy] = await Promise.all([listRecords<BrainSource>(user.organizationId, 'brain_source'), listEntities(user.organizationId, 'knowledge')]);
  const others = [...brain.filter(item => item.id !== source.id && item.status === 'approved').map(item => item.data), ...legacy];
  if (others.some(item => compactBrain(item.title) === compactBrain(source.data.title) || compactBrain(item.content) === compactBrain(source.data.content))) throw new HttpError(409, 'Approved company knowledge already has this title or content. Resolve the duplicate before approval.');
}
async function createBrain(user: AuthUser, data: BrainSource): Promise<PlatformRecord<BrainSource>> {
  const database = await db(), guard = await brainCatalogGuard(database, user.organizationId);
  const actor = await operatorMembershipFence(user, database);
  const id = randomUUID(), now = new Date().toISOString();
  try {
    await database.batch([
      guard,
      actor,
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [id, user.organizationId, 'platform:brain_source', 'draft', JSON.stringify({ revision: 1, updatedAt: now, data }), now] },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, id, 'brain_source.created', now] },
    ]);
  } catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Company brain changed. Refresh and try again.'); throw error; }
  return { id, kind: 'brain_source', status: 'draft', revision: 1, createdAt: now, updatedAt: now, data };
}
async function saveBrain(user: AuthUser, source: PlatformRecord<BrainSource>, data: BrainSource, status: string, database: Database, guard: Parameters<Database['batch']>[0][number]): Promise<PlatformRecord<BrainSource>> {
  const actor = await operatorMembershipFence(user, database);
  const [row] = await database.all('SELECT data,status FROM entities WHERE id=? AND organization_id=? AND kind=?', [source.id, user.organizationId, 'platform:brain_source']);
  if (!row) throw new HttpError(404, 'Record not found in this workspace.');
  const before = JSON.parse(String(row.data));
  if (before.revision !== source.revision || row.status !== source.status) throw new HttpError(409, 'This source changed. Refresh and try again.');
  const now = new Date().toISOString();
  const stored = { revision: source.revision + 1, updatedAt: now, data };
  try {
    await database.batch([
      guard,
      actor,
      { sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND data=? AND status=?', params: [JSON.stringify(stored), status, source.id, user.organizationId, 'platform:brain_source', String(row.data), source.status], expectedChanges: 1 },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, source.id, `brain_source.updated:${status}:r${stored.revision}`, now] },
    ]);
  } catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Company brain changed. Refresh and try again.'); throw error; }
  return { ...source, status, revision: stored.revision, updatedAt: now, data };
}
export async function handleCustomerAction(user: AuthUser, action: string, body: Record<string, unknown>): Promise<unknown> {
  if (action === 'customer.create') return createContact(user, { name: field(body, 'name', 160), email: email(body), phone: customerPhone(body.phone), stage: field(body, 'stage', 80, false) || 'New', notes: field(body, 'notes', 10000, false) });
  if (action === 'customer.update' || action === 'customer.consent') {
    const contactId = field(body, 'contactId', 100);
    const contact = await getEntity(user.organizationId, 'contact', contactId);
    const saved = await profile(user, contactId);
    const base: CustomerProfile = saved?.data || { contactId, name: String(contact.name), email: String(contact.email || ''), phone: String(contact.phone || ''), stage: String(contact.stage || 'New'), notes: String(contact.notes || ''), consent: {} };
    if (saved && saved.revision !== revision(body)) throw new HttpError(409, 'This customer changed. Refresh and try again.');
    if (action === 'customer.update') {
      const data = { ...base, name: field(body, 'name', 160), email: email(body), phone: body.phone === undefined ? base.phone || '' : customerPhone(body.phone), stage: field(body, 'stage', 80), notes: field(body, 'notes', 10000, false) };
      const database = await db(), guard = await customerCatalogGuard(database, user.organizationId);
      const match = await existingCustomerMatch(database, user.organizationId, data.name, data.email, contactId);
      if (match) throw new HttpError(409, `A customer with this ${match.reason === 'email_match' ? 'email' : 'name'} already exists. Review that record before changing this one.`);
      return saved ? saveProfileIdentity(user, saved, data, database, guard) : createProfile(user, data, { database, guard });
    }
    const channel = field(body, 'channel', 40);
    if (!['email', 'browser_voice', 'telephone', 'whatsapp'].includes(channel)) throw new HttpError(400, 'Unsupported contact channel.');
    if (typeof body.granted !== 'boolean') throw new HttpError(400, 'Consent choice required.');
    const evidence = field(body, 'evidence', 1000);
    const data = { ...base, consent: { ...base.consent, [channel]: { granted: body.granted, evidence, recordedAt: new Date().toISOString() } } };
    const database = await db(), guard = await customerCatalogGuard(database, user.organizationId);
    return saved ? saveProfileIdentity(user, saved, data, database, guard) : createProfile(user, data, { database, guard });
  }
  if (action === 'brain.create') {
    const data: BrainSource = { title: field(body, 'title', 200), content: field(body, 'content', 50000), sourceLabel: field(body, 'sourceLabel', 300), authoredBy: user.id };
    return createBrain(user, data);
  }
  if (action === 'brain.update' || action === 'brain.approve' || action === 'brain.revoke') {
    const source = await current<BrainSource>(user, 'brain_source', field(body, 'sourceId', 100), body);
    const database = await db(), guard = await brainCatalogGuard(database, user.organizationId);
    if (action === 'brain.update') return saveBrain(user, source, { ...source.data, title: field(body, 'title', 200), content: field(body, 'content', 50000), sourceLabel: field(body, 'sourceLabel', 300), approvedAt: undefined, approvedBy: undefined, revokedAt: undefined }, 'draft', database, guard);
    if (action === 'brain.approve') {
      if (source.status !== 'draft') throw new HttpError(409, 'Only draft sources can be approved.');
      await assertBrainUnique(user, source);
      return saveBrain(user, source, { ...source.data, approvedAt: new Date().toISOString(), approvedBy: user.id }, 'approved', database, guard);
    }
    if (source.status !== 'approved') throw new HttpError(409, 'Only approved sources can be revoked.');
    return saveBrain(user, source, { ...source.data, revokedAt: new Date().toISOString(), correctionReason: field(body, 'reason', 1000) }, 'revoked', database, guard);
  }
  if (action === 'brain.feedback') {
    const sessionId = field(body, 'sessionId', 100);
    const session = await getEntity(user.organizationId, 'session', sessionId);
    const contactId = field(body, 'contactId', 100, false) || String(session.contactId || '');
    if (contactId !== String(session.contactId || '')) throw new HttpError(400, 'Feedback customer must match the source conversation.');
    if (contactId) await getEntity(user.organizationId, 'contact', contactId);
    return createRecord(user, 'feedback', { sessionId, contactId, content: field(body, 'content', 5000), recordedBy: user.id }, 'recorded');
  }
  if (action === 'commitment.create') {
    const contactId = field(body, 'contactId', 100, false);
    const sourceSessionId = field(body, 'sourceSessionId', 100, false);
    if (contactId) await getEntity(user.organizationId, 'contact', contactId);
    if (sourceSessionId) {
      const session = await getEntity(user.organizationId, 'session', sourceSessionId);
      if (contactId && session.contactId !== contactId) throw new HttpError(400, 'Session and customer do not match.');
    }
    const data: Commitment = { title: field(body, 'title', 200), description: field(body, 'description', 10000, false), ...(contactId ? { contactId } : {}), ...(sourceSessionId ? { sourceSessionId } : {}), ownerId: user.id, dueDate: dueDate(body) };
    return createRecord(user, 'commitment', data, 'open');
  }
  if (action === 'commitment.complete' || action === 'commitment.notify' || action === 'commitment.cancel') {
    const task = await current<Commitment>(user, 'commitment', field(body, 'commitmentId', 100), body);
    if (task.data.ownerId !== user.id) throw new HttpError(403, 'Only the assigned owner can update this commitment.');
    if (action === 'commitment.complete') {
      if (task.status !== 'open') throw new HttpError(409, 'Only open commitments can be completed.');
      return updateRecord(user, task, { ...task.data, completionNote: field(body, 'completionNote', 5000), completedAt: new Date().toISOString() }, 'completed');
    }
    if (action === 'commitment.notify') {
      if (task.status !== 'completed') throw new HttpError(409, 'Complete the internal work first.');
      if (task.data.notification) throw new HttpError(409, 'Notification evidence is already recorded.');
      return updateRecord(user, task, { ...task.data, notification: { channel: field(body, 'channel', 80), evidence: field(body, 'evidence', 2000), recordedAt: new Date().toISOString() } }, 'completed');
    }
    if (task.status !== 'open') throw new HttpError(409, 'Only open commitments can be cancelled.');
    return updateRecord(user, task, { ...task.data, cancellationReason: field(body, 'reason', 1000) }, 'cancelled');
  }
  throw new HttpError(400, 'Unknown customer operations action.');
}
