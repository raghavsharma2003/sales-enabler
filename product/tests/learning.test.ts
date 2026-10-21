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
import { any, obj, str, uuid } from '../shared/validate.ts';
import type { Job } from '../server/jobs.ts';
import type { AgentConfig } from '../shared/agent-config.ts';
import { bindLearning, module as learning } from '../server/modules/learning/index.ts';
import { runGates } from '../server/modules/learning/gates.ts';
import { powerPlan } from '../server/modules/learning/stats.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let registry: Registry;
const reverts: { ws: string; agentId: string; binding: string }[] = [];

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
        const runs = (i.simCallerIds as string[]).flatMap(id => (i.seeds as number[]).map(seed => ({ simCallerId: id, seed, passed: !bad, metrics: { hung_up: bad ? 1 : 0, safety_violations: 0 } })));
        return { runs };
      } }));
    r.register(tool(versionCandidateIn, { name: 'version.candidate', risk: 'draft', summary: 'fake candidate version', run: versionCandidate }));
    r.register(tool(obj({ agentId: uuid(), binding: str() }), { name: 'deployment.revert_to_last_good', risk: 'external', summary: 'fake revert',
      run: async (ctx, i) => { reverts.push({ ws: ctx.workspaceId, agentId: i.agentId, binding: i.binding }); return { reverted: true }; } }));
    r.register(tool(obj({ agentId: uuid(), binding: str(), split: any() }), { name: 'deployment.split', risk: 'external', summary: 'fake split',
      run: async () => ({ deployed: true }) }));
  },
};

const versionCandidateIn = obj({ agentId: uuid(), config: any(), parentVersionId: uuid(), note: str() });
async function versionCandidate(ctx: { q: pg.PoolClient | pg.Pool; workspaceId: string }, i: ReturnType<typeof versionCandidateIn>) {
  const a = await one(ctx.q, 'SELECT 1 FROM agent WHERE id = $1 AND workspace_id = $2', [i.agentId, ctx.workspaceId]);
  if (!a) throw new Error('no such agent');
  const n = (await one<{ n: number }>(ctx.q, 'SELECT coalesce(max(number), 0) + 1 AS n FROM agent_version WHERE agent_id = $1', [i.agentId]))!.n;
  const v = await one<{ id: string }>(ctx.q, `INSERT INTO agent_version (agent_id, number, hash, parent_id, author_type, note, config) VALUES ($1,$2,'hc',$3,'system',$4,$5) RETURNING id`,
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
  const job = jobs.find(j => j.name === 'learning.check')!;
  await job.run({ pool, registry } as any);            // the background job checks every running experiment
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
  const [conv] = await calls(t.ws, tv, 1, 0);
  await pool.query(`UPDATE conversation SET analysis = '{"safety_violation": true}' WHERE id = $1`, [conv]);
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
  await h.t.approve((await h.t.call('experiment.start', { experimentId: acc2.result.experimentId })).actionId);
  await dialUntil(h.t, s => s.dialed.treatment! >= 5 && s.dialed.control! >= 5, () => null, arm => (arm === 'treatment' ? 'END_OPTED_OUT' : null));
  const stop = await h.t.call('experiment.check', { experimentId: acc2.result.experimentId });
  assert.equal(stop.result.state, 'stopped_guardrail', JSON.stringify(stop.result));
  assert.match(stop.result.reason, /complaints\/opt-outs/);
});
