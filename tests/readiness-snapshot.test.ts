import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('SQLite online backup includes WAL data, verifies restore, and refuses existing destinations', () => {
  const directory = mkdtempSync(join(tmpdir(), 'workspace-snapshot-'));
  const source = join(directory, 'source.sqlite');
  const live = new DatabaseSync(source);
  live.exec("PRAGMA journal_mode=WAL; CREATE TABLE sample (value TEXT); INSERT INTO sample VALUES ('retained');");
  const run = (...args: string[]) => spawnSync(process.execPath, [resolve('scripts/sqlite-snapshot.mjs'), ...args], { encoding: 'utf8' });
  const destination = join(directory, 'backup');
  try {
    assert.equal(run('backup', source, destination).status, 0);
    assert.equal(run('backup', source, destination).status, 1);
    const restored = join(directory, 'restore');
    assert.equal(run('restore', join(destination, 'workspace.sqlite'), restored).status, 0);
    const check = new DatabaseSync(join(restored, 'workspace.sqlite'), { readOnly: true });
    try { assert.equal(check.prepare('SELECT value FROM sample').get()?.value, 'retained'); }
    finally { check.close(); }
    assert.equal(run('backup', 'relative.sqlite', join(directory, 'invalid')).status, 1);
    assert.equal(existsSync(join(directory, 'invalid')), false);
    assert.equal(live.prepare('SELECT COUNT(*) AS count FROM sample').get()?.count, 1);
  } finally { live.close(); }
});
