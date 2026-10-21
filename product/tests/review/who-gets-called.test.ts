// Adversarial review: who gets called (review of 2026-10-21; findings in who-gets-called.md). Every test asserts the
// SAFE behaviour and fails on the code it was written against, so each is marked todo with its finding id and CI stays
// green. When a fix lands, its test passes; drop the todo then. Skipped when DATABASE_URL is unset. Synthetic data
// only: phones in the 90000000xx range, fictional names. Every gate run is scoped to the test's own workspace.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { createPool, one, tx } from '../../server/db.ts';
import { FakeRuntime, setRuntime } from '../../server/runtime-client.ts';
import { Registry, type Actor, type ToolCtx } from '../../server/tools.ts';
import { module as campaigns } from '../../server/modules/campaigns/index.ts';
import { module as intake } from '../../server/modules/intake/index.ts';
import { applyRows } from '../../server/modules/intake/store.ts';
import { attrKey } from '../../server/modules/intake/mapping.ts';
import { minorStatus } from '../../server/modules/memory/minor.ts';
import { runGate, type AttemptRow, type GateVerdict } from '../../server/modules/campaigns/gate.ts';
import { FakeTelephony, setTelephony } from '../../server/modules/campaigns/telephony.ts';
import type { AgentConfig, CallCategory } from '../../shared/agent-config.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let registry: Registry;

const IST = (d: string, t: string) => new Date(`${d}T${t}:00+05:30`);
const TUE = '2026-10-27';                 // a Tuesday, not a holiday, before the A2P due date
const NOON = IST(TUE, '12:00');
let seq = 0;
// Synthetic 90000000xx-range numbers, spread by process so parallel files on one database do not collide.
const base = 4000 + (process.pid % 50) * 100;
const phone = () => `+91900000${String(base + (seq++ % 100)).padStart(4, '0')}`;

before(async () => {
  if (skip) return;
  pool = createPool(URL_);
  registry = new Registry();
  campaigns.register(registry);
  intake.register(registry);
  setRuntime(new FakeRuntime());
  setTelephony(new FakeTelephony());
});
after(async () => { await pool?.end(); setRuntime(null); setTelephony(null); });

function agentConfig(category: CallCategory): AgentConfig {
  return {
    schema: 1, agentId: 'a', version: 1, versionHash: 'h', brand: { name: 'Synthetic Co', spokenName: 'Synthetic', verifiedDomains: [] },
    job: 'service_follow_up', category, sectorPacks: ['base'], languages: { primary: 'hinglish', allowed: ['hinglish'], mirrorCaller: true },
    persona: { name: 'Riya', gender: 'female', register: 'warm_peer', energy: 3, humour: 1, honorific: 'aap', notes: [] },
    goals: [], neverSay: [], objections: [], tools: [], facts: [],
    opening: { disclosureClause: 'shape: one light AI clause', usefulFirst: 'shape: the due date' },
    handOff: { when: ['asks_for_human'], target: { kind: 'callback' }, warmSummary: true },
    memory: { read: true, write: false, briefMaxBytes: 1200 }, limits: { maxDurationS: 300, maxSilenceS: 10, maxTurns: 40 },
    voice: { stackId: 'v2-live' }, recording: { enabled: false, announce: false },
  };
}

interface World { ws: string; owner: string; versionId: string; category: CallCategory }

