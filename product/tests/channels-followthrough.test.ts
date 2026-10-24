// Follow-through and templates against a real Postgres and the fake Graph API (nothing reaches Meta). Synthetic numbers
// (+91 90000 000xx), made-up names. Each test makes its own workspace; the engine always runs scoped to it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';

process.env.NODE_ENV = 'test';
process.env.VP_SECRET_KEY ??= randomBytes(32).toString('hex');

import { createPool, one, many } from '../server/db.ts';
import { buildApp } from '../server/app.ts';
import type { Registry, Actor } from '../server/tools.ts';
import { module as workspaceModule } from '../server/modules/workspace/index.ts';
import { module as intake } from '../server/modules/intake/index.ts';
import { module as channels, FakeGraph, setGraph, signWebhook, runFollowThrough } from '../server/modules/channels/index.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let reg: Registry;
let base = '';
let close: () => Promise<void> = async () => {};
const fake = new FakeGraph();
const APP_SECRET = 'ft-secret-' + randomBytes(4).toString('hex');

before(async () => {
  if (skip) return;
  setGraph(fake);
  pool = createPool(URL_);
  const app = buildApp(pool, [workspaceModule, intake, channels]);
  reg = app.registry;
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = async () => { app.server.close(); await app.stop(); };
});
after(async () => { setGraph(null); await close(); await pool?.end(); });

let seq = 0;
const phone = () => `+9190000${String(20000 + (Date.now() % 40000) + (++seq * 13) % 30000).slice(-5)}`;

async function setup(balance = 10_000_000) {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('ft test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role, status) VALUES ($1,$2,'owner','active') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  await pool.query('INSERT INTO wallet (workspace_id, balance_inr_milli) VALUES ($1,$2)', [ws, balance]);
  await pool.query("INSERT INTO brand (workspace_id, legal_name, website) VALUES ($1,'Arogya Dental Clinic','arogya.example')", [ws]);
  const as: Actor = { type: 'member', id: owner, role: 'owner' };
  const call = (name: string, args: unknown) => reg.execute<any>(pool, name, args, { workspaceId: ws, actor: as });
  const ok = async (name: string, args: unknown) => { const r = await call(name, args); assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`); return (r as any).result; };
  const approved = async (name: string, args: unknown) => {
    const r = await call(name, args);
    assert.equal(r.status, 'needs_approval', `${name}: ${JSON.stringify(r)}`);
    const a = await reg.approve<any>(pool, (r as any).actionId, { workspaceId: ws, memberId: owner });
    assert.equal(a.status, 'confirmed', `${name} approval: ${JSON.stringify(a)}`);
    return { result: (a as any).result, card: (r as any).summary as string };
  };
  const pnid = 'PN' + randomBytes(5).toString('hex');
  const stash = await ok('integration.stage_secrets', { kind: 'whatsapp_cloud', secrets: { access_token: 'EAAG-test', app_secret: APP_SECRET } });
  const ig = (await approved('integration.connect', { kind: 'whatsapp_cloud', name: 'Clinic line', stashId: stash.stashId, config: { phone_number_id: pnid, waba_id: 'WABA' + pnid } })).result;
  const conn = (await approved('channel.connect', { integrationId: ig.id })).result;
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Reminder agent') RETURNING id", [ws]))!.id;
  const version = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1, 1, 'h', '{}') RETURNING id", [agent]))!.id;
  const contact = async (name = 'Asha Verma', attrs: Record<string, unknown> = {}) => {
    const id = (await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,$3) RETURNING id', [ws, phone(), name]))!.id;
    for (const [k, v] of Object.entries(attrs)) await pool.query('INSERT INTO attribute (contact_id, key, value) VALUES ($1,$2,$3)', [id, k, JSON.stringify(v)]);
    return id;
  };
  const finishedCall = async (contactId: string, o: { outcome?: string; reason?: string; callerSays?: string[]; campaignId?: string } = {}) => {
    const att = o.campaignId ? (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'connected') RETURNING id", [ws, o.campaignId, contactId]))!.id : null;
    const cv = (await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel, status, outcome, reason_code, started_at, ended_at)
      VALUES ($1,$2,$3,$4,'phone','done',$5,$6, now() - interval '5 minutes', now() - interval '2 minutes') RETURNING id`, [ws, att, contactId, version, o.outcome ?? null, o.reason ?? null]))!.id;
    let idx = 0;
    for (const t of ['Namaste, main Arogya Dental ki AI assistant bol rahi hoon.', ...(o.callerSays ?? ['haan ji'])])
      await pool.query('INSERT INTO turn (conversation_id, idx, speaker, text) VALUES ($1,$2,$3,$4)', [cv, idx, idx++ === 0 ? 'agent' : 'caller', t]);
    return cv;
  };
  /** A drafted, submitted and approved template (Meta's reviewer is the fake). */
  const template = async (name: string, body: string, variables: { source: string; sample: string }[], category: 'utility' | 'marketing' = 'utility') => {
    const t = await ok('message_template.draft', { name, category, body, variables });
    assert.deepEqual(t.problems, [], name);
    const s = await approved('message_template.submit', { templateId: t.id });
    assert.equal(s.result.status, 'submitted');
    fake.decide(name, 'APPROVED');
    await ok('message_template.sync', {});
    const got = await ok('message_template.get', { id: t.id });
    assert.equal(got.status, 'approved');
    return t.id as string;
  };
  return { ws, owner, call, ok, approved, contact, finishedCall, template, conn, agent, pnid };
}

