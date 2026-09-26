import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { getEntity, insertEntity, listEntities, transition } from '../lib/server/store';
import { analyzeConversation, applyConversationAnalysis, listConversationAnalyses, type FeedbackRunner } from '../lib/learning/engine';
import { validateLearningProposal } from '../lib/learning/validation';
import { isExplicitFollowUpDecline } from '../lib/learning/policy';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;

async function user(label: string) {
  const database = await db(), now = new Date().toISOString();
  const account = { id: randomUUID(), email: `${label}@example.test`, organizationId: randomUUID() };
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [account.organizationId, label, now]);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [account.id, account.email, 'x', account.organizationId, now]);
  return account;
}
const output = (candidates: Record<string, unknown>[]) => JSON.stringify({ candidates });
const candidate = (type: string, quote: string, turnIndex = 0) => ({ type, title: 'Review request', content: quote, why: 'The caller said this explicitly.', quote, turnIndex });

test('Room-derived authority validator accepts only exact caller-origin spans', () => {
  const turns = [{ role: 'user' as const, text: 'Please email the updated plan.' }, { role: 'assistant' as const, text: 'I booked your flight.' }];
  const result = validateLearningProposal(output([
    candidate('commitment_request', 'Please email the updated plan.'),
    candidate('commitment_request', 'I booked your flight.', 1),
    candidate('feedback_theme', 'Please email the plan.'),
  ]), turns, [0]);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0].sourceRef, { turnIndex: 0, start: 0, end: 30 });
  assert.equal(result.candidates[0].destination, 'manual_action_review');
  const sharedQuote = validateLearningProposal(output([
    { ...candidate('explicit_preference', 'Please use Hinglish and one question at a time.'), title: 'Language', content: 'Caller asks for Hinglish.' },
    { ...candidate('explicit_preference', 'Please use Hinglish and one question at a time.'), title: 'Pacing', content: 'Caller asks for one question at a time.' },
  ]), [{ role: 'user', text: 'Please use Hinglish and one question at a time.' }], [0], 'contact-1');
  assert.equal(sharedQuote.candidates.length, 2);
});

test('analysis is tenant scoped, request idempotent, and application creates only proposed contact memory and manual action', async () => {
  const owner = await user('learning-owner');
  const outsider = await user('learning-outsider');
  const contact = await insertEntity(owner, 'contact', { name: 'Sample caller' });
  const session = await insertEntity(owner, 'session', { contactId: contact.id, transcript: [
    { role: 'user', text: 'I prefer email. Please send me a written timeline.' },
    { role: 'assistant', text: 'Done, I have sent it.' },
  ] });
  let calls = 0;
  const runner: FeedbackRunner = async (_user, input) => {
    calls++;
    assert.equal(input.task, 'feedback');
    assert.equal(input.responseFormat, 'json_object');
    assert.match(input.system, /assistant speech and promises never establish customer facts/);
    return { text: output([
      candidate('explicit_preference', 'I prefer email.'),
      candidate('commitment_request', 'Please send me a written timeline.'),
      candidate('correction', 'Done, I have sent it.', 1),
    ]) };
  };
  const first = await analyzeConversation(owner, session.id, 'request-one', runner);
  assert.equal(first.data.candidates.length, 2);
  assert.equal((await analyzeConversation(owner, session.id, 'request-one', runner)).id, first.id);
  assert.equal(calls, 1);
  await assert.rejects(listConversationAnalyses(outsider, session.id), (error: unknown) => error instanceof HttpError && error.status === 404);
  await assert.rejects(applyConversationAnalysis(outsider, first.id, first.revision, [first.data.candidates[0].id]), (error: unknown) => error instanceof HttpError && error.status === 404);
  const applied = await applyConversationAnalysis(owner, first.id, first.revision, first.data.candidates.map(value => value.id));
  assert.equal(applied.applied.length, 2);
  assert.equal((await applyConversationAnalysis(owner, first.id, first.revision, first.data.candidates.map(value => value.id))).applied.length, 2);
  const memories = await listEntities(owner.organizationId, 'memory'), actions = await listEntities(owner.organizationId, 'action');
  assert.equal(memories.length, 1); assert.equal(actions.length, 1);
  assert.equal(memories[0].status, 'proposed'); assert.equal(actions[0].status, 'proposed');
  assert.equal(memories[0].contactId, contact.id);
  assert.equal(memories[0].sourceQuote, 'I prefer email.');
  assert.equal(actions[0].execution, 'manual');
});

