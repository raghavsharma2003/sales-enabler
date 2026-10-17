# r2-latency-india (2026-10-17): Azure real-time STT endpointing measured FROM the Central India VM.
# Caller clips = l4b battery personas P1 (urban Hinglish), P2 (Bhojpuri-Hindi), P4 (elderly slow Hindi, pauses up to
# 2.4 s), rendered through a G.711 phone channel (300-3400 Hz, 8 kHz mu-law round trip) and pushed as 8 kHz PCM16 in
# 20 ms frames at real-time pace: 300 ms silence, the clip, 3 s silence. One recognizer per clip, locale hi-IN.
# Arms (run in parallel threads): segmentation silence timeout 300/500/800 ms and 'Semantic' strategy in centralindia,
# plus 500 ms in southeastasia. Records every partial/final with wall time relative to the clip's last speech frame.
# Usage: python stt_bench_india.py AUDIO8K_DIR OUT_CSV
import os, sys, time, json, threading, random, glob
import numpy as np
import azure.cognitiveservices.speech as sp
from r2common import KEYS, SPEECH_REGION_KEY, Out, ts
from vadutil import load, last_speech_frame, gaps
ARMS = [('centralindia', 300), ('centralindia', 500), ('centralindia', 800), ('centralindia', 'semantic'), ('southeastasia', 500)]
def one(path, region, seg):
  a, sr = load(path); assert sr == 8000
  cfg = sp.SpeechConfig(subscription=KEYS[SPEECH_REGION_KEY[region]], region=region); cfg.speech_recognition_language = 'hi-IN'
  if seg == 'semantic': cfg.set_property(sp.PropertyId.Speech_SegmentationStrategy, 'Semantic')
  else: cfg.set_property(sp.PropertyId.Speech_SegmentationSilenceTimeoutMs, str(seg))
  fmt = sp.audio.AudioStreamFormat(samples_per_second=8000, bits_per_sample=16, channels=1); stream = sp.audio.PushAudioInputStream(stream_format=fmt)
  rec = sp.SpeechRecognizer(speech_config=cfg, audio_config=sp.audio.AudioConfig(stream=stream))
  ev = []; stopped = threading.Event(); err = []
  rec.recognizing.connect(lambda e: ev.append(('P', time.perf_counter(), e.result.text, None)))
  rec.recognized.connect(lambda e: ev.append(('F', time.perf_counter(), e.result.text, (e.result.offset + e.result.duration) / 1e4)) if e.result.reason == sp.ResultReason.RecognizedSpeech and e.result.text else None)
  rec.canceled.connect(lambda e: (err.append(str(e.cancellation_details.error_details)[:200]), stopped.set())); rec.session_stopped.connect(lambda e: stopped.set())
  rec.start_continuous_recognition_async().get()
  fr = 160; sil = np.zeros(fr, dtype='int16').tobytes(); lsf = last_speech_frame(a, sr)
  t0 = time.perf_counter(); k = 0
  def push(buf):
    nonlocal k
    stream.write(buf); k += 1; time.sleep(max(0, t0 + k * 0.02 - time.perf_counter()))
  for i in range(15): push(sil)
  t_speech0 = t0 + 15 * 0.02; t_end = None
  for j in range(0, len(a), fr):
    b = a[j:j + fr]
    if len(b) < fr: b = np.pad(b, (0, fr - len(b)))
    push(b.tobytes())
    if j // fr == lsf: t_end = time.perf_counter()
  if t_end is None: t_end = time.perf_counter()
  for i in range(150): push(sil)
  stream.close(); stopped.wait(timeout=8); rec.stop_continuous_recognition_async().get()
  rel = lambda t: round((t - t_end) * 1e3, 1)
  finals = [e for e in ev if e[0] == 'F']; partials = [e for e in ev if e[0] == 'P']
  fin_after = [e for e in finals if e[1] >= t_end - 0.02]
  g = gaps(a, sr)
  return {'clip': os.path.basename(path)[:-4], 'persona': os.path.basename(path)[:2], 'region': region, 'seg': seg, 'clip_s': round(len(a) / sr, 2),
          'internal_gaps_ms': ';'.join(str(x[1]) for x in g), 'max_gap_ms': max([x[1] for x in g], default=0),
          'first_partial_after_speech_start_ms': round((partials[0][1] - t_speech0) * 1e3, 1) if partials else None,
          'n_finals': len(finals), 'n_finals_during_speech': len([e for e in finals if e[1] < t_end - 0.02]),
          'first_final_rel_end_ms': rel(finals[0][1]) if finals else None,
          'final_after_end_ms': rel(fin_after[-1][1]) if fin_after else None,
          'last_partial_rel_end_ms': rel(partials[-1][1]) if partials else None,
          'hyp': ' | '.join(e[2] for e in finals), 'finals_json': json.dumps([(rel(e[1]), e[2]) for e in finals], ensure_ascii=False), 'err': ';'.join(err)}
if __name__ == '__main__':
  clips = sorted(glob.glob(os.path.join(sys.argv[1], 'P[124]_t*.wav'))); clips = [c for c in clips if 'clean' not in c]
  out = Out(sys.argv[2]); lock = threading.Lock()
  def worker(region, seg, seed):
    order = clips[:]; random.Random(seed).shuffle(order)
    for c in order:
      try: row = one(c, region, seg)
      except Exception as e: row = {'clip': os.path.basename(c), 'region': region, 'seg': seg, 'err': repr(e)[:200]}
      row['ts'] = ts()
      with lock:
        out.row(row); print(region, seg, row.get('clip'), row.get('n_finals_during_speech'), row.get('final_after_end_ms'), (row.get('hyp') or row.get('err') or '')[:50], flush=True)
  th = [threading.Thread(target=worker, args=(r, s, i)) for i, (r, s) in enumerate(ARMS)]
  [t.start() for t in th]; [t.join() for t in th]
