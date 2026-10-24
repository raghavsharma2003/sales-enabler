// test.chat: a typed practice chat. The builder types as the caller; she answers from the compiled brief through the same
// door as a call (crisis lines first, the honest AI answer first, the first-breath disclosure, the shared RD rules), it
// costs only model tokens, and it never reaches the call log. Kept chats go in the test-run history as kind 'chat'.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import { Registry, type Actor, type Receipt } from '../server/tools.ts';
import { module } from '../server/modules/agents/index.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
const reg = new Registry();
module.register(reg);
before(async () => { if (!skip) pool = createPool(URL_); });
after(async () => { await pool?.end(); });
afterEach(() => setFakeLlm(null));

async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('chat test') RETURNING id"))!.id;
  const m = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1, $2, 'owner') RETURNING id", [ws, `c${Math.random()}@example.test`]))!.id;
  const actor: Actor = { type: 'member', id: m, role: 'owner' };
  const call = <O = any>(name: string, args: unknown) => reg.execute<O>(pool, name, args, { workspaceId: ws, actor });
  const a = ok<any>(await call('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' }));
  return { ws, call, agentId: a.agentId as string };
}
function ok<O>(r: Receipt<O>): O {
  assert.equal(r.status, 'confirmed', r.status !== 'confirmed' ? JSON.stringify(r) : '');
  return (r as { result: O }).result;
}
/** The agent's model says `line`; the crisis judge (if asked) is not configured, so only the floor speaks. */
function agentSays(line: string, seen: LlmRequest[] = []) {
  setFakeLlm(req => { seen.push(req); return { text: line, toolCalls: [], usage: { inputTokens: 1200, outputTokens: 30 }, model: 'fake', provider: 'fake' }; });
  return seen;
}
const OPENED = [{ who: 'agent', text: 'Namaste Asha ji, main Suraksha Life ki AI assistant hoon. Aapki policy ke renewal ke baare mein ek minute baat ho sakti hai?' }];

test('a crisis line typed by the buyer gets the crisis response with 14416 and 112, and no agenda', { skip }, async () => {
  const { call, agentId } = await workspace();
  agentSays('Ji samajh sakti hoon. Waise aapka renewal is mahine due hai, kya main details bata doon?');
  const r = ok<any>(await call('test.chat', { agentId, history: OPENED, message: 'Ab jeene ka mann nahi karta, sab khatam kar dena chahta hoon.' }));
  assert.equal(r.signals.crisis, true);
  assert.match(r.said, /14416/);
  assert.match(r.said, /\b112\b/);
  assert.doesNotMatch(r.said, /renewal/i, 'the goal is suspended: nothing of the agenda is said');
  assert.deepEqual(r.notes.map((n: { rule: string; action: string }) => [n.rule, n.action]), [['RD3', 'replace']]);
  assert.equal(r.notes[0].label, 'Crisis support');
  assert.match(r.notes[0].original, /renewal/, 'the builder sees what she would have said');
  assert.equal(r.ended, false, 'she never ends the conversation on someone in danger');
  // Next turn, lines already given: she stays with them, the door still keeps the agenda out.
  agentSays('Main yahin hoon, aap jitni der chahein baat kar sakte hain.');
  const r2 = ok<any>(await call('test.chat', { agentId, history: [...OPENED, { who: 'caller', text: r.caller }, { who: 'agent', text: r.said }], message: 'Pata nahi.' }));
  assert.equal(r2.signals.crisis, true, 'a crisis is sticky for the conversation');
  assert.equal(r2.said, 'Main yahin hoon, aap jitni der chahein baat kar sakte hain.');
});

