// Learning on what real analysis writes, on the REAL modules (agents compiles, calls stores, learning proposes). Calls are
// the analysis bench's synthetic cases written in the shapes analysis stores (tests/fixtures/analysed-calls.ts): moments
// of six kinds with the caller's exact line, twelve reason codes, outcomes or none, and insight themes grounded by calls'
// own check. The model is faked. Skipped when DATABASE_URL is unset.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { CASES, writeAnalysed, writeInsight, labelOf, callerLine, type Written } from './fixtures/analysed-calls.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(async () => { if (skip) return; pool = createPool(URL_); registry = buildApp(pool, modules).registry; });
after(async () => { setFakeLlm(null); await pool?.end(); });

/** A workspace with one published agent (the insurance-renewal template, made and published through agents' tools). */
async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('learning shapes') RETURNING id"))!.id;
  const member = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `s${Math.random()}@example.test`]))!.id;
  const actor: Actor = { type: 'member', id: member, role: 'owner' };
  const call = (name: string, args: unknown): Promise<any> => registry.execute(pool, name, args, { workspaceId: ws, actor });
  const run = async (name: string, args: unknown) => { const r = await call(name, args); return r.status === 'needs_approval' ? registry.approve<any>(pool, r.actionId, { workspaceId: ws, memberId: member }) : r; };
  const agentId = (await call('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' })).result.agentId as string;
  const s = await call('stack.set', { agentId, stackId: 'v2-flashlite' });
  const pub = await run('version.publish', { agentId, draftHash: s.result.draftHash });
  assert.equal(pub.status, 'confirmed', JSON.stringify(pub));
  return { ws, member, agentId, versionId: pub.result.versionId as string, call, run };
}

/** The model as learning calls it: records what it was shown, and proposes what `proposals` says. */
function fakeCoach(proposals: (evidence: any) => unknown[] = () => []) {
  const asked: LlmRequest[] = [];
  setFakeLlm(req => {
    asked.push(req);
    const body = JSON.parse(req.messages[req.messages.length - 1]!.content);
    return { text: JSON.stringify({ proposals: proposals(body.evidence) }), toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, model: 'fake', provider: 'fake' };
  });
  return asked;
}

/** Every Hinglish case once (72 calls, all twelve templates), plus a price-objection theme across the not-interested calls. */
async function analysedWorld() {
  const t = await workspace();
  const calls = await writeAnalysed(pool, t.ws, t.versionId, CASES.filter(c => c.language === 'hinglish'));
  const priced = calls.filter(w => w.case.template === 'not_interested');
  const themes = await writeInsight(pool, t.ws, t.agentId, calls, { themes: [
    { kind: 'objection', title: 'The price feels too high', quotes: priced.slice(0, 3).map(w => ({ call: labelOf(calls, w), text: callerLine(w, 'objection') })), calls: priced.map(w => labelOf(calls, w)) },
  ] });
  assert.equal(themes.length, 1, 'the fixture theme passes calls\' own grounding check');
  return { ...t, calls, themes };
}
const lineOf = (calls: Written[], template: string, i = 0) => calls.filter(w => w.case.template === template)[i]!.lines;

test('learning sees what analysis wrote: moments by kind with caller quotes, reasons, outcomes and themes; never a crisis call\'s words, and opt-outs only as a count', { skip }, async () => {
  const w = await analysedWorld();
  const asked = fakeCoach();
  const r = await w.call('learning.propose', { agentId: w.agentId, max: 1 });
  assert.equal(r.status, 'confirmed', JSON.stringify(r));
  assert.equal(asked.length, 1);
  const prompt = asked[0]!.messages[asked[0]!.messages.length - 1]!.content;
  const ev = JSON.parse(prompt).evidence;
  // Moments: every kind analysis writes is counted; objections, questions and confusion come with the caller's line.
  for (const k of ['objection', 'commitment', 'confusion', 'callback_request', 'opt_out', 'question']) assert.ok(ev.moments.counts[k] > 0, `${k} counted: ${JSON.stringify(ev.moments.counts)}`);
  const objectionQuotes = ev.moments.quotes.filter((q: any) => q.kind === 'objection').map((q: any) => q.quote);
  assert.ok(objectionQuotes.some((q: string) => /bahut mehenga hai/.test(q)), JSON.stringify(objectionQuotes));
  // Reasons and outcomes as analysis leaves them, including calls with no outcome at all.
  for (const code of ['CONV_GOAL_DONE', 'END_EARLY_HANGUP', 'DIAL_NO_ANSWER', 'CONV_LANGUAGE_MISMATCH']) assert.ok(ev.reasons[code] > 0, `${code}: ${JSON.stringify(ev.reasons)}`);
  assert.ok(ev.outcomes.none > 0, JSON.stringify(ev.outcomes));
  // The agent's latest insight: the price theme, with its verified quotes.
  assert.equal(ev.themes[0].title, 'The price feels too high');
  assert.equal(ev.themes[0].quotes.length, 3);
  // Never shown to a model that writes the agent's brief: a person in crisis, or the words of someone who asked to be left alone.
  const crisis = lineOf(w.calls, 'crisis')[1]!.text, optOut = lineOf(w.calls, 'opt_out')[1]!.text;
  assert.ok(!prompt.includes(crisis.slice(0, 20)), 'a crisis call\'s words never reach the prompt');
  assert.ok(!prompt.includes(optOut.slice(0, 20)), 'an opt-out is counted, never quoted');
});

