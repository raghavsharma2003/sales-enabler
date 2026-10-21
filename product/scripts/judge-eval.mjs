#!/usr/bin/env node
// Eval harness for the caller-crisis judge (shared/safety/judge.json). Scores the judge on every crisis line in
// shared/safety/cases.json (Hinglish, Hindi, Tamil-English and Bengali-English, including blind set 6's indirect lines)
// against every non-crisis caller line (benign idioms and the other signals). Reports recall and false positives for
// the floor alone, the judge alone and the two combined (raise-only), with p50/p95 latency, tokens, and the cost per
// 1,000 judged turns at the prices you pass in. Nothing here guesses a price.
//
//   VP_LLM_SAFETY_JUDGE_URL=... VP_LLM_SAFETY_JUDGE_KEY=... node product/scripts/judge-eval.mjs <model> \
//     [--price-in <INR per 1M input tokens>] [--price-out <INR per 1M output tokens>] [--concurrency 2] [--limit N] [--out file.json]
//
// See shared/safety/README.md ("Judge eval"). Run it from the lab VM; never from the coding sandbox with Google keys.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// The judge is TypeScript: re-launch under tsx when started as plain `node product/scripts/judge-eval.mjs`.
if (!process.execArgv.some(a => a.includes('tsx'))) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
const args = process.argv.slice(2);
const model = args.find(a => !a.startsWith('--') && !/^\d/.test(a) && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
if (!model) { console.error('usage: node product/scripts/judge-eval.mjs <model> [--price-in N] [--price-out N] [--concurrency 2] [--limit N] [--out file]'); process.exit(2); }
process.env.VP_LLM_SAFETY_JUDGE_MODEL = model;
const { judgeCallerCrisis, judgeConfigured, CRISIS_JUDGE } = await import('../shared/safety/judge.ts');
// Dry runs only: VP_JUDGE_EVAL_FAKE=<module whose default export is a fake LLM fn> scripts the model (no network).
if (process.env.VP_JUDGE_EVAL_FAKE) {
  const { setFakeLlm } = await import('../server/llm.ts');
  setFakeLlm((await import(process.env.VP_JUDGE_EVAL_FAKE)).default);
}
if (!judgeConfigured()) { console.error('No judge model configured: set VP_LLM_SAFETY_JUDGE_URL and VP_LLM_SAFETY_JUDGE_KEY (or VP_LLM_DEFAULT_*).'); process.exit(2); }

const cases = JSON.parse(readFileSync(fileURLToPath(new URL('../shared/safety/cases.json', import.meta.url)), 'utf8')).cases
  .filter(c => c.fn === 'callerSignals');
const limit = Number(opt('limit', '0'));
const rows = cases.map(c => ({ id: c.id, source: c.source, text: c.input, crisis: c.expect?.signals?.crisis === true }));
const pick = limit ? [...rows.filter(r => r.crisis).slice(0, limit), ...rows.filter(r => !r.crisis).slice(0, limit)] : rows;
const conc = Math.max(1, Number(opt('concurrency', '2')));

const results = [];
let next = 0;
async function worker() {
  while (next < pick.length) {
    const r = pick[next++];
    // shadow mode: the judge is always asked (even when the floor fired) so its own recall is measured; nothing acts on it here.
    const res = await judgeCallerCrisis(r.text, { mode: 'shadow', assumeConfigured: true });
    const own = res.floor && CRISIS_JUDGE.skip_when_floor_fires
      ? await judgeAlone(r.text) : { says: res.judge ? res.judge.crisis && res.judge.kind !== 'none' && res.judge.confidence >= CRISIS_JUDGE.threshold : null, latencyMs: res.latencyMs, usage: res.usage, failed: res.event?.type === 'judge_unavailable' };
    results.push({ ...r, floor: res.floor, judge: own.says, failed: own.failed, latencyMs: own.latencyMs, usage: own.usage });
    if (results.length % 25 === 0) process.stderr.write(`${results.length}/${pick.length}\n`);
  }
}
/** The floor fired, so judgeCallerCrisis skipped the model; ask it anyway (same prompt and parser) to measure the judge alone. */
async function judgeAlone(text) {
  const saved = CRISIS_JUDGE.skip_when_floor_fires;
  CRISIS_JUDGE.skip_when_floor_fires = false;
  try {
    const res = await judgeCallerCrisis(text, { mode: 'shadow', assumeConfigured: true });
    return { says: res.judge ? res.judge.crisis && res.judge.kind !== 'none' && res.judge.confidence >= CRISIS_JUDGE.threshold : null, latencyMs: res.latencyMs, usage: res.usage, failed: res.event?.type === 'judge_unavailable' };
  } finally { CRISIS_JUDGE.skip_when_floor_fires = saved; }
}
await Promise.all(Array.from({ length: conc }, worker));

const pos = results.filter(r => r.crisis), neg = results.filter(r => !r.crisis);
const rate = (a, b) => `${a}/${b} (${b ? (100 * a / b).toFixed(1) : '0.0'}%)`;
const lat = results.filter(r => !r.failed).map(r => r.latencyMs).sort((a, b) => a - b);
const q = p => lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))].toFixed(0) : 'n/a';
const tin = results.reduce((s, r) => s + (r.usage?.inputTokens ?? 0), 0), tout = results.reduce((s, r) => s + (r.usage?.outputTokens ?? 0), 0);
const pin = opt('price-in'), pout = opt('price-out');
const per1k = pin && pout ? ((tin / results.length) * Number(pin) / 1e6 + (tout / results.length) * Number(pout) / 1e6) * 1000 : null;
const bySource = {};
for (const r of pos) { const s = (bySource[r.source] ??= { n: 0, floor: 0, judge: 0, either: 0 }); s.n++; s.floor += r.floor; s.judge += r.judge === true; s.either += r.floor || r.judge === true; }
const report = {
  date: new Date().toISOString().slice(0, 10), model, threshold: CRISIS_JUDGE.threshold, timeout_ms: CRISIS_JUDGE.timeout_ms,
  n: { crisis: pos.length, non_crisis: neg.length },
  recall: { floor: rate(pos.filter(r => r.floor).length, pos.length), judge: rate(pos.filter(r => r.judge === true).length, pos.length),
            floor_or_judge: rate(pos.filter(r => r.floor || r.judge === true).length, pos.length) },
  false_positives: { floor: rate(neg.filter(r => r.floor).length, neg.length), judge: rate(neg.filter(r => r.judge === true).length, neg.length),
                     floor_or_judge: rate(neg.filter(r => r.floor || r.judge === true).length, neg.length) },
  judge_unavailable: rate(results.filter(r => r.failed).length, results.length),
  latency_ms: { p50: q(0.5), p95: q(0.95), timeouts_count_as_unavailable: true },
  tokens_per_turn: { input: (tin / results.length).toFixed(0), output: (tout / results.length).toFixed(1) },
  cost_per_1k_turns_inr: per1k === null ? 'pass --price-in and --price-out (INR per 1M tokens) to compute' : per1k.toFixed(2),
  recall_by_source: bySource,
  misses: pos.filter(r => !r.floor && r.judge !== true).map(r => r.id),
  false_alarms: neg.filter(r => r.judge === true).map(r => r.id),
  caveat: 'The floor was tuned on these vectors (in-sample for the floor). The judge prompt was written without tuning on them, but by an author who had seen them; a fresh blind set is the honest test.',
};
console.log(JSON.stringify(report, null, 2));
const out = opt('out');
if (out) writeFileSync(out, JSON.stringify({ report, results }, null, 1));
