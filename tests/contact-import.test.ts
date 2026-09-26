import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import { authenticate, type AuthUser } from '../lib/server/auth';
import { HttpError } from '../lib/server/http';
import { createContact, getEntity, listEntities } from '../lib/server/store';
import { handleCustomerAction } from '../lib/platform/customer-ops';
import { listRecords } from '../lib/platform/records';
import { analyzeIngestion, createIngestionSource, getIngestionDetail } from '../lib/ingestion/engine';
import { importReviewedContact } from '../lib/ingestion/contact-review';
import { existingCustomerMatch } from '../lib/ingestion/customer-catalog';
import { POST as importRoute } from '../app/api/contact-import/route';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;

async function user(label: string) {
  const database = await db(), now = new Date().toISOString();
  const account = { id: randomUUID(), email: `${label}@example.test`, organizationId: randomUUID() };
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [account.organizationId, label, now]);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [account.id, account.email, 'x', account.organizationId, now]);
  return account;
}

async function stagedContact(operator: AuthUser, label: string, name: string, email: string) {
  const quote = `Name: ${name}; Email: ${email}`;
  const source = await createIngestionSource(operator, { title: label, kind: 'paste', text: quote });
  const analyzed = await analyzeIngestion(operator, source.id, `analyze-${label}`, async () => ({ text: JSON.stringify({ candidates: [
    { type: 'contact', title: name, content: `Potential contact: ${name}, ${email}`, quote, blockId: 'b0001', confidence: 'medium', uncertainty: 'No consent or verified identity' },
  ] }) }));
  return { source, proposal: analyzed.proposal!, candidate: analyzed.proposal!.candidates[0], name, email };
}

test('operator creates one source-backed customer with no consent and retry returns same record', async () => {
  const operator = await user('contact-import-create');
  const staged = await stagedContact(operator, 'lead-a', 'Priya Mehta', 'priya@example.test');
  const body = { sourceId: staged.source.id, candidateId: staged.candidate.id, revision: staged.proposal.revision, name: staged.name, email: staged.email };
  const created = await importReviewedContact(operator, body);
  assert.equal(created.status, 'created');
  if (created.status !== 'created') return;
  assert.equal(created.replayed, false);
  assert.equal(created.contact.sourceArtifactId, staged.source.id);
  assert.equal(created.contact.sourceQuote, staged.candidate.quote);
  assert.equal(created.contact.consent, undefined);
  assert.equal(created.contact.identityVerified, false);
  assert.equal(created.proposal.candidates[0].status, 'linked_customer');
  assert.equal(created.proposal.candidates[0].linkedContactId, created.contactId);
  assert.equal((await listRecords(operator.organizationId, 'customer_profile')).length, 0);
  const again = await importReviewedContact(operator, body);
  assert.equal(again.status, 'created');
  if (again.status === 'created') assert.equal(again.contactId, created.contactId);
  assert.equal((await listEntities(operator.organizationId, 'contact')).length, 1);
  await assert.rejects(importReviewedContact(operator, { ...body, name: 'Another Name' }), (error: unknown) => error instanceof HttpError && error.status === 400);
});

test('name and email must be in the exact quote; another tenant cannot link the candidate', async () => {
  const operator = await user('contact-import-owner'), outsider = await user('contact-import-outsider');
  const staged = await stagedContact(operator, 'lead-b', 'Asha Rao', 'asha@example.test');
  const body = { sourceId: staged.source.id, candidateId: staged.candidate.id, revision: staged.proposal.revision, name: staged.name, email: staged.email };
  await assert.rejects(importReviewedContact(operator, { ...body, name: 'Invented Person' }), (error: unknown) => error instanceof HttpError && error.status === 400);
  await assert.rejects(importReviewedContact(operator, { ...body, email: 'invented@example.test' }), (error: unknown) => error instanceof HttpError && error.status === 400);
  await assert.rejects(importReviewedContact(outsider, body), (error: unknown) => error instanceof HttpError && error.status === 404);
  assert.equal((await listEntities(operator.organizationId, 'contact')).length, 0);
});

