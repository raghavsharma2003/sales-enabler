#!/usr/bin/env python3
"""Analyse exported listener-panel answers (H6 verdict, H5 screen). Python 3.9+, standard library only.

Reads any mix of: session JSON files (one session or the coordinator's array), the page's CSV export, and text files
holding pasted answer codes (VPL1. / VPL1z.) from WhatsApp. Joins file codes to conditions from the l8 manifest, applies
the pre-registered exclusions, and reports preference with Wilson intervals per panel and condition pair, the
non-inferiority tests, and a verdict per region against the H6 kill criterion (protocol sections 6 and 7).

  python3 analysis.py answers/                       analyse everything under answers/ (field sessions only)
  python3 analysis.py answers/ --md report.md --out results.json --tidy trials.csv
  python3 analysis.py answers/ --p-correct-inference 0.7     enable the expected-value rule for Bhojpuri (protocol 6.6)
  python3 analysis.py --power [--sims 1000]          the sample-size simulation behind protocol section 5
  python3 analysis.py --selftest                     synthetic panels with known truth through the whole pipeline

Decision functions are shared by the real analysis, --power and --selftest, so the power table describes the rule
that will actually be applied.
"""
import argparse, base64, csv, gzip, io, json, math, os, random, re, statistics, struct, sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MANIFEST = os.path.normpath(os.path.join(HERE, '..', 'lanes', 'l8-azure-bench', 'stimuli', 'manifest.csv'))
SEED = 20261017

# ---- Pre-registered constants (protocol 6). Changing any of these after fielding starts invalidates the verdict. ----
SESOI_PREF = 0.58        # smallest preference worth acting on
NI_PATRONISING = 0.5     # 7-point scale; matched may be at most this much more patronising than neutral
NI_COMPREHENSION = 0.10  # proportion correct; matched may be at most 10 points worse
NI_NATURALNESS = 0.3     # 5-point ACR; matched may be at most 0.3 less natural (producibility at our quality bar)
SPEEDER_FRACTION = 0.4   # listener median answer time below 40% of the panel median -> excluded
CATCH_FAILS_TO_EXCLUDE = 2
MIN_LISTENERS = 24       # below this many analysed listeners no verdict is issued (design effect unreliable)
MATCHED = {'bihar': 'bhojpuri_mix', 'outgroup': 'bhojpuri_mix', 'tamilnadu': 'tamil_english', 'maharashtra': 'marathi_mix'}
NEUTRAL = 'neutral_hinglish'
PRIORITY = ['bhojpuri_mix', 'tamil_english', 'marathi_mix', 'indian_english', 'neutral_hinglish']   # target of a pair
REGION_PANELS = ['bihar', 'tamilnadu', 'maharashtra']
PANEL_ORDER = ['bihar', 'tamilnadu', 'maharashtra', 'outgroup']
ELIGIBLE = {
    'bihar': lambda s: s.get('mt') == 'bhojpuri' and s.get('home_lang') == 'bhojpuri' and s.get('home_state') in ('bihar', 'up'),
    'outgroup': lambda s: s.get('mt') in ('hindi', 'haryanvi') and s.get('home_lang') not in ('bhojpuri', 'maithili', 'magahi')
    and 'bhojpuri' not in (s.get('other_langs') or []) and s.get('home_state') in ('delhi', 'haryana', 'up', 'mp'),
    'tamilnadu': lambda s: s.get('mt') == 'tamil' and s.get('home_state') == 'tamilnadu',
    'maharashtra': lambda s: s.get('mt') == 'marathi' and s.get('home_state') == 'maharashtra',
}

# =====================================================================================================================
# Statistics (stdlib)
# =====================================================================================================================
NAN = float('nan')


def _betacf(a, b, x):
    qab, qap, qam = a + b, a + 1, a - 1
    c, d = 1.0, 1 - qab * x / qap
    d = 1 / (d if abs(d) > 1e-300 else 1e-300)
    h = d
    for m in range(1, 300):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1 + aa * d; d = 1 / (d if abs(d) > 1e-300 else 1e-300)
        c = 1 + aa / c if abs(1 + aa / c) > 1e-300 else 1e-300
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1 + aa * d; d = 1 / (d if abs(d) > 1e-300 else 1e-300)
        c = 1 + aa / c if abs(1 + aa / c) > 1e-300 else 1e-300
        de = d * c
        h *= de
        if abs(de - 1) < 1e-12:
            break
    return h


def betai(a, b, x):
    if x <= 0: return 0.0
    if x >= 1: return 1.0
    lb = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log(1 - x)
    if x < (a + 1) / (a + b + 2):
        return math.exp(lb) * _betacf(a, b, x) / a
    return 1 - math.exp(lb) * _betacf(b, a, 1 - x) / b


def t_cdf(t, df):
    if df <= 0 or math.isnan(t): return NAN
    x = df / (df + t * t)
    tail = 0.5 * betai(df / 2, 0.5, x)
    return 1 - tail if t > 0 else tail


def t_ppf(q, df):
    lo, hi = -50.0, 50.0
    for _ in range(100):
        mid = (lo + hi) / 2
        if t_cdf(mid, df) < q: lo = mid
        else: hi = mid
    return (lo + hi) / 2


def wilson(k, n, z=1.959964):
    """Wilson score interval. n may be fractional (an effective sample size)."""
    if not n or n <= 0: return (NAN, NAN)
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(max(0.0, p * (1 - p) / n + z * z / (4 * n * n))) / den
    return (max(0.0, centre - half), min(1.0, centre + half))


def cluster_prop(pairs):
    """pairs: [(successes, trials)] per listener. Ratio estimator with listener-cluster variance.
    Returns dict with p, se, deff, n_eff, Wilson (naive and design-effect adjusted), t-test vs 0.5."""
    pairs = [(y, m) for y, m in pairs if m > 0]
    n, Y, M = len(pairs), sum(y for y, _ in pairs), sum(m for _, m in pairs)
    out = {'listeners': n, 'k': Y, 'trials': M, 'p': NAN, 'se': NAN, 'deff': NAN, 'n_eff': NAN,
           'wilson': (NAN, NAN), 'wilson_adj': (NAN, NAN), 'p_one_sided_gt_half': NAN}
    if M == 0: return out
    p = Y / M
    out['p'] = p
    out['wilson'] = wilson(Y, M)
    if n < 2: return out
    var = n / (n - 1) * sum((y - p * m) ** 2 for y, m in pairs) / (M * M)
    srs = p * (1 - p) / M
    deff = max(1.0, var / srs) if srs > 0 else 1.0
    zt = t_ppf(0.975, n - 1)                       # t quantile: conservative for few listeners
    out.update(se=math.sqrt(var), deff=deff, n_eff=M / deff, wilson_adj=wilson(p * M / deff, M / deff, zt))
    se = math.sqrt(var) if var > 0 else math.sqrt(0.25 / M)
    out['p_one_sided_gt_half'] = 1 - t_cdf((p - 0.5) / se, n - 1)
    return out


def boot_prop(pairs, B, rng):
    pairs = [(y, m) for y, m in pairs if m > 0]
    if len(pairs) < 2 or B <= 0: return (NAN, NAN)
    n, est = len(pairs), []
    for _ in range(B):
        Y = M = 0
        for _ in range(n):
            y, m = pairs[rng.randrange(n)]
            Y += y; M += m
        est.append(Y / M)
    est.sort()
    return (est[int(0.025 * B)], est[min(B - 1, int(0.975 * B))])


def mean_ci(xs, level=0.95):
    xs = [x for x in xs if x is not None and not (isinstance(x, float) and math.isnan(x))]
    n = len(xs)
    if n == 0: return {'n': 0, 'mean': NAN, 'sd': NAN, 'ci': (NAN, NAN), 'lo1': NAN, 'hi1': NAN}
    m = sum(xs) / n
    if n < 2: return {'n': n, 'mean': m, 'sd': NAN, 'ci': (NAN, NAN), 'lo1': NAN, 'hi1': NAN}
    sd = statistics.stdev(xs)
    se = sd / math.sqrt(n)
    t2, t1 = t_ppf(1 - (1 - level) / 2, n - 1), t_ppf(level, n - 1)
    return {'n': n, 'mean': m, 'sd': sd, 'ci': (m - t2 * se, m + t2 * se), 'lo1': m - t1 * se, 'hi1': m + t1 * se,
            'se': se, 'df': n - 1}


def holm(pvals):
    """pvals: {name: p}. Returns {name: adjusted p}."""
    items = sorted((p, k) for k, p in pvals.items() if p is not None and not math.isnan(p))
    m, adj, running = len(items), {}, 0.0
    for i, (p, k) in enumerate(items):
        running = max(running, min(1.0, (m - i) * p))
        adj[k] = running
    return adj


