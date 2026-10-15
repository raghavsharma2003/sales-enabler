import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const graph = JSON.parse(readFileSync(new URL('../context/graph.json', import.meta.url), 'utf8'));
const types = new Set(['requirement','evidence','decision','component','risk','open-question','experiment','asset','rejection','measurement','repo']);
const missingLocal = [];
const ids = new Set();
for (const node of graph.nodes) {
  if (!node.id || ids.has(node.id) || !types.has(node.type) || !node.title || !node.status) throw new Error(`Invalid node: ${node.id}`);
  ids.add(node.id);
  if (node.path && !existsSync(resolve(node.path))) {
    // data/ is gitignored local evidence: absent on fresh clones, so warn instead of failing.
    if (node.path.startsWith('data/')) missingLocal.push(node.path);
    else throw new Error(`Missing graph evidence: ${node.path}`);
  }
}
for (const edge of graph.edges) if (!ids.has(edge.from) || !ids.has(edge.to) || !edge.relation) throw new Error(`Invalid edge: ${JSON.stringify(edge)}`);
const events = readFileSync(new URL('../context/events.jsonl', import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
if (events.some(e => !e.date || !e.event || !e.details)) throw new Error('Invalid context event');
if (missingLocal.length) console.warn(`Note: ${missingLocal.length} local-only evidence files (data/) not present in this checkout.`);
console.log(`Context valid: ${ids.size} nodes, ${graph.edges.length} edges, ${events.length} events.`);
