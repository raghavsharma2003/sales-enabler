// Money, blueprint decision 10 ("one honest price per connected second"): carriers bill whole pulses from answer. Every
// estimate, stack card and the Billing statement states the pulse and what it adds per call; the all-in rupees per minute
// use pulse-rounded seconds; a carrier path over 30 s is marked "not recommended", never blocked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createPool, one } from '../server/db.ts';
import { Registry } from '../server/tools.ts';
import { register as registerMoney } from '../server/modules/money/index.ts';
import { module as agents } from '../server/modules/agents/index.ts';
import { module as campaigns } from '../server/modules/campaigns/index.ts';
import { FakeTelephony, setTelephony } from '../server/modules/campaigns/telephony.ts';
import { CARRIERS, DEFAULT_CARRIER, callTelephonyMicro, carrierChoice, pulseRoundedSeconds, pulseView } from '../server/modules/money/carriers.ts';
import { estimate } from '../server/modules/money/money.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let reg: Registry;
before(async () => { if (skip) return; pool = createPool(URL_); reg = new Registry(); registerMoney(reg); agents.register(reg); campaigns.register(reg); });
after(async () => { await pool?.end(); setTelephony(null); });

// ---------------------------------------------------------------- rounding

test('pulse rounding: 1 s, 59 s, 61 s and 119 s calls on a 30 s and a 60 s pulse', () => {
  assert.deepEqual([1, 59, 61, 119].map(s => pulseRoundedSeconds(s, 30)), [30, 60, 90, 120]);
  assert.deepEqual([1, 59, 61, 119].map(s => pulseRoundedSeconds(s, 60)), [60, 60, 120, 120]);
  assert.equal(pulseRoundedSeconds(0, 30), 0, 'a call never connected is not billed');
  assert.equal(pulseRoundedSeconds(60, 30), 60, 'an exact multiple is not rounded up');
  // ₹0.38/min: 30 s = ₹0.19
  const p30 = { outboundInrPerMin: 0.38, pulseSec: 30 }, p60 = { outboundInrPerMin: 0.38, pulseSec: 60 };
  assert.deepEqual([1, 59, 61, 119].map(s => callTelephonyMicro(s, p30)), [190_000, 380_000, 570_000, 760_000]);
  assert.deepEqual([1, 59, 61, 119].map(s => callTelephonyMicro(s, p60)), [380_000, 380_000, 760_000, 760_000]);
});

// ---------------------------------------------------------------- the carrier table is sourced

test('every stated pulse is on a saved carrier page; the rest read "not published"', () => {
  const dir = fileURLToPath(new URL('../../research/2026-10-24/carrier-pulse/', import.meta.url));
  const sources = JSON.parse(readFileSync(dir + 'sources.json', 'utf8')) as { url: string; file: string | null; fetched: string }[];
  const byUrl = new Map(sources.map(s => [s.url, s]));
  for (const c of CARRIERS) {
    for (const u of c.urls) assert.ok(byUrl.get(u)?.file, `${c.id}: ${u} is not saved`);
    const text = c.urls.map(u => readFileSync(dir + byUrl.get(u)!.file!, 'utf8')).join('\n');
    if (c.pulseSec !== null) {
      assert.ok(text.includes(`Pulse is ${c.pulseSec} seconds`), `${c.id}: the ${c.pulseSec} s pulse is not on its page`);
      assert.ok(text.includes(`standard **${c.pulseSec}/${c.pulseSec}**`), `${c.id}: the billing-concepts page does not state ${c.pulseSec}/${c.pulseSec}`);
    } else assert.equal(pulseView(c).text, `${c.label}: billing pulse not published.`);
    if (c.outboundInrPerMin !== null) assert.ok(text.includes(`₹${c.outboundInrPerMin.toFixed(2)}/min`), `${c.id}: rate not on its page`);
  }
  assert.equal(DEFAULT_CARRIER.id, 'plivo');
  assert.equal(DEFAULT_CARRIER.pulseSec, 30);
  assert.match(DEFAULT_CARRIER.conflict ?? '', /60-second pulse.*first invoice/);
});

test('carrier choice marks a pulse over 30 s "not recommended", without blocking it', { skip }, async () => {
  const sixty = carrierChoice({ ...DEFAULT_CARRIER, id: 'example-60', label: 'Example carrier', pulseSec: 60 });
  assert.equal(sixty.recommended, false);
  assert.equal(sixty.status, 'not recommended: 60-second billing');
  assert.equal(sixty.pulse, '60-second pulse: about ₹0.19 per call on top (not recommended: 60-second billing)');
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('pulse (synthetic)') RETURNING id"))!.id;
  const r = await reg.execute<any>(pool, 'money.carriers', {}, { workspaceId: ws, actor: { type: 'system' } });
  if (r.status !== 'confirmed') return assert.fail('expected the carrier list');
  const plivo = r.result.carriers.find((c: any) => c.id === 'plivo');
  assert.deepEqual([plivo.pulseSec, plivo.recommended, plivo.status], [30, true, 'recommended']);
  assert.equal(plivo.pulse, '30-second pulse: about ₹0.10 per call on top');
  assert.ok(r.result.carriers.filter((c: any) => c.id !== 'plivo').every((c: any) => c.status === 'pulse not published'));
});

