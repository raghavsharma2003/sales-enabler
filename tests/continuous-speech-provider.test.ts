import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { createAzureContinuousSpeechProvider, speechPushBufferedBytes, guardSpeechTransport, configureAzureSpeechNodeTransport } from '../lib/voice/continuous-speech-provider';
import type { ContinuousSpeechHypothesis } from '../lib/voice/continuous-speech-contracts';

async function harness() {
  let recognizer: any, startCallback: (() => void) | undefined, failureCallback: (() => void) | undefined;
  let written = 0, closed = 0, pushClosed = 0, at = 0, autodetect = false;
  const events: ContinuousSpeechHypothesis[] = [], failures: string[] = [], properties: Record<string, string> = {};
  let started = 0;
  const stream = { privStream: { privTargetChunkSize: 3200, privNextBufferReadyBytes: 0, privReaderQueue: { length: () => 0 } }, write: (frame: ArrayBuffer) => { written += frame.byteLength; }, close: () => { pushClosed++; } };
  class Recognizer {
    internalData = { privConnectionFactory: { create: async () => { throw new Error('No network in unit tests.'); } } };
    constructor() { recognizer = this; }
    static enableTelemetry(value: boolean) { assert.equal(value, false); }
    static FromConfig() { autodetect = true; return new Recognizer(); }
    startContinuousRecognitionAsync(success: () => void, failure: () => void) { startCallback = success; failureCallback = failure; }
    close() { closed++; }
  }
  const provider = await createAzureContinuousSpeechProvider({ language: 'en-IN', recognitionLanguages: ['en-IN', 'hi-IN'], sessionEpoch: 'epoch', onStarted: () => { started++; }, onHypothesis: event => events.push(event), onFailure: reason => failures.push(reason) }, {
    env: { AZURE_SPEECH_KEY: 'fictional-unit-test-key-only', AZURE_SPEECH_REGION: 'eastus2' }, now: () => at,
    loadSDK: async () => ({ SpeechRecognizer: Recognizer, SpeechConfig: { fromSubscription: () => ({ setProperty: (key: string, value: string) => { properties[key] = value; } }) },
      AudioStreamFormat: { getWaveFormatPCM: (...args: number[]) => { assert.deepEqual(args, [16000, 16, 1]); return {}; } }, AudioInputStream: { createPushStream: () => stream }, AudioConfig: { fromStreamInput: () => ({ close() {} }) },
      Connection: { fromRecognizer: () => ({ closeConnection() {}, close() {} }) }, AutoDetectSourceLanguageConfig: { fromLanguages: (languages: string[]) => { assert.deepEqual(languages, ['en-IN', 'hi-IN']); return {}; } }, ResultReason: { RecognizedSpeech: 1, NoMatch: 2 },
    }) as any,
  });
  const emit = (state: 'interim' | 'final', text = 'Fictional recognition', offset = 0, duration = 200_000, elapsed = 110) => {
    at += elapsed;
    recognizer[state === 'interim' ? 'recognizing' : 'recognized'](undefined, { result: { text, offset, duration, reason: 1, resultId: Math.random().toString() } });
  };
  return { provider, emit, events, failures, stream, properties, autodetect, advance: (ms: number) => { at += ms; }, written: () => written, closed: () => closed, pushClosed: () => pushClosed, started: () => started, success: () => startCallback?.(), fail: () => failureCallback?.() };
}

test('provider accepts PCM before SDK callback, preserves internal segment across changing offsets and IDs, and closes once', async () => {
  const h = await harness(); h.provider.start(); h.provider.start();
  h.provider.write(new Uint8Array(640)); h.provider.write(new Uint8Array(640));
  assert.equal(h.written(), 1280); assert.equal(h.started(), 0); h.success(); assert.equal(h.started(), 1);
  h.emit('interim', 'one', 0, 200_000); h.emit('interim', 'one two', 100_000, 200_000); h.emit('final', 'one two', 0, 400_000); h.emit('interim', 'next', 400_000, 0);
  assert.deepEqual(h.events.map(event => [event.segmentId, event.revision, event.audioStartSample, event.audioEndSample]), [[1, 1, 0, 320], [1, 2, 160, 480], [1, 3, 0, 640], [2, 1, 640, 640]]);
  assert.equal(h.autodetect, true); assert.equal(h.properties['SPEECH-Error-MaxRetryCount'], '0');
  h.provider.close(); h.provider.close(); h.fail(); h.success(); h.emit('final');
  assert.equal(h.closed(), 1); assert.equal(h.pushClosed(), 1); assert.equal(h.events.length, 4); assert.equal(h.failures.length, 0);
});

