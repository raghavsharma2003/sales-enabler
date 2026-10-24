// Numbers, must-be audit brief 2 (2026-10-24): number.search states each series' KYC checklist, typical time and
// monthly price even with no carrier switched on, from carrier pages saved under research/2026-10-24/numbers-kyc/;
// and PlivoTelephony.systemCall rings through Plivo's Call API, tested against a fake Plivo on this machine only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createPool, one } from '../server/db.ts';
import { Registry } from '../server/tools.ts';
import { buildApp } from '../server/app.ts';
import { module as campaigns } from '../server/modules/campaigns/index.ts';
import { announcementXml, PlivoTelephony, SERIES_GUIDE, setTelephony, SPEAK_PATH, TelephonyDisabled } from '../server/modules/campaigns/telephony.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let reg: Registry;
before(async () => { if (skip) return; pool = createPool(URL_); reg = new Registry(); campaigns.register(reg); });
after(async () => { await pool?.end(); setTelephony(null); });

const SAVED = fileURLToPath(new URL('../../research/2026-10-24/numbers-kyc/', import.meta.url));

// ---------------------------------------------------------------- the guide

test('every series guide figure is sourced: a saved carrier page, or "not published"', () => {
  const sources = JSON.parse(readFileSync(SAVED + 'sources.json', 'utf8')) as { url: string; file: string; fetched: string }[];
  const saved = new Map(sources.map(s => [s.url, s]));
  for (const g of SERIES_GUIDE) {
    for (const u of g.source.urls) {
      const s = saved.get(u);
      assert.ok(s, `${g.series}: ${u} is not saved under research/2026-10-24/numbers-kyc/`);
      assert.ok(existsSync(SAVED + s!.file), `${g.series}: saved file ${s!.file} is missing`);
      assert.match(s!.fetched, /^2026-10-24T/);
    }
    const text = g.source.urls.map(u => readFileSync(SAVED + saved.get(u)!.file, 'utf8')).join('\n');
    if (g.monthlyPrice !== 'not published') assert.ok(text.includes('₹200.00/month'), `${g.series}: price ${g.monthlyPrice} is not on its page`);
    if (g.monthlyRentInrMilli !== null) assert.equal(g.monthlyPrice, `₹${g.monthlyRentInrMilli / 1000} a month`);
    const timeOnPage: Record<string, string> = { 'About 5 minutes for the automated review': 'typically within 5 minutes',
      'About 7 to 14 business days': '\\~7–14 business days', 'About 5 to 10 business days': '\\~5–10 business days' };
    if (g.typicalTime !== 'not published') assert.ok(text.includes(timeOnPage[g.typicalTime] ?? '\u0000'), `${g.series}: "${g.typicalTime}" is not on its page`);
  }
  assert.deepEqual(SERIES_GUIDE.map(g => g.series).sort(), ['140', '1600', '1601', 'mobile', 'ten_digit']);
});

test('number.search states the checklist, time and price per series even with telephony off', { skip }, async () => {
  setTelephony(new PlivoTelephony());            // the real adapter, switched off (no live switch in tests)
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('numbers kyc (synthetic)') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `n${Math.random()}@example.test`]))!.id;
  const as = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
  const all = await reg.execute<any>(pool, 'number.search', {}, as);
  assert.equal(all.status, 'confirmed', JSON.stringify(all));
  if (all.status !== 'confirmed') return;
  assert.deepEqual(all.result.offers, []);
  assert.equal(all.result.telephony.state, 'off');
  assert.equal(all.result.telephony.code, 'telephony_disabled');
  assert.match(all.result.telephony.message, /Phone lines are not switched on/);
  assert.equal(all.result.guide.length, SERIES_GUIDE.length);
  const one1600 = await reg.execute<any>(pool, 'number.search', { series: '1600' }, as);
  if (one1600.status !== 'confirmed') return assert.fail('expected a guide');
  const g = one1600.result.guide;
  assert.deepEqual(g.map((x: any) => x.series), ['1600']);
  assert.equal(g[0].typicalTime, 'About 7 to 14 business days');
  assert.equal(g[0].monthlyPrice, 'not published');
  assert.ok(g[0].checklist.some((c: string) => /licence/.test(c)));
  const land = await reg.execute<any>(pool, 'number.search', { series: 'ten_digit' }, as);
  assert.equal(land.status === 'confirmed' && land.result.guide[0].monthlyPrice, '₹200 a month');
});

