// Sample packs: synthetic lists per starter agent that go through the real preview, verdicts and receipt; and "Add me as
// a test contact", which marks only the member's own verified phone. Synthetic data only (numbers 9000000000-9000000099).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { createPool, one, many } from '../server/db.ts';
import { buildApp } from '../server/app.ts';
import type { Registry, Actor } from '../server/tools.ts';
import { module as intake } from '../server/modules/intake/index.ts';
import { module as agents } from '../server/modules/agents/index.ts';
import { samplePacks, SAMPLE_ROWS } from '../server/modules/intake/samples.ts';
import { normaliseIndianPhone } from '../shared/phone.ts';
import { TEMPLATES } from '../server/modules/agents/templates.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, reg: Registry;

before(async () => {
  if (skip) return;
  process.env.VP_SECRET_KEY ??= randomBytes(32).toString('hex');   // a generated test value
  pool = createPool(URL_);
  reg = buildApp(pool, [intake, agents]).registry;
});
after(async () => { await pool?.end(); });

async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('samples test') RETURNING id"))!.id;
  const member = async (name: string | null) => (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, name, role, status) VALUES ($1,$2,$3,'owner','active') RETURNING id",
    [ws, `m${Math.random()}@example.test`, name]))!.id;
  const owner = await member('Asha Rao');
  const as = (id: string) => {
    const actor: Actor = { type: 'member', id, role: 'owner' };
    const call = (name: string, args: unknown) => reg.execute<any>(pool, name, args, { workspaceId: ws, actor });
    const ok = async (name: string, args: unknown) => { const r = await call(name, args); assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`); return (r as any).result; };
    return { call, ok };
  };
  return { ws, owner, member, as, ...as(owner) };
}

test('sample packs: seven synthetic lists, one per starter agent; numbers only in 9000000000-9000000099 and never shared between packs; each has a duplicate, opt-outs, a missing consent and mixed languages', () => {
  const packs = samplePacks(new Date('2026-10-24T06:00:00Z'));
  assert.equal(packs.length, 7);
  const seen = new Map<string, string>();
  for (const p of packs) {
    assert.ok(TEMPLATES.some(t => t.id === p.templateId), `${p.id}: ${p.templateId} is a starter agent`);
    assert.equal(p.rows.length, SAMPLE_ROWS);
    const nums = p.rows.map(r => normaliseIndianPhone(r[1]));
    assert.ok(nums.every(n => n.ok && /^\+9190000000\d\d$/.test(n.e164)), `${p.id}: every number valid and in range: ${p.rows.map(r => r[1]).join(' ')}`);
    const e164s = nums.map(n => (n as { e164: string }).e164);
    assert.equal(new Set(e164s).size, SAMPLE_ROWS - 1, `${p.id}: exactly one duplicate, written differently`);
    for (const e of new Set(e164s)) { assert.ok(!seen.has(e) || seen.get(e) === p.id, `${e} is in ${seen.get(e)} and ${p.id}`); seen.set(e, p.id); }
    const col = (h: string) => p.rows.map(r => r[p.headers.indexOf(h)]);
    assert.ok(col('Do not call').filter(v => v === 'yes').length >= 1, `${p.id}: someone opted out`);
    assert.ok(col('Call consent').includes(''), `${p.id}: one consent left unknown`);
    assert.ok(new Set(col('Language')).size >= 4, `${p.id}: mixed languages`);
    assert.ok(new Set(col('City')).size >= 8, `${p.id}: people from across regions`);
  }
});

test('every pack, checked against an agent made from its template, fills every per-contact fact the agent says; it imports through the real write path with a receipt', { skip }, async () => {
  const w = await world();
  for (const p of samplePacks()) {
    const agent = await w.ok('agent.create', { name: `${p.label} agent`, templateId: p.templateId });
    const up = await w.ok('source.sample.load', { packId: p.id });
    assert.equal(up.testRow, null);
    const map = await w.ok('source.map', { uploadId: up.uploadId, agentId: agent.agentId ?? agent.id });
    const missing = map.agentFacts.facts.filter((f: any) => f.status === 'missing');
    assert.deepEqual(missing, [], `${p.id}: the pack fills what the agent says from each record`);
    assert.equal(map.phones.duplicatesInFile, 1);
    assert.ok(map.notCallable.optedOut >= 1);
    const f = Object.fromEntries(map.columns.map((c: any) => [c.header, c.field]));
    assert.equal(f['Mobile'], 'phone'); assert.equal(f['Call consent'], 'consent'); assert.equal(f['Do not call'], 'opt_out'); assert.equal(f['Language'], 'language');
  }
  // One pack all the way: the receipt is the ordinary one.
  const up = await w.ok('source.sample.load', { packId: 'insurance-renewal' });
  const r = await w.ok('source.commit', { uploadId: up.uploadId, consentPurpose: 'service', audienceName: 'Sample renewals' });
  assert.equal(r.rowsTotal, SAMPLE_ROWS);
  assert.ok(r.counts.opt_outs >= 1, 'opt-outs are suppressions');
  assert.ok(r.counts.duplicate_in_file === 1 || r.counts.updated + r.counts.unchanged >= 1, `the duplicate is handled by the ordinary dedupe: ${JSON.stringify(r.counts)}`);
  const receipt = await w.ok('source.receipt', { receiptId: r.receiptId });
  assert.equal(receipt.filename, 'Sample: Health insurance renewals');
  const due = await one<{ value: unknown }>(pool, "SELECT a.value FROM attribute a JOIN contact c ON c.id = a.contact_id WHERE c.workspace_id = $1 AND a.key = 'renewal_due' LIMIT 1", [w.ws]);
  assert.match(String(due!.value), /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/, 'the due date is kept as a detail the agent can say');
  assert.equal(Number((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM contact WHERE workspace_id = $1 AND test_member_id IS NOT NULL', [w.ws]))!.n), 0, 'no test contact without "Add me"');
});

test('"Add me as a test contact": only a verified phone; only the member who asked; checked again when saving; a file can never mark one', { skip }, async () => {
  const w = await world();
  const other = await w.member('Other Member');
  // Not verified yet: refused in plain words.
  let r = await w.call('source.sample.load', { packId: 'emi-reminder', includeMe: true });
  assert.equal(r.status, 'not_executed');
  assert.match((r as any).reason, /verify your own phone first/);
  await pool.query('INSERT INTO verified_test_phone (workspace_id, member_id, e164, verified_at) VALUES ($1,$2,$3,now()), ($1,$4,$5,now())', [w.ws, w.owner, '+919000000099', other, '+919000000098']);
  const list = await w.ok('source.sample.list', {});
  assert.equal(list.testPhone, '+91•••••0099', 'masked, and only my own');
  assert.equal(list.packs.length, 7);
  const up = await w.ok('source.sample.load', { packId: 'emi-reminder', includeMe: true });
  assert.equal(up.rows, SAMPLE_ROWS + 1);
  assert.equal(up.testRow, SAMPLE_ROWS + 2, 'the last row (after the header) is me');
  const map = await w.ok('source.map', { uploadId: up.uploadId, previewRows: 20 });
  assert.ok(map.preview.some((x: any) => x.phone === '+919000000099'), 'my number is in the preview like any row');
  await w.ok('source.commit', { uploadId: up.uploadId, consentPurpose: 'transactional' });
  const flagged = await many<{ e164: string; test_member_id: string; name: string }>(pool, 'SELECT e164, test_member_id, name FROM contact WHERE workspace_id = $1 AND test_member_id IS NOT NULL', [w.ws]);
  assert.deepEqual(flagged.map(f => [f.e164, f.test_member_id, f.name]), [['+919000000099', w.owner, 'Asha Rao']], "only my phone, marked as mine; the other member's verified phone is untouched");
  // Verification removed between loading and saving: the mark is not given.
  const w2 = await world();
  await pool.query('INSERT INTO verified_test_phone (workspace_id, member_id, e164, verified_at) VALUES ($1,$2,$3,now())', [w2.ws, w2.owner, '+919000000097']);
  const up2 = await w2.ok('source.sample.load', { packId: 'cod-confirmation', includeMe: true });
  await pool.query('UPDATE verified_test_phone SET verified_at = NULL WHERE workspace_id = $1', [w2.ws]);
  await w2.ok('source.commit', { uploadId: up2.uploadId });
  assert.equal((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM contact WHERE workspace_id = $1 AND test_member_id IS NOT NULL', [w2.ws]))!.n, '0');
  // A file holding a verified number does not mark it: only the sample flow's "Add me" can.
  const w3 = await world();
  await pool.query('INSERT INTO verified_test_phone (workspace_id, member_id, e164, verified_at) VALUES ($1,$2,$3,now())', [w3.ws, w3.owner, '+919000000096']);
  const f = await w3.ok('source.upload', { kind: 'csv', name: 'My file', text: 'Name,Mobile\nAsha Rao,9000000096\n', filename: 'mine.csv' });
  await w3.ok('source.commit', { uploadId: f.uploadId });
  assert.equal((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM contact WHERE workspace_id = $1 AND test_member_id IS NOT NULL', [w3.ws]))!.n, '0');
  // Another member cannot load "Add me" for someone else: it is always the caller's own phone.
  const theirs = await w.as(other).ok('source.sample.load', { packId: 'emi-reminder', includeMe: true });
  await w.as(other).ok('source.commit', { uploadId: theirs.uploadId });
  const now = await many<{ e164: string; test_member_id: string }>(pool, 'SELECT e164, test_member_id FROM contact WHERE workspace_id = $1 AND test_member_id IS NOT NULL ORDER BY e164', [w.ws]);
  assert.deepEqual(now.map(x => [x.e164, x.test_member_id]), [['+919000000098', other], ['+919000000099', w.owner]]);
});
