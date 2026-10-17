# Voice Live reference (l8-azure-bench, 2026-10-17): session setup and turn latency, small n.
# A synthetic caller (Azure TTS, hi-IN-MadhurNeural, 8 Hinglish turns) is streamed at real-time pace in 20 ms frames
# (16 kHz PCM16) with continuous silence between turns, as an open phone line would. Nothing is played back, so no
# echo. Per turn: end of caller speech -> speech_stopped (endpointing), -> transcript, -> first response audio delta.
# Network RTT from this container (Ohio, via proxy) to southeastasia is ~250 ms and is NOT subtracted here.
# Usage: python voicelive_bench.py CALLER_DIR OUT_CSV ARM [sessions]
import os, sys, json, time, base64, asyncio, ssl, csv, glob
import numpy as np, soundfile as sf, websockets

CALLER, OUT, ARM = sys.argv[1], sys.argv[2], sys.argv[3]
NSESS = int(sys.argv[4]) if len(sys.argv) > 4 else 1
HOST = 'vp-research-ai-sea.cognitiveservices.azure.com'; API = '2026-04-10'
sys.path.insert(0, os.path.dirname(__file__))
from llm_prompt import SYSTEM
ARMS = {
  'vl-gpt41mini-azspeech-swara': ('gpt-4.1-mini', {'model': 'azure-speech', 'language': 'hi-IN,en-IN'}, {'name': 'hi-IN-SwaraNeural', 'type': 'azure-standard'}),
  'vl-gpt41mini-mai2-meeraHD': ('gpt-4.1-mini', {'model': 'mai-transcribe-2'}, {'name': 'en-IN-Meera:DragonHDLatestNeural', 'type': 'azure-standard'}),
  'vl-azure-realtime-diya': ('azure-realtime', None, {'name': 'diya', 'type': 'azure-realtime-native'}),
}
model, tx, voice = ARMS[ARM]
FR = 320  # 20 ms at 16 kHz

async def session(sidx):
  ctx = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
  url = f'wss://{HOST}/voice-live/realtime?api-version={API}&model={model}'
  rows = []; t0 = time.perf_counter()
  async with websockets.connect(url, additional_headers={'api-key': os.environ['VP_AI_KEY']}, ssl=ctx, proxy=os.environ.get('HTTPS_PROXY'), max_size=None, open_timeout=30) as ws:
    t_open = time.perf_counter()
    sess = {'instructions': SYSTEM, 'modalities': ['text', 'audio'], 'voice': voice, 'input_audio_sampling_rate': 16000,
            'turn_detection': {'type': 'azure_semantic_vad_multilingual', 'silence_duration_ms': 500, 'languages': ['hi', 'en']},
            'input_audio_noise_reduction': {'type': 'azure_deep_noise_suppression'}}
    if tx: sess['input_audio_transcription'] = tx
    st = {'created': None, 'updated': None, 'events': [], 'cur': None}
    async def recv():
      async for msg in ws:
        ev = json.loads(msg); typ = ev.get('type', ''); now = time.perf_counter()
        st['events'].append((now, typ))
        c = st['cur']
        if typ == 'session.created': st['created'] = now
        elif typ == 'session.updated': st['updated'] = now
        elif typ == 'error': print('ERROR', ev.get('error')); st['err'] = json.dumps(ev.get('error'))[:300]
        if c is None: continue
        if typ == 'input_audio_buffer.speech_stopped' and c['vad_stop'] is None: c['vad_stop'] = now
        elif typ == 'conversation.item.input_audio_transcription.completed': c['tx_done'] = now; c['transcript'] = ev.get('transcript', '')
        elif typ in ('response.audio.delta', 'response.output_audio.delta') and c['first_audio'] is None: c['first_audio'] = now
        elif typ in ('response.audio_transcript.delta', 'response.output_audio_transcript.delta', 'response.text.delta'): c['reply'] += ev.get('delta', '')
        elif typ == 'response.done':
          c['done'] = now; c['usage'] = json.dumps((ev.get('response') or {}).get('usage'))[:400]; c['status'] = (ev.get('response') or {}).get('status')
    rt = asyncio.create_task(recv())
    await ws.send(json.dumps({'type': 'session.update', 'session': sess}))
    while st['updated'] is None and time.perf_counter() - t_open < 20: await asyncio.sleep(0.01)
    sil = base64.b64encode(np.zeros(FR, dtype='int16').tobytes()).decode()
    async def push_silence(seconds, until=None):
      t = time.perf_counter(); n = 0
      while True:
        await ws.send(json.dumps({'type': 'input_audio_buffer.append', 'audio': sil})); n += 1
        await asyncio.sleep(max(0, t + n * 0.02 - time.perf_counter()))
        if until is None and n * 0.02 >= seconds: return
        if until is not None and (until() or n * 0.02 >= seconds): return
    await push_silence(1.0)
    for i, p in enumerate(sorted(glob.glob(os.path.join(CALLER, 'caller_*.wav')))):
      a, sr = sf.read(p, dtype='int16'); assert sr == 16000
      c = {'turn': i, 'vad_stop': None, 'tx_done': None, 'first_audio': None, 'done': None, 'transcript': '', 'reply': '', 'usage': '', 'status': ''}
      st['cur'] = c
      t = time.perf_counter(); n = 0
      for j in range(0, len(a), FR):
        fr = a[j:j + FR]
        if len(fr) < FR: fr = np.pad(fr, (0, FR - len(fr)))
        await ws.send(json.dumps({'type': 'input_audio_buffer.append', 'audio': base64.b64encode(fr.tobytes()).decode()})); n += 1
        await asyncio.sleep(max(0, t + n * 0.02 - time.perf_counter()))
      c['speech_end'] = time.perf_counter()
      await push_silence(25.0, until=lambda: c['done'] is not None)
      await push_silence(1.0)
      ms = lambda x: round((x - c['speech_end']) * 1000, 1) if x else None
      rows.append({'arm': ARM, 'session': sidx, 'turn': i, 'caller_wav': os.path.basename(p), 'ws_open_ms': round((t_open - t0) * 1000, 1),
                   'session_created_ms': round((st['created'] - t0) * 1000, 1) if st['created'] else None, 'session_updated_ms': round((st['updated'] - t0) * 1000, 1) if st['updated'] else None,
                   'vad_stop_after_end_ms': ms(c['vad_stop']), 'transcript_after_end_ms': ms(c['tx_done']), 'first_audio_after_end_ms': ms(c['first_audio']),
                   'response_done_after_end_ms': ms(c['done']), 'transcript': c['transcript'], 'reply': c['reply'][:300], 'status': c['status'], 'usage': c['usage'], 'err': st.get('err', ''),
                   'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
      print(rows[-1]['turn'], rows[-1]['vad_stop_after_end_ms'], rows[-1]['transcript_after_end_ms'], rows[-1]['first_audio_after_end_ms'], '|', c['transcript'][:40], '|', c['reply'][:60], flush=True)
    rt.cancel()
  return rows

async def main():
  allrows = []
  for s in range(NSESS): allrows += await session(s)
  new = not os.path.exists(OUT)
  with open(OUT, 'a', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(allrows[0].keys()))
    if new: w.writeheader()
    w.writerows(allrows)
asyncio.run(main())
