import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateTurnScheduler } from '../lib/voice/private-turn-scheduler';
import { buildVoiceSession } from '../lib/voice/session-config';
import { resolveSpeechDelivery, type SpeechDeliveryProfile } from '../lib/voice/speech-delivery';
import { createBrowserVoiceSession, type BrowserVoiceSession } from '../lib/voice/browser-session';
import { getVoiceServerAdapter } from '../lib/voice/server';

const profile: SpeechDeliveryProfile = { version: 1, pace: 'standard', adaptToRequests: true };
function harness(configured = true) {
  const sent: Record<string, any>[] = [], entries: { id: string; role: string; text: string }[] = [], failures: string[] = [];
  let decision = resolveSpeechDelivery(profile, entries);
  const scheduler = createPrivateTurnScheduler({
    instructions: () => 'Approved context. Identify as AI.',
    speechDelivery: () => configured ? decision : undefined,
    send: event => sent.push(event),
    onUserTurn: turn => { entries.push({ ...turn, role: 'user' }); decision = resolveSpeechDelivery(profile, entries); },
    fail: message => { failures.push(message); scheduler.close(); },
  });
  const updates = () => sent.filter(event => event.type === 'session.update');
  const replies = () => sent.filter(event => event.type === 'response.create');
  const ack = (update = updates().at(-1)!) => scheduler.receive({ type: 'session.updated', session: update.session });
  const mic = (type: string, id: string) => scheduler.receive({ type: `input_audio_buffer.${type}`, item_id: id });
  const final = (id: string, text: string) => { mic('speech_stopped', id); mic('committed', id); scheduler.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: text }); };
  return { scheduler, sent, entries, failures, updates, replies, ack, mic, final, decision: () => decision };
}

test('shared session builder preserves old envelope and uses configured initial speed', () => {
  const legacy = buildVoiceSession('test', 'Approved context', 'marin');
  assert.equal(Object.hasOwn(legacy.audio.output, 'speed'), false);
  for (const pace of ['standard', 'unhurried'] as const) {
    const session = buildVoiceSession('test', 'Approved context', 'marin', 'provider-default', [], undefined, { speechDelivery: { ...profile, pace } });
    assert.equal(session.audio.output.speed, pace === 'standard' ? 1 : 0.9);
    assert.equal(session.audio.input.turn_detection.create_response, false);
  }
});

test('configured typed turn requires exact instructions AND numeric speed; duplicate ACK releases once', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('Please speak slower.');
  const session = h.updates()[0].session;
  assert.equal(session.type, 'realtime'); assert.equal(session.audio.output.speed, 0.9);
  assert.equal(h.decision().sourceTurnId, h.entries[0].id);
  for (const speed of [undefined, 1, '0.9']) {
    h.scheduler.receive({ type: 'session.updated', session: { ...session, audio: { output: { speed } } } });
    assert.equal(h.replies().length, 0);
  }
  h.scheduler.receive({ type: 'session.updated', session: { ...session, instructions: 'stale' } });
  assert.equal(h.replies().length, 0);
  for (const type of [undefined, 'transcription']) {
    h.scheduler.receive({ type: 'session.updated', session: { ...session, type } });
    assert.equal(h.replies().length, 0, 'matching instructions and speed require a realtime session echo');
  }
  h.ack(); h.ack(); assert.equal(h.replies().length, 1);
});

test('final microphone rate invalidates pre-ACK even when instructions match; interim cannot change rate', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.mic('speech_started', 'slow'); const candidate = h.updates()[0]; h.ack(candidate);
  h.scheduler.receive({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'slow', delta: 'Please speak slower.' });
  assert.equal(h.updates().length, 1); assert.equal(candidate.session.audio.output.speed, 1);
  assert.equal(h.entries.length, 0); assert.equal(h.decision().speed, 1);
  h.final('slow', 'Please speak slower.');
  assert.equal(h.updates().length, 2); assert.equal(h.updates()[1].session.audio.output.speed, 0.9);
  assert.equal(h.decision().sourceTurnId, 'slow');
  h.ack(candidate); assert.equal(h.replies().length, 0);
  h.ack(); assert.equal(h.replies().length, 1);
});

