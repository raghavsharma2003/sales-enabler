# g3-cascade-measured (2026-10-18): provider backends for the multi-provider cascade, run ON the Central India VM
# (or in the sandbox for smoke tests). Keys come from env vars injected at runtime; nothing secret is written or printed.
#   LLM:  az:<deployment>          Azure OpenAI v1 chat completions (g3-sin, South India Standard)
#         gm:<model>               Gemini API streamGenerateContent (GEMINI_API_KEY, free tier)
#         or:<model>@<provider>    OpenRouter chat completions, provider pinned, no fallbacks
#   TTS:  az:<voice>               Azure Speech SDK websocket synthesizer (centralindia), 8 kHz mu-law
#         gi:<model>:<voice>       Gemini TTS, Interactions API, stream=true, 8 kHz mu-law, speech_metadata.style
#         gg:<model>:<voice>       Gemini TTS, legacy streamGenerateContent (24 kHz L16; style as a prompt prefix)
import os, time, json, base64, html, threading, csv
import requests
KEYS = {'cin': os.environ.get('CIN_KEY'), 'sin': os.environ.get('SIN_KEY'), 'gem': os.environ.get('GEMINI_API_KEY'), 'or': os.environ.get('OPENROUTER_API_KEY')}
AZ_CHAT = 'https://g3-sin-1018.openai.azure.com/openai/v1/chat/completions'
GEM = 'https://generativelanguage.googleapis.com/v1beta'
ORURL = 'https://openrouter.ai/api/v1/chat/completions'
def ts(): return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
class Out:
  def __init__(self, path): self.path = path; self.w = None; self.f = open(path, 'a', newline='', encoding='utf-8'); self.new = os.path.getsize(path) == 0
  def row(self, d):
    if self.w is None:
      self.w = csv.DictWriter(self.f, fieldnames=list(d.keys()), extrasaction='ignore')
      if self.new: self.w.writeheader()
    self.w.writerow(d); self.f.flush()
_sessions = {}
def sess(name):
  s = _sessions.get(name)
  if s is None: s = _sessions[name] = requests.Session()
  return s

# ---------------- LLM ----------------
GEM_THINK = {'gemini-3.8-flash': {'thinkingLevel': 'low'}}   # 3.8-flash rejects MINIMAL (probe 2026-10-18)
OR_EXTRA = {'openai/gpt-oss-120b': {'reasoning': {'effort': 'low', 'exclude': True}}, 'openai/gpt-oss-20b': {'reasoning': {'effort': 'low', 'exclude': True}}}
def to_gemini(messages):
  sysm = '\n\n'.join(m['content'] for m in messages if m['role'] == 'system')
  contents = []
  for m in messages:
    if m['role'] == 'system': continue
    role = 'model' if m['role'] == 'assistant' else 'user'
    if contents and contents[-1]['role'] == role: contents[-1]['parts'][0]['text'] += '\n' + m['content']
    else: contents.append({'role': role, 'parts': [{'text': m['content']}]})
  return sysm, contents