# =====================================================================================================================
# Pre-registered decision rules (used by real data, --power and --selftest)
# =====================================================================================================================
def preference_verdict(cp):
    lo, hi = cp['wilson_adj']
    if math.isnan(cp['p']) or math.isnan(lo):
        return 'NO_DATA'
    if cp['listeners'] < MIN_LISTENERS:
        return 'TOO_FEW'
    if lo > 0.5 and cp['p'] >= SESOI_PREF:
        return 'PREFERRED'
    if hi < SESOI_PREF:
        return 'NOT_PREFERRED'
    return 'INCONCLUSIVE'


def ni_verdict(diffs, margin, higher_is_worse):
    """Non-inferiority on per-listener differences (matched - neutral), one-sided 95% bounds.
    higher_is_worse: True for 'patronising' (worse = larger), False for naturalness/comprehension (worse = smaller)."""
    s = mean_ci(diffs)
    if s['n'] < 2:
        return 'NO_DATA', s
    if s['n'] < MIN_LISTENERS:
        return 'TOO_FEW', s
    if higher_is_worse:
        if s['hi1'] < margin: return 'PASS', s
        if s['lo1'] > margin: return 'FAIL', s
    else:
        if s['lo1'] > -margin: return 'PASS', s
        if s['hi1'] < -margin: return 'FAIL', s
    return 'INCONCLUSIVE', s


# =====================================================================================================================
# Loading
# =====================================================================================================================
def fnv1a_utf16(s):
    data = s.encode('utf-16-le', 'surrogatepass')
    x = 0x811c9dc5
    for (u,) in struct.iter_unpack('<H', data):
        x ^= u
        x = (x * 0x01000193) & 0xffffffff
    return '%08x' % x


def canonical(s):
    """Must match canonical() in app.js: same keys, same order, compact JSON."""
    obj = {'session_id': s.get('session_id'), 'panel': s.get('panel'), 'pid': s.get('pid'), 'retest': s.get('retest'),
           'screen': s.get('screen'), 'check': s.get('check'), 'trials': s.get('trials'), 'open_text': s.get('open_text'),
           'finished_at': s.get('finished_at')}
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))


def decode_code(code):
    tag, body = code.split('.', 1)
    raw = base64.urlsafe_b64decode(body + '=' * (-len(body) % 4))
    if tag == 'VPL1z':
        raw = gzip.decompress(raw)
    return json.loads(raw.decode('utf-8'))


INT_FIELDS = {'pid_num', 'pos', 'nat', 'trust', 'patr', 'fit', 'cont', 'attn_row', 'attn', 'conf', 'plays', 'plays_a',
              'plays_b', 'stalls', 't_shown', 't_play', 't_end', 't_answer', 'after_resume'}


def sessions_from_csv(path):
    rows = list(csv.DictReader(open(path, encoding='utf-8-sig', newline='')))
    by = defaultdict(list)
    for r in rows:
        by[r['session_id']].append(r)
    out = []
    for sid, rs in by.items():
        r0 = rs[0]
        cv = lambda v: None if v == '' else int(v) if re.fullmatch(r'-?\d+', v or '') else v
        b = lambda v: v == 'true' or v == 'True'
        screen_keys = ['age', 'gender', 'home_state', 'home_district', 'cur_state', 'place', 'mt', 'home_lang', 'other_langs',
                       'edu', 'phone', 'device']
        screen = {k: r0.get(k, '') for k in screen_keys} if r0.get('age') else None
        if screen:
            screen['other_langs'] = [x for x in screen['other_langs'].split('|') if x]
        trials = []
        for r in rs:
            if not r.get('block'):
                continue
            t = {}
            for k in ['block', 'pos', 'kind', 'pair', 'clip', 'a', 'b', 'ch', 'turn', 'choice', 'q1', 'q2', 'nat', 'trust', 'patr',
                      'fit', 'cont', 'attn_row', 'attn', 'hai', 'conf', 'plays', 'plays_a', 'plays_b', 'stalls', 'after_resume',
                      't_shown', 't_play', 't_end', 't_answer']:
                v = r.get(k, '')
                if v == '':
                    continue
                t[k] = int(v) if k in INT_FIELDS and re.fullmatch(r'-?\d+', v) else v
            trials.append(t)
        out.append({'schema': 'vpl-answers/1', 'session_id': sid, 'panel': r0['panel'], 'pid': r0['pid'], 'pid_num': cv(r0.get('pid_num', '')),
                    'mode': r0['mode'], 'retest': b(r0.get('retest')), 'ui_lang': r0.get('ui_lang'), 'started_at': r0.get('started_at'),
                    'finished_at': r0.get('finished_at') or None, 'complete': b(r0.get('complete')), 'end_reason': r0.get('end_reason') or None,
                    'screen': screen, 'check': {'pass': b(r0.get('check_pass'))}, 'trials': trials, 'open_text': r0.get('open_text', ''),
                    'device_id': r0.get('device_id'), 'checksum': r0.get('checksum'), 'manifest_sha256': r0.get('manifest_sha256'),
                    '_source': 'csv'})
    return out


