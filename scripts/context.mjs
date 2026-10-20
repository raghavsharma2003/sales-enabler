// Query and maintain the project memory (context/PROTOCOL.md). No dependencies; run with `npm run context -- <flags>`.
//   (no flags)            summary: counts, owner directives in force, open questions
//   --brief               DIRECTION.md + newest open questions + recent events + log debt (the SessionStart hook)
//   --node <id>           one node with every edge in and out
//   --type <t> [--since YYYY-MM-DD] [--status s]
//   --grep <regex>        over ids and titles
//   --debt                commits since the last change to context/ that did not touch it
//   --merge <file.json>   append {nodes, edges, events} from a context/inbox proposal after validation
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { nodeErrors } from './lib/context-schema.mjs';

const root = new URL('../', import.meta.url);
const file = name => new URL(`context/${name}`, root);
const graph = JSON.parse(readFileSync(file('graph.json'), 'utf8'));
const events = () => readFileSync(file('events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] ?? true; };
const byId = new Map(graph.nodes.map(n => [n.id, n]));
const line = n => `${n.id}  [${n.type}/${n.status}${n.date ? ' ' + n.date : ''}]  ${n.title}`;
const clip = (s, max = 220) => s.length > max ? `${s.slice(0, max - 1)}…` : s;

function git(...a) {
  try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd(); }
  catch { return ''; }
}

function debt() {
  const last = git('log', '-1', '--format=%H', '--', 'context/');
  const commits = last ? git('log', '--format=%h %ad %s', '--date=short', `${last}..HEAD`).split('\n').filter(Boolean) : [];
  const dirty = git('status', '--porcelain').split('\n').filter(l => l && !l.slice(3).startsWith('context/'));
  return { commits, dirty };
}

function printDebt() {
  const { commits, dirty } = debt();
  if (!commits.length && !dirty.length) return console.log('Log debt: none (every commit since the last context change is reflected).');
  console.log(`Log debt: ${commits.length} commit(s) since the last context/ change, ${dirty.length} uncommitted path(s) outside context/.`);
  for (const c of commits.slice(0, 15)) console.log(`  ${c}`);
  if (dirty.length) console.log(`  uncommitted: ${dirty.slice(0, 10).map(l => l.slice(3)).join(', ')}${dirty.length > 10 ? ', …' : ''}`);
  console.log('  -> Log these (from the transcript if needed) before new work. See context/PROTOCOL.md.');
}

const newest = (pred, k) => graph.nodes.filter(pred).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, k);

if (flag('--brief')) {
  if (existsSync(file('DIRECTION.md'))) console.log(readFileSync(file('DIRECTION.md'), 'utf8').trim());
  console.log('\n## Open questions (newest 12)');
  for (const n of newest(n => n.type === 'open-question' && n.status === 'open', 12)) console.log(`- ${clip(line(n))}`);
  console.log('\n## Recent events');
  for (const e of events().slice(-8)) console.log(`- ${e.date} ${e.event}: ${clip(e.details, 160)}`);
  console.log('\n## Context tools: npm run context -- --node <id> | --grep <re> | --type <t> --since <date>; protocol: context/PROTOCOL.md');
  printDebt();
} else if (flag('--node')) {
  const id = flag('--node'); const n = byId.get(id);
  if (!n) { console.error(`No node ${id}. Try --grep.`); process.exit(1); }
  console.log(JSON.stringify(n, null, 1));
  for (const e of graph.edges.filter(e => e.from === id)) console.log(`  -> ${e.relation} -> ${e.to}  ${clip(byId.get(e.to)?.title ?? '', 120)}`);
  for (const e of graph.edges.filter(e => e.to === id)) console.log(`  <- ${e.relation} <- ${e.from}  ${clip(byId.get(e.from)?.title ?? '', 120)}`);
} else if (flag('--type') || flag('--grep') || flag('--since') || flag('--status')) {
  const type = flag('--type'), since = flag('--since'), status = flag('--status'), re = flag('--grep') && new RegExp(flag('--grep'), 'i');
  const hits = graph.nodes.filter(n => (!type || n.type === type) && (!since || (n.date ?? '') >= since)
    && (!status || n.status === status) && (!re || re.test(n.id) || re.test(n.title)));
  for (const n of hits) console.log(clip(line(n), 260));
  console.log(`${hits.length} node(s).`);
} else if (flag('--debt')) {
  printDebt();
} else if (flag('--merge')) {
  const path = flag('--merge'); const add = JSON.parse(readFileSync(path, 'utf8'));
  const problems = [], nodes = [], edges = [];
  for (const n of add.nodes ?? []) {
    if (byId.has(n.id)) { console.log(`skip existing ${n.id}`); continue; }
    const errs = nodeErrors(n); if (errs.length) { problems.push(`${n.id}: ${errs.join('; ')}`); continue; }
    nodes.push(n); byId.set(n.id, n);
  }
  const have = new Set(graph.edges.map(e => `${e.from}|${e.to}|${e.relation}`));
  for (const e of add.edges ?? []) {
    if (!byId.has(e.from) || !byId.has(e.to) || !e.relation) { problems.push(`edge ${JSON.stringify(e)}`); continue; }
    if (!have.has(`${e.from}|${e.to}|${e.relation}`)) edges.push({ from: e.from, to: e.to, relation: e.relation });
  }
  const seen = new Set(events().map(e => `${e.date}|${e.event}|${e.details}`));
  const evs = (add.events ?? []).filter(e => e.date && e.event && e.details || (problems.push(`event ${JSON.stringify(e)}`), false))
    .filter(e => !seen.has(`${e.date}|${e.event}|${e.details}`));
  if (problems.length) { console.error(`Refused, nothing merged:\n  ${problems.join('\n  ')}`); process.exit(1); }
  graph.nodes.push(...nodes); graph.edges.push(...edges);
  graph.updatedAt = new Date().toISOString().slice(0, 10);
  // Same bytes Python's json.dump(indent=1, ensure_ascii=True) writes, so merges from either tool diff cleanly.
  writeFileSync(file('graph.json'), `${JSON.stringify(graph, null, 1).replace(/[\u0080-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}\n`);
  if (evs.length) writeFileSync(file('events.jsonl'), `${readFileSync(file('events.jsonl'), 'utf8').replace(/\n*$/, '\n')}${evs.map(e => JSON.stringify(e)).join('\n')}\n`);
  console.log(`Merged ${nodes.length} node(s), ${edges.length} edge(s), ${evs.length} event(s) from ${path}. Now run npm run context:check.`);
} else {
  const count = {}; for (const n of graph.nodes) count[n.type] = (count[n.type] ?? 0) + 1;
  console.log(`${graph.nodes.length} nodes, ${graph.edges.length} edges, updated ${graph.updatedAt}. ${JSON.stringify(count)}`);
  console.log('\nOwner directives (newest 15):');
  for (const n of newest(n => n.id.startsWith('directive.') && n.status !== 'superseded', 15)) console.log(`- ${clip(line(n))}`);
  console.log('\nOpen questions (newest 15):');
  for (const n of newest(n => n.type === 'open-question' && n.status === 'open', 15)) console.log(`- ${clip(line(n))}`);
}
