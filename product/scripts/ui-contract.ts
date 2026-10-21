// Integration check: every tool name the web app calls (web/src) must be registered by the loaded modules.
// Run: node --import tsx product/scripts/ui-contract.ts [--strict]   (--strict exits 1 when a name is missing)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildApp } from '../server/app.ts';
import { modules } from '../server/modules/index.ts';

const webSrc = fileURLToPath(new URL('../web/src/', import.meta.url));
const { registry } = buildApp(new pg.Pool({ connectionString: 'postgresql://unused@/unused' }), modules);
const have = new Set(registry.list().map(t => t.name));
const used = new Map<string, Set<string>>();
// Any quoted dotted name the UI uses (act('x.y'), run('x.y'), read hooks, tool tables): file names are filtered out.
const CALL = /['"`]([a-z][a-z_]*\.[a-z_]+(?:\.[a-z_]+)?)['"`]/g;
const NOT_TOOL = /\.(ts|tsx|js|mjs|css|png|svg|json|html|woff2|wav|mp3|md)$/;
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(f)) for (const m of readFileSync(p, 'utf8').matchAll(CALL)) {
      if (NOT_TOOL.test(m[1])) continue;
      if (!used.has(m[1])) used.set(m[1], new Set());
      used.get(m[1])!.add(p.slice(webSrc.length));
    }
  }
};
walk(webSrc);
const missing = [...used.keys()].filter(u => !have.has(u)).sort();
console.log(`web calls ${used.size} tools; ${used.size - missing.length} registered; ${missing.length} missing`);
for (const m of missing) console.log(`  ${m}  (${[...used.get(m)!].join(', ')})`);
if (process.argv.includes('--strict') && missing.length) process.exitCode = 1;
