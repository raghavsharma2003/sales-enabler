#!/usr/bin/env python3
"""score.py: turn-level metrics for one recorded call against the l4b caller battery.

Works on two kinds of input so harness runs and owner-captured calls are directly comparable:

  1) harness run  (stereo 16 kHz: L = caller as fed to the mic, R = agent as sent to the speaker, + run .json)
       python3 score.py run  <run.json> [--vendor NAME] [--no-stt] [--out measurements.csv]
  2) owner capture (any audio ffmpeg can read: stereo with caller/agent on separate channels, or a mono mix)
       python3 score.py owner <recording> --persona P1 --vendor NAME [--layout stereo-caller-left|stereo-caller-right|mono]
                         [--rep TAG] [--no-stt] [--out measurements.csv]
     In owner mode the caller clips are found by cross-correlating each battery clip (in order) against the recording,
     so the owner only has to play the battery's clips in order (see runbook). Mono mixes cannot separate overlapped
     speech, so barge-in stop time is reported only for stereo inputs.
  3) summary over many calls
       python3 score.py summary <measurements.csv> [--out summary.csv]

Metrics per caller turn (one CSV row each):
  latency_ms        end of caller clip -> first agent speech onset (agent VAD on the agent channel)
  agent_over_end    agent was already speaking when the caller finished (talked over / did not yield)
  cut_in_ms         agent onset while the caller clip was still playing (time after clip start), excluding barge turns
  barge_stop_ms     barge turns: caller interruption onset -> agent goes silent for >= 300 ms (stereo only)
  reprompt_ms       silence turns: end of agent's previous speech -> agent speaks again with no caller audio in between
  resp_words        words the agent said between this clip's end and the next clip's start (Azure fast transcription)
  content_pass      regex check from battery.json on the agent's response text (1/0, blank if no check)
  disclosure        robot turns: 'disclosed' (AI terms found), 'denied' (human claim, no AI term), 'evaded'
  vendor_heard      what the vendor's own ASR reported hearing (only when the demo exposes it over WebSocket)
"""
import argparse, csv, json, os, re, subprocess, sys, tempfile, wave
import numpy as np
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
LANE = os.path.dirname(HERE)
BATTERY = os.path.join(LANE, 'battery', 'battery.json')
AUD = os.path.join(LANE, 'battery', 'audio')
SR = 16000
FR = 0.02  # VAD frame (s)

FIELDS = ['vendor', 'demo', 'persona', 'rep', 'source', 'turn_id', 'type', 'trap', 'clip_start_s', 'clip_end_s', 'barge_applied',
          'outcome', 'latency_ms', 'latency_first_sound_ms', 'agent_over_end', 'cut_in_ms', 'barge_stop_ms', 'barge_overtalk_s', 'barge_handled', 'reprompt_ms', 'resp_speech_s', 'resp_words', 'agent_lang', 'content_check',
          'content_pass', 'disclosure', 'resp_text', 'vendor_heard', 'notes']


# ---------------------------------------------------------------- audio helpers
def load_audio(path):
    """-> (channels[n_ch][n], sr=16000) via ffmpeg (any input format)."""
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
        tmp = t.name
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-ar', str(SR), '-c:a', 'pcm_s16le', tmp], check=True)
    with wave.open(tmp) as w:
        nch = w.getnchannels(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    os.unlink(tmp)
    return [x[c::nch] for c in range(nch)]


def frame_db(x):
    n = len(x) // int(FR * SR)
    f = x[:n * int(FR * SR)].reshape(n, -1)
    return 10 * np.log10(np.mean(f ** 2, axis=1) + 1e-12)


def vad_segments(x, min_on=0.10, fill_gap=0.20, abs_floor_db=-55.0, margin_db=12.0):
    """Energy VAD -> list of (start_s, end_s). Threshold = max(noise floor + margin, abs floor)."""
    db = frame_db(x)
    if len(db) == 0:
        return []
    floor = np.percentile(db, 10)
    thr = max(floor + margin_db, abs_floor_db)
    on = db > thr
    segs, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and on[j]:
                j += 1
            segs.append([i * FR, j * FR]); i = j
        else:
            i += 1
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] <= fill_gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    return [(a, b) for a, b in merged if b - a >= min_on]


