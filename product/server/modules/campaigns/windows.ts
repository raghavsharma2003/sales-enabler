// Calling windows in the contact's own time zone (trust-telephony M3). Pure functions, no I/O.
//
// A window policy (days + HH:MM ranges) is intersected, per local date, with the category's ceiling (promotional
// 10:00-21:00, hard), the workspace outer band (service/transactional), the RBI band for the lending pack and the
// quiet hours (22:00-07:00, absolute), then the start cutoff is taken off each end. A range that crosses midnight
// belongs to its start date: holidays and the day-of-week count on the start date.
import type { CallCategory } from '../../../shared/agent-config.ts';
import { ValidationError } from '../../../shared/validate.ts';
import {
  NATIONAL_HOLIDAYS_DATED, NATIONAL_HOLIDAYS_FIXED, OUTER_BAND_LIMIT, PROMOTIONAL_BAND, QUIET_HOURS, RBI_BAND,
  START_CUTOFF_MIN, type TimeRange, type WindowPolicy,
} from './defaults.ts';

type Iv = [number, number];   // [start, end) in minutes from the local midnight of a reference date
const DAY = 1440;

export function toMin(hhmm: string, path = ''): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new ValidationError(path, 'must be a time like 09:30');
  return Number(m[1]) * 60 + Number(m[2]);
}
const fmt = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const crossesMidnight = (r: TimeRange) => toMin(r.end) <= toMin(r.start);
/** A range as an interval on its start day; a cross-midnight range runs past 1440. */
const rangeIv = (r: TimeRange): Iv => { const s = toMin(r.start), e = toMin(r.end); return [s, e <= s ? e + DAY : e]; };
/** A same-day band (e.g. outer band) on the start day and on the next day, so cross-midnight spill is cut too. */
const band = (r: TimeRange): Iv[] => { const [s, e] = rangeIv(r); return [[s, e], [s + DAY, e + DAY]]; };

function intersect(a: Iv[], b: Iv[]): Iv[] {
  const out: Iv[] = [];
  for (const [s1, e1] of a) for (const [s2, e2] of b) { const s = Math.max(s1, s2), e = Math.min(e1, e2); if (e > s) out.push([s, e]); }
  return out.sort((x, y) => x[0] - y[0]);
}

// ---- time zones (Intl only; no library) ----

