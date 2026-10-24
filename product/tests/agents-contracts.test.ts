// Agents module contracts other modules call by name (learning first): brief.compile, test.simulate_batch,
// version.candidate, deployment.revert_to_last_good. Real Postgres (skipped without DATABASE_URL), scripted fake LLM.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import type { AgentConfig } from '../shared/agent-config.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import { Registry, type Actor, type Receipt } from '../server/tools.ts';
import { compile } from '../server/modules/agents/compile.ts';
import { module } from '../server/modules/agents/index.ts';
import { TEMPLATES } from '../server/modules/agents/templates.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
const reg = new Registry();
module.register(reg);
const SYSTEM: Actor = { type: 'system', id: 'learning' };

before(async () => { if (!skip) pool = createPool(URL_); });
after(async () => { await pool?.end(); });
afterEach(() => setFakeLlm(null));

async function workspace() {
  const ws = await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('agents contracts') RETURNING id");
  const m = await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1, $2, 'owner') RETURNING id", [ws!.id, `c${Math.random()}@example.test`]);
  const actor: Actor = { type: 'member', id: m!.id, role: 'owner' };
  const call = <O = any>(name: string, args: unknown, as: Actor = actor) => reg.execute<O>(pool, name, args, { workspaceId: ws!.id, actor: as });
  const approve = (r: Receipt) => reg.approve<any>(pool, (r as { actionId: string }).actionId, { workspaceId: ws!.id, memberId: m!.id });
  return { ws: ws!.id, member: m!.id, call, approve };
}
type W = Awaited<ReturnType<typeof workspace>>;

function ok<O>(r: Receipt<O>): O {
  assert.equal(r.status, 'confirmed', r.status !== 'confirmed' ? JSON.stringify(r) : '');
  return (r as { result: O }).result;
}
function refused(r: Receipt, rx: RegExp) {
  assert.equal(r.status, 'not_executed', JSON.stringify(r));
  assert.match((r as { reason: string }).reason, rx);
}

/** An agent with a chosen stack and one published version. */
async function published(w: W) {
  const c = ok<any>(await w.call('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' }));
  const s = ok<any>(await w.call('stack.set', { agentId: c.agentId, stackId: 'v2-flashlite' }));
  const v = ok<any>(await w.approve(await w.call('version.publish', { agentId: c.agentId, draftHash: s.draftHash })));
  return { agentId: c.agentId as string, v1: v };
}

const withStack = (): AgentConfig => ({ ...structuredClone(TEMPLATES[0].config), voice: { stackId: 'v2-flashlite' } });

test('brief.compile returns compile() exactly, and refuses lint and budget failures with the reason', { skip }, async () => {
  const w = await workspace();
  const cfg = withStack();
  assert.deepEqual(ok(await w.call('brief.compile', { config: cfg })), compile(cfg));
  assert.deepEqual(ok(await w.call('brief.compile', { config: cfg }, SYSTEM)), compile(cfg), 'the system actor (learning) may call it');

  const quoted = withStack(); quoted.persona.notes = ['opens with "namaste ji"'];
  const r = await w.call('brief.compile', { config: quoted });
  refused(r, /cannot compile/);
  assert.equal((r as { path?: string }).path, 'persona.notes[0]');

  const big = withStack();
  big.facts = Array.from({ length: 30 }, (_, i) => ({ key: `row_${i}`, value: 'x'.repeat(120), purpose: 'service' as const, source: 'test' }));
  const b = await w.call('brief.compile', { config: big });
  refused(b, /cut FACTS_ROWS/);
  assert.equal((b as { path?: string }).path, 'brief.FACTS_ROWS');

  refused(await w.call('brief.compile', { config: { ...cfg, surprise: true } }), /not a known field/);
});

