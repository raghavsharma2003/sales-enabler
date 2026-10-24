#!/usr/bin/env python3
"""Build the listener-panel schedules, the degraded catch clips and the assignment log.

This file is the single source of truth for who hears what. The page (app.js) only executes a schedule; it never
decides one. Every schedule is a pure function of (SEED, panel, pid number), so the assignment is reproducible and
logged (plans/schedules.csv) before anyone listens. Python 3.9+, stdlib only; ffmpeg only for the catch clips.

Usage (run from anywhere):
  python3 build_plan.py                    pilot build: clips still 'unchecked' in stimuli-qa.csv are allowed (warned)
  python3 build_plan.py --field            field build: every clip used must be status=use in stimuli-qa.csv
  python3 build_plan.py --blockc FILE.csv  add Block C (human or computer) once those stimuli exist (protocol 4.4)
  python3 build_plan.py --links bihar 1 60 --base https://HOST/vp-panel/listener-panel/   one link per pid, as CSV
  python3 build_plan.py --bundle OUT_DIR   copy only what a web host needs (no manifest, no texts, no condition key)

Blinding: plans/*.js carry file codes, turn ids and opaque pair ids only. Condition labels live in the l8 manifest,
which must never be uploaded with the page (use --bundle). Analysis joins conditions back from the manifest.
"""
import argparse, csv, hashlib, json, os, random, shutil, subprocess, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
STIM_REL = '../lanes/l8-azure-bench/stimuli/'          # relative to this folder; the page uses the same prefix
STIM_DIR = os.path.normpath(os.path.join(HERE, STIM_REL))
MANIFEST = os.path.join(STIM_DIR, 'manifest.csv')
QA_FILE = os.path.join(HERE, 'stimuli-qa.csv')
PLANS = os.path.join(HERE, 'plans')
CATCH = os.path.join(HERE, 'catch')
SEED = 20261017
N_SCHEDULES = 160                     # pids 1..160 per panel; recruit far fewer (protocol 5)
PLAN_VERSION = '1.0.0'
TURNS = ['T1_sales_opening', 'T2_sales_price', 'T3_sales_objection', 'T4_postsales_cod', 'T5_postsales_ndr',
         'T6_postsales_renewal']

