# Voice samples for the stack cards ("Hear it"): one short clip per curated stack, rendered through the runtime's own
# voice adapters (providers/tts.py; Gemini Live for an s2s stack), with the stack's default voice and her neutral
# style, so the sample is exactly how she sounds on that stack. Stacks that share a voice share one clip (one request).
#
#   python -m vpvoice.samples --out DIR [--stack v2-flashlite --stack v2-mai ...]       # real adapters (keys, India)
#   VP_DEVSIM=1 python -m vpvoice.samples --out DIR --devsim                            # offline fakes (tests)
#
# Writes only inside --out: <tts>-<voice>.ogg (Opus, mono, loudness-normalised to -16 LUFS, true peak -1.5 dB) and
# manifest.json, the shape web reads (product/web/public/samples/manifest.json): {stackId: {file, durationS, text,
# recordedAt, combinationId, voice, tts}}. Entries for stacks not rendered this run are kept. Refuses in production
# mode (NODE_ENV / VP_ENV = production): a sample run is a lab job, never part of serving calls. Google requests start
# at least 1 s apart (the Vertex rate rule) and go only through GoogleRoute (India only).
import argparse, asyncio, base64, datetime, json, os, re, subprocess, sys, time
import numpy as np
from . import catalog, stacks
from .safety import disclosure_line

# One fixed, neutral opening: the person is "Asha", the disclosure is the shared fixed line (no brand), no product claim.
TEXT = 'नमस्ते आशा जी। ' + disclosure_line('', 'hi-IN') + ' क्या अभी आपसे दो मिनट बात हो सकती है?'
MAX_S = 12.0
RATE = 24000
GOOGLE_GAP_S = 1.0
LIVE_SYSTEM = ('You are a voice actor. When you are given a line, say exactly that line, word for word, once, warmly and '
               'naturally, in the voice of a friendly Indian telecaller. Say nothing else.')


def production(env):
    return any((env.get(k) or '').strip().lower() in ('production', 'prod') for k in ('NODE_ENV', 'VP_ENV', 'VP_MODE'))


def curated():
    return [k for k, s in stacks.STACKS.items() if s.get('status') != 'retired']


def safe_name(s):
    return re.sub(r'[^A-Za-z0-9._-]+', '_', s).strip('._') or 'sample'


def inside(out, name):
    """The path for `name` inside out; refuses anything that would land elsewhere."""
    root = os.path.realpath(out); p = os.path.realpath(os.path.join(root, name))
    if os.path.dirname(p) != root: raise ValueError(f'refusing to write outside --out: {name!r}')
    return p