def load_inputs(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            for root, _, fs in os.walk(p):
                files += [os.path.join(root, f) for f in sorted(fs)]
        else:
            files.append(p)
    sessions, problems = [], []
    for f in files:
        try:
            if f.endswith('.json'):
                d = json.load(open(f, encoding='utf-8'))
                sessions += d if isinstance(d, list) else [d]
            elif f.endswith('.csv'):
                sessions += sessions_from_csv(f)
            else:
                txt = open(f, encoding='utf-8', errors='replace').read()
                for code in re.findall(r'VPL1z?\.[A-Za-z0-9_\-]+', txt):
                    try:
                        sessions.append(decode_code(code))
                    except Exception as e:  # truncated paste
                        problems.append(f'{os.path.basename(f)}: an answer code could not be decoded ({type(e).__name__}); ask for it again')
        except Exception as e:
            problems.append(f'{os.path.basename(f)}: unreadable ({type(e).__name__}: {e})')
    seen, uniq = set(), []
    for s in sessions:
        if not isinstance(s, dict) or s.get('schema') != 'vpl-answers/1':
            continue
        if s.get('session_id') in seen:
            continue
        seen.add(s.get('session_id'))
        uniq.append(s)
    return uniq, problems


def load_manifest(path, blockc=None):
    rows = {r['file_code']: r for r in csv.DictReader(open(path, encoding='utf-8'))}
    if blockc:
        for r in csv.DictReader(open(blockc, encoding='utf-8')):
            r.setdefault('condition', r.get('source', ''))
            rows[r['file_code']] = r
    return rows


# =====================================================================================================================
# Analysis
# =====================================================================================================================
def choice_side(c):
    if c in ('A1', 'A2'): return 'a', int(c[1])
    if c in ('B1', 'B2'): return 'b', int(c[1])
    if c == '0': return 'tie', 0
    return None, None


def classify_pair(ra, rb):
    """Return (contrast name, target is a?) for a pair of manifest rows."""
    if ra['voice'] == rb['voice'] and ra['condition'] != rb['condition']:
        ca, cb = ra['condition'], rb['condition']
        ta = PRIORITY.index(ca) < PRIORITY.index(cb)
        tgt, oth = (ca, cb) if ta else (cb, ca)
        return f'{tgt} vs {oth}', ta
    if ra['condition'] == rb['condition'] and ra['voice'] != rb['voice']:
        na, nb = 'native' in ra.get('voice_role', ''), 'native' in rb.get('voice_role', '')
        ta = na if na != nb else ra['voice'] < rb['voice']
        tgt, oth = (ra['voice'], rb['voice']) if ta else (rb['voice'], ra['voice'])
        return f'voice {short_voice(tgt)} vs {short_voice(oth)} ({ra["condition"]})', ta
    return 'mixed (not a planned contrast)', True


def short_voice(v):
    return v.split('-', 2)[-1].replace('Neural', '').replace(':DragonHDLatest', ' HD').replace(':DragonLatest', ' Dragon')


def migrant(scr):
    return bool(scr) and scr.get('cur_state') not in (None, '', scr.get('home_state'))


def prepare(sessions, man, include_pilot, include_test, manual_excl):
    """Split sessions, apply data-quality rules and pre-registered exclusions. Returns a dict of everything."""
    info = {'counts': Counter(), 'problems': [], 'flags': []}
    keep_modes = {'field', 'kiosk'} | ({'pilot'} if include_pilot else set()) | ({'test'} if include_test else set())
    main, retests = [], []
    for s in sessions:
        info['counts'][f'{s.get("panel")}|mode={s.get("mode")}'] += 1
        if s.get('mode') not in keep_modes:
            continue
        if s.get('end_reason', '') and str(s.get('end_reason')).startswith('screened_out'):
            info['counts'][f'{s["panel"]}|{s["end_reason"]}'] += 1
            continue
        if s.get('end_reason') == 'playback_check_failed':
            info['counts'][f'{s["panel"]}|playback_check_failed'] += 1
            continue
        if not s.get('complete'):
            info['counts'][f'{s["panel"]}|incomplete'] += 1
            continue
        if s.get('_source') != 'csv' and s.get('checksum'):
            if fnv1a_utf16(canonical(s)) != s['checksum']:
                info['flags'].append(f'{s["panel"]} {s["pid"]}: checksum mismatch (edited or corrupted); kept, review it')
        (retests if s.get('retest') else main).append(s)
    # duplicate pids: keep the earliest completed session
    by_pid = defaultdict(list)
    for s in main:
        by_pid[(s['panel'], s['pid'])].append(s)
    listeners = []
    for (panel, pid), ss in by_pid.items():
        ss.sort(key=lambda x: x.get('finished_at') or '')
        listeners.append(ss[0])
        for extra in ss[1:]:
            info['flags'].append(f'{panel} {pid}: duplicate completed session {extra["session_id"][:8]} ignored (first one kept)')
    dev = defaultdict(set)
    for s in listeners:
        if s.get('mode') != 'kiosk' and s.get('device_id'):
            dev[(s['panel'], s['device_id'])].add(s['pid'])
    for (panel, d), pids in dev.items():
        if len(pids) > 1:
            info['flags'].append(f'{panel}: pids {sorted(pids)} came from one device (shared phone or repeat); coordinator to review, not auto-excluded')
    # exclusions
    for s in listeners:
        reasons = []
        fails, present = 0, 0
        for t in s['trials']:
            if t.get('kind') == 'identical':
                present += 1; fails += t.get('choice') != '0'
            elif t.get('kind') == 'degraded':
                present += 1; fails += not (t.get('nat') is not None and int(t['nat']) <= 2)
            if t.get('attn_row') in (1, '1'):
                present += 1; fails += str(t.get('attn')) != '2'
        s['_catch'] = (fails, present)
        if fails >= CATCH_FAILS_TO_EXCLUDE:
            reasons.append(f'catch {fails}/{present} failed')
        if s.get('screen') and not ELIGIBLE[s['panel']](s['screen']):
            reasons.append('screening rule not met')
        if (s['panel'], s['pid']) in manual_excl:
            reasons.append('manual: ' + manual_excl[(s['panel'], s['pid'])])
        rts = [t['t_answer'] - t['t_end'] for t in s['trials'] if t.get('block') == 'B' and t.get('t_end') is not None and t.get('t_answer') is not None]
        s['_rt'] = statistics.median(rts) if rts else None
        s['_reasons'] = reasons
    for panel in PANEL_ORDER:
        ls = [s for s in listeners if s['panel'] == panel and s['_rt'] is not None]
        if not ls:
            continue
        med = statistics.median(s['_rt'] for s in ls)
        for s in ls:
            if s['_rt'] < SPEEDER_FRACTION * med:
                s['_reasons'].append(f'speeding (median {s["_rt"] / 1000:.1f}s vs panel {med / 1000:.1f}s)')
    # join manifest
    for s in listeners + retests:
        for t in s['trials']:
            for side in ('clip', 'a', 'b'):
                code = t.get(side)
                if code and code in man:
                    t['_' + side] = man[code]
                elif code and not str(code).startswith('catch_'):
                    info['problems'].append(f'{s["panel"]} {s["pid"]}: clip {code} not in manifest (wrong manifest version?)')
    for s in listeners:
        grp = '45+' if (s.get('screen') or {}).get('age') in ('45-59', '60+') else 'under 45'
        for t in s['trials']:
            t['_age'] = grp
    info['listeners'] = listeners
    info['analysed'] = [s for s in listeners if not s['_reasons']]
    info['retests'] = retests
    return info


def pref_table(analysed, B, rng, by=None):
    """Preference per (panel, contrast[, by]) with Wilson naive, Wilson adjusted for listener clustering and bootstrap."""
    cells = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0]))   # key -> pid -> [target, nontie, ties, clearly]
    for s in analysed:
        for t in s['trials']:
            if t.get('kind') != 'pair' or '_a' not in t or '_b' not in t:
                continue
            contrast, a_is_target = classify_pair(t['_a'], t['_b'])
            side, strength = choice_side(t.get('choice'))
            if side is None:
                continue
            extra = by(t) if by else None
            key = (s['panel'], contrast) + ((extra,) if by else ())
            c = cells[key][s['pid']]
            if side == 'tie':
                c[2] += 1
                continue
            hit = (side == 'a') == a_is_target
            c[0] += hit; c[1] += 1; c[3] += hit and strength == 2
    out = []
    for key, per in cells.items():
        pairs = [(v[0], v[1]) for v in per.values()]
        cp = cluster_prop(pairs)
        ties = sum(v[2] for v in per.values())
        split = cluster_prop([(v[0] + 0.5 * v[2], v[1] + v[2]) for v in per.values()])
        props = [v[0] / v[1] for v in per.values() if v[1]]
        row = {'panel': key[0], 'contrast': key[1], 'by': key[2] if by else 'all', **cp, 'ties': ties,
               'p_ties_split': split['p'], 'wilson_adj_ties_split': split['wilson_adj'],
               'clearly_share': (sum(v[3] for v in per.values()) / cp['k']) if cp['k'] else NAN,
               'listener_sd': statistics.stdev(props) if len(props) > 1 else NAN,
               'listeners_favouring_target': sum(p > 0.5 for p in props), 'listeners_favouring_other': sum(p < 0.5 for p in props)}
        row['boot'] = boot_prop(pairs, B, rng) if (B and not by) else (NAN, NAN)
        row['verdict'] = preference_verdict(cp)
        out.append(row)
    out.sort(key=lambda r: (PANEL_ORDER.index(r['panel']) if r['panel'] in PANEL_ORDER else 9, r['contrast'], str(r['by'])))
    return out


def rating_tables(analysed):
    """Per panel x condition means (listener-level) and comprehension; per-listener paired differences."""
    per = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))  # panel -> pid -> (cond, measure) -> values
    for s in analysed:
        for t in s['trials']:
            if t.get('kind') != 'rate' or '_clip' not in t:
                continue
            cond = t['_clip']['condition']
            d = per[s['panel']][s['pid']]
            for m in ('nat', 'trust', 'patr', 'fit', 'cont'):
                if t.get(m) is not None:
                    d[(cond, m)].append(int(t[m]))
            if not t.get('after_resume'):
                for q in ('q1', 'q2'):
                    if t.get(q):
                        d[(cond, 'comp')].append(1 if t[q] == 'a' else 0)
    means, diffs = [], {}
    for panel, pids in per.items():
        conds = sorted({c for d in pids.values() for (c, _) in d}, key=lambda c: PRIORITY.index(c) if c in PRIORITY else 9)
        for c in conds:
            row = {'panel': panel, 'condition': c}
            for m in ('nat', 'trust', 'patr', 'fit', 'cont'):
                row[m] = mean_ci([statistics.mean(d[(c, m)]) for d in pids.values() if d.get((c, m))])
            comp_pairs = [(sum(d[(c, 'comp')]), len(d[(c, 'comp')])) for d in pids.values() if d.get((c, 'comp'))]
            row['comp'] = cluster_prop(comp_pairs)
            means.append(row)
        for tgt in conds:
            for oth in conds:
                if PRIORITY.index(tgt) >= PRIORITY.index(oth):
                    continue
                key = (panel, tgt, oth)
                diffs[key] = {}
                for m in ('nat', 'trust', 'patr', 'fit', 'cont', 'comp'):
                    diffs[key][m] = [statistics.mean(d[(tgt, m)]) - statistics.mean(d[(oth, m)])
                                     for d in pids.values() if d.get((tgt, m)) and d.get((oth, m))]
    means.sort(key=lambda r: (PANEL_ORDER.index(r['panel']), PRIORITY.index(r['condition']) if r['condition'] in PRIORITY else 9))
    return means, diffs


def rm_corr(analysed, xk, yk, panels=None):
    """Repeated-measures correlation (within-listener centred Pearson), Block B rated clips."""
    xs, ys, L = [], [], 0
    for s in analysed:
        if panels and s['panel'] not in panels:
            continue
        pts = [(int(t[xk]), int(t[yk])) for t in s['trials'] if t.get('kind') == 'rate' and t.get(xk) is not None and t.get(yk) is not None]
        if len(pts) < 2:
            continue
        L += 1
        mx, my = statistics.mean(p[0] for p in pts), statistics.mean(p[1] for p in pts)
        xs += [p[0] - mx for p in pts]; ys += [p[1] - my for p in pts]
    N, df = len(xs), len(xs) - L - 1
    sxx, syy, sxy = sum(x * x for x in xs), sum(y * y for y in ys), sum(x * y for x, y in zip(xs, ys))
    if df < 3 or sxx == 0 or syy == 0:
        return {'r': NAN, 'ci': (NAN, NAN), 'df': df, 'listeners': L}
    r = sxy / math.sqrt(sxx * syy)
    z, se = math.atanh(max(-0.999999, min(0.999999, r))), 1 / math.sqrt(df - 1)
    return {'r': r, 'ci': (math.tanh(z - 1.96 * se), math.tanh(z + 1.96 * se)), 'df': df, 'listeners': L}


