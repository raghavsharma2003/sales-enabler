// Screenshots every screen at 390x844 and 1440x900 into ../shots/, and reports horizontal scroll, console errors and clipped text.
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node product/web/dev/shots.mjs [baseUrl] [only-substring]
// Needs the dev server (dev/serve.ts) running. Signs up a throwaway SYNTHETIC workspace on first run.
import { createRequire } from 'node:module';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EMI_ROWS, xlsxFile } from './xlsx-sample.mjs';
import { HS_TOKEN, startFakeCrm } from './fake-crm.mjs';
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
  ['contacts-import-excel', '/contacts/import', { after: async (p) => {
    await p.getByLabel('Which agent will call them? (optional)').selectOption(id.emi);
    await p.getByLabel('Choose a file: Excel, CSV or TSV').setInputFiles({ name: 'emi-december.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsxFile(EMI_ROWS) });
    await p.getByRole('button', { name: 'Check the file' }).click();
    const head = p.getByRole('heading', { name: /says from each person's record/ });
    await head.waitFor({ timeout: 15000 }); await head.scrollIntoViewIfNeeded(); await p.waitForTimeout(400); } }],
  // CRM import: Zoho is not connected (the empty state); HubSpot is connected to a local fake CRM (VP_CRM_FAKE_URL on the server).
  ['contacts-import-crm-empty', '/contacts/import?from=zoho_crm', { after: async (p) => { await p.getByText('Zoho CRM is not connected').waitFor(); } }],
  ['contacts-import-hubspot', '/contacts/import?from=hubspot', { before: async (p) => { await connectHubspot(p); }, after: async (p) => {
    await p.getByLabel('HubSpot list').selectOption({ index: 1 }); await p.getByRole('button', { name: 'Check this list' }).click();
    await p.getByText('3. What will happen to each row').waitFor({ timeout: 15000 }); await p.getByText(/^Read \d+ contacts? from HubSpot/).scrollIntoViewIfNeeded(); await p.waitForTimeout(300); } }],
  ['contacts-import-hubspot-synced', '/contacts/import?from=hubspot', { before: async (p) => { await connectHubspot(p); }, after: async (p) => {
    const card = p.locator('.card', { hasText: 'Lists kept in step with HubSpot' });
    await p.waitForLoadState('networkidle');
    if (!(await card.count())) {
      await p.getByLabel('HubSpot list').selectOption({ index: 1 }); await p.getByRole('button', { name: 'Check this list' }).click();
      await p.getByText('3. What will happen to each row').waitFor({ timeout: 15000 }); await p.getByRole('button', { name: /^Save \d+ contacts$/ }).click();
    }
    await card.waitFor({ timeout: 15000 }); await card.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); } }],
  ['contact', `/contacts/${id.contact}`], ['contact-suppressed', `/contacts/${id.suppressed}`], ['contacts-export', '/contacts', { after: async (p) => { await p.getByRole('button', { name: 'Export as CSV…' }).click(); await p.waitForTimeout(500); } }], ['audiences', '/audiences'],
  ['campaigns', '/campaigns'], ['campaign-new', '/campaigns/new'], ['campaign-draft', `/campaigns/${id.camp}`], ['campaign-draft2', `/campaigns/${id.camp2}`], ['campaign-cap', `/campaigns/${id.camp2}`, { after: async (p) => { await p.getByRole('button', { name: /^(Set|Change) spend cap$/ }).click(); await p.waitForTimeout(900); } }],
  ['calls', '/calls'], ['call', `/calls/${id.call}`], ['call-optout', `/calls/${id.optout}`], ['insights', '/insights'], ['numbers', '/numbers'],
  ['settings-team', '/settings/team'], ['settings-keys', '/settings/keys'], ['settings-brand', '/settings/brand'], ['settings-knowledge', '/settings/knowledge'], ['settings-billing', '/settings/billing'],
  ['settings-compliance', '/settings/compliance'], ['settings-privacy', '/settings/privacy'], ['settings-activity', '/settings/activity'], ['settings-operator', '/settings/operator'], ['settings-integrations', '/settings/integrations'],
  // Webhooks: one made through the real tools (approved via POST /v1/actions/:id/decide, as the approval sheet does) to a synthetic address that does
  // not resolve, then a test event sent to it, so the list shows a real failed delivery and its reason.
  ['settings-webhooks', '/settings/webhooks', { before: async (p) => { await makeWebhook(p); } }],
  ['settings-notifications', '/settings/notifications'],
  ['calls-export', '/calls', { after: async (p) => { await p.getByRole('button', { name: 'Export as CSV…' }).click(); await p.getByRole('dialog').waitFor(); await p.waitForTimeout(300); } }],
  ['integrations-connect', '/settings/integrations', { after: async (p) => { await p.getByRole('button', { name: 'Connect HubSpot CRM' }).click(); await p.waitForTimeout(500); } }],
  // Security. The empty state comes first on a fresh workspace; the next screens configure single sign-on through the real tools (the secret is staged, the
  // A2 change is approved through POST /v1/actions/:id/decide, as the approval sheet does). The issuer is synthetic and does not resolve, so the connection test fails: that is the failure state.
  ['security-empty', '/settings/security', { fresh: true }],
  ['security-sso-failed', '/settings/security', { before: async (p) => { await configureSso(p); }, after: async (p) => { await p.getByRole('button', { name: 'Test connection' }).click(); await p.getByText('The connection test found a problem.').waitFor(); await p.waitForTimeout(300); } }],
  ['security-require', '/settings/security', { after: async (p) => { await p.getByRole('button', { name: /^Require single sign-on/ }).click(); await p.getByRole('dialog').waitFor(); await p.waitForTimeout(300); } }],
  ['security-tokens-export', '/settings/security', { before: async (p) => { await makeTokenAndExport(p); }, after: async (p) => { await p.getByRole('heading', { name: 'Provisioning tokens' }).scrollIntoViewIfNeeded(); await p.waitForTimeout(300); } }],
  ['security-export-recent', '/settings/security', { after: async (p) => { await p.getByRole('heading', { name: 'Recent exports' }).scrollIntoViewIfNeeded(); await p.waitForTimeout(300); } }],
  ['signin-sso', '/signin', { anon: true }],
  ['signin-sso-error', '/signin?sso_error=state_mismatch', { anon: true }],
  ['signin-sso-error-verify', '/signin?sso_error=wrong_aud', { anon: true }],
  // The server answers a password sign-in on a workspace that requires single sign-on with 403 sso_required; shown here with that exact answer.
  ['signin-sso-required', '/signin', { anon: true, after: async (p) => {
    await p.route('**/v1/login', r => r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'sso_required', message: 'this workspace signs in with single sign-on; use "Sign in with SSO"' } }) }));
    await p.getByLabel('Work email').fill('priya@saanjh.example'); await p.getByLabel('Password').fill('not-the-real-one-1'); await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.getByText('This workspace signs in with single sign-on.').waitFor();
  } }],
];

