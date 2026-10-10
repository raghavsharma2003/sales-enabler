import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoiceLiveBrowserSession, type VoiceLiveBrowserDependencies } from '../lib/voice/voice-live-browser';
import type { PcmCaptureOptions } from '../lib/voice/pcm-capture';

class FakeSource {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  startedAt = -1;
  stopped = false;
  connect() { return this; }
  disconnect() {}
  start(at = 0) { this.startedAt = at; }
  stop() { this.stopped = true; this.onended?.(); }
  finish() { this.onended?.(); }
}

class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  destination = {} as AudioDestinationNode;
  sources: FakeSource[] = [];
  resumed = 0;
  closed = 0;
  async resume() { this.resumed += 1; }
  async close() { this.closed += 1; this.state = 'closed'; }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => data } as unknown as AudioBuffer;
  }
  createBufferSource() {
    const source = new FakeSource(); this.sources.push(source); return source as unknown as AudioBufferSourceNode;
  }
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  binaryType = 'blob';
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: unknown[] = [];
  closes = 0;
  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  send(value: unknown) { assert.equal(this.readyState, 1); this.sent.push(value); }
  receive(value: unknown) { this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) } as MessageEvent); }
  close() { this.closes += 1; this.readyState = 3; this.onclose?.(); }
  controls() { return this.sent.filter((value): value is string => typeof value === 'string').map(value => JSON.parse(value)); }
}

class FakeTrack {
  onended: ((event: Event) => void) | null = null;
  stops = 0;
  stop() { this.stops += 1; }
}

const ready = (epoch = 'epoch-1') => ({
  type: 'ready', sessionEpoch: epoch,
  metadata: {
    previewId: 'preview-1', enabledTools: [],
    behaviorContext: { settings: { allowedLanguages: ['English'], primaryLanguage: 'English', responseStyle: 'concise' }, relationship: {} },
  },
});

const pcm = (samples = 2400) => Buffer.alloc(samples * 2).toString('base64');
const audioEvent = (overrides: Record<string, unknown> = {}) => ({
  type: 'audio', sessionEpoch: 'epoch-1', responseId: 'response-1', itemId: 'item-1', contentIndex: 0,
  sequence: 0, sampleStart: 0, sampleCount: 2400, sampleRate: 24000, audio: pcm(), ...overrides,
});

function connectResult(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'azure', transport: 'voice-live', ticket: 'ticket_abcdefghijklmnop',
    url: 'wss://voice.example.test/private-voice-live', expiresAt: new Date(1_700_000_060_000).toISOString(),
    previewId: 'preview-1', voiceAttemptId: 'attempt-1', ...overrides,
  };
}

function createHarness(inputMode: 'text' | 'microphone' = 'text', overrides: Partial<VoiceLiveBrowserDependencies> = {},
  callbackOverrides: { onDiagnostics?: (snapshot: import('../lib/voice/diagnostics').VoiceRuntimeDiagnostics) => void } = {}) {
  FakeWebSocket.instances = [];
  const audio = new FakeAudioContext();
  const track = new FakeTrack();
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const fetches: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const events: unknown[] = [], failures: string[] = [], connections: unknown[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let timerId = 0, getUserMediaCalls = 0;
  const dependencies: VoiceLiveBrowserDependencies = {
    secureContext: () => true,
    wallClock: () => 1_700_000_000_000,
    randomUUID: (() => { let value = 0; return () => `request-${++value}`; })(),
    createAudioContext: () => audio as unknown as AudioContext,
    createWebSocket: url => new FakeWebSocket(url) as unknown as WebSocket,
    getUserMedia: async () => { getUserMediaCalls += 1; return stream; },
    startCapture: async () => ({ close() {}, setMuted() {} }),
    fetch: async (input, init) => { fetches.push({ input, init }); return Response.json(connectResult()); },
    setTimer: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id as unknown as ReturnType<typeof setTimeout>; },
    clearTimer: timer => { timers.delete(timer as unknown as number); },
    ...overrides,
  };
  const session = createVoiceLiveBrowserSession({
    provider: 'azure', inputMode, mode: 'preview', draft: {} as never, agentId: 'agent-1', contactId: 'contact-1',
    onConnected: value => connections.push(value), onEvent: event => events.push(event), onFailure: message => failures.push(message),
    ...callbackOverrides,
  }, dependencies);
  return { session, audio, track, stream, fetches, events, failures, connections, timers, get getUserMediaCalls() { return getUserMediaCalls; } };
}

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (condition()) return;
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  assert.fail('condition did not become true');
}

