// Retries the campaign form promises (campaigns/retry.ts) and callbacks the caller asked for (calls/stated-time.ts,
// calls/followups.ts, the memory brief). What the form shows is what runs; a stated time beats the ladder, clamped into the
// calling hours; opt-outs and erased people are never retried; a vague time is a note, never a guess. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one, tx } from '../server/db.ts';
import { FakeRuntime, setRuntime } from '../server/runtime-client.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { FakeTelephony, setTelephony } from '../server/modules/campaigns/telephony.ts';
import { resolveRetry, RETRY_PATTERNS } from '../server/modules/campaigns/retry.ts';
import { statedCallback } from '../server/modules/calls/stated-time.ts';
import { afterCall } from '../server/modules/calls/followups.ts';
import { purgeTranscripts } from '../server/modules/memory/index.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, modules).registry; setRuntime(new FakeRuntime()); setTelephony(new FakeTelephony()); });
after(async () => { setRuntime(null); setTelephony(null); await pool?.end(); });

const IST = (d: string, t: string) => new Date(`${d}T${t}:00+05:30`);
const istText = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16);
const TUE = '2026-10-27', NOON = IST(TUE, '12:00');
let seq = 0;
const phone = () => `+91930000${String(seq++).padStart(4, '0')}`;

async function world() {
  return tx(pool, async c => {
    const ws = (await one<{ id: string }>(c, "INSERT INTO workspace (name) VALUES ('retry ws') RETURNING id"))!.id;
    const owner = (await one<{ id: string }>(c, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
    const agentId = (await one<{ id: string }>(c, "INSERT INTO agent (workspace_id, name, status) VALUES ($1, 'Riya', 'live') RETURNING id", [ws]))!.id;
    const cfg = { category: 'service', memory: { read: true, write: true, briefMaxBytes: 1200 } };
    const versionId = (await one<{ id: string }>(c, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,$2,$3) RETURNING id",
      [agentId, 'h' + Math.random(), JSON.stringify({ agent: cfg, brief: { text: 'b', hash: 'b', bytes: 1 } })]))!.id;
    const contact = (await one<{ id: string }>(c, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,'Synthetic Sunita') RETURNING id", [ws, phone()]))!.id;
    return { ws, owner, agentId, versionId, contact };
  });
}
type W = Awaited<ReturnType<typeof world>>;
const SYS = (w: W) => ({ workspaceId: w.ws, actor: { type: 'system', id: 'test' } as Actor });
const OWNER = (w: W) => ({ workspaceId: w.ws, actor: { type: 'member', id: w.owner, role: 'owner' } as Actor });
// Calling hours Mon-Sat 10:00-19:00 for these campaigns.
const WINDOW = { days: [1, 2, 3, 4, 5, 6], ranges: [{ start: '10:00', end: '19:00' }] };
async function campaign(w: W, retry?: Record<string, unknown>) {
  return (await one<{ id: string }>(pool, `INSERT INTO campaign (workspace_id, name, call_category, policy, state, agent_version_id) VALUES ($1,'c','service',$2,'running',$3) RETURNING id`,
    [w.ws, JSON.stringify({ window: WINDOW, ...(retry ? { retry: resolveRetry(retry) } : {}) }), w.versionId]))!.id;
}
async function attempt(w: W, campaignId: string, o: { contact?: string; dialedAt?: Date } = {}) {
  return (await one<{ id: string }>(pool, `INSERT INTO attempt (workspace_id, campaign_id, contact_id, kind, agent_version_id, call_category, scheduled_for, dialed_at, status)
    VALUES ($1,$2,$3,'campaign',$4,'service',$5,$5,'no_answer') RETURNING id`, [w.ws, campaignId, o.contact ?? w.contact, w.versionId, o.dialedAt ?? NOON]))!.id;
}
const retry = async (w: W, attemptId: string, outcome: string, extra: Record<string, unknown> = {}) => {
  const r = await registry.execute<any>(pool, 'attempt.retry_per_ladder', { attemptId, outcome, ...extra }, SYS(w));
  assert.equal(r.status, 'confirmed', JSON.stringify(r));
  return (r as any).result;
};
const next = async (id: string) => (await one<any>(pool, 'SELECT id, kind, scheduled_for, callback FROM attempt WHERE retry_of = $1', [id]))!;

test('stated callback times in Hindi, English and Hinglish; a vague time is a note; an opt-out is not a callback', () => {
  const now = new Date('2026-10-24T06:00:00Z');   // Saturday 11:30 IST
  const at = (s: string) => { const r = statedCallback(s, now); return !r ? null : 'at' in r ? istText(r.at.toISOString()) : 'note'; };
  assert.equal(at('call me after 6'), '2026-10-24T18:00');
  assert.equal(at('shaam 6 baje ke baad call karna'), '2026-10-24T18:00');
  assert.equal(at('kal subah call karna'), '2026-10-25T10:00');
  assert.equal(at('tomorrow morning please'), '2026-10-25T10:00');
  assert.equal(at('parso shaam ko'), '2026-10-26T18:00');
  assert.equal(at('Monday 11 baje call kariye'), '2026-10-26T11:00');
  assert.equal(at('somvar shaam 5 baje'), '2026-10-26T17:00');
  assert.equal(at('कल सुबह 10 बजे फोन करना'), '2026-10-25T10:00');
  assert.equal(at('शाम 6 बजे के बाद'), '2026-10-24T18:00');
  assert.equal(at('2 ghante baad call karo'), '2026-10-24T13:30');
  assert.equal(at('abhi nahi, shaam 6 baje'), '2026-10-24T18:00', '"not now" is not an opt-out');
  for (const vague of ['baad mein call karna', 'call me later', 'kal call karo', 'Monday call karna', 'kal subah se busy hoon']) assert.equal(at(vague), 'note', vague);
  for (const none of ['dobara call mat karna', 'mujhe call mat karo', 'Haan boliye, ek minute']) assert.equal(at(none), null, none);
  const q = statedCallback('कल सुबह 10 बजे फोन करना', now)!;
  assert.equal(q.quote, 'कल सुबह 10 बजे फोन करना', 'a Devanagari quote is the caller\'s own line');
});

test('the form\'s retry pattern is what runs: attempts, gaps, which endings retry, and never after an invalid number', { skip }, async () => {
  const w = await world();
  const c = await campaign(w, { pattern: 'persistent' });
  const a1 = await attempt(w, c);
  const r1 = await retry(w, a1, 'busy');
  assert.equal(r1.at, new Date(NOON.getTime() + 60 * 60_000).toISOString(), 'persistent: 1 hour first');
  const a2 = (await next(a1)).id;
  await pool.query("UPDATE attempt SET dialed_at = $2 WHERE id = $1", [a2, IST(TUE, '13:00')]);
  const r2 = await retry(w, a2, 'no_answer');
  assert.equal(r2.at, IST(TUE, '17:00').toISOString(), 'then 4 hours');
  const a3 = (await next(a2)).id;
  await pool.query("UPDATE attempt SET dialed_at = $2 WHERE id = $1", [a3, IST(TUE, '17:00')]);
  const r3 = await retry(w, a3, 'switched_off');
  assert.equal(r3.at, IST('2026-10-28', '17:00').toISOString(), 'then a day');
  const a4 = (await next(a3)).id;
  const r4 = await retry(w, a4, 'busy');
  assert.equal(r4.scheduled, false);
  assert.match(r4.reason, /all 4 calls/);

  const gentle = await campaign(w, { pattern: 'gentle' });
  assert.match((await retry(w, await attempt(w, gentle), 'voicemail')).reason, /does not retry after voicemail/);
  assert.match((await retry(w, await attempt(w, gentle), 'invalid')).reason, /no retry after invalid/);
  const none = await campaign(w, { pattern: 'none' });
  assert.equal((await retry(w, await attempt(w, none), 'busy')).scheduled, false);

  // A gap that lands outside the calling hours moves to the next time they open (Tue 18:30 + 2 h -> Wed 10:00).
  const std = await campaign(w, { pattern: 'standard' });
  const late = await attempt(w, std, { dialedAt: IST(TUE, '18:30') });
  assert.equal((await retry(w, late, 'busy')).at, IST('2026-10-28', '10:00').toISOString());

  // campaign.draft stores the pattern and campaign.get says it in words; bounds hold.
  const bad = await registry.execute(pool, 'campaign.draft', { name: 'x', category: 'service', retry: { maxAttempts: 9 } }, OWNER(w));
  assert.equal(bad.status, 'not_executed');
  const d = await registry.execute<any>(pool, 'campaign.draft', { name: 'Renewals', category: 'service', retry: { pattern: 'gentle' } }, OWNER(w));
  assert.equal(d.status, 'confirmed', JSON.stringify(d));
  const g = await registry.execute<any>(pool, 'campaign.get', { id: (d as any).result.id }, OWNER(w));
  assert.equal((g as any).result.campaign.policy.retry.maxAttempts, RETRY_PATTERNS.gentle.maxAttempts);
  assert.match((g as any).result.retry, /^Up to 2 calls each, 1 day apart, after busy, no answer, switched off\. Never after a wrong or invalid number or an opt-out\.$/);
});

test('a stated time beats the ladder and is clamped into the calling hours; a vague time schedules nothing and leaves a note', { skip }, async () => {
  const w = await world();
  const c = await campaign(w, { pattern: 'none' });             // the ladder would never call again
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, contact_id, channel, status) VALUES ($1,$2,'phone','done') RETURNING id", [w.ws, w.contact]))!.id;
  const a = await attempt(w, c);
  const ok = await retry(w, a, 'callback', { stated: { at: IST(TUE, '18:10').toISOString(), quote: 'after 6', conversationId: conv } });
  assert.deepEqual([ok.scheduled, ok.clamped, ok.text], [true, false, 'Calling back Tue 6:10 pm, as they asked']);
  assert.equal((await next(a)).kind, 'callback');

  const late = await attempt(w, c);
  const cl = await retry(w, late, 'callback', { stated: { at: IST(TUE, '21:30').toISOString(), quote: 'raat 9:30 baje', conversationId: conv } });
  assert.equal(cl.at, IST('2026-10-28', '10:00').toISOString(), 'past the window: the next opening');
  assert.equal(cl.text, 'Calling back Wed 10:00 am, the first time the calling hours allow after the time they asked');
  const sunday = await attempt(w, c);
  assert.equal((await retry(w, sunday, 'callback', { stated: { at: IST('2026-11-01', '11:00').toISOString(), quote: 'Sunday 11 baje', conversationId: conv } })).at,
    IST('2026-11-02', '10:00').toISOString(), 'the campaign does not call on Sundays');

  const vague = await attempt(w, c);
  const n = await retry(w, vague, 'callback', { statedNote: { note: 'They asked to be called back but did not say a clear time, so no time was guessed.', quote: 'baad mein', conversationId: conv } });
  assert.equal(n.scheduled, false);
  assert.equal(await one(pool, 'SELECT 1 FROM attempt WHERE retry_of = $1', [vague]), null);
  const list = await registry.execute<any>(pool, 'attempt.list', { contactId: w.contact }, OWNER(w));
  const texts = (list as any).result.attempts.map((x: any) => x.callback_text).filter(Boolean);
  assert.ok(texts.includes('They asked to be called back but did not say a clear time, so no time was guessed.'), 'the contact page shows the note');
  assert.ok(texts.includes('Calling back Tue 6:10 pm, as they asked'));
  assert.doesNotMatch(JSON.stringify((list as any).result), /baad mein|raat 9:30/, 'the attempt list never returns their words');
  const cg = await registry.execute<any>(pool, 'campaign.get', { id: c }, OWNER(w));
  assert.ok((cg as any).result.callbacks.some((b: any) => b.text === 'Calling back Tue 6:10 pm, as they asked'), 'the campaign page lists it');
});

test('an opt-out, a suppressed person and an erased person are never retried', { skip }, async () => {
  const w = await world();
  const c = await campaign(w, { pattern: 'persistent' });
  assert.match((await retry(w, await attempt(w, c), 'opt_out')).reason, /opt-out/);
  const s = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,'S') RETURNING id", [w.ws, phone()]))!.id;
  await pool.query("INSERT INTO suppression (workspace_id, contact_id, scope, reason) VALUES ($1,$2,'workspace','asked')", [w.ws, s]);
  assert.match((await retry(w, await attempt(w, c, { contact: s }), 'busy')).reason, /suppressed/);
  const e = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name, erased_at) VALUES ($1,$2,NULL, now()) RETURNING id", [w.ws, phone()]))!.id;
  assert.match((await retry(w, await attempt(w, c, { contact: e }), 'busy')).reason, /erased/);
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, contact_id, channel, status) VALUES ($1,$2,'phone','done') RETURNING id", [w.ws, e]))!.id;
  assert.match((await retry(w, await attempt(w, c, { contact: e }), 'callback', { stated: { at: IST(TUE, '15:00').toISOString(), quote: '3 baje', conversationId: conv } })).reason, /erased/,
    'not even a time they stated');
});

