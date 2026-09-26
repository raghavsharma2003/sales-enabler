import test from 'node:test';
import assert from 'node:assert/strict';
import type { AuthUser } from '../lib/server/auth';
import { HttpError } from '../lib/server/http';
import { createContact } from '../lib/server/store';
import { createRecord, listRecords, updateRecord } from '../lib/platform/records';
import { campaignPreflight, handleCampaignAction } from '../lib/platform/campaigns';
import { applyCampaignPlan, generateCampaignPlan, validatePlanDraft, type SourceAnchor } from '../lib/campaign-planning/engine';
import type { runAiTask } from '../lib/ai/task-router';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const user: AuthUser = { id: 'planner-user', email: 'planner@example.test', organizationId: 'planner-org' };
const other: AuthUser = { id: 'planner-other', email: 'other@example.test', organizationId: 'planner-other-org' };
const bad = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
const quote = 'Consultations are available on weekdays.';
const cited = (field: string, sourceId: string) => ({ field, sourceId, start: 0, end: quote.length, quote });
const output = (sourceId: string) => ({ name: 'Consultation follow-up', objective: 'Invite a useful discussion', subject: 'A consultation question', message: 'Hello {{firstName}}, would a consultation be useful?', callBrief: 'Introduce yourself as AI and ask if a consultation would help.', successCriteria: 'Customer decides whether to continue.', journeySteps: ['Review permission and prepare', 'Invite the customer to discuss'], missingInputs: ['Confirm whether the customer wants a conversation.'], citations: ['name', 'objective', 'subject', 'message', 'callBrief', 'successCriteria', 'journeySteps.0', 'journeySteps.1'].map(field => cited(field, sourceId)) });
const fake = (sourceId: string) => (async () => ({ text: JSON.stringify(output(sourceId)), runId: 'fake-run', model: 'test-model', usage: { inputTokens: 100, outputTokens: 200 }, cached: false })) as typeof runAiTask;

test('campaign plan rejects fabricated quotes and unsupported placeholders', () => {
  const source: SourceAnchor = { id: 'source', revision: 1, digest: 'test', title: 'Source', content: quote };
  const invented = output(source.id);
  invented.citations[0].quote = 'Invented claim';
  assert.throws(() => validatePlanDraft(invented, [source], 'manual_email'), bad(502));
  const unknownVariable = output(source.id);
  unknownVariable.message = 'Hello {{secret}}';
  assert.throws(() => validatePlanDraft(unknownVariable, [source], 'manual_email'), bad(502));
});

test('server derives quote offsets and allows proposed strategy without invented citations', () => {
  const source: SourceAnchor = { id: 'source', revision: 1, digest: 'test', title: 'Source', content: `Context: ${quote}` };
  const proposal = output(source.id);
  proposal.citations = [{ field: 'message', sourceId: source.id, start: 0, end: 72, quote }];
  const normalized = validatePlanDraft(proposal, [source], 'manual_email');
  assert.deepEqual(normalized.citations, [{ field: 'message', sourceId: source.id, start: 9, end: 9 + quote.length, quote }]);
  proposal.citations = [];
  assert.throws(() => validatePlanDraft(proposal, [source], 'manual_email'), bad(502));
});

test('tenant, revocation, idempotent draft apply and unsupported channels', async () => {
  const { db } = await import('../lib/server/db');
  const database = await db();
  const now = new Date().toISOString();
  for (const account of [user, other]) {
    await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [account.organizationId, account.id, now]);
    await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [account.id, account.email, 'x', account.organizationId, now]);
  }
  const contact = await createContact(user, { name: 'Sample Customer', email: 'sample@example.test' });
  const source = await createRecord(user, 'brain_source', { title: 'Availability', content: quote, sourceLabel: 'Reviewed brochure', approvedAt: now, approvedBy: user.id }, 'approved');
  const body = { goal: 'Offer a useful consultation', kind: 'sales', channel: 'manual_email', contactIds: [contact.id], sourceIds: [source.id], requestId: 'plan-once' };
  await assert.rejects(generateCampaignPlan(other, body, fake(source.id)), bad(404));
  await assert.rejects(generateCampaignPlan(user, { ...body, channel: 'telephone' }, fake(source.id)), bad(400));
  const plan = await generateCampaignPlan(user, body, fake(source.id));
  assert.equal(plan.data.draft.citations[0].quote, quote);
  const same = await generateCampaignPlan(user, body, fake(source.id));
  assert.equal(same.id, plan.id);
  await assert.rejects(applyCampaignPlan(other, plan.id, { action: 'apply', revision: plan.revision }), bad(404));
  const applied = await applyCampaignPlan(user, plan.id, { action: 'apply', revision: plan.revision });
  assert.equal(applied.campaign.status, 'draft');
  assert.equal(applied.campaign.data.contactIds instanceof Array, true);
  const again = await applyCampaignPlan(user, plan.id, { action: 'apply', revision: plan.revision });
  assert.equal(again.campaign.id, applied.campaign.id);
  assert.equal((await listRecords(user.organizationId, 'campaign')).length, 1);
  const edited = await handleCampaignAction(user, 'campaign.update', { ...applied.campaign.data, id: applied.campaign.id, message: 'Hello {{firstName}}, may we talk?' }) as typeof applied.campaign;
  assert.equal(edited.data.planId, plan.id);
  const pending = await generateCampaignPlan(user, { ...body, requestId: 'plan-revoke' }, fake(source.id));
  await updateRecord(user, source, source.data, 'revoked');
  await assert.rejects(applyCampaignPlan(user, pending.id, { action: 'apply', revision: pending.revision }), bad(409));
  const check = await campaignPreflight(user, edited as never);
  assert.equal(check.ready, false);
  assert.match(check.blockers.join(' '), /knowledge/i);
  await assert.rejects(handleCampaignAction(user, 'campaign.launch', { id: edited.id }), bad(409));
});
