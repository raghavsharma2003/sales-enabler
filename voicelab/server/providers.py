# VP voice lab: provider adapters (async). Keys come from the environment; nothing secret is logged.
import os, json, time, base64, asyncio, html, re, threading
import aiohttp
from catalog import BRAINS, STT, TTS, FX
from audio import Resampler

GEM = 'https://generativelanguage.googleapis.com/v1beta'
GEM_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
def env(k, d=None): return os.environ.get(k, d)
def ws_text(m):
    """Gemini Live sends JSON in binary frames; Azure in text frames. Returns the JSON text or None."""
    if m.type == aiohttp.WSMsgType.TEXT: return m.data
    if m.type == aiohttp.WSMsgType.BINARY:
        try: return m.data.decode('utf-8')
        except Exception: return None
    return None
def az_host(endpoint): return endpoint.rstrip('/').replace('https://', '').replace('.cognitiveservices.azure.com', '.openai.azure.com')

# ---------------------------------------------------------------- Gemini key choice: free test key first, paid on quota
class GeminiKeys:
    """Owner directive 2026-10-18: use the free test key as much as its own limits allow; the paid key (capped) when the
    free key is out of quota. Only these two keys, both the owner's; never rotated across other accounts.
    Lab 2026-10-19: Tier-1 Gemini caps gemini-3.8-flash-tts at 100 requests per day per model (quotaId
    GenerateRequestsPerDayPerProjectPerModel), so quota is tracked per (key, model): a per-model daily cap rests only
    that model on that key until the daily reset; a per-minute 429 rests the key for the window the error names."""
    def __init__(self):
        self.free = env('GEMINI_TEST_KEY'); self.paid = env('GEMINI_PAID_KEY')
        self.blocked = {}            # (tier, model or '*') -> unix time it may be used again
        self.paid_cap = float(env('GEMINI_PAID_REMAINING_USD', '5.0')); self.paid_spent = 0.0
        self.ledger = None
    @property
    def free_blocked_until(self): return self.blocked.get(('free', '*'), 0.0)
    def load(self, path):
        """Paid-key spend survives restarts (the owner's cap is global, not per process)."""
        self.ledger = path
        try:
            self.paid_spent = sum(json.loads(l).get('usd', 0) for l in open(path))
        except FileNotFoundError: pass
    def usable(self, tier, model=None, now=None):
        now = now or time.time()
        return now >= self.blocked.get((tier, '*'), 0) and (model is None or now >= self.blocked.get((tier, model), 0))
    def pick(self, exclude=(), model=None):
        if self.free and 'free' not in exclude and self.usable('free', model): return self.free, 'free'
        if self.paid and 'paid' not in exclude and self.usable('paid', model) and self.paid_spent < self.paid_cap: return self.paid, 'paid'
        return None, 'none'
    def quota_hit(self, tier, seconds=60, model=None):
        k = (tier, model or '*'); self.blocked[k] = max(self.blocked.get(k, 0), time.time() + seconds)
    def next_usable(self, model=None):
        ts = [max(self.blocked.get((t, '*'), 0), self.blocked.get((t, model), 0) if model else 0) for t in ('free', 'paid')]
        return min(ts)
    def charge(self, tier, usd):
        if tier == 'paid' and usd:
            self.paid_spent += usd
            if self.ledger:
                with open(self.ledger, 'a') as f: f.write(json.dumps({'ts': time.time(), 'usd': usd}) + '\n')
GKEYS = GeminiKeys()
def is_quota(status, text):
    t = (text or '').lower()
    return status == 429 or 'resource_exhausted' in t or 'quota' in t or status == 402
def seconds_to_daily_reset():
    """Gemini API daily quotas reset at midnight US Pacific (07:00 UTC in daylight time, 08:00 UTC otherwise)."""
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    hour = 7 if 3 <= now.month <= 10 or (now.month == 11 and now.day < 2) else 8
    reset = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if reset <= now: reset += datetime.timedelta(days=1)
    return (reset - now).total_seconds()
def quota_window(text):
    """(seconds to rest, per_model) after a quota error: until the daily reset for per-day quotas, else the error's
    retryDelay or a minute."""
    t = text or ''
    per_model = 'PerModel' in t
    if 'PerDay' in t or 'per_day' in t.lower(): return seconds_to_daily_reset(), per_model
    m = re.search(r'"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"', t)
    return (min(120.0, max(5.0, float(m.group(1)))) if m else 60.0), per_model

_T503 = {}
def _test_503(model):
    spec = os.environ.get('LAB_TEST_503', '')
    if not spec or ':' not in spec or spec.split(':')[0] != model: return False
    _T503[model] = _T503.get(model, 0) + 1
    return _T503[model] > int(spec.split(':')[1])

