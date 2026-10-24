// BLIND-BR2 attribution spy, loaded with `node --import tsx --import <this> product/scripts/judge-eval.mjs ...`.
// Passive: it wraps globalThis.fetch, passes every request and response through unchanged, and for each
// chat-completions call appends ONE line to $VP_FETCH_SPY_OUT with: the call index, sha256_16 of the user message, the
// FIELD PATHS the brief listed (no text, no key values, no context line), HTTP status, wall ms, and the model's
// findings as {field, kind, confidence} (the reason strings are dropped: they can quote brief text). Token requests and
// every other URL pass straight through and are not logged. Headers are never read. judge-eval's own verdicts are not
// touched: this only lets each counted finding be attributed to the item's field or a template field after scoring.
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const OUT = process.env.VP_FETCH_SPY_OUT;
if (!OUT) throw new Error('VP_FETCH_SPY_OUT is not set');
const orig = globalThis.fetch;
let n = 0;
const write = rec => appendFileSync(OUT, JSON.stringify(rec) + '\n');
globalThis.fetch = async function spyFetch(url, init) {
  const u = typeof url === 'string' ? url : url instanceof URL ? url.href : url?.url ?? '';
  if (!/\/chat\/completions(\?|$)/.test(u)) return orig.call(this, url, init);
  const rec = { i: n++, t: new Date().toISOString() };
  try {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
    const user = (body.messages ?? []).find(m => m.role === 'user')?.content ?? '';
    rec.user_sha16 = createHash('sha256').update(user).digest('hex').slice(0, 16);
    const brief = (/<<<BRIEF\n([\s\S]*?)\nBRIEF>>>/.exec(user) || [])[1] ?? '';
    rec.paths = brief.split('\n').map(l => (/^\d+\. (\S+?)(?: \(key: [^)]*\))?: /.exec(l) || [])[1]).filter(Boolean);
  } catch { rec.body_unreadable = true; }
  const t0 = performance.now();
  let res;
  try { res = await orig.call(this, url, init); }
  catch (e) { rec.ms = Math.round(performance.now() - t0); rec.error = e?.name ?? 'error'; write(rec); throw e; }
  rec.status = res.status; rec.ms_headers = Math.round(performance.now() - t0);
  res.clone().text().then(t => {
    try {
      const content = JSON.parse(t)?.choices?.[0]?.message?.content ?? '';
      const j = JSON.parse(String(content).trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
      rec.findings = Array.isArray(j?.findings) ? j.findings.map(f => ({ field: f?.field, kind: f?.kind, confidence: f?.confidence })) : null;
    } catch { rec.findings = null; rec.unparsed = true; }
    write(rec);
  }, e => { rec.read_error = e?.name ?? 'error'; write(rec); });
  return res;
};
