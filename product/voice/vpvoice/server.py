# The runtime's HTTP surface (aiohttp):
#   POST /v1/calls                 signed CallTicket -> 202 with join info (idempotent on conversationId)
#   POST /v1/calls/{id}/end        signed; ends the call (control plane hang-up, runaway stop)
#   GET  /v1/calls/{id}            signed (empty body); the runtime's view of one call
#   GET  /v1/health                no secrets: version, stacks and whether their credentials are configured
#   GET  /v1/media/browser/{id}    websocket, single-use ?token= : the browser test call ('webrtc')
#   GET  /v1/media/sim/{id}        websocket, single-use ?token= : the text-mode simulated caller ('sim')
#   POST /v1/media/sip/answer/{id}/{hook}   carrier answer webhook -> stream XML
#   POST /v1/media/sip/hangup/{id}/{hook}   carrier hang-up webhook
#   POST /v1/media/sip/transfer/{id}/{hook} carrier transfer webhook -> Dial XML (hand-off to a human)
#   GET  /v1/media/sip/stream/{id} websocket, single-use ?token= : the carrier's media stream ('sip')
import asyncio, hashlib, hmac, json, logging, os, secrets, time
import aiohttp
from aiohttp import web
from . import RUNTIME_VERSION, signing, stacks
from . import ticket as tk
from .events import EventSink, HttpPoster
from .providers import ProviderUnavailable, build

log = logging.getLogger('vp.voice.server')
JOIN_TTL_S = 600


def ws_base(url): return url.replace('https://', 'wss://', 1).replace('http://', 'ws://', 1)


class CallRecord:
    def __init__(self, ticket, body_hash, comp, sink, token, join):
        self.t = ticket; self.body_hash = body_hash; self.comp = comp; self.sink = sink; self.token = token; self.join = join
        self.token_used = False; self.created = time.time(); self.session = None; self.ended_at = None
        self.call_uuid = None; self.request_uuid = None; self.transfer_to = None
        self.live_tokens = {}          # single-use join tokens for listen / takeover sockets: token -> (kind, expires)

    def take_token(self, given):
        if self.token_used or self.session is not None or self.ended_at or time.time() - self.created > JOIN_TTL_S: return False
        if not given or not hmac.compare_digest(given.encode(), self.token.encode()): return False
        self.token_used = True
        return True


