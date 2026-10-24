// Intake webhook secrets in the workspace vault (open.2026-10-21.intake-hook-secret-vault): the migration seals existing
// plaintext secrets so crypto.ts opens them, then drops the column (and stops, changing nothing, without a key); new
// sources are sealed; rotation is an approval, shows the new secret once, and the old one keeps working for the overlap
// window only. Real Postgres (skipped when DATABASE_URL is unset). Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { addMember, boot, signup, skip, type Booted, type Client } from './workspace-helpers.ts';
import { buildApp } from '../server/app.ts';
import { createPool } from '../server/db.ts';
import { open } from '../server/modules/workspace/crypto.ts';
import { module as workspace } from '../server/modules/workspace/index.ts';
import { module as intake, signHook } from '../server/modules/intake/index.ts';

const MIGRATIONS = fileURLToPath(new URL('../db/migrations/', import.meta.url));
let b: Booted;
before(async () => {
  if (skip) return;
  b = await boot();                                   // sets VP_SECRET_KEY to a generated test key
  await b.close();
  const pool = createPool(process.env.DATABASE_URL);
  const app = buildApp(pool, [workspace, intake]);
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r));
  b = { pool, base: `http://127.0.0.1:${(app.server.address() as { port: number }).port}`, server: app.server, close: async () => { app.server.close(); app.server.closeAllConnections?.(); await pool.end(); } };
});
after(async () => { await b?.close(); });

