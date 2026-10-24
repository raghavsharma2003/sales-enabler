// The call log shows each call's reply gap (must-be 13): the median and the slowest of her timed replies, as the voice
// runtime measured them (turn.latency.latencyMs), from the same query as the list. A call with no timed reply says so
// (null), never 0. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { module as calls } from '../server/modules/calls/index.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, [calls]).registry; });
after(async () => { await pool?.end(); });

async function counted<T>(f: () => Promise<T>): Promise<{ out: T; n: number }> {
  const proto = pg.Client.prototype as unknown as { query: (...a: unknown[]) => unknown };
  const orig = proto.query; let n = 0;
  proto.query = function (this: unknown, ...a: unknown[]) { n++; return orig.apply(this, a); };
  try { return { out: await f(), n }; } finally { proto.query = orig; }
}

test('call.search gives each call its median and slowest reply gap from timed agent turns; none timed is null, not 0', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('call log latency') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const ctx = { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } as Actor };
  const conv = async (turns: [string, number | null][]) => {
    const id = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, channel, status) VALUES ($1,'phone','done') RETURNING id", [ws]))!.id;
    let i = 0;
    for (const [speaker, ms] of turns) await pool.query('INSERT INTO turn (conversation_id, idx, speaker, text, latency) VALUES ($1,$2,$3,$4,$5)',
      [id, i++, speaker, 'synthetic line', ms == null ? null : { latencyMs: ms, tone: null }]);
    return id;
  };
  const timed = await conv([['agent', null], ['caller', null], ['agent', 900], ['caller', null], ['agent', 1500], ['caller', null], ['agent', 2400]]);
  const untimed = await conv([['agent', null], ['caller', null], ['agent', null]]);
  const silent = await conv([]);

  const r = await counted(() => registry.execute<any>(pool, 'call.search', {}, ctx));
  if (r.out.status !== 'confirmed') return assert.fail(JSON.stringify(r.out));
  const by = new Map(r.out.result.calls.map((c: any) => [c.id, c.reply]));
  assert.deepEqual(by.get(timed), { medianMs: 1500, slowestMs: 2400, timed: 3 }, 'three timed replies: 900, 1500, 2400');
  assert.equal(by.get(untimed), null, 'replies the runtime did not time give no figure');
  assert.equal(by.get(silent), null, 'no turns, no figure');

  // Still one list query: more calls do not add reads.
  for (let k = 0; k < 15; k++) await conv([['caller', null], ['agent', 1000 + k]]);
  const more = await counted(() => registry.execute<any>(pool, 'call.search', {}, ctx));
  assert.equal(more.n, r.n, `the same number of queries for 3 calls and 18 (${r.n} and ${more.n})`);
});
