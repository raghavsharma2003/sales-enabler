// Relational memory (memory/gates.ts, brief.ts): a personal detail is kept only when the caller agreed to her keeping it;
// the brief carries the last outcome and at most one personal detail; "yeh yaad mat rakhna" keeps nothing from the call,
// and "mere baare mein kuch yaad mat rakhna" forgets them, read in code from their words. Synthetic data; scripted model.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import { Registry, type Actor } from '../server/tools.ts';
import { module as memory, compileBrief } from '../server/modules/memory/index.ts';
import { forgetAsked, keepAgreements } from '../server/modules/memory/gates.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
const reg = new Registry();
memory.register(reg);
before(() => { if (!skip) pool = createPool(process.env.DATABASE_URL); });
after(async () => { await pool?.end(); });
afterEach(() => setFakeLlm(null));
const SYS: Actor = { type: 'system' };
const isCaller = (s: unknown) => s === 'caller';

test('agreement to keep a detail, and forget requests, are read from the words in Hinglish, English and Devanagari', () => {
  const L = (...x: [string, string][]) => x.map(([speaker, text]) => ({ speaker, text }));
  assert.deepEqual(keepAgreements(L(['caller', 'Hum next month Pune shift ho rahe hain'], ['agent', 'Achha! Kya main yeh yaad rakhun, agli baar ke liye?'], ['caller', 'Haan ji, zaroor']), isCaller), [1]);
  assert.deepEqual(keepAgreements(L(['caller', 'We are moving to Pune'], ['agent', 'Shall I remember that for next time?'], ['caller', 'Yes please']), isCaller), [1]);
  assert.deepEqual(keepAgreements(L(['caller', 'नई नौकरी लगी है'], ['agent', 'बधाई हो! क्या मैं यह याद रखूं?'], ['caller', 'हाँ जी']), isCaller), [1]);
  assert.deepEqual(keepAgreements(L(['agent', 'Kya main yeh yaad rakhun?'], ['caller', 'Nahi, mat rakhiye']), isCaller), [], 'a no is not a yes');
  assert.deepEqual(keepAgreements(L(['agent', 'Aapka renewal 5 November ko hai'], ['caller', 'Haan ji']), isCaller), [], 'a yes to something else is not agreement');
  assert.equal(forgetAsked(['Yeh baat yaad mat rakhna please']), 'this');
  assert.equal(forgetAsked(["Please don't remember this"]), 'this');
  assert.equal(forgetAsked(['यह याद मत रखना']), 'this');
  assert.equal(forgetAsked(['Mere baare mein kuch yaad mat rakhna']), 'all');
  assert.equal(forgetAsked(['sab kuch bhool jao jo maine bataya']), 'all');
  assert.equal(forgetAsked(['मेरे बारे में सब भूल जाओ']), 'all');
  assert.equal(forgetAsked(['Mujhe yaad dila dena kal', 'Main bhool gaya tha payment']), null, 'remind me / I forgot are not forget requests');
});

