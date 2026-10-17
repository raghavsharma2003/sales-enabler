// explore.mjs: step through a demo page and dump what is clickable after each step (to author demos.json flows).
// node explore.mjs <url> '<json steps>' <outPrefix>
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const [url, stepsJson = '[]', outp = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l4b-measured/shots/x'] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', proxy: { server: process.env.HTTPS_PROXY }, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['microphone'] });
const page = await ctx.newPage();
const ws = [];
page.on('websocket', w => ws.push(w.url().slice(0, 150)));
page.on('popup', p => console.log('POPUP', p.url()));
async function dump(i) {
  await page.screenshot({ path: `${outp}-${i}.png` });
  for (const f of page.frames()) {
    try {
      const items = await f.evaluate(() => [...document.querySelectorAll('button,a,[role=button],input,select,textarea,[onclick]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map(e => `${e.tagName}${e.type ? '[' + e.type + ']' : ''}:${(e.innerText || e.value || e.placeholder || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50)}`).filter(s => !/^A:$/.test(s)).slice(0, 80));
      console.log(`STEP ${i} FRAME ${f.url().slice(0, 100)} :: ${items.join(' | ')}`);
    } catch {}
  }
  console.log('WS', ws.join(' , '));
}
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await dump(0);
let i = 1;
for (const st of steps) {
  try {
    if (st.wait) await page.waitForTimeout(st.wait);
    else if (st.scroll) await page.mouse.wheel(0, st.scroll);
    else if (st.goto) await page.goto(st.goto, { waitUntil: 'domcontentloaded' });
    else {
      let root = page; if (st.frame) root = page.frames().find(f => f.url().includes(st.frame)) || page;
      const loc = st.role ? root.getByRole(st.role, { name: new RegExp(st.click, 'i') }) : root.locator(st.click);
      const t = st.nth !== undefined ? loc.nth(st.nth) : loc.first();
      await t.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {});
      await t.click({ timeout: 10000, force: !!st.force });
      console.log('CLICKED', st.click);
    }
  } catch (e) { console.log('FAIL', JSON.stringify(st), String(e).split('\n')[0]); }
  await page.waitForTimeout(st.after || 3000);
  await dump(i++);
}
await browser.close();
