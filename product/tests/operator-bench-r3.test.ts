// Fixes from the round-3 Operator bench (research/2026-10-23/benches-r3/), on the REAL modules with a scripted model.
// Each test failed on the code before its fix. Synthetic data only; fresh workspace per test. Skipped without DATABASE_URL.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmReply, type LlmRequest } from '../server/llm.ts';
import { modules } from '../server/modules/index.ts';
import { claimsChange, CLAIM_CORRECTION } from '../server/modules/operator/loop.ts';
import { DEFAULT_OPERATOR_BRAIN } from '../server/modules/operator/tools.ts';
import type { Registry } from '../server/tools.ts';
import { runBench } from '../scripts/operator-bench.ts';
import { TASKS, type GradeCtx } from '../scripts/operator-bench-tasks.ts';

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

async function member(role = 'owner') {
  const w = await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('Synthetic Appliances') RETURNING id");
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [w!.id]);
  const m = await one<{ id: string }>(pool, 'INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,$3) RETURNING id', [w!.id, `m${Math.random()}@example.test`, role]);
  return { ws: w!.id, member: m!.id };
}
const as = (ws: string, m: string) => ({ workspaceId: ws, actor: { type: 'member' as const, id: m, role: 'owner' as const } });
async function ok(ws: string, m: string, tool: string, args: unknown): Promise<any> {
  const r = await registry.execute<any>(pool, tool, args, as(ws, m));
  if (r.status === 'needs_approval') { const a = await registry.approve<any>(pool, r.actionId, { workspaceId: ws, memberId: m }); assert.equal(a.status, 'confirmed', JSON.stringify(a)); return a.result; }
  assert.equal(r.status, 'confirmed', `${tool}: ${JSON.stringify(r)}`);
  return r.result;
}
async function agent(ws: string, m: string, publish: boolean) {
  const a = await ok(ws, m, 'agent.create', { name: 'Service follow-up', templateId: 'appliance-service-followup' });
  if (!publish) return { agentId: a.agentId as string, versionId: null };
  const set = await ok(ws, m, 'stack.set', { agentId: a.agentId, stackId: 'v2-flashlite' });
  const v = await ok(ws, m, 'version.publish', { agentId: a.agentId, draftHash: set.draftHash, note: 'test' });
  return { agentId: a.agentId as string, versionId: v.versionId as string };
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
const toolMsgs = (req: LlmRequest, tool: string) => req.messages.filter(m => m.role === 'tool' && m.content.includes(`source="tool:${tool}"`)).map(m => m.content);
const pageMsg = (req: LlmRequest) => req.messages.find(m => m.role === 'system' && m.content.includes('source="page"'))?.content ?? '';

test('NOT DONE with a fix says retry, not ask; an agent id sent as agentVersionId names the version id to send', { skip }, async () => {
  const { ws, member: m } = await member();
  const { agentId, versionId } = await agent(ws, m, true);
  const seen = script([
    () => ({ toolCalls: [call('campaign_draft', { name: 'Service', category: 'service', agentVersionId: agentId })] }),
    () => ({ toolCalls: [call('campaign_draft', { name: 'Service', category: 'service', agentVersionId: versionId })] }),
    () => ({ text: 'The draft is ready.' }),
  ]);
  await turn(m, { text: 'Draft a service campaign with my agent.', page: '/campaigns' });
  const refusal = toolMsgs(seen[1]!, 'campaign.draft')[0]!;
  assert.match(refusal, /NOT DONE/);
  assert.match(refusal, new RegExp(`that is the agent id of \\\\"Service follow-up\\\\", not a version id; its latest published version id is ${versionId}`));
  assert.match(refusal, /"fix":"agentVersionId: a PUBLISHED agent version id \(version\.list/);
  assert.match(refusal, /Retry now with the call corrected/);
  assert.doesNotMatch(refusal, /or tell the client/);
  assert.match(seen[0]!.messages[0]!.content, /correct the call and retry it at once; ask the client only for a fact no tool can give you/);
  assert.equal((await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM campaign WHERE workspace_id = $1', [ws]))!.n, 1, 'the retry ran');
  // An unpublished agent says to publish first.
  const draftOnly = await agent(ws, m, false);
  const r = await registry.execute<any>(pool, 'campaign.draft', { name: 'X', category: 'service', agentVersionId: draftOnly.agentId }, as(ws, m));
  assert.equal(r.status, 'not_executed');
  assert.match((r as any).reason, /has no published version yet; publish it with version\.publish/);
});

test('page note: an agent carries its published version id, labelled; an unpublished one says so', { skip }, async () => {
  const { ws, member: m } = await member();
  const pub = await agent(ws, m, true);
  let seen = script([() => ({ text: 'ok' })]);
  await turn(m, { text: 'draft a campaign with this agent', page: `/agents/${pub.agentId}` });
  let note = pageMsg(seen[0]!);
  assert.match(note, new RegExp(`\\(agent id ${pub.agentId}\\)`));
  assert.match(note, new RegExp(`latest published version id is ${pub.versionId}: use that as agentVersionId, never the agent id`));
  // The only agent, named from the campaigns page by the member's words, carries its version id too.
  seen = script([() => ({ text: 'ok' })]);
  await turn(m, { text: 'Draft a service campaign with my agent.', page: '/campaigns' });
  note = pageMsg(seen[0]!);
  assert.match(note, new RegExp(`exactly one agent: "Service follow-up" \\(agent id ${pub.agentId}\\).*latest published version id is ${pub.versionId}`));

  const other = await member();
  const draft = await agent(other.ws, other.member, false);
  seen = script([() => ({ text: 'ok' })]);
  await turn(other.member, { text: 'hi', page: `/agents/${draft.agentId}` });
  assert.match(pageMsg(seen[0]!), /no published version yet: publish it with version\.publish/);
});

test('a CSV attached in chat is staged as a real upload; the model gets its uploadId and can import by it', { skip }, async () => {
  const { ws, member: m } = await member();
  const csv = 'name,phone,city\nAarav Synthetic,+919900000101,Pune\nDiya Synthetic,+919900000102,Nagpur\n';
  let uploadId = '';
  const seen = script([
    req => { uploadId = /staged for import as uploadId ([0-9a-f-]{36})/.exec(req.messages.at(-1)!.content)?.[1] ?? ''; return { toolCalls: [call('source_map', { uploadId })] }; },
    () => ({ toolCalls: [call('source_commit', { uploadId })] }),
    () => ({ text: 'Imported.' }),
  ]);
  await turn(m, { text: 'Import these customers.', page: '/contacts', uploads: [{ name: 'customers.csv', content: csv }] });
  assert.match(uploadId, /^[0-9a-f-]{36}$/, 'the model was told a real upload id');
  assert.ok(await one(pool, 'SELECT 1 FROM intake_upload WHERE id = $1 AND workspace_id = $2', [uploadId, ws]));
  assert.match(toolMsgs(seen[1]!, 'source.map')[0]!, /DONE/);
  assert.equal((await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM contact WHERE workspace_id = $1', [ws]))!.n, 2);
  const mapSchema = registry.get('source.map')!.input.schema as any;
  assert.match(mapSchema.properties.uploadId.description, /never a file name/);
  // A viewer's attachment is not staged, and the model is told why.
  const v = await member('viewer');
  const seen2 = script([() => ({ text: 'ok' })]);
  await turn(v.member, { text: 'Import these.', uploads: [{ name: 'customers.csv', content: csv }] });
  assert.match(seen2[0]!.messages.at(-1)!.content, /was not staged for import: a viewer cannot use source\.upload/);
});

test('a reply that claims a change no tool made is corrected at once and gets one repair turn', { skip }, async () => {
  assert.ok(claimsChange("I've updated the campaign window to weekdays 10 to 6.", false));
  assert.ok(claimsChange('Done. The agent is now on the Sarvam stack.', false));
  assert.ok(claimsChange('The window has been updated.', false));
  assert.ok(!claimsChange('I can update the window if you like.', false));
  assert.ok(!claimsChange('I have not changed anything.', false));
  assert.ok(!claimsChange('Should I publish it?', false));
  assert.ok(!claimsChange('Your campaign was created on 1 October.', false));
  assert.ok(!claimsChange("I've created the launch card; it waits for your approval.", true));

  const { ws, member: m } = await member();
  const seen = script([() => ({ text: "I've updated the campaign window to weekdays 10 to 6." }), () => ({ text: 'Nothing was changed: there is no campaign yet.' })]);
  const f = await turn(m, { text: 'Set the window to weekdays 10 to 6.' });
  assert.equal(seen.length, 2, 'one repair turn');
  assert.ok(f.some(x => x.event === 'notice' && x.data.text === CLAIM_CORRECTION), 'the false claim is corrected in plain words');
  assert.match(seen[1]!.messages.at(-1)!.content, /no tool changed anything in this turn/);
  // After a real write, the same words are not questioned.
  const seen2 = script([() => ({ toolCalls: [call('agent_create', { name: 'Follow-up', templateId: 'appliance-service-followup' })] }), () => ({ text: "I've created the agent." })]);
  const f2 = await turn(m, { text: 'Make a follow-up agent.' });
  assert.equal(seen2.length, 2);
  assert.ok(!f2.some(x => x.event === 'notice'));
  // Only one repair: a model that repeats the claim is corrected once, never looped.
  const seen3 = script([() => ({ text: "I've updated it." })]);
  const f3 = await turn(m, { text: 'Update it.' });
  assert.equal(seen3.length, 2);
  assert.equal(f3.filter(x => x.event === 'notice').length, 1);
  void ws;
});

test('the Operator default brain is gpt-4.1 when the deployment curates it; a workspace choice still wins', { skip }, async () => {
  assert.equal(DEFAULT_OPERATOR_BRAIN, 'gpt-4.1');
  const { ws, member: m } = await member();
  process.env.VP_OPERATOR_BRAINS = 'gpt-4.1-mini,gpt-4.1';
  try {
    let seen = script([() => ({ text: 'ok' })]);
    await turn(m, { text: 'hi' });
    assert.equal(seen[0]!.model, 'gpt-4.1');
    await pool.query("INSERT INTO operator_setting (workspace_id, brain) VALUES ($1,'gpt-4.1-mini')", [ws]);
    seen = script([() => ({ text: 'ok' })]);
    await turn(m, { text: 'hi' });
    assert.equal(seen[0]!.model, 'gpt-4.1-mini');
    process.env.VP_OPERATOR_BRAINS = 'something-else';
    await pool.query('DELETE FROM operator_setting WHERE workspace_id = $1', [ws]);
    seen = script([() => ({ text: 'ok' })]);
    await turn(m, { text: 'hi' });
    assert.equal(seen[0]!.model, undefined, 'not curated here: the deployment model runs');
  } finally { delete process.env.VP_OPERATOR_BRAINS; }
});

test('bench: a provider refusal is "not measured", never a pass, and outside every count', { skip }, async () => {
  const r = await runBench({ fake: true, tasks: ['ref-apikey', 'stack-sarvam'], log: () => {}, scripts: {
    'ref-apikey': () => [{ error: 'model returned 400: {"error":{"message":"The response was filtered due to the prompt triggering Azure OpenAI\'s content management policy.","code":"content_filter"}}' }],
  } });
  const by = Object.fromEntries(r.tasks.map(t => [t.id, t]));
  assert.equal(by['ref-apikey']!.status, 'not_measured', by['ref-apikey']!.why);
  assert.deepEqual(r.summary.notMeasured, ['ref-apikey']);
  assert.equal(r.summary.run, 1);
  assert.equal(r.summary.byCategory.refusal, undefined);
});

test('bench: csv-pune passes a correct filter audience, not only a fixed list', { skip }, async () => {
  const task = TASKS.find(t => t.id === 'csv-pune')!;
  const { ws, member: m } = await member();
  const up = await ok(ws, m, 'source.upload', { kind: 'csv', name: 'leads.csv', filename: 'leads.csv', text: task.uploads![0]!.content });
  await ok(ws, m, 'source.map', { uploadId: up.uploadId });
  await ok(ws, m, 'source.commit', { uploadId: up.uploadId });
  await ok(ws, m, 'audience.create', { name: 'Pune', filter: { all: [{ key: 'city', op: 'eq', value: 'Pune' }] } });
  const g: GradeCtx = { pool, registry, ws, member: m, seed: {}, frames: [], cards: [], reply: '', ran: [] };
  const v = await task.grade(g);
  assert.ok(v.pass, v.why);
});