/** A fake whose caller depends only on the seed in its prompt and the turn number: deterministic by construction. */
function seededFake() {
  const temps: (number | undefined)[] = [];
  setFakeLlm((req: LlmRequest) => {
    temps.push(req.temperature);
    const sys = req.messages[0].content;
    const turn = req.messages.length;
    if (sys.startsWith('You are role-playing')) {
      const seed = Number(/Run (\d+):/.exec(sys)?.[1] ?? -1);
      const text = seed % 2 === 0 ? (turn > 3 ? 'Busy hoon, bye <hangup>' : 'Haan?') : (turn > 3 ? 'Theek hai, link bhej do.' : 'Haan, boliye.');
      return { text, toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 }, model: 'fake', provider: 'fake' };
    }
    const text = turn <= 2 ? 'Rohit ji?' : turn <= 4 ? 'Riya here, Suraksha Health ki AI assistant; renewal 2 November ko hai.' : 'Link bhej rahi hoon, take care! <end_call>';
    return { text, toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 }, model: 'fake', provider: 'fake' };
  });
  return temps;
}

test('test.simulate_batch: seeded, repeatable, graded by code, metrics only where measured', { skip }, async () => {
  const w = await workspace();
  const { agentId } = await published(w);
  const ids: string[] = [];
  for (const persona of ['Rohit, busy, Hinglish', 'Meena, chatty, Hinglish']) {
    ids.push((await one<{ id: string }>(pool, `INSERT INTO sim_caller (workspace_id, agent_id, persona, scenario, hidden_keys, contact, pass_criteria)
      VALUES ($1,$2,$3,'renewal call','{}','{"premium":"18,450 rupees"}','{}') RETURNING id`, [w.ws, agentId, persona]))!.id);
  }
  const temps = seededFake();
  const args = { agentId, simCallerIds: ids, seeds: [1, 2] };
  const a = ok<any>(await w.call('test.simulate_batch', args, SYSTEM));
  const b = ok<any>(await w.call('test.simulate_batch', args, SYSTEM));
  assert.equal(a.runs.length, 4);
  assert.ok(temps.every(t => t === 0), 'seeded runs use temperature 0 on both sides');
  const strip = (x: any) => x.runs.map(({ runId: _r, ...rest }: any) => rest);
  assert.deepEqual(strip(a), strip(b), 'same seed and config give the same runs');
  const bySeed = (s: number) => a.runs.find((r: any) => r.seed === s && r.simCallerId === ids[0]);
  assert.deepEqual(bySeed(2).metrics, { hung_up: true, safety_violations: 0, disclosure_missed: false });
  assert.deepEqual(bySeed(1).metrics, { hung_up: false, safety_violations: 0, disclosure_missed: false });
  for (const r of a.runs) assert.ok(!('cut_ins' in r.metrics) && !('reply_gap_ms' in r.metrics), 'audio-timing metrics are omitted, never 0');
  const stored = await one<{ n: string; seeds: number[] }>(pool, 'SELECT count(*) AS n, array_agg(DISTINCT seed) AS seeds FROM agent_test_run WHERE agent_id = $1', [agentId]);
  assert.equal(stored!.n, '8');
  assert.deepEqual(stored!.seeds.sort(), [1, 2]);

  // A config other than the draft runs without touching the draft.
  const before = ok<any>(await w.call('agent.get', { agentId })).draftHash;
  const alt = { ...withStack(), agentId, persona: { ...withStack().persona, energy: 5 as const } };
  const c = ok<any>(await w.call('test.simulate_batch', { agentId, config: alt, simCallerIds: [ids[0]], seeds: [3] }, SYSTEM));
  assert.equal(c.briefHash, compile(alt).hash);
  assert.equal(ok<any>(await w.call('agent.get', { agentId })).draftHash, before);

  // A non-compiling config and another workspace's caller are refused before any model call.
  const n = temps.length;
  const bad = withStack(); bad.opening.usefulFirst = 'we have news';
  refused(await w.call('test.simulate_batch', { agentId, config: bad, simCallerIds: [ids[0]], seeds: [1] }, SYSTEM), /cannot compile/);
  const other = await workspace();
  const foreign = (await one<{ id: string }>(pool, "INSERT INTO sim_caller (workspace_id, persona, scenario) VALUES ($1, 'x', 'y') RETURNING id", [other.ws]))!.id;
  refused(await w.call('test.simulate_batch', { agentId, simCallerIds: [foreign], seeds: [1] }, SYSTEM), /no such simulated caller/);
  assert.equal(temps.length, n);
  refused(await w.call('test.simulate_batch', { agentId, simCallerIds: [ids[0]], seeds: [1, 2, 3, 4, 5, 6] }, SYSTEM), /at most 5/);
});

