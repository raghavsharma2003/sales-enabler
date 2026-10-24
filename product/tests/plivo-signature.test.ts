// X-Plivo-Signature-V3 (campaigns/plivo-signature.ts): the verifier reproduces every vector made by a transcription of
// Plivo's own SDK (tests/fixtures/plivo-v3-vectors.json), refuses a changed parameter, URL, nonce or token, accepts any of
// several comma-separated signatures and the main account's Ma-V3; on the control plane's carrier route it checks the
// PUBLIC URL Plivo was given (behind a proxy), refuses an unsigned or replayed request, and fails closed when the
// server has no carrier token. Synthetic tokens and 90000000xx numbers only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool } from '../server/db.ts';
import { module as campaigns } from '../server/modules/campaigns/index.ts';
import { plivoBase, plivoSign, plivoValid } from '../server/modules/campaigns/plivo-signature.ts';
import { queueAnnouncement, SPEAK_PATH } from '../server/modules/campaigns/telephony.ts';
import { plivoHeaders } from './fixtures/plivo-sign.ts';

const V = JSON.parse(readFileSync(new URL('./fixtures/plivo-v3-vectors.json', import.meta.url), 'utf8')) as
  { token: string; vectors: { method: string; url: string; nonce: string; params: Record<string, string | string[]>; base: string; signature: string }[] };
const asMap = (p: Record<string, string | string[]>) => new Map(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]));

test('every SDK vector: the same string to sign and the same signature', () => {
  assert.ok(V.vectors.length >= 6);
  for (const v of V.vectors) {
    assert.equal(plivoBase(v.method, v.url, asMap(v.params)), v.base, v.url);
    assert.equal(plivoSign(V.token, v.base, v.nonce), v.signature, v.url);
    assert.ok(plivoValid({ method: v.method, url: v.url, body: asMap(v.params), nonce: v.nonce, header: v.signature, tokens: [V.token] }));
  }
});

test('anything changed fails; several signatures and a second token are honoured', () => {
  const v = V.vectors[1];
  const ok = (o: Partial<{ url: string; nonce: string; header: string; tokens: string[]; body: Map<string, string[]> }>) =>
    plivoValid({ method: v.method, url: v.url, body: asMap(v.params), nonce: v.nonce, header: v.signature, tokens: [V.token], ...o });
  assert.equal(ok({}), true);
  assert.equal(ok({ body: asMap({ ...v.params, BillDuration: '0' }) }), false, 'a changed parameter');
  assert.equal(ok({ body: asMap({ ...v.params, Extra: '1' }) }), false, 'an added parameter');
  assert.equal(ok({ url: v.url.replace('vyakti.example.test', 'evil.example.test') }), false, 'another host');
  assert.equal(ok({ nonce: 'other' }), false, 'another nonce');
  assert.equal(ok({ tokens: ['not-the-token'] }), false, 'another token');
  assert.equal(ok({ header: `bogus,${v.signature}` }), true, 'one of several (token rotation)');
  assert.equal(ok({ header: '' }), false);
});

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
const KEYS = ['VP_PUBLIC_URL', 'PLIVO_AUTH_TOKEN', 'PLIVO_MAIN_AUTH_TOKEN'] as const;
const saved: Record<string, string | undefined> = {};
let pool: pg.Pool, close: () => Promise<void>, local = '';
const PUBLIC = 'https://staging.example.test:8443';

before(async () => {
  for (const k of KEYS) saved[k] = process.env[k];
  if (skip) return;
  pool = createPool(URL_);
  const { server } = buildApp(pool, [campaigns]);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>(r => server.close(() => r()));
});
after(async () => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  await close?.(); await pool?.end();
});

test('the speak route: signed for the public URL behind a proxy, once; unsigned, forged, replayed or unconfigured gets no XML', { skip }, async () => {
  process.env.VP_PUBLIC_URL = PUBLIC + '/';
  process.env.PLIVO_AUTH_TOKEN = 'sub-account-token-synthetic';
  process.env.PLIVO_MAIN_AUTH_TOKEN = 'main-account-token-synthetic';
  const path = SPEAK_PATH + queueAnnouncement(['Your code is 1 2 3.']);
  const form = { CallUUID: 'call-uuid-9', From: '+919000000001', To: '+919000000011', CallStatus: 'in-progress', Direction: 'outbound' };
  const send = (h: Record<string, string>, f = form) => fetch(local + path, { method: 'POST', headers: h, body: new URLSearchParams(f).toString() });

  const good = plivoHeaders('sub-account-token-synthetic', 'POST', PUBLIC + path, form);
  const r = await send(good);
  assert.equal(r.status, 200, await r.clone().text());
  assert.match(await r.text(), /<Speak[^>]*>Your code is 1 2 3\.<\/Speak>/);
  assert.equal((await send(good)).status, 401, 'the same nonce again: a replay');

  assert.equal((await send({ 'content-type': 'application/x-www-form-urlencoded' })).status, 401, 'unsigned');
  assert.equal((await send(plivoHeaders('wrong-token', 'POST', PUBLIC + path, form))).status, 401, 'forged');
  assert.equal((await send(plivoHeaders('sub-account-token-synthetic', 'POST', local + path, form))).status, 401, 'signed for the upstream address, not the public one');
  assert.equal((await send(plivoHeaders('sub-account-token-synthetic', 'POST', PUBLIC + path, form), { ...form, To: '+919000000012' })).status, 401, 'a parameter changed in transit');

  const ma = plivoHeaders('main-account-token-synthetic', 'POST', PUBLIC + path, form);
  const viaMain = await send({ 'content-type': ma['content-type'], 'x-plivo-signature-ma-v3': ma['x-plivo-signature-v3'], 'x-plivo-signature-v3-nonce': ma['x-plivo-signature-v3-nonce'] });
  assert.equal(viaMain.status, 200, 'the main account signature (Ma-V3) is accepted');

  delete process.env.PLIVO_AUTH_TOKEN;
  assert.equal((await send(plivoHeaders('sub-account-token-synthetic', 'POST', PUBLIC + path, form))).status, 503, 'no token: closed, never open');
});
