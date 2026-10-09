// Server-only adapter. Imported by the Node gateway, never by a browser entry point.
import { performance } from 'node:perf_hooks';
import { CONTINUOUS_SPEECH_PCM, type ContinuousSpeechHypothesis, type ContinuousSpeechReason } from './continuous-speech-contracts';

type SpeechSDK = typeof import('microsoft-cognitiveservices-speech-sdk');

/** Pinned SDK 1.52.0 defaults to Node 24's global WebSocket, which cannot be
 * synchronously terminated. Select the SDK's own Node transport before creating
 * any connection; never modify globalThis.WebSocket or another library's socket.
 */
export async function configureAzureSpeechNodeTransport(): Promise<void> {
  const { WebsocketMessageAdapter } = await import('microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.browser/WebsocketMessageAdapter.js');
  if (typeof WebsocketMessageAdapter.forceNpmWebSocket !== 'boolean') throw new Error('Speech transport unavailable.');
  WebsocketMessageAdapter.forceNpmWebSocket = true;
}
export interface ContinuousSpeechProvider {
  /** Starts asynchronously; input may be written before the SDK start callback. */
  start(): void;
  write(frame: Uint8Array): void;
  close(): void;
}
export interface ContinuousSpeechProviderOptions {
  language: 'en-IN' | 'hi-IN'; recognitionLanguages?: ('en-IN' | 'hi-IN')[]; sessionEpoch: string;
  onStarted(): void;
  onHypothesis(event: ContinuousSpeechHypothesis): void;
  onFailure(reason: ContinuousSpeechReason): void;
}

/** Version-pinned guard: SDK 1.52 exposes no public push-stream backpressure API.
 * Inspect only queue sizes, never audio. An incompatible SDK fails closed.
 * Includes the partially assembled 100 ms SDK chunk; max two seconds buffered.
 */
export function speechPushBufferedBytes(stream: unknown): number {
  const internal = (stream as { privStream?: { privTargetChunkSize?: number; privNextBufferReadyBytes?: number; privReaderQueue?: { length(): number } } })?.privStream;
  const size = internal?.privTargetChunkSize, pending = internal?.privNextBufferReadyBytes;
  const length = internal?.privReaderQueue?.length();
  if (size !== 3200 || !Number.isSafeInteger(pending) || pending! < 0 || pending! >= size || !Number.isSafeInteger(length) || length! < 0) throw new Error('Speech buffer unavailable.');
  return length! * size + pending!;
}

/** SDK 1.52.0 compatibility boundary. ServiceRecognizerBase does not await audio
 * sends, so push-stream size alone misses formatter/send queues and socket bytes.
 * Reserve byte counts until each send settles, and also account for ws buffering.
 * Only size metadata is inspected; no audio, text or headers are retained/logged.
 */
