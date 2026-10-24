// Buyer walkthrough round 2 (research/2026-10-24/walkthrough/FRICTION.md):
//  R2 launch warns when the list prefers languages the agent does not speak (a warning, never a blocker);
//  R3 every per-contact fact the list cannot fill is named at launch and in the import preview, with likely columns,
//     and nothing is auto-mapped;
//  R8 the publish card says what goes live: the agent, the voice stack, the last practice call and what changed.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { factColumns } from '../server/modules/agents/columns.ts';
import { TEMPLATES } from '../server/modules/agents/templates.ts';

const emi = TEMPLATES.find(t => t.id === 'lending-emi-reminder')!.config;

test('R3: per-contact facts match columns by key only; likely columns are suggested, never mapped', () => {
  const cols = [{ key: 'emi_amount', header: 'EMI amount' }, { key: 'due_date', header: 'Due date' }, { key: 'city', header: 'City' }];
  const r = factColumns(emi, cols);
  const by = Object.fromEntries(r.map(f => [f.key, f]));
  assert.equal(by.borrower.status, 'name', 'the name comes from the contact name');
  assert.deepEqual([by.emi_amount.status, by.emi_amount.column], ['matched', 'EMI amount']);
  assert.equal(by.emi_due.status, 'missing', 'a similar column is not a match: the dial-time fill uses the exact key');
  assert.deepEqual(by.emi_due.suggestions, ['Due date']);
  assert.equal(by.loan.status, 'missing');
  assert.ok(!by.loan.suggestions.includes('City'));
});

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(URL_); registry = buildApp(pool, modules).registry; });
after(async () => { await pool?.end(); });
afterEach(() => setFakeLlm(null));

const HEX = /[0-9a-f]{8,}/i;

