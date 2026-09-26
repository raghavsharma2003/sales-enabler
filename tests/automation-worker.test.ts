import test from 'node:test';
import assert from 'node:assert/strict';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { createContact } from '../lib/server/store';
import { createRecord, getRecord, updateRecord } from '../lib/platform/records';
import { handleCampaignAction } from '../lib/platform/campaigns';
import { configureConnection, updateConnection } from '../lib/integrations/vault';
import { automationDashboard, controlAutomation, enableAutomation, previewAutomation, runAutomationTick } from '../lib/automation/engine';
import type { AutomationSchedule } from '../lib/automation/contracts';
import { HttpError } from '../lib/server/http';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
process.env.CONNECTOR_ENCRYPTION_KEY = '33'.repeat(32);
let sequence = 0;
async function fixture() {
  const n = ++sequence, user: AuthUser = { id: `automation-user-${n}`, email: `automation-${n}@example.test`, organizationId: `automation-org-${n}` };
  const database = await db(), now = new Date().toISOString();
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Schedule fixture', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'x', user.organizationId, now] },
  ]);
  const contact = await createContact(user, { name: 'Fictional Recipient', email: `fixture-${n}@example.test` });
  const profile = await createRecord(user, 'customer_profile', { contactId: contact.id, email: contact.email, consent: { email: { granted: true, evidence: 'Fictional fixture agreement', recordedAt: now } } }, 'active');
  const connected = await configureConnection(user, 'gmail', { token: 'offline-fixture-token', sendPermission: 'https://www.googleapis.com/auth/gmail.send' });
  await updateConnection(user, 'gmail', { status: 'connected' });
  const campaign = await handleCampaignAction(user, 'campaign.create', { name: 'Scheduled feedback', kind: 'feedback', objective: 'Learn what to improve', channel: 'email', emailConnectionId: connected.id, agentReleaseId: '', subject: 'Quick feedback', message: 'Hello {{firstName}}, how was the service?', contactIds: [contact.id] }) as { id: string };
  const run = await handleCampaignAction(user, 'campaign.launch', { id: campaign.id }) as { id: string };
  const preview = await previewAutomation(user, run.id);
  const input = { runId: run.id, reviewToken: preview.reviewToken, scheduledAt: new Date(Date.now() + 60_000).toISOString(), timezone: 'Asia/Kolkata' };
  return { user, contact, profile, connected, run, preview, input };
}
const status = (value: number) => (error: unknown) => error instanceof HttpError && error.status === value;
async function due(user: AuthUser, id: string) {
  const schedule = await getRecord<AutomationSchedule>(user.organizationId, 'automation_schedule', id);
  return updateRecord(user, schedule, { ...schedule.data, scheduledAt: new Date(Date.now() - 1000).toISOString() });
}
async function state(user: AuthUser, id: string) { return getRecord<AutomationSchedule>(user.organizationId, 'automation_schedule', id); }

test('nothing runs by default; enabling requires future time, review and exact tenant/author', async () => {
  const f = await fixture();
  assert.equal(f.preview.ready, true);
  assert.equal((await automationDashboard(f.user)).schedules.length, 0);
  assert.equal((await automationDashboard(f.user)).worker.running, false);
  await assert.rejects(enableAutomation(f.user, { ...f.input, reviewToken: 'wrong' }), status(409));
  await assert.rejects(enableAutomation(f.user, { ...f.input, scheduledAt: new Date(Date.now() - 1000).toISOString() }), status(400));
  await assert.rejects(enableAutomation(f.user, { ...f.input, timezone: 'Invalid/Zone' }), status(400));
  await assert.rejects(previewAutomation({ ...f.user, organizationId: 'other' }, f.run.id));
  const schedule = await enableAutomation(f.user, f.input);
  await due(f.user, schedule.id);
  let calls = 0;
  await runAutomationTick({ enabled: false, dispatch: async () => { calls++; return { state: 'accepted' }; } });
  assert.equal(calls, 0);
  assert.equal((await state(f.user, schedule.id)).data.tasks[0].state, 'pending');
  await controlAutomation(f.user, schedule.id, 'cancel');
});

