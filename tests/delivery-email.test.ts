import test from 'node:test';
import assert from 'node:assert/strict';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { createContact } from '../lib/server/store';
import { createRecord, updateRecord, type PlatformRecord } from '../lib/platform/records';
import { applyCampaignPlan, generateCampaignPlan } from '../lib/campaign-planning/engine';
import { handleBusinessContextAction } from '../lib/business/engine';
import type { runAiTask } from '../lib/ai/task-router';
import { handleCampaignAction } from '../lib/platform/campaigns';
import { configureConnection, configureOAuthConnection, getConnection, replaceOAuthCredentials, updateConnection } from '../lib/integrations/vault';
import { check as checkConnection } from '../lib/integrations/service';
import { listCampaignDelivery, sendCampaignEmail } from '../lib/delivery/engine';
import { gmailRawMessage, sendEmailViaProvider } from '../lib/delivery/providers';
import { stableDeliveryIdempotencyKey } from '../lib/delivery/key';
import { HttpError } from '../lib/server/http';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
process.env.CONNECTOR_ENCRYPTION_KEY = '11'.repeat(32);
let sequence = 0;
async function fixture(provider: 'gmail' | 'microsoft_mail' = 'gmail', oauth = false) {
  const n = ++sequence, user: AuthUser = { id: `delivery-user-${n}`, email: `delivery-${n}@example.test`, organizationId: `delivery-org-${n}` };
  const database = await db(), now = new Date().toISOString();
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Delivery fixture', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'x', user.organizationId, now] },
  ]);
  const contact = await createContact(user, { name: 'Aanya Rao', email: `aanya-${n}@example.test` });
  const profile = await createRecord(user, 'customer_profile', { contactId: contact.id, email: contact.email, consent: { email: { granted: true, evidence: 'Customer agreed', recordedAt: now } } }, 'active');
  const sendPermission = provider === 'gmail' ? 'https://www.googleapis.com/auth/gmail.send' : 'Mail.Send';
  const connected = oauth
    ? await configureOAuthConnection(user, provider, { token: 'offline-oauth-token-1', refreshToken: 'offline-refresh-token', expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      oauthProvider: provider === 'gmail' ? 'google' : 'microsoft', accountBinding: provider === 'gmail' ? 'google:checked-mailbox@example.test' : 'microsoft:mailbox-id',
      scopes: [provider === 'gmail' ? 'https://www.googleapis.com/auth/gmail.readonly' : 'Mail.Read', sendPermission] })
    : await configureConnection(user, provider, { token: 'offline-test-token', sendPermission });
  if (!oauth) await updateConnection(user, provider, { status: 'connected' });
  const campaign = await handleCampaignAction(user, 'campaign.create', { name: 'Feedback', kind: 'feedback', objective: 'Learn what to improve', channel: 'email', emailConnectionId: connected.id,
    agentReleaseId: '', subject: 'A quick question', message: 'Hello {{firstName}}, how did it go?', contactIds: [contact.id] }) as { id: string };
  const run = await handleCampaignAction(user, 'campaign.launch', { id: campaign.id }) as { id: string };
  return { user, contact, profile, connected, run, input: { runId: run.id, contactId: contact.id, connectionId: connected.id, requestId: '11111111-1111-4111-8111-111111111111' } };
}
const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;

test('ported intent key binds the destination and mailbox without changing on replay', () => {
  const input = { tenantId: 'tenant', intentId: 'intent', provider: 'gmail', destinationId: 'person@example.test', runId: 'run', connectionId: 'mailbox' };
  assert.equal(stableDeliveryIdempotencyKey(input), stableDeliveryIdempotencyKey({ ...input }));
  assert.notEqual(stableDeliveryIdempotencyKey(input), stableDeliveryIdempotencyKey({ ...input, destinationId: 'other@example.test' }));
  assert.notEqual(stableDeliveryIdempotencyKey(input), stableDeliveryIdempotencyKey({ ...input, connectionId: 'other-mailbox' }));
});

test('one explicit send records provider acceptance once; duplicate request cannot resend', async () => {
  const { user, input, run } = await fixture();
  let calls = 0;
  const send = async () => { calls++; return { state: 'accepted' as const, providerReference: 'gmail-message-1' }; };
  const first = await sendCampaignEmail(user, input, send);
  assert.equal(first.state, 'accepted');
  assert.equal(first.providerReference, 'gmail-message-1');
  assert.equal((await sendCampaignEmail(user, input, send)).id, first.id);
  assert.equal(calls, 1);
  await assert.rejects(sendCampaignEmail(user, { ...input, requestId: '22222222-2222-4222-8222-222222222222' }, send), status(409));
  const view = await listCampaignDelivery(user, run.id);
  assert.equal(view.recipients[0].status, 'accepted');
});

