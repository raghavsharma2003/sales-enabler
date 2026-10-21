// Intake tests against a real Postgres (skipped when DATABASE_URL is unset). Fresh workspaces per test,
// synthetic numbers only (+91 90000 000xx and nearby), so the suite is safe to repeat on one database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { createPool, one, many } from '../server/db.ts';
import { buildApp } from '../server/app.ts';
import type { Registry, Actor } from '../server/tools.ts';
import { module as intake, setDndProvider, FakeDndProvider, DisabledDndProvider, signHook } from '../server/modules/intake/index.ts';
import { decide } from '../server/modules/intake/authority.ts';
import { parseDelimited, detectDelimiter, csvCell } from '../server/modules/intake/csv.ts';
import { inferMapping, parseDate } from '../server/modules/intake/mapping.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let reg: Registry;
let base = '';
let close: () => void = () => {};

before(async () => {
  if (skip) return;
  process.env.VP_DEV_AUTH = '1';
  pool = createPool(URL_);
  const app = buildApp(pool, [intake]);
  reg = app.registry;
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = () => app.server.close();
});
after(async () => { close(); await pool?.end(); });

async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('intake test') RETURNING id"))!.id;
  const member = async (role: string) => (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role, status) VALUES ($1,$2,$3,'active') RETURNING id",
    [ws, `m${Math.random()}@example.test`, role]))!.id;
  const owner = await member('owner');
  const as = (role: string, id = owner): Actor => ({ type: 'member', id, role: role as Actor['role'] });
  const call = async (name: string, args: unknown, actor: Actor = as('owner')) => reg.execute<any>(pool, name, args, { workspaceId: ws, actor });
  const ok = async (name: string, args: unknown, actor?: Actor) => {
    const r = await call(name, args, actor);
    assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`);
    return (r as { result: any }).result;
  };
  const approve = async (r: { status: string; actionId?: string }, by = owner) => {
    assert.equal(r.status, 'needs_approval', JSON.stringify(r));
    const a = await reg.approve<any>(pool, r.actionId!, { workspaceId: ws, memberId: by });
    assert.equal(a.status, 'confirmed', JSON.stringify(a));
    return (a as { result: any }).result;
  };
  const importText = async (text: string, extra: Record<string, unknown> = {}, sourceId?: string) => {
    const up = sourceId
      ? await ok('source.upload', { kind: 'csv', name: 'again', text }).then(async () => {
          // A second file into an existing source goes through the parts route.
          const r = await fetch(base + '/v1/uploads/contacts', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-dev-member': owner },
            body: JSON.stringify({ text, sourceId, final: true }) });
          return r.json() as Promise<{ uploadId: string; sourceId: string }>;
        })
      : await ok('source.upload', { kind: 'csv', name: 'list.csv', text });
    const res = await ok('source.commit', { uploadId: up.uploadId, ...extra });
    return { ...res, uploadId: up.uploadId, sourceId: up.sourceId };
  };
  const contactBy = (e164: string) => one<{ id: string; name: string | null; language: string | null; e164: string }>(pool, 'SELECT id, name, language, e164 FROM contact WHERE workspace_id = $1 AND e164 = $2', [ws, e164]);
  const attr = async (cid: string, key: string) => (await one<{ value: unknown; authority: string }>(pool, 'SELECT value, authority FROM attribute WHERE contact_id = $1 AND key = $2', [cid, key]));
  return { ws, owner, member, as, call, ok, approve, importText, contactBy, attr };
}

// ---- pure pieces --------------------------------------------------------------------------------

test('csv: quotes, embedded newlines, BOM, CRLF, delimiter detection', () => {
  const rows = parseDelimited('﻿name,phone\r\n"Sharma, Asha","9000000001"\r\n"Line\nbreak",9000000002\r\n\r\n');
  assert.deepEqual(rows, [['name', 'phone'], ['Sharma, Asha', '9000000001'], ['Line\nbreak', '9000000002']]);
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3\n'), '\t');
  assert.equal(detectDelimiter('a;b\n1;2\n'), ';');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('-2+3'), "'-2+3");
});

test('mapping: Hindi and English headers, identity documents ignored by design, phone found by values', () => {
  const m = inferMapping([['नाम', 'मोबाइल', 'भाषा', 'Aadhaar No', 'PAN', 'Policy Premium'], ['Asha', '9000000001', 'हिंदी', '1234 5678 9012', 'ABCDE1234F', '12,400']]);
  const f = Object.fromEntries(m.columns.map(c => [c.header, c.field]));
  assert.deepEqual(f, { 'नाम': 'name', 'मोबाइल': 'phone', 'भाषा': 'language', 'Aadhaar No': 'ignore', PAN: 'ignore', 'Policy Premium': 'attribute' });
  assert.equal(m.columns[5].type, 'number');
  const v = inferMapping([['who', 'col2'], ['A', '+91 90000 00001'], ['B', '09000000002']]);
  assert.equal(v.columns[1].field, 'phone');
  assert.equal(v.columns[1].why, 'values');
  assert.equal(parseDate('05/11/2026'), '2026-11-05');
  assert.equal(parseDate('2026-13-01'), null);
});

test('authority: fresh higher wins, equal from another source goes to review, older and less authoritative never overwrite', () => {
  const t = (h: number) => new Date(Date.UTC(2026, 9, 21, h));
  const up = { authority: 'upload' as const, maxAgeS: 30 * 86400, sourceId: 's1' };
  const ex = { value: 100, observedAt: t(1), ...up };
  assert.deepEqual(decide('amount', ex, { ...ex, value: 200, authority: 'crm', sourceId: 'c1', observedAt: t(2) }, t(3)), { take: true, why: 'higher_authority' });
  assert.deepEqual(decide('amount', { ...ex, authority: 'crm', sourceId: 'c1' }, { ...ex, value: 300, observedAt: t(2), sourceId: 's2' }, t(3)), { take: false, why: 'kept_more_authoritative' });
  assert.deepEqual(decide('amount', ex, { ...ex, value: 300, observedAt: t(0), authority: 'system' }, t(3)), { take: false, why: 'kept_newer' });
  assert.deepEqual(decide('amount', ex, { ...ex, value: 300, observedAt: t(2) }, t(3)), { take: true, why: 'same_source_newer' });
  assert.deepEqual(decide('amount', ex, { ...ex, value: 300, observedAt: t(2), sourceId: 's2' }, t(3)), { take: true, why: 'same_source_newer' }, 'two uploads are one lineage');
  const crm = { ...ex, authority: 'crm' as const, sourceId: 'c1' };
  assert.deepEqual(decide('amount', crm, { ...crm, value: 300, observedAt: t(2), sourceId: 'c2' }, t(3)), { take: false, why: 'conflict_review' }, 'two CRMs disagree: review');
  // Self subjects: the person outranks the system of record.
  assert.deepEqual(decide('language', { ...ex, value: 'en', authority: 'system' }, { ...ex, value: 'hi', authority: 'person', observedAt: t(2) }, t(3)), { take: true, why: 'higher_authority' });
  assert.deepEqual(decide('language', { ...ex, value: 'hi', authority: 'person' }, { ...ex, value: 'en', authority: 'system', observedAt: t(2) }, t(3)), { take: false, why: 'kept_more_authoritative' });
  // A stale value has lost its authority.
  const stale = { ...ex, authority: 'crm' as const, maxAgeS: 3600, sourceId: 'c1' };
  assert.deepEqual(decide('amount', stale, { ...ex, value: 5, observedAt: t(5), sourceId: 's2' }, t(6)), { take: true, why: 'existing_stale' });
});

// ---- end to end ---------------------------------------------------------------------------------

test('phone edge cases end to end: preview verdicts with reason codes, then the commit receipt', { skip }, async () => {
  const w = await workspace();
  const csv = ['Name,Mobile Number,City',
    'Asha,+91 90000 00001,Pune',
    'Bilal,09000000002,Agra',
    'Chitra,919000000003,Kochi',
    'Dev,९००००००००४,Patna',            // Devanagari digits
    'Esha,9.00000E+09,Surat',          // Excel scientific notation: digits are lost
    'Farah,+1 415 555 0100,Austin',    // foreign: kept out, never converted
    'Gopal,12345,Delhi',
    'Hari,2223 4567,Mumbai',           // truncated landline
    'Ira,,Goa',
    'Asha again,90000 00001,Pune',     // same person as row 2
    'Jai,0123456789,Delhi',            // invalid prefix
  ].join('\n');
  const up = await w.ok('source.upload', { kind: 'csv', name: 'edge.csv', text: csv });
  const map = await w.ok('source.map', { uploadId: up.uploadId });
  assert.equal(map.rowsTotal, 11);
  const v = Object.fromEntries(map.preview.map((p: any) => [p.row, p.verdict]));
  assert.deepEqual(v, { 2: 'new', 3: 'new', 4: 'new', 5: 'new', 6: 'SCI_NOTATION', 7: 'NON_INDIAN', 8: 'TOO_SHORT', 9: 'LANDLINE_TRUNCATED', 10: 'EMPTY', 11: 'duplicate_in_file', 12: 'INVALID_PREFIX' });
  assert.deepEqual(map.phones, { ok: 4, duplicatesInFile: 1, rejected: { SCI_NOTATION: 1, NON_INDIAN: 1, TOO_SHORT: 1, LANDLINE_TRUNCATED: 1, EMPTY: 1, INVALID_PREFIX: 1 } });
  assert.ok(map.questions.some((q: string) => q.includes('outside India')));
  const res = await w.ok('source.commit', { uploadId: up.uploadId });
  assert.equal(res.counts.new, 4);
  assert.equal(res.counts.rejected, 6);
  assert.equal(res.counts.duplicate_in_file, 1);
  assert.equal(res.rowsOk, 4);
  const dev = await w.contactBy('+919000000004');
  assert.equal(dev?.name, 'Dev');
  // The later duplicate row wins its name; the earlier spelling stays an alias.
  const asha = await w.contactBy('+919000000001');
  assert.equal(asha?.name, 'Asha again');
  const aliases = await many<{ raw: string }>(pool, 'SELECT raw FROM contact_identifier WHERE contact_id = $1 ORDER BY raw', [asha!.id]);
  assert.deepEqual(aliases.map(a => a.raw), ['+91 90000 00001', '90000 00001']);
  const r = await w.ok('source.receipt', { receiptId: res.receiptId });
  assert.equal(r.rows_total, 11);
  assert.ok(r.summary.issues.some((i: any) => i.row === 6 && i.code === 'SCI_NOTATION'));
  assert.ok(r.summary.fileSha256 && r.summary.mappingSha256);
  // A committed upload cannot be imported twice.
  const again = await w.call('source.commit', { uploadId: up.uploadId });
  assert.equal(again.status, 'not_executed');
});

test('identity documents are never stored; Hindi headers import', { skip }, async () => {
  const w = await workspace();
  const res = await w.importText('नाम,मोबाइल,भाषा,Aadhaar No\nAsha,9000000011,हिंदी,1234 5678 9012\n');
  assert.equal(res.counts.new, 1);
  const c = await w.contactBy('+919000000011');
  assert.equal(c?.language, 'hi');
  const keys = await many<{ key: string }>(pool, 'SELECT key FROM attribute WHERE contact_id = $1 ORDER BY key', [c!.id]);
  assert.deepEqual(keys.map(k => k.key), ['language', 'name']);
});

test('dedupe and authority across uploads and a CRM webhook', { skip }, async () => {
  const w = await workspace();
  const a = await w.importText('phone,name,amount_due,plan,language\n9000000021,Asha,100,gold,hi\n');
  assert.equal(a.counts.new, 1);
  const cid = (await w.contactBy('+919000000021'))!.id;
  const crm = await w.ok('source.upload', { kind: 'crm', name: 'CRM' });
  const ev = { eventId: 'e1', contacts: [{ phone: '+91 90000 00021', attributes: { amount_due: 200 }, language: 'English' }] };
  const r1 = await fetch(`${base}/hooks/contacts/${crm.sourceId}`, { method: 'POST', headers: { 'content-type': 'application/json', ...signHook(crm.secret, JSON.stringify(ev)) }, body: JSON.stringify(ev) });
  assert.equal(r1.status, 200);
  const b1 = await r1.json() as any;
  assert.equal(b1.result.counts.updated, 1);
  assert.equal(b1.result.counts.conflict_review, 1, 'language: CRM and upload rank equal on a self subject, from different sources');
  assert.deepEqual(await w.attr(cid, 'amount_due'), { value: 200, authority: 'crm' });
  assert.equal((await w.attr(cid, 'language'))!.value, 'hi');
  // A new file in a different source cannot overwrite the fresher, more authoritative CRM amount.
  const b = await w.importText('phone,amount_due\n09000000021,300\n');
  assert.equal(b.counts.kept_more_authoritative, 1);
  assert.equal(b.counts.unchanged, 1);
  assert.equal((await w.attr(cid, 'amount_due'))!.value, 200);
  // The same source, later: its newer value wins.
  const c = await w.importText('phone,plan\n9000000021,silver\n', {}, a.sourceId);
  assert.equal(c.counts.updated, 1);
  assert.equal((await w.attr(cid, 'plan'))!.value, 'silver');
  // An older CRM event cannot overwrite a newer value.
  const old = { eventId: 'e2', occurredAt: '2020-01-01T00:00:00Z', contacts: [{ phone: '9000000021', attributes: { amount_due: 50 } }] };
  const r2 = await fetch(`${base}/hooks/contacts/${crm.sourceId}`, { method: 'POST', headers: { 'content-type': 'application/json', ...signHook(crm.secret, JSON.stringify(old)) }, body: JSON.stringify(old) });
  assert.equal(((await r2.json()) as any).result.counts.kept_newer, 1);
  // Once the CRM value is past its max age, a fresh upload replaces it.
  await pool.query("UPDATE attribute SET observed_at = now() - interval '3 days' WHERE contact_id = $1 AND key = 'amount_due'", [cid]);
  const d = await w.importText('phone,amount_due\n9000000021,310\n');
  assert.equal(d.counts.updated, 1);
  assert.deepEqual(await w.attr(cid, 'amount_due'), { value: 310, authority: 'upload' });
  assert.equal(Number((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM contact WHERE workspace_id = $1', [w.ws]))!.n), 1, 'one person throughout');
  const g = await w.ok('contact.get', { id: cid });
  assert.equal(g.conflicts.length, 1);
});

test('consent is append-only: grants and withdrawals add rows; updates and deletes are refused', { skip }, async () => {
  const w = await workspace();
  const res = await w.importText('phone,consent,consent date\n9000000031,yes,01/10/2026\n9000000032,no,\n9000000033,maybe,\n', { consentPurpose: 'renewal_reminder' });
  assert.equal(res.counts.consent_rows, 2);
  const cid = (await w.contactBy('+919000000031'))!.id;
  const ev = await one<{ evidence: any; granted: boolean; purpose: string }>(pool, 'SELECT evidence, granted, purpose FROM consent_record WHERE contact_id = $1', [cid]);
  assert.equal(ev!.granted, true);
  assert.equal(ev!.purpose, 'renewal_reminder');
  assert.equal(ev!.evidence.statedAt, '2026-10-01');
  await w.ok('consent.record', { contactId: cid, purpose: 'renewal_reminder', basis: 'withdrawal', granted: false, source: 'email' });
  const future = await w.call('consent.record', { contactId: cid, purpose: 'x1', basis: 'consent', granted: true, at: '2099-01-01T00:00:00Z' });
  assert.equal(future.status, 'not_executed');
  const rows = await many<{ id: string; granted: boolean }>(pool, 'SELECT id, granted FROM consent_record WHERE contact_id = $1 ORDER BY created_at, id', [cid]);
  assert.deepEqual(rows.map(r => r.granted), [true, false]);
  await assert.rejects(pool.query('UPDATE consent_record SET granted = true WHERE id = $1', [rows[1].id]), /append-only/);
  await assert.rejects(pool.query('DELETE FROM consent_record WHERE id = $1', [rows[0].id]), /append-only/);
  const facts = await w.ok('contact.dial_facts', { contactId: cid, purpose: 'renewal_reminder' });
  assert.equal(facts.consent.granted, false);
  assert.ok(facts.promotional.reasons.includes('consent_withdrawn'));
  // A consent column without a purpose records nothing and says so.
  const np = await w.importText('phone,consent\n9000000034,yes\n');
  assert.equal(np.counts.consent_rows, 0);
  assert.equal(np.counts.consent_without_purpose, 1);
});

test('suppression holds on re-import; opt-out columns and the A3 opt-out verb suppress; release needs approval', { skip }, async () => {
  const w = await workspace();
  const file = 'phone,name,do not call\n9000000041,Asha,\n9000000042,Bilal,yes\n';
  const a = await w.importText(file);
  assert.equal(a.counts.opt_outs, 1);
  assert.equal(a.counts.suppressed, 1);
  const asha = (await w.contactBy('+919000000041'))!.id;
  const s = await w.ok('contact.suppress', { contactId: asha, reason: 'asked by email' });
  assert.equal(s.already, false);
  const b = await w.importText(file.replace(',yes', ','));      // the second file no longer says do-not-call
  assert.equal(b.counts.suppressed, 2, 'import never clears a suppression');
  assert.equal(Number((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM suppression WHERE workspace_id = $1', [w.ws]))!.n), 2);
  // A number not yet on file can be suppressed, and an import of it then arrives suppressed.
  await w.ok('contact.suppress', { e164: '+91 90000 00043', reason: 'called the helpline' });
  const c = await w.importText('phone\n9000000043\n');
  assert.equal(c.counts.suppressed, 1);
  // The opt-out verb is A3 (it only lowers risk): VP itself and a member allowed to call it both run it at once.
  const sys = await reg.execute<any>(pool, 'contact.suppress_after_opt_out', { e164: '9000000044', quote: 'call mat karna' }, { workspaceId: w.ws, actor: { type: 'system' } });
  assert.equal(sys.status, 'confirmed');
  assert.equal((sys as any).mode, 'A3');
  const mem = await w.call('contact.suppress_after_opt_out', { contactId: asha });
  assert.equal(mem.status === 'confirmed' && (mem as any).mode, 'A3');
  // Release: a compliance member proposes, an owner approves; a builder cannot.
  const comp = await w.member('compliance');
  assert.equal((await w.call('contact.unsuppress', { suppressionId: s.suppressionId, reason: 'person asked to be called again' }, w.as('builder'))).status, 'not_executed');
  const prop = await w.call('contact.unsuppress', { suppressionId: s.suppressionId, reason: 'person asked to be called again' }, w.as('compliance', comp));
  await w.approve(prop);
  const f = await w.ok('contact.dial_facts', { contactId: asha });
  assert.equal(f.suppressions.length, 0);
});

test('DPDP erase leaves a tombstone and the suppression; re-import, webhook and dial facts all refuse the person', { skip }, async () => {
  const w = await workspace();
  await w.importText('phone,name,amount_due\n9000000051,Asha,100\n9000000052,Bilal,200\n', { audienceName: 'renewals' });
  const cid = (await w.contactBy('+919000000051'))!.id;
  await w.ok('consent.record', { contactId: cid, purpose: 'service', basis: 'consent', granted: true });
  await w.ok('contact.suppress', { contactId: cid, reason: 'asked' });
  const prop = await w.call('dpdp.request.execute', { contactId: cid, scope: 'erase_me', requestedBy: 'person', evidence: 'verified request on call' }, w.as('owner'));
  const out = await w.approve(prop);
  assert.equal(out.surfaces.contact, 'erased_in_place');
  const c = await one<{ e164: string; name: string | null; erased_at: Date | null }>(pool, 'SELECT e164, name, erased_at FROM contact WHERE id = $1', [cid]);
  assert.ok(c!.e164.startsWith('erased:') && c!.name === null && c!.erased_at);
  assert.equal(Number((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM attribute WHERE contact_id = $1', [cid]))!.n), 0);
  assert.equal(Number((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM tombstone WHERE workspace_id = $1', [w.ws]))!.n), 1);
  const supp = await many<{ e164: string | null; e164_hash: string | null }>(pool, 'SELECT e164, e164_hash FROM suppression WHERE workspace_id = $1', [w.ws]);
  assert.equal(supp.length, 1);
  assert.equal(supp[0].e164, null, 'the number itself is gone from the suppression');
  assert.ok(supp[0].e164_hash);
  assert.equal(Number((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM consent_record WHERE contact_id = $1', [cid]))!.n), 1, 'consent history is kept');
  assert.equal(Number((await one<{ n: string }>(pool, "SELECT count(*) AS n FROM forget_request WHERE workspace_id = $1 AND status = 'done'", [w.ws]))!.n), 1);
  // Re-import and webhook cannot resurrect the person.
  const again = await w.importText('phone,name\n+91 9000000051,Asha\n9000000052,Bilal\n');
  assert.equal(again.counts.tombstoned, 1);
  assert.equal(again.counts.new, 0);
  assert.equal(await w.contactBy('+919000000051'), null);
  const crm = await w.ok('source.upload', { kind: 'form', name: 'Website form' });
  const ev = { eventId: 'f1', contacts: [{ phone: '9000000051', name: 'Asha' }] };
  const r = await fetch(`${base}/hooks/contacts/${crm.sourceId}`, { method: 'POST', headers: { 'content-type': 'application/json', ...signHook(crm.secret, JSON.stringify(ev)) }, body: JSON.stringify(ev) });
  assert.equal(((await r.json()) as any).result.counts.tombstoned, 1);
  const f = await w.ok('contact.dial_facts', { e164: '09000000051' });
  assert.equal(f.tombstoned, true);
  assert.equal(f.service.allowed, false);
  assert.ok(f.suppressions.length === 1, 'the suppression still matches by hash');
  const g = await w.ok('contact.get', { id: cid });
  assert.equal(g.erased, true);
  // A destructive request needs an owner: compliance may propose but not approve.
  const comp = await w.member('compliance');
  const p2 = await w.call('dpdp.request.execute', { e164: '9000000052', scope: 'forget_memory', requestedBy: 'compliance', evidence: 'ticket 12' }, w.as('compliance', comp));
  assert.equal(p2.status, 'needs_approval');
  const denied = await reg.approve(pool, (p2 as any).actionId, { workspaceId: w.ws, memberId: comp });
  assert.equal(denied.status, 'not_executed');
});

test('webhook: HMAC per source, stale or wrong signatures refused, idempotent on event id', { skip }, async () => {
  const w = await workspace();
  const src = await w.ok('source.upload', { kind: 'whatsapp', name: 'WA opt-ins' });
  assert.ok(src.secret && src.hookUrl);
  const ev = { eventId: 'wa-1', contacts: [{ phone: '9000000061', name: 'Asha', consent: { purpose: 'order_updates', granted: true, channel: 'whatsapp' } }] };
  const post = (body: string, headers: Record<string, string>) => fetch(`${base}/hooks/contacts/${src.sourceId}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  const body = JSON.stringify(ev);
  assert.equal((await post(body, signHook('wrong-secret', body))).status, 401);
  assert.equal((await post(body, signHook(src.secret, body, Math.floor(Date.now() / 1000) - 3600))).status, 401);
  assert.equal((await post(body, {})).status, 401);
  assert.equal((await post(body.replace('wa-1', 'wa-2'), signHook(src.secret, body))).status, 401, 'a changed byte breaks the signature');
  assert.equal((await post(JSON.stringify(ev, null, 2), signHook(src.secret, body))).status, 401, 'signatures cover the exact bytes');
  const r1 = await post(body, signHook(src.secret, body));
  assert.equal(r1.status, 200);
  assert.equal(((await r1.json()) as any).duplicate, false);
  // The same event again (a sender retry, pretty-printed and freshly signed): applied once.
  const pretty = JSON.stringify(ev, null, 2);
  const r2 = await post(pretty, signHook(src.secret, pretty));
  assert.equal(r2.status, 200);
  const b2 = await r2.json() as any;
  assert.equal(b2.duplicate, true);
  assert.equal(b2.result.counts.new, 1);
  const cid = (await w.contactBy('+919000000061'))!.id;
  assert.equal(Number((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM consent_record WHERE contact_id = $1', [cid]))!.n), 1);
  // Form and WhatsApp sources speak for the person: their language beats an upload's.
  assert.equal((await one<{ authority: string }>(pool, "SELECT authority FROM attribute WHERE contact_id = $1 AND key = 'name'", [cid]))!.authority, 'person');
  assert.equal((await fetch(`${base}/hooks/contacts/00000000-0000-0000-0000-000000000000`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404);
  const audit = await one<{ n: string }>(pool, "SELECT count(*) AS n FROM audit_event WHERE workspace_id = $1 AND action = 'contact.webhook'", [w.ws]);
  assert.equal(audit!.n, '1');
  // A file source has no webhook.
  const file = await w.ok('source.upload', { kind: 'csv', name: 'f', text: 'phone\n9000000062\n' });
  assert.equal((await fetch(`${base}/hooks/contacts/${file.sourceId}`, { method: 'POST', headers: { 'content-type': 'application/json', ...signHook('x', JSON.stringify(ev)) }, body: JSON.stringify(ev) })).status, 404);
});

test('tenancy: another workspace cannot read or change these people, uploads, audiences or suppressions', { skip }, async () => {
  const a = await workspace();
  const b = await workspace();
  const res = await a.importText('phone,name\n9000000071,Asha\n', { audienceName: 'A list' });
  const cid = (await a.contactBy('+919000000071'))!.id;
  const up = await a.ok('source.upload', { kind: 'csv', name: 'x', text: 'phone\n9000000072\n' });
  const s = await a.ok('contact.suppress', { contactId: cid, reason: 'asked' });
  assert.equal((await b.call('contact.get', { id: cid })).status, 'not_executed');
  assert.equal((await b.ok('contact.list', {})).contacts.length, 0);
  assert.equal((await b.ok('contact.search', { q: '9000000071' })).contacts.length, 0);
  assert.equal((await b.call('contact.suppress', { contactId: cid, reason: 'x1' })).status, 'not_executed');
  assert.equal((await b.call('source.map', { uploadId: up.uploadId })).status, 'not_executed');
  assert.equal((await b.call('source.commit', { uploadId: up.uploadId })).status, 'not_executed');
  assert.equal((await b.call('source.receipt', { receiptId: res.receiptId })).status, 'not_executed');
  assert.equal((await b.call('audience.preview', { audienceId: res.audienceId })).status, 'not_executed');
  assert.equal((await b.call('consent.record', { contactId: cid, purpose: 'x1', basis: 'consent', granted: true })).status, 'not_executed');
  const un = await b.call('contact.unsuppress', { suppressionId: s.suppressionId, reason: 'not mine at all' });
  assert.equal(un.status, 'needs_approval');
  assert.equal((await reg.approve(pool, (un as any).actionId, { workspaceId: b.ws, memberId: b.owner })).status, 'not_executed');
  const er = await b.call('dpdp.request.execute', { contactId: cid, scope: 'erase_me', requestedBy: 'tenant', evidence: 'not mine' });
  assert.equal((await reg.approve(pool, (er as any).actionId, { workspaceId: b.ws, memberId: b.owner })).status, 'not_executed');
  // B importing the same number makes B's own person; A's is untouched and still suppressed.
  const bi = await b.importText('phone,name\n9000000071,Other\n');
  assert.equal(bi.counts.new, 1);
  assert.equal(bi.counts.suppressed, 0);
  assert.equal((await a.contactBy('+919000000071'))!.name, 'Asha');
  assert.equal((await a.ok('contact.dial_facts', { contactId: cid })).suppressions.length, 1);
  // A's upload via HTTP into B's source is refused.
  const bs = await b.ok('source.upload', { kind: 'csv', name: 'b' });
  const r = await fetch(base + '/v1/uploads/contacts', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-dev-member': a.owner }, body: JSON.stringify({ text: 'phone\n9000000073\n', sourceId: bs.sourceId }) });
  assert.equal(r.status, 404);
});

test('DND: unknown by default and fail-closed for promotional; provider fills status with checked_at; stale is unknown', { skip }, async () => {
  const w = await workspace();
  await w.importText('phone\n9000000081\n9000000082\n9000000083\n');
  const [c1, c2, c3] = await Promise.all(['+919000000081', '+919000000082', '+919000000083'].map(e => w.contactBy(e)));
  let f = await w.ok('contact.dial_facts', { contactId: c1!.id });
  assert.equal(f.dnd.status, 'unknown');
  assert.equal(f.service.allowed, true);
  assert.equal(f.promotional.allowed, false);
  assert.ok(f.promotional.reasons.includes('dnd_unknown'));
  setDndProvider(new FakeDndProvider(new Set(['+919000000082']), new Set(['+919000000083'])));
  try {
    const r = await w.ok('contact.dnd_refresh', { contactIds: [c1!.id, c2!.id, c3!.id] });
    assert.deepEqual({ checked: r.checked, registered: r.registered, not_registered: r.not_registered, unknown: r.unknown }, { checked: 3, registered: 1, not_registered: 1, unknown: 1 });
  } finally { setDndProvider(new DisabledDndProvider()); }
  f = await w.ok('contact.dial_facts', { contactId: c1!.id });
  assert.equal(f.dnd.status, 'not_registered');
  assert.ok(f.dnd.checkedAt);
  assert.equal(f.promotional.allowed, true);
  f = await w.ok('contact.dial_facts', { contactId: c2!.id });
  assert.ok(f.promotional.reasons.includes('dnd_registered_without_consent'));
  f = await w.ok('contact.dial_facts', { contactId: c3!.id });
  assert.ok(f.promotional.reasons.includes('dnd_unknown'));
  await pool.query("UPDATE dnd_status SET checked_at = now() - interval '8 days' WHERE contact_id = $1", [c1!.id]);
  f = await w.ok('contact.dial_facts', { contactId: c1!.id });
  assert.equal(f.dnd.status, 'unknown');
  assert.equal(f.promotional.allowed, false);
  // The disabled real adapter never claims a number is callable.
  const d = await w.ok('contact.dnd_refresh', { contactIds: [c1!.id] });
  assert.equal(d.provider, 'ncpr_disabled');
  assert.equal(d.unknown, 1);
});

test('audiences: saved filters over attributes, list audiences from an import, preview counts suppressed', { skip }, async () => {
  const w = await workspace();
  const res = await w.importText('phone,amount due,due date,language\n9000000091,100,05/11/2026,hi\n9000000092,250,10/11/2026,hi\n9000000093,400,20/11/2026,en\n', { audienceName: 'November' });
  await w.ok('contact.suppress', { e164: '9000000092', reason: 'asked' });
  const a = await w.ok('audience.create', { name: 'Hindi, over 150', filter: { all: [{ key: 'amount_due', op: 'gt', value: 150 }, { key: 'language', op: 'eq', value: 'hi' }] } });
  assert.equal(a.matched, 1);
  assert.equal(a.suppressed, 1);
  assert.equal(a.callable, 0);
  const due = await w.ok('audience.preview', { filter: { all: [{ key: 'due_date', op: 'lte', value: '2026-11-10' }] } });
  assert.equal(due.matched, 2);
  const anyOf = await w.ok('audience.preview', { filter: { any: [{ key: 'language', op: 'eq', value: 'en' }, { key: 'amount_due', op: 'lt', value: 150 }] } });
  assert.equal(anyOf.matched, 2);
  const list = await w.ok('audience.get', { id: res.audienceId });
  assert.equal(list.kind, 'list');
  assert.equal(list.matched, 3);
  assert.equal(list.dndUnknown, 3);
  assert.ok((await w.ok('audience.list', {})).audiences.length >= 2);
  const inj = await w.call('audience.create', { name: 'bad', filter: { all: [{ key: "x'; DROP TABLE contact; --", op: 'eq', value: 1 }] } });
  assert.equal(inj.status, 'not_executed');
  const page = await w.ok('contact.list', { audienceId: res.audienceId, suppressed: false });
  assert.equal(page.contacts.length, 2);
});

test('merge: A2, the merged number becomes an identifier, later imports of it land on the kept person', { skip }, async () => {
  const w = await workspace();
  await w.importText('phone,name,plan\n9000000101,Asha,gold\n9000000102,Asha S,\n');
  const k = (await w.contactBy('+919000000101'))!.id, m = (await w.contactBy('+919000000102'))!.id;
  await w.ok('consent.record', { contactId: m, purpose: 'service', basis: 'consent', granted: true });
  await w.ok('contact.suppress', { contactId: m, reason: 'asked' });
  const out = await w.approve(await w.call('contact.merge', { keepId: k, mergeId: m }));
  assert.equal(out.keptId, k);
  assert.equal(await w.contactBy('+919000000102'), null);
  assert.equal(Number((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM consent_record WHERE contact_id = $1', [k]))!.n), 1, 'consent moved, not lost');
  assert.equal((await w.ok('contact.dial_facts', { contactId: k })).suppressions.length, 1, 'suppression moved, not lost');
  const again = await w.importText('phone,plan\n9000000102,silver\n');
  assert.equal(again.counts.new, 0);
  assert.equal(Number((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM contact WHERE workspace_id = $1', [w.ws]))!.n), 1);
  assert.equal((await w.ok('contact.search', { q: '00102' })).contacts[0].id, k);
});

test('export: needs approval, escapes formulas, leaves out suppressed and erased people', { skip }, async () => {
  const w = await workspace();
  await w.importText('phone,name,plan\n9000000111,"=HYPERLINK(""http://x"")",gold\n9000000112,Bilal,silver\n9000000113,Chitra,gold\n');
  await w.ok('contact.suppress', { e164: '9000000112', reason: 'asked' });
  const p = await w.call('contact.export', { keys: ['plan'] });
  assert.equal(p.status, 'needs_approval');
  const out = await w.approve(p);
  assert.equal(out.rows, 2);
  const lines = out.csv.trim().split('\r\n');
  assert.equal(lines[0], 'phone,name,language,suppressed,plan');
  assert.ok(lines.some((l: string) => l.startsWith('+919000000111,"\'=HYPERLINK(')));
  assert.ok(!out.csv.includes('Bilal'));
  const stored = await one<{ result: any }>(pool, 'SELECT result FROM action WHERE id = $1', [(p as any).actionId]);
  assert.equal(stored!.result.csv, '[delivered to the approver]', 'personal data is not kept in the action log');
});

test('upload route: parts in order up to 20 MB, retries are no-ops, out-of-order refused, viewers cannot upload', { skip }, async () => {
  const w = await workspace();
  const post = (body: unknown, who = w.owner) => fetch(base + '/v1/uploads/contacts', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-dev-member': who }, body: JSON.stringify(body) });
  const p1 = await post({ text: 'phone\tname\n9000000121\tAsha\n', filename: 'list.tsv' });
  assert.equal(p1.status, 202);
  const { uploadId } = await p1.json() as any;
  assert.equal((await post({ uploadId, part: 1, text: 'phone\tname\n9000000121\tAsha\n' })).status, 202, 'retry of the last part');
  assert.equal((await post({ uploadId, part: 3, text: '9000000123\tChitra\n' })).status, 409);
  const p2 = await post({ uploadId, part: 2, text: '9000000122\tBilal\n', final: true });
  assert.equal(p2.status, 201);
  assert.equal(((await p2.json()) as any).status, 'received');
  assert.equal((await post({ uploadId, part: 3, text: 'x' })).status, 409, 'closed');
  const map = await w.ok('source.map', { uploadId });
  assert.equal(map.delimiter, 'tab');
  assert.equal((await w.ok('source.commit', { uploadId })).counts.new, 2);
  // One request may carry a whole file over 1 MB (raw text/csv), and the 20 MB ceiling holds for one request too.
  const rows = ['phone,name']; for (let i = 0; i < 60_000; i++) rows.push(`9001${String(i).padStart(6, '0')},Person ${i}`);
  const oneShot = await fetch(base + '/v1/uploads/contacts?filename=big.csv&final=1', { method: 'POST', headers: { 'content-type': 'text/csv', 'x-vp-dev-member': w.owner }, body: rows.join('\n') });
  assert.equal(oneShot.status, 201);
  assert.ok(((await oneShot.json()) as any).bytes > 1_000_000);
  const viewer = await w.member('viewer');
  assert.equal((await post({ text: 'phone\n9000000124\n' }, viewer)).status, 403);
  // Raw text/csv with an API-key-style client (dev auth here): fields in the query string.
  const raw = await fetch(base + '/v1/uploads/contacts?filename=r.csv&final=1', { method: 'POST', headers: { 'content-type': 'text/csv', 'x-vp-dev-member': w.owner }, body: 'phone\n9000000125\n' });
  assert.equal(raw.status, 201);
  // The 20 MB ceiling across parts: the part that crosses it is refused.
  const big = 'x'.repeat(4_000_000);
  const s1 = await post({ text: big });
  const id = ((await s1.json()) as any).uploadId;
  let last = 0;
  for (let i = 2; i <= 7; i++) { last = (await post({ uploadId: id, part: i, text: big })).status; if (last !== 202) break; }
  assert.equal(last, 413);
  // Last, because the server answers 413 without draining the body and that connection is then unusable.
  const tooBig = await fetch(base + '/v1/uploads/contacts?final=1', { method: 'POST', headers: { 'content-type': 'text/csv', 'x-vp-dev-member': w.owner }, body: 'x'.repeat(21 * 1024 * 1024) }).catch(() => null);
  assert.ok(!tooBig || tooBig.status === 413);
});

test('viewers see people with PII scrubbed', { skip }, async () => {
  const w = await workspace();
  await w.importText('phone,name\n9000000131,Asha Sharma\n');
  const v = await w.member('viewer');
  const l = await w.ok('contact.list', {}, w.as('viewer', v));
  assert.equal(l.contacts[0].e164, '+91•••••0131');
  assert.equal(l.contacts[0].name, 'AS.');
  assert.equal((await w.call('contact.suppress', { e164: '9000000131', reason: 'x1' }, w.as('viewer', v))).status, 'not_executed');
});
