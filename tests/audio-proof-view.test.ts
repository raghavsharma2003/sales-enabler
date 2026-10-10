import assert from 'node:assert/strict';
import test from 'node:test';
import { ExclusiveRequestGate } from '../lib/evaluations/audio-view';

test('audio proof admits one paid request until request preparation and execution settle', async () => {
  const gate = new ExclusiveRequestGate();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let started = 0;

  const first = gate.run(async () => { started += 1; await held; return 'first'; });
  const rapidSecond = gate.run(async () => { started += 1; return 'second'; });

  assert.equal(started, 1);
  assert.equal(await rapidSecond, undefined);
  release();
  assert.equal(await first, 'first');
  assert.equal(await gate.run(async () => { started += 1; return 'retry'; }), 'retry');
  assert.equal(started, 2);
});

test('audio proof releases the request gate when local request preparation fails', async () => {
  const gate = new ExclusiveRequestGate();
  await assert.rejects(gate.run(async () => { throw new Error('request ID unavailable'); }), /request ID unavailable/);
  assert.equal(await gate.run(async () => 'next attempt'), 'next attempt');
});
