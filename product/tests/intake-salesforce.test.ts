// Salesforce contact import (Contact and Lead list views), read only, against a local fake shaped like the documented REST
// answers (research/2026-10-24/crm-import/README.md): token refresh, list views, object and list-view describe, SOQL with
// nextRecordsUrl paging, Sforce-Limit-Info on every answer. No real API call and no real key; synthetic people only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { createPool, one, many } from '../server/db.ts';
import { buildApp } from '../server/app.ts';
import type { Registry, Actor } from '../server/tools.ts';
import { module as intake } from '../server/modules/intake/index.ts';
import { module as workspace } from '../server/modules/workspace/index.ts';
import { recordsToRows, resetCrmUrls, salesforceHostAllowed, setCrmUrls, splitListViewQuery } from '../server/modules/intake/crm.ts';
import { crmSyncJob } from '../server/modules/intake/crm-tools.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, reg: Registry;

// ---- the fake org --------------------------------------------------------------------------------

const SF = { client_id: 'sf-client', client_secret: 'sf-secret', refresh_token: 'sf-refresh' };
const V = '/services/data/v62.0';
const CONTACT_VIEW = '00B000000000001AAA', LEAD_VIEW = '00B000000000002AAA';
interface Hit { method: string; path: string; q: string | null; auth: string }
const log: Hit[] = [];
const sf = {
  orgUsed: 0, orgLimit: 15_000,
  pageSize: 2,                                       // small pages, so paging by nextRecordsUrl is exercised
  hidden: new Set<string>(),                         // fields the integration user may not read: absent from describe
  queryHidden: new Set<string>(),                    // hidden after the describe was read: the query fails with INVALID_FIELD
  contacts: [] as Record<string, unknown>[],
};
const FIELDS = ['Id', 'FirstName', 'LastName', 'MobilePhone', 'Phone', 'Email', 'DoNotCall', 'LastModifiedDate', 'MailingCity', 'Call_Consent__c'];
function sfReset() {
  Object.assign(sf, { orgUsed: 0, orgLimit: 15_000, pageSize: 2, hidden: new Set(), queryHidden: new Set() });
  const at = '2026-10-20T10:00:00.000+0000';
  sf.contacts = [
    { Id: '003000000000001AAA', FirstName: 'Kavita', LastName: 'Nair', MobilePhone: '+91 90000 60101', Phone: '022 2345 6789', Email: 'kavita@example.test', DoNotCall: false, LastModifiedDate: at, MailingCity: 'Pune', Call_Consent__c: 'yes' },
    { Id: '003000000000002AAA', FirstName: 'Arjun', LastName: 'Malhotra', MobilePhone: null, Phone: '09000060102', Email: null, DoNotCall: true, LastModifiedDate: at, MailingCity: 'Pune', Call_Consent__c: null },
    { Id: '003000000000003AAA', FirstName: 'Meera', LastName: 'Iyer', MobilePhone: '९०००० ६०१०३', Phone: null, Email: null, DoNotCall: false, LastModifiedDate: at, MailingCity: 'Pune', Call_Consent__c: null },
    { Id: '003000000000004AAA', FirstName: 'No', LastName: 'Number', MobilePhone: null, Phone: null, Email: 'none@example.test', DoNotCall: false, LastModifiedDate: at, MailingCity: 'Pune', Call_Consent__c: null },
    { Id: '003000000000005AAA', FirstName: 'Rohan', LastName: 'Das', MobilePhone: '9000060105', Phone: null, Email: null, DoNotCall: false, LastModifiedDate: at, MailingCity: 'Pune', Call_Consent__c: 'yes' },
    { Id: '003000000000006AAA', FirstName: 'Elsewhere', LastName: 'Person', MobilePhone: '9000060106', Phone: null, Email: null, DoNotCall: false, LastModifiedDate: at, MailingCity: 'Delhi', Call_Consent__c: null },
  ];
}
const leads = [{ Id: '00Q000000000001AAA', FirstName: 'Lata', LastName: 'Menon', MobilePhone: '9000060201', Phone: null, Email: null, DoNotCall: false, LastModifiedDate: '2026-10-21T09:00:00.000+0000' }];

