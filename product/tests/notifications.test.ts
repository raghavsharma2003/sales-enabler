// Notifications that reach people (workspace): Slack and email destinations, chosen per event; exactly one message per
// event; a crisis alert carries no caller words and is out within 5 s of the hand-off committing; email that is not set
// up says so and is recorded, never silent. Real Postgres (skipped when DATABASE_URL is unset). Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createServer as createTcp, type Server as TcpServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { signup, skip, type Booted, type Client } from './workspace-helpers.ts';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { FakeRuntime, setRuntime, sign } from '../server/runtime-client.ts';
import { setFakeLlm } from '../server/llm.ts';
import type { RuntimeEvent } from '../shared/runtime-protocol.ts';
import { module as workspace } from '../server/modules/workspace/index.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { module as agents } from '../server/modules/agents/index.ts';
import { analysesSettled } from '../server/modules/calls/analysis.ts';
import { classify, message, sendNotifications, startNotifier } from '../server/modules/workspace/notifications.ts';

const SECRET = 'notifications-runtime-secret-'.padEnd(48, 'n');
let b: Booted, pool: pg.Pool, slack: Server, slackPort = 0, smtp: TcpServer, smtpPort = 0;
const posts: { path: string; text: string; at: number }[] = [];
const mails: { rcpt: string[]; data: string }[] = [];

before(async () => {
  if (skip) return;
  process.env.VP_RUNTIME_SECRET = SECRET;
  process.env.VP_PUBLIC_URL = 'https://app.example.test';
  delete process.env.VP_SMTP_HOST; delete process.env.VP_SMTP_FROM;
  setRuntime(new FakeRuntime());
  setFakeLlm(() => ({ text: JSON.stringify({ points: [], moments: [], reasonCode: null, outcome: null }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }));
  slack = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => { posts.push({ path: req.url ?? '', text: JSON.parse(Buffer.concat(chunks).toString('utf8')).text, at: Date.now() }); res.writeHead(200).end('ok'); });
  });
  await new Promise<void>(r => slack.listen(0, '127.0.0.1', r));
  slackPort = (slack.address() as AddressInfo).port;
  process.env.VP_SLACK_WEBHOOK_BASE = `http://127.0.0.1:${slackPort}/services/`;
  // A mail server that speaks just enough SMTP (no STARTTLS: it is on this machine).
  smtp = createTcp(s => {
    const m = { rcpt: [] as string[], data: '' }; let inData = false, buf = '';
    s.write('220 test ESMTP\r\n');
    s.on('data', d => {
      buf += d.toString('utf8');
      if (inData) { const end = buf.indexOf('\r\n.\r\n'); if (end < 0) return; m.data = buf.slice(0, end); buf = buf.slice(end + 5); inData = false; mails.push(m); s.write('250 queued\r\n'); }
      let i: number;
      while (!inData && (i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^EHLO/i.test(line)) s.write('250-test\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH/i.test(line)) s.write('235 ok\r\n');
        else if (/^MAIL/i.test(line)) s.write('250 ok\r\n');
        else if (/^RCPT TO:<(.+)>/i.test(line)) { m.rcpt.push(/^RCPT TO:<(.+)>/i.exec(line)![1]); s.write('250 ok\r\n'); }
        else if (/^DATA/i.test(line)) { inData = true; s.write('354 go\r\n'); }
        else if (/^QUIT/i.test(line)) { s.write('221 bye\r\n'); s.end(); }
      }
    });
  });
  await new Promise<void>(r => smtp.listen(0, '127.0.0.1', r));
  smtpPort = (smtp.address() as AddressInfo).port;
  pool = createPool(process.env.DATABASE_URL);
  const app = buildApp(pool, [workspace, calls, agents]);
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r));
  b = { pool, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`, server: app.server, close: async () => { app.server.close(); app.server.closeAllConnections?.(); await pool.end(); } };
});
after(async () => { setRuntime(null); setFakeLlm(null); await analysesSettled(); slack?.close(); slack?.closeAllConnections?.(); smtp?.close(); await b?.close(); });

const now = () => new Date().toISOString();
let seq = 1;
const CALLER_WORDS = 'I cannot go on like this anymore';
async function scene(owner: Client) {
  const ws = owner.workspaceId!;
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Asha') RETURNING id", [ws]))!.id;
  const version = (await one<{ id: string }>(pool, 'INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,$2,$3) RETURNING id', [agent, 'h1', { agent: { schema: 1 }, brief: { text: 'x', hash: 'b', bytes: 1 } }]))!.id;
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category) VALUES ($1,'Renewals','service') RETURNING id", [ws]))!.id;
  return { ws, version, campaign };
}
/** A live call that says something and hands off, through the real runtime hook (ingest makes the hand_off row). */
async function handOffCall(s: Awaited<ReturnType<typeof scene>>, reason: string, o: { channel?: string } = {}) {
  const contact = o.channel === 'test' ? null : (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,'Priya Nair') RETURNING id", [s.ws, `+91900002${String(seq++).padStart(4, '0')}`]))!.id;
  const conv = (await one<{ id: string }>(pool, 'INSERT INTO conversation (workspace_id, contact_id, agent_version_id, channel) VALUES ($1,$2,$3,$4) RETURNING id', [s.ws, contact, s.version, o.channel ?? 'phone']))!.id;
  const ev: RuntimeEvent[] = [
    { seq: 1, type: 'turn', at: now(), speaker: 'caller', text: CALLER_WORDS, startMs: 0, endMs: 2000 },
    { seq: 2, type: 'hand_off', at: now(), reason, target: 'queue:support', summary: `Caller said: ${CALLER_WORDS}` },
  ];
  const body = JSON.stringify({ protocol: 1, conversationId: conv, events: ev });
  const r = await fetch(b.base + '/hooks/runtime', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-signature': sign(SECRET, body) }, body });
  assert.equal(r.status, 200, await r.text());
  return conv;
}
async function slackDestination(owner: Client, path: string, events: string[]) {
  const staged = await owner.tool('integration.stage_secrets', { kind: 'slack', secrets: { webhook_url: `http://127.0.0.1:${slackPort}/services/${path}` } });
  assert.equal(staged.status, 'confirmed', JSON.stringify(staged));
  const conn = await owner.run('integration.connect', { kind: 'slack', name: 'Ops channel ' + path, stashId: staged.result.stashId });
  assert.equal(conn.status, 'confirmed', JSON.stringify(conn));
  const d = await owner.run('notification.destination.create', { kind: 'slack', name: 'Ops channel', integrationId: conn.result.id, events });
  assert.equal(d.status, 'confirmed', JSON.stringify(d));
  return d.result.id as string;
}
const to = (path: string) => posts.filter(p => p.path === `/services/${path}`);