def blockc_stats(analysed, B, rng):
    res = {}
    for panel in PANEL_ORDER:
        ls = [s for s in analysed if s['panel'] == panel]
        trials = [(s['pid'], t) for s in ls for t in s['trials'] if t.get('kind') == 'human_or_ai' and '_clip' in t]
        if not trials:
            continue
        score = lambda t: (1 if t.get('hai') == 'computer' else -1) * int(t.get('conf') or 1)
        def auc(items):
            tts = [score(t) for _, t in items if t['_clip'].get('source') == 'tts']
            hum = [score(t) for _, t in items if t['_clip'].get('source') == 'human']
            if not tts or not hum: return NAN
            return sum((a > b) + 0.5 * (a == b) for a in tts for b in hum) / (len(tts) * len(hum))
        by_pid = defaultdict(list)
        for pid, t in trials:
            by_pid[pid].append((pid, t))
        pids = list(by_pid)
        boots = []
        for _ in range(min(B, 2000)):
            items = [x for _ in pids for x in by_pid[pids[rng.randrange(len(pids))]]]
            a = auc(items)
            if not math.isnan(a): boots.append(a)
        boots.sort()
        tts = [t for _, t in trials if t['_clip'].get('source') == 'tts']
        hum = [t for _, t in trials if t['_clip'].get('source') == 'human']
        cont_gap = []
        for pid, items in by_pid.items():
            c = [int(t['cont']) for _, t in items if t.get('hai') == 'computer' and t.get('cont') is not None]
            h_ = [int(t['cont']) for _, t in items if t.get('hai') == 'human' and t.get('cont') is not None]
            if c and h_: cont_gap.append(statistics.mean(c) - statistics.mean(h_))
        res[panel] = {'auc': auc(trials), 'auc_ci': (boots[int(0.025 * len(boots))], boots[int(0.975 * len(boots)) - 1]) if boots else (NAN, NAN),
                      'tts_judged_computer': cluster_prop([(sum(t.get('hai') == 'computer' for _, t in by_pid[p] if t['_clip'].get('source') == 'tts'),
                                                            sum(1 for _, t in by_pid[p] if t['_clip'].get('source') == 'tts')) for p in pids]),
                      'nat_tts': mean_ci([int(t['nat']) for t in tts if t.get('nat')]), 'nat_human': mean_ci([int(t['nat']) for t in hum if t.get('nat')]),
                      'cont_tts': mean_ci([int(t['cont']) for t in tts if t.get('cont')]), 'cont_human': mean_ci([int(t['cont']) for t in hum if t.get('cont')]),
                      'cont_judged_computer_minus_human': mean_ci(cont_gap)}
    return res


def retest_stats(info):
    orig = {(s['panel'], s['pid']): s for s in info['listeners']}
    agree = defaultdict(lambda: [0, 0, 0, 0])   # panel -> [direction agree, direction n, exact agree, exact n]
    for r in info['retests']:
        o = orig.get((r['panel'], r['pid']))
        if not o:
            continue
        first = {t['pair']: t.get('choice') for t in o['trials'] if t.get('kind') == 'pair'}
        for t in r['trials']:
            if t.get('kind') != 'pair' or t['pair'] not in first:
                continue
            c1, c2 = first[t['pair']], t.get('choice')
            a = agree[r['panel']]
            a[2] += c1 == c2; a[3] += 1
            s1, s2 = choice_side(c1)[0], choice_side(c2)[0]
            if s1 in ('a', 'b') and s2 in ('a', 'b'):
                a[0] += s1 == s2; a[1] += 1
    return {p: {'direction': (v[0], v[1], wilson(v[0], v[1])), 'exact': (v[2], v[3], wilson(v[2], v[3]))} for p, v in agree.items()}


def composition(listeners):
    rows = {}
    for panel in PANEL_ORDER:
        ls = [s for s in listeners if s['panel'] == panel and s.get('screen')]
        if not ls:
            continue
        n = len(ls)
        share = lambda f: sum(1 for s in ls if f(s['screen'])) / n
        rows[panel] = {
            'n': n,
            'age': dict(Counter(s['screen'].get('age') for s in ls)),
            'women': share(lambda x: x.get('gender') == 'woman'),
            'village_or_town': share(lambda x: x.get('place') in ('village', 'town')),
            'below_graduation': share(lambda x: x.get('edu') in ('lt10', '10-12')),
            'migrant': share(lambda x: x.get('cur_state') not in (None, '', x.get('home_state'))),
            'age_45_plus': share(lambda x: x.get('age') in ('45-59', '60+')),
            'age_60_plus': share(lambda x: x.get('age') == '60+'),
            'device': dict(Counter(s['screen'].get('device') for s in ls)),
        }
        q = rows[panel]
        q['quota_misses'] = [name for name, ok in [('women >= 40%', q['women'] >= 0.40), ('village/town >= 35%', q['village_or_town'] >= 0.35),
                                                   ('below graduation >= 30%', q['below_graduation'] >= 0.30), ('migrants >= 20%', q['migrant'] >= 0.20),
                                                   ('age 45+ >= 33%', q['age_45_plus'] >= 0.33)] if not ok]
    return rows


def region_verdicts(prefs, diffs, p_inference):
    """H6 verdict per region (protocol 6.6) plus the out-group cost and the Holm-adjusted confirmatory family."""
    primary = {r['panel']: r for r in prefs if r['by'] == 'all' and r['contrast'] == f'{MATCHED[r["panel"]]} vs {NEUTRAL}'}
    out, pvals = {}, {}
    og = primary.get('outgroup')
    og_trust = diffs.get(('outgroup', MATCHED['outgroup'], NEUTRAL), {}).get('trust', [])
    og_t = mean_ci(og_trust)
    if og_t['n'] >= 2 and og_t.get('se'):
        pvals['P4 out-group trust cost'] = t_cdf(og_t['mean'] / og_t['se'], og_t['df'])   # H1: matched < neutral
    patr_ps = []
    for panel in REGION_PANELS:
        pr = primary.get(panel)
        d = diffs.get((panel, MATCHED[panel], NEUTRAL), {})
        patr_v, patr_s = ni_verdict(d.get('patr', []), NI_PATRONISING, True)
        comp_v, comp_s = ni_verdict(d.get('comp', []), NI_COMPREHENSION, False)
        nat_v, nat_s = ni_verdict(d.get('nat', []), NI_NATURALNESS, False)
        pref_v = pr['verdict'] if pr else 'NO_DATA'
        if patr_s['n'] >= 2 and patr_s.get('se'):
            p_ni = t_cdf((patr_s['mean'] - NI_PATRONISING) / patr_s['se'], patr_s['df'])
            if panel in ('bihar', 'tamilnadu'):
                patr_ps.append(p_ni)
        if pr and panel in ('bihar', 'tamilnadu'):
            pvals[{'bihar': 'P1 Bihar preference', 'tamilnadu': 'P2 Tamil Nadu preference'}[panel]] = pr['p_one_sided_gt_half']
        if pref_v == 'NO_DATA':
            verdict, why = 'NO DATA', 'no analysed listeners for this panel'
        elif 'TOO_FEW' in (pref_v, patr_v, comp_v, nat_v):
            verdict, why = 'INCONCLUSIVE', f'fewer than {MIN_LISTENERS} analysed listeners: no verdict is issued (pilot-sized data)'
        elif pref_v == 'NOT_PREFERRED':
            verdict, why = 'KILL', f'not preferred: upper bound of preference < {SESOI_PREF}'
        elif nat_v == 'FAIL' or comp_v == 'FAIL':
            verdict, why = 'KILL', 'not producible at the quality bar: matched register clearly less natural or less understood'
        elif patr_v == 'FAIL':
            verdict, why = 'KILL', 'patronising: matched register clearly rated more patronising than neutral'
        elif pref_v == 'PREFERRED' and patr_v == 'PASS' and comp_v == 'PASS' and nat_v == 'PASS':
            verdict = 'ADOPT'
            if panel == 'bihar':
                if p_inference is None or not og:
                    why = 'adopt on customer opt-in only (region-inference accuracy not supplied or out-group not run)'
                else:
                    gain = 2 * pr['p'] - 1
                    loss = max(0.0, 1 - 2 * og['p'])
                    ev = p_inference * gain - (1 - p_inference) * loss
                    why = (f'EV = {p_inference:.2f} x {gain:.2f} - {1 - p_inference:.2f} x {loss:.2f} = {ev:.3f}; '
                           + ('adopt with inferred region' if ev > 0 else 'EV <= 0: adopt on customer opt-in only'))
            else:
                why = "adopt when the customer's language is known (CRM field, customer choice or first-turn language ID)"
        else:
            parts = [n for n, v in [('preference', pref_v), ('patronising', patr_v), ('comprehension', comp_v), ('naturalness', nat_v)]
                     if v not in ('PASS', 'PREFERRED')]
            verdict, why = 'INCONCLUSIVE', 'under-powered or mixed on: ' + ', '.join(parts) + ' (not evidence of no effect)'
        out[panel] = {'verdict': verdict, 'why': why, 'preference': pref_v, 'patronising': patr_v, 'comprehension': comp_v,
                      'naturalness': nat_v, 'pref_row': pr, 'patr': patr_s, 'comp': comp_s, 'nat': nat_s}
    if patr_ps:
        pvals['P3 patronising non-inferiority (Bihar and Tamil Nadu)'] = max(patr_ps)   # must hold in both: intersection-union
    adj = holm(pvals)
    for panel, key in (('bihar', 'P1 Bihar preference'), ('tamilnadu', 'P2 Tamil Nadu preference')):
        if out.get(panel, {}).get('verdict') == 'ADOPT' and adj.get(key, 1) >= 0.05:
            out[panel]['why'] += '; NOTE: not robust to Holm correction across P1-P4'
    out['outgroup'] = {'preference_for_bhojpuri': og, 'trust_cost': og_t}
    return out, pvals, adj


