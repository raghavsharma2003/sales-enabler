// brief.edit paths in the forms models actually send (research/2026-10-23/benches/README.md, gap 4): JSON Pointer with
// "-" appends (/facts/-), a leading /draft, numeric segments (facts.0.value), RFC 6902 op names (add, replace); and a
// wrong field (facts[0].label) refused with the fields that exist. Real agents module; skipped without DATABASE_URL.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(); registry = buildApp(pool, modules).registry; });
after(async () => { await pool?.end(); });

async function agent() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('patch test') RETURNING id"))!.id;
  const m = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `p${Math.random()}@example.test`]))!.id;
  const run = (n: string, a: unknown): Promise<any> => registry.execute(pool, n, a, { workspaceId: ws, actor: { type: 'member', id: m, role: 'owner' } });
  const a = await run('agent.create', { name: 'Patch test', templateId: 'appliance-service-followup' });
  const draft = async () => (await one<{ draft: any }>(pool, 'SELECT draft FROM agent WHERE id = $1', [a.result.agentId]))!.draft;
  return { run, agentId: a.result.agentId as string, draft };
}

test('JSON Pointer paths, "-" appends, a /draft prefix, numeric segments and RFC 6902 op names are accepted', { skip }, async () => {
  const { run, agentId, draft } = await agent();
  const fact = { key: 'helpline', value: '1800 200 3000', purpose: 'service', source: 'agent.form' };
  const cases: [string, unknown][] = [
    ['append to /facts/-', [{ op: 'append', path: '/facts/-', value: fact }]],
    ['add to /neverSay/-', [{ op: 'add', path: '/neverSay/-', value: 'discounts' }]],
    ['set /languages/primary', [{ op: 'set', path: '/languages/primary', value: 'hi-IN' }]],
    ['replace /draft/persona/energy', [{ op: 'replace', path: '/draft/persona/energy', value: 2 }]],
    ['set persona.notes.0', [{ op: 'set', path: 'persona.notes.0', value: 'calm and brief' }]],
    ['append neverSay[-]', [{ op: 'append', path: 'neverSay[-]', value: 'competitor names' }]],
    ['add at /neverSay/0 inserts', [{ op: 'add', path: '/neverSay/0', value: 'prices' }]],
  ];
  for (const [label, patch] of cases) {
    const r = await run('brief.edit', { agentId, patch });
    assert.equal(r.status, 'confirmed', `${label}: ${r.reason}`);
  }
  const d = await draft();
  assert.deepEqual(d.facts.at(-1), fact);
  assert.deepEqual(d.neverSay, ['prices', 'discounts', 'competitor names']);
  assert.equal(d.languages.primary, 'hi-IN');
  assert.equal(d.persona.energy, 2);
  assert.equal(d.persona.notes[0], 'calm and brief');
});

test('a field that does not exist is refused with the fields that do, and the accepted path form', { skip }, async () => {
  const { run, agentId } = await agent();
  const r = await run('brief.edit', { agentId, patch: [{ op: 'set', path: 'facts[0].label', value: 'Helpline' }] });
  assert.equal(r.status, 'not_executed');
  assert.match(r.reason, /label/);
  assert.match(r.reason, /the fields there are: key, value/);
  assert.match(r.reason, /purpose/);
  const bad = await run('brief.edit', { agentId, patch: [{ op: 'set', path: 'persona..name', value: 'x' }] });
  assert.equal(bad.status, 'not_executed');
  assert.match(bad.reason, /persona\.notes\[0\]|\/facts\/-/, 'the refusal names the accepted forms');
});
