# A call session: what every transport shares (manifest, limits, component failure, hand-off, the ending), and the
# text-mode simulated caller ('sim'). Audio transports subclass it in cascade.py and s2s.py.
import asyncio, logging, os, time
from . import RUNTIME_VERSION, brief, catalog, safety
from .conversation import ComponentError, Conversation, Draft
from .cost import CostMeter

log = logging.getLogger('vp.voice.session')

END_REASONS = {'completed', 'caller_hung_up', 'agent_ended', 'no_answer', 'busy', 'failed', 'voicemail', 'max_duration', 'max_cost',
               'silence_timeout', 'handed_off', 'crisis_handoff', 'opt_out', 'error'}
CRISIS_CEILING = 2.0           # in a crisis, limits stretch to this multiple before the call is handed off (she never ends it)


def bridge_line(target_kind, gender):
    if target_kind == 'callback':
        return f"जी, हमारे एक साथी आपको जल्दी ही कॉल करेंगे।"
    return f"जी, मैं अभी आपकी बात हमारे एक साथी से {safety.g(gender, 'करवाती', 'करवाता', 'करवाती')} हूँ, एक पल रुकिए।"


def limit_line(gender):
    return f"माफ़ कीजिए, अब मुझे यह कॉल रखनी होगी। आपका समय देने के लिए शुक्रिया।"


