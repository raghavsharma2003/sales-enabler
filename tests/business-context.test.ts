import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../lib/server/auth';
import { db, WriteConflictError } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { createContact } from '../lib/server/store';
import { createRecord, getRecord, listRecords, updateRecord, type PlatformRecord } from '../lib/platform/records';
import { assertBusinessIntentCurrent, createCampaignIntent, discoverBusinessContext, handleBusinessContextAction, listBusinessContext } from '../lib/business/engine';
import type { BusinessSignal, Offering } from '../lib/business/contracts';
import type { runAiTask } from '../lib/ai/task-router';
import { getActiveMembership } from '../lib/team/service';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const user: AuthUser = { id: 'business-user', email: 'business@example.test', organizationId: 'business-org', role: 'owner' };
const other: AuthUser = { id: 'business-other', email: 'business-other@example.test', organizationId: 'business-other-org', role: 'owner' };
const viewer: AuthUser = { id: 'business-viewer', email: 'business-viewer@example.test', organizationId: user.organizationId, role: 'viewer' };
const bad = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
const quote = 'Teams can book a product discovery workshop.';
const source = (account = user, content = `Overview. ${quote}`) => createRecord(account, 'brain_source', { title: randomUUID(), content, sourceLabel: 'Reviewed company note', authoredBy: account.id, approvedAt: new Date().toISOString(), approvedBy: account.id }, 'approved');
const offeringBody = (sourceId: string) => ({ name: 'Discovery workshop', kind: 'service', summary: 'A product discovery workshop.', audienceDescription: 'Product teams', sourceRefs: [{ sourceId, quote, start: -1, end: 999999 }], openQuestions: [] });
const signalBody = (sourceId: string) => ({ title: 'Workshop opportunity', observation: 'The company offers discovery workshops.', interpretation: 'A team might find a workshop helpful.', sourceRefs: [{ sourceId, quote }], uncertainty: ['Interest is unknown.'], suggestedAction: 'Ask whether a workshop would be useful.' });
const outcome = { label: 'Assess interest', evidenceRequired: ['Customer explicitly expresses interest.'] };
const intentBody = (offeringId: string, signalIds: string[] = []) => ({ schemaVersion: 1, offeringId, signalIds, outcome, audienceRationale: 'Operator selected this audience for discovery.', reviewColumns: [{ key: 'interested', label: 'Expressed interest', type: 'boolean' }] });
async function approvedOffering(sourceId: string): Promise<PlatformRecord<Offering>> {
  const draft = (await handleBusinessContextAction(user, { action: 'offering.create', ...offeringBody(sourceId) }) as { record: PlatformRecord<Offering> }).record;
  return (await handleBusinessContextAction(user, { action: 'offering.approve', id: draft.id, revision: draft.revision }) as { record: PlatformRecord<Offering> }).record;
}
const fake = (payload: unknown, hook?: () => Promise<void>) => (async () => { await hook?.(); return { text: JSON.stringify(payload), runId: 'mock-business-run', model: 'mock', usage: { inputTokens: 50, outputTokens: 100 }, cached: false }; }) as typeof runAiTask;

