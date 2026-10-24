// Carrier truth and the inbound number (campaigns/carrier.ts, shared/carrier.ts): Plivo's hang-up causes in our words
// (whether the phone rang, the call page reason, the retry class), a trial-account refusal as its own reason that is
// never retried and never counts against the person, the carrier's CDR beside the call, the staff-only tool that points
// a carrier number at the runtime's inbound path through Plivo's API (a fake Plivo on this machine), the signed hang-up
// hook that records the carrier's account of an inbound call, and the sweep that ends a call the runtime lost.
// Skipped without DATABASE_URL (the mapping table runs always). Synthetic numbers, ids and tokens only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomInt } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, many, one, tx } from '../server/db.ts';
import { reserve } from '../server/ledger.ts';
import { FakeRuntime, setRuntime, sign } from '../server/runtime-client.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { module as campaigns } from '../server/modules/campaigns/index.ts';
import { afterCall, retryClass } from '../server/modules/calls/followups.ts';
import { fetchCdrs, HANGUP_PATH, settleCarrierEnded } from '../server/modules/campaigns/carrier.ts';
import { FakeTelephony, PlivoTelephony, setTelephony } from '../server/modules/campaigns/telephony.ts';
import { carrierOutcome } from '../shared/carrier.ts';
import type { RunManifest, RuntimeEvent } from '../shared/runtime-protocol.ts';
import { plivoFetch } from './fixtures/plivo-sign.ts';

test('Plivo hang-up causes in our words: rang or not, the call page reason, the retry class', () => {
  const row = (f: Parameters<typeof carrierOutcome>[0], o?: { trialAccount?: boolean }) => { const r = carrierOutcome(f, o); return [r.reason, r.rang, r.reasonCode, r.retryClass]; };
  assert.deepEqual(row({ hangupCauseCode: 4000, hangupCauseName: 'Normal Hangup', billDurationS: 60, durationS: 42 }), ['answered', true, null, null]);
  assert.deepEqual(row({ hangupCauseCode: 3010 }), ['busy', true, 'DIAL_BUSY', 'busy']);
  assert.deepEqual(row({ hangupCauseCode: 6010 }), ['no_answer', true, 'DIAL_NO_ANSWER', 'no_answer']);
  assert.deepEqual(row({ hangupCauseCode: '3020' }), ['rejected', true, 'DIAL_REJECTED', 'busy']);
  assert.deepEqual(row({ hangupCauseCode: 3050 }), ['invalid_number', false, 'DIAL_INVALID_NUMBER', 'invalid']);
  assert.deepEqual(row({ hangupCauseCode: 2010 }), ['switched_off', false, 'DIAL_SWITCHED_OFF', 'switched_off']);
  assert.deepEqual(row({ hangupCauseCode: 5000 }), ['network', false, 'DIAL_NETWORK', 'provider_error']);
  assert.deepEqual(row({ hangupCauseCode: 3030 }), ['carrier_rejected', false, 'DIAL_CARRIER_REJECTED', 'carrier_refused']);
  assert.deepEqual(row({ hangupCauseCode: 9100 }), ['machine', true, 'CONN_VOICEMAIL', 'voicemail']);
  assert.deepEqual(row({ hangupCauseCode: 7011 }), ['our_error', false, 'DIAL_FAILED', 'provider_error']);
  assert.deepEqual(row({ hangupCauseName: 'Busy Line' }), ['busy', true, 'DIAL_BUSY', 'busy'], 'the name when no code');
  assert.deepEqual(row({ dialError: 'Plivo 400: this is a trial account; calls can be made only to verified sandbox numbers' }),
    ['trial_restricted', false, 'DIAL_TRIAL_RESTRICTED', 'carrier_refused']);
  assert.deepEqual(row({ hangupCauseCode: 3040, hangupCauseName: 'Forbidden' }, { trialAccount: true }), ['trial_restricted', false, 'DIAL_TRIAL_RESTRICTED', 'carrier_refused']);
  assert.deepEqual(row({ hangupCauseCode: 4000, answeredBy: 'machine', billDurationS: 60 }), ['machine', true, 'CONN_VOICEMAIL', 'voicemail']);
  assert.equal(retryClass('failed', 'DIAL_TRIAL_RESTRICTED'), 'carrier_refused');
  assert.equal(retryClass('failed', 'DIAL_NETWORK'), 'provider_error');
});

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
const SECRET = 'carrier-test-runtime-secret-'.padEnd(40, 'q');
const TOKEN = 'synthetic-plivo-token-carrier';
const KEYS = ['VP_RUNTIME_SECRET', 'VP_PUBLIC_URL', 'VP_RUNTIME_PUBLIC_URL', 'PLIVO_AUTH_TOKEN', 'VP_CARRIER_TRIAL', 'VP_TELEPHONY_ALLOWED_TO'] as const;
const saved: Record<string, string | undefined> = {};
let pool: pg.Pool, registry: Registry, server: Server, local = '', rt: FakeRuntime;
const synth = () => `+91900000${String(randomInt(0, 10_000)).padStart(4, '0')}`;
const manifest = (): RunManifest => ({ combinationId: 'v2|e+b+v', stackId: 'v2-flashlite', agentVersionHash: 'h1', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 't' });

