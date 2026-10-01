import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { insertEntity } from '../lib/server/store';
import { createRecord, updateRecord, type PlatformRecord } from '../lib/platform/records';
import { createCampaignIntent, handleBusinessContextAction } from '../lib/business/engine';
import { getActiveMembership } from '../lib/team/service';
import type { Offering, ReviewColumn } from '../lib/business/contracts';
import { handleCampaignAction, type Campaign, type Run } from '../lib/platform/campaigns';
import { applyCampaignPlan, generateCampaignPlan } from '../lib/campaign-planning/engine';
import type { CampaignSetupData } from '../lib/platform/campaign-workflow';
import type { runAiTask } from '../lib/ai/task-router';
import { campaignAnswersCsv, extractCampaignResult, getCampaignResult, listReviewedCampaignAnswers, revalidateCampaignResult, reviewCampaignResult, type ExtractionRunner } from '../lib/campaign-results/service';
import { locateSource, supportedValue, validateAnswers } from '../lib/campaign-results/validation';
import { GET, POST, PATCH } from '../app/api/campaign-results/route';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const columns: ReviewColumn[] = [{ key: 'interested', label: 'Interested', type: 'boolean' }, { key: 'budget', label: 'Budget', type: 'number' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'choice', label: 'Preferred channel', type: 'enum', options: ['Email', 'Phone'] }, { key: 'feedback', label: 'Feedback', type: 'text' }];
const turns = [{ role: 'user', text: 'No, I am not interested.', receivedAt: '2026-09-27T10:00:00+05:30' }, { role: 'user', text: 'My budget is 2500.' }, { role: 'user', text: 'Date: 2026-10-12' }, { role: 'user', text: 'Preferred channel: Email' }, { role: 'user', text: '=SUM(1,2)' }, { role: 'assistant', text: 'The caller agreed to buy.' }];
const answers = () => ({ answers: columns.map((column, index) => ({ key: column.key, state: 'proposed', value: [false, 2500, '2026-10-12', 'Email', '=SUM(1,2)'][index], quote: turns[index].text, turnIndex: index })) });
const bad = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
async function setup() {
  const database = await db(), id = randomUUID(), now = new Date().toISOString(), user = { id, email: `${id}@example.test`, organizationId: randomUUID() };
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [user.organizationId, 'Fictional answer review', now]);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [user.id, user.email, 'unused', user.organizationId, now]);
  await getActiveMembership(user);
  const source = await createRecord(user, 'brain_source', { title: 'Workshop', content: 'We provide workshops.', sourceLabel: 'Reviewed note', approvedBy: user.id, approvedAt: now }, 'approved');
  const draft = (await handleBusinessContextAction(user, { action: 'offering.create', name: 'Workshop', kind: 'service', summary: 'Workshops', audienceDescription: 'Teams', sourceRefs: [{ sourceId: source.id, quote: 'We provide workshops.' }], openQuestions: [] }) as { record: PlatformRecord<Offering> }).record;
  const offering = (await handleBusinessContextAction(user, { action: 'offering.approve', id: draft.id, revision: draft.revision }) as { record: PlatformRecord<Offering> }).record;
  const contact = await insertEntity(user, 'contact', { name: 'Fictional caller' });
  const intent = await createCampaignIntent(user, { schemaVersion: 1, offeringId: offering.id, signalIds: [], outcome: { label: 'Understand interest', evidenceRequired: ['Caller words'] }, audienceRationale: 'Explicit operator selection', reviewColumns: columns }, [contact.id]);
  const version = await createRecord(user, 'agent_version', { number: 1 }, 'published');
  const release = await createRecord(user, 'release', { versionId: version.id }, 'active');
  const campaign = await createRecord<Campaign>(user, 'campaign', { name: 'Workshop feedback', kind: 'feedback', objective: 'Collect answers', channel: 'browser', agentReleaseId: release.id, subject: '', message: 'Tell us what you think.', contactIds: [contact.id], ownerId: user.id, explicitIntentV1: intent }, 'active');
  const run = await createRecord<Run>(user, 'campaign_run', { campaignId: campaign.id, campaignRevision: campaign.revision, snapshot: campaign.data, recipients: [{ contactId: contact.id, name: 'Fictional caller', email: '', status: 'queued' }], launchedAt: now, launchedBy: user.id }, 'active');
  const session = await insertEntity(user, 'session', { source: 'browser_voice', campaignRunId: run.id, releaseId: release.id, agentVersionId: version.id, contactId: contact.id, transcript: turns });
  return { user, source, offering, campaign, run, session, contact };
}
const fake = (payload: unknown = answers(), hook?: () => Promise<void>): ExtractionRunner => async () => { await hook?.(); return { text: JSON.stringify(payload), runId: 'fixture-ai-run', model: 'fixture-model', usage: { inputTokens: 20, outputTokens: 40 }, cached: false }; };

