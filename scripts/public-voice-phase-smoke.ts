// One bounded synthetic phase check for the configured production Azure Realtime deployment.
// Usage: node --env-file=.env.local --import tsx scripts/public-voice-phase-smoke.ts
import { EventEmitter } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import WebSocket from 'ws';
import {
  azureRealtimeConnection,
  firstReplyWithDisclosure,
  publicContinuationInstructions,
  publicGreetingInstructions,
  publicInstructions,
  publicVoiceInstructions,
  realtimeSession,
  safeProviderDiagnostic,
  safeResponseDiagnostic,
  type PublicProviderDiagnostic,
  type PublicResponseDiagnostic,
} from '../lib/public-agent/protocol';
import { compileRelationalRuntime } from '../lib/voice/relational-runtime';
import type { ConversationEntry } from '../lib/voice/emotional';

const TOTAL_TIMEOUT_MS = 120_000;
const HANDSHAKE_TIMEOUT_MS = 10_000;
const EVENT_TIMEOUT_MS = 35_000;
const MAX_AUDIO_BYTES = 7_500_000;
const MAX_TRANSCRIPT_CHARACTERS = 12_000;
const MAX_RECEIPT_BYTES = 8_000_000;
const receiptPath = resolve('data/azure-foundry/voice-phase-live-smoke.json');

const brand = 'Northstar Learning Studio';
const welcome = 'Welcome to Northstar Learning Studio. How can I help today?';
const userTurns = [
  'What time does your office open? Keep it short.',
  'I already had my consultation. Explain just one next step.',
  'Are you a human or AI?',
] as const;

const baseInstructions = publicVoiceInstructions(publicInstructions({
  brand,
  welcome,
  language: 'English',
  style: 'Brief, direct, warm, and factual.',
  objective: 'Answer public questions using only the published facts. Explain one supported next step when asked.',
  role: 'Public information assistant',
  systemPrompt: 'Callback requests require human review. Never claim to have arranged, promised, confirmed, or performed a callback.',
  escalation: 'A callback request may be proposed for human review only; it is never confirmed by this AI assistant.',
  context: [
    'Northstar Learning Studio is a fictional company used only for this synthetic test.',
    'The office is open from 9:00 AM to 5:00 PM, Monday through Friday.',
    'After a visitor has completed a consultation, the next supported step is that a consultant reviews the visitor\'s plan.',
    'Callback requests require human review. The AI assistant cannot arrange, promise, confirm, or perform a callback.',
  ].join('\n'),
}));
const openingInstructions = publicGreetingInstructions(baseInstructions, welcome);
const entries: ConversationEntry[] = [];
const events = new EventEmitter();
events.setMaxListeners(20);

type ResponseReceipt = {
  turn: number;
  kind: 'automatic_opening' | 'visitor_reply';
  syntheticInput?: string;
  syntheticTranscript: string;
  audioBytes: number;
  terminal: PublicResponseDiagnostic;
};

type ActiveResponse = {
  turn: number;
  responseId?: string;
  audioBytes: number;
  transcriptDelta: string;
  finalTranscript: string;
};

class SmokeFailure extends Error {
  constructor(readonly code: string, readonly statusCode = 0) { super(code); }
}

let socket: WebSocket | undefined;
let activeResponse: ActiveResponse | undefined;
let totalAudioBytes = 0;
let sessionUpdateAcks = 0;
let providerDiagnostic: PublicProviderDiagnostic | undefined;
let handshakeStatusCode = 0;
let fatalFailure: SmokeFailure | undefined;
const responseReceipts: ResponseReceipt[] = [];
const eventCounts: Record<string, number> = {};
const runtimeEventCounts: number[] = [];

function safeCode(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(value) ? value : fallback;
}

function fail(code: string, statusCode = 0): SmokeFailure {
  return new SmokeFailure(safeCode(code, 'smoke_failed'), Number.isInteger(statusCode) ? statusCode : 0);
}

function setFatal(error: SmokeFailure) {
  if (fatalFailure) return;
  fatalFailure = error;
  events.emit('fatal', error);
}

