# The voice stacks a ticket may name: a mirror of product/shared/stacks.ts (tests/test_stacks.py holds the two in step).
# There is deliberately NO default: a ticket without a known stack is refused, and the runtime never substitutes one.
from . import catalog

STACKS = {
    'v2-live':         {'kind': 's2s', 'components': {'s2s': 'gemini-3.8-live'}, 'requires': ['GEMINI'], 'status': 'beta'},
    'v2-flashlite':    {'kind': 'cascade', 'components': {'ears': 'azure', 'brain': 'gemini-3.5-flash-lite', 'voice': 'gemini-lite', 'gatedEars': True},
                        'requires': ['GEMINI', 'AZURE_SPEECH'], 'status': 'available'},
    'v2-54mini':       {'kind': 'cascade', 'components': {'ears': 'azure', 'brain': 'gpt-5.4-mini', 'voice': 'gemini-lite', 'gatedEars': True},
                        'requires': ['GEMINI', 'AZURE_SPEECH', 'AZURE_OPENAI'], 'status': 'available'},
    'v2-38flash':      {'kind': 'cascade', 'components': {'ears': 'azure', 'brain': 'gemini-3.8-flash', 'voice': 'gemini-lite', 'gatedEars': True},
                        'requires': ['GEMINI', 'AZURE_SPEECH'], 'status': 'available'},
    'v2-mai':          {'kind': 'cascade', 'components': {'ears': 'azure', 'brain': 'gemini-3.5-flash-lite', 'voice': 'azure-mai', 'gatedEars': True},
                        'requires': ['GEMINI', 'AZURE_SPEECH'], 'status': 'available'},
    'v2-luna':         {'kind': 'cascade', 'components': {'ears': 'azure', 'brain': 'gpt-6-luna@or', 'voice': 'gemini-lite', 'gatedEars': True},
                        'requires': ['GEMINI', 'AZURE_SPEECH', 'OPENROUTER'], 'status': 'available'},
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
    'AZURE_OPENAI_SEA': [['VP_AI_ENDPOINT', 'VP_AI_KEY']],   # brains on the second Foundry account (host 'sea', e.g. kimi-k2.6)
}
CUSTOM = 'custom'                 # a stack a user built from parts (shared/components.ts); its parts travel in the ticket
BRAIN_REQUIRES = {'gm': 'GEMINI', 'sin': 'AZURE_OPENAI', 'sea': 'AZURE_OPENAI_SEA', 'or': 'OPENROUTER', 'sv': 'SARVAM'}
KIND_REQUIRES = {'gemini': 'GEMINI', 'gemini_live': 'GEMINI', 'azure': 'AZURE_SPEECH', 'sarvam': 'SARVAM'}


class StackError(Exception):
    def __init__(self, code, message):
        super().__init__(message); self.code = code


def require_stack(stack_id):
    if not stack_id: raise StackError('no_stack', 'choose a voice stack: there is no default')
    s = STACKS.get(stack_id)
    if s is None: raise StackError('unknown_stack', f'unknown voice stack "{stack_id}"')
    return s


def spec(stack):
    """A stack id (curated) or an already resolved spec (curated or custom) -> the spec."""
    return stack if isinstance(stack, dict) else dict(STACKS[stack], id=stack)


def parts(c):
    """The parts that define a stack, normalised for comparison: a cascade's three and its gate, or one engine."""
    if c.get('s2s'): return {'s2s': c['s2s']}
    return {'ears': c.get('ears'), 'brain': c.get('brain'), 'voice': c.get('voice'), 'gatedEars': bool(c.get('gatedEars'))}


def requires_of(c):
    """The credentials a set of parts needs, by part (the same names as shared/components.ts requires)."""
    if c.get('s2s'): return [KIND_REQUIRES[catalog.S2S[c['s2s']]['kind']]] if catalog.S2S[c['s2s']]['kind'] in KIND_REQUIRES else []
    out = []
    for need in (KIND_REQUIRES.get(catalog.STT[c['ears']]['kind']), BRAIN_REQUIRES.get(catalog.BRAINS[c['brain']]['host']),
                 KIND_REQUIRES.get(catalog.TTS[c['voice']]['kind'])):
        if need and need not in out: out.append(need)
    return out


def resolve(st):
    """ticket.stack -> the spec the runtime will run. A curated id must carry exactly its own parts; 'custom' is built
    from its parts, each checked against the catalog. Nothing is ever substituted."""
    st = st or {}
    sid = st.get('id'); comps = st.get('components')
    if sid != CUSTOM: require_stack(sid)          # no stack / unknown stack first: there is no default
    if not isinstance(comps, dict): raise StackError('bad_stack', 'ticket.stack.components is required')
    if sid != CUSTOM:
        s = spec(sid)
        if parts(comps) != parts(s['components']):
            raise StackError('stack_mismatch', f'stack "{sid}" runs {parts(s["components"])}, not {parts(comps)}')
        return s
    if comps.get('s2s'):
        if set(k for k, v in comps.items() if v) - {'s2s'}: raise StackError('bad_stack', 'a speech-to-speech stack has the engine only')
        if comps['s2s'] not in catalog.S2S: raise StackError('unknown_component', f'unknown speech-to-speech engine "{comps["s2s"]}"')
        c = {'s2s': comps['s2s']}; kind = 's2s'
    else:
        for part, table in (('ears', catalog.STT), ('brain', catalog.BRAINS), ('voice', catalog.TTS)):
            if not comps.get(part): raise StackError('bad_stack', f'a built stack needs ears, a brain and a voice: {part} is missing')
            if comps[part] not in table: raise StackError('unknown_component', f'unknown {part} "{comps[part]}"')
        c = {'ears': comps['ears'], 'brain': comps['brain'], 'voice': comps['voice'], 'gatedEars': bool(comps.get('gatedEars'))}; kind = 'cascade'
    return {'id': CUSTOM, 'kind': kind, 'components': c, 'requires': requires_of(c), 'status': 'custom'}


def missing_credentials(stack_id, env):
    """Names of the credentials a stack needs that the environment does not have (empty when it can run)."""
    out = []
    for need in spec(stack_id)['requires']:
        if not any(all(env.get(k) for k in group) for group in REQUIRES_ENV[need]): out.append(need)
    return out


def voices(stack_id):
    c = spec(stack_id)['components']
    if 's2s' in c: return catalog.S2S[c['s2s']]['voices'], catalog.S2S[c['s2s']]['voice']
    t = catalog.TTS[c['voice']]
    return t['voices'], t['default_voice']


def resolve_voice(stack_id, voice_id=None):
    """The voice that will actually speak. An unknown voice is refused, never swapped for another."""
    allowed, default = voices(stack_id)
    if not voice_id: return default
    if voice_id not in allowed: raise StackError('unknown_voice', f'voice "{voice_id}" is not offered by stack "{spec(stack_id)["id"]}"')
    return voice_id


def combination_id(stack_id, voice_name=None):
    """Same algorithm as combinationId() in shared/stacks.ts: results are filed under what actually ran."""
    s = spec(stack_id); c = s['components']
    core = c['s2s'] if s['kind'] == 's2s' else f"{c['ears']}{'' if c.get('gatedEars') else '/ungated'}+{c['brain']}+{c['voice']}"
    return f"{BRIEF}|{core}" + (f'~{voice_name}' if voice_name else '')
