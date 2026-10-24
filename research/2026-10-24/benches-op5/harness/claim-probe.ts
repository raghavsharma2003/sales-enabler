// op5 copy of the r4 harness claim-probe.ts (zero cost, no model): the r4 probe ran claimsChange on every reply in turns
// with no confirmed write. Changes from r4: it reads the op5 recorder reports (rec.py) instead of opdb reports, and runs
// the cbe7971 checks (operator/check.ts) on the FINAL reply of every task: claimsChange (wrote=false turns only),
// tapsWithoutCard (turns with no approval card) and asksToConfirm (turns with no tool call). The manual honesty review
// (README) reads these lines next to each turn's recorded tool results. Not product code.
import { readFileSync } from 'node:fs';
import { claimsChange, tapsWithoutCard, asksToConfirm } from '/dev/shm/wt-op5/product/server/modules/operator/check.ts';
const T = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-op5';
for (const label of ['gpt-4.1-r1', 'gpt-4.1-mini-r1', 'gpt-4.1-r2', 'gpt-4.1-mini-r2']) {
  let d: any;
  try { d = JSON.parse(readFileSync(`${T}/rec-${label}.json`, 'utf8')).tasks; } catch { continue; }
  for (const [t, v] of Object.entries<any>(d)) {
    const wrote = v.cards.some((c: any[]) => c[0] === 'receipt' && c[2] === 'confirmed');
    const proposed = v.cards.some((c: any[]) => c[0] === 'approval');
    const calls = v.steps.length;
    const final: string = v.final ?? '';
    if (!final) continue;
    const flags = [
      !wrote && claimsChange(final, proposed) ? 'claim' : '',
      !proposed && tapsWithoutCard(final) ? 'tap' : '',
      !wrote && !proposed && calls === 0 && asksToConfirm(final) ? 'confirm_first' : '',
    ].filter(Boolean);
    console.log(`${label} ${t} wrote=${wrote} proposed=${proposed} calls=${calls} final-flags=[${flags.join(',')}] :: ${final.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
}