def llm_stream(arm, messages, cancel_ev=None, max_tokens=150, usage=None, timing=None):
  """Yields text deltas. Fills usage dict (normalised keys) and timing dict ('req','first','done','status')."""
  usage = usage if usage is not None else {}; timing = timing if timing is not None else {}
  kind, rest = arm.split(':', 1)
  timing['req'] = time.perf_counter()
  if kind == 'az':
    body = {'model': rest, 'messages': messages, 'stream': True, 'stream_options': {'include_usage': True}, 'max_tokens': max_tokens, 'temperature': 0.4}
    r = sess('az').post(AZ_CHAT, headers={'api-key': KEYS['sin']}, json=body, stream=True, timeout=30)
  elif kind == 'or':
    model, prov = rest.rsplit('@', 1)
    body = {'model': model, 'messages': messages, 'stream': True, 'usage': {'include': True}, 'max_tokens': max_tokens + (400 if model in OR_EXTRA else 0), 'temperature': 0.4,
            'provider': {'order': [prov], 'allow_fallbacks': False}}
    body.update(OR_EXTRA.get(model, {}))
    r = sess('or').post(ORURL, headers={'Authorization': 'Bearer ' + KEYS['or'], 'HTTP-Referer': 'https://vp-research.invalid', 'X-Title': 'vp-g3-cascade'}, json=body, stream=True, timeout=30)
  elif kind == 'gm':
    sysm, contents = to_gemini(messages)
    body = {'systemInstruction': {'parts': [{'text': sysm}]}, 'contents': contents,
            'generationConfig': {'maxOutputTokens': max_tokens, 'temperature': 0.4, 'thinkingConfig': GEM_THINK.get(rest, {'thinkingLevel': 'minimal'})}}
    r = sess('gm').post(f'{GEM}/models/{rest}:streamGenerateContent?alt=sse', headers={'x-goog-api-key': KEYS['gem']}, json=body, stream=True, timeout=30)
  else: raise ValueError(arm)
  timing['status'] = r.status_code
  if r.status_code != 200:
    timing['err'] = f'{r.status_code} {r.text[:300]}'; timing['done'] = time.perf_counter(); return
  try:
    for line in r.iter_lines():
      if cancel_ev is not None and cancel_ev.is_set(): r.close(); timing['cancelled'] = True; break
      if not line or not line.startswith(b'data:'): continue
      data = line[5:].strip()
      if data == b'[DONE]': break
      d = json.loads(data)
      if kind == 'gm':
        um = d.get('usageMetadata')
        if um: usage.update({'prompt_tokens': um.get('promptTokenCount'), 'cached_tokens': um.get('cachedContentTokenCount', 0), 'completion_tokens': um.get('candidatesTokenCount'),
                             'thought_tokens': um.get('thoughtsTokenCount', 0)})
        for c in d.get('candidates') or []:
          for p in (c.get('content') or {}).get('parts') or []:
            t = p.get('text')
            if t and not p.get('thought'):
              if 'first' not in timing: timing['first'] = time.perf_counter()
              yield t
      else:
        u = d.get('usage')
        if u:
          ptd = u.get('prompt_tokens_details') or {}; ctd = u.get('completion_tokens_details') or {}
          usage.update({'prompt_tokens': u.get('prompt_tokens'), 'cached_tokens': ptd.get('cached_tokens', 0), 'completion_tokens': u.get('completion_tokens'),
                        'thought_tokens': ctd.get('reasoning_tokens', 0), 'or_cost_usd': u.get('cost'), 'provider': d.get('provider')})
        for ch in d.get('choices') or []:
          c = (ch.get('delta') or {}).get('content')
          if c:
            if 'first' not in timing: timing['first'] = time.perf_counter()
            yield c
  except Exception as e: timing['err'] = repr(e)[:200]
  timing['done'] = time.perf_counter()

