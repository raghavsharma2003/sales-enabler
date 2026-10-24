#!/bin/bash
# R13 follow-up (offline, no provider request): did the sample render resolve the same Vertex model ids as the running
# staging runtime? The render's launcher read /opt/vp-stage/.env line by line and logged "VERTEX_MODEL_MAP ignored";
# systemd's EnvironmentFile parsing (quotes stripped) is what the runtime got. Compares the two for the models the samples
# use. Prints model ids and parse status only; no other env value is printed.
S=/opt/vp-stage
echo "== mapcheck $(date -u)"
PID=$(systemctl show -p MainPID --value vp-stage-runtime); echo "runtime pid $PID"
cd $S/app/product/voice
$S/venv/bin/python - "$PID" <<'PYEOF'
import json, os, sys
sys.path.insert(0, os.getcwd())
from vpvoice.providers import google as G
from vpvoice import catalog
pid = sys.argv[1]
run_env = dict(x.split('=', 1) for x in open(f'/proc/{pid}/environ', 'rb').read().decode('utf-8', 'replace').split('\0') if '=' in x)
naive = {}
for line in open('/opt/vp-stage/.env'):
    line = line.rstrip('\n')
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1); naive[k] = v
raw_n = naive.get('VERTEX_MODEL_MAP', ''); raw_r = run_env.get('VERTEX_MODEL_MAP', '')
print('naive first/last char:', repr(raw_n[:1]), repr(raw_n[-1:]), 'len', len(raw_n))
print('runtime first/last char:', repr(raw_r[:1]), repr(raw_r[-1:]), 'len', len(raw_r))
for label, raw in (('runtime (systemd)', raw_r), ('render (naive)', raw_n)):
    try: print(label, 'map parses:', json.loads(raw))
    except ValueError as e: print(label, 'map does not parse:', e)
used = [catalog.TTS['gemini-lite']['model'], catalog.S2S['gemini-3.8-live']['model']]
mr = G.model_map({'VERTEX_MODEL_MAP': raw_r}); mn = G.model_map({'VERTEX_MODEL_MAP': raw_n})
for m in used: print('model', m, '-> runtime', mr.get(m), '| render', mn.get(m), '| same', mr.get(m) == mn.get(m))
print('maps differ only in:', sorted(k for k in set(mr) | set(mn) if mr.get(k) != mn.get(k)))
for k in ('VERTEX_LOCATION', 'VERTEX_LIVE_LOCATION', 'VERTEX_LIVE_AUDIO', 'VP_REGION', 'VERTEX_OFF'):
    print(k, 'same in both:', run_env.get(k) == naive.get(k), run_env.get(k))
PYEOF
journalctl -u vp-stage-runtime --since "2026-10-24 02:31" --no-pager | grep -c "VERTEX_MODEL_MAP ignored" | sed 's/^/runtime journal "VERTEX_MODEL_MAP ignored" lines since deploy: /'
