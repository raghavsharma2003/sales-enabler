// Workspace module: results leave Vyakti. call.ended (one signed delivery per ended call, none for a test call, never another
// workspace's endpoint), campaign.state_changed, contact.opted_out, hand_off.created, call.export, and the custom HTTP integration.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { one } from '../server/db.ts';
import { verify } from '../server/runtime-client.ts';
import { analyse } from '../server/modules/calls/analysis.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { module as workspace } from '../server/modules/workspace/index.ts';
import { deliverPending } from '../server/modules/workspace/webhooks.ts';
import { buildApp } from '../server/app.ts';
import type { Registry } from '../server/tools.ts';
import { addMember, boot, skip, signup, type Booted, type Client } from './workspace-helpers.ts';

let b: Booted, registry: Registry;
let receiver: Server, port = 0;
const got: { body: string; headers: Record<string, string | string[] | undefined> }[] = [];
before(async () => {
  if (skip) return;
  b = await boot();
  registry = buildApp(b.pool, [workspace, calls]).registry;       // the registry analyse() gets, with the calls tools too
  receiver = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => { got.push({ body: Buffer.concat(chunks).toString('utf8'), headers: req.headers }); res.writeHead(200).end('ok'); });
  });
  await new Promise<void>(r => receiver.listen(0, '127.0.0.1', r));
  port = (receiver.address() as { port: number }).port;
});
after(async () => { receiver?.close(); receiver?.closeAllConnections?.(); await b?.close(); });

