// Money, buyer walkthrough round 2 (2026-10-24): R4, each part a stack can be built from has a ₹-per-minute figure
// (USD only as the basis note), and R5, a guard that no money tool's result, and no stored cost-card row, says "VP".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, many, one } from '../server/db.ts';
import { Registry, type Actor } from '../server/tools.ts';
import { register as registerMoney } from '../server/modules/money/index.ts';
import { module as agents } from '../server/modules/agents/index.ts';
import { COMPONENTS } from '../shared/components.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let reg: Registry;
before(async () => {
  if (skip) return;
  pool = createPool(URL_);
  reg = new Registry();
  registerMoney(reg);
  agents.register(reg);
});
after(async () => { await pool?.end(); });

async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('parts test (synthetic)') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `p${Math.random()}@example.test`]))!.id;
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [ws]);
  return { ws, owner };
}
const run = async (name: string, args: unknown, ws: string, actor: Actor = { type: 'system' }) => {
  const r = await reg.execute(pool, name, args, { workspaceId: ws, actor });
  if (r.status !== 'confirmed') throw new Error(`${name}: ${r.status} ${'reason' in r ? r.reason : ''}`);
  return r.result as any;
};

// ---------------------------------------------------------------- R4: parts in ₹ per minute

test('R4: money.parts gives every buildable part a ₹ figure per minute, USD only as the basis', { skip }, async () => {
  const { ws } = await workspace();
  const out = await run('money.parts', {}, ws);
  const byKey = new Map<string, any>(out.parts.map((p: any) => [`${p.part}:${p.id}`, p]));
  for (const c of COMPONENTS) {
    const p = byKey.get(`${c.part}:${c.id}`);
    assert.ok(p, `no figure for ${c.part} ${c.id}`);
    assert.match(p.display, /^₹[\d,]+\.\d{2} a minute$/, `${c.id}: ${p.display}`);
    assert.doesNotMatch(p.display, /\$/);
  }
  // by hand: Azure Speech $1.00 per audio hour, half the minute heard (gated) at ₹95/$ = 1/60 x 0.5 x 95 = ₹0.79167
  const ears = byKey.get('ears:azure');
  assert.equal(ears.inrMicroPerMin, 791_667);
  assert.equal(ears.display, '₹0.79 a minute');
  assert.match(ears.basis, /\$1\.00 per audio hour/);
  assert.match(ears.basis, /₹95 to the US dollar/);
  // Gemini 3.5 Flash-Lite: 4 replies x (2000 x $0.30 + 60 x $2.50)/1e6 x 95 = ₹0.285
  assert.equal(byKey.get('brain:gemini-3.5-flash-lite').inrMicroPerMin, 285_000);
  // Sarvam voice: 450 chars x ₹20 per 10,000 = ₹0.90 (priced in rupees: no dollar conversion in its basis)
  assert.equal(byKey.get('voice:sarvam').inrMicroPerMin, 900_000);
  assert.doesNotMatch(byKey.get('voice:sarvam').basis, /US dollar/);
  // the per-call extras every built stack carries, so parts + extras = the all-in figure
  assert.equal(out.extrasInrMicroPerMin, 380_000 + 30_000 + 60_000);
});

test('R4: a built stack\'s parts add up to its all-in ₹ per minute from money.estimate', { skip }, async () => {
  const { ws } = await workspace();
  const { parts, extrasInrMicroPerMin } = await run('money.parts', {}, ws);
  const fig = (part: string, id: string) => parts.find((p: any) => p.part === part && p.id === id).inrMicroPerMin;
  const components = { ears: 'azure', brain: 'gpt-4.1-mini-in', voice: 'azure-hd' };
  const est = await run('money.estimate', { stackId: 'custom', components, minutes: 1, calls: 0 }, ws);
  const sum = fig('ears', 'azure') + fig('brain', 'gpt-4.1-mini-in') + fig('voice', 'azure-hd') + extrasInrMicroPerMin;
  assert.equal(est.perMinuteInrMilli, Math.round(sum / 1000));
  assert.match(est.display.perMinute, /^₹[\d,]+\.\d{2}\/min$/);
});

test('R4: stack.list shows each part\'s price in ₹ a minute, keeping the list price as its basis', { skip }, async () => {
  const { ws, owner } = await workspace();
  const out = await run('stack.list', {}, ws, { type: 'member', id: owner, role: 'owner' });
  assert.ok(out.components.length >= COMPONENTS.length);
  for (const c of out.components) {
    assert.match(c.price, /₹[\d,]+\.\d{2} a minute/, `${c.part} ${c.id}: ${c.price}`);
    assert.doesNotMatch(c.price, /\$/, `${c.part} ${c.id} still prices in dollars: ${c.price}`);
    assert.equal(typeof c.priceBasis, 'string');
  }
  const azure = out.components.find((c: any) => c.part === 'ears' && c.id === 'azure');
  assert.match(azure.priceBasis, /\$1\.00 per audio hour/);
});

// ---------------------------------------------------------------- R5: no "VP" in what a buyer reads

test('R5: no money read tool\'s result says "VP"', { skip }, async () => {
  const { ws } = await workspace();
  const reads: [string, unknown][] = [
    ['money.estimate', { stackId: 'v2-flashlite', minutes: 10, calls: 2 }],
    ['money.estimate', { stackId: 'custom', components: { ears: 'azure', brain: 'gpt-4.1', voice: 'azure' }, minutes: 3, calls: 1 }],
    ['money.card', { stackId: 'v2-flashlite' }],
    ['money.parts', {}],
    ['money.carriers', {}],
    ['wallet.get', {}],
    ['wallet.check', { purpose: 'launch', needInrMilli: 60_000 }],
    ['usage.get', { groupBy: 'component' }],
    ['invoice.get', {}],
  ];
  const moneyReads = reg.list().filter(t => t.risk === 'read' && /^(money|wallet|usage|invoice)\./.test(t.name)).map(t => t.name);
  assert.deepEqual([...new Set(reads.map(r => r[0]))].sort(), moneyReads.sort(), 'every money read tool is covered by this guard');
  for (const [name, args] of reads) assert.doesNotMatch(JSON.stringify(await run(name, args, ws)), /\bVP\b/, name);
  for (const t of reg.list().filter(t => /^(money|wallet|usage|invoice|cap|plan)\./.test(t.name))) assert.doesNotMatch(t.summary, /\bVP\b/, t.name);
});

test('R5: no stored cost-card text says "VP"', { skip }, async () => {
  const rows = await many<{ t: string }>(pool, "SELECT provider || ' ' || unit_price || ' ' || usage AS t FROM cost_card");
  assert.ok(rows.length > 0);
  for (const r of rows) assert.doesNotMatch(r.t, /\bVP\b/, r.t);
});
