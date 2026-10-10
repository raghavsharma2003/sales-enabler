import type { BrowserVoiceOptions, BrowserVoiceSession } from './browser-session';
import { startPcmCapture, type PcmCapture, type PcmCaptureOptions } from './pcm-capture';
import { createVoiceDiagnostics } from './diagnostics';
import {
  VOICE_LIVE_INPUT_FRAME_BYTES,
  VOICE_LIVE_MAX_AUDIO_BYTES,
  VOICE_LIVE_MAX_CONTROL_BYTES,
  VOICE_LIVE_OUTPUT_SAMPLE_RATE,
  parseVoiceLiveClientEvent,
  parseVoiceLiveServerEvent,
  type VoiceLiveClientEvent,
  type VoiceLivePlayedItem,
  type VoiceLiveServerEvent,
} from './voice-live-protocol';

const CONNECT_TIMEOUT_MS = 40_000;
const MAX_DURATION_MS = 10 * 60_000;
const MAX_SOCKET_BUFFER_BYTES = 64 * 1024;
/** Managed Speech can deliver substantially faster than real time. Keep a finite
 * 20-second playout queue while starting the first chunk immediately. */
const MAX_QUEUED_SECONDS = 20;
const PLAYBACK_LEAD_SECONDS = 0.015;
const MAX_ITEMS_PER_RESPONSE = 100;
const MAX_SEGMENTS_PER_ITEM = 4096;
const MAX_SUPPRESSED_RESPONSES = 450;

type VoiceLiveConnectResult = {
  provider: 'azure';
  transport: 'voice-live';
  ticket: string;
  url: string;
  expiresAt: string;
  previewId: string;
  voiceAttemptId: string;
  openingMessage?: string;
  initialInstructions?: string;
  behaviorContext?: unknown;
  enabledTools?: string[];
  error?: string;
};

type PlaybackSegment = { start: number; end: number; samples: number; sampleStart: number };
type PlaybackItem = {
  itemId: string;
  contentIndex: number;
  heardSamples: number;
  segments: PlaybackSegment[];
};

class VoiceLivePlaybackLedger {
  private responseId = '';
  private items: PlaybackItem[] = [];
  private expected = new Map<string, { sequence: number; sampleStart: number }>();
  private suppressed = new Set<string>();

  currentResponseId() { return this.responseId; }

  private compact(now: number) {
    for (const item of this.items) {
      while (item.segments.length && item.segments[0].end <= now) {
        const segment = item.segments.shift()!;
        item.heardSamples += segment.samples;
      }
    }
  }

  private played(item: PlaybackItem, now: number) {
    return item.heardSamples + item.segments.reduce((total, segment) => {
      if (now <= segment.start) return total;
      const elapsed = Math.min(now, segment.end) - segment.start;
      return total + Math.min(segment.samples, Math.max(0, Math.floor(elapsed * VOICE_LIVE_OUTPUT_SAMPLE_RATE + 1e-7)));
    }, 0);
  }

  private beginResponse(responseId: string, now: number) {
    this.compact(now);
    if (this.responseId === responseId) return;
    if (this.responseId && this.items.some(item => item.segments.length)) throw new Error('Concurrent Voice Live playback responses.');
    if (this.responseId) {
      this.suppressed.add(this.responseId);
      if (this.suppressed.size > MAX_SUPPRESSED_RESPONSES) throw new Error('Voice Live response history limit reached.');
    }
    this.responseId = responseId;
    this.items = [];
    this.expected.clear();
  }

