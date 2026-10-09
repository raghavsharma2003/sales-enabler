import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateTurnScheduler } from '../lib/voice/private-turn-scheduler';
import { createVoiceDiagnostics, normalizeVoiceDiagnostics, type PrivatePreparationEvent } from '../lib/voice/diagnostics';

function harness() {
  let clock = 0, baseline = 'Approved company context. Disclose AI identity.';
  const sent: Record<string, any>[] = [], users: string[] = [], failures: string[] = [];
  const diagnostics = createVoiceDiagnostics(undefined, () => clock);
  diagnostics.ready();
  let onFinal: (text: string) => void = () => {};
  let onDiagnostic: (event: PrivatePreparationEvent) => void = () => {};
  const scheduler = createPrivateTurnScheduler({
    instructions: () => baseline, now: () => clock,
    send: event => sent.push(event), onDiagnostic: event => { diagnostics.privatePreparationEvent(event); onDiagnostic(event); },
    onUserTurn: turn => { users.push(turn.text); onFinal(turn.text); },
    fail: message => { failures.push(message); scheduler.close(); },
  });
  scheduler.updateBehavior('One concise answer.');
  const updates = () => sent.filter(event => event.type === 'session.update');
  const replies = () => sent.filter(event => event.type === 'response.create');
  const ack = (update = updates().at(-1)) => { assert.ok(update); scheduler.receive({ type: 'session.updated', session: update.session }); };
  const mic = (kind: string, item_id = 'mic') => scheduler.receive({ type: `input_audio_buffer.${kind}`, item_id });
  const asr = (transcript = 'A final question.', item_id = 'mic') => scheduler.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id, transcript });
  const delta = (text: string, item_id = 'mic') => scheduler.receive({ type: 'conversation.item.input_audio_transcription.delta', item_id, delta: text });
  const output = (response_id: string) => scheduler.receive({ type: 'response.output_audio.delta', response_id, delta: 'not retained' });
  return { scheduler, diagnostics, sent, users, failures, updates, replies, ack, mic, asr, delta, output,
    at: (time: number) => { clock = time; },
    baseline: (text: string) => { baseline = text; },
    onFinal: (callback: typeof onFinal) => { onFinal = callback; },
    onDiagnostic: (callback: typeof onDiagnostic) => { onDiagnostic = callback; },
  };
}

test('exact pre-ACK overlaps speech but never authorizes output until stop, commit and final publication', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started');
  assert.equal(h.updates().length, 1);
  h.at(20); h.ack(); h.ack();
  assert.equal(h.replies().length, 0);
  h.mic('committed'); h.asr();
  assert.deepEqual(h.users, []);
  assert.equal(h.replies().length, 0);
  h.mic('speech_stopped');
  assert.deepEqual(h.users, ['A final question.']);
  assert.equal(h.replies().length, 1);
  assert.equal(h.updates().length, 1, 'unchanged finalized guidance needs no second round trip');
  assert.equal(h.diagnostics.snapshot().privatePreparation?.preAckHits, 1);
  assert.deepEqual(h.diagnostics.snapshot().privatePreparation?.speechStopToFinalAsrMs, [], 'reversed events do not invent a stop-to-ASR sample');
});

test('all 24 stop/commit/final-ASR/ACK orderings preserve the same final eligibility boundary', () => {
  function permutations(items: string[]): string[][] {
    return items.length ? items.flatMap((item, index) => permutations(items.filter((_, other) => other !== index)).map(rest => [item, ...rest])) : [[]];
  }
  for (const order of permutations(['stop', 'commit', 'final', 'ack'])) {
    const h = harness();
    try {
      h.mic('speech_started'); const candidate = h.updates()[0];
      const seen = new Set<string>();
      for (const item of order) {
        seen.add(item);
        if (item === 'stop') h.mic('speech_stopped');
        else if (item === 'commit') h.mic('committed');
        else if (item === 'final') h.asr();
        else h.ack(candidate);
        const finalEligible = ['stop', 'commit', 'final'].every(key => seen.has(key));
        assert.equal(h.users.length, finalEligible ? 1 : 0, `publication: ${order.join(',')} at ${item}`);
        assert.equal(h.replies().length, finalEligible && seen.has('ack') ? 1 : 0, `reply: ${order.join(',')} at ${item}`);
      }
      h.ack(candidate); h.asr('duplicate'); h.mic('committed');
      assert.equal(h.replies().length, 1); assert.equal(h.users.length, 1); assert.equal(h.updates().length, 1);
    } finally { h.scheduler.close(); }
  }
});