test('provider fails closed for impossible offsets, overlong text, SDK failure and stalled queue', async () => {
  for (const failure of ['offset', 'length', 'sdk', 'queue', 'shape']) {
    const h = await harness(); h.provider.start();
    if (failure === 'offset') h.emit('interim', 'x', Infinity, 0);
    if (failure === 'length') h.emit('interim', 'x'.repeat(4001));
    if (failure === 'sdk') h.fail();
    if (failure === 'queue') { h.stream.privStream.privReaderQueue.length = () => 20; h.provider.write(new Uint8Array(640)); }
    if (failure === 'shape') { h.stream.privStream.privTargetChunkSize = 640; h.provider.write(new Uint8Array(640)); }
    assert.equal(h.events.length, 0); assert.equal(h.closed(), 1); assert.equal(h.failures.length, 1);
    assert.equal(h.failures[0], failure === 'queue' ? 'backpressure' : 'provider');
  }
});

test('actual pinned SDK exposes bounded push queue without starting any provider connection', async () => {
  const sdk = await import('microsoft-cognitiveservices-speech-sdk');
  const stream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1));
  assert.equal(speechPushBufferedBytes(stream), 0);
  for (let i = 1; i <= 8; i++) { stream.write(new ArrayBuffer(640)); await Promise.resolve(); assert.equal(speechPushBufferedBytes(stream), i * 640); }
  stream.close();
  assert.throws(() => speechPushBufferedBytes({}), /buffer unavailable/);
  const config = sdk.SpeechConfig.fromSubscription('fictional-unit-test-key-only', 'eastus2');
  const recognizer = new sdk.SpeechRecognizer(config, sdk.AudioConfig.fromStreamInput(sdk.AudioInputStream.createPushStream()));
  const guard = guardSpeechTransport(recognizer, () => 0, () => assert.fail('Guard must not open a connection.'));
  assert.equal(guard.check(), true); guard.close(); recognizer.close();
});

test('configuration fails before SDK allocation and raw errors never become events', async () => {
  let loads = 0;
  await assert.rejects(createAzureContinuousSpeechProvider({ language: 'en-IN', sessionEpoch: 'epoch', onStarted() {}, onHypothesis() {}, onFailure() {} }, { env: {}, loadSDK: async () => { loads++; throw new Error('private diagnostic'); } }), /configuration unavailable/);
  assert.equal(loads, 0);
});

test('interim callback output is throttled and excessive SDK callback volume closes the provider', async () => {
  const h = await harness(); h.provider.start(); h.provider.write(new Uint8Array(640));
  for (let i = 0; i < 101; i++) h.emit('interim', 'synthetic partial', 0, 200_000, 0);
  assert.equal(h.events.length, 1); assert.equal(h.failures.length, 1); assert.equal(h.closed(), 1);
});