# Panel designs (protocol section 3). 'conds' order drives the Latin rotation in Block B.
# contrasts: (target condition, other condition, trials per listener) for within-voice register pairs.
# voice_contrasts: (condition, target voice, other voice, trials per listener) for same-text voice pairs.
PANELS = {
    'bihar': dict(stim='bihar', prefix='B', lang='hi', matched='bhojpuri_mix',
                  conds=['neutral_hinglish', 'bhojpuri_mix'],
                  contrasts=[('bhojpuri_mix', 'neutral_hinglish', 12)], voice_contrasts=[],
                  degraded=('neutral_hinglish', 'hi-IN-MadhurNeural')),
    'outgroup': dict(stim='bihar', prefix='O', lang='hi', matched='bhojpuri_mix',
                     conds=['neutral_hinglish', 'bhojpuri_mix'],
                     contrasts=[('bhojpuri_mix', 'neutral_hinglish', 12)], voice_contrasts=[],
                     degraded=('neutral_hinglish', 'hi-IN-MadhurNeural')),
    'tamilnadu': dict(stim='tamilnadu', prefix='T', lang='ta', matched='tamil_english',
                      conds=['tamil_english', 'neutral_hinglish', 'indian_english'],
                      contrasts=[('tamil_english', 'neutral_hinglish', 6), ('tamil_english', 'indian_english', 6)],
                      voice_contrasts=[('tamil_english', 'ta-IN-PallaviNeural', 'en-IN-Meera:DragonHDLatestNeural', 2)],
                      degraded=('tamil_english', 'en-IN-Meera:DragonHDLatestNeural')),
    'maharashtra': dict(stim='maharashtra', prefix='M', lang='mr', matched='marathi_mix',
                        conds=['marathi_mix', 'neutral_hinglish'],
                        contrasts=[('marathi_mix', 'neutral_hinglish', 12)], voice_contrasts=[],
                        degraded=('marathi_mix', 'mr-IN-AarohiNeural')),
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def tshort(turn):
    return turn.split('_')[0]


def load_manifest():
    rows = list(csv.DictReader(open(MANIFEST, encoding='utf-8')))
    for r in rows:
        r['duration_s'] = float(r['duration_s'])
    return rows


def load_qa():
    if not os.path.exists(QA_FILE):
        sys.exit(f'missing {QA_FILE}')
    return {r['file_code']: r for r in csv.DictReader(open(QA_FILE, encoding='utf-8'))}


class Stim:
    """Valid clips for one stimulus region, indexed by (turn, condition, voice)."""

    def __init__(self, region, rows, qa, field, warn):
        self.region = region
        self.by_key, self.rows = {}, {}
        for r in rows:
            if r['region'] != region:
                continue
            q = qa.get(r['file_code'])
            status = (q or {}).get('status', 'unchecked').strip()
            if status == 'exclude':
                continue
            if status != 'use':
                if field:
                    warn.append(f'FIELD BUILD BLOCKED: {r["file_code"]} is "{status}" in stimuli-qa.csv')
                    continue
                warn.append(f'pilot: {r["file_code"]} not yet listen-checked')
            for p in (r['phone_mp3'], r['wideband_mp3']):
                if not os.path.exists(os.path.join(STIM_DIR, p)):
                    sys.exit(f'audio file missing: {os.path.join(STIM_DIR, p)}')
            self.by_key[(r['turn'], r['condition'], r['voice'])] = r['file_code']
            self.rows[r['file_code']] = r
        self.voices = sorted({k[2] for k in self.by_key})

    def code(self, turn, cond, voice):
        return self.by_key.get((turn, cond, voice))

    def within_voices(self, turn, conds):
        return [v for v in self.voices if all(self.code(turn, c, v) for c in conds)]


def balanced_pick(items_by_turn, quota, r, offset):
    """Pick `quota` (turn, voice) items spread evenly over turns, rotating turns and voices with row r."""
    turns = [t for t in TURNS if items_by_turn.get(t)]
    total = sum(len(items_by_turn[t]) for t in turns)
    if quota >= total:
        return [(t, v) for t in turns for v in items_by_turn[t]]
    base, rem = divmod(quota, len(turns))
    extra = {turns[(r * max(rem, 1) + j) % len(turns)] for j in range(rem)}
    out = []
    for ti, t in enumerate(turns):
        pool = items_by_turn[t]
        n = min(len(pool), base + (1 if t in extra else 0))
        for j in range(n):
            out.append((t, pool[(ti + r + offset + j) % len(pool)]))
    return out


def adjacent_turn_clash(seq, turn_of):
    return any(turn_of(a) == turn_of(b) for a, b in zip(seq, seq[1:]))


def build_schedule(panel, cfg, stim, num, blockc):
    """Return (schedule dict, log rows) for pid number `num` (1-based). Row r = num - 1 drives counterbalancing."""
    r = num - 1
    rng = random.Random(f'{SEED}|{panel}|{num}')
    conds, k = cfg['conds'], len(cfg['conds'])

    # ---- Block B: single-clip ratings, first exposure to each turn (comprehension is only valid here) ----
    B = []
    for ti, turn in enumerate(TURNS):
        pool = stim.within_voices(turn, conds)
        if not pool:
            raise SystemExit(f'{panel}: no voice speaks every condition for {turn}; add or re-render clips')
        cond = conds[(ti + r) % k]
        voice = pool[((ti // k) + (r // k)) % len(pool)]
        B.append(['r', stim.code(turn, cond, voice), 0])
    rng.shuffle(B)
    attn_pos = rng.randrange(1, len(B))                       # instructed-response row, never on the first card
    B[attn_pos][2] = 1
    t1_pos = next(i for i, e in enumerate(B) if stim.rows[e[1]]['turn'] == TURNS[0])
    B.insert(rng.randint(t1_pos + 1, len(B)), ['d', f'catch_{cfg["stim"]}'])   # degraded clip after the real T1

    # ---- Block A: paired preference (within voice for registers, same text for voices) ----
    A = []
    for ci, (cx, cy, quota) in enumerate(cfg['contrasts']):
        items = {t: [v for v in stim.voices if stim.code(t, cx, v) and stim.code(t, cy, v)] for t in TURNS}
        sel = sorted(balanced_pick(items, quota, r, ci), key=lambda tv: (tv[1], TURNS.index(tv[0])))
        for i, (t, v) in enumerate(sel):
            x, y = stim.code(t, cx, v), stim.code(t, cy, v)
            a, b = (x, y) if (i + r) % 2 == 0 else (y, x)
            A.append(['p', f'x{ci + 1}.{tshort(t)}.{stim.voices.index(v)}', a, b, 'ph'])
    for vi, (cond, vx, vy, quota) in enumerate(cfg['voice_contrasts']):
        turns = [t for t in TURNS if stim.code(t, cond, vx) and stim.code(t, cond, vy)]
        if not turns:
            continue
        step = max(1, len(turns) // quota)
        picks = [turns[(r * quota + j * step) % len(turns)] for j in range(min(quota, len(turns)))]
        for j, t in enumerate(picks):
            x, y = stim.code(t, cond, vx), stim.code(t, cond, vy)
            a, b = (x, y) if (j + r) % 2 == 0 else (y, x)
            A.append(['p', f'v{vi + 1}.{tshort(t)}', a, b, 'ph'])
    for i, e in enumerate(A):                                  # about a quarter of pairs on the wideband channel
        if (i + r) % 4 == 0:
            e[4] = 'wb'
    pool_codes = sorted({c for e in A for c in (e[2], e[3])})
    A.insert(rng.randint(1, len(A) - 1), ['i', rng.choice(pool_codes), 'ph'])   # identical-clip catch pair
    turn_of = lambda e: stim.rows[e[2] if e[0] == 'p' else e[1]]['turn']
    best = A[:]
    for _ in range(5000):
        rng.shuffle(A)
        if not adjacent_turn_clash(A, turn_of):
            best = A[:]
            break
    A = best
    retest_order = list(range(len(A)))
    random.Random(f'{SEED}|{panel}|{num}|retest').shuffle(retest_order)

    # ---- Block C: human or computer (only when the supplementary stimuli exist) ----
    C = []
    if blockc:
        texts = sorted({x['turn'] for x in blockc})
        for j, t in enumerate(texts):
            want = 'human' if (j + r) % 2 == 0 else 'tts'
            opts = sorted(x['file_code'] for x in blockc if x['turn'] == t and x['source'] == want)
            if opts:
                C.append(['c', opts[(r // 2) % len(opts)]])
        rng.shuffle(C)

    sched = {'n': num, 'B': B, 'A': A, 'Ar': retest_order, 'C': C}
    pid = f'{cfg["prefix"]}{num:03d}'
    log = []
    for blk in ('C', 'B', 'A'):
        for pos, e in enumerate(sched[blk]):
            kind = {'r': 'rate', 'd': 'degraded', 'p': 'pair', 'i': 'identical', 'c': 'human_or_ai'}[e[0]]
            ca = e[1] if e[0] in ('r', 'd', 'c') else e[2] if e[0] == 'p' else e[1]
            cb = e[3] if e[0] == 'p' else e[1] if e[0] == 'i' else ''
            log.append([panel, pid, num, blk, pos, kind, e[1] if e[0] == 'p' else '', ca, cb,
                        e[4] if e[0] == 'p' else e[2] if e[0] == 'i' else 'ph', e[2] if e[0] == 'r' else ''])
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
    """Clipped, word-dropped version of one T1 clip (protocol 4.5). Phone chain identical to the real stimuli."""
    cond, voice = cfg['degraded']
    code = stim.code(TURNS[0], cond, voice)
    name = f'catch_{cfg["stim"]}'
    out = os.path.join(CATCH, name + '.mp3')
    if code is None:
        warn.append(f'{name}: source clip ({cond}, {voice}, T1) unavailable; catch clip not made')
        return name, None
    if os.path.exists(out):
        return name, out
    if not shutil.which('ffmpeg'):
        warn.append(f'{name}: ffmpeg not found; make it per protocol 3.4 or the page will skip the degraded catch')
        return name, None
    src = os.path.join(STIM_DIR, stim.rows[code]['wideband_mp3'])
    d = stim.rows[code]['duration_s']
    g0, g1 = voiced_gap(src, d)
    tmp = os.path.join(CATCH, name + '.tmp')
    os.makedirs(tmp, exist_ok=True)
    ff = lambda *a: subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', *a], check=True, timeout=120)
    try:
        # 1) drop ~450 ms mid-utterance and drive into hard clipping (float -> s16 saturates)
        ff('-i', src, '-af', f"volume=enable='between(t,{g0},{g1})':volume=0,volume=24dB,aformat=sample_fmts=s16",
           '-ar', '24000', '-c:a', 'pcm_s16le', os.path.join(tmp, 'a.wav'))
        # 2) back to -16 LUFS so it is not simply louder, then the same phone chain as render_stimuli.py
        ff('-i', os.path.join(tmp, 'a.wav'), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,highpass=f=300,lowpass=f=3400',
           '-ar', '8000', '-c:a', 'pcm_mulaw', os.path.join(tmp, 'b.wav'))
        ff('-i', os.path.join(tmp, 'b.wav'), '-ar', '16000', '-c:a', 'pcm_s16le', os.path.join(tmp, 'c.wav'))
        ff('-i', os.path.join(tmp, 'c.wav'), '-c:a', 'libmp3lame', '-b:a', '48k', out)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return name, out


def balance_report(panel, cfg, stim, scheds, n):
    """Measure the counterbalance over the first n pids instead of trusting the rotation."""
    from collections import Counter
    S = scheds[:n]
    lines = [f'## {panel}: first {n} pids']
    tc, tcv, per_listener = Counter(), Counter(), []
    for s in S:
        cc = Counter()
        for e in s['B']:
            if e[0] != 'r':
                continue
            row = stim.rows[e[1]]
            tc[(tshort(row['turn']), row['condition'])] += 1
            tcv[(row['condition'], row['voice'])] += 1
            cc[row['condition']] += 1
        per_listener.append(tuple(cc.get(c, 0) for c in cfg['conds']))
    lines.append('Block B per-listener condition counts ' + str(cfg['conds']) + ': ' + str(dict(Counter(per_listener))))
    lines.append('Block B (turn, condition) range: ' + f'{min(tc.values())}..{max(tc.values())} over {len(tc)} cells')
    lines.append('Block B (condition, voice): ' + ', '.join(f'{c[:10]}/{v.split("-")[2][:8]}={x}' for (c, v), x in sorted(tcv.items())))
    first_target, n_pairs, wb, ab = Counter(), Counter(), 0, 0
    for s in S:
        for e in s['A']:
            if e[0] != 'p':
                continue
            n_pairs[e[1].split('.')[0]] += 1
            ra = stim.rows[e[2]]
            tag = e[1].split('.')[0]
            if tag.startswith('x'):
                tgt = cfg['contrasts'][int(tag[1:]) - 1][0]
                first_target[tag] += ra['condition'] == tgt
            else:
                tgt = cfg['voice_contrasts'][int(tag[1:]) - 1][1]
                first_target[tag] += ra['voice'] == tgt
            wb += e[4] == 'wb'
            ab += 1
    for tag in sorted(n_pairs):
        lines.append(f'Block A {tag}: {n_pairs[tag]} trials, target played first in {first_target[tag]} '
                     f'({first_target[tag] / n_pairs[tag]:.2f})')
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
    """Copy only the files a static host needs. Never copies manifest.csv, stimuli-text.json or the QA sheet."""
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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--field', action='store_true', help='require every used clip to be listen-checked (status=use)')
    ap.add_argument('--blockc', help='CSV of Block C stimuli: file_code,region,turn,source(human|tts),voice,'
                                      'duration_s,phone_mp3,wideband_mp3 (paths relative to the stimuli folder)')
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

    rows, qa = load_manifest(), load_qa()
    blockc_rows = list(csv.DictReader(open(a.blockc, encoding='utf-8'))) if a.blockc else []
    warn, logs, report = [], [], []
    stims = {}
    os.makedirs(PLANS, exist_ok=True)
    os.makedirs(CATCH, exist_ok=True)
    for cfg in PANELS.values():
        if cfg['stim'] not in stims:
            stims[cfg['stim']] = Stim(cfg['stim'], rows, qa, a.field, warn)
    blocked = [x for x in warn if x.startswith('FIELD BUILD BLOCKED')]
    if blocked:
        print('\n'.join(blocked))
        sys.exit(f'{len(blocked)} clips are not listen-checked; finish stimuli-qa.csv (status=use or exclude), '
                 'then rebuild. Nothing was written.')
    for panel, cfg in PANELS.items():
        stim = stims[cfg['stim']]
        bc = [x for x in blockc_rows if x['region'] == cfg['stim']]
        catch_name, catch_path = make_degraded(stim, cfg, warn)
        scheds = []
        for num in range(1, a.n + 1):
            s, log = build_schedule(panel, cfg, stim, num, bc)
            if catch_path is None:
                s['B'] = [e for e in s['B'] if e[0] != 'd']
            scheds.append(s)
            logs.extend(log)
        clips = {}
        for code, row in stim.rows.items():
            clips[code] = {'t': tshort(row['turn']), 'ph': STIM_REL + row['phone_mp3'], 'wb': STIM_REL + row['wideband_mp3'],
                           'd': row['duration_s']}
        used = {e[1] for s in scheds for e in s['B'] if e[0] == 'r'} | \
               {c for s in scheds for e in s['A'] for c in (e[2:4] if e[0] == 'p' else e[1:2])}
        clips = {c: v for c, v in clips.items() if c in used}
        for x in bc:
            clips[x['file_code']] = {'t': x['turn'], 'ph': STIM_REL + x['phone_mp3'],
                                     'wb': STIM_REL + x['wideband_mp3'] if x.get('wideband_mp3') else '',
                                     'd': float(x['duration_s'])}
        if catch_path:
            clips[catch_name] = {'t': 'T1', 'ph': 'catch/' + os.path.basename(catch_path), 'wb': '',
                                 'd': stim.rows[stim.code(TURNS[0], *cfg['degraded'])]['duration_s']}
        plan = {
            'schema': 'vpl-plan/1', 'plan_version': PLAN_VERSION, 'panel': panel, 'stim_region': cfg['stim'],
            'prefix': cfg['prefix'], 'default_lang': cfg['lang'], 'seed': SEED, 'field_build': bool(a.field),
            'built_at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
            'manifest_sha256': sha256(MANIFEST), 'qa_sha256': sha256(QA_FILE),
            'clips': clips, 'schedules': scheds,
        }
        with open(os.path.join(PLANS, f'{panel}.js'), 'w', encoding='utf-8') as f:
            f.write('/* generated by build_plan.py; do not edit. Condition labels are deliberately absent. */\n')
            f.write('VPL.registerPlan(' + json.dumps(plan, ensure_ascii=False, separators=(',', ':')) + ');\n')
        report += balance_report(panel, cfg, stim, scheds, 48) + ['']
    with open(os.path.join(PLANS, 'schedules.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['panel', 'pid', 'pid_num', 'block', 'position', 'kind', 'pair_id', 'clip_a', 'clip_b', 'channel',
                    'attention_row'])
        w.writerows(logs)
    with open(os.path.join(PLANS, 'balance.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))
    print('\n'.join(report))
    pilots = [x for x in warn if x.startswith('pilot:')]
    for x in warn:
        if not x.startswith('pilot:'):
            print('WARN', x)
    if pilots:
        print(f'WARN {len(pilots)} clips are not listen-checked yet (allowed for the pilot only; protocol 3.5)')
    print(f'wrote plans/<panel>.js for {len(PANELS)} panels x {a.n} pids, plans/schedules.csv, plans/balance.txt')


if __name__ == '__main__':
    main()
