# Remeasure analysis at 6b0d859 (2026-10-24). The reply-gap part is ./analyze.py's method unchanged (the runtime's own
# reply.latencyMs on the socket; median CI by bootstrap, 10,000 resamples, seed 20261024; stages from the runtime's
# timing joined by gap; pacer waits by kind), run on the shipped defaults only, against the e9fdde3 arms in
# ../reply-gap-summary.json. Added: the opening checks (verify_calls.py's fields, plus the brand), the opening's time to
# first audio and the Vertex requests before it, speculation / pre-warm as the runtime reports them, and barge-in
# (tools7/bargein.py events), with the runtime's own barge counts as a cross-check.
# Usage: python analyze7.py DATA_DIR OUT_DIR [RUN_OUTPUT_DIR]
#   env GAPF (default vps7-gap-{s}-r1-{s}-r1.jsonl) lets the gap part be checked on e9fdde3's files.
import csv, glob, json, math, os, random, re, statistics, sys
from collections import Counter, defaultdict
D, OUT = sys.argv[1], sys.argv[2]; RUNOUT = sys.argv[3] if len(sys.argv) > 3 else os.path.dirname(os.path.abspath(D))
HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = os.environ.get('VPS_VOICE', os.path.join(HERE, '..', '..', '..', '..', 'product', 'voice'))
sys.path.insert(0, VOICE)
STACKS = ['v2-flashlite', 'v2-mai', 'v2-54mini']
STAGES = ['ears', 'turn', 'brain', 'sentence', 'voice', 'hold', 'out']
MARKS = ['final', 'brain_req', 'brain_first', 'sentence', 'tts_req', 'tts_first', 'release', 'audio']
GAPF = os.environ.get('GAPF', 'vps7-gap-{s}-r1-{s}-r1.jsonl')
BRAND = {'name': 'Saanjh Services', 'spokenName': 'Saanjh Services'}       # the seed workspace's brand (agents take it)

def jl(p): return [json.loads(l) for l in open(p) if l.strip()] if os.path.exists(p) else []
def pct(xs, p):
    xs = sorted(xs); k = (len(xs) - 1) * p; f = int(k); c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)
def boot_median(xs, B=10000, seed=20261024):
    r = random.Random(seed); n = len(xs); ms = sorted(statistics.median(r.choices(xs, k=n)) for _ in range(B))
    return ms[int(0.025 * B)], ms[int(0.975 * B) - 1]
def med(xs): return round(statistics.median(xs)) if xs else None
def wilson(k, n, z=1.96):
    if not n: return None
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(100 * max(0, c - h), 1), round(100 * min(1, c + h), 1)]
def newest(pattern):
    fs = sorted(glob.glob(os.path.join(D, pattern)), key=os.path.getsize)
    return fs[-1] if fs else None

pacef = os.environ.get('PACEF') or newest('*vertex-pace.jsonl'); probef = os.environ.get('PROBEF') or newest('*probes.jsonl')
pace, cur = [], {}
for x in jl(pacef or ''):
    if 't' in x: x = dict(x); pace.append(x); cur[x['n']] = x
    elif x.get('n') in cur: cur[x['n']].update({k: v for k, v in x.items() if k != 'n'})
probes = jl(probef or '')
lags = {}
for x in probes:
    if x['k'] == 'lags': lags[x['cid']] = x['lags']

# brand respellings the runtime repaired, per call (run7.tmpl.sh prints them from the runtime journal)
respelled = Counter()
for f in glob.glob(os.path.join(RUNOUT, 'vps7-*.full.out')):
    for l in open(f, errors='replace'):
        m = re.match(r'\s*(\d+)\s+brand respelled ([0-9a-f]{8})', l)
        if m: respelled[m.group(2)] += int(m.group(1))

