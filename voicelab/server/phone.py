# VP voice lab: the phone leg (Plivo, India). Plivo answers a call (dial-in to the lab number, or our outbound "call
# me"), opens a bidirectional audio stream to /plivo/stream/<token>, and the same Call classes the browser uses run on
# it unchanged: PlivoLine stands in for the browser websocket. The line is G.711 mu-law at 8 kHz, which is what the
# phone network carries end to end anyway, so nothing audible is lost; Plivo's L16 docs don't state the byte order.
import os, json, base64, hmac, hashlib, time, uuid, math
from collections import deque
from xml.sax.saxutils import escape
import numpy as np

def digits(s): return ''.join(ch for ch in str(s or '') if ch.isdigit())
def india(s):
    """Normalise an Indian number to 91XXXXXXXXXX (accepts +91…, 0…, or 10 digits)."""
    d = digits(s)
    if len(d) == 11 and d.startswith('0'): d = d[1:]
    if len(d) == 10: d = '91' + d
    return d
def pretty(d):
    d = india(d)
    return f'+{d[:2]} {d[2:4]} {d[4:8]} {d[8:]}' if d.startswith('9180') or d.startswith('9122') else f'+{d[:2]} {d[2:7]} {d[7:]}'

AUTH_ID = os.environ.get('PLIVO_AUTH_ID', ''); TOKEN = os.environ.get('PLIVO_AUTH_TOKEN', '')
NUMBER = india(os.environ.get('PLIVO_NUMBER', ''))
ALLOWED = [india(x) for x in os.environ.get('PLIVO_ALLOWED_TO', '').split(',') if digits(x)]
BASE = os.environ.get('LAB_PUBLIC_URL', '').rstrip('/')
LINK = os.environ.get('PLIVO_LINK', '1') != '0' and BASE.startswith('https://')   # repoint the real number only from the real server
API = f'https://api.plivo.com/v1/Account/{AUTH_ID}/'
APP_NAME = 'vp-voicelab'
# Plivo India, listed on the console 2026-10-19 (60 s pulse): inbound ₹0.376/min, outbound local from ₹0.20/min.
RATE_INR_MIN = {'in': 0.376, 'out': 0.38}
# the webhook path secret: only Plivo (which we tell) and this server know it; derived so it needs no extra key
HOOK = hmac.new(TOKEN.encode(), b'vp-voicelab-hook', hashlib.sha256).hexdigest()[:32] if TOKEN else ''
def on(): return bool(AUTH_ID and TOKEN and NUMBER and BASE)
def ws_url(path): return BASE.replace('https://', 'wss://', 1).replace('http://', 'ws://', 1) + path
def auth_header(): return {'Authorization': 'Basic ' + base64.b64encode(f'{AUTH_ID}:{TOKEN}'.encode()).decode()}

# ---- G.711 mu-law
def ulaw_decode(b: bytes) -> np.ndarray:
    u = (~np.frombuffer(b, dtype=np.uint8)).astype(np.int32)
    t = (((u & 0x0F) << 3) + 0x84) << ((u & 0x70) >> 4)
    return np.where(u & 0x80, 0x84 - t, t - 0x84).astype(np.int16)
def ulaw_encode(x: np.ndarray) -> bytes:
    x = x.astype(np.int32); sign = np.where(x < 0, 0x80, 0)
    m = np.minimum(np.abs(x), 32635) + 0x84
    exp = np.floor(np.log2(m >> 7)).astype(np.int32)
    man = (m >> (exp + 3)) & 0x0F
    return (~(sign | (exp << 4) | man) & 0xFF).astype(np.uint8).tobytes()

# ---- streaming resamplers with a real low-pass (plain interpolation would alias the 4-12 kHz band into the call)
def lowpass(taps, cutoff, fs):
    n = np.arange(taps) - (taps - 1) / 2
    h = np.sinc(2 * cutoff / fs * n) * np.hamming(taps)
    return (h / h.sum()).astype(np.float32)
class FIR:
    def __init__(self, h): self.h = h; self.z = np.zeros(len(h) - 1, dtype=np.float32)
    def __call__(self, x):
        xx = np.concatenate([self.z, x]); self.z = xx[-(len(self.h) - 1):]
        return np.convolve(xx, self.h, mode='valid')
