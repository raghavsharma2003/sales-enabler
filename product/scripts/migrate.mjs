#!/usr/bin/env node
// Apply product/db/migrations/*.sql in order against DATABASE_URL, tracking applied
// files in schema_migrations. Idempotent: already-applied files are skipped.
// A NNNN_*.mjs migration is for a step SQL cannot do (encrypting rows with VP_SECRET_KEY): its default export
// receives the client and runs inside the same transaction as its schema_migrations row.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '..', 'db', 'migrations');
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is required'); process.exit(2); }

const files = readdirSync(dir).filter(f => f.endsWith('.sql') || f.endsWith('.mjs')).sort();
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename text primary key, applied_at timestamptz not null default now())');
const done = new Set((await client.query('SELECT filename FROM schema_migrations')).rows.map(r => r.filename));
let applied = 0;
for (const f of files) {
  if (done.has(f)) continue;
  try {
    await client.query('BEGIN');
    if (f.endsWith('.mjs')) await (await import(pathToFileURL(join(dir, f)).href)).default(client);
    else await client.query(readFileSync(join(dir, f), 'utf8'));
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
    await client.query('COMMIT');
    console.log('applied', f);
    applied++;
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('FAILED', f, '\n', e.message);
    await client.end();
    process.exit(1);
  }
}
console.log(applied ? `done (${applied} new)` : 'up to date');
await client.end();
