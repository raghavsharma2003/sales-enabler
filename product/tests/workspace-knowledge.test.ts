// Workspace module: knowledge ingest (text, PDF, DOCX), span approval, offerings with undo, brand.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { one } from '../server/db.ts';
import { addMember, boot, makeDocx, makePdf, skip, signup, type Booted } from './workspace-helpers.ts';

let b: Booted;
before(async () => { if (!skip) b = await boot(); });
after(async () => { await b?.close(); });

const PAGE1 = ['The Clinic offers a free first consultation of twenty minutes for every new patient.', 'Appointments can be moved up to two hours before the slot without any fee.',
  'Our reception is open from nine in the morning to seven in the evening, Monday to Saturday.'];
const PAGE2 = ['Lab reports are shared on WhatsApp within one working day of the sample being collected.', 'Parking is available behind the building for patients and visitors.'];

test('a small synthetic PDF becomes spans with page locations', { skip }, async () => {
  const owner = await signup(b);
  const up = await owner.fetch('POST', '/v1/uploads/knowledge', { filename: 'clinic-faq.pdf', contentBase64: makePdf([PAGE1, PAGE2]).toString('base64') });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const r = up.body.result;
  assert.equal(r.format, 'pdf');
  assert.equal(r.pages, 2);
  assert.ok(r.spanCount >= 2);
  const spans = (await owner.tool('knowledge.list', { sourceId: r.sourceId })).result.spans;
  const text = spans.map((s: any) => s.text).join('\n');
  assert.match(text, /free first consultation/);
  assert.match(text, /Lab reports are shared on WhatsApp/);
  assert.deepEqual([...new Set(spans.map((s: any) => s.location.page))].sort(), [1, 2], 'each span knows its page');
  assert.ok(spans.every((s: any) => s.status === 'pending' && Array.isArray(s.location.chars)));
  const again = await owner.fetch('POST', '/v1/uploads/knowledge', { filename: 'copy.pdf', contentBase64: makePdf([PAGE1, PAGE2]).toString('base64') });
  assert.equal(again.body.result.duplicate, true, 'the same file is not indexed twice');
  assert.equal(again.body.result.sourceId, r.sourceId);
});

test('a raw binary upload works with an API key (a session cookie must send JSON), ', { skip }, async () => {
  const owner = await signup(b);
  const k = await owner.run('apikey.create', { name: 'uploader' });
  const bearer = `Bearer ${(await owner.tool('secret.reveal', { revealId: k.result.revealId })).result.token}`;
  const post = (body?: Uint8Array, type = 'application/pdf', auth = bearer) =>
    fetch(b.base + '/v1/uploads/knowledge?filename=raw.pdf', { method: 'POST', headers: { authorization: auth, 'content-type': type }, body: body as any });
  const r = await post(new Uint8Array(makePdf([PAGE1])));
  const out = await r.json() as any;
  assert.equal(r.status, 201, JSON.stringify(out));
  assert.equal(out.result.format, 'pdf');
  assert.equal((await post()).status, 422, 'an empty body is refused');
  assert.equal((await post(new Uint8Array(makePdf([PAGE1])), 'application/pdf', 'Bearer vp_00000000_nope')).status, 401);
  const viaCookie = await fetch(b.base + '/v1/uploads/knowledge', { method: 'POST', headers: { cookie: owner.auth.cookie!, 'content-type': 'application/pdf' }, body: new Uint8Array(makePdf([PAGE1])) as any });
  assert.equal(viaCookie.status, 415, 'the kernel keeps cookie sessions to JSON bodies');
});

test('a small synthetic DOCX becomes spans with paragraph locations', { skip }, async () => {
  const owner = await signup(b);
  const paras = ['Plan A covers day-care procedures and hospital stays of more than a day.', 'Plan B adds maternity cover after a waiting period of nine months.', 'Claims are settled within fifteen days of the final bill.'];
  const up = await owner.fetch('POST', '/v1/uploads/knowledge', { filename: 'plans.docx', title: 'Plans', contentBase64: makeDocx(paras).toString('base64') });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal(up.body.result.format, 'docx');
  const spans = (await owner.tool('knowledge.list', { sourceId: up.body.result.sourceId })).result.spans;
  const all = spans.map((s: any) => s.text).join('\n\n');
  for (const p of paras) assert.ok(all.includes(p), p);
  assert.ok(spans[0].location.paragraphs[0] === 1);
  const src = (await owner.tool('knowledge.list')).result.sources[0];
  assert.equal(src.title, 'Plans');
  assert.equal(src.pending, src.spans);
});

