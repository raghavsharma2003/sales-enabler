// BLIND 11, after the one scoring: the floor in both doors, line by line. TS = shared/safety callerSignals (the door
// judge-eval ran); Python = vpvoice safety.caller_signals (the voice runtime's door), both reading the shipped
// rules.json. Also checks the TS verdicts against the floor column of the scored results.json, and names, for each
// floor false positive and each floor miss, which crisis rule fires (one rule at a time, as ../../judge-blind10/ops/
// floor_probe.mts did). Prints ids, languages and rule ids only, never the text. No model calls.
// Usage: node --import tsx floor_parity.mts TREE SET.json [RESULTS.json]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [tree, setPath, resPath] = process.argv.slice(2);
const { RULES, callerSignals } = await import(`${tree}/product/shared/safety/index.ts`);
const set = JSON.parse(readFileSync(setPath, 'utf8'));
const tag = setPath.split('/').pop()!.replace(/\.json$/, '');
const py: [string, number, boolean][] = JSON.parse(execFileSync('python3', ['-I', new URL('./floor_parity.py', import.meta.url).pathname, tree, setPath], { encoding: 'utf8', maxBuffer: 1 << 26 }));
const pyMap = new Map(py.map(([l, i, c]) => [`${l}.${i}`, c]));
const all = (RULES as any).caller;
const rulesFor = (text: string) => { const hits: string[] = []; for (const rule of all.filter((x: any) => x.signal === 'crisis')) { (RULES as any).caller = [rule]; if (callerSignals(text).crisis) hits.push(rule.id); } (RULES as any).caller = all; return hits; };
const res = resPath ? new Map((JSON.parse(readFileSync(resPath, 'utf8')) as any[]).map(r => [r.id, r])) : null;
let n = 0, disagree = 0, resMismatch = 0; const tsOn = { crisis: 0, benign: 0 }, pyOn = { crisis: 0, benign: 0 };
const lines: string[] = [];
for (const [lst, kind] of [['caller_crisis', 'crisis'], ['caller_benign', 'benign']] as const) {
  (set[lst] ?? []).forEach((x: any, i: number) => {
    n++; const id = `${tag}.${kind}.${i + 1}`;
    const ts = callerSignals(x.text).crisis, p = pyMap.get(`${lst}.${i}`);
    if (ts) tsOn[kind]++; if (p) pyOn[kind]++;
    if (ts !== p) { disagree++; lines.push(`DISAGREE ${id} ${x.lang} ts=${ts} py=${p} rules=[${rulesFor(x.text).join(', ')}]`); }
    if (res) { const r = res.get(id); if (!r || r.text !== x.text || Boolean(r.floor) !== ts) { resMismatch++; lines.push(`RESULTS-MISMATCH ${id} results.floor=${r?.floor} ts=${ts}`); } }
    if ((kind === 'benign' && ts) || (kind === 'crisis' && !ts)) lines.push(`${kind === 'benign' ? 'FLOOR-FP' : 'FLOOR-MISS'} ${id} ${x.lang} rules=[${rulesFor(x.text).join(', ')}]`);
  });
}
console.log(`lines ${n}; TS floor on crisis ${tsOn.crisis}, on benign ${tsOn.benign}; Python floor on crisis ${pyOn.crisis}, on benign ${pyOn.benign}; TS/Python disagreements ${disagree}` + (res ? `; TS vs results.json floor mismatches ${resMismatch}` : ''));
for (const l of lines) console.log(l);
