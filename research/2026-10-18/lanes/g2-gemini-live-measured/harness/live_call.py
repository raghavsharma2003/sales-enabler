# g2-gemini-live-measured (2026-10-18): scripted Gemini Live (BidiGenerateContent) phone-call simulator.
#
# What it does
# - Opens one Live session (WebSocket), sends a fixed persona as systemInstruction, then plays synthetic caller
#   clips (16 kHz PCM16, phone-band by default) at real-time pace in 20 ms frames on a CONTINUOUS line: between
#   clips it keeps sending low-level comfort noise, as a phone line would. Server-side automatic VAD decides turns.
# - Simulates a real-time player for the agent audio (24 kHz PCM16): the caller only starts the next clip after the
#   agent's audio would have finished playing, plus a short reaction gap.
# - Logs every server message (minus audio payload) with a monotonic timestamp, every usageMetadata block, every
#   transcription fragment, interruptions, goAway and resumption updates, and a per-turn table.
# - Survives the ~10 min connection limit with session resumption (reconnect with the last handle at a quiet moment).
#
# Secrets: the API key is read at runtime from the env var GEMINI_API_KEY (or the scratchpad env file); never
# printed or written. Output: <out>/<tag>/{messages.jsonl, turns.jsonl, usage.jsonl, meta.json, call.wav}.
import argparse, asyncio, base64, json, os, random, sys, time, wave, struct
import numpy as np
import websockets

SR_IN, SR_OUT = 16000, 24000
FRAME_MS = 20
FRAME_SAMPLES = SR_IN * FRAME_MS // 1000
HERE = os.path.dirname(os.path.abspath(__file__))

def load_key():
    k = os.environ.get('GEMINI_API_KEY')
    if k: return k
    p = os.environ.get('GEMINI_ENV_FILE', '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/vp-gemini-or.env')
    env = dict(l.strip().split('=', 1) for l in open(p) if '=' in l and not l.startswith('#'))
    return env['GEMINI_TEST_KEY']

def ws_url(api):
    return f'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.{api}.GenerativeService.BidiGenerateContent'

# ---------------------------------------------------------------- caller scripts
# Battery turn ids (l4b battery). 'silence' turns send 5 s of line noise only.
PERSONA_TURNS = {
    'P1': ['P1_t01', 'P1_t02', 'P1_t03', 'P1_t04', 'P1_t05', 'P1_t06', 'SIL5', 'P1_t08', 'P1_t09', 'P1_t10', 'P1_t11'],
    'P2': ['P2_t01', 'P2_t02', 'P2_t03', 'P2_t04', 'P2_t05', 'P2_t06', 'SIL5', 'P2_t08', 'P2_t09', 'P2_t10', 'P2_t11'],
    'P3': ['P3_t01', 'P3_t02', 'P3_t03', 'P3_t04', 'P3_t05', 'P3_t06', 'P3_t07', 'SIL5', 'P3_t09', 'P3_t10', 'P3_t11'],
    'P4': ['P4_t01', 'P4_t02', 'P4_t03', 'P4_t04', 'P4_t05', 'P4_t06', 'SIL5', 'P4_t08', 'P4_t09', 'P4_t10', 'P4_t11'],
}

def build_script(spec, minutes):
    """spec: 'P1' (persona cycle), 'P1+P4' (alternate persona middles), 'PAUSE' (elderly pause probe), 'W' (worried scene),
    or an explicit comma list of clip ids. Returns (opener, loop_list, closer)."""
    if spec == 'PAUSE':
        # elderly caller; the 2.42 s mid-sentence pause clip P4_t03 recurs every other turn
        return 'P4_t01', ['P4_t03', 'P4_t02', 'P4_t03', 'P4_t08', 'P4_t03', 'P4_t04', 'P4_t03', 'P4_t09'], 'P4_t11'
    if spec.startswith('W'):
        return 'W_t01', ['W_t02', 'W_t03', 'W_t04', 'W_t05', 'W_t06', 'W_t07'], 'W_t08'
    if ',' in spec:
        ids = spec.split(',')
        return ids[0], ids[1:-1], ids[-1]
    personas = spec.split('+')
    first = PERSONA_TURNS[personas[0]]
    mids = []
    for p in personas:
        mids += PERSONA_TURNS[p][1:-1]
    return first[0], mids, first[-1]

