# Speech-to-speech (Gemini Live), ported from voicelab/server/calls.py GeminiLiveCall. The model speaks directly, so
# the reply door can only read its output transcription as it streams: a sentence that fails the door cuts playback
# at once and the model is told to say the honest / safe line instead. That is weaker than the cascade's door, which
# is why the stack is beta (stacks.ts: "must pass the reply-door attack battery before live calls").
import asyncio, base64, json, logging, time
from . import brief, catalog, safety
from .audio import Recorder, Resampler
from .conversation import ComponentError, Draft
from .providers.google import ws_text
from .session import Session

log = logging.getLogger('vp.voice.s2s')

END_TOOL = {'name': 'end_call', 'description': 'Hang up the phone. Use it only right after your own goodbye line, when the '
            'conversation is over; never while they are still talking or asking.'}


def setup_msg(spec, voice, system, tools=(), modality='AUDIO', handle=None):
    gen = {'responseModalities': [modality]}
    if modality == 'AUDIO': gen['speechConfig'] = {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}
    s = {'model': 'models/' + spec['model'], 'generationConfig': gen, 'systemInstruction': {'parts': [{'text': system}]},
         'realtimeInputConfig': {'automaticActivityDetection': {'silenceDurationMs': 500, 'prefixPaddingMs': 100}},
         'sessionResumption': ({'handle': handle} if handle else {})}
    if modality == 'AUDIO': s.update({'inputAudioTranscription': {}, 'outputAudioTranscription': {}})
    decl = [END_TOOL] + [t for t in tools if t.get('name') != 'end_call']
    s['tools'] = [{'functionDeclarations': decl}]
    if spec.get('compression'):
        trig, targ = spec['compression']
        s['contextWindowCompression'] = {'triggerTokens': trig, 'slidingWindow': {'targetTokens': targ}}
    return {'setup': s}


async def connect(http, google, setup):
    ws = await google.live(http)
    await ws.send_json(setup)
    m = await ws.receive(timeout=20)
    if ws_text(m) is None or 'setupComplete' not in ws_text(m):
        raise RuntimeError(f'live setup failed (close {ws.close_code})')
    return ws


def make_live(http, google, spec, voice, system, tools=()):
    return {'http': http, 'google': google, 'spec': spec, 'voice': voice, 'system': system, 'tools': list(tools)}


class GeminiLiveText:
    """The Live model in text mode, for the sim transport: one session per call, the system text set once, each turn
    sends the caller's words plus the LAST block as context. Same brief, same door (the door runs on the text)."""
    def __init__(self, http, google, model):
        self.http = http; self.google = google; self.spec = {'model': model}; self.ws = None; self.sent = 0

    async def stream(self, messages, usage, timing, max_tokens=180):
        timing['req'] = time.perf_counter()
        try:
            if self.ws is None or self.ws.closed:
                system = '\n\n'.join(m['content'] for m in messages if m['role'] == 'system' and not m['content'].startswith('Ledger'))
                self.ws = await connect(self.http, self.google, setup_msg(self.spec, None, system, modality='TEXT'))
            convo = [m for m in messages if m['role'] != 'system']
            tail = [m['content'] for m in messages if m['role'] == 'system' and m['content'].startswith(('Ledger', 'Your last draft'))]
            turns = [{'role': 'model' if m['role'] == 'assistant' else 'user', 'parts': [{'text': m['content']}]} for m in convo[self.sent:]]
            self.sent = len(convo)
            turns.append({'role': 'user', 'parts': [{'text': '<context, not from the caller: ' + ' | '.join(tail).replace('\n', ' | ') + '>'}]})
            await self.ws.send_json({'clientContent': {'turns': turns, 'turnComplete': True}})
            async for m in self.ws:
                txt = ws_text(m)
                if txt is None: continue
                d = json.loads(txt); sc = d.get('serverContent') or {}
                for p in (sc.get('modelTurn') or {}).get('parts') or []:
                    if p.get('text'):
                        timing.setdefault('first', time.perf_counter()); yield p['text']
                um = d.get('usageMetadata')
                if um:
                    usage['in'] = um.get('promptTokenCount', 0) or 0; usage['out'] = um.get('responseTokenCount', 0) or 0
                    usage['usd'] = catalog.live_usd(um)
                if sc.get('turnComplete'): break
        except Exception as e:
            timing['err'] = repr(e)[:200]


