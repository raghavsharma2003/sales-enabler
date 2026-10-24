# Voices: text -> 24 kHz PCM16 mono, ported from voicelab/server/providers.py. speak() is an async generator of PCM
# chunks; it fills usage {'chars', 'audio_s'} and timing {'req', 'first', 'err'}. A failed request raises VoiceError.
import asyncio, base64, html, json, os, time
from .. import catalog
from .google import GoogleRoute, ws_text


class VoiceError(Exception):
    pass


def az_ssml(voice, text, style=None):
    body = html.escape(text)
    if style: body = f"<mstts:express-as style='{style}'>{body}</mstts:express-as>"
    if voice.startswith('en-IN') and ('DragonHD' in voice or 'MAI' in voice):   # multilingual voices: pin Hindi
        body = f"<lang xml:lang='hi-IN'>{body}</lang>"
    return (f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='hi-IN'>"
            f"<voice name='{voice}'>{body}</voice></speak>")


# free-form tone note -> the nearest Azure MAI-Voice style (persona_v2.mai_style), else none (neutral)
MAI_STYLE = [('excit', 'excited'), ('thrill', 'excited'), ('happy', 'happy'), ('cheer', 'happy'), ('bright', 'happy'), ('amus', 'joyful'),
             ('playful', 'joyful'), ('joy', 'joyful'), ('relie', 'relieved'), ('hope', 'hopeful'), ('surpris', 'surprised'),
             ('confus', 'confused'), ('sorry', 'regretful'), ('apolog', 'regretful'), ('regret', 'regretful'), ('sad', 'sad'),
             ('firm', 'determined'), ('serious', 'determined'), ('determin', 'determined'), ('soft', 'softvoice'), ('gentle', 'softvoice'),
             ('calm', 'softvoice')]


def mai_style(tone):
    t = (tone or '').lower()
    return next((st for k, st in MAI_STYLE if k in t), None)


class _Pcm:
    """Keeps PCM16 chunks sample-aligned across network reads."""
    def __init__(self): self.odd = b''

    def __call__(self, ch):
        ch = self.odd + ch
        if len(ch) % 2: self.odd, ch = ch[-1:], ch[:-1]
        else: self.odd = b''
        return ch


class BaseVoice:
    whole_reply = False         # Gemini voices: first sentence alone, then the rest of the reply in one request (prosody)
    styled = False              # takes a free-form tone note per reply
    sounds = False              # understands <laugh>/<sigh>/<breath> tags

    def __init__(self, http, tts_id, voice, env=None):
        self.http = http; self.tts_id = tts_id; self.spec = catalog.TTS[tts_id]; self.voice = voice
        self.env = os.environ if env is None else env

    async def warm(self): pass
    def reset(self): pass
    async def close(self): pass


class GeminiVoice(BaseVoice):
    whole_reply = True; sounds = True

    def __init__(self, http, tts_id, voice, env=None, google=None):
        super().__init__(http, tts_id, voice, env); self.google = google or GoogleRoute(self.env)

    async def warm(self): await self.google.warm(self.http)

    async def speak(self, text, style, usage, timing):
        """streamGenerateContent with audio out (the path measured at 0.86-1.1 s first byte from India). 3.8 TTS reads
        its text verbatim, so the words go alone; a style prefix was spoken aloud on real calls (2026-10-19)."""
        import aiohttp
        body = {'contents': [{'parts': [{'text': text}]}],
                'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': self.voice}}}}}
        timing.setdefault('req', time.perf_counter())
        r = await self.google.stream(self.http, self.spec['model'], body, timing, timeout=aiohttp.ClientTimeout(total=90, sock_read=30))
        if r is None: raise VoiceError(timing.get('err', 'no response'))
        usage['chars'] = usage.get('chars', 0) + len(text)
        try:
            n = 0; skip = True; pcm = _Pcm()
            async for raw in r.content:
                line = raw.strip()
                if not line.startswith(b'data:'): continue
                try: e = json.loads(line[5:].strip())
                except Exception: continue
                for c in e.get('candidates') or []:
                    for p in (c.get('content') or {}).get('parts') or []:
                        idata = p.get('inlineData')
                        if not idata or not idata.get('data'): continue
                        b = pcm(base64.b64decode(idata['data']))
                        if skip:   # trim leading digital silence so the first sound is speech
                            arr = memoryview(b).cast('h'); k = 0
                            while k < len(arr) and abs(arr[k]) < 64: k += 1
                            b = b[2 * k:]
                            if not b: continue
                            skip = False
                        timing.setdefault('first', time.perf_counter()); n += len(b)
                        usage['audio_s'] = usage.get('audio_s', 0) + len(b) / 48000
                        yield b
        finally:
            r.release()


