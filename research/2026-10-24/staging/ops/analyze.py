# Reply-gap analysis for the 2026-10-24 staging runs (e9fdde3). Extends ../../2026-10-23/staging/ops/analyze.py:
# - the gap is the runtime's own number on the socket (reply.latencyMs), as on 23 Oct; median CI by bootstrap
#   (10,000 resamples, seed 20261024);
# - each reply is split by the runtime's own per-stage timing (GET /v1/calls/{id} -> timing.replies, joined by rid):
#   stages ears, turn, brain, sentence, voice, hold, out, and the marks relative to end of speech;
# - pacing: the pacer's waits inside each gap, by request kind (brain, voice, warm, judge);
# - partial lag: the raw lags from the probe (speech onset -> the recogniser's first words), pooled;
# - with the judge in shadow (run 'js'): for each reply, whether the judge's verdict was in before her first sentence
#   (probe marks, same process clock), and how much of the judge's own latency was pacer wait.
# Runs: r1 = the shipped latency defaults; nf = VP_SPECULATE_PARTIAL=0 VP_PREWARM=0; js / jsnf = the same, judge in shadow.
# Usage: python analyze.py DATA_DIR OUT_DIR
import csv, json, os, random, statistics, sys
from collections import Counter, defaultdict
D, OUT = sys.argv[1], sys.argv[2]
STACKS = ['v2-flashlite', 'v2-mai', 'v2-54mini']
STAGES = ['ears', 'turn', 'brain', 'sentence', 'voice', 'hold', 'out']
MARKS = ['final', 'brain_req', 'brain_first', 'sentence', 'tts_req', 'tts_first', 'release', 'audio']

def jl(p): return [json.loads(l) for l in open(p) if l.strip()] if os.path.exists(p) else []
def pct(xs, p):
    xs = sorted(xs); k = (len(xs) - 1) * p; f = int(k); c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)
def boot_median(xs, B=10000, seed=20261024):
    r = random.Random(seed); n = len(xs); ms = sorted(statistics.median(r.choices(xs, k=n)) for _ in range(B))
    return ms[int(0.025 * B)], ms[int(0.975 * B) - 1]
def med(xs): return round(statistics.median(xs)) if xs else None

pace, cur = [], {}
for x in jl(f'{D}/vertex-pace.jsonl'):
    if 't' in x: x = dict(x); pace.append(x); cur[x['n']] = x
    elif x.get('n') in cur: cur[x['n']].update({k: v for k, v in x.items() if k != 'n'})
probes = jl(f'{D}/probes.jsonl')
lags = {}
for x in probes:
    if x['k'] == 'lags': lags[x['cid']] = x['lags']                    # the last read of each call has them all
preply = {(x['cid'], x['rid']): x for x in probes if x['k'] == 'reply' and x.get('eos') is not None}
pjudge = defaultdict(list)
for x in probes:
    if x['k'] == 'judge': pjudge[x['cid']].append(x)