test('timeout ambiguity is durable and never retried automatically', async () => {
  const { user, input } = await fixture();
  let calls = 0;
  const send = async () => { calls++; throw new Error('simulated timeout after provider acceptance'); };
  assert.equal((await sendCampaignEmail(user, input, send)).state, 'uncertain');
  assert.equal((await sendCampaignEmail(user, input, send)).state, 'uncertain');
  assert.equal(calls, 1);
});

test('crash after provider acceptance leaves a recoverable uncertain intent without resending', async () => {
  const { user, input, run } = await fixture();
  const database = await db(), originalBatch = database.batch.bind(database);
  let calls = 0;
  database.batch = async statements => {
    if (statements.some(item => item.sql.startsWith('UPDATE entities') && item.params?.[1] === 'accepted')) throw new Error('simulated result-write crash');
    return originalBatch(statements);
  };
  try {
    await assert.rejects(sendCampaignEmail(user, input, async () => { calls++; return { state: 'accepted' as const, providerReference: 'possibly-sent' }; }), status(503));
  } finally { database.batch = originalBatch; }
  const [row] = await database.all('SELECT id,data,status FROM entities WHERE organization_id=? AND kind=?', [user.organizationId, 'delivery:email_intent']);
  assert.equal(row.status, 'sending');
  const saved = JSON.parse(String(row.data)) as { revision: number; updatedAt: string; data: { createdAt: string } };
  saved.data.createdAt = new Date(Date.now() - 61_000).toISOString();
  await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify(saved), String(row.id)]);
  assert.equal((await listCampaignDelivery(user, run.id)).recipients[0].status, 'uncertain');
  assert.equal((await sendCampaignEmail(user, input, async () => { calls++; return { state: 'accepted' as const }; })).state, 'uncertain');
  assert.equal(calls, 1);
});

test('revoked consent, tenant mismatch and replaced mailbox authorization block egress', async () => {
  const { user, input, profile } = await fixture();
  const other: AuthUser = { id: 'other', email: 'other@example.test', organizationId: 'other-tenant' };
  let calls = 0;
  const send = async () => { calls++; return { state: 'accepted' as const }; };
  await assert.rejects(sendCampaignEmail(other, input, send), status(404));
  await updateRecord(user, profile, { ...profile.data, consent: { email: { granted: false, evidence: 'Withdrawn', recordedAt: new Date().toISOString() } } }, 'active');
  await assert.rejects(sendCampaignEmail(user, input, send), status(409));
  assert.equal(calls, 0);
  const second = await fixture();
  await configureConnection(second.user, 'gmail', { token: 'different-manual-mailbox', sendPermission: 'https://www.googleapis.com/auth/gmail.send' });
  await updateConnection(second.user, 'gmail', { status: 'connected' });
  await assert.rejects(sendCampaignEmail(second.user, second.input, send), status(409));
  assert.equal(calls, 0);
});

test('health check and same-grant OAuth refresh preserve one queued send', async () => {
  const { user, input } = await fixture('gmail', true);
  const launchedVersion = (await getConnection(user, 'gmail')).authorizationVersion;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ emailAddress: 'checked-mailbox@example.test' });
    await checkConnection(user, 'gmail');
  } finally { globalThis.fetch = originalFetch; }
  const checked = await getConnection(user, 'gmail');
  assert.equal(checked.authorizationVersion, launchedVersion);
  await replaceOAuthCredentials(user, 'gmail', { token: 'offline-oauth-token-2', refreshToken: 'offline-refresh-token', expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    oauthProvider: 'google', accountBinding: 'google:checked-mailbox@example.test', scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'] }, checked.revision);
  const refreshed = await getConnection(user, 'gmail');
  assert.equal(refreshed.authorizationVersion, launchedVersion);
  let token = '';
  assert.equal((await sendCampaignEmail(user, input, async value => { token = value.token; return { state: 'accepted', providerReference: 'accepted-after-refresh' }; })).state, 'accepted');
  assert.equal(token, 'offline-oauth-token-2');
});

test('scope loss invalidates the queued run and removes send permission', async () => {
  const { user, input } = await fixture('gmail', true);
  const prior = await getConnection(user, 'gmail');
  await replaceOAuthCredentials(user, 'gmail', { token: 'read-only-token', refreshToken: 'offline-refresh-token', expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    oauthProvider: 'google', accountBinding: 'google:checked-mailbox@example.test', scopes: ['https://www.googleapis.com/auth/gmail.readonly'] }, prior.revision);
  const changed = await getConnection(user, 'gmail');
  assert.notEqual(changed.authorizationVersion, prior.authorizationVersion);
  assert.equal(changed.settings.sendPermission, undefined);
  await assert.rejects(sendCampaignEmail(user, input, async () => { throw new Error('must not dispatch'); }), status(409));
});

