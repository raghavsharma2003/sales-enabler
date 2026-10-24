# BLIND 9 Run Command wrapper (2026-10-24). Reuses ../../staging/ops/ops.py (itself a thin wrapper over
# voicelab/ops/lab_ops.py): the same blob and Run Command mechanics, ONLY the SAS and the staging env (vp-stage.env) as
# protected parameters, and a refusal to start while another Run Command is active on the VM.
# One change: prune orders records by EACH record's own start time, read with a per-record GET ($expand=instanceView).
# The list call does not reliably carry instanceView, so sorting the list's own entries can fall back to list order.
# Nothing secret is printed.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'staging', 'ops'))
import ops as O            # patches lab_ops: secrets() = SAS + vp-stage.env; run() guarded by busy()
L = O.L
PATH = f'{L.RG}/Microsoft.Compute/virtualMachines/{L.VM}/runCommands'

def records():
    s, d = L.arm('GET', f'{PATH}?api-version=2024-03-01')
    out = []
    for x in d.get('value', []):
        s2, d2 = L.arm('GET', f"{PATH}/{x['name']}?api-version=2024-03-01&$expand=instanceView")
        iv = ((d2.get('properties') or {}).get('instanceView')) or {}
        out.append({'name': x['name'], 'state': iv.get('executionState'), 'start': iv.get('startTime') or '', 'end': iv.get('endTime') or ''})
    return out

def prune(keep=8, cap=25):
    rs = records()
    active = [r for r in rs if r['state'] in ('Running', 'Pending')]
    if active: raise SystemExit(f'not pruning: active Run Command {[(r["name"], r["state"]) for r in active]}')
    rs.sort(key=lambda r: r['start'], reverse=True)          # newest first, by the record's own start time
    for r in rs[keep:]:
        s, _ = L.arm('DELETE', f"{PATH}/{r['name']}?api-version=2024-03-01"); print('DELETE', r['name'], r['start'], s)
    print('kept', [(r['name'], r['start']) for r in rs[:keep]], f'({len(rs[:keep])} of at most {cap})')

L.prune = lambda keep=8: prune(keep)                         # ops.run_guarded calls L.prune() at 24 records

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'records':
        rs = sorted(records(), key=lambda r: r['start'])
        for r in rs: print(r['start'], r['end'], r['state'], r['name'])
        print(len(rs), 'records')
    elif cmd == 'prune': prune(int(sys.argv[2]) if len(sys.argv) > 2 else 8)
    elif cmd == 'busy': print(O.busy())
    elif cmd == 'put': L.put(sys.argv[2], sys.argv[3])
    elif cmd == 'get': L.get(sys.argv[2], sys.argv[3])
    elif cmd == 'run': L.run(sys.argv[2], open(sys.argv[3]).read(), int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 3600, '--async' in sys.argv)
    elif cmd == 'status': L.status(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    else: raise SystemExit(cmd)
