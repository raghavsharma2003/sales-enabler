# g2-gemini-live-measured: run a plan of Live calls (one stream = sequential calls), with backoff on quota errors.
# Usage: python matrix.py PLAN.json STREAM_NAME OUT_DIR
import json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_CFG = {
    'gemini-3.1-flash-live-preview': ['--api', 'v1alpha', '--lang', 'hi-IN', '--thinking', 'budget0'],   # Meera's setup; affective/proactive unsupported (docs; affective 1007 at setup)
    'gemini-3.8-live': ['--api', 'v1alpha', '--lang', 'hi-IN', '--proactive'],                              # affective: setup accepted, 1007 on first audio
    'gemini-2.5-flash-native-audio-latest': ['--api', 'v1alpha', '--lang', 'hi-IN', '--thinking', 'budget0', '--affective', '--proactive'],
}
SHORT = {'gemini-3.1-flash-live-preview': 'g31', 'gemini-3.8-live': 'g38', 'gemini-2.5-flash-native-audio-latest': 'g25'}
def main():
    plan = json.load(open(sys.argv[1])); stream = sys.argv[2]; out = sys.argv[3]
    py = sys.executable
    logf = open(os.path.join(out, f'plan_{stream}.jsonl'), 'a')
    for c in plan[stream]:
        tag = c['tag']
        if os.path.exists(os.path.join(out, tag, 'turns.jsonl')):
            continue
        cmd = [py, os.path.join(HERE, 'live_call.py'), '--model', c['model'], *MODEL_CFG[c['model']], '--minutes', str(c['minutes']),
               '--script', c.get('script', 'P1'), '--compression', c.get('compression', 'off'), '--vad', c.get('vad', 'meera'),
               '--seed', str(c.get('seed', 1)), '--out', out, '--tag', tag] + (['--save-audio'] if c.get('save_audio', True) else []) + c.get('extra', [])
        backoff = 30
        for attempt in range(6):
            t0 = time.time()
            r = subprocess.run(cmd, capture_output=True, text=True)
            last = (r.stdout.strip().splitlines() or [''])[-1]
            rec = {'tag': tag, 'attempt': attempt, 'rc': r.returncode, 'wall_s': round(time.time() - t0, 1), 'utc': time.strftime('%H:%M:%S', time.gmtime()), 'last': last[:600], 'stderr': r.stderr[-400:]}
            logf.write(json.dumps(rec, ensure_ascii=False) + '\n'); logf.flush()
            print(json.dumps(rec, ensure_ascii=False)[:400], flush=True)
            quota = any(k in (last + r.stderr).lower() for k in ('quota', '429', 'resource_exhausted', 'rate limit', 'exceeded'))
            if r.returncode == 0 and '"turns": 0' not in last:
                break
            if quota or r.returncode != 0:
                # keep the failed attempt's folder for the record, then retry
                os.rename(os.path.join(out, tag), os.path.join(out, f'{tag}__fail{attempt}_{int(t0)}')) if os.path.exists(os.path.join(out, tag)) else None
                time.sleep(backoff); backoff = min(backoff * 2, 1800)
            else:
                break
if __name__ == '__main__':
    main()
