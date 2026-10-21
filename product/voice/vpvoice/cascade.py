# The audio cascade: ears -> brain -> door -> voice, with the lab's own turn-taking (voicelab/server/calls.py
# CascadeCall), run on any Line (the browser socket or a phone media stream).
#
# Turn-taking, as measured in the lab:
#  - a reply starts as soon as the caller's speech has a final transcript, but its audio is HELD until released;
#  - if the caller starts talking again before release, the held reply is dropped and the turn merges;
#  - an utterance that sounds unfinished ("...and", "lekin") waits 1.4 s of silence before release;
#  - released but not yet audible and the caller keeps going: the reply is withdrawn;
#  - barge-in needs words, not a cough or a "hmm": 300 ms of speech and two words, or 700 ms;
#  - what goes into history after an interruption is what the caller actually heard, from the playback clock.
# Caller turns that carry a safety signal (crisis, digits, AI question, opt-out, human, recording) are never answered
# speculatively: they are committed first, so the door and the brain see them.
import asyncio, contextlib, logging, re, time
from . import brief, catalog, safety
from .audio import FRAME_BYTES, Recorder, Resampler, make_vad
from .conversation import ComponentError, Draft
from .session import Session

log = logging.getLogger('vp.voice.cascade')

CUES = set('और लेकिन तो कि क्योंकि मतलब जैसे या पर जो अगर फिर यानी वो aur lekin toh to ki kyunki kyonki matlab jaise ya par agar phir '
           'yaani and but so because like or the a an um uh hmm actually basically which that if then with'.split())
ACTION = ('crisis', 'readingSensitiveDigits', 'asksIfAi', 'optOut', 'wantsHuman', 'refusesRecording')


def incomplete(text):
    t = text.strip().rstrip('।.!?').strip()
    if not t: return False
    if text.strip().endswith((',', '...', '…', '-', '—')): return True
    return re.split(r'\s+', t)[-1].lower().strip(',') in CUES


class Line:
    """What a transport gives the session: audio and messages to the far end, and a way to cut playback."""
    closed = False
    async def send_audio(self, rid, pcm24): pass
    async def flush(self, rid): pass
    async def send_json(self, obj): pass
    async def close(self): pass


