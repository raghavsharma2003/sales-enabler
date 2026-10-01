import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateTurnScheduler } from '../lib/voice/private-turn-scheduler';

function harness() {
  const sent: Record<string, any>[] = [], users: string[] = [], failures: string[] = [];
  const scheduler = createPrivateTurnScheduler({
    instructions: () => 'Immutable approved baseline. Disclose AI identity.',
    send: event => sent.push(event),
    onUserTurn: turn => { users.push(turn.text); scheduler.updateBehavior(`Guide for ${turn.text}`); },
    fail: message => { failures.push(message); scheduler.close(); },
  });
  const updates = () => sent.filter(event => event.type === 'session.update');
  const replies = () => sent.filter(event => event.type === 'response.create');
  const ack = (update = updates().at(-1)) => { assert.ok(update); return scheduler.receive({ type: 'session.updated', session: update.session }); };
  const mic = (type: string, id: string, transcript?: string) => scheduler.receive({ type: `input_audio_buffer.${type}`, item_id: id, transcript });
  const asr = (id: string, text: string) => scheduler.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: text });
  return { scheduler, sent, users, failures, updates, replies, ack, mic, asr };
}

test('typed guidance precedes response and exact unique acknowledgement releases once', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('first');
  const item = h.sent.find(event => event.type === 'conversation.item.create')!.item;
  assert.equal(Object.hasOwn(item, 'id'), false, 'browser-local transcript IDs must not be sent as provider item IDs');
  assert.deepEqual(h.users, ['first']);
  assert.match(h.updates()[0].session.instructions, /Immutable approved baseline.*[\s\S]*Guide for first/);
  assert.equal(h.replies().length, 0);
  h.scheduler.receive({ type: 'session.updated', session: { instructions: 'unrelated' } });
  assert.equal(h.replies().length, 0);
  h.ack(); h.ack();
  assert.equal(h.replies().length, 1);
});

test('queued turns cannot publish newer transcripts or overwrite the waiting guidance', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('first'); h.scheduler.sendText('second');
  const first = h.updates()[0];
  assert.deepEqual(h.users, ['first']);
  h.scheduler.updateBehavior('An unrelated later staged change');
  assert.equal(h.updates().length, 1);
  h.ack(first);
  h.scheduler.responseCreated('one'); h.scheduler.responseDone('one', false);
  assert.deepEqual(h.users, ['first', 'second']);
  assert.match(h.updates()[1].session.instructions, /Guide for second/);
  h.ack(first);
  assert.equal(h.replies().length, 1);
  h.ack(); h.scheduler.responseDone('one', false);
  assert.equal(h.replies().length, 2);
});

test('same guidance uses a distinct ack revision on subsequent turns', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('same'); const first = h.updates()[0]; h.ack();
  h.scheduler.responseCreated('one'); h.scheduler.responseDone('one', false); h.scheduler.sendText('same');
  assert.notEqual(h.updates()[1].session.instructions, first.session.instructions);
  h.ack(first); assert.equal(h.replies().length, 1);
  h.ack(); assert.equal(h.replies().length, 2);
});

test('tool continuation keeps the current snapshot and blocks queued typed turns', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('first'); h.ack();
  h.scheduler.responseCreated('tools');
  const generation = h.scheduler.responseDone('tools', true)!;
  h.scheduler.sendText('second'); h.scheduler.updateBehavior('future staged guidance');
  assert.equal(h.scheduler.responseDone('tools', true), undefined);
  h.scheduler.toolsDone(generation);
  h.scheduler.toolsDone(generation);
  assert.equal(h.updates().length, 2, 'duplicate tool completion cannot create another gate');
  assert.match(h.updates()[1].session.instructions, /Guide for first/);
  assert.deepEqual(h.users, ['first']);
  h.ack(); h.scheduler.responseCreated('continuation'); h.scheduler.responseDone('continuation', false);
  assert.deepEqual(h.users, ['first', 'second']);
});

test('microphone waits for both commit and ASR, then exact current guidance acknowledgement', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started', 'mic'); h.mic('speech_stopped', 'mic');
  h.asr('mic', 'spoken correction');
  assert.equal(h.updates().length, 0);
  h.mic('committed', 'mic');
  assert.deepEqual(h.users, ['spoken correction']);
  assert.equal(h.replies().length, 0);
  h.ack(); h.asr('mic', 'duplicate'); h.mic('committed', 'mic'); h.ack();
  assert.equal(h.replies().length, 1);
  assert.deepEqual(h.users, ['spoken correction']);
});

test('out-of-order ASR is published in speech order and produces one response for the latest turn', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  for (const id of ['old', 'new']) { h.mic('speech_started', id); h.mic('speech_stopped', id); h.mic('committed', id); }
  h.asr('new', 'new guidance');
  assert.deepEqual(h.users, []);
  h.asr('old', 'old guidance');
  assert.deepEqual(h.users, ['old guidance', 'new guidance']);
  assert.equal(h.updates().length, 1);
  assert.match(h.updates()[0].session.instructions, /Guide for new guidance/);
  h.ack(); assert.equal(h.replies().length, 1);
});

