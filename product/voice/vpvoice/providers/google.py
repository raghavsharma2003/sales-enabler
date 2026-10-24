# Google access for Gemini models: Vertex AI only (decision.2026-10-21.gemini-vertex-only), called only from India
# (decision.2026-10-21.appeal-commitments-binding). Text, TTS, the Live ears and speech-to-speech all go to
# aiplatform.googleapis.com with the service account's bearer token. Nothing falls back to a Gemini API key or to
# OpenRouter: what Vertex does not offer (a model, or Live without a configured location) makes the stack unavailable
# with a plain reason, before the call starts. One route per call, never switched mid-call (no-midcall-swap).
#
# Model ids and locations are configuration, because what Vertex offers changes. Defaults are what the India VM probe
# measured (measure.2026-10-22.vertex-availability-probe), not the docs:
#   VERTEX_PROJECT          project id (default: the service account's project_id)
#   VERTEX_LOCATION         text and TTS (default 'global')
#   VERTEX_LIVE_LOCATION    the Live websocket; regional only (default us-central1: gemini-3.8-live set up only there;
#                           europe-west4/-west1 and asia-south1 said not found; processing anywhere is accepted,
#                           directive.2026-10-22.processing-anywhere)
#   VERTEX_MODEL_MAP        JSON {our model id: Vertex model id or null}, merged over DEFAULT_MODELS (null removes one)
#   VERTEX_LIVE_AUDIO       'mediaChunks' (the Vertex sample's form, default) or 'audio' (the Gemini API form)
import asyncio, base64, json, logging, os, re, time

log = logging.getLogger('vp.voice.google')
LIVE_PATH = '/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent'
# Our model id -> Vertex model id: each answered 200 (text, TTS) or set up (Live) from the India VM, 2026-10-22. Not
# offered there, so absent: gemini-3.5-transcribe-live(-preview) and gemini-3.1-flash-live-preview ("publisher model not
# found"), hence no Gemini ears on Vertex (decision.2026-10-22.ears-azure-not-gemini). Absent = not offered.
DEFAULT_MODELS = {
    'gemini-3.5-flash-lite': 'gemini-3.5-flash-lite', 'gemini-3.6-flash': 'gemini-3.6-flash', 'gemini-3.8-flash': 'gemini-3.8-flash',
    'gemini-3.8-flash-tts': 'gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts': 'gemini-3.8-flash-lite-tts',
    'gemini-3.8-live': 'gemini-3.8-live',
}
TEXT_LIVE_OFF = {'gemini-3.8-live'}    # Vertex Live refused TEXT output for it ("Unsupported modality for Vertex Live API")
LIVE_MODELS = {'gemini-3.8-live', 'gemini-3.5-transcribe-live', 'gemini-3.1-flash-live-preview'}
# The plain reason a person sees when a stack cannot run on our Google route (never a developer string).
NOT_OFFERED = {'brain': "This model isn't offered on our Google Cloud route yet",
               'voice': "This voice isn't offered on our Google Cloud route yet",
               'ears': "Gemini listening isn't offered on Google Cloud",
               's2s': "This speech-to-speech model isn't offered on our Google Cloud route yet"}
NO_ROUTE = "Our Google Cloud route isn't set up on this server"
TEXT_S2S = "Text test calls aren't offered on this speech-to-speech engine on Google Cloud; test it on a voice call"


def ws_text(m):
    """Gemini Live sends JSON in binary frames. Returns the JSON text or None."""
    import aiohttp
    if m.type == aiohttp.WSMsgType.TEXT: return m.data
    if m.type == aiohttp.WSMsgType.BINARY:
        try: return m.data.decode('utf-8')
        except Exception: return None
    return None