# =====================================================================================================================
# Reporting
# =====================================================================================================================
def f2(x, d=2):
    return '-' if x is None or (isinstance(x, float) and math.isnan(x)) else f'{x:.{d}f}'


def iv(t, d=2):
    return f'[{f2(t[0], d)}, {f2(t[1], d)}]'


def report(info, prefs, prefs_ch, prefs_turn, means, diffs, verdicts, pvals, adj, h5, bc, rt, comp, args):
    L = []
    w = L.append
    an, ls = info['analysed'], info['listeners']
    w('# Listener panel results (H6 verdict, H5 screen)\n')
    w(f'Analysed {len(an)} of {len(ls)} completed listeners. Modes included: field, kiosk'
      + (', pilot' if args.include_pilot else '') + (', test' if args.include_test else '') + '. '
      + 'This panel is a screen of stated preference, not an outcome test (protocol 1).\n')
    w('## H6 verdict per region\n')
    w('| region | verdict | preference | patronising | comprehension | naturalness | reason |')
    w('|---|---|---|---|---|---|---|')
    for panel in REGION_PANELS:
        v = verdicts.get(panel)
        if v:
            w(f'| {panel} | **{v["verdict"]}** | {v["preference"]} | {v["patronising"]} | {v["comprehension"]} | {v["naturalness"]} | {v["why"]} |')
    kills = [p for p in REGION_PANELS if verdicts.get(p, {}).get('verdict') == 'KILL']
    adopts = [p for p in REGION_PANELS if verdicts.get(p, {}).get('verdict') == 'ADOPT']
    w('')
    if len(kills) == len(REGION_PANELS):
        w('**H6 kill criterion met in every region:** listeners do not prefer matched registers, or we cannot produce them at our quality bar.')
    else:
        dial = verdicts.get('bihar', {}).get('verdict', 'NO DATA')
        w(f'**Dialect matching (Bhojpuri, the H6 dialect test): {dial}.** '
          f'**Language matching:** Tamil Nadu {verdicts.get("tamilnadu", {}).get("verdict", "NO DATA")}, '
          f'Maharashtra {verdicts.get("maharashtra", {}).get("verdict", "NO DATA")}. '
          + (f'Kill criterion met for: {", ".join(kills)}. ' if kills else '')
          + (f'Supported for: {", ".join(adopts)}.' if adopts else ''))
    w('\nDecision rule: PREFERRED needs the clustering-adjusted Wilson lower bound > 0.50 and a point estimate >= '
      f'{SESOI_PREF}; NOT_PREFERRED (kill) needs the upper bound < {SESOI_PREF}; no verdict below {MIN_LISTENERS} analysed listeners. Non-inferiority margins: patronising '
      f'{NI_PATRONISING} (7-pt), comprehension {NI_COMPREHENSION:.0%}, naturalness {NI_NATURALNESS} (5-pt ACR), one-sided 95%.\n')
    og = verdicts.get('outgroup', {})
    if og.get('preference_for_bhojpuri') or og.get('trust_cost', {}).get('n'):
        p = og.get('preference_for_bhojpuri') or {}
        tc = og.get('trust_cost', {})
        w(f'**Out-group cost (P4):** non-Bhojpuri Hindi listeners chose the Bhojpuri mix in {f2(p.get("p", NAN))} of non-tie pairs '
          f'{iv(p.get("wilson_adj", (NAN, NAN)))}; trust difference (Bhojpuri - neutral) {f2(tc.get("mean", NAN))} {iv(tc.get("ci", (NAN, NAN)))} '
          f'on a 7-point scale, n = {tc.get("n", 0)}.\n')
    if pvals:
        w('**Confirmatory family, Holm-adjusted (one-sided):** ' + '; '.join(f'{k}: p = {f2(v, 4)}, adjusted {f2(adj.get(k, NAN), 4)}' for k, v in pvals.items()) + '\n')

    w('## Preference by panel and condition pair (Block A)\n')
    w('Target = the first-named condition. Ties ("no difference") are dropped from p; the ties-split column counts each as half.\n')
    w('| panel | pair | listeners | target / non-tie | ties | p | Wilson 95% | Wilson 95% adj. (DEFF) | bootstrap 95% | ties split | "clearly" | verdict |')
    w('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for r in prefs:
        w(f'| {r["panel"]} | {r["contrast"]} | {r["listeners"]} | {r["k"]} / {r["trials"]} | {r["ties"]} | {f2(r["p"])} | {iv(r["wilson"])} | '
          f'{iv(r["wilson_adj"])} ({f2(r["deff"], 1)}) | {iv(r["boot"])} | {f2(r["p_ties_split"])} | {f2(r["clearly_share"])} | {r["verdict"]} |')
    w('\nListener heterogeneity (SD of per-listener preference; listeners favouring target / other):')
    for r in prefs:
        w(f'- {r["panel"]}, {r["contrast"]}: SD {f2(r["listener_sd"])}; {r["listeners_favouring_target"]} / {r["listeners_favouring_other"]}')
    w('\n### By channel (sensitivity, protocol 3.4)\n')
    w('| panel | pair | channel | target / non-tie | p | Wilson 95% adj. |')
    w('|---|---|---|---|---|---|')
    for r in prefs_ch:
        w(f'| {r["panel"]} | {r["contrast"]} | {r["by"]} | {r["k"]} / {r["trials"]} | {f2(r["p"])} | {iv(r["wilson_adj"])} |')
    w('\n### By turn (does any script reverse the direction?)\n')
    w('| panel | pair | turn | target / non-tie | p | Wilson 95% adj. |')
    w('|---|---|---|---|---|---|')
    for r in prefs_turn:
        w(f'| {r["panel"]} | {r["contrast"]} | {r["by"]} | {r["k"]} / {r["trials"]} | {f2(r["p"])} | {iv(r["wilson_adj"])} |')

    w('\n## Ratings and comprehension by condition (Block B, first hearing)\n')
    w('Means of listener means with 95% t intervals. Comprehension is the share of 4-option questions answered correctly.\n')
    w('| panel | condition | naturalness (1-5) | trust (1-7) | patronising (1-7) | accent fit (1-7) | continue (1-5) | comprehension | comp. Wilson adj. |')
    w('|---|---|---|---|---|---|---|---|---|')
    for r in means:
        cell = lambda m: f'{f2(r[m]["mean"])} {iv(r[m]["ci"])}'
        w(f'| {r["panel"]} | {r["condition"]} | {cell("nat")} | {cell("trust")} | {cell("patr")} | {cell("fit")} | {cell("cont")} | '
          f'{f2(r["comp"]["p"])} | {iv(r["comp"]["wilson_adj"])} |')
    w('\n### Within-listener differences (first condition - second)\n')
    w('| panel | pair | measure | n | mean diff | 95% CI | one-sided 95% bound used |')
    w('|---|---|---|---|---|---|---|')
    for (panel, tgt, oth), d in sorted(diffs.items(), key=lambda kv: PANEL_ORDER.index(kv[0][0])):
        for m in ('nat', 'trust', 'patr', 'fit', 'cont', 'comp'):
            s = mean_ci(d[m])
            if s['n'] == 0: continue
            bound = f'upper {f2(s["hi1"])}' if m == 'patr' else f'lower {f2(s["lo1"])}'
            w(f'| {panel} | {tgt} - {oth} | {m} | {s["n"]} | {f2(s["mean"])} | {iv(s["ci"])} | {bound} |')

    w('\n## H5 screen (not an outcome test)\n')
    for panel in PANEL_ORDER + [None]:
        r = rm_corr(an, 'nat', 'cont', [panel] if panel else None)
        if r['listeners']:
            w(f'- {panel or "all panels"}: within-listener correlation naturalness -> would continue r = {f2(r["r"])} {iv(r["ci"])}, '
              f'{r["listeners"]} listeners, df {r["df"]}')
    r = rm_corr(an, 'trust', 'cont')
    if r['listeners']:
        w(f'- all panels: within-listener correlation trust -> would continue r = {f2(r["r"])} {iv(r["ci"])}')
    if bc:
        for panel, b in bc.items():
            w(f'- {panel} Block C: AUC (computer vs human) {f2(b["auc"])} {iv(b["auc_ci"])} (0.5 = listeners could not tell); '
              f'TTS judged "computer" {f2(b["tts_judged_computer"]["p"])} {iv(b["tts_judged_computer"]["wilson_adj"])}; '
              f'naturalness TTS {f2(b["nat_tts"]["mean"])} vs human {f2(b["nat_human"]["mean"])}; continue TTS {f2(b["cont_tts"]["mean"])} vs human '
              f'{f2(b["cont_human"]["mean"])}; continue when judged computer minus judged human, within listener: '
              f'{f2(b["cont_judged_computer_minus_human"]["mean"])} {iv(b["cont_judged_computer_minus_human"]["ci"])}')
    else:
        w('- Block C (human or computer) was not run: no human reference recordings yet (protocol 3.6). The AUC and the '
          'human headroom (S5) cannot be computed.')

    w('\n## Data quality and exclusions\n')
    for k, v in sorted(info['counts'].items()):
        w(f'- {k}: {v}')
    ex = Counter(r for s in ls for r in s['_reasons'])
    w(f'- completed listeners: {len(ls)}; analysed: {len(an)}; excluded: {len(ls) - len(an)} ' + (f'({dict(ex)})' if ex else ''))
    cp = Counter(); cn = Counter()
    for s in ls:
        for t in s['trials']:
            if t.get('kind') == 'identical':
                cn['identical pair'] += 1; cp['identical pair'] += t.get('choice') == '0'
            elif t.get('kind') == 'degraded':
                cn['degraded clip'] += 1; cp['degraded clip'] += t.get('nat') is not None and int(t['nat']) <= 2
            if t.get('attn_row') in (1, '1'):
                cn['instructed row'] += 1; cp['instructed row'] += str(t.get('attn')) == '2'
    for k in cn:
        w(f'- catch "{k}" passed {cp[k]}/{cn[k]} ({f2(cp[k] / cn[k])})')
    stalls = sum(t.get('stalls', 0) or 0 for s in ls for t in s['trials'])
    w(f'- audio stalls recorded: {stalls}; cards re-shown after a resume: {sum(1 for s in ls for t in s["trials"] if t.get("after_resume"))}; '
      f'coordinator-assisted sessions: {sum(1 for s in ls if s.get("assisted"))}')
    for f in info['flags'] + info['problems']:
        w(f'- FLAG: {f}')
    if rt:
        w('\n### Test-retest (Block A repeated about a week later)\n')
        for panel, r in rt.items():
            w(f'- {panel}: same direction {r["direction"][0]}/{r["direction"][1]} {iv(r["direction"][2])}; identical answer {r["exact"][0]}/{r["exact"][1]} {iv(r["exact"][2])}')
    w('\n## Composition against the soft quotas (protocol 2.3)\n')
    w('| panel | n | women | village/town | below graduation | migrants | 45+ | 60+ | quota misses |')
    w('|---|---|---|---|---|---|---|---|---|')
    for panel, q in comp.items():
        w(f'| {panel} | {q["n"]} | {f2(q["women"])} | {f2(q["village_or_town"])} | {f2(q["below_graduation"])} | {f2(q["migrant"])} | '
          f'{f2(q["age_45_plus"])} | {f2(q["age_60_plus"])} | {", ".join(q["quota_misses"]) or "none"} |')
    return '\n'.join(L) + '\n'


def age_section(prefs_age, age_means):
    L = ['\n## Exploratory: older listeners (wedge priority, SYNTHESIS section 8 item 8)\n',
         'Not confirmatory. Insurance-renewal customers skew older, so comprehension and trust at 45+ matter most for the wedge.\n',
         '| panel | pair | age | target / non-tie | p | Wilson 95% adj. |', '|---|---|---|---|---|---|']
    for r in prefs_age:
        L.append(f'| {r["panel"]} | {r["contrast"]} | {r["by"]} | {r["k"]} / {r["trials"]} | {f2(r["p"])} | {iv(r["wilson_adj"])} |')
    L += ['', '| panel | condition | age | trust (1-7) | comprehension | comp. Wilson adj. |', '|---|---|---|---|---|---|']
    for g, rows in age_means.items():
        for r in rows:
            L.append(f'| {r["panel"]} | {r["condition"]} | {g} | {f2(r["trust"]["mean"])} {iv(r["trust"]["ci"])} | {f2(r["comp"]["p"])} | {iv(r["comp"]["wilson_adj"])} |')
    return '\n'.join(L) + '\n'


def tidy_rows(info):
    for s in info['listeners']:
        scr = s.get('screen') or {}
        base = {'panel': s['panel'], 'pid': s['pid'], 'session_id': s['session_id'], 'excluded': int(bool(s['_reasons'])),
                'exclusion_reason': '; '.join(s['_reasons']), 'age': scr.get('age'), 'gender': scr.get('gender'), 'place': scr.get('place'),
                'edu': scr.get('edu'), 'migrant': int(migrant(scr)), 'device': scr.get('device'), 'ui_lang': s.get('ui_lang')}
        for t in s['trials']:
            r = dict(base, block=t.get('block'), pos=t.get('pos'), kind=t.get('kind'), turn=t.get('turn'), channel=t.get('ch'))
            if t.get('kind') == 'pair' and '_a' in t and '_b' in t:
                contrast, a_t = classify_pair(t['_a'], t['_b'])
                side, strength = choice_side(t.get('choice'))
                r.update(contrast=contrast, item=f'{t.get("turn")}|{t["_a"]["voice"]}', choice=t.get('choice'),
                         chosen_target='' if side in (None, 'tie') else int((side == 'a') == a_t), strength=strength,
                         clip_a=t['a'], cond_a=t['_a']['condition'], voice_a=t['_a']['voice'],
                         clip_b=t['b'], cond_b=t['_b']['condition'], voice_b=t['_b']['voice'])
            elif t.get('kind') == 'identical':
                r.update(choice=t.get('choice'), clip_a=t.get('a'), clip_b=t.get('b'))
            else:
                c = t.get('_clip', {})
                r.update(clip=t.get('clip'), condition=c.get('condition', 'degraded' if t.get('kind') == 'degraded' else ''),
                         voice=c.get('voice', ''), item=f'{t.get("turn")}|{c.get("voice", "")}',
                         nat=t.get('nat'), trust=t.get('trust'), patr=t.get('patr'), fit=t.get('fit'), cont=t.get('cont'),
                         q1_ok='' if not t.get('q1') else int(t['q1'] == 'a'), q2_ok='' if not t.get('q2') else int(t['q2'] == 'a'),
                         attn=t.get('attn'), hai=t.get('hai'), conf=t.get('conf'), after_resume=t.get('after_resume', 0))
            if t.get('t_answer') is not None and t.get('t_end') is not None:
                r['answer_ms'] = t['t_answer'] - t['t_end']
            yield r


def quality_only(sessions, man, args):
    """The one interim look: data quality without effects, so it cannot tempt anyone to stop early."""
    manual = {}
    if args.exclusions:
        for r in csv.DictReader(open(args.exclusions, encoding='utf-8')):
            manual[(r['panel'], r['pid'].upper())] = r.get('reason', 'manual')
    info = prepare(sessions, man, args.include_pilot, args.include_test, manual)
    print('# Interim data-quality look (no effect estimates by design)\n')
    for k, v in sorted(info['counts'].items()):
        print(f'- {k}: {v}')
    for panel in PANEL_ORDER:
        ls = [s for s in info['listeners'] if s['panel'] == panel]
        if not ls:
            continue
        ok = [s for s in ls if not s['_reasons']]
        cat = Counter(r.split(' (')[0] for s in ls for r in s['_reasons'])
        dur = [((s['trials'][-1].get('t_answer') or 0) / 60000) for s in ls if s['trials']]
        print(f'- {panel}: completed {len(ls)}, passing exclusions {len(ok)}, excluded {dict(cat) or 0}, '
              f'median session {statistics.median(dur):.1f} min' if dur else '')
    for f in info['flags'] + info['problems']:
        print('- FLAG:', f)
    print('\n| panel | n | women | village/town | below graduation | migrants | 45+ | 60+ | quota misses |')
    print('|---|---|---|---|---|---|---|---|---|')
    for panel, q in composition(info['listeners']).items():
        print(f'| {panel} | {q["n"]} | {f2(q["women"])} | {f2(q["village_or_town"])} | {f2(q["below_graduation"])} | {f2(q["migrant"])} | '
              f'{f2(q["age_45_plus"])} | {f2(q["age_60_plus"])} | {", ".join(q["quota_misses"]) or "none"} |')
    return 0


def jsonable(x):
    if isinstance(x, float) and math.isnan(x): return None
    if isinstance(x, dict): return {str(k) if not isinstance(k, tuple) else '|'.join(k): jsonable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)): return [jsonable(v) for v in x]
    return x


