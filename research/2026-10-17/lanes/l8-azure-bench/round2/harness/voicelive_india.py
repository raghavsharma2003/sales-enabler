# r2-latency-india (2026-10-17): Voice Live measured FROM the Central India VM against a Central India resource.
# Caller = l4b personas P1/P2/P4, phone-band audio upsampled to 16 kHz, streamed at real time in 20 ms frames with
# continuous silence between turns (one session per persona, 10 turns each). Nothing is played back (no echo).
# Arms:
#   vl-gpt41mini-regional : gpt-4.1-mini (Regional/India per MS region table) + azure-speech hi-IN + hi-IN-SwaraNeural
#   vl-azure-realtime     : azure-realtime S2S, native voice diya (Global)
#   vl-gptrt21-regional   : gpt-realtime-2.1-regional S2S (Regional/India per MS table), voice marin
#   vl-text-gated         : gpt-4.1-mini regional in TEXT mode -> our clause splitter + gate.py -> our TTS (centralindia
#                           Swara, warm websocket). This is the gateable Voice Live variant.
# Turn detection: azure_semantic_vad_multilingual, silence 500 ms, languages hi/en (Hindi is in MS's supported list).
# Per turn: every server event is logged with wall time relative to the clip's last speech frame.
# Usage: python voicelive_india.py AUDIO16K_DIR OUT_CSV ARM
import os, sys, json, time, base64, asyncio, re, html, threading
import numpy as np, websockets
import azure.cognitiveservices.speech as sp
from r2common import KEYS, Out, ts
from llm_prompt import SYSTEM
from vadutil import load, speech_frames
from gate import gate, SAFE
HOST = 'vp-r2lat-cin.cognitiveservices.azure.com'; API = '2026-04-10'
TD = {'type': 'azure_semantic_vad_multilingual', 'silence_duration_ms': 500, 'languages': ['hi', 'en']}
SHAPE = (" Write Hindi words in Devanagari and keep English words such as premium, policy, renewal in Latin script. Open each "
         "reply with a short first clause of two to four words that reacts to what the caller said, then the substance in one short sentence.")
