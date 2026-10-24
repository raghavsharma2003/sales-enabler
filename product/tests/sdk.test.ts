// The TypeScript SDK (product/sdk): generated from the same registry as the HTTP endpoint and MCP, typed calls, and the
// approval flow. The generated file and the catalog must be current. Local server only; synthetic data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { newApiKey } from '../server/auth.ts';
import { createPool, one } from '../server/db.ts';
import { modules } from '../server/modules/index.ts';
import type { Registry } from '../server/tools.ts';
import { generateFromCatalog, outPath, tsType } from '../scripts/sdk-gen.ts';
import { TOOLS, Vyakti, type ToolInput } from '../sdk/index.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let registry: Registry;
let base = '';
let close: () => Promise<void>;

before(async () => {
  if (skip) return;
  pool = createPool(URL_);
  const app = buildApp(pool, modules);
  registry = app.registry;
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = async () => { app.server.close(); app.server.closeAllConnections?.(); };
});
after(async () => { await close?.(); await pool?.end(); });

test('the SDK types are generated from the current catalog, and the catalog lists every registered tool', async () => {
  assert.equal(readFileSync(outPath, 'utf8'), generateFromCatalog(), 'run scripts/tool-catalog.ts then scripts/sdk-gen.ts');
  const { default: pgm } = await import('pg');
  const reg = buildApp(new pgm.Pool({ connectionString: 'postgresql://unused@/unused' }), modules).registry;
  assert.deepEqual(Object.keys(TOOLS).sort(), reg.list().map(t => t.name).sort(), 'the catalog is behind the registry: run scripts/tool-catalog.ts');
  for (const t of reg.list()) assert.equal(TOOLS[t.name as keyof typeof TOOLS].needsApproval, t.needsApproval, t.name);
});

test('JSON Schema to TypeScript covers what the validators emit', () => {
  assert.equal(tsType({ type: 'string', enum: ['a', 'b'] }), '"a" | "b"');
  assert.equal(tsType({ type: 'array', items: { type: 'integer' } }), 'number[]');
  assert.equal(tsType({ type: 'object', additionalProperties: { type: 'string' } }), 'Record<string, string>');
  assert.match(tsType({ type: 'object', properties: { a: { type: 'string' }, 'b-c': { type: 'boolean' } }, required: ['a'] }), /a: string;\n\s+"b-c"\?: boolean;/);
  // Compile-time: a wrong argument is a type error (tsc checks this file).
  // @ts-expect-error templateId is an enum of the starter templates
  const bad: ToolInput['agent.create'] = { name: 'x', templateId: 'not-a-template' };
  void bad;
});

test('typed calls run with the key\'s rights; an approval-class call returns a card; waitForApproval reads the person\'s decision', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('Synthetic SDK Co') RETURNING id"))!.id;
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [ws]);
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const k = newApiKey();
  await pool.query("INSERT INTO api_key (workspace_id, name, prefix, hash) VALUES ($1,'sdk',$2,$3)", [ws, k.prefix, k.hash]);
  const vy = new Vyakti({ baseUrl: base + '/', apiKey: k.token });

  const created = await vy.call('agent.create', { name: 'SDK agent', templateId: 'appliance-service-followup' });
  assert.equal(created.status, 'confirmed', JSON.stringify(created));
  const refused = await vy.call('agent.create', { name: 'x' });
  assert.equal(refused.status, 'not_executed');

  // cap.raise: a spend-class approval whose run needs no payment gateway (wallet.topup's does), so it can complete here.
  const card = await vy.call('cap.raise', { scope: 'workspace', period: 'daily', capInrMilli: 200_000 });
  assert.equal(card.status, 'needs_approval');
  if (card.status !== 'needs_approval') return;
  assert.equal((await vy.approval(card.actionId)).status, 'proposed');
  // A person approves in Vyakti while the SDK waits; the SDK itself has no way to approve.
  let polls = 0;
  const done = await vy.waitForApproval(card.actionId, { intervalMs: 1, sleep: async () => {
    if (++polls === 2) assert.equal((await registry.approve(pool, card.actionId, { workspaceId: ws, memberId: owner })).status, 'confirmed');
  } });
  assert.equal(done.status, 'executed');
  assert.ok(!('approve' in vy), 'no approve method');
  assert.throws(() => new Vyakti({ baseUrl: base, apiKey: 'not-a-key' }));
});
