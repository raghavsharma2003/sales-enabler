import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db, type Database } from '../lib/server/db';
import { createIngestionSource } from '../lib/ingestion/engine';
import { createContact, listEntities } from '../lib/server/store';
import { listRecords } from '../lib/platform/records';
import { HttpError } from '../lib/server/http';
import { applyIntake, loadIntakeReview, listIntakeReviews, previewIntake, saveIntakeReview } from '../lib/data-intake/service';
import { parseIntakeTable } from '../lib/data-intake/table';
import type { ColumnMapping, IntakePreview, RowDecision } from '../lib/data-intake/contracts';
import { authenticate } from '../lib/server/auth';
import { POST } from '../app/api/data-intake/route';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const mapping: ColumnMapping[] = [{ column: 0, target: 'name' }, { column: 1, target: 'email' }];
const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;
async function fixture(text = 'Name,Email\nAda,ada@example.test\nLin,lin@example.test') {
  const database = await db(), now = new Date().toISOString();
  const user = { id: randomUUID(), email: `${randomUUID()}@example.test`, organizationId: randomUUID() };
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [user.organizationId, 'Fictional review', now]);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [user.id, user.email, 'x', user.organizationId, now]);
  const source = await createIngestionSource(user, { title: 'Fictional source', kind: 'paste', format: 'csv', text });
  return { database, user, source };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const mappingDraft = (f: Fixture, expectedRevision = 0) => ({ sourceId: f.source.id, expectedRevision, mapping, phase: 'mapping', decisions: [] });
const decisionsFor = (p: IntakePreview, action: RowDecision['action'] = 'create'): RowDecision[] => p.rows.map(row => ({ rowNumber: row.rowNumber, action }));
const reviewedDraft = (f: Fixture, p: IntakePreview, decisions = decisionsFor(p), expectedRevision = 0) => ({ ...mappingDraft(f, expectedRevision), mapping: p.mapping, cursor: p.cursor, excludedRows: p.excludedRows, phase: 'review', previewId: p.id, previewHash: p.hash, decisions });
const apply = (f: Fixture, p: IntakePreview, decisions = decisionsFor(p), reviewRevision?: number) => applyIntake(f.user, { previewId: p.id, previewHash: p.hash, decisions, reviewRevision });
async function intercept(database: Database, match: (statements: Parameters<Database['batch']>[0]) => boolean, before: () => Promise<void>, operation: () => Promise<void>) {
  const original = database.batch.bind(database); let fired = false;
  database.batch = async statements => { if (!fired && match(statements)) { fired = true; await before(); } return original(statements); };
  try { await operation(); assert.equal(fired, true); } finally { database.batch = original; }
}

test('mapping draft survives reload with unknown columns, global exclusions and next-batch cursor; no customer writes', async () => {
  const f = await fixture('Name,Email\n' + Array.from({ length: 201 }, (_, i) => `Person ${i},p${i}@example.test`).join('\n'));
  const saved = await saveIntakeReview(f.user, { ...mappingDraft(f), mapping: [{ column: 0, target: 'unknown' }, { column: 1, target: 'unknown' }], cursor: 200, excludedRows: [201, 1, 201] });
  const loaded = await loadIntakeReview(f.user, f.source.id);
  assert.deepEqual(loaded, saved); assert.deepEqual(loaded.review?.excludedRows, [1, 201]); assert.equal(loaded.review?.cursor, 200);
  assert.equal(loaded.progress.pending, 201); assert.equal((await listIntakeReviews(f.user))[0].revision, 1);
  assert.equal((await listEntities(f.user.organizationId, 'contact')).length, 0);
  assert.equal((await listRecords(f.user.organizationId, 'data_intake_row')).length, 0);
});

test('partial row decisions persist exactly, final apply requires all decisions then atomically marks saved review applied', async () => {
  const f = await fixture(), p = await previewIntake(f.user, { sourceId: f.source.id, mapping });
  const first = await saveIntakeReview(f.user, reviewedDraft(f, p, [{ rowNumber: 1, action: 'create' }]));
  assert.deepEqual((await loadIntakeReview(f.user, f.source.id)).review?.decisions, first.review?.decisions);
  await assert.rejects(apply(f, p, first.review!.decisions, 1), status(400));
  await assert.rejects(apply(f, p, decisionsFor(p), 1), status(409));
  await saveIntakeReview(f.user, reviewedDraft(f, p, decisionsFor(p), 1));
  const receipt = await apply(f, p, decisionsFor(p), 2);
  assert.equal(receipt.created, 2);
  const loaded = await loadIntakeReview(f.user, f.source.id);
  assert.equal(loaded.review?.phase, 'applied'); assert.equal(loaded.review?.revision, 3); assert.equal(loaded.progress.created, 2);
  assert.equal((await apply(f, p, decisionsFor(p), 2)).replayed, true);
});

