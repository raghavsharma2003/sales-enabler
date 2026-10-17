"""Render the caller battery to audio with Azure neural TTS and build noise variants.

python3 render.py            -> battery/audio/*.wav (16 kHz mono), battery.json, battery.md
Raw 24 kHz TTS output is cached in the scratch research-raw dir so re-runs cost nothing.
"""
import json, os, subprocess, sys, wave, html
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tts  # noqa: E402
from battery_src import PERSONAS  # noqa: E402

RAW = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l4b-measured/tts'
AUD = os.path.join(HERE, 'audio')
os.makedirs(RAW, exist_ok=True)
os.makedirs(AUD, exist_ok=True)
SR = 16000
rng = np.random.default_rng(20261017)


def ssml(p, text):
    t = html.escape(text, quote=False).replace('[[BREAK1600]]', '<break time="1600ms"/>')
    return (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{p["xml_lang"]}">'
            f'<voice name="{p["voice"]}"><prosody rate="{p["rate"]}" pitch="{p["pitch"]}">{t}</prosody></voice></speak>')


def read_wav(path):
    with wave.open(path) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        return x, w.getframerate()


def write_wav(path, x, sr=SR):
    y = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((y * 32767).astype(np.int16).tobytes())


def to16k_trim(src, dst):
    # trim leading/trailing silence only (internal pauses are part of the trap), resample to 16 kHz mono
    af = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,'
          'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', af, '-ar', str(SR), '-ac', '1', dst], check=True)


def active_rms(x, sr=SR):
    fr = int(0.02 * sr)
    n = len(x) // fr
    e = np.sqrt(np.mean(x[:n * fr].reshape(n, fr) ** 2, axis=1) + 1e-12)
    thr = max(np.max(e) * 0.05, 1e-4)
    return float(np.sqrt(np.mean(e[e > thr] ** 2)))


def traffic_noise(n, sr=SR):
    t = np.arange(n) / sr
    brown = np.cumsum(rng.normal(0, 1, n)); brown -= np.convolve(brown, np.ones(4000) / 4000, mode='same'); brown /= np.max(np.abs(brown)) + 1e-9
    engine = np.sin(2 * np.pi * 38 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * t))
    horn = np.zeros(n)
    for start in rng.uniform(0.2, max(0.3, n / sr - 0.6), size=3):
        s, e = int(start * sr), int(min(n, (start + 0.45) * sr))
        tt = t[s:e]
        horn[s:e] = 0.5 * np.sign(np.sin(2 * np.pi * 420 * tt)) * 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 530 * tt)) * 0.5
    x = 0.6 * brown + 0.3 * engine + 0.35 * horn
    return x / (np.sqrt(np.mean(x ** 2)) + 1e-9)


def mix_snr(speech, noise, snr_db):
    s = active_rms(speech)
    nrms = np.sqrt(np.mean(noise ** 2)) + 1e-9
    noise = noise / nrms * s / (10 ** (snr_db / 20))
    y = speech + noise[:len(speech)]
    peak = np.max(np.abs(y))
    return y / peak * 0.9 if peak > 0.95 else y


