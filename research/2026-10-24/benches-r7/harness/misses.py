#!/usr/bin/env python3
# r7 copy of research/2026-10-24/benches-r6/harness/misses.py (paths changed). r7 additions, after r6's checks: every
# moment, objection, commitment and crisis miss (stored call_moment kinds), and per run the outcomeConfidence over the
# calls with an outcome, with the tier record, so the distance from tiered's 0.6 threshold is read from the database.
# r6: read each run's own database for the outcome misses (as round 5 did by hand): what the analysis record holds on a
# call whose stored outcome differs from the key: outcomeGuess, outcomeUnclear (an outcome the quote check dropped),
# outcomeConfidence, the model's reason code and the stored one. Maps conversations to bench items by contact number:
# the bench numbers contacts in creation order, and the 42 per-call conversations come before the cross slice.
# Usage: misses.py <label>...   (reads /dev/shm/bench-out-r7/logs/<log for label> for db=...; prints JSON)
import json, os, re, subprocess, sys
PGB = '/usr/lib/postgresql/16/bin'; D = '/dev/shm/vp-pgbench-r7'; PORT = '55447'
R7 = '/dev/shm/wt-bench7/research/2026-10-24/benches-r7'
LOGS = '/dev/shm/bench-out-r7/logs'
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
    j = json.load(open(f'{R7}/analysis-{lab}.json'))
    items = j['items']
    ws = q(db, "SELECT id FROM workspace ORDER BY created_at LIMIT 1")
    rows = json.loads(q(db, f"""SELECT coalesce(json_agg(x ORDER BY x.e164), '[]') FROM (SELECT c.e164, cv.reason_code,
        cv.analysis->'outcomeGuess' AS guess, cv.analysis->'outcomeUnclear' AS unclear, cv.analysis->'outcomeConfidence' AS conf,
        cv.analysis->>'modelReasonCode' AS model_code, cv.analysis->'tier' AS tier, cv.analysis->>'status' AS status,
        (SELECT coalesce(json_agg(m.kind ORDER BY m.kind), '[]') FROM call_moment m WHERE m.conversation_id = cv.id AND m.source = 'analysis') AS kinds
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
    mm = []
    for it, r in zip(items, rows):
        assert sorted(set(it['predicted']['moments'])) == sorted(set(r['kinds'])), (lab, it['id'], 'moments')
        lost = [m['kind'] for m in it['key']['moments'] if m['kind'] not in r['kinds']]
        if lost or it['predicted']['crisis'] != it['key']['crisis']:
            mm.append({'id': it['id'], 'keyKinds': [m['kind'] for m in it['key']['moments']], 'storedKinds': r['kinds'], 'lost': lost,
                       'crisisKey': it['key']['crisis'], 'crisisPredicted': it['predicted']['crisis']})
    confs = [(it['id'], r['conf']) for it, r in zip(items, rows) if r['guess']]
    cv_ = sorted(c for _, c in confs if c is not None)
    tiers = [r['tier'] for r in rows if r['tier']]
    out[lab] = {'db': 'checked (name withheld)', 'misses': miss, 'momentOrCrisisMisses': mm, 'allMappedAndMatched': True,
                'storedStatus': dict(__import__('collections').Counter(r['status'] for r in rows)),
                'outcomeConfidence': {'callsWithOutcome': len(confs), 'withConfidence': len(cv_), 'min': cv_[0] if cv_ else None,
                                      'below0.6': sum(c < 0.6 for c in cv_), 'below0.9': sum(c < 0.9 for c in cv_),
                                      'lowest3': sorted(((c, i) for i, c in confs if c is not None))[:3],
                                      'histogram': dict(__import__('collections').Counter(cv_))},
                'tierRecords': {'n': len(tiers), 'escalated': sum(bool(t.get('escalated')) for t in tiers),
                                'why': dict(__import__('collections').Counter(str(t.get('why')) for t in tiers)),
                                'secondModels': sorted({str(t.get('secondModel')) for t in tiers})} if tiers else None}
json.dump(out, sys.stdout, indent=1, ensure_ascii=False)