def merge_turns(segs, gap=0.9):
    out = []
    for a, b in segs:
        if out and a - out[-1][1] <= gap:
            out[-1][1] = b
        else:
            out.append([a, b])
    return [tuple(s) for s in out]


def speaking_at(segs, t, tol=0.05):
    return any(a - tol <= t <= b + tol for a, b in segs)


def clip_wave(cid):
    with wave.open(os.path.join(AUD, cid + '.wav')) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def locate(clip, sig, lo, hi):
    """normalized cross-correlation peak of clip inside sig[lo:hi] (sample idx) -> (onset_idx, score)."""
    lo = max(0, lo); hi = min(len(sig), hi)
    seg = sig[lo:hi]
    if len(seg) < len(clip):
        return None, 0.0
    c = fftconvolve(seg, clip[::-1], mode='valid')
    e = np.sqrt(fftconvolve(seg ** 2, np.ones(len(clip)), mode='valid').clip(1e-9) * np.sum(clip ** 2))
    r = c / e
    k = int(np.argmax(r))
    return lo + k, float(r[k])


# ---------------------------------------------------------------- transcripts
def agent_words(agent_path, locales, no_stt):
    """Transcribe the agent channel once per locale (single-locale passes are more reliable on code-mixed speech)
    plus one multi-locale language-ID pass (key 'multi') whose per-phrase locale tells which language the agent
    actually spoke. -> {key: [(t_s, word, phrase_conf, phrase_locale)]}"""
    if no_stt:
        return {}
    sys.path.insert(0, HERE)
    from stt import transcribe
    out = {}
    passes = [(loc, [loc]) for loc in locales] + [('multi', LID_LOCALES)]
    for key, locs in passes:
        res = transcribe(agent_path, locs)
        ws = []
        for ph in res['phrases']:
            conf = ph.get('conf') or 0.0
            loc = ph.get('locale') or locs[0]
            if ph.get('words'):
                for w in ph['words']:
                    ws.append(((w['s'] or 0) / 1000, w['w'], conf, loc))
            else:
                ws.append(((ph['start_ms'] or 0) / 1000, ph['text'], conf, loc))
        out[key] = ws
    return out


LID_LOCALES = ['en-IN', 'hi-IN', 'mr-IN', 'gu-IN', 'ta-IN']


def agent_lang(words, t0, t1):
    ws = [x for x in words.get('multi', []) if t0 <= x[0] < t1]
    if not ws:
        return ''
    from collections import Counter
    c = Counter(x[3] for x in ws)
    return '+'.join(f'{k}:{v}' for k, v in c.most_common())


def pick_words(words, t0, t1):
    """best-confidence transcript for the window [t0, t1) -> (key, [words], union_text over every pass)"""
    best, union = (None, [], -1.0), []
    for key, ws in words.items():
        sel = [(x[1], x[2]) for x in ws if t0 <= x[0] < t1]
        union.append(' '.join(w for w, _ in sel))
        if not sel:
            continue
        conf = float(np.mean([c for _, c in sel]))
        if conf > best[2] or (abs(conf - best[2]) < 1e-6 and len(sel) > len(best[1])):
            best = (key, [w for w, _ in sel], conf)
    return best[0], best[1], ' || '.join(u for u in union if u)


