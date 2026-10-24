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
import numpy as np
from . import announce, brief, catalog, recordings, safety
from .audio import FRAME_BYTES, Recorder, Resampler, make_vad
from .conversation import ComponentError, Draft
from .session import Session

log = logging.getLogger('vp.voice.cascade')

CUES = set('और लेकिन तो कि क्योंकि मतलब जैसे या पर जो अगर फिर यानी वो aur lekin toh to ki kyunki kyonki matlab jaise ya par agar phir '
           'yaani and but so because like or the a an um uh hmm actually basically which that if then with'.split())
MIX_MAX = 16000 * 2 * 10          # listener mix: at most 10 s of her (or the member's) audio ahead of the caller's clock
MEMBER_RID = 0                    # reply id 0 on the line: the member who took over (her replies count from 1)
CUT_WITHIN_S = 0.3                # a takeover waits for her sentence end only if it is this near
ACTION = ('crisis', 'readingSensitiveDigits', 'asksIfAi', 'optOut', 'wantsHuman', 'refusesRecording')


# Words a listener says to keep the speaker going. While she talks they never count toward a barge-in's BARGE_WORDS
# (CascadeSession.BARGE_NOD): "haan ji" is a nod, "haan ji ek minute" is a turn.
NODS = {'haan', 'haa', 'han', 'ha', 'hmm', 'hm', 'hmmm', 'mm', 'mhm', 'ji', 'jee', 'achha', 'acha', 'accha', 'achcha', 'ok', 'okay',
        'theek', 'thik', 'hai', 'sahi', 'right', 'yes', 'yeah', 'haanji', 'अच्छा', 'हाँ', 'हां', 'हा', 'जी', 'ठीक', 'है', 'हम्म', 'ओके', 'सही'}


def turn_words(text):
    """The words in what the caller says over her that are not nods."""
    return [w for w in re.sub(r'[.,?!।;:—–\-"\'…()]', ' ', (text or '').lower()).split() if w not in NODS]


