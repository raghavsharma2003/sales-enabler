# Synthesize (a) a short-answer ASR probe and (b) caller turns for the Voice Live reference (l8-azure-bench, 2026-10-17).
# Synthetic speech is cleaner than a real caller, so detection rates here are an upper bound.
# Output: RAW/shortset/{wb,nb}/*.wav + shortset/manifest.csv (same columns as the ASR manifest), RAW/caller/*.wav
import os, sys, csv, html, subprocess, time
import azure.cognitiveservices.speech as sp
RAW = sys.argv[1]
KEY = os.environ['VP_AI_KEY']
cfg = sp.SpeechConfig(subscription=KEY, region='southeastasia'); cfg.set_proxy('127.0.0.1', 43273)
cfg.set_speech_synthesis_output_format(sp.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm)
syn = sp.SpeechSynthesizer(speech_config=cfg, audio_config=None)
def tts(text, voice, lang, path, pad_ms=500):
  ssml = (f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{lang}'><voice name='{voice}'>"
          f"<break time='{pad_ms}ms'/>{html.escape(text)}<break time='{pad_ms}ms'/></voice></speak>")
  for _ in range(3):
    r = syn.speak_ssml_async(ssml).get()
    if r.reason == sp.ResultReason.SynthesizingAudioCompleted:
      open(path, 'wb').write(r.audio_data); return len(text)
    time.sleep(2)
  raise RuntimeError('tts failed ' + text)

SHORT = ['हाँ', 'हाँ जी', 'जी', 'ओके', 'हम्म', 'नहीं', 'ठीक है', 'बिल्कुल', 'अच्छा', 'हाँ बोलिए', 'नहीं चाहिए', 'कल', 'दो बजे', 'हैलो', 'कौन', 'चलेगा']
VOICES = ['hi-IN-MadhurNeural', 'hi-IN-SwaraNeural', 'hi-IN-AaravNeural', 'hi-IN-AnanyaNeural']
os.makedirs(f'{RAW}/shortset/wb', exist_ok=True); os.makedirs(f'{RAW}/shortset/nb', exist_ok=True)
rows = []; chars = 0
for i, w in enumerate(SHORT):
  for v in (VOICES[i % 4], VOICES[(i + 1) % 4]):
    uid = f'short_{i:02d}_{v.split("-")[2].replace("Neural", "").lower()}'
    p = f'{RAW}/shortset/wb/{uid}.wav'; chars += tts(w, v, 'hi-IN', p)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', p, '-af', 'highpass=f=300,lowpass=f=3400', '-ar', '8000', '-c:a', 'pcm_mulaw', f'{RAW}/shortset/tmp.wav'], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f'{RAW}/shortset/tmp.wav', '-ar', '16000', '-c:a', 'pcm_s16le', f'{RAW}/shortset/nb/{uid}.wav'], check=True)
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout)
    rows.append({'set': 'short', 'uid': uid, 'lang': 'hi', 'locale': 'hi-IN', 'ref': w, 'dur_s': round(d, 3), 'speaker': v, 'gender': '', 'label': 'synthetic short answer', 'licence': 'synthetic (Azure TTS, this lane)'})
with open(f'{RAW}/shortset/manifest.csv', 'w', newline='', encoding='utf-8') as f:
  wr = csv.DictWriter(f, fieldnames=list(rows[0].keys())); wr.writeheader(); wr.writerows(rows)

CALLER = ['हाँ बोलिए, इस बार premium कितना है?', 'quarterly में दे सकते हैं क्या?', 'हाँ', 'आप इंसान हो या robot?',
          'मम्मी को add करना है, उनकी age सत्तर है।', 'कल शाम साढ़े पाँच बजे call करना।', 'ओके', 'ठीक है, link भेज दो।']
os.makedirs(f'{RAW}/caller', exist_ok=True)
for i, t in enumerate(CALLER):
  chars += tts(t, 'hi-IN-MadhurNeural', 'hi-IN', f'{RAW}/caller/caller_{i}.wav', pad_ms=50)
print('short clips', len(rows), 'caller', len(CALLER), 'tts chars', chars)
