import assert from "node:assert/strict";
import test from "node:test";
import {
  createContinuousSpeechSession,
  type ContinuousSpeechBrowserDependencies,
} from "../lib/voice/continuous-speech-browser";
import { CONTINUOUS_SPEECH_PCM, type ContinuousSpeechGrant } from "../lib/voice/continuous-speech-contracts";
import { PCM_CAPTURE_FRAME_BYTES, PCM_CAPTURE_FRAME_SAMPLES, type PcmCaptureOptions } from "../lib/voice/pcm-capture";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  binaryType = "blob";
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: unknown[] = [];
  closeCalls: Array<number | undefined> = [];

  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: unknown) { this.onmessage?.({ data: typeof value === "string" ? value : JSON.stringify(value) } as MessageEvent); }
  raw(value: unknown) { this.onmessage?.({ data: value } as MessageEvent); }
  send(value: unknown) { assert.equal(this.readyState, 1); this.sent.push(value); }
  close(code?: number) { this.closeCalls.push(code); this.readyState = 3; this.onclose?.(); }
}

function grant(overrides: Partial<ContinuousSpeechGrant> = {}): ContinuousSpeechGrant {
  return {
    transport: "websocket",
    url: "wss://speech.example.test/private-speech",
    ticket: "a".repeat(64),
    expiresAt: new Date(1_700_000_060_000).toISOString(),
    maxDurationSeconds: 600,
    language: "en-IN",
    pcm: CONTINUOUS_SPEECH_PCM,
    ...overrides,
  };
}