class Reply:
    """One agent reply: door-approved sentences -> voice -> audio. Audio is held until released and can be cancelled
    at any point (caller kept talking, or barged in)."""
    def __init__(self, s, rid, user_text, released=False, pending=False, fixed=None):
        self.s = s; self.rid = rid; self.draft = Draft(user_text, pending); self.fixed = fixed; self.released = released
        self.buf = []; self.cancelled = False; self.done = False; self.first = None; self.play_start = None
        self.spoken = []; self.error = None; self.latency_ms = None; self.committed = False
        self.task = asyncio.ensure_future(self.run())

    @property
    def user_text(self): return self.draft.user_text

    async def emit(self, pcm24, idx):
        if self.cancelled or not pcm24: return
        if not self.released: self.buf.append((pcm24, idx)); return
        if self.first is None:
            self.first = self.s.now(); self.latency_ms = self.s.reply_started()
            await self.s.line.send_json({'t': 'reply', 'rid': self.rid, 'latencyMs': self.latency_ms})
        st = await self.s.send_audio(self.rid, pcm24)
        if self.play_start is None: self.play_start = st
        while len(self.spoken) <= idx: self.spoken.append(['', 0])
        self.spoken[idx][1] += len(pcm24) // 2

    async def release(self):
        if self.released or self.cancelled: return
        self.released = True
        buf, self.buf = self.buf, []
        for b, i in buf: await self.emit(b, i)

    def cancel(self):
        if self.cancelled: return
        self.cancelled = True
        if not self.done and self.s.c.voice is not None: self.s.c.voice.reset()
        self.task.cancel()

    def heard_text(self):
        """What the caller actually heard, from the playback clock."""
        if self.play_start is None: return ''
        played = max(0.0, self.s.now() - self.play_start) * 24000; out = []
        for clause, n in self.spoken:
            if n == 0: continue
            if played >= n: out.append(clause); played -= n
            else:
                w = clause.split(); k = int(len(w) * played / max(n, 1)); out.append(' '.join(w[:k]) + '—'); break
        return ' '.join(x for x in out if x)

    async def run(self):
        q = asyncio.Queue(); tts = asyncio.ensure_future(self.tts_loop(q))
        try:
            if self.fixed is not None:
                for line in self.fixed: self.draft.sentences.append(line); self.draft.raw += line + ' '; await q.put(line)
            else:
                # aclosing: a withdrawn or barged-in reply still closes the brain stream, so its tokens are metered
                async with contextlib.aclosing(self.s.conv.sentences(self.draft)) as gen:
                    async for sent in gen: await q.put(sent)
        except asyncio.CancelledError:
            tts.cancel(); raise
        except ComponentError as e:
            self.error = e
        await q.put(None)
        try:
            await tts
        except asyncio.CancelledError:
            raise
        except ComponentError as e:
            self.error = self.error or e
        except Exception as e:
            self.error = self.error or ComponentError('voice', self.s.c.tts_id, repr(e)[:200])
        self.done = True

    async def _speak(self, text, idx):
        voice = self.s.c.voice; usage = {}; timing = {}
        while len(self.spoken) <= idx: self.spoken.append(['', 0])
        self.spoken[idx][0] = text
        try:
            async for ch in voice.speak(text, self.draft.style if voice.styled else None, usage, timing):
                await self.emit(ch, idx)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            raise ComponentError('voice', self.s.c.tts_id, str(e)[:200])
        finally:
            self.s.charge_voice(usage)

    async def tts_loop(self, q):
        voice = self.s.c.voice
        if voice.whole_reply:
            # first sentence alone (fast first sound), then the rest of the reply in one request so its prosody is
            # continuous; the second request goes out while the first still plays at the far end
            first = await q.get()
            if first is None: return
            await self._speak(first, 0)
            rest = []
            while True:
                x = await q.get()
                if x is None: break
                rest.append(x)
            if rest: await self._speak(' '.join(rest), 1)
        else:
            idx = 0
            while True:
                x = await q.get()
                if x is None: break
                await self._speak(x, idx); idx += 1