test('classify: which outbox events reach people', () => {
  assert.equal(classify('hand_off.created', { reason: 'crisis' }), 'crisis');
  assert.equal(classify('hand_off.created', { reason: 'asks_for_human' }), 'hand_off');
  assert.equal(classify('hand_off.created', { reason: 'takeover' }), null, 'a person taking over a call is not news to them');
  assert.equal(classify('campaign.state_changed', { to: 'paused', cause: 'cap_reached:campaign' }), 'campaign.paused');
  assert.equal(classify('campaign.state_changed', { to: 'paused', cause: 'person' }), null);
  assert.equal(classify('campaign.state_changed', { to: 'running' }), null);
  assert.equal(classify('wallet.low', { to: 'low' }), 'wallet.low');
  assert.equal(classify('contact.opted_out', {}), null);
});

test('Slack: only hooks.slack.com; exactly one message per event; a crisis carries no caller words; test calls and other workspaces get nothing', { skip }, async () => {
  const owner = await signup(b, 'Notify A'), other = await signup(b, 'Notify B');
  const bad = await owner.tool('integration.stage_secrets', { kind: 'slack', secrets: { webhook_url: 'https://hooks.evil.example/services/x' } });
  assert.equal(bad.status, 'not_executed'); assert.match(bad.reason, /incoming-webhook address starts with/);
  await slackDestination(owner, 'A', ['crisis', 'hand_off', 'campaign.paused', 'wallet.low']);
  await slackDestination(other, 'B', ['crisis', 'hand_off', 'campaign.paused', 'wallet.low']);
  const s = await scene(owner);
  const crisisConv = await handOffCall(s, 'crisis');
  await handOffCall(s, 'asks_for_human');
  await handOffCall(s, 'takeover');                                                          // not sent
  await handOffCall(s, 'crisis', { channel: 'test' });                                       // a practice call alerts no one
  await pool.query("UPDATE campaign SET state = 'running' WHERE id = $1", [s.campaign]);
  await pool.query("UPDATE campaign SET state = 'paused', pause_cause = 'cap_reached:campaign' WHERE id = $1", [s.campaign]);
  await pool.query("UPDATE campaign SET state = 'running', pause_cause = NULL WHERE id = $1", [s.campaign]);
  await pool.query("UPDATE campaign SET state = 'paused', pause_cause = 'person' WHERE id = $1", [s.campaign]);   // a person paused it: not sent
  await pool.query("INSERT INTO wallet (workspace_id, balance_inr_milli) VALUES ($1, 5000000) ON CONFLICT (workspace_id) DO UPDATE SET balance_inr_milli = 5000000", [s.ws]);
  await pool.query('UPDATE wallet SET balance_inr_milli = 300000 WHERE workspace_id = $1', [s.ws]);   // under the ₹1,000 default mark: low
  await pool.query('UPDATE wallet SET balance_inr_milli = 250000 WHERE workspace_id = $1', [s.ws]);   // still low: not again

  await sendNotifications(pool, { workspaceId: s.ws });
  await sendNotifications(pool, { workspaceId: s.ws });                                      // a second run sends nothing again
  await sendNotifications(pool, { workspaceId: other.workspaceId });
  const got = to('A');
  assert.equal(got.length, 4, got.map(g => g.text).join('\n'));
  const crisis = got.filter(g => /may be in distress/.test(g.text));
  assert.equal(crisis.length, 1);
  assert.match(crisis[0].text, new RegExp(`A caller may be in distress — open the call: https://app\\.example\\.test/calls/${crisisConv}$`));
  for (const g of got) {
    assert.ok(!g.text.includes('go on like this'), 'no caller words in any message');
    assert.ok(!g.text.includes('Priya') && !g.text.includes('900002'), 'no name or number');
  }
  assert.equal(got.filter(g => /handed to your team/.test(g.text)).length, 1);
  assert.equal(got.filter(g => /"Renewals" paused itself because its spend cap was reached/.test(g.text)).length, 1);
  assert.equal(got.filter(g => /wallet is running low \(₹300 left\)/.test(g.text)).length, 1);
  assert.equal(to('B').length, 0, 'another workspace hears nothing');
  const listed = (await owner.tool('notification.deliveries')).result.deliveries;
  assert.equal(listed.length, 4); assert.ok(listed.every((d: any) => d.status === 'sent'));
  assert.ok(!JSON.stringify(listed).includes('go on like this'));
});

