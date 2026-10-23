// One screenshot of the Insights page (desktop, full page) as the seeded admin, for the learning-loop walkthrough.
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node product/web/dev/insights-shot.mjs <baseUrl> <out.png> [path]
import { createRequire } from 'node:module';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
const [base, out, path = '/insights'] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const r = await ctx.request.post(`${base}/v1/login`, { data: { email: 'asha@saanjh.example', password: 'sample-password-1234' } });
if (!r.ok()) throw new Error('login ' + r.status());
const page = await ctx.newPage();
await page.goto(base + path);
await page.waitForTimeout(2500);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
