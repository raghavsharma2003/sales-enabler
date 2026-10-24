// Accessibility audit: axe-core (WCAG 2.0/2.1 A and AA rules) on every main screen of the seeded workspace, desktop and phone.
// Used by the browser flows (a gate: no serious or critical violation) and by `node product/web/e2e/a11y.mjs <base>` to print
// the full table for research/2026-10-24/walkthrough/A11Y.md.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const req = createRequire(import.meta.url);
const AXE = readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');
export const SIZES = { d: { viewport: { width: 1440, height: 900 } }, m: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } };

/** The screens a buyer uses, with the seeded workspace's ids; `open` puts the page in the state worth checking (a sheet, a panel). */
export async function screens(call) {
  const ag = (await call('agent.list')).agents, cp = (await call('campaign.list')).campaigns, cl = (await call('call.search', {})).calls, ct = (await call('contact.list', { limit: 1 })).contacts;
  const riya = ag.find(a => a.name.includes('Renewals'))?.id ?? ag[0]?.id, camp = cp[0]?.id, callId = cl.find(c => c.duration_s > 0)?.id ?? cl[0]?.id;
  return [
    ['Today', '/'], ['Agents', '/agents'], ['Agent: basics', `/agents/${riya}`], ['Agent: job and facts', `/agents/${riya}?tab=job`], ['Agent: hand-off', `/agents/${riya}?tab=rules`],
    ['Agent: tools', `/agents/${riya}?tab=tools`], ['Agent: voice stack', `/agents/${riya}?tab=voice`],
    ['Agent: test panel', `/agents/${riya}?test=1`, async (p, tag) => { if (tag === 'm') await p.getByRole('heading', { name: 'Hear her yourself' }).waitFor(); }],
    ['Agent: practice chat', `/agents/${riya}?test=1`, async p => { const box = p.getByLabel('What the caller says'); await box.fill('Aap AI ho kya?'); await p.getByRole('button', { name: 'Send' }).click(); await p.locator('.pchat-notes').first().waitFor({ timeout: 15000 }); }],
    ['Contacts', '/contacts'], ['Contact', `/contacts/${ct[0]?.id}`], ['Import', '/contacts/import', async p => { const sample = p.getByRole('button', { name: 'Use a made-up sample' }); await sample.evaluate(e => e.scrollIntoView({ block: 'center' })); await sample.click(); await p.getByRole('button', { name: 'Check the file' }).click(); await p.getByText('3. What will happen to each row').waitFor({ timeout: 15000 }); }],
    ['Import: from HubSpot', '/contacts/import?from=hubspot'], ['Import: from Zoho CRM', '/contacts/import?from=zoho_crm'], ['Import: from Salesforce', '/contacts/import?from=salesforce'],
    ['Audiences', '/audiences'], ['Campaigns', '/campaigns'], ['New campaign', '/campaigns/new'], ['Campaign', `/campaigns/${camp}`],
    ['Calls', '/calls'], ['Call', `/calls/${callId}`], ['Insights', '/insights'], ['Numbers', '/numbers'],
    ['Settings: team', '/settings/team'], ['Settings: outcomes', '/settings/outcomes'], ['Hand-offs', '/handoffs'], ['Settings: security', '/settings/security'], ['Settings: webhooks', '/settings/webhooks'], ['Settings: notifications', '/settings/notifications'], ['Settings: integrations', '/settings/integrations'],
    ['Calls: export sheet', '/calls', async p => { await p.getByRole('button', { name: 'Export as CSV…' }).click(); await p.getByRole('dialog').waitFor(); }], ['Settings: billing', '/settings/billing'], ['Settings: compliance', '/settings/compliance'], ['Settings: activity', '/settings/activity'],
    ['Approval sheet', '/settings/billing', async p => { await p.getByLabel('Add money (₹)').fill('500'); await p.getByRole('button', { name: /^Ask to add/ }).click(); await p.getByRole('dialog').waitFor(); }],
  ];
}

/** axe on the current page; returns violations with impact, rule, help and the first few targets. */
export async function axe(page) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] })).violations
    .map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, targets: v.nodes.slice(0, 4).map(n => n.target.join(' ')) })));
  return r;
}

export async function audit(browser, base, storageState, only = null, colorScheme = 'light') {
  const out = [];
  for (const [tag, size] of Object.entries(SIZES)) {
    const ctx = await browser.newContext({ ...size, reducedMotion: 'reduce', colorScheme, storageState });
    const page = await ctx.newPage();
    const call = async (t, args = {}) => (await (await page.request.post(base + '/v1/tools/' + t, { data: { args } })).json()).result;
    for (const [name, path, open] of await screens(call)) {
      if (only && !only.includes(name)) continue;
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      if (open) await open(page, tag);
      const violations = await axe(page);
      // WCAG 1.4.10 (reflow): a phone page wider than the screen zooms out, and taps land on the wrong element. axe does not check it.
      const wide = tag === 'm' && await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (wide > 1) violations.push({ id: 'page-scrolls-sideways', impact: 'serious', help: `The page is ${wide}px wider than the screen`, n: 1, targets: ['html'] });
      // A machine without the app's fonts (the CI runner) falls back to DejaVu Sans, which is wider than Inter: measured
      // again in it, so a page that fits here but not there fails here too (the voice stack page, 12px, 2026-10-24).
      else if (tag === 'm') {
        const style = await page.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important} code,.mono,code *,.mono *{font-family:"DejaVu Sans Mono",monospace !important}' });
        const fallback = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(document.documentElement.scrollWidth - document.documentElement.clientWidth))));
        await style.evaluate(e => e.remove());
        if (fallback > 1) violations.push({ id: 'page-scrolls-sideways', impact: 'serious', help: `The page is ${fallback}px wider than the screen in the fallback font (DejaVu Sans)`, n: 1, targets: ['html'] });
      }
      out.push({ screen: name, size: tag, scheme: colorScheme, violations });
    }
    await ctx.close();
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let pw; for (const b of [import.meta.url, 'file:///opt/node-tools/node_modules/']) { try { pw = createRequire(b)('playwright'); break; } catch { /* next */ } }
  const base = process.argv[2] ?? 'http://localhost:8788';
  const browser = await pw.chromium.launch();
  const c = await browser.newContext(); await c.request.post(base + '/v1/login', { data: { email: 'asha@saanjh.example', password: 'sample-password-1234' } });
  const res = [...await audit(browser, base, await c.storageState()), ...await audit(browser, base, await c.storageState(), null, 'dark')];
  await browser.close();
  console.log(JSON.stringify(res, null, 1));
}
