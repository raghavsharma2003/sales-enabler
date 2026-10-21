// Campaigns against a real Postgres: every gate check refuses with its code, T3 at the form, the API and the gate,
// cross-midnight rules, one claim per attempt under concurrency, reservations released on refusal, tenancy, and a
// launch approval bound to the campaign version. Skipped when DATABASE_URL is unset. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createSession } from '../server/auth.ts';
import { createPool, one, tx } from '../server/db.ts';
import { FakeRuntime, setRuntime, type Runtime } from '../server/runtime-client.ts';
import { Registry, tool, type Actor } from '../server/tools.ts';
import { module as campaigns } from '../server/modules/campaigns/index.ts';
import { runGate, tombstoneHashes, type AttemptRow, type GateVerdict, type PredialFn } from '../server/modules/campaigns/gate.ts';
import { FakeTelephony, setTelephony } from '../server/modules/campaigns/telephony.ts';
import { claimNext, tick, type WorkerDeps } from '../server/modules/campaigns/worker.ts';
import { num, obj, str, uuid } from '../shared/validate.ts';
import type { AgentConfig, CallCategory } from '../shared/agent-config.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let registry: Registry;
let rt: FakeRuntime;

const IST = (d: string, t: string) => new Date(`${d}T${t}:00+05:30`);
const TUE = '2026-10-27';                 // a Tuesday, before the A2P due date
const TUE_AFTER_A2P = '2026-11-24';       // a Tuesday after it
const NOON = IST(TUE, '12:00');
let phoneSeq = 20;
const phone = () => `+91900000${String(phoneSeq++).padStart(4, '0')}`;   // synthetic 90000000xx-range numbers

before(async () => {
  if (skip) return;
  pool = createPool(URL_);
  registry = new Registry();
  campaigns.register(registry);
  rt = new FakeRuntime();
  setRuntime(rt);
  setTelephony(new FakeTelephony());
});
after(async () => { await pool?.end(); setRuntime(null); setTelephony(null); });

function agentConfig(category: CallCategory, o: Partial<AgentConfig> = {}): AgentConfig {
  return {
    schema: 1, agentId: 'a', version: 1, versionHash: 'h', brand: { name: 'Synthetic Co', spokenName: 'Synthetic', verifiedDomains: [] },
    job: 'service_follow_up', category, sectorPacks: ['base'], languages: { primary: 'hinglish', allowed: ['hinglish'], mirrorCaller: true },
    persona: { name: 'Riya', gender: 'female', register: 'warm_peer', energy: 3, humour: 1, honorific: 'aap', notes: [] },
    goals: [], neverSay: [], objections: [], tools: [],
    facts: [
      { key: 'due_date', value: '', purpose: 'service', source: 'contact.attribute', perContact: true },
      { key: 'upgrade', value: '', purpose: 'offer', source: 'contact.attribute', perContact: true },
    ],
    opening: { disclosureClause: 'shape: one light AI clause', usefulFirst: 'shape: the due date' },
    handOff: { when: ['asks_for_human'], target: { kind: 'callback' }, warmSummary: true },
    memory: { read: true, write: false, briefMaxBytes: 1200 }, limits: { maxDurationS: 300, maxSilenceS: 10, maxTurns: 40 },
    voice: { stackId: 'v2-live' }, recording: { enabled: false, announce: false }, ...o,
  };
}

interface World { ws: string; owner: string; compliance: string; viewer: string; versionId: string; agentId: string; numberId: string; contact: string; e164: string }

async function world(o: { category?: CallCategory; wallet?: number; series?: string; packs?: string[]; noBrand?: boolean } = {}): Promise<World> {
  const category = o.category ?? 'service';
  return tx(pool, async c => {
    const ws = (await one<{ id: string }>(c, "INSERT INTO workspace (name) VALUES ('synthetic ws') RETURNING id"))!.id;
    const mk = async (role: string) => (await one<{ id: string }>(c, 'INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,$3) RETURNING id', [ws, `${role}${Math.random()}@example.test`, role]))!.id;
    const owner = await mk('owner'), compliance = await mk('compliance'), viewer = await mk('viewer');
    if (!o.noBrand) await c.query("INSERT INTO brand (workspace_id, legal_name, dlt_entity_id) VALUES ($1, 'Synthetic Co Pvt Ltd', 'DLT-SYN-1')", [ws]);
    await c.query("INSERT INTO wallet (workspace_id, balance_inr_milli, state) VALUES ($1, $2, 'ok')", [ws, o.wallet ?? 10_000_000]);
    const agentId = (await one<{ id: string }>(c, "INSERT INTO agent (workspace_id, name, status) VALUES ($1, 'Riya', 'live') RETURNING id", [ws]))!.id;
    const cfg = agentConfig(category, o.packs ? { sectorPacks: o.packs as AgentConfig['sectorPacks'] } : {});
    const versionId = (await one<{ id: string }>(c, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1, 1, $2, $3) RETURNING id",
      [agentId, 'hash-' + Math.random(), JSON.stringify({ agent: cfg, brief: { text: 'compiled brief', hash: 'b1', bytes: 14 } })]))!.id;
    const series = o.series ?? (category === 'promotional' ? '140' : 'ten_digit');
    const numberId = (await one<{ id: string }>(c, `INSERT INTO phone_number (workspace_id, e164, series, carrier, kyc_status, a2p_status)
      VALUES ($1, $2, $3, 'fake', 'verified', 'declared') RETURNING id`, [ws, phone(), series]))!.id;
    const e164 = phone();
    const contact = (await one<{ id: string }>(c, "INSERT INTO contact (workspace_id, e164, name, custom) VALUES ($1,$2,'Sunita',$3) RETURNING id",
      [ws, e164, JSON.stringify({ due_date: '5 Nov', upgrade: 'gold plan' })]))!.id;
    await c.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis) VALUES ($1,$2,'service','contract')", [ws, contact]);
    return { ws, owner, compliance, viewer, versionId, agentId, numberId, contact, e164 };
  });
}

async function addContact(w: World, o: { e164?: string; tz?: string; consent?: boolean } = {}): Promise<string> {
  const id = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name, timezone) VALUES ($1,$2,'Rakesh',$3) RETURNING id",
    [w.ws, o.e164 ?? phone(), o.tz ?? 'Asia/Kolkata']))!.id;
  if (o.consent !== false) await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis) VALUES ($1,$2,'service','contract')", [w.ws, id]);
  return id;
}

async function attempt(w: World, o: Partial<{ contact: string | null; kind: string; campaign: string; category: CallCategory; toE164: string; version: string | null }> = {}): Promise<string> {
  return (await one<{ id: string }>(pool, `INSERT INTO attempt (workspace_id, campaign_id, contact_id, to_e164, kind, agent_version_id, call_category, scheduled_for)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-01-01') RETURNING id`,
    [w.ws, o.campaign ?? null, o.contact === undefined ? w.contact : o.contact, o.toE164 ?? null, o.kind ?? 'single',
      o.version === undefined ? w.versionId : o.version, o.category ?? 'service']))!.id;
}