class VertexToken:
    """OAuth token from a service-account JSON (RS256 JWT bearer grant), cached until 5 minutes before expiry."""
    def __init__(self, sa):
        self.sa = sa; self.tok = None; self.exp = 0.0; self.lock = asyncio.Lock()

    async def get(self, http):
        async with self.lock:
            if self.tok and time.time() < self.exp - 300: return self.tok
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding
            b64 = lambda x: base64.urlsafe_b64encode(x).rstrip(b'=')
            now = int(time.time())
            h = b64(json.dumps({'alg': 'RS256', 'typ': 'JWT', 'kid': self.sa['private_key_id']}).encode())
            c = b64(json.dumps({'iss': self.sa['client_email'], 'scope': 'https://www.googleapis.com/auth/cloud-platform',
                                'aud': self.sa['token_uri'], 'iat': now, 'exp': now + 3600}).encode())
            key = serialization.load_pem_private_key(self.sa['private_key'].encode(), None)
            sig = b64(key.sign(h + b'.' + c, padding.PKCS1v15(), hashes.SHA256()))
            async with http.post(self.sa['token_uri'], data={'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                                                             'assertion': (h + b'.' + c + b'.' + sig).decode()}) as r:
                d = await r.json()
            self.tok = d['access_token']; self.exp = time.time() + int(d.get('expires_in', 3600))
            return self.tok


_VERTEX = {}
# Agent Platform (Vertex) is called only from India (appeal commitment): the route exists only when VP_REGION names an
# Indian region; anywhere else every Gemini stack is unavailable, with one logged reason.
INDIA_REGIONS = {'centralindia', 'southindia', 'westindia', 'jioindiacentral', 'jioindiawest', 'india', 'in', 'asia-south1', 'asia-south2'}
_REFUSED = set()


def _refuse(why):
    if why not in _REFUSED:
        _REFUSED.add(why); log.warning(why)
    return False


def vertex_region_ok(env):
    """True when VP_REGION says this runtime runs in India. Logs the refusal once per reason per process."""
    region = (env.get('VP_REGION') or '').strip().lower()
    if region in INDIA_REGIONS: return True
    return _refuse(f'Vertex route refused: VP_REGION={region or "(unset)"} is not an Indian region; Agent Platform is called only from India')


def model_map(env):
    m = dict(DEFAULT_MODELS)
    raw = env.get('VERTEX_MODEL_MAP')
    if raw:
        try:
            extra = json.loads(raw)
            if not isinstance(extra, dict): raise ValueError('not an object')
            for k, v in extra.items():
                if v: m[str(k)] = str(v)
                else: m.pop(str(k), None)
        except ValueError as e:
            _refuse(f'VERTEX_MODEL_MAP ignored: {e}')
    return m


class GoogleRoute:
    """Vertex AI for one call. usable is False (with why) when there is no route on this server at all."""
    name = 'vertex'

    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.models = model_map(env); self.vertex = None; self.why = NO_ROUTE
        self.project = env.get('VERTEX_PROJECT', ''); self.location = env.get('VERTEX_LOCATION') or 'global'
        self.live_location = (env.get('VERTEX_LIVE_LOCATION') or 'us-central1').strip()
        self.live_audio = 'audio' if env.get('VERTEX_LIVE_AUDIO') == 'audio' else 'mediaChunks'
        sa_path = env.get('VERTEX_SA_FILE')
        if not sa_path or not os.path.exists(sa_path): return
        if env.get('VERTEX_OFF') == '1': _refuse('Vertex route off: VERTEX_OFF=1'); return
        if not vertex_region_ok(env): return
        if sa_path not in _VERTEX:
            with open(sa_path) as f: _VERTEX[sa_path] = VertexToken(json.load(f))
        self.vertex = _VERTEX[sa_path]; self.why = None
        self.project = self.project or self.vertex.sa.get('project_id', '')

    @property
    def usable(self): return self.vertex is not None

    def offers(self, model):
        """Vertex offers this model on our route (a Live model also needs VERTEX_LIVE_LOCATION)."""
        if not self.usable or model not in self.models: return False
        return bool(self.live_location) if model in LIVE_MODELS else True

    def uses_vertex(self, model): return self.offers(model)

    def resource(self, model):
        loc = self.live_location if model in LIVE_MODELS else self.location
        return f'projects/{self.project}/locations/{loc}/publishers/google/models/{self.models[model]}'

    def host(self, loc): return 'aiplatform.googleapis.com' if loc == 'global' else f'{loc}-aiplatform.googleapis.com'

    async def stream(self, http, model, body, timing, **kw):
        """streamGenerateContent (SSE). Returns an open response (the caller releases it) or None with timing['err']."""
        if not self.offers(model):
            timing['err'] = f'not offered on Vertex: {model}'; return None
        for c in body.get('contents', []): c.setdefault('role', 'user')
        url = f'https://{self.host(self.location)}/v1/{self.resource(model)}:streamGenerateContent?alt=sse'
        hdr = {'Authorization': 'Bearer ' + await self.vertex.get(http)}
        r = await http.post(url, headers=hdr, json=body, **kw)
        for _ in range(2):          # Google's own 5xx: retry the same model on the same route (not a swap)
            if r.status < 500: break
            r.release(); timing['retries'] = timing.get('retries', 0) + 1; await asyncio.sleep(0.4)
            r = await http.post(url, headers=hdr, json=body, **kw)
        if r.status == 200: return r
        timing['err'] = f'{r.status} {(await r.text())[:300]}'; r.release()
        return None

    async def warm(self, http):
        """PREWARM: the bearer token refreshed off the critical path, and the stream host's connection opened."""
        if not self.usable or http is None: return
        from .warm import warm_hosts
        warm_hosts(http, [self.host(self.location)])
        try: await self.vertex.get(http)
        except Exception: pass

    def live_url(self): return f'wss://{self.host(self.live_location)}{LIVE_PATH}'

    async def live(self, http, model):
        """The Vertex Live websocket for a Live model, with the service account's bearer token on the upgrade."""
        if not self.offers(model): raise RuntimeError(f'not offered on Vertex: {model}')
        tok = await self.vertex.get(http)
        return await http.ws_connect(self.live_url(), headers={'Authorization': 'Bearer ' + tok}, max_msg_size=0, heartbeat=20)

    def audio_chunk(self, b64, rate=16000):
        mime = f'audio/pcm;rate={rate}'
        if self.live_audio == 'audio': return {'realtimeInput': {'audio': {'data': b64, 'mimeType': mime}}}
        return {'realtimeInput': {'mediaChunks': [{'data': b64, 'mimeType': mime}]}}


def google_models(stack_id):
    """(component, our model id) pairs a stack needs from Google."""
    from .. import catalog, stacks
    s = stacks.spec(stack_id); c = s['components']; out = []
    if s['kind'] == 's2s':
        if catalog.S2S[c['s2s']]['kind'] == 'gemini_live': out.append(('s2s', catalog.S2S[c['s2s']]['model']))
        return out
    if catalog.STT[c['ears']]['kind'] == 'gemini': out.append(('ears', catalog.STT[c['ears']]['model']))
    if catalog.BRAINS[c['brain']]['host'] == 'gm': out.append(('brain', catalog.BRAINS[c['brain']]['model']))
    if catalog.TTS[c['voice']]['kind'] == 'gemini': out.append(('voice', catalog.TTS[c['voice']]['model']))
    return out


def unavailable(stack_id, route, text_only=False):
    """The plain reason a stack cannot run on our Google route, or None. Never a reroute. text_only: a sim (text) call,
    which runs a speech-to-speech model in text mode, which Vertex Live refuses for some models."""
    needs = google_models(stack_id)
    if not needs: return None
    if not route.usable: return NO_ROUTE
    for comp, model in needs:
        if not route.offers(model): return NOT_OFFERED[comp]
        if text_only and comp == 's2s' and model in TEXT_LIVE_OFF: return TEXT_S2S
    return None


def explain(err, what):
    """A reason a component failed, without guessing: Google 5xx vs quota vs anything else."""
    e = err or ''
    if e.startswith(('500', '502', '503', '504')) or 'UNAVAILABLE' in e: return f"{what} was unavailable on the provider's side ({e[:3]})"
    if e.startswith('429') or 'quota' in e.lower() or 'RESOURCE_EXHAUSTED' in e: return f'{what} hit its quota'
    clean = re.sub(r'key=[^&\s]+', 'key=…', e)
    return f'{what} failed: {clean[:160]}'