# r1: shipped latency defaults; nf: VP_SPECULATE_PARTIAL=0 VP_PREWARM=0; js / jsnf: the same two, with the judge in shadow
runs = [(a, s, f'{D}/vps4-gap-{s}-{a}-{s}-{a}.jsonl') for a in ('r1', 'nf') for s in STACKS]
runs += [(a, s, f'{D}/vps4-{a}-{s}.jsonl') for a in ('js', 'jsnf') for s in STACKS]
rows, summ = [], {}
for RUN, st, p in runs:
    calls = jl(p)
    if not calls: continue
    key = f'{st}@{RUN}'; S = summ.setdefault(key, {'calls': 0, 'gaps': [], 'waits': [], 'cost': 0, 'dur': 0, 'errors': [], 'fatal': [], 'lags': [],
                                                    'stages': defaultdict(list), 'marks': defaultdict(list), 'spec': 0, 'judge': [], 'ends': [], 'rt_err': 0, 'undelivered': 0,
                                                    'held_behind': Counter(), 'held_n': Counter(), 'req': Counter(), 'brain_no_hdr': 0})
    for c in calls:
        if c.get('fatal'): S['fatal'].append(c['fatal']); continue
        S['calls'] += 1; S['cost'] += c.get('costInrMilli') or 0; S['dur'] += c.get('durationS') or 0; S['errors'] += c.get('errors') or []
        S['ends'].append(c.get('endReason')); S['rt_err'] += 1 if c.get('rtTimingError') else 0; S['undelivered'] += c.get('rtUndelivered') or 0
        cid = c['conversationId']; S['lags'] += lags.get(cid, [])
        # contention over the whole call: each paced request, and the kind of the request just before it (the one
        # holding the pacer's slot); brain requests cancelled before response headers (discarded speculation)
        t_a = c.get('placedAt') or 0; t_b = t_a + (c.get('durationS') or 0) + 15
        nxt = min([d.get('placedAt') for d in calls if (d.get('placedAt') or 0) > t_a] or [t_b])   # never into the next call
        t_b = min(t_b, nxt - 0.001)
        for j, x in enumerate(pace):
            if not (t_a <= x['t'] <= t_b): continue
            S['req'][x['kind']] += 1
            if x['kind'] == 'brain' and 'hdr_ms' not in x: S['brain_no_hdr'] += 1
            if x['wait_ms'] > 0 and j > 0:
                S['held_behind'][f"{x['kind']} behind {pace[j - 1]['kind']}"] += x['wait_ms']; S['held_n'][f"{x['kind']} behind {pace[j - 1]['kind']}"] += 1
        rt = {r['rid']: r for r in ((c.get('rtTiming') or {}).get('replies') or [])}
        i = 0
        for wall, g in c.get('replyWall') or []:
            if g is None: continue
            i += 1
            lo, hi = wall - g / 1000.0, wall
            inwin = [x for x in pace if lo <= x['t'] <= hi]
            wk = Counter()
            for x in inwin:
                if x['wait_ms'] > 0: wk[x['kind']] += x['wait_ms']
            w = sum(wk.values())
            S['gaps'].append(g); S['waits'].append(w)
            # the runtime row for this reply: same gap, in order (rids are not on replyWall)
            cand = [r for r in rt.values() if r['gapMs'] == g and not r.get('_used')]
            r = cand[0] if cand else None
            if r: r['_used'] = True
            row = {'run': RUN, 'stack': st, 'call': c['k'], 'conversation_id': cid, 'reply': i, 'rid': r['rid'] if r else '', 'gap_ms': g,
                   'speculative': r.get('speculative') if r else '', **{f'{k}_ms': (r['stages'].get(k) if r else '') for k in STAGES},
                   **{f'at_{k}_ms': (r['at'].get(k) if r else '') for k in MARKS},
                   'vertex_requests_in_gap': len(inwin), 'pacing_wait_ms_in_gap': w, 'pacing_wait_by_kind': ';'.join(f'{k}:{v}' for k, v in sorted(wk.items())),
                   'gap_minus_pacing_ms': g - w, 'judge_latency_ms': '', 'judge_event': '', 'judge_pacing_wait_ms': '', 'judge_in_before_first_sentence': ''}
            if r:
                if r.get('speculative'): S['spec'] += 1
                for k in STAGES:
                    if r['stages'].get(k) is not None: S['stages'][k].append(r['stages'][k])
                for k in MARKS:
                    if r['at'].get(k) is not None: S['marks'][k].append(r['at'][k])
                pr = preply.get((cid, r['rid']))
                if RUN in ('js', 'jsnf') and pr and pr.get('sentence') is not None:
                    # the judge call this reply's caller turn started: it starts on the final, so take the judge whose
                    # start is nearest the reply's final mark (within 1 s) in the same call
                    js = [j for j in pjudge.get(cid, []) if pr.get('final') is not None and abs(j['t0'] - pr['final']) < 1.0]
                    j = min(js, key=lambda j: abs(j['t0'] - pr['final'])) if js else None
                    if j:
                        # its request in the pace log: logged when the pacer let it start (after any wait), so within
                        # [judge start, judge start + 1.1 s] of the judge's own start (wall = end wall - duration)
                        j0 = j['wall'] - (j['t1'] - j['t0'])
                        pj = [x for x in pace if x['kind'] == 'judge' and j0 - 0.05 <= x['t'] <= j0 + 1.1]
                        jw = min(pj, key=lambda x: x['t'])['wait_ms'] if pj else None
                        landed = j['t1'] <= pr['sentence']
                        row.update({'judge_latency_ms': j['latencyMs'], 'judge_event': j['event'] or ('verdict' if j['called'] else 'not called'),
                                    'judge_pacing_wait_ms': jw if jw is not None else '', 'judge_in_before_first_sentence': landed})
                        S['judge'].append({'landed': landed, 'lat': j['latencyMs'], 'wait': jw, 'event': j['event'], 'called': j['called'],
                                           'slack_ms': int(round((pr['sentence'] - j['t1']) * 1000)),
                                           'slack_unpaced_ms': int(round((pr['sentence'] - j['t1']) * 1000)) + (jw or 0)})
                    else:
                        S['judge'].append({'landed': None, 'lat': None, 'wait': None, 'event': 'no judge call matched', 'called': False, 'slack_ms': None, 'slack_unpaced_ms': None})
            rows.append(row)
