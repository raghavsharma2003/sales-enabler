// Erasure and retention reach the audio (calls/recording-purge.ts): the runtime is asked to delete the file, and the row
// is marked only once it confirms. Idempotent, safe across restarts. A fake runtime here; calls-live.test.ts runs the
// same purge against the real runtime process (devsim). Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { FakeRuntime, setRuntime } from '../server/runtime-client.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { purgeRecordings } from '../server/modules/calls/recording-purge.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry, rt: FakeRuntime;
before(() => { if (skip) return; pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, [calls]).registry; rt = new FakeRuntime(); setRuntime(rt); });
after(async () => { setRuntime(null); await pool?.end(); });

let phone = 9100000000;
async function workspace(retentionDays?: number) {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('purge test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  if (retentionDays) await pool.query("INSERT INTO intake_retention_policy (workspace_id, version, policy, reason) VALUES ($1,1,$2,'test')", [ws, JSON.stringify({ recordings_days: retentionDays })]);
  return { ws, ctx: { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } as Actor } };
}
async function recorded(ws: string, endedDaysAgo: number) {
  const contact = (await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164) VALUES ($1,$2) RETURNING id', [ws, `+91${phone++}`]))!.id;
  const id = (await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, contact_id, channel, status, ended_at, recording_uri)
    VALUES ($1,$2,'phone','done', now() - make_interval(days => $3), 'file:///recordings/x.wav') RETURNING id`, [ws, contact, endedDaysAgo]))!.id;
  return { id, contact };
}
const row = async (id: string) => (await one<any>(pool, 'SELECT recording_uri, recording_purged_at, recording_purge_reason FROM conversation WHERE id = $1', [id]))!;

test('after retention or an erase request the runtime deletes the audio, the row says why, and the link is gone', { skip }, async () => {
  const a = await workspace(), b = await workspace(30);
  const old = await recorded(a.ws, 91), recent = await recorded(a.ws, 5), erased = await recorded(a.ws, 1), bOld = await recorded(b.ws, 40), bRecent = await recorded(b.ws, 20);
  await pool.query("INSERT INTO forget_request (workspace_id, contact_id, scope) VALUES ($1,$2,'erase_me')", [a.ws, erased.contact]);
  rt.purged = [];
  const r1 = await purgeRecordings(pool);
  const asked = new Map(rt.purged.map(p => [p.id, p]));
  assert.deepEqual(asked.get(old.id), { id: old.id, workspaceId: a.ws, reason: 'retention' }, 'past the default 90 days');
  assert.deepEqual(asked.get(erased.id), { id: erased.id, workspaceId: a.ws, reason: 'erased' }, 'erasure reaches the audio at once, whatever the age');
  assert.deepEqual(asked.get(bOld.id), { id: bOld.id, workspaceId: b.ws, reason: 'retention' }, "each workspace's own policy, and its own id on the request");
  assert.ok(!asked.has(recent.id) && !asked.has(bRecent.id), 'nothing inside its window');
  assert.ok(r1.purged >= 3);
  for (const [c, why] of [[old, 'retention'], [erased, 'erased'], [bOld, 'retention']] as const) {
    const x = await row(c.id);
    assert.equal(x.recording_uri, null); assert.ok(x.recording_purged_at); assert.equal(x.recording_purge_reason, why);
  }
  assert.ok((await row(recent.id)).recording_uri);
  const g = await registry.execute<any>(pool, 'call.get', { conversationId: erased.id }, a.ctx);
  assert.deepEqual(g.status === 'confirmed' && g.result.recording, { url: null, expiresAt: null, why: 'The recording was deleted because the person asked to be erased.' });
  const g2 = await registry.execute<any>(pool, 'call.get', { conversationId: old.id }, a.ctx);
  assert.match(g2.status === 'confirmed' ? g2.result.recording.why : '', /deleted when this workspace's recordings retention ended/);

  // Idempotent: nothing left to do for these calls on the next run.
  rt.purged = [];
  await purgeRecordings(pool, { workspaceId: a.ws });
  assert.deepEqual(rt.purged, []);
});

test('a purge the runtime does not confirm is retried; a run cut short after the delete is finished by the next one', { skip }, async () => {
  const a = await workspace();
  const c = await recorded(a.ws, 100);
  rt.purgeFails = true;
  const r = await purgeRecordings(pool, { workspaceId: a.ws });
  rt.purgeFails = false;
  assert.deepEqual(r, { purged: 0, failed: 1 });
  assert.ok((await row(c.id)).recording_uri, 'not marked while the file may still be there');
  // A restart between the runtime's delete and the row update: the runtime already deleted it; the next run marks it.
  const d = await recorded(a.ws, 100);
  await rt.purgeRecording(d.id, a.ws, 'retention');
  const r2 = await purgeRecordings(pool, { workspaceId: a.ws });
  assert.equal(r2.purged, 2);
  assert.equal((await row(d.id)).recording_purge_reason, 'retention');
  assert.equal((await row(c.id)).recording_purge_reason, 'retention');
  assert.equal((await many(pool, 'SELECT 1 FROM conversation WHERE workspace_id = $1 AND recording_uri IS NOT NULL', [a.ws])).length, 0);
});