class Down24to8:
    def __init__(self): self.f = FIR(lowpass(95, 3600, 24000)); self.ph = 0
    def __call__(self, pcm24: bytes) -> np.ndarray:
        if not pcm24: return np.zeros(0, dtype=np.int16)
        y = self.f(np.frombuffer(pcm24[:len(pcm24) // 2 * 2], dtype='<i2').astype(np.float32))
        out = y[self.ph::3]; self.ph = (self.ph - len(y)) % 3
        return np.clip(out, -32768, 32767).astype(np.int16)
class Up8to16:
    def __init__(self): self.f = FIR(lowpass(63, 3800, 16000))
    def __call__(self, x8: np.ndarray) -> bytes:
        z = np.zeros(len(x8) * 2, dtype=np.float32); z[::2] = x8
        return np.clip(self.f(z) * 2, -32768, 32767).astype('<i2').tobytes()

class PlivoLine:
    """Stands in for the browser websocket: a Call's agent audio (24 kHz PCM16 behind a 4-byte reply id) goes to Plivo
    as 8 kHz mu-law playAudio, a flush (barge-in) becomes clearAudio, and every JSON message (captions, state, cost)
    lands in an event log the lab page polls, so the page shows the same live view as a browser call."""
    def __init__(self, ws, sess):
        self.ws = ws; self.sess = sess; self.stream_id = None; self.down = Down24to8(); self.up = Up8to16(); self.played_s = 0.0
    @property
    def closed(self): return self.ws.closed
    def post(self, d): SESSIONS.note(self.sess, d)
    async def send_str(self, s):
        d = json.loads(s); self.post(d)
        if d.get('t') == 'flush' and self.stream_id and not self.ws.closed:
            await self.ws.send_str(json.dumps({'event': 'clearAudio', 'streamId': self.stream_id}))
    async def send_bytes(self, b):
        y = self.down(b[4:])
        if len(y) and not self.ws.closed:
            self.played_s += len(y) / 8000
            await self.ws.send_str(json.dumps({'event': 'playAudio', 'media': {'contentType': 'audio/x-mulaw', 'sampleRate': 8000,
                                                                                'payload': base64.b64encode(ulaw_encode(y)).decode()}}))
    def mic(self, payload_b64) -> bytes:
        return self.up(ulaw_decode(base64.b64decode(payload_b64)).astype(np.float32))

def answer_xml(stream_url, max_s=1200):
    return ('<?xml version="1.0" encoding="UTF-8"?><Response>'
            f'<Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" streamTimeout="{max_s}">'
            f'{escape(stream_url)}</Stream></Response>')
REJECT_XML = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup reason="rejected"/></Response>'

def line_inr(direction, secs):
    """Plivo bills whole minutes (60 s pulse)."""
    return math.ceil(max(secs, 1) / 60) * RATE_INR_MIN[direction]

class Sessions:
    """Phone calls in flight, keyed by a lab token the page polls with. A session is created when the page asks
    Plivo to ring the tester (outbound) or arms dial-in (inbound); it binds to a Call when Plivo's stream starts."""
    TTL = 600
    def __init__(self): self.by_token = {}; self.by_stream = {}
    def new(self, cfg, direction, to=None):
        tok = uuid.uuid4().hex; st = uuid.uuid4().hex
        s = {'token': tok, 'stream': st, 'cfg': cfg, 'dir': direction, 'to': to, 'state': 'dialing' if direction == 'out' else 'waiting',
             'created': time.time(), 'call_uuid': None, 'request_uuid': None, 'line': None, 'call_id': None, 'log': deque(maxlen=800), 'n': 0}
        self.by_token[tok] = s; self.by_stream[st] = s; self.gc()
        return s
    def note(self, s, d):
        """one numbered event log per session (ringing, then everything the Call sends), read by the page's poll"""
        s['n'] += 1; s['log'].append((s['n'], d))
    def events(self, s, after):
        return [dict(d, n=n) for n, d in s['log'] if n > after]
    def waiting_dialin(self):
        live = [s for s in self.by_token.values() if s['dir'] == 'in' and s['state'] == 'waiting' and time.time() - s['created'] < self.TTL]
        return max(live, key=lambda s: s['created']) if live else None
    def gc(self):
        for t, s in list(self.by_token.items()):
            if time.time() - s['created'] > 3 * 3600: self.by_token.pop(t, None); self.by_stream.pop(s['stream'], None)
SESSIONS = Sessions()

async def api(http, method, path, data=None):
    async with http.request(method, API + path, json=data, headers=auth_header()) as r:
        txt = await r.text()
        try: d = json.loads(txt) if txt else {}
        except ValueError: d = {'raw': txt[:300]}
        return r.status, d

async def ensure_app(http, log):
    """Point the lab number at this server: one Plivo application named vp-voicelab whose answer URL is our dial-in
    hook, linked to the number. Idempotent; runs at startup."""
    answer = f'{BASE}/plivo/answer/{HOOK}'; hang = f'{BASE}/plivo/hangup/{HOOK}'
    st, d = await api(http, 'GET', 'Application/?limit=20')
    app = next((a for a in d.get('objects', []) if a.get('app_name') == APP_NAME), None)
    body = {'answer_url': answer, 'answer_method': 'POST', 'hangup_url': hang, 'hangup_method': 'POST'}
    if app is None:
        st, d = await api(http, 'POST', 'Application/', {'app_name': APP_NAME, **body}); app_id = d.get('app_id')
    else:
        app_id = app['app_id']
        if app.get('answer_url') != answer or app.get('hangup_url') != hang: st, d = await api(http, 'POST', f'Application/{app_id}/', body)
    if not app_id: log.warning('plivo app: %s %s', st, json.dumps(d)[:200]); return None
    st, d = await api(http, 'POST', f'Number/{NUMBER}/', {'app_id': app_id})
    log.info('plivo: number %s -> app %s (%s)', NUMBER, app_id, st)
    return app_id

async def dial(http, s):
    tok = s['token']
    st, d = await api(http, 'POST', 'Call/', {'from': NUMBER, 'to': s['to'], 'answer_url': f'{BASE}/plivo/answer/{HOOK}/{tok}', 'answer_method': 'POST',
                                             'hangup_url': f'{BASE}/plivo/hangup/{HOOK}/{tok}', 'hangup_method': 'POST',
                                             'ring_timeout': 45, 'time_limit': 1230})
    if st in (200, 201) and d.get('request_uuid'): s['request_uuid'] = d['request_uuid']; return None
    return f'Plivo {st}: ' + (d.get('error') or d.get('message') or json.dumps(d))[:200]

async def hangup(http, s):
    if s.get('call_uuid'): return await api(http, 'DELETE', f"Call/{s['call_uuid']}/")
    if s.get('request_uuid'): return await api(http, 'DELETE', f"Request/{s['request_uuid']}/")
    return None, None
