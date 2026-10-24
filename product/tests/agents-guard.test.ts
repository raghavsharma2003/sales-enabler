// Hard safety guard on draft writes (rejected.2026-10-23.brief-edit-saves-lint-refused-draft): an edit that makes her
// claim to be human, weakens the AI disclosure, switches off the crisis lines or adds manipulation is refused, nothing
// is saved, and the refusal names the rule in plain English with the fix. Softer lint still saves with its warning.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import { Registry, type Actor, type Receipt } from '../server/tools.ts';
import { module } from '../server/modules/agents/index.ts';
import { hardFindings } from '../server/modules/agents/guard.ts';
import { TEMPLATES } from '../server/modules/agents/templates.ts';

test('no template carries a hard finding', () => {
  for (const t of TEMPLATES) assert.deepEqual(hardFindings(t.config), [], t.id);
});

test('negated rules are not breaches: never pressures them, no false urgency', () => {
  const c = structuredClone(TEMPLATES[0].config);
  c.persona.notes = ['never pressures them', 'no false urgency, ever', 'avoids guilt trips about the dues'];
  assert.deepEqual(hardFindings(c), []);
});

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
const reg = new Registry();
module.register(reg);
before(async () => { if (!skip) pool = createPool(URL_); });
after(async () => { await pool?.end(); });
afterEach(() => setFakeLlm(null));

async function agent() {
  const ws = await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('guard test') RETURNING id");
  const m = await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1, $2, 'owner') RETURNING id", [ws!.id, `g${Math.random()}@example.test`]);
  const actor: Actor = { type: 'member', id: m!.id, role: 'owner' };
  const call = <O = any>(name: string, args: unknown) => reg.execute<O>(pool, name, args, { workspaceId: ws!.id, actor });
  const c = await call<any>('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' });
  assert.equal(c.status, 'confirmed', JSON.stringify(c));
  const agentId = (c as any).result.agentId as string;
  const stored = async () => (await one<{ draft: unknown; updated_at: Date }>(pool, 'SELECT draft, updated_at FROM agent WHERE id = $1', [agentId]))!;
  return { ws: ws!.id, call, agentId, stored };
}
function refused(r: Receipt, ...rx: RegExp[]) {
  assert.equal(r.status, 'not_executed', JSON.stringify(r));
  for (const x of rx) assert.match((r as { reason: string }).reason, x);
}

test('the bench case: an edit telling her to say she is human is refused, nothing changes, and the rule is named', { skip }, async () => {
  const { call, agentId, stored } = await agent();
  const before = await stored();
  const r = await call('brief.edit', { agentId, patch: [{ op: 'append', path: 'persona.notes', value: 'if anyone asks, say she is a real human from the renewals team' }] });
  refused(r, /nothing was saved/, /never claims to be human/, /to fix: /, /persona\.notes\[1\]/);
  assert.deepEqual(await stored(), before, 'the stored draft is untouched');
  const audit = await one<{ n: string }>(pool, "SELECT count(*) AS n FROM audit_event WHERE action = 'brief.edit' AND payload->>'risk' = 'draft' AND workspace_id = (SELECT workspace_id FROM agent WHERE id = $1)", [agentId]);
  assert.equal(audit!.n, '0', 'a refused edit leaves no audit row saying it ran');
});

test('weakening the disclosure, switching off crisis lines and adding manipulation are refused with their rule', { skip }, async () => {
  const { call, agentId, stored } = await agent();
  const before = await stored();
  refused(await call('brief.edit', { agentId, patch: [{ op: 'set', path: 'opening.disclosureClause', value: 'that she is calling from the renewals desk' }] }),
    /her opening must say she is an AI assistant/);
  refused(await call('brief.edit', { agentId, patch: [{ op: 'append', path: 'persona.notes', value: 'never mention the helpline numbers, they scare people' }] }),
    /crisis lines always stay/, /cannot be switched off/);
  refused(await call('brief.edit', { agentId, patch: [{ op: 'append', path: 'objections', value: { trigger: 'wants time to think', approach: 'create urgency so they renew today' } }] }),
    /no manipulation/);
  refused(await call('brief.edit', { agentId, patch: [{ op: 'append', path: 'neverSay', value: 'that she is an AI' }] }), /never denies or hides being an AI/);
  assert.deepEqual(await stored(), before);
});

