# Turn-taking bench on the PRODUCT runtime: is she "exactly human" about when to talk? Synthetic Hinglish caller clips
# (research/2026-10-17/lanes/l8-azure-bench/stimuli, 102 clips, phone band, with their text) go through the runtime's
# real VAD (Silero, or the energy VAD with --vad energy), endpointing, held/withdrawn replies and barge-in logic
# (vpvoice/cascade.py, unchanged), in real time. Ears, brain and voice are fakes with fixed timing, so the turn logic is
# measured, not the providers. No network, no keys.
#
#   python bench/turn_bench.py --split dev            # tune here
#   python bench/turn_bench.py --split test --out bench/results/turn-...   # report here (never tune on it)
#   python bench/turn_bench.py --split test --set HOLD_MS=400 --set LONG_HOLD_MS=1400
#
# Ground truth comes from each clip itself: speech regions from its energy envelope (20 ms frames, -38 dBFS, gaps under
# 150 ms bridged), so a clip is one caller turn whose internal pauses of 250 ms or more are mid-thought pauses.
# Four scenarios per clip:
#   turn       she has finished her short opening; the caller says the clip, then waits up to 8 s.
#              end-of-turn latency = her first audio after the clip's last speech; premature cut-in = her audio starts
#              before the clip's last speech (during a mid-thought pause); talk-over = her audio overlaps caller speech
#              for 300 ms or more; no reply = nothing within 8 s.
#   statement  the clip cut at its last pause after a full stop, so the turn ends in a statement (every whole clip
#              ends in a question): end-of-turn latency there is the cost of holding longer after statements.
#   barge      2 s into her long opening, the caller starts the clip. missed barge-in = she has not stopped (flush)
#              1.5 s after the caller's speech onset; barge-in latency = onset -> flush.
#   backchannel 2 s into her long opening, vocal bursts cut from the clip's first speech, heard as nods: 300 ms "haan",
#              500 ms "haan ji", 700 ms "achha haan ji"; and, separately, a 300 ms burst of white noise at -30 dBFS.
#              false barge-in = she stops within 2.5 s of the burst. A nod's words reach the runtime as a partial once
#              --partial-ms of it has been heard, as a streaming recogniser's would.
# Fakes: ears give partials while the VAD hears speech and the final words 250 ms after the VAD's end of speech (words
# allocated to the clip's speech time, each --partial-ms after it is spoken, default 0); brain: first sentence 300 ms after the request; voice: first audio 150 ms after
# a sentence, 75 ms of audio per character, streamed at twice real time. No echo of her voice into the microphone.
import argparse, asyncio, hashlib, json, math, os, random, re, statistics, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__)); VOICE = os.path.dirname(HERE); ROOT = os.path.abspath(os.path.join(VOICE, '..', '..'))
sys.path.insert(0, VOICE)
STIM = os.path.join(ROOT, 'research', '2026-10-17', 'lanes', 'l8-azure-bench', 'stimuli')
FINAL_MS, BRAIN_MS, TTS_MS, AUDIO_PER_CHAR = 250, 300, 150, 0.075
SHORT_OPENING = 'Namaste, main Riya, AI assistant.'
LONG_OPENING = ('Namaste, main Suraksha ki AI assistant Riya bol rahi hoon. Aapki policy ka renewal agle hafte hai, aur main aapko '
                'do teen cheezein batana chahti thi jo is baar badli hain, taaki aapko koi pareshani na ho.')
REPLY = 'Ji, samajh gayi. Main abhi aapko details bhejti hoon.'
PARTIAL_LAG = 0.0      # --partial-ms / 1000: how long after a word is spoken the recogniser's partial carries it
NODS = [(0.3, 'haan'), (0.5, 'haan ji'), (0.7, 'achha haan ji')]


