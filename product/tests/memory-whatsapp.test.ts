// Memory from WhatsApp (memory/whatsapp.ts): a thread's messages propose facts through the same gates as a call. Exact
// quote inside one inbound message, span {messageId, start, end}; only a verified sender; never an opted-out thread; the
// cursor moves past what was read; nothing crosses workspaces. Fixtures in SQL (synthetic); the model is scripted.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import { Registry, type Actor } from '../server/tools.ts';
import { module as memory } from '../server/modules/memory/index.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
const reg = new Registry();
memory.register(reg);
before(() => { if (!skip) pool = createPool(process.env.DATABASE_URL); });
after(async () => { await pool?.end(); });
afterEach(() => setFakeLlm(null));
const SYS: Actor = { type: 'system' };

let seq = 0;
async function world(o: { onFile?: boolean } = {}) {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('wa memory') RETURNING id"))!.id;
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,'Synthetic Pooja') RETURNING id", [ws, `+9198000${String(seq++).padStart(5, '0')}`]))!.id;
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'WA') RETURNING id", [ws]))!.id;
  await pool.query("INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,'h',$2)", [agent, JSON.stringify({ agent: { category: 'service', memory: { read: true, write: true } } })]);
  await pool.query('INSERT INTO memory_policy (workspace_id, undo_minutes) VALUES ($1, 0)', [ws]);
  const integ = (await one<{ id: string }>(pool, "INSERT INTO integration (workspace_id, kind, name) VALUES ($1,'whatsapp',$2) RETURNING id", [ws, 'wa' + seq]))!.id;
  const conn = (await one<{ id: string }>(pool, `INSERT INTO channel_connection (workspace_id, integration_id, name, phone_number_id, verify_token_hash, agent_id)
    VALUES ($1,$2,'Support',$3,'x',$4) RETURNING id`, [ws, integ, 'pn' + Math.random(), agent]))!.id;
  const thread = (await one<{ id: string }>(pool, 'INSERT INTO channel_thread (workspace_id, connection_id, contact_id, wa_id) VALUES ($1,$2,$3,$4) RETURNING id',
    [ws, conn, o.onFile === false ? null : contact, '91980' + seq]))!.id;
  return { ws, contact, agent, conn, thread };
}
type W = Awaited<ReturnType<typeof world>>;
let t0 = Date.now() - 3600_000;
async function msg(w: W, inbound: boolean, body: string) {
  return (await one<{ id: string }>(pool, `INSERT INTO channel_message (workspace_id, connection_id, thread_id, contact_id, direction, kind, body, author, status, created_at)
    VALUES ($1,$2,$3,$4,$5,'text',$6,$7,$8,$9) RETURNING id`, [w.ws, w.conn, w.thread, w.contact, inbound ? 'inbound' : 'outbound', body, inbound ? 'person' : 'agent',
      inbound ? 'received' : 'sent', new Date(t0 += 1000)]))!.id;
}
function llmSays(facts: unknown[]) {
  const seen: LlmRequest[] = [];
  setFakeLlm(req => { seen.push(req); return { text: JSON.stringify({ facts }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }; });
  return seen;
}
const run = async (w: W, actor: Actor = SYS) => registry(w, actor);
const registry = async (w: W, actor: Actor) => reg.execute<any>(pool, 'memory.extract_thread', { threadId: w.thread }, { workspaceId: w.ws, actor });
const TIME = { kind: 'preference', key: 'best_time', value: 'after 18:00', quote: 'shaam 6 baje ke baad', basis: 'contract' };

test('an inbound message proposes a fact with an exact quote and its span; her words and paraphrases are dropped', { skip }, async () => {
  const w = await world();
  await msg(w, false, 'Namaste! Aapka renewal 5 November ko due hai.');
  const m = await msg(w, true, 'Theek hai, mujhe shaam 6 baje ke baad call kijiye');
  const seen = llmSays([TIME, { ...TIME, key: 'language', value: 'hi', quote: 'Aapka renewal 5 November' }, { ...TIME, key: 'pace', value: 'slow', quote: 'shaam ko call' }]);
  const r = await run(w);
  assert.equal(r.status, 'confirmed', JSON.stringify(r));
  assert.deepEqual([(r as any).result.status, (r as any).result.counts.stored, (r as any).result.counts.quote_not_caller], ['done', 1, 2]);
  assert.match(seen[0].messages[1].content, /PERSON: Theek hai/);
  assert.match(seen[0].messages[1].content, /BUSINESS: Namaste/);
  const f = (await one<any>(pool, 'SELECT channel, channel_message_id, span, quote, conversation_id FROM memory_fact WHERE workspace_id = $1', [w.ws]))!;
  assert.deepEqual([f.channel, f.channel_message_id, f.conversation_id, f.quote], ['whatsapp', m, null, 'shaam 6 baje ke baad']);
  assert.deepEqual(f.span, { messageId: m, start: 'Theek hai, mujhe '.length, end: 'Theek hai, mujhe '.length + 'shaam 6 baje ke baad'.length });
  const b = await reg.execute<any>(pool, 'memory.brief', { contactId: w.contact, agentId: w.agent }, { workspaceId: w.ws, actor: SYS });
  assert.match((b as any).result.text, /best_time=after 18:00/, 'what they wrote is there for the next call');
});

test('the cursor moves past what was read; a second run reads only new messages; nothing new, no model call', { skip }, async () => {
  const w = await world();
  await msg(w, true, 'shaam 6 baje ke baad message kijiye');
  llmSays([TIME]);
  await run(w);
  const seen = llmSays([]);
  const again = await run(w);
  assert.equal((again as any).result.reason, 'no_new_messages');
  assert.equal(seen.length, 0);
  await msg(w, true, 'Hindi mein baat karna pasand hai');
  const seen2 = llmSays([{ ...TIME, key: 'language', value: 'hi', quote: 'Hindi mein baat karna pasand hai' }]);
  const r = await run(w);
  assert.equal((r as any).result.counts.stored, 1);
  assert.doesNotMatch(seen2[0].messages[1].content, /shaam 6 baje/, 'already-read messages are not sent again');
});

test('only a verified sender is remembered, never an opted-out thread, and the same gates hold (refused, personal, forget)', { skip }, async () => {
  const stranger = await world({ onFile: false });
  await msg(stranger, true, 'shaam 6 baje ke baad call kijiye');
  const seen = llmSays([TIME]);
  assert.equal((await run(stranger) as any).result.reason, 'sender_not_verified');
  assert.equal(seen.length, 0);

  const stop = await world();
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, channel, basis, granted, source) VALUES ($1,$2,'all','whatsapp','consent',false,'whatsapp')", [stop.ws, stop.contact]);
  await msg(stop, true, 'shaam 6 baje ke baad call kijiye');
  assert.equal((await run(stop) as any).result.reason, 'whatsapp_opted_out');

  const g = await world();
  await msg(g, true, 'Main hospital mein hoon abhi');
  await msg(g, true, 'Hum Pune shift ho rahe hain');
  llmSays([{ kind: 'context', key: 'life_event', value: 'in hospital', quote: 'hospital mein hoon', basis: 'contract' },
    { kind: 'context', key: 'relocation', value: 'moving to Pune', quote: 'Pune shift ho rahe hain', basis: 'contract' }]);
  const r = await run(g);
  assert.deepEqual([(r as any).result.counts.refused_category, (r as any).result.counts.personal_not_agreed], [1, 1]);

  const f = await world();
  await pool.query(`INSERT INTO memory_fact (workspace_id, contact_id, kind, key, value, quote, purpose, basis, status) VALUES ($1,$2,'preference','language','"hi"','Hindi','service','contract','active')`, [f.ws, f.contact]);
  await msg(f, true, 'Mere baare mein kuch yaad mat rakhna please');
  const seen3 = llmSays([TIME]);
  assert.equal((await run(f) as any).result.reason, 'person_asked_to_forget');
  assert.equal(seen3.length, 0);
  assert.equal((await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM memory_fact WHERE workspace_id = $1', [f.ws]))!.n, 0);
  assert.equal((await one<any>(pool, 'SELECT requested_via FROM forget_request WHERE workspace_id = $1', [f.ws]))!.requested_via, 'whatsapp');
});

test('a person or another workspace cannot run it; the facts stay in the tenant', { skip }, async () => {
  const w = await world(), other = await world();
  await msg(w, true, 'shaam 6 baje ke baad call kijiye');
  llmSays([TIME]);
  assert.equal((await run(w, { type: 'member', id: 'x', role: 'owner' })).status, 'not_executed');
  const cross = await reg.execute<any>(pool, 'memory.extract_thread', { threadId: w.thread }, { workspaceId: other.ws, actor: SYS });
  assert.equal(cross.status, 'not_executed');
  await run(w);
  assert.equal((await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM memory_fact WHERE workspace_id = $1 AND channel = 'whatsapp'", [other.ws]))!.n, 0);
  assert.equal((await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM memory_fact WHERE workspace_id = $1 AND channel = 'whatsapp'", [w.ws]))!.n, 1);
});
