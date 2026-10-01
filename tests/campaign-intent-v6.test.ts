import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { createContact } from '../lib/server/store';
import { createRecord, getRecord, listRecords, updateRecord, type PlatformRecord } from '../lib/platform/records';
import { handleBusinessContextAction } from '../lib/business/engine';
import { applyCampaignPlan, generateCampaignPlan, selectIntentEvidence, verifyAppliedPlanSources, type SourceAnchor } from '../lib/campaign-planning/engine';
import { campaignPreflight, handleCampaignAction, type Campaign } from '../lib/platform/campaigns';
import type { CampaignIntentInput } from '../lib/business/contracts';
import type { runAiTask } from '../lib/ai/task-router';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const quote = 'The onboarding service provides a guided setup review, subject to staff availability.';
const bad = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
async function fixture() {
  const suffix = randomUUID(), now = new Date().toISOString();
  const user: AuthUser = { id: `user-${suffix}`, organizationId: `org-${suffix}`, email: `${suffix}@example.test` };
  const database = await db();
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [user.organizationId, 'Fictional company', now]);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [user.id, user.email, 'x', user.organizationId, now]);
  const contact = await createContact(user, { name: 'Fictional customer', email: 'fictional@example.test' });
  const source = await createRecord(user, 'brain_source', { title: 'Service definition', content: `${'General company background. '.repeat(100)}\n${quote}`, sourceLabel: 'Reviewed company note', approvedAt: now, approvedBy: user.id }, 'approved');
  const action = async (body: Record<string, unknown>) => (await handleBusinessContextAction(user, body) as { record: PlatformRecord }).record;
  const draft = await action({ action: 'offering.create', name: 'Guided onboarding', kind: 'service', summary: quote, audienceDescription: 'Customers setting up the service', sourceRefs: [{ sourceId: source.id, quote }], openQuestions: [] });
  const offering = await action({ action: 'offering.approve', id: draft.id, revision: draft.revision });
  const proposed = await action({ action: 'signal.create', title: 'Setup support opportunity', observation: 'Guided setup review is available subject to staff availability.', sourceRefs: [{ sourceId: source.id, quote }], uncertainty: ['Individual need has not been confirmed.'], offeringId: offering.id, contactId: contact.id });
  const signal = await action({ action: 'signal.review', id: proposed.id, revision: proposed.revision, status: 'approved' });
  const intent: CampaignIntentInput = { schemaVersion: 1, offeringId: offering.id, outcome: { label: 'Understand setup obstacles', evidenceRequired: ['A specific obstacle described by the customer'] }, signalIds: [signal.id], audienceRationale: 'Selected customers are reviewing setup support.', reviewColumns: [{ key: 'setup_obstacle', label: 'Setup obstacle', type: 'text' }] };
  const body = { goal: 'Learn where guided onboarding needs improvement', kind: 'feedback', channel: 'manual_email', contactIds: [contact.id], sourceIds: [], requestId: `plan-${suffix}`, intent };
  let captured = '';
  const run = (async (_user, task) => {
    captured = task.input;
    return { text: JSON.stringify({ name: 'Onboarding feedback', objective: 'Learn about guided onboarding obstacles', subject: 'Your setup experience', message: 'What was difficult in your guided setup?', callBrief: 'Disclose AI identity. Ask what was difficult about the guided onboarding service and request one concrete example.', successCriteria: 'A reviewed customer example, not call completion.', journeySteps: ['Review permission and ask about setup'], missingInputs: [], citations: [{ field: 'callBrief', sourceId: source.id, quote }] }), model: 'fixture', runId: `fake-${suffix}`, usage: { inputTokens: 80, outputTokens: 100 }, cached: false };
  }) as typeof runAiTask;
  return { user, contact, source, offering, signal, proposed, intent, body, run, action, captured: () => captured };
}

