import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateTurnScheduler } from '../lib/voice/private-turn-scheduler';
import { createBrowserVoiceSession } from '../lib/voice/browser-session';

function harness() {
  const sent: Record<string, any>[] = [], users: string[] = [], failures: string[] = [];
  const scheduler = createPrivateTurnScheduler({
    instructions: () => 'Approved baseline.', send: event => sent.push(event),
    onUserTurn: turn => { users.push(turn.text); scheduler.updateBehavior(`Current guidance: ${turn.text}`); },
    fail: message => { failures.push(message); scheduler.close(); },
  });
  const updates = () => sent.filter(event => event.type === 'session.update');
  const replies = () => sent.filter(event => event.type === 'response.create');
  const ack = () => scheduler.receive({ type: 'session.updated', session: updates().at(-1)!.session });
  const mic = (type: string, item_id: string) => scheduler.receive({ type: `input_audio_buffer.${type}`, item_id });
  const asr = (item_id: string, transcript: string) => scheduler.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id, transcript });
  return { scheduler, sent, users, failures, updates, replies, ack, mic, asr };
}

test('review: a terminal without a response ID cannot release a known active response', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('first'); h.ack(); h.scheduler.responseCreated('active-first');
  h.scheduler.sendText('second');
  h.scheduler.responseDone(undefined, false);
  assert.equal(h.updates().length, 1, 'uncorrelated completion must not prepare a second paid reply while the first is active');
  assert.deepEqual(h.users, ['first']);
});

test('review: an unexpected second response.created cannot steal ownership from the active response', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('first'); h.ack(); h.scheduler.responseCreated('active-first');
  h.scheduler.sendText('second'); h.scheduler.responseCreated('unrequested-response');
  h.scheduler.responseDone('active-first', false);
  assert.ok(h.failures.length === 1 || h.updates().length === 2, 'reject the unexpected response or preserve the legitimate response binding; do not silently stall');
});

test('review: closing while ASR is out of order retains the completed caller transcript', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  for (const id of ['older', 'newer']) { h.mic('speech_started', id); h.mic('speech_stopped', id); h.mic('committed', id); }
  h.asr('newer', 'Captured caller correction.');
  h.scheduler.close();
  assert.deepEqual(h.users, ['Captured caller correction.'], 'a completed transcript must remain available for saving even when an older ASR result never arrives');
  assert.equal(h.replies().length, 0, 'retaining caller evidence must not generate a reply');
});

for (const status of ['failed', 'incomplete']) test(`review: ${status} provider response does not silently schedule the next queued paid reply`, async () => {
  const names = ['window', 'RTCPeerConnection', 'Audio', 'fetch'] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const sent: Record<string, any>[] = [], failures: string[] = [];
  const channel = {
    readyState: 'connecting', onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    onclose: null, onerror: null,
    send(raw: string) { sent.push(JSON.parse(raw)); }, close() { this.readyState = 'closed'; },
  };
  class Peer {
    ontrack = null; onconnectionstatechange = null;
    addTransceiver() {}
    createDataChannel() { return channel; }
    async createOffer() { return { sdp: 'v=0\r\nm=audio' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { channel.readyState = 'open'; channel.onopen?.(); }
    close() {}
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: Peer });
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: class { autoplay = false; srcObject = null; pause() {} } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => Response.json({ provider: 'azure', transport: 'webrtc', sdp: 'v=0\r\nm=audio', initialInstructions: 'Approved baseline.' }) });
  const session = createBrowserVoiceSession({ provider: 'azure', inputMode: 'text', onConnected() {}, onEvent() {}, onFailure: message => failures.push(message) });
  const emit = (event: unknown) => channel.onmessage?.({ data: JSON.stringify(event) });
  try {
    await session.connect();
    emit({ type: 'response.created', response: { id: 'opening' } });
    assert.equal(session.sendText('Queued caller question.'), true);
    emit({ type: 'response.done', response: { id: 'opening', status, status_details: { reason: status === 'incomplete' ? 'max_output_tokens' : 'server_error' } } });
    assert.equal(sent.filter(event => event.type === 'session.update').length, 0, 'a failed or unfinished reply must not drain queued turns as a normal completion');
    assert.equal(failures.length, 1, 'the user needs a visible terminal outcome');
  } finally {
    session.close();
    for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name);
  }
});
