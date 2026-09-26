import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import { getEntity } from '../lib/server/store';
import { listRecords } from '../lib/platform/records';
import { HttpError } from '../lib/server/http';
import { analyzeIngestion, classifyIngestionCandidate, createIngestionSource, getIngestionDetail, reviewIngestion } from '../lib/ingestion/engine';
import { importReviewedContact } from '../lib/ingestion/contact-review';
import { possibleCustomerRecord } from '../lib/ingestion/scope';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;

async function user(label: string) {
  const database = await db(), now = new Date().toISOString();
  const account = { id: randomUUID(), email: `${label}@example.test`, organizationId: randomUUID() };
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [account.organizationId, label, now]);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [account.id, account.email, 'x', account.organizationId, now]);
  return account;
}

test('stored personal record mislabeled company fact cannot publish; operator reclassifies and creates customer without new inference', async () => {
  const operator = await user('ingestion-personal-scope');
  const quote = 'Name: Rohan Kapoor; email: rohan.kapoor@example.test; stage: New enquiry. No permission for email, voice or WhatsApp.';
  const source = await createIngestionSource(operator, { title: 'CRM notes', kind: 'paste', text: quote });
  let calls = 0;
  const analyzed = await analyzeIngestion(operator, source.id, 'personal-scope', async (_user, request) => {
    calls++;
    assert.match(request.system, /MUST be type contact, never company_fact/);
    return { text: JSON.stringify({ candidates: [{ type: 'company_fact', title: 'Customer record details', content: 'Rohan Kapoor is a new enquiry.', quote, blockId: 'b0001', confidence: 'high', uncertainty: '' }] }) };
  });
  const candidate = analyzed.proposal!.candidates[0];
  assert.ok(candidate.issues.includes('possible_customer_record'));
  // Simulate a persisted proposal produced before the guard existed.
  const database = await db();
  const [row] = await database.all('SELECT data FROM entities WHERE id=? AND organization_id=? AND kind=?', [analyzed.proposal!.id, operator.organizationId, 'platform:ingestion_proposal']);
  const stored = JSON.parse(String(row.data));
  stored.data.candidates[0].issues = [];
  await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify(stored), analyzed.proposal!.id]);
  const visible = await getIngestionDetail(operator, source.id);
  assert.ok(visible.proposal!.candidates[0].issues.includes('possible_customer_record'));
  await assert.rejects(reviewIngestion(operator, source.id, 'apply', analyzed.proposal!.revision, [candidate.id]), (error: unknown) => error instanceof HttpError && error.status === 409);
  assert.equal((await listRecords(operator.organizationId, 'brain_source')).length, 0);
  const classified = await classifyIngestionCandidate(operator, source.id, analyzed.proposal!.revision, candidate.id, 'contact', 'This quote is one person’s CRM record.');
  const corrected = classified.proposal.candidates[0];
  assert.equal(corrected.type, 'contact');
  assert.equal(corrected.status, 'review_only');
  assert.equal(corrected.modelType, 'company_fact');
  assert.equal(corrected.modelQuote, quote);
  assert.equal(corrected.quote, quote);
  assert.equal(corrected.typeReviews?.length, 1);
  const created = await importReviewedContact(operator, { sourceId: source.id, candidateId: candidate.id, revision: classified.proposal.revision, name: 'Rohan Kapoor', email: 'rohan.kapoor@example.test' });
  assert.equal(created.status, 'created');
  if (created.status === 'created') {
    const contact = await getEntity(operator.organizationId, 'contact', created.contactId);
    assert.equal(contact.consent, undefined);
    assert.equal(contact.sourceArtifactId, source.id);
  }
  assert.equal(calls, 1);
  assert.equal((await listRecords(operator.organizationId, 'brain_source')).length, 0);
  const audit = await database.all('SELECT event FROM audit_events WHERE organization_id=? AND entity_id=?', [operator.organizationId, analyzed.proposal!.id]);
  assert.ok(audit.some(item => String(item.event).startsWith('ingestion.candidate.classified:company_fact->contact')));
});

test('ordinary company support address is not treated as a personal customer record', async () => {
  const operator = await user('ingestion-support-scope');
  const quote = 'Support email: help@academy.test. Our support desk is open weekdays.';
  const source = await createIngestionSource(operator, { title: 'Support page', kind: 'paste', text: `Name: Asha Rao; Email: asha@example.test; Stage: New enquiry\n${quote}` });
  const analyzed = await analyzeIngestion(operator, source.id, 'support-scope', async () => ({ text: JSON.stringify({ candidates: [
    { type: 'company_fact', title: 'Support address', content: 'Support email: help@academy.test.', quote, blockId: 'b0001', confidence: 'high', uncertainty: '' },
  ] }) }));
  const candidate = analyzed.proposal!.candidates[0];
  assert.equal(possibleCustomerRecord(candidate, source), false);
  assert.ok(!candidate.issues.includes('possible_customer_record'));
  const applied = await reviewIngestion(operator, source.id, 'apply', analyzed.proposal!.revision, [candidate.id]);
  assert.equal(applied.applied.length, 1);
  assert.equal((await listRecords(operator.organizationId, 'brain_source'))[0].status, 'approved');
});

test('flagged personal evidence cannot be upgraded into company knowledge through type review', async () => {
  const operator = await user('ingestion-scope-upgrade');
  const quote = 'Name: Anika Shah; Email: anika@example.test; Stage: New enquiry';
  const source = await createIngestionSource(operator, { title: 'CRM', kind: 'paste', text: quote });
  const analyzed = await analyzeIngestion(operator, source.id, 'scope-upgrade', async () => ({ text: JSON.stringify({ candidates: [
    { type: 'action', title: 'New enquiry', content: 'Review Anika Shah.', quote, blockId: 'b0001', confidence: 'medium', uncertainty: '' },
  ] }) }));
  await assert.rejects(classifyIngestionCandidate(operator, source.id, analyzed.proposal!.revision, analyzed.proposal!.candidates[0].id, 'company_fact', 'Standing company information'), (error: unknown) => error instanceof HttpError && error.status === 400);
});
