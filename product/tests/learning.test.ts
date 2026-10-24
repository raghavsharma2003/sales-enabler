// Learning module tests against a real Postgres (skipped when DATABASE_URL is unset). Sibling tools the module calls
// by name (test.simulate_batch, version.candidate, deployment.revert_to_last_good, deployment.split) are faked here. Synthetic
// data only; every run uses fresh workspaces.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp, type Module } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import { tool, type Actor, type Registry } from '../server/tools.ts';
import { any, obj, opt, str, uuid } from '../shared/validate.ts';
import type { Job } from '../server/jobs.ts';
import type { AgentConfig } from '../shared/agent-config.ts';
import { bindLearning, checkRunning, module as learning } from '../server/modules/learning/index.ts';
import { runGates } from '../server/modules/learning/gates.ts';
import { powerPlan } from '../server/modules/learning/stats.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let registry: Registry;
const reverts: { ws: string; agentId: string; binding: string }[] = [];
const simulated: { simCallerIds: string[] }[] = [];

function cfg(agentId: string): AgentConfig {
  return {
    schema: 1, agentId, version: 1, versionHash: 'h1',
    brand: { name: 'Sahayak Home Services', spokenName: 'Sahayak', verifiedDomains: ['sahayak.example'] },
    job: 'reminder' as AgentConfig['job'], category: 'service', sectorPacks: ['base'],
    languages: { primary: 'hinglish', allowed: ['hinglish', 'hi-IN', 'en-IN'], mirrorCaller: true },
    persona: { name: 'Riya', gender: 'female', register: 'warm_peer', energy: 3, humour: 1, honorific: 'aap', notes: ['explain plainly'] },
    goals: [{ id: 'confirm_visit', description: 'the customer confirms or reschedules the service visit', outcome: 'visit', required: true }],
    facts: [
      { key: 'visit_date', value: '24 October', purpose: 'service', source: 'agent.form' },
      { key: 'visit_fee', value: '499', purpose: 'service', source: 'agent.form' },
    ],
    neverSay: ['guaranteed'],
    opening: { disclosureClause: 'Main Sahayak ki AI assistant Riya bol rahi hoon', usefulFirst: 'your AC service visit is due' },
    objections: [{ trigger: 'busy', approach: 'offer a callback time' }],
    tools: [{ name: 'mark_callback', risk: 'draft' }],
    handOff: { when: ['asks_for_human'], target: { kind: 'queue' }, warmSummary: true },
    memory: { read: true, write: true, briefMaxBytes: 1200 },
    limits: { maxDurationS: 240, maxSilenceS: 8, maxTurns: 40 },
    voice: { stackId: 'test-stack' },
    recording: { enabled: true, announce: true },
  };
}

// Fake siblings (the agents module's contract). test.simulate_batch: a usefulFirst containing "slowly" makes simulated callers hang up (a regression).
const siblings: Module = {
  name: 'fake-siblings',
  register(r) {
    r.register(tool(obj({ agentId: uuid(), config: any(), simCallerIds: any(), seeds: any() }), { name: 'test.simulate_batch', risk: 'test', summary: 'fake simulator',
      run: async (_ctx, i) => {
        const bad = String((i.config as AgentConfig).opening.usefulFirst).includes('slowly');
        simulated.push({ simCallerIds: i.simCallerIds as string[] });
        const runs = (i.simCallerIds as string[]).flatMap(id => (i.seeds as number[]).map(seed => ({ simCallerId: id, seed, passed: !bad, metrics: { hung_up: bad ? 1 : 0, safety_violations: 0 } })));
        return { runs };
      } }));
    // Like the agents module: the library's defaults first, then this workspace's own callers.
    r.register(tool(obj({ agentId: opt(uuid()) }), { name: 'simcaller.list', risk: 'read', summary: 'fake practice callers',
      run: async ctx => ({ callers: [...['default:busy', 'default:sceptical', 'default:elderly'].map(id => ({ id, source: 'library' })),
        ...(await pool.query('SELECT id FROM sim_caller WHERE workspace_id = $1', [ctx.workspaceId])).rows.map(r => ({ id: r.id, source: 'workspace' }))] }) }));
    r.register(tool(versionCandidateIn, { name: 'version.candidate', risk: 'draft', summary: 'fake candidate version', run: versionCandidate }));
    r.register(tool(obj({ agentId: uuid(), binding: str() }), { name: 'deployment.revert_to_last_good', risk: 'external', summary: 'fake revert',
      run: async (ctx, i) => { reverts.push({ ws: ctx.workspaceId, agentId: i.agentId, binding: i.binding }); return { reverted: true }; } }));
    r.register(tool(obj({ agentId: uuid(), binding: str(), split: any() }), { name: 'deployment.split', risk: 'external', summary: 'fake split',
      run: async (ctx, i) => {   // as the agents module does: a new deployment row for the binding
        await ctx.q.query('INSERT INTO deployment (workspace_id, agent_id, binding, split) VALUES ($1,$2,$3,$4)', [ctx.workspaceId, i.agentId, i.binding,
          JSON.stringify((i.split as { versionId: string; percent: number }[]).map(x => ({ version_id: x.versionId, percent: x.percent })))]);
        return { deployed: true };
      } }));
    // A minimal brief.edit: 'set' ops on the agent's draft (the real one validates and lints; tests/e2e covers it).
    r.register(tool(obj({ agentId: uuid(), patch: any() }), { name: 'brief.edit', risk: 'draft', summary: 'fake brief edit',
      run: async (ctx, i) => {
        const a = (await ctx.q.query('SELECT draft FROM agent WHERE id = $1 AND workspace_id = $2', [i.agentId, ctx.workspaceId])).rows[0];
        const draft = Object.keys(a.draft ?? {}).length ? a.draft : (await ctx.q.query('SELECT config FROM agent_version WHERE agent_id = $1 ORDER BY number LIMIT 1', [i.agentId])).rows[0].config.agent;
        for (const o of i.patch as { op: string; path: string; value: unknown }[]) {
          const keys = o.path.split('.'); let node = draft; for (const k of keys.slice(0, -1)) node = node[k]; node[keys.at(-1)!] = o.value;
        }
        await ctx.q.query('UPDATE agent SET draft = $2 WHERE id = $1', [i.agentId, JSON.stringify(draft)]);
        return { agentId: i.agentId };
      } }));
  },
};

const versionCandidateIn = obj({ agentId: uuid(), config: any(), parentVersionId: uuid(), note: str() });
async function versionCandidate(ctx: { q: pg.PoolClient | pg.Pool; workspaceId: string }, i: ReturnType<typeof versionCandidateIn>) {
  const a = await one(ctx.q, 'SELECT 1 FROM agent WHERE id = $1 AND workspace_id = $2', [i.agentId, ctx.workspaceId]);
  if (!a) throw new Error('no such agent');
  const n = (await one<{ n: number }>(ctx.q, 'SELECT coalesce(max(number), 0) + 1 AS n FROM agent_version WHERE agent_id = $1', [i.agentId]))!.n;
  const v = await one<{ id: string }>(ctx.q, `INSERT INTO agent_version (agent_id, number, hash, parent_id, author_type, note, config, kind) VALUES ($1,$2,'hc',$3,'system',$4,$5,'candidate') RETURNING id`,
    [i.agentId, n, i.parentVersionId, i.note, JSON.stringify({ agent: i.config, brief: { text: 'compiled', hash: 'bh', bytes: 8 } })]);
  return { versionId: v!.id, number: n, versionHash: 'hc', brief: { hash: 'bh', bytes: 8 } };
}

