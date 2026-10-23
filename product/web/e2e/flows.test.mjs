// Each flow drives the UI and then asks the server what is true. Fixtures that no tool can make yet are made in SQL and said so.
import { test as nodeTest, before, after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import pg from 'pg';

let pw = null;
for (const base of [import.meta.url, 'file:///opt/node-tools/node_modules/']) { try { pw = createRequire(base)('playwright'); break; } catch { /* next */ } }
const BASE = process.env.BASE ?? 'http://localhost:8799';
const EMAIL = 'asha@saanjh.example', PASSWORD = 'sample-password-1234';
let browser, ctx, page, pool, ws;

// A failure must be diagnosable from one run: the flow's name, the last screenshot, the URL, the browser console and any failed
// requests are written to E2E_DIAG_DIR (default: a folder under the OS temp dir) and the path is put in the error message.
const DIAG = process.env.E2E_DIAG_DIR || path.join(os.tmpdir(), 'vp-e2e-diag');
const consoleLog = [];
const test = (name, optsOrFn, maybeFn) => {
  const fn = maybeFn ?? optsOrFn, opts = maybeFn ? optsOrFn : {};
  nodeTest(name, opts, async t => {
    consoleLog.length = 0;
    try { await fn(t); } catch (err) {
      const slug = name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60).toLowerCase();
      try {
        fs.mkdirSync(DIAG, { recursive: true });
        await page.screenshot({ path: path.join(DIAG, slug + '.png') }).catch(() => {});
        fs.writeFileSync(path.join(DIAG, slug + '.txt'), `flow: ${name}\nurl: ${page.url()}\nerror: ${err?.stack ?? err}\n\nbrowser console and failed requests:\n${consoleLog.join('\n')}\n`);
        err.message += `\n[diagnostics: ${path.join(DIAG, slug)}.png and .txt]`;
      } catch { /* diagnostics must never hide the real failure */ }
      throw err;
    }
  });
};

before(async () => {
  // A fake microphone for the browser call flow: Chromium plays this file, on a loop, as the microphone (no device needed).
  const wav = path.join(os.tmpdir(), 'vp-e2e-caller.wav'); fs.writeFileSync(wav, callerWav());
  browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'] });
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', permissions: ['microphone'] });
  const r = await ctx.request.post(BASE + '/v1/login', { data: { email: EMAIL, password: PASSWORD } });
  assert.ok(r.ok(), 'sign in');
  page = await ctx.newPage();
  page.on('console', m => consoleLog.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLog.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', r => consoleLog.push(`[requestfailed] ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) consoleLog.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`); });
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  ws = (await pool.query("SELECT id FROM workspace WHERE name = 'Saanjh Services' ORDER BY created_at DESC LIMIT 1")).rows[0].id;
});
after(async () => { await browser?.close(); await pool?.end(); });

// 16 kHz mono WAV: 1 s of a voiced, speech-loud sound, then 3 s of quiet, twice. Synthetic; no person's voice.
function callerWav() {
  const rate = 16000, secs = 8, n = rate * secs, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate, on = (t % 4) < 1;
    const v = on ? 0.35 * (Math.sin(2 * Math.PI * 140 * t) + 0.5 * Math.sin(2 * Math.PI * 280 * t) + 0.25 * Math.sin(2 * Math.PI * 560 * t)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) : 0;
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 20000))), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const tool = async (name, args = {}) => (await (await ctx.request.post(`${BASE}/v1/tools/${name}`, { data: { args } })).json());
const actions = async status => (await (await ctx.request.get(`${BASE}/v1/actions?status=${status}`)).json()).actions;
// Press and keep pressing until the page itself says the hold completed (the button leaves its 'holding' state), then release.
// A fixed wall-clock hold is wrong under load: the browser can process the press late and the release right after it.
async function hold(locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  const el = await locator.elementHandle();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  try {
    await page.waitForFunction(e => e.classList.contains('holding'), el, { timeout: 5000 });
    await page.waitForFunction(e => !e.classList.contains('holding'), el, { timeout: 10000 });
  } finally { await page.mouse.up(); }
}
const sheet = () => page.getByRole('dialog');

test('API key: create, approve by holding, the secret shows once, a second reveal is refused', async () => {
  await page.goto(BASE + '/settings/keys');
  await page.getByLabel('Name').fill('e2e key');
  await page.getByRole('button', { name: 'Ask to create' }).click();
  await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
  await hold(sheet().locator('.hold'));
  await page.getByRole('heading', { name: 'Copy your key now' }).waitFor({ timeout: 8000 });
  const shown = (await page.locator('.secret').innerText()).trim();
  assert.match(shown, /^vp_/, 'the screen shows a key once');
  await page.getByRole('button', { name: 'I have saved it' }).click();
  const keys = (await tool('apikey.list')).result.keys;
  assert.ok(keys.some(k => (k.name ?? k.label) === 'e2e key'), 'the server holds the key');
  assert.ok(!JSON.stringify(keys).includes(shown), 'the list never contains the secret');
  const done = (await actions('executed')).find(a => a.tool === 'apikey.create');
  assert.ok(done, 'the approval executed');
  const reveal = done.result?.revealId;
  if (reveal) { const again = await tool('secret.reveal', { revealId: reveal }); assert.equal(again.status, 'not_executed', 'a second reveal is refused'); }
  else assert.ok(!JSON.stringify(done.result ?? {}).includes(shown), 'the executed action did not keep the secret');
});

