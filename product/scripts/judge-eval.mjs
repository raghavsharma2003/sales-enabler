#!/usr/bin/env node
// Eval harness for the caller-crisis judge (shared/safety/judge.json). Scores the judge on the crisis lines in
// shared/safety/cases.json against the non-crisis caller lines (benign idioms and the other signals). It reports
// recall and false positives for the floor alone, the judge alone and the two combined (raise-only), with Wilson 95%
// intervals per slice (overall, per source set, per language), p50/p95 latency, tokens, and cost per 1,000 judged
// turns at the prices you pass in. Nothing here guesses a price.
//
// One model per run; the endpoint, key and model come from the environment (names only, never values in logs):
//   VP_LLM_SAFETY_JUDGE_URL         full OpenAI-compatible chat-completions URL
//   VP_LLM_SAFETY_JUDGE_KEY         the key or bearer token
//   VP_LLM_SAFETY_JUDGE_KEY_HEADER  'api-key' for Azure; default 'authorization' (Bearer)
//   VP_LLM_SAFETY_JUDGE_MODEL       the model or deployment id (or pass it as the first argument)
//
//   node product/scripts/judge-eval.mjs [model] --source heldout-6 --rps 1 --price-in <INR/1M> --price-out <INR/1M> \
//     --max-cost-inr 50 --max-requests 1000 --out-dir /tmp/judge-eval/<label>
//
// See shared/safety/README.md ("Judge eval"). Run it from the India lab VM.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// The judge is TypeScript: re-launch under tsx when started as plain `node product/scripts/judge-eval.mjs`.
if (!process.execArgv.some(a => a.includes('tsx'))) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const argv = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { flags.set(argv[i].slice(2), argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'); }
  else positional.push(argv[i]);
}
const opt = (name, dflt) => flags.get(name) ?? dflt;
const usage = 'usage: node product/scripts/judge-eval.mjs [model] [--source heldout-6] [--set product/shared/safety/sets/heldout-7.json] [--rps 1] [--concurrency 2] [--price-in N --price-out N] [--max-cost-inr N] [--max-requests N] [--limit N] [--out-dir DIR] [--label NAME]';
if (flags.has('help')) { console.log(usage); process.exit(0); }
if (positional[0]) process.env.VP_LLM_SAFETY_JUDGE_MODEL = positional[0];

const { judgeCallerCrisis, judgeConfigured, CRISIS_JUDGE } = await import('../shared/safety/judge.ts');
// Dry runs only: VP_JUDGE_EVAL_FAKE=<module whose default export is a fake LLM fn> scripts the model (no network).
if (process.env.VP_JUDGE_EVAL_FAKE) {
  const { setFakeLlm } = await import('../server/llm.ts');
  setFakeLlm((await import(process.env.VP_JUDGE_EVAL_FAKE)).default);
}
if (!judgeConfigured()) {
  console.error('No judge model configured: set VP_LLM_SAFETY_JUDGE_URL, VP_LLM_SAFETY_JUDGE_KEY and VP_LLM_SAFETY_JUDGE_MODEL (or pass the model as the first argument).');
  console.error(usage); process.exit(2);
}

// ---- data
const doc = JSON.parse(readFileSync(fileURLToPath(new URL('../shared/safety/cases.json', import.meta.url)), 'utf8'));
const sources = opt('source') ? new Set(opt('source').split(',')) : null;
let rows = doc.cases.filter(c => c.fn === 'callerSignals' && (sources ? sources.has(c.source) : !opt('set')))
  .map(c => ({ id: c.id, source: c.source, lang: c.lang ?? 'unknown', text: c.input, crisis: c.expect?.signals?.crisis === true }));
// --set <file>[,<file>]: add a set-7-shaped file (caller_crisis / caller_benign lists of {text, lang}), e.g.
// shared/safety/sets/heldout-7.json, which is a measurement set kept out of cases.json on purpose.
for (const f of (opt('set') ? opt('set').split(',') : [])) {
  const s = JSON.parse(readFileSync(f, 'utf8'));
  const tag = f.split('/').pop().replace(/\.json$/, '');
  rows.push(...(s.caller_crisis ?? []).map((x, i) => ({ id: `${tag}.crisis.${i + 1}`, source: tag, lang: x.lang ?? 'unknown', text: x.text, crisis: true })));
  rows.push(...(s.caller_benign ?? []).map((x, i) => ({ id: `${tag}.benign.${i + 1}`, source: tag, lang: x.lang ?? 'unknown', text: x.text, crisis: false })));
}
const limit = Number(opt('limit', '0'));
if (!rows.length) { console.error(`no caller lines: check --source ${opt('source') ?? ''} / --set ${opt('set') ?? ''}`); process.exit(2); }
{ // interleave crisis and non-crisis lines, so a run stopped by a cap still covers both sides
  const pos = rows.filter(r => r.crisis), neg = rows.filter(r => !r.crisis);
  const P = limit ? pos.slice(0, limit) : pos, N = limit ? neg.slice(0, limit) : neg;
  rows = [];
  for (let i = 0, j = 0; i < P.length || j < N.length;) {
    if (i < P.length) rows.push(P[i++]);
    if (j < N.length && (i >= P.length || j * P.length <= i * N.length)) rows.push(N[j++]);
  }
}


// ---- budget: a rate limit shared by all workers, a request cap, and a cost cap (needs prices)
const rps = Number(opt('rps', '1'));
const minGapMs = rps > 0 ? 1000 / rps : 0;
const maxRequests = Number(opt('max-requests', '2000'));
const priceIn = opt('price-in') !== undefined ? Number(opt('price-in')) : null;
const priceOut = opt('price-out') !== undefined ? Number(opt('price-out')) : null;
const maxCost = opt('max-cost-inr') !== undefined ? Number(opt('max-cost-inr')) : null;
if (maxCost !== null && (priceIn === null || priceOut === null)) { console.error('--max-cost-inr needs --price-in and --price-out'); process.exit(2); }
let requests = 0, spentInr = 0, nextSlot = 0, stopped = null;
async function slot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + minGapMs;
  if (at > now) await new Promise(r => setTimeout(r, at - now));
}
const costOf = u => u && priceIn !== null && priceOut !== null ? (u.inputTokens * priceIn + u.outputTokens * priceOut) / 1e6 : 0;