let jobs: Job[] = [];
before(async () => {
  if (skip) return;
  pool = createPool(URL_);
  const app = buildApp(pool, [learning, siblings]);
  registry = app.registry; jobs = app.jobs;
});
after(async () => { setFakeLlm(null); await pool?.end(); });

async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('learning test') RETURNING id"))!.id;
  const member = (await one<{ id: string }>(pool, 'INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,$3) RETURNING id', [ws, `o${Math.random()}@example.test`, 'owner']))!.id;
  const agentId = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name, status) VALUES ($1, 'Riya', 'live') RETURNING id", [ws]))!.id;
  const versionId = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1, 1, 'h1', $2) RETURNING id",
    [agentId, JSON.stringify({ agent: cfg(agentId), brief: { text: 'brief v1', hash: 'b1', bytes: 8 } })]))!.id;
  await pool.query(`INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values)
    VALUES ($1, 'visit', 'Did the customer confirm the visit?', '{confirmed,rescheduled,declined}', '{confirmed}')`, [ws]);
  for (let i = 0; i < 2; i++) await pool.query("INSERT INTO sim_caller (workspace_id, agent_id, persona, scenario) VALUES ($1,$2,'busy','asks to call later')", [ws, agentId]);
  const actor: Actor = { type: 'member', id: member, role: 'owner' };
  // Receipts are read loosely in tests (any): each assertion checks the status it expects first.
  const call = (name: string, args: unknown): Promise<any> => registry.execute(pool, name, args, { workspaceId: ws, actor });
  const approve = (actionId: string): Promise<any> => registry.approve(pool, actionId, { workspaceId: ws, memberId: member });
  return { ws, member, agentId, versionId, call, approve };
}

let phone = 9000000000;
/** Live (or test) conversations on a version, written the way calls writes them: n contacts, the first `successes` with
 *  the goal value 'confirmed' (outcome_definition 'visit'), the rest 'declined'; reason codes from the catalogue. */
