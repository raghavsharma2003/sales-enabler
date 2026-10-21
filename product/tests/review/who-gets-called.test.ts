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

// WGC-01 to WGC-08 are fixed; their tests now run in tests/campaigns-review.test.ts.

test('WGC-09 the children\'s-data gate reads "Year of Birth" / "Age Group" columns as no age data at all',
  { todo: 'WGC-09: age-like headers outside the synonym list fall through to "unknown", and memory runs' }, () => {
    const now = IST(TUE, '12:00');
    assert.notEqual(minorStatus([{ key: attrKey('Year of Birth'), value: '2012' }], now), 'unknown', 'a 14-year-old by year of birth');
    assert.notEqual(minorStatus([{ key: attrKey('Birth Year'), value: '2012' }], now), 'unknown');
    assert.notEqual(minorStatus([{ key: attrKey('Age Group'), value: '13-17' }], now), 'unknown');
  });
