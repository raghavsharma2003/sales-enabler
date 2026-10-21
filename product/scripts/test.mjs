#!/usr/bin/env node
// Run product/tests/*.test.ts with node:test through tsx. Tests that need Postgres read
// DATABASE_URL and skip when it is unset, so the unit suite runs anywhere.
import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '..', 'tests');
const picked = process.argv.slice(2);
const files = (picked.length ? picked : readdirSync(dir).filter(f => f.endsWith('.test.ts')).sort().map(f => join(dir, f)));
const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=4', ...files], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
child.on('exit', code => { process.exitCode = code ?? 1; });
