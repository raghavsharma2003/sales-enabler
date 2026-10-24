// Set up, reset, set up again (owner directive calling-first-build-all): an agent can be duplicated, archived and restored;
// archive never deletes (versions, tests and calls stay); an archived agent takes no edits, publishes or calls; and a fresh
// agent from a template is clean: nothing of an old agent (linked company facts, tests, versions) leaks into it.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import type { Registry, Actor, Receipt } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { getTemplate } from '../server/modules/agents/templates.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(); registry = buildApp(pool, modules).registry; });
after(async () => { await pool?.end(); });
afterEach(() => setFakeLlm(null));

function ok<O = any>(r: Receipt<O>): O { assert.equal(r.status, 'confirmed', JSON.stringify(r)); return (r as { result: O }).result; }
function refused(r: Receipt, rx: RegExp) { assert.equal(r.status, 'not_executed', JSON.stringify(r)); assert.match((r as { reason: string }).reason, rx); }

async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('lifecycle test') RETURNING id"))!.id;
  const m = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1, $2, 'owner') RETURNING id", [ws, `l${Math.random()}@example.test`]))!.id;
  const actor: Actor = { type: 'member', id: m, role: 'owner' };
  const call = async <O = any>(name: string, args: unknown): Promise<Receipt<O>> => {
    const r = await registry.execute<O>(pool, name, args, { workspaceId: ws, actor });
    return r.status === 'needs_approval' ? registry.approve<O>(pool, (r as { actionId: string }).actionId, { workspaceId: ws, memberId: m }) : r;
  };
  return { ws, call };
}

/** An agent set up the way a buyer would: company facts linked, a practice chat kept, published. */
async function setUp(call: Awaited<ReturnType<typeof workspace>>['call']) {
  const src = ok(await call('knowledge.ingest', { title: 'Note', text: 'The policy covers day-care procedures from the first day of cover, across every network hospital in Pune.' }));
  const facts = ok(await call('knowledge.fact.list', { sourceId: src.sourceId, status: 'pending' })).facts;
  const d = ok(await call('knowledge.fact.decide', { factIds: facts.map((f: { id: string }) => f.id), decision: 'approved' }));
  const a = ok(await call('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' }));
  ok(await call('brief.edit', { agentId: a.agentId, patch: [{ op: 'set', path: 'knowledge', value: { offeringIds: d.offerings.map((o: { id: string }) => o.id) } }] }));
  setFakeLlm(() => ({ text: 'Ji, main yahin hoon.', toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 }, model: 'fake', provider: 'fake' }));
  const opened = [{ who: 'agent', text: 'Namaste, main Suraksha ki AI assistant hoon.' }];
  const r = ok(await call('test.chat', { agentId: a.agentId, history: opened, message: 'Haan boliye.' }));
  ok(await call('test.chat_keep', { agentId: a.agentId, turns: [...opened, { who: 'caller', text: 'Haan boliye.' }, { who: 'agent', text: r.said }] }));
  const g = ok(await call('agent.get', { agentId: a.agentId }));
  const v = ok(await call('version.publish', { agentId: a.agentId, draftHash: g.draftHash }));
  return { agentId: a.agentId as string, versionId: v.versionId as string };
}

const rows = async (agentId: string) => (await one<{ v: number; t: number }>(pool,
  'SELECT (SELECT count(*) FROM agent_version WHERE agent_id = $1)::int AS v, (SELECT count(*) FROM agent_test_run WHERE agent_id = $1)::int AS t', [agentId]))!;

