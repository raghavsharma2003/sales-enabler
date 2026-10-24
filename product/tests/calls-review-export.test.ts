// The staff review export (directive.2026-10-24.calling-first-build-all): Vyakti staff read one workspace's calls in a
// time window as one JSON, to find where a long test call went wrong. Synthetic, fictional data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { module as calls } from '../server/modules/calls/index.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, [calls]).registry; });
after(async () => { await pool?.end(); });

const staff: Actor = { type: 'vp_success', id: 'staff-asha (synthetic)' };
const T0 = '2026-10-24T05:00:00.000Z';

async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('review export') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  return { ws, owner };
}
/** A call that started `min` minutes after T0. */
async function conv(ws: string, min: number, o: { channel?: string; end?: string; analysis?: object; transcript?: object[] } = {}) {
  const at = new Date(Date.parse(T0) + min * 60_000);
  const id = (await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, channel, status, end_reason, transcript, analysis, started_at, ended_at, duration_s, recording_uri)
    VALUES ($1,$2,'done',$3,$4,$5,$6,$6::timestamptz + interval '6 minutes',360,'s3://synthetic/rec.wav') RETURNING id`,
    [ws, o.channel ?? 'phone', o.end ?? 'completed', JSON.stringify(o.transcript ?? [{ speaker: 'agent', text: 'Namaste, main Riya bol rahi hoon, ek AI assistant.', startMs: 0, latencyMs: 820 }]),
      JSON.stringify(o.analysis ?? { status: 'done' }), at]))!.id;
  return id;
}

test('staff export a window: every call\'s own record, test calls in, errors listed, no recording link, audited; members and other workspaces never', { skip }, async () => {
  const { ws, owner } = await workspace();
  const a = await conv(ws, 10, { channel: 'test' });
  const b = await conv(ws, 30, { end: 'error', analysis: { status: 'failed', reason: 'the analysis model did not answer' } });
  await pool.query("INSERT INTO call_tool_event (workspace_id, conversation_id, seq, name, args, status, at) VALUES ($1,$2,7,'lookup_order','{}','failed',now())", [ws, b]);
  await pool.query("INSERT INTO call_moment (workspace_id, conversation_id, source, kind, at_ms, note, quote) VALUES ($1,$2,'analysis','objection',4000,'n','Bahut mehenga hai.')", [ws, b]);
  await pool.query("INSERT INTO runtime_event_seen (conversation_id, seq, workspace_id, type) VALUES ($1,1,$2,'call.started'),($1,2,$2,'turn')", [b, ws]);
  await conv(ws, 60 * 24 * 2);                       // outside the window
  const other = await workspace();
  await conv(other.ws, 20);                          // another workspace, inside the window

  const ctx = { workspaceId: ws, actor: staff };
  const r = await registry.execute<any>(pool, 'review.export', { from: T0, to: '2026-10-24T12:00:00.000Z' }, ctx);
  if (r.status !== 'confirmed') return assert.fail(JSON.stringify(r));
  const x = r.result;
  assert.deepEqual(x.calls.map((c: any) => c.id), [a, b], 'in the window, in time order; never another workspace or outside the window');
  assert.deepEqual(x.counts, { calls: 2, test: 1, flagged: 0, withErrors: 1 });
  assert.equal(x.truncated, false);
  const cb = x.calls[1];
  assert.equal(cb.transcript[0].latencyMs, 820, 'every per-turn field the runtime stored travels with the transcript');
  assert.equal(cb.moments[0].quote, 'Bahut mehenga hai.');
  assert.deepEqual(cb.runtimeEvents.map((e: any) => e.type), ['call.started', 'turn']);
  assert.deepEqual(cb.errors.map((e: any) => e.where), ['runtime', 'analysis', 'tool']);
  assert.ok('allowedBy' in cb && 'cost' in cb && 'outcomes' in cb && 'judgeMarks' in cb, 'call.get\'s record, whole');
  assert.equal(JSON.stringify(x).includes('s3://synthetic'), false, 'no recording address or link');
  assert.deepEqual(Object.keys(cb.recording).sort(), ['available', 'why']);
  const audit = await one<{ actor_type: string; payload: any }>(pool, "SELECT actor_type, payload FROM audit_event WHERE workspace_id = $1 AND action = 'review.export'", [ws]);
  assert.equal(audit?.actor_type, 'vp_success');
  assert.equal(audit?.payload.calls, 2);

  const live = await registry.execute<any>(pool, 'review.export', { from: T0, to: '2026-10-24T12:00:00.000Z', includeTest: false }, ctx);
  assert.deepEqual(live.status === 'confirmed' && live.result.calls.map((c: any) => c.id), [b]);
  const one_ = await registry.execute<any>(pool, 'review.export', { from: T0, to: '2026-10-24T12:00:00.000Z', limit: 1 }, ctx);
  assert.deepEqual(one_.status === 'confirmed' && [one_.result.calls.length, one_.result.truncated], [1, true]);

  const member = await registry.execute<any>(pool, 'review.export', { from: T0, to: '2026-10-24T12:00:00.000Z' }, { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } });
  assert.notEqual(member.status, 'confirmed', 'an owner cannot export: staff only');
  const wide = await registry.execute<any>(pool, 'review.export', { from: T0, to: '2026-11-04T00:00:00.000Z' }, ctx);
  assert.equal(wide.status, 'not_executed');
  assert.match(wide.reason, /at most 7 days/);
});