before(async () => {
  for (const k of KEYS) saved[k] = process.env[k];
  if (skip) return;
  process.env.VP_RUNTIME_SECRET = SECRET;
  pool = createPool(URL_);
  const app = buildApp(pool, [calls, campaigns]);
  registry = app.registry; server = app.server;
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.VP_PUBLIC_URL = local; process.env.PLIVO_AUTH_TOKEN = TOKEN;
  rt = new FakeRuntime(); setRuntime(rt);
});
after(async () => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  setRuntime(null); setTelephony(null);
  await new Promise(r => server?.close(r)); await pool?.end();
});

async function workspace() {
  return tx(pool, async c => {
    const ws = (await one<{ id: string }>(c, "INSERT INTO workspace (name) VALUES ('carrier ws') RETURNING id"))!.id;
    const owner = (await one<{ id: string }>(c, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
    await c.query("INSERT INTO wallet (workspace_id, balance_inr_milli, state) VALUES ($1, 10000000, 'ok')", [ws]);
    const agent = (await one<{ id: string }>(c, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Asha') RETURNING id", [ws]))!.id;
    const version = (await one<{ id: string }>(c, 'INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,$2,$3) RETURNING id',
      [agent, 'h1', { agent: { schema: 1, agentId: agent, version: 1, versionHash: 'h1', voice: { stackId: 'v2-flashlite' } }, brief: { text: 'b', hash: 'b', bytes: 1 } }]))!.id;
    const campaign = (await one<{ id: string }>(c, "INSERT INTO campaign (workspace_id, name, call_category, state) VALUES ($1,'c','service','running') RETURNING id", [ws]))!.id;
    return { ws, owner, version, campaign };
  });
}

async function outboundCall(w: Awaited<ReturnType<typeof workspace>>) {
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,'P') RETURNING id", [w.ws, synth()]))!.id;
  const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, kind, status, dialed_at) VALUES ($1,$2,$3,'campaign','dialing', now()) RETURNING id", [w.ws, w.campaign, contact]))!.id;
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel) VALUES ($1,$2,$3,$4,'phone') RETURNING id", [w.ws, attempt, contact, w.version]))!.id;
  const r = await tx(pool, c => reserve(c, { workspaceId: w.ws, inrMilli: 30_000, attemptId: attempt, campaignId: w.campaign }));
  assert.ok(r.ok);
  return { attempt, conv };
}
async function ended(conv: string, e: Partial<Extract<RuntimeEvent, { type: 'call.ended' }>>) {
  const body = JSON.stringify({ protocol: 1, conversationId: conv, events: [{ seq: 1, type: 'call.ended', at: new Date().toISOString(), endReason: 'failed', durationS: 0, transcript: [], manifest: manifest(), ...e }] });
  const r = await fetch(local + '/hooks/runtime', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-signature': sign(SECRET, body) }, body });
  assert.equal(r.status, 200, await r.text());
}
const as = (ws: string, actor: Actor) => ({ workspaceId: ws, actor });

test('a trial-account refusal: its own reason, never counts against the person, never retried; a busy line rings and retries', { skip }, async () => {
  const w = await workspace();
  const t = await outboundCall(w);
  await ended(t.conv, { endReason: 'failed', carrier: { provider: 'plivo', dialError: 'Plivo 400: trial account may call only verified sandbox numbers' } });
  const cv = await one<{ reason_code: string; settlement: { action: string } }>(pool, 'SELECT reason_code, settlement FROM conversation WHERE id = $1', [t.conv]);
  assert.equal(cv!.reason_code, 'DIAL_TRIAL_RESTRICTED');
  assert.equal(cv!.settlement.action, 'released', 'nothing was spent');
  const a = await one<{ counts_to_budget: boolean; carrier_code: string }>(pool, 'SELECT counts_to_budget, carrier_code FROM attempt WHERE id = $1', [t.attempt]);
  assert.deepEqual([a!.counts_to_budget, a!.carrier_code], [false, 'trial_restricted']);
  const fu = await afterCall(pool, registry, w.ws, t.conv);
  assert.equal(fu['attempt.retry_per_ladder'], 'done');
  assert.equal((await one<{ outcome_class: string }>(pool, 'SELECT outcome_class FROM attempt WHERE id = $1', [t.attempt]))!.outcome_class, 'carrier_refused');
  assert.equal((await many(pool, 'SELECT 1 FROM attempt WHERE retry_of = $1', [t.attempt])).length, 0, 'not retried');
  const page = await registry.execute<{ reason: { label: string }; carrier: { words: string; phoneRang: boolean } }>(pool, 'call.get', { conversationId: t.conv }, as(w.ws, { type: 'member', id: w.owner, role: 'owner' }));
  assert.ok(page.status === 'confirmed');
  assert.match(page.result.reason.label, /trial account/);
  assert.equal(page.result.carrier.phoneRang, false);

  const b = await outboundCall(w);
  await ended(b.conv, { endReason: 'busy', carrier: { provider: 'plivo', callUuid: 'cu-busy-1', hangupCauseCode: 3010, hangupCauseName: 'Busy Line', durationS: 0, billDurationS: 0 } });
  assert.equal((await one<{ reason_code: string }>(pool, 'SELECT reason_code FROM conversation WHERE id = $1', [b.conv]))!.reason_code, 'DIAL_BUSY');
  assert.equal((await one<{ counts_to_budget: boolean }>(pool, 'SELECT counts_to_budget FROM attempt WHERE id = $1', [b.attempt]))!.counts_to_budget, true, 'a busy phone did ring the person');
  await afterCall(pool, registry, w.ws, b.conv);
  assert.equal((await many(pool, 'SELECT 1 FROM attempt WHERE retry_of = $1', [b.attempt])).length, 1, 'busy is retried by the ladder');
});

test('the carrier CDR lands beside the call: billed seconds and the INR amount on the call page', { skip }, async () => {
  const fake = new FakeTelephony(); setTelephony(fake);
  const w = await workspace();
  const c = await outboundCall(w);
  await ended(c.conv, { endReason: 'completed', durationS: 42, carrier: { provider: 'plivo', callUuid: 'cu-cdr-1', hangupCauseCode: 4000, hangupCauseName: 'Normal Hangup', durationS: 43, billDurationS: 60 } });
  await pool.query("UPDATE conversation SET ended_at = now() - interval '1 minute' WHERE id = $1", [c.conv]);
  fake.cdrs.set('cu-cdr-1', { callUuid: 'cu-cdr-1', billDurationS: 60, durationS: 43, totalInrMilli: 380, hangupCauseName: 'Normal Hangup', hangupCauseCode: 4000,
    hangupSource: 'Callee', answerTime: null, initiationTime: null, endTime: null, direction: 'outbound' });
  assert.equal(await fetchCdrs(pool, new Date(), w.ws), 1);
  assert.equal(await fetchCdrs(pool, new Date(), w.ws), 0, 'fetched once');
  const page = await registry.execute<{ carrier: Record<string, unknown> }>(pool, 'call.get', { conversationId: c.conv }, as(w.ws, { type: 'member', id: w.owner, role: 'owner' }));
  assert.ok(page.status === 'confirmed');
  assert.deepEqual([page.result.carrier.billedS, page.result.carrier.carrierCostInrMilli, page.result.carrier.hangupSource, page.result.carrier.from], [60, 380, 'Callee', 'carrier record']);
  setTelephony(null);
});

test('staff attach a carrier number: Plivo application and number pointed at the runtime\'s signed inbound path; no workspace role can', { skip }, async () => {
  const seen: { method: string; url: string; body: Record<string, unknown> }[] = [];
  let apps: Record<string, unknown>[] = [];
  const fake = createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => {
      const body = b ? JSON.parse(b) : {};
      seen.push({ method: req.method!, url: req.url!, body });
      const json = (s: number, j: unknown) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (req.method === 'GET' && req.url!.includes('/Application/')) return json(200, { api_id: 'a', meta: {}, objects: apps });
      if (req.method === 'POST' && /\/Application\/$/.test(req.url!)) { apps = [{ app_id: 'app-1', app_name: body.app_name, answer_url: body.answer_url, hangup_url: body.hangup_url }]; return json(201, { message: 'created', app_id: 'app-1', api_id: 'a' }); }
      if (req.method === 'POST' && /\/Number\//.test(req.url!)) return json(202, { message: 'changed', api_id: 'a' });
      json(404, { error: 'not found' });
    });
  });
  await new Promise<void>(r => fake.listen(0, '127.0.0.1', r));
  try {
    setTelephony(new PlivoTelephony({ apiBase: `http://127.0.0.1:${(fake.address() as AddressInfo).port}`, authId: 'MAFAKEAUTHID', authToken: TOKEN, publicBase: local }));
    process.env.VP_RUNTIME_PUBLIC_URL = 'https://staging.example.test:8443/rt';
    const w = await workspace();
    const num = synth();
    const args = { phone: num, series: 'trial', evidence: 'number bought on the carrier account, ticket SYN-2' };
    for (const actor of [{ type: 'member', id: w.owner, role: 'owner' }, { type: 'system', id: 's' }] as Actor[])
      assert.notEqual((await registry.execute(pool, 'number.attach_carrier', args, as(w.ws, actor))).status, 'confirmed', actor.type);
    assert.equal(seen.length, 0, 'a refused caller never reaches the carrier');
    const staff: Actor = { type: 'vp_success', id: 'staff-synthetic-2' };
    const r = await registry.execute<{ numberId: string }>(pool, 'number.attach_carrier', args, as(w.ws, staff));
    assert.ok(r.status === 'confirmed', JSON.stringify(r));
    const hook = createHmac('sha256', SECRET).update('inbound:plivo').digest('hex').slice(0, 32);
    const create = seen.find(s => s.method === 'POST' && s.url.endsWith('/Application/'))!;
    assert.deepEqual(create.body, { app_name: 'vyakti-inbound', answer_url: `https://staging.example.test:8443/rt/v1/media/sip/inbound/plivo/${hook}`, answer_method: 'POST',
      hangup_url: local + HANGUP_PATH, hangup_method: 'POST' });
    const link = seen.find(s => s.url.includes('/Number/'))!;
    assert.deepEqual([link.url, link.body], [`/v1/Account/MAFAKEAUTHID/Number/${num.slice(1)}/`, { app_id: 'app-1' }]);
    const row = await one<{ series: string; carrier: string; status: string; inbound_app_ref: string }>(pool, 'SELECT series, carrier, status, inbound_app_ref FROM phone_number WHERE id = $1', [r.status === 'confirmed' ? r.result.numberId : '']);
    assert.deepEqual(row, { series: 'trial', carrier: 'plivo', status: 'active', inbound_app_ref: 'app-1' });
    // Again: the application is already right, so only the number link is sent.
    const n0 = seen.length;
    assert.equal((await registry.execute(pool, 'number.attach_carrier', args, as(w.ws, staff))).status, 'confirmed');
    assert.deepEqual(seen.slice(n0).map(s => `${s.method} ${s.url.split('?')[0]}`), ['GET /v1/Account/MAFAKEAUTHID/Application/', `POST /v1/Account/MAFAKEAUTHID/Number/${num.slice(1)}/`]);
    // Another workspace cannot take it.
    const w2 = await workspace();
    assert.notEqual((await registry.execute(pool, 'number.attach_carrier', args, as(w2.ws, staff))).status, 'confirmed');
    const audit = await many<{ actor_type: string; payload: unknown }>(pool, "SELECT actor_type, payload FROM audit_event WHERE workspace_id = $1 AND action = 'number.attached_from_carrier'", [w.ws]);
    assert.equal(audit.length, 2);
    assert.ok(audit.every(a => a.actor_type === 'vp_success' && !JSON.stringify(a.payload).includes(num.slice(3))));
  } finally { setTelephony(null); delete process.env.VP_RUNTIME_PUBLIC_URL; await new Promise(r => fake.close(r)); }
});

