// Analysis-quality bench: measures the per-call analysis and the cross-call insight against hand-written keys
// (scripts/analysis-bench/cases.ts). The model never grades: code compares what analysis stored with the key and
// reports accuracy per field with Wilson 95% intervals, the grounded-quote rate and the cost per call.
//
// Run against a throwaway database (it writes a synthetic workspace each run):
//   eval $(sh product/scripts/pg-test.sh vp_bench)
//   node --import tsx product/scripts/analysis-bench.ts --fake --smoke          # CI smoke: scripted oracle, 3 calls
//   VP_LLM_ANALYSIS_URL=... VP_LLM_ANALYSIS_KEY=... VP_LLM_ANALYSIS_MODEL=... \
//     node --import tsx product/scripts/analysis-bench.ts --out ./bench-out    # a real model, chosen by env
// Options: --limit N (per-call cases), --rps 1 (model requests per second), --max-tokens 400000 (stop when spent),
//   --judge (also run the post-call crisis judge; VP_LLM_SAFETY_JUDGE_*; one request per caller line, not throttled),
//   --no-cross (skip the cross-call slice), --out DIR (default ./analysis-bench-out). Prices for the INR estimate:
//   VP_BENCH_INR_PER_1K_INPUT and VP_BENCH_INR_PER_1K_OUTPUT (rupees per 1,000 tokens); without them only tokens are shown.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createPool, many, one } from '../server/db.ts';
import { llmConfigured, setFakeLlm, type LlmRequest, type LlmReply } from '../server/llm.ts';
import type { RuntimeEvent, RunManifest } from '../shared/runtime-protocol.ts';
import { callerSignals } from '../shared/safety/index.ts';
import { ingest } from '../server/modules/calls/ingest.ts';
import { analysesSettled } from '../server/modules/calls/analysis.ts';
import { computeInsight } from '../server/modules/calls/insights.ts';
import { CONVERSATION_CODES, REFINABLE, codeReason } from '../server/modules/calls/taxonomy.ts';
import { crossCallCases, GOAL_VALUES, OUTCOME_VALUES, perCallCases, PLANTED, type Case, type CrossCall, type PlantedTheme } from './analysis-bench/cases.ts';

export interface BenchOpts { llm?: (req: LlmRequest) => LlmReply; fake?: boolean; smoke?: boolean; limit?: number; rps?: number; maxTokens?: number; judge?: boolean; cross?: boolean; out?: string; pool?: pg.Pool }

/** Wilson score interval, 95%. */
export function wilson(k: number, n: number, z = 1.959964): [number, number] {
  if (!n) return [0, 0];
  const p = k / n, z2 = z * z, c = p + z2 / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n)), d = 1 + z2 / n;
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
const metric = (k: number, n: number) => ({ k, n, rate: n ? k / n : null, ci95: wilson(k, n) });
type Metric = ReturnType<typeof metric>;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const manifest: RunManifest = { combinationId: 'bench', stackId: 'bench', agentVersionHash: 'bench', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 'bench' };
const userContent = (lines: { speaker: string; text: string }[]) => lines.map(l => `${l.speaker === 'agent' ? 'AGENT' : 'PERSON'}: ${l.text}`).join('\n');