def run_analysis(sessions, man, args, quiet=False):
    manual = {}
    if getattr(args, 'exclusions', None):
        for r in csv.DictReader(open(args.exclusions, encoding='utf-8')):
            manual[(r['panel'], r['pid'].upper())] = r.get('reason', 'manual')
    info = prepare(sessions, man, args.include_pilot, args.include_test, manual)
    rng = random.Random(args.seed)
    an = info['analysed']
    prefs = pref_table(an, args.boot, rng)
    prefs_ch = pref_table(an, 0, rng, by=lambda t: {'ph': 'phone', 'wb': 'wideband'}.get(t.get('ch'), t.get('ch')))
    prefs_turn = pref_table(an, 0, rng, by=lambda t: t.get('turn'))
    prefs_age = pref_table(an, 0, rng, by=lambda t: t.get('_age'))
    means, diffs = rating_tables(an)
    age_means = {g: rating_tables([s for s in an if s['trials'] and s['trials'][0].get('_age') == g])[0] for g in ('45+', 'under 45')}
    verdicts, pvals, adj = region_verdicts(prefs, diffs, args.p_correct_inference)
    bc = blockc_stats(an, args.boot, rng)
    rt = retest_stats(info)
    comp = composition(info['listeners'])
    md = report(info, prefs, prefs_ch, prefs_turn, means, diffs, verdicts, pvals, adj, None, bc, rt, comp, args)
    md += age_section(prefs_age, age_means)
    results = {'verdicts': verdicts, 'pvals': pvals, 'holm': adj, 'preference': prefs, 'preference_by_channel': prefs_ch,
               'preference_by_turn': prefs_turn, 'preference_by_age': prefs_age, 'ratings': means, 'ratings_by_age': age_means, 'blockc': bc, 'retest': rt, 'composition': comp,
               'n_listeners': len(info['listeners']), 'n_analysed': len(an), 'flags': info['flags'], 'problems': info['problems']}
    if not quiet:
        print(md)
    return md, results, info