test('a crisis reaches Slack within 5 s of the hand-off committing, woken by the outbox', { skip }, async () => {
  const owner = await signup(b, 'Notify fast');
  await slackDestination(owner, 'F', ['crisis']);
  const s = await scene(owner);
  const stop = startNotifier(pool, () => sendNotifications(pool, { workspaceId: s.ws }));
  try {
    await new Promise(r => setTimeout(r, 1500));                                             // the listener connects (it starts after 1 s)
    const t0 = Date.now();
    await handOffCall(s, 'crisis');
    while (!to('F').length && Date.now() - t0 < 6000) await new Promise(r => setTimeout(r, 25));
    const ms = (to('F')[0]?.at ?? Infinity) - t0;
    console.log(`[measure] crisis hand-off committed -> Slack received: ${ms} ms`);
    assert.ok(ms < 5000, `${ms} ms`);
  } finally { stop(); }
});

test('email: "Email not set up" is visible and recorded, never silent; with SMTP it goes to the on-duty members', { skip }, async () => {
  const owner = await signup(b, 'Notify mail');
  const list = (await owner.tool('notification.destination.list')).result;
  assert.equal(list.email.configured, false); assert.match(list.email.note, /^Email not set up/);
  const d = await owner.run('notification.destination.create', { kind: 'email', name: 'On duty', events: ['crisis', 'wallet.low'] });
  assert.equal(d.status, 'confirmed', JSON.stringify(d)); assert.equal(d.result.emailConfigured, false);
  const s = await scene(owner);
  await handOffCall(s, 'crisis');
  await sendNotifications(pool, { workspaceId: s.ws });
  const rows = (await owner.tool('notification.deliveries')).result.deliveries;
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'skipped'); assert.match(rows[0].error, /Email is not set up/);
  assert.equal((await owner.tool('notification.destination.create', { kind: 'email', name: 'x', events: ['crisis'], recipients: ['not-an-address'] })).status, 'needs_approval');

  process.env.VP_SMTP_HOST = '127.0.0.1'; process.env.VP_SMTP_PORT = String(smtpPort); process.env.VP_SMTP_FROM = 'Vyakti <alerts@vyakti.example>';
  process.env.VP_SMTP_USER = 'alerts'; process.env.VP_SMTP_PASS = 'synthetic-pass';
  try {
    const t = await owner.tool('notification.test', { id: d.result.id, event: 'crisis' });
    assert.equal(t.status, 'confirmed', JSON.stringify(t)); assert.equal(t.result.status, 'sent', JSON.stringify(t.result));
    const m = mails.at(-1)!;
    assert.deepEqual(m.rcpt, [owner.email], 'empty recipients means the on-duty members');
    assert.match(m.data, /A caller may be in distress — open the call/);
    assert.match(m.data, /\[Test\]/);
    assert.match(m.data, /Subject: =\?UTF-8\?B\?/);
  } finally { for (const k of ['VP_SMTP_HOST', 'VP_SMTP_PORT', 'VP_SMTP_FROM', 'VP_SMTP_USER', 'VP_SMTP_PASS']) delete process.env[k]; }
});

