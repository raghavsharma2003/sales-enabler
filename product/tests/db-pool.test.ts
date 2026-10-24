// A Postgres restart must not take the control plane down: an idle pooled connection that dies is logged and dropped,
// and the next query opens a fresh one (staging, 2026-10-24 06:25 UTC: the pool had no 'error' listener and the
// process exited).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, one } from '../server/db.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;

test('an idle connection killed by the server is dropped, the process lives, and the next query works', { skip }, async () => {
  const pool = createPool();
  const killer = createPool();
  const logged: string[] = [];
  const err = console.error;
  console.error = (...a: unknown[]) => { logged.push(a.join(' ')); };
  try {
    const c = await pool.connect();
    const pid = (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    c.release();   // idle in the pool now
    await killer.query('SELECT pg_terminate_backend($1)', [pid]);
    for (let i = 0; i < 50 && !logged.length; i++) await new Promise(r => setTimeout(r, 20));
    assert.ok(logged.some(l => l.includes('database connection lost')), 'the lost connection is logged, not thrown');
    assert.equal((await one<{ ok: number }>(pool, 'SELECT 1 AS ok'))!.ok, 1, 'the next query reconnects');
  } finally {
    console.error = err;
    await pool.end(); await killer.end();
  }
});
