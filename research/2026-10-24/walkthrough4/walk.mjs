// Buyer walkthrough, round 4 (owner directive 2026-10-24, calling first): a new enterprise buyer, end to end, at 1440 and 390,
// against the best of six competitors (research/2026-10-21/walkthroughs/): sign up, first agent, company data, choose a stack,
// test it (browser call, practice chat, practice callers), import, campaign, a call to their own phone, the call log, insights.
//   node research/2026-10-24/walkthrough4/walk.mjs http://localhost:8811 [persona-id] [d|m]
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
  { id: 'nbfc', who: 'Head of collections, a large housing-finance NBFC', workspace: 'Kaveri Housing Finance', name: 'Ritu Menon', industry: 'Lending', template: 'EMI pre-due reminder', agent: 'EMI reminders, Pune',
    job: 'Call home-loan customers five days before their EMI is due, remind them of the amount and date, offer the payment link, and note when they will pay.',
    knowledge: 'EMI payments can be made through the payment link we send by SMS, by NACH auto-debit, or at any Kaveri branch. A late payment charge of 2% a month applies after the due date. Customers can change their EMI date once a year from the customer portal.',
    csv: 'Customer name,Mobile,Language,City,Loan ID,EMI amount,Due date\n' + Array.from({ length: 24 }, (_, i) => `${['Asha Rao','Vikram Shah','Meena Iyer','Rahul Gupta','Sana Khan','Arjun Nair'][i % 6]} ${i + 1},${9000080000 + i},${['Hindi','English','Marathi','Hinglish'][i % 4]},Pune,KHF-${7100 + i},${12000 + i * 350},2026-11-0${(i % 9) + 1}`).join('\n') },
];
const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')).filter(l => !(only && l.persona.startsWith(only) && (!onlyVp || l.persona.endsWith('-' + onlyVp)))) : [];
// 16 kHz mono WAV, a voiced, speech-loud sound then quiet, as the fake microphone (synthetic; nobody's voice).
function callerWav() {
  const rate = 16000, secs = 8, n = rate * secs, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) { const t = i / rate, on = (t % 4) < 1; const v = on ? 0.35 * (Math.sin(2 * Math.PI * 140 * t) + 0.5 * Math.sin(2 * Math.PI * 280 * t)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) : 0; data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32000), i * 2); }
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const wav = path.join(os.tmpdir(), 'walk3-caller.wav'); writeFileSync(wav, callerWav());
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
  // The dock loads lazily on its first open: give it a moment before tapping Assistant, which would toggle it shut.
  await input.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
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
  // 1. Sign up and the first screen
  await step('signup', async () => { await p.goto(base + '/signup'); await p.getByLabel('Business name').fill(P.workspace); await p.getByLabel('Your name').fill(P.name); await p.getByLabel('Work email').fill(email); await p.getByLabel('Password').fill('walkthrough-pass-1234'); });
  await step('first-screen', async () => { await p.getByRole('button', { name: 'Create workspace' }).click(); await p.getByRole('heading', { name: 'Get started' }).waitFor({ timeout: 15000 }); await p.waitForTimeout(800); });
  for (const [n, u] of [['empty-agents', '/agents'], ['empty-contacts', '/contacts'], ['empty-campaigns', '/campaigns'], ['empty-calls', '/calls'], ['empty-insights', '/insights'], ['empty-numbers', '/numbers'], ['empty-billing', '/settings/billing']])
    await step(n, async () => { await p.goto(base + u); await p.waitForTimeout(1000); });
  // 2. The first agent
  await step('describe-job', async () => { await p.goto(base + '/'); await p.getByLabel('What should the calls do?').fill(P.job); });
  await step('templates', async () => { await p.getByRole('radio', { name: 'Start from a template' }).click(); await p.getByRole('radio', { name: P.industry, exact: true }).click(); });
  await step('template-chosen', async () => { await p.getByRole('radio', { name: new RegExp(P.template) }).first().click(); await p.getByLabel('Agent name').fill(P.agent); });
  await step('agent-created', async () => { await p.getByRole('button', { name: 'Create draft' }).click(); await p.waitForURL('**/agents/*', { timeout: 15000 }); await p.waitForTimeout(1200); });
  const agentUrl = p.url().split('?')[0];
  for (const tab of ['persona', 'job', 'rules', 'tools']) await step('agent-' + tab, async () => { await p.goto(agentUrl + '?tab=' + tab); await p.waitForTimeout(700); });
  // 3. Company data
  await step('knowledge', async () => { await p.goto(base + '/settings/knowledge'); await p.getByLabel('Title').fill('EMI payment options and charges'); await p.getByLabel('Text').fill(P.knowledge); });
  await step('knowledge-added', async () => { await p.getByRole('button', { name: 'Add source' }).click(); await p.waitForTimeout(2000); });
  await step('brand', async () => { await p.goto(base + '/settings/brand'); await p.waitForTimeout(800); });
  // 4. Choose a stack
  await step('stack', async () => { await p.goto(agentUrl + '?tab=voice'); await p.getByRole('heading', { name: 'Recommended stacks' }).waitFor(); await p.waitForTimeout(1500); });
  await step('stack-build-own', async () => { await p.getByText('Show the parts').click(); await p.waitForTimeout(800); });
  // 5. Test it
  await step('test-panel', async () => { await p.goto(agentUrl + '?test=1'); await p.waitForTimeout(1500); });
  await step('browser-call', async () => { await p.getByRole('button', { name: 'Call me in the browser' }).click(); await p.locator('.bcall').waitFor({ timeout: 20000 }); await p.waitForTimeout(6000); });
  await step('browser-call-ended', async () => { const end = p.getByRole('button', { name: /Hang up|End call/i }).first(); if (await end.count()) await end.click(); await p.waitForTimeout(2000); });
  await step('practice-chat', async () => { await p.goto(agentUrl + '?test=1'); const t = p.getByText('Practice chat', { exact: true }).first(); await t.scrollIntoViewIfNeeded(); await p.getByRole('button', { name: 'Let her open' }).click(); await p.waitForTimeout(3000); });
  await step('practice-chat-reply', async () => { await p.getByPlaceholder('Type what the caller says').fill('Haan bolo, kitna dena hai is mahine?'); await p.getByRole('button', { name: 'Send' }).last().click(); await p.waitForTimeout(3500); });
  await step('practice-callers', async () => { const run = p.getByRole('button', { name: /^Run \d+ practice callers?$/ }); await run.scrollIntoViewIfNeeded(); await run.click(); await p.getByText(/\d+ of \d+ passed/).waitFor({ timeout: 60000 }); });
  await step('publish-sheet', async () => { await p.goto(agentUrl); await p.getByRole('button', { name: 'Publish…' }).click(); await p.getByRole('dialog').waitFor(); });
  await step('published', async () => { await holdOn(p, p.getByRole('dialog').locator('.hold')); await p.getByRole('dialog').waitFor({ state: 'detached', timeout: 15000 }); await p.waitForTimeout(800); });
  // 6. Import
  await step('import', async () => { await p.goto(base + '/contacts/import'); await p.waitForTimeout(800); });
  await step('import-pasted', async () => { await p.getByLabel('Your list').fill(P.csv); });
  await step('import-checked', async () => { await p.getByRole('button', { name: 'Check the file' }).click(); await p.getByText('3. What will happen to each row').waitFor({ timeout: 15000 }); });
  await step('import-saved', async () => { await p.getByRole('button', { name: /^Save \d+ contacts?$/ }).click(); await p.waitForTimeout(2500); });
  await step('contacts', async () => { await p.goto(base + '/contacts'); await p.waitForTimeout(1000); });
  // 7. Campaign
  await step('campaign-new', async () => { await p.goto(base + '/campaigns/new'); await p.getByRole('radio', { name: /Service/ }).first().click().catch(() => {}); await p.getByLabel('Campaign name').fill(P.agent + ' November'); await p.getByLabel('Agent').selectOption({ index: 1 }); await p.getByLabel('Who to call').selectOption({ index: 1 }); });
  await step('campaign-draft', async () => { await p.getByRole('button', { name: /Save draft/ }).click(); await p.waitForURL(u => /\/campaigns\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 15000 }); await p.waitForTimeout(1500); });
  const campUrl = p.url();
  await step('campaign-launch-card', async () => { const l = p.getByRole('button', { name: /^Launch/ }).first(); if (await l.isEnabled().catch(() => false)) { await l.click(); await p.waitForTimeout(1500); } else throw new Error('Launch is not available yet (see the checks on the page)'); });
  // 8. A call to their own phone
  await step('numbers', async () => { await p.goto(base + '/numbers'); await p.waitForTimeout(1200); });
  await step('numbers-ring-me', async () => { const f = p.getByLabel(/mobile number|Your number/i).first(); await f.fill('9000080099'); await p.getByRole('button', { name: /Ring me with a code/ }).click(); await p.waitForTimeout(2500); });
  // 9. The call log
  await step('calls', async () => { await p.goto(base + '/calls?view=test'); await p.waitForTimeout(1200); });
  await step('call-page', async () => { await p.locator('table tbody tr, .tcard').first().click(); await p.waitForTimeout(1800); });
  // 10. Insights, and the assistant setting things up by talking
  await step('insights', async () => { await p.goto(base + '/insights'); await p.waitForTimeout(1200); });
  await step('op-setup', async () => { await p.goto(base + '/'); await ask(p, 'Set up reminder calls for the Pune list, starting next Monday morning'); });
  await step('op-what-went-wrong', async () => { await p.goto(campUrl); await ask(p, 'What is stopping this campaign from launching?'); });
  await step('today-after', async () => { await p.goto(base + '/'); await p.waitForTimeout(1200); });
  writeFileSync(dir + 'console-errors.json', JSON.stringify([...new Set(errs)], null, 1));
  await c.close();
}

for (const P of PERSONAS) for (const vp of ['d', 'm']) if ((!only || only === P.id) && (!onlyVp || onlyVp === vp)) await persona(P, vp);
await b.close();
writeFileSync(logPath, JSON.stringify(log, null, 1));
console.log('done', log.length, 'steps,', log.filter(l => l.error).length, 'failed,', log.filter(l => l.hscroll).length, 'with horizontal scroll');