test('version.candidate creates an immutable, undeployed version compiled once, leaving the draft alone', { skip }, async () => {
  const w = await workspace();
  const { agentId, v1 } = await published(w);
  const draftBefore = ok<any>(await w.call('agent.get', { agentId })).draftHash;
  const treatment = { ...withStack(), persona: { ...withStack().persona, humour: 0 as const } };
  const cand = ok<any>(await w.call('version.candidate', { agentId, config: treatment, parentVersionId: v1.versionId, note: 'learning treatment' }, SYSTEM));
  assert.equal(cand.number, 2);
  assert.equal(cand.parentId, v1.versionId);
  const row = await one<{ hash: string; author_type: string; config: { agent: AgentConfig; brief: unknown } }>(pool, 'SELECT hash, author_type, config FROM agent_version WHERE id = $1', [cand.versionId]);
  assert.equal(row!.author_type, 'system');
  assert.equal(row!.config.agent.agentId, agentId);
  assert.equal(row!.config.agent.version, 2);
  assert.equal(row!.config.agent.versionHash, row!.hash);
  assert.deepEqual(row!.config.brief, compile(row!.config.agent));
  assert.deepEqual((row!.config as any).lint, { ok: true, findings: [], dropped: [] }, "campaigns' G10 reads config.lint.ok");
  const pub = await one<{ lint: { ok: boolean } }>(pool, "SELECT config->'lint' AS lint FROM agent_version WHERE id = $1", [v1.versionId]);
  assert.equal(pub!.lint.ok, true, 'version.publish stores it too');
  assert.deepEqual(cand.brief, { hash: compile(row!.config.agent).hash, bytes: compile(row!.config.agent).bytes });
  assert.equal(ok<any>(await w.call('agent.get', { agentId })).draftHash, draftBefore, 'the draft is untouched');
  assert.equal((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM deployment WHERE agent_id = $1', [agentId]))!.n, '0', 'not deployed');

  const lint = withStack(); lint.persona.notes = ['"hello"'];
  refused(await w.call('version.candidate', { agentId, config: lint, parentVersionId: v1.versionId, note: 'x' }, SYSTEM), /cannot compile/);
  refused(await w.call('version.candidate', { agentId, config: { ...treatment, voice: { stackId: '' } }, parentVersionId: v1.versionId, note: 'x' }, SYSTEM), /choose a voice stack/);
  const other = await published(w);
  refused(await w.call('version.candidate', { agentId, config: treatment, parentVersionId: other.v1.versionId, note: 'x' }, SYSTEM), /published version of this agent/);
  assert.equal((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM agent_version WHERE agent_id = $1', [agentId]))!.n, '2', 'refusals number nothing');
});

test('deployment.revert_to_last_good: A3 for the system and for a member, restores the previous split and says why', { skip }, async () => {
  const w = await workspace();
  const { agentId, v1 } = await published(w);
  refused(await w.call('deployment.revert_to_last_good', { agentId }, SYSTEM), /never been deployed/);
  ok(await w.approve(await w.call('deployment.split', { agentId, binding: 'campaign', split: [{ versionId: v1.versionId, percent: 100 }] })));
  refused(await w.call('deployment.revert_to_last_good', { agentId, binding: 'campaign' }, SYSTEM), /no earlier deployment/);

  const cand = ok<any>(await w.call('version.candidate', { agentId, config: withStack(), parentVersionId: v1.versionId, note: 'treatment' }, SYSTEM));
  const split = ok<any>(await w.approve(await w.call('deployment.split', { agentId, binding: 'campaign', split: [{ versionId: v1.versionId, percent: 50 }, { versionId: cand.versionId, percent: 50 }] })));

  // A3 verbs only lower risk: the system actor (a guardrail stop) and a member alike run it at once.
  const r = await w.call('deployment.revert_to_last_good', { agentId, reason: 'guardrail: opt-outs doubled' }, SYSTEM);
  assert.equal(r.status === 'confirmed' && r.mode, 'A3');
  const out = ok<any>(r);
  assert.equal(out.binding, 'campaign', 'no binding given: the most recently deployed one');
  assert.equal(out.replaced, split.deploymentId);
  assert.deepEqual(out.split, [{ version_id: v1.versionId, percent: 100 }]);
  const cur = await one<{ split: unknown }>(pool, "SELECT split FROM deployment WHERE agent_id = $1 AND binding = 'campaign' ORDER BY created_at DESC, id DESC LIMIT 1", [agentId]);
  assert.deepEqual(cur!.split, [{ version_id: v1.versionId, percent: 100 }]);
  const audit = await one<{ payload: any }>(pool, "SELECT payload FROM audit_event WHERE workspace_id = $1 AND action = 'deployment.reverted'", [w.ws]);
  assert.equal(audit!.payload.reason, 'guardrail: opt-outs doubled');
  ok(await w.approve(await w.call('deployment.split', { agentId, binding: 'campaign', split: [{ versionId: v1.versionId, percent: 50 }, { versionId: cand.versionId, percent: 50 }] })));
  const byMember = await w.call('deployment.revert_to_last_good', { agentId, binding: 'campaign' });
  assert.equal(byMember.status === 'confirmed' && byMember.mode, 'A3', 'a person reverting to last good does not wait for approval');

  const other = await workspace();
  refused(await other.call('deployment.revert_to_last_good', { agentId }, SYSTEM), /no such agent/);
});

test('an experiment candidate is never "the live version": agent.get names the live one, lists kinds, and publish and diff build on it', { skip }, async () => {
  // Readers that took "the newest version" as the live one picked an experiment's candidate: a new campaign or inbound
  // line would have run the untested change, a new proposal would have been built on it, and publish would have
  // parented the next version on it.
  const w = await workspace();
  const { agentId, v1 } = await published(w);
  const treatment = { ...withStack(), persona: { ...withStack().persona, humour: 0 as const } };
  const cand = ok<any>(await w.call('version.candidate', { agentId, config: treatment, parentVersionId: v1.versionId, note: 'learning treatment' }, SYSTEM));
  const g = ok<any>(await w.call('agent.get', { agentId }));
  assert.deepEqual(g.liveVersion && { id: g.liveVersion.id, number: g.liveVersion.number }, { id: v1.versionId, number: 1 }, JSON.stringify(g.versions));
  assert.deepEqual(g.versions.map((v: any) => [v.number, v.kind]), [[2, 'candidate'], [1, 'published']]);
  const listed = ok<any>(await w.call('agent.list', {})).agents.find((a: any) => a.id === agentId);
  assert.equal(listed.latest_version, 1, 'the list shows the published version number');
  assert.equal(listed.live_version_id, v1.versionId);
  assert.equal(ok<any>(await w.call('version.diff', { agentId })).from.label, 'version 1', 'the draft is compared with the live version');
  const card = await w.call('version.publish', { agentId, draftHash: g.draftHash, note: 'next' });
  assert.match((card as any).summary, /version 3/, 'numbering counts the candidate');
  assert.match((card as any).summary, /since version 1\b|the first version/, 'the card compares with the live version, not the candidate: ' + (card as any).summary);
  const v3 = ok<any>(await w.approve(card));
  assert.equal(v3.parentId, v1.versionId, 'the next published version descends from the live one, not the candidate');
  assert.equal(ok<any>(await w.call('agent.get', { agentId })).liveVersion.id, v3.versionId);
  // Rolling back to a candidate would publish an untested change to everyone: version.restore refuses it.
  const back = await w.call('version.restore', { agentId, versionId: cand.versionId, reason: 'test' });
  const backFinal = back.status === 'needs_approval' ? await w.approve(back) : back;
  assert.notEqual(backFinal.status, 'confirmed', JSON.stringify(backFinal));
  assert.match(JSON.stringify(backFinal), /not a published version/);
  // A candidate must descend from a published version, never from another candidate.
  refused(await w.call('version.candidate', { agentId, config: treatment, parentVersionId: cand.versionId, note: 'x' }, SYSTEM), /published version of this agent/);
});
