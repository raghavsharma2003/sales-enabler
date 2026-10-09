import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateTurnScheduler } from '../lib/voice/private-turn-scheduler';

function scenario() {
  const sent: Record<string, any>[] = [], users: string[] = [];
  let authoritative = 'Normal pace.';
  const turns = createPrivateTurnScheduler({
    instructions: () => 'Approved business AI.', send: event => sent.push(event),
    onUserTurn: turn => { users.push(turn.text); turns.updateBehavior(authoritative); },
    fail: message => { throw new Error(message); },
  });
  turns.updateBehavior(authoritative);
  const updates = () => sent.filter(event => event.type === 'session.update');
  const replies = () => sent.filter(event => event.type === 'response.create');
  const ack = (event = updates().at(-1)) => { assert.ok(event); return turns.receive({ type: 'session.updated', session: event.session }); };
  const event = (type: string, item_id = 'native-a') => turns.receive({ type: `input_audio_buffer.${type}`, item_id });
  const finish = (guidance: string, id = 'native-a') => {
    authoritative = guidance;
    event('speech_stopped', id); event('committed', id);
    turns.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: 'The complete caller statement.' });
  };
  return { turns, users, updates, replies, ack, event, finish };
}

test('revisable guidance can prepare during speech but only exact authoritative final guidance releases it', t => {
  const h = scenario(); t.after(() => h.turns.close());
  h.event('speech_started'); h.ack();
  assert.equal(h.turns.prepareBehavior('One short answer.'), true); h.ack();
  assert.deepEqual(h.users, []); assert.equal(h.replies().length, 0);
  h.finish('One short answer.');
  assert.equal(h.updates().length, 2);
  assert.equal(h.users.length, 1); assert.equal(h.replies().length, 1);
});

test('a correction replaces preparation without mutating authoritative behavior', t => {
  const h = scenario(); t.after(() => h.turns.close());
  h.event('speech_started'); h.ack();
  h.turns.prepareBehavior('Pause the conversation.'); h.ack();
  h.turns.prepareBehavior(undefined); h.ack();
  assert.match(h.updates().at(-1)!.session.instructions, /Normal pace/);
  assert.doesNotMatch(h.updates().at(-1)!.session.instructions, /Pause the conversation/);
  h.finish('Normal pace.');
  assert.equal(h.replies().length, 1);
});

test('final disagreement cannot reuse a prepared but incorrect hypothesis', t => {
  const h = scenario(); t.after(() => h.turns.close());
  h.event('speech_started'); h.ack();
  h.turns.prepareBehavior('A short reply.'); h.ack();
  h.finish('Explain in detail.');
  assert.equal(h.replies().length, 0);
  assert.match(h.updates().at(-1)!.session.instructions, /Explain in detail/);
  h.ack(); assert.equal(h.replies().length, 1);
});

test('an in-flight speculative ACK serializes replacement and cannot escape its speech generation', t => {
  const h = scenario(); t.after(() => h.turns.close());
  h.event('speech_started'); h.ack();
  h.turns.prepareBehavior('Old tentative instruction.');
  const old = h.updates().at(-1);
  h.event('speech_stopped'); h.event('committed');
  h.turns.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'native-a', transcript: 'First final.' });
  h.event('speech_started', 'native-b');
  h.turns.prepareBehavior('New tentative instruction.');
  assert.equal(h.replies().length, 0);
  h.ack(old);
  assert.match(h.updates().at(-1)!.session.instructions, /New tentative instruction/);
  h.ack(); assert.equal(h.replies().length, 0);
  h.finish('New tentative instruction.', 'native-b');
  assert.equal(h.replies().length, 1);
});

test('preparation outside native speech or after close is inert', () => {
  const h = scenario();
  assert.equal(h.turns.prepareBehavior('Do something.'), false);
  h.turns.close();
  assert.equal(h.turns.prepareBehavior('Do something.'), false);
  assert.equal(h.turns.prepareBehavior(undefined), false);
  assert.equal(h.updates().length, 0); assert.equal(h.replies().length, 0);
});

test('new native speech during final publication cannot receive a reply before its own final transcript', t => {
  const sent: Record<string, any>[] = [], users: string[] = [];
  const turns = createPrivateTurnScheduler({
    instructions: () => 'Approved AI context.', send: event => sent.push(event), fail: assert.fail,
    onUserTurn: turn => {
      users.push(turn.id);
      if (turn.id === 'a') turns.receive({ type: 'input_audio_buffer.speech_started', item_id: 'b' });
    },
  });
  t.after(() => turns.close());
  const event = (type: string, id: string) => turns.receive({ type: `input_audio_buffer.${type}`, item_id: id });
  const ack = () => turns.receive({ type: 'session.updated', session: sent.filter(row => row.type === 'session.update').at(-1)!.session });
  event('speech_started', 'a'); ack(); event('speech_stopped', 'a'); event('committed', 'a');
  turns.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'First final.' });
  event('speech_stopped', 'b'); event('committed', 'b'); ack();
  assert.deepEqual(users, ['a']);
  assert.equal(sent.filter(row => row.type === 'response.create').length, 0);
  turns.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'b', transcript: 'Second final.' });
  assert.deepEqual(users, ['a', 'b']);
  assert.equal(sent.filter(row => row.type === 'response.create').length, 1);
});
