import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createBrowserVoiceSession } from '../lib/voice/browser-session';
import type { ContinuousSpeechSessionOptions } from '../lib/voice/continuous-speech-browser';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function fixture(t: TestContext, options: { pendingConnect?: boolean; early?: boolean } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const names = ['window', 'navigator', 'RTCPeerConnection', 'Audio', 'AudioContext', 'fetch'] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const requests: { url: string; body: Record<string, any>; init: RequestInit }[] = [], events: unknown[] = [], failures: string[] = [], statuses: unknown[] = [];
  const sent: unknown[] = [];
  let trackStops = 0, captureCloses = 0, rtcCloses = 0, channelCloses = 0, pauses = 0, connected = 0, remoteDescriptions = 0;
  let sidecar: ContinuousSpeechSessionOptions | undefined;
  let resolveControl!: (response: Response) => void, rejectControl!: (error: Error) => void, resolveConnect!: (response: Response) => void;
  const pendingControl = new Promise<Response>((resolve, reject) => { resolveControl = resolve; rejectControl = reject; });
  const pendingConnect = new Promise<Response>(resolve => { resolveConnect = resolve; });
  const publicConnection = { provider: 'azure', transport: 'webrtc', sdp: 'v=0\r\nm=audio', previewId: 'issued-preview', voiceAttemptId: 'public-attempt-receipt', initialInstructions: 'Approved AI company context.' };
  const track = { enabled: true, onended: null, stop() { trackStops++; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const channel = {
    readyState: 'connecting', onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null, onclose: null, onerror: null,
    send(raw: string) { sent.push(JSON.parse(raw)); }, close() { channelCloses++; this.readyState = 'closed'; },
  };
  class Peer {
    static instance: Peer;
    ontrack: ((event: { streams: unknown[] }) => void) | null = null;
    onconnectionstatechange = null;
    constructor() { Peer.instance = this; }
    addTrack() {} createDataChannel() { return channel; }
    async createOffer() { return { sdp: 'v=0\r\nm=audio' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { remoteDescriptions++; channel.readyState = 'open'; channel.onopen?.(); }
    close() { rtcCloses++; }
  }
  class Playback {
    static instance: Playback;
    autoplay = false; srcObject: unknown = null;
    constructor() { Playback.instance = this; }
    pause() { pauses++; } async play() {}
  }
  const globals = {
    window: { isSecureContext: true }, navigator: { mediaDevices: { getUserMedia: async () => stream } },
    RTCPeerConnection: Peer, Audio: Playback, AudioContext: undefined,
    fetch: async (url: string, init: RequestInit = {}) => {
      requests.push({ url, body: JSON.parse(String(init.body ?? '{}')), init });
      if (url === '/api/voice/connect') return options.pendingConnect ? pendingConnect : Response.json(publicConnection);
      if (url === '/api/voice/control') return pendingControl;
      if (url === '/api/voice/perception') return Response.json(init.method === 'DELETE' ? { ok: true } : { transport: 'websocket' });
      throw new Error(`Unexpected network call: ${url}`);
    },
  };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
  const session = createBrowserVoiceSession({ provider: 'azure', continuousSpeech: options.early ?? false,
    onConnected() { connected++; }, onEvent: event => events.push(event), onFailure: message => failures.push(message),
    onUnderstanding: value => statuses.push(value), onContinuousSpeechStatus: value => statuses.push(value),
  }, { createContinuousSpeechSession: value => {
    sidecar = value;
    return { async connect() { value.onStatus({ state: 'ready', sessionEpoch: 'epoch' }); },
      close() { captureCloses++; }, setMuted() {} };
  } });
  t.after(async () => {
    session.close(); resolveControl(Response.json({ state: 'closed' })); await flush();
    t.mock.timers.reset();
    for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name);
  });
  return { session, channel, requests, events, statuses, sent, failures, sidecar: () => sidecar!,
    trackStops: () => trackStops, captureCloses: () => captureCloses, rtcCloses: () => rtcCloses, channelCloses: () => channelCloses,
    pauses: () => pauses, connected: () => connected, remoteDescriptions: () => remoteDescriptions,
    playback: () => Playback.instance, trackPlayback: () => Peer.instance.ontrack?.({ streams: [stream] }),
    resolveControl: () => resolveControl(Response.json({ requested: true, state: 'closed' })), rejectControl: () => rejectControl(new Error('Synthetic offline control')),
    resolveConnect: () => resolveConnect(Response.json(publicConnection)) };
}

test('End stops microphone, playback and sidecar now while RTC awaits the server receipt', { concurrency: false }, async t => {
  const f = fixture(t, { early: true }); await f.session.connect(); await flush(); f.trackPlayback();
  assert.ok(f.playback().srcObject);
  const staleMessage = f.channel.onmessage!;
  const before = f.events.length;
  f.session.close(); f.session.close();
  assert.equal(f.trackStops(), 1); assert.equal(f.pauses(), 1); assert.equal(f.playback().srcObject, null);
  assert.equal(f.captureCloses(), 1); assert.equal(f.sidecar().signal?.aborted, true);
  assert.equal(f.channel.onmessage, null); assert.equal(f.rtcCloses(), 0); assert.equal(f.channelCloses(), 0);
  const statuses = f.statuses.length;
  staleMessage({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'late', transcript: 'Late content' }) });
  f.sidecar().onStatus({ state: 'ready', sessionEpoch: 'epoch' });
  f.sidecar().onProgress?.({ submittedSamples: 320, receivedAt: 20 });
  assert.equal(f.events.length, before); assert.equal(f.statuses.length, statuses);
  assert.equal(f.session.sendText('Cannot send after End'), false); assert.equal(f.session.updateBehavior('Cannot update after End'), false);
  await flush();
  const start = f.requests.find(request => request.url === '/api/voice/connect')!, stop = f.requests.find(request => request.url === '/api/voice/control')!;
  assert.match(start.body.requestId, /^[a-f0-9-]{36}$/);
  assert.deepEqual(stop.body, { action: 'end', requestId: start.body.requestId });
  assert.equal(stop.init.keepalive, true); assert.equal(stop.init.signal, undefined, 'End control survives the aborted connect signal');
  assert.equal(f.requests.filter(request => request.url === '/api/voice/control').length, 1);
  assert.equal(f.requests.filter(request => request.url === '/api/voice/perception' && request.init.method === 'DELETE').length, 1);
  assert.equal(f.rtcCloses(), 0, 'the silent RTC remains until control settles');
  f.resolveControl(); await flush();
  assert.equal(f.rtcCloses(), 1); assert.equal(f.channelCloses(), 1); assert.deepEqual(f.failures, []);
});

test('End has an unconditional four-second RTC teardown bound and a late receipt cannot close twice', { concurrency: false }, async t => {
  const f = fixture(t); await f.session.connect();
  f.session.close(); await flush();
  t.mock.timers.tick(3999); assert.equal(f.rtcCloses(), 0); assert.equal(f.trackStops(), 1);
  t.mock.timers.tick(1); assert.equal(f.rtcCloses(), 1); assert.equal(f.channelCloses(), 1);
  f.resolveControl(); await flush(); t.mock.timers.tick(10000);
  assert.equal(f.rtcCloses(), 1); assert.equal(f.channelCloses(), 1); assert.deepEqual(f.failures, []);
});

test('a rejected control request settles teardown without reviving observers or displaying a late failure', { concurrency: false }, async t => {
  const f = fixture(t); await f.session.connect(); f.session.close(); await flush();
  f.rejectControl(); await flush();
  assert.equal(f.rtcCloses(), 1); assert.equal(f.channelCloses(), 1); assert.deepEqual(f.failures, []);
});

test('End during connect uses the original request ID and ignores a late issued answer', { concurrency: false }, async t => {
  const f = fixture(t, { pendingConnect: true });
  const connecting = f.session.connect(); await flush();
  const start = f.requests.find(request => request.url === '/api/voice/connect')!;
  assert.ok(start);
  await f.session.connect();
  assert.equal(f.requests.filter(request => request.url === '/api/voice/connect').length, 1, 'one session start has one stable allocation request');
  f.session.close(); await flush();
  assert.equal(start.init.signal?.aborted, true); assert.equal(f.trackStops(), 1);
  assert.deepEqual(f.requests.find(request => request.url === '/api/voice/control')!.body, { action: 'end', requestId: start.body.requestId });
  f.resolveConnect(); await connecting; await flush();
  assert.equal(f.connected(), 0); assert.equal(f.remoteDescriptions(), 0); assert.equal(f.sent.length, 0);
  assert.equal(f.rtcCloses(), 0); f.resolveControl(); await flush(); assert.equal(f.rtcCloses(), 1);
  assert.deepEqual(f.failures, []);
});

test('End before start never sends allocation or server control', { concurrency: false }, async t => {
  const f = fixture(t); f.session.close(); await f.session.connect(); await flush();
  assert.equal(f.requests.length, 0); assert.equal(f.connected(), 0); assert.equal(f.trackStops(), 0);
});