test('message text: a crisis without a public address still names no one', { skip }, async () => {
  const owner = await signup(b, 'Notify words');
  const keep = process.env.VP_PUBLIC_URL; delete process.env.VP_PUBLIC_URL;
  try {
    const m = await message(pool, owner.workspaceId!, 'crisis', { conversationId: '00000000-0000-4000-8000-000000000001', summary: CALLER_WORDS });
    assert.match(m.text, /A caller may be in distress — open the call in Vyakti\.$/);
    assert.ok(!m.text.includes('go on'));
  } finally { process.env.VP_PUBLIC_URL = keep; }
});

test('the in-app alerts are unchanged: a crisis still alerts each on-duty member in the app, beside Slack and an email not set up', { skip }, async () => {
  const owner = await signup(b, 'Notify in-app');
  await slackDestination(owner, 'I', ['crisis']);
  assert.equal((await owner.run('notification.destination.create', { kind: 'email', name: 'On duty', events: ['crisis'] })).status, 'confirmed');
  const s = await scene(owner);
  const conv = await handOffCall(s, 'crisis');
  // The in-app alert is written in the ingest transaction, before any notification is sent.
  const alerts = (await pool.query<{ member_id: string; kind: string; text: string }>('SELECT member_id, kind, text FROM member_alert WHERE conversation_id = $1', [conv])).rows;
  assert.deepEqual(alerts.map(a => [a.member_id, a.kind]), [[owner.memberId, 'crisis_hand_off']]);
  assert.equal(alerts[0].text, 'A caller is in distress and needs a person now. Help lines were given and she is staying on the call.');
  await sendNotifications(pool, { workspaceId: s.ws });
  const mine = (await owner.tool('alert.list')).result;
  assert.equal(JSON.stringify(mine).includes(conv), true, 'the member still sees it in the app after Slack and email ran');
  assert.equal(to('I').length, 1);
  const rows = (await owner.tool('notification.deliveries')).result.deliveries;
  assert.deepEqual(rows.map((r: any) => r.status).sort(), ['sent', 'skipped']);
});
