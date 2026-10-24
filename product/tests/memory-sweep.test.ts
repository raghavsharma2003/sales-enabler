// The memory retention sweep (memory/retention.ts): expired facts and unreviewed proposals go for good, old extraction
// receipts go after the transcripts window, nothing resurfaces, and the audit says how many, never what. Synthetic data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, one } from '../server/db.ts';
import { verifyAudit } from '../server/audit.ts';
import { Registry, type Actor } from '../server/tools.ts';
import { module as memory, sweepMemory } from '../server/modules/memory/index.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
const reg = new Registry();
memory.register(reg);
before(() => { if (!skip) pool = createPool(process.env.DATABASE_URL); });
after(async () => { await pool?.end(); });

let seq = 0;
async function world(transcriptsDays?: number) {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('sweep test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Date.now()}${seq++}@example.test`]))!.id;
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,'Synthetic Asha') RETURNING id", [ws, `+9195000${String(seq++).padStart(5, '0')}`]))!.id;
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'A') RETURNING id", [ws]))!.id;
  await pool.query("INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,'h',$2)", [agent, JSON.stringify({ agent: { category: 'service', memory: { read: true, write: true } } })]);
  await pool.query('INSERT INTO memory_policy (workspace_id, undo_minutes) VALUES ($1, 0)', [ws]);
  if (transcriptsDays) await pool.query("INSERT INTO intake_retention_policy (workspace_id, version, policy, reason) VALUES ($1,1,$2,'test')", [ws, JSON.stringify({ transcripts_days: transcriptsDays })]);
  const member: Actor = { type: 'member', id: owner, role: 'owner' };
  return { ws, contact, agent, member };
}
type W = Awaited<ReturnType<typeof world>>;

const DAY = 86_400_000;
async function fact(w: W, o: { key?: string; value?: string; status?: string; saidDaysAgo?: number; createdDaysAgo?: number; expiresInDays?: number | null; supersededBy?: string }) {
  const said = new Date(Date.now() - (o.saidDaysAgo ?? 0) * DAY), created = new Date(Date.now() - (o.createdDaysAgo ?? o.saidDaysAgo ?? 0) * DAY);
  return (await one<{ id: string }>(pool, `INSERT INTO memory_fact (workspace_id, contact_id, kind, key, value, quote, purpose, basis, status, tier, undo_until, said_at, created_at, expires_at, superseded_by)
    VALUES ($1,$2,'preference',$3,$4,'synthetic words','service','contract',$5,$6, now() - interval '1 minute',$7,$8,$9,$10) RETURNING id`,
    [w.ws, w.contact, o.key ?? 'language', JSON.stringify(o.value ?? 'hi'), o.status ?? 'active', o.status === 'proposed' ? 'review' : 'auto', said, created,
      o.expiresInDays === null ? null : new Date(Date.now() + (o.expiresInDays ?? 10) * DAY), o.supersededBy ?? null]))!.id;
}
const exists = async (id: string) => Boolean(await one(pool, 'SELECT 1 FROM memory_fact WHERE id = $1', [id]));
const brief = async (w: W) => ((await reg.execute<any>(pool, 'memory.brief', { contactId: w.contact, agentId: w.agent }, { workspaceId: w.ws, actor: { type: 'system' } })) as any).result;

test('expired facts are deleted for good and an older value they superseded never resurfaces', { skip }, async () => {
  const w = await world();
  const older = await fact(w, { value: 'en', saidDaysAgo: 40, expiresInDays: 300 });          // durable, still in date, but superseded
  const newer = await fact(w, { value: 'hi', saidDaysAgo: 31, expiresInDays: -1 });           // call_to_call, past its 30 days
  await pool.query('UPDATE memory_fact SET superseded_by = $2 WHERE id = $1', [older, newer]);
  const kept = await fact(w, { key: 'pace', value: 'slow', expiresInDays: 5 });
  assert.equal((await brief(w)).text.includes('language'), false, 'an expired fact is already out of the brief before the sweep');

  const r = await sweepMemory(pool, { workspaceId: w.ws });
  assert.deepEqual(r[w.ws], { expired: 1, unreviewed: 0, extractions: 0 });
  assert.equal(await exists(newer), false);
  assert.equal(await exists(older), true, 'the older fact is not due yet');
  assert.equal(await exists(kept), true);
  const b = await brief(w);
  assert.match(b.text, /pace=slow/);
  assert.doesNotMatch(b.text, /language/, 'the superseded value stays superseded: no resurrection');
});

