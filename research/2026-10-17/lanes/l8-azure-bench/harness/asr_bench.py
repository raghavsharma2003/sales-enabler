# ASR bench runner (l8-azure-bench, 2026-10-17). One engine per invocation; resumable (skips done rows).
# Engines:
#   rt        Azure Speech real-time (Speech SDK 1.52, continuous recognition, file input), locale from manifest
#             (hi-IN for code-switched + non-speech), detailed output -> display + lexical text
#   rt_lid    same, continuous language ID over hi-IN,en-IN,ta-IN,bn-IN,mr-IN,te-IN
#   fast      Azure fast transcription (api 2025-10-15), locale from manifest
#   fast_llm  fast transcription + enhancedMode (LLM Speech, task=transcribe), no locale (doc: Hindi/English only)
#   mai2      fast transcription + enhancedMode model MAI-Transcribe-2, auto language (no locale)
#   mai2_loc  same, with locales=[ISO code of the manifest locale] (hi for code-switched, short answers and non-speech)
#   gpt4o     gpt-4o-transcribe (francecentral deployment); language passed for monolingual sets, auto otherwise
#   gpt4omini gpt-4o-mini-transcribe (francecentral)
# Usage: python asr_bench.py ENGINE BAND(wb|nb) MANIFEST AUDIO_DIR OUT_JSONL [workers] [sets]
import os, sys, json, time, csv, threading, concurrent.futures as cf, requests

ENGINE, BAND, MAN, AUD, OUT = sys.argv[1:6]
WORKERS = int(sys.argv[6]) if len(sys.argv) > 6 else 4
SETS = set(sys.argv[7].split(',')) if len(sys.argv) > 7 else None
SEA = 'https://vp-research-ai-sea.cognitiveservices.azure.com'
FRC = 'https://vp-research-ai-frc.openai.azure.com'
LID_SET = ['hi-IN', 'en-IN', 'ta-IN', 'bn-IN', 'mr-IN', 'te-IN']
ISO = {'hi-IN': 'hi', 'ta-IN': 'ta', 'bn-IN': 'bn', 'mr-IN': 'mr', 'te-IN': 'te', 'en-IN': 'en'}

rows = [r for r in csv.DictReader(open(MAN, encoding='utf-8')) if (SETS is None or r['set'] in SETS)]
done = set()
if os.path.exists(OUT):
  for l in open(OUT, encoding='utf-8'):
    try: done.add(json.loads(l)['uid'])
    except Exception: pass
lock = threading.Lock()
fo = open(OUT, 'a', encoding='utf-8')

def locale_of(r):
  return r['locale'] or 'hi-IN'   # non-speech probe uses the Hindi config a Hindi-belt deployment would run

def http_fast(path, definition):
  with open(path, 'rb') as f:
    files = {'audio': (os.path.basename(path), f, 'audio/wav'), 'definition': (None, json.dumps(definition), 'application/json')}
    r = requests.post(f'{SEA}/speechtotext/transcriptions:transcribe?api-version=2025-10-15', headers={'Ocp-Apim-Subscription-Key': os.environ['VP_AI_KEY']}, files=files, timeout=120)
  if r.status_code != 200: return None, {'status': r.status_code, 'err': r.text[:300]}
  d = r.json()
  text = ' '.join(p.get('text', '') for p in d.get('combinedPhrases', [])).strip()
  locs = sorted({p.get('locale') for p in d.get('phrases', []) if p.get('locale')})
  return text, {'status': 200, 'detected': ','.join(locs), 'duration_ms': d.get('durationMilliseconds')}

def http_gpt(path, dep, lang):
  data = {'model': dep, 'response_format': 'json'}
  if lang: data['language'] = lang
  with open(path, 'rb') as f:
    r = requests.post(f'{FRC}/openai/deployments/{dep}/audio/transcriptions?api-version=2025-03-01-preview', headers={'api-key': os.environ['FRC_KEY']}, files={'file': (os.path.basename(path), f, 'audio/wav')}, data=data, timeout=120)
  if r.status_code != 200: return None, {'status': r.status_code, 'err': r.text[:300]}
  d = r.json()
  return (d.get('text') or '').strip(), {'status': 200, 'usage': d.get('usage')}

