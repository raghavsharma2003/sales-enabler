# Build the ASR test sets for l8-azure-bench (2026-10-17).
# Inputs (raw downloads, kept outside the repo): Kathbath clean test-known (CC0), MUCS-2021 Hindi-English
# code-switched test (OpenSLR 104, CC BY-SA 4.0), NPTEL2020 pure set (Indian-accented English, YouTube CC per README).
# Non-speech probe: synthetic signals + ESC-50 clips (CC BY-NC 3.0) + synthetic music.
# Output: <out>/wb/*.wav (16 kHz mono PCM), <out>/nb/*.wav (300-3400 Hz band-limit, 8 kHz G.711 mu-law round trip,
# back to 16 kHz PCM = telephone channel), and manifest.csv.
# Usage: python prep_asr_data.py RAW_DIR OUT_DIR
import os, sys, csv, random, subprocess, glob, json, collections, math
import numpy as np, soundfile as sf

RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(f'{OUT}/wb', exist_ok=True); os.makedirs(f'{OUT}/nb', exist_ok=True); os.makedirs(f'{OUT}/tmp', exist_ok=True)
rng = random.Random(20261017)
rows = []

def to_wb(src, uid, start=None, dur=None):
  dst = f'{OUT}/wb/{uid}.wav'
  cmd = ['ffmpeg', '-v', 'error', '-y']
  if start is not None: cmd += ['-ss', str(start), '-t', str(dur)]
  cmd += ['-i', src, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', dst]
  subprocess.run(cmd, check=True)
  return dst

def to_nb(uid):
  src = f'{OUT}/wb/{uid}.wav'; tmp = f'{OUT}/tmp/{uid}.mulaw.wav'; dst = f'{OUT}/nb/{uid}.wav'
  subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', 'highpass=f=300,lowpass=f=3400', '-ar', '8000', '-c:a', 'pcm_mulaw', tmp], check=True)
  subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ar', '16000', '-c:a', 'pcm_s16le', dst], check=True)
  os.remove(tmp)

def dur(p):
  i = sf.info(p); return round(i.frames / i.samplerate, 3)

# 1) Kathbath: 60 per language, spread across speakers (round-robin over speakers)
KB_N = 60
LOC = {'hindi': ('hi', 'hi-IN'), 'tamil': ('ta', 'ta-IN'), 'bengali': ('bn', 'bn-IN'), 'marathi': ('mr', 'mr-IN'), 'telugu': ('te', 'te-IN')}
for lang, (code, loc) in LOC.items():
  tx = dict(l.rstrip('\n').split('\t', 1) for l in open(f'{RAW}/kathbath/tx/kb_data_clean_m4a/{lang}/test_known/transcription_n2w.txt', encoding='utf-8'))
  files = sorted(os.listdir(f'{RAW}/kathbath/clean/{lang}'))
  files = [f for f in files if f in tx]
  by_spk = collections.defaultdict(list)
  for f in files: by_spk[f.split('-')[1]].append(f)
  spks = sorted(by_spk); rng.shuffle(spks)
  for s in spks: rng.shuffle(by_spk[s])
  pick = []
  while len(pick) < KB_N and any(by_spk[s] for s in spks):
    for s in spks:
      if by_spk[s] and len(pick) < KB_N: pick.append(by_spk[s].pop())
  for f in pick:
    uid = f'kb_{code}_' + f.replace('.m4a', '')
    p = to_wb(f'{RAW}/kathbath/clean/{lang}/{f}', uid); to_nb(uid)
    spk, g = f.replace('.m4a', '').split('-')[1:3]
    rows.append({'set': 'kathbath', 'uid': uid, 'lang': code, 'locale': loc, 'ref': tx[f], 'dur_s': dur(p), 'speaker': f'kb{code}-{spk}', 'gender': g, 'label': lang, 'licence': 'CC0 (IndicSUPERB/Kathbath)'})

# 2) MUCS 2021 Hindi-English code-switched test: 80 segments, spread across the 30 recordings, 3-12 s
seg = [l.split() for l in open(f'{RAW}/mucs/x/test/transcripts/segments')]
txt = dict(l.rstrip('\n').split(' ', 1) for l in open(f'{RAW}/mucs/x/test/transcripts/text', encoding='utf-8') if ' ' in l.strip())
by_rec = collections.defaultdict(list)
for u, rec, a, b in seg:
  d = float(b) - float(a)
  if 3.0 <= d <= 12.0 and u in txt and any(ch.isascii() and ch.isalpha() for ch in txt[u]):
    by_rec[rec].append((u, float(a), d))
recs = sorted(by_rec); rng.shuffle(recs)
for r in recs: rng.shuffle(by_rec[r])
pick = []
while len(pick) < 80 and any(by_rec[r] for r in recs):
  for r in recs:
    if by_rec[r] and len(pick) < 80: pick.append((r,) + by_rec[r].pop())
for rec, u, a, d in pick:
  uid = 'mucs_' + u
  p = to_wb(f'{RAW}/mucs/x/test/{rec}.wav', uid, a, d); to_nb(uid)
  rows.append({'set': 'mucs_hien', 'uid': uid, 'lang': 'hi-en', 'locale': 'hi-IN', 'ref': txt[u], 'dur_s': dur(p), 'speaker': rec, 'gender': '', 'label': 'code-switched spoken tutorial', 'licence': 'CC BY-SA 4.0 (OpenSLR 104)'})

# 3) NPTEL pure set (Indian-accented English lectures): 80 chunks, 3-15 s, distinct videos where possible
meta = {}
for m in glob.glob(f'{RAW}/nptel/x/nptel-pure/metadata/*.json'):
  try: meta[os.path.basename(m)[:-5]] = json.load(open(m))
  except Exception: pass
cands = []
for t in glob.glob(f'{RAW}/nptel/x/nptel-pure/corrected_txt/*.txt'):
  k = os.path.basename(t)[:-4]
  w = glob.glob(f'{RAW}/nptel/x/nptel-pure/wav/{k}.wav')
  if not w: continue
  ref = open(t, encoding='utf-8').read().strip()
  d = dur(w[0])
  if 3.0 <= d <= 15.0 and len(ref.split()) >= 4: cands.append((k, w[0], ref, d))
rng.shuffle(cands)
seen_vid = set(); pick = []
for k, w, ref, d in cands:
  vid = str(meta.get(k, {}).get('video_id') or meta.get(k, {}).get('id') or k)
  if vid in seen_vid and len(cands) > 200: continue
  seen_vid.add(vid); pick.append((k, w, ref, d, vid))
  if len(pick) >= 80: break
for k, w, ref, d, vid in pick:
  uid = 'nptel_' + k[:16]
  p = to_wb(w, uid); to_nb(uid)
  rows.append({'set': 'nptel_en', 'uid': uid, 'lang': 'en', 'locale': 'en-IN', 'ref': ref, 'dur_s': dur(p), 'speaker': vid, 'gender': '', 'label': 'Indian-accented English lecture', 'licence': 'Creative Commons (YouTube CC) per NPTEL2020 README'})

# 4) Non-speech probe
SR = 16000
def save(uid, x, label, lic='synthetic (this lane)'):
  x = np.clip(x, -1, 1).astype(np.float32)
  sf.write(f'{OUT}/wb/{uid}.wav', x, SR, subtype='PCM_16'); to_nb(uid)
  rows.append({'set': 'nonspeech', 'uid': uid, 'lang': '', 'locale': '', 'ref': '', 'dur_s': round(len(x) / SR, 3), 'speaker': '', 'gender': '', 'label': label, 'licence': lic})
nrng = np.random.default_rng(17)
def db(x, dbfs):
  r = np.sqrt(np.mean(x ** 2)) + 1e-12; return x * (10 ** (dbfs / 20) / r)
def colored(n, kind):
  w = nrng.standard_normal(n)
  if kind == 'white': return w
  f = np.fft.rfft(w); k = np.arange(len(f)); k[0] = 1
  f = f / (np.sqrt(k) if kind == 'pink' else k)
  return np.fft.irfft(f, n)
for i in range(5): save(f'ns_silence_{i}', np.zeros(int(SR * (3 + i))), 'digital silence')
for i in range(5): save(f'ns_roomtone_{i}', db(colored(SR * 5, 'pink'), -55 + i * 2), 'room tone (pink noise -55..-47 dBFS)')
for i in range(4): save(f'ns_white_{i}', db(colored(SR * 5, 'white'), -35 + i * 4), 'white noise')
for i in range(4): save(f'ns_brown_{i}', db(colored(SR * 5, 'brown'), -30 + i * 4), 'brown noise')
t = np.arange(SR * 5) / SR
for i in range(4):
  hum = sum(np.sin(2 * np.pi * 50 * h * t) / h for h in (1, 2, 3, 5))
  save(f'ns_hum_{i}', db(hum + 0.05 * colored(len(t), 'pink'), -30 + i * 3), 'mains hum 50 Hz + harmonics')
def cadence(pattern, f0, mod=None, total=8.0):
  x = np.zeros(int(SR * total)); pos = 0.0
  while pos < total:
    for on, off in pattern:
      a, b = int(pos * SR), int(min(total, pos + on) * SR)
      tt = np.arange(b - a) / SR
      tone = np.sin(2 * np.pi * f0 * tt) * (np.sin(2 * np.pi * mod * tt) if mod else 1)
      x[a:b] = tone; pos += on + off
      if pos >= total: break
  return x
for i in range(4): save(f'ns_ringback_{i}', db(cadence([(0.4, 0.2), (0.4, 2.0)], 400, 25, 6 + i), -20), 'Indian ringback tone (400x25 Hz, 0.4-0.2-0.4-2.0 s)')
for i in range(2): save(f'ns_busy_{i}', db(cadence([(0.75, 0.75)], 400, None, 6), -20), 'busy tone 400 Hz 0.75/0.75')
DT = {'1': (697, 1209), '2': (697, 1336), '5': (770, 1336), '9': (852, 1477), '0': (941, 1336), '#': (941, 1477)}
for i, seq in enumerate(['98765', '1250#']):
  x = np.zeros(0)
  for ch in seq:
    a, b = DT.get(ch, (697, 1209)); tt = np.arange(int(0.12 * SR)) / SR
    x = np.concatenate([x, np.sin(2 * np.pi * a * tt) + np.sin(2 * np.pi * b * tt), np.zeros(int(0.1 * SR))])
  save(f'ns_dtmf_{i}', db(np.concatenate([np.zeros(SR // 2), x, np.zeros(SR)]), -18), 'DTMF digits')
# synthetic music: chord pad, plucked melody (Karplus-Strong), percussion loop
def adsr(n):
  e = np.ones(n); a = min(n, 800); r = min(n, 4000); e[:a] = np.linspace(0, 1, a); e[-r:] *= np.linspace(1, 0, r); return e
pad = np.zeros(SR * 8)
for j, chord in enumerate([(261.6, 329.6, 392.0), (220.0, 261.6, 329.6), (174.6, 220.0, 261.6), (196.0, 246.9, 293.7)]):
  n = SR * 2; tt = np.arange(n) / SR
  seg_ = sum(np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt) for f in chord) * adsr(n)
  pad[j * n:(j + 1) * n] = seg_
save('ns_music_pad', db(pad, -22), 'synthetic hold-music chord pad')
def ks(f, n):
  p = int(SR / f); buf = nrng.uniform(-1, 1, p); y = np.zeros(n)
  for k in range(n): y[k] = buf[k % p]; buf[k % p] = 0.996 * 0.5 * (buf[k % p] + buf[(k + 1) % p])
  return y
mel = np.concatenate([ks(f, SR // 3) for f in [293.7, 329.6, 349.2, 392.0, 440.0, 392.0, 349.2, 329.6, 293.7, 261.6, 293.7, 329.6, 293.7, 261.6, 220.0, 293.7, 329.6, 392.0, 440.0, 493.9, 440.0, 392.0, 329.6, 293.7]])
save('ns_music_pluck', db(mel, -22), 'synthetic plucked-string melody')
perc = np.zeros(SR * 8)
for b in range(32):
  a = int(b * SR / 4); n = SR // 6; tt = np.arange(n) / SR
  hit = (np.sin(2 * np.pi * (120 if b % 4 == 0 else 220) * tt) * np.exp(-tt * 25)) + (0.3 * nrng.standard_normal(n) * np.exp(-tt * 60) if b % 2 else 0)
  perc[a:a + n] += hit[:len(perc[a:a + n])]
save('ns_music_perc', db(perc, -22), 'synthetic percussion loop')
# ESC-50 environmental clips (CC BY-NC 3.0), downloaded by fetch_esc50.sh into RAW/esc50
esc = sorted(glob.glob(f'{RAW}/esc50/*.wav'))
for p in esc:
  uid = 'ns_esc_' + os.path.basename(p)[:-4]
  to_wb(p, uid); to_nb(uid)
  cat = os.path.basename(p).split('__')[0]
  rows.append({'set': 'nonspeech', 'uid': uid, 'lang': '', 'locale': '', 'ref': '', 'dur_s': dur(f'{OUT}/wb/{uid}.wav'), 'speaker': '', 'gender': '', 'label': 'ESC-50: ' + cat, 'licence': 'CC BY-NC 3.0 (ESC-50)'})

with open(f'{OUT}/manifest.csv', 'w', newline='', encoding='utf-8') as f:
  w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
c = collections.Counter(r['set'] for r in rows)
print(dict(c), 'total audio min', round(sum(r['dur_s'] for r in rows) / 60, 1))