class Runtime:
    def __init__(self, env=None, make_components=None, make_poster=None, clock=time.monotonic, watchdog_s=0.25):
        self.env = dict(os.environ) if env is None else env
        self.secret = self.env.get('VP_RUNTIME_SECRET', '')
        self.public = (self.env.get('VP_PUBLIC_URL') or '').rstrip('/')
        self.control = (self.env.get('VP_CONTROL_URL') or '').rstrip('/')
        self.make_components = make_components or (lambda sid, voice, t, http, env: build(stacks.resolve(t['stack']), voice, http, env, text_only=t['transport']['kind'] == 'sim'))
        self.make_poster = make_poster or (lambda http: HttpPoster(http, self.control, self.secret))
        self.clock = clock; self.watchdog_s = watchdog_s
        self.calls = {}; self.http = None
        # admission: one process carries at most this many calls (measured knee ~25 on a 4-vCPU host, bench/results/);
        # past it a ticket is refused before any record, sink or event, so the dialer can place it elsewhere or later
        self.max_calls = max(1, int(self.env.get('VP_MAX_CALLS_PER_PROCESS') or 20))
        self.retry_after_s = max(1, int(self.env.get('VP_RETRY_AFTER_S') or 5))
        self.worker = self.env.get('VP_WORKER_ID') or None

    # ---------------------------------------------------------------- helpers
    def hook(self, cid, what):
        return hmac.new(self.secret.encode(), f'{what}:{cid}'.encode(), hashlib.sha256).hexdigest()[:32]

    async def verified(self, req):
        body = await req.read()
        try:
            signing.verify(self.secret, req.headers.get(signing.HEADER), body)
        except signing.SignatureError as e:
            raise web.HTTPUnauthorized(text=json.dumps({'error': 'bad_signature', 'message': str(e)}), content_type='application/json')
        return body

    def err(self, status, code, message, **extra):
        return web.json_response({'error': code, 'message': message, **extra}, status=status)

    def admitted(self):
        """Calls holding a slot: accepted and not yet ended (an unjoined call holds one until it joins or expires)."""
        return sum(1 for r in self.calls.values() if r.ended_at is None and not (r.session is not None and r.session.ended))

    def gc(self):
        for cid, r in list(self.calls.items()):
            if r.ended_at and time.time() - r.ended_at > 600: self.calls.pop(cid, None)
            elif r.session is None and not r.token_used and time.time() - r.created > JOIN_TTL_S and r.ended_at is None:
                asyncio.ensure_future(self._end_unjoined(r, 'no_answer'))

    def new_session(self, rec, line=None, transport=None):
        from .session import SimSession
        kind = transport or rec.t['transport']['kind']
        if kind == 'sim':
            s = SimSession(rec.t, rec.comp, rec.sink, clock=self.clock, env=self.env, watchdog_s=self.watchdog_s)
        elif rec.comp.kind == 's2s':
            from .s2s import LiveSession
            s = LiveSession(rec.t, rec.comp, rec.sink, line, clock=self.clock, env=self.env, watchdog_s=self.watchdog_s, transport=kind)
        else:
            from .cascade import CascadeSession
            s = CascadeSession(rec.t, rec.comp, rec.sink, line, clock=self.clock, env=self.env, watchdog_s=self.watchdog_s, transport=kind)
        if kind == 'sip':
            s.telephony = (rec.t['transport']['trunk'].lower(), rec.t['direction'])
            s.transfer = lambda k, v, rec=rec: self.transfer(rec, k, v)
        rec.session = s
        asyncio.ensure_future(self._mark_ended(rec))
        return s

    async def _mark_ended(self, rec):
        await rec.session.done.wait(); rec.ended_at = time.time()

    async def _end_unjoined(self, rec, reason):
        rec.token_used = True                          # nobody may join a call that has ended
        if rec.ended_at or (rec.session is not None and rec.session.ended): return
        if rec.session is None: self.new_session(rec, line=_NullLine())
        await rec.session.end(reason)

    # ---------------------------------------------------------------- control plane routes
    async def create_call(self, req):
        body = await self.verified(req)
        try:
            t = json.loads(body)
        except ValueError:
            return self.err(400, 'bad_json', 'body is not JSON')
        try:
            stack, voice = tk.validate(t)
        except tk.TicketError as e:
            return self.err(e.status, e.code, str(e))
        cid = t['conversationId']; bh = hashlib.sha256(json.dumps(t, sort_keys=True).encode()).hexdigest()
        prior = self.calls.get(cid)
        if prior is not None:           # a retried ticket gets the same answer; a different one under the same id does not
            if prior.body_hash != bh: return self.err(409, 'conflict', 'a different ticket already holds this conversationId')
            return web.json_response({'conversationId': cid, 'status': 'accepted', 'join': prior.join}, status=202)
        tr = t['transport']
        if tr['kind'] == 'sip' and tr['trunk'].lower() not in ('plivo', 'exotel'):
            return self.err(422, 'unsupported_trunk', f"trunk {tr['trunk']!r} is not supported (plivo, exotel)")
        if tr['kind'] == 'sip' and t['direction'] == 'outbound' and tr['trunk'].lower() != 'plivo':
            return self.err(422, 'unsupported_trunk', 'outbound dialling is implemented for plivo only; exotel streams inbound')
        if tr['kind'] != 'sim' and not self.public:
            return self.err(503, 'not_configured', 'VP_PUBLIC_URL is not set, so no media URL can be offered')
        self.gc()
        if self.admitted() >= self.max_calls:     # nothing below may await before the record is stored, so the count holds
            return web.json_response({'error': 'at_capacity', 'message': f'this runtime process carries {self.max_calls} calls; retry later',
                                      'retryAfterS': self.retry_after_s, 'placed': False},
                                     status=503, headers={'Retry-After': str(self.retry_after_s)})
        try:
            comp = self.make_components(t['stack']['id'], voice, t, self.http, self.env)
        except ProviderUnavailable as e:
            return self.err(503, 'stack_unavailable', str(e), missing=e.missing)
        sink = EventSink(cid, self.make_poster(self.http))
        token = secrets.token_urlsafe(24)
        exp = int((time.time() + JOIN_TTL_S) * 1000)
        if tr['kind'] == 'sim':
            join = {'kind': 'sim', 'url': ws_base(self.public or 'ws://localhost') + f'/v1/media/sim/{cid}', 'token': token, 'expiresAtMs': exp}
        elif tr['kind'] == 'webrtc':
            join = {'kind': 'webrtc', 'url': ws_base(self.public) + f'/v1/media/browser/{cid}', 'token': token, 'expiresAtMs': exp,
                    'offerUrl': tr['offerUrl'], 'audio': {'up': 'pcm16le/16000/mono', 'down': 'u32le reply id + pcm16le/24000/mono'}}
        else:
            stream = ws_base(self.public) + f'/v1/media/sip/stream/{cid}?token={token}'
            join = {'kind': 'sip', 'trunk': tr['trunk'].lower(), 'expiresAtMs': exp,
                    'answerUrl': f'{self.public}/v1/media/sip/answer/{cid}/{self.hook(cid, "answer")}',
                    'hangupUrl': f'{self.public}/v1/media/sip/hangup/{cid}/{self.hook(cid, "hangup")}'}
            if t['direction'] == 'inbound': join['streamUrl'] = stream
        rec = CallRecord(t, bh, comp, sink, token, join)
        self.calls[cid] = rec
        if tr['kind'] == 'sip' and t['direction'] == 'outbound':
            from .transports import plivo_dial
            ru, e = await plivo_dial(self.http, self.env, tr['to'], tr['from'], join['answerUrl'], join['hangupUrl'], t['limits']['maxDurationS'])
            if e:
                await self._end_unjoined(rec, 'failed')
                return self.err(502, 'dial_failed', e)
            rec.request_uuid = ru; join['status'] = 'dialing'
        return web.json_response({'conversationId': cid, 'status': 'accepted', 'join': join}, status=202)

    async def end_call(self, req):
        body = await self.verified(req)
        cid = req.match_info['id']
        try: d = json.loads(body or b'')
        except ValueError: d = None
        # the body names the call, so a signature captured for another request or call cannot end this one
        if not isinstance(d, dict) or d.get('conversationId') != cid:
            return self.err(400, 'bad_request', 'body must be {"conversationId": <this call>, "endReason"?}')
        rec = self.calls.get(cid)
        if rec is None: return self.err(404, 'not_found', 'no such call')
        reason = d.get('endReason') if d.get('endReason') in ('completed', 'max_duration', 'max_cost', 'error', 'handed_off') else 'completed'
        if rec.session is None: task = asyncio.ensure_future(self._end_unjoined(rec, reason))
        else: task = asyncio.ensure_future(rec.session.end(reason))
        await asyncio.sleep(0)                         # the end reason is set at once; delivery of call.ended continues
        if rec.call_uuid or rec.request_uuid: asyncio.ensure_future(self.carrier_hangup(rec))
        return web.json_response({'ok': True, 'endReason': rec.session.ended if rec.session else reason})

    async def call_status(self, req):
        await self.verified(req)
        rec = self.calls.get(req.match_info['id'])
        if rec is None: return self.err(404, 'not_found', 'no such call')
        s = rec.session
        return web.json_response({'conversationId': rec.t['conversationId'], 'joined': rec.token_used, 'ended': s.ended if s else None,
                                  'error': s.error if s else None, 'seq': rec.sink.seq, 'undelivered': rec.sink.undelivered,
                                  'costInrMilli': s.meter.total_milli() if s else 0,
                                  **({'timing': s.timing_summary()} if s is not None and hasattr(s, 'timing_summary') else {})})

    # ---------------------------------------------------------------- live controls (supervisor listen, whisper, takeover)
    def live_err(self, status, reason):
        return web.json_response({'ok': False, 'reason': reason}, status=status)

    def live_join(self, rec, kind):
        token = secrets.token_urlsafe(24); exp = time.time() + JOIN_TTL_S
        rec.live_tokens = {k: v for k, v in rec.live_tokens.items() if v[1] > time.time()}
        rec.live_tokens[token] = (kind, exp)
        return {'kind': kind, 'url': ws_base(self.public or 'ws://localhost') + f"/v1/media/{kind}/{rec.t['conversationId']}", 'token': token,
                'expiresAtMs': int(exp * 1000)}

    async def live_control(self, req):
        """Signed like /end; the body names the call (the replay guard). The control plane audits who and when."""
        body = await self.verified(req)
        cid = req.match_info['id']; action = req.match_info['action']
        try: d = json.loads(body or b'')
        except ValueError: d = None
        if not isinstance(d, dict) or d.get('conversationId') != cid: return self.live_err(400, 'body must name this call: {"conversationId": ...}')
        rec = self.calls.get(cid)
        if rec is None: return self.live_err(404, 'no such call')
        s = rec.session
        if s is None or not rec.token_used: return self.live_err(409, 'call is not joined')
        if not s.live(): return self.live_err(409, 'call is not live')
        if rec.comp.kind == 's2s' and s.transport != 'sim':
            return self.live_err(409, 'live controls are not available on the speech-to-speech stack yet')
        if action == 'listen':
            if s.transport == 'sim': return self.live_err(409, 'a sim call has no audio to listen to')
            return web.json_response({'ok': True, 'join': self.live_join(rec, 'listen')})
        if action == 'whisper':
            text = d.get('text')
            if not isinstance(text, str) or not text.strip(): return self.live_err(422, 'text is required')
            why = s.whisper(text)
            return self.live_err(409, why) if why else web.json_response({'ok': True})
        member = d.get('memberId')
        if not isinstance(member, str) or not member.strip() or len(member) > 100: return self.live_err(422, 'memberId is required')
        if s.taken_over: return self.live_err(409, 'the call has already been taken over')
        join = self.live_join(rec, 'takeover')
        asyncio.ensure_future(s.takeover(member.strip())); await asyncio.sleep(0)     # she is stopped at once; the line plays on
        return web.json_response({'ok': True, 'join': join})

    def _live_socket(self, req, kind):
        rec = self.calls.get(req.match_info['id']); tok = req.query.get('token') or ''
        ent = rec.live_tokens.pop(tok, None) if rec is not None and tok else None
        if ent is None or ent[0] != kind or time.time() > ent[1] or rec.session is None or not rec.session.live():
            raise web.HTTPForbidden(text='join refused')
        return rec.session

    async def media_listen(self, req):
        """Receive-only: both legs mixed, pcm16le 16 kHz mono. What a listener sends is dropped; nothing is recorded."""
        s = self._live_socket(req, 'listen')
        ws = web.WebSocketResponse(heartbeat=20); await ws.prepare(req)
        async def send(b):
            if not ws.closed:
                try: await ws.send_bytes(b)
                except Exception: pass
        s.listener_added(send); s.live_closers.append(ws.close)
        try:
            await ws.send_json({'t': 'ready', 'audio': 'pcm16le/16000/mono, both legs mixed'})
            async for _ in ws: pass
        finally:
            s.listener_removed(send)
            if ws.close in s.live_closers: s.live_closers.remove(ws.close)
        return ws

    async def media_takeover(self, req):
        """The member who took over: mic up (pcm16le 16 kHz), the caller down (pcm16le 16 kHz). Sim calls: text,
        {"t": "say", "text"} up and {"t": "caller", "text"} down. {"t": "hangup"} ends the call; a drop closes it."""
        s = self._live_socket(req, 'takeover')
        ws = web.WebSocketResponse(max_msg_size=4 * 1024 * 1024, heartbeat=20); await ws.prepare(req)
        sim = s.transport == 'sim'
        async def send(x):
            if ws.closed: return
            try: await (ws.send_json(x) if isinstance(x, dict) else ws.send_bytes(x))
            except Exception: pass
        s.member_joined(send); s.live_closers.append(ws.close); hung_up = False
        try:
            await ws.send_json({'t': 'ready', 'conversationId': s.id,
                                'audio': None if sim else {'up': 'pcm16le/16000/mono', 'down': 'pcm16le/16000/mono (the caller)'}})
            async for m in ws:
                if s.ended: break
                if m.type == aiohttp.WSMsgType.BINARY and not sim: await s.member_audio(m.data)
                elif m.type == aiohttp.WSMsgType.TEXT:
                    d = json.loads(m.data)
                    if d.get('t') == 'hangup': hung_up = True; break
                    if d.get('t') == 'say' and sim: await s.member_says(d.get('text'))
        except Exception:
            log.exception('takeover media')
        finally:
            if ws.close in s.live_closers: s.live_closers.remove(ws.close)
            if not s.ended:
                if hung_up: await s.end('handed_off')
                else: await s.member_dropped()
        return ws

    async def health(self, req):
        from .providers.google import GoogleRoute, unavailable
        route = GoogleRoute(self.env)
        st = {sid: {'missing': stacks.missing_credentials(sid, self.env), 'status': s['status']} for sid, s in stacks.STACKS.items()}
        for sid, v in st.items():
            v['reason'] = None if v['missing'] else unavailable(sid, route)
            v['available'] = not v['missing'] and not v['reason']
        from .providers import components
        return web.json_response({'ok': True, 'runtimeVersion': RUNTIME_VERSION, 'signing': bool(self.secret), 'control': bool(self.control),
                                  'stacks': st, 'components': components.health(self.env, route),
                                  'customStacks': True,      # tickets with stack.id 'custom' run their own parts (stacks.resolve)
                                  'activeCalls': sum(1 for r in self.calls.values() if r.session and not r.session.ended),
                                  'capacity': {'admitted': (n := self.admitted()), 'max': self.max_calls, 'free': max(0, self.max_calls - n)},
                                  'live': {'listeners': sum(len(r.session.listeners) for r in self.calls.values() if r.session and not r.session.ended),
                                           'takeovers': sum(1 for r in self.calls.values() if r.session and not r.session.ended and r.session.taken_over)},
                                  **({'worker': self.worker} if self.worker else {})})

    # ---------------------------------------------------------------- media: browser and sim
    def _join(self, req, kind):
        rec = self.calls.get(req.match_info['id'])
        if rec is None or rec.t['transport']['kind'] != kind or not rec.take_token(req.query.get('token')):
            raise web.HTTPForbidden(text='join refused')
        return rec

    async def media_browser(self, req):
        rec = self._join(req, 'webrtc')
        from .transports import BrowserLine
        ws = web.WebSocketResponse(max_msg_size=4 * 1024 * 1024, heartbeat=20); await ws.prepare(req)
        line = BrowserLine(ws); s = self.new_session(rec, line)
        try:
            await line.send_json({'t': 'ready', 'conversationId': rec.t['conversationId'], 'combinationId': rec.comp.combination_id})
            await s.start()
            async for m in ws:
                if s.ended: break
                if m.type == aiohttp.WSMsgType.BINARY: await s.on_mic(m.data)
                elif m.type == aiohttp.WSMsgType.TEXT:
                    d = json.loads(m.data)
                    if d.get('t') == 'hangup': break
        except Exception as e:
            log.exception('browser media')
            if not s.ended: await s.end('error', error='media: ' + repr(e)[:200])
        finally:
            if not s.ended: await s.end('caller_hung_up')
        return ws

    async def media_sim(self, req):
        rec = self._join(req, 'sim')
        ws = web.WebSocketResponse(heartbeat=20); await ws.prepare(req)
        s = self.new_session(rec)
        async def push(obj):
            if not ws.closed:
                try: await ws.send_json(obj)
                except Exception: pass
        s.push = push
        try:
            opening = await s.start()
            await ws.send_json({'t': 'agent', 'sentences': opening, 'ended': s.ended})
            async for m in ws:
                if m.type != aiohttp.WSMsgType.TEXT: continue
                d = json.loads(m.data)
                if d.get('t') == 'hangup': break
                if d.get('t') == 'say':
                    out = await s.caller_says(str(d.get('text') or ''))
                    await ws.send_json({'t': 'agent', 'sentences': out, 'ended': s.ended})
                if s.ended: break
        except Exception as e:
            log.exception('sim media')
            if not s.ended: await s.end('error', error='sim: ' + repr(e)[:200])
        finally:
            if not s.ended: await s.end('caller_hung_up')
            await ws.close()
        return ws

    # ---------------------------------------------------------------- media: telephony
    def _hooked(self, req, what):
        rec = self.calls.get(req.match_info['id'])
        if rec is None or not hmac.compare_digest(req.match_info['hook'], self.hook(req.match_info['id'], what)): raise web.HTTPForbidden()
        return rec

    async def sip_answer(self, req):
        rec = self._hooked(req, 'answer')
        from .transports import answer_xml
        f = await req.post() if req.content_type.startswith('application/x-www-form') else {}
        rec.call_uuid = f.get('CallUUID') or rec.call_uuid
        url = ws_base(self.public) + f"/v1/media/sip/stream/{rec.t['conversationId']}?token={rec.token}"
        return web.Response(text=answer_xml(url, rec.t['limits']['maxDurationS']), content_type='application/xml')

    async def sip_hangup(self, req):
        rec = self._hooked(req, 'hangup')
        f = await req.post() if req.content_type.startswith('application/x-www-form') else {}
        cause = (f.get('HangupCauseName') or f.get('HangupCause') or '').lower()
        if rec.session is None or not rec.token_used:
            reason = 'busy' if 'busy' in cause else 'no_answer' if ('answer' in cause or 'timeout' in cause or 'cancel' in cause) else 'failed'
            await self._end_unjoined(rec, reason)
        elif not rec.session.ended:
            await rec.session.end('caller_hung_up')
        return web.Response(text='ok')

    async def sip_transfer(self, req):
        rec = self._hooked(req, 'transfer')
        from .transports import transfer_xml
        if not rec.transfer_to: raise web.HTTPNotFound()
        return web.Response(text=transfer_xml(rec.transfer_to), content_type='application/xml')

    async def transfer(self, rec, kind, value):
        """Bridge the caller to the workspace's own number (Plivo). False when the transport or target can't."""
        if kind != 'phone' or not value or rec.t['transport']['trunk'].lower() != 'plivo' or not rec.call_uuid: return False
        from .transports import plivo_request
        rec.transfer_to = value
        st, _ = await plivo_request(self.http, self.env, 'POST', f'Call/{rec.call_uuid}/',
                                    {'legs': 'aleg', 'aleg_url': f"{self.public}/v1/media/sip/transfer/{rec.t['conversationId']}/{self.hook(rec.t['conversationId'], 'transfer')}",
                                     'aleg_method': 'POST'})
        if st not in (200, 202): return False
        await rec.session.end('handed_off')
        return True

    async def carrier_hangup(self, rec):
        if rec.t['transport'].get('kind') != 'sip' or rec.t['transport']['trunk'].lower() != 'plivo': return
        from .transports import plivo_request
        try:
            if rec.call_uuid: await plivo_request(self.http, self.env, 'DELETE', f'Call/{rec.call_uuid}/')
            elif rec.request_uuid: await plivo_request(self.http, self.env, 'DELETE', f'Request/{rec.request_uuid}/')
        except Exception as e:
            log.warning('carrier hang-up: %r', e)

    async def sip_stream(self, req):
        rec = self.calls.get(req.match_info['id'])
        if rec is None or rec.t['transport']['kind'] != 'sip' or not rec.take_token(req.query.get('token')): raise web.HTTPForbidden()
        from .transports import LINES
        ws = web.WebSocketResponse(max_msg_size=4 * 1024 * 1024, heartbeat=20); await ws.prepare(req)
        line = LINES[rec.t['transport']['trunk'].lower()](ws); s = None
        try:
            while True:                               # the carrier sends 'start' (after 'connected' on Exotel) first
                m = await ws.receive(timeout=15)
                if m.type != aiohttp.WSMsgType.TEXT: return ws
                d = json.loads(m.data); line.on_event(d)
                if d.get('event') == 'start':
                    rec.call_uuid = rec.call_uuid or (d.get('start') or {}).get('callId'); break
            s = self.new_session(rec, line)
            await s.start()
            async for m in ws:
                if s.ended: break
                if m.type != aiohttp.WSMsgType.TEXT: continue
                pcm = line.on_event(json.loads(m.data))
                if pcm == 'stop': break
                if pcm: await s.on_mic(pcm)
        except asyncio.TimeoutError:
            log.warning('carrier stream never started for %s', rec.t['conversationId'])
        except Exception as e:
            log.exception('sip media')
            if s and not s.ended: await s.end('error', error='sip: ' + repr(e)[:200])
        finally:
            if s is None: await self._end_unjoined(rec, 'failed')
            elif not s.ended: await s.end('caller_hung_up')
            asyncio.ensure_future(self.carrier_hangup(rec))
        return ws

    # ---------------------------------------------------------------- app
    def app(self):
        a = web.Application(client_max_size=2 * 1024 * 1024)
        a.router.add_post('/v1/calls', self.create_call)
        a.router.add_post('/v1/calls/{id}/end', self.end_call)
        a.router.add_post('/v1/calls/{id}/{action:listen|whisper|takeover}', self.live_control)
        a.router.add_get('/v1/calls/{id}', self.call_status)
        a.router.add_get('/v1/health', self.health)
        a.router.add_get('/v1/media/browser/{id}', self.media_browser)
        a.router.add_get('/v1/media/sim/{id}', self.media_sim)
        a.router.add_get('/v1/media/listen/{id}', self.media_listen)
        a.router.add_get('/v1/media/takeover/{id}', self.media_takeover)
        a.router.add_post('/v1/media/sip/answer/{id}/{hook}', self.sip_answer)
        a.router.add_post('/v1/media/sip/hangup/{id}/{hook}', self.sip_hangup)
        a.router.add_post('/v1/media/sip/transfer/{id}/{hook}', self.sip_transfer)
        a.router.add_get('/v1/media/sip/stream/{id}', self.sip_stream)
        a.on_startup.append(self._startup); a.on_shutdown.append(self._shutdown)
        return a

    async def _startup(self, app):
        if self.http is None: self.http = aiohttp.ClientSession()
        if not self.secret: log.error('VP_RUNTIME_SECRET is not set: every signed request will be refused')

    async def _shutdown(self, app):
        for rec in list(self.calls.values()):
            if rec.session and not rec.session.ended: await rec.session.end('error', error='runtime shutting down')
        if self.http is not None: await self.http.close()


class _NullLine:
    closed = True
    async def send_audio(self, rid, pcm24): pass
    async def flush(self, rid): pass
    async def send_json(self, obj): pass
    async def close(self): pass


def main():
    logging.basicConfig(level=os.environ.get('VP_LOG_LEVEL', 'INFO'), format='%(asctime)s %(levelname)s %(name)s %(message)s')
    rt = Runtime()
    web.run_app(rt.app(), host=os.environ.get('VP_BIND') or '0.0.0.0', port=int(os.environ.get('PORT', '8080')))
