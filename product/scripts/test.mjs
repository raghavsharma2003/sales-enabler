#!/usr/bin/env node
// Run product/tests/*.test.ts with node:test through tsx. Tests that need Postgres read
// DATABASE_URL and skip when it is unset, so the unit suite runs anywhere.
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '..', 'tests');
const picked = process.argv.slice(2);
// tests/review/ holds adversarial-review findings as todo tests: a failing todo is reported but does not fail the run.
const inDir = d => readdirSync(d).filter(f => f.endsWith('.test.ts')).sort().map(f => join(d, f));
const review = join(dir, 'review');
const files = picked.length ? picked : [...inDir(dir), ...(existsSync(review) ? inDir(review) : [])];
// In CI the spec reporter lists every failing test again at the end of the log, where it can be found.
const reporter = process.env.CI ? ['--test-reporter=spec'] : [];
const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=4', ...reporter, ...files], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
child.on('exit', code => { process.exitCode = code ?? 1; });