test('caller correction remains a proposed contact memory with explicit review flag', async () => {
  const owner = await user('learning-correction');
  const contact = await insertEntity(owner, 'contact', { name: 'Sample caller' });
  const session = await insertEntity(owner, 'session', { contactId: contact.id, transcript: [{ role: 'user', text: 'I need the evening class, not morning.' }] });
  const analysis = await analyzeConversation(owner, session.id, 'correction-one', async () => ({ text: output([candidate('correction', 'I need the evening class, not morning.')]) }));
  const applied = await applyConversationAnalysis(owner, analysis.id, analysis.revision, [analysis.data.candidates[0].id]);
  const memory = await getEntity(owner.organizationId, 'memory', applied.applied[0]);
  assert.equal(memory.status, 'proposed');
  assert.equal(memory.correctionRequiresReview, true);
});

test('changed session while model awaits commits no analysis evidence', async () => {
  const owner = await user('learning-change');
  const session = await insertEntity(owner, 'session', { transcript: [{ role: 'user', text: 'The call was too late.' }] });
  const runner: FeedbackRunner = async () => {
    const database = await db();
    await database.run('UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=?', [JSON.stringify({ transcript: [{ role: 'user', text: 'The call was moved.' }] }), session.id, owner.organizationId, 'session']);
    return { text: output([candidate('practical_concern', 'The call was too late.')]) };
  };
  await assert.rejects(analyzeConversation(owner, session.id, 'source-change', runner), (error: unknown) => error instanceof HttpError && error.status === 409);
  const analyses = await listConversationAnalyses(owner, session.id);
  assert.equal(analyses[0].status, 'stale');
  assert.equal(analyses[0].data.candidates.length, 0);
});

test('concurrent review writes one proposed action; private feedback remains conversation-linked', async () => {
  const owner = await user('learning-concurrency');
  const session = await insertEntity(owner, 'session', { transcript: [{ role: 'user', text: 'The process was confusing. Please explain the next step.' }] });
  const analysis = await analyzeConversation(owner, session.id, 'concurrent-one', async () => ({ text: output([
    candidate('feedback_theme', 'The process was confusing.'),
    candidate('commitment_request', 'Please explain the next step.'),
  ]) }));
  const ids = analysis.data.candidates.map(value => value.id);
  const outcomes = await Promise.allSettled([
    applyConversationAnalysis(owner, analysis.id, analysis.revision, ids),
    applyConversationAnalysis(owner, analysis.id, analysis.revision, ids),
  ]);
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length >= 1, true);
  assert.equal((await listEntities(owner.organizationId, 'action')).length, 1);
  assert.equal((await listEntities(owner.organizationId, 'memory')).length, 0);
  assert.equal((await listEntities(owner.organizationId, 'knowledge')).length, 0);
  assert.equal((await listConversationAnalyses(owner, session.id))[0].data.candidates.every(value => value.status === 'applied'), true);
});

test('learning memory approval rechecks the exact current caller source', async () => {
  const owner = await user('learning-approval');
  const contact = await insertEntity(owner, 'contact', { name: 'Sample caller' });
  async function proposed(suffix: string) {
    const session = await insertEntity(owner, 'session', { contactId: contact.id, transcript: [
      { role: 'user', text: 'I prefer an evening appointment.' },
      { role: 'assistant', text: 'The booking is complete.' },
    ] });
    const analysis = await analyzeConversation(owner, session.id, `approval-${suffix}`, async () => ({ text: output([
      candidate('explicit_preference', 'I prefer an evening appointment.'),
    ]) }));
    const applied = await applyConversationAnalysis(owner, analysis.id, analysis.revision, [analysis.data.candidates[0].id]);
    return { session, memoryId: applied.applied[0] };
  }
  const intact = await proposed('intact');
  assert.equal((await transition(owner, 'memory', intact.memoryId, 'approved')).status, 'approved');
  const revised = await proposed('revised');
  await (await db()).run('UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=?', [JSON.stringify({ contactId: contact.id, transcript: [{ role: 'user', text: 'I prefer a morning appointment.' }] }), revised.session.id, owner.organizationId, 'session']);
  await assert.rejects(transition(owner, 'memory', revised.memoryId, 'approved'), (error: unknown) => error instanceof HttpError && error.status === 409);
  assert.equal((await getEntity(owner.organizationId, 'memory', revised.memoryId)).status, 'proposed');
  const deleted = await proposed('deleted');
  await (await db()).run('DELETE FROM entities WHERE id=? AND organization_id=? AND kind=?', [deleted.session.id, owner.organizationId, 'session']);
  await assert.rejects(transition(owner, 'memory', deleted.memoryId, 'approved'), (error: unknown) => error instanceof HttpError && error.status === 409);
  const assistant = await proposed('assistant');
  const memory = await getEntity(owner.organizationId, 'memory', assistant.memoryId);
  const { id: _id, createdAt: _createdAt, status: _status, ...stored } = memory;
  await (await db()).run('UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=?', [JSON.stringify({ ...stored, sourceRef: { turnIndex: 1, start: 0, end: 24 }, sourceQuote: 'The booking is complete.' }), assistant.memoryId, owner.organizationId, 'memory']);
  await assert.rejects(transition(owner, 'memory', assistant.memoryId, 'approved'), (error: unknown) => error instanceof HttpError && error.status === 409);
  const foreign = await proposed('foreign');
  const outsider = await user('learning-approval-foreign');
  const otherSession = await insertEntity(outsider, 'session', { transcript: [{ role: 'user', text: 'I prefer an evening appointment.' }] });
  const foreignMemory = await getEntity(owner.organizationId, 'memory', foreign.memoryId);
  const { id: _fid, createdAt: _fcreatedAt, status: _fstatus, ...foreignStored } = foreignMemory;
  await (await db()).run('UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=?', [JSON.stringify({ ...foreignStored, sourceSessionId: otherSession.id }), foreign.memoryId, owner.organizationId, 'memory']);
  await assert.rejects(transition(owner, 'memory', foreign.memoryId, 'approved'), (error: unknown) => error instanceof HttpError && error.status === 409);
});