/** A scratch database with every migration before 0109, so the vault migration runs on real plaintext rows. */
async function beforeVault(): Promise<{ client: pg.Client; drop: () => Promise<void> } | null> {
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  const name = 'vp_vault_' + randomUUID().slice(0, 8);
  try { await admin.query(`CREATE DATABASE ${name}`); } catch { await admin.end(); return null; }
  // The test URL is socket style (postgresql://vp@/db?host=...), which URL() refuses: swap the database name as text.
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL!.replace(/(@[^/]*\/)([^?]+)/, `$1${name}`) });
  try { await client.connect(); } catch (e) { await admin.query(`DROP DATABASE ${name}`); await admin.end(); throw e; }
  for (const f of readdirSync(MIGRATIONS).filter(f => /\.(sql|mjs)$/.test(f)).sort()) {
    if (f >= '0109') break;
    if (f.endsWith('.mjs')) await (await import(pathToFileURL(join(MIGRATIONS, f)).href)).default(client);
    else await client.query(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  return { client, drop: async () => { await client.end(); await admin.query(`DROP DATABASE ${name}`); await admin.end(); } };
}

test('migration 0109 seals every plaintext secret so the vault opens it, then drops the column; without a key it changes nothing', { skip }, async (t) => {
  const db = await beforeVault();
  if (!db) { t.skip('this database user cannot create a scratch database'); return; }
  const { client } = db;
  try {
    const ws = (await client.query("INSERT INTO workspace (name) VALUES ('Vault Co') RETURNING id")).rows[0].id;
    const plain = ['hooksecret-synthetic-' + randomUUID(), 'hooksecret-synthetic-' + randomUUID()];
    const ids: string[] = [];
    for (const p of plain) ids.push((await client.query("INSERT INTO intake_source (workspace_id, kind, name, authority, hook_secret) VALUES ($1,'api_push','CRM','crm',$2) RETURNING id", [ws, p])).rows[0].id);
    await client.query("INSERT INTO intake_source (workspace_id, kind, name, authority) VALUES ($1,'csv','file','upload')", [ws]);
    const migration = (await import(pathToFileURL(join(MIGRATIONS, '0109_intake_hook_secret_vault.mjs')).href)).default;

    const key = process.env.VP_SECRET_KEY; delete process.env.VP_SECRET_KEY;
    await client.query('BEGIN');
    await assert.rejects(migration(client), /set VP_SECRET_KEY/);
    await client.query('ROLLBACK');
    process.env.VP_SECRET_KEY = key;
    assert.equal((await client.query('SELECT count(*)::int AS n FROM intake_source WHERE hook_secret IS NOT NULL')).rows[0].n, 2, 'without a key nothing changed');

    await client.query('BEGIN'); await migration(client); await client.query('COMMIT');
    const cols = (await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'intake_source' AND column_name LIKE 'hook_secret%'")).rows.map(r => r.column_name).sort();
    assert.deepEqual(cols, ['hook_secret_ciphertext', 'hook_secret_prev_ciphertext', 'hook_secret_prev_until', 'hook_secret_rotated_at'], 'the plaintext column is gone');
    for (const [k, id] of ids.entries()) {
      const ct = (await client.query('SELECT hook_secret_ciphertext AS c FROM intake_source WHERE id = $1', [id])).rows[0].c as string;
      assert.ok(!ct.includes(plain[k]));
      assert.equal(open(ws, 'intake-hook', ct), plain[k], 'the workspace vault opens what the migration sealed');
      assert.throws(() => open(randomUUID(), 'intake-hook', ct), 'bound to its workspace');
    }
    assert.equal((await client.query('SELECT count(*)::int AS n FROM intake_source WHERE hook_secret_ciphertext IS NULL')).rows[0].n, 1, 'a file source has no secret');
  } finally { await db.drop(); }
});

const post = async (sourceId: string, secret: string) => {
  const body = JSON.stringify({ eventId: randomUUID(), contacts: [{ phone: '+919000030001', name: 'Vault Test' }] });
  return (await fetch(`${b.base}/hooks/contacts/${sourceId}`, { method: 'POST', headers: { 'content-type': 'application/json', ...signHook(secret, body) }, body })).status;
};

test('rotation: an approval, the new secret shown once, the old one kept for the overlap window only, nothing in the clear', { skip }, async () => {
  const owner: Client = await signup(b, 'Vault rotate'), other: Client = await signup(b, 'Vault other');
  const made = await owner.tool('source.upload', { kind: 'api_push', name: 'CRM push' });
  assert.equal(made.status, 'confirmed', JSON.stringify(made));
  const id: string = made.result.sourceId, first: string = made.result.secret;
  const row = (await b.pool.query('SELECT hook_secret_ciphertext AS c FROM intake_source WHERE id = $1', [id])).rows[0];
  assert.ok(row.c.startsWith('v1.') && !row.c.includes(first), 'stored sealed');
  assert.equal(await post(id, first), 200);

  const viewer = await addMember(b, owner, 'viewer');
  assert.equal((await viewer.tool('source.hook_secret.rotate', { sourceId: id })).status, 'not_executed', 'a viewer cannot ask');
  assert.equal((await other.run('source.hook_secret.rotate', { sourceId: id })).status, 'not_executed', 'another workspace cannot rotate it');
  const asked = await owner.tool('source.hook_secret.rotate', { sourceId: id });
  assert.equal(asked.status, 'needs_approval');
  assert.match(asked.summary, /old one keeps working for 24 hours/);
  const done = (await owner.fetch('POST', `/v1/actions/${asked.actionId}/decide`, { approve: true })).body;
  assert.equal(done.status, 'confirmed', JSON.stringify(done));
  const shown = await owner.tool('secret.reveal', { revealId: done.result.revealId });
  const second: string = shown.result.secret;
  assert.ok(second && second !== first);
  assert.equal((await owner.tool('secret.reveal', { revealId: done.result.revealId })).status, 'not_executed', 'shown once');
  const stored = JSON.stringify((await owner.fetch('GET', '/v1/actions?status=executed')).body);
  assert.ok(!stored.includes(second) && !stored.includes(first), 'neither secret is in the stored action');

  assert.equal(await post(id, second), 200, 'the new secret works at once');
  assert.equal(await post(id, first), 200, 'the old one still works inside the overlap window');
  const listed = (await owner.tool('source.list')).result.sources.find((s: any) => s.id === id);
  assert.ok(listed.previous_secret_until && listed.secret_rotated_at);
  await b.pool.query("UPDATE intake_source SET hook_secret_prev_until = now() - interval '1 second' WHERE id = $1", [id]);
  assert.equal(await post(id, first), 401, 'after the window the old secret is refused');
  assert.equal(await post(id, second), 200);
  const file = await owner.tool('source.upload', { kind: 'csv', name: 'a file' });
  assert.match((await owner.run('source.hook_secret.rotate', { sourceId: file.result.sourceId })).reason, /has no webhook/);
});
