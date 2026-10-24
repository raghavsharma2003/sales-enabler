// POST /hooks/runtime/tools (must-be audit brief 3, the run): the control plane runs an in-call HTTP tool from the
// call's own published version, with the integration's secret, a public address, the timeout and only listed fields.
// The network is faked (setToolNetwork); nothing is sent. Database tests skip without DATABASE_URL.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { randomBytes } from 'node:crypto';
import { createPool, one } from '../server/db.ts';
import { execute, privateAddress, runTool, setToolNetwork, MAX_RUNS_PER_CALL } from '../server/modules/calls/toolhook.ts';
import { seal } from '../server/modules/workspace/crypto.ts';
import type { HttpToolSpec } from '../shared/contracts/http-tool.ts';

const spec = (o: Partial<HttpToolSpec> = {}): HttpToolSpec => ({
  contract: 1, kind: 'http', name: 'order_status', description: 'Look up where an order is when the caller asks about delivery.',
  input: { type: 'object', properties: { order_id: { type: 'string', maxLength: 20 } }, required: ['order_id'] },
  request: { method: 'GET', url: 'https://api.example.test/orders/{order_id}' }, auth: null,
  timeoutMs: 300, risk: 'read', result: { fields: ['status', 'eta.date'] }, ...o,
});
const PUBLIC = async () => ['93.184.216.34'];
process.env.VP_SECRET_KEY ??= randomBytes(32).toString('hex');

test('internal addresses are refused after DNS, redirects are not followed, the timeout holds', async () => {
  for (const ip of ['10.0.0.5', '127.0.0.1', '169.254.169.254', '192.168.1.1', '172.20.0.1', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1']) assert.ok(privateAddress(ip), ip);
  for (const ip of ['93.184.216.34', '2606:2800:220:1::1']) assert.ok(!privateAddress(ip), ip);
  const seen: string[] = [];
  setToolNetwork(async (url, init) => { seen.push(`${init.method} ${url} ${init.redirect}`); return { status: 200, text: async () => JSON.stringify({ status: 'shipped', eta: { date: '25 Oct' }, cost: 9 }) }; },
    async () => ['10.1.2.3']);
  assert.deepEqual(await execute(spec(), { order_id: 'A1' }, null), { ok: false, reason: "the tool's host resolves to an internal address" });
  assert.equal(seen.length, 0, 'nothing was sent to an internal address');
  setToolNetwork(async (url, init) => { seen.push(`${init.method} ${url} ${init.redirect}`); return { status: 200, text: async () => JSON.stringify({ status: 'shipped', eta: { date: '25 Oct' }, cost: 9 }) }; }, PUBLIC);
  assert.deepEqual(await execute(spec(), { order_id: 'A 1' }, null), { ok: true, status: 200, result: { status: 'shipped', 'eta.date': '25 Oct' } });
  assert.deepEqual(seen, ['GET https://api.example.test/orders/A%201 manual']);
  setToolNetwork(async () => ({ status: 302, text: async () => '' }), PUBLIC);
  assert.match(String((await execute(spec(), { order_id: 'A1' }, null)).reason), /redirect/);
  setToolNetwork((_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))), PUBLIC);
  assert.deepEqual(await execute(spec({ timeoutMs: 100 }), { order_id: 'A1' }, null), { ok: false, reason: 'the tool took longer than 100 ms' });
  setToolNetwork(async () => ({ status: 503, text: async () => '{}' }), PUBLIC);
  assert.deepEqual(await execute(spec(), { order_id: 'A1' }, null), { ok: false, status: 503, reason: 'the tool answered 503' });
  setToolNetwork(null, null);
});

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
before(() => { if (!skip) pool = createPool(); });
after(async () => { setToolNetwork(null, null); await pool?.end(); });

test('a live call runs its own version\'s tool with the integration secret; anything else is refused in plain words', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('tool hook test') RETURNING id"))!.id;
  const integ = (await one<{ id: string }>(pool, "INSERT INTO integration (workspace_id, kind, name, secret_ciphertext, secret_keys) VALUES ($1,'custom_http','Orders',$2,'{api_key}') RETURNING id",
    [ws, seal(ws, 'integration', JSON.stringify({ api_key: 'sek-123' }))]))!.id;
  const s = spec({ auth: { integrationId: integ, header: 'Authorization', secretKey: 'api_key', prefix: 'Bearer ' } });
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Tools') RETURNING id", [ws]))!.id;
  const ver = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,'h',$2) RETURNING id",
    [agent, { tools: [{ name: 'order_status', risk: 'read', config: { spec: s } }] }]))!.id;
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, agent_version_id, channel, status) VALUES ($1,$2,'test','live') RETURNING id", [ws, ver]))!.id;
  const headers: Record<string, string>[] = [];
  setToolNetwork(async (_url, init) => { headers.push(init.headers); return { status: 200, text: async () => '{"status":"shipped"}' }; }, PUBLIC);
  const deps = { pool } as never;
  assert.deepEqual(await runTool(deps, conv, 'order_status', { order_id: 'A1' }), { ok: true, status: 200, result: { status: 'shipped' } });
  assert.equal(headers[0]!.authorization, 'Bearer sek-123', 'the secret is filled in here, never sent to the runtime');
  assert.deepEqual(await runTool(deps, conv, 'refund_now', {}), { ok: false, reason: 'this agent has no tool "refund_now"' });
  assert.match(String((await runTool(deps, conv, 'order_status', {})).reason), /order_id: is required/);
  for (let i = 0; i < MAX_RUNS_PER_CALL; i++) await runTool(deps, conv, 'order_status', { order_id: 'A1' });
  assert.deepEqual(await runTool(deps, conv, 'order_status', { order_id: 'A1' }), { ok: false, reason: 'too many tool runs on this call' });
  await pool.query("UPDATE conversation SET status = 'ended' WHERE id = $1", [conv]);
  assert.deepEqual(await runTool(deps, conv, 'order_status', { order_id: 'A1' }), { ok: false, reason: 'the call has ended' });
});

test('the real request refuses an internal address at connect time, even when the pre-check was fooled (rebinding)', async () => {
  setToolNetwork(null, async () => ['93.184.216.34']);                  // the pre-check sees a public address
  const r = await execute(spec({ request: { method: 'GET', url: 'https://localhost:9/x' }, timeoutMs: 1000 }), {}, null);
  assert.deepEqual(r, { ok: false, reason: "the tool's host resolves to an internal address" }, 'localhost resolves to 127.0.0.1: refused at connect');
  setToolNetwork(null, null);
});
