// Google Sheets as a live source, against a local fake shaped like the documented Sheets v4 and OAuth answers
// (research/2026-10-24/google-sheets/README.md). The service account key is generated here; no Google account or real key.
// Synthetic people only (numbers 90000…).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createVerify, generateKeyPairSync, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { createPool, one, many } from '../server/db.ts';
import { buildApp } from '../server/app.ts';
import type { Registry, Actor } from '../server/tools.ts';
import { module as intake } from '../server/modules/intake/index.ts';
import { module as workspace } from '../server/modules/workspace/index.ts';
import { seal } from '../server/modules/workspace/crypto.ts';
import { assertion, csvLinkAllowed, resetSheetsUrls, setSheetsUrls, spreadsheetId } from '../server/modules/intake/sheets.ts';
import { crmSyncJob } from '../server/modules/intake/crm-tools.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, reg: Registry, fake: Server, base = '';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const SA = { type: 'service_account', client_email: 'importer@synthetic-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'synthkey1', token_uri: 'https://oauth2.googleapis.com/token' };
const SHEET = '1SyntheticSpreadsheetId_abcdefghijk';
const log: { method: string; path: string }[] = [];
const sheet = { values: [] as string[][] };
const reset = () => { sheet.values = [['Name', 'Mobile', 'Loan', 'EMI due'], ['Neha Chauhan', '9000000501', 'L-501', '28/10/2026'], ['Gurdeep Singh', '+91 90000 00502', 'L-502'], [], ['Lata Menon', '9000000503', 'L-503', '30/10/2026']]; };

