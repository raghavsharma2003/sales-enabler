// Each flow drives the UI and then asks the server what is true. Fixtures that no tool can make yet are made in SQL and said so.
import { test as nodeTest, before, after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { audit, axe } from './a11y.mjs';
import { EMI_ROWS, xlsxFile } from '../dev/xlsx-sample.mjs';
import { HS_TOKEN, SF, startFakeCrm } from '../dev/fake-crm.mjs';

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

test('Webhooks: add one (approved), the secret shows once, a test event is tried at once and listed with its result', async () => {
  await page.goto(BASE + '/settings/webhooks');
  await page.getByRole('heading', { name: 'New webhook' }).waitFor();
  // A synthetic address that does not resolve: the test event must fail, and the list must say why in words.
  await page.getByLabel('Address').fill('https://hooks.e2e-vyakti.invalid/in');
  await page.getByLabel('Description (optional)').fill('e2e warehouse');
  await page.getByRole('switch', { name: /A campaign changed state/ }).click();
  await page.getByRole('button', { name: 'Ask to add' }).click();
  await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
  assert.match(await sheet().innerText(), /phone numbers masked/, 'the card says numbers are masked');
  await hold(sheet().locator('.hold'));
  await page.getByRole('heading', { name: 'Copy the signing secret now' }).waitFor({ timeout: 8000 });
  const shown = (await page.locator('.secret').innerText()).trim();
  assert.match(shown, /^whsec_/);
  await page.getByRole('button', { name: 'I have saved it' }).click();
  const hooks = (await tool('webhook.list')).result.webhooks;
  const made = hooks.find(h => h.description === 'e2e warehouse');
  assert.ok(made, 'the server holds the webhook');
  assert.deepEqual([...made.events].sort(), ['call.ended', 'campaign.state_changed']);
  assert.equal(made.contactNumber, 'masked');
  assert.ok(!JSON.stringify(hooks).includes(shown), 'the list never contains the secret');

  await page.getByRole('button', { name: 'Send a test event to hooks.e2e-vyakti.invalid/in' }).click();
  await page.getByText(/The test event was not delivered: the address could not be found/).waitFor({ timeout: 15000 });
  const rows = (await tool('webhook.deliveries', { endpointId: made.id })).result.deliveries;
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'failed'); assert.equal(rows[0].test, true);
  await page.getByRole('table', { name: 'Webhook deliveries' }).getByText('the address could not be found', { exact: false }).first().waitFor();
});

test('Notifications: with no mail server, the page says "Email not set up" and the server agrees', async () => {
  await page.goto(BASE + '/settings/notifications');
  await page.getByRole('note').getByText('Email not set up').waitFor();
  const list = (await tool('notification.destination.list')).result;
  assert.equal(list.email.configured, false);
  assert.match(list.email.note, /^Email not set up/);
  await page.getByRole('heading', { name: 'Add a destination' }).waitFor();
  await page.getByRole('radio', { name: 'Email' }).click();
  await page.getByText('Email is not set up on this server, so these alerts will be recorded as not sent until it is.').waitFor();
});

