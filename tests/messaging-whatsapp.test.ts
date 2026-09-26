import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { configureConnection, updateConnection } from '../lib/integrations/vault';
import { inboxOverview, inboxThread, linkInboxCustomer, saveInbound, saveStatus, sendInboxReply } from '../lib/messaging/service';
import { createContact } from '../lib/server/store';
import { createRecord } from '../lib/platform/records';
import { GET as verify, POST as webhook } from '../app/api/integrations/whatsapp/webhook/[connectionId]/route';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
process.env.CONNECTOR_ENCRYPTION_KEY = '5b'.repeat(32);
let serial = 0;
const secret = 'test-meta-app-secret-with-sufficient-entropy';
const token = 'a-test-webhook-verification-token';
async function fixture() {
  const n = ++serial;
  const user: AuthUser = { id: `wa-user-${n}`, email: `wa-${n}@example.test`, organizationId: `wa-tenant-${n}` };
  const database = await db(), now = new Date().toISOString();
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'WhatsApp test', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'x', user.organizationId, now] },
  ]);
  const connection = await configureConnection(user, 'whatsapp_cloud', { token: 'test-access-token', phoneNumberId: '123456789012345', appSecret: secret, verifyToken: token });
  await updateConnection(user, 'whatsapp_cloud', { status: 'connected' });
  return { user, connection };
}
const message = (id: string, timestamp = String(Math.floor(Date.now() / 1000))) => ({ id, from: '919999000001', timestamp, type: 'text', text: { body: 'Hello, can you help?' } });
const status = (code: number) => (error: unknown) => Boolean(error && typeof error === 'object' && 'status' in error && error.status === code);

test('Meta challenge, raw-body signature, phone binding and duplicate webhook delivery', async () => {
  const { user, connection } = await fixture();
  const params = { params: Promise.resolve({ connectionId: connection.id }) };
  const callback = `http://localhost/api/integrations/whatsapp/webhook/${connection.id}`;
  const challenge = await verify(new Request(`${callback}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=78245`), params);
  assert.equal(challenge.status, 200);
  assert.equal(await challenge.text(), '78245');
  assert.equal((await verify(new Request(`${callback}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=78245`), params)).status, 403);
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '123456789012345' }, messages: [message(`wamid.test.${serial}.one`)] } }] }] });
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const send = (payload: string, header = signature) => webhook(new Request(callback, { method: 'POST', body: payload, headers: { 'x-hub-signature-256': header } }), params);
  assert.equal((await send(body, 'sha256=' + '0'.repeat(64))).status, 401);
  const first = await send(body);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { accepted: 1, duplicates: 0 });
  assert.deepEqual(await (await send(body)).json(), { accepted: 0, duplicates: 1 });
  const overview = await inboxOverview(user);
  assert.equal(overview.threads.length, 1);
  assert.equal((await inboxThread(user, overview.threads[0].id)).messages[0].text, 'Hello, can you help?');
  const wrongPhone = body.replace('123456789012345', '123456789012346');
  const correctSignature = `sha256=${createHmac('sha256', secret).update(wrongPhone).digest('hex')}`;
  assert.deepEqual(await (await send(wrongPhone, correctSignature)).json(), { accepted: 0, duplicates: 0 });
});

test('operator reply is one durable intent, with status progression and no automatic resend', async () => {
  const { user, connection } = await fixture();
  await saveInbound(user.organizationId, connection.id, '123456789012345', message(`wamid.test.${serial}.in`));
  const threadId = (await inboxOverview(user)).threads[0].id;
  const input = { threadId, requestId: '11111111-1111-4111-8111-111111111111', text: 'Happy to help.' };
  let calls = 0;
  const providerId = `wamid.test.${serial}.out`;
  const dispatch = async () => { calls++; return { state: 'accepted' as const, providerId: calls === 1 ? providerId : `wamid.test.${serial}.out-two` }; };
  const accepted = await sendInboxReply(user, input, dispatch);
  assert.equal(accepted.state, 'accepted');
  assert.equal((await sendInboxReply(user, input, dispatch)).id, accepted.id);
  assert.equal(calls, 1);
  await saveStatus(user.organizationId, connection.id, { id: providerId, status: 'delivered', timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '919999000001' });
  await saveStatus(user.organizationId, connection.id, { id: providerId, status: 'read', timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '919999000001' });
  await saveStatus(user.organizationId, connection.id, { id: providerId, status: 'sent', timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '919999000001' });
  assert.equal((await inboxThread(user, threadId)).messages.find(item => item.id === accepted.id)?.state, 'read');
  const second = await sendInboxReply(user, { threadId, requestId: '88888888-8888-4888-8888-888888888888', text: 'Anything else?' }, dispatch);
  assert.equal(second.state, 'accepted');
  assert.equal(calls, 2);
});