test('business context review and campaign intent boundaries', async t => {
  const database = await db(), now = new Date().toISOString();
  for (const account of [user, other]) {
    await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [account.organizationId, account.id, now]);
    await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [account.id, account.email, 'unused', account.organizationId, now]);
  }
  await getActiveMembership(user);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [viewer.id, viewer.email, 'unused', viewer.organizationId, now]);
  await database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [`team:member:${viewer.id}`, viewer.organizationId, 'team:member', 'active', JSON.stringify({ userId: viewer.id, email: viewer.email, role: 'viewer', status: 'active', updatedAt: now, authorizationVersion: randomUUID() }), now]);
  await t.test('server locates exact quotes; tenant boundary, viewer writes and fabricated quotes fail', async () => {
    const evidence = await source(), foreign = await source(other);
    const draft = (await handleBusinessContextAction(user, { action: 'offering.create', ...offeringBody(evidence.id) }) as { record: PlatformRecord<Offering> }).record;
    assert.equal(draft.status, 'draft'); assert.equal(draft.data.sourceRefs[0].start, 10);
    assert.equal(draft.data.sourceRefs[0].end, 10 + quote.length);
    await assert.rejects(handleBusinessContextAction(user, { action: 'offering.create', ...offeringBody(foreign.id) }), bad(404));
    await assert.rejects(handleBusinessContextAction(viewer, { action: 'offering.approve', id: draft.id, revision: draft.revision }), bad(403));
    await assert.rejects(handleBusinessContextAction(user, { action: 'offering.create', ...offeringBody(evidence.id), sourceRefs: [{ sourceId: evidence.id, quote: 'Fabricated claim.' }] }), bad(400));
    assert.equal((await listBusinessContext(other)).offerings.length, 0);
  });
  await t.test('unanswered questions and source changes block approval, edits reset review', async () => {
    const evidence = await source();
    let draft = (await handleBusinessContextAction(user, { action: 'offering.create', ...offeringBody(evidence.id), openQuestions: ['Who is this for?'] }) as { record: PlatformRecord<Offering> }).record;
    await assert.rejects(handleBusinessContextAction(user, { action: 'offering.approve', id: draft.id, revision: draft.revision }), bad(409));
    draft = (await handleBusinessContextAction(user, { action: 'offering.update', id: draft.id, revision: draft.revision, ...offeringBody(evidence.id) }) as { record: PlatformRecord<Offering> }).record;
    await updateRecord(user, evidence, { ...evidence.data, content: `Updated. ${quote}` }, 'approved');
    await assert.rejects(handleBusinessContextAction(user, { action: 'offering.approve', id: draft.id, revision: draft.revision }), bad(409));
    const approved = await approvedOffering(evidence.id);
    const changed = (await handleBusinessContextAction(user, { action: 'offering.update', id: approved.id, revision: approved.revision, ...offeringBody(evidence.id), summary: 'An operator correction.' }) as { record: PlatformRecord<Offering> }).record;
    assert.equal(changed.status, 'draft'); assert.equal(changed.data.reviewedBy, undefined);
  });
  await t.test('discovery commits only drafts atomically and repeat IDs reuse the proposal batch', async () => {
    const evidence = await source(); let calls = 0;
    const runner = fake({ offerings: [offeringBody(evidence.id)], signals: [signalBody(evidence.id)], questions: ['Which segment should the campaign address?'] }, async () => { calls++; });
    const body = { requestId: 'business-idempotent', sourceIds: [evidence.id] };
    const first = await discoverBusinessContext(user, body, runner), second = await discoverBusinessContext(user, body, runner);
    assert.deepEqual(first, second); assert.equal(calls, 1);
    assert.equal((await getRecord(user.organizationId, 'offering', first.offeringIds[0])).status, 'draft');
    const signal = await getRecord<BusinessSignal>(user.organizationId, 'business_signal', first.signalIds[0]);
    assert.equal(signal.status, 'proposed'); assert.equal(signal.data.contactId, undefined);
    await assert.rejects(discoverBusinessContext(user, { ...body, sourceIds: [(await source()).id] }, runner), bad(409));
    const count = (await listRecords(user.organizationId, 'offering')).length;
    await assert.rejects(discoverBusinessContext(user, { requestId: 'invalid-last-proposal', sourceIds: [evidence.id] }, fake({ offerings: [offeringBody(evidence.id)], signals: [{ ...signalBody(evidence.id), contactId: 'model-identity' }], questions: [] })), bad(502));
    assert.equal((await listRecords(user.organizationId, 'offering')).length, count);
  });
  await t.test('source revocation during inference cannot commit proposals or questions-only results', async () => {
    for (const questionsOnly of [false, true]) {
      const evidence = await source(), count = (await listRecords(user.organizationId, 'business_discovery')).length;
      await assert.rejects(discoverBusinessContext(user, { requestId: `source-race-${questionsOnly}`, sourceIds: [evidence.id] }, fake({ offerings: questionsOnly ? [] : [offeringBody(evidence.id)], signals: [], questions: ['Missing segment?'] }, async () => { await updateRecord(user, evidence, evidence.data, 'revoked'); })), bad(409));
      assert.equal((await listRecords(user.organizationId, 'business_discovery')).length, count);
    }
  });
  await t.test('optional AI signal text accepts null, omitted, empty and whitespace while required fields stay strict', async () => {
    const evidence = await source();
    for (const [index, value] of [null, undefined, '', ' \n\t '].entries()) {
      const result = await discoverBusinessContext(user, { requestId: `optional-signal-text-${index}`, sourceIds: [evidence.id] }, fake({ offerings: [], signals: [{ ...signalBody(evidence.id), interpretation: value, suggestedAction: value }], questions: [] }));
      const saved = await getRecord<BusinessSignal>(user.organizationId, 'business_signal', result.signalIds[0]);
      assert.equal(saved.data.interpretation, undefined);
      assert.equal(saved.data.suggestedAction, undefined);
    }
    for (const [index, value] of [false, {}, 'x'.repeat(1001)].entries()) {
      await assert.rejects(discoverBusinessContext(user, { requestId: `invalid-optional-signal-${index}`, sourceIds: [evidence.id] }, fake({ offerings: [], signals: [{ ...signalBody(evidence.id), suggestedAction: value }], questions: [] })), bad(400));
    }
    await assert.rejects(discoverBusinessContext(user, { requestId: 'required-signal-text-null', sourceIds: [evidence.id] }, fake({ offerings: [], signals: [{ ...signalBody(evidence.id), observation: null }], questions: [] })), bad(400));
    await assert.rejects(discoverBusinessContext(user, { requestId: 'source-signal-quote-null', sourceIds: [evidence.id] }, fake({ offerings: [], signals: [{ ...signalBody(evidence.id), sourceRefs: [{ sourceId: evidence.id, quote: null }] }], questions: [] })), bad(400));
  });
  await t.test('discovery accepts the observed two-line suggestedAction shape without relaxing manual signals', async () => {
    const evidence = await source();
    const lines = [' Ask whether a workshop would be helpful.', 'Record the answer for operator review. '];
    const result = await discoverBusinessContext(user, { requestId: 'observed-discovery-suggested-array', sourceIds: [evidence.id] }, fake({ offerings: [offeringBody(evidence.id), { ...offeringBody(evidence.id), name: 'Team discovery workshop' }], signals: [{ ...signalBody(evidence.id), interpretation: 'The workshop may be useful for a product team; interest is not established.', suggestedAction: lines }], questions: [] }));
    assert.equal(result.offeringIds.length, 2);
    const signal = await getRecord<BusinessSignal>(user.organizationId, 'business_signal', result.signalIds[0]);
    assert.equal(signal.data.suggestedAction, lines.join('\n'));
    for (const [index, invalid] of [[], [''], ['   '], [42], [{ text: 'action' }], ['Valid', null], Array(7).fill('Action'), ['x'.repeat(501), 'y'.repeat(500)]].entries()) {
      await assert.rejects(discoverBusinessContext(user, { requestId: `invalid-discovery-action-array-${index}`, sourceIds: [evidence.id] }, fake({ offerings: [], signals: [{ ...signalBody(evidence.id), suggestedAction: invalid }], questions: [] })), bad(502));
    }
    await assert.rejects(handleBusinessContextAction(user, { action: 'signal.create', ...signalBody(evidence.id), suggestedAction: lines }), bad(400));
    await assert.rejects(discoverBusinessContext(user, { requestId: 'discovery-interpretation-array-rejected', sourceIds: [evidence.id] }, fake({ offerings: [], signals: [{ ...signalBody(evidence.id), interpretation: ['Unsupported shape'] }], questions: [] })), bad(400));
  });
  await t.test('private structured customer data is excluded even after the first line', async () => {
    const evidence = await source(user, `${quote}\nName: Fictional Person; Email: fictional@example.test; Stage: lead`);
    assert.ok(!(await listBusinessContext(user)).sources.some(item => item.id === evidence.id));
    await assert.rejects(discoverBusinessContext(user, { requestId: 'private-context', sourceIds: [evidence.id] }, fake({ offerings: [], signals: [], questions: [] })), bad(409));
    await assert.rejects(handleBusinessContextAction(user, { action: 'clarification.create', title: 'Customer', content: 'Name: Fictional Person; Email: fictional@example.test' }), bad(400));
  });
  await t.test('clarification is attributed draft evidence until explicit review', async () => {
    const result = await handleBusinessContextAction(user, { action: 'clarification.create', title: 'Founder offering clarification', content: 'The workshop includes a facilitated team discussion.' }) as { source: PlatformRecord };
    assert.equal(result.source.status, 'draft'); assert.equal(result.source.data.authoredBy, user.id);
    assert.ok(!(await listBusinessContext(user)).sources.some(item => item.id === result.source.id));
    const approved = await handleBusinessContextAction(user, { action: 'clarification.approve', sourceId: result.source.id, revision: result.source.revision }) as { source: PlatformRecord };
    assert.equal(approved.source.status, 'approved'); assert.equal(approved.source.data.approvedBy, user.id);
  });
  await t.test('signal customer bindings require canonical tenant records and explicit audience selection', async () => {
    const evidence = await source(), offering = await approvedOffering(evidence.id);
    const customer = await createContact(user, { name: 'Fictional Customer', email: 'fictional-customer@example.test', stage: 'New', notes: '' });
    const foreign = await createContact(other, { name: 'Foreign Fictional', email: 'foreign@example.test', stage: 'New', notes: '' });
    const draft = (await handleBusinessContextAction(user, { action: 'signal.create', ...signalBody(evidence.id) }) as { record: PlatformRecord<BusinessSignal> }).record;
    await assert.rejects(handleBusinessContextAction(user, { action: 'signal.review', id: draft.id, revision: draft.revision, status: 'approved', contactId: foreign.id }), bad(404));
    const approved = (await handleBusinessContextAction(user, { action: 'signal.review', id: draft.id, revision: draft.revision, status: 'approved', contactId: customer.id, offeringId: offering.id }) as { record: PlatformRecord<BusinessSignal> }).record;
    await assert.rejects(createCampaignIntent(user, intentBody(offering.id, [approved.id]), []), bad(400));
    const intent = await createCampaignIntent(user, intentBody(offering.id, [approved.id]), [customer.id]);
    assert.equal(intent.reviewedBy, user.id); assert.equal(intent.signalAnchors.length, 1);
    await database.batch(await assertBusinessIntentCurrent(user, intent));
    await handleBusinessContextAction(user, { action: 'signal.review', id: approved.id, revision: approved.revision, status: 'dismissed' });
    await assert.rejects(assertBusinessIntentCurrent(user, intent), bad(409));
  });
  await t.test('intent rejects draft offerings, unsafe columns and source revocation; fences catch later retirement', async () => {
    const evidence = await source(), offering = await approvedOffering(evidence.id);
    await assert.rejects(createCampaignIntent(user, { ...intentBody(offering.id), reviewColumns: [{ key: 'constructor', label: 'Unsafe', type: 'text' }] }, []), bad(400));
    await assert.rejects(createCampaignIntent(user, { ...intentBody(offering.id), outcome: { label: 'Outcome', evidenceRequired: [] } }, []), bad(400));
    const intent = await createCampaignIntent(user, intentBody(offering.id), []);
    const fences = await assertBusinessIntentCurrent(user, intent);
    await handleBusinessContextAction(user, { action: 'offering.retire', id: offering.id, revision: offering.revision });
    await assert.rejects(database.batch(fences), error => error instanceof WriteConflictError);
    await assert.rejects(assertBusinessIntentCurrent(user, intent), bad(409));
    const fresh = await approvedOffering(evidence.id), freshIntent = await createCampaignIntent(user, intentBody(fresh.id), []);
    await updateRecord(user, evidence, evidence.data, 'revoked');
    await assert.rejects(assertBusinessIntentCurrent(user, freshIntent), bad(409));
  });
  await t.test('approval transaction rejects a source edit after prevalidation', async () => {
    const evidence = await source();
    const draft = (await handleBusinessContextAction(user, { action: 'offering.create', ...offeringBody(evidence.id) }) as { record: PlatformRecord<Offering> }).record;
    const original = database.batch;
    let injected = false;
    database.batch = async statements => {
      if (!injected && statements.some(statement => statement.params?.includes(draft.id) && statement.sql.startsWith('UPDATE entities SET data=?'))) {
        injected = true;
        await database.run('UPDATE entities SET status=? WHERE id=? AND organization_id=?', ['revoked', evidence.id, user.organizationId]);
      }
      return original(statements);
    };
    try { await assert.rejects(handleBusinessContextAction(user, { action: 'offering.approve', id: draft.id, revision: draft.revision }), bad(409)); }
    finally { database.batch = original; }
    assert.equal((await getRecord(user.organizationId, 'offering', draft.id)).status, 'draft');
  });
  await t.test('a stale owner role cannot create, approve, bind intent or start inference; viewers retain reads', async () => {
    const evidence = await source(), offering = await approvedOffering(evidence.id);
    const staleActor = { ...viewer, role: 'owner' as const };
    await assert.rejects(handleBusinessContextAction(staleActor, { action: 'offering.create', ...offeringBody(evidence.id) }), bad(403));
    await assert.rejects(handleBusinessContextAction(staleActor, { action: 'offering.retire', id: offering.id, revision: offering.revision }), bad(403));
    await assert.rejects(createCampaignIntent(staleActor, intentBody(offering.id), []), bad(403));
    let inferenceCalls = 0;
    await assert.rejects(discoverBusinessContext(staleActor, { requestId: 'stale-actor', sourceIds: [evidence.id] }, fake({ offerings: [], signals: [], questions: [] }, async () => { inferenceCalls++; })), bad(403));
    assert.equal(inferenceCalls, 0);
    assert.ok((await listBusinessContext(viewer)).offerings.some(record => record.id === offering.id));
  });
  await t.test('demotion after review validation rolls back approval and its audit', async () => {
    const evidence = await source();
    const draft = (await handleBusinessContextAction(user, { action: 'offering.create', ...offeringBody(evidence.id) }) as { record: PlatformRecord<Offering> }).record;
    const [member] = await database.all('SELECT data FROM entities WHERE id=?', [`team:member:${user.id}`]);
    const original = database.batch;
    let injected = false;
    database.batch = async statements => {
      if (!injected && statements.some(statement => statement.params?.includes(draft.id) && statement.sql.startsWith('UPDATE entities SET data=?'))) {
        injected = true;
        await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(member.data)), role: 'viewer', authorizationVersion: randomUUID() }), `team:member:${user.id}`]);
      }
      return original(statements);
    };
    try { await assert.rejects(handleBusinessContextAction(user, { action: 'offering.approve', id: draft.id, revision: draft.revision }), bad(409)); }
    finally { database.batch = original; await database.run('UPDATE entities SET data=? WHERE id=?', [String(member.data), `team:member:${user.id}`]); }
    assert.equal((await getRecord(user.organizationId, 'offering', draft.id)).status, 'draft');
    assert.equal((await database.all('SELECT id FROM audit_events WHERE entity_id=? AND event=?', [draft.id, 'offering.reviewed:approved:r2'])).length, 0);
  });
  await t.test('demotion during inference cannot commit the discovery batch', async () => {
    const evidence = await source(), count = (await listRecords(user.organizationId, 'business_discovery')).length;
    const [member] = await database.all('SELECT data FROM entities WHERE id=?', [`team:member:${user.id}`]);
    try {
      await assert.rejects(discoverBusinessContext(user, { requestId: 'demotion-during-inference', sourceIds: [evidence.id] }, fake({ offerings: [offeringBody(evidence.id)], signals: [], questions: [] }, async () => {
        await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(member.data)), role: 'viewer', authorizationVersion: randomUUID() }), `team:member:${user.id}`]);
      })), bad(403));
    } finally { await database.run('UPDATE entities SET data=? WHERE id=?', [String(member.data), `team:member:${user.id}`]); }
    assert.equal((await listRecords(user.organizationId, 'business_discovery')).length, count);
  });
});
