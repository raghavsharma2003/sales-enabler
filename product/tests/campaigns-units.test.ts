// Campaigns: pure pieces (windows in local time, validation rule ids, the series router, the telephony seam).
// No database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../shared/validate.ts';
import { DEFAULT_OUTER_BAND, type WindowPolicy } from '../server/modules/campaigns/defaults.ts';
import { FakeTelephony, PlivoTelephony, routeSeries, TelephonyDisabled } from '../server/modules/campaigns/telephony.ts';
import { dayIntervals, eligibility, isNarrowing, localNow, localToUtc, validateWindow, type WindowCtx } from '../server/modules/campaigns/windows.ts';
import { ticketFacts } from '../server/modules/campaigns/worker.ts';
import { suppressionSource } from '../server/modules/campaigns/gate.ts';

const IST = (d: string, t: string) => new Date(`${d}T${t}:00+05:30`);
const TUE = '2026-10-27';
const ALL: number[] = [1, 2, 3, 4, 5, 6, 7];
const ctx = (category: WindowCtx['category'], w: WindowPolicy, o: Partial<WindowCtx> = {}): WindowCtx =>
  ({ category, window: w, outerBand: DEFAULT_OUTER_BAND, rbiBand: false, holidays: [], ...o });
const ruleOf = (fn: () => unknown) => { try { fn(); } catch (e) { if (e instanceof ValidationError) return e.message; throw e; } return 'no error'; };

test('local time: IST and a zone with daylight saving round-trip', () => {
  assert.equal(localToUtc(TUE, 9 * 60 + 30, 'Asia/Kolkata').toISOString(), '2026-10-27T04:00:00.000Z');
  assert.deepEqual(localNow(IST(TUE, '09:30'), 'Asia/Kolkata'), { date: TUE, minutes: 570, dow: 2 });
  // New York is UTC-4 before 2026-11-01 and UTC-5 after.
  assert.equal(localToUtc('2026-10-27', 600, 'America/New_York').toISOString(), '2026-10-27T14:00:00.000Z');
  assert.equal(localToUtc('2026-11-03', 600, 'America/New_York').toISOString(), '2026-11-03T15:00:00.000Z');
  assert.throws(() => localNow(new Date(), 'Mars/Olympus'), RangeError);
});

test('promotional at 09:30 and 21:30 is outside; at 12:00 inside; the next start is 10:00', () => {
  const w: WindowPolicy = { days: ALL, ranges: [{ start: '09:00', end: '22:00' }] };   // stored past the form: the ceiling still holds
  const c = ctx('promotional', w);
  const at930 = eligibility(IST(TUE, '09:30'), 'Asia/Kolkata', c);
  assert.equal(at930.ok, false);
  assert.equal(!at930.ok && at930.nextEligibleAt?.toISOString(), IST(TUE, '10:00').toISOString());
  assert.equal(eligibility(IST(TUE, '21:30'), 'Asia/Kolkata', c).ok, false);
  assert.equal(eligibility(IST(TUE, '12:00'), 'Asia/Kolkata', c).ok, true);
  assert.equal(eligibility(IST(TUE, '20:55'), 'Asia/Kolkata', c).ok, false, 'start cutoff: no new attempt in the last 8 minutes');
});

test('service at 09:30 is allowed when the window says so; quiet hours always win', () => {
  const c = ctx('service', { days: ALL, ranges: [{ start: '09:00', end: '19:00' }] });
  assert.equal(eligibility(IST(TUE, '09:30'), 'Asia/Kolkata', c).ok, true);
  const wide = ctx('service', { days: ALL, ranges: [{ start: '05:00', end: '23:30' }] }, { outerBand: { start: '07:00', end: '22:00' } });
  assert.equal(eligibility(IST(TUE, '06:30'), 'Asia/Kolkata', wide).ok, false);
  assert.equal(eligibility(IST(TUE, '22:10'), 'Asia/Kolkata', wide).ok, false);
  assert.equal(eligibility(IST(TUE, '07:05'), 'Asia/Kolkata', wide).ok, true);
});

test('the window is read in the contact\'s own zone', () => {
  const c = ctx('service', { days: ALL, ranges: [{ start: '10:00', end: '19:00' }] });
  // 11:00 IST is 09:30 in Dubai: too early there.
  assert.equal(eligibility(IST(TUE, '11:00'), 'Asia/Kolkata', c).ok, true);
  const d = eligibility(IST(TUE, '11:00'), 'Asia/Dubai', c);
  assert.equal(d.ok, false);
  assert.equal(!d.ok && d.nextEligibleAt?.toISOString(), '2026-10-27T06:00:00.000Z');
});

test('cross-midnight: the start date owns holidays; quiet hours clip the spill; the next start is tomorrow evening', () => {
  const w: WindowPolicy = { days: ALL, ranges: [{ start: '20:00', end: '01:00' }], crossMidnightReason: 'night-shift workers asked for evening calls' };
  const c = ctx('service', w, { outerBand: { start: '07:00', end: '22:00' } });
  assert.deepEqual(dayIntervals(TUE, c), [[1200, 1312]], '20:00 to 22:00 minus the cutoff');
  assert.equal(eligibility(IST(TUE, '21:30'), 'Asia/Kolkata', c).ok, true);
  const late = eligibility(IST(TUE, '23:30'), 'Asia/Kolkata', c);
  assert.equal(late.ok, false);
  assert.equal(!late.ok && late.nextEligibleAt?.toISOString(), IST('2026-10-28', '20:00').toISOString());
  assert.deepEqual(dayIntervals('2026-11-08', c), [], 'Diwali is off by default');
  assert.equal(eligibility(IST('2026-11-08', '20:30'), 'Asia/Kolkata', c).ok, false);
});

