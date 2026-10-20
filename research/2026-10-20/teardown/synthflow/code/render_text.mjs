// Render public pages and save their visible text (no clicks, no input). Usage: node render_text.mjs <outdir> <url>...
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
const [,, outdir, ...urls] = process.argv;
fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });
for (const u of urls) {
  const page = await ctx.newPage();
  try { await page.goto(u, { waitUntil: 'networkidle', timeout: 60000 }); } catch (e) { console.error('goto', u, e.message); }
  await page.waitForTimeout(2500);
  const txt = await page.evaluate(() => document.body ? document.body.innerText : '');
  const name = u.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 150) + '.txt';
  fs.writeFileSync(`${outdir}/${name}`, `URL: ${u}\nFETCHED: ${new Date().toISOString()}\n\n${txt}`);
  console.log(txt.length, name);
  await page.close();
}
await browser.close();
