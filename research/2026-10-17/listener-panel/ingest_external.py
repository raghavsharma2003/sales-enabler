#!/usr/bin/env python3
"""Ingest owner-made recordings into the panel: the human-reference arm and the competitor arm (protocol 3.6, 3.7).

Every file goes through the same chain as our TTS clips (render_stimuli_round2.py): silence trimmed to about 150 ms,
-16 LUFS, a wideband mp3 and a phone-band mp3 (300-3,400 Hz, 8 kHz G.711 mu-law). It then gets the same automatic QA:
two ASR engines and the key-token check. Output: rows appended to
../lanes/l8-azure-bench/stimuli-round2/manifest-external.csv with blind file codes (X2_xxxxxx). Rebuild the plans
afterwards with `python3 build_plan.py --qa-sheet` and then `python3 build_plan.py`.

Input: a CSV the owner fills in, one row per recording (template: recording-templates/recordings-template.csv):
  source            human | competitor
  speaker           talent id (talentF1, talentM1) or vendor id (sarvam, smallest, gnani, bolna, elevenlabs, ...)
  gender            F | M (the persona: F speaks the Asha texts, M the Amit texts)
  turn              R1..R8 or C1..C4
  script            plain | safety (R7 only) | blockc (C1-C4)
  take              1, 2, 3 ... (only takes marked chosen=yes are ingested)
  chosen            yes | no
  file              path to the recording (wav preferred; m4a/mp3 accepted)
  capture           studio | phone-recorder | harness-first-message | vendor-download
  notes             free text (for competitors: platform, TTS engine and voice name, settings)

  python3 ingest_external.py recordings.csv                 ingest every chosen take (needs VP_AZURE_ENV for the ASR QA)
  python3 ingest_external.py recordings.csv --no-asr        process audio only; qa_auto = needs_listen
  python3 ingest_external.py --first-message HARNESS.wav OUT.wav
        cut the agent's first utterance from an l4b harness recording (right channel = agent audio), for competitor
        clips captured by setting the agent's first message to a panel text (protocol 3.7)
"""
import argparse, csv, hashlib, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
L8 = os.path.normpath(os.path.join(HERE, '..', 'lanes', 'l8-azure-bench'))
sys.path.insert(0, os.path.join(L8, 'harness'))
ST = os.path.join(L8, 'stimuli-round2')
OUT = os.path.join(ST, 'manifest-external.csv')
FIELDS = ['file_code', 'stim_sets', 'turn', 'register', 'script', 'source', 'tier', 'voice', 'gender', 'pace', 'ssml_lang',
          'rate_pct', 'voice_role', 'duration_s', 'in_range', 'wideband_mp3', 'phone_mp3', 'text', 'gloss_en', 'key_tokens',
          'asr_mai2_phone', 'asr_mai2_locale', 'asr_fast_phone', 'asr_fast_locale', 'check_mai2', 'check_fast', 'qa_auto',
          'qa_detail', 'render_attempts', 'tts_chars', 'text_author', 'rendered', 'audio_sha256', 'superseded',
          'capture', 'take', 'source_file_sha256', 'notes']


def ff(*a):
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', *a], check=True, stdin=subprocess.DEVNULL, timeout=180)


def dur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p],
                                capture_output=True, text=True).stdout.strip())