# ---------------------------------------------------------------- audio helpers
class Line:
    """Continuous caller line: returns 20 ms frames; plays clips when queued, comfort noise otherwise."""
    def __init__(self, seed):
        self.rng = np.random.default_rng(seed)
        self.clip = None; self.pos = 0
        self.sent = []  # (t_rel, kind) per clip-frame, kept small: only clip boundaries
    def noise(self):
        return (self.rng.normal(0, 6.0, FRAME_SAMPLES)).astype(np.int16)  # ~ -75 dBFS comfort noise
    def next_frame(self):
        if self.clip is not None:
            f = self.clip[self.pos:self.pos + FRAME_SAMPLES]
            self.pos += FRAME_SAMPLES
            last = self.pos >= len(self.clip)
            if len(f) < FRAME_SAMPLES:
                f = np.concatenate([f, self.noise()[:FRAME_SAMPLES - len(f)]])
            if last:
                self.clip = None
            return f, True, last
        return self.noise(), False, False

def load_clip(audio_dir, cid):
    if cid.startswith('SIL'):
        secs = float(cid[3:] or 5)
        return None, secs
    raw = open(os.path.join(audio_dir, cid + '.pcm'), 'rb').read()
    return np.frombuffer(raw, dtype=np.int16).copy(), len(raw) / 2 / SR_IN

