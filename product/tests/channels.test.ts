// Channels (WhatsApp) against a real Postgres and the fake Graph API: nothing here reaches Meta. Synthetic numbers only
// (+91 90000 000xx), made-up names and text. Each test makes its own workspace, so the file is safe to repeat.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';

process.env.NODE_ENV = 'test';
process.env.VP_SECRET_KEY ??= randomBytes(32).toString('hex');

import { createPool, one, many } from '../server/db.ts';
import { buildApp } from '../server/app.ts';
import type { Registry, Actor } from '../server/tools.ts';
import { module as workspaceModule } from '../server/modules/workspace/index.ts';
import { module as intake } from '../server/modules/intake/index.ts';
import { module as channels, FakeGraph, setGraph, signWebhook } from '../server/modules/channels/index.ts';
import { dialFacts } from '../server/modules/intake/contacts.ts';
import { isOptOutMessage, asksForWhatsApp } from '../server/modules/channels/consent.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let reg: Registry;
let base = '';
let close: () => Promise<void> = async () => {};
let fake: FakeGraph;
const APP_SECRET = 'test-app-secret-' + randomBytes(4).toString('hex');

before(async () => {
  if (skip) return;
  pool = createPool(URL_);
  const app = buildApp(pool, [workspaceModule, intake, channels]);
  reg = app.registry;
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = async () => { app.server.close(); await app.stop(); };
});
after(async () => { setGraph(null); await close(); await pool?.end(); });

let seq = 0;
const phone = () => `+9190000${String(10000 + (Date.now() % 50000) + (++seq * 7) % 40000).slice(-5)}`;
const wa = (e164: string) => e164.slice(1);