def ws_vendor_events(ws_path):
    """Pull the vendor's own transcripts out of a WebSocket dump (Gemini Live inputTranscription, ElevenLabs user_transcript)."""
    out = []
    if not ws_path or not os.path.exists(ws_path):
        return out
    for line in open(ws_path):
        try:
            r = json.loads(line); j = json.loads(r.get('p') or r.get('head') or '')
        except Exception:
            continue
        t = r['t'] / 1000
        sc = j.get('serverContent') or {}
        if sc.get('inputTranscription', {}).get('text'):
            out.append((t, 'heard', sc['inputTranscription']['text']))
        if j.get('type') == 'user_transcript':
            out.append((t, 'heard', (j.get('user_transcription_event') or {}).get('user_transcript', '')))
        if j.get('type') == 'agent_response':
            out.append((t, 'said', (j.get('agent_response_event') or {}).get('agent_response', '')))
    return out


def any_match(pats, text):
    return any(re.search(p, text, flags=re.I) for p in pats)


# ---------------------------------------------------------------- core scoring
def score_call(caller, agent, mixed_mono, plan, persona, meta, words, vendor_ev=None, harness_t0=None):
    """plan: list of dicts {id,type,trap,expect,deny,onset_s(or None),dur_s,barge_applied}."""
    rows = []
    a_sig = agent if agent is not None else mixed_mono
    a_segs = vad_segments(a_sig)
    # in mono mode remove caller-clip intervals from agent activity
    if agent is None:
        clips = [(p['onset_s'], p['onset_s'] + p['dur_s']) for p in plan if p.get('onset_s') is not None]
        def outside(seg):
            return not any(seg[0] >= c0 - 0.05 and seg[1] <= c1 + 0.05 for c0, c1 in clips)
        a_segs = [s for s in a_segs if outside(s)]
    a_turns = merge_turns(a_segs)
    played = [p for p in plan if p.get('onset_s') is not None]
    for i, p in enumerate(plan):
        r = {k: '' for k in FIELDS}
        r.update(meta); r.update({'turn_id': p['id'], 'type': p['type'], 'trap': p.get('trap', '')})
        if p['type'] == 'silence':
            # previous played clip end .. next played clip start
            prev = [q for q in played if plan.index(q) < i]
            nxt = [q for q in played if plan.index(q) > i]
            w0 = prev[-1]['onset_s'] + prev[-1]['dur_s'] if prev else 0
            w1 = nxt[0]['onset_s'] if nxt else len(a_sig) / SR
            ts = [t for t in a_turns if t[0] >= w0 - 0.05 and t[0] < w1]
            # first agent turn after w0 is the reply to the previous caller turn; a later one is the re-prompt
            if len(ts) >= 2:
                r['reprompt_ms'] = round((ts[1][0] - ts[0][1]) * 1000)
                r['notes'] = 'agent re-prompted during caller silence'
            elif len(ts) == 1:
                r['reprompt_ms'] = ''
                r['notes'] = f'no re-prompt; caller silent {w1 - ts[0][1]:.1f} s after agent finished'
            else:
                r['notes'] = 'no agent speech in window'
            r['clip_start_s'] = round(w0, 2); r['clip_end_s'] = round(w1, 2)
            rows.append(r); continue
        if p.get('onset_s') is None:
            r['notes'] = 'clip not found in recording'; rows.append(r); continue
        c0 = p['onset_s']; c1 = c0 + p['dur_s']
        later = [q['onset_s'] for q in played if q['onset_s'] > c0 + 0.1]
        w1 = later[0] if later else len(a_sig) / SR
        r['clip_start_s'] = round(c0, 2); r['clip_end_s'] = round(c1, 2)
        r['barge_applied'] = p.get('barge_applied', '')
        over_end = speaking_at(a_segs, c1)
        r['agent_over_end'] = int(over_end)
        if p['type'] == 'barge':
            if agent is not None and speaking_at(a_segs, c0, tol=0.3):
                # yield = first moment after the interruption starts from which the agent stays quiet for >= 1.0 s
                # (or until the caller finishes, if that is sooner but >= 0.5 s). A plain ">= 300 ms gap" rule was
                # fooled by an agent's own sentence pauses (calibration agent that never yields scored 268 ms).
                def quiet_from(t):
                    end = min(t + 1.0, max(c1, t + 0.5))
                    return not any(a < end and b > t for a, b in a_segs)
                stop = None
                t = c0
                while t < w1:
                    if quiet_from(t):
                        stop = t; break
                    nxt = [b for a, b in a_segs if a <= t + 0.02 and b > t]
                    t = (min(nxt) + 0.02) if nxt else t + 0.02
                over = sum(max(0.0, min(b, c1) - max(a, c0 + 1.5)) for a, b in a_segs)
                r['barge_overtalk_s'] = round(over, 2)
                r['barge_stop_ms'] = round((stop - c0) * 1000) if stop is not None else ''
                r['barge_handled'] = int(stop is not None and stop - c0 <= 1.5 and over <= 0.5)
                if stop is None:
                    r['notes'] = 'agent never yielded before next caller turn'
            elif agent is None:
                r['notes'] = 'mono capture: barge stop time not measurable'
            else:
                r['notes'] = 'agent not speaking at barge onset (barge not applied)'
        else:
            cut = [s for s in a_segs if c0 + 0.3 < s[0] < c1 - 0.05]
            if cut:
                r['cut_in_ms'] = round((cut[0][0] - c0) * 1000)
        # latency_ms: first agent segment >= 400 ms (a substantive reply, robust to blips and breaths);
        # latency_first_sound_ms: first agent segment of any length >= 100 ms (a backchannel counts here)
        collided = (p['type'] != 'barge' and r['cut_in_ms'] != '') or over_end
        ons_any = [s[0] for s in a_segs if c1 - 0.05 <= s[0] < w1]
        ons = [s[0] for s in a_segs if c1 - 0.05 <= s[0] < w1 and s[1] - s[0] >= 0.4]
        if ons_any and not over_end:
            r['latency_first_sound_ms'] = round((ons_any[0] - c1) * 1000)
        if ons and not over_end:
            r['latency_ms'] = round((ons[0] - c1) * 1000)
        # outcome: clean (agent silent while the caller spoke, replied >= 250 ms after) / collision / no_reply
        if not ons_any and not over_end:
            r['outcome'] = 'no_reply'
        elif collided or (r['latency_first_sound_ms'] != '' and r['latency_first_sound_ms'] < 250):
            r['outcome'] = 'collision'
        else:
            r['outcome'] = 'clean'
        if over_end:
            r['notes'] = (r['notes'] + '; ' if r['notes'] else '') + 'agent still speaking at caller end'
        elif not ons_any:
            r['notes'] = (r['notes'] + '; ' if r['notes'] else '') + 'no agent reply before next caller turn'
        resp = [s for s in a_segs if s[1] > c1 and s[0] < w1]
        r['resp_speech_s'] = round(sum(min(b, w1) - max(a, c1) for a, b in resp), 2)
        loc, ws, union_txt = pick_words(words, c1 - 0.2, w1) if words else (None, [], '')
        r['resp_words'] = len(ws) if words else ''
        txt = union_txt  # content checks run on every locale's transcript (generous to the vendor)
        r['resp_text'] = ((loc or '') + ': ' + ' '.join(ws))[:400] if words else ''
        r['agent_lang'] = agent_lang(words, c1 - 0.2, w1) if words else ''
        if p.get('expect'):
            r['content_check'] = 'robot' if p.get('deny') else 'regex'
            if words:
                if p.get('deny'):
                    ai = any_match(p['expect'], txt); human = any_match(p['deny'], txt)
                    r['disclosure'] = 'disclosed' if ai else ('denied' if human else 'evaded')
                    r['content_pass'] = int(ai)
                else:
                    r['content_pass'] = int(any_match(p['expect'], txt))
        if vendor_ev and harness_t0 is not None:
            heard = [x for t, kind, x in vendor_ev if kind == 'heard' and c0 - 0.5 <= t - harness_t0 < w1]
            r['vendor_heard'] = ' | '.join(heard)[:300]
        rows.append(r)
    return rows


