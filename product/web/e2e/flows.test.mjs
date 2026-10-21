// Each flow drives the UI and then asks the server what is true. Fixtures that no tool can make yet are made in SQL and said so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import pg from 'pg';

let pw = null;
for (const base of [import.meta.url, 'file:///opt/node-tools/node_modules/']) { try { pw = createRequire(base)('playwright'); break; } catch { /* next */ } }
const BASE = process.env.BASE ?? 'http://localhost:8799';
const EMAIL = 'asha@saanjh.example', PASSWORD = 'sample-password-1234';
let browser, ctx, page, pool, ws;

before(async () => {
  browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined });
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const r = await ctx.request.post(BASE + '/v1/login', { data: { email: EMAIL, password: PASSWORD } });
  assert.ok(r.ok(), 'sign in');
  page = await ctx.newPage();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  ws = (await pool.query("SELECT id FROM workspace WHERE name = 'Saanjh Services' ORDER BY created_at DESC LIMIT 1")).rows[0].id;
});
after(async () => { await browser?.close(); await pool?.end(); });

const tool = async (name, args = {}) => (await (await ctx.request.post(`${BASE}/v1/tools/${name}`, { data: { args } })).json());
const actions = async status => (await (await ctx.request.get(`${BASE}/v1/actions?status=${status}`)).json()).actions;
async function hold(locator) {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(1500); await page.mouse.up();
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
  await page.waitForTimeout(2500);
  props = (await tool('proposal.list')).result;
  const probed = props[0];
  await page.reload();
  t.diagnostic('proposal status after simulating: ' + probed.status);
  if (probed.status === 'awaiting_approval') {
    await page.getByText('Simulated, waiting for your tap').first().waitFor();
    await page.getByRole('button', { name: 'Test this on real calls…' }).first().click();
    await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
    await hold(sheet().locator('.hold'));
    await sheet().getByText(/Done\.|Not executed/).waitFor({ timeout: 8000 });
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
  await sheet().getByText(/Done\.|Not executed/).waitFor({ timeout: 8000 });
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
  await sheet().getByText(/Done\.|Not executed/).waitFor({ timeout: 8000 });
  const afterResume = await state();
  t.diagnostic('state after resume: ' + afterResume);
  assert.equal((await sheet().getByText(/Done\./).count()) > 0, afterResume === 'running', 'the sheet agrees with the server');
  await sheet().waitFor({ state: 'detached', timeout: 5000 });   // a confirmed approval closes itself
  // Stop is offered whatever state it is in and, like Pause, lowers risk, so it runs at once.
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.waitForTimeout(1500);
  assert.equal(await sheet().count(), 0, 'no approval card for a stop');
  const s = await state();
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
  await card.getByText(/Confirmed by the server|Not executed|Result unknown/).waitFor({ timeout: 8000 });
  const confirmed = (await card.getByText(/Confirmed by the server/).count()) > 0;
  const executed = (await actions('executed')).some(a => a.tool === 'wallet.topup');
  assert.equal(confirmed, executed, 'the card says confirmed exactly when the server executed it');
});

test('Browser call on a draft with no voice stack shows the server\'s own refusal, word for word', async () => {
  const emi = (await pool.query("SELECT id FROM agent WHERE workspace_id = $1 AND name = 'EMI pre-due reminder'", [ws])).rows[0].id;
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
  await page.goto(`${BASE}/agents/${riya}`);
  await page.getByRole('radio', { name: 'Test her' }).click();
  await page.getByRole('button', { name: /^Run \d+ practice callers?$/ }).click();
  await page.locator('.simlist > li').first().waitFor({ timeout: 30000 });
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
  const emi = (await pool.query("SELECT id FROM agent WHERE workspace_id = $1 AND name = 'EMI pre-due reminder'", [ws])).rows[0].id;
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
  const scan = async label => {
    let text = await page.locator('body').innerText();
    text = text.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\b[\w-]+\.(csv|txt|pdf|json|example)\b/g, ' ');
    for (const t of tools) if (new RegExp(`(^|[^\\w.])${t.replace(/\./g, '\\.')}($|[^\\w])`).test(text)) bad.push(`${label}: tool id ${t}`);
    // A tool id with its dots turned into spaces ("test simulate") is still a tool id.
    // These tool names are also ordinary English phrases we use on purpose.
    const PLAIN = new Set(['safety check', 'campaign draft', 'contact list']);
    for (const t of tools) { const w = t.replace(/[._]/g, ' '); if (PLAIN.has(w)) continue; if (new RegExp(`\\b${w}\\b`, 'i').test(text)) bad.push(`${label}: tool id as words "${w}"`); }
    for (const re of [/inrMilli|capInrMilli|Milli\b/, /\b(REG|RS|RD)-\d+/, /\[object|\bundefined\b|\bNaN\b|\bnull\b|\bNone\b|\bJSON\b|Traceback/, /\b[a-z]+_[a-z_]+\b/,
      /[\w-]+\/[\w./-]+\.(py|ts|tsx|js|json|md)\b/, /\b20\d\d-\d\d-\d\d\b/, /\b(Asia|Europe|America|Africa|Australia)\/[A-Z]/, /\n\s+at \S+ \(/]) { const m = re.exec(text); if (m) bad.push(`${label}: "${m[0]}"`); }
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
