// An Operator upload must keep its line structure through the door (rejected.2026-10-23.upload-newlines-folded-by-redact):
// cleanIncoming() masks secrets before anything is stored or sent, and once folded every newline to a space, so every
// CSV pasted into chat arrived as one line and imported 0 rows. Real Postgres; the model is scripted by setFakeLlm.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmReply, type LlmRequest } from '../server/llm.ts';
import { module as operator } from '../server/modules/operator/index.ts';
import { cleanIncoming } from '../server/modules/operator/secrets.ts';
import { module as intake } from '../server/modules/intake/index.ts';
import { redact } from '../shared/safety/index.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let base = '';
let close: () => Promise<void>;

before(async () => {
  if (skip) return;
  process.env.VP_DEV_AUTH = '1';
  pool = createPool(URL_);
  const { server } = buildApp(pool, [operator, intake]);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise(r => server.close(() => r()));
});
afterEach(() => setFakeLlm(null));
after(async () => { await close?.(); await pool?.end(); });

// Synthetic, fictional rows; numbers in the reserved 90000000xx range.
const CSV = 'name,phone,city\r\nAsha Verma,9000000041,Pune\r\nRavi Kumar,9000000042,Indore\nMeera Shah,9000000043,Surat\n';

test('the door keeps line breaks and tabs while it masks (unit, no database)', () => {
  assert.equal(redact(CSV), CSV, 'nothing secret: the text comes back unchanged');
  const masked = redact('name\tnote\nAsha\tOTP 482913 hai\nRavi\tcard 4111 1111 1111 1111\n');
  assert.equal(masked.split('\n').length, 4);
  assert.doesNotMatch(masked, /482913|4111/);
  assert.match(masked, /^name\tnote\nAsha\t/);
  assert.equal(cleanIncoming(CSV).text, CSV);
});

test('a 3-row CSV uploaded through the Operator imports 3 rows', { skip }, async () => {
  const w = await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('upload test') RETURNING id");
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1)', [w!.id]);
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [w!.id, `o${Math.random()}@example.test`]))!.id;
  const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-dev-member': owner }, body: JSON.stringify(body) });
  const t = (await (await post('/v1/operator/threads', {})).json()).thread.id;

  // The scripted model does what a real one does: copies the upload it was shown into source.upload, then commits it.
  let uploadId = '';
  const reply = (r: Partial<LlmReply>) => ({ text: '', toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 }, model: 'scripted', provider: 'fake', ...r });
  const toolOut = (req: LlmRequest) => [...req.messages].reverse().find(m => m.role === 'tool')?.content ?? '';
  let step = 0;
  setFakeLlm(req => {
    step++;
    if (step === 1) {
      const last = req.messages[req.messages.length - 1].content;
      const shown = /<data source="upload:list\.csv"[^>]*>\n([^]*)\n<\/data>/.exec(last)![1];
      return reply({ toolCalls: [{ id: 'u1', name: 'source_upload', args: JSON.stringify({ kind: 'csv', name: 'list.csv', text: shown }) }] });
    }
    if (step === 2) {
      uploadId = /"uploadId":\s*"([0-9a-f-]{36})"/.exec(toolOut(req))![1];
      return reply({ toolCalls: [{ id: 'c1', name: 'source_commit', args: JSON.stringify({ uploadId }) }] });
    }
    return reply({ text: 'Imported.' });
  });

  const r = await post(`/v1/operator/threads/${t}/messages`, { text: 'ye list import karo', uploads: [{ name: 'list.csv', content: CSV }] });
  assert.equal(r.status, 200);
  await r.text();
  assert.ok(uploadId, 'the model got an upload id back');
  const n = await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM contact WHERE workspace_id = $1', [w!.id]);
  assert.equal(n!.n, 3, '3 rows in, 3 contacts imported');
  const rec = await one<{ rows_total: number; rows_ok: number }>(pool, 'SELECT r.rows_total, r.rows_ok FROM intake_upload u JOIN source_receipt r ON r.id = u.receipt_id WHERE u.id = $1', [uploadId]);
  assert.deepEqual(rec, { rows_total: 3, rows_ok: 3 });
});