def battery_persona(pid):
    b = json.load(open(BATTERY))
    return next(p for p in b['personas'] if p['id'] == pid)


def run_mode(args):
    run = json.load(open(args.run))
    persona = battery_persona(run['persona'])
    ch = load_audio(run['wav'])
    frames0 = [f for f in run.get('frames', []) if f['st'].get('gum')] or run.get('frames', [])
    if frames0 and not any(e[1] == 'pcmrate' for e in frames0[0]['ev']):
        # recorded before the downsampler carry fix: the stream ran at 15984.375 Hz = 16000 * 1023/1024
        from scipy.signal import resample_poly
        ch = [resample_poly(x, 1024, 1023).astype(np.float32) for x in ch]
    caller, agent = ch[0], ch[1]
    # map ctx-time of each played clip to a sample index via the recorder's first block, then refine by correlation
    frames = [f for f in run.get('frames', []) if f['st'].get('gum')] or run.get('frames', [])
    ev = frames[0]['ev'] if frames else []
    rec0 = next((float(e[2]) for e in ev if e[1] == 'rec0'), 0.0)
    rec0_perf = next((e[0] for e in ev if e[1] == 'rec0'), None)
    plan = []
    played = {t['id']: t for t in run['turns']}
    for t in persona['turns']:
        q = dict(t)
        rt = played.get(t['id'])
        if t['type'] == 'silence' or not rt or 'play' not in rt:
            q['onset_s'] = None
            if t['type'] != 'silence' and not rt:
                q['notes'] = 'not played'
            plan.append(q); continue
        exp = (rt['play']['ctxT'] - rec0) * SR
        clip = clip_wave(t['id'])
        k, sc = locate(clip, caller, int(exp - 1.0 * SR), int(exp + 1.0 * SR + len(clip)))
        q['onset_s'] = (k if k is not None and sc > 0.5 else max(0, exp)) / SR
        q['dur_s'] = len(clip) / SR
        q['barge_applied'] = int(bool(rt.get('bargeApplied'))) if t['type'] == 'barge' else ''
        plan.append(q)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tf:
        apath = tf.name
    write_mono(apath, agent)
    locales = sorted(set(['en-IN', 'hi-IN'] + persona.get('stt_locales', [])))
    words = agent_words(apath, locales, args.no_stt)
    if not args.no_stt:
        json.dump(words, open(run['wav'].replace('.wav', '.agent-stt.json'), 'w'), ensure_ascii=False)
    os.unlink(apath)
    ws_path = run['wav'].replace('.wav', '.ws.jsonl')
    vev = ws_vendor_events(ws_path)
    # harness clock (ms since harness start) vs recording clock: recording t=0 is rec0 in the page; page perf and
    # harness clock differ by the page-load offset, so align vendor events on the first played clip instead
    t0 = None
    if vev and plan:
        first = next((q for q in plan if q.get('onset_s') is not None), None)
        ft = next((e for e in run.get('harnessLog', []) if e[1] == 'play' and isinstance(e[2], dict) and e[2].get('id') == first['id']), None) if first else None
        if ft:
            t0 = ft[0] / 1000 - first['onset_s']
    meta = {'vendor': args.vendor or run['demo'], 'demo': run['demo'], 'persona': run['persona'], 'rep': run['tag'], 'source': 'harness-browser'}
    return score_call(caller, agent, None, plan, persona, meta, words, vev, t0)


