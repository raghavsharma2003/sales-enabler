# Can this runtime run a component? One answer per catalog component (ears, brain, voice, s2s), in plain words, for
# GET /v1/health ("Build your own" shows it) and for tickets that name their own components. Never a substitute:
# a component that cannot run here is unavailable with its reason.
from .. import catalog
from .google import NOT_OFFERED, NO_ROUTE

NOT_SET_UP = {'azure-speech': "Azure Speech isn't set up on this server",
              'azure-foundry': "Our Azure AI Foundry isn't set up on this server",
              'openrouter': "OpenRouter isn't set up on this server",
              'sarvam': "Sarvam isn't set up on this server"}
NOT_BUILT = "This component isn't built into our voice engine yet"
PARTS = {'ears': catalog.STT, 'brain': catalog.BRAINS, 'voice': catalog.TTS, 's2s': catalog.S2S}
ENV_OF = {'azure-speech': ('LAB_SPEECH_KEY',), 'azure-foundry-sin': ('LAB_AI_ENDPOINT', 'LAB_AI_KEY'),
          'azure-foundry-sea': ('VP_AI_ENDPOINT', 'VP_AI_KEY'), 'openrouter': ('OPENROUTER_API_KEY',), 'sarvam': ('SARVAM_API_KEY',)}


def _has(env, key): return all(env.get(k) for k in ENV_OF[key])


def _google(part, model, route):
    if not route.usable: return NO_ROUTE
    return None if route.offers(model) else NOT_OFFERED[part]


def reason(part, cid, env, route):
    """None when this runtime can run the component, else the plain reason it cannot."""
    spec = PARTS.get(part, {}).get(cid)
    if spec is None: return f'Unknown {part} "{cid}"'
    if part == 'brain':
        h = spec['host']
        if h == 'gm': return _google('brain', spec['model'], route)
        if h in ('sin', 'sea'): return None if _has(env, f'azure-foundry-{h}') else NOT_SET_UP['azure-foundry']
        if h == 'or': return None if _has(env, 'openrouter') else NOT_SET_UP['openrouter']
        if h == 'sv': return None if _has(env, 'sarvam') else NOT_SET_UP['sarvam']
        return NOT_BUILT
    kind = spec.get('kind')
    if kind in ('gemini', 'gemini_live'): return _google(part, spec['model'], route)
    if kind == 'azure' and part in ('ears', 'voice'): return None if _has(env, 'azure-speech') else NOT_SET_UP['azure-speech']
    if kind == 'sarvam' and part in ('ears', 'voice'): return None if _has(env, 'sarvam') else NOT_SET_UP['sarvam']
    return NOT_BUILT                                       # e.g. the realtime-transcribe ears, Azure realtime s2s


def missing(part, cid, env):
    """The credential names (shared/components.ts requires) this component needs and the server does not have."""
    from .. import stacks
    spec = PARTS[part][cid]
    need = stacks.BRAIN_REQUIRES.get(spec['host']) if part == 'brain' else stacks.KIND_REQUIRES.get(spec.get('kind'))
    if not need: return []
    return [] if any(all(env.get(k) for k in group) for group in stacks.REQUIRES_ENV[need]) else [need]


def health(env, route):
    out = {}
    for part, table in PARTS.items():
        out[part] = {}
        for cid in table:
            why = reason(part, cid, env, route)
            out[part][cid] = {'available': why is None, 'reason': why, 'missing': missing(part, cid, env)}
    return out
