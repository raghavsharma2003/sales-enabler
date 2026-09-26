import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate } from '../lib/server/auth';
import { createSession } from '../lib/server/store';
import { handleCustomerAction } from '../lib/platform/customer-ops';
import { getRecord, listRecords } from '../lib/platform/records';
import { HttpError } from '../lib/server/http';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const request = () => new Request('http://localhost:3000/api/test');
const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;

test('customer records, source approval and commitment evidence stay tenant scoped', async () => {
  const alice = (await authenticate({ mode: 'register', email: 'customer-ops-alice@example.test', password: 'strong password', organization: 'Alpha' }, request())).user;
  const bob = (await authenticate({ mode: 'register', email: 'customer-ops-bob@example.test', password: 'strong password', organization: 'Beta' }, request())).user;
  const contact = await handleCustomerAction(alice, 'customer.create', { name: 'A customer', email: 'a@example.test' }) as { id: string };
  const racing = await handleCustomerAction(alice, 'customer.create', { name: 'Racing customer' }) as { id: string };
  const contenders = await Promise.allSettled([
    handleCustomerAction(alice, 'customer.consent', { contactId: racing.id, channel: 'email', granted: true, evidence: 'Written opt-in' }),
    handleCustomerAction(alice, 'customer.consent', { contactId: racing.id, channel: 'email', granted: false, evidence: 'Written withdrawal' }),
  ]);
  assert.equal(contenders.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(contenders.filter((result) => result.status === 'rejected').length, 1);
  assert.equal((await listRecords(alice.organizationId, 'customer_profile')).filter((item) => item.data.contactId === racing.id).length, 1);
  await assert.rejects(handleCustomerAction(bob, 'customer.update', { contactId: contact.id, name: 'Leak', stage: 'New' }), status(404));
  const profile = await handleCustomerAction(alice, 'customer.update', { contactId: contact.id, name: 'Updated', email: 'a@example.test', stage: 'Discovery', notes: 'Private note' }) as { id: string; revision: number };
  await assert.rejects(handleCustomerAction(alice, 'customer.update', { contactId: contact.id, revision: 99, name: 'Wrong', stage: 'New' }), status(409));
  const consent = await handleCustomerAction(alice, 'customer.consent', { contactId: contact.id, revision: profile.revision, channel: 'email', granted: false, evidence: 'Customer withdrew consent' }) as { data: { consent: { email: { granted: boolean } } } };
  assert.equal(consent.data.consent.email.granted, false);
  const source = await handleCustomerAction(alice, 'brain.create', { title: 'Opening hours', content: 'Weekdays only', sourceLabel: 'Owner interview' }) as { id: string; revision: number; status: string };
  assert.equal(source.status, 'draft');
  await assert.rejects(getRecord(bob.organizationId, 'brain_source', source.id), status(404));
  const approved = await handleCustomerAction(alice, 'brain.approve', { sourceId: source.id, revision: source.revision }) as { revision: number; status: string };
  assert.equal(approved.status, 'approved');
  await assert.rejects(handleCustomerAction(alice, 'brain.revoke', { sourceId: source.id, revision: source.revision, reason: 'Outdated' }), status(409));
  const revoked = await handleCustomerAction(alice, 'brain.revoke', { sourceId: source.id, revision: approved.revision, reason: 'Outdated' }) as { status: string };
  assert.equal(revoked.status, 'revoked');
  const session = await createSession(alice, { contactId: contact.id, transcript: [{ role: 'user', text: 'I have feedback.' }] });
  await assert.rejects(handleCustomerAction(alice, 'brain.feedback', { sessionId: session.id, contactId: racing.id, content: 'Wrong customer' }), status(400));
  const feedback = await handleCustomerAction(alice, 'brain.feedback', { sessionId: session.id, content: 'Manual observation' }) as { data: { sessionId: string } };
  assert.equal(feedback.data.sessionId, session.id);
  const task = await handleCustomerAction(alice, 'commitment.create', { contactId: contact.id, sourceSessionId: session.id, title: 'Send details', description: 'Customer asked for details', dueDate: '2026-10-01' }) as { id: string; revision: number; status: string };
  await assert.rejects(handleCustomerAction(alice, 'commitment.notify', { commitmentId: task.id, revision: task.revision, channel: 'email', evidence: 'Sent' }), status(409));
  const completed = await handleCustomerAction(alice, 'commitment.complete', { commitmentId: task.id, revision: task.revision, completionNote: 'Prepared details' }) as { revision: number; status: string; data: { notification?: unknown } };
  assert.equal(completed.status, 'completed');
  assert.equal(completed.data.notification, undefined);
  const notified = await handleCustomerAction(alice, 'commitment.notify', { commitmentId: task.id, revision: completed.revision, channel: 'email', evidence: 'Sent manually at 14:00' }) as { data: { notification: { evidence: string } } };
  assert.match(notified.data.notification.evidence, /Sent manually/);
  assert.equal((await listRecords(bob.organizationId, 'commitment')).length, 0);
});
