import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserVoiceSession, type BrowserVoiceSession } from '../lib/voice/browser-session';

for (const provider of ['azure', 'openai']) test(`${provider} private typed-turn guidance sends the GA realtime session discriminant`, async () => {
  const names = ['window', 'RTCPeerConnection', 'Audio', 'fetch'] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const sent: Record<string, any>[] = [], failures: string[] = [], userTurns: string[] = [];
  const baseline = 'Identify yourself as AI. Use only approved company context.';
  const guidance = 'Respect the caller request for one short answer.';
  let session: BrowserVoiceSession;
  const channel = {
    readyState: 'connecting', onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    onclose: null, onerror: null,
    send(raw: string) {
      const event = JSON.parse(raw); sent.push(event);
      // Model Azure's documented GA rejection at the transport boundary, not a live service.
      if (event.type === 'session.update' && event.session?.type !== 'realtime') {
        this.onmessage?.({ data: JSON.stringify({ type: 'error', error: { code: 'missing_required_parameter', param: 'session.type' } }) });
      }
    },
    close() { this.readyState = 'closed'; },
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
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => Response.json({ provider, transport: 'webrtc', sdp: 'v=0\r\nm=audio', initialInstructions: baseline }) });
  session = createBrowserVoiceSession({
    provider, inputMode: 'text', onConnected: () => {}, onFailure: message => failures.push(message),
    onEvent: event => {
      if (event.type === 'transcript' && event.entry.role === 'user') {
        userTurns.push(event.entry.text);
        session.updateBehavior(guidance);
      }
    },
  });
  try {
    await session.connect();
    channel.onmessage?.({ data: JSON.stringify({ type: 'response.done', response: { id: 'greeting', status: 'completed' } }) });
    assert.equal(session.sendText('Tell me about the fictional service.'), true);
    assert.deepEqual(failures, [], 'a typed-turn behavior update must not produce the GA missing-session-type error');
    assert.equal(channel.readyState, 'open');
    const update = sent.find(event => event.type === 'session.update');
    assert.deepEqual(update, { type: 'session.update', session: { type: 'realtime', instructions: `${baseline}\n<live_behavior_update>\n${guidance}\n</live_behavior_update>` } });
    assert.deepEqual(userTurns, ['Tell me about the fictional service.']);
    assert.equal(sent.filter(event => event.type === 'response.create').length, 2, 'greeting and typed reply retain their existing scheduling');
    assert.equal(session.updateBehavior(guidance), false, 'duplicate guidance is still suppressed');
    assert.equal(session.updateBehavior('   '), false);
    assert.equal(sent.filter(event => event.type === 'session.update').length, 1);
    session.close();
    assert.equal(session.updateBehavior('A later update'), false);
  } finally {
    session.close();
    for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name);
  }
});
