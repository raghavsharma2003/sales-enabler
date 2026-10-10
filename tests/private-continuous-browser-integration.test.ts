import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createBrowserVoiceSession, type BrowserVoiceSession } from '../lib/voice/browser-session';
import type { ContinuousSpeechSessionOptions } from '../lib/voice/continuous-speech-browser';
import type { ContinuousUnderstandingSnapshot } from '../lib/voice/continuous-understanding';
import type { VoiceRuntimeDiagnostics } from '../lib/voice/diagnostics';
import type { ConversationEntry } from '../lib/voice/emotional';
import { compileRelationalRuntime } from '../lib/voice/relational-runtime';
import { CONTINUOUS_SPEECH_PCM } from '../lib/voice/continuous-speech-contracts';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const brief = 'Please keep this conversation brief.';

function harness(t: TestContext, configuration: {
  early?: boolean; inputMode?: 'text' | 'microphone'; reference?: 'preview' | 'connection' | 'missing'; pendingGrant?: boolean;
  onDiagnostics?: (value: VoiceRuntimeDiagnostics, session: () => BrowserVoiceSession) => void;
} = {}) {
  const names = ['window', 'navigator', 'RTCPeerConnection', 'Audio', 'AudioContext', 'fetch'] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const sent: Record<string, any>[] = [], requests: { url: string; method: string; body: any; signal?: AbortSignal }[] = [];
  const entries: ConversationEntry[] = [], failures: string[] = [], snapshots: ContinuousUnderstandingSnapshot[] = [];
  const statuses: string[] = [], mutes: boolean[] = [];
  let session: BrowserVoiceSession, sidecarOptions: ContinuousSpeechSessionOptions | undefined;
  let factories = 0, captureCloses = 0, trackStops = 0, peersClosed = 0, microphoneRequests = 0;
  let resolveGrant!: (response: Response) => void;
  const pendingGrant = new Promise<Response>(resolve => { resolveGrant = resolve; });
  const grant = { transport: 'websocket', url: 'wss://speech.example.test/private-speech', ticket: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000).toISOString(), maxDurationSeconds: 600, language: 'en-IN', pcm: CONTINUOUS_SPEECH_PCM };
  const track = { enabled: true, stop() { trackStops++; }, onended: null };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const channel = {
    readyState: 'connecting', onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null, onclose: null, onerror: null,
    send(raw: string) { sent.push(JSON.parse(raw)); }, close() { this.readyState = 'closed'; },
  };
  class Peer {
    ontrack = null; onconnectionstatechange = null;
    addTrack() {} addTransceiver() {}
    createDataChannel() { return channel; }
    async createOffer() { return { sdp: 'v=0\r\nm=audio' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { channel.readyState = 'open'; channel.onopen?.(); }
    close() { peersClosed++; }
  }
  const reference = configuration.reference ?? 'preview';
  const globals = {
    window: { isSecureContext: true }, AudioContext: undefined,
    navigator: { mediaDevices: { getUserMedia: async () => { microphoneRequests++; return stream; } } },
    RTCPeerConnection: Peer, Audio: class { autoplay = false; srcObject = null; pause() {} },
    fetch: async (url: string, init: RequestInit = {}) => {
      requests.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined, signal: init.signal ?? undefined });
      if (url === '/api/voice/connect') return Response.json({ provider: 'azure', transport: 'webrtc', sdp: 'v=0\r\nm=audio',
        initialInstructions: 'Approved company AI context.', ...(reference === 'preview' ? { previewId: 'issued-preview' } : reference === 'connection' ? { connectionId: 'issued-connection' } : {}) });
      if (url === '/api/voice/perception' && init.method === 'POST') return configuration.pendingGrant ? pendingGrant : Response.json(grant);
      if (url === '/api/voice/perception' && init.method === 'DELETE') return Response.json({ ok: true });
      if (url === '/api/voice/control' && init.method === 'POST') {
        const start = requests.find(request => request.url === '/api/voice/connect')!;
        assert.deepEqual(JSON.parse(String(init.body)), { action: 'end', requestId: start.body.requestId });
        return Response.json({ requested: true, state: 'closed' });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
  session = createBrowserVoiceSession({ provider: 'azure', inputMode: configuration.inputMode ?? 'microphone', continuousSpeech: configuration.early ?? true,
    onConnected() {}, onFailure: message => failures.push(message),
    onEvent: event => {
      if (event.type === 'transcript') {
        entries.push(event.entry);
        if (event.entry.role === 'user') session.updateBehavior(compileRelationalRuntime({ entries }).instructions);
      }
    },
    onDiagnostics: value => configuration.onDiagnostics?.(value, () => session),
    onUnderstanding: value => snapshots.push(value), onContinuousSpeechStatus: value => statuses.push(value.state),
  }, { createContinuousSpeechSession: options => {
    factories++; sidecarOptions = options;
    return { async connect() { options.onStatus({ state: 'ready', sessionEpoch: 'epoch' }); },
      close() { captureCloses++; }, setMuted(value) { mutes.push(value); } };
  } });
  t.after(async () => {
    session.close();
    await flush(); // Let the mocked server End receipt settle before restoring global fetch.
    for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name);
  });
  const emit = (event: unknown) => channel.onmessage?.({ data: JSON.stringify(event) });
  const updates = () => sent.filter(event => event.type === 'session.update');
  const replies = () => sent.filter(event => event.type === 'response.create');
  const ack = (update = updates().at(-1)!) => emit({ type: 'session.updated', session: update.session });
  const native = (type: string, item_id = 'native-1') => emit({ type: `input_audio_buffer.${type}`, item_id });
  const progress = (submittedSamples: number) => sidecarOptions!.onProgress?.({ submittedSamples, receivedAt: submittedSamples / 16 });
  const hypothesis = (revision: number, text = brief, state: 'interim' | 'sidecar_final' = 'interim') => sidecarOptions!.onHypothesis({
    type: 'hypothesis', sessionEpoch: 'epoch', segmentId: 1, revision, audioStartSample: 100, audioEndSample: 500 + revision * 100, text, state,
  });
  const connect = async () => {
    await session.connect(); await flush();
    emit({ type: 'response.created', response: { id: 'opening' } });
    emit({ type: 'response.done', response: { id: 'opening', status: 'completed' } });
  };
  const start = () => { progress(320); native('speech_started'); ack(); progress(1600); };
  const final = (text = brief) => {
    native('speech_stopped'); native('committed');
    emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'native-1', transcript: text });
  };
  return { session, connect, emit, native, progress, hypothesis, start, final, ack, updates, replies, entries, failures, snapshots, statuses, requests,
    stream, track, channel, mutes, sidecar: () => sidecarOptions!, factories: () => factories, captureCloses: () => captureCloses,
    trackStops: () => trackStops, peersClosed: () => peersClosed, microphoneRequests: () => microphoneRequests,
    grant: () => resolveGrant(Response.json(grant)) };
}