test('scoped plan supplies specific offering, outcome and exact late-source evidence, then preserves binding', async () => {
  const f = await fixture();
  const plan = await generateCampaignPlan(f.user, f.body, f.run);
  assert.match(f.captured(), /Guided onboarding/); assert.match(f.captured(), /setup_obstacle/); assert.match(f.captured(), /subject to staff availability/);
  assert.equal(plan.data.draft.citations[0].start > 1800, true);
  assert.deepEqual(plan.data.sourceAnchors[0].allowedQuotes, [quote]);
  const applied = await applyCampaignPlan(f.user, plan.id, { action: 'apply', revision: plan.revision });
  assert.deepEqual(applied.campaign.data.explicitIntentV1, plan.data.explicitIntentV1);
  assert.equal(applied.campaign.status, 'draft');
  assert.ok((await verifyAppliedPlanSources(f.user, plan.id, applied.campaign.id)).length >= 3);
  await assert.rejects(handleCampaignAction(f.user, 'campaign.update', { ...applied.campaign.data, id: applied.campaign.id, message: 'An operator-reviewed question', explicitIntentV1: null }), bad(409));
  const edited = await handleCampaignAction(f.user, 'campaign.update', { ...applied.campaign.data, id: applied.campaign.id, explicitIntentV1: null }) as PlatformRecord<Campaign>;
  assert.deepEqual(edited.data.explicitIntentV1, plan.data.explicitIntentV1);
  await assert.rejects(handleCampaignAction(f.user, 'campaign.update', { ...edited.data, id: edited.id, contactIds: [] }), bad(409));
});

test('unreviewed offering, foreign workspace and unselected signal contacts cannot bind', async () => {
  const f = await fixture(), foreign = await fixture();
  await assert.rejects(generateCampaignPlan(f.user, { ...f.body, intent: { ...f.intent, offeringId: foreign.offering.id } }, f.run), bad(404));
  await assert.rejects(generateCampaignPlan(f.user, { ...f.body, contactIds: [] }, f.run), bad(400));
  await assert.rejects(generateCampaignPlan(f.user, { ...f.body, intent: { ...f.intent, signalIds: [foreign.signal.id] } }, f.run), bad(404));
  await assert.rejects(generateCampaignPlan(f.user, { ...f.body, intent: { ...f.intent, schemaVersion: 2 } }, f.run), bad(400));
  await updateRecord(f.user, f.signal, f.signal.data, 'proposed');
  await assert.rejects(generateCampaignPlan(f.user, f.body, f.run), bad(409));
  await updateRecord(f.user, f.offering, f.offering.data, 'draft');
  await assert.rejects(generateCampaignPlan(f.user, f.body, f.run), bad(409));
});

test('launch keeps the reviewed binding, and signal change at launch fence rolls back', async () => {
  for (const mutate of [false, true]) {
    const f = await fixture(), database = await db();
    await createRecord(f.user, 'customer_profile', { contactId: f.contact.id, consent: { email: { granted: true } } }, 'active');
    const plan = await generateCampaignPlan(f.user, f.body, f.run);
    const applied = await applyCampaignPlan(f.user, plan.id, { action: 'apply', revision: plan.revision });
    const batch = database.batch.bind(database);
    if (mutate) database.batch = async statements => {
      if (statements.some(item => item.sql.startsWith('INSERT INTO entities') && item.params?.includes('platform:campaign_run'))) await database.run('UPDATE entities SET status=? WHERE id=? AND organization_id=?', ['dismissed', f.signal.id, f.user.organizationId]);
      return batch(statements);
    };
    try {
      if (mutate) {
        await assert.rejects(handleCampaignAction(f.user, 'campaign.launch', { id: applied.campaign.id }), bad(409));
        assert.equal((await listRecords(f.user.organizationId, 'campaign_run')).length, 0);
      } else {
        const run = await handleCampaignAction(f.user, 'campaign.launch', { id: applied.campaign.id }) as PlatformRecord<{ snapshot: Campaign }>;
        assert.deepEqual(run.data.snapshot.explicitIntentV1, plan.data.explicitIntentV1);
        assert.equal(run.data.snapshot.offeringSummary, quote);
      }
    } finally { database.batch = batch; }
  }
});

