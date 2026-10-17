// Scan vendor sites for a public, no-sign-up browser voice demo.
// For each URL: load, wait, screenshot, and record (a) clickable elements whose text looks like a demo trigger,
// (b) iframes, (c) widget scripts, (d) websocket / WebRTC-signalling hosts seen in network traffic.
// Usage: node scan_demos.mjs <out_dir> [url ...]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const OUT = process.argv[2];
const URLS = process.argv.slice(3);
fs.mkdirSync(OUT, { recursive: true });

const DEMO_RE = /talk|try (it|now|live|a demo|our)|live demo|demo|call (me|now|agent)|speak|start (call|conversation|talking)|test (agent|call)|hear|listen|web call|voice agent/i;
const WIDGET_RE = /vapi|retell|elevenlabs|convai|livekit|daily\.co|ultravox|bland|synthflow|bolna|smallest|ringg|sarvam|deepgram|hume|agora|twilio|plivo|exotel|websocket|webrtc|widget/i;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  proxy: { server: process.env.HTTPS_PROXY || 'http://127.0.0.1:43273' },
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const results = [];
for (const url of URLS) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: false });
  const page = await ctx.newPage();
  const ws = new Set(); const hosts = new Set(); const widgetReqs = new Set();
  page.on('websocket', w => ws.add(w.url().slice(0, 160)));
  page.on('request', r => { try { const u = new URL(r.url()); hosts.add(u.host); if (WIDGET_RE.test(u.host + u.pathname)) widgetReqs.add((u.host + u.pathname).slice(0, 140)); } catch {} });
  const rec = { url, ok: false };
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    rec.status = resp ? resp.status() : null;
    await page.waitForTimeout(7000);
    rec.title = await page.title();
    rec.finalUrl = page.url();
    const info = await page.evaluate((src) => {
      const re = new RegExp(src, 'i');
      const els = [...document.querySelectorAll('a,button,[role=button],div[onclick]')];
      const cands = [];
      for (const e of els) {
        const t = (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
        if (t && t.length < 80 && re.test(t)) cands.push({ tag: e.tagName, text: t, href: e.getAttribute('href') || '' });
      }
      const iframes = [...document.querySelectorAll('iframe')].map(f => f.src).filter(Boolean);
      const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src);
      const custom = [...document.querySelectorAll('*')].map(e => e.tagName.toLowerCase()).filter(t => t.includes('-')).filter((v, i, a) => a.indexOf(v) === i);
      const text = document.body ? document.body.innerText.slice(0, 1500) : '';
      return { cands: cands.slice(0, 40), iframes, scripts, custom, text };
    }, DEMO_RE.source);
    Object.assign(rec, info);
    rec.ok = true;
    const name = new URL(url).host.replace(/[^a-z0-9.]/gi, '_') + new URL(url).pathname.replace(/[^a-z0-9]/gi, '_');
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    rec.shot = `${name}.png`;
  } catch (e) { rec.error = String(e).slice(0, 300); }
  rec.websockets = [...ws]; rec.widgetReqs = [...widgetReqs].slice(0, 40); rec.nHosts = hosts.size;
  results.push(rec);
  console.log(JSON.stringify({ url, ok: rec.ok, status: rec.status, title: rec.title, cands: (rec.cands || []).map(c => c.text).slice(0, 12), ws: rec.websockets, custom: rec.custom, err: rec.error }));
  await ctx.close();
}
fs.writeFileSync(`${OUT}/scan-${Date.now()}.json`, JSON.stringify(results, null, 1));
await browser.close();
