#!/usr/bin/env python3
"""Build the listener-panel v2 schedules, the degraded catch clips and the assignment log (protocol v2.0).

This file is the single source of truth for who hears what. The page (app.js) only executes a schedule; it never
decides one. Every schedule is a pure function of (SEED, panel, pid number, the clip inventory), so the assignment is
reproducible and logged (plans/schedules.csv) before anyone listens. Python 3.9+, stdlib only; ffmpeg for catch clips.

Usage (run from anywhere):
  python3 build_plan.py                    pilot build: clips not yet listen-checked are allowed (warned)
  python3 build_plan.py --field            field build: every clip used must be status=use in stimuli-qa.csv
  python3 build_plan.py --qa-sheet         (re)write stimuli-qa.csv from the manifests, keeping any human decisions
  python3 build_plan.py --links hindi_60plus 1 56 --base https://HOST/listener-panel/   one link per pid, as CSV
  python3 build_plan.py --bundle OUT_DIR   copy only what a web host needs (no manifest, no texts, no condition key)

Human-reference and competitor clips (protocol 3.6, 3.7) enter through
../lanes/l8-azure-bench/stimuli-round2/manifest-external.csv, written by ingest_external.py. When they exist, the
renewal panels use them automatically: Block C (human or computer), the X cell of Block B (human instead of HD slow),
and the human and competitor pairs in Block A. Rebuild after every ingest.

Blinding: plans/*.js carry file codes, turn ids and opaque pair ids only. Condition labels live in the manifests, which
must never be uploaded with the page (use --bundle). analysis.py joins conditions back from the manifests.
"""
import argparse, csv, hashlib, json, os, random, shutil, subprocess, sys, datetime
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
STIM_REL = '../lanes/l8-azure-bench/stimuli-round2/'     # relative to this folder; the page uses the same prefix
STIM_DIR = os.path.normpath(os.path.join(HERE, STIM_REL))
MANIFEST = os.path.join(STIM_DIR, 'manifest.csv')
EXTERNAL = os.path.join(STIM_DIR, 'manifest-external.csv')
QA_FILE = os.path.join(HERE, 'stimuli-qa.csv')
PLANS = os.path.join(HERE, 'plans')
CATCH = os.path.join(HERE, 'catch')
SEED = 20261017
N_SCHEDULES = 160                     # pids 1..160 per panel; recruit far fewer (protocol 5)
PLAN_VERSION = '2.0.0'
R_TURNS = [f'R{i}' for i in range(1, 9)]
C_TURNS = ['C1', 'C2', 'C3', 'C4']
SW, MA = 'hi-IN-SwaraNeural', 'hi-IN-MadhurNeural'
ME, AR = 'en-IN-Meera:DragonHDLatestNeural', 'en-IN-Arjun:DragonHDLatestNeural'
NEURAL = {'F': SW, 'M': MA}
HD = {'F': ME, 'M': AR}

# Block B cell sequence for the renewal panels: position p = (turn index + row) mod 8. Nd/Ns = neural default/slow,
# Hd = HD default, X = human reference if it exists for that turn and gender, else HD slow (protocol 4.2).
RENEWAL_SEQ = ['Nd', 'Ns', 'Nd', 'Ns', 'Nd', 'Ns', 'Hd', 'X']
RENEWAL_GSEQ = list('FMFFMFMM')   # searched: Nd and Ns cards are never all one gender within a listener