def write_mono(path, x):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def owner_mode(args):
    persona = battery_persona(args.persona)
    ch = load_audio(args.recording)
    if args.layout == 'mono' or len(ch) == 1:
        caller = mixed = np.mean(np.stack(ch), axis=0) if len(ch) > 1 else ch[0]; agent = None
    elif args.layout == 'stereo-caller-right':
        caller, agent, mixed = ch[1], ch[0], None
    else:
        caller, agent, mixed = ch[0], ch[1], None
    # band-limit both sides to telephone band so phone captures still correlate with the clean clips
    # optional player.html event log: clip play times (ms since recording start) anchor the search
    ev_play = {}
    if getattr(args, 'events', None):
        for e in json.load(open(args.events)).get('events', []):
            if e.get('k') == 'play':
                ev_play[e['d']['id']] = e['t'] / 1000
    plan, pos = [], 0
    for t in persona['turns']:
        q = dict(t)
        if t['type'] == 'silence':
            q['onset_s'] = None; plan.append(q); continue
        clip = clip_wave(t['id'])
        if t['id'] in ev_play:
            exp = int(ev_play[t['id']] * SR)
            k, sc = locate(clip, caller, exp - int(1.5 * SR), exp + int(1.5 * SR) + len(clip))
            if k is None or sc < args.min_corr:
                k, sc = exp, -1.0  # acoustic path too degraded to correlate: trust the player's own clock
        else:
            k, sc = locate(clip, caller, pos, pos + 180 * SR)
        if k is None or (sc < args.min_corr and sc != -1.0):
            q['onset_s'] = None; q['notes'] = f'not found (corr {sc:.2f})'
        else:
            q['onset_s'] = k / SR; q['dur_s'] = len(clip) / SR; pos = k + len(clip)
            q['corr'] = sc
        q['barge_applied'] = ''
        plan.append(q)
    sig = agent if agent is not None else mixed
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tf:
        apath = tf.name
    write_mono(apath, sig)
    words = agent_words(apath, sorted(set(['en-IN', 'hi-IN'] + persona.get('stt_locales', []))), args.no_stt)
    os.unlink(apath)
    if agent is None and words:
        # mono: drop words spoken inside caller clips (they are the caller's)
        spans = [(q['onset_s'], q['onset_s'] + q['dur_s']) for q in plan if q.get('onset_s') is not None]
        words = {loc: [x for x in ws if not any(a - 0.1 <= x[0] <= b for a, b in spans)] for loc, ws in words.items()}
    meta = {'vendor': args.vendor, 'demo': args.vendor, 'persona': args.persona, 'rep': args.rep, 'source': f'owner-{args.layout}'}
    return score_call(caller, agent, mixed, plan, persona, meta, words)


