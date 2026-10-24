import { perCallCases, crossCallCases } from '/dev/shm/wt-bench7/product/scripts/analysis-bench/cases.ts';
console.log(JSON.stringify({ perCall: Object.fromEntries(perCallCases().map(c => [c.id, c.split])), cross: Object.fromEntries(crossCallCases(9).map(c => [c.id, c.split])) }));