# =====================================================================================================================
# Power simulation (protocol 5) and self-test
# =====================================================================================================================
def expit(x): return 1 / (1 + math.exp(-x))
def logit(p): return math.log(p / (1 - p))


def sim_pref_once(rng, n, k, p, sd_u, sd_item=0.3, tie=0.15):
    items = [rng.gauss(0, sd_item) for _ in range(k)]
    mu = logit(p)
    pairs = []
    for _ in range(n):
        u = rng.gauss(mu, sd_u)
        y = m = 0
        for j in range(k):
            if rng.random() < tie:
                continue
            m += 1
            y += rng.random() < expit(u + items[j])
        pairs.append((y, m))
    return preference_verdict(cluster_prop(pairs))


def sim_diff_once(rng, n, clips, true_diff, sd_slope, sd_resid, margin, higher_is_worse):
    diffs = []
    for _ in range(n):
        slope = true_diff + rng.gauss(0, sd_slope)
        a = statistics.mean(rng.gauss(slope, sd_resid) for _ in range(clips))
        b = statistics.mean(rng.gauss(0, sd_resid) for _ in range(clips))
        diffs.append(a - b)
    return ni_verdict(diffs, margin, higher_is_worse)[0]


def sim_comp_once(rng, n, items, acc, drop, sd_u=0.8):
    diffs = []
    for _ in range(n):
        u = rng.gauss(logit(acc), sd_u)
        a = sum(rng.random() < expit(u + logit(acc - drop) - logit(acc)) for _ in range(items)) / items
        b = sum(rng.random() < expit(u) for _ in range(items)) / items
        diffs.append(a - b)
    return ni_verdict(diffs, NI_COMPREHENSION, False)[0]


