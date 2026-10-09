import {
  CONTINUOUS_SPEECH_MAX_SECONDS,
  CONTINUOUS_SPEECH_PCM,
  type ContinuousSpeechGrant,
  type ContinuousSpeechHypothesis,
  type ContinuousSpeechReason,
  type ContinuousSpeechStatus,
} from "./continuous-speech-contracts";
import {
  PCM_CAPTURE_FRAME_BYTES,
  PCM_CAPTURE_FRAME_SAMPLES,
  startPcmCapture,
  type PcmCapture,
  type PcmCaptureOptions,
} from "./pcm-capture";

const MAX_BUFFERED_AUDIO_BYTES = 64 * 1024;
const CONNECT_TIMEOUT_MS = 10_000;
const GRANT_EXPIRY_MARGIN_MS = 1_000;
const MAX_TEXT_LENGTH = 4_000;
const MAX_EPOCH_LENGTH = 128;
const RECOGNITION_LANGUAGES = new Set(["en-IN", "hi-IN"]);

const REASONS = new Set<ContinuousSpeechReason>([
  "configuration", "authentication", "capacity", "backpressure", "provider",
  "expired", "protocol", "input_limit", "microphone",
]);

export type ContinuousSpeechSessionOptions = {
  grant: ContinuousSpeechGrant;
  stream: MediaStream;
  signal?: AbortSignal;
  onStatus: (status: { state: ContinuousSpeechStatus; reason?: ContinuousSpeechReason; sessionEpoch?: string }) => void;
  onHypothesis: (hypothesis: ContinuousSpeechHypothesis) => void;
  onProgress?: (value: { submittedSamples: number; receivedAt: number }) => void;
};

export type ContinuousSpeechSession = {
  connect(): Promise<void>;
  close(): void;
  setMuted(muted: boolean): void;
};