test('concurrent draft saves use exact revision CAS and never overwrite a competing saved change', async () => {
  const f = await fixture(); await saveIntakeReview(f.user, mappingDraft(f));
  const results = await Promise.allSettled([saveIntakeReview(f.user, { ...mappingDraft(f, 1), excludedRows: [1] }), saveIntakeReview(f.user, { ...mappingDraft(f, 1), excludedRows: [2] })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && status(409)(r.reason)).length, 1);
  assert.equal((await loadIntakeReview(f.user, f.source.id)).review?.revision, 2);
  await assert.rejects(saveIntakeReview(f.user, mappingDraft(f, 1)), status(409));
});

test('saved review fences actor, tenant, source and preview mapping', async () => {
  const f = await fixture(), other = await fixture(), p = await previewIntake(f.user, { sourceId: f.source.id, mapping });
  await saveIntakeReview(f.user, reviewedDraft(f, p));
  assert.deepEqual(await listIntakeReviews(other.user), []);
  await assert.rejects(loadIntakeReview(other.user, f.source.id), status(404));
  await assert.rejects(saveIntakeReview(other.user, { ...mappingDraft(other), phase: 'review', previewId: p.id, previewHash: p.hash }), status(404));
  const secondSource = await createIngestionSource(f.user, { title: 'Other table', kind: 'paste', format: 'csv', text: 'Name,Email\nJo,jo@example.test' });
  await assert.rejects(saveIntakeReview(f.user, { ...reviewedDraft(f, p), sourceId: secondSource.id }), status(409));
  await assert.rejects(saveIntakeReview(f.user, { ...reviewedDraft(f, p, [], 1), excludedRows: [1] }), status(409));
  const now = new Date().toISOString(), member = { ...f.user, id: randomUUID(), email: `${randomUUID()}@example.test` };
  await f.database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [member.id, member.email, 'x', member.organizationId, now]);
  await f.database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [`team:member:${member.id}`, member.organizationId, 'team:member', 'active', JSON.stringify({ userId: member.id, role: 'operator', status: 'active' }), now]);
  assert.equal((await loadIntakeReview(member, f.source.id)).review, null);
  await assert.rejects(saveIntakeReview(member, reviewedDraft(f, p)), status(409));
});

test('malformed draft inputs, forged applied phase and prototype mappings cannot grant authority', async () => {
  const f = await fixture();
  for (const change of [{ phase: ['mapping'] }, { expectedRevision: '0' }, { cursor: 1 }, { excludedRows: [0] }, { excludedRows: [Infinity] }, { phase: 'applied' }, { decisions: [{ rowNumber: 1, action: 'create' }] }, { mapping: [Object.create({ column: 0, target: 'name' }), mapping[1]] }]) {
    await assert.rejects(saveIntakeReview(f.user, { ...mappingDraft(f), ...change }), status(400));
  }
  const p = await previewIntake(f.user, { sourceId: f.source.id, mapping });
  await assert.rejects(saveIntakeReview(f.user, { ...reviewedDraft(f, p), phase: 'applied' }), status(409));
  await assert.rejects(saveIntakeReview(f.user, reviewedDraft(f, p, [{ rowNumber: 1, action: 'skip' }, { rowNumber: 1, action: 'skip' }])), status(400));
  assert.equal((await listEntities(f.user.organizationId, 'contact')).length, 0);
  assert.deepEqual(parseIntakeTable('[{"name":"Ada","constructor":"own"},{"name":"Lin"}]', 'json').rows, [['Ada', 'own'], ['Lin', '']]);
});

test('directory changes after save are reported on reload and cannot apply saved choices', async () => {
  const f = await fixture(), p = await previewIntake(f.user, { sourceId: f.source.id, mapping });
  await saveIntakeReview(f.user, reviewedDraft(f, p)); await createContact(f.user, { name: 'Ada', email: 'ada@example.test' });
  assert.equal((await loadIntakeReview(f.user, f.source.id)).previewStale, true);
  await assert.rejects(apply(f, p, decisionsFor(p), 1), status(409));
  assert.equal((await loadIntakeReview(f.user, f.source.id)).review?.phase, 'review');
});

test('apply races a draft edit: entire customer/receipt/review transition rolls back', async () => {
  const f = await fixture(), p = await previewIntake(f.user, { sourceId: f.source.id, mapping }); await saveIntakeReview(f.user, reviewedDraft(f, p));
  await intercept(f.database, statements => statements.some(s => s.params?.includes('customer.table_intake.reviewed')), async () => { await saveIntakeReview(f.user, mappingDraft(f, 1)); }, async () => { await assert.rejects(apply(f, p, decisionsFor(p), 1), status(409)); });
  assert.equal((await listEntities(f.user.organizationId, 'contact')).length, 0);
  assert.equal((await listRecords(f.user.organizationId, 'data_intake_row')).length, 0);
  assert.equal((await loadIntakeReview(f.user, f.source.id)).review?.phase, 'mapping');
});