/** Run the gate on one attempt in its own transaction and commit, as the worker's claim does. */
async function gate(id: string, now = NOON, predial?: PredialFn): Promise<GateVerdict> {
  return tx(pool, async c => {
    const a = await one<AttemptRow>(c, `SELECT id, workspace_id, campaign_id, contact_id, to_e164, kind, agent_version_id, call_category, facts, api_key_id, scheduled_for
      FROM attempt WHERE id = $1 FOR UPDATE`, [id]);
    return runGate(c, a!, { now, predial });
  });
}
const code = (v: GateVerdict) => (v.allowed ? 'allowed' : v.code);

async function campaignRow(w: World, category: CallCategory, policy: Record<string, unknown> = {}, state = 'running'): Promise<string> {
  return (await one<{ id: string }>(pool, `INSERT INTO campaign (workspace_id, name, call_category, policy, state, agent_version_id)
    VALUES ($1, 'c', $2, $3, $4, $5) RETURNING id`, [w.ws, category, JSON.stringify(policy), state, w.versionId]))!.id;
}

const as = (w: World, who: 'owner' | 'compliance' | 'viewer' = 'owner'): { workspaceId: string; actor: Actor } =>
  ({ workspaceId: w.ws, actor: { type: 'member', id: w[who], role: who } });
const SYS = (w: World) => ({ workspaceId: w.ws, actor: { type: 'system', id: 'test' } as Actor });
const deps = (w: World, now: Date, o: Partial<WorkerDeps> = {}): WorkerDeps => ({ pool, registry, runtime: rt, now: () => now, workspaceId: w.ws, ...o });

// ---- G1-G12: each check refuses with its code ----

test('the gate passes a clean service attempt and holds money for it', { skip }, async () => {
  const w = await world();
  const v = await gate(await attempt(w));
  assert.equal(code(v), 'allowed');
  assert.ok(v.allowed && v.trace.length === 12 && v.trace.every(t => t.ok));
  const r = await one<{ status: string; inr_milli: string }>(pool, 'SELECT status, inr_milli FROM reservation WHERE workspace_id = $1', [w.ws]);
  assert.equal(r!.status, 'held');
  assert.equal(Number(r!.inr_milli), 5 * 6000, '300 s at the default ceiling of ₹6/min');
});

test('G1 workspace_not_verified: suspended workspace, or no verified brand for production', { skip }, async () => {
  const w = await world();
  await pool.query("UPDATE workspace SET status = 'suspended' WHERE id = $1", [w.ws]);
  assert.equal(code(await gate(await attempt(w))), 'workspace_not_verified');
  const w2 = await world({ noBrand: true });
  const v = await gate(await attempt(w2));
  assert.equal(code(v), 'workspace_not_verified');
  assert.equal(!v.allowed && v.gate, 'G1');
});

test('G2 identifier_invalid / destination_blocked', { skip }, async () => {
  const w = await world();
  assert.equal(code(await gate(await attempt(w, { contact: await addContact(w, { e164: '12345' }) }))), 'identifier_invalid');
  assert.equal(code(await gate(await attempt(w, { contact: await addContact(w, { e164: '+12025550123' }) }))), 'destination_blocked');
  assert.equal(code(await gate(await attempt(w, { contact: null, kind: 'test', toE164: phone() }))), 'destination_blocked', 'test: unverified member phone');
});

test('G3 erased: a tombstone stops a re-imported person', { skip }, async () => {
  const w = await world();
  await pool.query('INSERT INTO tombstone (workspace_id, e164_hash) VALUES ($1,$2)', [w.ws, tombstoneHashes(w.ws, w.e164)[1]]);
  assert.equal(code(await gate(await attempt(w))), 'erased');
});

test('G4 suppressed:<source>, campaign scope and the internal DND list', { skip }, async () => {
  const w = await world();
  await pool.query("INSERT INTO suppression (workspace_id, e164, reason, source) VALUES ($1,$2,'said dobara call mat karna','in_call')", [w.ws, w.e164]);
  assert.equal(code(await gate(await attempt(w))), 'suppressed:in_call');
  const c2 = await addContact(w);
  const camp = await campaignRow(w, 'service');
  await pool.query("INSERT INTO suppression (workspace_id, contact_id, scope, scope_id, reason) VALUES ($1,$2,'campaign',$3,'not interested')", [w.ws, c2, camp]);
  assert.equal(code(await gate(await attempt(w, { contact: c2, campaign: camp, kind: 'campaign' }))), 'suppressed:campaign');
  assert.equal(code(await gate(await attempt(w, { contact: c2 }))), 'allowed', 'campaign scope does not follow them elsewhere');
  const c3 = await addContact(w);
  await pool.query('INSERT INTO dnd_status (contact_id, internal) VALUES ($1, true)', [c3]);
  assert.equal(code(await gate(await attempt(w, { contact: c3 }))), 'suppressed:internal_dnd');
});

test('G5 no_basis / consent_expired / dnd_blocked_by_operator', { skip }, async () => {
  const w = await world({ category: 'promotional' });
  assert.equal(code(await gate(await attempt(w, { contact: await addContact(w, { consent: false }) }))), 'no_basis');
  const withdrawn = await addContact(w);
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, granted) VALUES ($1,$2,'all','person',false)", [w.ws, withdrawn]);
  assert.equal(code(await gate(await attempt(w, { contact: withdrawn }))), 'no_basis');
  const inquiry = await addContact(w, { consent: false });
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, created_at) VALUES ($1,$2,'service','inquiry', $3)", [w.ws, inquiry, IST('2026-10-01', '10:00')]);
  assert.equal(code(await gate(await attempt(w, { contact: inquiry }))), 'consent_expired', 'an inquiry is a basis for 7 days');
  // Promotional: explicit consent, and a known DND status.
  const promo = await addContact(w, { consent: false });
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis) VALUES ($1,$2,'promotional','consent')", [w.ws, promo]);
  const p = () => attempt(w, { contact: promo, category: 'promotional' });
  assert.equal(code(await gate(await p())), 'no_basis', 'unknown DND status holds a promotional row');
  await pool.query("INSERT INTO dnd_status (contact_id, ncpr_status, checked_at) VALUES ($1, 'registered', now())", [promo]);
  assert.equal(code(await gate(await p())), 'dnd_blocked_by_operator');
  await pool.query("UPDATE dnd_status SET ncpr_status = 'not_registered' WHERE contact_id = $1", [promo]);
  assert.equal(code(await gate(await p())), 'allowed');
  assert.equal(code(await gate(await attempt(w, { contact: await addContact(w), category: 'promotional' }))), 'no_basis', 'a service relationship is no basis for promotion');
});