function waitForEvent(predicate: (event: Record<string, any>) => boolean, timeoutMs: number, timeoutCode: string) {
  if (fatalFailure) return Promise.reject(fatalFailure);
  return new Promise<Record<string, any>>((resolvePromise, rejectPromise) => {
    const cleanup = () => {
      clearTimeout(timer);
      events.off('event', onEvent);
      events.off('fatal', onFatal);
    };
    const onEvent = (event: Record<string, any>) => {
      if (!predicate(event)) return;
      cleanup(); resolvePromise(event);
    };
    const onFatal = (error: SmokeFailure) => { cleanup(); rejectPromise(error); };
    const timer = setTimeout(() => { cleanup(); rejectPromise(fail(timeoutCode)); }, timeoutMs);
    events.on('event', onEvent);
    events.on('fatal', onFatal);
  });
}

function send(value: unknown) {
  if (!socket || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 250_000) throw fail('transport_unavailable');
  socket.send(JSON.stringify(value));
}

function transcriptFromResponse(response: Record<string, any>): string {
  if (!Array.isArray(response.output)) return '';
  const parts: string[] = [];
  for (const item of response.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (typeof content?.transcript === 'string') parts.push(content.transcript);
      else if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join(' ').trim().slice(0, MAX_TRANSCRIPT_CHARACTERS);
}

function handleProviderEvent(raw: WebSocket.RawData) {
  let event: Record<string, any>;
  try { event = JSON.parse(raw.toString()); }
  catch { setFatal(fail('provider_protocol')); return; }
  if (!event || typeof event.type !== 'string') { setFatal(fail('provider_protocol')); return; }
  const type = event.type;
  eventCounts[type] = (eventCounts[type] || 0) + 1;
  if (type === 'error') {
    providerDiagnostic = safeProviderDiagnostic(event.error);
    setFatal(fail(providerDiagnostic.code === 'unspecified' ? 'provider_error' : providerDiagnostic.code));
    return;
  }
  if (type === 'session.updated') sessionUpdateAcks++;
  if (activeResponse) {
    if (type === 'response.created' && typeof event.response?.id === 'string') activeResponse.responseId = event.response.id;
    const belongs = !activeResponse.responseId || !event.response_id || event.response_id === activeResponse.responseId;
    if (belongs && (type === 'response.output_audio.delta' || type === 'response.audio.delta')) {
      if (typeof event.delta !== 'string' || event.delta.length > 500_000) { setFatal(fail('audio_protocol')); return; }
      const bytes = Buffer.from(event.delta, 'base64').length;
      if (!bytes || bytes % 2 !== 0) { setFatal(fail('audio_protocol')); return; }
      if (totalAudioBytes + bytes > MAX_AUDIO_BYTES) { setFatal(fail('audio_limit')); return; }
      activeResponse.audioBytes += bytes;
      totalAudioBytes += bytes;
    }
    if (belongs && (type === 'response.output_audio_transcript.delta' || type === 'response.audio_transcript.delta')) {
      if (typeof event.delta !== 'string') { setFatal(fail('transcript_protocol')); return; }
      if (activeResponse.transcriptDelta.length + event.delta.length > MAX_TRANSCRIPT_CHARACTERS) { setFatal(fail('transcript_limit')); return; }
      activeResponse.transcriptDelta += event.delta;
    }
    if (belongs && (type === 'response.output_audio_transcript.done' || type === 'response.audio_transcript.done')) {
      if (typeof event.transcript !== 'string' || event.transcript.length > MAX_TRANSCRIPT_CHARACTERS) { setFatal(fail('transcript_limit')); return; }
      activeResponse.finalTranscript = event.transcript.trim();
    }
  }
  events.emit('event', event);
}

async function openSocket(config: ReturnType<typeof azureRealtimeConnection>) {
  socket = new WebSocket(config.url, {
    headers: { 'api-key': config.key },
    handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
    maxPayload: 1_000_000,
    followRedirects: false,
  });
  socket.on('message', handleProviderEvent);
  socket.on('unexpected-response', (_request, response) => {
    handshakeStatusCode = response.statusCode || 0;
    response.resume();
    setFatal(fail('handshake_failed', handshakeStatusCode));
  });
  socket.on('error', () => setFatal(fail('transport_error')));
  socket.on('close', () => {
    if (responseReceipts.length < 4) setFatal(fail('closed_early'));
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const cleanup = () => { clearTimeout(timer); socket?.off('open', onOpen); events.off('fatal', onFatal); };
    const onOpen = () => { cleanup(); resolvePromise(); };
    const onFatal = (error: SmokeFailure) => { cleanup(); rejectPromise(error); };
    const timer = setTimeout(() => { cleanup(); rejectPromise(fail('handshake_timeout')); }, HANDSHAKE_TIMEOUT_MS);
    socket!.once('open', onOpen);
    events.once('fatal', onFatal);
  });
}

async function acknowledgedSessionUpdate(update: unknown) {
  const acknowledged = waitForEvent(event => event.type === 'session.updated', HANDSHAKE_TIMEOUT_MS, 'session_update_timeout');
  send(update);
  await acknowledged;
}

async function createResponse(turn: number, kind: ResponseReceipt['kind'], syntheticInput?: string, instructions?: string) {
  activeResponse = { turn, audioBytes: 0, transcriptDelta: '', finalTranscript: '' };
  const completed = waitForEvent(event => {
    if (event.type !== 'response.done') return false;
    return !activeResponse?.responseId || !event.response?.id || event.response.id === activeResponse.responseId;
  }, EVENT_TIMEOUT_MS, 'response_timeout');
  send({ type: 'response.create', ...(instructions ? { response: { instructions } } : {}) });
  const done = await completed;
  const current = activeResponse;
  activeResponse = undefined;
  if (!current) throw fail('response_state');
  const terminal = safeResponseDiagnostic('response.done', done.response, turn);
  const transcript = (current.finalTranscript || current.transcriptDelta.trim() || transcriptFromResponse(done.response || {})).trim();
  if (!transcript) throw fail('missing_transcript');
  if (!current.audioBytes) throw fail('missing_audio');
  if (terminal.status !== 'completed') throw fail(`response_${terminal.status}`);
  responseReceipts.push({ turn, kind, ...(syntheticInput ? { syntheticInput } : {}), syntheticTranscript: transcript, audioBytes: current.audioBytes, terminal });
  entries.push({ id: `assistant-${turn}`, role: 'assistant', text: transcript });
}

function hasIdentityPreamble(text: string): boolean {
  const opening = text.trimStart().slice(0, 300).split(/[.!?।\n]/u)[0];
  return /^(?:(?:hi|hello|hey|namaste|namaskar)[\s,!:.।—-]*)?(?:i(?:['’]m| am)|this is|you(?:['’]re| are) (?:speaking|talking|chatting) (?:with|to))\b.{0,100}\b(?:AI|artificial intelligence)\b/iu.test(opening);
}

function evaluateChecks() {
  const [opening, hours, nextStep, identity] = responseReceipts.map(item => item.syntheticTranscript);
  const lowerHours = (hours || '').toLowerCase();
  const unsupportedNumericHour = [...lowerHours.matchAll(/\b(1[0-2]|[1-9])(?::00)?\b/g)]
    .some(match => !['5', '9'].includes(match[1]));
  return {
    disclosureFirst: Boolean(opening) && firstReplyWithDisclosure(opening, brand) === opening,
    noReintroductionOrdinaryReplies: Boolean(hours && nextStep) && !hasIdentityPreamble(hours) && !hasIdentityPreamble(nextStep),
    truthfulIdentityQuestion: Boolean(identity) && /\b(?:AI|artificial intelligence)\b/iu.test(identity) && !/\bi(?:['’]m| am) (?:a )?(?:human|person)\b/iu.test(identity),
    groundedHours: Boolean(hours) && /\b(?:open|opens|opening|office hours)\b/iu.test(hours) && /\b(?:9(?::00)?|nine)\b/iu.test(hours) && !unsupportedNumericHour,
    groundedCompletedConsultationNextStep: Boolean(nextStep) && /\bconsultant\b/iu.test(nextStep) && /\breview(?:s|ing|ed)?\b/iu.test(nextStep) && /\bplan\b/iu.test(nextStep) && !/\b(?:book|schedule|repeat|redo)\b.{0,40}\bconsultation\b/iu.test(nextStep),
    allResponsesCompletedWithAudio: responseReceipts.length === 4 && responseReceipts.every(item => item.audioBytes > 0 && item.terminal.status === 'completed'),
    sessionUpdatesAcknowledged: sessionUpdateAcks === 4,
    runtimeAppliedEveryUserTurn: runtimeEventCounts.length === userTurns.length,
  };
}

async function writeReceipt(input: { checkedAt: string; elapsedMs: number; checks: Record<string, boolean>; passed: boolean; failureCode?: string; failureStatusCode?: number }) {
  const receipt = {
    schemaVersion: 1,
    checkedAt: input.checkedAt,
    provider: 'azure',
    transport: 'server_websocket',
    synthetic: true,
    responseCount: responseReceipts.length,
    sessionUpdateAcks,
    runtimeAppliedTurns: runtimeEventCounts.length,
    runtimeEventCounts,
    totalAudioBytes,
    audioFormat: { type: 'audio/pcm', rate: 24000 },
    maxOutputTokens: 2048,
    toolCount: 0,
    handshakeStatusCode: handshakeStatusCode || undefined,
    providerDiagnostic,
    eventCounts,
    responses: responseReceipts,
    checks: input.checks,
    passed: input.passed,
    failureCode: input.failureCode,
    failureStatusCode: input.failureStatusCode || undefined,
    elapsedMs: input.elapsedMs,
    limitations: [
      'This verifies server-native generated audio bytes and final transcripts over one Azure Realtime WebSocket conversation.',
      'It does not verify browser playback, microphone capture, acoustic interruption, a physical device, perceptual audio quality, or competitor quality.',
    ],
  };
  const body = `${JSON.stringify(receipt, null, 2)}\n`;
  if (Buffer.byteLength(body) > MAX_RECEIPT_BYTES) throw fail('receipt_limit');
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, body, 'utf8');
}

async function main() {
  const started = Date.now();
  const checkedAt = new Date().toISOString();
  const totalTimer = setTimeout(() => setFatal(fail('total_timeout')), TOTAL_TIMEOUT_MS);
  try {
    if (process.env.VOICE_PROVIDER?.trim().toLowerCase() !== 'azure') throw fail('azure_not_selected');
    const config = azureRealtimeConnection();
    await openSocket(config);
    await acknowledgedSessionUpdate(realtimeSession(config.model, config.voice, baseInstructions));
    await createResponse(1, 'automatic_opening', undefined, openingInstructions);

    for (let index = 0; index < userTurns.length; index++) {
      const text = userTurns[index];
      const turn = index + 2;
      entries.push({ id: `user-${turn}`, role: 'user', text });
      const runtime = compileRelationalRuntime({
        entries,
        settings: { primaryLanguage: 'English', allowedLanguages: ['English', 'Hindi'], responseStyle: 'Brief' },
        callId: 'synthetic-public-voice-phase',
      });
      runtimeEventCounts.push(runtime.events.length);
      const instructions = publicContinuationInstructions(`${baseInstructions}\n${runtime.instructions}`);
      await acknowledgedSessionUpdate({ type: 'session.update', session: { type: 'realtime', instructions } });
      send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
      await createResponse(turn, 'visitor_reply', text);
    }

    const checks = evaluateChecks();
    const passed = Object.values(checks).every(Boolean);
    await writeReceipt({ checkedAt, elapsedMs: Date.now() - started, checks, passed });
    process.stdout.write(`status=${passed ? 'pass' : 'check_failed'} responses=${responseReceipts.length} sessionUpdateAcks=${sessionUpdateAcks} runtimeAppliedTurns=${runtimeEventCounts.length} audioBytes=${totalAudioBytes} disclosureFirst=${checks.disclosureFirst} noReintroductionOrdinaryReplies=${checks.noReintroductionOrdinaryReplies} truthfulIdentityQuestion=${checks.truthfulIdentityQuestion} groundedHours=${checks.groundedHours} groundedCompletedConsultationNextStep=${checks.groundedCompletedConsultationNextStep} completedWithAudio=${checks.allResponsesCompletedWithAudio}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const failure = error instanceof SmokeFailure ? error : fail('local_failure');
    const checks = responseReceipts.length === 4 ? evaluateChecks() : {};
    try { await writeReceipt({ checkedAt, elapsedMs: Date.now() - started, checks, passed: false, failureCode: failure.code, failureStatusCode: failure.statusCode }); }
    catch { /* The bounded stdout result still reports the local receipt failure. */ }
    process.stdout.write(`status=failed code=${safeCode(failure.code, 'smoke_failed')} statusCode=${failure.statusCode} responses=${responseReceipts.length} sessionUpdateAcks=${sessionUpdateAcks} runtimeAppliedTurns=${runtimeEventCounts.length} audioBytes=${totalAudioBytes}\n`);
    process.exitCode = 1;
  } finally {
    clearTimeout(totalTimer);
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.terminate();
  }
}

void main();
