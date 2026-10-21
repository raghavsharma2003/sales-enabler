# Audio-path capacity bench: N concurrent phone calls in ONE runtime process, through the real audio path, with no
# network beyond localhost and no keys. Run from product/voice:
#   python bench/audio_bench.py --calls 10 25 50 100 --seconds 120
#   python bench/audio_bench.py --calls 50 --seconds 60 --profile      # cProfile the runtime at one N
#
# The runtime runs as a separate process (python bench/audio_bench.py --serve), so the load generator's CPU is not
# counted against it. Each call is a Plivo-style bidirectional media websocket (G.711 mu-law, 8 kHz, 20 ms frames)
# into /v1/media/sip/stream, exactly the telephony leg: inbound mu-law decode -> 8->16 kHz resample -> Silero VAD
# (or the energy VAD when onnxruntime is missing) -> turn-taking -> the reply door -> outbound 24->8 kHz resample ->
# mu-law encode -> playAudio frames. Providers are fakes with realistic timing:
#   ears:  final transcript 300 ms after the VAD's end of speech
#   brain: first sentence at 700 ms, then ~30 tokens/s
#   voice: first audio 250 ms after a sentence, then audio in real time (40 ms chunks)
# Callers play synthetic speech (the Azure TTS phone-band stimuli in research/, decoded with ffmpeg), about 2 s of
# speech then 4-6 s of silence, over and over.
#
# Measured per N (after a 10 s warm-up): runtime process CPU % and per call, RSS, event-loop lag (a 10 ms sampler in
# the runtime), outbound frame gaps (a gap over 60 ms between 40 ms frames of one reply is a late frame: an audible
# glitch without a far-end buffer), turn end -> first audio inside the runtime (the runtime's own latencyMs minus the
# 1,250 ms of fake provider delay), and frames the runtime never sent.
import argparse, asyncio, base64, glob, json, os, random, statistics, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = os.path.dirname(HERE)
ROOT = os.path.abspath(os.path.join(VOICE, '..', '..'))
sys.path.insert(0, VOICE)

SECRET = 'bench-secret-not-real'
STT_S, BRAIN_FIRST_S, TTS_FIRST_S, CHUNK_S = 0.30, 0.70, 0.25, 0.04
PROVIDER_MS = (STT_S + BRAIN_FIRST_S + TTS_FIRST_S) * 1000
CLIPS = os.path.join(ROOT, 'research', '2026-10-17', 'lanes', 'l8-azure-bench', 'stimuli', 'phone')
REPLIES = ['Ji bilkul, main samajh gayi. Main aapko poori details abhi batati hoon, aaram se suniye.',
           'Achha, theek hai. Yeh option aapke liye sabse aasaan rahega, main step by step samjhati hoon.',
           'Haan ji, yeh sahi sawaal hai. Iska jawab simple hai, aur main aapko message par bhi bhej doongi.']


def q(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))] if xs else float('nan')


