#!/usr/bin/env python3
"""Analyse exported listener-panel v2 answers (protocol v2.0). Python 3.9+, standard library only.

The decision code IS the pre-registration (panel-predictions.md): constants, rules and the Holm family below are
frozen before the first main-panel listener.

Reads any mix of: session JSON files (one session or the coordinator's array), the page's CSV export, and text files
holding pasted answer codes (VPL1. / VPL1z.) from WhatsApp. Joins file codes to conditions from the round-2 manifests
(TTS: manifest.csv; human and competitor recordings: manifest-external.csv), applies the pre-registered exclusions,
and reports:
  - the confirmatory family (Holm): E1 older listeners' comprehension floor, E2 slow pace, T1 HD vs neural voice,
    S1 fraud-safety line;
  - the secondary predictions (panel-predictions.md section 4), the human and competitor arms when they exist;
  - the regional language and dialect verdicts (the v1 H6 rule, now on renewal turns).

  python3 analysis.py answers/                       analyse everything under answers/ (field and kiosk sessions)
  python3 analysis.py answers/ --md report.md --out results.json --tidy trials.csv
  python3 analysis.py answers/ --quality-only        interim look: counts, catches, exclusions, quotas; no effects
  python3 analysis.py --power [--sims 1000]          the sample-size simulation behind protocol section 5
  python3 analysis.py --selftest                     synthetic panels with known truth through the whole pipeline
"""
import argparse, base64, csv, gzip, io, json, math, os, random, re, statistics, struct, sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
STIM = os.path.normpath(os.path.join(HERE, '..', 'lanes', 'l8-azure-bench', 'stimuli-round2'))
DEFAULT_MANIFEST = os.path.join(STIM, 'manifest.csv')
DEFAULT_EXTERNAL = os.path.join(STIM, 'manifest-external.csv')
SEED = 20261017

# ---- Pre-registered constants (protocol 6; panel-predictions.md). Changing any after fielding starts invalidates. ----
SESOI_PREF = 0.58        # smallest preference worth acting on
FLOOR_COMP = 0.80        # E1: comprehension target on the product-default voice (point estimate must reach it)
FLOOR_LOWER = 0.70       # E1: PASS also needs the clustering-adjusted lower bound above this
NI_PATRONISING = 0.5     # 7-point scale
NI_COMPREHENSION = 0.10  # proportion correct
NI_NATURALNESS = 0.3     # 5-point ACR
SYM_OTHER = 0.42         # ours-vs-other: the other is preferred if p(ours) <= 0.42 and the upper bound < 0.5
SPEEDER_FRACTION = 0.4   # listener median answer time below 40% of the panel median -> excluded
CATCH_FAILS_TO_EXCLUDE = 2
MIN_LISTENERS = 24       # below this many analysed listeners no verdict is issued (design effect unreliable)
RENEWAL_PANELS = ['hindi_60plus', 'hindi_18to59']
REGION_PANELS = ['tamilnadu', 'maharashtra', 'bihar']
PANEL_ORDER = RENEWAL_PANELS + ['tamilnadu', 'maharashtra', 'bihar', 'outgroup', 'hindi (pooled)']
MATCHED = {'bihar': 'bhojpuri_mix', 'outgroup': 'bhojpuri_mix', 'tamilnadu': 'tamil_english', 'maharashtra': 'marathi_mix'}
NEUTRAL = 'neutral_hinglish'
PRIORITY = ['bhojpuri_mix', 'tamil_english', 'marathi_mix', 'indian_english', 'neutral_hinglish']   # target of a pair
CELL_ORDER = ['neural-default', 'neural-slow', 'hd-default', 'hd-slow', 'human', 'competitor']
AGE_60 = ('60-69', '70+', '60+')
AGE_18_59 = ('18-29', '30-44', '45-59')
HINDI_BELT = ('up', 'mp', 'bihar', 'delhi', 'haryana', 'rajasthan', 'jharkhand', 'chhattisgarh', 'uttarakhand', 'himachal')
HINDI_MT = ('hindi', 'bhojpuri', 'maithili', 'magahi', 'haryanvi', 'rajasthani', 'awadhi')


def _hindi_ok(s):
    return (s.get('mt') in HINDI_MT and s.get('home_state') in HINDI_BELT and
            (s.get('mt') == 'hindi' or s.get('home_lang') == 'hindi' or 'hindi' in (s.get('other_langs') or [])))


