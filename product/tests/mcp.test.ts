// The MCP server (operator/mcp.ts) on the real modules: API keys only, the key's role and scopes as on the HTTP
// endpoint, tools equal to the registry's for that role, and every approval class held as a card. No external network:
// a local server on 127.0.0.1. Synthetic data only. Skipped when DATABASE_URL is unset.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { newApiKey } from '../server/auth.ts';
import { createPool, one } from '../server/db.ts';
import { modules } from '../server/modules/index.ts';
import { mcpName, MCP_PROTOCOL_VERSIONS } from '../server/modules/operator/mcp.ts';
import type { Registry } from '../server/tools.ts';

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
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = async () => { app.server.close(); app.server.closeAllConnections?.(); };
});
after(async () => { await close?.(); await pool?.end(); });

async function workspace(scopes: string[] = []) {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('Synthetic MCP Co') RETURNING id"))!.id;
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [ws]);
  const member = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const k = newApiKey();
  await pool.query('INSERT INTO api_key (workspace_id, name, prefix, hash, scopes) VALUES ($1,$2,$3,$4,$5)', [ws, 'customer agent', k.prefix, k.hash, scopes]);
  return { ws, member, key: k.token };
}
let n = 0;
async function rpc(key: string | null, method: string, params?: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(base + '/v1/mcp', { method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(key ? { authorization: `Bearer ${key}` } : {}), ...extra },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, ...(params !== undefined ? { params } : {}) }) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const call = async (key: string, name: string, args: unknown) => (await rpc(key, 'tools/call', { name, arguments: args })).body.result;

test('initialize, ping and notifications follow MCP streamable HTTP; only an API key may connect', { skip }, async () => {
  const { key, member } = await workspace();
  const init = await rpc(key, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.body.result.capabilities, { tools: { listChanged: false } });
  assert.equal(init.body.result.serverInfo.name, 'vyakti');
  assert.equal((await rpc(key, 'initialize', { protocolVersion: '1999-01-01' })).body.result.protocolVersion, MCP_PROTOCOL_VERSIONS[0]);
  assert.deepEqual((await rpc(key, 'ping')).body.result, {});
  const note = await fetch(base + '/v1/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  assert.equal(note.status, 202);
  assert.equal((await rpc(key, 'resources/list')).body.error.code, -32601);
  assert.equal((await rpc(null, 'tools/list')).status, 401);
  assert.equal((await rpc(null, 'tools/list', undefined, { 'x-vp-dev-member': member })).status, 401, 'a signed-in person uses the app, not MCP');
  assert.equal((await rpc(key, 'tools/list', undefined, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await fetch(base + '/v1/mcp')).status, 405);
});

test("tools/list equals the registry's tools for the key's role, with their JSON Schemas; nothing can approve", { skip }, async () => {
  const { key } = await workspace();
  const tools = (await rpc(key, 'tools/list')).body.result.tools as { name: string; title: string; inputSchema: any; annotations: any }[];
  const want = registry.list().filter(t => t.roles.includes('builder')).map(t => mcpName(t.name)).sort();
  assert.deepEqual(tools.map(t => t.name).sort(), want);
  const create = tools.find(t => t.title === 'agent.create')!;
  assert.deepEqual(create.inputSchema, registry.get('agent.create')!.input.schema);
  assert.equal(tools.find(t => t.title === 'agent.list')!.annotations.readOnlyHint, true);
  // knowledge.span.approve and fact.approve accept content as drafts; no tool approves or decides an action card.
  assert.ok(!tools.some(t => /^(action|approval)\.(approve|decide)/.test(t.title)), 'no tool approves a card');
  assert.ok(!registry.list().some(t => /^(action|approval)\.(approve|decide)/.test(t.name)), 'and none exists to list');
});

test('a scoped key lists and calls only its scopes; an out-of-scope call changes nothing', { skip }, async () => {
  const { ws, key } = await workspace(['agent', 'template.list']);
  const names = ((await rpc(key, 'tools/list')).body.result.tools as { title: string }[]).map(t => t.title);
  assert.ok(names.length > 0 && names.every(t => t.startsWith('agent.') || t === 'template.list'), names.join(', '));
  const r = await call(key, 'wallet_topup', { inrMilli: 100_000 });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /^NOT DONE: this API key's scopes do not include wallet\.topup/);
  assert.equal((await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM action WHERE workspace_id = $1', [ws]))!.n, 0);
  assert.equal((await call(key, 'agent_list', {})).isError, false);
});

test('an A2 tool over MCP creates a pending approval card and changes nothing; so does an A3 verb', { skip }, async () => {
  const { ws, key } = await workspace();
  const r = await call(key, 'wallet_topup', { inrMilli: 100_000 });
  assert.equal(r.isError, false);
  assert.match(r.content[0].text, /^WAITING FOR APPROVAL: .*Approval card [0-9a-f-]{36}/);
  assert.equal(r.structuredContent.status, 'needs_approval');
  const a = await one<{ status: string; proposed_by: string; tool: string }>(pool, 'SELECT status, proposed_by, tool FROM action WHERE id = $1', [r.structuredContent.actionId]);
  assert.equal(a!.status, 'proposed');
  assert.equal(a!.tool, 'wallet.topup');
  assert.match(a!.proposed_by, /^key:/, 'the card says an API key asked');
  assert.equal((await one<{ b: string }>(pool, 'SELECT balance_inr_milli::text AS b FROM wallet WHERE workspace_id = $1', [ws]))!.b, '0');
  // campaign.pause is an A3 verb the kernel would let an agent run at once; over MCP it is a card too.
  const camp = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category, state) VALUES ($1,'Live one','service','running') RETURNING id", [ws]))!.id;
  const p = await call(key, 'campaign_pause', { id: camp });
  assert.equal(p.structuredContent.status, 'needs_approval', JSON.stringify(p));
  assert.equal((await one<{ s: string }>(pool, 'SELECT state AS s FROM campaign WHERE id = $1', [camp]))!.s, 'running');
  // The agent reads the card's state; it cannot move it.
  const g = await call(key, 'action_get', { id: r.structuredContent.actionId });
  assert.equal(g.structuredContent.result.status, 'proposed');
});

test('a workspace at A0 holds MCP drafts for a tap too; reads still run', { skip }, async () => {
  const { ws, key } = await workspace();
  await pool.query("INSERT INTO operator_setting (workspace_id, autonomy) VALUES ($1,'A0')", [ws]);
  const r = await call(key, 'agent_create', { name: 'Held draft', templateId: 'appliance-service-followup' });
  assert.equal(r.structuredContent.status, 'needs_approval');
  assert.equal((await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM agent WHERE workspace_id = $1', [ws]))!.n, 0);
  assert.equal((await call(key, 'template_list', {})).structuredContent.status, 'confirmed');
});
