// Agents module tools against a real Postgres (skipped when DATABASE_URL is unset). Fresh workspaces per test, so the
// suite is safe to repeat on the same database. The LLM is always the scripted fake.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import type { AgentConfig } from '../shared/agent-config.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import { Registry, type Actor, type Receipt } from '../server/tools.ts';
import { verifyAudit } from '../server/audit.ts';
import { compile, markerRules, TAIL } from '../server/modules/agents/compile.ts';
import { versionHashOf } from '../server/modules/agents/config.ts';
import { forgetRuntimeHealth, module } from '../server/modules/agents/index.ts';
import { DEFAULT_STACK_ID } from '../shared/stacks.ts';
import { FakeRuntime, setRuntime, type RuntimeHealth, type StackHealth } from '../server/runtime-client.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
const reg = new Registry();
module.register(reg);

before(async () => { if (!skip) pool = createPool(URL_); });
after(async () => { await pool?.end(); });
afterEach(() => setFakeLlm(null));

async function workspace(role = 'owner') {
  const ws = await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('agents test') RETURNING id");
  const m = await one<{ id: string }>(pool, 'INSERT INTO member (workspace_id, email, role) VALUES ($1, $2, $3) RETURNING id', [ws!.id, `a${Math.random()}@example.test`, role]);
  const actor: Actor = { type: 'member', id: m!.id, role: role as Actor['role'] };
  const call = <O = any>(name: string, args: unknown) => reg.execute<O>(pool, name, args, { workspaceId: ws!.id, actor });
  return { ws: ws!.id, member: m!.id, call };
}

function ok<O>(r: Receipt<O>): O {
  assert.equal(r.status, 'confirmed', r.status !== 'confirmed' ? JSON.stringify(r) : '');
  return (r as { result: O }).result;
}
function refused(r: Receipt, rx: RegExp) {
  assert.equal(r.status, 'not_executed', JSON.stringify(r));
  assert.match((r as { reason: string }).reason, rx);
}

async function fromTemplate(call: Awaited<ReturnType<typeof workspace>>['call'], templateId = 'insurance-renewal') {
  return ok<any>(await call('agent.create', { name: 'Renewals', templateId }));
}

test('agent.create from a template starts on the default stack; list and get read it back', { skip }, async () => {
  const { call } = await workspace();
  const c = await fromTemplate(call);
  assert.equal(c.status, 'draft');
  assert.equal(c.compiles, true);
  assert.deepEqual(c.lint, []);
  assert.equal(c.draft.voice.stackId, DEFAULT_STACK_ID, 'a new agent starts on the provisional default stack');
  assert.equal(c.stackChosen, true);
  assert.equal(c.draft.agentId, c.agentId);
  const g = ok<any>(await call('agent.get', { agentId: c.agentId }));
  assert.equal(g.draftHash, c.draftHash);
  assert.equal(g.brief.hash, compile(g.draft).hash);
  assert.equal(g.stack.id, DEFAULT_STACK_ID);
  const l = ok<any>(await call('agent.list', {}));
  assert.deepEqual(l.agents.map((a: { id: string }) => a.id), [c.agentId]);
  const t = ok<any>(await call('template.list', {}));
  assert.ok(t.templates.length >= 14);
  refused(await call('agent.create', { name: 'x', templateId: 'nope' }), /templateId: must be one of: insurance-renewal/);   // the schema lists the ids
  refused(await call('agent.create', { name: 'x' }), /exactly one of templateId \(one of: .*template\.list\) or description.*not neither/);
});