// ---------------------------------------------------------------- the estimate, by hand

test('estimate: the all-in ₹ per minute uses pulse-rounded seconds, matching hand-computed values', { skip }, async () => {
  // v2-flashlite (shared/stacks.ts): Azure ears gated, Gemini 3.5 Flash-Lite, Gemini 3.8 Flash-Lite voice. Per minute (₹):
  //   ears 1/60 $/min x 0.5 x 95 = 0.791667; brain 4 x (2000 x 0.30 + 60 x 2.50)/1e6 x 95 = 0.285; voice 6 $/1M x 25 x 30 / 1e6 x 95 = 0.4275;
  //   telephony 0.38; platform 0.03; analysis 0.06  =>  1.974167 per connected minute.
  const flat = await estimate(pool, { stackId: 'v2-flashlite', minutes: 1, calls: 0 });
  assert.equal(flat.perMinuteInrMilli, 1974);
  // 10 minutes over 10 calls: 60 s each, already whole pulses => 19.74167
  const even = await estimate(pool, { stackId: 'v2-flashlite', minutes: 10, calls: 10 });
  assert.deepEqual([even.totalInrMilli, even.perMinuteInrMilli, even.pulse.billedSecondsPerCall, even.pulse.roundingInrMilli], [19_742, 1974, 60, 0]);
  // 10 minutes over 8 calls: 75 s each, billed 90 s => phone time 12 min, not 10:
  //   (1.974167 - 0.38) x 10 + 0.38 x 12 = 15.94167 + 4.56 = 20.50167; per connected minute 2.050167
  const odd = await estimate(pool, { stackId: 'v2-flashlite', minutes: 10, calls: 8 });
  assert.deepEqual([odd.totalInrMilli, odd.perMinuteInrMilli, odd.pulse.connectedSecondsPerCall, odd.pulse.billedSecondsPerCall, odd.pulse.roundingInrMilli],
    [20_502, 2050, 75, 90, 760]);
  // one 61 s call: (1.974167 - 0.38) x 61/60 + 0.38 x 90/60 = 1.620736 + 0.57 = 2.190736
  const one61 = await estimate(pool, { stackId: 'v2-flashlite', minutes: 61 / 60, calls: 1 });
  assert.equal(one61.totalInrMilli, 2191);
  assert.equal(one61.display.pulse, '30-second pulse: about ₹0.10 per call on top');
  assert.match(one61.basis, /whole 30-second pulses/);
});

// ---------------------------------------------------------------- every surface says it

test('stack cards and the Billing statement state the pulse', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('pulse cards (synthetic)') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `p${Math.random()}@example.test`]))!.id;
  const as = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
  const list = await reg.execute<any>(pool, 'stack.list', {}, as);
  if (list.status !== 'confirmed') return assert.fail('expected stacks');
  for (const s of list.result.stacks) {
    if (s.pricePerMinute?.grade !== 'computed') continue;
    assert.match(s.pricePerMinute.value, /30-second pulse: about ₹0\.10 per call on top/, s.id);
  }
  assert.ok(list.result.stacks.some((s: any) => s.pricePerMinute?.grade === 'computed'), 'at least one priced card');
  const st = await reg.execute<any>(pool, 'invoice.get', {}, as);
  if (st.status !== 'confirmed') return assert.fail('expected a statement');
  assert.match(st.result.note, /Phone time is billed by Plivo India in whole pulses \(30-second pulse: about ₹0\.10 per call on top\)/);
  assert.equal(st.result.pulse.pulseSec, 30);
});

test('renting a line records its carrier\'s billing pulse', { skip }, async () => {
  class PlivoLike extends FakeTelephony { override readonly name = 'plivo' as never; }
  setTelephony(new PlivoLike());
  try {
    const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('pulse rent (synthetic)') RETURNING id"))!.id;
    const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `r${Math.random()}@example.test`]))!.id;
    await pool.query('INSERT INTO wallet (workspace_id, balance_inr_milli) VALUES ($1, 1000000) ON CONFLICT (workspace_id) DO UPDATE SET balance_inr_milli = 1000000', [ws]);
    const search = await reg.execute<any>(pool, 'number.search', { series: 'ten_digit' }, { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } });
    assert.equal(search.status === 'confirmed' && search.result.carrier.status, 'recommended');
    const card = await reg.execute(pool, 'number.rent', { offerRef: 'fake:ten_digit:0' }, { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } });
    if (card.status !== 'needs_approval') return assert.fail('expected a card');
    const a = await reg.approve(pool, card.actionId, { workspaceId: ws, memberId: owner });
    assert.equal(a.status, 'confirmed', JSON.stringify(a));
    const row = await one<{ p: number | null }>(pool, 'SELECT billing_pulse_s AS p FROM phone_number WHERE workspace_id = $1', [ws]);
    assert.equal(row!.p, 30);
  } finally { setTelephony(null); }
});
