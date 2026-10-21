# Google access for Gemini models. One route per call, chosen when the call starts and never switched mid-call
# (directive.2026-10-20.no-midcall-swap): Vertex AI when a service account is configured (VERTEX_SA_FILE), else the
# Gemini API key (GEMINI_PAID_KEY). The Live websocket (ears, speech-to-speech) uses the Gemini API key.
import asyncio, base64, json, os, re, time

GEM = 'https://generativelanguage.googleapis.com/v1beta'
GEM_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
VERTEX_MODELS = {'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'}


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


class GoogleRoute:
    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.key = env.get('GEMINI_PAID_KEY') or None
        self.project = env.get('VERTEX_PROJECT', ''); self.location = env.get('VERTEX_LOCATION', 'global')
        sa_path = env.get('VERTEX_SA_FILE')
        self.vertex = None
        if sa_path and os.path.exists(sa_path) and env.get('VERTEX_OFF') != '1':
            if sa_path not in _VERTEX:
                with open(sa_path) as f: _VERTEX[sa_path] = VertexToken(json.load(f))
            self.vertex = _VERTEX[sa_path]
            self.project = self.project or _VERTEX[sa_path].sa.get('project_id', '')
        self.name = 'vertex' if self.vertex else 'gemini_api'

    def uses_vertex(self, model): return self.vertex is not None and model in VERTEX_MODELS

    async def stream(self, http, model, body, timing, **kw):
        """streamGenerateContent (SSE). Returns an open response (the caller releases it) or None with timing['err']."""
        for c in body.get('contents', []): c.setdefault('role', 'user')
        if self.uses_vertex(model):
            host = 'aiplatform.googleapis.com' if self.location == 'global' else f'{self.location}-aiplatform.googleapis.com'
            url = f'https://{host}/v1/projects/{self.project}/locations/{self.location}/publishers/google/models/{model}:streamGenerateContent?alt=sse'
            hdr = {'Authorization': 'Bearer ' + await self.vertex.get(http)}
        else:
            if not self.key:
                timing['err'] = 'no Gemini API key configured'; return None
            url = f'{GEM}/models/{model}:streamGenerateContent?alt=sse'; hdr = {'x-goog-api-key': self.key}
        r = await http.post(url, headers=hdr, json=body, **kw)
        for _ in range(2):          # Google's own 5xx: retry the same model on the same route (not a swap)
            if r.status < 500: break
            r.release(); timing['retries'] = timing.get('retries', 0) + 1; await asyncio.sleep(0.4)
            r = await http.post(url, headers=hdr, json=body, **kw)
        if r.status == 200: return r
        timing['err'] = f'{r.status} {(await r.text())[:300]}'; r.release()
        return None

    async def live(self, http):
        if not self.key: raise RuntimeError('no Gemini API key configured for the Live websocket')
        return await http.ws_connect(GEM_WS, headers={'x-goog-api-key': self.key}, max_msg_size=0, heartbeat=20)


def explain(err, what):
    """A reason a component failed, without guessing: Google 5xx vs quota vs anything else."""
    e = err or ''
    if e.startswith(('500', '502', '503', '504')) or 'UNAVAILABLE' in e: return f"{what} was unavailable on the provider's side ({e[:3]})"
    if e.startswith('429') or 'quota' in e.lower() or 'RESOURCE_EXHAUSTED' in e: return f'{what} hit its quota'
    clean = re.sub(r'key=[^&\s]+', 'key=…', e)
    return f'{what} failed: {clean[:160]}'
