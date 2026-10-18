# g3-cascade-measured (2026-10-18): multi-provider gateable streaming cascade, run ON the Central India VM.
# Based on round 2's cascade.py (research/2026-10-17/lanes/l8-azure-bench/round2/harness/cascade.py), non-speculative
# path only (round 2 found its speculation matcher unsafe). Changes:
#   - STT is pluggable: Azure real-time (centralindia, hi-IN, segmentation timeout) or gemini-3.5-transcribe-live over
#     the Live API websocket with hybrid VAD (client sends audioStreamEnd after HYB_MS of local silence, the same
#     500 ms silence rule as Azure's segmentation timeout).
#   - LLM is pluggable (backends.llm_stream): Azure gpt-4.1-mini (South India Standard), Gemini API models, OpenRouter.
#   - TTS is pluggable: Azure websocket synthesizer (clause streaming, as round 2) or Gemini 3.8 TTS (one streamed
#     request per reply after the LLM finishes, with the LLM's own delivery note as speech_metadata.style).
#   - The reply shape asks for a bracketed delivery note first ("[warm, reassuring]"); it is stripped before the gate
#     and before any TTS, and is passed to Gemini TTS as the style. Same prompt for every configuration.
# Metric (unchanged from round 2): wall time from the clip's last speech frame being pushed (caller end of speech) to the
# first TTS audio byte of the response released after that point. A response whose audio was out while the caller
# was still mid-turn is a premature cut-in. No telephone leg, no playback.
# Usage: python cascade3.py CONFIG OUT_TURNS_CSV OUT_RESP_CSV AUDIO8K_DIR PASSES PAUSE_REPEATS
import os, sys, time, json, threading, queue, re, asyncio, base64, unicodedata
import numpy as np
from backends import KEYS, llm_stream, gemini_tts_stream, Pool, Out, ts, az_ssml, sp
from llm_prompt import SYSTEM
from vadutil import load, speech_frames
from gate import gate, SAFE
FIRST = 'नमस्ते! मैं आशा, Suraksha Health से बात कर रही हूँ। आपकी health policy का renewal आ रहा है, उस बारे में दो मिनट बात कर सकते हैं?'
SHAPE = ("\n\nReply shape for this call (applies to every reply): write Hindi words in Devanagari and keep English words "
         "such as premium, policy, renewal, advisor in Latin script. Open each reply with a short first clause of two to four "
         "words that reacts to what the caller just said, then a comma or full stop, then the substance in one short sentence. "
         "If the caller's words look unfinished, as if they stopped mid-sentence, reply only with a two-word prompt to continue.")
VOICE_NOTE = ("\n\nVoice note: put a delivery note for the voice before every reply, in square brackets, one to four English words "
              "naming the feeling to use, such as [warm, reassuring] or [calm, slow]. The note is never spoken.")
# Off by default (2026-10-18): Google's 3.8 TTS guide says to leave the per-turn style empty for voice agents, the
# generateContent path speaks any style prefix aloud (measured), and the note delays the first clause. Round-2 parity.
SYS = SYSTEM + SHAPE + (VOICE_NOTE if os.environ.get('VOICE_NOTE') == '1' else '')
# name: (stt, llm arm, tts arm)
CONFIGS = {
  'C1_az_az41_azneural': ('az', 'az:g3-gpt-4-1-mini-std', 'az:hi-IN-SwaraNeural'),
  'C2_az_az41_azhd':     ('az', 'az:g3-gpt-4-1-mini-std', 'az:en-IN-Aarti:DragonHDLatestNeural'),
  'C3_az_or_azhd':       ('az', os.environ.get('OR_LLM', 'or:meta-llama/llama-3.3-70b-instruct@groq'), 'az:en-IN-Aarti:DragonHDLatestNeural'),
  'C4_az_gm_gtts':       ('az', os.environ.get('GM_LLM', 'gm:gemini-3.5-flash-lite'), os.environ.get('GM_TTS', 'gi:gemini-3.8-flash-lite-tts:Despina')),
  'C5_gtl_gm_gtts':      ('gtl', os.environ.get('GM_LLM', 'gm:gemini-3.5-flash-lite'), os.environ.get('GM_TTS5', 'gi:gemini-3.8-flash-tts:Despina')),
  'C6_gtl_or_azneural':  ('gtl', os.environ.get('OR_LLM', 'or:meta-llama/llama-3.3-70b-instruct@groq'), 'az:hi-IN-SwaraNeural'),
  'C7_az_gm_azneural':   ('az', os.environ.get('GM_LLM', 'gm:gemini-3.5-flash-lite'), 'az:hi-IN-SwaraNeural'),
  'C8_gtl_gm_azneural':  ('gtl', os.environ.get('GM_LLM', 'gm:gemini-3.5-flash-lite'), 'az:hi-IN-SwaraNeural'),
}
SEG_MS = int(os.environ.get('SEG_MS', '500')); HYB_MS = int(os.environ.get('HYB_MS', '500'))
TURN_GAP_S = float(os.environ.get('TURN_GAP_S', '0'))
BOUND = re.compile(r'[,.?!।;:—]')
TAG = re.compile(r'^\s*\[([^\]]{0,60})\]\s*')

