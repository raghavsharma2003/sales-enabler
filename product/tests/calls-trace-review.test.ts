// The call page's timeline and call.explain's turnCauses: the runtime's per-call trace read turn by turn (shared/call-trace.ts).
// Only what the runtime stored is read; nothing is estimated. Synthetic, fictional data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { traceTurns, turnCauses } from '../shared/call-trace.ts';
import type { CallTrace } from '../shared/runtime-protocol.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, [calls]).registry; });
after(async () => { await pool?.end(); });

const transcript = [
  { speaker: 'agent', text: 'Namaste, main Riya bol rahi hoon, ek AI assistant.', startMs: 0 },
  { speaker: 'caller', text: 'Haan boliye.', startMs: 4000 },
  { speaker: 'agent', text: 'Aapki renewal 28 ko hai.', startMs: 6000 },
  { speaker: 'caller', text: 'Kitna premium hai?', startMs: 9000 },
  { speaker: 'agent', text: 'Main check karke batati hoon.', startMs: 13500 },
  { speaker: 'caller', text: 'Theek hai.', startMs: 16000 },
  { speaker: 'agent', text: 'Dhanyavaad.', startMs: 17500 },
];
const trace: CallTrace = { schema: 1, stack: { id: 'v2-flashlite', combinationId: 'c' }, components: {},
  turns: [
    { i: 0, speaker: 'agent', startMs: 0, door: [], interrupted: false },
    { i: 1, speaker: 'caller', startMs: 4000, asrConfidence: 0.95 },
    { i: 2, speaker: 'agent', startMs: 6000, gapMs: 700, door: [], interrupted: false, tts: { provider: 'gemini', voice: 'Kore' } },
    { i: 3, speaker: 'caller', startMs: 9000, asrConfidence: 0.41 },
    { i: 4, speaker: 'agent', startMs: 13500, gapMs: 2600, door: [{ rule: 'RD6', action: 'replaced' }], interrupted: true },
    { i: 5, speaker: 'caller', startMs: 16000, asrConfidence: 0.9 },
    { i: 6, speaker: 'agent', startMs: 17500, gapMs: 800, door: [], interrupted: false },
    { i: 99, speaker: 'agent', startMs: 1, gapMs: 9999, door: [], interrupted: false },       // points past the transcript: ignored
  ],
  events: [{ atMs: 14000, kind: 'fallback', component: 'brain' }, { atMs: 16500, kind: 'tool', name: 'lookup_order', status: 'failed' }, { atMs: 100, kind: 'backchannel' }] };

test('each turn gets its own figures and what went wrong on it, from the trace only', () => {
  const rows = traceTurns(transcript, trace);
  assert.equal(rows.length, 7, 'one row per transcript turn; a row pointing past it is ignored');
  assert.deepEqual(rows.map(r => r.gapMs), [null, null, 700, null, 2600, null, 800]);
  assert.equal(rows[2].tts, 'gemini · Kore');
  assert.deepEqual(rows[3].causes.map(c => c.kind), ['asr_low']);
  assert.match(rows[3].causes[0].text, /^Speech recognition was unsure what the caller said \(confidence 0\.41\)/);
  assert.deepEqual(rows[4].causes.map(c => c.kind), ['reply_gap', 'door_held', 'cut_off', 'fallback'], 'an event goes to the turn under way when it happened');
  assert.match(rows[4].causes[0].text, /^Slow reply: 2,600 ms from the caller finishing to her first audio \(the call's median was 800 ms\)\.$/);
  assert.deepEqual(rows[5].causes.map(c => c.kind), ['tool_failed']);
  assert.deepEqual([rows[0].causes, rows[2].causes, rows[6].causes], [[], [], []], 'a backchannel is not a fault; ordinary gaps are not marked');
  assert.deepEqual(turnCauses(transcript, trace).map(c => [c.turn, c.kind]), [[3, 'asr_low'], [4, 'reply_gap'], [4, 'door_held'], [4, 'cut_off'], [4, 'fallback'], [5, 'tool_failed']]);
  for (const c of turnCauses(transcript, trace)) {
    assert.doesNotMatch(c.text, /\bRD\d+\b|_|brain|lookup/, `plain words only: ${c.text}`);
    assert.equal(c.fix, null, 'no fix is suggested without a marker that says what to fix');
  }
  assert.deepEqual(traceTurns(transcript, null), []);
  assert.deepEqual(traceTurns(transcript, { ...trace, schema: 2 } as unknown as CallTrace), [], 'an unknown schema is not read');
});

test('call.explain returns the causes with the turn and time; a call without a trace returns none', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('trace') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const ctx = { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } as Actor };
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, channel, status, transcript, trace) VALUES ($1,'phone','done',$2,$3) RETURNING id", [ws, JSON.stringify(transcript), JSON.stringify(trace)]))!.id;
  const e = await registry.execute<any>(pool, 'call.explain', { conversationId: conv }, ctx);
  if (e.status !== 'confirmed') return assert.fail(JSON.stringify(e));
  assert.deepEqual(e.result.turnCauses.map((c: any) => [c.turn, c.kind, c.atMs]), [[3, 'asr_low', 9000], [4, 'reply_gap', 13500], [4, 'door_held', 13500], [4, 'cut_off', 13500], [4, 'fallback', 14000], [5, 'tool_failed', 16500]]);
  assert.deepEqual(e.result.turnCauses[2].evidence, { rule: 'RD6', action: 'replaced' }, 'the trace\'s own figures travel as evidence');
  const g = await registry.execute<any>(pool, 'call.get', { conversationId: conv }, ctx);
  assert.deepEqual(g.status === 'confirmed' && traceTurns(g.result.transcript, g.result.trace).flatMap(t => t.causes), e.result.turnCauses, 'the page (reading call.get) and call.explain agree');
  const bare = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, channel, status, transcript) VALUES ($1,'phone','done',$2) RETURNING id", [ws, JSON.stringify(transcript)]))!.id;
  const b = await registry.execute<any>(pool, 'call.explain', { conversationId: bare }, ctx);
  assert.deepEqual(b.status === 'confirmed' && b.result.turnCauses, []);
});