# ============================================================================================ the runtime side
def serve(port, profile):
    import numpy as np
    from aiohttp import web
    from vpvoice.providers import Components
    from vpvoice.server import Runtime
    from vpvoice import stacks

    stats = {'lag_ms': [], 'latency_ms': [], 'replies': 0, 'calls': 0}

    class FakeEars:
        def __init__(self, on_p, on_f, on_e, lang='hi-IN'):
            self.on_f = on_f; self.audio_s = 0.0; self.heard = False; self.n = 0
        async def start(self): pass
        def write(self, pcm, is_speech):
            if is_speech: self.audio_s += len(pcm) / 32000; self.heard = True
        def end_of_speech(self):
            if not self.heard: return
            self.heard = False; self.n += 1
            asyncio.get_running_loop().call_later(STT_S, self.on_f, ['haan ji, theek hai', 'achha, aage bataiye', 'ok, samajh gaya'][self.n % 3])
        async def close(self): pass

    class FakeBrain:
        def __init__(self): self.n = 0
        async def stream(self, messages, usage, timing, max_tokens=180):
            self.n += 1
            text = 'Namaste, main Suraksha ki AI assistant hoon, aapka thoda samay loongi.' if self.n == 1 else REPLIES[self.n % len(REPLIES)]
            first, _, rest = text.partition('. ')
            await asyncio.sleep(BRAIN_FIRST_S)
            usage.update({'in': 900, 'out': 40, 'usd': 0.0})
            yield first + ('. ' if rest else '')
            for w in rest.split(' '):
                await asyncio.sleep(1 / 30); yield w + ' '

    class FakeVoice:
        whole_reply = False; styled = False; sounds = False
        TONE = (np.sin(np.arange(int(24000 * CHUNK_S)) / 6.0) * 3000).astype('<i2').tobytes()
        async def warm(self): pass
        def reset(self): pass
        async def close(self): pass
        async def speak(self, text, style, usage, timing):
            await asyncio.sleep(TTS_FIRST_S)
            n = max(1, int(len(text) / 15 / CHUNK_S)); t0 = time.perf_counter()
            for i in range(n):
                usage['audio_s'] = usage.get('audio_s', 0) + CHUNK_S
                yield self.TONE
                await asyncio.sleep(max(0.0, t0 + (i + 1) * CHUNK_S - time.perf_counter()))     # real time

    def make_components(sid, voice, t, http, env):
        s = stacks.STACKS[sid]; c = s['components']
        comp = Components(sid, 'cascade', voice, stacks.combination_id(sid, voice), brain=FakeBrain(), brain_id=c['brain'], brain_provider='gemini',
                          ears_id=c['ears'], gated=True, tts_id=c['voice'], names={'stt': c['ears'], 'llm': c['brain'], 'tts': c['voice'], 'voice': voice})
        comp.make_ears = lambda p, f, e, lang='hi-IN': FakeEars(p, f, e, lang); comp.voice = FakeVoice()
        stats['calls'] += 1
        return comp

    class Poster:
        async def __call__(self, body):
            for e in json.loads(body)['events']:
                if e['type'] == 'turn' and e['speaker'] == 'agent' and e.get('latencyMs') is not None:
                    stats['latency_ms'].append(e['latencyMs']); stats['replies'] += 1
            return True

    env = {'VP_RUNTIME_SECRET': SECRET, 'VP_PUBLIC_URL': f'http://127.0.0.1:{port}', 'VP_CONTROL_URL': 'http://127.0.0.1:9'}
    rt = Runtime(env=env, make_components=make_components, make_poster=lambda http: Poster())
    app = rt.app()
    prof = None
    if profile:
        import cProfile; prof = cProfile.Profile()

    async def lag_sampler(app):
        async def run():
            while True:
                t = time.perf_counter(); await asyncio.sleep(0.01)
                stats['lag_ms'].append((time.perf_counter() - t - 0.01) * 1000)
        app['lag'] = asyncio.ensure_future(run())
        if prof: prof.enable()

    async def bench_stats(req):
        out = {k: (v if not isinstance(v, list) else list(v)) for k, v in stats.items()}
        if req.query.get('reset'):
            stats['lag_ms'].clear(); stats['latency_ms'].clear(); stats['replies'] = 0
        return web.json_response(out)

    async def bench_profile(req):
        import io, pstats
        if not prof: return web.Response(text='not profiling')
        prof.disable(); s = io.StringIO()
        pstats.Stats(prof, stream=s).sort_stats('tottime').print_stats(25)
        return web.Response(text=s.getvalue())

    app.on_startup.append(lag_sampler)
    app.router.add_get('/bench/stats', bench_stats)
    app.router.add_get('/bench/profile', bench_profile)
    web.run_app(app, host='127.0.0.1', port=port, print=None, access_log=None)


# ============================================================================================ the caller side
def load_clips(max_clips=8):
    files = sorted(glob.glob(os.path.join(CLIPS, '*.mp3')))[:max_clips]
    clips = []
    for f in files:
        r = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', f, '-ar', '8000', '-ac', '1', '-f', 'mulaw', '-'], capture_output=True, timeout=60)
        if r.returncode == 0 and len(r.stdout) > 16000: clips.append(r.stdout)
    return clips


def proc_cpu_s(pid):
    with open(f'/proc/{pid}/stat') as f: parts = f.read().rsplit(')', 1)[1].split()
    return (int(parts[11]) + int(parts[12])) / os.sysconf('SC_CLK_TCK')


