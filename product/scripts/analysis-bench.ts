// Analysis-quality bench: measures the per-call analysis and the cross-call insight against hand-written keys
// (scripts/analysis-bench/cases.ts). The model never grades: code compares what analysis stored with the key and
// reports accuracy per field with Wilson 95% intervals, the grounded-quote rate and the cost per call.
//
// Run against a throwaway database (it writes a synthetic workspace each run):
//   eval $(sh product/scripts/pg-test.sh vp_bench)
//   node --import tsx product/scripts/analysis-bench.ts --fake --smoke          # CI smoke: scripted oracle, 3 calls
//   VP_LLM_ANALYSIS_URL=... VP_LLM_ANALYSIS_KEY=... VP_LLM_ANALYSIS_MODEL=... \
//     node --import tsx product/scripts/analysis-bench.ts --out ./bench-out    # a real model, chosen by env
// Options: --split dev|test|all (default all; tune prompts on dev, report test), --limit N (per-call cases),
//   --model ID (analysis model for this run's workspace), --escalate-model ID with --threshold 0.6 (tiered: the second
//   model re-reads calls with no outcome or low confidence), --rps 1 (model requests per second), --max-tokens 400000 (stop when spent),
//   --judge (also run the post-call crisis judge; VP_LLM_SAFETY_JUDGE_*; one request per caller line, not throttled),
//   --passes N (repeat the run N times; a passes.md summary), --prompt-variant (one of PROMPT_VARIANTS in calls/analysis.ts: an ablation of the analysis contract; DEV only, never
//   the product), --no-cross (skip the cross-call slice), --out DIR (default ./analysis-bench-out). Prices for the INR estimate:
//   VP_BENCH_INR_PER_1K_INPUT and VP_BENCH_INR_PER_1K_OUTPUT (rupees per 1,000 tokens); without them only tokens are shown.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createPool, many, one, tx } from '../server/db.ts';
import { campaignFunnel } from '../server/modules/calls/stats.ts';
import { llmConfigured, setFakeLlm, type LlmRequest, type LlmReply } from '../server/llm.ts';
import type { RuntimeEvent, RunManifest } from '../shared/runtime-protocol.ts';
import { callerSignals } from '../shared/safety/index.ts';
import { ingest } from '../server/modules/calls/ingest.ts';
import { analysesSettled, PROMPT_VARIANTS, refreshOutcome, setAnalysisPromptVariant, type PromptVariant } from '../server/modules/calls/analysis.ts';
import { computeInsight } from '../server/modules/calls/insights.ts';
import { CONVERSATION_CODES, REFINABLE, codeReason } from '../server/modules/calls/taxonomy.ts';
import { crossCallCases, GOAL_VALUES, OUTCOME_VALUES, perCallCases, PLANTED, type Case, type CrossCall, type PlantedTheme } from './analysis-bench/cases.ts';

export interface BenchOpts { llm?: (req: LlmRequest) => LlmReply; split?: 'dev' | 'test' | 'all'; model?: string; escalateModel?: string; threshold?: number; fake?: boolean; smoke?: boolean; limit?: number; rps?: number; maxTokens?: number; judge?: boolean; cross?: boolean; out?: string; pool?: pg.Pool; promptVariant?: PromptVariant }

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

