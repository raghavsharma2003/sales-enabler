import test from 'node:test';
import assert from 'node:assert/strict';
import { createContinuousUnderstanding, type ContinuousSpeechHypothesis, type ContinuousUnderstandingSnapshot } from '../lib/voice/continuous-understanding';
import { compileRelationalRuntime } from '../lib/voice/relational-runtime';
import type { ConversationEntry } from '../lib/voice/emotional';

function hypothesis(overrides: Partial<ContinuousSpeechHypothesis> = {}): ContinuousSpeechHypothesis {
  return { type: 'hypothesis', sessionEpoch: 'speech-session', segmentId: 1, revision: 1, audioStartSample: 100,
    audioEndSample: 600, text: 'Please keep this conversation brief.', state: 'interim', ...overrides };
}
function setup() {
  const entries: ConversationEntry[] = [{ id: 'greeting', role: 'assistant', text: 'How can I help?' }];
  const updates: ContinuousUnderstandingSnapshot[] = [];
  const candidates: (string | undefined)[] = [];
  const controller = createContinuousUnderstanding({ getContext: () => ({ entries }), onUpdate: s => updates.push(s), onCandidate: value => candidates.push(value) });
  const start = () => { controller.progress(320, 20); controller.nativeSpeechStarted('native-1'); controller.progress(1600, 100); };
  const stable = () => { controller.receive(hypothesis()); controller.receive(hypothesis({ revision: 2, audioEndSample: 900 })); };
  return { controller, entries, updates, candidates, start, stable, last: () => updates.at(-1)! };
}

test('two matching interim compilations prepare exact existing guidance without publishing or changing final context', () => {
  const s = setup(); s.start();
  const before = structuredClone(s.entries);
  s.controller.receive(hypothesis());
  assert.equal(s.last().phase, 'tentative'); assert.equal(s.candidates.length, 0);
  s.controller.receive(hypothesis({ revision: 2, audioEndSample: 900 }));
  assert.equal(s.last().phase, 'preparing'); assert.equal(s.last().bound, true);
  assert.deepEqual(s.last().cues, { pace: 'brief', language: 'English', pauseRequested: false });
  assert.equal(s.candidates[0], compileRelationalRuntime({ entries: [...before, { id: 'native-1', role: 'user', text: hypothesis().text }] }).instructions);
  assert.deepEqual(s.entries, before);
  assert.deepEqual(Object.keys(s.controller).sort(), ['close', 'nativeFinal', 'nativeSpeechStarted', 'nativeSpeechStopped', 'progress', 'receive', 'reset', 'setMuted']);
});

test('revised negation removes prior candidate and recomputes from original final context', () => {
  const s = setup(); s.start(); s.stable();
  s.controller.receive(hypothesis({ revision: 3, audioEndSample: 1000, text: 'Do not keep this conversation brief.' }));
  assert.equal(s.candidates.at(-1), undefined); assert.equal(s.last().cues?.pace, 'normal'); assert.equal(s.last().phase, 'tentative');
  s.controller.receive(hypothesis({ revision: 4, audioEndSample: 1200, text: 'Do not keep this conversation brief.' }));
  assert.equal(s.last().phase, 'preparing'); assert.equal(s.last().cues?.pace, 'normal');
});

test('rewritten prefix invalidates stability even when communication guidance is unchanged', () => {
  const s = setup(); s.start(); s.stable();
  s.controller.receive(hypothesis({ revision: 3, audioEndSample: 1000, text: 'Please give me a brief reply.' }));
  assert.equal(s.last().phase, 'tentative'); assert.equal(s.candidates.at(-1), undefined);
});