ELIGIBLE = {   # mirrors ELIG in app.js
    'hindi_60plus': lambda s: s.get('age') in AGE_60 and _hindi_ok(s),
    'hindi_18to59': lambda s: s.get('age') in AGE_18_59 and _hindi_ok(s),
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


INT_FIELDS = {'pid_num', 'pos', 'nat', 'trust', 'scam', 'patr', 'fit', 'cont', 'attn_row', 'attn', 'conf', 'plays', 'plays_a',
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
                       'edu', 'phone', 'device', 'hearing', 'policy', 'rcall']
        screen = {k: r0.get(k, '') for k in screen_keys} if r0.get('age') else None
        if screen:
            screen['other_langs'] = [x for x in screen['other_langs'].split('|') if x]
        trials = []
        for r in rs:
            if not r.get('block'):
                continue
            t = {}
            for k in ['block', 'pos', 'kind', 'pair', 'q', 'clip', 'a', 'b', 'ch', 'turn', 'choice', 'q1', 'q2', 'nat', 'trust', 'scam', 'patr',
                      'fit', 'cont', 'attn_row', 'attn', 'hai', 'conf', 'plays', 'plays_a', 'plays_b', 'stalls', 'after_resume',
                      't_shown', 't_play', 't_end', 't_answer']:
                v = r.get(k, '')
                if v == '':
                    continue
                t[k] = int(v) if k in INT_FIELDS and re.fullmatch(r'-?\d+', v) else v
            trials.append(t)
        out.append({'schema': 'vpl-answers/2', 'session_id': sid, 'panel': r0['panel'], 'pid': r0['pid'], 'pid_num': cv(r0.get('pid_num', '')),
                    'mode': r0['mode'], 'retest': b(r0.get('retest')), 'ui_lang': r0.get('ui_lang'), 'started_at': r0.get('started_at'),
                    'finished_at': r0.get('finished_at') or None, 'complete': b(r0.get('complete')), 'end_reason': r0.get('end_reason') or None,
                    'screen': screen, 'check': {'pass': b(r0.get('check_pass'))}, 'trials': trials, 'open_text': r0.get('open_text', ''),
                    'device_id': r0.get('device_id'), 'checksum': r0.get('checksum'), 'manifest_sha256': r0.get('manifest_sha256'),
                    'assisted': b(r0.get('assisted')), 'big': b(r0.get('big')),
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
        if not isinstance(s, dict) or s.get('schema') != 'vpl-answers/2':   # v1 (round-1) answers are not comparable
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



def floor_verdict(cp):
    """E1: PASS if point >= FLOOR_COMP and adjusted lower bound > FLOOR_LOWER; FAIL if adjusted upper < FLOOR_COMP."""
    lo, hi = cp['wilson_adj']
    if math.isnan(cp['p']) or math.isnan(lo):
        return 'NO_DATA'
    if cp['listeners'] < MIN_LISTENERS:
        return 'TOO_FEW'
    if cp['p'] >= FLOOR_COMP and lo > FLOOR_LOWER:
        return 'PASS'
    if hi < FLOOR_COMP:
        return 'FAIL'
    return 'INCONCLUSIVE'


def superiority_verdict(diffs):
    """E2: PASS if the one-sided 95% lower bound of the within-listener difference is > 0; WORSE if the upper is < 0."""
    s = mean_ci(diffs)
    if s['n'] < 2:
        return 'NO_DATA', s
    if s['n'] < MIN_LISTENERS:
        return 'TOO_FEW', s
    if s['lo1'] > 0: return 'PASS', s
    if s['hi1'] < 0: return 'WORSE', s
    return 'INCONCLUSIVE', s


def sym_verdict(cp):
    """Ours vs a reference (human, competitor). p = share choosing ours."""
    lo, hi = cp['wilson_adj']
    if math.isnan(cp['p']) or math.isnan(lo):
        return 'NO_DATA'
    if cp['listeners'] < MIN_LISTENERS:
        return 'TOO_FEW'
    if lo > 0.5 and cp['p'] >= SESOI_PREF:
        return 'OURS_PREFERRED'
    if hi < 0.5 and cp['p'] <= SYM_OTHER:
        return 'OTHER_PREFERRED'
    return 'PARITY_OR_INCONCLUSIVE'


def load_manifest(path, external=None):
    rows = {}
    for p in [path] + ([external] if external and os.path.exists(external) else []):
        for r in csv.DictReader(open(p, encoding='utf-8')):
            r.setdefault('source', 'tts'); r.setdefault('pace', 'default'); r.setdefault('script', 'plain')
            r['source'] = r.get('source') or 'tts'
            rows[r['file_code']] = r      # superseded rows are kept: a session built on an old plan still joins
    return rows


# =====================================================================================================================
# Analysis
# =====================================================================================================================
def choice_side(c):
    if c in ('A1', 'A2'): return 'a', int(c[1])
    if c in ('B1', 'B2'): return 'b', int(c[1])
    if c == '0': return 'tie', 0
    return None, None


def cell_of(row, kind):
    src = row.get('source') or 'tts'
    if src != 'tts':
        return src
    if kind == 'renewal':
        return f'{row.get("tier")}-{row.get("pace") or "default"}'
    return row.get('register')


def classify_pair(ra, rb):
    """(contrast name, target is a?) from the attribute that differs between the two clips of a pair."""
    sa, sb = ra.get('source') or 'tts', rb.get('source') or 'tts'
    if sa != sb:
        other = sb if sa == 'tts' else sa
        a_t = sa == 'tts'
        return ('ours vs human' if other == 'human' else 'ours vs competitor'), a_t
    if ra.get('script') != rb.get('script'):
        return 'safety vs plain', ra.get('script') == 'safety'
    if ra['voice'] == rb['voice'] and ra.get('pace') != rb.get('pace'):
        return 'slow vs default', ra.get('pace') == 'slow'
    if ra['voice'] == rb['voice'] and ra.get('register') != rb.get('register'):
        ca, cb = ra['register'], rb['register']
        ta = PRIORITY.index(ca) < PRIORITY.index(cb)
        tgt, oth = (ca, cb) if ta else (cb, ca)
        return f'{tgt} vs {oth}', ta
    if ra['voice'] != rb['voice'] and ra.get('register') == rb.get('register'):
        ta_, tb_ = ra.get('tier'), rb.get('tier')
        if {ta_, tb_} == {'hd', 'neural'}:
            return 'hd vs neural', ta_ == 'hd'
        if 'native' in (ta_, tb_) and ta_ != tb_:
            oth = tb_ if ta_ == 'native' else ta_
            return f'native vs {oth} ({ra["register"]})', ta_ == 'native'
    return 'mixed (not a planned contrast)', True


def migrant(scr):
    return bool(scr) and scr.get('cur_state') not in (None, '', scr.get('home_state'))


def age_group(scr):
    a = (scr or {}).get('age')
    return '60+' if a in AGE_60 else '45-59' if a == '45-59' else 'under 45' if a else 'unknown'


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
        if s.get('screen') and s['panel'] in ELIGIBLE and not ELIGIBLE[s['panel']](s['screen']):
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
    for s in listeners + retests:
        for t in s['trials']:
            for side in ('clip', 'a', 'b'):
                code = t.get(side)
                if code and code in man:
                    t['_' + side] = man[code]
                elif code and not str(code).startswith('catch_'):
                    info['problems'].append(f'{s["panel"]} {s["pid"]}: clip {code} not in manifest (wrong manifest version?)')
    for s in listeners:
        g = age_group(s.get('screen'))
        s['_age'] = g
        s['_kind'] = 'renewal' if s['panel'] in RENEWAL_PANELS else 'register'
        for t in s['trials']:
            t['_age'] = g
    info['listeners'] = listeners
    info['analysed'] = [s for s in listeners if not s['_reasons']]
    info['retests'] = retests
    return info


def pref_table(analysed, B, rng, by=None, pooled=False):
    """Preference per (panel, contrast[, by]) with Wilson naive, Wilson adjusted for listener clustering and bootstrap.
    pooled=True also adds 'hindi (pooled)' rows over the two renewal panels."""
    cells = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0]))   # key -> pid -> [target, nontie, ties, clearly]
    for s in analysed:
        panels = [s['panel']] + (['hindi (pooled)'] if pooled and s['panel'] in RENEWAL_PANELS else [])
        for t in s['trials']:
            if t.get('kind') != 'pair' or '_a' not in t or '_b' not in t:
                continue
            contrast, a_is_target = classify_pair(t['_a'], t['_b'])
            side, strength = choice_side(t.get('choice'))
            if side is None:
                continue
            extra = by(t) if by else None
            for panel in panels:
                key = (panel, contrast) + ((extra,) if by else ())
                c = cells[key][s['panel'] + '|' + s['pid']]
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
        row['verdict'] = sym_verdict(cp) if key[1].startswith('ours vs') else preference_verdict(cp)
        out.append(row)
    out.sort(key=lambda r: (PANEL_ORDER.index(r['panel']) if r['panel'] in PANEL_ORDER else 9, r['contrast'], str(r['by'])))
    return out


MEASURES = ('nat', 'trust', 'scam', 'patr', 'fit', 'cont')


def per_listener_cells(analysed, turn_filter=None):
    """panel -> pid -> (cell, measure) -> values, for Block B rated clips."""
    per = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for s in analysed:
        for t in s['trials']:
            if t.get('kind') != 'rate' or '_clip' not in t:
                continue
            if turn_filter and t.get('turn') not in turn_filter:
                continue
            cell = cell_of(t['_clip'], s['_kind'])
            d = per[s['panel']][s['pid']]
            for m in MEASURES:
                if t.get(m) is not None and t.get(m) != '':
                    d[(cell, m)].append(int(t[m]))
            if not t.get('after_resume'):
                for q in ('q1', 'q2'):
                    if t.get(q):
                        d[(cell, 'comp')].append(1 if t[q] == 'a' else 0)
    return per


def cell_rank(c):
    return CELL_ORDER.index(c) if c in CELL_ORDER else 10 + (PRIORITY.index(c) if c in PRIORITY else 9)


def rating_tables(analysed):
    """Per panel x cell means (listener-level) and comprehension; per-listener paired differences for every cell pair."""
    per = per_listener_cells(analysed)
    means, diffs = [], {}
    for panel, pids in per.items():
        cells = sorted({c for d in pids.values() for (c, _) in d}, key=cell_rank)
        for c in cells:
            row = {'panel': panel, 'cell': c}
            for m in MEASURES:
                row[m] = mean_ci([statistics.mean(d[(c, m)]) for d in pids.values() if d.get((c, m))])
            row['comp'] = cluster_prop([(sum(d[(c, 'comp')]), len(d[(c, 'comp')])) for d in pids.values() if d.get((c, 'comp'))])
            means.append(row)
        for tgt in cells:
            for oth in cells:
                if tgt == oth:
                    continue
                key = (panel, tgt, oth)
                diffs[key] = {}
                for m in MEASURES + ('comp',):
                    diffs[key][m] = [statistics.mean(d[(tgt, m)]) - statistics.mean(d[(oth, m)])
                                     for d in pids.values() if d.get((tgt, m)) and d.get((oth, m))]
    means.sort(key=lambda r: (PANEL_ORDER.index(r['panel']) if r['panel'] in PANEL_ORDER else 9, cell_rank(r['cell'])))
    return means, diffs, per


def comp_cluster(per, panel, cell):
    return cluster_prop([(sum(d[(cell, 'comp')]), len(d[(cell, 'comp')])) for d in per.get(panel, {}).values() if d.get((cell, 'comp'))])


def rm_corr(analysed, xk, yk, panels=None):
    """Repeated-measures correlation (within-listener centred Pearson), Block B rated clips."""
    xs, ys, L = [], [], 0
    for s in analysed:
        if panels and s['panel'] not in panels:
            continue
        pts = [(int(t[xk]), int(t[yk])) for t in s['trials'] if t.get('kind') == 'rate' and t.get(xk) not in (None, '') and t.get(yk) not in (None, '')]
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


def p_gt(cp, null):
    """One-sided p for H1: proportion > null (listener-cluster t)."""
    if math.isnan(cp.get('p', NAN)) or cp.get('listeners', 0) < 2:
        return NAN
    se = cp['se'] if cp.get('se') and cp['se'] > 0 else math.sqrt(0.25 / max(cp['trials'], 1))
    return 1 - t_cdf((cp['p'] - null) / se, cp['listeners'] - 1)


