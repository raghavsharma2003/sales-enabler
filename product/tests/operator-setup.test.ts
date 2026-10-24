// Owner directive 2026-10-24 (calling first, then the whole product end to end through the assistant): set up from one
// conversation, "what went wrong on that call?", and reset by chat. Real modules, scripted model, synthetic data only.
// Skipped without DATABASE_URL.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmReply, type LlmRequest } from '../server/llm.ts';
import { modules } from '../server/modules/index.ts';
import { setupNote } from '../server/modules/operator/loop.ts';
import { intentsOf } from '../server/modules/operator/toolset.ts';
import type { Registry } from '../server/tools.ts';
import { TASKS, type SeedCtx } from '../scripts/operator-bench-tasks.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let registry: Registry;
let base = '';
let close: () => Promise<void>;

before(async () => {
  if (skip) return;
  process.env.VP_DEV_AUTH = '1';
  pool = createPool(URL_);
  const app = buildApp(pool, modules);
  registry = app.registry;
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = async () => { app.server.close(); app.server.closeAllConnections?.(); };
});
afterEach(() => setFakeLlm(null));
after(async () => { setFakeLlm(null); await close?.(); await pool?.end(); });

async function owner(): Promise<SeedCtx> {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('Synthetic Insurance') RETURNING id"))!.id;
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [ws]);
  const member = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  return { pool, registry, ws, member };
}
async function turn(m: string, body: Record<string, unknown>) {
  const h = { 'content-type': 'application/json', 'x-vp-dev-member': m };
  const id = (await (await fetch(base + '/v1/operator/threads', { method: 'POST', headers: h, body: '{}' })).json()).thread.id;
  const text = await (await fetch(base + `/v1/operator/threads/${id}/messages`, { method: 'POST', headers: h, body: JSON.stringify(body) })).text();
  return text.split('\n\n').filter(Boolean).map(f => ({ event: /^event: (.+)$/m.exec(f)?.[1] ?? '', data: JSON.parse(/^data: (.+)$/m.exec(f)?.[1] ?? 'null') }));
}
function script(steps: ((req: LlmRequest) => Partial<LlmReply>)[]) {
  const seen: LlmRequest[] = [];
  let i = 0;
  setFakeLlm(req => {
    seen.push(structuredClone(req));
    return { text: '', toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 }, model: 'scripted', provider: 'fake', ...steps[Math.min(i++, steps.length - 1)]!(req) };
  });
  return seen;
}
const call = (name: string, args: unknown) => ({ id: 'c' + Math.random().toString(36).slice(2), name, args: JSON.stringify(args) });
const lastTool = (req: LlmRequest, tool: string) => req.messages.filter(m => m.role === 'tool' && m.content.includes(`source="tool:${tool}"`)).pop()?.content ?? '';
const SETUP = 'Set up a renewal-reminder agent for my company from our website www.example.in, import this sheet, and call me to test it.';
const CSV = 'name,phone,policy_due\nAsha Synthetic,+919900001111,2026-11-02\nRavi Synthetic,+919900001112,2026-11-05\n';