class AzureVoice(BaseVoice):
    """Azure neural / MAI voices over the REST synthesis endpoint, streamed as raw 24 kHz PCM. (The lab used a pre-warmed
    SDK websocket; REST keeps the runtime free of the Speech SDK, at some first-audio cost not yet measured.)"""
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw); self.styled = bool(self.spec.get('emotion'))

    async def warm(self):
        from .warm import warm_hosts
        warm_hosts(self.http, [f"{self.env.get('LAB_SPEECH_REGION', 'centralindia')}.tts.speech.microsoft.com"])

    async def speak(self, text, style, usage, timing):
        import aiohttp
        region = self.env.get('LAB_SPEECH_REGION', 'centralindia')
        timing.setdefault('req', time.perf_counter())
        st = mai_style(style) if self.styled else None
        usage['chars'] = usage.get('chars', 0) + len(text)
        hdr = {'Ocp-Apim-Subscription-Key': self.env.get('LAB_SPEECH_KEY', ''), 'Content-Type': 'application/ssml+xml',
               'X-Microsoft-OutputFormat': 'raw-24khz-16bit-mono-pcm', 'User-Agent': 'vp-voice'}
        pcm = _Pcm()
        async with self.http.post(f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1', data=az_ssml(self.voice, text, st).encode(),
                                  headers=hdr, timeout=aiohttp.ClientTimeout(total=60, sock_read=30)) as r:
            if r.status != 200: raise VoiceError(f'{r.status} {(await r.text())[:300]}')
            async for ch in r.content.iter_any():
                ch = pcm(ch)
                if not ch: continue
                timing.setdefault('first', time.perf_counter())
                usage['audio_s'] = usage.get('audio_s', 0) + len(ch) / 48000
                yield ch


SARVAM_TTS_WS = 'wss://api.sarvam.ai/text-to-speech/ws'


class SarvamVoice(BaseVoice):
    """Bulbul streaming TTS over one warm socket per call. No cancel message exists, so an interrupted reply closes the
    socket and a fresh one opens off the critical path (vendor guidance)."""
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw); self.ws = None; self.lock = asyncio.Lock(); self.pinger = None

    async def _open(self):
        self.ws = await self.http.ws_connect(f"{SARVAM_TTS_WS}?model={self.spec['model']}&send_completion_event=true",
                                             headers={'Api-Subscription-Key': self.env.get('SARVAM_API_KEY', '')}, max_msg_size=0, heartbeat=20)
        await self.ws.send_json({'type': 'config', 'data': {'language_code': 'hi-IN', 'speaker': self.voice, 'speech_sample_rate': 24000,
                                                            'output_audio_codec': 'linear16', 'min_buffer_size': 30}})

    async def warm(self):
        try:
            async with self.lock:
                if self.ws is None or self.ws.closed: await self._open()
        except Exception:
            pass
        if self.pinger is None: self.pinger = asyncio.ensure_future(self._keepalive())

    async def _keepalive(self):
        while True:              # Bulbul idles a socket out after about a minute
            await asyncio.sleep(25)
            if self.lock.locked(): continue
            try:
                async with self.lock:
                    if self.ws is None or self.ws.closed: await self._open()
                    else: await self.ws.send_json({'type': 'ping'})
            except Exception:
                pass

    async def speak(self, text, style, usage, timing):
        timing.setdefault('req', time.perf_counter())
        usage['chars'] = usage.get('chars', 0) + len(text)
        async with self.lock:
            if self.ws is None or self.ws.closed: await self._open()
            await self.ws.send_json({'type': 'text', 'data': {'text': text}})
            await self.ws.send_json({'type': 'flush'})
            while True:
                m = await self.ws.receive(timeout=20)
                txt = ws_text(m)
                if txt is None: raise VoiceError(f'bulbul socket closed {self.ws.close_code}')
                d = json.loads(txt); ty = d.get('type')
                if ty == 'audio':
                    b = base64.b64decode(d['data']['audio']); timing.setdefault('first', time.perf_counter())
                    usage['audio_s'] = usage.get('audio_s', 0) + len(b) / 48000
                    yield b
                elif ty in ('pong', 'ping'): continue
                elif ty == 'error': raise VoiceError('bulbul: ' + json.dumps(d)[:200])
                elif ty == 'event' and (d.get('data') or {}).get('event_type') == 'final': break

    def reset(self):
        ws, self.ws = self.ws, None
        if ws is not None and not ws.closed: asyncio.ensure_future(ws.close())
        asyncio.ensure_future(self.warm())

    async def close(self):
        if self.pinger: self.pinger.cancel(); self.pinger = None
        ws, self.ws = self.ws, None
        if ws is not None and not ws.closed: await ws.close()


KINDS = {'gemini': GeminiVoice, 'azure': AzureVoice, 'sarvam': SarvamVoice}


def make_voice(http, tts_id, voice, env=None, google=None):
    cls = KINDS[catalog.TTS[tts_id]['kind']]
    return cls(http, tts_id, voice, env, google) if cls is GeminiVoice else cls(http, tts_id, voice, env)