const clarityRating: ReviewColumn = {key:'consultation_clarity',label:'On a scale of 1 to 5, how clear was the information presented during the consultation?',type:'number'};
test('explicit spoken clarity ratings bind to the named subject and reviewed scale',() => {
  for (const text of ['I would rate the consultation clarity four out of five.','I rate the consultation clarity 4 out of 5.','My consultation clarity score is four out of five.']) {
    const transcript = [{role:'user',text}];
    const checked = validateAnswers(JSON.stringify({answers:[{key:clarityRating.key,state:'proposed',value:4,quote:text,turnIndex:0}]}),[clarityRating],transcript);
    assert.equal(checked[0].state,'proposed',text);
    assert.equal(checked[0].value,4);
    assert.equal(checked[0].sources[0].quote,text);
  }
});

test('spoken ratings reject negation, hypothetical tails, other people and unrelated scales or subjects',() => {
  for (const text of [
    'I would not rate the consultation clarity four out of five.',
    'I would rate the consultation clarity four out of five if the information were clearer.',
    'I would rate the consultation clarity four out of five, maybe.',
    'My friend would rate the consultation clarity four out of five.',
    'I would rate my friend consultation clarity four out of five.',
    'I would rate the consultation clarity four out of ten.',
    'I would rate the consultation clarity six out of five.',
    'I would rate the consultation clarity zero out of five.',
    'I would rate the workshop clarity four out of five.',
    'I would rate the consultation usefulness four out of five.',
    'I attended four out of five consultations.',
    'I would rate the consultation clarity four out of five. Actually, ignore that.',
  ]) {
    const transcript = [{role:'user',text}];
    const checked = validateAnswers(JSON.stringify({answers:[{key:clarityRating.key,state:'proposed',value:4,quote:text,turnIndex:0}]}),[clarityRating],transcript);
    assert.equal(checked[0].state,'unknown',text);
  }
  const text = 'I would rate the consultation clarity four out of five.';
  assert.equal(supportedValue(columns[1],4,locateSource([{role:'user',text}],text,0),[{role:'user',text}]),false);
});

test('contradictory spoken ratings omitted by extraction remain conflicting',() => {
  for (const transcript of [
    [{role:'user',text:'I would rate the consultation clarity four out of five.'},{role:'user',text:'I rate the consultation clarity three out of five.'}],
    [{role:'user',text:'I rate the consultation clarity four out of five. I rate the consultation clarity three out of five.'}],
  ]) {
    const quote = 'I would rate the consultation clarity four out of five.';
    const checked = validateAnswers(JSON.stringify({answers:[{key:clarityRating.key,state:'proposed',value:4,quote:transcript.length===2?quote:transcript[0].text,turnIndex:0}]}),[clarityRating],transcript);
    assert.equal(checked[0].state,'conflicting');
  }
});