export function guardSpeechTransport(recognizer: unknown, upstreamBytes: () => number, fail: (reason: ContinuousSpeechReason) => void) {
  type Message = { messageType: number; privSize: number; headers: Record<string, string> };
  type Transport = { send(message: Message): Promise<unknown>; open(): Promise<unknown>; dispose(): Promise<void>; privConnectionMessageAdapter: { privWebsocketClient?: { bufferedAmount: number; terminate(): void } | null } };
  type Factory = { create(...args: unknown[]): Promise<Transport> };
  const factory = (recognizer as { internalData?: { privConnectionFactory?: Factory } })?.internalData?.privConnectionFactory;
  if (!factory || typeof factory.create !== 'function') throw new Error('Speech transport unavailable.');
  const create = factory.create;
  let allocated: Transport | undefined, active: Transport | undefined, outstanding = 0, closed = false;
  function socketBytes(transport = active) {
    if (!transport) return 0;
    const value = transport.privConnectionMessageAdapter?.privWebsocketClient?.bufferedAmount;
    if (!Number.isSafeInteger(value) || value! < 0) throw new Error('Speech transport unavailable.');
    return value!;
  }
  function check(additional = 0) {
    if (closed) return false;
    try {
      if (upstreamBytes() + outstanding + socketBytes() + additional > 64_000) { fail('backpressure'); return false; }
      return true;
    } catch { fail('provider'); return false; }
  }
  factory.create = async function (...args) {
    const transport = await create.apply(this, args);
    if (closed) { void transport.dispose().catch(() => undefined); throw new Error('Speech transport ended.'); }
    if (allocated || !transport?.privConnectionMessageAdapter || typeof transport.send !== 'function' || typeof transport.open !== 'function' || typeof transport.dispose !== 'function') {
      try { void transport?.dispose?.().catch(() => undefined); } catch { /* Local teardown only. */ }
      fail('provider'); throw new Error('Speech transport unavailable.');
    }
    allocated = transport;
    const open = transport.open, send = transport.send;
    transport.open = async function () {
      const result = await open.call(this);
      if (closed) { void transport.dispose().catch(() => undefined); throw new Error('Speech transport ended.'); }
      try {
        if (typeof transport.privConnectionMessageAdapter.privWebsocketClient?.terminate !== 'function') throw new Error();
        socketBytes(transport); active = transport;
      } catch { fail('provider'); throw new Error('Speech transport unavailable.'); }
      return result;
    };
    transport.send = function (message) {
      if (closed) return Promise.reject(new Error('Speech transport ended.'));
      let reserved: number;
      try {
        // privSize is supplied by the pinned SDK constructor: bytes for binary,
        // UTF-16 code units for text. Three bytes/unit bounds UTF-8 encoding.
        if (![0, 1].includes(message.messageType) || !Number.isSafeInteger(message.privSize) || message.privSize < 0 || !message.headers || typeof message.headers !== 'object') throw new Error();
        const headers = Object.entries(message.headers);
        if (headers.length > 16 || headers.some(([key, value]) => typeof value !== 'string' || key.length > 100 || value.length > 200)) throw new Error();
        const headerBytes = headers.reduce((total, [key, value]) => total + 3 * (key.length + value.length) + 4, 32);
        reserved = message.privSize * (message.messageType === 0 ? 3 : 1) + headerBytes;
        if (!Number.isSafeInteger(reserved) || reserved > 16_384) throw new Error();
      } catch { fail('provider'); return Promise.reject(new Error('Speech transport unavailable.')); }
      if (!check(reserved)) return Promise.reject(new Error('Speech transport unavailable.'));
      outstanding += reserved;
      try {
        return Promise.resolve(send.call(this, message)).then(value => {
          // Check socket buffering while the conservative reservation still exists.
          check(); outstanding -= reserved; return value;
        }, () => { outstanding -= reserved; fail('provider'); throw new Error('Speech transport unavailable.'); });
      } catch { outstanding -= reserved; fail('provider'); return Promise.reject(new Error('Speech transport unavailable.')); }
    };
    return transport;
  };
  return {
    check,
    close() {
      if (closed) return; closed = true;
      // SDK close waits behind unresolved sends; terminate its owned Node socket
      // immediately so neither queued bytes nor a stalled close survive teardown.
      try { allocated?.privConnectionMessageAdapter.privWebsocketClient?.terminate(); } catch { /* Local teardown only. */ }
    },
  };
}

