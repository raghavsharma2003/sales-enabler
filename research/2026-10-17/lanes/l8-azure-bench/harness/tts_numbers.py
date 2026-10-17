# TTS price/number reading probe (l8-azure-bench, 2026-10-17). Prompted by hi-IN-Diya:DragonLatestNeural misreading
# "Rs 1,299" in most stimulus renders. 10 Hinglish sentences with Indian-format amounts, dates and times x 8 voices x
# 2 renders; each render is transcribed by MAI-Transcribe-2 with locale pinned to hi; a render passes if every number
# in the source appears in the transcript. If the transcript has no digits at all the render is "unchecked".
# Usage: python tts_numbers.py OUT_CSV
import os, sys, csv, re, json, html, time, requests
KEY = os.environ['VP_AI_KEY']; S = requests.Session()
TEXTS = ['आपका premium ₹24,500 सालाना है।', 'आपकी EMI ₹2,950 महीना बनेगी।', 'आपका order ₹1,299 का है।', 'इस bike की on-road price ₹82,500 है।',
         'Quarterly option ₹6,300 का है।', 'ये phone ₹1,49,999 का है।', 'Extra premium ₹18,000 से ₹22,000 के बीच होगा।', 'Advisor आपको 3:30 बजे call करेंगे।',
         'Renewal की date 15 नवंबर 2026 है।', 'आपका due amount ₹7,845 है।']
VOICES = ['hi-IN-SwaraNeural', 'hi-IN-KavyaNeural', 'hi-IN-MadhurNeural', 'en-IN-AartiIndicNeural', 'hi-IN-Diya:DragonLatestNeural',
          'en-IN-Meera:DragonHDLatestNeural', 'en-IN-Aarti:DragonHDLatestNeural', 'hi-IN-Kavya:MAI-Voice-2.1', 'hi-IN-Kavya:MAI-Voice-2.1-Flash']
nums = lambda s: set(x.replace(',', '') for x in re.findall(r'\d[\d,:]*\d|\d', str(s)))
def tts(v, t):
  ssml = f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='hi-IN'><voice name='{v}'>{html.escape(t)}</voice></speak>"
  for _ in range(3):
    r = S.post('https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1', data=ssml.encode('utf-8'), timeout=60,
               headers={'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'riff-16khz-16bit-mono-pcm', 'User-Agent': 'l8-num'})
    if r.status_code == 200: return r.content
    time.sleep(2)
def asr(wav):
  r = S.post('https://vp-research-ai-sea.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15', headers={'Ocp-Apim-Subscription-Key': KEY},
             files={'audio': ('a.wav', wav, 'audio/wav'), 'definition': (None, json.dumps({'locales': ['hi'], 'enhancedMode': {'enabled': True, 'model': 'MAI-Transcribe-2'}}), 'application/json')}, timeout=120)
  return ' '.join(p.get('text', '') for p in r.json().get('combinedPhrases', [])) if r.status_code == 200 else None
out = open(sys.argv[1], 'w', newline='', encoding='utf-8'); w = csv.writer(out); w.writerow(['voice', 'render', 'text', 'asr', 'src_numbers', 'asr_numbers', 'result'])
for rep in (1, 2):
  for v in VOICES:
    for t in TEXTS:
      a = tts(v, t); h = asr(a) if a else None
      sn, hn = nums(t.replace('₹', '')), nums(h or '')
      res = 'tts_fail' if a is None else 'asr_fail' if h is None else 'unchecked_no_digits' if not hn else 'ok' if sn <= hn else 'mismatch'
      w.writerow([v, rep, t, h, ' '.join(sorted(sn)), ' '.join(sorted(hn)), res]); out.flush()
      print(rep, v, res, sorted(sn), sorted(hn), flush=True)