# ---------------- Gemini TTS ----------------
def gemini_tts_stream(arm, text, style, on_chunk, cancel_ev=None, info=None):
  """arm 'gi:<model>:<voice>' or 'gg:<model>:<voice>'. Calls on_chunk(bytes, fmt) for each audio chunk. Fills info."""
  info = info if info is not None else {}
  kind, model, voice = arm.split(':')
  info['req'] = time.perf_counter()
  if kind == 'gi':
    content = {'type': 'text', 'text': text}
    if style: content['annotations'] = [{'type': 'speech_metadata', 'style': style}]
    body = {'model': model, 'input': [{'type': 'user_input', 'content': [content]}], 'response_format': {'type': 'audio', 'mime_type': 'audio/mulaw', 'sample_rate': 8000},
            'generation_config': {'speech_config': [{'voice': voice}]}, 'stream': True}
    r = sess('gt').post(f'{GEM}/interactions', headers={'x-goog-api-key': KEYS['gem']}, json=body, stream=True, timeout=60); fmt = 'mulaw8k'
  else:
    prompt = (f'Say this in a {style} tone: ' + text) if style else text
    body = {'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}}}
    r = sess('gt').post(f'{GEM}/models/{model}:streamGenerateContent?alt=sse', headers={'x-goog-api-key': KEYS['gem']}, json=body, stream=True, timeout=60); fmt = 'l16_24k'
  info['status'] = r.status_code; info['hdr'] = time.perf_counter()
  if r.status_code != 200:
    info['err'] = f'{r.status_code} {r.text[:700]}'; info['done'] = time.perf_counter(); return info
  nbytes = 0
  try:
    for line in r.iter_lines():
      if cancel_ev is not None and cancel_ev.is_set(): r.close(); info['cancelled'] = True; break
      if not line: continue
      s = line.decode()
      if not s.startswith('data:'): continue
      s = s[5:].strip()
      if s == '[DONE]': break
      e = json.loads(s)
      if kind == 'gi':
        if e.get('event_type') == 'step.delta' and (e.get('delta') or {}).get('type') == 'audio':
          b = base64.b64decode(e['delta']['data'])
          if 'first' not in info: info['first'] = time.perf_counter()
          nbytes += len(b); on_chunk(b, fmt)
        elif e.get('event_type') == 'interaction.completed':
          u = (e.get('interaction') or {}).get('usage') or {}
          info['in_tokens'] = u.get('total_input_tokens'); info['out_tokens'] = u.get('total_output_tokens')
        elif e.get('event_type') in ('error', 'interaction.failed'): info['err'] = json.dumps(e)[:300]
      else:
        for c in e.get('candidates') or []:
          for p in (c.get('content') or {}).get('parts') or []:
            if 'inlineData' in p:
              b = base64.b64decode(p['inlineData']['data'])
              if 'first' not in info: info['first'] = time.perf_counter()
              nbytes += len(b); on_chunk(b, fmt)
        um = e.get('usageMetadata')
        if um: info['in_tokens'] = um.get('promptTokenCount'); info['out_tokens'] = um.get('candidatesTokenCount')
  except Exception as ex: info['err'] = repr(ex)[:200]
  info['done'] = time.perf_counter(); info['bytes'] = nbytes
  info['audio_s'] = nbytes / 8000 if fmt == 'mulaw8k' else nbytes / 48000
  return info

# ---------------- Azure TTS ----------------
try:
  import azure.cognitiveservices.speech as sp
except Exception: sp = None
def az_ssml(voice, t, style=None):
  body = html.escape(t)
  if voice.startswith('en-IN') or voice.startswith('hi-in-'):   # multilingual HD voices: pin the spoken language to Hindi
    body = f"<lang xml:lang='hi-IN'>{body}</lang>"
  return (f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='hi-IN'>"
          f"<voice name='{voice}'>{body}</voice></speak>")
class Synth:
  def __init__(self, voice, fmt=None):
    self.voice = voice
    cfg = sp.SpeechConfig(subscription=KEYS['cin'], region='centralindia'); cfg.set_speech_synthesis_output_format(fmt or sp.SpeechSynthesisOutputFormat.Raw8Khz8BitMonoMULaw)
    self.s = sp.SpeechSynthesizer(speech_config=cfg, audio_config=None); self.c = sp.Connection.from_speech_synthesizer(self.s); self.c.open(True)
    self.owner = None; self.s.synthesizing.connect(self._chunk)
    self.s.speak_ssml_async(az_ssml(voice, 'नमस्ते।')).get(); self.last_used = time.time()
  def _chunk(self, e):
    o = self.owner
    if o is not None: o.on_audio(len(e.result.audio_data))
class Pool:
  def __init__(self, voice, n):
    self.voice = voice; self.free = [Synth(voice) for _ in range(n)]; self.lock = threading.Lock(); self.cold = 0
  def get(self):
    with self.lock:
      if self.free: return self.free.pop()
    self.cold += 1; return Synth(self.voice)
  def put(self, s):
    s.owner = None
    with self.lock: self.free.append(s)
  def replace(self, s):
    def mk():
      try:
        n = Synth(self.voice)
        with self.lock: self.free.append(n)
      except Exception: pass
    threading.Thread(target=mk, daemon=True).start()
  def keepalive(self):
    with self.lock: idle = [s for s in self.free if time.time() - s.last_used > 120]
    for s in idle:
      try: s.s.speak_ssml_async(az_ssml(self.voice, 'जी।')).get(); s.last_used = time.time()
      except Exception: pass
