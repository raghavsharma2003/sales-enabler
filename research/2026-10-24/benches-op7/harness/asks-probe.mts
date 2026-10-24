// op7 copy of the op6 harness asks-probe.mts (paths only: worktree /dev/shm/wt-op7, cluster /dev/shm/vp-pgbench-op7:55442, bench-tools-op7; safety-probe imports pg from the worktree's own node_modules). Below: op6's header.
// op6 (zero cost): operator/loop.ts asksFor on given (tool, member text) pairs. Not product code.
import { asksFor } from '/dev/shm/wt-op7/product/server/modules/operator/loop.ts';
for (const [tool, text] of JSON.parse(process.argv[2]!) as [string, string][]) console.log(JSON.stringify({ tool, text, asksFor: asksFor(tool, text) }));
