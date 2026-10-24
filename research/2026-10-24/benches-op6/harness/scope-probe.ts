// op6 copy of the op5 scope-probe.ts (zero cost, no model). op5 printed what the retry scope guard counted as "asked
// for" (findTools over the member's words). 6fd8da5 replaced that with an action match (operator/loop.ts asksFor): a
// write whose action the member's words do not name is held after a NOT DONE, and an unasked protective write
// (suppress, pause, stop, forget, erase, DPDP) becomes an approval card. This probe prints, for every bench task's
// message, which owner write tools asksFor counts as asked for, and which protective tools it does not (those would be
// turned into cards). Usage: node --import tsx scope-probe.ts [task-id ...]. Not product code.
import { readFileSync } from 'node:fs';
import { asksFor } from '/dev/shm/wt-op6/product/server/modules/operator/loop.ts';
import { TASKS } from '/dev/shm/wt-op6/product/scripts/operator-bench-tasks.ts';
const cat = JSON.parse(readFileSync('/dev/shm/wt-op6/product/shared/tool-catalog.json', 'utf8')).tools
  .filter((t: any) => (t.roles ?? []).includes('owner') && t.risk !== 'read');
const PROTECTIVE = /\.(suppress\w*|pause|stop\w*|forget|erase|block\w*|end_runaway|opt_out)$|^dpdp\./;   // copied from loop.ts
const only = new Set(process.argv.slice(2));
for (const t of TASKS) {
  if (only.size && !only.has(t.id)) continue;
  const asked = cat.filter((x: any) => asksFor(x.name, t.text)).map((x: any) => x.name);
  const protectiveUnasked = cat.filter((x: any) => PROTECTIVE.test(x.name) && !asksFor(x.name, t.text)).map((x: any) => x.name);
  console.log(JSON.stringify({ task: t.id, text: t.text, writesAskedFor: asked.length, protectiveAskedFor: asked.filter((n: string) => PROTECTIVE.test(n)), protectiveUnaskedBecomeCards: protectiveUnasked.length }));
}
