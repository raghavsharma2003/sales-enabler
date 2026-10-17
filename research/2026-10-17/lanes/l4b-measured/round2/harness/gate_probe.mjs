// gate_probe.mjs <id> <url> <clickSpec|-> [clickSpec2] : load page with the l4b init script (fake mic + taps), try to
// start the demo, then report: did the page ask for the mic, open WebRTC/WebSocket, show identity inputs; screenshot.
// clickSpec: "role:button:Regex" | "text:Some text" | "css:selector". Read-only: never types into any input.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const [id, url, ...clicks] = process.argv.slice(2);
const OUT = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/r2comp/gates';
fs.mkdirSync(OUT, { recursive: true });
const INIT = '/home/user/sales-enabler/research/2026-10-17/lanes/l4b-measured/round2/harness/vp_init.js';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
  proxy: { server: process.env.HTTPS_PROXY }, args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['microphone'], locale: 'en-IN' });
await ctx.addInitScript({ path: INIT });
const page = await ctx.newPage();
const ws = [], reqs = [], log = [];
page.on('websocket', w => ws.push(w.url().slice(0, 160)));
page.on('request', r => { const u = r.url(); if (/livekit|daily|vapi|retell|ultravox|elevenlabs|deepgram|cartesia|millis|sesame|smallest|atoms|token|session|room|call|agent/i.test(u) && !/\.(js|css|png|svg|woff2?|jpg|webp)(\?|$)/.test(u)) reqs.push(r.method() + ' ' + u.slice(0, 160)); });
page.on('popup', p => log.push('popup ' + p.url()));
page.on('console', m => { if (/error|denied|ice|turn|fail/i.test(m.text())) log.push('console ' + m.text().slice(0, 160)); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => log.push('goto ' + e.message.slice(0, 100)));
await page.waitForTimeout(7000);
for (const c of clicks) {
  const [kind, ...rest] = c.split(':'); const arg = rest.join(':');
  try {
    let loc;
    if (kind === 'role') { const [role, ...nm] = arg.split(':'); loc = page.getByRole(role, { name: new RegExp(nm.join(':'), 'i') }).first(); }
    else if (kind === 'text') loc = page.getByText(new RegExp(arg, 'i')).first();
    else if (kind === 'jsclick') { const n = await page.evaluate((t) => { const b = [...document.querySelectorAll('button')].filter(x => (x.innerText || '').includes(t)); b.forEach(x => x.scrollIntoView({ block: 'center' })); if (b[0]) { b[0].click(); } return b.length; }, arg); log.push('jsclick ' + arg + ' matches=' + n); await page.waitForTimeout(4000); continue; }
    else loc = page.locator(arg).first();
    await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    try { await loc.click({ timeout: 8000 }); log.push('clicked ' + c); }
    catch (e) { await loc.click({ timeout: 5000, force: true }).then(() => log.push('force-clicked ' + c)).catch(async () => { await loc.dispatchEvent('click').then(() => log.push('dispatched ' + c)).catch(e2 => log.push('click-fail ' + c + ' ' + e2.message.slice(0, 80))); }); }
    await page.waitForTimeout(4000);
  } catch (e) { log.push('step-fail ' + c + ' ' + e.message.slice(0, 100)); }
}
await page.waitForTimeout(15000);
const st = [];
for (const f of page.frames()) { try { const s = await f.evaluate(() => window.__vp ? window.__vp.state() : null); if (s && (s.gum || s.pcs || s.taps)) st.push({ url: f.url().slice(0, 100), gum: s.gum, pcs: s.pcs, taps: s.taps, agentVoiceMs: s.agentVoiceMs }); } catch {} }
const inputs = await page.$$eval('input, textarea, select', els => els.filter(e => e.offsetParent !== null && e.type !== 'hidden').map(e => (e.type || e.tagName) + ':' + (e.name || e.placeholder || e.getAttribute('aria-label') || '').slice(0, 40)));
const frames = page.frames().map(f => f.url()).filter(u => u && u !== 'about:blank').map(u => u.slice(0, 120));
await page.screenshot({ path: `${OUT}/${id}.png` });
const res = { id, url, at: new Date().toISOString(), clicks, log, state: st, ws, reqs: [...new Set(reqs)].slice(0, 25), visibleInputs: inputs.slice(0, 15), frames: frames.slice(0, 10) };
fs.writeFileSync(`${OUT}/${id}.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
await browser.close();