test('source-aware newer reset drains stale slow gate before replacing it and rejects replayed ACKs', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('Please speak slower.'); const slow = h.updates()[0];
  h.mic('speech_started', 'reset'); h.final('reset', 'Speak normally.');
  assert.equal(h.decision().sourceTurnId, 'reset'); assert.equal(h.decision().speed, 1);
  assert.equal(h.updates().length, 1, 'only one session update may be in flight');
  h.ack(slow); assert.equal(h.replies().length, 0);
  const reset = h.updates()[1]; assert.equal(reset.session.audio.output.speed, 1);
  h.ack(slow); assert.equal(h.replies().length, 0);
  h.ack(reset); h.ack(reset); assert.equal(h.replies().length, 1);
});

test('barge-in reset waits for cancellation; late old final cannot restore slower pace', t => {
  const h = harness(); t.after(() => h.scheduler.close());
  h.scheduler.sendText('Speak slower.'); h.ack(); h.scheduler.responseCreated('slow-response');
  const oldId = h.entries[0].id;
  h.mic('speech_started', 'reset'); h.final('reset', 'Speak normally.');
  assert.equal(h.updates().length, 1); assert.equal(h.decision().speed, 0.9, 'final publication waits for provider cancellation');
  h.scheduler.responseDone('slow-response', false, 'cancelled');
  assert.equal(h.updates().length, 2); assert.equal(h.decision().sourceTurnId, 'reset');
  h.scheduler.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: oldId, transcript: 'Speak slower.' });
  assert.equal(h.decision().speed, 1);
  h.ack(); assert.equal(h.replies().length, 2);
});

test('missing speed echo times out closed and End cannot release a pending rate gate', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(); h.scheduler.sendText('Speak slower.'); const update = h.updates()[0];
  h.scheduler.receive({ type: 'session.updated', session: { instructions: update.session.instructions } });
  t.mock.timers.tick(5_000); h.ack(update);
  assert.equal(h.failures.length, 1); assert.equal(h.replies().length, 0);
  const ended = harness(); ended.scheduler.sendText('Speak slower.'); ended.scheduler.close(); ended.ack();
  assert.equal(ended.replies().length, 0);
});

test('absent profile retains instructions-only ACK compatibility', t => {
  const h = harness(false); t.after(() => h.scheduler.close()); h.scheduler.sendText('Speak slower.');
  assert.equal(Object.hasOwn(h.updates()[0].session, 'audio'), false);
  h.ack(); assert.equal(h.replies().length, 1);
});

test('Azure adapter provisions configured initial speed and other providers reject it without traffic', async () => {
  const sent: Record<string, any>[] = [];
  const adapter = getVoiceServerAdapter({ VOICE_PROVIDER: 'azure', AZURE_OPENAI_ENDPOINT: 'https://fixture.openai.azure.com',
    AZURE_OPENAI_API_KEY: 'fixture', AZURE_OPENAI_REALTIME_DEPLOYMENT: 'fixture' }, (async (url, init) => {
    if (String(url).endsWith('/client_secrets')) { sent.push(JSON.parse(String(init?.body))); return Response.json({ value: 'fixture' }); }
    return new Response('v=0\r\nm=audio', { status: 201, headers: { Location: '/openai/v1/realtime/calls/rtc_fixture' } });
  }) as typeof fetch);
  const input = { sdp: 'v=0\r\nm=audio', instructions: 'Approved context', userId: 'u', organizationId: 'o', speechDelivery: { ...profile, pace: 'unhurried' as const } };
  await adapter.connect(input);
  assert.equal(sent[0].session.audio.output.speed, 0.9);
  for (const provider of ['openai', 'gemini']) {
    let calls = 0;
    const unsupported = getVoiceServerAdapter({ VOICE_PROVIDER: provider, OPENAI_API_KEY: 'fixture', GEMINI_API_KEY: 'fixture' }, (async () => { calls++; throw new Error('Unexpected provider request'); }) as typeof fetch);
    await assert.rejects(unsupported.connect(input), /requires Azure Realtime/); assert.equal(calls, 0);
  }
});