const statusBody = (pnid: string, id: string, status: string) => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA' + pnid, changes: [{ field: 'messages',
  value: { messaging_product: 'whatsapp', metadata: { phone_number_id: pnid }, statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)), pricing: { billable: true, category: 'utility' } }] } }] }] });
async function hook(path: string, body: unknown) {
  const raw = JSON.stringify(body);
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signWebhook(APP_SECRET, raw) }, body: raw });
  assert.equal(r.status, 200);
}

test('templates: drafting checks the values and the safety door; Meta review arrives by sync or webhook; a rejection keeps its reason', { skip }, async () => {
  const w = await setup();
  const bad = await w.ok('message_template.draft', { name: 'bad_one', category: 'utility', body: 'Hi {{2}}, see you soon.', variables: [{ source: 'contact.first_name', sample: 'Asha' }] });
  assert.ok(bad.problems.some((p: string) => /\{\{1\}\}/.test(p)));
  const unsafe = await w.ok('message_template.draft', { name: 'otp_ask', category: 'utility', body: 'Please share the OTP you received.', variables: [] });
  assert.ok(unsafe.problems.some((p: string) => /safety check/.test(p)));
  assert.equal((await w.call('message_template.submit', { templateId: unsafe.id })).status, 'needs_approval');

  const t = await w.ok('message_template.draft', { name: 'visit_reminder', category: 'utility', body: 'Hi {{1}}, your visit at Arogya Dental is on {{2}}. Reply here to change it.',
    variables: [{ source: 'contact.first_name', sample: 'Asha' }, { source: 'attr:visit_time', sample: 'Sat 26 Oct, 11:00 am' }] });
  assert.deepEqual(t.problems, []);
  const sub = await w.approved('message_template.submit', { templateId: t.id });
  assert.match(sub.card, /Submit the utility template "visit_reminder" to Meta for review/);
  const posted = fake.requests.filter(r => r.path.endsWith('/message_templates') && r.method === 'POST').at(-1)!.body as any;
  assert.deepEqual(posted.components[0].example.body_text, [['Asha', 'Sat 26 Oct, 11:00 am']]);
  const listed = await w.ok('message_template.list', {});
  const row = listed.templates.find((x: any) => x.id === t.id);
  assert.equal(row.status, 'submitted');
  assert.ok(row.waitingForReviewS >= 0, 'the readiness rail shows how long it has waited');
  assert.equal(row.priceInrMilli, 115);
  // Meta's decision on the webhook.
  const ft = fake.templates.find(x => x.name === 'visit_reminder')!;
  await hook(w.conn.webhookPath, { object: 'whatsapp_business_account', entry: [{ id: 'WABA' + w.pnid, changes: [{ field: 'message_template_status_update',
    value: { event: 'REJECTED', message_template_id: Number(ft.id), message_template_name: 'visit_reminder', message_template_language: 'en', reason: 'INVALID_FORMAT' } }] }] });
  const rej = await w.ok('message_template.get', { id: t.id });
  assert.equal(rej.status, 'rejected');
  assert.equal(rej.rejectReason, 'INVALID_FORMAT');
  // Edited and submitted again; approved by sync.
  await w.ok('message_template.draft', { id: t.id, name: 'visit_reminder', category: 'utility', body: 'Hi {{1}}, your visit at Arogya Dental is on {{2}}. Reply here if you need to change it.',
    variables: [{ source: 'contact.first_name', sample: 'Asha' }, { source: 'attr:visit_time', sample: 'Sat 26 Oct, 11:00 am' }] });
  fake.templates.splice(fake.templates.indexOf(ft), 1);
  await w.approved('message_template.submit', { templateId: t.id });
  fake.decide('visit_reminder', 'APPROVED');
  await w.ok('message_template.sync', {});
  assert.equal((await w.ok('message_template.get', { id: t.id })).status, 'approved');
});

