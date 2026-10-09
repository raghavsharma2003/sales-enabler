import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoiceDiagnostics, normalizeVoiceDiagnostics, type ContinuousSpeechDiagnostics } from '../lib/voice/diagnostics';

const complete: ContinuousSpeechDiagnostics = {
  status: 'ready',
  submittedSamples: 9_600_000,
  interimCount: 10_000,
  sidecarFinalCount: 2,
  discardedCount: 3,
  candidateUpdates: 4,
};

function legacy() {
  return {
    status: 'ready' as const,
    measurement: 'client_observed_events' as const,
    clientObservedTurnMs: [],
    toolCalls: { requested: 0, available: 0, awaitingReview: 0, unavailable: 0 },
  };
}

test('continuous speech persistence accepts only complete bounded metadata', () => {
  assert.deepEqual(normalizeVoiceDiagnostics({ ...legacy(), continuousSpeech: complete }), { ...legacy(), continuousSpeech: complete });
  for (const continuousSpeech of [
    null,
    {},
    { ...complete, status: 'unknown' },
    { ...complete, reason: 'unknown' },
    { ...complete, submittedSamples: -1 },
    { ...complete, submittedSamples: 9_600_001 },
    { ...complete, submittedSamples: 1.5 },
    { ...complete, interimCount: -1 },
    { ...complete, sidecarFinalCount: 10_001 },
    { ...complete, discardedCount: Number.NaN },
    { ...complete, candidateUpdates: 0.5 },
  ]) assert.equal(normalizeVoiceDiagnostics({ ...legacy(), continuousSpeech }), undefined);
});

test('normalization strips hypotheses, prompts, identifiers and other untrusted fields', () => {
  const normalized = normalizeVoiceDiagnostics({
    ...legacy(), providerSessionId: 'outer-secret', prompt: 'outer prompt',
    continuousSpeech: {
      ...complete, reason: 'backpressure', hypothesisText: 'private partial', prompt: 'private prompt',
      sessionEpoch: 'epoch-secret', segmentId: 99, providerPayload: { text: 'private' },
    },
  });
  assert.deepEqual(normalized, { ...legacy(), continuousSpeech: { ...complete, reason: 'backpressure' } });
  assert.doesNotMatch(JSON.stringify(normalized), /secret|private|prompt|hypothesis|segment/i);
});

test('updates merge bounded fields without resetting private preparation and snapshots are independent', () => {
  const reported: ReturnType<ReturnType<typeof createVoiceDiagnostics>['snapshot']>[] = [];
  const diagnostics = createVoiceDiagnostics(snapshot => reported.push(snapshot));
  diagnostics.continuousSpeechUpdate({ status: 'connecting' });
  diagnostics.ready();
  diagnostics.privatePreparationEvent({ type: 'speech_start' });
  diagnostics.continuousSpeechUpdate({ submittedSamples: 320, interimCount: 1 });
  diagnostics.continuousSpeechUpdate({ status: 'ready', sidecarFinalCount: 1, discardedCount: 2, candidateUpdates: 3 });

  const snapshot = diagnostics.snapshot();
  assert.deepEqual(snapshot.continuousSpeech, {
    status: 'ready', submittedSamples: 320, interimCount: 1, sidecarFinalCount: 1, discardedCount: 2, candidateUpdates: 3,
  });
  assert.equal(snapshot.privatePreparation?.speechStarts, 1);
  snapshot.continuousSpeech!.submittedSamples = 0;
  snapshot.privatePreparation!.speechStarts = 0;
  assert.equal(diagnostics.snapshot().continuousSpeech?.submittedSamples, 320);
  assert.equal(diagnostics.snapshot().privatePreparation?.speechStarts, 1);
  reported.at(-1)!.continuousSpeech!.candidateUpdates = 0;
  assert.equal(diagnostics.snapshot().continuousSpeech?.candidateUpdates, 3);
});

test('invalid partial updates are rejected atomically and unknown fields are not retained', () => {
  const diagnostics = createVoiceDiagnostics();
  diagnostics.continuousSpeechUpdate({ ...complete, submittedSamples: 100, interimCount: 1 });
  const before = diagnostics.snapshot();
  for (const update of [
    { status: 'unknown' },
    { reason: 'transcript' },
    { submittedSamples: -1 },
    { submittedSamples: 9_600_001 },
    { interimCount: 10_001 },
    { sidecarFinalCount: -1 },
    { discardedCount: 1.1 },
    { candidateUpdates: Number.POSITIVE_INFINITY },
  ]) diagnostics.continuousSpeechUpdate(update as Partial<ContinuousSpeechDiagnostics>);
  diagnostics.continuousSpeechUpdate({ hypothesisText: 'never retain', prompt: 'secret', sessionEpoch: 'id' } as Partial<ContinuousSpeechDiagnostics>);
  assert.deepEqual(diagnostics.snapshot(), before);
  assert.doesNotMatch(JSON.stringify(diagnostics.snapshot()), /never retain|secret|sessionEpoch/);
});

test('ending closes active continuous diagnostics, preserves unavailable evidence, and ignores later updates', () => {
  for (const activeStatus of ['connecting', 'ready'] as const) {
    const diagnostics = createVoiceDiagnostics();
    diagnostics.continuousSpeechUpdate({ status: activeStatus, submittedSamples: 640, interimCount: 2 });
    diagnostics.end();
    const ended = diagnostics.snapshot();
    assert.equal(ended.continuousSpeech?.status, 'ended');
    assert.equal(ended.continuousSpeech?.submittedSamples, 640);
    diagnostics.continuousSpeechUpdate({ status: 'ready', submittedSamples: 960, interimCount: 3 });
    assert.deepEqual(diagnostics.snapshot(), ended);
  }

  const unavailable = createVoiceDiagnostics();
  unavailable.continuousSpeechUpdate({ status: 'unavailable', reason: 'microphone', discardedCount: 7 });
  unavailable.end();
  assert.deepEqual(unavailable.snapshot().continuousSpeech, {
    status: 'unavailable', reason: 'microphone', submittedSamples: 0, interimCount: 0, sidecarFinalCount: 0, discardedCount: 7, candidateUpdates: 0,
  });
});

test('legacy diagnostics still round-trip without continuous speech metadata', () => {
  assert.deepEqual(normalizeVoiceDiagnostics(legacy()), legacy());
  assert.equal(Object.hasOwn(normalizeVoiceDiagnostics(legacy())!, 'continuousSpeech'), false);
  assert.equal(Object.hasOwn(createVoiceDiagnostics().snapshot(), 'continuousSpeech'), false);
});
