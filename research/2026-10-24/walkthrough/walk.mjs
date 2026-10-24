// Buyer walkthrough, round 2: two buyers each take a new workspace from nothing to a campaign that is ready to launch on the dev
// server (real tools, devsim for the browser call, a fake microphone), on desktop (1440) and on phone (390), then review the seeded
// workspace's calls, Insights, approvals, Settings and Activity at both widths.
//   node research/2026-10-24/walkthrough/walk.mjs http://localhost:8811 [persona-id] [d|m]
// Writes shots/<persona>-<d|m>/NN-step.png and log.json (what worked, what failed, how long each step took).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
let pw; for (const b of [import.meta.url, 'file:///home/user/sales-enabler/', 'file:///opt/node-tools/node_modules/']) { try { pw = createRequire(b)('playwright'); break; } catch { /* next */ } }
const { chromium } = pw;
const base = process.argv[2] ?? 'http://localhost:8811';
const only = process.argv[3], onlyVp = process.argv[4];
const root = fileURLToPath(new URL('./shots/', import.meta.url));
const logPath = fileURLToPath(new URL('./log.json', import.meta.url));
const PERSONAS = [
  { id: 'nbfc', who: 'Head of collections, a large NBFC', workspace: 'Deccan Fincorp', name: 'Kiran Rao', industry: 'Lending', template: 'EMI pre-due reminder', agent: 'EMI reminders, two-wheeler loans', cat: 'Transactional',
    job: 'Remind two-wheeler loan customers three days before their EMI is due, confirm they will pay, and send a payment link on WhatsApp if they ask.',
    csv: 'Customer name,Mobile,Language,City,EMI amount,Due date,Loan account\nRamesh Gowda,9000040001,Kannada,Bengaluru,3450,05/02/2027,TW-90011\nPooja Verma,9000040002,Hindi,Indore,2890,05/02/2027,TW-90012\nSandeep Reddy,9000040003,Telugu,Hyderabad,4100,06/02/2027,TW-90013\nFatima Shaikh,9000040004,Hindi,Pune,3150,06/02/2027,TW-90014\nVijay Kumar,90000 40005,Tamil,Chennai,2750,07/02/2027,TW-90015\nAnita Das,+91 9000040006,Bengali,Kolkata,3600,07/02/2027,TW-90016\nRamesh Gowda,9000040001,Kannada,Bengaluru,3450,05/02/2027,TW-90011\nGaurav Singh,12345,Hindi,Lucknow,2990,08/02/2027,TW-90017\n' },
  { id: 'hospital', who: 'Operations lead, a hospital chain', workspace: 'Nirmal Hospitals', name: 'Meenal Kulkarni', industry: 'Healthcare', template: 'Clinic appointment confirmation', agent: 'OPD appointment confirmations', cat: 'Service',
    job: 'Call patients the day before their outpatient appointment to confirm they are coming, offer to reschedule, and remind them to bring old reports.',
    csv: 'Patient name,Mobile,Language,Branch,Appointment date,Doctor,Department\nSuresh Pawar,9000050001,Marathi,Kothrud,19/02/2027,Dr Joshi,Cardiology\nRekha Iyer,9000050002,Tamil,Aundh,19/02/2027,Dr Menon,Orthopaedics\nImran Qureshi,9000050003,Hindi,Kothrud,20/02/2027,Dr Bhave,General medicine\nSunita Jadhav,9000050004,Marathi,Wakad,20/02/2027,Dr Gokhale,Gynaecology\nArjun Nair,90000 50005,Malayalam,Aundh,21/02/2027,Dr Pillai,Neurology\n' },
];
const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')).filter(l => !(only && l.persona.startsWith(only) && (!onlyVp || l.persona.endsWith('-' + onlyVp)))) : [];
// 16 kHz mono WAV, a voiced, speech-loud sound then quiet, as the fake microphone (synthetic; nobody's voice).
function callerWav() {
  const rate = 16000, secs = 8, n = rate * secs, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) { const t = i / rate, on = (t % 4) < 1; const v = on ? 0.35 * (Math.sin(2 * Math.PI * 140 * t) + 0.5 * Math.sin(2 * Math.PI * 280 * t)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) : 0; data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32000), i * 2); }
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const wav = path.join(os.tmpdir(), 'walk2-caller.wav'); writeFileSync(wav, callerWav());
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'] });
const VP = { d: { viewport: { width: 1440, height: 900 } }, m: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } };
const ts = () => Date.now();