test('downstream send reservations and socket buffered bytes share the input cap and fail closed on missing shapes', async () => {
  for (const mode of ['pending', 'socket', 'combined', 'missing', 'negative', 'message']) {
    let bufferedAmount = 0, sends = 0, terminated = 0, upstream = mode === 'combined' ? 40_000 : 0;
    const socket = { get bufferedAmount() { return bufferedAmount; }, terminate() { terminated++; } };
    const transport = { privConnectionMessageAdapter: { privWebsocketClient: socket as typeof socket | undefined }, open: async () => undefined, dispose: async () => undefined,
      send: async (_message?: unknown) => { sends++; if (mode === 'pending') return new Promise(() => undefined); if (mode === 'socket' || mode === 'combined') bufferedAmount += 3200; },
    };
    const factory = { create: async () => transport }, failures: string[] = [];
    const guard = guardSpeechTransport({ internalData: { privConnectionFactory: factory } }, () => upstream, reason => { failures.push(reason); guard.close(); });
    const connection = await factory.create(); await connection.open();
    if (mode === 'missing') transport.privConnectionMessageAdapter.privWebsocketClient = undefined;
    if (mode === 'negative') bufferedAmount = -1;
    if (mode === 'message') { await connection.send({ messageType: 1, privSize: NaN, headers: {} } as never).catch(() => undefined); }
    else {
      for (let i = 0; i < 100 && !failures.length; i++) {
        void connection.send({ messageType: 1, privSize: 3200, headers: {} } as never).catch(() => undefined);
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    }
    assert.equal(failures.length, 1, mode); assert.equal(failures[0], ['missing', 'negative', 'message'].includes(mode) ? 'provider' : 'backpressure');
    assert.ok(sends < 20, mode); assert.ok(bufferedAmount + upstream <= 64_000, mode);
    if (mode !== 'missing') assert.equal(terminated, 1, mode);
    guard.close(); upstream = 0;
  }
  assert.throws(() => guardSpeechTransport({}, () => 0, () => undefined), /transport unavailable/);
});

test('real SDK sendAudio cannot drain the push stream into an unbounded stalled downstream queue', async () => {
  const sdk = await import('microsoft-cognitiveservices-speech-sdk');
  let push: any, recognizer: any, sendBytes = 0, terminated = 0, maximumPushBytes = 0;
  const failures: string[] = [];
  const stalled = {
    privConnectionMessageAdapter: { privWebsocketClient: { bufferedAmount: 0, terminate() { terminated++; } } },
    open: async () => undefined, dispose: async () => undefined,
    send(message: { privSize: number }) { sendBytes += message.privSize; return new Promise(() => undefined); },
  };
  class LocalRecognizer extends sdk.SpeechRecognizer {
    constructor(config: any, audio: any) {
      super(config, audio); recognizer = this;
      (this.internalData as any).privConnectionFactory = { create: async () => stalled };
    }
    startContinuousRecognitionAsync(success?: () => void) {
      const service = this.internalData as any;
      service.privRequestSession.startNewRecognition();
      void (async () => {
        const connection = await service.privConnectionFactory.create(); await connection.open();
        service.fetchConnection = async () => connection;
        const audioNode = await push.attach('synthetic-node');
        void service.sendAudio(audioNode).catch(() => undefined);
        success?.();
      })();
    }
  }
  const provider = await createAzureContinuousSpeechProvider({ language: 'en-IN', sessionEpoch: 'epoch', onStarted() {}, onHypothesis: () => assert.fail('No provider events in local reproduction.'), onFailure: reason => failures.push(reason) }, {
    env: { AZURE_SPEECH_KEY: 'fictional-unit-test-key-only', AZURE_SPEECH_REGION: 'eastus2' },
    loadSDK: async () => ({ ...sdk, SpeechRecognizer: LocalRecognizer, AudioInputStream: { ...sdk.AudioInputStream, createPushStream: (format: any) => { push = sdk.AudioInputStream.createPushStream(format); return push; } } }) as any,
  });
  provider.start();
  for (let i = 0; i < 200 && !failures.length; i++) {
    provider.write(new Uint8Array(640)); await new Promise<void>(resolve => setImmediate(resolve));
    if (!failures.length) maximumPushBytes = Math.max(maximumPushBytes, speechPushBufferedBytes(push));
  }
  assert.deepEqual(failures, ['backpressure']);
  assert.ok(sendBytes <= 64_000, `Stalled downstream exceeded cap: ${sendBytes}`);
  assert.ok(maximumPushBytes <= 3200, 'The real SDK drained input; the downstream reservation caused termination.');
  assert.equal(terminated, 1); assert.equal((recognizer.internalData as any).privIsDisposed, true);
  provider.close();
});

test('actual SDK uses its terminable Node transport with native global WebSocket present', { timeout: 15_000 }, async () => {
  const nativeWebSocket = globalThis.WebSocket;
  assert.equal(typeof nativeWebSocket, 'function', 'This project requires Node 24 with native WebSocket.');
  assert.equal(typeof (nativeWebSocket.prototype as unknown as { terminate?: unknown }).terminate, 'undefined');
  const [{ WebsocketConnection }, { WebsocketMessageFormatter }, { ConnectionMessage, MessageType }] = await Promise.all([
    import('microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.browser/WebsocketConnection.js'),
    import('microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/WebsocketMessageFormatter.js'),
    import('microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common/ConnectionMessage.js'),
  ]);
  await configureAzureSpeechNodeTransport();
  assert.equal(globalThis.WebSocket, nativeWebSocket, 'Do not replace the process-global WebSocket.');
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(server, 'listening');
  const connection = new WebsocketConnection(`ws://127.0.0.1:${(server.address() as { port: number }).port}`, {}, {}, new WebsocketMessageFormatter(), undefined as never);
  const factory = { create: async () => connection }, failures: string[] = [];
  const guard = guardSpeechTransport({ internalData: { privConnectionFactory: factory } }, () => 0, reason => failures.push(reason));
  try {
    const peerConnected = once(server, 'connection');
    const guarded = await factory.create(); const opened = await guarded.open(); assert.equal(opened.statusCode, 200);
    const [peer] = await peerConnected;
    const actualSocket = (connection as any).privConnectionMessageAdapter.privWebsocketClient;
    assert.equal(typeof actualSocket.terminate, 'function');
    assert.equal(actualSocket instanceof nativeWebSocket, false);
    const received = once(peer, 'message');
    await guarded.send(new ConnectionMessage(MessageType.Binary, new ArrayBuffer(640), { Path: 'audio' }));
    const [frame] = await received; assert.ok(frame.byteLength >= 640);
    assert.equal(guard.check(), true); assert.deepEqual(failures, []);
    const peerClosed = once(peer, 'close'); guard.close(); await peerClosed;
    assert.equal(globalThis.WebSocket, nativeWebSocket);
  } finally {
    guard.close(); await connection.dispose();
    for (const peer of server.clients) peer.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
