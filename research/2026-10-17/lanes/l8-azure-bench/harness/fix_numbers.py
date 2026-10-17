# Number check for H6 stimuli (l8-azure-bench, 2026-10-17). The preview generative voice hi-IN-Diya:DragonLatestNeural
# misread prices in some renders (e.g. "Rs 1,299" heard as 199 / 899 / 1999 by two different ASR engines). Rendering is
# non-deterministic for that voice, so a defective clip is re-rendered (same text, voice, rate) up to 4 times until the
# MAI-Transcribe-2 round-trip (locale pinned) contains every number in the source text. Every clip then gets a
# number_check value: ok | asr_wrote_words (no digits in ASR output, cannot check) | mismatch_after_retries.
import os, sys, csv, re, json, html, time, subprocess, requests
HERE = os.path.dirname(os.path.abspath(__file__)); ST = os.path.join(HERE, '..', 'stimuli')
TMP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l8-azure-bench/stim_tmp'
KEY = os.environ['VP_AI_KEY']; S = requests.Session(); MAN = os.path.join(ST, 'manifest.csv')
rows = list(csv.DictReader(open(MAN, encoding='utf-8')))
def ff(*a): subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', *a], check=True, stdin=subprocess.DEVNULL, timeout=120)
def dur(p): return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True, stdin=subprocess.DEVNULL).stdout.strip())
nums = lambda s: set(x.replace(',', '') for x in re.findall(r'\d[\d,]*', str(s)))
LOC = {'hi-IN': 'hi', 'mr-IN': 'mr', 'ta-IN': 'ta', 'en-IN': 'en'}
def asr(path, lang):
  with open(path, 'rb') as f:
    r = S.post('https://vp-research-ai-sea.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15', headers={'Ocp-Apim-Subscription-Key': KEY},
               files={'audio': ('a.wav', f, 'audio/wav'), 'definition': (None, json.dumps({'locales': [lang], 'enhancedMode': {'enabled': True, 'model': 'MAI-Transcribe-2'}}), 'application/json')}, timeout=120)
  return ' '.join(p.get('text', '') for p in r.json().get('combinedPhrases', [])) if r.status_code == 200 else ''
def lang_of(r):
  return {'marathi_mix': 'mr', 'tamil_english': 'ta', 'indian_english': 'en'}.get(r['condition'], 'hi')
for r in rows:
  src = nums(r['text']); hyp = nums(r['roundtrip_asr_mai2_phone'])
  r['render_attempts'] = r.get('render_attempts') or '1'
  if not src: r['number_check'] = 'no_numbers'; continue
  if not hyp: r['number_check'] = 'asr_wrote_words'; continue
  if not (src - hyp): r['number_check'] = 'ok'; continue
  if 'Dragon' not in r['voice']:
    r['number_check'] = 'mismatch_deterministic_voice_not_rerendered'; continue
  pct = r.get('rate_adjust_pct') or '0'
  body = html.escape(r['text']) if pct == '0' else f"<prosody rate='+{pct}%'>{html.escape(r['text'])}</prosody>"
  ssml = f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{r['ssml_lang']}'><voice name='{r['voice']}'>{body}</voice></speak>"
  ok = False
  for att in range(2, 6):
    resp = S.post('https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1', data=ssml.encode('utf-8'), timeout=90,
                  headers={'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm', 'User-Agent': 'l8-stimuli'})
    if resp.status_code != 200: time.sleep(3); continue
    code = r['file_code']; raw = os.path.join(TMP, f'{code}.fix{att}.wav'); open(raw, 'wb').write(resp.content)
    trim = os.path.join(TMP, f'{code}.fix{att}.trim.wav')
    ff('-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', trim)
    mu = os.path.join(TMP, f'{code}.fix{att}.mulaw.wav'); ff('-i', trim, '-af', 'highpass=f=300,lowpass=f=3400', '-ar', '8000', '-c:a', 'pcm_mulaw', mu)
    p16 = os.path.join(TMP, f'{code}.fix{att}.ph16.wav'); ff('-i', mu, '-ar', '16000', '-c:a', 'pcm_s16le', p16)
    h = asr(p16, lang_of(r)); print(code, att, sorted(src), sorted(nums(h)), h[:60], flush=True)
    if nums(h) and not (src - nums(h)):
      ff('-i', trim, '-c:a', 'libmp3lame', '-b:a', '96k', os.path.join(ST, r['wideband_mp3'])); ff('-i', p16, '-c:a', 'libmp3lame', '-b:a', '48k', os.path.join(ST, r['phone_mp3']))
      d = dur(trim); r['duration_s'] = round(d, 2); r['in_8_15s'] = 8.0 <= d <= 15.0
      r['roundtrip_asr_mai2_phone'] = h; r['render_attempts'] = str(att); r['number_check'] = 'ok_after_rerender'; ok = True; break
  if not ok: r['number_check'] = 'mismatch_after_retries'; r['render_attempts'] = '5'
fields = list(rows[0].keys())
for k in ('render_attempts', 'number_check'):
  if k not in fields: fields.append(k)
with open(MAN, 'w', newline='', encoding='utf-8') as f:
  w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)
import collections; print(collections.Counter(r['number_check'] for r in rows))
