import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

test('hosted PostgreSQL smoke refuses before opening a database unless explicitly opted in', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/postgres-hosted-smoke.ts')], {
    cwd: process.cwd(),
    env: { ...process.env, POSTGRES_HOSTED_SMOKE: '', DATABASE_URL: 'postgresql://fixture:private@127.0.0.1:1/fixture' },
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /^status=refused code=explicit_opt_in_required\r?\n$/);
});
