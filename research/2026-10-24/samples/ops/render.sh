#!/bin/bash
# R13 stack voice samples (2026-10-24). One Run Command on vl-vm-cin:
#  1. render with the product's own renderer (python -m vpvoice.samples) from the staging tree, with staging's env.
#     NODE_ENV is removed for this one process only: staging's control plane runs in production mode, and the renderer
#     refuses production by design (a sample render is a lab job, not part of serving calls). Nothing else is changed.
#     tools/pace.py is loaded first, as for the runtime: every request to *aiplatform.googleapis.com from this process
#     starts at least 1.0 s after the previous one (the renderer adds its own 1 s gap too). Runs sequentially.
#  2. QA each clip: ffprobe (format, duration), size, EBU R128 (integrated LUFS, true peak), volumedetect (RMS), and an
#     Azure Speech (hi-IN, REST short audio) round-trip of the shipped file decoded to 16 kHz WAV, 1 request at a time.
#  3. Check pacing across BOTH processes (this one and the staging runtime) in the render window.
#  4. Upload the clips, manifest, QA json, pace log and logs to blob samples-r13/. Prints no secret values.
S=/opt/vp-stage
W=$S/samples-r13
B=https://vpresearchraw1017.blob.core.windows.net/vl-transfer
PY=$S/venv/bin/python
echo "== pre $(date -u)"
echo "deployed: $(cat $S/app/BUNDLE_SHA)"
systemctl is-active vp-stage-control vp-stage-runtime voicelab
AC=$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $PY -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])')
[ "$AC" = 0 ] || { echo "staging calls active ($AC); not rendering"; exit 5; }
echo "staging active calls: $AC"
export DEBIAN_FRONTEND=noninteractive HOME=/root
if ! command -v ffmpeg >/dev/null; then
  # The renderer encodes Ogg/Opus with ffmpeg and QA measures with it; the VM had none (pre-check of vps5-deploy).
  # Only the renderer, its tests and the benches call ffmpeg: no serving path (runtime, control plane, lab) uses it.
  echo "== installing ffmpeg (Ubuntu archive, --no-install-recommends) $(date -u)"
  for i in 1 2 3 4 5 6; do
    apt-get update -qq >/dev/null 2>&1
    apt-get install -y -qq --no-install-recommends ffmpeg >/tmp/r13-apt.log 2>&1 && break
    echo "apt attempt $i failed: $(tail -1 /tmp/r13-apt.log | cut -c1-200)"; sleep 15
  done
fi
command -v ffmpeg >/dev/null || { echo "no ffmpeg; not rendering"; exit 6; }
ffmpeg -version | head -1; echo "libopus encoder: $(ffmpeg -hide_banner -encoders 2>/dev/null | grep -c libopus || true)"
df -h / | tail -1
echo "== offline renderer tests with ffmpeg (devsim fake voice, no network)"
cd $S/app/product/voice
runuser -u vpstage -- env -i PATH=/usr/bin:/bin HOME=/tmp $PY -m unittest tests.test_samples > /tmp/r13-tests.log 2>&1; TRC=$?
tail -3 /tmp/r13-tests.log
[ "$TRC" = 0 ] || { echo "renderer tests failed; not rendering"; tail -30 /tmp/r13-tests.log | cut -c1-300; exit 7; }
rm -rf $W && mkdir -p $W/out

cat > $W/render.py <<'PYEOF'
# Launcher: staging's env (minus NODE_ENV), the staging Vertex pacer, then python -m vpvoice.samples with the given args.
import os, runpy, sys
S = '/opt/vp-stage'
for line in open(f'{S}/.env'):
    line = line.rstrip('\n')
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1); os.environ[k] = v
os.environ.pop('NODE_ENV', None)
os.environ['VP_STAGE_PACE_LOG'] = f'{S}/samples-r13/samples-pace.jsonl'
sys.path.insert(0, os.getcwd()); sys.path.insert(0, f'{S}/tools')
import pace  # noqa: F401  (patches aiohttp before vpvoice imports its providers)
sys.argv = ['vpvoice.samples'] + sys.argv[1:]
runpy.run_module('vpvoice.samples', run_name='__main__', alter_sys=True)
PYEOF

