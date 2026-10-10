import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { databasePoolMax, db, type Database } from '../lib/server/db';

const runtime = globalThis as typeof globalThis & { companyDatabase?: Promise<Database> };

test('application pool size defaults to eight and accepts only bounded decimal integers', () => {
  for (const raw of [undefined, '', '  ']) assert.equal(databasePoolMax({ DATABASE_POOL_MAX: raw }), 8);
  for (const value of [1, 4, 8, 20]) assert.equal(databasePoolMax({ DATABASE_POOL_MAX: ` ${value} ` }), value);
  for (const raw of ['0', '-1', '21', '1.5', '4.0', '4e0', '0x4', '+4', 'Infinity', 'NaN', 'private-input']) {
    assert.throws(() => databasePoolMax({ DATABASE_POOL_MAX: raw }), error => error instanceof Error && error.message === 'DATABASE_POOL_MAX must be an integer from 1 to 20.');
  }
});

test('PostgreSQL construction receives the configured limit and rejects invalid input before any query', async t => {
  // Replace every query before constructing a pool: this test cannot open a connection.
  const limits: number[] = [];
  t.mock.method(Pool.prototype, 'query', function (this: Pool) {
    limits.push(this.options.max!);
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  process.env.DATABASE_URL = 'postgresql://fixture:unused@127.0.0.1:1/fixture';
  process.env.DATABASE_POOL_MAX = '4';
  delete runtime.companyDatabase;
  try {
    assert.equal((await db()).dialect, 'postgres');
    assert.ok(limits.length > 0);
    assert.deepEqual([...new Set(limits)], [4]);
    delete runtime.companyDatabase;
    process.env.DATABASE_POOL_MAX = '999';
    const previousQueries = limits.length;
    await assert.rejects(db(), /DATABASE_POOL_MAX must be an integer from 1 to 20/);
    assert.equal(limits.length, previousQueries);
    assert.equal(runtime.companyDatabase, undefined, 'failed configuration must not poison a later retry');
  } finally {
    delete runtime.companyDatabase;
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_POOL_MAX;
  }
});

test('SQLite remains usable independently of the PostgreSQL pool setting', async () => {
  delete process.env.DATABASE_URL;
  process.env.DATABASE_POOL_MAX = 'invalid-postgres-only-value';
  process.env.SQLITE_PATH = ':memory:';
  delete runtime.companyDatabase;
  try {
    const database = await db();
    assert.equal(database.dialect, 'sqlite');
    await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', ['pool-fixture', 'Synthetic pool fixture', '2026-10-10T00:00:00.000Z']);
    const [row] = await database.all('SELECT name FROM organizations WHERE id = ?', ['pool-fixture']);
    assert.equal(row.name, 'Synthetic pool fixture');
  } finally {
    delete runtime.companyDatabase;
    delete process.env.DATABASE_POOL_MAX;
    delete process.env.SQLITE_PATH;
  }
});
