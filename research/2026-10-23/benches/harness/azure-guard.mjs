// Bench harness guard, loaded with `node --import <this file>` (scratch; not product code).
// For every request to the configured model endpoint (VP_LLM_DEFAULT_URL), it:
//   - paces globally: at least BENCH_MIN_GAP_MS between request starts, and a sliding 60 s window of Azure's own
//     rate-limit estimate (body chars / 4 + max_completion_tokens) kept under BENCH_TPM;
//   - retries a 429 up to 5 times after retry-after (quota is the harness's problem, not the model's);
//   - records usage from the response (JSON or SSE stream) to BENCH_LEDGER (jsonl: deployment, served model, tokens,
//     INR; never a URL or key);
//   - refuses a request whose worst case would pass BENCH_CAP_INR for this run or BENCH_GLOBAL_CAP_INR across the ledger.
// Prices: BENCH_PRICES = {"<deployment>": [inr_per_1M_in, inr_per_1M_out]}.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const target = process.env.VP_LLM_DEFAULT_URL;
const LEDGER = process.env.BENCH_LEDGER;
const RUN = process.env.BENCH_RUN ?? 'run';
const CAP = Number(process.env.BENCH_CAP_INR ?? 0);
const GCAP = Number(process.env.BENCH_GLOBAL_CAP_INR ?? 0);
const GAP = Number(process.env.BENCH_MIN_GAP_MS ?? 1000);
const TPM = Number(process.env.BENCH_TPM ?? 0);
const PRICES = JSON.parse(process.env.BENCH_PRICES ?? '{}');

const before = LEDGER && existsSync(LEDGER)
  ? readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).reduce((a, l) => { try { return a + (JSON.parse(l).inr ?? 0); } catch { return a; } }, 0)
  : 0;
let spent = 0, lastStart = 0, n = 0;
const windowRes = []; // { at, est }
let chain = Promise.resolve();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = row => { if (LEDGER) appendFileSync(LEDGER, JSON.stringify({ ts: new Date().toISOString(), run: RUN, ...row }) + '\n'); };

function parseSse(text) {
  let u = null, model = null;
  for (const line of text.split('\n')) {
    const s = line.trim(); if (!s.startsWith('data:')) continue;
    const d = s.slice(5).trim(); if (d === '[DONE]') continue;
    try { const j = JSON.parse(d); if (j.usage) u = j.usage; if (j.model) model = j.model; } catch { /* partial */ }
  }
  return { usage: u, model };
}

const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (!target || url !== target) return real(input, init);
  const body = String(init?.body ?? '');
  let b = {}; try { b = JSON.parse(body); } catch { /* not JSON */ }
  const dep = b.model, price = PRICES[dep];
  if (!price) { log({ event: 'refused_unpriced', deployment: dep }); throw new Error(`bench guard: no price for deployment ${dep}`); }
  const maxOut = b.max_completion_tokens ?? b.max_tokens ?? 4096;
  const est = Math.ceil(body.length / 4) + maxOut;
  const worst = (Math.ceil(body.length / 4) * price[0] + maxOut * price[1]) / 1e6;
  if ((CAP && spent + worst > CAP) || (GCAP && before + spent + worst > GCAP)) {
    log({ event: 'refused_cap', deployment: dep, spentRun: +spent.toFixed(3), spentAll: +(before + spent).toFixed(3) });
    throw new Error('bench guard: spend cap reached');
  }
  const slot = chain.then(async () => {
    for (;;) {
      const now = Date.now();
      while (windowRes.length && windowRes[0].at < now - 60_000) windowRes.shift();
      const used = windowRes.reduce((a, r) => a + r.est, 0);
      const gapWait = lastStart + GAP - now;
      const tpmWait = TPM && used + est > TPM && windowRes.length ? windowRes[0].at + 60_000 - now + 50 : 0;
      const wait = Math.max(gapWait, tpmWait);
      if (wait <= 0) break;
      await sleep(wait);
    }
    lastStart = Date.now();
    windowRes.push({ at: lastStart, est });
  });
  chain = slot.catch(() => {});
  await slot;
  const id = ++n;
  for (let attempt = 0; ; attempt++) {
    const t0 = Date.now();
    let res;
    try { res = await real(input, init); }
    catch (e) { log({ event: 'network_error', id, deployment: dep, attempt, error: String(e?.message ?? e).slice(0, 160) }); throw e; }
    if (res.status === 429 && attempt < 5) {
      const ra = Number(res.headers.get('retry-after-ms')) || (Number(res.headers.get('retry-after')) * 1000) || 10_000;
      await res.text().catch(() => '');
      log({ event: 'retry_429', id, deployment: dep, attempt, waitMs: ra });
      await sleep(Math.min(ra, 60_000) + 500);
      lastStart = Date.now();
      continue;
    }
    if (!res.ok) {
      const c = res.clone();
      c.text().then(t => log({ event: 'http_error', id, deployment: dep, status: res.status, attempt, detail: t.replace(/https?:\/\/\S+/g, '<url>').slice(0, 200) })).catch(() => {});
      return res;
    }
    const c = res.clone();
    const remTok = Number(res.headers.get('x-ratelimit-remaining-tokens') ?? NaN);
    (b.stream ? c.text().then(parseSse) : c.json().then(j => ({ usage: j.usage, model: j.model })))
      .then(({ usage, model }) => {
        const i = usage?.prompt_tokens ?? 0, o = usage?.completion_tokens ?? 0;
        const inr = (i * price[0] + o * price[1]) / 1e6;
        spent += inr;
        log({ event: 'ok', id, deployment: dep, model, stream: Boolean(b.stream), tools: b.tools?.length ?? 0, in: i, out: o, inr: +inr.toFixed(5), attempt, ms: Date.now() - t0, est, remTok: Number.isFinite(remTok) ? remTok : null });
      })
      .catch(e => log({ event: 'usage_parse_error', id, deployment: dep, error: String(e?.message ?? e).slice(0, 120) }));
    return res;
  }
};
