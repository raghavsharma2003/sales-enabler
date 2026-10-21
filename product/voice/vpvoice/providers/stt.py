# Ears: streaming speech-to-text, ported from voicelab/server/providers.py. Caller audio is 16 kHz PCM16 mono.
# Interface: start(), write(pcm, is_speech), end_of_speech(), close(), audio_s (seconds actually sent, for the meter);
# callbacks on_partial(text), on_final(text), on_error(reason).
import asyncio, base64, collections, json, os
from .. import catalog
from .google import ws_text


class GeminiEars:
    """gemini-3.5-transcribe-live over the Vertex Live websocket: audio in 40 ms chunks, plus an explicit audioStreamEnd when
    our VAD sees the caller stop (hybrid endpointing, as measured in the lab)."""
    def __init__(self, http, google, on_partial, on_final, on_error, lang='hi-IN'):
        self.http = http; self.google = google; self.on_partial = on_partial; self.on_final = on_final; self.on_error = on_error
        self.lang = lang; self.ws = None; self.buf = b''; self.audio_s = 0.0; self.reader = None; self.ended = True; self.closed = False

    async def start(self):
        model = catalog.STT['gemini']['model']
        self.ws = await self.google.live(self.http, model)
        await self.ws.send_json({'setup': {'model': self.google.resource(model), 'generationConfig': {'responseModalities': ['TEXT']},
                                           'inputAudioTranscription': {'languageCodes': [self.lang]}}})
        m = await self.ws.receive(timeout=15)
        if ws_text(m) is None or 'setupComplete' not in ws_text(m):
            raise RuntimeError(f'ears setup failed (close {self.ws.close_code})')
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

    def _send(self, b):
        self.audio_s += len(b) / 32000
        asyncio.ensure_future(self.ws.send_json(self.google.audio_chunk(base64.b64encode(b).decode())))

    def write(self, pcm, is_speech):
        if self.ws is None or self.ws.closed: return
        self.buf += pcm
        if is_speech: self.ended = False
        if len(self.buf) >= 1280:
            b, self.buf = self.buf, b''; self._send(b)

    def end_of_speech(self):
        if self.ws is not None and not self.ws.closed and not self.ended:
            self.ended = True
            if self.buf:
                b, self.buf = self.buf, b''; self._send(b)
            asyncio.ensure_future(self.ws.send_json({'realtimeInput': {'audioStreamEnd': True}}))

    async def close(self):
        self.closed = True
        try:
            if self.ws is not None: await self.ws.close()
        except Exception:
            pass
        if self.reader: self.reader.cancel()


class AzureEars:
    """Azure Speech real-time STT (Central India, hi-IN), ported from voicelab/server/providers.py AzureSTT: a 16 kHz
    push stream into the Speech SDK's continuous recogniser; partials on 'recognizing', finals on 'recognized'; the
    service's own segmentation (500 ms silence) endpoints each utterance. The SDK runs its own threads, so callbacks
    hop back to the event loop. The SDK is imported at start() (tests inject a fake; never a network call in tests)."""
    def __init__(self, on_partial, on_final, on_error, lang='hi-IN', env=None, seg_ms=500, sdk=None):
        self.on_partial = on_partial; self.on_final = on_final; self.on_error = on_error; self.lang = lang; self.seg_ms = seg_ms
        self.env = os.environ if env is None else env; self.sdk = sdk; self.stream = None; self.rec = None
        self.audio_s = 0.0; self.closed = False

    async def start(self):
        sp = self.sdk
        if sp is None:
            import azure.cognitiveservices.speech as sp           # azure-cognitiveservices-speech (requirements.txt)
        loop = asyncio.get_running_loop()
        c = sp.SpeechConfig(subscription=self.env.get('LAB_SPEECH_KEY', ''), region=self.env.get('LAB_SPEECH_REGION') or 'centralindia')
        c.speech_recognition_language = self.lang
        c.set_property(sp.PropertyId.Speech_SegmentationSilenceTimeoutMs, str(self.seg_ms))
        self.stream = sp.audio.PushAudioInputStream(stream_format=sp.audio.AudioStreamFormat(samples_per_second=16000, bits_per_sample=16, channels=1))
        self.rec = sp.SpeechRecognizer(speech_config=c, audio_config=sp.audio.AudioConfig(stream=self.stream))
        hop = lambda f, *a: None if self.closed else loop.call_soon_threadsafe(f, *a)
        self.rec.recognizing.connect(lambda e: hop(self.on_partial, e.result.text))
        self.rec.recognized.connect(lambda e: hop(self.on_final, e.result.text)
                                    if e.result.reason == sp.ResultReason.RecognizedSpeech and e.result.text else None)
        self.rec.canceled.connect(lambda e: hop(self.on_error, str(e.cancellation_details.error_details)[:200])
                                  if e.cancellation_details.reason == sp.CancellationReason.Error else None)
        await loop.run_in_executor(None, lambda: self.rec.start_continuous_recognition_async().get())

    def write(self, pcm, is_speech):
        if self.stream is None or self.closed: return
        self.stream.write(pcm); self.audio_s += len(pcm) / 32000

    def end_of_speech(self): pass                                  # Azure endpoints on its own silence timeout

    async def close(self):
        if self.closed: return
        self.closed = True
        if self.stream is not None: self.stream.close()
        if self.rec is not None:
            try: await asyncio.get_running_loop().run_in_executor(None, lambda: self.rec.stop_continuous_recognition_async().get())
            except Exception: pass


