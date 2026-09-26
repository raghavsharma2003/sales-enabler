import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, WriteConflictError } from '../server/db';
import { field, HttpError } from '../server/http';
import { getConnection, openCredentials } from '../integrations/vault';
import { listRecords } from '../platform/records';
import { operatorMembershipFence, requireWorkspaceOperator } from '../team/service';
import { customerCatalogGuard } from '../ingestion/customer-catalog';
import type { InboxMessage, InboxThread, MessageState, SendResult } from './contracts';
import { sendWhatsAppText, type WhatsAppDispatch } from './provider';
import { channelHandoffStatements, enqueueSavedWhatsAppInbound } from '../channel-agents/service';

const threadKind = 'messaging:whatsapp_thread';
const inboundKind = 'messaging:whatsapp_inbound';
const intentKind = 'messaging:whatsapp_intent';
const statusKind = 'messaging:whatsapp_status';
const hash = (parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const threadKey = (tenantId: string, connectionId: string, businessPhoneNumberId: string, phone: string) => `wa-thread:${hash([tenantId, connectionId, businessPhoneNumberId, phone])}`;
const inboundKey = (tenantId: string, connectionId: string, providerId: string) => `wa-in:${hash([tenantId, connectionId, providerId])}`;
const intentKey = (tenantId: string, requestId: string) => `wa-out:${hash([tenantId, requestId])}`;
const eventKey = (tenantId: string, connectionId: string, value: unknown) => `wa-status:${hash([tenantId, connectionId, value])}`;
const phonePattern = /^\+?[1-9]\d{6,14}$/;
export function normalizeWhatsAppPhone(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const phone = value.trim();
  return phonePattern.test(phone) ? phone.replace(/^\+/, '') : undefined;
}
const iso = (timestamp: unknown): string | undefined => {
  if (typeof timestamp !== 'string' || !/^\d{9,12}$/.test(timestamp)) return;
  const ms = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(ms) || ms < Date.UTC(2020, 0, 1) || ms > Date.now() + 5 * 60_000) return;
  return new Date(ms).toISOString();
};
type Row = { id: string; data: string; status: string | null; created_at: string };
type Stored<T> = { revision: number; updatedAt: string; data: T };
const parse = <T>(row: Row): Stored<T> => JSON.parse(String(row.data)) as Stored<T>;
async function row(tenantId: string, kind: string, id: string): Promise<Row | undefined> {
  return (await (await db()).all<Row>('SELECT id,data,status,created_at FROM entities WHERE id=? AND organization_id=? AND kind=?', [id, tenantId, kind]))[0];
}
async function operatorAnchor(user: AuthUser): Promise<Row> {
  await requireWorkspaceOperator(user);
  const member = await row(user.organizationId, 'team:member', `team:member:${user.id}`);
  const data = member ? JSON.parse(member.data) as { role?: string; status?: string } : undefined;
  if (!member || member.status !== 'active' || data?.status !== 'active' || (data.role !== 'owner' && data.role !== 'operator')) throw new HttpError(403, 'Operator access is required.');
  return member;
}
function fence(user: AuthUser, anchor: Row, kind: string) {
  return anchor.status === null
    ? { sql: 'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND status IS NULL AND data=?',
      params: [anchor.id, user.organizationId, kind, anchor.data], expectedChanges: 1 }
    : { sql: 'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?',
      params: [anchor.id, user.organizationId, kind, anchor.status, anchor.data], expectedChanges: 1 };
}
async function releaseThreadSend(user: AuthUser, threadId: string, intentId: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const saved = await row(user.organizationId, threadKind, threadId);
    if (!saved) return;
    const stored = parse<InboxThread>(saved);
    if (stored.data.activeSendIntentId !== intentId) return;
    const { activeSendIntentId: _active, ...thread } = stored.data;
    const now = new Date().toISOString();
    const next = { revision: stored.revision + 1, updatedAt: now, data: { ...thread, revision: thread.revision + 1 } };
    try { await (await db()).batch([{ sql: 'UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=? AND data=?', params: [JSON.stringify(next), threadId, user.organizationId, threadKind, saved.data], expectedChanges: 1 }]); return; }
    catch (error) { if (!(error instanceof WriteConflictError)) return; }
  }
}
async function staleIntent(tenantId: string, item: Row): Promise<Row> {
  if (item.status !== 'sending' || Date.now() - Date.parse(item.created_at) < 60_000) return item;
  const saved = parse<InboxMessage>(item), now = new Date().toISOString();
  const next = { revision: saved.revision + 1, updatedAt: now, data: { ...saved.data, state: 'uncertain' as const, reason: 'The send worker stopped before recording a result. Check Meta before taking any further action.' } };
  try { await (await db()).batch([{ sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND data=? AND status=?', params: [JSON.stringify(next), 'uncertain', item.id, tenantId, intentKind, item.data, 'sending'], expectedChanges: 1 }]);
    return { ...item, data: JSON.stringify(next), status: 'uncertain' };
  } catch { return (await row(tenantId, intentKind, item.id)) || item; }
}
export async function whatsappConnection(user: AuthUser) {
  const value = await getConnection(user, 'whatsapp_cloud');
  const credentials = openCredentials(user.organizationId, value.id, value.sealed);
  const ready = value.status === 'connected' && Boolean(credentials.phoneNumberId && credentials.token && credentials.appSecret && credentials.verifyToken);
  return { value, credentials, ready };
}
export async function inboxOverview(user: AuthUser) {
  let setup: { configured: boolean; ready: boolean; status?: string; webhookPath?: string; missing?: string[] };
  try {
    const { value, credentials, ready } = await whatsappConnection(user);
    setup = { configured: true, ready, status: value.status, webhookPath: `/api/integrations/whatsapp/webhook/${value.id}`,
      missing: [!credentials.appSecret && 'Meta app secret', !credentials.verifyToken && 'Webhook verify token', value.status !== 'connected' && 'Successful connection check'].filter(Boolean) as string[] };
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
    setup = { configured: false, ready: false, missing: ['WhatsApp Cloud connection'] };
  }
  const rows = await (await db()).all<Row>('SELECT id,data,status,created_at FROM entities WHERE organization_id=? AND kind=? ORDER BY created_at DESC LIMIT 300', [user.organizationId, threadKind]);
  const threads = rows.map(item => ({ id: item.id, ...parse<InboxThread>(item).data })).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return { setup, threads };
}
export async function inboxThread(user: AuthUser, id: string) {
  if (!/^wa-thread:[a-f0-9]{64}$/.test(id)) throw new HttpError(404, 'Inbox thread not found.');
  const selected = await row(user.organizationId, threadKind, id);
  if (!selected) throw new HttpError(404, 'Inbox thread not found.');
  const thread = parse<InboxThread>(selected).data;
  const inboundRows = await (await db()).all<Row>('SELECT id,data,status,created_at FROM entities WHERE organization_id=? AND kind=? ORDER BY created_at DESC LIMIT 1000', [user.organizationId, inboundKind]);
  const outRows = await (await db()).all<Row>('SELECT id,data,status,created_at FROM entities WHERE organization_id=? AND kind=? ORDER BY created_at DESC LIMIT 1000', [user.organizationId, intentKind]);
  const checkedOut = await Promise.all(outRows.map(item => staleIntent(user.organizationId, item)));
  const messages = [...inboundRows, ...checkedOut].map(item => parse<InboxMessage>(item).data).filter(item => item.threadId === id)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).slice(-200);
  const latest = Date.parse(thread.lastInboundAt);
  return { id, thread, messages, replyWindowOpen: Number.isFinite(latest) && Date.now() < latest + 24 * 60 * 60_000 };
}
export async function saveInbound(tenantId: string, connectionId: string, businessPhoneNumberId: string, input: { id: string; from: string; timestamp: string; type?: string; text?: { body?: string } }, attempt = 0): Promise<boolean> {
  const phone = normalizeWhatsAppPhone(input.from), receivedAt = iso(input.timestamp);
  if (!phone || !receivedAt || !/^\d{6,32}$/.test(businessPhoneNumberId) || !/^wamid\.[A-Za-z0-9._~+/=-]{1,240}$/.test(input.id)) return false;
  const id = inboundKey(tenantId, connectionId, input.id), threadId = threadKey(tenantId, connectionId, businessPhoneNumberId, phone);
  const text = input.type === 'text' && typeof input.text?.body === 'string' ? input.text.body.slice(0, 10000) : '';
  const type = typeof input.type === 'string' && /^[a-z_]{1,32}$/.test(input.type) ? input.type : 'unsupported';
  const preview = text ? text.slice(0, 180) : `[${type} message]`;
  const now = new Date().toISOString();
  const windowAt = receivedAt > now ? now : receivedAt;
  const message: InboxMessage = { id, threadId, direction: 'inbound', phone, text, type, providerId: input.id, providerAt: receivedAt, receivedAt: now };
  const database = await db();
  const prior = await row(tenantId, threadKind, threadId);
  const saved = prior ? parse<InboxThread>(prior) : undefined;
  const thread: InboxThread = saved ? { ...saved.data, lastInboundAt: windowAt > saved.data.lastInboundAt ? windowAt : saved.data.lastInboundAt,
    lastMessageAt: receivedAt > saved.data.lastMessageAt ? receivedAt : saved.data.lastMessageAt,
    lastPreview: receivedAt >= saved.data.lastMessageAt ? preview : saved.data.lastPreview, revision: saved.data.revision + 1 }
    : { phone, businessPhoneNumberId, lastInboundAt: windowAt, lastMessageAt: receivedAt, lastPreview: preview, handoff: 'open', revision: 1 };
  try {
    await database.batch([
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [id, tenantId, inboundKind, 'received', JSON.stringify({ revision: 1, updatedAt: now, data: message }), now] },
      prior ? { sql: 'UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=? AND data=?', params: [JSON.stringify({ revision: saved!.revision + 1, updatedAt: now, data: thread }), threadId, tenantId, threadKind, prior.data], expectedChanges: 1 }
        : { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [threadId, tenantId, threadKind, 'open', JSON.stringify({ revision: 1, updatedAt: now, data: thread }), now] },
    ]);
    await enqueueSavedWhatsAppInbound(tenantId, connectionId, id);
    return true;
  } catch (error) {
    if (await row(tenantId, inboundKind, id)) { await enqueueSavedWhatsAppInbound(tenantId, connectionId, id); return false; }
    if (error instanceof WriteConflictError && attempt < 3) return saveInbound(tenantId, connectionId, businessPhoneNumberId, input, attempt + 1);
    throw error;
  }
}
export async function saveStatus(tenantId: string, connectionId: string, input: { id: string; status: string; timestamp?: string; recipient_id?: string }): Promise<boolean> {
  if (!/^wamid\.[A-Za-z0-9._~+/=-]{1,240}$/.test(input.id) || !['sent', 'delivered', 'read', 'failed'].includes(input.status)) return false;
  const at = iso(input.timestamp);
  if (!at) return false;
  const recipient = normalizeWhatsAppPhone(input.recipient_id) || '';
  if (!recipient) return false;
  const id = eventKey(tenantId, connectionId, [input.id, input.status, at, recipient]);
  const database = await db();
  try { await database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [id, tenantId, statusKind, input.status, JSON.stringify({ providerId: input.id, status: input.status, at, recipient }), new Date().toISOString()]); }
  catch {
    if (await row(tenantId, statusKind, id)) {
      // The prior request may have persisted the receipt but stopped before
      // updating its outbound intent. Meta's replay must finish that work.
      await applyStatuses(tenantId, input.id);
      return false;
    }
    throw new HttpError(503, 'Could not save provider status.');
  }
  await applyStatuses(tenantId, input.id);
  return true;
}
const rank: Record<MessageState, number> = { sending: 0, uncertain: 1, rejected: 1, accepted: 2, failed: 3, delivered: 4, read: 5 };
async function applyStatuses(tenantId: string, providerId: string): Promise<void> {
  const intents = await (await db()).all<Row>('SELECT id,data,status,created_at FROM entities WHERE organization_id=? AND kind=?', [tenantId, intentKind]);
  const target = intents.find(item => parse<InboxMessage>(item).data.providerId === providerId);
  if (!target) return;
  const receipts = await (await db()).all<Row>('SELECT id,data,status,created_at FROM entities WHERE organization_id=? AND kind=?', [tenantId, statusKind]);
  const current = parse<InboxMessage>(target);
  const states = receipts.map(item => JSON.parse(item.data) as { providerId: string; status: string; recipient: string }).filter(item => item.providerId === providerId && item.recipient === current.data.phone)
    .map(item => item.status === 'sent' ? 'accepted' : item.status as MessageState).sort((a, b) => rank[b] - rank[a]);
  const state = states[0];
  if (!state || rank[state] <= rank[current.data.state || 'sending']) return;
  const now = new Date().toISOString();
  const next = { revision: current.revision + 1, updatedAt: now, data: { ...current.data, state } };
  try { await (await db()).batch([{ sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND data=?', params: [JSON.stringify(next), state, target.id, tenantId, intentKind, target.data], expectedChanges: 1 }]); }
  catch (error) { if (error instanceof WriteConflictError) return applyStatuses(tenantId, providerId); throw error; }
}
export async function linkInboxCustomer(user: AuthUser, threadId: string, customerId: string): Promise<void> {
  const memberFence = await operatorMembershipFence(user);
  const selected = await row(user.organizationId, threadKind, threadId);
  if (!selected) throw new HttpError(404, 'Inbox thread not found.');
  const saved = parse<InboxThread>(selected);
  const customerGuard = await customerCatalogGuard(await db(), user.organizationId);
  const contactAnchor = await row(user.organizationId, 'contact', customerId);
  if (!contactAnchor) throw new HttpError(404, 'Customer not found in this workspace.');
  const profiles = await listRecords<{ contactId: string; phone?: string }>(user.organizationId, 'customer_profile');
  const profile = profiles.find(item => item.data.contactId === customerId && item.status === 'active');
  const profileAnchor = profile ? await row(user.organizationId, 'platform:customer_profile', profile.id) : undefined;
  if (profile && (!profileAnchor || profileAnchor.status !== 'active')) throw new HttpError(409, 'Customer profile changed. Refresh and review before linking.');
  const contact = JSON.parse(contactAnchor.data) as { phone?: string; optOut?: boolean; doNotContact?: boolean };
  const profileData = profileAnchor ? parse<{ contactId: string; phone?: string }>(profileAnchor).data : undefined;
  if (profileData && profileData.contactId !== customerId) throw new HttpError(409, 'Customer profile changed. Refresh and review before linking.');
  const phone = normalizeWhatsAppPhone(profileData ? profileData.phone : contact.phone);
  if (!phone || phone !== saved.data.phone) throw new HttpError(409, 'Customer phone must exactly match this WhatsApp sender. Save the reviewed phone on the customer first.');
  if (contact.optOut === true || contact.doNotContact === true) throw new HttpError(409, 'Customer contact restriction blocks linking.');
  const now = new Date().toISOString();
  const next = { revision: saved.revision + 1, updatedAt: now, data: { ...saved.data, customerId, customerLinkedAt: now, customerLinkedBy: user.id, revision: saved.data.revision + 1 } };
  try { await (await db()).batch([
    memberFence,
    customerGuard,
    fence(user, contactAnchor, 'contact'),
    ...(profileAnchor ? [fence(user, profileAnchor, 'platform:customer_profile')] : []),
    { sql: 'UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=? AND data=?', params: [JSON.stringify(next), threadId, user.organizationId, threadKind, selected.data], expectedChanges: 1 },
    { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, threadId, 'whatsapp_inbox.customer_linked', now] }]); }
  catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Thread changed. Refresh and try again.'); throw error; }
}
export async function setInboxHandoff(user: AuthUser, threadId: string, handoff: 'open' | 'resolved'): Promise<void> {
  const memberFence = await operatorMembershipFence(user);
  const selected = await row(user.organizationId, threadKind, threadId);
  if (!selected) throw new HttpError(404, 'Inbox thread not found.');
  const saved = parse<InboxThread>(selected), now = new Date().toISOString();
  const next = { revision: saved.revision + 1, updatedAt: now, data: { ...saved.data, handoff, revision: saved.data.revision + 1 } };
  try { await (await db()).batch([memberFence, { sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND data=?', params: [JSON.stringify(next), handoff, threadId, user.organizationId, threadKind, selected.data], expectedChanges: 1 },
    { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, threadId, `whatsapp_inbox.${handoff}`, now] }]); }
  catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Thread changed. Refresh and try again.'); throw error; }
}
export async function sendInboxReply(user: AuthUser, input: { threadId: string; requestId: string; text: string }, dispatch: WhatsAppDispatch = sendWhatsAppText): Promise<InboxMessage> {
  const memberFence = await operatorMembershipFence(user);
  const memberAnchor = await operatorAnchor(user);
  const { threadId, requestId, text } = input;
  if (!/^wa-thread:[a-f0-9]{64}$/.test(threadId) || !/^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i.test(requestId)) throw new HttpError(400, 'Valid thread and unique request ID are required.');
  if (!text.trim() || text.length > 4096) throw new HttpError(400, 'Reply must be 1–4096 characters.');
  const id = intentKey(user.organizationId, requestId);
  const previous = await row(user.organizationId, intentKind, id);
  if (previous) {
    const saved = parse<InboxMessage>(await staleIntent(user.organizationId, previous)).data;
    if (saved.threadId !== threadId || saved.text !== text.trim()) throw new HttpError(409, 'Request ID already belongs to another reply.');
    return saved;
  }
  const { value: connection, credentials, ready } = await whatsappConnection(user);
  if (!ready) throw new HttpError(409, 'Complete WhatsApp webhook setup and check the connection before replying.');
  const selected = await row(user.organizationId, threadKind, threadId);
  if (!selected) throw new HttpError(404, 'Inbox thread not found.');
  const selectedStored = parse<InboxThread>(selected);
  const thread = selectedStored.data;
  if (thread.activeSendIntentId) {
    const held = await row(user.organizationId, intentKind, thread.activeSendIntentId);
    const checked = held ? await staleIntent(user.organizationId, held) : undefined;
    if (checked && ['accepted', 'delivered', 'read', 'failed', 'rejected'].includes(String(checked.status))) {
      await releaseThreadSend(user, threadId, thread.activeSendIntentId);
      throw new HttpError(409, 'The previous reply completed. Refresh the thread before sending another.');
    }
    throw new HttpError(409, 'Another reply is pending or has an uncertain outcome. Review its state before sending again.');
  }
  if (thread.businessPhoneNumberId !== credentials.phoneNumberId) throw new HttpError(409, 'This thread belongs to a different WhatsApp business number. Open its original connection to reply.');
  if (thread.handoff !== 'open') throw new HttpError(409, 'Reopen this thread before replying.');
  if (Date.now() >= Date.parse(thread.lastInboundAt) + 24 * 60 * 60_000) throw new HttpError(409, 'The 24-hour customer service window has closed. A reviewed template is required; template sending is not available here.');
  const customerAnchors: Row[] = [];
  const customerGuard = thread.customerId ? await customerCatalogGuard(await db(), user.organizationId) : undefined;
  let effectiveProfileId: string | undefined;
  if (thread.customerId) {
    const contactAnchor = await row(user.organizationId, 'contact', thread.customerId);
    const profiles = await listRecords<{ contactId: string; phone?: string; consent?: Record<string, { granted: boolean }> }>(user.organizationId, 'customer_profile');
    const profile = profiles.find(item => item.data.contactId === thread.customerId && item.status === 'active');
    effectiveProfileId = profile?.id;
    const profileAnchor = profile ? await row(user.organizationId, 'platform:customer_profile', profile.id) : undefined;
    if (!contactAnchor || (profile && !profileAnchor)) throw new HttpError(409, 'Customer record changed. Refresh and review before replying.');
    const contact = JSON.parse(contactAnchor.data) as { phone?: string; optOut?: boolean; doNotContact?: boolean; consent?: string };
    const savedProfile = profileAnchor?.status === 'active' ? parse<{ contactId: string; phone?: string; consent?: Record<string, { granted: boolean }> }>(profileAnchor).data : undefined;
    if (profileAnchor && (!savedProfile || savedProfile.contactId !== thread.customerId)) throw new HttpError(409, 'Customer profile changed. Refresh and review before replying.');
    if (normalizeWhatsAppPhone(savedProfile ? savedProfile.phone : contact.phone) !== thread.phone || savedProfile?.consent?.whatsapp?.granted === false || contact.optOut === true || contact.doNotContact === true || contact.consent === 'denied') throw new HttpError(409, 'Customer identity or contact permission changed. Review the customer record before replying.');
    customerAnchors.push(contactAnchor);
    if (profileAnchor) customerAnchors.push(profileAnchor);
  }
  const unresolved = await Promise.all((await (await db()).all<Row>('SELECT id,data,status,created_at FROM entities WHERE organization_id=? AND kind=? AND status IN (?,?)', [user.organizationId, intentKind, 'sending', 'uncertain'])).map(item => staleIntent(user.organizationId, item)));
  if (unresolved.some(item => parse<InboxMessage>(item).data.threadId === threadId)) throw new HttpError(409, 'A reply has an uncertain outcome. Resolve it with the provider before another send.');
  const now = new Date().toISOString();
  const claimedThreadRaw = JSON.stringify({ revision: selectedStored.revision + 1, updatedAt: now,
    data: { ...thread, channelAiPaused: true, activeSendIntentId: id, revision: thread.revision + 1 } });
  const message: InboxMessage = { id, threadId, direction: 'outbound', phone: thread.phone, text: text.trim(), type: 'text', receivedAt: now, state: 'sending', requestId, requestedBy: user.id };
  // Claim the request and fence the exact thread and connector authority before egress.
  const connectionRow = await row(user.organizationId, 'integration:vault', connection.id);
  if (!connectionRow || parse<{ revision: number }>(connectionRow).revision !== connection.revision) throw new HttpError(409, 'WhatsApp connection changed. Refresh and retry.');
  try { await (await db()).batch([
    memberFence,
    ...await channelHandoffStatements(user.organizationId, threadId),
    ...(customerGuard ? [customerGuard] : []),
    { sql: 'UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=? AND data=?', params: [claimedThreadRaw, threadId, user.organizationId, threadKind, selected.data], expectedChanges: 1 },
    fence(user, connectionRow, 'integration:vault'),
    ...customerAnchors.map(anchor => fence(user, anchor, anchor.id === thread.customerId ? 'contact' : 'platform:customer_profile')),
    { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [id, user.organizationId, intentKind, 'sending', JSON.stringify({ revision: 1, updatedAt: now, data: message }), now] },
    { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, id, 'whatsapp_reply.sending', now] },
  ]); }
  catch (error) {
    const duplicate = await row(user.organizationId, intentKind, id);
    if (duplicate) {
      const saved = parse<InboxMessage>(await staleIntent(user.organizationId, duplicate)).data;
      if (saved.threadId !== threadId || saved.text !== text.trim()) throw new HttpError(409, 'Request ID already belongs to another reply.');
      return saved;
    }
    if (error instanceof WriteConflictError) throw new HttpError(409, 'Thread or connection changed before sending. Refresh and retry.');
    throw error;
  }
  let outcome: SendResult;
  const freshConnection = await row(user.organizationId, 'integration:vault', connection.id);
  const freshThread = await row(user.organizationId, threadKind, threadId);
  const freshMember = await row(user.organizationId, 'team:member', memberAnchor.id);
  const freshCustomers = await Promise.all(customerAnchors.map(anchor => row(user.organizationId, anchor.id === thread.customerId ? 'contact' : 'platform:customer_profile', anchor.id)));
  const freshProfileId = thread.customerId
    ? (await listRecords<{ contactId: string }>(user.organizationId, 'customer_profile')).find(item => item.data.contactId === thread.customerId && item.status === 'active')?.id
    : undefined;
  const authorityChanged = freshConnection?.data !== connectionRow.data || freshConnection?.status !== connectionRow.status || freshThread?.data !== claimedThreadRaw ||
    freshMember?.data !== memberAnchor.data || freshMember?.status !== 'active' || freshProfileId !== effectiveProfileId ||
    freshCustomers.some((item, index) => item?.data !== customerAnchors[index].data || item?.status !== customerAnchors[index].status);
  let dispatchAuthorized = !authorityChanged && Date.now() < Date.parse(thread.lastInboundAt) + 24 * 60 * 60_000;
  let reservedMessage: InboxMessage = message;
  if (dispatchAuthorized) {
    const pending = await row(user.organizationId, intentKind, id);
    const authorizedAt = new Date().toISOString();
    reservedMessage = { ...message, dispatchAuthorizedAt: authorizedAt };
    const serialized = pending ? parse<InboxMessage>(pending) : undefined;
    if (!pending || pending.status !== 'sending' || serialized?.data.requestId !== requestId) dispatchAuthorized = false;
    else {
      // This is the final await before the provider callback. Every captured
      // authority is compared under one database transaction and the intent is
      // marked as dispatch-authorized only if the reservation commits.
      try { await (await db()).batch([
        memberFence,
        fence(user, connectionRow, 'integration:vault'),
        { sql: 'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND data=?', params: [threadId, user.organizationId, threadKind, claimedThreadRaw], expectedChanges: 1 },
        ...(customerGuard ? [{ sql: 'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?',
          params: [String(customerGuard.params?.[1]), user.organizationId, 'internal:contact_import_catalog', 'active', String(customerGuard.params?.[0])], expectedChanges: 1 }] : []),
        ...customerAnchors.map(anchor => fence(user, anchor, anchor.id === thread.customerId ? 'contact' : 'platform:customer_profile')),
        { sql: 'UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?',
          params: [JSON.stringify({ revision: serialized!.revision + 1, updatedAt: authorizedAt, data: reservedMessage }), id, user.organizationId, intentKind, 'sending', pending.data], expectedChanges: 1 },
        { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)',
          params: [randomUUID(), user.organizationId, user.id, id, 'whatsapp_reply.dispatch_authorized', authorizedAt] },
      ]); }
      catch { dispatchAuthorized = false; }
    }
  }
  try { outcome = !dispatchAuthorized || Date.now() >= Date.parse(thread.lastInboundAt) + 24 * 60 * 60_000
    ? { state: 'rejected', reason: 'Thread, customer permission, connection, operator access, or reply window changed before dispatch.' }
    : await dispatch({ token: credentials.token, phoneNumberId: credentials.phoneNumberId!, phone: thread.phone, text: message.text }); }
  catch { outcome = { state: 'uncertain', reason: 'The send call ended without a definitive response.' }; }
  const completed = await row(user.organizationId, intentKind, id);
  if (!completed) throw new HttpError(503, 'Reply outcome could not be saved. Treat this send as uncertain.');
  const state = outcome.state;
  const finished: InboxMessage = { ...(dispatchAuthorized ? reservedMessage : message), state, ...(outcome.state === 'accepted' ? { providerId: outcome.providerId } : { reason: outcome.reason }) };
  const updated = new Date().toISOString();
  try { await (await db()).batch([{ sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND data=?', params: [JSON.stringify({ revision: parse<InboxMessage>(completed).revision + 1, updatedAt: updated, data: finished }), state, id, user.organizationId, intentKind, completed.data], expectedChanges: 1 },
    { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, id, `whatsapp_reply.${state}`, updated] }]); }
  catch { throw new HttpError(503, 'Reply outcome could not be saved. Treat this send as uncertain; do not resend.'); }
  if (outcome.state !== 'uncertain') await releaseThreadSend(user, threadId, id);
  if (outcome.state === 'accepted') await applyStatuses(user.organizationId, outcome.providerId);
  return finished;
}
export function parseInboxAction(body: Record<string, unknown>) {
  const action = field(body, 'action', 40);
  if (action === 'reply') return { action, threadId: field(body, 'threadId', 100), requestId: field(body, 'requestId', 100), text: field(body, 'text', 4096) } as const;
  if (action === 'link') return { action, threadId: field(body, 'threadId', 100), customerId: field(body, 'customerId', 100) } as const;
  if (action === 'handoff') {
    const handoff = field(body, 'handoff', 10);
    if (handoff !== 'open' && handoff !== 'resolved') throw new HttpError(400, 'Choose open or resolved.');
    return { action, threadId: field(body, 'threadId', 100), handoff } as const;
  }
  throw new HttpError(400, 'Unknown inbox action.');
}