PANELS = {
    'hindi_60plus': dict(kind='renewal', stim='hindi', prefix='E', lang='hi', age='60+',
                         degraded=('R1', 'neutral_hinglish', SW)),
    'hindi_18to59': dict(kind='renewal', stim='hindi', prefix='H', lang='hi', age='18-59',
                         degraded=('R1', 'neutral_hinglish', SW)),
    'tamilnadu': dict(kind='register', stim='tamilnadu', prefix='T', lang='ta', matched='tamil_english',
                      conds=['tamil_english', 'indian_english', 'neutral_hinglish'], bvoices=[ME, AR],
                      contrasts=[('tamil_english', 'neutral_hinglish', 5), ('tamil_english', 'indian_english', 5)],
                      voice_contrasts=[('tamil_english', [('ta-IN-PallaviNeural', ME), ('ta-IN-ValluvarNeural', AR)], 2)],
                      degraded=('R1', 'tamil_english', ME)),
    'maharashtra': dict(kind='register', stim='maharashtra', prefix='M', lang='mr', matched='marathi_mix',
                        conds=['marathi_mix', 'neutral_hinglish'], bvoices=['en-IN-AartiIndicNeural', 'en-IN-ArjunIndicNeural'],
                        contrasts=[('marathi_mix', 'neutral_hinglish', 8)],
                        voice_contrasts=[('marathi_mix', [('mr-IN-AarohiNeural', 'en-IN-AartiIndicNeural'),
                                                          ('mr-IN-ManoharNeural', 'en-IN-ArjunIndicNeural')], 2)],
                        degraded=('R1', 'marathi_mix', 'en-IN-AartiIndicNeural')),
    'bihar': dict(kind='register', stim='bihar', prefix='B', lang='hi', matched='bhojpuri_mix', optional=True,
                  conds=['neutral_hinglish', 'bhojpuri_mix'], bvoices=[SW, MA],
                  contrasts=[('bhojpuri_mix', 'neutral_hinglish', 8)], voice_contrasts=[],
                  degraded=('R1', 'neutral_hinglish', MA)),
    'outgroup': dict(kind='register', stim='bihar', prefix='O', lang='hi', matched='bhojpuri_mix', optional=True,
                     conds=['neutral_hinglish', 'bhojpuri_mix'], bvoices=[SW, MA],
                     contrasts=[('bhojpuri_mix', 'neutral_hinglish', 8)], voice_contrasts=[],
                     degraded=('R1', 'neutral_hinglish', MA)),
}
QA_COLS = ['file_code', 'stim_sets', 'turn', 'register', 'script', 'source', 'tier', 'voice', 'pace', 'qa_auto', 'qa_detail',
           'status', 'listen_for', 'note', 'checked_by', 'checked_at']


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def load_rows():
    rows = [r for r in csv.DictReader(open(MANIFEST, encoding='utf-8')) if not r.get('superseded')]
    if os.path.exists(EXTERNAL):
        rows += [r for r in csv.DictReader(open(EXTERNAL, encoding='utf-8')) if not r.get('superseded')]
    for r in rows:
        r['duration_s'] = float(r['duration_s'])
        r.setdefault('pace', 'default'); r.setdefault('script', 'plain')
    return rows


def listen_for(r):
    tok = json.loads(r.get('key_tokens') or '[]')
    what = {'ai_disclosure': 'the AI-assistant disclosure', 'due_date': 'the due date', 'premium': 'the premium amount',
            'sum_insured': '"5 lakh"', 'vehicle_digits': 'the four vehicle-number digits', 'expiry': 'the expiry date',
            'expired_on': 'the expiry date', 'missed_instalment': 'the date of the missed instalment', 'revival_amount': 'the revival amount',
            'late_fee': 'the late fee', 'deadline': 'the deadline date', 'callback_hour': 'the callback time',
            'whatsapp': '"WhatsApp"', 'link_hours': '"24 hours"', 'otp': 'the OTP safety sentence', 'instalment': 'the instalment amount',
            'next_due': 'the next due date', 'phone_last4': 'the four phone digits', 'hour': 'the time', 'age': 'the age'}
    return '; '.join(what.get(t, t) for t in tok) + '; overall: every word clear, no glitch, natural for a phone call'


def qa_sheet(rows):
    """stimuli-qa.csv: one row per active clip. Keeps any human decision already entered (status/checked_by/note)."""
    old = {r['file_code']: r for r in csv.DictReader(open(QA_FILE, encoding='utf-8'))} if os.path.exists(QA_FILE) else {}
    out = []
    for r in sorted(rows, key=lambda x: (x['stim_sets'], x['turn'], x.get('register', ''), x.get('script', ''), x['voice'], x.get('pace', ''))):
        o = old.get(r['file_code'], {})
        human = o.get('status') in ('use', 'exclude')
        default = 'exclude_auto' if r.get('qa_auto') == 'fail' else 'unchecked'
        note = o.get('note') or ('automatic number check failed; listen before any use' if r.get('qa_auto') == 'fail' else
                                 'automatic check could not confirm a token; listen closely' if r.get('qa_auto') == 'needs_listen' else '')
        out.append({'file_code': r['file_code'], 'stim_sets': r['stim_sets'], 'turn': r['turn'], 'register': r.get('register', ''),
                    'script': r.get('script', ''), 'source': r.get('source', 'tts'), 'tier': r.get('tier', ''), 'voice': r['voice'],
                    'pace': r.get('pace', ''), 'qa_auto': r.get('qa_auto', ''), 'qa_detail': r.get('qa_detail', ''),
                    'status': o['status'] if human else default, 'listen_for': listen_for(r), 'note': note,
                    'checked_by': o.get('checked_by', '') if human else '', 'checked_at': o.get('checked_at', '') if human else ''})
    with open(QA_FILE, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=QA_COLS); w.writeheader(); w.writerows(out)
    return {r['file_code']: r for r in out}


