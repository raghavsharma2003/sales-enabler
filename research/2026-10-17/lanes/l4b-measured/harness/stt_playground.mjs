// stt_playground.mjs: feed battery caller clips to Gnani's public Inya/Vachana speech-to-text playground
// (https://www.gnani.ai/speech-to-text-api, no login; same widget code as inya.ai) through the same fake microphone as vp_harness, and record what it heard.
// Anonymous-visitor use of a public demo; one clip at a time, with pauses.
//   node stt_playground.mjs <out.json> [clipId ...]     (default: every non-silence battery clip)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LANE = path.resolve(HERE, '..');
const battery = JSON.parse(fs.readFileSync(path.join(LANE, 'battery', 'battery.json'), 'utf8'));
const [out, ...ids] = process.argv.slice(2);
const LANGNAME = { 'hi-IN': 'Hindi', 'ta-IN': 'Tamil', 'en-IN': 'English' };
const clips = [];
for (const p of battery.personas) for (const t of p.turns) if (t.type !== 'silence' && (!ids.length || ids.includes(t.id))) clips.push({ id: t.id, persona: p.id, lang: p.stt_locales[0], text: t.text, dur: t.dur_s });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHROME = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;
const browser = await chromium.launch({ executablePath: CHROME, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['microphone'] });
await context.exposeBinding('__vpPush', () => {});
await context.addInitScript({ path: path.join(HERE, 'vp_init.js') });
const page = await context.newPage();
const frames = [];
let t0 = Date.now();
page.on('websocket', ws => { if (!/vachana|asr/i.test(ws.url())) return; ws.on('framereceived', f => { const pl = typeof f.payload === 'string' ? f.payload : '[binary ' + (f.payload?.length || 0) + ']'; frames.push({ t: Date.now() - t0, p: pl.slice(0, 600) }); }); });
await page.goto('https://www.gnani.ai/speech-to-text-api', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(8000);
const results = [];
const root = page.locator('body');
async function state() { return root.getAttribute('data-pg-stt-state').catch(() => null); }
for (const c of clips) {
  const rec = { ...c, ws: [] };
  try {
    await root.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {});
    // the language <select> is hidden behind a styled dropdown: set it directly and fire 'change'
    rec.langSet = await page.evaluate((name) => {
      const sel = document.querySelector('[data-pg-lang="stt"]'); if (!sel) return 'no-select';
      const opt = [...sel.options].find(o => o.textContent.trim().toLowerCase().startsWith(name.toLowerCase()));
      if (!opt) return 'no-option:' + [...sel.options].map(o => o.textContent.trim()).join('/');
      sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return opt.textContent.trim() + '=' + opt.value;
    }, LANGNAME[c.lang]);
    const b64 = fs.readFileSync(path.join(LANE, 'battery', 'audio', c.id + '.wav')).toString('base64');
    await page.evaluate(([i, b]) => window.__vp.load(i, b), [c.id, b64]);
    t0 = Date.now(); frames.length = 0;
    await root.locator('[data-pg-action="stt-start"]').first().click({ timeout: 10000 });
    for (let i = 0; i < 100 && (await state()) !== 'recording'; i++) await sleep(100);
    rec.recordingAfterMs = Date.now() - t0;
    await sleep(400);
    const play = await page.evaluate(i => window.__vp.play(i), c.id);
    rec.playAtMs = Date.now() - t0;
    await sleep(play.dur * 1000 + 1500);
    const stopAt = Date.now();
    await root.locator('[data-pg-action="stt-stop"]').first().click({ timeout: 10000 });
    let st = null;
    for (let i = 0; i < 150; i++) { st = await state(); if (st === 'result' || st === 'error') break; await sleep(100); }
    rec.finalAfterStopMs = Date.now() - stopAt;
    rec.state = st;
    rec.heard = await root.locator('[data-pg-field="stt"]').first().inputValue().catch(async () => root.locator('[data-pg-field="stt"]').first().innerText());
    rec.error = st === 'error' ? await root.locator('[data-pg-error]').first().innerText().catch(() => '') : '';
    rec.ws = frames.slice(0, 40);
    await root.locator('[data-pg-action="stt-reset"]').first().click({ timeout: 5000 }).catch(() => {});
  } catch (e) { rec.error = String(e).slice(0, 200); }
  results.push(rec);
  console.log(JSON.stringify({ id: rec.id, lang: rec.langSet, state: rec.state, heard: rec.heard, err: rec.error, fin: rec.finalAfterStopMs }));
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  await sleep(2500);
}
await browser.close();