async def gemini_post(http, url, body, timing, **kw):
    """POST to the Gemini API with key failover: on a quota error rest that key (or that key's model, for per-model
    caps) for its window and try the other key; if both rest for under 2 s, wait once. Returns an open response
    (caller releases it) or None with timing['err'] set; with no usable key it returns at once (no doomed request)."""
    mm = re.search(r'/models/([^:/]+)[:]', url); model = mm.group(1) if mm else None
    tried = []; waited = False
    while True:
        key, tier = GKEYS.pick(exclude=tried, model=model)
        if not key:
            soon = GKEYS.next_usable(model) - time.time()
            if not waited and 0 < soon <= 2.0:
                waited = True; tried = []; await asyncio.sleep(soon); continue
            timing.setdefault('err', f'429 no Gemini key has quota left for {model} now (resets {int(max(soon, 0) // 60)} min)')
            timing['quota_out'] = True; return None
        timing['key'] = tier
        if _test_503(model):                     # test hook: LAB_TEST_503=model:N fails that model after N requests
            timing['err'] = '503 {"error": {"code": 503, "status": "UNAVAILABLE"}} (lab test hook)'; return None
        r = await http.post(url, headers={'x-goog-api-key': key}, json=body, **kw)
        for _ in range(2):        # Google's own 5xx (lab 2026-10-20: a 503 "service unavailable"): retry the same model
            if r.status < 500: break
            r.release(); timing['retries'] = timing.get('retries', 0) + 1; await asyncio.sleep(0.4)
            r = await http.post(url, headers={'x-goog-api-key': key}, json=body, **kw)
        if r.status == 200: return r
        txt = await r.text(); r.release()
        if is_quota(r.status, txt):
            secs, per_model = quota_window(txt)
            GKEYS.quota_hit(tier, secs, model if per_model else None); tried.append(tier)
            timing['quota'] = timing.get('quota', 0) + 1; timing['err'] = f'{r.status} {txt[:300]}'
            continue
        timing['err'] = f'{r.status} {txt[:300]}'; return None

# ---------------------------------------------------------------- Vertex AI (owner's Google Cloud credit, 2026-10-19)
# Project vp-voice, service account vp-voicelab (Vertex AI User + Service Usage Viewer). The ₹28,693 free-trial
# credit covers Google's own Gemini models on Vertex (not AI Studio) and expires 2026-11-15, and the billing account
# is a paid one, so the lab caps its own Vertex spend and stops using Vertex the day before expiry.
VERTEX_PROJECT = env('VERTEX_PROJECT', 'vp-voice')
VERTEX_CAP_USD = float(env('VERTEX_CAP_USD', str(20000 / FX)))
VERTEX_LAST_DAY = env('VERTEX_LAST_DAY', '2026-11-14')
VERTEX_MODELS = {'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'}
class VertexAuth:
    def __init__(self):
        self.sa = None; self.tok = None; self.exp = 0.0; self.spent = 0.0; self.ledger = None; self.lock = asyncio.Lock()
        p = env('VERTEX_SA_FILE')
        if p and os.path.exists(p):
            try: self.sa = json.load(open(p))
            except Exception: self.sa = None
    def load(self, path):
        self.ledger = path
        try: self.spent = sum(json.loads(l).get('usd', 0) for l in open(path))
        except FileNotFoundError: pass
    def usable(self):
        # VERTEX_OFF=1: Google restricted project vp-voice (2026-10-20 notice, appeal pending); a 401/403 also trips a
        # 6-hour breaker so a restricted project is not hit on every reply (Gemini API keys serve meanwhile).
        if os.environ.get('VERTEX_OFF') == '1' or time.time() < getattr(self, 'blocked_until', 0): return False
        return self.sa is not None and self.spent < VERTEX_CAP_USD and time.strftime('%Y-%m-%d') <= VERTEX_LAST_DAY
    def charge(self, usd):
        if usd:
            self.spent += usd
            if self.ledger:
                with open(self.ledger, 'a') as f: f.write(json.dumps({'ts': time.time(), 'usd': usd}) + '\n')
    async def token(self, http):
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
VERTEX = VertexAuth()

async def vertex_post(http, model, body, timing, location='global', **kw):
    """streamGenerateContent on Vertex AI. Returns an open response or None (timing['vertex_err'] set) so the caller
    can fall back to the Gemini API keys."""
    if not (VERTEX.usable() and model in VERTEX_MODELS): return None
    host = 'aiplatform.googleapis.com' if location == 'global' else f'{location}-aiplatform.googleapis.com'
    url = f'https://{host}/v1/projects/{VERTEX_PROJECT}/locations/{location}/publishers/google/models/{model}:streamGenerateContent?alt=sse'
    try:
        tok = await VERTEX.token(http)
        r = await http.post(url, headers={'Authorization': 'Bearer ' + tok}, json=body, **kw)
    except Exception as e:
        timing['vertex_err'] = repr(e)[:200]; return None
    if r.status == 200: timing['key'] = 'vertex'; return r
    timing['vertex_err'] = f'{r.status} {(await r.text())[:300]}'; r.release()
    if r.status in (401, 403): VERTEX.blocked_until = time.time() + 6 * 3600
    return None

