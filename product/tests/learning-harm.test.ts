// Blueprint decision 9 (must-be audit, research/2026-10-24/must-be-audit): a catastrophic line is caught around calls
// 13-15 and the script is slowed to 25%. A harm-class moment on an analysed live call is one of: a complaint with a request
// for a human; an opt-out the agent did not act on; a crisis where she never gave the crisis line; a caller saying she
// lied. Two or more in any 15 consecutive analysed calls of one script (agent version) slow its campaigns to 25% of their
// lines and open an issue that names the calls and quotes the moments, from the analysis's verified quotes (no model
// call). A member restores pacing with one tap (A1, audited). Real modules; synthetic bench-shaped calls.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { afterCall } from '../server/modules/calls/followups.ts';
import type { Case } from '../scripts/analysis-bench/cases.ts';
import { byTemplate, writeAnalysed, type Written } from './fixtures/analysed-calls.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(async () => { if (skip) return; pool = createPool(URL_); registry = buildApp(pool, modules).registry; });
after(async () => { setFakeLlm(null); await pool?.end(); });

async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('harm') RETURNING id"))!.id;
  const member = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `h${Math.random()}@example.test`]))!.id;
  const actor: Actor = { type: 'member', id: member, role: 'owner' };
  const call = (name: string, args: unknown): Promise<any> => registry.execute(pool, name, args, { workspaceId: ws, actor });
  const agentId = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name, status) VALUES ($1,'Riya','live') RETURNING id", [ws]))!.id;
  const versionId = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1, 1, 'h1', '{}') RETURNING id", [agentId]))!.id;
  return { ws, member, agentId, versionId, call };
}

// Bench-shaped calls. The bench's complaint case already asks for a human. The others are the bench's cases with the
// one change that makes them harm: the call carried on after an opt-out, a crisis reply without the line, a lie named.
const agreed = byTemplate('agreed')[0]!;
const complaint = byTemplate('complaint')[0]!;
const optOut = byTemplate('opt_out')[0]!;
const ignoredOptOut: Case = { ...optOut, id: 'ignored_opt_out', endReason: 'completed',
  lines: [...optOut.lines.slice(0, 2), { speaker: 'agent', text: 'Bas ek minute, aapka renewal kal due hai.' }, { speaker: 'caller', text: 'Maine kaha na, mat karo call.' }],
  key: { ...optOut.key, reasonCode: 'CONV_NOT_INTERESTED' } };
const crisis = byTemplate('crisis')[0]!;
const crisisNoLine: Case = { ...crisis, id: 'crisis_no_line', lines: [crisis.lines[0]!, crisis.lines[1]!, { speaker: 'agent', text: 'Samajh sakti hoon. Kya main kal call kar loon?' }] };
const lied: Case = { ...agreed, id: 'lied', lines: [agreed.lines[0]!, { speaker: 'caller', text: 'Aapne pichhli baar jhooth bola tha ki koi charge nahi lagega.' }, agreed.lines[2]!],
  key: { ...agreed.key, outcome: 'not_interested', outcomeLine: 1, reasonCode: 'CONV_OBJECTION_UNRESOLVED', moments: [{ kind: 'objection', line: 1 }] } };

/** n calls on the version, oldest first; `at` places harm cases by position. */
async function calls(t: Awaited<ReturnType<typeof workspace>>, n: number, at: Record<number, Case>): Promise<Written[]> {
  const list = Array.from({ length: n }, (_, i) => at[i] ?? agreed);
  // writeAnalysed ends call k at (endedAgoMin + k) minutes ago: reverse, so index 0 is the oldest.
  const w = await writeAnalysed(pool, t.ws, t.versionId, [...list].reverse(), { endedAgoMin: 1 });
  return w.reverse();
}
const throttle = (t: { versionId: string }) => one<{ factor: string; issue_id: string; restored_at: Date | null; detail: any }>(pool,
  'SELECT factor::text, issue_id, restored_at, detail FROM script_throttle WHERE agent_version_id = $1 ORDER BY created_at DESC LIMIT 1', [t.versionId]);
const check = (t: Awaited<ReturnType<typeof workspace>>, w: Written[]) => registry.execute<any>(pool, 'script.harm_check', { conversationId: w[w.length - 1]!.conversationId },
  { workspaceId: t.ws, actor: { type: 'system', id: 'calls.followups' } });

