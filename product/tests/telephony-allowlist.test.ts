// The telephony allowlist (server/modules/campaigns/allowlist.ts) on every path that can send a number to the carrier:
// campaign, api, single, test, retry and callback attempts through the dial gate and worker, an agent's hand-off
// (transfer) number, a phone-verification announcement, and the Plivo adapter's own last check against a fake Plivo on
// this machine. An unlisted number never reaches the runtime (the one dialler) or the carrier. Skipped without
// DATABASE_URL (the unit part runs always). Synthetic 90000000xx numbers only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomInt } from 'node:crypto';
import type pg from 'pg';
import { createPool, many, one, tx } from '../server/db.ts';
import { FakeRuntime, setRuntime } from '../server/runtime-client.ts';
import { Registry, type Actor } from '../server/tools.ts';
import { module as campaigns } from '../server/modules/campaigns/index.ts';
import { allowMode, mayDial, NotAllowlisted } from '../server/modules/campaigns/allowlist.ts';
import { FakeTelephony, PlivoTelephony, setTelephony } from '../server/modules/campaigns/telephony.ts';
import { tick } from '../server/modules/campaigns/worker.ts';
import type { AgentConfig } from '../shared/agent-config.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry, rt: FakeRuntime;
const NOON = new Date('2026-10-27T12:00:00+05:30');          // a Tuesday, inside every window
const synth = () => `+91900000${String(randomInt(0, 10_000)).padStart(4, '0')}`;
const ENV_KEYS = ['VP_TELEPHONY_ALLOWED_TO', 'VP_TELEPHONY_ALLOWLIST', 'VP_TELEPHONY_LIVE', 'VP_RUNTIME_URL'] as const;
const saved: Record<string, string | undefined> = {};
function env(o: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) { if (k in o) process.env[k] = o[k]; else delete process.env[k]; }
}

before(async () => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  if (skip) return;
  pool = createPool(URL_);
  registry = new Registry();
  campaigns.register(registry);
  rt = new FakeRuntime();
  setRuntime(rt);
  setTelephony(new FakeTelephony());
});
after(async () => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  await pool?.end(); setRuntime(null); setTelephony(null);
});

test('allowMode: a list normalises its entries; no list closes any server that can reach a carrier; only "off" opens it', () => {
  assert.deepEqual(allowMode({}), { mode: 'open' }, 'a dev server with fakes only');
  const l = allowMode({ VP_TELEPHONY_ALLOWED_TO: ' 9000000011, +91 90000 00012 ,bogus' });
  assert.equal(l.mode, 'list');
  assert.deepEqual(l.mode === 'list' && [...l.numbers], ['+919000000011', '+919000000012']);
  assert.deepEqual(l.mode === 'list' && l.invalid, ['entry 1: NOT_A_NUMBER'], 'a bad entry is reported, never echoed');
  assert.equal(allowMode({ VP_TELEPHONY_LIVE: '1' }).mode, 'closed');
  assert.equal(allowMode({ VP_RUNTIME_URL: 'http://127.0.0.1:8090' }).mode, 'closed', 'a real runtime is the dialler: closed too');
  assert.equal(allowMode({ VP_RUNTIME_URL: 'http://127.0.0.1:8090', VP_TELEPHONY_ALLOWLIST: 'off' }).mode, 'open');
  assert.deepEqual(mayDial('09000000011', { VP_TELEPHONY_ALLOWED_TO: '+919000000011' }), { ok: true }, 'any Indian shape of a listed number');
  assert.equal(mayDial('+919000000013', { VP_TELEPHONY_ALLOWED_TO: '+919000000011' }).ok, false);
  assert.equal(mayDial('+919000000011', { VP_TELEPHONY_LIVE: '1' }).ok, false);
});

function agentConfig(o: Partial<AgentConfig> = {}): AgentConfig {
  return {
    schema: 1, agentId: 'a', version: 1, versionHash: 'h', brand: { name: 'Synthetic Co', spokenName: 'Synthetic', verifiedDomains: [] },
    job: 'service_follow_up', category: 'service', sectorPacks: ['base'], languages: { primary: 'hinglish', allowed: ['hinglish'], mirrorCaller: true },
    persona: { name: 'Riya', gender: 'female', register: 'warm_peer', energy: 3, humour: 1, honorific: 'aap', notes: [] },
    goals: [], neverSay: [], objections: [], tools: [], facts: [],
    opening: { disclosureClause: 'shape: one light AI clause', usefulFirst: 'shape: the due date' },
    handOff: { when: ['asks_for_human'], target: { kind: 'callback' }, warmSummary: true },
    memory: { read: false, write: false, briefMaxBytes: 1200 }, limits: { maxDurationS: 300, maxSilenceS: 10, maxTurns: 40 },
    voice: { stackId: 'v2-flashlite' }, recording: { enabled: false, announce: false }, ...o,
  };
}

