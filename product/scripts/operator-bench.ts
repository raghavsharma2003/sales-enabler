// The Operator bench: measures the assistant end to end on scripted tasks, graded in code (scripts/operator-bench-tasks.ts).
//
//   eval $(sh product/scripts/pg-test.sh vp_bench_$(date +%s))          # a fresh, migrated database
//   VP_LLM_OPERATOR_URL=… VP_LLM_OPERATOR_KEY=… VP_LLM_OPERATOR_MODEL=…    # the model under test (or VP_LLM_DEFAULT_*;
//                                                                          # agent-from-description tasks also use VP_LLM_COMPILE_* / DEFAULT)
//   node --import tsx product/scripts/operator-bench.ts [--tasks a,b] [--category stack] [--limit 10] [--fake] [--out file.json]
//
// Every task gets its own workspace, owner and seed, then one member message on a page through the real Operator route
// (all real modules). Metrics per task: pass/fail with the grader's reason, model calls, tool calls, tokens, tools and
// schema chars offered per request, operator_find_tools use, wall time, and cost when prices are set
// (VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_IN/OUT). Summary: pass rate with a 95% Wilson interval, overall and per category.
// Writes <out>.json and <out>.md.
//
// Guards for a real model: at most VP_BENCH_RPS model requests per second (default 1); the run stops starting tasks
// before the next one could exceed VP_BENCH_MAX_TOKENS (default 3,000,000) or VP_BENCH_MAX_INR (default 500, when
// priced), counting each task at its worst case (the Operator's per-turn token cap). With --fake (or no model
// configured) it runs only the tasks that carry a scripted model: the CI smoke test.
import type { AddressInfo } from 'node:net';
import { writeFileSync } from 'node:fs';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { LlmError, llmConfigured, setFakeLlm, type LlmRequest } from '../server/llm.ts';
import { modules } from '../server/modules/index.ts';
import { CAPS } from '../server/modules/operator/loop.ts';
import { wilson } from '../server/modules/learning/stats.ts';
import { TASKS, type Frame, type Task } from './operator-bench-tasks.ts';

export interface TaskResult {
  /** not_measured: the provider refused the request (content filter), so the product was never exercised; reported apart. */
  id: string; category: string; status: 'pass' | 'fail' | 'error' | 'not_run' | 'not_measured'; why: string;
  /** False when no model call succeeded (e.g. the provider refused the request): such a task is a fail, never a pass. */
  reachedModel: boolean;
  llmCalls: number; toolCalls: number; tokens: { input: number; output: number }; stoppedBy?: string;
  requests: number; toolsOffered: { min: number; max: number }; schemaChars: { mean: number; max: number };
  findTools: number; wallMs: number; inrMilli: number | null;
}
export interface BenchReport {
  startedAt: string; mode: 'fake' | 'model'; model: string | null; endpoint: string | null;
  caps: { rps: number; maxTokens: number; maxInr: number | null };
  summary: { run: number; passed: number; passRate: number; ci95: { lo: number; hi: number };
    reachedModel: { run: number; passed: number; passRate: number; ci95: { lo: number; hi: number } };
    tokens: number; inrMilli: number | null; wallMs: number;
    byCategory: Record<string, { run: number; passed: number; ci95: { lo: number; hi: number } }>; stoppedEarly?: string;
    notMeasured: string[] };
  tasks: TaskResult[];
}

interface ReqStat { tools: number; chars: number; finds: number }

/** Count the operator_find_tools calls already in a request's conversation (the turn's running total). */
function findsIn(messages: { role: string; toolCalls?: { name: string }[]; tool_calls?: { function?: { name?: string } }[] }[]): number {
  let n = 0;
  for (const m of messages) {
    for (const c of m.toolCalls ?? []) if (c.name === 'operator_find_tools') n++;
    for (const c of m.tool_calls ?? []) if (c.function?.name === 'operator_find_tools') n++;
  }
  return n;
}