test('delayed old segment cannot bind to a newer native generation', () => {
  const s = setup(); s.start(); s.stable();
  s.controller.nativeSpeechStopped('native-1');
  s.controller.progress(2000, 130); s.controller.nativeSpeechStarted('native-2'); s.controller.progress(3000, 190);
  s.controller.receive(hypothesis({ revision: 3, audioEndSample: 2600 }));
  assert.equal(s.last().bound, false); assert.equal(s.candidates.at(-1), undefined);
  s.controller.receive(hypothesis({ segmentId: 2, audioStartSample: 1800, audioEndSample: 2500 }));
  s.controller.receive(hypothesis({ segmentId: 2, revision: 2, audioStartSample: 1800, audioEndSample: 2700 }));
  assert.equal(s.last().phase, 'preparing');
});

test('cross-boundary unknown segments and old-generation finals cannot prepare', () => {
  const s = setup(); s.start(); s.controller.nativeSpeechStopped('native-1');
  s.controller.progress(2000, 130); s.controller.nativeSpeechStarted('native-2'); s.controller.progress(3000, 190);
  s.controller.receive(hypothesis({ audioStartSample: 1500, audioEndSample: 2600 }));
  s.controller.receive(hypothesis({ revision: 2, audioStartSample: 1500, audioEndSample: 2800 }));
  assert.equal(s.last().bound, false); assert.equal(s.candidates.length, 0);
  s.controller.nativeFinal('native-1');
  s.controller.receive(hypothesis({ segmentId: 2, audioStartSample: 1800, audioEndSample: 2700 }));
  assert.equal(s.last().bound, true, 'late final must not close the newer native input');
});

test('sidecar final never publishes or prepares and a split native turn remains ambiguous', () => {
  const s = setup(); s.start(); s.stable();
  s.controller.receive(hypothesis({ revision: 3, audioEndSample: 1000, state: 'sidecar_final' }));
  assert.equal(s.last().phase, 'awaiting_final'); assert.equal(s.candidates.at(-1), undefined); assert.equal(s.last().sidecarFinalCount, 1);
  s.controller.receive(hypothesis({ segmentId: 2, audioStartSample: 1050, audioEndSample: 1300 }));
  s.controller.receive(hypothesis({ segmentId: 2, revision: 2, audioStartSample: 1050, audioEndSample: 1500 }));
  assert.equal(s.last().bound, false); assert.equal(s.candidates.at(-1), undefined); assert.equal(s.entries.length, 1);
});

test('capture must be active before native start, and result must extend after that start', () => {
  const s = setup(); s.controller.nativeSpeechStarted('native-1'); s.controller.progress(1600, 100); s.stable();
  assert.equal(s.last().bound, false);
  s.controller.reset(); s.start(); s.controller.receive(hypothesis({ audioEndSample: 300 }));
  assert.equal(s.last().bound, false); assert.equal(s.candidates.length, 0);
});

test('duplicate, reordered, foreign-epoch, missing and impossible sample offsets clear preparation', () => {
  const changes: Partial<ContinuousSpeechHypothesis>[] = [
    { revision: 2 }, { revision: 1 }, { sessionEpoch: 'foreign' }, { audioStartSample: undefined },
    { audioEndSample: 1601 }, { audioEndSample: 90 }, { audioStartSample: 101 },
    { audioEndSample: 800 }, { revision: NaN }, { segmentId: -1 }, { text: 'x'.repeat(6001) },
  ];
  for (const change of changes) {
    const s = setup(); s.start(); s.stable();
    s.controller.receive(hypothesis({ revision: 3, audioEndSample: 1200, ...change }));
    assert.equal(s.last().bound, false, JSON.stringify(change)); assert.equal(s.candidates.at(-1), undefined);
    assert.equal(s.last().discardedCount, 1);
  }
});

test('regressing progress invalidates the timeline until explicit reset', () => {
  for (const progress of [[1500, 110], [1700, 90], [NaN, 110], [1700, NaN], [16_000 * 601, 110]]) {
    const s = setup(); s.start(); s.stable(); s.controller.progress(progress[0], progress[1]);
    s.controller.progress(3200, 200); s.controller.receive(hypothesis({ revision: 3, audioEndSample: 3000 }));
    assert.equal(s.last().bound, false); assert.equal(s.candidates.at(-1), undefined);
    s.controller.reset(); s.start(); s.stable(); assert.equal(s.last().phase, 'preparing');
  }
});

