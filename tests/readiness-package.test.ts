import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture() { return mkdtempSync(join(tmpdir(), 'standalone-package-')); }
function file(root: string, name: string, contents = 'synthetic fixture') {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}
function inspect(root: string) {
  const result = spawnSync(process.execPath, [resolve('scripts/check-package.mjs'), root], { encoding: 'utf8', timeout: 15_000 });
  return { ...result, report: result.stdout.trim() ? JSON.parse(result.stdout.trim()) : undefined };
}

test('package check rejects missing output and an empty output directory', () => {
  const root = fixture();
  const missing = inspect(join(root, 'missing'));
  assert.equal(missing.status, 1);
  assert.equal(missing.report.issues.missing_output, 1);
  const empty = inspect(root);
  assert.equal(empty.status, 1);
  assert.equal(empty.report.issues.missing_server_entrypoint, 1);
});

test('package check accepts runtime names and excludes dependency internals from application-artifact rules', () => {
  const root = fixture();
  file(root, 'server.js');
  file(root, 'package.json');
  file(root, '.next/server/app/page.js');
  file(root, 'node_modules/synthetic-package/data/fixture.sqlite');
  file(root, 'node_modules/synthetic-package/.env.example');
  const result = inspect(root);
  assert.equal(result.status, 0);
  assert.deepEqual(result.report.issues, {});
});

test('package check rejects traced environment artifacts without exposing their names or contents', () => {
  const root = fixture();
  file(root, 'server.js');
  file(root, 'nested/.env.private-customer-name', 'PRIVATE_SECRET_CONTENT_MUST_NOT_BE_READ_OR_PRINTED');
  const result = inspect(root);
  assert.equal(result.status, 1);
  assert.equal(result.report.issues.environment_artifact, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /private-customer-name|PRIVATE_SECRET_CONTENT|standalone-package-/);
});

test('package check rejects private data and backup trees even when no database extension is present', () => {
  const root = fixture();
  file(root, 'server.js');
  file(root, 'data/account-mail/record.json');
  file(root, 'nested/backups/snapshot');
  file(root, '.impeccable/review/private.png');
  const result = inspect(root);
  assert.equal(result.status, 1);
  assert.equal(result.report.issues.private_directory, 3);
});

test('package check rejects SQLite WAL/journal and database backups outside private directory names', () => {
  const root = fixture();
  file(root, 'server.js');
  for (const name of ['workspace.sqlite', 'workspace.sqlite-wal', 'workspace.sqlite-shm', 'workspace.sqlite-journal', 'nested/workspace.db', 'archive.dump']) file(root, name);
  const result = inspect(root);
  assert.equal(result.status, 1);
  assert.equal(result.report.issues.database_or_backup_artifact, 6);
});

test('package check refuses application links instead of following them into external directories', () => {
  const root = fixture(), outside = fixture();
  file(root, 'server.js');
  file(outside, 'private-value.txt', 'DO_NOT_READ_EXTERNAL_CONTENT');
  symlinkSync(outside, join(root, 'external-link'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = inspect(root);
  assert.equal(result.status, 1);
  assert.equal(result.report.issues.unexpected_link, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /DO_NOT_READ_EXTERNAL_CONTENT|private-value/);
});