class AzureSTT:
  def __init__(self, q, seg):
    c = sp.SpeechConfig(subscription=KEYS['cin'], region='centralindia'); c.speech_recognition_language = 'hi-IN'
    c.set_property(sp.PropertyId.Speech_SegmentationSilenceTimeoutMs, str(seg))
    self.stream = sp.audio.PushAudioInputStream(stream_format=sp.audio.AudioStreamFormat(samples_per_second=8000, bits_per_sample=16, channels=1))
    self.rec = sp.SpeechRecognizer(speech_config=c, audio_config=sp.audio.AudioConfig(stream=self.stream))
    self.rec.recognizing.connect(lambda e: q.put(('partial', time.perf_counter(), e.result.text)))
    self.rec.recognized.connect(lambda e: q.put(('final', time.perf_counter(), e.result.text)) if e.result.reason == sp.ResultReason.RecognizedSpeech and e.result.text else None)
    self.rec.canceled.connect(lambda e: q.put(('stt_err', time.perf_counter(), str(e.cancellation_details.error_details)[:200])))
    self.rec.start_continuous_recognition_async().get(); self.audio_s = 0.0
  def write(self, buf, is_sp): self.stream.write(buf); self.audio_s += len(buf) / 16000
  def close(self):
    self.stream.close()
    try: self.rec.stop_continuous_recognition_async().get()
    except Exception: pass

