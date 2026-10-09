import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import {
  PCM_CAPTURE_FRAME_BYTES,
  PCM_CAPTURE_FRAME_SAMPLES,
  startPcmCapture,
  type PcmCapture,
  type PcmCaptureFrameMetadata,
} from "../lib/voice/pcm-capture";

type WorkletFrame = { type: "frame"; pcm: ArrayBuffer; epoch: number; sampleStart: number };

function runWorklet(sourceRate: number, samples: Float32Array, chunkSizes = [128]) {
  const frames: WorkletFrame[] = [];
  let Processor: (new () => { process: (inputs: Float32Array[][]) => boolean; port: { onmessage?: (event: { data: unknown }) => void } }) | undefined;
  class WorkletBase {
    port = {
      onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
      postMessage: (message: WorkletFrame) => frames.push(message),
    };
  }
  vm.runInNewContext(readFileSync(resolve(process.cwd(), "public/voice/pcm-capture.worklet.js"), "utf8"), {
    AudioWorkletProcessor: WorkletBase,
    sampleRate: sourceRate,
    registerProcessor(name: string, constructor: typeof Processor) {
      assert.equal(name, "pcm-capture");
      Processor = constructor;
    },
  });
  assert.ok(Processor);
  const processor = new Processor();
  for (let offset = 0, chunk = 0; offset < samples.length; chunk += 1) {
    const length = Math.min(chunkSizes[chunk % chunkSizes.length], samples.length - offset);
    assert.equal(processor.process([[samples.subarray(offset, offset + length)]]), true);
    offset += length;
  }
  return { frames, processor };
}

function decode(frame: WorkletFrame) {
  const view = new DataView(frame.pcm);
  return Array.from({ length: frame.pcm.byteLength / 2 }, (_, index) => view.getInt16(index * 2, true));
}

for (const sourceRate of [44_100, 48_000]) {
  test(`audio worklet resamples ${sourceRate} Hz input into exact 20 ms PCM16 frames`, () => {
    const input = Float32Array.from({ length: sourceRate }, (_, index) => 0.8 * Math.sin(2 * Math.PI * 1_000 * index / sourceRate));
    const { frames } = runWorklet(sourceRate, input, [37, 128, 511, 64]);
    assert.equal(frames.length, 50);
    assert.deepEqual(frames.map(frame => frame.pcm.byteLength), Array(50).fill(PCM_CAPTURE_FRAME_BYTES));
    assert.deepEqual(frames.map(frame => frame.sampleStart), Array.from({ length: 50 }, (_, index) => index * PCM_CAPTURE_FRAME_SAMPLES));
    assert.equal(new Set(frames.map(frame => frame.pcm)).size, frames.length, "each callback buffer has unique ownership");

    const output = frames.flatMap(decode);
    assert.equal(output.length, 16_000);
    assert.ok(output.every(Number.isFinite));
    const peak = Math.max(...output.map(Math.abs)) / 32768;
    const rms = Math.sqrt(output.reduce((sum, value) => sum + (value / 32768) ** 2, 0) / output.length);
    assert.ok(peak > 0.79 && peak <= 0.8, `peak ${peak} preserves bounded amplitude`);
    assert.ok(rms > 0.55 && rms < 0.58, `RMS ${rms} preserves duration and energy`);
  });

  test(`audio worklet at ${sourceRate} Hz retains speech band and rejects a 12 kHz alias`, () => {
    const render = (frequency: number) => {
      const input = Float32Array.from({ length: sourceRate }, (_, index) => 0.8 * Math.sin(2 * Math.PI * frequency * index / sourceRate));
      const output = runWorklet(sourceRate, input, [128]).frames.flatMap(decode).slice(3_200);
      return Math.sqrt(output.reduce((sum, value) => sum + (value / 32768) ** 2, 0) / output.length);
    };
    const speechRms = render(1_000);
    const aliasRms = render(12_000);
    const attenuationDb = 20 * Math.log10(aliasRms / speechRms);
    assert.ok(speechRms > 0.54 && speechRms < 0.58, `1 kHz speech RMS ${speechRms} stays near the 0.566 input RMS`);
    assert.ok(attenuationDb < -40, `12 kHz alias attenuation ${attenuationDb.toFixed(1)} dB exceeds 40 dB`);
  });

  test(`audio worklet at ${sourceRate} Hz preserves FIR and resampler state across render quanta`, () => {
    const input = Float32Array.from({ length: sourceRate }, (_, index) =>
      0.55 * Math.sin(2 * Math.PI * 997 * index / sourceRate) + 0.2 * Math.sin(2 * Math.PI * 5_113 * index / sourceRate));
    const regular = runWorklet(sourceRate, input, [128]).frames.flatMap(decode);
    const irregular = runWorklet(sourceRate, input, [1, 17, 63, 255, 509]).frames.flatMap(decode);
    assert.deepEqual(irregular, regular);
  });
}

