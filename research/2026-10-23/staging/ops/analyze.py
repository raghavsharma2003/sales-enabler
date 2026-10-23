# Reply-gap analysis for the staging runs: per-stack stats from the runtime's own reply latencies, bootstrap CI of the
# median, pacing attribution from the Vertex pacer log, cost per minute from the control plane's cost lines.
import json, random, statistics, sys, os, csv
D = sys.argv[1]; OUT = sys.argv[2]
STACKS = ['v2-flashlite', 'v2-mai', 'v2-38flash', 'v2-54mini']
RUNS = (sys.argv[3] if len(sys.argv) > 3 else 'r2').split(',')
allp = []
if os.path.exists(f'{D}/vps-vertex-pace.jsonl'):
    allp = [json.loads(l) for l in open(f'{D}/vps-vertex-pace.jsonl') if l.strip()]
pace, cur = [], {}          # request starts (time, wait, kind); the runtime restarts per run, so n repeats: join in log order
for x in allp:
    if 't' in x: x = dict(x); pace.append(x); cur[x['n']] = x
    elif x.get('n') in cur: cur[x['n']].update({k: v for k, v in x.items() if k != 'n'})
def pct(xs, p):
    xs = sorted(xs); k = (len(xs) - 1) * p; f = int(k); c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)
def boot_median(xs, B=10000, seed=20261023):
    r = random.Random(seed); n = len(xs); ms = sorted(statistics.median(r.choices(xs, k=n)) for _ in range(B))
    return ms[int(0.025 * B)], ms[int(0.975 * B) - 1]
rows, summ = [], {}
for RUN, st in [(r, s_) for r in RUNS for s_ in STACKS]:
    p = f'{D}/vps-replygap-{st}-{RUN}.jsonl'
    if not os.path.exists(p): continue
    calls = [json.loads(l) for l in open(p) if l.strip()]
    gaps, tgaps, waits, cost, dur, errs, ai, ai1, fatal, ends = [], [], [], 0, 0, [], [], [], [], []
    for c in calls:
        if c.get('fatal'): fatal.append(c['fatal']); continue
        cost += c.get('costInrMilli') or 0; dur += c.get('durationS') or 0
        errs += c.get('errors') or []; ai.append(bool(c.get('aiSaid'))); ai1.append(bool(c.get('aiInFirstReply'))); ends.append(c.get('endReason'))
        tgaps += [g for g in (c.get('turnGaps') or []) if g is not None]
        i = 0
        for wall, g in c.get('replyWall') or []:
            if g is None: continue
            lo, hi = wall - g / 1000.0, wall
            w = sum(x['wait_ms'] for x in pace if lo <= x['t'] <= hi and x['wait_ms'] > 0)
            inwin = [x for x in pace if lo <= x['t'] <= hi]
            fb = next((x for x in inwin if x['kind'] == 'brain'), None); fv = next((x for x in inwin if x['kind'] == 'voice'), None)
            ms = lambda x: int(round((x['t'] - lo) * 1000)) if x else ''
            i += 1; gaps.append(g); waits.append(w)
            rows.append({'run': RUN, 'stack': st, 'call': c['k'], 'conversation_id': c['conversationId'], 'reply': i, 'gap_ms': g,
                         'vertex_requests_in_gap': len(inwin), 'pacing_wait_ms_in_gap': w, 'gap_minus_pacing_ms': g - w,
                         'vertex_brain_start_after_eos_ms': ms(fb), 'vertex_brain_first_data_ms': fb.get('first_ms', '') if fb else '',
                         'vertex_brain_thought_tokens': fb.get('thoughts', '') if fb else '',
                         'vertex_voice_start_after_eos_ms': ms(fv), 'vertex_voice_first_data_ms': fv.get('first_ms', '') if fv else ''})
    key = f'{st}@{RUN}'
    if not gaps: summ[key] = {'n': 0, 'fatal': fatal}; continue
    lo, hi = boot_median(gaps)
    adj = [g - w for g, w in zip(gaps, waits)]
    summ[key] = {'n': len(gaps), 'calls': len(calls) - len(fatal), 'p50': round(statistics.median(gaps)), 'p90': round(pct(gaps, 0.9)),
                'min': min(gaps), 'max': max(gaps), 'median_ci95': [round(lo), round(hi)],
                'turn_table_n': len(tgaps), 'turn_table_p50': round(statistics.median(tgaps)) if tgaps else None,
                'replies_paced': sum(1 for w in waits if w > 0), 'pacing_wait_p50_ms': round(statistics.median(waits)), 'pacing_wait_max_ms': max(waits),
                'p50_minus_pacing': round(statistics.median(adj)), 'p90_minus_pacing': round(pct(adj, 0.9)),
                'inr_per_min': round(cost / 1000 / (dur / 60), 2) if dur else None, 'cost_inr': round(cost / 1000, 2), 'talk_s': dur,
                'errors': errs, 'fatal': fatal, 'opening_clause_prefixed_calls': f"{sum(1 for c in calls if c.get('openingClausePrefixed'))}/{len(calls) - len(fatal)}", 'ai_said_calls': f'{sum(ai)}/{len(ai)}', 'ai_in_first_reply_calls': f'{sum(ai1)}/{len(ai1)}', 'end_reasons': ends}
with open(f'{OUT}/reply-gap.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ['stack']); w.writeheader(); w.writerows(rows)
json.dump(summ, open(f'{OUT}/summary.json', 'w'), indent=1)
for st, s in summ.items(): print(st, json.dumps(s))
if pace:
    ts = sorted(x['t'] for x in pace); g = [b - a for a, b in zip(ts, ts[1:])]
    print('vertex requests', len(pace), 'min spacing s', round(min(g), 3) if g else None, 'paced', sum(1 for x in pace if x['wait_ms'] > 0))
