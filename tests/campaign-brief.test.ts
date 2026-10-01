import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { createContact } from '../lib/server/store';
import { createRecord, listRecords, type PlatformRecord } from '../lib/platform/records';
import { getActiveMembership } from '../lib/team/service';
import { handleBusinessContextAction } from '../lib/business/engine';
import type { Offering } from '../lib/business/contracts';
import type { runAiTask } from '../lib/ai/task-router';
import { getCampaignBriefProposal, parseCampaignBriefSuggestion, proposeCampaignBrief, recheckCampaignBriefProposal } from '../lib/campaign-brief/service';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;

const user: AuthUser = { id: 'brief-user', email: 'brief@example.test', organizationId: 'brief-org', role: 'owner' };
const other: AuthUser = { id: 'brief-other', email: 'brief-other@example.test', organizationId: 'brief-other-org', role: 'owner' };
const quote = 'The guided workshop helps product teams define a practical next step.';
const goodOutput = {
  outcome: 'Understand whether a guided workshop would address the stated campaign goal',
  evidenceRequired: ['A reviewed answer explaining the problem the team wants to solve', 'A reviewed answer stating whether a workshop would be useful'],
  audienceRationale: 'The selected audience may be relevant to the approved workshop and the operator’s stated goal.',
  questionsToCollect: ['Problem to solve', 'Would a workshop be useful?'],
  missingContextQuestions: [],
};
const bad = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
const fake = (payload: unknown, hook?: (input: Parameters<typeof runAiTask>[1]) => Promise<void> | void) => (async (_user, input) => {
  await hook?.(input);
  return { text: JSON.stringify(payload), runId: `brief-ai:${randomUUID()}`, model: 'fixture', usage: { inputTokens: 20, outputTokens: 30 }, cached: false };
}) as typeof runAiTask;

async function account(subject: AuthUser) {
  const database = await db(), now = new Date().toISOString();
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [subject.organizationId, subject.id, now]);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [subject.id, subject.email, 'unused', subject.organizationId, now]);
  await getActiveMembership(subject);
}
async function approvedOffering(subject: AuthUser): Promise<PlatformRecord<Offering>> {
  const source = await createRecord(subject, 'brain_source', { title: 'Workshop overview', content: quote, sourceLabel: 'Reviewed company note', authoredBy: subject.id, approvedAt: new Date().toISOString(), approvedBy: subject.id }, 'approved');
  const draft = (await handleBusinessContextAction(subject, { action: 'offering.create', name: 'Guided workshop', kind: 'service', summary: 'A guided product workshop.', audienceDescription: 'Product teams considering a structured next step.', sourceRefs: [{ sourceId: source.id, quote }], openQuestions: [] }) as { record: PlatformRecord<Offering> }).record;
  return (await handleBusinessContextAction(subject, { action: 'offering.approve', id: draft.id, revision: draft.revision }) as { record: PlatformRecord<Offering> }).record;
}

