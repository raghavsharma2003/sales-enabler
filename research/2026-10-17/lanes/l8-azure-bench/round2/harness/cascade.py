# r2-latency-india (2026-10-17): minimal gateable streaming cascade, run ON the Central India VM.
#   caller audio (8 kHz phone-band PCM16, pushed at real-time pace in 20 ms frames, continuous line per session)
#   -> Azure real-time STT (centralindia, hi-IN, segmentation silence timeout = config) commits a turn on each final
#   -> streamed LLM (async content filter) with a say-first reply shape -> clause splitter -> code gate (gate.py)
#   -> Azure TTS (centralindia, hi-IN-SwaraNeural, 8 kHz mu-law, pre-opened websocket from a warm pool).
# Speculative configs also start LLM+TTS when the local energy VAD sees >= SPEC_MS of silence, using finals + the
# latest partial; audio is HELD until the STT final arrives and matches (else discarded and restarted).
# Turn handling: if the caller resumes before a response's audio is released, the response is cancelled (no cost to
# the caller); if audio was already released, that is a premature cut-in (counted) and the response is cancelled.
# Metric: wall time from the clip's last speech frame being pushed (caller end of speech) to the first TTS audio byte
# of the response that is released after that point. No telephone leg; no playback (so no echo).
# Usage: python cascade.py CONFIG OUT_TURNS_CSV OUT_RESP_CSV AUDIO8K_DIR PASSES PAUSE_REPEATS
import os, sys, time, json, threading, queue, re, random, difflib, unicodedata, html
import numpy as np, requests
import azure.cognitiveservices.speech as sp
from r2common import KEYS, LLMS, chat_url, Out, ts
from llm_prompt import SYSTEM
# opener in Devanagari so the hi-IN voice reads it natively (round 1's romanized opener pulled replies into Latin script)
FIRST = 'नमस्ते! मैं आशा, Suraksha Health से बात कर रही हूँ। आपकी health policy का renewal आ रहा है, उस बारे में दो मिनट बात कर सकते हैं?'
from vadutil import load, speech_frames
from gate import gate, SAFE

CONFIGS = {   # name: (segmentation ms, speculative?, LLM arm)
  'A_seg500_fast':        (500, False, 'FAST'),
  'B_seg800_fast':        (800, False, 'FAST'),
  'C_seg800_spec_fast':   (800, True,  'FAST'),
  'D_seg800_spec_quality':(800, True,  'QUALITY'),
  'E_seg500_spec_fast':   (500, True,  'FAST'),
  'F_seg800_spec_nano':   (800, True,  'sea-gs gpt-5.4-nano'),
}
FAST = os.environ.get('FAST_LLM', 'sin-std gpt-4.1-mini'); QUALITY = os.environ.get('QUALITY_LLM', 'frc-dzeu gpt-6-sol')
SPEC_MS = int(os.environ.get('SPEC_MS', '250'))
VOICE = 'hi-IN-SwaraNeural'; TTS_REGION = 'centralindia'
SHAPE = ("\n\nReply shape for this call (applies to every reply): write Hindi words in Devanagari and keep English words "
         "such as premium, policy, renewal, advisor in Latin script. Open each reply with a short first clause of two to four "
         "words that reacts to what the caller just said, then a comma or full stop, then the substance in one short sentence. "
         "If the caller's words look unfinished, as if they stopped mid-sentence, reply only with a two-word prompt to continue.")
SYS = SYSTEM + SHAPE
PERSONAS = {'P1': 'P1', 'P2': 'P2', 'P4': 'P4'}
BOUND = re.compile(r'[,.?!।;:—]')
def norm(s):
  s = unicodedata.normalize('NFC', s.lower()); return re.sub(r'[\W_]+', '', s)
def similar(a, b):
  na, nb = norm(a), norm(b)
  if not na or not nb: return False
  if re.findall(r'\d+', a) != re.findall(r'\d+', b): return False
  return difflib.SequenceMatcher(None, na, nb).ratio() >= 0.85
def ssml(t): return f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='hi-IN'><voice name='{VOICE}'>{html.escape(t)}</voice></speak>"

