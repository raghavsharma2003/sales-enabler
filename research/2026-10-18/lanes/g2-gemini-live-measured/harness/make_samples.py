# Export complete call recordings for the listener panel (not rated here): stereo mp3, L = synthetic caller as sent,
# R = agent audio as a real-time player would have played it. Writes samples/*.mp3 and samples/manifest.csv.
import os, sys, json, csv, subprocess
LANE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(LANE, 'samples'); os.makedirs(OUT, exist_ok=True)
SHORT = {'gemini-3.1-flash-live-preview': 'g31-flash-live', 'gemini-3.8-live': 'g38-live', 'gemini-2.5-flash-native-audio-latest': 'g25-native-audio'}
SCENE = {'W': 'worried-caller', 'P4': 'confused-elderly-caller', 'PAUSE': 'elderly-pause-probe', 'P1': 'urban-hinglish'}
rows = []
for d in sys.argv[1:]:
    meta = json.load(open(os.path.join(d, 'meta.json'))); a = meta['args']
    wav = os.path.join(d, 'call.wav')
    if not os.path.exists(wav): continue
    tb0 = '_thinkingBudget0' if (a['model'] == 'gemini-3.8-live' and a['thinking'] == 'budget0') else ''
    name = f"{SHORT[a['model']]}{tb0}_{SCENE.get(a['script'], a['script'])}_{a['vad']}vad_{'india' if a['tag'].startswith('in_') else 'us'}.mp3"
    mp3 = os.path.join(OUT, name)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '48k', mp3], check=True)
    turns = [json.loads(l) for l in open(os.path.join(d, 'turns.jsonl'))]
    rows.append({'file': name, 'tag': a['tag'], 'model': a['model'], 'scene': SCENE.get(a['script'], a['script']), 'vad': a['vad'],
                 'flags': f"api={a['api']} lang={a['lang']} thinking={a['thinking']} affective={a['affective']} proactive={a['proactive']}",
                 'call_s': meta['call_s'], 'turns': len(turns), 'mp3_kb': round(os.path.getsize(mp3) / 1024),
                 'channels': 'L=synthetic caller (Azure neural TTS, phone band), R=Gemini Live agent (24 kHz resampled to 16 kHz)',
                 'agent_transcript': ' | '.join(t['outtx'] for t in turns if t['outtx'])[:1500]})
with open(os.path.join(OUT, 'manifest.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); [w.writerow(r) for r in rows]
for r in rows: print(r['file'], r['mp3_kb'], 'KB')