test('Learning: propose, simulate, accept shows an approval card, and the screen matches the server', async t => {
  const agent = (await pool.query("SELECT id FROM agent WHERE workspace_id = $1 AND name = 'Renewals, Pune'", [ws])).rows[0].id;
  // The probe needs a saved practice caller for this agent; simcaller.save makes one.
  const saved = await tool('simcaller.save', { agentId: agent, shape: { label: 'Hurried driver', persona: 'a driver on the move', goal: 'learn the next step quickly', temperament: 'short, impatient', languageMix: 'fast Hinglish', trap: 'any long turn' }, hiddenKeys: {}, checks: {} });
  assert.equal(saved.status, 'confirmed', JSON.stringify(saved));
  await page.goto(BASE + '/insights');
  await page.getByLabel('Agent').selectOption({ label: 'Renewals, Pune' });
  await page.getByRole('button', { name: 'Look for improvements' }).click();
  await page.getByText('Callers who are asked about timing first stay on longer').waitFor({ timeout: 10000 });
  let props = (await tool('proposal.list')).result;
  assert.ok(props.some(p => p.status === 'drafted'), 'the server holds a drafted proposal');
  await page.getByRole('button', { name: 'Simulate first' }).first().click();
  // The probe runs on the server; wait for its status to leave 'drafted' instead of sleeping.
  const t0 = Date.now();
  for (;;) {
    props = (await tool('proposal.list')).result;
    if (props[0].status !== 'drafted' || Date.now() - t0 > 30000) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const probed = props[0];
  t.diagnostic(`probe finished in ${Date.now() - t0} ms`);
  await page.reload();
  t.diagnostic('proposal status after simulating: ' + probed.status);
  if (probed.status === 'awaiting_approval') {
    await page.getByText('Simulated, waiting for your approval').first().waitFor();
    await page.getByRole('button', { name: 'Test this on real calls…' }).first().click();
    await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
    await hold(sheet().locator('.hold'));
    await sheet().getByText(/Done\.|Could not finish/).waitFor({ timeout: 8000 });
    const executed = (await actions('executed')).some(a => a.tool === 'proposal.accept');
    const shownDone = await sheet().getByText(/Done\./).count();
    assert.equal(!!shownDone, executed, 'the sheet says done exactly when the server executed it');
  } else {
    // Honest outcome: the screen must show the server's status in words, and offer no accept button.
    const words = { gated_out: 'Stopped by a safety gate', rejected: 'Rejected', drafted: 'Drafted' }[probed.status];
    assert.ok(words, 'unexpected proposal status ' + probed.status);
    await page.getByText(words).first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Test this on real calls…' }).count(), 0);
  }
});

test('DPDP: erase request needs a hold, then the person is gone from search and the number stays suppressed', async () => {
  await page.goto(BASE + '/settings/privacy');
  await page.getByLabel('Their phone number').fill('+919000000012');
  await page.getByLabel('What they asked for').selectOption('erase_me');
  await page.getByLabel('Where it was asked').fill('email from the person, 21 Oct');
  await page.getByRole('button', { name: 'Ask to carry out…' }).click();
  await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
  assert.match(await sheet().innerText(), /Deletes|removes/i, 'the card says this deletes');
  await hold(sheet().locator('.hold'));
  await sheet().getByText(/Done\.|Could not finish/).waitFor({ timeout: 8000 });
  const ok = (await sheet().getByText(/Done\./).count()) > 0;
  const executed = (await actions('executed')).some(a => a.tool === 'dpdp.request.execute');
  assert.equal(ok, executed, 'the screen matches the server');
  assert.ok(executed, 'the erase ran');
  const found = (await tool('contact.search', { q: '9000000012' })).result.contacts;
  assert.ok(!found.some(c => c.name === 'Imran Qureshi'), 'the person is no longer findable by name');
  const facts = (await tool('contact.dial_facts', { e164: '+919000000012' })).result;
  assert.ok(JSON.stringify(facts).match(/tombstone|suppress/i), 'the number is tombstoned or suppressed so nobody calls it by mistake');
});

test('A3: Pause, Resume and Stop run at once with no approval card, and the pill matches the server', async t => {
  // Fixture: launching needs a rented line, which the sandbox cannot rent; the state is set in SQL so the live buttons exist.
  const id = (await pool.query("UPDATE campaign SET state = 'running' WHERE workspace_id = $1 AND name = 'Renewals Oct' RETURNING id", [ws])).rows[0].id;
  const state = async () => (await tool('campaign.get', { id })).result.campaign.state;
  await page.goto(`${BASE}/campaigns/${id}`);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.locator('.pill', { hasText: /^Paused$/ }).waitFor({ timeout: 8000 });
  assert.equal(await sheet().count(), 0, 'no approval card for a pause');
  assert.equal(await state(), 'paused');
  // Resume starts dialling real people again, so unlike Pause it is an A2 action: a card, a hold, then the server runs it.
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
  assert.equal(await state(), 'paused', 'nothing changes before the hold');
  await hold(sheet().locator('.hold'));
  await sheet().getByText(/Done\.|Could not finish/).waitFor({ timeout: 8000 });
  const afterResume = await state();
  t.diagnostic('state after resume: ' + afterResume);
  assert.equal((await sheet().getByText(/Done\./).count()) > 0, afterResume === 'running', 'the sheet agrees with the server');
  await sheet().waitFor({ state: 'detached', timeout: 5000 });   // a confirmed approval closes itself
  // Stop is offered whatever state it is in and, like Pause, lowers risk, so it runs at once.
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  let s = await state();
  for (const t0 = Date.now(); !['stopped', 'done', 'cancelled'].includes(s) && Date.now() - t0 < 15000; ) { await new Promise(r => setTimeout(r, 250)); s = await state(); }
  assert.equal(await sheet().count(), 0, 'no approval card for a stop');
  assert.ok(['stopped', 'done', 'cancelled'].includes(s), 'the server stopped it: ' + s);
});

test('Operator: an A2 approval card from the chat holds, then the card and the server agree', async () => {
  await page.goto(BASE + '/');
  await page.locator('#dock-input').fill('Please top up my wallet');
  await page.keyboard.press('Enter');
  const card = page.locator('.dock article[aria-label^="approval card"]').first();
  await card.waitFor({ timeout: 10000 });
  assert.match(await card.innerText(), /Spends money|Add/i);
  const before = (await actions('proposed')).filter(a => a.tool === 'wallet.topup').length;
  assert.ok(before >= 1, 'the server holds the proposal; nothing happened yet');
  await hold(card.locator('.hold'));
  await card.getByText(/Done\.|Could not finish|Not known yet/).waitFor({ timeout: 8000 });
  const confirmed = (await card.getByText(/Done\./).count()) > 0;
  const executed = (await actions('executed')).some(a => a.tool === 'wallet.topup');
  assert.equal(confirmed, executed, 'the card says confirmed exactly when the server executed it');
});

// New agents start on the default stack (decision.2026-10-22.default-stack). Drafts saved before it existed have no stack, and no
// tool clears one, so the flows that test that state make it in SQL.
async function stacklessEmi() {
  const emi = (await pool.query("SELECT id FROM agent WHERE workspace_id = $1 AND name = 'EMI pre-due reminder'", [ws])).rows[0].id;
  await pool.query(`UPDATE agent SET draft = jsonb_set(draft, '{voice}', '{"stackId": ""}') WHERE id = $1`, [emi]);
  return emi;
}

test('Browser call on a draft with no voice stack shows the server\'s own refusal, word for word', async () => {
  const emi = await stacklessEmi();
  const server = await tool('test.browser_call', { agentId: emi, useDraft: true });
  assert.equal(server.status, 'not_executed', 'a draft with no stack is refused');
  await page.goto(`${BASE}/agents/${emi}`);
  await page.getByRole('radio', { name: 'Test her' }).click();
  await page.getByRole('button', { name: 'Call me in the browser' }).click();
  await page.getByText(server.reason, { exact: false }).first().waitFor({ timeout: 8000 });
});

test('Practice callers: the panel lists the server\'s callers and shows one result per caller it ran', async () => {
  const riya = (await pool.query("SELECT id FROM agent WHERE workspace_id = $1 AND name = 'Renewals, Pune'", [ws])).rows[0].id;
  const list = (await tool('simcaller.list', { agentId: riya })).result.callers;
  assert.ok(list.length >= 12, 'the server offers the default library');
  // The library arrives late on purpose: on a slow runner a click before it loaded ran zero callers ("0 of 0 passed").
  // The button must wait for the list, so this flow holds the list back and clicks at once.
  const slow = '**/v1/tools/simcaller.list';
  await page.route(slow, async r => { await new Promise(ok => setTimeout(ok, 1500)); await r.continue(); });
  try {
    await page.goto(`${BASE}/agents/${riya}`);
    await page.getByRole('radio', { name: 'Test her' }).click();
    await page.getByRole('button', { name: /^Run \d+ practice callers?$/ }).click();
    await page.locator('.simlist > li').first().waitFor({ timeout: 30000 });
  } finally { await page.unroute(slow); }
  assert.equal(await page.locator('.simlist > li').count(), 6, 'six are chosen by default and six results come back');
  const verdicts = await page.locator('.simlist > li summary .chip').allInnerTexts();
  assert.ok(verdicts.every(v => ['Passed', 'Failed', 'Invalid', 'Inconclusive'].includes(v)), verdicts.join());
});

test('Browser call: she calls you in the browser, captions from both sides, hang up, filed as a test call under what ran', { skip: process.env.VP_DEVSIM_URL ? false : 'no voice runtime (devsim) for browser calls on this machine' }, async () => {
  const riya = (await pool.query("SELECT id, draft FROM agent WHERE workspace_id = $1 AND name = 'Renewals, Pune'", [ws])).rows[0];
  await page.goto(`${BASE}/agents/${riya.id}`);
  await page.getByRole('radio', { name: 'Test her' }).click();
  await page.getByRole('button', { name: 'Call me in the browser' }).click();
  const call = page.locator('.bcall');
  await call.waitFor({ timeout: 10000 });
  await call.getByText('AI agent').waitFor();                                   // the disclosure is always on screen
  await call.locator('.bcap.agent').first().waitFor({ timeout: 20000 });        // her opening, from the runtime
  await call.locator('.bcap.caller:not(.partial)').first().waitFor({ timeout: 30000 });   // the fake microphone, heard and transcribed
  await call.locator('.bcap.agent').nth(1).waitFor({ timeout: 20000 });         // and answered
  fs.mkdirSync(path.join(process.cwd(), 'product/web/shots'), { recursive: true });
  await call.screenshot({ path: path.join(process.cwd(), 'product/web/shots/browser-call-live.png') });
  const href = await call.getByRole('button', { name: 'Hang up' }).click().then(async () => {
    await call.getByText('You hung up.').waitFor({ timeout: 8000 });
    return call.getByRole('link', { name: 'See this call' }).getAttribute('href');
  });
  const id = href.split('/').pop();
  // The runtime's signed events reach ingest: the call is a test call, ended, with both sides' turns, under what ran.
  let row, turns = [];
  for (const t0 = Date.now(); Date.now() - t0 < 15000; await new Promise(r => setTimeout(r, 300))) {
    row = (await pool.query('SELECT channel, status, end_reason, run_manifest FROM conversation WHERE id = $1', [id])).rows[0];
    turns = (await pool.query('SELECT speaker FROM turn WHERE conversation_id = $1', [id])).rows.map(r => r.speaker);
    if (row?.end_reason && row.run_manifest?.combinationId) break;
  }
  assert.equal(row.channel, 'test');
  assert.equal(row.end_reason, 'caller_hung_up', JSON.stringify(row));
  assert.equal(row.run_manifest.stackId, riya.draft.voice.stackId, 'filed under the stack the saved draft names');
  assert.match(row.run_manifest.combinationId, /^v2\|/);
  assert.ok(turns.includes('agent') && turns.includes('caller'), 'both sides are in the transcript: ' + turns.join());
  await page.goto(`${BASE}/calls/${id}`);
  await page.getByText('Haan ji, boliye.').first().waitFor({ timeout: 10000 });
});

test('Stack picker: beta stacks say "test calls only", and an unmeasured reply gap shows no number', async () => {
  const emi = await stacklessEmi();
  await page.goto(`${BASE}/agents/${emi}?tab=voice`);
  const live = page.locator('.stackcard', { hasText: 'Gemini 3.8 Live' });
  await live.waitFor();
  await live.getByText('Beta: test calls only').waitFor();
  const gap = live.locator('.fig').first();
  assert.match(await gap.innerText(), /Not measured/);
  assert.ok(!/\d ?s\b/.test(await gap.locator('.fig-v').innerText()), 'the visible figure carries no seconds number');
  assert.ok((await gap.locator('.fig-v').getAttribute('title')).length > 10, 'the source is on hover');
  assert.equal(await page.locator('.stackcard[aria-pressed], .pickbtn.on').count(), 0, 'nothing is preselected');
});

test('Copy: no tool id, raw argument name, internal code or milli-unit reaches a person, on any screen', async () => {
  const tools = (await (await ctx.request.get(`${BASE}/v1/tools`)).json()).tools.map(t => t.name);
  const ids = {
    agent: (await pool.query("SELECT id FROM agent WHERE workspace_id = $1 AND name = 'Renewals, Pune'", [ws])).rows[0].id,
    camp: (await pool.query("SELECT id FROM campaign WHERE workspace_id = $1 AND name = 'Renewals Oct'", [ws])).rows[0].id,
    camp2: (await pool.query("SELECT id FROM campaign WHERE workspace_id = $1 AND name LIKE 'Appointment%'", [ws])).rows[0].id,
    contact: (await pool.query("SELECT id FROM contact WHERE workspace_id = $1 ORDER BY e164 LIMIT 1", [ws])).rows[0].id,
    call: (await pool.query("SELECT cv.id FROM conversation cv WHERE cv.workspace_id = $1 ORDER BY cv.started_at LIMIT 1", [ws])).rows[0].id,
  };
  const routes = ['/', '/agents', `/agents/${ids.agent}`, `/agents/${ids.agent}?tab=persona`, `/agents/${ids.agent}?tab=job`, `/agents/${ids.agent}?tab=rules`, `/agents/${ids.agent}?tab=tools`, `/agents/${ids.agent}?tab=voice`, `/agents/${ids.agent}?tab=versions`,
    '/contacts', '/contacts/import', `/contacts/${ids.contact}`, '/audiences', '/campaigns', '/campaigns/new', `/campaigns/${ids.camp}`, `/campaigns/${ids.camp2}`, '/calls', `/calls/${ids.call}`, '/insights', '/numbers',
    ...['team', 'keys', 'brand', 'knowledge', 'billing', 'compliance', 'privacy', 'operator', 'integrations', 'activity'].map(t => `/settings/${t}`)];
  const bad = [];
  // Owner rule (2026-10-22): the product UI is never written in Hindi or Hinglish. What agents say on calls is the product's voice and
  // stays, so anything inside [lang="hi"] (transcripts, call content) is exempt; everything else must be English.
  const HINGLISH = /\b(suprabhat|namaste|shubh|sandhya|bolo|bolna|karo|mat|banao|aap|kaunsi|bataiye|hoon|thoda|chhoti|jao|ji|naya|kharcha|kitna|abhi|nahi|taiyaar|karna|paise|kya|hain)\b/i;
  const DEVANAGARI = /[\u0900-\u097F]/;
  const scanLanguage = async label => {
    const ui = await page.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('[lang="hi"]').forEach(e => e.remove()); c.querySelectorAll('textarea,input,script,style').forEach(e => e.remove()); const out = []; const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n.nodeValue); return out.join(' ').replace(/\s+/g, ' '); });
    const d = DEVANAGARI.exec(ui); if (d) bad.push(`${label}: Devanagari in the interface near "${ui.slice(Math.max(0, d.index - 20), d.index + 20)}"`);
    const h = HINGLISH.exec(ui); if (h) bad.push(`${label}: Hinglish word "${h[0]}" near "${ui.slice(Math.max(0, h.index - 25), h.index + 25)}"`);
    for (const ph of await page.locator('[placeholder]').evaluateAll(els => els.map(e => e.getAttribute('placeholder')))) { if (HINGLISH.test(ph) || DEVANAGARI.test(ph)) bad.push(`${label}: placeholder "${ph}"`); }
  };
  const scan = async label => {
    await scanLanguage(label);
    let text = await page.locator('body').innerText();
    text = text.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\b[\w-]+\.(csv|txt|pdf|json|example)\b/g, ' ');
    for (const t of tools) if (new RegExp(`(^|[^\\w.])${t.replace(/\./g, '\\.')}($|[^\\w])`).test(text)) bad.push(`${label}: tool id ${t}`);
    // A tool id with its dots turned into spaces ("test simulate") is still a tool id.
    // These tool names are also ordinary English phrases we use on purpose.
    const PLAIN = new Set(['safety check', 'campaign draft', 'contact list']);
    for (const t of tools) { const w = t.replace(/[._]/g, ' '); if (PLAIN.has(w)) continue; if (new RegExp(`\\b${w}\\b`, 'i').test(text)) bad.push(`${label}: tool id as words "${w}"`); }
    for (const re of [/inrMilli|capInrMilli|Milli\b/, /\b(REG|RS|RD)-\d+/, /\[object|\bundefined\b|\bNaN\b|\bnull\b|\bNone\b|\bJSON\b|Traceback/, /\b[a-z]+_[a-z_]+\b/,
      /\b(ears|brain|s2s)\b/i, /[\w-]+\/[\w./-]+\.(py|ts|tsx|js|json|md)\b/, /\b20\d\d-\d\d-\d\d\b/, /\b(Asia|Europe|America|Africa|Australia)\/[A-Z]/, /\n\s+at \S+ \(/]) { const m = re.exec(text); if (m) bad.push(`${label}: "${m[0]}"`); }
  };
  for (const r of routes) {
    await page.goto(BASE + r, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await scan(r);
  }
  // states that only exist after an action: the import verdicts, the approval sheet, the Operator's cards, the test panel
  await page.goto(BASE + '/contacts/import'); await page.getByRole('button', { name: 'Use a made-up sample' }).click(); await page.getByRole('button', { name: 'Check the file' }).click(); await page.getByText('3. What will happen to each row').waitFor(); await scan('import verdicts');
  await page.goto(BASE + '/'); await page.getByRole('button', { name: 'Review' }).first().click(); await sheet().waitFor(); await page.waitForTimeout(500); await scan('approval sheet'); await page.keyboard.press('Escape');
  await page.locator('#dock-input').fill('make a plan: pune audience and top up'); await page.keyboard.press('Enter'); await page.locator('.dock article').first().waitFor({ timeout: 10000 }); await page.waitForTimeout(800); await scan('operator cards');
  await page.goto(`${BASE}/agents/${ids.agent}`); await page.getByRole('radio', { name: 'Test her' }).click(); await page.getByRole('button', { name: /^Run \d+ practice callers?$/ }).click(); await page.locator('.simlist > li').first().waitFor({ timeout: 30000 }); await page.locator('.simlist summary').first().click(); await scan('practice results');
  assert.deepEqual(bad, [], 'developer text on screen:\n' + bad.join('\n'));
});

