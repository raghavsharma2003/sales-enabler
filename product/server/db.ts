// Postgres access. One pool per process; tx() runs a function in a transaction and rolls back on
// any throw. Every query that touches tenant data must filter by workspace_id.
import pg from 'pg';

export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(url: string | undefined = process.env.DATABASE_URL): pg.Pool {
  if (!url) throw new Error('DATABASE_URL is not set');
  return new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX ?? 10) });
}

export async function tx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function one<T = Record<string, unknown>>(q: Queryable, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await q.query(sql, params);
  return (r.rows[0] as T) ?? null;
}

export async function many<T = Record<string, unknown>>(q: Queryable, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await q.query(sql, params)).rows as T[];
}
