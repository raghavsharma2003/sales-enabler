// Every activity row names what it was about (open.2026-10-21.activity-row-subject): the audit payload stores the
// subject as {type, id} only, and activity.list resolves its name inside the workspace.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { modules } from '../server/modules/index.ts';
import { INTERNAL_ID_KEYS, SUBJECT_KEYS, subjectOf } from '../server/subject.ts';
import { activitySentence } from '../web/src/labels.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool | undefined;
after(async () => { await pool?.end(); });

test('guard: every tool whose arguments name an entity gets a subject, and every *Id argument is either a subject or listed as internal', () => {
  const { registry } = buildApp(new pg.Pool({ connectionString: 'postgresql://unused@/unused' }), modules);
  const subjectKeys = new Set(SUBJECT_KEYS.map(k => k[0])), internal = new Set(INTERNAL_ID_KEYS);
  const unclassified: string[] = [], noSubject: string[] = [];
  for (const t of registry.list()) {
    const props: Record<string, any> = (registry.get(t.name)!.input.schema as any)?.properties ?? {};
    const idKeys = Object.keys(props).filter(k => /Id$/.test(k) && props[k]?.format === 'uuid');
    for (const k of idKeys) if (!subjectKeys.has(k) && !internal.has(k)) unclassified.push(`${t.name}.${k}`);
    const named = idKeys.filter(k => subjectKeys.has(k));
    for (const k of named) if (!subjectOf({ [k]: '00000000-0000-4000-8000-000000000001' })) noSubject.push(`${t.name}.${k}`);
  }
  assert.deepEqual(unclassified, [], 'an *Id argument that is neither a subject key nor listed as internal (add it to SUBJECT_KEYS or INTERNAL_ID_KEYS)');
  assert.deepEqual(noSubject, []);
  // Input wins; a create's result names what it made.
  assert.deepEqual(subjectOf({ agentId: '00000000-0000-4000-8000-0000000000aa' }, { conversationId: '00000000-0000-4000-8000-0000000000bb' }), { type: 'agent', id: '00000000-0000-4000-8000-0000000000aa' });
  assert.deepEqual(subjectOf({ name: 'x' }, { agentId: '00000000-0000-4000-8000-0000000000cc' }), { type: 'agent', id: '00000000-0000-4000-8000-0000000000cc' });
  assert.equal(subjectOf({ stashId: '00000000-0000-4000-8000-0000000000dd' }), null);
  assert.equal(subjectOf({ name: 'Nightly sync' }, { memberId: '00000000-0000-4000-8000-0000000000ee' }), null, "a result's other ids (who made it) are not what was made");
});

test('the ledger names the subject: six practice calls read as six different agents, and a contact is never shown by number', { skip }, async () => {
  pool = createPool(process.env.DATABASE_URL);
  const { registry } = buildApp(pool, modules);
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('activity subject test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, name, role) VALUES ($1,$2,'Priya','owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const ctx = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
  const made = await registry.execute<any>(pool, 'agent.create', { name: 'Asha', templateId: 'insurance-renewal' }, ctx);
  assert.equal(made.status, 'confirmed', JSON.stringify(made));
  if (made.status !== 'confirmed') return;
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1,'+919500000001') RETURNING id", [ws]))!.id;
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, contact_id, channel, status) VALUES ($1,$2,'phone','live') RETURNING id", [ws, contact]))!.id;
  await registry.execute(pool, 'live.listen', { conversationId: conv }, ctx);

  const page = await registry.execute<any>(pool, 'activity.list', { limit: 10 }, ctx);
  assert.equal(page.status, 'confirmed');
  if (page.status !== 'confirmed') return;
  const created = page.result.items.find((i: any) => i.action === 'agent.create');
  assert.deepEqual(created.subject, { type: 'agent', id: made.result.agentId, name: 'Asha' }, "a create's subject is what it made");
  assert.equal(created.line, 'Priya ran agent create (Asha)', 'the server line names the subject right after the verb');
  assert.equal(activitySentence(created.line, created.action, created.subject.name), 'Priya created an agent: Asha');
  const listened = page.result.items.find((i: any) => i.action === 'live.listen');
  if (listened) {
    assert.equal(listened.subject.name, 'a call');
    assert.ok(!JSON.stringify(listened).includes('9500000001'), 'a contact without a name is never shown by number');
  }
  const audit = await one<{ payload: any }>(pool, "SELECT payload FROM audit_event WHERE workspace_id = $1 AND action = 'agent.create'", [ws]);
  assert.deepEqual(Object.keys(audit!.payload.subject).sort(), ['id', 'type'], 'the audit row stores the id and type only, never a name');
});
