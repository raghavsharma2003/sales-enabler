// Verified outcomes from a file (calls/outcome-import.ts): preview first, then a person approves; each matched row becomes
// a verified outcome that outranks the AI's reading everywhere (conversation.outcome, which learning reads). Synthetic data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { FakeRuntime, setRuntime } from '../server/runtime-client.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { parseDay, parseOutcomeFile, parseOutcomeXlsx } from '../server/modules/calls/outcome-import.ts';
import { crc32, deflateRawSync } from 'node:zlib';
import { purgeTranscripts } from '../server/modules/memory/index.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, modules).registry; setRuntime(new FakeRuntime()); });
after(async () => { setRuntime(null); await pool?.end(); });

let phone = 9400000000;
async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('import test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values, verified_by)
    VALUES ($1,'renewal','Did they renew?','{paid,not_paid,promised}','{paid}','file') RETURNING id`, [ws]))!.id;
  const actor: Actor = { type: 'member', id: owner, role: 'owner' };
  const call = (name: string, args: unknown): Promise<any> => registry.execute<any>(pool, name, args, { workspaceId: ws, actor });
  const approve = (r: any): Promise<any> => registry.approve<any>(pool, r.actionId, { workspaceId: ws, memberId: owner });
  return { ws, owner, def, call, approve };
}
async function person(ws: string, o: { e164?: string; externalId?: string } = {}) {
  const e164 = o.e164 ?? `+91${phone++}`;
  const id = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,'Synthetic Person') RETURNING id", [ws, e164]))!.id;
  if (o.externalId) await pool.query("INSERT INTO attribute (contact_id, key, value) VALUES ($1,'external_id',$2)", [id, JSON.stringify(o.externalId)]);
  return { id, e164, national: e164.slice(3) };
}
/** A finished call that started `daysBefore` days before 2026-10-20 (IST noon), optionally with an AI guess. */
async function callWith(ws: string, contact: string, daysBefore: number, o: { ai?: string; def?: string; channel?: string } = {}) {
  const id = (await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, contact_id, channel, status, started_at, ended_at)
    VALUES ($1,$2,$3,'done', timestamptz '2026-10-20 12:00+05:30' - make_interval(days => $4), timestamptz '2026-10-20 12:03+05:30' - make_interval(days => $4)) RETURNING id`,
    [ws, contact, o.channel ?? 'phone', daysBefore]))!.id;
  if (o.ai) await pool.query("INSERT INTO outcome (workspace_id, conversation_id, contact_id, definition_id, value, grade, source, evidence) VALUES ($1,$2,$3,$4,$5,'ai_guess','analysis','{}')",
    [ws, id, contact, o.def, o.ai]);
  return id;
}
const verifiedCount = async (ws: string) => Number((await one<{ n: string }>(pool, "SELECT count(*) AS n FROM outcome WHERE workspace_id = $1 AND grade = 'verified'", [ws]))!.n);

test('file parsing: header synonyms, Indian dates, and a plain refusal when a column is missing', () => {
  const rows = parseOutcomeFile('﻿Mobile Number,Status,Paid On,Amount,Txn ID\n9000000001,Paid,20/10/2026,"1,200",TX-1\n9000000002,Not Paid,2026-10-19,,\n');
  assert.deepEqual(rows[0], { row: 2, phone: '9000000001', externalId: undefined, value: 'paid', date: '2026-10-20', amount: '1,200', reference: 'TX-1' });
  assert.equal(rows[1].value, 'not_paid');
  assert.equal(parseDay('31/02/2026'), null);
  assert.throws(() => parseOutcomeFile('name,amount\nA,1\n'), /needs a phone or external id column, an outcome column, a date column/);
});