// ---------------------------------------------------------------- system call

async function fakePlivo() {
  const seen: { method: string; url: string; auth: string; body: any }[] = [];
  const server: Server = createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    seen.push({ method: req.method!, url: req.url!, auth: String(req.headers.authorization), body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null });
    res.writeHead(201, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ api_id: 'fake-api', message: 'call fired', request_uuid: 'fake-req-0001' }));
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { base, seen, close: () => new Promise<void>(r => server.close(() => r())) };
}

test('systemCall: one POST to Plivo\'s Call API with the answer URL; the hook speaks the lines once fetched', async () => {
  const fake = await fakePlivo();
  try {
    const p = new PlivoTelephony({ apiBase: fake.base, authId: 'MAFAKEAUTHID', authToken: 'fake-token', publicBase: 'https://vyakti.example.test' });
    const r = await p.systemCall({ to: '+91 90000 00011', from: '+918012345678', lines: ['Your Vyakti code is 4 2 1 9 0 7.', 'Again: 4 2 1 9 0 7.'] });
    assert.equal(r.ref, 'fake-req-0001');
    assert.equal(fake.seen.length, 1);
    const call = fake.seen[0];
    assert.equal(call.method, 'POST');
    assert.equal(call.url, '/v1/Account/MAFAKEAUTHID/Call/');
    assert.equal(call.auth, 'Basic ' + Buffer.from('MAFAKEAUTHID:fake-token').toString('base64'));
    assert.equal(call.body.to, '919000000011');
    assert.equal(call.body.from, '918012345678');
    assert.equal(call.body.answer_method, 'POST');
    assert.ok(call.body.time_limit <= 120, 'a system announcement is short');
    assert.ok(call.body.answer_url.startsWith('https://vyakti.example.test' + SPEAK_PATH));
    const token = call.body.answer_url.slice(('https://vyakti.example.test' + SPEAK_PATH).length);
    const xml = announcementXml(token)!;
    assert.match(xml, /<Speak voice="WOMAN" language="en-IN">Your Vyakti code is 4 2 1 9 0 7\.<\/Speak>/);
    assert.match(xml, /<Hangup\/><\/Response>$/);
    assert.equal(announcementXml('not-a-token'), null);
    assert.equal(announcementXml(token, Date.now() + 16 * 60_000), null, 'expires after 15 minutes');
  } finally { await fake.close(); }
});

test('systemCall never reaches a real carrier in tests: the default adapter and any non-local API refuse', async () => {
  // test.mjs runs with NODE_ENV=test; either that or the absent live switch refuses a non-local carrier.
  await assert.rejects(new PlivoTelephony().systemCall({ to: '+919000000011', from: '+918012345678', lines: ['x'] }), TelephonyDisabled);
  await assert.rejects(new PlivoTelephony({ apiBase: 'https://api.plivo.com', authId: 'MAFAKE', authToken: 't', publicBase: 'https://x.example.test' })
    .systemCall({ to: '+919000000011', from: '+918012345678', lines: ['x'] }), TelephonyDisabled);
  const fake = await fakePlivo();
  try {
    await assert.rejects(new PlivoTelephony({ apiBase: fake.base, authId: 'MAFAKE', authToken: 't', publicBase: '' })
      .systemCall({ to: '+919000000011', from: '+918012345678', lines: ['x'] }), TelephonyDisabled, 'no public address: refuse before calling');
    assert.equal(fake.seen.length, 0);
  } finally { await fake.close(); }
});

test('the speak hook serves the XML over HTTP and 404s an unknown token', { skip }, async () => {
  const { server } = buildApp(pool, [campaigns]);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const fake = await fakePlivo();
    try {
      await new PlivoTelephony({ apiBase: fake.base, authId: 'MAFAKE', authToken: 't', publicBase: base }).systemCall({ to: '+919000000011', from: '+918012345678', lines: ['Hello & welcome'] });
      const answer = fake.seen[0].body.answer_url as string;
      const r = await fetch(answer, { method: 'POST', body: 'CallUUID=x', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
      assert.equal(r.status, 200);
      assert.match(r.headers.get('content-type') ?? '', /xml/);
      assert.match(await r.text(), /<Speak[^>]*>Hello &amp; welcome<\/Speak>/);
    } finally { await fake.close(); }
    assert.equal((await fetch(base + SPEAK_PATH + 'nope')).status, 404);
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
