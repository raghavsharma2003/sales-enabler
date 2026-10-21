# The adapter registry: one stack id -> the exact components that will run the call. Nothing here picks a stack or
# substitutes a component; build() refuses when the stack's credentials are missing.
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Optional
from .. import catalog, stacks


@dataclass
class Components:
    stack_id: str
    kind: str                                   # 'cascade' | 's2s'
    voice_name: str
    combination_id: str
    brain: Any = None                           # .stream(messages, usage, timing, max_tokens) async generator of text
    brain_id: str = ''
    brain_provider: str = 'brain'
    make_brain: Optional[Callable] = None       # brain id -> adapter (non-test fallbacks only)
    make_ears: Optional[Callable] = None        # (on_partial, on_final, on_error) -> ears
    ears_id: str = ''
    gated: bool = True
    voice: Any = None                           # .speak(text, style, usage, timing) async generator of 24 kHz PCM
    tts_id: str = ''
    make_s2s: Optional[Callable] = None         # (system_text, tools) -> speech-to-speech session (s2s.py)
    keep_sounds: bool = False
    names: dict = field(default_factory=dict)   # RunManifest.components
    close: Optional[Callable] = None
    judge_complete: Optional[Callable] = None   # the caller-crisis judge's model call (judge.py); None = no judge


class ProviderUnavailable(Exception):
    def __init__(self, missing):
        super().__init__('stack needs credentials that are not configured: ' + ', '.join(missing)); self.missing = missing


def build(stack_id, voice_name, http, env=None, text_only=False):
    """Real adapters for a stack. text_only: the sim transport needs only the brain (an s2s stack runs its Live model
    in text mode there)."""
    env = os.environ if env is None else env
    missing = stacks.missing_credentials(stack_id, env)
    if missing: raise ProviderUnavailable(missing)
    from .google import GoogleRoute
    from .llm import HttpBrain
    s = stacks.STACKS[stack_id]; c = s['components']
    google = GoogleRoute(env)          # chosen once for this call
    from .. import judge
    judge_complete = judge.http_complete(http, env) if judge.configured(env) and judge.mode(env=env) != 'off' else None
    cid = stacks.combination_id(stack_id, voice_name)
    if s['kind'] == 's2s':
        from ..s2s import GeminiLiveText, make_live
        spec = catalog.S2S[c['s2s']]
        comp = Components(stack_id, 's2s', voice_name, cid, brain_provider='gemini', brain_id=c['s2s'],
                          names={'s2s': c['s2s'], 'voice': voice_name})
        comp.brain = GeminiLiveText(http, google, spec['model'])            # used by the sim transport only
        comp.make_s2s = lambda system, tools=(): make_live(http, google, spec, voice_name, system, tools)
        comp.judge_complete = judge_complete
        return comp
    brain = HttpBrain(http, c['brain'], env, google)
    comp = Components(stack_id, 'cascade', voice_name, cid, brain=brain, brain_id=c['brain'], brain_provider=brain.provider,
                      make_brain=lambda bid: HttpBrain(http, bid, env, google), ears_id=c['ears'], gated=bool(c.get('gatedEars')),
                      tts_id=c['voice'], names={'stt': c['ears'] + ('' if c.get('gatedEars') else '/ungated'), 'llm': c['brain'], 'tts': c['voice'], 'voice': voice_name})
    comp.judge_complete = judge_complete
    if text_only: return comp
    from .stt import Gate, GeminiEars, SarvamEars
    from .tts import make_voice
    ek = catalog.STT[c['ears']]['kind']

    def make_ears(on_p, on_f, on_e, lang='hi-IN'):
        inner = GeminiEars(http, google, on_p, on_f, on_e, lang) if ek == 'gemini' else SarvamEars(http, catalog.STT[c['ears']]['model'], on_p, on_f, on_e, lang, env=env)
        return Gate(inner) if c.get('gatedEars') else inner
    comp.make_ears = make_ears
    comp.voice = make_voice(http, c['voice'], voice_name, env, google)
    comp.keep_sounds = comp.voice.sounds
    return comp