// ---- the scripted oracle (CI): answers from the key, plus one invented quote per call so the grounding check is exercised
function oracle(cases: Case[], cross: CrossCall[]) {
  const byContent = new Map(cases.map(c => [userContent(c.lines), c]));
  return (req: LlmRequest): LlmReply => {
    const system = req.messages[0].content, user = req.messages[req.messages.length - 1].content;
    const usage = { inputTokens: Math.ceil((system.length + user.length) / 4), outputTokens: 120 };
    if (system.includes('patterns across phone calls')) {
      const blocks = user.split(/\n\n(?=### C\d+ )/).map(b => ({ label: /### (C\d+) /.exec(b)?.[1] ?? '', person: b.split('\n').filter(l => l.startsWith('PERSON: ')).map(l => l.slice(8)) }));
      const themes = (Object.keys(PLANTED) as PlantedTheme[]).map(theme => {
        const hits = blocks.filter(b => b.person.some(p => (PLANTED[theme] as readonly string[]).includes(p)));
        return { kind: 'objection', title: theme.replace('_', ' '), calls: hits.map(h => h.label),
          quotes: [...hits.slice(0, 2).map(h => ({ call: h.label, text: h.person.find(p => (PLANTED[theme] as readonly string[]).includes(p))! })), { call: hits[0]?.label ?? 'C1', text: 'yeh line kisi ne nahi boli' }] };
      }).filter(t => t.calls.length);
      return { text: JSON.stringify({ themes }), toolCalls: [], usage, model: 'oracle', provider: 'oracle' };
    }
    const c = byContent.get(user);
    if (!c) return { text: JSON.stringify({ points: [], moments: [], reasonCode: null, outcome: null, forget: null }), toolCalls: [], usage, model: 'oracle', provider: 'oracle' };
    const firstCaller = c.lines.find(l => l.speaker === 'caller')?.text ?? '';
    return { text: JSON.stringify({
      points: [{ claim: 'The person answered the call.', quote: firstCaller }, { claim: 'Invented.', quote: 'yeh line kabhi boli nahi gayi' }],
      moments: c.key.moments.map(m => ({ kind: m.kind, quote: c.lines[m.line].text, note: '' })),
      reasonCode: CONVERSATION_CODES.includes(c.key.reasonCode) ? c.key.reasonCode : null,
      outcome: c.key.outcome && c.key.outcomeLine !== undefined ? { value: c.key.outcome, quote: c.lines[c.key.outcomeLine].text } : null,
      forget: null,
    }), toolCalls: [], usage, model: 'oracle', provider: 'oracle' };
  };
}

async function setup(pool: pg.Pool) {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('analysis bench (synthetic)') RETURNING id"))!.id;
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Bench agent') RETURNING id", [ws]))!.id;
  const version = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,'bench','{}') RETURNING id", [agent]))!.id;
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values)
    VALUES ($1,'Call result','What did the person decide on this call?',$2,$3) RETURNING id`, [ws, [...OUTCOME_VALUES], GOAL_VALUES]))!.id;
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category, outcome_definition_id) VALUES ($1,'Bench','service',$2) RETURNING id", [ws, def]))!.id;
  return { ws, version, campaign, def };
}

let phone = 9300000000;
async function newConversation(pool: pg.Pool, s: Awaited<ReturnType<typeof setup>>) {
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1,$2) RETURNING id", [s.ws, `+91${phone++}`]))!.id;
  const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [s.ws, s.campaign, contact]))!.id;
  return (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel) VALUES ($1,$2,$3,$4,'phone') RETURNING id", [s.ws, attempt, contact, s.version]))!.id;
}

const tokensSpent = async (pool: pg.Pool, ws: string) => Number((await one<{ t: string }>(pool, "SELECT coalesce(sum(quantity), 0)::text AS t FROM cost_line WHERE workspace_id = $1 AND component = 'analysis'", [ws]))!.t);

export async function runBench(o: BenchOpts = {}) {
  const pool = o.pool ?? createPool();
  const allCases = perCallCases();
  const cases = o.smoke ? [allCases[0], allCases[24], allCases[allCases.length - 2]] : allCases.slice(0, o.limit ?? allCases.length);
  const cross = crossCallCases(o.smoke ? 2 : 9);
  const fake = Boolean(o.fake || o.smoke || o.llm);
  if (o.llm) setFakeLlm(o.llm);
  else if (fake) setFakeLlm(oracle(cases, cross));
  else if (!llmConfigured('analysis')) throw new Error('no model configured: set VP_LLM_ANALYSIS_URL/KEY/MODEL (or VP_LLM_DEFAULT_*), or pass --fake');
  const prevJudge = process.env.VP_SAFETY_JUDGE_MODE;
  if (!o.judge) process.env.VP_SAFETY_JUDGE_MODE = 'off';
  const gap = 1000 / Math.max(0.01, o.rps ?? 1), maxTokens = o.maxTokens ?? 400_000;

  try {
    const s = await setup(pool);
    const items: Record<string, unknown>[] = [];
    let truncated = false;
    for (const c of cases) {
      if (await tokensSpent(pool, s.ws) >= maxTokens) { truncated = true; break; }
      const conv = await newConversation(pool, s);
      const at = new Date().toISOString();
      const events: RuntimeEvent[] = [{ seq: 1, type: 'call.started', at, manifest },
        ...c.lines.map((l, i) => ({ seq: 2 + i, type: 'turn' as const, at, speaker: l.speaker, text: l.text, startMs: i * 3000, endMs: i * 3000 + 2500 })),
        { seq: 2 + c.lines.length, type: 'call.ended', at, endReason: c.endReason, durationS: c.durationS, transcript: c.lines.map((l, i) => ({ ...l, startMs: i * 3000 })), manifest }];
      await ingest(pool, { conversationId: conv, events });
      await analysesSettled();
      const row = (await one<{ reason_code: string; analysis: any }>(pool, 'SELECT reason_code, analysis FROM conversation WHERE id = $1', [conv]))!;
      const momentKinds = (await many<{ kind: string }>(pool, "SELECT DISTINCT kind FROM call_moment WHERE conversation_id = $1 AND source = 'analysis'", [conv])).map(m => m.kind);
      const callerLines = c.lines.filter(l => l.speaker === 'caller').map(l => l.text);
      const floor = callerLines.map(t => callerSignals(t));
      const cj = row.analysis?.crisis_judge ?? { raised: 0, shadow: 0 };
      const predicted = {
        outcome: row.analysis?.outcomeGuess?.value ?? null,
        reasonCode: row.reason_code,
        moments: momentKinds,
        crisis: floor.some(f => f.crisis) || cj.raised + cj.shadow > 0,
        optOutAnalysis: momentKinds.includes('opt_out'),
        optOutFloor: floor.some(f => f.optOut),
        followUps: [...(momentKinds.includes('callback_request') || row.reason_code === 'CONV_CALLBACK' ? ['callback'] : []),
          ...(['CONV_NEEDS_HUMAN', 'CONV_COMPLAINT', 'END_CRISIS', 'END_HANDED_OFF'].includes(row.reason_code) ? ['human'] : [])],
      };
      const refinable = REFINABLE.has(codeReason(c.endReason, c.durationS, callerLines.length));
      items.push({ id: c.id, template: c.template, industry: c.industry, language: c.language, refinable, key: c.key, predicted,
        analysisStatus: row.analysis?.status ?? 'none', quotesProposed: row.analysis?.quotesProposed ?? 0, quotesDropped: row.analysis?.quotesDropped ?? 0 });
      if (!fake && row.analysis?.status === 'done') await sleep(gap);
    }

    // ---- score (code only) -----------------------------------------------------------------------------------------
    const it = items as any[];
    const count = (f: (x: any) => boolean, pool_: any[] = it) => metric(pool_.filter(f).length, pool_.length);
    const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));
    const reasonOk = (x: any) => [x.key.reasonCode, ...(x.key.reasonAlt ?? [])].includes(x.predicted.reasonCode);
    const momentsNeeded = it.flatMap(x => x.key.moments.map((m: any) => ({ x, kind: m.kind })));
    const fields: Record<string, Metric> = {
      outcome: count(x => x.predicted.outcome === x.key.outcome),
      reasonCode: count(reasonOk),
      reasonCodeModelRefined: count(reasonOk, it.filter(x => x.refinable)),
      reasonCodeCodeDecided: count(reasonOk, it.filter(x => !x.refinable)),
      momentRecall: metric(momentsNeeded.filter(m => m.x.predicted.moments.includes(m.kind)).length, momentsNeeded.length),
      allMomentsFound: count(x => x.key.moments.every((m: any) => x.predicted.moments.includes(m.kind))),
      crisis: count(x => x.predicted.crisis === x.key.crisis),
      crisisRecall: count(x => x.predicted.crisis, it.filter(x => x.key.crisis)),
      optOutByAnalysis: count(x => x.predicted.optOutAnalysis === x.key.optOut),
      optOutRecallByAnalysis: count(x => x.predicted.optOutAnalysis, it.filter(x => x.key.optOut)),
      optOutRecallByFloor: count(x => x.predicted.optOutFloor, it.filter(x => x.key.optOut)),
      followUps: count(x => sameSet(x.predicted.followUps, x.key.followUps)),
    };
    const proposed = it.reduce((a, x) => a + x.quotesProposed, 0), dropped = it.reduce((a, x) => a + x.quotesDropped, 0);
    const cost = await many<{ quantity: string; detail: any; conversation_id: string | null }>(pool,
      "SELECT quantity::text, detail, conversation_id FROM cost_line WHERE workspace_id = $1 AND component = 'analysis'", [s.ws]);
    const perCallCost = cost.filter(c => c.conversation_id);
    const inIn = Number(process.env.VP_BENCH_INR_PER_1K_INPUT ?? NaN), inOut = Number(process.env.VP_BENCH_INR_PER_1K_OUTPUT ?? NaN);
    const tok = (rows: typeof cost) => ({ input: rows.reduce((a, r) => a + (r.detail?.inputTokens ?? 0), 0), output: rows.reduce((a, r) => a + (r.detail?.outputTokens ?? 0), 0) });
    const t = tok(perCallCost);
    const modelCalls = perCallCost.length;
    const inr = Number.isFinite(inIn) && Number.isFinite(inOut) ? (t.input / 1000) * inIn + (t.output / 1000) * inOut : null;

    // ---- cross-call slice ------------------------------------------------------------------------------------------
    let crossReport: Record<string, unknown> | null = null;
    if (o.cross !== false && !truncated) {
      const x = await setup(pool);
      const idOf = new Map<string, CrossCall>();
      let minutes = 500;
      for (const cc of cross) {
        const conv = await newConversation(pool, x);
        await pool.query(`UPDATE conversation SET status = 'done', ended_at = now() - make_interval(mins => $2), transcript = $3, analysis = '{"status":"done"}', reason_code = 'CONV_INCOMPLETE' WHERE id = $1`,
          [conv, minutes--, JSON.stringify(cc.lines.map((l, i) => ({ ...l, startMs: i * 3000 })))]);
        idOf.set(conv, cc);
      }
      const r = await computeInsight(pool, x.ws, { type: 'workspace', id: null }, { force: true, caps: { sampleCalls: cross.length, inputTokens: 40_000 } });
      if (r.ran && r.result.status === 'done') {
        const themes = r.result.themes;
        const recalled = (Object.keys(PLANTED) as PlantedTheme[]).filter(theme => themes.some(th => {
          const from = th.quotes.map(q => idOf.get(q.conversationId)?.theme ?? null);
          return from.filter(f => f === theme).length >= 2 && from.every(f => f === theme);
        }));
        const pure = themes.filter(th => new Set(th.quotes.map(q => idOf.get(q.conversationId)?.theme ?? 'none')).size === 1).length;
        crossReport = {
          calls: cross.length, callsSampled: r.result.callsSampled, themesReturned: themes.length,
          themeRecall: metric(recalled.length, Object.keys(PLANTED).length), recalled,
          pureThemes: metric(pure, themes.length),
          quotesVerbatim: metric(r.result.quotesProposed - r.result.quotesDropped, r.result.quotesProposed),
          themesDropped: r.result.themesDropped,
          usage: r.result.usage ?? null,
        };
      } else crossReport = { status: r.ran ? r.result.status : r.status, reason: r.ran ? r.result.reason : r.reason };
    }

    const model = fake ? 'scripted oracle (CI)' : (cost.find(c => c.detail?.model)?.detail?.model ?? 'unknown');
    const report = {
      generatedAt: new Date().toISOString(), mode: fake ? 'fake' : 'real', model, judge: Boolean(o.judge), truncated,
      cases: { run: items.length, planned: cases.length, templates: new Set(it.map(x => x.template)).size, languages: [...new Set(it.map(x => x.language))] },
      fields,
      grounding: metric(proposed - dropped, proposed),
      cost: { modelCalls, inputTokens: t.input, outputTokens: t.output, tokensPerCall: modelCalls ? (t.input + t.output) / modelCalls : null,
        inrPerCall: inr !== null && modelCalls ? inr / modelCalls : null, priced: inr !== null },
      cross: crossReport,
      items,
    };
    if (o.out) writeReport(o.out, report);
    return report;
  } finally {
    if (fake || o.llm) setFakeLlm(null);
    if (prevJudge === undefined) delete process.env.VP_SAFETY_JUDGE_MODE; else process.env.VP_SAFETY_JUDGE_MODE = prevJudge;
    if (!o.pool) await pool.end();
  }
}

const pct = (m: Metric | undefined) => !m || m.rate === null ? 'n/a' : `${(m.rate * 100).toFixed(1)}% (${m.k}/${m.n}; 95% CI ${(m.ci95[0] * 100).toFixed(1)}-${(m.ci95[1] * 100).toFixed(1)}%)`;

export function writeReport(dir: string, r: Awaited<ReturnType<typeof runBench>>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'analysis-bench.json'), JSON.stringify(r, null, 1) + '\n');
  const rows: [string, string][] = [
    ['Outcome', 'outcome'], ['Reason code (all)', 'reasonCode'], ['Reason code, model-refined calls', 'reasonCodeModelRefined'],
    ['Reason code, decided by code', 'reasonCodeCodeDecided'], ['Moments found (recall)', 'momentRecall'], ['Every moment found', 'allMomentsFound'],
    ['Crisis signal', 'crisis'], ['Crisis recall', 'crisisRecall'], ['Opt-out, analysis', 'optOutByAnalysis'],
    ['Opt-out recall, analysis', 'optOutRecallByAnalysis'], ['Opt-out recall, deterministic floor', 'optOutRecallByFloor'], ['Follow-ups owed', 'followUps'],
  ];
  const c = r.cross as any;
  const md = [
    `# Analysis-quality bench`, '',
    `${r.generatedAt} · mode **${r.mode}** · model: ${r.model} · crisis judge ${r.judge ? 'on' : 'off'}${r.truncated ? ' · **stopped at the token cap**' : ''}`, '',
    `${r.cases.run} of ${r.cases.planned} synthetic calls, ${r.cases.templates} templates, languages: ${r.cases.languages.join(', ')}. Scored by code against hand-written keys; the model never grades.`, '',
    '| Field | Accuracy |', '|---|---|',
    ...rows.map(([label, k]) => `| ${label} | ${pct(r.fields[k])} |`),
    `| Grounded quotes (kept / proposed) | ${pct(r.grounding)} |`, '',
    `**Cost:** ${r.cost.modelCalls} model calls, ${r.cost.inputTokens} input and ${r.cost.outputTokens} output tokens, ` +
      `${r.cost.tokensPerCall === null ? 'n/a' : Math.round(r.cost.tokensPerCall)} tokens per call` +
      (r.cost.priced ? `, about ₹${r.cost.inrPerCall!.toFixed(3)} per call.` : ' (no price set: VP_BENCH_INR_PER_1K_INPUT/OUTPUT).'), '',
    '## Cross-call slice', '',
    !c ? 'Not run.' : c.themeRecall ? [
      `${c.calls} calls with ${Object.keys(PLANTED).length} planted objection themes; ${c.callsSampled} sampled; ${c.themesReturned} themes returned.`, '',
      '| Measure | Result |', '|---|---|',
      `| Planted themes recalled (2+ quotes, all from that theme's calls) | ${pct(c.themeRecall)} |`,
      `| Themes whose quotes all come from one planted theme | ${pct(c.pureThemes)} |`,
      `| Model quotes that were verbatim | ${pct(c.quotesVerbatim)} |`,
    ].join('\n') : `Did not run: ${c.status} (${c.reason ?? ''}).`, '',
    '## Misses', '',
    ...((r.items as any[]).filter(x => x.predicted.outcome !== x.key.outcome || ![x.key.reasonCode, ...(x.key.reasonAlt ?? [])].includes(x.predicted.reasonCode)
      || x.key.moments.some((m: any) => !x.predicted.moments.includes(m.kind)))
      .slice(0, 40).map(x => `- \`${x.id}\`: outcome ${x.predicted.outcome ?? '—'} (key ${x.key.outcome ?? '—'}), reason ${x.predicted.reasonCode} (key ${x.key.reasonCode}), moments [${x.predicted.moments.join(', ')}] (key [${x.key.moments.map((m: any) => m.kind).join(', ')}])`)),
  ].join('\n');
  writeFileSync(join(dir, 'analysis-bench.md'), md + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), has = (f: string) => a.includes(f), val = (f: string) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };
  runBench({ fake: has('--fake'), smoke: has('--smoke'), judge: has('--judge'), cross: !has('--no-cross'),
    limit: val('--limit') ? Number(val('--limit')) : undefined, rps: val('--rps') ? Number(val('--rps')) : undefined,
    maxTokens: val('--max-tokens') ? Number(val('--max-tokens')) : undefined, out: val('--out') ?? './analysis-bench-out' })
    .then(r => { console.log(`analysis bench (${r.mode}): ${r.cases.run} calls; outcome ${pct(r.fields.outcome)}; reason ${pct(r.fields.reasonCode)}; grounded ${pct(r.grounding)}`); })
    .catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
}
