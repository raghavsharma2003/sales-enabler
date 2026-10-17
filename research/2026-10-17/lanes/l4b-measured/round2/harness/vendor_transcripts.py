# vendor_transcripts.py <runs_dir> <out.md> <glob-prefix>: Sarvam app-runtime transcript events per call (vendor's own
# ASR for the caller, and the bot's own text), with harness-clock seconds. Provenance copy of what the vendor logged.
import json, sys, glob, os
runs, out, pref = sys.argv[1], sys.argv[2], sys.argv[3]
L = ['# Sarvam homepage widget: vendor transcript events (round 2)', '',
     'Source: `server.event.transcription` frames in each call\'s WebSocket dump (role user = Sarvam ASR of our scripted caller; role bot = the agent\'s text). '
     'Times are seconds on the harness clock. Interim user transcripts are cumulative (each repeats the turn so far). Captured 2026-10-17 from a US-East sandbox via proxy.', '']
for f in sorted(glob.glob(os.path.join(runs, pref + '*.ws.jsonl'))):
    name = os.path.basename(f).replace('.ws.jsonl', '')
    if 'probe' in name: continue
    L += [f'## {name}', '']
    conn = None
    for line in open(f):
        try: x = json.loads(line); j = json.loads(x.get('p') or '')
        except Exception: continue
        t = j.get('type')
        if t == 'server.action.interaction_connected' and conn is None:
            conn = {k: j.get(k) for k in ('initial_language_name', 'initial_state_name')}
            L.append(f"- connected: initial_language_name={conn['initial_language_name']}, agent lender/product from agent_variables: "
                     f"{(j.get('agent_variables') or {}).get('lender_name','')}, {(j.get('agent_variables') or {}).get('product_type','')}")
        elif t == 'server.event.transcription':
            L.append(f"- {x['t']/1000:7.1f} s **{j.get('role')}**: {j.get('content','')}")
        elif t in ('server.action.interaction_end',):
            L.append(f"- {x['t']/1000:7.1f} s _{t}_")
    L.append('')
open(out, 'w').write('\n'.join(L))
print('wrote', out, len(L), 'lines')