test('the signed hang-up hook records an inbound call\'s carrier account; a call the runtime lost is asked to end, then settled', { skip }, async () => {
  const w = await workspace();
  const uuid = `cu-in-${randomInt(0, 1e9)}`;
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, agent_version_id, channel, direction, status, carrier_call_id) VALUES ($1,$2,'phone','inbound','live',$3) RETURNING id", [w.ws, w.version, uuid]))!.id;
  const hold = await tx(pool, async c => { const r = await reserve(c, { workspaceId: w.ws, inrMilli: 20_000 }); assert.ok(r.ok); await c.query('UPDATE reservation SET conversation_id = $2 WHERE id = $1', [r.ok ? r.reservationId : '', conv]); return r.ok ? r.reservationId : ''; });
  const form = { CallUUID: uuid, From: synth(), To: synth(), Direction: 'inbound', CallStatus: 'completed', Duration: '75', BillDuration: '120', HangupCauseName: 'Normal Hangup', HangupCauseCode: '4000', HangupSource: 'Caller' };
  assert.equal((await fetch(local + HANGUP_PATH, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() })).status, 401, 'unsigned');
  const r = await plivoFetch(TOKEN, local + HANGUP_PATH, local + HANGUP_PATH, form);
  assert.equal(r.status, 200, await r.text());
  const stored = await one<{ carrier: any; hung: Date }>(pool, 'SELECT carrier, carrier_hangup_at AS hung FROM conversation WHERE id = $1', [conv]);
  assert.deepEqual([stored!.carrier.facts.billDurationS, stored!.carrier.facts.hangupSource, stored!.carrier.outcome.reason], [120, 'Caller', 'answered']);

  const t0 = stored!.hung.getTime();
  assert.deepEqual(await settleCarrierEnded(pool, new Date(t0 + 30_000), w.ws), { asked: 0, settled: 0 }, 'the runtime gets its grace');
  const before = rt.controls.length;
  assert.deepEqual(await settleCarrierEnded(pool, new Date(t0 + 95_000), w.ws), { asked: 1, settled: 0 });
  assert.deepEqual(rt.controls.slice(before).map(c => [c.id, c.action]), [[conv, 'end']], 'the runtime is asked to end it');
  assert.deepEqual(await settleCarrierEnded(pool, new Date(t0 + 120_000), w.ws), { asked: 0, settled: 0 }, 'asked once');
  assert.deepEqual(await settleCarrierEnded(pool, new Date(t0 + 11 * 60_000), w.ws), { asked: 0, settled: 1 });
  const done = await one<{ status: string; end_reason: string; duration_s: number }>(pool, 'SELECT status, end_reason, duration_s FROM conversation WHERE id = $1', [conv]);
  assert.deepEqual(done, { status: 'ended', end_reason: 'error', duration_s: 75 });
  assert.equal((await one<{ status: string }>(pool, 'SELECT status FROM reservation WHERE id = $1', [hold]))!.status, 'released', 'no hold stays held');
});