def main():
    total_chars = 0
    battery = {'version': '2026-10-17', 'sample_rate': SR, 'scenario': 'Suraksha Health (fictional) renewal reminder, agent speaks first; see runbook/agent-spec.md', 'personas': []}
    md = ['# Caller battery (l4b-measured, 2026-10-17)', '',
          'Rendered with Azure neural TTS (vp-research-ai-sea, southeastasia). Each persona is about 10 turns with traps.',
          'Turn ids are `<persona>_tNN`; audio is in `audio/<id>.wav` (16 kHz mono, leading/trailing silence trimmed).', '']
    for p in PERSONAS:
        pj = {k: v for k, v in p.items() if k != 'turns'}
        pj['turns'] = []
        md += [f'## {p["id"]}: {p["name"]}', '', f'Voice `{p["voice"]}`, rate {p["rate"]}, pitch {p["pitch"]}' + (f', noise bed `{p["noise_bed"]["clip"]}` at gain {p["noise_bed"]["gain"]}' if p['noise_bed'] else ''), '',
               '| id | type | trap | caller says | content check (agent next turn) |', '|---|---|---|---|---|']
        for i, t in enumerate(p['turns'], 1):
            tid = f'{p["id"]}_t{i:02d}'
            tj = dict(t); tj['id'] = tid
            if t['type'] != 'silence':
                raw = os.path.join(RAW, tid + '.wav')
                s = ssml(p, t['text'])
                if not os.path.exists(raw):
                    total_chars += tts.synth(s, raw)
                out = os.path.join(AUD, tid + '.wav')
                to16k_trim(raw, out)
                x, _ = read_wav(out)
                if t.get('noise') == 'traffic':
                    clean = os.path.join(AUD, tid + '_clean.wav')
                    write_wav(clean, x)
                    y = mix_snr(x, traffic_noise(len(x)), t['snr_db'])
                    write_wav(out, y)
                    x = y
                tj['dur_s'] = round(len(x) / SR, 3)
                tj['ssml_chars'] = tts.billed_chars(s)
            battery_text = t.get('text', '(5 s of silence)').replace('[[BREAK1600]]', '[1.6 s pause]')
            md.append(f'| {tid} | {t["type"]} | {t["trap"]} | {battery_text} | {"any of: " + ", ".join("`" + e + "`" for e in t["expect"][:4]) + (" ..." if len(t["expect"]) > 4 else "") if t.get("expect") else "manual"} |')
            pj['turns'].append(tj)
        md.append('')
        battery['personas'].append(pj)
    # market babble bed for P2: overlapped speech from the other personas + pink-ish noise, 30 s loop
    n = SR * 30
    bed = np.zeros(n, dtype=np.float32)
    others = [os.path.join(AUD, f) for f in sorted(os.listdir(AUD)) if f[:2] in ('P1', 'P3', 'P4') and f.endswith('.wav') and '_clean' not in f]
    for k in range(7):
        pos = int(rng.uniform(0, SR * 2))
        order = rng.permutation(len(others))
        while pos < n:
            x, _ = read_wav(others[order[pos % len(others)]])
            x = x * rng.uniform(0.3, 1.0)
            e = min(n, pos + len(x)); bed[pos:e] += x[:e - pos]
            pos = e + int(rng.uniform(0.1, 1.2) * SR)
    w = rng.normal(0, 1, n); pink = np.convolve(w, np.ones(8) / 8, mode='same')
    bed = bed / (np.sqrt(np.mean(bed ** 2)) + 1e-9) + 0.5 * pink / np.sqrt(np.mean(pink ** 2))
    # level: at gain 1.0 the bed RMS sits 6 dB below P2's active speech RMS
    p2 = [read_wav(os.path.join(AUD, f))[0] for f in sorted(os.listdir(AUD)) if f.startswith('P2_')]
    p2rms = float(np.mean([active_rms(x) for x in p2]))
    bed = bed / np.sqrt(np.mean(bed ** 2)) * p2rms / 2.0
    # 200 ms crossfade so the loop has no click
    xf = int(0.2 * SR); ramp = np.linspace(0, 1, xf)
    bed[:xf] = bed[:xf] * ramp + bed[-xf:] * (1 - ramp); bed = bed[:-xf]
    write_wav(os.path.join(AUD, 'bed_market.wav'), bed)
    gain = PERSONAS[1]['noise_bed']['gain']
    battery['noise_bed_snr_db'] = {'bed_market@gain1.0': 6.0, f'bed_market@gain{gain}': round(6.0 - 20 * np.log10(gain), 1)}
    md += ['## Noise', '', f'- `bed_market.wav`: 30 s loop of overlapped speech from other personas plus pink noise. At gain 1.0 it sits 6 dB under P2 speech; P2 plays it at gain {gain}, so SNR is about {battery["noise_bed_snr_db"][f"bed_market@gain{gain}"]} dB for the whole call.',
           '- traffic noise (P1_t10): synthetic brown noise, 38 Hz engine hum and three two-tone horn bursts, mixed at 5 dB SNR; the clean version is kept as `P1_t10_clean.wav`.',
           '- All noise is synthetic. It is a robustness probe, not a model of a real Indian street.', '']
    json.dump(battery, open(os.path.join(HERE, 'battery.json'), 'w'), ensure_ascii=False, indent=1)
    open(os.path.join(HERE, 'battery.md'), 'w').write('\n'.join(md))
    print('new TTS chars billed this run:', total_chars)


if __name__ == '__main__':
    main()