cat > $W/qa.py <<'PYEOF'
# QA of every clip in the manifest. Reads LAB_SPEECH_KEY / LAB_SPEECH_REGION from staging's env; never prints them.
import json, os, re, subprocess, sys, time, urllib.request, urllib.error
out = sys.argv[1]
env = {}
for line in open('/opt/vp-stage/.env'):
    line = line.rstrip('\n')
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1); env[k] = v
key = env.get('LAB_SPEECH_KEY', ''); region = env.get('LAB_SPEECH_REGION') or 'centralindia'
manifest = json.load(open(os.path.join(out, 'manifest.json'), encoding='utf-8'))
res = {'manifest': manifest, 'clips': {}, 'asr_region': region}
def run(cmd, **kw): return subprocess.run(cmd, capture_output=True, timeout=120, **kw)
for f in sorted({e['file'] for e in manifest.values()}):
    p = os.path.join(out, f); r = {'bytes': os.path.getsize(p)}
    pr = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,bit_rate,format_name:stream=codec_name,channels,sample_rate', '-of', 'json', p], text=True)
    r['probe'] = json.loads(pr.stdout or '{}')
    eb = run(['ffmpeg', '-hide_banner', '-nostats', '-i', p, '-af', 'ebur128=peak=true', '-f', 'null', '-'], text=True).stderr
    summ = eb.rsplit('Summary:', 1)[-1]
    g = lambda pat: (lambda m: float(m.group(1)) if m else None)(re.search(pat, summ))
    r['lufs_i'] = g(r'I:\s*(-?[\d.]+) LUFS'); r['lra'] = g(r'LRA:\s*(-?[\d.]+) LU'); r['true_peak_dbfs'] = g(r'Peak:\s*(-?[\d.]+) dBFS')
    vd = run(['ffmpeg', '-hide_banner', '-nostats', '-i', p, '-af', 'volumedetect', '-f', 'null', '-'], text=True).stderr
    m1 = re.search(r'mean_volume:\s*(-?[\d.]+) dB', vd); m2 = re.search(r'max_volume:\s*(-?[\d.]+) dB', vd)
    r['rms_dbfs'] = float(m1.group(1)) if m1 else None; r['max_dbfs'] = float(m2.group(1)) if m2 else None
    wp = os.path.join('/tmp', 'r13-' + f + '.wav')
    run(['ffmpeg', '-v', 'error', '-y', '-i', p, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-f', 'wav', wp])
    wav = open(wp, 'rb').read(); os.remove(wp)
    url = (f'https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1'
           '?language=hi-IN&format=detailed&profanity=raw')
    req = urllib.request.Request(url, data=wav, method='POST', headers={
        'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', 'Accept': 'application/json'})
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            d = json.loads(resp.read().decode('utf-8')); r['asr_http'] = resp.status
    except urllib.error.HTTPError as e:
        d = {}; r['asr_http'] = e.code
    except Exception as e:
        d = {}; r['asr_http'] = 'error ' + type(e).__name__
    r['asr_ms'] = int((time.monotonic() - t0) * 1000); r['asr_audio_s'] = round((len(wav) - 44) / 32000, 2)
    nb = (d.get('NBest') or [{}])[0]
    r['asr'] = {'status': d.get('RecognitionStatus'), 'display': d.get('DisplayText'), 'lexical': nb.get('Lexical'),
                'itn': nb.get('ITN'), 'confidence': nb.get('Confidence'), 'n_best': len(d.get('NBest') or [])}
    res['clips'][f] = r
    time.sleep(1.0)
json.dump(res, sys.stdout, ensure_ascii=False, indent=1)
PYEOF

cat > $W/pacecheck.py <<'PYEOF'
# Vertex request starts from both processes (this render and the staging runtime) in the render window, merged.
import json, sys
t0, t1 = float(sys.argv[1]) - 5, float(sys.argv[2]) + 5
rows = []
for path, who in (('/opt/vp-stage/samples-r13/samples-pace.jsonl', 'samples'), ('/opt/vp-stage/data/vertex-pace.jsonl', 'runtime')):
    try:
        for line in open(path):
            d = json.loads(line)
            if 't' in d and t0 <= d['t'] <= t1: rows.append((d['t'], who, d.get('kind'), d.get('wait_ms')))
    except OSError: pass
rows.sort(); gaps = [round(b[0] - a[0], 3) for a, b in zip(rows, rows[1:])]
print(json.dumps({'vertex_request_starts': len(rows), 'by_process': {w: sum(1 for r in rows if r[1] == w) for w in ('samples', 'runtime')},
                  'min_gap_s': min(gaps) if gaps else None, 'rows': rows}))
PYEOF

chown -R vpstage:vpstage $W
cd $S/app/product/voice
echo "== render $(date -u)"
T0=$(date +%s.%N)
runuser -u vpstage -- $PY $W/render.py --out $W/out > $W/render.log 2>&1; RC=$?
T1=$(date +%s.%N)
echo "renderer exit $RC"; cut -c1-400 $W/render.log
ls -la $W/out
echo "== pacing"
$PY $W/pacecheck.py $T0 $T1 | tee $W/pacecheck.json | cut -c1-1500
echo "== qa $(date -u)"
if [ -f $W/out/manifest.json ]; then
  runuser -u vpstage -- $PY $W/qa.py $W/out > $W/qa.json 2> $W/qa.err; echo "qa exit $?"; tail -3 $W/qa.err | cut -c1-300
  $PY - <<'PYEOF'
import json
d = json.load(open('/opt/vp-stage/samples-r13/qa.json'))
for f, r in d['clips'].items():
    st = (r['probe'].get('streams') or [{}])[0]; fm = r['probe'].get('format') or {}
    print(f, r['bytes'], 'B', st.get('codec_name'), st.get('channels'), st.get('sample_rate'), fm.get('duration'), 's',
          'I', r['lufs_i'], 'TP', r['true_peak_dbfs'], 'RMS', r['rms_dbfs'], 'asr', r['asr_http'], r['asr']['status'], r['asr']['confidence'])
PYEOF
fi
echo "== upload $(date -u)"
up() { curl -s -o /dev/null -w "put $2 %{http_code}\n" -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @"$1" "$B/samples-r13/$2?$SAS"; }
for f in $W/out/*; do up "$f" "out/$(basename $f)"; done
for f in qa.json pacecheck.json render.log samples-pace.jsonl qa.err; do [ -f $W/$f ] && up $W/$f $f; done
echo "== health $(date -u)"
systemctl is-active vp-stage-control vp-stage-runtime voicelab caddy
curl -s -m 5 -o /dev/null -w "runtime health %{http_code}\n" http://127.0.0.1:8090/v1/health
echo "lab ping: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
