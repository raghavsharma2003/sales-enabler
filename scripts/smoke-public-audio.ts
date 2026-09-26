import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import WebSocket from 'ws';
import { MAX_AUDIO_FRAME_BYTES, parseClientEvent } from '../lib/public-agent/protocol';

const ORIGIN = 'http://localhost:3000';
const API_BASE = 'http://localhost:3000';
const MAX_RUNTIME_MS = 45_000;
const FRAME_BYTES = 4_800; // 100 ms of 24 kHz mono signed 16-bit PCM.
const SILENCE_FRAMES = 10;
const fixtureDirectory = resolve(process.cwd(), 'data', 'qa-v7');
const fixturePath = resolve(fixtureDirectory, 'fictional-public-question-v2.wav');
const provenancePath = resolve(fixtureDirectory, 'fictional-public-question-v2.provenance.json');
const spokenQuestion = 'What are your public office hours, and when may I visit?';

class SmokeFailure extends Error {
  constructor(readonly code: string) { super(code); }
}

type Pcm = { bytes: Buffer; sourceRate: number; sourceChannels: number; durationMs: number };

function waveTo24kMono16(wave: Buffer): Pcm {
  if (wave.length < 44 || wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 8, 12) !== 'WAVE') throw new SmokeFailure('fixture_invalid_wave');
  let offset = 12, format: Buffer | undefined, data: Buffer | undefined;
  while (offset + 8 <= wave.length) {
    const id = wave.toString('ascii', offset, offset + 4), size = wave.readUInt32LE(offset + 4), start = offset + 8, end = start + size;
    if (end > wave.length) throw new SmokeFailure('fixture_invalid_chunk');
    if (id === 'fmt ') format = wave.subarray(start, end);
    if (id === 'data') data = wave.subarray(start, end);
    offset = end + (size % 2);
  }
  if (!format || format.length < 16 || !data?.length) throw new SmokeFailure('fixture_missing_audio');
  const encoding = format.readUInt16LE(0), channels = format.readUInt16LE(2), rate = format.readUInt32LE(4), bits = format.readUInt16LE(14);
  if (![1, 3].includes(encoding) || channels < 1 || channels > 8 || rate < 8_000 || rate > 192_000 || ![8, 16, 24, 32].includes(bits) || (encoding === 3 && bits !== 32)) throw new SmokeFailure('fixture_unsupported_format');
  const sampleBytes = bits / 8, frameBytes = sampleBytes * channels;
  if (data.length % frameBytes) throw new SmokeFailure('fixture_unaligned_audio');
  const frames = data.length / frameBytes;
  if (frames / rate < 1 || frames / rate > 10 || data.length > 5_000_000) throw new SmokeFailure('fixture_duration_out_of_bounds');
  const mono = new Float64Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      const at = (frame * channels + channel) * sampleBytes;
      if (encoding === 3) sum += data.readFloatLE(at);
      else if (bits === 8) sum += (data.readUInt8(at) - 128) / 128;
      else if (bits === 16) sum += data.readInt16LE(at) / 32768;
      else if (bits === 24) sum += data.readIntLE(at, 3) / 8388608;
      else sum += data.readInt32LE(at) / 2147483648;
    }
    mono[frame] = Math.max(-1, Math.min(1, sum / channels));
  }
  const outputFrames = Math.max(1, Math.round(frames * 24_000 / rate)), bytes = Buffer.allocUnsafe(outputFrames * 2);
  for (let index = 0; index < outputFrames; index++) {
    const position = index * rate / 24_000, left = Math.min(frames - 1, Math.floor(position)), right = Math.min(frames - 1, left + 1), fraction = position - left;
    const sample = mono[left] + (mono[right] - mono[left]) * fraction;
    bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)), index * 2);
  }
  return { bytes, sourceRate: rate, sourceChannels: channels, durationMs: Math.round(outputFrames / 24) };
}

