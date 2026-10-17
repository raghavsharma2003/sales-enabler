# Render H6 listener-panel stimuli (l8-azure-bench, 2026-10-17). Do not rate them here.
# Text: stimuli/stimuli-text.json (gpt-6-sol). Voices chosen from objective l5 round-trip data and the l5 panel
# protocol candidate list, not by ear. Each region keeps at least one voice that speaks every condition, so register
# can be compared within voice (voice is a nuisance factor, l5 panel protocol 3.3).
# Processing (l5 protocol 3.4): synthesize 24 kHz PCM, trim leading/trailing silence to ~150 ms, loudness-normalise
# to -16 LUFS, export wideband mp3 and a phone-band mp3 (300-3400 Hz, 8 kHz G.711 mu-law round trip).
# Blind file names (region prefix + random code); manifest.csv holds the key.
# Usage: python render_stimuli.py
import os, sys, json, csv, time, html, random, subprocess, hashlib, requests
HERE = os.path.dirname(os.path.abspath(__file__)); ST = os.path.join(HERE, '..', 'stimuli')
TMP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l8-azure-bench/stim_tmp'
os.makedirs(TMP, exist_ok=True); os.makedirs(os.path.join(ST, 'wideband'), exist_ok=True); os.makedirs(os.path.join(ST, 'phone'), exist_ok=True)
T = json.load(open(os.path.join(ST, 'stimuli-text.json'), encoding='utf-8'))['content']
PLAN = [  # region, condition (text key), voice, xml:lang, voice role
  ('bihar', 'neutral_hinglish', 'hi-IN-Diya:DragonLatestNeural', 'hi-IN', 'within-voice F'),
  ('bihar', 'bhojpuri_mix', 'hi-IN-Diya:DragonLatestNeural', 'hi-IN', 'within-voice F'),
  ('bihar', 'neutral_hinglish', 'hi-IN-MadhurNeural', 'hi-IN', 'within-voice M'),
  ('bihar', 'bhojpuri_mix', 'hi-IN-MadhurNeural', 'hi-IN', 'within-voice M'),
  ('tamilnadu', 'tamil_english', 'en-IN-Meera:DragonHDLatestNeural', 'ta-IN', 'within-voice F (multilingual HD)'),
  ('tamilnadu', 'neutral_hinglish', 'en-IN-Meera:DragonHDLatestNeural', 'hi-IN', 'within-voice F (multilingual HD)'),
  ('tamilnadu', 'indian_english', 'en-IN-Meera:DragonHDLatestNeural', 'en-IN', 'within-voice F (multilingual HD)'),
  ('tamilnadu', 'tamil_english', 'en-IN-Arjun:DragonHDLatestNeural', 'ta-IN', 'within-voice M (multilingual HD)'),
  ('tamilnadu', 'neutral_hinglish', 'en-IN-Arjun:DragonHDLatestNeural', 'hi-IN', 'within-voice M (multilingual HD)'),
  ('tamilnadu', 'indian_english', 'en-IN-Arjun:DragonHDLatestNeural', 'en-IN', 'within-voice M (multilingual HD)'),
  ('tamilnadu', 'tamil_english', 'ta-IN-PallaviNeural', 'ta-IN', 'native-locale voice F (reference)'),
  ('maharashtra', 'marathi_mix', 'mr-IN-AarohiNeural', 'mr-IN', 'within-voice F (native locale)'),
  ('maharashtra', 'neutral_hinglish', 'mr-IN-AarohiNeural', 'mr-IN', 'within-voice F (native locale)'),
  ('maharashtra', 'marathi_mix', 'mr-IN-ManoharNeural', 'mr-IN', 'within-voice M (native locale)'),
  ('maharashtra', 'neutral_hinglish', 'mr-IN-ManoharNeural', 'mr-IN', 'within-voice M (native locale)'),
  ('maharashtra', 'marathi_mix', 'hi-IN-Diya:DragonLatestNeural', 'hi-IN', 'within-voice F (Hindi voice)'),
  ('maharashtra', 'neutral_hinglish', 'hi-IN-Diya:DragonLatestNeural', 'hi-IN', 'within-voice F (Hindi voice)'),
]
KEY = os.environ['VP_AI_KEY']
SESS = requests.Session()
def synth(ssml):
  # REST synthesis with a hard timeout (an SDK call hung once on a DragonHD voice)
  for attempt in range(4):
    try:
      r = SESS.post('https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1', data=ssml.encode('utf-8'), timeout=90,
                    headers={'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm', 'User-Agent': 'l8-stimuli'})
      if r.status_code == 200 and len(r.content) > 1000: return r.content, None
      err = f'{r.status_code} {r.text[:200]}'
    except Exception as e:
      err = repr(e)[:200]
    time.sleep(3 * (attempt + 1))
  return None, err
