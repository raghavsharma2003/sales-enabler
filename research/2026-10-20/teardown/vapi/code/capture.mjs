// Passive page capture (no clicks except scroll). Usage: node capture.mjs <url> <harPath> <shotPath> <outJson> [waitMs]
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const [,, url, harPath, shotPath, outJson, waitMsS] = process.argv;
const waitMs = parseInt(waitMsS || '8000');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  proxy: { server: process.env.HTTPS_PROXY },
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ recordHar: { path: harPath, content: 'embed' },
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', viewport: {width: 1366, height: 900} });
const page = await ctx.newPage();
const ws = []; page.on('websocket', w => ws.push({url: w.url(), t: Date.now()}));
const reqs = []; page.on('request', r => reqs.push({u: r.url(), type: r.resourceType(), m: r.method()}));
try { await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }); } catch (e) { console.error('goto', e.message); }
for (let i=0;i<6;i++){ await page.mouse.wheel(0, 1200); await page.waitForTimeout(600); }
await page.waitForTimeout(waitMs);
await page.screenshot({ path: shotPath, fullPage: false });
const hosts = {}; for (const r of reqs) { try { const h = new URL(r.u).host; hosts[h]=(hosts[h]||0)+1; } catch {} }
const globals = await page.evaluate(() => Object.keys(window).filter(k => /^(__|next|NEXT|posthog|Sentry|dataLayer|intercom|Intercom|analytics|_hs|hj|clarity|amplitude|mixpanel|rudder|segment|vapi|Vapi|daily|Daily|LiveKit|supabase|workos|clerk|Clerk|stripe|Stripe|grecaptcha|turnstile|hcaptcha)/i.test(k)));
const out = { url, final: page.url(), title: await page.title(), nreq: reqs.length, hosts, ws, globals, scripts: reqs.filter(r=>r.type==='script').map(r=>r.u) };
fs.writeFileSync(outJson, JSON.stringify(out, null, 1));
console.log(JSON.stringify({final: out.final, title: out.title, nreq: out.nreq, hosts, ws, globals}, null, 1));
await ctx.close(); await browser.close();