test('G6 out_of_window carries the next eligible time; G7 budget_exhausted by gap and per-person budget', { skip }, async () => {
  const w = await world();
  const v = await gate(await attempt(w), IST(TUE, '07:30'));
  assert.equal(code(v), 'out_of_window');
  assert.equal(!v.allowed && v.outcome, 'deferred');
  assert.equal(!v.allowed && v.nextEligibleAt?.toISOString(), IST(TUE, '10:00').toISOString());
  // Number gap: a ring 30 minutes ago defers this one to 120 minutes after it.
  await pool.query("UPDATE attempt SET dialed_at = $2, status = 'no_answer' WHERE id = $1", [await attempt(w), IST(TUE, '11:30')]);
  const g = await gate(await attempt(w));
  assert.equal(code(g), 'budget_exhausted');
  assert.equal(!g.allowed && g.nextEligibleAt?.toISOString(), IST(TUE, '13:30').toISOString());
  // Per-person run budget inside a campaign.
  const c2 = await addContact(w);
  const camp = await campaignRow(w, 'service', { budgets: { perDay: 2, perWeek: 5, perRun: 1 } });
  await pool.query("UPDATE attempt SET dialed_at = $2, status = 'busy' WHERE id = $1", [await attempt(w, { contact: c2, campaign: camp, kind: 'campaign' }), IST('2026-10-26', '11:00')]);
  const b = await gate(await attempt(w, { contact: c2, campaign: camp, kind: 'campaign' }));
  assert.equal(code(b), 'budget_exhausted');
  assert.equal(!b.allowed && b.outcome, 'blocked', 'the run budget is spent: no next time');
});

test('G8 cli_wrong_series / cli_paused / kyc_lapsed / cli_undeclared (warning before the A2P date)', { skip }, async () => {
  const w = await world({ packs: ['insurance_irdai'] });
  await pool.query("INSERT INTO dial_policy (workspace_id, sector_packs) VALUES ($1, '{base,insurance_irdai}')", [w.ws]);
  assert.equal(code(await gate(await attempt(w))), 'cli_wrong_series', 'an IRDAI agent may not use a 10-digit line');
  await pool.query("UPDATE phone_number SET series = '1600', status = 'paused' WHERE id = $1", [w.numberId]);
  assert.equal(code(await gate(await attempt(w))), 'cli_paused');
  await pool.query("UPDATE phone_number SET status = 'active', kyc_status = 'submitted' WHERE id = $1", [w.numberId]);
  assert.equal(code(await gate(await attempt(w))), 'kyc_lapsed');
  await pool.query("UPDATE phone_number SET kyc_status = 'verified', a2p_status = 'undeclared' WHERE id = $1", [w.numberId]);
  const before = await gate(await attempt(w));
  assert.equal(code(before), 'allowed');
  assert.ok(before.warnings.some(x => /A2P/.test(x)));
  const c2 = await addContact(w);
  assert.equal(code(await gate(await attempt(w, { contact: c2 }), IST(TUE_AFTER_A2P, '12:00'))), 'cli_undeclared');
});

test('G9 wallet_low / cap_reached, and nothing stays held', { skip }, async () => {
  const w = await world({ wallet: 1000 });
  assert.equal(code(await gate(await attempt(w))), 'wallet_low');
  const w2 = await world();
  const camp = await campaignRow(w2, 'service');
  await pool.query("INSERT INTO budget (workspace_id, scope_type, scope_id, cap_inr_milli) VALUES ($1,'campaign',$2, 1000)", [w2.ws, camp]);
  const v = await gate(await attempt(w2, { campaign: camp, kind: 'campaign' }));
  assert.equal(code(v), 'cap_reached');
  assert.equal(!v.allowed && v.outcome, 'deferred', 'the campaign pauses; the person still waits');
  const held = await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM reservation WHERE workspace_id = ANY($1) AND status = 'held'", [[w.ws, w2.ws]]);
  assert.equal(held!.n, 0);
});

test('G10 version_not_publishable / pack_missing, and the hold is released on refusal', { skip }, async () => {
  const w = await world();
  const v = await gate(await attempt(w, { category: 'transactional' }));
  assert.equal(code(v), 'version_not_publishable');
  assert.equal(code(await gate(await attempt(w, { version: null }))), 'version_not_publishable');
  const r = await one<{ held: number; released: number }>(pool, `SELECT count(*) FILTER (WHERE status = 'held')::int AS held,
    count(*) FILTER (WHERE status = 'released')::int AS released FROM reservation WHERE workspace_id = $1`, [w.ws]);
  assert.deepEqual(r, { held: 0, released: 2 }, 'G9 held money twice, G10 refused twice, both holds came back');
  const w2 = await world({ packs: ['insurance_irdai'], series: '1600' });
  assert.equal(code(await gate(await attempt(w2))), 'pack_missing');
});

test('G11 predial_veto and predial_timeout (fails closed)', { skip }, async () => {
  const w = await world();
  const camp = await campaignRow(w, 'service', { predial: { url: 'https://tenant.example.test/predial' } });
  const veto: PredialFn = async () => ({ allow: false, reason: 'paid already' });
  const slow: PredialFn = () => new Promise(res => setTimeout(() => res({ allow: true }), 1500));
  assert.equal(code(await gate(await attempt(w, { campaign: camp, kind: 'campaign' }), NOON, veto)), 'predial_veto');
  const c2 = await addContact(w);
  assert.equal(code(await gate(await attempt(w, { contact: c2, campaign: camp, kind: 'campaign' }), NOON, slow)), 'predial_timeout');
});

test('G12 deferred_concurrency, with inbound capacity held back', { skip }, async () => {
  const w = await world();
  await pool.query('INSERT INTO dial_policy (workspace_id, concurrency) VALUES ($1, 2)', [w.ws]);
  await pool.query("UPDATE attempt SET status = 'connected' WHERE id = $1", [await attempt(w, { contact: await addContact(w) })]);
  assert.equal(code(await gate(await attempt(w))), 'allowed', '1 of 2 lines busy');
  await pool.query('INSERT INTO inbound_route (workspace_id, number_id) VALUES ($1,$2)', [w.ws, w.numberId]);
  const v = await gate(await attempt(w, { contact: await addContact(w) }));
  assert.equal(code(v), 'deferred_concurrency', 'one of the two lines is held for inbound');
  // A call that has ended frees its line even though the calls module leaves the attempt 'connected'.
  const w2 = await world();
  await pool.query('INSERT INTO dial_policy (workspace_id, concurrency) VALUES ($1, 1)', [w2.ws]);
  const done = await attempt(w2, { contact: await addContact(w2) });
  await pool.query("UPDATE attempt SET status = 'connected' WHERE id = $1", [done]);
  await pool.query("INSERT INTO conversation (workspace_id, attempt_id, status) VALUES ($1,$2,'live')", [w2.ws, done]);
  assert.equal(code(await gate(await attempt(w2))), 'deferred_concurrency', 'live call holds the only line');
  await pool.query("UPDATE conversation SET status = 'ended' WHERE attempt_id = $1", [done]);
  assert.equal(code(await gate(await attempt(w2, { contact: await addContact(w2) }))), 'allowed', 'ended call frees it');
});

test('a check that cannot run refuses with check_unavailable (fail closed) and releases nothing it did not hold', { skip }, async () => {
  const w = await world();
  const v = await gate(await attempt(w, { contact: await addContact(w, { tz: 'Mars/Olympus' }) }));
  assert.equal(code(v), 'check_unavailable');
  assert.equal(!v.allowed && v.gate, 'G6');
  assert.equal(!v.allowed && v.outcome, 'deferred');
});

