// In-call tools, control-plane half (must-be audit, brief 3): the HTTP tool contract (shared/contracts/http-tool.ts),
// tool.create / edit / list / test (a dry run: nothing is sent), granting by id, the version snapshot that the ticket
// carries, and the built-ins that are declared but not available yet (P7: what you see is what runs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildRequest, checkSpec, readResult, ticketTools, validateArgs, type HttpToolSpec } from '../shared/contracts/http-tool.ts';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { TEMPLATES } from '../server/modules/agents/templates.ts';

const spec = (o: Partial<HttpToolSpec> = {}): HttpToolSpec => ({
  contract: 1, kind: 'http', name: 'order_status', description: 'Look up where an order is when the caller asks about delivery.',
  input: { type: 'object', properties: { order_id: { type: 'string', maxLength: 20 }, detail: { type: 'boolean' } }, required: ['order_id'] },
  request: { method: 'GET', url: 'https://api.example.test/orders/{order_id}', query: ['detail'] },
  auth: { integrationId: '00000000-0000-4000-8000-000000000001', header: 'Authorization', secretKey: 'api_key', prefix: 'Bearer ' },
  timeoutMs: 2000, risk: 'read', result: { fields: ['status', 'eta.date', 'items'] }, ...o,
});

test('the contract refuses what a call cannot run: plain http, internal hosts, IPs, slow tools and tools that reach people', () => {
  assert.doesNotThrow(() => checkSpec(spec()));
  const bad: [Partial<HttpToolSpec>, RegExp][] = [
    [{ request: { method: 'GET', url: 'http://api.example.test/x' } }, /https/],
    [{ request: { method: 'GET', url: 'https://localhost/x' } }, /public host/],
    [{ request: { method: 'GET', url: 'https://169.254.169.254/latest' } }, /public host/],
    [{ request: { method: 'GET', url: 'https://metadata.google.internal/x' } }, /public host/],
    [{ request: { method: 'GET', url: 'https://user:pw@api.example.test/x' } }, /user name or password/],
    [{ request: { method: 'GET', url: 'https://api.example.test/{nope}' } }, /"nope" is not an argument/],
    [{ timeoutMs: 3000 }, /2500 ms/],
    [{ risk: 'external' as never }, /cannot happen mid-call/],
    [{ result: { fields: [] } }, /response fields/],
    [{ name: 'Order Status' }, /lowercase/],
  ];
  for (const [o, rx] of bad) assert.throws(() => checkSpec(spec(o)), rx, JSON.stringify(o));
});

test('arguments are validated; the request is built exactly; only listed scalar fields reach her', () => {
  const s = spec();
  assert.throws(() => validateArgs(s, {}), /order_id: is required/);
  assert.throws(() => validateArgs(s, { order_id: 42 }), /must be a string/);
  assert.throws(() => validateArgs(s, { order_id: 'A1', extra: 1 }), /not an argument/);
  const args = validateArgs(s, { order_id: 'GF/2817', detail: true });
  const r = buildRequest(s, args, 'sek');
  assert.equal(r.url, 'https://api.example.test/orders/GF%2F2817?detail=true');
  assert.equal(r.headers.authorization, 'Bearer sek');
  const post = buildRequest(spec({ request: { method: 'POST', url: 'https://api.example.test/notes', body: ['order_id'] } }), { order_id: 'A1' }, null);
  assert.deepEqual([post.method, post.body, post.headers.authorization], ['POST', '{"order_id":"A1"}', undefined]);
  const read = readResult(s, 200, JSON.stringify({ status: 'out for delivery', eta: { date: '2026-10-25' }, items: [{ sku: 1 }], secret_note: 'internal' }));
  assert.deepEqual(read, { ok: true, status: 200, result: { status: 'out for delivery', 'eta.date': '2026-10-25' } }, 'nested blobs and unlisted fields are dropped');
  assert.deepEqual(readResult(s, 500, '{}'), { ok: false, status: 500, result: {} });
  assert.deepEqual(readResult(s, 200, 'not json'), { ok: false, status: 200, result: {} });
});

test('templates grant no tool that calls cannot use', () => {
  for (const t of TEMPLATES) for (const g of t.config.tools) assert.ok(['end_call', 'transfer'].includes(g.name), `${t.id}: ${g.name}`);
});

// ------------------------------------------------------------------------------------------------ database

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(); registry = buildApp(pool, modules).registry; });
after(async () => { await pool?.end(); });