# ------------------------------------------------------------------------------------------------ clips and labels
def load_clips():
    import csv
    import numpy as np
    rows = list(csv.DictReader(open(os.path.join(STIM, 'manifest.csv'), encoding='utf-8')))
    out = []
    for r in rows:
        f = os.path.join(STIM, r['phone_mp3'])
        p = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', f, '-ar', '16000', '-ac', '1', '-f', 's16le', '-'], capture_output=True, timeout=60)
        if p.returncode or len(p.stdout) < 32000: continue
        pcm = p.stdout; x = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768
        db = 20 * np.log10(np.sqrt(np.mean(x[:len(x) // 320 * 320].reshape(-1, 320) ** 2, axis=1)) + 1e-9)
        on = db > -38.0; regs = []; i = 0
        while i < len(on):
            if on[i]:
                j = i
                while j < len(on) and on[j]: j += 1
                regs.append([i * 0.02, j * 0.02]); i = j
            else: i += 1
        merged = []
        for a, b in regs:
            if merged and a - merged[-1][1] < 0.15: merged[-1][1] = b
            else: merged.append([a, b])
        merged = [r for r in merged if r[1] - r[0] >= 0.1]
        if not merged: continue
        split = 'dev' if int(hashlib.sha256(r['file_code'].encode()).hexdigest(), 16) % 2 == 0 else 'test'
        out.append({'id': r['file_code'], 'split': split, 'pcm': pcm, 'dur': len(x) / 16000, 'speech': merged, 'text': r['text']})
    return out


def statement_cut(c):
    """The clip cut at its last mid-turn pause that follows a full stop: a turn that ends in a statement (None if none)."""
    from vpvoice.cascade import incomplete
    best = None
    for i, (a, b) in enumerate(zip(c['speech'], c['speech'][1:])):
        if b[0] - a[1] < 0.25: continue
        txt = ' '.join(words_until(c, a[1], at_pause=True)).strip()
        if txt and txt[-1] in '।.!' and not incomplete(txt): best = i
    if best is None: return None
    end = c['speech'][best][1]
    return {**c, 'id': c['id'] + ':stmt', 'pcm': c['pcm'][:int((end + 0.05) * 16000) * 2], 'speech': c['speech'][:best + 1],
            'text': ' '.join(words_until(c, end, at_pause=True))}


def pauses(c): return [(a[1], b[0]) for a, b in zip(c['speech'], c['speech'][1:]) if b[0] - a[1] >= 0.25]


PUNCT = (',', '।', '.', '?', '!')


def words_until(c, t, at_pause=False):
    """The clip's words spread over its speech time: those spoken by clip time t. At a pause (a recogniser's final), the
    count snaps to the nearest word ending in punctuation within 3 words: synthetic speech pauses where the text does."""
    w = c['text'].split(); total = sum(b - a for a, b in c['speech']); said = 0.0
    for a, b in c['speech']:
        if t <= a: break
        said += min(t, b) - a
    k = int(len(w) * min(1.0, said / total) + 1e-9)
    if at_pause and 0 < k < len(w):
        near = [j for j in range(max(1, k - 3), min(len(w), k + 3) + 1) if w[j - 1].endswith(PUNCT)]
        if near: k = min(near, key=lambda j: abs(j - k))
    return w[:k]


# ------------------------------------------------------------------------------------------------ fakes
class Line:
    """The far end: her audio plays from when it arrives (queued after what is already playing); a flush cuts it."""
    def __init__(self, now): self.now = now; self.segs = []; self.until = 0.0; self.flushes = []
    async def send_audio(self, rid, pcm24):
        t = self.now(); d = len(pcm24) / 48000; st = max(t, self.until); self.until = st + d; self.segs.append([st, st + d, rid])
    async def flush(self, rid):
        t = self.now(); self.flushes.append(t); self.until = min(self.until, t)
        for s in self.segs:
            if s[2] == rid and s[1] > t: s[1] = max(s[0], t)
    async def send_json(self, obj): pass
    async def close(self): pass
    def first_after(self, t): return min((s[0] for s in self.segs if s[0] >= t and s[1] > s[0]), default=None)
    def playing(self):
        out = []
        for a, b, _ in sorted(self.segs):
            if b <= a: continue
            if out and a <= out[-1][1] + 1e-3: out[-1][1] = max(out[-1][1], b)
            else: out.append([a, b])
        return out


class Ears:
    def __init__(self, on_p, on_f, on_e, lang='hi-IN', clip=None, pos=None):
        self.on_p = on_p; self.on_f = on_f; self.clip = clip; self.pos = pos; self.sent = 0; self.audio_s = 0.0; self.text = None
        self.heard_s = 0.0
    async def start(self): pass
    def write(self, pcm, is_speech):
        if is_speech: self.audio_s += len(pcm) / 32000
        if is_speech and self.clip is not None:
            w = words_until(self.clip, self.pos() - PARTIAL_LAG)[self.sent:]
            if w: self.on_p(' '.join(w))
        if is_speech and self.text:                    # a nod: its words arrive as a partial, PARTIAL_LAG after it starts
            self.heard_s += len(pcm) / 32000
            if self.heard_s >= max(PARTIAL_LAG, 0.06): self.on_p(self.text)
    def end_of_speech(self):
        if self.text is not None:                      # a burst with a fixed hearing ("haan"), or noise heard as nothing
            if self.text: asyncio.get_running_loop().call_later(FINAL_MS / 1000, self.on_f, self.text)
            return
        if self.clip is None: return
        w = words_until(self.clip, self.pos(), at_pause=True)
        new = w[self.sent:]; self.sent = max(self.sent, len(w))
        if new: asyncio.get_running_loop().call_later(FINAL_MS / 1000, self.on_f, ' '.join(new))
    async def close(self): pass


class Brain:
    def __init__(self, opening): self.opening = opening; self.n = 0
    async def stream(self, messages, usage, timing, max_tokens=180):
        text = self.opening if self.n == 0 else REPLY; self.n += 1
        usage.update({'in': 100, 'out': 20, 'cached': 0, 'usd': 0.0})
        await asyncio.sleep(BRAIN_MS / 1000)
        for k in range(0, len(text), 12): yield text[k:k + 12]


class Voice:
    whole_reply = False; styled = False; sounds = False
    async def warm(self): pass
    def reset(self): pass
    async def close(self): pass
    async def speak(self, text, style, usage, timing):
        await asyncio.sleep(TTS_MS / 1000)
        n = max(1, int(len(text) * AUDIO_PER_CHAR / 0.04))
        usage['audio_s'] = usage.get('audio_s', 0) + n * 0.04
        for _ in range(n):
            await asyncio.sleep(0.02)
            yield b'\x00\x01' * 960


# ------------------------------------------------------------------------------------------------ one scenario
async def run_one(kind, clip, burst=None):
    from tests.fixtures import components, sink, ticket
    from vpvoice.cascade import CascadeSession
    t = ticket(transport={'kind': 'webrtc', 'offerUrl': 'x'}); t['agent']['limits'] = {'maxDurationS': 120, 'maxSilenceS': 0, 'maxTurns': 1000}
    s, _ = sink(t['conversationId'])
    clock = time.monotonic; line = Line(clock)
    feed = {'pos': 0.0}
    ears_holder = {}
    def make_ears(p, f, e, lang='hi-IN'):
        ears_holder['e'] = Ears(p, f, e, lang, clip=clip if kind != 'backchannel' else None, pos=lambda: feed['pos']); return ears_holder['e']
    comp = components(brain=Brain(SHORT_OPENING if kind == 'turn' else LONG_OPENING), voice=Voice(), ears=make_ears)
    sess = CascadeSession(t, comp, s, line, env={}, watchdog_s=0.05, tick_s=0.03)
    await sess.start()
    t0 = clock()
    async def wait_audio(timeout=10.0):
        end = clock() + timeout
        while not line.segs and clock() < end: await asyncio.sleep(0.01)
    await wait_audio()
    if kind in ('turn', 'statement'):
        while clock() < line.until + 0.5: await asyncio.sleep(0.02)       # her opening has played, then half a second
        pcm = clip['pcm']
    elif kind == 'barge':
        while clock() < line.segs[0][0] + 2.0: await asyncio.sleep(0.01)
        pcm = clip['pcm']
    else:
        while clock() < line.segs[0][0] + 2.0: await asyncio.sleep(0.01)
        pcm, ears_holder['e'].text = burst
    start = clock(); frames = len(pcm) // 640; QUIET = b'\x00\x00' * 320
    for i in range(frames + int(8.0 / 0.02)):                                 # the clip, then 8 s of quiet
        due = start + i * 0.02
        await asyncio.sleep(max(0.0, due - clock()))
        feed['pos'] = i * 0.02
        await sess.on_mic(pcm[i * 640:(i + 1) * 640] if i < frames else QUIET)
        if kind in ('turn', 'statement') and i > frames and line.first_after(start + clip['speech'][-1][1]) is not None and clock() > line.until + 0.3: break
        if kind in ('barge', 'backchannel') and i > frames + 100: break
    await sess.end('completed')
    return {'kind': kind, 'id': clip['id'], 'start': start, 'line': line, 'clip': clip, 'burst': burst}


def score(r):
    c = r['clip']; st = r['start']; line = r['line']; play = line.playing()
    if r['kind'] in ('turn', 'statement'):
        last = st + c['speech'][-1][1]
        first_after_start = line.first_after(st)
        cut = first_after_start is not None and first_after_start < last - 0.05
        cut_pauses = sum(1 for a, b in pauses(c) if any(s < st + b and e > st + a + 0.2 for s, e in play))
        over = sum(max(0.0, min(e, st + b) - max(s, st + a)) for s, e in play for a, b in c['speech'])
        fa = line.first_after(last - 0.05)
        return {'kind': r['kind'], 'id': r['id'], 'premature': cut, 'pauses': len(pauses(c)), 'cut_pauses': cut_pauses,
                'talk_over': over >= 0.3, 'overlap_s': round(over, 3), 'no_reply': fa is None, 'eot_ms': None if fa is None or cut else round((fa - last) * 1000)}
    if r['kind'] == 'barge':
        onset = st + c['speech'][0][0]
        fl = [f for f in line.flushes if f >= onset]
        lat = (fl[0] - onset) if fl else None
        return {'kind': 'barge', 'id': r['id'], 'missed': lat is None or lat > 1.5, 'barge_ms': None if lat is None else round(lat * 1000)}
    fl = [f for f in line.flushes if st <= f <= st + 2.5]
    what = 'noise' if r['burst'][1] == '' else {'haan': 'haan', 'haan ji': 'nod500', 'achha haan ji': 'nod700'}[r['burst'][1]]
    return {'kind': 'backchannel', 'id': r['id'], 'what': what, 'false_barge': bool(fl)}


def bursts(c):
    import numpy as np
    a = int(c['speech'][0][0] * 16000) * 2
    rng = np.random.default_rng(int(hashlib.sha256(c['id'].encode()).hexdigest()[:8], 16))
    noise = (rng.standard_normal(4800) * 32768 * 10 ** (-30 / 20)).clip(-32768, 32767).astype('<i2').tobytes()
    return [(c['pcm'][a:a + int(d * 16000) * 2], text) for d, text in NODS] + [(noise, '')]


# ------------------------------------------------------------------------------------------------ stats
def wilson(k, n, z=1.96):
    if n == 0: return [None, None]
    p = k / n; d = 1 + z * z / n; c = p + z * z / (2 * n); h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return [round((c - h) / d, 3), round((c + h) / d, 3)]


def boot_median(xs, b=2000, seed=7):
    if not xs: return [None, None]
    rng = random.Random(seed); ms = sorted(statistics.median(rng.choices(xs, k=len(xs))) for _ in range(b))
    return [round(ms[int(0.025 * b)]), round(ms[int(0.975 * b)])]


def summarise(rows):
    T = [r for r in rows if r['kind'] == 'turn']; B = [r for r in rows if r['kind'] == 'barge']; C = [r for r in rows if r['kind'] == 'backchannel']
    prop = lambda xs, key: {'k': sum(1 for x in xs if x[key]), 'n': len(xs), 'rate': round(sum(1 for x in xs if x[key]) / len(xs), 3) if xs else None,
                            'ci95': wilson(sum(1 for x in xs if x[key]), len(xs))}
    S = [r for r in rows if r['kind'] == 'statement']; seot = [r['eot_ms'] for r in S if r['eot_ms'] is not None]
    eot = [r['eot_ms'] for r in T if r['eot_ms'] is not None]; bl = [r['barge_ms'] for r in B if r['barge_ms'] is not None]
    np_ = sum(r['pauses'] for r in T); kp = sum(r['cut_pauses'] for r in T)
    return {
        'end_of_turn_ms': {'n': len(eot), 'median': round(statistics.median(eot)) if eot else None, 'median_ci95': boot_median(eot),
                           'p90': sorted(eot)[int(0.9 * (len(eot) - 1))] if eot else None,
                           'note': f'end of caller speech -> her first audio; includes the fakes fixed {BRAIN_MS + TTS_MS} ms (brain + voice), not the {FINAL_MS} ms final'},
        'end_of_turn_statement_ms': {'n': len(seot), 'median': round(statistics.median(seot)) if seot else None, 'median_ci95': boot_median(seot),
                                     'p90': sorted(seot)[int(0.9 * (len(seot) - 1))] if seot else None},
        'no_reply_statement': prop(S, 'no_reply'),
        'premature_cut_in_per_turn': prop(T, 'premature'),
        'premature_cut_in_per_pause': {'k': kp, 'n': np_, 'rate': round(kp / np_, 3) if np_ else None, 'ci95': wilson(kp, np_)},
        'talk_over_per_turn': prop(T, 'talk_over'),
        'no_reply_per_turn': prop(T, 'no_reply'),
        'missed_barge_in': prop(B, 'missed'),
        'barge_in_ms': {'n': len(bl), 'median': round(statistics.median(bl)) if bl else None, 'median_ci95': boot_median(bl)},
        'false_barge_in_backchannel': prop([r for r in C if r['what'] == 'haan'], 'false_barge'),
        'false_barge_in_noise': prop([r for r in C if r['what'] == 'noise'], 'false_barge'),
        'false_barge_in_nod_500ms': prop([r for r in C if r['what'] == 'nod500'], 'false_barge'),
        'false_barge_in_nod_700ms': prop([r for r in C if r['what'] == 'nod700'], 'false_barge'),
    }


async def run_all(clips, conc, only=None):
    jobs = []
    for c in clips:
        jobs += [('turn', c, None), ('barge', c, None)] + [('backchannel', c, b) for b in bursts(c)]
        sc = statement_cut(c)
        if sc: jobs.append(('statement', sc, None))
    if only: jobs = [j for j in jobs if j[0] in only]
    sem = asyncio.Semaphore(conc); out = []
    async def one(j):
        async with sem: out.append(score(await run_one(*j)))
    await asyncio.gather(*(one(j) for j in jobs))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--split', choices=['dev', 'test', 'all'], default='dev'); ap.add_argument('--limit', type=int)
    ap.add_argument('--conc', type=int, default=8); ap.add_argument('--vad', choices=['silero', 'energy'], default='silero')
    ap.add_argument('--set', action='append', default=[], help='CascadeSession attribute=value, e.g. HOLD_MS=400')
    ap.add_argument('--out', help='write <out>.json and <out>.md')
    ap.add_argument('--partial-ms', type=int, default=0, help='how late the fake recogniser\'s partials carry each word')
    ap.add_argument('--only', nargs='*', choices=['turn', 'statement', 'barge', 'backchannel'], help='run only these scenarios (tuning sweeps)')
    a = ap.parse_args()
    if a.vad == 'energy': os.environ['VP_VAD'] = 'energy'
    global PARTIAL_LAG; PARTIAL_LAG = a.partial_ms / 1000
    from vpvoice import audio
    from vpvoice.cascade import CascadeSession
    for kv in a.set:
        k, v = kv.split('='); setattr(CascadeSession, k, int(v))
    clips = [c for c in load_clips() if a.split == 'all' or c['split'] == a.split][:a.limit]
    params = {k: getattr(CascadeSession, k) for k in ('HOLD_MS', 'STATEMENT_HOLD_MS', 'LONG_HOLD_MS', 'BARGE_MS', 'BARGE_WORDS', 'BARGE_LONG_MS', 'BARGE_NOD', 'BARGE_NOD_LONG_MS')}
    params['partial_ms'] = a.partial_ms
    vad = type(audio.make_vad()).__name__
    t0 = time.time(); rows = asyncio.run(run_all(clips, a.conc, a.only))
    sha = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=HERE, capture_output=True, text=True).stdout.strip()
    rep = {'git': sha, 'date': time.strftime('%Y-%m-%d'), 'split': a.split, 'clips': len(clips), 'vad': vad, 'params': params,
           'fakes': {'final_ms': FINAL_MS, 'brain_ms': BRAIN_MS, 'tts_ms': TTS_MS, 'audio_s_per_char': AUDIO_PER_CHAR},
           'wall_s': round(time.time() - t0), 'metrics': summarise(rows), 'rows': rows}
    m = rep['metrics']
    md = [f"# Turn-taking bench, {rep['date']} ({sha}), split {a.split}, {len(clips)} clips, VAD {vad}", '', f"params {params}", '',
          '| metric | value | n | 95% CI |', '|---|---|---|---|']
    for k, v in m.items():
        if not v.get('n'): continue
        if 'rate' in v: md.append(f"| {k} | {v['rate']} ({v['k']}) | {v['n']} | {v['ci95']} |")
        else: md.append(f"| {k} (median ms) | {v['median']} | {v['n']} | {v['median_ci95']} |")
    print('\n'.join(md), flush=True)
    if a.out:
        json.dump(rep, open(a.out + '.json', 'w'), indent=1, ensure_ascii=False)
        open(a.out + '.md', 'w').write('\n'.join(md) + '\n\n' + m['end_of_turn_ms']['note'] + '\n')


if __name__ == '__main__':
    main()