GTL_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
class GeminiSTT:
  """gemini-3.5-transcribe-live, hi-IN hint, 16 kHz PCM in 40 ms chunks (8 kHz phone audio upsampled), hybrid VAD."""
  def __init__(self, q, hyb_ms, lang='hi-IN'):
    import websockets
    self.q = q; self.hyb_ms = hyb_ms; self.buf = b''; self.sil = 0; self.in_sp = False; self.sent_end = True; self.audio_s = 0.0; self.n_end = 0
    self.loop = asyncio.new_event_loop(); self.ready = threading.Event(); self.err = None; self.text_out_chars = 0; self.connect_errs = []
    def runner():
      asyncio.set_event_loop(self.loop)
      async def main():
        try:
          for attempt in range(6):   # free tier: back off on a quota close (1011), never switch keys
            try:
              self.ws = await websockets.connect(GTL_URL, additional_headers={'x-goog-api-key': KEYS['gem']}, max_size=None, ping_interval=20)
              await self.ws.send(json.dumps({'setup': {'model': 'models/gemini-3.5-transcribe-live', 'generationConfig': {'responseModalities': ['TEXT']},
                                                       'inputAudioTranscription': {'languageCodes': [lang]}}}))
              await self.ws.recv(); break
            except Exception as e:
              self.connect_errs.append(repr(e)[:160]); print('GTL connect retry', attempt, repr(e)[:160], flush=True)
              await asyncio.sleep(15 * 2 ** attempt)
          self.ready.set()
          async for m in self.ws:
            d = json.loads(m); now = time.perf_counter(); sc = d.get('serverContent') or {}
            if 'interimInputTranscription' in sc: q.put(('partial', now, sc['interimInputTranscription'].get('text', '')))
            if 'inputTranscription' in sc:
              t = sc['inputTranscription'].get('text', ''); self.text_out_chars += len(t)
              if t.strip(): q.put(('final', now, t.strip()))
            if 'error' in d or 'goAway' in d: q.put(('stt_err', now, json.dumps(d)[:200]))
        except Exception as e:
          self.err = repr(e)[:200]; q.put(('stt_err', time.perf_counter(), self.err)); self.ready.set()
      self.loop.run_until_complete(main())
    self.th = threading.Thread(target=runner, daemon=True); self.th.start(); self.ready.wait(1000)
  def _send(self, obj):
    if self.err: return
    asyncio.run_coroutine_threadsafe(self.ws.send(json.dumps(obj)), self.loop)
  def write(self, buf, is_sp):
    self.buf += buf; self.audio_s += len(buf) / 16000
    if is_sp: self.sil = 0; self.in_sp = True; self.sent_end = False
    else: self.sil += 1
    if len(self.buf) >= 640:   # 40 ms of 8 kHz int16
      x = np.frombuffer(self.buf, dtype='<i2').astype(np.float32); self.buf = b''
      y = np.empty(2 * len(x), dtype=np.float32); y[0::2] = x; y[1::2] = (x + np.concatenate([x[1:], x[-1:]])) / 2
      self._send({'realtimeInput': {'audio': {'data': base64.b64encode(y.astype('<i2').tobytes()).decode(), 'mimeType': 'audio/pcm;rate=16000'}}})
    if self.in_sp and not self.sent_end and self.sil * 20 >= self.hyb_ms:
      self._send({'realtimeInput': {'audioStreamEnd': True}}); self.sent_end = True; self.in_sp = False; self.n_end += 1
  def close(self):
    try: asyncio.run_coroutine_threadsafe(self.ws.close(), self.loop).result(5)
    except Exception: pass

class GatedSTT:
  """VAD-gated streaming (cost lever): forward audio only around caller speech. A 200 ms pre-roll ring buffer is
  flushed at speech onset; after speech, frames keep flowing for TAIL_MS (so the STT's own silence rule can fire),
  then nothing is sent until the next onset. audio_s counts only what was sent (the billable audio)."""
  def __init__(self, inner, tail_ms, preroll_ms=200):
    import collections
    self.inner = inner; self.tail = tail_ms // 20; self.ring = collections.deque(maxlen=preroll_ms // 20); self.open = False; self.sil = 0; self.audio_s = 0.0
  def write(self, buf, is_sp):
    if is_sp:
      if not self.open:
        for b in self.ring: self.inner.write(b, False); self.audio_s += len(b) / 16000
        self.ring.clear(); self.open = True
      self.sil = 0
    if self.open:
      self.inner.write(buf, is_sp); self.audio_s += len(buf) / 16000
      if not is_sp:
        self.sil += 1
        if self.sil >= self.tail: self.open = False
    else: self.ring.append(buf)
  def close(self): self.inner.close()