  schedule(input: {
    responseId: string;
    itemId: string;
    contentIndex: number;
    sequence: number;
    sampleStart: number;
    sampleCount: number;
    start: number;
    now: number;
  }): boolean {
    if (this.suppressed.has(input.responseId)) return false;
    this.beginResponse(input.responseId, input.now);
    const key = `${input.itemId}:${input.contentIndex}`;
    const expected = this.expected.get(key) ?? { sequence: 0, sampleStart: 0 };
    if (input.sequence !== expected.sequence || input.sampleStart !== expected.sampleStart) throw new Error('Discontinuous Voice Live audio.');
    let item = this.items.find(candidate => candidate.itemId === input.itemId && candidate.contentIndex === input.contentIndex);
    if (!item) {
      if (this.items.length >= MAX_ITEMS_PER_RESPONSE) throw new Error('Voice Live playback item limit reached.');
      item = { itemId: input.itemId, contentIndex: input.contentIndex, heardSamples: 0, segments: [] };
      this.items.push(item);
    }
    if (item.segments.length >= MAX_SEGMENTS_PER_ITEM) throw new Error('Voice Live playback segment limit reached.');
    item.segments.push({ start: input.start, end: input.start + input.sampleCount / VOICE_LIVE_OUTPUT_SAMPLE_RATE,
      samples: input.sampleCount, sampleStart: input.sampleStart });
    this.expected.set(key, { sequence: input.sequence + 1, sampleStart: input.sampleStart + input.sampleCount });
    return true;
  }

  complete(responseId: string, itemId: string, contentIndex: number, sampleStart: number) {
    if (responseId !== this.responseId) return;
    const item = this.items.find(candidate => candidate.itemId === itemId && candidate.contentIndex === contentIndex);
    const index = item?.segments.findIndex(segment => segment.sampleStart === sampleStart) ?? -1;
    if (!item || index < 0) return;
    const [segment] = item.segments.splice(index, 1);
    item.heardSamples += segment.samples;
  }

  snapshot(responseId: string, now: number): VoiceLivePlayedItem[] {
    if (responseId !== this.responseId) return [];
    this.compact(now);
    return this.items.map(item => ({ itemId: item.itemId, contentIndex: item.contentIndex, playedSamples: this.played(item, now) }));
  }

  interrupt(responseId: string, now: number): VoiceLivePlayedItem[] {
    const items = this.snapshot(responseId, now);
    if (responseId === this.responseId) {
      for (const item of this.items) {
        const frozen = items.find(candidate => candidate.itemId === item.itemId && candidate.contentIndex === item.contentIndex);
        if (frozen) item.heardSamples = frozen.playedSamples;
        item.segments = [];
      }
      this.suppressed.add(responseId);
      if (this.suppressed.size > MAX_SUPPRESSED_RESPONSES) throw new Error('Voice Live response history limit reached.');
    }
    return items;
  }
}