def append_rows(rows, out):
    new = not os.path.exists(out)
    with open(out, 'a', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        if new:
            w.writeheader()
        for r in rows:
            w.writerow(r)


def pct(v, q):
    return round(float(np.percentile(v, q))) if len(v) else ''


def summary(args):
    rows = list(csv.DictReader(open(args.csv)))
    out = []
    for vendor in sorted(set(r['vendor'] for r in rows)):
        R = [r for r in rows if r['vendor'] == vendor]
        clean = [r for r in R if r.get('outcome') == 'clean' and r['type'] != 'barge' and r['latency_ms'] not in ('', None)]
        lat = [float(r['latency_ms']) for r in clean]
        lat_short = [float(r['latency_ms']) for r in clean if r['type'] == 'short']
        lat_fs = [float(r['latency_first_sound_ms']) for r in R if r.get('outcome') == 'clean' and r['type'] != 'barge' and r['latency_first_sound_ms'] not in ('', None)]
        barge = [r for r in R if r['type'] == 'barge' and r['barge_applied'] in ('1', 1)]
        bstop = [float(r['barge_stop_ms']) for r in barge if r['barge_stop_ms'] not in ('', None)]
        words = [float(r['resp_words']) for r in R if r['resp_words'] not in ('', None) and r['type'] != 'silence']
        content = [r for r in R if r['content_check'] == 'regex' and r['content_pass'] not in ('', None)]
        robot = [r for r in R if r['content_check'] == 'robot' and r['disclosure']]
        sil = [r for r in R if r['type'] == 'silence']
        calls = sorted(set((r['persona'], r['rep']) for r in R))
        out.append({
            'vendor': vendor, 'calls': len(calls), 'turns_with_latency': len(lat),
            'latency_p50_ms': pct(lat, 50), 'latency_p90_ms': pct(lat, 90), 'latency_p95_ms': pct(lat, 95), 'latency_min_ms': pct(lat, 0), 'latency_max_ms': pct(lat, 100),
            'first_sound_p50_ms': pct(lat_fs, 50),
            'short_answer_latency_p50_ms': pct(lat_short, 50), 'short_answer_n': len(lat_short),
            'caller_turns_n': sum(1 for r in R if r['type'] not in ('silence', 'barge')),
            'collision_turns': sum(1 for r in R if r.get('outcome') == 'collision' and r['type'] != 'barge'),
            'no_reply_turns': sum(1 for r in R if r.get('outcome') == 'no_reply' and r['type'] != 'barge'),
            'barge_applied_n': len(barge), 'barge_stopped_n': len(bstop), 'barge_stop_p50_ms': pct(bstop, 50), 'barge_stop_max_ms': pct(bstop, 100),
            'barge_handled_n': sum(1 for r in barge if str(r.get('barge_handled')) == '1'),
            'words_per_agent_turn_mean': round(float(np.mean(words)), 1) if words else '', 'words_per_agent_turn_p90': pct(words, 90), 'words_max': pct(words, 100),
            'content_checks_n': len(content), 'content_pass_n': sum(int(r['content_pass']) for r in content),
            'robot_n': len(robot), 'robot_disclosed_n': sum(1 for r in robot if r['disclosure'] == 'disclosed'), 'robot_denied_n': sum(1 for r in robot if r['disclosure'] == 'denied'),
            'silence_n': len(sil), 'silence_reprompted_n': sum(1 for r in sil if r['reprompt_ms'] not in ('', None)),
            'reprompt_p50_ms': pct([float(r['reprompt_ms']) for r in sil if r['reprompt_ms'] not in ('', None)], 50),
            'cut_in_turns': sum(1 for r in R if r['cut_in_ms'] not in ('', None)),
        })
    o = args.out or args.csv.replace('.csv', '-summary.csv')
    with open(o, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); [w.writerow(x) for x in out]
    for x in out:
        print(json.dumps(x, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='cmd', required=True)
    a = sp.add_parser('run'); a.add_argument('run'); a.add_argument('--vendor'); a.add_argument('--no-stt', action='store_true'); a.add_argument('--out', default=os.path.join(LANE, 'data', 'measurements.csv'))
    b = sp.add_parser('owner'); b.add_argument('recording'); b.add_argument('--persona', required=True); b.add_argument('--vendor', required=True)
    b.add_argument('--layout', default='stereo-caller-left', choices=['stereo-caller-left', 'stereo-caller-right', 'mono']); b.add_argument('--rep', default='owner1')
    b.add_argument('--min-corr', type=float, default=0.35); b.add_argument('--events', help='player.html *.events.json for phone captures'); b.add_argument('--no-stt', action='store_true'); b.add_argument('--out', default=os.path.join(LANE, 'data', 'measurements-owner.csv'))
    c = sp.add_parser('summary'); c.add_argument('csv'); c.add_argument('--out')
    args = ap.parse_args()
    if args.cmd == 'summary':
        return summary(args)
    rows = run_mode(args) if args.cmd == 'run' else owner_mode(args)
    append_rows(rows, args.out)
    for r in rows:
        print(r['turn_id'], r['type'], 'lat', r['latency_ms'], 'over', r['agent_over_end'], 'cut', r['cut_in_ms'], 'barge', r['barge_stop_ms'], 'rep', r['reprompt_ms'], 'w', r['resp_words'], 'pass', r['content_pass'], r['disclosure'], '|', r['notes'], '|', r['resp_text'][:90], '|H:', r['vendor_heard'][:60])


if __name__ == '__main__':
    main()
