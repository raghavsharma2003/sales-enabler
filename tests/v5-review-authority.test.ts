import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { db } from '../lib/server/db';
import type { AuthUser } from '../lib/server/auth';
import { createAction, createContact, listEntities } from '../lib/server/store';
import { createRecord, listRecords } from '../lib/platform/records';
import { ownerRegistrationStatements } from '../lib/team/service';
import { executeVoiceTool } from '../lib/voice/tools/service';
import { inspectAction, reviewAction } from '../lib/platform/action-review';
import { configureConnection, updateConnection } from '../lib/integrations/vault';
import { handleCampaignAction } from '../lib/platform/campaigns';
import { sendCampaignEmail } from '../lib/delivery/engine';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
process.env.CONNECTOR_ENCRYPTION_KEY = '7d'.repeat(32);
async function account() {
  const user: AuthUser = { id: randomUUID(), organizationId: randomUUID(), email: `${randomUUID()}@example.test`, role: 'owner' };
  const database = await db(), now = new Date().toISOString();
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Authority review fixture', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'unused', user.organizationId, now] },
    ...ownerRegistrationStatements(user),
  ]);
  return { user, database };
}
async function demote(user: AuthUser) {
  const database = await db();
  const [row] = await database.all('SELECT data FROM entities WHERE id=?', [`team:member:${user.id}`]);
  await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(row.data)), role: 'viewer' }), `team:member:${user.id}`]);
}

test('review: demotion immediately before voice tool commit must prevent a follow-up proposal', async () => {
  const { user, database } = await account();
  const call = await createRecord(user, 'voice_preview', { requestedBy: user.id, contextDigest: 'fixture-context', toolAuthority: { version: 1, contextDigest: 'fixture-context', enabledTools: ['request_follow_up'], sources: [], memoryScope: 'none', expiresAt: new Date(Date.now() + 60000).toISOString() } }, 'connection_issued');
  const original = database.batch.bind(database);
  let changed = false;
  database.batch = async statements => {
    if (!changed && statements.some(statement => statement.sql.startsWith('INSERT') && statement.params?.includes('platform:voice_tool_invocation'))) { changed = true; await demote(user); }
    return original(statements);
  };
  try {
    await executeVoiceTool(user, { previewId: call.id, name: 'request_follow_up', requestId: 'demotion-race', arguments: { kind: 'follow_up', summary: 'Fictional review proposal' } }).catch(() => {});
    assert.equal(changed, true);
    assert.equal((await listEntities(user.organizationId, 'action')).length, 0, 'Viewer created a voice follow-up proposal after demotion');
  } finally { database.batch = original; }
});

test('review: demotion immediately before action review commit must prevent a commitment', async () => {
  const { user, database } = await account();
  const action = await createAction(user, { title: 'Fictional work', description: 'Review fixture' });
  const review = await inspectAction(user, action.id);
  const original = database.batch.bind(database);
  let changed = false;
  database.batch = async statements => {
    if (!changed && statements.some(statement => statement.sql.startsWith('INSERT') && statement.params?.includes('platform:commitment'))) { changed = true; await demote(user); }
    return original(statements);
  };
  try {
    await reviewAction(user, { actionId: action.id, reviewToken: review.reviewToken, decision: 'accept', title: 'Fictional commitment', dueDate: '2026-10-01' }).catch(() => {});
    assert.equal(changed, true);
    assert.equal((await listRecords(user.organizationId, 'commitment')).length, 0, 'Viewer created a commitment after demotion');
  } finally { database.batch = original; }
});

async function emailFixture() {
  const { user, database } = await account(), now = new Date().toISOString();
  const contact = await createContact(user, { name: 'Fictional email customer', email: `${randomUUID()}@example.test` });
  await createRecord(user, 'customer_profile', { contactId: contact.id, email: contact.email, consent: { email: { granted: true, evidence: 'Offline fixture', recordedAt: now } } }, 'active');
  const connection = await configureConnection(user, 'gmail', { token: 'offline-only-mail-token', sendPermission: 'https://www.googleapis.com/auth/gmail.send' });
  await updateConnection(user, 'gmail', { status: 'connected' });
  const campaign = await handleCampaignAction(user, 'campaign.create', { name: 'Offline review', kind: 'feedback', objective: 'Fictional review', channel: 'email', emailConnectionId: connection.id, agentReleaseId: '', subject: 'Fixture message', message: 'Hello {{firstName}}', contactIds: [contact.id] }) as { id: string };
  const run = await handleCampaignAction(user, 'campaign.launch', { id: campaign.id }) as { id: string };
  return { user, database, contact, input: { runId: run.id, contactId: contact.id, connectionId: connection.id, requestId: randomUUID() } };
}

test('review: manual email dispatch must recheck membership after intent claim', async () => {
  const { user, database, input } = await emailFixture();
  const original = database.batch.bind(database);
  let changed = false, calls = 0;
  database.batch = async statements => {
    await original(statements);
    if (!changed && statements.some(statement => statement.sql.startsWith('INSERT') && statement.params?.includes('delivery:email_intent'))) { changed = true; await demote(user); }
  };
  try {
    await sendCampaignEmail(user, input, async () => { calls++; return { state: 'accepted' }; }).catch(() => {});
    assert.equal(changed, true);
    assert.equal(calls, 0, 'Demoted viewer reached manual email egress');
  } finally { database.batch = original; }
});

test('review: contact opt-out between email validation and anchor capture must block egress', async () => {
  const { user, database, input, contact } = await emailFixture();
  const original = database.all.bind(database);
  let changed = false, calls = 0;
  database.all = async (sql, params) => {
    if (!changed && sql.startsWith('SELECT id,kind,status,data FROM entities WHERE id =') && params?.[0] === contact.id) {
      changed = true;
      const [row] = await original('SELECT data FROM entities WHERE id=?', [contact.id]);
      await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(row.data)), optOut: true }), contact.id]);
    }
    return original(sql, params) as any;
  };
  try {
    await sendCampaignEmail(user, input, async () => { calls++; return { state: 'accepted' }; }).catch(() => {});
    assert.equal(changed, true);
    assert.equal(calls, 0, 'Withdrawn contact permission became the accepted email fence');
  } finally { database.all = original; }
});