before(async () => {
  if (skip) return;
  process.env.VP_SECRET_KEY ??= randomBytes(32).toString('hex');
  pool = createPool(URL_);
  reg = buildApp(pool, [intake, workspace]).registry;
  fake = createServer((req, res) => {
    let raw = ''; req.on('data', c => (raw += c)); req.on('end', () => {
      const u = new URL(req.url ?? '/', 'http://x');
      log.push({ method: req.method ?? '', path: u.pathname });
      const json = (s: number, j: unknown) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (u.pathname === '/token') {
        const f = new URLSearchParams(raw), jwt = f.get('assertion') ?? '';
        const [h, c, sig] = jwt.split('.');
        const ok = f.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer' && createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig ?? '', 'base64url'));
        const head = JSON.parse(Buffer.from(h, 'base64url').toString()), claims = JSON.parse(Buffer.from(c, 'base64url').toString());
        const shaped = head.alg === 'RS256' && head.typ === 'JWT' && head.kid === 'synthkey1' && claims.iss === SA.client_email && claims.scope === 'https://www.googleapis.com/auth/spreadsheets.readonly'
          && claims.aud === 'https://oauth2.googleapis.com/token' && claims.exp - claims.iat === 3600;
        return ok && shaped ? json(200, { access_token: 'ya29.synthetic', expires_in: 3600, token_type: 'Bearer' }) : json(400, { error: 'invalid_grant' });
      }
      if (u.pathname.startsWith('/v4/')) {
        if (req.headers.authorization !== 'Bearer ya29.synthetic') return json(401, { error: { code: 401 } });
        if (u.pathname.includes('NotSharedSheet')) return json(403, { error: { code: 403, status: 'PERMISSION_DENIED' } });
        if (u.pathname === `/v4/spreadsheets/${SHEET}`) return json(200, { properties: { title: 'EMI book' }, sheets: [
          { properties: { sheetId: 0, title: 'Due this week', sheetType: 'GRID', gridProperties: { rowCount: 5 } } },
          { properties: { sheetId: 7, title: 'Chart', sheetType: 'OBJECT' } } ] });
        if (decodeURIComponent(u.pathname) === `/v4/spreadsheets/${SHEET}/values/'Due this week'`) {
          assert.equal(u.searchParams.get('valueRenderOption'), 'FORMATTED_VALUE');
          return json(200, { range: "'Due this week'!A1:Z1000", majorDimension: 'ROWS', values: sheet.values });   // ragged: trailing empties omitted
        }
        return json(404, { error: { code: 404 } });
      }
      if (u.pathname === '/spreadsheets/d/e/2PACX-synthetic/pub') { res.writeHead(307, { location: `${base}/pub-content/synthetic.csv` }); return res.end(); }
      if (u.pathname === '/pub-content/synthetic.csv') { res.writeHead(200, { 'content-type': 'text/csv' }); return res.end('Name,Mobile,Order\nHetal Shah,9000000511,A2001\nKavya Gowda,9000000512,A2002\n'); }
      if (u.pathname === '/spreadsheets/d/e/2PACX-html/pubhtml') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html></html>'); }
      json(404, {});
    });
  });
  await new Promise<void>(r => fake.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  setSheetsUrls({ token: `${base}/token`, sheets: base, docs: base });
});
after(async () => { resetSheetsUrls(); fake?.close(); await pool?.end(); });

async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('sheets test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role, status) VALUES ($1,$2,'owner','active') RETURNING id", [ws, `s${Math.random()}@example.test`]))!.id;
  const actor: Actor = { type: 'member', id: owner, role: 'owner' };
  const call = (name: string, args: unknown) => reg.execute<any>(pool, name, args, { workspaceId: ws, actor });
  const ok = async (name: string, args: unknown) => { const r = await call(name, args); assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`); return (r as any).result; };
  const google = async () => (await one<{ id: string }>(pool, `INSERT INTO integration (workspace_id, kind, name, status, secret_ciphertext, secret_keys) VALUES ($1,'google_workspace','Google (synthetic)','connected',$2,'{service_account_json}') RETURNING id`,
    [ws, seal(ws, 'integration', JSON.stringify({ service_account_json: JSON.stringify(SA) }))]))!.id;
  const people = () => many<{ e164: string; name: string }>(pool, 'SELECT e164, name FROM contact WHERE workspace_id = $1 ORDER BY e164', [ws]);
  return { ws, call, ok, google, people };
}

test('Sheets: the JWT is RS256 with the documented claims; a sheet address or id is read; only docs.google.com CSV links are taken', () => {
  const [h, c] = assertion(SA, Date.UTC(2026, 9, 24)).split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'RS256', typ: 'JWT', kid: 'synthkey1' });
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.deepEqual([claims.iss, claims.scope, claims.aud, claims.exp - claims.iat], [SA.client_email, 'https://www.googleapis.com/auth/spreadsheets.readonly', 'https://oauth2.googleapis.com/token', 3600]);
  assert.equal(spreadsheetId(`https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=0`), SHEET);
  assert.equal(spreadsheetId(SHEET), SHEET);
  assert.throws(() => spreadsheetId('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?output=csv'), /address/);
  resetSheetsUrls();
  try {
    assert.ok(csvLinkAllowed('https://docs.google.com/spreadsheets/d/e/2PACX-1vSynthetic/pub?gid=0&single=true&output=csv'));
    assert.ok(csvLinkAllowed(`https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=0`));
    for (const bad of ['http://docs.google.com/spreadsheets/d/e/x/pub?output=csv', 'https://docs.google.com.evil.example/spreadsheets/d/e/x/pub?output=csv', 'https://evil.example/spreadsheets/d/e/x/pub?output=csv',
      'https://docs.google.com/spreadsheets/d/e/x/pubhtml', 'https://docs.google.com/document/d/x/export?format=csv', 'https://user:pw@docs.google.com/spreadsheets/d/e/x/pub?output=csv'])
      assert.ok(!csvLinkAllowed(bad), bad);
  } finally { setSheetsUrls({ token: `${base}/token`, sheets: base, docs: base }); }
});

test('Sheets through a service account: tabs (charts left out), a tab read as the sheet shows it, checked and saved like a file; a sync after an edit updates; an unshared sheet names the address to share with; read only', { skip }, async () => {
  reset(); log.length = 0;
  const w = await world();
  const id = await w.google();
  const tabs = await w.ok('source.sheet.tabs', { integrationId: id, spreadsheet: `https://docs.google.com/spreadsheets/d/${SHEET}/edit` });
  assert.deepEqual(tabs, { spreadsheetId: SHEET, title: 'EMI book', tabs: [{ id: '0', name: 'Due this week', size: 4 }] });
  const pull = await w.ok('source.sheet.pull', { integrationId: id, spreadsheet: SHEET, tab: 'Due this week' });
  assert.equal(pull.records, 3, 'the blank row is not a person');
  const map = await w.ok('source.map', { uploadId: pull.uploadId });
  assert.equal(map.columns.find((c: any) => c.header === 'Mobile').field, 'phone');
  const r = await w.ok('source.commit', { uploadId: pull.uploadId });
  assert.equal(r.counts.new, 3);
  assert.deepEqual((await w.people()).map(p => p.name), ['Neha Chauhan', 'Gurdeep Singh', 'Lata Menon']);
  // Edited in the sheet: a sync re-reads it with the same mapping.
  sheet.values[1][3] = '04/11/2026';
  const s = await w.ok('source.sync', { sourceId: pull.sourceId });
  assert.equal(s.counts.updated, 1);
  assert.equal(s.counts.unchanged, 2);
  // A timer, through the same job as CRM lists.
  await w.ok('source.sync.schedule', { sourceId: pull.sourceId, everyHours: 24 });
  sheet.values.push(['Rohan Das', '9000000504', 'L-504', '01/11/2026']);
  await pool.query("UPDATE intake_source SET last_synced_at = now() - interval '25 hours' WHERE id = $1", [pull.sourceId]);
  await crmSyncJob.run({ pool } as never);
  assert.equal((await w.people()).length, 4, 'the timed sync picked up the new row');
  const listed = await w.ok('source.crm.sources', { kind: 'google_sheets' });
  assert.deepEqual(listed.sources.map((x: any) => [x.listName, x.everyHours]), [['EMI book: Due this week', 24]]);
  // Not shared with the service account: the plain fix.
  const no = await w.call('source.sheet.tabs', { integrationId: id, spreadsheet: '1NotSharedSheet_abcdefghijklmn' });
  assert.match((no as any).reason, /not shared with importer@synthetic-project\.iam\.gserviceaccount\.com; share it with that address as a Viewer/);
  assert.match((await w.call('source.sheet.pull', { integrationId: id, spreadsheet: SHEET, tab: 'Nope' }) as any).reason, /no tab "Nope" in "EMI book" \(tabs: Due this week\)/);
  assert.ok(log.every(h => h.method === 'GET' || h.path === '/token'), 'read only: GETs and the token exchange');
});

test('Sheets from a published CSV link: the redirect is followed within Google, saved like a file; a page that is not CSV or another host is refused', { skip }, async () => {
  log.length = 0;
  const w = await world();
  const pull = await w.ok('source.sheet.pull', { csvUrl: `${base}/spreadsheets/d/e/2PACX-synthetic/pub?gid=0&single=true&output=csv` });
  assert.equal(pull.records, 2);
  await w.ok('source.commit', { uploadId: pull.uploadId });
  assert.deepEqual((await w.people()).map(p => p.e164), ['+919000000511', '+919000000512']);
  assert.match((await w.call('source.sheet.pull', { csvUrl: `${base}/spreadsheets/d/e/2PACX-html/pubhtml?x=1` }) as any).reason, /opens a page, not a CSV/);
  assert.match((await w.call('source.sheet.pull', { csvUrl: 'https://example.com/spreadsheets/d/e/x/pub?output=csv' }) as any).reason, /Publish to the web/);
  assert.match((await w.call('source.sheet.pull', {}) as any).reason, /give either a published CSV link/);
  // A Slack integration is not a Google service account.
  const slack = (await one<{ id: string }>(pool, "INSERT INTO integration (workspace_id, kind, name, status) VALUES ($1,'slack','Team chat','connected') RETURNING id", [w.ws]))!.id;
  assert.match((await w.call('source.sheet.tabs', { integrationId: slack, spreadsheet: SHEET }) as any).reason, /is not a Google service account/);
});
