# The voice stacks a ticket may name: a mirror of product/shared/stacks.ts (tests/test_stacks.py holds the two in step).
# There is deliberately NO default: a ticket without a known stack is refused, and the runtime never substitutes one.
from . import catalog

STACKS = {
    'v2-live':         {'kind': 's2s', 'components': {'s2s': 'gemini-3.8-live'}, 'requires': ['GEMINI'], 'status': 'beta'},
    'v2-flashlite':    {'kind': 'cascade', 'components': {'ears': 'gemini', 'brain': 'gemini-3.5-flash-lite', 'voice': 'gemini-lite', 'gatedEars': True},
                        'requires': ['GEMINI'], 'status': 'available'},
    'v2-54mini':       {'kind': 'cascade', 'components': {'ears': 'gemini', 'brain': 'gpt-5.4-mini', 'voice': 'gemini-lite', 'gatedEars': True},
                        'requires': ['GEMINI', 'AZURE_OPENAI'], 'status': 'available'},
    'v2-38flash':      {'kind': 'cascade', 'components': {'ears': 'gemini', 'brain': 'gemini-3.8-flash', 'voice': 'gemini-lite', 'gatedEars': True},
                        'requires': ['GEMINI'], 'status': 'available'},
    'v2-mai':          {'kind': 'cascade', 'components': {'ears': 'gemini', 'brain': 'gemini-3.5-flash-lite', 'voice': 'azure-mai', 'gatedEars': True},
                        'requires': ['GEMINI', 'AZURE_SPEECH'], 'status': 'available'},
    'v2-luna':         {'kind': 'cascade', 'components': {'ears': 'gemini', 'brain': 'gpt-6-luna@or', 'voice': 'gemini-lite', 'gatedEars': True},
                        'requires': ['GEMINI', 'OPENROUTER'], 'status': 'available'},
    'sarvam-india':    {'kind': 'cascade', 'components': {'ears': 'sarvam', 'brain': 'sarvam-105b', 'voice': 'sarvam', 'gatedEars': True},
                        'requires': ['SARVAM'], 'status': 'beta'},
}
BRIEF = 'v2'

# A stack's "requires" names map to the environment variables that satisfy them (names only; values never logged).
REQUIRES_ENV = {
    'GEMINI': [['VERTEX_SA_FILE']],      # Gemini runs on Vertex only; providers/google.py also requires an Indian VP_REGION
    'AZURE_OPENAI': [['LAB_AI_ENDPOINT', 'LAB_AI_KEY']],
    'AZURE_SPEECH': [['LAB_SPEECH_KEY']],
    'OPENROUTER': [['OPENROUTER_API_KEY']],
    'SARVAM': [['SARVAM_API_KEY']],
}


class StackError(Exception):
    def __init__(self, code, message):
        super().__init__(message); self.code = code


def require_stack(stack_id):
    if not stack_id: raise StackError('no_stack', 'choose a voice stack: there is no default')
    s = STACKS.get(stack_id)
    if s is None: raise StackError('unknown_stack', f'unknown voice stack "{stack_id}"')
    return s


def missing_credentials(stack_id, env):
    """Names of the credentials a stack needs that the environment does not have (empty when it can run)."""
    out = []
    for need in STACKS[stack_id]['requires']:
        if not any(all(env.get(k) for k in group) for group in REQUIRES_ENV[need]): out.append(need)
    return out


def voices(stack_id):
    c = STACKS[stack_id]['components']
    if 's2s' in c: return catalog.S2S[c['s2s']]['voices'], catalog.S2S[c['s2s']]['voice']
    t = catalog.TTS[c['voice']]
    return t['voices'], t['default_voice']


def resolve_voice(stack_id, voice_id=None):
    """The voice that will actually speak. An unknown voice is refused, never swapped for another."""
    allowed, default = voices(stack_id)
    if not voice_id: return default
    if voice_id not in allowed: raise StackError('unknown_voice', f'voice "{voice_id}" is not offered by stack "{stack_id}"')
    return voice_id


def combination_id(stack_id, voice_name=None):
    """Same algorithm as combinationId() in shared/stacks.ts: results are filed under what actually ran."""
    s = STACKS[stack_id]; c = s['components']
    core = c['s2s'] if s['kind'] == 's2s' else f"{c['ears']}{'' if c.get('gatedEars') else '/ungated'}+{c['brain']}+{c['voice']}"
    return f"{BRIEF}|{core}" + (f'~{voice_name}' if voice_name else '')
