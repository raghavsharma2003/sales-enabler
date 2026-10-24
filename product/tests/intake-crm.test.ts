// CRM contact import (HubSpot lists, Zoho CRM views), read only, against local fakes shaped like the documented responses
// (research/2026-10-24/crm-import/README.md). No real API call and no real key; synthetic people and numbers only.
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
import { resetCrmUrls, setCrmUrls } from '../server/modules/intake/crm.ts';
import { crmSyncJob } from '../server/modules/intake/crm-tools.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, reg: Registry;

// ---- fakes ---------------------------------------------------------------------------------------

interface Hit { method: string; path: string; auth: string; body: any }
const log: Hit[] = [];
const body = (req: IncomingMessage) => new Promise<any>(r => { let s = ''; req.on('data', c => (s += c)); req.on('end', () => { try { r(s ? JSON.parse(s) : null); } catch { r(s); } }); });
const send = (res: any, status: number, json?: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(json === undefined ? '' : JSON.stringify(json)); };

const HS_TOKEN = 'hs-synthetic-token';
const hs = {
  lists: [
    { listId: '101', name: 'Renewals November', objectTypeId: '0-1', processingType: 'MANUAL', additionalProperties: { hs_list_size: '4' } },
    { listId: '202', name: 'Open deals', objectTypeId: '0-3', processingType: 'DYNAMIC', additionalProperties: { hs_list_size: '9' } },
  ],
  members: { '101': ['501', '502', '503', '504'] } as Record<string, string[]>,
  down: false,                                     // the CRM answers 503 to everything (a real outage)
  contacts: {} as Record<string, { properties: Record<string, string | null>; updatedAt: string }>,
};
function hsReset() {
  hs.contacts = {
    '501': { updatedAt: '2026-10-20T10:00:00.000Z', properties: { firstname: 'Kavita', lastname: 'Nair', mobilephone: '+91 90000 40101', phone: '022 2345 6789', email: 'kavita@example.test', hs_language: 'hi', call_consent: 'yes' } },
    '502': { updatedAt: '2026-10-20T10:00:00.000Z', properties: { firstname: 'Arjun', lastname: 'Malhotra', mobilephone: '', phone: '09000040102', email: null, hs_language: 'en', call_consent: '' } },
    '503': { updatedAt: '2026-10-20T10:00:00.000Z', properties: { firstname: 'Meera', lastname: 'Iyer', mobilephone: '९०००० ४०१०३', phone: '', email: null, hs_language: null, call_consent: 'no' } },
    '504': { updatedAt: '2026-10-20T10:00:00.000Z', properties: { firstname: 'No', lastname: 'Number', mobilephone: '', phone: '', email: 'none@example.test', hs_language: null, call_consent: null } },
  };
}

const ZO = { client_id: 'zo-client', client_secret: 'zo-secret', refresh_token: 'zo-refresh' };
const zoRecords = [
  { id: '7000001', First_Name: 'Sunita', Last_Name: 'Verma', Mobile: '9000040201', Phone: null, Email: null, Modified_Time: '2026-10-21T09:00:00+05:30' },
  { id: '7000002', First_Name: 'Imran', Last_Name: 'Qureshi', Mobile: null, Phone: '+91 9000040202', Email: null, Modified_Time: '2026-10-21T09:00:00+05:30' },
  { id: '7000003', First_Name: 'Lakshmi', Last_Name: 'Rao', Mobile: '9000040203', Phone: null, Email: null, Modified_Time: '2026-10-21T09:00:00+05:30' },
];

