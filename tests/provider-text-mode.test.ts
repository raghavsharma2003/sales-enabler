import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserVoiceSession } from '../lib/voice/browser-session';
import type { VoiceEvent } from '../lib/voice/contracts';

test('Azure listen-and-type WebRTC receives audio without microphone permission and records typed input', async () => {
  const names = ['window', 'navigator', 'RTCPeerConnection', 'Audio', 'fetch'] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const sent: string[] = [];
  const events: VoiceEvent[] = [];
  const connected: Array<{ previewId?: string } | undefined> = [];
  let micRequested = 0;
  let transceiver: { kind: string; direction: string } | undefined;
  let remoteAudioPlayed = 0;
  let remoteAudioPaused = 0;
  let peerClosed = 0;
  let channelClosed = 0;
  const remoteStream = {} as MediaStream;
  const channel = {
    readyState: 'connecting',
    onopen: null as null | (() => void), onmessage: null as null | ((event: { data: string }) => void),
    onclose: null as null | (() => void), onerror: null as null | (() => void),
    send: (data: string) => {
      sent.push(data);
      const event = JSON.parse(data);
      if (event.type === 'session.update') channel.onmessage?.({ data: JSON.stringify({ type: 'session.updated', session: event.session }) });
    }, close: () => { channelClosed++; },
  };
  class MockPeer {
    ontrack: null | ((event: { streams: MediaStream[]; track: MediaStreamTrack }) => void) = null;
    onconnectionstatechange = null;
    connectionState = 'connected';
    addTransceiver(kind: string, init: { direction: string }) { transceiver = { kind, direction: init.direction }; }
    addTrack() { assert.fail('text mode must not add a microphone track'); }
    createDataChannel(name: string) { assert.equal(name, 'oai-events'); return channel; }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\nm=audio\r\n' }; }
    async setLocalDescription() {}
    async setRemoteDescription(answer: { type: string; sdp: string }) {
      assert.equal(answer.type, 'answer');
      assert.match(answer.sdp, /m=audio/);
      channel.readyState = 'open';
      this.ontrack?.({ streams: [remoteStream], track: {} as MediaStreamTrack });
      channel.onopen?.();
    }
    close() { peerClosed++; }
  }
  class MockAudio {
    autoplay = false;
    srcObject: MediaStream | null = null;
    play() { remoteAudioPlayed++; return Promise.resolve(); }
    pause() { remoteAudioPaused++; }
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => { micRequested++; assert.fail('must not request microphone'); } } } });
  Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: MockPeer });
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: MockAudio });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.equal(body.mode, 'preview');
    assert.match(body.sdp, /m=audio/);
    return Response.json({ provider: 'azure', transport: 'webrtc', sdp: 'v=0\r\nm=audio\r\n', previewId: 'preview-1', initialInstructions: 'Approved context. Disclose AI.', openingMessage: 'Namaste, I am an AI assistant. How may I help?' });
  } });
  const session = createBrowserVoiceSession({ provider: 'azure', mode: 'preview', inputMode: 'text', onConnected: meta => connected.push(meta), onEvent: event => events.push(event), onFailure: message => assert.fail(message) });
  try {
    await session.connect();
    assert.equal(micRequested, 0);
    assert.deepEqual(transceiver, { kind: 'audio', direction: 'recvonly' });
    assert.equal(remoteAudioPlayed, 1);
    assert.deepEqual(connected, [{ previewId: 'preview-1', enabledTools: [] }]);
    const opening = JSON.parse(sent[0]);
    assert.equal(opening.type, 'response.create');
    assert.match(opening.response.instructions, /Namaste, I am an AI assistant/);
    assert.equal(session.sendText('  Namaste, how can you help?  '), true);
    assert.equal(session.sendText('Please answer briefly.'), true);
    assert.equal(sent.filter(value => JSON.parse(value).type === 'conversation.item.create').length, 0);
    assert.equal(events.filter(event => event.type === 'transcript').length, 0);
    channel.onmessage?.({ data: JSON.stringify({ type: 'response.created', response: { id: 'greeting' } }) });
    channel.onmessage?.({ data: JSON.stringify({ type: 'response.done', response: { id: 'greeting', status: 'completed' } }) });
    assert.equal(sent.filter(value => JSON.parse(value).type === 'conversation.item.create').length, 1);
    assert.equal(sent.filter(value => JSON.parse(value).type === 'response.create').length, 2);
    const typed = events.find(event => event.type === 'transcript' && event.entry.role === 'user');
    assert.ok(typed && typed.type === 'transcript');
    assert.equal(typed.entry.text, 'Namaste, how can you help?');
    assert.ok(events.some(event => event.type === 'item' && event.id === typed.entry.id));
    channel.onmessage?.({ data: JSON.stringify({ type: 'response.created', response: { id: 'first-reply' } }) });
    channel.onmessage?.({ data: JSON.stringify({ type: 'response.done', response: { id: 'first-reply', status: 'completed' } }) });
    assert.equal(sent.filter(value => JSON.parse(value).type === 'conversation.item.create').length, 2);
    assert.ok(events.some(event => event.type === 'transcript' && event.entry.text === 'Please answer briefly.'));
    for (let index = 0; index < 20; index++) assert.equal(session.sendText(`Queued ${index}`), true);
    assert.equal(session.sendText('Queue full'), false);
  } finally {
    session.close();
    assert.equal(peerClosed, 1);
    assert.equal(channelClosed, 1);
    assert.equal(remoteAudioPaused, 1);
    assert.equal(micRequested, 0);
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('Gemini listen-and-type skips microphone capture and still plays provider audio', async () => {
  const names = ['window', 'navigator', 'AudioContext', 'WebSocket', 'fetch'] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  let micRequested = 0;
  let audioStarted = 0;
  let closed = 0;
  const sent: string[] = [];
  const events: VoiceEvent[] = [];
  let socket: {
    readyState: number; onopen?: () => void; onmessage?: (event: { data: string }) => void;
    send: (text: string) => void; close: () => void;
  } | undefined;
  class MockSocket {
    static OPEN = 1;
    readyState = 0;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    constructor() { socket = this; }
    send(text: string) { sent.push(text); }
    close() { closed++; }
  }
  class MockContext {
    currentTime = 0;
    destination = {};
    resume = async () => {};
    close = async () => {};
    createMediaStreamSource() { assert.fail('text mode must not connect a microphone source'); }
    createBuffer(_channels: number, length: number) { return { duration: length / 24000, getChannelData: () => new Float32Array(length) }; }
    createBufferSource() { return { buffer: null, onended: null, connect: () => {}, disconnect: () => {}, start: () => { audioStarted++; }, stop: () => {} }; }
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => { micRequested++; assert.fail('must not request microphone'); } } } });
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: MockContext });
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: MockSocket });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => Response.json({ provider: 'gemini', transport: 'websocket', token: 'once', model: 'gemini-3.8-live', setup: { model: 'models/gemini-3.8-live' }, openingMessage: 'Namaste, I am an AI assistant.' }) });
  const session = createBrowserVoiceSession({ provider: 'gemini', inputMode: 'text', onConnected: () => {}, onEvent: event => events.push(event), onFailure: message => assert.fail(message) });
  try {
    await session.connect();
    assert.ok(socket);
    socket!.readyState = 1;
    socket!.onopen?.();
    socket!.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    assert.ok(sent.some(text => JSON.parse(text).realtimeInput?.text?.includes('Namaste, I am an AI assistant.')));
    assert.equal(session.sendText('Namaste'), true);
    assert.ok(sent.some(text => JSON.parse(text).realtimeInput?.text === 'Namaste'));
    assert.ok(events.some(event => event.type === 'transcript' && event.entry.text === 'Namaste'));
    socket!.onmessage?.({ data: JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAABAA==' } }] } } }) });
    assert.equal(audioStarted, 1);
    assert.equal(micRequested, 0);
  } finally {
    session.close();
    assert.equal(closed, 1);
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