test('AI campaign brief is bounded, tenant scoped, idempotent, and proposal only', async t => {
  await account(user); await account(other);
  const offering = await approvedOffering(user), foreignOffering = await approvedOffering(other);
  const contact = await createContact(user, { name: 'Selected Example', email: 'selected@example.test' });
  const foreignContact = await createContact(other, { name: 'Foreign Example', email: 'foreign@example.test' });
  const body = { requestId: 'brief-idempotent-1', offeringId: offering.id, offeringRevision: offering.revision, goal: 'Learn whether the workshop could help teams choose a practical next step.', contactIds: [contact.id] };

  await t.test('sends no customer identity or history to AI and preserves exact offering quotes', async () => {
    let calls = 0;
    const proposal = await proposeCampaignBrief(user, body, { ai: fake(goodOutput, input => {
      calls++;
      assert.equal(input.task, 'planning'); assert.equal(input.responseFormat, 'json_object'); assert.equal(input.requestId, `campaign-brief:${body.requestId}`);
      assert.equal(input.input.includes(contact.id), false); assert.equal(input.input.includes('Selected Example'), false); assert.equal(input.input.includes('selected@example.test'), false);
      const supplied = JSON.parse(input.input); assert.equal(supplied.selectedContactCount, 1); assert.deepEqual(supplied.sourceBasis, [{ sourceId: offering.data.sourceRefs[0].sourceId, quote }]);
    }) });
    assert.equal(proposal.status, 'ready'); assert.equal(proposal.data.contactIds[0], contact.id); assert.equal(proposal.data.sourceBasis[0].quote, quote);
    assert.match(proposal.data.suggestion!.audienceRationale!, /^Operator-selected audience suitability hypothesis:/);
    assert.match(proposal.data.suggestion!.audienceRationale!, /does not verify product use, purchase history, interest, eligibility, or consent/i);
    assert.deepEqual(proposal.data.reviewColumns?.map(column => column.label), goodOutput.questionsToCollect);
    const replay = await proposeCampaignBrief(user, body, { ai: fake(goodOutput, () => { calls++; }) });
    assert.equal(replay.id, proposal.id); assert.equal(calls, 1);
    assert.deepEqual(await getCampaignBriefProposal(user, body.requestId), replay);
    await assert.rejects(proposeCampaignBrief(user, { ...body, goal: 'A different goal' }, { ai: fake(goodOutput) }), bad(409));
  });

  await t.test('rejects unknown fields and personal or unsupported evidence claims', async () => {
    assert.throws(() => parseCampaignBriefSuggestion(JSON.stringify({ ...goodOutput, message: 'Send this now' })), bad(422));
    assert.throws(() => parseCampaignBriefSuggestion(JSON.stringify({ ...goodOutput, evidenceRequired: ['Email: invented@example.test'] })), bad(422));
    assert.throws(() => parseCampaignBriefSuggestion(JSON.stringify({ ...goodOutput, audienceRationale: 'These customers have used the workshop and consented.' })), bad(422));
    const unknownUseQuestion = parseCampaignBriefSuggestion(JSON.stringify({ ...goodOutput, audienceRationale: 'The campaign can learn whether they are interested and should not assume they have used the offering.', questionsToCollect: ['Have they used this service?', 'Has contact permission been confirmed?'] }));
    assert.match(unknownUseQuestion.audienceRationale || '', /whether they are interested/i);
    const unknown = await proposeCampaignBrief(user, { ...body, requestId: 'brief-invalid-fields' }, { ai: fake({ ...goodOutput, campaignId: 'invented' }) });
    assert.equal(unknown.status, 'invalid'); assert.match(unknown.data.invalidReason || '', /unsupported fields/i);
    const pii = await proposeCampaignBrief(user, { ...body, requestId: 'brief-invalid-pii' }, { ai: fake({ ...goodOutput, evidenceRequired: ['Call invented@example.test for proof'] }) });
    assert.equal(pii.status, 'invalid'); assert.match(pii.data.invalidReason || '', /personal data/i);
    const deferred = parseCampaignBriefSuggestion(JSON.stringify({ outcome: null, evidenceRequired: [], audienceRationale: null, questionsToCollect: [], missingContextQuestions: ['Which decision should this campaign support?'] }));
    assert.equal(deferred.outcome, null); assert.equal(deferred.missingContextQuestions.length, 1);
  });

  await t.test('rechecks a saved completed receipt without another inference', async () => {
    let calls = 0;
    const invalid = await proposeCampaignBrief(user, { ...body, requestId: 'brief-recheck-receipt' }, { ai: fake({ ...goodOutput, unsupported: true }, () => { calls++; }) });
    assert.equal(invalid.status, 'invalid'); assert.equal(calls, 1);
    const recovered = { ...goodOutput, audienceRationale: 'The campaign can learn whether they are interested; it does not imply they have used the offering or granted permission.' };
    await (await db()).run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [invalid.data.aiRunId!, user.organizationId, 'ai:run', 'complete', JSON.stringify({ text: JSON.stringify(recovered) }), new Date().toISOString()]);
    const rechecked = await recheckCampaignBriefProposal(user, { proposalId: invalid.id });
    assert.equal(rechecked.status, 'ready'); assert.equal(calls, 1);
    assert.equal(rechecked.data.aiRunId, invalid.data.aiRunId); assert.ok(rechecked.data.priorInvalidReasons?.length);
  });

  await t.test('enforces tenant contact and offering boundaries', async () => {
    await assert.rejects(proposeCampaignBrief(other, { ...body, requestId: 'brief-foreign-offering' }, { ai: fake(goodOutput) }), bad(404));
    await assert.rejects(proposeCampaignBrief(user, { ...body, requestId: 'brief-foreign-contact', contactIds: [foreignContact.id] }, { ai: fake(goodOutput) }), bad(404));
    await assert.rejects(getCampaignBriefProposal(other, body.requestId), bad(404));
    assert.notEqual(foreignOffering.id, offering.id);
  });

  await t.test('new generation rejects maximum-sized survey output while historical parsing stays compatible',async () => {
    for (const [key,count] of [['questionsToCollect',6],['evidenceRequired',5],['missingContextQuestions',4]] as const) {
      const oversized = {...goodOutput,[key]:Array.from({length:count},(_,index) => `Distinct ${key} item ${index+1}?`)};
      assert.doesNotThrow(() => parseCampaignBriefSuggestion(JSON.stringify(oversized)));
      const proposal = await proposeCampaignBrief(user,{...body,requestId:`brief-focused-${key}`},{ai:fake(oversized)});
      assert.equal(proposal.status,'invalid');
      assert.equal(proposal.data.qualityVersion,1);
      assert.match(proposal.data.invalidReason || '',/at most five/i);
      assert.equal(proposal.data.suggestion,undefined);
    }
  });

  await t.test('focused interview preserves rating, yes/no and explanatory answer types without padding missing context',async () => {
    const focused = {...goodOutput,
      questionsToCollect:['On a scale of 1 to 5, how clear was the explanation?','Was the next step clear?','Which follow-up would help most?'],
      evidenceRequired:['A clarity rating from the caller','The caller’s preferred useful follow-up'],missingContextQuestions:[]};
    const proposal = await proposeCampaignBrief(user,{...body,requestId:'brief-focused-types'},{ai:fake(focused,input => {
      assert.match(input.system,/at most|maximum five/i);
      assert.match(input.system,/do not broaden it/i);
      assert.match(input.system,/missingContextQuestions: \[\]/);
    })});
    assert.equal(proposal.status,'ready');
    assert.deepEqual(proposal.data.reviewColumns?.map(column => column.type),['number','boolean','text']);
    assert.deepEqual(proposal.data.reviewColumns?.map(column => column.label),focused.questionsToCollect);
    assert.deepEqual(proposal.data.suggestion?.missingContextQuestions,[]);
  });

  await t.test('new briefs cannot repeat the supplied goal or pad the interview with duplicate questions',async () => {
    for (const [suffix,output] of [
      ['goal',{...goodOutput,missingContextQuestions:['What is the primary campaign goal?']}],
      ['duplicate',{...goodOutput,questionsToCollect:['What would help next?','What would help next?']}],
    ] as const) {
      const proposal = await proposeCampaignBrief(user,{...body,requestId:`brief-focused-${suffix}`},{ai:fake(output)});
      assert.equal(proposal.status,'invalid');
      assert.match(proposal.data.invalidReason || '',suffix === 'goal' ? /already supplied/ : /repeats/);
    }
  });

  await t.test('saved new invalid receipts cannot bypass focused limits through recheck, while legacy receipts remain readable',async () => {
    const oversized = {...goodOutput,questionsToCollect:Array.from({length:6},(_,index) => `Legacy question ${index+1}?`)};
    let calls = 0;
    const invalid = await proposeCampaignBrief(user,{...body,requestId:'brief-focused-recheck'},{ai:fake(oversized,() => {calls++;})});
    const database = await db();
    await database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)',[invalid.data.aiRunId!,user.organizationId,'ai:run','complete',JSON.stringify({text:JSON.stringify(oversized)}),new Date().toISOString()]);
    await assert.rejects(recheckCampaignBriefProposal(user,{proposalId:invalid.id}),bad(422));
    const {qualityVersion:_qualityVersion,...legacyData} = invalid.data;
    const legacy = await createRecord(user,'campaign_brief_proposal',{...legacyData,requestId:'historical-brief-fixture'},'invalid');
    const rechecked = await recheckCampaignBriefProposal(user,{proposalId:legacy.id});
    assert.equal(rechecked.status,'ready');
    assert.equal(rechecked.data.suggestion?.questionsToCollect.length,6);
    assert.equal(calls,1);
  });

  await t.test('rejects stale offerings before inference and if they change during inference', async () => {
    const staleBefore = await approvedOffering(user);
    await handleBusinessContextAction(user, { action: 'offering.retire', id: staleBefore.id, revision: staleBefore.revision });
    let calls = 0;
    await assert.rejects(proposeCampaignBrief(user, { ...body, requestId: 'brief-stale-client', offeringRevision: offering.revision - 1 }, { ai: fake(goodOutput, () => { calls++; }) }), bad(409));
    await assert.rejects(proposeCampaignBrief(user, { ...body, requestId: 'brief-stale-before', offeringId: staleBefore.id, offeringRevision: staleBefore.revision }, { ai: fake(goodOutput, () => { calls++; }) }), bad(409));
    assert.equal(calls, 0);

    const changing = await approvedOffering(user);
    await assert.rejects(proposeCampaignBrief(user, { ...body, requestId: 'brief-stale-during', offeringId: changing.id, offeringRevision: changing.revision }, { ai: fake(goodOutput, async () => {
      await handleBusinessContextAction(user, { action: 'offering.retire', id: changing.id, revision: changing.revision });
    }) }), bad(409));
    const pending = await getCampaignBriefProposal(user, 'brief-stale-during');
    assert.equal(pending.status, 'pending');
  });

  await t.test('persists only proposal records and does not create a plan, campaign, apply, or launch', async () => {
    const briefs = await listRecords(user.organizationId, 'campaign_brief_proposal');
    assert.ok(briefs.length >= 4);
    assert.equal((await listRecords(user.organizationId, 'campaign_plan')).length, 0);
    assert.equal((await listRecords(user.organizationId, 'campaign')).length, 0);
  });
});
