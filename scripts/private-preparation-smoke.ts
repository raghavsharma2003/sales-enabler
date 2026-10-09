// One explicitly authorized Azure WebSocket ordering probe, never a WebRTC or
// acoustic benchmark. No retries, tools, fixture generation, or transcript logs.
// Offline: node --import tsx scripts/private-preparation-smoke.ts --offline-check
// Live: node --env-file=.env.local --import tsx scripts/private-preparation-smoke.ts --run
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { createPrivateTurnScheduler } from '../lib/voice/private-turn-scheduler';
import { createVoiceDiagnostics } from '../lib/voice/diagnostics';
import { normalizeAzureRealtimeEndpoint } from '../lib/voice/config';
import { buildProviderInstructions } from '../lib/voice/server';

const MAX_RUN_MS = 15_000;
const FRAME_MS = 100, FRAME_BYTES = 4_800;
const FIXTURE_SHA256 = '9683ce2d8bb5304b178e38fc9bf4915b1fbc96bde20b030ffe4c21a2df39cb75';
const fixturePath = resolve('.impeccable/review/azure-voice-smoke.wav');
const reportPath = resolve('.impeccable/review/private-preparation-smoke.json');
const trackedEvents = new Set([
  'session.created', 'session.updated', 'input_audio_buffer.speech_started', 'input_audio_buffer.speech_stopped',
  'input_audio_buffer.committed', 'conversation.item.input_audio_transcription.delta',
  'conversation.item.input_audio_transcription.completed', 'conversation.item.input_audio_transcription.failed',
  'response.created', 'response.output_audio.delta', 'response.output_audio_transcript.delta',
  'response.output_audio_transcript.done', 'response.done', 'error',
]);

function fixture() {
  const bytes = readFileSync(fixturePath);
  const provenance = JSON.parse(readFileSync(resolve('.impeccable/review/azure-voice-smoke.json'), 'utf8'));
  if (createHash('sha256').update(bytes).digest('hex') !== FIXTURE_SHA256 || provenance.status !== 'audio_received' ||
      typeof provenance.syntheticPrompt !== 'string' || !provenance.syntheticPrompt) throw new Error('fixture_provenance');
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
      bytes.readUInt32LE(16) !== 16 || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 ||
      bytes.readUInt32LE(24) !== 24_000 || bytes.readUInt16LE(34) !== 16 ||
      bytes.toString('ascii', 36, 40) !== 'data' || bytes.readUInt32LE(40) !== bytes.length - 44) throw new Error('fixture_format');
  const pcm = bytes.subarray(44);
  if (!pcm.length || pcm.length % 2 || pcm.length > 48_000 * 6) throw new Error('fixture_bounds');
  return pcm;
}

