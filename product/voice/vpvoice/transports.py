# Lines: how a session's audio reaches the far end.
#  - BrowserLine: the browser test call ('webrtc' transport). The lab's approach: one websocket; the browser sends
#    16 kHz PCM16 mic frames as binary; the runtime sends agent audio as binary (4-byte little-endian reply id +
#    24 kHz PCM16) and JSON text messages (captions, state, reply, flush, ended).
#  - PlivoLine / ExotelLine: telephony media streams ('sip' transport), 8 kHz, ported from voicelab/server/phone.py.
import base64, json, math, os, struct
import numpy as np
from .audio import Down24to8, Up8to16, ulaw_decode, ulaw_encode
from .cascade import Line


class BrowserLine(Line):
    def __init__(self, ws): self.ws = ws

    @property
    def closed(self): return self.ws.closed

    async def send_audio(self, rid, pcm24):
        if not self.ws.closed:
            try: await self.ws.send_bytes(struct.pack('<I', rid) + pcm24)
            except Exception: pass

    async def flush(self, rid): await self.send_json({'t': 'flush', 'rid': rid})

    async def send_json(self, obj):
        if not self.ws.closed:
            try: await self.ws.send_str(json.dumps(obj, ensure_ascii=False))
            except Exception: pass

    async def close(self):
        try: await self.ws.close()
        except Exception: pass

    def mic(self, data): return data


class PlivoLine(Line):
    """Plivo bidirectional audio stream: G.711 mu-law 8 kHz. Agent audio goes out as playAudio, a flush (barge-in) as
    clearAudio."""
    def __init__(self, ws):
        self.ws = ws; self.stream_id = None; self.down = Down24to8(); self.up = Up8to16(); self.played_s = 0.0

    @property
    def closed(self): return self.ws.closed

    def on_event(self, d):
        """Returns caller PCM16 16 kHz for a media event, 'stop' at the end, else None."""
        ev = d.get('event')
        if ev == 'start': self.stream_id = (d.get('start') or {}).get('streamId')
        elif ev == 'media': return self.up(ulaw_decode(base64.b64decode(d['media']['payload'])).astype(np.float32))
        elif ev == 'stop': return 'stop'
        elif ev == 'dtmf': return ('dtmf', str((d.get('dtmf') or {}).get('digit') or ''))      # a keypad press
        return None

    async def send_audio(self, rid, pcm24):
        y = self.down(pcm24)
        if len(y) and not self.ws.closed:
            self.played_s += len(y) / 8000
            await self.ws.send_str(json.dumps({'event': 'playAudio', 'media': {'contentType': 'audio/x-mulaw', 'sampleRate': 8000,
                                                                                 'payload': base64.b64encode(ulaw_encode(y)).decode()}}))

    async def flush(self, rid):
        if self.stream_id and not self.ws.closed:
            await self.ws.send_str(json.dumps({'event': 'clearAudio', 'streamId': self.stream_id}))

    async def close(self):
        try: await self.ws.close()
        except Exception: pass