def with_roles(body):
    """Vertex requires a role on every content entry; the Gemini API accepts it too."""
    for c in body.get('contents', []): c.setdefault('role', 'user')
    return body

# ---------------------------------------------------------------- LLM streaming
def _strip(t):
    return re.sub(r'[*_#`~]|[\U0001F300-\U0001FAFF☀-➿]', '', t)

async def llm_stream(http: aiohttp.ClientSession, brain_id, messages, usage, timing, max_tokens=180):
    """Yields text deltas; fills usage {'in','out','cached','usd'} and timing {'req','first','done','err'}."""
    b = BRAINS[brain_id]; timing['req'] = time.perf_counter()
    host = b['host']
    if host in ('sin', 'sea', 'or', 'sv'):
        if host == 'sv':
            url = 'https://api.sarvam.ai/v1/chat/completions'; hdr = {'api-subscription-key': env('SARVAM_API_KEY', '')}
            body = {'model': b['model']}
        elif host == 'or':
            url = 'https://openrouter.ai/api/v1/chat/completions'; hdr = {'Authorization': 'Bearer ' + env('OPENROUTER_API_KEY', ''), 'X-Title': 'vp-voicelab'}
            body = {'model': b['model'], 'provider': {'order': [b['provider']], 'allow_fallbacks': False}, 'usage': {'include': True}}
        else:
            ep = env('LAB_AI_ENDPOINT') if host == 'sin' else env('VP_AI_ENDPOINT')
            key = env('LAB_AI_KEY') if host == 'sin' else env('VP_AI_KEY')
            url = f'https://{az_host(ep)}/openai/v1/chat/completions'; hdr = {'api-key': key}
            body = {'model': b['model'], 'stream_options': {'include_usage': True}}
        body.update({'messages': messages, 'stream': True, 'max_completion_tokens': max_tokens + b.get('out_pad', 0), 'temperature': 0.6})
        if host in ('or', 'sv') or b.get('legacy_max'): body['max_tokens'] = body.pop('max_completion_tokens')
        if b.get('no_temp') or 'gpt-oss' in b['model'] or 'gptoss' in b['model'] or 'kimi' in b['model']: body.pop('temperature', None)
        body.update(b.get('extra', {}))
        async with http.post(url, headers=hdr, json=body, timeout=aiohttp.ClientTimeout(total=60, sock_read=30)) as r:
            timing['status'] = r.status
            if r.status != 200:
                timing['err'] = f'{r.status} {(await r.text())[:300]}'; timing['done'] = time.perf_counter(); return
            async for raw in r.content:
                line = raw.strip()
                if not line.startswith(b'data:'): continue
                data = line[5:].strip()
                if data == b'[DONE]': break
                try: d = json.loads(data)
                except Exception: continue
                u = d.get('usage')
                if u:
                    usage['in'] = u.get('prompt_tokens', 0) or 0; usage['out'] = u.get('completion_tokens', 0) or 0
                    usage['cached'] = ((u.get('prompt_tokens_details') or {}).get('cached_tokens', 0)) or 0
                    if host == 'or' and u.get('cost') is not None: usage['usd_reported'] = u.get('cost')
                for ch in d.get('choices') or []:
                    c = (ch.get('delta') or {}).get('content')
                    if c:
                        if 'first' not in timing: timing['first'] = time.perf_counter()
                        yield c
    elif host == 'gm':
        sysm = '\n\n'.join(m['content'] for m in messages if m['role'] == 'system'); contents = []
        for m in messages:
            if m['role'] == 'system': continue
            role = 'model' if m['role'] == 'assistant' else 'user'
            if contents and contents[-1]['role'] == role: contents[-1]['parts'][0]['text'] += '\n' + m['content']
            else: contents.append({'role': role, 'parts': [{'text': m['content']}]})
        if not contents or contents[0]['role'] != 'user': contents.insert(0, {'role': 'user', 'parts': [{'text': '(call connected)'}]})
        body = {'systemInstruction': {'parts': [{'text': sysm}]}, 'contents': contents,
                'generationConfig': {'maxOutputTokens': max_tokens, 'temperature': 0.6, 'thinkingConfig': b.get('thinking', {'thinkingLevel': 'minimal'})}}
        to = aiohttp.ClientTimeout(total=60, sock_read=30)
        r = await vertex_post(http, b['model'], with_roles(body), timing, timeout=to)
        if r is None:
            r = await gemini_post(http, f"{GEM}/models/{b['model']}:streamGenerateContent?alt=sse", body, timing, timeout=to)
        if r is not None:
            timing['status'] = 200; timing.pop('err', None)
            try:
                async for raw in r.content:
                    line = raw.strip()
                    if not line.startswith(b'data:'): continue
                    try: d = json.loads(line[5:].strip())
                    except Exception: continue
                    um = d.get('usageMetadata')
                    if um:
                        usage['in'] = um.get('promptTokenCount', 0) or 0
                        usage['out'] = (um.get('candidatesTokenCount', 0) or 0) + (um.get('thoughtsTokenCount', 0) or 0)
                        usage['cached'] = um.get('cachedContentTokenCount', 0) or 0
                    for c in d.get('candidates') or []:
                        for p in (c.get('content') or {}).get('parts') or []:
                            t = p.get('text')
                            if t and not p.get('thought'):
                                if 'first' not in timing: timing['first'] = time.perf_counter()
                                yield t
            finally:
                r.release()
    timing['done'] = time.perf_counter()
    usd = (usage.get('in', 0) - usage.get('cached', 0)) * b['in'] / 1e6 + usage.get('cached', 0) * b['in'] * 0.25 / 1e6 + usage.get('out', 0) * b['out'] / 1e6
    usage['usd'] = usage.get('usd_reported', usd) if host == 'or' else usd
    if host == 'gm':
        if timing.get('key') == 'vertex': VERTEX.charge(usage['usd'])
        else: GKEYS.charge(timing.get('key'), usage['usd'])

