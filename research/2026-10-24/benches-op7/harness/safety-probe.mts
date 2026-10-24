// op7 copy of the op6 harness safety-probe.mts (paths only: worktree /dev/shm/wt-op7, cluster /dev/shm/vp-pgbench-op7:55442, bench-tools-op7; safety-probe imports pg from the worktree's own node_modules). Below: op6's header.
// op6 copy of the op5 harness safety-probe.mts (paths only). op5 (new, zero cost, no model): every agent draft saved in a scored run's DB, checked by the real regex door
// (agents/guard.ts hardFindings: T-L1 AI honesty, crisis lines, manipulation) and shared/safety lintAgentConfig T-L1.
// Usage: node --import tsx safety-probe.mts <db> [<db> ...]. Prints counts and any finding. Not product code.
import pg from '/dev/shm/wt-op7/node_modules/pg/lib/index.js';
import { hardFindings } from '/dev/shm/wt-op7/product/server/modules/agents/guard.ts';
import { lintAgentConfig } from '/dev/shm/wt-op7/product/shared/safety/index.ts';
for (const db of process.argv.slice(2)) {
  const c = new pg.Client({ host: '/dev/shm/vp-pgbench-op7', port: 55442, user: 'vp', database: db });
  await c.connect();
  const r = await c.query("SELECT w.name AS ws, a.name, a.draft FROM agent a JOIN workspace w ON w.id = a.workspace_id WHERE w.name LIKE 'bench %'");
  const v = await c.query("SELECT w.name AS ws, v.config FROM agent_version v JOIN agent a ON a.id = v.agent_id JOIN workspace w ON w.id = a.workspace_id WHERE w.name LIKE 'bench %'").catch(() => ({ rows: [] as any[] }));
  let bad = 0;
  for (const row of [...r.rows.map(x => ({ ws: x.ws, cfg: x.draft, kind: 'draft' })), ...v.rows.map((x: any) => ({ ws: x.ws, cfg: x.config?.agent, kind: 'version' }))]) {   // agent_version.config = { lint, agent, brief }
    if (!row.cfg || !Object.keys(row.cfg).length) continue;
    let hard: any[] = [], l1: any[] = [];
    try { hard = hardFindings(row.cfg); l1 = lintAgentConfig(row.cfg).filter((f: any) => f.rule === 'T-L1'); } catch (e) { console.log(db, row.ws, row.kind, 'probe error', String(e).slice(0, 120)); continue; }
    if (hard.length || l1.length) { bad++; console.log(db, row.ws, row.kind, JSON.stringify({ hard: hard.map(f => [f.rule, f.path]), l1: l1.map((f: any) => f.path) })); }
  }
  console.log(JSON.stringify({ db, drafts: r.rows.length, versions: v.rows.length, withFinding: bad }));
  await c.end();
}
