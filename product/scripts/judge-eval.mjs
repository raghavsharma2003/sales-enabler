#!/usr/bin/env node
// Eval harness for the caller judge (shared/safety/judge.json: one call, two labels, crisis and opt_out). Each line is
// scored for one task: crisis lines against non-crisis lines, and opt-out requests against opt-out look-alikes. It
// reports recall and false positives for the floor alone, the judge alone and the two combined (raise-only), with
// Wilson 95% intervals per slice (overall, per source set, per language), p50/p95 latency, tokens, and cost per 1,000
// judged turns at the prices you pass in. Nothing here guesses a price.
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
import { createHash } from 'node:crypto';
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
const usage = 'usage: node product/scripts/judge-eval.mjs [model] [--task crisis|opt_out|both|brief-review] [--source heldout-6] [--set product/shared/safety/sets/heldout-7.json,product/shared/safety/sets/heldout-optout.json] [--rps 1] [--concurrency 2] [--price-in N --price-out N] [--max-cost-inr N] [--max-requests N] [--limit N] [--out-dir DIR] [--label NAME] [--prompt-file FILE (DEV sets only)]';
if (flags.has('help')) { console.log(usage); process.exit(0); }
if (positional[0]) process.env[flags.get('task') === 'brief-review' ? 'VP_LLM_BRIEF_REVIEW_MODEL' : 'VP_LLM_SAFETY_JUDGE_MODEL'] = positional[0];

const { judgeCallerCrisis, judgeConfigured, CRISIS_JUDGE } = await import('../shared/safety/judge.ts');
// Dry runs only: VP_JUDGE_EVAL_FAKE=<module whose default export is a fake LLM fn> scripts the model (no network).
if (process.env.VP_JUDGE_EVAL_FAKE) {
  const { setFakeLlm } = await import('../server/llm.ts');
  setFakeLlm((await import(process.env.VP_JUDGE_EVAL_FAKE)).default);
}
const review = opt('task', 'crisis') === 'brief-review' ? await import('../server/modules/agents/review.ts') : null;
const briefBase = review ? (await import('../server/modules/agents/templates.ts')).getTemplate('appliance-service-followup').config : null;
if (review ? !review.reviewConfigured() : !judgeConfigured()) {
  console.error(review ? 'No review model configured: set VP_LLM_BRIEF_REVIEW_URL, _KEY and _MODEL (or VP_LLM_DEFAULT_*).'
    : 'No judge model configured: set VP_LLM_SAFETY_JUDGE_URL, VP_LLM_SAFETY_JUDGE_KEY and VP_LLM_SAFETY_JUDGE_MODEL (or pass the model as the first argument).');
  console.error(usage); process.exit(2);
}