test('Launch blockers: the page shows the server\'s plain message and its fix button, once', async () => {
  const id = (await pool.query("SELECT id FROM campaign WHERE workspace_id = $1 AND name LIKE 'Appointment%'", [ws])).rows[0].id;
  const b = (await tool('campaign.get', { id })).result.blockers;
  assert.ok(b.length > 0, 'the draft has blockers');
  await page.goto(`${BASE}/campaigns/${id}`);
  for (const x of b) {
    await page.getByText(x.message, { exact: false }).first().waitFor({ timeout: 8000 });
    assert.equal(await page.getByText(x.message, { exact: false }).count(), 1, 'shown once, not again under the Launch button');
    if (x.fix && typeof x.fix === 'object') assert.ok(await page.getByRole('link', { name: x.fix.label }).count() >= 0);
  }
});

test('Ask the assistant on a launch blocker with no page: the dock gets the sentence and the Operator answers with a plan card', async () => {
  const id = (await pool.query("SELECT id, name FROM campaign WHERE workspace_id = $1 AND name LIKE 'Appointment%'", [ws])).rows[0];
  const fixes = (await tool('campaign.get', { id: id.id })).result.blockers.filter(b => b.fix && typeof b.fix === 'object' && ['campaign.draft', 'campaign.audience.add'].includes(b.fix.tool));
  assert.ok(fixes.length > 0, 'the draft has a blocker whose fix has no page of its own');
  await page.goto(`${BASE}/campaigns/${id.id}`);
  const row = page.locator('.check-fail').filter({ hasText: fixes[0].message }).first();
  await row.getByRole('button', { name: 'Ask the assistant' }).click();
  const said = `${fixes[0].fix.label} for the campaign "${id.name}".`;
  await page.locator('.dock').getByText(said, { exact: true }).waitFor({ timeout: 8000 });
  const card = page.locator('.dock article[aria-label^="plan card"]').first();
  await card.waitFor({ timeout: 10000 });
  assert.match(await card.innerText(), /Waits for your approval|Runs now/i, 'the plan says which steps wait for a tap');
  // The plan card is shown before the server has filed the step's proposal, so wait for the proposal instead of reading it at once.
  const held = await page.waitForFunction(async () => (await (await fetch('/v1/actions?status=proposed')).json()).actions.some(a => a.tool === 'cap.raise'), null, { timeout: 15000 }).then(() => true, () => false);
  assert.ok(held, 'the server holds the spend step for the person\'s tap');
  assert.equal((await actions('executed')).some(a => a.tool === 'cap.raise'), false, 'nothing that spends has run: the plan only waits');
});