def first_message(src, out, min_speech=1.0, gap=1.3):
    """Agent's first utterance from a harness wav (16 kHz stereo; right = agent). Ends at the first silence of `gap` s
    after at least `min_speech` s of speech."""
    import re
    tmp = out + '.agent.wav'
    ff('-i', src, '-af', 'pan=mono|c0=c1', '-ar', '16000', tmp)
    p = subprocess.run(['ffmpeg', '-nostdin', '-i', tmp, '-af', f'silencedetect=noise=-40dB:d={gap}', '-f', 'null', '-'],
                       capture_output=True, text=True, timeout=120)
    starts = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', p.stderr)]
    ends = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', p.stderr)]
    onset = ends[0] if starts and starts[0] < 0.05 and ends else 0.0
    stop = next((s for s in starts if s > onset + min_speech), dur(tmp))
    ff('-i', tmp, '-ss', f'{max(0, onset - 0.2):.2f}', '-to', f'{stop + 0.2:.2f}', out)
    os.remove(tmp)
    print(f'first message: {onset:.2f}-{stop:.2f} s -> {out}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('csv', nargs='?')
    ap.add_argument('--no-asr', action='store_true')
    ap.add_argument('--first-message', nargs=2, metavar=('HARNESS_WAV', 'OUT_WAV'))
    a = ap.parse_args()
    if a.first_message:
        return first_message(*a.first_message)
    if not a.csv:
        ap.error('give the recordings CSV, or --first-message')
    import render_stimuli_round2 as R
    key = None if a.no_asr else R.load_env()
    os.makedirs(R.TMP, exist_ok=True)
    have = {r['file_code']: r for r in csv.DictReader(open(OUT, encoding='utf-8'))} if os.path.exists(OUT) else {}
    rows = [r for r in csv.DictReader(open(a.csv, encoding='utf-8-sig')) if (r.get('chosen') or '').strip().lower() == 'yes']
    for r in rows:
        src_path = r['file'] if os.path.isabs(r['file']) else os.path.join(os.path.dirname(os.path.abspath(a.csv)), r['file'])
        sha = hashlib.sha256(open(src_path, 'rb').read()).hexdigest()
        turn, script, g = r['turn'].strip(), (r.get('script') or 'plain').strip(), r['gender'].strip().upper()
        reg = 'neutral_hinglish'
        key_text = 'neutral_hinglish_safety' if script == 'safety' else 'neutral_hinglish'
        content = R.C[turn][key_text]
        text = content.get(g) or content['F']
        code = 'X2_' + hashlib.sha1(f'{r["source"]}|{r["speaker"]}|{turn}|{script}|{g}|{sha}'.encode()).hexdigest()[:6]
        if code in have:
            print('already ingested', code, r['speaker'], turn); continue
        raw = os.path.join(R.TMP, code + '.src.wav')
        ff('-i', src_path, '-ac', '1', '-ar', '24000', raw)          # decode any container to 24 kHz mono first
        d, ph16 = R.process(open(raw, 'rb').read(), code)
        clip = {'turn': turn, 'script': script}
        tk = R.tokens_for(clip)
        if key:
            mai, mloc = R.asr(key, ph16, 'mai2', None)
            fast, floc = R.asr(key, ph16, 'fast', 'hi-IN')
            ca, cb = R.check_engine(mai, tk), R.check_engine(fast, tk)
            st, det = R.token_status(tk, ca, cb)
        else:
            mai = mloc = fast = floc = ''; ca = cb = {}; st, det = 'needs_listen', 'ASR not run (--no-asr)'
        src = r['source'].strip()
        row = {'file_code': code, 'stim_sets': 'hindi_c' if turn.startswith('C') else 'hindi', 'turn': turn, 'register': reg,
               'script': script, 'source': src, 'tier': src, 'voice': r['speaker'].strip(), 'gender': g, 'pace': 'default',
               'ssml_lang': '', 'rate_pct': '', 'voice_role': f'{src} reference ({r.get("capture", "")})', 'duration_s': round(d, 2),
               'in_range': 7.5 <= d <= 16.5, 'wideband_mp3': f'wideband/{code}.mp3', 'phone_mp3': f'phone/{code}.mp3', 'text': text,
               'gloss_en': R.C[turn].get('gloss_en_safety' if script == 'safety' else 'gloss_en'), 'key_tokens': json.dumps([t['id'] for t in tk]),
               'asr_mai2_phone': mai, 'asr_mai2_locale': mloc, 'asr_fast_phone': fast, 'asr_fast_locale': floc,
               'check_mai2': json.dumps(ca, ensure_ascii=False), 'check_fast': json.dumps(cb, ensure_ascii=False), 'qa_auto': st,
               'qa_detail': det, 'render_attempts': 1, 'tts_chars': 0, 'text_author': R.TEXT['authors'].get(key_text, ''),
               'rendered': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
               'audio_sha256': hashlib.sha256(open(os.path.join(ST, 'phone', code + '.mp3'), 'rb').read()).hexdigest()[:16],
               'superseded': '', 'capture': r.get('capture', ''), 'take': r.get('take', ''), 'source_file_sha256': sha[:16],
               'notes': r.get('notes', '')}
        have[code] = row
        print(code, src, r['speaker'], turn, script, g, f'{d:.1f}s', st, det[:80])
        with open(OUT, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(have.values())
    print(f'{len(have)} external clips in {OUT}. Next: python3 build_plan.py --qa-sheet, listen-check, then python3 build_plan.py')


if __name__ == '__main__':
    main()