async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('walkthrough r2') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `r2${Math.random()}@example.test`]))!.id;
  const as = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
  const call = async (name: string, args: unknown) => {
    const r: any = await registry.execute(pool, name, args, as);
    if (r.status === 'needs_approval') return registry.approve<any>(pool, r.actionId, { workspaceId: ws, memberId: owner });
    return r;
  };
  const ok = async (name: string, args: unknown) => { const r: any = await call(name, args); assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`); return r.result; };
  return { ws, owner, as, call, ok };
}

test('R2 and R3 at launch: languages warn without blocking; unfilled per-contact facts block, naming the likely column', { skip }, async () => {
  const w = await world();
  const a = await w.ok('agent.create', { name: 'EMI reminders', templateId: 'lending-emi-reminder' });
  const set = await w.ok('stack.set', { agentId: a.agentId, stackId: 'v2-flashlite' });
  const v = await w.ok('version.publish', { agentId: a.agentId, draftHash: set.draftHash });
  const audience = (await one<{ id: string }>(pool, "INSERT INTO audience (workspace_id, name) VALUES ($1, 'Deccan list') RETURNING id", [w.ws]))!.id;
  const langs = ['kn-IN', 'Bengali', 'ta', 'te-IN', 'hi-IN', null];
  for (const [i, lang] of langs.entries()) {
    const c = (await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164, name, language) VALUES ($1,$2,$3,$4) RETURNING id', [w.ws, `+9190000000${10 + i}`, `Person ${i}`, lang]))!.id;
    await pool.query('INSERT INTO audience_member (audience_id, contact_id) VALUES ($1,$2)', [audience, c]);
    await pool.query(`INSERT INTO attribute (contact_id, key, value) VALUES ($1,'emi_amount','"4,200"'), ($1,'due_date','"5 November"'), ($1,'loan','"two-wheeler loan ending 0042"')`, [c]);
  }
  const d = await w.ok('campaign.draft', { name: 'EMI November', category: 'transactional', agentVersionId: v.versionId, capInrMilli: 5_000_000 });
  await pool.query('UPDATE campaign SET audience_id = $2 WHERE id = $1', [d.id, audience]);

  const g = await w.ok('campaign.get', { id: d.id });
  const lang = g.warnings.find((x: { code: string }) => x.code === 'language_mismatch');
  assert.ok(lang, JSON.stringify(g.warnings));
  assert.equal(lang.message, '4 of 6 people prefer a language this agent does not speak (Bengali, Kannada, Tamil, Telugu).');
  assert.equal(lang.fix.tool, 'version.language_variant', 'the fix is a language version of the agent');
  assert.ok(!g.blockers.some((b: { code: string }) => b.code === 'language_mismatch'), 'a language mismatch never blocks launch');

  const facts = g.blockers.find((b: { code: string }) => b.code === 'per_contact_fact_unmapped');
  assert.ok(facts, JSON.stringify(g.blockers));
  assert.match(facts.message, /emi due \(maybe the "due_date" column\)/);
  assert.doesNotMatch(facts.message, /emi amount|loan|borrower/, 'matched facts and the name are not listed');
  assert.equal(facts.fix.tool, 'source.map');
  assert.ok(!HEX.test(facts.message + lang.message));

  // Once the column carries the fact's key (the member's mapping), the blocker goes.
  await pool.query(`INSERT INTO attribute (contact_id, key, value) SELECT contact_id, 'emi_due', value FROM attribute WHERE key = 'due_date' AND contact_id IN (SELECT contact_id FROM audience_member WHERE audience_id = $1)`, [audience]);
  const g2 = await w.ok('campaign.get', { id: d.id });
  assert.ok(!g2.blockers.some((b: { code: string }) => b.code === 'per_contact_fact_unmapped'), JSON.stringify(g2.blockers));
});

test('R3 in the import preview: source.map with agentId lists unmatched facts and asks, without mapping them', { skip }, async () => {
  const w = await world();
  const a = await w.ok('agent.create', { name: 'EMI reminders', templateId: 'lending-emi-reminder' });
  const up = await w.ok('source.upload', { kind: 'csv', name: 'deccan.csv', text: 'Name,Phone,EMI amount,Due date,Loan\nAsha,9000000021,"4,200",5 November,two-wheeler\n' });
  const m = await w.ok('source.map', { uploadId: up.uploadId, agentId: a.agentId });
  const by = Object.fromEntries(m.agentFacts.facts.map((f: { key: string }) => [f.key, f]));
  assert.equal(m.agentFacts.agent, 'EMI reminders');
  assert.equal(by.emi_amount.status, 'matched');
  assert.equal(by.loan.status, 'matched');
  assert.deepEqual([by.emi_due.status, by.emi_due.suggestions[0]], ['missing', 'Due date']);
  assert.match(m.questions[0], /EMI reminders says emi due \(maybe the "Due date" column\)/);
  assert.ok(!m.columns.some((c: { key?: string }) => c.key === 'emi_due'), 'nothing is auto-mapped');
  const plain = await w.ok('source.map', { uploadId: up.uploadId });
  assert.equal(plain.agentFacts, undefined, 'without an agent the preview is unchanged');
});

test('R8: the publish card names the agent, the stack, the last practice call and the field changes, with no ids', { skip }, async () => {
  const w = await world();
  const a = await w.ok('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' });
  const set = await w.ok('stack.set', { agentId: a.agentId, stackId: 'v2-flashlite' });
  const p1: any = await registry.execute(pool, 'version.publish', { agentId: a.agentId, draftHash: set.draftHash }, w.as);
  assert.equal(p1.status, 'needs_approval');
  assert.match(p1.summary, /^Publish Renewals, version 1\. Voice: .+?\. No practice call has been run\. This is the first version\. AI-honesty review: rules only \(no model configured\)\.$/);
  await registry.approve(pool, p1.actionId, { workspaceId: w.ws, memberId: w.owner });

  await w.ok('brief.edit', { agentId: a.agentId, patch: [{ op: 'set', path: 'persona.energy', value: 5 }, { op: 'append', path: 'persona.notes', value: 'slows down for older callers' }] });
  setFakeLlm(req => ({ text: req.messages[0].content.startsWith('You are role-playing') ? 'haan, bye <hangup>' : 'Riya, Suraksha Health ki AI assistant. Bye! <end_call>',
    toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }));
  await w.ok('test.simulate', { agentId: a.agentId, simCallerId: 'default:busy_20s', maxTurns: 2 });
  const g = await w.ok('agent.get', { agentId: a.agentId });
  const p2: any = await registry.execute(pool, 'version.publish', { agentId: a.agentId, draftHash: g.draftHash, note: 'calmer for elders' }, w.as);
  const s: string = p2.summary;
  assert.match(s, /^Publish Renewals, version 2 \(calmer for elders\)\. /);
  assert.match(s, /Voice: .+?\. Last practice call/);
  assert.match(s, /Last practice call \(Busy, wants it in twenty seconds\): (passed|failed), \d+ of \d+ checks\./);
  assert.match(s, /Changes since version 1: persona energy: 3 to 5; added a persona note\./);
  assert.ok(!HEX.test(s), s);
});
