// After BLIND 10 was scored: which caller crisis rule fires on each floor false positive and each judge miss.
// Which caller crisis rule fires on each line (the real floor code at 0e77e47, one rule at a time). No model calls.
import { readFileSync } from 'node:fs';
const { RULES, callerSignals } = await import('/dev/shm/wt-vm11/product/shared/safety/index.ts');
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const all = RULES.caller;
for (const r of rows) {
  const hits: string[] = [];
  for (const rule of all.filter((x: any) => x.signal === 'crisis')) { (RULES as any).caller = [rule]; if (callerSignals(r.text).crisis) hits.push(rule.id); }
  (RULES as any).caller = all;
  console.log(`${r.id} ${r.lang} floor=${callerSignals(r.text).crisis} rules=[${hits.join(', ')}]`);
}