const body = (req: IncomingMessage) => new Promise<string>(r => { let s = ''; req.on('data', c => (s += c)); req.on('end', () => r(s)); });
let fake: Server, base = '';
async function startFake() {
  fake = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const raw = req.method === 'POST' ? await body(req) : '';
    const auth = String(req.headers.authorization ?? '');
    log.push({ method: req.method ?? '', path: u.pathname, q: u.searchParams.get('q'), auth });
    const send = (status: number, json?: unknown, counted = true) => {
      const h: Record<string, string> = { 'content-type': 'application/json' };
      if (counted) { sf.orgUsed++; h['sforce-limit-info'] = `api-usage=${sf.orgUsed}/${sf.orgLimit}`; }
      res.writeHead(status, h); res.end(json === undefined ? '' : JSON.stringify(json));
    };
    if (u.pathname === '/services/oauth2/token') {
      const f = new URLSearchParams(raw);
      const ok = req.method === 'POST' && req.headers['content-type'] === 'application/x-www-form-urlencoded' && f.get('grant_type') === 'refresh_token'
        && f.get('refresh_token') === SF.refresh_token && f.get('client_id') === SF.client_id && f.get('client_secret') === SF.client_secret;
      return ok ? send(200, { access_token: 'sf-access', instance_url: base, id: `${base}/id/00D/005`, token_type: 'Bearer', issued_at: '1' }, false)
        : send(400, { error: 'invalid_grant', error_description: 'expired access/refresh token' }, false);
    }
    if (!u.pathname.startsWith(V)) return send(404, [{ errorCode: 'NOT_FOUND', message: 'not found' }]);
    if (auth !== 'Bearer sf-access') return send(401, [{ errorCode: 'INVALID_SESSION_ID', message: 'Session expired or invalid' }]);
    if (sf.orgUsed >= sf.orgLimit) return send(403, [{ errorCode: 'REQUEST_LIMIT_EXCEEDED', message: 'TotalRequests Limit exceeded.' }]);
    const p = u.pathname.slice(V.length);
    if (p === '/sobjects/Contact/listviews') return send(200, { done: true, nextRecordsUrl: null, size: 2, listviews: [
      { id: CONTACT_VIEW, label: 'Pune renewals', developerName: 'Pune_renewals', soqlCompatible: true, url: `${V}/sobjects/Contact/listviews/${CONTACT_VIEW}` },
      { id: '00B000000000009AAA', label: 'Recently Viewed Contacts', developerName: 'RecentlyViewedContacts', soqlCompatible: false } ] });
    if (p === '/sobjects/Lead/listviews') return send(200, { done: true, nextRecordsUrl: null, size: 1, listviews: [{ id: LEAD_VIEW, label: 'Open leads', developerName: 'Open_leads', soqlCompatible: true }] });
    const d = /^\/sobjects\/(Contact|Lead)\/describe$/.exec(p);
    if (d) return send(200, { name: d[1], fields: FIELDS.filter(f => !sf.hidden.has(f)).map(name => ({ name, type: name === 'DoNotCall' ? 'boolean' : 'string' })) });
    const lv = /^\/sobjects\/(Contact|Lead)\/listviews\/(\w+)\/describe$/.exec(p);
    if (lv) return send(200, { id: lv[2], sobjectType: lv[1], scope: 'everything', columns: [{ fieldNameOrPath: 'Name', label: 'Name' }],
      query: lv[1] === 'Contact' ? "SELECT Name, Phone, Id, LastModifiedDate FROM Contact WHERE MailingCity = 'Pune' ORDER BY Name ASC NULLS FIRST, Id ASC NULLS FIRST"
        : 'SELECT Name, Id FROM Lead WHERE IsConverted = false ORDER BY Name ASC NULLS FIRST, Id ASC NULLS FIRST',
      whereCondition: { field: 'MailingCity', operator: 'equals', values: ["'Pune'"] } });
    const page = /^\/query\/(\w+)-(\d+)$/.exec(p);
    if (p === '/query' || page) {
      const q = page ? decodeURIComponent(page[1]) : u.searchParams.get('q') ?? '';
      const obj = /FROM (Contact|Lead)/.exec(page ? (log.findLast(h => h.q)?.q ?? '') : q)?.[1];
      const rows = obj === 'Lead' ? leads : sf.contacts.filter(c => c.MailingCity === 'Pune');
      if (!page && /SELECT COUNT\(\)/.test(q)) {
        assert.doesNotMatch(q, /ORDER BY/, 'COUNT() with ORDER BY is not valid SOQL');
        return send(200, { totalSize: rows.length, done: true, records: [] });
      }
      if (!page) {
        assert.match(q, obj === 'Lead' ? / FROM Lead WHERE IsConverted = false ORDER BY Name ASC/ : / FROM Contact WHERE MailingCity = 'Pune' ORDER BY Name ASC/, "the view's own filter and order are kept");
        const cols = /^SELECT (.+?) FROM/.exec(q)![1].split(', ');
        const bad = cols.find(c => sf.hidden.has(c) || sf.queryHidden.has(c) || !FIELDS.includes(c));
        if (bad) return send(400, [{ errorCode: 'INVALID_FIELD', message: `\nSELECT Id, ${bad} FROM ${obj}\n ^\nERROR at Row:1:Column:12\nNo such column '${bad}' on entity '${obj}'. If you are attempting to use a custom field, be sure to append the '__c' after the custom field name.` }]);
      }
      const start = page ? Number(page[2]) : 0, cols = /^SELECT (.+?) FROM/.exec(log.findLast(h => h.q && !/COUNT\(\)/.test(h.q))!.q!)![1].split(', ');
      const slice = rows.slice(start, start + sf.pageSize).map(r => ({ attributes: { type: obj, url: `${V}/sobjects/${obj}/${r.Id}` }, ...Object.fromEntries(cols.map(c => [c, (r as Record<string, unknown>)[c] ?? null])) }));
      const more = start + sf.pageSize < rows.length;
      return send(200, { totalSize: rows.length, done: !more, records: slice, ...(more ? { nextRecordsUrl: `${V}/query/01gSYNTH-${start + sf.pageSize}` } : {}) });
    }
    send(404, [{ errorCode: 'NOT_FOUND', message: 'The requested resource does not exist' }]);
  });
  await new Promise<void>(r => fake.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  setCrmUrls({ salesforceLogin: base, salesforceApi: base });
}

