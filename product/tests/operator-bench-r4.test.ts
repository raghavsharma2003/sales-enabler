// Fixes from the round-4 Operator bench (research/2026-10-24/benches-r4/), on the REAL modules with a scripted model.
// Each test failed on the code before its fix. Synthetic data only; fresh workspace per test. Skipped without DATABASE_URL.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmReply, type LlmRequest } from '../server/llm.ts';
import { modules } from '../server/modules/index.ts';
import { checkReply, claimsChange, knownNumbers, unsupportedNumbers } from '../server/modules/operator/check.ts';
import { fixFor } from '../server/modules/operator/fix.ts';
import { selectTools } from '../server/modules/operator/toolset.ts';
import type { Registry } from '../server/tools.ts';
import { TASKS, type GradeCtx, type SeedCtx } from '../scripts/operator-bench-tasks.ts';

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
  const w = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('Synthetic Services') RETURNING id"))!.id;
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [w]);
  const m = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [w, `o${Math.random()}@example.test`]))!.id;
  return { pool, registry, ws: w, member: m };
}
const seedOf = (id: string, c: SeedCtx) => TASKS.find(t => t.id === id)!.seed!(c);
async function turn(m: string, body: Record<string, unknown>) {
  const h = { 'content-type': 'application/json', 'x-vp-dev-member': m };
  const id = (await (await fetch(base + '/v1/operator/threads', { method: 'POST', headers: h, body: '{}' })).json()).thread.id;
  const text = await (await fetch(base + `/v1/operator/threads/${id}/messages`, { method: 'POST', headers: h, body: JSON.stringify(body) })).text();
  return { threadId: id as string, frames: text.split('\n\n').filter(Boolean).map(f => ({ event: /^event: (.+)$/m.exec(f)?.[1] ?? '', data: JSON.parse(/^data: (.+)$/m.exec(f)?.[1] ?? 'null') })) };
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
const notices = (f: { event: string; data: any }[]) => f.filter(x => x.event === 'notice').map(x => x.data.text as string);
const lastTool = (req: LlmRequest, tool: string) => req.messages.filter(m => m.role === 'tool' && m.content.includes(`source="tool:${tool}"`)).pop()?.content ?? '';

test('checks: "To set up a campaign, I need some details" is not a claim (the r4 false positive)', () => {
  assert.ok(!claimsChange('To set up a campaign, I need some details: a name and an audience.', false));
  assert.equal(checkReply({ text: 'To set up a campaign, I need some details: a name and an audience.', wrote: false, proposed: false, pendingInThread: false, facts: [], userText: 'Set up a campaign', toolCalls: 0 }), null);
  assert.ok(claimsChange("I've updated the window.", false), 'a real claim still counts');
});

test('checks: numbers in a reply are held to the turn\'s tool results (money in thousandths, durations in any unit)', () => {
  const est = { p10InrMilli: 9608, p90InrMilli: 24021, perMinuteInrMilli: 2400, display: { range: '₹9.61 to ₹24.02 (incl. GST)' } };
  assert.deepEqual(unsupportedNumbers('It will cost ₹9,608–24,021.', knownNumbers([est], 'What will it cost?')), ['₹9,608', '₹24,021']);
  assert.deepEqual(unsupportedNumbers('It will cost ₹9.61 to ₹24.02 including GST.', knownNumbers([est], '')), []);
  assert.deepEqual(unsupportedNumbers('About ₹10 to ₹24.', knownNumbers([est], '')), [], 'rounding to the rupee is fine');
  const draft = { limits: { maxDurationS: 180, maxSilenceS: 8, maxTurns: 40 } };
  assert.deepEqual(unsupportedNumbers('The longest call is 120 seconds. No further changes are needed.', knownNumbers([draft], 'How long can a call last?')), ['120 seconds']);
  assert.deepEqual(unsupportedNumbers('The longest call is 3 minutes (180 seconds).', knownNumbers([draft], '')), []);
  assert.deepEqual(unsupportedNumbers('Your cap is ₹500.', knownNumbers([{ ok: true }], 'cap it at 500')), [], 'a figure the member typed is fine');
});

test('a reply quoting an estimate wrongly is corrected and repaired; campaign.estimate gives display strings', { skip }, async () => {
  const c = await owner();
  const seed = await seedOf('camp-estimate', c);
  let est: any;
  const seen = script([
    () => ({ toolCalls: [call('campaign_estimate', { id: seed.campaignId })] }),
    req => { est = JSON.parse(lastTool(req, 'campaign.estimate').replace(/^<data[^>]*>\n/, '').replace(/\n<\/data>$/, '')).result;
      return { text: `It will cost ₹${est.p10InrMilli.toLocaleString('en-IN')}–${est.p90InrMilli.toLocaleString('en-IN')}.` }; },
    () => ({ text: `It will cost ${est.display.range}.` }),
  ]);
  const { frames } = await turn(c.member, { text: 'What will this campaign cost?', page: `/campaigns/${seed.campaignId}` });
  assert.match(est.display.range, /^₹\d[\d,]*\.\d\d to ₹\d[\d,]*\.\d\d \(incl\. GST\)$/);
  assert.equal(seen.length, 3, 'one repair turn');
  assert.match(notices(frames)[0]!, /^Correction: ₹[\d,]+, ₹[\d,]+ in the reply above does not match what the tools returned/);
  assert.match(seen[2]!.messages.at(-1)!.content, /thousandths of a rupee/);
  assert.equal(notices(frames).length, 1, 'the corrected reply passes');
});

test('"Tap to confirm" with no card is corrected; with a card waiting in the thread it is not', { skip }, async () => {
  const c = await owner();
  let seen = script([() => ({ text: 'Tap to confirm deployment.' }), () => ({ text: 'No deployment was set up yet.' })]);
  let r = await turn(c.member, { text: 'Deploy it.' });
  assert.equal(seen.length, 2);
  assert.equal(notices(r.frames)[0], 'Correction: nothing from this message is waiting for your tap.');
  seen = script([() => ({ toolCalls: [call('wallet_topup', { inrMilli: 100_000 })] }), () => ({ text: 'Tap Approve on the card to add ₹100.' })]);
  r = await turn(c.member, { text: 'Add ₹100 to the wallet.' });
  assert.equal(seen.length, 2);
  assert.deepEqual(notices(r.frames), []);
});

test('confirm-first: "Shall I create it?" for a draft gets one nudge to do it now', { skip }, async () => {
  const c = await owner();
  const seen = script([
    () => ({ text: 'Shall I create a draft service follow-up agent for you?' }),
    () => ({ toolCalls: [call('agent_create', { name: 'Service follow-up', templateId: 'appliance-service-followup' })] }),
    () => ({ text: "I've created the draft agent. You can delete it any time." }),
  ]);
  const r = await turn(c.member, { text: 'Create a service follow-up agent.', page: '/agents' });
  assert.equal(seen.length, 3);
  assert.match(seen[1]!.messages.at(-1)!.content, /Drafts, edits and tests are free and reversible: do it now/);
  assert.match(seen[0]!.messages[0]!.content, /Never ask "shall I" or "please confirm" first/);
  assert.deepEqual(notices(r.frames), [], 'a nudge, not a correction');
  assert.equal((await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM agent WHERE workspace_id = $1', [c.ws]))!.n, 1);
  // A real question ("which") is not nudged.
  assert.equal(checkReply({ text: 'Which audience should this campaign call?', wrote: false, proposed: false, pendingInThread: false, facts: [], userText: 'Draft a campaign', toolCalls: 0 }), null);
});

test('a retry after NOT DONE cannot change what the member did not ask about', { skip }, async () => {
  const c = await owner();
  const seed = await seedOf('edit-calmer', c);
  const before = (await one<{ d: any }>(pool, 'SELECT draft AS d FROM agent WHERE id = $1', [seed.agentId]))!.d.voice;
  const seen = script([
    () => ({ toolCalls: [call('brief_edit', { agentId: seed.agentId, patch: [{ op: 'set', path: 'persona.mood', value: 'calm' }] })] }),
    () => ({ toolCalls: [call('stack_set', { agentId: seed.agentId, stackId: 'custom', components: { ears: 'sarvam', brain: 'gpt-4.1-mini-in', voice: 'azure' } })] }),
    () => ({ text: 'Not done.' }),
  ]);
  await turn(c.member, { text: 'Make this agent calmer.', page: `/agents/${seed.agentId}` });
  const held = lastTool(seen[2]!, 'stack.set');
  assert.match(held, /NOT DONE/);
  assert.match(held, /held: the client did not ask for stack\.set, and this turn was retrying brief\.edit/);
  assert.deepEqual((await one<{ d: any }>(pool, 'SELECT draft AS d FROM agent WHERE id = $1', [seed.agentId]))!.d.voice, before, 'the stack is unchanged');
  assert.match(lastTool(seen[1]!, 'brief.edit'), /Change nothing the client did not ask about/);
});

test('fixFor points inside the draft: a brief.edit refusal names the field\'s limits or the fields that exist', { skip }, async () => {
  const c = await owner();
  const seed = await seedOf('edit-calmer', c);
  const seen = script([
    () => ({ toolCalls: [call('brief_edit', { agentId: seed.agentId, patch: [{ op: 'set', path: 'limits.maxDurationS', value: 5000 }] })] }),
    () => ({ toolCalls: [call('brief_edit', { agentId: seed.agentId, patch: [{ op: 'set', path: 'persona.mood', value: 'calm' }] })] }),
    () => ({ text: 'Not done.' }),
  ]);
  await turn(c.member, { text: 'Let calls run for 5000 seconds and make it calmer.', page: `/agents/${seed.agentId}` });
  assert.match(lastTool(seen[1]!, 'brief.edit'), /"fix":"maxDurationS must be a whole number at least 30 and at most 1800/);
  assert.match(lastTool(seen[2]!, 'brief.edit'), /"fix":"use only these fields in persona: name, gender, register, energy, humour, honorific, notes/);
  // An empty required list never prints "needs: ;".
  assert.doesNotMatch(fixFor(registry.get('audience.create'), 'filter', 'filter: give exactly one of filter or contactIds').fix ?? '', /needs: ;|needs: $/);
});

test('page tools: deployment.split is offered on /agents and contact.list on /campaigns', { skip }, async () => {
  const allowed = registry.list().filter(t => t.roles.includes('owner'));
  assert.ok(allowed.length > 38, 'enough tools that the page must choose');
  assert.ok(selectTools({ allowed, page: '/agents/x', text: 'hello', history: [], found: [] }).includes('deployment.split'));
  assert.ok(selectTools({ allowed, page: '/campaigns', text: 'hello', history: [], found: [] }).includes('contact.list'));
  const c = await owner();
  const seen = script([() => ({ text: 'ok' })]);
  await turn(c.member, { text: 'Deploy this agent to half the calls.', page: '/agents' });
  assert.ok(seen[0]!.tools!.some(t => t.name === 'deployment_split'));
});

test('bench: camp-estimate needs the estimate\'s own figures, not any ₹ sign', { skip }, async () => {
  const task = TASKS.find(t => t.id === 'camp-estimate')!;
  const c = await owner();
  const seed = await task.seed!(c);
  const e = await registry.execute<any>(pool, 'campaign.estimate', { id: seed.campaignId }, { workspaceId: c.ws, actor: { type: 'member', id: c.member, role: 'owner' } });
  assert.equal(e.status, 'confirmed');
  const g = (reply: string): GradeCtx => ({ ...c, seed, frames: [], cards: [], reply, ran: ['campaign.estimate'] });
  const wrong = `It will cost ₹${(e as any).result.p10InrMilli.toLocaleString('en-IN')}–${(e as any).result.p90InrMilli.toLocaleString('en-IN')}.`;
  assert.equal((await task.grade(g(wrong))).pass, false);
  assert.equal((await task.grade(g(`It will cost ${(e as any).result.display.range}.`))).pass, true);
});