async function canonicalSetup(reviewColumns: ReviewColumn[]) {
  const f = await setup();
  await createRecord(f.user,'customer_profile',{contactId:f.contact.id,consent:{browser_voice:{granted:true}}},'active');
  const saved = await handleCampaignAction(f.user,'campaign.setup.create',{requestId:randomUUID(),fields:{
    name:'Canonical feedback',kind:'feedback',goal:'Understand workshop interest',offeringId:f.offering.id,
    outcome:{label:'Understand interest',evidenceRequired:['Caller words']},audienceRationale:'Explicit operator selection',
    reviewColumns,contactIds:[f.contact.id],channel:'browser',agentReleaseId:f.run.data.snapshot.agentReleaseId,
  }}) as PlatformRecord<CampaignSetupData>;
  const planning = (async () => ({text:JSON.stringify({name:'Canonical feedback',objective:'Understand workshop interest',subject:'',message:'I am an AI assistant. What did you think of the workshop?',callBrief:'Ask about the workshop.',successCriteria:'Caller feedback',journeySteps:['Ask about interest'],missingInputs:[],citations:[{field:'callBrief',sourceId:f.source.id,quote:'We provide workshops.'}]}),runId:'fixture-planning',model:'fixture-model',usage:{inputTokens:20,outputTokens:40},cached:false})) as typeof runAiTask;
  const plan = await generateCampaignPlan(f.user,{campaignId:saved.id,campaignRevision:saved.revision,requestId:randomUUID()},planning);
  const applied = await applyCampaignPlan(f.user,plan.id,{action:'apply',revision:plan.revision,campaignId:saved.id,campaignRevision:saved.revision});
  await handleCampaignAction(f.user,'campaign.setup.finalize',{id:saved.id,revision:applied.campaign.revision});
  const run = await handleCampaignAction(f.user,'campaign.launch',{id:saved.id}) as PlatformRecord<Run>;
  const session = await insertEntity(f.user,'session',{source:'browser_voice',campaignRunId:run.id,releaseId:run.data.snapshot.agentReleaseId,agentVersionId:f.session.agentVersionId,contactId:f.contact.id,transcript:turns});
  await handleCampaignAction(f.user,'campaign.result',{runId:run.id,contactId:f.contact.id,outcome:'completed',sessionId:session.id,evidence:'Saved fictional conversation'});
  return {...f,run,session};
}

test('completed canonical AI campaign without planned columns has an empty result view and never buys extraction',async () => {
  const f = await canonicalSetup([]);
  const view = await getCampaignResult(f.user,f.session.id);
  assert.deepEqual(view.columns,[]);
  assert.equal(view.result,null);
  let calls = 0;
  await assert.rejects(extractCampaignResult(f.user,f.session.id,fake(answers(),async () => {calls++;})),(error: unknown) => error instanceof HttpError && error.status === 409 && /no planned result fields/i.test(error.message));
  assert.equal(calls,0);
  assert.equal((await (await db()).all('SELECT id FROM entities WHERE organization_id=? AND kind=?',[f.user.organizationId,'campaign:result'])).length,0);
  const outsider = await setup();
  await assert.rejects(getCampaignResult(outsider.user,f.session.id),bad(404));
  await updateRecord(f.user,f.source,f.source.data,'revoked');
  await assert.rejects(getCampaignResult(f.user,f.session.id),bad(409));
});

test('completed canonical AI campaign with planned columns retains extraction and review bindings',async () => {
  const f = await canonicalSetup(columns);
  const view = await getCampaignResult(f.user,f.session.id);
  assert.deepEqual(view.columns,columns);
  const result = await extractCampaignResult(f.user,f.session.id,fake());
  assert.equal(result.status,'ready');
  assert.equal(result.binding.campaignId,f.run.data.campaignId);
  assert.equal(result.binding.runId,f.run.id);
  const reviewed = await reviewCampaignResult(f.user,result.id,result.revision,[{key:'interested',status:'accepted',value:false,quote:turns[0].text,turnIndex:0}]);
  assert.equal(reviewed.fields[0].review?.value,false);
});

