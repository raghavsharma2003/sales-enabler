# Stage 8 Run Command wrapper (2026-10-24): ../../judge-blind9/ops/ops9.py unchanged (SAS and vp-stage.env as protected
# parameters only; refuses to start while another Run Command is active; prunes by each record's own start time), with
# ONE extension: when OPS8_OWNER=1 is set in this process's environment, the owner's login (scratchpad vp-owner.env:
# VP_OWNER_EMAIL, VP_OWNER_PASSWORD) is added to the protected parameters too, for the owner-account step only. ops9.py
# cannot pass a second protected env file, so this copy extends it rather than editing it. Nothing secret is printed.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'judge-blind9', 'ops'))
import ops9 as O9          # imports ../staging/ops/ops.py, which patches lab_ops: secrets() = SAS + vp-stage.env, run() guarded
L = O9.L
_base = L.secrets          # ops.py's secrets(): SAS + vp-stage.env

def secrets():
    out = _base()
    if os.environ.get('OPS8_OWNER') == '1':
        p = f'{L.SP}/vp-owner.env'
        own = L.envfile(p)
        missing = [k for k in ('VP_OWNER_EMAIL', 'VP_OWNER_PASSWORD') if not own.get(k)]
        if missing: raise SystemExit(f'{p} lacks {missing}')
        out.update({k: own[k] for k in ('VP_OWNER_EMAIL', 'VP_OWNER_PASSWORD')})
    return out
L.secrets = secrets

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'records':
        rs = sorted(O9.records(), key=lambda r: r['start'])
        for r in rs: print(r['start'], r['end'], r['state'], r['name'])
        print(len(rs), 'records')
    elif cmd == 'prune': O9.prune(int(sys.argv[2]) if len(sys.argv) > 2 else 8)
    elif cmd == 'busy': print(O9.O.busy())
    elif cmd == 'names': print(sorted(secrets()))          # parameter NAMES only, never values
    elif cmd == 'put': L.put(sys.argv[2], sys.argv[3])
    elif cmd == 'get': L.get(sys.argv[2], sys.argv[3])
    elif cmd == 'run': L.run(sys.argv[2], open(sys.argv[3]).read(), int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 3600, '--async' in sys.argv)
    elif cmd == 'status': L.status(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    else: raise SystemExit(cmd)
