// The client event log's browser half (owner directive 2026-10-24, "the log of everything"). The server half is the workspace
// builder's POST /v1/client-events; this sends their agreed shape: { session, events: [{ at, kind, page, name, detail }] },
// at most 100 events a batch, detail flat (string, number or boolean values, at most 20 keys). What it records:
// - view: the app loaded (detail.build: the hash of the code that ran, on the first event of the tab; detail.ms);
// - nav: a page change (detail.from);
// - error: uncaught errors and unhandled rejections (name = the message; detail.type, source, line, stack, and React's
//   componentStack from the page boundary);
// - action / result: every act() started, and its outcome (detail.status); a failed read or route (status failed, the
//   HTTP code and the server's code);
// - perf: anything timed (a test call's length).
// Argument values are never sent. Phones and emails are masked here before anything leaves the browser (the server masks
// again). Nothing is recorded before sign-in.
export type Kind = 'view' | 'nav' | 'error' | 'action' | 'result' | 'perf';
type Detail = Record<string, string | number | boolean | undefined>;
interface Ev { at: string; kind: Kind; page: string; name?: string; detail?: Record<string, string | number | boolean> }

const SESSION = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
const BATCH = 100, MAX_QUEUE = 300, FLUSH_MS = 5000, MAX_BODY = 60_000;
let queue: Ev[] = [], timer: ReturnType<typeof setTimeout> | null = null, on = false, first = true;

/** Emails become [email]; a phone number keeps only its last four digits; a date is not a phone. */
export const scrub = (s: string) => s
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
  .replace(/(?<![\w-])(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){7,12}\d(?![\w-])/g, m => (/^\d{4}-\d{2}-\d{2}$/.test(m) ? m : `•••••${m.replace(/\D/g, '').slice(-4)}`));
/** The hash in the entry script's file name (main-ABC123.js): ties a report to the build that ran. */
const build = () => /main-([A-Z0-9]+)\.js/.exec((document.querySelector('script[type="module"][src*="/assets/main-"]') as HTMLScriptElement | null)?.src ?? '')?.[1] ?? 'dev';

export function record(kind: Kind, name?: string, detail: Detail = {}) {
  if (!on) return;
  const d: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(detail).slice(0, 19)) {
    if (v === undefined) continue;
    d[k] = typeof v === 'string' ? scrub(v).slice(0, /stack/i.test(k) ? 2000 : 300) : v;
  }
  if (first) { d.build = build(); first = false; }
  queue.push({ at: new Date().toISOString(), kind, page: scrub(location.pathname + location.search).slice(0, 300), ...(name ? { name: scrub(name).slice(0, 200) } : {}), detail: d });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (queue.length >= BATCH) flush(); else if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

export function flush(leaving = false) {
  if (timer) { clearTimeout(timer); timer = null; }
  while (queue.length) {
    let n = Math.min(BATCH, queue.length), body = '';
    for (; n > 0; n = Math.floor(n / 2)) { body = JSON.stringify({ session: SESSION, events: queue.slice(0, n) }); if (body.length <= MAX_BODY) break; }
    if (n === 0) { queue.shift(); continue; }   // one event too large to send: dropped, never retried forever
    queue.splice(0, n);
    if (leaving && navigator.sendBeacon) navigator.sendBeacon('/v1/client-events', new Blob([body], { type: 'application/json' }));
    else void fetch('/v1/client-events', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }
}

let wired = false;
/** Recording runs while someone is signed in; signing out stops it and drops anything unsent. */
export function startBeacon(signedIn: boolean) {
  on = signedIn;
  if (!signedIn) { queue = []; return; }
  if (wired) return;
  wired = true;
  record('view', 'app loaded', { ms: Math.round(performance.now()) });
  addEventListener('error', e => record('error', e.message || e.error?.name || 'Error', { type: e.error?.name, source: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack }));
  addEventListener('unhandledrejection', e => {
    const r = e.reason as { name?: string; message?: string; stack?: string } | undefined;
    record('error', r?.message ?? String(e.reason), { type: r?.name ?? 'Rejection', stack: r?.stack });
  });
  addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
}