export type VoiceLiveBrowserDependencies = {
  fetch?: typeof fetch;
  createWebSocket?: (url: string) => WebSocket;
  createAudioContext?: () => AudioContext;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  startCapture?: (options: PcmCaptureOptions) => Promise<PcmCapture>;
  randomUUID?: () => string;
  wallClock?: () => number;
  secureContext?: () => boolean;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

function loopback(hostname: string) {
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  return Boolean(match && match[1] === '127' && match.slice(1).every(part => Number(part) <= 255));
}

function validGrant(result: VoiceLiveConnectResult, now: number) {
  if (result.provider !== 'azure' || result.transport !== 'voice-live' || !/^[A-Za-z0-9_-]{16,2048}$/.test(result.ticket) ||
      typeof result.previewId !== 'string' || !result.previewId || typeof result.voiceAttemptId !== 'string' || !result.voiceAttemptId) return false;
  const expiry = Date.parse(result.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now + 1_000) return false;
  try {
    const url = new URL(result.url);
    return (url.protocol === 'wss:' || url.protocol === 'ws:' && loopback(url.hostname)) && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname === '/private-voice-live';
  } catch { return false; }
}

function decodeAudio(event: Extract<VoiceLiveServerEvent, { type: 'audio' }>) {
  const binary = atob(event.audio);
  if (binary.length !== event.sampleCount * 2 || binary.length > VOICE_LIVE_MAX_AUDIO_BYTES || binary.length % 2) throw new Error('Invalid Voice Live PCM.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Browser transport for the private, server-authorized Azure Voice Live preview. */
export function createVoiceLiveBrowserSession(
  options: BrowserVoiceOptions,
  dependencies: VoiceLiveBrowserDependencies = {},
): BrowserVoiceSession {
  const request = dependencies.fetch ?? fetch;
  const createSocket = dependencies.createWebSocket ?? (url => new WebSocket(url));
  const createAudioContext = dependencies.createAudioContext ?? (() => new AudioContext({ sampleRate: VOICE_LIVE_OUTPUT_SAMPLE_RATE }));
  const getUserMedia = dependencies.getUserMedia ?? (constraints => navigator.mediaDevices.getUserMedia(constraints));
  const beginCapture = dependencies.startCapture ?? startPcmCapture;
  const randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID());
  const wallClock = dependencies.wallClock ?? (() => Date.now());
  const isSecureContext = dependencies.secureContext ?? (() => window.isSecureContext);
  const setTimer = dependencies.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = dependencies.clearTimer ?? (timer => clearTimeout(timer));
  const inputMode = options.inputMode === 'text' ? 'text' : 'microphone';
  const captureAbort = new AbortController();
  const fetchAbort = new AbortController();
  const grantRequestId = randomUUID();
  const ledger = new VoiceLivePlaybackLedger();
  const diagnostics = createVoiceDiagnostics(options.onDiagnostics);
  const sources = new Map<AudioBufferSourceNode, { responseId: string; cancelled: boolean }>();
  const lastPlayed = new Map<string, string>();
  const interruptedResponses = new Set<string>();

  let socket: WebSocket | undefined;
  let audio: AudioContext | undefined;
  let stream: MediaStream | undefined;
  let capture: PcmCapture | undefined;
  let connectPromise: Promise<void> | undefined;
  let settleConnect: (() => void) | undefined;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let durationTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let active = false;
  let readyReceived = false;
  let failureReported = false;
  let muted = false;
  let sessionEpoch = '';
  let nextPlaybackAt = 0;
  let expectedInputSample = 0;
  let inputFrames = 0;
  let connectResult: VoiceLiveConnectResult | undefined;
  let grantRequestSent = false;
  let controlSent = false;

  function clearTimers() {
    if (connectTimer !== undefined) clearTimer(connectTimer);
    if (expiryTimer !== undefined) clearTimer(expiryTimer);
    if (durationTimer !== undefined) clearTimer(durationTimer);
    connectTimer = expiryTimer = durationTimer = undefined;
  }

  function detachSocket() {
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
  }

  function clearPlayback(now = audio?.currentTime ?? 0, responseId?: string) {
    for (const [source, state] of sources) {
      if (responseId && state.responseId !== responseId) continue;
      state.cancelled = true;
      try { source.stop(); } catch { /* The source may already have ended. */ }
      try { source.disconnect(); } catch { /* The source may already be disconnected. */ }
      sources.delete(source);
    }
    nextPlaybackAt = now;
  }

  function release(sendEnd: boolean) {
    if (closed) return;
    if (sendEnd && socket?.readyState === 1) {
      try {
        const responseId = ledger.currentResponseId();
        if (responseId && sessionEpoch && audio) {
          const items = ledger.snapshot(responseId, audio.currentTime);
          if (items.length) socket.send(JSON.stringify(parseVoiceLiveClientEvent({ type: 'played', sessionEpoch, responseId, items })));
        }
        socket.send(JSON.stringify(parseVoiceLiveClientEvent({ type: 'end' })));
      } catch { /* Closing the socket remains authoritative. */ }
    }
    closed = true;
    active = false;
    try { diagnostics.end(); } catch { /* Observers cannot strand owned resources. */ }
    clearTimers();
    fetchAbort.abort();
    if (grantRequestSent && !controlSent) {
      controlSent = true;
      const controlAbort = new AbortController();
      const controlTimer = setTimer(() => controlAbort.abort(), 12_000);
      void Promise.resolve().then(() => request('/api/voice/control', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, signal: controlAbort.signal,
        body: JSON.stringify({ action: 'end', requestId: grantRequestId }),
      })).catch(() => undefined).finally(() => clearTimer(controlTimer));
    }
    captureAbort.abort();
    capture?.close();
    capture = undefined;
    for (const track of stream?.getTracks() ?? []) { track.onended = null; try { track.stop(); } catch { /* Already ended. */ } }
    clearPlayback();
    if (audio && audio.state !== 'closed') void audio.close().catch(() => undefined);
    if (socket) {
      const current = socket;
      detachSocket();
      if (current.readyState === 0 || current.readyState === 1) { try { current.close(); } catch { /* Already closed. */ } }
    }
    const settle = settleConnect;
    settleConnect = undefined;
    settle?.();
  }

  function fail(message: string) {
    if (closed) return;
    release(false);
    if (failureReported) return;
    failureReported = true;
    try { options.onFailure(message); } catch { /* Failure observers do not own resources. */ }
  }

  function observeDiagnostics(action: () => void) {
    try { action(); }
    catch { fail('The voice diagnostics observer failed.'); return false; }
    return !closed;
  }

  function sendControl(event: VoiceLiveClientEvent) {
    if (closed || !socket || socket.readyState !== 1) throw new Error('Voice Live control transport unavailable.');
    const encoded = JSON.stringify(parseVoiceLiveClientEvent(event));
    const encodedBytes = new TextEncoder().encode(encoded).length;
    if (encodedBytes > VOICE_LIVE_MAX_CONTROL_BYTES || !Number.isFinite(socket.bufferedAmount) || socket.bufferedAmount < 0 ||
        socket.bufferedAmount + encodedBytes > MAX_SOCKET_BUFFER_BYTES) throw new Error('Voice Live control message too large.');
    socket.send(encoded);
  }

  function played(responseId: string) {
    if (!active || !audio || responseId !== ledger.currentResponseId()) return;
    const items = ledger.snapshot(responseId, audio.currentTime);
    const fingerprint = JSON.stringify(items);
    if (!items.length || lastPlayed.get(responseId) === fingerprint) return;
    sendControl({ type: 'played', sessionEpoch, responseId, items });
    lastPlayed.set(responseId, fingerprint);
  }

  function interrupt(responseId = ledger.currentResponseId()) {
    if (!responseId || !audio || !sessionEpoch || interruptedResponses.has(responseId)) return;
    const now = audio.currentTime;
    const items = ledger.interrupt(responseId, now);
    clearPlayback(now, responseId);
    sendControl({ type: 'interrupt', sessionEpoch, responseId, items });
    interruptedResponses.add(responseId);
    if (interruptedResponses.size > MAX_SUPPRESSED_RESPONSES) throw new Error('Voice Live interruption history limit reached.');
  }

  function receiveAudio(event: Extract<VoiceLiveServerEvent, { type: 'audio' }>) {
    if (!audio || !sessionEpoch || event.sessionEpoch !== sessionEpoch) return;
    if (!observeDiagnostics(() => diagnostics.generatedOutputReceived())) return;
    const bytes = decodeAudio(event);
    const now = audio.currentTime;
    const start = Math.max(now + PLAYBACK_LEAD_SECONDS, nextPlaybackAt);
    const queuedUntil = start + event.sampleCount / VOICE_LIVE_OUTPUT_SAMPLE_RATE;
    if (queuedUntil - now > MAX_QUEUED_SECONDS + PLAYBACK_LEAD_SECONDS) throw new Error('Voice Live playback queue full.');
    if (!ledger.schedule({ responseId: event.responseId, itemId: event.itemId, contentIndex: event.contentIndex,
      sequence: event.sequence, sampleStart: event.sampleStart, sampleCount: event.sampleCount, start, now })) return;
    const buffer = audio.createBuffer(1, event.sampleCount, VOICE_LIVE_OUTPUT_SAMPLE_RATE);
    const samples = buffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true) / 32768;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    const state = { responseId: event.responseId, cancelled: false };
    sources.set(source, state);
    source.onended = () => {
      sources.delete(source);
      try { source.disconnect(); } catch { /* Already disconnected. */ }
      if (!closed && !state.cancelled) {
        try {
          ledger.complete(event.responseId, event.itemId, event.contentIndex, event.sampleStart);
          played(event.responseId);
        }
        catch { fail('Voice playback evidence could not be submitted. Save the available transcript and start again.'); }
      }
    };
    source.start(start);
    nextPlaybackAt = queuedUntil;
  }

  function sendInputFrame(pcm: ArrayBuffer, metadata: { sampleStart: number; sampleCount: number }) {
    if (closed) return;
    if (!sessionEpoch || !socket || socket.readyState !== 1 || !(pcm instanceof ArrayBuffer) ||
        pcm.byteLength !== VOICE_LIVE_INPUT_FRAME_BYTES || metadata.sampleCount * 2 !== VOICE_LIVE_INPUT_FRAME_BYTES ||
        metadata.sampleStart !== expectedInputSample) {
      fail('Microphone audio lost its required timing. Save the available transcript and start again.');
      return;
    }
    if (!Number.isFinite(socket.bufferedAmount) || socket.bufferedAmount < 0 ||
        socket.bufferedAmount + pcm.byteLength > MAX_SOCKET_BUFFER_BYTES) {
      fail('The voice connection could not keep up with microphone audio. No automatic reconnect was made.');
      return;
    }
    try { socket.send(pcm); }
    catch { fail('Microphone audio could not be sent. Save the available transcript and start again.'); return; }
    expectedInputSample += metadata.sampleCount;
    inputFrames += 1;
    if (inputFrames % 5 === 0) {
      let energy = 0;
      const values = new Int16Array(pcm);
      for (const value of values) { const normalized = value / 32768; energy += normalized * normalized; }
      try { options.onEvent({ type: 'audiolevel', level: muted ? 0 : Math.min(1, Math.sqrt(energy / values.length) * 5) }); }
      catch { fail('The voice audio observer failed.'); }
    }
  }

  function finishReady(event: Extract<VoiceLiveServerEvent, { type: 'ready' }>) {
    if (closed) return;
    active = true;
    if (!observeDiagnostics(() => diagnostics.ready())) return;
    if (connectTimer !== undefined) { clearTimer(connectTimer); connectTimer = undefined; }
    durationTimer = setTimer(() => fail('The 10-minute conversation limit was reached. Save this transcript before starting another session.'), MAX_DURATION_MS);
    try {
      options.onConnected({
        previewId: event.metadata.previewId ?? connectResult?.previewId,
        ...(event.metadata.connectionId ? { connectionId: event.metadata.connectionId } : {}),
        enabledTools: event.metadata.enabledTools,
        behaviorContext: event.metadata.behaviorContext,
      });
    } catch { fail('The voice connection observer failed.'); return; }
    const settle = settleConnect;
    settleConnect = undefined;
    settle?.();
  }

  function receiveReady(event: Extract<VoiceLiveServerEvent, { type: 'ready' }>) {
    if (readyReceived || sessionEpoch || !connectResult ||
        event.metadata.previewId !== undefined && event.metadata.previewId !== connectResult.previewId) throw new Error('Invalid Voice Live ready event.');
    readyReceived = true;
    sessionEpoch = event.sessionEpoch;
    active = true;
    // expiresAt bounds ticket redemption. Server readiness proves the ticket was
    // claimed even when microphone worklet allocation is still pending.
    if (expiryTimer !== undefined) { clearTimer(expiryTimer); expiryTimer = undefined; }
    if (inputMode === 'text') { finishReady(event); return; }
    if (!stream) throw new Error('Microphone unavailable.');
    void beginCapture({ stream, signal: captureAbort.signal, onFrame: sendInputFrame,
      onFailure: () => fail('Microphone audio capture stopped. Save the available transcript and start again.') })
      .then(value => {
        if (closed) { value.close(); return; }
        capture = value;
        if (muted) capture.setMuted(true);
        finishReady(event);
      })
      .catch(() => { if (!closed) fail('Microphone audio capture could not start. Use Listen & type or try again.'); });
  }

  function receiveServerMessage(raw: unknown) {
    if (closed) return;
    try {
      if (typeof raw !== 'string' || raw.length > 200_000) throw new Error('Invalid Voice Live server frame.');
      const event = parseVoiceLiveServerEvent(JSON.parse(raw));
      if (event.type === 'ready') { receiveReady(event); return; }
      if (!sessionEpoch) throw new Error('Voice Live event arrived before readiness.');
      if (event.sessionEpoch !== sessionEpoch) return;
      if (event.type === 'audio') { receiveAudio(event); return; }
      if (event.type === 'interrupted') { interrupt(event.responseId); return; }
      if (event.type === 'ended') { fail(event.message || 'The voice connection ended. Your available transcript is still here to save.'); return; }
      if (event.type === 'error') { fail(event.message); return; }
      if (event.type === 'transcript') {
        if (event.entry.role === 'user') diagnostics.userTurnReceived();
        else if (!observeDiagnostics(() => diagnostics.generatedOutputReceived())) return;
      }
      if (event.type === 'tool') {
        if (event.phase === 'requested') { if (!observeDiagnostics(() => diagnostics.toolRequested())) return; }
        else if (!observeDiagnostics(() => diagnostics.toolResult(event.status))) return;
      }
      options.onEvent(event);
    } catch {
      fail('The voice connection received invalid data. Save the available transcript and start again.');
    }
  }

  async function connectInternal() {
    try {
      diagnostics.start();
      if (!isSecureContext() || typeof TextEncoder === 'undefined') throw new Error('Use voice over HTTPS or localhost.');
      connectTimer = setTimer(() => fail(inputMode === 'text'
        ? 'The connection timed out. Check your connection, then try again.'
        : 'The connection timed out. Check your microphone permission and connection, then try again.'), CONNECT_TIMEOUT_MS);
      audio = createAudioContext();
      await audio.resume();
      if (closed) return;
      if (inputMode === 'microphone') {
        stream = await getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (closed) { for (const track of stream.getTracks()) track.stop(); return; }
        for (const track of stream.getAudioTracks()) track.onended = () => fail('Microphone access ended. Check your microphone and start again.');
      }
      grantRequestSent = true;
      const response = await request('/api/voice/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: fetchAbort.signal,
        body: JSON.stringify({ mode: 'preview', draft: options.draft, agentId: options.agentId, contactId: options.contactId,
          consent: true, inputMode, requestId: grantRequestId }),
      });
      const result = await response.json() as VoiceLiveConnectResult;
      if (closed) return;
      if (!response.ok) throw new Error(result.error || 'Could not establish a Voice Live preview.');
      if (!validGrant(result, wallClock())) throw new Error('The Voice Live preview authorization was invalid or expired.');
      connectResult = result;
      expiryTimer = setTimer(() => fail('The Voice Live preview authorization expired.'), Date.parse(result.expiresAt) - wallClock());
      socket = createSocket(result.url);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        if (closed) return;
        try { sendControl({ type: 'start', ticket: result.ticket, inputMode }); }
        catch { fail('The Voice Live preview could not begin.'); }
      };
      socket.onmessage = message => receiveServerMessage(message.data);
      socket.onerror = () => fail('The Voice Live connection failed. Save the available transcript and try again.');
      socket.onclose = () => fail('The Voice Live connection ended. No automatic reconnect was made.');
    } catch (error) {
      if (closed) return;
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      fail(denied ? 'Microphone access was denied. Allow microphone access, then try again.'
        : error instanceof Error ? error.message : 'Could not start the Voice Live preview.');
    }
  }

  return {
    connect() {
      if (connectPromise) return connectPromise;
      if (closed) return Promise.resolve();
      connectPromise = new Promise<void>(resolve => {
        settleConnect = resolve;
        void connectInternal();
      });
      return connectPromise;
    },
    close() { release(true); },
    setMuted(value) {
      muted = value;
      capture?.setMuted(value);
      if (value && !closed) {
        try { options.onEvent({ type: 'audiolevel', level: 0 }); }
        catch { fail('The voice audio observer failed.'); }
      }
    },
    sendText(text) {
      const clean = text.trim().slice(0, 4_000);
      if (!active || closed || !clean) return false;
      try {
        interrupt();
        sendControl({ type: 'text', text: clean, requestId: randomUUID() });
        diagnostics.userTurnReceived();
        return true;
      } catch { fail('The voice connection could not send that message. Please try again.'); return false; }
    },
    updateBehavior() { return false; },
  };
}
