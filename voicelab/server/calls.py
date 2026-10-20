# VP voice lab: one call = one browser websocket. CascadeCall runs STT -> brain -> TTS with our own turn-taking;
# GeminiLiveCall and AzureRealtimeCall bridge to speech-to-speech models. Every call records both channels, meters
# its own cost, and measures latency from the caller's last speech sample (our VAD) to the agent's first audio.
import asyncio, json, time, struct, re, uuid, os, base64
from collections import defaultdict
import aiohttp
from catalog import STT, BRAINS, TTS, S2S, FX, PRESETS
from persona import compile_prompt, KICKOFF
import persona_v2
from audio import VAD, Recorder, Resampler
import providers as pv
import phone

BOUND = re.compile(r'[,.?!।;:—]')
# same model on another host first; otherwise the fastest India-resident brain (lab 2026-10-19: Groq rate-limited gpt-oss)
BRAIN_FALLBACK = {'gpt-oss-120b@groq': 'gpt-oss-120b', 'gpt-oss-120b': 'gpt-oss-120b@groq'}
TAG = re.compile(r'^\s*\[([^\]]{0,60})\]\s*')
CUES = set('और लेकिन तो कि क्योंकि मतलब जैसे या पर जो अगर फिर यानी वो aur lekin toh to ki kyunki kyonki matlab jaise ya par agar phir '
           'yaani and but so because like or the a an um uh hmm actually basically which that if then with'.split())

def incomplete(text):
    t = text.strip().rstrip('।.!?').strip()
    if not t: return False
    if text.strip().endswith((',', '...', '…', '-', '—')): return True
    last = re.split(r'\s+', t)[-1].lower().strip(',')
    return last in CUES

def now(): return time.monotonic()
def charge_tts_backend(usage, usd):
    """Gemini TTS spend goes to the Vertex credit ledger when Vertex served it, else to the paid-key ledger."""
    if usage.get('via') == 'vertex': pv.VERTEX.charge(usd)
    elif usage.get('via') == 'paid': pv.GKEYS.charge('paid', usd)

class Call:
    kind = 'base'
    def __init__(self, lab, ws, cfg):
        self.lab, self.ws, self.cfg = lab, ws, cfg
        self.id = time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
        self.t0 = now(); self.wall0 = time.time()
        self.rec = Recorder(); self.vad = VAD(); self.rid = 0
        self.cost = defaultdict(float); self.turns = []; self.transcript = []; self.errors = []
        self.agent_rs = Resampler(24000, 16000)
        self.eos_sample = None; self.eos_t = None; self.last_reply_eos = None
        self.closed = False; self.http = lab.http; self.client_lat = {}; self.talk_over = 0; self.barge_ins = 0
        self.memory = lab.memory_get(cfg['tester'], cfg['scenario'])
        self.cost_task = None; self.trace = []; self.voice_fallbacks = 0; self.brain_fallbacks = 0
        self.wants_end = False; self.ended_by = None; self.ending = None
    def v2(self): return getattr(self, 'preset', {}).get('brief') == 'v2' and self.cfg.get('scenario') in persona_v2.SCEN
    def kickoff(self):
        if not self.v2(): return KICKOFF
        return '(call connected; they phoned you)' if self.cfg.get('line') == 'in' else persona_v2.KICKOFF
    async def end_after_playback(self, why='agent'):
        """She decided the call is over (said goodbye and asked to hang up): let her goodbye finish playing, then wait a
        beat; if the caller starts talking in that beat they had more to say, so the call stays up."""
        if self.ending is not None or self.closed: return
        self.ending = now(); self.tr('end_requested', why)
        try:
            t_lim = now() + 30
            while self.agent_playing() and now() < t_lim: await asyncio.sleep(0.05)
            seg0 = self.vad.n; t_beat = now() + 1.5
            while now() < t_beat:
                if self.vad.speaking: self.tr('end_cancelled', 'caller spoke'); return
                await asyncio.sleep(0.05)
            self.ended_by = why; self.wants_end = True; self.tr('agent_hangup', '')
            await self.send({'t': 'agent_hangup'})
        finally:
            if not self.wants_end: self.ending = None
    def tr(self, kind, info=''):
        if len(self.trace) < 600: self.trace.append((round(now() - self.t0, 3), kind, str(info)[:120]))
    # ---- transport
    async def send(self, obj):
        if not self.ws.closed:
            try: await self.ws.send_str(json.dumps(obj, ensure_ascii=False))
            except Exception: pass
    async def send_audio(self, rid, pcm24):
        start = self.rec.add_agent(self.agent_rs(pcm24), now())
        if not self.ws.closed:
            try: await self.ws.send_bytes(struct.pack('<I', rid) + pcm24)
            except Exception: pass
        return start
    async def flush(self, rid):
        self.rec.flush(now()); await self.send({'t': 'flush', 'rid': rid})
    def agent_playing(self): return now() < self.rec.play_until
    def add_cost(self, part, usd):
        if usd: self.cost[part] += usd; self.lab.spend_add(usd)
    def minutes(self): return max((now() - self.t0) / 60.0, 1e-6)
    async def cost_loop(self):
        while not self.closed:
            await asyncio.sleep(2.0)
            self.meter(); self.meter_line()
            tot = sum(self.cost.values())
            await self.send({'t': 'cost', 'usd': round(tot, 5), 'inr': round(tot * FX, 3), 'inr_per_min': round(tot * FX / self.minutes(), 3),
                             'parts': {k: round(v * FX, 3) for k, v in self.cost.items()}, 'secs': round(now() - self.t0, 1)})
    def meter(self): pass
    def meter_line(self):
        # a real phone call adds Plivo's per-minute charge (paid from the Plivo wallet, so not added to the lab's AI spend)
        if self.cfg.get('line'): self.cost['phone'] = phone.line_inr(self.cfg['line'], now() - self.t0) / FX
    # ---- caller audio
    async def on_mic(self, pcm):
        self.rec.add_caller(pcm)
        self.vad.strict = self.agent_playing()
        for ev, idx in self.vad.feed(pcm):
            self.tr('vad_' + ev, f'strict={self.vad.strict} playing={self.agent_playing()}')
            if ev == 'start':
                await self.send({'t': 'vad', 's': 'start'})
                await self.on_speech_start()
            else:
                self.eos_sample = idx; self.eos_t = now() - (self.vad.n - idx) / 16000.0
                await self.send({'t': 'eos', 'sample': idx})
                await self.on_speech_end()
        await self.on_frame(pcm, self.vad.speaking)
    async def on_speech_start(self): pass
    async def on_speech_end(self): pass
    async def on_frame(self, pcm, speaking): pass
    async def on_client(self, msg):
        if msg.get('t') == 'client_latency': self.client_lat[str(msg.get('rid'))] = msg.get('ms')
    # ---- reply bookkeeping shared by all kinds
    def reply_started(self, rid, info):
        """Called when the first audio of a reply goes out. Latency counts from the latest caller end of speech that
        this reply answers (None for the opening line)."""
        t = now(); eos_t = self.eos_t if (self.eos_t and self.eos_t != self.last_reply_eos) else None
        self.last_reply_eos = self.eos_t
        over = bool(self.vad.speaking)
        if over and eos_t is not None: self.talk_over += 1
        m = {'rid': rid, 't': round(t - self.t0, 3), 'server_ms': round((t - eos_t) * 1000) if eos_t else None,
             'eos_sample': self.eos_sample if eos_t else None, 'talk_over': over, **info}
        self.turns.append(m)
        return m
    async def start(self): raise NotImplementedError
    async def close(self):
        self.closed = True
        if self.cost_task: self.cost_task.cancel()
    def components(self): return {}
    def summary(self):
        self.meter(); self.meter_line()
        tot = sum(self.cost.values()); dur = now() - self.t0
        lat = [self.client_lat.get(str(m['rid'])) or m.get('server_ms') for m in self.turns if m.get('server_ms') is not None]
        lat = sorted(x for x in lat if x is not None)
        p50 = lat[len(lat) // 2] if lat else None
        replies = sum(1 for m in self.turns if m.get('server_ms') is not None)
        return {'id': self.id, 'tester': self.cfg['tester'], 'preset': self.cfg['preset'], 'scenario': self.cfg['scenario'], 'kind': self.kind,
                'components': self.components(), 'blind': self.cfg.get('blind', False), 'phone': self.cfg.get('phone', False), 'line': self.cfg.get('line'), 'brief': 'v2' if self.v2() else 'v1',
                'ended_by': self.ended_by or 'caller', 'consent': bool(self.cfg.get('consent')),
                'started': time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(self.wall0)), 'duration_s': round(dur, 1),
                'usd': round(tot, 5), 'inr': round(tot * FX, 2), 'inr_per_min': round(tot * FX / max(dur / 60, 1e-6), 3),
                'cost_parts_inr': {k: round(v * FX, 3) for k, v in self.cost.items()},
                'latency_p50_ms': p50, 'latencies_ms': lat, 'replies': replies, 'talk_over': self.talk_over, 'barge_ins': self.barge_ins, 'voice_fallbacks': self.voice_fallbacks, 'brain_fallbacks': self.brain_fallbacks,
                'turns': self.turns, 'client_latency': self.client_lat, 'transcript': self.transcript, 'errors': self.errors[:20], 'trace': self.trace}