def same_words(a, b):
    """The recogniser's final says what the partial said: the same words, ignoring case and punctuation."""
    w = lambda s: re.sub(r'[.,?!।;:—–\-"\'…()]', ' ', (s or '').lower()).split()
    return w(a) == w(b)


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
    def __init__(self, s, rid, user_text, released=False, pending=False, fixed=None, gate=None):
        self.s = s; self.rid = rid; self.draft = Draft(user_text, pending); self.fixed = fixed; self.released = released
        self.draft.gate = gate
        if s.first_clause and user_text is not None: self.draft.first_clause_at = s.FIRST_CLAUSE_AT   # never the opening (RD1)
        self.buf = []; self.cancelled = False; self.done = False; self.first = None; self.play_start = None
        self.spoken = []; self.error = None; self.latency_ms = None; self.committed = False
        # playback position (BARGE_AUDIO pauses and resumes her): all audio sent, and the run now playing at the far end
        self.pcm = bytearray(); self.run_from = 0; self.run_start = None; self.paused = False; self.held = []
        self.pause_seg = None; self.resumed_seg = None
        self.speculative = False          # started on the caller's partial words, awaiting the final (SPECULATE_PARTIAL)
        self.from_partial = False         # ... and stays True once the final confirmed it (the timing row's 'speculative')
        now = s.now(); self.draft.t.update({'created': now, 'eos': s.eos_t, 'final': s.last_final_t if s.final_seg >= s.seg else None})
        if released: self.draft.t['release'] = now
        self.task = asyncio.ensure_future(self.run())

    @property
    def user_text(self): return self.draft.user_text

    async def emit(self, pcm24, idx):
        if self.cancelled or not pcm24: return
        if not self.released: self.buf.append((pcm24, idx)); return
        if self.paused: self.held.append((pcm24, idx)); return          # she yielded: keep it for when she resumes
        if self.first is None:
            self.first = self.s.now(); self.latency_ms = self.s.reply_started(); self.draft.t['audio'] = self.first
            self.s.record_timing(self)
            await self.s.line.send_json({'t': 'reply', 'rid': self.rid, 'latencyMs': self.latency_ms})
        st = await self.s.send_audio(self.rid, pcm24)
        if self.play_start is None: self.play_start = st
        if self.run_start is None: self.run_start = st
        self.pcm += pcm24
        while len(self.spoken) <= idx: self.spoken.append(['', 0])
        self.spoken[idx][1] += len(pcm24) // 2

    def played(self):
        """Samples of this reply the caller has heard, from the playback clock (across pauses)."""
        if self.run_start is None: return self.run_from // 2
        if self.paused: return self.run_from // 2
        return min(len(self.pcm), self.run_from + int(max(0.0, self.s.now() - self.run_start) * 24000) * 2) // 2

    async def pause(self):
        """Yield to the caller now: the far end drops what it has queued; her place is kept."""
        if self.paused or self.cancelled: return
        pos = self.played() * 2; self.paused = True; self.run_from = pos; self.run_start = None
        self.s.rec.flush(self.s.now()); self.s.mix.clear(); await self.s.line.flush(self.rid)

    async def resume(self):
        """Carry on from where she yielded: what the caller did not hear, then what the voice made meanwhile."""
        if not self.paused or self.cancelled: return
        self.paused = False
        tail = bytes(self.pcm[self.run_from:])
        for k in range(0, len(tail), 1920):
            st = await self.s.send_audio(self.rid, tail[k:k + 1920])
            if self.run_start is None: self.run_start = st
        held, self.held = self.held, []
        for b, i in held: await self.emit(b, i)

    async def release(self):
        if self.released or self.cancelled: return
        self.released = True; self.draft.t['release'] = self.s.now()
        buf, self.buf = self.buf, []
        for b, i in buf: await self.emit(b, i)

    def cancel(self):
        if self.cancelled: return
        self.cancelled = True
        if self.draft.gate is not None: self.draft.gate.cancel()      # a withdrawn turn's judge verdict is not needed
        if not self.done and self.s.c.voice is not None: self.s.c.voice.reset()
        self.task.cancel()

    def heard_text(self):
        """What the caller actually heard, from the playback clock."""
        if self.play_start is None: return ''
        played = self.played(); out = []
        for clause, n in self.spoken:
            if n == 0: continue
            if played >= n: out.append(clause); played -= n
            else:
                w = clause.split(); k = int(len(w) * played / max(n, 1))
                if k: out.append(' '.join(w[:k]) + '—')         # cut at a clause boundary: nothing of the next was heard
                break
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
        self.draft.t.setdefault('tts_req', self.s.now())
        try:
            async for ch in voice.speak(text, self.draft.style if voice.styled else None, usage, timing):
                self.draft.t.setdefault('tts_first', self.s.now())
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
    # Turn-taking thresholds (bench/turn_bench.py measures them): a held reply waits HOLD_MS of silence after a turn that
    # ends in a question (it hands the turn to her), STATEMENT_HOLD_MS after a statement, LONG_HOLD_MS after one that
    # reads unfinished; she yields to the caller after BARGE_MS of speech with at least BARGE_WORDS words, or after
    # BARGE_LONG_MS of speech whatever the words.
    # Latency (each behind a flag; VP_SPECULATE_PARTIAL / VP_FIRST_CLAUSE / VP_PREWARM = '0' or '1' in the env override
    # the default). SPECULATE_PARTIAL and PREWARM default on only where the provider is not paced (VP_PACED_PROVIDERS,
    # default vertex: the extra requests queue ahead of the real one). SPECULATE_PARTIAL starts the reply on the
    # caller's settled partial words (partial_settled) at their end of speech, and keeps it only if the recogniser's
    # final says the same words; FIRST_CLAUSE voices the first clause (at a comma, 24+ characters)
    # before the sentence ends; PREWARM opens the brain's and voice's connections when the caller starts speaking.
    # SPECULATE_PARTIAL is off by default on every provider: on the turn bench DEV split with partials that trail
    # speech (300 or 850 ms), it saved nothing at end of turn (986 vs 991 ms; 1,324-1,328 vs 1,328 ms) and kept 5-16% of
    # its replies whatever SPECULATE_STABLE_MS (bench/results/turn-2026-10-24-dev-speculation.md); staging kept 2 of ~23.
    # Turn it on (VP_SPECULATE_PARTIAL=1) only for a recogniser whose partials keep up with speech.
    SPECULATE_PARTIAL = False
    SPECULATE_STABLE_MS = 400         # see partial_settled; chosen on the bench DEV split
    FIRST_CLAUSE = False
    FIRST_CLAUSE_AT = 24
    PREWARM = True
    BARGE_NOD = True                  # VP_BARGE_NOD=0: count every word toward BARGE_WORDS, nods included (NODS)
    BARGE_NOD_LONG_MS = 1500          # with BARGE_NOD: speech heard only as nods stops her only after this long
    # BARGE_AUDIO (VP_BARGE_AUDIO): she yields on BARGE_AUDIO_MS of caller speech, from the audio alone (the recogniser's
    # words trail speech by ~0.86 s on staging), and keeps her place. Once the caller is quiet for RESUME_MS she resumes
    # if all that was heard is a nod (or nothing: a cough, a noise); any other word, or BARGE_PAUSED_MS of speech with
    # no words yet, and she gives way for good. Words that arrive after she resumed, and are not a nod, stop her then.
    BARGE_AUDIO = True
    # LISTEN_FIRST (VP_LISTEN_FIRST; default on for outbound phone calls only): her opening waits for the first words,
    # so an operator announcement or a machine (announce.py) ends the call before she speaks. A short reply opens at
    # once; nobody speaking for LISTEN_FIRST_S, and she opens anyway; a long run of words that matches nothing opens
    # after LISTEN_MAX_S. (People in India answer with "hello" first; she answers that.)
    LISTEN_FIRST = True
    LISTEN_FIRST_S = 2.5
    LISTEN_MAX_S = 8.0
    BARGE_AUDIO_MS = 200
    RESUME_MS = 400
    BARGE_PAUSED_MS = 900
    HOLD_MS = 0
    STATEMENT_HOLD_MS = 1200          # chosen on the bench DEV split (bench/results/turn-2026-10-23-*), reported on TEST
    LONG_HOLD_MS = 1400
    BARGE_MS = 300
    BARGE_WORDS = 2
    BARGE_LONG_MS = 700

    def __init__(self, ticket, components, sink, line, clock=time.monotonic, env=None, watchdog_s=0.25, transport='webrtc', tick_s=0.03):
        super().__init__(ticket, components, sink, clock=clock, env=env, watchdog_s=watchdog_s)
        self.transport = transport; self.line = line; self.tick_s = tick_s
        rec = (ticket['agent'].get('recording') or {}).get('enabled', False)
        self.rec = Recorder(clock, enabled=rec); self.vad = make_vad(); self.agent_rs = Resampler(24000, 16000)
        self.rid = 0; self.finals = []; self.partial = ''; self.pending = None; self.active = None; self.overlap = []
        self.seg = 0; self.final_seg = 0; self.eos_t = None; self.last_reply_eos = None; self.stt = None
        self.last_final_t = None; self.timing = []        # latency breakdown per reply (timing_summary)
        self.seg_t0 = None; self.lag_seg = 0; self.partial_lags = []   # speech onset -> the recogniser's first partial
        for k in ('BARGE_LONG_MS', 'SPECULATE_STABLE_MS', 'BARGE_AUDIO_MS', 'RESUME_MS', 'BARGE_PAUSED_MS'):        # staging trials: VP_BARGE_LONG_MS, VP_SPECULATE_STABLE_MS
            try: setattr(self, k, int(self.env.get('VP_' + k) or getattr(self, k)))
            except ValueError: pass
        self.mic = b''; self.turn_start_ms = None; self.digits_seg = -1; self.end_task = None; self.barge_ins = 0
        self.silence_s = (ticket['agent'].get('limits') or {}).get('maxSilenceS') or 0
        flag = lambda name, d: (self.env.get(name) == '1') if self.env.get(name) in ('0', '1') else d
        # provider-aware defaults: speculation and warm requests only where the provider is not paced (warm.paced_providers)
        from .providers.warm import paced_providers, route_of
        paced = paced_providers(self.env)
        self.brain_paced = route_of('brain', components.brain_id) in paced
        self.voice_paced = route_of('voice', components.tts_id) in paced if components.tts_id else False
        self.speculate = flag('VP_SPECULATE_PARTIAL', self.SPECULATE_PARTIAL and not self.brain_paced)
        self.first_clause = flag('VP_FIRST_CLAUSE', self.FIRST_CLAUSE)
        self.prewarm_brain = flag('VP_PREWARM', self.PREWARM and not self.brain_paced)
        self.prewarm_voice = flag('VP_PREWARM', self.PREWARM and not self.voice_paced)
        self.prewarm = self.prewarm_brain or self.prewarm_voice; self.warmed_seg = -1
        self.spec = {'started': 0, 'kept': 0, 'discarded': 0, 'withdrawn': 0}           # speculation outcomes (timing_summary)
        self.partial_t = None                                           # when the partial's words last changed
        self.barge_nod = flag('VP_BARGE_NOD', self.BARGE_NOD)
        self.barge_audio = flag('VP_BARGE_AUDIO', self.BARGE_AUDIO); self.pauses = 0; self.resumes = 0
        outbound_phone = (ticket.get('transport') or {}).get('kind') == 'sip' and ticket.get('direction') == 'outbound'
        self.listening_first = flag('VP_LISTEN_FIRST', self.LISTEN_FIRST and outbound_phone); self.listen_t0 = None
        self.mix = bytearray(); self.member_rs = Resampler(16000, 24000)     # live controls: listener mix, member's voice

    def now(self): return self.clock()

    # ---------------------------------------------------------------- latency breakdown
    STAGES = (('ears', 'eos', 'final'), ('turn', 'final', 'brain_req'), ('brain', 'brain_req', 'brain_first'),
              ('sentence', 'brain_first', 'sentence'), ('voice', 'tts_req', 'tts_first'), ('hold', 'tts_first', 'release'),
              ('out', 'release', 'audio'))

    def record_timing(self, r):
        """One reply's gap, split into stages, in ms. Marks are relative to the caller's end of speech (the VAD's); a
        stage is the time between two marks (negative when work started early, e.g. a speculative brain request)."""
        t = r.draft.t; eos = t.get('eos')
        if eos is None or r.latency_ms is None: return          # her opening, or a reply that answers no new speech
        ms = lambda a, b: None if t.get(a) is None or t.get(b) is None else int(round((t[b] - t[a]) * 1000))
        at = {k: ms('eos', k) for k in ('final', 'brain_req', 'brain_first', 'sentence', 'tts_req', 'tts_first', 'release', 'audio')}
        row = {'rid': r.rid, 'gapMs': r.latency_ms, 'speculative': r.from_partial, 'at': at,
               'stages': {name: ms(a, b) for name, a, b in self.STAGES}}
        self.timing.append(row)
        log.info('reply timing %s rid=%s gap=%s %s', self.id, r.rid, r.latency_ms, ' '.join(f'{k}={v}' for k, v in row['stages'].items()))

    def timing_summary(self):
        """Medians over this call's replies: where the time goes (GET /v1/calls/{id})."""
        import statistics
        med = lambda xs: int(statistics.median(xs)) if xs else None
        rows = self.timing
        # partialLagMs: how long after speech starts the first words arrive. Barge-in by words cannot beat it, and
        # BARGE_LONG_MS below it stops her on nods (bench: 500 ms is safe at a 300 ms lag, not at 500)
        return {'replies': rows, 'n': len(rows), 'gapMs': med([r['gapMs'] for r in rows]),
                'speculation': dict(self.spec, enabled=self.speculate,
                                    keepRate=round(self.spec['kept'] / (self.spec['kept'] + self.spec['discarded']), 3) if self.spec['kept'] + self.spec['discarded'] else None),
                'prewarm': {'brain': self.prewarm_brain, 'voice': self.prewarm_voice},
                'barge': {'pauses': self.pauses, 'resumes': self.resumes, 'stops': self.barge_ins},
                'partialLagMs': med(self.partial_lags), 'partialLagN': len(self.partial_lags), 'bargeLongMs': self.BARGE_LONG_MS,
                'stagesMs': {name: med([r['stages'][name] for r in rows if r['stages'][name] is not None]) for name, _, _ in self.STAGES}}

    def partial_settled(self):
        """Speculate only on a partial that has stopped changing for SPECULATE_STABLE_MS or ends at a clause boundary:
        recognisers trail speech (staging partialLagMs median 858 ms), so a partial still moving at end of speech is
        missing words and its final differs (staging: kept 2 of ~23)."""
        if re.search(r'[.?!।,]\s*$', self.partial): return True
        return self.partial_t is not None and (self.now() - self.partial_t) * 1000 >= self.SPECULATE_STABLE_MS

    def judge_raises(self):
        """The crisis judge gates replies in 'raise' mode: then a reply never starts before the final it must judge."""
        from . import judge
        return self.conv.judge_complete is not None and judge.mode(env=self.conv.judge_env) == 'raise' and judge.configured(self.conv.judge_env)

    def hold_ms(self, text):
        """How long a held reply waits in silence before she speaks, by how the caller's words end."""
        if incomplete(text): return self.LONG_HOLD_MS
        return self.HOLD_MS if text.strip().endswith('?') else self.STATEMENT_HOLD_MS
    def agent_playing(self): return self.now() < self.rec.play_until

    # ---------------------------------------------------------------- lifecycle
    async def start(self):
        await super().start()
        lang = {'hinglish': 'hi-IN'}.get((self.t.get('contact') or {}).get('language') or '', None) or 'hi-IN'
        self.stt = self.c.make_ears(self._partial, self._final, self._ears_error, lang)
        try:
            if self.prewarm_voice: await self.c.voice.warm()       # obeys VP_PREWARM (staging: ~1 s on a paced Vertex)
            await self.stt.start()
        except Exception as e:
            await self.component_failed(ComponentError('ears', self.c.ears_id, repr(e)[:200])); return
        self.tasks.append(asyncio.ensure_future(self._tick_loop()))
        if self.listening_first: self.listen_t0 = self.now(); return       # her opening waits for the first words
        self.open_call()

    def open_call(self):
        self.rid += 1; self.active = Reply(self, self.rid, None, released=True)
        asyncio.ensure_future(self._after(self.active))

    async def _listen_first(self):
        """Before her opening on an outbound phone call: an operator announcement or a machine ends the call here, with
        no opening and no caller turn (announce.py); a person's hello, or quiet, opens it."""
        v = self.vad; text = ' '.join(self.finals + [self.partial]).strip(); waited = self.now() - self.listen_t0
        cls = announce.classify(text)
        if cls:
            self.listening_first = False; self.finals = []; self.partial = ''
            log.info('call %s: %s announcement before the opening; ending', self.id, cls)
            await self.end(cls); return
        settled = bool(text) and not v.speaking and (self.final_seg >= self.seg or v.silence_ms() >= 1200)
        person = settled and (announce.sounds_human(text) or len(text.split()) <= 6)   # a recording runs long, says more
        quiet = not text and not v.speaking and waited >= self.LISTEN_FIRST_S          # nobody spoke: she says hello first
        if not (person or quiet or (waited >= self.LISTEN_MAX_S and not v.speaking)): return
        self.listening_first = False
        if text: await self._commit_turn(text)                       # their "hello" is the first caller turn
        self.open_call()

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
        d = self.env.get('VP_RECORDINGS_DIR')
        if not d or not self.rec.enabled or self.conv.state['recording_refused']: return
        try:
            self.recording_uri = recordings.save(d, self.id, self.t.get('workspaceId', ''), self.rec.write)   # served signed: recordings.py
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
        pcm16 = self.agent_rs(pcm24)
        start = self.rec.add_agent(pcm16, self.now())
        if self.listeners: self._to_mix(pcm16)
        await self.line.send_audio(rid, pcm24)
        return start

    # ---------------------------------------------------------------- live controls: listen and takeover
    def _to_mix(self, pcm16):
        self.mix += pcm16
        if len(self.mix) > MIX_MAX: del self.mix[:len(self.mix) - MIX_MAX]

    def _listen(self, caller16):
        """Both legs, mixed on the caller's 20 ms clock, to every listener. Nothing here is recorded or stored."""
        n = len(caller16) // 2 * 2; other = bytes(self.mix[:n]); del self.mix[:n]
        x = np.frombuffer(caller16[:n], dtype='<i2').astype(np.int32)
        if other: x[:len(other) // 2] += np.frombuffer(other, dtype='<i2')
        out = np.clip(x, -32768, 32767).astype('<i2').tobytes()
        for send in list(self.listeners): asyncio.ensure_future(send(out))

    async def member_audio(self, pcm16k):
        """The member's mic, after a takeover, to the caller's line (not transcribed, not doored, not judged: v1)."""
        if self.ended or not self.taken_over or not pcm16k: return
        if self.listeners: self._to_mix(pcm16k)
        await self.line.send_audio(MEMBER_RID, self.member_rs(pcm16k))

    async def cut_for_takeover(self):
        """Stop her now: a held reply is dropped; one playing is cut at the end of its sentence if that is within 300 ms,
        else at once (mid-word only when no sentence end is near)."""
        if self.pending is not None: self.pending.cancel(); self.pending = None
        a = self.active
        if a is not None and not a.committed and a.play_start is not None:
            played = a.played(); total = 0
            for _, n in a.spoken:
                total += n
                if total >= played:
                    wait = (total - played) / 24000
                    if wait <= CUT_WITHIN_S: await asyncio.sleep(wait)
                    break
        if self.active is not None and not self.active.committed: await self.interrupt()
        elif self.active is not None: self.active.cancel(); self.active = None

    async def _prewarm(self):
        """PREWARM: the caller has started a turn; open the connections her reply will need (never raises)."""
        for part in (self.c.brain if self.prewarm_brain else None, self.c.voice if self.prewarm_voice else None):
            w = getattr(part, 'warm', None)
            if w is None: continue
            try: await asyncio.wait_for(w(), 5)
            except Exception: pass

    def reply_started(self):
        """Latency of the reply now audible: from the caller's last end of speech it answers (None for the opening)."""
        t = self.now(); eos = self.eos_t if (self.eos_t and self.eos_t != self.last_reply_eos) else None
        self.last_reply_eos = self.eos_t
        return int((t - eos) * 1000) if eos else None

    async def on_mic(self, pcm16k):
        if self.ended: return
        self.rec.add_caller(pcm16k)
        if self.listeners: self._listen(pcm16k)
        if self.member: asyncio.ensure_future(self.member(pcm16k))       # the caller's voice to the member who took over
        self.mic += pcm16k
        while len(self.mic) >= FRAME_BYTES:
            fr, self.mic = self.mic[:FRAME_BYTES], self.mic[FRAME_BYTES:]
            self.vad.strict = self.agent_playing()
            for ev, idx in self.vad.feed(fr):
                if ev == 'start':
                    self.seg += 1; self.seg_t0 = self.now() - (self.vad.n - idx) / 16000.0
                    if self.prewarm and self.warmed_seg != self.seg: self.warmed_seg = self.seg; asyncio.ensure_future(self._prewarm())
                    if self.turn_start_ms is None: self.turn_start_ms = int(idx / 16)
                    if self.pending is not None and not self.pending.released:
                        if self.pending.speculative: self.spec['withdrawn'] += 1
                        self.pending.cancel(); self.pending = None          # caller kept talking: drop the held reply
                    await self.line.send_json({'t': 'vad', 's': 'start'})
                else:
                    self.eos_t = self.now() - (self.vad.n - idx) / 16000.0
                    if self.stt: self.stt.end_of_speech()
            if self.stt: self.stt.write(fr, self.vad.speaking)

    # ---------------------------------------------------------------- ears callbacks
    def _partial(self, t):
        if not same_words(t, self.partial): self.partial_t = self.now()
        self.partial = t
        if self.lag_seg != self.seg and self.seg_t0 is not None:
            self.lag_seg = self.seg; self.partial_lags.append(int(round((self.now() - self.seg_t0) * 1000)))
        asyncio.ensure_future(self.line.send_json({'t': 'cap', 'who': 'caller', 'text': ' '.join(self.finals + [t]), 'final': False}))
        if self.taken_over: return                                      # she no longer speaks; redaction still applies on commit
        if self.digits_seg != self.seg and safety.caller_signals(' '.join(self.finals + [t]))['readingSensitiveDigits']:
            self.digits_seg = self.seg                                  # stop them kindly, mid-number
            asyncio.ensure_future(self._stop_digits())

    def _final(self, t):
        self.final_seg = self.seg; self.partial = ''; self.last_final_t = self.now()
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
        self.rec.flush(self.now()); self.mix.clear(); await self.line.flush(r.rid)
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
        while (self.agent_playing() or r.paused) and not r.cancelled and not self.ended: await asyncio.sleep(0.03)
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
        if self.listening_first: await self._listen_first(); return
        v = self.vad; a = self.active
        if self.taken_over:            # a person holds the call: record the caller's turns, never answer them
            if a is not None and (a.cancelled or (a.done and a.committed and not self.agent_playing())):
                self.finals = self.overlap + self.finals; self.overlap = []; self.active = None
            text = ' '.join(self.finals).strip()
            if text and not v.speaking and (self.final_seg >= self.seg or v.silence_ms() >= 1200): await self._commit_turn(text)
            return
        if a is not None:
            if a.cancelled or (a.done and a.committed and not self.agent_playing()):
                # heard during her turn without a barge-in: a backchannel ("haan", "hmm"), unless it carries a signal
                keep = [t for t in self.overlap if any(safety.caller_signals(t)[k] for k in ACTION)]
                self.finals = keep + self.finals; self.overlap = []; self.active = a = None
                await self.line.send_json({'t': 'state', 's': 'listening'})
            elif a.paused:
                # she yielded to caller speech (BARGE_AUDIO): resume after a nod or a noise, give way to anything else
                said = ' '.join(self.overlap) + ' ' + self.partial; real = turn_words(said)
                nodding = bool(said.split()) and not real
                if v.speaking:
                    if real or v.speech_ms() >= (self.BARGE_NOD_LONG_MS if nodding else self.BARGE_PAUSED_MS):
                        await self.interrupt(); a = None
                elif v.silence_ms() >= self.RESUME_MS:
                    if real: await self.interrupt(); a = None
                    else:
                        a.resumed_seg = self.seg; self.resumes += 1; await a.resume()
            elif a.resumed_seg is not None and self.agent_playing() and turn_words(' '.join(self.overlap) + ' ' + self.partial):
                await self.interrupt(); a = None                         # the words came late, and they were not a nod
            elif v.speaking and a.fixed is None:
                said = ' '.join(self.overlap) + ' ' + self.partial
                words = len(turn_words(said) if self.barge_nod else said.split())
                nodding = self.barge_nod and said.split() and not words     # all she has heard is "haan ji": keep going
                long_ms = self.BARGE_NOD_LONG_MS if nodding else self.BARGE_LONG_MS
                if a.first is None and v.speech_ms() >= 250 and a.user_text is not None:
                    a.cancel(); self.active = a = None                   # withdraw: not audible yet, caller still going
                    self.finals = [self._uncommit_last_caller()] + self.finals
                elif self.barge_audio and self.agent_playing() and v.speech_ms() >= self.BARGE_AUDIO_MS:
                    a.pause_seg = self.seg; self.pauses += 1; await a.pause()   # yield at once; decide when words come
                elif not self.barge_audio and self.agent_playing() and v.speech_ms() >= self.BARGE_MS and (words >= self.BARGE_WORDS or v.speech_ms() >= long_ms):
                    await self.interrupt(); a = None                     # barge-in: words, not a cough
        if self.ending or self.ended: return
        text = ' '.join(self.finals).strip()
        caught_up = self.final_seg >= self.seg or v.silence_ms() >= 1200
        p = self.pending
        if p is not None and p.speculative and caught_up and text:
            # the final is in: keep the speculative reply only if the recogniser settled on the same words
            if same_words(text, p.user_text):                 # (never in 'raise' mode: judge_raises() keeps it off)
                self.spec['kept'] += 1
                p.speculative = False; p.draft.user_text = text; p.draft.t['final'] = self.last_final_t
                p.draft.gate = self.conv.start_judge(text, self.conv.prev_caller(), floor=safety.caller_signals(text)['crisis'])
            else:
                self.spec['discarded'] += 1; p.cancel(); self.pending = None
        if self.speculate and self.pending is None and a is None and not v.speaking and not self.agent_playing() and not caught_up \
                and self.partial.strip() and self.eos_t is not None and self.partial_settled():
            use = ' '.join(self.finals + [self.partial]).strip()
            sig = safety.caller_signals(use)
            if not any(sig[k] for k in ACTION) and safety.redact(use) == use and not self.judge_raises():
                self.rid += 1; self.pending = Reply(self, self.rid, use, pending=True)
                self.pending.speculative = self.pending.from_partial = True; self.spec['started'] += 1
        if self.pending is None and a is None and not v.speaking and not self.agent_playing() and caught_up:
            use = text or (self.partial.strip() if self.partial and v.silence_ms() >= 1000 else '')
            if use:
                sig = safety.caller_signals(use)
                if any(sig[k] for k in ACTION) or safety.redact(use) != use:      # never speculate on raw secrets
                    gate = self.conv.start_judge(use, self.conv.prev_caller(), floor=sig['crisis'])
                    await self._commit_turn(use)
                    if self.digits_seg == self.seg and sig['readingSensitiveDigits'] and not any(sig[k] for k in ACTION if k != 'readingSensitiveDigits'):
                        return                                            # already stopped them mid-number
                    if await self.after_caller(sig) == 'replied' or self.ended:
                        if gate is not None: self.conv.track(self._settle(gate))
                        return
                    self.rid += 1; self.active = Reply(self, self.rid, None, released=True, gate=gate)
                    asyncio.ensure_future(self._after(self.active))
                    return
                gate = self.conv.start_judge(use, self.conv.prev_caller(), floor=sig['crisis'])
                self.rid += 1; self.pending = Reply(self, self.rid, use, pending=True, gate=gate)
                await self.line.send_json({'t': 'state', 's': 'thinking'})
        if self.pending is not None and not self.pending.released and not self.pending.speculative:
            hold = self.hold_ms(self.pending.user_text)
            if not v.speaking and v.silence_ms() >= hold:
                r = self.pending; self.pending = None
                await self._commit_turn(r.user_text)
                r.draft.pending = False
                self.active = r; await r.release(); await self.line.send_json({'t': 'state', 's': 'speaking'})
                asyncio.ensure_future(self._after(r))
        quiet_since = max(self.eos_t or self.t0, self.rec.play_until)
        if self.silence_s and a is None and self.pending is None and not v.speaking and not self.agent_playing() \
                and self.now() - quiet_since >= self.silence_s and not self.conv.state['crisis']:
            await self.speak_canned(self.fixed('silence'))
            await self.finish('silence_timeout')

    async def _settle(self, gate):
        if await self.conv.settle_gate(gate) and self.handoff_allowed('crisis') and not self.ended: await self.hand_off('crisis')

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
