import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';

type Value = string | number | null;
type Row = Record<string, unknown>;
type Statement = { sql: string; params?: Value[]; expectedChanges?: number };
export class WriteConflictError extends Error {
  constructor() { super('The record changed concurrently.'); this.name = 'WriteConflictError'; }
}
export interface Database {
  all<T extends Row = Row>(sql: string, params?: Value[]): Promise<T[]>;
  run(sql: string, params?: Value[]): Promise<number>;
  batch(statements: Statement[]): Promise<void>;
}

const schema = [
  `CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, organization_id TEXT NOT NULL REFERENCES organizations(id), created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), kind TEXT NOT NULL, status TEXT, data TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS entities_scope ON entities(organization_id, kind, created_at)`,
  `CREATE INDEX IF NOT EXISTS auth_session_expiry ON auth_sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), user_id TEXT NOT NULL REFERENCES users(id), entity_id TEXT NOT NULL, event TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS service_heartbeats (id TEXT PRIMARY KEY, service TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL)`,
];

async function openDatabase(): Promise<Database> {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
    const pgSql = (sql: string) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
    for (const sql of schema) await pool.query(sql);
    return {
      async all<T extends Row>(sql: string, params: Value[] = []) { return (await pool.query(pgSql(sql), params)).rows as T[]; },
      async run(sql, params = []) { return (await pool.query(pgSql(sql), params)).rowCount ?? 0; },
      async batch(statements) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const item of statements) {
            const result = await client.query(pgSql(item.sql), item.params ?? []);
            if (item.expectedChanges !== undefined && result.rowCount !== item.expectedChanges) throw new WriteConflictError();
          }
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      },
    };
  }
  // This is mutable runtime storage, never an asset for Next's standalone trace.
  const path = process.env.SQLITE_PATH || resolve(/* turbopackIgnore: true */ process.cwd(), 'data', 'workspace.sqlite');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  for (const sql of schema) sqlite.exec(sql);
  return {
    async all<T extends Row>(sql: string, params: Value[] = []) { return sqlite.prepare(sql).all(...params) as T[]; },
    async run(sql, params = []) { return Number(sqlite.prepare(sql).run(...params).changes); },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        for (const item of statements) {
          const result = sqlite.prepare(item.sql).run(...(item.params ?? []));
          if (item.expectedChanges !== undefined && Number(result.changes) !== item.expectedChanges) throw new WriteConflictError();
        }
        sqlite.exec('COMMIT');
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}

const globalDb = globalThis as typeof globalThis & { companyDatabase?: Promise<Database> };
export function db(): Promise<Database> {
  return globalDb.companyDatabase ??= openDatabase().catch((error) => { delete globalDb.companyDatabase; throw error; });
}