MAN = os.path.join(ST, 'manifest.csv')
rows = list(csv.DictReader(open(MAN, encoding='utf-8'))) if os.path.exists(MAN) else []
have = {(r['turn'], r['region'], r['condition'], r['voice']) for r in rows}
chars = 0

def ff(*a): subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', *a], check=True, stdin=subprocess.DEVNULL, timeout=120)
def dur(p):
  return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout.strip())

def asr_mai(path):
  with open(path, 'rb') as f:
    r = requests.post('https://vp-research-ai-sea.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15', headers={'Ocp-Apim-Subscription-Key': KEY},
                      files={'audio': ('a.wav', f, 'audio/wav'), 'definition': (None, json.dumps({'enhancedMode': {'enabled': True, 'model': 'MAI-Transcribe-2'}}), 'application/json')}, timeout=120)
  if r.status_code != 200: return '', ''
  d = r.json(); return ' '.join(p.get('text', '') for p in d.get('combinedPhrases', [])), ','.join(sorted({p.get('locale', '') for p in d.get('phrases', [])}))

for turn in sorted(T):
  for region, cond, voice, lang, role in PLAN:
    text = T[turn][cond]
    if (turn, region, cond, voice) in have: continue
    ssml = f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{lang}'><voice name='{voice}'>{html.escape(text)}</voice></speak>"
    audio, err = synth(ssml); chars += len(text)
    if audio is None:
      print('FAIL', turn, region, cond, voice, err, flush=True); continue
    code = {'bihar': 'B', 'tamilnadu': 'T', 'maharashtra': 'M'}[region] + '_' + hashlib.sha1(f'{turn}|{region}|{cond}|{voice}|l8-2026-10-17'.encode()).hexdigest()[:6]
    raw = os.path.join(TMP, code + '.raw.wav'); open(raw, 'wb').write(audio)
    trim = os.path.join(TMP, code + '.trim.wav')
    # trim leading/trailing silence (-50 dB), keep ~150 ms pads, then -16 LUFS
    ff('-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', trim)
    wb = os.path.join(ST, 'wideband', code + '.mp3'); ff('-i', trim, '-c:a', 'libmp3lame', '-b:a', '96k', wb)
    ph_tmp = os.path.join(TMP, code + '.mulaw.wav'); ff('-i', trim, '-af', 'highpass=f=300,lowpass=f=3400', '-ar', '8000', '-c:a', 'pcm_mulaw', ph_tmp)
    ph16 = os.path.join(TMP, code + '.ph16.wav'); ff('-i', ph_tmp, '-ar', '16000', '-c:a', 'pcm_s16le', ph16)
    ph = os.path.join(ST, 'phone', code + '.mp3'); ff('-i', ph16, '-c:a', 'libmp3lame', '-b:a', '48k', ph)
    d = dur(trim)
    hyp, loc = asr_mai(ph16)
    row = {'file_code': code, 'region': region, 'turn': turn, 'condition': cond, 'voice': voice, 'ssml_lang': lang, 'voice_role': role,
           'duration_s': round(d, 2), 'in_8_15s': 8.0 <= d <= 15.0, 'wideband_mp3': f'wideband/{code}.mp3', 'phone_mp3': f'phone/{code}.mp3',
           'text': text, 'gloss_en': T[turn]['gloss_en'], 'roundtrip_asr_mai2_phone': hyp, 'roundtrip_detected_lang': loc,
           'text_model': 'gpt-6-sol (l8-gpt-6-sol-dz)', 'rendered': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    rows.append(row); print(code, turn, region, cond, voice, round(d, 1), loc, hyp[:50], flush=True)
    with open(MAN, 'w', newline='', encoding='utf-8') as f:
      w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print('clips', len(rows), 'tts chars this run', chars, 'out of 8-15 s:', sum(str(r['in_8_15s']) != 'True' for r in rows))