def load_qa(rows):
    if not os.path.exists(QA_FILE):
        return qa_sheet(rows)
    qa = {r['file_code']: r for r in csv.DictReader(open(QA_FILE, encoding='utf-8'))}
    missing = [r['file_code'] for r in rows if r['file_code'] not in qa]
    if missing:
        print(f'note: {len(missing)} clips not in stimuli-qa.csv yet; adding them (status unchecked)')
        qa = qa_sheet(rows)
    return qa


class Stim:
    """Valid clips for one stimulus set, indexed by (turn, register, script, voice, pace) and by external source."""

    def __init__(self, name, rows, qa, field, warn):
        self.name = name
        self.by_key, self.rows, self.ext = {}, {}, {'human': {}, 'competitor': {}}
        for r in rows:
            if name not in r['stim_sets'].split('|'):
                continue
            q = qa.get(r['file_code'], {})
            status = (q.get('status') or 'unchecked').strip()
            if status in ('exclude', 'exclude_auto'):
                continue
            if status != 'use':
                if field:
                    warn.append(f'FIELD BUILD BLOCKED: {r["file_code"]} ({name}) is "{status}" in stimuli-qa.csv')
                    continue
                warn.append(f'pilot: {r["file_code"]} not yet listen-checked')
            for p in (r['phone_mp3'], r.get('wideband_mp3') or r['phone_mp3']):
                if not os.path.exists(os.path.join(STIM_DIR, p)):
                    sys.exit(f'audio file missing: {os.path.join(STIM_DIR, p)}')
            self.rows[r['file_code']] = r
            src = r.get('source', 'tts')
            if src == 'tts':
                self.by_key[(r['turn'], r['register'], r['script'], r['voice'], r['pace'])] = r['file_code']
            else:
                g = r.get('gender', '')
                self.ext[src].setdefault((r['turn'], g), []).append(r['file_code'])
        for k in self.ext:
            for v in self.ext[k].values():
                v.sort()

    def code(self, turn, reg, voice, pace='default', script='plain'):
        return self.by_key.get((turn, reg, script, voice, pace))

    def voices(self, reg=None):
        return sorted({k[3] for k in self.by_key if reg is None or k[1] == reg})


def balanced_pick(items_by_turn, quota, r, offset):
    """Pick `quota` (turn, item) entries spread evenly over turns, rotating turns and items with row r."""
    turns = [t for t in R_TURNS if items_by_turn.get(t)]
    total = sum(len(items_by_turn[t]) for t in turns)
    if not turns:
        return []
    if quota >= total:
        return [(t, v) for t in turns for v in items_by_turn[t]]
    base, rem = divmod(quota, len(turns))
    start = (r * max(quota, 1) + offset * 3) % len(turns)
    extra = {turns[(start + j) % len(turns)] for j in range(rem)}
    out = []
    for ti, t in enumerate(turns):
        pool = items_by_turn[t]
        n = min(len(pool), base + (1 if t in extra else 0))
        for j in range(n):
            out.append((t, pool[(ti + r + offset + j) % len(pool)]))
    return out


def adjacent_turn_clash(seq, turn_of):
    return any(turn_of(a) == turn_of(b) for a, b in zip(seq, seq[1:]))


def finish_block_a(A, r, rng, stim):
    for i, e in enumerate(A):                                  # about a quarter of pairs on the wideband channel
        ext = any(stim.rows[c].get('source', 'tts') == 'competitor' for c in e[2:4])
        if (i + r) % 4 == 0 and not ext:                       # competitor captures are 16 kHz WebRTC: phone band only
            e[4] = 'wb'
    pool_codes = sorted({c for e in A if e[0] == 'p' for c in (e[2], e[3]) if stim.rows[c].get('source', 'tts') == 'tts'})
    A.insert(rng.randint(1, max(1, len(A) - 1)), ['i', rng.choice(pool_codes), 'ph'])   # identical-clip catch pair
    turn_of = lambda e: stim.rows[e[2] if e[0] == 'p' else e[1]]['turn']
    best = A[:]
    for _ in range(5000):
        rng.shuffle(A)
        if not adjacent_turn_clash(A, turn_of):
            best = A[:]
            break
    return best


