# g3-cascade-measured: convert the VM-rendered gemini-3.8-flash-lite-tts samples (24 kHz L16 PCM) to mp3 and append
# them to samples/manifest.csv. Usage: python3 samples_lite_import.py PCM_DIR SAMPLES_LITE_CSV
import os, sys, csv, wave, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from samples import LINES, OUT, manifest, dur, to_mp3
pdir, meta = sys.argv[1], {r['line_id']: r for r in csv.DictReader(open(sys.argv[2]))}
for lid, style, _, text in LINES:
  pcm = os.path.join(pdir, f'{lid}__gflashlite.pcm')
  if not os.path.exists(pcm): print('missing', lid); continue
  wav = pcm[:-4] + '.wav'
  w = wave.open(wav, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(open(pcm, 'rb').read()); w.close()
  mp3 = os.path.join(OUT, f'{lid}__gflashlite-Despina.mp3'); to_mp3(wav, mp3)
  m = meta.get(lid, {})
  manifest({'line_id': lid, 'engine': 'gemini-3.8-flash-lite-tts (Interactions API, stream, rendered from the Central India VM)', 'voice': 'Despina',
            'style_or_ssml': f'speech_metadata.style="{style}"', 'text': text, 'file': os.path.basename(mp3), 'duration_s': dur(wav),
            'in_tokens': m.get('in_tokens'), 'out_tokens': m.get('out_tokens'), 'rendered_utc': m.get('ts')})
  print(lid, 'ok', dur(wav))
