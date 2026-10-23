// Screenshots every screen at 390x844 and 1440x900 into ../shots/, and reports horizontal scroll, console errors and clipped text.
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node product/web/dev/shots.mjs [baseUrl] [only-substring]
// Needs the dev server (dev/serve.ts) running. Signs up a throwaway SYNTHETIC workspace on first run.
import { createRequire } from 'node:module';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
const base = process.argv[2] ?? 'http://localhost:8788';
const only = process.argv[3] ?? '';
const out = fileURLToPath(new URL('../shots/', import.meta.url));
mkdirSync(out, { recursive: true });

const EMAIL = 'asha@saanjh.example', PASSWORD = 'sample-password-1234';
const screens = (id) => [
  ['login', '/login', { anon: true }], ['signup', '/signup', { anon: true }],
  ['today', '/'], ['agents', '/agents'], ['agent-builder', `/agents/${id.riya}`], ['agent-stack', `/agents/${id.emi}?tab=voice`],
  ['agent-test', `/agents/${id.riya}`, { after: async (p, tag) => { if (tag === 'm') { await p.getByRole('button', { name: 'Test her' }).first().click(); } else { await p.getByRole('radio', { name: 'Test her' }).click(); } await p.getByRole('button', { name: /Run \d+ practice callers/ }).click(); await p.waitForTimeout(3500); await p.locator('.simlist summary').nth(2).click(); } }],
  ['agent-new', '/agents', { after: async (p) => { await p.getByRole('button', { name: 'New agent', exact: true }).click(); await p.waitForTimeout(500); } }],
  ['operator-plan', '/', { after: async (p, tag) => { if (tag === 'm') await p.getByRole('button', { name: 'Assistant' }).click(); await p.locator('#dock-input').fill('Launch the appointment reminders campaign'); await p.keyboard.press('Enter'); await p.waitForTimeout(3500); } }],
  ['approval', '/', { after: async (p) => { await p.getByRole('button', { name: 'Review' }).first().click(); await p.waitForTimeout(600); } }],
  ['contacts', '/contacts'], ['contacts-import', '/contacts/import', { after: async (p) => { await p.getByRole('button', { name: 'Use a made-up sample' }).click(); await p.getByRole('button', { name: 'Check the file' }).click(); await p.waitForTimeout(1200); } }],
  ['contact', `/contacts/${id.contact}`], ['contact-suppressed', `/contacts/${id.suppressed}`], ['contacts-export', '/contacts', { after: async (p) => { await p.getByRole('button', { name: 'Export as CSV…' }).click(); await p.waitForTimeout(500); } }], ['audiences', '/audiences'],
  ['campaigns', '/campaigns'], ['campaign-new', '/campaigns/new'], ['campaign-draft', `/campaigns/${id.camp}`], ['campaign-draft2', `/campaigns/${id.camp2}`], ['campaign-cap', `/campaigns/${id.camp2}`, { after: async (p) => { await p.getByRole('button', { name: /^(Set|Change) spend cap$/ }).click(); await p.waitForTimeout(900); } }],
  ['calls', '/calls'], ['call', `/calls/${id.call}`], ['call-optout', `/calls/${id.optout}`], ['insights', '/insights'], ['numbers', '/numbers'],
  ['settings-team', '/settings/team'], ['settings-keys', '/settings/keys'], ['settings-brand', '/settings/brand'], ['settings-knowledge', '/settings/knowledge'], ['settings-billing', '/settings/billing'],
  ['settings-compliance', '/settings/compliance'], ['settings-privacy', '/settings/privacy'], ['settings-activity', '/settings/activity'], ['settings-operator', '/settings/operator'], ['settings-integrations', '/settings/integrations'],
  ['integrations-connect', '/settings/integrations', { after: async (p) => { await p.getByRole('button', { name: 'Connect HubSpot CRM' }).click(); await p.waitForTimeout(500); } }],
];
const SIZES = [['m', { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 1 }], ['d', { width: 1440, height: 900 }, { deviceScaleFactor: 1 }]];

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? undefined });
const report = [];
for (const [tag, viewport, extra] of SIZES) {
  const ctx = await browser.newContext({ viewport, ...extra, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // sign in (create the workspace the first time)
  let r = await page.request.post(base + '/v1/login', { data: { email: EMAIL, password: PASSWORD } });
  if (!r.ok()) r = await page.request.post(base + '/v1/signup', { data: { workspace: 'Saanjh Services', name: 'Asha Rao', email: EMAIL, password: PASSWORD } });
  const call = async (t, args = {}) => (await (await page.request.post(base + '/v1/tools/' + t, { data: { args } })).json()).result;
  const ag = (await call('agent.list')).agents; const cp = (await call('campaign.list')).campaigns; const cl = (await call('call.search', {})).calls; const ct = (await call('contact.list', { limit: 1 })).contacts; const sup = (await call('contact.list', { limit: 5, suppressed: true })).contacts;
  const byName = (arr, n) => arr.find(x => x.name.includes(n))?.id;
  const ids = { riya: byName(ag, 'Renewals'), emi: byName(ag, 'EMI'), camp: byName(cp, 'Renewals'), camp2: byName(cp, 'Appointment'), contact: ct[0]?.id, suppressed: sup[0]?.id, call: cl[2]?.id ?? cl[0]?.id, call2: cl[1]?.id ?? cl[0]?.id, optout: cl.find(x => x.end_reason === 'opt_out')?.id ?? cl[0]?.id };
  for (const [name, path, o] of screens(ids)) {
    if (only && !name.includes(only)) continue;
    if (o?.anon) {
      const c2 = await browser.newContext({ viewport, ...extra, reducedMotion: 'reduce' }); const p2 = await c2.newPage();
      await p2.goto(base + path); await p2.waitForTimeout(500); await p2.screenshot({ path: `${out}${name}-${tag}.png` }); await c2.close(); continue;
    }
    errors.length = 0;
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(450);
    if (o?.after) await o.after(page, tag);
    const file = `${out}${name}-${tag}.png`;
    if (tag === 'm') await page.addStyleTag({ content: '.bottombar{position:static!important}' });
    await page.screenshot({ path: file, fullPage: tag === 'm' ? true : false });
    const m = await page.evaluate(() => {
      const de = document.documentElement; const bad = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (r.width && r.right > innerWidth + 1 && cs.position !== 'fixed' && !el.closest('.tablewrap, .tabs, .scrim')) bad.push(el.tagName + '.' + String(el.className).slice(0, 40));
        if (cs.fontSize && parseFloat(cs.fontSize) < 12 && el.textContent?.trim() && el.children.length === 0) bad.push('tiny:' + el.textContent.trim().slice(0, 20));
      }
      return { hscroll: de.scrollWidth > innerWidth + 1, sw: de.scrollWidth, bad: [...new Set(bad)].slice(0, 6) };
    });
    report.push({ name, tag, kb: Math.round(statSync(file).size / 1024), ...m, errors: [...errors].slice(0, 3) });
  }
  await ctx.close();
}
await browser.close();
for (const r of report) console.log(`${r.hscroll || r.bad.length || r.errors.length ? '!!' : 'ok'} ${r.name}-${r.tag} ${r.kb}KB${r.hscroll ? ' HSCROLL sw=' + r.sw : ''}${r.bad.length ? ' bad=' + r.bad.join('|') : ''}${r.errors.length ? ' err=' + r.errors.join(' | ').slice(0, 200) : ''}`);
