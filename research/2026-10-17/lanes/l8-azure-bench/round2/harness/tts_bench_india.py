# r2-latency-india (2026-10-17): TTS time-to-first-audio measured FROM the Central India VM.
# Speech SDK websocket, one synthesizer per (region, voice) with the connection pre-opened and warmed (as a live call
# would hold it). Records client time to first audio chunk (synthesizing event) plus SDK-reported service latency.
# Hinglish texts (Devanagari + English words) from round 1's tts_texts.py; ~18-30 words each.
# Usage: python tts_bench_india.py OUT_CSV ROUNDS
import os, sys, time, html, random
import azure.cognitiveservices.speech as sp
from r2common import KEYS, SPEECH_REGION_KEY, Out, ts
from tts_texts import TEXTS
F16 = sp.SpeechSynthesisOutputFormat.Raw16Khz16BitMonoPcm; F8 = sp.SpeechSynthesisOutputFormat.Raw8Khz8BitMonoMULaw
ARMS = [(r, v, F16, 'pcm16k') for r in ('centralindia', 'southeastasia') for v in
        ('hi-IN-SwaraNeural', 'hi-IN-KavyaNeural', 'en-IN-Meera:DragonHDLatestNeural', 'hi-IN-Kavya:MAI-Voice-2.1-Flash')]
ARMS += [('centralindia', 'hi-IN-SwaraNeural', F8, 'mulaw8k')]
def ssml(v, t): return f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='hi-IN'><voice name='{v}'>{html.escape(t)}</voice></speak>"
class Syn:
  def __init__(self, region, fmt):
    cfg = sp.SpeechConfig(subscription=KEYS[SPEECH_REGION_KEY[region]], region=region); cfg.set_speech_synthesis_output_format(fmt)
    self.s = sp.SpeechSynthesizer(speech_config=cfg, audio_config=None); self.c = sp.Connection.from_speech_synthesizer(self.s); self.c.open(True)
    self.first = None; self.s.synthesizing.connect(self._chunk)
  def _chunk(self, e):
    if self.first is None: self.first = time.perf_counter()
  def run(self, v, t):
    self.first = None; t0 = time.perf_counter(); r = self.s.speak_ssml_async(ssml(v, t)).get(); t1 = time.perf_counter()
    P = r.properties; g = lambda pid: P.get_property(pid) if P else None
    ok = r.reason == sp.ResultReason.SynthesizingAudioCompleted
    return {'ttfb_ms': round((self.first - t0) * 1e3, 1) if self.first else None, 'total_ms': round((t1 - t0) * 1e3, 1), 'audio_bytes': len(r.audio_data) if ok else 0,
            'sdk_first_byte_ms': g(sp.PropertyId.SpeechServiceResponse_SynthesisFirstByteLatencyMs), 'sdk_service_ms': g(sp.PropertyId.SpeechServiceResponse_SynthesisServiceLatencyMs),
            'ok': ok, 'err': '' if ok else (r.cancellation_details.error_details[:200] if r.reason == sp.ResultReason.Canceled else str(r.reason))}
if __name__ == '__main__':
  out = Out(sys.argv[1]); rounds = int(sys.argv[2]); syn = {}
  for a in ARMS:
    syn[a] = Syn(a[0], a[2]); syn[a].run(a[1], 'नमस्ते।')   # warm
  texts = TEXTS['hinglish']; random.seed(5)
  for rd in range(rounds):
    order = ARMS[:]; random.shuffle(order)
    for a in order:
      t = texts[rd % len(texts)]
      try: res = syn[a].run(a[1], t)
      except Exception as e: res = {'ok': False, 'err': repr(e)[:200]}
      row = {'ts': ts(), 'round': rd, 'region': a[0], 'voice': a[1], 'format': a[3], 'chars': len(t)}; row.update(res); out.row(row)
      print(rd, a[0], a[1], a[3], row.get('ttfb_ms'), row.get('sdk_first_byte_ms'), row.get('err', '')[:80], flush=True)
