// The call log names the agent and version each call ran ("Asha, version 3"), from one join: the number of queries
// call.search makes does not grow with the number of calls (open.2026-10-24.call-log-agent-version). Synthetic data only.
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

/** Queries sent by any client while f runs. */
async function counted<T>(f: () => Promise<T>): Promise<{ out: T; n: number }> {
  const proto = pg.Client.prototype as unknown as { query: (...a: unknown[]) => unknown };
  const orig = proto.query; let n = 0;
  proto.query = function (this: unknown, ...a: unknown[]) { n++; return orig.apply(this, a); };
  try { return { out: await f(), n }; } finally { proto.query = orig; }
}

test('call.search and call.get name the agent and version; one join, not a read per call', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('call log agent') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const ctx = { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } as Actor };
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Asha') RETURNING id", [ws]))!.id;
  const v: string[] = [];
  for (let n = 1; n <= 3; n++) v.push((await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,$2,$3,'{}') RETURNING id", [agent, n, `h${n}`]))!.id);
  const mk = async (k: number, version: string | null) => { for (let i = 0; i < k; i++) await pool.query("INSERT INTO conversation (workspace_id, channel, status, agent_version_id) VALUES ($1,'phone','done',$2)", [ws, version]); };
  await mk(1, v[2]); await mk(1, null);

  const few = await counted(() => registry.execute<any>(pool, 'call.search', {}, ctx));
  if (few.out.status !== 'confirmed') return assert.fail(JSON.stringify(few.out));
  const labels = few.out.result.calls.map((c: any) => c.agent?.label ?? null).sort();
  assert.deepEqual(labels, ['Asha, version 3', null], 'a draft test call has no published version to name');
  assert.deepEqual(few.out.result.calls.find((c: any) => c.agent).agent, { id: agent, name: 'Asha', version: 3, label: 'Asha, version 3' });

  await mk(18, v[0]);
  const many = await counted(() => registry.execute<any>(pool, 'call.search', {}, ctx));
  if (many.out.status !== 'confirmed') return assert.fail('search');
  assert.equal(many.out.result.calls.length, 20);
  assert.equal(many.n, few.n, `the same number of queries for 2 calls and 20 (${few.n} and ${many.n})`);

  const id = many.out.result.calls.find((c: any) => c.agent?.version === 1).id;
  const g = await registry.execute<any>(pool, 'call.get', { conversationId: id }, ctx);
  assert.equal(g.status === 'confirmed' && g.result.agent.label, 'Asha, version 1');

  // Another workspace's agent is never named, even if a call points at its version.
  const other = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('other') RETURNING id"))!.id;
  const theirs = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Their agent') RETURNING id", [other]))!.id;
  const tv = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,7,'t7','{}') RETURNING id", [theirs]))!.id;
  const odd = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, channel, status, agent_version_id) VALUES ($1,'phone','done',$2) RETURNING id", [ws, tv]))!.id;
  const og = await registry.execute<any>(pool, 'call.get', { conversationId: odd }, ctx);
  assert.equal(og.status === 'confirmed' && og.result.agent, null);
});