class Synth:
  def __init__(self):
    cfg = sp.SpeechConfig(subscription=KEYS['cin'], region=TTS_REGION); cfg.set_speech_synthesis_output_format(sp.SpeechSynthesisOutputFormat.Raw8Khz8BitMonoMULaw)
    self.s = sp.SpeechSynthesizer(speech_config=cfg, audio_config=None); self.c = sp.Connection.from_speech_synthesizer(self.s); self.c.open(True)
    self.owner = None; self.s.synthesizing.connect(self._chunk)
    self.s.speak_ssml_async(ssml('नमस्ते।')).get(); self.last_used = time.time()
  def _chunk(self, e):
    o = self.owner
    if o is not None: o.on_audio(len(e.result.audio_data))
class Pool:
  def __init__(self, n):
    self.free = [Synth() for _ in range(n)]; self.lock = threading.Lock(); self.cold = 0
  def get(self):
    with self.lock:
      if self.free: return self.free.pop()
    self.cold += 1; return Synth()
  def put(self, s):
    s.owner = None
    with self.lock: self.free.append(s)
  def replace(self, s):   # v2: drop a synthesizer whose stream was cancelled; warm a fresh one in the background
    def mk():
      try:
        n = Synth()
        with self.lock: self.free.append(n)
      except Exception: pass
    threading.Thread(target=mk, daemon=True).start()
  def keepalive(self):   # re-touch idle connections so a call never pays a reconnect
    with self.lock: idle = [s for s in self.free if time.time() - s.last_used > 120]
    for s in idle:
      try: s.s.speak_ssml_async(ssml('जी।')).get(); s.last_used = time.time()
      except Exception: pass

class Resp(threading.Thread):
  def __init__(self, ctl, rid, text, held, kind):
    super().__init__(daemon=True); self.ctl = ctl; self.rid = rid; self.text = text; self.held = held; self.kind = kind
    self.cancel_ev = threading.Event(); self.cancel_reason = ''; self.t = {'created': time.perf_counter()}; self.reply = []; self.clauses = []
    self.usage = {}; self.audio_bytes = 0; self.synth = None; self.gate_fail = []; self.gate_us = None; self.done = threading.Event(); self.tts_chars = 0
    self.lock = threading.Lock(); self.committed = not held; self.err = ''; self.sdk_first_byte = None
  def commit(self, t):
    with self.lock:
      self.committed = True; self.t['commit'] = t
      if 'audio_ready' in self.t and 'played' not in self.t: self.t['played'] = t; self.ctl.q.put(('played', self.rid, t))
  def on_audio(self, n):
    now = time.perf_counter(); self.audio_bytes += n
    with self.lock:
      if 'audio_ready' not in self.t:
        self.t['audio_ready'] = now
        if self.committed and not self.cancel_ev.is_set(): self.t['played'] = now; self.ctl.q.put(('played', self.rid, now))
  def cancel(self, reason):
    if not self.cancel_ev.is_set(): self.cancel_reason = reason; self.t['cancelled'] = time.perf_counter(); self.cancel_ev.set()
  def say(self, clause):
    if self.cancel_ev.is_set(): return
    if self.synth is None: self.synth = self.ctl.pool.get(); self.synth.owner = self
    if 'tts_req' not in self.t: self.t['tts_req'] = time.perf_counter()
    self.tts_chars += len(clause); self.synth.last_used = time.time(); self.futs.append(self.synth.s.speak_ssml_async(ssml(clause)))
  def handle(self, clause):
    clause = clause.strip()
    if not clause or self.stop_clauses: return
    ok, why, us = gate(clause, self.text)
    if self.gate_us is None: self.gate_us = us; self.t['first_clause'] = time.perf_counter()
    if not ok: self.gate_fail.append((clause, why)); clause = SAFE; self.stop_clauses = True
    self.clauses.append(clause); self.say(clause)
  def run(self):
    self.futs = []; self.stop_clauses = False
    acct, dep, extra, scope = LLMS[self.ctl.llm]
    msgs = [{'role': 'system', 'content': SYS}, {'role': 'assistant', 'content': FIRST}] + self.ctl.history + [{'role': 'user', 'content': self.text}]
    body = {'model': dep, 'messages': msgs, 'stream': True, 'stream_options': {'include_usage': True}}; body.update(extra)
    buf = ''; first_clause_done = False
    try:
      self.t['llm_req'] = time.perf_counter()
      r = self.ctl.sess[acct].post(chat_url(acct), headers={'api-key': KEYS[acct], 'Content-Type': 'application/json'}, json=body, stream=True, timeout=30)
      if r.status_code != 200: self.err = f'{r.status_code} {r.text[:200]}'
      else:
        for line in r.iter_lines():
          if self.cancel_ev.is_set(): r.close(); break
          if not line or not line.startswith(b'data:'): continue
          data = line[5:].strip()
          if data == b'[DONE]': break
          d = json.loads(data)
          if d.get('usage'): self.usage = d['usage']
          for ch in d.get('choices') or []:
            c = (ch.get('delta') or {}).get('content')
            if not c: continue
            if 'llm_first' not in self.t: self.t['llm_first'] = time.perf_counter()
            self.reply.append(c); buf += c
            while True:
              m = BOUND.search(buf)
              while m and buf[m.start()] in ',.' and m.start() > 0 and buf[m.start() - 1].isdigit() and (m.end() >= len(buf) or buf[m.end()].isdigit()):
                m = BOUND.search(buf, m.end()) if m.end() < len(buf) else None   # inside a number, or number may continue
              if m and (first_clause_done or len(buf[:m.start()].split()) >= 1):
                self.handle(buf[:m.end()]); buf = buf[m.end():]; first_clause_done = True
              elif len(buf) > 70 and ' ' in buf[40:]:
                k = buf.rfind(' '); self.handle(buf[:k]); buf = buf[k:]; first_clause_done = True
              else: break
        if not self.cancel_ev.is_set() and buf.strip(): self.handle(buf)
      self.t['llm_done'] = time.perf_counter()
      for f in self.futs:
        if self.cancel_ev.is_set(): break
        f.get()
    except Exception as e: self.err = repr(e)[:200]
    if self.synth is not None:
      if self.cancel_ev.is_set():
        try: self.synth.s.stop_speaking_async().get()
        except Exception: pass
        for f in self.futs:
          try: f.get()
          except Exception: pass
        self.synth.owner = None; self.ctl.pool.replace(self.synth)   # v2: never reuse a synthesizer that was cut off
      else:
        try:
          P = self.futs[0].get().properties; self.sdk_first_byte = P.get_property(sp.PropertyId.SpeechServiceResponse_SynthesisFirstByteLatencyMs)
        except Exception: pass
        self.ctl.pool.put(self.synth)
    self.t['done'] = time.perf_counter(); self.done.set(); self.ctl.q.put(('resp_done', self.rid, self.t['done']))