class Resp(threading.Thread):
  def __init__(self, ctl, rid, text, kind):
    super().__init__(daemon=True); self.ctl = ctl; self.rid = rid; self.text = text; self.kind = kind
    self.cancel_ev = threading.Event(); self.cancel_reason = ''; self.t = {'created': time.perf_counter()}; self.reply = []; self.clauses = []
    self.usage = {}; self.ltime = {}; self.audio_bytes = 0; self.synth = None; self.gate_fail = []; self.gate_us = None; self.done = threading.Event()
    self.tts_chars = 0; self.lock = threading.Lock(); self.err = ''; self.style = None; self.tts_info = {}; self.futs = []; self.stop_clauses = False
    self.gem_tts = ctl.tts.startswith('gi:') or ctl.tts.startswith('gg:')
  def on_audio(self, n):
    now = time.perf_counter(); self.audio_bytes += n
    with self.lock:
      if 'audio_ready' not in self.t:
        self.t['audio_ready'] = now
        if not self.cancel_ev.is_set(): self.t['played'] = now; self.ctl.q.put(('played', self.rid, now))
  def cancel(self, reason):
    if not self.cancel_ev.is_set(): self.cancel_reason = reason; self.t['cancelled'] = time.perf_counter(); self.cancel_ev.set()
  def say(self, clause):
    if self.cancel_ev.is_set(): return
    if self.gem_tts: return   # Gemini TTS speaks the whole reply in one request after the LLM is done
    if self.synth is None: self.synth = self.ctl.pool.get(); self.synth.owner = self
    if 'tts_req' not in self.t: self.t['tts_req'] = time.perf_counter()
    self.tts_chars += len(clause); self.synth.last_used = time.time(); self.futs.append(self.synth.s.speak_ssml_async(az_ssml(self.ctl.tts[3:], clause)))
  def handle(self, clause):
    clause = clause.strip()
    if not clause or self.stop_clauses: return
    ok, why, us = gate(clause, self.text)
    if self.gate_us is None: self.gate_us = us; self.t['first_clause'] = time.perf_counter()
    if not ok: self.gate_fail.append((clause, why)); clause = SAFE; self.stop_clauses = True
    self.clauses.append(clause); self.say(clause)
  def run(self):
    msgs = [{'role': 'system', 'content': SYS}, {'role': 'assistant', 'content': FIRST}] + self.ctl.history + [{'role': 'user', 'content': self.text}]
    buf = ''; tag_done = False; first_clause_done = False
    try:
      self.t['llm_req'] = time.perf_counter()
      for c in llm_stream(self.ctl.llm, msgs, self.cancel_ev, usage=self.usage, timing=self.ltime):
        if 'llm_first' not in self.t: self.t['llm_first'] = time.perf_counter()
        self.reply.append(c); buf += c
        if not tag_done:
          s = buf.lstrip()
          if not s: continue
          if s[0] == '[':
            m = TAG.match(buf)
            if m: self.style = m.group(1).strip()[:60]; buf = buf[m.end():]; tag_done = True
            elif len(s) > 64: tag_done = True
            else: continue
          else: tag_done = True
        while True:
          m = BOUND.search(buf)
          while m and buf[m.start()] in ',.' and m.start() > 0 and buf[m.start() - 1].isdigit() and (m.end() >= len(buf) or buf[m.end()].isdigit()):
            m = BOUND.search(buf, m.end()) if m.end() < len(buf) else None
          if m and (first_clause_done or len(buf[:m.start()].split()) >= 1):
            self.handle(buf[:m.end()]); buf = buf[m.end():]; first_clause_done = True
          elif len(buf) > 70 and ' ' in buf[40:]:
            k = buf.rfind(' '); self.handle(buf[:k]); buf = buf[k:]; first_clause_done = True
          else: break
      if self.ltime.get('err'): self.err = self.ltime['err'][:200]
      if not self.cancel_ev.is_set() and buf.strip():
        b = TAG.sub('', buf) if not tag_done else buf
        self.handle(b)
      self.t['llm_done'] = time.perf_counter()
      if self.gem_tts and self.clauses and not self.cancel_ev.is_set():
        text = ' '.join(self.clauses); self.tts_chars = len(text); self.t['tts_req'] = time.perf_counter()
        style = self.style if self.ctl.tts.startswith('gi:') else None   # gg (generateContent) reads any style prefix aloud
        self.tts_info = gemini_tts_stream(self.ctl.tts, text, style, lambda b, f: self.on_audio(len(b)), self.cancel_ev)
        if self.tts_info.get('err'):
          self.err = (self.err + ' tts:' + self.tts_info['err'])[:300]
          if self.tts_info.get('status') == 429 and ('PerDay' in self.tts_info['err'] or 'per day' in self.tts_info['err'].lower() or 'limit: 10,' in self.tts_info['err']):
            DAILY_QUOTA_HIT.set()
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
        self.synth.owner = None; self.ctl.pool.replace(self.synth)
      else: self.ctl.pool.put(self.synth)
    self.t['done'] = time.perf_counter(); self.done.set(); self.ctl.q.put(('resp_done', self.rid, self.t['done']))

