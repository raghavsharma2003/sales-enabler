import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const graph = JSON.parse(readFileSync(new URL('../context/graph.json', import.meta.url), 'utf8'));
const types = new Set(['requirement','evidence','decision','component','risk','open-question','experiment']);
const ids = new Set();
for (const node of graph.nodes) {
  if (!node.id || ids.has(node.id) || !types.has(node.type) || !node.title || !node.status) throw new Error(`Invalid node: ${node.id}`);
  ids.add(node.id);
  if (node.path && !existsSync(resolve(node.path))) throw new Error(`Missing graph evidence: ${node.path}`);
}
for (const edge of graph.edges) if (!ids.has(edge.from) || !ids.has(edge.to) || !edge.relation) throw new Error(`Invalid edge: ${JSON.stringify(edge)}`);
const events = readFileSync(new URL('../context/events.jsonl', import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
if (events.some(e => !e.date || !e.event || !e.details)) throw new Error('Invalid context event');
console.log(`Context valid: ${ids.size} nodes, ${graph.edges.length} edges, ${events.length} events.`);