out = {}
for key, S in summ.items():
    g = S['gaps']
    if not g: out[key] = {'n': 0, 'fatal': S['fatal']}; continue
    lo, hi = boot_median(g); adj = [a - b for a, b in zip(g, S['waits'])]
    o = {'n': len(g), 'calls': S['calls'], 'p50': med(g), 'p90': round(pct(g, 0.9)), 'min': min(g), 'max': max(g), 'median_ci95': [round(lo), round(hi)],
         'replies_paced': sum(1 for w in S['waits'] if w > 0), 'pacing_wait_max_ms': max(S['waits']), 'p50_minus_pacing': med(adj), 'p90_minus_pacing': round(pct(adj, 0.9)),
         'speculative_replies': S['spec'], 'stage_n': len(S['stages']['ears']), 'stages_p50': {k: med(v) for k, v in S['stages'].items()},
         'marks_p50_after_eos': {k: med(v) for k, v in S['marks'].items()},
         'partial_lag': {'n': len(S['lags']), 'p50': med(S['lags']), 'p90': round(pct(S['lags'], 0.9)) if S['lags'] else None, 'min': min(S['lags']) if S['lags'] else None, 'max': max(S['lags']) if S['lags'] else None},
         'inr_per_min': round(S['cost'] / 1000 / (S['dur'] / 60), 2) if S['dur'] else None, 'cost_inr': round(S['cost'] / 1000, 2), 'talk_s': S['dur'],
         'vertex_requests': dict(S['req']), 'brain_cancelled_before_headers': S['brain_no_hdr'],
         'pacer_wait_ms_by_who_waited_behind_whom': dict(S['held_behind']), 'pacer_waits_n': dict(S['held_n']),
         'errors': S['errors'], 'fatal': S['fatal'], 'end_reasons': dict(Counter(S['ends'])), 'rt_timing_errors': S['rt_err'], 'undelivered_events': S['undelivered']}
    if S['judge']:
        J = S['judge']; m = [x for x in J if x['landed'] is not None]
        o['judge_window'] = {'replies': len(J), 'matched': len(m), 'in_before_first_sentence': sum(1 for x in m if x['landed']),
                             'events': dict(Counter(str(x['event']) for x in J)), 'latency_p50': med([x['lat'] for x in m]), 'latency_p90': round(pct([x['lat'] for x in m], 0.9)) if m else None,
                             'judge_pacing_wait_p50': med([x['wait'] for x in m if x['wait'] is not None]), 'judge_requests_paced': sum(1 for x in m if (x['wait'] or 0) > 0),
                             'slack_p50_ms': med([x['slack_ms'] for x in m]),
                             'in_before_if_unpaced_estimate': sum(1 for x in m if x['slack_unpaced_ms'] >= 0)}
    out[key] = o
with open(f'{OUT}/reply-gap.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
json.dump(out, open(f'{OUT}/reply-gap-summary.json', 'w'), indent=1)
for k, v in out.items(): print(k, json.dumps(v))
allg = [x for x in pace]
if allg:
    ts = sorted(x['t'] for x in allg); gg = [b - a for a, b in zip(ts, ts[1:])]
    print('vertex request starts in the pace log', len(allg), 'min spacing s', round(min(gg), 3) if gg else None, 'by kind', dict(Counter(x['kind'] for x in allg)))