# =====================================================================================================================
class Reply:
    """One agent reply in a cascade: brain stream -> clauses -> TTS -> audio. Audio is held until released (turn-taking)
    and can be cancelled at any point (caller kept talking, or barged in)."""
    def __init__(self, call, rid, user_text, released=False):
        self.c = call; self.rid = rid; self.user_text = user_text; self.released = released
        self.buf = []; self.cancelled = False; self.done = False; self.first = None; self.play_start = None
        self.spoken = []        # [clause, samples24] in emitted order
        self.llm_t = {}; self.llm_u = {}; self.tts_t = {}; self.style = None; self.text = ''
        self.synth = None; self.ends = False; self.task = asyncio.ensure_future(self.run())
    async def emit(self, pcm24, clause_idx):
        if self.cancelled or not pcm24: return
        if not self.released: self.buf.append((pcm24, clause_idx)); return
        if self.first is None:
            self.first = now(); self.c.tr('first_audio', f'rid={self.rid}')
            m = self.c.reply_started(self.rid, {'llm_ttft_ms': self._ms(self.llm_t, 'first'), 'tts_ttfb_ms': self._ms(self.tts_t, 'first', 'req'),
                                                'stt_lag_ms': self.c.stt_lag_ms, 'user': self.user_text})
            await self.c.send({'t': 'reply', 'rid': self.rid, 'eos_sample': m['eos_sample'], 'server_ms': m['server_ms']})
        st = await self.c.send_audio(self.rid, pcm24)
        if self.play_start is None: self.play_start = st
        while len(self.spoken) <= clause_idx: self.spoken.append(['', 0])
        self.spoken[clause_idx][1] += len(pcm24) // 2
    def _ms(self, d, k, base='req'):
        return round((d[k] - d[base]) * 1000) if k in d and base in d else None
    async def release(self):
        if self.released or self.cancelled: return
        self.released = True
        buf, self.buf = self.buf, []
        for b, i in buf: await self.emit(b, i)
    def cancel(self):
        if self.cancelled: return
        self.cancelled = True
        if self.synth is not None:
            s = self.synth; self.synth = None
            asyncio.get_running_loop().run_in_executor(None, s.stop)
        if getattr(self.c, 'bulbul', None) is not None and TTS[self.c.tts]['kind'] == 'sarvam' and not self.done:
            self.c.bulbul.reset()      # no cancel message in Bulbul: drop the socket, next reply opens a fresh one
        self.task.cancel()
    def heard_text(self):
        """What the caller actually heard, from the playback clock (for history after an interruption)."""
        if self.play_start is None: return ''
        played = max(0.0, now() - self.play_start) * 24000; out = []
        for clause, n in self.spoken:
            if n == 0: continue
            if played >= n: out.append(clause); played -= n
            else:
                w = clause.split(); k = int(len(w) * played / max(n, 1)); out.append(' '.join(w[:k]) + '—'); break
        return ' '.join(x for x in out if x)
    async def run(self):
        c = self.c
        msgs = c.messages_for(self.user_text)
        q = asyncio.Queue(); tts = asyncio.ensure_future(self.tts_loop(q))
        try:
            buf = ''; tag_done = not c.notes; n_clause = 0
            fb = BRAIN_FALLBACK.get(c.brain, 'gpt-4.1-mini-in')
            for brain in [c.brain] + ([fb] if fb != c.brain else []):
                if brain != c.brain:
                    # the stack's brain failed before saying a word (rate limit, outage): answer with the fallback
                    why = self.llm_t.get('err', '')[:120]; c.errors.append(f'brain fallback to {brain}: ' + why)
                    await c.send({'t': 'error', 'msg': f"Brain busy ({why[:60]}); this reply used {BRAINS[brain]['label']}"})
                    self.llm_t = {}; self.llm_u = {}; c.brain_fallbacks += 1
                async for d in pv.llm_stream(c.http, brain, msgs, self.llm_u, self.llm_t):
                    buf += d; self.text += d
                    if persona_v2.END.search(buf): self.ends = True; buf = persona_v2.END.sub('', buf)
                    if '<' in buf[-12:] and '>' not in buf[buf.rfind('<'):]: continue     # maybe a marker arriving in pieces
                    if not tag_done:
                        s = buf.lstrip()
                        if not s: continue
                        if s[0] == '[':
                            m = TAG.match(buf)
                            if m: self.style = m.group(1).strip().lower(); buf = buf[m.end():]; tag_done = True
                            elif len(s) > 64: tag_done = True
                            else: continue
                        else: tag_done = True
                    while True:
                        m = BOUND.search(buf)
                        # never split inside a number ("18,450", "2.5"): a separator after a digit waits for the next char
                        while m and buf[m.start()] in ',.' and m.start() > 0 and buf[m.start() - 1].isdigit():
                            if m.end() >= len(buf): m = None; break
                            if not buf[m.end()].isdigit(): break
                            m = BOUND.search(buf, m.end())
                        if m and (n_clause > 0 or len(buf[:m.start()].split()) >= 1):
                            cl = buf[:m.end()]; buf = buf[m.end():]
                            if cl.strip(): await q.put(cl); n_clause += 1
                        elif len(buf) > 80 and ' ' in buf[50:]:
                            k = buf.rfind(' '); await q.put(buf[:k]); buf = buf[k:]; n_clause += 1
                        else: break
                if self.text or not self.llm_t.get('err'): break
            if self.llm_t.get('err') and not self.text: c.errors.append('brain: ' + self.llm_t['err'][:200]); await c.send({'t': 'error', 'msg': 'brain: ' + self.llm_t['err'][:160]})
            if persona_v2.END.search(buf): self.ends = True; buf = persona_v2.END.sub('', buf)
            buf = re.sub(r'<[^>]{0,20}$', '', buf)
            if buf.strip():
                if not tag_done: buf = TAG.sub('', buf)
                await q.put(buf)
        except asyncio.CancelledError:
            tts.cancel(); raise
        finally:
            c.add_cost('brain', self.llm_u.get('usd', 0.0))
        await q.put(None)
        try: await tts
        except asyncio.CancelledError: raise
        except Exception as e:
            c.errors.append('tts: ' + repr(e)[:200]); await c.send({'t': 'error', 'msg': 'voice: ' + repr(e)[:160]})
        self.done = True
    async def tts_loop(self, q):
        c = self.c; t = TTS[c.tts]; idx = 0
        if t['kind'] == 'azure':
            loop = asyncio.get_running_loop()
            self.synth = await loop.run_in_executor(None, pv.POOL.get, c.voice)
            try:
                while True:
                    cl = await q.get()
                    if cl is None: break
                    cl = c.say(pv._strip(cl)).strip()
                    if not cl: continue
                    while len(self.spoken) <= idx: self.spoken.append(['', 0])
                    self.spoken[idx][0] = cl
                    self.tts_t.setdefault('req', time.perf_counter())
                    style = c.map_style(self.style)
                    async for chunk in self.synth.speak(cl, style):
                        self.tts_t.setdefault('first', time.perf_counter())
                        await self.emit(chunk, idx)
                    c.tts_chars += len(cl); c.add_cost('voice', pv.tts_usd(c.tts, chars=len(cl)))
                    idx += 1
            finally:
                if self.synth is not None and not self.cancelled:
                    s = self.synth; self.synth = None; pv.POOL.put(s)
        elif t['kind'] == 'sarvam':
            while True:
                cl = await q.get()
                if cl is None: break
                cl = c.say(pv._strip(cl)).strip()
                if not cl: continue
                while len(self.spoken) <= idx: self.spoken.append(['', 0])
                self.spoken[idx][0] = cl
                self.tts_t.setdefault('req', time.perf_counter())
                async for chunk in c.bulbul.speak(cl):
                    self.tts_t.setdefault('first', time.perf_counter())
                    await self.emit(chunk, idx)
                c.tts_chars += len(cl); c.add_cost('voice', pv.tts_usd(c.tts, chars=len(cl)))
                idx += 1
        else:
            # Gemini TTS: first clause alone (fast first sound), then the rest of the reply in one request so the
            # prosody of the remainder is continuous. The second request starts while the first still plays.
            first = await q.get()
            if first is None: return
            first = c.say(pv._strip(first)).strip(); rest = []
            seg2 = None; seg2_q = asyncio.Queue()
            async def produce(text, out_q, usage, timing):
                try:
                    async for ch in pv.gemini_tts(c.http, t['model'], c.voice, text, self.style if c.notes else None, usage, timing):
                        await out_q.put(ch)
                finally:
                    await out_q.put(None)
            async def collect_rest():
                while True:
                    x = await q.get()
                    if x is None: break
                    rest.append(c.say(pv._strip(x)).strip())
                txt = ' '.join(r for r in rest if r)
                if txt:
                    u2, t2 = {}, {}; self.tts2_t = t2
                    await produce(txt, seg2_q, u2, t2)
                    usd2 = pv.tts_usd(c.tts, audio_s=u2.get('audio_s', 0)); c.add_cost('voice', usd2); charge_tts_backend(u2, usd2)
                    if t2.get('err'): c.errors.append('tts: ' + t2['err'][:200])
                else: await seg2_q.put(None)
                return txt
            rest_task = asyncio.ensure_future(collect_rest())
            u1 = {}; q1 = asyncio.Queue()
            p1 = asyncio.ensure_future(produce(first, q1, u1, self.tts_t))
            self.spoken.append([persona_v2.spoken(first), 0])
            try:
                while True:
                    ch = await q1.get()
                    if ch is None: break
                    await self.emit(ch, 0)
                usd1 = pv.tts_usd(c.tts, audio_s=u1.get('audio_s', 0)); c.add_cost('voice', usd1); charge_tts_backend(u1, usd1)
                if self.tts_t.get('err'): c.errors.append('tts: ' + self.tts_t['err'][:200])
                if self.spoken[0][1] == 0 and self.tts_t.get('err'): await self.voice_fallback(first, 0, self.tts_t['err'])
                txt = await rest_task
                if txt:
                    self.spoken.append([persona_v2.spoken(txt), 0])
                    while True:
                        ch = await seg2_q.get()
                        if ch is None: break
                        await self.emit(ch, 1)
                    t2 = getattr(self, 'tts2_t', {})
                    if self.spoken[1][1] == 0 and t2.get('err'): await self.voice_fallback(txt, 1, t2['err'])
            finally:
                p1.cancel(); rest_task.cancel()

    async def voice_fallback(self, text, idx, why):
        """The stack's Gemini TTS failed (Tier-1 daily cap of 100 requests per model, or a rate limit): speak this part
        with Gemini Flash-Lite TTS in the same voice, else an Azure voice, so the call never goes silent; say so once."""
        c = self.c
        if self.cancelled or not text: return
        c.voice_fallbacks += 1; c.errors.append('voice fallback: ' + why[:160]); c.tr('voice_fallback', why[:80])
        model = TTS[c.tts].get('model')
        if model == 'gemini-3.8-flash-tts':
            u, tm = {}, {}; got = False
            async for ch in pv.gemini_tts(c.http, 'gemini-3.8-flash-lite-tts', c.voice, text, self.style if c.notes else None, u, tm):
                got = True; self.tts_t.setdefault('first', time.perf_counter()); await self.emit(ch, idx)
            if got:
                usdf = pv.tts_usd('gemini-lite', audio_s=u.get('audio_s', 0)); c.add_cost('voice', usdf); charge_tts_backend(u, usdf)
                if c.voice_fallbacks == 1:
                    await c.send({'t': 'error', 'msg': "Gemini Flash TTS hit Google's daily cap (100 requests per model), so replies use Gemini Flash-Lite TTS, same voice. Rate the voice with that in mind."})
                return
        if c.voice_fallbacks == 1 or not getattr(c, 'azure_fb_noted', False):
            c.azure_fb_noted = True
            await c.send({'t': 'error', 'msg': 'Gemini voice is out of quota right now, so replies use a backup Azure voice. Skip rating the voice for this call.'})
        loop = asyncio.get_running_loop()
        s = await loop.run_in_executor(None, pv.POOL.get, 'hi-IN-SwaraNeural'); self.synth = s
        try:
            async for ch in s.speak(text):
                self.tts_t.setdefault('first', time.perf_counter()); await self.emit(ch, idx)
            c.add_cost('voice', len(text) * 15.0 / 1e6)
        finally:
            if self.synth is s and not self.cancelled: self.synth = None; pv.POOL.put(s)

