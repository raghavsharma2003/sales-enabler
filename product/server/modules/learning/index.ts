// The learning module: harness2-style Propose -> Probe -> Compose over an agent's editable components, made safe
// and proved on real outcomes (blueprint learning.md §3-§5). Per tenant only: every query is scoped to the caller's
// workspace, baselines come from the workspace's own calls, and nothing is pooled across workspaces.
//
//   learning.propose   (draft)  evidence (issues, moments, judge results, lessons) -> LLM -> gated diffs, calls cited
//   proposal.probe     (test)   test.simulate_batch on current and proposed, same callers and seeds; any regression rejects
//   proposal.accept    (A2, external)     treatment version (agents' version.candidate) + pre-registered design with calls-to-prove
//   experiment.start   (A2)     shadow A/A on the tenant's own history first; launch only if the plumbing holds
//   experiment.assign  (read)   sticky arm per contact for the dialer
//   experiment.check   (draft)  guardrails every call (hazard stop + A3 revert); verdict only at the horizon
//   experiment.stop    (draft)  a person stops a test; control keeps all traffic
// A win is proposed as deployment.split at 100% treatment on the experiment's binding (A2), never applied here.
// Background: jobs() runs experiment.check on every running experiment each minute (calls also call it per call).
import type pg from 'pg';
import { createHash } from 'node:crypto';
import type { Module } from '../../app.ts';
import { many, one, type Queryable } from '../../db.ts';
import { complete, LlmError } from '../../llm.ts';
import { tool, type Actor, type Receipt, type Registry, type ToolCtx } from '../../tools.ts';
import { canonicalJson, needsHumanApproval } from '../../../shared/approval.ts';
import type { AgentConfig } from '../../../shared/agent-config.ts';
import { arr, num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { applyOps, parseOps, PROPOSAL_KINDS, runGates, type ChangeOp } from './gates.ts';
import { compareProbe, type SimRun } from './probe.ts';
import { armFor, decide, harmSprt, powerPlan, sequentialGuard, shadowAA, type Arm } from './stats.ts';

const SYSTEM: Actor = { type: 'system', id: 'learning' };
let bound: { pool: pg.Pool; registry: Registry } | null = null;
let reg: Registry | null = null;

/** Workers that load the module without the HTTP app bind it here; buildApp binds it through routes() and jobs(). */
export function bindLearning(deps: { pool: pg.Pool; registry: Registry }): void { bound = deps; reg = deps.registry; }

type Cross<O> = Receipt<O> | { status: 'not_loaded'; reason: string };

/** Call a sibling module's tool by name. A missing sibling degrades to not_loaded, never a crash. */
async function cross<O = unknown>(ws: string, name: string, args: unknown): Promise<Cross<O>> {
  const r = bound?.registry ?? reg;
  if (!r?.get(name)) return { status: 'not_loaded', reason: `${name} is not registered yet` };
  if (!bound) return { status: 'not_loaded', reason: 'learning is not bound to a database pool' };
  return r.execute<O>(bound.pool, name, args, { workspaceId: ws, actor: SYSTEM });
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const changeHash = (ops: ChangeOp[]) => sha(canonicalJson(ops));

// ---------- shared reads ----------

interface VersionRow { id: string; number: number; agent_id: string; config: any }
const agentOf = (v: VersionRow): AgentConfig => (v.config?.agent ?? v.config) as AgentConfig;

async function latestVersion(q: Queryable, ws: string, agentId: string): Promise<VersionRow | null> {
  return one<VersionRow>(q, `SELECT v.id, v.number, v.agent_id, v.config FROM agent_version v JOIN agent a ON a.id = v.agent_id
    WHERE a.workspace_id = $1 AND a.id = $2 ORDER BY v.number DESC LIMIT 1`, [ws, agentId]);
}
async function versionById(q: Queryable, ws: string, id: string): Promise<VersionRow | null> {
  return one<VersionRow>(q, `SELECT v.id, v.number, v.agent_id, v.config FROM agent_version v JOIN agent a ON a.id = v.agent_id
    WHERE a.workspace_id = $1 AND v.id = $2`, [ws, id]);
}

/** Live calls only: test channel and manifests marked test never count. */
const LIVE = `c.channel <> 'test' AND coalesce(c.run_manifest->>'test', 'false') <> 'true' AND c.status IN ('ended','processing','done')`;

interface UnitRow { version_id: string; unit: string; success: boolean; has_outcome: boolean; hazard: boolean; safety: boolean }

/** One row per contact (the unit) per version that actually ran, in this workspace only. */
async function units(q: Queryable, ws: string, versionIds: string[], since: Date | null, successValues: string[], hazardCodes: string[]): Promise<UnitRow[]> {
  return many<UnitRow>(q, `SELECT c.agent_version_id AS version_id, coalesce(c.contact_id::text, c.id::text) AS unit,
      bool_or(c.outcome = ANY($3::text[])) AS success, bool_or(c.outcome IS NOT NULL) AS has_outcome,
      bool_or(c.reason_code = ANY($4::text[])) AS hazard,
      bool_or(coalesce(c.analysis->>'safety_violation', 'false') = 'true') AS safety
    FROM conversation c
    WHERE c.workspace_id = $1 AND c.agent_version_id = ANY($2::uuid[]) AND ${LIVE} AND ($5::timestamptz IS NULL OR c.started_at >= $5)
    GROUP BY 1, 2`, [ws, versionIds, successValues, hazardCodes, since]);
}

async function openIssue(q: Queryable, ws: string, category: string, severity: 'critical' | 'warning' | 'info', subjectId: string, detail: unknown) {
  await q.query(`INSERT INTO issue (workspace_id, category, severity, subject_type, subject_id, detail) VALUES ($1,$2,$3,'experiment',$4,$5)`,
    [ws, category, severity, subjectId, JSON.stringify(detail)]);
}

async function addLesson(q: Queryable, ws: string, agentId: string, text: string, status: string, proposalId: string | null, hash: string | null, evidence: unknown) {
  await q.query(`INSERT INTO lesson (workspace_id, agent_id, text, status, proposal_id, change_hash, evidence) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ws, agentId, text, status, proposalId, hash, JSON.stringify(evidence)]);
}

// ---------- propose ----------

const PROPOSE_SYSTEM = `You improve a business's phone agent from its own call evidence. Propose at most N concrete changes.
You may ONLY change these parts of the agent config (JSON paths):
- opening.usefulFirst (the useful thing said right after the locked disclosure; a shape, not a script)
- objections (list of {trigger, approach}) or objections.<i>.approach (approach is a note, never a line)
- goals.<i>.description (what counts as done, in plain words)
- persona.notes (list of short shape notes)
- facts order, via {"op":"reorder_facts","order":[every fact key]} (never change a fact's value)
- tools.<i>.config.guidance (when and how to use that tool, what to say while waiting)
- limits.maxSilenceS (2-30), limits.maxTurns (4-200)
Never touch the disclosure, facts' values, identity, hand-off, recording, never-say or voice. Never add a number, price,
date, percentage or link that is not already one of the facts. No urgency, scarcity, fear, guilt or false authority.
Cite the evidence each change answers by its id (call ids, moment ids, issue ids) — only ids present in the evidence.
Reply as JSON: {"proposals":[{"kind": one of ${PROPOSAL_KINDS.join('|')}, "rationale": "...", "change":[{"op":"set","path":"...","value":...}], "evidenceIds":["..."]}]}`;

async function gatherEvidence(q: Queryable, ws: string, agentId: string, base: VersionRow) {
  const versions = (await many<{ id: string }>(q, `SELECT v.id FROM agent_version v JOIN agent a ON a.id = v.agent_id WHERE a.workspace_id = $1 AND a.id = $2`, [ws, agentId])).map(r => r.id);
  const issues = await many<{ id: string; category: string; severity: string; detail: unknown }>(q,
    `SELECT id, category, severity, detail FROM issue WHERE workspace_id = $1 AND status <> 'resolved'
       AND (subject_id = $2 OR subject_id = ANY($3::uuid[]) OR detail->>'agentId' = $2::text) ORDER BY created_at DESC LIMIT 20`, [ws, agentId, versions]);
  const moments = await many<{ id: string; locus: string; reached: number; left_here: number; hazard: unknown; flagged: boolean }>(q,
    `SELECT id, locus, reached, left_here, hazard, flagged FROM moment WHERE workspace_id = $1 AND agent_version_id = $2
       ORDER BY flagged DESC, (left_here::float / greatest(reached, 1)) DESC LIMIT 10`, [ws, base.id]);
  const calls = await many<{ id: string; outcome: string | null; reason_code: string | null; judge: unknown }>(q,
    `SELECT c.id, c.outcome, c.reason_code, c.analysis->'judge' AS judge FROM conversation c
       WHERE c.workspace_id = $1 AND c.agent_version_id = ANY($2::uuid[]) AND ${LIVE}
       ORDER BY c.started_at DESC LIMIT 40`, [ws, versions]);
  const lessons = await many<{ text: string; status: string; change_hash: string | null }>(q,
    `SELECT text, status, change_hash FROM lesson WHERE workspace_id = $1 AND (agent_id = $2 OR agent_id IS NULL) ORDER BY created_at DESC LIMIT 20`, [ws, agentId]);
  return { issues, moments, calls, lessons };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cited ids that are really this workspace's evidence: shown to the model, or one of its own calls. */
async function ownEvidence(q: Queryable, ws: string, known: Set<string>, ids: unknown[]): Promise<string[]> {
  const strs = [...new Set(ids.filter((x): x is string => typeof x === 'string'))].slice(0, 20);
  const unknown = strs.filter(x => !known.has(x) && UUID_RE.test(x));
  const calls = unknown.length ? new Set((await many<{ id: string }>(q, 'SELECT id FROM conversation WHERE workspace_id = $1 AND id = ANY($2::uuid[])', [ws, unknown])).map(r => r.id)) : new Set<string>();
  return strs.filter(x => known.has(x) || calls.has(x));
}

const proposeIn = obj({ agentId: uuid(), max: opt(num({ int: true, min: 1, max: 3 })) });

async function propose(ctx: ToolCtx, i: { agentId: string; max?: number }) {
  const ws = ctx.workspaceId;
  const base = await latestVersion(ctx.q, ws, i.agentId);
  if (!base) throw new Error('this agent has no published version yet; learning starts from what has run');
  const ev = await gatherEvidence(ctx.q, ws, i.agentId, base);
  if (!ev.issues.length && !ev.moments.length && !ev.calls.length) return { status: 'no_evidence', proposals: [] };
  const cfg = agentOf(base);
  const known = new Set([...ev.issues.map(x => x.id), ...ev.moments.map(x => x.id), ...ev.calls.map(x => x.id)]);
  const tried = new Set(ev.lessons.filter(l => l.change_hash && l.status !== 'won' && l.status !== 'active').map(l => l.change_hash!));

  let reply;
  try {
    reply = await complete({ purpose: 'learning', json: true, temperature: 0.3, maxTokens: 2000, messages: [
      { role: 'system', content: PROPOSE_SYSTEM.replace('N', String(i.max ?? 3)) },
      { role: 'user', content: JSON.stringify({ agent: { opening: cfg.opening, objections: cfg.objections, goals: cfg.goals, persona: { notes: cfg.persona?.notes },
        facts: cfg.facts.map(f => ({ key: f.key, value: f.value })), tools: cfg.tools, limits: cfg.limits }, evidence: ev }) },
    ] });
  } catch (e) {
    if (e instanceof LlmError) return { status: 'llm_unavailable', reason: e.message, proposals: [] };
    throw e;
  }
  let parsed: any;
  try { parsed = JSON.parse(reply.text); } catch { return { status: 'llm_bad_reply', proposals: [] }; }
  const raw: any[] = Array.isArray(parsed?.proposals) ? parsed.proposals.slice(0, i.max ?? 3) : [];

  const out = [];
  for (const p of raw) {
    const kind = PROPOSAL_KINDS.includes(p?.kind) ? p.kind : null;
    let ops: ChangeOp[] | null = null, parseError: string | null = null;
    try { ops = parseOps(p?.change); } catch (e) { parseError = e instanceof Error ? e.message : String(e); }
    const cited = await ownEvidence(ctx.q, ws, known, Array.isArray(p?.evidenceIds) ? p.evidenceIds : []);
    const hash = ops ? changeHash(ops) : null;
    if (hash && tried.has(hash)) { out.push({ status: 'skipped', reason: 'this workspace already tested or rejected this change' }); continue; }

    const gates = ops ? runGates(cfg, ops) : { passed: false, failures: [{ gate: 'shape', detail: parseError ?? 'no change' }], checked: ['shape'] };
    const failures = [...gates.failures];
    if (!kind) failures.push({ gate: 'shape', detail: `kind must be one of ${PROPOSAL_KINDS.join(', ')}` });
    if (!cited.length) failures.push({ gate: 'evidence', detail: 'no change is drafted without citing this workspace\'s own evidence' });
    const status = failures.length ? 'gated_out' : 'drafted';
    const row = await one<{ id: string }>(ctx.q, `INSERT INTO proposal (workspace_id, agent_id, base_version_id, kind, change, evidence, gates, status, change_hash, rationale)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [ws, i.agentId, base.id, kind ?? 'unknown', JSON.stringify(ops ?? p?.change ?? null), JSON.stringify({ cited, usage: reply.usage }),
       JSON.stringify({ passed: !failures.length, failures, checked: gates.checked }), status, hash, typeof p?.rationale === 'string' ? p.rationale.slice(0, 1000) : null]);
    out.push({ id: row!.id, status, kind, failures, cited });
  }
  return { status: 'ok', proposals: out };
}

// ---------- probe ----------

const probeIn = obj({ proposalId: uuid(), simCallerIds: opt(arr(uuid(), { min: 1, max: 12 })), seeds: opt(arr(num({ int: true, min: 0 }), { min: 1, max: 5 })) });

interface ProposalRow { id: string; agent_id: string; base_version_id: string | null; kind: string; change: any; status: string; simulation: any; calls_to_prove: number | null; change_hash: string | null; rationale: string | null }

async function proposalFor(q: Queryable, ws: string, id: string, lock = false): Promise<ProposalRow> {
  const p = await one<ProposalRow>(q, `SELECT id, agent_id, base_version_id, kind, change, status, simulation, calls_to_prove, change_hash, rationale
    FROM proposal WHERE id = $1 AND workspace_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, ws]);
  if (!p) throw new Error('no such proposal');
  return p;
}

async function probe(ctx: ToolCtx, i: { proposalId: string; simCallerIds?: string[]; seeds?: number[] }) {
  const ws = ctx.workspaceId;
  const p = await proposalFor(ctx.q, ws, i.proposalId, true);
  if (p.status !== 'drafted') throw new Error(`only a drafted proposal can be probed; this one is ${p.status}`);
  const base = p.base_version_id ? await versionById(ctx.q, ws, p.base_version_id) : null;
  if (!base) throw new Error('the version this proposal was drafted against is gone');
  const ops = parseOps(p.change);
  const gates = runGates(agentOf(base), ops);           // re-run: the shared lint and door may have tightened since drafting
  if (!gates.passed) {
    await ctx.q.query(`UPDATE proposal SET status = 'gated_out', gates = $2 WHERE id = $1`, [p.id, JSON.stringify(gates)]);
    return { status: 'gated_out', failures: gates.failures };
  }
  const callers = i.simCallerIds
    ? (await many<{ id: string }>(ctx.q, `SELECT id FROM sim_caller WHERE workspace_id = $1 AND id = ANY($2::uuid[])`, [ws, i.simCallerIds])).map(r => r.id)
    : (await many<{ id: string }>(ctx.q, `SELECT id FROM sim_caller WHERE workspace_id = $1 AND (agent_id = $2 OR agent_id IS NULL) ORDER BY created_at LIMIT 12`, [ws, p.agent_id])).map(r => r.id);
  if (!callers.length) return { status: 'no_sim_callers', reason: 'add simulated callers for this agent before probing' };
  const seeds = i.seeds ?? [1, 2, 3];

  const sim = async (config: AgentConfig) => cross<{ runs: SimRun[] }>(ws, 'test.simulate_batch', { agentId: p.agent_id, config, simCallerIds: callers, seeds });
  const current = await sim(agentOf(base));
  if (current.status !== 'confirmed') return { status: 'simulator_unavailable', reason: 'reason' in current ? current.reason : current.status };
  const proposed = await sim(gates.proposed!);
  if (proposed.status !== 'confirmed') return { status: 'simulator_unavailable', reason: 'reason' in proposed ? proposed.reason : proposed.status };

  const verdict = compareProbe(current.result.runs ?? [], proposed.result.runs ?? []);
  const status = verdict.verdict === 'pass' ? 'awaiting_approval' : 'rejected';
  await ctx.q.query(`UPDATE proposal SET simulation = $2, gates = $3, status = $4 WHERE id = $1`,
    [p.id, JSON.stringify({ simCallerIds: callers, seeds, verdict, label: 'simulated, not proved' }), JSON.stringify(gates.passed ? { passed: true, failures: [], checked: gates.checked } : gates), status]);
  if (status === 'rejected') await addLesson(ctx.q, ws, p.agent_id, `Simulation rejected a ${p.kind} change: ${verdict.regressions.join('; ')}`, 'rejected', p.id, p.change_hash, { simulation: verdict });
  return { status, verdict };
}

// ---------- compose: accept -> experiment ----------

const acceptIn = obj({
  proposalId: uuid(),
  successValues: opt(arr(str({ min: 1, max: 60 }), { min: 1, max: 10 })),
  baselineRate: opt(num({ min: 0.01, max: 0.99 })),
  mdeAbs: opt(num({ min: 0.005, max: 0.5 })),
  minDays: opt(num({ int: true, min: 0, max: 28 })),
  maxDays: opt(num({ int: true, min: 1, max: 90 })),
  hazardCodes: opt(arr(str({ min: 1, max: 60 }), { max: 10 })),
  binding: opt(str({ oneOf: ['campaign', 'inbound', 'web'] })),
});
type AcceptIn = ReturnType<typeof acceptIn>;

const DEFAULT_HAZARD_CODES = ['opt_out', 'complaint', 'abuse_report'];

async function accept(ctx: ToolCtx, i: AcceptIn) {
  const ws = ctx.workspaceId;
  const p = await proposalFor(ctx.q, ws, i.proposalId, true);
  if (p.status !== 'awaiting_approval') throw new Error(`only a probed proposal can be tested; this one is ${p.status}`);
  const busy = await one(ctx.q, `SELECT id FROM experiment WHERE workspace_id = $1 AND agent_id = $2 AND state IN ('aa_pending','running')`, [ws, p.agent_id]);
  if (busy) throw new Error('this agent already has an experiment; one confirmatory test at a time');
  const base = p.base_version_id ? await versionById(ctx.q, ws, p.base_version_id) : null;
  if (!base) throw new Error('the version this proposal was drafted against is gone');

  const successValues = i.successValues ?? ['success'];
  const hazardCodes = i.hazardCodes ?? DEFAULT_HAZARD_CODES;
  // Baseline from this workspace's own calls on the control version: no other tenant's data, ever.
  let baseline = i.baselineRate, baselineSource = 'given';
  if (baseline === undefined) {
    const hist = await units(ctx.q, ws, [base.id], new Date(Date.now() - 90 * 86_400_000), successValues, hazardCodes);
    if (hist.length < 30) throw new Error(`only ${hist.length} live contacts on the control version; give baselineRate to plan the test`);
    baseline = Math.min(0.95, Math.max(0.02, hist.filter(u => u.success).length / hist.length));
    baselineSource = `own calls, n=${hist.length}`;
  }
  const mde = i.mdeAbs ?? Math.max(0.02, Math.round(baseline * 0.2 * 1000) / 1000);
  if (baseline + mde >= 1) throw new Error('the target rate must stay below 100%');
  const plan = powerPlan(baseline, mde);

  const treatmentCfg = applyOps(agentOf(base), parseOps(p.change));
  const treatment = await treatmentVersion(ws, base, treatmentCfg, p.id);
  const design = {
    binding: i.binding ?? 'campaign', treatmentConfig: treatmentCfg, metric: 'outcome_success', unit: 'contact', successValues, hazardCodes, baselineSource, plan,
    horizonPerArm: plan.perArm, treatmentShare: 0.5, alpha: 0.05, power: 0.8, minDays: i.minDays ?? 7, maxDays: i.maxDays ?? 28,
    test: 'two-proportion z, two-sided, fixed horizon', stop: 'verdict only at the horizon; guardrails stop at once',
    guardrails: { safetyViolations: 'any in the treatment arm', events: { codes: hazardCodes, minEvents: 3, ratio: 2, alwaysValid: 'mSPRT alpha 0.05' } },
  };
  const prereg = sha(canonicalJson(design));
  const e = await one<{ id: string }>(ctx.q, `INSERT INTO experiment (workspace_id, agent_id, proposal_id, control_version_id, treatment_version_id, design, state)
    VALUES ($1,$2,$3,$4,$5,$6,'aa_pending') RETURNING id`, [ws, p.agent_id, p.id, base.id, treatment.id, JSON.stringify({ ...design, preregistrationHash: prereg })]);
  await ctx.q.query(`UPDATE proposal SET status = 'testing', calls_to_prove = $2 WHERE id = $1`, [p.id, plan.total]);
  return { experimentId: e!.id, treatmentVersionId: treatment.id, ...(treatment.reason ? { treatmentPending: treatment.reason } : {}), callsToProve: plan.total, perArm: plan.perArm, baseline, mdeAbs: mde,
    note: `about ${plan.total} live calls (${plan.perArm} per arm) to prove ${(baseline * 100).toFixed(1)}% -> ${((baseline + mde) * 100).toFixed(1)}%` };
}

/** The treatment arm is an immutable version made by the agents module (version.candidate compiles its brief once and
 *  never publishes it). Learning never writes agent_version itself. If the tool is missing, the experiment is still
 *  pre-registered and experiment.start retries, then refuses with a plain reason. */
async function treatmentVersion(ws: string, base: VersionRow, cfg: AgentConfig, proposalId: string): Promise<{ id: string | null; reason?: string }> {
  const r = await cross<{ versionId: string }>(ws, 'version.candidate', { agentId: base.agent_id, config: cfg, parentVersionId: base.id, note: `learning treatment for proposal ${proposalId}` });
  if (r.status === 'confirmed') return { id: r.result.versionId };
  return { id: null, reason: `the treatment version could not be made: ${'reason' in r ? r.reason : r.status}` };
}

interface ExperimentRow { id: string; agent_id: string; proposal_id: string | null; control_version_id: string; treatment_version_id: string | null; design: any; state: string; result: any; started_at: Date; expires_at: Date | null }

async function experimentFor(q: Queryable, ws: string, id: string, lock = false): Promise<ExperimentRow> {
  const e = await one<ExperimentRow>(q, `SELECT id, agent_id, proposal_id, control_version_id, treatment_version_id, design, state, result, started_at, expires_at
    FROM experiment WHERE id = $1 AND workspace_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, ws]);
  if (!e) throw new Error('no such experiment');
  return e;
}

const startIn = obj({ experimentId: uuid(), aaRuns: opt(num({ int: true, min: 100, max: 5000 })) });

/** Shadow A/A on the tenant's own history of the control version, then launch. */
async function start(ctx: ToolCtx, i: { experimentId: string; aaRuns?: number }) {
  const ws = ctx.workspaceId;
  const e = await experimentFor(ctx.q, ws, i.experimentId, true);
  if (e.state !== 'aa_pending') throw new Error(`this experiment is ${e.state}`);
  if (!e.treatment_version_id) {
    const base = await versionById(ctx.q, ws, e.control_version_id);
    const made = base ? await treatmentVersion(ws, base, e.design.treatmentConfig, e.proposal_id ?? e.id) : { id: null, reason: 'the control version is gone' };
    if (!made.id) return { state: e.state, launched: false, reason: made.reason };
    await ctx.q.query('UPDATE experiment SET treatment_version_id = $2 WHERE id = $1', [e.id, made.id]);
    e.treatment_version_id = made.id;
  }
  const t = await versionById(ctx.q, ws, e.treatment_version_id);
  if (!t?.config?.brief) return { state: e.state, launched: false, reason: 'the treatment version has no compiled brief' };

  const hist = await units(ctx.q, ws, [e.control_version_id], null, e.design.successValues, e.design.hazardCodes);
  const aa = shadowAA(hist.map(u => ({ id: u.unit, success: u.success, hasOutcome: u.has_outcome })), { runs: i.aaRuns ?? 1000, salt: e.id });
  await ctx.q.query(`INSERT INTO shadow_aa (workspace_id, agent_id, experiment_id, metric, runs, false_winners, passed, detail) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [ws, e.agent_id, e.id, e.design.metric, aa.runs, aa.falseWinners, aa.passed, JSON.stringify(aa)]);
  if (!aa.passed) {
    // Too little history is a wait, not a failure; broken plumbing is a failure.
    const state = aa.plumbingOk ? 'aa_pending' : 'aa_failed';
    await ctx.q.query(`UPDATE experiment SET state = $2, result = $3 WHERE id = $1`, [e.id, state, JSON.stringify({ shadowAA: aa })]);
    if (state === 'aa_failed') await openIssue(ctx.q, ws, 'learning.aa_plumbing', 'warning', e.id, { agentId: e.agent_id, reasons: aa.reasons });
    return { state, launched: false, reasons: aa.reasons, shadowAA: aa };
  }
  await ctx.q.query(`UPDATE experiment SET state = 'running', started_at = now(), expires_at = now() + make_interval(days => $2), result = $3 WHERE id = $1`,
    [e.id, e.design.maxDays, JSON.stringify({ shadowAA: aa })]);
  return { state: 'running', launched: true, callsToProve: e.design.plan.total, shadowAA: { falseWinnerRate: aa.falseWinnerRate, units: aa.units } };
}

// ---------- prove: assign, check, stop ----------

const assignIn = obj({ agentId: uuid(), contactId: uuid() });

async function assign(ctx: ToolCtx, i: { agentId: string; contactId: string }) {
  const e = await one<{ id: string; control_version_id: string; treatment_version_id: string; design: any }>(ctx.q,
    `SELECT id, control_version_id, treatment_version_id, design FROM experiment WHERE workspace_id = $1 AND agent_id = $2 AND state = 'running'
      AND (expires_at IS NULL OR expires_at > now()) ORDER BY started_at DESC LIMIT 1`, [ctx.workspaceId, i.agentId]);
  if (!e) return null;
  const arm = armFor(e.id, i.contactId, e.design.treatmentShare ?? 0.5);
  return { experimentId: e.id, arm, versionId: arm === 'treatment' ? e.treatment_version_id : e.control_version_id };
}

function tally(rows: UnitRow[], versionId: string) {
  const r = rows.filter(u => u.version_id === versionId);
  return { n: r.length, success: r.filter(u => u.success).length, hazard: r.filter(u => u.hazard).length, safety: r.filter(u => u.safety).length };
}

export function hazardTrip(control: { n: number; hazard: number }, treatment: { n: number; hazard: number; safety: number }, g: { minEvents: number; ratio: number }): string | null {
  if (treatment.safety > 0) return `${treatment.safety} safety violation(s) in the treatment arm`;
  if (treatment.n && treatment.hazard >= g.minEvents) {
    const ct = control.n ? (control.hazard + 0.5) / (control.n + 1) : 0;
    const tt = treatment.hazard / treatment.n;
    if (!control.n || tt >= g.ratio * ct) return `complaints/opt-outs ${treatment.hazard}/${treatment.n} vs control ${control.hazard}/${control.n} (${g.ratio}x or more)`;
  }
  if (harmSprt({ k: control.hazard, n: control.n }, { k: treatment.hazard, n: treatment.n }).harmful) return 'complaints/opt-outs are higher in the treatment arm (always-valid test)';
  return null;
}

async function check(ctx: ToolCtx, i: { experimentId: string }) {
  const ws = ctx.workspaceId;
  const e = await experimentFor(ctx.q, ws, i.experimentId, true);
  if (e.state !== 'running') return { state: e.state, result: e.state === 'decided' ? e.result?.decision : undefined };
  const d = e.design;
  const tv = e.treatment_version_id!;               // a running experiment always has its treatment version
  const rows = await units(ctx.q, ws, [e.control_version_id, tv], e.started_at, d.successValues, d.hazardCodes);
  const c = tally(rows, e.control_version_id), t = tally(rows, tv);
  const progress = { control: c.n, treatment: t.n, horizonPerArm: d.horizonPerArm };

  // Fast lane: a harmful arm stops at once, whatever the horizon.
  const trip = hazardTrip(c, t, d.guardrails.events);
  if (trip) {
    const revert = await cross(ws, 'deployment.revert_to_last_good', { agentId: e.agent_id, binding: d.binding });
    const result = { ...e.result, guardrail: { reason: trip, control: c, treatment: t, at: new Date().toISOString() }, revert: { status: revert.status, ...('reason' in revert ? { reason: revert.reason } : {}) } };
    await ctx.q.query(`UPDATE experiment SET state = 'stopped_guardrail', result = $2, decided_at = now() WHERE id = $1`, [e.id, JSON.stringify(result)]);
    await openIssue(ctx.q, ws, 'learning.guardrail_stop', 'critical', e.id, { agentId: e.agent_id, reason: trip, revert: revert.status });
    if (e.proposal_id) await ctx.q.query(`UPDATE proposal SET status = 'rejected' WHERE id = $1`, [e.proposal_id]);
    const hash = e.proposal_id ? (await one<{ h: string }>(ctx.q, 'SELECT change_hash AS h FROM proposal WHERE id = $1', [e.proposal_id]))?.h ?? null : null;
    await addLesson(ctx.q, ws, e.agent_id, `Stopped by guardrail: ${trip}. The treatment no longer receives calls.`, 'stopped', e.proposal_id, hash, { experimentId: e.id, control: c, treatment: t });
    return { state: 'stopped_guardrail', reason: trip, revert: revert.status, progress };
  }

  if (e.expires_at && e.expires_at.getTime() < Date.now() && (c.n < d.horizonPerArm || t.n < d.horizonPerArm)) {
    await ctx.q.query(`UPDATE experiment SET state = 'expired', decided_at = now() WHERE id = $1`, [e.id]);
    await addLesson(ctx.q, ws, e.agent_id, `Expired before the horizon (${c.n}+${t.n} of ${2 * d.horizonPerArm} calls): no claim either way.`, 'expired', e.proposal_id, null, { experimentId: e.id });
    return { state: 'expired', progress };
  }

  // No peeking: until the horizon the effect is not computed, let alone shown.
  const guard = sequentialGuard({ control: c.n, treatment: t.n, horizonPerArm: d.horizonPerArm, startedAt: e.started_at, minDays: d.minDays });
  if (!guard.mayDecide) return { state: 'running', progress, remainingCalls: guard.remainingCalls, note: guard.reason };

  const controlArm: Arm = { k: c.success, n: c.n }, treatmentArm: Arm = { k: t.success, n: t.n };
  const decision = decide(controlArm, treatmentArm, d.alpha);
  const result = { ...e.result, decision: { ...decision, control: controlArm, treatment: treatmentArm, label: `proved on ${c.n + t.n} calls, 95% interval ${pts(decision.ci.lo)} to ${pts(decision.ci.hi)} points` } };
  let publish: { status: string; actionId?: string; reason?: string } | null = null;
  if (decision.verdict === 'win') publish = await proposePublish(ws, e);
  await ctx.q.query(`UPDATE experiment SET state = 'decided', result = $2, decided_at = now() WHERE id = $1`, [e.id, JSON.stringify({ ...result, publish })]);
  if (e.proposal_id && decision.verdict !== 'win') await ctx.q.query(`UPDATE proposal SET status = 'rejected' WHERE id = $1`, [e.proposal_id]);
  const hash = e.proposal_id ? (await one<{ h: string }>(ctx.q, 'SELECT change_hash AS h FROM proposal WHERE id = $1', [e.proposal_id]))?.h ?? null : null;
  const text = decision.verdict === 'win' ? `Won: ${result.decision.label}. Proposed for publish; a person approves it.`
    : decision.verdict === 'loss' ? `Lost: ${result.decision.label}. Control kept.`
    : `No detectable effect at n=${c.n + t.n} (interval ${pts(decision.ci.lo)} to ${pts(decision.ci.hi)} points). Control kept.`;
  await addLesson(ctx.q, ws, e.agent_id, text, decision.verdict === 'win' ? 'won' : decision.verdict === 'loss' ? 'lost' : 'null_result', e.proposal_id, hash, { experimentId: e.id, ...result.decision });
  return { state: 'decided', verdict: decision.verdict, decision: result.decision, publish, progress };
}

const pts = (x: number) => (x * 100).toFixed(1);

/** A win is proposed as deployment.split at 100% treatment on the experiment's binding. That tool must be
 *  approval-gated: learning never applies a deployment on its own. */
async function proposePublish(ws: string, e: ExperimentRow) {
  const t = (bound?.registry ?? reg)?.get('deployment.split');
  if (!t) return { status: 'not_loaded', reason: 'deployment.split is not registered yet; roll the winner out by hand' };
  if (!needsHumanApproval(t.risk)) return { status: 'not_sent', reason: 'deployment.split does not require approval; learning never deploys on its own' };
  const r = await cross<unknown>(ws, 'deployment.split', { agentId: e.agent_id, binding: e.design.binding, split: [{ versionId: e.treatment_version_id, percent: 100 }] });
  return { status: r.status, ...(r.status === 'needs_approval' ? { actionId: r.actionId } : {}), ...('reason' in r ? { reason: r.reason } : {}) };
}

const stopIn = obj({ experimentId: uuid(), reason: str({ min: 3, max: 300 }) });

async function stop(ctx: ToolCtx, i: { experimentId: string; reason: string }) {
  const ws = ctx.workspaceId;
  const e = await experimentFor(ctx.q, ws, i.experimentId, true);
  if (!['aa_pending', 'running'].includes(e.state)) throw new Error(`this experiment is already ${e.state}`);
  await ctx.q.query(`UPDATE experiment SET state = 'stopped_manual', decided_at = now(), result = coalesce(result, '{}'::jsonb) || $2 WHERE id = $1`,
    [e.id, JSON.stringify({ stopped: { reason: i.reason, by: ctx.actor.id ?? ctx.actor.type } })]);
  if (e.proposal_id) await ctx.q.query(`UPDATE proposal SET status = 'rejected' WHERE id = $1`, [e.proposal_id]);
  await addLesson(ctx.q, ws, e.agent_id, `Stopped by a person before the horizon: ${i.reason}. No claim either way.`, 'stopped', e.proposal_id, null, { experimentId: e.id });
  return { state: 'stopped_manual' };
}

// ---------- reads ----------

/** While running, an experiment shows its meter and guardrails, never its effect (no peeking). */
function publicExperiment(e: ExperimentRow) {
  const { result, ...rest } = e;
  const shown = e.state === 'running' || e.state === 'aa_pending' ? { shadowAA: result?.shadowAA ? { passed: result.shadowAA.passed, reasons: result.shadowAA.reasons } : undefined } : result;
  return { ...rest, result: shown, callsToProve: e.design?.plan?.total };
}

// ---------- the module ----------

export const module: Module = {
  name: 'learning',
  register(r) {
    reg = r;
    r.register(tool(proposeIn, { name: 'learning.propose', risk: 'draft', summary: 'draft changes to an agent from its own call evidence, gated and with evidence cited', run: propose }));

    r.register(tool(obj({ agentId: opt(uuid()), status: opt(str({ max: 30 })) }), { name: 'proposal.list', risk: 'read', summary: 'list learning proposals',
      run: (ctx, i) => many(ctx.q, `SELECT id, agent_id, kind, status, rationale, calls_to_prove, gates->'passed' AS gates_passed, created_at FROM proposal
        WHERE workspace_id = $1 AND ($2::uuid IS NULL OR agent_id = $2) AND ($3::text IS NULL OR status = $3) ORDER BY created_at DESC LIMIT 100`, [ctx.workspaceId, i.agentId ?? null, i.status ?? null]) }));
    r.register(tool(obj({ id: uuid() }), { name: 'proposal.get', risk: 'read', summary: 'one learning proposal with its diff, gates and simulation',
      run: (ctx, i) => one(ctx.q, 'SELECT * FROM proposal WHERE id = $1 AND workspace_id = $2', [i.id, ctx.workspaceId]) }));

    r.register(tool(probeIn, { name: 'proposal.probe', risk: 'test', summary: 'simulate the current and proposed versions on the same callers and seeds; reject regressions', run: probe }));

    r.register(tool(acceptIn, { name: 'proposal.accept', risk: 'external', roles: ['owner', 'builder', 'operator'], summary: 'accept a probed proposal into a pre-registered A/B test',
      describe: i => `Test proposal ${i.proposalId.slice(0, 8)} against the current version on live calls (fixed horizon; calls to prove computed from your own baseline before launch)`,
      version: async (ctx, i) => (await one<{ v: string }>(ctx.q, `SELECT status || ':' || md5(coalesce(simulation::text, '')) AS v FROM proposal WHERE id = $1 AND workspace_id = $2`, [i.proposalId, ctx.workspaceId]))?.v ?? null,
      run: accept }));

    r.register(tool(startIn, { name: 'experiment.start', risk: 'external', summary: 'run the shadow A/A, then send live calls to both arms',
      describe: i => `Start experiment ${i.experimentId.slice(0, 8)}: live calls split between the current and the proposed version`,
      version: async (ctx, i) => (await one<{ v: string }>(ctx.q, `SELECT state || ':' || md5(design::text) AS v FROM experiment WHERE id = $1 AND workspace_id = $2`, [i.experimentId, ctx.workspaceId]))?.v ?? null,
      run: start }));

    r.register(tool(stopIn, { name: 'experiment.stop', risk: 'draft', summary: 'stop an experiment; the current version keeps all calls', run: stop }));
    r.register(tool(obj({ experimentId: uuid() }), { name: 'experiment.check', risk: 'draft', summary: 'check guardrails (stop at once on harm) and decide at the horizon', run: check }));
    r.register(tool(assignIn, { name: 'experiment.assign', risk: 'read', summary: 'which version this contact meets (sticky per experiment)', run: assign }));

    r.register(tool(obj({ agentId: opt(uuid()) }), { name: 'experiment.list', risk: 'read', summary: 'list experiments',
      run: async (ctx, i) => (await many<ExperimentRow>(ctx.q, `SELECT id, agent_id, proposal_id, control_version_id, treatment_version_id, design, state, result, started_at, expires_at
        FROM experiment WHERE workspace_id = $1 AND ($2::uuid IS NULL OR agent_id = $2) ORDER BY started_at DESC LIMIT 100`, [ctx.workspaceId, i.agentId ?? null])).map(publicExperiment) }));
    r.register(tool(obj({ id: uuid() }), { name: 'experiment.get', risk: 'read', summary: 'one experiment: meter, guardrails, and the verdict once decided',
      run: async (ctx, i) => publicExperiment(await experimentFor(ctx.q, ctx.workspaceId, i.id)) }));

    r.register(tool(obj({ agentId: opt(uuid()) }), { name: 'lesson.list', risk: 'read', summary: 'what this workspace has learned, with evidence',
      run: (ctx, i) => many(ctx.q, `SELECT id, agent_id, text, status, evidence, created_at FROM lesson WHERE workspace_id = $1 AND ($2::uuid IS NULL OR agent_id = $2)
        ORDER BY created_at DESC LIMIT 200`, [ctx.workspaceId, i.agentId ?? null]) }));

    r.register(tool(obj({ baseline: num({ min: 0.01, max: 0.99 }), mdeAbs: num({ min: 0.005, max: 0.5 }), alpha: opt(num({ min: 0.001, max: 0.2 })), power: opt(num({ min: 0.5, max: 0.99 })) }),
      { name: 'learning.power', risk: 'read', summary: 'calls needed to prove a change, before launch',
        run: async (_ctx, i) => { if (i.baseline + i.mdeAbs >= 1) throw new Error('the target rate must stay below 100%'); return powerPlan(i.baseline, i.mdeAbs, i.alpha, i.power); } }));
  },
  routes(_router, deps) { bound = { pool: deps.pool, registry: deps.registry }; },
  jobs(deps) {
    bound = { pool: deps.pool, registry: deps.registry };
    return [{
      name: 'learning.check', everyMs: 60_000,
      // Guardrails and horizons for every running experiment, each checked inside its own workspace.
      run: async d => {
        const running = await many<{ id: string; workspace_id: string }>(d.pool, "SELECT id, workspace_id FROM experiment WHERE state = 'running' ORDER BY started_at LIMIT 500");
        for (const e of running) await d.registry.execute(d.pool, 'experiment.check', { experimentId: e.id }, { workspaceId: e.workspace_id, actor: SYSTEM });
      },
    }];
  },
};

