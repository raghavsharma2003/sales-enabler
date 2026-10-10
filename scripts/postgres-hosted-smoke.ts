/**
 * Usage (only from the deployed App Service/Kudu environment after a private
 * PostgreSQL server exists):
 *   POSTGRES_HOSTED_SMOKE=1 node --import tsx scripts/postgres-hosted-smoke.ts --run
 *
 * This deliberately does not contact providers, email, Azure APIs, or HTTP
 * endpoints. It creates two random synthetic tenants and removes only those
 * exact rows in one final database transaction. It never drops, truncates, or
 * searches for production fixtures.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { accountRegistrationStatements } from '../lib/auth-lifecycle/service';
import { db, type Database } from '../lib/server/db';
import { hashPassword, type AuthUser } from '../lib/server/auth';
import { createRecord, listRecords, updateRecord } from '../lib/platform/records';
import { ownerRegistrationStatements } from '../lib/team/service';
import { closeOwnedVoiceAttempt } from '../lib/usage/service';
import type { VoiceAttemptRecord } from '../lib/usage/contracts';

type Stage = 'configuration' | 'bootstrap' | 'auth_store' | 'tenant_isolation' | 'platform_order' | 'rollback' | 'voice_close' | 'cleanup';
type Result = { status: 'completed' | 'failed' | 'refused'; stage: Stage | 'configuration'; schemaBootstrapped: boolean; authStore: boolean; tenantIsolation: boolean; platformOrder: boolean; rollback: boolean; voiceReservationClosed: boolean; cleanup: boolean };
type Statement = Parameters<Database['batch']>[0][number];

function report(result: Result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function refuse(code: 'explicit_opt_in_required' | 'production_node_env_required' | 'postgres_database_url_required') {
  process.stdout.write(`status=refused code=${code}\n`);
  process.exitCode = 2;
}

function checkConfiguration(): boolean {
  if (process.env.POSTGRES_HOSTED_SMOKE !== '1' || !process.argv.includes('--run')) {
    refuse('explicit_opt_in_required');
    return false;
  }
  if (process.env.NODE_ENV !== 'production') {
    refuse('production_node_env_required');
    return false;
  }
  try {
    const url = new URL(process.env.DATABASE_URL || '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) throw new Error();
  } catch {
    refuse('postgres_database_url_required');
    return false;
  }
  return true;
}

function syntheticUser(run: string, organizationId: string): AuthUser {
  return {
    id: randomUUID(),
    // `example.invalid` is reserved and no address or value is ever logged.
    email: `pg-smoke-${run}-${randomUUID()}@example.invalid`,
    organizationId,
    role: 'owner',
  };
}

async function seedTenant(database: Database, user: AuthUser, label: string, now: string) {
  const passwordHash = await hashPassword('synthetic-postgres-smoke-only');
  const sessionHash = sha(randomBytes(32).toString('hex'));
  const statements: Statement[] = [
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, `Synthetic PostgreSQL smoke ${label}`, now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, passwordHash, user.organizationId, now] },
    ...ownerRegistrationStatements(user),
    ...accountRegistrationStatements(user),
    { sql: 'INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)', params: [sessionHash, user.id, new Date(Date.parse(now) + 60_000).toISOString()] },
  ];
  await database.batch(statements);
}

async function cleanup(database: Database, users: AuthUser[]) {
  const organizations = users.map(user => user.organizationId);
  const userIds = users.map(user => user.id);
  await database.batch([
    { sql: 'DELETE FROM audit_events WHERE organization_id IN (?,?)', params: organizations },
    { sql: 'DELETE FROM auth_sessions WHERE user_id IN (?,?)', params: userIds },
    { sql: 'DELETE FROM entities WHERE organization_id IN (?,?)', params: organizations },
    { sql: 'DELETE FROM users WHERE id IN (?,?)', params: userIds },
    { sql: 'DELETE FROM organizations WHERE id IN (?,?)', params: organizations },
  ]);
}

async function verifyPlatformOrderAndRollback(database: Database, user: AuthUser, run: string, now: string): Promise<{ platformOrder: boolean; rollback: boolean }> {
  const first = await createRecord(user, 'postgres_smoke_order', { fixture: true, position: 1, run }, 'draft');
  const updated = await updateRecord(user, first, { fixture: true, position: 2, run }, 'ready');
  const second = await createRecord(user, 'postgres_smoke_order', { fixture: true, position: 3, run }, 'ready');
  const records = await listRecords<{ fixture: boolean; position: number; run: string }>(user.organizationId, 'postgres_smoke_order');
  const expected = new Set([updated.id, second.id]);
  const ordered = records.length === 2 && records.every(record => expected.has(record.id) && record.data.fixture && record.data.run === run) && records.every((record, index) => {
    const prior = records[index - 1];
    return !prior || prior.createdAt > record.createdAt || (prior.createdAt === record.createdAt && prior.id >= record.id);
  });

  const rollbackId = `postgres-smoke-rollback:${run}`;
  let rejected = false;
  try {
    await database.batch([
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [rollbackId, user.organizationId, 'platform:postgres_smoke_rollback', 'draft', JSON.stringify({ fixture: true, run }), now] },
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [rollbackId, user.organizationId, 'platform:postgres_smoke_rollback', 'draft', JSON.stringify({ fixture: true, run }), now] },
    ]);
  } catch { rejected = true; }
  const persisted = await database.all('SELECT id FROM entities WHERE id=? AND organization_id=? AND kind=?', [rollbackId, user.organizationId, 'platform:postgres_smoke_rollback']);
  return { platformOrder: ordered, rollback: rejected && persisted.length === 0 };
}

async function verifyVoiceReservationClosure(database: Database, user: AuthUser, run: string, now: string): Promise<boolean> {
  const attemptId = `postgres-smoke-voice:${run}`;
  const capacityId = `voice:capacity:${sha(user.organizationId)}`;
  const attempt: VoiceAttemptRecord = {
    id: attemptId,
    organizationId: user.organizationId,
    userId: user.id,
    provider: 'azure',
    purpose: 'voice_live',
    state: 'active',
    requestHash: sha(`synthetic:${run}`),
    createdAt: now,
    deadlineAt: new Date(Date.parse(now) + 60_000).toISOString(),
    maxSeconds: 60,
  };
  // This is an explicit fixture reservation. Calling beginVoiceAttempt would
  // require a real supervisor heartbeat and hosted admission configuration.
  await database.batch([
    { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [capacityId, user.organizationId, 'voice:capacity', 'active', JSON.stringify({ live: [{ id: attemptId, userId: user.id }] }), now] },
    { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [attemptId, user.organizationId, 'voice:attempt', 'active', JSON.stringify(attempt), now] },
  ]);
  const closed = await closeOwnedVoiceAttempt(user, attemptId, { outcome: 'complete' }, { database });
  const [savedAttempt] = await database.all<{ status: string; data: string }>('SELECT status,data FROM entities WHERE id=? AND organization_id=? AND kind=?', [attemptId, user.organizationId, 'voice:attempt']);
  const [savedCapacity] = await database.all<{ data: string }>('SELECT data FROM entities WHERE id=? AND organization_id=? AND kind=?', [capacityId, user.organizationId, 'voice:capacity']);
  const live = savedCapacity ? JSON.parse(savedCapacity.data) as { live?: Array<{ id?: string }> } : {};
  return closed?.state === 'closed' && savedAttempt?.status === 'closed' && !live.live?.some(item => item.id === attemptId);
}

async function main() {
  if (!checkConfiguration()) return;
  let stage: Stage = 'bootstrap';
  const result: Result = { status: 'failed', stage, schemaBootstrapped: false, authStore: false, tenantIsolation: false, platformOrder: false, rollback: false, voiceReservationClosed: false, cleanup: false };
  let database: Database | undefined;
  const run = randomUUID().replaceAll('-', '');
  const userA = syntheticUser(run, randomUUID());
  const userB = syntheticUser(run, randomUUID());
  try {
    database = await db();
    if (database.dialect !== 'postgres') throw new Error('postgres_adapter_not_selected');
    result.schemaBootstrapped = true;

    stage = 'auth_store'; result.stage = stage;
    const now = new Date().toISOString();
    await seedTenant(database, userA, 'A', now);
    await seedTenant(database, userB, 'B', now);
    const authRows = await database.all('SELECT u.id,s.token_hash FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id IN (?,?)', [userA.id, userB.id]);
    result.authStore = authRows.length === 2;
    if (!result.authStore) throw new Error('auth_store_failed');

    stage = 'tenant_isolation'; result.stage = stage;
    const tenantB = await createRecord(userB, 'postgres_smoke_isolation', { fixture: true, run }, 'ready');
    const seenByA = await database.all('SELECT id FROM entities WHERE organization_id=? AND id=? AND kind=?', [userA.organizationId, tenantB.id, 'platform:postgres_smoke_isolation']);
    const listedByA = await listRecords(userA.organizationId, 'postgres_smoke_isolation');
    result.tenantIsolation = seenByA.length === 0 && listedByA.length === 0;
    if (!result.tenantIsolation) throw new Error('tenant_isolation_failed');

    stage = 'platform_order'; result.stage = stage;
    const platform = await verifyPlatformOrderAndRollback(database, userA, run, now);
    result.platformOrder = platform.platformOrder;
    result.rollback = platform.rollback;
    if (!result.platformOrder || !result.rollback) throw new Error('platform_transaction_failed');

    stage = 'voice_close'; result.stage = stage;
    result.voiceReservationClosed = await verifyVoiceReservationClosure(database, userA, run, now);
    if (!result.voiceReservationClosed) throw new Error('voice_closure_failed');
    result.status = 'completed';
  } catch {
    result.status = 'failed';
  } finally {
    stage = 'cleanup'; result.stage = stage;
    if (database) {
      try { await cleanup(database, [userA, userB]); result.cleanup = true; }
      catch { result.cleanup = false; result.status = 'failed'; }
    }
    report(result);
    if (result.status !== 'completed' || !result.cleanup) process.exitCode = 1;
  }
}

void main();