async function calls(ws: string, versionId: string, n: number, successes: number, o: { reasonCode?: string; channel?: string; outcome?: (i: number) => string | null; contactIds?: string[] } = {}) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const contact = o.contactIds?.[i] ?? (await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164) VALUES ($1,$2) RETURNING id', [ws, `+91${phone++}`]))!.id;
    const outcome = o.outcome ? o.outcome(i) : i < successes ? 'confirmed' : 'declined';
    const c = await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, contact_id, agent_version_id, channel, status, outcome, reason_code, started_at)
      VALUES ($1,$2,$3,$4,'done',$5,$6, now()) RETURNING id`, [ws, contact, versionId, o.channel ?? 'phone', outcome, o.reasonCode ?? null]);
    ids.push(c!.id);
  }
  return ids;
}

async function newContacts(ws: string, n: number) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push((await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164) VALUES ($1,$2) RETURNING id', [ws, `+91${phone++}`]))!.id);
  return out;
}

function fakeProposals(evidenceId: string, extra: unknown[] = []) {
  setFakeLlm(req => {
    assert.equal(req.purpose, 'learning'); assert.equal(req.json, true);
    return { text: JSON.stringify({ proposals: [
      { kind: 'opening', rationale: 'callers leave before hearing why we called', change: [{ op: 'set', path: 'opening.usefulFirst', value: 'your AC visit on 24 October is ready to confirm' }], evidenceIds: [evidenceId] },
      ...extra,
    ] }), toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, model: 'fake', provider: 'fake' };
  });
}

/** Draft -> probe -> accept (approved) -> start (approved), with a given design. */
async function runningExperiment(t: Awaited<ReturnType<typeof workspace>>, design: Record<string, unknown>) {
  const [evidence] = await calls(t.ws, t.versionId, 150, 30);
  fakeProposals(evidence!);
  const drafted = await t.call('learning.propose', { agentId: t.agentId, max: 1 });
  const pid = drafted.result.proposals[0].id;
  assert.equal((await t.call('proposal.probe', { proposalId: pid })).result.status, 'awaiting_approval');
  const acc = await t.call('proposal.accept', { proposalId: pid, ...design });
  assert.equal(acc.status, 'needs_approval');
  const accepted = await t.approve(acc.actionId);
  assert.equal(accepted.status, 'confirmed', JSON.stringify(accepted));
  const st = await t.call('experiment.start', { experimentId: accepted.result.experimentId });
  const started = await t.approve(st.actionId);
  assert.equal(started.status, 'confirmed', JSON.stringify(started));
  assert.equal(started.result.state, 'running', JSON.stringify(started.result));
  return { pid, accepted: accepted.result, started: started.result, experimentId: accepted.result.experimentId as string };
}

/** Simulate the dialer: each contact meets the version experiment.assign gives it. */
async function dial(t: Awaited<ReturnType<typeof workspace>>, contacts: string[], outcome: (arm: string, i: number) => string, reason?: (arm: string, i: number) => string | null) {
  const arms: Record<string, number> = { control: 0, treatment: 0 };
  for (const [i, c] of contacts.entries()) {
    const a = await t.call('experiment.assign', { agentId: t.agentId, contactId: c });
    assert.equal(a.status, 'confirmed');
    const arm = a.result.arm as string;
    const k = arms[arm]!++;
    await pool.query(`INSERT INTO conversation (workspace_id, contact_id, agent_version_id, channel, status, outcome, reason_code) VALUES ($1,$2,$3,'phone','done',$4,$5)`,
      [t.ws, c, a.result.versionId, outcome(arm, k), reason?.(arm, k) ?? null]);
    void i;
  }
  return arms;
}

type Tally = { dialed: Record<string, number>; outcomes: Record<string, number> };

/** Dial fresh contacts one at a time (arm from experiment.assign, i.e. the real sticky hash) until `enough` says both arms
 *  have what the test needs. Arm sizes are then a fact the test asserts, never a hope about a random split. */
async function dialUntil(t: Awaited<ReturnType<typeof workspace>>, enough: (s: Tally) => boolean,
  outcome: (arm: string, i: number) => string | null, reason?: (arm: string, i: number) => string | null, max = 2000): Promise<Tally> {
  const s: Tally = { dialed: { control: 0, treatment: 0 }, outcomes: { control: 0, treatment: 0 } };
  for (let n = 0; !enough(s); n++) {
    assert.ok(n < max, `arms never reached the target after ${max} contacts: ${JSON.stringify(s)}`);
    const [c] = await newContacts(t.ws, 1);
    const a = await t.call('experiment.assign', { agentId: t.agentId, contactId: c });
    assert.equal(a.status, 'confirmed'); assert.ok(a.result, 'the experiment must be running');
    const arm = a.result.arm as string;
    const k = s.dialed[arm]!++;
    const o = outcome(arm, k);
    if (o !== null) s.outcomes[arm]!++;
    await pool.query(`INSERT INTO conversation (workspace_id, contact_id, agent_version_id, channel, status, outcome, reason_code) VALUES ($1,$2,$3,'phone','done',$4,$5)`,
      [t.ws, c, a.result.versionId, o, reason?.(arm, k) ?? null]);
  }
  return s;
}
const bothReach = (n: number) => (s: Tally) => s.outcomes.control! >= n && s.outcomes.treatment! >= n;

test('gates: locked sections, provenance, manipulation and never-say block a change', () => {
  const base = cfg('00000000-0000-0000-0000-000000000001');
  assert.equal(runGates(base, [{ op: 'set', path: 'opening.usefulFirst', value: 'aapki AC visit 24 October ko hai' }]).passed, true);
  assert.match(runGates(base, [{ op: 'set', path: 'opening.disclosureClause', value: 'Riya here' }]).failures[0]!.gate, /editable_paths/);
  assert.equal(runGates(base, [{ op: 'set', path: 'opening.usefulFirst', value: 'only 299 today' }]).failures.some(f => f.gate === 'provenance'), true);
  assert.equal(runGates(base, [{ op: 'set', path: 'opening.usefulFirst', value: 'sirf aaj ke liye, warna slot chala jayega' }]).failures.some(f => f.gate === 'manipulation'), true);
  assert.equal(runGates(base, [{ op: 'set', path: 'objections.0.approach', value: 'say results are guaranteed' }]).failures.some(f => f.gate === 'never_say'), true);
  assert.equal(runGates(base, [{ op: 'reorder_facts', order: ['visit_fee', 'visit_date'] }]).passed, true);
  assert.equal(runGates(base, [{ op: 'reorder_facts', order: ['visit_fee'] }]).failures[0]!.gate, 'apply');
  assert.equal(runGates(base, [{ op: 'set', path: 'limits.maxSilenceS', value: 90 }]).passed, false);
  assert.equal(runGates(base, [{ op: 'set', path: 'tools.0.config.guidance', value: 'offer a callback when they are driving' }]).passed, true);
});

test('propose: evidence is cited, and a change that fails a gate or cites nothing real is gated out', { skip }, async () => {
  const t = await workspace();
  const [evidence] = await calls(t.ws, t.versionId, 5, 1);
  fakeProposals(evidence!, [
    { kind: 'opening', rationale: 'x', change: [{ op: 'set', path: 'opening.usefulFirst', value: 'sirf aaj, jaldi karo' }], evidenceIds: [evidence] },
    { kind: 'opening', rationale: 'x', change: [{ op: 'set', path: 'opening.disclosureClause', value: 'Hi' }], evidenceIds: [evidence] },
    { kind: 'objection', rationale: 'x', change: [{ op: 'set', path: 'objections.0.approach', value: 'ask when is better' }], evidenceIds: ['00000000-0000-0000-0000-00000000dead'] },
  ]);
  const r = await t.call('learning.propose', { agentId: t.agentId });
  assert.equal(r.status, 'confirmed', JSON.stringify(r));
  const statuses = r.result.proposals.map((p: any) => p.status);
  assert.deepEqual(statuses, ['drafted', 'gated_out', 'gated_out']);   // max 3 by default
  assert.deepEqual(r.result.proposals[0].cited, [evidence]);
  assert.equal(r.result.proposals[1].failures[0].gate, 'manipulation');
  assert.equal(r.result.proposals[2].failures[0].gate, 'editable_paths');

  fakeProposals(evidence!, []);
  setFakeLlm(() => ({ text: JSON.stringify({ proposals: [{ kind: 'objection', rationale: 'x', change: [{ op: 'set', path: 'objections.0.approach', value: 'ask when is better' }], evidenceIds: ['nope'] }] }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }));
  const r2 = await t.call('learning.propose', { agentId: t.agentId });
  assert.equal(r2.result.proposals[0].failures[0].gate, 'evidence');
  const gated = await t.call('proposal.probe', { proposalId: r2.result.proposals[0].id });
  assert.equal(gated.status, 'not_executed', 'a gated-out proposal cannot be probed');
});

test('probe: same callers and seeds on both versions; a regression rejects the proposal and becomes a lesson', { skip }, async () => {
  const t = await workspace();
  const [evidence] = await calls(t.ws, t.versionId, 5, 1);
  fakeProposals(evidence!, [{ kind: 'opening', rationale: 'slower', change: [{ op: 'set', path: 'opening.usefulFirst', value: 'speak slowly about the visit' }], evidenceIds: [evidence] }]);
  const r = await t.call('learning.propose', { agentId: t.agentId });
  const [good, bad] = r.result.proposals;
  const g = await t.call('proposal.probe', { proposalId: good.id, seeds: [1, 2] });
  assert.equal(g.result.status, 'awaiting_approval', JSON.stringify(g));
  assert.equal(g.result.verdict.pairs, 4);   // 2 callers x 2 seeds
  const b = await t.call('proposal.probe', { proposalId: bad.id });
  assert.equal(b.result.status, 'rejected');
  assert.match(b.result.verdict.regressions.join(' '), /hung_up|pass count/);
  const row = await one<{ status: string; simulation: any }>(pool, 'SELECT status, simulation FROM proposal WHERE id = $1', [bad.id]);
  assert.equal(row!.status, 'rejected'); assert.equal(row!.simulation.label, 'simulated, not proved');
  const lessons = await t.call('lesson.list', { agentId: t.agentId });
  assert.ok(lessons.result.some((l: any) => l.status === 'rejected'));
  // The tenant library refuses to re-propose what this workspace already rejected.
  fakeProposals(evidence!, []);
  setFakeLlm(() => ({ text: JSON.stringify({ proposals: [{ kind: 'opening', rationale: 'again', change: [{ op: 'set', path: 'opening.usefulFirst', value: 'speak slowly about the visit' }], evidenceIds: [evidence] }] }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }));
  assert.equal((await t.call('learning.propose', { agentId: t.agentId })).result.proposals[0].status, 'skipped');
});

test('accept is A2 and shows calls-to-prove from the workspace\'s own baseline before launch', { skip }, async () => {
  const t = await workspace();
  const [evidence] = await calls(t.ws, t.versionId, 100, 20);    // own baseline 20%
  fakeProposals(evidence!);
  const pid = (await t.call('learning.propose', { agentId: t.agentId, max: 1 })).result.proposals[0].id;
  const early = await t.call('proposal.accept', { proposalId: pid });
  assert.equal(early.status, 'needs_approval');
  assert.equal((await t.approve(early.actionId)).status, 'not_executed', 'an unprobed proposal cannot be tested');
  await t.call('proposal.probe', { proposalId: pid });
  const acc = await t.call('proposal.accept', { proposalId: pid, mdeAbs: 0.05 });
  assert.equal(acc.status, 'needs_approval');
  assert.equal((await one(pool, 'SELECT 1 FROM experiment WHERE workspace_id = $1', [t.ws])), null, 'nothing runs before a person approves');
  const ok = await t.approve(acc.actionId);
  assert.equal(ok.status, 'confirmed', JSON.stringify(ok));
  assert.equal(ok.result.callsToProve, powerPlan(0.2, 0.05).total);   // 2,188
  assert.equal(ok.result.baseline, 0.2);
  const e = await t.call('experiment.get', { id: ok.result.experimentId });
  assert.equal(e.result.state, 'aa_pending'); assert.equal(e.result.callsToProve, 2188);
  assert.ok(e.result.design.preregistrationHash);
  const p = await one<{ calls_to_prove: number; status: string }>(pool, 'SELECT calls_to_prove, status FROM proposal WHERE id = $1', [pid]);
  assert.deepEqual([p!.calls_to_prove, p!.status], [2188, 'testing']);
});

test('shadow A/A gates the launch: missing outcomes fail the plumbing check; clean history launches', { skip }, async () => {
  const broken = await workspace();
  const [ev] = await calls(broken.ws, broken.versionId, 200, 40, { outcome: i => (i % 20 ? null : 'confirmed') });   // outcomes on 5% of calls: a broken writer
  fakeProposals(ev!);
  const pid = (await broken.call('learning.propose', { agentId: broken.agentId, max: 1 })).result.proposals[0].id;
  await broken.call('proposal.probe', { proposalId: pid });
  const acc = await broken.approve((await broken.call('proposal.accept', { proposalId: pid, baselineRate: 0.2, mdeAbs: 0.1 })).actionId);
  const st = await broken.approve((await broken.call('experiment.start', { experimentId: acc.result.experimentId })).actionId);
  assert.equal(st.result.state, 'aa_failed'); assert.equal(st.result.launched, false);
  assert.match(st.result.reasons.join(' '), /outcome writer/);
  assert.ok(await one(pool, "SELECT 1 FROM issue WHERE workspace_id = $1 AND category = 'learning.aa_plumbing'", [broken.ws]));
  assert.equal((await broken.call('experiment.assign', { agentId: broken.agentId, contactId: (await newContacts(broken.ws, 1))[0] })).result, null);

  const t = await workspace();
  const { started, experimentId } = await runningExperiment(t, { baselineRate: 0.2, mdeAbs: 0.1, minDays: 0 });
  assert.equal(started.state, 'running'); assert.equal(started.launched, true);
  assert.ok(started.shadowAA.falseWinnerRate <= 0.1);
  const aa = await one<{ runs: number; passed: boolean; experiment_id: string }>(pool, 'SELECT runs, passed, experiment_id FROM shadow_aa WHERE workspace_id = $1', [t.ws]);
  assert.deepEqual([aa!.runs, aa!.passed, aa!.experiment_id], [1000, true, experimentId]);
});

test('sticky arms; no verdict before the horizon (no peeking); a win is proposed for publish, never published', { skip }, async () => {
  const t = await workspace();
  const { experimentId, accepted } = await runningExperiment(t, { baselineRate: 0.2, mdeAbs: 0.3, minDays: 0 });
  const perArm = accepted.perArm as number;
  const c = (await newContacts(t.ws, 1))[0]!;
  const a1 = await t.call('experiment.assign', { agentId: t.agentId, contactId: c });
  for (let i = 0; i < 3; i++) assert.deepEqual((await t.call('experiment.assign', { agentId: t.agentId, contactId: c })).result, a1.result);

  // Phase 1: perArm contacts in total cannot fill both arms to perArm, so the horizon is not reached by construction.
  const half = await newContacts(t.ws, perArm);
  await dial(t, half, (arm, i) => (arm === 'treatment' ? (i % 10 < 8 ? 'confirmed' : 'declined') : (i % 10 < 2 ? 'confirmed' : 'declined')));
  const mid = await t.call('experiment.check', { experimentId });
  assert.equal(mid.result.state, 'running');
  assert.equal(mid.result.decision, undefined, 'no effect is computed before the horizon');
  assert.ok(mid.result.remainingCalls > 0);
  const view = await t.call('experiment.get', { id: experimentId });
  assert.equal(view.result.result.decision, undefined);

  // Phase 2: keep dialing (same outcome pattern, continuing each arm's index) until both arms reach the horizon.
  const already = (await one<{ c: number; t: number }>(pool, `SELECT count(*) FILTER (WHERE agent_version_id = e.control_version_id)::int AS c,
      count(*) FILTER (WHERE agent_version_id = e.treatment_version_id)::int AS t FROM conversation, experiment e WHERE e.id = $1 AND conversation.workspace_id = $2 AND conversation.started_at >= e.started_at`, [experimentId, t.ws]))!;
  const offset: Record<string, number> = { control: already.c, treatment: already.t };
  await dialUntil(t, s => s.outcomes.control! + offset.control! >= perArm && s.outcomes.treatment! + offset.treatment! >= perArm,
    (arm, i) => { const j = i + offset[arm]!; return arm === 'treatment' ? (j % 10 < 8 ? 'confirmed' : 'declined') : (j % 10 < 2 ? 'confirmed' : 'declined'); });
  // Test calls never count, even a flood of complaints on the treatment arm.
  const tv = (await one<{ id: string }>(pool, 'SELECT treatment_version_id AS id FROM experiment WHERE id = $1', [experimentId]))!.id;
  await calls(t.ws, tv, 10, 0, { channel: 'test', reasonCode: 'CONV_COMPLAINT' });
  const done = await t.call('experiment.check', { experimentId });
  assert.equal(done.result.state, 'decided', JSON.stringify(done.result));
  assert.ok(done.result.decision.control.n >= perArm && done.result.decision.treatment.n >= perArm, 'both arms reached the horizon');
  assert.equal(done.result.verdict, 'win');
  assert.ok(done.result.decision.ci.lo > 0);
  assert.equal(done.result.publish.status, 'needs_approval');
  const action = await one<{ status: string; tool: string; args: any }>(pool, 'SELECT status, tool, args FROM action WHERE id = $1', [done.result.publish.actionId]);
  assert.deepEqual([action!.tool, action!.status], ['deployment.split', 'proposed']);
  assert.deepEqual(action!.args, { agentId: t.agentId, binding: 'campaign', split: [{ versionId: tv, percent: 100 }] });
  const lessons = await t.call('lesson.list', { agentId: t.agentId });
  assert.ok(lessons.result.some((l: any) => l.status === 'won' && /proved on \d+ calls/.test(l.text)));
  assert.equal((await t.call('experiment.assign', { agentId: t.agentId, contactId: c })).result, null, 'a decided experiment sends no more traffic');
});

test('hazard stop: complaints on the treatment arm stop it at once and revert through the A3 verb', { skip }, async () => {
  const t = await workspace();
  const { experimentId } = await runningExperiment(t, { baselineRate: 0.2, mdeAbs: 0.05, minDays: 0, binding: 'inbound' });
  const arms = await dialUntil(t, s => s.dialed.treatment! >= 5 && s.dialed.control! >= 5, () => 'declined', arm => (arm === 'treatment' ? 'END_OPTED_OUT' : null));
  assert.ok(arms.dialed.treatment! >= 5);
  const contacts = await newContacts(t.ws, 1);
  const before = reverts.length;
  assert.ok(jobs.find(j => j.name === 'learning.check'), 'learning.check is a registered job');
  // The job body, scoped to this workspace: unscoped it would check every suite's experiments on the shared database.
  assert.deepEqual(await checkRunning({ pool, registry }, { workspaceId: t.ws }), { checked: 1 });
  const r = await t.call('experiment.check', { experimentId });
  assert.equal(r.result.state, 'stopped_guardrail', JSON.stringify(r.result));
  const stored = await one<{ result: any }>(pool, 'SELECT result FROM experiment WHERE id = $1', [experimentId]);
  assert.equal(stored!.result.revert.status, 'confirmed');
  assert.deepEqual(reverts.slice(before), [{ ws: t.ws, agentId: t.agentId, binding: 'inbound' }]);
  const audit = await one<{ payload: any }>(pool, "SELECT payload FROM audit_event WHERE workspace_id = $1 AND action = 'deployment.revert_to_last_good'", [t.ws]);
  assert.equal(audit!.payload.mode, 'A3');
  assert.ok(await one(pool, "SELECT 1 FROM issue WHERE workspace_id = $1 AND category = 'learning.guardrail_stop' AND severity = 'critical'", [t.ws]));
  assert.equal((await t.call('experiment.assign', { agentId: t.agentId, contactId: contacts[0] })).result, null);
  const lessons = await t.call('lesson.list', { agentId: t.agentId });
  assert.ok(lessons.result.some((l: any) => l.status === 'stopped'));
});

test('a safety violation in the treatment arm stops it; a person can stop a test too', { skip }, async () => {
  const t = await workspace();
  const { experimentId } = await runningExperiment(t, { baselineRate: 0.2, mdeAbs: 0.05, minDays: 0 });
  const tv = (await one<{ id: string }>(pool, 'SELECT treatment_version_id AS id FROM experiment WHERE id = $1', [experimentId]))!.id;
  await dialUntil(t, x => x.dialed.treatment! >= 1, () => 'declined');          // a contact the experiment placed in the treatment arm
  await pool.query(`UPDATE conversation SET analysis = '{"safety_violation": true}' WHERE id = (SELECT id FROM conversation WHERE workspace_id = $1 AND agent_version_id = $2 ORDER BY started_at DESC LIMIT 1)`, [t.ws, tv]);
  const r = await t.call('experiment.check', { experimentId });
  assert.equal(r.result.state, 'stopped_guardrail'); assert.match(r.result.reason, /safety/);

  const t2 = await workspace();
  const e2 = await runningExperiment(t2, { baselineRate: 0.2, mdeAbs: 0.05, minDays: 0 });
  const s = await t2.call('experiment.stop', { experimentId: e2.experimentId, reason: 'season changed' });
  assert.equal(s.result.state, 'stopped_manual');
});

test('no pooling: another workspace cannot read, change or contaminate this workspace\'s learning', { skip }, async () => {
  const a = await workspace();
  const b = await workspace();
  const { experimentId, pid } = await runningExperiment(a, { baselineRate: 0.2, mdeAbs: 0.05, minDays: 0 });
  assert.equal((await b.call('proposal.get', { id: pid })).result, null);
  assert.equal((await b.call('experiment.check', { experimentId })).status, 'not_executed');
  assert.equal((await b.call('experiment.stop', { experimentId, reason: 'not yours' })).status, 'not_executed');
  assert.equal((await b.call('experiment.list', {})).result.length, 0);
  assert.equal((await b.call('lesson.list', {})).result.length, 0);
  assert.equal((await b.call('experiment.assign', { agentId: a.agentId, contactId: (await newContacts(b.ws, 1))[0] })).result, null);
  const acc = await b.call('proposal.accept', { proposalId: pid });
  assert.equal(acc.status, 'needs_approval');
  assert.equal((await b.approve(acc.actionId)).status, 'not_executed');

  // Rows in workspace B that point at A's versions (a cross-tenant bug elsewhere) never reach A's readout.
  const e = await one<{ control: string; treatment: string }>(pool, 'SELECT control_version_id AS control, treatment_version_id AS treatment FROM experiment WHERE id = $1', [experimentId]);
  await calls(b.ws, e!.treatment, 20, 0, { reasonCode: 'CONV_COMPLAINT' });
  const r = await a.call('experiment.check', { experimentId });
  assert.equal(r.result.state, 'running', JSON.stringify(r.result));
  assert.deepEqual([r.result.progress.control, r.result.progress.treatment, r.result.progress.withoutOutcome], [0, 0, 0]);

  // A's baseline comes from A's calls only, even when B has many successes on A's version id.
  const c = await workspace();
  await calls(b.ws, c.versionId, 200, 200);
  const [ev] = await calls(c.ws, c.versionId, 50, 5);
  fakeProposals(ev!);
  const cp = (await c.call('learning.propose', { agentId: c.agentId, max: 1 })).result.proposals[0].id;
  await c.call('proposal.probe', { proposalId: cp });
  const ok = await c.approve((await c.call('proposal.accept', { proposalId: cp })).actionId);
  assert.equal(ok.result.baseline, 0.1, 'baseline 5/50 from own calls, not pooled');
  const shared = await many(pool, 'SELECT 1 FROM lesson WHERE workspace_id = $1', [b.ws]);
  assert.equal(shared.length, 0);
});

test('propose degrades when the model is unavailable', { skip }, async () => {
  const t = await workspace();
  await calls(t.ws, t.versionId, 3, 1);
  const { LlmError } = await import('../server/llm.ts');
  setFakeLlm(() => { throw new LlmError('no model is configured for learning', false); });
  const r = await t.call('learning.propose', { agentId: t.agentId });
  assert.equal(r.result.status, 'llm_unavailable');
});

test('without version.candidate the experiment is pre-registered but start refuses with a plain reason', { skip }, async () => {
  const t = await workspace();
  const [evidence] = await calls(t.ws, t.versionId, 150, 30);
  const bare = buildApp(pool, [learning, { name: 'no-candidate', register(r) {
    r.register(tool(obj({ agentId: uuid(), config: any(), simCallerIds: any(), seeds: any() }), { name: 'test.simulate_batch', risk: 'test', summary: 'fake',
      run: async (_c, i) => ({ runs: (i.simCallerIds as string[]).flatMap(id => (i.seeds as number[]).map(seed => ({ simCallerId: id, seed, passed: true }))) }) }));
  } }]);
  try {
    const call = (n: string, a: unknown): Promise<any> => bare.registry.execute(pool, n, a, { workspaceId: t.ws, actor: { type: 'member', id: t.member, role: 'owner' } });
    const approve = (id: string): Promise<any> => bare.registry.approve(pool, id, { workspaceId: t.ws, memberId: t.member });
    fakeProposals(evidence!);
    const pid = (await call('learning.propose', { agentId: t.agentId, max: 1 })).result.proposals[0].id;
    assert.equal((await call('proposal.probe', { proposalId: pid })).result.status, 'awaiting_approval');
    const acc = await approve((await call('proposal.accept', { proposalId: pid, baselineRate: 0.2, mdeAbs: 0.1 })).actionId);
    assert.equal(acc.status, 'confirmed'); assert.equal(acc.result.treatmentVersionId, null); assert.match(acc.result.treatmentPending, /version.candidate/);
    const st = await approve((await call('experiment.start', { experimentId: acc.result.experimentId })).actionId);
    assert.equal(st.result.launched, false); assert.match(st.result.reason, /version.candidate is not registered/);
    const n = await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM agent_version WHERE agent_id = $1', [t.agentId]);
    assert.equal(n!.n, '1', 'learning never writes agent_version itself');
  } finally { bindLearning({ pool, registry }); }
});

test('cross-module: conversations written the way calls writes them trip the hazard stop and reach a decision', { skip }, async () => {
  // Calls writes catalogue reason codes (END_OPTED_OUT, CONV_COMPLAINT, END_CRISIS) and, in conversation.outcome, a value
  // from the business's own outcome_definition, or NULL when only an untrusted AI guess exists. The success values come
  // from goal_values of the definition on the campaign that runs this agent (not the goal key), found without being passed.
  const setup = async () => {
    const t = await workspace();
    const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values)
      VALUES ($1, 'renewal', 'Did they renew?', '{paid,promised,refused}', '{paid}') RETURNING id`, [t.ws]))!.id;
    const dep = (await one<{ id: string }>(pool, `INSERT INTO deployment (workspace_id, agent_id, binding, split) VALUES ($1,$2,'campaign',$3) RETURNING id`,
      [t.ws, t.agentId, JSON.stringify([{ version_id: t.versionId, percent: 100 }])]))!.id;
    await pool.query(`INSERT INTO campaign (workspace_id, name, deployment_id, call_category, outcome_definition_id) VALUES ($1,'renewals',$2,'service',$3)`, [t.ws, dep, def]);
    // History: 150 contacts, 30 paid, 100 refused, 20 with no trusted outcome (NULL) — those 20 are not counted.
    const [ev] = await calls(t.ws, t.versionId, 150, 0, { outcome: i => (i < 30 ? 'paid' : i < 130 ? 'refused' : null) });
    fakeProposals(ev!);
    const pid = (await t.call('learning.propose', { agentId: t.agentId, max: 1 })).result.proposals[0].id;
    await t.call('proposal.probe', { proposalId: pid });
    return { t, pid, def };
  };

  const { t, pid, def } = await setup();
  const acc = await t.approve((await t.call('proposal.accept', { proposalId: pid, mdeAbs: 0.3, minDays: 0 })).actionId);
  assert.equal(acc.status, 'confirmed', JSON.stringify(acc));
  assert.equal(acc.result.baseline, 30 / 130, 'baseline 30/130: the 20 calls without a trusted outcome are excluded');
  assert.match(acc.result.counting, /only calls with a recorded outcome/);
  const e = await one<{ design: any }>(pool, 'SELECT design FROM experiment WHERE id = $1', [acc.result.experimentId]);
  assert.deepEqual([e!.design.successValues, e!.design.outcomeDefinitionId], [['paid'], def]);
  assert.deepEqual(e!.design.hazardCodes, ['END_OPTED_OUT', 'CONV_COMPLAINT', 'END_CRISIS']);
  const st = await t.approve((await t.call('experiment.start', { experimentId: acc.result.experimentId })).actionId);
  assert.equal(st.result.state, 'running', JSON.stringify(st.result));

  // Decision: treatment pays 80%, control 20%; every fifth contact has no trusted outcome and must not count.
  const perArm = acc.result.perArm as number;
  const tally = await dialUntil(t, bothReach(perArm), (arm, i) => (i % 5 === 4 ? null : (arm === 'treatment' ? i % 10 < 8 : i % 10 < 2) ? 'paid' : 'refused'));
  assert.ok(tally.dialed.control! > tally.outcomes.control! && tally.dialed.treatment! > tally.outcomes.treatment!, 'some calls in each arm had no trusted outcome');
  const done = await t.call('experiment.check', { experimentId: acc.result.experimentId });
  assert.equal(done.result.state, 'decided', JSON.stringify(done.result));
  assert.equal(done.result.verdict, 'win');
  // Exactly the calls with an outcome are counted, and each arm reached the horizon.
  assert.deepEqual([done.result.decision.control.n, done.result.decision.treatment.n], [tally.outcomes.control, tally.outcomes.treatment]);
  assert.ok(done.result.decision.control.n >= perArm && done.result.decision.treatment.n >= perArm);
  assert.equal(done.result.publish.status, 'needs_approval');

  // Hazard: END_OPTED_OUT on the treatment arm stops it at once.
  const h = await setup();
  const acc2 = await h.t.approve((await h.t.call('proposal.accept', { proposalId: h.pid, mdeAbs: 0.05, minDays: 0 })).actionId);
  const st2 = await h.t.approve((await h.t.call('experiment.start', { experimentId: acc2.result.experimentId })).actionId);
  assert.equal(st2.result.state, 'running', JSON.stringify(st2.result));
  await dialUntil(h.t, s => s.dialed.treatment! >= 5 && s.dialed.control! >= 5, () => null, arm => (arm === 'treatment' ? 'END_OPTED_OUT' : null));
  const stop = await h.t.call('experiment.check', { experimentId: acc2.result.experimentId });
  assert.equal(stop.result.state, 'stopped_guardrail', JSON.stringify(stop.result));
  assert.match(stop.result.reason, /complaints\/opt-outs/);
});

