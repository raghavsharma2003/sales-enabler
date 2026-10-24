# VP staging: process-wide pacing of Vertex AI traffic (the appeal commitment: at most 1 request per second, from India).
# Every HTTP request or websocket to *aiplatform.googleapis.com starts at least VP_STAGE_PACE_S (1.0 s) after the previous
# one. Each start is logged with the wait it imposed, so a measurement can say how much pacing it absorbed. A hard cap
# (VP_STAGE_VERTEX_MAX requests per process lifetime) fails further Vertex requests closed.
# Passive timing (no behaviour change): for each paced HTTP request, the time to response headers and to the first SSE
# `data:` line, and the model's reported thought tokens when a chunk carries them. No content is logged.
import asyncio, json, os, re, time
from urllib.parse import urlsplit
import aiohttp
GAP = float(os.environ.get('VP_STAGE_PACE_S', '1.0'))
MAX = int(os.environ.get('VP_STAGE_VERTEX_MAX', '2500'))
LOG = os.environ.get('VP_STAGE_PACE_LOG', '/opt/vp-stage/data/vertex-pace.jsonl')
_state = {'lock': None, 'last': 0.0, 'n': 0}
_THOUGHTS = re.compile(rb'"thoughtsTokenCount"\s*:\s*(\d+)')

def _log(rec):
    try:
        with open(LOG, 'a') as f: f.write(json.dumps(rec) + '\n')
    except Exception: pass

_orig = aiohttp.ClientSession._request
async def _request(self, method, str_or_url, *a, **kw):
    u = str(str_or_url); host = urlsplit(u).hostname or ''
    if not host.endswith('aiplatform.googleapis.com'):
        return await _orig(self, method, str_or_url, *a, **kw)
    if _state['lock'] is None: _state['lock'] = asyncio.Lock()
    async with _state['lock']:
        if _state['n'] >= MAX: raise aiohttp.ClientError('staging Vertex request cap reached')
        wait = max(0.0, _state['last'] + GAP - time.monotonic())
        if wait > 0: await asyncio.sleep(wait)
        _state['last'] = time.monotonic(); _state['n'] += 1; n = _state['n']
    path = urlsplit(u).path
    kind = 'live' if 'BidiGenerateContent' in path else ('voice' if 'tts' in path.lower() else 'brain')
    t0 = time.monotonic()
    _log({'t': round(time.time(), 3), 'wait_ms': int(wait * 1000), 'n': n, 'kind': kind})
    resp = await _orig(self, method, str_or_url, *a, **kw)
    if kind != 'live':
        _log({'n': n, 'hdr_ms': int((time.monotonic() - t0) * 1000), 'status': getattr(resp, 'status', None)})
        try: resp.content._vps = {'n': n, 't0': t0}
        except Exception: pass
    return resp
aiohttp.ClientSession._request = _request

_orig_readline = aiohttp.StreamReader.readline
async def _readline(self):
    line = await _orig_readline(self)
    v = getattr(self, '_vps', None)
    if v is not None and line:
        if 'first' not in v and line.startswith(b'data:'):
            v['first'] = 1; _log({'n': v['n'], 'first_ms': int((time.monotonic() - v['t0']) * 1000)})
        m = _THOUGHTS.search(line) if b'thoughtsTokenCount' in line else None
        if m and not v.get('th'):
            v['th'] = 1; _log({'n': v['n'], 'thoughts': int(m.group(1))})
    return line
aiohttp.StreamReader.readline = _readline
