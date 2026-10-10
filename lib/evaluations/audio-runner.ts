import { createHash } from 'node:crypto';
import WebSocket from 'ws';
import { HttpError } from '../server/http';
import { normalizeAzureRealtimeEndpoint } from '../voice/config';
import { configureAzureSpeechNodeTransport } from '../voice/continuous-speech-provider';
import { compileRelationalRuntime, RELATIONAL_SOURCE_REVISION, type RelationalSettings } from '../voice/relational-runtime';
import type { AudioProofFailureCode, AudioProofTraceEvent } from './audio-schema';

const sha = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const MAX_FIXTURE_BYTES = 1_000_000;
const MAX_OUTPUT_PCM_BYTES = 3_000_000;
const FRAME_BYTES = 4_800;

export type ParsedWave = { pcm: Buffer; durationMs: number; sampleRate: 24000; channels: 1 };

/** The proof protocol accepts exactly the provider's configured 24 kHz mono PCM envelope. */
export function parseProofWave(wave: Buffer, maximumBytes = MAX_OUTPUT_PCM_BYTES): ParsedWave {
  if (wave.length < 44 || wave.length > maximumBytes || wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 8, 12) !== 'WAVE')
    throw new HttpError(400, 'Audio proof requires a bounded WAV artifact.');
  let offset = 12, format: Buffer | undefined, pcm: Buffer | undefined;
  while (offset + 8 <= wave.length) {
    const kind = wave.toString('ascii', offset, offset + 4), size = wave.readUInt32LE(offset + 4), start = offset + 8, end = start + size;
    if (end > wave.length) throw new HttpError(400, 'Audio proof WAV chunks are invalid.');
    if (kind === 'fmt ') format = wave.subarray(start, end);
    if (kind === 'data') pcm = wave.subarray(start, end);
    offset = end + (size % 2);
  }
  if (!format || format.length < 16 || !pcm?.length || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 1 || format.readUInt32LE(4) !== 24_000 || format.readUInt16LE(14) !== 16 || pcm.length % 2)
    throw new HttpError(400, 'Audio proof requires 24 kHz mono 16-bit PCM WAV.');
  const durationMs = Math.round(pcm.length / 48);
  if (durationMs < 250 || durationMs > 15_000) throw new HttpError(400, 'Synthetic caller audio must be between 0.25 and 15 seconds.');
  return { pcm: Buffer.from(pcm), durationMs, sampleRate: 24000, channels: 1 };
}