test('end to end: the caller\'s words schedule the callback, and that call\'s memory brief says it is the callback they asked for', { skip }, async () => {
  const w = await world();
  const c = await campaign(w, { pattern: 'standard' });
  const a = await attempt(w, c);
  const conv = (await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, contact_id, attempt_id, agent_version_id, channel, status, reason_code, end_reason, started_at, ended_at)
    VALUES ($1,$2,$3,$4,'phone','done','CONV_CALLBACK','hangup',$5,$5) RETURNING id`, [w.ws, w.contact, a, w.versionId, NOON]))!.id;
  await pool.query(`INSERT INTO turn (conversation_id, idx, speaker, text) VALUES ($1,0,'agent','Namaste, Synthetic Co se Riya, ek AI assistant.'),
    ($1,1,'caller','Abhi meeting mein hoon, kal subah 11 baje call karna')`, [conv]);
  const out = await afterCall(pool, registry, w.ws, conv);
  assert.equal(out['attempt.retry_per_ladder'], 'done', JSON.stringify(out));
  const cb = await next(a);
  assert.equal(cb.kind, 'callback');
  assert.equal(new Date(cb.scheduled_for).toISOString(), IST('2026-10-28', '11:00').toISOString());
  assert.equal(cb.callback.quote, 'subah 11 baje');
  assert.equal(cb.callback.text, 'Calling back Wed 11:00 am, as they asked');

  const brief = await registry.execute<any>(pool, 'memory.brief', { contactId: w.contact, agentId: w.agentId, attemptId: cb.id }, SYS(w));
  assert.equal(brief.status, 'confirmed', JSON.stringify(brief));
  assert.equal((brief as any).result.status, 'ok');
  assert.match((brief as any).result.text, /^callback: they_asked_for=Wed 11:00 am \(said (today|\d+ days ago|yesterday)\)$/);
  assert.doesNotMatch((brief as any).result.text, /meeting|baje/, 'a shape, never their words');
  const plain = await registry.execute<any>(pool, 'memory.brief', { contactId: w.contact, agentId: w.agentId, attemptId: a }, SYS(w));
  assert.equal((plain as any).result.status, 'empty', 'an ordinary attempt carries no callback note');
  const other = await world();
  const cross = await registry.execute<any>(pool, 'memory.brief', { contactId: other.contact, agentId: other.agentId, attemptId: cb.id }, SYS(other));
  assert.equal((cross as any).result.status, 'empty', "another workspace's attempt is never read");

  // Erasure removes the words; the brief no longer claims a callback it cannot quote.
  await pool.query("INSERT INTO forget_request (workspace_id, contact_id, scope) VALUES ($1,$2,'erase_me')", [w.ws, w.contact]);
  await purgeTranscripts(pool, { workspaceId: w.ws });
  assert.equal((await one<any>(pool, 'SELECT callback FROM attempt WHERE id = $1', [cb.id]))!.callback.quote, undefined);
  const after_ = await registry.execute<any>(pool, 'memory.brief', { contactId: w.contact, agentId: w.agentId, attemptId: cb.id }, SYS(w));
  assert.equal((after_ as any).result.status, 'empty');
});