# ------------------------------------------------------------------------------------------------ reply gap
rows, summ, opens = [], {}, []
for st in STACKS:
    calls = jl(os.path.join(D, GAPF.format(s=st)))
    if not calls: continue
    S = summ.setdefault(st, {'calls': 0, 'gaps': [], 'waits': [], 'cost': 0, 'dur': 0, 'errors': [], 'fatal': [], 'lags': [], 'stages': defaultdict(list),
                             'marks': defaultdict(list), 'spec': 0, 'ends': [], 'rt_err': 0, 'undelivered': 0, 'held_behind': Counter(), 'held_n': Counter(),
                             'req': Counter(), 'brain_no_hdr': 0, 'specstats': Counter(), 'prewarm': Counter(), 'barge': Counter(), 'opening_s': [], 'opening_join_ms': []})
    for c in calls:
        if c.get('fatal'): S['fatal'].append(c['fatal']); continue
        S['calls'] += 1; S['cost'] += c.get('costInrMilli') or 0; S['dur'] += c.get('durationS') or 0; S['errors'] += c.get('errors') or []
        S['ends'].append(c.get('endReason')); S['rt_err'] += 1 if c.get('rtTimingError') else 0; S['undelivered'] += c.get('rtUndelivered') or 0
        cid = c['conversationId']; S['lags'] += lags.get(cid, [])
        tm = c.get('rtTiming') or {}
        for k, v in (tm.get('speculation') or {}).items():
            if isinstance(v, bool): S['specstats'][f'enabled={v}'] += 1
            elif isinstance(v, int): S['specstats'][k] += v
        for k, v in (tm.get('prewarm') or {}).items(): S['prewarm'][f'{k}={v}'] += 1
        for k, v in (tm.get('barge') or {}).items(): S['barge'][k] += v
        t_a = c.get('placedAt') or 0; t_b = t_a + (c.get('durationS') or 0) + 15
        nxt = min([d.get('placedAt') for d in calls if (d.get('placedAt') or 0) > t_a] or [t_b]); t_b = min(t_b, nxt - 0.001)
        for j, x in enumerate(pace):
            if not (t_a <= x['t'] <= t_b): continue
            S['req'][x['kind']] += 1
            if x['kind'] == 'brain' and 'hdr_ms' not in x: S['brain_no_hdr'] += 1
            if x['wait_ms'] > 0 and j > 0:
                S['held_behind'][f"{x['kind']} behind {pace[j - 1]['kind']}"] += x['wait_ms']; S['held_n'][f"{x['kind']} behind {pace[j - 1]['kind']}"] += 1
        # the opening: placed -> her first audio, and the Vertex requests that started before it
        po = c.get('placedToFirstReplyS')
        if po is not None:
            S['opening_s'].append(po); S['opening_join_ms'].append(c.get('openingAudioAfterJoinMs'))
            pre = [x for x in pace if t_a <= x['t'] <= t_a + po]
            ob = next((x for x in pre if x['kind'] == 'brain'), None)
        else: pre, ob = [], None
        txt = c.get('firstAgentTurn') or c.get('firstAgentCaption') or ''
        try:
            from vpvoice import names as NAMES
            _, wrong_brand = NAMES.repair_brand(txt, BRAND)
        except Exception as e: wrong_brand = [f'(not checked: {e!r})']
        opens.append({'stack': st, 'k': c['k'], 'conversationId': cid, 'firstAgentTurn': txt, 'disclosures': c.get('disclosuresInOpening'),
                      'disclosingGroup': c.get('disclosingGroup'), 'namesAddressed': c.get('namesAddressed'), 'wrongNames': c.get('wrongNames'),
                      'guidanceSpoken': c.get('guidanceSpoken'), 'blankName': c.get('blankName'),
                      'brandLatin': bool(re.search(r'saanjh', txt, re.I)), 'brandDevanagari': 'सांझ' in txt, 'brandAnyForm': bool(re.search(r'saanjh|सांझ|साँझ', txt, re.I)),
                      'brandMisspelledInText': wrong_brand, 'brandRepairsByRuntime': respelled.get(cid[:8], 0),
                      'placedToFirstAudioS': po, 'joinToFirstAudioMs': c.get('openingAudioAfterJoinMs'),
                      'vertexBeforeFirstAudio': dict(Counter(x['kind'] for x in pre)), 'openingBrainPacerWaitMs': ob['wait_ms'] if ob else None,
                      'turnsAgent': c.get('turnsAgent'), 'capsAgent': c.get('capsAgent'), 'agentCapsMissingFromTurns': c.get('agentCapsMissingFromTurns'),
                      'endReason': c.get('endReason'), 'durationS': c.get('durationS'), 'costInrMilli': c.get('costInrMilli'), 'errors': c.get('errors'),
                      'fallbacksUsed': c.get('fallbacksUsed'), 'combinationId': c.get('combinationId')})
        rt = {r['rid']: r for r in (tm.get('replies') or [])}
        i = 0
        for wall, g in c.get('replyWall') or []:
            if g is None: continue
            i += 1
            lo, hi = wall - g / 1000.0, wall
            inwin = [x for x in pace if lo <= x['t'] <= hi]
            wk = Counter()
            for x in inwin:
                if x['wait_ms'] > 0: wk[x['kind']] += x['wait_ms']
            w = sum(wk.values()); S['gaps'].append(g); S['waits'].append(w)
            cand = [r for r in rt.values() if r['gapMs'] == g and not r.get('_used')]
            r = cand[0] if cand else None
            if r: r['_used'] = True
            rows.append({'sha': '6b0d859', 'stack': st, 'call': c['k'], 'conversation_id': cid, 'reply': i, 'rid': r['rid'] if r else '', 'gap_ms': g,
                         'speculative': r.get('speculative') if r else '', **{f'{k}_ms': (r['stages'].get(k) if r else '') for k in STAGES},
                         **{f'at_{k}_ms': (r['at'].get(k) if r else '') for k in MARKS},
                         'vertex_requests_in_gap': len(inwin), 'pacing_wait_ms_in_gap': w, 'pacing_wait_by_kind': ';'.join(f'{k}:{v}' for k, v in sorted(wk.items())),
                         'gap_minus_pacing_ms': g - w})
            if r:
                if r.get('speculative'): S['spec'] += 1
                for k in STAGES:
                    if r['stages'].get(k) is not None: S['stages'][k].append(r['stages'][k])
                for k in MARKS:
                    if r['at'].get(k) is not None: S['marks'][k].append(r['at'][k])