export async function createAzureContinuousSpeechProvider(options: ContinuousSpeechProviderOptions, dependencies: {
  env?: Record<string, string | undefined>; loadSDK?: () => Promise<SpeechSDK>; now?: () => number;
} = {}): Promise<ContinuousSpeechProvider> {
  const env = dependencies.env || process.env;
  const key = env.AZURE_SPEECH_KEY?.trim() || '', region = env.AZURE_SPEECH_REGION?.trim().toLowerCase() || '';
  if (key.length < 20 || key.includes('REPLACE_WITH') || !/^[a-z0-9-]{2,40}$/.test(region) || !['en-IN', 'hi-IN'].includes(options.language)) throw new Error('Speech configuration unavailable.');
  const sdk = await (dependencies.loadSDK || (() => import('microsoft-cognitiveservices-speech-sdk')))();
  await configureAzureSpeechNodeTransport();
  const now = dependencies.now || (() => performance.now());
  sdk.SpeechRecognizer.enableTelemetry(false);
  const config = sdk.SpeechConfig.fromSubscription(key, region);
  config.speechRecognitionLanguage = options.language;
  // Pinned SDK's bounded connection-attempt setting; no application reconnect.
  config.setProperty('SPEECH-Error-MaxRetryCount', '0');
  const push = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16_000, 16, 1));
  let audio: import('microsoft-cognitiveservices-speech-sdk').AudioConfig | undefined;
  let recognizer: import('microsoft-cognitiveservices-speech-sdk').SpeechRecognizer | undefined;
  let connection: import('microsoft-cognitiveservices-speech-sdk').Connection | undefined;
  let transportGuard: ReturnType<typeof guardSpeechTransport> | undefined;
  let closed = false, started = false, submittedSamples = 0, segmentId = 1, revision = 0;
  let writesThisTick = 0, clearWritesScheduled = false;
  let callbackWindow = now(), callbacks = 0, lastInterimAt = -Infinity;
  function close() {
    if (closed) return;
    closed = true;
    transportGuard?.close();
    // Do not wait for stopContinuousRecognitionAsync: its callback can stall.
    try { push.close(); } catch { /* Local cleanup only. */ }
    try { connection?.closeConnection(undefined, () => undefined); } catch { /* Local cleanup only. */ }
    try { recognizer?.close(undefined, () => undefined); } catch { /* Local cleanup only. */ }
    try { connection?.close(); } catch { /* Local cleanup only. */ }
    try { audio?.close(); } catch { /* Local cleanup only. */ }
  }
  function fail(reason: ContinuousSpeechReason = 'provider') {
    if (closed) return;
    close(); options.onFailure(reason);
  }
  function result(text: string, offset: number, duration: number, state: ContinuousSpeechHypothesis['state']) {
    if (closed) return;
    const at = now();
    if (at - callbackWindow >= 1000) { callbackWindow = at; callbacks = 0; }
    if (++callbacks > 100) { fail(); return; }
    // Azure uses 100-ns ticks. Offsets can move between partial/final results;
    // segment identity belongs to our in-progress utterance, not offset/resultId.
    const begin = Math.floor(offset * 16_000 / 10_000_000);
    const end = Math.ceil((offset + duration) * 16_000 / 10_000_000);
    if (typeof text !== 'string' || text.length > 4000 || !Number.isFinite(offset) || !Number.isFinite(duration) || offset < 0 || duration < 0 || !Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || end < begin || end > submittedSamples + 320) { fail(); return; }
    if (text.trim() && (state === 'sidecar_final' || at - lastInterimAt >= 100)) {
      options.onHypothesis({ type: 'hypothesis', sessionEpoch: options.sessionEpoch, segmentId, revision: ++revision, audioStartSample: begin, audioEndSample: end, text, state });
      if (state === 'interim') lastInterimAt = at;
    }
    if (state === 'sidecar_final') { segmentId++; revision = 0; lastInterimAt = -Infinity; }
  }
  try {
    speechPushBufferedBytes(push);
    audio = sdk.AudioConfig.fromStreamInput(push);
    recognizer = options.recognitionLanguages?.length === 2 && new Set(options.recognitionLanguages).size === 2
      ? sdk.SpeechRecognizer.FromConfig(config, sdk.AutoDetectSourceLanguageConfig.fromLanguages(['en-IN', 'hi-IN']), audio)
      : new sdk.SpeechRecognizer(config, audio);
    transportGuard = guardSpeechTransport(recognizer, () => speechPushBufferedBytes(push) + writesThisTick, fail);
    connection = sdk.Connection.fromRecognizer(recognizer);
    connection.disconnected = () => fail();
    recognizer.recognizing = (_sender, event) => result(event.result.text, event.result.offset, event.result.duration, 'interim');
    recognizer.recognized = (_sender, event) => {
      if (closed) return;
      if (event.result.reason === sdk.ResultReason.RecognizedSpeech) result(event.result.text, event.result.offset, event.result.duration, 'sidecar_final');
      else if (event.result.reason === sdk.ResultReason.NoMatch) { segmentId++; revision = 0; lastInterimAt = -Infinity; }
    };
    recognizer.canceled = () => fail();
    recognizer.sessionStopped = () => fail();
  } catch { close(); throw new Error('Speech configuration unavailable.'); }
  return {
    start() {
      if (closed || started) return;
      started = true;
      try { recognizer!.startContinuousRecognitionAsync(() => { if (!closed) options.onStarted(); }, () => fail()); } catch { fail(); }
    },
    write(frame) {
      if (closed || !started || frame.byteLength !== CONTINUOUS_SPEECH_PCM.frameBytes) throw new Error('Speech input unavailable.');
      try {
        // SDK enqueues complete chunks in a microtask. Conservatively include
        // all same-tick writes until that queue length becomes observable.
        if (!transportGuard!.check(frame.byteLength)) return;
        writesThisTick += frame.byteLength;
        if (!clearWritesScheduled) { clearWritesScheduled = true; queueMicrotask(() => { writesThisTick = 0; clearWritesScheduled = false; }); }
        submittedSamples += frame.byteLength / 2;
        push.write(Uint8Array.from(frame).buffer);
      } catch { fail(); }
    },
    close,
  };
}
