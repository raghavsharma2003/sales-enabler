// Radar scan: load public pages, record HAR + rendered text + request hosts/websockets/scripts.
// Passive: no clicks, no form fills, no sign-ups. Usage: node scan.mjs <targets.json> <out_root>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const targets = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const only = process.argv[4] ? new Set(process.argv[4].split(',')) : null;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  proxy: { server: process.env.HTTPS_PROXY },
  args: ['--disable-blink-features=AutomationControlled'],
});

for (const t of targets) {
  if (only && !only.has(t.vendor)) continue;
  for (const url of t.urls) {
    const slug = (new URL(url).host + new URL(url).pathname).replace(/[^a-z0-9.]+/gi, '_').replace(/_+$/, '');
    const dir = path.join(OUT, t.vendor, 'web');
    fs.mkdirSync(dir, { recursive: true });
    const harPath = path.join(dir, `${slug}.har`);
    const ctx = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      recordHar: { path: harPath, content: 'omit' },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    const hosts = {}; const ws = new Set();
    page.on('websocket', w => ws.add(w.url().slice(0, 200)));
    page.on('request', r => { try { const h = new URL(r.url()).host; hosts[h] = (hosts[h] || 0) + 1; } catch {} });
    const rec = { vendor: t.vendor, url, fetched_at: new Date().toISOString() };
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      rec.status = resp ? resp.status() : null;
      rec.headers = resp ? resp.headers() : {};
      await page.waitForTimeout(6000);
      try { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(2500); } catch {}
      rec.title = await page.title();
      rec.finalUrl = page.url();
      const info = await page.evaluate(() => {
        const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src);
        const iframes = [...document.querySelectorAll('iframe')].map(f => f.src).filter(Boolean);
        const gen = [...document.querySelectorAll('meta[name=generator]')].map(m => m.content);
        const custom = [...new Set([...document.querySelectorAll('*')].map(e => e.tagName.toLowerCase()).filter(x => x.includes('-')))];
        const links = [...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => /^https?:/.test(h));
        const text = document.body ? document.body.innerText : '';
        return { scripts, iframes, gen, custom, links: [...new Set(links)].slice(0, 400), text };
      });
      fs.writeFileSync(path.join(dir, `${slug}.txt`), info.text);
      delete info.text;
      Object.assign(rec, info);
    } catch (e) { rec.error = String(e).slice(0, 300); }
    rec.hosts = hosts; rec.websockets = [...ws];
    await ctx.close();
    fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify(rec, null, 1));
    console.log(JSON.stringify({ v: t.vendor, url, status: rec.status, title: (rec.title || '').slice(0, 80), nh: Object.keys(hosts).length, ws: rec.websockets.length, err: rec.error }));
  }
}
await browser.close();