test('source removal and membership revocation during save roll back the draft', async () => {
  for (const revoke of ['source', 'member']) {
    const f = await fixture();
    await intercept(f.database, statements => statements.some(s => s.params?.includes('platform:data_intake_review')), async () => { await f.database.run('UPDATE entities SET status=? WHERE id=?', ['removed', revoke === 'source' ? f.source.id : `team:member:${f.user.id}`]); }, async () => { await assert.rejects(saveIntakeReview(f.user, mappingDraft(f)), status(409)); });
    assert.equal((await listRecords(f.user.organizationId, 'data_intake_review')).length, 0);
  }
});

test('first draft racing legacy apply cannot bypass newly saved review intent', async () => {
  const f = await fixture(), p = await previewIntake(f.user, { sourceId: f.source.id, mapping });
  await intercept(f.database, statements => statements.some(s => s.params?.includes('customer.table_intake.reviewed')), async () => { await saveIntakeReview(f.user, mappingDraft(f)); }, async () => { await assert.rejects(apply(f, p), status(409)); });
  assert.equal((await listEntities(f.user.organizationId, 'contact')).length, 0);
  assert.equal((await loadIntakeReview(f.user, f.source.id)).review?.phase, 'mapping');
});

test('concurrent saved-review apply retries share one receipt and one phase revision increment', async () => {
  const f = await fixture(), p = await previewIntake(f.user, { sourceId: f.source.id, mapping }); await saveIntakeReview(f.user, reviewedDraft(f, p));
  const receipts = await Promise.all([apply(f, p, decisionsFor(p), 1), apply(f, p, decisionsFor(p), 1)]);
  assert.equal(receipts[0].id, receipts[1].id); assert.equal(receipts.filter(r => r.replayed).length, 1);
  assert.equal((await loadIntakeReview(f.user, f.source.id)).review?.revision, 2);
});

test('source progress counts unique committed and revisitable skipped rows across batches and attempts', async () => {
  const f = await fixture('Name,Email\n' + Array.from({ length: 201 }, (_, i) => `Person ${i},p${i}@example.test`).join('\n'));
  const first = await previewIntake(f.user, { sourceId: f.source.id, mapping });
  await apply(f, first, decisionsFor(first, 'skip'));
  const again = await previewIntake(f.user, { sourceId: f.source.id, mapping, attemptId: randomUUID() });
  await apply(f, again, decisionsFor(again, 'skip'));
  assert.deepEqual((await loadIntakeReview(f.user, f.source.id)).progress, { totalRows: 201, created: 0, linked: 0, skipped: 200, reviewed: 200, pending: 1 });
  const retry = await previewIntake(f.user, { sourceId: f.source.id, mapping, newAttempt: true });
  await apply(f, retry, retry.rows.map(row => ({ rowNumber: row.rowNumber, action: row.rowNumber === 1 ? 'create' : 'skip' })));
  const second = await previewIntake(f.user, { sourceId: f.source.id, mapping, cursor: 200 }); await apply(f, second);
  assert.deepEqual((await loadIntakeReview(f.user, f.source.id)).progress, { totalRows: 201, created: 2, linked: 0, skipped: 199, reviewed: 201, pending: 0 });
  const reupload = await createIngestionSource(f.user, { title: 'Same bytes', kind: 'paste', format: 'csv', text: f.source.rawText });
  assert.equal((await loadIntakeReview(f.user, reupload.id)).progress.created, 2);
});

test('client review nonce keeps uncertain preview retries stable and explicit new attempts distinct', async () => {
  const f = await fixture(), attemptId = randomUUID(), p = await previewIntake(f.user, { sourceId: f.source.id, mapping, attemptId });
  assert.equal((await previewIntake(f.user, { sourceId: f.source.id, mapping, attemptId })).id, p.id);
  await apply(f, p, decisionsFor(p, 'skip'));
  assert.equal((await previewIntake(f.user, { sourceId: f.source.id, mapping, attemptId })).id, p.id);
  const next = await previewIntake(f.user, { sourceId: f.source.id, mapping, attemptId: randomUUID() });
  assert.notEqual(next.id, p.id); assert.equal((await apply(f, next)).created, 2);
});

test('authenticated review API exposes durable list/load/save and protects origins', async () => {
  const account = await authenticate({ mode: 'register', organization: 'Fictional review API', email: `${randomUUID()}@example.test`, password: 'fictitious-password-123' }, new Request('http://localhost/api/auth'));
  const cookie = account.cookie.split(';')[0], source = await createIngestionSource(account.user, { title: 'Route fixture', kind: 'paste', format: 'csv', text: 'Name,Email\nAda,ada@example.test' });
  const request = (body: unknown, origin = 'http://localhost') => POST(new Request('http://localhost/api/data-intake', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin }, body: JSON.stringify(body) }));
  const saved = await request({ action: 'save', sourceId: source.id, expectedRevision: 0, mapping, phase: 'mapping' }); assert.equal(saved.status, 200);
  const loaded = await request({ action: 'load', sourceId: source.id }); assert.equal((await loaded.json()).review.revision, 1);
  assert.equal((await (await request({ action: 'list' })).json()).reviews.length, 1);
  assert.equal((await request({ action: 'load', sourceId: source.id }, 'https://elsewhere.test')).status, 403);
});
