# g5-gemini-paid: run one stream of a plan (sequential Live calls), paid or free per call.
# Usage: python runplan.py PLAN.json STREAM OUT_DIR --ledger LEDGER --stop-file STOP [--budget-usd 18]
# Model setups mirror g2's matrix.py MODEL_CFG so paid (g5) and free (g2, g5) sessions are byte-comparable.
# Free tier: back off on quota-looking failures (30 s doubling, 6 tries). Paid: a refused session (rc 3: STOP file or
# ledger budget) ends the stream; a billing stop ends the stream.
import argparse, json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_CFG = {
    'gemini-3.1-flash-live-preview': ['--api', 'v1alpha', '--lang', 'hi-IN', '--thinking', 'budget0'],
    'gemini-3.8-live': ['--api', 'v1alpha', '--lang', 'hi-IN', '--proactive'],
}
QUOTA = ('quota', '429', 'resource_exhausted', 'rate limit', 'exceeded', '1011', 'unavailable', 'overloaded')
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('plan'); ap.add_argument('stream'); ap.add_argument('out')
    ap.add_argument('--ledger', required=True); ap.add_argument('--stop-file', required=True)
    ap.add_argument('--budget-usd', type=float, default=18.0)
    a = ap.parse_args()
    plan = json.load(open(a.plan))
    os.makedirs(a.out, exist_ok=True)
    py = sys.executable
    logf = open(os.path.join(a.out, f'plan_{a.stream}.jsonl'), 'a')
    for c in plan[a.stream]:
        tag = c['tag']
        if os.path.exists(os.path.join(a.out, tag, 'turns.jsonl')):
            continue
        cmd = [py, os.path.join(HERE, 'live_call.py'), '--model', c['model'], *MODEL_CFG[c['model']], '--tier', c['tier'],
               '--minutes', str(c['minutes']), '--script', c.get('script', 'P1'), '--compression', c.get('compression', 'off'),
               '--vad', c.get('vad', 'meera'), '--seed', str(c.get('seed', 1)), '--out', a.out, '--tag', tag,
               '--ledger', a.ledger, '--stop-file', a.stop_file, '--budget-usd', str(a.budget_usd),
               '--expect-usd', str(c.get('expect_usd', 0.5)), '--cap-usd', str(c.get('cap_usd', 2.5))] \
              + (['--save-audio'] if c.get('save_audio', False) else []) + c.get('extra', [])
        backoff = 30; stop_stream = False
        for attempt in range(6):
            t0 = time.time()
            r = subprocess.run(cmd, capture_output=True, text=True)
            last = (r.stdout.strip().splitlines() or [''])[-1]
            rec = {'tag': tag, 'tier': c['tier'], 'attempt': attempt, 'rc': r.returncode, 'wall_s': round(time.time() - t0, 1),
                   'utc': time.strftime('%H:%M:%S', time.gmtime()), 'last': last[:700], 'stderr': r.stderr[-400:]}
            logf.write(json.dumps(rec, ensure_ascii=False) + '\n'); logf.flush()
            print(json.dumps(rec, ensure_ascii=False)[:500], flush=True)
            if r.returncode == 3:
                stop_stream = True; break
            if os.path.exists(a.stop_file) and c['tier'] == 'paid':
                stop_stream = True; break
            blob = (last + r.stderr).lower()
            ok = r.returncode == 0 and '"turns": 0' not in last
            if ok:
                break
            if os.path.exists(os.path.join(a.out, tag)):
                os.rename(os.path.join(a.out, tag), os.path.join(a.out, f'{tag}__fail{attempt}_{int(t0)}'))
            if c['tier'] == 'paid' and attempt >= 1:
                break  # do not keep spending on a paid config that fails twice
            time.sleep(backoff if any(k in blob for k in QUOTA) else 10); backoff = min(backoff * 2, 900)
        if stop_stream:
            print('STREAM STOPPED (paid refused or billing stop)', flush=True); break
if __name__ == '__main__':
    main()