test('revised partials only count observed timing capability and cannot publish, persist or change instructions', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started'); const candidate = h.updates()[0]; h.ack();
  h.delta('I am overwhelmed'); h.delta('I am not overwhelmed');
  h.mic('speech_stopped'); h.delta('not a live speech delta');
  h.mic('committed'); h.delta('after commit'); h.delta('unknown', 'uncorrelated');
  assert.deepEqual(h.users, []); assert.equal(h.replies().length, 0);
  assert.equal(h.updates().length, 1); assert.equal(h.updates()[0], candidate);
  h.asr('I am not overwhelmed.');
  assert.deepEqual(h.users, ['I am not overwhelmed.']); assert.equal(h.replies().length, 1);
  const value = h.diagnostics.snapshot().privatePreparation!;
  assert.equal(value.speechStarts, 1); assert.equal(value.asrDeltasBeforeCommit, 3);
  assert.equal(value.asrDeltasAfterCommit, 1); assert.equal(value.asrDeltasDuringSpeech, 2);
  assert.doesNotMatch(JSON.stringify(value), /overwhelmed|mic|not a live/);
});

for (const change of ['negation', 'language', 'baseline'] as const) test(`final callback ${change} change rejects candidate and requires exact new ACK`, t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started'); const candidate = h.updates()[0]; h.ack();
  h.onFinal(() => {
    if (change === 'baseline') h.baseline('Revised approved company context. Disclose AI identity.');
    else h.scheduler.updateBehavior(change === 'negation' ? 'Caller denies overwhelm; no emotional inference.' : 'Answer in Hindi.');
  });
  h.mic('speech_stopped'); h.mic('committed'); h.asr();
  assert.equal(h.updates().length, 2); assert.equal(h.replies().length, 0);
  assert.notEqual(h.updates()[1].session.instructions, candidate.session.instructions);
  h.ack(candidate); assert.equal(h.replies().length, 0);
  h.ack(); assert.equal(h.replies().length, 1);
  assert.equal(h.diagnostics.snapshot().privatePreparation?.preAckMisses, 1);
  assert.equal(h.diagnostics.snapshot().privatePreparation?.preAckHits, 0);
});

test('unchanged synchronous final guidance can reuse exact candidate after callback runs', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  let compiled = false;
  h.onFinal(() => { compiled = true; assert.equal(h.replies().length, 0); h.scheduler.updateBehavior('One concise answer.'); });
  h.mic('speech_started'); h.ack(); h.mic('speech_stopped'); h.mic('committed'); h.asr();
  assert.equal(compiled, true); assert.equal(h.replies().length, 1); assert.equal(h.updates().length, 1);
});

test('pending speculative update serializes changed final guidance until its ACK drains', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started'); const candidate = h.updates()[0];
  h.onFinal(() => h.scheduler.updateBehavior('Use final corrected guidance.'));
  h.mic('speech_stopped'); h.mic('committed'); h.asr();
  assert.deepEqual(h.users, ['A final question.']); assert.equal(h.updates().length, 1);
  h.scheduler.receive({ type: 'session.updated', session: { instructions: 'wrong acknowledgement' } });
  assert.equal(h.updates().length, 1); assert.equal(h.replies().length, 0);
  h.ack(candidate); assert.equal(h.updates().length, 2); assert.equal(h.replies().length, 0);
  h.ack(candidate); assert.equal(h.replies().length, 0);
  h.ack(); assert.equal(h.replies().length, 1);
});

test('generation change serializes updates and cannot reuse old ACK despite identical instructions', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started', 'old'); const old = h.updates()[0];
  h.mic('speech_stopped', 'old'); h.mic('committed', 'old'); h.asr('Earlier words.', 'old');
  h.mic('speech_started', 'new');
  assert.equal(h.updates().length, 1, 'only one update in flight');
  h.ack(old); const current = h.updates()[1];
  assert.ok(current); assert.notEqual(current.session.instructions, old.session.instructions);
  h.mic('speech_stopped', 'new'); h.mic('committed', 'new'); h.asr('Final words.', 'new');
  h.ack(old); assert.equal(h.replies().length, 0);
  h.ack(current); assert.equal(h.replies().length, 1);
  assert.deepEqual(h.users, ['Earlier words.', 'Final words.']);
});

test('all queued committed ASR publishes in speech order before comparing final candidate', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  for (const id of ['one', 'two']) { h.mic('speech_started', id); h.ack(); h.mic('speech_stopped', id); h.mic('committed', id); }
  h.onFinal(text => h.scheduler.updateBehavior(`Guidance for ${text}`));
  h.asr('second', 'two'); assert.deepEqual(h.users, []); assert.equal(h.replies().length, 0);
  h.asr('first', 'one');
  assert.deepEqual(h.users, ['first', 'second']);
  assert.match(h.updates().at(-1)!.session.instructions, /Guidance for second/);
  assert.equal(h.replies().length, 0); h.ack(); assert.equal(h.replies().length, 1);
});