test('agent.create from plain words drafts through the compile model, validates, lints and shows a draft', { skip }, async () => {
  const { call } = await workspace();
  const seen: LlmRequest[] = [];
  setFakeLlm(req => {
    seen.push(req);
    return { text: JSON.stringify({
      brand: { name: 'Chai Point Cafe', spokenName: 'Chai Point', verifiedDomains: [] },
      job: 'feedback_survey', category: 'service', sectorPacks: [],
      languages: { primary: 'hinglish', allowed: ['hinglish', 'en-IN'], mirrorCaller: true },
      persona: { name: 'Pari', gender: 'female', register: 'warm_peer', energy: 4, humour: 1, honorific: 'mirror', notes: ['say "thank you so much" a lot'] },
      goals: [{ id: 'visit_feedback', description: 'hear how the last visit went', outcome: 'visit_rating', required: true }],
      facts: [{ key: 'customer', value: 'name from the contact record', purpose: 'identity', perContact: true }],
      neverSay: [], opening: { disclosureClause: 'that you are its AI assistant, in passing', usefulFirst: 'that this takes a minute' },
      objections: [], handOff: { when: ['complaint'], target: { kind: 'callback' }, warmSummary: true },
      voice: { stackId: 'v2-live' },
    }), toolCalls: [], usage: { inputTokens: 900, outputTokens: 400 }, model: 'fake', provider: 'fake' };
  });
  const c = ok<any>(await call('agent.create', { name: 'Cafe feedback', description: 'Call our cafe customers after a visit and ask how it went, in Hinglish, friendly.' }));
  assert.equal(seen[0].purpose, 'compile');
  assert.equal(seen[0].json, true);
  assert.equal(c.status, 'draft');
  assert.equal(c.draft.voice.stackId, DEFAULT_STACK_ID, 'the drafting model never picks a stack: the draft starts on the default');
  assert.equal(c.draft.facts[0].source, 'llm.draft');
  assert.equal(c.compiles, false, 'a quoted line in the draft is shown, and blocks compiling');
  assert.ok(c.lint.some((f: { path: string }) => f.path === 'persona.notes[0]'));

  // Fix it with a validated patch: now it compiles.
  const e = ok<any>(await call('brief.edit', { agentId: c.agentId, patch: [{ op: 'set', path: 'persona.notes[0]', value: 'appreciative without gushing' }] }));
  assert.equal(e.compiles, true);

  setFakeLlm(() => ({ text: 'not json', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }));
  refused(await call('agent.create', { name: 'x', description: 'Call people and do something useful with them.' }), /did not return JSON/);
  setFakeLlm(() => ({ text: JSON.stringify({ job: 'teleport' }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }));
  refused(await call('agent.create', { name: 'x', description: 'Call people and do something useful with them.' }), /did not validate/);
});

test('brief.edit applies a validated patch; locked fields, bad values and stale hashes are refused', { skip }, async () => {
  const { call } = await workspace();
  const c = await fromTemplate(call);
  const e = ok<any>(await call('brief.edit', { agentId: c.agentId, expectDraftHash: c.draftHash, patch: [
    { op: 'set', path: 'persona.energy', value: 4 },
    { op: 'append', path: 'persona.notes', value: 'slows down for older callers' },
    { op: 'remove', path: 'objections[1]' },
  ] }));
  assert.notEqual(e.draftHash, c.draftHash);
  assert.deepEqual(e.changes.map((x: { path: string }) => x.path).sort(), ['objections[1]', 'persona.energy', 'persona.notes[1]']);
  refused(await call('brief.edit', { agentId: c.agentId, expectDraftHash: c.draftHash, patch: [{ op: 'set', path: 'persona.energy', value: 2 }] }), /changed since you last read it/);
  refused(await call('brief.edit', { agentId: c.agentId, patch: [{ op: 'set', path: 'voice.stackId', value: 'v2-live' }] }), /stack.set/);
  refused(await call('brief.edit', { agentId: c.agentId, patch: [{ op: 'set', path: 'tools', value: [] }] }), /tool.attach/);
  const bad = await call('brief.edit', { agentId: c.agentId, patch: [{ op: 'set', path: 'persona.energy', value: 9 }] });
  refused(bad, /must be one of/);
  assert.equal((bad as { path?: string }).path, 'persona.energy');
  refused(await call('brief.edit', { agentId: c.agentId, patch: [{ op: 'set', path: 'persona.mood', value: 'x' }] }), /not a known field/);
  refused(await call('brief.edit', { agentId: c.agentId, patch: [{ op: 'set', path: 'facts[99].value', value: 'x' }] }), /does not exist/);
  const g = ok<any>(await call('agent.get', { agentId: c.agentId }));
  assert.equal(g.draftHash, e.draftHash, 'refused edits change nothing');
});

test('stack.list carries each stack\'s availability from the runtime\'s health, and unknown when the runtime reports nothing', { skip }, async () => {
  const { call } = await workspace();
  const fake = new FakeRuntime();
  setRuntime(fake); forgetRuntimeHealth();
  try {
    const none = ok<any>(await call('stack.list', {}));
    assert.ok(none.stacks.every((s: any) => s.availability.state === 'unknown' && s.availability.reason === null), 'no report is unknown, never available');
    const [first, second] = ok<any>(await call('stack.list', {})).stacks;
    fake.healthReply = { stacks: { [first.id]: { available: true, reason: null, missing: [] },
      [second.id]: { available: false, reason: "This voice isn't offered on our Google Cloud route yet", missing: [] } } };
    forgetRuntimeHealth();
    const by = Object.fromEntries(ok<any>(await call('stack.list', {})).stacks.map((s: any) => [s.id, s.availability]));
    assert.deepEqual(by[first.id], { state: 'available', reason: null });
    assert.deepEqual(by[second.id], { state: 'unavailable', reason: "This voice isn't offered on our Google Cloud route yet" });
    assert.ok(Object.entries(by).filter(([id]) => id !== first.id && id !== second.id).every(([, v]: any) => v.state === 'unavailable'),
      'a stack the runtime does not list is unavailable');
  } finally { setRuntime(null); forgetRuntimeHealth(); }
});

test('stack.list prices each curated stack with money\'s own estimate, the figure the picker shows', { skip }, async () => {
  const { register: registerMoney } = await import('../server/modules/money/index.ts');
  const both = new Registry(); module.register(both); registerMoney(both);
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('stack price test') RETURNING id"))!.id;
  const m = (await one<{ id: string }>(pool, 'INSERT INTO member (workspace_id, email, role) VALUES ($1, $2, $3) RETURNING id', [ws, `p${Math.random()}@example.test`, 'owner']))!.id;
  const ctx = { workspaceId: ws, actor: { type: 'member', id: m, role: 'owner' } as Actor };
  const list = ok<any>(await both.execute(pool, 'stack.list', {}, ctx));
  for (const st of list.stacks) {
    const e = ok<any>(await both.execute(pool, 'money.estimate', { stackId: st.id, minutes: 1, calls: 0 }, ctx));
    assert.equal(st.pricePerMinute.grade, 'computed', st.id);
    assert.equal(st.pricePerMinute.value, `${e.display.perMinute}, provider cost`, st.id + ': the same figure as money.estimate');
    assert.ok(e.perMinuteInrMilli > 0, st.id + ' is never priced at zero');
  }
});

test('new agents start on the provisional default stack; a draft with no stack cannot publish; voice.set needs a stack', { skip }, async () => {
  const { call, ws, member } = await workspace();
  const s = ok<any>(await call('stack.list', {}));
  assert.equal(s.default, DEFAULT_STACK_ID);
  assert.ok(s.stacks.some((x: any) => x.id === s.default), 'the default is one of the curated stacks');
  assert.ok(s.stacks.length >= 5);
  for (const st of s.stacks) {
    assert.ok(['measured', 'computed', 'vendor', 'not_measured'].includes(st.replyGap.grade));
    assert.ok(st.replyGap.source.length > 0);
    assert.equal(st.pricePerMinute.grade, 'not_measured', 'a missing figure reads not measured, never zero');
  }
  const c0 = await fromTemplate(call);
  // Fixture in SQL: no tool clears a stack, but drafts saved before the default existed have stackId ''.
  await pool.query(`UPDATE agent SET draft = jsonb_set(draft, '{voice}', '{"stackId": ""}') WHERE id = $1`, [c0.agentId]);
  const c = { ...c0, draftHash: ok<any>(await call('agent.get', { agentId: c0.agentId })).draftHash };
  refused(await call('voice.set', { agentId: c.agentId, voiceId: 'Kore' }), /choose a voice stack first/);
  const p = await call('version.publish', { agentId: c.agentId, draftHash: c.draftHash });
  assert.equal(p.status, 'needs_approval');
  const a = await reg.approve(pool, (p as { actionId: string }).actionId, { workspaceId: ws, memberId: member });
  refused(a, /choose a voice stack/);
  refused(await call('stack.set', { agentId: c.agentId, stackId: 'cheapest' }), /unknown voice stack/);
  const set = ok<any>(await call('stack.set', { agentId: c.agentId, stackId: 'v2-flashlite' }));
  assert.equal(set.stack.id, 'v2-flashlite');
  assert.equal(set.stack.replyGap.grade, 'measured');
  assert.ok(set.brief.sections.some((x: { name: string }) => x.name === 'SOUNDS'), 'a tag-safe voice adds the sounds section');
  const v = ok<any>(await call('voice.set', { agentId: c.agentId, voiceId: 'Kore', speed: 1.05 }));
  assert.deepEqual(v.voice, { stackId: 'v2-flashlite', voiceId: 'Kore', speed: 1.05 });
  const same = ok<any>(await call('stack.set', { agentId: c.agentId, stackId: 'v2-54mini' }));
  assert.equal(same.voiceCleared, false, 'a new brain with the same voice part keeps the chosen voice');
  const again = ok<any>(await call('stack.set', { agentId: c.agentId, stackId: 'v2-mai' }));
  assert.equal(again.voiceCleared, true, 'a voice belongs to the part that speaks');
});

test('version.publish needs approval, is bound to the draft it showed, and stores { agent, brief }', { skip }, async () => {
  const { call, ws, member } = await workspace();
  const c = await fromTemplate(call);
  const shown = ok<any>(await call('stack.set', { agentId: c.agentId, stackId: 'v2-54mini' }));

  // Proposed, not run.
  const p = await call('version.publish', { agentId: c.agentId, draftHash: shown.draftHash, note: 'first' });
  assert.equal(p.status, 'needs_approval');
  // The card names the agent and the version it will become, in words; the draft hash binds the approval, not the card text.
  assert.match((p as { summary: string }).summary, /^Publish .+, version 1/);
  assert.doesNotMatch((p as { summary: string }).summary, /[0-9a-f]{8}/i);
  assert.equal((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM agent_version WHERE agent_id = $1', [c.agentId]))!.n, '0');

  // The draft changes after the card was shown: the approval is void.
  ok(await call('brief.edit', { agentId: c.agentId, patch: [{ op: 'set', path: 'persona.humour', value: 0 }] }));
  refused(await reg.approve(pool, (p as { actionId: string }).actionId, { workspaceId: ws, memberId: member }), /changed since it was proposed/);

  // A card for a draft hash that is not the current draft cannot run either.
  const stale = await call('version.publish', { agentId: c.agentId, draftHash: shown.draftHash });
  refused(await reg.approve(pool, (stale as { actionId: string }).actionId, { workspaceId: ws, memberId: member }), /draft changed since it was shown/);

  // A viewer cannot approve; an owner can, once.
  const cur = ok<any>(await call('agent.get', { agentId: c.agentId }));
  const p2 = await call('version.publish', { agentId: c.agentId, draftHash: cur.draftHash });
  const viewer = await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1, $2, 'viewer') RETURNING id", [ws, `v${Math.random()}@example.test`]);
  refused(await reg.approve(pool, (p2 as { actionId: string }).actionId, { workspaceId: ws, memberId: viewer!.id }), /viewer cannot approve/);
  const p3 = await call('version.publish', { agentId: c.agentId, draftHash: cur.draftHash });
  const done = ok<any>(await reg.approve(pool, (p3 as { actionId: string }).actionId, { workspaceId: ws, memberId: member }));
  assert.equal(done.number, 1);
  refused(await reg.approve(pool, (p3 as { actionId: string }).actionId, { workspaceId: ws, memberId: member }), /already executed/);

  const row = await one<{ hash: string; parent_id: string | null; config: { agent: AgentConfig; brief: { text: string; hash: string; bytes: number } } }>(pool,
    'SELECT hash, parent_id, config FROM agent_version WHERE id = $1', [done.versionId]);
  assert.equal(row!.parent_id, null);
  assert.equal(row!.config.agent.version, 1);
  assert.equal(row!.config.agent.versionHash, row!.hash);
  assert.equal(versionHashOf(row!.config.agent), row!.hash);
  assert.deepEqual(row!.config.brief, compile(row!.config.agent), 'the stored brief is exactly what compile() gives for the stored agent');
  assert.equal(row!.config.brief.hash, cur.brief.hash, 'the brief published is the brief that was previewed');

  // A second publish links to its parent; version.list and version.diff read them.
  ok(await call('brief.edit', { agentId: c.agentId, patch: [{ op: 'set', path: 'persona.energy', value: 5 }] }));
  const d = ok<any>(await call('version.diff', { agentId: c.agentId }));
  assert.equal(d.from.label, 'version 1');
  assert.deepEqual(d.changes, [{ path: 'persona.energy', from: 3, to: 5 }]);
  const cur2 = ok<any>(await call('agent.get', { agentId: c.agentId }));
  const p4 = await call('version.publish', { agentId: c.agentId, draftHash: cur2.draftHash });
  const v2 = ok<any>(await reg.approve(pool, (p4 as { actionId: string }).actionId, { workspaceId: ws, memberId: member }));
  assert.equal(v2.number, 2);
  assert.equal(v2.parentId, done.versionId);
  const list = ok<any>(await call('version.list', { agentId: c.agentId }));
  assert.deepEqual(list.versions.map((v: { number: number }) => v.number), [2, 1]);
  const d12 = ok<any>(await call('version.diff', { agentId: c.agentId, from: done.versionId, to: v2.versionId }));
  assert.deepEqual(d12.changes, [{ path: 'persona.energy', from: 3, to: 5 }]);
  assert.equal(await verifyAudit(pool, ws), null);
});

test('deployment.split needs approval, checks the versions and sums to 100', { skip }, async () => {
  const { call, ws, member } = await workspace();
  const c = await fromTemplate(call, 'clinic-appointment-confirm');
  ok(await call('stack.set', { agentId: c.agentId, stackId: 'v2-mai' }));
  const publish = async () => {
    const g = ok<any>(await call('agent.get', { agentId: c.agentId }));
    const p = await call('version.publish', { agentId: c.agentId, draftHash: g.draftHash });
    return ok<any>(await reg.approve(pool, (p as { actionId: string }).actionId, { workspaceId: ws, memberId: member }));
  };
  const v1 = await publish();
  ok(await call('brief.edit', { agentId: c.agentId, patch: [{ op: 'set', path: 'persona.energy', value: 4 }] }));
  const v2 = await publish();
  const bad = await call('deployment.split', { agentId: c.agentId, binding: 'campaign', split: [{ versionId: v1.versionId, percent: 50 }, { versionId: v2.versionId, percent: 40 }] });
  assert.equal(bad.status, 'needs_approval', 'everything about deployment waits for a human');
  refused(await reg.approve(pool, (bad as { actionId: string }).actionId, { workspaceId: ws, memberId: member }), /add up to 100/);
  const p = await call('deployment.split', { agentId: c.agentId, binding: 'campaign', split: [{ versionId: v1.versionId, percent: 80 }, { versionId: v2.versionId, percent: 20 }] });
  const d = ok<any>(await reg.approve(pool, (p as { actionId: string }).actionId, { workspaceId: ws, memberId: member }));
  assert.deepEqual(d.split.map((s: { number: number }) => s.number), [1, 2]);
  assert.equal((await one<{ status: string }>(pool, 'SELECT status FROM agent WHERE id = $1', [c.agentId]))!.status, 'live');
  // Two cards proposed against the same current split: once one runs, the other is void.
  const a1 = await call('deployment.split', { agentId: c.agentId, binding: 'campaign', split: [{ versionId: v2.versionId, percent: 100 }] });
  const a2 = await call('deployment.split', { agentId: c.agentId, binding: 'campaign', split: [{ versionId: v1.versionId, percent: 100 }] });
  ok(await reg.approve(pool, (a1 as { actionId: string }).actionId, { workspaceId: ws, memberId: member }));
  refused(await reg.approve(pool, (a2 as { actionId: string }).actionId, { workspaceId: ws, memberId: member }), /changed since it was proposed/);
});

test('tool.attach grants catalogue and workspace tools with their risk class', { skip }, async () => {
  const { call, ws } = await workspace();
  const c = await fromTemplate(call);
  const r = ok<any>(await call('tool.attach', { agentId: c.agentId, name: 'end_call' }));
  assert.ok(r.tools.some((t: { name: string; risk: string }) => t.name === 'end_call' && t.risk === 'read'));
  assert.match(ok<any>(await call('agent.get', { agentId: c.agentId })).brief.text, /writing <end_call>/, 'one marker spelling, whatever the grants');
  refused(await call('tool.attach', { agentId: c.agentId, name: 'wire_money' }), /unknown in-call tool/);
  const t = await one<{ id: string }>(pool, "INSERT INTO tool (workspace_id, name, kind, risk_class) VALUES ($1, 'crm_lookup', 'http', 'read') RETURNING id", [ws]);
  const r2 = ok<any>(await call('tool.attach', { agentId: c.agentId, toolId: t!.id }));
  assert.ok(r2.tools.some((x: { name: string }) => x.name === 'crm_lookup'));
  const r3 = ok<any>(await call('tool.attach', { agentId: c.agentId, name: 'end_call', remove: true }));
  assert.ok(!r3.tools.some((x: { name: string }) => x.name === 'end_call'));
});

/** A scripted caller and agent: the fake tells them apart by the system prompt. */
function scriptedCall(agentLines: string[], callerLines: string[]) {
  let a = 0, c = 0;
  const systems: string[] = [];
  setFakeLlm(req => {
    const sys = req.messages[0].content;
    systems.push(sys);
    assert.equal(req.purpose, 'simulate');
    const text = sys.startsWith('You are role-playing') ? callerLines[c++] ?? 'ok <hangup>' : agentLines[a++] ?? 'Theek hai, bye! <end_call>';
    return { text, toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 }, model: 'fake', provider: 'fake' };
  });
  return systems;
}

const SIM = {
  persona: 'Rohit, 41, busy sales manager, speaks Hinglish, short answers',
  scenario: 'You hold the renewing policy; you are driving and want a callback this evening',
  hiddenKeys: { callback_time: '7 pm', mood: 'in a hurry' },
  contact: { policyholder: 'Rohit Verma', renewal_due: '2 November', premium: '18,450 rupees' },
  passCriteria: { mustCapture: ['callback_time'], mustMention: [{ label: 'premium', pattern: '18,?450' }], mustNotMention: [{ label: 'discount', pattern: 'discount' }], requireEnd: true },
};

test('test.simulate runs the compiled brief against a simulated caller and grades by code against the hidden keys', { skip }, async () => {
  const { call } = await workspace();
  const c = await fromTemplate(call);
  const systems = scriptedCall(
    ['Hello, kya main Rohit ji se baat kar rahi hoon?',
      'Main Riya, Suraksha Health ki AI assistant. Achhi khabar: no-claim bonus se cover 11 lakh ho gaya. Renewal 2 November ko hai, premium 18,450.',
      'Bilkul, 7 pm par advisor callback set kar deti hoon. Safe drive! <end_call>'],
    ['Haan, bol raha hoon.', 'Abhi drive kar raha hoon, shaam 7 pm ko call karo.'],
  );
  const r = ok<any>(await call('test.simulate', { agentId: c.agentId, simCaller: SIM }));
  assert.equal(r.passed, true, JSON.stringify(r.grades));
  assert.equal(r.endedBy, 'agent');
  assert.equal(r.transcript.length, 5);
  assert.ok(!r.transcript.some((t: { text: string }) => /<end_call>/.test(t.text)), 'markers are not part of what she said');
  const agentSystem = systems.find(s => !s.startsWith('You are role-playing'))!;
  assert.ok(agentSystem.startsWith(compile(c.draft).text), 'the agent runs on exactly the compiled brief');
  assert.ok(agentSystem.includes(TAIL + '\n\n' + markerRules(c.draft)), 'the tail and the marker rules go last, as in the runtime');
  assert.ok(agentSystem.trimEnd().endsWith(markerRules(c.draft)));
  assert.ok(agentSystem.includes('premium: 18,450 rupees'), 'contact rows are given');
  assert.ok(!systems.filter(s => !s.startsWith('You are role-playing')).some(s => s.includes('7 pm')), 'hidden keys never reach the agent');
  const stored = await one<{ passed: boolean; brief_hash: string; draft_hash: string }>(pool, 'SELECT passed, brief_hash, draft_hash FROM agent_test_run WHERE id = $1', [r.runId]);
  assert.deepEqual(stored, { passed: true, brief_hash: compile(c.draft).hash, draft_hash: c.draftHash });

  // Same simulated caller by id, and an agent that never discloses, never says the time back and says a banned word: fails.
  scriptedCall(['Rohit ji?', 'Suraksha Health se, renewal par discount hai! Premium 18,450.', 'Ok bye <end_call>'], ['Haan.', 'Shaam 7 pm call karo.']);
  const f = ok<any>(await call('test.simulate', { agentId: c.agentId, simCallerId: r.simCallerId }));
  assert.equal(f.passed, false);
  const failed = f.grades.filter((g: { pass: boolean }) => !g.pass).map((g: { check: string }) => g.check).sort();
  // With the real reply door (safety module) the discount line on a service call is blocked before it is said (RD7),
  // so never:discount passes, the premium it carried is never mentioned, and the door's intervention fails the run.
  assert.deepEqual(failed, ['capture:callback_time', 'disclosure', 'mention:premium', 'reply_door']);
});

test('test.simulate refuses a draft that does not compile, and grading never asks a model', { skip }, async () => {
  const { call } = await workspace();
  const c = await fromTemplate(call);
  ok(await call('brief.edit', { agentId: c.agentId, patch: [{ op: 'append', path: 'persona.notes', value: 'opens with "namaste ji"' }] }));
  let calls = 0;
  setFakeLlm(() => { calls++; return { text: 'x', toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 }, model: 'fake', provider: 'fake' }; });
  refused(await call('test.simulate', { agentId: c.agentId, simCaller: SIM }), /cannot compile/);
  assert.equal(calls, 0);
  ok(await call('brief.edit', { agentId: c.agentId, patch: [{ op: 'remove', path: 'persona.notes[1]' }] }));
  scriptedCall(['Rohit ji?', 'Riya, Suraksha Health ki AI assistant.'], ['Haan.']);
  const r = ok<any>(await call('test.simulate', { agentId: c.agentId, simCaller: SIM, maxTurns: 3 }));
  assert.equal(r.endedBy, 'turn_limit');
  assert.equal(r.transcript.length, 3);
  assert.equal(r.usage.inputTokens, 300, 'two agent turns and one caller turn: three model calls, none for grading');
});