def proc_rss_mb(pid):
    with open(f'/proc/{pid}/status') as f:
        d = dict(line.split(':', 1) for line in f if ':' in line)
    return int(d['VmRSS'].split()[0]) / 1024, int(d['VmHWM'].split()[0]) / 1024


async def one_call(http, port, k, clips, seconds, out):
    from vpvoice import signing
    from tests.fixtures import ticket
    t = ticket(transport={'kind': 'sip', 'to': '+919000000001', 'from': f'+9190000{k:05d}', 'trunk': 'plivo'}, direction='inbound')
    t['conversationId'] = f'0b6f6e1a-1c2d-4e5f-8a9b-{k + 1:012d}'
    t['limits'] = {'maxDurationS': int(seconds) + 120, 'maxCostInrMilli': 10 ** 9}
    t['agent']['limits'] = {'maxDurationS': int(seconds) + 120, 'maxSilenceS': 0, 'maxTurns': 10 ** 6}
    body = json.dumps(t).encode()
    async with http.post(f'http://127.0.0.1:{port}/v1/calls', data=body, headers={signing.HEADER: signing.sign(SECRET, body)}) as r:
        j = await r.json()
        if r.status != 202: raise RuntimeError(f'ticket refused: {r.status} {j}')
    url = j['join']['streamUrl']
    rng = random.Random(k); clip = clips[k % len(clips)] if clips else None
    arrivals = []; speech_ends = []; first_audio = []
    ws = await http.ws_connect(url, max_msg_size=0)
    await ws.send_str(json.dumps({'event': 'start', 'start': {'streamId': f's{k}', 'callId': f'c{k}'}}))

    async def reader():
        async for m in ws:
            if m.type.name != 'TEXT': continue
            d = json.loads(m.data)
            if d.get('event') == 'playAudio':
                now = time.perf_counter(); arrivals.append(now)
                if speech_ends and (not first_audio or first_audio[-1][0] < speech_ends[-1]): first_audio.append((speech_ends[-1], now))
    rd = asyncio.ensure_future(reader())
    SIL = b'\xff' * 160
    t0 = time.perf_counter() + rng.random() * 3; i = 0; end = t0 + seconds; pos = rng.randrange(0, max(1, len(clip) - 16000)) if clip else 0
    talk_until = t0 + 2.0; quiet_until = talk_until + rng.uniform(4.0, 6.0)
    while True:
        due = t0 + i * 0.02
        if due > end: break
        await asyncio.sleep(max(0.0, due - time.perf_counter()))
        now = due
        if now < talk_until and clip:
            frame = clip[pos:pos + 160]; pos += 160
            if len(frame) < 160: pos = 0; frame = clip[:160]
        else:
            frame = SIL
            if now >= talk_until and (not speech_ends or speech_ends[-1] < talk_until): speech_ends.append(talk_until)
            if now >= quiet_until:
                talk_until = now + rng.uniform(1.6, 2.4); quiet_until = talk_until + rng.uniform(4.0, 6.0)
        await ws.send_str(json.dumps({'event': 'media', 'media': {'payload': base64.b64encode(frame).decode()}}))
        i += 1
    await ws.send_str(json.dumps({'event': 'stop'})); await asyncio.sleep(0.2)
    await ws.close(); rd.cancel()
    gaps = [b - a for a, b in zip(arrivals, arrivals[1:]) if b - a < 0.5]          # within one reply
    out.append({'gaps_ms': [g * 1000 for g in gaps], 'frames': len(arrivals), 'client_latency_ms': [(b - a) * 1000 for a, b in first_audio]})


