// Results out (workspace + calls): call.ended and the outbox events through signed webhooks, the record built at send
// time (erasure and retention respected), test calls never sent, tenancy, custom HTTP bearer sign-in, and call.export.
// Real Postgres (skipped when DATABASE_URL is unset). Synthetic data only: every number is +91 90000 xxxxx, every name made up.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { addMember, signup, skip, type Booted, type Client } from './workspace-helpers.ts';
import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import { FakeRuntime, setRuntime, sign, verify } from '../server/runtime-client.ts';
import type { Registry } from '../server/tools.ts';
import type { RunManifest, RuntimeEvent } from '../shared/runtime-protocol.ts';
import { module as workspace } from '../server/modules/workspace/index.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { module as agents } from '../server/modules/agents/index.ts';
import { analyse, analysesSettled } from '../server/modules/calls/analysis.ts';
import { deliverPending, fanOut } from '../server/modules/workspace/webhooks.ts';
import { exportLine, maskE164 } from '../server/modules/workspace/results.ts';

const SECRET = 'results-out-runtime-secret-'.padEnd(48, 'z');
let b: Booted, registry: Registry, pool: pg.Pool;
let receiver: Server, port = 0;
const got: { path: string; body: string; headers: Record<string, string | string[] | undefined> }[] = [];

before(async () => {
  if (skip) return;
  process.env.VP_RUNTIME_SECRET = SECRET;
  process.env.VP_RUNTIME_PUBLIC_URL = 'https://runtime.example.test';
  setRuntime(new FakeRuntime());
  pool = createPool(process.env.DATABASE_URL);
  const app = buildApp(pool, [workspace, calls, agents]);
  registry = app.registry;
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  b = { pool, base, server: app.server, close: async () => { app.server.close(); app.server.closeAllConnections?.(); await pool.end(); } };
  receiver = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => { got.push({ path: req.url ?? '', body: Buffer.concat(chunks).toString('utf8'), headers: req.headers }); res.writeHead(200).end('ok'); });
  });
  await new Promise<void>(r => receiver.listen(0, '127.0.0.1', r));
  port = (receiver.address() as AddressInfo).port;
});
after(async () => { setFakeLlm(null); setRuntime(null); await analysesSettled(); receiver?.close(); receiver?.closeAllConnections?.(); await b?.close(); });

// ---- fixtures ------------------------------------------------------------------------------------------------
const manifest = (over: Partial<RunManifest> = {}): RunManifest => ({ combinationId: 'v2|ears+brain+voice', stackId: 'v2-flashlite', agentVersionHash: 'h1',
  components: { stt: 'ears-x', llm: 'brain-x', tts: 'voice-x' }, fallbacksUsed: [], memory: 'none', runtimeVersion: 't', ...over });
