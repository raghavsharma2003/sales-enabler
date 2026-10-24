# A call session: what every transport shares (manifest, limits, component failure, hand-off, the ending), and the
# text-mode simulated caller ('sim'). Audio transports subclass it in cascade.py and s2s.py.
import asyncio, logging, os, time
from . import RUNTIME_VERSION, brief, catalog, recordings, safety
from .conversation import ComponentError, Conversation, Draft
from .cost import CostMeter

log = logging.getLogger('vp.voice.session')

END_REASONS = {'completed', 'caller_hung_up', 'agent_ended', 'no_answer', 'busy', 'failed', 'voicemail', 'switched_off', 'invalid_number',
               'max_duration', 'max_cost', 'silence_timeout', 'handed_off', 'crisis_handoff', 'opt_out', 'error'}
CRISIS_CEILING = 2.0           # in a crisis, limits stretch to this multiple before the call is handed off (she never ends it)


# Her fixed lines live in shared/safety/fixed-lines.json, one table per language (safety.fixed_line). These keep the
# call sites short; lang is the call's language (safety.call_language), said what she has been saying (its script).
def bridge_line(target_kind, gender, lang='hi-IN', said=''):
    return safety.fixed_line('bridge_callback' if target_kind == 'callback' else 'bridge_now', lang, gender, said)


def limit_line(gender, lang='hi-IN', said=''): return safety.fixed_line('limit', lang, gender, said)
def takeover_line(gender, lang='hinglish', said=''): return safety.fixed_line('takeover', lang, gender, said)
def member_drop_line(gender, lang='hinglish', said=''): return safety.fixed_line('member_drop', lang, gender, said)
def silence_line(gender, lang='hi-IN', said=''): return safety.fixed_line('silence', lang, gender, said)


WHISPER_MAX = 300
MEMBER_JOIN_S = 60             # a takeover nobody joins within this is ended like a dropped member