let phone = 9100000000;
async function world(owner: Client) {
  const ws = owner.workspaceId!;
  const agent = (await one<{ id: string }>(b.pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Asha') RETURNING id", [ws]))!.id;
  const version = (await one<{ id: string }>(b.pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,3,'h3','{}') RETURNING id", [agent]))!.id;
  const campaign = (await one<{ id: string }>(b.pool, "INSERT INTO campaign (workspace_id, name, call_category) VALUES ($1,'Renewals','service') RETURNING id", [ws]))!.id;
  return { ws, agent, version, campaign };
}
async function endedCall(w: Awaited<ReturnType<typeof world>>, o: { channel?: string; name?: string } = {}) {
  const contact = (await one<{ id: string }>(b.pool, "INSERT INTO contact (workspace_id, e164, name, language) VALUES ($1,$2,$3,'hi') RETURNING id", [w.ws, `+91${phone++}`, o.name ?? 'Meera Nair']))!.id;
  const attempt = (await one<{ id: string }>(b.pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [w.ws, w.campaign, contact]))!.id;
  const transcript = [{ speaker: 'agent', text: 'Namaste, main Asha, Example Co. ki AI assistant.', startMs: 0 }, { speaker: 'caller', text: 'Haan boliye.', startMs: 3000 }];
  const conv = (await one<{ id: string }>(b.pool, `INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel, status, transcript, reason_code, duration_s, ended_at, cost_inr_milli, run_manifest)
    VALUES ($1,$2,$3,$4,$5,'ended',$6,'CONV_GOAL_DONE',41, now(), 2500, $7) RETURNING id`, [w.ws, attempt, contact, w.version, o.channel ?? 'phone', JSON.stringify(transcript), JSON.stringify({ stackId: 'v2-flashlite', runtimeVersion: 't' })]))!.id;
  await b.pool.query("INSERT INTO cost_line (workspace_id, conversation_id, component, provider, quantity, unit, inr_milli) VALUES ($1,$2,'telephony','plivo',41,'second',2500)", [w.ws, conv]);
  return { contact, conv };
}
async function hook(owner: Client, o: Record<string, unknown> = {}) {
  const made = await owner.run('webhook.create', { url: `http://127.0.0.1:${port}/hook`, events: ['call.ended', 'campaign.state_changed', 'contact.opted_out', 'hand_off.created'], ...o });
  assert.equal(made.status, 'confirmed', JSON.stringify(made));
  const secret = (await owner.tool('secret.reveal', { revealId: made.result.revealId })).result.signingSecret as string;
  return { id: made.result.id as string, secret };
}
const send = async (owner: Client) => { got.length = 0; await deliverPending(b.pool, { workspaceId: owner.workspaceId, limit: 100 }); return got.splice(0); };

test('call.ended: one signed, versioned, masked record per ended call; none for a test call; never another workspace', { skip }, async () => {
  const owner = await signup(b), other = await signup(b);
  const w = await world(owner);
  const mine = await hook(owner), theirs = await hook(other);
  const real = await endedCall(w), test = await endedCall(w, { channel: 'test' });

  await analyse(b.pool, w.ws, real.conv, registry);
  await analyse(b.pool, w.ws, real.conv, registry);          // analysed twice: still one delivery
  await analyse(b.pool, w.ws, test.conv, registry);
  const delivered = await send(owner);
  assert.equal(delivered.length, 1, 'exactly one delivery for the ended call, none for the test call');
  const [d] = delivered;
  assert.equal(verify(mine.secret, d.body, String(d.headers['x-vp-signature'])), true, 'signed with the endpoint secret');
  assert.equal(verify(theirs.secret, d.body, String(d.headers['x-vp-signature'])), false);
  assert.equal(d.headers['x-vp-event'], 'call.ended');
  const env = JSON.parse(d.body), rec = env.data;
  assert.equal(env.event, 'call.ended');
  assert.equal(rec.schema, 'vp.call.v1');
  assert.equal(rec.call.id, real.conv);
  assert.equal(rec.call.durationS, 41);
  assert.equal(rec.call.reasonCode, 'CONV_GOAL_DONE');
  assert.equal(rec.campaign.name, 'Renewals');
  assert.deepEqual([rec.agent.name, rec.agent.version], ['Asha', 3]);
  assert.equal(rec.contact.phone, rec.contact.phone.slice(0, 3) + '•••••' + rec.contact.phone.slice(-4), 'the number is masked');
  assert.equal(rec.contact.name, 'M. N.');
  assert.ok(!d.body.includes('Meera'), 'the name is not in the delivery');
  assert.equal(rec.transcript.length, 2);
  assert.equal(rec.cost.totalInrMilli, 2500);
  assert.deepEqual(rec.cost.lines[0], { component: 'telephony', provider: 'plivo', quantity: 41, unit: 'second', inr_milli: 2500 });
  assert.equal(rec.runManifest.stackId, 'v2-flashlite');
  assert.equal(rec.recording.url, null, 'no recording on this call, and it says why');
  assert.ok(rec.recording.why);

  assert.equal((await send(other)).length, 0, "another workspace's endpoint receives nothing");
  assert.equal((await owner.tool('webhook.deliveries', { endpointId: theirs.id })).result.deliveries.length, 0);

  // the receipt list shows the delivery, and replay sends the same record again
  const list = (await owner.tool('webhook.deliveries', { endpointId: mine.id, includePayload: true })).result.deliveries;
  assert.equal(list.length, 1);
  assert.equal(list[0].payload.call.id, real.conv);
  assert.equal((await owner.run('webhook.replay', { deliveryId: list[0].id })).status, 'confirmed');
  const again = await send(owner);
  assert.equal(again.length, 1);
  assert.equal(JSON.parse(again[0].body).data.call.id, real.conv);
});

test('whole numbers only for an endpoint that asks, approved by an owner; an erased person is never named', { skip }, async () => {
  const owner = await signup(b), builder = await addMember(b, owner, 'builder');
  const w = await world(owner);
  const wholeHook = await hook(owner, { contactNumber: 'full', events: ['call.ended'] });
  const c = await endedCall(w);
  await analyse(b.pool, w.ws, c.conv, registry);
  let [d] = await send(owner);
  const e164 = (await one<{ e164: string }>(b.pool, 'SELECT e164 FROM contact WHERE id = $1', [c.contact]))!.e164;
  assert.equal(JSON.parse(d.body).data.contact.phone, e164);
  assert.equal(JSON.parse(d.body).data.contact.name, 'Meera Nair');
  assert.equal(verify(wholeHook.secret, d.body, String(d.headers['x-vp-signature'])), true);

  // a builder may propose it, only an owner or compliance approves it, and the run checks the approver's role again
  const proposal = await builder.tool('webhook.create', { url: `http://127.0.0.1:${port}/x`, contactNumber: 'full' });
  assert.equal(proposal.status, 'needs_approval');
  assert.match(proposal.summary, /whole phone numbers and names/);

  const c2 = await endedCall(w);
  await b.pool.query('UPDATE contact SET erased_at = now(), name = NULL WHERE id = $1', [c2.contact]);
  await analyse(b.pool, w.ws, c2.conv, registry);
  [d] = await send(owner);
  const rec = JSON.parse(d.body).data;
  assert.deepEqual([rec.contact.phone, rec.contact.name, rec.contact.erased], [null, null, true]);
});

test('a purged transcript is not sent; the record says so and keeps timing, outcome and cost', { skip }, async () => {
  const owner = await signup(b);
  const w = await world(owner);
  await hook(owner, { events: ['call.ended'] });
  const c = await endedCall(w);
  await b.pool.query("UPDATE conversation SET transcript = '[]', transcript_purged_at = now(), transcript_purge_reason = 'erased' WHERE id = $1", [c.conv]);
  await analyse(b.pool, w.ws, c.conv, registry);
  const [d] = await send(owner);
  const rec = JSON.parse(d.body).data;
  assert.deepEqual(rec.transcript, []);
  assert.match(rec.transcriptRemoved, /erasure request/);
  assert.equal(rec.cost.totalInrMilli, 2500);
  assert.equal(rec.call.durationS, 41);
});

test('campaign.state_changed, contact.opted_out and hand_off.created are queued with the change, and a rolled-back change emits nothing', { skip }, async () => {
  const owner = await signup(b);
  const w = await world(owner);
  await hook(owner);
  await b.pool.query("UPDATE campaign SET state = 'running' WHERE id = $1", [w.campaign]);
  await b.pool.query("UPDATE campaign SET name = 'Renewals 2' WHERE id = $1", [w.campaign]);                  // not a state change
  await b.pool.query("UPDATE campaign SET state = 'paused', pause_cause = 'cap_reached:campaign' WHERE id = $1", [w.campaign]);
  const c = await endedCall(w), t = await endedCall(w, { channel: 'test' });
  await b.pool.query("INSERT INTO suppression (workspace_id, contact_id, e164, scope, reason, source) SELECT $1, id, e164, 'workspace', 'opt_out', 'in_call' FROM contact WHERE id = $2", [w.ws, c.contact]);
  await b.pool.query("INSERT INTO suppression (workspace_id, contact_id, scope, reason, source) VALUES ($1,$2,'workspace','manual_hold','manual')", [w.ws, t.contact]);   // not an opt-out
  await b.pool.query("INSERT INTO hand_off (workspace_id, conversation_id, mode, destination, status, brief) VALUES ($1,$2,'warm','member:abc','queued',$3)", [w.ws, c.conv, { reason: 'asked_for_human', summary: 'Meera wants the senior team' }]);
  await b.pool.query("INSERT INTO hand_off (workspace_id, conversation_id, mode, destination, status, brief) VALUES ($1,$2,'warm','member:abc','queued',$3)", [w.ws, t.conv, { reason: 'x' }]);   // a test call
  const cl = await b.pool.connect();
  try { await cl.query('BEGIN'); await cl.query("UPDATE campaign SET state = 'cancelled' WHERE id = $1", [w.campaign]); await cl.query('ROLLBACK'); } finally { cl.release(); }

  const sent = (await send(owner)).map(d => JSON.parse(d.body));
  assert.equal(sent.length, 4, JSON.stringify(sent.map(s => s.event)));
  const by = (ev: string) => sent.filter(s => s.event === ev);
  assert.deepEqual(by('campaign.state_changed').sort((x, y) => x.data.at.localeCompare(y.data.at)).map(s => [s.data.from, s.data.to, s.data.cause]), [['draft', 'running', null], ['running', 'paused', 'cap_reached:campaign']]);
  const opt = by('contact.opted_out')[0].data;
  assert.equal(opt.schema, 'vp.contact.opted_out.v1');
  assert.match(opt.contact.phone, /•••••/);
  const ho = by('hand_off.created')[0].data;
  assert.deepEqual([ho.handOff.destination, ho.handOff.reason, ho.callId], ['member:abc', 'asked_for_human', c.conv]);
  assert.ok(!JSON.stringify(ho).includes('senior team'), 'the hand-off summary (words about the call) is not sent');
});

test('call.export: approved like contact.export, escapes formulas, leaves out suppressed and erased people and test calls', { skip }, async () => {
  const owner = await signup(b), builder = await addMember(b, owner, 'builder');
  const w = await world(owner);
  const keep = await endedCall(w, { name: '=HYPERLINK("http://evil.test","x")' });
  const suppressed = await endedCall(w, { name: 'Suppressed Person' });
  const erased = await endedCall(w, { name: 'Erased Person' });
  const test = await endedCall(w, { channel: 'test', name: 'Test Caller' });
  await b.pool.query("INSERT INTO suppression (workspace_id, contact_id, e164, scope, reason, source) SELECT $1, id, e164, 'workspace', 'opt_out', 'in_call' FROM contact WHERE id = $2", [w.ws, suppressed.contact]);
  await b.pool.query('UPDATE contact SET erased_at = now() WHERE id = $1', [erased.contact]);
  await b.pool.query("UPDATE conversation SET analysis = $2 WHERE id = $1", [keep.conv, JSON.stringify({ status: 'done', summary: '=SUM(A1:A9) she agreed, with a "quote", and a\nnew line' })]);

  assert.match((await builder.tool('call.export', {})).reason, /cannot use call.export/, 'a builder cannot even ask');
  const proposal = await owner.tool('call.export', { campaignId: w.campaign });
  assert.equal(proposal.status, 'needs_approval');
  assert.match(proposal.summary, /Export the calls matching campaign Renewals as CSV, with phone numbers masked\. Suppressed and erased people and test calls are left out/);
  const done = (await owner.fetch('POST', `/v1/actions/${proposal.actionId}/decide`, { approve: true })).body;
  assert.equal(done.status, 'confirmed');
  assert.equal(done.result.rows, 1);
  const csv: string = done.result.csv;
  assert.match(csv.split('\r\n')[0], /^call_id,started_at,ended_at,duration_s,direction,campaign,agent,agent_version,phone,name,language,outcome,grade,reason_code,reason,flagged,hand_off,summary,cost_inr,recorded$/);
  assert.ok(csv.includes(keep.conv));
  for (const gone of [suppressed.conv, erased.conv, test.conv, 'Suppressed', 'Erased', 'Test Caller']) assert.ok(!csv.includes(gone), `${gone} must not be in the file`);
  assert.ok(!/(^|,)=/.test(csv.replace(/"[^"]*"/g, '""')), 'no cell starts with =');
  assert.ok(csv.includes(",'=.,"), 'masked, the name is only initials, and an initial that starts with = is still neutralised');
  assert.ok(csv.includes(`"'=SUM(A1:A9) she agreed, with a ""quote"", and a\nnew line"`), 'summary formula escaped, quotes doubled, newline kept inside the quoted cell');
  assert.ok(csv.includes(',2.50,'), 'cost in rupees');
  assert.match(csv, /\+91•••••\d{4}/, 'the number is masked');
  // the stored action keeps the count, not the personal data
  const stored = await one<{ result: any }>(b.pool, 'SELECT result FROM action WHERE id = $1', [proposal.actionId]);
  assert.equal(stored!.result.csv, '[delivered to the approver]');
  assert.ok(!JSON.stringify(stored!.result).includes('+91'));

  const whole = await owner.run('call.export', { campaignId: w.campaign, wholeNumbers: true });
  assert.match(whole.result.csv, /\+91\d{10}/);
  assert.ok(whole.result.csv.includes(`"'=HYPERLINK(""http://evil.test"",""x"")"`), 'a whole name that starts with = is neutralised and its quotes doubled');
  assert.equal((await owner.run('call.export', { campaignId: w.campaign, reasonCode: 'END_CRISIS' })).result.rows, 0);

  // another workspace sees none of it
  const other = await signup(b);
  assert.equal((await other.run('call.export', { campaignId: w.campaign })).result.rows, 0);
  assert.equal((await other.run('call.export', {})).result.rows, 0);
});

test('custom HTTP integration: a webhook can send events to it with the integration bearer token; the other kinds say "Stored, not used yet"', { skip }, async () => {
  const owner = await signup(b);
  const kinds = (await owner.tool('integration.kinds')).result.kinds;
  assert.equal(kinds.find((k: any) => k.id === 'custom_http').status, 'used');
  for (const k of kinds.filter((k: any) => k.id !== 'custom_http')) assert.deepEqual([k.status, k.statusLabel], ['stored_not_used', 'Stored, not used yet'], k.id);

  const stage = (kind: string, secrets: Record<string, string>) => owner.tool('integration.stage_secrets', { kind, secrets });
  const noBase = await stage('custom_http', { bearer_token: 'tok-synthetic-123' });
  assert.match((await owner.run('integration.connect', { kind: 'custom_http', name: 'CRM', stashId: noBase.result.stashId })).reason, /needs a base_url/);
  const st = await stage('custom_http', { bearer_token: 'tok-synthetic-456' });
  const integ = await owner.run('integration.connect', { kind: 'custom_http', name: 'CRM', config: { base_url: `http://127.0.0.1:${port}/results/` }, stashId: st.result.stashId });
  assert.equal(integ.status, 'confirmed', JSON.stringify(integ));
  assert.equal((await owner.tool('integration.list')).result.integrations[0].usage.startsWith('Receives call results'), true);

  const slackStash = await stage('slack', { webhook_url: 'https://hooks.example.test/x' });
  const slack = await owner.run('integration.connect', { kind: 'slack', name: 'Alerts', stashId: slackStash.result.stashId });
  assert.equal((await owner.tool('integration.list')).result.integrations.find((i: any) => i.name === 'Alerts').usage, 'Stored, not used yet');
  assert.match((await owner.run('webhook.create', { integrationId: slack.result.id })).reason, /stored but not used yet/);
  assert.match((await owner.run('webhook.create', { integrationId: integ.result.id, url: 'https://x.test/y' })).reason, /not both/);
  assert.match((await owner.run('webhook.create', { url: 'https://x.test/y', path: '/a' })).reason, /path goes with an integration/);

  const made = await owner.run('webhook.create', { integrationId: integ.result.id, path: '/calls', events: ['call.ended'] });
  assert.equal(made.status, 'confirmed', JSON.stringify(made));
  assert.equal(made.result.url, `http://127.0.0.1:${port}/calls`);
  const secret = (await owner.tool('secret.reveal', { revealId: made.result.revealId })).result.signingSecret;
  const w = await world(owner);
  await analyse(b.pool, w.ws, (await endedCall(w)).conv, registry);
  const [d] = await send(owner);
  assert.equal(d.headers.authorization, 'Bearer tok-synthetic-456');
  assert.equal(verify(secret, d.body, String(d.headers['x-vp-signature'])), true, 'still signed');

  // disconnecting the integration stops the deliveries rather than sending without the token
  assert.equal((await owner.run('integration.disconnect', { id: integ.result.id })).status, 'confirmed');
  await analyse(b.pool, w.ws, (await endedCall(w)).conv, registry);
  assert.equal((await send(owner)).length, 0);
  const pending = (await owner.tool('webhook.deliveries', { status: 'pending' })).result.deliveries[0];
  assert.match(pending.error, /no longer connected/);
});

test('webhook.test sends one marked test event and is rate limited', { skip }, async () => {
  const owner = await signup(b);
  const h = await hook(owner, { events: ['call.ended'] });                 // the test event goes whatever the endpoint listens for
  for (let i = 0; i < 10; i++) assert.equal((await owner.tool('webhook.test', { id: h.id })).status, 'confirmed');
  assert.match((await owner.tool('webhook.test', { id: h.id })).reason, /ten test events/);
  const sent = await send(owner);
  assert.equal(sent.length, 10);
  const d = sent[0];
  assert.equal(JSON.parse(d.body).event, 'webhook.test');
  assert.equal(JSON.parse(d.body).data.test, true);
  assert.equal(verify(h.secret, d.body, String(d.headers['x-vp-signature'])), true);
  const other = await signup(b);
  assert.match((await other.tool('webhook.test', { id: h.id })).reason, /no such webhook/);
});