async def llm_once(http, brain_id, messages, max_tokens=400):
    usage, timing, out = {}, {}, []
    async for d in llm_stream(http, brain_id, messages, usage, timing, max_tokens=max_tokens): out.append(d)
    return ''.join(out), usage, timing

# ---------------------------------------------------------------- TTS
def az_ssml(voice, text, style=None):
    body = html.escape(text)
    if style: body = f"<mstts:express-as style='{style}'>{body}</mstts:express-as>"
    if voice.startswith('en-IN') and ('DragonHD' in voice or 'MAI' in voice):   # multilingual voices: pin Hindi
        body = f"<lang xml:lang='hi-IN'>{body}</lang>"
    return (f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='hi-IN'>"
            f"<voice name='{voice}'>{body}</voice></speak>")

try:
    import azure.cognitiveservices.speech as sp
except Exception:
    sp = None

class AzureSynth:
    """One pre-connected Azure websocket synthesizer (24 kHz PCM). speak() streams chunks into an asyncio queue."""
    def __init__(self, voice):
        self.voice = voice
        cfg = sp.SpeechConfig(subscription=env('LAB_SPEECH_KEY'), region=env('LAB_SPEECH_REGION', 'centralindia'))
        cfg.set_speech_synthesis_output_format(sp.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm)
        self.s = sp.SpeechSynthesizer(speech_config=cfg, audio_config=None)
        self.conn = sp.Connection.from_speech_synthesizer(self.s); self.conn.open(True)
        self.sink = None; self.loop = None
        self.s.synthesizing.connect(self._chunk)
        self.s.speak_ssml_async(az_ssml(voice, 'जी।')).get()     # warm the connection
        self.last = time.time()
    def _chunk(self, e):
        sink, loop = self.sink, self.loop
        if sink is not None and loop is not None:
            loop.call_soon_threadsafe(sink.put_nowait, bytes(e.result.audio_data))
    async def speak(self, text, style=None):
        """Async generator of 24 kHz PCM chunks for one clause."""
        q = asyncio.Queue(); self.sink = q; self.loop = asyncio.get_running_loop()
        fut = self.s.speak_ssml_async(az_ssml(self.voice, text, style))
        done = asyncio.get_running_loop().run_in_executor(None, fut.get)
        try:
            while True:
                get = asyncio.ensure_future(q.get())
                finished, _ = await asyncio.wait({get, done}, return_when=asyncio.FIRST_COMPLETED)
                if get in finished: yield get.result(); continue
                get.cancel()
                while not q.empty(): yield q.get_nowait()
                res = done.result()
                if res.reason == sp.ResultReason.Canceled:
                    raise RuntimeError('azure tts canceled: ' + str(res.cancellation_details.error_details)[:200])
                break
        finally:
            self.sink = None; self.last = time.time()
    def stop(self):
        try: self.s.stop_speaking_async().get()
        except Exception: pass

class SynthPool:
    def __init__(self): self.free = {}; self.lock = threading.Lock()
    def get(self, voice):
        with self.lock:
            lst = self.free.get(voice) or []
            if lst: return lst.pop()
        return AzureSynth(voice)
    def put(self, s):
        with self.lock: self.free.setdefault(s.voice, []).append(s)
    def warm(self, voice, n=2):
        with self.lock: have = len(self.free.get(voice) or [])
        for _ in range(max(0, n - have)):
            try: self.put(AzureSynth(voice))
            except Exception: break
POOL = SynthPool()