test('reset: archive keeps everything and blocks use; a fresh agent from the template starts clean; restore brings the old one back', { skip }, async () => {
  const { call } = await workspace();
  const old = await setUp(call);
  const kept = await rows(old.agentId);
  assert.deepEqual(kept, { v: 1, t: 1 });

  const ar = ok(await call('agent.archive', { agentId: old.agentId, reason: 'starting again' }));
  assert.equal(ar.status, 'archived');
  assert.deepEqual(await rows(old.agentId), kept, 'archive never deletes: versions and tests stay');
  assert.deepEqual(ok(await call('agent.list', {})).agents.map((a: { id: string }) => a.id), [], 'the list leaves it out');
  const archived = ok(await call('agent.list', { archived: true })).agents;
  assert.deepEqual([archived[0].id, archived[0].archive_reason], [old.agentId, 'starting again']);
  refused(await call('brief.edit', { agentId: old.agentId, patch: [{ op: 'set', path: 'persona.name', value: 'Mira' }] }), /archived; restore it/);
  const g = ok(await call('agent.get', { agentId: old.agentId }));
  refused(await call('version.publish', { agentId: old.agentId, draftHash: g.draftHash }), /archived; restore it/);

  // Set up again from the template, with the same name: clean.
  const fresh = ok(await call('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' }));
  const f = ok(await call('agent.get', { agentId: fresh.agentId }));
  assert.notEqual(fresh.agentId, old.agentId);
  assert.equal(f.draft.knowledge, undefined, 'no linked company facts from the old agent');
  assert.deepEqual(f.draft.facts.map((x: { key: string }) => x.key), getTemplate('insurance-renewal')!.config.facts.map(x => x.key), 'only the template\'s own facts');
  assert.deepEqual([f.versions, f.tests], [[], []], 'no versions and no tests');
  assert.equal(f.draft.agentId, fresh.agentId);

  // Restore: back to the status it had (live once published and deployed; draft here), and editable again.
  const re = ok(await call('agent.restore', { agentId: old.agentId }));
  assert.equal(re.status, 'draft');
  ok(await call('brief.edit', { agentId: old.agentId, patch: [{ op: 'set', path: 'persona.name', value: 'Mira' }] }));
  assert.deepEqual(await rows(old.agentId), kept);
});

test('an agent in use cannot be archived; a campaign on an archived agent is blocked at launch with a way to restore', { skip }, async () => {
  const { ws, call } = await workspace();
  const a = await setUp(call);
  const d = ok(await call('campaign.draft', { name: 'Renewals', category: 'service', agentVersionId: a.versionId, capInrMilli: 5_000_000 }));
  await pool.query("UPDATE campaign SET state = 'running' WHERE id = $1", [d.id]);
  refused(await call('agent.archive', { agentId: a.agentId }), /used by the campaign "Renewals" \(running\); stop or finish that campaign first/);
  await pool.query("UPDATE campaign SET state = 'completed' WHERE id = $1", [d.id]);
  ok(await call('agent.archive', { agentId: a.agentId }));
  const d2 = ok(await call('campaign.draft', { name: 'Renewals again', category: 'service', agentVersionId: a.versionId, capInrMilli: 5_000_000 }));
  const g = ok(await call('campaign.get', { id: d2.id }));
  const b = g.blockers.find((x: { code: string }) => x.code === 'agent_archived');
  assert.ok(b, JSON.stringify(g.blockers));
  assert.equal(b.fix.tool, 'agent.restore');
  assert.ok(ws);
});

test('duplicate copies the draft only: no versions, tests or calls come with it', { skip }, async () => {
  const { call } = await workspace();
  const a = await setUp(call);
  ok(await call('brief.edit', { agentId: a.agentId, patch: [{ op: 'set', path: 'persona.name', value: 'Mira' }] }));
  const dup = ok(await call('agent.duplicate', { agentId: a.agentId, name: 'Renewals, Nagpur' }));
  const g = ok(await call('agent.get', { agentId: dup.agentId }));
  assert.equal(g.agent.name, 'Renewals, Nagpur');
  assert.equal(g.draft.persona.name, 'Mira', 'the draft as it stands, unsaved-to-version edits included');
  assert.equal(g.draft.agentId, dup.agentId);
  assert.equal(g.draft.knowledge.offeringIds.length, 1, 'its links to company information come along, as part of the draft');
  assert.deepEqual([g.versions, g.tests, g.agent.status], [[], [], 'draft']);
  assert.deepEqual(await rows(a.agentId), { v: 1, t: 1 }, 'the original is untouched');
});
