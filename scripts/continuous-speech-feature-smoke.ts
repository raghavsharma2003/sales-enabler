// One explicitly authorized Azure Speech validation of the complete private
// continuous-speech server path. It never retries and never retains audio,
// transcripts, identifiers, provider payloads, errors, or credentials.
// Offline: node --import tsx scripts/continuous-speech-feature-smoke.ts --offline-check
// Live: node --env-file=.env.local --import tsx scripts/continuous-speech-feature-smoke.ts --run
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import WebSocket from 'ws';

const MAX_RUN_MS = 20_000;
const FIXTURE_SHA256 = '9683ce2d8bb5304b178e38fc9bf4915b1fbc96bde20b030ffe4c21a2df39cb75';
const FIXTURE_PATH = resolve('.impeccable/review/azure-voice-smoke.wav');
const WORKLET_PATH = resolve('public/voice/pcm-capture.worklet.js');
const REPORT_PATH = resolve('.impeccable/review/continuous-speech-feature-smoke.json');
const ORIGIN = 'http://127.0.0.1:41731';
const PRE_SILENCE_MS = 400, POST_SILENCE_MS = 800;

type WorkletFrame = { type: 'frame'; pcm: ArrayBuffer; epoch: number; sampleStart: number };
type SafeStatus = 'completed' | 'offline_verified' | 'configuration_unavailable' | 'fixture_invalid' | 'authorization_failed' | 'gateway_failed' | 'provider_failed' | 'hypothesis_missing' | 'revocation_failed' | 'receipt_failed' | 'deadline_exceeded';
type SafeReport = {
  status: SafeStatus;
  syntheticTestFixture: true;
  provenanceVerified: boolean;
  eventCounts: { ready: number; interim: number; sidecarFinal: number; terminal: number; framesSubmitted: number; duplicateClaimRejected: number };
  timestampsMs: { started: number; ready?: number; inputCompleted?: number; firstInterim?: number; firstSidecarFinal?: number; sessionRevoked?: number; terminal?: number; leaseClosed?: number; serverClosed?: number };
  receipt: { ticketStatus?: 'closed'; leaseStatus?: 'closed'; metadataPresent?: boolean };
  exclusions: ['native_realtime', 'microphone_capture', 'browser_perception', 'human_rated_accuracy'];
};

class SmokeFailure extends Error {
  constructor(readonly code: SafeStatus) { super(code); }
}
const fail = (code: SafeStatus): never => { throw new SmokeFailure(code); };
const delay = (ms: number) => new Promise<void>(resolveDelay => setTimeout(resolveDelay, Math.max(0, ms)));

function wavFixture(): { samples: Float32Array; sourceRate: number; durationMs: number } {
  const bytes = readFileSync(FIXTURE_PATH);
  if (createHash('sha256').update(bytes).digest('hex') !== FIXTURE_SHA256 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') fail('fixture_invalid');
  let offset = 12, format: { encoding: number; channels: number; rate: number; bits: number } | undefined, pcm: Buffer | undefined;
  while (offset + 8 <= bytes.length) {
    const kind = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4), start = offset + 8, end = start + length;
    if (end > bytes.length) fail('fixture_invalid');
    if (kind === 'fmt ' && length >= 16) format = { encoding: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2), rate: bytes.readUInt32LE(start + 4), bits: bytes.readUInt16LE(start + 14) };
    if (kind === 'data') pcm = bytes.subarray(start, end);
    offset = end + (length % 2);
  }
  if (!format || format.encoding !== 1 || format.channels !== 1 || format.rate !== 24_000 || format.bits !== 16 || !pcm || pcm.length !== 201_600 || pcm.length % 2) fail('fixture_invalid');
  const validPcm = pcm as Buffer, validFormat = format as { encoding: number; channels: number; rate: number; bits: number };
  const samples = new Float32Array(validPcm.length / 2);
  for (let index = 0; index < samples.length; index++) samples[index] = validPcm.readInt16LE(index * 2) / 32768;
  return { samples, sourceRate: validFormat.rate, durationMs: samples.length * 1000 / validFormat.rate };
}