test('concurrent workers and repeated passes create one provider attempt and accepted receipt', async () => {
  const f = await fixture(), schedule = await enableAutomation(f.user, f.input);
  await due(f.user, schedule.id);
  let calls = 0;
  const dispatch = async () => { calls++; return { state: 'accepted' as const, providerReference: 'offline-accepted' }; };
  await Promise.all([runAutomationTick({ enabled: true, dispatch }), runAutomationTick({ enabled: true, dispatch })]);
  await runAutomationTick({ enabled: true, dispatch });
  assert.equal(calls, 1);
  const saved = await state(f.user, schedule.id);
  assert.equal(saved.status, 'completed');
  assert.equal(saved.data.tasks[0].state, 'accepted');
  assert.ok(saved.data.tasks[0].receiptId);
  assert.equal(saved.data.claim, undefined);
  await assert.rejects(enableAutomation(f.user, f.input), status(409));
});

test('revoked consent, mailbox replacement and current operator demotion prevent egress', async () => {
  let calls = 0;
  const dispatch = async () => { calls++; return { state: 'accepted' as const }; };
  for (const mutation of ['consent', 'mailbox', 'role']) {
    const f = await fixture(), schedule = await enableAutomation(f.user, f.input);
    await due(f.user, schedule.id);
    if (mutation === 'consent') await updateRecord(f.user, f.profile, { ...f.profile.data, consent: { email: { granted: false, evidence: 'Withdrawn', recordedAt: new Date().toISOString() } } });
    if (mutation === 'mailbox') {
      await configureConnection(f.user, 'gmail', { token: 'different-offline-token', sendPermission: 'https://www.googleapis.com/auth/gmail.send' });
      await updateConnection(f.user, 'gmail', { status: 'connected' });
    }
    if (mutation === 'role') {
      const database = await db(), [row] = await database.all('SELECT data FROM entities WHERE id=?', [`team:member:${f.user.id}`]);
      await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(row.data)), role: 'viewer' }), `team:member:${f.user.id}`]);
    }
    await runAutomationTick({ enabled: true, dispatch });
    assert.equal((await state(f.user, schedule.id)).status, 'attention');
  }
  assert.equal(calls, 0);
});

test('pause or cancel winning immediately before dispatch blocks the real provider callback', async () => {
  for (const action of ['pause', 'cancel'] as const) {
    const f = await fixture(), schedule = await enableAutomation(f.user, f.input);
    await due(f.user, schedule.id);
    const database = await db(), originalBatch = database.batch.bind(database);
    let injected = false, calls = 0;
    database.batch = async statements => {
      await originalBatch(statements);
      if (!injected && statements.some(item => item.sql.startsWith('INSERT INTO entities') && item.params?.[2] === 'delivery:email_intent')) {
        injected = true;
        await controlAutomation(f.user, schedule.id, action);
      }
    };
    try { await runAutomationTick({ enabled: true, dispatch: async () => { calls++; return { state: 'accepted' }; } }); }
    finally { database.batch = originalBatch; }
    assert.equal(injected, true); assert.equal(calls, 0);
    const saved = await state(f.user, schedule.id);
    assert.equal(saved.status, action === 'pause' ? 'paused' : 'cancelled');
    assert.equal(saved.data.tasks[0].state, 'rejected');
  }
});

test('cancellation during provider call preserves known result and cancellation', async () => {
  const f = await fixture(), schedule = await enableAutomation(f.user, f.input);
  await due(f.user, schedule.id);
  await runAutomationTick({ enabled: true, dispatch: async () => {
    await controlAutomation(f.user, schedule.id, 'cancel');
    return { state: 'accepted', providerReference: 'offline-accepted-before-cancel' };
  } });
  const saved = await state(f.user, schedule.id);
  assert.equal(saved.status, 'cancelled');
  assert.equal(saved.data.tasks[0].state, 'accepted');
});

test('uncertain provider outcome never retries after a second pass or resume review', async () => {
  const f = await fixture(), schedule = await enableAutomation(f.user, f.input);
  await due(f.user, schedule.id);
  let calls = 0;
  const dispatch = async () => { calls++; throw new Error('Offline ambiguous response'); };
  await runAutomationTick({ enabled: true, dispatch });
  await runAutomationTick({ enabled: true, dispatch });
  assert.equal(calls, 1);
  const saved = await state(f.user, schedule.id);
  assert.equal(saved.status, 'attention'); assert.equal(saved.data.tasks[0].state, 'uncertain');
  await controlAutomation(f.user, schedule.id, 'pause');
  await assert.rejects(controlAutomation(f.user, schedule.id, 'resume', f.input), status(409));
});