async function connect(h: ReturnType<typeof createHarness>, epoch = 'epoch-1') {
  const connecting = h.session.connect();
  await until(() => FakeWebSocket.instances.length === 1);
  const socket = FakeWebSocket.instances[0];
  assert.ok(socket, 'fetch authorization precedes one WebSocket');
  socket.open();
  socket.receive(ready(epoch));
  await connecting;
  return socket;
}

test('typed preview uses the authenticated route, strict start, 24 kHz playback and sample interruption ledger', async () => {
  const h = createHarness('text');
  const socket = await connect(h);
  assert.equal(h.getUserMediaCalls, 0, 'Listen & type never asks for microphone permission');
  assert.equal(String(h.fetches[0].input), '/api/voice/connect');
  const request = JSON.parse(String(h.fetches[0].init?.body));
  assert.deepEqual(request, { mode: 'preview', draft: {}, agentId: 'agent-1', contactId: 'contact-1', consent: true, inputMode: 'text', requestId: 'request-1' });
  assert.deepEqual(socket.controls()[0], { type: 'start', ticket: 'ticket_abcdefghijklmnop', inputMode: 'text' });
  assert.equal(h.connections.length, 1);
  assert.deepEqual([...h.timers.values()].map(value => value.delay), [600_000], 'ticket expiry is cleared after the server claims it');
  assert.equal(h.session.updateBehavior('client instructions are forbidden'), false);

  socket.receive(audioEvent());
  assert.equal(h.audio.sources.length, 1);
  assert.equal(h.audio.sources[0].startedAt, 0.015);
  h.audio.currentTime = 0.065;
  socket.receive({ type: 'interrupted', sessionEpoch: 'epoch-1', responseId: 'response-1' });
  assert.equal(h.audio.sources[0].stopped, true, 'playback stops before the interruption report is sent');
  assert.deepEqual(socket.controls().at(-1), { type: 'interrupt', sessionEpoch: 'epoch-1', responseId: 'response-1',
    items: [{ itemId: 'item-1', contentIndex: 0, playedSamples: 1200 }] });
  const sentAfterFirst = socket.sent.length;
  socket.receive({ type: 'interrupted', sessionEpoch: 'epoch-1', responseId: 'response-1' });
  socket.receive(audioEvent({ sequence: 1, sampleStart: 2400 }));
  assert.equal(socket.sent.length, sentAfterFirst, 'duplicate interruption and late cancelled audio are suppressed');
  assert.equal(h.audio.sources.length, 1);
  assert.deepEqual(h.failures, []);
  h.session.close();
  assert.deepEqual(socket.controls().slice(-2), [
    { type: 'played', sessionEpoch: 'epoch-1', responseId: 'response-1', items: [{ itemId: 'item-1', contentIndex: 0, playedSamples: 1200 }] },
    { type: 'end' },
  ], 'End never regresses the interruption watermark');
});

test('natural playback reports exact cumulative played samples and typed input cancels before text', async () => {
  const h = createHarness('text');
  const socket = await connect(h);
  socket.receive(audioEvent({ sampleCount: 1200, audio: pcm(1200) }));
  h.audio.currentTime = 0.064999999;
  h.audio.sources[0].finish();
  assert.deepEqual(socket.controls().at(-1), { type: 'played', sessionEpoch: 'epoch-1', responseId: 'response-1',
    items: [{ itemId: 'item-1', contentIndex: 0, playedSamples: 1200 }] });
  assert.equal(h.session.sendText('  Continue in text mode  '), true);
  assert.deepEqual(socket.controls().slice(-2).map(event => event.type), ['interrupt', 'text']);
  assert.deepEqual(socket.controls().at(-1), { type: 'text', text: 'Continue in text mode', requestId: 'request-2' });
  h.session.close();
});

test('microphone preview starts existing PCM capture only after ready, preserves cadence and owns its tracks', async () => {
  let captureOptions: PcmCaptureOptions | undefined;
  const mutes: boolean[] = [];
  let captureCloses = 0;
  const h = createHarness('microphone', {
    startCapture: async options => {
      captureOptions = options;
      return { close: () => { captureCloses += 1; }, setMuted: value => mutes.push(value) };
    },
  });
  const connecting = h.session.connect();
  await until(() => FakeWebSocket.instances.length === 1);
  assert.equal(captureOptions, undefined);
  h.session.setMuted(true);
  const socket = FakeWebSocket.instances[0]; socket.open(); socket.receive(ready());
  await connecting;
  assert.equal(h.getUserMediaCalls, 1);
  const capture = (captureOptions as PcmCaptureOptions | undefined);
  assert.ok(capture);
  assert.equal(capture.stream, h.stream);
  assert.deepEqual(mutes, [true]);
  const frame = new ArrayBuffer(640);
  capture.onFrame(frame, { sampleStart: 0, sampleCount: 320 });
  assert.equal(socket.sent.at(-1), frame);
  h.session.close();
  h.session.close();
  assert.equal(captureCloses, 1);
  assert.equal(h.track.stops, 1, 'this adapter owns and closes the stream it acquired');
  assert.equal(FakeWebSocket.instances.length, 1, 'there is no reconnect');
});

