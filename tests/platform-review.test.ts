import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import { createContact } from '../lib/server/store';
import { createRecord, listRecords, type PlatformRecord } from '../lib/platform/records';
import { handleCustomerAction } from '../lib/platform/customer-ops';
import { handleCampaignAction, campaignPreflight } from '../lib/platform/campaigns';
import { HttpError } from '../lib/server/http';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;

test('real customer consent and corrections feed campaign launch; concurrent launch is atomic; evidence binds version and customer', async () => {
  const database = await db(), now = new Date().toISOString();
  const user = { id: randomUUID(), email: 'review@example.test', organizationId: randomUUID() };
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [user.organizationId, 'Review', now]);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [user.id, user.email, 'x', user.organizationId, now]);
  const contact = await createContact(user, { name: 'Old name', email: 'old@example.test' });
  const consent = await handleCustomerAction(user, 'customer.consent', { contactId: contact.id, channel: 'browser_voice', granted: true, evidence: 'Operator recorded customer permission' }) as PlatformRecord;
  await handleCustomerAction(user, 'customer.update', { contactId: contact.id, revision: consent.revision, name: 'Correct name', email: 'correct@example.test', stage: 'New' });
  const release = await createRecord(user, 'release', { versionId: 'expected-version' }, 'active');
  const campaign = await handleCampaignAction(user, 'campaign.create', { name: 'Review', kind: 'feedback', objective: 'Understand service feedback', channel: 'browser', agentReleaseId: release.id, message: 'Hello {{name}}', contactIds: [contact.id] }) as PlatformRecord;
  const check = await campaignPreflight(user, campaign as never);
  assert.equal(check.ready, true);
  assert.equal(check.previews[0].message, 'Hello Correct name');
  assert.equal(check.audience[0].email, 'correct@example.test');
  const launches = await Promise.allSettled([handleCampaignAction(user, 'campaign.launch', { id: campaign.id }), handleCampaignAction(user, 'campaign.launch', { id: campaign.id })]);
  assert.equal(launches.filter(r => r.status === 'fulfilled').length, 1);
  const runs = await listRecords(user.organizationId, 'campaign_run');
  assert.equal(runs.length, 1);
  const sessionId = randomUUID();
  const session = { contactId: contact.id, source: 'browser_voice', releaseId: release.id, agentVersionId: 'wrong-version', campaignRunId: runs[0].id };
  await database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [sessionId, user.organizationId, 'session', null, JSON.stringify(session), now]);
  const result = { runId: runs[0].id, contactId: contact.id, outcome: 'completed', evidence: 'Operator reviewed transcript', sessionId };
  await assert.rejects(handleCampaignAction(user, 'campaign.result', result), (error: unknown) => error instanceof HttpError && error.status === 409);
  await database.run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify({ ...session, agentVersionId: 'expected-version', contactId: 'wrong-contact' }), sessionId]);
  await assert.rejects(handleCampaignAction(user, 'campaign.result', result), (error: unknown) => error instanceof HttpError && error.status === 409);
  await database.run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify({ ...session, agentVersionId: 'expected-version', campaignRunId: 'other-run' }), sessionId]);
  await assert.rejects(handleCampaignAction(user, 'campaign.result', result), (error: unknown) => error instanceof HttpError && error.status === 409);
  await database.run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify({ ...session, agentVersionId: 'expected-version' }), sessionId]);
  assert.equal((await handleCampaignAction(user, 'campaign.result', result) as PlatformRecord).status, 'completed');
  const next = await handleCampaignAction(user, 'campaign.create', { name: 'Revocation race', kind: 'feedback', objective: 'Understand service feedback', channel: 'browser', agentReleaseId: release.id, message: 'Hello {{name}}', contactIds: [contact.id] }) as PlatformRecord;
  const originalBatch = database.batch.bind(database);
  database.batch = async (statements) => {
    if (statements.some(item => item.params?.includes('platform:campaign_run'))) {
      const [profile] = await database.all('SELECT id, data FROM entities WHERE organization_id = ? AND kind = ?', [user.organizationId, 'platform:customer_profile']);
      const stored = JSON.parse(String(profile.data));
      stored.data.consent.browser_voice.granted = false;
      stored.revision++;
      await database.run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify(stored), String(profile.id)]);
    }
    return originalBatch(statements);
  };
  try {
    await assert.rejects(handleCampaignAction(user, 'campaign.launch', { id: next.id }), (error: unknown) => error instanceof HttpError && error.status === 409);
    assert.equal((await listRecords(user.organizationId, 'campaign_run')).length, 1);
  } finally { database.batch = originalBatch; }
});