test('every attempt kind goes through the same gate', { skip }, async () => {
  const w = await world();
  await pool.query("INSERT INTO suppression (workspace_id, e164, reason, source) VALUES ($1,$2,'opt-out','in_call')", [w.ws, w.e164]);
  for (const kind of ['campaign', 'api', 'single', 'retry', 'callback', 'transfer']) {
    assert.equal(code(await gate(await attempt(w, { kind }))), 'suppressed:in_call', kind);
  }
});

// ---- T3: promotional at 09:30 and 21:30, at the form, the API and the gate ----

test('T3: promotional 09:30 and 21:30 refused at the form, the API (422 + rule id) and the gate; service 09:30 allowed', { skip }, async () => {
  const w = await world({ category: 'promotional' });
  for (const start of ['09:30']) {
    const r = await registry.execute(pool, 'campaign.draft', { name: 'p', category: 'promotional', window: { days: [1, 2, 3, 4, 5], ranges: [{ start, end: '20:00' }] } }, as(w));
    assert.equal(r.status, 'not_executed');
    assert.ok(r.status === 'not_executed' && /M3\.promotional_band/.test(r.reason) && r.path === 'window.ranges[0]');
  }
  const late = await registry.execute(pool, 'campaign.draft', { name: 'p', category: 'promotional', window: { days: [1], ranges: [{ start: '12:00', end: '21:30' }] } }, as(w));
  assert.ok(late.status === 'not_executed' && /M3\.promotional_band/.test(late.reason));

  // The HTTP API answers 422 with the rule id, for the campaign form and for a single call at 21:30.
  const { server } = buildApp(pool, [campaigns]);
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));
  const port = (server.address() as { port: number }).port;
  const s = await createSession(pool, w.owner);
  const call = (name: string, args: unknown) => fetch(`http://127.0.0.1:${port}/v1/tools/${name}`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `vp_session=${s.token}` }, body: JSON.stringify({ args }) });
  try {
    const a = await call('campaign.draft', { name: 'p', category: 'promotional', window: { days: [2], ranges: [{ start: '09:30', end: '20:00' }] } });
    assert.equal(a.status, 422);
    assert.match((await a.json() as { reason: string }).reason, /M3\.promotional_band/);
    const b = await call('call.place_single', { contactId: w.contact, agentVersionId: w.versionId, category: 'promotional', at: '2026-10-27T21:30:00+05:30' });
    assert.equal(b.status, 422);
    assert.match((await b.json() as { reason: string }).reason, /M3\.promotional_band/);
  } finally { server.close(); }

  // The gate refuses even a window stored past the form.
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis) VALUES ($1,$2,'promotional','consent')", [w.ws, w.contact]);
  await pool.query("INSERT INTO dnd_status (contact_id, ncpr_status, checked_at) VALUES ($1,'not_registered', now())", [w.contact]);
  const camp = await campaignRow(w, 'promotional', { window: { days: [1, 2, 3, 4, 5, 6, 7], ranges: [{ start: '08:00', end: '22:00' }] } });
  for (const t of ['09:30', '21:30']) {
    const v = await gate(await attempt(w, { campaign: camp, kind: 'campaign', category: 'promotional' }), IST(TUE, t));
    assert.equal(code(v), 'out_of_window', t);
  }
  assert.equal(code(await gate(await attempt(w, { campaign: camp, kind: 'campaign', category: 'promotional' }), IST(TUE, '12:00'))), 'allowed');

  // Service at 09:30 is allowed when the user sets it.
  const sw = await world();
  const d = await registry.execute<{ id: string }>(pool, 'campaign.draft', { name: 's', category: 'service', window: { days: [1, 2, 3, 4, 5, 6], ranges: [{ start: '09:00', end: '19:00' }] } }, as(sw));
  assert.equal(d.status, 'confirmed');
  const scamp = d.status === 'confirmed' ? d.result.id : '';
  await pool.query("UPDATE campaign SET state = 'running', agent_version_id = $2 WHERE id = $1", [scamp, sw.versionId]);
  assert.equal(code(await gate(await attempt(sw, { campaign: scamp, kind: 'campaign' }), IST(TUE, '09:30'))), 'allowed');
});

test('cross-midnight: Compliance sets it with a reason (A2); promotional refused; the gate clips to quiet hours', { skip }, async () => {
  const w = await world();
  const night = { days: [1, 2, 3, 4, 5, 6, 7], ranges: [{ start: '20:00', end: '01:00' }] };
  const d = await registry.execute(pool, 'campaign.draft', { name: 'n', category: 'service', window: night }, as(w));
  assert.ok(d.status === 'not_executed' && /M3\.cross_midnight_role/.test(d.reason));
  const draft = await registry.execute<{ id: string }>(pool, 'campaign.draft', { name: 'n', category: 'service' }, as(w));
  const id = draft.status === 'confirmed' ? draft.result.id : '';

  const noReason = await registry.execute<{ actionId: string }>(pool, 'policy.window.set', { campaignId: id, window: night }, as(w, 'compliance'));
  assert.equal(noReason.status, 'needs_approval');
  const r1 = await registry.approve(pool, noReason.status === 'needs_approval' ? noReason.actionId : '', { workspaceId: w.ws, memberId: w.compliance });
  assert.ok(r1.status === 'not_executed' && /M3\.cross_midnight_reason/.test(r1.reason));

  const p = await registry.execute(pool, 'policy.window.set', { campaignId: id, window: { ...night, crossMidnightReason: 'shift workers asked for late evening' }, outerBand: { start: '07:00', end: '22:00' } }, as(w, 'compliance'));
  const r2 = await registry.approve<{ warnings: string[] }>(pool, p.status === 'needs_approval' ? p.actionId : '', { workspaceId: w.ws, memberId: w.compliance });
  assert.equal(r2.status, 'confirmed');
  assert.ok(r2.status === 'confirmed' && r2.result.warnings.some(x => /crosses midnight/.test(x)), 'accepted with a warning');

  await pool.query("UPDATE campaign SET state = 'running', agent_version_id = $2 WHERE id = $1", [id, w.versionId]);
  assert.equal(code(await gate(await attempt(w, { campaign: id, kind: 'campaign' }), IST(TUE, '21:30'))), 'allowed');
  const late = await gate(await attempt(w, { campaign: id, kind: 'campaign', contact: await addContact(w) }), IST(TUE, '23:30'));
  assert.equal(code(late), 'out_of_window');
  assert.equal(!late.allowed && late.nextEligibleAt?.toISOString(), IST('2026-10-28', '20:00').toISOString());

  const pw = await world({ category: 'promotional' });
  const pd = await registry.execute<{ id: string }>(pool, 'campaign.draft', { name: 'p', category: 'promotional' }, as(pw));
  const pp = await registry.execute(pool, 'policy.window.set', { campaignId: pd.status === 'confirmed' ? pd.result.id : '', window: { ...night, crossMidnightReason: 'no' } }, as(pw, 'compliance'));
  const r3 = await registry.approve(pool, pp.status === 'needs_approval' ? pp.actionId : '', { workspaceId: pw.ws, memberId: pw.compliance });
  assert.ok(r3.status === 'not_executed' && /M3\.promotional_cross_midnight/.test(r3.reason));
});