def renewal_verdicts(prefs, per, diffs, an):
    """Confirmatory family E1, E2, T1, S1 (Holm) and the secondary renewal predictions."""
    V, pvals = {}, {}
    pr = {(r['panel'], r['contrast']): r for r in prefs if r['by'] == 'all'}
    # E1: older listeners' comprehension on the product-default cell
    e1 = comp_cluster(per, 'hindi_60plus', 'neural-default')
    V['E1'] = {'verdict': floor_verdict(e1), 'est': e1, 'rule': f'PASS if p >= {FLOOR_COMP} and adjusted lower > {FLOOR_LOWER}; FAIL if adjusted upper < {FLOOR_COMP}'}
    pvals['E1'] = p_gt(e1, FLOOR_LOWER)
    # E2: slow minus default comprehension, within listener, 60+
    v, s = superiority_verdict(diffs.get(('hindi_60plus', 'neural-slow', 'neural-default'), {}).get('comp', []))
    V['E2'] = {'verdict': v, 'est': s, 'rule': 'PASS if one-sided 95% lower bound of (slow - default) > 0'}
    pvals['E2'] = (1 - t_cdf(s['mean'] / s['se'], s['df'])) if s.get('se') else NAN
    # T1, S1 pooled over the two renewal panels
    for k, c in (('T1', 'hd vs neural'), ('S1', 'safety vs plain')):
        r = pr.get(('hindi (pooled)', c))
        V[k] = {'verdict': r['verdict'] if r else 'NO_DATA', 'est': r, 'rule': f'PREFERRED if adjusted lower > 0.5 and p >= {SESOI_PREF}; NOT_PREFERRED if upper < {SESOI_PREF}'}
        pvals[k] = r['p_one_sided_gt_half'] if r else NAN
    adj = holm(pvals)
    for k in ('E1', 'E2', 'T1', 'S1'):
        V[k]['p'] = pvals.get(k, NAN); V[k]['p_holm'] = adj.get(k, NAN)
        if V[k]['verdict'] in ('PASS', 'PREFERRED') and adj.get(k, 1) >= 0.05:
            V[k]['note'] = 'not robust to Holm correction across E1, E2, T1, S1'
    # ---- secondary ----
    sec = {}
    e1b = comp_cluster(per, 'hindi_18to59', 'neural-default')
    sec['E1b 18-59 comprehension floor'] = {'verdict': floor_verdict(e1b), 'est': e1b}
    if not math.isnan(e1.get('p', NAN)) and not math.isnan(e1b.get('p', NAN)) and e1.get('se') and e1b.get('se'):
        gap = e1b['p'] - e1['p']; se = math.sqrt(e1['se'] ** 2 + e1b['se'] ** 2)
        sec['E1c 18-59 minus 60+ comprehension (neural default)'] = {'verdict': f'{gap:+.3f} [{gap - 1.96 * se:+.3f}, {gap + 1.96 * se:+.3f}]', 'est': {'gap': gap, 'se': se}}
    for panel, key in (('hindi_60plus', 'E3 60+ prefer slow (pairs)'), ('hindi_18to59', 'E4 18-59 p(slow) in pairs')):
        r = pr.get((panel, 'slow vs default'))
        sec[key] = {'verdict': r['verdict'] if r else 'NO_DATA', 'est': r}
    for panel in RENEWAL_PANELS:
        v, s = ni_verdict(diffs.get((panel, 'neural-slow', 'neural-default'), {}).get('patr', []), NI_PATRONISING, True)
        sec[f'P5 slow not more patronising ({panel})'] = {'verdict': v, 'est': s}
    pooled_nat = []
    for panel in RENEWAL_PANELS:
        pooled_nat += diffs.get((panel, 'hd-default', 'neural-default'), {}).get('nat', [])
    sec['T2 HD minus neural naturalness (Block B, pooled)'] = {'verdict': 'interval', 'est': mean_ci(pooled_nat)}
    for panel in RENEWAL_PANELS:
        r = pr.get((panel, 'safety vs plain'))
        sec[f'S2 safety line by stratum ({panel})'] = {'verdict': r['verdict'] if r else 'NO_DATA', 'est': r}
    # fraud suspicion
    r7 = [statistics.mean(int(t['scam']) for t in s['trials'] if t.get('kind') == 'rate' and t.get('turn') == 'R7' and t.get('scam') not in (None, ''))
          for s in an if s['panel'] == 'hindi_60plus' and any(t.get('kind') == 'rate' and t.get('turn') == 'R7' and t.get('scam') not in (None, '') for t in s['trials'])]
    sec['F1 mean fraud suspicion on R7, 60+ (1-7)'] = {'verdict': 'interval', 'est': mean_ci(r7)}
    sec['F2 within-listener fraud suspicion -> continue (renewal panels)'] = {'verdict': 'correlation', 'est': rm_corr(an, 'scam', 'cont', RENEWAL_PANELS)}
    money, nomoney = per_listener_cells(an, {'R5', 'R7'}), per_listener_cells(an, {'R1', 'R6'})
    fd = []
    for panel in RENEWAL_PANELS:
        for pid in set(money.get(panel, {})) & set(nomoney.get(panel, {})):
            a = [v for (c, m), vs in money[panel][pid].items() if m == 'scam' for v in vs]
            b = [v for (c, m), vs in nomoney[panel][pid].items() if m == 'scam' for v in vs]
            if a and b:
                fd.append(statistics.mean(a) - statistics.mean(b))
    sec['F3 fraud suspicion R5/R7 minus R1/R6 (within listener)'] = {'verdict': 'interval', 'est': mean_ci(fd)}
    # human and competitor arms
    for panel in RENEWAL_PANELS + ['hindi (pooled)']:
        r = pr.get((panel, 'ours vs human'))
        if r:
            sec[f'H1 ours vs human ({panel})'] = {'verdict': r['verdict'], 'est': r}
        r = pr.get((panel, 'ours vs competitor'))
        if r:
            sec[f'K1 ours vs competitor, all vendors ({panel})'] = {'verdict': r['verdict'], 'est': r}
    v, s = ni_verdict(diffs.get(('hindi_60plus', 'neural-default', 'human'), {}).get('comp', []), NI_COMPREHENSION, False)
    if s['n']:
        sec['H3 ours minus human comprehension, 60+ (NI, 10 points)'] = {'verdict': v, 'est': s}
    return V, sec, pvals, adj


def region_verdicts(prefs, diffs, p_inference):
    """H6 verdict per region (protocol 6.6, unchanged rule) on the renewal turns, plus the out-group cost."""
    primary = {r['panel']: r for r in prefs if r['by'] == 'all' and r['panel'] in MATCHED and r['contrast'] == f'{MATCHED[r["panel"]]} vs {NEUTRAL}'}
    out, pvals = {}, {}
    og = primary.get('outgroup')
    og_t = mean_ci(diffs.get(('outgroup', MATCHED['outgroup'], NEUTRAL), {}).get('trust', []))
    if og_t['n'] >= 2 and og_t.get('se'):
        pvals['D2 out-group trust cost'] = t_cdf(og_t['mean'] / og_t['se'], og_t['df'])
    for panel in REGION_PANELS:
        pr = primary.get(panel)
        d = diffs.get((panel, MATCHED[panel], NEUTRAL), {})
        patr_v, patr_s = ni_verdict(d.get('patr', []), NI_PATRONISING, True)
        comp_v, comp_s = ni_verdict(d.get('comp', []), NI_COMPREHENSION, False)
        nat_v, nat_s = ni_verdict(d.get('nat', []), NI_NATURALNESS, False)
        pref_v = pr['verdict'] if pr else 'NO_DATA'
        if pr:
            pvals[{'bihar': 'D1 Bihar preference', 'tamilnadu': 'L1 Tamil Nadu preference', 'maharashtra': 'L4 Maharashtra preference'}[panel]] = pr['p_one_sided_gt_half']
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
                    gain, loss = 2 * pr['p'] - 1, max(0.0, 1 - 2 * og['p'])
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
    adj = holm(pvals)
    for panel, key in (('bihar', 'D1 Bihar preference'), ('tamilnadu', 'L1 Tamil Nadu preference'), ('maharashtra', 'L4 Maharashtra preference')):
        if out.get(panel, {}).get('verdict') == 'ADOPT' and adj.get(key, 1) >= 0.05:
            out[panel]['why'] += '; NOTE: not robust to Holm correction across the regional family'
    out['outgroup'] = {'preference_for_bhojpuri': og, 'trust_cost': og_t}
    return out, pvals, adj