async def run_n(n, seconds, clips, profile):
    import aiohttp
    port = 18800 + n
    srv = subprocess.Popen([sys.executable, os.path.abspath(__file__), '--serve', str(port)] + (['--profile'] if profile else []),
                           cwd=VOICE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        async with aiohttp.ClientSession() as http:
            for _ in range(100):
                try:
                    async with http.get(f'http://127.0.0.1:{port}/v1/health') as r:
                        if r.status == 200: break
                except Exception: pass
                await asyncio.sleep(0.1)
            out = []; client_lag = []
            async def sampler():          # the load generator's own lag: if it is high, its jitter numbers are suspect
                while True:
                    t = time.perf_counter(); await asyncio.sleep(0.01); client_lag.append((time.perf_counter() - t - 0.01) * 1000)
            smp = asyncio.ensure_future(sampler())
            calls = asyncio.gather(*(one_call(http, port, k, clips, seconds, out) for k in range(n)))
            warm = min(10.0, seconds / 4)
            await asyncio.sleep(warm)
            async with http.get(f'http://127.0.0.1:{port}/bench/stats?reset=1') as r: await r.json()
            c0 = proc_cpu_s(srv.pid); w0 = time.perf_counter()
            await calls
            smp.cancel()
            c1 = proc_cpu_s(srv.pid); w1 = time.perf_counter()
            rss, hwm = proc_rss_mb(srv.pid)
            async with http.get(f'http://127.0.0.1:{port}/bench/stats') as r: st = await r.json()
            prof_txt = None
            if profile:
                async with http.get(f'http://127.0.0.1:{port}/bench/profile') as r: prof_txt = await r.text()
    finally:
        srv.terminate()
        try: srv.wait(10)
        except Exception: srv.kill()
    cpu = (c1 - c0) / (w1 - w0) * 100
    gaps = [g for o in out for g in o['gaps_ms']]
    late = sum(1 for g in gaps if g > CHUNK_S * 1000 + 20)
    jitter = [abs(g - CHUNK_S * 1000) for g in gaps]
    overhead = [x - PROVIDER_MS for x in st['latency_ms']]
    return {'n': n, 'cpu_pct': cpu, 'cpu_per_call': cpu / n, 'rss_mb': rss, 'hwm_mb': hwm, 'lag': st['lag_ms'], 'jitter': jitter, 'late': late,
            'frames': sum(o['frames'] for o in out), 'gaps': len(gaps), 'overhead': overhead, 'replies': st['replies'],
            'client_latency': [x for o in out for x in o['client_latency_ms']], 'client_lag': client_lag, 'profile': prof_txt}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--serve', type=int); ap.add_argument('--profile', action='store_true')
    ap.add_argument('--calls', type=int, nargs='*', default=[10, 25, 50, 100]); ap.add_argument('--seconds', type=float, default=120.0)
    a = ap.parse_args()
    if a.serve: return serve(a.serve, a.profile)
    from vpvoice import audio, rules
    sha = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=HERE, capture_output=True, text=True).stdout.strip() or 'unknown'
    clips = load_clips()
    vad = type(audio.make_vad()).__name__
    print(f'git {sha} · python {sys.version.split()[0]} · {os.cpu_count()} cpu · rules {rules.VERSION} · VAD {vad}')
    print(f'line: G.711 mu-law 8 kHz, 20 ms frames in; runtime 16 kHz internal; voice 24 kHz PCM16 in 40 ms chunks -> 8 kHz mu-law out')
    print(f'callers: {len(clips)} synthetic speech clips (Azure TTS phone stimuli) ~2 s talk / 4-6 s quiet; fake providers {PROVIDER_MS:.0f} ms per reply')
    print(f'{"N":>4} {"cpu%":>6} {"cpu%/call":>9} {"rss MB":>7} {"lag p50":>8} {"lag p99":>8} {"lag max":>8} {"jit p99":>8} {"late fr":>8} '
          f'{"overhd p50":>10} {"overhd p99":>10} {"replies":>7} {"gen lag p99":>11}')
    for n in a.calls:
        r = asyncio.run(run_n(n, a.seconds, clips, a.profile))
        print(f'{n:>4} {r["cpu_pct"]:>6.0f} {r["cpu_per_call"]:>9.2f} {r["rss_mb"]:>7.0f} {q(r["lag"], .5):>8.1f} {q(r["lag"], .99):>8.1f} '
              f'{max(r["lag"] or [0]):>8.1f} {q(r["jitter"], .99):>8.1f} {r["late"]:>4}/{r["gaps"]:<5} {q(r["overhead"], .5):>10.0f} '
              f'{q(r["overhead"], .99):>10.0f} {r["replies"]:>7} {q(r["client_lag"], .99):>11.1f}', flush=True)
        if r['profile']: print(r['profile'])
        if q(r['lag'], .99) > 200 or q(r['jitter'], .99) > 200: print('stopping: the process is saturated'); break


if __name__ == '__main__':
    main()
