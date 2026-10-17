# Energy VAD helpers shared by the India benches (r2-latency-india, 2026-10-17). 20 ms frames.
import numpy as np, soundfile as sf
def load(path):
  a, sr = sf.read(path, dtype='int16')
  if a.ndim > 1: a = a[:, 0]
  return a, sr
def speech_frames(a, sr, rel_db=35.0):
  fr = int(0.02 * sr); n = len(a) // fr
  x = a[:n * fr].astype(np.float32).reshape(n, fr) / 32768.0
  db = 20 * np.log10(np.sqrt((x ** 2).mean(axis=1)) + 1e-9)
  return db > (db.max() - rel_db)     # boolean per 20 ms frame
def last_speech_frame(a, sr):
  sp = speech_frames(a, sr); idx = np.where(sp)[0]
  return int(idx[-1]) if len(idx) else len(sp) - 1
def gaps(a, sr, min_ms=200):
  sp = speech_frames(a, sr); idx = np.where(sp)[0]; out = []; run = 0; start = None
  for i in range(idx[0], idx[-1] + 1):
    if not sp[i]:
      if run == 0: start = i
      run += 1
    else:
      if run * 20 >= min_ms: out.append((start * 20, run * 20))
      run = 0
  return out   # list of (gap_start_ms, gap_len_ms)