test('exact email and name matches return existing customer conflict; profile email is authoritative', async () => {
  const operator = await user('contact-import-conflict');
  const existing = await createContact(operator, { name: 'Existing Person', email: 'old@example.test' });
  await handleCustomerAction(operator, 'customer.update', { contactId: existing.id, name: 'Existing Person', email: 'current@example.test', stage: 'New', notes: '' });
  const emailMatch = await stagedContact(operator, 'lead-c', 'Asha Rao', 'current@example.test');
  const emailResult = await importReviewedContact(operator, { sourceId: emailMatch.source.id, candidateId: emailMatch.candidate.id, revision: emailMatch.proposal.revision, name: emailMatch.name, email: emailMatch.email });
  assert.equal(emailResult.status, 'conflict');
  if (emailResult.status === 'conflict') { assert.equal(emailResult.reason, 'email_match'); assert.equal(emailResult.existingContactId, existing.id); }
  const nameMatch = await stagedContact(operator, 'lead-d', 'Existing Person', 'other@example.test');
  const nameResult = await importReviewedContact(operator, { sourceId: nameMatch.source.id, candidateId: nameMatch.candidate.id, revision: nameMatch.proposal.revision, name: nameMatch.name, email: nameMatch.email });
  assert.equal(nameResult.status, 'conflict');
  if (nameResult.status === 'conflict') assert.equal(nameResult.reason, 'name_match');
  assert.equal((await listEntities(operator.organizationId, 'contact')).length, 1);
  assert.equal((await getIngestionDetail(operator, emailMatch.source.id)).proposal?.candidates[0].status, 'review_only');
});

test('same-email imports from different proposals serialize to one customer and a structured conflict', async () => {
  const operator = await user('contact-import-race');
  const first = await stagedContact(operator, 'lead-e', 'Asha Rao', 'shared@example.test');
  const second = await stagedContact(operator, 'lead-f', 'Priya Mehta', 'shared@example.test');
  const database = await db(), originalBatch = database.batch.bind(database);
  let arrivals = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const timeout = setTimeout(release, 5_000);
  database.batch = async statements => {
    if (statements.some(item => item.params?.includes('internal:contact_import_catalog')) && statements.some(item => item.params?.includes('platform:contact_import_receipt'))) {
      arrivals++;
      if (arrivals === 2) release();
      await gate;
    }
    return originalBatch(statements);
  };
  let results: Awaited<ReturnType<typeof importReviewedContact>>[];
  try {
    results = await Promise.all([
      importReviewedContact(operator, { sourceId: first.source.id, candidateId: first.candidate.id, revision: first.proposal.revision, name: first.name, email: first.email }),
      importReviewedContact(operator, { sourceId: second.source.id, candidateId: second.candidate.id, revision: second.proposal.revision, name: second.name, email: second.email }),
    ]);
  } finally { clearTimeout(timeout); database.batch = originalBatch; }
  assert.equal(arrivals, 2);
  assert.deepEqual(results.map(item => item.status).sort(), ['conflict', 'created']);
  assert.equal((await listEntities(operator.organizationId, 'contact')).length, 1);
});

test('contact import route requires session and origin, then returns replay status', async () => {
  const session = await authenticate({ mode: 'register', email: 'contact-import-route@example.test', password: 'correct password' }, new Request('http://localhost:3000/api/auth'));
  const staged = await stagedContact(session.user, 'lead-g', 'Mira Shah', 'mira@example.test');
  const cookie = session.cookie.split(';')[0];
  const body = JSON.stringify({ sourceId: staged.source.id, candidateId: staged.candidate.id, revision: staged.proposal.revision, name: staged.name, email: staged.email });
  const request = () => new Request('http://localhost:3000/api/contact-import', { method: 'POST', headers: { cookie, origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'application/json' }, body });
  const created = await importRoute(request());
  assert.equal(created.status, 201);
  const createdJson = await created.json();
  assert.equal(createdJson.status, 'created');
  const repeated = await importRoute(request());
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).contactId, createdJson.contactId);
  const duplicate = await stagedContact(session.user, 'lead-h', 'Another Person', staged.email);
  const conflicting = await importRoute(new Request('http://localhost:3000/api/contact-import', { method: 'POST', headers: { cookie, origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify({ sourceId: duplicate.source.id, candidateId: duplicate.candidate.id, revision: duplicate.proposal.revision, name: duplicate.name, email: duplicate.email }) }));
  assert.equal(conflicting.status, 409);
  assert.equal((await conflicting.json()).existingContactId, createdJson.contactId);
  const denied = await importRoute(new Request('http://localhost:3000/api/contact-import', { method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body }));
  assert.equal(denied.status, 401);
  assert.equal((await getEntity(session.user.organizationId, 'contact', createdJson.contactId)).email, staged.email);
});