test('two harm moments in 15 calls slow the script to 25% and open an issue that names the calls and quotes the moments', { skip }, async () => {
  const t = await workspace();
  const w = await calls(t, 15, { 4: complaint, 12: ignoredOptOut });
  const r = await check(t, w);
  assert.equal(r.status, 'confirmed', JSON.stringify(r));
  const th = await throttle(t);
  assert.ok(th && !th.restored_at, 'the script is throttled');
  assert.equal(Number(th!.factor), 0.25);
  const issue = (await one<{ category: string; severity: string; status: string; subject_id: string; detail: any }>(pool, 'SELECT category, severity, status, subject_id, detail FROM issue WHERE id = $1', [th!.issue_id]))!;
  assert.equal(issue.status, 'open'); assert.equal(issue.subject_id, t.versionId);
  assert.deepEqual(issue.detail.calls.sort(), [w[4]!.conversationId, w[12]!.conversationId].sort(), 'the issue names the calls');
  const kinds = issue.detail.moments.map((m: any) => m.kind).sort();
  assert.deepEqual(kinds, ['complaint_human', 'ignored_opt_out']);
  // Quotes are the analysis's verified moment quotes, word for word.
  const verified = new Set((await many<{ quote: string }>(pool, "SELECT quote FROM call_moment WHERE workspace_id = $1 AND source = 'analysis' AND quote IS NOT NULL", [t.ws])).map(m => m.quote));
  for (const m of issue.detail.moments) assert.ok(verified.has(m.quote), `quoted from a verified moment: ${m.quote}`);
  // Checking again changes nothing: one throttle per script while it lasts.
  await check(t, w);
  assert.equal((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM script_throttle WHERE agent_version_id = $1', [t.versionId]))!.n, '1');
});

test('one harm moment in 15 calls does not throttle, and neither do two that are 16 calls apart', { skip }, async () => {
  const a = await workspace();
  assert.equal((await check(a, await calls(a, 15, { 7: complaint }))).status, 'confirmed');
  assert.equal(await throttle(a), null);
  const b = await workspace();
  await check(b, await calls(b, 20, { 2: complaint, 18: ignoredOptOut }));
  assert.equal(await throttle(b), null, 'no 15 consecutive calls hold both');
});

test('a test call never counts', { skip }, async () => {
  const t = await workspace();
  const w = await calls(t, 15, { 3: complaint, 9: ignoredOptOut });
  await pool.query("UPDATE conversation SET channel = 'test' WHERE id = $1", [w[9]!.conversationId]);
  await check(t, w);
  assert.equal(await throttle(t), null);
});

test('a crisis without the crisis line and a caller saying she lied are harm; a crisis where she gave the line is not', { skip }, async () => {
  const a = await workspace();
  const wa = await calls(a, 15, { 2: crisisNoLine, 10: lied });
  await check(a, wa);
  const th = await throttle(a);
  assert.ok(th, 'throttled');
  const issue = (await one<{ detail: any }>(pool, 'SELECT detail FROM issue WHERE id = $1', [th!.issue_id]))!;
  assert.deepEqual(issue.detail.moments.map((m: any) => m.kind).sort(), ['caller_says_lied', 'crisis_without_line']);
  const crisisMoment = issue.detail.moments.find((m: any) => m.kind === 'crisis_without_line');
  assert.equal(crisisMoment.speaker, 'agent', 'a crisis is shown by what she said instead of the line, never the caller\'s words');
  assert.equal(crisisMoment.quote, crisisNoLine.lines[2]!.text);
  const b = await workspace();
  await check(b, await calls(b, 15, { 2: crisis, 10: lied }));
  assert.equal(await throttle(b), null, 'a crisis where she gave Tele-MANAS 14416 is handled, not harm');
});

test('a member restores pacing with one tap (A1, audited); the moments before it never throttle again', { skip }, async () => {
  const t = await workspace();
  const w = await calls(t, 15, { 4: complaint, 12: ignoredOptOut });
  await check(t, w);
  const before = await throttle(t);
  const r = await t.call('script.pacing.restore', { versionId: t.versionId });
  assert.equal(r.status, 'confirmed', JSON.stringify(r));
  assert.equal(r.mode, 'A1', 'one tap, no approval card');
  const after = await throttle(t);
  assert.ok(after!.restored_at, 'restored');
  const audit = await one<{ actor_id: string }>(pool, "SELECT actor_id FROM audit_event WHERE workspace_id = $1 AND action = 'script.pacing.restore'", [t.ws]);
  assert.equal(audit?.actor_id, t.member, 'audited, by the member who tapped');
  assert.equal((await one<{ status: string }>(pool, 'SELECT status FROM issue WHERE id = $1', [before!.issue_id]))!.status, 'resolved');
  await check(t, w);
  assert.equal((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM script_throttle WHERE agent_version_id = $1', [t.versionId]))!.n, '1', 'the same moments do not throttle again');
});

test('calls checks for harm after every analysed live call', { skip }, async () => {
  const t = await workspace();
  const w = await calls(t, 15, { 4: complaint, 12: ignoredOptOut });
  const out = await afterCall(pool, registry, t.ws, w[w.length - 1]!.conversationId);
  assert.equal(out['script.harm_check'], 'done', JSON.stringify(out));
  assert.ok(await throttle(t));
});