class Session:
  def __init__(self, cfg_name, llm, seg, spec, out_t, out_r, label, pool, sess):
    self.cfg = cfg_name; self.llm = llm; self.seg = seg; self.spec = spec; self.out_t = out_t; self.out_r = out_r; self.label = label
    self.q = queue.Queue(); self.history = []; self.pool = pool; self.sess = sess; self.rid = 0
    c = sp.SpeechConfig(subscription=KEYS['cin'], region='centralindia'); c.speech_recognition_language = 'hi-IN'
    c.set_property(sp.PropertyId.Speech_SegmentationSilenceTimeoutMs, str(seg))
    self.stream = sp.audio.PushAudioInputStream(stream_format=sp.audio.AudioStreamFormat(samples_per_second=8000, bits_per_sample=16, channels=1))
    self.rec = sp.SpeechRecognizer(speech_config=c, audio_config=sp.audio.AudioConfig(stream=self.stream))
    self.rec.recognizing.connect(lambda e: self.q.put(('partial', time.perf_counter(), e.result.text)))
    self.rec.recognized.connect(lambda e: self.q.put(('final', time.perf_counter(), e.result.text)) if e.result.reason == sp.ResultReason.RecognizedSpeech and e.result.text else None)
    self.rec.canceled.connect(lambda e: self.q.put(('stt_err', time.perf_counter(), str(e.cancellation_details.error_details)[:200])))
    self.rec.start_continuous_recognition_async().get()
    self.tape = queue.Queue(); self.alive = True; self.pusher = threading.Thread(target=self._push, daemon=True); self.pusher.start()
  def _push(self):
    fr = 160; sil = np.zeros(fr, dtype='int16').tobytes(); t0 = time.perf_counter(); k = 0
    speech_run = 0; sil_run = 0; in_speech = False; paused_sent = False
    cur = None
    while self.alive:
      if cur is None:
        try: cur = self.tape.get_nowait(); cur['i'] = 0
        except queue.Empty: cur = None
      if cur is not None:
        i = cur['i']; a = cur['a']; b = a[i * fr:(i + 1) * fr]
        if len(b) < fr: b = np.pad(b, (0, fr - len(b)))
        is_sp = bool(cur['vad'][i]) if i < len(cur['vad']) else False
        buf = b.tobytes(); cur['i'] += 1
        last = (i == cur['lsf'])
        if cur['i'] * fr >= len(a): cur['done_ev'].set(); cur = None
      else:
        buf = sil; is_sp = False; last = False
      self.stream.write(buf); k += 1
      now = time.perf_counter()
      if is_sp:
        speech_run += 1; sil_run = 0; paused_sent = False
        if not in_speech and speech_run >= 3: in_speech = True; self.q.put(('vad_speech', now))
      else:
        sil_run += 1; speech_run = 0
        if in_speech and sil_run * 20 >= SPEC_MS and not paused_sent: paused_sent = True; in_speech = False; self.q.put(('vad_pause', now))
      if last: self.q.put(('speech_end', now))
      time.sleep(max(0, t0 + k * 0.02 - time.perf_counter()))
  def new_resp(self, text, held, kind):
    self.rid += 1; r = Resp(self, self.rid, text, held, kind); self.resps[r.rid] = r; r.start(); return r
  def turn(self, clip, turn_meta):
    a, sr = load(clip); vad = speech_frames(a, sr); idx = np.where(vad)[0]; lsf = int(idx[-1]) if len(idx) else len(vad) - 1
    done_ev = threading.Event(); self.resps = {}
    st = {'finals': [], 'partial': '', 'partial_t': 0, 'last_final_t': 0, 'spec': None, 'active': None, 'speech_end': None, 'cutins': [], 'cancels': [],
          'spec_starts': 0, 'spec_hits': 0, 'spec_miss': 0, 'first_final_t': None, 'last_final_after_end': None, 'paused': False}
    self.tape.put({'a': a, 'vad': vad, 'lsf': lsf, 'done_ev': done_ev})
    t_clip_start = time.perf_counter(); deadline = None; played_after_end = None; t_finish = None
    while True:
      try: ev = self.q.get(timeout=0.05)
      except queue.Empty: ev = None
      now = time.perf_counter()
      if ev:
        typ = ev[0]
        if typ == 'speech_end': st['speech_end'] = ev[1]; deadline = ev[1] + 12.0
        elif typ == 'vad_speech':
          st['paused'] = False
          for r in list(self.resps.values()):
            if r.cancel_ev.is_set() or (r.done.is_set() and 'played' not in r.t): continue
            if 'played' in r.t and r.t['played'] <= ev[1]:   # agent audio was already out when the caller resumed
              if st['speech_end'] is None: st['cutins'].append({'rid': r.rid, 'played': r.t['played'], 'kind': r.kind, 'reply': ''.join(r.reply)[:80]}); r.cancel('barge_in_after_cutin')
            else: r.cancel('caller_resumed'); st['cancels'].append(r.rid)
          st['spec'] = None
        elif typ == 'partial':
          st['partial'] = ev[2]; st['partial_t'] = ev[1]
          if self.spec and st['paused'] and st['spec'] is not None and not st['spec'].committed:
            txt = ' '.join(st['finals'] + [st['partial']])
            if norm(txt) != norm(st['spec'].text) and st['spec_starts'] < 6:
              st['spec'].cancel('respec'); st['spec'] = self.new_resp(txt, True, 'spec'); st['spec_starts'] += 1
        elif typ == 'vad_pause':
          st['paused'] = True
          if self.spec:
            txt = ' '.join(st['finals'] + ([st['partial']] if st['partial_t'] > st['last_final_t'] else []))
            if txt.strip(): st['spec'] = self.new_resp(txt, True, 'spec'); st['spec_starts'] += 1
        elif typ == 'final':
          st['finals'].append(ev[2]); st['last_final_t'] = ev[1]; st['partial'] = ''
          if st['first_final_t'] is None: st['first_final_t'] = ev[1]
          if st['speech_end'] is not None and ev[1] >= st['speech_end']: st['last_final_after_end'] = ev[1]
          committed = ' '.join(st['finals'])
          for r in list(self.resps.values()):
            if r.committed and 'played' not in r.t and not r.cancel_ev.is_set(): r.cancel('superseded')
          sp_ = st['spec']
          if sp_ is not None and not sp_.cancel_ev.is_set() and similar(sp_.text, committed):
            sp_.commit(ev[1]); st['spec_hits'] += 1; st['active'] = sp_; st['spec'] = None
          else:
            if sp_ is not None and not sp_.cancel_ev.is_set(): sp_.cancel('spec_mismatch'); st['spec_miss'] += 1
            st['spec'] = None; st['active'] = self.new_resp(committed, False, 'commit')
        elif typ == 'played':
          r = self.resps.get(ev[1])
          if r is not None and st['speech_end'] is not None and ev[2] >= st['speech_end'] and played_after_end is None and not r.cancel_ev.is_set():
            played_after_end = r
        elif typ == 'stt_err': st.setdefault('errs', []).append(ev[2])
      # finish: after the response that played after end-of-speech completes (or deadline)
      if played_after_end is not None and played_after_end.done.is_set() and t_finish is None: t_finish = now
      if t_finish is not None and now - t_finish > 0.8 and done_ev.is_set(): break
      if deadline is not None and now > deadline and done_ev.is_set(): break
    for r in self.resps.values():
      if not r.done.is_set(): r.cancel('turn_over')
    for r in self.resps.values(): r.done.wait(timeout=5)
    se = st['speech_end']; rel = lambda t: round((t - se) * 1e3, 1) if (t is not None and se is not None) else None
    pr = played_after_end
    row = {'ts': ts(), 'config': self.cfg, 'session': self.label, 'clip': os.path.basename(clip)[:-4], 'llm': self.llm, 'seg_ms': self.seg, 'spec': self.spec, **turn_meta,
           'latency_ms': rel(pr.t['played']) if pr else None,
           'stt_first_final_rel_end_ms': rel(st['first_final_t']), 'stt_last_final_rel_end_ms': rel(st['last_final_after_end']),
           'resp_kind': pr.kind if pr else '', 'llm_ttft_ms': round((pr.t['llm_first'] - pr.t['llm_req']) * 1e3, 1) if pr and 'llm_first' in pr.t else None,
           'resp_created_rel_end_ms': rel(pr.t['created']) if pr else None, 'first_clause_rel_end_ms': rel(pr.t.get('first_clause')) if pr else None,
           'tts_ttfb_ms': round((pr.t['audio_ready'] - pr.t['tts_req']) * 1e3, 1) if pr and 'audio_ready' in pr.t and 'tts_req' in pr.t else None,
           'audio_ready_rel_end_ms': rel(pr.t.get('audio_ready')) if pr else None, 'commit_rel_end_ms': rel(pr.t.get('commit')) if pr else None,
           'gate_us': round(pr.gate_us, 1) if pr and pr.gate_us else None, 'tts_sdk_first_byte_ms': pr.sdk_first_byte if pr else None, 'harness': 'v2', 'gate_fail': json.dumps(pr.gate_fail, ensure_ascii=False) if pr else '',
           'n_cutins': len(st['cutins']), 'cutins': json.dumps([{'rel_end_ms': rel(c['played']), 'kind': c['kind'], 'reply': c['reply']} for c in st['cutins']], ensure_ascii=False),
           'n_cancelled_before_audio': len(st['cancels']), 'spec_starts': st['spec_starts'], 'spec_hits': st['spec_hits'], 'spec_miss': st['spec_miss'],
           'n_resps': len(self.resps), 'caller_text': ' '.join(st['finals']), 'first_clause': (pr.clauses[0] if pr and pr.clauses else ''),
           'reply': ''.join(pr.reply).replace('\n', ' ')[:200] if pr else '', 'errs': ';'.join(st.get('errs', []))}
    self.out_t.row(row)
    for r in self.resps.values():
      u = r.usage or {}; ptd = u.get('prompt_tokens_details') or {}
      self.out_r.row({'ts': ts(), 'config': self.cfg, 'session': self.label, 'clip': row['clip'], 'rid': r.rid, 'kind': r.kind, 'used': r is pr, 'cancel_reason': r.cancel_reason,
                      'created_rel_end_ms': rel(r.t['created']), 'llm_ttft_ms': round((r.t['llm_first'] - r.t['llm_req']) * 1e3, 1) if 'llm_first' in r.t else None,
                      'played_rel_end_ms': rel(r.t.get('played')), 'prompt_tokens': u.get('prompt_tokens'), 'cached_tokens': ptd.get('cached_tokens'),
                      'completion_tokens': u.get('completion_tokens'), 'tts_chars': r.tts_chars, 'tts_sdk_first_byte_ms': r.sdk_first_byte, 'harness': 'v2', 'audio_bytes': r.audio_bytes, 'err': r.err, 'text': r.text[:120]})
    if pr is not None:
      self.history += [{'role': 'user', 'content': row['caller_text']}, {'role': 'assistant', 'content': ''.join(pr.reply)}]
    print(self.cfg, self.label, row['clip'], 'lat', row['latency_ms'], 'stt', row['stt_last_final_rel_end_ms'], 'ttft', row['llm_ttft_ms'], 'tts', row['tts_ttfb_ms'], 'cut', row['n_cutins'], 'spec', st['spec_hits'], '/', st['spec_starts'], '|', row['caller_text'][:30], '|', row['first_clause'][:30], flush=True)
    self.pool.keepalive()
  def close(self):
    time.sleep(0.5); self.alive = False; self.pusher.join(timeout=2); self.stream.close()
    try: self.rec.stop_continuous_recognition_async().get()
    except Exception: pass