// ---- data
// Every row is scored for one task: 'crisis' (truth: is it a crisis line) or 'opt_out' (truth: is it an opt-out request).
// --task picks which (default crisis, the original harness); a --set file brings its own task by its shape.
const task = opt('task', 'crisis');
if (!['crisis', 'opt_out', 'both', 'brief-review'].includes(task)) { console.error(`--task must be crisis, opt_out, both or brief-review`); process.exit(2); }
// --task brief-review: the model review of brief text (agents/review.ts). Each line (a snippet's lines become several
// notes) is a persona note on a template; floor = the regex door's hard findings, judge = the model's findings.
const briefTask = task === 'brief-review';
const wants = t => t === 'brief_review' ? briefTask : (task === 'both' || task === t);
const doc = JSON.parse(readFileSync(fileURLToPath(new URL('../shared/safety/cases.json', import.meta.url)), 'utf8'));
const sources = opt('source') ? new Set(opt('source').split(',')) : null;
let rows = [];
for (const c of doc.cases) {
  if (c.fn !== 'callerSignals' || !(sources ? sources.has(c.source) : !opt('set'))) continue;
  const sig = c.expect?.signals ?? {};
  const base = { id: c.id, source: c.source, lang: c.lang ?? 'unknown', text: c.input };
  // crisis: crisis lines vs every caller line not marked crisis (as before)
  if (wants('crisis')) rows.push({ ...base, task: 'crisis', truth: sig.crisis === true });
  // opt-out: lines whose expectation names optOut (true = a request, false = a look-alike)
  if (wants('opt_out') && typeof sig.optOut === 'boolean') rows.push({ ...base, task: 'opt_out', truth: sig.optOut });
}
// --set <file>[,<file>]: measurement files kept out of cases.json on purpose. A crisis set has caller_crisis /
// caller_benign lists (sets/heldout-7.json); an opt-out set has opt_out / benign lists (sets/heldout-optout.json).
for (const f of (opt('set') ? opt('set').split(',') : [])) {
  const set = JSON.parse(readFileSync(f, 'utf8'));
  const tag = f.split('/').pop().replace(/\.json$/, '');
  const add = (list, t, truth, kind) => { if (wants(t)) rows.push(...(list ?? []).map((x, i) => ({ id: `${tag}.${kind}.${i + 1}`, source: tag, lang: x.lang ?? 'unknown', text: x.text, persona: x.persona, field: x.field, key: x.key, task: t, truth }))); };
  add(set.caller_crisis, 'crisis', true, 'crisis'); add(set.caller_benign, 'crisis', false, 'benign');
  add(set.opt_out, 'opt_out', true, 'opt_out'); add(set.benign, 'opt_out', false, 'benign');
  if (briefTask) { add(set.flag, 'brief_review', true, 'flag'); add(set.pass, 'brief_review', false, 'pass'); }
}
const limit = Number(opt('limit', '0'));
if (!rows.length) { console.error(`no caller lines: check --task ${task} / --source ${opt('source') ?? ''} / --set ${opt('set') ?? ''}`); process.exit(2); }
{ // interleave positives and negatives, so a run stopped by a cap still covers both sides
  const pos = rows.filter(r => r.truth), neg = rows.filter(r => !r.truth);
  const P = limit ? pos.slice(0, limit) : pos, N = limit ? neg.slice(0, limit) : neg;
  rows = [];
  for (let i = 0, j = 0; i < P.length || j < N.length;) {
    if (i < P.length) rows.push(P[i++]);
    if (j < N.length && (i >= P.length || j * P.length <= i * N.length)) rows.push(N[j++]);
  }
}