test("audio worklet clamps non-finite and out-of-range input and counts muted zero frames", () => {
  const input = new Float32Array(48_000);
  for (let index = 0; index < input.length; index += 1) input[index] = index < 16_000 ? 2 : index < 32_000 ? -2 : index % 2 ? Number.NaN : Number.POSITIVE_INFINITY;
  const { frames, processor } = runWorklet(48_000, input.subarray(0, 24_000));
  processor.port.onmessage?.({ data: { type: "set-muted", muted: true, epoch: 1 } });
  for (let offset = 24_000; offset < input.length; offset += 128) processor.process([[input.subarray(offset, Math.min(input.length, offset + 128))]]);

  assert.equal(frames.length, 50);
  const output = frames.flatMap(decode);
  assert.equal(Math.max(...output), 32767);
  assert.equal(Math.min(...output), -32768);
  assert.ok(output.every(value => Number.isFinite(value) && value >= -32768 && value <= 32767));
  assert.ok(frames.slice(25).flatMap(decode).every(value => value === 0), "muted frames remain in the sample timeline as silence");
  assert.deepEqual(frames.map(frame => frame.sampleStart), Array.from({ length: 50 }, (_, index) => index * 320));
});

test("audio worklet zeroes a partial frame at mute and resumes on the same sample clock", () => {
  const sourceRate = 48_000;
  const tone = (length: number, frequency: number) => Float32Array.from({ length }, (_, index) => 0.8 * Math.sin(2 * Math.PI * frequency * index / sourceRate));
  const { frames, processor } = runWorklet(sourceRate, tone(500, 1_000), [128]);
  assert.equal(frames.length, 0, "the pre-mute audio is still held in a partial frame");

  processor.port.onmessage?.({ data: { type: "set-muted", muted: true, epoch: 1 } });
  const mutedAudio = tone(4_800, 1_000);
  for (let offset = 0; offset < mutedAudio.length; offset += 73) processor.process([[mutedAudio.subarray(offset, Math.min(mutedAudio.length, offset + 73))]]);
  assert.ok(frames.length >= 5);
  assert.ok(frames.flatMap(decode).every(value => value === 0), "partial pre-mute samples and muted filter history are silent");

  processor.port.onmessage?.({ data: { type: "set-muted", muted: false, epoch: 2 } });
  const resumedAudio = tone(9_600, 1_000);
  for (let offset = 0; offset < resumedAudio.length; offset += 113) processor.process([[resumedAudio.subarray(offset, Math.min(resumedAudio.length, offset + 113))]]);
  assert.deepEqual(frames.map(frame => frame.sampleStart), Array.from({ length: frames.length }, (_, index) => index * 320));
  assert.ok(frames.slice(-4).flatMap(decode).some(value => Math.abs(value) > 20_000), "speech returns after fresh post-mute filter input");
});

type Listener = (event: { data?: unknown }) => void;

class FakePort {
  listeners = new Map<string, Set<Listener>>();
  sent: unknown[] = [];
  started = false;
  closed = false;
  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) || new Set<Listener>();
    listeners.add(listener); this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  postMessage(message: unknown) { this.sent.push(message); }
  start() { this.started = true; }
  close() { this.closed = true; }
  emit(type: string, data?: unknown) { for (const listener of this.listeners.get(type) || []) listener({ data }); }
}