test('saved spoken-rating receipt rechecks locally and accepts the exact caller evidence',async () => {
  const f = await canonicalSetup([clarityRating]);
  const text = 'I would rate the consultation clarity four out of five.';
  await (await db()).run('UPDATE entities SET data=? WHERE id=?',[JSON.stringify({...f.session,transcript:[{role:'user',text}]}),f.session.id]);
  let calls = 0;
  const result = await extractCampaignResult(f.user,f.session.id,fake({answers:[{key:clarityRating.key,state:'proposed',value:4,quote:text,turnIndex:0}]},async () => {calls++;}));
  assert.equal(result.fields[0].value,4);
  // Preserve the original receipt while simulating the former validator's
  // unknown field, including its already-current revalidation version.
  const previous = {...result,validationVersion:2,fields:result.fields.map(field => ({column:field.column,state:'unknown',sources:field.sources,reason:'No unambiguous, literal caller answer supports this field.'}))};
  await (await db()).run('UPDATE entities SET data=? WHERE id=?',[JSON.stringify(previous),result.id]);
  const rechecked = await revalidateCampaignResult(f.user,result.id,result.revision);
  assert.equal(rechecked.fields[0].state,'proposed');
  assert.equal(rechecked.fields[0].value,4);
  assert.equal(rechecked.originalModelText,result.originalModelText);
  assert.deepEqual(rechecked.receipt,result.receipt);
  assert.equal(calls,1);
  const reviewed = await reviewCampaignResult(f.user,result.id,rechecked.revision,[{key:clarityRating.key,status:'accepted',value:4,quote:text,turnIndex:0}]);
  assert.equal(reviewed.fields[0].review?.value,4);
});