export function pcm24ToWave(pcm: Buffer): Buffer {
  if (!pcm.length || pcm.length > MAX_OUTPUT_PCM_BYTES || pcm.length % 2) throw new HttpError(502, 'Azure returned invalid proof audio.');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24); header.writeUInt32LE(48_000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export type SyntheticCallerResult = { wave: Buffer; voice: string; durationMs: number };
export type SyntheticCallerInput = { text: string; voice: string; key: string; region: string };
export class SyntheticCallerFailure extends Error {
  constructor(message: string, readonly closureConfirmed: boolean) { super(message); this.name = 'SyntheticCallerFailure'; }
}

/** One Azure Speech SDK synthesis. Callers own admission and durable idempotency. */
export async function synthesizeSyntheticCaller(input: SyntheticCallerInput): Promise<SyntheticCallerResult> {
  if (!input.text.trim() || input.text.length > 400 || !/^[A-Za-z0-9._-]{2,100}$/.test(input.voice) || !/^[a-z][a-z0-9-]{1,40}$/.test(input.region) || !input.key)
    throw new HttpError(503, 'Synthetic caller generation is not configured.');
  const sdk = await import('microsoft-cognitiveservices-speech-sdk');
  // SDK 1.52 on Node 24 otherwise selects the global WebSocket, whose close
  // cannot be synchronously terminated. Reuse the proven sidecar transport guard.
  await configureAzureSpeechNodeTransport();
  const config = sdk.SpeechConfig.fromSubscription(input.key, input.region);
  config.speechSynthesisVoiceName = input.voice;
  config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
  const synthesizer = new sdk.SpeechSynthesizer(config);
  const close = () => new Promise<boolean>(resolve => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(false); } }, 4_500);
    try {
      synthesizer.close(() => { if (!settled) { settled = true; clearTimeout(timer); resolve(true); } }, () => { if (!settled) { settled = true; clearTimeout(timer); resolve(false); } });
    } catch { clearTimeout(timer); resolve(false); }
  });
  let result: import('microsoft-cognitiveservices-speech-sdk').SpeechSynthesisResult;
  try {
    result = await new Promise<import('microsoft-cognitiveservices-speech-sdk').SpeechSynthesisResult>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('synthesis_deadline')), 15_000);
      synthesizer.speakTextAsync(input.text, value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
  } catch {
    const closureConfirmed = await close();
    throw new SyntheticCallerFailure('Azure Speech did not confirm the synthetic caller artifact.', closureConfirmed);
  }
  const closureConfirmed = await close();
  if (!closureConfirmed) throw new SyntheticCallerFailure('Azure Speech cleanup was not confirmed.', false);
  if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted || !result.audioData?.byteLength)
    throw new SyntheticCallerFailure('Azure Speech did not complete the synthetic caller artifact.', true);
  const wave = Buffer.from(result.audioData);
  if (wave.length > MAX_FIXTURE_BYTES) throw new SyntheticCallerFailure('Synthetic caller audio exceeded the artifact limit.', true);
  try { return { wave, voice: input.voice, durationMs: parseProofWave(wave, MAX_FIXTURE_BYTES).durationMs }; }
  catch { throw new SyntheticCallerFailure('Azure Speech returned an invalid synthetic caller artifact.', true); }
}

export type RealtimeProofInput = {
  wave: Buffer;
  session: Record<string, unknown>;
  settings: RelationalSettings;
  expectedCallerText: string;
  endpoint: string;
  apiKey: string;
  model: string;
  deadlineMs?: number;
};

export type RealtimeProofResult = {
  status: 'complete' | 'failed' | 'uncertain';
  /** The runner resolves only after the one owned socket emits close. */
  providerClosed: boolean;
  failureCode?: AudioProofFailureCode;
  recognizedCallerText: string;
  assistantText: string;
  outputWave?: Buffer;
  outputDurationMs?: number;
  runtimePolicyDigest?: string;
  trace: AudioProofTraceEvent[];
  measurements: {
    inputAudioDurationMs: number;
    outputAudioDurationMs: number;
    inputFinishedToTranscriptFinalMs?: number;
    responseRequestedToFirstServerAudioMs?: number;
    responseRequestedToDoneMs?: number;
  };
};

type SocketLike = Pick<WebSocket, 'on' | 'send' | 'close' | 'terminate'>;
export type RealtimeProofDependencies = {
  socket?: (url: string, options: WebSocket.ClientOptions) => SocketLike;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
};