function workletFrames(): WorkletFrame[] {
  const fixture = wavFixture();
  if (fixture.durationMs !== 4_200) fail('fixture_invalid');
  const before = new Float32Array(fixture.sourceRate * PRE_SILENCE_MS / 1000), after = new Float32Array(fixture.sourceRate * POST_SILENCE_MS / 1000);
  const input = new Float32Array(before.length + fixture.samples.length + after.length);
  input.set(fixture.samples, before.length);
  const frames: WorkletFrame[] = [];
  type Processor = { process(inputs: Float32Array[][]): boolean };
  let ProcessorClass: (new () => Processor) | undefined;
  class WorkletBase {
    port = { onmessage: undefined, postMessage: (message: WorkletFrame) => { frames.push({ ...message, pcm: message.pcm.slice(0) }); } };
  }
  vm.runInNewContext(readFileSync(WORKLET_PATH, 'utf8'), {
    AudioWorkletProcessor: WorkletBase,
    sampleRate: fixture.sourceRate,
    registerProcessor(name: string, constructor: new () => Processor) {
      if (name !== 'pcm-capture') fail('fixture_invalid');
      ProcessorClass = constructor;
    },
  });
  if (!ProcessorClass) fail('fixture_invalid');
  const ValidProcessor = ProcessorClass as new () => Processor;
  const processor = new ValidProcessor();
  for (let offset = 0; offset < input.length; offset += 128) {
    if (!processor.process([[input.subarray(offset, Math.min(input.length, offset + 128))]])) fail('fixture_invalid');
  }
  if (frames.length !== 270 || frames.some((frame, index) => frame.pcm.byteLength !== 640 || frame.sampleStart !== index * 320 || frame.epoch !== 0)) fail('fixture_invalid');
  return frames;
}

function baseReport(status: SafeStatus): SafeReport {
  return {
    status, syntheticTestFixture: true, provenanceVerified: false,
    eventCounts: { ready: 0, interim: 0, sidecarFinal: 0, terminal: 0, framesSubmitted: 0, duplicateClaimRejected: 0 },
    timestampsMs: { started: 0 }, receipt: {},
    exclusions: ['native_realtime', 'microphone_capture', 'browser_perception', 'human_rated_accuracy'],
  };
}

async function waitFor(predicate: () => boolean, remaining: () => number, maximumMs: number) {
  const deadline = performance.now() + Math.min(maximumMs, remaining());
  while (!predicate()) {
    if (performance.now() >= deadline || remaining() <= 0) fail('deadline_exceeded');
    await delay(Math.min(20, deadline - performance.now()));
  }
}

async function duplicateClaimRejected(url: string, ticket: string, remaining: () => number): Promise<boolean> {
  const duplicate = new WebSocket(url, { origin: ORIGIN, handshakeTimeout: Math.min(3_000, remaining()), maxPayload: 8_192, perMessageDeflate: false });
  let rejected = false, providerReady = false;
  duplicate.on('open', () => duplicate.send(JSON.stringify({ type: 'start', ticket })));
  duplicate.on('message', raw => {
    try {
      const event = JSON.parse(raw.toString()) as { type?: unknown; state?: unknown; reason?: unknown };
      if (event.type === 'status' && event.state === 'ready') providerReady = true;
      if (event.type === 'status' && event.state === 'unavailable' && event.reason === 'authentication') rejected = true;
    } catch { /* A malformed duplicate response is a failed rejection proof. */ }
  });
  try { await waitFor(() => rejected || providerReady || duplicate.readyState === WebSocket.CLOSED, remaining, 3_000); }
  finally { if (duplicate.readyState !== WebSocket.CLOSED) duplicate.terminate(); }
  return rejected && !providerReady;
}