function ensureFixture(): Pcm {
  mkdirSync(fixtureDirectory, { recursive: true });
  if (!existsSync(fixturePath)) {
    const escapedPath = fixturePath.replace(/'/g, "''"), escapedText = spokenQuestion.replace(/'/g, "''");
    const command = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $s.Rate=0; $s.SetOutputToWaveFile('${escapedPath}'); $s.Speak('${escapedText}') } finally { $s.Dispose() }`;
    const generated = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
    if (generated.status !== 0 || !existsSync(fixturePath)) throw new SmokeFailure('windows_system_speech_unavailable');
    writeFileSync(provenancePath, `${JSON.stringify({ synthetic: true, generator: 'Windows System.Speech.Synthesis.SpeechSynthesizer', text: spokenQuestion, purpose: 'Fictional public audio smoke fixture; not a real caller or microphone capture.' }, null, 2)}\n`, { flag: 'wx' });
  }
  if (!existsSync(provenancePath)) throw new SmokeFailure('fixture_provenance_missing');
  let provenance: unknown;
  try { provenance = JSON.parse(readFileSync(provenancePath, 'utf8')); } catch { throw new SmokeFailure('fixture_provenance_invalid'); }
  if (!provenance || typeof provenance !== 'object' || (provenance as Record<string, unknown>).synthetic !== true) throw new SmokeFailure('fixture_provenance_invalid');
  return waveTo24kMono16(readFileSync(fixturePath));
}

function parseArgs() {
  const args = process.argv.slice(2), offline = args.includes('--offline-check');
  const expectedAt = args.indexOf('--expected-keyword');
  const expectedKeyword = expectedAt >= 0 ? args[expectedAt + 1] : undefined;
  if (expectedAt >= 0 && (!expectedKeyword || !/^[A-Za-z]{2,30}$/.test(expectedKeyword))) throw new SmokeFailure('invalid_expected_keyword');
  const positional = args.filter((value, index) => value !== '--offline-check' && value !== '--expected-keyword' && index !== expectedAt + 1);
  const publicId = positional[0];
  if (!offline && (!publicId || !/^[a-f0-9-]{36}$/.test(publicId))) throw new SmokeFailure('invalid_public_id');
  if (positional.length > (offline ? 0 : 1)) throw new SmokeFailure('unexpected_argument');
  return { offline, publicId, expectedKeyword: expectedKeyword?.toLowerCase() };
}

const wait = (ms: number) => new Promise<void>(resolveWait => setTimeout(resolveWait, ms));

async function run() {
  const args = parseArgs(), pcm = ensureFixture();
  const probe = pcm.bytes.subarray(0, Math.min(FRAME_BYTES, pcm.bytes.length));
  parseClientEvent(JSON.stringify({ type: 'audio', audio: probe.toString('base64') }));
  if (probe.length > MAX_AUDIO_FRAME_BYTES) throw new SmokeFailure('offline_frame_too_large');
  if (args.offline) {
    process.stdout.write(`${JSON.stringify({ status: 'offline_ready', fixture: 'synthetic_system_speech', durationMs: pcm.durationMs, sourceRate: pcm.sourceRate, sourceChannels: pcm.sourceChannels, outputRate: 24000, outputChannels: 1, frameMs: 100 })}\n`);
    return;
  }

  const abort = new AbortController(), deadline = setTimeout(() => abort.abort(), MAX_RUNTIME_MS);
  let socket: WebSocket | undefined, sentStop = false;
  const summary = { status: 'running', inputFrames: 0, inputBytes: 0, userTranscripts: 0, assistantTranscripts: 0, assistantAudioFrames: 0, assistantAudioBytes: 0, turnDone: 0, expectedKeywordMatched: args.expectedKeyword ? false : undefined };
  try {
    const response = await fetch(`${API_BASE}/api/public/agent/${args.publicId}/session`, { method: 'POST', signal: abort.signal, headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'voice', requestId: randomUUID().replace(/-/g, '') }) });
    if (response.status !== 201) throw new SmokeFailure(`session_http_${response.status}`);
    const session = await response.json() as Record<string, unknown>;
    if (typeof session.token !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(session.token) || typeof session.nonce !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(session.nonce) || typeof session.voiceGatewayUrl !== 'string') throw new SmokeFailure('session_protocol_invalid');
    let gateway: URL; try { gateway = new URL(session.voiceGatewayUrl); } catch { throw new SmokeFailure('gateway_url_invalid'); }
    if (!['ws:', 'wss:'].includes(gateway.protocol) || gateway.username || gateway.password || gateway.search || gateway.hash || gateway.pathname !== '/voice') throw new SmokeFailure('gateway_url_invalid');

    socket = new WebSocket(gateway, { origin: ORIGIN, handshakeTimeout: 8_000, maxPayload: 1_000_000, perMessageDeflate: false });
    let initialTurnDone = false, audioSent = false, completed = false;
    const completion = new Promise<void>((resolveCompletion, reject) => {
      const fail = (code: string) => { if (!completed) { completed = true; reject(new SmokeFailure(code)); } };
      abort.signal.addEventListener('abort', () => fail('deadline_exceeded'), { once: true });
      socket!.on('open', () => socket!.send(JSON.stringify({ type: 'authenticate', token: session.token, nonce: session.nonce, inputMode: 'microphone' })));
      socket!.on('error', () => fail('websocket_transport_error'));
      socket!.on('close', () => { if (!completed) fail('websocket_closed_early'); });
      socket!.on('message', async (raw, binary) => {
        if (completed || binary || raw.toString().length > 1_000_000) return fail('server_protocol_invalid');
        let event: Record<string, unknown>; try { event = JSON.parse(raw.toString()); } catch { return fail('server_protocol_invalid'); }
        if (event.type === 'ready') return;
        if (event.type === 'ended') return fail(typeof event.outcome === 'string' && /^[a-z_]{1,40}$/.test(event.outcome) ? `ended_${event.outcome}` : 'ended_unknown');
        if (event.type === 'interrupted') {
          if (event.itemId !== undefined && (typeof event.itemId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(event.itemId))) return fail('server_protocol_invalid');
          return;
        }
        if (event.type === 'audio') {
          if (typeof event.audio !== 'string' || typeof event.itemId !== 'string' || typeof event.responseId !== 'string') return fail('server_audio_invalid');
          const bytes = Buffer.from(event.audio, 'base64'); if (!bytes.length || bytes.length % 2) return fail('server_audio_invalid');
          if (audioSent) { summary.assistantAudioFrames++; summary.assistantAudioBytes += bytes.length; }
          return;
        }
        if (event.type === 'transcript') {
          if ((event.role !== 'user' && event.role !== 'assistant') || typeof event.text !== 'string' || event.text.length > 12_000) return fail('server_transcript_invalid');
          if (event.role === 'user' && audioSent) { summary.userTranscripts++; if (args.expectedKeyword) summary.expectedKeywordMatched ||= event.text.toLowerCase().includes(args.expectedKeyword); }
          if (event.role === 'assistant' && audioSent) summary.assistantTranscripts++;
          return;
        }
        if (event.type === 'turn_done') {
          summary.turnDone++;
          if (!initialTurnDone) {
            initialTurnDone = true; audioSent = true;
            try {
              const stream = Buffer.concat([pcm.bytes, Buffer.alloc(FRAME_BYTES * SILENCE_FRAMES)]);
              for (let offset = 0; offset < stream.length; offset += FRAME_BYTES) {
                const frame = stream.subarray(offset, Math.min(offset + FRAME_BYTES, stream.length));
                if (frame.length % 2) return fail('input_frame_invalid');
                socket!.send(JSON.stringify({ type: 'audio', audio: frame.toString('base64') })); summary.inputFrames++; summary.inputBytes += frame.length;
                await wait(100);
              }
            } catch { fail('audio_send_failed'); }
            return;
          }
          if (summary.userTranscripts < 1 || summary.assistantAudioBytes < 2) return fail('required_evidence_missing');
          completed = true; summary.status = 'passed';
          socket!.send(JSON.stringify({ type: 'stop' })); sentStop = true;
          resolveCompletion();
          return;
        }
        fail('server_protocol_invalid');
      });
    });
    await completion;
    await Promise.race([new Promise<void>(resolveClose => socket!.once('close', () => resolveClose())), wait(2_000)]);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    clearTimeout(deadline);
    if (socket?.readyState === WebSocket.OPEN && !sentStop) socket.send(JSON.stringify({ type: 'stop' }));
    socket?.close();
  }
}

run().catch(error => {
  const code = error instanceof SmokeFailure ? error.code : error instanceof Error && error.name === 'AbortError' ? 'deadline_exceeded' : 'unexpected_failure';
  process.stdout.write(`${JSON.stringify({ status: 'failed', code })}\n`);
  process.exitCode = 1;
});