for (const configuration of [{ early: false }, { inputMode: 'text' as const }, { reference: 'missing' as const }]) {
  test(`continuous browser routing excludes ${JSON.stringify(configuration)}`, { concurrency: false }, async t => {
    const h = harness(t, configuration); await h.connect();
    assert.equal(h.requests.some(request => request.url === '/api/voice/perception'), false);
    assert.equal(h.factories(), 0);
    if ('inputMode' in configuration) assert.equal(h.microphoneRequests(), 0);
    assert.equal(h.channel.readyState, 'open');
  });
}

for (const reference of ['preview', 'connection'] as const) test(`sidecar uses the issued ${reference} reference and existing microphone`, { concurrency: false }, async t => {
  const h = harness(t, { reference }); await h.connect();
  const authorization = h.requests.find(request => request.url === '/api/voice/perception' && request.method === 'POST')!;
  assert.deepEqual(authorization.body, reference === 'preview' ? { previewId: 'issued-preview', consent: true } : { connectionId: 'issued-connection', consent: true });
  assert.equal(h.requests[0].url, '/api/voice/connect');
  assert.equal(h.sidecar().stream, h.stream);
  assert.equal(h.microphoneRequests(), 1); assert.equal(h.factories(), 1);
});

test('real controller preparation stays ephemeral and matching native final reuses its acknowledged guidance', { concurrency: false }, async t => {
  const h = harness(t); await h.connect(); h.start();
  h.hypothesis(1); h.hypothesis(2);
  assert.equal(h.snapshots.at(-1)?.phase, 'preparing');
  assert.deepEqual([...h.entries], []); assert.equal(h.replies().length, 1, 'only the opening response exists');
  h.ack(); assert.equal(h.replies().length, 1, 'a prepared ACK cannot authorize a response');
  const count = h.updates().length;
  h.final();
  assert.deepEqual(h.entries.map(entry => entry.text), [brief]);
  assert.equal(h.updates().length, count, 'final compilation reuses the exact prepared context');
  assert.equal(h.replies().length, 2); assert.deepEqual(h.failures, []);
});

