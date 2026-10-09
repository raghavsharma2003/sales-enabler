// One bounded Azure Speech continuous-recognition capability probe.
// Usage: node --env-file=.env.local scripts/azure-streaming-recognition-smoke.mjs
// The SDK is intentionally isolated under ignored data/probes, not installed as
// an application dependency. This script never prints recognition text, keys,
// endpoints, resource IDs, or provider payloads.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pushPcmInRealTime } from './lib/azure-streaming-recognition-pacing.mjs';

const SDK_ROOT = resolve('data/probes/azure-speech-sdk');
const FIXTURE_PATH = resolve('.impeccable/review/azure-voice-smoke.wav');
const REPORT_PATH = resolve('.impeccable/review/azure-streaming-recognition-smoke-paced.json');
const EXPECTED_FIXTURE_SHA256 = '9683ce2d8bb5304b178e38fc9bf4915b1fbc96bde20b030ffe4c21a2df39cb75';
const MAX_RUN_MS = 10_000;
const MAX_TEXT_DIGESTS = 40;
const INPUT_CHUNK_MS = 20;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readPcmWav(bytes) {
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('fixture-format');
  const format = bytes.readUInt16LE(20);
  const channels = bytes.readUInt16LE(22);
  const sampleRate = bytes.readUInt32LE(24);
  const bitsPerSample = bytes.readUInt16LE(34);
  const dataBytes = bytes.readUInt32LE(40);
  if (format !== 1 || channels !== 1 || sampleRate !== 24_000 || bitsPerSample !== 16 || dataBytes !== bytes.length - 44) throw new Error('fixture-format');
  return { channels, sampleRate, bitsPerSample, dataBytes, durationMs: Math.round(dataBytes / (sampleRate * channels * bitsPerSample / 8) * 1_000) };
}