test('barge-in preparation begins only after prior response cancellation drains', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.opening({ type: 'response.create' }); h.scheduler.responseCreated('opening');
  h.mic('speech_started'); assert.equal(h.updates().length, 0);
  h.scheduler.responseDone('unrelated', false, 'cancelled'); assert.equal(h.updates().length, 0);
  h.scheduler.responseDone('opening', false, 'cancelled'); assert.equal(h.updates().length, 1);
  h.ack(); assert.equal(h.replies().length, 1);
  h.mic('speech_stopped'); h.mic('committed'); h.asr(); assert.equal(h.replies().length, 2);
});

test('in-flight response creation is cancelled before candidate preparation begins', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('Earlier typed question.'); h.ack();
  h.mic('speech_started'); h.scheduler.responseCreated('late');
  assert.equal(h.sent.filter(event => event.type === 'response.cancel').length, 1);
  assert.equal(h.sent.filter(event => event.type === 'output_audio_buffer.clear').length, 1);
  assert.equal(h.updates().length, 1);
  h.scheduler.responseDone('late', false, 'cancelled');
  assert.equal(h.updates().length, 2); assert.equal(h.replies().length, 1);
});

test('tools fully drain before pre-ACK and their stale continuation never responds', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('Earlier typed question.'); h.ack(); h.scheduler.responseCreated('tools');
  const generation = h.scheduler.responseDone('tools', true)!;
  h.mic('speech_started'); h.delta('hypothesis');
  assert.equal(h.updates().length, 1); assert.equal(h.replies().length, 1);
  h.scheduler.toolsDone(generation); assert.equal(h.updates().length, 2);
  h.scheduler.toolsDone(generation); assert.equal(h.updates().length, 2);
  h.ack(); assert.equal(h.replies().length, 1);
  h.mic('speech_stopped'); h.mic('committed'); h.asr(); assert.equal(h.replies().length, 2);
});

test('close discards hypotheses, clears candidate timers and ignores late ACK/ASR/output', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(); h.mic('speech_started'); const candidate = h.updates()[0]; h.delta('Never final.');
  h.scheduler.close(); const before = h.diagnostics.snapshot();
  h.ack(candidate); h.asr(); h.output('late'); t.mock.timers.tick(20_000);
  assert.deepEqual(h.users, []); assert.equal(h.replies().length, 0); assert.deepEqual(h.failures, []);
  assert.deepEqual(h.diagnostics.snapshot(), before);
});

test('speculative ACK timeout fails closed and never converts a hypothesis into a turn', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started'); const candidate = h.updates()[0]; h.delta('Unfinished sentence.');
  t.mock.timers.tick(4_999); assert.deepEqual(h.failures, []);
  t.mock.timers.tick(1); assert.equal(h.failures.length, 1);
  h.ack(candidate); h.mic('speech_stopped'); h.mic('committed'); h.asr();
  assert.deepEqual(h.users, []); assert.equal(h.replies().length, 0);
});

test('callback shutdown prevents even an already ACKed matching candidate from creating a reply', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started'); h.ack(); h.onFinal(() => h.scheduler.close());
  h.mic('speech_stopped'); h.mic('committed'); h.asr();
  assert.deepEqual(h.users, ['A final question.']); assert.equal(h.replies().length, 0);
});

for (const stage of ['pre_ack', 'final_asr_to_guidance_ack'] as const) {
  test(`${stage} observer shutdown cannot throw or release the acknowledged reply`, () => {
    const h = harness();
    h.mic('speech_started'); h.ack();
    h.onDiagnostic(event => { if (event.type === stage) h.scheduler.close(); });
    h.mic('speech_stopped'); h.mic('committed');
    assert.doesNotThrow(() => h.asr());
    assert.equal(h.replies().length, 0); assert.deepEqual(h.users, ['A final question.']);
  });

  test(`${stage} observer new speech preserves the new candidate and cannot release an older reply`, t => {
    const h = harness(); t.after(() => h.scheduler.close());
    h.mic('speech_started'); const old = h.updates()[0]; h.ack();
    let interrupted = false;
    h.onDiagnostic(event => {
      if (event.type === stage && !interrupted) { interrupted = true; h.mic('speech_started', 'new'); }
    });
    h.mic('speech_stopped'); h.mic('committed'); h.asr();
    assert.equal(h.replies().length, 0); assert.equal(h.updates().length, 2);
    h.ack(old); h.ack(); assert.equal(h.replies().length, 0);
    h.mic('speech_stopped', 'new'); h.mic('committed', 'new'); h.asr('New final question.', 'new');
    assert.equal(h.replies().length, 1); assert.deepEqual(h.users, ['A final question.', 'New final question.']);
  });
}