test('stale offering and stale signal each prevent apply', async () => {
  for (const kind of ['offering', 'signal'] as const) {
    const f = await fixture();
    const plan = await generateCampaignPlan(f.user, f.body, f.run);
    const changed = kind === 'offering' ? f.offering : f.signal;
    await updateRecord(f.user, changed, { ...changed.data, summary: 'A changed description' }, changed.status);
    await assert.rejects(applyCampaignPlan(f.user, plan.id, { action: 'apply', revision: plan.revision }), bad(409));
    assert.equal((await listRecords(f.user.organizationId, 'campaign')).length, 0);
  }
});

test('source revocation blocks applied scoped preflight and runtime verification', async () => {
  const f = await fixture();
  const plan = await generateCampaignPlan(f.user, f.body, f.run);
  const applied = await applyCampaignPlan(f.user, plan.id, { action: 'apply', revision: plan.revision });
  await updateRecord(f.user, f.source, f.source.data, 'revoked');
  await assert.rejects(verifyAppliedPlanSources(f.user, plan.id, applied.campaign.id), bad(409));
  const check = await campaignPreflight(f.user, applied.campaign as PlatformRecord<Campaign>);
  assert.equal(check.ready, false); assert.match(check.blockers.join(' '), /knowledge/);
});

test('offering change at apply transaction fence rolls back the draft', async () => {
  const f = await fixture(), database = await db();
  const plan = await generateCampaignPlan(f.user, f.body, f.run);
  const batch = database.batch.bind(database);
  let injected = false;
  database.batch = async statements => {
    if (!injected && statements.some(item => item.sql.startsWith('INSERT INTO entities') && item.params?.includes('platform:campaign'))) {
      injected = true;
      await database.run('UPDATE entities SET status=? WHERE id=? AND organization_id=?', ['retired', f.offering.id, f.user.organizationId]);
    }
    return batch(statements);
  };
  try { await assert.rejects(applyCampaignPlan(f.user, plan.id, { action: 'apply', revision: plan.revision }), bad(409)); }
  finally { database.batch = batch; }
  assert.equal(injected, true); assert.equal((await listRecords(f.user.organizationId, 'campaign')).length, 0);
  assert.equal((await getRecord(f.user.organizationId, 'campaign_plan', plan.id)).status, 'proposed');
});

test('compact evidence preserves conditions, reports omissions, and blocks oversized required evidence', () => {
  const source: SourceAnchor = { id: 'required', title: 'Required evidence', revision: 1, digest: 'test', content: quote };
  const optional: SourceAnchor = { ...source, id: 'optional', content: 'x'.repeat(2000) };
  const result = selectIntentEvidence([{ sourceId: source.id, quote }], [source, optional], [optional.id]);
  assert.deepEqual(result.sources[0].allowedQuotes, [quote]); assert.equal(result.selection.omitted[0].sourceId, optional.id);
  assert.throws(() => selectIntentEvidence([{ sourceId: 'large', quote: 'x'.repeat(12001) }], [{ ...source, id: 'large', content: 'x'.repeat(12001) }], []), bad(400));
});

test('live role removal during inference prevents scoped plan persistence', async () => {
  const f = await fixture(), database = await db();
  const run = (async (user, task) => {
    const output = await f.run(user, task);
    await database.run('UPDATE entities SET status=? WHERE id=? AND organization_id=? AND kind=?', ['removed', `team:member:${f.user.id}`, f.user.organizationId, 'team:member']);
    return output;
  }) as typeof runAiTask;
  await assert.rejects(generateCampaignPlan(f.user, f.body, run), bad(409));
  assert.equal((await listRecords(f.user.organizationId, 'campaign_plan')).length, 0);
  await assert.rejects(generateCampaignPlan(f.user, f.body, f.run), bad(403));
});