TYPES = {}
def meta(clip):
  return {'persona': clip[:2], 'turn_type': TYPES.get(clip, '')}
if __name__ == '__main__':
  cfg_name, out_t, out_r, aud, passes, pause_n = sys.argv[1], Out(sys.argv[2]), Out(sys.argv[3]), sys.argv[4], int(sys.argv[5]), int(sys.argv[6])
  seg, spec, which = CONFIGS[cfg_name]; llm = FAST if which == 'FAST' else QUALITY if which == 'QUALITY' else which
  try:
    bat = json.load(open(os.path.join(os.path.dirname(__file__), 'battery.json')))
    for p in bat['personas']:
      for t in p['turns']: TYPES[t['id']] = t['type']
  except Exception as e: print('no battery.json', e)
  pool = Pool(3); sess = {a: requests.Session() for a in ('sin', 'sea', 'frc', 'cin')}
  acct = LLMS[llm][0]
  sess[acct].post(chat_url(acct), headers={'api-key': KEYS[acct]}, json={'model': LLMS[llm][1], 'messages': [{'role': 'system', 'content': SYS}, {'role': 'user', 'content': 'हाँ'}], **LLMS[llm][2]}, timeout=30)
  for ps in range(passes):
    for p in (('P1',) if os.environ.get('SMOKE') else ('P1', 'P2', 'P4')):
      clips = sorted(f for f in os.listdir(aud) if f.startswith(p + '_t') and 'clean' not in f)[:(4 if os.environ.get('SMOKE') else 99)]
      po = ps + int(os.environ.get('PASS_OFFSET', '0'))
      s = Session(cfg_name, llm, seg, spec, out_t, out_r, f'{p}-pass{po}', pool, sess)
      time.sleep(1.0)
      for c in clips: s.turn(os.path.join(aud, c), dict(meta(c[:-4]), pass_=po, repeat=0))
      s.close()
  if pause_n:
    po = int(os.environ.get('PASS_OFFSET', '0'))
    s = Session(cfg_name, llm, seg, spec, out_t, out_r, f'P4pause-{po}', pool, sess); time.sleep(1.0)
    for i in range(pause_n):
      s.history = []; s.turn(os.path.join(aud, 'P4_t03.wav'), dict(meta('P4_t03'), pass_=-1, repeat=i + po * pause_n))
    s.close()
  print('cold synths created during run:', pool.cold)
