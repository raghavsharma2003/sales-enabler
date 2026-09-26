import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import type { AuthUser } from '../lib/server/auth';
import { ownerRegistrationStatements } from '../lib/team/service';
import { createRecord, listRecords, type PlatformRecord } from '../lib/platform/records';
import { createContact, createSession, insertEntity, listEntities, workspace } from '../lib/server/store';
import { createIngestionSource } from '../lib/ingestion/engine';
import { previewIntake, applyIntake } from '../lib/data-intake/service';
import { handleCustomerAction } from '../lib/platform/customer-ops';
import { saveInbound, inboxOverview, linkInboxCustomer } from '../lib/messaging/service';
import { handleAgentAction } from '../lib/platform/agents';
import { createDeployment } from '../lib/deployments/engine';
import { changeDeploymentStatus } from '../lib/deployments/engine';
import { PUBLICATION_ACKNOWLEDGEMENT } from '../lib/deployments/contracts';
import { configureConnection, updateConnection } from '../lib/integrations/vault';
import { enqueueChannelIncoming, processChannelJob, setChannelHandoff } from '../lib/channel-agents/service';
import type { ChannelJob } from '../lib/channel-agents/contracts';
import { createCampaignIntent, handleBusinessContextAction } from '../lib/business/engine';
import type { Offering, ReviewColumn } from '../lib/business/contracts';
import type { Campaign, Run } from '../lib/platform/campaigns';
import { extractCampaignResult, reviewCampaignResult, listReviewedCampaignAnswers } from '../lib/campaign-results/service';
import { locateSource, supportedValue } from '../lib/campaign-results/validation';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
process.env.CONNECTOR_ENCRYPTION_KEY = '67'.repeat(32);
process.env.AZURE_OPENAI_ENDPOINT = 'https://fictional-review.openai.azure.com';
process.env.AZURE_OPENAI_API_KEY = 'fictional-never-sent';
process.env.APP_URL = 'https://company.example.test';