// ---- claims, dispatch, idempotency ----

test('double claim is impossible: 12 workers race for 5 due attempts; each dials exactly once', { skip }, async () => {
  const w = await world();
  const ids = [await attempt(w)];
  for (let i = 0; i < 4; i++) ids.push(await attempt(w, { contact: await addContact(w) }));
  const before = rt.tickets.length;
  const results = await Promise.all(Array.from({ length: 12 }, () => claimNext(deps(w, NOON))));
  const claimed = results.filter(r => r.kind === 'claimed').map(r => r.kind === 'claimed' ? r.attempt.id : '');
  assert.equal(claimed.length, 5);
  assert.equal(new Set(claimed).size, 5);
  await tick(deps(w, NOON));
  const rows = await one<{ dialing: number; dialed: number }>(pool, `SELECT count(*) FILTER (WHERE status = 'dialing')::int AS dialing,
    count(*) FILTER (WHERE dialed_at IS NOT NULL)::int AS dialed FROM attempt WHERE id = ANY($1)`, [ids]);
  assert.deepEqual(rows, { dialing: 5, dialed: 5 });
  assert.equal(rt.tickets.length - before, 0, 'claimNext alone never dispatches; the attempts stay unconfirmed');
  // A second worker pass finds nothing to dial; the stale reconciler later marks them unknown, never re-dials them.
  const later = await tick(deps(w, new Date(NOON.getTime() + 10 * 60_000)));
  assert.equal(later.claimed, 0);
  const unknown = await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM attempt WHERE id = ANY($1) AND status = 'unknown'", [ids]);
  assert.equal(unknown!.n, 5);
  assert.equal(rt.tickets.length - before, 0);
});

test('worker end to end: ticket from agent_version.config and the contact; offers fenced; memory degrades', { skip }, async () => {
  const w = await world();
  const id = await attempt(w);
  const n0 = rt.tickets.length;
  const rep = await tick(deps(w, NOON));
  assert.equal(rep.dispatched, 1);
  const t = rt.tickets.slice(n0).find(x => x.attemptId === id)!;
  assert.equal(t.transport.kind === 'sip' && t.transport.to, w.e164);
  assert.deepEqual(t.contact.facts, { due_date: '5 Nov' }, 'the offer fact never rides a service call');
  assert.equal(t.contact.memoryStatus, 'none', 'memory.brief is not registered: degrade, never crash');
  assert.equal(t.brief.text, 'compiled brief');
  assert.equal(t.stack.id, 'v2-live');
  assert.equal(t.limits.maxCostInrMilli, 30_000);
  assert.equal(t.test, false);
  const a = await one<{ status: string; dispatched_at: Date | null; conversation_id: string }>(pool, 'SELECT status, dispatched_at, conversation_id FROM attempt WHERE id = $1', [id]);
  assert.equal(a!.status, 'dialing');
  assert.ok(a!.dispatched_at);
  assert.equal(a!.conversation_id, t.conversationId);
  const conv = await one<{ attempt_id: string; contact_id: string; agent_version_id: string; channel: string; status: string }>(pool,
    'SELECT attempt_id, contact_id, agent_version_id, channel, status FROM conversation WHERE id = $1 AND workspace_id = $2', [t.conversationId, w.ws]);
  assert.deepEqual(conv, { attempt_id: id, contact_id: w.contact, agent_version_id: w.versionId, channel: 'phone', status: 'live' }, 'the calls hook finds the row it trusts');
  assert.equal((await tick(deps(w, NOON))).dispatched, 0, 'it never dials twice');

  // memory.brief registered: fast -> loaded (capped at 1200 bytes); slow -> not_loaded_timeout.
  let delay = 0;
  const r2 = new Registry();
  campaigns.register(r2);
  r2.register(tool(obj({ contactId: uuid(), agentId: uuid() }), { name: 'memory.brief', risk: 'read', summary: 'brief',
    run: async () => { await new Promise(res => setTimeout(res, delay)); return { text: 'x'.repeat(1500), status: 'ok' }; } }));
  const fast = await attempt(w, { contact: await addContact(w) });
  await tick(deps(w, NOON, { registry: r2 }));
  const tf = rt.tickets.find(x => x.attemptId === fast)!;
  assert.equal(tf.contact.memoryStatus, 'loaded');
  assert.equal(Buffer.byteLength(tf.contact.memoryBrief), 1200);
  delay = 1200;
  const slow = await attempt(w, { contact: await addContact(w) });
  await tick(deps(w, NOON, { registry: r2 }));
  assert.equal(rt.tickets.find(x => x.attemptId === slow)!.contact.memoryStatus, 'not_loaded_timeout');
});

test('runtime refusal releases the hold and the ladder retries the provider error (A3)', { skip }, async () => {
  const w = await world();
  const id = await attempt(w);
  const refusing: Runtime = { start: async () => ({ accepted: false, reason: 'trunk down' }), control: async () => ({ ok: true }) };
  const rep = await tick(deps(w, NOON, { runtime: refusing }));
  assert.equal(rep.rejected, 1);
  const a = await one<{ status: string; counts_to_budget: boolean; reservation_id: string }>(pool, 'SELECT status, counts_to_budget, reservation_id FROM attempt WHERE id = $1', [id]);
  assert.equal(a!.status, 'failed');
  assert.equal(a!.counts_to_budget, false, 'a carrier fault never spends the person\'s patience');
  assert.equal((await one<{ status: string }>(pool, 'SELECT status FROM reservation WHERE id = $1', [a!.reservation_id]))!.status, 'released');
  assert.equal((await one<{ status: string }>(pool, 'SELECT status FROM conversation WHERE attempt_id = $1', [id]))!.status, 'failed');
  const retry = await one<{ kind: string; scheduled_for: Date }>(pool, 'SELECT kind, scheduled_for FROM attempt WHERE retry_of = $1', [id]);
  assert.equal(retry!.kind, 'retry');
  const audit = await one<{ payload: { mode: string } }>(pool, "SELECT payload FROM audit_event WHERE workspace_id = $1 AND action = 'attempt.retry_per_ladder'", [w.ws]);
  assert.equal(audit!.payload.mode, 'A3');
});