function stepper(tag, p, dir) {
  let n = 0;
  return async (name, fn) => {
    n++; const id = String(n).padStart(2, '0') + '-' + name; const t0 = ts(); let err = null, hscroll = 0;
    try { await fn(); } catch (e) { err = String(e.message).split('\n')[0].slice(0, 300); }
    try { hscroll = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); } catch { /* gone */ }
    try { await p.screenshot({ path: dir + id + '.png', fullPage: true }); } catch { /* page gone */ }
    log.push({ persona: tag, step: id, ms: ts() - t0, error: err, hscroll: hscroll > 1 ? hscroll : undefined, url: p.url().replace(base, '') });
    console.log(err ? '!! ' : 'ok ', tag, id, err ?? '', hscroll > 1 ? `HSCROLL ${hscroll}` : '');
  };
}
const holdOn = async (p, loc) => { await loc.scrollIntoViewIfNeeded(); const bb = await loc.boundingBox(); const el = await loc.elementHandle(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down();
  try { await p.waitForFunction(e => e.classList.contains('holding'), el, { timeout: 5000 }); await p.waitForFunction(e => !e.classList.contains('holding'), el, { timeout: 10000 }); } finally { await p.mouse.up(); } };
// The assistant: a dock on desktop, a "Talk" view on phone.
async function ask(p, text) {
  const input = p.locator('#dock-input');
  if (!(await input.isVisible().catch(() => false))) { const talk = p.getByRole('button', { name: /assistant|talk/i }).or(p.getByRole('link', { name: /assistant|talk/i })).first(); if (await talk.count()) await talk.click(); }
  await input.fill(text); await p.keyboard.press('Enter'); await p.waitForTimeout(3500);
}

async function persona(P, vp) {
  const tag = `${P.id}-${vp}`, dir = root + tag + '/'; mkdirSync(dir, { recursive: true });
  const c = await b.newContext({ ...VP[vp], reducedMotion: 'reduce', permissions: ['microphone'] });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const step = stepper(tag, p, dir);
  const email = `${tag}.${Date.now()}@walkthrough.example`;
  await step('signup', async () => { await p.goto(base + '/signup'); await p.getByLabel('Business name').fill(P.workspace); await p.getByLabel('Your name').fill(P.name); await p.getByLabel('Work email').fill(email); await p.getByLabel('Password').fill('walkthrough-pass-2026'); });
  await step('today-first-run', async () => { await p.getByRole('button', { name: 'Create workspace' }).click(); await p.getByRole('heading', { name: 'Get started' }).waitFor({ timeout: 15000 }); });
  await step('describe-job', async () => { await p.getByLabel('What should the calls do?').fill(P.job); });
  await step('describe-asked', async () => { await p.getByRole('button', { name: 'Ask the assistant to build it' }).click(); await p.waitForTimeout(4000); });
  await step('templates', async () => { await p.goto(base + '/'); await p.getByRole('radio', { name: 'Start from a template' }).click(); await p.getByRole('radio', { name: P.industry, exact: true }).click(); });
  await step('template-chosen', async () => { await p.getByRole('radio', { name: new RegExp(P.template) }).first().click(); await p.getByLabel('Agent name').fill(P.agent); });
  await step('agent-created', async () => { await p.getByRole('button', { name: 'Create draft' }).click(); await p.waitForURL('**/agents/*', { timeout: 15000 }); await p.getByRole('heading', { name: P.agent }).waitFor({ timeout: 10000 }); await p.waitForTimeout(800); });
  const agentUrl = p.url().split('?')[0];
  for (const tab of ['persona', 'job', 'rules', 'tools', 'versions']) await step('agent-' + tab, async () => { await p.goto(agentUrl + '?tab=' + tab); await p.waitForTimeout(700); });
  await step('brief-edit', async () => { await p.goto(agentUrl + '?tab=job'); const ta = p.locator('main textarea').first(); await ta.click(); await ta.press('End'); await ta.type(' Never threaten or shame anyone about a late payment.'); await p.getByText('Draft · unsaved').first().waitFor(); });
  await step('brief-saved', async () => { await p.getByRole('button', { name: 'Save draft' }).click(); await p.getByText(/Draft saved/).first().waitFor({ timeout: 10000 }); });
  await step('stack', async () => { await p.goto(agentUrl + '?tab=voice'); await p.getByRole('heading', { name: 'Recommended stacks' }).waitFor(); });
  await step('stack-build-own', async () => { await p.getByRole('heading', { name: 'Build your own' }).scrollIntoViewIfNeeded(); for (const sel of await p.locator('.partpick select').all()) { const n = await sel.locator('option').count(); if (n > 1) await sel.selectOption({ index: 1 }); } await p.waitForTimeout(800); });
  await step('test-panel', async () => { await p.goto(agentUrl); await p.getByRole('button', { name: 'Test her' }).first().click(); await p.getByRole('button', { name: /^Run \d+ practice callers?$/ }).waitFor({ timeout: 8000 }); });
  await step('practice-run', async () => { await p.getByRole('button', { name: /^Run \d+ practice callers?$/ }).click(); await p.getByText(/\d+ of \d+ passed/).waitFor({ timeout: 60000 }); });
  await step('browser-call', async () => { await p.goto(agentUrl + '?test=1'); await p.getByRole('button', { name: 'Call me in the browser' }).click(); await p.locator('.bcall').waitFor({ timeout: 20000 }); await p.waitForTimeout(7000); });
  await step('browser-call-ended', async () => { const end = p.getByRole('button', { name: /End call|Hang up|End/i }).first(); if (await end.count()) await end.click(); await p.waitForTimeout(2500); });
  await step('publish-sheet', async () => { await p.goto(agentUrl); await p.getByRole('button', { name: 'Publish…' }).click(); await p.getByRole('dialog').getByRole('heading', { name: 'Approve to continue' }).waitFor(); });
  await step('published', async () => { await holdOn(p, p.getByRole('dialog').locator('.hold')); await p.getByRole('dialog').waitFor({ state: 'detached', timeout: 15000 }); await p.waitForTimeout(800); });
  await step('import', async () => { await p.goto(base + '/contacts/import'); await p.getByLabel('Your list').fill(P.csv); });
  await step('import-checked', async () => { await p.getByRole('button', { name: 'Check the file' }).click(); await p.getByText('3. What will happen to each row').waitFor({ timeout: 15000 }); });
  await step('import-saved', async () => { await p.getByRole('button', { name: /^Save \d+ contacts?$/ }).click(); await p.getByText('List imported', { exact: false }).first().waitFor({ timeout: 15000 }); });
  await step('contacts', async () => { await p.goto(base + '/contacts'); await p.getByText('shown').first().waitFor(); });
  await step('contact', async () => { await p.locator('table tbody tr, .tcard').first().click(); await p.getByText('Can she call?').waitFor(); });
  await step('contact-dnd', async () => { const btn = p.getByRole('button', { name: /DND|register/i }).first(); if (await btn.count()) { await btn.click(); await p.waitForTimeout(1500); } else throw new Error('no DND action on the contact page'); });
  await step('campaign-new', async () => { await p.goto(base + '/campaigns/new'); await p.getByLabel('Campaign name').fill(P.agent + ' pilot'); await p.getByLabel('Agent').selectOption({ index: 1 }); await p.getByLabel('Who to call').selectOption({ index: 1 }); await p.waitForTimeout(500); });
  await step('campaign-draft', async () => { await p.getByRole('button', { name: 'Save draft' }).click(); await p.waitForURL(u => /\/campaigns\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 15000 }); await p.getByText('What it will cost').waitFor({ timeout: 15000 }); await p.waitForTimeout(1200); });
  const campUrl = p.url();
  await step('campaign-cap', async () => { await p.getByRole('button', { name: 'Set a limit' }).first().click(); await p.waitForTimeout(800); });
  await step('campaign-launch-checks', async () => { await p.goto(campUrl); await p.getByText(/launch|Launch/).first().waitFor(); await p.waitForTimeout(800); });
  await step('numbers', async () => { await p.goto(base + '/numbers'); await p.waitForTimeout(1000); });
  await step('numbers-search', async () => { await p.getByRole('button', { name: 'Search' }).click(); await p.waitForTimeout(1500); });
  await step('billing', async () => { await p.goto(base + '/settings/billing'); await p.waitForTimeout(1000); });
  await step('op-page-question', async () => { await p.goto(campUrl); await ask(p, 'What is still stopping this campaign from launching?'); });
  await step('op-topup', async () => { await ask(p, 'Top up the wallet by 5000 rupees'); });
  await step('op-plan', async () => { await ask(p, 'Make a plan to launch this campaign tomorrow morning'); });
  await step('today-after', async () => { await p.goto(base + '/'); await p.waitForTimeout(1200); });
  await step('approval-from-today', async () => { await p.getByRole('button', { name: 'Review' }).first().click(); await p.getByRole('dialog').waitFor({ timeout: 5000 }); });
  await step('activity', async () => { await p.goto(base + '/settings/activity'); await p.waitForTimeout(1000); });
  writeFileSync(dir + 'console-errors.json', JSON.stringify([...new Set(errs)], null, 1));
  await c.close();
}