test('a learned objection note that reads as a line she would say is gated out before anyone sees it (the agents compile lint)', { skip }, async () => {
  const w = await analysedWorld();
  const base = (await w.call('agent.get', { agentId: w.agentId })).result.draft;
  const recitable = { trigger: 'the price feels too high', approach: 'Main aapko samjha deti hoon ki is baar kya badla hai' };
  fakeCoach(ev => [{ kind: 'objection', rationale: 'price comes up often', evidenceIds: [ev.themes[0].id],
    change: [{ op: 'set', path: 'objections', value: [...base.objections, recitable] }] }]);
  const r = await w.call('learning.propose', { agentId: w.agentId, max: 1 });
  const p = r.result.proposals[0];
  assert.equal(p.status, 'gated_out', JSON.stringify(p));
  assert.ok(p.failures.some((f: any) => f.gate === 'shape' && /objections\[\d+\]\.approach/.test(f.detail)), JSON.stringify(p.failures));
});

// ---------- objection handling: a recurring objection the brief has no answer for ----------

import { proposeFromObjections } from '../server/modules/learning/index.ts';

/** The not-interested calls all object to the price ("bahut mehenga hai"). With `n` of them quoted in one theme. */
async function priceWorld(n = 6, title = 'The price feels too high') {
  const t = await workspace();
  const calls = await writeAnalysed(pool, t.ws, t.versionId, CASES.filter(c => c.language === 'hinglish'));
  const priced = calls.filter(w => w.case.template === 'not_interested').slice(0, n);
  const themes = await writeInsight(pool, t.ws, t.agentId, calls, { themes: [
    { kind: 'objection', title, quotes: priced.slice(0, 3).map(w => ({ call: labelOf(calls, w), text: callerLine(w, 'objection') })), calls: priced.map(w => labelOf(calls, w)) },
  ] });
  assert.equal(themes.length, 1);
  return { ...t, calls, priced };
}
const NOTE = { trigger: 'they say the cost is too much for them right now', approach: 'acknowledge it, give the reason from the facts, and ask whether a smaller plan would suit' };
const appendNote = (note: { trigger: string; approach: string }) => async (ev: any, t: { call: Function; agentId: string }) => {
  const base = (await t.call('agent.get', { agentId: t.agentId })).result.draft;
  return [{ kind: 'objection', rationale: 'the price objection recurs and the brief has no note for it', evidenceIds: [ev.themes[0].id],
    change: [{ op: 'set', path: 'objections', value: [...base.objections, note] }] }];
};
/** fakeCoach for proposals that need the agent's current objections (async), and the theme the model was given. */
function asyncCoach(t: { call: Function; agentId: string }, make: (ev: any, t: any) => Promise<unknown[]> | unknown) {
  const asked: any[] = [];
  let base: any = null;
  setFakeLlm(async req => {
    const body = JSON.parse(req.messages[req.messages.length - 1]!.content);
    asked.push(body);
    base ??= (await t.call('agent.get', { agentId: t.agentId })).result.draft;
    const out = await make(body.evidence, t);
    return { text: JSON.stringify(Array.isArray(out) ? { proposals: out } : out), toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, model: 'fake', provider: 'fake' };
  });
  return asked;
}