test('tenancy: another workspace cannot read, edit, simulate, publish or deploy these agents', { skip }, async () => {
  const A = await workspace();
  const B = await workspace();
  const c = await fromTemplate(A.call);
  ok(await A.call('stack.set', { agentId: c.agentId, stackId: 'v2-flashlite' }));
  const g = ok<any>(await A.call('agent.get', { agentId: c.agentId }));
  const p = await A.call('version.publish', { agentId: c.agentId, draftHash: g.draftHash });
  const v = ok<any>(await reg.approve(pool, (p as { actionId: string }).actionId, { workspaceId: A.ws, memberId: A.member }));

  assert.deepEqual(ok<any>(await B.call('agent.list', {})).agents, []);
  refused(await B.call('agent.get', { agentId: c.agentId }), /no such agent/);
  refused(await B.call('brief.edit', { agentId: c.agentId, patch: [{ op: 'set', path: 'persona.energy', value: 1 }] }), /no such agent/);
  refused(await B.call('stack.set', { agentId: c.agentId, stackId: 'v2-live' }), /no such agent/);
  refused(await B.call('tool.attach', { agentId: c.agentId, name: 'end_call' }), /no such agent/);
  refused(await B.call('test.simulate', { agentId: c.agentId, simCaller: SIM }), /no such agent/);
  refused(await B.call('version.list', { agentId: c.agentId }), /no such agent/);
  refused(await B.call('version.diff', { agentId: c.agentId }), /no such agent/);
  // B proposes a publish of A's agent: the card cannot bind to a draft it cannot see, and running it fails.
  const bp = await B.call('version.publish', { agentId: c.agentId, draftHash: g.draftHash });
  refused(await reg.approve(pool, (bp as { actionId: string }).actionId, { workspaceId: B.ws, memberId: B.member }), /no such agent/);
  const bd = await B.call('deployment.split', { agentId: c.agentId, binding: 'campaign', split: [{ versionId: v.versionId, percent: 100 }] });
  refused(await reg.approve(pool, (bd as { actionId: string }).actionId, { workspaceId: B.ws, memberId: B.member }), /no such agent/);
  // And A cannot approve B's proposals (actions are workspace-scoped).
  refused(await reg.approve(pool, (bp as { actionId: string }).actionId, { workspaceId: A.ws, memberId: A.member }), /no such action/);
  // A's agent is untouched.
  assert.equal(ok<any>(await A.call('agent.get', { agentId: c.agentId })).draftHash, g.draftHash);
  // A workspace tool in B cannot be attached to an agent in A.
  const t = await one<{ id: string }>(pool, "INSERT INTO tool (workspace_id, name, kind, risk_class) VALUES ($1, 'b_only', 'http', 'read') RETURNING id", [B.ws]);
  refused(await A.call('tool.attach', { agentId: c.agentId, toolId: t!.id }), /no such tool/);
});