test('retry ladder: steps by outcome, unknown never retried, idempotent', { skip }, async () => {
  const w = await world();
  const id = await attempt(w);
  await pool.query("UPDATE attempt SET dialed_at = $2, status = 'busy' WHERE id = $1", [id, NOON]);
  const r = await registry.execute<{ scheduled: boolean; at: string; attemptId: string }>(pool, 'attempt.retry_per_ladder', { attemptId: id, outcome: 'busy' }, SYS(w));
  assert.ok(r.status === 'confirmed' && r.mode === 'A3' && r.result.scheduled);
  assert.equal(r.status === 'confirmed' && r.result.at, new Date(NOON.getTime() + 30 * 60_000).toISOString());
  const again = await registry.execute<{ replayed: boolean }>(pool, 'attempt.retry_per_ladder', { attemptId: id, outcome: 'busy' }, SYS(w));
  assert.ok(again.status === 'confirmed' && again.result.replayed);
  const second = r.status === 'confirmed' ? r.result.attemptId : '';
  await pool.query("UPDATE attempt SET dialed_at = $2 WHERE id = $1", [second, NOON]);
  const r2 = await registry.execute<{ at: string; step: number }>(pool, 'attempt.retry_per_ladder', { attemptId: second, outcome: 'busy' }, SYS(w));
  assert.ok(r2.status === 'confirmed' && r2.result.step === 2 && r2.result.at === new Date(NOON.getTime() + 120 * 60_000).toISOString());
  const u = await registry.execute<{ scheduled: boolean; reason: string }>(pool, 'attempt.retry_per_ladder', { attemptId: await attempt(w), outcome: 'unknown' }, SYS(w));
  assert.ok(u.status === 'confirmed' && !u.result.scheduled && /never/.test(u.result.reason));
  const m = await registry.execute(pool, 'attempt.retry_per_ladder', { attemptId: id, outcome: 'busy' }, as(w));
  assert.equal(m.status, 'needs_approval', 'a person asking for a retry goes through approval');
});

// ---- launch, A2/A3, caps, tenancy ----

async function readyCampaign(w: World, policy: Record<string, unknown> = {}): Promise<string> {
  const d = await registry.execute<{ id: string }>(pool, 'campaign.draft', { name: 'renewals', category: 'service', agentVersionId: w.versionId, capInrMilli: 5_000_000, ...policy }, as(w));
  assert.equal(d.status, 'confirmed', JSON.stringify(d));
  const id = d.status === 'confirmed' ? d.result.id : '';
  const add = await registry.execute(pool, 'campaign.audience.add', { id, contactIds: [w.contact, await addContact(w), await addContact(w)] }, as(w));
  const ok = await registry.approve(pool, add.status === 'needs_approval' ? add.actionId : '', { workspaceId: w.ws, memberId: w.owner });
  assert.equal(ok.status, 'confirmed');
  return id;
}

test('launch needs an approval bound to the campaign version (policy_version + agent version hash)', { skip }, async () => {
  const w = await world();
  const id = await readyCampaign(w);
  const blank = await registry.execute<{ blockers: unknown[] }>(pool, 'campaign.get', { id }, as(w, 'viewer'));
  assert.ok(blank.status === 'confirmed' && blank.result.blockers.length === 0, JSON.stringify(blank));
  const p1 = await registry.execute(pool, 'campaign.launch', { id }, as(w));
  assert.equal(p1.status, 'needs_approval');
  // The window narrows (A1, at once) after the proposal: the policy version moves and the approval is void.
  const n = await registry.execute(pool, 'campaign.window.narrow', { id, window: { days: [1, 2, 3, 4, 5], ranges: [{ start: '10:00', end: '18:00' }] } }, as(w));
  assert.equal(n.status, 'confirmed');
  const stale = await registry.approve(pool, p1.status === 'needs_approval' ? p1.actionId : '', { workspaceId: w.ws, memberId: w.owner });
  assert.ok(stale.status === 'not_executed' && /changed/.test(stale.reason));
  assert.equal((await one<{ state: string }>(pool, 'SELECT state FROM campaign WHERE id = $1', [id]))!.state, 'draft');
  const viewerTry = await registry.execute(pool, 'campaign.launch', { id }, as(w, 'viewer'));
  assert.equal(viewerTry.status, 'not_executed', 'a viewer cannot propose a launch');
  const p2 = await registry.execute(pool, 'campaign.launch', { id }, as(w));
  const ok = await registry.approve<{ state: string; queued: number; firstCampaignReviewStop: number }>(pool, p2.status === 'needs_approval' ? p2.actionId : '', { workspaceId: w.ws, memberId: w.owner });
  assert.ok(ok.status === 'confirmed' && ok.result.state === 'running' && ok.result.queued === 3 && ok.result.firstCampaignReviewStop === 20, JSON.stringify(ok));
  const widen = await registry.execute(pool, 'campaign.window.narrow', { id, window: { days: [1, 2, 3, 4, 5, 6], ranges: [{ start: '10:00', end: '19:00' }] } }, as(w));
  assert.ok(widen.status === 'not_executed' && /M3\.narrow_only/.test(widen.reason), 'narrow cannot widen');
});

test('a draft with blockers cannot launch, and says why', { skip }, async () => {
  const w = await world();
  const d = await registry.execute<{ id: string }>(pool, 'campaign.draft', { name: 'x', category: 'service' }, as(w));
  const id = d.status === 'confirmed' ? d.result.id : '';
  const g = await registry.execute<{ blockers: { code: string }[] }>(pool, 'campaign.get', { id }, as(w));
  assert.deepEqual(g.status === 'confirmed' && g.result.blockers.map(b => b.code), ['no_version', 'no_cap', 'no_audience']);
  const p = await registry.execute(pool, 'campaign.launch', { id }, as(w));
  const r = await registry.approve(pool, p.status === 'needs_approval' ? p.actionId : '', { workspaceId: w.ws, memberId: w.owner });
  assert.ok(r.status === 'not_executed' && /launch blocked: no published agent version/.test(r.reason));
});

test('pause and stop: A3 when VP acts, approval when a person does; stop cancels what has not dialled', { skip }, async () => {
  const w = await world();
  const id = await readyCampaign(w);
  await pool.query("UPDATE campaign SET state = 'running' WHERE id = $1", [id]);
  const person = await registry.execute(pool, 'campaign.pause', { id }, as(w));
  assert.equal(person.status, 'needs_approval');
  const sys = await registry.execute<{ cause: string }>(pool, 'campaign.pause', { id, cause: 'opt_out_spike' }, SYS(w));
  assert.ok(sys.status === 'confirmed' && sys.mode === 'A3' && sys.result.cause === 'opt_out_spike');
  const resumeSys = await registry.execute(pool, 'campaign.resume', { id }, SYS(w));
  assert.equal(resumeSys.status, 'needs_approval', 'resume is not on the A3 list: a person decides');
  await pool.query("INSERT INTO attempt (workspace_id, campaign_id, contact_id) VALUES ($1,$2,$3)", [w.ws, id, w.contact]);
  const stop = await registry.execute<{ cancelledAttempts: number }>(pool, 'campaign.stop', { id }, SYS(w));
  assert.ok(stop.status === 'confirmed' && stop.mode === 'A3' && stop.result.cancelledAttempts === 1);
});

