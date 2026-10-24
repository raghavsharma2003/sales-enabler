// Blueprint decision 4, made honest (P7): every stack carries a speed and turn-taking gate status from staging
// measurements; the thresholds live in one config; the default stack's status follows its measurements; the gate never
// blocks a launch but the launch check names the numbers; a stack you build yourself stays test-calls-only until measured.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { GATE, MEASURES, gateStatus } from '../shared/stack-gate.ts';
import { cutInFigure, plainTraits } from '../shared/stack-traits.ts';
import { DEFAULT_STACK_ID, resolveStack, STACKS } from '../shared/stacks.ts';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';

test('the default stack\'s status follows its measurements against the one config', () => {
  assert.deepEqual(GATE, { replyGapP50Ms: 1500, cutInRateMax: 0.05 });
  const m = MEASURES[DEFAULT_STACK_ID];
  const g = gateStatus(DEFAULT_STACK_ID);
  const gapOk = !!m?.replyGapP50Ms && m.replyGapP50Ms.value <= GATE.replyGapP50Ms;
  const cutOk = !!m?.cutInRate && m.cutInRate.value <= GATE.cutInRateMax;
  const failsMeasured = (m?.replyGapP50Ms && !gapOk) || (m?.cutInRate && !cutOk);
  assert.equal(g.state, failsMeasured ? 'not_yet' : gapOk && cutOk ? 'meets' : 'not_measured');
  if (m?.replyGapP50Ms && !gapOk) assert.ok(g.label.includes(`${(m.replyGapP50Ms.value / 1000).toFixed(1)} s replies (target 1.5 s)`), g.label);
  assert.equal(g.label, 'Not yet: 3.2 s replies (target 1.5 s)', 'today: 3,201 ms median on 22 replies, 24 Oct 2026');
  assert.match(g.detail, /Not measured yet: cut-ins\./, 'an unmeasured cut-in rate is said, never read as zero');
});

test('every branch: meets, not yet on either number, not measured; and a built stack is never measured', () => {
  const saved = { ...MEASURES };
  const gap = (ms: number) => ({ value: ms, n: 30, calls: 5, date: '2026-10-25', source: 'test' });
  const cut = (r: number) => ({ value: r, n: 120, date: '2026-10-25', source: 'test' });
  try {
    MEASURES.t_ok = { replyGapP50Ms: gap(1400), cutInRate: cut(0.04) };
    MEASURES.t_cut = { replyGapP50Ms: gap(1400), cutInRate: cut(0.12) };
    MEASURES.t_both = { replyGapP50Ms: gap(2300), cutInRate: cut(0.08) };
    MEASURES.t_half = { replyGapP50Ms: gap(1200), cutInRate: null };
    assert.equal(gateStatus('t_ok').label, 'Meets the speed and turn-taking gate');
    assert.equal(gateStatus('t_cut').label, 'Not yet: 12% cut-ins (target at most 5%)');
    assert.equal(gateStatus('t_both').label, 'Not yet: 2.3 s replies (target 1.5 s), 8% cut-ins (target at most 5%)');
    assert.deepEqual([gateStatus('t_half').state, gateStatus('t_half').label], ['not_measured', 'Not measured']);
    assert.deepEqual([gateStatus('custom').state, gateStatus('nope').state], ['not_measured', 'not_measured']);
  } finally { for (const k of Object.keys(MEASURES)) if (!(k in saved)) delete MEASURES[k]; }
});

test('the reply gap a stack card shows is the measurement the gate reads', () => {
  for (const s of STACKS) {
    const m = MEASURES[s.id]?.replyGapP50Ms;
    if (!m) continue;
    assert.equal(s.replyGap.value, `${(m.value / 1000).toFixed(1)} s`, s.id);
    assert.equal(s.replyGap.grade, 'measured');
    assert.match(s.replyGap.source, new RegExp(`median of ${m.n} replies`));
  }
});

test('a stack you build yourself is beta (test calls only) until measured', () => {
  const built = resolveStack({ stackId: 'custom', components: { ears: 'azure', brain: 'gemini-3.5-flash-lite', voice: 'gemini-lite' } });
  assert.equal(built.status, 'beta');
  assert.equal(gateStatus(built.id).state, 'not_measured');
});

// ------------------------------------------------------------------------------------------------ database

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(); registry = buildApp(pool, modules).registry; });
after(async () => { await pool?.end(); });