test('follow-through: only to people who opted in, from the outcome the call earned; "WhatsApp pe bhej do" is the opt-in; sent once, metered on delivery', { skip }, async () => {
  const w = await setup(10_000_000);
  const tid = await w.template('booked_summary', 'Hi {{1}}, thank you for speaking with us. Your visit is booked for {{2}}.',
    [{ source: 'contact.first_name', sample: 'Asha' }, { source: 'attr:visit_time', sample: 'Sat 26 Oct, 11:00 am' }]);
  const rule = await w.approved('followthrough.rule.set', { name: 'After booking', templateId: tid, trigger: 'outcome', value: 'booked', agentId: w.agent, dailyLimit: 100 });
  assert.match(rule.card, /send the WhatsApp template "booked_summary" to people who opted in on WhatsApp; at most 100 a day, up to ₹11\.50 a day/);

  const quiet = await w.contact('Ravi Kumar', { visit_time: 'Mon 28 Oct, 4:00 pm' });
  const asks = await w.contact('Asha Verma', { visit_time: 'Sat 26 Oct, 11:00 am' });
  const other = await w.contact('Meera Iyer', { visit_time: 'Tue 29 Oct, 10:00 am' });
  await w.finishedCall(quiet, { outcome: 'booked' });
  const cvAsk = await w.finishedCall(asks, { outcome: 'booked', callerSays: ['haan theek hai', 'details WhatsApp pe bhej do please'] });
  await w.finishedCall(other, { outcome: 'not_interested', callerSays: ['WhatsApp pe bhej do'] });

  const before = fake.sent().length;
  const runs = await runFollowThrough(pool, w.ws);
  const byContact = new Map((await many<{ contact_id: string; result: string }>(pool, 'SELECT contact_id, result FROM channel_followthrough_run WHERE workspace_id = $1', [w.ws])).map(r => [r.contact_id, r.result]));
  assert.equal(byContact.get(quiet), 'blocked:no_opt_in');
  assert.equal(byContact.get(asks), 'sent');
  assert.equal(byContact.has(other), false, 'a call that did not earn the outcome sends nothing');
  assert.equal(runs.length, 2);
  assert.equal(fake.sent().length, before + 1);
  const sent = fake.sent().at(-1)!;
  assert.equal(sent.template, 'booked_summary');
  assert.deepEqual(sent.params, ['Asha', 'Sat 26 Oct, 11:00 am']);
  // The opt-in is the caller's own words, on the call.
  const consent = await one<{ evidence: any; source: string; purpose: string }>(pool, "SELECT evidence, source, purpose FROM consent_record WHERE contact_id = $1 AND channel = 'whatsapp'", [asks]);
  assert.equal(consent!.source, 'in_call');
  assert.equal(consent!.purpose, 'follow_up');
  assert.equal(consent!.evidence.conversationId, cvAsk);
  assert.match(consent!.evidence.quote, /WhatsApp pe bhej do/);

  // Never twice for one call.
  assert.deepEqual(await runFollowThrough(pool, w.ws), []);
  assert.equal(fake.sent().length, before + 1);

  // Held at send, charged on delivery: ₹0.115 on the meter and off the wallet.
  const m = await one<{ id: string; provider_id: string; reservation_id: string; cost_inr_milli: string; conversation_id: string }>(pool,
    "SELECT id, provider_id, reservation_id, cost_inr_milli::text, conversation_id FROM channel_message WHERE workspace_id = $1 AND kind = 'template' AND status <> 'blocked'", [w.ws]);
  assert.equal(m!.cost_inr_milli, '115');
  assert.equal(m!.conversation_id, cvAsk);
  assert.equal((await one<{ status: string }>(pool, 'SELECT status FROM reservation WHERE id = $1', [m!.reservation_id]))!.status, 'held');
  await hook(w.conn.webhookPath, statusBody(w.pnid, m!.provider_id, 'delivered'));
  await hook(w.conn.webhookPath, statusBody(w.pnid, m!.provider_id, 'read'));
  const lines = await many<{ inr_milli: string; component: string }>(pool, 'SELECT inr_milli::text, component FROM cost_line WHERE workspace_id = $1', [w.ws]);
  assert.deepEqual(lines, [{ inr_milli: '115', component: 'message' }]);
  assert.equal((await one<{ b: string }>(pool, 'SELECT balance_inr_milli::text AS b FROM wallet WHERE workspace_id = $1', [w.ws]))!.b, String(10_000_000 - 115));
  const tl = await w.ok('contact.timeline', { contactId: asks });
  assert.deepEqual(tl.items.map((x: any) => x.type), ['message', 'call']);
  assert.equal(tl.items[0].message.status, 'read');
  assert.equal(tl.items[0].message.callId, cvAsk);
});