// ---- security fixtures: real tools, synthetic data ----
const SSO = { issuer: 'https://login.example-idp.test', clientId: 'vyakti-demo-client', allowedDomains: ['saanjh.example'], defaultRole: 'viewer', emailVerified: 'required', enabled: true };
async function toolDo(p, name, args = {}) {
  const base = new URL(p.url()).origin;
  let r = await (await p.request.post(`${base}/v1/tools/${name}`, { data: { args } })).json();
  if (r.status === 'needs_approval') r = await (await p.request.post(`${base}/v1/actions/${r.actionId}/decide`, { data: { approve: true } })).json();
  if (r.status !== 'confirmed') throw new Error(`${name}: ${JSON.stringify(r)}`);
  return r.result;
}
// The fake CRM is up before any page asks the server for a CRM list (the server reaches it through VP_CRM_FAKE_URL).
const fakeCrm = await startFakeCrm(Number(new URL(process.env.VP_CRM_FAKE_URL ?? 'http://127.0.0.1:8791').port)).catch(() => null);
async function connectHubspot(p) {
  const has = (await toolDo(p, 'integration.list')).integrations.some(i => i.kind === 'hubspot' && i.status === 'connected');
  if (!has) { const { stashId } = await toolDo(p, 'integration.stage_secrets', { kind: 'hubspot', secrets: { access_token: HS_TOKEN } }); await toolDo(p, 'integration.connect', { kind: 'hubspot', name: 'HubSpot (synthetic)', stashId }); }
  await p.reload({ waitUntil: 'networkidle' });
}
async function configureSso(p) {
  const cfg = await toolDo(p, 'sso.config.get');
  if (cfg.configured) return;
  const { stashId } = await toolDo(p, 'sso.secret.stage', { clientSecret: 'demo-secret-not-real-0001' });
  await toolDo(p, 'sso.config.set', { ...SSO, stashId });
  await p.reload({ waitUntil: 'networkidle' });
}
async function makeWebhook(p) {
  const hooks = (await toolDo(p, 'webhook.list')).webhooks;
  if (!hooks.some(h => h.description === 'Data warehouse')) {
    const made = await toolDo(p, 'webhook.create', { url: 'https://hooks.saanjh-warehouse.invalid/vyakti', events: ['call.ended', 'contact.opted_out'], description: 'Data warehouse' });
    await toolDo(p, 'webhook.test', { id: made.id });
  }
  await p.reload({ waitUntil: 'networkidle' });
}
async function makeTokenAndExport(p) {
  if ((await toolDo(p, 'scim.token.list')).tokens.length === 0) await toolDo(p, 'scim.token.create', { name: 'Entra ID provisioning', scopes: ['members:read', 'members:write'] });
  const day = n => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if ((await toolDo(p, 'audit.export.list')).exports.length === 0) {
    await toolDo(p, 'audit.export', { format: 'csv', from: day(30), to: day(0) });
    await toolDo(p, 'audit.export', { format: 'jsonl', from: day(7), to: day(0), privilegedOnly: true });
  }
  await p.reload({ waitUntil: 'networkidle' });
}
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
      await p2.goto(base + path); await p2.waitForTimeout(500); if (o.after) { await o.after(p2, tag); await p2.waitForTimeout(300); } await p2.screenshot({ path: `${out}${name}-${tag}.png`, fullPage: tag === 'm' && name.startsWith('signin') }); await c2.close(); continue;
    }
    if (o?.fresh) {
      // a brand-new synthetic workspace, so the empty state is real on every run
      const c3 = await browser.newContext({ viewport, ...extra, reducedMotion: 'reduce' }); const p3 = await c3.newPage();
      const em = `ops-${tag}@brightway.example`, pw = 'sample-password-5678';
      let rr = await p3.request.post(base + '/v1/login', { data: { email: em, password: pw } });
      if (!rr.ok()) await p3.request.post(base + '/v1/signup', { data: { workspace: 'Brightway Clinics ' + tag, name: 'Dev Menon', email: em, password: pw } });
      await p3.goto(base + path, { waitUntil: 'networkidle' }); await p3.waitForTimeout(500);
      if (tag === 'm') await p3.addStyleTag({ content: '.bottombar{position:static!important}' });
      if (tag === 'd') await p3.setViewportSize({ width: 1440, height: 3600 }); await p3.screenshot({ path: `${out}${name}-${tag}.png`, fullPage: tag === 'm' }); await c3.close(); continue;
    }
    errors.length = 0;
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(450);
    if (o?.before) await o.before(page, tag);
    if (o?.after) await o.after(page, tag);
    const file = `${out}${name}-${tag}.png`;
    if (tag === 'm') await page.addStyleTag({ content: '.bottombar{position:static!important}' });
    if (tag === 'd' && (name.startsWith('security') || name === 'settings-webhooks' || name === 'settings-notifications')) await page.setViewportSize({ width: 1440, height: Math.min(4200, Math.max(900, await page.evaluate(() => document.documentElement.scrollHeight))) });   // a tall window, not a stitched full page, so the fixed menu and dock draw once
    await page.screenshot({ path: file, fullPage: tag === 'm' && name !== 'security-require' });
    if (tag === 'd') await page.setViewportSize(viewport);
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
fakeCrm?.server?.close();
for (const r of report) console.log(`${r.hscroll || r.bad.length || r.errors.length ? '!!' : 'ok'} ${r.name}-${r.tag} ${r.kb}KB${r.hscroll ? ' HSCROLL sw=' + r.sw : ''}${r.bad.length ? ' bad=' + r.bad.join('|') : ''}${r.errors.length ? ' err=' + r.errors.join(' | ').slice(0, 200) : ''}`);
