// agent.create from a template takes the business name from the workspace, never the template's placeholder
// (research/2026-10-23/walkthrough/FRICTION.md, S1). Real agents module; skipped without DATABASE_URL.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { getTemplate } from '../server/modules/agents/templates.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(); registry = buildApp(pool, modules).registry; });
after(async () => { await pool?.end(); });

async function create(wsName: string, brand?: { legal: string; cnap?: string }) {
  const ws = (await one<{ id: string }>(pool, 'INSERT INTO workspace (name) VALUES ($1) RETURNING id', [wsName]))!.id;
  const m = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `b${Math.random()}@example.test`]))!.id;
  if (brand) await pool.query('INSERT INTO brand (workspace_id, legal_name, cnap_name) VALUES ($1,$2,$3)', [ws, brand.legal, brand.cnap ?? null]);
  const r: any = await registry.execute(pool, 'agent.create', { name: 'Follow-up', templateId: 'appliance-service-followup' }, { workspaceId: ws, actor: { type: 'member', id: m, role: 'owner' } });
  assert.equal(r.status, 'confirmed', r.reason);
  return r.result.draft;
}

const tpl = getTemplate('appliance-service-followup')!.config.brand;

test("a template agent takes the workspace brand's names, and the template's names appear nowhere", { skip }, async () => {
  const d = await create('Sharma Cooling (workspace)', { legal: 'Sharma Cooling Services Pvt Ltd', cnap: 'Sharma Cooling' });
  assert.equal(d.brand.name, 'Sharma Cooling Services Pvt Ltd');
  assert.equal(d.brand.spokenName, 'Sharma Cooling');
  const text = JSON.stringify(d);
  for (const placeholder of [tpl.name, tpl.spokenName]) assert.ok(!text.includes(placeholder), `"${placeholder}" left in the draft`);
});

test('without a brand, the workspace name is used for both names', { skip }, async () => {
  const d = await create('Mehta Appliances');
  assert.deepEqual([d.brand.name, d.brand.spokenName], ['Mehta Appliances', 'Mehta Appliances']);
  assert.ok(!JSON.stringify(d).includes(tpl.name));
});