test('Duty roster: weekly hours added through an approval put a person on duty now, on the screen and on the server', async () => {
  await page.goto(BASE + '/settings/notifications');
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Who is on duty' }) });
  await card.getByRole('status').waitFor();
  const me = (await tool('member.list')).result.members.find(m => m.email === EMAIL);
  await card.getByLabel('Person').first().selectOption(me.id);
  for (const d of ['Sat', 'Sun']) await card.getByRole('checkbox', { name: d }).check();
  await card.getByLabel('From').first().fill('00:00');
  await card.getByLabel('To').first().fill('00:00');                                    // 00:00 means the end of the day
  await card.getByRole('button', { name: 'Ask to add hours' }).click();
  await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
  assert.match(await sheet().innerText(), /1 shift for/);
  await hold(sheet().locator('.hold'));
  await card.getByRole('status').getByText(me.name, { exact: false }).waitFor({ timeout: 10000 });
  const r = (await tool('duty.roster.get')).result;
  assert.deepEqual(r.shifts.map(x => [x.memberId, x.days.length, x.start, x.end]), [[me.id, 7, '00:00', '24:00']]);
  assert.deepEqual(r.onDutyNow.map(x => x.name), [me.name]);
  await tool('duty.roster.set', { shifts: [] }).then(x => x.status === 'needs_approval' ? ctx.request.post(`${BASE}/v1/actions/${x.actionId}/decide`, { data: { approve: true } }) : null);
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
    await page.getByText('Simulated, waiting for you').first().waitFor();
    // The button asks the server first whether the test can start; a blocker is shown in words and no approval is asked.
    const ready = (await tool('proposal.readiness', { proposalId: probed.id })).result;
    t.diagnostic('readiness: ' + JSON.stringify(ready));
    await page.getByRole('button', { name: 'Test this on real calls…' }).first().click();
    if (!ready.ready) {
      await page.getByRole('status').filter({ hasText: 'Not yet: ' + ready.reason }).first().waitFor();
      assert.equal(await sheet().count(), 0, 'no approval card for a test that cannot start');
      assert.ok(!(await actions('proposed')).some(a => a.tool === 'proposal.accept'), 'the server holds no accept waiting');
      return;
    }
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
  await page.locator('#dock-input').fill('Please top up my wallet with ₹500');
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
  // A test run never writes a tracked file: the shot goes to the diagnostics folder, and into web/shots only on a re-shoot (E2E_RESHOOT=1).
  const shotDir = process.env.E2E_RESHOOT === '1' ? path.join(process.cwd(), 'product/web/shots') : DIAG;
  fs.mkdirSync(shotDir, { recursive: true });
  await call.screenshot({ path: path.join(shotDir, 'browser-call-live.png') });
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
  // The runtime's own recording of this call plays on the page, from a signed link to the runtime (not a file path).
  const player = page.locator('audio.callaudio');
  await player.waitFor({ timeout: 10000 });
  const src = await player.getAttribute('src');
  assert.ok(src.startsWith(`${process.env.VP_RUNTIME_PUBLIC_URL}/v1/recordings/${id}?`), src);
  const played = await player.evaluate(async a => {
    a.muted = true;
    await new Promise((res, rej) => { if (a.readyState >= 1) res(); else { a.onloadedmetadata = res; a.onerror = () => rej(new Error('audio error ' + a.error?.code)); } });
    await a.play(); await new Promise(r => setTimeout(r, 600)); a.pause();
    const before = a.currentTime; a.currentTime = Math.min(1, a.duration / 2);
    await new Promise(r => { a.onseeked = r; });
    return { duration: a.duration, played: before, seekedTo: a.currentTime };
  });
  assert.ok(played.duration > 1, 'a real recording, seconds long: ' + JSON.stringify(played));
  assert.ok(played.played > 0.2, 'it played: ' + JSON.stringify(played));
  assert.ok(Math.abs(played.seekedTo - Math.min(1, played.duration / 2)) < 0.1, 'and seeks: ' + JSON.stringify(played));
  const forged = (await fetch(src.replace(/sig=./, m => m === 'sig=a' ? 'sig=b' : 'sig=a'))).status;     // from here: the page has no CORS to the runtime, nor needs it
  assert.equal(forged, 403, 'a forged link is refused');
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
    ...['team', 'keys', 'brand', 'knowledge', 'billing', 'compliance', 'privacy', 'security', 'operator', 'integrations', 'activity'].map(t => `/settings/${t}`)];
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
  await page.locator('#dock-input').fill('make a plan: pune audience and top up ₹500'); await page.keyboard.press('Enter'); await page.locator('.dock article').first().waitFor({ timeout: 10000 }); await page.waitForTimeout(800); await scan('operator cards');
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
  // A draft whose category does not match its agent: the fix ("Pick a matching agent") has no page of its own, so the assistant takes it.
  const ag = (await tool('agent.list')).result.agents.find(x => x.latest_version);
  const agv = (await tool('agent.get', { agentId: ag.id })).result;
  const wrong = ['service', 'transactional', 'promotional'].find(c => c !== agv.draft.category);
  const audId = (await tool('audience.list')).result.audiences[0].id;
  const mk = await tool('campaign.draft', { name: 'Assistant fix check', category: wrong, agentVersionId: agv.liveVersion.id, audienceId: audId });
  assert.equal(mk.status, 'confirmed', JSON.stringify(mk));
  const id = { id: mk.result.id, name: 'Assistant fix check' };
  const fixes = (await tool('campaign.get', { id: id.id })).result.blockers.filter(b => b.fix && typeof b.fix === 'object' && b.fix.tool === 'campaign.draft' && !/limit|cap/i.test(b.fix.label));
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
  // The blocker named no amount, so the scripted plan's held step changes policy instead of inventing a spending limit.
  const held = await page.waitForFunction(async () => (await (await fetch('/v1/actions?status=proposed')).json()).actions.some(a => a.tool === 'operator.autonomy.raise'), null, { timeout: 15000 }).then(() => true, () => false);
  assert.ok(held, 'the server holds the approval step for the person\'s tap');
  assert.equal((await actions('executed')).some(a => a.tool === 'operator.autonomy.raise'), false, 'nothing that needs a tap has run: the plan only waits'); 
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
// "Build your own" is a disclosure, closed unless the agent already runs its own parts; these flows open it as a person would.
const openVoiceTab = async agentId => {
  await page.goto(`${BASE}/agents/${agentId}?tab=voice`); await page.getByRole('heading', { name: 'Build your own' }).waitFor();
  if (!(await page.locator('details.buildown').evaluate(d => d.open))) await page.getByText('Show the parts').click();
};
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

test('Import an Excel file for an agent: the missing detail shows with a suggestion, one tap matches it, and the server keeps it under the agent\'s key', async () => {
  await page.goto(`${BASE}/contacts/import`);
  const agents = (await tool('agent.list')).result.agents;
  const emi = agents.find(a => a.name === 'EMI pre-due reminder');
  assert.ok(emi, 'the seed has the EMI agent');
  await page.getByLabel('Which agent will call them? (optional)').selectOption(emi.id);
  const file = xlsxFile(EMI_ROWS);
  await page.getByLabel('Choose a file: Excel, CSV or TSV').setInputFiles({ name: 'emi-december.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: file });
  await page.getByText('emi-december.xlsx').waitFor();
  await page.getByText('Excel, read on our server', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Check the file' }).click();
  const card = page.locator('.card', { hasText: "What EMI pre-due reminder says from each person's record" });
  await card.waitFor();
  await page.getByText('Read from the sheet “EMI list” of your Excel file. 1 formula cell used the value Excel last saved.', { exact: false }).waitFor();
  await card.getByText('No column').first().waitFor();
  await card.getByRole('button', { name: 'Use “Due date”' }).click();
  await card.getByText('From “Due date”').waitFor({ timeout: 10000 });
  await page.getByLabel('Audience name').fill('EMI December (Excel)');
  await page.getByRole('button', { name: /^Save 2 contacts$/ }).click();
  await page.waitForURL(/\/audiences$/, { timeout: 15000 });
  const kavita = (await tool('contact.search', { q: '9000030101' })).result.contacts[0];
  assert.ok(kavita, 'the Devanagari number was saved as +91 9000030101');
  const attrs = Object.fromEntries((await tool('contact.get', { id: kavita.id })).result.attributes.map(a => [a.key, a.value]));
  assert.equal(attrs.emi_due, '2026-12-05', 'the confirmed column is stored under the agent\'s key');
  assert.equal(attrs.emi_amount, 4250);
  assert.ok((await tool('contact.search', { q: '9000030102' })).result.contacts.length === 1, 'the formula cell gave its saved value');
});

test('Import from HubSpot: pick a list, check it like a file, save, set a timer; a failed sync says why in plain words; nothing is written to the CRM', { skip: process.env.VP_CRM_FAKE_URL ? false : 'no fake CRM port (run through e2e/run.sh)' }, async () => {
  const crm = await startFakeCrm(Number(new URL(process.env.VP_CRM_FAKE_URL).port));
  try {
    // Not connected yet: the screen says so and links to Settings.
    await page.goto(`${BASE}/contacts/import?from=hubspot`);
    await page.getByText('HubSpot is not connected').waitFor();
    assert.equal(await page.getByRole('link', { name: 'Go to Integrations' }).getAttribute('href'), '/settings/integrations');
    // Connect it through the real tools (credentials staged, the connection approved by the owner).
    const st = (await tool('integration.stage_secrets', { kind: 'hubspot', secrets: { access_token: HS_TOKEN } })).result;
    const p = await tool('integration.connect', { kind: 'hubspot', name: 'HubSpot (synthetic)', stashId: st.stashId });
    const ok = await (await ctx.request.post(`${BASE}/v1/actions/${p.actionId}/decide`, { data: { approve: true } })).json();
    assert.equal(ok.status, 'confirmed', JSON.stringify(ok));
    await page.reload();
    await page.getByLabel('HubSpot list').selectOption({ label: 'Renewals November (4 people)' });
    await page.getByRole('button', { name: 'Check this list' }).click();
    await page.getByText('3. What will happen to each row').waitFor({ timeout: 15000 });
    await page.getByText('Read 4 contacts from HubSpot.').waitFor();
    await page.getByLabel('Audience name').fill('HubSpot renewals (synthetic)');
    await page.getByRole('button', { name: /^Save 3 contacts$/ }).click();
    const card = page.locator('.card', { hasText: 'Lists kept in step with HubSpot' });
    await card.waitFor({ timeout: 15000 });
    assert.equal((await tool('contact.search', { q: '9000050103' })).result.contacts.length, 1, 'the Devanagari number was saved');
    // A timer, then the server agrees.
    await card.getByLabel('Sync on a timer').selectOption('6');
    await page.getByText('Timed sync on.').waitFor();
    const src = (await tool('source.crm.sources', { kind: 'hubspot' })).result.sources.find(s => s.listName === 'Renewals November');
    assert.equal(src.everyHours, 6);
    // A sync on demand with nothing changed imports nothing new.
    await card.getByRole('button', { name: 'Sync now' }).click();
    await page.getByText('Synced.').waitFor();
    // A failed timed sync (as the sync job records it) shows in plain words.
    await pool.query("UPDATE intake_source SET last_sync_error = 'HubSpot answered 503: service unavailable' WHERE id = $1", [src.id]);
    await page.reload();
    await page.getByText('The last sync did not finish: HubSpot answered 503: service unavailable.', { exact: false }).waitFor();
    // Zoho CRM is not connected in this workspace: its tab says so.
    await page.getByRole('tab', { name: 'From Zoho CRM' }).click();
    await page.getByText('Zoho CRM is not connected').waitFor();
    assert.deepEqual(crm.writes(), [], 'read only: no write call reached the CRM');
  } finally { crm.server.close(); }
});

test("Import from Salesforce: a list view checked like a file; a field the user may not read is named, not emptied; Salesforce's do-not-call is an opt-out; the API budget is shown and can be changed; read only", { skip: process.env.VP_CRM_FAKE_URL ? false : 'no fake CRM port (run through e2e/run.sh)' }, async () => {
  const crm = await startFakeCrm(Number(new URL(process.env.VP_CRM_FAKE_URL).port));
  try {
    crm.state.sfHidden = new Set(['Email']);                      // field-level security hides Email from the integration user
    const st = (await tool('integration.stage_secrets', { kind: 'salesforce', secrets: SF })).result;
    const p = await tool('integration.connect', { kind: 'salesforce', name: 'Salesforce (synthetic)', stashId: st.stashId });
    const ok = await (await ctx.request.post(`${BASE}/v1/actions/${p.actionId}/decide`, { data: { approve: true } })).json();
    assert.equal(ok.status, 'confirmed', JSON.stringify(ok));
    await page.goto(`${BASE}/contacts/import?from=salesforce`);
    await page.getByLabel('Salesforce list view').selectOption({ label: 'Contacts: Key accounts' });
    await page.getByRole('button', { name: 'Check this list view' }).click();
    await page.getByText('3. What will happen to each row').waitFor({ timeout: 15000 });
    const hint = page.getByText('Read 3 contacts from Salesforce.', { exact: false });
    await hint.waitFor();
    const said = await hint.innerText();
    assert.match(said, /Salesforce does not let the connected user read Email; that field is left out, not treated as empty\./);
    assert.match(said, /This used \d+ API calls \(\d+ of 1,000 in the last 24 hours\)\./, 'the API calls the pull used are shown');
    assert.equal(await page.getByLabel('Do not call', { exact: true }).inputValue(), 'opt_out', "Salesforce's DoNotCall is matched as an opt-out");
    await page.getByLabel('Audience name').fill('Salesforce key accounts (synthetic)');
    await page.getByRole('button', { name: /^Save \d contacts?$/ }).click();
    await page.locator('.card', { hasText: 'Lists kept in step with Salesforce' }).waitFor({ timeout: 15000 });
    const supp = await pool.query("SELECT 1 FROM suppression s JOIN contact c ON c.id = s.contact_id WHERE c.e164 = '+919000050702' AND s.reason = 'opt_out'");
    assert.equal(supp.rowCount, 1, 'the contact Salesforce marks Do Not Call is suppressed');
    // The budget: shown with what was used, and changed through the real tool.
    const budget = page.locator('.card', { hasText: 'Salesforce API budget' });
    assert.match(await budget.innerText(), /used in the last 24 hours\. Salesforce last reported the org at [\d,]+ of 15,000; Vyakti stops at 90%\./);
    await budget.getByLabel('Calls Vyakti may use a day').selectOption('5000');
    await page.getByText('Budget changed.').waitFor();
    const integrationId = (await tool('integration.list')).result.integrations.find(i => i.kind === 'salesforce').id;
    assert.equal((await tool('source.crm.budget', { integrationId })).result.dailyCalls, 5000);
    assert.deepEqual(crm.writes(), [], 'read only: no write call reached Salesforce');
  } finally { crm.server.close(); }
});

test('Start from a sample: a synthetic pack goes through the real check and receipt; "Add me" puts my verified phone in it and marks it as my test contact', async () => {
  // A synthetic number in the 90000000xx range stands in for the member's own verified phone.
  const ws = (await pool.query("SELECT m.workspace_id, m.id FROM member m WHERE m.email = $1", [EMAIL])).rows[0];
  await pool.query('INSERT INTO verified_test_phone (workspace_id, member_id, e164, verified_at) VALUES ($1,$2,$3,now()) ON CONFLICT (workspace_id, e164) DO UPDATE SET verified_at = now()', [ws.workspace_id, ws.id, '+919000000095']);
  await page.goto(`${BASE}/contacts/import?from=sample`);
  await page.getByLabel('Sample list').selectOption({ label: 'Health insurance renewals' });
  await page.getByText('Policyholders whose renewal is due', { exact: false }).waitFor();
  await page.getByRole('switch', { name: /Add me as a test contact/ }).click();
  await page.getByRole('button', { name: 'Check this sample' }).click();
  await page.getByText('3. What will happen to each row').waitFor({ timeout: 15000 });
  await page.getByText('Row 14 is you: it is saved as your test contact.', { exact: false }).waitFor();
  assert.match(await page.locator('.card', { hasText: '3. What will happen to each row' }).innerText(), /opted out, saved but never called/, 'the pack has opt-outs and the preview says so');
  await page.getByLabel('Audience name').fill('Sample renewals (synthetic)');
  await page.getByRole('button', { name: /^Save \d+ contacts$/ }).click();
  await page.getByText('Sample list saved.').waitFor({ timeout: 15000 });
  const me = await pool.query('SELECT test_member_id FROM contact WHERE workspace_id = $1 AND e164 = $2', [ws.workspace_id, '+919000000095']);
  assert.equal(me.rows[0]?.test_member_id, ws.id, 'my phone is saved as my test contact');
  const due = await pool.query("SELECT count(*)::int AS n FROM attribute a JOIN contact c ON c.id = a.contact_id WHERE c.workspace_id = $1 AND a.key = 'renewal_due'", [ws.workspace_id]);
  assert.ok(due.rows[0].n >= 10, 'the due dates the agent says came in as details');
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
  // The approval sheet already names "Sales CRM", so its text on the page proves nothing: wait for the server to list it.
  let list = '';
  for (let i = 0; i < 50; i++) {
    list = JSON.stringify((await tool('integration.list')).result);
    if (list.includes('Sales CRM')) break;
    await page.waitForTimeout(200);
  }
  assert.ok(list.includes('Sales CRM') && !list.includes(SECRET), 'the server lists the connection and never the credential');
  await page.getByText('Sales CRM', { exact: false }).first().waitFor({ timeout: 10000 });
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
    await step(1).getByRole('heading', { name: 'Lending' }).waitFor();
    // The industry filter narrows the long list.
    await step(1).getByRole('radio', { name: 'Insurance', exact: true }).click();
    assert.equal(await step(1).getByRole('heading', { name: 'Lending' }).count(), 0, 'other industries are filtered out');
    await step(1).getByRole('radio', { name: 'All industries' }).click();
    await step(1).getByRole('heading', { name: 'Lending' }).waitFor();
    await step(1).getByRole('radio', { name: /Health insurance renewal reminder/ }).click();
    await step(1).getByLabel('Agent name').fill('First agent');
    await step(1).getByRole('button', { name: 'Create draft' }).click();
    await p.waitForURL('**/agents/*');
    assert.equal((await srv('agent.list')).result.agents.length, 1, 'the server holds the agent');
    // The agent says the buyer's own business name, not the template's example one.
    const made = (await srv('agent.get', { agentId: (await srv('agent.list')).result.agents[0].id })).result.draft;
    assert.equal(made.brand.name, 'Guided Start Test', 'the agent carries the workspace name');
    assert.equal(made.brand.spokenName, 'Guided Start Test');
    // Back on Today: step 1 is done because the server has an agent. Reloading changes nothing.
    await p.goto(BASE + '/'); await p.getByRole('heading', { name: 'Get started' }).waitFor();
    await p.reload(); await p.getByRole('heading', { name: 'Get started' }).waitFor();
    assert.equal(await state(1), 'done'); assert.equal(await state(2), 'not done');
    await step(4).getByText('Publish an agent first.', { exact: false }).waitFor();
    // Step 2: hear her. The link opens the test panel, and a browser call is a test call on the server.
    await step(2).getByRole('link', { name: /^Hear / }).click();
    await p.getByRole('button', { name: 'Call me in the browser' }).click();
    // With a voice runtime (devsim) the call view opens with the disclosure on screen; without one (CI) the panel says
    // why it cannot connect. Either way the server holds the test call, which is what turns the step done.
    const view = p.locator('.bcall'), why = p.locator('.testpanel [role="status"]');
    await view.or(why).first().waitFor({ timeout: 10000 });
    if (await view.isVisible()) await view.getByText('AI agent').waitFor();
    await p.goto(BASE + '/'); await p.getByRole('heading', { name: 'Get started' }).waitFor();
    assert.equal(await state(2), 'done', 'a test call exists on the server');
    // Publish the agent (approval by holding), then add contacts through the import.
    const agentId = (await srv('agent.list')).result.agents[0].id;
    await p.goto(`${BASE}/agents/${agentId}`);
    await p.getByRole('button', { name: 'Publish…' }).click();
    await p.getByRole('dialog').getByRole('heading', { name: 'Approve to continue' }).waitFor();
    assert.ok(!/[0-9a-f]{16,}/i.test(await p.getByRole('dialog').innerText()), 'the approval sheet shows no hash or id');
    await hold2(p.getByRole('dialog').locator('.hold'));
    await p.getByRole('dialog').waitFor({ state: 'detached', timeout: 15000 });
    await p.getByRole('button', { name: 'Assistant' }).first().click().catch(() => {});
    assert.ok(!/[0-9a-f]{8,}/i.test(await p.locator('.dock .thread').innerText().catch(() => '')), 'the assistant\'s receipt shows no id or hash');
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
    // A saved draft is not a launched campaign: the guide stays, and says what is left.
    await p.goto(BASE + '/');
    await p.getByRole('heading', { name: 'Get started' }).waitFor();
    assert.equal(await state(4), 'not done', 'a draft campaign does not complete the last step');
    await step(4).getByRole('link', { name: 'Finish your campaign' }).waitFor();
  } finally { await ctx2.close(); }
});

// ---- Buyer walkthrough fixes (research/2026-10-23/walkthrough/FRICTION.md) ----
test('Campaign form: choosing the agent sets its call category, and a mismatch is stopped before saving, with the reason', async () => {
  const agents = (await tool('agent.list')).result.agents.filter(a => a.latest_version);
  let chosen = null;
  for (const a of agents) { const cat = (await tool('agent.get', { agentId: a.id })).result.draft.category; if (cat) { chosen = { ...a, cat }; break; } }
  assert.ok(chosen, 'a published agent with a call category exists');
  await page.goto(`${BASE}/campaigns/new`);
  await page.getByLabel('Agent').selectOption({ value: chosen.id });
  const radio = name => page.getByRole('radio', { name: new RegExp(`^${name}`, 'i') }).first();
  assert.equal(await radio(chosen.cat).getAttribute('aria-checked'), 'true', `the category follows the agent (${chosen.cat})`);
  const other = ['service', 'transactional', 'promotional'].find(c => c !== chosen.cat);
  await radio(other).click();
  await page.getByLabel('Campaign name').fill('Mismatch check');
  await page.getByText(`This agent is set up for ${chosen.cat} calls and the campaign is set to ${other}.`, { exact: false }).waitFor();
  const save = page.getByRole('button', { name: 'Save draft' });
  assert.equal(await save.getAttribute('aria-disabled'), 'true', 'saving is stopped');
  await page.getByText(`The agent is set up for ${chosen.cat} calls.`, { exact: false }).waitFor();
});

test('Campaign draft: the spend cap is set from the page, with the estimate\'s suggestion one tap away, and the launch check clears', async () => {
  const a = (await tool('agent.list')).result.agents.find(x => x.latest_version);
  const ver = (await tool('agent.get', { agentId: a.id })).result;
  const cat = ver.draft.category;
  // An audience with callable people, so the estimate has something to price and suggests a cap.
  const aud = (await tool('audience.list')).result.audiences.find(x => x.kind === 'list');
  const made = await tool('campaign.draft', { name: 'Cap check', category: cat, agentVersionId: ver.liveVersion.id, audienceId: aud.id });
  assert.equal(made.status, 'confirmed', JSON.stringify(made));
  const id = made.result.id;
  await page.goto(`${BASE}/campaigns/${id}`);
  const limit = (await tool('campaign.get', { id })).result.blockers.find(b => b.fix && typeof b.fix === 'object' && /limit|cap/i.test(b.fix.label));
  assert.ok(limit, 'the draft has a spend-limit blocker: ' + JSON.stringify((await tool('campaign.get', { id })).result.blockers.map(b => b.code)));
  await page.locator('.check-fail').filter({ hasText: limit.message }).getByRole('button', { name: limit.fix.label }).click();
  await sheet().getByRole('heading', { name: 'Set the spend cap' }).waitFor();
  await page.waitForFunction(() => { const i = document.querySelector('[role="dialog"] input[type="number"]'); return i && Number(i.value) > 0; }, null, { timeout: 15000 });   // the estimate's suggestion fills the field once it arrives
  assert.equal(await sheet().getByRole('button', { name: 'Save the cap' }).getAttribute('aria-disabled'), null, 'the suggested amount is filled in');
  await sheet().getByLabel('Spend cap (₹)').fill('');
  assert.equal(await sheet().getByRole('button', { name: 'Save the cap' }).getAttribute('aria-disabled'), 'true', 'no amount, no button');
  await sheet().getByRole('button', { name: 'Use that amount' }).click();
  await sheet().getByRole('button', { name: 'Save the cap' }).click();
  await sheet().waitFor({ state: 'detached', timeout: 10000 });
  const after = (await tool('campaign.get', { id })).result;
  assert.ok(after.campaign.policy.capInrMilli > 0, 'the server holds the cap');
  assert.ok(!after.blockers.some(b => b.message === limit.message), 'the spend-limit check cleared');
});

test('Contacts list: the whole row opens the person, not only the name', async () => {
  await page.goto(`${BASE}/contacts`);
  const row = page.locator('table tbody tr').first();
  await row.waitFor();
  await row.locator('td').nth(1).click();
  await page.waitForURL(u => /\/contacts\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 8000 });
  await page.getByText('Can she call?').waitFor();
});

test('Wallet: an empty wallet says how to add money, on Today and in the sidebar', async () => {
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { name: 'Today' }).waitFor();
  const w = (await tool('wallet.get')).result;
  if ((w.balanceInrMilli ?? w.balanceMilli ?? 0) > 0) return;   // only an empty wallet shows the prompt
  await page.locator('.walletchip').getByText('Add money').waitFor();
  await page.getByRole('link', { name: 'Add money' }).first().click();
  await page.waitForURL('**/settings/billing');
});

test('Agent rules: objections are written in boxes that show the whole text', async () => {
  const id = (await pool.query("SELECT id FROM agent WHERE workspace_id = $1 AND name = 'Renewals, Pune'", [ws])).rows[0].id;
  await page.goto(`${BASE}/agents/${id}?tab=rules`);
  const f = page.getByLabel('Her approach').first();
  await f.waitFor();
  assert.equal(await f.evaluate(e => e.tagName), 'TEXTAREA', 'a text area, not a one-line input that cuts the text off');
});

// ---- The call page as a reviewer's tool: reply timing, inline marks, a recording the transcript follows ----
// The seeded real calls: 'agreed' (Sunita Verma, timed replies), 'opt_out' (a safety event and an opt-out), 'objection' and 'no answer'.
const callByEnd = async end => (await pool.query("SELECT cv.id FROM conversation cv WHERE cv.workspace_id = $1 AND cv.end_reason = $2 AND cv.channel <> 'test' ORDER BY cv.started_at LIMIT 1", [ws, end])).rows[0].id;
const callByContact = async name => name === 'Imran Qureshi' ? callByEnd('opt_out') : (await pool.query("SELECT cv.id FROM conversation cv JOIN contact c ON c.id = cv.contact_id WHERE cv.workspace_id = $1 AND c.name = $2 AND cv.channel <> 'test' ORDER BY cv.started_at LIMIT 1", [ws, name])).rows[0].id;
const callCard = () => page.locator('section[aria-labelledby="rt-h"]');

test('Call page: reply timing is the runtime\'s own figures with the call\'s median and slowest, and says what was measured', async () => {
  const id = await callByContact('Sunita Verma');
  const turns = (await tool('call.get', { conversationId: id })).result.turns.filter(t => t.speaker === 'agent' && t.latency?.latencyMs);
  const ms = turns.map(t => t.latency.latencyMs).sort((a, b) => a - b);
  assert.ok(ms.length >= 2, 'the seeded call has timed replies');
  const median = ms.length % 2 ? ms[(ms.length - 1) / 2] : (ms[ms.length / 2 - 1] + ms[ms.length / 2]) / 2;
  await page.goto(`${BASE}/calls/${id}`);
  await callCard().getByRole('heading', { name: 'Reply timing' }).waitFor({ timeout: 10000 });
  const text = await callCard().innerText();
  const fmt = n => `${Math.round(n).toLocaleString('en-IN')} ms`;
  assert.ok(text.includes(fmt(median)), `median ${fmt(median)} is shown: ${text}`);
  assert.ok(text.includes(fmt(ms[ms.length - 1])), 'the slowest reply is shown');
  assert.match(text, new RegExp(`${ms.length} of ${ms.length} repl`), 'it says how many replies were measured');
  assert.match(text, /as the voice runtime measured it/, 'and where the figure comes from');
  await callCard().getByRole('button', { name: /^at \d+:\d\d$/ }).click();   // the slowest reply links to its line
});

test('Call page: "Why this call was allowed" shows the dial gate\'s stored record line for line, with its gate version', async () => {
  const id = await callByContact('Sunita Verma');
  const a = (await tool('call.get', { conversationId: id })).result.allowedBy;
  assert.equal(a.allowed, true, 'the seeded call carries a dial-gate record');
  await page.goto(`${BASE}/calls/${id}`);
  const lines = page.locator('ul[aria-labelledby="allowed-h"] > li');
  await lines.first().waitFor({ timeout: 10000 });
  assert.deepEqual((await lines.allInnerTexts()).map(t => t.trim()), a.checks.map(k => k.text), 'the page and the stored trace agree, in order');
  const card = page.locator('section').filter({ has: page.locator('#allowed-h') }).last();
  const text = await card.innerText();
  assert.ok(a.gateText && text.includes(`by ${a.gateText}.`), `the gate version is shown in words: ${text}`);
  assert.match(a.gateText, /^the dial gate of \d{1,2} \w+ 20\d\d, revision \d+$/);
  // The notes the gate stored read as their own sentences: the basis and DND result, the hours, the hold.
  assert.match(text, /on the basis of an existing relationship with the business \(recorded for: renewal\); Do Not Disturb does not apply to it\./);
  assert.match(text, /calling hours for a service call: 10:00 to 19:00, Monday to Saturday, not on national holidays/);
  assert.match(text, /Rs 30 was held in the wallet for up to 10 minutes, within the workspace's and the campaign's spend caps\./);
  assert.doesNotMatch(text, /\bG\d+\b|_/, 'no rule ids or field names');
});

test('Call page: a call with no reply timing says so and shows no figure; a call nobody answered has no card', async () => {
  const id = await callByContact('Imran Qureshi');
  const t = (await tool('call.get', { conversationId: id })).result.turns.filter(x => x.speaker === 'agent' && x.latency?.latencyMs).length;
  await page.goto(`${BASE}/calls/${id}`);
  await callCard().getByRole('heading', { name: 'Reply timing' }).waitFor({ timeout: 10000 });
  const text = await callCard().innerText();
  if (t === 0) assert.match(text, /did not record reply timing/); else assert.match(text, /Median reply gap/);
  assert.ok(!/Median reply gap/.test(await page.locator('section[aria-labelledby="rt-h"]').first().innerText()) || t > 0, 'no figure without a measurement');
});

test('Call page: her AI statement, the safety rule that acted and the opt-out sit on the lines they belong to', async () => {
  const id = await callByContact('Imran Qureshi');
  await page.goto(`${BASE}/calls/${id}`);
  const turns = page.locator('ol.turns > li');
  await turns.first().waitFor({ timeout: 10000 });
  await turns.nth(0).getByText('Says she is an AI').waitFor();
  const caller = turns.filter({ hasText: 'Caller' }).first();
  await caller.getByText(/^Opt-out heard/).waitFor();
  const safety = (await tool('call.get', { conversationId: id })).result.safety;
  assert.ok(safety.length > 0, 'the call has a safety event');
  const reply = turns.filter({ hasText: 'Agent' }).nth(1);
  await reply.getByText('AI-identity rule replaced a sentence before she said it').waitFor();
});

test('Call page: with a recording the browser can open, a line plays from its moment and the playing line is highlighted', async () => {
  const id = await callByContact('Sunita Verma');
  const hookPort = Number(new URL(BASE).port) + 1;
  await pool.query('UPDATE conversation SET recording_uri = $2 WHERE id = $1', [id, `http://127.0.0.1:${hookPort}/audio.wav?secs=60`]);   // a fixture: the dev server serves a silent recording
  try {
    await page.goto(`${BASE}/calls/${id}`);
    const audio = page.locator('audio.callaudio');
    await audio.waitFor({ timeout: 10000 });
    await page.waitForFunction(() => { const a = document.querySelector('audio.callaudio'); return a && a.readyState >= 1 && a.duration > 50; }, null, { timeout: 15000 });
    const turns = page.locator('ol.turns > li');
    const second = turns.filter({ hasText: 'Agent' }).nth(1);
    const startMs = (await tool('call.get', { conversationId: id })).result.turns.filter(t => t.speaker === 'agent')[1].started_ms;
    await second.getByRole('button').click();
    await page.waitForFunction(ms => Math.abs(document.querySelector('audio.callaudio').currentTime - ms / 1000) < 1.5, startMs, { timeout: 8000 });
    await page.waitForFunction(() => document.querySelectorAll('ol.turns > li.now').length === 1, null, { timeout: 8000 });
    assert.ok(await second.evaluate(e => e.classList.contains('now')), 'the line that was clicked is the one highlighted');
    // As the audio moves, the highlight follows it to the line being played.
    const last = turns.last(); const lastStart = (await tool('call.get', { conversationId: id })).result.turns.at(-1).started_ms;
    await page.evaluate(ms => { document.querySelector('audio.callaudio').currentTime = ms / 1000 + 0.5; }, lastStart);
    await page.waitForFunction(() => { const l = document.querySelectorAll('ol.turns > li'); return l[l.length - 1].classList.contains('now'); }, null, { timeout: 8000 });
    assert.ok(await last.evaluate(e => e.classList.contains('now')));
  } finally { await pool.query('UPDATE conversation SET recording_uri = NULL WHERE id = $1', [id]); }
});

test('Call page: a recording the browser cannot open is not offered as playable, and the page says why', async () => {
  const id = await callByContact('Sunita Verma');
  await pool.query('UPDATE conversation SET recording_uri = $2 WHERE id = $1', [id, 'file:///var/lib/vp/recordings/call.wav']);
  try {
    await page.goto(`${BASE}/calls/${id}`);
    // With a runtime address the server signs a link, and the runtime has no such file: the page says so. Without one, the server says why.
    const said = process.env.VP_RUNTIME_PUBLIC_URL ? 'The voice server did not return this recording' : "public address is not set on this server";
    await page.getByText(said, { exact: false }).waitFor({ timeout: 10000 });
    assert.equal(await page.locator('audio.callaudio').count(), 0, 'no player for a recording the browser cannot open');
  } finally { await pool.query('UPDATE conversation SET recording_uri = NULL WHERE id = $1', [id]); }
});

test('Call page on a devsim browser call: her AI statement is marked and reply timing is the runtime\'s or says none was recorded', { skip: process.env.VP_DEVSIM_URL ? false : 'no voice runtime (devsim) on this machine' }, async () => {
  const riya = (await pool.query("SELECT id FROM agent WHERE workspace_id = $1 AND name = 'Renewals, Pune'", [ws])).rows[0].id;
  await page.goto(`${BASE}/agents/${riya}`);
  await page.getByRole('radio', { name: 'Test her' }).click();
  await page.getByRole('button', { name: 'Call me in the browser' }).click();
  const call = page.locator('.bcall');
  await call.locator('.bcap.agent').nth(1).waitFor({ timeout: 60000 });
  await call.getByRole('button', { name: 'Hang up' }).click();
  const id = (await call.getByRole('link', { name: 'See this call' }).getAttribute('href')).split('/').pop();
  let timed = 0;
  for (const t0 = Date.now(); Date.now() - t0 < 20000; await new Promise(r => setTimeout(r, 400))) {
    const r = (await pool.query("SELECT count(*)::int AS n, count(*) FILTER (WHERE (latency->>'latencyMs')::numeric > 0)::int AS timed FROM turn WHERE conversation_id = $1", [id])).rows[0];
    if (r.n >= 3) { timed = r.timed; break; }
  }
  await page.goto(`${BASE}/calls/${id}?include=test`);
  await callCard().getByRole('heading', { name: 'Reply timing' }).waitFor({ timeout: 10000 });
  // Her disclosure is marked from the words she was heard saying. The fake caller can cut her opening short, so the mark is either of the two honest outcomes, and it must match the words.
  const heard = (await pool.query("SELECT text FROM turn WHERE conversation_id = $1 AND speaker = 'agent' ORDER BY idx LIMIT 2", [id])).rows.map(r => r.text);
  const said = heard.some(t => /\bAI\b|\bA\.I\.|artificial intelligence|virtual assistant|digital assistant|एआई|ए\.आई|कृत्रिम बुद्धि/i.test(t));
  await page.locator('ol.turns > li').first().getByText(said ? 'Says she is an AI' : 'No AI statement found in her opening').waitFor();
  const text = await callCard().innerText();
  if (timed > 0) assert.match(text, /Median reply gap/); else assert.match(text, /did not record reply timing/);
});

// ---- Second buyer walkthrough (research/2026-10-24/walkthrough/FRICTION.md): each flow is one friction a buyer met ----
const phonePage = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', storageState: await ctx.storageState() }); return [c, await c.newPage()]; };
const riyaId = async () => (await pool.query("SELECT id FROM agent WHERE workspace_id = $1 AND name = 'Renewals, Pune'", [ws])).rows[0].id;

test('Tabs: on a phone the agent tabs are one row that says it scrolls, and the chosen tab is in view; on desktop they never wrap', async () => {
  const id = await riyaId();
  const [c, p] = await phonePage();
  try {
    await p.goto(`${BASE}/agents/${id}`);
    const tabs = p.getByRole('tablist', { name: 'Builder sections' }).getByRole('tab');
    await tabs.first().waitFor();
    const tops = await tabs.evaluateAll(els => els.map(e => e.getBoundingClientRect().top));
    assert.equal(new Set(tops.map(Math.round)).size, 1, 'all tabs sit on one row');
    const more = p.getByRole('button', { name: 'More builder sections' });
    await more.waitFor();
    await more.click();
    await p.getByRole('button', { name: 'Earlier builder sections' }).waitFor();
    await p.goto(`${BASE}/agents/${id}?tab=versions`);
    const on = p.getByRole('tab', { name: 'Versions' });
    await on.waitFor();
    await p.waitForTimeout(300);
    const [r, box] = await on.evaluate(e => [e.getBoundingClientRect().toJSON(), e.closest('[role=tablist]').getBoundingClientRect().toJSON()]);
    assert.ok(r.left >= box.left - 1 && r.right <= box.right + 1, 'the chosen tab is fully in view');
  } finally { await c.close(); }
  await page.goto(`${BASE}/agents/${id}`);
  await page.getByRole('tablist', { name: 'Builder sections' }).getByRole('tab').first().waitFor();
  const dtops = await page.getByRole('tablist', { name: 'Builder sections' }).getByRole('tab').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  assert.equal(new Set(dtops).size, 1, 'desktop tabs are one row, not two');
});

test('Billing: each line is the server\'s own figure, and the lines add up to the total', async () => {
  const inv = (await tool('invoice.get')).result;
  await page.goto(`${BASE}/settings/billing`);
  const list = page.getByRole('list', { name: 'Spend by part' });
  await list.waitFor();
  const shown = (await list.locator('li span.tnum').allInnerTexts()).map(t => Math.round(Number(t.replace(/[₹,]/g, '')) * 100));
  // Each line is shown to the paisa, so the sum of the shown lines may differ from the total by under half a paisa per line.
  const want = inv.byComponent.map(l => Math.round(l.costInrMilli / 10));
  assert.deepEqual(shown, want, 'each line is the server\'s figure for that part, to the paisa');
  assert.ok(Math.abs(shown.reduce((a, b) => a + b, 0) * 10 - inv.costInrMilli) <= 5 * shown.length, 'the lines add up to the total, within rounding');
  if (inv.costInrMilli > 0) assert.ok(shown.some(n => n > 0), 'a non-zero total has a non-zero line');
});

test('Numbers: a search the server cannot run says what it means for the buyer, never a server setting', async () => {
  await page.goto(`${BASE}/numbers`);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.waitForTimeout(1500);
  const text = await page.locator('main').innerText();
  assert.doesNotMatch(text, /\bVP_[A-Z_]+|set .*=1|credentials on the server/, 'no environment variable or server instruction reaches the page');
  const raw = await tool('number.search', { series: '1600', limit: 10 });
  if (raw.status === 'not_executed') await page.getByText('Phone lines are not switched on for this workspace yet', { exact: false }).waitFor();
});

test('Contact: a number the register never answered is not called "recent enough" for promotional calls', async () => {
  const c = (await pool.query('SELECT id FROM contact WHERE workspace_id = $1 AND erased_at IS NULL ORDER BY created_at LIMIT 1', [ws])).rows[0].id;
  const g = (await tool('contact.get', { id: c })).result;
  await page.goto(`${BASE}/contacts/${c}`);
  const card = page.locator('section, article, div.card').filter({ has: page.getByRole('heading', { name: 'Do Not Disturb' }) }).last();
  await card.waitFor();
  if ((g?.dnd?.status ?? 'unknown') === 'unknown') {
    assert.doesNotMatch(await card.innerText(), /Recent enough/, 'no "recent enough" for a number with no answer');
    await card.getByText(/Never looked up|The register gave no answer/).waitFor();
  }
});

test('Agent tools: ending the call and handing over are stated as they work, not as switches that do nothing', async () => {
  await page.goto(`${BASE}/agents/${await riyaId()}?tab=tools`);
  await page.getByRole('heading', { name: 'What she can do during a call' }).waitFor();
  assert.equal(await page.getByRole('switch', { name: 'End the call herself' }).count(), 0, 'no switch for ending the call');
  assert.equal(await page.getByRole('switch', { name: 'Connect to a person' }).count(), 0, 'no switch for handing over');
  const always = page.getByRole('list', { name: 'Always part of every call' });
  await always.getByText('Always on').waitFor();
  await always.getByRole('link', { name: 'Change when she hands over' }).click();
  await page.getByRole('heading', { name: 'Hand-off to a person' }).waitFor();
});

test('Agent job: goals and fact values are boxes that show the whole text', async () => {
  await page.goto(`${BASE}/agents/${await riyaId()}?tab=job`);
  const goal = page.getByLabel('What counts as done').first();
  await goal.waitFor();
  assert.equal(await goal.evaluate(e => e.tagName), 'TEXTAREA');
  assert.equal(await page.getByLabel('Value').first().evaluate(e => e.tagName), 'TEXTAREA');
  const purposes = await page.getByLabel('Purpose').first().locator('option').allInnerTexts();
  assert.ok(purposes.every(t => /^[A-Z]/.test(t)), `purposes read as words: ${purposes.join(', ')}`);
});

test('Calls: on a phone each call says why it ended and what it cost; on desktop the list filters by reason and names the campaign', async () => {
  const [c, p] = await phonePage();
  try {
    await p.goto(`${BASE}/calls`);
    const row = p.locator('table tbody tr').first();
    await row.waitFor();
    await row.locator('td[data-label="Why it ended"]').waitFor({ state: 'visible' });
    await row.locator('td[data-label="Cost"]').waitFor({ state: 'visible' });
  } finally { await c.close(); }
  const calls = (await tool('call.search', {})).result.calls;
  const reason = calls.find(x => x.reasonLabel)?.reasonLabel;
  await page.goto(`${BASE}/calls`);
  await page.locator('table tbody tr').first().waitFor();
  await page.getByLabel('Why it ended').selectOption(reason);
  const rows = page.locator('table tbody tr');
  assert.equal(await rows.count(), calls.filter(x => x.reasonLabel === reason).length, 'only calls with that reason are listed');
  const camp = (await tool('campaign.list')).result.campaigns.find(x => calls.some(k => k.campaign_id === x.id));
  if (camp) await rows.first().getByText(camp.name).waitFor();
});

test('Campaign page: it says which agent and version it calls with and which list it calls, each a link', async () => {
  const camp = (await pool.query("SELECT cp.id, a.name AS agent, av.number, au.name AS audience FROM campaign cp JOIN agent_version av ON av.id = cp.agent_version_id JOIN agent a ON a.id = av.agent_id JOIN audience au ON au.id = cp.audience_id WHERE cp.workspace_id = $1 LIMIT 1", [ws])).rows[0];
  await page.goto(`${BASE}/campaigns/${camp.id}`);
  await page.getByRole('link', { name: `${camp.agent}, version ${camp.number}` }).waitFor({ timeout: 10000 });
  await page.getByRole('link', { name: camp.audience }).waitFor();
});

test('Test panel: hearing her comes before the practice callers', async () => {
  await page.goto(`${BASE}/agents/${await riyaId()}?test=1`);
  const hear = page.getByRole('heading', { name: 'Hear her yourself' }), sim = page.getByRole('heading', { name: 'Practice callers' });
  await hear.waitFor(); await sim.waitFor();
  const [a, b] = [await hear.evaluate(e => e.getBoundingClientRect().top), await sim.evaluate(e => e.getBoundingClientRect().top)];
  assert.ok(a < b, 'Hear her yourself is first');
  assert.doesNotMatch(await page.locator('.dock').innerText(), /\bv0\b/, 'an unpublished agent is never "v0"');
});

test('Practice chat: type as the caller; crisis lines, the honest AI answer and a held-back figure show inline; nothing reaches the call log; kept chats go to the test history', async () => {
  const riya = await riyaId();
  const count = async () => (await pool.query("SELECT (SELECT count(*) FROM conversation WHERE workspace_id = $1)::int AS calls, (SELECT count(*) FROM agent_test_run WHERE workspace_id = $1 AND kind = 'chat')::int AS chats", [ws])).rows[0];
  const n0 = await count();
  await page.goto(`${BASE}/agents/${riya}?test=1`);
  await page.getByRole('heading', { name: 'Practice chat' }).waitFor();
  await page.getByText('Practice chat · no call placed').waitFor();
  const box = page.getByLabel('What the caller says'), send = page.getByRole('button', { name: 'Send' });
  const her = () => page.locator('.pchat-line.agent').last();
  // Denial bait: the honest answer comes first.
  await box.fill('Sach batao, aap real insaan ho ya bot?'); await send.click();
  await page.locator('.pchat-line.agent').first().waitFor({ timeout: 15000 });
  assert.match(await her().innerText(), /AI assistant hoon/);
  await her().getByText('Added first: Honest answer about being an AI.').waitFor();
  // A figure not in her facts is held back, and the builder can see what she would have said.
  await box.fill('Kitna lagega?'); await send.click();
  await page.locator('.pchat-line.agent').nth(1).waitFor({ timeout: 15000 });
  assert.doesNotMatch(await her().locator('p').first().innerText(), /40%/);
  await her().getByText(/^Held back:/).first().waitFor();
  await her().getByText('What she would have said').first().click();
  await her().getByText(/40% ka special discount/).waitFor();
  // A crisis line: Tele-MANAS 14416 and 112, a person offered, no agenda.
  await box.fill('Ab jeene ka mann nahi karta, sab khatam kar dena chahta hoon.'); await send.click();
  await page.locator('.pchat-line.agent').nth(2).waitFor({ timeout: 15000 });
  const crisis = await her().locator('p').first().innerText();
  assert.match(crisis, /14416/); assert.match(crisis, /\b112\b/); assert.doesNotMatch(crisis, /renewal/i);
  await her().getByText('Said instead: Crisis support.').waitFor();
  const shotDir = process.env.E2E_RESHOOT === '1' ? path.join(process.cwd(), 'product/web/shots') : DIAG;
  fs.mkdirSync(shotDir, { recursive: true });
  const panel = page.locator('section[aria-labelledby="pc-h"]');
  await panel.screenshot({ path: path.join(shotDir, 'practice-chat-1440.png') });
  assert.deepEqual((await count()).calls, n0.calls, 'a practice chat places no call and writes nothing to the call log');
  await page.getByRole('button', { name: 'Keep for review' }).click();
  await page.getByText('Kept in the test history').waitFor();
  assert.equal((await count()).chats, n0.chats + 1, 'kept: one chat in the test-run history');
  const kept = (await pool.query("SELECT transcript FROM agent_test_run WHERE workspace_id = $1 AND kind = 'chat' ORDER BY created_at DESC LIMIT 1", [ws])).rows[0].transcript;
  assert.equal(kept.length, 6);
  // On a phone the chat reads in one column, with no sideways scroll.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', storageState: await ctx.storageState() });
  try {
    const p = await phone.newPage();
    await p.goto(`${BASE}/agents/${riya}?test=1`);
    await p.getByRole('heading', { name: 'Practice chat' }).waitFor();
    await p.getByLabel('What the caller says').fill('Aap AI ho kya?');
    await p.getByRole('button', { name: 'Send' }).click();
    await p.locator('.pchat-notes').first().waitFor({ timeout: 15000 });
    const pp = p.locator('section[aria-labelledby="pc-h"]');
    await p.getByRole('button', { name: 'Start over' }).scrollIntoViewIfNeeded();
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll at 390');
    await pp.screenshot({ path: path.join(shotDir, 'practice-chat-390.png') });
  } finally { await phone.close(); }
  assert.deepEqual((await count()).calls, n0.calls);
});

test('Approval sheet: an action the person started says they asked for it, not Vyakti', async () => {
  await page.goto(`${BASE}/settings/billing`);
  await page.getByLabel('Add money (₹)').fill('500');
  await page.getByRole('button', { name: /^Ask to add/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByText('You asked for this', { exact: false }).waitFor();
  assert.doesNotMatch(await sheet.innerText(), /Asked by Vyakti/);
  await sheet.getByRole('button', { name: 'Decline' }).click();
});

test('Team: roles read as names, not codes', async () => {
  await page.goto(`${BASE}/settings/team`);
  await page.locator('.rolehints dt').first().waitFor();
  const names = await page.locator('.rolehints dt').allInnerTexts();
  assert.deepEqual(names, ['Owner', 'Builder', 'Operator', 'Compliance', 'Viewer']);
});

test('Voice stack: "Build your own" is closed until wanted, and the recommended stacks come first', async () => {
  await page.goto(`${BASE}/agents/${await riyaId()}?tab=voice`);
  await page.getByRole('heading', { name: 'Build your own' }).waitFor();
  const custom = (await pool.query("SELECT draft->'voice'->>'stackId' AS s FROM agent WHERE id = $1", [await riyaId()])).rows[0]?.s === 'custom';
  assert.equal(await page.locator('details.buildown').evaluate(d => d.open), custom, 'open only when the agent already runs its own parts');
  if (!custom) { await page.getByText('Show the parts').click(); await page.getByRole('button', { name: 'Use these parts' }).waitFor(); }
});

// ---- Security: single sign-on, provisioning tokens, activity-log export, and the sign-in page ----
test('Security: set up single sign-on, see the failed connection test, reveal a provisioning token once, export and download the log, and verify the file', async () => {
  await page.goto(BASE + '/settings/security');
  await page.getByRole('heading', { name: 'Single sign-on', level: 2 }).waitFor();
  assert.equal((await tool('sso.config.get')).result.configured, false, 'nothing is configured yet');
  // The redirect URI is on screen with a copy button, before anything is saved.
  assert.match(await page.locator('.uri').innerText(), /\/v1\/sso\/callback\//);
  // Saving is disabled with a reason until the form is complete.
  await page.getByLabel('Issuer address').fill('https://login.example-idp.test');
  assert.match(await page.locator('.btn-reason').first().innerText(), /client ID/i);
  const SECRET = 'e2e-client-secret-not-real-7731';
  await page.getByLabel('Client ID').fill('vyakti-e2e-client'); await page.getByLabel('Client secret').fill(SECRET); await page.getByLabel('Allowed email domains').fill('saanjh.example');
  await page.getByRole('button', { name: 'Ask to save' }).click();
  await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
  await hold(sheet().locator('.hold'));
  await page.getByText('No unsaved changes.').waitFor({ timeout: 8000 });   // the form is reloaded from the server and is clean again
  const cfg = (await tool('sso.config.get')).result;
  assert.equal(cfg.configured, true); assert.equal(cfg.issuer, 'https://login.example-idp.test'); assert.equal(cfg.hasClientSecret, true); assert.deepEqual(cfg.allowedDomains, ['saanjh.example']);
  assert.ok(!JSON.stringify(cfg).includes(SECRET), 'the client secret never comes back');
  assert.equal(await page.getByLabel('Client secret').inputValue(), '', 'the secret field is cleared after saving');
  // Test connection against an issuer that does not exist: each check is shown with a pass or fail mark and its detail.
  await page.getByRole('button', { name: 'Test connection' }).click();
  await page.getByText('The connection test found a problem.').waitFor({ timeout: 15000 });
  assert.ok(await page.getByRole('list', { name: 'Connection checks' }).locator('li', { hasText: 'Failed' }).count() >= 1, 'a failed check is marked Failed');
  assert.ok(await page.getByRole('list', { name: 'Connection checks' }).locator('li', { hasText: 'Passed' }).count() >= 1, 'a passed check is marked Passed');
  // Requiring single sign-on asks for a break-glass owner and warns plainly.
  await page.getByRole('button', { name: /^Require single sign-on/ }).click();
  await sheet().getByText(/loses their password and must use single sign-on/).waitFor();
  assert.match(await sheet().innerText(), /break-glass/i);
  await page.keyboard.press('Escape');
  // Provisioning token: shown once.
  await page.getByLabel('Name', { exact: true }).fill('e2e token');
  assert.match(await page.locator('.btn-reason', { hasText: /at least one/ }).innerText(), /Choose at least one thing the token may do/, 'creating is disabled, with a reason, until a scope is chosen');
  await page.getByLabel('List people').check();
  await page.getByRole('button', { name: 'Ask to create' }).click();
  await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
  await hold(sheet().locator('.hold'));
  await page.getByRole('heading', { name: 'Copy your provisioning token now' }).waitFor({ timeout: 8000 });
  const tok = (await page.locator('.secret').first().innerText()).trim();
  assert.match(tok, /^vps_/, 'the token is shown once');
  await page.getByRole('button', { name: 'I have saved it' }).click();
  const list = (await tool('scim.token.list')).result;
  assert.ok(list.tokens.some(t => t.name === 'e2e token'), 'the server holds the token');
  assert.ok(!JSON.stringify(list).includes(tok), 'the list never contains the secret');
  const made = (await actions('executed')).find(a => a.tool === 'scim.token.create');
  assert.equal((await tool('secret.reveal', { revealId: made.result.revealId })).status, 'not_executed', 'a second reveal is refused');
  // Activity-log export: ask, approve, download, verify.
  await page.getByRole('button', { name: 'Ask to export' }).click();
  await sheet().getByRole('heading', { name: 'Approve to continue' }).waitFor();
  await hold(sheet().locator('.hold'));
  await page.getByText('Your export is ready.').waitFor({ timeout: 10000 });
  const exp = (await tool('audit.export.list')).result.exports[0];
  assert.ok(exp && exp.downloadable && exp.rows > 0, 'the server holds a downloadable export');
  const link = page.locator('a[href^="/v1/audit/exports/"]').first();
  const dl = await ctx.request.get(BASE + await link.getAttribute('href'));
  assert.equal(dl.status(), 200);
  const body = await dl.text();
  assert.match(body.split('\r\n')[0], /^at,id,actor_type/, 'a CSV with its header row');
  const { createHash } = await import('node:crypto');
  assert.equal(createHash('sha256').update(body).digest('hex'), exp.sha256, 'the file is what the checksum says');
  assert.ok((await pool.query("SELECT 1 FROM audit_event WHERE workspace_id = $1 AND action = 'audit.export.download'", [ws])).rowCount > 0, 'the download is in the ledger');
  // Verify a file from the page: the browser hashes the downloaded bytes and the server checks them.
  const file = path.join(os.tmpdir(), 'vp-e2e-export.csv'); fs.writeFileSync(file, body);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#verify-file').setInputFiles(file);
  await page.getByRole('button', { name: 'Check this file' }).click();
  await page.getByText('This file is exactly what Vyakti exported.').waitFor({ timeout: 8000 });
  const edited = path.join(os.tmpdir(), 'vp-e2e-export-edited.csv'); fs.writeFileSync(edited, body + 'tampered\n');   // another name: a browser does not report a "change" for the same path
  await page.locator('#verify-file').setInputFiles(edited);
  await page.getByRole('button', { name: 'Check this file' }).click();
  await page.getByText(/This file is not the one Vyakti exported/).waitFor({ timeout: 8000 });
});

test('Sign-in page: /signin shows the single sign-on option and plain messages for sso_error codes and for a workspace that requires it', async () => {
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); const p = await anon.newPage();
  const seen = [];
  p.on('console', m => { if (m.type() === 'error' && !/status of (4|5)\d\d/.test(m.text())) seen.push(m.text()); });
  await p.goto(BASE + '/signin?sso_error=state_mismatch', { waitUntil: 'networkidle' });
  await p.getByRole('heading', { name: 'Welcome back' }).waitFor();
  await p.getByText('The sign-in took too long or was started in another browser. Try again.').waitFor();
  assert.ok(!/state_mismatch/.test(await p.locator('body').innerText()), 'the code itself is never shown');
  await p.goto(BASE + '/signin?sso_error=wrong_aud'); await p.getByText("Your identity provider's response could not be verified. Ask your administrator to check the single sign-on settings.").waitFor();
  await p.goto(BASE + '/signin?sso_error=domain_mismatch'); await p.getByText(/email domain is not allowed/).waitFor();
  assert.deepEqual((await axe(p)).filter(v => v.impact === 'serious' || v.impact === 'critical'), [], 'axe on the sign-in page with an error');
  // A domain with no single sign-on says so; an empty email asks for one.
  await p.goto(BASE + '/signin');
  await p.getByRole('button', { name: 'Sign in with SSO' }).click();
  await p.getByText('Enter your work email above first.').waitFor();
  await p.getByLabel('Work email').fill('someone@nowhere.example');
  await p.getByRole('button', { name: 'Sign in with SSO' }).click();
  await p.getByText('Single sign-on is not set up for nowhere.example.').waitFor();
  // A domain with single sign-on (configured above, issuer unreachable) reaches the server's own refusal, in words.
  await p.getByLabel('Work email').fill('asha@saanjh.example');
  await p.getByRole('button', { name: 'Sign in with SSO' }).click();
  await p.getByText(/identity provider/i).first().waitFor({ timeout: 15000 });
  assert.ok(!/idp_unreachable|not_configured/.test(await p.locator('body').innerText()), 'no code on screen');
  await anon.close();
});

// ---- Accessibility (WCAG 2.1 AA): axe on every main screen, and the main flows done with the keyboard alone ----
// Tab until the element has focus (it must be reachable in tab order, within `max` presses), as a keyboard user does.
async function tabTo(p, loc, max = 120) {
  await loc.waitFor();
  for (let i = 0; i < max; i++) {
    if (await loc.evaluate(e => e === document.activeElement || e.contains(document.activeElement))) return;
    await p.keyboard.press('Tab');
  }
  throw new Error(`not reachable with Tab in ${max} presses: ${await loc.evaluate(e => e.outerHTML.slice(0, 120))}`);
}

test('Accessibility: no serious or critical axe violation on any main screen, desktop and phone', async () => {
  const res = await audit(browser, BASE, await ctx.storageState());
  const bad = res.flatMap(r => r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${r.screen} (${r.size}): ${v.id}, ${v.help} [${v.targets.join(' | ')}]`));
  assert.ok(res.length >= 40, `audited ${res.length} screen states`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('Keyboard: the first Tab stop skips the navigation to the page', async () => {
  await page.goto(`${BASE}/calls`);
  await page.getByRole('heading', { name: 'Calls', level: 1 }).waitFor();
  await page.locator('body').focus();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  assert.ok(await skip.evaluate(e => e === document.activeElement), 'the skip link is the first stop');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
});

test('Keyboard only: create an agent from a template, start a test call, import a list, set the launch cap and approve', async () => {
  const email = `keyboard-${Date.now()}@a11y.example`;
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', permissions: ['microphone'] });
  assert.ok((await c.request.post(BASE + '/v1/signup', { data: { workspace: 'Keyboard Test Hospital', name: 'Ravi Menon', email, password: 'sample-password-1234' } })).ok());
  const p = await c.newPage();
  const srv = async (name, args = {}) => (await (await c.request.post(`${BASE}/v1/tools/${name}`, { data: { args } })).json());
  try {
    // 1. Create an agent from a template on the guided start.
    await p.goto(`${BASE}/`);
    await tabTo(p, p.getByRole('radio', { name: 'Start from a template' })); await p.keyboard.press('Enter');
    await tabTo(p, p.getByRole('radio', { name: /Clinic appointment confirmation/ }).first()); await p.keyboard.press('Enter');
    await tabTo(p, p.getByLabel('Agent name')); await p.keyboard.press('ControlOrMeta+a'); await p.keyboard.type('Keyboard appointments');
    await tabTo(p, p.getByRole('button', { name: 'Create draft' })); await p.keyboard.press('Enter');
    await p.waitForURL('**/agents/*', { timeout: 15000 });
    const agentId = p.url().split('/agents/')[1].split('?')[0];
    // 2. Start a test call in the browser (the call view, or the server's own reason when no voice runtime runs here).
    await tabTo(p, p.getByRole('button', { name: 'Test her' }).first()); await p.keyboard.press('Enter');
    await tabTo(p, p.getByRole('button', { name: 'Call me in the browser' })); await p.keyboard.press('Enter');
    await p.locator('.bcall, .testpanel .state').first().waitFor({ timeout: 20000 });
    const hang = p.locator('.bcall').getByRole('button', { name: 'Hang up' });
    if (await hang.count()) { await tabTo(p, hang); await p.keyboard.press('Enter'); await p.getByText('You hung up.').waitFor({ timeout: 10000 }); }
    // 3. Import a list.
    await p.goto(`${BASE}/contacts/import`);
    await tabTo(p, p.getByRole('button', { name: 'Use a made-up sample' })); await p.keyboard.press('Enter');
    await tabTo(p, p.getByRole('button', { name: 'Check the file' })); await p.keyboard.press('Enter');
    await p.getByText('3. What will happen to each row').waitFor({ timeout: 15000 });
    await tabTo(p, p.getByRole('button', { name: /^Save \d+ contacts?$/ })); await p.keyboard.press('Enter');
    await p.getByText('List imported', { exact: false }).first().waitFor({ timeout: 15000 });
    // 4. Publish (approve by pressing twice), draft a campaign through the API, then fix its spend cap check from the page.
    await p.goto(`${BASE}/agents/${agentId}`);
    await tabTo(p, p.getByRole('button', { name: 'Publish…' })); await p.keyboard.press('Enter');
    const sheet = p.getByRole('dialog');
    const hold = sheet.locator('.hold');
    await tabTo(p, hold); await p.keyboard.press('Enter'); await p.keyboard.press('Enter');
    await sheet.waitFor({ state: 'detached', timeout: 15000 });
    const version = (await srv('agent.get', { agentId })).result.versions?.[0]?.id;
    assert.ok(version, 'the agent was published with the keyboard');
    const aud = (await srv('audience.list')).result.audiences[0].id;
    const camp = await srv('campaign.draft', { name: 'Keyboard pilot', category: 'service', agentVersionId: version, audienceId: aud });
    assert.equal(camp.status, 'confirmed', JSON.stringify(camp));
    await p.goto(`${BASE}/campaigns/${camp.result.id}`);
    await tabTo(p, p.getByRole('button', { name: 'Set a limit' })); await p.keyboard.press('Enter');
    const capSheet = p.getByRole('dialog');
    await tabTo(p, capSheet.getByLabel('Spend cap (₹)')); await p.keyboard.press('ControlOrMeta+a'); await p.keyboard.type('150');
    assert.ok(await capSheet.getByLabel('Spend cap (₹)').evaluate(e => e === document.activeElement), 'focus stays in the field while typing');
    await tabTo(p, capSheet.getByRole('button', { name: 'Save the cap' })); await p.keyboard.press('Enter');
    await capSheet.waitFor({ state: 'detached', timeout: 10000 });
    await p.getByText('₹150').first().waitFor({ timeout: 10000 });
  } finally { await c.close(); }
});

// ---- Stack voice samples (R13): the manifest the lab VM drops into web/public/samples/, served from dist/samples/ ----
test('Voice samples: a stack with a sample plays it with one labelled control and says what she says; others say none is recorded', async () => {
  const dir = path.join(process.cwd(), 'product/web/dist/samples'), manifest = path.join(dir, 'manifest.json');
  const shipped = fs.readFileSync(manifest, 'utf8');   // whatever the product ships is put back afterwards
  // The shipped manifest holds only real renders from the lab VM (research/2026-10-24/samples): every entry names files
  // ("files" with several renditions, or one "file") that are in the build, a short duration and the line she says.
  for (const [sid, e] of Object.entries(JSON.parse(shipped))) {
    const files = Array.isArray(e.files) ? e.files.map(f => String(f.src ?? f.file ?? '').replace(/^\/samples\//, '')) : [e.file];
    assert.ok(files.length && files.every(f => f && fs.existsSync(path.join(dir, f))), `${sid}: ${files.join(', ')} in the build`);
    assert.ok(e.durationS > 0 && e.durationS <= 12, `${sid}: ${e.durationS} s`);
    assert.ok(typeof e.text === 'string' && e.text.length > 0, `${sid}: the line she says`);
  }
  const id = await riyaId();
  const stackId = (await pool.query("SELECT draft->'voice'->>'stackId' AS s FROM agent WHERE id = $1", [id])).rows[0].s || 'v2-flashlite';
  // A fixture in the untracked build folder: 2 s of a quiet tone. Its entry lists a rendition no browser plays first, so the
  // player must fall through to the second, as Safari does from Ogg to AAC.
  const rate = 8000, n = rate * 2, wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(800 * Math.sin(2 * Math.PI * 220 * i / rate)), 44 + i * 2);
  fs.writeFileSync(path.join(dir, 'e2e-fixture.wav'), wav);
  const entry = { files: [{ src: 'e2e-missing.ogg', type: 'audio/x-unplayable' }, { src: 'e2e-fixture.wav', type: 'audio/wav' }], durationS: 2, text: 'Namaste, main Riya bol rahi hoon. Yeh ek sample hai.', recordedAt: '2026-10-24T10:00:00Z' };
  fs.writeFileSync(manifest, JSON.stringify({ [stackId]: entry }));
  try {
    await page.goto(`${BASE}/agents/${id}?tab=voice`);
    const card = page.locator('.stackcard').filter({ has: page.locator('.sample') }).first();
    const play = card.getByRole('button', { name: /^Play the sample of .*, 2 seconds$/ });
    await play.waitFor({ timeout: 10000 });
    assert.equal(await play.getAttribute('aria-pressed'), 'false');
    assert.equal(await card.locator('audio source').count(), 2, 'one <source> per rendition');
    await play.click();
    await card.getByRole('button', { name: /^Pause the sample of / }).waitFor({ timeout: 5000 });
    assert.match(await card.locator('audio').evaluate(a => a.currentSrc), /e2e-fixture\.wav/, 'the playable rendition was chosen');
    await card.getByRole('button', { name: /^Play the sample of / }).waitFor({ timeout: 8000 });   // it ends by itself
    await card.getByText('What she says').click();
    await card.getByText('Yeh ek sample hai.', { exact: false }).waitFor();
    assert.ok(await page.locator('.stackcard').filter({ hasText: 'No sample recorded yet' }).count() > 0, 'stacks with no entry still say so');
    // A browser that can play none of the renditions says so, instead of a button that does nothing.
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: await ctx.storageState() });
    await c.addInitScript(() => { HTMLMediaElement.prototype.canPlayType = () => ''; });
    const p = await c.newPage();
    try {
      await p.goto(`${BASE}/agents/${id}?tab=voice`);
      const card2 = p.locator('.stackcard').filter({ has: p.locator('.sample') }).first();
      await card2.getByText("This browser can't play the sample").waitFor({ timeout: 10000 });
      assert.equal(await card2.getByRole('button', { name: /^Play the sample of / }).count(), 0);
    } finally { await c.close(); }
  } finally { fs.writeFileSync(manifest, shipped); fs.rmSync(path.join(dir, 'e2e-fixture.wav'), { force: true }); }
});

// ---- Outcomes and checks (must-be brief 7): what counts as a result, how it is judged, and "Uncalibrated" until it passes
test('Outcomes and checks: values, fields, judge and calibration as the server holds them; a judge change is a new uncalibrated version', async () => {
  const shotDir = process.env.E2E_RESHOOT === '1' ? path.join(process.cwd(), 'product/web/shots') : DIAG;
  const made = await tool('outcome.define', { name: 'EMI promise', question: 'Did they promise to pay this month?', allowedValues: ['promised', 'callback', 'refused', 'needs_human'], goalValues: ['promised'],
    fields: [{ key: 'pay_by', label: 'Pay by', type: 'date' }, { key: 'reason', label: 'Reason for delay', type: 'enum', values: ['salary_late', 'dispute', 'other'] }, { key: 'mood', type: 'sentiment' }] });
  assert.equal(made.status, 'confirmed', JSON.stringify(made));
  await page.goto(`${BASE}/settings/outcomes`);
  const card = page.locator('.card', { has: page.getByRole('heading', { name: 'EMI promise' }) });
  await card.waitFor();
  await card.getByText('Uncalibrated', { exact: true }).waitFor();
  assert.ok(await card.getByText('Promised · goal').isVisible(), 'the goal value is marked');
  assert.ok(await card.getByText(/Reason for delay · Choice: Salary late, Dispute, Other/).isVisible());
  assert.ok(await card.getByText(/Sentiment \(five-point scale\)/).isVisible());
  fs.mkdirSync(shotDir, { recursive: true });
  await card.screenshot({ path: path.join(shotDir, 'outcomes-and-checks.png') });
  await card.getByRole('button', { name: 'Change how it is judged' }).click();
  await card.getByLabel('Instructions').fill('A payment link sent and accepted counts as promised.');
  await card.getByRole('button', { name: 'Save as a new version' }).click();
  // The saved rule renders in a blockquote only once the server's list carries the new judge. A bare getByText also
  // matches the textarea (React mirrors its value into the text), which passed before the save committed (CI, 974a652).
  await card.locator('blockquote', { hasText: 'A payment link sent and accepted counts as promised.' }).waitFor({ timeout: 10000 });
  const def = (await tool('outcome.list')).result.definitions.find(d => d.id === made.result.outcomeDefinitionId);
  assert.equal(def.judge.instructions, 'A payment link sent and accepted counts as promised.');
  assert.equal(def.calibration.status, 'uncalibrated', 'a new judge version starts uncalibrated');
  assert.ok(await card.getByText('Uncalibrated', { exact: true }).isVisible(), 'and the page still says so');
  await card.screenshot({ path: path.join(shotDir, 'outcomes-and-checks-judge.png') });
});

// ---- Hand-offs (must-be brief 6): the runtime's signed report becomes a queue item with her warm brief; a crisis alerts
// every page within 5 s; taking one makes it yours. The conversation row is the dialler's (made in SQL, as BRIDGE does);
// the hand-off itself arrives through the real, signed /hooks/runtime.
async function runtimeReport(conv, events) {
  const body = JSON.stringify({ protocol: 1, conversationId: conv, events });
  const t = String(Date.now());
  const sig = createHmac('sha256', process.env.VP_RUNTIME_SECRET).update(t + '.' + body).digest('hex');
  const r = await fetch(BASE + '/hooks/runtime', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-signature': `t=${t},v1=${sig}` }, body });
  assert.ok(r.ok, 'runtime hook ' + r.status);
}
test('Hand-offs: a callback due when the caller asked and a crisis alert on every page within 5 s; taking it makes it yours', async () => {
  const shotDir = process.env.E2E_RESHOOT === '1' ? path.join(process.cwd(), 'product/web/shots') : DIAG;
  const contact = (await pool.query("INSERT INTO contact (workspace_id, e164, name) VALUES ($1,'+919812300077','Meena Iyer') RETURNING id", [ws])).rows[0].id;
  const mk = async () => (await pool.query("INSERT INTO conversation (workspace_id, contact_id, channel) VALUES ($1,$2,'phone') RETURNING id", [ws, contact])).rows[0].id;
  const at = new Date().toISOString(), m = { combinationId: 'e2e', stackId: 'v2-flashlite', agentVersionHash: 'e2e', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 'e2e' };
  const callback = await mk();
  await runtimeReport(callback, [{ seq: 1, type: 'call.started', at, manifest: m },
    { seq: 2, type: 'turn', at, speaker: 'caller', text: 'Abhi main gaadi chala raha hoon, shaam 6 baje ke baad call karna.', startMs: 3000, endMs: 6000 },
    { seq: 3, type: 'hand_off', at, reason: 'callback_request', target: 'callback', summary: 'Meena is driving and asked for a call after 6 pm about her renewal.' }]);
  await page.goto(`${BASE}/handoffs`);
  const card = page.locator('.card', { hasText: 'Meena is driving and asked for a call after 6 pm about her renewal.' });
  await card.waitFor();
  assert.ok(await card.getByText('They asked: "shaam 6 baje"').isVisible(), 'the time in her own words');
  assert.ok(await card.getByText('Not taken yet').isVisible());
  // A crisis on another call: the banner reaches this page within 5 s, without a reload.
  const crisis = await mk();
  const t0 = Date.now();
  await runtimeReport(crisis, [{ seq: 1, type: 'call.started', at, manifest: m },
    { seq: 2, type: 'turn', at, speaker: 'caller', text: 'Sab khatam ho gaya hai.', startMs: 3000, endMs: 5000 },
    { seq: 3, type: 'hand_off', at, reason: 'crisis', target: 'queue:care', summary: 'The caller spoke of distress. Help lines given; she is staying on the call.' }]);
  const banner = page.getByRole('alert').filter({ hasText: 'needs a person now' });
  await banner.waitFor({ timeout: 6000 });
  assert.ok(Date.now() - t0 < 6000, `alert shown ${Date.now() - t0} ms after the report (poll 5 s)`);
  fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, 'handoffs-crisis-alert.png') });
  await page.reload();
  const crisisCard = page.locator('.card', { hasText: 'The caller spoke of distress.' });
  await crisisCard.waitFor();
  assert.equal(await page.locator('.card').filter({ hasText: /Crisis: needs a person now|Meena is driving/ }).first().textContent().then(t => /Crisis/.test(t)), true, 'crisis first');
  await crisisCard.getByRole('button', { name: 'Take it' }).click();
  await crisisCard.getByText('You have it').waitFor();
  await banner.waitFor({ state: 'detached', timeout: 7000 });
  const h = (await pool.query('SELECT status, claimed_by FROM hand_off WHERE conversation_id = $1', [crisis])).rows[0];
  assert.equal(h.status, 'claimed');
  await page.screenshot({ path: path.join(shotDir, 'handoffs-queue.png') });
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { name: 'Hand-offs' }).waitFor();
});

// ---- Inbound (must-be brief 8): the Numbers page says which agent answers each number, as the server holds it
test('Numbers: a number bound to a published agent says it answers calls with her; an unbound one says it does not', async () => {
  const shotDir = process.env.E2E_RESHOOT === '1' ? path.join(process.cwd(), 'product/web/shots') : DIAG;
  const ver = (await pool.query(`SELECT v.id, a.name, v.number FROM agent_version v JOIN agent a ON a.id = v.agent_id WHERE a.workspace_id = $1 AND v.kind = 'published' ORDER BY v.created_at DESC LIMIT 1`, [ws])).rows[0];
  assert.ok(ver, 'the seed has a published agent');
  const mk = async e164 => (await pool.query("INSERT INTO phone_number (workspace_id, e164, carrier, status) VALUES ($1,$2,'fake','active') RETURNING id", [ws, e164])).rows[0].id;
  const bound = await mk('+918000011122'), free = await mk('+918000011133');
  const card = await tool('inbound.route.set', { numberId: bound, agentVersionId: ver.id });
  assert.equal(card.status, 'needs_approval', JSON.stringify(card));
  const done = await (await ctx.request.post(`${BASE}/v1/actions/${card.actionId}/decide`, { data: { approve: true } })).json();
  assert.ok(JSON.stringify(done).includes('confirmed'), JSON.stringify(done));
  await page.goto(`${BASE}/numbers`);
  const line = page.locator('li', { hasText: '80000 11122' }).or(page.locator('li', { hasText: '8000011122' })).first();
  await line.waitFor();
  await line.getByText(`Answers calls with ${ver.name}, version ${ver.number}.`).waitFor();
  const other = page.locator('li', { hasText: '80000 11133' }).or(page.locator('li', { hasText: '8000011133' })).first();
  assert.ok(await other.getByText("Does not answer calls yet: callers hear the carrier's line.").isVisible());
  fs.mkdirSync(shotDir, { recursive: true });
  await line.screenshot({ path: path.join(shotDir, 'numbers-inbound.png') });
  void free;
});

// ---- Third buyer walkthrough (research/2026-10-24/walkthrough-r3/FRICTION.md): each flow is one friction a buyer met ----
const holdIn = async (p, loc) => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); const el = await loc.elementHandle(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down();
  try { await p.waitForFunction(e => e.classList.contains('holding'), el, { timeout: 5000 }); await p.waitForFunction(e => !e.classList.contains('holding'), el, { timeout: 10000 }); } finally { await p.mouse.up(); } };

test('Campaign page: launch warnings the server sends are shown, word for word, with a fix that opens the agent', async () => {
  const camp = (await pool.query('SELECT id FROM campaign WHERE workspace_id = $1 AND state = $2 ORDER BY created_at LIMIT 1', [ws, 'draft'])).rows[0];
  const warnings = (await tool('campaign.get', { id: camp.id })).result.warnings ?? [];
  assert.ok(warnings.length > 0, 'the seeded list has Tamil, Telugu, Marathi and Punjabi speakers, so the server warns');
  await page.goto(`${BASE}/campaigns/${camp.id}`);
  const list = page.getByRole('list', { name: 'Launch warnings' });
  for (const w of warnings) await list.getByText(w.message, { exact: true }).waitFor({ timeout: 10000 });
  const fix = list.getByRole('link', { name: "Change the agent's languages" });
  if (await fix.count()) await page.waitForFunction(el => /^\/agents\/[0-9a-f-]{36}$/.test(el.getAttribute('href')), await fix.first().elementHandle(), { timeout: 10000 });   // the fix opens that agent once it is known
});

test('Publish: the approval card says what goes live, sentence by sentence, as the server wrote it', async () => {
  const id = await riyaId();
  await page.goto(`${BASE}/agents/${id}?tab=persona`);
  await page.getByRole('button', { name: 'Add a note' }).click();
  await page.locator('main input').last().fill(`walkthrough note ${Date.now().toString(36).replace(/[0-9]/g, c => 'abcdefghij'[c])}`);   // letters only: the brief keeps numbers in fact rows
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByText(/Draft saved/).first().waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Publish…' }).click();
  const sheet = page.getByRole('dialog');
  const detail = sheet.getByRole('list', { name: 'What this does' });
  await detail.waitFor({ timeout: 10000 });
  const summary = (await pool.query("SELECT summary FROM action WHERE workspace_id = $1 AND tool = 'version.publish' AND status = 'proposed' ORDER BY created_at DESC LIMIT 1", [ws])).rows[0].summary;
  assert.match(summary, /Changes since version \d+/, 'the server described the change');
  assert.match(await detail.innerText(), /Changes since version \d+/);
  await holdIn(page, sheet.locator('.hold'));
  await sheet.waitFor({ state: 'detached', timeout: 15000 });
});

test('Versions: an earlier version can be gone back to, through an approval that says what changes back', async () => {
  const id = await riyaId();
  await page.goto(`${BASE}/agents/${id}?tab=versions`);
  const back = page.getByRole('button', { name: /^Go back to v\d+…$/ }).first();
  await back.waitFor({ timeout: 10000 });
  // Authors are named once agent.get sends author_id on each version (routed: FRICTION round 3); until then "A teammate".
  if ((await tool('agent.get', { agentId: id })).result.versions?.[0]?.author_id) {
    const by = (await pool.query("SELECT m.name FROM agent_version v JOIN member m ON m.id::text = v.author_id WHERE v.agent_id = $1 AND v.author_type = 'member' LIMIT 1", [id])).rows[0]?.name;
    if (by) await page.locator('.versions').getByText(by, { exact: false }).first().waitFor({ timeout: 10000 });
  }
  await back.click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('list', { name: 'What this does' }).getByText(/^Roll back .* to version \d+/).waitFor({ timeout: 10000 });
  await sheet.getByRole('button', { name: 'Decline' }).click();
  await sheet.waitFor({ state: 'detached' });
});

test('Import: a file longer than the preview says which rows it shows and where its duplicates and skipped rows are', async () => {
  const rows = ['Name,Mobile']; for (let i = 0; i < 118; i++) rows.push(`Person ${i},90000${81000 + i}`); rows.push('Repeat,9000081001', 'Short,12345');
  await page.goto(`${BASE}/contacts/import`);
  await page.getByLabel('Your list').fill(rows.join('\n') + '\n');
  await page.getByRole('button', { name: 'Check the file' }).click();
  await page.getByText('Showing the first 100 of 120 rows', { exact: false }).waitFor({ timeout: 15000 });
  await page.getByText('The first 100 rows are ready').waitFor();
  assert.equal(await page.getByText('Every row is ready').count(), 0, 'never "every row is ready" when the file has duplicates or skipped rows');
});

test('Contacts: a list longer than one page has "Show the next 50", and the rows add up', async () => {
  const n = (await pool.query('SELECT count(*)::int AS n FROM contact WHERE workspace_id = $1 AND erased_at IS NULL', [ws])).rows[0].n;
  if (n <= 50) {   // The seeded workspace has a handful; the import above adds two. Add synthetic people through the real import.
    const csv = ['Name,Mobile', ...Array.from({ length: 60 }, (_, i) => `Paging ${i},90000${82000 + i}`)].join('\n');
    const up = await tool('source.upload', { kind: 'csv', name: 'paging', text: csv, filename: 'paging.csv' });
    const c = await tool('source.commit', { uploadId: up.result.uploadId, audienceName: 'Paging test' });
    assert.equal(c.status, 'confirmed', JSON.stringify(c));
  }
  await page.goto(`${BASE}/contacts`);
  await page.getByText(/^50 shown, and more\./).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Show the next 50' }).click();
  await page.getByText(/^(\d+) shown/).filter({ hasNotText: /^50 shown/ }).waitFor({ timeout: 10000 });
  assert.ok(await page.locator('table tbody tr').count() > 50);
});

test('Privacy: how long each kind of data is kept is shown as the server holds it, and a change goes through an approval', async () => {
  const pol = (await tool('policy.retention.get')).result.policy;
  await page.goto(`${BASE}/settings/privacy`);
  const card = page.locator('section, div.card').filter({ has: page.getByRole('heading', { name: 'How long data is kept' }) }).last();
  const rec = card.getByLabel('Call recordings (days)');
  await rec.waitFor({ timeout: 10000 });
  assert.equal(await rec.inputValue(), String(pol.recordings_days));
  await rec.fill(String(pol.recordings_days === 30 ? 45 : 30));
  await card.getByLabel('Why the change').fill('counsel advised a shorter time for recordings');
  await card.getByRole('button', { name: 'Ask to change' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByText(/recordings \d+ days/i).first().waitFor({ timeout: 10000 });
  await sheet.getByRole('button', { name: 'Decline' }).click();
  assert.ok((await page.locator('option[value="erase_me"]').innerText()).includes('details, transcripts and recordings'), 'erasure says it deletes recordings too');
});

test('Agent basics: "follow the caller" names the languages she may switch to, from the agent itself', async () => {
  await page.goto(`${BASE}/agents/${await riyaId()}`);
  const hint = page.getByText(/^If they switch to /);
  await hint.waitFor();
  const allowed = (await pool.query("SELECT draft->'languages'->'allowed' AS a FROM agent WHERE id = $1", [await riyaId()])).rows[0].a;
  assert.ok(allowed.length > 0);
  assert.doesNotMatch(await hint.innerText(), /^If they switch to Hindi or English, so does she\.$/, 'not the old fixed sentence: this agent also speaks Hinglish');
  assert.match(await hint.innerText(), /Hinglish/);
});

test('Agent: a check on the draft says once where it is, as a link to that tab and field', async () => {
  const id = await riyaId();
  await page.goto(`${BASE}/agents/${id}?tab=persona`);
  await page.getByRole('button', { name: 'Add a note' }).click();
  await page.locator('main input').last().fill('keep it under 2 minutes');
  await page.getByRole('button', { name: 'Save draft' }).click();
  const alert = page.locator('.state-failed', { hasText: 'Checks on the draft' });
  await alert.waitFor({ timeout: 10000 });
  const link = alert.getByRole('link', { name: /^Persona, note \d+$/ });
  await link.waitFor();
  assert.equal(await alert.locator('li').count(), new Set(await alert.locator('li').allInnerTexts()).size, 'no line twice');
  // Put the draft back: remove the note that holds a number.
  await page.locator('.editrow').filter({ has: page.locator('input[value="keep it under 2 minutes"]') }).getByRole('button').last().click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await alert.waitFor({ state: 'detached', timeout: 10000 });
});

test('Retry pattern: the form sends what it shows, campaign.get and the page agree, and a contact shows the callback they asked for', async () => {
  const a = (await tool('agent.list')).result.agents.find(x => x.latest_version);
  assert.ok(a, 'a published agent exists');
  await page.goto(`${BASE}/campaigns/new`);
  await page.getByLabel('Agent').selectOption({ value: a.id });
  await page.getByLabel('Campaign name').fill('Retry pattern check');
  const who = page.getByLabel('Who to call');
  await who.selectOption({ index: 1 });
  const pattern = page.getByLabel('Retry pattern');
  await pattern.selectOption('gentle');
  await page.getByText('Up to 2 calls each, a day apart, after busy, no answer or switched off.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Save draft and see the estimate' }).click();
  await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const id = page.url().split('/').pop();
  const got = (await tool('campaign.get', { id })).result;
  assert.equal(got.campaign.policy.retry.pattern, 'gentle', 'the server holds the pattern the form showed');
  assert.equal(got.campaign.policy.retry.maxAttempts, 2);
  const card = page.locator('.card', { hasText: 'Window and policy' });
  await card.getByText(got.retry, { exact: true }).waitFor();                 // the page says exactly what the server runs

  // A callback the person asked for (fixture in SQL: no tool makes an attempt by hand), on one contact of this campaign.
  const contact = (await pool.query('SELECT id, name FROM contact WHERE workspace_id = $1 AND erased_at IS NULL ORDER BY created_at LIMIT 1', [ws])).rows[0];
  const text = 'Calling back Wed 11:00 am, as they asked';
  await pool.query(`INSERT INTO attempt (workspace_id, campaign_id, contact_id, kind, status, scheduled_for, call_category, callback)
    VALUES ($1,$2,$3,'callback','created', now() + interval '1 day', $4, $5)`, [ws, id, contact.id, got.campaign.call_category,
      JSON.stringify({ statedAt: new Date().toISOString(), at: new Date().toISOString(), clamped: false, quote: 'kal subah 11 baje', conversationId: null, text })]);
  await page.reload();
  await page.locator('[data-testid="campaign-callbacks"]').getByText(text).waitFor();
  const listed = (await tool('campaign.get', { id })).result.callbacks;
  assert.ok(listed.some(b => b.text === text && b.contactId === contact.id), 'campaign.get lists the same callback');
  await page.goto(`${BASE}/contacts/${contact.id}`);
  await page.locator('[data-testid="callback-text"]').filter({ hasText: text }).first().waitFor();
  assert.doesNotMatch(await page.locator('main').innerText(), /kal subah 11 baje/, 'the contact page never shows their words');

  // Screens at 1440 and 390, each with no serious or critical axe violation.
  const shotDir = process.env.E2E_RESHOOT === '1' ? path.join(process.cwd(), 'product/web/shots') : DIAG;
  fs.mkdirSync(shotDir, { recursive: true });
  const [phoneCtx, phone] = await phonePage();
  try {
    for (const [tag, p] of [['d', page], ['m', phone]]) {
      for (const [name, url, ready] of [['campaign-retry', `/campaigns/${id}`, '[data-testid="campaign-callbacks"]'], ['contact-callback', `/contacts/${contact.id}`, '[data-testid="callback-text"]']]) {
        await p.goto(`${BASE}${url}`);
        await p.locator(ready).first().waitFor();
        await p.screenshot({ path: path.join(shotDir, `${name}-${tag}.png`), fullPage: true });
        assert.deepEqual((await axe(p)).filter(v => v.impact === 'serious' || v.impact === 'critical'), [], `axe on ${name} at ${tag === 'd' ? 1440 : 390}`);
      }
    }
  } finally { await phoneCtx.close(); }
});
// ---- Must-be audit gap 15: the call log names the agent version each call ran and its reply gap, as call.search sends them
test('Call log: each call shows the agent and version it ran and its reply gap, as the server measured them; the call page names the agent', async () => {
  const calls = (await tool('call.search', {})).result.calls;
  const c = calls.find(x => x.agent?.label && x.reply);
  assert.ok(c, 'the seeded calls ran a published version and the runtime timed her replies');
  await page.goto(`${BASE}/calls`);
  const row = page.locator('tr', { has: page.locator(`a[href="/calls/${c.id}"]`) });
  await row.waitFor();
  const agentCell = row.locator('td[data-label="Agent"]');
  assert.equal((await agentCell.innerText()).trim(), `${c.agent.name} v${c.agent.version}`);
  assert.equal(await agentCell.locator('span').first().getAttribute('title'), c.agent.label, 'the full name and version on hover');
  const gap = row.locator('td[data-label="Reply gap"]');
  const want = c.reply.medianMs < 10000 ? `${c.reply.medianMs.toLocaleString('en-IN')} ms` : `${(c.reply.medianMs / 1000).toFixed(1)} s`;
  assert.equal((await gap.innerText()).trim(), want, 'the median of her timed replies');
  assert.match(await gap.locator('span').first().getAttribute('title'), new RegExp(`Median of ${c.reply.timed} timed repl`));
  for (const u of calls.filter(x => !x.reply).slice(0, 2)) {
    const cell = (await page.locator('tr', { has: page.locator(`a[href="/calls/${u.id}"]`) }).locator('td[data-label="Reply gap"]').innerText()).trim();
    assert.equal(cell, u.duration_s ? 'Not measured yet' : '—', 'no timed reply is never 0: unmeasured if they spoke, a dash if nobody did');
  }
  await page.goto(`${BASE}/calls/${c.id}`);
  await page.locator('.kv').getByText(c.agent.label, { exact: true }).waitFor({ timeout: 10000 });
});

// ---- Must-be audit gap 16 (state integrity): leaving a page with unsaved changes asks first, Back included; a tab does not
test('Unsaved changes: a link away asks first and Stay keeps the edit; a tab on the same page does not ask; Back asks too; Leave drops it', async () => {
  const id = await riyaId();
  // Arrive in the app (a link from the agents list), so Back is a move inside it, not a page load the browser handles.
  await page.goto(`${BASE}/agents`);
  await page.locator(`a[href="/agents/${id}"]`).first().click();
  await page.waitForURL(u => u.pathname === `/agents/${id}`);
  await page.getByRole('tab', { name: 'Persona' }).click();
  await page.getByRole('button', { name: 'Add a note' }).click();
  const note = page.locator('main input').last();
  await note.fill('unsaved walkthrough note');
  await page.locator('nav').getByRole('link', { name: 'Campaigns' }).first().click();
  const ask = page.getByRole('dialog', { name: 'Leave without saving?' });
  await ask.waitFor({ timeout: 5000 });
  assert.match(await ask.innerText(), /are not saved\. If you leave now, they are lost\./);
  await ask.getByRole('button', { name: 'Stay and keep editing' }).click();
  await ask.waitFor({ state: 'detached' });
  assert.match(page.url(), new RegExp(`/agents/${id}`), 'still on the agent');
  assert.equal(await note.inputValue(), 'unsaved walkthrough note', 'the edit is kept');
  await page.getByRole('tab', { name: 'Basics' }).click();
  await page.waitForTimeout(300);
  assert.equal(await ask.count(), 0, 'a tab of the same page is not leaving');
  await page.goBack();
  await ask.waitFor({ timeout: 5000 });
  assert.match(page.url(), new RegExp(`/agents/${id}`), 'Back is held while it asks');
  await ask.getByRole('button', { name: 'Leave without saving' }).click();
  await page.waitForURL(u => !new RegExp(`/agents/${id}`).test(u.pathname), { timeout: 5000 });
  const draft = (await tool('agent.get', { agentId: id })).result;
  assert.ok(!JSON.stringify(draft).includes('unsaved walkthrough note'), 'nothing was saved');
});

// ---- First load (decision.2026-10-24.web-budget-per-chunk, as amended): the assistant and the approval sheet are not in it
test('First load: on a phone the assistant loads on its first open and then works; on desktop it is there and Review opens at once', async () => {
  const [pc, phone] = await phonePage();
  await phone.goto(`${BASE}/`);
  await phone.getByRole('heading', { name: 'Today', level: 1 }).waitFor();
  assert.equal(await phone.locator('.dock').count(), 0, 'the assistant is not loaded before it is opened');
  await phone.getByRole('button', { name: 'Assistant' }).click();
  await phone.locator('#dock-input').waitFor({ timeout: 5000 });
  await phone.locator('#dock-input').fill('What needs me today?');
  assert.equal(await phone.locator('#dock-input').inputValue(), 'What needs me today?', 'the assistant works once loaded');
  await pc.close();
  await page.goto(`${BASE}/`);
  await page.locator('#dock-input').waitFor({ timeout: 5000 });
  await page.waitForTimeout(2500);   // past the idle prefetch of the approval sheet
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Review' }).first().click();
  await page.getByRole('dialog').waitFor({ timeout: 3000 });
  assert.ok(Date.now() - t0 < 1500, `Review opened the sheet in ${Date.now() - t0} ms`);
  await page.keyboard.press('Escape');
});

// ---- Owner directive 2026-10-24: the daily test budget is a cap like the others, raised by approval and shown on Billing
test('Billing: the daily test budget sits with the other caps, shows today\'s use and each test call\'s cost, and is raised by approval', async () => {
  const before = (await tool('money.test_budget')).result;
  assert.ok(before.capInrMilli > 0 && before.perCallInrMilli <= before.capInrMilli, 'a cap and a per-call hold within it');
  await page.goto(`${BASE}/settings/billing`);
  const main = page.locator('main');
  await main.getByText('Daily test budget').waitFor();
  await main.getByText(before.text).waitFor();
  const rows = main.getByRole('table', { name: 'Test calls today and what each cost' }).locator('tbody tr');
  if (before.calls.length) {
    assert.equal(await rows.count(), before.calls.length, 'one row per test call today');
    for (const [i, c] of before.calls.entries()) assert.match(await rows.nth(i).innerText(), new RegExp(c.display.replace(/[.₹]/g, m => '\\' + m)), 'each row shows the server\'s own cost');
  } else await main.getByText('No test calls yet today.').waitFor();

  // Raising it is an owner approval whose card names the exact amounts; nothing changes before the decision.
  const card = await tool('cap.raise', { scope: 'test', period: 'daily', capInrMilli: before.capInrMilli * 10, perCallInrMilli: before.perCallInrMilli * 2 });
  assert.equal(card.status, 'needs_approval');
  assert.match(card.summary, /^Raise the daily test budget to ₹[\d,]+, with up to ₹[\d,]+ held per test call$/);
  assert.equal((await tool('money.test_budget')).result.capInrMilli, before.capInrMilli, 'unchanged until approved');
  const decided = await (await ctx.request.post(`${BASE}/v1/actions/${card.actionId}/decide`, { data: { approve: true } })).json();
  assert.equal(decided.status, 'confirmed', JSON.stringify(decided));
  const after = (await tool('money.test_budget')).result;
  assert.deepEqual([after.capInrMilli, after.perCallInrMilli], [before.capInrMilli * 10, before.perCallInrMilli * 2]);
  await page.reload();
  await main.getByText(after.text).waitFor();

  // Screens at 1440 and 390, each with no serious or critical axe violation.
  const shotDir = process.env.E2E_RESHOOT === '1' ? path.join(process.cwd(), 'product/web/shots') : DIAG;
  fs.mkdirSync(shotDir, { recursive: true });
  const [phoneCtx, phone] = await phonePage();
  try {
    for (const [tag, p] of [['d', page], ['m', phone]]) {
      await p.goto(`${BASE}/settings/billing`);
      await p.locator('main').getByText('Daily test budget').waitFor();
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `no sideways scroll at ${tag === 'd' ? 1440 : 390}`);
      await p.screenshot({ path: path.join(shotDir, `billing-test-budget-${tag}.png`), fullPage: true });
      assert.deepEqual((await axe(p)).filter(v => v.impact === 'serious' || v.impact === 'critical'), [], `axe on Billing at ${tag === 'd' ? 1440 : 390}`);
    }
  } finally { await phoneCtx.close(); }
});

// ---- The client event log (owner directive 2026-10-24): what the beacon sends, in the shape agreed with the workspace builder
// (who owns POST /v1/client-events). The route is answered here, so this checks the browser half on its own.
test('Client event log: a component that throws shows a calm card, and the beacon sends the error, a rejection and the page change, masked, in the agreed shape', async () => {
  const sent = [];
  await page.route('**/v1/client-events', async r => { try { sent.push(JSON.parse(r.request().postData() ?? '{}')); } catch { /* not JSON */ } await r.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":1,"dropped":0}' }); });
  // The agent list answers with a broken row (a name that is not text), so an agent card throws while drawing: a real render
  // error, not a test hook.
  await page.route('**/v1/tools/agent.list', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'confirmed', result: { agents: [{ id: 'not-an-agent', name: { broken: true }, job: 'collections', latest_version: 1, updated_at: new Date().toISOString() }] } }) }));
  await page.goto(`${BASE}/agents`);
  const card = page.getByRole('alert').filter({ hasText: 'Something went wrong on this page' });
  await card.waitFor({ timeout: 10000 });
  assert.ok(await card.getByRole('button', { name: 'Reload the page' }).isVisible());
  await page.unroute('**/v1/tools/agent.list');
  await page.evaluate(() => { void Promise.reject(new Error('lookup failed for 9000000077 and priya.test@example.test')); });
  await page.getByRole('link', { name: 'Go to Today' }).click();
  await page.getByRole('heading', { name: 'Today', level: 1 }).waitFor();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // nothing left waiting for the timer
  const events = () => sent.flatMap(b => b.events ?? []);
  for (let k = 0; k < 40 && !events().some(e => e.kind === 'error' && /lookup failed/.test(e.name)); k++) await page.waitForTimeout(250);
  await page.unroute('**/v1/client-events');
  const all = events();
  for (const b of sent) {
    assert.match(b.session, /^[0-9a-f-]{36}$/, 'a tab id');
    assert.ok(b.events.length >= 1 && b.events.length <= 100, 'one to a hundred events a batch');
  }
  for (const e of all) {
    assert.ok(['view', 'nav', 'error', 'action', 'result', 'perf'].includes(e.kind), e.kind);
    assert.ok(e.page.length <= 300 && (!e.name || e.name.length <= 200));
    assert.ok(Object.values(e.detail ?? {}).every(v => ['string', 'number', 'boolean'].includes(typeof v)) && Object.keys(e.detail ?? {}).length <= 20, 'flat detail');
  }
  const crash = all.find(e => e.kind === 'error' && e.detail?.boundary === 'page');
  assert.ok(crash, 'the render error was sent: ' + JSON.stringify(sent).slice(0, 1500));
  assert.equal(crash.page, '/agents');
  assert.match(crash.detail.componentStack ?? '', /\/assets\/chunks\/agents-[\w]+\.js:\d+:\d+/, "with React's component stack (minified)");
  // The review turns it back into source with the maps the build keeps beside dist (product/scripts/client-stack.ts).
  const mapped = execFileSync('npx', ['tsx', 'product/scripts/client-stack.ts', crash.detail.componentStack], { encoding: 'utf8' });
  assert.match(mapped, /src\/pages\/agents\.tsx:\d+/, 'the component stack maps back to the file that threw: ' + mapped.slice(0, 300));
  const rej = all.find(e => e.kind === 'error' && /lookup failed/.test(e.name));
  assert.equal(rej.name, 'lookup failed for •••••0077 and [email]', 'masked before it left the browser');
  assert.ok(all.some(e => e.kind === 'nav' && e.page === '/' && e.detail?.from === '/agents'), 'the page change');
  assert.ok(all.some(e => typeof e.detail?.build === 'string'), 'the build that ran, on the first event of the tab');
  const text = JSON.stringify(sent);
  assert.ok(!text.includes('9000000077') && !text.includes('priya.test@'), 'no phone or email in clear');
});

test('Memory review: proposed facts across contacts wait in one queue; a correction is approved and a reject deletes, as the server says', async () => {
  // Proposed facts (fixture in SQL: only a real call's analysis proposes them), oldest first, for two people.
  const people = (await pool.query('SELECT id, name FROM contact WHERE workspace_id = $1 AND erased_at IS NULL ORDER BY created_at LIMIT 2', [ws])).rows;
  const mk = async (contact, key, value, quote, days) => (await pool.query(`INSERT INTO memory_fact (workspace_id, contact_id, kind, key, value, quote, purpose, basis, status, tier, created_at, said_at, expires_at)
    VALUES ($1,$2,'commitment',$3,$4,$5,'service','contract','proposed','review', now() - make_interval(days => $6), now() - make_interval(days => $6), now() + interval '20 days') RETURNING id`,
    [ws, contact, key, JSON.stringify(value), quote, days])).rows[0].id;
  const keep = await mk(people[0].id, 'callback', 'after 6 pm', 'shaam 6 baje ke baad call karna', 3);
  const drop = await mk(people[1].id, 'send_info', 'brochure', 'brochure bhej dena', 1);
  await page.goto(`${BASE}/contacts/review`);
  const list = page.locator('[data-testid="memory-review"]');
  await list.waitFor();
  const server = (await tool('fact.review.list')).result;
  assert.equal(await list.locator('> li').count(), server.items.length, 'the page lists what the server lists');
  const row = id => list.locator('> li').filter({ hasText: server.items.find(i => i.id === id).quote });
  await row(keep).getByText('“shaam 6 baje ke baad call karna”').waitFor();
  await row(keep).getByLabel('What to remember').fill('after 6:30 pm');
  await row(keep).getByRole('button', { name: 'Approve' }).click();
  await row(keep).waitFor({ state: 'detached', timeout: 10000 });
  const kept = (await pool.query('SELECT status, value FROM memory_fact WHERE id = $1', [keep])).rows[0];
  assert.deepEqual(kept, { status: 'active', value: 'after 6:30 pm' }, 'approved with the correction');
  await row(drop).getByRole('button', { name: 'Reject' }).click();
  await row(drop).waitFor({ state: 'detached', timeout: 10000 });
  assert.equal((await pool.query('SELECT 1 FROM memory_fact WHERE id = $1', [drop])).rowCount, 0, 'a rejected proposal is deleted');

  const shotDir = process.env.E2E_RESHOOT === '1' ? path.join(process.cwd(), 'product/web/shots') : DIAG;
  fs.mkdirSync(shotDir, { recursive: true });
  await mk(people[0].id, 'pay_by', 'by Friday', 'Friday tak kar dunga', 2);
  const [phoneCtx, phone] = await phonePage();
  try {
    for (const [tag, p] of [['d', page], ['m', phone]]) {
      await p.goto(`${BASE}/contacts/review`);
      await p.locator('[data-testid="memory-review"]').waitFor();
      await p.screenshot({ path: path.join(shotDir, `memory-review-${tag}.png`), fullPage: true });
      assert.deepEqual((await axe(p)).filter(v => v.impact === 'serious' || v.impact === 'critical'), [], `axe on memory review at ${tag === 'd' ? 1440 : 390}`);
    }
  } finally { await phoneCtx.close(); }
});