const key = process.env.AZURE_SPEECH_KEY?.trim() || '';
const region = process.env.AZURE_SPEECH_REGION?.trim().toLowerCase() || '';
if (key.length < 20 || key.includes('REPLACE_WITH') || !/^[a-z0-9-]{2,40}$/.test(region)) {
  process.stderr.write('Azure Speech streaming probe: incomplete private Speech configuration. No provider call made.\n');
  process.exitCode = 1;
} else {
  const fixture = readFileSync(FIXTURE_PATH);
  const fixtureHash = sha256(fixture);
  if (fixtureHash !== EXPECTED_FIXTURE_SHA256) throw new Error('fixture-provenance');
  const wav = readPcmWav(fixture);
  const require = createRequire(resolve(SDK_ROOT, 'package.json'));
  const sdk = require('microsoft-cognitiveservices-speech-sdk');
  const sdkVersion = require('microsoft-cognitiveservices-speech-sdk/package.json').version;
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = 'en-IN';
  const streamFormat = sdk.AudioStreamFormat.getWaveFormatPCM(wav.sampleRate, wav.bitsPerSample, wav.channels);
  const pushStream = sdk.AudioInputStream.createPushStream(streamFormat);
  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  const startedAt = performance.now();
  const counts = { audioChunksSubmitted: 0, audioBytesSubmitted: 0, sessionStarted: 0, speechStartDetected: 0, recognizing: 0, recognized: 0, noMatch: 0, speechEndDetected: 0, sessionStopped: 0, canceled: 0 };
  const times = {};
  const partialDigests = [];
  const finalDigests = [];
  let terminalCancellationCategory;
  let terminalEventType;
  let inputClosed = false;
  let settled = false;
  let timer;
  let terminalTimer;

  const atMs = () => Math.max(0, Math.round(performance.now() - startedAt));
  const markFirst = (name) => { if (times[name] === undefined) times[name] = atMs(); };
  const rememberDigest = (target, text) => {
    if (typeof text !== 'string' || !text.trim() || target.length >= MAX_TEXT_DIGESTS) return;
    const digest = sha256(text.trim().normalize('NFKC'));
    if (target.at(-1) !== digest) target.push(digest);
  };
  const closeInput = () => { if (!inputClosed) { inputClosed = true; pushStream.close(); } };

  function writeReport(status) {
    const recognizingBeforeFinal = times.firstRecognizingAtMs !== undefined && times.firstRecognizedAtMs !== undefined && times.firstRecognizingAtMs < times.firstRecognizedAtMs;
    const intermediateBeforeInputComplete = times.firstRecognizingAtMs !== undefined && times.inputCompleteAtMs !== undefined && times.firstRecognizingAtMs < times.inputCompleteAtMs;
    const finalAfterInputComplete = times.firstRecognizedAtMs !== undefined && times.inputCompleteAtMs !== undefined && times.firstRecognizedAtMs >= times.inputCompleteAtMs;
    const report = {
      version: 1,
      checkedAt: new Date().toISOString(),
      status,
      provider: 'azure-speech',
      sdkVersion,
      attemptCount: 1,
      maxRunMs: MAX_RUN_MS,
      fixture: {
        provenance: 'repository-synthetic-azure-realtime-output',
        sha256: fixtureHash,
        bytes: fixture.length,
        ...wav,
      },
      language: 'en-IN',
      inputPacing: { chunkMs: INPUT_CHUNK_MS, pcmBytes: wav.dataBytes },
      eventCounts: counts,
      terminal: {
        event: terminalEventType || 'none_observed',
        ...(terminalCancellationCategory ? { cancellationCategory: terminalCancellationCategory } : {}),
        ...(times.terminalAtMs !== undefined ? { atMs: times.terminalAtMs } : {}),
        afterFinal: times.terminalAtMs !== undefined && times.firstRecognizedAtMs !== undefined
          ? times.terminalAtMs >= times.firstRecognizedAtMs : null,
      },
      timingsMs: {
        ...times,
        ...(times.firstRecognizingAtMs !== undefined && times.firstRecognizedAtMs !== undefined
          ? { firstRecognizingToFirstRecognized: times.firstRecognizedAtMs - times.firstRecognizingAtMs }
          : {}),
        elapsed: atMs(),
      },
      recognizingBeforeFinal,
      intermediateBeforeInputComplete,
      finalAfterInputComplete,
      partialRevisionCount: partialDigests.length,
      partialTextDigests: partialDigests,
      finalTextDigests: finalDigests,
      verified: status === 'intermediate_while_input_open_observed'
        ? 'One bounded real-time-paced input session produced an intermediate recognizing event while audio was still being submitted, before a final recognized event after input completion.'
        : 'Intermediate recognition while audio input remained open was not established.',
      limitation: 'No transcript accuracy, Hindi/Hinglish quality, microphone, live overlap, duplex policy, latency superiority, or production-readiness claim.',
    };
    mkdirSync(resolve('.impeccable/review'), { recursive: true });
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    process.stdout.write(`Azure Speech paced streaming probe: ${status}; firstPartialMs=${times.firstRecognizingAtMs ?? 'missing'}; inputCompleteMs=${times.inputCompleteAtMs ?? 'missing'}; finalMs=${times.firstRecognizedAtMs ?? 'missing'}; terminal=${report.terminal.event}${report.terminal.cancellationCategory ? `:${report.terminal.cancellationCategory}` : ''}; terminalAfterFinal=${report.terminal.afterFinal}; elapsedMs=${report.timingsMs.elapsed}; report=.impeccable/review/azure-streaming-recognition-smoke-paced.json\n`);
    process.exitCode = status === 'intermediate_while_input_open_observed' ? 0 : 1;
  }

  function finish(reason) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    clearTimeout(terminalTimer);
    closeInput();
    const successful = terminalCancellationCategory !== 'error' && counts.recognizing > 0 && counts.recognized > 0 &&
      times.firstRecognizingAtMs < times.inputCompleteAtMs && times.firstRecognizedAtMs >= times.inputCompleteAtMs;
    const status = successful ? 'intermediate_while_input_open_observed' : reason;
    // Persist before SDK shutdown. Some Node SDK transports release their last
    // handle without invoking either stop callback, which would lose the only
    // bounded report. close() is local cleanup and cannot start another request.
    writeReport(status);
    try { recognizer.close(); } catch { /* Report already retained. */ }
    try { audioConfig.close(); } catch { /* Report already retained. */ }
  }

  recognizer.sessionStarted = () => { if (!settled) { counts.sessionStarted++; markFirst('sessionStartedAtMs'); } };
  recognizer.speechStartDetected = () => { if (!settled) { counts.speechStartDetected++; markFirst('speechStartDetectedAtMs'); } };
  recognizer.recognizing = (_sender, event) => {
    if (settled) return;
    counts.recognizing++;
    markFirst('firstRecognizingAtMs');
    rememberDigest(partialDigests, event.result?.text);
  };
  recognizer.recognized = (_sender, event) => {
    if (settled) return;
    if (event.result?.reason === sdk.ResultReason.RecognizedSpeech) {
      counts.recognized++;
      markFirst('firstRecognizedAtMs');
      rememberDigest(finalDigests, event.result?.text);
    } else if (event.result?.reason === sdk.ResultReason.NoMatch) counts.noMatch++;
  };
  recognizer.speechEndDetected = () => { if (!settled) { counts.speechEndDetected++; markFirst('speechEndDetectedAtMs'); } };
  recognizer.sessionStopped = () => {
    if (settled) return;
    counts.sessionStopped++;
    markFirst('sessionStoppedAtMs');
    terminalEventType = 'session_stopped';
    times.terminalAtMs = atMs();
    // Allow a provider cancellation/EndOfStream event in the same terminal
    // sequence to arrive before finalizing the sanitized report.
    terminalTimer ||= setTimeout(() => finish('final_without_intermediate'), 100);
  };
  recognizer.canceled = (_sender, event) => {
    if (settled) return;
    counts.canceled++;
    markFirst('canceledAtMs');
    terminalEventType = 'canceled';
    times.terminalAtMs = atMs();
    terminalCancellationCategory = event.reason === sdk.CancellationReason.EndOfStream ? 'end_of_stream'
      : event.reason === sdk.CancellationReason.Error ? 'error' : 'other';
    finish(terminalCancellationCategory === 'end_of_stream' ? 'final_without_intermediate' : 'canceled');
  };

  timer = setTimeout(() => finish('timeout'), MAX_RUN_MS);
  recognizer.startContinuousRecognitionAsync(() => { times.sdkStartCallbackAtMs ??= atMs(); }, () => finish('start_failed'));
  const bytesPerChunk = wav.sampleRate * wav.channels * wav.bitsPerSample / 8 * INPUT_CHUNK_MS / 1_000;
  void pushPcmInRealTime({
    pcm: fixture.subarray(44), bytesPerChunk, chunkMs: INPUT_CHUNK_MS,
    write: chunk => pushStream.write(chunk), close: closeInput, isCancelled: () => settled,
    now: atMs,
    onStart: at => { times.inputStartedAtMs = at; },
    onChunk: progress => { counts.audioChunksSubmitted = progress.chunks; counts.audioBytesSubmitted = progress.bytes; },
    onComplete: at => { times.inputCompleteAtMs = at; },
  }).catch(() => finish('input_failed'));
}
