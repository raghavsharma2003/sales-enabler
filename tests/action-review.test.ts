import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { db, type Database } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { insertEntity, getEntity } from '../lib/server/store';
import { getRecord, listRecords } from '../lib/platform/records';
import { handleCustomerAction } from '../lib/platform/customer-ops';
import { inspectAction, reviewAction } from '../lib/platform/action-review';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const status = (expected: number) => (error: unknown) => error instanceof HttpError && error.status === expected;
async function account() {
  const user = { id: randomUUID(), organizationId: randomUUID(), email: `${randomUUID()}@example.test` }, now = new Date().toISOString(), store = await db();
  await store.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [user.organizationId, 'Review fixture', now]);
  await store.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [user.id, user.email, 'fixture', user.organizationId, now]);
  return user;
}
async function fixture() {
  const user = await account();
  const contact = await insertEntity(user, 'contact', { name: 'Fictional caller' });
  const quote = 'Please send me the written timeline.';
  const session = await insertEntity(user, 'session', { contactId: contact.id, transcript: [{ role: 'user', text: quote }] });
  const [row] = await (await db()).all('SELECT data FROM entities WHERE id=?', [session.id]);
  const action = await insertEntity(user, 'action', { contactId: contact.id, title: 'Prepare a timeline', description: 'Review the request and prepare the document.', execution: 'manual', sourceSessionId: session.id,
    sourceDigest: hash(String(row.data)), sourceQuote: quote, sourceRef: { turnIndex: 0, start: 0, end: quote.length } }, 'proposed');
  const review = await inspectAction(user, action.id);
  const body = { actionId: action.id, reviewToken: review.reviewToken, decision: 'accept', title: 'Prepare reviewed timeline', description: 'Prepare the document; record sending separately.', dueDate: '2026-10-01', ownerId: user.id };
  return { user, contact, session, action, quote, review, body };
}

test('reviewed learning follow-up becomes one owned commitment and uses the existing completion lifecycle', async () => {
  const f = await fixture();
  assert.equal(f.review.evidence.current, true);
  assert.equal(f.review.evidence.quote, f.quote);
  const results = await Promise.all([reviewAction(f.user, f.body), reviewAction(f.user, f.body)]);
  assert.equal(results[0].commitmentId, results[1].commitmentId);
  assert.equal((await reviewAction(f.user, f.body)).commitmentId, results[0].commitmentId);
  assert.equal((await listRecords(f.user.organizationId, 'commitment')).length, 1);
  const task = await getRecord(f.user.organizationId, 'commitment', results[0].commitmentId!);
  assert.equal(task.status, 'open'); assert.equal(task.data.ownerId, f.user.id); assert.equal(task.data.contactId, f.contact.id);
  assert.equal(task.data.sourceActionId, f.action.id); assert.equal(task.data.sourceQuote, f.quote);
  assert.equal((await getEntity(f.user.organizationId, 'action', f.action.id)).status, 'converted');
  await handleCustomerAction(f.user, 'commitment.complete', { commitmentId: task.id, revision: task.revision, completionNote: 'Prepared the reviewed document.' });
  const completed = await getRecord(f.user.organizationId, 'commitment', task.id);
  assert.equal(completed.status, 'completed'); assert.equal(completed.data.notification, undefined);
  await assert.rejects(reviewAction(f.user, { ...f.body, dueDate: '2026-10-02' }), status(409));
});

test('legacy staff-authored proposals remain actionable without pretending to have caller evidence', async () => {
  const user = await account(), action = await insertEntity(user, 'action', { title: 'Check brochure', description: 'A staff suggestion', execution: 'manual' }, 'approved');
  const review = await inspectAction(user, action.id);
  assert.equal(review.evidence.kind, 'manual'); assert.equal(review.evidence.current, true); assert.equal(review.evidence.quote, undefined);
  const result = await reviewAction(user, { actionId: action.id, reviewToken: review.reviewToken, decision: 'accept', title: action.title, description: action.description, dueDate: '2026-11-01' });
  assert.equal((await getRecord(user.organizationId, 'commitment', result.commitmentId!)).data.ownerId, user.id);
});

test('tenant isolation, explicit owner authority and real calendar dates are enforced', async () => {
  const f = await fixture(), outsider = await account();
  await assert.rejects(inspectAction(outsider, f.action.id), status(404));
  await assert.rejects(reviewAction(outsider, { ...f.body, ownerId: outsider.id }), status(404));
  await assert.rejects(reviewAction(f.user, { ...f.body, ownerId: outsider.id }), status(403));
  await assert.rejects(reviewAction(f.user, { ...f.body, dueDate: '2026-02-30' }), status(400));
  assert.equal((await listRecords(f.user.organizationId, 'commitment')).length, 0);
});

test('changed caller evidence blocks acceptance but permits an explicit idempotent rejection', async () => {
  const f = await fixture(), store = await db();
  await store.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ contactId: f.contact.id, transcript: [{ role: 'user', text: 'Please do not send anything.' }] }), f.session.id]);
  assert.equal((await inspectAction(f.user, f.action.id)).evidence.current, false);
  await assert.rejects(reviewAction(f.user, f.body), status(409));
  const rejected = { actionId: f.action.id, reviewToken: f.review.reviewToken, decision: 'reject', reason: 'Customer withdrew the request.' };
  assert.equal((await reviewAction(f.user, rejected)).status, 'dismissed');
  assert.equal((await reviewAction(f.user, rejected)).status, 'dismissed');
  assert.equal((await listRecords(f.user.organizationId, 'commitment')).length, 0);
});

test('assistant-origin or incomplete learning evidence cannot be promoted', async () => {
  const f = await fixture(), store = await db();
  const raw = JSON.stringify({ contactId: f.contact.id, transcript: [{ role: 'assistant', text: f.quote }] });
  await store.run('UPDATE entities SET data=? WHERE id=?', [raw, f.session.id]);
  const action = await getEntity(f.user.organizationId, 'action', f.action.id);
  const { id: _id, createdAt: _date, status: _status, ...data } = action;
  await store.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...data, sourceDigest: hash(raw) }), f.action.id]);
  const review = await inspectAction(f.user, f.action.id);
  assert.equal(review.evidence.current, false);
  await assert.rejects(reviewAction(f.user, { ...f.body, reviewToken: review.reviewToken }), status(409));
  await store.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...data, sourceDigest: undefined }), f.action.id]);
  const incomplete = await inspectAction(f.user, f.action.id);
  await assert.rejects(reviewAction(f.user, { ...f.body, reviewToken: incomplete.reviewToken }), status(409));
});

test('source and proposal preimages are fenced inside the conversion transaction', async () => {
  for (const target of ['source', 'action']) {
    const f = await fixture(), store = await db();
    let changed = false;
    const racing: Database = { all: store.all.bind(store), run: store.run.bind(store), batch: async statements => {
      if (!changed) {
        changed = true;
        if (target === 'source') await store.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ contactId: f.contact.id, transcript: [] }), f.session.id]);
        else await store.run('UPDATE entities SET status=? WHERE id=?', ['dismissed', f.action.id]);
      }
      return store.batch(statements);
    } };
    await assert.rejects(reviewAction(f.user, f.body, racing), status(409));
    assert.equal((await listRecords(f.user.organizationId, 'commitment')).length, 0);
    const action = await getEntity(f.user.organizationId, 'action', f.action.id);
    assert.equal(action.status, target === 'source' ? 'proposed' : 'dismissed');
    assert.equal(action.reviewReceipt, undefined);
  }
});
