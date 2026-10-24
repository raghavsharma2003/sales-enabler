// Knowledge on calls (must-be audit, brief 4): an agent linked to an offering states its approved facts in the brief,
// an offer-tagged fact never reaches a service brief (T-L3), the offering's never-say joins the agent's at the door,
// a rejected span's fact disappears, restore keeps the snapshot it was published with, and the budget still throws.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { factPurpose } from '../server/modules/agents/knowledge.ts';

test('offering tags map to fact purposes: anything priced or promotional is an offer', () => {
  assert.equal(factPurpose(['explain']), 'service');
  assert.equal(factPurpose(['price', 'explain']), 'offer');
  assert.equal(factPurpose(['offer']), 'offer');
  assert.equal(factPurpose(['next_step']), 'logistics');
});

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(); registry = buildApp(pool, modules).registry; });
after(async () => { await pool?.end(); });
afterEach(() => setFakeLlm(null));

async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('knowledge test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `kn${Math.random()}@example.test`]))!.id;
  const as = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
  const exec = (name: string, args: unknown) => registry.execute<any>(pool, name, args, as);
  const ok = async (name: string, args: unknown) => {
    let r: any = await exec(name, args);
    if (r.status === 'needs_approval') r = await registry.approve<any>(pool, r.actionId, { workspaceId: ws, memberId: owner });
    assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`);
    return r.result;
  };
  // Two approved spans from one source (the workspace builder's knowledge.ingest + span.approve, seeded directly).
  const src = (await one<{ id: string }>(pool, "INSERT INTO knowledge_source (workspace_id, kind, status) VALUES ($1, 'text', 'indexed') RETURNING id", [ws]))!.id;
  const span = async (ord: number, text: string) => (await one<{ id: string }>(pool,
    "INSERT INTO knowledge_span (workspace_id, source_id, ordinal, text, status) VALUES ($1,$2,$3,$4,'approved') RETURNING id", [ws, src, ord, text]))!.id;
  const sCover = await span(1, 'The family floater covers day-care procedures from the first day.');
  const sOffer = await span(2, 'Renew before the due date and get 5 percent off the premium.');
  const off = await ok('offering.edit', { name: 'Family Health Plus', neverSay: ['guaranteed claim approval'], facts: [
    { text: 'Day-care procedures are covered from the first day of the policy.', spanId: sCover, purposes: ['explain'] },
    { text: 'Renewing before the due date takes 5 percent off the premium.', spanId: sOffer, purposes: ['offer'] },
  ] });
  return { ws, owner, exec, ok, offeringId: off.offering.id as string, sCover, sOffer };
}

const COVER = /Day-care procedures are covered from the first day of the policy\./;
const OFFER = /5 percent off the premium/;

test('a linked offering\'s approved facts reach the brief; an offer never reaches a service brief, but does a sales one', { skip }, async () => {
  const w = await world();
  const svc = await w.ok('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' });
  const e = await w.ok('brief.edit', { agentId: svc.agentId, patch: [{ op: 'set', path: 'knowledge', value: { offeringIds: [w.offeringId] } }] });
  assert.equal(e.compiles, true, JSON.stringify(e.error));
  assert.match(e.brief.text, COVER);
  assert.doesNotMatch(e.brief.text, OFFER, 'T-L3: an offer fact never reaches a service brief');
  assert.ok(e.brief.dropped.some((k: string) => k.startsWith('kb1_family_health_plus_')), 'the dropped offer is reported');

  const promo = await w.ok('agent.create', { name: 'Solar', templateId: 'solar-lead-qualification' });
  const p = await w.ok('brief.edit', { agentId: promo.agentId, patch: [{ op: 'set', path: 'knowledge', value: { offeringIds: [w.offeringId] } }] });
  assert.match(p.brief.text, OFFER, 'a promotional call carries the offer');

  const only = await w.ok('brief.edit', { agentId: promo.agentId, patch: [{ op: 'set', path: 'knowledge.purposes', value: ['explain'] }] });
  assert.doesNotMatch(only.brief.text, OFFER, 'purposes limits which tagged facts are used (the offer is not tagged explain)');

  // The draft stores the link, never the materialised facts.
  const draft = (await one<{ draft: any }>(pool, 'SELECT draft FROM agent WHERE id = $1', [svc.agentId]))!.draft;
  assert.deepEqual(draft.knowledge, { offeringIds: [w.offeringId] });
  assert.ok(!draft.facts.some((f: { source: string }) => f.source.startsWith('kb:')));
  assert.ok(!draft.neverSay.includes('guaranteed claim approval'));
});

test('the published version carries the facts and the offering\'s never-say, which the door and the grader enforce', { skip }, async () => {
  const w = await world();
  const a = await w.ok('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' });
  await w.ok('brief.edit', { agentId: a.agentId, patch: [{ op: 'set', path: 'knowledge', value: { offeringIds: [w.offeringId] } }] });
  const s = await w.ok('stack.set', { agentId: a.agentId, stackId: 'v2-flashlite' });
  const v = await w.ok('version.publish', { agentId: a.agentId, draftHash: s.draftHash });
  const cfg = (await one<{ config: any }>(pool, 'SELECT config FROM agent_version WHERE id = $1', [v.versionId]))!.config;
  const kb = cfg.agent.facts.filter((f: { source: string }) => f.source.startsWith('kb:'));
  assert.deepEqual(kb.map((f: { source: string; purpose: string }) => [f.source, f.purpose]), [[`kb:${w.sCover}`, 'service'], [`kb:${w.sOffer}`, 'offer']]);
  assert.ok(cfg.agent.neverSay.includes('guaranteed claim approval'));
  assert.deepEqual(cfg.agent.knowledge.materialised, { neverSay: ['guaranteed claim approval'] });
  assert.match(cfg.brief.text, COVER);
  assert.match(cfg.brief.text, /guaranteed claim approval/, 'the never-say row is in the brief');

  setFakeLlm(req => ({ text: req.messages[0].content.startsWith('You are role-playing') ? 'ok <hangup>' : 'Riya, Suraksha Health ki AI assistant. Aapko guaranteed claim approval milega.',
    toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }));
  const r = await w.ok('test.simulate', { agentId: a.agentId, simCaller: { persona: 'a policyholder', scenario: 'renewal call', hiddenKeys: {}, passCriteria: {} }, maxTurns: 2 });
  assert.ok(r.grades.some((g: { check: string; pass: boolean }) => g.check === 'never:guaranteed claim approval' && !g.pass) ||
    r.door.some((d: { action: string }) => d.action === 'block'), 'the offering\'s never-say is enforced in practice: ' + JSON.stringify([r.grades, r.door]));
});

test('a rejected span drops its fact; an unknown offering is refused; restore keeps the published snapshot', { skip }, async () => {
  const w = await world();
  const a = await w.ok('agent.create', { name: 'Solar', templateId: 'solar-lead-qualification' });
  const bad = await w.exec('brief.edit', { agentId: a.agentId, patch: [{ op: 'set', path: 'knowledge', value: { offeringIds: ['00000000-0000-4000-8000-000000000001'] } }] });
  assert.ok(bad.status === 'not_executed' && /linked offering is not in this workspace/.test(bad.reason), JSON.stringify(bad));
  await w.ok('brief.edit', { agentId: a.agentId, patch: [{ op: 'set', path: 'knowledge', value: { offeringIds: [w.offeringId] } }] });
  const s = await w.ok('stack.set', { agentId: a.agentId, stackId: 'v2-flashlite' });
  const v1 = await w.ok('version.publish', { agentId: a.agentId, draftHash: s.draftHash });

  await pool.query("UPDATE knowledge_span SET status = 'rejected' WHERE id = $1", [w.sOffer]);
  const g = await w.ok('agent.get', { agentId: a.agentId });
  assert.doesNotMatch(g.brief.text, OFFER, 'a fact stands only while its span is approved');

  const e = await w.ok('brief.edit', { agentId: a.agentId, patch: [{ op: 'set', path: 'persona.energy', value: 5 }] });
  const v2 = await w.ok('version.publish', { agentId: a.agentId, draftHash: e.draftHash });
  const r = await w.ok('version.restore', { agentId: a.agentId, versionId: v1.versionId });
  const [b1, b3] = await Promise.all([v1.versionId, r.versionId].map(async id => (await one<{ config: any }>(pool, 'SELECT config FROM agent_version WHERE id = $1', [id]))!.config));
  assert.equal(b3.brief.hash, b1.brief.hash, 'a rollback restores the knowledge it ran with, not today\'s');
  assert.match(b3.brief.text, OFFER);
  void v2;
});

test('the budget still throws, and its advice is true', { skip }, async () => {
  const w = await world();
  const facts = [];
  for (let i = 0; i < 12; i++) {
    const sp = (await one<{ id: string }>(pool, "INSERT INTO knowledge_span (workspace_id, source_id, ordinal, text, status) SELECT $1, source_id, $2, 'x', 'approved' FROM knowledge_span WHERE id = $3 RETURNING id", [w.ws, 10 + i, w.sCover]))!.id;
    facts.push({ text: `Benefit ${i}: ` + 'covered in full under the plan terms, '.repeat(7), spanId: sp, purposes: ['explain'] });
  }
  const big = await w.ok('offering.edit', { name: 'Big plan', facts });
  const a = await w.ok('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' });
  const e = await w.ok('brief.edit', { agentId: a.agentId, patch: [{ op: 'set', path: 'knowledge', value: { offeringIds: [big.offering.id] } }] });
  assert.equal(e.compiles, false);
  assert.equal(e.error.section, 'FACTS_ROWS');
  assert.match(e.error.message, /shorten long facts, or use fewer of the linked offerings' facts/);
  assert.doesNotMatch(e.error.message, /move long facts to knowledge/);
});
