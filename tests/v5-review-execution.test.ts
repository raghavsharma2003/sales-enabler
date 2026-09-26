import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { configureConnection, updateConnection } from '../lib/integrations/vault';
import { inboxOverview, inboxThread, linkInboxCustomer, saveInbound, saveStatus, sendInboxReply } from '../lib/messaging/service';
import { createContact } from '../lib/server/store';
import { ownerRegistrationStatements } from '../lib/team/service';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
process.env.CONNECTOR_ENCRYPTION_KEY = '6c'.repeat(32);

async function fixture() {
  const user: AuthUser = { id: randomUUID(), organizationId: randomUUID(), email: `${randomUUID()}@example.test`, role: 'owner' };
  const database = await db(), now = new Date().toISOString();
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Review fixture', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'unused', user.organizationId, now] },
    ...ownerRegistrationStatements(user),
  ]);
  const connection = await configureConnection(user, 'whatsapp_cloud', { token: 'offline-test-token', phoneNumberId: '123456789012345', appSecret: 'ab'.repeat(32), verifyToken: 'review-verification-token-with-entropy' });
  await updateConnection(user, 'whatsapp_cloud', { status: 'connected' });
  await saveInbound(user.organizationId, connection.id, '123456789012345', { id: `wamid.${randomUUID()}`, from: '919999000001', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Fictional customer request' } });
  const threadId = (await inboxOverview(user)).threads[0].id;
  return { user, threadId, database, connection };
}

test('review: membership removed after claim must prevent WhatsApp provider egress', async () => {
  const { user, threadId, database } = await fixture();
  const original = database.batch.bind(database);
  let calls = 0, changed = false;
  database.batch = async statements => {
    await original(statements);
    if (!changed && statements.some(statement => statement.params?.includes('messaging:whatsapp_intent') && statement.sql.startsWith('INSERT'))) {
      changed = true;
      await database.run('UPDATE entities SET status=? WHERE id=?', ['removed', `team:member:${user.id}`]);
    }
  };
  try {
    await sendInboxReply(user, { threadId, requestId: randomUUID(), text: 'Must not send after removal' }, async () => { calls++; return { state: 'accepted', providerId: 'wamid.removed-actor' }; }).catch(() => {});
    assert.equal(changed, true);
    assert.equal(calls, 0, 'A removed member reached provider dispatch');
  } finally { database.batch = original; }
});

test('review: duplicate delivery status must retry interrupted reconciliation', async () => {
  const { user, threadId, database, connection } = await fixture();
  const providerId = `wamid.${randomUUID()}`;
  const sent = await sendInboxReply(user, { threadId, requestId: randomUUID(), text: 'Offline status recovery' }, async () => ({ state: 'accepted', providerId }));
  const status = { id: providerId, status: 'delivered', timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '919999000001' };
  const original = database.batch.bind(database);
  let interrupted = false;
  database.batch = async statements => {
    if (!interrupted && statements.some(statement => statement.sql.startsWith('UPDATE') && statement.params?.includes('messaging:whatsapp_intent') && statement.params?.[1] === 'delivered')) {
      interrupted = true;
      throw new Error('Offline interruption after durable provider status insert');
    }
    return original(statements);
  };
  try { await saveStatus(user.organizationId, connection.id, status).catch(() => {}); }
  finally { database.batch = original; }
  assert.equal(interrupted, true);
  await saveStatus(user.organizationId, connection.id, status);
  assert.equal((await inboxThread(user, threadId)).messages.find(item => item.id === sent.id)?.state, 'delivered', 'Durable status stays unapplied when Meta retries the same event');
});

test('review: concurrent WhatsApp replies cannot bypass the unresolved-intent lane', async () => {
  const { user, threadId } = await fixture();
  let calls = 0;
  const dispatch = async () => { calls++; return { state: 'uncertain' as const, reason: 'Offline timeout fixture' }; };
  await Promise.allSettled([
    sendInboxReply(user, { threadId, requestId: randomUUID(), text: 'First request' }, dispatch),
    sendInboxReply(user, { threadId, requestId: randomUUID(), text: 'Second request' }, dispatch),
  ]);
  assert.equal(calls, 1, 'Both concurrent replies passed the unresolved-intent guard');
});

test('review: contact withdrawal between validation and anchor capture must block WhatsApp egress', async () => {
  const { user, threadId, database } = await fixture();
  const contact = await createContact(user, { name: 'Fictional withdrawal fixture', phone: '+919999000001' });
  await linkInboxCustomer(user, threadId, contact.id);
  const original = database.all.bind(database);
  let changed = false, calls = 0;
  database.all = async (sql, params) => {
    if (!changed && sql.startsWith('SELECT id,data,status,created_at FROM entities WHERE id=') && params?.[0] === contact.id) {
      changed = true;
      const [row] = await original('SELECT data FROM entities WHERE id=?', [contact.id]);
      await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(row.data)), optOut: true }), contact.id]);
    }
    return original(sql, params) as any;
  };
  try {
    await sendInboxReply(user, { threadId, requestId: randomUUID(), text: 'Must not send after opt out' }, async () => { calls++; return { state: 'accepted', providerId: 'wamid.withdrawn' }; }).catch(() => {});
    assert.equal(changed, true);
    assert.equal(calls, 0, 'Withdrawn contact permission became the newly accepted fence');
  } finally { database.all = original; }
});

test('review: removal during final WhatsApp customer reads must lose the atomic egress fence', async () => {
  const { user, threadId, database } = await fixture();
  const contact = await createContact(user, { name: 'Fictional final-read fixture', phone: '+919999000001' });
  await linkInboxCustomer(user, threadId, contact.id);
  const originalAll = database.all.bind(database), originalBatch = database.batch.bind(database);
  let claimed = false, changed = false, calls = 0;
  database.batch = async statements => {
    await originalBatch(statements);
    if (statements.some(statement => statement.sql.startsWith('INSERT') && statement.params?.includes('messaging:whatsapp_intent'))) claimed = true;
  };
  database.all = async (sql, params) => {
    if (claimed && !changed && sql.startsWith('SELECT id,data,status,created_at FROM entities WHERE id=') && params?.[0] === contact.id) {
      changed = true;
      await database.run('UPDATE entities SET status=? WHERE id=?', ['removed', `team:member:${user.id}`]);
    }
    return originalAll(sql, params) as any;
  };
  try {
    await sendInboxReply(user, { threadId, requestId: randomUUID(), text: 'Must not send after final-read removal' }, async () => { calls++; return { state: 'accepted', providerId: 'wamid.final-read-removal' }; }).catch(() => {});
    assert.equal(changed, true);
    assert.equal(calls, 0, 'Membership was removed after its fresh read and before final customer reads completed');
  } finally { database.all = originalAll; database.batch = originalBatch; }
});