export async function runBench(o: { pool?: pg.Pool; tasks?: string[]; category?: string; limit?: number; fake?: boolean; out?: string; log?: (s: string) => void;
  /** Fake mode: replace a task's scripted model (tests use it to show a grader failing a wrong end state). */
  scripts?: Record<string, NonNullable<Task['fake']>> } = {}): Promise<BenchReport> {
  if (process.env.NODE_ENV === 'production') throw new Error('the bench signs in with the dev header; never run it against production');
  process.env.VP_DEV_AUTH = '1';
  const log = o.log ?? (s => console.log(s));
  const fake = o.fake || !llmConfigured('operator');
  const rps = Number(process.env.VP_BENCH_RPS ?? 1);
  const maxTokens = Number(process.env.VP_BENCH_MAX_TOKENS ?? 3_000_000);
  const rateIn = Number(process.env.VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_IN ?? NaN), rateOut = Number(process.env.VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_OUT ?? NaN);
  const priced = Number.isFinite(rateIn) && Number.isFinite(rateOut);
  const maxInrMilli = priced ? Number(process.env.VP_BENCH_MAX_INR ?? 500) * 1000 : null;
  const endpoint = fake ? null : (process.env.VP_LLM_OPERATOR_URL ?? process.env.VP_LLM_DEFAULT_URL ?? null);
  const model = fake ? null : (process.env.VP_LLM_OPERATOR_MODEL ?? process.env.VP_LLM_DEFAULT_MODEL ?? null);

  let tasks = TASKS.filter(t => (!o.tasks || o.tasks.includes(t.id)) && (!o.category || t.category === o.category));
  const scriptFor = (t: Task) => o.scripts?.[t.id] ?? t.fake;
  if (fake) tasks = tasks.filter(t => scriptFor(t));
  if (o.limit) tasks = tasks.slice(0, o.limit);

  const pool = o.pool ?? createPool();
  const app = buildApp(pool, modules);
  await new Promise<void>(res => app.server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  // Observe (and, for a real model, pace) every model request of the current task.
  let stats: ReqStat[] = [];
  let lastAt = 0;
  const pace = async () => { const wait = lastAt + 1000 / rps - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait)); lastAt = Date.now(); };
  const realFetch = globalThis.fetch;
  if (!fake && endpoint) {
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url ?? String(input);
      if (url === endpoint || url === process.env.VP_LLM_COMPILE_URL) {
        await pace();
        try { const b = JSON.parse(String(init?.body ?? '{}')); if (b.tools) stats.push({ tools: b.tools.length, chars: JSON.stringify(b.tools.map((t: any) => t.function ?? t)).length, finds: findsIn(b.messages ?? []) }); } catch { /* not JSON */ }
      }
      return realFetch(input, init);
    }) as typeof fetch;
  }
  let script: ((req: LlmRequest) => { text?: string; calls?: { name: string; args: unknown }[]; error?: string }) | null = null;
  if (fake) setFakeLlm(req => {
    if (req.tools) stats.push({ tools: req.tools.length, chars: JSON.stringify(req.tools).length, finds: findsIn(req.messages) });
    const step = script?.(req) ?? { text: 'No scripted reply.' };
    if (step.error) throw new LlmError(step.error, false);
    return { text: step.text ?? '', toolCalls: (step.calls ?? []).map((c, i) => ({ id: `f${stats.length}-${i}`, name: c.name, args: JSON.stringify(c.args) })),
      usage: { inputTokens: 100, outputTokens: 20 }, model: 'scripted', provider: 'fake' };
  });

  const started = new Date();
  const results: TaskResult[] = [];
  let tokensSpent = 0, inrSpent = 0, stoppedEarly: string | undefined;
  const worstTask = CAPS.tokens + CAPS.replyTokens * CAPS.llmCalls;
  try {
    for (const t of tasks) {
      if (tokensSpent + worstTask > maxTokens) { stoppedEarly = `token cap ${maxTokens}`; }
      if (maxInrMilli !== null && inrSpent + (worstTask * Math.max(rateIn, rateOut)) / 1e6 > maxInrMilli) { stoppedEarly = `cost cap ₹${maxInrMilli / 1000}`; }
      if (stoppedEarly) { results.push(empty(t, 'not_run', `stopped: ${stoppedEarly}`)); continue; }
      const r = await runTask(t);
      results.push(r);
      tokensSpent += r.tokens.input + r.tokens.output;
      if (r.inrMilli) inrSpent += r.inrMilli;
      log(`${r.status === 'pass' ? 'PASS' : r.status.toUpperCase()} ${t.id} (${r.llmCalls} model calls, ${r.toolCalls} tools, ${r.tokens.input + r.tokens.output} tokens, ${r.wallMs} ms): ${r.why}`);
    }
  } finally {
    if (fake) setFakeLlm(null);
    globalThis.fetch = realFetch;
    app.server.close(); app.server.closeAllConnections?.();
    if (!o.pool) await pool.end();
  }

  const ran = results.filter(r => r.status !== 'not_run' && r.status !== 'not_measured');
  const notMeasured = results.filter(r => r.status === 'not_measured').map(r => r.id);
  const passed = ran.filter(r => r.status === 'pass').length;
  const byCategory: BenchReport['summary']['byCategory'] = {};
  for (const r of ran) {
    const c = (byCategory[r.category] ??= { run: 0, passed: 0, ci95: { lo: 0, hi: 1 } });
    c.run++; if (r.status === 'pass') c.passed++;
  }
  for (const c of Object.values(byCategory)) { const w = wilson(c.passed, c.run); c.ci95 = { lo: round(w.lo), hi: round(w.hi) }; }
  const w = wilson(passed, ran.length);
  const reached = ran.filter(r => r.reachedModel), reachedPassed = reached.filter(r => r.status === 'pass').length;
  const wr = wilson(reachedPassed, reached.length);
  const report: BenchReport = {
    startedAt: started.toISOString(), mode: fake ? 'fake' : 'model', model, endpoint: endpoint ? new URL(endpoint).hostname : null,
    caps: { rps, maxTokens, maxInr: maxInrMilli === null ? null : maxInrMilli / 1000 },
    summary: { run: ran.length, passed, passRate: ran.length ? round(passed / ran.length) : 0, ci95: { lo: round(w.lo), hi: round(w.hi) },
      reachedModel: { run: reached.length, passed: reachedPassed, passRate: reached.length ? round(reachedPassed / reached.length) : 0, ci95: { lo: round(wr.lo), hi: round(wr.hi) } },
      tokens: tokensSpent,
      inrMilli: priced ? inrSpent : null, wallMs: ran.reduce((a, r) => a + r.wallMs, 0), byCategory, ...(stoppedEarly ? { stoppedEarly } : {}), notMeasured },
    tasks: results,
  };
  if (o.out) {
    writeFileSync(o.out, JSON.stringify(report, null, 2) + '\n');
    writeFileSync(o.out.replace(/\.json$/, '') + '.md', markdown(report));
  }
  return report;

  async function runTask(t: Task): Promise<TaskResult> {
    stats = [];
    const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ($1) RETURNING id", [`bench ${t.id}`]))!.id;
    await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [ws]);
    const member = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `bench-${t.id}-${Date.now()}@example.test`]))!.id;
    const ctx = { pool, registry: app.registry, ws, member };
    const t0 = Date.now();
    try {
      // Seeds use templates, tools and SQL, but a seed that creates, edits or publishes an agent runs the agents module's
      // brief review (agents/review.ts), which calls a model on a real run when one is configured. Those calls are small,
      // reach the harness ledger like any other, and are answered by the fake model in fake mode.
      const seed = t.seed ? await t.seed(ctx) : {};
      if (fake) { const steps = scriptFor(t)!(seed); let i = 0; script = () => steps[Math.min(i++, steps.length - 1)]!; }
      const headers = { 'content-type': 'application/json', 'x-vp-dev-member': member };
      const th = await (await realFetch(`${base}/v1/operator/threads`, { method: 'POST', headers, body: '{}' })).json() as any;
      const text = typeof t.text === 'function' ? t.text(seed) : t.text;
      const res = await realFetch(`${base}/v1/operator/threads/${th.thread.id}/messages`, { method: 'POST', headers, body: JSON.stringify({ text, page: t.page, ...(t.uploads ? { uploads: t.uploads } : {}) }) });
      const frames: Frame[] = (await res.text()).split('\n\n').filter(Boolean).map(f => ({ event: /^event: (.+)$/m.exec(f)?.[1] ?? '', data: JSON.parse(/^data: (.+)$/m.exec(f)?.[1] ?? 'null') }));
      const done = frames.find(f => f.event === 'done')?.data ?? { llmCalls: 0, toolCalls: 0, tokens: { input: 0, output: 0 } };
      const cards = frames.filter(f => f.event === 'card').map(f => f.data.card);
      const reply = frames.filter(f => f.event === 'delta').map(f => f.data.text).join('');
      const ran = frames.filter(f => f.event === 'step' && f.data.status === 'done').map(f => f.data.tool as string);
      const graded = await t.grade({ ...ctx, seed, frames, cards, reply, ran });
      // A turn that ended in a model error passes nothing, however harmless its end state looks.
      const modelError = done.stoppedBy === 'llm_error' ? (frames.find(f => f.event === 'error')?.data?.text ?? 'the model call failed') : null;
      const reachedModel = done.llmCalls > 0;
      const v = modelError ? { pass: false, why: `model error: ${String(modelError).slice(0, 200)}` } : graded;
      // The provider refused the request, so nothing the product does was tested: never a pass (rule above), reported apart.
      if (done.stoppedBy === 'provider_refused') return { ...empty(t, 'not_measured', 'provider refused the content (content filter)'), reachedModel,
        llmCalls: done.llmCalls, toolCalls: done.toolCalls, tokens: done.tokens, stoppedBy: done.stoppedBy, ...reqStats(), wallMs: Date.now() - t0 };
      const cost = priced ? Number((await one<{ s: string }>(pool, `SELECT coalesce(sum(inr_milli), 0)::text AS s FROM cost_line WHERE workspace_id = $1`, [ws]))!.s) : null;
      return {
        id: t.id, category: t.category, status: v.pass ? 'pass' : 'fail', why: v.why + (done.stoppedBy ? ` [stopped by ${done.stoppedBy}]` : ''), reachedModel,
        llmCalls: done.llmCalls, toolCalls: done.toolCalls, tokens: done.tokens, ...(done.stoppedBy ? { stoppedBy: done.stoppedBy } : {}),
        ...reqStats(), wallMs: Date.now() - t0, inrMilli: cost,
      };
    } catch (e) {
      return { ...empty(t, 'error', e instanceof Error ? e.message : String(e)), ...reqStats(), wallMs: Date.now() - t0 };
    } finally { script = null; }
  }
  function reqStats() {
    const tools = stats.map(s => s.tools), chars = stats.map(s => s.chars);
    return { requests: stats.length, toolsOffered: { min: tools.length ? Math.min(...tools) : 0, max: tools.length ? Math.max(...tools) : 0 },
      schemaChars: { mean: chars.length ? Math.round(chars.reduce((a, b) => a + b, 0) / chars.length) : 0, max: chars.length ? Math.max(...chars) : 0 },
      findTools: stats.reduce((a, s) => Math.max(a, s.finds), 0) };
  }
}