// --prompt-file: try a system-prompt variant (DEV tuning, open.2026-10-23.judge-raise-soft-checkin). Never on a blind
// set: a prompt shaped on a heldout line would make that set's one score meaningless.
let promptSha = null;
if (opt('prompt-file')) {
  const blind = [...(sources ?? []), ...(opt('set') ? opt('set').split(',') : [])].filter(x => /heldout/i.test(x));
  if (blind.length || !(sources || opt('set'))) { console.error(`--prompt-file is for DEV sets only (refused: ${blind.join(', ') || 'no --set/--source given'})`); process.exit(2); }
  (review ? review.BRIEF_REVIEW : CRISIS_JUDGE).system_prompt = readFileSync(opt('prompt-file'), 'utf8').trim();
  promptSha = createHash('sha256').update((review ? review.BRIEF_REVIEW : CRISIS_JUDGE).system_prompt).digest('hex').slice(0, 16);
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
async function askBrief(text, persona, field, key) {
  const c = structuredClone(briefBase);
  c.persona = { ...c.persona, ...(persona ?? {}) };
  // Each item sits where its field says: a fact with its key, the opening line, or persona notes (the default).
  if (field === 'fact') c.facts = [...(c.facts ?? []), { key: key || 'note', value: text, purpose: 'service', source: 'eval' }];
  else if (field === 'opening') c.opening = { ...c.opening, usefulFirst: text };
  else c.persona.notes = text.split('\n').map(x => x.trim()).filter(Boolean);
  const r = await review.reviewBrief(c, { assumeConfigured: true, threshold: 0, alwaysAsk: true });
  const mine = f => /^(persona\.notes|facts\[|opening\.usefulFirst)/.test(f.path);
  const top = r.model.filter(mine).sort((a, b) => b.confidence - a.confidence)[0];
  return { floor: r.rules.some(mine), floorOptOut: false, judge: r.mode === 'model' ? { confidence: top?.confidence ?? 0, kind: top?.kind ?? 'none' } : null,
    event: r.mode === 'unavailable' ? { type: 'judge_unavailable', reason: r.reason } : null, latencyMs: r.latencyMs ?? 0, usage: r.usage ?? null };
}
async function ask(text, persona, field, key) {
  if (briefTask) return askBrief(text, persona, field, key);
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
    const res = await ask(r.text, r.persona, r.field, r.key);
    spentInr += costOf(res.usage);
    const v = res.judge;
    // The label for this row's task, as the judge read it (its own recall; the raise-time precedence rules are not applied).
    const says = !v ? null : r.task === 'brief_review' ? v.kind !== 'none' && v.confidence >= review.BRIEF_REVIEW.threshold
      : r.task === 'crisis' ? v.crisis && v.kind !== 'none' && v.confidence >= CRISIS_JUDGE.threshold
      : Boolean(v.optOut?.value) && v.optOut.confidence >= CRISIS_JUDGE.opt_out_threshold;
    results.push({ ...r, floor: r.task === 'opt_out' ? res.floorOptOut : res.floor, judge: says,
      confidence: r.task === 'opt_out' ? (v?.optOut?.confidence ?? null) : (v?.confidence ?? null), kind: v?.kind ?? null, optOut: v?.optOut?.value ?? null,
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
  const pos = rs.filter(r => r.truth), neg = rs.filter(r => !r.truth);
  const judged = r => r.judge === true;
  return {
    recall: { floor: stat(pos.filter(r => r.floor).length, pos.length), judge: stat(pos.filter(judged).length, pos.length),
              floor_or_judge: stat(pos.filter(r => r.floor || judged(r)).length, pos.length) },
    false_positives: { floor: stat(neg.filter(r => r.floor).length, neg.length), judge: stat(neg.filter(judged).length, neg.length),
                       floor_or_judge: stat(neg.filter(r => r.floor || judged(r)).length, neg.length) },
  };
}
const tasks = [...new Set(results.map(r => r.task))].sort();
const groupBy = (rs, key) => Object.fromEntries([...new Set(rs.map(r => r[key]))].sort().map(v => [v, slice(rs.filter(r => r[key] === v))]));
const perTask = Object.fromEntries(tasks.map(t => { const rs = results.filter(r => r.task === t);
  return [t, { n: { positive: rs.filter(r => r.truth).length, negative: rs.filter(r => !r.truth).length }, overall: slice(rs), by_source: groupBy(rs, 'source'), by_lang: groupBy(rs, 'lang') }]; }));
// Threshold sweep from the recorded confidences (no extra model calls): what each threshold would have given on these
// lines. Choose on DEV only; a blind set is scored once at the threshold in judge.json.
const SWEEP = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
const saysAt = (r, t) => r.confidence !== null && r.confidence >= t && (r.task === 'opt_out' ? r.optOut === true : r.kind !== null && r.kind !== 'none');
const sweep = rs => SWEEP.map(t => {
  const pos = rs.filter(r => r.truth), neg = rs.filter(r => !r.truth);
  return { threshold: t, recall_judge: stat(pos.filter(r => saysAt(r, t)).length, pos.length), recall_floor_or_judge: stat(pos.filter(r => r.floor || saysAt(r, t)).length, pos.length),
    fp_judge: stat(neg.filter(r => saysAt(r, t)).length, neg.length), fp_floor_or_judge: stat(neg.filter(r => r.floor || saysAt(r, t)).length, neg.length) };
});
for (const t of tasks) perTask[t].sweep = sweep(results.filter(r => r.task === t));
const ok = results.filter(r => !r.failed);
const lat = ok.map(r => r.latencyMs).sort((a, b) => a - b);
const q = p => lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : null;
const tin = results.reduce((s, r) => s + (r.usage?.inputTokens ?? 0), 0), tout = results.reduce((s, r) => s + (r.usage?.outputTokens ?? 0), 0);
const label = opt('label', 'judge');
const report = {
  date: new Date().toISOString().slice(0, 10), label, threshold: review ? review.BRIEF_REVIEW.threshold : CRISIS_JUDGE.threshold, timeout_ms: review ? review.BRIEF_REVIEW.timeout_ms : CRISIS_JUDGE.timeout_ms,
  model_env: review ? 'VP_LLM_BRIEF_REVIEW_MODEL' : 'VP_LLM_SAFETY_JUDGE_MODEL', sources: [...(sources ?? []), ...(opt('set') ? opt('set').split(',').map(f => f.split('/').pop()) : [])], rps, wall_s: Math.round((Date.now() - t0) / 1000),
  task, opt_out_threshold: CRISIS_JUDGE.opt_out_threshold, prompt: promptSha ? { file: opt('prompt-file').split('/').pop(), sha256_16: promptSha } : (review ? 'brief-review.json' : 'judge.json'),
  n: { judged: results.length, planned: rows.length },
  stopped_early: stopped,
  tasks: perTask,
  judge_unavailable: stat(results.filter(r => r.failed).length, results.length),
  unavailable_reasons: results.filter(r => r.failed).reduce((m, r) => ({ ...m, [r.failed]: (m[r.failed] ?? 0) + 1 }), {}),
  latency_ms: { p50: q(0.5), p95: q(0.95), max: lat.at(-1) ?? null, note: 'successful calls only; timeouts count as unavailable' },
  tokens_per_turn: { input: results.length ? tin / results.length : 0, output: results.length ? tout / results.length : 0 },
  cost_inr: priceIn === null ? null : { spent: spentInr, per_1k_turns: results.length ? 1000 * spentInr / results.length : 0, price_in_per_1m: priceIn, price_out_per_1m: priceOut },
  misses: results.filter(r => r.truth && !r.floor && r.judge !== true).map(r => `${r.task}:${r.id}`),
  false_alarms: results.filter(r => !r.truth && r.judge === true).map(r => `${r.task}:${r.id}`),
  caveat: 'The floor was tuned on the sets it has seen (in-sample for the floor); the judge prompt\'s shapes come from the DEV sets only, never from a blind line. Language tags on sets 1-6 are heuristic; dev-7, heldout-7, optout-dev and heldout-optout carry the writer\'s tags.',
};

const md = [
  `# ${review ? 'Brief review' : 'Caller judge'} eval: ${label} (${report.date})`, '',
  `Sources: ${Array.isArray(report.sources) ? report.sources.join(', ') : 'all'}. Task ${task}. Judged ${report.n.judged}/${report.n.planned} lines (${tasks.map(t => `${t}: ${perTask[t].n.positive} positive, ${perTask[t].n.negative} negative`).join('; ')}) at ≤${rps} req/s.${stopped ? ` Stopped early: ${stopped}.` : ''}`,
  (review ? `Threshold: review ${report.threshold}` : `Thresholds: crisis ${report.threshold}, opt_out ${report.opt_out_threshold}`) + `; timeout ${report.timeout_ms} ms. Unavailable: ${fmt(report.judge_unavailable)} ${JSON.stringify(report.unavailable_reasons)}.`,
  `Latency p50 ${report.latency_ms.p50} ms, p95 ${report.latency_ms.p95} ms. Tokens per turn ${report.tokens_per_turn.input.toFixed(0)} in / ${report.tokens_per_turn.output.toFixed(1)} out.` +
    (report.cost_inr ? ` Cost ₹${report.cost_inr.spent.toFixed(2)} total, ₹${report.cost_inr.per_1k_turns.toFixed(2)} per 1,000 turns.` : ' Cost: pass --price-in/--price-out.'),
  ...tasks.flatMap(t => ['', `## Task: ${t}`, '', '| Slice | Recall: floor | Recall: judge | Recall: floor or judge | FP: floor | FP: judge | FP: floor or judge |', '|---|---|---|---|---|---|---|',
    ...[['overall', perTask[t].overall], ...Object.entries(perTask[t].by_source).map(([k, v]) => [`source ${k}`, v]), ...Object.entries(perTask[t].by_lang).map(([k, v]) => [`lang ${k}`, v])]
      .map(([name, s]) => `| ${name} | ${fmt(s.recall.floor)} | ${fmt(s.recall.judge)} | ${fmt(s.recall.floor_or_judge)} | ${fmt(s.false_positives.floor)} | ${fmt(s.false_positives.judge)} | ${fmt(s.false_positives.floor_or_judge)} |`),
    '', `Threshold sweep (${t}; from recorded confidences, choose on DEV only):`, '', '| Threshold | Recall: judge | Recall: floor or judge | FP: judge | FP: floor or judge |', '|---|---|---|---|---|',
    ...perTask[t].sweep.map(w => `| ${w.threshold} | ${fmt(w.recall_judge)} | ${fmt(w.recall_floor_or_judge)} | ${fmt(w.fp_judge)} | ${fmt(w.fp_floor_or_judge)} |`)]),
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
