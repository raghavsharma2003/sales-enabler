#!/usr/bin/env python3
# r6: read each run's own database for the outcome misses (as round 5 did by hand): what the analysis record holds on a
# call whose stored outcome differs from the key: outcomeGuess, outcomeUnclear (an outcome the quote check dropped),
# outcomeConfidence, the model's reason code and the stored one. Maps conversations to bench items by contact number:
# the bench numbers contacts in creation order, and the 42 per-call conversations come before the cross slice.
# Usage: misses.py <label>...   (reads /dev/shm/bench-out-r6/logs/<log for label> for db=...; prints JSON)
import json, os, re, subprocess, sys
PGB = '/usr/lib/postgresql/16/bin'; D = '/dev/shm/vp-pgbench7'; PORT = '55439'
R6 = '/dev/shm/wt-bench6/research/2026-10-24/benches-r6'
LOGS = '/dev/shm/bench-out-r6/logs'
LOGNAME = lambda lab: (f"analysis-dev-mini.{lab[len('dev-gpt-4.1-mini.'):]}.log" if lab.startswith('dev-gpt-4.1-mini.')
                       else f"analysis-mini.{lab[len('gpt-4.1-mini.'):]}.log" if lab.startswith('gpt-4.1-mini.')
                       else f"analysis-tiered.{lab[len('tiered.'):]}.log")
def q(db, sql):
    r = subprocess.run([f'{PGB}/psql', '-h', D, '-p', PORT, '-U', 'vp', '-d', db, '-tAc', sql], capture_output=True, text=True, check=True)
    return r.stdout.strip()
out = {}
for lab in sys.argv[1:]:
    log = open(os.path.join(LOGS, LOGNAME(lab))).read()
    db = re.search(r'db=(\S+)', log).group(1)
    j = json.load(open(f'{R6}/analysis-{lab}.json'))
    items = j['items']
    ws = q(db, "SELECT id FROM workspace ORDER BY created_at LIMIT 1")
    rows = json.loads(q(db, f"""SELECT coalesce(json_agg(x ORDER BY x.e164), '[]') FROM (SELECT c.e164, cv.reason_code,
        cv.analysis->'outcomeGuess' AS guess, cv.analysis->'outcomeUnclear' AS unclear, cv.analysis->'outcomeConfidence' AS conf,
        cv.analysis->>'modelReasonCode' AS model_code, cv.analysis->'tier' AS tier
        FROM conversation cv JOIN contact c ON c.id = cv.contact_id WHERE cv.workspace_id = '{ws}') x"""))
    assert len(rows) == len(items), (lab, len(rows), len(items))
    miss = []
    for it, r in zip(items, rows):
        assert it['predicted']['reasonCode'] == r['reason_code'], (lab, it['id'])
        assert (it['predicted']['outcome'] or None) == ((r['guess'] or {}).get('value') if r['guess'] else None), (lab, it['id'])
        if it['predicted']['outcome'] != it['key']['outcome']:
            miss.append({'id': it['id'], 'key': it['key']['outcome'], 'stored': it['predicted']['outcome'], 'outcomeUnclear': r['unclear'],
                         'outcomeConfidence': r['conf'], 'modelReasonCode': r['model_code'], 'storedReasonCode': r['reason_code'],
                         'tier': r['tier']})
    out[lab] = {'db': 'checked (name withheld)', 'misses': miss, 'allMappedAndMatched': True}
json.dump(out, sys.stdout, indent=1, ensure_ascii=False)
