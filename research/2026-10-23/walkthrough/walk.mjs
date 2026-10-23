// Buyer walkthrough: three operations heads each take a new workspace from nothing to a drafted campaign on the dev server
// (real tools, devsim for the browser call), then review calls, Insights, Settings and Activity in the seeded workspace, then mobile.
//   node research/2026-10-23/walkthrough/walk.mjs http://localhost:8799
// Writes shots/<persona>/NN-step.png and log.json (what worked, what failed, how long each step took).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const base = process.argv[2] ?? 'http://localhost:8799';
const root = fileURLToPath(new URL('./shots/', import.meta.url));
const PERSONAS = [
  { id: 'bank', who: 'Head of collections, a mid-size private bank', workspace: 'Karnataka Commercial Bank', name: 'Rohit Menon', template: 'EMI pre-due reminder', agent: 'EMI reminders, retail loans', cat: 'Service', job: 'Remind retail loan customers three days before an EMI is due and offer a payment link.',
    csv: 'Customer name,Mobile,Language,City,EMI amount,Due date,Loan reference\nAnil Kulkarni,9000010001,Kannada,Bengaluru,12450,12/01/2027,LN-48110\nMeera Shetty,9000010002,Hindi,Mangaluru,8800,14/01/2027,LN-48111\nSyed Imran,9000010003,Hindi,Mysuru,15200,15/01/2027,LN-48112\nLakshmi Rao,9000010004,Telugu,Hubballi,9900,18/01/2027,LN-48113\nPrakash Hegde,90000 10005,Kannada,Belagavi,7600,20/01/2027,LN-48114\nDeepa Nair,+91 9000010006,Malayalam,Bengaluru,11000,22/01/2027,LN-48115\nAnil Kulkarni,9000010001,Kannada,Bengaluru,12450,12/01/2027,LN-48110\nFarida Khan,,Hindi,Kalaburagi,6400,25/01/2027,LN-48116\n' },
  { id: 'd2c', who: 'Operations head, a D2C home-goods brand', workspace: 'Haveli Home Goods', name: 'Aditi Sharma', template: 'COD order verification', agent: 'COD confirmation', cat: 'Transactional', job: 'Confirm cash-on-delivery orders and the delivery address before dispatch.',
    csv: 'Customer,Phone,Language,City,Order value,Order number,Item\nVikas Jain,9000020001,Hindi,Jaipur,2499,HH-77001,Cotton quilt\nSana Ali,9000020002,Hindi,Lucknow,1899,HH-77002,Dinner set\nKiran Patel,9000020003,Gujarati,Surat,3299,HH-77003,Floor lamp\nRamesh Iyer,9000020004,Tamil,Chennai,1299,HH-77004,Cushion covers\nNeha Gupta,90000 20005,Hindi,Delhi,4599,HH-77005,Bed linen set\nTarun Das,+91 9000020006,Bengali,Kolkata,2199,HH-77006,Table runner\nVikas Jain,9000020001,Hindi,Jaipur,2499,HH-77001,Cotton quilt\n' },
  { id: 'hospital', who: 'Patient services head, a multi-speciality hospital', workspace: 'Sahyadri Care Hospitals', name: 'Dr. Smita Joshi', template: 'Clinic appointment confirmation', agent: 'Appointment reminders', cat: 'Service', job: 'Confirm or reschedule outpatient appointments the day before and remind patients what to bring.',
    csv: 'Patient name,Mobile,Language,Department,Appointment,Doctor\nSuresh Patil,9000030001,Marathi,Cardiology,18/01/2027,Dr Kulkarni\nAsha Deshpande,9000030002,Marathi,Orthopaedics,18/01/2027,Dr Rane\nIrfan Shaikh,9000030003,Hindi,General medicine,19/01/2027,Dr Bhide\nLata More,9000030004,Marathi,Gynaecology,19/01/2027,Dr Phadke\nGopal Rao,90000 30005,Telugu,Neurology,20/01/2027,Dr Sathe\nNandini Gokhale,+91 9000030006,Marathi,Dermatology,20/01/2027,Dr Apte\n' },
];
const log = [];
const b = await chromium.launch();
const ts = () => Date.now();
async function persona(P) {
  const dir = root + P.id + '/'; mkdirSync(dir, { recursive: true });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', permissions: ['microphone'] });
  const p = await c.newPage();
  const consoleErrors = []; p.on('pageerror', e => consoleErrors.push(String(e.message))); p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  let n = 0;
  const step = async (name, fn) => {
    n++; const id = String(n).padStart(2, '0') + '-' + name; const t0 = ts(); let err = null;
    try { await fn(); } catch (e) { err = String(e.message).split('\n')[0].slice(0, 300); }
    try { await p.screenshot({ path: dir + id + '.png', fullPage: true }); } catch { /* page gone */ }
    log.push({ persona: P.id, step: id, ms: ts() - t0, error: err, url: p.url().replace(base, '') });
    console.log(err ? '!! ' : 'ok ', P.id, id, err ?? '');
  };
  const hold = async loc => { await loc.scrollIntoViewIfNeeded(); const bb = await loc.boundingBox(); const el = await loc.elementHandle(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down();
    try { await p.waitForFunction(e => e.classList.contains('holding'), el, { timeout: 5000 }); await p.waitForFunction(e => !e.classList.contains('holding'), el, { timeout: 10000 }); } finally { await p.mouse.up(); } };
  const email = `${P.id}.${Date.now()}@walkthrough.example`;
  await step('signup-page', async () => { await p.goto(base + '/signup'); await p.getByLabel('Business name').waitFor(); });
  await step('signup-submitted', async () => { await p.getByLabel('Business name').fill(P.workspace); await p.getByLabel('Your name').fill(P.name); await p.getByLabel('Work email').fill(email); await p.getByLabel('Password').fill('walkthrough-pass-2026'); await p.getByRole('button', { name: 'Create workspace' }).click(); await p.getByRole('heading', { name: 'Today' }).waitFor({ timeout: 15000 }); });
  await step('today-empty', async () => { await p.getByRole('heading', { name: 'Get started' }).waitFor(); });
  await step('assistant-describe', async () => { await p.locator('#dock-input').fill(`Build a calling agent for this job: ${P.job}`); await p.keyboard.press('Enter'); await p.waitForTimeout(6000); });
  await step('start-templates', async () => { await p.goto(base + '/'); await p.getByRole('radio', { name: 'Start from a template' }).click(); await p.getByRole('radio', { name: new RegExp(P.template) }).first().waitFor(); });
  await step('template-chosen', async () => { await p.getByRole('radio', { name: new RegExp(P.template) }).first().click(); await p.getByLabel('Agent name').fill(P.agent); });
  await step('agent-created', async () => { await p.getByRole('button', { name: 'Create draft' }).click(); await p.waitForURL('**/agents/*'); await p.getByRole('heading', { name: P.agent }).waitFor({ timeout: 10000 }); });
  const agentUrl = () => p.url().split('?')[0];
  for (const [tab, label] of [['persona', 'Persona'], ['job', 'Job and facts'], ['rules', 'Objections, hand-off'], ['tools', 'Tools'], ['voice', 'Voice stack'], ['versions', 'Versions']])
    await step('agent-' + tab, async () => { await p.goto(agentUrl() + '?tab=' + tab); await p.waitForTimeout(700); });
  await step('test-panel', async () => { await p.goto(agentUrl()); await p.getByRole('radio', { name: 'Test her' }).click(); await p.getByRole('button', { name: /^Run \d+ practice callers?$/ }).waitFor(); });
  await step('practice-callers-run', async () => { await p.getByRole('button', { name: /^Run \d+ practice callers?$/ }).click(); await p.getByText(/\d+ of \d+ passed/).waitFor({ timeout: 60000 }); });
  await step('browser-call', async () => { await p.goto(agentUrl() + '?test=1'); await p.getByRole('button', { name: 'Call me in the browser' }).click(); await p.locator('.bcall').waitFor({ timeout: 20000 }); await p.waitForTimeout(3000); });
  await step('browser-call-ended', async () => { const end = p.getByRole('button', { name: /End|Hang up/i }).first(); if (await end.count()) await end.click(); await p.waitForTimeout(1500); });
  await step('publish-sheet', async () => { await p.goto(agentUrl()); await p.getByRole('button', { name: 'Publish…' }).click(); await p.getByRole('dialog').getByRole('heading', { name: 'Approve to continue' }).waitFor(); });
  await step('published', async () => { await hold(p.getByRole('dialog').locator('.hold')); await p.getByRole('dialog').waitFor({ state: 'detached', timeout: 15000 }); await p.waitForTimeout(800); });
  await step('import-empty', async () => { await p.goto(base + '/contacts/import'); await p.getByLabel('Your list').waitFor(); });
  await step('import-pasted', async () => { await p.getByLabel('Your list').fill(P.csv); await p.getByRole('button', { name: 'Check the file' }).click(); await p.getByText('3. What will happen to each row').waitFor({ timeout: 15000 }); });
  await step('import-saved', async () => { await p.getByRole('button', { name: /^Save \d+ contacts?$/ }).click(); await p.getByText('List imported', { exact: false }).first().waitFor({ timeout: 15000 }); });
  await step('contacts-list', async () => { await p.goto(base + '/contacts'); await p.getByText('shown').first().waitFor(); });
  await step('contact-page', async () => { await p.locator('table tbody tr, .tcard').first().click(); await p.getByText('Can she call?').waitFor(); });
  await step('audiences', async () => { await p.goto(base + '/audiences'); await p.waitForTimeout(800); });
  await step('campaign-new', async () => { await p.goto(base + '/campaigns/new'); await p.getByLabel('Campaign name').waitFor(); });
  await step('campaign-filled', async () => { await p.getByRole('radio', { name: new RegExp(P.cat) }).first().click(); await p.getByLabel('Campaign name').fill(P.agent + ' pilot'); await p.getByLabel('Agent').selectOption({ index: 1 }); await p.getByLabel('Who to call').selectOption({ index: 1 }); });
  await step('campaign-draft', async () => { await p.getByRole('button', { name: 'Save draft' }).click(); await p.waitForURL(u => /\/campaigns\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 15000 }); await p.getByText('What it will cost').waitFor({ timeout: 15000 }); });
  await step('campaign-estimate', async () => { await p.waitForTimeout(1500); });
  await step('numbers', async () => { await p.goto(base + '/numbers'); await p.waitForTimeout(800); });
  await step('today-after', async () => { await p.goto(base + '/'); await p.waitForTimeout(1000); });
  await step('activity', async () => { await p.goto(base + '/settings/activity'); await p.waitForTimeout(800); });
  writeFileSync(dir + 'console-errors.json', JSON.stringify([...new Set(consoleErrors)], null, 1));
  // mobile pass in the same workspace
  const state = await c.storageState(); await c.close();
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', storageState: state });
  const mp = await m.newPage();
  const agentId = log.filter(l => l.persona === P.id && l.step.endsWith('agent-created')).map(l => l.url)[0];
  for (const [name, url] of [['today', '/'], ['agent', agentId], ['agent-voice', agentId + '?tab=voice'], ['import', '/contacts/import'], ['contacts', '/contacts'], ['campaigns', '/campaigns'], ['numbers', '/numbers']]) {
    const t0 = ts(); let err = null; try { await mp.goto(base + url); await mp.waitForTimeout(1200); const sw = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (sw > 1) err = `horizontal scroll of ${sw}px`; } catch (e) { err = String(e.message).split('\n')[0]; }
    await mp.screenshot({ path: dir + `m-${name}.png`, fullPage: true }).catch(() => {});
    log.push({ persona: P.id, step: 'm-' + name, ms: ts() - t0, error: err, url }); console.log(err ? '!! ' : 'ok ', P.id, 'm-' + name, err ?? '');
  }
  await m.close();
}
for (const P of PERSONAS) await persona(P);
// the seeded workspace: review calls, Insights, Settings and Activity
{
  const dir = root + 'review/'; mkdirSync(dir, { recursive: true });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await c.request.post(base + '/v1/login', { data: { email: 'asha@saanjh.example', password: 'sample-password-1234' } });
  const p = await c.newPage();
  const calls = (await (await c.request.post(base + '/v1/tools/call.search', { data: { args: {} } })).json()).result.calls;
  let n = 0;
  for (const [name, url] of [['calls', '/calls'], ['call', `/calls/${calls[2]?.id ?? calls[0].id}`], ['call-opt-out', `/calls/${calls[1]?.id ?? calls[0].id}`], ['insights', '/insights'], ['settings-team', '/settings/team'], ['settings-keys', '/settings/keys'], ['settings-brand', '/settings/brand'], ['settings-knowledge', '/settings/knowledge'], ['settings-billing', '/settings/billing'], ['settings-compliance', '/settings/compliance'], ['settings-privacy', '/settings/privacy'], ['settings-assistant', '/settings/operator'], ['settings-integrations', '/settings/integrations'], ['settings-activity', '/settings/activity']]) {
    n++; const t0 = ts(); let err = null; try { await p.goto(base + url); await p.waitForTimeout(1200); } catch (e) { err = String(e.message).split('\n')[0]; }
    await p.screenshot({ path: dir + String(n).padStart(2, '0') + '-' + name + '.png', fullPage: true });
    log.push({ persona: 'review', step: String(n).padStart(2, '0') + '-' + name, ms: ts() - t0, error: err, url }); console.log(err ? '!! ' : 'ok ', 'review', name, err ?? '');
  }
  const state = await c.storageState(); await c.close();
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', storageState: state });
  const mp = await m.newPage();
  for (const [name, url] of [['calls', '/calls'], ['call', `/calls/${calls[2]?.id ?? calls[0].id}`], ['insights', '/insights'], ['settings-team', '/settings/team'], ['settings-activity', '/settings/activity'], ['today', '/']]) {
    let err = null; try { await mp.goto(base + url); await mp.waitForTimeout(1200); const sw = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (sw > 1) err = `horizontal scroll of ${sw}px`; } catch (e) { err = String(e.message).split('\n')[0]; }
    await mp.screenshot({ path: dir + `m-${name}.png`, fullPage: true }); log.push({ persona: 'review', step: 'm-' + name, ms: 0, error: err, url }); console.log(err ? '!! ' : 'ok ', 'review m-' + name, err ?? '');
  }
}
await b.close();
writeFileSync(fileURLToPath(new URL('./log.json', import.meta.url)), JSON.stringify(log, null, 1));
console.log('done', log.length, 'steps,', log.filter(l => l.error).length, 'failed');
