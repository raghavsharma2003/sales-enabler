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
