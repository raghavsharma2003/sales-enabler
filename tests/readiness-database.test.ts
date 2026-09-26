import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { probeDatabase } from '../lib/server/health';

test('readiness cannot create a missing SQLite file or initialize a missing schema', async () => {
  const previousUrl = process.env.DATABASE_URL, previousPath = process.env.SQLITE_PATH;
  const directory = mkdtempSync(join(tmpdir(), 'workspace-readiness-'));
  const path = join(directory, 'probe.sqlite');
  process.env.DATABASE_URL = '';
  process.env.SQLITE_PATH = path;
  try {
    await assert.rejects(probeDatabase());
    assert.equal(existsSync(path), false);
    new DatabaseSync(path).close();
    await assert.rejects(probeDatabase());
    const database = new DatabaseSync(path, { readOnly: true });
    try { assert.deepEqual(database.prepare('SELECT name FROM sqlite_master').all(), []); }
    finally { database.close(); }
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousPath === undefined) delete process.env.SQLITE_PATH; else process.env.SQLITE_PATH = previousPath;
  }
});

test('learning worker heartbeat is live only when running and fresh, and --once stops it', async () => {
  const previousUrl = process.env.DATABASE_URL, previousPath = process.env.SQLITE_PATH;
  const path = join(mkdtempSync(join(tmpdir(), 'learning-heartbeat-')), 'empty.sqlite');
  // A brand-new empty database cannot contain any job or make an inference call.
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/learning-worker.ts'), '--once'], {
    env: { ...process.env, LEARNING_WORKER_ENABLED: '1', DATABASE_URL: '', SQLITE_PATH: path },
    encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 0);
  const database = new DatabaseSync(path);
  process.env.DATABASE_URL = '';
  process.env.SQLITE_PATH = path;
  try {
    assert.equal(database.prepare('SELECT status FROM service_heartbeats WHERE service=?').get('learning-worker')?.status, 'stopped');
    assert.equal(await probeDatabase(false, false, true), false);
    database.prepare('UPDATE service_heartbeats SET status=?,updated_at=? WHERE service=?').run('running', new Date().toISOString(), 'learning-worker');
    assert.equal(await probeDatabase(false, false, true), true);
    assert.equal(await probeDatabase(false, true), false);
    database.prepare('UPDATE service_heartbeats SET updated_at=? WHERE service=?').run(new Date(Date.now() - 121_000).toISOString(), 'learning-worker');
    assert.equal(await probeDatabase(false, false, true), false);
  } finally {
    database.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousPath === undefined) delete process.env.SQLITE_PATH; else process.env.SQLITE_PATH = previousPath;
  }
});