test('new speech invalidates a pending older ack without reviving it on late duplicate ASR', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started', 'old'); h.mic('speech_stopped', 'old'); h.mic('committed', 'old'); h.asr('old', 'old');
  const old = h.updates()[0];
  h.mic('speech_started', 'new'); h.ack(old);
  assert.equal(h.replies().length, 0);
  h.mic('speech_stopped', 'new'); h.mic('committed', 'new'); h.asr('new', 'new');
  h.asr('old', 'late old'); h.ack(old);
  assert.equal(h.replies().length, 0);
  h.ack(); assert.equal(h.replies().length, 1);
  assert.deepEqual(h.users, ['old', 'new']);
});

test('barge-in waits for provider cancellation, then acknowledges new mic guidance', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('first'); h.ack(); h.scheduler.responseCreated('active');
  h.mic('speech_started', 'new'); h.mic('speech_stopped', 'new'); h.mic('committed', 'new'); h.asr('new', 'new');
  assert.equal(h.updates().length, 1);
  h.scheduler.responseDone('active', false);
  assert.equal(h.updates().length, 2);
  h.ack(); assert.equal(h.replies().length, 2);
  assert.equal(h.sent.filter(event => event.type === 'response.cancel').length, 0, 'ordinary VAD cancellation stays provider-owned');
});

test('response created across speech-start race is cancelled and WebRTC history cleared once', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('first'); h.ack();
  h.mic('speech_started', 'new');
  h.scheduler.responseCreated('late'); h.scheduler.responseCreated('late');
  assert.equal(h.sent.filter(event => event.type === 'response.cancel').length, 1);
  assert.equal(h.sent.filter(event => event.type === 'output_audio_buffer.clear').length, 1);
  const cancel = h.sent.find(event => event.type === 'response.cancel')!;
  assert.equal(h.scheduler.receive({ type: 'error', error: { code: 'response_cancel_not_active', event_id: cancel.event_id } }), true);
  assert.equal(h.scheduler.receive({ type: 'error', error: { code: 'response_cancel_not_active', event_id: 'unrelated' } }), false);
});

test('speech during tool execution suppresses stale continuation while allowing the new turn', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('first'); h.ack();
  h.scheduler.responseCreated('tools');
  const generation = h.scheduler.responseDone('tools', true)!;
  h.mic('speech_started', 'new'); h.mic('speech_stopped', 'new'); h.mic('committed', 'new'); h.asr('new', 'new');
  h.scheduler.toolsDone(generation);
  assert.equal(h.updates().length, 2);
  assert.match(h.updates()[1].session.instructions, /Guide for new/);
  assert.equal(h.replies().length, 1); h.ack(); assert.equal(h.replies().length, 2);
});

test('five-second ack timeout fails closed and late ack cannot respond', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('first'); const update = h.updates()[0];
  t.mock.timers.tick(4_999); assert.equal(h.failures.length, 0);
  t.mock.timers.tick(1); assert.equal(h.failures.length, 1);
  h.ack(update); assert.equal(h.replies().length, 0);
});

test('close clears ack and ASR timers and rejects all late work', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  h.scheduler.sendText('first'); const update = h.updates()[0];
  h.mic('speech_started', 'new'); h.mic('speech_stopped', 'new'); h.mic('committed', 'new');
  h.scheduler.close(); h.ack(update); h.asr('new', 'late');
  h.scheduler.toolsDone(0); t.mock.timers.tick(20_000);
  assert.equal(h.scheduler.sendText('late'), false);
  assert.equal(h.replies().length, 0); assert.deepEqual(h.failures, []);
});

test('missing ASR fails boundedly rather than replying without current guidance', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started', 'new'); h.mic('speech_stopped', 'new'); h.mic('committed', 'new');
  t.mock.timers.tick(10_000);
  assert.equal(h.failures.length, 1); assert.equal(h.replies().length, 0);
});

test('provider cancellation cannot leave microphone turns stalled indefinitely', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('first'); h.ack(); h.scheduler.responseCreated('active');
  h.mic('speech_started', 'new');
  t.mock.timers.tick(5_000);
  assert.equal(h.failures.length, 1);
  assert.match(h.failures[0], /interrupting/);
  h.scheduler.responseDone('active', false); assert.equal(h.replies().length, 1);
});

test('uncorrelated late ASR cannot create a turn or overwrite current guidance', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('current'); h.asr('unknown-old', 'obsolete'); h.ack();
  assert.deepEqual(h.users, ['current']);
  assert.equal(h.replies().length, 1);
});

test('missing approved baseline cannot bypass the acknowledgement gate', () => {
  const sent: object[] = [], failures: string[] = [];
  const scheduler = createPrivateTurnScheduler({ instructions: () => '', send: event => sent.push(event), onUserTurn() {}, fail: message => { failures.push(message); scheduler.close(); } });
  assert.equal(scheduler.sendText('first'), false);
  assert.equal(failures.length, 1);
  assert.equal(sent.some(event => (event as { type: string }).type === 'response.create'), false);
});

test('unbound terminal IDs cannot consume a pending response request', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('first'); h.ack(); h.scheduler.sendText('second');
  for (const id of [undefined, '', 'x'.repeat(129), 'unbound']) h.scheduler.responseDone(id, false);
  assert.equal(h.updates().length, 1);
  h.scheduler.responseCreated('bound'); h.scheduler.responseDone('bound', false);
  assert.equal(h.updates().length, 2);
});