async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('channels test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role, status) VALUES ($1,$2,'owner','active') RETURNING id",
    [ws, `o${Math.random()}@example.test`]))!.id;
  const as: Actor = { type: 'member', id: owner, role: 'owner' };
  const call = (name: string, args: unknown, actor: Actor = as) => reg.execute<any>(pool, name, args, { workspaceId: ws, actor });
  const ok = async (name: string, args: unknown, actor?: Actor) => {
    const r = await call(name, args, actor);
    assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`);
    return (r as { result: any }).result;
  };
  const approved = async (name: string, args: unknown) => {
    const r = await call(name, args);
    assert.equal(r.status, 'needs_approval', `${name} should wait for approval: ${JSON.stringify(r)}`);
    const a = await reg.approve<any>(pool, (r as { actionId: string }).actionId, { workspaceId: ws, memberId: owner });
    assert.equal(a.status, 'confirmed', `${name} approval: ${JSON.stringify(a)}`);
    return (a as { result: any }).result;
  };
  const contact = async (name = 'Asha Verma', e164 = phone()) =>
    (await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,$3) RETURNING id', [ws, e164, name]))!.id;
  return { ws, owner, as, call, ok, approved, contact };
}
type W = Awaited<ReturnType<typeof workspace>>;

/** Connect a WhatsApp number through the integrations vault, as the Settings page does. */
async function connect(w: W, phoneNumberId = 'PNID' + randomBytes(5).toString('hex')) {
  const stash = await w.ok('integration.stage_secrets', { kind: 'whatsapp_cloud', secrets: { access_token: 'EAAG-test-token', app_secret: APP_SECRET } });
  const ig = await w.approved('integration.connect', { kind: 'whatsapp_cloud', name: 'Support line ' + randomBytes(2).toString('hex'), stashId: stash.stashId,
    config: { phone_number_id: phoneNumberId, waba_id: 'WABA' + phoneNumberId, display_number: '+91 90000 00000' } });
  const conn = await w.approved('channel.connect', { integrationId: ig.id });
  return { ...conn, phoneNumberId };
}

function inboundBody(phoneNumberId: string, from: string, text: string, id = 'wamid.IN' + randomBytes(6).toString('hex'), name = 'Asha') {
  return { object: 'whatsapp_business_account', entry: [{ id: 'WABA' + phoneNumberId, changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { display_phone_number: '919000000000', phone_number_id: phoneNumberId },
    contacts: [{ profile: { name }, wa_id: from }], messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }] };
}
function statusBody(phoneNumberId: string, providerId: string, status: string, extra: Record<string, unknown> = {}) {
  return { object: 'whatsapp_business_account', entry: [{ id: 'WABA' + phoneNumberId, changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { phone_number_id: phoneNumberId },
    statuses: [{ id: providerId, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '919000000000', ...extra }] } }] }] };
}
async function post(path: string, body: unknown, secret = APP_SECRET) {
  const raw = JSON.stringify(body);
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signWebhook(secret, raw) }, body: raw });
  return { status: r.status, body: await r.json().catch(() => null) };
}

before(() => { if (!skip) { fake = new FakeGraph(); setGraph(fake); } });

test('connecting a number: webhook handshake answers only its own verify token; unsigned or wrongly signed deliveries are refused', { skip }, async () => {
  const w = await workspace();
  const c = await connect(w);
  assert.match(c.webhookPath, /^\/hooks\/channels\/whatsapp\/[0-9a-f-]{36}$/);
  assert.ok(c.verifyToken && c.verifyToken.length >= 20);
  // The stored action never keeps the token.
  const act = await one<{ result: any }>(pool, "SELECT result FROM action WHERE workspace_id = $1 AND tool = 'channel.connect'", [w.ws]);
  assert.equal(act!.result.verifyToken, '(shown once)');

  const bad = await fetch(`${base}${c.webhookPath}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`);
  assert.equal(bad.status, 403);
  const good = await fetch(`${base}${c.webhookPath}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(c.verifyToken)}&hub.challenge=12345`);
  assert.equal(good.status, 200);
  assert.equal(await good.text(), '12345');

  const body = inboundBody(c.phoneNumberId, '919000000099', 'hello');
  const unsigned = await fetch(base + c.webhookPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(unsigned.status, 401);
  assert.equal((await post(c.webhookPath, body, 'some-other-secret')).status, 401);
  assert.equal((await one<{ n: string }>(pool, 'SELECT count(*)::text AS n FROM channel_message WHERE workspace_id = $1', [w.ws]))!.n, '0');

  const list = await w.ok('channel.list', {});
  assert.equal(list.connections.length, 1);
  assert.equal(list.connections[0].status, 'active');
  assert.ok(list.connections[0].webhookVerifiedAt, 'the handshake marks the webhook verified');
  // A second workspace cannot connect the same business number.
  const w2 = await workspace();
  const stash = await w2.ok('integration.stage_secrets', { kind: 'whatsapp_cloud', secrets: { access_token: 't', app_secret: 's' } });
  const ig = await w2.approved('integration.connect', { kind: 'whatsapp_cloud', name: 'dup', stashId: stash.stashId, config: { phone_number_id: c.phoneNumberId } });
  const dup = await w2.call('channel.connect', { integrationId: ig.id });
  const dupRun = await reg.approve<any>(pool, (dup as { actionId: string }).actionId, { workspaceId: w2.ws, memberId: w2.owner });
  assert.equal(dupRun.status, 'not_executed');
  assert.match(dupRun.reason, /already connected/);
});

test('an inbound message is an episode on the one timeline beside calls, opens the 24-hour window, and is applied once', { skip }, async () => {
  const w = await workspace();
  const c = await connect(w);
  const e164 = phone();
  const cid = await w.contact('Asha Verma', e164);
  await pool.query(`INSERT INTO conversation (workspace_id, contact_id, channel, status, started_at, ended_at, outcome, reason_code)
    VALUES ($1,$2,'phone','done', now() - interval '2 hours', now() - interval '119 minutes', 'callback_booked', 'CONV_CALLBACK')`, [w.ws, cid]);
  const body = inboundBody(c.phoneNumberId, wa(e164), 'Hi, can you send the clinic address?', 'wamid.IN-fixed-1');
  const r1 = await post(c.webhookPath, body);
  assert.equal(r1.status, 200);
  assert.equal(r1.body.applied, 1);
  const r2 = await post(c.webhookPath, body);                  // Meta retries: applied once
  assert.equal(r2.body.applied, 0);

  const tl = await w.ok('contact.timeline', { contactId: cid });
  assert.deepEqual(tl.items.map((x: any) => x.type), ['message', 'call']);
  assert.equal(tl.items[0].message.direction, 'inbound');
  assert.equal(tl.items[0].message.body, 'Hi, can you send the clinic address?');
  const ch = await w.ok('contact.channels', { contactId: cid });
  assert.equal(ch.whatsapp.stopped, false);
  assert.equal(ch.whatsapp.conversations.length, 1);
  assert.equal(ch.whatsapp.conversations[0].window.open, true);
  // No agent on the number: the conversation waits for a person.
  assert.equal(ch.whatsapp.conversations[0].handledBy, 'person');

  // Another workspace sees none of it.
  const w2 = await workspace();
  assert.equal((await w2.call('contact.timeline', { contactId: cid })).status, 'not_executed');
  assert.equal((await w2.call('message.list', { threadId: ch.whatsapp.conversations[0].id })).status, 'not_executed');
  const send2 = await w2.call('message.send', { threadId: ch.whatsapp.conversations[0].id, text: 'hello' });
  if (send2.status === 'needs_approval') {
    const a = await reg.approve<any>(pool, (send2 as { actionId: string }).actionId, { workspaceId: w2.ws, memberId: w2.owner });
    assert.notEqual(a.status, 'confirmed');
  } else assert.notEqual(send2.status, 'confirmed');
});

test("a team member's reply inside the window goes out through the gate; delivery is tracked; free text is not charged", { skip }, async () => {
  const w = await workspace();
  const c = await connect(w);
  const e164 = phone();
  const cid = await w.contact('Ravi Kumar', e164);
  await post(c.webhookPath, inboundBody(c.phoneNumberId, wa(e164), 'Is my order shipped?'));
  const thread = (await w.ok('contact.channels', { contactId: cid })).whatsapp.conversations[0];
  const before = fake.sent().length;
  const sent = await w.approved('message.send', { threadId: thread.id, text: 'Yes, it left our warehouse today. It should reach you by Friday.' });
  assert.equal(sent.status, 'sent', JSON.stringify(sent));
  assert.equal(fake.sent().length, before + 1);
  assert.deepEqual(fake.sent().at(-1), { to: wa(e164), type: 'text', text: 'Yes, it left our warehouse today. It should reach you by Friday.', template: undefined, params: undefined });
  assert.equal(sent.costInrMilli, 0);
  await post(c.webhookPath, statusBody(c.phoneNumberId, sent.providerId, 'delivered'));
  await post(c.webhookPath, statusBody(c.phoneNumberId, sent.providerId, 'sent'));     // late "sent" never moves it back
  const m = await one<{ status: string; delivered_at: Date | null }>(pool, 'SELECT status, delivered_at FROM channel_message WHERE id = $1', [sent.messageId]);
  assert.equal(m!.status, 'delivered');
  assert.ok(m!.delivered_at);
  assert.equal((await one<{ n: string }>(pool, "SELECT count(*)::text AS n FROM cost_line WHERE workspace_id = $1 AND component = 'message'", [w.ws]))!.n, '0');
  const list = await w.ok('message.list', { threadId: thread.id });
  assert.deepEqual(list.messages.map((x: any) => [x.direction, x.author]), [['inbound', 'person'], ['outbound', 'member']]);
});

test('outside the 24-hour window free text is refused before anything leaves; a refusal and an unknown outcome are stored honestly', { skip }, async () => {
  const w = await workspace();
  const c = await connect(w);
  const e164 = phone();
  const cid = await w.contact('Meera Iyer', e164);
  await post(c.webhookPath, inboundBody(c.phoneNumberId, wa(e164), 'hello'));
  const thread = (await w.ok('contact.channels', { contactId: cid })).whatsapp.conversations[0];

  fake.refuseNext(131047, 'Re-engagement message');
  const failed = await w.approved('message.send', { threadId: thread.id, text: 'Following up on your question.' });
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /24 hours/);
  fake.timeoutNext();
  const unknown = await w.approved('message.send', { threadId: thread.id, text: 'Following up again.' });
  assert.equal(unknown.status, 'unknown');

  await pool.query("UPDATE channel_thread SET last_inbound_at = now() - interval '25 hours' WHERE id = $1", [thread.id]);
  const before = fake.requests.length;
  const preview = await w.ok('message.preview', { threadId: thread.id, text: 'Are you there?' });
  assert.equal(preview.allowed, false);
  assert.deepEqual(preview.reasons.map((r: any) => r.code), ['outside_window']);
  const blocked = await w.approved('message.send', { threadId: thread.id, text: 'Are you there?' });
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.reasons.map((r: any) => r.code), ['outside_window']);
  assert.equal(fake.requests.length, before, 'nothing reached the Graph API');
  const rows = await many<{ status: string }>(pool, "SELECT status FROM channel_message WHERE thread_id = $1 AND direction = 'outbound' ORDER BY created_at", [thread.id]);
  assert.deepEqual(rows.map(r => r.status), ['failed', 'unknown', 'blocked']);
});

test('STOP on WhatsApp stops WhatsApp at once and shows on the contact; calls keep their own consent', { skip }, async () => {
  const w = await workspace();
  const c = await connect(w);
  const e164 = phone();
  const cid = await w.contact('Kiran Rao', e164);
  await post(c.webhookPath, inboundBody(c.phoneNumberId, wa(e164), 'STOP'));
  const ch = await w.ok('contact.channels', { contactId: cid });
  assert.equal(ch.whatsapp.stopped, true);
  assert.equal(ch.whatsapp.stoppedVia, 'whatsapp');
  // The contact page's own consent history (intake) shows the withdrawal on the WhatsApp channel.
  const got = await w.ok('contact.get', { id: cid });
  assert.ok(got.consent.some((k: any) => k.channel === 'whatsapp' && k.granted === false && k.purpose === 'all'));
  const thread = ch.whatsapp.conversations[0];
  const blocked = await w.approved('message.send', { threadId: thread.id, text: 'Sorry to see you go.' });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.reasons.some((r: any) => r.code === 'opted_out'));
  // Nothing answered the STOP, and calls are unaffected by a WhatsApp opt-out.
  assert.equal((await one<{ reply_state: string }>(pool, "SELECT reply_state FROM channel_message WHERE thread_id = $1 AND direction = 'inbound'", [thread.id]))!.reply_state, 'skipped');
  const facts = await dialFacts(pool, w.ws, { contactId: cid });
  assert.equal(facts.service.allowed, true);

  // "message mat bhejo" is an opt-out too; a member can also stop WhatsApp for a person, at once.
  const e2 = phone();
  const cid2 = await w.contact('Dev Shah', e2);
  await post(c.webhookPath, inboundBody(c.phoneNumberId, wa(e2), 'please mujhe WhatsApp pe message mat bhejo'));
  assert.equal((await w.ok('contact.channels', { contactId: cid2 })).whatsapp.stopped, true);
  const cid3 = await w.contact('Nina Paul');
  const r = await w.call('channel.opt_out', { contactId: cid3, reason: 'asked by email' });
  assert.equal(r.status, 'confirmed');
  assert.equal((await w.ok('contact.channels', { contactId: cid3 })).whatsapp.stopped, true);
});

test('a STOP from a number not on file holds on the thread and follows the person once they are on file', { skip }, async () => {
  const w = await workspace();
  const c = await connect(w);
  const e164 = phone();
  await post(c.webhookPath, inboundBody(c.phoneNumberId, wa(e164), 'unsubscribe'));
  const t = await one<{ id: string; contact_id: string | null; opted_out_at: Date | null }>(pool, 'SELECT id, contact_id, opted_out_at FROM channel_thread WHERE connection_id = $1', [c.connectionId]);
  assert.equal(t!.contact_id, null);
  assert.ok(t!.opted_out_at);
  const cid = await w.contact('Later Contact', e164);
  await post(c.webhookPath, inboundBody(c.phoneNumberId, wa(e164), 'what are your hours?'));
  const ch = await w.ok('contact.channels', { contactId: cid });
  assert.equal(ch.whatsapp.stopped, true, 'the earlier STOP is now in the consent ledger');
  const blocked = await w.approved('message.send', { threadId: t!.id, text: 'We are open 10 to 7.' });
  assert.ok(blocked.reasons.some((r: any) => r.code === 'opted_out'));
});

test('the reply door gates every outbound text; suppression holds on WhatsApp too', { skip }, async () => {
  const w = await workspace();
  const c = await connect(w);
  const e164 = phone();
  const cid = await w.contact('Sunil Das', e164);
  await post(c.webhookPath, inboundBody(c.phoneNumberId, wa(e164), 'hello'));
  const thread = (await w.ok('contact.channels', { contactId: cid })).whatsapp.conversations[0];
  const before = fake.requests.length;
  const otp = await w.approved('message.send', { threadId: thread.id, text: 'To confirm, please share the OTP you just received.' });
  assert.equal(otp.status, 'blocked');
  assert.deepEqual(otp.reasons.map((r: any) => r.code), ['door_blocked']);
  const link = await w.approved('message.send', { threadId: thread.id, text: 'Pay here: https://bit.ly/abc' });
  assert.deepEqual(link.reasons.map((r: any) => r.code), ['door_blocked']);
  assert.equal(fake.requests.length, before);
  // A person on the team may say they are a person: RD2 is about the agent.
  const human = await w.approved('message.send', { threadId: thread.id, text: 'I am a person on the support team, happy to help.' });
  assert.equal(human.status, 'sent');
  await w.ok('contact.suppress', { contactId: cid, reason: 'asked never to be contacted' });
  const supp = await w.approved('message.send', { threadId: thread.id, text: 'One more thing.' });
  assert.ok(supp.reasons.some((r: any) => r.code === 'suppressed'));
});

test('opt-out and WhatsApp-request phrases: words that mean it, and look-alikes that do not', () => {
  for (const s of ['STOP', 'stop.', 'Unsubscribe', 'opt out', 'band karo', 'WhatsApp pe message mat bhejo', 'please stop sending me messages', 'मैसेज मत भेजो'])
    assert.equal(isOptOutMessage(s), true, s);
  for (const s of ['cancel', "don't stop the delivery", 'stop by the store tomorrow?', 'can you send the bill', 'when does the bus stop?'])
    assert.equal(isOptOutMessage(s), false, s);
  for (const s of ['WhatsApp pe bhej do', 'haan whatsapp par bhejiye', 'please send it on WhatsApp', 'व्हाट्सएप पे भेज दो'])
    assert.equal(asksForWhatsApp(s), true, s);
  for (const s of ['WhatsApp mat bhejo', 'I am not on WhatsApp', 'send it by email'])
    assert.equal(asksForWhatsApp(s), false, s);
});

test('static check: only the gate calls a transport send, and only the transport posts messages to the Graph API', () => {
  const root = join(import.meta.dirname, '..', 'server');
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
  walk(root);
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const rel = f.slice(root.length + 1);
    // A transport's send(creds, out): written as <transport>.send( with a credentials argument.
    if (/\b(whatsapp|transport|TRANSPORTS(\.\w+|\[[^\]]+\]))\.send\(/.test(src) && rel !== 'modules/channels/gate.ts') offenders.push(rel + ': calls a transport send');
    if (/\/messages[`'"]/.test(src) && /graph\(\)\.request/.test(src) && rel !== 'modules/channels/whatsapp.ts') offenders.push(rel + ': posts to the Graph messages endpoint');
  }
  assert.deepEqual(offenders, []);
  const gate = readFileSync(join(root, 'modules/channels/gate.ts'), 'utf8');
  assert.equal((gate.match(/transport\.send\(/g) ?? []).length, 1, 'one send call site');
  // And that call site runs only after the door: doorOver() is applied in plan(), which gatedSend runs first.
  assert.ok(gate.indexOf('doorOver(bodyOf()') < gate.indexOf('transport.send('));
});