test('diagnostic observer queued text cannot recursively release the same candidate', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started'); h.ack();
  h.onDiagnostic(event => { if (event.type === 'pre_ack') h.scheduler.sendText('Queued from observer.'); });
  h.mic('speech_stopped'); h.mic('committed'); h.asr();
  assert.equal(h.replies().length, 1); assert.deepEqual(h.users, ['A final question.']);
  h.scheduler.responseCreated('audio'); h.scheduler.responseDone('audio', false);
  assert.deepEqual(h.users, ['A final question.', 'Queued from observer.']);
  h.ack(); assert.equal(h.replies().length, 2);
});

test('client stage timings distinguish literal overlapping ACK span from response request latency', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.at(10); h.mic('speech_started'); h.at(20); h.ack();
  h.at(100); h.mic('speech_stopped'); h.mic('committed'); h.at(160); h.asr();
  h.scheduler.responseCreated('current'); h.at(170); h.output('wrong');
  h.at(190); h.output('current'); h.at(250); h.output('current');
  const value = h.diagnostics.snapshot().privatePreparation!;
  assert.deepEqual(value.speechStopToFinalAsrMs, [60]);
  assert.deepEqual(value.finalAsrToGuidanceAckMs, [0]);
  assert.deepEqual(value.guidanceAckToFirstOutputMs, [170]);
  assert.deepEqual(value.responseRequestToFirstOutputMs, [30]);
  assert.equal(value.preAckHits, 1);
});

test('fallback measures final-ASR to fresh ACK and interrupted output is excluded', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started'); h.at(20); h.ack();
  h.onFinal(() => h.scheduler.updateBehavior('Changed final guidance.'));
  h.at(100); h.mic('speech_stopped'); h.mic('committed'); h.at(130); h.asr();
  h.at(180); h.ack(); h.scheduler.responseCreated('current');
  h.at(200); h.mic('speech_started', 'interruption'); h.at(220); h.output('current');
  const value = h.diagnostics.snapshot().privatePreparation!;
  assert.deepEqual(value.finalAsrToGuidanceAckMs, [50]);
  assert.deepEqual(value.responseRequestToFirstOutputMs, []);
  assert.equal(value.preAckMisses, 1);
});

test('diagnostics stay optional for legacy sessions and bounded, cloned and allowlisted for persistence', () => {
  const diagnostics = createVoiceDiagnostics(); diagnostics.ready();
  const legacy = diagnostics.snapshot();
  assert.equal(Object.hasOwn(legacy, 'privatePreparation'), false);
  assert.deepEqual(normalizeVoiceDiagnostics(legacy), legacy);
  diagnostics.privatePreparationEvent({ type: 'speech_start' });
  for (let i = 0; i < 25; i++) diagnostics.privatePreparationEvent({ type: 'speech_stop_to_final_asr', ms: i });
  for (let i = 0; i < 10_005; i++) diagnostics.privatePreparationEvent({ type: 'asr_delta', beforeCommit: true, duringSpeech: true });
  diagnostics.privatePreparationEvent({ type: 'speech_stop_to_final_asr', ms: NaN });
  diagnostics.privatePreparationEvent({ type: 'speech_stop_to_final_asr', ms: -1 });
  diagnostics.privatePreparationEvent({ type: 'speech_stop_to_final_asr', ms: 600_001 });
  const snapshot = diagnostics.snapshot();
  assert.equal(snapshot.privatePreparation!.speechStopToFinalAsrMs.length, 20);
  assert.equal(snapshot.privatePreparation!.asrDeltasBeforeCommit, 10_000);
  assert.equal(snapshot.privatePreparation!.asrDeltasDuringSpeech, 10_000);
  const clean = normalizeVoiceDiagnostics({ ...snapshot, privatePreparation: { ...snapshot.privatePreparation, transcript: 'Must be discarded.' } });
  assert.deepEqual(clean, snapshot);
  snapshot.privatePreparation!.speechStopToFinalAsrMs.push(99);
  assert.equal(diagnostics.snapshot().privatePreparation!.speechStopToFinalAsrMs.length, 20);
  for (const invalid of [null, [], { ...clean!.privatePreparation, preAckHits: -1 }, { ...clean!.privatePreparation, speechStopToFinalAsrMs: [Infinity] }, { ...clean!.privatePreparation, asrDeltasDuringSpeech: 10_001 }]) {
    assert.equal(normalizeVoiceDiagnostics({ ...legacy, privatePreparation: invalid }), undefined);
  }
  diagnostics.end(); diagnostics.privatePreparationEvent({ type: 'speech_start' });
  assert.equal(diagnostics.snapshot().privatePreparation!.speechStarts, 1);
});