test('manual customer create and reviewed import share one atomic customer-directory fence', async () => {
  const operator = await user('contact-import-manual-create');
  const staged = await stagedContact(operator, 'lead-i', 'Asha Rao', 'race@example.test');
  const database = await db(), originalBatch = database.batch.bind(database);
  let arrivals = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const timeout = setTimeout(release, 5_000);
  database.batch = async statements => {
    if (statements.some(item => item.params?.includes('internal:contact_import_catalog')) && statements.some(item => item.params?.includes('contact'))) {
      arrivals++;
      if (arrivals === 2) release();
      await gate;
    }
    return originalBatch(statements);
  };
  let outcomes: PromiseSettledResult<unknown>[];
  try {
    outcomes = await Promise.allSettled([
      importReviewedContact(operator, { sourceId: staged.source.id, candidateId: staged.candidate.id, revision: staged.proposal.revision, name: staged.name, email: staged.email }),
      createContact(operator, { name: staged.name, email: staged.email }),
    ]);
  } finally { clearTimeout(timeout); database.batch = originalBatch; }
  assert.equal(arrivals, 2);
  assert.equal((await listEntities(operator.organizationId, 'contact')).length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected').length + outcomes.filter(result => result.status === 'fulfilled' && (result.value as { status?: string }).status === 'conflict').length, 1);
  await assert.rejects(createContact(operator, { name: staged.name, email: staged.email }), (error: unknown) => error instanceof HttpError && error.status === 409);
});

test('profile email change races an import under the same directory revision', async () => {
  const operator = await user('contact-import-profile-race');
  const existing = await createContact(operator, { name: 'Existing Person', email: 'old@example.test' });
  const savedProfile = await handleCustomerAction(operator, 'customer.update', { contactId: existing.id, name: 'Existing Person', email: 'old@example.test', stage: 'New', notes: '' }) as { revision: number };
  const staged = await stagedContact(operator, 'lead-j', 'Asha Rao', 'new@example.test');
  const database = await db(), originalBatch = database.batch.bind(database);
  let arrivals = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const timeout = setTimeout(release, 5_000);
  database.batch = async statements => {
    if (statements.some(item => item.params?.includes('internal:contact_import_catalog')) && statements.some(item => item.params?.includes('platform:customer_profile') || item.params?.includes('platform:contact_import_receipt'))) {
      arrivals++;
      if (arrivals === 2) release();
      await gate;
    }
    return originalBatch(statements);
  };
  let outcomes: PromiseSettledResult<unknown>[];
  try {
    outcomes = await Promise.allSettled([
      importReviewedContact(operator, { sourceId: staged.source.id, candidateId: staged.candidate.id, revision: staged.proposal.revision, name: staged.name, email: staged.email }),
      handleCustomerAction(operator, 'customer.update', { contactId: existing.id, revision: savedProfile.revision, name: 'Existing Person', email: staged.email, stage: 'New', notes: '' }),
    ]);
  } finally { clearTimeout(timeout); database.batch = originalBatch; }
  assert.equal(arrivals, 2);
  assert.equal(outcomes.filter(result => result.status === 'rejected').length + outcomes.filter(result => result.status === 'fulfilled' && (result.value as { status?: string }).status === 'conflict').length, 1);
  const match = await existingCustomerMatch(database, operator.organizationId, 'Any', staged.email);
  assert.ok(match);
  const profiles = await listRecords(operator.organizationId, 'customer_profile');
  const contacts = await listEntities(operator.organizationId, 'contact');
  const effective = contacts.map(contact => String(profiles.find(profile => profile.status === 'active' && profile.data.contactId === contact.id)?.data.email ?? contact.email ?? '')).filter(email => email === staged.email);
  assert.equal(effective.length, 1);
});
