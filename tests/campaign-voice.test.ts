import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { authenticate, type AuthUser } from '../lib/server/auth';
import { HttpError } from '../lib/server/http';
import { createContact, createSession } from '../lib/server/store';
import { createRecord, updateRecord } from '../lib/platform/records';
import { parseAgentConfig } from '../lib/platform/agents';
import { compileAgentContext, compileCampaignVoiceContext } from '../lib/voice/context';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const owner: AuthUser = { id: 'campaign-voice-owner', email: 'campaign-voice@example.test', organizationId: 'campaign-voice-org' };
const outsider: AuthUser = { id: 'campaign-voice-outsider', email: 'outsider@example.test', organizationId: 'campaign-voice-other' };
const bad = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
const quote = 'Consultations are available on weekdays.';

test('campaign voice uses the exact approved brief and current recipient authority', async () => {
  const database = await (await import('../lib/server/db')).db();
  const now = new Date().toISOString();
  for (const user of [owner, outsider]) {
    await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [user.organizationId, user.id, now]);
    await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [user.id, user.email, 'x', user.organizationId, now]);
  }
  const contact = await createContact(owner, { name: 'Aanya Rao', email: 'aanya@example.test' });
  const otherContact = await createContact(owner, { name: 'Other Customer' });
  const profile = await createRecord(owner, 'customer_profile', { contactId: contact.id, name: contact.name, consent: { browser_voice: { granted: true } } }, 'active');
  const source = await createRecord(owner, 'brain_source', { title: 'Hours', content: quote, sourceLabel: 'Approved handbook', approvedAt: now, approvedBy: owner.id }, 'approved');
  const anchor = { id: source.id, revision: source.revision, title: 'Hours', digest: createHash('sha256').update(JSON.stringify({ title: source.data.title, content: source.data.content, sourceLabel: source.data.sourceLabel, approvedAt: source.data.approvedAt, revision: source.revision, status: source.status })).digest('hex') };
  const config = parseAgentConfig({ name: 'Maya', role: 'Sales assistant', objective: 'Help the customer decide whether a consultation is useful.', disclosure: 'I am the company AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Warm and concise', memoryScope: 'none', escalation: 'Offer a human colleague when requested.', knowledgeIds: [] });
  const version = await createRecord(owner, 'agent_version', { agentId: 'agent-one', config, knowledgeDigests: {} }, 'published');
  const release = await createRecord(owner, 'release', { agentId: 'agent-one', versionId: version.id, channel: 'browser' }, 'active');
  const campaign = await createRecord(owner, 'campaign', { name: 'Consultation', kind: 'sales', objective: 'Invite a useful discussion', channel: 'browser', agentReleaseId: release.id, subject: '', message: 'Hello {{firstName}}, would a consultation be useful?', contactIds: [contact.id], ownerId: owner.id }, 'launched');
  const callBrief = 'Introduce yourself as AI and ask if a consultation would help.';
  const citation = { field: 'callBrief', sourceId: source.id, start: 0, end: quote.length, quote };
  const draft = { name: 'Consultation', objective: 'Invite a useful discussion', subject: '', message: 'Hello {{firstName}}, would a consultation be useful?', callBrief, successCriteria: 'Customer decides whether to continue.', journeySteps: ['Invite discussion'], missingInputs: [], citations: [citation] };
  const plan = await createRecord(owner, 'campaign_plan', { campaignId: campaign.id, sourceAnchors: [anchor], draft }, 'applied');
  const snapshot = { ...campaign.data, planId: plan.id, sourceAnchors: [anchor], callBrief, citations: draft.citations };
  const run = await createRecord(owner, 'campaign_run', { campaignId: campaign.id, campaignRevision: 1, snapshot, recipients: [{ contactId: contact.id, name: 'Aanya Rao', email: 'aanya@example.test', status: 'queued' }], launchedAt: now, launchedBy: owner.id }, 'active');
  const base = await compileAgentContext(owner, config, [], contact.id);
  const ids = { campaignRunId: run.id, contactId: contact.id, releaseId: release.id };
  const context = await compileCampaignVoiceContext(owner, ids, base);
  const parsed = JSON.parse(context.instructions);
  assert.equal(parsed.campaignReference.callBrief, callBrief);
  assert.match(parsed.campaignReference.personalizedMessage, /Hello Aanya/);
  assert.deepEqual(parsed.campaignReference.citedSources[0].excerpts, [quote]);
  assert.deepEqual(context.knowledgeSources, [{ id: source.id, title: 'Hours' }], 'Reviewed campaign sources are available to the same call’s bounded knowledge tool.');
  assert.equal(context.campaignRunId, run.id);
  assert.match(context.contextDigest, /^[a-f0-9]{64}$/);
  await assert.rejects(compileCampaignVoiceContext(outsider, ids, base), bad(404));
  await assert.rejects(compileCampaignVoiceContext(owner, { ...ids, contactId: otherContact.id }, base), bad(409));
  await assert.rejects(compileCampaignVoiceContext(owner, { ...ids, releaseId: 'wrong-release' }, base), bad(409));
  const paused = await updateRecord(owner, run, run.data, 'paused');
  await assert.rejects(compileCampaignVoiceContext(owner, ids, base), bad(409));
  await updateRecord(owner, paused, paused.data, 'active');
  const withdrawn = await updateRecord(owner, profile, { ...profile.data, consent: { browser_voice: { granted: false } } }, 'active');
  await assert.rejects(compileCampaignVoiceContext(owner, ids, base), bad(409));
  await updateRecord(owner, withdrawn, profile.data, 'active');

  const issued = await createRecord(owner, 'voice_connection', { agentId: 'agent-one', versionId: version.id, releaseId: release.id, contactId: contact.id, config, requestedBy: owner.id, provider: 'azure', inputMode: 'text', contextDigest: context.contextDigest, campaignRunId: run.id, campaignDigest: context.campaignDigest }, 'connection_issued');
  const body = { source: 'browser_voice', agentId: 'agent-one', agentVersionId: version.id, releaseId: release.id, contactId: contact.id, connectionId: issued.id, campaignRunId: 'forged-run', campaignDigest: 'forged-digest', transcript: [{ role: 'user', text: 'I might be interested.' }] };
  const session = await createSession(owner, body);
  assert.equal(session.campaignRunId, run.id);
  assert.equal(session.campaignDigest, context.campaignDigest);
  assert.equal(session.contextDigest, context.contextDigest);
  await assert.rejects(createSession(outsider, body), bad(404));
  await assert.rejects(createSession(owner, { ...body, contactId: otherContact.id }), bad(400));
  await updateRecord(owner, source, source.data, 'revoked');
  await assert.rejects(compileCampaignVoiceContext(owner, ids, base), bad(409));
});

test('a draft connect request cannot claim campaign execution', async () => {
  const origin = 'http://localhost:3000';
  const login = await authenticate({ mode: 'register', email: 'campaign-preview@example.test', password: 'correct password', organization: 'Preview Organization' }, new Request(`${origin}/api/auth`, { headers: { origin } }));
  const { POST } = await import('../app/api/voice/connect/route');
  const response = await POST(new Request(`${origin}/api/voice/connect`, { method: 'POST', headers: { origin, cookie: login.cookie.split(';')[0], 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'preview', campaignRunId: 'attempted-run', consent: true, draft: {} }) }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Draft previews cannot be attached/);
});
