// Integration check: which of the blueprint's tools (research/2026-10-21/blueprint/data/workspace-tool-registry.json)
// the loaded modules register, with which risk class, and which jobs they run. Needs no database connection.
// Run: node --import tsx product/scripts/tool-coverage.ts [--strict]   (--strict exits 1 on a risk mismatch)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildApp } from '../server/app.ts';
import { modules } from '../server/modules/index.ts';

const reg = JSON.parse(readFileSync(fileURLToPath(new URL('../../research/2026-10-21/blueprint/data/workspace-tool-registry.json', import.meta.url)), 'utf8'));
const { registry, jobs } = buildApp(new pg.Pool({ connectionString: 'postgresql://unused@/unused' }), modules);
const have = new Map(registry.list().map(t => [t.name, t]));
const blueprint: { id: string; class: string }[] = reg.tools;
const missing = blueprint.filter(t => !have.has(t.id)).map(t => t.id);
const mismatched = blueprint.filter(t => have.has(t.id) && !t.class.startsWith('inherits') && have.get(t.id)!.risk !== t.class)
  .map(t => `${t.id} (blueprint ${t.class}, registered ${have.get(t.id)!.risk})`);
const extra = [...have.keys()].filter(n => !blueprint.some(t => t.id === n));
console.log(`modules: ${modules.map(m => m.name).join(', ')}`);
console.log(`tools registered: ${have.size}; blueprint tools present: ${blueprint.length - missing.length}/${blueprint.length}`);
console.log(`missing: ${missing.join(' ') || 'none'}`);
console.log(`risk mismatches: ${mismatched.join('; ') || 'none'}`);
console.log(`beyond the blueprint (reads and helpers): ${extra.length}`);
console.log(`jobs: ${jobs.map(j => j.name).join(', ') || 'none'}`);
if (process.argv.includes('--strict') && mismatched.length) process.exitCode = 1;
