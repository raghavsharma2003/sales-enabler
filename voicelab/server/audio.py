# VP voice lab: audio helpers, the Silero VAD and the call recorder.
import os, wave, time
import numpy as np
import onnxruntime as ort

HERE = os.path.dirname(os.path.abspath(__file__))

class Resampler:
    """Streaming linear-interpolation resampler for int16 mono (continuous across chunks)."""
    def __init__(self, src, dst):
        self.src, self.dst = src, dst; self.pos = 0.0; self.last = 0.0
    def __call__(self, pcm: bytes) -> bytes:
        if self.src == self.dst or not pcm: return pcm
        x = np.frombuffer(pcm, dtype='<i2').astype(np.float32)
        xx = np.concatenate([[self.last], x])           # index 0 is the previous chunk's last sample
        step = self.src / self.dst
        idx = np.arange(self.pos + 1.0, len(xx) - 1 + 1e-9, step)   # +1: positions relative to the new chunk start
        if len(idx) == 0:
            self.pos -= len(x); self.last = x[-1]; return b''
        i0 = np.floor(idx).astype(int); f = idx - i0
        i1 = np.minimum(i0 + 1, len(xx) - 1)
        y = xx[i0] * (1 - f) + xx[i1] * f
        self.pos = idx[-1] + step - len(x) - 1.0
        self.last = x[-1]
        return np.clip(y, -32768, 32767).astype('<i2').tobytes()

def resample_once(pcm, src, dst):
    return Resampler(src, dst)(pcm)

_SESSION = None
def _session():
    global _SESSION
    if _SESSION is None:
        so = ort.SessionOptions(); so.intra_op_num_threads = 1; so.inter_op_num_threads = 1
        _SESSION = ort.InferenceSession(os.path.join(HERE, 'models', 'silero_vad.onnx'), sess_options=so, providers=['CPUExecutionProvider'])
    return _SESSION

class VAD:
    """Silero VAD v5 on 16 kHz int16 frames. feed() takes any number of bytes and returns a list of events:
    ('start', sample_index) when speech begins and ('end', sample_index) when it ends (index = first silent sample).
    Thresholds tighten while the agent is speaking (echo/backchannel guard)."""
    CH = 512
    def __init__(self, on=0.5, off=0.35, min_speech_ms=96, min_silence_ms=160):
        self.s = _session(); self.state = np.zeros((2, 1, 128), dtype=np.float32); self.ctx = np.zeros(64, dtype=np.float32)
        self.buf = np.zeros(0, dtype=np.float32); self.n = 0
        self.on, self.off = on, off; self.min_speech = min_speech_ms * 16; self.min_sil = min_silence_ms * 16
        self.speaking = False; self.run_sp = 0; self.run_sil = 0; self.cand = None
        self.last_end = 0; self.seg_start = 0; self.prob = 0.0; self.strict = False
    def _infer(self, x):
        inp = np.concatenate([self.ctx, x])[None, :].astype(np.float32)
        out, self.state = self.s.run(None, {'input': inp, 'state': self.state, 'sr': np.array(16000, dtype=np.int64)})
        self.ctx = x[-64:]
        return float(out[0][0])
    def feed(self, pcm: bytes):
        ev = []
        x = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
        self.buf = np.concatenate([self.buf, x])
        while len(self.buf) >= self.CH:
            ch = self.buf[:self.CH]; self.buf = self.buf[self.CH:]
            p = self._infer(ch); self.prob = p; start = self.n; self.n += self.CH
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
        """ms of silence since the last speech ended (0 while speaking)."""
        if self.speaking: return 0.0
        return (self.n - self.last_end) / 16.0
    def speech_ms(self):
        return (self.n - self.seg_start) / 16.0 if self.speaking else 0.0

class Recorder:
    """Two-channel call recording at 16 kHz: left = caller (as received), right = agent placed on the playback clock
    the client follows (audio plays back-to-back from when it is sent; a flush cuts what was not yet played)."""
    def __init__(self):
        self.t0 = time.monotonic(); self.caller = bytearray(); self.agent = np.zeros(16000 * 60, dtype=np.int16)
        self.agent_end = 0                # samples written on the agent track
        self.play_until = 0.0             # monotonic time the queued agent audio finishes
    def add_caller(self, pcm16k):
        self.caller += pcm16k
    def add_agent(self, pcm16k, now):
        start_t = max(now, self.play_until)
        y = np.frombuffer(pcm16k, dtype='<i2')
        i0 = int((start_t - self.t0) * 16000)
        need = i0 + len(y)
        if need > len(self.agent):
            self.agent = np.concatenate([self.agent, np.zeros(max(need - len(self.agent), 16000 * 30), dtype=np.int16)])
        self.agent[i0:need] = y; self.agent_end = max(self.agent_end, need)
        self.play_until = start_t + len(y) / 16000.0
        return start_t
    def flush(self, now):
        cut = int((now - self.t0) * 16000)
        if cut < self.agent_end: self.agent[cut:self.agent_end] = 0; self.agent_end = cut
        self.play_until = min(self.play_until, now)
    def write(self, path):
        c = np.frombuffer(bytes(self.caller), dtype='<i2')
        n = max(len(c), self.agent_end)
        st = np.zeros((n, 2), dtype=np.int16); st[:len(c), 0] = c; st[:self.agent_end, 1] = self.agent[:self.agent_end]
        with wave.open(path, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(16000); w.writeframes(st.tobytes())
        return n / 16000.0