test('a proposal nobody reviews is dropped after 14 days; approved facts are not', { skip }, async () => {
  const w = await world();
  const stale = await fact(w, { key: 'callback', status: 'proposed', createdDaysAgo: 15, expiresInDays: 20 });
  const fresh = await fact(w, { key: 'send_info', status: 'proposed', createdDaysAgo: 13, expiresInDays: 20 });
  const approved = await fact(w, { key: 'pay_by', status: 'active', createdDaysAgo: 20, expiresInDays: 20 });
  const r = await sweepMemory(pool, { workspaceId: w.ws });
  assert.deepEqual(r[w.ws], { expired: 0, unreviewed: 1, extractions: 0 });
  assert.deepEqual([await exists(stale), await exists(fresh), await exists(approved)], [false, true, true]);
});

test('extraction receipts go once the transcripts window has passed', { skip }, async () => {
  const w = await world(30);
  const conv = async () => (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, contact_id, channel, status) VALUES ($1,$2,'phone','done') RETURNING id", [w.ws, w.contact]))!.id;
  const old = await conv(), recent = await conv();
  await pool.query(`INSERT INTO memory_extraction (workspace_id, conversation_id, status, counts, created_at) VALUES ($1,$2,'done','{"stored":1}', now() - interval '31 days'),
    ($1,$3,'done','{"stored":2}', now() - interval '29 days')`, [w.ws, old, recent]);
  const r = await sweepMemory(pool, { workspaceId: w.ws });
  assert.equal(r[w.ws].extractions, 1);
  assert.equal(Boolean(await one(pool, 'SELECT 1 FROM memory_extraction WHERE conversation_id = $1', [old])), false);
  assert.equal(Boolean(await one(pool, 'SELECT 1 FROM memory_extraction WHERE conversation_id = $1', [recent])), true);
});

test('the audit row says how many went, never what; nothing to delete writes no row; the chain stays intact', { skip }, async () => {
  const w = await world();
  await fact(w, { value: 'Synthetic secret value', expiresInDays: -2 });
  await fact(w, { key: 'callback', status: 'proposed', createdDaysAgo: 20, expiresInDays: 5 });
  await sweepMemory(pool, { workspaceId: w.ws });
  const rows = (await pool.query("SELECT actor_id, payload FROM audit_event WHERE workspace_id = $1 AND action = 'memory.retention_sweep'", [w.ws])).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].payload, { expired: 1, unreviewed: 1, extractions: 0 });
  assert.equal(rows[0].actor_id, 'memory.retention');
  assert.doesNotMatch(JSON.stringify(rows), /Synthetic|secret|synthetic words|callback/);
  await sweepMemory(pool, { workspaceId: w.ws });
  assert.equal((await pool.query("SELECT 1 FROM audit_event WHERE workspace_id = $1 AND action = 'memory.retention_sweep'", [w.ws])).rowCount, 1, 'an empty run writes no row');
  assert.equal(await verifyAudit(pool, w.ws), null);
});

test('memory.policy.get shows the rules, what is due now and what the last sweep removed', { skip }, async () => {
  const w = await world(45);
  await fact(w, { expiresInDays: -1 });
  await fact(w, { key: 'callback', status: 'proposed', createdDaysAgo: 16 });
  const get = async () => ((await reg.execute<any>(pool, 'memory.policy.get', {}, { workspaceId: w.ws, actor: w.member })) as any).result.retention;
  const before_ = await get();
  assert.deepEqual(before_.rules, { callToCallDays: 30, durableDays: 365, unreviewedDays: 14, extractionReceiptsDays: 45 });
  assert.deepEqual(before_.dueNow, { expired: 1, unreviewed: 1 });
  assert.equal(before_.lastSweep, null);
  await sweepMemory(pool, { workspaceId: w.ws });
  const after_ = await get();
  assert.deepEqual(after_.dueNow, { expired: 0, unreviewed: 0 });
  assert.deepEqual({ ...after_.lastSweep, at: undefined }, { at: undefined, expired: 1, unreviewed: 1, extractions: 0 });
});

test('a sweep scoped to one workspace leaves the others; an unscoped run reaches all', { skip }, async () => {
  const a = await world(), b = await world();
  const fa = await fact(a, { expiresInDays: -1 }), fb = await fact(b, { expiresInDays: -1 });
  await sweepMemory(pool, { workspaceId: a.ws });
  assert.deepEqual([await exists(fa), await exists(fb)], [false, true]);
  await sweepMemory(pool);
  assert.equal(await exists(fb), false);
});