async function account() {
  const user: AuthUser = { id: randomUUID(), email: `${randomUUID()}@example.test`, organizationId: randomUUID() }, database = await db(), at = new Date().toISOString();
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Fictional review', at] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'unused', user.organizationId, at] },
    ...ownerRegistrationStatements(user),
  ]);
  return { user, database, at };
}
async function channelFixture(channel: 'telegram' | 'whatsapp' = 'telegram') {
  const f = await account();
  const integration = channel === 'telegram' ? 'telegram' : 'whatsapp_cloud';
  const connection = await configureConnection(f.user, integration, channel === 'telegram' ? { token: '123456789:fictional-never-sent', webhookSecret: 'fictional-review-secret-1234567890123456789' } : { token: 'fictional-token', phoneNumberId: '123456789012345', appSecret: 'abc'.repeat(20), verifyToken: 'fictional-review-secret-1234567890123456789' });
  await updateConnection(f.user, integration, { status: 'connected', ...(channel === 'telegram' ? { settings: { botId: '123456789', username: 'fictional_review_bot' } } : {}) });
  const source = await createRecord(f.user, 'brain_source', { title: 'Hours', content: 'Hours are 9 to 5.', sourceLabel: 'Public', approvedAt: f.at }, 'approved');
  const agent = await handleAgentAction(f.user, 'agent.create', { name: 'Support', role: 'Company support', objective: 'Answer company questions.', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief', memoryScope: 'approved_contact', escalation: 'Offer a human handoff if unsure.', knowledgeIds: [source.id], enabledTools: [] }) as PlatformRecord;
  const version = await handleAgentAction(f.user, 'agent.version', { agentId: agent.id, revision: agent.revision }) as PlatformRecord;
  const checked = await handleAgentAction(f.user, 'test.run', { versionId: version.id }) as PlatformRecord;
  const release = await handleAgentAction(f.user, 'release.publish', { versionId: version.id, testRunId: checked.id, currentReleaseId: null }) as PlatformRecord;
  const draft = await createDeployment(f.user, { name: 'Review bot', agentId: agent.id, versionId: version.id, releaseId: release.id, channel, publicKnowledgeIds: [source.id], brand: { name: 'Fictional', welcomeMessage: 'Ask us.' }, limits: { enabled: true }, allowUnknownInbound: true });
  const published = await changeDeploymentStatus(f.user, { deploymentId: draft.id, revision: draft.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  const incoming = { org: f.user.organizationId, channel, connectionId: connection.id, participant: channel === 'telegram' ? '1234567' : '919999000001', providerEventId: '1', text: 'Hours?', providerAt: new Date().toISOString() };
  if (channel === 'telegram') await enqueueChannelIncoming(incoming);
  else await saveInbound(f.user.organizationId, connection.id, '123456789012345', { id: 'wamid.review', from: incoming.participant, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: incoming.text } });
  const [row] = await f.database.all('SELECT data FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'channel:job']);
  return { ...f, connection, published, incoming, job: JSON.parse(String(row.data)) as ChannelJob };
}
const generated = { text: 'Hours are 9 to 5.', runId: 'fictional-review', model: 'fake', cached: false, usage: { inputTokens: 1, outputTokens: 1 } };

for (const revoke of ['handoff', 'member', 'stop'] as const) test(`review: completed ${revoke} before sending reservation prevents Telegram egress`, async () => {
  const f = await channelFixture(), original = f.database.batch.bind(f.database);
  let intercepted = false, sends = 0;
  f.database.batch = async statements => {
    if (!intercepted && statements.some(s => s.sql.startsWith('UPDATE entities SET data=?,status=?') && s.params?.[1] === 'sending' && s.params?.includes(f.job.id))) {
      intercepted = true;
      if (revoke === 'handoff') await setChannelHandoff(f.user, f.job.threadId, 'human');
      if (revoke === 'member') await f.database.run('UPDATE entities SET status=? WHERE id=?', ['revoked', `team:member:${f.user.id}`]);
      if (revoke === 'stop') await enqueueChannelIncoming({ ...f.incoming, providerEventId: '2', text: '/stop' });
    }
    await original(statements);
  };
  try {
    await processChannelJob(f.user.organizationId, f.job.id, { generate: async () => generated, dispatch: async () => { sends++; return { state: 'accepted', providerId: 'fake' }; } });
    assert.equal(intercepted, true);
    assert.equal(sends, 0, 'A completed authority revocation preceded the final send reservation');
  } finally { f.database.batch = original; }
});

test('review: WhatsApp consent revoked before sending reservation defeats AI egress', async () => {
  const f = await channelFixture('whatsapp');
  const contact = await createContact(f.user, { name: 'Fictional participant', phone: '+919999000001' });
  const thread = (await inboxOverview(f.user)).threads[0];
  await linkInboxCustomer(f.user, thread.id, contact.id);
  const original = f.database.batch.bind(f.database); let intercepted = false, sends = 0;
  f.database.batch = async statements => {
    if (!intercepted && statements.some(s => s.sql.startsWith('UPDATE entities SET data=?,status=?') && s.params?.[1] === 'sending' && s.params?.includes(f.job.id))) {
      intercepted = true;
      await handleCustomerAction(f.user, 'customer.consent', { contactId: contact.id, channel: 'whatsapp', granted: false, evidence: 'Fictional participant revoked consent.' });
    }
    return original(statements);
  };
  try {
    await processChannelJob(f.user.organizationId, f.job.id, { generate: async () => generated, dispatch: async () => { sends++; return { state: 'accepted', providerId: 'fake' }; } });
    assert.equal(intercepted, true); assert.equal(sends, 0);
  } finally { f.database.batch = original; }
});

test('review: a human request received while paused is retained after republishing', async () => {
  const f = await channelFixture();
  const paused = await changeDeploymentStatus(f.user, { deploymentId: f.published.id, revision: f.published.revision, action: 'pause' });
  await enqueueChannelIncoming({ ...f.incoming, providerEventId: '2', text: '/human' });
  await changeDeploymentStatus(f.user, { deploymentId: paused.id, revision: paused.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  await enqueueChannelIncoming({ ...f.incoming, providerEventId: '3', text: 'Are you there?' });
  const rows = await f.database.all('SELECT data FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'channel:job']);
  const job = rows.map(row => JSON.parse(String(row.data)) as ChannelJob).find(item => item.providerEventId === '3')!;
  let sends = 0;
  await processChannelJob(f.user.organizationId, job.id, { generate: async () => generated, dispatch: async () => { sends++; return { state: 'accepted', providerId: 'fake' }; } });
  assert.equal(sends, 0, 'The participant requested a human before the new inbound job');
});

async function resultFixture(column: ReviewColumn, text: string, value: string | number | boolean, quote = text, extraTurns: string[] = []) {
  const f = await account();
  const source = await createRecord(f.user, 'brain_source', { title: 'Workshops', content: 'We provide workshops.', sourceLabel: 'Reviewed', approvedBy: f.user.id, approvedAt: f.at }, 'approved');
  const draft = (await handleBusinessContextAction(f.user, { action: 'offering.create', name: 'Workshop', kind: 'service', summary: 'Workshops', audienceDescription: 'Teams', sourceRefs: [{ sourceId: source.id, quote: 'We provide workshops.' }], openQuestions: [] }) as { record: PlatformRecord<Offering> }).record;
  const offering = (await handleBusinessContextAction(f.user, { action: 'offering.approve', id: draft.id, revision: draft.revision }) as { record: PlatformRecord<Offering> }).record;
  const contact = await insertEntity(f.user, 'contact', { name: 'Fictional caller' });
  const intent = await createCampaignIntent(f.user, { schemaVersion: 1, offeringId: offering.id, signalIds: [], outcome: { label: 'Understand interest', evidenceRequired: ['Caller words'] }, audienceRationale: 'Operator selected', reviewColumns: [column] }, [contact.id]);
  const version = await createRecord(f.user, 'agent_version', { number: 1 }, 'published');
  const release = await createRecord(f.user, 'release', { versionId: version.id }, 'active');
  const campaign = await createRecord<Campaign>(f.user, 'campaign', { name: 'Feedback', kind: 'feedback', objective: 'Collect answers', channel: 'browser', agentReleaseId: release.id, subject: '', message: 'Your views?', contactIds: [contact.id], ownerId: f.user.id, explicitIntentV1: intent }, 'active');
  const run = await createRecord<Run>(f.user, 'campaign_run', { campaignId: campaign.id, campaignRevision: campaign.revision, snapshot: campaign.data, recipients: [{ contactId: contact.id, name: 'Fictional caller', email: '', status: 'queued' }], launchedAt: f.at, launchedBy: f.user.id }, 'active');
  const session = await insertEntity(f.user, 'session', { source: 'browser_voice', campaignRunId: run.id, releaseId: release.id, agentVersionId: version.id, contactId: contact.id, transcript: [text, ...extraTurns].map(text => ({ role: 'user', text })) });
  const result = await extractCampaignResult(f.user, session.id, async () => ({ ...generated, text: JSON.stringify({ answers: [{ key: column.key, state: 'proposed', value, quote, turnIndex: 0 }] }) }));
  return { ...f, result, offering };
}

test('review: unrelated negation cannot turn stated interest into an accepted false answer', async () => {
  const text = 'I am interested, but not ready.', column: ReviewColumn = { key: 'interested', label: 'Interested', type: 'boolean' };
  const f = await resultFixture(column, text, false);
  await assert.rejects(reviewCampaignResult(f.user, f.result.id, f.result.revision, [{ key: column.key, status: 'accepted', value: false, quote: text, turnIndex: 0 }]));
  assert.equal((await listReviewedCampaignAnswers(f.user, f.offering.id)).length, 0);
});

test('review: caller age cannot be accepted as a budget solely because the number occurs in a quote', async () => {
  const text = 'I am 35 years old.', column: ReviewColumn = { key: 'budget', label: 'Budget', type: 'number' };
  const f = await resultFixture(column, text, 35);
  await assert.rejects(reviewCampaignResult(f.user, f.result.id, f.result.revision, [{ key: column.key, status: 'accepted', value: 35, quote: text, turnIndex: 0 }]));
  assert.equal((await listReviewedCampaignAnswers(f.user, f.offering.id)).length, 0);
});

test('review: clipping trailing uncertainty cannot create a definite numeric answer', () => {
  const text = 'My budget is 2500, maybe.', column: ReviewColumn = { key: 'budget', label: 'Budget', type: 'number' };
  let accepted = false;
  try { accepted = supportedValue(column, 2500, locateSource([{ role: 'user', text }], 'My budget is 2500', 0)); } catch { /* rejection is expected */ }
  assert.equal(accepted, false);
});

test('review: another person’s budget cannot become the caller’s accepted budget', async () => {
  const text = "My friend's budget is 2500.", column: ReviewColumn = { key: 'budget', label: 'Budget', type: 'number' };
  const f = await resultFixture(column, text, 2500);
  await assert.rejects(reviewCampaignResult(f.user, f.result.id, f.result.revision, [{ key: column.key, status: 'accepted', value: 2500, quote: text, turnIndex: 0 }]));
});

test('review: omitted contrary scalar turn prevents accepting the model’s first answer', async () => {
  const text = 'My budget is 2500.', column: ReviewColumn = { key: 'budget', label: 'Budget', type: 'number' };
  const f = await resultFixture(column, text, 2500, text, ['My budget is 1000.']);
  await assert.rejects(reviewCampaignResult(f.user, f.result.id, f.result.revision, [{ key: column.key, status: 'accepted', value: 2500, quote: text, turnIndex: 0 }]));
});

test('review: clients cannot forge server-captured public or channel conversation sources', async () => {
  const f = await account();
  for (const source of ['channel_chat', 'public_chat', 'public_voice']) await assert.rejects(createSession(f.user, { source, serverCaptured: true, transcript: [{ role: 'user', text: 'Fictional data' }] }), /Unsupported session source/);
});

test('review: account recovery namespace never appears in workspace or platform projections', async () => {
  const f = await account();
  for (const kind of ['auth:mail', 'auth:token', 'auth:account']) await f.database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [randomUUID(), f.user.organizationId, kind, 'pending', JSON.stringify({ privateSentinel: 'FICTIONAL_AUTH_NAMESPACE_SENTINEL' }), f.at]);
  assert.doesNotMatch(JSON.stringify(await workspace(f.user)), /FICTIONAL_AUTH_NAMESPACE_SENTINEL/);
  assert.doesNotMatch(JSON.stringify(await listRecords(f.user.organizationId)), /FICTIONAL_AUTH_NAMESPACE_SENTINEL/);
});

test('review: effective customer identity changed during table commit rolls back all new rows', async () => {
  const f = await account();
  const contact = await createContact(f.user, { name: 'Existing person', email: 'before@example.test' });
  const source = await createIngestionSource(f.user, { title: 'Fictional table', kind: 'paste', format: 'csv', text: 'Name,Email\nNew person,after@example.test' });
  const preview = await previewIntake(f.user, { sourceId: source.id, mapping: [{ column: 0, target: 'name' }, { column: 1, target: 'email' }] });
  const original = f.database.batch.bind(f.database); let intercepted = false;
  f.database.batch = async statements => {
    if (!intercepted && statements.some(statement => statement.params?.includes('customer.table_intake.reviewed'))) {
      intercepted = true;
      await handleCustomerAction(f.user, 'customer.update', { contactId: contact.id, name: 'Existing person', email: 'after@example.test', stage: 'Active', notes: '' });
    }
    return original(statements);
  };
  try {
    await assert.rejects(applyIntake(f.user, { previewId: preview.id, previewHash: preview.hash, decisions: [{ rowNumber: 1, action: 'create' }] }), /changed/);
    assert.equal(intercepted, true);
    assert.equal((await listEntities(f.user.organizationId, 'contact')).length, 1);
    assert.equal((await listRecords(f.user.organizationId, 'data_intake_row')).length, 0);
  } finally { f.database.batch = original; }
});