function empty(t: Task, status: TaskResult['status'], why: string): TaskResult {
  return { id: t.id, category: t.category, status, why, reachedModel: false, llmCalls: 0, toolCalls: 0, tokens: { input: 0, output: 0 }, requests: 0, toolsOffered: { min: 0, max: 0 }, schemaChars: { mean: 0, max: 0 }, findTools: 0, wallMs: 0, inrMilli: null };
}
const round = (x: number) => Math.round(x * 1000) / 1000;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function markdown(r: BenchReport): string {
  const s = r.summary;
  const lines = [
    `# Operator bench, ${r.startedAt.slice(0, 16).replace('T', ' ')} UTC (${r.mode}${r.endpoint ? `, ${r.endpoint}` : ''})`, '',
    `Passed ${s.passed} of ${s.run}: ${pct(s.passRate)} (95% CI ${pct(s.ci95.lo)}-${pct(s.ci95.hi)}); a model error counts as a fail.`,
    `Not measured (the provider refused the content, so the product was not exercised; not in any count): ${s.notMeasured.length ? s.notMeasured.join(', ') : 'none'}.`,
    `Reached the model: ${s.reachedModel.run} of ${s.run}; of those, passed ${s.reachedModel.passed}: ${pct(s.reachedModel.passRate)} (95% CI ${pct(s.reachedModel.ci95.lo)}-${pct(s.reachedModel.ci95.hi)}).`,
    `Tokens ${s.tokens}${s.inrMilli !== null ? `, ₹${(s.inrMilli / 1000).toFixed(2)}` : ''}, wall ${(s.wallMs / 1000).toFixed(0)} s.${s.stoppedEarly ? ` Stopped early: ${s.stoppedEarly}.` : ''}`, '',
    '| Category | Passed | 95% CI |', '|---|---|---|',
    ...Object.entries(s.byCategory).map(([k, c]) => `| ${k} | ${c.passed}/${c.run} | ${pct(c.ci95.lo)}-${pct(c.ci95.hi)} |`), '',
    '| Task | Result | Reached model | Model calls | Tool calls | Tokens | Tools offered | Schema chars (mean) | find_tools | ms | Why |', '|---|---|---|---|---|---|---|---|---|---|---|',
    ...r.tasks.map(t => `| ${t.id} | ${t.status} | ${t.reachedModel ? 'yes' : 'no'} | ${t.llmCalls} | ${t.toolCalls} | ${t.tokens.input + t.tokens.output} | ${t.toolsOffered.min}-${t.toolsOffered.max} | ${t.schemaChars.mean} | ${t.findTools} | ${t.wallMs} | ${t.why.replace(/\|/g, '/').slice(0, 120)} |`),
  ];
  return lines.join('\n') + '\n';
}

// CLI (no top-level await: tsx may load this file as CommonJS)
async function main() {
  const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
  const out = arg('--out') ?? `operator-bench-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const r = await runBench({ tasks: arg('--tasks')?.split(','), category: arg('--category'), limit: arg('--limit') ? Number(arg('--limit')) : undefined, fake: process.argv.includes('--fake'), out });
  console.log(`\n${r.summary.passed}/${r.summary.run} passed (${pct(r.summary.passRate)}, 95% CI ${pct(r.summary.ci95.lo)}-${pct(r.summary.ci95.hi)}); wrote ${out} and ${out.replace(/\.json$/, '')}.md`);
  process.exitCode = r.summary.run && r.tasks.every(t => t.status !== 'error') ? 0 : 1;
}
if (process.argv[1] && /operator-bench\.ts$/.test(process.argv[1])) main().catch(e => { console.error(e); process.exitCode = 1; });
