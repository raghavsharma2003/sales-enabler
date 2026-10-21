// The control plane's side of the runtime seam, against a local stand-in for the voice runtime's HTTP surface
// (product/voice/vpvoice/server.py): the admission cap is a retryable "not placed", and every control body names its call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpRuntime, verify } from '../server/runtime-client.ts';
import type { CallTicket } from '../shared/runtime-protocol.ts';

const SECRET = 'x'.repeat(40);
const ID = '7d8f3c2a-1b4e-4f6a-9c0d-2e5b8a7f1c3d';

async function stub(reply: (path: string, body: string) => { status: number; body: unknown }) {
  const seen: { path: string; body: string; signed: boolean }[] = [];
  const srv = createServer(async (req: IncomingMessage, res) => {
    let body = '';
    for await (const c of req) body += c;
    seen.push({ path: req.url ?? '', body, signed: verify(SECRET, body, req.headers['x-vp-signature'] as string) });
    const r = reply(req.url ?? '', body);
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.body));
  });
  await new Promise<void>(ok => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return { rt: new HttpRuntime(base, SECRET), seen, close: () => new Promise(ok => srv.close(ok)) };
}

const ticket = { conversationId: ID } as unknown as CallTicket;

test('start: 503 at_capacity is a retryable not-placed reply with the runtime\'s retry-after', async () => {
  const s = await stub(() => ({ status: 503, body: { error: 'at_capacity', retryAfterS: 7, placed: false } }));
  try {
    const r = await s.rt.start(ticket);
    assert.equal(r.accepted, false);
    assert.equal(r.retryable, true);
    assert.equal(r.retryAfterS, 7);
    assert.ok(s.seen[0].signed, 'the ticket is signed');
  } finally { await s.close(); }
});

test('start: any other refusal is not retryable', async () => {
  for (const [status, body] of [[503, { error: 'draining' }], [409, { error: 'conflict' }], [500, 'oops']] as const) {
    const s = await stub(() => ({ status, body }));
    try {
      const r = await s.rt.start(ticket);
      assert.equal(r.accepted, false);
      assert.ok(!r.retryable, `${status} ${JSON.stringify(body)} must not read as at capacity`);
      assert.match(r.reason ?? '', new RegExp(String(status)));
    } finally { await s.close(); }
  }
});

test('start: at_capacity without a usable retryAfterS falls back to 5 s', async () => {
  const s = await stub(() => ({ status: 503, body: { error: 'at_capacity' } }));
  try { assert.equal((await s.rt.start(ticket)).retryAfterS, 5); } finally { await s.close(); }
});

test('control: every body carries conversationId (the runtime\'s replay guard), and the caller cannot override it', async () => {
  const s = await stub(() => ({ status: 200, body: { ok: true } }));
  try {
    await s.rt.control(ID, 'end');
    await s.rt.control(ID, 'end', { endReason: 'handed_off', conversationId: 'someone-else' });
    assert.deepEqual(s.seen.map(x => x.path), [`/v1/calls/${ID}/end`, `/v1/calls/${ID}/end`]);
    assert.deepEqual(JSON.parse(s.seen[0].body), { conversationId: ID });
    assert.deepEqual(JSON.parse(s.seen[1].body), { endReason: 'handed_off', conversationId: ID });
    assert.ok(s.seen.every(x => x.signed));
  } finally { await s.close(); }
});

test('health: per-stack availability and reasons come from GET /v1/health; a non-200 or a malformed body is null (unknown)', async () => {
  const body = { ok: true, stacks: {
    'v2-luna': { available: true, reason: null, missing: [], status: 'beta' },
    'v2-gemini': { available: false, reason: "This voice isn't offered on our Google Cloud route yet", missing: [], status: 'beta' },
    'sarvam-india': { available: false, reason: null, missing: [['SARVAM_API_KEY']], status: 'beta' },
  } };
  const s = await stub(path => path === '/v1/health' ? { status: 200, body } : { status: 404, body: {} });
  try {
    const h = await s.rt.health();
    assert.deepEqual(h, { stacks: {
      'v2-luna': { available: true, reason: null, missing: [] },
      'v2-gemini': { available: false, reason: "This voice isn't offered on our Google Cloud route yet", missing: [] },
      'sarvam-india': { available: false, reason: null, missing: [['SARVAM_API_KEY']] },
    } });
  } finally { await s.close(); }
  for (const [status, b] of [[503, { ok: false, stacks: {} }], [200, 'not json'], [200, { ok: true }]] as const) {
    const t = await stub(() => ({ status, body: b }));
    try { assert.equal(await t.rt.health(), null, `${status} ${JSON.stringify(b)} must read as unknown`); } finally { await t.close(); }
  }
});

test('availabilityOf: no report is unknown, never available; a missing stack or missing credentials is unavailable with a plain reason', async () => {
  const { availabilityOf } = await import('../server/modules/agents/index.ts');
  assert.deepEqual(availabilityOf('v2-luna', null), { state: 'unknown', reason: null });
  const h = { stacks: {
    a: { available: true, reason: null, missing: [] },
    b: { available: false, reason: "Gemini listening isn't offered on our Google Cloud route yet", missing: [] },
    c: { available: false, reason: null, missing: [['SARVAM_API_KEY']] },
  } };
  assert.deepEqual(availabilityOf('a', h), { state: 'available', reason: null });
  assert.deepEqual(availabilityOf('b', h), { state: 'unavailable', reason: "Gemini listening isn't offered on our Google Cloud route yet" });
  assert.equal(availabilityOf('c', h).state, 'unavailable');
  assert.doesNotMatch(availabilityOf('c', h).reason ?? '', /SARVAM|_KEY/, 'a credential name never reaches a person');
  assert.equal(availabilityOf('zz', h).state, 'unavailable');
});

test('a health read that started before forgetRuntimeHealth() does not write its stale answer back into the cache', async () => {
  const { forgetRuntimeHealth, module } = await import('../server/modules/agents/index.ts');
  const { FakeRuntime, setRuntime } = await import('../server/runtime-client.ts');
  const { Registry } = await import('../server/tools.ts');
  const reg = new Registry(); module.register(reg);
  const listTool = reg.get('stack.list') as unknown as { run: (ctx: unknown, i: unknown) => Promise<any> };
  assert.ok(listTool, 'stack.list is registered');
  // One runtime object throughout: a slow read starts, the report changes and the cache is forgotten, then the slow read lands.
  let release!: () => void;
  const rt = new FakeRuntime();
  rt.health = () => new Promise(ok => { release = () => ok({ stacks: {} }); });     // the old report: every stack unlisted
  setRuntime(rt); forgetRuntimeHealth();
  try {
    const inflight = listTool.run({}, {});
    rt.health = async () => null;                                                      // the new report: unknown
    forgetRuntimeHealth();
    release(); await inflight;
    const after = await listTool.run({}, {});
    assert.ok(after.stacks.every((s: any) => s.availability.state === 'unknown'), 'the stale report that landed after the reset was not cached');
  } finally { setRuntime(null); forgetRuntimeHealth(); }
});
