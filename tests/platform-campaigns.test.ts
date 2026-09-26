import test from 'node:test';
import assert from 'node:assert/strict';
import type { AuthUser } from '../lib/server/auth';
import { createContact } from '../lib/server/store';
import { createRecord, getRecord, listRecords } from '../lib/platform/records';
import { campaignPreflight, handleCampaignAction } from '../lib/platform/campaigns';
import { HttpError } from '../lib/server/http';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const user: AuthUser = { id: 'campaign-user', email: 'operator@example.test', organizationId: 'campaign-org' };
const other: AuthUser = { id: 'other-user', email: 'other@example.test', organizationId: 'other-org' };
const bad = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;

test('campaign preflight, immutable run snapshot and guarded operator outcomes', async () => {
  const { db } = await import('../lib/server/db');
  const database = await db();
  const now = new Date().toISOString();
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [user.organizationId, 'Campaign Org', now]);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [user.id, user.email, 'x', user.organizationId, now]);
  const contact = await createContact(user, { name: 'Aanya Rao', email: 'aanya@example.test' });
  const body = { name: 'Service follow-up', kind: 'feedback', objective: 'Understand service experience', channel: 'manual_email', agentReleaseId: '', subject: 'A quick question', message: 'Hello {{firstName}}, tell us how it went.', contactIds: [contact.id] };
  const campaign = await handleCampaignAction(user, 'campaign.create', body) as Awaited<ReturnType<typeof getRecord>>;
  let check = await campaignPreflight(user, campaign as never);
  assert.equal(check.ready, false);
  assert.match(check.audience[0].reasons.join(' '), /consent/i);
  await createRecord(user, 'customer_profile', { contactId: contact.id, consent: { email: { granted: true, evidence: 'Recorded by staff', recordedAt: now } } }, 'active');
  check = await campaignPreflight(user, campaign as never);
  assert.equal(check.ready, true);
  assert.match(check.previews[0].message, /Hello Aanya/);
  const run = await handleCampaignAction(user, 'campaign.launch', { id: campaign.id }) as Awaited<ReturnType<typeof getRecord>>;
  assert.equal(run.status, 'active');
  assert.equal((run.data as Record<string, unknown>).campaignId, campaign.id);
  await assert.rejects(handleCampaignAction(user, 'campaign.launch', { id: campaign.id }), bad(409));
  await assert.rejects(handleCampaignAction(other, 'campaign.pause', { runId: run.id }), bad(404));
  const paused = await handleCampaignAction(user, 'campaign.pause', { runId: run.id }) as Awaited<ReturnType<typeof getRecord>>;
  assert.equal(paused.status, 'paused');
  await assert.rejects(handleCampaignAction(user, 'campaign.result', { runId: run.id, contactId: contact.id, outcome: 'completed', evidence: 'Sent by operator' }), bad(409));
  await handleCampaignAction(user, 'campaign.resume', { runId: run.id });
  const done = await handleCampaignAction(user, 'campaign.result', { runId: run.id, contactId: contact.id, outcome: 'completed', evidence: 'Operator logged the email in the mail client' }) as Awaited<ReturnType<typeof getRecord>>;
  assert.equal(done.status, 'completed');
  await assert.rejects(handleCampaignAction(user, 'campaign.result', { runId: run.id, contactId: contact.id, outcome: 'skipped', evidence: 'contradiction' }), bad(409));
  assert.equal((await listRecords(user.organizationId, 'campaign_run')).length, 1);
});

test('browser completion requires an actual same-contact saved session', async () => {
  const { db } = await import('../lib/server/db');
  const database = await db();
  const now = new Date().toISOString();
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', ['browser-org', 'Browser Org', now]);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', ['browser-user', 'browser@example.test', 'x', 'browser-org', now]);
  const browserUser: AuthUser = { id: 'browser-user', email: 'browser@example.test', organizationId: 'browser-org' };
  const contact = await createContact(browserUser, { name: 'Rohan Shah', email: 'rohan@example.test' });
  await createRecord(browserUser, 'customer_profile', { contactId: contact.id, consent: { browser_voice: { granted: true, evidence: 'Customer agreed', recordedAt: now } } }, 'active');
  const release = await createRecord(browserUser, 'release', { agentId: 'agent-1', versionId: 'version-1', channel: 'browser' }, 'active');
  const draft = await handleCampaignAction(browserUser, 'campaign.create', { name: 'Consultation', kind: 'sales', objective: 'Discuss next steps', channel: 'browser', agentReleaseId: release.id, subject: '', message: 'Hello {{firstName}}', contactIds: [contact.id] }) as Awaited<ReturnType<typeof getRecord>>;
  const run = await handleCampaignAction(browserUser, 'campaign.launch', { id: draft.id }) as Awaited<ReturnType<typeof getRecord>>;
  await assert.rejects(handleCampaignAction(browserUser, 'campaign.result', { runId: run.id, contactId: contact.id, outcome: 'completed', evidence: 'Call completed' }), bad(400));
  await assert.rejects(handleCampaignAction(browserUser, 'campaign.result', { runId: run.id, contactId: contact.id, outcome: 'completed', evidence: 'Call completed', sessionId: 'nonexistent' }), bad(404));
});