class Session:
  def __init__(self, cfg, out_t, out_r, label, pool):
    self.cfg = cfg; self.stt_kind, self.llm, self.tts = CONFIGS[cfg]; self.out_t = out_t; self.out_r = out_r; self.label = label
    self.q = queue.Queue(); self.history = []; self.pool = pool; self.rid = 0
    self.stt = AzureSTT(self.q, SEG_MS) if self.stt_kind == 'az' else GeminiSTT(self.q, HYB_MS)
    if os.environ.get('STT_GATE') == '1':
      self.stt = GatedSTT(self.stt, (SEG_MS if self.stt_kind == 'az' else HYB_MS) + int(os.environ.get('GATE_EXTRA_MS', '200')))
    self.t_open = time.perf_counter()
    self.tape = queue.Queue(); self.alive = True; self.pusher = threading.Thread(target=self._push, daemon=True); self.pusher.start()
  def _push(self):
    fr = 160; sil = np.zeros(fr, dtype='int16').tobytes(); t0 = time.perf_counter(); k = 0; speech_run = 0; in_speech = False; cur = None
    while self.alive:
      if cur is None:
        try: cur = self.tape.get_nowait(); cur['i'] = 0
        except queue.Empty: cur = None
      if cur is not None:
        i = cur['i']; a = cur['a']; b = a[i * fr:(i + 1) * fr]
        if len(b) < fr: b = np.pad(b, (0, fr - len(b)))
        is_sp = bool(cur['vad'][i]) if i < len(cur['vad']) else False
        buf = b.tobytes(); cur['i'] += 1; last = (i == cur['lsf'])
        if cur['i'] * fr >= len(a): cur['done_ev'].set(); cur = None
      else: buf = sil; is_sp = False; last = False
      try: self.stt.write(buf, is_sp)
      except Exception as e: self.q.put(('stt_err', time.perf_counter(), repr(e)[:100]))
      k += 1; now = time.perf_counter()
      if is_sp:
        speech_run += 1
        if not in_speech and speech_run >= 3: in_speech = True; self.q.put(('vad_speech', now))
      else:
        speech_run = 0
        if in_speech: in_speech = False
      if last: self.q.put(('speech_end', now))
      time.sleep(max(0, t0 + k * 0.02 - time.perf_counter()))
  def new_resp(self, text, kind):
    self.rid += 1; r = Resp(self, self.rid, text, kind); self.resps[r.rid] = r; r.start(); return r
  def turn(self, clip, turn_meta):
    a, sr = load(clip); vad = speech_frames(a, sr); idx = np.where(vad)[0]; lsf = int(idx[-1]) if len(idx) else len(vad) - 1
    done_ev = threading.Event(); self.resps = {}
    st = {'finals': [], 'speech_end': None, 'cutins': [], 'cancels': [], 'first_final_t': None, 'last_final_after_end': None}
    self.tape.put({'a': a, 'vad': vad, 'lsf': lsf, 'done_ev': done_ev})
    deadline = None; played_after_end = None; t_finish = None
    while True:
      try: ev = self.q.get(timeout=0.05)
      except queue.Empty: ev = None
      now = time.perf_counter()
      if ev:
        typ = ev[0]
        if typ == 'speech_end': st['speech_end'] = ev[1]; deadline = ev[1] + 15.0
        elif typ == 'vad_speech':
          for r in list(self.resps.values()):
            if r.cancel_ev.is_set() or (r.done.is_set() and 'played' not in r.t): continue
            if 'played' in r.t and r.t['played'] <= ev[1]:
              if st['speech_end'] is None: st['cutins'].append({'rid': r.rid, 'played': r.t['played'], 'kind': r.kind, 'reply': ''.join(r.reply)[:80]}); r.cancel('barge_in_after_cutin')
            else: r.cancel('caller_resumed'); st['cancels'].append(r.rid)
        elif typ == 'final':
          st['finals'].append(ev[2])
          if st['first_final_t'] is None: st['first_final_t'] = ev[1]
          if st['speech_end'] is not None and ev[1] >= st['speech_end']: st['last_final_after_end'] = ev[1]
          committed = ' '.join(st['finals'])
          for r in list(self.resps.values()):
            if 'played' not in r.t and not r.cancel_ev.is_set(): r.cancel('superseded')
          self.new_resp(committed, 'commit')
        elif typ == 'played':
          r = self.resps.get(ev[1])
          if r is not None and st['speech_end'] is not None and ev[2] >= st['speech_end'] and played_after_end is None and not r.cancel_ev.is_set():
            played_after_end = r
        elif typ == 'stt_err': st.setdefault('errs', []).append(ev[2])
      if played_after_end is not None and played_after_end.done.is_set() and t_finish is None: t_finish = now
      if t_finish is not None and now - t_finish > 0.8 and done_ev.is_set(): break
      if deadline is not None and now > deadline and done_ev.is_set(): break
    for r in self.resps.values():
      if not r.done.is_set(): r.cancel('turn_over')
    for r in self.resps.values(): r.done.wait(timeout=8)
    se = st['speech_end']; rel = lambda t: round((t - se) * 1e3, 1) if (t is not None and se is not None) else None
    pr = played_after_end
    row = {'ts': ts(), 'config': self.cfg, 'stt': self.stt_kind, 'llm': self.llm, 'tts': self.tts, 'session': self.label, 'clip': os.path.basename(clip)[:-4], **turn_meta,
           'latency_ms': rel(pr.t['played']) if pr else None,
           'stt_first_final_rel_end_ms': rel(st['first_final_t']), 'stt_last_final_rel_end_ms': rel(st['last_final_after_end']),
           'llm_ttft_ms': round((pr.t['llm_first'] - pr.t['llm_req']) * 1e3, 1) if pr and 'llm_first' in pr.t else None,
           'resp_created_rel_end_ms': rel(pr.t['created']) if pr else None, 'first_clause_rel_end_ms': rel(pr.t.get('first_clause')) if pr else None,
           'llm_done_rel_end_ms': rel(pr.t.get('llm_done')) if pr else None,
           'tts_ttfb_ms': round((pr.t['audio_ready'] - pr.t['tts_req']) * 1e3, 1) if pr and 'audio_ready' in pr.t and 'tts_req' in pr.t else None,
           'style': pr.style if pr else '', 'gate_fail': json.dumps(pr.gate_fail, ensure_ascii=False) if pr else '',
           'n_cutins': len(st['cutins']), 'cutins': json.dumps([{'rel_end_ms': rel(c['played']), 'kind': c['kind'], 'reply': c['reply']} for c in st['cutins']], ensure_ascii=False),
           'n_cancelled_before_audio': len(st['cancels']), 'n_resps': len(self.resps), 'caller_text': ' '.join(st['finals']), 'first_clause': (pr.clauses[0] if pr and pr.clauses else ''),
           'reply': ''.join(pr.reply).replace('\n', ' ')[:220] if pr else '', 'errs': ';'.join(st.get('errs', []))[:300],
           'resp_errs': ';'.join(r.err for r in self.resps.values() if r.err)[:400],
           'stt_audio_sent_s_cum': round(self.stt.audio_s, 2), 'session_wall_s_cum': round(time.perf_counter() - self.t_open, 2), 'stt_gate': os.environ.get('STT_GATE', '0')}
    self.out_t.row(row)
    for r in self.resps.values():
      u = r.usage or {}; ti = r.tts_info or {}
      self.out_r.row({'ts': ts(), 'config': self.cfg, 'session': self.label, 'clip': row['clip'], 'rid': r.rid, 'kind': r.kind, 'used': r is pr, 'cancel_reason': r.cancel_reason,
                      'created_rel_end_ms': rel(r.t['created']), 'llm_ttft_ms': round((r.t['llm_first'] - r.t['llm_req']) * 1e3, 1) if 'llm_first' in r.t else None,
                      'played_rel_end_ms': rel(r.t.get('played')), 'llm_status': r.ltime.get('status'), 'prompt_tokens': u.get('prompt_tokens'), 'cached_tokens': u.get('cached_tokens'),
                      'completion_tokens': u.get('completion_tokens'), 'thought_tokens': u.get('thought_tokens'), 'or_cost_usd': u.get('or_cost_usd'), 'provider': u.get('provider'),
                      'tts_chars': r.tts_chars, 'tts_status': ti.get('status'), 'tts_in_tokens': ti.get('in_tokens'), 'tts_out_tokens': ti.get('out_tokens'), 'tts_audio_s': ti.get('audio_s'),
                      'audio_bytes': r.audio_bytes, 'style': r.style, 'err': r.err, 'text': r.text[:120]})
    if pr is not None:
      self.history += [{'role': 'user', 'content': row['caller_text']}, {'role': 'assistant', 'content': ''.join(pr.reply)}]
    print(self.cfg, self.label, row['clip'], 'lat', row['latency_ms'], 'stt', row['stt_last_final_rel_end_ms'], 'ttft', row['llm_ttft_ms'], 'llmdone', row['llm_done_rel_end_ms'],
          'tts', row['tts_ttfb_ms'], 'cut', row['n_cutins'], '|', row['caller_text'][:30], '|', row['style'], '|', row['first_clause'][:30], '|', row['resp_errs'][:120], flush=True)
    if self.pool is not None: self.pool.keepalive()
    if TURN_GAP_S: time.sleep(TURN_GAP_S)
  def close(self):
    time.sleep(0.5); self.alive = False; self.pusher.join(timeout=2); self.stt.close()