class CascadeSession(Session):
    LONG_HOLD_MS = 1400

    def __init__(self, ticket, components, sink, line, clock=time.monotonic, env=None, watchdog_s=0.25, transport='webrtc', tick_s=0.03):
        super().__init__(ticket, components, sink, clock=clock, env=env, watchdog_s=watchdog_s)
        self.transport = transport; self.line = line; self.tick_s = tick_s
        rec = (ticket['agent'].get('recording') or {}).get('enabled', False)
        self.rec = Recorder(clock, enabled=rec); self.vad = make_vad(); self.agent_rs = Resampler(24000, 16000)
        self.rid = 0; self.finals = []; self.partial = ''; self.pending = None; self.active = None; self.overlap = []
        self.seg = 0; self.final_seg = 0; self.eos_t = None; self.last_reply_eos = None; self.stt = None
        self.mic = b''; self.turn_start_ms = None; self.digits_seg = -1; self.end_task = None; self.barge_ins = 0
        self.silence_s = (ticket['agent'].get('limits') or {}).get('maxSilenceS') or 0

    def now(self): return self.clock()
    def agent_playing(self): return self.now() < self.rec.play_until

    # ---------------------------------------------------------------- lifecycle
    async def start(self):
        await super().start()
        lang = {'hinglish': 'hi-IN'}.get((self.t.get('contact') or {}).get('language') or '', None) or 'hi-IN'
        self.stt = self.c.make_ears(self._partial, self._final, self._ears_error, lang)
        try:
            await self.c.voice.warm()
            await self.stt.start()
        except Exception as e:
            await self.component_failed(ComponentError('ears', self.c.ears_id, repr(e)[:200])); return
        self.tasks.append(asyncio.ensure_future(self._tick_loop()))
        self.rid += 1; self.active = Reply(self, self.rid, None, released=True)
        asyncio.ensure_future(self._after(self.active))

    async def close_media(self):
        for r in (self.pending, self.active):
            if r is not None: r.cancel()
        if self.stt is not None:
            try: await self.stt.close()
            except Exception: pass
        if self.c.voice is not None:
            try: await self.c.voice.close()
            except Exception: pass
        self.save_recording()
        try: await self.line.send_json({'t': 'ended', 'endReason': self.ended})
        except Exception: pass
        await self.line.close()

    def save_recording(self):
        import os
        d = self.env.get('VP_RECORDINGS_DIR')
        if not d or not self.rec.enabled or self.conv.state['recording_refused']: return
        try:
            os.makedirs(d, exist_ok=True); path = os.path.join(d, f'{self.id}.wav'); self.rec.write(path)
            self.recording_uri = 'file://' + path
        except Exception:
            log.exception('recording')

    def stop_recording(self): self.rec.stop()

    # ---------------------------------------------------------------- metering
    def meter_running(self):
        super().meter_running()
        if self.stt is not None:
            a = self.stt.audio_s
            self.meter.set_total('ears', catalog.STT[self.c.ears_id]['kind'], 'second', round(a, 3), catalog.ears_usd(self.c.ears_id, a) * catalog.FX,
                                 {'gated': self.c.gated})

    def charge_voice(self, usage):
        if not usage: return
        unit = catalog.voice_unit(self.c.tts_id)
        qty = usage.get('chars', 0) if unit == 'char' else usage.get('audio_s', 0.0)
        usd = catalog.voice_usd(self.c.tts_id, chars=usage.get('chars', 0), audio_s=usage.get('audio_s', 0.0))
        self.meter.add('voice', catalog.TTS[self.c.tts_id]['kind'], unit, qty, usd=usd, detail={'voice': self.c.voice_name})

    # ---------------------------------------------------------------- the far end
    async def send_audio(self, rid, pcm24):
        start = self.rec.add_agent(self.agent_rs(pcm24), self.now())
        await self.line.send_audio(rid, pcm24)
        return start

    def reply_started(self):
        """Latency of the reply now audible: from the caller's last end of speech it answers (None for the opening)."""
        t = self.now(); eos = self.eos_t if (self.eos_t and self.eos_t != self.last_reply_eos) else None
        self.last_reply_eos = self.eos_t
        return int((t - eos) * 1000) if eos else None

    async def on_mic(self, pcm16k):
        if self.ended: return
        self.rec.add_caller(pcm16k)
        self.mic += pcm16k
        while len(self.mic) >= FRAME_BYTES:
            fr, self.mic = self.mic[:FRAME_BYTES], self.mic[FRAME_BYTES:]
            self.vad.strict = self.agent_playing()
            for ev, idx in self.vad.feed(fr):
                if ev == 'start':
                    self.seg += 1
                    if self.turn_start_ms is None: self.turn_start_ms = int(idx / 16)
                    if self.pending is not None and not self.pending.released:
                        self.pending.cancel(); self.pending = None          # caller kept talking: drop the held reply
                    await self.line.send_json({'t': 'vad', 's': 'start'})
                else:
                    self.eos_t = self.now() - (self.vad.n - idx) / 16000.0
                    if self.stt: self.stt.end_of_speech()
            if self.stt: self.stt.write(fr, self.vad.speaking)

    # ---------------------------------------------------------------- ears callbacks
    def _partial(self, t):
        self.partial = t
        asyncio.ensure_future(self.line.send_json({'t': 'cap', 'who': 'caller', 'text': ' '.join(self.finals + [t]), 'final': False}))
        if self.digits_seg != self.seg and safety.caller_signals(' '.join(self.finals + [t]))['readingSensitiveDigits']:
            self.digits_seg = self.seg                                  # stop them kindly, mid-number
            asyncio.ensure_future(self._stop_digits())

    def _final(self, t):
        self.final_seg = self.seg; self.partial = ''
        if self.active is not None and self.agent_playing():
            self.overlap.append(t); return           # heard while she talks: a backchannel unless they keep going
        self.finals.append(t)
        asyncio.ensure_future(self.line.send_json({'t': 'cap', 'who': 'caller', 'text': ' '.join(self.finals), 'final': True}))

    def _ears_error(self, e):
        if not self.ended:
            asyncio.ensure_future(self.component_failed(ComponentError('ears', self.c.ears_id, str(e)[:200])))

    async def _stop_digits(self):
        if self.active is not None: await self.interrupt()
        await self.speak_canned(safety.stop_digits_line((self.t['agent'].get('brand') or {}).get("spokenName", "")), wait=False)

    # ---------------------------------------------------------------- replies
    async def interrupt(self):
        r = self.active
        if r is None: return
        heard = r.heard_text(); r.cancel(); self.barge_ins += 1
        self.rec.flush(self.now()); await self.line.flush(r.rid)
        if not r.committed:
            r.committed = True
            self.conv.commit_agent(r.draft, heard=heard, start_ms=self._ms(r.play_start), interrupted=True, latency_ms=r.latency_ms)
        self.finals = self.overlap + self.finals; self.overlap = []
        self.active = None
        await self.line.send_json({'t': 'state', 's': 'listening'})

    def _ms(self, t): return int((t - self.t0) * 1000) if t else None

    async def _after(self, r):
        try:
            await r.task
        except asyncio.CancelledError:
            return
        except Exception as e:
            r.error = ComponentError('reply', '', repr(e)[:200])
        if r.cancelled: return
        if r.error and r.play_start is None:
            await self.component_failed(r.error); return
        while self.agent_playing() and not r.cancelled and not self.ended: await asyncio.sleep(0.03)
        if r.cancelled or r.committed: return
        r.committed = True
        marks = self.conv.commit_agent(r.draft, heard=' '.join(s[0] for s in r.spoken if s[0] and s[1]) or None,
                                       start_ms=self._ms(r.play_start), latency_ms=r.latency_ms)
        await self.line.send_json({'t': 'cap', 'who': 'agent', 'text': r.draft.text, 'final': True, 'rid': r.rid})
        if r.error:
            await self.component_failed(r.error); return
        if r.fixed is None: await self.after_reply(marks)

    async def speak_canned(self, text, wait=True):
        if self.ended: return
        if self.active is not None and not self.active.committed: await self.interrupt()
        self.rid += 1; r = Reply(self, self.rid, None, released=True, fixed=[text]); self.active = r
        done = asyncio.ensure_future(self._after(r)); self.tasks.append(done)
        if wait:
            try: await asyncio.wait_for(asyncio.shield(done), 20)
            except asyncio.TimeoutError: pass

    async def finish(self, reason, cancellable=False):
        """She ends: let her last line finish playing, then a beat; if the caller starts talking in that beat they had
        more to say, so the call stays up (cancellable endings only)."""
        if self.ended or self.ending: return
        self.ending = True
        try:
            lim = self.now() + 30
            while self.agent_playing() and self.now() < lim: await asyncio.sleep(0.03)
            beat = self.now() + 1.5
            while self.now() < beat:
                if cancellable and self.vad.speaking: return
                await asyncio.sleep(0.03)
            await self.end(reason)
        finally:
            self.ending = False

    # ---------------------------------------------------------------- the tick (port of CascadeCall._tick)
    async def _tick_loop(self):
        while not self.ended:
            await asyncio.sleep(self.tick_s)
            try: await self._tick()
            except Exception: log.exception('tick')

    async def _tick(self):
        v = self.vad; a = self.active
        if a is not None:
            if a.cancelled or (a.done and a.committed and not self.agent_playing()):
                # heard during her turn without a barge-in: a backchannel ("haan", "hmm"), unless it carries a signal
                keep = [t for t in self.overlap if any(safety.caller_signals(t)[k] for k in ACTION)]
                self.finals = keep + self.finals; self.overlap = []; self.active = a = None
                await self.line.send_json({'t': 'state', 's': 'listening'})
            elif v.speaking and a.fixed is None:
                words = len((' '.join(self.overlap) + ' ' + self.partial).split())
                if a.first is None and v.speech_ms() >= 250 and a.user_text is not None:
                    a.cancel(); self.active = a = None                   # withdraw: not audible yet, caller still going
                    self.finals = [self._uncommit_last_caller()] + self.finals
                elif self.agent_playing() and v.speech_ms() >= 300 and (words >= 2 or v.speech_ms() >= 700):
                    await self.interrupt(); a = None                     # barge-in: words, not a cough
        if self.ending or self.ended: return
        text = ' '.join(self.finals).strip()
        caught_up = self.final_seg >= self.seg or v.silence_ms() >= 1200
        if self.pending is None and a is None and not v.speaking and not self.agent_playing() and caught_up:
            use = text or (self.partial.strip() if self.partial and v.silence_ms() >= 1000 else '')
            if use:
                sig = safety.caller_signals(use)
                if any(sig[k] for k in ACTION) or safety.redact(use) != use:      # never speculate on raw secrets
                    await self._commit_turn(use)
                    if self.digits_seg == self.seg and sig['readingSensitiveDigits'] and not any(sig[k] for k in ACTION if k != 'readingSensitiveDigits'):
                        return                                            # already stopped them mid-number
                    if await self.after_caller(sig) == 'replied' or self.ended: return
                    self.rid += 1; self.active = Reply(self, self.rid, None, released=True)
                    asyncio.ensure_future(self._after(self.active))
                    return
                self.rid += 1; self.pending = Reply(self, self.rid, use, pending=True)
                await self.line.send_json({'t': 'state', 's': 'thinking'})
        if self.pending is not None and not self.pending.released:
            hold = self.LONG_HOLD_MS if incomplete(self.pending.user_text) else 0
            if not v.speaking and v.silence_ms() >= hold:
                r = self.pending; self.pending = None
                await self._commit_turn(r.user_text)
                r.draft.pending = False
                self.active = r; await r.release(); await self.line.send_json({'t': 'state', 's': 'speaking'})
                asyncio.ensure_future(self._after(r))
        quiet_since = max(self.eos_t or self.t0, self.rec.play_until)
        if self.silence_s and a is None and self.pending is None and not v.speaking and not self.agent_playing() \
                and self.now() - quiet_since >= self.silence_s and not self.conv.state['crisis']:
            await self.speak_canned('लगता है आवाज़ नहीं आ रही, मैं बाद में बात करती हूँ। शुक्रिया।'.replace('करती', safety.g(self.conv.gender, 'करती', 'करता')))
            await self.finish('silence_timeout')

    async def _commit_turn(self, text):
        end_ms = self._ms(self.eos_t) if self.eos_t else None
        self.conv.commit_caller(text, start_ms=self.turn_start_ms, end_ms=end_ms)
        self.finals = []; self.partial = ''; self.turn_start_ms = None

    def _uncommit_last_caller(self):
        """A withdrawn reply's caller turn merges with what they are still saying; the turn event already sent stands
        (the control plane sees both parts as consecutive caller turns)."""
        tr = self.conv.transcript
        if tr and tr[-1]['speaker'] == 'caller':
            self.conv.history.pop(); return tr.pop()['text']
        return ''