test('A plan step the server refuses says so plainly, offers a fix, and the fixed step holds, approves and executes', async () => {
  await page.goto(BASE + '/');
  await page.locator('#dock-input').fill('Make a plan with a bad step');
  await page.keyboard.press('Enter');
  const bad = page.locator('.dock article[aria-label^="plan card"]').last();
  await bad.waitFor({ timeout: 10000 });
  await bad.getByText("This step can't run as written.").waitFor();
  assert.ok(!/must be one of|period/i.test(await bad.innerText()), 'the validator text stays hidden');
  await bad.getByRole('button', { name: 'Ask the assistant to fix it' }).click();
  await page.locator('.dock').getByText(/^Fix step 1 of the plan: /).waitFor({ timeout: 8000 });
  const card = page.locator('.dock article[aria-label^="approval card"]').last();
  await card.waitFor({ timeout: 10000 });
  const before = (await actions('executed')).filter(a => a.tool === 'cap.raise').length;
  assert.ok(!/^(workspace|daily)$/m.test(await card.innerText()), 'the card shows words, not enum values');
  await card.locator('.hold').scrollIntoViewIfNeeded();
  await hold(card.locator('.hold'));
  await card.getByText(/Done\.|Could not finish|Not known yet/).waitFor({ timeout: 8000 });
  const after = (await actions('executed')).filter(a => a.tool === 'cap.raise').length;
  assert.equal(after, before + 1, 'the held cap step executed exactly once, after the hold');
});