test('the worker pauses a campaign at its cap (A3 campaign.stop_at_cap), and at the first-campaign review stop', { skip }, async () => {
  const w = await world();
  const id = await readyCampaign(w, { capInrMilli: 40_000 });
  const p = await registry.execute(pool, 'campaign.launch', { id }, as(w));
  await registry.approve(pool, p.status === 'needs_approval' ? p.actionId : '', { workspaceId: w.ws, memberId: w.owner });
  const rep = await tick(deps(w, NOON));
  assert.equal(rep.dispatched, 1, '₹40 cap holds one ₹30 call');
  const c = await one<{ state: string; pause_cause: string }>(pool, 'SELECT state, pause_cause FROM campaign WHERE id = $1', [id]);
  assert.deepEqual(c, { state: 'paused', pause_cause: 'cap_reached:campaign' });
  const audit = await one<{ payload: { mode: string } }>(pool, "SELECT payload FROM audit_event WHERE workspace_id = $1 AND action = 'campaign.stop_at_cap'", [w.ws]);
  assert.equal(audit!.payload.mode, 'A3');

  const w2 = await world();
  const id2 = await readyCampaign(w2);
  await pool.query("UPDATE campaign SET state = 'running', policy = policy || '{\"reviewStopAfter\": 2}' WHERE id = $1", [id2]);
  await pool.query("INSERT INTO budget (workspace_id, scope_type, scope_id, cap_inr_milli) VALUES ($1,'campaign',$2, 5000000)", [w2.ws, id2]);
  await pool.query(`INSERT INTO attempt (workspace_id, campaign_id, contact_id, kind, scheduled_for, agent_version_id, call_category)
    SELECT $1, $2, m.contact_id, 'campaign', '2026-01-01', $3, 'service' FROM audience_member m JOIN campaign k ON k.audience_id = m.audience_id WHERE k.id = $2`, [w2.ws, id2, w2.versionId]);
  const r2 = await tick(deps(w2, NOON));
  assert.equal(r2.dispatched, 2);
  assert.equal((await one<{ pause_cause: string }>(pool, 'SELECT pause_cause FROM campaign WHERE id = $1', [id2]))!.pause_cause, 'first_campaign_review');
});

test('tenancy: another workspace cannot read, change or dial these rows', { skip }, async () => {
  const a = await world(), b = await world();
  const id = await readyCampaign(a);
  const get = await registry.execute(pool, 'campaign.get', { id }, as(b));
  assert.ok(get.status === 'not_executed' && /no such campaign/.test(get.reason));
  const narrow = await registry.execute(pool, 'campaign.window.narrow', { id, window: { days: [1], ranges: [{ start: '11:00', end: '12:00' }] } }, as(b));
  assert.equal(narrow.status, 'not_executed');
  const sysPause = await registry.execute(pool, 'campaign.pause', { id }, SYS(b));
  assert.equal(sysPause.status, 'not_executed');
  const add = await registry.execute(pool, 'campaign.audience.add', { id: (await campaignRow(b, 'service')), contactIds: [a.contact] }, as(b));
  const r = await registry.approve(pool, add.status === 'needs_approval' ? add.actionId : '', { workspaceId: b.ws, memberId: b.owner });
  assert.ok(r.status === 'not_executed' && /not in this workspace/.test(r.reason));
  await attempt(a);
  const list = await registry.execute<{ attempts: unknown[] }>(pool, 'attempt.list', {}, as(b));
  assert.ok(list.status === 'confirmed' && list.result.attempts.length === 0);
  // An attempt in B pointing at A's contact and A's agent version is refused at the gate.
  const cross = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, contact_id, kind, agent_version_id, call_category) VALUES ($1,$2,'single',$3,'service') RETURNING id",
    [b.ws, a.contact, a.versionId]))!.id;
  assert.equal(code(await gate(cross)), 'identifier_invalid');
  const single = await registry.execute(pool, 'call.place_single', { contactId: a.contact, agentVersionId: b.versionId, category: 'service' }, as(b));
  const rs = await registry.approve(pool, single.status === 'needs_approval' ? single.actionId : '', { workspaceId: b.ws, memberId: b.owner });
  assert.ok(rs.status === 'not_executed' && /contactId/.test(rs.reason));
});

test('test.ring_member_phone rings only a verified member phone, through the gate, on a trial line', { skip }, async () => {
  const w = await world();
  const mine = phone();
  const un = await registry.execute(pool, 'test.ring_member_phone', { agentVersionId: w.versionId }, as(w));
  assert.ok(un.status === 'not_executed' && /verified phone/.test(un.reason));
  await pool.query('INSERT INTO verified_test_phone (workspace_id, member_id, e164, verified_at) VALUES ($1,$2,$3, now())', [w.ws, w.owner, mine]);
  await pool.query("UPDATE phone_number SET series = 'trial', kyc_status = 'none', a2p_status = 'undeclared' WHERE id = $1", [w.numberId]);
  const r = await registry.execute<{ attemptId: string }>(pool, 'test.ring_member_phone', { agentVersionId: w.versionId, asContactId: w.contact }, as(w));
  assert.ok(r.status === 'confirmed' && r.mode === 'A1');
  await pool.query("INSERT INTO suppression (workspace_id, e164, reason, source) VALUES ($1,$2,'opt-out','in_call')", [w.ws, w.e164]);
  await tick(deps(w, IST(TUE, '07:30')));
  const t = rt.tickets.find(x => x.attemptId === (r.status === 'confirmed' ? r.result.attemptId : ''))!;
  assert.ok(t, 'a member test at 07:30 is outside quiet hours and allowed');
  assert.equal(t.transport.kind === 'sip' && t.transport.to, mine, 'never the row\'s number');
  assert.equal(t.test, true);
  assert.deepEqual(t.contact.facts, { due_date: '5 Nov' }, 'the row lends its variables');
  const night = await registry.execute<{ attemptId: string }>(pool, 'test.ring_member_phone', { agentVersionId: w.versionId }, as(w));
  await tick(deps(w, IST(TUE, '23:00')));
  const a = await one<{ blocked_by: string }>(pool, 'SELECT blocked_by FROM attempt WHERE id = $1', [night.status === 'confirmed' ? night.result.attemptId : '']);
  assert.equal(a!.blocked_by, 'out_of_window', 'quiet hours hold for every path');
});