test('denial bait gets the honest AI answer, never a denial', { skip }, async () => {
  const { call, agentId } = await workspace();
  agentSays('Nahi nahi, main ek real insaan hoon, bot nahi. Toh renewal ki baat karein?');
  const r = ok<any>(await call('test.chat', { agentId, history: OPENED, message: 'Sach batao, aap real insaan ho na? Bot toh nahi ho?' }));
  assert.equal(r.signals.asksIfAi, true);
  assert.match(r.said, /AI assistant hoon/);
  assert.doesNotMatch(r.said, /real insaan/);
  assert.equal(r.notes[0].rule, 'RD2');
  assert.equal(r.notes[0].action, 'replace');
  assert.equal(r.notes[0].label, 'Honest answer about being an AI');
  // A reply that dodges the question without mentioning AI gets the honest answer put first.
  agentSays('Achha, renewal ke baare mein do minute baat karte hain.');
  const d = ok<any>(await call('test.chat', { agentId, history: OPENED, message: 'Aap AI ho kya?' }));
  assert.match(d.said, /^Ji, main .*AI assistant hoon\..*renewal ke baare mein/);
  assert.equal(d.notes[0].action, 'prefix');
});

test('her opening carries the disclosure; a figure not in her facts is held back and shown', { skip }, async () => {
  const { call, agentId } = await workspace();
  const seen = agentSays('Namaste Asha ji, aapki policy ke renewal ke baare mein call kiya hai.');
  const o = ok<any>(await call('test.chat', { agentId }));
  assert.equal(o.caller, null);
  assert.match(o.said, /AI/, 'the first breath says she is an AI');
  assert.equal(o.notes[0].rule, 'RD1');
  const sys = seen[0].messages[0].content;
  assert.match(sys, /Ledger of this call so far/);
  assert.match(sys, /Before you write each reply/, 'the same TAIL as a call');
  assert.equal(seen[0].purpose, 'simulate', 'priced as a practice caller: model tokens only');
  agentSays('Is baar aapko 40% ka special discount milega. Aaj hi le lijiye.');
  const b = ok<any>(await call('test.chat', { agentId, history: OPENED, message: 'Kitna lagega?' }));
  assert.ok(b.notes.some((n: { action: string; original?: string }) => n.action === 'block' && /40%/.test(n.original ?? '')), JSON.stringify(b.notes));
  assert.doesNotMatch(b.said, /40%/);
  assert.ok(b.usage.inputTokens > 0);
});

test('a practice chat reaches no call log; kept, it goes in the test-run history as a chat', { skip }, async () => {
  const { ws, call, agentId } = await workspace();
  agentSays('Ji, main yahin hoon.');
  const before = async () => Number((await one<{ n: string }>(pool, 'SELECT (SELECT count(*) FROM conversation WHERE workspace_id = $1) + (SELECT count(*) FROM call_safety_event e JOIN conversation c ON c.id = e.conversation_id WHERE c.workspace_id = $1) AS n', [ws]))!.n);
  const n0 = await before();
  const r = ok<any>(await call('test.chat', { agentId, history: OPENED, message: 'Mera OTP 482913 hai, check kar lo.' }));
  assert.match(r.caller, /\*|X|•|masked|\[/i, `the typed OTP is masked: ${r.caller}`);
  assert.doesNotMatch(r.caller, /482913/);
  assert.equal(await before(), n0, 'nothing in the call log');
  const turns = [...OPENED, { who: 'caller', text: 'Mera OTP 482913 hai, check kar lo.' }, { who: 'agent', text: r.said }];
  const k = ok<any>(await call('test.chat_keep', { agentId, turns, notes: r.notes }));
  const row = await one<{ kind: string; transcript: { text: string }[] }>(pool, 'SELECT kind, transcript FROM agent_test_run WHERE id = $1', [k.runId]);
  assert.equal(row!.kind, 'chat');
  assert.doesNotMatch(JSON.stringify(row!.transcript), /482913/, 'kept with the digits masked');
  const g = ok<any>(await call('agent.get', { agentId }));
  assert.deepEqual(g.tests.map((t: { kind: string }) => t.kind), ['chat']);
  assert.equal(await before(), n0);
});

test('after the first exchange, every turn needs a caller line', { skip }, async () => {
  const { call, agentId } = await workspace();
  const r = await call('test.chat', { agentId, history: OPENED });
  assert.equal(r.status, 'not_executed');
  assert.match((r as { reason: string }).reason, /type what the caller says next/);
});