test('operator can correct grounded model destinations without another analysis or gaining authority', async () => {
  const owner = await user('learning-overrides');
  const contact = await insertEntity(owner, 'contact', { name: 'Sample caller' });
  const session = await insertEntity(owner, 'session', { contactId: contact.id, transcript: [
    { role: 'user', text: 'Haan, Hinglish please. Please ask just one question at a time.' },
    { role: 'user', text: 'Please have a counsellor follow up with a simple comparison list.' },
    { role: 'assistant', text: 'I already sent the comparison.' },
  ] });
  let calls = 0;
  const analysis = await analyzeConversation(owner, session.id, 'override-ready', async () => { calls++; return { text: output([
    { ...candidate('practical_concern', 'Hinglish please.'), content: 'Caller requests Hinglish.' },
    { ...candidate('feedback_theme', 'Please have a counsellor follow up with a simple comparison list.', 1), content: 'Caller requests a counsellor comparison follow-up.' },
  ]) }; });
  const [preference, followUp] = analysis.data.candidates;
  const reviews = [
    { candidateId: preference.id, reviewedType: 'explicit_preference' as const, destination: 'customer_memory_review' as const },
    { candidateId: followUp.id, reviewedType: 'commitment_request' as const, destination: 'manual_action_review' as const },
  ];
  await assert.rejects(applyConversationAnalysis(owner, analysis.id, analysis.revision, [preference.id], [
    { ...reviews[0], quote: 'I already sent the comparison.' } as unknown as typeof reviews[0],
  ]), (error: unknown) => error instanceof HttpError && error.status === 400);
  const result = await applyConversationAnalysis(owner, analysis.id, analysis.revision, [preference.id, followUp.id], reviews);
  assert.equal(calls, 1);
  assert.equal(result.applied.length, 2);
  assert.equal(result.analysis.data.candidates[0].type, 'practical_concern');
  assert.equal(result.analysis.data.candidates[0].reviewedType, 'explicit_preference');
  const memory = await getEntity(owner.organizationId, 'memory', result.applied.find(id => id.startsWith('learning-memory:'))!);
  const action = await getEntity(owner.organizationId, 'action', result.applied.find(id => id.startsWith('learning-action:'))!);
  assert.equal(memory.status, 'proposed'); assert.equal(action.status, 'proposed');
  assert.equal(memory.sourceQuote, 'Hinglish please.');
  assert.equal(memory.originalModelType, 'practical_concern');
  assert.equal(memory.reviewedType, 'explicit_preference');
  assert.equal(action.sourceQuote, 'Please have a counsellor follow up with a simple comparison list.');
  assert.equal(action.originalModelType, 'feedback_theme');
  assert.equal(action.reviewedType, 'commitment_request');
  assert.equal((await applyConversationAnalysis(owner, analysis.id, analysis.revision, [preference.id, followUp.id], reviews)).applied.length, 2);
  const overrides = await (await db()).all('SELECT event FROM audit_events WHERE organization_id=? AND entity_id=? AND event LIKE ?', [owner.organizationId, analysis.id, 'conversation.analysis.review_override:%']);
  assert.equal(overrides.length, 2);
});