out = {'gap': {}, 'openings': opens}
for st, S in summ.items():
    g = S['gaps']
    if not g: out['gap'][st] = {'n': 0, 'fatal': S['fatal']}; continue
    lo, hi = boot_median(g); adj = [a - b for a, b in zip(g, S['waits'])]
    out['gap'][st] = {'n': len(g), 'calls': S['calls'], 'p50': med(g), 'p90': round(pct(g, 0.9)), 'min': min(g), 'max': max(g), 'median_ci95': [round(lo), round(hi)],
                      'replies_paced': sum(1 for w in S['waits'] if w > 0), 'pacing_wait_max_ms': max(S['waits']), 'p50_minus_pacing': med(adj),
                      'speculative_replies': S['spec'], 'stage_n': len(S['stages']['ears']), 'stages_p50': {k: med(v) for k, v in S['stages'].items()},
                      'marks_p50_after_eos': {k: med(v) for k, v in S['marks'].items()},
                      'partial_lag': {'n': len(S['lags']), 'p50': med(S['lags']), 'p90': round(pct(S['lags'], 0.9)) if S['lags'] else None},
                      'inr_per_min': round(S['cost'] / 1000 / (S['dur'] / 60), 2) if S['dur'] else None, 'cost_inr': round(S['cost'] / 1000, 2), 'talk_s': S['dur'],
                      'vertex_requests': dict(S['req']), 'brain_cancelled_before_headers': S['brain_no_hdr'],
                      'pacer_wait_ms_by_who_waited_behind_whom': dict(S['held_behind']), 'pacer_waits_n': dict(S['held_n']),
                      'speculation_runtime': dict(S['specstats']), 'prewarm_runtime': dict(S['prewarm']), 'barge_runtime': dict(S['barge']),
                      'opening_placed_to_audio_s': sorted(S['opening_s']), 'opening_join_to_audio_ms': sorted(x for x in S['opening_join_ms'] if x is not None),
                      'errors': S['errors'], 'fatal': S['fatal'], 'end_reasons': dict(Counter(S['ends'])), 'rt_timing_errors': S['rt_err'], 'undelivered_events': S['undelivered']}