def trim(pcm, rate=RATE, pad_s=0.15, floor=200):
    a = np.frombuffer(pcm[:len(pcm) // 2 * 2], dtype='<i2')
    loud = np.nonzero(np.abs(a.astype(np.int32)) > floor)[0]
    if not len(loud): return b''
    pad = int(pad_s * rate); s = max(0, loud[0] - pad); e = min(len(a), loud[-1] + pad)
    return a[s:e].tobytes()


def encode(pcm, path, rate=RATE):
    """PCM16 mono -> Ogg/Opus at path, loudness-normalised (EBU R128, single pass). Returns the duration in seconds."""
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(rate), '-ac', '1', '-i', 'pipe:0',
           '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'libopus', '-b:a', '48k', '-f', 'ogg', path]
    p = subprocess.run(cmd, input=pcm, capture_output=True, timeout=60)
    if p.returncode: raise RuntimeError('ffmpeg: ' + p.stderr.decode(errors='replace')[:300])
    return round(len(pcm) / 2 / rate, 2)


async def speak_cascade(voice, text):
    usage, timing, out = {}, {}, bytearray()
    style = None                                  # her neutral style: no tone note
    async for ch in voice.speak(text, style if voice.styled else None, usage, timing):
        out += ch
    return bytes(out), None


async def speak_live(http, google, spec, voice_name, text):
    """Gemini Live told to say the line verbatim. Returns (pcm24, what its own transcription says it said)."""
    from .s2s import connect, setup_msg
    from .providers.google import ws_text
    setup = setup_msg(spec, voice_name, LIVE_SYSTEM, model=google.resource(spec['model']))
    setup['setup'].pop('tools', None)
    ws = await connect(http, google, setup, spec['model'])
    pcm = bytearray(); said = ''
    try:
        await ws.send_json({'clientContent': {'turns': [{'role': 'user', 'parts': [{'text': text}]}], 'turnComplete': True}})
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            m = await ws.receive(timeout=20); txt = ws_text(m)
            if txt is None: break
            sc = json.loads(txt).get('serverContent') or {}
            for p in (sc.get('modelTurn') or {}).get('parts') or []:
                d = (p.get('inlineData') or {}).get('data')
                if d: pcm += base64.b64decode(d)
            said += (sc.get('outputTranscription') or {}).get('text', '')
            if sc.get('turnComplete'): break
    finally:
        await ws.close()
    return bytes(pcm), said.strip()


class Real:
    """The product's own adapters, as a call builds them (providers.build)."""
    def __init__(self, http, env):
        from .providers.google import GoogleRoute
        self.http = http; self.env = env; self.google = GoogleRoute(env); self.last_google = 0.0

    def unavailable(self, part, cid):
        from .providers.components import reason
        return reason(part, cid, self.env, self.google)

    async def _pace(self):
        wait = self.last_google + GOOGLE_GAP_S - time.monotonic()
        if wait > 0: await asyncio.sleep(wait)
        self.last_google = time.monotonic()

    async def render(self, s, voice_name):
        c = s['components']
        if s['kind'] == 's2s':
            why = self.unavailable('s2s', c['s2s'])
            if why: raise RuntimeError(why)
            await self._pace()
            return await speak_live(self.http, self.google, catalog.S2S[c['s2s']], voice_name, TEXT)
        why = self.unavailable('voice', c['voice'])
        if why: raise RuntimeError(why)
        from .providers.tts import make_voice
        v = make_voice(self.http, c['voice'], voice_name, self.env, self.google)
        try:
            if catalog.TTS[c['voice']]['kind'] == 'gemini': await self._pace()
            return await speak_cascade(v, TEXT)
        finally:
            await v.close()


class Fake:
    """devsim's fake voice (a quiet tone), offline: for tests and dry runs."""
    def __init__(self):
        from .devsim import FakeVoice
        self.voice = FakeVoice()

    async def render(self, s, voice_name):
        if s['kind'] == 's2s':
            pcm, _ = await speak_cascade(self.voice, TEXT); return pcm, TEXT
        return await speak_cascade(self.voice, TEXT)


async def run(out, stack_ids, renderer, now=None):
    """Render, encode and write the manifest. Returns (manifest, errors {stackId: reason})."""
    os.makedirs(out, exist_ok=True)
    mpath = inside(out, 'manifest.json')
    try:
        with open(mpath, encoding='utf-8') as f: manifest = json.load(f)
    except (OSError, ValueError): manifest = {}
    if not isinstance(manifest, dict): manifest = {}
    when = (now or datetime.datetime.now(datetime.timezone.utc)).strftime('%Y-%m-%dT%H:%M:%SZ')
    done = {}; errors = {}
    for sid in stack_ids:
        s = stacks.spec(sid); voice_name = stacks.voices(s)[1]
        c = s['components']; part = c.get('s2s') or c.get('voice')
        clip = safe_name(f'{part}-{voice_name}') + '.ogg'
        try:
            if clip not in done:
                pcm, said = await renderer.render(s, voice_name)
                pcm = trim(pcm)
                if not pcm: raise RuntimeError('the voice returned no audio')
                dur = len(pcm) / 2 / RATE
                if dur > MAX_S: raise RuntimeError(f'sample is {dur:.1f} s, over {MAX_S:.0f} s')
                done[clip] = (encode(pcm, inside(out, clip)), said)
            dur, said = done[clip]
            e = {'file': clip, 'durationS': dur, 'text': TEXT, 'recordedAt': when, 'combinationId': stacks.combination_id(s, voice_name),
                 'voice': voice_name, 'tts': part}
            if said is not None: e['spokenText'] = said             # Live does not promise verbatim: what it said
            manifest[s['id']] = e
        except Exception as ex:
            errors[sid] = str(ex)[:300]
    tmp = inside(out, '.manifest.json.tmp')
    with open(tmp, 'w', encoding='utf-8') as f: json.dump(manifest, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, mpath)
    return manifest, errors


def main(argv=None, env=None):
    env = os.environ if env is None else env
    ap = argparse.ArgumentParser(prog='python -m vpvoice.samples')
    ap.add_argument('--out', required=True); ap.add_argument('--stack', action='append', help='a curated stack id (repeatable); default all')
    ap.add_argument('--devsim', action='store_true', help='offline fake voice (needs VP_DEVSIM=1)')
    a = ap.parse_args(argv)
    if production(env): print('vpvoice.samples refuses to run in production mode', file=sys.stderr); return 2
    if a.devsim and env.get('VP_DEVSIM') != '1': print('--devsim needs VP_DEVSIM=1', file=sys.stderr); return 2
    ids = a.stack or curated()
    bad = [x for x in ids if x not in stacks.STACKS]
    if bad: print('not a curated stack: ' + ', '.join(bad), file=sys.stderr); return 2

    async def go():
        if a.devsim: return await run(a.out, ids, Fake())
        import aiohttp
        async with aiohttp.ClientSession() as http:
            return await run(a.out, ids, Real(http, env))
    manifest, errors = asyncio.run(go())
    for sid in ids:
        if sid in errors: print(f'{sid}: not rendered: {errors[sid]}')
        else: print(f"{sid}: {manifest[sid]['file']} {manifest[sid]['durationS']} s")
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
