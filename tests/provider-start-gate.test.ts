import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceStartGate } from "../lib/voice/start-gate";

test("ending during a delayed preview discards its result before provider connection", async () => {
  const gate = createVoiceStartGate();
  let resolvePreview!: (value: { instructions: string }) => void;
  const preview = new Promise<{ instructions: string }>(resolve => { resolvePreview = resolve; });
  const attempt = gate.begin();
  let providerConnections = 0;
  const start = async () => {
    const result = await attempt.currentResult(preview);
    if (!result || !attempt.isCurrent()) return;
    providerConnections++;
  };
  const pending = start();
  gate.cancel();
  assert.equal(attempt.signal.aborted, true);
  resolvePreview({ instructions: "late compiled context" });
  await pending;
  assert.equal(providerConnections, 0);
});

test("a newer attempt invalidates previous callbacks without cancelling itself", async () => {
  const gate = createVoiceStartGate();
  const oldAttempt = gate.begin();
  const nextAttempt = gate.begin();
  assert.equal(oldAttempt.signal.aborted, true);
  assert.equal(oldAttempt.isCurrent(), false);
  assert.equal(nextAttempt.signal.aborted, false);
  assert.equal(nextAttempt.isCurrent(), true);
  assert.deepEqual(await nextAttempt.currentResult(Promise.resolve({ ready: true })), { ready: true });
});
