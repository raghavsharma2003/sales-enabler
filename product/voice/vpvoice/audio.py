# Audio helpers, ported from voicelab/server/audio.py and phone.py: streaming resamplers, G.711 mu-law, the VAD
# (Silero v5 when onnxruntime and the model are present, else an energy VAD with the same interface), and the
# two-channel call recorder that keeps the agent track on the caller's playback clock.
import os, time, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
FRAME_BYTES = 640          # 20 ms of 16 kHz PCM16


class Resampler:
    """Streaming linear-interpolation resampler for int16 mono (continuous across chunks)."""
    def __init__(self, src, dst):
        self.src, self.dst = src, dst; self.pos = 0.0; self.last = 0.0

    def __call__(self, pcm: bytes) -> bytes:
        if self.src == self.dst or not pcm: return pcm
        x = np.frombuffer(pcm[:len(pcm) // 2 * 2], dtype='<i2').astype(np.float32)
        if not len(x): return b''
        xx = np.concatenate([[self.last], x])
        step = self.src / self.dst
        idx = np.arange(self.pos + 1.0, len(xx) - 1 + 1e-9, step)
        if len(idx) == 0:
            self.pos -= len(x); self.last = x[-1]; return b''
        i0 = np.floor(idx).astype(int); f = idx - i0
        i1 = np.minimum(i0 + 1, len(xx) - 1)
        y = xx[i0] * (1 - f) + xx[i1] * f
        self.pos = idx[-1] + step - len(x) - 1.0
        self.last = x[-1]
        return np.clip(y, -32768, 32767).astype('<i2').tobytes()


# ---- G.711 mu-law (phone lines)
def ulaw_decode(b: bytes) -> np.ndarray:
    u = (~np.frombuffer(b, dtype=np.uint8)).astype(np.int32)
    t = (((u & 0x0F) << 3) + 0x84) << ((u & 0x70) >> 4)
    return np.where(u & 0x80, 0x84 - t, t - 0x84).astype(np.int16)


def ulaw_encode(x: np.ndarray) -> bytes:
    x = x.astype(np.int32); sign = np.where(x < 0, 0x80, 0)
    m = np.minimum(np.abs(x), 32635) + 0x84
    exp = np.floor(np.log2(m >> 7)).astype(np.int32)
    man = (m >> (exp + 3)) & 0x0F
    return (~(sign | (exp << 4) | man) & 0xFF).astype(np.uint8).tobytes()


# ---- resamplers with a real low-pass (plain interpolation would alias the 4-12 kHz band into the call)
def lowpass(taps, cutoff, fs):
    n = np.arange(taps) - (taps - 1) / 2
    h = np.sinc(2 * cutoff / fs * n) * np.hamming(taps)
    return (h / h.sum()).astype(np.float32)


class FIR:
    def __init__(self, h): self.h = h; self.z = np.zeros(len(h) - 1, dtype=np.float32)

    def __call__(self, x):
        xx = np.concatenate([self.z, x]); self.z = xx[-(len(self.h) - 1):]
        return np.convolve(xx, self.h, mode='valid')


class Down24to8:
    def __init__(self): self.f = FIR(lowpass(95, 3600, 24000)); self.ph = 0

    def __call__(self, pcm24: bytes) -> np.ndarray:
        if not pcm24: return np.zeros(0, dtype=np.int16)
        y = self.f(np.frombuffer(pcm24[:len(pcm24) // 2 * 2], dtype='<i2').astype(np.float32))
        out = y[self.ph::3]; self.ph = (self.ph - len(y)) % 3
        return np.clip(out, -32768, 32767).astype(np.int16)


class Up8to16:
    def __init__(self): self.f = FIR(lowpass(63, 3800, 16000))

    def __call__(self, x8: np.ndarray) -> bytes:
        z = np.zeros(len(x8) * 2, dtype=np.float32); z[::2] = x8
        return np.clip(self.f(z) * 2, -32768, 32767).astype('<i2').tobytes()


# ---- VAD
class _Hysteresis:
    """Shared speech/silence state machine. Subclasses give a speech probability per 512-sample chunk.
    feed() returns events ('start', sample_index) / ('end', sample_index). Thresholds tighten while the agent is
    speaking (echo / backchannel guard: strict)."""
    CH = 512

    def __init__(self, on=0.5, off=0.35, min_speech_ms=96, min_silence_ms=160):
        self.buf = np.zeros(0, dtype=np.float32); self.n = 0
        self.on, self.off = on, off; self.min_speech = min_speech_ms * 16; self.min_sil = min_silence_ms * 16
        self.speaking = False; self.run_sp = 0; self.run_sil = 0; self.cand = None
        self.last_end = 0; self.seg_start = 0; self.prob = 0.0; self.strict = False

    def prob_of(self, x): raise NotImplementedError

    def feed(self, pcm: bytes):
        ev = []
        x = np.frombuffer(pcm[:len(pcm) // 2 * 2], dtype='<i2').astype(np.float32) / 32768.0
        self.buf = np.concatenate([self.buf, x])
        while len(self.buf) >= self.CH:
            ch = self.buf[:self.CH]; self.buf = self.buf[self.CH:]
            p = self.prob_of(ch); self.prob = p; start = self.n; self.n += self.CH
            on = 0.7 if self.strict else self.on
            if not self.speaking:
                if p >= on:
                    if self.cand is None: self.cand = start
                    self.run_sp += self.CH
                    if self.run_sp >= (self.min_speech * (2 if self.strict else 1)):
                        self.speaking = True; self.seg_start = self.cand; self.run_sil = 0; ev.append(('start', self.cand))
                else:
                    self.run_sp = 0; self.cand = None
            else:
                if p < self.off:
                    self.run_sil += self.CH
                    if self.run_sil >= self.min_sil:
                        self.speaking = False; end = self.n - self.run_sil; self.last_end = end
                        self.run_sp = 0; self.cand = None; ev.append(('end', end))
                else:
                    self.run_sil = 0
        return ev

    def silence_ms(self):
        if self.speaking: return 0.0
        return (self.n - self.last_end) / 16.0

    def speech_ms(self):
        return (self.n - self.seg_start) / 16.0 if self.speaking else 0.0


class EnergyVAD(_Hysteresis):
    """Fallback when Silero is unavailable (and in tests): RMS against a floor, mapped to 0..1."""
    def __init__(self, floor_db=-45.0, **kw):
        super().__init__(**kw); self.floor = 10 ** (floor_db / 20)

    def prob_of(self, x):
        rms = float(np.sqrt(np.mean(x * x)) + 1e-9)
        return min(1.0, max(0.0, (20 * np.log10(rms / self.floor)) / 20.0))


_SESSION = None


def _silero_path():
    for p in (os.environ.get('VP_VAD_MODEL'), os.path.join(HERE, 'models', 'silero_vad.onnx'),
              os.path.join(HERE, '..', '..', '..', 'voicelab', 'server', 'models', 'silero_vad.onnx')):
        if p and os.path.exists(p): return p
    return None


class SileroVAD(_Hysteresis):
    def __init__(self, **kw):
        global _SESSION
        super().__init__(**kw)
        if _SESSION is None:
            import onnxruntime as ort
            so = ort.SessionOptions(); so.intra_op_num_threads = 1; so.inter_op_num_threads = 1
            _SESSION = ort.InferenceSession(_silero_path(), sess_options=so, providers=['CPUExecutionProvider'])
        self.s = _SESSION; self.state = np.zeros((2, 1, 128), dtype=np.float32); self.ctx = np.zeros(64, dtype=np.float32)

    def prob_of(self, x):
        inp = np.concatenate([self.ctx, x])[None, :].astype(np.float32)
        out, self.state = self.s.run(None, {'input': inp, 'state': self.state, 'sr': np.array(16000, dtype=np.int64)})
        self.ctx = x[-64:]
        return float(out[0][0])


def make_vad():
    if os.environ.get('VP_VAD') != 'energy' and _silero_path():
        try:
            return SileroVAD()
        except Exception:
            pass
    return EnergyVAD()


class Recorder:
    """Two-channel recording at 16 kHz: left = caller as received, right = agent placed on the playback clock the far
    end follows (audio plays back-to-back from when it is sent; a flush cuts what was not yet played)."""
    def __init__(self, clock=time.monotonic, enabled=True):
        self.clock = clock; self.t0 = clock(); self.enabled = enabled
        self.caller = bytearray(); self.agent = np.zeros(16000 * 60 if enabled else 0, dtype=np.int16)
        self.agent_end = 0; self.play_until = 0.0

    def stop(self):
        """Recording refused (RD10): keep nothing, record nothing more. The playback clock keeps running."""
        self.enabled = False; self.caller = bytearray(); self.agent = np.zeros(0, dtype=np.int16); self.agent_end = 0

    def add_caller(self, pcm16k):
        if self.enabled: self.caller += pcm16k

    def add_agent(self, pcm16k, now):
        start_t = max(now, self.play_until)
        n = len(pcm16k) // 2
        if self.enabled:
            y = np.frombuffer(pcm16k[:n * 2], dtype='<i2')
            i0 = int((start_t - self.t0) * 16000); need = i0 + n
            if need > len(self.agent):
                self.agent = np.concatenate([self.agent, np.zeros(max(need - len(self.agent), 16000 * 30), dtype=np.int16)])
            self.agent[i0:need] = y; self.agent_end = max(self.agent_end, need)
        self.play_until = start_t + n / 16000.0
        return start_t

    def flush(self, now):
        cut = int((now - self.t0) * 16000)
        if self.enabled and cut < self.agent_end: self.agent[cut:self.agent_end] = 0; self.agent_end = cut
        self.play_until = min(self.play_until, now)

    def write(self, path):
        c = np.frombuffer(bytes(self.caller), dtype='<i2')
        n = max(len(c), self.agent_end)
        st = np.zeros((n, 2), dtype=np.int16); st[:len(c), 0] = c; st[:self.agent_end, 1] = self.agent[:self.agent_end]
        with wave.open(path, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(16000); w.writeframes(st.tobytes())
        return n / 16000.0
