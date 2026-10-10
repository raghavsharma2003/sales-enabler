import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

test('the remote image supervisor bundle runs once and writes a stopped heartbeat without provider credentials', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'supervisor-package-'));
  const outfile = join(directory, 'private-voice-supervisor.cjs'), databasePath = join(directory, 'fixture.sqlite');
  // These are the Dockerfile's Node bundling settings. No container engine is used.
  await build({ entryPoints: [resolve('scripts/private-voice-supervisor.ts')], bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile, logLevel: 'silent' });
  const result = spawnSync(process.execPath, [outfile, '--once'], {
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, NODE_ENV: 'test', NODE_PATH: resolve('node_modules'), SQLITE_PATH: databasePath },
    encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const heartbeat = database.prepare('SELECT status FROM service_heartbeats WHERE id=? AND service=?').get('private-voice-supervisor', 'private-voice-supervisor');
    assert.equal(heartbeat?.status, 'stopped');
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM entities').get()?.count, 0);
  } finally { database.close(); }
});
