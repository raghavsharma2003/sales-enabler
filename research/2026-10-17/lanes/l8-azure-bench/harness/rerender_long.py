# Post-pass for H6 stimuli (l8-azure-bench, 2026-10-17): bring clips over 15 s back inside 8-15 s without creating a
# register confound. For every (region, turn, voice) group in which ANY condition runs over 15.0 s, ALL conditions of
# that group are re-rendered with the same SSML prosody rate, so within-voice register comparisons stay matched.
# Rate = ceil(100 * (max_duration / 14.6 - 1)) percent, capped at 15%. Same file codes; manifest updated.
import os, csv, json, math, html, time, subprocess, requests
HERE = os.path.dirname(os.path.abspath(__file__)); ST = os.path.join(HERE, '..', 'stimuli')
TMP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l8-azure-bench/stim_tmp'
KEY = os.environ['VP_AI_KEY']; S = requests.Session()
MAN = os.path.join(ST, 'manifest.csv')
rows = list(csv.DictReader(open(MAN, encoding='utf-8')))
def ff(*a): subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', *a], check=True, stdin=subprocess.DEVNULL, timeout=120)
def dur(p): return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True, stdin=subprocess.DEVNULL).stdout.strip())
groups = {}
for r in rows: groups.setdefault((r['region'], r['turn'], r['voice']), []).append(r)
for key, g in groups.items():
  mx = max(float(r['duration_s']) for r in g)
  if mx <= 15.0:
    for r in g: r.setdefault('rate_adjust_pct', '0')
    continue
  pct = min(15, math.ceil(100 * (mx / 14.6 - 1)))
  for r in g:
    ssml = (f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{r['ssml_lang']}'><voice name='{r['voice']}'>"
            f"<prosody rate='+{pct}%'>{html.escape(r['text'])}</prosody></voice></speak>")
    for attempt in range(4):
      resp = S.post('https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1', data=ssml.encode('utf-8'), timeout=90,
                    headers={'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm', 'User-Agent': 'l8-stimuli'})
      if resp.status_code == 200 and len(resp.content) > 1000: break
      time.sleep(3)
    code = r['file_code']; raw = os.path.join(TMP, code + '.rate.wav'); open(raw, 'wb').write(resp.content)
    trim = os.path.join(TMP, code + '.rate.trim.wav')
    ff('-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', trim)
    ff('-i', trim, '-c:a', 'libmp3lame', '-b:a', '96k', os.path.join(ST, r['wideband_mp3']))
    mu = os.path.join(TMP, code + '.rate.mulaw.wav'); ff('-i', trim, '-af', 'highpass=f=300,lowpass=f=3400', '-ar', '8000', '-c:a', 'pcm_mulaw', mu)
    p16 = os.path.join(TMP, code + '.rate.ph16.wav'); ff('-i', mu, '-ar', '16000', '-c:a', 'pcm_s16le', p16)
    ff('-i', p16, '-c:a', 'libmp3lame', '-b:a', '48k', os.path.join(ST, r['phone_mp3']))
    d = dur(trim); r['duration_s'] = round(d, 2); r['in_8_15s'] = 8.0 <= d <= 15.0; r['rate_adjust_pct'] = str(pct)
    print(key, r['condition'], pct, round(d, 2), flush=True)
fields = list(rows[0].keys())
if 'rate_adjust_pct' not in fields: fields.append('rate_adjust_pct')
with open(MAN, 'w', newline='', encoding='utf-8') as f:
  w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)
print('out of 8-15 s now:', sum(str(r['in_8_15s']) != 'True' for r in rows))