test('expired claims distinguish pre-dispatch interruption from uncertain egress and never resend', async () => {
  for (const phase of ['preparing', 'egress'] as const) {
    const f = await fixture(), schedule = await enableAutomation(f.user, f.input);
    const ready = await due(f.user, schedule.id);
    await updateRecord(f.user, ready, { ...ready.data, claim: { token: 'offline-abandoned-claim', contactId: f.contact.id, phase, expiresAt: new Date(Date.now() - 1000).toISOString() } });
    let calls = 0;
    await runAutomationTick({ enabled: true, dispatch: async () => { calls++; return { state: 'accepted' }; } });
    const saved = await state(f.user, schedule.id);
    assert.equal(saved.data.tasks[0].state, phase === 'preparing' ? 'interrupted' : 'uncertain');
    assert.equal(saved.status, 'attention'); assert.equal(calls, 0);
  }
});

test('due visibility and worker heartbeat report bounded execution honestly', async () => {
  const f = await fixture(), schedule = await enableAutomation(f.user, f.input);
  await due(f.user, schedule.id);
  assert.equal((await automationDashboard(f.user)).schedules[0].overdue, true);
  await controlAutomation(f.user, schedule.id, 'pause');
  await runAutomationTick({ enabled: true, workerId: 'offline-continuing-worker', keepAlive: true, dispatch: async () => { throw new Error('Paused work must not send'); } });
  assert.equal((await automationDashboard(f.user)).worker.running, true);
  await runAutomationTick({ enabled: true, workerId: 'offline-continuing-worker', dispatch: async () => { throw new Error('Paused work must not send'); } });
  assert.equal((await automationDashboard(f.user)).worker.running, false);
});

test('paused pending schedule requires fresh review to resume and stays bound to its original subset', async () => {
  const f = await fixture(), schedule = await enableAutomation(f.user, f.input);
  await controlAutomation(f.user, schedule.id, 'pause');
  const preview = await previewAutomation(f.user, f.run.id);
  const resumed = await controlAutomation(f.user, schedule.id, 'resume', { ...f.input, reviewToken: preview.reviewToken });
  assert.equal(resumed.status, 'enabled');
  assert.deepEqual(resumed.data.tasks, schedule.data.tasks);
  await controlAutomation(f.user, schedule.id, 'cancel');
});

test('permission revoked after intent creation still loses the final egress fence', async () => {
  for (const mutation of ['consent', 'role', 'campaign'] as const) {
    const f = await fixture(), schedule = await enableAutomation(f.user, f.input);
    await due(f.user, schedule.id);
    const database = await db(), originalBatch = database.batch.bind(database);
    let injected = false, calls = 0;
    database.batch = async statements => {
      await originalBatch(statements);
      if (!injected && statements.some(item => item.sql.startsWith('INSERT INTO entities') && item.params?.[2] === 'delivery:email_intent')) {
        injected = true;
        if (mutation === 'consent') await updateRecord(f.user, f.profile, { ...f.profile.data, consent: { email: { granted: false, evidence: 'Withdrawn', recordedAt: new Date().toISOString() } } });
        if (mutation === 'role') {
          const [row] = await database.all('SELECT data FROM entities WHERE id=?', [`team:member:${f.user.id}`]);
          await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(row.data)), role: 'viewer' }), `team:member:${f.user.id}`]);
        }
        if (mutation === 'campaign') await handleCampaignAction(f.user, 'campaign.pause', { runId: f.run.id });
      }
    };
    try { await runAutomationTick({ enabled: true, dispatch: async () => { calls++; return { state: 'accepted' }; } }); }
    finally { database.batch = originalBatch; }
    assert.equal(injected, true); assert.equal(calls, 0);
    assert.equal((await state(f.user, schedule.id)).data.tasks[0].state, 'rejected');
  }
});