async def gemini_tts(http, model, voice, text, style, usage, timing):
    """Async generator of 24 kHz PCM chunks from Gemini TTS, streamGenerateContent (the path g5 measured at 0.86-1.1 s
    first byte from India; the Interactions API with L16 did not stream progressively, 3.8-4.9 s, lab 2026-10-19).
    A delivery note becomes the g5 'Say in a ... tone:' prefix, which g5 checked is not read aloud."""
    # 3.8 TTS reads its text verbatim: the old 'Say in a ... tone:' prefix was spoken aloud on real calls (testers,
    # 2026-10-19). Style belongs in the Interactions API's speech_metadata; this path sends the words only.
    prompt = text
    body = {'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}}}
    timing.setdefault('req', time.perf_counter())
    to = aiohttp.ClientTimeout(total=90, sock_read=30)
    r = await vertex_post(http, model, with_roles(body), timing, timeout=to)
    if r is None:
        r = await gemini_post(http, f'{GEM}/models/{model}:streamGenerateContent?alt=sse', body, timing, timeout=to)
    if r is None: return
    timing.pop('err', None)
    try:
        nbytes = 0; skip = True; carry = b''
        async for raw in r.content:
            line = raw.strip()
            if not line.startswith(b'data:'): continue
            try: e = json.loads(line[5:].strip())
            except Exception: continue
            for c in e.get('candidates') or []:
                for p in (c.get('content') or {}).get('parts') or []:
                    idata = p.get('inlineData')
                    if not idata or not idata.get('data'): continue
                    b = carry + base64.b64decode(idata['data'])
                    if len(b) % 2: carry, b = b[-1:], b[:-1]
                    else: carry = b''
                    if skip:   # trim leading digital silence so the first sound is speech
                        arr = memoryview(b).cast('h'); k = 0
                        while k < len(arr) and abs(arr[k]) < 64: k += 1
                        b = b[2 * k:]
                        if not b: continue
                        skip = False
                    if 'first' not in timing: timing['first'] = time.perf_counter()
                    nbytes += len(b); yield b
            um = e.get('usageMetadata')
            if um: usage['in'] = um.get('promptTokenCount', 0); usage['out'] = um.get('candidatesTokenCount', 0)
        usage['audio_s'] = usage.get('audio_s', 0) + nbytes / 48000
        usage['via'] = timing.get('key')
    finally:
        r.release()

async def or_tts(http, model, voice, text, instructions, usage, timing):
    """Async generator of 24 kHz PCM from a Gemini TTS model through OpenRouter's speech endpoint. The audio arrives
    whole (no progressive streaming); 'instructions' carries the delivery style, never the text."""
    timing.setdefault('req', time.perf_counter())
    body = {'model': model, 'input': text, 'voice': voice, 'response_format': 'pcm'}
    if instructions: body['instructions'] = instructions
    n = 0; odd = b''
    async with http.post('https://openrouter.ai/api/v1/audio/speech', json=body, timeout=aiohttp.ClientTimeout(total=60, sock_read=30),
                         headers={'Authorization': 'Bearer ' + env('OPENROUTER_API_KEY', ''), 'X-Title': 'vp-voicelab'}) as r:
        if r.status != 200:
            timing['err'] = f'{r.status} {(await r.text())[:300]}'; return
        async for ch in r.content.iter_any():
            ch = odd + ch
            if len(ch) % 2: odd, ch = ch[-1:], ch[:-1]
            else: odd = b''
            if not ch: continue
            timing.setdefault('first', time.perf_counter()); n += len(ch)
            yield ch
    usage['audio_s'] = n / 48000; usage['via'] = 'openrouter'

def tts_usd(tts_id, chars=0, audio_s=0.0):
    t = TTS[tts_id]
    if 'usd_1m_chars' in t: return chars * t['usd_1m_chars'] / 1e6      # Azure, Sarvam: per character
    return audio_s / 60 * t['usd_audio_min']                            # Gemini: per audio token

# ---------------------------------------------------------------- STT
class AzureSTT:
    """Azure real-time STT (Central India), 16 kHz push stream. Calls on_partial(text) / on_final(text) on the loop."""
    def __init__(self, loop, on_partial, on_final, on_error, lang='hi-IN', seg_ms=500):
        c = sp.SpeechConfig(subscription=env('LAB_SPEECH_KEY'), region=env('LAB_SPEECH_REGION', 'centralindia'))
        c.speech_recognition_language = lang
        c.set_property(sp.PropertyId.Speech_SegmentationSilenceTimeoutMs, str(seg_ms))
        self.stream = sp.audio.PushAudioInputStream(stream_format=sp.audio.AudioStreamFormat(samples_per_second=16000, bits_per_sample=16, channels=1))
        self.rec = sp.SpeechRecognizer(speech_config=c, audio_config=sp.audio.AudioConfig(stream=self.stream))
        cb = lambda f, *a: loop.call_soon_threadsafe(f, *a)
        self.rec.recognizing.connect(lambda e: cb(on_partial, e.result.text))
        self.rec.recognized.connect(lambda e: cb(on_final, e.result.text) if e.result.reason == sp.ResultReason.RecognizedSpeech and e.result.text else None)
        self.rec.canceled.connect(lambda e: cb(on_error, str(e.cancellation_details.error_details)[:200]) if e.cancellation_details.reason == sp.CancellationReason.Error else None)
        self.rec.start_continuous_recognition_async()
        self.audio_s = 0.0
    async def start(self): pass
    def write(self, pcm, is_speech): self.stream.write(pcm); self.audio_s += len(pcm) / 32000
    def end_of_speech(self): pass
    async def close(self):
        self.stream.close()
        try: await asyncio.get_running_loop().run_in_executor(None, lambda: self.rec.stop_continuous_recognition_async().get())
        except Exception: pass

class GeminiSTT:
    """gemini-3.5-transcribe-live over the Live websocket. Caller audio in 40 ms chunks; the session's own VAD is helped
    by an explicit audioStreamEnd when our VAD sees the caller stop (hybrid, as measured in g3)."""
    def __init__(self, http, on_partial, on_final, on_error, lang='hi-IN'):
        self.http = http; self.on_partial = on_partial; self.on_final = on_final; self.on_error = on_error; self.lang = lang
        self.ws = None; self.buf = b''; self.audio_s = 0.0; self.tier = None; self.reader = None; self.ended = True; self.closed = False; self.trace = None
    async def start(self):
        for attempt in range(2):
            key, tier = GKEYS.pick(); self.tier = tier
            if not key: raise RuntimeError('no Gemini key with budget left')
            try:
                self.ws = await self.http.ws_connect(GEM_WS, headers={'x-goog-api-key': key}, max_msg_size=0, heartbeat=20)
                await self.ws.send_json({'setup': {'model': 'models/' + STT['gemini']['model'], 'generationConfig': {'responseModalities': ['TEXT']},
                                                   'inputAudioTranscription': {'languageCodes': [self.lang]}}})
                m = await self.ws.receive(timeout=15)
                if ws_text(m) is None or 'setupComplete' not in ws_text(m):
                    raise RuntimeError(f'setup failed: {getattr(m, "data", m.type)!s:.200} close={self.ws.close_code}')
                break
            except Exception as e:
                if tier == 'free' and attempt == 0 and ('quota' in str(e).lower() or '1011' in str(e) or 'exhaust' in str(e).lower()):
                    GKEYS.quota_hit('free'); continue
                raise
        self.reader = asyncio.ensure_future(self._read())
    async def _read(self):
        try:
            async for m in self.ws:
                txt = ws_text(m)
                if txt is None: continue
                d = json.loads(txt); sc = d.get('serverContent') or {}
                if 'interimInputTranscription' in sc: self.on_partial(sc['interimInputTranscription'].get('text', ''))
                if 'inputTranscription' in sc:
                    t = sc['inputTranscription'].get('text', '').strip()
                    if t: self.on_final(t)
                if 'goAway' in d or 'error' in d: self.on_error(json.dumps(d)[:200])
        except Exception as e:
            if not self.closed: self.on_error(repr(e)[:200])
    def write(self, pcm, is_speech):
        if self.ws is None or self.ws.closed: return
        self.buf += pcm
        if is_speech: self.ended = False
        if len(self.buf) >= 1280:      # 40 ms at 16 kHz
            b, self.buf = self.buf, b''; self.audio_s += len(b) / 32000
            asyncio.ensure_future(self.ws.send_json({'realtimeInput': {'audio': {'data': base64.b64encode(b).decode(), 'mimeType': 'audio/pcm;rate=16000'}}}))
    def end_of_speech(self):
        if self.ws is not None and not self.ws.closed and not self.ended:
            self.ended = True
            if self.buf:
                b, self.buf = self.buf, b''; self.audio_s += len(b) / 32000
                asyncio.ensure_future(self.ws.send_json({'realtimeInput': {'audio': {'data': base64.b64encode(b).decode(), 'mimeType': 'audio/pcm;rate=16000'}}}))
            asyncio.ensure_future(self.ws.send_json({'realtimeInput': {'audioStreamEnd': True}}))
            if self.trace: self.trace('stt_stream_end')
    async def close(self):
        self.closed = True
        try:
            if self.ws is not None: await self.ws.close()
        except Exception: pass
        if self.reader: self.reader.cancel()

class OaiRealtimeSTT:
    """Azure OpenAI realtime transcription session (gpt-4o-transcribe), the way Taxila's Asha hears: server VAD off,
    our VAD commits the buffer at end of speech; deltas stream as partials."""
    def __init__(self, http, deployment, on_partial, on_final, on_error, lang='hi'):
        self.http = http; self.dep = deployment; self.on_partial = on_partial; self.on_final = on_final; self.on_error = on_error
        self.lang = lang; self.ws = None; self.rs = Resampler(16000, 24000); self.audio_s = 0.0; self.part = ''; self.closed = False; self.dirty = False
    async def start(self):
        url = f"wss://{az_host(env('LAB_AI_ENDPOINT'))}/openai/v1/realtime?intent=transcription"
        self.ws = await self.http.ws_connect(url, headers={'api-key': env('LAB_AI_KEY')}, max_msg_size=0, heartbeat=20)
        await self.ws.send_json({'type': 'session.update', 'session': {'type': 'transcription', 'audio': {'input': {
            'format': {'type': 'audio/pcm', 'rate': 24000}, 'turn_detection': None,
            'transcription': {'model': self.dep, 'language': self.lang,
                              'prompt': 'Hinglish phone call: Hindi in Devanagari, English words in Latin script.'}}}}})
        self.reader = asyncio.ensure_future(self._read())
    async def _read(self):
        try:
            async for m in self.ws:
                if m.type != aiohttp.WSMsgType.TEXT: continue
                d = json.loads(m.data); ty = d.get('type', '')
                if ty == 'conversation.item.input_audio_transcription.delta':
                    self.part += d.get('delta', ''); self.on_partial(self.part)
                elif ty == 'conversation.item.input_audio_transcription.completed':
                    t = (d.get('transcript') or '').strip(); self.part = ''
                    if t: self.on_final(t)
                elif ty == 'error': self.on_error(json.dumps(d)[:240])
        except Exception as e:
            if not self.closed: self.on_error(repr(e)[:200])
    def write(self, pcm, is_speech):
        if self.ws is None or self.ws.closed: return
        b = self.rs(pcm); self.audio_s += len(pcm) / 32000; self.dirty = True
        asyncio.ensure_future(self.ws.send_json({'type': 'input_audio_buffer.append', 'audio': base64.b64encode(b).decode()}))
    def end_of_speech(self):
        if self.ws is not None and not self.ws.closed and self.dirty:
            self.dirty = False
            asyncio.ensure_future(self.ws.send_json({'type': 'input_audio_buffer.commit'}))
    async def close(self):
        self.closed = True
        try:
            if self.ws is not None: await self.ws.close()
        except Exception: pass

SARVAM_STT_WS = 'wss://api.sarvam.ai/speech-to-text-realtime/ws'
class SarvamSTT:
    """Sarvam Saaras realtime STT (India-hosted per Sarvam), 16 kHz PCM in 100 ms chunks, codemix output (Hindi in
    Devanagari, English in Latin). Sarvam's own VAD endpoints each utterance; partials stream in between."""
    def __init__(self, http, model, on_partial, on_final, on_error, lang='hi-IN', silence_ms=400):
        self.http = http; self.model = model; self.on_partial = on_partial; self.on_final = on_final; self.on_error = on_error
        self.lang = lang; self.silence_ms = silence_ms; self.ws = None; self.buf = b''; self.audio_s = 0.0; self.closed = False; self.trace = None
    async def start(self):
        q = (f'?language_code={self.lang}&model={self.model}&stream_type=fast&mode=codemix&encoding=linear16&sample_rate=16000'
             f'&silence_duration_ms={self.silence_ms}')
        self.ws = await self.http.ws_connect(SARVAM_STT_WS + q, headers={'Api-Subscription-Key': env('SARVAM_API_KEY', '')}, max_msg_size=0, heartbeat=20)
        self.reader = asyncio.ensure_future(self._read()); self.pinger = asyncio.ensure_future(self._ping())
    async def _ping(self):
        while not self.closed:
            await asyncio.sleep(20)
            try: await self.ws.send_json({'event': 'ping'})
            except Exception: return
    async def _read(self):
        try:
            async for m in self.ws:
                txt = ws_text(m)
                if txt is None: continue
                d = json.loads(txt); ev = d.get('event')
                if ev == 'transcript.partial': self.on_partial(d.get('text', ''))
                elif ev == 'transcript.final':
                    t = (d.get('text') or '').strip()
                    if t: self.on_final(t)
                elif ev == 'error': self.on_error(json.dumps(d)[:200])
        except Exception as e:
            if not self.closed: self.on_error(repr(e)[:200])
        if not self.closed and self.ws is not None and self.ws.close_code not in (None, 1000):
            self.on_error(f'sarvam stt closed {self.ws.close_code}')
    def write(self, pcm, is_speech):
        if self.ws is None or self.ws.closed: return
        self.buf += pcm
        if len(self.buf) >= 3200:      # 100 ms at 16 kHz
            b, self.buf = self.buf, b''; self.audio_s += len(b) / 32000
            asyncio.ensure_future(self.ws.send_json({'event': 'audio_input', 'audio': base64.b64encode(b).decode()}))
    def end_of_speech(self):
        if self.ws is not None and not self.ws.closed and self.buf:
            b, self.buf = self.buf, b''; self.audio_s += len(b) / 32000
            asyncio.ensure_future(self.ws.send_json({'event': 'audio_input', 'audio': base64.b64encode(b).decode()}))
    async def close(self):
        self.closed = True
        try:
            if self.ws is not None:
                await self.ws.send_json({'event': 'end'}); await self.ws.close()
        except Exception: pass

SARVAM_TTS_WS = 'wss://api.sarvam.ai/text-to-speech/ws'
class SarvamTTS:
    """Bulbul streaming TTS over one warm socket per call (24 kHz linear16). speak() sends one clause plus flush and
    yields audio until Bulbul's 'final' event. There is no cancel message, so an interrupted reply closes the socket
    and the next speak() opens a fresh one (vendor guidance)."""
    def __init__(self, http, model, voice):
        self.http = http; self.model = model; self.voice = voice; self.ws = None; self.lock = asyncio.Lock(); self.pinger = None
    async def _open(self):
        self.ws = await self.http.ws_connect(f'{SARVAM_TTS_WS}?model={self.model}&send_completion_event=true',
                                             headers={'Api-Subscription-Key': env('SARVAM_API_KEY', '')}, max_msg_size=0, heartbeat=20)
        await self.ws.send_json({'type': 'config', 'data': {'language_code': 'hi-IN', 'speaker': self.voice, 'speech_sample_rate': 24000,
                                                            'output_audio_codec': 'linear16', 'min_buffer_size': 30}})
    async def warm(self):
        try:
            async with self.lock:
                if self.ws is None or self.ws.closed: await self._open()
        except Exception: pass
        if self.pinger is None: self.pinger = asyncio.ensure_future(self._keepalive())
    async def _keepalive(self):
        """Bulbul idles a socket out after about a minute; a slow first reply (4.3 s) was seen on a cold socket."""
        while True:
            await asyncio.sleep(25)
            if self.lock.locked(): continue
            try:
                async with self.lock:
                    if self.ws is None or self.ws.closed: await self._open()
                    else: await self.ws.send_json({'type': 'ping'})
            except Exception: pass
    async def speak(self, text):
        async with self.lock:
            if self.ws is None or self.ws.closed: await self._open()
            await self.ws.send_json({'type': 'text', 'data': {'text': text}})
            await self.ws.send_json({'type': 'flush'})
            while True:
                m = await self.ws.receive(timeout=20)
                txt = ws_text(m)
                if txt is None: raise RuntimeError(f'bulbul socket closed {self.ws.close_code}')
                d = json.loads(txt); ty = d.get('type')
                if ty == 'audio': yield base64.b64decode(d['data']['audio'])
                elif ty in ('pong', 'ping'): continue
                elif ty == 'error': raise RuntimeError('bulbul: ' + json.dumps(d)[:200])
                elif ty == 'event' and (d.get('data') or {}).get('event_type') == 'final': break
    def reset(self):
        ws, self.ws = self.ws, None
        if ws is not None and not ws.closed: asyncio.ensure_future(ws.close())
        asyncio.ensure_future(self.warm())     # reopen now, not on the next reply's critical path
    async def close(self):
        if self.pinger: self.pinger.cancel(); self.pinger = None
        ws, self.ws = self.ws, None
        if ws is not None and not ws.closed: await ws.close()

class Gate:
    """VAD gate (cost lever, as g3): forward caller audio only around speech, with a 200 ms pre-roll and a tail so the
    recogniser's own end-of-speech rule can fire. audio_s counts only what was sent."""
    def __init__(self, inner, tail_ms=700, preroll_ms=200):
        import collections
        self.inner = inner; self.tail = tail_ms / 20; self.ring = collections.deque(maxlen=preroll_ms // 20); self.open = False; self.sil = 0
    async def start(self): await self.inner.start()
    @property
    def audio_s(self): return self.inner.audio_s
    def write(self, pcm, is_speech):
        if is_speech:
            if not self.open:
                for b in self.ring: self.inner.write(b, False)
                self.ring.clear(); self.open = True
            self.sil = 0
        if self.open:
            self.inner.write(pcm, is_speech)
            if not is_speech:
                self.sil += 1
                if self.sil >= self.tail: self.open = False
        else: self.ring.append(pcm)
    def end_of_speech(self): self.inner.end_of_speech()
    async def close(self): await self.inner.close()

def explain(err, what):
    """A tester-facing reason a component failed, without guessing: Google 5xx vs quota vs anything else."""
    e = err or ''
    if e.startswith(('500', '502', '503', '504')) or 'UNAVAILABLE' in e:
        return f"{what} was unavailable on Google's side ({e[:3]}), not a quota problem"
    if e.startswith('429') or 'quota' in e.lower() or 'RESOURCE_EXHAUSTED' in e:
        m = re.search(r'resets (\d+) min', e)
        return f"{what} hit its quota on the Gemini keys" + (f" (resets in {m.group(1)} min)" if m else '')
    return f"{what} failed: {e[:120]}"