test('OAuth account switch cannot inherit a queued run authorization', async () => {
  const { user } = await fixture('gmail', true);
  const prior = await getConnection(user, 'gmail');
  await assert.rejects(replaceOAuthCredentials(user, 'gmail', { token: 'another-account-token', refreshToken: 'another-refresh', expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    oauthProvider: 'google', accountBinding: 'google:another@example.test', scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'] }, prior.revision), status(409));
  const after = await getConnection(user, 'gmail');
  assert.equal(after.authorizationVersion, prior.authorizationVersion);
  assert.equal(after.revision, prior.revision);
});

test('legacy mailbox row without an authorization version fails closed', async () => {
  const { user, input } = await fixture();
  const database = await db(), current = await getConnection(user, 'gmail');
  const legacy = { ...current } as Record<string, unknown>;
  delete legacy.authorizationVersion;
  await database.run('UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=?', [JSON.stringify(legacy), current.id, user.organizationId, 'integration:vault']);
  await assert.rejects(sendCampaignEmail(user, input, async () => { throw new Error('must not dispatch'); }), status(409));
});

test('MIME rejects header injection; Gmail id and Graph 202 mean acceptance only', async () => {
  assert.throws(() => gmailRawMessage('victim@example.test\r\nBcc: other@example.test', 'Hello', 'Body'), status(409));
  assert.throws(() => gmailRawMessage('victim@example.test', 'Hello\r\nBcc: other@example.test', 'Body'), status(409));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { raw: string };
      const mime = Buffer.from(body.raw, 'base64url').toString('utf8');
      assert.match(mime, /^To: victim@example\.test\r\nSubject: /);
      assert.doesNotMatch(mime, /\r\nBcc:/);
      return Response.json({ id: 'gmail-id' });
    };
    assert.deepEqual(await sendEmailViaProvider({ provider: 'gmail', token: 'offline-token', to: 'victim@example.test', subject: 'Hello', body: 'Body' }), { state: 'accepted', providerReference: 'gmail-id' });
    globalThis.fetch = async () => new Response(null, { status: 202 });
    assert.deepEqual(await sendEmailViaProvider({ provider: 'microsoft_mail', token: 'offline-token', to: 'victim@example.test', subject: 'Hello', body: 'Body' }), { state: 'accepted' });
    globalThis.fetch = async () => new Response(null, { status: 503 });
    assert.equal((await sendEmailViaProvider({ provider: 'microsoft_mail', token: 'offline-token', to: 'victim@example.test', subject: 'Hello', body: 'Body' })).state, 'uncertain');
  } finally { globalThis.fetch = originalFetch; }
});

test('manual dispatch atomically rejects authority changed during an awaited dispatch gate', async () => {
  for (const mutation of ['membership', 'consent', 'run'] as const) {
    const { user, input, contact, run } = await fixture();
    let calls = 0;
    const dispatch = async () => { calls++; return { state: 'accepted' as const }; };
    const result = await sendCampaignEmail(user, input, dispatch, async () => {
      const database = await db();
      if (mutation === 'membership') {
        const id = `team:member:${user.id}`, [row] = await database.all('SELECT data FROM entities WHERE id=?', [id]);
        await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(row.data)), role: 'viewer' }), id]);
      } else if (mutation === 'consent') {
        const [row] = await database.all('SELECT data FROM entities WHERE id=?', [contact.id]);
        await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(row.data)), optOut: true }), contact.id]);
      } else await handleCampaignAction(user, 'campaign.pause', { runId: run.id });
      return [];
    });
    assert.equal(result.state, 'rejected');
    assert.match(result.reason || '', /No provider request was made/);
    assert.equal(calls, 0);
    assert.equal((await sendCampaignEmail(user, input, dispatch)).state, 'rejected');
    assert.equal(calls, 0);
  }
});