DAILY_QUOTA_HIT = threading.Event()
TYPES = {}
def meta(clip): return {'persona': clip[:2], 'turn_type': TYPES.get(clip, '')}
if __name__ == '__main__':
  cfg, out_t, out_r, aud, passes, pause_n = sys.argv[1], Out(sys.argv[2]), Out(sys.argv[3]), sys.argv[4], int(sys.argv[5]), int(sys.argv[6])
  try:
    bat = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'battery.json')))
    for p in bat['personas']:
      for t in p['turns']: TYPES[t['id']] = t['type']
  except Exception as e: print('no battery.json', e)
  stt_kind, llm, tts = CONFIGS[cfg]
  pool = Pool(tts[3:], 3) if tts.startswith('az:') else None
  list(llm_stream(llm, [{'role': 'system', 'content': SYS}, {'role': 'user', 'content': 'हाँ'}], max_tokens=10))   # warm the LLM connection
  personas = os.environ.get('PERSONAS', 'P1,P2,P4').split(',')
  if os.environ.get('CLIPS'):   # explicit clip list in one session (used for the quota-limited Gemini TTS runs: clean turns only)
    s = Session(cfg, out_t, out_r, 'CLIPS-' + os.environ.get('PASS_OFFSET', '0'), pool); time.sleep(1.0)
    for c in os.environ['CLIPS'].split(','):
      if DAILY_QUOTA_HIT.is_set(): print('free-tier daily TTS quota hit; stopping (no key rotation)', flush=True); break
      s.turn(os.path.join(aud, c + '.wav'), dict(meta(c), pass_=0, repeat=0))
    s.close(); passes = 0
  for ps in range(passes):
    po = ps + int(os.environ.get('PASS_OFFSET', '0'))
    for p in personas:
      clips = sorted(f for f in os.listdir(aud) if f.startswith(p + '_t') and 'clean' not in f)[:int(os.environ.get('MAX_CLIPS', '99'))]
      s = Session(cfg, out_t, out_r, f'{p}-pass{po}', pool); time.sleep(1.0)
      for c in clips: s.turn(os.path.join(aud, c), dict(meta(c[:-4]), pass_=po, repeat=0))
      s.close()
  if pause_n:
    po = int(os.environ.get('PASS_OFFSET', '0'))
    s = Session(cfg, out_t, out_r, f'P4pause-{po}', pool); time.sleep(1.0)
    for i in range(pause_n):
      s.history = []; s.turn(os.path.join(aud, 'P4_t03.wav'), dict(meta('P4_t03'), pass_=-1, repeat=i + po * pause_n))
    s.close()
  if pool is not None: print('cold synths created during run:', pool.cold)