const now = () => new Date().toISOString();
const lines = [
  { speaker: 'agent' as const, text: 'Hello, this is Asha from Example Co., an AI assistant.', startMs: 0 },
  { speaker: 'caller' as const, text: 'Yes, go on.', startMs: 3000 },
  { speaker: 'agent' as const, text: 'Your plan renews next week.', startMs: 6000 },
  { speaker: 'caller' as const, text: 'Fine, I will pay tomorrow.', startMs: 9000 },
];
const events = (): RuntimeEvent[] => {
  let s = 1;
  const ev: RuntimeEvent[] = [{ seq: s++, type: 'call.started', at: now(), manifest: manifest() }];
  for (const l of lines) ev.push({ seq: s++, type: 'turn', at: now(), speaker: l.speaker, text: l.text, startMs: l.startMs, endMs: l.startMs + 2000 });
  ev.push({ seq: s++, type: 'cost', at: now(), component: 'telephony', provider: 'carrier-x', quantity: 30, unit: 'second', inrMilli: 4200 });
  ev.push({ seq: s++, type: 'call.ended', at: now(), endReason: 'completed', durationS: 30, recordingUri: 'rec://synthetic/1', transcript: lines, manifest: manifest() });
  return ev;
};
async function postEvents(conversationId: string, ev: RuntimeEvent[]) {
  const body = JSON.stringify({ protocol: 1, conversationId, events: ev });
  const r = await fetch(b.base + '/hooks/runtime', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-signature': sign(SECRET, body) }, body });
  assert.equal(r.status, 200, await r.text());
}
setFakeLlm(null);
const analyst = (_req: LlmRequest) => ({ text: JSON.stringify({ points: [{ claim: 'They will pay tomorrow.', quote: 'I will pay tomorrow' }], moments: [], reasonCode: null, outcome: null }),
  toolCalls: [], usage: { inputTokens: 50, outputTokens: 10 }, model: 'fake-analyst', provider: 'fake' });

let phone = 9000010000;
async function scene(owner: Client, o: { name?: string; campaign?: string } = {}) {
  const ws = owner.workspaceId!;
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Asha') RETURNING id", [ws]))!.id;
  const version = (await one<{ id: string }>(pool, 'INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,$2,$3) RETURNING id',
    [agent, 'h1', { agent: { schema: 1, agentId: agent, version: 1, versionHash: 'h1', voice: { stackId: 'v2-flashlite' }, limits: { maxDurationS: 240, maxSilenceS: 8, maxTurns: 40 } }, brief: { text: 'x', hash: 'b1', bytes: 1 } }]))!.id;
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category) VALUES ($1,$2,'service') RETURNING id", [ws, o.campaign ?? 'Renewals']))!.id;
  return { ws, agent, version, campaign };
}
async function endedCall(s: Awaited<ReturnType<typeof scene>>, o: { name?: string; channel?: string; manifestTest?: boolean } = {}) {
  const e164 = `+91${phone++}`;
  const contact = o.channel === 'test' ? null : (await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,$3) RETURNING id', [s.ws, e164, o.name ?? 'Ravi Kumar']))!.id;
  const attempt = contact ? (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [s.ws, s.campaign, contact]))!.id : null;
  const conv = (await one<{ id: string }>(pool, 'INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel, run_manifest) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [s.ws, attempt, contact, s.version, o.channel ?? 'phone', o.manifestTest ? { test: true } : {}]))!.id;
  await postEvents(conv, events());
  await analysesSettled();
  return { conv, contact, e164 };
}
async function hook(owner: Client, path: string, args: Record<string, unknown> = {}) {
  const made = await owner.run('webhook.create', { url: `http://127.0.0.1:${port}${path}`, ...args });
  assert.equal(made.status, 'confirmed', JSON.stringify(made));
  const secret = (await owner.tool('secret.reveal', { revealId: made.result.revealId })).result.signingSecret as string;
  return { id: made.result.id as string, secret };
}
const sent = (path: string) => got.filter(g => g.path === path).map(g => ({ ...g, json: JSON.parse(g.body) }));
const deliveriesFor = (ws: string) => many<{ event: string; status: string; payload: any; build: string | null }>(pool, 'SELECT event, status, payload, build FROM webhook_delivery WHERE workspace_id = $1 ORDER BY created_at', [ws]);

// ---- call.ended ------------------------------------------------------------------------------------------------
test('an ended call produces exactly one signed delivery with the full record; another workspace never receives it', { skip }, async () => {
  setFakeLlm(analyst);
  const owner = await signup(b, 'Results A'), other = await signup(b, 'Results B');
  const a = await hook(owner, '/a', { events: ['call.ended'], contactNumber: 'full' });
  await hook(other, '/b');                                                          // listens for everything
  const s = await scene(owner);
  const c = await endedCall(s);

  // The queue and the sweep may both analyse a call; a second analysis must not send a second record.
  await analyse(pool, s.ws, c.conv, registry);
  const rows = await deliveriesFor(s.ws);
  assert.equal(rows.length, 1, JSON.stringify(rows));
  assert.equal(rows[0].event, 'call.ended');
  assert.deepEqual(rows[0].payload, { conversationId: c.conv }, 'the stored delivery holds only the id, never the number or the words');
  assert.ok(!JSON.stringify(await owner.tool('webhook.deliveries')).includes(c.e164));

  await deliverPending(pool, { workspaceId: s.ws });
  await deliverPending(pool, { workspaceId: other.workspaceId });
  const out = sent('/a');
  assert.equal(out.length, 1);
  assert.equal(verify(a.secret, out[0].body, String(out[0].headers['x-vp-signature'])), true, 'signed with the secret shown once');
  const rec = out[0].json.data;
  assert.equal(out[0].json.event, 'call.ended');
  assert.equal(rec.schema, 'vyakti.call.v1');
  assert.equal(rec.id, c.conv);
  assert.equal(rec.contact.e164, c.e164, 'this endpoint asked for full numbers');
  assert.equal(rec.contact.name, 'Ravi Kumar');
  assert.deepEqual(rec.campaign, { id: s.campaign, name: 'Renewals' });
  assert.equal(rec.agent.name, 'Asha'); assert.equal(rec.agent.version, 1); assert.equal(rec.agent.versionId, s.version);
  assert.equal(rec.transcript.length, 4); assert.equal(rec.transcript[3].text, 'Fine, I will pay tomorrow.');
  assert.equal(rec.transcriptRemoved, null);
  assert.equal(rec.summary, 'They will pay tomorrow.');
  assert.equal(rec.extracted.points[0].quote, 'I will pay tomorrow');
  assert.equal(rec.durationS, 30);
  assert.ok(rec.reason?.code && rec.reason?.label, JSON.stringify(rec.reason));
  assert.ok(rec.cost.lines.some((l: any) => l.component === 'telephony' && l.inrMilli === 4200));
  assert.match(rec.recording.url, /^https:\/\/runtime\.example\.test\/v1\/recordings\//, 'a signed recording link');
  assert.ok(new Date(rec.recording.expiresAt).getTime() - Date.now() > 50 * 60_000, 'the link lives about an hour');
  assert.equal(rec.runManifest.stackId, 'v2-flashlite');
  assert.equal(sent('/b').length, 0, "another workspace's endpoint never receives it");
  assert.equal((await deliveriesFor(other.workspaceId!)).length, 0);

  // call.record returns the same record; a viewer gets the number masked.
  const viewer = await addMember(b, owner, 'viewer');
  const v = (await viewer.tool('call.record', { conversationId: c.conv })).result;
  assert.equal(v.contact.e164, maskE164(c.e164)); assert.equal(v.contact.masked, true); assert.equal(v.contact.name, 'RK.', 'initials, as the contacts list shows a viewer');
  assert.equal((await other.tool('call.record', { conversationId: c.conv })).status, 'not_executed', 'another workspace cannot read it');
});

test('a test call produces no delivery, nor does a hand-off on one', { skip }, async () => {
  setFakeLlm(analyst);
  const owner = await signup(b, 'Results test');
  await hook(owner, '/t');
  const s = await scene(owner);
  const t = await endedCall(s, { channel: 'test', manifestTest: true });
  await pool.query("INSERT INTO hand_off (workspace_id, conversation_id, mode, destination, status, brief) VALUES ($1,$2,'warm','team:support','queued','{}')", [s.ws, t.conv]);
  await deliverPending(pool, { workspaceId: s.ws });
  assert.deepEqual(await deliveriesFor(s.ws), []);
  assert.equal(sent('/t').length, 0);
  assert.equal((await owner.tool('call.record', { conversationId: t.conv })).status, 'not_executed');
});

test('the record is built when sent: an erasure or a masked endpoint sends no number and no words', { skip }, async () => {
  setFakeLlm(analyst);
  const owner = await signup(b, 'Results erase');
  await hook(owner, '/e', { events: ['call.ended'], contactNumber: 'full' });
  await hook(owner, '/m', { events: ['call.ended'] });                       // masked by default
  const s = await scene(owner);
  const kept = await endedCall(s), gone = await endedCall(s, { name: 'Meera Shah' });
  // The person asks to be erased after the call ended and before the event is sent; the purge has not run yet.
  await pool.query("INSERT INTO forget_request (workspace_id, contact_id, scope, requested_via) VALUES ($1,$2,'erase_me','caller')", [s.ws, gone.contact]);
  await deliverPending(pool, { workspaceId: s.ws });
  const e = sent('/e').map(x => x.json.data), m = sent('/m').map(x => x.json.data);
  assert.equal(e.length, 2, JSON.stringify(await deliveriesFor(s.ws)));
  const erased = e.find(r => r.id === gone.conv)!, full = e.find(r => r.id === kept.conv)!;
  assert.equal(erased.contact.e164, null); assert.equal(erased.contact.name, null); assert.equal(erased.contact.erased, true);
  assert.deepEqual(erased.transcript, []); assert.equal(erased.transcriptRemoved.reason, 'erased');
  assert.equal(erased.summary, null); assert.deepEqual(erased.extracted.points, []);
  assert.equal(erased.recording, null);
  assert.ok(!JSON.stringify(erased).includes('pay tomorrow'), 'no words of the erased call leave');
  assert.ok(!JSON.stringify(erased).includes(gone.e164));
  assert.equal(full.contact.e164, kept.e164);
  const masked = m.find(r => r.id === kept.conv)!;
  assert.equal(masked.contact.e164, maskE164(kept.e164)); assert.equal(masked.contact.masked, true);
  assert.ok(!JSON.stringify(m).includes(kept.e164), 'a masked endpoint never gets the full number');

  // Retention removes the words later; a replay then sends none either.
  await pool.query("UPDATE conversation SET transcript = '[]', transcript_purged_at = now(), transcript_purge_reason = 'retention' WHERE id = $1", [kept.conv]);
  const d = (await owner.tool('webhook.deliveries', { status: 'delivered' })).result.deliveries.find((x: any) => x.payload.conversationId === kept.conv);
  assert.equal((await owner.run('webhook.replay', { deliveryId: d.id })).status, 'confirmed');
  await deliverPending(pool, { workspaceId: s.ws });
  const replayed = got.filter(g => JSON.parse(g.body).replayOf === d.id).map(g => JSON.parse(g.body).data);
  assert.equal(replayed.length, 1);
  assert.deepEqual(replayed[0].transcript, []); assert.equal(replayed[0].transcriptRemoved.reason, 'retention');
});

// ---- outbox events -----------------------------------------------------------------------------------------------
test('campaign.state_changed, contact.opted_out and hand_off.created are sent once each, from whatever changed them', { skip }, async () => {
  setFakeLlm(analyst);
  const owner = await signup(b, 'Results outbox'), other = await signup(b, 'Results outbox other');
  await hook(owner, '/o', { events: ['campaign.*', 'contact.opted_out', 'hand_off.created'], contactNumber: 'full' });
  await hook(other, '/o2');
  const s = await scene(owner);
  const c = await endedCall(s);
  await pool.query("UPDATE campaign SET state = 'running' WHERE id = $1", [s.campaign]);
  await pool.query("UPDATE campaign SET policy = '{}' WHERE id = $1", [s.campaign]);        // not a state change: nothing
  await pool.query("UPDATE campaign SET state = 'paused', pause_cause = 'person' WHERE id = $1", [s.campaign]);
  await pool.query(`INSERT INTO suppression (workspace_id, contact_id, e164, scope, reason, source, evidence) VALUES ($1,$2,$3,'workspace','opt_out','in_call',$4)`,
    [s.ws, c.contact, c.e164, { conversationId: c.conv, quote: 'please do not call me again' }]);
  await pool.query(`INSERT INTO suppression (workspace_id, contact_id, scope, reason, source) VALUES ($1,$2,'workspace','erased','dpdp')`, [s.ws, c.contact]);
  await pool.query("INSERT INTO hand_off (workspace_id, conversation_id, mode, destination, status, brief) VALUES ($1,$2,'warm','team:support','queued',$3)",
    [s.ws, c.conv, { reason: 'asked_for_person', summary: 'Wants to talk about the bill.' }]);
  await deliverPending(pool, { workspaceId: s.ws });
  await deliverPending(pool, { workspaceId: s.ws });                                          // a second run sends nothing again
  assert.deepEqual(await fanOut(pool, { workspaceId: s.ws }), { events: 0, queued: 0 });
  const out = sent('/o');
  assert.deepEqual(out.map(x => x.json.event).sort(), ['campaign.state_changed', 'campaign.state_changed', 'contact.opted_out', 'hand_off.created']);
  const states = out.filter(x => x.json.event === 'campaign.state_changed').map(x => x.json.data).sort((x: any, y: any) => x.at.localeCompare(y.at));
  assert.deepEqual(states.map((x: any) => [x.from, x.to]), [['draft', 'running'], ['running', 'paused']]);
  assert.equal(states[1].cause, 'person');
  const opt = out.filter(x => x.json.event === 'contact.opted_out');
  assert.equal(opt.length, 1, 'an erasure suppression is not announced');
  assert.equal(opt[0].json.data.contact.e164, c.e164); assert.equal(opt[0].json.data.via, 'call'); assert.equal(opt[0].json.data.conversationId, c.conv);
  assert.ok(!opt[0].body.includes('please do not call'), "the caller's words stay in Vyakti");
  const ho = out.filter(x => x.json.event === 'hand_off.created');
  assert.equal(ho.length, 1); assert.equal(ho[0].json.data.reason, 'asked_for_person'); assert.equal(ho[0].json.data.contact.e164, c.e164);
  assert.equal(sent('/o2').length, 0, 'nothing crosses workspaces');
  // A webhook added later is not sent what happened before it.
  await pool.query("UPDATE campaign SET state = 'running' WHERE id = $1", [s.campaign]);
  await new Promise(r => setTimeout(r, 5));
  await hook(owner, '/late', { events: ['campaign.*'] });
  await deliverPending(pool, { workspaceId: s.ws });
  assert.equal(sent('/late').length, 0);
  assert.equal(sent('/o').filter(x => x.json.event === 'campaign.state_changed').length, 3);
});

// ---- test events, custom HTTP -------------------------------------------------------------------------------------
test('a test event goes out at once, marked as a test; a custom HTTP integration signs a webhook in with its bearer token', { skip }, async () => {
  const owner = await signup(b, 'Results http');
  const h = await hook(owner, '/x');
  const t = await owner.tool('webhook.test', { id: h.id, event: 'hand_off.created' });
  assert.equal(t.status, 'confirmed', JSON.stringify(t));
  assert.equal(t.result.status, 'delivered'); assert.equal(t.result.responseStatus, 200);
  const x = sent('/x').at(-1)!;
  assert.equal(x.headers['x-vp-test'], '1'); assert.equal(x.json.test, true); assert.equal(x.json.data.schema, 'vyakti.hand_off.v1');
  assert.equal(x.json.data.contact.masked, true);
  assert.equal(verify(h.secret, x.body, String(x.headers['x-vp-signature'])), true);

  const token = 'bearer-synthetic-' + randomUUID();
  const staged = await owner.tool('integration.stage_secrets', { kind: 'custom_http', secrets: { bearer_token: token } });
  const conn = await owner.run('integration.connect', { kind: 'custom_http', name: 'Warehouse API', stashId: staged.result.stashId, config: { base_url: `http://127.0.0.1:${port}/crm` } });
  assert.equal(conn.status, 'confirmed', JSON.stringify(conn));
  const off = await owner.run('webhook.create', { url: `http://127.0.0.1:${port}/elsewhere`, authIntegrationId: conn.result.id });
  assert.match(off.reason ?? JSON.stringify(off), /base address/, 'the token is never sent off its base address');
  const on = await hook(owner, '/crm/vyakti', { authIntegrationId: conn.result.id });
  assert.equal((await owner.tool('webhook.test', { id: on.id })).result.status, 'delivered');
  const y = sent('/crm/vyakti').at(-1)!;
  assert.equal(y.headers.authorization, `Bearer ${token}`);
  assert.equal(y.json.data.schema, 'vyakti.call.v1');
  const kinds = (await owner.tool('integration.kinds')).result.kinds;
  assert.ok(kinds.find((k: any) => k.id === 'custom_http').usedBy);
  assert.equal(kinds.find((k: any) => k.id === 'salesforce').usedBy, null, 'stored, not used yet');
  // Disconnected: deliveries fail with the reason instead of going out unauthenticated.
  assert.equal((await owner.run('integration.disconnect', { id: conn.result.id })).status, 'confirmed');
  const after = (await owner.tool('webhook.test', { id: on.id })).result;
  assert.equal(after.status, 'failed'); assert.match(after.error, /disconnected/);
});

// ---- call.export -------------------------------------------------------------------------------------------------
test('call.export: approved, streamed, formula-escaped, without suppressed, erased or test calls', { skip }, async () => {
  setFakeLlm(analyst);
  const owner = await signup(b, 'Results export');
  const s = await scene(owner, { campaign: '+Renewals=1' });
  const plain = await endedCall(s), evil = await endedCall(s, { name: '=HYPERLINK("https://evil.example","x")' });
  const supp = await endedCall(s, { name: 'Suppressed Person' }), gone = await endedCall(s, { name: 'Erased Person' });
  const t = await endedCall(s, { channel: 'test', manifestTest: true });
  await pool.query("INSERT INTO suppression (workspace_id, contact_id, e164, scope, reason, source) VALUES ($1,$2,$3,'workspace','opt_out','manual')", [s.ws, supp.contact, supp.e164]);
  await pool.query("UPDATE contact SET e164 = 'erased:' || id::text, name = NULL, erased_at = now() WHERE id = $1", [gone.contact]);

  const builder = await addMember(b, owner, 'builder');
  assert.equal((await builder.tool('call.export', {})).status, 'not_executed', 'a builder cannot export calls');
  const asked = await owner.tool('call.export', { campaignId: s.campaign });
  assert.equal(asked.status, 'needs_approval');
  assert.match(asked.summary, /full phone numbers/); assert.match(asked.summary, /suppressed people and erased people are left out/);
  const done = (await owner.fetch('POST', `/v1/actions/${asked.actionId}/decide`, { approve: true })).body;
  assert.equal(done.status, 'confirmed', JSON.stringify(done));
  assert.equal(done.result.rows, 2);
  assert.equal((await builder.fetch('GET', done.result.download)).status, 403);
  const file = await owner.fetch('GET', done.result.download);
  assert.equal(file.status, 200);
  assert.match(String(file.headers.get('content-type')), /text\/csv/);
  const csv: string = file.body;
  const rows = csv.trim().split('\r\n');
  assert.equal(rows[0].split(',')[0], 'call_id');
  assert.equal(rows.length, 3, csv);
  assert.ok(csv.includes(plain.conv) && csv.includes(evil.conv));
  for (const x of [supp, gone, t]) assert.ok(!csv.includes(x.conv), 'suppressed, erased and test calls are left out');
  assert.ok(!csv.includes('Suppressed Person') && !csv.includes(supp.e164));
  assert.ok(csv.includes(`"'=HYPERLINK(""https://evil.example"",""x"")"`), 'a name that is a formula is escaped');
  assert.ok(csv.includes("'+Renewals=1"), 'a campaign name that is a formula is escaped');
  assert.ok(csv.includes(plain.e164 + ','), 'the phone number itself is written as it is');
  assert.ok(!/(^|,)[=+\-@][^,]*/.test(rows.slice(1).map(r => r.replace(/(^|,)\+\d{8,15}(?=,)/g, '$1')).join('\n')), 'no other cell starts with a formula character');
  const audit = await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM audit_event WHERE workspace_id = $1 AND action = 'call.export.download'", [s.ws]);
  assert.equal(audit!.n, 1, 'each download is audited');
  // Someone suppressed after the approval is left out of the next download too: the file is made when it is downloaded.
  await pool.query("INSERT INTO suppression (workspace_id, contact_id, e164, scope, reason, source) VALUES ($1,$2,$3,'workspace','opt_out','manual')", [s.ws, plain.contact, plain.e164]);
  assert.ok(!(await owner.fetch('GET', done.result.download)).body.includes(plain.conv));
  assert.match(exportLine({ id: 'x', direction: 'outbound', contact_name: '@SUM(A1)', flags: [] }), /'@SUM\(A1\)/);
});
