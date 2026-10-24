// Hand-offs that land (must-be brief 6, the calls half): the queue, claiming, a callback due at the time the caller
// stated, and a crisis alert to on-duty members within 5 s. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import type { Actor, Registry } from '../server/tools.ts';
import type { RuntimeEvent, RunManifest } from '../shared/runtime-protocol.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { ingest } from '../server/modules/calls/ingest.ts';
import { analysesSettled } from '../server/modules/calls/analysis.ts';
import { statedTime } from '../server/modules/calls/stated-time.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, [calls]).registry;
  setFakeLlm(() => ({ text: JSON.stringify({ points: [], moments: [], reasonCode: null, outcome: null }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'f', provider: 'f' })); });
after(async () => { setFakeLlm(null); await analysesSettled(); await pool?.end(); });

const IST = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16);
const m: RunManifest = { combinationId: 'h', stackId: 'h', agentVersionHash: 'h', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 'h' };

test('a stated time is read from the caller\'s words, in India time; no time in the words, no time', () => {
  const now = new Date('2026-10-24T06:00:00Z');   // 11:30 IST
  const at = (s: string) => { const r = statedTime(s, now); return r ? [IST(r.at.toISOString()), r.quote] : null; };
  assert.deepEqual(at('Abhi main gaadi chala raha hoon, shaam 6 baje ke baad call karna.'), ['2026-10-24T18:00', 'shaam 6 baje']);
  assert.deepEqual(at('kal subah 10 baje call kariye'), ['2026-10-25T10:00', 'subah 10 baje']);
  assert.deepEqual(at('2 ghante baad call karo'), ['2026-10-24T13:30', '2 ghante baad']);
  assert.deepEqual(at('aadhe ghante mein phone karna'), ['2026-10-24T12:00', 'aadhe ghante mein']);
  assert.deepEqual(at('call me after 6:30 pm'), ['2026-10-24T18:30', 'after 6:30 pm']);
  assert.deepEqual(at('subah 9 baje'), ['2026-10-25T09:00', 'subah 9 baje'], 'a time already past today is tomorrow');
  assert.equal(at('Haan boliye, ek minute'), null);
  assert.equal(at('Mujhe kisi insaan se baat karni hai'), null);
});

async function setup() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('handoffs test') RETURNING id"))!.id;
  const mk = async (role: string, status = 'active') => (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, name, role, status) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [ws, `${role}${Math.random()}@example.test`, role[0].toUpperCase() + role.slice(1), role, status]))!.id;
  const ids = { owner: await mk('owner'), operator: await mk('operator'), compliance: await mk('compliance'), builder: await mk('builder'), viewer: await mk('viewer'), off: await mk('operator', 'disabled') };
  const as = (id: string, role: string) => ({ workspaceId: ws, actor: { type: 'member', id, role } as Actor });
  return { ws, ids, as };
}
let phone = 9000100000;
async function callWith(ws: string, caller: string[], hand: { reason: string; target: string; summary: string }, channel = 'phone') {
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,'Meena Iyer') RETURNING id", [ws, `+91${phone++}`]))!.id;
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, contact_id, channel) VALUES ($1,$2,$3) RETURNING id", [ws, contact, channel]))!.id;
  const at = '2026-10-24T06:00:00.000Z';
  const turns = caller.map((t, i) => ({ seq: 2 + i, type: 'turn', at, speaker: 'caller', text: t, startMs: 3000 * (i + 1), endMs: 3000 * (i + 1) + 2000 }));
  const t0 = Date.now();
  await ingest(pool, { conversationId: conv, events: [{ seq: 1, type: 'call.started', at, manifest: m }, ...turns,
    { seq: 10, type: 'hand_off', at, ...hand }] as RuntimeEvent[] });
  return { conv, contact, ms: Date.now() - t0 };
}

test('a callback hand-off is a task due when the caller asked, with her warm brief, in the queue', { skip }, async () => {
  const s = await setup();
  const c = await callWith(s.ws, ['Abhi main gaadi chala raha hoon, shaam 6 baje ke baad call karna.'],
    { reason: 'callback_request', target: 'callback', summary: 'Meena is driving; she asked for a call after 6 pm about the renewal.' });
  const l = await registry.execute<any>(pool, 'handoff.list', {}, s.as(s.ids.operator, 'operator'));
  if (l.status !== 'confirmed') return assert.fail(JSON.stringify(l));
  const it = l.result.items.find((x: any) => x.conversationId === c.conv);
  assert.equal(it.kind, 'callback'); assert.equal(it.status, 'queued');
  assert.equal(IST(it.due.at), '2026-10-24T18:00'); assert.equal(it.due.text, 'They asked: "shaam 6 baje"');
  assert.equal(it.brief, 'Meena is driving; she asked for a call after 6 pm about the renewal.');
  assert.equal(it.contact.name, 'Meena Iyer'); assert.equal(it.reason, 'The caller asked to be called back');
  const none = await callWith(s.ws, ['Baad mein call karna'], { reason: 'callback_request', target: 'callback', summary: 'Call back later.' });
  const it2 = ((await registry.execute<any>(pool, 'handoff.list', {}, s.as(s.ids.owner, 'owner'))) as any).result.items.find((x: any) => x.conversationId === none.conv);
  assert.equal(it2.due.text, 'No time stated: call back as soon as you can');
});