function harness(captureFactory?: (options: PcmCaptureOptions) => Promise<{ close(): void; setMuted(muted: boolean): void }>) {
  FakeWebSocket.instances = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let nextTimer = 1;
  const dependencies: ContinuousSpeechBrowserDependencies = {
    createWebSocket: url => new FakeWebSocket(url) as unknown as WebSocket,
    startCapture: captureFactory ?? (async () => ({ close() {}, setMuted() {} })),
    wallClock: () => 1_700_000_000_000,
    now: () => 42.5,
    setTimer: (callback, delay) => {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: timer => { timers.delete(timer as unknown as number); },
  };
  return { dependencies, timers };
}

test("waits for epoch-bearing readiness, then sends contiguous binary PCM from the caller stream", async () => {
  const statuses: unknown[] = [];
  const hypotheses: unknown[] = [];
  const progress: unknown[] = [];
  const mutes: boolean[] = [];
  const stream = { getTracks: () => [{ stop: () => assert.fail("the sidecar must not stop caller tracks") }] } as unknown as MediaStream;
  const captured: { options?: PcmCaptureOptions } = {};
  let captureClosed = 0;
  const h = harness(async options => {
    captured.options = options;
    return { close: () => { captureClosed += 1; }, setMuted: muted => { mutes.push(muted); } };
  });
  const session = createContinuousSpeechSession({
    grant: grant(), stream,
    onStatus: status => statuses.push(status),
    onHypothesis: hypothesis => hypotheses.push(hypothesis),
    onProgress: value => progress.push(value),
  }, h.dependencies);

  let connected = false;
  const connecting = session.connect().then(() => { connected = true; });
  session.setMuted(true);
  const socket = FakeWebSocket.instances[0];
  assert.deepEqual(statuses, [{ state: "connecting" }]);
  assert.equal(captured.options, undefined);
  socket.open();
  assert.deepEqual(socket.sent, [JSON.stringify({ type: "start", ticket: "a".repeat(64) })]);
  socket.message({ type: "status", state: "ready", sessionEpoch: "epoch-1" });
  await connecting;
  assert.equal(connected, true);
  const activeCapture = (captured as { options: PcmCaptureOptions }).options;
  assert.equal(activeCapture.stream, stream);
  assert.deepEqual(statuses, [{ state: "connecting" }, { state: "ready", sessionEpoch: "epoch-1" }]);

  const frame = new ArrayBuffer(PCM_CAPTURE_FRAME_BYTES);
  activeCapture.onFrame(frame, { sampleStart: 0, sampleCount: PCM_CAPTURE_FRAME_SAMPLES });
  assert.equal(socket.sent[1], frame, "PCM is sent as a binary frame without JSON/base64 wrapping");
  assert.deepEqual(progress, [{ submittedSamples: PCM_CAPTURE_FRAME_SAMPLES, receivedAt: 42.5 }]);
  socket.message({ type: "hypothesis", sessionEpoch: "epoch-1", segmentId: 0, revision: 0,
    audioStartSample: 0, audioEndSample: PCM_CAPTURE_FRAME_SAMPLES, text: "hello", state: "sidecar_final" });
  assert.deepEqual(hypotheses, [{ type: "hypothesis", sessionEpoch: "epoch-1", segmentId: 0, revision: 0,
    audioStartSample: 0, audioEndSample: PCM_CAPTURE_FRAME_SAMPLES, text: "hello", state: "sidecar_final" }]);

  assert.deepEqual(mutes, [true], "a pre-ready mute is applied before readiness resolves");
  session.setMuted(false);
  assert.deepEqual(mutes, [true, false]);
  session.close();
  session.close();
  assert.equal(captureClosed, 1);
  assert.equal(socket.closeCalls.length, 1);
  assert.deepEqual(statuses.at(-1), { state: "ended", sessionEpoch: "epoch-1" });
});

test("fails the sidecar on backpressure without dropping, replaying, or reconnecting", async () => {
  const statuses: Array<{ state: string; reason?: string }> = [];
  let captureOptions!: PcmCaptureOptions;
  let captureClosed = 0;
  const h = harness(async options => {
    captureOptions = options;
    return { close: () => { captureClosed += 1; }, setMuted() {} };
  });
  const session = createContinuousSpeechSession({ grant: grant(), stream: {} as MediaStream,
    onStatus: status => statuses.push(status), onHypothesis: () => assert.fail("unexpected hypothesis") }, h.dependencies);
  const connecting = session.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.message({ type: "status", state: "ready", sessionEpoch: "epoch-2" });
  await connecting;
  socket.bufferedAmount = 65_000;
  captureOptions.onFrame(new ArrayBuffer(PCM_CAPTURE_FRAME_BYTES), { sampleStart: 0, sampleCount: PCM_CAPTURE_FRAME_SAMPLES });
  captureOptions.onFrame(new ArrayBuffer(PCM_CAPTURE_FRAME_BYTES), { sampleStart: 0, sampleCount: PCM_CAPTURE_FRAME_SAMPLES });
  assert.deepEqual(statuses.at(-1), { state: "unavailable", reason: "backpressure", sessionEpoch: "epoch-2" });
  assert.equal(socket.sent.length, 1, "only the start event was sent");
  assert.equal(captureClosed, 1);
  assert.equal(FakeWebSocket.instances.length, 1);
});

test("rejects invalid wire data, non-monotonic revisions, and future offsets", async () => {
  for (const invalidEvent of [
    { type: "status", state: null },
    { type: "status", state: "ready", sessionEpoch: "" },
  ]) {
    const statuses: Array<{ state: string; reason?: string }> = [];
    const h = harness();
    const session = createContinuousSpeechSession({ grant: grant(), stream: {} as MediaStream,
      onStatus: status => statuses.push(status), onHypothesis: () => assert.fail("unexpected hypothesis") }, h.dependencies);
    const connecting = assert.rejects(session.connect(), /invalid/);
    const socket = FakeWebSocket.instances[0]; socket.open(); socket.message(invalidEvent);
    await connecting;
    assert.equal(statuses.at(-1)?.reason, "protocol");
  }

  const statuses: Array<{ state: string; reason?: string }> = [];
  const hypotheses: unknown[] = [];
  let captureOptions!: PcmCaptureOptions;
  const h = harness(async options => { captureOptions = options; return { close() {}, setMuted() {} }; });
  const session = createContinuousSpeechSession({ grant: grant(), stream: {} as MediaStream,
    onStatus: status => statuses.push(status), onHypothesis: value => hypotheses.push(value) }, h.dependencies);
  const connecting = session.connect();
  const socket = FakeWebSocket.instances[0]; socket.open();
  socket.message({ type: "status", state: "ready", sessionEpoch: "epoch-3" });
  await connecting;
  captureOptions.onFrame(new ArrayBuffer(PCM_CAPTURE_FRAME_BYTES), { sampleStart: 0, sampleCount: PCM_CAPTURE_FRAME_SAMPLES });
  const valid = { type: "hypothesis", sessionEpoch: "epoch-3", segmentId: 7, revision: 2,
    audioStartSample: 0, audioEndSample: PCM_CAPTURE_FRAME_SAMPLES * 2, text: "bounded", state: "interim" };
  socket.message(valid);
  socket.message(valid);
  assert.equal(hypotheses.length, 1);
  assert.equal(statuses.at(-1)?.reason, "protocol");
  captureOptions.onFrame(new ArrayBuffer(PCM_CAPTURE_FRAME_BYTES), { sampleStart: PCM_CAPTURE_FRAME_SAMPLES, sampleCount: PCM_CAPTURE_FRAME_SAMPLES });
  assert.equal(socket.sent.length, 2, "a late frame after protocol failure is ignored");

  const futureStatuses: Array<{ state: string; reason?: string }> = [];
  const futureHarness = harness();
  const futureSession = createContinuousSpeechSession({ grant: grant(), stream: {} as MediaStream,
    onStatus: status => futureStatuses.push(status), onHypothesis: () => assert.fail("unexpected hypothesis") }, futureHarness.dependencies);
  const futureConnecting = futureSession.connect();
  const futureSocket = FakeWebSocket.instances[0]; futureSocket.open();
  futureSocket.message({ type: "status", state: "ready", sessionEpoch: "epoch-future" });
  await futureConnecting;
  futureSocket.message({ type: "hypothesis", sessionEpoch: "epoch-future", segmentId: 0, revision: 0,
    audioStartSample: 0, audioEndSample: PCM_CAPTURE_FRAME_SAMPLES + 1, text: "future", state: "interim" });
  assert.equal(futureStatuses.at(-1)?.reason, "protocol");
});

test("an end event wins a capture-start race and closes a late capture", async () => {
  let resolveCapture!: (capture: { close(): void; setMuted(muted: boolean): void }) => void;
  let lateCaptureClosed = 0;
  const h = harness(() => new Promise(resolve => { resolveCapture = resolve; }));
  const statuses: Array<{ state: string }> = [];
  const session = createContinuousSpeechSession({ grant: grant(), stream: {} as MediaStream,
    onStatus: status => statuses.push(status), onHypothesis: () => assert.fail("unexpected hypothesis") }, h.dependencies);
  const connecting = assert.rejects(session.connect(), /ended/);
  const socket = FakeWebSocket.instances[0]; socket.open();
  socket.message({ type: "status", state: "ready", sessionEpoch: "epoch-race" });
  socket.message({ type: "status", state: "ended", sessionEpoch: "epoch-race" });
  resolveCapture({ close: () => { lateCaptureClosed += 1; }, setMuted() {} });
  await connecting;
  await Promise.resolve();
  assert.equal(lateCaptureClosed, 1);
  assert.deepEqual(statuses, [{ state: "connecting" }, { state: "ended", sessionEpoch: "epoch-race" }]);
});

test("abort and grant validation do not request a new microphone or leak a late capture", async () => {
  for (const invalid of [
    grant({ url: "ws://speech.example.test/private-speech" }),
    grant({ url: "wss://user:secret@speech.example.test/private-speech" }),
    grant({ url: "wss://speech.example.test/private-speech?ticket=secret" }),
    grant({ url: "wss://speech.example.test/other" }),
  ]) {
    const h = harness();
    const session = createContinuousSpeechSession({ grant: invalid, stream: {} as MediaStream,
      onStatus() {}, onHypothesis: () => assert.fail("unexpected hypothesis") }, h.dependencies);
    await assert.rejects(session.connect(), /invalid/);
    assert.equal(FakeWebSocket.instances.length, 0);
  }

  const controller = new AbortController();
  let resolveCapture!: (capture: { close(): void; setMuted(muted: boolean): void }) => void;
  let closeCalls = 0;
  const h = harness(() => new Promise(resolve => { resolveCapture = resolve; }));
  const session = createContinuousSpeechSession({ grant: grant(), stream: {} as MediaStream, signal: controller.signal,
    onStatus() {}, onHypothesis: () => assert.fail("unexpected hypothesis") }, h.dependencies);
  const connecting = assert.rejects(session.connect(), error => error instanceof DOMException && error.name === "AbortError");
  const socket = FakeWebSocket.instances[0]; socket.open();
  socket.message({ type: "status", state: "ready", sessionEpoch: "epoch-abort" });
  controller.abort();
  resolveCapture({ close: () => { closeCalls += 1; }, setMuted() {} });
  await connecting;
  await Promise.resolve();
  assert.equal(closeCalls, 1);
  assert.equal(FakeWebSocket.instances.length, 1);
});

test("uses the 10 second connection bound and the grant duration bound", async () => {
  const h = harness();
  const statuses: Array<{ state: string; reason?: string }> = [];
  const session = createContinuousSpeechSession({ grant: grant({ maxDurationSeconds: 37 }), stream: {} as MediaStream,
    onStatus: status => statuses.push(status), onHypothesis: () => assert.fail("unexpected hypothesis") }, h.dependencies);
  const connecting = assert.rejects(session.connect(), /timed out/);
  assert.deepEqual([...h.timers.values()].map(timer => timer.delay).sort((a, b) => a - b), [10_000, 37_000, 60_000]);
  [...h.timers.values()].find(timer => timer.delay === 10_000)!.callback();
  await connecting;
  assert.equal(statuses.at(-1)?.reason, "provider");
});
