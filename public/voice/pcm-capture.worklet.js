const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320;
const LOW_PASS_HZ = 7200;
const FIR_TAPS = 63;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sourceIndex = -1;
    this.nextOutputAt = 0;
    this.previousSample = 0;
    this.frame = new ArrayBuffer(FRAME_SAMPLES * 2);
    this.frameView = new DataView(this.frame);
    this.frameIndex = 0;
    this.nextFrameStart = 0;
    this.muted = false;
    this.epoch = 0;
    this.stopped = false;
    this.filterCoefficients = sampleRate > TARGET_SAMPLE_RATE ? PcmCaptureProcessor.lowPassCoefficients(sampleRate) : null;
    this.filterHistory = this.filterCoefficients ? new Float32Array(this.filterCoefficients.length) : null;
    this.filterIndex = 0;
    this.port.onmessage = event => {
      const message = event.data;
      if (message?.type === "close") {
        this.stopped = true;
        this.frameIndex = 0;
      } else if (message?.type === "set-muted" && typeof message.muted === "boolean" && Number.isSafeInteger(message.epoch)) {
        this.muted = message.muted;
        this.epoch = message.epoch;
        // Remove audio already waiting in a partial frame when mute begins. Keeping
        // its sample positions preserves the continuous output timeline.
        if (this.muted) for (let index = 0; index < this.frameIndex; index += 1) this.frameView.setInt16(index * 2, 0, true);
        // Audio captured during mute must not reappear later through filter history.
        // Resetting on both edges also removes the interpolation sample immediately
        // before the boundary without changing the output sample clock.
        this.filterHistory?.fill(0);
        this.filterIndex = 0;
        this.previousSample = 0;
      }
    };
  }

  static lowPassCoefficients(sourceRate) {
    const coefficients = new Float64Array(FIR_TAPS);
    const center = (FIR_TAPS - 1) / 2;
    const normalizedCutoff = LOW_PASS_HZ / sourceRate;
    let sum = 0;
    for (let index = 0; index < FIR_TAPS; index += 1) {
      const distance = index - center;
      const sinc = distance === 0
        ? 2 * normalizedCutoff
        : Math.sin(2 * Math.PI * normalizedCutoff * distance) / (Math.PI * distance);
      const window = 0.54 - 0.46 * Math.cos(2 * Math.PI * index / (FIR_TAPS - 1));
      coefficients[index] = sinc * window;
      sum += coefficients[index];
    }
    // Unity DC gain keeps speech-band amplitude stable.
    for (let index = 0; index < coefficients.length; index += 1) coefficients[index] /= sum;
    return coefficients;
  }

  static finiteSample(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(-1, Math.min(1, value));
  }

  filter(sample) {
    if (!this.filterCoefficients || !this.filterHistory) return sample;
    this.filterHistory[this.filterIndex] = sample;
    let filtered = 0;
    let historyIndex = this.filterIndex;
    for (let tap = 0; tap < this.filterCoefficients.length; tap += 1) {
      filtered += this.filterCoefficients[tap] * this.filterHistory[historyIndex];
      historyIndex = historyIndex === 0 ? this.filterHistory.length - 1 : historyIndex - 1;
    }
    this.filterIndex = (this.filterIndex + 1) % this.filterHistory.length;
    return filtered;
  }

  emit(sample) {
    const finite = this.muted ? 0 : PcmCaptureProcessor.finiteSample(sample);
    const pcm = Math.round(finite < 0 ? finite * 32768 : finite * 32767);
    this.frameView.setInt16(this.frameIndex * 2, pcm, true);
    this.frameIndex += 1;
    if (this.frameIndex !== FRAME_SAMPLES) return;

    const completed = this.frame;
    this.frame = new ArrayBuffer(FRAME_SAMPLES * 2);
    this.frameView = new DataView(this.frame);
    this.frameIndex = 0;
    const sampleStart = this.nextFrameStart;
    this.nextFrameStart += FRAME_SAMPLES;
    this.port.postMessage({ type: "frame", pcm: completed, epoch: this.epoch, sampleStart }, [completed]);
  }

  resample(sample) {
    this.sourceIndex += 1;
    if (this.sourceIndex === 0) {
      this.previousSample = sample;
      this.emit(sample);
      this.nextOutputAt = sampleRate / TARGET_SAMPLE_RATE;
      return;
    }

    while (this.nextOutputAt <= this.sourceIndex) {
      const position = this.nextOutputAt - (this.sourceIndex - 1);
      this.emit(this.previousSample + (sample - this.previousSample) * position);
      this.nextOutputAt += sampleRate / TARGET_SAMPLE_RATE;
    }
    this.previousSample = sample;
  }

  process(inputs) {
    if (this.stopped) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    const length = channels[0]?.length || 0;
    for (let index = 0; index < length; index += 1) {
      let mono = 0;
      if (!this.muted) for (const channel of channels) mono += PcmCaptureProcessor.finiteSample(channel[index]);
      this.resample(this.filter(mono / channels.length));
    }
    // The output remains zero-filled. A zero-gain sink in the owning AudioContext
    // keeps this worklet scheduled without looping microphone audio to speakers.
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
