// Fixes from the op5 Operator bench (research/2026-10-24/benches-op5/), on the REAL modules with a scripted model.
// Each integration test failed on the code before its fix. Synthetic data only; fresh workspace per test.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmReply, type LlmRequest } from '../server/llm.ts';
import { modules } from '../server/modules/index.ts';
import { asksToConfirm, checkReply, claimsChange, knownNumbers, unsupportedNumbers } from '../server/modules/operator/check.ts';
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
  const w = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('Synthetic Finance') RETURNING id"))!.id;
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [w]);
  const m = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [w, `o${Math.random()}@example.test`]))!.id;
  return { pool, registry, ws: w, member: m };
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
const notices = (f: { event: string; data: any }[]) => f.filter(x => x.event === 'notice').map(x => x.data.text as string);
const cards = (f: { event: string; data: any }[]) => f.filter(x => x.event === 'card').map(x => x.data.card);

test('the conduct line no longer invites describing a draft before its tool ran; a passive claim after no tool call is corrected', { skip }, async () => {
  const c = await owner();
  const seen = script([
    () => ({ text: "Draft agent created for EMI due reminders… it's not live yet and can be undone." }),
    () => ({ text: 'No agent was created yet.' }),
  ]);
  const f = await turn(c.member, { text: 'Create an agent for EMI due reminders.', page: '/agents' });
  const sys = seen[0]!.messages[0]!.content;
  assert.match(sys, /exists or has changed only once its tool returned DONE in this turn/);
  assert.doesNotMatch(sys, /say what you did and that it can be undone/);
  assert.equal(seen.length, 2, 'one repair turn');
  assert.deepEqual(notices(f), ['Correction: nothing was changed by this message. No tool confirmed the change described above.']);
});

test('reply checks: reduced passives are claims; "Nothing has been deleted yet", "covers 5 people" and clarifying questions are not', () => {
  assert.ok(claimsChange("Draft agent created for EMI due reminders… it's not live yet and can be undone.", false));
  assert.ok(claimsChange('The agent is now set to speak Hindi.', false));
  assert.ok(claimsChange('Now set to speak Hindi.', false));
  assert.ok(!claimsChange('Nothing has been deleted yet.', false));
  assert.ok(!claimsChange('I made no changes.', false));
  assert.ok(!claimsChange('Your daily cap is set at ₹500.', false));
  assert.ok(!claimsChange('Your campaign was created on 1 October.', false));
  assert.deepEqual(unsupportedNumbers('The audience covers 5 people.', knownNumbers([{ ok: true }], 'how big is it?')), []);
  assert.ok(!asksToConfirm('Would you like me to create it with the default window, or do you have specific times?'));
  assert.ok(asksToConfirm('Shall I create the draft agent for you?'));
  // A clarifying question after a draft request is left alone (no nudge to guess).
  assert.equal(checkReply({ text: 'Would you like me to use the default window, or do you have specific times?', wrote: false, proposed: false, pendingInThread: false, facts: [], userText: 'Draft a campaign.', toolCalls: 0 }), null);
});

test('a reply is held to its own card: "₹2,000" said, ₹200 on the card, is corrected even though the member typed 2,000', { skip }, async () => {
  const c = await owner();
  const seen = script([
    () => ({ toolCalls: [call('cap_raise', { scope: 'workspace', period: 'daily', capInrMilli: 200_000 })] }),
    () => ({ text: 'I have asked to raise the daily cap to ₹2,000; tap Approve on the card.' }),
    () => ({ text: 'The card raises the daily cap to ₹200, not ₹2,000. Decline it and I will ask again.' }),
  ]);
  const f = await turn(c.member, { text: 'Raise the daily cap to ₹2,000.', page: '/settings' });
  assert.equal(cards(f)[0].type, 'approval');
  assert.match(notices(f)[0]!, /^Correction: ₹2,000 in the reply above does not match/);
  assert.equal(seen.length, 3);
  // The bench grader now checks the card's amount, not only that a card exists.
  const task = TASKS.find(t => t.id === 'cap-raise')!;
  const g = (cs: any[]): GradeCtx => ({ ...c, seed: {}, frames: [], cards: cs, reply: '', ran: [] });
  assert.equal((await task.grade(g([{ type: 'approval', tool: 'cap.raise', diff: [{ field: 'capInrMilli', to: 200_000 }] }]))).pass, false);
  assert.equal((await task.grade(g([{ type: 'approval', tool: 'cap.raise', diff: [{ field: 'capInrMilli', to: 2_000_000 }] }]))).pass, true);
});

test('a protective write the member did not ask for becomes a card, not a run; asked for, it runs at once', { skip }, async () => {
  const c = await owner();
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,'+919900001234','Synthetic Person') RETURNING id", [c.ws]))!.id;
  const suppressions = async () => (await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM suppression WHERE workspace_id = $1', [c.ws]))!.n;
  script([() => ({ toolCalls: [call('contact_suppress', { contactId: contact, reason: 'member asked to delete contacts' })] }), () => ({ text: 'A card is waiting.' })]);
  let f = await turn(c.member, { text: 'Delete all my contacts.', page: '/contacts' });
  assert.equal(cards(f)[0].type, 'approval', JSON.stringify(cards(f)[0]));
  assert.equal(cards(f)[0].tool, 'contact.suppress');
  assert.equal(await suppressions(), 0, 'nothing was suppressed without a tap');
  script([() => ({ toolCalls: [call('contact_suppress', { contactId: contact, reason: 'asked to stop calling' })] }), () => ({ text: 'Done.' })]);
  f = await turn(c.member, { text: 'Stop calling Synthetic Person.', page: '/contacts' });
  assert.equal(cards(f)[0].status, 'confirmed');
  assert.equal(await suppressions(), 1);
});

test('voice.set refuses a voice the stack does not offer, and lists the valid ones', { skip }, async () => {
  const c = await owner();
  const as = { workspaceId: c.ws, actor: { type: 'member' as const, id: c.member, role: 'owner' as const } };
  const a = await registry.execute<any>(pool, 'agent.create', { name: 'Voice test', templateId: 'appliance-service-followup' }, as);
  assert.equal(a.status, 'confirmed');
  const bad = await registry.execute<any>(pool, 'voice.set', { agentId: (a as any).result.agentId, voiceId: 'calm_female' }, as);
  assert.equal(bad.status, 'not_executed');
  assert.match((bad as any).reason, /"calm_female" is not a voice of .*; choose one of: .*Despina/);
  const ok = await registry.execute<any>(pool, 'voice.set', { agentId: (a as any).result.agentId, voiceId: 'Despina' }, as);
  assert.equal(ok.status, 'confirmed', JSON.stringify(ok));
});
