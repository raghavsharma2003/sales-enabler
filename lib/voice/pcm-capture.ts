export const PCM_CAPTURE_SAMPLE_RATE = 16_000 as const;
export const PCM_CAPTURE_FRAME_DURATION_MS = 20 as const;
export const PCM_CAPTURE_FRAME_SAMPLES = PCM_CAPTURE_SAMPLE_RATE * PCM_CAPTURE_FRAME_DURATION_MS / 1_000;
export const PCM_CAPTURE_FRAME_BYTES = PCM_CAPTURE_FRAME_SAMPLES * Int16Array.BYTES_PER_ELEMENT;

export type PcmCaptureFrameMetadata = Readonly<{
  /** Zero-based offset in the 16 kHz output timeline. Muted zero frames are included. */
  sampleStart: number;
  sampleCount: typeof PCM_CAPTURE_FRAME_SAMPLES;
}>;

export type PcmCaptureOptions = {
  /** The caller retains ownership of this already-acquired, echo-cancelled stream. */
  stream: MediaStream;
  /**
   * Receives one unique, little-endian PCM16 buffer per 20 ms frame. The capture
   * never reuses or mutates a buffer after this callback begins.
   */
  onFrame: (pcm: ArrayBuffer, metadata: PcmCaptureFrameMetadata) => void;
  onFailure: (message: string) => void;
  signal?: AbortSignal;
};

export type PcmCapture = {
  /** Releases capture resources without changing or stopping the caller-owned stream. */
  close: () => void;
  /** Emits zero-filled frames while muted without changing MediaStreamTrack.enabled. */
  setMuted: (muted: boolean) => void;
};

const WORKLET_URL = "/voice/pcm-capture.worklet.js";
const UNSUPPORTED_MESSAGE = "Continuous speech recognition needs AudioWorklet support in this browser.";
const START_FAILURE_MESSAGE = "Microphone PCM capture could not start.";
const PROCESSOR_FAILURE_MESSAGE = "Microphone PCM capture stopped because its audio processor failed.";
const CALLBACK_FAILURE_MESSAGE = "Microphone PCM capture stopped because its frame callback failed.";

function abortError() {
  return new DOMException("Microphone PCM capture was cancelled.", "AbortError");
}

function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(abortError());
    signal.addEventListener("abort", aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

function isAbort(error: unknown, signal?: AbortSignal) {
  return signal?.aborted || (error instanceof DOMException && error.name === "AbortError");
}

/**
 * Captures PCM from an existing browser microphone stream for a sidecar recognizer.
 * This function never requests microphone permission and never owns the stream tracks.
 */
export async function startPcmCapture(options: PcmCaptureOptions): Promise<PcmCapture> {
  const AudioContextConstructor = globalThis.AudioContext;
  const WorkletNodeConstructor = globalThis.AudioWorkletNode;
  let context: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let node: AudioWorkletNode | undefined;
  let sink: GainNode | undefined;
  let closed = false;
  let muted = false;
  let epoch = 0;
  let expectedSampleStart = 0;
  let failureReported = false;
  let abortListener: (() => void) | undefined;

  const close = () => {
    if (closed) return;
    closed = true;
    if (abortListener && options.signal) options.signal.removeEventListener("abort", abortListener);
    if (node) {
      node.removeEventListener("processorerror", processorError);
      node.port.removeEventListener("message", receiveFrame as EventListener);
      node.port.removeEventListener("messageerror", messageError);
      try { node.port.postMessage({ type: "close" }); } catch { /* The processor may already be gone. */ }
      try { node.port.close(); } catch { /* Older implementations may not expose close. */ }
      try { node.disconnect(); } catch { /* A partially constructed graph may already be disconnected. */ }
    }
    try { source?.disconnect(); } catch { /* A partially constructed graph may already be disconnected. */ }
    try { sink?.disconnect(); } catch { /* A partially constructed graph may already be disconnected. */ }
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  };

  const reportFailure = (message: string) => {
    if (failureReported) return;
    failureReported = true;
    try { options.onFailure(message); } catch { /* A failure observer must not strand audio resources. */ }
  };

  const fail = (message: string) => {
    if (closed) return;
    reportFailure(message);
    close();
  };

  function processorError() { fail(PROCESSOR_FAILURE_MESSAGE); }
  function messageError() { fail(PROCESSOR_FAILURE_MESSAGE); }
  function receiveFrame(event: MessageEvent<unknown>) {
    if (closed) return;
    const data = event.data as { type?: unknown; pcm?: unknown; epoch?: unknown; sampleStart?: unknown } | null;
    if (!data || data.type !== "frame" || !(data.pcm instanceof ArrayBuffer) || data.pcm.byteLength !== PCM_CAPTURE_FRAME_BYTES ||
        !Number.isSafeInteger(data.sampleStart) || data.sampleStart !== expectedSampleStart) {
      fail(PROCESSOR_FAILURE_MESSAGE);
      return;
    }
    const sampleStart = expectedSampleStart;
    expectedSampleStart += PCM_CAPTURE_FRAME_SAMPLES;
    // Copy at the trust boundary. The callback owns this snapshot and capture code
    // retains no mutable view that could change it later.
    const frame = muted || data.epoch !== epoch ? new ArrayBuffer(PCM_CAPTURE_FRAME_BYTES) : data.pcm.slice(0);
    const metadata = Object.freeze({ sampleStart, sampleCount: PCM_CAPTURE_FRAME_SAMPLES });
    try { options.onFrame(frame, metadata); }
    catch { fail(CALLBACK_FAILURE_MESSAGE); }
  }

  try {
    if (!AudioContextConstructor || !WorkletNodeConstructor) throw new Error(UNSUPPORTED_MESSAGE);
    if (options.signal?.aborted) throw abortError();
    // Prefer the browser's native resampler. Some implementations ignore or reject
    // the requested rate, so the worklet also owns an anti-aliased fallback path.
    try { context = new AudioContextConstructor({ sampleRate: PCM_CAPTURE_SAMPLE_RATE }); }
    catch { context = new AudioContextConstructor(); }
    if (!context.audioWorklet?.addModule) throw new Error(UNSUPPORTED_MESSAGE);

    abortListener = close;
    options.signal?.addEventListener("abort", abortListener, { once: true });

    await awaitWithAbort(context.resume(), options.signal);
    if (closed) throw abortError();
    await awaitWithAbort(context.audioWorklet.addModule(WORKLET_URL), options.signal);
    if (closed) throw abortError();

    source = context.createMediaStreamSource(options.stream);
    node = new WorkletNodeConstructor(context, "pcm-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
    });
    sink = context.createGain();
    sink.gain.value = 0;

    node.port.addEventListener("message", receiveFrame as EventListener);
    node.port.addEventListener("messageerror", messageError);
    node.addEventListener("processorerror", processorError);
    node.port.start();
    source.connect(node);
    node.connect(sink);
    sink.connect(context.destination);

    return {
      close,
      setMuted(nextMuted) {
        if (closed || muted === nextMuted) return;
        muted = nextMuted;
        epoch += 1;
        try { node?.port.postMessage({ type: "set-muted", muted, epoch }); }
        catch { fail(PROCESSOR_FAILURE_MESSAGE); }
      },
    };
  } catch (error) {
    const aborted = isAbort(error, options.signal);
    close();
    if (aborted) throw abortError();
    const message = error instanceof Error && error.message === UNSUPPORTED_MESSAGE ? UNSUPPORTED_MESSAGE : START_FAILURE_MESSAGE;
    reportFailure(message);
    throw new Error(message);
  }
}