# ---------------------------------------------------------------- the call
class Call:
    def __init__(self, a):
        self.a = a
        self.key = load_key()
        self.out = os.path.join(a.out, a.tag); os.makedirs(self.out, exist_ok=True)
        self.persona = open(a.persona, encoding='utf-8').read().strip()
        self.t0 = None
        self.msgf = open(os.path.join(self.out, 'messages.jsonl'), 'w')
        self.usef = open(os.path.join(self.out, 'usage.jsonl'), 'w')
        self.turns = []; self.cur = None
        self.handle = None; self.go_away = None; self.connections = []
        self.play_end = 0.0; self.generating = False; self.last_audio_t = 0.0
        self.agent_chunks = []  # (play_start_rel, bytes)
        self.caller_marks = []  # (t_rel_first_frame, clip_id) for timeline render
        self.caller_frames = []  # (t_rel, int16 frame) only for clip frames
        self.errors = []
        self.closed = asyncio.Event(); self.ready = asyncio.Event()
        self.ws = None; self.stop = False
        self.rng = random.Random(a.seed)
        self.n_frames = 0; self.n_clip_frames = 0
        self.setup_ms = []

    def rel(self):
        return time.perf_counter() - self.t0

    def setup_msg(self):
        a = self.a
        gen = {'responseModalities': ['AUDIO'],
               'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': a.voice}}}}
        if a.lang: gen['speechConfig']['languageCode'] = a.lang
        if a.thinking == 'budget0': gen['thinkingConfig'] = {'thinkingBudget': 0}
        elif a.thinking.startswith('level:'): gen['thinkingConfig'] = {'thinkingLevel': a.thinking.split(':', 1)[1]}
        s = {'model': 'models/' + a.model, 'generationConfig': gen,
             'systemInstruction': {'parts': [{'text': self.persona}]},
             'inputAudioTranscription': {}, 'outputAudioTranscription': {},
             'sessionResumption': ({'handle': self.handle} if self.handle else {})}
        if a.vad == 'meera':
            s['realtimeInputConfig'] = {'automaticActivityDetection': {
                'endOfSpeechSensitivity': 'END_SENSITIVITY_HIGH', 'silenceDurationMs': 300, 'prefixPaddingMs': 60}}
        elif a.vad.startswith('sil'):
            s['realtimeInputConfig'] = {'automaticActivityDetection': {'silenceDurationMs': int(a.vad[3:])}}
        if a.compression == 'default':
            s['contextWindowCompression'] = {'slidingWindow': {}}
        elif a.compression.startswith('on'):
            # on:<trigger>:<target>
            _, trig, targ = a.compression.split(':')
            s['contextWindowCompression'] = {'triggerTokens': int(trig), 'slidingWindow': {'targetTokens': int(targ)}}
        if a.affective: gen['enableAffectiveDialog'] = True  # SDK maps enable_affective_dialog into generationConfig
        if a.proactive: s['proactivity'] = {'proactiveAudio': True}
        return {'setup': s}

    async def connect(self):
        t = time.perf_counter()
        ws = await websockets.connect(ws_url(self.a.api), additional_headers={'x-goog-api-key': self.key},
                                      max_size=None, open_timeout=20, ping_interval=None, compression=None)
        t_open = time.perf_counter()
        await ws.send(json.dumps(self.setup_msg()))
        raw = await asyncio.wait_for(ws.recv(), timeout=20)
        m = json.loads(raw)
        t_setup = time.perf_counter()
        if 'setupComplete' not in m:
            raise RuntimeError('no setupComplete: ' + str(m)[:300])
        self.ws = ws
        rec = {'t': (t - self.t0) if self.t0 else 0, 'ws_open_ms': (t_open - t) * 1000, 'setup_ms': (t_setup - t_open) * 1000,
               'resumed': bool(self.handle)}
        self.connections.append(rec)
        self.go_away = None
        return ws

    def log(self, d):
        self.msgf.write(json.dumps(d, ensure_ascii=False) + '\n')

    def new_turn(self, cid, dur):
        self.cur = {'i': len(self.turns), 'clip': cid, 'clip_s': round(dur, 3), 't_start': None, 't_eos': None,
                    't_first_audio': None, 'latency_ms': None, 'cutin': False, 'cutin_at_ms': None,
                    'audio_during_clip_s': 0.0, 'agent_audio_s': 0.0, 'n_audio_chunks': 0, 'interrupted': 0,
                    't_first_outtx': None, 't_first_outtx_after_eos': None, 'outtx': '', 'intx': '',
                    't_gen_complete': None, 't_turn_complete': None, 'usage': [], 'responses': 0,
                    'audio_before_first_tx_s': None, 'tx_events': []}
        self.turns.append(self.cur)
        return self.cur

    async def receiver(self, ws):
        try:
            async for raw in ws:
                t = self.rel()
                m = json.loads(raw)
                rec = {'t': round(t, 4)}
                sc = m.get('serverContent')
                cur = self.cur
                if sc:
                    mt = sc.get('modelTurn')
                    nbytes = 0
                    if mt:
                        for p in mt.get('parts', []):
                            idata = p.get('inlineData')
                            if idata and idata.get('data'):
                                b = base64.b64decode(idata['data'])
                                nbytes += len(b)
                                self.on_audio(t, b)
                            if 'text' in p:
                                rec['part_text'] = p['text'][:200]
                            if p.get('thought'):
                                rec['thought'] = True
                    if nbytes: rec['audio_bytes'] = nbytes
                    for k in ('turnComplete', 'generationComplete', 'interrupted', 'waitingForInput', 'turnCompleteReason'):
                        if k in sc: rec[k] = sc[k]
                    if 'outputTranscription' in sc:
                        txt = sc['outputTranscription'].get('text', '')
                        rec['outtx'] = txt
                        if cur is not None:
                            cur['outtx'] += txt
                            if cur['t_first_outtx'] is None: cur['t_first_outtx'] = t
                            if cur['t_eos'] is not None and cur['t_first_outtx_after_eos'] is None and t >= cur['t_eos']:
                                cur['t_first_outtx_after_eos'] = t
                            cur['tx_events'].append([round(t, 4), len(txt), round(self.audio_rx_s(cur), 3)])
                    if 'inputTranscription' in sc:
                        txt = sc['inputTranscription'].get('text', '')
                        rec['intx'] = txt
                        if cur is not None: cur['intx'] += txt
                    if sc.get('interrupted'):
                        if cur is not None: cur['interrupted'] += 1
                        self.play_end = min(self.play_end, t)  # player flushes queued audio
                        self.generating = False
                    if sc.get('generationComplete'):
                        self.generating = False
                        if cur is not None: cur['t_gen_complete'] = t
                    if sc.get('turnComplete'):
                        self.generating = False
                        if cur is not None: cur['t_turn_complete'] = t; cur['responses'] += 1
                um = m.get('usageMetadata')
                if um:
                    rec['usage'] = um
                    u = {'t': round(t, 4), 'turn': cur['i'] if cur else None, **um}
                    self.usef.write(json.dumps(u) + '\n'); self.usef.flush()
                    if cur is not None: cur['usage'].append(u)
                if 'goAway' in m:
                    rec['goAway'] = m['goAway']; self.go_away = t
                if 'sessionResumptionUpdate' in m:
                    sru = m['sessionResumptionUpdate']
                    rec['sru'] = {'resumable': sru.get('resumable'), 'has_handle': bool(sru.get('newHandle'))}
                    if sru.get('resumable') and sru.get('newHandle'): self.handle = sru['newHandle']
                if 'voiceActivity' in m:
                    va = m['voiceActivity']; rec['va'] = va
                    if cur is not None: cur.setdefault('va', []).append([round(t, 4), va])
                for k in m:
                    if k not in ('serverContent', 'usageMetadata', 'goAway', 'sessionResumptionUpdate', 'voiceActivity'):
                        rec.setdefault('other', []).append(k)
                        rec.setdefault('other_payload', {})[k] = str(m[k])[:300]
                self.log(rec)
        except websockets.ConnectionClosed as e:
            self.log({'t': round(self.rel(), 4), 'closed': True, 'code': e.code, 'reason': str(e.reason)[:300]})
            if e.code not in (1000,):
                self.errors.append({'t': self.rel(), 'code': e.code, 'reason': str(e.reason)[:300]})
        finally:
            self.closed.set()

    def audio_rx_s(self, cur):
        return cur['agent_audio_s']

    def on_audio(self, t, b):
        dur = len(b) / 2 / SR_OUT
        start = max(self.play_end, t)
        self.play_end = start + dur
        self.agent_chunks.append((start, b))
        self.generating = True; self.last_audio_t = t
        cur = self.cur
        if cur is None: return
        if cur['n_audio_chunks'] == 0 and cur['t_eos'] is None:
            pass
        cur['n_audio_chunks'] += 1
        cur['agent_audio_s'] += dur
        if cur['t_eos'] is None:
            # agent audio while the caller clip is still playing: a cut-in
            cur['audio_during_clip_s'] += dur
            if not cur['cutin']:
                cur['cutin'] = True; cur['cutin_at_ms'] = round((t - cur['t_start']) * 1000, 1)
                cur['t_first_audio_any'] = t
        else:
            if cur['t_first_audio'] is None:
                cur['t_first_audio'] = t
                cur['latency_ms'] = round((t - cur['t_eos']) * 1000, 1)

    async def sender(self, script):
        a = self.a
        opener, loop, closer = script
        line = Line(a.seed)
        audio_dir = a.audio_dir
        target_s = a.minutes * 60
        k = 0; t_next = time.perf_counter()
        state = 'GAP'; gap_until = self.rel() + 0.4
        loop_i = 0; closing = False; done_at = None
        sil_until = None
        queue_ids = [opener]
        while not self.stop:
            # ---- turn controller
            now = self.rel()
            if state == 'GAP' and now >= gap_until and not self.generating and now >= self.play_end:
                if closing and done_at is None and self.cur is not None and self.cur['clip'] == closer:
                    done_at = now + 1.0
                if done_at is None:
                    if queue_ids:
                        cid = queue_ids.pop(0)
                    elif now >= target_s - 15 and not closing:
                        cid = closer; closing = True
                    else:
                        cid = loop[loop_i % len(loop)]; loop_i += 1
                    clip, dur = load_clip(audio_dir, cid)
                    turn = self.new_turn(cid, dur)
                    turn['t_start'] = now
                    if clip is None:
                        state = 'SIL'; sil_until = now + dur
                    else:
                        line.clip = clip; line.pos = 0; state = 'CLIP'
                        self.caller_marks.append((now, cid))
            if state == 'SIL' and now >= sil_until:
                self.cur['t_eos'] = now  # silence turn: 'eos' = end of the silence window
                state = 'WAIT'; self.cur['_wait_from'] = now
            if state == 'WAIT':
                c = self.cur
                responded = c['t_first_audio'] is not None
                if self.generating and now - self.last_audio_t > 6.0:
                    self.generating = False  # missing generationComplete/turnComplete: never wait forever
                    c['missing_gen_complete'] = True
                # wait until reply done (turnComplete seen, playback over) or timeout
                if c['cutin'] and not responded and not self.generating and now >= self.play_end and now - c['_wait_from'] > 3.0:
                    c['no_reply_after_cutin'] = True
                    state = 'GAP'; gap_until = now + a.gap_ms / 1000 + self.rng.uniform(0, a.gap_jitter_ms / 1000)
                elif responded and not self.generating and now >= self.play_end:
                    state = 'GAP'; gap_until = now + a.gap_ms / 1000 + self.rng.uniform(0, a.gap_jitter_ms / 1000)
                elif not responded and now - c['_wait_from'] > (3.0 if c['clip'].startswith('SIL') else a.reply_timeout):
                    c['no_reply'] = True
                    state = 'GAP'; gap_until = now + 0.2
            if done_at is not None and now >= done_at and not self.generating and now >= self.play_end:
                break
            if now > target_s + 120:
                self.errors.append({'t': now, 'reason': 'hard stop: call ran 2 min over target'}); break
            # ---- resumption: rotate at a quiet moment after goAway
            if self.go_away is not None and state == 'GAP' and not self.generating and now >= self.play_end:
                await self.rotate()
                t_next = time.perf_counter()
                continue
            # ---- send one frame on the real-time grid
            frame, is_clip, last = line.next_frame()
            try:
                await self.ws.send(json.dumps({'realtimeInput': {'audio': {
                    'data': base64.b64encode(frame.tobytes()).decode(), 'mimeType': 'audio/pcm;rate=16000'}}}))
            except websockets.ConnectionClosed:
                if self.handle and not self.stop:
                    await self.rotate(forced=True); t_next = time.perf_counter(); continue
                break
            ts = self.rel()
            if self.connections and 'first_frame_t' not in self.connections[-1]:
                self.connections[-1]['first_frame_t'] = ts - FRAME_MS / 1000
            self.n_frames += 1
            if is_clip:
                self.n_clip_frames += 1
                self.caller_frames.append((ts, frame))
                if last:
                    self.cur['t_eos'] = ts; state = 'WAIT'; self.cur['_wait_from'] = ts
                    if self.a.stream_end:
                        await self.ws.send(json.dumps({'realtimeInput': {'audioStreamEnd': True}}))
            t_next += FRAME_MS / 1000
            d = t_next - time.perf_counter()
            if d > 0: await asyncio.sleep(d)
            else: t_next = time.perf_counter()  # fell behind; do not burst
        self.stop = True

    async def rotate(self, forced=False):
        t = self.rel()
        old = self.ws
        try: await old.close()
        except Exception: pass
        await asyncio.sleep(0.05)
        self.closed.clear()
        ws = await self.connect()
        self.connections[-1]['rotate_reason'] = 'forced' if forced else 'goAway'
        self.connections[-1]['rotate_gap_ms'] = round((self.rel() - t) * 1000, 1)
        asyncio.ensure_future(self.receiver(ws))

    async def run(self):
        a = self.a
        self.t0 = time.perf_counter(); self.wall0 = time.time()
        meta = {'args': vars(a), 'wall_start_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'host': os.uname().nodename, 'setup': self.setup_msg()['setup'] | {'systemInstruction': f'<persona {len(self.persona)} chars>'}}
        try:
            ws = await self.connect()
        except Exception as e:
            meta['fatal'] = f'{type(e).__name__}: {str(e)[:500]}'
            json.dump(meta, open(os.path.join(self.out, 'meta.json'), 'w'), indent=1, ensure_ascii=False)
            print('FATAL', meta['fatal'], flush=True)
            return 2
        rx = asyncio.ensure_future(self.receiver(ws))
        try:
            await self.sender(build_script(a.script, a.minutes))
        except Exception as e:
            self.errors.append({'t': self.rel(), 'reason': f'sender {type(e).__name__}: {str(e)[:300]}'})
        t_end = self.rel()
        # drain: allow late usageMetadata
        await asyncio.sleep(1.5)
        try: await self.ws.close()
        except Exception: pass
        await asyncio.sleep(0.2)
        meta.update({'call_s': round(t_end, 3), 'n_frames': self.n_frames, 'n_clip_frames': self.n_clip_frames,
                     'caller_speech_s': round(self.n_clip_frames * FRAME_MS / 1000, 2),
                     'agent_audio_s': round(sum(len(b) for _, b in self.agent_chunks) / 2 / SR_OUT, 2),
                     'connections': self.connections, 'errors': self.errors, 'n_turns': len(self.turns)})
        json.dump(meta, open(os.path.join(self.out, 'meta.json'), 'w'), indent=1, ensure_ascii=False)
        with open(os.path.join(self.out, 'turns.jsonl'), 'w') as f:
            for t in self.turns: f.write(json.dumps(t, ensure_ascii=False) + '\n')
        self.msgf.close(); self.usef.close()
        if a.save_audio: self.render(t_end)
        print(json.dumps({'tag': a.tag, 'call_s': meta['call_s'], 'turns': len(self.turns), 'errors': self.errors[:3],
                          'lat': [t['latency_ms'] for t in self.turns][:60]}), flush=True)
        return 0

    def render(self, t_end):
        """Stereo 16 kHz timeline: L = caller (as sent), R = agent (as a real-time player would play it)."""
        n = int((t_end + 3) * SR_IN)
        L = np.zeros(n, np.int16); R = np.zeros(n, np.float32)
        for ts, fr in self.caller_frames:
            i = int((ts - FRAME_MS / 1000) * SR_IN)
            if 0 <= i < n - FRAME_SAMPLES: L[i:i + FRAME_SAMPLES] = fr
        for st, b in self.agent_chunks:
            x = np.frombuffer(b, np.int16).astype(np.float32)
            y = np.interp(np.arange(0, len(x) * 2 / 3) * 1.5, np.arange(len(x)), x)  # 24k -> 16k
            i = int(st * SR_IN)
            if i < n: R[i:i + len(y)] = y[:max(0, n - i)]
        st = np.stack([L.astype(np.int16), np.clip(R, -32768, 32767).astype(np.int16)], 1)
        with wave.open(os.path.join(self.out, 'call.wav'), 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR_IN); w.writeframes(st.tobytes())

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--model', required=True)
    p.add_argument('--api', default='v1beta')
    p.add_argument('--minutes', type=float, default=1.0)
    p.add_argument('--script', default='P1')
    p.add_argument('--compression', default='off', help='off | default | on:<trigger>:<target>')
    p.add_argument('--vad', default='server', help='server (defaults) | meera | sil<ms>')
    p.add_argument('--thinking', default='none', help='none | budget0 | level:<x>')
    p.add_argument('--voice', default='Despina')
    p.add_argument('--lang', default='')
    p.add_argument('--affective', action='store_true')
    p.add_argument('--proactive', action='store_true')
    p.add_argument('--stream-end', action='store_true', help='send audioStreamEnd after each clip (not a phone-line behaviour)')
    p.add_argument('--audio-dir', default=os.path.join(HERE, 'audio_phone16k'))
    p.add_argument('--persona', default=os.path.join(HERE, 'persona.txt'))
    p.add_argument('--gap-ms', type=float, default=500)
    p.add_argument('--gap-jitter-ms', type=float, default=400)
    p.add_argument('--reply-timeout', type=float, default=10.0)
    p.add_argument('--seed', type=int, default=1)
    p.add_argument('--save-audio', action='store_true')
    p.add_argument('--out', required=True)
    p.add_argument('--tag', required=True)
    a = p.parse_args()
    sys.exit(asyncio.run(Call(a).run()))

if __name__ == '__main__':
    main()
