# g5-gemini-paid: convert sample-call recordings (stereo 16 kHz: L = synthetic caller as sent, R = agent as a real-time
# player would play it) into small mp3s for the listener panel, plus a TTS line or two. Writes samples/ and a manifest.
import glob, json, os, subprocess
RAW = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw-1018/g5-gemini-paid'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'samples')
os.makedirs(OUT, exist_ok=True)
man = []
for d in sorted(glob.glob(f'{RAW}/vm/runs_in/sample_in_*')):
    w = os.path.join(d, 'call.wav')
    if not os.path.exists(w): continue
    tag = os.path.basename(d); m = json.load(open(os.path.join(d, 'meta.json')))
    mp3 = os.path.join(OUT, f'{tag}_stereo-caller-L_agent-R.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', w, '-ac', '2', '-ar', '16000', '-b:a', '48k', mp3], check=True)
    man.append({'file': os.path.basename(mp3), 'model': m['args']['model'], 'tier': m['args']['tier'], 'script': m['args']['script'],
                'vantage': 'centralindia-vm', 'call_s': m.get('call_s'), 'bytes': os.path.getsize(mp3),
                'note': 'synthetic caller (Azure neural TTS, phone-band) on the left channel, Gemini Live agent on the right, timeline as a real-time player would play it; fictional insurer persona'})
for f in sorted(glob.glob(f'{RAW}/vm/tts_in/tts_*_l0[0-3].wav'))[:8]:
    mp3 = os.path.join(OUT, os.path.basename(f).replace('.wav', '.mp3'))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f, '-ac', '1', '-b:a', '48k', mp3], check=True)
    man.append({'file': os.path.basename(mp3), 'kind': 'gemini tts line, voice Despina, paid key, India VM', 'bytes': os.path.getsize(mp3)})
json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print(json.dumps(man, indent=1))