async function run() {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !['--offline-check', '--run'].includes(mode)) throw new Error('explicit_mode_required');
  const pcm = fixture();
  if (mode === '--offline-check') {
    process.stdout.write(JSON.stringify({ status: 'offline_ready', syntheticFixtureVerified: true, pcmDurationMs: pcm.length / 48, frameMs: FRAME_MS, maxRunMs: MAX_RUN_MS }) + '\n');
    return;
  }
  const endpoint = normalizeAzureRealtimeEndpoint(process.env.AZURE_OPENAI_ENDPOINT);
  const deployment = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT?.trim();
  const key = process.env.AZURE_OPENAI_API_KEY?.trim();
  if (process.env.VOICE_PROVIDER?.trim().toLowerCase() !== 'azure' || !endpoint || !deployment || !key) throw new Error('azure_configuration');
  // This receipt doubles as a no-retry guard. A subsequent authorized run must
  // deliberately archive it first, never silently overwrite a failed attempt.
  if (existsSync(reportPath)) throw new Error('attempt_already_recorded');
  mkdirSync(resolve('.impeccable/review'), { recursive: true });
  writeFileSync(reportPath, JSON.stringify({ status: 'started', attemptCount: 1 }) + '\n', { flag: 'wx', mode: 0o600 });

  const startedAt = performance.now();
  const diagnostics = createVoiceDiagnostics(undefined, () => performance.now());
  diagnostics.start();
  const baseline = buildProviderInstructions('This is a synthetic transport verification. Give only one short sentence clearly identifying yourself as an AI assistant. No external actions.');
  const guidance = 'Give one brief AI-disclosed sentence. No tools or external actions.';
  const eventCounts: Record<string, number> = {};
  const firstEventsAtMs: Record<string, number> = {};
  let finished = false, configured = false, responseRequests = 0, candidateUpdates = 0;
  let publishedFinalTurns = 0, capturedFinalTurns = 0, inputFrames = 0, inputBytes = 0, outputAudioBytes = 0;
  let responseStatus: string | undefined;
  let candidateInstructions: string | undefined;
  let pacer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let socket: WebSocket | undefined;
  const atMs = () => Math.max(0, Math.round(performance.now() - startedAt));
  let resolveDone: () => void = () => {};
  const done = new Promise<void>(resolvePromise => { resolveDone = resolvePromise; });

  function finish(status: string) {
    if (finished) return;
    finished = true; clearTimeout(pacer); clearTimeout(deadline);
    turns.close(); diagnostics.end(); socket?.terminate();
    const snapshot = diagnostics.snapshot();
    const report = {
      version: 1, checkedAt: new Date().toISOString(), attemptCount: 1, status,
      provider: 'azure', transport: 'websocket', maxRunMs: MAX_RUN_MS, elapsedMs: atMs(),
      fixture: { provenance: 'existing-synthetic-azure-output', sha256: FIXTURE_SHA256, pcmDurationMs: pcm.length / 48, sampleRate: 24_000, channels: 1, bitsPerSample: 16, frameMs: FRAME_MS },
      sessionPolicy: { vad: 'semantic_vad', eagerness: 'low', createResponse: false, interruptResponse: true, tools: 0, stableGuidance: true },
      configured, responseRequests, candidateUpdates, publishedFinalTurns, capturedFinalTurns,
      inputFrames, inputBytes, outputAudioBytes, responseStatus, eventCounts, firstEventsAtMs,
      diagnostics: snapshot,
      legacyTurnSampleBasis: 'This probe calls the legacy turn recorder on audio deltas only; privatePreparation first-output stages include transcript events, as in the browser scheduler.',
      candidateAckBeforeSpeechStop: firstEventsAtMs.candidate_ack !== undefined && firstEventsAtMs['input_audio_buffer.speech_stopped'] !== undefined
        ? firstEventsAtMs.candidate_ack < firstEventsAtMs['input_audio_buffer.speech_stopped'] : undefined,
      verified: status === 'completed' ? 'One paced synthetic WebSocket turn exercised the private scheduler final-ASR and exact-ACK response gate.' : 'The single attempt did not complete the intended wire-ordering proof.',
      limitation: 'No WebRTC playback/truncation, real microphone, barge-in, tools, transcript accuracy, acoustic latency, subjective quality, full duplex, or production-readiness claim.',
    };
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    process.stdout.write(JSON.stringify({ status, responseRequests, publishedFinalTurns, outputAudioBytes, preAckHits: snapshot.privatePreparation?.preAckHits, elapsedMs: report.elapsedMs, report: '.impeccable/review/private-preparation-smoke.json' }) + '\n');
    process.exitCode = status === 'completed' ? 0 : 1;
    resolveDone();
  }
  function send(event: object) {
    if (finished) return;
    if (socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 100_000) { finish('transport_unavailable'); return; }
    const type = (event as { type?: string }).type;
    if (type === 'response.create') {
      if (responseRequests >= 1 || !publishedFinalTurns) { finish('response_bound_violation'); return; }
      responseRequests++; firstEventsAtMs.response_request = atMs();
    }
    if (type === 'session.update') { candidateUpdates++; candidateInstructions = (event as { session?: { instructions?: string } }).session?.instructions; }
    // WebRTC-specific cancellation/history operations are intentionally outside
    // this probe. Do not translate them or imply that a WebSocket verifies them.
    if (type === 'response.cancel' || type === 'output_audio_buffer.clear') { finish('outside_probe_scope'); return; }
    socket.send(JSON.stringify(event));
  }
  const turns = createPrivateTurnScheduler({
    instructions: () => baseline, send, now: () => performance.now(),
    onDiagnostic: event => diagnostics.privatePreparationEvent(event),
    onUserTurn: () => { publishedFinalTurns++; diagnostics.userTurnReceived(); turns.updateBehavior(guidance); },
    onCapturedTurn: () => { capturedFinalTurns++; },
    fail: () => finish('scheduler_failed'),
  });
  turns.updateBehavior(guidance);

  function streamInput() {
    let offset = 0, silenceFrames = 0;
    const next = () => {
      if (finished || responseRequests) return;
      let frame: Buffer;
      if (offset < pcm.length) { frame = pcm.subarray(offset, offset + FRAME_BYTES); offset += frame.length; }
      else if (silenceFrames++ < 40) frame = Buffer.alloc(FRAME_BYTES);
      else return;
      send({ type: 'input_audio_buffer.append', audio: frame.toString('base64') });
      if (finished) return;
      inputFrames++; inputBytes += frame.length;
      pacer = setTimeout(next, FRAME_MS);
    };
    next();
  }

  deadline = setTimeout(() => finish('deadline'), MAX_RUN_MS);
  socket = new WebSocket(`${endpoint.replace(/^https:/, 'wss:')}/realtime?model=${encodeURIComponent(deployment)}`, { headers: { 'api-key': key }, handshakeTimeout: 5_000, maxPayload: 2_000_000, perMessageDeflate: false });
  socket.on('open', () => {
    // Mirrors lib/voice/server.ts private GA policy. PCM format is explicit
    // because WebSocket uploads do not negotiate a WebRTC media codec.
    socket!.send(JSON.stringify({ type: 'session.update', session: {
      type: 'realtime', model: deployment, instructions: baseline, output_modalities: ['audio'], tools: [],
      audio: { input: { format: { type: 'audio/pcm', rate: 24_000 }, transcription: { model: 'gpt-4o-mini-transcribe' },
        turn_detection: { type: 'semantic_vad', eagerness: 'low', create_response: false, interrupt_response: true } },
      output: { voice: process.env.AZURE_OPENAI_REALTIME_VOICE || 'marin' } },
    } }));
  });
  socket.on('message', raw => {
    if (finished) return;
    try {
      const event = JSON.parse(raw.toString());
      if (!event || typeof event !== 'object' || Array.isArray(event)) return;
      if (trackedEvents.has(event.type)) { eventCounts[event.type] = (eventCounts[event.type] || 0) + 1; firstEventsAtMs[event.type] ??= atMs(); }
      if (event.type === 'error' || event.type === 'conversation.item.input_audio_transcription.failed') { finish('provider_error'); return; }
      if (!configured && event.type === 'session.updated') {
        const vad = event.session?.audio?.input?.turn_detection;
        if (event.session?.instructions !== baseline || vad?.type !== 'semantic_vad' || vad?.create_response !== false || vad?.interrupt_response !== true) { finish('configuration_not_confirmed'); return; }
        configured = true; diagnostics.ready(); streamInput(); return;
      }
      if (!configured) return;
      if (event.type === 'session.updated' && candidateInstructions && event.session?.instructions === candidateInstructions) firstEventsAtMs.candidate_ack ??= atMs();
      if (turns.receive(event)) return;
      if (event.type === 'response.created') turns.responseCreated(event.response?.id);
      if (event.type === 'response.output_audio.delta' && typeof event.delta === 'string') { outputAudioBytes += Buffer.byteLength(event.delta, 'base64'); diagnostics.generatedOutputReceived(); }
      if (event.type === 'response.function_call_arguments.done') { finish('unexpected_tool'); return; }
      if (event.type === 'response.done') {
        responseStatus = ['completed', 'cancelled', 'failed', 'incomplete'].includes(event.response?.status) ? event.response.status : 'unknown';
        turns.responseDone(event.response?.id, false, event.response?.status);
        finish(responseStatus === 'completed' && responseRequests === 1 && publishedFinalTurns > 0 && outputAudioBytes > 0 ? 'completed' : 'response_not_completed');
      }
    } catch { finish('event_processing_failed'); }
  });
  socket.on('unexpected-response', () => finish('handshake_rejected'));
  socket.on('error', () => finish('transport_error'));
  socket.on('close', () => { if (!finished) finish('closed_early'); });
  await done;
}

void run().catch(() => { process.stderr.write('Private preparation probe stopped before completion; no raw provider details logged.\n'); process.exitCode = 1; });