def blockc_stats(analysed, B, rng):
    res = {}
    for panel in RENEWAL_PANELS:
        ls = [s for s in analysed if s['panel'] == panel]
        trials = [(s['pid'], t) for s in ls for t in s['trials'] if t.get('kind') == 'human_or_ai' and '_clip' in t]
        if not trials:
            continue
        src = lambda t: t['_clip'].get('source') or 'tts'
        score = lambda t: (1 if t.get('hai') == 'computer' else -1) * int(t.get('conf') or 1)
        def auc(items):
            tts = [score(t) for _, t in items if src(t) == 'tts']
            hum = [score(t) for _, t in items if src(t) == 'human']
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
        tts = [t for _, t in trials if src(t) == 'tts']
        hum = [t for _, t in trials if src(t) == 'human']
        res[panel] = {'auc': auc(trials), 'auc_ci': (boots[int(0.025 * len(boots))], boots[int(0.975 * len(boots)) - 1]) if boots else (NAN, NAN),
                      'tts_judged_computer': cluster_prop([(sum(t.get('hai') == 'computer' for _, t in by_pid[p] if src(t) == 'tts'),
                                                            sum(1 for _, t in by_pid[p] if src(t) == 'tts')) for p in pids]),
                      'nat_tts': mean_ci([int(t['nat']) for t in tts if t.get('nat')]), 'nat_human': mean_ci([int(t['nat']) for t in hum if t.get('nat')]),
                      'cont_tts': mean_ci([int(t['cont']) for t in tts if t.get('cont')]), 'cont_human': mean_ci([int(t['cont']) for t in hum if t.get('cont')])}
    return res


def retest_stats(info):
    orig = {(s['panel'], s['pid']): s for s in info['listeners']}
    agree = defaultdict(lambda: [0, 0, 0, 0])
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


QUOTAS = {   # protocol 2.3; renewal panels are age-stratified by link, so their 60+ share is fixed by design
    'women': 0.40, 'village_or_town': 0.35, 'below_graduation': 0.30, 'migrant': 0.20, 'age_60_plus': 0.30,
}


def composition(listeners):
    rows = {}
    for panel in PANEL_ORDER:
        ls = [s for s in listeners if s['panel'] == panel and s.get('screen')]
        if not ls:
            continue
        n = len(ls)
        share = lambda f: sum(1 for s in ls if f(s['screen'])) / n
        q = rows[panel] = {
            'n': n, 'age': dict(Counter(s['screen'].get('age') for s in ls)),
            'women': share(lambda x: x.get('gender') == 'woman'),
            'village_or_town': share(lambda x: x.get('place') in ('village', 'town')),
            'below_graduation': share(lambda x: x.get('edu') in ('lt10', '10-12')),
            'migrant': share(lambda x: x.get('cur_state') not in (None, '', x.get('home_state'))),
            'age_45_59': share(lambda x: x.get('age') == '45-59'), 'age_60_plus': share(lambda x: x.get('age') in AGE_60),
            'age_70_plus': share(lambda x: x.get('age') == '70+'),
            'hearing_difficulty': share(lambda x: x.get('hearing') in ('some', 'alot', 'aid')),
            'policyholder_household': share(lambda x: x.get('policy') == 'yes'),
            'renewal_call_12m': share(lambda x: x.get('rcall') == 'yes'),
            'device': dict(Counter(s['screen'].get('device') for s in ls)),
        }
        checks = [('women >= 40%', q['women'] >= 0.40), ('village/town >= 35%', q['village_or_town'] >= 0.35),
                  ('below graduation >= 30%', q['below_graduation'] >= 0.30)]
        if panel in RENEWAL_PANELS:
            checks.append(('household policy-holders >= 60%', q['policyholder_household'] >= 0.60))
            if panel == 'hindi_60plus':
                checks.append(('aged 70+ >= 25% of the 60+ panel', q['age_70_plus'] >= 0.25))
            else:
                checks.append(('aged 45-59 >= 12 listeners', sum(1 for s in ls if s['screen'].get('age') == '45-59') >= 12))
        else:
            checks += [('migrants >= 20%', q['migrant'] >= 0.20), ('aged 60+ >= 30%', q['age_60_plus'] >= 0.30)]
        q['quota_misses'] = [name for name, ok in checks if not ok]
    return rows


# =====================================================================================================================
# Reporting
# =====================================================================================================================
def f2(x, d=2):
    return '-' if x is None or (isinstance(x, float) and math.isnan(x)) else f'{x:.{d}f}'


def iv(t, d=2):
    return f'[{f2(t[0], d)}, {f2(t[1], d)}]'


def est_str(e):
    if not e:
        return '-'
    if 'wilson_adj' in e:
        return f'{f2(e.get("p"))} {iv(e["wilson_adj"])} ({e.get("listeners", 0)} listeners, {e.get("trials", 0)} items)'
    if 'r' in e:
        return f'r = {f2(e["r"])} {iv(e["ci"])} ({e["listeners"]} listeners)'
    if 'mean' in e:
        return f'{f2(e["mean"], 3)} {iv(e["ci"], 3)}, one-sided bounds {f2(e.get("lo1"), 3)} / {f2(e.get("hi1"), 3)} (n = {e["n"]})'
    if 'gap' in e:
        return f'{f2(e["gap"], 3)} (se {f2(e["se"], 3)})'
    return str(e)


CONSEQUENCE = {
    'E1': {'PASS': 'number confirmation as designed is understood by older listeners on first hearing.',
           'FAIL': 'number confirmation must change before any pilot (slower read-back, repetition, WhatsApp written confirmation first).',
           'INCONCLUSIVE': 'not resolved; if the point estimate is below 0.75 treat as FAIL for product planning (panel-predictions 5).'},
    'E2': {'PASS': 'ship age-adaptive pace (slow for 60+ or on request), if P5 does not fail.',
           'WORSE': 'do not slow down; slower speech lowered comprehension.', 'INCONCLUSIVE': 'keep one pace; no evidence that slowing helps.'},
    'T1': {'PREFERRED': 'HD is worth testing in the cascade despite its extra first-byte time.',
           'NOT_PREFERRED': 'ship the neural voice (cheaper and faster).', 'INCONCLUSIVE': 'ship the neural voice; HD gives no demonstrated preference.'},
    'S1': {'PREFERRED': 'the fraud-safety line goes into every payment-link turn.', 'NOT_PREFERRED': 'drop the safety line (it costs 2-3 s).',
           'INCONCLUSIVE': 'no evidence either way; keep the line only if a pilot shows no drop-off.'},
}


