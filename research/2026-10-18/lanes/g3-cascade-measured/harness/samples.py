# g3-cascade-measured (2026-10-18): matched expressive samples for the later listener panel (NOT rated here).
# Six emotional lines (Hindi/Hinglish, Devanagari + Latin English words), each rendered by:
#   gemini-3.8-flash-tts and gemini-3.8-flash-lite-tts, voice Despina, Interactions API unary, speech_metadata.style
#   Azure en-IN-Aarti:DragonHDLatestNeural and hi-in-diya:DragonHDOmniIndicNeural (centralindia REST; no style control:
#   DragonHD infers emotion from text), plus hi-IN-Kavya:MAI-Voice-2.1 with mstts:express-as (preview, styled) as an
#   extra Azure expressive reference.
# Output: samples/<line>__<engine>.mp3 (mono 64 kbps) + samples/manifest.csv. Keys read at runtime, never written.
# Usage: python samples.py gemini MODEL | azure
import os, sys, csv, json, time, base64, subprocess, html, requests
SP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'samples')
RAW = f'{SP}/research-raw-1018/g3-cascade-measured/samples_wav'
LINES = [
  ('L1_worried', 'worried, anxious, voice slightly shaky', 'fearful',
   'मुझे सच में बहुत tension हो रही है… पापा की report अभी तक नहीं आई, और doctor phone ही नहीं उठा रहे।'),
  ('L2_confused_elderly', 'slow, confused and hesitant, soft', 'confused',
   'बेटा, ज़रा धीरे बोलो… ये OTP क्या होता है? मेरे phone पे तो कुछ आया ही नहीं, मैं समझी नहीं।'),
  ('L3_angry', 'angry, frustrated, raised voice', 'angry',
   'तीसरी बार call कर रही हूँ! हर बार बोलते हो कल हो जाएगा, आज फिर वही बात। ये बिल्कुल ठीक नहीं है।'),
  ('L4_relieved', 'relieved, exhaling, grateful', 'relieved',
   'अरे, हो गया? Thank God… सच बताऊँ, कल रात से नींद नहीं आई थी। बहुत-बहुत शुक्रिया।'),
  ('L5_celebratory', 'excited, joyful, celebratory', 'joyful',
   'सुनो सुनो! मेरा selection हो गया! पहली ही try में! आज तो party बनती है, पक्का!'),
  ('L6_rushed', 'speaking rapidly, hurried', 'determined',
   'हाँ हाँ, सुनिए, मेरे पास बस दो मिनट हैं, meeting में जाना है — जल्दी से बता दीजिए क्या करना है।'),
]
def envfile(p): return dict(l.strip().split('=', 1) for l in open(p) if '=' in l and not l.startswith('#'))
def to_mp3(wav, mp3):
  subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-b:a', '64k', mp3], check=True)
def manifest(row):
  p = os.path.join(OUT, 'manifest.csv'); new = not os.path.exists(p)
  with open(p, 'a', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(row.keys()))
    if new: w.writeheader()
    w.writerow(row)
def dur(wav):
  r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], capture_output=True, text=True)
  try: return round(float(r.stdout.strip()), 2)
  except Exception: return None
def gemini(model):
  K = envfile(f'{SP}/vp-gemini-or.env')['GEMINI_TEST_KEY']
  for lid, style, _, text in LINES:
    tag = 'gflash' if model == 'gemini-3.8-flash-tts' else 'gflashlite'
    mp3 = os.path.join(OUT, f'{lid}__{tag}-Despina.mp3')
    if os.path.exists(mp3): continue
    body = {'model': model, 'input': [{'type': 'user_input', 'content': [{'type': 'text', 'text': text, 'annotations': [{'type': 'speech_metadata', 'style': style}]}]}],
            'response_format': {'type': 'audio'}, 'generation_config': {'speech_config': [{'voice': 'Despina'}]}}
    for attempt in range(4):
      r = requests.post('https://generativelanguage.googleapis.com/v1beta/interactions', headers={'x-goog-api-key': K}, json=body, timeout=120)
      if r.status_code == 200: break
      print(lid, model, r.status_code, r.text[:300], flush=True)
      if 'per day' in r.text: return
      time.sleep(25 * (attempt + 1))
    if r.status_code != 200: continue
    d = r.json(); data = None; usage = (d.get('usage') or {})
    for st in d.get('steps') or []:
      for c in st.get('content') or []:
        if c.get('type') == 'audio': data = c.get('data')
    if data is None: data = (d.get('output_audio') or {}).get('data')
    if data is None: print('no audio', json.dumps(d)[:300]); continue
    wav = os.path.join(RAW, f'{lid}__{tag}.wav'); open(wav, 'wb').write(base64.b64decode(data)); to_mp3(wav, mp3)
    manifest({'line_id': lid, 'engine': f'{model} (Interactions API, unary)', 'voice': 'Despina', 'style_or_ssml': f'speech_metadata.style="{style}"', 'text': text,
              'file': os.path.basename(mp3), 'duration_s': dur(wav), 'in_tokens': usage.get('total_input_tokens'), 'out_tokens': usage.get('total_output_tokens'), 'rendered_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
    print(lid, model, 'ok', dur(wav), flush=True); time.sleep(22)
def azure():
  sys.argv = sys.argv[:1]; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import vm_ops
  K = vm_ops.acct_key('g3-cin')
  for lid, style, mai_style, text in LINES:
    for voice, tag, styled in (('en-IN-Aarti:DragonHDLatestNeural', 'azDragonHD-Aarti', False), ('hi-in-diya:DragonHDOmniIndicNeural', 'azDragonHDOmniIndic-Diya', False),
                               ('hi-IN-Kavya:MAI-Voice-2.1', 'azMAI21-Kavya-styled', True)):
      mp3 = os.path.join(OUT, f'{lid}__{tag}.mp3')
      if os.path.exists(mp3): continue
      inner = html.escape(text)
      if voice.startswith('en-IN') or voice.startswith('hi-in-'): inner = f"<lang xml:lang='hi-IN'>{inner}</lang>"
      if styled: inner = f"<mstts:express-as style='{mai_style}'>{inner}</mstts:express-as>"
      ssml = (f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='hi-IN'>"
              f"<voice name='{voice}'>{inner}</voice></speak>")
      r = requests.post('https://centralindia.tts.speech.microsoft.com/cognitiveservices/v1', headers={'Ocp-Apim-Subscription-Key': K, 'Content-Type': 'application/ssml+xml',
                        'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm', 'User-Agent': 'vp-g3'}, data=ssml.encode('utf-8'), timeout=120)
      if r.status_code != 200: print(lid, voice, r.status_code, r.text[:200]); continue
      wav = os.path.join(RAW, f'{lid}__{tag}.wav'); open(wav, 'wb').write(r.content); to_mp3(wav, mp3)
      manifest({'line_id': lid, 'engine': f'Azure Speech centralindia REST ({voice})', 'voice': voice, 'style_or_ssml': (f'mstts:express-as style={mai_style}' if styled else 'none (DragonHD infers emotion from text)'),
                'text': text, 'file': os.path.basename(mp3), 'duration_s': dur(wav), 'in_tokens': len(text), 'out_tokens': '', 'rendered_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
      print(lid, voice, 'ok', dur(wav), flush=True)
if __name__ == '__main__':
  os.makedirs(OUT, exist_ok=True); os.makedirs(RAW, exist_ok=True)
  if sys.argv[1] == 'gemini': gemini(sys.argv[2])
  else: azure()
