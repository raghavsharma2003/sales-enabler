// The Operator on the REAL modules (server/modules/index.ts), with a scripted model: no request may carry more than
// MAX_OFFERED tools, and a tool found through operator_find_tools can be called in the same turn. The script builds an
// agent on the default stack and one on a stack built from parts, publishes, makes an audience and a campaign, and
// ends in approval cards. Synthetic data only; fresh workspace per run. Skipped when DATABASE_URL is unset.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmReply, type LlmRequest } from '../server/llm.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { MAX_OFFERED, findTools, selectTools } from '../server/modules/operator/toolset.ts';
import { componentsFor } from '../shared/components.ts';

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
  await new Promise<void>(res => app.server.listen(0, '127.0.0.1', res));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = async () => { app.server.close(); app.server.closeAllConnections?.(); };
});
after(async () => { setFakeLlm(null); await close?.(); await pool?.end(); });

async function http(member: string, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-vp-dev-member': member }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, text: await res.text() };
}
const frames = (text: string) => text.split('\n\n').filter(Boolean).map(f => ({ event: /^event: (.+)$/m.exec(f)?.[1] ?? '', data: JSON.parse(/^data: (.+)$/m.exec(f)?.[1] ?? 'null') }));
const cardsOf = (text: string) => frames(text).filter(f => f.event === 'card' && f.data.card.type !== 'plan').map(f => f.data.card);

/** The latest result of each tool (by its dotted name) in the conversation so far, parsed from its <data> block. */
function results(req: LlmRequest): Record<string, any> {
  const out: Record<string, any> = {};
  for (const m of req.messages) {
    if (m.role !== 'tool') continue;
    const src = /source="tool:([^"]+)"/.exec(m.content)?.[1];
    const body = m.content.replace(/^<data[^>]*>\n/, '').replace(/\n<\/data>$/, '');
    if (src) try { out[src] = JSON.parse(body); } catch { /* not JSON */ }
  }
  return out;
}
/** A field from every result of one tool, in order. Large results reach the model clipped (not valid JSON), so read by pattern. */
function fields(req: LlmRequest, tool: string, key: string): string[] {
  return req.messages.filter(m => m.role === 'tool' && m.content.includes(`source="tool:${tool}"`))
    .map(m => new RegExp(`"${key}":"([^"]+)"`).exec(m.content)?.[1] ?? '');
}
const call = (name: string, args: unknown) => ({ id: 'c' + Math.random().toString(36).slice(2), name, args: JSON.stringify(args) });
const names = (req: LlmRequest) => (req.tools ?? []).map(t => t.name);

/** Script one turn: each step sees the request and returns the reply. Records every request across turns. */
const seen: LlmRequest[] = [];
/** Every request since `from` carried at most MAX_OFFERED tools; logs the payload size (n, tools, chars). */
function checkSizes(from: number, label: string) {
  const reqs = seen.slice(from);
  const sizes = reqs.map(r => JSON.stringify(r.tools ?? []).length);
  const counts = reqs.map(r => (r.tools ?? []).length);
  console.log(`# ${label}: n=${reqs.length} requests, tools ${Math.min(...counts)}-${Math.max(...counts)}, schema chars min ${Math.min(...sizes)} mean ${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)} max ${Math.max(...sizes)}`);
  for (const n of counts) assert.ok(n <= MAX_OFFERED, `a request offered ${n} tools (cap ${MAX_OFFERED})`);
}
function script(steps: ((req: LlmRequest) => Partial<LlmReply>)[]) {
  let i = 0;
  setFakeLlm(req => {
    seen.push(structuredClone(req));
    const out = steps[Math.min(i++, steps.length - 1)]!(req);
    return { text: '', toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 }, model: 'scripted', provider: 'fake', ...out };
  });
}

test('toolset: page, words and history pick the tools; find_tools ranks by name and summary', () => {
  const allowed = [
    ...['agent.create', 'agent.get', 'stack.set', 'stack.list', 'version.publish', 'campaign.draft', 'campaign.launch', 'audience.create', 'number.rent', 'number.search', 'wallet.topup']
      .map(name => ({ name, summary: name.replace('.', ' ') })),
    ...Array.from({ length: 60 }, (_, i) => ({ name: `filler.t${i}`, summary: 'unrelated filler tool' })),
  ];
  const onAgents = selectTools({ allowed, page: '/agents/123', text: 'hello', history: [], found: [] });
  assert.ok(onAgents.includes('stack.set') && onAgents.includes('version.publish'));
  assert.ok(!onAgents.includes('number.rent'));
  assert.ok(onAgents.length <= MAX_OFFERED - 2);
  assert.ok(selectTools({ allowed, text: 'rent a number for this', history: [], found: [] }).includes('number.rent'), 'the words of the message pick tools');
  assert.equal(selectTools({ allowed, text: 'x', history: [], found: ['wallet.topup'] })[0], 'wallet.topup', 'found tools come first');
  assert.equal(findTools('rent a phone number', allowed)[0]!.name, 'number.rent');
  assert.deepEqual(selectTools({ allowed: allowed.slice(0, 5), text: 'x', history: [], found: [] }), allowed.slice(0, 5).map(t => t.name), 'a small set is offered whole');
});