SARVAM_STT_WS = 'wss://api.sarvam.ai/speech-to-text-realtime/ws'


class SarvamEars:
    """Saaras realtime STT, 16 kHz PCM in 100 ms chunks, codemix output; Sarvam's own VAD endpoints each utterance."""
    def __init__(self, http, model, on_partial, on_final, on_error, lang='hi-IN', silence_ms=400, env=None):
        self.http = http; self.model = model; self.on_partial = on_partial; self.on_final = on_final; self.on_error = on_error
        self.lang = lang; self.silence_ms = silence_ms; self.ws = None; self.buf = b''; self.audio_s = 0.0; self.closed = False
        self.env = os.environ if env is None else env; self.reader = None; self.pinger = None

    async def start(self):
        q = (f'?language_code={self.lang}&model={self.model}&stream_type=fast&mode=codemix&encoding=linear16&sample_rate=16000'
             f'&silence_duration_ms={self.silence_ms}')
        self.ws = await self.http.ws_connect(SARVAM_STT_WS + q, headers={'Api-Subscription-Key': self.env.get('SARVAM_API_KEY', '')}, max_msg_size=0, heartbeat=20)
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
            self.on_error(f'sarvam ears closed {self.ws.close_code}')

    def _send(self, b):
        self.audio_s += len(b) / 32000
        asyncio.ensure_future(self.ws.send_json({'event': 'audio_input', 'audio': base64.b64encode(b).decode()}))

    def write(self, pcm, is_speech):
        if self.ws is None or self.ws.closed: return
        self.buf += pcm
        if len(self.buf) >= 3200:
            b, self.buf = self.buf, b''; self._send(b)

    def end_of_speech(self):
        if self.ws is not None and not self.ws.closed and self.buf:
            b, self.buf = self.buf, b''; self._send(b)

    async def close(self):
        self.closed = True
        if self.pinger: self.pinger.cancel()
        try:
            if self.ws is not None:
                await self.ws.send_json({'event': 'end'}); await self.ws.close()
        except Exception:
            pass


class Gate:
    """VAD gate (cost lever): forward caller audio only around speech, with a 200 ms pre-roll and a tail so the
    recogniser's own end-of-speech rule can fire. audio_s counts only what was sent. Frames are 20 ms."""
    def __init__(self, inner, tail_ms=700, preroll_ms=200, frame_ms=20):
        self.inner = inner; self.tail = tail_ms / frame_ms; self.ring = collections.deque(maxlen=preroll_ms // frame_ms); self.open = False; self.sil = 0

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
        else:
            self.ring.append(pcm)

    def end_of_speech(self): self.inner.end_of_speech()
    async def close(self): await self.inner.close()