test('a campaign step: if not answered, send a utility template, once per person a day; marketing is refused for rules', { skip }, async () => {
  const w = await setup();
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category) VALUES ($1,'Visit reminders','service') RETURNING id", [w.ws]))!.id;
  const tid = await w.template('missed_you', 'Hi {{1}}, we tried to call you about your visit. Reply here or call us back when free.', [{ source: 'contact.first_name', sample: 'Asha' }]);
  const mk = await w.template('festive_offer', 'Hi {{1}}, enjoy 20% off cleaning this Diwali at Arogya Dental.', [{ source: 'contact.first_name', sample: 'Asha' }], 'marketing');
  const refused = await w.call('followthrough.rule.set', { name: 'offer', templateId: mk, trigger: 'not_answered', campaignId: campaign });
  const r2 = await reg.approve<any>(pool, (refused as any).actionId, { workspaceId: w.ws, memberId: w.owner });
  assert.equal(r2.status, 'not_executed');
  assert.match(r2.reason, /only utility templates/);
  assert.equal((await w.call('followthrough.rule.set', { name: 'no campaign', templateId: tid, trigger: 'not_answered' })).status, 'needs_approval');
  await w.approved('followthrough.rule.set', { name: 'Missed call note', templateId: tid, trigger: 'not_answered', campaignId: campaign });

  const c1 = await w.contact('Kiran Rao');
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, channel, basis, source, granted) VALUES ($1,$2,'follow_up','whatsapp','consent','upload',true)", [w.ws, c1]);
  for (let i = 0; i < 2; i++) await pool.query("INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'no_answer')", [w.ws, campaign, c1]);
  const runs = await runFollowThrough(pool, w.ws);
  assert.deepEqual(runs.map(r => r.result), ['sent'], 'two unanswered attempts, one message');
  assert.deepEqual(fake.sent().at(-1)!.params, ['Kiran']);
});

test('the gate on templates: marketing needs a marketing opt-in, stale values are not used, the wallet and the daily cap per person hold', { skip }, async () => {
  const w = await setup(500);                       // ₹0.50 in the wallet
  const mk = await w.template('cleaning_offer', 'Hi {{1}}, a cleaning visit is 20% off this month at Arogya Dental.', [{ source: 'contact.first_name', sample: 'Asha' }], 'marketing');
  const cold = await w.contact('Dev Shah');
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, channel, basis, source, granted) VALUES ($1,$2,'all','whatsapp','consent','upload',true)", [w.ws, cold]);
  const r1 = (await w.approved('message_template.send', { templateId: mk, contactId: cold, purpose: 'marketing' })).result;
  assert.equal(r1.status, 'blocked');
  assert.ok(r1.reasons.some((x: any) => x.code === 'marketing_cold'), 'a general WhatsApp yes is not a marketing yes');
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, channel, basis, source, granted) VALUES ($1,$2,'marketing','whatsapp','consent','form',true)", [w.ws, cold]);
  const r2 = (await w.approved('message_template.send', { templateId: mk, contactId: cold, purpose: 'marketing' })).result;
  assert.equal(r2.status, 'blocked');
  assert.deepEqual(r2.reasons.map((x: any) => x.code), ['wallet_low'], 'a marketing message is ₹0.8631 and the wallet holds ₹0.50');
  await pool.query('UPDATE wallet SET balance_inr_milli = 100000 WHERE workspace_id = $1', [w.ws]);
  const r3 = (await w.approved('message_template.send', { templateId: mk, contactId: cold, purpose: 'marketing' })).result;
  assert.equal(r3.status, 'sent');
  assert.equal(r3.costInrMilli, 864);

  const ut = await w.template('balance_due', 'Hi {{1}}, your balance of {{2}} is due on Friday. Pay at arogya.example/pay.',
    [{ source: 'contact.first_name', sample: 'Asha' }, { source: 'attr:balance', sample: '₹1,200' }]);
  const p = await w.contact('Nina Paul', { balance: '₹1,450' });
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, channel, basis, source, granted) VALUES ($1,$2,'follow_up','whatsapp','consent','upload',true)", [w.ws, p]);
  const s1 = (await w.approved('message_template.send', { templateId: ut, contactId: p })).result;
  assert.equal(s1.status, 'sent', 'the amount is on her record, so the door lets it through: ' + JSON.stringify(s1));
  const s2 = (await w.approved('message_template.send', { templateId: ut, contactId: p })).result;
  assert.equal(s2.status, 'sent');
  const s3 = (await w.approved('message_template.send', { templateId: ut, contactId: p })).result;
  assert.deepEqual(s3.reasons.map((x: any) => x.code), ['contact_daily_cap']);

  const stale = await w.contact('Old Record');
  await pool.query("INSERT INTO attribute (contact_id, key, value, max_age_s, observed_at) VALUES ($1,'balance','\"₹900\"',3600, now() - interval '2 hours')", [stale]);
  const s4 = (await w.approved('message_template.send', { templateId: ut, contactId: stale })).result;
  assert.deepEqual(s4.reasons.map((x: any) => x.code), ['variable_stale']);
});
