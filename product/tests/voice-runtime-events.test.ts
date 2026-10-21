// One source, both doors: product/voice writes the RuntimeEvent batches its sim calls produce to
// product/voice/tests/vectors/runtime_events.json (tests/test_runtime_fixture.py keeps it current), and this test runs
// them through calls' own hook validator. A runtime change that ingest would refuse with 422 fails here, not on a call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ingest from '../server/modules/calls/ingest.ts';

const { validateRuntimeBatch } = ((ingest as unknown as { default?: typeof ingest }).default ?? ingest);
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'voice', 'tests', 'vectors', 'runtime_events.json');
const calls = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, { protocol: number; conversationId: string; events: { type: string; outcome?: string }[] }[]>;

test('voice runtime fixture: every batch passes the hook validator', () => {
  for (const [name, batches] of Object.entries(calls)) {
    for (const b of batches) assert.doesNotThrow(() => validateRuntimeBatch(b), name);
  }
});

test('voice runtime fixture: covers every event type the runtime sends, and all three judge outcomes', () => {
  const events = Object.values(calls).flat().flatMap(b => b.events);
  assert.deepEqual(new Set(events.map(e => e.type)),
    new Set(['call.started', 'turn', 'cost', 'safety', 'moment', 'tool', 'hand_off', 'judge', 'call.ended']));
  assert.deepEqual(new Set(events.filter(e => e.type === 'judge').map(e => e.outcome)), new Set(['raised', 'shadow', 'unavailable']));
  const live = new Set(events.filter(e => e.type === 'moment').map(e => (e as unknown as { kind: string }).kind));
  for (const k of ['live_listen_started', 'live_listen_ended', 'whisper', 'takeover']) assert.ok(live.has(k), `supervisor moment ${k}`);
});

test('voice runtime fixture: call.ended is last and alone in its batch, seq strictly increasing per call', () => {
  for (const [name, batches] of Object.entries(calls)) {
    const last = batches[batches.length - 1];
    assert.deepEqual(last.events.map(e => e.type), ['call.ended'], name);
    const seqs = batches.flatMap(b => b.events.map(e => (e as unknown as { seq: number }).seq));
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), name);
    assert.equal(new Set(seqs).size, seqs.length, name);
  }
});

test('voice runtime fixture: the validator still refuses what it must (a text field on a judge event, a non-uuid id)', () => {
  const b = structuredClone(calls.judge_shadow[0]);
  const j = calls.judge_shadow.flatMap(x => x.events).find(e => e.type === 'judge')!;
  assert.throws(() => validateRuntimeBatch({ ...b, events: [{ ...j, callerText: 'x' }] }));
  assert.throws(() => validateRuntimeBatch({ ...b, conversationId: 'conv_test_1' }));
});
