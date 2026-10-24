// What the Operator's model reads of a large tool result: valid JSON, never cut mid-structure, with the ids, hashes and
// statuses the next step needs (server/modules/operator/compact.ts). Real modules for the Operator turn and for the
// size measurement; synthetic data only. The DB tests are skipped when DATABASE_URL is unset.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmReply, type LlmRequest } from '../server/llm.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { CAPS } from '../server/modules/operator/loop.ts';
import { compactJson } from '../server/modules/operator/compact.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let registry: Registry;
let base = '';
let close: () => Promise<void>;

before(async () => {
  if (skip) return;
  process.env.VP_DEV_AUTH = '1';
  pool = createPool(URL_);
  const app = buildApp(pool, modules);
  registry = app.registry;
  await new Promise<void>(res => app.server.listen(0, '127.0.0.1', res));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = async () => { app.server.close(); app.server.closeAllConnections?.(); };
});
after(async () => { setFakeLlm(null); await close?.(); await pool?.end(); });

test('compactJson: small results pass through; large ones become valid JSON under the cap with ids and a marker', () => {
  assert.equal(compactJson({ status: 'confirmed', result: { id: 'a' } }, 100), '{"status":"confirmed","result":{"id":"a"}}');
  const big = {
    status: 'confirmed',
    result: {
      agentId: 'agent-1', draftHash: 'f'.repeat(64), status: 'draft', lint: [{ rule: 'T-L1', message: 'x' }],
      draft: { opening: { usefulFirst: 'u'.repeat(3000) }, facts: Array.from({ length: 200 }, (_, i) => ({ key: 'k' + i, value: 'v'.repeat(40) })) },
      brief: { text: 'b'.repeat(9000), hash: 'h1' },
      items: Array.from({ length: 40 }, (_, i) => ({ id: 'item-' + i, body: 'x'.repeat(300) })),
    },
  };
  const text = compactJson(big, 8_000);
  assert.ok(text.length <= 8_000, `${text.length} chars`);
  const p = JSON.parse(text);
  assert.deepEqual([p.status, p.result.agentId, p.result.draftHash, p.result.status], ['confirmed', 'agent-1', 'f'.repeat(64), 'draft']);
  assert.equal(p.result.lint[0].rule, 'T-L1');
  assert.ok(p.truncated.totalChars > 8_000 && p.truncated.omitted.length > 0);
  const tail = p.result.items[p.result.items.length - 1];
  assert.ok(tail.moreItems > 0 && tail.ids.includes('item-39'), 'the ids of omitted items stay');
  // Pathological nesting still yields valid JSON with the essentials.
  let deep: any = { id: 'leaf', status: 'ok', blob: 'z'.repeat(20_000) };
  for (let i = 0; i < 40; i++) deep = { [`level${i}`]: deep, filler: 'y'.repeat(500) };
  const d = JSON.parse(compactJson({ status: 'confirmed', result: deep }, 2_000));
  assert.ok(d.truncated);
  assert.ok(JSON.stringify(d).includes('leaf'), 'the deep id survives');
});

const seen: LlmRequest[] = [];
const call = (name: string, args: unknown) => ({ id: 'c' + Math.random().toString(36).slice(2), name, args: JSON.stringify(args) });
/** The JSON body of the latest result of one tool, as the model reads it. Throws if it is not valid JSON. */
function readResult(req: LlmRequest, tool: string): any {
  const m = [...req.messages].reverse().find(x => x.role === 'tool' && x.content.includes(`source="tool:${tool}"`));
  assert.ok(m, `no result for ${tool}`);
  return JSON.parse(m.content.replace(/^<data[^>]*>\n/, '').replace(/\n<\/data>$/, ''));
}

