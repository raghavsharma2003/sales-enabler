import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { nodeErrors, SCHEMA_FROM } from './lib/context-schema.mjs';
const graph = JSON.parse(readFileSync(new URL('../context/graph.json', import.meta.url), 'utf8'));
const missingLocal = [];
const ids = new Set();
for (const node of graph.nodes) {
  const errors = nodeErrors(node);
  if (ids.has(node.id)) errors.push('duplicate id');
  if (errors.length) throw new Error(`Invalid node ${node.id}: ${errors.join('; ')}`);
  ids.add(node.id);
  // Older asset nodes list paths inside the harvested sibling repos, so only newer nodes' `paths` are checked here.
  const newer = node.date >= SCHEMA_FROM;
  for (const path of [node.path, ...(newer ? node.paths ?? [] : [])].filter(Boolean)) {
    if (existsSync(resolve(path))) continue;
    // data/ is gitignored local evidence: absent on fresh clones, so warn instead of failing.
    if (path.startsWith('data/')) missingLocal.push(path);
    else throw new Error(`Missing graph evidence: ${path}`);
  }
}
for (const edge of graph.edges) if (!ids.has(edge.from) || !ids.has(edge.to) || !edge.relation) throw new Error(`Invalid edge: ${JSON.stringify(edge)}`);
const events = readFileSync(new URL('../context/events.jsonl', import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
if (events.some(e => !e.date || !e.event || !e.details)) throw new Error('Invalid context event');
if (missingLocal.length) console.warn(`Note: ${missingLocal.length} local-only evidence files (data/) not present in this checkout.`);
console.log(`Context valid: ${ids.size} nodes, ${graph.edges.length} edges, ${events.length} events.`);