async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('http tools test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `ht${Math.random()}@example.test`]))!.id;
  const as = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
  const exec = (name: string, args: unknown) => registry.execute<any>(pool, name, args, as);
  const ok = async (name: string, args: unknown) => {
    let r: any = await exec(name, args);
    if (r.status === 'needs_approval') r = await registry.approve<any>(pool, r.actionId, { workspaceId: ws, memberId: owner });
    assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`);
    return r.result;
  };
  const integ = (await one<{ id: string }>(pool, "INSERT INTO integration (workspace_id, kind, name, secret_ciphertext, secret_keys) VALUES ($1, 'http', 'Order system', 'sealed', '{api_key}') RETURNING id", [ws]))!.id;
  return { ws, exec, ok, integ };
}
const createArgs = (integrationId: string, o: Record<string, unknown> = {}) => ({
  name: 'order_status', description: 'Look up where an order is when the caller asks about delivery.',
  input: { type: 'object', properties: { order_id: { type: 'string', maxLength: 20 } }, required: ['order_id'] },
  method: 'GET', url: 'https://api.example.test/orders/{order_id}', integrationId, authHeader: 'Authorization', secretKey: 'api_key', authPrefix: 'Bearer ',
  timeoutMs: 2000, risk: 'read', resultFields: ['status', 'eta.date'], ...o,
});

test('tool.create checks the integration and its secret; tool.list says it is not available on calls yet; names are unique', { skip }, async () => {
  const w = await world();
  const bad = await w.exec('tool.create', createArgs(w.integ, { secretKey: 'token' }));
  assert.ok(bad.status === 'not_executed' && /holds no secret named "token"; it has: api_key/.test(bad.reason), JSON.stringify(bad));
  const slow = await w.exec('tool.create', createArgs(w.integ, { timeoutMs: 2600 }));
  assert.equal(slow.status, 'not_executed');
  const t = (await w.ok('tool.create', createArgs(w.integ))).tool;
  assert.deepEqual([t.name, t.risk, t.status, t.usesIntegration], ['order_status', 'read', 'Not available yet', true]);
  const dup = await w.exec('tool.create', createArgs(w.integ));
  assert.ok(dup.status === 'not_executed' && /already exists/.test(dup.reason));
  const list = await w.ok('tool.list', {});
  assert.deepEqual(list.tools.map((x: { name: string }) => x.name), ['order_status']);
  assert.ok(!JSON.stringify(list).includes('sealed'), 'no secret material is ever returned');
  const other = await world();
  const foreign = await other.exec('tool.create', createArgs(w.integ, { name: 'x_tool' }));
  assert.ok(foreign.status === 'not_executed' && /no such integration in this workspace/.test(foreign.reason));
  assert.equal((await other.exec('tool.test', { toolId: t.id, args: { order_id: 'A1' } })).status, 'not_executed', 'another workspace cannot test it');
});

test('tool.test is a dry run: the exact request with the secret masked, what she would get, and the timeout path', { skip }, async () => {
  const w = await world();
  const t = (await w.ok('tool.create', createArgs(w.integ))).tool;
  const r = await w.ok('tool.test', { toolId: t.id, args: { order_id: 'GF-2817' }, fakeResponse: { status: 200, body: { status: 'shipped', eta: { date: '2026-10-26' }, cost: 99 } } });
  assert.equal(r.sent, false);
  assert.deepEqual(r.request, { method: 'GET', url: 'https://api.example.test/orders/GF-2817', headers: { accept: 'application/json', 'user-agent': 'Vyakti-Tool/1', authorization: 'Bearer ••••••' } });
  assert.deepEqual(r.outcome, { ok: true, status: 200, sheGets: { status: 'shipped', 'eta.date': '2026-10-26' } });
  const to = await w.ok('tool.test', { toolId: t.id, args: { order_id: 'GF-2817' }, timeout: true });
  assert.match(to.outcome.reason, /no answer within 2000 ms/);
  const badArgs = await w.exec('tool.test', { toolId: t.id, args: {} });
  assert.ok(badArgs.status === 'not_executed' && /order_id/.test(badArgs.reason));
});

test('a granted tool is snapshotted into the version the ticket carries; a later edit changes only later versions', { skip }, async () => {
  const w = await world();
  const t = (await w.ok('tool.create', createArgs(w.integ))).tool;
  const a = await w.ok('agent.create', { name: 'Orders', templateId: 'd2c-cod-verification' });
  await w.ok('tool.attach', { agentId: a.agentId, toolId: t.id });
  const s = await w.ok('stack.set', { agentId: a.agentId, stackId: 'v2-flashlite' });
  const v1 = await w.ok('version.publish', { agentId: a.agentId, draftHash: s.draftHash });
  const cfg1 = (await one<{ config: any }>(pool, 'SELECT config FROM agent_version WHERE id = $1', [v1.versionId]))!.config;
  const tools1 = ticketTools(cfg1.agent);
  assert.equal(tools1.length, 1);
  assert.equal(tools1[0].request.url, 'https://api.example.test/orders/{order_id}');
  assert.ok(!JSON.stringify(cfg1).includes('sealed'), 'the version carries the integration reference, never its secret');

  await w.ok('tool.edit', { toolId: t.id, url: 'https://api.example.test/v2/orders/{order_id}' });
  const g = await w.ok('agent.get', { agentId: a.agentId });
  const v2 = await w.ok('version.publish', { agentId: a.agentId, draftHash: g.draftHash });
  const cfg2 = (await one<{ config: any }>(pool, 'SELECT config FROM agent_version WHERE id = $1', [v2.versionId]))!.config;
  assert.equal(ticketTools(cfg2.agent)[0].request.url, 'https://api.example.test/v2/orders/{order_id}');
  const again = (await one<{ config: any }>(pool, 'SELECT config FROM agent_version WHERE id = $1', [v1.versionId]))!.config;
  assert.equal(ticketTools(again.agent)[0].request.url, 'https://api.example.test/orders/{order_id}', 'version 1 keeps what was approved');
});

test('built-ins: end call and transfer switch on; the declared ones are not available yet; kb_query is gone', { skip }, async () => {
  const w = await world();
  const a = await w.ok('agent.create', { name: 'Orders', templateId: 'd2c-cod-verification' });
  await w.ok('tool.attach', { agentId: a.agentId, name: 'end_call' });
  for (const n of ['mark_callback', 'send_whatsapp_link', 'send_sms']) {
    const r = await w.exec('tool.attach', { agentId: a.agentId, name: n });
    assert.ok(r.status === 'not_executed' && /is not available yet/.test(r.reason), `${n}: ${JSON.stringify(r)}`);
  }
  for (const n of ['kb_query', 'book_slot', 'lookup_order']) {
    const r = await w.exec('tool.attach', { agentId: a.agentId, name: n });
    assert.ok(r.status === 'not_executed' && /unknown in-call tool/.test(r.reason), n);
  }
});