test('through the Operator on the real modules, agent.create reads back as valid JSON with agentId and draftHash', { skip }, async () => {
  const w = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('results test') RETURNING id"))!.id;
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1)', [w]);
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [w, `o${Math.random()}@example.test`]))!.id;
  const http = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-vp-dev-member': owner }, body: body === undefined ? undefined : JSON.stringify(body) });
    return r.text();
  };
  const thread = JSON.parse(await http('POST', '/v1/operator/threads', {})).thread.id;
  let created: any;
  const steps: ((req: LlmRequest) => Partial<LlmReply>)[] = [
    () => ({ toolCalls: [call('template_list', {})] }),
    req => ({ toolCalls: [call('agent_create', { name: 'AC service reminders', templateId: readResult(req, 'template.list').result.templates[0].id })] }),
    req => { created = readResult(req, 'agent.create');
      return { toolCalls: [call('stack_set', { agentId: created.result.agentId, stackId: 'v2-flashlite' })] }; },
    () => ({ text: 'The agent is drafted on the chosen stack.' }),
  ];
  let i = 0;
  setFakeLlm(req => { seen.push(req); return { text: '', toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 }, model: 'scripted', provider: 'fake', ...steps[Math.min(i++, steps.length - 1)]!(req) }; });
  const out = await http('POST', `/v1/operator/threads/${thread}/messages`, { text: 'Create an AC service reminder agent from a template.', page: '/agents' });
  assert.ok(created, `the model could not read agent.create's result: ${out.slice(0, 600)}`);
  assert.equal(created.status, 'confirmed');
  assert.match(created.result.agentId, /^[0-9a-f-]{36}$/);
  assert.match(created.result.draftHash, /^[0-9a-f]{64}$/);
  assert.ok(created.truncated, 'the large result was projected, with its marker');
  const cards = out.split('\n\n').filter(f => f.startsWith('event: card')).map(f => JSON.parse(/^data: (.+)$/m.exec(f)![1]!).card);
  assert.deepEqual(cards.map(c => `${c.tool}:${c.status}`), ['agent.create:confirmed', 'stack.set:confirmed'], 'the next step used the ids it read');
  // The web still gets the full result through the tool API.
  const full = await registry.execute<any>(pool, 'agent.get', { agentId: created.result.agentId }, { workspaceId: w, actor: { type: 'member', id: owner, role: 'owner' } });
  assert.ok(full.status === 'confirmed' && JSON.stringify(full.result).length > CAPS.resultChars);
});

test('the largest real results fit the cap as valid JSON; sizes before and after', { skip }, async () => {
  const w = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('results sizes') RETURNING id"))!.id;
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1)', [w]);
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [w, `o${Math.random()}@example.test`]))!.id;
  const run = (n: string, a: unknown) => registry.execute<any>(pool, n, a, { workspaceId: w, actor: { type: 'member', id: owner, role: 'owner' } });
  const r: Record<string, any> = {};
  r['template.list'] = await run('template.list', {});
  r['stack.list'] = await run('stack.list', {});
  r['agent.create'] = await run('agent.create', { name: 'Size test', templateId: r['template.list'].result.templates[0].id });
  const agentId = r['agent.create'].result.agentId;
  r['agent.get'] = await run('agent.get', { agentId });
  r['stack.set'] = await run('stack.set', { agentId, stackId: 'v2-flashlite' });
  const rows: string[] = [];
  for (const [name, rec] of Object.entries(r)) {
    assert.equal(rec.status, 'confirmed', name);
    const view = { status: rec.status, result: rec.result };
    const before = JSON.stringify(view).length;
    const text = compactJson(view, CAPS.resultChars);
    const p = JSON.parse(text);
    assert.ok(text.length <= CAPS.resultChars, `${name}: ${text.length}`);
    if ('agentId' in rec.result) assert.equal(p.result.agentId, rec.result.agentId, name);
    if ('draftHash' in rec.result) assert.equal(p.result.draftHash, rec.result.draftHash, name);
    rows.push(`${name} ${before} -> ${text.length}`);
  }
  const stacks = JSON.parse(compactJson({ status: 'confirmed', result: r['stack.list'].result }, CAPS.resultChars)).result.stacks;
  const ids = stacks.flatMap((s: any) => s.id ? [s.id] : s.ids ?? []);
  assert.deepEqual(ids, r['stack.list'].result.stacks.map((s: any) => s.id), 'every stack id is still named');
  console.log(`# model-visible result chars (full -> compact, cap ${CAPS.resultChars}): ${rows.join('; ')}`);
});
