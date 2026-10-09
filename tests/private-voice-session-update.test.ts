import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserVoiceSession, type BrowserVoiceSession } from '../lib/voice/browser-session';
import { createVoiceStartGate } from '../lib/voice/start-gate';

for (const provider of ['azure', 'openai']) for (const inputMode of ['text', 'microphone'] as const) for (const ending of ['end', 'error']) test(`${provider} private ${inputMode} turn waits for GA acknowledgement and retains capture on ${ending}`, async () => {
  const names = ['window', 'navigator', 'RTCPeerConnection', 'Audio', 'fetch'] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const sent: Record<string, any>[] = [], failures: string[] = [], userTurns: string[] = [];
  const baseline = 'Identify yourself as AI. Use only approved company context.';
  const guidance = 'Respect the caller request for one short answer.';
  let session: BrowserVoiceSession;
  const startGate = createVoiceStartGate();
  const attempt = startGate.begin();
  const channel = {
    readyState: 'connecting', onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    onclose: null, onerror: null,
    send(raw: string) {
      const event = JSON.parse(raw); sent.push(event);
      if (event.type === 'conversation.item.create' && event.item?.type === 'message') {
        assert.equal(Object.hasOwn(event.item, 'id'), false, 'use the provider-assigned optional item ID');
      }
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
    addTrack() {}
    createDataChannel() { return channel; }
    async createOffer() { return { sdp: 'v=0\r\nm=audio' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { channel.readyState = 'open'; channel.onopen?.(); }
    close() {}
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  const track = { enabled: true, stop() {}, onended: null };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } } });
  Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: Peer });
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: class { autoplay = false; srcObject = null; pause() {} } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => Response.json({ provider, transport: 'webrtc', sdp: 'v=0\r\nm=audio', initialInstructions: baseline }) });
  session = createBrowserVoiceSession({
    provider, inputMode, onConnected: () => {}, onFailure: message => { if (attempt.isCurrent()) { startGate.cancel(); failures.push(message); } },
    onEvent: event => {
      if (!attempt.isCurrent()) return;
      if (event.type === 'transcript' && event.entry.role === 'user') {
        userTurns.push(event.entry.text);
        session.updateBehavior(guidance);
      }
    },
  });
  try {
    await session.connect();
    channel.onmessage?.({ data: JSON.stringify({ type: 'response.created', response: { id: 'greeting' } }) });
    channel.onmessage?.({ data: JSON.stringify({ type: 'response.done', response: { id: 'greeting', status: 'completed' } }) });
    if (inputMode === 'text') assert.equal(session.sendText('Tell me about the fictional service.'), true);
    else {
      for (const type of ['input_audio_buffer.speech_started', 'input_audio_buffer.speech_stopped', 'input_audio_buffer.committed']) channel.onmessage?.({ data: JSON.stringify({ type, item_id: 'microphone-turn' }) });
      channel.onmessage?.({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'microphone-turn', transcript: 'Tell me about the fictional service.' }) });
    }
    assert.deepEqual(failures, [], 'a typed-turn behavior update must not produce the GA missing-session-type error');
    assert.equal(channel.readyState, 'open');
    if (inputMode === 'microphone') {
      const candidate = sent.find(event => event.type === 'session.update')!;
      assert.match(candidate.session.instructions, /<live_turn_revision>1<\/live_turn_revision>/);
      channel.onmessage?.({ data: JSON.stringify({ type: 'session.updated', session: candidate.session }) });
      assert.equal(sent.filter(event => event.type === 'response.create').length, 1, 'candidate ACK cannot release changed final guidance');
    }
    const update = sent.filter(event => event.type === 'session.update').at(-1);
    assert.deepEqual(update, { type: 'session.update', session: { type: 'realtime', instructions: `${baseline}\n<live_behavior_update>\n${guidance}\n</live_behavior_update>\n<live_turn_revision>${inputMode === 'microphone' ? 2 : 1}</live_turn_revision>` } });
    assert.deepEqual(userTurns, ['Tell me about the fictional service.']);
    assert.equal(sent.filter(event => event.type === 'response.create').length, 1, 'reply waits for the exact current guidance acknowledgement');
    channel.onmessage?.({ data: JSON.stringify({ type: 'session.updated', session: update!.session }) });
    assert.equal(sent.filter(event => event.type === 'response.create').length, 2, 'one typed reply follows the acknowledgement');
    assert.equal(session.updateBehavior(guidance), false, 'duplicate guidance is still suppressed');
    assert.equal(session.updateBehavior('   '), false);
    assert.equal(sent.filter(event => event.type === 'session.update').length, inputMode === 'microphone' ? 2 : 1);
    channel.onmessage?.({ data: JSON.stringify({ type: 'response.created', response: { id: 'reply' } }) });
    channel.onmessage?.({ data: JSON.stringify({ type: 'response.done', response: { id: 'reply', status: 'completed' } }) });
    assert.equal(session.sendText('A second turn waiting for acknowledgement'), true);
    const lateHandler = channel.onmessage;
    const waitingUpdate = sent.filter(event => event.type === 'session.update').at(-1)!;
    if (inputMode === 'microphone') {
      for (const item_id of ['older-pending', 'newer-captured']) for (const type of ['input_audio_buffer.speech_started', 'input_audio_buffer.speech_stopped', 'input_audio_buffer.committed']) channel.onmessage?.({ data: JSON.stringify({ type, item_id }) });
      channel.onmessage?.({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'newer-captured', transcript: 'Captured before ending.' }) });
      assert.notEqual(userTurns.at(-1), 'Captured before ending.', 'guidance still waits for the older ASR');
    }
    if (ending === 'error') channel.onmessage?.({ data: JSON.stringify({ type: 'error', error: { code: 'synthetic_provider_error' } }) });
    else { session.close(); startGate.cancel(); } // VoiceStudio.end ordering.
    assert.equal(failures.length, ending === 'error' ? 1 : 0);
    if (inputMode === 'microphone') assert.equal(userTurns.at(-1), 'Captured before ending.', 'capture reaches the guarded owner before its generation is invalidated');
    lateHandler?.({ data: JSON.stringify({ type: 'session.updated', session: waitingUpdate.session }) });
    assert.equal(sent.filter(event => event.type === 'response.create').length, 2, 'late ack after provider error cannot generate output');
    assert.equal(session.updateBehavior('A later update'), false);
  } finally {
    session.close();
    for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name);
  }
});
