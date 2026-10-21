# A development runtime with fake providers: the real HTTP surface, signing, door, events and live controls, but the
# ears, brain and voice are local fakes, so it needs no provider keys and makes no outside calls except event posts to
# VP_CONTROL_URL. For cross-process tests of the control plane (e.g. calls' live.* tools against the real routes).
#
#   VP_RUNTIME_SECRET=... VP_CONTROL_URL=http://127.0.0.1:3000 PORT=8090 python -m vpvoice.devsim
#
# Every stack id is accepted and runs on the fakes; the manifest still names the stack's real components, so a test
# must not read cost or quality into it. Never a deploy command: it refuses to start without VP_DEVSIM=1.
import asyncio, logging, os, sys
from aiohttp import web
from . import stacks
from .providers import Components
from .server import Runtime

REPLIES = ['Ji, main aapki baat samajh gayi.', 'Achha, theek hai. Main aapko details message par bhej deti hoon.',
           'Ji bilkul, aur kuch poochna ho to batayiye.']


class FakeBrain:
    """The opening is the agent's own disclosure clause (so RD1 passes); then short fixed replies in turn."""
    def __init__(self, ticket): self.t = ticket; self.n = 0

    async def stream(self, messages, usage, timing, max_tokens=180):
        a = self.t['agent']; i = self.n; self.n += 1
        if i == 0:
            clause = (a.get('opening') or {}).get('disclosureClause') or f"Main {(a.get('brand') or {}).get('spokenName', 'company')} ki AI assistant hoon."
            text = clause
        else:
            text = REPLIES[(i - 1) % len(REPLIES)]
        usage.update({'in': 100, 'out': 20, 'cached': 0, 'usd': 0.0})
        await asyncio.sleep(0.05)
        for k in range(0, len(text), 8): yield text[k:k + 8]


class FakeVoice:
    whole_reply = False; styled = False; sounds = False
    async def warm(self): pass
    def reset(self): pass
    async def close(self): pass
    async def speak(self, text, style, usage, timing):
        n = max(1, len(text) // 10) * 3
        usage['audio_s'] = usage.get('audio_s', 0) + n * 0.04; usage['chars'] = usage.get('chars', 0) + len(text)
        for _ in range(n):
            await asyncio.sleep(0.02)
            yield b'\x00\x00' * 960


class FakeEars:
    """Hears nothing: a devsim audio call has caller turns only if a test drives the sim transport."""
    audio_s = 0.0
    def __init__(self, *a, **kw): pass
    async def start(self): pass
    def write(self, pcm, is_speech): pass
    def end_of_speech(self): pass
    async def close(self): pass


def make_components(sid, voice, t, http, env):
    c = stacks.resolve(t['stack'])['components']
    comp = Components(sid, 'cascade', voice, stacks.combination_id(sid, voice), brain=FakeBrain(t), brain_id=c.get('brain', c.get('s2s', '')),
                      brain_provider='devsim', ears_id=c.get('ears', ''), tts_id=c.get('voice', ''),
                      names={'stt': c.get('ears'), 'llm': c.get('brain') or c.get('s2s'), 'tts': c.get('voice'), 'voice': voice})
    comp.voice = FakeVoice(); comp.make_ears = lambda *a, **kw: FakeEars()
    return comp


def main():
    if os.environ.get('VP_DEVSIM') != '1':
        sys.exit('vpvoice.devsim runs fake providers; set VP_DEVSIM=1 to confirm this is not a deployment')
    os.environ.setdefault('VP_VAD', 'energy')
    logging.basicConfig(level=os.environ.get('VP_LOG_LEVEL', 'INFO'), format='%(asctime)s %(levelname)s %(name)s %(message)s')
    rt = Runtime(make_components=make_components)
    web.run_app(rt.app(), host=os.environ.get('VP_BIND') or '127.0.0.1', port=int(os.environ.get('PORT', '8090')))


if __name__ == '__main__':
    main()