def power(args):
    rng = random.Random(args.seed)
    S = args.sims
    configs = [('bihar / outgroup', 12, 3, 6), ('tamilnadu', 6, 2, 4), ('maharashtra', 11, 3, 6)]
    ns = [24, 30, 36, 48, 60]
    print(f'# Power simulation (seed {args.seed}, {S} simulated panels per cell)\n')
    print('Model: per-listener logit preference ~ N(logit p, sd_u); item effects sd 0.3 shared across listeners; 15% '
          '"no difference" answers dropped. Verdict = the pre-registered rule in analysis.py (clustering-adjusted Wilson, '
          f'PREFERRED if lower > 0.5 and p >= {SESOI_PREF}; NOT_PREFERRED if upper < {SESOI_PREF}).\n')
    for name, k, clips, items in configs:
        print(f'## {name}: {k} primary pair trials per listener\n')
        print('| true p | sd_u | ' + ' | '.join(f'n={n}' for n in ns) + ' |')
        print('|---|---|' + '---|' * len(ns))
        for sd_u in (0.5, 1.0):
            for p in (0.50, 0.55, 0.60, 0.65, 0.70):
                cells = []
                for n in ns:
                    c = Counter(sim_pref_once(rng, n, k, p, sd_u) for _ in range(S))
                    cells.append(f'P {c["PREFERRED"] / S:.2f} / K {c["NOT_PREFERRED"] / S:.2f}')
                print(f'| {p:.2f} | {sd_u} | ' + ' | '.join(cells) + ' |')
        print('\nP = share of panels reaching PREFERRED; K = share reaching NOT_PREFERRED (kill). The rest are INCONCLUSIVE. '
              'At p = 0.50, P is the false-adoption rate.\n')
        print(f'Non-inferiority power ({clips} clips per condition per listener), P(PASS) / P(FAIL):\n')
        print('| test | truth | ' + ' | '.join(f'n={n}' for n in ns) + ' |')
        print('|---|---|' + '---|' * len(ns))
        for label, truth, fn in [
            ('patronising, margin 0.5 (7-pt)', 'no difference', lambda n: sim_diff_once(rng, n, clips, 0.0, 0.6, 1.3, NI_PATRONISING, True)),
            ('patronising, margin 0.5 (7-pt)', '+1.0 worse', lambda n: sim_diff_once(rng, n, clips, 1.0, 0.6, 1.3, NI_PATRONISING, True)),
            ('naturalness, margin 0.3 (5-pt)', 'no difference', lambda n: sim_diff_once(rng, n, clips, 0.0, 0.3, 0.9, NI_NATURALNESS, False)),
            ('naturalness, margin 0.3 (5-pt)', '-0.6 worse', lambda n: sim_diff_once(rng, n, clips, -0.6, 0.3, 0.9, NI_NATURALNESS, False)),
            ('comprehension, margin 10 pts', 'equal at 85%', lambda n: sim_comp_once(rng, n, items, 0.85, 0.0)),
            ('comprehension, margin 10 pts', '20 pts worse', lambda n: sim_comp_once(rng, n, items, 0.85, 0.20))]:
            cells = []
            for n in ns:
                c = Counter(fn(n) for _ in range(max(200, S // 2)))
                tot = sum(c.values())
                cells.append(f'{c["PASS"] / tot:.2f} / {c["FAIL"] / tot:.2f}')
            print(f'| {label} | {truth} | ' + ' | '.join(cells) + ' |')
        print('')


def load_plan(panel):
    txt = open(os.path.join(HERE, 'plans', f'{panel}.js'), encoding='utf-8').read()
    return json.loads(txt[txt.index('(') + 1: txt.rindex(')')])


def synth_sessions(panel, n, truth, man, rng):
    """Emulate the page's export for n listeners with known preferences, using the real schedules."""
    plan = load_plan(panel)
    out = []
    p_target, p_vs_eng, patr_shift, nat_shift = truth
    scr = {'bihar': ('bihar', 'bhojpuri', 'bhojpuri'), 'outgroup': ('delhi', 'hindi', 'hindi'),
           'tamilnadu': ('tamilnadu', 'tamil', 'tamil'), 'maharashtra': ('maharashtra', 'marathi', 'marathi')}[panel]
    for num in range(1, n + 1):
        sch = plan['schedules'][num - 1]
        u = rng.gauss(logit(p_target), 0.5)
        uE = rng.gauss(logit(p_vs_eng), 0.5)
        sid = f'synth-{panel}-{num}'
        tr, clock = [], 1000
        for pos, e in enumerate(sch['B']):
            code = e[1]
            row = man.get(code, {})
            matched = row.get('condition') == MATCHED[panel]
            t = {'block': 'B', 'pos': pos, 'kind': 'rate' if e[0] == 'r' else 'degraded', 't_shown': clock, 'plays': 1, 'stalls': 0,
                 'clip': code, 'ch': 'ph', 'turn': plan['clips'][code]['t'], 'attn_row': e[2] if e[0] == 'r' else 0,
                 't_play': clock + 500, 't_end': clock + 13000}
            nat = 1 if e[0] == 'd' else max(1, min(5, round(rng.gauss(3.6 + (nat_shift if matched else 0), 0.8))))
            t.update(q1='a' if rng.random() < 0.85 else 'c', q2='a' if rng.random() < 0.85 else 'b', nat=nat,
                     trust=max(1, min(7, round(rng.gauss(4.5, 1.2)))), patr=max(1, min(7, round(rng.gauss(2.5 + (patr_shift if matched else 0), 1.2)))),
                     fit=max(1, min(7, round(rng.gauss(5 if matched else 4, 1.2)))), cont=max(1, min(5, nat + rng.choice([-1, 0, 0, 1]))))
            if t['attn_row']:
                t['attn'] = 2
            t['t_answer'] = t['t_end'] + int(rng.uniform(25000, 60000))
            clock = t['t_answer']
            tr.append(t)
        for pos, e in enumerate(sch['A']):
            t = {'block': 'A', 'pos': pos, 'kind': 'pair' if e[0] == 'p' else 'identical', 't_shown': clock, 'plays': 1, 'stalls': 0}
            if e[0] == 'i':
                t.update(pair='identical', a=e[1], b=e[1], ch=e[2], turn=plan['clips'][e[1]]['t'], choice='0')
            else:
                ra, rb = man[e[2]], man[e[3]]
                contrast, a_t = classify_pair(ra, rb)
                pt = expit(uE) if 'indian_english' in contrast and contrast.startswith('tamil') else (0.5 if contrast.startswith('voice') else expit(u))
                if contrast.startswith('indian_english'):
                    pt = 0.5
                if rng.random() < 0.15:
                    ch = '0'
                else:
                    hit = rng.random() < pt
                    ch = ('A' if hit == a_t else 'B') + rng.choice('12')
                t.update(pair=e[1], a=e[2], b=e[3], ch=e[4], turn=plan['clips'][e[2]]['t'], choice=ch)
            t.update(t_play=clock + 300, t_end=clock + 27000, t_answer=clock + 31000)
            clock = t['t_answer']
            tr.append(t)
        s = {'schema': 'vpl-answers/1', 'session_id': sid, 'panel': panel, 'pid': f'{plan["prefix"]}{num:03d}', 'pid_num': num,
             'mode': 'field', 'retest': False, 'ui_lang': 'en', 'complete': True, 'end_reason': None,
             'screen': {'age': rng.choice(['18-29', '30-44', '45-59', '60+']), 'gender': rng.choice(['woman', 'man']), 'home_state': scr[0],
                        'home_district': 'x', 'cur_state': scr[0] if rng.random() < 0.75 else 'delhi', 'place': rng.choice(['village', 'town', 'city']),
                        'mt': scr[1], 'home_lang': scr[2], 'other_langs': ['english'], 'edu': rng.choice(['lt10', '10-12', 'grad']),
                        'phone': 'android', 'device': 'wired', 'work': 'no', 'know': 'no', 'before': 'no'},
             'check': {'rounds': [], 'pass': True}, 'trials': tr, 'open_text': '', 'finished_at': f'2026-11-01T10:{num % 60:02d}:00Z',
             'device_id': f'dev-{panel}-{num}'}
        s['checksum'] = fnv1a_utf16(canonical(s))
        out.append(s)
    return out


def selftest(args):
    man = load_manifest(args.manifest)
    rng = random.Random(args.seed)
    truth = {'bihar': (0.50, 0.5, 0.0, 0.0), 'tamilnadu': (0.78, 0.70, 0.0, 0.0), 'maharashtra': (0.66, 0.5, 0.0, -0.9),
             'outgroup': (0.30, 0.5, 1.0, 0.0)}
    sessions = []
    for panel, tr in truth.items():
        sessions += synth_sessions(panel, 48, tr, man, rng)
    # one speeder and one catch-failer in Bihar to exercise exclusions
    sp = sessions[0]
    for t in sp['trials']:
        if t['block'] == 'B': t['t_answer'] = t['t_end'] + 2000
    sp['checksum'] = fnv1a_utf16(canonical(sp))
    cf = sessions[1]
    for t in cf['trials']:
        if t['kind'] == 'identical': t['choice'] = 'A2'
        if t['kind'] == 'degraded': t['nat'] = 5
    cf['checksum'] = fnv1a_utf16(canonical(cf))
    # round-trip one session through an answer code and the CSV path
    code = 'VPL1z.' + base64.urlsafe_b64encode(gzip.compress(json.dumps(sessions[5]).encode())).decode().rstrip('=')
    assert decode_code(code)['session_id'] == sessions[5]['session_id']
    args.include_pilot = args.include_test = False
    md, res, info = run_analysis(sessions, man, args, quiet=True)
    v = res['verdicts']
    checks = [
        ('Bihar truth p=0.50 -> not ADOPT', v['bihar']['verdict'] != 'ADOPT'),
        ('Tamil Nadu truth p=0.78 -> PREFERRED', v['tamilnadu']['preference'] == 'PREFERRED'),
        ('Tamil Nadu -> ADOPT or INCONCLUSIVE, never KILL (comprehension NI has ~0.85 power at n=48)', v['tamilnadu']['verdict'] in ('ADOPT', 'INCONCLUSIVE')),
        ('Maharashtra naturalness -0.9 -> KILL (not producible)', v['maharashtra']['verdict'] == 'KILL' and v['maharashtra']['naturalness'] == 'FAIL'),
        ('Out-group p=0.30 -> preference estimate below 0.5', v['outgroup']['preference_for_bhojpuri']['p'] < 0.5),
        ('speeder excluded', any('speeding' in r for r in sp['_reasons'])),
        ('catch failer excluded', any('catch' in r for r in cf['_reasons'])),
        ('no checksum flags on untouched sessions', not any('checksum' in f for f in res['flags'])),
        ('analysed = 192 - 2', res['n_analysed'] == 190),
    ]
    tmp_csv = io.StringIO()
    ok = all(c for _, c in checks)
    for name, c in checks:
        print(('PASS ' if c else 'FAIL ') + name)
    print('\n' + md[:2500] + '\n...')
    del tmp_csv
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('inputs', nargs='*', help='answer files or folders (.json, .csv, or text containing answer codes)')
    ap.add_argument('--manifest', default=DEFAULT_MANIFEST)
    ap.add_argument('--blockc', help='Block C stimulus CSV (same file given to build_plan.py --blockc)')
    ap.add_argument('--exclusions', help='CSV panel,pid,reason for coordinator-judged exclusions (protocol 6.5)')
    ap.add_argument('--include-pilot', action='store_true', help='pilot sessions are never pooled into the main result (protocol 9)')
    ap.add_argument('--include-test', action='store_true')
    ap.add_argument('--p-correct-inference', type=float, help='P(region inferred correctly), enables the Bhojpuri EV rule')
    ap.add_argument('--boot', type=int, default=10000)
    ap.add_argument('--seed', type=int, default=SEED)
    ap.add_argument('--md'); ap.add_argument('--out'); ap.add_argument('--tidy')
    ap.add_argument('--power', action='store_true'); ap.add_argument('--sims', type=int, default=1000)
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--quality-only', action='store_true', help='interim look (protocol 6.7): counts, catches, exclusions and '
                    'composition only; prints no preference or rating estimate')
    a = ap.parse_args()
    if a.power:
        return power(a)
    if a.selftest:
        a.boot = min(a.boot, 1000); a.exclusions = None; a.p_correct_inference = None
        return selftest(a)
    if not a.inputs:
        ap.error('give answer files or folders, or --power / --selftest')
    sessions, problems = load_inputs(a.inputs)
    man = load_manifest(a.manifest, a.blockc)
    if a.quality_only:
        return quality_only(sessions, man, a)
    md, res, info = run_analysis(sessions, man, a, quiet=bool(a.md))
    for p in problems:
        print('PROBLEM', p, file=sys.stderr)
    if a.md:
        open(a.md, 'w', encoding='utf-8').write(md)
        print(f'wrote {a.md}')
    if a.out:
        json.dump(jsonable(res), open(a.out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False, default=str)
        print(f'wrote {a.out}')
    if a.tidy:
        rows = list(tidy_rows(info))
        cols = []
        for r in rows:
            cols += [k for k in r if k not in cols]
        with open(a.tidy, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader(); w.writerows(rows)
        print(f'wrote {a.tidy} ({len(rows)} rows)')
    return 0


if __name__ == '__main__':
    sys.exit(main() or 0)