before(async () => {
  if (skip) return;
  process.env.VP_SECRET_KEY ??= randomBytes(32).toString('hex');   // a generated test value; integrations are sealed with it
  pool = createPool(URL_);
  reg = buildApp(pool, [intake, workspace]).registry;
  await startFake();
});
after(async () => { resetCrmUrls(); fake?.close(); await pool?.end(); });

async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('salesforce test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role, status) VALUES ($1,$2,'owner','active') RETURNING id", [ws, `s${Math.random()}@example.test`]))!.id;
  const actor: Actor = { type: 'member', id: owner, role: 'owner' };
  const call = (name: string, args: unknown) => reg.execute<any>(pool, name, args, { workspaceId: ws, actor });
  const ok = async (name: string, args: unknown) => { const r = await call(name, args); assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`); return (r as any).result; };
  const connect = async (kind: string, name: string, secrets: Record<string, string>, config?: Record<string, string>) => {
    const st = await ok('integration.stage_secrets', { kind, secrets });
    const p = await call('integration.connect', { kind, name, stashId: st.stashId, ...(config ? { config } : {}) });
    const a = await reg.approve<any>(pool, (p as any).actionId, { workspaceId: ws, memberId: owner });
    assert.equal(a.status, 'confirmed', JSON.stringify(a));
    return (a as any).result.id as string;
  };
  const people = async () => many<{ e164: string; name: string | null }>(pool, 'SELECT e164, name FROM contact WHERE workspace_id = $1 ORDER BY e164 COLLATE "C"', [ws]);
  const uploads = async () => Number((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM intake_upload WHERE workspace_id = $1', [ws]))!.n);
  return { ws, owner, call, ok, connect, people, uploads };
}
const rest = () => log.filter(h => h.path.startsWith(V));
const writes = () => log.filter(h => !(h.method === 'GET' || (h.method === 'POST' && h.path === '/services/oauth2/token')));

// ---- pure parts ----------------------------------------------------------------------------------

test('Salesforce: credentials go only to https Salesforce hosts; a list view query keeps its filter and order', () => {
  for (const ok of ['https://acme.my.salesforce.com', 'https://acme--uat.sandbox.my.salesforce.com', 'https://login.salesforce.com', 'https://acme.lightning.force.com']) assert.ok(salesforceHostAllowed(ok), ok);
  for (const bad of ['http://acme.my.salesforce.com', 'https://salesforce.com.evil.example', 'https://evil.example/salesforce.com', 'https://user:pw@acme.my.salesforce.com', 'https://127.0.0.1', 'not a url']) assert.ok(!salesforceHostAllowed(bad), bad);
  assert.deepEqual(splitListViewQuery("SELECT Name FROM Contact WHERE MailingCity = 'Pune' ORDER BY Name ASC NULLS FIRST LIMIT 500", 'Contact'),
    { tail: "WHERE MailingCity = 'Pune' ORDER BY Name ASC NULLS FIRST", countTail: "WHERE MailingCity = 'Pune'" });
  assert.deepEqual(splitListViewQuery('SELECT Name FROM Lead USING SCOPE mine ORDER BY Name', 'Lead'), { tail: 'USING SCOPE mine ORDER BY Name', countTail: 'USING SCOPE mine' });
  assert.deepEqual(splitListViewQuery('SELECT Id FROM Contact ORDER BY Name', 'Contact'), { tail: 'ORDER BY Name', countTail: '' });
  assert.throws(() => splitListViewQuery('SELECT Id FROM Account', 'Contact'), /cannot read/);
  // An unreadable field gets no column, never an empty one (an empty "Do not call" would read as "may call").
  const rows = recordsToRows('salesforce', [{ id: '003x', updatedAt: null, fields: { FirstName: 'A', MobilePhone: '9000060301' } }], ['Call_Consent__c'], ['DoNotCall', 'Call_Consent__c']);
  assert.ok(!rows[0].includes('Do not call') && !rows[0].includes('Call_Consent__c'), rows[0].join('|'));
});

// ---- pulls ---------------------------------------------------------------------------------------

test("Salesforce: Contact and Lead list views; a pull keeps the view's filter, pages by nextRecordsUrl, maps like a file; DoNotCall becomes an opt-out; the receipt shows the API calls; read only", { skip }, async () => {
  sfReset(); log.length = 0;
  const w = await world();
  const id = await w.connect('salesforce', 'Salesforce (synthetic)', SF, { instance_url: 'https://synthetic.my.salesforce.com' });
  const lists = await w.ok('source.crm.lists', { integrationId: id });
  assert.deepEqual(lists.lists, [{ id: `Contact:${CONTACT_VIEW}`, name: 'Contacts: Pune renewals', size: null }, { id: `Lead:${LEAD_VIEW}`, name: 'Leads: Open leads', size: null }],
    'a view Salesforce says SOQL cannot run (Recently Viewed) is not offered');
  log.length = 0;
  const pull = await w.ok('source.crm.pull', { integrationId: id, listId: `Contact:${CONTACT_VIEW}`, fields: ['Call_Consent__c'] });
  assert.equal(pull.records, 5, 'only the five in the view (MailingCity = Pune); Delhi is not in it');
  assert.equal(log.filter(h => /\/query\/01gSYNTH-/.test(h.path)).length, 2, 'five records in pages of two: two nextRecordsUrl pages');
  assert.deepEqual(pull.unreadable, []);
  assert.equal(pull.apiCalls.calls, rest().length, 'every REST call is counted (the token exchange is not REST and is not counted)');
  assert.equal(pull.apiCalls.budget, 1000);
  assert.deepEqual([pull.apiCalls.orgUsed, pull.apiCalls.orgLimit], [sf.orgUsed, 15_000], "the org's own usage, from Sforce-Limit-Info");
  const map = await w.ok('source.map', { uploadId: pull.uploadId });
  const f = Object.fromEntries(map.columns.map((c: any) => [c.header, c.field === 'attribute' ? `attribute:${c.key}` : c.field]));
  assert.equal(f['Salesforce id'], 'attribute:salesforce_id');
  assert.equal(f['Phone'], 'phone');
  assert.equal(f['Do not call'], 'opt_out', "Salesforce's own do-not-call flag is an opt-out");
  assert.equal(f['Call_Consent'], 'consent', 'a custom consent field the member asked for maps as consent, recorded only with a purpose');
  assert.equal(f['Updated at'], 'observed_at');
  assert.deepEqual(map.notCallable, { optedOut: 1, suppressed: 0, tombstoned: 0 }, 'the preview counts Arjun as valid but not callable');
  const r = await w.ok('source.commit', { uploadId: pull.uploadId, consentPurpose: 'service' });
  assert.equal(r.counts.new, 4);
  assert.equal(r.counts.reason_EMPTY, 1, 'the record with no number is reported, not invented');
  assert.equal(r.counts.opt_outs, 1, 'Arjun (DoNotCall) is suppressed');
  assert.deepEqual((await w.people()).map(p => p.name), ['Kavita Nair', 'Arjun Malhotra', 'Meera Iyer', 'Rohan Das']);
  const receipt = await w.ok('source.receipt', { receiptId: r.receiptId });
  assert.equal(receipt.summary.converted.from, 'salesforce');
  assert.equal(receipt.summary.converted.apiCalls.calls, pull.apiCalls.calls, 'the budget used is on the receipt');
  const spent = await one<{ n: string }>(pool, "SELECT coalesce(sum(calls), 0) AS n FROM intake_crm_api_use WHERE integration_id = $1", [id]);
  assert.equal(Number(spent!.n), rest().length + 2, 'what the lists and the pull spent is kept (the two list-view calls before the log reset, too)');
  // A second look at the same people: Arjun is now suppressed in the workspace, not merely opted out in the file.
  const again = await w.ok('source.crm.pull', { integrationId: id, listId: `Contact:${CONTACT_VIEW}`, fields: ['Call_Consent__c'] });
  assert.deepEqual((await w.ok('source.map', { uploadId: again.uploadId })).notCallable, { optedOut: 1, suppressed: 0, tombstoned: 0 }, 'an opt-out in the file counts once, as opted out');
  // A sync is idempotent on the CRM id, as with HubSpot and Zoho.
  const s = await w.ok('source.sync', { sourceId: pull.sourceId });
  assert.equal(s.unchangedSkipped, 5);
  assert.equal(s.counts.new + s.counts.updated, 0);
  // Leads too.
  const lead = await w.ok('source.crm.pull', { integrationId: id, listId: `Lead:${LEAD_VIEW}` });
  assert.equal(lead.records, 1);
  assert.deepEqual(writes(), [], 'read only: nothing but GETs and the token exchange reached Salesforce');
  assert.ok(rest().every(h => h.auth === 'Bearer sf-access'));
});

test('Salesforce field-level security: a field the user may not read is reported as unreadable and gets no column, never an empty one; no phone field at all is a plain refusal', { skip }, async () => {
  sfReset(); log.length = 0;
  const w = await world();
  const id = await w.connect('salesforce', 'Salesforce (synthetic)', SF);
  // Hidden from the describe: left out of the query and reported.
  sf.hidden = new Set(['DoNotCall', 'Email']);
  const p1 = await w.ok('source.crm.pull', { integrationId: id, listId: `Contact:${CONTACT_VIEW}` });
  assert.deepEqual(p1.unreadable.sort(), ['DoNotCall', 'Email']);
  const map = await w.ok('source.map', { uploadId: p1.uploadId });
  assert.ok(!map.columns.some((c: any) => c.header === 'Do not call'), 'no "Do not call" column: an empty one would read as "may call", which Salesforce never said');
  const rows = (await one<{ content: string }>(pool, 'SELECT content FROM intake_upload WHERE id = $1', [p1.uploadId]))!.content;
  assert.doesNotMatch(rows.split('\n')[0], /Email|Do not call/);
  const receipt = await w.ok('source.commit', { uploadId: p1.uploadId });
  assert.deepEqual((await w.ok('source.receipt', { receiptId: receipt.receiptId })).summary.converted.unreadable.sort(), ['DoNotCall', 'Email'], 'and the receipt says so');
  // Hidden after the describe (or a custom field the user cannot see): the query fails on it once, it is dropped and named.
  sf.hidden = new Set(); sf.queryHidden = new Set(['Call_Consent__c']);
  const p2 = await w.ok('source.crm.pull', { integrationId: id, listId: `Contact:${CONTACT_VIEW}`, fields: ['Call_Consent__c'] });
  assert.deepEqual(p2.unreadable, ['Call_Consent__c']);
  assert.equal(p2.records, 5);
  // Neither phone field readable: nothing to import, and the reason in plain words.
  sf.queryHidden = new Set(); sf.hidden = new Set(['MobilePhone', 'Phone']);
  const r = await w.call('source.crm.pull', { integrationId: id, listId: `Contact:${CONTACT_VIEW}` });
  assert.equal(r.status, 'not_executed');
  assert.match((r as any).reason, /cannot read the phone fields \(MobilePhone, Phone\) on Contact; give it read access in field-level security/);
  assert.deepEqual(writes(), []);
});

test('Salesforce API budget: a pull counts first and stops before passing the budget or the org reserve, with nothing imported; the cap itself is a budget stop, not a credentials error', { skip }, async () => {
  sfReset(); log.length = 0;
  const w = await world();
  const id = await w.connect('salesforce', 'Salesforce (synthetic)', SF);
  assert.equal((await w.ok('source.crm.budget', { integrationId: id })).dailyCalls, 1000, 'a default budget');
  // Budget 10, 6 already used in the last 24 hours: 4 left. The pull needs 3 to count, then 3 pages: it stops after counting.
  await w.ok('source.crm.budget.set', { integrationId: id, dailyCalls: 10 });
  await pool.query('INSERT INTO intake_crm_api_use (integration_id, workspace_id, calls) VALUES ($1,$2,6)', [id, w.ws]);
  await pool.query("INSERT INTO intake_crm_api_use (integration_id, workspace_id, calls, at) VALUES ($1,$2,500, now() - interval '25 hours')", [id, w.ws]);
  const before = await w.uploads();
  let r = await w.call('source.crm.pull', { integrationId: id, listId: `Contact:${CONTACT_VIEW}` });
  assert.equal(r.status, 'not_executed');
  assert.match((r as any).reason, /Vyakti may use 10 Salesforce API calls a day for this org and has used 10 in the last 24 hours, so the pull stopped before passing that and nothing was imported/);
  assert.ok(!log.some(h => /\/query\/01gSYNTH-/.test(h.path)), 'no page was read');
  assert.equal(await w.uploads(), before, 'nothing half-imported');
  // With room to list and count but not to read, it stops before the first page and says how many it needed.
  // 9 used + 2 (list views of Contact and Lead) + 3 (describe, list view describe, count) = 14 of 14.
  await w.ok('source.crm.budget.set', { integrationId: id, dailyCalls: 14 });
  await pool.query('DELETE FROM intake_crm_api_use WHERE integration_id = $1', [id]);
  await pool.query('INSERT INTO intake_crm_api_use (integration_id, workspace_id, calls) VALUES ($1,$2,9)', [id, w.ws]);
  log.length = 0;
  r = await w.call('source.crm.pull', { integrationId: id, listId: `Contact:${CONTACT_VIEW}` });
  assert.match((r as any).reason, /this list view needs about 1 more Salesforce API call and 0 are left in the budget for the last 24 hours; nothing was imported/);
  assert.ok(!log.some(h => h.q && !/COUNT\(\)/.test(h.q)), 'it counted, then stopped before the first page');
  // The org reserve: Salesforce says the org is near its own limit; Vyakti stops at 90% even with budget to spare.
  await w.ok('source.crm.budget.set', { integrationId: id, dailyCalls: 1000 });
  sf.orgUsed = 13_498;                                            // 90% of 15,000 is 13,500
  r = await w.call('source.crm.pull', { integrationId: id, listId: `Contact:${CONTACT_VIEW}` });
  assert.match((r as any).reason, /Salesforce reports 13,500 of this org's 15,000 API calls used in the last 24 hours\. Vyakti stops at 90%/);
  assert.equal(await w.uploads(), before);
  // Salesforce's own cap (REQUEST_LIMIT_EXCEEDED, a 403) reads as a budget stop, not as "reconnect".
  sf.orgUsed = 15_000;
  r = await w.call('source.crm.lists', { integrationId: id });
  assert.match((r as any).reason, /used all of its API calls for the last 24 hours/);
  assert.doesNotMatch((r as any).reason, /refused the stored credentials/);
  const b = await w.ok('source.crm.budget', { integrationId: id });
  assert.equal(b.orgLimit, 15_000);
  assert.ok(b.usedLast24h > 9, 'refused pulls still spent calls, and they are counted');
  assert.deepEqual(writes(), []);
});

test('Salesforce timed sync backs off cleanly at the budget: the reason is kept on the source in plain words, nothing is imported, and the calls it spent still count', { skip }, async () => {
  sfReset(); log.length = 0;
  const w = await world();
  const id = await w.connect('salesforce', 'Salesforce (synthetic)', SF);
  const pull = await w.ok('source.crm.pull', { integrationId: id, listId: `Contact:${CONTACT_VIEW}` });
  await w.ok('source.commit', { uploadId: pull.uploadId });
  await w.ok('source.sync.schedule', { sourceId: pull.sourceId, everyHours: 1 });
  const committed = async () => Number((await one<{ n: string }>(pool, "SELECT count(*) AS n FROM intake_upload WHERE source_id = $1 AND status = 'committed'", [pull.sourceId]))!.n);
  const spentBefore = Number((await one<{ n: string }>(pool, 'SELECT sum(calls) AS n FROM intake_crm_api_use WHERE integration_id = $1', [id]))!.n);
  // Room to count (3) and read one page. Salesforce sends pages of 2 here, not 2,000: after the first page the estimate is
  // redone (2 more pages, 0 calls left) and the sync stops before the second page instead of failing halfway.
  await w.ok('source.crm.budget.set', { integrationId: id, dailyCalls: spentBefore + 4 });
  await pool.query("UPDATE intake_source SET last_synced_at = now() - interval '2 hours' WHERE id = $1", [pull.sourceId]);
  log.length = 0;
  await crmSyncJob.run({ pool } as never);
  const s = await one<{ last_sync_error: string | null }>(pool, 'SELECT last_sync_error FROM intake_source WHERE id = $1', [pull.sourceId]);
  assert.match(s!.last_sync_error ?? '', /this list view needs about 2 more Salesforce API calls and 0 are left in the budget for the last 24 hours; nothing was imported/);
  assert.ok(!log.some(h => /\/query\/01gSYNTH-/.test(h.path)), 'the second page was never asked for');
  assert.equal(await committed(), 1, 'no second import');
  const spentAfter = Number((await one<{ n: string }>(pool, 'SELECT sum(calls) AS n FROM intake_crm_api_use WHERE integration_id = $1', [id]))!.n);
  assert.equal(spentAfter - spentBefore, 4, 'the four calls the stopped sync made are counted, though its transaction rolled back');
  // With budget again, the next run syncs.
  await w.ok('source.crm.budget.set', { integrationId: id, dailyCalls: 1000 });
  await pool.query("UPDATE intake_source SET last_synced_at = now() - interval '2 hours' WHERE id = $1", [pull.sourceId]);
  await crmSyncJob.run({ pool } as never);
  assert.equal((await one<{ last_sync_error: string | null }>(pool, 'SELECT last_sync_error FROM intake_source WHERE id = $1', [pull.sourceId]))!.last_sync_error, null);
  assert.equal(await committed(), 2);
});

test('Salesforce refusals: a revoked refresh token, a budget on a non-Salesforce integration, another workspace', { skip }, async () => {
  sfReset(); log.length = 0;
  const w = await world(), other = await world();
  const bad = await w.connect('salesforce', 'Salesforce (revoked)', { ...SF, refresh_token: 'revoked' });
  assert.match((await w.call('source.crm.lists', { integrationId: bad }) as any).reason, /Salesforce answered 400|did not issue an access token/);
  const good = await w.connect('salesforce', 'Salesforce (synthetic)', SF);
  assert.match((await other.call('source.crm.budget', { integrationId: good }) as any).reason, /apply to Salesforce integrations/, "another workspace's integration is not visible");
  assert.equal((await other.call('source.crm.budget.set', { integrationId: good, dailyCalls: 50 })).status, 'not_executed');
  assert.equal((await w.call('source.crm.budget.set', { integrationId: good, dailyCalls: 5 })).status, 'not_executed', 'at least 10');
  const slack = await w.connect('slack', 'Team chat', { webhook_url: 'https://hooks.slack.com/services/T0SYNTH/B0SYNTH/x' });
  assert.match((await w.call('source.crm.budget', { integrationId: slack }) as any).reason, /apply to Salesforce integrations/);
});
