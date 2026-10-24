// Indian money, time and counts. Money is integer milli-rupees (shared/money.ts); never floats in transit.
import { formatInr } from '../../shared/money.ts';

export const inr = (milli: number | null | undefined, opts: { paise?: boolean } = {}): string =>
  milli == null ? '—' : formatInr(milli, opts);

/** "₹1,284 of ₹5,600" style pair. */
export const inrOf = (a: number, b: number) => `${inr(a)} of ${inr(b)}`;

/** Whole-number count with Indian grouping: 1,24,500. */
export function count(n: number | null | undefined): string {
  if (n == null) return '—';
  const neg = n < 0; const s = String(Math.abs(Math.round(n)));
  const last3 = s.slice(-3), rest = s.slice(0, -3);
  return (neg ? '-' : '') + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3);
}

export function pct(n: number | null | undefined, digits = 0): string {
  return n == null ? '—' : `${(n * 100).toFixed(digits)}%`;
}

/** Latency: ms below 10 s ("1,480 ms"), seconds above. */
export function ms(v: number | null | undefined): string {
  if (v == null) return '—';
  return v < 10_000 ? `${count(v)} ms` : `${(v / 1000).toFixed(1)} s`;
}

/** Durations as "2 m 41 s". */
export function dur(s: number | null | undefined): string {
  if (s == null) return '—';
  s = Math.round(s);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m} m ${r} s` : `${m} m`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} m`;
}

export function clock(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const IST = 'Asia/Kolkata';
export function time(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST }) + ' IST';
}
export function date(iso: string | Date | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: IST });
  return withTime ? `${day}, ${time(d)}` : day;
}
export function ago(iso: string | Date | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
/** E.164 +919000000012 -> "+91 90000 00012". */
export function phone(e164: string | null | undefined): string {
  if (!e164) return '—';
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
export const plural = (n: number, one: string, many = one + 's') => `${count(n)} ${n === 1 ? one : many}`;
/** A file size in plain units: "820 KB", "14.3 MB". */
export function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