def sdk_rt(path, loc, lid):
  import azure.cognitiveservices.speech as sp
  cfg = sp.SpeechConfig(subscription=os.environ['VP_AI_KEY'], region='southeastasia')
  cfg.set_proxy('127.0.0.1', 43273)
  cfg.output_format = sp.OutputFormat.Detailed
  ac = sp.audio.AudioConfig(filename=path)
  if lid:
    cfg.set_property(sp.PropertyId.SpeechServiceConnection_LanguageIdMode, 'Continuous')
    rec = sp.SpeechRecognizer(speech_config=cfg, audio_config=ac, auto_detect_source_language_config=sp.languageconfig.AutoDetectSourceLanguageConfig(languages=LID_SET))
  else:
    cfg.speech_recognition_language = loc
    rec = sp.SpeechRecognizer(speech_config=cfg, audio_config=ac)
  disp, lex, langs = [], [], []; ev = threading.Event(); err = {}
  def on_rec(e):
    if e.result.reason == sp.ResultReason.RecognizedSpeech and e.result.text:
      disp.append(e.result.text)
      try:
        j = json.loads(e.result.json); lex.append(j['NBest'][0].get('Lexical', ''))
      except Exception: lex.append('')
      if lid:
        langs.append(e.result.properties.get(sp.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult) or '')
  def on_cancel(e):
    if e.reason == sp.CancellationReason.Error: err['err'] = str(e.error_details)[:300]
    ev.set()
  rec.recognized.connect(on_rec); rec.canceled.connect(on_cancel); rec.session_stopped.connect(lambda e: ev.set())
  rec.start_continuous_recognition(); ev.wait(timeout=180); rec.stop_continuous_recognition()
  if err: return None, {'status': 'error', **err}
  return ' '.join(disp).strip(), {'status': 200, 'lexical': ' '.join(lex).strip(), 'detected': ','.join(langs)}

def run(r):
  path = os.path.join(AUD, BAND, r['uid'] + '.wav'); loc = locale_of(r)
  t0 = time.perf_counter()
  for attempt in range(4):
    try:
      if ENGINE == 'rt': hyp, meta = sdk_rt(path, loc, False)
      elif ENGINE == 'rt_lid': hyp, meta = sdk_rt(path, loc, True)
      elif ENGINE == 'fast': hyp, meta = http_fast(path, {'locales': [loc]})
      elif ENGINE == 'fast_llm': hyp, meta = http_fast(path, {'enhancedMode': {'enabled': True, 'task': 'transcribe'}})
      elif ENGINE == 'mai2': hyp, meta = http_fast(path, {'enhancedMode': {'enabled': True, 'model': 'MAI-Transcribe-2'}})
      elif ENGINE == 'mai2_loc': hyp, meta = http_fast(path, {'locales': [ISO.get(loc, 'hi')], 'enhancedMode': {'enabled': True, 'model': 'MAI-Transcribe-2'}})
      elif ENGINE == 'gpt4o': hyp, meta = http_gpt(path, 'l8-gpt-4o-transcribe', ISO.get(r['locale']) if r['set'] in ('kathbath', 'nptel_en') else None)
      elif ENGINE == 'gpt4omini': hyp, meta = http_gpt(path, 'l8-gpt-4o-mini-transcribe', ISO.get(r['locale']) if r['set'] in ('kathbath', 'nptel_en') else None)
      else: raise SystemExit('unknown engine')
    except Exception as e:
      hyp, meta = None, {'status': 'exc', 'err': repr(e)[:300]}
    if hyp is not None or str(meta.get('status')) not in ('429', '500', '502', '503', 'exc', 'error'): break
    time.sleep(3 * (attempt + 1))
  row = {'engine': ENGINE, 'band': BAND, 'uid': r['uid'], 'set': r['set'], 'lang': r['lang'], 'locale_cfg': loc, 'dur_s': float(r['dur_s']),
         'hyp': hyp, 'proc_s': round(time.perf_counter() - t0, 3), 'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), **meta}
  with lock:
    fo.write(json.dumps(row, ensure_ascii=False) + '\n'); fo.flush()
  return row

todo = [r for r in rows if r['uid'] not in done]
print(ENGINE, BAND, 'todo', len(todo), flush=True)
with cf.ThreadPoolExecutor(WORKERS) as ex:
  for i, row in enumerate(ex.map(run, todo)):
    if i % 50 == 0: print(i, row['uid'], row.get('status'), (row.get('hyp') or row.get('err') or '')[:80], flush=True)
print('done', ENGINE, BAND)
