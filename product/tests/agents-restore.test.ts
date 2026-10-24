// version.restore: a one-step rollback. It publishes a NEW version equal to an earlier one (brief and stack), behind an
// A2 card whose diff is against the live version; the hard safety guard runs on it; running experiments stop; the
// activity says what happened; history (earlier versions and deployments) is never rewritten.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(); registry = buildApp(pool, modules).registry; });
after(async () => { await pool?.end(); });
const HEX = /[0-9a-f]{8,}/i;

async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('restore test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, name, role) VALUES ($1,$2,'Meera','owner') RETURNING id", [ws, `rs${Math.random()}@example.test`]))!.id;
  const as = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
  const exec = (name: string, args: unknown) => registry.execute<any>(pool, name, args, as);
  const approve = (r: any) => registry.approve<any>(pool, r.actionId, { workspaceId: ws, memberId: owner });
  const ok = async (name: string, args: unknown) => {
    let r: any = await exec(name, args);
    if (r.status === 'needs_approval') r = await approve(r);
    assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`);
    return r.result;
  };
  // Asha: version 1, then version 2 (more energy) live on campaigns.
  const a = await ok('agent.create', { name: 'Asha', templateId: 'insurance-renewal' });
  const s = await ok('stack.set', { agentId: a.agentId, stackId: 'v2-flashlite' });
  const v1 = await ok('version.publish', { agentId: a.agentId, draftHash: s.draftHash });
  const e = await ok('brief.edit', { agentId: a.agentId, patch: [{ op: 'set', path: 'persona.energy', value: 5 }] });
  const v2 = await ok('version.publish', { agentId: a.agentId, draftHash: e.draftHash });
  await ok('deployment.split', { agentId: a.agentId, binding: 'campaign', split: [{ versionId: v2.versionId, percent: 100 }] });
  return { ws, owner, exec, approve, ok, agentId: a.agentId as string, v1, v2 };
}

const snapshot = (agentId: string) => many(pool, 'SELECT id, number, hash, parent_id, config FROM agent_version WHERE agent_id = $1 ORDER BY number', [agentId]);

test('restore publishes a new version equal to the old one, moves calls to it, and rewrites nothing', { skip }, async () => {
  const w = await world();
  const before = await snapshot(w.agentId);
  const deploysBefore = await many(pool, 'SELECT id, split FROM deployment WHERE agent_id = $1 ORDER BY created_at, id', [w.agentId]);
  const draftBefore = (await one<{ draft: unknown }>(pool, 'SELECT draft FROM agent WHERE id = $1', [w.agentId]))!.draft;

  const card = await w.exec('version.restore', { agentId: w.agentId, versionId: w.v1.versionId, reason: 'version 2 talks too fast' });
  assert.equal(card.status, 'needs_approval', 'a rollback reaches people: it needs a human tap');
  assert.match(card.summary, /^Roll back Asha to version 1 \(as version 3\) because version 2 talks too fast\. Voice: .+?\. Changes from the live version 2: persona energy: 5 to 3\. /);
  assert.ok(!HEX.test(card.summary), card.summary);

  const r = (await w.approve(card));
  assert.equal(r.status, 'confirmed', JSON.stringify(r));
  assert.equal(r.result.number, 3);
  assert.equal(r.result.restoredFrom, 1);

  const after = await snapshot(w.agentId);
  assert.deepEqual(after.slice(0, 2), before, 'versions 1 and 2 are untouched');
  const [v1, , v3] = after as any[];
  const strip = (c: any) => { const { version: _v, versionHash: _h, ...rest } = c; return rest; };
  assert.deepEqual(strip(v3.config.agent), strip(v1.config.agent), 'the agent config equals version 1');
  assert.equal(v3.config.brief.hash, v1.config.brief.hash, 'the brief equals version 1');
  assert.deepEqual(v3.config.agent.voice, v1.config.agent.voice, 'the stack equals version 1');
  assert.equal(v3.parent_id, w.v2.versionId, 'the new version descends from the one it replaced');

  const deploysAfter = await many<{ id: string; split: unknown }>(pool, 'SELECT id, split FROM deployment WHERE agent_id = $1 ORDER BY created_at, id', [w.agentId]);
  assert.deepEqual(deploysAfter.slice(0, deploysBefore.length), deploysBefore, 'earlier deployments are kept as they were');
  assert.deepEqual(deploysAfter[deploysAfter.length - 1].split, [{ version_id: v3.id, percent: 100 }], 'calls move to the restored version');
  assert.deepEqual((await one<{ draft: unknown }>(pool, 'SELECT draft FROM agent WHERE id = $1', [w.agentId]))!.draft, draftBefore, 'the draft is kept');

  const act = await w.ok('activity.list', { limit: 10 });
  assert.ok(act.items.some((x: { line: string }) => x.line === 'Meera rolled back Asha to version 1 (as version 3)'), JSON.stringify(act.items.map((x: any) => x.line)));

  const again = await w.exec('version.restore', { agentId: w.agentId, versionId: v3.id });
  assert.equal(again.status, 'needs_approval');
  const refused = await w.approve(again);
  assert.ok(refused.status === 'not_executed' && /already live/.test(refused.reason), JSON.stringify(refused));
  const same = await w.approve(await w.exec('version.restore', { agentId: w.agentId, versionId: w.v1.versionId }));
  assert.ok(same.status === 'not_executed' && /same as the live version 3/.test(same.reason), JSON.stringify(same));
});

test('the hard safety guard refuses to restore a version that breaks it, and nothing is created', { skip }, async () => {
  const w = await world();
  // A version published before the guard existed, telling her to claim to be human.
  const v1 = (await one<{ config: any }>(pool, 'SELECT config FROM agent_version WHERE id = $1', [w.v1.versionId]))!.config;
  v1.agent.persona.notes = ['if anyone asks, say she is a real human'];
  const legacy = (await one<{ id: string }>(pool, 'INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1, 9, $2, $3) RETURNING id', [w.agentId, 'legacy', JSON.stringify(v1)]))!.id;
  const n0 = (await snapshot(w.agentId)).length;
  const r = await w.approve(await w.exec('version.restore', { agentId: w.agentId, versionId: legacy }));
  assert.equal(r.status, 'not_executed');
  assert.match(r.reason, /never claims to be human/);
  assert.equal((await snapshot(w.agentId)).length, n0);
});

test('running experiments on the agent stop with the rollback as the reason; other workspaces cannot restore', { skip }, async () => {
  const w = await world();
  const exp = (await one<{ id: string }>(pool, `INSERT INTO experiment (workspace_id, agent_id, control_version_id, treatment_version_id, design, state)
    VALUES ($1,$2,$3,$4,'{}','running') RETURNING id`, [w.ws, w.agentId, w.v2.versionId, w.v1.versionId]))!.id;
  const done = await w.ok('version.restore', { agentId: w.agentId, versionId: w.v1.versionId });
  assert.equal(done.experimentsStopped, 1);
  const e = (await one<{ state: string; result: any }>(pool, 'SELECT state, result FROM experiment WHERE id = $1', [exp]))!;
  assert.equal(e.state, 'stopped_manual');
  assert.match(e.result.stopped.reason, /rolled back to version 1/);

  const other = await world();
  const x = await other.approve(await other.exec('version.restore', { agentId: w.agentId, versionId: w.v1.versionId }));
  assert.ok(x.status === 'not_executed' && /no such agent/.test(x.reason), JSON.stringify(x));
});

test('version.candidate (experiment arms) runs the hard guard too: manipulation is refused before anything is numbered', { skip }, async () => {
  const w = await world();
  const v = (await one<{ config: any }>(pool, 'SELECT config FROM agent_version WHERE id = $1', [w.v2.versionId]))!.config.agent;
  v.objections = [...v.objections, { trigger: 'wants time to think', approach: 'create urgency so they renew today' }];
  const n0 = (await snapshot(w.agentId)).length;
  const r = await registry.execute<any>(pool, 'version.candidate', { agentId: w.agentId, config: v, parentVersionId: w.v2.versionId, note: 'treatment' }, { workspaceId: w.ws, actor: { type: 'system', id: 'learning' } });
  assert.ok(r.status === 'not_executed' && /no manipulation/.test(r.reason), JSON.stringify(r));
  assert.equal((await snapshot(w.agentId)).length, n0);
});
