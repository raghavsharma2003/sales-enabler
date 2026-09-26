// One bounded synthetic Azure Realtime audio check. Run only with an explicitly configured Azure resource.
// Usage: node --env-file=.env.local scripts/azure-voice-smoke.mjs
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const WebSocket = require('next/dist/compiled/ws');

const directory = resolve('.impeccable/review');
const audioPath = resolve(directory, 'azure-voice-smoke.wav');
const reportPath = resolve(directory, 'azure-voice-smoke.json');
const model = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT?.trim() || '';
const key = process.env.AZURE_OPENAI_API_KEY?.trim() || '';
const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim() || '';
const started = Date.now();
const eventCounts = {};
const audioParts = [];
let audioBytes = 0;
let transcript = '';
let completedTranscript = '';
let providerErrorCode = '';
let responseStatus = '';
let handshakeStatus = 0;
let sessionUpdated = false;
let sentPrompt = false;
let finished = false;
let socket;
let timer;

function azureBase(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) return null;
    if (!url.hostname.endsWith('.openai.azure.com')) return null;
    const path = url.pathname.replace(/\/+$/, '');
    if (path && path !== '/openai/v1') return null;
    return `${url.origin}/openai/v1`;
  } catch { return null; }
}

function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24);
  header.writeUInt32LE(48_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function finish(status) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  try { socket?.close(); } catch { /* Already closed. */ }
  await mkdir(directory, { recursive: true });
  const audio = Buffer.concat(audioParts);
  if (audio.length) await writeFile(audioPath, wav(audio));
  const report = {
    provider: 'azure', model, transport: 'websocket', endpointPath: '/openai/v1/realtime',
    status, checkedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
    sessionUpdated, promptSent: sentPrompt, responseStatus, providerErrorCode: providerErrorCode || undefined,
    handshakeStatus: handshakeStatus || undefined, eventCounts,
    syntheticPrompt: 'Namaste. Please give a brief Hinglish greeting and clearly say you are an AI assistant.',
    syntheticTranscript: completedTranscript || transcript,
    audioBytes: audio.length, audioDurationSeconds: Math.round(audio.length / 48_000 * 100) / 100,
    audioFile: audio.length ? '.impeccable/review/azure-voice-smoke.wav' : null,
    verified: status === 'audio_received' ? 'Azure returned audio bytes for one synthetic text prompt over WebSocket.' : 'Azure speech was not verified.',
    limitation: 'This server WebSocket check does not verify browser WebRTC, microphone capture, interruption, or human-rated audio quality.',
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(`Azure smoke: ${status}; model=${model}; audioBytes=${audio.length}; transcriptChars=${report.syntheticTranscript.length}; report=.impeccable/review/azure-voice-smoke.json\n`);
  process.exitCode = status === 'audio_received' ? 0 : 1;
}

if (process.env.VOICE_PROVIDER?.trim().toLowerCase() !== 'azure' || !model || !key || !azureBase(endpoint)) {
  process.stderr.write('Azure smoke: incomplete Azure voice configuration. No provider call made.\n');
  process.exitCode = 1;
} else {
  const url = `${azureBase(endpoint).replace(/^https:/, 'wss:')}/realtime?model=${encodeURIComponent(model)}`;
  socket = new WebSocket(url, { headers: { 'api-key': key }, handshakeTimeout: 10_000, maxPayload: 2_000_000 });
  timer = setTimeout(() => { void finish('timeout'); }, 55_000);
  socket.on('open', () => {
    socket.send(JSON.stringify({ type: 'session.update', session: {
      type: 'realtime', model, output_modalities: ['audio'],
      instructions: 'You are an AI assistant. Answer in one short Hinglish sentence and explicitly disclose that you are AI. No tools or external actions.',
      audio: { output: { voice: 'marin' } }, tools: [],
    } }));
  });
  socket.on('message', raw => {
    let event;
    try { event = JSON.parse(raw.toString()); } catch { return; }
    const type = typeof event.type === 'string' ? event.type : 'unknown';
    eventCounts[type] = (eventCounts[type] || 0) + 1;
    if (type === 'error') {
      providerErrorCode = typeof event.error?.code === 'string' ? event.error.code.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) : 'provider_error';
      void finish('provider_error');
      return;
    }
    if (type === 'session.updated' && !sentPrompt) {
      sessionUpdated = true;
      sentPrompt = true;
      socket.send(JSON.stringify({ type: 'conversation.item.create', item: {
        type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Namaste. Please give a brief Hinglish greeting and clearly say you are an AI assistant.' }],
      } }));
      socket.send(JSON.stringify({ type: 'response.create' }));
    }
    if ((type === 'response.output_audio.delta' || type === 'response.audio.delta') && typeof event.delta === 'string') {
      const bytes = Buffer.from(event.delta, 'base64');
      if (audioBytes + bytes.length > 5_000_000) { void finish('audio_limit'); return; }
      audioParts.push(bytes); audioBytes += bytes.length;
    }
    if ((type === 'response.output_audio_transcript.delta' || type === 'response.audio_transcript.delta') && typeof event.delta === 'string') transcript = (transcript + event.delta).slice(0, 10_000);
    if ((type === 'response.output_audio_transcript.done' || type === 'response.audio_transcript.done') && typeof event.transcript === 'string') completedTranscript = event.transcript.slice(0, 10_000);
    if (type === 'response.done') {
      responseStatus = typeof event.response?.status === 'string' ? event.response.status : '';
      void finish(audioBytes > 0 ? 'audio_received' : 'no_audio');
    }
  });
  socket.on('unexpected-response', (_request, response) => { handshakeStatus = response.statusCode || 0; void finish('handshake_failed'); });
  socket.on('error', () => { void finish('transport_error'); });
  socket.on('close', () => { if (!finished) void finish('closed_early'); });
}