test('a corrected native final cannot respond using an acknowledged partial', { concurrency: false }, async t => {
  const h = harness(t); await h.connect(); h.start(); h.hypothesis(1); h.hypothesis(2); h.ack();
  const partial = h.updates().at(-1)!;
  h.final('Do not keep this conversation brief.');
  assert.equal(h.replies().length, 1);
  assert.notEqual(h.updates().at(-1)!.session.instructions, partial.session.instructions);
  h.ack(partial); assert.equal(h.replies().length, 1, 'late candidate ACK cannot release corrected final');
  h.ack(); assert.equal(h.replies().length, 2);
});

test('sidecar final and sidecar failure neither publish text nor terminate native calling', { concurrency: false }, async t => {
  const h = harness(t); await h.connect(); h.start(); h.hypothesis(1); h.hypothesis(2); h.ack();
  h.hypothesis(3, brief, 'sidecar_final');
  assert.deepEqual([...h.entries], []); assert.equal(h.replies().length, 1);
  h.sidecar().onStatus({ state: 'unavailable', reason: 'provider' });
  assert.equal(h.channel.readyState, 'open'); assert.equal(h.trackStops(), 0); assert.deepEqual(h.failures, []);
  assert.equal(h.snapshots.at(-1)?.phase, 'ended');
  h.final(); h.ack(); h.ack();
  assert.equal(h.replies().length, 2); assert.deepEqual(h.entries.map(entry => entry.text), [brief]);
});

test('End during a pending grant revokes authority and cannot start a late sidecar', { concurrency: false }, async t => {
  const h = harness(t, { pendingGrant: true }); await h.connect();
  const pending = h.requests.find(request => request.url === '/api/voice/perception' && request.method === 'POST')!;
  h.session.close();
  assert.equal(pending.signal?.aborted, true); assert.equal(h.trackStops(), 1);
  assert.equal(h.channel.onmessage, null); assert.equal(h.peersClosed(), 0, 'silent RTC waits for the server End receipt');
  const statusCount = h.statuses.length;
  h.grant(); await flush();
  assert.equal(h.peersClosed(), 1);
  assert.equal(h.requests.filter(request => request.url === '/api/voice/control').length, 1);
  assert.equal(h.factories(), 0); assert.equal(h.statuses.length, statusCount);
  assert.ok(h.requests.some(request => request.url === '/api/voice/perception' && request.method === 'DELETE'));
});

test('mute clears ephemeral preparation and End suppresses late sidecar callbacks', { concurrency: false }, async t => {
  const h = harness(t); await h.connect(); h.start(); h.hypothesis(1); h.hypothesis(2); h.ack();
  h.session.setMuted(true);
  assert.equal(h.track.enabled, false); assert.equal(h.mutes.at(-1), true);
  assert.equal(h.snapshots.at(-1)?.phase, 'paused'); assert.equal(h.snapshots.at(-1)?.latest, undefined);
  h.hypothesis(3); assert.equal(h.snapshots.at(-1)?.latest, undefined);
  h.session.setMuted(false); assert.equal(h.track.enabled, true);
  h.hypothesis(4); assert.equal(h.snapshots.at(-1)?.bound, false, 'mute transition invalidates this native interval');
  h.session.close();
  const counts = [h.snapshots.length, h.statuses.length, h.updates().length, h.replies().length];
  h.hypothesis(5); h.progress(3200); h.sidecar().onStatus({ state: 'ready', sessionEpoch: 'epoch' });
  assert.deepEqual([h.snapshots.length, h.statuses.length, h.updates().length, h.replies().length], counts);
  assert.equal(h.captureCloses(), 1); assert.equal(h.sidecar().signal?.aborted, true);
});

test('closing from a diagnostics observer cannot emit a later continuous status', { concurrency: false }, async t => {
  let ended = false;
  const h = harness(t, { onDiagnostics(value, session) {
    if (!ended && value.continuousSpeech?.status === 'connecting') { ended = true; session().close(); }
  } });
  await h.connect();
  assert.equal(ended, true); assert.deepEqual(h.statuses, []); assert.equal(h.factories(), 0);
});

test('closing from hypothesis diagnostics cannot deliver an obsolete understanding snapshot', { concurrency: false }, async t => {
  let ended = false;
  const h = harness(t, { onDiagnostics(value, session) {
    if (!ended && value.continuousSpeech?.interimCount === 1) { ended = true; session().close(); }
  } });
  await h.connect(); h.start();
  const count = h.snapshots.length;
  h.hypothesis(1);
  assert.equal(ended, true); assert.equal(h.snapshots.length, count); assert.equal(h.captureCloses(), 1);
});
