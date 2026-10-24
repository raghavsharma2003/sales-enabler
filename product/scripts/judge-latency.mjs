#!/usr/bin/env node
// Latency of the caller judge, uncensored (open.2026-10-24.judge-timeout-budget). Sends exactly the request the live
// judge sends (shared/safety/judge.ts judgeRequest) for DEV caller lines, one at a time at most --rps per second, with
// a 10 s cap instead of the contract's timeout, and records every latency. From those samples it reports the
// distribution, the share over each candidate timeout, and a simulated hedge (one identical second request after H
// ms; the first answer wins): P(no answer by T) and the extra requests it costs, for each (H, T). No verdicts are
// scored here; it measures time only. Run from the India VM (Vertex is called only from India).
//   node product/scripts/judge-latency.mjs [--source dev-7,optout-dev] [--set f.json] [--limit 300] [--rps 1] [--out-dir DIR]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

if (!process.execArgv.some(a => a.includes('tsx'))) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
const flags = new Map();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) flags.set(argv[i].slice(2), argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true');
const opt = (k, d) => flags.get(k) ?? d;
if (opt('set', '').split(',').some(f => /heldout/i.test(f)) || opt('source', '').split(',').some(s => /heldout/i.test(s))) {
  console.error('judge-latency is for DEV lines only; a blind set is scored once by judge-eval'); process.exit(2);
}

const { judgeRequest, judgeUserText, judgeConfigured } = await import('../shared/safety/judge.ts');
const { complete, setFakeLlm } = await import('../server/llm.ts');
if (process.env.VP_JUDGE_EVAL_FAKE) setFakeLlm((await import(process.env.VP_JUDGE_EVAL_FAKE)).default);
else if (!judgeConfigured()) { console.error('No judge model configured: VP_LLM_SAFETY_JUDGE_URL/KEY/MODEL'); process.exit(2); }

const lines = [];
const sources = new Set(opt('source', 'dev-7,optout-dev').split(',').filter(Boolean));
const doc = JSON.parse(readFileSync(fileURLToPath(new URL('../shared/safety/cases.json', import.meta.url)), 'utf8'));
for (const c of doc.cases) if (c.fn === 'callerSignals' && sources.has(c.source) && typeof c.input === 'string') lines.push(c.input);
for (const f of opt('set', '').split(',').filter(Boolean)) {
  const s = JSON.parse(readFileSync(f, 'utf8'));
  for (const k of ['caller_crisis', 'caller_benign', 'opt_out', 'benign']) for (const x of s[k] ?? []) lines.push(x.text);
}
const limit = Number(opt('limit', '300')), rps = Number(opt('rps', '1')), gap = rps > 0 ? 1000 / rps : 0;
const todo = lines.slice(0, limit);

const samples = [], errors = [];
let next = 0;
for (const text of todo) {
  const wait = next - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
  next = Date.now() + gap;
  const t0 = performance.now();
  try {
    await complete({ ...judgeRequest(judgeUserText(text)), signal: AbortSignal.timeout(10_000) });
    samples.push(Math.round(performance.now() - t0));
  } catch (e) { errors.push({ ms: Math.round(performance.now() - t0), error: String(e?.message ?? e).slice(0, 120) }); }
  if ((samples.length + errors.length) % 25 === 0) process.stderr.write(`${samples.length + errors.length}/${todo.length}\n`);
}

const sorted = [...samples].sort((a, b) => a - b);
const q = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;
const over = t => samples.length ? samples.filter(x => x > t).length / samples.length : null;
const T = [1000, 1200, 1500, 1800, 2000, 2500, 3000], H = [800, 1000, 1200, 1500];
// Hedge simulated on the empirical distribution, assuming the two requests' latencies are independent draws:
// answered by T if L1 <= T or H + L2 <= T (L2 from the same samples). An error counts as never answering.
const failRate = (samples.length + errors.length) ? errors.length / (samples.length + errors.length) : 0;
const pNoAnswer = (h, t) => {
  if (!samples.length) return null;
  const p1 = over(t) * (1 - failRate) + failRate;                // first misses T
  const p2 = h >= t ? 1 : over(t - h) * (1 - failRate) + failRate; // second (sent at H) misses T
  return p1 * p2;
};
const report = {
  date: new Date().toISOString().slice(0, 10), n: { requested: todo.length, answered: samples.length, errors: errors.length },
  sources: [...sources], rps, latency_ms: { p50: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95), p98: q(0.98), p99: q(0.99), max: sorted.at(-1) ?? null },
  share_over: Object.fromEntries(T.map(t => [t, over(t)])),
  hedge: H.flatMap(h => T.filter(t => t > h).map(t => ({ hedge_after_ms: h, timeout_ms: t, p_unavailable: pNoAnswer(h, t), extra_requests: over(h) }))),
  no_hedge: T.map(t => ({ timeout_ms: t, p_unavailable: samples.length ? over(t) * (1 - failRate) + failRate : null })),
  errors, note: 'Uncensored latencies (10 s cap) of the live judge request. Hedge figures are a simulation from these samples (independent draws); verify the chosen pair on staging.',
};
const pct = x => x === null ? '-' : `${(100 * x).toFixed(1)}%`;
const md = [
  `# Judge latency (${report.date})`, '',
  `${samples.length} answered, ${errors.length} errors of ${todo.length} DEV lines at ≤${rps} req/s. p50 ${q(0.5)} ms, p90 ${q(0.9)}, p95 ${q(0.95)}, p99 ${q(0.99)}, max ${sorted.at(-1)}.`, '',
  '| Timeout (no hedge) | Unavailable |', '|---|---|', ...report.no_hedge.map(r => `| ${r.timeout_ms} | ${pct(r.p_unavailable)} |`), '',
  '| Hedge after | Timeout | Unavailable (simulated) | Extra requests |', '|---|---|---|---|',
  ...report.hedge.map(r => `| ${r.hedge_after_ms} | ${r.timeout_ms} | ${pct(r.p_unavailable)} | ${pct(r.extra_requests)} |`), '', report.note, '',
].join('\n');
console.log(md);
if (opt('out-dir')) { mkdirSync(opt('out-dir'), { recursive: true }); writeFileSync(join(opt('out-dir'), 'report.json'), JSON.stringify(report, null, 1)); writeFileSync(join(opt('out-dir'), 'summary.md'), md); }
