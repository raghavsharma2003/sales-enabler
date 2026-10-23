# A development runtime with fake providers: the real HTTP surface, signing, door, events and live controls, but the
# ears, brain and voice are local fakes, so it needs no provider keys and makes no outside calls except event posts to
# VP_CONTROL_URL. For cross-process tests of the control plane (e.g. calls' live.* tools against the real routes, and
# the web's "Call me in the browser" over the real browser media socket: the fake ears turn each stretch of speech the
# VAD hears into the next scripted caller line, and the fake voice speaks a soft tone the page can play).
#
#   VP_RUNTIME_SECRET=... VP_CONTROL_URL=http://127.0.0.1:3000 PORT=8090 python -m vpvoice.devsim
#
# Every stack id is accepted and runs on the fakes; the manifest still names the stack's real components, so a test
# must not read cost or quality into it. Never a deploy command: it refuses to start without VP_DEVSIM=1.
import asyncio, logging, os, sys
import numpy as np
from aiohttp import web
from . import stacks
from .providers import Components
from .server import Runtime

HEARD = ['Haan ji, boliye.', 'Achha, aur batayiye.', 'Theek hai, thank you.']     # what the fake ears "hear", in turn
OPT_OUT_CONFIRM = 'Ji bilkul, ab aapko hamari taraf se call nahi aayega. Dhanyavaad.'
REPLIES = ['Ji, main aapki baat samajh gayi.', 'Achha, theek hai. Main aapko details message par bhej deti hoon.',
           'Ji bilkul, aur kuch poochna ho to batayiye.']


class FakeBrain:
    """The opening is the agent's own disclosure clause (so RD1 passes); then short fixed replies in turn."""
    def __init__(self, ticket): self.t = ticket; self.n = 0

    async def stream(self, messages, usage, timing, max_tokens=180):
        a = self.t['agent']; i = self.n; self.n += 1
        # Like an obedient model, follow the brief's opt-out row (brief.py): confirm in one warm line, no pitch. The
        # runtime itself ends the call with end reason opt_out after this reply is heard (session.after_reply).
        if any('asked not to be called again' in (m.get('content') or '') for m in messages if m.get('role') == 'system'):
            text = OPT_OUT_CONFIRM
        elif i == 0:
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
    TONE = (np.sin(2 * np.pi * 220 * np.arange(960) / 24000) * 1500).astype('<i2').tobytes()      # 40 ms, quiet

    async def speak(self, text, style, usage, timing):
        n = max(1, len(text) // 10) * 3
        usage['audio_s'] = usage.get('audio_s', 0) + n * 0.04; usage['chars'] = usage.get('chars', 0) + len(text)
        for _ in range(n):
            await asyncio.sleep(0.02)                                # twice real time, like a streaming voice
            yield self.TONE


class FakeEars:
    """Each stretch of speech the runtime's VAD hears becomes the next line of HEARD: a partial while it lasts, the final
    just after the VAD's end of speech (a streaming recogniser's final). No audio leaves the process."""
    def __init__(self, on_partial=None, on_final=None, on_error=None, lang='hi-IN'):
        self.on_partial = on_partial; self.on_final = on_final; self.audio_s = 0.0; self.n = 0; self.heard = False
    async def start(self): pass
    def write(self, pcm, is_speech):
        if not is_speech: return
        self.audio_s += len(pcm) / 32000
        if not self.heard and self.on_partial: self.on_partial(HEARD[self.n % len(HEARD)].split(',')[0])
        self.heard = True
    def end_of_speech(self):
        if not self.heard or not self.on_final: return
        self.heard = False; line = HEARD[self.n % len(HEARD)]; self.n += 1
        asyncio.get_running_loop().call_later(0.05, self.on_final, line)
    async def close(self): pass


def make_components(sid, voice, t, http, env):
    s = stacks.resolve(t['stack']); c = s['components']                  # curated or 'custom': exactly the ticket's parts
    comp = Components(sid, 'cascade', voice, stacks.combination_id(s, voice), brain=FakeBrain(t), brain_id=c.get('brain', c.get('s2s', '')),
                      brain_provider='devsim', ears_id=c.get('ears') or 'azure', tts_id=c.get('voice') or 'gemini-lite',   # s2s: metered as a cascade
                      names={'s2s': c['s2s'], 'voice': voice} if c.get('s2s') else   # named as the real runtime names it (providers.build)
                            {'stt': c.get('ears'), 'llm': c.get('brain'), 'tts': c.get('voice'), 'voice': voice})
    comp.voice = FakeVoice(); comp.make_ears = lambda on_p, on_f, on_e, lang='hi-IN': FakeEars(on_p, on_f, on_e, lang)
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
