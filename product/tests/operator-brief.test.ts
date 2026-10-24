// brief.today names who asked for each approval (research/2026-10-24/walkthrough/FRICTION.md R7): a member, a member's
// assistant, an API key, or Vyakti itself; and the web sheet's wording for each. Real modules; synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { modules } from '../server/modules/index.ts';
import type { Registry } from '../server/tools.ts';
import { requesterLine } from '../web/src/labels.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let registry: Registry;
before(() => { if (skip) return; pool = createPool(URL_); registry = buildApp(pool, modules).registry; });
after(async () => { await pool?.end(); });

test('brief.today: every waiting approval says who asked, by kind and display name', { skip }, async () => {
  const w = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('Synthetic Lending') RETURNING id"))!.id;
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [w]);
  const meera = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, name, role) VALUES ($1,$2,'Meera Synthetic','owner') RETURNING id", [w, `meera${Math.random()}@example.test`]))!.id;
  const ravi = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'operator') RETURNING id", [w, `ravi.s${Math.random().toString().slice(2, 6)}@example.test`]))!.id;
  const key = (await one<{ id: string }>(pool, "INSERT INTO api_key (workspace_id, name, prefix, hash) VALUES ($1,'CRM sync','abcd1234','x') RETURNING id", [w]))!.id;
  const topup = (actor: Parameters<Registry['execute']>[3]['actor']) => registry.execute(pool, 'wallet.topup', { inrMilli: 100_000 }, { workspaceId: w, actor });
  for (const r of [await topup({ type: 'member', id: meera, role: 'owner' }), await topup({ type: 'agent', id: 'operator:' + ravi, role: 'operator' }),
    await topup({ type: 'member', id: 'key:' + key, role: 'builder' }), await topup({ type: 'system' })]) assert.equal(r.status, 'needs_approval', JSON.stringify(r));
  const b = await registry.execute<any>(pool, 'brief.today', {}, { workspaceId: w, actor: { type: 'member', id: meera, role: 'owner' } });
  assert.equal(b.status, 'confirmed');
  const by = (b as any).result.needsTap.items.map((i: any) => i.requestedBy);
  assert.deepEqual(by, [
    { type: 'member', name: 'Meera Synthetic', memberId: meera },
    { type: 'assistant', name: (await one<{ e: string }>(pool, 'SELECT split_part(email, \'@\', 1) AS e FROM member WHERE id = $1', [ravi]))!.e, memberId: ravi },
    { type: 'api_key', name: 'CRM sync', memberId: null },
    { type: 'system', name: 'Vyakti', memberId: null },
  ]);
  // No raw join columns leak into the item.
  assert.deepEqual(Object.keys((b as any).result.needsTap.items[0]).sort(), ['created_at', 'expires_at', 'id', 'requestedBy', 'risk', 'summary', 'tool']);
});

test('the approval sheet says who asked', () => {
  assert.equal(requesterLine({ type: 'member', name: 'Meera', memberId: 'm1' }, 'm1'), 'You asked for this');
  assert.equal(requesterLine({ type: 'member', name: 'Meera', memberId: 'm1' }, 'm2'), 'Meera asked');
  assert.equal(requesterLine({ type: 'assistant', name: 'Meera', memberId: 'm1' }, 'm2'), 'The assistant asked for Meera');
  assert.equal(requesterLine({ type: 'assistant', name: 'Meera', memberId: 'm1' }, 'm1'), 'The assistant asked for you');
  assert.equal(requesterLine({ type: 'api_key', name: 'CRM sync', memberId: null }), 'API key "CRM sync" asked');
  assert.equal(requesterLine({ type: 'system', name: 'Vyakti', memberId: null }), 'Vyakti asked');
});