async function review(vp) {
  const tag = `review-${vp}`, dir = root + tag + '/'; mkdirSync(dir, { recursive: true });
  const c = await b.newContext({ ...VP[vp], reducedMotion: 'reduce' });
  await c.request.post(base + '/v1/login', { data: { email: 'asha@saanjh.example', password: 'sample-password-1234' } });
  const p = await c.newPage(); const step = stepper(tag, p, dir);
  const calls = (await (await c.request.post(base + '/v1/tools/call.search', { data: { args: {} } })).json()).result.calls;
  const camps = (await (await c.request.post(base + '/v1/tools/campaign.list', { data: { args: {} } })).json()).result?.campaigns ?? [];
  const pages = [['today', '/'], ['calls', '/calls'], ['call', `/calls/${calls[0]?.id}`], ['call-2', `/calls/${calls[1]?.id ?? calls[0].id}`], ['call-3', `/calls/${calls[2]?.id ?? calls[0].id}`],
    ['campaigns', '/campaigns'], ['campaign', camps[0] ? `/campaigns/${camps[0].id}` : '/campaigns'], ['agents', '/agents'], ['insights', '/insights'], ['contacts', '/contacts'], ['audiences', '/audiences'], ['numbers', '/numbers'],
    ['settings', '/settings'], ['settings-team', '/settings/team'], ['settings-keys', '/settings/keys'], ['settings-brand', '/settings/brand'], ['settings-knowledge', '/settings/knowledge'], ['settings-billing', '/settings/billing'],
    ['settings-compliance', '/settings/compliance'], ['settings-privacy', '/settings/privacy'], ['settings-operator', '/settings/operator'], ['settings-integrations', '/settings/integrations'], ['settings-activity', '/settings/activity']];
  for (const [name, url] of pages) await step(name, async () => { await p.goto(base + url); await p.waitForTimeout(1300); });
  await step('call-play', async () => { await p.goto(base + `/calls/${calls[0].id}`); const play = p.getByRole('button', { name: /Play/i }).first(); await play.click(); await p.waitForTimeout(1500); });
  await step('op-insight-question', async () => { await p.goto(base + '/insights'); await ask(p, 'Why did people object most this week?'); });
  await step('op-launch-plan', async () => { await ask(p, 'Plan the launch for the Pune list'); });
  await step('approval-sheet', async () => { const btn = p.getByRole('button', { name: /Review|Approve/ }).first(); await btn.click(); await p.getByRole('dialog').waitFor({ timeout: 5000 }); });
  await c.close();
}

for (const P of PERSONAS) for (const vp of ['d', 'm']) if ((!only || only === P.id) && (!onlyVp || onlyVp === vp)) await persona(P, vp);
for (const vp of ['d', 'm']) if ((!only || only === 'review') && (!onlyVp || onlyVp === vp)) await review(vp);
await b.close();
writeFileSync(logPath, JSON.stringify(log, null, 1));
console.log('done', log.length, 'steps,', log.filter(l => l.error).length, 'failed,', log.filter(l => l.hscroll).length, 'with horizontal scroll');