for (const inputMode of ['text', 'microphone'] as const) test(`private ${inputMode} browser uses frozen server profile and authoritative finals for slow then reset`, async () => {
  const names = ['window', 'navigator', 'RTCPeerConnection', 'Audio', 'AudioContext', 'fetch'] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const sent: Record<string, any>[] = [], failures: string[] = [], users: string[] = [];
  let session: BrowserVoiceSession;
  const channel = { readyState: 'connecting', onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null, onclose: null, onerror: null,
    send(raw: string) { sent.push(JSON.parse(raw)); }, close() { this.readyState = 'closed'; } };
  const track = { enabled: true, stop() {}, onended: null };
  class Peer {
    ontrack = null; onconnectionstatechange = null;
    addTrack() {} addTransceiver() {} close() {}
    createDataChannel() { return channel; }
    async createOffer() { return { sdp: 'v=0\r\nm=audio' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { channel.readyState = 'open'; channel.onopen?.(); }
  }
  const globals = { window: { isSecureContext: true }, AudioContext: undefined,
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } },
    RTCPeerConnection: Peer, Audio: class { autoplay = false; srcObject = null; pause() {} },
    fetch: async (url: string) => url === '/api/voice/control' ? Response.json({ state: 'closed' }) : Response.json({ provider: 'azure', transport: 'webrtc', sdp: 'v=0\r\nm=audio',
      initialInstructions: 'Approved AI context', behaviorContext: { settings: {}, relationship: {}, speechDelivery: profile } }) };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
  session = createBrowserVoiceSession({ provider: 'azure', inputMode,
    onConnected(meta) { meta!.behaviorContext!.speechDelivery!.adaptToRequests = false; },
    onFailure: message => failures.push(message), onEvent(event) {
      if (event.type === 'transcript' && event.entry.role === 'user') { users.push(event.entry.text); session.updateBehavior('Keep approved response guidance.'); }
    } });
  const emit = (event: object) => channel.onmessage?.({ data: JSON.stringify(event) });
  const updates = () => sent.filter(event => event.type === 'session.update');
  const replies = () => sent.filter(event => event.type === 'response.create');
  const ack = (update = updates().at(-1)!) => emit({ type: 'session.updated', session: update.session });
  try {
    await session.connect();
    emit({ type: 'response.created', response: { id: 'opening' } }); emit({ type: 'response.done', response: { id: 'opening', status: 'completed' } });
    for (const [index, text] of ['Please speak slower.', 'Speak normally.'].entries()) {
      const before = replies().length;
      if (inputMode === 'text') session.sendText(text);
      else {
        const item_id = `mic-${index}`;
        emit({ type: 'input_audio_buffer.speech_started', item_id });
        ack();
        const prepared = updates().length;
        emit({ type: 'conversation.item.input_audio_transcription.delta', item_id, delta: text });
        assert.equal(updates().length, prepared);
        emit({ type: 'input_audio_buffer.speech_stopped', item_id }); emit({ type: 'input_audio_buffer.committed', item_id });
        emit({ type: 'conversation.item.input_audio_transcription.completed', item_id, transcript: text });
      }
      const update = updates().at(-1)!;
      assert.equal(update.session.audio.output.speed, index === 0 ? 0.9 : 1);
      assert.equal(replies().length, before);
      emit({ type: 'session.updated', session: { instructions: update.session.instructions } });
      assert.equal(replies().length, before);
      ack(); assert.equal(replies().length, before + 1);
      emit({ type: 'response.created', response: { id: `reply-${index}` } }); emit({ type: 'response.done', response: { id: `reply-${index}`, status: 'completed' } });
    }
    assert.deepEqual(users, ['Please speak slower.', 'Speak normally.']); assert.deepEqual(failures, []);
    session.sendText('Speak slower.'); const pending = updates().at(-1)!; const count = replies().length;
    session.close(); ack(pending); assert.equal(replies().length, count);
  } finally {
    session.close(); await new Promise<void>(resolve => setImmediate(resolve));
    for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name);
  }
});