test('plain text, big text, and files that are not documents', { skip }, async () => {
  const owner = await signup(b);
  const long = Array.from({ length: 60 }, (_, i) => `Point ${i + 1}: ` + 'we keep the explanation short and clear. '.repeat(8)).join('\n\n');
  const t = await owner.tool('knowledge.ingest', { title: 'Pasted', text: long });
  assert.equal(t.status, 'confirmed');
  assert.ok(t.result.spanCount > 10);
  const spans = (await owner.tool('knowledge.list', { sourceId: t.result.sourceId, limit: 5 })).result;
  assert.equal(spans.spans.length, 5);
  assert.equal(spans.nextAfter, 5);
  const next = (await owner.tool('knowledge.list', { sourceId: t.result.sourceId, after: spans.nextAfter, limit: 5 })).result;
  assert.equal(next.spans[0].ordinal, 6);

  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28])]);
  const bad = await owner.tool('knowledge.ingest', { contentBase64: png.toString('base64') });
  assert.equal(bad.status, 'not_executed');
  assert.match(bad.reason, /not plain text, PDF or DOCX/);
  const notPdf = await owner.tool('knowledge.ingest', { contentBase64: Buffer.from('%PDF-1.4\nthis is not really a pdf').toString('base64') });
  assert.equal(notPdf.status, 'not_executed');
  assert.match(notPdf.reason, /could not read this PDF/);
  const both = await owner.tool('knowledge.ingest', { text: 'a', contentBase64: 'YQ==' });
  assert.match(both.reason, /either text or a file/);
});

test('only approved spans can become facts; never-say is enforced; edits can be undone', { skip }, async () => {
  const owner = await signup(b);
  const up = await owner.tool('knowledge.ingest', { title: 'FAQ', text: PAGE1.join('\n\n') });
  const [span] = (await owner.tool('knowledge.list', { sourceId: up.result.sourceId })).result.spans;
  const fact = { text: 'First consultation is free', spanId: span.id, purposes: ['opening', 'price'] };

  const early = await owner.tool('offering.edit', { name: 'Consultation', facts: [fact] });
  assert.equal(early.status, 'not_executed');
  assert.match(early.reason, /pending; approve it in Knowledge/);

  const viewer = await addMember(b, owner, 'viewer'), builder = await addMember(b, owner, 'builder');
  assert.equal((await viewer.tool('knowledge.span.approve', { spanIds: [span.id] })).status, 'not_executed');
  const key = (await owner.run('apikey.create', { name: 'bot' }));
  const token = (await owner.tool('secret.reveal', { revealId: key.result.revealId })).result.token;
  const keyClient = new (owner.constructor as any)(b.base, { bearer: token }, undefined, owner.workspaceId);
  const byKey = await keyClient.tool('knowledge.span.approve', { spanIds: [span.id] });
  assert.match(byKey.reason, /signed-in person/, 'an API key cannot decide what the agent may say');
  assert.equal((await builder.tool('knowledge.span.approve', { spanIds: [span.id] })).status, 'confirmed');

  const made = await owner.tool('offering.edit', { name: 'Consultation', facts: [fact], neverSay: ['guaranteed cure'] });
  assert.equal(made.status, 'confirmed', JSON.stringify(made));
  const o = made.result.offering;
  assert.equal(o.facts[0].spanId, span.id);
  assert.match(o.facts[0].quote, /free first consultation/);
  assert.deepEqual(o.facts[0].purposes, ['opening', 'price']);
  assert.deepEqual(o.neverSay, ['guaranteed cure']);

  const banned = await owner.tool('offering.edit', { offeringId: o.id, facts: [{ ...fact, text: 'We promise a Guaranteed Cure' }] });
  assert.match(banned.reason, /never-say list/);
  assert.equal((await owner.tool('offering.edit', { offeringId: o.id, facts: [{ ...fact, purposes: [] }] })).status, 'not_executed');
  assert.equal((await owner.tool('offering.edit', { offeringId: o.id, facts: [{ ...fact, purposes: ['Bad Tag'] }] })).status, 'not_executed');

  const rename = await owner.tool('offering.edit', { offeringId: o.id, name: 'Free consultation' });
  assert.equal(rename.result.offering.name, 'Free consultation');
  assert.equal(rename.result.offering.facts.length, 1, 'facts are kept when only the name changes');

  const strike = await owner.tool('knowledge.span.approve', { spanIds: [span.id], decision: 'rejected' });
  assert.match(strike.reason, /backs a fact in the offering/);

  const undone = await owner.tool('action.undo', { revisionId: rename.result.revisionId });
  assert.equal(undone.status, 'confirmed', JSON.stringify(undone));
  assert.equal((await owner.tool('offering.list')).result.offerings[0].name, 'Consultation');
  assert.match((await owner.tool('action.undo', { revisionId: rename.result.revisionId })).reason, /already undone/);
  assert.equal((await owner.tool('action.undo', { revisionId: made.result.revisionId })).status, 'confirmed', 'the creation can be undone once the later edit is');
  assert.equal((await owner.tool('offering.list')).result.offerings.length, 0, 'an undone creation is archived, not deleted');
  const row = await one<{ archived_at: Date }>(b.pool, 'SELECT archived_at FROM offering WHERE id = $1', [o.id]);
  assert.ok(row!.archived_at);
});