/** A verified workspace that can dial: brand with a DLT id, a wallet, a published agent version and a declared line. */
async function world(category: CallCategory = 'service'): Promise<World> {
  return tx(pool, async c => {
    const ws = (await one<{ id: string }>(c, "INSERT INTO workspace (name) VALUES ('review ws') RETURNING id"))!.id;
    const owner = (await one<{ id: string }>(c, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `owner${Math.random()}@example.test`]))!.id;
    await c.query("INSERT INTO brand (workspace_id, legal_name, dlt_entity_id) VALUES ($1, 'Synthetic Co Pvt Ltd', 'DLT-SYN-1')", [ws]);
    await c.query("INSERT INTO wallet (workspace_id, balance_inr_milli, state) VALUES ($1, 10000000, 'ok')", [ws]);
    const agentId = (await one<{ id: string }>(c, "INSERT INTO agent (workspace_id, name, status) VALUES ($1, 'Riya', 'live') RETURNING id", [ws]))!.id;
    const versionId = (await one<{ id: string }>(c, 'INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1, 1, $2, $3) RETURNING id',
      [agentId, 'hash-' + Math.random(), JSON.stringify({ agent: agentConfig(category), brief: { text: 'compiled brief', hash: 'b1', bytes: 14 } })]))!.id;
    await c.query(`INSERT INTO phone_number (workspace_id, e164, series, carrier, kyc_status, a2p_status) VALUES ($1, $2, $3, 'fake', 'verified', 'declared')`,
      [ws, phone(), category === 'promotional' ? '140' : 'ten_digit']);
    return { ws, owner, versionId, category };
  });
}

async function contact(w: World, o: { tz?: string; id?: string; e164?: string; serviceConsent?: boolean } = {}): Promise<{ id: string; e164: string }> {
  const e164 = o.e164 ?? phone();
  const id = (await one<{ id: string }>(pool, 'INSERT INTO contact (id, workspace_id, e164, name, timezone) VALUES (coalesce($4::uuid, gen_random_uuid()), $1, $2, \'Rakesh\', $3) RETURNING id',
    [w.ws, e164, o.tz ?? 'Asia/Kolkata', o.id ?? null]))!.id;
  if (o.serviceConsent !== false) await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis) VALUES ($1,$2,'service','contract')", [w.ws, id]);
  return { id, e164 };
}

async function attempt(w: World, contactId: string, category: CallCategory = w.category): Promise<string> {
  return (await one<{ id: string }>(pool, `INSERT INTO attempt (workspace_id, contact_id, kind, agent_version_id, call_category, scheduled_for)
    VALUES ($1,$2,'single',$3,$4,'2026-01-01') RETURNING id`, [w.ws, contactId, w.versionId, category]))!.id;
}

/** The gate on one attempt in its own transaction, as the worker's claim runs it. */
async function gate(id: string, now = NOON): Promise<GateVerdict> {
  return tx(pool, async c => {
    const a = await one<AttemptRow>(c, `SELECT id, workspace_id, campaign_id, contact_id, to_e164, kind, agent_version_id, call_category, facts, api_key_id, scheduled_for
      FROM attempt WHERE id = $1 FOR UPDATE`, [id]);
    return runGate(c, a!, { now });
  });
}
const code = (v: GateVerdict) => (v.allowed ? 'allowed' : v.code);
const said = (v: GateVerdict) => v.allowed ? 'allowed' : `${v.gate} ${v.code}: ${v.detail ?? ''}`;

/** Run a registered tool's body directly in a transaction, as the registry does once a call is approved. */
async function runTool(name: string, w: World, input: unknown, actor: Actor = { type: 'member', id: w.owner, role: 'owner' }): Promise<unknown> {
  const t = registry.get(name)!;
  return tx(pool, async c => t.run({ q: c, workspaceId: w.ws, actor } as ToolCtx, t.input(input)));
}

/** A promotional contact with explicit consent and a fresh "not registered" NCPR answer: the gate allows this one. */
async function promoContact(w: World, consent: Record<string, unknown> = {}): Promise<string> {
  const c = await contact(w, { serviceConsent: false });
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, evidence, created_at) VALUES ($1,$2,'promotional','consent',$3, $4)",
    [w.ws, c.id, JSON.stringify(consent), IST('2026-10-01', '10:00')]);
  await pool.query("INSERT INTO dnd_status (contact_id, ncpr_status, checked_at) VALUES ($1,'not_registered',$2)", [c.id, IST(TUE, '09:00')]);
  return c.id;
}

test('control: a consented, fresh-DND promotional contact passes the gate at noon IST', { skip }, async () => {
  const w = await world('promotional');
  assert.equal(code(await gate(await attempt(w, await promoContact(w)))), 'allowed');
});