test('a lost provider-result write stays uncertain and reuses its original durable intent', async () => {
  const f = await fixture(), schedule = await enableAutomation(f.user, f.input);
  await due(f.user, schedule.id);
  const database = await db(), originalBatch = database.batch.bind(database);
  let calls = 0;
  database.batch = async statements => {
    if (statements.some(item => item.sql.startsWith('UPDATE entities') && item.params?.[1] === 'accepted')) throw new Error('Offline result-write failure');
    return originalBatch(statements);
  };
  const dispatch = async () => { calls++; return { state: 'accepted' as const }; };
  try { await runAutomationTick({ enabled: true, dispatch }); }
  finally { database.batch = originalBatch; }
  await runAutomationTick({ enabled: true, dispatch });
  const saved = await state(f.user, schedule.id);
  assert.equal(calls, 1); assert.equal(saved.data.tasks[0].state, 'uncertain');
  const intents = await database.all('SELECT data FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'delivery:email_intent']);
  assert.equal(intents.length, 1);
  assert.equal(JSON.parse(String(intents[0].data)).data.requestId, schedule.data.tasks[0].requestId);
});

test('an unexpired lease cannot be stolen and stale review cannot enable after permission changes', async () => {
  const f = await fixture();
  await updateRecord(f.user, f.profile, { ...f.profile.data, consent: { email: { granted: false, evidence: 'Withdrawn', recordedAt: new Date().toISOString() } } });
  await assert.rejects(enableAutomation(f.user, f.input), status(409));
  const fresh = await fixture(), schedule = await enableAutomation(fresh.user, fresh.input);
  const ready = await due(fresh.user, schedule.id);
  await updateRecord(fresh.user, ready, { ...ready.data, claim: { token: 'offline-live-lease', contactId: fresh.contact.id, phase: 'preparing', expiresAt: new Date(Date.now() + 120_000).toISOString() } });
  let calls = 0;
  await runAutomationTick({ enabled: true, dispatch: async () => { calls++; return { state: 'accepted' }; } });
  assert.equal(calls, 0);
  assert.equal((await state(fresh.user, schedule.id)).data.claim?.token, 'offline-live-lease');
  await controlAutomation(fresh.user, schedule.id, 'cancel');
});

test('pause or membership change during the final compare-and-set transaction prevents egress', async () => {
  for (const mutation of ['pause', 'membership'] as const) {
    const f = await fixture(), schedule = await enableAutomation(f.user, f.input);
    await due(f.user, schedule.id);
    const database = await db(), originalBatch = database.batch.bind(database);
    let injected = false, calls = 0;
    database.batch = async statements => {
      const finalFence = statements.some(item => item.sql.startsWith('UPDATE entities SET data=? WHERE') && item.params?.[3] === 'platform:automation_schedule');
      if (!injected && finalFence) {
        injected = true;
        if (mutation === 'pause') await controlAutomation(f.user, schedule.id, 'pause');
        else {
          const [row] = await database.all('SELECT data FROM entities WHERE id=?', [`team:member:${f.user.id}`]);
          await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(row.data)), role: 'viewer' }), `team:member:${f.user.id}`]);
        }
      }
      return originalBatch(statements);
    };
    try { await runAutomationTick({ enabled: true, dispatch: async () => { calls++; return { state: 'accepted' }; } }); }
    finally { database.batch = originalBatch; }
    assert.equal(injected, true); assert.equal(calls, 0);
    assert.equal((await state(f.user, schedule.id)).data.tasks[0].state, 'rejected');
  }
});

test('operator demotion at the schedule claim transaction prevents even a preparing claim', async () => {
  const f = await fixture(), schedule = await enableAutomation(f.user, f.input);
  await due(f.user, schedule.id);
  const database = await db(), originalBatch = database.batch.bind(database);
  let injected = false, calls = 0;
  database.batch = async statements => {
    if (!injected && statements.some(item => item.sql.startsWith('UPDATE entities SET data=?,status=?') && item.params?.[4] === 'platform:automation_schedule' && String(item.params[0]).includes('Worker claimed one due recipient'))) {
      injected = true;
      const id = `team:member:${f.user.id}`, [row] = await database.all('SELECT data FROM entities WHERE id=?', [id]);
      await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(String(row.data)), role: 'viewer' }), id]);
    }
    return originalBatch(statements);
  };
  try { await runAutomationTick({ enabled: true, dispatch: async () => { calls++; return { state: 'accepted' }; } }); }
  finally { database.batch = originalBatch; }
  assert.equal(injected, true); assert.equal(calls, 0);
  const saved = await state(f.user, schedule.id);
  assert.equal(saved.data.claim, undefined);
  assert.equal(saved.data.tasks[0].state, 'pending');
  assert.equal(saved.data.history.some(item => item.event === 'Worker claimed one due recipient'), false);
});
