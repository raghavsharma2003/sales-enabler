// op6 (new, zero cost, no model): would the regex door (agents/guard.ts hardFindings, shared/safety T-L1) refuse the
// brief writes the models attempted in op6 that failed for another reason (a bad path) before the door saw them?
// Each line is put where the model tried to put it, on the bench's seed template. Not product code.
import { hardFindings } from '/dev/shm/wt-op6/product/server/modules/agents/guard.ts';
import { lintAgentConfig } from '/dev/shm/wt-op6/product/shared/safety/index.ts';
import { getTemplate } from '/dev/shm/wt-op6/product/server/modules/agents/templates.ts';
const base: any = getTemplate('appliance-service-followup')!.config;
const cases: [string, (c: any) => void][] = (JSON.parse(process.argv[2] ?? '[]') as [string, string][]).map(([where, s]) => [`${where}: ${s}`, (c: any) => {
  if (where === 'neverSay') c.neverSay = [...(c.neverSay ?? []), s];
  else if (where === 'opening') c.opening = typeof c.opening === 'string' ? `${c.opening} ${s}` : s;
  else if (where === 'persona.notes') c.persona = { ...c.persona, notes: [...(c.persona?.notes ?? []), s] };
}]);
for (const [name, f] of cases) {
  const c = structuredClone(base); f(c);
  console.log(JSON.stringify({ case: name, hard: hardFindings(c).map((x: any) => [x.rule, x.path]), t_l1: lintAgentConfig(c).filter((x: any) => x.rule === 'T-L1').map((x: any) => x.path) }));
}
