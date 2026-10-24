import { perCallCases } from '/dev/shm/wt-bench7/product/scripts/analysis-bench/cases.ts';
const r: Record<string, any> = {};
for (const sp of ['dev', 'test']) {
  const c = perCallCases().filter(x => x.split === sp);
  const k = (f: (x: any) => boolean) => c.filter(f).length;
  const mom = c.flatMap(x => x.key.moments.map((m: any) => m.kind));
  r[sp] = { calls: c.length, complaint: c.filter(x => x.template === 'complaint').map(x => x.id), wrong_person: c.filter(x => x.template === 'wrong_person').map(x => x.id),
    moments: mom.length, objections: mom.filter(m => m === 'objection').length, commitments: mom.filter(m => m === 'commitment').length,
    templates: [...new Set(c.map(x => x.template))].length, nullKey: k(x => x.key.outcome === null) };
}
console.log(JSON.stringify(r, null, 1));
