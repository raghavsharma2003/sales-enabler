import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import { createIngestionSource } from '../lib/ingestion/engine';
import { applyIntake, previewIntake, saveIntakeReview, loadIntakeReview } from '../lib/data-intake/service';
import { listEntities } from '../lib/server/store';
import { HttpError } from '../lib/server/http';
import type { ColumnMapping, IntakePreview, RowDecision } from '../lib/data-intake/contracts';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const mapping: ColumnMapping[] = [{ column: 0, target: 'name' }, { column: 1, target: 'email' }];

async function fixture() {
  const database = await db(), now = new Date().toISOString();
  const user = { id: randomUUID(), email: `${randomUUID()}@example.test`, organizationId: randomUUID() };
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [user.organizationId, 'Fictional independent intake review', now]);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [user.id, user.email, 'x', user.organizationId, now]);
  const source = await createIngestionSource(user, { title: 'Fictional retry table', kind: 'paste', format: 'csv', text: 'Name,Email\nAda,ada@example.test' });
  return { user, source, database };
}
const apply = (user: Awaited<ReturnType<typeof fixture>>['user'], preview: IntakePreview, action: RowDecision['action']) => applyIntake(user, { previewId: preview.id, previewHash: preview.hash, decisions: [{ rowNumber: 1, action }] });

test('independent: reopening an all-skipped review permits create without rewriting the original receipt', async () => {
  const { user, source } = await fixture();
  const first = await previewIntake(user, { sourceId: source.id, mapping });
  const skipped = await apply(user, first, 'skip');
  const reopened = await previewIntake(user, { sourceId: source.id, mapping, newAttempt: true });
  assert.notEqual(reopened.id, first.id);
  const created = await apply(user, reopened, 'create');
  assert.equal(created.created, 1);
  assert.notEqual(created.id, skipped.id);
  assert.equal((await apply(user, first, 'skip')).id, skipped.id);
  assert.equal((await apply(user, first, 'skip')).replayed, true);
  assert.equal((await apply(user, reopened, 'create')).id, created.id);
  assert.equal((await listEntities(user.organizationId, 'contact')).length, 1);
});

test('independent: fresh review attempts cannot replay successful source rows as new customers', async () => {
  const { user, source } = await fixture();
  const first = await previewIntake(user, { sourceId: source.id, mapping });
  await apply(user, first, 'create');
  const reopened = await previewIntake(user, { sourceId: source.id, mapping, newAttempt: true });
  assert.ok(reopened.rows[0].previous);
  await assert.rejects(apply(user, reopened, 'create'), (error: unknown) => error instanceof HttpError && error.status === 409);
  assert.equal((await listEntities(user.organizationId, 'contact')).length, 1);
});

test('independent: source removal still blocks receipt replay from a fresh review attempt', async () => {
  const { user, source, database } = await fixture();
  const first = await previewIntake(user, { sourceId: source.id, mapping, newAttempt: true });
  await apply(user, first, 'skip');
  await database.run('DELETE FROM entities WHERE id=?', [source.id]);
  await assert.rejects(apply(user, first, 'skip'), (error: unknown) => error instanceof HttpError && error.status === 404);
});

test('independent: a saved review rejects phase arrays instead of persisting an invalid workflow state', async () => {
  const { user, source } = await fixture();
  const preview = await previewIntake(user, { sourceId: source.id, mapping });
  await assert.rejects(saveIntakeReview(user, { sourceId: source.id, expectedRevision: 0, mapping, phase: ['review'], previewId: preview.id, previewHash: preview.hash, decisions: [] }), (error: unknown) => error instanceof HttpError && error.status === 400);
  assert.equal((await loadIntakeReview(user, source.id)).review, null);
});

test('independent: omitting revision cannot apply preview authority superseded by a saved mapping draft', async () => {
  const { user, source } = await fixture();
  const preview = await previewIntake(user, { sourceId: source.id, mapping });
  await saveIntakeReview(user, { sourceId: source.id, expectedRevision: 0, mapping, phase: 'review', previewId: preview.id, previewHash: preview.hash, decisions: [{ rowNumber: 1, action: 'create' }] });
  await saveIntakeReview(user, { sourceId: source.id, expectedRevision: 1, mapping, phase: 'mapping' });
  await assert.rejects(apply(user, preview, 'create'), (error: unknown) => error instanceof HttpError && error.status === 409);
  assert.equal((await listEntities(user.organizationId, 'contact')).length, 0);
});