/** Narrow test seam. Production callers should omit this argument. */
export type ContinuousSpeechBrowserDependencies = {
  createWebSocket?: (url: string) => WebSocket;
  startCapture?: (options: PcmCaptureOptions) => Promise<PcmCapture>;
  now?: () => number;
  wallClock?: () => number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

function abortError() {
  return new DOMException("Continuous speech recognition was cancelled.", "AbortError");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>) {
  return Object.keys(value).every(key => allowed.has(key));
}

const STATUS_KEYS = new Set(["type", "state", "sessionEpoch", "reason"]);
const HYPOTHESIS_KEYS = new Set([
  "type", "sessionEpoch", "segmentId", "revision", "audioStartSample", "audioEndSample", "text", "state",
]);

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function isLoopback(hostname: string) {
  if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  return Boolean(match && match.slice(1).every(part => Number(part) <= 255) && match[1] === "127");
}

function validateGrant(grant: ContinuousSpeechGrant, now: number): ContinuousSpeechReason | undefined {
  if (!isRecord(grant) || grant.transport !== "websocket") return "configuration";
  let url: URL;
  try { url = new URL(grant.url); } catch { return "configuration"; }
  if ((url.protocol !== "wss:" && !(url.protocol === "ws:" && isLoopback(url.hostname))) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/private-speech") return "configuration";
  if (typeof grant.ticket !== "string" || !/^[a-f0-9]{64}$/.test(grant.ticket) || !RECOGNITION_LANGUAGES.has(grant.language)) return "configuration";
  if (grant.recognitionLanguages !== undefined && (!Array.isArray(grant.recognitionLanguages) || grant.recognitionLanguages.length < 1 ||
      grant.recognitionLanguages.length > 2 || new Set(grant.recognitionLanguages).size !== grant.recognitionLanguages.length ||
      !grant.recognitionLanguages.includes(grant.language) || grant.recognitionLanguages.some(language => !RECOGNITION_LANGUAGES.has(language)))) return "configuration";
  if (!Number.isFinite(grant.maxDurationSeconds) || !Number.isInteger(grant.maxDurationSeconds) ||
      grant.maxDurationSeconds <= 0 || grant.maxDurationSeconds > CONTINUOUS_SPEECH_MAX_SECONDS) return "configuration";
  if (!isRecord(grant.pcm) || grant.pcm.sampleRate !== CONTINUOUS_SPEECH_PCM.sampleRate ||
      grant.pcm.channels !== CONTINUOUS_SPEECH_PCM.channels || grant.pcm.bitsPerSample !== CONTINUOUS_SPEECH_PCM.bitsPerSample ||
      grant.pcm.frameMs !== CONTINUOUS_SPEECH_PCM.frameMs || grant.pcm.frameBytes !== CONTINUOUS_SPEECH_PCM.frameBytes) return "configuration";
  const expiresAt = Date.parse(grant.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now + GRANT_EXPIRY_MARGIN_MS ? undefined : "expired";
}

/**
 * Streams an already-authorized microphone stream to the private continuous-ASR
 * sidecar. The stream and its tracks remain owned by the caller.
 */
export function createContinuousSpeechSession(
  options: ContinuousSpeechSessionOptions,
  dependencies: ContinuousSpeechBrowserDependencies = {},
): ContinuousSpeechSession {
  const createWebSocket = dependencies.createWebSocket ?? (url => new WebSocket(url));
  const beginCapture = dependencies.startCapture ?? startPcmCapture;
  const now = dependencies.now ?? (() => performance.now());
  const wallClock = dependencies.wallClock ?? (() => Date.now());
  const setTimer = dependencies.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = dependencies.clearTimer ?? (timer => clearTimeout(timer));
  const captureAbort = new AbortController();

  let socket: WebSocket | undefined;
  let capture: PcmCapture | undefined;
  let connectPromise: Promise<void> | undefined;
  let resolveConnect: (() => void) | undefined;
  let rejectConnect: ((error: Error) => void) | undefined;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let durationTimer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  let closed = false;
  let terminalStatusSent = false;
  let ready = false;
  let captureStarting = false;
  let desiredMuted = false;
  let sessionEpoch: string | undefined;
  let submittedSamples = 0;
  let lastSegmentId = -1;
  let lastRevision = -1;
  let externalAbortListener: (() => void) | undefined;

  const clearTimers = () => {
    if (connectTimer !== undefined) clearTimer(connectTimer);
    if (expiryTimer !== undefined) clearTimer(expiryTimer);
    if (durationTimer !== undefined) clearTimer(durationTimer);
    connectTimer = expiryTimer = durationTimer = undefined;
  };

  const detachSocket = () => {
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
  };

  const release = (closeCode = 1000) => {
    clearTimers();
    captureAbort.abort();
    capture?.close();
    capture = undefined;
    if (externalAbortListener && options.signal) options.signal.removeEventListener("abort", externalAbortListener);
    externalAbortListener = undefined;
    if (socket) {
      const current = socket;
      detachSocket();
      if (current.readyState === 0 || current.readyState === 1) {
        try { current.close(closeCode); } catch { /* A failed transport is already terminal. */ }
      }
    }
  };

  const rejectPendingConnect = (message: string, aborted = false) => {
    if (!rejectConnect) return;
    const reject = rejectConnect;
    resolveConnect = rejectConnect = undefined;
    reject(aborted ? abortError() : new Error(message));
  };

  const emitStatus = (status: { state: ContinuousSpeechStatus; reason?: ContinuousSpeechReason; sessionEpoch?: string }) => {
    options.onStatus(Object.freeze(status));
  };

  const terminate = (
    status?: { state: "unavailable" | "ended"; reason?: ContinuousSpeechReason; sessionEpoch?: string },
    message = "Continuous speech recognition ended before it was ready.",
    closeCode = 1000,
    aborted = false,
  ) => {
    if (closed) return;
    closed = true;
    release(closeCode);
    if (status && !terminalStatusSent) {
      terminalStatusSent = true;
      try { emitStatus(status); } catch { /* A caller callback must not retain resources. */ }
    }
    rejectPendingConnect(message, aborted);
  };

  const fail = (reason: ContinuousSpeechReason, message: string, closeCode = 1011) => {
    terminate({ state: "unavailable", reason, ...(sessionEpoch ? { sessionEpoch } : {}) }, message, closeCode);
  };

  const sendFrame = (pcm: ArrayBuffer, metadata: { sampleStart: number; sampleCount: number }) => {
    if (closed) return;
    if ((!ready && !captureStarting) || !socket || socket.readyState !== 1) {
      fail("provider", "The continuous speech connection closed while audio was being submitted.");
      return;
    }
    if (!(pcm instanceof ArrayBuffer) || pcm.byteLength !== PCM_CAPTURE_FRAME_BYTES ||
        metadata.sampleCount !== PCM_CAPTURE_FRAME_SAMPLES || metadata.sampleStart !== submittedSamples) {
      fail("microphone", "Microphone PCM capture lost its required frame cadence.", 1002);
      return;
    }
    if (!Number.isFinite(socket.bufferedAmount) || socket.bufferedAmount < 0 ||
        socket.bufferedAmount + pcm.byteLength > MAX_BUFFERED_AUDIO_BYTES) {
      fail("backpressure", "Continuous speech recognition could not keep up with microphone audio.");
      return;
    }
    try { socket.send(pcm); }
    catch { fail("provider", "Continuous speech recognition could not submit microphone audio."); return; }
    submittedSamples += PCM_CAPTURE_FRAME_SAMPLES;
    try { options.onProgress?.(Object.freeze({ submittedSamples, receivedAt: now() })); }
    catch { fail("protocol", "The continuous speech progress callback failed."); }
  };

  const startCaptureAfterReady = () => {
    if (closed || captureStarting || ready) return;
    captureStarting = true;
    let starting: Promise<PcmCapture>;
    try { starting = beginCapture({
      stream: options.stream,
      signal: captureAbort.signal,
      onFrame: sendFrame,
      onFailure: () => fail("microphone", "Microphone PCM capture stopped."),
    }); } catch {
      fail("microphone", "Microphone PCM capture could not start.");
      return;
    }
    void starting.then(startedCapture => {
      if (closed) { startedCapture.close(); return; }
      capture = startedCapture;
      captureStarting = false;
      if (desiredMuted) capture.setMuted(true);
      ready = true;
      if (connectTimer !== undefined) { clearTimer(connectTimer); connectTimer = undefined; }
      try { emitStatus({ state: "ready", sessionEpoch: sessionEpoch! }); }
      catch { fail("protocol", "The continuous speech status callback failed."); return; }
      const resolve = resolveConnect;
      resolveConnect = rejectConnect = undefined;
      resolve?.();
    }).catch(error => {
      if (closed) return;
      const aborted = captureAbort.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      if (aborted) terminate(undefined, "Continuous speech recognition was cancelled.", 1000, true);
      else fail("microphone", "Microphone PCM capture could not start.");
    });
  };

  const parseEpoch = (value: unknown) => isBoundedString(value, MAX_EPOCH_LENGTH) ? value : undefined;

  const receiveServerEvent = (raw: unknown) => {
    if (closed) return;
    if (typeof raw !== "string" || raw.length === 0 || raw.length > 16_384) {
      fail("protocol", "Continuous speech recognition received an invalid server event.", 1002);
      return;
    }
    let event: unknown;
    try { event = JSON.parse(raw); } catch {
      fail("protocol", "Continuous speech recognition received invalid JSON.", 1002);
      return;
    }
    if (!isRecord(event) || typeof event.type !== "string") {
      fail("protocol", "Continuous speech recognition received an invalid server event.", 1002);
      return;
    }
    if (event.type === "status") {
      if (!hasOnlyKeys(event, STATUS_KEYS) || (event.state !== "ready" && event.state !== "unavailable" && event.state !== "ended")) {
        fail("protocol", "Continuous speech recognition received an invalid status.", 1002);
        return;
      }
      if (event.reason !== undefined && (typeof event.reason !== "string" || !REASONS.has(event.reason as ContinuousSpeechReason))) {
        fail("protocol", "Continuous speech recognition received an invalid status reason.", 1002);
        return;
      }
      const epoch = event.sessionEpoch === undefined ? undefined : parseEpoch(event.sessionEpoch);
      if (event.sessionEpoch !== undefined && !epoch) {
        fail("protocol", "Continuous speech recognition received an invalid session epoch.", 1002);
        return;
      }
      if (event.state === "ready") {
        if (!epoch || sessionEpoch || event.reason !== undefined || !socket || socket.readyState !== 1) {
          fail("protocol", "Continuous speech recognition received an invalid ready event.", 1002);
          return;
        }
        sessionEpoch = epoch;
        startCaptureAfterReady();
        return;
      }
      if (sessionEpoch && epoch && epoch !== sessionEpoch) {
        fail("protocol", "Continuous speech recognition changed session epoch.", 1002);
        return;
      }
      const normalizedEpoch = epoch ?? sessionEpoch;
      const status: { state: "unavailable" | "ended"; reason?: ContinuousSpeechReason; sessionEpoch?: string } = {
        state: event.state,
        ...(event.reason ? { reason: event.reason as ContinuousSpeechReason } : {}),
        ...(normalizedEpoch ? { sessionEpoch: normalizedEpoch } : {}),
      };
      terminate(status, `Continuous speech recognition became ${event.state}.`);
      return;
    }
    if (event.type !== "hypothesis" || !hasOnlyKeys(event, HYPOTHESIS_KEYS) || !ready || !sessionEpoch || event.sessionEpoch !== sessionEpoch ||
        !Number.isSafeInteger(event.segmentId) || (event.segmentId as number) < 0 ||
        !Number.isSafeInteger(event.revision) || (event.revision as number) < 0 ||
        !Number.isSafeInteger(event.audioStartSample) || (event.audioStartSample as number) < 0 ||
        !Number.isSafeInteger(event.audioEndSample) || (event.audioEndSample as number) < (event.audioStartSample as number) ||
        (event.audioEndSample as number) > submittedSamples + PCM_CAPTURE_FRAME_SAMPLES ||
        typeof event.text !== "string" || event.text.length > MAX_TEXT_LENGTH ||
        (event.state !== "interim" && event.state !== "sidecar_final")) {
      fail("protocol", "Continuous speech recognition received an invalid hypothesis.", 1002);
      return;
    }
    const segmentId = event.segmentId as number;
    const revision = event.revision as number;
    if (segmentId < lastSegmentId || (segmentId === lastSegmentId && revision <= lastRevision)) {
      fail("protocol", "Continuous speech recognition received a non-monotonic hypothesis.", 1002);
      return;
    }
    lastRevision = revision;
    lastSegmentId = segmentId;
    const hypothesis: ContinuousSpeechHypothesis = Object.freeze({
      type: "hypothesis",
      sessionEpoch,
      segmentId,
      revision,
      audioStartSample: event.audioStartSample as number,
      audioEndSample: event.audioEndSample as number,
      text: event.text,
      state: event.state,
    });
    try { options.onHypothesis(hypothesis); }
    catch { fail("protocol", "The continuous speech hypothesis callback failed."); }
  };

  const close = () => {
    if (closed) return;
    const wasStarted = started;
    terminate(wasStarted ? { state: "ended", ...(sessionEpoch ? { sessionEpoch } : {}) } : undefined,
      "Continuous speech recognition was closed.", 1000, true);
  };

  const connect = () => {
    if (connectPromise) return connectPromise;
    if (closed || options.signal?.aborted) {
      closed = true;
      return Promise.reject(abortError());
    }
    started = true;
    connectPromise = new Promise<void>((resolve, reject) => { resolveConnect = resolve; rejectConnect = reject; });
    const invalidReason = validateGrant(options.grant, wallClock());
    if (invalidReason) {
      fail(invalidReason, invalidReason === "expired" ? "The continuous speech grant expired." : "The continuous speech grant is invalid.", 1002);
      return connectPromise;
    }
    try { emitStatus({ state: "connecting" }); }
    catch { fail("protocol", "The continuous speech status callback failed."); return connectPromise; }
    if (closed) return connectPromise;

    externalAbortListener = close;
    options.signal?.addEventListener("abort", externalAbortListener, { once: true });
    if (options.signal?.aborted) { close(); return connectPromise; }
    const expiresIn = Date.parse(options.grant.expiresAt) - wallClock();
    expiryTimer = setTimer(() => fail("expired", "The continuous speech grant expired."), expiresIn);
    durationTimer = setTimer(() => terminate({ state: "ended", reason: "input_limit", ...(sessionEpoch ? { sessionEpoch } : {}) },
      "The continuous speech duration limit was reached."), options.grant.maxDurationSeconds * 1_000);
    connectTimer = setTimer(() => fail("provider", "Continuous speech recognition timed out while connecting."), CONNECT_TIMEOUT_MS);

    try {
      const url = options.grant.url;
      const ticket = options.grant.ticket;
      socket = createWebSocket(url);
      socket.binaryType = "arraybuffer";
      socket.onopen = () => {
        if (closed || !socket || socket.readyState !== 1) return;
        try { socket.send(JSON.stringify({ type: "start", ticket })); }
        catch { fail("provider", "Continuous speech recognition could not start."); }
      };
      socket.onmessage = event => receiveServerEvent(event.data);
      socket.onerror = () => fail("provider", "The continuous speech connection failed.");
      socket.onclose = () => fail("provider", "The continuous speech connection closed.");
    } catch {
      fail("provider", "The continuous speech connection could not be created.");
    }
    return connectPromise;
  };

  return {
    connect,
    close,
    setMuted(muted) {
      desiredMuted = muted;
      if (closed || !capture) return;
      try { capture.setMuted(muted); }
      catch { fail("microphone", "Microphone PCM capture could not change mute state."); }
    },
  };
}