test('typed extraction preserves false, all missing columns, exact offsets and browser timestamps', () => {
  const result = validateAnswers(JSON.stringify(answers()), columns, turns);
  assert.deepEqual(result.map(field => field.value), [false, 2500, '2026-10-12', 'Email', '=SUM(1,2)']);
  assert.equal(result[0].sources[0].receivedAt, turns[0].receivedAt);
  assert.equal(result[0].sources[0].start, 0);
  assert.equal(validateAnswers('{"answers":[]}', columns, turns).filter(field => field.state === 'unknown').length, 5);
});
test('assistant evidence, clipped negation, contradictory labels, ambiguous dates, consent and adversarial fields fail closed', () => {
  assert.throws(() => locateSource(turns, 'The caller agreed to buy.', 5), bad(400));
  assert.throws(() => locateSource(turns, 'interested', 0), bad(400));
  for (const input of [{ answers: [{ key: 'interested', state: 'proposed', value: true, quote: turns[0].text, turnIndex: 0 }] }, { answers: [{ key: 'date', state: 'proposed', value: '2026-02-30', quote: '2026-02-30', turnIndex: 0 }] }]) assert.equal(validateAnswers(JSON.stringify(input), columns, turns)[input.answers[0].key === 'date' ? 2 : 0].state, 'unknown');
  const noConsent: ReviewColumn[] = [{ key: 'consent', label: 'Consent', type: 'boolean' }];
  assert.equal(validateAnswers(JSON.stringify({ answers: [{ key: 'consent', state: 'proposed', value: true, quote: 'Yes', turnIndex: 0 }] }), noConsent, [{ role: 'user', text: 'Yes' }])[0].state, 'unknown');
  assert.equal(validateAnswers(JSON.stringify({ answers: [{ key: 'interested', state: 'proposed', value: true, quote: 'Yes', turnIndex: 0 }] }), [{ key: 'interested', label: 'Not interested', type: 'boolean' }], [{ role: 'user', text: 'Yes' }])[0].state, 'unknown');
  assert.throws(() => validateAnswers('{"answers":[{"key":"interested","contactId":"forged"}]}', columns, turns), bad(502));
  assert.throws(() => validateAnswers('{"answers":[],"__proto__":{"admin":true}}', columns, turns), bad(502));
});
test('opposite caller answers remain conflicting and cannot be accepted by review', async () => {
  const fixture = await setup(), transcript = [...turns, { role: 'user', text: 'Yes, I am interested.' }];
  await (await db()).run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...fixture.session, transcript }), fixture.session.id]);
  const payload = answers(); payload.answers.push({ key: 'interested', state: 'proposed', value: true, quote: transcript[6].text, turnIndex: 6 });
  const result = await extractCampaignResult(fixture.user, fixture.session.id, fake(payload));
  assert.equal(result.fields[0].state, 'conflicting');
  await assert.rejects(reviewCampaignResult(fixture.user, result.id, result.revision, [{ key: 'interested', status: 'accepted', value: true, quote: transcript[6].text, turnIndex: 6 }]), bad(409));
});
test('one stable extraction, atomic reviewed row, safe CSV and stale revision reject', async () => {
  const fixture = await setup(); let calls = 0;
  const runner = fake(answers(), async () => { calls++; });
  const first = await extractCampaignResult(fixture.user, fixture.session.id, runner), repeated = await extractCampaignResult(fixture.user, fixture.session.id, runner);
  assert.equal(first.id, repeated.id); assert.equal(calls, 1); assert.equal(first.receipt?.runId, 'fixture-ai-run');
  const reviewed = await reviewCampaignResult(fixture.user, first.id, first.revision, first.fields.map((field, index) => ({ key: field.column.key, status: 'accepted', value: field.value, quote: turns[index].text, turnIndex: index })));
  assert.equal(reviewed.status, 'reviewed'); assert.equal(reviewed.originalModelText, first.originalModelText);
  const rows = await listReviewedCampaignAnswers(fixture.user, fixture.offering.id);
  assert.equal(rows.length, 1); assert.equal(rows[0].fields[0].review?.value, false);
  const csv = campaignAnswersCsv(rows); assert.match(csv, /"'=SUM\(1,2\)"/); assert.match(csv, /"false"/);
  await assert.rejects(reviewCampaignResult(fixture.user, first.id, first.revision, [{ key: 'interested', status: 'unknown' }]), bad(409));
  const next = await reviewCampaignResult(fixture.user, first.id, reviewed.revision, [{ key: 'interested', status: 'unknown' }]);
  assert.equal(next.fields[0].review?.value, undefined); assert.equal((await listReviewedCampaignAnswers(fixture.user, fixture.offering.id)).length, 1);
});
test('source, campaign schema and session changes invalidate application and current exported answers', async () => {
  for (const change of ['source', 'schema', 'session'] as const) {
    const fixture = await setup(), result = await extractCampaignResult(fixture.user, fixture.session.id, fake());
    if (change === 'source') await updateRecord(fixture.user, fixture.source, { ...fixture.source.data, content: 'Changed source' });
    if (change === 'schema') await updateRecord(fixture.user, fixture.campaign, { ...fixture.campaign.data, explicitIntentV1: { ...fixture.campaign.data.explicitIntentV1!, reviewColumns: [] } });
    if (change === 'session') await (await db()).run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...fixture.session, transcript: [{ role: 'user', text: 'Changed transcript' }] }), fixture.session.id]);
    await assert.rejects(reviewCampaignResult(fixture.user, result.id, result.revision, [{ key: 'interested', status: 'unknown' }]), bad(409));
    assert.equal((await listReviewedCampaignAnswers(fixture.user, fixture.offering.id)).length, 0);
  }
});
test('foreign tenant, viewer mutation, wrong run and membership removal during inference are rejected', async () => {
  const fixture = await setup(), outsider = await setup();
  await assert.rejects(getCampaignResult(outsider.user, fixture.session.id), bad(404));
  const database = await db();
  const [member] = await database.all('SELECT data FROM entities WHERE id=?', [`team:member:${fixture.user.id}`]);
  await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(member.data)), role: 'viewer' }), `team:member:${fixture.user.id}`]);
  await assert.rejects(extractCampaignResult(fixture.user, fixture.session.id, fake()), bad(403));
  assert.equal((await getCampaignResult(fixture.user, fixture.session.id)).canReview, false);
  await database.run('UPDATE entities SET data=? WHERE id=?', [String(member.data), `team:member:${fixture.user.id}`]);
  const result = await extractCampaignResult(fixture.user, fixture.session.id, fake(answers(), async () => { await database.run('UPDATE entities SET status=? WHERE id=?', ['removed', `team:member:${fixture.user.id}`]); }));
  assert.equal(result.status, 'stale');
  assert.equal(result.originalModelText, JSON.stringify(answers()));
  await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...outsider.session, campaignRunId: fixture.run.id }), outsider.session.id]);
  await assert.rejects(getCampaignResult(outsider.user, outsider.session.id), bad(404));
});
test('invalid model JSON is retained and does not purchase another attempt', async () => {
  const fixture = await setup(); let calls = 0;
  const runner: ExtractionRunner = async () => { calls++; return { text: '{bad json', runId: 'bad-output-receipt', model: 'fixture', usage: { inputTokens: 1, outputTokens: 2 }, cached: false }; };
  const result = await extractCampaignResult(fixture.user, fixture.session.id, runner);
  assert.equal(result.status, 'failed'); assert.equal(result.originalModelText, '{bad json');
  await extractCampaignResult(fixture.user, fixture.session.id, runner); assert.equal(calls, 1);
});

