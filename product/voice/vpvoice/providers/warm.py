# Connection pre-warm (CascadeSession.PREWARM): when the caller starts speaking, open (or refresh) the pooled TLS
# connection to each host her reply will use, so the brain and voice requests that follow skip the TCP+TLS handshake.
# aiohttp drops an idle pooled connection after 15 s, and a caller turn plus her reply often takes longer than that.
# A warm is one HEAD to the host's root: no model, no token, no billing; at most one per host per MIN_GAP_S.
import asyncio, time

MIN_GAP_S = 8.0
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