test('backpressure and PCM discontinuity close once without dropping or replaying frames', async () => {
  for (const failure of ['backpressure', 'offset'] as const) {
    let captureOptions!: PcmCaptureOptions;
    let captureCloses = 0;
    const h = createHarness('microphone', { startCapture: async options => {
      captureOptions = options; return { close: () => { captureCloses += 1; }, setMuted() {} };
    } });
    const socket = await connect(h);
    if (failure === 'backpressure') socket.bufferedAmount = 65_000;
    captureOptions.onFrame(new ArrayBuffer(640), { sampleStart: failure === 'offset' ? 320 : 0, sampleCount: 320 });
    captureOptions.onFrame(new ArrayBuffer(640), { sampleStart: 0, sampleCount: 320 });
    assert.equal(h.failures.length, 1);
    assert.equal(captureCloses, 1);
    assert.equal(socket.sent.filter(value => value instanceof ArrayBuffer).length, 0);
    assert.equal(socket.closes, 1);
    assert.equal(FakeWebSocket.instances.length, 1);
  }
});

test('old epochs are dropped while malformed, discontinuous and oversized active audio fails closed', async () => {
  const old = createHarness('text');
  const oldSocket = await connect(old);
  oldSocket.receive(audioEvent({ sessionEpoch: 'epoch-old' }));
  assert.equal(old.audio.sources.length, 0);
  assert.deepEqual(old.failures, []);
  old.session.close();

  for (const mutation of [
    { sampleCount: 2400, audio: pcm(1) },
    { sequence: 1, sampleStart: 0 },
    { sampleCount: 48001, audio: pcm(48001) },
  ]) {
    const h = createHarness('text');
    const socket = await connect(h);
    socket.receive(audioEvent(mutation));
    assert.equal(h.failures.length, 1);
    assert.equal(socket.closes, 1);
  }

  const ordinary = createHarness('text');
  const ordinarySocket = await connect(ordinary);
  for (let sequence = 0; sequence < 6; sequence++) ordinarySocket.receive(audioEvent({ sequence, sampleStart: sequence * 48000,
    sampleCount: 48000, audio: pcm(48000) }));
  assert.equal(ordinary.audio.sources.length, 6, 'a normal 12-second faster-than-realtime Speech burst remains playable');
  assert.deepEqual(ordinary.failures, []);
  ordinary.session.close();

  const queued = createHarness('text');
  const queuedSocket = await connect(queued);
  for (let sequence = 0; sequence < 11; sequence++) queuedSocket.receive(audioEvent({ sequence, sampleStart: sequence * 48000,
    sampleCount: 48000, audio: pcm(48000) }));
  assert.equal(queued.audio.sources.length, 10);
  assert.equal(queued.failures.length, 1, 'more than 20 seconds of queued PCM fails closed');
});

test('close during microphone permission or capture allocation releases late resources and emits no late connection', async () => {
  let resolveMedia!: (stream: MediaStream) => void;
  const lateTrack = new FakeTrack();
  const lateStream = { getTracks: () => [lateTrack], getAudioTracks: () => [lateTrack] } as unknown as MediaStream;
  const permission = createHarness('microphone', { getUserMedia: () => new Promise(resolve => { resolveMedia = resolve; }) });
  const permissionConnect = permission.session.connect();
  await Promise.resolve();
  permission.session.close();
  resolveMedia(lateStream);
  await permissionConnect;
  assert.equal(lateTrack.stops, 1);
  assert.equal(FakeWebSocket.instances.length, 0);
  assert.equal(permission.connections.length, 0);

  let resolveCapture!: (capture: { close(): void; setMuted(value: boolean): void }) => void;
  let lateCaptureCloses = 0;
  const allocation = createHarness('microphone', { startCapture: () => new Promise(resolve => { resolveCapture = resolve; }) });
  const allocating = allocation.session.connect();
  await until(() => FakeWebSocket.instances.length === 1);
  const socket = FakeWebSocket.instances[0]; socket.open(); socket.receive(ready());
  assert.equal([...allocation.timers.values()].some(value => value.delay === 60_000), false, 'accepted ready redeems the ticket before capture resolves');
  allocation.session.close();
  resolveCapture({ close: () => { lateCaptureCloses += 1; }, setMuted() {} });
  await allocating;
  await Promise.resolve();
  assert.equal(lateCaptureCloses, 1);
  assert.equal(allocation.connections.length, 0);
});