let fake: Server, base = '';
async function startFake() {
  fake = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const b = req.method === 'POST' ? await body(req) : null;
    const auth = String(req.headers.authorization ?? '');
    log.push({ method: req.method ?? '', path: u.pathname, auth, body: b });
    // HubSpot
    if (u.pathname.startsWith('/crm/v3/')) {
      if (hs.down) return send(res, 503, { message: 'service unavailable' });
      if (auth !== `Bearer ${HS_TOKEN}`) return send(res, 401, { status: 'error', message: 'Authentication credentials not found.' });
      if (req.method === 'POST' && u.pathname === '/crm/v3/lists/search') return send(res, 200, { lists: hs.lists, hasMore: false, offset: hs.lists.length, total: hs.lists.length });
      const m = /^\/crm\/v3\/lists\/(\w+)\/memberships\/join-order$/.exec(u.pathname);
      if (req.method === 'GET' && m) {
        const all = hs.members[m[1]] ?? [], start = Number(u.searchParams.get('after') ?? 0), page = 2;   // pages of 2 to exercise paging
        const slice = all.slice(start, start + page);
        return send(res, 200, { results: slice.map(recordId => ({ recordId, membershipTimestamp: '2026-10-01T00:00:00Z' })), total: all.length,
          ...(start + page < all.length ? { paging: { next: { after: String(start + page), link: 'x' } } } : {}) });
      }
      if (req.method === 'POST' && u.pathname === '/crm/v3/objects/contacts/batch/read') {
        if ((b?.inputs?.length ?? 0) > 100) return send(res, 400, { message: 'too many inputs' });
        const results = (b.inputs as { id: string }[]).filter(x => hs.contacts[x.id]).map(x => ({ id: x.id, archived: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: hs.contacts[x.id].updatedAt,
          properties: Object.fromEntries((b.properties as string[]).map(k => [k, hs.contacts[x.id].properties[k] ?? (k === 'lastmodifieddate' ? hs.contacts[x.id].updatedAt : null)])) }));
        return send(res, 200, { status: 'COMPLETE', results, startedAt: '2026-10-24T00:00:00Z', completedAt: '2026-10-24T00:00:01Z' });
      }
      return send(res, 404, { message: 'not found' });
    }
    // Zoho accounts
    if (u.pathname === '/oauth/v2/token') {
      const ok = req.method === 'POST' && u.searchParams.get('grant_type') === 'refresh_token' && u.searchParams.get('refresh_token') === ZO.refresh_token && u.searchParams.get('client_id') === ZO.client_id && u.searchParams.get('client_secret') === ZO.client_secret;
      return ok ? send(res, 200, { access_token: 'zo-access', api_domain: base, token_type: 'Bearer', expires_in: 3600 }) : send(res, 200, { error: 'invalid_code' });
    }
    // Zoho CRM v8
    if (u.pathname.startsWith('/crm/v8/')) {
      if (auth !== 'Zoho-oauthtoken zo-access') return send(res, 401, { code: 'INVALID_TOKEN', message: 'invalid oauth token' });
      if (u.pathname === '/crm/v8/settings/custom_views' && u.searchParams.get('module') === 'Contacts')
        return send(res, 200, { custom_views: [{ id: '9001', display_value: 'Hot leads', name: 'Hot leads', system_name: null }], info: { per_page: 200, count: 1, page: 1, more_records: false } });
      if (u.pathname === '/crm/v8/Contacts' && u.searchParams.get('cvid') === '9001') {
        assert.ok(u.searchParams.get('fields'), 'fields is mandatory');
        const tok = u.searchParams.get('page_token');
        if (!tok) return send(res, 200, { data: zoRecords.slice(0, 2), info: { per_page: 200, count: 2, page: 1, more_records: true, next_page_token: 'tok2' } });
        if (tok === 'tok2') return send(res, 200, { data: zoRecords.slice(2), info: { per_page: 200, count: 1, page: 2, more_records: false, next_page_token: null } });
      }
      return send(res, 204);
    }
    send(res, 404, {});
  });
  await new Promise<void>(r => fake.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  setCrmUrls({ hubspot: base, zohoAccounts: base, zohoApi: base });
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
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('crm test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role, status) VALUES ($1,$2,'owner','active') RETURNING id", [ws, `c${Math.random()}@example.test`]))!.id;
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
  const people = async () => many<{ e164: string; name: string | null; language: string | null }>(pool, 'SELECT e164, name, language FROM contact WHERE workspace_id = $1 ORDER BY e164 COLLATE "C"', [ws]);
  return { ws, owner, call, ok, connect, people };
}

const writes = () => log.filter(h => !(h.method === 'GET' || (h.method === 'POST' && ['/crm/v3/lists/search', '/crm/v3/objects/contacts/batch/read', '/oauth/v2/token'].includes(h.path))));

// ---- HubSpot -------------------------------------------------------------------------------------

test('HubSpot: contact lists only; a pull maps like a file; consent only from a CRM field the member maps; DND stays unknown; nothing is written to the CRM', { skip }, async () => {
  hsReset(); log.length = 0;
  const w = await world();
  const id = await w.connect('hubspot', 'HubSpot (synthetic)', { access_token: HS_TOKEN }, { portal_id: '123' });
  const lists = await w.ok('source.crm.lists', { integrationId: id });
  assert.deepEqual(lists.lists, [{ id: '101', name: 'Renewals November', size: 4 }], 'a deals list is not offered');
  const pull = await w.ok('source.crm.pull', { integrationId: id, listId: '101', fields: ['call_consent'] });
  assert.deepEqual({ records: pull.records, toImport: pull.toImport, unchangedSkipped: pull.unchangedSkipped, numberChanged: pull.numberChanged }, { records: 4, toImport: 4, unchangedSkipped: 0, numberChanged: 0 });
  assert.ok(log.filter(h => h.path.includes('/memberships/')).length >= 2, 'memberships were paged');
  const map = await w.ok('source.map', { uploadId: pull.uploadId });
  const f = Object.fromEntries(map.columns.map((c: any) => [c.header, c.field === 'attribute' ? `attribute:${c.key}` : c.field]));
  assert.equal(f['HubSpot id'], 'attribute:hubspot_id', 'the CRM id is a detail, never a phone');
  assert.equal(f['Phone'], 'phone');
  assert.equal(f['Other phone'], 'attribute:other_phone');
  assert.equal(f['Updated at'], 'observed_at', "freshness comes from the CRM's own update time");
  assert.equal(f['call_consent'], 'consent', 'a CRM field named as consent is read as consent, as a file column would be');
  assert.ok(map.questions.some((q: string) => /purpose/.test(q)), 'and, as with a file, it is recorded only with a purpose');
  assert.equal(map.converted.from, 'hubspot');
  const r = await w.ok('source.commit', { uploadId: pull.uploadId, consentPurpose: 'service' });
  assert.equal(r.counts.new, 3);
  assert.equal(r.counts.reason_EMPTY, 1, 'the record with no number is reported, not invented');
  assert.deepEqual((await w.people()).map(p => [p.e164, p.name, p.language]), [['+919000040101', 'Kavita Nair', 'hi'], ['+919000040102', 'Arjun Malhotra', 'en'], ['+919000040103', 'Meera Iyer', null]]);
  const consent = await many<{ e164: string; granted: boolean }>(pool, 'SELECT c.e164, r.granted FROM consent_record r JOIN contact c ON c.id = r.contact_id WHERE r.workspace_id = $1 ORDER BY c.e164', [w.ws]);
  assert.deepEqual(consent.map(c => [c.e164, c.granted]), [['+919000040101', true], ['+919000040103', false]], 'consent only where the CRM recorded it; Arjun stays unknown');
  const dnd = await many<{ ncpr_status: string }>(pool, 'SELECT d.ncpr_status FROM dnd_status d JOIN contact c ON c.id = d.contact_id WHERE c.workspace_id = $1', [w.ws]);
  assert.ok(dnd.length === 3 && dnd.every(d => d.ncpr_status === 'unknown'), 'DND is never assumed from a CRM');
  const kav = (await one<{ id: string }>(pool, "SELECT id FROM contact WHERE workspace_id = $1 AND e164 = '+919000040101'", [w.ws]))!.id;
  const attrs = Object.fromEntries((await many<{ key: string; value: unknown; authority: string }>(pool, 'SELECT key, value, authority FROM attribute WHERE contact_id = $1', [kav])).map(a => [a.key, [a.value, a.authority]]));
  assert.deepEqual(attrs.hubspot_id, ['501', 'crm']);
  assert.deepEqual(attrs.other_phone, ['022 2345 6789', 'crm']);
  assert.deepEqual(writes(), [], 'read only: no write call reached the CRM');
  assert.ok(log.filter(h => h.path.startsWith('/crm/v3/')).every(h => h.auth === `Bearer ${HS_TOKEN}`));
});

test('HubSpot: a sync is idempotent on the CRM id: unchanged records are skipped, a changed one updates, a changed number is flagged and not doubled', { skip }, async () => {
  hsReset(); log.length = 0;
  const w = await world();
  const id = await w.connect('hubspot', 'HubSpot (synthetic)', { access_token: HS_TOKEN });
  const before = await w.call('source.sync', { sourceId: '00000000-0000-4000-8000-000000000000' });
  assert.equal(before.status, 'not_executed');
  const pull = await w.ok('source.crm.pull', { integrationId: id, listId: '101' });
  await w.ok('source.map', { uploadId: pull.uploadId });
  await w.ok('source.commit', { uploadId: pull.uploadId });
  assert.equal((await w.people()).length, 3);
  // Nothing changed in the CRM.
  let s = await w.ok('source.sync', { sourceId: pull.sourceId });
  assert.equal(s.unchangedSkipped, 4);
  assert.equal(s.counts.new + s.counts.updated, 0);
  // One record edited; one record's number replaced.
  hs.contacts['502'] = { updatedAt: '2026-10-23T10:00:00.000Z', properties: { ...hs.contacts['502'].properties, lastname: 'Malhotra-Singh' } };
  hs.contacts['503'] = { updatedAt: '2026-10-23T10:00:00.000Z', properties: { ...hs.contacts['503'].properties, mobilephone: '9000040199' } };
  s = await w.ok('source.sync', { sourceId: pull.sourceId });
  assert.equal(s.unchangedSkipped, 2);
  assert.equal(s.numberChanged, 1, 'a new number for the same CRM record is a person to check, not a second contact');
  assert.equal(s.counts.updated, 1);
  const people = await w.people();
  assert.equal(people.length, 3);
  assert.equal(people.find(p => p.e164 === '+919000040102')!.name, 'Arjun Malhotra-Singh');
  assert.ok(!people.some(p => p.e164 === '+919000040199'));
  const receipt = await w.ok('source.receipt', { receiptId: s.receiptId });
  assert.deepEqual(receipt.summary.converted.numberChanged, ['503']);
  // The id table keeps no numbers, only hashes.
  const rec = await many<{ e164_hash: string | null }>(pool, 'SELECT e164_hash FROM intake_crm_record WHERE source_id = $1', [pull.sourceId]);
  assert.ok(rec.length === 4 && rec.every(r => r.e164_hash === null || /^[0-9a-f]{64}$/.test(r.e164_hash)));
  assert.deepEqual(writes(), []);
});

test('timed sync: off by default; every 6 hours when set; a failure is kept on the source and retried', { skip }, async () => {
  hsReset(); log.length = 0;
  const w = await world();
  const id = await w.connect('hubspot', 'HubSpot (synthetic)', { access_token: HS_TOKEN });
  const pull = await w.ok('source.crm.pull', { integrationId: id, listId: '101' });
  await w.ok('source.commit', { uploadId: pull.uploadId });
  const audits = async () => Number((await one<{ n: string }>(pool, "SELECT count(*) AS n FROM audit_event WHERE workspace_id = $1 AND action = 'source.sync' AND actor_type = 'system'", [w.ws]))!.n);
  await pool.query("UPDATE intake_source SET last_synced_at = now() - interval '7 hours' WHERE id = $1", [pull.sourceId]);
  await crmSyncJob.run({ pool } as never);
  assert.equal(await audits(), 0, 'no timer, no sync');
  assert.equal((await w.call('source.sync.schedule', { sourceId: pull.sourceId, everyHours: 5 })).status, 'not_executed');
  await w.ok('source.sync.schedule', { sourceId: pull.sourceId, everyHours: 6 });
  await crmSyncJob.run({ pool } as never);
  assert.equal(await audits(), 1);
  await crmSyncJob.run({ pool } as never);
  assert.equal(await audits(), 1, 'not again within six hours');
  // The CRM is down: after its retries the error is kept on the source, nothing crashes, and the next run tries again.
  await pool.query("UPDATE intake_source SET last_synced_at = now() - interval '7 hours' WHERE id = $1", [pull.sourceId]);
  hs.down = true;
  try { await crmSyncJob.run({ pool } as never); } finally { hs.down = false; }
  const s = await one<{ last_sync_error: string | null }>(pool, 'SELECT last_sync_error FROM intake_source WHERE id = $1', [pull.sourceId]);
  assert.match(s!.last_sync_error ?? '', /HubSpot answered 503/, 'the failure is recorded on the source');
  await w.ok('source.sync.schedule', { sourceId: pull.sourceId, off: true });
  assert.equal((await one<{ sync_every_h: number | null }>(pool, 'SELECT sync_every_h FROM intake_source WHERE id = $1', [pull.sourceId]))!.sync_every_h, null);
});

// ---- Zoho CRM ------------------------------------------------------------------------------------

test('Zoho CRM: the refresh token buys an access token; views are listed; records page by page_token; read only', { skip }, async () => {
  log.length = 0;
  const w = await world();
  const id = await w.connect('zoho_crm', 'Zoho (synthetic)', ZO, { datacenter: 'in' });
  const lists = await w.ok('source.crm.lists', { integrationId: id });
  assert.deepEqual(lists.lists, [{ id: '9001', name: 'Hot leads', size: null }]);
  const pull = await w.ok('source.crm.pull', { integrationId: id, listId: '9001' });
  assert.equal(pull.records, 3);
  assert.ok(log.some(h => h.path === '/crm/v8/Contacts' && h.method === 'GET'), 'records read with GET');
  assert.equal(log.filter(h => h.path === '/crm/v8/Contacts').length, 2, 'two pages: the second by page_token');
  await w.ok('source.map', { uploadId: pull.uploadId });
  const r = await w.ok('source.commit', { uploadId: pull.uploadId });
  assert.equal(r.counts.new, 3);
  assert.deepEqual((await w.people()).map(p => p.name), ['Sunita Verma', 'Imran Qureshi', 'Lakshmi Rao']);
  const zid = await one<{ value: unknown }>(pool, "SELECT a.value FROM attribute a JOIN contact c ON c.id = a.contact_id WHERE c.workspace_id = $1 AND c.e164 = '+919000040201' AND a.key = 'zoho_id'", [w.ws]);
  assert.equal(zid!.value, '7000001', 'a 19-digit-style CRM id stays text');
  assert.ok(log.filter(h => h.path.startsWith('/crm/v8/')).every(h => h.auth === 'Zoho-oauthtoken zo-access'));
  assert.deepEqual(writes(), []);
});

// ---- refusals and tenancy ------------------------------------------------------------------------

test('refusals in plain words: bad credentials, a non-CRM integration, another workspace\'s integration', { skip }, async () => {
  hsReset(); log.length = 0;
  const w = await world(), other = await world();
  const bad = await w.connect('hubspot', 'HubSpot (wrong token)', { access_token: 'not-the-token' });
  const r = await w.call('source.crm.lists', { integrationId: bad });
  assert.equal(r.status, 'not_executed');
  assert.match((r as any).reason, /refused the stored credentials; reconnect/);
  const slack = await w.connect('slack', 'Team chat', { webhook_url: 'https://hooks.example.invalid/x' });
  assert.match((await w.call('source.crm.lists', { integrationId: slack }) as any).reason, /imports contacts from HubSpot and Zoho CRM/);
  const good = await w.connect('hubspot', 'HubSpot (synthetic)', { access_token: HS_TOKEN });
  const theirs = await other.call('source.crm.pull', { integrationId: good, listId: '101' });
  assert.equal(theirs.status, 'not_executed');
  assert.match((theirs as any).reason, /no connected integration/);
  const zbad = await w.connect('zoho_crm', 'Zoho (revoked)', { ...ZO, refresh_token: 'revoked' }, { datacenter: 'in' });
  assert.match((await w.call('source.crm.lists', { integrationId: zbad }) as any).reason, /did not issue an access token/);
});