test('roles: a viewer can read but not draft', { skip }, async () => {
  const { call } = await workspace('viewer');
  ok(await call('template.list', {}));
  refused(await call('agent.create', { name: 'x', templateId: 'insurance-renewal' }), /viewer cannot use agent.create/);
});

test('build your own: stack.list offers the parts; stack.set takes ears, brain and voice or one engine; wrong combinations are refused in plain words', { skip }, async () => {
  const { call } = await workspace();
  const list = ok<any>(await call('stack.list', {}));
  for (const part of ['ears', 'brain', 'voice', 's2s']) assert.ok(list.components.some((c: any) => c.part === part), `parts include ${part}`);
  for (const c of list.components) {
    assert.ok(c.processedIn && c.route && c.price, `${c.id} says where it runs, how it is routed and what it costs`);
    assert.ok(['measured', 'computed', 'vendor', 'not_measured'].includes(c.latency.grade));
    assert.ok(!(c.part === 'brain' && /^gemini/.test(c.id)) || c.route === 'vertex', 'Gemini is routed through Vertex');
  }
  const c = await fromTemplate(call);
  const built = ok<any>(await call('stack.set', { agentId: c.agentId, stackId: 'custom', components: { ears: 'azure', brain: 'gpt-5.4-mini', voice: 'azure-mai' } }));
  assert.equal(built.stack.id, 'custom');
  assert.equal(built.stack.status, 'beta', 'a stack you build runs test calls only until it is measured');
  assert.equal(built.stack.replyGap.grade, 'not_measured');
  assert.match(built.stack.label, /Azure Speech.*GPT-5\.4 mini.*MAI/);
  const g = ok<any>(await call('agent.get', { agentId: c.agentId }));
  assert.deepEqual(g.draft.voice, { stackId: 'custom', components: { ears: 'azure', brain: 'gpt-5.4-mini', voice: 'azure-mai', gatedEars: true } });
  const engine = ok<any>(await call('stack.set', { agentId: c.agentId, stackId: 'custom', components: { s2s: 'gemini-3.8-live' } }));
  assert.equal(engine.stack.kind, 's2s');
  refused(await call('stack.set', { agentId: c.agentId, stackId: 'custom' }), /needs its parts/);
  refused(await call('stack.set', { agentId: c.agentId, stackId: 'custom', components: { s2s: 'gemini-3.8-live', ears: 'azure' } }), /choose it alone/);
  refused(await call('stack.set', { agentId: c.agentId, stackId: 'custom', components: { ears: 'azure', brain: 'gpt-99', voice: 'azure' } }), /not a language model we offer/);
  refused(await call('stack.set', { agentId: c.agentId, stackId: 'custom', components: { ears: 'azure', brain: 'gpt-5.4-mini' } }), /choose the voice/);
  refused(await call('stack.set', { agentId: c.agentId, stackId: 'v2-flashlite', components: { ears: 'azure' } }), /fixed parts/);
  // Going back to a curated stack drops the parts.
  const back = ok<any>(await call('stack.set', { agentId: c.agentId, stackId: 'v2-flashlite' }));
  assert.equal(back.stack.id, 'v2-flashlite');
  assert.deepEqual(ok<any>(await call('agent.get', { agentId: c.agentId })).draft.voice, { stackId: 'v2-flashlite' });
});