class Session:
    transport = 'base'

    def __init__(self, ticket, components, sink, clock=time.monotonic, env=None, watchdog_s=0.25):
        self.t = ticket; self.c = components; self.sink = sink; self.clock = clock; self.env = os.environ if env is None else env
        self.id = ticket['conversationId']; self.test = bool(ticket['test'])
        self.meter = CostMeter(ticket['limits']['maxCostInrMilli'])
        self.conv = Conversation(ticket, components.brain, sink, self.meter, clock, keep_sounds=components.keep_sounds,
                                 brain_provider=components.brain_provider, brain_id=components.brain_id)
        self.t0 = self.conv.t0; self.fallbacks = []; self.ended = None; self.error = None
        self.done = asyncio.Event(); self.watchdog_s = watchdog_s; self.tasks = []; self.handed_off = False
        self.recording_uri = None; self.ending = False; self.started = False
        self.telephony = None          # (trunk, direction) on phone calls

    # ---------------------------------------------------------------- manifest
    def manifest(self):
        n = self.c.names
        comps = {k: v for k, v in {'stt': n.get('stt'), 'llm': n.get('llm'), 'tts': n.get('tts'), 's2s': n.get('s2s'), 'voice': n.get('voice')}.items() if v}
        return {'combinationId': self.c.combination_id, 'stackId': self.t['stack']['id'], 'agentVersionHash': self.t['agent'].get('versionHash', ''),
                'components': comps, 'fallbacksUsed': list(self.fallbacks), 'memory': (self.t.get('contact') or {}).get('memoryStatus', 'none'),
                'runtimeVersion': RUNTIME_VERSION}

    def elapsed_s(self): return self.clock() - self.t0

    # ---------------------------------------------------------------- lifecycle
    async def start(self):
        self.started = True
        self.sink.start()
        self.sink.emit('call.started', manifest=self.manifest())
        self.tasks.append(asyncio.ensure_future(self._watchdog()))

    async def _watchdog(self):
        try:
            while not self.ended:
                await asyncio.sleep(self.watchdog_s)
                self.meter_running()
                await self.check_limits()
        except asyncio.CancelledError:
            pass
        except Exception:
            log.exception('watchdog')

    def meter_running(self):
        """Running costs (telephony here; ears in the cascade) are re-totalled into the meter."""
        if self.telephony and self.started:
            trunk, direction = self.telephony
            inr, billed_s = catalog.telephony_inr(trunk, direction, self.elapsed_s())
            self.meter.set_total('telephony', trunk, 'second', billed_s, inr, {'pulseS': catalog.TELEPHONY_PULSE_S, 'direction': direction})

    def limit_reached(self):
        lim = self.t['limits']; k = CRISIS_CEILING if self.conv.state['crisis'] else 1.0
        if self.elapsed_s() >= lim['maxDurationS'] * k: return 'max_duration'
        if self.meter.total_milli() >= lim['maxCostInrMilli'] * k: return 'max_cost'
        return None

    async def check_limits(self):
        if self.ended or self.ending: return False
        why = self.limit_reached()
        if not why: return False
        if self.conv.state['crisis']:
            await self.hand_off('crisis', end_reason='crisis_handoff')       # she never ends a crisis call herself
            return True
        await self.speak_canned(limit_line(self.conv.gender))
        await self.finish(why)
        return True

    async def end(self, reason, error=None):
        if self.ended: return
        reason = reason if reason in END_REASONS else 'error'
        self.ended = reason; self.error = error
        if not self.started:            # a call that never connected still reports what would have run
            self.started = True; self.sink.emit('call.started', manifest=self.manifest())
        if error: log.warning('call %s ended (%s): %s', self.id, reason, error)
        for tk in self.tasks:
            if tk is not asyncio.current_task(): tk.cancel()
        try:
            await self.close_media()
        except Exception:
            log.exception('close media')
        self.meter_running(); self.meter_final()
        for ev in self.meter.drain(): self.sink.emit(ev.pop('type'), **ev)
        fields = {'endReason': reason, 'durationS': round(self.elapsed_s(), 1), 'transcript': self.conv.transcript_out(), 'manifest': self.manifest()}
        if self.recording_uri and not self.conv.state['recording_refused']: fields['recordingUri'] = self.recording_uri
        await self.sink.end(**fields)
        self.done.set()

    async def finish(self, reason, cancellable=False):
        """End after her last line has been heard. Audio transports wait for playback (and, when cancellable, give the
        caller a beat to keep talking); text ends at once."""
        await self.end(reason)

    async def close_media(self): pass
    def meter_final(self): pass

    # ---------------------------------------------------------------- shared decisions
    def flush_costs(self):
        for ev in self.meter.drain(): self.sink.emit(ev.pop('type'), **ev)

    async def component_failed(self, err):
        """Never swap mid-call on a test call: end it, with the exact reason. A non-test call may move to the same
        model on another host, only when VP_FALLBACKS=1, and the manifest says so."""
        fb = catalog.BRAIN_FALLBACK.get(self.c.brain_id) if err.component == 'brain' else None
        if not self.test and self.env.get('VP_FALLBACKS') == '1' and fb and self.c.make_brain is not None:
            try:
                self.conv.brain = self.c.make_brain(fb)
            except Exception as e:
                await self.end('error', error=f'{err}; fallback {fb} unavailable: {e!r}'); return False
            self.fallbacks.append({'at_ms': self.conv.ms(), 'component': 'brain', 'from': self.c.brain_id, 'to': fb, 'reason': err.reason[:200]})
            self.conv.brain_id = fb; self.conv.brain_provider = catalog.BRAIN_PROVIDER.get(catalog.BRAINS[fb]['host'], 'brain')
            return True
        await self.end('error', error=str(err))
        return False

    def handoff_target(self):
        tgt = (self.t['agent'].get('handOff') or {}).get('target') or {}
        return tgt.get('kind', 'callback'), tgt.get('value')

    def summary_line(self):
        c = self.t.get('contact') or {}
        last = next((x['text'] for x in reversed(self.conv.transcript) if x['speaker'] == 'caller'), '')
        done = ', '.join(self.conv.state['goals_done']) or 'none'
        return f"{c.get('displayName') or 'Caller'}; goals settled: {done}; last said: {last[:140]}"

    async def hand_off(self, reason, end_reason='handed_off'):
        if self.handed_off and end_reason != 'crisis_handoff': return
        kind, value = self.handoff_target()
        if not self.handed_off:
            self.handed_off = True
            self.sink.emit('hand_off', reason=reason, target=f'{kind}:{value}' if value else kind, summary=self.summary_line())
        if end_reason == 'crisis_handoff' or reason != 'crisis':
            await self.speak_canned(bridge_line(kind, self.conv.gender))
            if await self.transfer(kind, value): return
            await self.finish(end_reason)

    async def transfer(self, kind, value):
        """Bridge to a human where the transport can (SIP to a phone target). False: the call ends as handed off."""
        return False

    def handoff_allowed(self, why):
        return why in ((self.t['agent'].get('handOff') or {}).get('when') or [])

    async def after_caller(self, sig):
        """Act on caller signals before any reply. Returns 'replied' when code answered instead of the brain."""
        if sig['readingSensitiveDigits']:
            await self.speak_canned(safety.stop_digits_line((self.t['agent'].get('brand') or {}).get('spokenName', ''), self.conv.gender))
            return 'replied'
        if sig['crisis'] and self.handoff_allowed('crisis'):
            await self.hand_off('crisis')                 # alerts a human; the call stays up
        if sig['refusesRecording']: self.stop_recording()
        if sig['wantsHuman'] and not sig['crisis'] and self.handoff_allowed('asks_for_human'):
            await self.hand_off('asks_for_human')
            return 'replied'
        return None

    async def after_reply(self, marks):
        """Act on her markers and the call state after a reply has been heard."""
        if self.ended: return
        self.flush_costs()
        if await self.check_limits(): return
        if self.conv.state['opt_out'] and not self.conv.state['crisis']:
            await self.finish('opt_out'); return
        if marks.get('handoff') and self.handoff_allowed(marks['handoff']) and not self.conv.state['crisis']:
            await self.hand_off(marks['handoff']); return
        if self.conv.wants_end(marks):
            await self.finish('agent_ended', cancellable=True); return
        max_turns = (self.t['agent'].get('limits') or {}).get('maxTurns')
        if max_turns and self.conv.agent_turns >= max_turns and not self.conv.state['crisis']:
            await self.speak_canned(limit_line(self.conv.gender)); await self.finish('agent_ended')

    def stop_recording(self): pass

    async def speak_canned(self, text):
        raise NotImplementedError


class SimSession(Session):
    """Text-mode simulated caller: turns in, turns out, the same brief, door and events as a real call."""
    transport = 'sim'

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw); self.outbox = []

    async def start(self):
        await super().start()
        return await self._reply()

    async def _reply(self):
        while True:
            d = Draft(None); out = []
            try:
                async for s in self.conv.sentences(d): out.append(s)
            except ComponentError as e:
                if out: d.sentences = out; break
                if await self.component_failed(e): continue
                return []
            break
        marks = self.conv.commit_agent(d)
        await self.after_reply(marks)
        return out

    async def speak_canned(self, text):
        self.conv.say_canned(text)
        self.outbox.append(text)

    async def caller_says(self, text):
        """One caller turn in; the agent's sentences out ([] once the call has ended)."""
        if self.ended or not (text or '').strip(): return []
        self.outbox = []
        sig = self.conv.commit_caller(text)
        if await self.after_caller(sig) == 'replied':
            if not self.ended: await self.after_reply({'end': False})
            return list(self.outbox)
        if self.ended: return list(self.outbox)
        return list(self.outbox) + await self._reply()

    async def hang_up(self):
        await self.end('caller_hung_up')
