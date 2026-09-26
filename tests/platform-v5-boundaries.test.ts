import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate } from '../lib/server/auth';
import { createContact, createSession } from '../lib/server/store';
import { createRecord } from '../lib/platform/records';
import { parseAgentConfig } from '../lib/platform/agents';
import { handleCustomerAction } from '../lib/platform/customer-ops';
import { customerPhone } from '../lib/platform/phone';
import { HttpError } from '../lib/server/http';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const request = new Request('http://localhost:3000/api/test');
const fixture = (name: string) => authenticate({ mode: 'register', email: `${name}@example.test`, password: 'local test password', organization: 'Boundary test' }, request).then(value => value.user);
const config = { name: 'Maya', role: 'Service representative', objective: 'Understand the customer question and give a grounded answer.', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Concise and respectful.', memoryScope: 'none', escalation: 'Offer a human follow-up on request.', knowledgeIds: [] };
const badRequest = (value: unknown) => value instanceof HttpError && value.status === 400;

test('installed call actions are opt-in and arbitrary tool names cannot enter a draft', () => {
  assert.deepEqual(parseAgentConfig(config).enabledTools, []);
  assert.deepEqual(parseAgentConfig({ ...config, enabledTools: ['request_follow_up', 'request_follow_up'] }).enabledTools, ['request_follow_up']);
  assert.throws(() => parseAgentConfig({ ...config, enabledTools: ['fetch_arbitrary_url'] }), badRequest);
  assert.throws(() => parseAgentConfig({ ...config, enabledTools: 'request_follow_up' }), badRequest);
});

test('international phone normalization does not infer a country or communication permission', async () => {
  assert.equal(customerPhone('+91 (90000) 00000'), '+919000000000');
  assert.throws(() => customerPhone('9000000000'), badRequest);
  assert.throws(() => customerPhone('+91 90000 00000 ext 2'), badRequest);
  const owner = await fixture('phone-boundary');
  const contact = await createContact(owner, { name: 'Fictional contact', phone: '+91 90000 00000' });
  assert.equal(contact.phone, '+919000000000');
  assert.equal(contact.consent, undefined);
  const saved = await handleCustomerAction(owner, 'customer.update', { contactId: contact.id, name: 'Fictional contact', phone: '', email: '', notes: '', stage: 'New' }) as { data: { phone: string; consent: object } };
  assert.equal(saved.data.phone, '');
  assert.deepEqual(saved.data.consent, {});
});

test('session action evidence comes from server records and diagnostics remain bounded client observations', async () => {
  const owner = await fixture('diagnostic-boundary');
  const preview = await createRecord(owner, 'voice_preview', { config: parseAgentConfig(config), requestedBy: owner.id, provider: 'azure', inputMode: 'text', contextDigest: 'test-only', toolAuthority: { enabledTools: ['search_company_knowledge'] } }, 'connection_issued');
  const diagnostics = { measurement: 'client_observed_events', status: 'ended', clientObservedConnectMs: 100, clientObservedTurnMs: [250], toolCalls: { requested: 0, available: 0, awaitingReview: 0, unavailable: 0 }, bogusServerVerified: true };
  const body = { source: 'browser_preview', previewId: preview.id, transcript: [{ role: 'user', text: 'A fictional test question.' }], diagnostics, toolReceipts: [{ status: 'available', actionId: 'forged' }], enabledTools: ['request_follow_up'] };
  const saved = await createSession(owner, body);
  assert.deepEqual(saved.enabledTools, ['search_company_knowledge']);
  assert.deepEqual(saved.toolReceipts, []);
  assert.equal((saved.diagnostics as Record<string, unknown>).bogusServerVerified, undefined);
  assert.equal((saved.diagnostics as Record<string, unknown>).measurement, 'client_observed_events');
  await assert.rejects(createSession(owner, { ...body, diagnostics: { ...diagnostics, clientObservedTurnMs: [Infinity] } }), badRequest);
  await assert.rejects(createSession(owner, { transcript: body.transcript, diagnostics }), badRequest);
});