class CascadeCall(Call):
    kind = 'cascade'
    LONG_HOLD_MS = 1400
    def __init__(self, lab, ws, cfg, preset):
        super().__init__(lab, ws, cfg)
        self.preset = preset
        self.stt_id = preset['stt']; self.gated = preset.get('gated', False)
        self.brain = cfg.get('brain') or preset['brain']; self.tts = preset['tts']
        self.voice = cfg.get('voice') or TTS[self.tts]['default_voice']
        if self.voice not in TTS[self.tts]['voices']: self.voice = TTS[self.tts]['default_voice']
        self.notes = bool(preset.get('notes'))
        if self.v2(): self.memory = lab.memory_get(cfg['tester'], cfg['scenario'] + '-v2')     # fresh, cleaner memory for v2
        styles = TTS[self.tts].get('styles') if TTS[self.tts].get('emotion') else None
        if self.v2():
            self.notes = bool(TTS[self.tts].get('emotion'))           # MAI-Voice: a free-form tone per reply picks its style
            self.sounds = TTS[self.tts]['kind'] == 'gemini'            # Gemini 3.8 TTS understands <laugh>/<sigh>/<breath>
            self.system = persona_v2.compile_prompt(cfg['scenario'], self.memory, caller=cfg['tester'], notes=self.notes, sounds=self.sounds)
        else: self.system = compile_prompt(cfg['scenario'], self.memory, notes=self.notes, note_styles=styles)
        self.history = [{'role': 'user', 'content': self.kickoff()}]
        self.finals = []; self.partial = ''; self.pending = None; self.active = None; self.overlap = []
        self.seg = 0; self.final_seg = 0      # speech segments seen / latest segment that has produced a final
        self.tts_chars = 0; self.stt_lag_ms = None; self.final_t = None; self.smart = cfg.get('smart_turn', True)
        self.tick_task = None; self.stt = None; self.bulbul = None
    def components(self):
        return {'stt': self.stt_id, 'gated': self.gated, 'brain': self.brain, 'tts': self.tts, 'voice': self.voice, 'notes': self.notes}
    def say(self, clause):
        """Text for the voice: v2 replies may carry sound tags (kept only for a voice that understands them)."""
        return persona_v2.spoken(clause, keep_sounds=getattr(self, 'sounds', False)) if self.v2() else clause
    def map_style(self, style):
        t = TTS[self.tts]
        if not style or not t.get('emotion'): return None
        if self.v2(): return persona_v2.mai_style(style)
        for s in t['styles']:
            if s in style: return s
        return None
    def messages_for(self, user_text):
        msgs = [{'role': 'system', 'content': self.system}] + self.history
        if user_text: msgs = msgs + [{'role': 'user', 'content': user_text}]
        if self.v2():     # the ledger + counts go last, every turn (position is mechanism)
            tr = self.transcript + ([{'who': 'caller', 'text': user_text}] if user_text else [])
            msgs = msgs + [{'role': 'system', 'content': persona_v2.tail(tr, self.cfg['scenario'])}]
        return msgs
    async def start(self):
        loop = asyncio.get_running_loop()
        on_p = lambda t: self._partial(t); on_f = lambda t: self._final(t); on_e = lambda e: self._stt_err(e)
        k = STT[self.stt_id]['kind']
        if k == 'azure': inner = pv.AzureSTT(loop, on_p, on_f, on_e)
        elif k == 'gemini': inner = pv.GeminiSTT(self.http, on_p, on_f, on_e)
        elif k == 'sarvam': inner = pv.SarvamSTT(self.http, STT[self.stt_id]['model'], on_p, on_f, on_e)
        else: inner = pv.OaiRealtimeSTT(self.http, STT[self.stt_id]['deployment'], on_p, on_f, on_e)
        if hasattr(inner, 'trace'): inner.trace = self.tr
        self.stt = pv.Gate(inner) if self.gated else inner
        if TTS[self.tts]['kind'] == 'azure':
            await loop.run_in_executor(None, pv.POOL.warm, self.voice, 2)
        if TTS[self.tts]['kind'] == 'sarvam':
            self.bulbul = pv.SarvamTTS(self.http, TTS[self.tts]['model'], self.voice); await self.bulbul.warm()
        await self.stt.start()
        self.tick_task = asyncio.ensure_future(self.tick())
        self.cost_task = asyncio.ensure_future(self.cost_loop())
        # opening line (the agent speaks first in every scenario)
        self.rid += 1; self.active = Reply(self, self.rid, None, released=True)
        asyncio.ensure_future(self._after(self.active))
    def _partial(self, t):
        self.tr('stt_partial', t); self.partial = t
        asyncio.ensure_future(self.send({'t': 'cap', 'who': 'user', 'text': ' '.join(self.finals + [t]), 'final': False}))
    def _final(self, t):
        self.tr('stt_final', t); self.final_seg = self.seg
        if self.eos_t and not self.vad.speaking: self.stt_lag_ms = round((now() - self.eos_t) * 1000)
        self.partial = ''; self.final_t = now()
        if self.active is not None and self.agent_playing():
            # heard while she is talking and not (yet) a barge-in: a backchannel unless the caller keeps going
            self.overlap.append(t)
            asyncio.ensure_future(self.send({'t': 'cap', 'who': 'user', 'text': t, 'final': True, 'overlap': True}))
            return
        self.finals.append(t)
        asyncio.ensure_future(self.send({'t': 'cap', 'who': 'user', 'text': ' '.join(self.finals), 'final': True}))
    def _stt_err(self, e):
        self.errors.append('stt: ' + e); asyncio.ensure_future(self.send({'t': 'error', 'msg': 'ears: ' + e[:160]}))
    async def on_frame(self, pcm, speaking):
        if self.stt: self.stt.write(pcm, speaking)
    async def on_speech_end(self):
        if self.stt: self.stt.end_of_speech()
    async def on_speech_start(self):
        self.seg += 1
        if self.pending is not None and not self.pending.released:
            self.tr('drop_pending', f'rid={self.pending.rid}')
            self.pending.cancel(); self.pending = None          # caller kept talking: drop the unreleased reply
    async def interrupt(self):
        r = self.active
        if r is None: return
        self.tr('interrupt', f'rid={r.rid}')
        heard = r.heard_text(); was_done = r.done; r.cancel(); self.barge_ins += 1
        await self.flush(r.rid)
        if was_done and self.history and self.history[-1]['role'] == 'assistant':
            self.history.pop()                                   # replace the full reply with what was actually heard
            if self.transcript and self.transcript[-1]['who'] == 'agent': self.transcript.pop()
        self._commit_assistant(heard or '', interrupted=True)
        self.finals = self.overlap + self.finals; self.overlap = []
        self.active = None
        await self.send({'t': 'state', 's': 'listening'})
    def _commit_assistant(self, text, interrupted=False):
        if text:
            self.history.append({'role': 'assistant', 'content': text})
            self.transcript.append({'who': 'agent', 'text': text, 'interrupted': interrupted, 't': round(now() - self.t0, 2)})
    async def _after(self, r):
        try: await r.task
        except asyncio.CancelledError: return
        except Exception as e:
            self.errors.append('reply: ' + repr(e)[:200]); return
        if r.cancelled: return
        spoken = ' '.join(s[0] for s in r.spoken if s[0])
        self._commit_assistant(spoken)
        await self.send({'t': 'cap', 'who': 'agent', 'text': spoken, 'final': True, 'rid': r.rid, 'style': r.style})
        if r.ends:
            if persona_v2.hangup_ok(spoken, r.user_text or ''): asyncio.ensure_future(self.end_after_playback())
            else: self.tr('end_ignored', 'no goodbye, or they were asking')
    async def tick(self):
        while not self.closed:
            await asyncio.sleep(0.03)
            try: await self._tick()
            except Exception as e: self.errors.append('tick: ' + repr(e)[:200])
    async def _tick(self):
        v = self.vad; a = self.active
        if a is not None:
            if a.cancelled or (a.done and not self.agent_playing()):
                # her turn is over: anything heard during it without a barge-in was a backchannel
                for t in self.overlap: self.transcript.append({'who': 'caller', 'text': t, 'backchannel': True, 't': round(now() - self.t0, 2)})
                self.overlap = []; self.active = a = None
                await self.send({'t': 'state', 's': 'listening'})
            elif v.speaking:
                words = len((' '.join(self.overlap) + ' ' + self.partial).split())
                if a.first is None and v.speech_ms() >= 250:
                    # released but not yet audible and the caller is still going: withdraw it and merge the turn
                    self.tr('withdraw', f'rid={a.rid}'); a.cancel(); self.active = a = None
                    if self.history and self.history[-1]['role'] == 'user':
                        self.finals = [self.history.pop()['content']] + self.finals
                        if self.transcript and self.transcript[-1]['who'] == 'caller': self.transcript.pop()
                elif self.agent_playing() and v.speech_ms() >= 300 and (words >= 2 or v.speech_ms() >= 700):
                    await self.interrupt(); a = None   # barge-in: words, not a cough or a "hmm"
        text = ' '.join(self.finals).strip()
        # wait for the final of the caller's latest speech segment (or give up after 1.2 s of silence: a cough, a breath)
        caught_up = self.final_seg >= self.seg or v.silence_ms() >= 1200
        if self.pending is None and a is None and not v.speaking and not self.agent_playing() and caught_up:
            use = text
            if not use and self.partial and v.silence_ms() >= 1000: use = self.partial.strip()
            if use:
                self.rid += 1; self.pending = Reply(self, self.rid, use); self.tr('trigger', f'rid={self.rid} {use}')
                await self.send({'t': 'state', 's': 'thinking'})
        if self.pending is not None and not self.pending.released:
            hold = self.LONG_HOLD_MS if (self.smart and incomplete(self.pending.user_text)) else 0
            if not v.speaking and v.silence_ms() >= hold:
                r = self.pending; self.pending = None
                self.history.append({'role': 'user', 'content': r.user_text})
                self.transcript.append({'who': 'caller', 'text': r.user_text, 't': round(now() - self.t0, 2)})
                self.finals = []; self.partial = ''
                self.active = r; self.tr('release', f'rid={r.rid} hold={hold}'); await r.release(); await self.send({'t': 'state', 's': 'speaking'})
                asyncio.ensure_future(self._after(r))
    def meter(self):
        if self.stt is not None:
            usd = self.stt.audio_s / 60 * STT[self.stt_id]['usd_min']
            self.cost['ears'] = usd     # absolute, recomputed
    async def close(self):
        await super().close()
        if self.tick_task: self.tick_task.cancel()
        for r in (self.pending, self.active):
            if r is not None: r.cancel()
        if self.stt: await self.stt.close()
        if self.bulbul: await self.bulbul.close()
        self.meter()