test('a recurring objection the brief has no note for drafts one objection note, once, from the quoted lines', { skip }, async () => {
  const w = await priceWorld();
  const asked = asyncCoach(w, appendNote(NOTE));
  const first = await proposeFromObjections({ pool, registry }, { workspaceId: w.ws });
  assert.deepEqual(first.ran.map(r => r.status), ['proposed'], JSON.stringify(first));
  assert.equal(asked.length, 1);
  assert.equal(asked[0].focus.objection.title, 'The price feels too high', 'the model is told which objection to answer');
  assert.ok(asked[0].focus.objection.quotes.length >= 2, 'with the caller lines that show it');
  const p = await one<{ kind: string; status: string; change: any; evidence: any }>(pool, 'SELECT kind, status, change, evidence FROM proposal WHERE id = $1', [first.ran[0]!.proposalId]);
  assert.equal(p!.kind, 'objection');
  assert.equal(p!.status, 'drafted', JSON.stringify(p));
  assert.equal(p!.evidence.theme.title, 'The price feels too high');
  // Once per theme: the job runs every minute.
  assert.deepEqual((await proposeFromObjections({ pool, registry }, { workspaceId: w.ws })).ran, []);
  assert.equal(asked.length, 1);
  // The page names the source and the note in words.
  const listed = (await w.call('proposal.list', {})).result.find((x: any) => x.id === first.ran[0]!.proposalId);
  assert.match(listed.from_theme, /The price feels too high/);
  assert.equal(listed.changes.length, 1);
  assert.match(listed.changes[0].part, /they say the cost is too much/);
  assert.equal(listed.changes[0].before, null);
});

test('no objection note is drafted when the brief already answers it, when it is rare, or when the model says a note covers it', { skip }, async () => {
  // Already answered, by the words of an existing trigger: no model call at all.
  const a = await priceWorld();
  const draft = (await a.call('agent.get', { agentId: a.agentId })).result;
  await a.call('brief.edit', { agentId: a.agentId, patch: [{ op: 'set', path: 'objections', value: [...draft.draft.objections, { trigger: 'the price feels too high for them', approach: 'acknowledge it and give the reason from the facts' }] }] });
  const s = await a.call('agent.get', { agentId: a.agentId });
  assert.equal((await a.run('version.publish', { agentId: a.agentId, draftHash: s.result.draftHash })).status, 'confirmed');
  let asked = asyncCoach(a, appendNote(NOTE));
  // The insight is about the agent's calls on the version before; the live version now has the note.
  assert.deepEqual((await proposeFromObjections({ pool, registry }, { workspaceId: a.ws })).ran.map(r => r.status), ['already_answered']);
  assert.equal(asked.length, 0);
  // Rare: on 2 calls of 72.
  const b = await priceWorld(2);
  asked = asyncCoach(b, appendNote(NOTE));
  assert.deepEqual((await proposeFromObjections({ pool, registry }, { workspaceId: b.ws })).ran, []);
  assert.equal(asked.length, 0);
  // The model points at an existing note that covers it (the template's premium note): recorded, nothing drafted.
  const c = await priceWorld();
  asked = asyncCoach(c, () => ({ covered: 0, proposals: [] }));
  const r = await proposeFromObjections({ pool, registry }, { workspaceId: c.ws });
  assert.deepEqual(r.ran.map(x => x.status), ['already_answered'], JSON.stringify(r));
  assert.equal(asked.length, 1);
  assert.equal((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM proposal WHERE workspace_id = $1', [c.ws]))!.n, '0');
});

test('an objection note is a shape: never the caller\'s own words, and it only adds a note, never rewrites the business\'s', { skip }, async () => {
  const w = await priceWorld();
  const quote = callerLine(w.priced[0]!, 'objection');
  // Copies the caller's words into the note.
  asyncCoach(w, appendNote({ trigger: `when they say ${quote.toLowerCase().replace(/[.,]/g, '')}`, approach: 'acknowledge it and give the reason from the facts' }));
  let r = await proposeFromObjections({ pool, registry }, { workspaceId: w.ws });
  let p = await one<{ status: string; gates: any }>(pool, 'SELECT status, gates FROM proposal WHERE id = $1', [r.ran[0]!.proposalId]);
  assert.equal(p!.status, 'gated_out');
  assert.ok(p!.gates.failures.some((f: any) => f.gate === 'copied_quote'), JSON.stringify(p!.gates));
  // Rewrites the business's existing note instead of adding one.
  const v = await priceWorld();
  asyncCoach(v, async (ev: any, t: any) => {
    const base = (await t.call('agent.get', { agentId: t.agentId })).result.draft;
    return [{ kind: 'objection', rationale: 'x', evidenceIds: [ev.themes[0].id], change: [{ op: 'set', path: 'objections', value: [{ ...base.objections[0], approach: 'move on to the next step' }, NOTE] }] }];
  });
  r = await proposeFromObjections({ pool, registry }, { workspaceId: v.ws });
  p = await one<{ status: string; gates: any }>(pool, 'SELECT status, gates FROM proposal WHERE id = $1', [r.ran[0]!.proposalId]);
  assert.equal(p!.status, 'gated_out');
  assert.ok(p!.gates.failures.some((f: any) => f.gate === 'objection_append_only'), JSON.stringify(p!.gates));
});