/** One socket, one exact synthetic fixture, no tools, no retries. */
export async function runAzureRealtimeAudioProof(input: RealtimeProofInput, dependencies: RealtimeProofDependencies = {}): Promise<RealtimeProofResult> {
  const base = normalizeAzureRealtimeEndpoint(input.endpoint);
  if (!base || !input.apiKey || !/^[A-Za-z0-9._-]{2,120}$/.test(input.model)) throw new HttpError(503, 'Azure Realtime audio proof is not configured.');
  const parsed = parseProofWave(input.wave, MAX_FIXTURE_BYTES), now = dependencies.now || (() => Date.now()), startedAt = now();
  const trace: AudioProofTraceEvent[] = [];
  const mark = (kind: AudioProofTraceEvent['kind']) => trace.push({ sequence: trace.length + 1, kind, atMs: Math.max(0, Math.floor(now() - startedAt)) });
  const wait = dependencies.wait || (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const socketFactory = dependencies.socket || ((url, options) => new WebSocket(url, options));
  const url = `${base.replace(/^https:/, 'wss:')}/realtime?model=${encodeURIComponent(input.model)}`;
  const socket = socketFactory(url, { headers: { 'api-key': input.apiKey }, handshakeTimeout: 10_000, maxPayload: 2_000_000, perMessageDeflate: false });
  let recognizedCallerText = '', assistantText = '', runtimePolicyDigest: string | undefined;
  const audio: Buffer[] = []; let outputBytes = 0, initialSessionAck = false, behaviorAwaitingAck = false, responseRequested = false, responseDone = false, responseCompleted = false;
  let status: RealtimeProofResult['status'] = 'uncertain', failureCode: AudioProofFailureCode | undefined = 'transport_uncertain';

  const result = await new Promise<RealtimeProofResult>(resolve => {
    let settled = false, closing = false, socketClosed = false, shutdownFallback: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => stop('uncertain', 'deadline_exceeded', false), Math.min(45_000, Math.max(1_000, input.deadlineMs || 45_000)));
    const finish = (providerClosed: boolean) => {
      if (settled) return; settled = true; closing = true; clearTimeout(deadline); if (shutdownFallback) clearTimeout(shutdownFallback);
      const outputPcm = Buffer.concat(audio), outputDurationMs = Math.round(outputPcm.length / 48);
      const at = (kind: AudioProofTraceEvent['kind']) => trace.find(item => item.kind === kind)?.atMs;
      const interval = (from: AudioProofTraceEvent['kind'], to: AudioProofTraceEvent['kind']) => {
        const a = at(from), b = at(to); return a === undefined || b === undefined || b < a ? undefined : b - a;
      };
      resolve({ status, providerClosed, ...(failureCode ? { failureCode } : {}), recognizedCallerText, assistantText,
        ...(outputPcm.length ? { outputWave: pcm24ToWave(outputPcm), outputDurationMs, runtimePolicyDigest } : {}), trace,
        measurements: { inputAudioDurationMs: parsed.durationMs, outputAudioDurationMs: outputDurationMs,
          ...(interval('input_audio_finished', 'transcript_final') !== undefined ? { inputFinishedToTranscriptFinalMs: interval('input_audio_finished', 'transcript_final') } : {}),
          ...(interval('response_requested', 'first_server_audio') !== undefined ? { responseRequestedToFirstServerAudioMs: interval('response_requested', 'first_server_audio') } : {}),
          ...(interval('response_requested', 'response_done') !== undefined ? { responseRequestedToDoneMs: interval('response_requested', 'response_done') } : {}) } });
    };
    function stop(nextStatus: RealtimeProofResult['status'], code: AudioProofFailureCode | undefined, graceful: boolean) {
      if (settled || socketClosed || closing) return;
      status = nextStatus; failureCode = code; closing = true;
      // A broken test double or runtime must not leave this operation pending.
      // Without an observed close, providerClosed=false retains admission capacity.
      shutdownFallback = setTimeout(() => finish(false), 1_000);
      try { if (graceful) socket.close(1000); else socket.terminate(); }
      catch { try { socket.terminate(); } catch { /* fallback preserves uncertainty */ } }
    }
    const send = (event: unknown): boolean => {
      if (settled || closing || socketClosed) return false;
      try {
        socket.send(JSON.stringify(event), error => { if (error && !settled && !closing && !socketClosed) stop('uncertain', 'transport_uncertain', false); });
        return true;
      } catch { stop('uncertain', 'transport_uncertain', false); return false; }
    };
    socket.on('open', () => { if (settled || closing || socketClosed) return; mark('socket_open'); send({ type: 'session.update', session: input.session }); });
    socket.on('error', () => { if (!settled && !closing && !socketClosed) stop('uncertain', 'transport_uncertain', false); });
    socket.on('close', () => {
      if (socketClosed) return;
      socketClosed = true; closing = true;
      mark('socket_closed');
      if (responseDone && responseCompleted && outputBytes > 0 && assistantText.trim()) { status = 'complete'; failureCode = undefined; }
      else if (failureCode === 'provider_rejected' || failureCode === 'provider_protocol' || failureCode === 'audio_unavailable') status = 'failed';
      finish(true);
    });
    const handleMessage = async (raw: WebSocket.RawData, binary: boolean) => {
      if (settled || closing || socketClosed) return;
      if (binary || raw.toString().length > 2_000_000) { stop('failed', 'provider_protocol', true); return; }
      let event: Record<string, unknown>;
      try { event = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { stop('failed', 'provider_protocol', true); return; }
      const type = typeof event.type === 'string' ? event.type : '';
      if (type === 'error') { stop('failed', 'provider_rejected', true); return; }
      if (type === 'session.updated') {
        if (behaviorAwaitingAck) {
          behaviorAwaitingAck = false; mark('behavior_acknowledged'); mark('response_requested'); responseRequested = true; if (!send({ type: 'response.create' })) return; return;
        }
        if (initialSessionAck) return;
        initialSessionAck = true; mark('session_configured');
        const withSilence = Buffer.concat([parsed.pcm, Buffer.alloc(FRAME_BYTES * 10)]);
        for (let offset = 0; offset < withSilence.length; offset += FRAME_BYTES) {
          if (settled || closing || socketClosed) return;
          const frame = withSilence.subarray(offset, Math.min(offset + FRAME_BYTES, withSilence.length));
          if (!offset) mark('input_first_audio_sent');
          if (!send({ type: 'input_audio_buffer.append', audio: frame.toString('base64') })) return;
          await wait(100);
          if (settled || closing || socketClosed) return;
        }
        mark('input_audio_finished'); return;
      }
      if (type === 'input_audio_buffer.speech_started') mark('provider_speech_started');
      if (type === 'input_audio_buffer.speech_stopped') mark('provider_speech_stopped');
      if (type === 'input_audio_buffer.committed') mark('input_committed');
      if (type === 'conversation.item.input_audio_transcription.completed') {
        if (typeof event.transcript !== 'string' || !event.transcript.trim() || event.transcript.length > 4000 || responseRequested) { stop('failed', 'provider_protocol', true); return; }
        recognizedCallerText = event.transcript.trim(); mark('transcript_final');
        const runtime = compileRelationalRuntime({ entries: [{ id: 'audio-proof-caller', role: 'user', text: recognizedCallerText }], settings: input.settings, callId: 'audio-proof' });
        runtimePolicyDigest = sha([RELATIONAL_SOURCE_REVISION, runtime.instructions]); mark('behavior_compiled');
        const initialInstructions = typeof input.session.instructions === 'string' ? input.session.instructions : '';
        const instructions = `${initialInstructions}\n<live_behavior_update>\n${runtime.instructions}\n</live_behavior_update>\n<audio_proof_boundary>\nThis is an evaluation-only synthetic scenario. No tools, memory writes, business actions, promises, or external side effects are available. Answer the fictional caller once.\n</audio_proof_boundary>`;
        behaviorAwaitingAck = true; if (!send({ type: 'session.update', session: { instructions } })) return; return;
      }
      if (type === 'response.created') mark('response_created');
      if ((type === 'response.output_audio.delta' || type === 'response.audio.delta') && typeof event.delta === 'string') {
        const part = Buffer.from(event.delta, 'base64');
        if (!part.length || part.length % 2 || outputBytes + part.length > MAX_OUTPUT_PCM_BYTES) { stop('failed', 'provider_protocol', true); return; }
        if (!outputBytes) mark('first_server_audio'); outputBytes += part.length; audio.push(part); return;
      }
      if ((type === 'response.output_audio_transcript.done' || type === 'response.audio_transcript.done') && typeof event.transcript === 'string') assistantText = event.transcript.slice(0, 10_000).trim();
      if (type === 'response.done') {
        responseDone = true; responseCompleted = (event.response as { status?: unknown } | undefined)?.status === 'completed'; mark('response_done');
        if (!responseCompleted) { status = 'failed'; failureCode = 'provider_rejected'; }
        else if (!outputBytes || !assistantText) { status = 'failed'; failureCode = 'audio_unavailable'; }
        stop(status, failureCode, true);
      }
    };
    socket.on('message', (raw: WebSocket.RawData, binary: boolean) => { void handleMessage(raw, binary).catch(() => stop('uncertain', 'transport_uncertain', false)); });
  });
  return result;
}