test('a built stack is available only when the runtime reports every one of its parts available; parts are unknown until it reports them', { skip }, async () => {
  const { availabilityOf } = await import('../server/modules/agents/index.ts');
  const parts = { ears: 'azure', brain: 'gpt-5.4-mini', voice: 'azure-mai', gatedEars: true };
  assert.equal(availabilityOf('custom', null, parts).state, 'unknown');
  assert.equal(availabilityOf('custom', { stacks: {} }, parts).state, 'unknown', 'a runtime that does not report parts yet: unknown, not unavailable');
  const ok1: StackHealth = { available: true, reason: null, missing: [] };
  const h: RuntimeHealth & { components: Record<string, Record<string, StackHealth>> } = { stacks: {}, components: { ears: { azure: ok1 }, brain: { 'gpt-5.4-mini': ok1 },
    voice: { 'azure-mai': { available: false, reason: 'This voice is in preview and not connected yet.', missing: [] } } } };
  assert.deepEqual(availabilityOf('custom', h, parts), { state: 'unavailable', reason: "Our voice engine can't run a stack you build yourself yet." },
    'every part healthy is not enough: the runtime must say it runs built stacks');
  h.customStacks = true;
  assert.deepEqual(availabilityOf('custom', h, parts), { state: 'unavailable', reason: 'This voice is in preview and not connected yet.' });
  h.components.voice['azure-mai'] = ok1;
  assert.deepEqual(availabilityOf('custom', h, parts), { state: 'available', reason: null });
  const { call } = await workspace();
  const fake = new FakeRuntime(); setRuntime(fake); forgetRuntimeHealth();
  try {
    fake.healthReply = h; forgetRuntimeHealth();
    const by = Object.fromEntries(ok<any>(await call('stack.list', {})).components.map((c: any) => [`${c.part}:${c.id}`, c.availability.state]));
    assert.equal(by['ears:azure'], 'available');
    assert.equal(by['ears:sarvam'], 'unavailable', 'a part the runtime does not list is unavailable');
  } finally { setRuntime(null); forgetRuntimeHealth(); }
});