/** Ask the judge about one line. The floor's own verdict is read separately; here the model is always asked, so the
 *  judge's recall is measured on every line (judgeCallerCrisis skips the model when the floor already fired). */
async function ask(text) {
  const saved = CRISIS_JUDGE.skip_when_floor_fires;
  CRISIS_JUDGE.skip_when_floor_fires = false;
  try { return await judgeCallerCrisis(text, { mode: 'shadow', assumeConfigured: true }); }
  finally { CRISIS_JUDGE.skip_when_floor_fires = saved; }
}

const results = [];
let next = 0;
async function worker() {
  while (next < rows.length && !stopped) {
    if (requests >= maxRequests) { stopped = `max-requests ${maxRequests} reached`; break; }
    if (maxCost !== null && spentInr >= maxCost) { stopped = `max-cost-inr ${maxCost} reached`; break; }
    requests++;                                   // counted before the wait, so concurrent workers never overshoot the cap
    const r = rows[next++];
    await slot();
    const res = await ask(r.text);
    spentInr += costOf(res.usage);
    const says = res.judge ? res.judge.crisis && res.judge.kind !== 'none' && res.judge.confidence >= CRISIS_JUDGE.threshold : null;
    results.push({ ...r, floor: res.floor, judge: says, confidence: res.judge?.confidence ?? null, kind: res.judge?.kind ?? null,
      failed: res.event?.type === 'judge_unavailable' ? res.event.reason : null, latencyMs: Math.round(res.latencyMs), usage: res.usage });
    if (results.length % 25 === 0) process.stderr.write(`${results.length}/${rows.length} requests=${requests} spent=₹${spentInr.toFixed(2)}\n`);
  }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.max(1, Number(opt('concurrency', '2'))) }, worker));