test('manual initial intent claim rolls back on current operator demotion', async () => {
  const { user, input } = await fixture();
  const database = await db(), originalBatch = database.batch.bind(database);
  let injected = false, calls = 0;
  database.batch = async statements => {
    if (!injected && statements.some(item => item.sql.startsWith('INSERT INTO entities') && item.params?.[2] === 'delivery:email_intent')) {
      injected = true;
      const id = `team:member:${user.id}`, [row] = await database.all('SELECT data FROM entities WHERE id=?', [id]);
      await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(row.data)), role: 'viewer' }), id]);
    }
    return originalBatch(statements);
  };
  try { await assert.rejects(sendCampaignEmail(user, input, async () => { calls++; return { state: 'accepted' }; }), status(409)); }
  finally { database.batch = originalBatch; }
  assert.equal(injected, true); assert.equal(calls, 0);
  assert.equal((await database.all('SELECT id FROM entities WHERE organization_id=? AND kind=?', [user.organizationId, 'delivery:email_intent'])).length, 0);
});

test('scoped email dispatch consumes offering, signal and source fences in the final transaction', async () => {
  for (const change of ['none', 'offering', 'signal', 'source', 'snapshot'] as const) {
    const f = await fixture(), now = new Date().toISOString(), quote = 'Guided onboarding includes a setup review subject to staff availability.';
    const source = await createRecord(f.user, 'brain_source', { title: 'Service definition', content: quote, sourceLabel: 'Fictional source', approvedAt: now, approvedBy: f.user.id }, 'approved');
    const action = async (body: Record<string, unknown>) => (await handleBusinessContextAction(f.user, body) as { record: PlatformRecord }).record;
    const draft = await action({ action: 'offering.create', name: 'Guided onboarding', kind: 'service', summary: quote, audienceDescription: 'Customers setting up the service', sourceRefs: [{ sourceId: source.id, quote }], openQuestions: [] });
    const offering = await action({ action: 'offering.approve', id: draft.id, revision: draft.revision });
    const proposal = await action({ action: 'signal.create', title: 'Setup feedback opportunity', observation: 'Guided setup review is available.', sourceRefs: [{ sourceId: source.id, quote }], uncertainty: ['Customer need is unconfirmed.'], offeringId: offering.id, contactId: f.contact.id });
    const signal = await action({ action: 'signal.review', id: proposal.id, revision: proposal.revision, status: 'approved' });
    const planner = (async () => ({ text: JSON.stringify({ name: 'Setup feedback', objective: 'Understand setup obstacles', subject: 'Your setup experience', message: 'Hello {{firstName}}, what was difficult in setup?', callBrief: 'Disclose AI identity and ask about a setup obstacle.', successCriteria: 'A concrete customer example.', journeySteps: ['Review permission and ask about setup'], missingInputs: [], citations: [{ field: 'callBrief', sourceId: source.id, quote }] }), runId: 'offline-plan', model: 'fixture', usage: { inputTokens: 1, outputTokens: 1 }, cached: false })) as typeof runAiTask;
    const plan = await generateCampaignPlan(f.user, { goal: 'Understand setup obstacles', kind: 'feedback', channel: 'manual_email', contactIds: [f.contact.id], sourceIds: [], requestId: `scoped-mail-${change}`, intent: { schemaVersion: 1, offeringId: offering.id, outcome: { label: 'Understand setup obstacles', evidenceRequired: ['A concrete customer example'] }, signalIds: [signal.id], audienceRationale: 'Reviewed setup customers', reviewColumns: [{ key: 'obstacle', label: 'Setup obstacle', type: 'text' }] } }, planner);
    const applied = await applyCampaignPlan(f.user, plan.id, { action: 'apply', revision: plan.revision });
    await handleCampaignAction(f.user, 'campaign.update', { ...applied.campaign.data, id: applied.campaign.id, channel: 'email', emailConnectionId: f.connected.id });
    const launched = await handleCampaignAction(f.user, 'campaign.launch', { id: applied.campaign.id }) as { id: string };
    const database = await db();
    let calls = 0;
    const dispatch = async () => { calls++; return { state: 'accepted' as const }; };
    const input = { ...f.input, runId: launched.id };
    if (change === 'snapshot') {
      for (const id of [plan.id, applied.campaign.id]) {
        const [row] = await database.all('SELECT data FROM entities WHERE id=?', [id]);
        const saved = JSON.parse(String(row.data));
        saved.data.explicitIntentV1.outcome.label = 'A different outcome after launch';
        await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify(saved), id]);
      }
      await assert.rejects(sendCampaignEmail(f.user, input, dispatch), status(409));
      assert.equal(calls, 0);
      continue;
    }
    const result = await sendCampaignEmail(f.user, input, dispatch, async () => {
      if (change !== 'none') await database.run('UPDATE entities SET status=? WHERE id=?', ['revoked', change === 'offering' ? offering.id : change === 'signal' ? signal.id : source.id]);
      return [];
    });
    assert.equal(result.state, change === 'none' ? 'accepted' : 'rejected');
    assert.equal(calls, change === 'none' ? 1 : 0);
  }
});