test('WGC-01 G5 dials a promotional number whose NCPR status is "unknown" once a lookup has stamped checked_at',
  { skip, todo: 'WGC-01: an NCPR "unknown" answer passes G5 as if not registered' }, async () => {
    const w = await world('promotional');
    const c = await contact(w, { serviceConsent: false });
    await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis) VALUES ($1,$2,'promotional','consent')", [w.ws, c.id]);
    // The production DND provider is DisabledDndProvider: contact.dnd_refresh stores 'unknown' with checked_at = now().
    const r = await runTool('contact.dnd_refresh', w, { contactIds: [c.id] }) as { provider: string; unknown: number };
    assert.equal(r.provider, 'ncpr_disabled');
    assert.equal(r.unknown, 1);
    const v = await gate(await attempt(w, c.id));
    assert.notEqual(code(v), 'allowed', `an unknown DND status must hold a promotional call (got ${said(v)})`);
  });

test('WGC-02 G5 accepts a "not registered" NCPR answer of any age for a promotional call',
  { skip, todo: 'WGC-02: stale NCPR answers (older than DND_FRESH_S) are not treated as unknown at the gate' }, async () => {
    const w = await world('promotional');
    const id = await promoContact(w);
    await pool.query('UPDATE dnd_status SET checked_at = $2 WHERE contact_id = $1', [id, new Date(NOON.getTime() - 60 * 864e5)]);   // 60 days old
    const v = await gate(await attempt(w, id));
    assert.notEqual(code(v), 'allowed', `a 60-day-old DND lookup is stale (intake DND_FRESH_S = 7 days) (got ${said(v)})`);
  });

test('WGC-03 a later purpose-specific withdrawal ("promotional", granted=false) is overridden by an older "all" grant',
  { skip, todo: 'WGC-03: an older general grant outlives a newer promotional withdrawal' }, async () => {
    const w = await world('promotional');
    const c = await contact(w, { serviceConsent: false });
    await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, created_at) VALUES ($1,$2,'all','consent',$3)", [w.ws, c.id, IST('2026-09-01', '10:00')]);
    await pool.query("INSERT INTO dnd_status (contact_id, ncpr_status, checked_at) VALUES ($1,'not_registered',$2)", [c.id, IST(TUE, '09:00')]);
    // The person later withdraws promotional consent, through the approved consent tool.
    await runTool('consent.record', w, { contactId: c.id, purpose: 'promotional', basis: 'withdrawal', granted: false, source: 'email' });
    const v = await gate(await attempt(w, c.id));
    assert.notEqual(code(v), 'allowed', `the person withdrew promotional consent (got ${said(v)})`);
  });

test('WGC-04 a +91 number is dialled at 02:30 IST because the window is read only in the contact\'s imported time zone',
  { skip, todo: 'WGC-04: no IST quiet-hours floor for Indian numbers; a foreign contact.timezone moves the window' }, async () => {
    const w = await world('service');
    // Any import or CRM row with a "timezone" column sets contact.timezone (store.ts mirrors it); the number is Indian.
    const c = await contact(w, { tz: 'America/New_York' });
    const at = IST(TUE, '02:30');   // Monday 17:00 in New York: inside the service window there
    const v = await gate(await attempt(w, c.id), at);
    assert.equal(code(v), 'out_of_window', `02:30 IST is inside quiet hours for an Indian number (got ${said(v)})`);
  });

test('WGC-05 a consent expiry written the Indian way (DD/MM/YYYY) never expires',
  { skip, todo: 'WGC-05: an unparseable evidence.expiresAt is treated as no expiry (fails open)' }, async () => {
    const w = await world('promotional');
    const id = await promoContact(w, { expiresAt: '31/12/2025' });   // expired ten months before the call
    const v = await gate(await attempt(w, id));
    assert.notEqual(code(v), 'allowed', `consent expired 31/12/2025 (got ${said(v)})`);
  });