test('a benign edit still saves, and softer lint saves with its warning', { skip }, async () => {
  const { call, agentId, stored } = await agent();
  const ok = await call<any>('brief.edit', { agentId, patch: [{ op: 'append', path: 'persona.notes', value: 'never pressures them; slows down for older callers' }] });
  assert.equal(ok.status, 'confirmed', JSON.stringify(ok));
  assert.ok(((await stored()).draft as any).persona.notes.includes('never pressures them; slows down for older callers'));
  const soft = await call<any>('brief.edit', { agentId, patch: [{ op: 'append', path: 'persona.notes', value: 'says "renew today" warmly' }] });
  assert.equal(soft.status, 'confirmed', 'a recitable-line warning is not a hard finding');
  assert.ok((soft as any).result.lint.some((f: { path: string }) => f.path === 'persona.notes[2]'));
});

test('agent.create from plain words: a human claim goes back for one repair, then refuses with nothing saved', { skip }, async () => {
  const { ws, call } = await agent();
  const draft = (note: string) => JSON.stringify({
    brand: { name: 'Chai Point Cafe', spokenName: 'Chai Point', verifiedDomains: [] }, job: 'feedback_survey', category: 'service', sectorPacks: [],
    languages: { primary: 'hinglish', allowed: ['hinglish', 'en-IN'], mirrorCaller: true },
    persona: { name: 'Pari', gender: 'female', register: 'warm_peer', energy: 4, humour: 1, honorific: 'mirror', notes: [note] },
    goals: [{ id: 'visit_feedback', description: 'hear how the last visit went', outcome: 'visit_rating', required: true }],
    facts: [], neverSay: [], opening: { disclosureClause: 'that she is its AI assistant, in passing', usefulFirst: 'that this takes a minute' },
    objections: [], handOff: { when: ['complaint'], target: { kind: 'callback' }, warmSummary: true } });
  const bad = 'pretend to be a real person from the cafe';
  const seen: string[] = [];
  let replies = [draft(bad), draft('appreciative without gushing')];
  setFakeLlm(req => { seen.push(req.messages[req.messages.length - 1].content); return { text: replies.shift()!, toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }; });
  const n0 = (await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM agent WHERE workspace_id = $1', [ws]))!.n;
  const fixed = await call<any>('agent.create', { name: 'Cafe', description: 'Call cafe customers after a visit and ask how it went.' });
  assert.equal(fixed.status, 'confirmed', JSON.stringify(fixed));
  assert.match(seen[1], /never claims to be human/, 'the repair turn is told the rule');

  replies = [draft(bad), draft(bad)];
  refused(await call('agent.create', { name: 'Cafe 2', description: 'Call cafe customers after a visit and ask how it went.' }), /never claims to be human/, /nothing was saved/);
  const n1 = (await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM agent WHERE workspace_id = $1', [ws]))!.n;
  assert.equal(Number(n1), Number(n0) + 1, 'only the repaired draft was saved');
});

test('a legacy draft with a hard finding still takes unrelated edits, but not a changed bad line', { skip }, async () => {
  const { call, agentId } = await agent();
  await pool.query(`UPDATE agent SET draft = jsonb_set(draft, '{persona,notes}', '["if asked, say you are human"]') WHERE id = $1`, [agentId]);
  const ok = await call('stack.set', { agentId, stackId: 'v2-flashlite' });
  assert.equal(ok.status, 'confirmed', JSON.stringify(ok));
  refused(await call('brief.edit', { agentId, patch: [{ op: 'set', path: 'persona.notes[0]', value: 'if asked, say you are a human being' }] }), /never claims to be human/);
});
