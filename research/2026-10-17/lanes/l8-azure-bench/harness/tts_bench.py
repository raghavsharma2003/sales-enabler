# TTS latency bench (l8-azure-bench, 2026-10-17): Azure Speech in southeastasia, Indian voices.
# Arm "ws": Speech SDK 1.52 (websocket v1), one synthesizer per voice, connection pre-opened (warm, as a live
#   call would hold it). Records client time to first audio chunk (synthesizing event), client finish time, audio
#   duration, and the SDK-reported service-side latency properties.
# Arm "rest": HTTP POST /cognitiveservices/v1 with a streamed (chunked) response on a keep-alive session; records
#   time to first body byte.
# Output format raw-16khz-16bit-mono-pcm (what a telephony bridge would resample to 8 kHz).
# Usage: python tts_bench.py OUT_CSV ROUNDS
import os, sys, time, csv, threading, random, html, requests
import azure.cognitiveservices.speech as sp
sys.path.insert(0, os.path.dirname(__file__))
from tts_texts import TEXTS

KEY = os.environ['VP_AI_KEY']; REGION = 'southeastasia'
VOICES = [  # (voice, text set)
  ('hi-IN-SwaraNeural', 'hinglish'), ('hi-IN-KavyaNeural', 'hinglish'), ('hi-IN-MadhurNeural', 'hinglish'),
  ('en-IN-AartiIndicNeural', 'hinglish'),
  ('hi-IN-Diya:DragonLatestNeural', 'hinglish'),
  ('en-IN-Aarti:DragonHDLatestNeural', 'hinglish'), ('en-IN-Meera:DragonHDLatestNeural', 'hinglish'),
  ('hi-IN-Kavya:MAI-Voice-2.1', 'hinglish'), ('hi-IN-Kavya:MAI-Voice-2.1-Flash', 'hinglish'),
  ('ta-IN-PallaviNeural', 'tamil'), ('mr-IN-AarohiNeural', 'marathi'),
]
LOCALE = {'hinglish': 'hi-IN', 'tamil': 'ta-IN', 'marathi': 'mr-IN'}

def ssml(voice, text, lang):
  return f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{lang}'><voice name='{voice}'>{html.escape(text)}</voice></speak>"

class WS:
  def __init__(self, voice):
    cfg = sp.SpeechConfig(subscription=KEY, region=REGION); cfg.set_proxy('127.0.0.1', 43273)
    cfg.set_speech_synthesis_output_format(sp.SpeechSynthesisOutputFormat.Raw16Khz16BitMonoPcm)
    self.s = sp.SpeechSynthesizer(speech_config=cfg, audio_config=None)
    self.conn = sp.Connection.from_speech_synthesizer(self.s); self.conn.open(True)
    self.first = None; self.nbytes = 0
    def on_chunk(e):
      if self.first is None: self.first = time.perf_counter()
      self.nbytes += len(e.result.audio_data)
    self.s.synthesizing.connect(on_chunk)
  def run(self, voice, text, lang):
    self.first = None; self.nbytes = 0
    t0 = time.perf_counter(); r = self.s.speak_ssml_async(ssml(voice, text, lang)).get(); t1 = time.perf_counter()
    P = r.properties
    g = lambda pid: P.get_property(pid) if P else None
    ok = r.reason == sp.ResultReason.SynthesizingAudioCompleted
    err = None if ok else (r.cancellation_details.error_details if r.reason == sp.ResultReason.Canceled else str(r.reason))
    audio_s = len(r.audio_data) / 32000 if ok else None
    return {'ttfb_ms': round((self.first - t0) * 1000, 1) if self.first else None, 'total_ms': round((t1 - t0) * 1000, 1), 'audio_s': round(audio_s, 3) if audio_s else None,
            'sdk_first_byte_ms': g(sp.PropertyId.SpeechServiceResponse_SynthesisFirstByteLatencyMs), 'sdk_finish_ms': g(sp.PropertyId.SpeechServiceResponse_SynthesisFinishLatencyMs),
            'sdk_service_ms': g(sp.PropertyId.SpeechServiceResponse_SynthesisServiceLatencyMs), 'sdk_network_ms': g(sp.PropertyId.SpeechServiceResponse_SynthesisNetworkLatencyMs),
            'ok': ok, 'err': (err or '')[:200]}

SESS = requests.Session()
def rest(voice, text, lang):
  h = {'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'raw-16khz-16bit-mono-pcm', 'User-Agent': 'l8-bench'}
  t0 = time.perf_counter(); first = None; n = 0
  r = SESS.post(f'https://{REGION}.tts.speech.microsoft.com/cognitiveservices/v1', headers=h, data=ssml(voice, text, lang).encode('utf-8'), stream=True, timeout=60)
  for chunk in r.iter_content(chunk_size=1024):
    if chunk:
      if first is None: first = time.perf_counter()
      n += len(chunk)
  t1 = time.perf_counter()
  return {'ttfb_ms': round((first - t0) * 1000, 1) if first else None, 'total_ms': round((t1 - t0) * 1000, 1), 'audio_s': round(n / 32000, 3) if r.status_code == 200 else None,
          'ok': r.status_code == 200, 'err': '' if r.status_code == 200 else r.text[:200]}

if __name__ == '__main__':
  out, rounds = sys.argv[1], int(sys.argv[2])
  arms = os.environ.get('ARMS', 'ws,rest').split(',')
  ws = {v: WS(v) for v, _ in VOICES} if 'ws' in arms else {}
  # warm each websocket with one short request (not recorded)
  for v, ts in VOICES:
    if v in ws: ws[v].run(v, 'नमस्ते।' if ts != 'tamil' else 'வணக்கம்.', LOCALE[ts])
  new = not os.path.exists(out); f = open(out, 'a', newline='', encoding='utf-8'); w = None
  random.seed(3)
  for rd in range(rounds):
    order = VOICES[:]; random.shuffle(order)
    for v, ts in order:
      text = TEXTS[ts][rd % len(TEXTS[ts])]
      for arm in arms:
        try:
          res = ws[v].run(v, text, LOCALE[ts]) if arm == 'ws' else rest(v, text, LOCALE[ts])
        except Exception as e:
          res = {'ok': False, 'err': repr(e)[:200]}
        row = {'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'round': rd, 'arm': arm, 'voice': v, 'text_set': ts, 'chars': len(text),
               'ttfb_ms': None, 'total_ms': None, 'audio_s': None, 'sdk_first_byte_ms': None, 'sdk_finish_ms': None, 'sdk_service_ms': None, 'sdk_network_ms': None, 'ok': None, 'err': None}
        row.update(res)
        if w is None:
          w = csv.DictWriter(f, fieldnames=list(row.keys()))
          if new: w.writeheader()
        w.writerow(row); f.flush()
        print(rd, arm, v, row['ttfb_ms'], row['total_ms'], row['audio_s'], row.get('sdk_service_ms'), (row.get('err') or '')[:60], flush=True)