async function liveRun(): Promise<SafeReport> {
  const began = performance.now(), remaining = () => Math.max(0, MAX_RUN_MS - (performance.now() - began));
  const report = baseReport('gateway_failed');
  const at = () => Math.max(0, Math.round(performance.now() - began));
  const frames = workletFrames(); report.provenanceVerified = true;
  if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) fail('configuration_unavailable');

  // The database choice must be fixed before any application module can call db().
  delete process.env.DATABASE_URL;
  process.env.SQLITE_PATH = ':memory:';
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'false';
  process.env.APP_URL = ORIGIN;
  process.env.CONTINUOUS_SPEECH_ALLOW_LOCAL_WS = 'true';

  const [{ authenticate }, { createRecord }, route, { createVoiceGateway }, { db }] = await Promise.all([
    import('../lib/server/auth'), import('../lib/platform/records'), import('../app/api/voice/perception/route'),
    import('../lib/public-agent/gateway'), import('../lib/server/db'),
  ]);
  const gateway = createVoiceGateway();
  let socket: WebSocket | undefined, issuedBody: { previewId: string; consent: true } | undefined, cookie = '', serverClosed = false;
  const serverClose = once(gateway.server, 'close').then(() => { serverClosed = true; report.timestampsMs.serverClosed = at(); });
  try {
    gateway.server.listen(0, '127.0.0.1');
    await once(gateway.server, 'listening');
    const address = gateway.server.address();
    if (!address || typeof address === 'string' || address.port === 3001) fail('gateway_failed');
    const gatewayPort = (address as import('node:net').AddressInfo).port;
    process.env.CONTINUOUS_SPEECH_GATEWAY_URL = `ws://127.0.0.1:${gatewayPort}/private-speech`;

    const authRequest = new Request(`${ORIGIN}/api/auth`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' } });
    const auth = await authenticate({ mode: 'register', email: `${randomUUID()}@example.test`, password: 'synthetic smoke password' }, authRequest);
    cookie = auth.cookie.split(';')[0];
    const call = await createRecord(auth.user, 'voice_preview', {
      requestedBy: auth.user.id, provider: 'azure', inputMode: 'microphone', mode: 'internal_draft_test',
      testFixture: true, fixturePurpose: 'continuous_speech_feature_smoke',
      config: { primaryLanguage: 'English', allowedLanguages: ['English', 'Hindi'] }, contextDigest: 'synthetic-smoke-context',
      toolAuthority: { version: 1, contextMode: 'internal_operator_browser', contextDigest: 'synthetic-smoke-context', enabledTools: [], expiresAt: new Date(Date.now() + 120_000).toISOString() },
    }, 'connection_issued');
    issuedBody = { previewId: call.id, consent: true };
    const request = (method: 'POST' | 'DELETE') => new Request(`${ORIGIN}/api/voice/perception`, {
      method, headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' }, body: JSON.stringify(issuedBody),
    });
    const issued = await route.POST(request('POST'));
    if (issued.status !== 200) fail('authorization_failed');
    const grant = await issued.json() as { transport?: unknown; url?: unknown; ticket?: unknown; pcm?: { sampleRate?: unknown; frameBytes?: unknown } };
    if (grant.transport !== 'websocket' || grant.url !== process.env.CONTINUOUS_SPEECH_GATEWAY_URL || typeof grant.ticket !== 'string' || !/^[a-f0-9]{64}$/.test(grant.ticket) || grant.pcm?.sampleRate !== 16_000 || grant.pcm.frameBytes !== 640) fail('authorization_failed');
    const grantUrl = grant.url as string, grantTicket = grant.ticket as string;
    const database = await db();
    const ticketHash = createHash('sha256').update(grantTicket).digest('hex');
    const [ticketRecord] = await database.all('SELECT id,status,data FROM entities WHERE kind = ?', ['voice:speech-ticket']);
    if (!ticketRecord || ticketRecord.id !== `voice:speech-ticket:${ticketHash}` || JSON.stringify(ticketRecord).includes(grantTicket)) fail('authorization_failed');

    let ready = false, terminal = false, closed = false, callbackFailed = false;
    socket = new WebSocket(grantUrl, { origin: ORIGIN, handshakeTimeout: Math.min(5_000, remaining()), maxPayload: 8_192, perMessageDeflate: false });
    socket.on('open', () => socket!.send(JSON.stringify({ type: 'start', ticket: grantTicket })));
    socket.on('message', raw => {
      try {
        const event = JSON.parse(raw.toString()) as { type?: unknown; state?: unknown; reason?: unknown; audioStartSample?: unknown; audioEndSample?: unknown; text?: unknown };
        if (event.type === 'status') {
          if (event.state === 'ready') { ready = true; report.eventCounts.ready++; report.timestampsMs.ready ??= at(); }
          else if (event.state === 'ended' || event.state === 'unavailable') { terminal = true; report.eventCounts.terminal++; report.timestampsMs.terminal ??= at(); }
          return;
        }
        if (event.type !== 'hypothesis' || !['interim', 'sidecar_final'].includes(String(event.state)) || typeof event.text !== 'string' || !Number.isSafeInteger(event.audioStartSample) || !Number.isSafeInteger(event.audioEndSample)) fail('provider_failed');
        if (event.state === 'interim') { report.eventCounts.interim++; report.timestampsMs.firstInterim ??= at(); }
        else { report.eventCounts.sidecarFinal++; report.timestampsMs.firstSidecarFinal ??= at(); }
      } catch {
        callbackFailed = true;
        if (socket?.readyState === WebSocket.OPEN) socket.terminate();
      }
    });
    socket.on('close', () => { closed = true; });
    socket.on('error', () => { closed = true; });
    await waitFor(() => ready || closed || callbackFailed, remaining, 12_000);
    if (!ready || closed || callbackFailed) fail('provider_failed');

    if (!await duplicateClaimRejected(grantUrl, grantTicket, remaining)) fail('authorization_failed');
    report.eventCounts.duplicateClaimRejected = 1;
    const pacingStart = performance.now();
    for (let index = 0; index < frames.length; index++) {
      const wait = pacingStart + index * 20 - performance.now();
      if (wait > 0) await delay(wait);
      if (remaining() <= 0 || callbackFailed || socket.readyState !== WebSocket.OPEN) fail('provider_failed');
      const payload = Buffer.from(new Uint8Array(frames[index].pcm));
      await new Promise<void>((resolveSend, rejectSend) => socket!.send(payload, { binary: true }, error => error ? rejectSend(new SmokeFailure('provider_failed')) : resolveSend()));
      report.eventCounts.framesSubmitted++;
    }
    report.timestampsMs.inputCompleted = at();
    await waitFor(() => report.eventCounts.interim > 0 && report.eventCounts.sidecarFinal > 0, remaining, 4_000).catch(error => {
      if (error instanceof SmokeFailure && error.code === 'deadline_exceeded') fail('hypothesis_missing');
      throw error;
    });

    const revoked = await route.DELETE(request('DELETE'));
    report.timestampsMs.sessionRevoked = at();
    if (revoked.status !== 200) fail('revocation_failed');
    await waitFor(() => terminal && closed, remaining, 4_000);
    const rows = await database.all('SELECT kind,status,data FROM entities WHERE kind IN (?, ?)', ['voice:speech-ticket', 'voice:speech-lease']);
    const receipt = rows.find(row => row.kind === 'voice:speech-ticket'), lease = rows.find(row => row.kind === 'voice:speech-lease');
    if (!receipt || receipt.status !== 'closed' || !lease || lease.status !== 'closed') fail('receipt_failed');
    const stored = JSON.parse(String(receipt!.data)) as { endedAt?: unknown; summary?: Record<string, unknown> };
    if (typeof stored.endedAt !== 'string' || !stored.summary || stored.summary.reason !== 'client' || Object.keys(stored.summary).some(key => !['reason', 'audioBytes', 'hypotheses', 'durationMs'].includes(key))) fail('receipt_failed');
    report.receipt = { ticketStatus: 'closed', leaseStatus: 'closed', metadataPresent: true };
    report.timestampsMs.leaseClosed = at();
    report.status = 'completed';
    return report;
  } finally {
    if (issuedBody && cookie) {
      const cleanup = new Request(`${ORIGIN}/api/voice/perception`, { method: 'DELETE', headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' }, body: JSON.stringify(issuedBody) });
      await route.DELETE(cleanup).catch(() => undefined);
    }
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.terminate();
    gateway.shutdown();
    if (!serverClosed) await Promise.race([serverClose, delay(1_000)]);
    if (!serverClosed && report.status === 'completed') report.status = 'gateway_failed';
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode === '--offline-check') {
    workletFrames();
    process.stdout.write(JSON.stringify({ status: 'offline_verified', syntheticTestFixture: true, provenanceVerified: true, exclusions: ['native_realtime', 'microphone_capture', 'browser_perception', 'human_rated_accuracy'] }) + '\n');
    return;
  }
  if (mode !== '--run') fail('configuration_unavailable');
  let report: SafeReport;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    report = await Promise.race([
      liveRun(),
      new Promise<never>((_resolve, reject) => { deadlineTimer = setTimeout(() => reject(new SmokeFailure('deadline_exceeded')), MAX_RUN_MS); }),
    ]);
  } catch (error) {
    report = baseReport(error instanceof SmokeFailure ? error.code : 'gateway_failed');
    report.provenanceVerified = (() => { try { workletFrames(); return true; } catch { return false; } })();
    process.exitCode = 1;
  } finally { if (deadlineTimer) clearTimeout(deadlineTimer); }
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report) + '\n');
}

void main().catch(() => {
  process.stderr.write('Continuous speech feature smoke stopped before a safe report could be written. No provider details were logged.\n');
  process.exitCode = 1;
});