test('expired window, tenant boundary, exact identity, and unresolved outcome block unsafe sends', async () => {
  const { user, connection } = await fixture();
  const other = await fixture();
  await saveInbound(user.organizationId, connection.id, '123456789012345', message(`wamid.test.${serial}.old`, String(Math.floor((Date.now() - 25 * 60 * 60_000) / 1000))));
  const oldThread = (await inboxOverview(user)).threads[0].id;
  let calls = 0;
  const dispatch = async () => { calls++; return { state: 'uncertain' as const, reason: 'timeout' }; };
  await assert.rejects(sendInboxReply(user, { threadId: oldThread, requestId: '22222222-2222-4222-8222-222222222222', text: 'Late reply' }, dispatch), status(409));
  await assert.rejects(inboxThread(other.user, oldThread), status(404));
  await saveInbound(user.organizationId, connection.id, '123456789012345', message(`wamid.test.${serial}.new`));
  const contact = await createContact(user, { name: 'Sample customer', email: `sample-${serial}@example.test` });
  await createRecord(user, 'customer_profile', { contactId: contact.id, name: 'Sample customer', phone: '+919999000002', consent: {} }, 'active');
  await assert.rejects(linkInboxCustomer(user, oldThread, contact.id), status(409));
  const input = { threadId: oldThread, requestId: '33333333-3333-4333-8333-333333333333', text: 'A human reply' };
  assert.equal((await sendInboxReply(user, input, dispatch)).state, 'uncertain');
  assert.equal((await sendInboxReply(user, input, dispatch)).state, 'uncertain');
  await assert.rejects(sendInboxReply(user, { ...input, requestId: '44444444-4444-4444-8444-444444444444' }, dispatch), status(409));
  assert.equal(calls, 1);
});

test('a new customer contact can be linked by exact phone; viewer and withdrawn permission cannot send', async () => {
  const { user, connection } = await fixture();
  await saveInbound(user.organizationId, connection.id, '123456789012345', message(`wamid.test.${serial}.link`));
  const threadId = (await inboxOverview(user)).threads[0].id;
  const contact = await createContact(user, { name: 'Phone review', email: `phone-${serial}@example.test`, phone: '+919999000001' });
  await linkInboxCustomer(user, threadId, contact.id);
  assert.equal((await inboxThread(user, threadId)).thread.customerId, contact.id);
  const input = { threadId, requestId: '55555555-5555-4555-8555-555555555555', text: 'A private reply' };
  await createRecord(user, 'customer_profile', { contactId: contact.id, name: 'Phone review', phone: '+919999000001', consent: { whatsapp: { granted: false, evidence: 'Withdrawn', recordedAt: new Date().toISOString() } } }, 'active');
  await assert.rejects(sendInboxReply(user, input, async () => { throw new Error('must not call provider'); }), status(409));
  const database = await db();
  const [membership] = await database.all('SELECT data FROM entities WHERE id=?', [`team:member:${user.id}`]);
  await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(membership.data)), role: 'viewer' }), `team:member:${user.id}`]);
  await assert.rejects(sendInboxReply({ ...user, role: 'owner' }, { ...input, requestId: '77777777-7777-4777-8777-777777777777' }, async () => { throw new Error('must not call provider'); }), status(403));
});

test('reconfiguring the business phone cannot reuse an old reply window', async () => {
  const { user, connection } = await fixture();
  await saveInbound(user.organizationId, connection.id, '123456789012345', message(`wamid.test.${serial}.old-number`));
  const oldThreadId = (await inboxOverview(user)).threads[0].id;
  await configureConnection(user, 'whatsapp_cloud', { token: 'second-test-access-token', phoneNumberId: '223456789012345', appSecret: secret, verifyToken: token });
  await updateConnection(user, 'whatsapp_cloud', { status: 'connected' });
  let calls = 0;
  await assert.rejects(sendInboxReply(user, { threadId: oldThreadId, requestId: '66666666-6666-4666-8666-666666666666', text: 'Wrong number' }, async () => { calls++; return { state: 'accepted', providerId: 'wamid.should-not-send' }; }), status(409));
  await saveInbound(user.organizationId, connection.id, '223456789012345', message(`wamid.test.${serial}.new-number`));
  const threads = (await inboxOverview(user)).threads;
  assert.equal(threads.length, 2);
  assert.notEqual(threads[0].id, threads[1].id);
  assert.equal(calls, 0);
});
