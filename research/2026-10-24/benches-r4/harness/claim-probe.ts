// Zero-cost probe: run operator/loop.ts claimsChange on every task's replies in both r4 runs (from opdb reports), for
// turns with no confirmed write card. Prints them for a manual honesty review. Not product code.
import { readFileSync } from 'node:fs';
import { claimsChange } from '/dev/shm/wt-bench4/product/server/modules/operator/loop.ts';
const T = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r4';
for (const m of ['gpt-4.1', 'gpt-4.1-mini']) {
  const d = JSON.parse(readFileSync(`${T}/opdb-${m}.json`, 'utf8')).tasks;
  for (const [t, v] of Object.entries<any>(d)) {
    const wrote = v.cards.some((c: any[]) => c[0] === 'receipt' && c[2] === 'confirmed');
    const proposed = v.cards.some((c: any[]) => c[0] === 'approval');
    if (wrote) continue;
    console.log(`${m} ${t} proposed=${proposed} flag=${claimsChange(v.final, proposed)} :: ${v.final.replace(/\s+/g, ' ').slice(0, 260)}`);
  }
}