test('Operator on the real modules: ≤ 40 tools per request, find_tools then call in the same turn, flow ends in approval cards', { skip }, async () => {
  const w = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('toolset test') RETURNING id"))!.id;
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1)', [w]);
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [w, `o${Math.random()}@example.test`]))!.id;
  const contacts: string[] = [];
  for (let i = 0; i < 3; i++) contacts.push((await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,$3) RETURNING id', [w, `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, `Synthetic ${i}`]))!.id);
  const thread = JSON.parse((await http(owner, 'POST', '/v1/operator/threads', {})).text).thread.id as string;
  const send = (text: string, page: string) => http(owner, 'POST', `/v1/operator/threads/${thread}/messages`, { text, page });

  // The guard is meaningful: without a selection, an owner would be offered far more than the cap.
  const ownerTools = registry.list().filter(t => t.roles.includes('owner') && t.name !== 'integration.stage_secrets');
  assert.ok(ownerTools.length > MAX_OFFERED * 3, `owner may use ${ownerTools.length} tools`);

  // Turn 1, on the agents page: two agents (default stack; a stack built from parts), publish the first.
  const ears = componentsFor('ears')[0]!.id, brain = componentsFor('brain')[0]!.id, voice = componentsFor('voice')[0]!.id;
  const start1 = seen.length;
  script([
    () => ({ toolCalls: [call('template_list', {}), call('stack_list', {})] }),
    req => { const tpl = fields(req, 'template.list', 'id')[0];
      return { toolCalls: [call('agent_create', { name: 'AC service reminders', templateId: tpl }), call('agent_create', { name: 'AC service, built stack', templateId: tpl })] }; },
    req => { const def = fields(req, 'stack.list', 'default')[0]; const agents = fields(req, 'agent.create', 'agentId');
      return { toolCalls: [call('stack_set', { agentId: agents[0], stackId: def }), call('stack_set', { agentId: agents[1], stackId: 'custom', components: { ears, brain, voice } })] }; },
    req => ({ toolCalls: [call('version_publish', { agentId: fields(req, 'agent.create', 'agentId')[0], draftHash: fields(req, 'stack.set', 'draftHash')[0], note: 'first version' })] }),
    () => ({ text: 'Both agents are drafted; publishing the first waits for your approval.' }),
  ]);
  const t1 = await send('Create an AC service reminder agent on the default voice stack, and a second one on a stack I build myself, then publish the first.', '/agents');
  assert.equal(t1.status, 200);
  const c1 = cardsOf(t1.text);
  assert.deepEqual(c1.map(c => `${c.type}:${c.tool}:${c.status}`), [
    'receipt:agent.create:confirmed', 'receipt:agent.create:confirmed', 'receipt:stack.set:confirmed', 'receipt:stack.set:confirmed', 'approval:version.publish:proposed']);
  const stacks = await pool.query("SELECT name, draft->'voice'->>'stackId' AS stack FROM agent WHERE workspace_id = $1", [w]);
  const def = (await registry.execute<any>(pool, 'stack.list', {}, { workspaceId: w, actor: { type: 'system' } }) as any).result.default;
  assert.deepEqual(Object.fromEntries(stacks.rows.map(r => [r.name, r.stack])), { 'AC service reminders': def, 'AC service, built stack': 'custom' },
    'one agent on the default stack, one on a stack built from parts');
  checkSizes(start1, 'turn 1 (agents page)');
  const pub = await http(owner, 'POST', `/v1/actions/${c1[4].actionId}/decide`, { approve: true });
  const version = JSON.parse(pub.text);
  assert.equal(version.status, 'confirmed', pub.text);
  const agentId = (await one<{ id: string }>(pool, "SELECT id FROM agent WHERE workspace_id = $1 AND name = 'AC service reminders'", [w]))!.id;

  // Turn 2, on the campaigns page: audience and campaign; renting a number is found with find_tools, then called.
  const start2 = seen.length;
  script([
    req => { assert.ok(!names(req).includes('number_rent'), 'number.rent is not offered on the campaigns page before a lookup');
      return { toolCalls: [call('audience_create', { name: 'October AC customers', contactIds: contacts })] }; },
    req => { const aud = fields(req, 'audience.create', 'id')[0] || fields(req, 'audience.create', 'audienceId')[0];
      return { toolCalls: [call('campaign_draft', { name: 'October AC reminders', category: 'service', agentVersionId: version.result.versionId, audienceId: aud,
        window: { days: [1, 2, 3, 4, 5, 6], ranges: [{ start: '10:00', end: '19:00' }] } })] }; },
    () => ({ toolCalls: [call('operator_find_tools', { query: 'rent a phone number to call from' })] }),
    req => { const found = results(req).operator_find_tools;
      assert.ok(found.tools.some((t: any) => t.name === 'number_rent'), JSON.stringify(found));
      assert.ok(names(req).includes('number_rent'), 'the tool found is offered on the next model call of the same turn');
      return { toolCalls: [call('number_rent', { offerRef: 'synthetic-offer-1', displayName: 'AC reminders' }),
        call('deployment_split', { agentId, binding: 'campaign', split: [{ versionId: version.result.versionId, percent: 100 }] })] }; },
    req => ({ toolCalls: [call('campaign_launch', { id: fields(req, 'campaign.draft', 'id')[0] })] }),
    () => ({ text: 'The campaign is drafted. Renting the number, deploying and launching wait for your approval.' }),
  ]);
  const t2 = await send('Make an audience of my three customers and draft a service campaign for the AC reminder agent, and get us a number to call from.', '/campaigns');
  const c2 = cardsOf(t2.text);
  assert.deepEqual(c2.map(c => `${c.type}:${c.tool}:${c.status}`), [
    'receipt:audience.create:confirmed', 'receipt:campaign.draft:confirmed',
    'approval:number.rent:proposed', 'approval:deployment.split:proposed', 'approval:campaign.launch:proposed'], JSON.stringify(c2));
  const done = frames(t2.text).find(f => f.event === 'done')!.data;
  assert.equal(done.stoppedBy, undefined, 'the turn finished within its caps');

  checkSizes(start2, 'turn 2 (campaigns page, with find_tools)');
  assert.ok(seen.length - start1 >= 10);
});