class Session:
    transport = 'base'

    def __init__(self, ticket, components, sink, clock=time.monotonic, env=None, watchdog_s=0.25):
        self.t = ticket; self.c = components; self.sink = sink; self.clock = clock; self.env = os.environ if env is None else env
        self.id = ticket['conversationId']; self.test = bool(ticket['test'])
        self.meter = CostMeter(ticket['limits']['maxCostInrMilli'])
        self.conv = Conversation(ticket, components.brain, sink, self.meter, clock, keep_sounds=components.keep_sounds,
                                 brain_provider=components.brain_provider, brain_id=components.brain_id)
        self.conv.judge_complete = getattr(components, 'judge_complete', None); self.conv.judge_env = self.env
        self.t0 = self.conv.t0; self.fallbacks = []; self.ended = None; self.error = None
        self.done = asyncio.Event(); self.watchdog_s = watchdog_s; self.tasks = []; self.handed_off = False
        self.recording_uri = None; self.ending = False; self.started = False
        self.telephony = None          # (trunk, direction) on phone calls
        # live controls (server.py /listen /whisper /takeover): after a takeover she never speaks again, except to close
        # the call if the member drops; listeners hear, are never heard, never recorded
        self.taken_over = None; self.member = None; self.member_task = None; self.listeners = set(); self.live_closers = []

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
        if self.taken_over:            # a person holds the call: her limits stop; a runaway guard ends it silently at the ceiling
            if self.elapsed_s() >= self.t['limits']['maxDurationS'] * CRISIS_CEILING: await self.end('handed_off'); return True
            return False
        why = self.limit_reached()
        if not why: return False
        if self.conv.state['crisis']:
            await self.hand_off('crisis', end_reason='crisis_handoff')       # she never ends a crisis call herself
            return True
        await self.speak_canned(self.fixed('limit'))
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
            await self.conv.drain_judges()          # judge meter lines land before call.ended, never after
        except Exception:
            log.exception('drain judges')
        try:
            await self.close_media()
        except Exception:
            log.exception('close media')
        for send in list(self.listeners): self.listener_removed(send)     # each listen pair closes before call.ended
        for close in list(self.live_closers):          # listen and member sockets end with the call
            try: await close()
            except Exception: pass
        self.meter_running(); self.meter_final()
        for ev in self.meter.drain(): self.sink.emit(ev.pop('type'), **ev)
        self.save_sim_recording()
        fields = {'endReason': reason, 'durationS': round(self.elapsed_s(), 1), 'transcript': self.conv.transcript_out(), 'manifest': self.manifest()}
        if self.recording_uri and not self.conv.state['recording_refused']: fields['recordingUri'] = self.recording_uri
        await self.sink.end(**fields)
        self.done.set()

    async def finish(self, reason, cancellable=False):
        """End after her last line has been heard. Audio transports wait for playback (and, when cancellable, give the
        caller a beat to keep talking); text ends at once."""
        await self.end(reason)

    async def close_media(self): pass

    def save_sim_recording(self):
        """A text call has no audio. Components may carry sim_recording(path) (devsim's tone), so the signed recording route
        can be tested end to end; never set by the real runtime. Same rules as a real recording: enabled, not refused."""
        write, d = getattr(self.c, 'sim_recording', None), self.env.get('VP_RECORDINGS_DIR')
        if not write or not d or self.recording_uri or self.conv.state['recording_refused']: return
        if not (self.t['agent'].get('recording') or {}).get('enabled', False): return
        try: self.recording_uri = recordings.save(d, self.id, self.t.get('workspaceId', ''), write)
        except Exception: log.exception('sim recording')
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
        """Tell the control plane a human is needed (one hand_off event per call), then bridge or end. In a crisis the
        call is never ended from our side: only a live transfer takes it over, or the crisis ceiling (crisis_handoff)."""
        if self.taken_over: return                            # a person already holds the call
        kind, value = self.handoff_target()
        if not self.handed_off:
            self.handed_off = True
            self.sink.emit('hand_off', reason=reason, target=f'{kind}:{value}' if value else kind, summary=self.summary_line())
        elif end_reason != 'crisis_handoff' and not self.conv.state['crisis']:
            return
        if self.conv.state['crisis'] and end_reason != 'crisis_handoff':
            if kind == 'phone' and value and reason == 'asks_for_human':
                await self.speak_canned(self.fixed('bridge_callback' if kind == 'callback' else 'bridge_now'))
                if await self.transfer(kind, value): return
            return                                          # alert raised; she stays with them
        await self.speak_canned(self.fixed('bridge_callback' if kind == 'callback' else 'bridge_now'))
        if await self.transfer(kind, value): return
        await self.finish(end_reason)

    async def transfer(self, kind, value):
        """Bridge to a human where the transport can (SIP to a phone target). False: the call ends as handed off."""
        return False

    def handoff_allowed(self, why):
        return why in ((self.t['agent'].get('handOff') or {}).get('when') or [])

    async def after_caller(self, sig):
        """Act on caller signals before any reply. Returns 'replied' when code answered instead of the brain."""
        if self.taken_over: return 'replied'                  # she does not answer once a person holds the call
        if sig['crisis'] and self.handoff_allowed('crisis'):
            await self.hand_off('crisis')                 # alerts a human; the call stays up
        if sig['refusesRecording']: self.stop_recording()
        if sig['readingSensitiveDigits']:
            await self.speak_canned(safety.stop_digits_line((self.t['agent'].get('brand') or {}).get("spokenName", "")))
            return 'replied'
        if sig['wantsHuman'] and self.conv.state['crisis']:
            await self.hand_off('asks_for_human')          # a transfer if the line can; otherwise she stays and answers
            return None if not self.ended else 'replied'
        if sig['wantsHuman'] and self.handoff_allowed('asks_for_human'):
            await self.hand_off('asks_for_human')
            return 'replied'
        return None

    async def after_reply(self, marks):
        """Act on her markers and the call state after a reply has been heard."""
        if self.ended or self.taken_over: return
        if self.conv.judge_raised:                  # the judge raised a crisis this turn: alert a human, as for a floor hit
            self.conv.judge_raised = False
            if self.handoff_allowed('crisis'): await self.hand_off('crisis')
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
            await self.speak_canned(self.fixed('limit')); await self.finish('agent_ended')

    def stop_recording(self): pass

    async def speak_canned(self, text):
        raise NotImplementedError

    # ---------------------------------------------------------------- live controls
    def live(self): return self.started and not self.ended and not self.ending

    def whisper(self, text):
        """A supervisor's note for her next reply. Untrusted: redacted, capped, placed in the LAST block, and whatever she
        then says still goes through the door. Never spoken verbatim, never in an event. Returns a refusal or None."""
        if self.taken_over: return 'the call has been taken over'
        clean = safety.redact(' '.join(str(text).split()))[:WHISPER_MAX]
        if not clean: return 'empty whisper'
        self.conv.whisper = clean; self.conv.whisper_used = False
        self.sink.emit('moment', kind='whisper', atMs=self.conv.ms())          # that a note was sent; never what it said
        return None

    def listener_added(self, send):
        self.listeners.add(send)
        self.sink.emit('moment', kind='live_listen_started', atMs=self.conv.ms(), note='a supervisor started listening')

    def listener_removed(self, send):
        if send not in self.listeners: return
        self.listeners.discard(send)
        self.sink.emit('moment', kind='live_listen_ended', atMs=self.conv.ms(), note='a supervisor stopped listening')

    def fixed(self, key):
        """Her fixed line `key` in the call's language and in the script she has been speaking."""
        said = ' '.join(t['text'] for t in self.conv.transcript if t['speaker'] == 'agent')[-400:]
        return safety.fixed_line(key, safety.call_language(self.t['agent'], self.t.get('contact')), self.conv.gender, said)

    def doored(self, line):
        """A fixed line from code, put through the reply door like anything she says (None if the door blocks it)."""
        text, _ = self.conv.check(line, Draft(None))
        return text

    async def cut_for_takeover(self): pass

    async def takeover(self, member_id):
        """She stops for good: any reply is cut (at a sentence end when one is near), she says one doored hand-off line,
        and the member is bridged in. hand_off target member:<id> tells the control plane a person holds the call."""
        if self.taken_over or not self.live(): return
        self.taken_over = str(member_id)
        await self.cut_for_takeover()
        self.handed_off = True
        self.sink.emit('moment', kind='takeover', atMs=self.conv.ms(), note='a person took over the call')
        self.sink.emit('hand_off', reason='takeover', target=f'member:{self.taken_over}', summary=self.summary_line())
        line = self.doored(self.fixed('takeover'))
        if line: await self.speak_canned(line)
        self.member_task = asyncio.ensure_future(self._member_deadline()); self.tasks.append(self.member_task)

    async def _member_deadline(self):
        await asyncio.sleep(MEMBER_JOIN_S)
        if self.member is None: await self.member_dropped()

    def member_joined(self, send):
        self.member = send
        if self.member_task is not None: self.member_task.cancel()

    async def member_dropped(self):
        """v1: a member who drops is not replaced by her: the call closes with one short doored line."""
        if self.ended: return
        self.member = None
        line = self.doored(self.fixed('member_drop'))
        if line: await self.speak_canned(line)
        await self.finish('handed_off')


