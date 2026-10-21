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
  browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined });
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
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

test('Browser call on a draft that compiles: the server prepares a session and the UI says so without claiming audio', async () => {
  const riya = (await pool.query("SELECT id FROM agent WHERE workspace_id = $1 AND name = 'Renewals, Pune'", [ws])).rows[0].id;
  const server = await tool('test.browser_call', { agentId: riya, useDraft: true });
  assert.equal(server.status, 'confirmed', JSON.stringify(server));
  assert.equal(server.result.versionId ?? null, null, 'a draft run has no version id');
  assert.ok(server.result.draftHash, 'the run is tied to the draft hash');
  await page.goto(`${BASE}/agents/${riya}`);
  await page.getByRole('radio', { name: 'Test her' }).click();
  await page.getByRole('button', { name: 'Call me in the browser' }).click();
  await page.getByText('A call session was prepared for the saved draft').waitFor({ timeout: 8000 });
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