test('WGC-06 a newer withdrawal is undone by re-importing an older file that says consent=yes',
  { skip, todo: 'WGC-06: G5 orders consent by insert time, not by when it was given; a stale grant re-opens a withdrawn person' }, async () => {
    const w = await world('service');
    const c = await contact(w);
    await runTool('consent.record', w, { contactId: c.id, purpose: 'all', basis: 'withdrawal', granted: false, source: 'email' });
    assert.equal(code(await gate(await attempt(w, c.id))), 'no_basis', 'the withdrawal holds before the re-import');
    // The business re-uploads last year's list: consent "yes", given 2025-06-01, long before the withdrawal.
    await tx(pool, async q => applyRows(q, w.ws, [{ row: 1, phone: c.e164.slice(3), attrs: {}, consent: [{ granted: true, at: '2025-06-01', purpose: 'all' }] }],
      { source: { id: '00000000-0000-4000-8000-000000000000', authority: 'upload', maxAgeS: null, label: 'upload:old-list', code: 'upload' } }));
    const v = await gate(await attempt(w, c.id));
    assert.notEqual(code(v), 'allowed', `a grant stated before the withdrawal must not re-open the person (got ${said(v)})`);
  });

test('WGC-07 an erased person (suppress:false) is still dialled: the gate never reads contact.erased_at and dials the husk\'s "number"',
  { skip, todo: 'WGC-07: G2-G4 ignore erased_at; "erased:<uuid>" can normalise to a real +91 number' }, async () => {
    const w = await world('service');
    // A contact id whose only decimal digits are 9000000099 (about 1 in 5,000 random UUIDs yields some dialable 10-digit run).
    const hex = () => Array.from(randomBytes(20), b => 'abcdef'[b % 6]).join('');
    const h = hex();
    const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-9000000099ab`;
    const c = await contact(w, { id });
    const pending = await attempt(w, c.id);     // queued before the erasure
    const r = await runTool('dpdp.request.execute', w, { contactId: c.id, scope: 'erase_me', requestedBy: 'person', evidence: 'email of 2026-10-20', suppress: false }) as { surfaces: Record<string, unknown> };
    assert.equal(r.surfaces.contact, 'erased_in_place');
    const v = await gate(pending);
    assert.notEqual(code(v), 'allowed', `an erased person is never dialled (got ${said(v)}; target would be +919000000099)`);
    assert.equal((await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM attempt WHERE id = $1 AND status = 'created'", [pending]))!.n, 1,
      'the erasure also left the queued attempt in place');
  });

test('WGC-08 G12 does not count a dial whose start was never confirmed (status unknown) while its call is live',
  { skip, todo: 'WGC-08: LIVE_ATTEMPT omits status unknown, so the concurrency cap overshoots' }, async () => {
    const w = await world('service');
    await pool.query("INSERT INTO dial_policy (workspace_id, concurrency) VALUES ($1, 1) ON CONFLICT (workspace_id) DO UPDATE SET concurrency = 1", [w.ws]);
    const first = await contact(w);
    const a1 = await attempt(w, first.id);
    // The worker claimed it, the runtime's start call timed out (dispatch marks it unknown: "the request may have left"),
    // and the call is in fact up: its conversation row is still live.
    await pool.query("UPDATE attempt SET status = 'unknown', outcome_class = 'unknown', dialed_at = $2, claimed_at = $2 WHERE id = $1", [a1, new Date(NOON.getTime() - 60_000)]);
    await pool.query(`INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel, direction, status)
      VALUES ($1,$2,$3,$4,'phone','outbound','live')`, [w.ws, a1, first.id, w.versionId]);
    const v = await gate(await attempt(w, (await contact(w)).id));
    assert.equal(code(v), 'deferred_concurrency', `one line, one live call (got ${said(v)})`);
  });

test('WGC-09 the children\'s-data gate reads "Year of Birth" / "Age Group" columns as no age data at all',
  { todo: 'WGC-09: age-like headers outside the synonym list fall through to "unknown", and memory runs' }, () => {
    const now = IST(TUE, '12:00');
    assert.notEqual(minorStatus([{ key: attrKey('Year of Birth'), value: '2012' }], now), 'unknown', 'a 14-year-old by year of birth');
    assert.notEqual(minorStatus([{ key: attrKey('Birth Year'), value: '2012' }], now), 'unknown');
    assert.notEqual(minorStatus([{ key: attrKey('Age Group'), value: '13-17' }], now), 'unknown');
  });