test('mute, native final and close clear ephemeral text and preparation', () => {
  const s = setup(); s.start(); s.stable(); s.controller.setMuted(true);
  assert.equal(s.last().phase, 'paused'); assert.equal(s.last().latest, undefined); assert.equal(s.candidates.at(-1), undefined);
  s.controller.setMuted(false); s.controller.receive(hypothesis({ revision: 3, audioEndSample: 1300 }));
  assert.equal(s.last().bound, false);
  s.controller.nativeFinal('native-1'); assert.equal(s.last().latest, undefined);
  s.controller.close(); assert.equal(s.last().phase, 'ended');
  const length = s.updates.length; s.controller.reset(); s.controller.receive(hypothesis()); s.controller.progress(2000, 200);
  assert.equal(s.updates.length, length);
});

test('close inside candidate callback cannot emit obsolete preparing snapshot', () => {
  const snapshots: ContinuousUnderstandingSnapshot[] = []; const candidates: (string | undefined)[] = [];
  const controller = createContinuousUnderstanding({ getContext: () => ({ entries: [] }), onUpdate: s => snapshots.push(s),
    onCandidate: value => { candidates.push(value); if (value) controller.close(); } });
  controller.progress(320, 20); controller.nativeSpeechStarted('native-1'); controller.progress(1600, 100);
  controller.receive(hypothesis()); controller.receive(hypothesis({ revision: 2 }));
  assert.equal(snapshots.at(-1)?.phase, 'ended'); assert.equal(snapshots.some(s => s.phase === 'preparing'), false);
  assert.equal(candidates.at(-1), undefined);
});

test('context and observer reentrancy cannot revive a closed controller or mutate snapshot state', () => {
  const snapshots: ContinuousUnderstandingSnapshot[] = [];
  const controller = createContinuousUnderstanding({ getContext: () => { controller.close(); return { entries: [] }; }, onUpdate: s => snapshots.push(s) });
  controller.progress(320, 20); controller.nativeSpeechStarted('native-1'); controller.progress(1600, 100); controller.receive(hypothesis());
  assert.equal(snapshots.at(-1)?.phase, 'ended');
  const s = setup(); s.start(); s.stable(); s.last().latest!.text = 'observer mutation'; s.last().cues!.pace = 'normal';
  s.controller.receive(hypothesis({ revision: 3, audioEndSample: 1200 }));
  assert.equal(s.last().phase, 'preparing'); assert.equal(s.last().cues?.pace, 'brief'); assert.equal(s.last().latest?.text, hypothesis().text);
});

test('haan is not assigned a floor intention or psychological state', () => {
  const s = setup(); s.start();
  s.controller.receive(hypothesis({ text: 'haan' })); s.controller.receive(hypothesis({ text: 'haan', revision: 2 }));
  assert.deepEqual(s.last().cues, { pace: 'normal', language: 'English', pauseRequested: false });
  assert.equal('floor' in s.last(), false); assert.equal('emotion' in s.last(), false);
});

test('missing intermediate revision requires two fresh consecutive compilations', () => {
  const s = setup(); s.start(); s.controller.receive(hypothesis());
  s.controller.receive(hypothesis({ revision: 3, audioEndSample: 1000 }));
  assert.equal(s.last().phase, 'tentative'); assert.equal(s.candidates.length, 0);
  s.controller.receive(hypothesis({ revision: 4, audioEndSample: 1200 }));
  assert.equal(s.last().phase, 'preparing');
});

test('tentative text cannot overwrite an already-finalized native item in supplied context', () => {
  const s = setup(); s.start(); s.stable();
  s.entries.push({ id: 'native-1', role: 'user', text: 'The final request is different.' });
  s.controller.receive(hypothesis({ revision: 3, audioEndSample: 1200 }));
  assert.equal(s.last().bound, false); assert.equal(s.candidates.at(-1), undefined);
  assert.equal(s.entries.at(-1)?.text, 'The final request is different.');
});