test('undo refuses what it cannot undo, with the reason', { skip }, async () => {
  const owner = await signup(b);
  const first = await owner.tool('brand.update', { legalName: 'Sunrise Clinic Pvt Ltd', sector: 'health' });
  const second = await owner.tool('brand.update', { tone: 'warm and unhurried', website: 'https://example.test' });
  assert.equal(second.result.brand.legalName, 'Sunrise Clinic Pvt Ltd', 'fields not sent are kept');
  assert.match((await owner.tool('action.undo', { revisionId: first.result.revisionId })).reason, /newer change was made/);
  assert.match((await owner.tool('action.undo', { revisionId: first.result.revisionId })).reason, /undo that first/);
  assert.equal((await owner.tool('action.undo', { revisionId: second.result.revisionId })).status, 'confirmed');
  const b1 = (await owner.tool('brand.get')).result.brand;
  assert.equal(b1.tone, null);
  assert.equal(b1.legalName, 'Sunrise Clinic Pvt Ltd');
  assert.match((await owner.tool('action.undo', { revisionId: first.result.revisionId })).reason, /created the brand/);

  const cnap = await owner.run('brand.cnap_name.set', { cnapName: 'Sunrise Clinic' });
  assert.equal(cnap.status, 'confirmed');
  assert.equal((await owner.tool('brand.get')).result.brand.cnapName, 'Sunrise Clinic');
  assert.equal((await owner.tool('brand.cnap_name.set', { cnapName: '<script>' })).status, 'not_executed');
  const acts = (await owner.tool('activity.list', { actionPrefix: 'brand.cnap' })).result.items;
  const ev = acts.find((a: any) => a.action === 'brand.cnap_name.set');
  assert.match(ev.line, /^Asha Owner changed the caller name shown on calls \(approved\)$/);
  for (const act of ['brand.cnap_name.set', 'member.role.set', 'apikey.create', 'webhook.create']) {
    const e = await one<{ id: string }>(b.pool, 'SELECT id FROM audit_event WHERE workspace_id = $1 AND action = $2 ORDER BY created_at DESC LIMIT 1', [owner.workspaceId, act]);
    if (e) assert.match((await owner.tool('action.undo', { auditEventId: e.id })).reason, /not undone automatically|policy change|cannot be un-created/);
  }
  assert.match((await owner.tool('action.undo', {})).reason, /say which change/);
  assert.match((await owner.tool('action.undo', { revisionId: '00000000-0000-4000-8000-000000000000' })).reason, /no such change/);
  assert.match((await owner.tool('brand.update', {})).reason, /nothing to change/);
});