// ---- statistics
/** Wilson 95% score interval for k successes in n. */
function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.959964, p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const stat = (k, n) => { const [lo, hi] = wilson(k, n); return { k, n, rate: n ? k / n : 0, ci95: [lo, hi] }; };
const fmt = s => s.n ? `${s.k}/${s.n} (${(100 * s.rate).toFixed(1)}%, CI ${(100 * s.ci95[0]).toFixed(1)}-${(100 * s.ci95[1]).toFixed(1)})` : '-';
function slice(rs) {
  const pos = rs.filter(r => r.crisis), neg = rs.filter(r => !r.crisis);
  const judged = r => r.judge === true;
  return {
    recall: { floor: stat(pos.filter(r => r.floor).length, pos.length), judge: stat(pos.filter(judged).length, pos.length),
              floor_or_judge: stat(pos.filter(r => r.floor || judged(r)).length, pos.length) },
    false_positives: { floor: stat(neg.filter(r => r.floor).length, neg.length), judge: stat(neg.filter(judged).length, neg.length),
                       floor_or_judge: stat(neg.filter(r => r.floor || judged(r)).length, neg.length) },
  };
}
const groupBy = (key) => Object.fromEntries([...new Set(results.map(r => r[key]))].sort().map(v => [v, slice(results.filter(r => r[key] === v))]));
const ok = results.filter(r => !r.failed);
const lat = ok.map(r => r.latencyMs).sort((a, b) => a - b);
const q = p => lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : null;
const tin = results.reduce((s, r) => s + (r.usage?.inputTokens ?? 0), 0), tout = results.reduce((s, r) => s + (r.usage?.outputTokens ?? 0), 0);
const label = opt('label', 'judge');
const report = {
  date: new Date().toISOString().slice(0, 10), label, threshold: CRISIS_JUDGE.threshold, timeout_ms: CRISIS_JUDGE.timeout_ms,
  model_env: 'VP_LLM_SAFETY_JUDGE_MODEL', sources: [...(sources ?? []), ...(opt('set') ? opt('set').split(',').map(f => f.split('/').pop()) : [])], rps, wall_s: Math.round((Date.now() - t0) / 1000),
  n: { judged: results.length, planned: rows.length, crisis: results.filter(r => r.crisis).length, non_crisis: results.filter(r => !r.crisis).length },
  stopped_early: stopped,
  overall: slice(results), by_source: groupBy('source'), by_lang: groupBy('lang'),
  judge_unavailable: stat(results.filter(r => r.failed).length, results.length),
  unavailable_reasons: results.filter(r => r.failed).reduce((m, r) => ({ ...m, [r.failed]: (m[r.failed] ?? 0) + 1 }), {}),
  latency_ms: { p50: q(0.5), p95: q(0.95), max: lat.at(-1) ?? null, note: 'successful calls only; timeouts count as unavailable' },
  tokens_per_turn: { input: results.length ? tin / results.length : 0, output: results.length ? tout / results.length : 0 },
  cost_inr: priceIn === null ? null : { spent: spentInr, per_1k_turns: results.length ? 1000 * spentInr / results.length : 0, price_in_per_1m: priceIn, price_out_per_1m: priceOut },
  misses: results.filter(r => r.crisis && !r.floor && r.judge !== true).map(r => r.id),
  false_alarms: results.filter(r => !r.crisis && r.judge === true).map(r => r.id),
  caveat: 'The floor was tuned on the sets it has seen (in-sample for the floor); the judge prompt was not tuned on any set. Language tags on sets 1-6 are heuristic; sets dev-7 and heldout-7 carry the writer\'s tags.',
};

const md = [
  `# Crisis judge eval: ${label} (${report.date})`, '',
  `Sources: ${Array.isArray(report.sources) ? report.sources.join(', ') : 'all'}. Judged ${report.n.judged}/${report.n.planned} lines (${report.n.crisis} crisis, ${report.n.non_crisis} non-crisis) at ≤${rps} req/s.${stopped ? ` Stopped early: ${stopped}.` : ''}`,
  `Threshold ${report.threshold}, timeout ${report.timeout_ms} ms. Unavailable: ${fmt(report.judge_unavailable)} ${JSON.stringify(report.unavailable_reasons)}.`,
  `Latency p50 ${report.latency_ms.p50} ms, p95 ${report.latency_ms.p95} ms. Tokens per turn ${report.tokens_per_turn.input.toFixed(0)} in / ${report.tokens_per_turn.output.toFixed(1)} out.` +
    (report.cost_inr ? ` Cost ₹${report.cost_inr.spent.toFixed(2)} total, ₹${report.cost_inr.per_1k_turns.toFixed(2)} per 1,000 turns.` : ' Cost: pass --price-in/--price-out.'),
  '', '| Slice | Recall: floor | Recall: judge | Recall: floor or judge | FP: judge | FP: floor or judge |', '|---|---|---|---|---|---|',
  ...[['overall', report.overall], ...Object.entries(report.by_source).map(([k, v]) => [`source ${k}`, v]), ...Object.entries(report.by_lang).map(([k, v]) => [`lang ${k}`, v])]
    .map(([name, s]) => `| ${name} | ${fmt(s.recall.floor)} | ${fmt(s.recall.judge)} | ${fmt(s.recall.floor_or_judge)} | ${fmt(s.false_positives.judge)} | ${fmt(s.false_positives.floor_or_judge)} |`),
  '', `Intervals are Wilson 95%. ${report.caveat}`, '',
].join('\n');

console.log(md);
const outDir = opt('out-dir');
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 1));
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 1));
  writeFileSync(join(outDir, 'summary.md'), md);
  console.error(`wrote ${join(outDir, 'report.json')}, results.json and summary.md`);
}