class SimSession(Session):
    """Text-mode simulated caller: turns in, turns out, the same brief, door and events as a real call."""
    transport = 'sim'

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw); self.outbox = []
        self.push = None               # set by the sim socket: sends a message to the simulated caller unprompted

    async def start(self):
        await super().start()
        return await self._reply()

    async def _reply(self, gate=None):
        while True:
            d = Draft(None); d.gate = gate; gate = None; out = []
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
        if self.taken_over and self.push: await self.push({'t': 'agent', 'sentences': [text], 'ended': self.ended})   # outside a turn

    async def caller_says(self, text):
        """One caller turn in; the agent's sentences out ([] once the call has ended)."""
        if self.ended or not (text or '').strip(): return []
        self.outbox = []
        if self.taken_over:            # a person holds the call: the caller's turn is recorded and relayed, never answered
            self.conv.commit_caller(text)
            if self.member: await self.member({'t': 'caller', 'text': self.conv.transcript[-1]['text']})
            return []
        sig = self.conv.commit_caller(text)
        gate = self.conv.start_judge(text, self.conv.prev_caller(skip_last=True), floor=sig['crisis'])
        if await self.after_caller(sig) == 'replied':
            if gate is not None: await self.conv.settle_gate(gate)
            if not self.ended: await self.after_reply({'end': False})
            return list(self.outbox)
        if self.ended:
            if gate is not None: gate.cancel()
            return list(self.outbox)
        return list(self.outbox) + await self._reply(gate)

    async def hang_up(self):
        await self.end('caller_hung_up')

    async def member_says(self, text):
        """The member's words reach the simulated caller; they are not transcribed (v1), not doored, not judged."""
        if self.push and not self.ended and (text or '').strip(): await self.push({'t': 'member', 'text': str(text)[:2000]})