class ExotelLine(Line):
    """Exotel Voicebot stream: raw 16-bit linear PCM, 8 kHz mono, base64 in 'media' events; 'clear' cuts playback.
    (Protocol per Exotel's Voicebot applet docs; not yet run against a live Exotel line.)"""
    def __init__(self, ws):
        self.ws = ws; self.stream_sid = None; self.down = Down24to8(); self.up = Up8to16(); self.played_s = 0.0

    @property
    def closed(self): return self.ws.closed

    def on_event(self, d):
        ev = d.get('event')
        if ev == 'start': self.stream_sid = d.get('stream_sid') or (d.get('start') or {}).get('stream_sid')
        elif ev == 'media':
            raw = base64.b64decode(d['media']['payload'])
            return self.up(np.frombuffer(raw[:len(raw) // 2 * 2], dtype='<i2').astype(np.float32))
        elif ev == 'stop': return 'stop'
        elif ev == 'dtmf': return ('dtmf', str((d.get('dtmf') or {}).get('digit') or ''))
        return None

    async def send_audio(self, rid, pcm24):
        y = self.down(pcm24)
        if len(y) and not self.ws.closed:
            self.played_s += len(y) / 8000
            await self.ws.send_str(json.dumps({'event': 'media', 'stream_sid': self.stream_sid,
                                               'media': {'payload': base64.b64encode(y.astype('<i2').tobytes()).decode()}}))

    async def flush(self, rid):
        if not self.ws.closed:
            await self.ws.send_str(json.dumps({'event': 'clear', 'stream_sid': self.stream_sid}))

    async def close(self):
        try: await self.ws.close()
        except Exception: pass


LINES = {'plivo': PlivoLine, 'exotel': ExotelLine}


# ---- Plivo REST (outbound dial, hang-up, transfer). Credentials: PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN.
LOOPBACK = ('127.0.0.1', 'localhost', '[::1]', '::1')


def plivo_api(env):
    """Plivo's API, or VP_PLIVO_API_BASE when it is on this machine (a fake Plivo for cross-process tests; any other
    host is ignored, so the setting can never send a real call somewhere else)."""
    from urllib.parse import urlsplit
    b = (env.get('VP_PLIVO_API_BASE') or '').rstrip('/')
    if not b or (urlsplit(b).hostname or '') not in LOOPBACK: b = 'https://api.plivo.com'
    return f"{b}/v1/Account/{env.get('PLIVO_AUTH_ID', '')}/"


def allowed_to(env, number):
    """The runtime's own wall in front of Plivo (the control plane's gate keeps the same list): None when `number` may
    be dialled or bridged, else why not. VP_TELEPHONY_ALLOWED_TO is a comma-separated E.164 list; with Plivo
    credentials and no list, nothing is dialled unless VP_TELEPHONY_ALLOWLIST=off (the explicit production switch)."""
    raw = env.get('VP_TELEPHONY_ALLOWED_TO') or ''
    if raw.strip():
        return None if digits(number) in {digits(x) for x in raw.split(',') if digits(x)} else 'the number is not on VP_TELEPHONY_ALLOWED_TO'
    if env.get('PLIVO_AUTH_ID') and (env.get('VP_TELEPHONY_ALLOWLIST') or '').lower() != 'off':
        return 'no VP_TELEPHONY_ALLOWED_TO is set and VP_TELEPHONY_ALLOWLIST is not off'
    return None


def plivo_auth(env):
    return {'Authorization': 'Basic ' + base64.b64encode(f"{env.get('PLIVO_AUTH_ID', '')}:{env.get('PLIVO_AUTH_TOKEN', '')}".encode()).decode()}


async def plivo_request(http, env, method, path, data=None):
    async with http.request(method, plivo_api(env) + path, json=data, headers=plivo_auth(env)) as r:
        txt = await r.text()
        try: d = json.loads(txt) if txt else {}
        except ValueError: d = {'raw': txt[:300]}
        return r.status, d


def digits(s): return ''.join(ch for ch in str(s or '') if ch.isdigit())


async def plivo_dial(http, env, to, frm, answer_url, hangup_url, max_s, machine_url=None):
    body = {'from': digits(frm), 'to': digits(to), 'answer_url': answer_url, 'answer_method': 'POST',
            'hangup_url': hangup_url, 'hangup_method': 'POST', 'ring_timeout': 45, 'time_limit': int(max_s) + 30}
    if machine_url:
        # Plivo's answering-machine detection, asynchronous: the call is answered as usual and the verdict is posted to
        # machine_url (we end the call as 'voicemail' there, not Plivo's 'hangup' mode, so the end reason is ours)
        body.update({'machine_detection': 'true', 'machine_detection_time': 5000, 'machine_detection_url': machine_url,
                     'machine_detection_method': 'POST'})
    st, d = await plivo_request(http, env, 'POST', 'Call/', body)
    if st in (200, 201) and d.get('request_uuid'): return d['request_uuid'], None
    return None, f'Plivo {st}: ' + str(d.get('error') or d.get('message') or d)[:200]


# Plivo hang-up cause codes (https://www.plivo.com/docs/voice/troubleshooting/hangup-causes, fetched 2026-10-24;
# research/2026-10-24/plivo-amd): the code is the most precise of the three vocabularies Plivo uses
PLIVO_CODES = {3010: 'busy', 3100: 'busy', 3020: 'busy', 3110: 'busy', 3000: 'no_answer', 6010: 'no_answer', 1000: 'no_answer',
               2000: 'invalid_number', 3050: 'invalid_number', 3120: 'invalid_number', 2010: 'switched_off', 9100: 'voicemail'}


def hangup_reason(cause, code=None):
    """The end reason for a call that never reached her, from the carrier's hang-up cause: Plivo's numeric code
    (HangupCauseCode / hangup_cause_code), its name ("Busy Line", "Unallocated number"), or the standard telephony
    cause (HangupCause: USER_BUSY, NO_ANSWER, CALL_REJECTED, UNALLOCATED_NUMBER, SUBSCRIBER_ABSENT)."""
    try: n = int(code) if code not in (None, '') else None
    except (TypeError, ValueError): n = None
    if n in PLIVO_CODES: return PLIVO_CODES[n]
    c = (cause or '').lower().replace('_', ' ')
    if 'machine' in c: return 'voicemail'
    if any(k in c for k in ('busy', 'rejected', 'declined')): return 'busy'
    if any(k in c for k in ('unallocated', 'invalid', 'not exist', 'no route', 'unknown subscriber', 'incompatible destination')): return 'invalid_number'
    if any(k in c for k in ('unreachable', 'not reachable', 'absent', 'switched off', 'switch off', 'out of coverage', 'out of service')): return 'switched_off'
    if any(k in c for k in ('answer', 'timeout', 'cancel', 'no user response')): return 'no_answer'
    return 'failed'


def answer_xml(stream_url, max_s, content_type='audio/x-mulaw;rate=8000'):
    from xml.sax.saxutils import escape
    return ('<?xml version="1.0" encoding="UTF-8"?><Response>'
            f'<Stream bidirectional="true" keepCallAlive="true" contentType="{content_type}" streamTimeout="{int(max_s) + 30}">'
            f'{escape(stream_url)}</Stream></Response>')


def unanswered_xml(text="Sorry, we can't take your call right now. Please try again later."):
    """What a caller hears when nobody can answer (the control plane refused: not our number, paused, wallet low...)."""
    from xml.sax.saxutils import escape
    return f'<?xml version="1.0" encoding="UTF-8"?><Response><Speak voice="WOMAN" language="en-IN">{escape(text)}</Speak><Hangup/></Response>'


def transfer_xml(number, confirm_url=None):
    """Bridge the caller to number. confirm_url (the warm summary): Plivo fetches it when the colleague answers and plays
    what it returns (Speak only) to them before connecting the caller."""
    from xml.sax.saxutils import escape, quoteattr
    attrs = f' confirmSound={quoteattr(confirm_url)}' if confirm_url else ''
    return f'<?xml version="1.0" encoding="UTF-8"?><Response><Dial{attrs}><Number>{escape(digits(number))}</Number></Dial></Response>'


def whisper_xml(text):
    from xml.sax.saxutils import escape
    return f'<?xml version="1.0" encoding="UTF-8"?><Response><Speak voice="WOMAN" language="en-IN">{escape(text)}</Speak></Response>'