test('probe falls back to the practice-caller library when the workspace has none of its own', { skip }, async () => {
  const t = await workspace();
  await pool.query('DELETE FROM sim_caller WHERE workspace_id = $1', [t.ws]);
  const [evidence] = await calls(t.ws, t.versionId, 5, 1);
  fakeProposals(evidence!);
  const pid = (await t.call('learning.propose', { agentId: t.agentId, max: 1 })).result.proposals[0].id;
  const before = simulated.length;
  const r = await t.call('proposal.probe', { proposalId: pid });
  assert.equal(r.result.status, 'awaiting_approval', JSON.stringify(r.result));
  assert.ok(r.result.verdict.pairs >= 2);
  assert.ok(simulated.length > before && simulated.slice(before).every(s => s.simCallerIds.every((id: string) => id.startsWith('default:'))), 'library callers were used');
});

test('success values are found through a campaign that names the agent version (campaign.agent_version_id), as campaigns store it', { skip }, async () => {
  const t = await workspace();
  await pool.query("DELETE FROM outcome_definition WHERE workspace_id = $1", [t.ws]);   // only the campaign's definition
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values)
    VALUES ($1, 'renewal', 'Did they renew?', '{renewed,not_renewed}', '{renewed}') RETURNING id`, [t.ws]))!.id;
  await pool.query(`INSERT INTO campaign (workspace_id, name, call_category, outcome_definition_id, agent_version_id) VALUES ($1,'Renewals','service',$2,$3)`, [t.ws, def, t.versionId]);
  const [ev] = await calls(t.ws, t.versionId, 40, 0, { outcome: i => (i < 10 ? 'renewed' : 'not_renewed') });
  fakeProposals(ev!);
  const pid = (await t.call('learning.propose', { agentId: t.agentId, max: 1 })).result.proposals[0].id;
  await t.call('proposal.probe', { proposalId: pid });
  const ok = await t.approve((await t.call('proposal.accept', { proposalId: pid, mdeAbs: 0.2 })).actionId);
  assert.equal(ok.status, 'confirmed', JSON.stringify(ok));
  assert.equal(ok.result.baseline, 0.25);
});

test('only contacts the experiment assigned are counted: other calls on the same versions never enter the readout', { skip }, async () => {
  const t = await workspace();
  const { experimentId } = await runningExperiment(t, { baselineRate: 0.2, mdeAbs: 0.3, minDays: 0 });
  const e = (await one<{ c: string; tr: string }>(pool, 'SELECT control_version_id AS c, treatment_version_id AS tr FROM experiment WHERE id = $1', [experimentId]))!;
  // Calls on the control and treatment versions that experiment.assign never placed (another campaign, inbound, a backdated start).
  await calls(t.ws, e.c, 40, 40);
  await calls(t.ws, e.tr, 10, 0, { reasonCode: 'CONV_COMPLAINT' });
  const tally = await dialUntil(t, s => s.dialed.control! >= 5 && s.dialed.treatment! >= 5, () => 'confirmed');
  const r = await t.call('experiment.check', { experimentId });
  assert.equal(r.result.state, 'running', JSON.stringify(r.result));
  assert.deepEqual([r.result.progress.control, r.result.progress.treatment], [tally.outcomes.control, tally.outcomes.treatment]);
});

test('a contact is never in two arms: the arm is stored at first assignment, and a contact seen on both versions is left out', { skip }, async () => {
  const t = await workspace();
  const { experimentId } = await runningExperiment(t, { baselineRate: 0.2, mdeAbs: 0.3, minDays: 0 });
  const e = (await one<{ c: string; tr: string }>(pool, 'SELECT control_version_id AS c, treatment_version_id AS tr FROM experiment WHERE id = $1', [experimentId]))!;
  const [c] = await newContacts(t.ws, 1);
  const first = (await t.call('experiment.assign', { agentId: t.agentId, contactId: c })).result;
  // Even if the split were changed later, the stored arm wins.
  await pool.query(`UPDATE experiment SET design = jsonb_set(design, '{treatmentShare}', $2::jsonb) WHERE id = $1`, [experimentId, first.arm === 'treatment' ? '0' : '1']);
  for (let i = 0; i < 3; i++) assert.deepEqual((await t.call('experiment.assign', { agentId: t.agentId, contactId: c })).result, first);
  // The contact reaches the other arm's version some other way (a second campaign): it is counted in neither arm.
  await calls(t.ws, first.arm === 'treatment' ? e.tr : e.c, 1, 1, { contactIds: [c!] });
  await calls(t.ws, first.arm === 'treatment' ? e.c : e.tr, 1, 1, { contactIds: [c!] });
  const r = await t.call('experiment.check', { experimentId });
  assert.deepEqual([r.result.progress.control, r.result.progress.treatment, r.result.progress.crossovers], [0, 0, 1]);
  const n = await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM experiment_assignment WHERE experiment_id = $1 AND contact_id = $2', [experimentId, c]);
  assert.equal(n!.n, 1, 'one stored arm per contact');
});

test('adopting a winner: once its 100% split is approved, the agent draft carries the change and a lesson says so; declining records it too', { skip }, async () => {
  for (const decision of ['approve', 'decline'] as const) {
    const t = await workspace();
    const { experimentId, accepted } = await runningExperiment(t, { baselineRate: 0.2, mdeAbs: 0.3, minDays: 0 });
    const perArm = accepted.perArm as number;
    await dialUntil(t, bothReach(perArm), (arm, i) => (arm === 'treatment' ? (i % 10 < 8 ? 'confirmed' : 'declined') : (i % 10 < 2 ? 'confirmed' : 'declined')));
    // The proposal came from a monitor issue (what proposeFromIssues records); adoption must say so on the issue.
    const issueId = (await one<{ id: string }>(pool, "INSERT INTO issue (workspace_id, category, severity, subject_type, detail) VALUES ($1,'Conversation','warning','monitor','{}') RETURNING id", [t.ws]))!.id;
    await pool.query(`UPDATE proposal SET evidence = evidence || jsonb_build_object('issueId', $2::text) WHERE id = (SELECT proposal_id FROM experiment WHERE id = $1)`, [experimentId, issueId]);
    const won = await t.call('experiment.check', { experimentId });
    assert.equal(won.result.verdict, 'win');
    const actionId = won.result.publish.actionId as string;
    if (decision === 'approve') assert.equal((await t.approve(actionId)).status, 'confirmed');
    else assert.equal(await registry.decline(pool, actionId, { workspaceId: t.ws, memberId: t.member }), true);
    const r = await t.call('experiment.check', { experimentId });
    const draft = (await one<{ draft: any }>(pool, 'SELECT draft FROM agent WHERE id = $1', [t.agentId]))!.draft;
    const lessons = (await t.call('lesson.list', { agentId: t.agentId })).result.map((l: any) => l.text).join(' | ');
    if (decision === 'approve') {
      assert.equal(r.result.adoption.status, 'adopted', JSON.stringify(r.result));
      assert.equal(draft.opening.usefulFirst, 'your AC visit on 24 October is ready to confirm', 'the next version is published from a draft that carries the change');
      assert.match(lessons, /Adopted/);
      const linked = (await one<{ detail: any; status: string }>(pool, 'SELECT detail, status FROM issue WHERE id = $1', [issueId]))!;
      assert.equal(linked.detail.adoptedChange?.experimentId, experimentId, 'the issue that started it records the adopted change');
      assert.match(linked.detail.adoptedChange.change, /What she says first/);
      assert.equal(linked.status, 'open', 'the issue stays open until its monitor sees the rate recover');
    } else {
      assert.equal(r.result.adoption.status, 'declined', JSON.stringify(r.result));
      assert.notEqual(draft.opening?.usefulFirst, 'your AC visit on 24 October is ready to confirm');
      assert.match(lessons, /not adopted/);
    }
  }
});

test('before anyone approves: readiness says what is missing, and the approval card says how many calls the test needs', { skip }, async () => {
  const t = await workspace();
  const [ev] = await calls(t.ws, t.versionId, 40, 10);
  fakeProposals(ev!);
  const pid = (await t.call('learning.propose', { agentId: t.agentId, max: 1 })).result.proposals[0].id;
  const r0 = await t.call('proposal.readiness', { proposalId: pid });
  assert.deepEqual([r0.result.ready, r0.result.fix], [false, 'probe']);
  await t.call('proposal.probe', { proposalId: pid });
  const r1 = await t.call('proposal.readiness', { proposalId: pid });
  assert.equal(r1.result.ready, true, JSON.stringify(r1.result));
  assert.match(r1.result.note, /starts once 100 calls have a recorded outcome \(60 more\)/);
  const card = await t.call('proposal.accept', { proposalId: pid });
  assert.match(card.summary, /needs about [\d,]+ calls with a recorded outcome \([\d,]+ on each version\) to prove 25\.0% -> 30\.0%/);
  // No outcome definition with goal values: the reason is given up front, in words.
  const u = await workspace();
  await pool.query('DELETE FROM outcome_definition WHERE workspace_id = $1', [u.ws]);
  const [ev2] = await calls(u.ws, u.versionId, 5, 1);
  fakeProposals(ev2!);
  const pid2 = (await u.call('learning.propose', { agentId: u.agentId, max: 1 })).result.proposals[0].id;
  await u.call('proposal.probe', { proposalId: pid2 });
  const r2 = await u.call('proposal.readiness', { proposalId: pid2 });
  assert.deepEqual([r2.result.ready, r2.result.fix], [false, 'outcome']);
  assert.match((await u.call('proposal.accept', { proposalId: pid2 })).summary, /cannot start yet: Say what counts as success/);
});

test('a change that does clearly worse on the goal is stopped before the horizon (always-valid test) and callers go back', { skip }, async () => {
  const t = await workspace();
  const { experimentId, accepted } = await runningExperiment(t, { baselineRate: 0.5, mdeAbs: 0.05, minDays: 0 });
  const perArm = accepted.perArm as number;
  // The change collapses the goal rate: 50% -> 5%. Far fewer calls than the horizon are enough to stop it.
  await dialUntil(t, bothReach(80), (arm, i) => (arm === 'treatment' ? (i % 20 === 0 ? 'confirmed' : 'declined') : (i % 2 === 0 ? 'confirmed' : 'declined')));
  assert.ok(80 < perArm);
  const before = reverts.length;
  const r = await t.call('experiment.check', { experimentId });
  assert.equal(r.result.state, 'stopped_guardrail', JSON.stringify(r.result));
  assert.match(r.result.reason, /doing worse on the goal/);
  assert.equal(reverts.length, before + 1, 'the A3 revert ran');
  assert.equal((await t.call('experiment.assign', { agentId: t.agentId, contactId: (await newContacts(t.ws, 1))[0] })).result, null);
});

test('an experiment never changes safety rules, the disclosure, hand-off or recording: only the editable parts differ', { skip }, async () => {
  const t = await workspace();
  const [ev] = await calls(t.ws, t.versionId, 5, 1);
  // Every attempt on a locked part is stopped by a gate before it can be tested.
  for (const path of ['opening.disclosureClause', 'handOff.when', 'recording.announce', 'neverSay', 'sectorPacks', 'category']) {
    setFakeLlm(() => ({ text: JSON.stringify({ proposals: [{ kind: 'opening', rationale: 'x', change: [{ op: 'set', path, value: path === 'recording.announce' ? false : [] }], evidenceIds: [ev] }] }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }));
    const p = (await t.call('learning.propose', { agentId: t.agentId, max: 1 })).result.proposals[0];
    assert.equal(p.status, 'gated_out', path);
  }
  // And a test that does start runs a treatment whose locked parts equal the current version's.
  const { experimentId } = await runningExperiment(t, { baselineRate: 0.2, mdeAbs: 0.3, minDays: 0 });
  const v = await one<{ c: any; tr: any }>(pool, `SELECT c.config->'agent' AS c, tr.config->'agent' AS tr FROM experiment e JOIN agent_version c ON c.id = e.control_version_id JOIN agent_version tr ON tr.id = e.treatment_version_id WHERE e.id = $1`, [experimentId]);
  for (const k of ['brand', 'category', 'sectorPacks', 'neverSay', 'handOff', 'recording', 'memory', 'voice', 'tools']) assert.deepEqual(v!.tr[k], v!.c[k], k);
  assert.equal(v!.tr.opening.disclosureClause, v!.c.opening.disclosureClause);
  assert.deepEqual([...v!.tr.facts].sort((a: any, b: any) => a.key.localeCompare(b.key)), [...v!.c.facts].sort((a: any, b: any) => a.key.localeCompare(b.key)));
});

test('concurrent checks of one experiment never starve the connection pool: a second check skips while one is running', { skip }, async () => {
  // Calls run experiment.check after every connected call, so checks of one experiment overlap. A check locks the
  // experiment row and may then call a sibling tool (the A3 revert here), which needs a second connection. If the other
  // checks wait for the row lock while holding the pool's remaining connections, nothing can move. On a pool of 2 this
  // hung for good before the fix; it is the cause of the loop e2e test's one 300 s timeout.
  const t = await workspace();
  const { experimentId } = await runningExperiment(t, { baselineRate: 0.5, mdeAbs: 0.05, minDays: 0 });
  await dialUntil(t, bothReach(80), (arm, i) => (arm === 'treatment' ? (i % 20 === 0 ? 'confirmed' : 'declined') : (i % 2 === 0 ? 'confirmed' : 'declined')));
  const small = createPool(URL_);
  (small.options as { max: number }).max = 2;
  bindLearning({ pool: small, registry });
  try {
    const actor: Actor = { type: 'member', id: t.member, role: 'owner' };
    const check = () => registry.execute<any>(small, 'experiment.check', { experimentId }, { workspaceId: t.ws, actor });
    const timeout = new Promise<'hung'>(res => setTimeout(() => res('hung'), 15_000).unref());
    const both = await Promise.race([Promise.all([check(), check()]), timeout]);
    assert.notEqual(both, 'hung', 'two concurrent checks on a pool of 2 deadlocked');
    const states = (both as any[]).map(r => r.result.state ?? r.result.busy);
    assert.ok(states.includes('stopped_guardrail'), JSON.stringify(both));
    const other = (both as any[]).find(r => r.result.state !== 'stopped_guardrail');
    if (other) assert.match(other.result.note, /another check/, 'the skipped check says why');
  } finally { bindLearning({ pool, registry }); void small.end().catch(() => {}); }
});

test('a new proposal is built on the live version, never on a running experiment\'s candidate', { skip }, async () => {
  const t = await workspace();
  const { started } = await runningExperiment(t, { baselineRate: 0.5, mdeAbs: 0.05, minDays: 0 });
  void started;
  const cand = await one<{ id: string }>(pool, "SELECT id FROM agent_version WHERE agent_id = $1 AND kind = 'candidate'", [t.agentId]);
  assert.ok(cand, 'the running test made a candidate version');
  const [evidence] = await calls(t.ws, t.versionId, 5, 1);
  fakeProposals(evidence!);
  const again = await t.call('learning.propose', { agentId: t.agentId, max: 1 });
  assert.equal(again.status, 'confirmed', JSON.stringify(again));
  const p = await one<{ base_version_id: string }>(pool, 'SELECT base_version_id FROM proposal WHERE id = $1', [again.result.proposals[0].id]);
  assert.equal(p!.base_version_id, t.versionId, 'the base is version 1, the live one');
});