class LiveSession(Session):
    """A phone or browser call on Gemini Live. The session owns turn-taking (Live's own VAD); we own the door, the
    signals, the ledger notes, the events and the meter."""

    def __init__(self, ticket, components, sink, line, clock=time.monotonic, env=None, watchdog_s=0.25, transport='webrtc'):
        super().__init__(ticket, components, sink, clock=clock, env=env, watchdog_s=watchdog_s)
        self.transport = transport; self.line = line
        rec = (ticket['agent'].get('recording') or {}).get('enabled', False)
        self.rec = Recorder(clock, enabled=rec); self.agent_rs = Resampler(24000, 16000)
        self.up = None; self.reader = None; self.buf = b''; self.rid = 0; self.cur = None; self.handle = None
        self.agent_text = ''; self.user_text = ''; self.draft = None; self.cut = False; self.turn_start = None
        self.splitter = brief.Splitter(); self.live = None

    def now(self): return self.clock()
    def agent_playing(self): return self.now() < self.rec.play_until

    async def start(self):
        await super().start()
        system = '\n\n'.join(m['content'] for m in self.conv.system_messages())
        tools = [{'name': t['name'], 'description': f"Ask for {t['name']} to run after the call turn."}
                 for t in self.t['agent'].get('tools') or [] if t.get('name') not in ('end_call', 'transfer')]
        self.live = self.c.make_s2s(system, tools)
        try:
            self.up = await connect(self.live['http'], self.live['google'], setup_msg(self.live['spec'], self.live['voice'], system, tools))
        except Exception as e:
            await self.component_failed(ComponentError('s2s', 'gemini', repr(e)[:200])); return
        self.reader = asyncio.ensure_future(self.read()); self.tasks.append(self.reader)
        await self.note(brief.tail(self.conv.transcript, self.conv.agent, self.conv.contact, self.conv.state))
        await self.up.send_json({'clientContent': {'turns': [{'role': 'user', 'parts': [{'text': self.conv.history[0]['content']}]}], 'turnComplete': True}})

    async def note(self, text, complete=False):
        """Silent context for the model (Maya's direct() pattern): the ledger, or a door correction."""
        try:
            await self.up.send_json({'clientContent': {'turns': [{'role': 'user', 'parts': [{'text': '<context, not from the caller: '
                                     + text.replace('\n', ' | ') + '>'}]}], 'turnComplete': complete}})
        except Exception as e:
            log.warning('live note failed: %r', e)

    async def on_mic(self, pcm16k):
        if self.up is None or self.up.closed or self.ended: return
        self.rec.add_caller(pcm16k)
        self.buf += pcm16k
        if len(self.buf) >= 1280:
            b, self.buf = self.buf, b''
            try: await self.up.send_json({'realtimeInput': {'audio': {'data': base64.b64encode(b).decode(), 'mimeType': 'audio/pcm;rate=16000'}}})
            except Exception: pass

    async def _door_text(self, piece):
        """Door the output transcription sentence by sentence; on a failure cut her off and have her say the safe line."""
        if self.draft is None: self.draft = Draft(None)
        for sent in self.splitter.feed(piece):
            if self.cut: return
            n = len(self.draft.sentences)
            out, v = self.conv.check(sent, self.draft)
            if v['action'] == 'pass': continue
            self.cut = True
            if self.cur is not None: self.rec.flush(self.now()); await self.line.flush(self.cur)
            line = v['text'] if v['action'] == 'replace' else safety.safe_fallback_line(self.conv.gender)
            del self.draft.sentences[n:]
            await self.note(f'your last line broke a safety rule ({v["rule"]}) and was cut. Say exactly this, then carry on: "{line}"', complete=True)

    async def read(self):
        try:
            async for m in self.up:
                txt = ws_text(m)
                if txt is None: continue
                d = json.loads(txt); sc = d.get('serverContent')
                if sc:
                    for p in (sc.get('modelTurn') or {}).get('parts') or []:
                        idata = p.get('inlineData')
                        if idata and idata.get('data') and not self.cut:
                            b = base64.b64decode(idata['data'])
                            if self.cur is None:
                                self.rid += 1; self.cur = self.rid; self.turn_start = self.now()
                                if self.user_text.strip(): await self._caller_turn()
                            self.rec.add_agent(self.agent_rs(b), self.now())
                            await self.line.send_audio(self.cur, b)
                    if 'inputTranscription' in sc:
                        self.user_text += sc['inputTranscription'].get('text', '')
                    if 'outputTranscription' in sc:
                        t = sc['outputTranscription'].get('text', '')
                        self.agent_text += t
                        await self._door_text(t)
                    if sc.get('interrupted'):
                        if self.cur is not None: self.rec.flush(self.now()); await self.line.flush(self.cur)
                        self._end_turn(interrupted=True)
                    if sc.get('turnComplete'): self._end_turn()
                tc = d.get('toolCall')
                if tc:
                    resp = []
                    for fc in tc.get('functionCalls') or []:
                        resp.append({'id': fc.get('id'), 'name': fc.get('name'), 'response': {'ok': True}})
                        if fc.get('name') == 'end_call' and self.conv.wants_end({'end': True}):
                            asyncio.ensure_future(self.finish('agent_ended', cancellable=True))
                        elif fc.get('name') != 'end_call':
                            self.sink.emit('tool', name=fc.get('name'), args=fc.get('args') or {}, status='requested')
                    try: await self.up.send_json({'toolResponse': {'functionResponses': resp}})
                    except Exception: pass
                um = d.get('usageMetadata')
                if um:
                    self.meter.add('brain', 'gemini', 'token', (um.get('promptTokenCount', 0) or 0) + (um.get('responseTokenCount', 0) or 0),
                                   usd=catalog.live_usd(um), detail={'s2s': True, 'model': self.c.brain_id})
                if 'sessionResumptionUpdate' in d:
                    self.handle = (d['sessionResumptionUpdate'] or {}).get('newHandle') or self.handle
        except asyncio.CancelledError:
            return
        except Exception as e:
            if not self.ended: await self.component_failed(ComponentError('s2s', 'gemini', repr(e)[:200])); return
        if not self.ended and self.up is not None and self.up.close_code not in (None, 1000):
            await self.component_failed(ComponentError('s2s', 'gemini', f'live session closed by the provider ({self.up.close_code})'))

    async def _caller_turn(self):
        text = self.user_text.strip(); self.user_text = ''
        sig = self.conv.commit_caller(text)
        if sig['crisis']:
            await self.note('CRISIS: drop the goal. Give Tele-MANAS 14416 (free, 24x7) and 112 for danger; offer a human; never end the call.')
        if sig['readingSensitiveDigits']:
            await self.note(f'stop them kindly now and say: "{safety.stop_digits_line((self.t["agent"].get("brand") or {}).get("spokenName", ""), self.conv.gender)}"', complete=True)
        if sig['asksIfAi']:
            await self.note('they asked if you are an AI: say yes plainly first, lightly.')
        if sig['refusesRecording']: self.rec.stop()
        if sig['wantsHuman'] and self.handoff_allowed('asks_for_human'): asyncio.ensure_future(self.hand_off('asks_for_human'))
        if sig['crisis'] and self.handoff_allowed('crisis'): asyncio.ensure_future(self.hand_off('crisis'))

    def _end_turn(self, interrupted=False):
        if self.draft is not None:
            for s in self.splitter.flush():
                if not self.cut: self.conv.check(s, self.draft)
            heard = self.draft.text if not interrupted else None
            self.draft.raw = self.agent_text
            marks = self.conv.commit_agent(self.draft, heard=heard, start_ms=int((self.turn_start - self.t0) * 1000) if self.turn_start else None,
                                           interrupted=interrupted)
            asyncio.ensure_future(self.note(brief.ledger(self.conv.transcript, self.conv.agent, self.conv.contact, self.conv.state)))
            if not interrupted: asyncio.ensure_future(self.after_reply(marks))
        self.agent_text = ''; self.cur = None; self.draft = None; self.cut = False; self.splitter = brief.Splitter()

    async def speak_canned(self, text):
        await self.note(f'say exactly this now: "{text}"', complete=True)
        await asyncio.sleep(0)

    async def finish(self, reason, cancellable=False):
        if self.ended or self.ending: return
        self.ending = True
        try:
            lim = self.now() + 30
            while self.agent_playing() and self.now() < lim: await asyncio.sleep(0.05)
            await asyncio.sleep(1.0)
            await self.end(reason)
        finally:
            self.ending = False

    def stop_recording(self): self.rec.stop()

    async def close_media(self):
        try:
            if self.up is not None: await self.up.close()
        except Exception:
            pass
        try: await self.line.send_json({'t': 'ended', 'endReason': self.ended})
        except Exception: pass
        await self.line.close()
