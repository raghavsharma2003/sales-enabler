// Campaigns: the fixed findings of the adversarial "who gets called" review (tests/review/who-gets-called.md, WGC-01 to
// WGC-08). Each test asserts the safe behaviour; each failed on the gate before its fix. Skipped when DATABASE_URL is unset.
// Synthetic data only: phones in the 90000000xx range, fictional names. Every gate run is scoped to its own workspace.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { createPool, one, tx } from '../server/db.ts';
import { FakeRuntime, setRuntime } from '../server/runtime-client.ts';
import { Registry, type Actor, type ToolCtx } from '../server/tools.ts';
import { module as campaigns } from '../server/modules/campaigns/index.ts';
import { module as intake } from '../server/modules/intake/index.ts';
import { applyRows } from '../server/modules/intake/store.ts';
import { runGate, type AttemptRow, type GateVerdict } from '../server/modules/campaigns/gate.ts';
import { FakeTelephony, setTelephony } from '../server/modules/campaigns/telephony.ts';
import type { AgentConfig, CallCategory } from '../shared/agent-config.ts';

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
    voice: { stackId: 'v2-flashlite' }, recording: { enabled: false, announce: false },
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

test('WGC-01 G5 dials a promotional number whose NCPR status is "unknown" once a lookup has stamped checked_at', { skip }, async () => {
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

test('WGC-02 G5 accepts a "not registered" NCPR answer of any age for a promotional call', { skip }, async () => {
    const w = await world('promotional');
    const id = await promoContact(w);
    await pool.query('UPDATE dnd_status SET checked_at = $2 WHERE contact_id = $1', [id, new Date(NOON.getTime() - 60 * 864e5)]);   // 60 days old
    const v = await gate(await attempt(w, id));
    assert.notEqual(code(v), 'allowed', `a 60-day-old DND lookup is stale (intake DND_FRESH_S = 7 days) (got ${said(v)})`);
  });

test('WGC-03 a later purpose-specific withdrawal ("promotional", granted=false) is overridden by an older "all" grant', { skip }, async () => {
    const w = await world('promotional');
    const c = await contact(w, { serviceConsent: false });
    await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, created_at) VALUES ($1,$2,'all','consent',$3)", [w.ws, c.id, IST('2026-09-01', '10:00')]);
    await pool.query("INSERT INTO dnd_status (contact_id, ncpr_status, checked_at) VALUES ($1,'not_registered',$2)", [c.id, IST(TUE, '09:00')]);
    // The person later withdraws promotional consent, through the approved consent tool.
    await runTool('consent.record', w, { contactId: c.id, purpose: 'promotional', basis: 'withdrawal', granted: false, source: 'email' });
    const v = await gate(await attempt(w, c.id));
    assert.notEqual(code(v), 'allowed', `the person withdrew promotional consent (got ${said(v)})`);
  });

test('WGC-04 a +91 number is dialled at 02:30 IST because the window is read only in the contact\'s imported time zone', { skip }, async () => {
    const w = await world('service');
    // Any import or CRM row with a "timezone" column sets contact.timezone (store.ts mirrors it); the number is Indian.
    const c = await contact(w, { tz: 'America/New_York' });
    const at = IST(TUE, '02:30');   // Monday 17:00 in New York: inside the service window there
    const v = await gate(await attempt(w, c.id), at);
    assert.equal(code(v), 'out_of_window', `02:30 IST is inside quiet hours for an Indian number (got ${said(v)})`);
  });

test('WGC-05 a consent expiry written the Indian way (DD/MM/YYYY) never expires', { skip }, async () => {
    const w = await world('promotional');
    const id = await promoContact(w, { expiresAt: '31/12/2025' });   // expired ten months before the call
    const v = await gate(await attempt(w, id));
    assert.notEqual(code(v), 'allowed', `consent expired 31/12/2025 (got ${said(v)})`);
  });

test('WGC-06 a newer withdrawal is undone by re-importing an older file that says consent=yes', { skip }, async () => {
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

test('WGC-07 an erased person (suppress:false) is still dialled: the gate never reads contact.erased_at and dials the husk\'s "number"', { skip }, async () => {
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
    assert.equal(code(v), 'erased');
    // Erasure cancels what is still queued for the person, through campaigns' system-only tool.
    const member = await registry.execute(pool, 'attempt.cancel_for_contact', { contactId: c.id, reason: 'erased' }, { workspaceId: w.ws, actor: { type: 'member', id: w.owner, role: 'owner' } });
    assert.equal(member.status, 'not_executed', 'a member cannot cancel by contact');
    const pending2 = await attempt(w, c.id);
    const r2 = await registry.execute<{ cancelled: number }>(pool, 'attempt.cancel_for_contact', { contactId: c.id, reason: 'erased' }, { workspaceId: w.ws, actor: { type: 'system', id: 'intake.erase' } });
    // Erasure (intake's dpdp.request.execute) cancels what was queued before it, through cancelContactAttempts; this tool
    // catches anything queued after. Counted from the receipt, so the test holds before and after intake wires it.
    const byErasure = Number((r.surfaces as Record<string, unknown>).attempts_cancelled ?? 0);
    assert.ok(byErasure === 0 || byErasure === 1);
    assert.ok(r2.status === 'confirmed' && r2.result.cancelled === 2 - byErasure, JSON.stringify({ byErasure, r2 }));
    for (const id of [pending, pending2]) assert.equal((await one<{ status: string }>(pool, 'SELECT status FROM attempt WHERE id = $1', [id]))!.status, 'cancelled');
  });

test('WGC-08 G12 does not count a dial whose start was never confirmed (status unknown) while its call is live', { skip }, async () => {
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

test('WGC-02 a stale NCPR answer defers (a refresh can unblock it); the constant matches intake', { skip }, async () => {
  const { DND_FRESH_S } = await import('../server/modules/campaigns/defaults.ts');
  const intakeContacts = await import('../server/modules/intake/contacts.ts');
  assert.equal(DND_FRESH_S, intakeContacts.DND_FRESH_S);
  const w = await world('promotional');
  const id = await promoContact(w);
  await pool.query('UPDATE dnd_status SET checked_at = $2 WHERE contact_id = $1', [id, new Date(NOON.getTime() - 8 * 864e5)]);
  const v = await gate(await attempt(w, id));
  assert.ok(!v.allowed && v.code === 'no_basis' && v.outcome === 'deferred' && /stale/.test(v.detail ?? ''), said(v));
  await pool.query('UPDATE dnd_status SET checked_at = $2 WHERE contact_id = $1', [id, IST(TUE, '11:00')]);
  assert.equal(code(await gate(await attempt(w, id))), 'allowed', 'a fresh answer unblocks it');
});

test('WGC-03 service: a newer service withdrawal beats an older "all" grant; a newer grant after a withdrawal re-opens', { skip }, async () => {
  const w = await world('service');
  const c = await contact(w, { serviceConsent: false });
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, created_at) VALUES ($1,$2,'all','contract',$3)", [w.ws, c.id, IST('2026-09-01', '10:00')]);
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, granted, created_at) VALUES ($1,$2,'service','withdrawal',false,$3)", [w.ws, c.id, IST('2026-10-01', '10:00')]);
  assert.equal(code(await gate(await attempt(w, c.id))), 'no_basis');
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, created_at) VALUES ($1,$2,'service','contract',$3)", [w.ws, c.id, IST('2026-10-15', '10:00')]);
  assert.equal(code(await gate(await attempt(w, c.id))), 'allowed', 'the person later re-consented');
});

test('WGC-04 promotional: a +91 number with a foreign zone keeps the IST band; a foreign zone can still narrow', { skip }, async () => {
  const w = await world('promotional');
  const id = await promoContact(w);
  await pool.query("UPDATE contact SET timezone = 'America/New_York' WHERE id = $1", [id]);
  // 21:30 IST is 12:00 in New York: inside the band there, outside it in IST.
  const v = await gate(await attempt(w, id), IST(TUE, '21:30'));
  assert.equal(code(v), 'out_of_window', said(v));
  // 12:00 IST is 02:30 in New York: the foreign zone narrows (refuses) too.
  assert.equal(code(await gate(await attempt(w, id), IST(TUE, '12:00'))), 'out_of_window');
  // 19:30 IST (10:00 in New York) is inside both.
  assert.equal(code(await gate(await attempt(w, id), IST(TUE, '19:30'))), 'allowed');
});

test('WGC-05 an ISO expiry in the past still expires; a missing one does not', { skip }, async () => {
  const w = await world('promotional');
  assert.equal(code(await gate(await attempt(w, await promoContact(w, { expiresAt: '2025-12-31' })))), 'consent_expired');
  assert.equal(code(await gate(await attempt(w, await promoContact(w, { expiresAt: '2027-12-31' })))), 'allowed');
  const v = await gate(await attempt(w, await promoContact(w, { expiresAt: '31/12/2027' })));
  assert.ok(!v.allowed && v.code === 'consent_expired' && /unreadable/.test(v.detail ?? ''), 'unreadable fails closed even if it looks future');
});

test('cancelContactAttempts runs on the caller\'s transaction and rolls back with it', { skip }, async () => {
  const { cancelContactAttempts } = await import('../server/modules/campaigns/index.ts');
  const w = await world('service');
  const c = await contact(w);
  const a1 = await attempt(w, c.id);
  await assert.rejects(tx(pool, async q => { assert.equal((await cancelContactAttempts(q, w.ws, c.id, 'erased')).cancelled, 1); throw new Error('erasure failed'); }));
  assert.equal((await one<{ status: string }>(pool, 'SELECT status FROM attempt WHERE id = $1', [a1]))!.status, 'created', 'rolled back with the erasure');
  const other = await world('service');
  assert.equal((await tx(pool, q => cancelContactAttempts(q, other.ws, c.id, 'erased'))).cancelled, 0, 'another workspace cancels nothing');
  assert.equal((await tx(pool, q => cancelContactAttempts(q, w.ws, c.id, 'erased'))).cancelled, 1);
});

test('consent ordering honours consent_record.effective_at when intake provides it', { skip }, async () => {
  const has = await one(pool, "SELECT 1 FROM information_schema.columns WHERE table_name = 'consent_record' AND column_name = 'effective_at'");
  if (!has) return;   // intake migration 0105 not applied in this database yet
  const w = await world('service');
  const c = await contact(w, { serviceConsent: false });
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, granted, created_at, effective_at) VALUES ($1,$2,'all','withdrawal',false,$3,$3)", [w.ws, c.id, IST('2026-10-10', '10:00')]);
  // Inserted later, but effective earlier (an undated grant placed just before the withdrawal): history, never the latest.
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, created_at, effective_at) VALUES ($1,$2,'service','contract',$3,$4)", [w.ws, c.id, IST('2026-10-20', '10:00'), IST('2026-10-10', '09:59')]);
  assert.equal(code(await gate(await attempt(w, c.id))), 'no_basis');
});