test('RBI lending band and day-of-week', () => {
  const c = ctx('service', { days: [1, 2, 3, 4, 5, 6], ranges: [{ start: '08:00', end: '21:00' }] }, { rbiBand: true });
  assert.equal(eligibility(IST(TUE, '19:30'), 'Asia/Kolkata', c).ok, false);
  assert.equal(eligibility(IST(TUE, '08:30'), 'Asia/Kolkata', c).ok, true);
  assert.deepEqual(dayIntervals('2026-11-01', c), [], 'Sunday is not in the days');
});

test('form validation names the rule id', () => {
  const v = (cat: 'service' | 'promotional', w: WindowPolicy, allow = false) => ruleOf(() => validateWindow(cat, w, { allowCrossMidnight: allow, outerBand: DEFAULT_OUTER_BAND }));
  assert.match(v('promotional', { days: ALL, ranges: [{ start: '09:30', end: '20:00' }] }), /M3\.promotional_band/);
  assert.match(v('promotional', { days: ALL, ranges: [{ start: '10:00', end: '21:30' }] }), /M3\.promotional_band/);
  assert.match(v('promotional', { days: ALL, ranges: [{ start: '20:00', end: '01:00' }], crossMidnightReason: 'x' }, true), /M3\.promotional_cross_midnight/);
  assert.match(v('service', { days: ALL, ranges: [{ start: '20:00', end: '01:00' }] }), /M3\.cross_midnight_role/);
  assert.match(v('service', { days: ALL, ranges: [{ start: '20:00', end: '01:00' }] }, true), /M3\.cross_midnight_reason/);
  assert.equal(v('service', { days: ALL, ranges: [{ start: '09:30', end: '19:00' }] }), 'no error');
  const ok = validateWindow('service', { days: ALL, ranges: [{ start: '20:00', end: '01:00' }], crossMidnightReason: 'evening shift' }, { allowCrossMidnight: true, outerBand: DEFAULT_OUTER_BAND });
  assert.ok(ok.warnings.some(w => /crosses midnight/.test(w)), 'accepted with a warning');
});

test('narrowing is a strict subset', () => {
  const cur: WindowPolicy = { days: [1, 2, 3, 4, 5], ranges: [{ start: '10:00', end: '19:00' }] };
  assert.equal(isNarrowing(cur, { days: [1, 2], ranges: [{ start: '11:00', end: '18:00' }] }), true);
  assert.equal(isNarrowing(cur, { days: [1, 6], ranges: [{ start: '11:00', end: '18:00' }] }), false);
  assert.equal(isNarrowing(cur, { days: [1], ranges: [{ start: '09:00', end: '18:00' }] }), false);
  assert.equal(isNarrowing(cur, { days: [1], ranges: [{ start: '11:00', end: '18:00' }], nationalHolidaysOff: false }), false);
});

test('series router: category first, then the regulator, then the sector', () => {
  assert.equal(routeSeries({ category: 'promotional', sectorPacks: [] }).series, '140');
  assert.equal(routeSeries({ category: 'service', sectorPacks: ['insurance_irdai'] }).series, '1600');
  assert.equal(routeSeries({ category: 'transactional', sectorPacks: ['lending_rbi'] }).series, '1600');
  assert.equal(routeSeries({ category: 'service', sectorPacks: ['base'], workspaceSector: 'logistics' }).series, '1601');
  assert.equal(routeSeries({ category: 'service', sectorPacks: ['healthcare'] }).series, 'ten_digit');
  assert.deepEqual(routeSeries({ category: 'service', sectorPacks: [], test: true }).alsoAllowed, ['trial']);
});

test('ticket facts: declared per-contact facts only, offers fenced out of service calls', () => {
  const facts = [
    { key: 'due_date', value: '', purpose: 'service' as const, source: 'contact.attribute', perContact: true },
    { key: 'upgrade', value: '', purpose: 'offer' as const, source: 'contact.attribute', perContact: true },
    { key: 'office', value: 'MG Road', purpose: 'logistics' as const, source: 'agent.form' },
  ];
  assert.deepEqual(ticketFacts(facts, 'service', { due_date: '5 Nov' }, { upgrade: 'gold', secret: 'x' }), { due_date: '5 Nov' });
  assert.deepEqual(ticketFacts(facts, 'promotional', {}, { due_date: '5 Nov', upgrade: 'gold' }), { due_date: '5 Nov', upgrade: 'gold' });
});

test('telephony: the fake never charges; the real adapter refuses unless switched on', async () => {
  const f = new FakeTelephony();
  const offers = await f.search({ series: '1600', limit: 3 });
  assert.equal(offers.length, 3);
  assert.ok(offers.every(o => /^\+9190000000\d\d$/.test(o.e164) && o.series === '1600'));
  const saved = process.env.VP_TELEPHONY_LIVE;
  delete process.env.VP_TELEPHONY_LIVE;
  await assert.rejects(new PlivoTelephony().search({ limit: 1 }), TelephonyDisabled);
  await assert.rejects(new PlivoTelephony().rent('x'), TelephonyDisabled);
  if (saved !== undefined) process.env.VP_TELEPHONY_LIVE = saved;
});

test('G4 codes carry a stable source class, never an instance id', () => {
  assert.equal(suppressionSource('call:7f0c2a9e-0000-4000-8000-000000000000'), 'in_call');
  assert.equal(suppressionSource('in_call'), 'in_call');
  assert.equal(suppressionSource('import:abc'), 'import');
  assert.equal(suppressionSource(null), 'workspace');
});
