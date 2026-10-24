// The per-call trace (shared/runtime-protocol.ts CallTrace): call.ended stores it in conversation.trace, call.get returns it,
// and a malformed or oversized trace is refused. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Actor, Registry } from '../server/tools.ts';
import type { CallTrace, RuntimeEvent, RunManifest } from '../shared/runtime-protocol.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { ingest, validateRuntimeBatch } from '../server/modules/calls/ingest.ts';
import { analysesSettled } from '../server/modules/calls/analysis.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, [calls]).registry; });
after(async () => { await analysesSettled(); await pool?.end(); });

const m: RunManifest = { combinationId: 'c', stackId: 's', agentVersionHash: 'h', components: { stt: 'azure' }, fallbacksUsed: [], memory: 'none', runtimeVersion: 'r' };
const trace: CallTrace = { schema: 1, stack: { id: 's', combinationId: 'c' }, components: { stt: 'azure' },
  turns: [{ i: 0, speaker: 'agent', startMs: 0, door: [], interrupted: false, tts: { provider: 'azure', voice: 'v' } },
    { i: 1, speaker: 'caller', startMs: 2000, endMs: 2900, asrConfidence: 0.88 },
    { i: 2, speaker: 'agent', rid: 2, callerEndMs: 2900, firstAudioMs: 3410, gapMs: 510, door: [{ rule: 'RD1', action: 'replaced' }], interrupted: true }],
  events: [{ atMs: 3600, kind: 'barge_pause' }] };

async function convIn(ws: string) {
  return (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, channel) VALUES ($1,'phone') RETURNING id", [ws]))!.id;
}
const ended = (conv: string, t: unknown) => ({ conversationId: conv, events: [{ seq: 1, type: 'call.started', at: new Date().toISOString(), manifest: m },
  { seq: 2, type: 'call.ended', at: new Date().toISOString(), endReason: 'completed', durationS: 5, manifest: m, ...(t === undefined ? {} : { trace: t }),
    transcript: [{ speaker: 'agent', text: 'Namaste.', startMs: 0 }, { speaker: 'caller', text: 'Haan ji.', startMs: 2000 }, { speaker: 'agent', text: 'Achha.', startMs: 3410 }] }] as RuntimeEvent[] });

test('call.ended stores the trace and call.get returns it; none stays null', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('trace test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const ctx = { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } as Actor };
  const conv = await convIn(ws);
  await ingest(pool, ended(conv, trace));
  assert.deepEqual((await one<any>(pool, 'SELECT trace FROM conversation WHERE id = $1', [conv])).trace, trace);
  const g = await registry.execute<any>(pool, 'call.get', { conversationId: conv }, ctx);
  assert.equal(g.status, 'confirmed', JSON.stringify(g));
  assert.deepEqual(g.result.trace, trace);
  const bare = await convIn(ws);
  await ingest(pool, ended(bare, undefined));
  assert.equal((await one<any>(pool, 'SELECT trace FROM conversation WHERE id = $1', [bare])).trace, null);
});

test('the hook refuses a malformed or oversized trace and takes a good one', () => {
  const conv = '0b6f6e1a-1c2d-4e5f-8a9b-000000000009';
  const check = (t: unknown) => validateRuntimeBatch({ protocol: 1, ...ended(conv, t) });
  assert.doesNotThrow(() => check(trace)); assert.doesNotThrow(() => check(undefined));
  assert.throws(() => check({ schema: 2, turns: [], events: [] }), /schema 1 trace/);
  assert.throws(() => check([]), /must be an object/);
  assert.throws(() => check({ ...trace, events: [{ atMs: 0, kind: 'error', note: 'x'.repeat(500_000) }] }), /over 400000 bytes/);
});
