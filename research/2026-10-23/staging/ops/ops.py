# Thin wrapper over voicelab/ops/lab_ops.py for the VP staging job: same Run Command + blob mechanics,
# but passes ONLY the SAS and the staging env (vp-stage.env) as protected parameters. No Vertex SA re-upload,
# no lab keys re-sent (the VM already holds them in /opt/voicelab/.env).
import os, sys
sys.path.insert(0, '/home/user/sales-enabler/voicelab/ops')
import lab_ops as L
SP = L.SP
def secrets():
    out = {'SAS': open(f'{SP}/voicelab/sas.txt').read().strip()}
    p = f'{SP}/vp-stage.env'
    if os.path.exists(p): out.update(L.envfile(p))
    return out
L.secrets = secrets
def busy():
    path = f'{L.RG}/Microsoft.Compute/virtualMachines/{L.VM}/runCommands'
    s, d = L.arm('GET', f'{path}?api-version=2024-03-01')
    out = []
    for x in d.get('value', []):
        s2, d2 = L.arm('GET', f"{path}/{x['name']}?api-version=2024-03-01&$expand=instanceView")
        st = (((d2.get('properties') or {}).get('instanceView')) or {}).get('executionState')
        if st in ('Running', 'Pending'): out.append((x['name'], st))
    return out
_run = L.run
def run_guarded(name, script, timeout=3600, asyn=False):
    b = busy()
    if b: raise SystemExit(f'another Run Command is active on the VM: {b}; not starting {name}')
    s_, d_ = L.arm('GET', f'{L.RG}/Microsoft.Compute/virtualMachines/{L.VM}/runCommands?api-version=2024-03-01')
    if len(d_.get('value', [])) >= 24: L.prune()        # Azure keeps at most 25 managed Run Commands per VM; a PUT past it fails
    return _run(name, script, timeout, asyn)
L.run = run_guarded
if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'sas': L.sas(); print('sas ok')
    elif cmd == 'put': L.put(sys.argv[2], sys.argv[3])
    elif cmd == 'get': L.get(sys.argv[2], sys.argv[3])
    elif cmd == 'run': L.run(sys.argv[2], open(sys.argv[3]).read(), int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 3600, '--async' in sys.argv)
    elif cmd == 'status': L.status(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    elif cmd == 'prune': L.prune()
    elif cmd == 'busy': print(busy())
    else: raise SystemExit(cmd)
