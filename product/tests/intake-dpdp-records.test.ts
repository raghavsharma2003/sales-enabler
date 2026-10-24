// DPDP erase_me reaches every record of the person: the one asked about, a record that carries their number as an alias,
// and (once workspace's start-over is in) an archived record sharing the number. Synthetic data only (numbers 90000…).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { createPool, one, many } from '../server/db.ts';
import { buildApp } from '../server/app.ts';
import type { Registry, Actor } from '../server/tools.ts';
import { module as intake } from '../server/modules/intake/index.ts';
import { hashWith, workspaceSalt } from '../server/modules/intake/store.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, reg: Registry;
before(async () => { if (skip) return; process.env.VP_SECRET_KEY ??= randomBytes(32).toString('hex'); pool = createPool(URL_); reg = buildApp(pool, [intake]).registry; });
after(async () => { await pool?.end(); });

async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('dpdp records') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role, status) VALUES ($1,$2,'owner','active') RETURNING id", [ws, `d${Math.random()}@example.test`]))!.id;
  const actor: Actor = { type: 'member', id: owner, role: 'owner' };
  const call = (name: string, args: unknown) => reg.execute<any>(pool, name, args, { workspaceId: ws, actor });
  const ok = async (name: string, args: unknown) => { const r = await call(name, args); assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`); return (r as any).result; };
  const erase = async (args: Record<string, unknown>) => {
    const p = await call('dpdp.request.execute', { scope: 'erase_me', requestedBy: 'person', evidence: 'verified request (synthetic)', ...args });
    const a = await reg.approve<any>(pool, (p as any).actionId, { workspaceId: ws, memberId: owner });
    assert.equal(a.status, 'confirmed', JSON.stringify(a));
    return (a as any).result;
  };
  const importCsv = async (csv: string) => { const u = await ok('source.upload', { kind: 'csv', name: 'List', text: csv }); return ok('source.commit', { uploadId: u.uploadId }); };
  return { ws, owner, call, ok, erase, importCsv };
}
const state = (ws: string) => many<{ id: string; e164: string; erased: boolean; attrs: number }>(pool,
  `SELECT c.id, c.e164, c.erased_at IS NOT NULL AS erased, (SELECT count(*)::int FROM attribute a WHERE a.contact_id = c.id) AS attrs FROM contact c WHERE c.workspace_id = $1 ORDER BY c.created_at`, [ws]);

test('erase_me by number reaches a second record that carries the number as an alias: both erased in place, both numbers tombstoned and suppressed by hash', { skip }, async () => {
  const w = await world();
  await w.importCsv('Name,Mobile,Policy number\nAarti Sharma,9000000401,SH-1\nAarti S,9000000402,SH-2\nSomeone Else,9000000403,SH-3\n');
  const byNum = async (e: string) => (await one<{ id: string }>(pool, 'SELECT id FROM contact WHERE workspace_id = $1 AND e164 = $2', [w.ws, e]))!;
  const a = await byNum('+919000000401'), b = await byNum('+919000000402');
  await pool.query("INSERT INTO contact_identifier (contact_id, raw, kind) VALUES ($1,'+919000000401','phone_e164')", [b.id]);    // the second record knows her first number
  const r = await w.erase({ e164: '9000000401' });
  assert.equal(r.surfaces.records, 2);
  const after = await state(w.ws);
  const hers = after.filter(x => x.id === a.id || x.id === b.id), other = after.find(x => x.id !== a.id && x.id !== b.id)!;
  assert.ok(hers.every(x => x.erased && x.attrs === 0 && x.e164.startsWith('erased:')), `both of hers erased: ${JSON.stringify(hers)}`);
  assert.ok(!other.erased && other.attrs > 0 && other.e164 === '+919000000403', 'the third person untouched');
  const salt = await workspaceSalt(pool, w.ws);
  for (const n of ['+919000000401', '+919000000402']) {
    assert.ok(await one(pool, 'SELECT 1 FROM tombstone WHERE workspace_id = $1 AND e164_hash = $2', [w.ws, hashWith(salt, n)]), `${n} tombstoned`);
  }
  assert.equal((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM suppression WHERE workspace_id = $1 AND e164 IS NOT NULL', [w.ws]))!.n, '0', 'no number left in clear');
  // A re-import cannot bring either back.
  const again = await w.importCsv('Name,Mobile\nAarti Sharma,9000000401\nAarti S,9000000402\n');
  assert.equal(again.counts.new, 0);
});

test('after a start-over, erase_me reaches the archived record that shares the number, and the live one; nothing of hers is left', { skip }, async t => {
  const col = await one(pool, "SELECT 1 FROM information_schema.columns WHERE table_name = 'contact' AND column_name = 'archive_batch_id'");
  if (!col) return t.skip("workspace's start-over (contact.archive_batch_id) is not in yet");
  const w = await world();
  await w.importCsv('Name,Mobile,Policy number\nKavya Gowda,9000000411,SH-OLD\n');
  // The workspace starts over: the old record is archived, as workspace's reset does.
  await pool.query('UPDATE contact SET archive_batch_id = gen_random_uuid() WHERE workspace_id = $1', [w.ws]);
  await w.importCsv('Name,Mobile,Policy number\nKavya Gowda,9000000411,SH-NEW\n');
  assert.equal((await state(w.ws)).length, 2, 'an archived and a live record for the same number');
  const r = await w.erase({ e164: '9000000411' });
  assert.equal(r.surfaces.records, 2);
  const after = await state(w.ws);
  assert.ok(after.every(x => x.erased && x.attrs === 0 && x.e164.startsWith('erased:')), JSON.stringify(after));
});
