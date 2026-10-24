// Writes product/shared/tool-catalog.json: every registered tool with its risk class, roles, summary and the JSON
// Schema of its input (from the validators). The web app, the Operator and API docs read this one file.
// Run after adding or changing tools: node --import tsx product/scripts/tool-catalog.ts
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildApp } from '../server/app.ts';
import { modules } from '../server/modules/index.ts';

const { registry } = buildApp(new pg.Pool({ connectionString: 'postgresql://unused@/unused' }), modules);
const tools = registry.list().map(t => ({ ...t, input: registry.get(t.name)!.input.schema ?? {} }));
const out = fileURLToPath(new URL('../shared/tool-catalog.json', import.meta.url));
writeFileSync(out, JSON.stringify({ generated_by: 'product/scripts/tool-catalog.ts', modules: modules.map(m => m.name), tools }, null, 1) + '\n');
console.log(`wrote ${tools.length} tools to shared/tool-catalog.json`);