const fmts = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fmts.set(tz, f);
  }
  return f;
}
/** Throws RangeError for an unknown zone; the gate turns that into check_unavailable. */
function wall(t: number, tz: string) {
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
const offset = (t: number, tz: string) => { const w = wall(t, tz); return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(t / 1000) * 1000; };

export interface LocalNow { date: string; minutes: number; dow: number }
export function localNow(at: Date, tz: string): LocalNow {
  const w = wall(at.getTime(), tz);
  const date = `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
  return { date, minutes: w.h * 60 + w.mi, dow: isoDow(date) };
}
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function isoDow(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}
/** The instant a local wall-clock time happens; minutes may run past 1440 into the next days. */
export function localToUtc(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d) + minutes * 60_000;
  let t = guess - offset(guess, tz);
  const o2 = offset(t, tz);
  if (guess - o2 !== t) t = guess - o2;
  return new Date(t);
}

// ---- the effective window ----

export interface WindowCtx {
  category: CallCategory;
  window: WindowPolicy;
  outerBand: TimeRange;
  rbiBand: boolean;              // lending_rbi pack active on the agent
  holidays: string[];            // workspace + campaign extra dates
  cutoffMin?: number;
}

export function isHoliday(date: string, w: WindowPolicy, extra: string[]): boolean {
  if (w.nationalHolidaysOff !== false && (NATIONAL_HOLIDAYS_FIXED.includes(date.slice(5)) || NATIONAL_HOLIDAYS_DATED.includes(date))) return true;
  return (w.holidays ?? []).includes(date) || extra.includes(date);
}

/** Intervals in which an attempt may START, for attempts belonging to local date `date` (offsets from its midnight). */
export function dayIntervals(date: string, c: WindowCtx): Iv[] {
  if (!c.window.days.includes(isoDow(date)) || isHoliday(date, c.window, c.holidays)) return [];
  let iv = c.window.ranges.map(rangeIv);
  iv = intersect(iv, c.category === 'promotional' ? [rangeIv(PROMOTIONAL_BAND)] : band(c.outerBand));
  iv = intersect(iv, band({ start: QUIET_HOURS.end, end: QUIET_HOURS.start }));   // allowed = outside quiet hours
  if (c.rbiBand) iv = intersect(iv, band(RBI_BAND));
  const cut = c.cutoffMin ?? START_CUTOFF_MIN;
  return iv.map(([s, e]) => [s, e - cut] as Iv).filter(([s, e]) => e > s);
}

export type Eligibility = { ok: true } | { ok: false; nextEligibleAt: Date | null };

/** Is `at` inside the window in zone `tz`? If not, the next instant it is (null if none in 15 days). */
export function eligibility(at: Date, tz: string, c: WindowCtx): Eligibility {
  const now = localNow(at, tz);
  const all: Iv[] = [];
  for (let k = -1; k <= 15; k++) for (const [s, e] of dayIntervals(addDays(now.date, k), c)) all.push([s + k * DAY, e + k * DAY]);
  all.sort((x, y) => x[0] - y[0]);
  for (const [s, e] of all) {
    if (e <= now.minutes) continue;
    if (s <= now.minutes) return { ok: true };
    return { ok: false, nextEligibleAt: localToUtc(now.date, s, tz) };
  }
  return { ok: false, nextEligibleAt: null };
}

// ---- validation at the form and the API (422 with the rule id) ----

export interface WindowCheck { warnings: string[] }

/** Refuses what no setting may allow; warns about what the gate will clip. Throws ValidationError('<path>', '<rule>: ...'). */
export function validateWindow(category: CallCategory, w: WindowPolicy, o: { path?: string; allowCrossMidnight: boolean; outerBand: TimeRange }): WindowCheck {
  const p = o.path ?? 'window';
  const warnings: string[] = [];
  if (!Array.isArray(w.days) || !w.days.length) throw new ValidationError(`${p}.days`, 'M3.window_days: pick at least one day');
  for (const d of w.days) if (!Number.isInteger(d) || d < 1 || d > 7) throw new ValidationError(`${p}.days`, 'M3.window_days: days are 1 (Monday) to 7 (Sunday)');
  if (new Set(w.days).size !== w.days.length) throw new ValidationError(`${p}.days`, 'M3.window_days: a day is listed twice');
  if (!w.ranges.length) throw new ValidationError(`${p}.ranges`, 'M3.window_ranges: add at least one time range');
  for (const d of w.holidays ?? []) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ValidationError(`${p}.holidays`, 'M3.holidays: dates are YYYY-MM-DD');
  const promo = rangeIv(PROMOTIONAL_BAND);
  w.ranges.forEach((r, i) => {
    const rp = `${p}.ranges[${i}]`;
    const s = toMin(r.start, `${rp}.start`), e = toMin(r.end, `${rp}.end`);
    if (s === e) throw new ValidationError(rp, 'M3.window_ranges: start and end are the same time');
    const cross = e < s;
    if (category === 'promotional') {
      if (cross) throw new ValidationError(rp, 'M3.promotional_cross_midnight: a promotional window cannot cross midnight');
      if (s < promo[0] || e > promo[1]) throw new ValidationError(rp, `M3.promotional_band: promotional calls only between ${PROMOTIONAL_BAND.start} and ${PROMOTIONAL_BAND.end} (RS-15); no role can widen it`);
      return;
    }
    if (cross) {
      if (!o.allowCrossMidnight) throw new ValidationError(rp, 'M3.cross_midnight_role: a window across midnight is set by Compliance (policy.window.set) with a reason');
      if (!w.crossMidnightReason?.trim()) throw new ValidationError(`${p}.crossMidnightReason`, 'M3.cross_midnight_reason: say why this window crosses midnight');
      warnings.push(`${r.start}-${r.end} crosses midnight: caps and holidays count on the start date, and quiet hours ${QUIET_HOURS.start}-${QUIET_HOURS.end} still stop every dial`);
    }
    const ob = rangeIv(o.outerBand);
    const [rs, re] = rangeIv(r);
    if (rs < ob[0] || re > ob[1]) warnings.push(`${r.start}-${r.end} runs outside the workspace band ${o.outerBand.start}-${o.outerBand.end}; dials happen only inside it`);
  });
  return { warnings };
}

export function validateOuterBand(b: TimeRange, path = 'outerBand'): void {
  const s = toMin(b.start, `${path}.start`), e = toMin(b.end, `${path}.end`);
  const [ls, le] = rangeIv(OUTER_BAND_LIMIT);
  if (e <= s) throw new ValidationError(path, 'M3.outer_band: the outer band cannot cross midnight');
  if (s < ls || e > le) throw new ValidationError(path, `M3.outer_band: the outer band stays inside ${OUTER_BAND_LIMIT.start}-${OUTER_BAND_LIMIT.end} (quiet hours)`);
}

/** True when `next` allows nothing `cur` does not: same or fewer days, ranges inside, at least the same holidays. */
export function isNarrowing(cur: WindowPolicy, next: WindowPolicy): boolean {
  if (!next.days.every(d => cur.days.includes(d))) return false;
  if (cur.nationalHolidaysOff !== false && next.nationalHolidaysOff === false) return false;
  if (!(cur.holidays ?? []).every(h => (next.holidays ?? []).includes(h))) return false;
  const curIv = cur.ranges.map(rangeIv);
  return next.ranges.map(rangeIv).every(([s, e]) => curIv.some(([cs, ce]) => s >= cs && e <= ce));
}

export const describeWindow = (w: WindowPolicy) => `${w.ranges.map(r => `${r.start}-${r.end}`).join(', ')} on days ${w.days.join(',')}`;
export { fmt as formatMinutes };