test('claiming: one person has it, others are told who; only they close it; another workspace never sees it', { skip }, async () => {
  const s = await setup();
  const c = await callWith(s.ws, ['Mujhe kisi insaan se baat karni hai.'], { reason: 'asks_for_human', target: 'queue:support', summary: 'Wants a person about a billing question.' });
  const h = (await one<{ id: string }>(pool, 'SELECT id FROM hand_off WHERE conversation_id = $1', [c.conv]))!.id;
  const mine = await registry.execute<any>(pool, 'handoff.claim', { handOffId: h }, s.as(s.ids.operator, 'operator'));
  assert.equal(mine.status, 'confirmed', JSON.stringify(mine));
  assert.equal(mine.status === 'confirmed' && mine.result.claimedBy.name, 'Operator');
  const theirs = await registry.execute<any>(pool, 'handoff.claim', { handOffId: h }, s.as(s.ids.owner, 'owner'));
  assert.equal(theirs.status, 'not_executed'); assert.match(theirs.reason, /^Operator already has this hand-off$/);
  const notYours = await registry.execute<any>(pool, 'handoff.resolve', { handOffId: h, resolution: 'reached' }, s.as(s.ids.owner, 'owner'));
  assert.equal(notYours.status, 'not_executed');
  const done = await registry.execute<any>(pool, 'handoff.resolve', { handOffId: h, resolution: 'reached' }, s.as(s.ids.operator, 'operator'));
  assert.equal(done.status === 'confirmed' && done.result.status, 'done');
  const open = await registry.execute<any>(pool, 'handoff.list', {}, s.as(s.ids.owner, 'owner'));
  assert.ok(open.status === 'confirmed' && !open.result.items.some((x: any) => x.id === h), 'a closed hand-off leaves the open queue');
  const viewer = await registry.execute(pool, 'handoff.claim', { handOffId: h }, s.as(s.ids.viewer, 'viewer'));
  assert.equal(viewer.status, 'not_executed', 'a viewer cannot take one');
  const other = await setup();
  const foreign = await registry.execute<any>(pool, 'handoff.claim', { handOffId: h }, other.as(other.ids.owner, 'owner'));
  assert.equal(foreign.status, 'not_executed');
  const theirList = await registry.execute<any>(pool, 'handoff.list', { status: 'all' }, other.as(other.ids.owner, 'owner'));
  assert.equal(theirList.status === 'confirmed' && theirList.result.items.length, 0);
  // A person taking over a live call is not a queue item.
  await callWith(s.ws, ['Haan'], { reason: 'takeover', target: `member:${s.ids.owner}`, summary: 'Taken over.' });
  const all = await registry.execute<any>(pool, 'handoff.list', { status: 'all' }, s.as(s.ids.owner, 'owner'));
  assert.ok(all.status === 'confirmed' && all.result.items.every((x: any) => x.kind !== 'member'));
});

test('a crisis hand-off alerts every on-duty member within 5 s, in the same commit as the event; a practice call alerts nobody', { skip }, async () => {
  const s = await setup();
  const c = await callWith(s.ws, ['Sab khatam ho gaya hai, ab jeene ka mann nahi karta.'], { reason: 'crisis', target: 'queue:care', summary: 'The caller spoke of distress; help lines given; she is staying on the call.' });
  assert.ok(c.ms < 5000, `ingest committed in ${c.ms} ms`);
  const alerts = await many<{ member_id: string; created_at: Date }>(pool, 'SELECT member_id, created_at FROM member_alert WHERE conversation_id = $1', [c.conv]);
  assert.deepEqual(new Set(alerts.map(a => a.member_id)), new Set([s.ids.owner, s.ids.operator, s.ids.compliance]), 'owner, operator and compliance; not builder, viewer or a disabled member');
  const ended = await one<{ at: Date }>(pool, "SELECT created_at AS at FROM hand_off WHERE conversation_id = $1", [c.conv]);
  assert.ok(alerts.every(a => Math.abs(a.created_at.getTime() - ended!.at.getTime()) < 5000), 'raised with the hand-off');
  const mine = await registry.execute<any>(pool, 'alert.list', {}, s.as(s.ids.operator, 'operator'));
  if (mine.status !== 'confirmed') return assert.fail(JSON.stringify(mine));
  assert.equal(mine.result.alerts.length, 1);
  assert.match(mine.result.alerts[0].text, /needs a person now/);
  assert.doesNotMatch(mine.result.alerts[0].text, /jeene|khatam/, 'the alert never repeats the caller\'s words');
  const q = await registry.execute<any>(pool, 'handoff.list', {}, s.as(s.ids.operator, 'operator'));
  assert.equal(q.status === 'confirmed' && q.result.items[0].crisis, true, 'crisis first');
  assert.equal(q.status === 'confirmed' && q.result.crisisOpen, 1);
  await registry.execute(pool, 'handoff.claim', { handOffId: mine.result.alerts[0].handOffId }, s.as(s.ids.operator, 'operator'));
  const after = await registry.execute<any>(pool, 'alert.list', {}, s.as(s.ids.owner, 'owner'));
  assert.equal(after.status === 'confirmed' && after.result.alerts.length, 0, 'taking it clears the alert for everyone');
  const practice = await callWith(s.ws, ['Sab khatam ho gaya hai.'], { reason: 'crisis', target: 'queue:care', summary: 'Practice.' }, 'test');
  assert.equal((await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM member_alert WHERE conversation_id = $1', [practice.conv]))!.n, 0);
});
