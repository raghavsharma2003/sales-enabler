import assert from 'node:assert/strict';
import test from 'node:test';
// The production probe is plain ESM so it can run without the app toolchain.
import { pushPcmInRealTime } from '../scripts/lib/azure-streaming-recognition-pacing.mjs';

test('paced PCM starts before an SDK callback that is deferred until first audio', async () => {
  let clock = 0;
  let startCallbackObserved = false;
  let firstPcmObserved = false;
  let inputClosed = false;
  let deferredStart: (() => void) | undefined;
  const mockRecognizer = {
    startContinuousRecognitionAsync(callback: () => void) { deferredStart = callback; },
  };
  mockRecognizer.startContinuousRecognitionAsync(() => { startCallbackObserved = true; });
  assert.equal(startCallbackObserved, false);

  const result = await pushPcmInRealTime({
    pcm: new Uint8Array(1_920), bytesPerChunk: 960, chunkMs: 20,
    write: () => {
      firstPcmObserved = true;
      if (!startCallbackObserved) deferredStart?.();
    },
    close: () => { inputClosed = true; },
    now: () => clock,
    wait: async (milliseconds: number) => { clock += milliseconds; },
  });

  assert.equal(firstPcmObserved, true);
  assert.equal(startCallbackObserved, true, 'first PCM releases the deliberately deferred SDK callback');
  assert.deepEqual(result, { completed: true, chunks: 2, bytes: 1_920, completedAt: 40 });
  assert.equal(inputClosed, true);
});