interface World { ws: string; owner: string; versionId: string; contact: string; e164: string; campaign: string }
async function world(cfg = agentConfig()): Promise<World> {
  return tx(pool, async c => {
    const ws = (await one<{ id: string }>(c, "INSERT INTO workspace (name) VALUES ('allowlist ws') RETURNING id"))!.id;
    const owner = (await one<{ id: string }>(c, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
    await c.query("INSERT INTO brand (workspace_id, legal_name, dlt_entity_id) VALUES ($1, 'Synthetic Co Pvt Ltd', 'DLT-SYN-1')", [ws]);
    await c.query("INSERT INTO wallet (workspace_id, balance_inr_milli, state) VALUES ($1, 10000000, 'ok')", [ws]);
    const agentId = (await one<{ id: string }>(c, "INSERT INTO agent (workspace_id, name, status) VALUES ($1, 'Riya', 'live') RETURNING id", [ws]))!.id;
    const versionId = (await one<{ id: string }>(c, 'INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1, 1, $2, $3) RETURNING id',
      [agentId, 'hash-' + Math.random(), JSON.stringify({ agent: cfg, brief: { text: 'compiled brief', hash: 'b1', bytes: 14 } })]))!.id;
    await c.query(`INSERT INTO phone_number (workspace_id, e164, series, carrier, kyc_status, a2p_status) VALUES ($1, $2, 'ten_digit', 'plivo', 'verified', 'declared')`, [ws, synth()]);
    await c.query(`INSERT INTO phone_number (workspace_id, e164, series, carrier, kyc_status, a2p_status) VALUES ($1, $2, 'trial', 'plivo', 'none', 'undeclared')`, [ws, synth()]);
    const e164 = synth();
    const contact = (await one<{ id: string }>(c, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,'Sunita') RETURNING id", [ws, e164]))!.id;
    await c.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis) VALUES ($1,$2,'service','contract')", [ws, contact]);
    await c.query('INSERT INTO verified_test_phone (workspace_id, member_id, e164, verified_at) VALUES ($1,$2,$3, now())', [ws, owner, e164]);
    const campaign = (await one<{ id: string }>(c, `INSERT INTO campaign (workspace_id, name, call_category, policy, state, agent_version_id)
      VALUES ($1, 'c', 'service', '{}', 'running', $2) RETURNING id`, [ws, versionId]))!.id;
    return { ws, owner, versionId, contact, e164, campaign };
  });
}

const KINDS = ['campaign', 'api', 'single', 'test', 'retry', 'callback'] as const;
async function attempt(w: World, kind: (typeof KINDS)[number]): Promise<string> {
  const test = kind === 'test';
  return (await one<{ id: string }>(pool, `INSERT INTO attempt (workspace_id, campaign_id, contact_id, to_e164, kind, agent_version_id, call_category, scheduled_for)
    VALUES ($1,$2,$3,$4,$5,$6,'service','2026-01-01') RETURNING id`,
    [w.ws, ['campaign', 'retry', 'callback'].includes(kind) ? w.campaign : null, test ? null : w.contact, test ? w.e164 : null, kind, w.versionId]))!.id;
}
const ticketsFor = (ws: string) => rt.tickets.filter(t => t.workspaceId === ws);

test('every attempt kind: an unlisted number is refused at the gate and never handed to the runtime; a listed one is dialled', { skip }, async () => {
  for (const kind of KINDS) {
    const w = await world();
    env({ VP_TELEPHONY_ALLOWED_TO: '+919000019999' });   // a list without this person (outside the synth range)
    const refused = await attempt(w, kind);
    const r1 = await tick({ pool, registry, runtime: rt, now: () => NOON, workspaceId: w.ws });
    assert.equal(r1.dispatched, 0, kind);
    const a = await one<{ status: string; blocked_by: string; precheck: { detail: string } }>(pool, 'SELECT status, blocked_by, precheck FROM attempt WHERE id = $1', [refused]);
    assert.deepEqual([a!.status, a!.blocked_by], ['blocked', 'destination_blocked'], `${kind}: ${JSON.stringify(a)}`);
    assert.match(a!.precheck.detail, /allowlist/);
    assert.equal(ticketsFor(w.ws).length, 0, `${kind}: nothing reached the runtime`);
    assert.equal((await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM reservation WHERE workspace_id = $1 AND status = 'held'", [w.ws]))!.n, 0, 'no money held');

    env({ VP_TELEPHONY_ALLOWED_TO: `+919000019999, ${w.e164.replace('+91', '0')}` });
    const ok = await attempt(w, kind);
    const r2 = await tick({ pool, registry, runtime: rt, now: () => NOON, workspaceId: w.ws });
    assert.equal(r2.dispatched, 1, `${kind}: ${JSON.stringify(await one(pool, 'SELECT status, blocked_by, precheck FROM attempt WHERE id = $1', [ok]))}`);
    const t = ticketsFor(w.ws);
    assert.equal(t.length, 1);
    assert.deepEqual(t[0].transport.kind === 'sip' && [t[0].transport.to, t[0].transport.trunk], [w.e164, 'plivo'], 'the runtime dials exactly the listed number');
  }
});

test('a server that can reach a carrier and has no list refuses every number; "off" is the only way open', { skip }, async () => {
  const w = await world();
  env({ VP_RUNTIME_URL: 'http://127.0.0.1:1' });
  const id = await attempt(w, 'single');
  await tick({ pool, registry, runtime: rt, now: () => NOON, workspaceId: w.ws });
  assert.equal((await one<{ blocked_by: string }>(pool, 'SELECT blocked_by FROM attempt WHERE id = $1', [id]))!.blocked_by, 'destination_blocked');
  env({ VP_RUNTIME_URL: 'http://127.0.0.1:1', VP_TELEPHONY_ALLOWLIST: 'off' });
  await attempt(w, 'single');
  const r = await tick({ pool, registry, runtime: rt, now: () => NOON, workspaceId: w.ws });
  assert.equal(r.dispatched, 1);
  env({});
});

test('a transfer target off the list stops the call before it rings, on every kind', { skip }, async () => {
  const bridge = synth();
  for (const kind of KINDS) {
    const w = await world(agentConfig({ handOff: { when: ['asks_for_human'], target: { kind: 'phone', value: bridge }, warmSummary: true } }));
    env({ VP_TELEPHONY_ALLOWED_TO: w.e164 });                     // the person is listed; the hand-off number is not
    const id = await attempt(w, kind);
    await tick({ pool, registry, runtime: rt, now: () => NOON, workspaceId: w.ws });
    const a = await one<{ blocked_by: string; precheck: { detail: string; explain: { message: string } } }>(pool, 'SELECT blocked_by, precheck FROM attempt WHERE id = $1', [id]);
    assert.equal(a!.blocked_by, 'destination_blocked', kind);
    assert.match(a!.precheck.detail, /hand-off number/);
    assert.match(a!.precheck.explain.message, /hands calls to a number/);
    assert.equal(ticketsFor(w.ws).length, 0, `${kind}: the transfer number never reached the runtime`);
    env({ VP_TELEPHONY_ALLOWED_TO: `${w.e164},${bridge}` });
    await attempt(w, kind);
    assert.equal((await tick({ pool, registry, runtime: rt, now: () => NOON, workspaceId: w.ws })).dispatched, 1, kind);
  }
  env({});
});

test('a verification call to an unlisted phone is refused before the carrier and before it counts', { skip }, async () => {
  const { setVerifyClock } = await import('../server/modules/campaigns/verify.ts');
  const fake = new FakeTelephony();
  setTelephony(fake);
  const noon = Date.UTC(2031, 0, 1) + randomInt(0, 20_000) * 864e5 + 6.5 * 3600_000;   // 12:00 IST, one day for the whole test
  setVerifyClock(() => new Date(noon));
  try {
    const w = await world();
    const listed = synth(), other = synth();
    env({ VP_TELEPHONY_ALLOWED_TO: listed });
    const as = { workspaceId: w.ws, actor: { type: 'member', id: w.owner, role: 'owner' } as Actor };
    const no = await registry.execute(pool, 'member.phone.verify_start', { phone: other }, as);
    assert.equal(no.status, 'not_executed');
    assert.match(no.status === 'not_executed' ? no.reason : '', /test list/);
    assert.equal(fake.systemCalls.length, 0);
    assert.equal((await many(pool, 'SELECT 1 FROM phone_verification WHERE workspace_id = $1', [w.ws])).length, 0, 'it does not use up a try');
    const yes = await registry.execute<{ ringing: boolean }>(pool, 'member.phone.verify_start', { phone: listed }, as);
    assert.ok(yes.status === 'confirmed' && yes.result.ringing, JSON.stringify(yes));
    assert.deepEqual(fake.systemCalls.map(c => c.to), [listed]);
  } finally { setVerifyClock(null); setTelephony(new FakeTelephony()); env({}); }
});

test('the Plivo adapter itself refuses an unlisted number: the fake Plivo never sees the request', async () => {
  const seen: string[] = [];
  const fake: Server = createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => { seen.push(`${req.method} ${req.url} ${b}`); res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'call fired', request_uuid: 'req-1', api_id: 'api-1' })); });
  });
  await new Promise<void>(r => fake.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
    const p = new PlivoTelephony({ apiBase: base, authId: 'MAFAKEAUTHID', authToken: 'fake-token', publicBase: 'https://vyakti.example.test' });
    env({ VP_TELEPHONY_ALLOWED_TO: '+919000000011' });
    await assert.rejects(p.systemCall({ to: '+919000000012', from: '+919000000001', lines: ['x'] }), NotAllowlisted);
    assert.equal(seen.length, 0, 'nothing left this process');
    const r = await p.systemCall({ to: '+919000000011', from: '+919000000001', lines: ['x'] });
    assert.equal(r.ref, 'req-1');
    assert.equal(seen.length, 1);
    assert.match(seen[0], /^POST \/v1\/Account\/MAFAKEAUTHID\/Call\/ /);
    assert.equal(JSON.parse(seen[0].split(' ').slice(2).join(' ')).to, '919000000011');
  } finally { env({}); await new Promise(r => fake.close(r)); }
});