test('set-up from one conversation: the whole chain is offered, the steps are named in order, and what is missing is said', { skip }, async () => {
  assert.deepEqual(intentsOf(SETUP).map(i => i.key), ['setup']);
  const c = await owner();
  const seen = script([() => ({ text: 'Reading a website is not available yet. Paste the page text or attach a PDF, and I will continue.' })]);
  await turn(c.member, { text: SETUP, page: '/', uploads: [{ name: 'renewals.csv', content: CSV }] });
  const offered = new Set(seen[0]!.tools!.map(t => t.name));
  for (const n of ['agent_create', 'stack_list', 'stack_set', 'source_map', 'source_commit', 'test_chat', 'test_simulate_batch', 'test_ring_member_phone', 'version_publish', 'campaign_draft'])
    assert.ok(offered.has(n), `${n} is offered`);
  const note = seen[0]!.messages.find(m => m.role === 'system' && /set up from one conversation/.test(m.content))!.content;
  assert.match(note, /1\. company facts from the website: NOT AVAILABLE\. Reading a website is not available yet: ask for the page text/);
  assert.match(note, /import the attached sheet: source\.map, source\.commit/);
  assert.match(note, /ring the member's own phone: test\.ring_member_phone/);
  assert.match(note, /ask only for what no tool and nothing they said can tell you/);
  // Without an attachment, the import step is not in the list; a viewer sees what it may not do as not available.
  assert.doesNotMatch(setupNote(() => true, false), /import the attached sheet/);
  assert.match(setupNote(n => !n.startsWith('agent.'), false), /the agent from a template or the job in words: NOT AVAILABLE/);
});

test('set-up: approving which passages the agent may state is the member\'s own tap, asked or not', { skip }, async () => {
  const c = await owner();
  const k = await registry.execute<any>(pool, 'knowledge.ingest', { title: 'About us', text: 'Synthetic Insurance renews policies within 30 days. Helpline: 1800 000 0000.' },
    { workspaceId: c.ws, actor: { type: 'member', id: c.member, role: 'owner' } });
  assert.equal(k.status, 'confirmed', JSON.stringify(k));
  const spans = (await pool.query("SELECT id FROM knowledge_span WHERE workspace_id = $1", [c.ws])).rows.map(r => r.id);
  assert.ok(spans.length > 0);
  const approved = async () => (await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM knowledge_span WHERE workspace_id = $1 AND status = 'approved'", [c.ws]))!.n;
  script([() => ({ toolCalls: [call('knowledge_span_approve', { spanIds: spans, decision: 'approved' })] }), () => ({ text: 'The passages wait for your approval.' })]);
  let f = await turn(c.member, { text: SETUP, page: '/' });
  const card = f.filter(x => x.event === 'card').map(x => x.data.card)[0];
  assert.equal(card.type, 'approval', JSON.stringify(card));
  assert.equal(await approved(), 0, 'nothing approved on the assistant\'s own say');
  // Asked in words, it is still the member's tap that approves (the knowledge tool accepts only a signed-in person).
  script([() => ({ toolCalls: [call('knowledge_span_approve', { spanIds: spans, decision: 'approved' })] }), () => ({ text: 'Tap Approve on the card.' })]);
  f = await turn(c.member, { text: 'Approve those passages.', page: '/' });
  const card2 = f.filter(x => x.event === 'card').map(x => x.data.card)[0];
  assert.equal(card2.type, 'approval');
  assert.equal(await approved(), 0);
  const d = await fetch(base + `/v1/actions/${card2.actionId}/decide`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-dev-member': c.member }, body: JSON.stringify({ approve: true }) });
  assert.equal(d.status, 200, await d.text());
  assert.equal(await approved(), spans.length, 'the member\'s tap approved them');
});

test('"what went wrong on that call?": the call tools are offered, reads run, and a fix is not made until asked', { skip }, async () => {
  const q = 'Why did she cut me off at 1:20 on that call?';
  assert.deepEqual(intentsOf(q).map(i => i.key), ['diagnose']);
  const c = await owner();
  const seed = await TASKS.find(t => t.id === 'q-hangups')!.seed!(c);
  const conv = (await one<{ id: string }>(pool, 'SELECT id FROM conversation WHERE workspace_id = $1 LIMIT 1', [c.ws]))!.id;
  const seen = script([
    () => ({ toolCalls: [call('call_explain', { conversationId: conv })] }),
    () => ({ toolCalls: [call('brief_edit', { agentId: seed.agentId, patch: [{ op: 'set', path: 'limits.maxSilenceS', value: 8 }] })] }),
    () => ({ text: 'She ended the call at the silence limit. I can raise the silence limit if you want.' }),
  ]);
  await turn(c.member, { text: q, page: `/calls/${conv}` });
  const offered = new Set(seen[0]!.tools!.map(t => t.name));
  assert.ok(offered.has('call_explain') && offered.has('call_get'));
  assert.match(seen[0]!.messages.find(m => m.role === 'system' && /what went wrong on a call/.test(m.content))!.content, /Change nothing until the client asks for the fix/);
  assert.doesNotMatch(lastTool(seen[1]!, 'call.explain'), /held/);
  assert.match(lastTool(seen[2]!, 'brief.edit'), /held: the client asked a question about a call, not for brief\.edit/);
});

test('reset by chat: "start over", "archive" and "restore" offer the reset tools that are registered', () => {
  for (const t of ['Start over from scratch', 'Archive the old agent', 'Restore the agent I archived']) assert.ok(intentsOf(t).some(i => i.key === 'reset'), t);
});
