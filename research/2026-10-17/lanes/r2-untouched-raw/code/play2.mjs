import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const [,, mode, outfile, ...args] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', locale: 'en-IN' });
const page = await ctx.newPage();
const out = {};
if (mode === 'search') {
  for (const q of args) {
    await page.goto(`https://play.google.com/store/search?q=${encodeURIComponent(q)}&c=apps&hl=en_IN&gl=IN`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    out[q] = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="details?id="]')].map(a => a.href.split('id=')[1].split('&')[0] + ' | ' + (a.innerText || '').replace(/\n/g, ' ').slice(0, 80)))].slice(0, 8));
    console.log(q, JSON.stringify(out[q]));
  }
} else {
  for (const id of args) {
    try {
      await page.goto(`https://play.google.com/store/apps/details?id=${id}&hl=en_IN&gl=IN`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);
      const head = await page.evaluate(() => document.body.innerText.slice(0, 1500));
      const btn = page.locator('button:has-text("See all reviews"), span:has-text("See all reviews")').first();
      let reviews = [];
      if (await btn.count()) {
        await btn.click(); await page.waitForTimeout(2500);
        for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 3000); await page.waitForTimeout(800); const dlg = page.locator('div[role="dialog"]'); if (await dlg.count()) { await dlg.first().evaluate(el => { const sc = el.querySelector('div[jsname]') ; el.querySelectorAll('*').forEach(c=>{ if (c.scrollHeight > c.clientHeight + 50) c.scrollTop = c.scrollHeight; }); }); } }
        reviews = await page.evaluate(() => [...document.querySelectorAll('div[role="dialog"] div.RHo1pe')].map(r => { const st = r.querySelector('[role="img"][aria-label]'); const dt = r.querySelector('span.bp9Aid'); const body = r.querySelector('div.h3YV2d'); return { stars: st ? st.getAttribute('aria-label') : null, date: dt ? dt.innerText : null, text: body ? body.innerText.slice(0, 1200) : r.innerText.slice(0, 1200) }; }));
      }
      out[id] = { head, reviews };
      console.log(id, reviews.length);
    } catch (e) { console.log('ERR', id, String(e).slice(0, 100)); }
  }
}
fs.writeFileSync(outfile, JSON.stringify(out, null, 1));
await b.close();