test('G5 never compares an app-clock time with a database-clock time; a withdrawal wins a near-tie (30 runs)', { skip }, async () => {
  for (let k = 0; k < 30; k++) {
    const w = await world('service');
    const c = await contact(w, { serviceConsent: false });
    // A fast app server stamps the grant 5 s in the future; the withdrawal is inserted after it.
    await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, evidence) VALUES ($1,$2,'service','contract',$3)",
      [w.ws, c.id, JSON.stringify({ statedAt: new Date(Date.now() + 5000).toISOString() })]);
    await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, granted) VALUES ($1,$2,'all','withdrawal',false)", [w.ws, c.id]);
    const v = await gate(await attempt(w, c.id));
    assert.equal(code(v), 'no_basis', `run ${k}: ${said(v)}`);
  }
  // A grant inside the 1 s margin after a withdrawal does not re-open; one clearly later does.
  const w = await world('service');
  const c = await contact(w, { serviceConsent: false });
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, granted, created_at) VALUES ($1,$2,'all','withdrawal',false,$3)", [w.ws, c.id, IST('2026-10-20', '10:00')]);
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, created_at) VALUES ($1,$2,'service','contract',$3)", [w.ws, c.id, new Date(IST('2026-10-20', '10:00').getTime() + 500)]);
  assert.equal(code(await gate(await attempt(w, c.id))), 'no_basis', 'a near-tie goes to the withdrawal');
  await pool.query("INSERT INTO consent_record (workspace_id, contact_id, purpose, basis, created_at) VALUES ($1,$2,'service','contract',$3)", [w.ws, c.id, IST('2026-10-21', '10:00')]);
  assert.equal(code(await gate(await attempt(w, c.id))), 'allowed');
});
