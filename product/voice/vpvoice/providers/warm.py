# Connection pre-warm (CascadeSession.PREWARM): when the caller starts speaking, open (or refresh) the pooled TLS
# connection to each host her reply will use, so the brain and voice requests that follow skip the TCP+TLS handshake.
# aiohttp drops an idle pooled connection after 15 s, and a caller turn plus her reply often takes longer than that.
# A warm is one HEAD to the host's root: no model, no token, no billing; at most one per host per MIN_GAP_S.
import asyncio, time

MIN_GAP_S = 8.0

# Providers whose requests are paced or rate-limited (VP_PACED_PROVIDERS, comma-separated; 'none' for none). Vertex is
# paced by default: the appeal commitment holds Vertex to about 1 request per second from India, and on staging the
# extra speculative and warm requests queued ahead of the real brain request (2026-10-24: flashlite p50 2.30 -> 3.20 s).
PACED_DEFAULT = ('vertex',)


def paced_providers(env):
    raw = env.get('VP_PACED_PROVIDERS')
    if raw is None: return set(PACED_DEFAULT)
    return {x.strip().lower() for x in raw.split(',') if x.strip() and x.strip().lower() != 'none'}


def route_of(part, cid):
    """The provider route a brain or voice component's requests go to: 'vertex', 'azure', 'openrouter', 'sarvam'."""
    from .. import catalog
    if part == 'brain':
        h = (catalog.BRAINS.get(cid) or {}).get('host')
        return {'gm': 'vertex', 'sin': 'azure', 'sea': 'azure', 'or': 'openrouter', 'sv': 'sarvam'}.get(h, h or '')
    k = (catalog.TTS.get(cid) or {}).get('kind', '')
    return 'vertex' if k == 'gemini' else k
_last = {}            # host -> monotonic time of the last warm started


def due(host, now=None):
    now = time.monotonic() if now is None else now
    if now - _last.get(host, -1e9) < MIN_GAP_S: return False
    _last[host] = now; return True


async def _head(http, host):
    import aiohttp
    try:
        async with http.head(f'https://{host}/', timeout=aiohttp.ClientTimeout(total=5), allow_redirects=False) as r:
            await r.read()
    except Exception:
        pass          # a failed warm costs nothing: the real request opens its own connection


def warm_hosts(http, hosts):
    """Fire-and-forget: never on the critical path, never raises."""
    if http is None: return
    for h in dict.fromkeys(h for h in hosts if h):
        if due(h): asyncio.ensure_future(_head(http, h))
