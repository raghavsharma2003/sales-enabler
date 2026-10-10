import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getOperationsStatus } from '../lib/operations/status';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';

process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'operations-status-')), 'test.sqlite');
const now = new Date('2026-10-10T12:00:00.000Z');

async function actor(organizationId = randomUUID()): Promise<AuthUser> {
  const database = await db(), id = randomUUID();
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?) ON CONFLICT (id) DO NOTHING', [organizationId, 'Fictional workspace', now.toISOString()]);
  return { id, email: `${id}@example.test`, organizationId, role: 'owner' };
}

async function heartbeat(id: string, service: string, status: string, updatedAt: string) {
  await (await db()).run('INSERT INTO service_heartbeats (id,service,status,updated_at) VALUES (?,?,?,?)', [id, service, status, updatedAt]);
}

async function queued(org: string, id: string, kind: string, status: string, createdAt: string, data = '{}') {
  await (await db()).run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [id, org, kind, status, data, createdAt]);
}

test('missing, wrong-service, and future heartbeats never become healthy reports', async () => {
  const user = await actor();
  await heartbeat(randomUUID(), 'unrelated-worker', 'running', now.toISOString());
  await heartbeat(randomUUID(), 'private-voice-supervisor', 'healthy', new Date(now.getTime() + 60_000).toISOString());
  const result = await getOperationsStatus(user, { database: await db(), now: () => now, env: { AUTOMATION_WORKER_ENABLED: '1', CHANNEL_WORKER_ENABLED: '1', LEARNING_WORKER_ENABLED: '1' } });
  assert.equal(result.services.find(service => service.id === 'private-voice-supervisor')?.state, 'unknown');
  assert.equal(result.services.find(service => service.id === 'automation-worker')?.state, 'unknown');
  assert.equal(result.services.every(service => service.ageSeconds === null), true);
});

test('service freshness uses its exact state and 30/120 second bounds', async () => {
  const user = await actor();
  await heartbeat(randomUUID(), 'private-voice-supervisor', 'healthy', new Date(now.getTime() - 29_000).toISOString());
  await heartbeat(randomUUID(), 'automation-worker', 'running', new Date(now.getTime() - 120_000).toISOString());
  await heartbeat(randomUUID(), 'channel-worker', 'ready', new Date(now.getTime() - 121_000).toISOString());
  await heartbeat(randomUUID(), 'learning-worker', 'stopped', new Date(now.getTime() - 5_000).toISOString());
  const result = await getOperationsStatus(user, { database: await db(), now: () => now, env: { AUTOMATION_WORKER_ENABLED: '1', CHANNEL_WORKER_ENABLED: '1', LEARNING_WORKER_ENABLED: '1' } });
  assert.equal(result.services.find(service => service.id === 'private-voice-supervisor')?.state, 'fresh');
  assert.equal(result.services.find(service => service.id === 'automation-worker')?.state, 'fresh');
  assert.equal(result.services.find(service => service.id === 'channel-worker')?.state, 'stale');
  assert.equal(result.services.find(service => service.id === 'learning-worker')?.state, 'stale');
});

test('disabled worker stays disabled while tenant queue count and oldest age remain visible', async () => {
  const user = await actor();
  await heartbeat(randomUUID(), 'channel-worker', 'ready', now.toISOString());
  await queued(user.organizationId, randomUUID(), 'channel:job', 'queued', new Date(now.getTime() - 40_000).toISOString(), '{"private":"must not be returned"}');
  const result = await getOperationsStatus(user, { database: await db(), now: () => now, env: { CHANNEL_WORKER_ENABLED: '0' } });
  assert.equal(result.services.find(service => service.id === 'channel-worker')?.state, 'disabled');
  const queue = result.queues.find(item => item.id === 'channel-replies');
  assert.equal(queue?.count, 1);
  assert.equal(queue?.oldestAgeSeconds, 40);
  assert.equal(JSON.stringify(result).includes('must not be returned'), false);
});

test('queue aggregates use only the authenticated organization and exact kind/status', async () => {
  const user = await actor(), other = await actor();
  await queued(user.organizationId, randomUUID(), 'channel:job', 'queued', new Date(now.getTime() - 10_000).toISOString());
  await queued(user.organizationId, randomUUID(), 'channel:job', 'accepted', new Date(now.getTime() - 60_000).toISOString());
  await queued(user.organizationId, randomUUID(), 'learning:job', 'queued', new Date(now.getTime() - 20_000).toISOString());
  await queued(user.organizationId, randomUUID(), 'platform:automation_schedule', 'enabled', new Date(now.getTime() - 30_000).toISOString());
  await queued(other.organizationId, randomUUID(), 'channel:job', 'queued', new Date(now.getTime() - 90_000).toISOString());
  const result = await getOperationsStatus(user, { database: await db(), now: () => now, env: {} });
  assert.deepEqual(Object.fromEntries(result.queues.map(queue => [queue.id, queue.count])), { 'automation-schedules': 1, 'channel-replies': 1, 'learning-jobs': 1 });
  assert.equal(result.queues.find(queue => queue.id === 'channel-replies')?.oldestAgeSeconds, 10);
  assert.equal(result.queues.every(queue => Number.isFinite(queue.count) && (queue.oldestAgeSeconds === null || Number.isFinite(queue.oldestAgeSeconds))), true);
});
