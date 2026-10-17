import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const [,, outfile, ...queries] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', locale: 'en-IN' });
const page = await ctx.newPage();
const out = [];
for (const q of queries) {
  const url = `https://www.reddit.com/search/?q=${encodeURIComponent(q)}&type=posts&sort=relevance`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    await page.mouse.wheel(0, 4000); await page.waitForTimeout(1500);
    const items = await page.evaluate(() => {
      const res = [];
      document.querySelectorAll('a[href*="/comments/"]').forEach(a => {
        const t = (a.innerText || a.getAttribute('aria-label') || '').trim();
        if (t.length > 8) res.push({ href: a.href.split('?')[0], title: t.slice(0, 200) });
      });
      return res;
    });
    const seen = new Set();
    for (const it of items) { if (seen.has(it.href)) continue; seen.add(it.href); out.push({ q, ...it }); }
    console.log(q, seen.size);
  } catch (e) { console.log('ERR', q, String(e).slice(0, 100)); }
}
fs.writeFileSync(outfile, JSON.stringify(out, null, 1));
await b.close();