async function setup(pool: pg.Pool, o: BenchOpts = {}) {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('analysis bench (synthetic)') RETURNING id"))!.id;
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Bench agent') RETURNING id", [ws]))!.id;
  const version = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,'bench','{}') RETURNING id", [agent]))!.id;
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values)
    VALUES ($1,'Call result','What did the person decide on this call?',$2,$3) RETURNING id`, [ws, [...OUTCOME_VALUES], GOAL_VALUES]))!.id;
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category, outcome_definition_id) VALUES ($1,'Bench','service',$2) RETURNING id", [ws, def]))!.id;
  // The analysis model for this workspace, the way analysis.model.set stores it (curation is the tool's job, not the bench's).
  if (o.model || o.escalateModel) await pool.query(`INSERT INTO call_analysis_setting (workspace_id, mode, model, escalate_model, threshold) VALUES ($1,$2,$3,$4,$5)`,
    [ws, o.escalateModel ? 'tiered' : 'single', o.model ?? null, o.escalateModel ?? null, o.threshold ?? 0.6]);
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
  if (o.promptVariant && o.promptVariant !== 'current' && (o.split ?? 'all') !== 'dev') throw new Error('a prompt ablation runs on DEV only: pass --split dev');
  setAnalysisPromptVariant(o.promptVariant ?? 'current');
  const allCases = perCallCases();
  const split = o.split ?? 'all';
  const inSplit = <T extends { split: string }>(x: T) => split === 'all' || x.split === split;
  const cases = o.smoke ? [allCases[0], allCases[24], allCases[allCases.length - 2]] : allCases.filter(inSplit).slice(0, o.limit ?? allCases.length);
  const cross = o.smoke ? crossCallCases(2) : crossCallCases(9).filter(inSplit);
  const fake = Boolean(o.fake || o.smoke || o.llm);
  if (o.llm) setFakeLlm(o.llm);
  else if (fake) setFakeLlm(oracle(cases, cross));
  else if (!llmConfigured('analysis')) throw new Error('no model configured: set VP_LLM_ANALYSIS_URL/KEY/MODEL (or VP_LLM_DEFAULT_*), or pass --fake');
  const prevJudge = process.env.VP_SAFETY_JUDGE_MODE;
  if (!o.judge) process.env.VP_SAFETY_JUDGE_MODE = 'off';
  const gap = 1000 / Math.max(0.01, o.rps ?? 1), maxTokens = o.maxTokens ?? 400_000;

  try {
    const s = await setup(pool, o);
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
      items.push({ id: c.id, split: c.split, tier: row.analysis?.tier ?? null, template: c.template, industry: c.industry, language: c.language, refinable, key: c.key, predicted,
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
      objectionRecall: metric(momentsNeeded.filter(m => m.kind === 'objection' && m.x.predicted.moments.includes('objection')).length, momentsNeeded.filter(m => m.kind === 'objection').length),
      // The round 5 false nulls, per call type: complaint (needs-human) and wrong person.
      outcomeComplaint: count(x => x.predicted.outcome === x.key.outcome, it.filter(x => x.template === 'complaint')),
      outcomeWrongPerson: count(x => x.predicted.outcome === x.key.outcome, it.filter(x => x.template === 'wrong_person')),
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
      const x = await setup(pool, o);
      const idOf = new Map<string, CrossCall>();
      let minutes = 500;
      // Seeded the way the product writes a finished, analysed call: turns, the transcript, an end reason and duration,
      // the analysis's ai_guess outcome with its caller-line evidence, and the attempt marked connected. The funnel and
      // insight then read goals from graded outcomes, as they do in production.
      for (const cc of cross) {
        const conv = await newConversation(pool, x);
        const transcript = cc.lines.map((l, i) => ({ ...l, startMs: i * 3000 }));
        await tx(pool, async c => {
          for (const [i, l] of transcript.entries()) {
            await c.query('INSERT INTO turn (conversation_id, idx, speaker, text, started_ms, ended_ms) VALUES ($1,$2,$3,$4,$5,$6)', [conv, i + 1, l.speaker, l.text, l.startMs, l.startMs + 2500]);
          }
          await c.query(`UPDATE conversation SET status = 'done', end_reason = 'completed', duration_s = 40, ended_at = now() - make_interval(mins => $2), transcript = $3,
            analysis = $4, reason_code = $5 WHERE id = $1`,
            [conv, minutes--, JSON.stringify(transcript), { status: 'done', outcomeGuess: cc.outcome ? { value: cc.outcome, quote: cc.lines[cc.outcomeLine].text } : null },
              cc.theme ? 'CONV_NOT_INTERESTED' : 'CONV_GOAL_DONE']);
          await c.query(`UPDATE attempt SET status = 'connected' WHERE id = (SELECT attempt_id FROM conversation WHERE id = $1)`, [conv]);
          if (cc.outcome) {
            await c.query(`INSERT INTO outcome (workspace_id, conversation_id, definition_id, value, grade, source, evidence) VALUES ($1,$2,$3,$4,'ai_guess','analysis',$5)`,
              [x.ws, conv, x.def, cc.outcome, { quote: cc.lines[cc.outcomeLine].text, turn: cc.outcomeLine, speaker: 'caller' }]);
            await refreshOutcome(c, x.ws, conv);
          }
        });
        idOf.set(conv, cc);
      }
      const funnel = await campaignFunnel(pool, x.ws, x.campaign);
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
          funnel: funnel.total,
        };
      } else crossReport = { status: r.ran ? r.result.status : r.status, reason: r.ran ? r.result.reason : r.reason };
    }

    const tiered = it.filter(x => x.tier);
    const tierReport = tiered.length ? {
      calls: tiered.length, escalated: metric(tiered.filter(x => x.tier.escalated).length, tiered.length),
      why: tiered.filter(x => x.tier.escalated).reduce((a: Record<string, number>, x) => ({ ...a, [x.tier.why]: (a[x.tier.why] ?? 0) + 1 }), {}),
      secondFailed: tiered.filter(x => x.tier.secondFailed).length,
      byModel: Object.values(perCallCost.reduce((a: Record<string, { model: string; calls: number; input: number; output: number }>, r) => {
        const m = r.detail?.model ?? 'unknown'; a[m] ??= { model: m, calls: 0, input: 0, output: 0 };
        a[m].calls++; a[m].input += r.detail?.inputTokens ?? 0; a[m].output += r.detail?.outputTokens ?? 0; return a; }, {})),
    } : null;
    const model = fake ? 'scripted oracle (CI)' : (cost.find(c => c.detail?.model)?.detail?.model ?? 'unknown');
    const report = {
      generatedAt: new Date().toISOString(), mode: fake ? 'fake' : 'real', model, split, promptVariant: o.promptVariant ?? 'current', judge: Boolean(o.judge), truncated,
      analysisSetting: o.model || o.escalateModel ? { mode: o.escalateModel ? 'tiered' : 'single', model: o.model ?? null, escalateModel: o.escalateModel ?? null, threshold: o.threshold ?? 0.6 } : null,
      tier: tierReport,
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
    setAnalysisPromptVariant('current');
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
    ['Reason code, decided by code', 'reasonCodeCodeDecided'], ['Moments found (recall)', 'momentRecall'], ['Objections found (recall)', 'objectionRecall'], ['Outcome on complaint calls', 'outcomeComplaint'], ['Outcome on wrong-person calls', 'outcomeWrongPerson'], ['Every moment found', 'allMomentsFound'],
    ['Crisis signal', 'crisis'], ['Crisis recall', 'crisisRecall'], ['Opt-out, analysis', 'optOutByAnalysis'],
    ['Opt-out recall, analysis', 'optOutRecallByAnalysis'], ['Opt-out recall, deterministic floor', 'optOutRecallByFloor'], ['Follow-ups owed', 'followUps'],
  ];
  const c = r.cross as any;
  const md = [
    `# Analysis-quality bench`, '',
    `${r.generatedAt} · mode **${r.mode}** · split **${r.split}** · contract **${r.promptVariant}** · model: ${r.model}${r.analysisSetting ? ` · setting ${JSON.stringify(r.analysisSetting)}` : ''} · crisis judge ${r.judge ? 'on' : 'off'}${r.truncated ? ' · **stopped at the token cap**' : ''}`, '',
    `${r.cases.run} of ${r.cases.planned} synthetic calls, ${r.cases.templates} templates, languages: ${r.cases.languages.join(', ')}. Scored by code against hand-written keys; the model never grades.`, '',
    '| Field | Accuracy |', '|---|---|',
    ...rows.map(([label, k]) => `| ${label} | ${pct(r.fields[k])} |`),
    `| Grounded quotes (kept / proposed) | ${pct(r.grounding)} |`, '',
    `**Cost:** ${r.cost.modelCalls} model calls, ${r.cost.inputTokens} input and ${r.cost.outputTokens} output tokens, ` +
      `${r.cost.tokensPerCall === null ? 'n/a' : Math.round(r.cost.tokensPerCall)} tokens per call` +
      (r.cost.priced ? `, about ₹${r.cost.inrPerCall!.toFixed(3)} per call.` : ' (no price set: VP_BENCH_INR_PER_1K_INPUT/OUTPUT).'), '',
    ...(r.tier ? ['## Tiered analysis', '', `Escalated: ${pct(r.tier.escalated)}; why: ${JSON.stringify(r.tier.why)}; second pass failed: ${r.tier.secondFailed}.`, '',
      '| Model | Calls | Input tokens | Output tokens |', '|---|---|---|---|', ...r.tier.byModel.map(m => `| ${m.model} | ${m.calls} | ${m.input} | ${m.output} |`), ''] : []),
    '## Cross-call slice', '',
    !c ? 'Not run.' : c.themeRecall ? [
      `${c.calls} calls with ${Object.keys(PLANTED).length} planted objection themes; ${c.callsSampled} sampled; ${c.themesReturned} themes returned.`, '',
      '| Measure | Result |', '|---|---|',
      `| Planted themes recalled (2+ quotes, all from that theme's calls) | ${pct(c.themeRecall)} |`,
      `| Themes whose quotes all come from one planted theme | ${pct(c.pureThemes)} |`,
      `| Model quotes that were verbatim | ${pct(c.quotesVerbatim)} |`, '',
      `Funnel over the seeded slice: dialled ${c.funnel.dialled}, connected ${c.funnel.connected}, talked ${c.funnel.talked}, goal reached ${c.funnel.goalReached} (${JSON.stringify(c.funnel.goalByGrade)}).`,
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
  const sp = val('--split');
  const opts: BenchOpts = { split: sp === 'dev' || sp === 'test' ? sp : 'all', model: val('--model'), escalateModel: val('--escalate-model'),
    threshold: val('--threshold') ? Number(val('--threshold')) : undefined, fake: has('--fake'), smoke: has('--smoke'), judge: has('--judge'), cross: !has('--no-cross'),
    limit: val('--limit') ? Number(val('--limit')) : undefined, rps: val('--rps') ? Number(val('--rps')) : undefined,
    maxTokens: val('--max-tokens') ? Number(val('--max-tokens')) : undefined,
    promptVariant: ((v: string | undefined) => { if (v && !(PROMPT_VARIANTS as readonly string[]).includes(v)) throw new Error(`--prompt-variant is one of ${PROMPT_VARIANTS.join(', ')}`); return v as PromptVariant | undefined; })(val('--prompt-variant')), out: val('--out') ?? './analysis-bench-out' };
  // --passes N: the same run N times (temperature 0 still varies by 1-2 calls), one report per pass and a summary.
  const passes = Math.max(1, Number(val('--passes') ?? 1));
  (async () => {
    const rows: { pass: number; outcome: Metric; objectionRecall: Metric; outcomeComplaint: Metric; outcomeWrongPerson: Metric }[] = [];
    for (let k = 1; k <= passes; k++) {
      const r = await runBench(passes > 1 ? { ...opts, out: join(opts.out ?? './analysis-bench-out', `pass-${k}`) } : opts);
      console.log(`analysis bench (${r.mode}${passes > 1 ? `, pass ${k}/${passes}` : ''}): ${r.cases.run} calls; outcome ${pct(r.fields.outcome)}; reason ${pct(r.fields.reasonCode)}; grounded ${pct(r.grounding)}`);
      rows.push({ pass: k, outcome: r.fields.outcome, objectionRecall: r.fields.objectionRecall, outcomeComplaint: r.fields.outcomeComplaint, outcomeWrongPerson: r.fields.outcomeWrongPerson });
    }
    if (passes > 1) {
      const dir = opts.out ?? './analysis-bench-out'; mkdirSync(dir, { recursive: true });
      const cell = (m: Metric) => `${m.k}/${m.n}`;
      const md = [`# Analysis bench: ${passes} passes, contract **${opts.promptVariant ?? 'current'}**, split **${opts.split}**`, '',
        '| Pass | Outcome | Objections found | Outcome on complaint calls | Outcome on wrong-person calls |', '|---|---|---|---|---|',
        ...rows.map(r => `| ${r.pass} | ${cell(r.outcome)} | ${cell(r.objectionRecall)} | ${cell(r.outcomeComplaint)} | ${cell(r.outcomeWrongPerson)} |`), ''].join('\n');
      writeFileSync(join(dir, 'passes.md'), md); writeFileSync(join(dir, 'passes.json'), JSON.stringify(rows, null, 1));
    }
  })().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
}
