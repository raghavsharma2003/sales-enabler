# Real-time STT turn latency (l8-azure-bench, 2026-10-17): Azure Speech SDK continuous recognition, push stream
# fed in 20 ms frames at real-time pace, then 2.5 s of silence. One recognizer per utterance (sequential).
# Measures: first partial after speech start, and final-result latency after the last speech frame was pushed
# (= what a voice agent waits for before it can reply, before any LLM/TTS). Default segmentation silence timeout,
# plus an arm with Speech_SegmentationSilenceTimeoutMs=300.
# Usage: python rt_latency.py MANIFEST AUDIO_DIR BAND OUT_CSV N_PER_SET
import os, sys, csv, time, threading, random, json
import numpy as np, soundfile as sf
import azure.cognitiveservices.speech as sp

MAN, AUD, BAND, OUT, NPER = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
rows = list(csv.DictReader(open(MAN, encoding='utf-8')))
rng = random.Random(11)
pick = []
for s, lang in [('kathbath', 'hi'), ('mucs_hien', 'hi-en'), ('nptel_en', 'en'), ('kathbath', 'ta')]:
  c = [r for r in rows if r['set'] == s and r['lang'] == lang]; rng.shuffle(c); pick += c[:NPER]

def one(r, seg_ms):
  a, sr = sf.read(os.path.join(AUD, BAND, r['uid'] + '.wav'), dtype='int16'); assert sr == 16000
  cfg = sp.SpeechConfig(subscription=os.environ['VP_AI_KEY'], region='southeastasia'); cfg.set_proxy('127.0.0.1', 43273)
  cfg.speech_recognition_language = r['locale'] or 'hi-IN'
  if seg_ms: cfg.set_property(sp.PropertyId.Speech_SegmentationSilenceTimeoutMs, str(seg_ms))
  fmt = sp.audio.AudioStreamFormat(samples_per_second=16000, bits_per_sample=16, channels=1)
  stream = sp.audio.PushAudioInputStream(stream_format=fmt)
  rec = sp.SpeechRecognizer(speech_config=cfg, audio_config=sp.audio.AudioConfig(stream=stream))
  ev = {'first_partial': None, 'finals': [], 'texts': []}; stopped = threading.Event()
  def on_partial(e):
    if ev['first_partial'] is None and e.result.text: ev['first_partial'] = time.perf_counter()
  def on_final(e):
    if e.result.reason == sp.ResultReason.RecognizedSpeech and e.result.text:
      ev['finals'].append(time.perf_counter()); ev['texts'].append(e.result.text)
  rec.recognizing.connect(on_partial); rec.recognized.connect(on_final)
  rec.session_stopped.connect(lambda e: stopped.set()); rec.canceled.connect(lambda e: stopped.set())
  rec.start_continuous_recognition_async().get()
  frame = 320; t_start = time.perf_counter()
  # leading 300 ms silence so the first speech frame time is well defined
  sil = np.zeros(frame, dtype='int16')
  for i in range(15):
    stream.write(sil.tobytes()); time.sleep(max(0, t_start + (i + 1) * 0.02 - time.perf_counter()))
  t_speech0 = time.perf_counter(); n = 0
  for i in range(0, len(a), frame):
    stream.write(a[i:i + frame].tobytes()); n += 1
    time.sleep(max(0, t_speech0 + n * 0.02 - time.perf_counter()))
  t_speech_end = time.perf_counter()
  for i in range(125):
    stream.write(sil.tobytes()); time.sleep(max(0, t_speech_end + (i + 1) * 0.02 - time.perf_counter()))
  stream.close(); stopped.wait(timeout=10); rec.stop_continuous_recognition_async().get()
  fin_after = [t for t in ev['finals'] if t >= t_speech_end - 0.05]
  return {'uid': r['uid'], 'set': r['set'], 'lang': r['lang'], 'band': BAND, 'seg_timeout_ms': seg_ms or 'default', 'dur_s': r['dur_s'],
          'first_partial_ms': round((ev['first_partial'] - t_speech0) * 1000, 1) if ev['first_partial'] else None,
          'final_after_end_ms': round((fin_after[-1] - t_speech_end) * 1000, 1) if fin_after else None,
          'n_finals': len(ev['finals']), 'hyp': ' '.join(ev['texts']), 'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}

new = not os.path.exists(OUT); f = open(OUT, 'a', newline='', encoding='utf-8'); w = None
for r in pick:
  for seg in (None, 300):
    try: row = one(r, seg)
    except Exception as e: row = {'uid': r['uid'], 'set': r['set'], 'lang': r['lang'], 'band': BAND, 'seg_timeout_ms': seg or 'default', 'dur_s': r['dur_s'], 'first_partial_ms': None, 'final_after_end_ms': None, 'n_finals': 0, 'hyp': 'EXC ' + repr(e)[:200], 'ts': ''}
    if w is None:
      w = csv.DictWriter(f, fieldnames=list(row.keys()))
      if new: w.writeheader()
    w.writerow(row); f.flush(); print(row['uid'], row['seg_timeout_ms'], row['first_partial_ms'], row['final_after_end_ms'], row['hyp'][:60], flush=True)