# ------------------------------------------------------------------------------------------------ barge-in
bev, bcalls = [], []
for st in STACKS:
    for f in sorted(glob.glob(os.path.join(D, f'vps7-barge-{st}-b*-{st}-b*.jsonl'))):
        for c in jl(f):
            if c.get('fatal'): bcalls.append({'stack': st, 'fatal': c['fatal']}); continue
            evs = c.get('events') or []
            sock = {'flushes': sum(len(r['flushAt']) for r in (c.get('replies') or {}).values())}
            bcalls.append({'stack': st, 'k': c['k'], 'conversationId': c['conversationId'], 'costInrMilli': c.get('costInrMilli'), 'durationS': c.get('durationS'),
                           'endReason': c.get('endReason'), 'errors': c.get('errors'), 'rtBarge': c.get('rtBarge'), 'socketFlushes': sock['flushes'],
                           'socketResumed': sum(1 for e in evs if e.get('resumed')), 'socketGaveWay': sum(1 for e in evs if e.get('gaveWay')),
                           'rtSpeculation': c.get('rtSpeculation'), 'rtPrewarm': c.get('rtPrewarm'), 'events': len(evs), 'skipped': sum(1 for e in evs if e.get('skipped'))})
            for e in evs: bev.append({'stack': st, 'k': c['k'], 'conversationId': c['conversationId'], **e})
def barge_stats(E):
    B = [e for e in E if e['kind'] == 'barge' and not e.get('skipped') and e.get('outcome') != 'ended_unstopped']; Nn = [e for e in E if e['kind'] == 'nod' and not e.get('skipped')]
    stopped = [e['flushMs'] for e in B if e.get('outcome') != 'missed' and e.get('flushMs') is not None]
    oc = Counter(e.get('outcome') for e in B); on = Counter(e.get('outcome') for e in Nn)
    fs = sum(1 for e in Nn if e.get('outcome') == 'false_stop'); paused = [e for e in Nn if e.get('outcome') in ('paused_resumed', 'false_stop', 'paused_other')]
    return {'barge_n': len(B), 'barge_skipped': sum(1 for e in E if e['kind'] == 'barge' and e.get('skipped')),
            'barge_ended_unstopped': sum(1 for e in E if e['kind'] == 'barge' and e.get('outcome') == 'ended_unstopped'),
            'stop_ms': {'n': len(stopped), 'p50': med(stopped), 'p90': round(pct(stopped, 0.9)) if stopped else None, 'min': min(stopped) if stopped else None,
                        'max': max(stopped) if stopped else None, 'median_ci95': [round(x) for x in boot_median(stopped)] if len(stopped) > 1 else None},
            'missed': oc.get('missed', 0), 'missed_ci95': wilson(oc.get('missed', 0), len(B)), 'barge_outcomes': dict(oc),
            'resumed_over_real_interruption': oc.get('stopped_resumed_over', 0) + oc.get('stopped_resumed_then_stopped', 0),
            'nod_n': len(Nn), 'nod_skipped': sum(1 for e in E if e['kind'] == 'nod' and e.get('skipped')), 'false_stops': fs, 'false_stop_ci95': wilson(fs, len(Nn)),
            'nod_outcomes': dict(on), 'paused_on_nod': len(paused), 'paused_on_nod_ci95': wilson(len(paused), len(Nn)),
            'nod_pause_ms': {'n': len([e for e in paused if e.get('pauseMs') is not None]), 'p50': med([e['pauseMs'] for e in paused if e.get('pauseMs') is not None])},
            'nod_by_clip': {c: dict(Counter(e.get('outcome') for e in Nn if e['clip'] == c)) for c in sorted({e['clip'] for e in Nn})}}
out['barge'] = {'all': barge_stats(bev), **{st: barge_stats([e for e in bev if e['stack'] == st]) for st in STACKS if any(e['stack'] == st for e in bev)}}
out['barge_calls'] = bcalls
alll = [x for c in [*(jl(os.path.join(D, GAPF.format(s=s))) for s in STACKS)] for x in c]
cids = {c.get('conversationId') for c in alll} | {c.get('conversationId') for c in bcalls}
pooled = [v for cid in cids if cid in lags for v in lags[cid]]
out['partial_lag_pooled'] = {'n': len(pooled), 'calls': sum(1 for cid in cids if cid in lags), 'p50': med(pooled), 'p25': round(pct(pooled, 0.25)) if pooled else None,
                             'p75': round(pct(pooled, 0.75)) if pooled else None, 'p90': round(pct(pooled, 0.9)) if pooled else None,
                             'share_over_500': round(sum(1 for v in pooled if v > 500) / len(pooled), 3) if pooled else None}
