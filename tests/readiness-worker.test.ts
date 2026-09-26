import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('disabled channel worker exits without initializing persistence or dispatching a tick', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'channel-disabled-')), 'must-not-exist.sqlite');
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/channel-worker.ts'), '--once'], {
    env: { ...process.env, CHANNEL_WORKER_ENABLED: '0', DATABASE_URL: '', SQLITE_PATH: path },
    encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Channel worker is off/);
  assert.equal(existsSync(path), false);
});

test('disabled learning worker exits without initializing persistence or dispatching inference', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'learning-disabled-')), 'must-not-exist.sqlite');
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/learning-worker.ts'), '--once'], {
    env: { ...process.env, LEARNING_WORKER_ENABLED: '0', DATABASE_URL: '', SQLITE_PATH: path },
    encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /"enabled":false/);
  assert.equal(existsSync(path), false);
});