def report(info, prefs, prefs_ch, prefs_turn, prefs_age, prefs_vendor, means, diffs, RV, sec, rpv, radj, verdicts, pvals, adj, bc, rt, comp, args):
    L = []
    w = L.append
    an, ls = info['analysed'], info['listeners']
    w('# Listener panel v2 results (renewal calls; regional language and dialect secondary)\n')
    w(f'Analysed {len(an)} of {len(ls)} completed listeners. Modes included: field, kiosk'
      + (', pilot' if args.include_pilot else '') + (', test' if args.include_test else '') + '. '
      + 'This panel is a screen of stated preference and comprehension, not an outcome test (protocol 1).\n')
    w('## Confirmatory family (Holm across E1, E2, T1, S1; one-sided; family alpha 0.05)\n')
    w('| id | question | verdict | estimate | p | Holm p | what it changes |')
    w('|---|---|---|---|---|---|---|')
    names = {'E1': 'older listeners (60+) understand the product-default renewal call (comprehension >= 0.80)',
             'E2': 'slowing to 0.85x improves 60+ comprehension (slow - default, within listener)',
             'T1': 'HD voice preferred to neural at equal pace (pooled renewal panels)',
             'S1': 'fraud-safety line makes the payment-link hand-off more trusted (pooled)'}
    for k in ('E1', 'E2', 'T1', 'S1'):
        v = RV[k]
        cons = CONSEQUENCE[k].get(v['verdict'], 'no verdict (too few listeners or no data)')
        w(f'| {k} | {names[k]} | **{v["verdict"]}**{" (" + v["note"] + ")" if v.get("note") else ""} | {est_str(v["est"])} | '
          f'{f2(v.get("p"), 4)} | {f2(v.get("p_holm"), 4)} | {cons} |')
    w(f'\nRules: {RV["E1"]["rule"]}. E2: {RV["E2"]["rule"]}. T1/S1: {RV["T1"]["rule"]}. No verdict below {MIN_LISTENERS} analysed listeners.\n')
    w('## Secondary predictions (intervals reported; never decide alone)\n')
    w('| prediction | result | estimate |')
    w('|---|---|---|')
    for k, v in sec.items():
        w(f'| {k} | {v["verdict"]} | {est_str(v["est"])} |')
    w('\n## Regional language and dialect matching (H6 rule from v1, on renewal turns)\n')
    w('| region | verdict | preference | patronising | comprehension | naturalness | reason |')
    w('|---|---|---|---|---|---|---|')
    for panel in REGION_PANELS:
        v = verdicts.get(panel)
        if v:
            w(f'| {panel} | **{v["verdict"]}** | {v["preference"]} | {v["patronising"]} | {v["comprehension"]} | {v["naturalness"]} | {v["why"]} |')
    og = verdicts.get('outgroup', {})
    if og.get('preference_for_bhojpuri') or og.get('trust_cost', {}).get('n'):
        p = og.get('preference_for_bhojpuri') or {}
        tc = og.get('trust_cost', {})
        w(f'\n**Out-group cost (D2):** non-Bhojpuri Hindi listeners chose the Bhojpuri mix in {f2(p.get("p", NAN))} of non-tie pairs '
          f'{iv(p.get("wilson_adj", (NAN, NAN)))}; trust difference (Bhojpuri - neutral) {f2(tc.get("mean", NAN))} {iv(tc.get("ci", (NAN, NAN)))}, n = {tc.get("n", 0)}.')
    if pvals:
        w('\n**Regional family, Holm-adjusted (one-sided):** ' + '; '.join(f'{k}: p = {f2(v, 4)}, adjusted {f2(adj.get(k, NAN), 4)}' for k, v in pvals.items()) + '\n')
    w('## Preference by panel and pair contrast (Block A)\n')
    w('Target = the first-named side ("ours" for ours-vs-human and ours-vs-competitor). Ties are dropped from p; the ties-split column counts each as half.\n')
    w('| panel | contrast | listeners | target / non-tie | ties | p | Wilson 95% | Wilson 95% adj. (DEFF) | bootstrap 95% | ties split | "clearly" | verdict |')
    w('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for r in prefs:
        w(f'| {r["panel"]} | {r["contrast"]} | {r["listeners"]} | {r["k"]} / {r["trials"]} | {r["ties"]} | {f2(r["p"])} | {iv(r["wilson"])} | '
          f'{iv(r["wilson_adj"])} ({f2(r["deff"], 1)}) | {iv(r["boot"])} | {f2(r["p_ties_split"])} | {f2(r["clearly_share"])} | {r["verdict"]} |')
    for title, tab in (('By channel (sensitivity)', prefs_ch), ('By turn (does any script reverse the direction?)', prefs_turn),
                       ('By age group (regional panels mix ages; renewal panels are age strata)', prefs_age),
                       ('Competitor arm by vendor', prefs_vendor)):
        if not tab:
            continue
        w(f'\n### {title}\n')
        w('| panel | contrast | by | target / non-tie | p | Wilson 95% adj. | verdict |')
        w('|---|---|---|---|---|---|---|')
        for r in tab:
            w(f'| {r["panel"]} | {r["contrast"]} | {r["by"]} | {r["k"]} / {r["trials"]} | {f2(r["p"])} | {iv(r["wilson_adj"])} | {r["verdict"]} |')
    w('\n## Ratings and comprehension by cell (Block B, first hearing)\n')
    w('Renewal panels: cell = voice tier and pace (or human). Regional panels: cell = register. Means of listener means with 95% t intervals; comprehension = share of 4-option questions answered correctly.\n')
    w('| panel | cell | naturalness (1-5) | trust (1-7) | fraud suspicion (1-7) | patronising (1-7) | accent fit (1-7) | continue (1-5) | comprehension | comp. Wilson adj. |')
    w('|---|---|---|---|---|---|---|---|---|---|')
    for r in means:
        cell = lambda m: f'{f2(r[m]["mean"])} {iv(r[m]["ci"])}' if r[m]['n'] else '-'
        w(f'| {r["panel"]} | {r["cell"]} | {cell("nat")} | {cell("trust")} | {cell("scam")} | {cell("patr")} | {cell("fit")} | {cell("cont")} | '
          f'{f2(r["comp"]["p"])} | {iv(r["comp"]["wilson_adj"])} |')
    w('\n### Within-listener differences used by the rules (first cell - second cell)\n')
    w('| panel | difference | measure | n | mean | 95% CI | one-sided bounds (lower / upper) |')
    w('|---|---|---|---|---|---|---|')
    wanted = [('neural-slow', 'neural-default'), ('hd-default', 'neural-default'), ('neural-default', 'human'), ('hd-slow', 'hd-default')] + \
             [(MATCHED.get(p, ''), NEUTRAL) for p in REGION_PANELS + ['outgroup']] + [('tamil_english', 'indian_english')]
    for (panel, tgt, oth), d in sorted(diffs.items(), key=lambda kv: PANEL_ORDER.index(kv[0][0]) if kv[0][0] in PANEL_ORDER else 9):
        if (tgt, oth) not in wanted:
            continue
        for m in ('comp', 'nat', 'trust', 'scam', 'patr', 'cont'):
            s = mean_ci(d.get(m, []))
            if s['n'] == 0: continue
            w(f'| {panel} | {tgt} - {oth} | {m} | {s["n"]} | {f2(s["mean"], 3)} | {iv(s["ci"], 3)} | {f2(s["lo1"], 3)} / {f2(s["hi1"], 3)} |')
    w('\n## H5 screen and Block C (human or computer)\n')
    for panel in PANEL_ORDER[:-1] + [None]:
        r = rm_corr(an, 'nat', 'cont', [panel] if panel else None)
        if r['listeners']:
            w(f'- {panel or "all panels"}: within-listener naturalness -> would continue r = {f2(r["r"])} {iv(r["ci"])}, {r["listeners"]} listeners')
    if bc:
        for panel, b in bc.items():
            w(f'- {panel} Block C: AUC (computer vs human) {f2(b["auc"])} {iv(b["auc_ci"])} (0.5 = could not tell); TTS judged "computer" '
              f'{f2(b["tts_judged_computer"]["p"])} {iv(b["tts_judged_computer"]["wilson_adj"])}; naturalness TTS {f2(b["nat_tts"]["mean"])} vs human '
              f'{f2(b["nat_human"]["mean"])}; continue TTS {f2(b["cont_tts"]["mean"])} vs human {f2(b["cont_human"]["mean"])}')
    else:
        w('- Block C was not run: no human reference recordings yet (protocol 3.6). H1-H3 and the AUC cannot be computed.')
    if not any(r['contrast'] == 'ours vs competitor' for r in prefs):
        w('- Competitor arm not run: no competitor clips captured yet (protocol 3.7). K1 and K2 cannot be scored; the panel compares our own variants only.')
    w('\n## Data quality and exclusions\n')
    for k, v in sorted(info['counts'].items()):
        w(f'- {k}: {v}')
    ex = Counter(r.split(' (')[0] for s in ls for r in s['_reasons'])
    w(f'- completed listeners: {len(ls)}; analysed: {len(an)}; excluded: {len(ls) - len(an)} ' + (f'({dict(ex)})' if ex else ''))
    cp, cn = Counter(), Counter()
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
    w(f'- audio stalls: {stalls}; cards re-shown after a resume: {sum(1 for s in ls for t in s["trials"] if t.get("after_resume"))}; '
      f'assisted (kiosk) sessions: {sum(1 for s in ls if s.get("assisted"))}; larger-text sessions: {sum(1 for s in ls if s.get("big"))}')
    for f in info['flags'] + info['problems']:
        w(f'- FLAG: {f}')
    if rt:
        w('\n### Test-retest (Block A repeated about a week later)\n')
        for panel, r in rt.items():
            w(f'- {panel}: same direction {r["direction"][0]}/{r["direction"][1]} {iv(r["direction"][2])}; identical answer {r["exact"][0]}/{r["exact"][1]} {iv(r["exact"][2])}')
    w('\n## Composition against the quotas (protocol 2.3)\n')
    w('| panel | n | women | village/town | below graduation | migrants | 45-59 | 60+ | 70+ | hearing difficulty | policy-holder household | renewal call in 12 months | quota misses |')
    w('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for panel, q in comp.items():
        w(f'| {panel} | {q["n"]} | {f2(q["women"])} | {f2(q["village_or_town"])} | {f2(q["below_graduation"])} | {f2(q["migrant"])} | '
          f'{f2(q["age_45_59"])} | {f2(q["age_60_plus"])} | {f2(q["age_70_plus"])} | {f2(q["hearing_difficulty"])} | {f2(q["policyholder_household"])} | '
          f'{f2(q["renewal_call_12m"])} | {", ".join(q["quota_misses"]) or "none"} |')
    return '\n'.join(L) + '\n'


def tidy_rows(info):
    for s in info['listeners']:
        scr = s.get('screen') or {}
        base = {'panel': s['panel'], 'pid': s['pid'], 'session_id': s['session_id'], 'excluded': int(bool(s['_reasons'])),
                'exclusion_reason': '; '.join(s['_reasons']), 'age': scr.get('age'), 'age_group': s.get('_age'), 'gender': scr.get('gender'),
                'place': scr.get('place'), 'edu': scr.get('edu'), 'migrant': int(migrant(scr)), 'device': scr.get('device'),
                'hearing': scr.get('hearing'), 'policy': scr.get('policy'), 'rcall': scr.get('rcall'), 'ui_lang': s.get('ui_lang'),
                'assisted': int(bool(s.get('assisted'))), 'big': int(bool(s.get('big')))}
        for t in s['trials']:
            r = dict(base, block=t.get('block'), pos=t.get('pos'), kind=t.get('kind'), turn=t.get('turn'), channel=t.get('ch'))
            if t.get('kind') == 'pair' and '_a' in t and '_b' in t:
                contrast, a_t = classify_pair(t['_a'], t['_b'])
                side, strength = choice_side(t.get('choice'))
                r.update(contrast=contrast, question=t.get('q', ''), item=f'{t.get("turn")}|{t["_a"]["voice"]}', choice=t.get('choice'),
                         chosen_target='' if side in (None, 'tie') else int((side == 'a') == a_t), strength=strength,
                         clip_a=t['a'], cell_a=cell_of(t['_a'], s['_kind']), voice_a=t['_a']['voice'], register_a=t['_a'].get('register'),
                         clip_b=t['b'], cell_b=cell_of(t['_b'], s['_kind']), voice_b=t['_b']['voice'], register_b=t['_b'].get('register'))
            elif t.get('kind') == 'identical':
                r.update(choice=t.get('choice'), clip_a=t.get('a'), clip_b=t.get('b'))
            else:
                c = t.get('_clip', {})
                r.update(clip=t.get('clip'), cell=cell_of(c, s['_kind']) if c else ('degraded' if t.get('kind') == 'degraded' else ''),
                         register=c.get('register', ''), voice=c.get('voice', ''), tier=c.get('tier', ''), pace=c.get('pace', ''),
                         source=c.get('source', ''), item=f'{t.get("turn")}|{c.get("voice", "")}',
                         nat=t.get('nat'), trust=t.get('trust'), scam=t.get('scam'), patr=t.get('patr'), fit=t.get('fit'), cont=t.get('cont'),
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
        print(f'- {panel}: completed {len(ls)}, passing exclusions {len(ok)}, excluded {dict(cat) or 0}'
              + (f', median session {statistics.median(dur):.1f} min' if dur else ''))
    for f in info['flags'] + info['problems']:
        print('- FLAG:', f)
    print('\n| panel | n | women | village/town | below graduation | 60+ | 70+ | hearing difficulty | policy-holders | quota misses |')
    print('|---|---|---|---|---|---|---|---|---|---|')
    for panel, q in composition(info['listeners']).items():
        print(f'| {panel} | {q["n"]} | {f2(q["women"])} | {f2(q["village_or_town"])} | {f2(q["below_graduation"])} | {f2(q["age_60_plus"])} | '
              f'{f2(q["age_70_plus"])} | {f2(q["hearing_difficulty"])} | {f2(q["policyholder_household"])} | {", ".join(q["quota_misses"]) or "none"} |')
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
    prefs = pref_table(an, args.boot, rng, pooled=True)
    prefs_ch = pref_table(an, 0, rng, by=lambda t: {'ph': 'phone', 'wb': 'wideband'}.get(t.get('ch'), t.get('ch')), pooled=True)
    prefs_turn = pref_table(an, 0, rng, by=lambda t: t.get('turn'), pooled=True)
    prefs_age = [r for r in pref_table(an, 0, rng, by=lambda t: t.get('_age')) if r['panel'] not in RENEWAL_PANELS]
    vendor = lambda t: (t['_b'] if (t['_a'].get('source') or 'tts') == 'tts' else t['_a']).get('voice', '?')
    prefs_vendor = [r for r in pref_table(an, 0, rng, by=vendor, pooled=True) if r['contrast'] == 'ours vs competitor']
    means, diffs, per = rating_tables(an)
    RV, sec, rpv, radj = renewal_verdicts(prefs, per, diffs, an)
    verdicts, pvals, adj = region_verdicts(prefs, diffs, args.p_correct_inference)
    bc = blockc_stats(an, args.boot, rng)
    if bc:
        for panel, b in bc.items():
            sec[f'H2 Block C AUC ({panel})'] = {'verdict': 'lower bound > 0.6' if b['auc_ci'][0] > 0.6 else 'lower bound <= 0.6',
                                                'est': {'mean': b['auc'], 'ci': b['auc_ci'], 'n': len([s for s in an if s['panel'] == panel])}}
    rt = retest_stats(info)
    comp = composition(info['listeners'])
    md = report(info, prefs, prefs_ch, prefs_turn, prefs_age, prefs_vendor, means, diffs, RV, sec, rpv, radj, verdicts, pvals, adj, bc, rt, comp, args)
    results = {'confirmatory': RV, 'secondary': sec, 'regional_verdicts': verdicts, 'regional_pvals': pvals, 'regional_holm': adj,
               'preference': prefs, 'preference_by_channel': prefs_ch, 'preference_by_turn': prefs_turn, 'preference_by_age': prefs_age,
               'preference_by_vendor': prefs_vendor, 'ratings': means, 'blockc': bc, 'retest': rt, 'composition': comp,
               'n_listeners': len(info['listeners']), 'n_analysed': len(an), 'flags': info['flags'], 'problems': info['problems']}
    if not quiet:
        print(md)
    return md, results, info


# =====================================================================================================================
# Power simulation (protocol 5) and self-test
# =====================================================================================================================
def expit(x): return 1 / (1 + math.exp(-x))
def logit(p): return math.log(p / (1 - p))


def sim_pref_once(rng, n, k, p, sd_u, sd_item=0.3, tie=0.15, rule=None):
    items = [rng.gauss(0, sd_item) for _ in range(8)]
    mu = logit(p)
    pairs = []
    for _ in range(n):
        u = rng.gauss(mu, sd_u)
        y = m = 0
        for j in range(k):
            if rng.random() < tie:
                continue
            m += 1
            y += rng.random() < expit(u + items[(j + rng.randrange(8)) % 8])
        pairs.append((y, m))
    return (rule or preference_verdict)(cluster_prop(pairs))


def sim_comp_listener(rng, u, items, n_items):
    return sum(rng.random() < expit(u + items[rng.randrange(len(items))]) for _ in range(n_items))


def sim_floor_once(rng, n, acc, n_items, sd_u=0.8, sd_item=0.5):
    items = [rng.gauss(0, sd_item) for _ in range(16)]
    pairs = []
    for _ in range(n):
        u = rng.gauss(logit(acc), sd_u)
        pairs.append((sim_comp_listener(rng, u, items, n_items), n_items))
    return floor_verdict(cluster_prop(pairs))


def sim_sup_once(rng, n, acc, gain, n_items, sd_u=0.8, sd_item=0.5, sd_gain=0.3):
    items = [rng.gauss(0, sd_item) for _ in range(16)]
    diffs = []
    for _ in range(n):
        u = rng.gauss(logit(acc), sd_u)
        g = logit(min(0.99, acc + gain)) - logit(acc) + rng.gauss(0, sd_gain)
        a = sim_comp_listener(rng, u + g, items, n_items) / n_items
        b = sim_comp_listener(rng, u, items, n_items) / n_items
        diffs.append(a - b)
    return superiority_verdict(diffs)[0]


def sim_diff_once(rng, n, clips_a, clips_b, true_diff, sd_slope, sd_resid, margin, higher_is_worse):
    diffs = []
    for _ in range(n):
        slope = true_diff + rng.gauss(0, sd_slope)
        a = statistics.mean(rng.gauss(slope, sd_resid) for _ in range(clips_a))
        b = statistics.mean(rng.gauss(0, sd_resid) for _ in range(clips_b))
        diffs.append(a - b)
    return ni_verdict(diffs, margin, higher_is_worse)[0]


def power(args):
    rng = random.Random(args.seed)
    S = args.sims
    print(f'# Power simulation, panel v2 (seed {args.seed}, {S} simulated panels per cell)\n')
    print('Assumptions (the pilot measures them; re-run before freezing): per-listener logit ability sd 0.8 and item (question) '
          'sd 0.5 for comprehension; per-listener logit preference sd 0.5 or 1.0, item sd 0.3, 15% "no difference" answers; '
          'rating slopes sd 0.6 and residual sd 1.3 (7-point). Verdicts come from the same functions the analysis uses.\n')
    print('## E1 comprehension floor (60+ panel; 3 neural-default cards x 2 questions = 6 items per listener)\n')
    ns = [36, 48, 60]
    print('| true accuracy | ' + ' | '.join(f'n={n} P(PASS) / P(FAIL)' for n in ns) + ' |')
    print('|---|' + '---|' * len(ns))
    for acc in (0.65, 0.70, 0.75, 0.80, 0.85, 0.90):
        cells = []
        for n in ns:
            c = Counter(sim_floor_once(rng, n, acc, 6) for _ in range(S))
            cells.append(f'{c["PASS"] / S:.2f} / {c["FAIL"] / S:.2f}')
        print(f'| {acc:.2f} | ' + ' | '.join(cells) + ' |')
    print('\n## E2 slow-pace superiority (60+; 6 slow vs 6 default items per listener; baseline 0.78)\n')
    print('| true gain | ' + ' | '.join(f'n={n} P(PASS)' for n in ns) + ' |')
    print('|---|' + '---|' * len(ns))
    for gain in (0.0, 0.05, 0.08, 0.10, 0.15):
        cells = []
        for n in ns:
            c = Counter(sim_sup_once(rng, n, 0.78, gain, 6) for _ in range(S))
            cells.append(f'{c["PASS"] / S:.2f}')
        print(f'| +{gain:.2f} | ' + ' | '.join(cells) + ' |')
    print('\n## Pair preferences (PREFERRED / NOT_PREFERRED shares)\n')
    configs = [('T1 HD vs neural, pooled renewal panels', 4, [60, 84, 96]), ('S1 safety vs plain, pooled', 2, [60, 84, 96]),
               ('E3 slow vs default, 60+', 3, [36, 48, 60]), ('L1 Tamil vs Hinglish (5 pairs)', 5, [30, 36, 48]),
               ('L4 Marathi vs Hinglish / D1 Bhojpuri (8 pairs)', 8, [24, 30, 36])]
    for name, k, nn in configs:
        print(f'### {name}: {k} pairs per listener\n')
        print('| true p | sd_u | ' + ' | '.join(f'n={n}' for n in nn) + ' |')
        print('|---|---|' + '---|' * len(nn))
        for sd_u in (0.5, 1.0):
            for p in (0.50, 0.58, 0.65, 0.70):
                cells = []
                for n in nn:
                    c = Counter(sim_pref_once(rng, n, k, p, sd_u) for _ in range(S))
                    cells.append(f'P {c["PREFERRED"] / S:.2f} / K {c["NOT_PREFERRED"] / S:.2f}')
                print(f'| {p:.2f} | {sd_u} | ' + ' | '.join(cells) + ' |')
        print('')
    print('### K1 ours vs competitor (pooled renewal panels, about 1 pair per listener per vendor; 3 per listener over all vendors)\n')
    print('| true p(ours) | ' + ' | '.join(f'{lab}' for lab in ('1 pair, n=84', '3 pairs, n=84')) + ' |')
    print('|---|---|---|')
    for p in (0.30, 0.42, 0.50, 0.58, 0.70):
        cells = []
        for k in (1, 3):
            c = Counter(sim_pref_once(rng, 84, k, p, 0.5, rule=sym_verdict) for _ in range(S))
            cells.append(f'ours {c["OURS_PREFERRED"] / S:.2f} / other {c["OTHER_PREFERRED"] / S:.2f}')
        print(f'| {p:.2f} | ' + ' | '.join(cells) + ' |')
    print('\n## Non-inferiority, P(PASS) when there is no difference / P(FAIL) when clearly worse\n')
    print('| test | n | no difference: P(PASS) | clearly worse: P(FAIL) |')
    print('|---|---|---|---|')
    for label, n, ca, cb, worse, sd_s, sd_r, margin, hiw in [
            ('P5 patronising slow vs default, 60+ (3 vs 3 cards; worse = +1.0)', 48, 3, 3, 1.0, 0.6, 1.3, NI_PATRONISING, True),
            ('P5 same, 18-59', 36, 3, 3, 1.0, 0.6, 1.3, NI_PATRONISING, True),
            ('regional patronising (4 vs 4 cards)', 36, 4, 4, 1.0, 0.6, 1.3, NI_PATRONISING, True),
            ('regional naturalness (4 vs 4; worse = -0.6)', 36, 4, 4, -0.6, 0.3, 0.9, NI_NATURALNESS, False)]:
        cp_ = Counter(sim_diff_once(rng, n, ca, cb, 0.0, sd_s, sd_r, margin, hiw) for _ in range(max(200, S // 2)))
        cf_ = Counter(sim_diff_once(rng, n, ca, cb, worse, sd_s, sd_r, margin, hiw) for _ in range(max(200, S // 2)))
        print(f'| {label} | {n} | {cp_["PASS"] / sum(cp_.values()):.2f} | {cf_["FAIL"] / sum(cf_.values()):.2f} |')
    print('')


def load_plan(panel):
    txt = open(os.path.join(HERE, 'plans', f'{panel}.js'), encoding='utf-8').read()
    return json.loads(txt[txt.index('(') + 1: txt.rindex(')')])


SCREEN_FOR = {'hindi_60plus': ('up', 'hindi', 'hindi', ['60-69', '70+']), 'hindi_18to59': ('mp', 'hindi', 'hindi', ['18-29', '30-44', '45-59']),
              'bihar': ('bihar', 'bhojpuri', 'bhojpuri', ['18-29', '45-59', '60-69']), 'outgroup': ('delhi', 'hindi', 'hindi', ['18-29', '30-44', '60-69']),
              'tamilnadu': ('tamilnadu', 'tamil', 'tamil', ['18-29', '45-59', '60-69']), 'maharashtra': ('maharashtra', 'marathi', 'marathi', ['30-44', '60-69', '70+'])}


def synth_sessions(panel, n, truth, man, rng):
    """Emulate the page's export for n listeners with known effects, using the real schedules and manifests.
    truth keys: acc (per-cell comprehension), pref (per-contrast target probability), nat_shift (per-cell), patr_shift."""
    plan = load_plan(panel)
    kind = plan.get('kind', 'register')
    out = []
    scr = SCREEN_FOR[panel]
    for num in range(1, n + 1):
        sch = plan['schedules'][num - 1]
        u_pref = {c: rng.gauss(logit(p), 0.5) for c, p in truth.get('pref', {}).items()}
        u_acc = rng.gauss(0, 0.6)
        sid = f'synth-{panel}-{num}'
        tr, clock = [], 1000
        for pos, e in enumerate(sch.get('C', [])):
            row = man.get(e[1], {})
            human = (row.get('source') or 'tts') == 'human'
            judged_h = rng.random() < (truth.get('p_judged_human_if_human', 0.7) if human else truth.get('p_judged_human_if_tts', 0.3))
            t = {'block': 'C', 'pos': pos, 'kind': 'human_or_ai', 't_shown': clock, 'plays': 1, 'stalls': 0, 'clip': e[1], 'ch': 'ph',
                 'turn': plan['clips'][e[1]]['t'], 'hai': 'human' if judged_h else 'computer', 'conf': rng.choice([1, 2, 3]),
                 'nat': rng.choice([3, 4, 5]) if human else rng.choice([2, 3, 4]), 'cont': rng.choice([3, 4]), 't_play': clock + 300,
                 't_end': clock + 12000, 't_answer': clock + 20000}
            clock = t['t_answer']
            tr.append(t)
        for pos, e in enumerate(sch['B']):
            code = e[1]
            row = man.get(code, {})
            cell = cell_of(row, kind) if row else 'degraded'
            t = {'block': 'B', 'pos': pos, 'kind': 'rate' if e[0] == 'r' else 'degraded', 't_shown': clock, 'plays': 1, 'stalls': 0,
                 'clip': code, 'ch': 'ph', 'turn': plan['clips'][code]['t'], 'attn_row': e[2] if e[0] == 'r' else 0,
                 't_play': clock + 500, 't_end': clock + 13000}
            acc = truth.get('acc', {}).get(cell, truth.get('acc', {}).get('*', 0.85))
            pa = expit(logit(acc) + u_acc)
            nat = 1 if e[0] == 'd' else max(1, min(5, round(rng.gauss(3.6 + truth.get('nat_shift', {}).get(cell, 0), 0.8))))
            t.update(q1='a' if rng.random() < pa else 'c', q2='a' if rng.random() < pa else 'b', nat=nat,
                     trust=max(1, min(7, round(rng.gauss(4.5, 1.2)))), scam=max(1, min(7, round(rng.gauss(3.5, 1.4)))),
                     patr=max(1, min(7, round(rng.gauss(2.5 + truth.get('patr_shift', {}).get(cell, 0), 1.2)))),
                     cont=max(1, min(5, nat + rng.choice([-1, 0, 0, 1]))))
            if kind != 'renewal':
                t['fit'] = max(1, min(7, round(rng.gauss(5 if cell == MATCHED.get(panel) else 4, 1.2))))
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
                contrast, a_t = classify_pair(man[e[2]], man[e[3]])
                pt = expit(u_pref[contrast]) if contrast in u_pref else 0.5
                if rng.random() < 0.15:
                    ch = '0'
                else:
                    hit = rng.random() < pt
                    ch = ('A' if hit == a_t else 'B') + rng.choice('12')
                t.update(pair=e[1], a=e[2], b=e[3], ch=e[4], q=e[5] if len(e) > 5 else '', turn=plan['clips'][e[2]]['t'], choice=ch)
            t.update(t_play=clock + 300, t_end=clock + 27000, t_answer=clock + 31000)
            clock = t['t_answer']
            tr.append(t)
        s = {'schema': 'vpl-answers/2', 'session_id': sid, 'panel': panel, 'pid': f'{plan["prefix"]}{num:03d}', 'pid_num': num,
             'mode': 'field', 'retest': False, 'ui_lang': 'en', 'complete': True, 'end_reason': None,
             'screen': {'age': rng.choice(scr[3]), 'gender': rng.choice(['woman', 'man']), 'home_state': scr[0],
                        'home_district': 'x', 'cur_state': scr[0] if rng.random() < 0.75 else 'delhi', 'place': rng.choice(['village', 'town', 'city']),
                        'mt': scr[1], 'home_lang': scr[2], 'other_langs': ['english'], 'edu': rng.choice(['lt10', '10-12', 'grad']),
                        'phone': 'android', 'device': 'wired', 'hearing': rng.choice(['none', 'none', 'some']), 'policy': rng.choice(['yes', 'yes', 'no']),
                        'rcall': rng.choice(['yes', 'no']), 'work': 'no', 'know': 'no', 'before': 'no'},
             'check': {'rounds': [], 'pass': True}, 'trials': tr, 'open_text': '', 'finished_at': f'2026-11-01T10:{num % 60:02d}:00Z',
             'device_id': f'dev-{panel}-{num}'}
        s['checksum'] = fnv1a_utf16(canonical(s))
        out.append(s)
    return out


def selftest(args):
    man = load_manifest(args.manifest, args.external)
    rng = random.Random(args.seed)
    truth = {
        'hindi_60plus': {'acc': {'neural-default': 0.66, 'neural-slow': 0.82, '*': 0.75}, 'pref': {'hd vs neural': 0.75, 'safety vs plain': 0.5, 'slow vs default': 0.6}},
        'hindi_18to59': {'acc': {'*': 0.93}, 'pref': {'hd vs neural': 0.75, 'safety vs plain': 0.5, 'slow vs default': 0.4}},
        'tamilnadu': {'pref': {'tamil_english vs neutral_hinglish': 0.80, 'tamil_english vs indian_english': 0.55}},
        'maharashtra': {'pref': {'marathi_mix vs neutral_hinglish': 0.66}, 'nat_shift': {'marathi_mix': -0.9}},
        'bihar': {'pref': {'bhojpuri_mix vs neutral_hinglish': 0.50}},
        'outgroup': {'pref': {'bhojpuri_mix vs neutral_hinglish': 0.30}},
    }
    sizes = {'hindi_60plus': 48, 'hindi_18to59': 36, 'tamilnadu': 36, 'maharashtra': 36, 'bihar': 30, 'outgroup': 24}
    sessions = []
    for panel, tr in truth.items():
        sessions += synth_sessions(panel, sizes[panel], tr, man, rng)
    sp = sessions[0]                      # a speeder and a catch-failer in hindi_60plus
    for t in sp['trials']:
        if t['block'] == 'B': t['t_answer'] = t['t_end'] + 2000
    sp['checksum'] = fnv1a_utf16(canonical(sp))
    cf = sessions[1]
    for t in cf['trials']:
        if t['kind'] == 'identical': t['choice'] = 'A2'
        if t['kind'] == 'degraded': t['nat'] = 5
    cf['checksum'] = fnv1a_utf16(canonical(cf))
    code = 'VPL1z.' + base64.urlsafe_b64encode(gzip.compress(json.dumps(sessions[5]).encode())).decode().rstrip('=')
    assert decode_code(code)['session_id'] == sessions[5]['session_id']
    args.include_pilot = args.include_test = False
    md, res, info = run_analysis(sessions, man, args, quiet=True)
    C, R = res['confirmatory'], res['regional_verdicts']
    checks = [
        ('E1: 60+ accuracy 0.66 on neural default -> FAIL or INCONCLUSIVE, never PASS', C['E1']['verdict'] in ('FAIL', 'INCONCLUSIVE')),
        ('E2: slow +16 points at 60+ -> PASS', C['E2']['verdict'] == 'PASS'),
        ('T1: p(HD) 0.75 -> PREFERRED', C['T1']['verdict'] == 'PREFERRED'),
        ('S1: p(safety) 0.50 -> not PREFERRED', C['S1']['verdict'] != 'PREFERRED'),
        ('E1b: 18-59 accuracy 0.93 -> PASS', res['secondary']['E1b 18-59 comprehension floor']['verdict'] == 'PASS'),
        ('Tamil Nadu p = 0.80 vs Hinglish -> PREFERRED', R['tamilnadu']['preference'] == 'PREFERRED'),
        ('Maharashtra naturalness -0.9 -> KILL (not producible)', R['maharashtra']['verdict'] == 'KILL' and R['maharashtra']['naturalness'] == 'FAIL'),
        ('Bihar p = 0.50 -> not ADOPT', R['bihar']['verdict'] != 'ADOPT'),
        ('Out-group p = 0.30 -> estimate below 0.5', (R['outgroup']['preference_for_bhojpuri'] or {}).get('p', 1) < 0.5),
        ('speeder excluded', any('speeding' in r for r in sp['_reasons'])),
        ('catch failer excluded', any('catch' in r for r in cf['_reasons'])),
        ('no checksum flags on untouched sessions', not any('checksum' in f for f in res['flags'])),
        (f'analysed = {sum(sizes.values())} - 2', res['n_analysed'] == sum(sizes.values()) - 2),
        ('no clip missing from the manifests', not res['problems']),
    ]
    ok = all(c for _, c in checks)
    for name, c in checks:
        print(('PASS ' if c else 'FAIL ') + name)
    print('\n' + md[:3000] + '\n...')
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('inputs', nargs='*', help='answer files or folders (.json, .csv, or text containing answer codes)')
    ap.add_argument('--manifest', default=DEFAULT_MANIFEST)
    ap.add_argument('--external', default=DEFAULT_EXTERNAL, help='human and competitor clips (written by ingest_external.py)')
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
    man = load_manifest(a.manifest, a.external)
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