# =====================================================================================================================
def gemini_usage_usd(um):
    PI = {'TEXT': 0.75, 'AUDIO': 3.0}; PO = {'TEXT': 4.5, 'AUDIO': 12.0}; usd = 0.0; det = 0
    for x in um.get('promptTokensDetails', []) or []:
        n = x.get('tokenCount', 0); det += n; usd += n * PI.get(x.get('modality'), 3.0) / 1e6
    for x in um.get('responseTokensDetails', []) or []:
        usd += x.get('tokenCount', 0) * PO.get(x.get('modality'), 12.0) / 1e6
    usd += (um.get('thoughtsTokenCount', 0) or 0) * 4.5 / 1e6
    gap = (um.get('promptTokenCount', 0) or 0) - det
    if gap > 0: usd += gap * 3.0 / 1e6
    return usd

class GeminiLiveCall(Call):
    kind = 's2s'
    def __init__(self, lab, ws, cfg, preset):
        super().__init__(lab, ws, cfg)
        self.spec = S2S[preset['s2s']]; self.preset = preset
        self.voice = cfg.get('voice') if cfg.get('voice') in self.spec['voices'] else self.spec['voice']
        if self.v2(): self.memory = lab.memory_get(cfg['tester'], cfg['scenario'] + '-v2')
        if self.v2():
            self.system = (persona_v2.compile_prompt(cfg['scenario'], self.memory, caller=cfg['tester'], end='tool')
                           + '\n\n' + persona_v2.LAST)
        else: self.system = compile_prompt(cfg['scenario'], self.memory)
        self.up = None; self.reader = None; self.cur = None; self.buf = b''; self.tier = None; self.agent_text = ''; self.user_text = ''
        self.handle = None
    def components(self): return {'s2s': self.preset['s2s'], 'model': self.spec['model'], 'voice': self.voice}
    def setup(self):
        gen = {'responseModalities': ['AUDIO'], 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': self.voice}}}}
        if '3.1' in self.spec['model']: gen['speechConfig']['languageCode'] = 'hi-IN'     # Maya's setting; 3.8 auto-detects
        s = {'model': 'models/' + self.spec['model'], 'generationConfig': gen, 'systemInstruction': {'parts': [{'text': self.system}]},
             'inputAudioTranscription': {}, 'outputAudioTranscription': {},
             'realtimeInputConfig': {'automaticActivityDetection': {'silenceDurationMs': 500, 'prefixPaddingMs': 100}},
             'sessionResumption': ({'handle': self.handle} if self.handle else {})}
        if self.v2():
            s['tools'] = [{'functionDeclarations': [{'name': 'end_call', 'description': 'Hang up the phone. Use it only right after '
                           'your own goodbye line, when the conversation is over; never while they are still talking or asking.'}]}]
        if self.spec.get('compression'):
            trig, targ = self.spec['compression']
            s['contextWindowCompression'] = {'triggerTokens': trig, 'slidingWindow': {'targetTokens': targ}}
        return {'setup': s}
    async def connect(self):
        last = None
        for attempt in range(2):
            key, tier = pv.GKEYS.pick(); self.tier = tier
            if not key: raise RuntimeError('no Gemini key with budget left')
            try:
                ws = await self.http.ws_connect(pv.GEM_WS, headers={'x-goog-api-key': key}, max_msg_size=0, heartbeat=20)
                await ws.send_json(self.setup())
                m = await ws.receive(timeout=20)
                if pv.ws_text(m) is None or 'setupComplete' not in pv.ws_text(m):
                    raise RuntimeError(f'setup: {str(getattr(m, "data", m.type))[:200]} {ws.close_code}')
                return ws
            except Exception as e:
                last = e
                if tier == 'free' and attempt == 0: pv.GKEYS.quota_hit('free', 300); continue
                raise
        raise last
    async def start(self):
        self.up = await self.connect()
        self.reader = asyncio.ensure_future(self.read())
        self.cost_task = asyncio.ensure_future(self.cost_loop())
        await self.up.send_json({'clientContent': {'turns': [{'role': 'user', 'parts': [{'text': self.kickoff()}]}], 'turnComplete': True}})
    async def on_frame(self, pcm, speaking):
        if self.up is None or self.up.closed: return
        self.buf += pcm
        if len(self.buf) >= 1280:
            b, self.buf = self.buf, b''
            try: await self.up.send_json({'realtimeInput': {'audio': {'data': base64.b64encode(b).decode(), 'mimeType': 'audio/pcm;rate=16000'}}})
            except Exception: pass
    async def read(self):
        try:
            async for m in self.up:
                txt = pv.ws_text(m)
                if txt is None: continue
                d = json.loads(txt); sc = d.get('serverContent')
                if sc:
                    mt = sc.get('modelTurn')
                    if mt:
                        for p in mt.get('parts', []):
                            idata = p.get('inlineData')
                            if idata and idata.get('data'):
                                b = base64.b64decode(idata['data'])
                                if self.cur is None:
                                    self.rid += 1; self.cur = self.rid
                                    mm = self.reply_started(self.cur, {'user': self.user_text.strip()})
                                    await self.send({'t': 'reply', 'rid': self.cur, 'eos_sample': mm['eos_sample'], 'server_ms': mm['server_ms']})
                                    await self.send({'t': 'state', 's': 'speaking'})
                                    if self.user_text.strip(): self.transcript.append({'who': 'caller', 'text': self.user_text.strip(), 't': round(now() - self.t0, 2)})
                                    self.user_text = ''
                                await self.send_audio(self.cur, b)
                    if 'inputTranscription' in sc:
                        self.user_text += sc['inputTranscription'].get('text', '')
                        await self.send({'t': 'cap', 'who': 'user', 'text': self.user_text.strip(), 'final': False})
                    if 'outputTranscription' in sc:
                        self.agent_text += sc['outputTranscription'].get('text', '')
                        await self.send({'t': 'cap', 'who': 'agent', 'text': self.agent_text.strip(), 'final': False, 'rid': self.cur})
                    if sc.get('interrupted'):
                        if self.cur is not None:
                            self.barge_ins += 1; await self.flush(self.cur)
                        self._end_turn(interrupted=True)
                    if sc.get('turnComplete'):
                        self._end_turn()
                tc = d.get('toolCall')
                if tc:
                    resp = []
                    for fc in tc.get('functionCalls') or []:
                        resp.append({'id': fc.get('id'), 'name': fc.get('name'), 'response': {'ok': True}})
                        if fc.get('name') == 'end_call': asyncio.ensure_future(self.end_after_playback())
                    try: await self.up.send_json({'toolResponse': {'functionResponses': resp}})
                    except Exception: pass
                um = d.get('usageMetadata')
                if um:
                    usd = gemini_usage_usd(um); self.add_cost('live', usd); pv.GKEYS.charge(self.tier, usd)
                if 'sessionResumptionUpdate' in d:
                    self.handle = (d['sessionResumptionUpdate'] or {}).get('newHandle') or self.handle
                if 'goAway' in d and not self.closed:
                    asyncio.ensure_future(self.resume())
        except Exception as e:
            if not self.closed: self.errors.append('live: ' + repr(e)[:200]); await self.send({'t': 'error', 'msg': 'live: ' + repr(e)[:160]})
        if not self.closed and self.up is not None and self.up.close_code not in (None, 1000):
            self.errors.append(f'live closed {self.up.close_code}'); await self.send({'t': 'error', 'msg': f'live session closed ({self.up.close_code})'})
    def _end_turn(self, interrupted=False):
        if self.agent_text.strip():
            self.transcript.append({'who': 'agent', 'text': self.agent_text.strip(), 'interrupted': interrupted, 't': round(now() - self.t0, 2)})
            asyncio.ensure_future(self.send({'t': 'cap', 'who': 'agent', 'text': self.agent_text.strip(), 'final': True, 'rid': self.cur}))
            if self.v2(): asyncio.ensure_future(self.note_ledger())
        self.agent_text = ''; self.cur = None
    async def note_ledger(self):
        """Hand her the ledger as silent context (no reply expected), Maya's direct() pattern: what is spent, offers and
        outcomes, how they sound, whether they sound ready to finish."""
        try:
            led = persona_v2.ledger(self.transcript, self.cfg['scenario']).replace('then <end_call>', 'then the end_call tool')
            note = '<context, not from the caller: ' + led.replace('\n', ' | ') + '>'
            await self.up.send_json({'clientContent': {'turns': [{'role': 'user', 'parts': [{'text': note}]}], 'turnComplete': False}})
        except Exception as e: self.errors.append('ledger note: ' + repr(e)[:120])
    async def resume(self):
        old = self.up
        try:
            self.up = await self.connect(); self.reader = asyncio.ensure_future(self.read())
        except Exception as e:
            self.errors.append('resume: ' + repr(e)[:160])
        try: await old.close()
        except Exception: pass
    async def close(self):
        await super().close()
        try:
            if self.up is not None: await self.up.close()
        except Exception: pass

# =====================================================================================================================
class AzureRealtimeCall(Call):
    kind = 's2s'
    def __init__(self, lab, ws, cfg, preset):
        super().__init__(lab, ws, cfg)
        self.spec = S2S[preset['s2s']]; self.preset = preset
        self.voice = cfg.get('voice') if cfg.get('voice') in self.spec['voices'] else self.spec['voice']
        if self.v2():
            self.memory = lab.memory_get(cfg['tester'], cfg['scenario'] + '-v2')
            self.system = persona_v2.compile_prompt(cfg['scenario'], self.memory, caller=cfg['tester'], end='tool') + '\n\n' + persona_v2.LAST
        else: self.system = compile_prompt(cfg['scenario'], self.memory)
        self.up = None; self.rs = Resampler(16000, 24000); self.buf = b''; self.cur = None; self.cur_item = None
        self.agent_text = ''; self.first_play = None; self.resp_rid = {}
    def components(self): return {'s2s': self.preset['s2s'], 'deployment': self.spec['deployment'], 'voice': self.voice}
    async def start(self):
        url = f"wss://{pv.az_host(pv.env('LAB_AI_ENDPOINT'))}/openai/v1/realtime?model={self.spec['deployment']}"
        self.up = await self.http.ws_connect(url, headers={'api-key': pv.env('LAB_AI_KEY')}, max_msg_size=0, heartbeat=20)
        await self.up.send_json({'type': 'session.update', 'session': {'type': 'realtime', 'instructions': self.system, 'output_modalities': ['audio'],
            'audio': {'input': {'format': {'type': 'audio/pcm', 'rate': 24000}, 'noise_reduction': {'type': 'near_field'},
                                'turn_detection': {'type': 'semantic_vad', 'eagerness': 'medium', 'create_response': True, 'interrupt_response': True},
                                'transcription': {'model': 'lab-4ominitx', 'language': 'hi'}},
                      'output': {'format': {'type': 'audio/pcm', 'rate': 24000}, 'voice': self.voice}},
            **({'tools': [{'type': 'function', 'name': 'end_call', 'description': 'Hang up the phone. Use it only right after your own goodbye '
                           'line, when the conversation is over; never while they are still talking or asking.',
                           'parameters': {'type': 'object', 'properties': {}}}]} if self.v2() else {})}})
        self.reader = asyncio.ensure_future(self.read())
        self.cost_task = asyncio.ensure_future(self.cost_loop())
        await self.up.send_json({'type': 'conversation.item.create', 'item': {'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': self.kickoff()}]}})
        await self.up.send_json({'type': 'response.create'})
    async def on_frame(self, pcm, speaking):
        if self.up is None or self.up.closed: return
        self.buf += pcm
        if len(self.buf) >= 1280:
            b, self.buf = self.buf, b''
            try: await self.up.send_json({'type': 'input_audio_buffer.append', 'audio': base64.b64encode(self.rs(b)).decode()})
            except Exception: pass
    async def read(self):
        P = self.spec['price']
        try:
            async for m in self.up:
                if m.type != aiohttp.WSMsgType.TEXT: continue
                d = json.loads(m.data); ty = d.get('type', '')
                if ty in ('response.output_audio.delta', 'response.audio.delta'):
                    b = base64.b64decode(d.get('delta', ''))
                    if self.cur is None:
                        self.rid += 1; self.cur = self.rid; self.cur_item = d.get('item_id'); self.first_play = None
                        mm = self.reply_started(self.cur, {})
                        await self.send({'t': 'reply', 'rid': self.cur, 'eos_sample': mm['eos_sample'], 'server_ms': mm['server_ms']})
                        await self.send({'t': 'state', 's': 'speaking'})
                    st = await self.send_audio(self.cur, b)
                    if self.first_play is None: self.first_play = st
                elif ty in ('response.output_audio_transcript.delta', 'response.audio_transcript.delta'):
                    self.agent_text += d.get('delta', '')
                    await self.send({'t': 'cap', 'who': 'agent', 'text': self.agent_text.strip(), 'final': False, 'rid': self.cur})
                elif ty == 'conversation.item.input_audio_transcription.completed':
                    t = (d.get('transcript') or '').strip()
                    if t:
                        self.transcript.append({'who': 'caller', 'text': t, 't': round(now() - self.t0, 2)})
                        await self.send({'t': 'cap', 'who': 'user', 'text': t, 'final': True})
                elif ty == 'input_audio_buffer.speech_started':
                    if self.cur is not None and self.agent_playing():
                        played_ms = int(max(0.0, now() - (self.first_play or now())) * 1000)
                        try: await self.up.send_json({'type': 'conversation.item.truncate', 'item_id': self.cur_item, 'content_index': 0, 'audio_end_ms': played_ms})
                        except Exception: pass
                        self.barge_ins += 1; await self.flush(self.cur); self._end_turn(True)
                elif ty == 'response.done':
                    u = (d.get('response') or {}).get('usage') or {}
                    it = u.get('input_token_details') or {}; ot = u.get('output_token_details') or {}
                    cached = it.get('cached_tokens', 0) or 0
                    usd = ((it.get('text_tokens', 0) or 0) * P['in_text'] + max(0, (it.get('audio_tokens', 0) or 0) - cached) * P['in_audio'] + cached * P['in_cached']
                           + (ot.get('text_tokens', 0) or 0) * P['out_text'] + (ot.get('audio_tokens', 0) or 0) * P['out_audio']) / 1e6
                    self.add_cost('realtime', usd)
                    self._end_turn()
                elif ty == 'response.function_call_arguments.done' and d.get('name') == 'end_call':
                    asyncio.ensure_future(self.end_after_playback())
                elif ty == 'error':
                    self.errors.append('rt: ' + json.dumps(d)[:200]); await self.send({'t': 'error', 'msg': 'realtime: ' + json.dumps(d.get('error'))[:160]})
        except Exception as e:
            if not self.closed: self.errors.append('rt: ' + repr(e)[:200])
    def _end_turn(self, interrupted=False):
        if self.agent_text.strip():
            self.transcript.append({'who': 'agent', 'text': self.agent_text.strip(), 'interrupted': interrupted, 't': round(now() - self.t0, 2)})
            asyncio.ensure_future(self.send({'t': 'cap', 'who': 'agent', 'text': self.agent_text.strip(), 'final': True, 'rid': self.cur}))
        self.agent_text = ''; self.cur = None
    async def close(self):
        await super().close()
        try:
            if self.up is not None: await self.up.close()
        except Exception: pass

def make_call(lab, ws, cfg):
    preset = cfg.get('_preset') or next(p for p in PRESETS if p['id'] == cfg['preset'])
    if preset.get('s2s'):
        kind = S2S[preset['s2s']]['kind']
        return (GeminiLiveCall if kind == 'gemini_live' else AzureRealtimeCall)(lab, ws, cfg, preset)
    return CascadeCall(lab, ws, cfg, preset)