test('review override cannot create a customer memory without a linked contact', async () => {
  const owner = await user('learning-override-unbound');
  const session = await insertEntity(owner, 'session', { transcript: [{ role: 'user', text: 'Hinglish please.' }] });
  const analysis = await analyzeConversation(owner, session.id, 'unbound', async () => ({ text: output([candidate('feedback_theme', 'Hinglish please.')]) }));
  const card = analysis.data.candidates[0];
  await assert.rejects(applyConversationAnalysis(owner, analysis.id, analysis.revision, [card.id], [
    { candidateId: card.id, reviewedType: 'explicit_preference', destination: 'customer_memory_review' },
  ]), (error: unknown) => error instanceof HttpError && error.status === 400);
  assert.equal((await listEntities(owner.organizationId, 'memory')).length, 0);
});

test('review override cannot promote assistant-origin or unsupported destination evidence', async () => {
  const owner = await user('learning-override-authority');
  const session = await insertEntity(owner, 'session', { transcript: [
    { role: 'user', text: 'Please send a comparison.' },
    { role: 'assistant', text: 'I already sent the comparison.' },
  ] });
  const analysis = await analyzeConversation(owner, session.id, 'override-authority', async () => ({ text: output([candidate('feedback_theme', 'Please send a comparison.')]) }));
  const card = analysis.data.candidates[0];
  await assert.rejects(applyConversationAnalysis(owner, analysis.id, analysis.revision, [card.id], [
    { candidateId: card.id, destination: 'approved_memory' as 'customer_memory_review' },
  ]), (error: unknown) => error instanceof HttpError && error.status === 400);
  const database = await db();
  const [row] = await database.all('SELECT data FROM entities WHERE id=? AND organization_id=? AND kind=?', [analysis.id, owner.organizationId, 'platform:conversation_analysis']);
  const stored = JSON.parse(String(row.data));
  stored.data.candidates[0].sourceRef = { turnIndex: 1, start: 0, end: 30 };
  stored.data.candidates[0].quote = 'I already sent the comparison.';
  await database.run('UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=?', [JSON.stringify(stored), analysis.id, owner.organizationId, 'platform:conversation_analysis']);
  await assert.rejects(applyConversationAnalysis(owner, analysis.id, analysis.revision, [card.id], [
    { candidateId: card.id, reviewedType: 'commitment_request', destination: 'manual_action_review' },
  ]), (error: unknown) => error instanceof HttpError && error.status === 409);
  assert.equal((await listEntities(owner.organizationId, 'action')).length, 0);
});

test('explicitly declined follow-up cannot become a manual action, including from a stored model verdict', async () => {
  assert.equal(isExplicitFollowUpDecline('I do not need a follow-up call.'), true);
  assert.equal(isExplicitFollowUpDecline("I don't want any call."), true);
  assert.equal(isExplicitFollowUpDecline('No follow-up please.'), true);
  assert.equal(isExplicitFollowUpDecline("Don't hesitate to call."), false);
  assert.equal(isExplicitFollowUpDecline('I did not receive a follow-up call.'), false);
  const owner = await user('learning-declined-followup');
  const session = await insertEntity(owner, 'session', { transcript: [{ role: 'user', text: 'I do not need a follow-up call.' }] });
  const analysis = await analyzeConversation(owner, session.id, 'declined-followup', async () => ({ text: output([
    { ...candidate('commitment_request', 'I do not need a follow-up call.'), title: 'No follow-up call requested', content: 'Caller does not request a follow-up call.' },
  ]) }));
  const card = analysis.data.candidates[0];
  assert.equal(card.type, 'commitment_request');
  assert.equal(card.destination, 'manual_action_review');
  await assert.rejects(applyConversationAnalysis(owner, analysis.id, analysis.revision, [card.id]),
    (error: unknown) => error instanceof HttpError && error.status === 409 && /explicitly declines follow-up/.test(error.message));
  await assert.rejects(applyConversationAnalysis(owner, analysis.id, analysis.revision, [card.id], [
    { candidateId: card.id, reviewedType: 'commitment_request', destination: 'manual_action_review' },
  ]), (error: unknown) => error instanceof HttpError && error.status === 409);
  assert.equal((await listEntities(owner.organizationId, 'action')).length, 0);
  const kept = await applyConversationAnalysis(owner, analysis.id, analysis.revision, [card.id], [
    { candidateId: card.id, destination: 'feedback_evidence' },
  ]);
  assert.equal(kept.applied.length, 0);
  assert.equal(kept.analysis.data.candidates[0].type, 'commitment_request');
  assert.equal(kept.analysis.data.candidates[0].quote, 'I do not need a follow-up call.');
  assert.equal(kept.analysis.data.candidates[0].reviewedDestination, 'feedback_evidence');
});
