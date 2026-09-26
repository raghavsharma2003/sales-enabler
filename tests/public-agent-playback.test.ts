import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicPlaybackLedger } from '../lib/public-agent/playback';

test('fully heard browser playback carries only a heard watermark, including fractional duration', () => {
  const ledger = new PublicPlaybackLedger();
  ledger.schedule({ itemId: 'heard', responseId: 'response-1', start: 1, duration: 2401 / 24000, now: 0 });
  assert.deepEqual(ledger.interrupt(1.2), { lastHeardItemId: 'heard', playedMs: 100 });
});

test('completed durations retain exact samples at nonzero audio clocks without trimming a heard millisecond', () => {
  const ledger = new PublicPlaybackLedger();
  ledger.schedule({ itemId: 'heard', responseId: 'response-1', start: 4, duration: 0.1, now: 3 });
  assert.deepEqual(ledger.interrupt(4.2), { lastHeardItemId: 'heard', playedMs: 100 });
  const partial = new PublicPlaybackLedger();
  partial.schedule({ itemId: 'partial', responseId: 'response-1', start: 4, duration: 0.1, now: 3 });
  assert.deepEqual(partial.interrupt(4.0495), { itemId: 'partial', playedMs: 49 });
  const boundary = new PublicPlaybackLedger();
  boundary.schedule({ itemId: 'partial', responseId: 'response-1', start: 4, duration: 0.1, now: 3 });
  assert.deepEqual(boundary.interrupt(4.05), { itemId: 'partial', playedMs: 50 });
});

test('partial browser playback selects first unheard item, returns integer milliseconds and clears later queued items', () => {
  const ledger = new PublicPlaybackLedger();
  for (const [index, id] of ['heard', 'partial', 'later'].entries()) ledger.schedule({ itemId: id, responseId: 'response-1', start: index / 8, duration: 1 / 8, now: 0 });
  assert.deepEqual(ledger.interrupt(0.1875), { itemId: 'partial', playedMs: 62 });
  assert.equal(ledger.schedule({ itemId: 'later', responseId: 'response-1', start: 1, duration: 0.1, now: 0.2 }), false);
  assert.equal(ledger.schedule({ itemId: 'late-new-item', responseId: 'response-1', start: 1, duration: 0.1, now: 0.2 }), false);
  assert.equal(ledger.schedule({ itemId: 'new-answer', responseId: 'response-2', start: 1, duration: 0.1, now: 0.2 }), true);
});

test('playback scheduling gaps do not count as heard audio and repeated interruption cannot truncate twice', () => {
  const ledger = new PublicPlaybackLedger();
  ledger.schedule({ itemId: 'one-item', responseId: 'response-1', start: 0, duration: 0.125, now: 0 });
  ledger.schedule({ itemId: 'one-item', responseId: 'response-1', start: 1, duration: 0.125, now: 0 });
  assert.deepEqual(ledger.interrupt(1.0625), { itemId: 'one-item', playedMs: 187 });
  assert.deepEqual(ledger.interrupt(1.0625), { playedMs: 0 });
});

test('playback ledger rejects item ownership changes and bounds retained items', () => {
  const ledger = new PublicPlaybackLedger();
  ledger.schedule({ itemId: 'item-0', responseId: 'response-1', start: 0, duration: 0.1, now: 0 });
  assert.throws(() => ledger.schedule({ itemId: 'item-0', responseId: 'response-2', start: 1, duration: 0.1, now: 0 }), /ownership/);
  for (let i = 1; i < 100; i++) ledger.schedule({ itemId: `item-${i}`, responseId: 'response-1', start: i, duration: 0.1, now: 0 });
  assert.throws(() => ledger.schedule({ itemId: 'item-100', responseId: 'response-1', start: 100, duration: 0.1, now: 0 }), /limit/);
});