let seq = 0;
async function world(category = 'service') {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('relational test') RETURNING id"))!.id;
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,'Synthetic Neha') RETURNING id", [ws, `+9197000${String(seq++).padStart(5, '0')}`]))!.id;
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'A') RETURNING id", [ws]))!.id;
  const version = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,'h',$2) RETURNING id",
    [agent, JSON.stringify({ agent: { category, memory: { read: true, write: true } } })]))!.id;
  await pool.query('INSERT INTO memory_policy (workspace_id, undo_minutes) VALUES ($1, 0)', [ws]);
  return { ws, contact, agent, version };
}
type W = Awaited<ReturnType<typeof world>>;
async function call(w: W, turns: [string, string][], o: { outcome?: string; daysAgo?: number; version?: string; channel?: string } = {}) {
  const at = new Date(Date.now() - (o.daysAgo ?? 0) * 86_400_000);
  const conv = (await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, contact_id, agent_version_id, channel, status, started_at, ended_at, outcome)
    VALUES ($1,$2,$3,$4,'done',$5,$5,$6) RETURNING id`, [w.ws, w.contact, o.version ?? w.version, o.channel ?? 'phone', at, o.outcome ?? null]))!.id;
  for (let i = 0; i < turns.length; i++) await pool.query('INSERT INTO turn (conversation_id, idx, speaker, text) VALUES ($1,$2,$3,$4)', [conv, i, turns[i][0], turns[i][1]]);
  return conv;
}
function llmSays(facts: unknown[]) {
  const seen: LlmRequest[] = [];
  setFakeLlm(req => { seen.push(req); return { text: JSON.stringify({ facts }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }; });
  return seen;
}
const extract = async (w: W, conv: string) => ((await reg.execute<any>(pool, 'memory.extract', { conversationId: conv }, { workspaceId: w.ws, actor: SYS })) as any).result;
const brief = async (w: W) => ((await reg.execute<any>(pool, 'memory.brief', { contactId: w.contact, agentId: w.agent }, { workspaceId: w.ws, actor: SYS })) as any).result;
const MOVE = { kind: 'context', key: 'relocation', value: 'moving to Pune next month', quote: 'Pune shift ho rahe hain', basis: 'contract', retention: 'durable' };
const JOB = { kind: 'context', key: 'life_event', value: 'new job', quote: 'naukri lagi hai', basis: 'contract', retention: 'call_to_call' };

test('a personal detail is kept only when they agreed; without the yes it is dropped and counted', { skip }, async () => {
  const w = await world();
  llmSays([MOVE]);
  const no = await extract(w, await call(w, [['caller', 'Hum next month Pune shift ho rahe hain'], ['agent', 'Achha, all the best.'], ['caller', 'Haan ji']]));
  assert.equal(no.counts.personal_not_agreed, 1);
  assert.equal(no.counts.stored ?? 0, 0);
  llmSays([MOVE]);
  const yes = await extract(w, await call(w, [['caller', 'Hum next month Pune shift ho rahe hain'], ['agent', 'Achha! Kya main yeh yaad rakhun, agli baar ke liye?'], ['caller', 'Haan ji, zaroor']]));
  assert.equal(yes.counts.stored, 1);
  assert.match((await brief(w)).text, /personal: relocation=moving to Pune next month \(said today\)/);
});

test('the brief carries the last outcome for the same purpose and at most one personal detail, as shapes', { skip }, async () => {
  const w = await world();
  const promo = await world('promotional');
  const promoVersion = promo.version;   // a version for another purpose, in another workspace, must never feed this brief
  void promoVersion;
  const agree: [string, string][] = [['agent', 'Kya main yeh yaad rakhun?'], ['caller', 'Haan ji']];
  llmSays([MOVE]);
  await extract(w, await call(w, [['caller', 'Hum next month Pune shift ho rahe hain'], ...agree], { daysAgo: 9 }));
  llmSays([JOB]);
  await extract(w, await call(w, [['caller', 'Nayi naukri lagi hai mujhe'], ...agree], { daysAgo: 2, outcome: 'promise_to_pay' }));
  await call(w, [['caller', 'Haan']], { outcome: 'not_interested', channel: 'test' });            // test calls never count
  const b = await brief(w);
  assert.equal(b.status, 'ok');
  assert.match(b.text, /last: outcome=promise_to_pay \(2 days ago\)/);
  assert.match(b.text, /personal: life_event=new job \(said 2 days ago\)/);
  assert.doesNotMatch(b.text, /relocation/, 'one personal detail at most: the newest');
  assert.doesNotMatch(b.text, /Pune shift|naukri lagi|"/, 'shapes, never their words');
  // Order: open promises before the last outcome, the personal detail after what was heard.
  const c = compileBrief([{ id: '1', kind: 'commitment', key: 'pay_by', value: 'Friday', saidAt: new Date() }, { id: '2', kind: 'objection', key: 'price', value: 'high', saidAt: new Date() },
    { id: '3', kind: 'context', key: 'life_event', value: 'new job', saidAt: new Date() }], new Date(), undefined, { outcome: 'promise_to_pay', at: new Date() });
  assert.equal(c.text, 'open: pay_by=Friday (said today) | last: outcome=promise_to_pay (today) | heard: price=high (said today) | personal: life_event=new job (said today)');
});

test('"yeh yaad mat rakhna" keeps nothing from that call and never reaches the model; earlier memory stays', { skip }, async () => {
  const w = await world();
  llmSays([{ kind: 'preference', key: 'language', value: 'hi', quote: 'Hindi mein baat kijiye', basis: 'contract' }]);
  await extract(w, await call(w, [['caller', 'Hindi mein baat kijiye']], { daysAgo: 3 }));
  const seen = llmSays([MOVE]);
  const r = await extract(w, await call(w, [['caller', 'Hum Pune shift ho rahe hain, par yeh yaad mat rakhna']]));
  assert.deepEqual([r.status, r.reason], ['skipped', 'caller_asked_not_to_keep']);
  assert.equal(seen.length, 0);
  assert.equal((await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM memory_fact WHERE workspace_id = $1', [w.ws]))!.n, 1);
  assert.match((await brief(w)).text, /language=hi/);
});

test('"mere baare mein kuch yaad mat rakhna" forgets them now, records the request as done, and stores nothing', { skip }, async () => {
  const w = await world();
  llmSays([{ kind: 'preference', key: 'language', value: 'hi', quote: 'Hindi mein baat kijiye', basis: 'contract' }]);
  await extract(w, await call(w, [['caller', 'Hindi mein baat kijiye']], { daysAgo: 3 }));
  const seen = llmSays([MOVE]);
  const r = await extract(w, await call(w, [['caller', 'Aur haan, mere baare mein kuch yaad mat rakhna']]));
  assert.equal(r.reason, 'caller_asked_to_forget');
  assert.equal(seen.length, 0);
  assert.equal((await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM memory_fact WHERE workspace_id = $1', [w.ws]))!.n, 0);
  const fr = (await one<any>(pool, 'SELECT scope, status, requested_via, receipt, evidence FROM forget_request WHERE workspace_id = $1', [w.ws]))!;
  assert.deepEqual([fr.scope, fr.status, fr.requested_via, fr.receipt.factsRemoved, fr.evidence.detectedBy], ['forget_memory', 'done', 'caller', 1, 'code']);
  assert.doesNotMatch(JSON.stringify(fr), /Hindi|yaad/, 'the record holds no words');
  assert.equal((await brief(w)).status, 'empty');
});
