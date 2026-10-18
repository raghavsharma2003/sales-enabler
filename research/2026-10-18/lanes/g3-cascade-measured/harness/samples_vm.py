# g3-cascade-measured (2026-10-18/19): render the six matched expressive lines with a Gemini 3.8 TTS model from the
# Central India VM through the Interactions API (stream=true, speech_metadata.style, 24 kHz L16), saving raw PCM for the
# listener panel and recording time to first audio. Paced for the free tier (3 requests/min, 10/day/model).
# Usage: python samples_vm.py MODEL OUT_DIR OUT_CSV
import os, sys, time, json, base64, requests
from backends import KEYS, GEM, Out, ts
from samples import LINES
model, out_dir, out_csv = sys.argv[1], sys.argv[2], Out(sys.argv[3])
tag = 'gflashlite' if 'lite' in model else 'gflash'
s = requests.Session()
for lid, style, _, text in LINES:
  body = {'model': model, 'input': [{'type': 'user_input', 'content': [{'type': 'text', 'text': text, 'annotations': [{'type': 'speech_metadata', 'style': style}]}]}],
          'response_format': {'type': 'audio', 'mime_type': 'audio/l16', 'sample_rate': 24000}, 'generation_config': {'speech_config': [{'voice': 'Despina'}]}, 'stream': True}
  t0 = time.perf_counter(); r = s.post(f'{GEM}/interactions', headers={'x-goog-api-key': KEYS['gem']}, json=body, stream=True, timeout=120)
  first = None; pcm = bytearray(); usage = {}; err = ''
  if r.status_code != 200: err = r.text[:400]
  else:
    for line in r.iter_lines():
      if not line or not line.startswith(b'data:'): continue
      d = line[5:].strip()
      if d == b'[DONE]': break
      e = json.loads(d)
      if e.get('event_type') == 'step.delta' and (e.get('delta') or {}).get('type') == 'audio':
        if first is None: first = time.perf_counter()
        pcm += base64.b64decode(e['delta']['data'])
      elif e.get('event_type') == 'interaction.completed': usage = (e.get('interaction') or {}).get('usage') or {}
  t1 = time.perf_counter()
  if pcm: open(os.path.join(out_dir, f'{lid}__{tag}.pcm'), 'wb').write(pcm)
  row = {'ts': ts(), 'model': model, 'line_id': lid, 'style': style, 'status': r.status_code, 'ttfb_ms': round((first - t0) * 1e3, 1) if first else None, 'total_ms': round((t1 - t0) * 1e3, 1),
         'audio_s': round(len(pcm) / 48000, 2), 'in_tokens': usage.get('total_input_tokens'), 'out_tokens': usage.get('total_output_tokens'), 'err': err}
  out_csv.row(row); print(row, flush=True)
  if r.status_code == 429 and 'per day' in err.lower(): break
  time.sleep(22)