ARMS = {
  'vl-gpt41mini-regional': ('gpt-4.1-mini', {'model': 'azure-speech', 'language': 'hi-IN'}, {'name': 'hi-IN-SwaraNeural', 'type': 'azure-standard'}, ['text', 'audio']),
  'vl-azure-realtime': ('azure-realtime', None, {'name': 'diya', 'type': 'azure-realtime-native'}, ['text', 'audio']),
  'vl-gptrt21-regional': ('gpt-realtime-2.1-regional', None, 'marin', ['text', 'audio']),
  'vl-text-gated': ('gpt-4.1-mini', {'model': 'azure-speech', 'language': 'hi-IN'}, None, ['text']),
}
BOUND = re.compile(r'[,.?!।;:—]')
class TTS:
  def __init__(self):
    cfg = sp.SpeechConfig(subscription=KEYS['cin'], region='centralindia'); cfg.set_speech_synthesis_output_format(sp.SpeechSynthesisOutputFormat.Raw8Khz8BitMonoMULaw)
    self.s = sp.SpeechSynthesizer(speech_config=cfg, audio_config=None); self.c = sp.Connection.from_speech_synthesizer(self.s); self.c.open(True)
    self.first = None; self.s.synthesizing.connect(self._c); self.s.speak_text_async('नमस्ते।').get()
  def _c(self, e):
    if self.first is None: self.first = time.perf_counter()
  def say_first(self, text):
    self.first = None; self.t_req = time.perf_counter()
    self.s.speak_ssml_async(f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='hi-IN'><voice name='hi-IN-SwaraNeural'>{html.escape(text)}</voice></speak>")
async def session(arm, clips, label, out):
  model, tx, voice, mods = ARMS[arm]
  tts = TTS() if arm == 'vl-text-gated' else None
  url = f'wss://{HOST}/voice-live/realtime?api-version={API}&model={model}'
  t0 = time.perf_counter()
  async with websockets.connect(url, additional_headers={'api-key': KEYS['cin']}, max_size=None, open_timeout=30) as ws:
    t_open = time.perf_counter()
    sess = {'instructions': SYSTEM + SHAPE, 'modalities': mods, 'input_audio_sampling_rate': 16000, 'turn_detection': TD,
            'input_audio_noise_reduction': {'type': 'azure_deep_noise_suppression'}}
    if voice: sess['voice'] = voice
    if tx: sess['input_audio_transcription'] = tx
    st = {'updated': None, 'cur': None, 'err': ''}
    async def recv():
      async for msg in ws:
        ev = json.loads(msg); typ = ev.get('type', ''); now = time.perf_counter(); c = st['cur']
        if typ == 'session.updated': st['updated'] = now
        if typ == 'error': st['err'] = json.dumps(ev.get('error'))[:300]; print('ERROR', st['err'], flush=True)
        if c is None: continue
        rid = ev.get('response_id') or (ev.get('response') or {}).get('id') or ''
        c['events'].append((now, typ, rid))
        if typ == 'conversation.item.input_audio_transcription.completed': c['transcript'] += ev.get('transcript', '') + ' '
        elif typ in ('response.audio_transcript.delta', 'response.output_audio_transcript.delta', 'response.text.delta', 'response.output_text.delta'):
          c['reply'].setdefault(rid, ''); c['reply'][rid] += ev.get('delta', '')
          if tts is not None and rid not in c['tts_started']:
            buf = c['reply'][rid]; m = BOUND.search(buf)
            if m:
              cl = buf[:m.end()]; ok, why, us = gate(cl, c['transcript'])
              c['tts_started'][rid] = now; c['gate_us'] = us; tts.say_first(cl if ok else SAFE); c['tts_obj'][rid] = (tts, now)
        elif typ == 'response.done':
          c['done'][rid] = now; c['usage'] = json.dumps((ev.get('response') or {}).get('usage'))[:300]
          if tts is not None and rid not in c['tts_started'] and c['reply'].get(rid):
            c['tts_started'][rid] = now; tts.say_first(c['reply'][rid]); c['tts_obj'][rid] = (tts, now)
    rt = asyncio.create_task(recv())
    await ws.send(json.dumps({'type': 'session.update', 'session': sess}))
    while st['updated'] is None and time.perf_counter() - t_open < 20: await asyncio.sleep(0.01)
    FR = 320; sil = base64.b64encode(np.zeros(FR, dtype='int16').tobytes()).decode()
    async def push_sil(sec, until=None):
      t = time.perf_counter(); n = 0
      while True:
        await ws.send(json.dumps({'type': 'input_audio_buffer.append', 'audio': sil})); n += 1
        await asyncio.sleep(max(0, t + n * 0.02 - time.perf_counter()))
        if n * 0.02 >= sec or (until and until()): return
    await push_sil(1.0)
    for clip in clips:
      a, sr = load(clip); assert sr == 16000
      vad = speech_frames(a, sr); lsf = int(np.where(vad)[0][-1])
      c = {'events': [], 'transcript': '', 'reply': {}, 'done': {}, 'usage': '', 'tts_started': {}, 'tts_obj': {}, 'gate_us': None}; st['cur'] = c
      t = time.perf_counter(); n = 0; t_end = None
      for j in range(0, len(a), FR):
        fr = a[j:j + FR]
        if len(fr) < FR: fr = np.pad(fr, (0, FR - len(fr)))
        await ws.send(json.dumps({'type': 'input_audio_buffer.append', 'audio': base64.b64encode(fr.tobytes()).decode()})); n += 1
        if j // FR == lsf: t_end = time.perf_counter()
        await asyncio.sleep(max(0, t + n * 0.02 - time.perf_counter()))
      t_end = t_end or time.perf_counter()
      def finished():
        return any(d > t_end for d in c['done'].values()) and (tts is None or all(o[0].first for o in c['tts_obj'].values()))
      await push_sil(15.0, until=finished); await push_sil(1.0)
      rel = lambda x: round((x - t_end) * 1e3, 1) if x else None
      ev = c['events']
      sp_starts = [e[0] for e in ev if e[1] == 'input_audio_buffer.speech_started']
      last_start = max([s for s in sp_starts if s <= t_end + 0.05], default=t - 1)
      created = [(e[0], e[2]) for e in ev if e[1] == 'response.created']
      audio_ev = [(e[0], e[2]) for e in ev if e[1] in ('response.audio.delta', 'response.output_audio.delta')]
      text_ev = [(e[0], e[2]) for e in ev if e[1] in ('response.text.delta', 'response.output_text.delta', 'response.audio_transcript.delta', 'response.output_audio_transcript.delta')]
      # responses created after the caller's last speech onset are the turn's real response; earlier ones were mid-turn
      final_rids = [r for (tc, r) in created if tc >= last_start]
      early_rids = [r for (tc, r) in created if tc < last_start]
      fa = min([x for (x, r) in audio_ev if r in final_rids], default=None)
      ft = min([x for (x, r) in text_ev if r in final_rids], default=None)
      cut = [r for r in early_rids if any(rr == r and x < t_end for (x, rr) in audio_ev)]
      gated_first = None
      if tts is not None:
        for r in final_rids:
          if r in c['tts_obj'] and c['tts_obj'][r][0].first: gated_first = c['tts_obj'][r][0].first
      row = {'ts': ts(), 'arm': arm, 'session': label, 'clip': os.path.basename(clip)[:-4], 'persona': os.path.basename(clip)[:2],
             'ws_open_ms': round((t_open - t0) * 1e3, 1), 'session_updated_ms': round((st['updated'] - t0) * 1e3, 1) if st['updated'] else None,
             'vad_stop_rel_end_ms': rel(min([e[0] for e in ev if e[1] == 'input_audio_buffer.speech_stopped' and e[0] >= last_start], default=None)),
             'transcript_rel_end_ms': rel(max([e[0] for e in ev if e[1] == 'conversation.item.input_audio_transcription.completed'], default=None)),
             'first_text_rel_end_ms': rel(ft), 'first_audio_rel_end_ms': rel(fa), 'gated_first_audio_rel_end_ms': rel(gated_first),
             'gate_us': round(c['gate_us'], 1) if c['gate_us'] else None, 'n_responses': len(created), 'n_early_responses': len(early_rids),
             'n_cutins_audio_before_end': len(cut), 'transcript': c['transcript'].strip(), 'reply': ' || '.join(v for k, v in c['reply'].items() if k in final_rids)[:300],
             'usage': c['usage'], 'err': st['err']}
      out.row(row); print(arm, label, row['clip'], 'audio', row['first_audio_rel_end_ms'], 'text', row['first_text_rel_end_ms'], 'gated', row['gated_first_audio_rel_end_ms'], 'early', len(early_rids), 'cut', len(cut), '|', row['transcript'][:30], '|', row['reply'][:40], flush=True)
    rt.cancel()
async def main():
  aud, out, arm = sys.argv[1], Out(sys.argv[2]), sys.argv[3]
  for p in ('P1', 'P2', 'P4'):
    clips = sorted(os.path.join(aud, f) for f in os.listdir(aud) if f.startswith(p + '_t') and 'clean' not in f)
    try: await session(arm, clips, p, out)
    except Exception as e: print('SESSION FAIL', arm, p, repr(e)[:300], flush=True); out.row({'ts': ts(), 'arm': arm, 'session': p, 'err': repr(e)[:300]})
asyncio.run(main())