class FakeNode {
  static instances: FakeNode[] = [];
  port = new FakePort();
  listeners = new Map<string, Set<Listener>>();
  disconnects = 0;
  connects: unknown[] = [];
  constructor(_context: AudioContext, readonly name: string, readonly options: AudioWorkletNodeOptions) { FakeNode.instances.push(this); }
  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) || new Set<Listener>(); listeners.add(listener); this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  connect(target: unknown) { this.connects.push(target); return target; }
  disconnect() { this.disconnects += 1; }
  emit(type: string) { for (const listener of this.listeners.get(type) || []) listener({}); }
}

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void };
function deferred(): Deferred {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

class FakeContext {
  static instances: FakeContext[] = [];
  static constructorOptions: Array<AudioContextOptions | undefined> = [];
  static rejectRequestedRate = false;
  static resumeGate: Promise<void> = Promise.resolve();
  static moduleGate: Promise<void> = Promise.resolve();
  state: AudioContextState = "suspended";
  destination = {} as AudioDestinationNode;
  modules: string[] = [];
  closes = 0;
  source = { connects: [] as unknown[], disconnects: 0, connect: (target: unknown) => { this.source.connects.push(target); return target; }, disconnect: () => { this.source.disconnects += 1; } };
  sink = { gain: { value: 1 }, connects: [] as unknown[], disconnects: 0, connect: (target: unknown) => { this.sink.connects.push(target); return target; }, disconnect: () => { this.sink.disconnects += 1; } };
  audioWorklet = { addModule: async (url: string) => { this.modules.push(url); await FakeContext.moduleGate; } };
  constructor(options?: AudioContextOptions) {
    FakeContext.constructorOptions.push(options);
    if (options?.sampleRate && FakeContext.rejectRequestedRate) throw new Error("requested rate unavailable");
    FakeContext.instances.push(this);
  }
  async resume() { await FakeContext.resumeGate; this.state = "running"; }
  async close() { this.closes += 1; this.state = "closed"; }
  createMediaStreamSource(_stream: MediaStream) { return this.source as unknown as MediaStreamAudioSourceNode; }
  createGain() { return this.sink as unknown as GainNode; }
}

async function lifecycleHarness() {
  const audioContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  const audioWorkletNode = Object.getOwnPropertyDescriptor(globalThis, "AudioWorkletNode");
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeContext });
  Object.defineProperty(globalThis, "AudioWorkletNode", { configurable: true, value: FakeNode });
  FakeContext.instances = []; FakeContext.constructorOptions = []; FakeContext.rejectRequestedRate = false;
  FakeContext.resumeGate = Promise.resolve(); FakeContext.moduleGate = Promise.resolve(); FakeNode.instances = [];
  const track = { enabled: false, stops: 0, stop() { this.stops += 1; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  return {
    stream, track,
    restore() {
      if (audioContext) Object.defineProperty(globalThis, "AudioContext", audioContext); else Reflect.deleteProperty(globalThis, "AudioContext");
      if (audioWorkletNode) Object.defineProperty(globalThis, "AudioWorkletNode", audioWorkletNode); else Reflect.deleteProperty(globalThis, "AudioWorkletNode");
    },
  };
}

test("capture reuses the caller stream, emits immutable snapshots and zeroes delayed mute epochs", async () => {
  const harness = await lifecycleHarness();
  const received: Array<{ pcm: ArrayBuffer; metadata: PcmCaptureFrameMetadata }> = [];
  let capture: PcmCapture | undefined;
  try {
    capture = await startPcmCapture({ stream: harness.stream, onFailure: assert.fail, onFrame: (pcm, metadata) => received.push({ pcm, metadata }) });
    const context = FakeContext.instances[0], node = FakeNode.instances[0];
    assert.equal(FakeContext.constructorOptions[0]?.sampleRate, 16_000);
    assert.deepEqual(context.modules, ["/voice/pcm-capture.worklet.js"]);
    assert.equal(context.sink.gain.value, 0);
    assert.equal(node.name, "pcm-capture");
    assert.equal(node.port.started, true);

    const original = new ArrayBuffer(PCM_CAPTURE_FRAME_BYTES);
    new DataView(original).setInt16(0, 1234, true);
    node.port.emit("message", { type: "frame", pcm: original, epoch: 0, sampleStart: 0 });
    new DataView(original).setInt16(0, 0, true);
    assert.equal(new DataView(received[0].pcm).getInt16(0, true), 1234, "capture retains no mutable view into the callback snapshot");
    assert.deepEqual(received[0].metadata, { sampleStart: 0, sampleCount: 320 });
    assert.equal(Object.isFrozen(received[0].metadata), true);

    capture.setMuted(true);
    assert.deepEqual(node.port.sent.at(-1), { type: "set-muted", muted: true, epoch: 1 });
    node.port.emit("message", { type: "frame", pcm: original, epoch: 0, sampleStart: 320 });
    assert.ok(Array.from(new Uint8Array(received[1].pcm)).every(value => value === 0));
    capture.setMuted(false);
    node.port.emit("message", { type: "frame", pcm: original, epoch: 1, sampleStart: 640 });
    assert.ok(Array.from(new Uint8Array(received[2].pcm)).every(value => value === 0), "a delayed pre-unmute frame cannot surface as audio");
    assert.deepEqual(received.map(frame => frame.metadata.sampleStart), [0, 320, 640]);

    capture.close(); capture.close();
    await Promise.resolve();
    assert.equal(context.closes, 1);
    assert.equal(context.source.disconnects, 1);
    assert.equal(context.sink.disconnects, 1);
    assert.equal(node.disconnects, 1);
    assert.equal(node.port.closed, true);
    assert.equal(node.port.listeners.get("message")?.size, 0);
    assert.equal(node.port.listeners.get("messageerror")?.size, 0);
    assert.equal(node.listeners.get("processorerror")?.size, 0);
    assert.equal(harness.track.enabled, false);
    assert.equal(harness.track.stops, 0);
  } finally { capture?.close(); harness.restore(); }
});

test("capture falls back to the actual device rate when a 16 kHz AudioContext is rejected", async () => {
  const harness = await lifecycleHarness();
  FakeContext.rejectRequestedRate = true;
  let capture: PcmCapture | undefined;
  try {
    capture = await startPcmCapture({ stream: harness.stream, onFrame: () => {}, onFailure: assert.fail });
    assert.deepEqual(FakeContext.constructorOptions.map(options => options?.sampleRate), [16_000, undefined]);
    assert.equal(FakeContext.instances.length, 1);
  } finally { capture?.close(); harness.restore(); }
});

test("capture can close idempotently from inside a frame callback", async () => {
  const harness = await lifecycleHarness();
  let capture: PcmCapture | undefined;
  let callbacks = 0;
  try {
    capture = await startPcmCapture({
      stream: harness.stream,
      onFailure: assert.fail,
      onFrame() { callbacks += 1; capture?.close(); capture?.close(); },
    });
    const node = FakeNode.instances[0];
    node.port.emit("message", { type: "frame", pcm: new ArrayBuffer(PCM_CAPTURE_FRAME_BYTES), epoch: 0, sampleStart: 0 });
    node.port.emit("message", { type: "frame", pcm: new ArrayBuffer(PCM_CAPTURE_FRAME_BYTES), epoch: 0, sampleStart: 320 });
    await Promise.resolve();
    assert.equal(callbacks, 1);
    assert.equal(FakeContext.instances[0].closes, 1);
    assert.equal(harness.track.stops, 0);
  } finally { capture?.close(); harness.restore(); }
});

for (const phase of ["resume", "module"] as const) {
  test(`abort safely closes capture while ${phase} is awaiting`, async () => {
    const harness = await lifecycleHarness();
    const controller = new AbortController();
    const gate = deferred();
    if (phase === "resume") FakeContext.resumeGate = gate.promise;
    else FakeContext.moduleGate = gate.promise;
    try {
      const starting = startPcmCapture({ stream: harness.stream, signal: controller.signal, onFrame: () => {}, onFailure: assert.fail });
      await Promise.resolve();
      if (phase === "module") await Promise.resolve();
      controller.abort();
      await assert.rejects(starting, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
      await Promise.resolve();
      assert.equal(FakeContext.instances[0].closes, 1);
      assert.equal(harness.track.stops, 0);
    } finally { gate.resolve(); harness.restore(); }
  });
}

test("callback and processor failures close once and report bounded messages", async () => {
  const harness = await lifecycleHarness();
  const failures: string[] = [];
  let capture: PcmCapture | undefined;
  try {
    capture = await startPcmCapture({ stream: harness.stream, onFrame: () => { throw new Error("private callback detail"); }, onFailure: message => failures.push(message) });
    const node = FakeNode.instances[0];
    node.port.emit("message", { type: "frame", pcm: new ArrayBuffer(PCM_CAPTURE_FRAME_BYTES), epoch: 0, sampleStart: 0 });
    node.emit("processorerror");
    await Promise.resolve();
    assert.deepEqual(failures, ["Microphone PCM capture stopped because its frame callback failed."]);
    assert.equal(FakeContext.instances[0].closes, 1);
    assert.equal(harness.track.stops, 0);
  } finally { capture?.close(); harness.restore(); }
});

test("unsupported AudioWorklet fails without a ScriptProcessor fallback", async () => {
  const audioContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  const audioWorkletNode = Object.getOwnPropertyDescriptor(globalThis, "AudioWorkletNode");
  const failures: string[] = [];
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeContext });
  Reflect.deleteProperty(globalThis, "AudioWorkletNode");
  try {
    await assert.rejects(startPcmCapture({ stream: {} as MediaStream, onFrame: () => {}, onFailure: message => failures.push(message) }), /needs AudioWorklet support/);
    assert.deepEqual(failures, ["Continuous speech recognition needs AudioWorklet support in this browser."]);
  } finally {
    if (audioContext) Object.defineProperty(globalThis, "AudioContext", audioContext); else Reflect.deleteProperty(globalThis, "AudioContext");
    if (audioWorkletNode) Object.defineProperty(globalThis, "AudioWorkletNode", audioWorkletNode); else Reflect.deleteProperty(globalThis, "AudioWorkletNode");
  }
});