test('HTTP handlers require authentication and same-origin mutation', async () => {
  assert.equal((await GET(new Request('http://localhost/api/campaign-results?sessionId=missing'))).status, 401);
  for (const handler of [POST, PATCH]) assert.equal((await handler(new Request('http://localhost/api/campaign-results', { method: handler === POST ? 'POST' : 'PATCH', headers: { origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' }))).status, 403);
});
test('source change during inference retains original AI output without publishing answers', async () => {
  const fixture = await setup();
  const result = await extractCampaignResult(fixture.user, fixture.session.id, fake(answers(), async () => { await updateRecord(fixture.user, fixture.source, fixture.source.data, 'revoked'); }));
  assert.equal(result.status, 'stale'); assert.equal(result.originalModelText, JSON.stringify(answers()));
  assert.equal((await listReviewedCampaignAnswers(fixture.user, fixture.offering.id)).length, 0);
});
test('complete transcript cap prevents paid extraction instead of dropping contradictory source turns', async () => {
  const fixture = await setup(); let calls = 0;
  await (await db()).run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...fixture.session, transcript: [...turns, { role: 'user', text: 'x'.repeat(12001) }] }), fixture.session.id]);
  await assert.rejects(extractCampaignResult(fixture.user, fixture.session.id, fake(answers(), async () => { calls++; })), bad(413));
  assert.equal(calls, 0);
});
test('review rejects type coercion, invented source and extra identity fields; unknown removes accepted value', async () => {
  const fixture = await setup(), result = await extractCampaignResult(fixture.user, fixture.session.id, fake());
  for (const review of [
    { key: 'budget', status: 'accepted' as const, value: '2500', quote: '2500', turnIndex: 1 },
    { key: 'budget', status: 'accepted' as const, value: 9000, quote: '9000', turnIndex: 1 },
    { key: 'interested', status: 'accepted' as const, value: true, quote: turns[0].text, turnIndex: 0 },
    { key: 'budget', status: 'unknown' as const, value: 2500 },
    { key: 'budget', status: 'unknown' as const, contactId: 'forged' },
  ]) await assert.rejects(reviewCampaignResult(fixture.user, result.id, result.revision, [review]), bad(400));
});
test('unreported contrary boolean turn is detected independently; enum substrings and numeric scaling remain unknown', () => {
  const result = validateAnswers(JSON.stringify({ answers: [{ key: 'interested', state: 'proposed', value: true, quote: 'I am interested.', turnIndex: 0 }] }), columns, [{ role: 'user', text: 'I am interested.' }, { role: 'user', text: 'I am not interested.' }]);
  assert.equal(result[0].state, 'conflicting'); assert.equal(result[0].sources.length, 2);
  for (const [key, value, quote] of [['choice', 'Phone', 'headphones'], ['budget', 2, 'My budget is 2k.'], ['date', '2026-10-12', '12/10/2026']] as const) {
    const checked = validateAnswers(JSON.stringify({ answers: [{ key, state: 'proposed', value, quote, turnIndex: 0 }] }), columns, [{ role: 'user', text: quote }]);
    assert.equal(checked.find(field => field.column.key === key)?.state, 'unknown');
  }
});
test('concurrent reviews cannot overwrite each other and reviewed rows disappear when source changes', async () => {
  const fixture = await setup(), result = await extractCampaignResult(fixture.user, fixture.session.id, fake());
  const outcomes = await Promise.allSettled([
    reviewCampaignResult(fixture.user, result.id, result.revision, [{ key: 'interested', status: 'accepted', value: false, quote: turns[0].text, turnIndex: 0 }]),
    reviewCampaignResult(fixture.user, result.id, result.revision, [{ key: 'budget', status: 'unknown' }]),
  ]);
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(outcome => outcome.status === 'rejected' && outcome.reason instanceof HttpError && outcome.reason.status === 409).length, 1);
  const rows = await listReviewedCampaignAnswers(fixture.user, fixture.offering.id);
  assert.equal(rows.length, 1); assert.equal(rows[0].fields.length, 1);
  await updateRecord(fixture.user, fixture.source, fixture.source.data, 'revoked');
  assert.equal((await listReviewedCampaignAnswers(fixture.user, fixture.offering.id)).length, 0);
});
test('typed meaning requires the named field, clause-local negation and complete caller certainty', () => {
  const interested = columns[0], budget = columns[1], date = columns[2], channel = columns[3];
  const utterance = [{ role: 'user', text: 'I am interested, but not ready.' }];
  const source = locateSource(utterance, utterance[0].text, 0);
  assert.equal(supportedValue(interested, false, source, utterance), false);
  assert.equal(supportedValue(interested, true, source, utterance), true);
  for (const [column, value, text] of [
    [budget, 35, 'I am 35 years old.'], [date, '2026-10-12', 'My birthday is 2026-10-12.'], [channel, 'Email', 'I received an Email.'],
    [budget, 2500, 'My friend’s budget is 2500.'],
    [{ key: 'budget', label: 'Annual budget', type: 'number' } satisfies ReviewColumn, 2500, 'My monthly budget is 2500.'],
  ] as const) {
    const transcript = [{ role: 'user', text }];
    assert.equal(supportedValue(column, value, locateSource(transcript, text, 0), transcript), false);
  }
  for (const text of ['My budget is 2500, maybe.', 'My budget is 2500. Actually, ignore that.', 'My budget is 2500, but that is wrong.']) assert.throws(() => locateSource([{ role: 'user', text }], 'My budget is 2500', 0), bad(400));
  const negativeSuffix = [{ role: 'user', text: 'My budget is 2500. That is not my budget.' }];
  assert.equal(supportedValue(budget, 2500, locateSource(negativeSuffix, 'My budget is 2500', 0), negativeSuffix), false);
});
test('omitted contrary scalar answers remain conflicting across turns and within one turn', async () => {
  for (const transcript of [
    [{ role: 'user', text: 'My budget is 2500.' }, { role: 'user', text: 'My budget is 1000.' }],
    [{ role: 'user', text: 'My budget is 2500. My budget is 1000.' }],
  ]) {
    const fixture = await setup();
    await (await db()).run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...fixture.session, transcript }), fixture.session.id]);
    const payload = { answers: [{ key: 'budget', state: 'proposed', value: 2500, quote: 'My budget is 2500.', turnIndex: 0 }] };
    const result = await extractCampaignResult(fixture.user, fixture.session.id, fake(payload));
    assert.equal(result.fields[1].state, 'conflicting');
    await assert.rejects(reviewCampaignResult(fixture.user, result.id, result.revision, [{ key: 'budget', status: 'accepted', value: 2500, quote: 'My budget is 2500.', turnIndex: 0 }]), bad(409));
    assert.equal((await listReviewedCampaignAnswers(fixture.user, fixture.offering.id)).length, 0);
  }
});
test('a single explicit field question can bind a bare typed caller answer without treating the question as fact', () => {
  for (const [column, value, answer] of [[columns[0], false, 'No'], [columns[1], 2500, '2500'], [columns[2], '2026-10-12', '2026-10-12'], [columns[3], 'Email', 'Email']] as const) {
    const transcript = [{ role: 'assistant', text: `${column.label}?` }, { role: 'user', text: answer }];
    assert.equal(supportedValue(column, value, locateSource(transcript, answer, 1), transcript), true);
    assert.equal(supportedValue(column, value, locateSource([{ role: 'user', text: answer }], answer, 0), [{ role: 'user', text: answer }]), false);
    const unrelated = [{ role: 'assistant', text: 'How old are you?' }, { role: 'user', text: answer }];
    assert.equal(supportedValue(column, value, locateSource(unrelated, answer, 1), unrelated), false);
  }
  for (const question of ['Are you not interested?', 'Is your friend interested?']) {
    const transcript = [{ role: 'assistant', text: question }, { role: 'user', text: 'Yes' }];
    assert.equal(supportedValue(columns[0], true, locateSource(transcript, 'Yes', 1), transcript), false);
  }
});