async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('gate test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `g${Math.random()}@example.test`]))!.id;
  const as = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
  const ok = async (name: string, args: unknown) => {
    let r: any = await registry.execute<any>(pool, name, args, as);
    if (r.status === 'needs_approval') r = await registry.approve<any>(pool, r.actionId, { workspaceId: ws, memberId: owner });
    assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`);
    return r.result;
  };
  return { ws, ok, as };
}

async function campaignFor(w: Awaited<ReturnType<typeof world>>, voice: Record<string, unknown>) {
  const a = await w.ok('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' });
  const s = await w.ok('stack.set', { agentId: a.agentId, ...voice });
  const v = await w.ok('version.publish', { agentId: a.agentId, draftHash: s.draftHash });
  const d = await w.ok('campaign.draft', { name: 'Renewals', category: 'service', agentVersionId: v.versionId, capInrMilli: 5_000_000 });
  const audience = (await one<{ id: string }>(pool, "INSERT INTO audience (workspace_id, name) VALUES ($1, 'list') RETURNING id", [w.ws]))!.id;
  const c = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1, '+919000000077', 'Asha') RETURNING id", [w.ws]))!.id;
  await pool.query('INSERT INTO audience_member (audience_id, contact_id) VALUES ($1,$2)', [audience, c]);
  await pool.query('UPDATE campaign SET audience_id = $2 WHERE id = $1', [d.id, audience]);
  return w.ok('campaign.get', { id: d.id });
}

test('stack cards carry the gate; a production launch check names the numbers without blocking', { skip }, async () => {
  const w = await world();
  const list = await w.ok('stack.list', {});
  const def = list.stacks.find((x: { id: string }) => x.id === DEFAULT_STACK_ID);
  assert.deepEqual([def.gate.state, def.gate.label], ['not_yet', 'Not yet: 3.2 s replies (target 1.5 s)']);
  assert.deepEqual(def.gate.target, GATE);
  const g = await campaignFor(w, { stackId: DEFAULT_STACK_ID });
  const n = g.warnings.find((x: { code: string }) => x.code === 'stack_gate');
  assert.ok(n, JSON.stringify(g.warnings));
  assert.equal(n.message, "This agent's voice is slower than our target: 3.2 s replies (target 1.5 s).");
  assert.match(n.why, /median reply 3\.2 s over 22 replies \(24 Oct 2026\)\. Not measured yet: cut-ins\. Calls still go ahead/);
  assert.ok(!g.blockers.some((b: { code: string }) => b.code === 'stack_gate'), 'the gate never blocks a launch');
});

test('a built stack is still test calls only: its campaign is blocked as beta', { skip }, async () => {
  const w = await world();
  const g = await campaignFor(w, { stackId: 'custom', components: { ears: 'azure', brain: 'gemini-3.5-flash-lite', voice: 'gemini-lite' } });
  assert.ok(g.blockers.some((b: { code: string }) => b.code === 'beta_stack'), JSON.stringify(g.blockers));
});

// ------------------------------------------------------------------------------------------------ stack selection, finished

test('each stack says what it is good and weak at in plain words, with talking-over-the-caller as its own figure', () => {
  for (const s of STACKS) {
    const t = plainTraits(s);
    assert.ok(t.goodAt.length + t.weakAt.length > 0, `${s.id} says something`);
    for (const line of [...t.goodAt, ...t.weakAt]) assert.doesNotMatch(line, /\b(v2-|gemini-3|gpt-5|kb\d|stackId|p50|null)\b/i, `${s.id}: "${line}" is plain words`);
    const c = cutInFigure(s.id);
    if (!MEASURES[s.id]?.cutInRate) assert.deepEqual([c.value, c.grade], ['not measured', 'not_measured'], 'never read as zero');
  }
  const def = plainTraits(STACKS.find(s => s.id === DEFAULT_STACK_ID)!);
  assert.ok(def.weakAt.includes('Slower than our target: a median reply of 3.2 s on test calls, against 1.5 s'), JSON.stringify(def.weakAt));
  assert.ok(def.weakAt.includes('Google’s voice price doubles on 1 Jan 2027'), 'known risks are among the weak points');
  const built = resolveStack({ stackId: 'custom', components: { ears: 'azure', brain: 'gemini-3.5-flash-lite', voice: 'gemini-lite' } });
  assert.ok(plainTraits(built).weakAt.includes('Built from parts: test calls only until it has been measured'));
  const saved = { ...MEASURES };
  try {
    MEASURES[DEFAULT_STACK_ID] = { replyGapP50Ms: { value: 1300, n: 40, date: '2026-10-25', source: 'test' }, cutInRate: { value: 0.03, n: 200, date: '2026-10-25', source: 'test' } };
    assert.ok(plainTraits(STACKS.find(s => s.id === DEFAULT_STACK_ID)!).goodAt.includes('Meets the speed and turn-taking target on test calls'));
    assert.equal(cutInFigure(DEFAULT_STACK_ID).value, '3% of turns');
  } finally { Object.assign(MEASURES, saved); }
});

test('stack cards carry the cut-in figure and the traits; changing a published agent\'s stack is a new version, approved, named in words', { skip }, async () => {
  const w = await world();
  const card = (await w.ok('stack.list', {})).stacks.find((x: { id: string }) => x.id === 'v2-mai');
  assert.equal(card.cutIn.grade, 'not_measured');
  assert.ok(card.goodAt.includes('The fastest voice to start speaking'));
  const a = await w.ok('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' });
  const g1 = await w.ok('agent.get', { agentId: a.agentId });
  await w.ok('version.publish', { agentId: a.agentId, draftHash: g1.draftHash });
  const s = await w.ok('stack.set', { agentId: a.agentId, stackId: 'v2-mai' });
  const live = await one<{ number: number; config: { agent: { voice: { stackId: string } } } }>(pool, "SELECT number, config FROM agent_version WHERE agent_id = $1 AND kind = 'published' ORDER BY number DESC LIMIT 1", [a.agentId]);
  assert.equal(live!.config.agent.voice.stackId, DEFAULT_STACK_ID, 'the published version keeps its stack until the next publish');
  const r: any = await registry.execute(pool, 'version.publish', { agentId: a.agentId, draftHash: s.draftHash }, w.as);
  assert.equal(r.status, 'needs_approval', 'publishing the change needs a person\'s approval');
  assert.match(r.summary, /Changes since version 1: voice stack: Azure speech recognition \+ Gemini 3\.5 Flash-Lite \+ Gemini voice to Azure speech recognition \+ Gemini 3\.5 Flash-Lite \+ Azure MAI-Voice \(emotion styles\)/);
  assert.doesNotMatch(r.summary, /v2-|stackId|stack id/);
});