test('close during grant fetch sends one independent control tombstone and disposes a late grant', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let resolveGrant!: (response: Response) => void;
  let captureStarts = 0;
  const h = createHarness('microphone', {
    fetch: async (input, init = {}) => {
      const url = String(input); requests.push({ url, init });
      if (url === '/api/voice/control') return Response.json({ state: 'closing' });
      return new Promise<Response>(resolve => { resolveGrant = resolve; });
    },
    startCapture: async () => { captureStarts += 1; return { close() {}, setMuted() {} }; },
  });
  const connecting = h.session.connect();
  await until(() => requests.some(value => value.url === '/api/voice/connect'));
  const start = requests.find(value => value.url === '/api/voice/connect')!;
  h.session.close();
  await until(() => requests.some(value => value.url === '/api/voice/control'));
  const stop = requests.find(value => value.url === '/api/voice/control')!;
  const startBody = JSON.parse(String(start.init.body));
  const stopBody = JSON.parse(String(stop.init.body));
  assert.deepEqual(stopBody, { action: 'end', requestId: startBody.requestId });
  assert.equal(stop.init.keepalive, true);
  assert.notEqual(stop.init.signal, start.init.signal);
  assert.equal(start.init.signal?.aborted, true);
  assert.equal(stop.init.signal?.aborted, false);
  assert.equal(h.track.stops, 1);
  resolveGrant(Response.json(connectResult()));
  await connecting;
  await Promise.resolve();
  assert.equal(FakeWebSocket.instances.length, 0);
  assert.equal(captureStarts, 0);
  h.session.close();
  assert.equal(requests.filter(value => value.url === '/api/voice/control').length, 1);
});

test('a reentrant ready diagnostics observer cannot reconnect, install duration work, or call onConnected after close', async () => {
  let session: ReturnType<typeof createVoiceLiveBrowserSession> | undefined;
  const h = createHarness('text', {}, {
    onDiagnostics(snapshot) { if (snapshot.status === 'ready') session?.close(); },
  });
  session = h.session;
  const connecting = session.connect();
  await until(() => FakeWebSocket.instances.length === 1);
  const socket = FakeWebSocket.instances[0]; socket.open(); socket.receive(ready());
  await connecting;
  assert.equal(h.connections.length, 0);
  assert.equal(h.audio.closed, 1);
  assert.equal([...h.timers.values()].some(value => value.delay === 600_000), false);
  assert.equal(FakeWebSocket.instances.length, 1);
});

test('a bounded pre-ready terminal event reports its truthful message without establishing a live epoch', async () => {
  const h = createHarness('text');
  const connecting = h.session.connect();
  await until(() => FakeWebSocket.instances.length === 1);
  const socket = FakeWebSocket.instances[0]; socket.open();
  socket.receive({ type: 'ended', sessionEpoch: 'pending', reason: 'authentication', message: 'Voice Live authorization was rejected.' });
  await connecting;
  assert.deepEqual(h.failures, ['Voice Live authorization was rejected.']);
  assert.equal(h.connections.length, 0);
  assert.equal(h.events.length, 0);
  assert.equal(h.audio.sources.length, 0);
  assert.equal(h.audio.closed, 1);
  assert.equal([...h.timers.values()].some(value => value.delay === 600_000), false);
  assert.equal(socket.closes, 1);
});

test('invalid grants never open a socket and connect timeout is bounded', async () => {
  for (const invalid of [
    { url: 'ws://voice.example.test/private-voice-live' },
    { url: 'wss://user:secret@voice.example.test/private-voice-live' },
    { url: 'wss://voice.example.test/private-voice-live?secret=x' },
    { url: 'wss://voice.example.test/other' },
  ]) {
    const h = createHarness('text', { fetch: async () => Response.json(connectResult(invalid)) });
    await h.session.connect();
    assert.equal(FakeWebSocket.instances.length, 0);
    assert.equal(h.failures.length, 1);
  }

  const timeout = createHarness('text');
  const connecting = timeout.session.connect();
  await until(() => timeout.timers.size > 0);
  const timer = [...timeout.timers.values()].find(value => value.delay === 40_000);
  assert.ok(timer); timer.callback();
  await connecting;
  assert.equal(timeout.failures.length, 1);
  assert.ok(FakeWebSocket.instances.length <= 1, 'timeout cannot reconnect');
});