const feedbackText = 'Yes, please use English. The college comparison in the Free Discovery Consultation was useful, but the application deadlines were confusing. A simple one-page timeline after the session would improve it. I do not need a follow-up call.';
const feedbackColumns: ReviewColumn[] = ['Most useful part of consultation', 'Remaining confusion', 'Requested improvement'].map((label, index) => ({ key: `answer_${index + 1}`, label, type: 'text' }));
const feedbackValues = ['The college comparison in the Free Discovery Consultation was useful', 'the application deadlines were confusing', 'A simple one-page timeline after the session would improve it'];
const feedbackOutput = JSON.stringify({ answers: feedbackValues.map((value, index) => ({ key: feedbackColumns[index].key, state: 'proposed', value, quote: feedbackText.slice(25), turnIndex: 0 })) });
test('natural feedback text accepts complete exact clauses without borrowing unrelated uncertainty or dropping negation', () => {
  const fields = validateAnswers(feedbackOutput, feedbackColumns, [{ role: 'user', text: feedbackText }]);
  assert.deepEqual(fields.map(field => field.state), ['proposed', 'proposed', 'proposed']);
  assert.deepEqual(fields.map(field => field.value), feedbackValues);
  assert.equal(fields[0].sources[0].quote, feedbackText.slice(25));
  for (const [text, value] of [
    ['I am not interested.', 'interested'], ['My budget is 2500, maybe.', 'My budget is 2500'],
    ['I am interested, but not really.', 'I am interested'], ['I am interested. I am not interested.', 'I am interested'],
    [feedbackText, 'The college comparison was helpful'], [feedbackText, 'A simple one-page timeline after the session'],
  ]) {
    const result = validateAnswers(JSON.stringify({ answers: [{ key: 'feedback', state: 'proposed', value, quote: text, turnIndex: 0 }] }), [columns[4]], [{ role: 'user', text }]);
    assert.equal(result[0].state, 'unknown');
  }
});
test('saved AI receipt revalidation restores literal feedback proposals without inference or changing operator reviews', async () => {
  const fixture = await setup(); let calls = 0;
  const result = await extractCampaignResult(fixture.user, fixture.session.id, fake(answers(), async () => { calls++; }));
  const reviewed = await reviewCampaignResult(fixture.user, result.id, result.revision, [{ key: 'interested', status: 'accepted', value: false, quote: turns[0].text, turnIndex: 0 }]);
  const legacy = { ...reviewed, fields: reviewed.fields.map(field => field.review ? field : { ...field, state: 'unknown' as const, value: undefined, reason: 'Earlier validation' }) };
  await (await db()).run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify(legacy), result.id]);
  const next = await revalidateCampaignResult(fixture.user, result.id, legacy.revision);
  assert.equal(calls, 1); assert.equal(next.fields[1].state, 'proposed');
  assert.deepEqual(next.fields[0].review, reviewed.fields[0].review);
  assert.equal(next.originalModelText, result.originalModelText); assert.deepEqual(next.receipt, result.receipt);
  assert.equal((await revalidateCampaignResult(fixture.user, next.id, next.revision)).revision, next.revision);
  await assert.rejects(revalidateCampaignResult(fixture.user, next.id, legacy.revision), bad(409));
  await updateRecord(fixture.user, fixture.source, fixture.source.data, 'revoked');
  await assert.rejects(revalidateCampaignResult(fixture.user, next.id, next.revision), bad(409));
});