def pair(A, tag, x, y, flip, q=''):
    a, b = (x, y) if not flip else (y, x)
    A.append(['p', tag, a, b, 'ph', q])


def renewal_schedule(cfg, stim, r, rng):
    B, A, C = [], [], []
    shift = r // 8
    for ti, turn in enumerate(R_TURNS):
        p = (ti + r) % 8
        cell = RENEWAL_SEQ[p]
        g = RENEWAL_GSEQ[(p + shift) % 8]
        if cell == 'Nd':
            code = stim.code(turn, 'neutral_hinglish', NEURAL[g])
        elif cell == 'Ns':
            code = stim.code(turn, 'neutral_hinglish', NEURAL[g], 'slow')
        elif cell == 'Hd':
            code = stim.code(turn, 'neutral_hinglish', HD[g])
        else:
            hum = stim.ext['human'].get((turn, g))
            code = hum[shift % len(hum)] if hum else stim.code(turn, 'neutral_hinglish', HD[g], 'slow')
        if code is None:
            code = stim.code(turn, 'neutral_hinglish', NEURAL[g])          # fallback keeps one card per turn
        if code is None:
            raise SystemExit(f'{stim.name}: no usable clip for {turn}; check stimuli-qa.csv')
        B.append(['r', code, 0])
    # Block A
    items = {t: [g for g in 'FM' if stim.code(t, 'neutral_hinglish', HD[g]) and stim.code(t, 'neutral_hinglish', NEURAL[g])] for t in R_TURNS}
    for i, (t, g) in enumerate(sorted(balanced_pick(items, 4, r, 0), key=lambda x: R_TURNS.index(x[0]))):
        pair(A, f'x1.{t}.{g}', stim.code(t, 'neutral_hinglish', HD[g]), stim.code(t, 'neutral_hinglish', NEURAL[g]), (i + r) % 2 == 1)
    items = {t: [g for g in 'FM' if stim.code(t, 'neutral_hinglish', NEURAL[g], 'slow') and stim.code(t, 'neutral_hinglish', NEURAL[g])] for t in R_TURNS}
    for i, (t, g) in enumerate(sorted(balanced_pick(items, 3, r, 1), key=lambda x: R_TURNS.index(x[0]))):
        pair(A, f'x2.{t}.{g}', stim.code(t, 'neutral_hinglish', NEURAL[g], 'slow'), stim.code(t, 'neutral_hinglish', NEURAL[g]), (i + r) % 2 == 0)
    for i, g in enumerate('FM'):
        s, pl = stim.code('R7', 'neutral_hinglish', NEURAL[g], 'default', 'safety'), stim.code('R7', 'neutral_hinglish', NEURAL[g])
        if s and pl:
            pair(A, f's1.R7.{g}', s, pl, (i + r) % 2 == 1, 'trustpay')
    hum_items = {t: [g for g in 'FM' if stim.ext['human'].get((t, g)) and stim.code(t, 'neutral_hinglish', NEURAL[g])] for t in R_TURNS}
    for i, (t, g) in enumerate(sorted(balanced_pick(hum_items, 2, r, 2), key=lambda x: R_TURNS.index(x[0]))):
        hs = stim.ext['human'][(t, g)]
        pair(A, f'h1.{t}.{g}', stim.code(t, 'neutral_hinglish', NEURAL[g]), hs[(r // 2) % len(hs)], (i + r) % 2 == 1)
    comp_items = {t: [c for c in stim.ext['competitor'].get((t, 'F'), [])] for t in R_TURNS if stim.code(t, 'neutral_hinglish', SW)}
    for i, (t, c) in enumerate(sorted(balanced_pick(comp_items, 3, r, 3), key=lambda x: R_TURNS.index(x[0]))):
        pair(A, f'k1.{t}.{stim.rows[c]["voice"]}', stim.code(t, 'neutral_hinglish', SW), c, (i + r) % 2 == 1)
    A = finish_block_a(A, r, rng, stim)
    # Block C (only when human C-turn recordings exist; protocol 3.6)
    cstim = STIMS.get('hindi_c')
    if stim.name == 'hindi' and cstim and any(cstim.ext['human'].values()):
        for j, t in enumerate(C_TURNS):
            g = 'FM'[(j + shift) % 2]
            hs = cstim.ext['human'].get((t, g))
            if (j + r) % 2 == 0 and hs:
                C.append(['c', hs[r % len(hs)]])
            else:
                v = (NEURAL if (r // 2 + j) % 2 == 0 else HD)[g]
                code = cstim.code(t, 'neutral_hinglish', v, 'default', 'blockc')
                if code:
                    C.append(['c', code])
    return B, A, C


def register_schedule(cfg, stim, r, rng):
    conds, k = cfg['conds'], len(cfg['conds'])
    B = []
    for ti, turn in enumerate(R_TURNS):
        pool = [v for v in cfg['bvoices'] if all(stim.code(turn, c, v) for c in conds)]
        if not pool:
            pool = [v for v in cfg['bvoices'] if stim.code(turn, conds[(ti + r) % k], v)]
        if not pool:
            raise SystemExit(f'{stim.name}: no voice speaks {turn}; add or re-render clips')
        cond = conds[(ti + r) % k]
        voice = pool[((ti // k) + (r // k)) % len(pool)]
        code = stim.code(turn, cond, voice) or next(stim.code(turn, c, voice) for c in conds if stim.code(turn, c, voice))
        B.append(['r', code, 0])
    A = []
    for ci, (cx, cy, quota) in enumerate(cfg['contrasts']):
        items = {t: [v for v in cfg['bvoices'] if stim.code(t, cx, v) and stim.code(t, cy, v)] for t in R_TURNS}
        sel = sorted(balanced_pick(items, quota, r, ci), key=lambda tv: (tv[1], R_TURNS.index(tv[0])))
        for i, (t, v) in enumerate(sel):
            pair(A, f'x{ci + 1}.{t}.{cfg["bvoices"].index(v)}', stim.code(t, cx, v), stim.code(t, cy, v), (i + r) % 2 == 1)
    for vi, (cond, vpairs, quota) in enumerate(cfg['voice_contrasts']):
        for j in range(quota):
            vx, vy = vpairs[j % len(vpairs)]
            turns = [t for t in R_TURNS if stim.code(t, cond, vx) and stim.code(t, cond, vy)]
            if not turns:
                continue
            t = turns[(r * quota + j * 3) % len(turns)]
            pair(A, f'v{vi + 1}.{t}.{j}', stim.code(t, cond, vx), stim.code(t, cond, vy), (j + r) % 2 == 1)
    A = finish_block_a(A, r, rng, stim)
    return B, A, []


def build_schedule(panel, cfg, stim, num):
    """Return (schedule dict, log rows) for pid number `num` (1-based). Row r = num - 1 drives counterbalancing."""
    r = num - 1
    rng = random.Random(f'{SEED}|{panel}|{num}')
    B, A, C = (renewal_schedule if cfg['kind'] == 'renewal' else register_schedule)(cfg, stim, r, rng)
    rng.shuffle(B)
    attn_pos = rng.randrange(1, len(B))                       # instructed-response row, never on the first card
    B[attn_pos][2] = 1
    t1_pos = next(i for i, e in enumerate(B) if stim.rows[e[1]]['turn'] == 'R1')
    B.insert(rng.randint(t1_pos + 1, len(B)), ['d', f'catch_{stim.name}'])   # degraded clip after the real R1
    rng.shuffle(C)
    retest_order = list(range(len(A)))
    random.Random(f'{SEED}|{panel}|{num}|retest').shuffle(retest_order)
    sched = {'n': num, 'B': B, 'A': A, 'Ar': retest_order, 'C': C}
    pid = f'{cfg["prefix"]}{num:03d}'
    log = []
    for blk in ('C', 'B', 'A'):
        for pos, e in enumerate(sched[blk]):
            kind = {'r': 'rate', 'd': 'degraded', 'p': 'pair', 'i': 'identical', 'c': 'human_or_ai'}[e[0]]
            ca = e[1] if e[0] in ('r', 'd', 'c') else e[2] if e[0] == 'p' else e[1]
            cb = e[3] if e[0] == 'p' else e[1] if e[0] == 'i' else ''
            log.append([panel, pid, num, blk, pos, kind, e[1] if e[0] == 'p' else '', ca, cb,
                        e[4] if e[0] == 'p' else e[2] if e[0] == 'i' else 'ph', e[2] if e[0] == 'r' else '',
                        e[5] if e[0] == 'p' else ''])
    return sched, log


def voiced_gap(src, d, width=0.45):
    """Place the dropout in the middle of the longest voiced stretch, so it removes speech, not a pause."""
    import re
    p = subprocess.run(['ffmpeg', '-nostdin', '-i', src, '-af', 'silencedetect=noise=-35dB:d=0.12', '-f', 'null', '-'],
                       capture_output=True, text=True, timeout=120)
    starts = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', p.stderr)]
    ends = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', p.stderr)]
    edges = sorted([(0.0, 'e')] + [(x, 's') for x in starts] + [(x, 'e') for x in ends] + [(d, 's')])
    runs, cur = [], None
    for t, kind in edges:
        if kind == 'e':
            cur = t
        elif cur is not None:
            runs.append((cur, t))
            cur = None
    runs = [(a, b) for a, b in runs if b - a > width + 0.3 and a > 1.0]   # keep the opening word intact
    if not runs:
        return round(0.42 * d, 2), round(0.42 * d + width, 2)
    a, b = max(runs, key=lambda ab: ab[1] - ab[0])
    mid = (a + b) / 2
    return round(mid - width / 2, 2), round(mid + width / 2, 2)


def make_degraded(stim, cfg, warn):
    """Clipped, word-dropped version of one R1 clip (protocol 4.4). Phone chain identical to the real stimuli."""
    turn, reg, voice = cfg['degraded']
    code = stim.code(turn, reg, voice)
    name = f'catch_{stim.name}'
    out = os.path.join(CATCH, name + '.mp3')
    if code is None:
        warn.append(f'{name}: source clip ({turn}, {reg}, {voice}) unavailable; catch clip not made')
        return name, None, None
    if os.path.exists(out):
        return name, out, code
    if not shutil.which('ffmpeg'):
        warn.append(f'{name}: ffmpeg not found; the page will skip the degraded catch')
        return name, None, None
    src = os.path.join(STIM_DIR, stim.rows[code]['wideband_mp3'])
    d = stim.rows[code]['duration_s']
    g0, g1 = voiced_gap(src, d)
    tmp = os.path.join(CATCH, name + '.tmp')
    os.makedirs(tmp, exist_ok=True)
    ff = lambda *a: subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', *a], check=True, timeout=120)
    try:
        ff('-i', src, '-af', f"volume=enable='between(t,{g0},{g1})':volume=0,volume=24dB,aformat=sample_fmts=s16",
           '-ar', '24000', '-c:a', 'pcm_s16le', os.path.join(tmp, 'a.wav'))
        ff('-i', os.path.join(tmp, 'a.wav'), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,highpass=f=300,lowpass=f=3400',
           '-ar', '8000', '-c:a', 'pcm_mulaw', os.path.join(tmp, 'b.wav'))
        ff('-i', os.path.join(tmp, 'b.wav'), '-ar', '16000', '-c:a', 'pcm_s16le', os.path.join(tmp, 'c.wav'))
        ff('-i', os.path.join(tmp, 'c.wav'), '-c:a', 'libmp3lame', '-b:a', '48k', out)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return name, out, code


def balance_report(panel, cfg, stim, scheds, n):
    """Measure the counterbalance over the first n pids instead of trusting the rotation."""
    S = scheds[:n]
    lines = [f'## {panel}: first {n} pids']
    cell_of = lambda row: (row.get('source', 'tts') if row.get('source', 'tts') != 'tts' else
                           f'{row["tier"]}-{row["pace"]}' if cfg['kind'] == 'renewal' else row['register'])
    per_listener, tc, cg = Counter(), Counter(), Counter()
    for s in S:
        cc = Counter()
        for e in s['B']:
            if e[0] != 'r':
                continue
            row = stim.rows[e[1]]
            cc[cell_of(row)] += 1
            tc[(row['turn'], cell_of(row))] += 1
            cg[(cell_of(row), row.get('gender', ''))] += 1
        per_listener[tuple(sorted(cc.items()))] += 1
    lines.append('Block B cells per listener: ' + '; '.join(f'{dict(k)} x{v}' for k, v in per_listener.most_common()))
    lines.append(f'Block B (turn, cell) cells: {len(tc)}, uses per cell {min(tc.values())}..{max(tc.values())}')
    lines.append('Block B (cell, gender): ' + ', '.join(f'{c}/{g}={x}' for (c, g), x in sorted(cg.items())))
    first, n_pairs, wb, ab, tq = Counter(), Counter(), 0, 0, Counter()
    for s in S:
        for e in s['A']:
            if e[0] != 'p':
                continue
            tag = e[1].split('.')[0]
            n_pairs[tag] += 1
            ra = stim.rows[e[2]]
            target = {'x1': ra.get('tier') == 'hd', 'x2': ra.get('pace') == 'slow', 's1': ra.get('script') == 'safety',
                      'h1': ra.get('source', 'tts') == 'tts', 'k1': ra.get('source', 'tts') == 'tts'}.get(tag)
            if cfg['kind'] == 'register':
                if tag.startswith('x'):
                    target = ra['register'] == cfg['contrasts'][int(tag[1:]) - 1][0]
                else:
                    target = ra.get('tier') == 'native'
            first[tag] += bool(target)
            tq[(tag, ra['turn'])] += 1
            wb += e[4] == 'wb'
            ab += 1
    for tag in sorted(n_pairs):
        turns = Counter(t for (tg, t) in tq.elements() if tg == tag)
        lines.append(f'Block A {tag}: {n_pairs[tag]} trials, target played first in {first[tag]} ({first[tag] / n_pairs[tag]:.2f}); '
                     f'turns used {dict(sorted(turns.items()))}')
    lines.append(f'Block A wideband share: {wb}/{ab} = {wb / max(ab, 1):.2f}')
    lens = Counter(len(s['A']) for s in S)
    lines.append(f'Block A trials per listener (incl. identical catch): {dict(lens)}; Block B cards: '
                 f'{dict(Counter(len(s["B"]) for s in S))}; Block C: {dict(Counter(len(s["C"]) for s in S))}')
    return lines


def write_links(panel, start, end, base, lang):
    cfg = PANELS[panel]
    w = csv.writer(sys.stdout)
    w.writerow(['panel', 'pid', 'link'])
    for n in range(start, end + 1):
        pid = f'{cfg["prefix"]}{n:03d}'
        w.writerow([panel, pid, f'{base.rstrip("/")}/index.html?panel={panel}&pid={pid}&lang={lang or cfg["lang"]}'])


def bundle(out_dir):
    """Copy only the files a static host needs. Never copies manifests, stimuli-text.json or the QA sheet."""
    out_dir = os.path.abspath(out_dir)
    if os.path.commonpath([out_dir, os.path.dirname(HERE)]) == os.path.dirname(HERE):
        sys.exit('refusing to bundle inside the research tree; choose a directory outside it')
    lp = os.path.join(out_dir, 'listener-panel')
    os.makedirs(os.path.join(lp, 'plans'), exist_ok=True)
    os.makedirs(os.path.join(lp, 'catch'), exist_ok=True)
    for f in ('index.html', 'app.js'):
        shutil.copy2(os.path.join(HERE, f), lp)
    used = set()
    for f in sorted(os.listdir(PLANS)):
        if f.endswith('.js'):
            shutil.copy2(os.path.join(PLANS, f), os.path.join(lp, 'plans'))
            txt = open(os.path.join(PLANS, f), encoding='utf-8').read()
            plan = json.loads(txt[txt.index('(') + 1: txt.rindex(')')])
            for c in plan['clips'].values():
                used.update([c['ph'], c.get('wb') or ''])
    used.discard('')
    n = 0
    for rel in sorted(used):
        src = os.path.normpath(os.path.join(HERE, rel))
        dst = os.path.normpath(os.path.join(lp, rel))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        n += 1
    print(f'bundled page + {n} audio files into {out_dir}; upload that folder as-is (paths stay relative)')


STIMS = {}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--field', action='store_true', help='require every used clip to be listen-checked (status=use)')
    ap.add_argument('--qa-sheet', action='store_true', help='rewrite stimuli-qa.csv from the manifests (keeps human decisions)')
    ap.add_argument('--n', type=int, default=N_SCHEDULES)
    ap.add_argument('--links', nargs=3, metavar=('PANEL', 'FROM', 'TO'))
    ap.add_argument('--base', default='https://HOST/listener-panel/')
    ap.add_argument('--lang')
    ap.add_argument('--bundle', metavar='OUT_DIR')
    a = ap.parse_args()
    if a.links:
        return write_links(a.links[0], int(a.links[1]), int(a.links[2]), a.base, a.lang)
    if a.bundle:
        return bundle(a.bundle)

    rows = load_rows()
    if a.qa_sheet:
        qa_sheet(rows)
        print(f'wrote {QA_FILE} ({len(rows)} clips)')
        return
    qa = load_qa(rows)
    warn, logs, report = [], [], []
    os.makedirs(PLANS, exist_ok=True)
    os.makedirs(CATCH, exist_ok=True)
    for name in ['hindi', 'hindi_c', 'bihar', 'tamilnadu', 'maharashtra']:
        STIMS[name] = Stim(name, rows, qa, a.field, warn)
    blocked = [x for x in warn if x.startswith('FIELD BUILD BLOCKED')]
    if blocked:
        print('\n'.join(blocked[:40]) + (f'\n... and {len(blocked) - 40} more' if len(blocked) > 40 else ''))
        sys.exit(f'{len(blocked)} clips are not listen-checked; finish stimuli-qa.csv (status=use or exclude), '
                 'then rebuild. Nothing was written.')
    for panel, cfg in PANELS.items():
        stim = STIMS[cfg['stim']]
        catch_name, catch_path, catch_src = make_degraded(stim, cfg, warn)
        scheds = []
        for num in range(1, a.n + 1):
            s, log = build_schedule(panel, cfg, stim, num)
            if catch_path is None:
                s['B'] = [e for e in s['B'] if e[0] != 'd']
            scheds.append(s)
            logs.extend(log)
        clipsrc = dict(stim.rows)
        clipsrc.update(STIMS['hindi_c'].rows if cfg['kind'] == 'renewal' else {})
        used = {e[1] for s in scheds for e in s['B'] if e[0] == 'r'} | {e[1] for s in scheds for e in s['C']} | \
               {c for s in scheds for e in s['A'] for c in (e[2:4] if e[0] == 'p' else e[1:2])}
        clips = {}
        for code in sorted(used):
            row = clipsrc[code]
            clips[code] = {'t': row['turn'], 'ph': STIM_REL + row['phone_mp3'],
                           'wb': STIM_REL + row['wideband_mp3'] if row.get('wideband_mp3') else '', 'd': row['duration_s']}
        if catch_path:
            clips[catch_name] = {'t': 'R1', 'ph': 'catch/' + os.path.basename(catch_path), 'wb': '',
                                 'd': stim.rows[catch_src]['duration_s']}
        plan = {
            'schema': 'vpl-plan/2', 'plan_version': PLAN_VERSION, 'panel': panel, 'kind': cfg['kind'], 'stim_region': cfg['stim'],
            'prefix': cfg['prefix'], 'default_lang': cfg['lang'], 'age_stratum': cfg.get('age', ''), 'seed': SEED,
            'field_build': bool(a.field), 'built_at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
            'manifest_sha256': sha256(MANIFEST), 'external_sha256': sha256(EXTERNAL) if os.path.exists(EXTERNAL) else '',
            'qa_sha256': sha256(QA_FILE), 'clips': clips, 'schedules': scheds,
        }
        with open(os.path.join(PLANS, f'{panel}.js'), 'w', encoding='utf-8') as f:
            f.write('/* generated by build_plan.py; do not edit. Condition labels are deliberately absent. */\n')
            f.write('VPL.registerPlan(' + json.dumps(plan, ensure_ascii=False, separators=(',', ':')) + ');\n')
        report += balance_report(panel, cfg, stim, scheds, 48) + ['']
    with open(os.path.join(PLANS, 'schedules.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['panel', 'pid', 'pid_num', 'block', 'position', 'kind', 'pair_id', 'clip_a', 'clip_b', 'channel',
                    'attention_row', 'question'])
        w.writerows(logs)
    with open(os.path.join(PLANS, 'balance.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))
    print('\n'.join(report))
    pilots = [x for x in warn if x.startswith('pilot:')]
    for x in warn:
        if not x.startswith('pilot:'):
            print('WARN', x)
    if pilots:
        print(f'WARN {len(set(pilots))} clips are not listen-checked yet (allowed for the pilot only; protocol 3.5)')
    print(f'wrote plans/<panel>.js for {len(PANELS)} panels x {a.n} pids, plans/schedules.csv, plans/balance.txt')


if __name__ == '__main__':
    main()
