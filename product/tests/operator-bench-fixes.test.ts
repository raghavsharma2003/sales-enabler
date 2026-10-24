// Fixes from the round-2 Operator bench (research/2026-10-23/benches-r2/), on the REAL modules with a scripted model:
// the page reaches the model, refusals name the fix, operator_find_tools is offered and described for the turns where
// the selected tools miss, and a provider content-filter refusal is its own plain outcome. Each test failed before its
// fix. Synthetic data only; fresh workspace per test. Skipped when DATABASE_URL is unset.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { LlmError, setFakeLlm, type LlmReply, type LlmRequest } from '../server/llm.ts';
import { modules } from '../server/modules/index.ts';
import { fixFor } from '../server/modules/operator/fix.ts';
import { isContentFilter } from '../server/modules/operator/loop.ts';
import type { Registry } from '../server/tools.ts';

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

async function owner() {
  const w = await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('Synthetic Clinic') RETURNING id");
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [w!.id]);
  const m = await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [w!.id, `o${Math.random()}@example.test`]);
  return { ws: w!.id, member: m!.id };
}
const campaign = async (ws: string, name: string) =>
  (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category) VALUES ($1,$2,'service') RETURNING id", [ws, name]))!.id;

async function turn(member: string, body: Record<string, unknown>) {
  const t = await fetch(base + '/v1/operator/threads', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-dev-member': member }, body: '{}' });
  const id = (await t.json()).thread.id;
  const r = await fetch(base + `/v1/operator/threads/${id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-dev-member': member }, body: JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, threadId: id, frames: text.split('\n\n').filter(Boolean).map(f => ({ event: /^event: (.+)$/m.exec(f)?.[1] ?? '', data: JSON.parse(/^data: (.+)$/m.exec(f)?.[1] ?? 'null') })) };
}
function script(steps: ((req: LlmRequest) => Partial<LlmReply>)[]) {
  const seen: LlmRequest[] = [];
  let i = 0;
  setFakeLlm(req => {
    seen.push(structuredClone(req));
    const out = steps[Math.min(i++, steps.length - 1)]!(req);
    return { text: '', toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 }, model: 'scripted', provider: 'fake', ...out };
  });
  return seen;
}
const call = (name: string, args: unknown) => ({ id: 'c' + Math.random().toString(36).slice(2), name, args: JSON.stringify(args) });
const pageMsg = (req: LlmRequest) => req.messages.find(m => m.role === 'system' && m.content.includes('source="page"'))?.content ?? '';
const toolMsg = (req: LlmRequest, tool: string) => req.messages.find(m => m.role === 'tool' && m.content.includes(`source="tool:${tool}"`))?.content ?? '';

test('page: the campaign the member is looking at reaches the model by name, as data', { skip }, async () => {
  const { ws, member } = await owner();
  const id = await campaign(ws, 'Diwali service reminders');
  await campaign(ws, 'Second campaign');
  const seen = script([() => ({ text: 'ok' })]);
  await turn(member, { text: 'rename it to Festive reminders', page: `/campaigns/${id}` });
  const note = pageMsg(seen[0]!);
  assert.match(note, /trust="untrusted"/);
  assert.match(note, /The member is on \/campaigns\//);
  assert.match(note, new RegExp(`looking at the campaign "Diwali service reminders" \\(campaign id ${id}\\)`));
  assert.match(note, /do not ask which/);
});

test('page: with exactly one campaign, /campaigns names it as "the campaign"; with two it does not guess', { skip }, async () => {
  const one_ = await owner();
  const id = await campaign(one_.ws, 'Only campaign');
  let seen = script([() => ({ text: 'ok' })]);
  await turn(one_.member, { text: 'change the window to weekdays 10 to 6', page: '/campaigns' });
  assert.match(pageMsg(seen[0]!), new RegExp(`exactly one campaign: "Only campaign" \\(campaign id ${id}\\)`));
  // Named in words on another page works too.
  seen = script([() => ({ text: 'ok' })]);
  await turn(one_.member, { text: 'how is the campaign doing?', page: '/' });
  assert.match(pageMsg(seen[0]!), /exactly one campaign: "Only campaign"/);

  const two = await owner();
  await campaign(two.ws, 'A'); await campaign(two.ws, 'B');
  seen = script([() => ({ text: 'Which campaign?' })]);
  await turn(two.member, { text: 'change the window', page: '/campaigns' });
  assert.doesNotMatch(pageMsg(seen[0]!), /exactly one/);
  // Another workspace's single campaign never leaks into this one's note.
  assert.doesNotMatch(pageMsg(seen[0]!), /Only campaign/);
});

test('refusals name the fix: an invented template id lists the valid ids, a missing either-or names both', { skip }, async () => {
  const { member } = await owner();
  const seen = script([
    () => ({ toolCalls: [call('agent_create', { name: 'Webinar caller', templateId: 'webinar-reminder' })] }),
    () => ({ toolCalls: [call('agent_create', { name: 'Webinar caller' })] }),
    () => ({ toolCalls: [call('audience_create', { name: 'Pune' })] }),
    () => ({ text: 'Not done yet.' }),
  ]);
  await turn(member, { text: 'make a webinar reminder agent and an audience for Pune', page: '/agents' });
  const invented = toolMsg(seen[1]!, 'agent.create');
  assert.match(invented, /NOT DONE/);
  assert.match(invented, /"fix":"templateId must be one of: insurance-renewal, [^"]*template\.list/);
  const neither = seen[2]!.messages.filter(m => m.role === 'tool' && m.content.includes('source="tool:agent.create"')).pop()!.content;
  assert.match(neither, /exactly one of templateId \(one of: [^)]*template\.list\) or description/);
  const aud = toolMsg(seen[3]!, 'audience.create');
  assert.match(aud, /exactly one of filter \(e\.g\. /);
  assert.match(aud, /contactIds \(ids from contact\.list\)/);
  // The schemas say it before any call: the template ids are an enum, either-or is in the tool's description.
  const create = seen[0]!.tools!.find(t => t.name === 'agent_create')!.parameters as any;
  assert.ok(create.properties.templateId.enum.includes('insurance-renewal'));
  assert.match(create.description, /exactly one of templateId/);
  assert.equal(create.oneOf, undefined, 'no oneOf: not every provider accepts it');
});

test('refusals name the fix: an unknown field lists the fields, an enum lists its values, brief.edit names its fields', { skip }, () => {
  const create = registry.get('agent.create');
  assert.match(fixFor(create, 'colour', 'colour: is not a known field').fix!, /use only these fields: name, templateId, description/);
  assert.match(fixFor(registry.get('brief.edit'), 'patch[0].op', 'patch[0].op: must be one of: set, remove').fix!, /op must be one of: set, remove, append, add, replace/);
  const edit = fixFor(registry.get('brief.edit'), 'persona.mood', 'persona.mood: is not a known field; the fields there are: notes').fix!;
  assert.match(edit, /Read the draft with agent\.get first/);
  assert.match(edit, /Editable top-level fields: brand, job/);
  const path = (registry.get('brief.edit')!.input.schema as any).properties.patch.items.properties.path.description;
  assert.match(path, /persona, goals, facts, neverSay/);
});

test('operator_find_tools is offered on every call, says when to use it, and brings a missed tool into the turn', { skip }, async () => {
  const { member } = await owner();
  let missed = '';
  const seen = script([
    req => {
      const offered = new Set((req.tools ?? []).map(t => t.name));
      missed = ['webhook_create', 'number_rent', 'apikey_create'].find(n => !offered.has(n) && registry.get(n.replace('_', '.'))) ?? '';
      return { toolCalls: [call('operator_find_tools', { query: missed.replace('_', ' ') })] };
    },
    () => ({ text: 'Found it.' }),
  ]);
  await turn(member, { text: 'hello', page: '/' });
  assert.ok(missed, 'the selection missed at least one real tool');
  for (const req of seen) assert.ok(req.tools!.some(t => t.name === 'operator_find_tools'), 'offered on every call');
  const find = seen[0]!.tools!.find(t => t.name === 'operator_find_tools')!;
  assert.match(find.description, /^Use this when the tool you need is NOT in your offered list/);
  assert.match(seen[0]!.messages[0]!.content, /Never say a capability is missing without calling operator_find_tools first/);
  assert.ok(seen[1]!.tools!.some(t => t.name === missed), `${missed} is offered on the next call`);
});

test('a provider content-filter 400 is a plain "provider refused" outcome: no crash, no retry, nothing changed', { skip }, async () => {
  assert.ok(isContentFilter('model returned 400: {"error":{"message":"The response was filtered due to the prompt triggering Azure OpenAI\'s content management policy.","code":"content_filter"}}'));
  assert.ok(!isContentFilter('model returned 429: rate limited'));
  const { ws, member } = await owner();
  let calls = 0;
  setFakeLlm(() => { calls++; throw new LlmError('model returned 400: {"error":{"message":"The response was filtered due to the prompt triggering Azure OpenAI\'s content management policy.","code":"content_filter","status":400}}', false); });
  const r = await turn(member, { text: 'import this list', uploads: [{ name: 'list.csv', content: 'name,phone\nSynthetic Person,1' }] });
  assert.equal(r.status, 200);
  assert.equal(calls, 1, 'never retried');
  const err = r.frames.find(f => f.event === 'error')!;
  assert.match(err.data.text, /The model provider refused this content/);
  assert.doesNotMatch(err.data.text, /brain did not answer/);
  assert.equal(r.frames.at(-1)!.event, 'done');
  assert.equal(r.frames.at(-1)!.data.stoppedBy, 'provider_refused');
  assert.ok(!r.frames.some(f => f.event === 'notice' && /limit/.test(f.data.text)), 'not reported as a cap');
  const row = await one<{ kind: string }>(pool, "SELECT content->>'kind' AS kind FROM message WHERE thread_id = $1 AND role = 'system'", [r.threadId]);
  assert.equal(row!.kind, 'provider_refused');
  assert.equal((await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM action WHERE workspace_id = $1', [ws]))!.n, 0);
});