test('the window holds; a preview writes nothing; approval writes only matched rows, minimises the file, and outranks the AI', { skip }, async () => {
  const w = await workspace();
  const near = await person(w.ws), far = await person(w.ws), after_ = await person(w.ws), viaId = await person(w.ws, { externalId: 'CUST-77' }), twice = await person(w.ws);
  const nearCall = await callWith(w.ws, near.id, 10, { ai: 'promised', def: w.def });
  await callWith(w.ws, far.id, 20);                                                  // outside 14 days
  await callWith(w.ws, after_.id, -2);                                               // after the row's date
  const idCall = await callWith(w.ws, viaId.id, 3, { ai: 'paid', def: w.def });
  await callWith(w.ws, twice.id, 2); await callWith(w.ws, twice.id, 5);              // two calls in the window
  await callWith(w.ws, near.id, 1, { channel: 'test' });                             // test calls never count
  await pool.query("INSERT INTO outcome (workspace_id, conversation_id, contact_id, definition_id, value, grade, source, evidence) VALUES ($1,$2,$3,$4,'not_paid','manager','member:x','{}')", [w.ws, nearCall, near.id, w.def]);
  const csv = ['phone,external id,outcome,date,amount,reference',
    `${near.national},,paid,2026-10-20,1200,TX-${near.national}`, `${far.national},,paid,2026-10-20,,`, `${after_.national},,paid,2026-10-20,,`,
    `,CUST-77,paid,20/10/2026,,`, `${twice.national},,paid,2026-10-20,,`, `${near.national},,cancelled,2026-10-20,,`, `${near.national},,paid,next week,,`, '99999,,paid,2026-10-20,,'].join('\n');

  const pv = await w.call('outcome.import.preview', { fileName: 'renewals-oct.csv', csv, definitionId: w.def });
  assert.equal(pv.status, 'confirmed', JSON.stringify(pv));
  const byRow = new Map(pv.result.rows.map((r: any) => [r.row, r]));
  assert.deepEqual(pv.result.counts, { rows: 8, matched: 2, unmatched: 2, ambiguous: 1, invalid: 3, disagreements: 1 });
  assert.equal((byRow.get(2) as any).conversationId, nearCall);
  assert.match((byRow.get(3) as any).reason, /no call with this person in the 14 days up to 2026-10-20/);
  assert.equal((byRow.get(4) as any).status, 'unmatched', 'a call after the date is not the call that caused it');
  assert.equal((byRow.get(5) as any).conversationId, idCall, 'matched by the contact\'s external id');
  assert.match((byRow.get(6) as any).reason, /2 calls .* not written/);
  assert.match((byRow.get(7) as any).reason, /not one of this outcome's values/);
  assert.match((byRow.get(8) as any).reason, /date cannot be read/);
  assert.equal((byRow.get(9) as any).reason, 'the phone number cannot be read');
  assert.equal(await verifiedCount(w.ws), 0, 'a preview records nothing');

  const wide = await w.call('outcome.import.preview', { fileName: 'renewals-oct.csv', csv, definitionId: w.def, windowDays: 30 });
  assert.equal(wide.result.counts.matched, 3, 'a 30-day window reaches the 20-day-old call');

  const prop = await w.call('outcome.import', { importId: pv.result.importId });
  assert.equal(prop.status, 'needs_approval', 'recording verified outcomes is a policy action a person approves');
  assert.match(prop.summary, /Record 2 verified outcomes from renewals-oct.csv \(6 rows not written; the AI's reading disagrees on 1\)/);
  const done = await w.approve(prop);
  assert.equal(done.status, 'confirmed', JSON.stringify(done));
  assert.deepEqual({ written: done.result.counts.written, duplicates: done.result.counts.duplicates }, { written: 2, duplicates: 0 });
  assert.equal(await verifiedCount(w.ws), 2);

  // Verified outranks a manager's label and the AI's guess: conversation.outcome, which learning and the funnel read.
  assert.equal((await one<any>(pool, 'SELECT outcome FROM conversation WHERE id = $1', [nearCall]))!.outcome, 'paid');
  const page = await w.call('call.get', { conversationId: nearCall });
  assert.deepEqual({ ...page.result.verified, at: undefined }, { value: 'paid', from: 'renewals-oct.csv row 2', at: undefined, aiRead: 'promised', disagree: true });
  assert.equal((await w.call('call.get', { conversationId: idCall })).result.verified.disagree, false);

  const stored = (await one<any>(pool, 'SELECT status, rows FROM outcome_import WHERE id = $1', [pv.result.importId]))!;
  assert.equal(stored.status, 'committed');
  // Our own uuids are allowed (contact and call ids) and are masked first: a random uuid can hold "1200" (CI, 7bcdc7c).
  const kept = JSON.stringify(stored.rows).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>');
  assert.doesNotMatch(kept, new RegExp(`${near.national}|CUST-77|TX-|1200`), 'no phone, id, reference or amount stays on the import');
  const list = await w.call('outcome.import.list', {});
  assert.equal(list.result.imports.find((i: any) => i.id === pv.result.importId).counts.disagreements, 1, 'disagreement is counted and visible');

  const again = await w.approve(await w.call('outcome.import', { importId: pv.result.importId }));
  assert.equal(again.status, 'not_executed', 'a file is recorded once');
  const re = await w.call('outcome.import.preview', { fileName: 'renewals-oct-again.csv', csv, definitionId: w.def });
  assert.equal(re.result.counts.matched, 0, 'a call that already holds a verified outcome is not matched again');
  assert.match(re.result.rows[0].reason, /already has a verified outcome \(from renewals-oct.csv\)/);
});

test('the approval is bound to the match: a new call in the window since the preview voids it', { skip }, async () => {
  const w = await workspace();
  const p = await person(w.ws);
  await callWith(w.ws, p.id, 4);
  const pv = await w.call('outcome.import.preview', { fileName: 'oct.csv', csv: `phone,outcome,date\n${p.national},paid,2026-10-20\n`, definitionId: w.def });
  assert.equal(pv.result.counts.matched, 1);
  const prop = await w.call('outcome.import', { importId: pv.result.importId });
  await callWith(w.ws, p.id, 6);                                                     // now the row is ambiguous
  const r = await w.approve(prop);
  assert.equal(r.status, 'not_executed');
  assert.match(r.reason, /changed since it was proposed/);
  assert.equal(await verifiedCount(w.ws), 0);
});

test('two rows for one call are both ambiguous; another workspace\'s contact and call are never matched', { skip }, async () => {
  const a = await workspace(), b = await workspace();
  const shared = '+919499999901';
  const inB = await person(b.ws, { e164: shared, externalId: 'CUST-1' });
  await callWith(b.ws, inB.id, 2);
  const inA = await person(a.ws);
  await callWith(a.ws, inA.id, 2);
  const csv = `phone,external id,outcome,date\n9499999901,,paid,2026-10-20\n,CUST-1,paid,2026-10-20\n${inA.national},,paid,2026-10-20\n${inA.national},,not_paid,2026-10-19\n`;
  const pv = await a.call('outcome.import.preview', { fileName: 'x.csv', csv, definitionId: a.def });
  const rows = pv.result.rows;
  assert.deepEqual(rows.slice(0, 2).map((r: any) => r.status), ['unmatched', 'unmatched'], "workspace B's person is invisible to A");
  assert.deepEqual(rows.slice(2).map((r: any) => r.status), ['ambiguous', 'ambiguous']);
  assert.match(rows[2].reason, /rows 4 and 5 match the same call/);
  const done = await a.approve(await a.call('outcome.import', { importId: pv.result.importId }));
  assert.equal(done.result.counts.written, 0);
  assert.equal(await verifiedCount(a.ws) + await verifiedCount(b.ws), 0);
  const cross = await b.call('outcome.import', { importId: pv.result.importId });
  assert.equal((await b.approve(cross)).status, 'not_executed', "B cannot record A's import");
  assert.equal((await b.call('outcome.import.preview', { fileName: 'y.csv', csv: 'phone,outcome,date\n9499999901,paid,2026-10-20\n', definitionId: a.def })).status, 'not_executed',
    "B cannot use A's outcome definition");
});

test("erasure: the person's verified rows lose reference and amount, and their pending preview rows lose the identifiers", { skip }, async () => {
  const w = await workspace();
  const p = await person(w.ws), q = await person(w.ws);
  const c = await callWith(w.ws, p.id, 3), d = await callWith(w.ws, q.id, 3);
  const csv = `phone,outcome,date,amount,reference\n${p.national},paid,2026-10-20,1500,TX-P\n${q.national},paid,2026-10-20,900,TX-Q\n`;
  await w.approve(await w.call('outcome.import', { importId: (await w.call('outcome.import.preview', { fileName: 'a.csv', csv, definitionId: w.def })).result.importId }));
  const pending = (await w.call('outcome.import.preview', { fileName: 'b.csv', csv, definitionId: w.def })).result.importId;
  const er = await w.approve(await w.call('dpdp.request.execute', { contactId: p.id, scope: 'erase_me', requestedBy: 'person', evidence: 'verified request (synthetic)' }));
  assert.equal(er.status, 'confirmed', JSON.stringify(er));
  await purgeTranscripts(pool, { workspaceId: w.ws });

  const ev = async (conv: string) => (await one<any>(pool, "SELECT value, evidence FROM outcome WHERE conversation_id = $1 AND grade = 'verified'", [conv]))!;
  const gone = await ev(c);
  assert.equal(gone.value, 'paid', 'the business result stays');
  assert.equal(gone.evidence.amount, undefined); assert.equal(gone.evidence.reference, undefined);
  assert.equal(gone.evidence.redacted, 'erased');
  assert.deepEqual([(await ev(d)).evidence.amount, (await ev(d)).evidence.reference], ['900', 'TX-Q'], "someone else's row is untouched");
  const rows = (await one<any>(pool, 'SELECT rows FROM outcome_import WHERE id = $1', [pending]))!.rows;
  assert.doesNotMatch(JSON.stringify(rows.find((r: any) => r.contactId === p.id)), new RegExp(`${p.national}|TX-P|1500`));
  assert.match(JSON.stringify(rows.find((r: any) => r.contactId === q.id)), /TX-Q/);
  const r = await w.approve(await w.call('outcome.import', { importId: pending }));
  assert.equal(r.result.counts.written, 0, 'the erased person is unmatched now, and the other call already holds its verified outcome');
});

// A minimal .xlsx: inline strings, and date cells styled dd/mm/yyyy (Excel serials), first sheet only.
function zip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), body = deflateRawSync(f.data), crc = crc32(f.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(f.data.length, 22); local.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(f.data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(offset, 42);
    parts.push(local, name, body); central.push(cd, name);
    offset += 30 + name.length + body.length;
  }
  const cdBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}
function xlsx(rows: (string | { date: number })[][]): Buffer {
  const X = (x: string) => Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + x);
  const col = (i: number) => String.fromCharCode(65 + i);
  const body = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((c, ci) => typeof c === 'string'
    ? `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${c}</t></is></c>` : `<c r="${col(ci)}${ri + 1}" s="1"><v>${c.date}</v></c>`).join('') + '</row>').join('');
  return zip([
    { name: '[Content_Types].xml', data: X('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>') },
    { name: '_rels/.rels', data: X('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: X('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Results" sheetId="1" r:id="rId7"/></sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: X('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { name: 'xl/styles.xml', data: X('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>') },
    { name: 'xl/worksheets/sheet1.xml', data: X(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`) },
  ]);
}
const serial = (iso: string) => (Date.parse(iso + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86_400_000;

test('an Excel file is read by intake\'s reader: date cells become dates and the rows match like a CSV', { skip }, async () => {
  const w = await workspace();
  const p = await person(w.ws);
  const conv = await callWith(w.ws, p.id, 2);
  const book = xlsx([['Mobile', 'Result', 'Paid On'], [p.national, 'Paid', { date: serial('2026-10-20') }]]);
  assert.deepEqual(parseOutcomeXlsx(book).map(r => [r.row, r.value, r.date]), [[2, 'paid', '2026-10-20']]);
  const pv = await w.call('outcome.import.preview', { fileName: 'results.xlsx', xlsxBase64: book.toString('base64'), definitionId: w.def });
  assert.equal(pv.status, 'confirmed', JSON.stringify(pv));
  assert.equal(pv.result.rows[0].conversationId, conv);
  const both = await w.call('outcome.import.preview', { fileName: 'x', csv: 'a', xlsxBase64: book.toString('base64'), definitionId: w.def });
  assert.equal(both.status, 'not_executed');
  const notExcel = await w.call('outcome.import.preview', { fileName: 'x.xlsx', xlsxBase64: Buffer.from('plain text, not a workbook').toString('base64'), definitionId: w.def });
  assert.match(notExcel.reason, /not an Excel/);
});