test('numbers: search, rent (spend, owner approves), KYC, pause; A2P pack exports', { skip }, async () => {
  const w = await world();
  const s = await registry.execute<{ offers: { ref: string }[] }>(pool, 'number.search', { series: '1600' }, as(w));
  assert.ok(s.status === 'confirmed' && s.result.offers.length > 0);
  const p = await registry.execute(pool, 'number.rent', { offerRef: s.status === 'confirmed' ? s.result.offers[0].ref : '' }, as(w, 'compliance'));
  assert.equal(p.status, 'not_executed', 'compliance cannot propose spend');
  const p2 = await registry.execute(pool, 'number.rent', { offerRef: s.status === 'confirmed' ? s.result.offers[0].ref : '' }, as(w));
  assert.equal(p2.status, 'needs_approval');
  const notOwner = await registry.approve(pool, p2.status === 'needs_approval' ? p2.actionId : '', { workspaceId: w.ws, memberId: w.compliance });
  assert.equal(notOwner.status, 'not_executed', 'only an owner approves spend');
  const rented = await registry.approve<{ numberId: string }>(pool, p2.status === 'needs_approval' ? p2.actionId : '', { workspaceId: w.ws, memberId: w.owner });
  assert.equal(rented.status, 'confirmed');
  const nid = rented.status === 'confirmed' ? rented.result.numberId : '';
  const k = await registry.execute(pool, 'number.kyc.submit', { numberId: nid, documents: [{ kind: 'gst_certificate', ref: 'doc:synthetic-1' }] }, as(w));
  const kr = await registry.approve<{ kycStatus: string }>(pool, k.status === 'needs_approval' ? k.actionId : '', { workspaceId: w.ws, memberId: w.owner });
  assert.ok(kr.status === 'confirmed' && kr.result.kycStatus === 'submitted');
  const pz = await registry.execute(pool, 'number.pause', { numberId: nid, reason: 'testing' }, as(w, 'compliance'));
  assert.equal(pz.status, 'confirmed');
  const fl = await registry.execute(pool, 'number.pause_flagged', { numberId: w.numberId, flag: 'suspected UCC notice' }, SYS(w));
  assert.ok(fl.status === 'confirmed' && fl.mode === 'A3');
  const pack = await registry.execute<{ csv: string; lines: { status: string }[] }>(pool, 'a2p.declaration.export', { format: 'csv' }, as(w, 'compliance'));
  assert.ok(pack.status === 'confirmed' && pack.result.lines.length === 2 && /^cli,series,a2pAiVoice/.test(pack.result.csv));
});

test('estimate: people, held, p10-p90 incl. GST, labelled as an assumption', { skip }, async () => {
  const w = await world();
  const id = await readyCampaign(w);
  await pool.query("INSERT INTO suppression (workspace_id, e164, reason) VALUES ($1,$2,'opt-out')", [w.ws, w.e164]);
  const e = await registry.execute<{ people: number; held: number; p10InrMilli: number; p90InrMilli: number; basis: string }>(pool, 'campaign.estimate', { id }, as(w, 'viewer'));
  assert.ok(e.status === 'confirmed');
  assert.equal(e.status === 'confirmed' && e.result.people, 2);
  assert.equal(e.status === 'confirmed' && e.result.held, 1);
  assert.ok(e.status === 'confirmed' && e.result.p10InrMilli < e.result.p90InrMilli && /assumption/.test(e.result.basis));
});

test('call.place_single queues for the gate; idempotency key replays; worker dials it once', { skip }, async () => {
  const w = await world();
  const args = { contactId: w.contact, agentVersionId: w.versionId, category: 'service', idempotencyKey: 'ext-ref-0001', facts: { due_date: '9 Nov' } };
  const p = await registry.execute(pool, 'call.place_single', args, as(w));
  const r = await registry.approve<{ attemptId: string }>(pool, p.status === 'needs_approval' ? p.actionId : '', { workspaceId: w.ws, memberId: w.owner });
  assert.equal(r.status, 'confirmed');
  const p2 = await registry.execute(pool, 'call.place_single', args, as(w));
  const r2 = await registry.approve<{ attemptId: string; replayed: boolean }>(pool, p2.status === 'needs_approval' ? p2.actionId : '', { workspaceId: w.ws, memberId: w.owner });
  assert.ok(r2.status === 'confirmed' && r2.result.replayed && r.status === 'confirmed' && r2.result.attemptId === r.result.attemptId);
  await pool.query('UPDATE attempt SET scheduled_for = $2 WHERE id = $1', [r.status === 'confirmed' ? r.result.attemptId : '', NOON]);
  const n0 = rt.tickets.length;
  await tick(deps(w, NOON));
  const mine = rt.tickets.slice(n0).filter(t => t.attemptId === (r.status === 'confirmed' ? r.result.attemptId : ''));
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0].contact.facts, { due_date: '9 Nov' }, 'per-call variables win over the stored attribute');
});

test('dial-time seams: experiment arm, deployment split, money.estimate sizes the hold, memory off, the dispatch job', { skip }, async () => {
  const w = await world();
  const v2 = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) SELECT agent_id, 2, 'hash-v2-' || gen_random_uuid(), config FROM agent_version WHERE id = $1 RETURNING id", [w.versionId]))!.id;
  const camp = await campaignRow(w, 'service');
  const r2 = new Registry();
  campaigns.register(r2);
  let arm: string | null = v2;
  r2.register(tool(obj({ agentId: uuid(), contactId: uuid() }), { name: 'experiment.assign', risk: 'read', summary: 'arm',
    run: async () => (arm ? { experimentId: 'e', arm: 'treatment', versionId: arm } : null) }));
  r2.register(tool(obj({ stackId: str(), minutes: num(), calls: num() }), { name: 'money.estimate', risk: 'read', summary: 'rate',
    run: async () => ({ perMinuteInrMilli: 2_000, totalInrMilli: 0, basis: 'test card' }) }));
  r2.register(tool(obj({ contactId: uuid(), agentId: uuid() }), { name: 'memory.brief', risk: 'read', summary: 'off',
    run: async () => ({ text: '', status: 'off' }) }));

  const a1 = await attempt(w, { campaign: camp, kind: 'campaign' });
  await tick(deps(w, NOON, { registry: r2 }));
  const t1 = rt.tickets.find(t => t.attemptId === a1)!;
  const row = await one<{ agent_version_id: string }>(pool, 'SELECT agent_version_id FROM attempt WHERE id = $1', [a1]);
  assert.equal(row!.agent_version_id, v2, 'the experiment arm decides the version and is stamped on the attempt');
  assert.equal((await one<{ agent_version_id: string }>(pool, 'SELECT agent_version_id FROM conversation WHERE id = $1', [t1.conversationId]))!.agent_version_id, v2);
  assert.equal(t1.limits.maxCostInrMilli, 5 * 2_000, 'hold sized from money.estimate: 5 min at Rs 2/min');
  assert.equal(t1.contact.memoryStatus, 'disabled');

  // No experiment: the campaign deployment's split decides, deterministically per contact.
  arm = null;
  const dep = (await one<{ id: string }>(pool, `INSERT INTO deployment (workspace_id, agent_id, binding, split) VALUES ($1,$2,'campaign',$3) RETURNING id`,
    [w.ws, w.agentId, JSON.stringify([{ version_id: v2, percent: 100 }])]))!.id;
  await pool.query('UPDATE campaign SET deployment_id = $2 WHERE id = $1', [camp, dep]);
  const a2 = await attempt(w, { campaign: camp, kind: 'campaign', contact: await addContact(w) });
  await tick(deps(w, NOON, { registry: r2 }));
  assert.equal((await one<{ agent_version_id: string }>(pool, 'SELECT agent_version_id FROM attempt WHERE id = $1', [a2]))!.agent_version_id, v2);

  const jobs = campaigns.jobs?.({ pool, registry, auth: async () => { throw new Error('no'); } }) ?? [];
  assert.deepEqual(jobs.map(j => [j.name, j.everyMs]), [['campaigns.dispatch', 2000]]);
});