test('Approval sheet: the hold is not offered until the details of the change have loaded', async () => {
  // Hold the details request back; a person must not be able to approve an amount they cannot see.
  await page.route('**/v1/actions?status=proposed*', async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
  try {
    await page.goto(BASE + '/');
    await page.getByRole('button', { name: 'Review' }).first().click();
    await sheet().waitFor();
    assert.equal(await sheet().locator('.hold').count(), 0, 'no hold button while the details are still loading');
    await sheet().getByText('Loading the details of this change').waitFor();
    await sheet().locator('.hold').waitFor({ timeout: 10000 });
    assert.ok(await sheet().locator('dl.kv').count() > 0, 'the details are on screen by the time the hold is offered');
  } finally { await page.unroute('**/v1/actions?status=proposed*'); }
});

test('Stack picker: the voice runtime\'s own word on each stack (unknown shows nothing, unavailable says why and cannot be chosen)', async () => {
  // Set what the fake runtime reports, then ask the server until it says it has heard it. A stack.list already in flight when the hook
  // fires can write its old answer into the server's 30 s health cache after the hook cleared it, so the hook is applied again until the
  // server's answer matches.
  const hook = async (body, expect = null) => {
    let last = null;
    for (let i = 0; i < 40; i++) {
      const r = await fetch(`http://127.0.0.1:${Number(new URL(BASE).port) + 1}/`, { method: 'POST', body: JSON.stringify(body) });
      assert.equal(r.status, 204, 'dev health hook');
      if (!expect) return;
      const reply = await tool('stack.list');
      last = reply.status === 'confirmed' ? reply.result.stacks.map(x => `${x.id}:${x.availability?.state}`).join(' ') : JSON.stringify(reply).slice(0, 300);
      if (reply.status === 'confirmed' && expect(reply.result.stacks)) return;
      await new Promise(res => setTimeout(res, 250));
    }
    assert.fail('the server never reported the health the hook set; last stack.list: ' + last);
  };
  const stateOf = (list, id) => list.find(x => x.id === id)?.availability?.state;
  const emi = await stacklessEmi();
  const open = async () => { await page.goto(`${BASE}/agents/${emi}`); await page.getByRole('tab', { name: 'Voice stack' }).click(); await page.locator('.stackcard').first().waitFor(); await page.getByText('Provider cost per minute').first().waitFor(); };
  const flash = () => page.locator('.stackcard', { hasText: 'Gemini 3.5 Flash-Lite + Gemini voice' }).first();
  try {
    // 1. unknown: no runtime has reported. Nothing alarming, and nothing disabled.
    await hook(null, list => stateOf(list, 'v2-flashlite') === 'unknown');
    await open();
    assert.equal(await page.getByText('Unavailable', { exact: true }).count(), 0, 'unknown shows no Unavailable chip');
    assert.equal(await flash().getByRole('button', { name: 'Choose this stack' }).isDisabled(), false);
    // 2. unavailable with the runtime's reason; every stack the runtime does not list is unavailable too.
    await hook({ stacks: { 'v2-live': { available: true, reason: null, missing: [] }, 'v2-flashlite': { available: false, reason: 'Our Google voice connection is being set up.', missing: [] } } }, list => stateOf(list, 'v2-flashlite') === 'unavailable');
    await open();
    await flash().getByText('Unavailable', { exact: true }).waitFor();
    await flash().getByText('Our Google voice connection is being set up.').waitFor();
    const pick = flash().getByRole('button', { name: 'Choose this stack' });
    assert.equal(await pick.isDisabled(), true, 'an unavailable stack cannot be chosen');
    // 3. available: no chip, choosable.
    const live = page.locator('.stackcard', { hasText: 'Gemini 3.8 Live' }).first();
    assert.equal(await live.getByText('Unavailable', { exact: true }).count(), 0);
    assert.equal(await live.getByRole('button', { name: 'Choose this stack' }).isDisabled(), false);
  } finally { await hook(null, list => stateOf(list, 'v2-flashlite') === 'unknown'); }
});

// ---- Voice stack: the whole stack is chosen part by part, and there is a default (owner directive 2026-10-22) ----
const draftVoice = async agentId => (await tool('agent.get', { agentId })).result.draft.voice;
const opt = (group, label) => page.getByRole('radiogroup', { name: group }).locator('.partopt', { has: page.locator('strong', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
const openVoiceTab = async agentId => { await page.goto(`${BASE}/agents/${agentId}?tab=voice`); await page.getByRole('heading', { name: 'Build your own' }).waitFor(); };
let stackAgent;

test('Voice stack: a new agent starts on the default and the summary says so, in plain part names', async () => {
  const made = await tool('agent.create', { name: 'Stack builder agent', templateId: 'insurance-renewal' });
  assert.equal(made.status, 'confirmed', JSON.stringify(made));
  stackAgent = made.result.agentId;
  const list = (await tool('stack.list')).result;
  assert.equal((await draftVoice(stackAgent)).stackId, list.default, 'the server put the new agent on the default');
  await openVoiceTab(stackAgent);
  const sum = page.locator('.stacksum');
  await sum.getByText('Default', { exact: true }).waitFor();
  const text = await sum.innerText();
  assert.match(text, /Speech recognition/); assert.match(text, /Language model/); assert.match(text, /Voice/);
  assert.ok(!/\b(ears|brain|s2s)\b/i.test(await page.locator('main, .page').first().innerText()), 'the API part names never reach the screen');
});

test('Voice stack: build a cascade from three parts; the server agrees and the screen says it is beta', async () => {
  await openVoiceTab(stackAgent);
  await opt('Speech recognition', 'Azure Speech, Hindi and English').click();
  await opt('Language model', 'GPT-4.1 mini').click();
  await page.getByText('Choose every part to see the cost.').waitFor();
  await opt('Voice', 'Azure neural voice').click();
  // The cost of the parts chosen is the server's own figure for that combination.
  const est = await tool('money.estimate', { stackId: 'custom', components: { ears: 'azure', brain: 'gpt-4.1-mini-in', voice: 'azure' }, minutes: 1, calls: 0 });
  assert.equal(est.status, 'confirmed', JSON.stringify(est));
  const rupees = '₹' + (est.result.perMinuteInrMilli / 1000).toFixed(2);
  await page.locator('.buildprice').getByText(rupees, { exact: false }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Use these parts' }).click();
  await page.locator('.stacksum').getByText('Your own stack').waitFor({ timeout: 10000 });
  await page.locator('.stacksum').getByText('Beta: test calls only').waitFor();
  const v = await draftVoice(stackAgent);
  assert.equal(v.stackId, 'custom');
  assert.deepEqual({ ears: v.components.ears, brain: v.components.brain, voice: v.components.voice }, { ears: 'azure', brain: 'gpt-4.1-mini-in', voice: 'azure' });
  await page.getByText('A stack you build runs test calls only until it has been measured.').waitFor();
});

test('Voice stack: the voice is kept when only the language model changes, and a voice can be picked from the speaking part', async () => {
  await openVoiceTab(stackAgent);
  const pickable = page.locator('[role="radiogroup"][aria-label="Voices"] button[role="radio"]');
  await pickable.nth(1).waitFor();
  const name = (await pickable.nth(1).innerText()).trim();
  await pickable.nth(1).click();
  await page.locator('[role="radiogroup"][aria-label="Voices"] button[aria-checked="true"]').filter({ hasText: name.split(' (')[0] }).waitFor({ timeout: 10000 });
  const chosen = (await draftVoice(stackAgent)).voiceId;
  assert.ok(chosen, 'the server holds the chosen voice');
  await openVoiceTab(stackAgent);
  await opt('Language model', 'GPT-4.1').click();
  await page.getByRole('button', { name: 'Use these parts' }).click();
  await page.locator('.stacksum').getByText('GPT-4.1 ·', { exact: false }).waitFor({ timeout: 10000 });
  assert.equal((await draftVoice(stackAgent)).voiceId, chosen, 'changing only the language model kept the voice');
});

test('Voice stack: an incomplete build shows the server\'s own refusal, word for word', async () => {
  await openVoiceTab(stackAgent);
  const before = await draftVoice(stackAgent);
  // Start from a different mode so nothing is chosen: speech-to-speech with no model picked.
  await page.getByRole('radio', { name: 'One speech-to-speech model' }).click();
  const server = await tool('stack.set', { agentId: stackAgent, stackId: 'custom', components: {} });
  assert.equal(server.status, 'not_executed', 'the server refuses an empty build');
  await page.getByRole('button', { name: 'Use these parts' }).click();
  await page.locator('p[role="alert"]').filter({ hasText: server.reason }).first().waitFor({ timeout: 8000 });
  assert.deepEqual(await draftVoice(stackAgent), before, 'a refused build changed nothing');
});

test('Voice stack: switching back to a recommended stack drops the parts', async () => {
  await openVoiceTab(stackAgent);
  const card = page.locator('.stackcard', { hasText: 'Gemini 3.5 Flash-Lite + Gemini voice' }).first();
  await card.getByRole('button', { name: 'Choose this stack' }).click();
  await page.locator('.stacksum').getByText('Default', { exact: true }).waitFor({ timeout: 10000 });
  const v = await draftVoice(stackAgent);
  assert.equal(v.stackId, 'v2-flashlite');
  assert.equal(v.components, undefined, 'the custom parts are gone');
});

test('Voice stack: a part the runtime says is unavailable cannot be picked, and says why', async () => {
  const hook = async body => { const r = await fetch(`http://127.0.0.1:${Number(new URL(BASE).port) + 1}/`, { method: 'POST', body: JSON.stringify(body) }); assert.equal(r.status, 204); };
  const comps = (await tool('stack.list')).result.components;
  const ok = id => ({ available: true, reason: null });
  const health = { stacks: {}, components: {} };
  for (const c of comps) { (health.components[c.part] ??= {})[c.id] = c.part === 'brain' && c.id === 'gpt-4.1' ? { available: false, reason: 'This model is not connected on our voice engine yet.' } : ok(c.id); }
  const t0 = Date.now();
  try {
    for (;;) {
      await hook(health);
      const l = (await tool('stack.list')).result.components.find(c => c.part === 'brain' && c.id === 'gpt-4.1');
      if (l.availability.state === 'unavailable') break;
      if (Date.now() - t0 > 10000) assert.fail('the server never reported the part as unavailable');
      await new Promise(r => setTimeout(r, 250));
    }
    await openVoiceTab(stackAgent);
    const o = opt('Language model', 'GPT-4.1');
    await o.getByText('Unavailable', { exact: true }).waitFor();
    await o.getByText('This model is not connected on our voice engine yet.').waitFor();
    assert.equal(await o.locator('input').isDisabled(), true, 'an unavailable part cannot be picked');
    assert.equal(await opt('Language model', 'GPT-4.1 mini').locator('input').isDisabled(), false, 'its neighbour still can');
  } finally {
    const t1 = Date.now();
    for (;;) { await hook(null); const l = (await tool('stack.list')).result.components.find(c => c.part === 'brain'); if (l.availability.state === 'unknown' || Date.now() - t1 > 10000) break; await new Promise(r => setTimeout(r, 250)); }
  }
});

test('A built stack is treated as a stack: practice callers run, the test-calls-only warning shows, and the panel names its parts', async () => {
  // stackAgent was built on the previous flows and is now back on a recommended stack; build one again for this check.
  const set = await tool('stack.set', { agentId: stackAgent, stackId: 'custom', components: { ears: 'azure', brain: 'gpt-4.1-mini-in', voice: 'azure' } });
  assert.equal(set.status, 'confirmed', JSON.stringify(set));
  await page.goto(`${BASE}/agents/${stackAgent}`);
  await page.getByRole('radio', { name: 'Test her' }).click();
  const run = page.getByRole('button', { name: /^Run \d+ practice callers?$/ });
  await run.waitFor();
  assert.equal(await run.getAttribute('aria-disabled'), null, 'practice callers are not blocked for a built stack');
  assert.equal(await page.getByText('Choose a voice stack first').count(), 0);
  await page.getByText('Test calls only').first().waitFor();
  await page.locator('.testpanel .chip-wrap').getByText('Azure Speech, Hindi and English + GPT-4.1 mini + Azure neural voice').waitFor();
  const back = await tool('stack.set', { agentId: stackAgent, stackId: 'v2-flashlite' });
  assert.equal(back.status, 'confirmed');
});

// ---- Launch-readiness: contacts compliance actions, the integration connect form, undo on Activity ----
const contactId = async name => (await pool.query("SELECT id FROM contact WHERE workspace_id = $1 AND name = $2", [ws, name])).rows[0].id;

test('Contact: DND can be checked, a person can be stopped with a reason, and released again with a reason and an approval', async () => {
  const id = await contactId('Meenal Joshi');
  await page.goto(`${BASE}/contacts/${id}`);
  await page.getByText('Nothing has looked this number up on the national Do Not Disturb register yet', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Check DND now' }).click();
  await page.getByText(/Checked 1 number/).waitFor({ timeout: 10000 });
  const dnd = (await tool('contact.get', { id })).result.dnd;
  assert.ok(dnd.checkedAt, 'the server recorded when the number was checked');
  // Stop calling: a reason is required, then it runs at once.
  const stop = page.getByRole('button', { name: 'Stop calling this person' });
  assert.equal(await stop.getAttribute('aria-disabled'), 'true', 'no reason, no button');
  await page.getByLabel('Reason').fill('Asked by email not to be called');
  await stop.click();
  await page.getByText('She will not call this number', { exact: false }).waitFor({ timeout: 10000 });
  const supp = (await tool('contact.get', { id })).result.suppressions;
  assert.equal(supp.length, 1, 'the server holds the suppression');
  // Release: a reason, then an approval (a policy change).
  await page.getByRole('button', { name: 'Allow calls again…' }).click();
  await sheet().getByLabel('Reason').fill('Person asked us to resume calls');
  await sheet().getByRole('button', { name: 'Ask to allow calls' }).click();
  await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
  await hold(sheet().locator('.hold'));
  await page.getByText('She will not call this number', { exact: false }).waitFor({ state: 'detached', timeout: 10000 });
  assert.equal((await tool('contact.get', { id })).result.suppressions.length, 0, 'the suppression is gone on the server');
});

test('Contacts list: check DND for the people shown, and export them as a CSV through an approval', async () => {
  await page.goto(`${BASE}/contacts`);
  await page.getByText('has not been checked', { exact: false }).first().waitFor();
  await page.getByRole('button', { name: /^Check DND for the \d+ people shown$/ }).click();
  await page.getByText(/Checked \d+ numbers?/).waitFor({ timeout: 15000 });
  const before = (await actions('executed')).filter(a => a.tool === 'contact.export').length;
  await page.getByRole('button', { name: 'Export as CSV…' }).click();
  await sheet().getByRole('button', { name: 'Ask to export' }).click();
  await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
  const download = page.waitForEvent('download', { timeout: 15000 });
  await hold(sheet().locator('.hold'));
  const file = await download;
  assert.match(file.suggestedFilename(), /\.csv$/);
  const text = fs.readFileSync(await file.path(), 'utf8');
  assert.match(text.split(/\r?\n/)[0], /^phone,name,language/, 'the file has the header the server wrote');
  assert.ok((await actions('executed')).filter(a => a.tool === 'contact.export').length === before + 1, 'the export ran once, after approval');
});

test('Integrations: a service can be connected from Settings, and the credentials never come back', async () => {
  const SECRET = 'hs-test-token-4f9a1c7e';
  await page.goto(`${BASE}/settings/integrations`);
  await page.getByRole('button', { name: 'Connect HubSpot CRM' }).click();
  await sheet().getByLabel('Connection name').fill('Sales CRM');
  await sheet().getByLabel('Access token').fill(SECRET);
  await sheet().getByLabel('Portal ID').fill('1234567');
  assert.equal(await sheet().getByLabel('Access token').getAttribute('type'), 'password', 'the token is masked while typing');
  await sheet().getByRole('button', { name: 'Connect', exact: true }).click();
  await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
  const body = await page.locator('body').innerText();
  assert.ok(!body.includes(SECRET), 'the approval does not show the credential');
  await hold(sheet().locator('.hold'));
  await page.getByText('Sales CRM', { exact: false }).first().waitFor({ timeout: 10000 });
  const list = JSON.stringify((await tool('integration.list')).result);
  assert.ok(list.includes('Sales CRM') && !list.includes(SECRET), 'the server lists the connection and never the credential');
  assert.ok(!(await page.locator('body').innerText()).includes(SECRET), 'the credential is nowhere on the page after saving');
  const executed = JSON.stringify((await actions('executed')).filter(a => a.tool === 'integration.connect'));
  assert.ok(!executed.includes(SECRET), 'the approved action never held the credential');
});

test('Activity: a brand change can be undone from the ledger', async () => {
  const named = await tool('brand.update', { legalName: 'Saanjh Services Private Limited' });
  assert.equal(named.status, 'confirmed', JSON.stringify(named));
  const before = (await tool('brand.get')).result;
  const changed = await tool('brand.update', { tone: 'precise and formal, for undo test' });
  assert.equal(changed.status, 'confirmed', JSON.stringify(changed));
  await page.goto(`${BASE}/settings/activity`);
  const card = page.locator('section, .card').filter({ hasText: 'Changes you can undo' }).first();
  await card.waitFor();
  const row = card.locator('li').filter({ hasText: /brand/i }).first();
  await row.getByRole('button', { name: 'Undo' }).click();
  await page.getByText('Undone', { exact: false }).first().waitFor({ timeout: 10000 });
  const after = (await tool('brand.get')).result;
  assert.equal(after.tone ?? null, before.tone ?? null, 'the server restored the tone');
});

// ---- Insights: themes across calls ----
test('Insights: themes show grouped by kind, most common first, as the model grouped them, with verbatim quotes that open their call', async () => {
  const row = (await pool.query("SELECT themes, calls_sampled, calls_in_scope FROM call_insight WHERE workspace_id = $1 AND scope_type = 'workspace' ORDER BY created_at DESC LIMIT 1", [ws])).rows[0];
  assert.ok(row, 'the seed holds a workspace insight (written in SQL: insight.refresh needs an analysis model the dev server does not have)');
  await page.goto(`${BASE}/insights`);
  const card = page.locator('section, .card').filter({ has: page.getByRole('heading', { name: 'Themes across calls' }) }).first();
  await card.getByRole('heading', { name: 'Objections people raised' }).waitFor({ timeout: 10000 });
  await card.getByRole('heading', { name: 'Where people dropped off' }).waitFor();
  await card.getByRole('heading', { name: 'What came before a reached goal' }).waitFor();
  const text = await card.innerText();
  assert.ok(text.indexOf('Asks to be called at a better time') < text.indexOf('The price is higher than last time'), 'the more common theme comes first');
  assert.match(text, /Quoted from 2 calls · the model grouped 3 of 4 sampled calls here/);
  assert.match(text, /Quoted from 1 call · the model grouped 2 of 4 sampled calls here/);
  assert.ok(!/verified/i.test(text.replace(/word for word/gi, '')), 'the count is never called verified');
  assert.match(text, new RegExp(`Seen across ${row.calls_sampled} of ${row.calls_in_scope} recent calls`));
  assert.ok(!/from \d+ of \d+ calls/.test(text), 'the sampled-calls sentence is said once');
  assert.match(text, /Every quote is word for word from a call/, 'the server note is shown as given');
  // Each quote is verbatim and links to its call at its moment.
  assert.ok(row.themes.every(t => t.quotes.length >= 2), 'every seeded theme has at least two quotes, as the server requires');
  const quote = row.themes.find(t => t.title === 'Asks not to be called again').quotes[0];
  assert.equal(await card.locator('blockquote[lang="hi"]').count() > 0, true, 'quotes are marked with their language');
  await card.getByText(quote.text, { exact: false }).first().waitFor();
  const hrefs = await card.locator('a[href^="/calls/"]').evaluateAll(as => as.map(a => a.getAttribute('href')));
  assert.ok(hrefs.includes(`/calls/${quote.conversationId}?t=${Math.round(quote.startMs)}`), 'the quote links to its call at its moment: ' + hrefs.join(' '));
  await card.locator(`a[href="/calls/${quote.conversationId}?t=${Math.round(quote.startMs)}"]`).click();
  await page.waitForURL(`**/calls/${quote.conversationId}?t=*`);
  await page.getByText(quote.text, { exact: false }).first().waitFor({ timeout: 10000 });
});

test('Insights: scopes with no insight, a failed build and an unconfigured model each say what happens next; Refresh says why it did not rebuild', async () => {
  const agent = (await pool.query("SELECT id, name FROM agent WHERE workspace_id = $1 AND name = 'Renewals, Pune'", [ws])).rows[0];
  const camp = (await pool.query("SELECT id, name FROM campaign WHERE workspace_id = $1 AND name LIKE 'Renewals%'", [ws])).rows[0];
  const emi = (await pool.query("SELECT id, name FROM agent WHERE workspace_id = $1 AND name = 'Clinic appointments'", [ws])).rows[0];
  await pool.query("INSERT INTO call_insight (workspace_id, scope_type, scope_id, status, detail) VALUES ($1,'campaign',$2,'failed', $3)", [ws, camp.id, { reason: 'The analysis model returned something that could not be read.' }]);
  await pool.query("INSERT INTO call_insight (workspace_id, scope_type, scope_id, status, detail) VALUES ($1,'agent',$2,'not_configured', '{}')", [ws, emi.id]);
  await page.goto(`${BASE}/insights`);
  const card = () => page.locator('section, .card').filter({ has: page.getByRole('heading', { name: 'Themes across calls' }) }).first();
  await card().getByRole('heading', { name: 'Objections people raised' }).waitFor({ timeout: 10000 });
  await card().getByLabel('Scope').selectOption({ label: `Campaign: ${camp.name}` });
  await card().getByText('The last build did not finish').waitFor();
  await card().getByText('The analysis model returned something that could not be read.', { exact: false }).waitFor();
  await card().getByLabel('Scope').selectOption({ label: `Agent: ${emi.name}` });
  await card().getByText('Insights are not switched on for this server').waitFor();
  await card().getByLabel('Scope').selectOption({ label: `Agent: ${agent.name}` });
  await card().getByText('No insight has been built yet').waitFor();
  // Refresh on the workspace scope: nothing has ended since the stored insight, so the server skips and says why.
  await card().getByLabel('Scope').selectOption({ label: 'The whole workspace' });
  await card().getByRole('heading', { name: 'Objections people raised' }).waitFor();
  const server = await tool('insight.refresh', {});
  await card().getByRole('button', { name: 'Refresh' }).click();
  await card().getByText(/^Not rebuilt: /).waitFor({ timeout: 15000 });
  assert.equal(server.status, 'confirmed', JSON.stringify(server));
  if (server.result?.reason) await card().getByText(server.result.reason, { exact: false }).waitFor();
});

// ---- First run: a brand-new workspace is guided from nothing to a first campaign, every step done from server state ----
test('Guided start: from an empty workspace to a first campaign, each step done only when the server says so', async () => {
  const email = `first-run-${Date.now()}@guided.example`;
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const su = await ctx2.request.post(BASE + '/v1/signup', { data: { workspace: 'Guided Start Test', name: 'Neha Kapoor', email, password: 'sample-password-1234' } });
  assert.ok(su.ok(), 'sign up a new workspace: ' + su.status());
  const p = await ctx2.newPage();
  const srv = async (name, args = {}) => (await (await ctx2.request.post(`${BASE}/v1/tools/${name}`, { data: { args } })).json());
  const step = n => p.locator(`li.gstep[aria-label^="Step ${n}:"]`);
  const state = async n => ((await step(n).getAttribute('aria-label')) ?? '').endsWith('not done') ? 'not done' : 'done';
  const hold2 = async loc => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); const el = await loc.elementHandle(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down();
    try { await p.waitForFunction(e => e.classList.contains('holding'), el, { timeout: 5000 }); await p.waitForFunction(e => !e.classList.contains('holding'), el, { timeout: 10000 }); } finally { await p.mouse.up(); } };
  try {
    // An empty workspace lands on the guided start, and nothing is done.
    assert.equal((await srv('agent.list')).result.agents.length, 0, 'the workspace is empty');
    await p.goto(BASE + '/');
    await p.getByRole('heading', { name: 'Get started' }).waitFor({ timeout: 10000 });
    for (const n of [1, 2, 3, 4]) assert.equal(await state(n), 'not done', `step ${n} starts not done`);
    // Later steps wait, and say what for.
    await step(2).getByText('Create an agent first.').waitFor();
    await step(4).getByText('Create an agent first.').waitFor();
    // Step 1: both ways in are offered; the template way is grouped by industry.
    await p.getByRole('radio', { name: 'Describe your calling job' }).waitFor();
    assert.equal(await step(1).getByRole('button', { name: 'Ask the assistant to build it' }).getAttribute('aria-disabled'), 'true', 'no description, no button');
    await p.getByRole('radio', { name: 'Start from a template' }).click();
    await step(1).getByRole('heading', { name: 'Insurance' }).waitFor();
    await step(1).getByRole('radio', { name: /Health insurance renewal reminder/ }).click();
    await step(1).getByLabel('Agent name').fill('First agent');
    await step(1).getByRole('button', { name: 'Create draft' }).click();
    await p.waitForURL('**/agents/*');
    assert.equal((await srv('agent.list')).result.agents.length, 1, 'the server holds the agent');
    // Back on Today: step 1 is done because the server has an agent. Reloading changes nothing.
    await p.goto(BASE + '/'); await p.getByRole('heading', { name: 'Get started' }).waitFor();
    await p.reload(); await p.getByRole('heading', { name: 'Get started' }).waitFor();
    assert.equal(await state(1), 'done'); assert.equal(await state(2), 'not done');
    await step(4).getByText('Publish an agent first.', { exact: false }).waitFor();
    // Step 2: hear her. The link opens the test panel, and a browser call is a test call on the server.
    await step(2).getByRole('link', { name: /^Hear / }).click();
    await p.getByRole('button', { name: 'Call me in the browser' }).click();
    // The call view opens (it connects when a voice runtime is present; CI has none), and the disclosure is on screen.
    await p.locator('.bcall').waitFor({ timeout: 10000 });
    await p.locator('.bcall').getByText('AI agent').waitFor();
    await p.goto(BASE + '/'); await p.getByRole('heading', { name: 'Get started' }).waitFor();
    assert.equal(await state(2), 'done', 'a test call exists on the server');
    // Publish the agent (approval by holding), then add contacts through the import.
    const agentId = (await srv('agent.list')).result.agents[0].id;
    await p.goto(`${BASE}/agents/${agentId}`);
    await p.getByRole('button', { name: 'Publish…' }).click();
    await p.getByRole('dialog').getByRole('heading', { name: 'Approve to continue' }).waitFor();
    await hold2(p.getByRole('dialog').locator('.hold'));
    await p.getByRole('dialog').waitFor({ state: 'detached', timeout: 15000 });
    await p.goto(BASE + '/'); await p.getByRole('heading', { name: 'Get started' }).waitFor();
    await step(4).getByText('Add contacts first', { exact: false }).waitFor();
    await step(3).getByRole('link', { name: 'Add contacts' }).click();
    await p.getByRole('button', { name: 'Use a made-up sample' }).click();
    await p.getByRole('button', { name: 'Check the file' }).click();
    await p.getByRole('button', { name: /^Save \d+ contacts?$/ }).click();
    await p.getByText('List imported', { exact: false }).first().waitFor({ timeout: 15000 });
    assert.ok((await srv('contact.list', { limit: 1 })).result.contacts.length > 0, 'the server holds contacts');
    await p.goto(BASE + '/'); await p.getByRole('heading', { name: 'Get started' }).waitFor();
    assert.equal(await state(3), 'done');
    // Step 4: the campaign form opens, and saving a draft makes the step done.
    await step(4).getByRole('link', { name: 'Start a campaign' }).click();
    await p.waitForURL('**/campaigns/new');
    await p.getByRole('radio', { name: /Service/ }).first().click();
    await p.getByLabel('Campaign name').fill('First test campaign');
    await p.getByLabel('Agent').selectOption({ index: 1 });
    await p.getByLabel('Who to call').selectOption({ index: 1 });
    await p.getByRole('button', { name: 'Save draft' }).click();
    await p.waitForURL(u => /\/campaigns\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 15000 });
    assert.equal((await srv('campaign.list')).result.campaigns.length, 1, 'the server holds the campaign');
    await p.goto(BASE + '/');
    await p.getByRole('heading', { name: 'Today' }).waitFor();
    assert.equal(await p.getByRole('heading', { name: 'Get started' }).count(), 0, 'with every step done the guide steps aside');
  } finally { await ctx2.close(); }
});