out['spend_inr'] = {'gap': round(sum(S['cost'] for S in summ.values()) / 1000, 2), 'barge': round(sum(c.get('costInrMilli') or 0 for c in bcalls) / 1000, 2)}
out['spend_inr']['total'] = round(out['spend_inr']['gap'] + out['spend_inr']['barge'], 2)
ts = sorted(x['t'] for x in pace); gg = [b - a for a, b in zip(ts, ts[1:])]
out['pace_log'] = {'file': os.path.basename(pacef) if pacef else None, 'starts': len(ts), 'min_spacing_s': round(min(gg), 3) if gg else None}
os.makedirs(OUT, exist_ok=True)
if rows:
    with open(f'{OUT}/remeasure-6b0d859.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
if bev:
    keys = ['stack', 'k', 'conversationId', 'i', 'kind', 'clip', 'speechS', 'onReply', 'rid', 'elapsedInReplyS', 'queuedS', 'leftAtMissedS', 'flushMs', 'flushes', 'resumed', 'pauseMs',
            'completed', 'gaveWay', 'lastFlushMs', 'outcome', 'skipped']
    with open(f'{OUT}/remeasure-6b0d859-barge.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=keys, extrasaction='ignore'); w.writeheader(); w.writerows(bev)
json.dump(out, open(f'{OUT}/remeasure-6b0d859-summary.json', 'w'), indent=1, ensure_ascii=False)
prev = json.load(open(os.path.join(HERE, '..', 'reply-gap-summary.json')))
print('== reply gap: 6b0d859 shipped defaults vs e9fdde3 A (defaults then) and B (speculation + prewarm off)')
for st, o in out['gap'].items():
    a, b = prev.get(f'{st}@r1', {}), prev.get(f'{st}@nf', {})
    print(f"{st}: {o.get('p50')} ({o.get('median_ci95')}) p90 {o.get('p90')} n {o.get('n')} ({o.get('calls')} calls) | A {a.get('p50')} {a.get('median_ci95')} p90 {a.get('p90')} n {a.get('n')} | B {b.get('p50')} {b.get('median_ci95')} p90 {b.get('p90')} n {b.get('n')}")
    print('   stages', o.get('stages_p50'), '| A', a.get('stages_p50', {}).get('brain'), 'B', b.get('stages_p50', {}).get('brain'), '(brain)')
    print('   vertex', o.get('vertex_requests'), 'cancelled', o.get('brain_cancelled_before_headers'), 'waits', o.get('pacer_waits_n'), o.get('pacer_wait_ms_by_who_waited_behind_whom'))
    print('   speculation', o.get('speculation_runtime'), 'prewarm', o.get('prewarm_runtime'), 'barge', o.get('barge_runtime'), 'opening s', o.get('opening_placed_to_audio_s'))
    print('   cost', o.get('cost_inr'), 'inr/min', o.get('inr_per_min'), 'ends', o.get('end_reasons'), 'errors', len(o.get('errors') or []), 'fatal', o.get('fatal'), 'rt err', o.get('rt_timing_errors'))
print('== openings')
for x in opens:
    print(json.dumps({k: x[k] for k in ('stack', 'k', 'disclosures', 'namesAddressed', 'wrongNames', 'guidanceSpoken', 'blankName', 'brandLatin', 'brandDevanagari',
                                        'brandMisspelledInText', 'brandRepairsByRuntime', 'placedToFirstAudioS', 'vertexBeforeFirstAudio', 'openingBrainPacerWaitMs')}, ensure_ascii=False))
print('== barge-in'); print(json.dumps(out['barge'], ensure_ascii=False, indent=None))
print('== barge calls'); [print(json.dumps({k: c.get(k) for k in ('stack', 'k', 'rtBarge', 'socketFlushes', 'socketResumed', 'socketGaveWay', 'events', 'skipped', 'costInrMilli', 'endReason', 'fatal')})) for c in bcalls]
print('== partial lag pooled', out['partial_lag_pooled']); print('== spend', out['spend_inr']); print('== pace', out['pace_log'])
