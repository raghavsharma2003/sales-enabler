import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { probeDatabase } from '../lib/server/health';

function createLegacySchema(path: string, audioTable = '') {
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, organization_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE entities (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT, data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT NOT NULL, entity_id TEXT NOT NULL, event TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE service_heartbeats (id TEXT PRIMARY KEY, service TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL);
    ${audioTable}
  `);
  database.close();
}

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

test('readiness rejects an otherwise legacy schema that lacks evaluation audio storage', async () => {
  const previousUrl = process.env.DATABASE_URL, previousPath = process.env.SQLITE_PATH;
  const path = join(mkdtempSync(join(tmpdir(), 'workspace-readiness-legacy-')), 'legacy.sqlite');
  createLegacySchema(path);
  process.env.DATABASE_URL = '';
  process.env.SQLITE_PATH = path;
  try {
    await assert.rejects(probeDatabase());
    const readonly = new DatabaseSync(path, { readOnly: true });
    try {
      const audio = readonly.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evaluation_audio_artifacts'").all();
      assert.deepEqual(audio, []);
    } finally { readonly.close(); }
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousPath === undefined) delete process.env.SQLITE_PATH; else process.env.SQLITE_PATH = previousPath;
  }
});

test('readiness rejects evaluation audio storage without the binary column', async () => {
  const previousUrl = process.env.DATABASE_URL, previousPath = process.env.SQLITE_PATH;
  const path = join(mkdtempSync(join(tmpdir(), 'workspace-readiness-audio-column-')), 'legacy.sqlite');
  createLegacySchema(path, 'CREATE TABLE evaluation_audio_artifacts (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, mime_type TEXT NOT NULL, byte_count INTEGER NOT NULL, sha256 TEXT NOT NULL, duration_ms INTEGER NOT NULL, sample_rate_hz INTEGER NOT NULL, channels INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);');
  process.env.DATABASE_URL = '';
  process.env.SQLITE_PATH = path;
  try {
    await assert.rejects(probeDatabase());
    const readonly = new DatabaseSync(path, { readOnly: true });
    try {
      const columns = readonly.prepare('PRAGMA table_info(evaluation_audio_artifacts)').all().map(row => row.name);
      assert.equal(columns.includes('bytes'), false);
    } finally { readonly.close(); }
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
