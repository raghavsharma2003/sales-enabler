import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import type { AuthUser } from '../lib/server/auth';
import { automationDashboard, runAutomationTick, stopAutomationWorker } from '../lib/automation/engine';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;

async function emptyWorkspace(): Promise<AuthUser> {
  const suffix = randomUUID(), now = new Date().toISOString();
  const user = { id: `heartbeat-user-${suffix}`, email: `${suffix}@example.test`, organizationId: `heartbeat-org-${suffix}` };
  await (await db()).batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Fictional empty workspace', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'unused', user.organizationId, now] },
  ]);
  return user;
}

test('empty queue worker readiness is visible to a workspace without creating schedules', async () => {
  const user = await emptyWorkspace();
  assert.equal((await automationDashboard(user)).worker.running, false);
  await runAutomationTick({ enabled: false, workerId: 'disabled-empty-worker', keepAlive: true });
  assert.equal((await automationDashboard(user)).worker.running, false);
  const counts = await runAutomationTick({ enabled: true, workerId: 'empty-worker', keepAlive: true });
  assert.deepEqual(counts, { claimed: 0, accepted: 0, attention: 0, recovered: 0 });
  const view = await automationDashboard(user);
  assert.equal(view.worker.running, true);
  assert.ok(view.worker.lastSeenAt);
  assert.equal(view.schedules.length, 0);
  assert.deepEqual(Object.keys(view.worker).sort(), ['explanation', 'lastSeenAt', 'running']);
  assert.equal((await (await db()).all('SELECT id FROM entities WHERE kind=?', ['platform:automation_schedule'])).length, 0);
  await stopAutomationWorker('empty-worker');
  assert.equal((await automationDashboard(user)).worker.running, false);
});

test('stale or stopped global heartbeat never reports a running worker', async () => {
  const user = await emptyWorkspace();
  await runAutomationTick({ enabled: true, workerId: 'stale-worker', keepAlive: true });
  await (await db()).run('UPDATE service_heartbeats SET updated_at=? WHERE id=?', [new Date(Date.now() - 91_000).toISOString(), 'stale-worker']);
  assert.equal((await automationDashboard(user)).worker.running, false);
  await runAutomationTick({ enabled: true, workerId: 'stale-worker', keepAlive: true });
  assert.equal((await automationDashboard(user)).worker.running, true);
  await stopAutomationWorker('stale-worker');
  assert.equal((await automationDashboard(user)).worker.running, false);
  await runAutomationTick({ enabled: true, workerId: 'one-pass-empty-worker' });
  assert.equal((await automationDashboard(user)).worker.running, false);
});

test('one worker stopping does not hide another live worker from an empty workspace', async () => {
  const user = await emptyWorkspace();
  await runAutomationTick({ enabled: true, workerId: 'first-live-worker', keepAlive: true });
  await runAutomationTick({ enabled: true, workerId: 'second-live-worker', keepAlive: true });
  await stopAutomationWorker('second-live-worker');
  assert.equal((await automationDashboard(user)).worker.running, true);
  await stopAutomationWorker('first-live-worker');
  assert.equal((await automationDashboard(user)).worker.running, false);
});
