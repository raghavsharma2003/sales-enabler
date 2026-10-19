# VP voice lab server: static client + REST + one websocket per call. Run: python app.py (env from /opt/voicelab/.env)
import os, sys, json, time, asyncio, hmac, glob, logging, datetime
from collections import defaultdict
import aiohttp
from aiohttp import web
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from catalog import PRESETS, BRAINS, TTS, S2S, STT, SCENARIOS, FX, enabled
from persona import MEMORY_PROMPT
import providers as pv
from calls import make_call

DATA = os.environ.get('LAB_DATA', os.path.join(HERE, '..', 'data'))
WEB = os.path.join(HERE, '..', 'web')
PASS = os.environ.get('LAB_PASSCODE', '')
DAILY_USD = float(os.environ.get('LAB_DAILY_USD', '15'))
log = logging.getLogger('lab')

class Lab:
    def __init__(self):
        os.makedirs(f'{DATA}/calls', exist_ok=True); os.makedirs(f'{DATA}/memory', exist_ok=True)
        self.http = None; self.calls = {}
    def spend_add(self, usd):
        with open(f'{DATA}/spend.jsonl', 'a') as f: f.write(json.dumps({'ts': time.time(), 'usd': usd}) + '\n')
    def spend_today(self):
        day0 = datetime.datetime.combine(datetime.date.today(), datetime.time()).timestamp(); tot = 0.0
        try:
            for l in open(f'{DATA}/spend.jsonl'):
                d = json.loads(l)
                if d['ts'] >= day0: tot += d['usd']
        except FileNotFoundError: pass
        return tot
    def mem_path(self, tester, scen):
        safe = ''.join(ch for ch in tester.lower() if ch.isalnum() or ch in '-_')[:40] or 'anon'
        return f'{DATA}/memory/{safe}__{scen}.json'
    def memory_get(self, tester, scen):
        try: return json.load(open(self.mem_path(tester, scen))).get('facts', [])
        except Exception: return []
    def memory_put(self, tester, scen, facts):
        old = self.memory_get(tester, scen); seen = set(x.lower() for x in old)
        merged = old + [f for f in facts if f.lower() not in seen]
        json.dump({'facts': merged[-30:], 'updated': time.time()}, open(self.mem_path(tester, scen), 'w'), ensure_ascii=False, indent=1)
LAB = Lab()

def authed(req):
    k = req.headers.get('x-lab-key') or req.query.get('k') or ''
    return bool(PASS) and hmac.compare_digest(k, PASS)

@web.middleware
async def auth_mw(req, handler):
    if (req.path.startswith('/api/') or req.path == '/ws') and req.path != '/api/ping' and not authed(req):
        return web.json_response({'error': 'passcode'}, status=401)
    resp = await handler(req)
    if req.path.startswith('/api/'): resp.headers['Cache-Control'] = 'no-store'
    return resp

async def index(req): return web.FileResponse(os.path.join(WEB, 'index.html'), headers={'Cache-Control': 'no-cache'})
async def ping(req): return web.json_response({'ok': True})

async def catalog(req):
    return web.json_response({
        'presets': [{**{k: v for k, v in p.items() if k != 'needs'}, 'enabled': enabled(p), 'needs': p.get('needs')} for p in PRESETS],
        'brains': {k: {'label': v['label'], 'in': v['in'], 'out': v['out'], 'ttft_ms': v.get('ttft_ms')} for k, v in BRAINS.items()},
        'tts': {k: {'label': v['label'], 'voices': v['voices'], 'default': v['default_voice']} for k, v in TTS.items()},
        's2s': {k: {'label': v['label'], 'voices': v['voices'], 'default': v['voice']} for k, v in S2S.items()},
        'stt': {k: {'label': v['label']} for k, v in STT.items()},
        'scenarios': SCENARIOS, 'fx': FX,
        'spend_today_usd': round(LAB.spend_today(), 3), 'daily_cap_usd': DAILY_USD,
        'gemini': {'free_ok': time.time() >= pv.GKEYS.free_blocked_until, 'paid_left_usd': round(pv.GKEYS.paid_cap - pv.GKEYS.paid_spent, 3)}})

def load_calls():
    out = []
    for p in sorted(glob.glob(f'{DATA}/calls/*/meta.json')):
        try: out.append(json.load(open(p)))
        except Exception: pass
    return out
def load_ratings():
    r = {}
    try:
        for l in open(f'{DATA}/ratings.jsonl'):
            d = json.loads(l); r[d['call_id']] = d     # latest rating per call wins
    except FileNotFoundError: pass
    return r

async def calls_list(req):
    rs = load_ratings(); out = []; who = req.query.get('tester')
    for c in load_calls():
        if who and c.get('tester') != who: continue
        c2 = {k: c.get(k) for k in ('id', 'tester', 'preset', 'scenario', 'components', 'started', 'duration_s', 'inr', 'inr_per_min', 'latency_p50_ms', 'replies', 'talk_over', 'barge_ins', 'blind')}
        c2['rating'] = rs.get(c['id']); out.append(c2)
    return web.json_response(out[::-1])

async def call_detail(req):
    p = f"{DATA}/calls/{os.path.basename(req.match_info['id'])}/meta.json"
    if not os.path.exists(p): raise web.HTTPNotFound()
    return web.json_response(json.load(open(p)))

async def call_audio(req):
    p = f"{DATA}/calls/{os.path.basename(req.match_info['id'])}/call.wav"
    if not os.path.exists(p): raise web.HTTPNotFound()
    return web.FileResponse(p, headers={'Content-Type': 'audio/wav'})

async def rate(req):
    d = await req.json()
    if not d.get('call_id'): return web.json_response({'error': 'call_id'}, status=400)
    d['ts'] = time.time()
    with open(f'{DATA}/ratings.jsonl', 'a') as f: f.write(json.dumps(d, ensure_ascii=False) + '\n')
    return web.json_response({'ok': True})

RATING_KEYS = ['voice_human', 'emotion', 'conversation', 'hinglish', 'turn_taking', 'speed', 'overall']
def is_test(name):   # the lab's own headless and UI test callers never count as people
    return (name or '').lower().startswith(('smoke', 'sim', 'uitest', 'preview'))
def scoped_calls(req):
    who = req.query.get('tester')
    if who: return [c for c in load_calls() if c.get('tester') == who]
    return [c for c in load_calls() if not is_test(c.get('tester'))]
async def results(req):
    rs = load_ratings(); calls = scoped_calls(req)
    by = defaultdict(lambda: {'calls': 0, 'rated': 0, 'mins': 0.0, 'inr': 0.0, 'lat': [], 'talk_over': 0, 'replies': 0, 'scores': defaultdict(list), 'pick': 0, 'people': defaultdict(list)})
    for c in calls:
        b = by[c['preset']]; b['calls'] += 1; b['mins'] += c.get('duration_s', 0) / 60; b['inr'] += c.get('inr', 0)
        b['lat'] += [x for x in c.get('latencies_ms') or [] if x is not None]; b['talk_over'] += c.get('talk_over', 0); b['replies'] += c.get('replies', 0)
        r = rs.get(c['id'])
        if r:
            b['rated'] += 1; b['pick'] += 1 if r.get('would_pick') else 0
            for k in RATING_KEYS:
                if isinstance(r.get(k), (int, float)): b['scores'][k].append(r[k])
            if isinstance(r.get('overall'), (int, float)): b['people'][c.get('tester')].append(r['overall'])
    out = []
    for pid, b in by.items():
        lat = sorted(b['lat']); p50 = lat[len(lat) // 2] if lat else None
        p = next((x for x in PRESETS if x['id'] == pid), {'label': pid, 'ref': ''})
        out.append({'preset': pid, 'label': p['label'], 'ref': p.get('ref'), 'calls': b['calls'], 'rated': b['rated'], 'minutes': round(b['mins'], 1),
                    'inr_per_min': round(b['inr'] / b['mins'], 2) if b['mins'] > 0 else None, 'latency_p50_ms': p50,
                    'talk_over_pct': round(100 * b['talk_over'] / b['replies']) if b['replies'] else None, 'would_pick': b['pick'],
                    'scores': {k: round(sum(v) / len(v), 2) for k, v in b['scores'].items() if v},
                    'people': len(b['people']), 'overall_by_person': {n: round(sum(v) / len(v), 1) for n, v in b['people'].items()}})
    out.sort(key=lambda x: -(x['scores'].get('overall') or 0))
    return web.json_response(out)

async def testers(req):
    rs = load_ratings(); t = defaultdict(lambda: {'calls': 0, 'rated': 0, 'minutes': 0.0, 'last': ''})
    for c in load_calls():
        if is_test(c.get('tester')): continue
        x = t[c.get('tester')]; x['calls'] += 1; x['minutes'] += c.get('duration_s', 0) / 60; x['last'] = max(x['last'], c.get('started', ''))
        if c['id'] in rs: x['rated'] += 1
    return web.json_response(sorted(({'tester': k, **v, 'minutes': round(v['minutes'], 1)} for k, v in t.items()), key=lambda r: r['last'], reverse=True))

async def memory(req):
    tester = req.query.get('tester', ''); scen = req.query.get('scenario', 'open')
    if req.method == 'DELETE':
        try: os.remove(LAB.mem_path(tester, scen))
        except FileNotFoundError: pass
        return web.json_response({'ok': True})
    return web.json_response({'facts': LAB.memory_get(tester, scen)})

async def remember(call):
    """After a call: extract durable facts about the caller for the next call (cheap model, own cost line)."""
    tr = '\n'.join(f"{'Caller' if t['who'] == 'caller' else 'Assistant'}: {t['text']}" for t in call.transcript)
    if len(tr) < 40: return
    for brain in ('gemini-3.5-flash-lite', 'gpt-4.1-mini-in'):
        try:
            txt, u, tm = await pv.llm_once(LAB.http, brain, [{'role': 'system', 'content': MEMORY_PROMPT}, {'role': 'user', 'content': tr[-6000:]}], max_tokens=400)
            if tm.get('err'): continue
            s = txt[txt.find('{'): txt.rfind('}') + 1]
            facts = [f.strip() for f in json.loads(s).get('facts', []) if isinstance(f, str) and f.strip()]
            if facts: LAB.memory_put(call.cfg['tester'], call.cfg['scenario'], facts)
            call.cost['memory'] += u.get('usd', 0.0); LAB.spend_add(u.get('usd', 0.0))
            return
        except Exception as e:
            call.errors.append('memory: ' + repr(e)[:160])

async def ws_call(req):
    ws = web.WebSocketResponse(max_msg_size=4 * 1024 * 1024, heartbeat=20)
    await ws.prepare(req)
    call = None
    try:
        msg = await ws.receive(timeout=30)
        cfg = json.loads(msg.data)
        if cfg.get('t') != 'start': await ws.send_json({'t': 'error', 'msg': 'expected start'}); return ws
        cfg.setdefault('scenario', 'renewal'); cfg['tester'] = (cfg.get('tester') or 'owner')[:40]
        preset = next((p for p in PRESETS if p['id'] == cfg.get('preset')), None)
        if preset is None or not enabled(preset):
            await ws.send_json({'t': 'error', 'msg': 'this stack is not available yet' + (f" (needs {preset['needs']})" if preset else '')}); return ws
        if cfg.get('brain') and cfg['brain'] not in BRAINS: cfg['brain'] = None
        if LAB.spend_today() >= DAILY_USD:
            await ws.send_json({'t': 'error', 'msg': f'daily lab budget of ${DAILY_USD:.0f} reached'}); return ws
        call = make_call(LAB, ws, cfg); LAB.calls[call.id] = call
        await ws.send_json({'t': 'ready', 'call_id': call.id, 'components': None if cfg.get('blind') else call.components(),
                            'label': None if cfg.get('blind') else preset['label']})
        try:
            await call.start()
        except Exception as e:
            log.exception('start'); await ws.send_json({'t': 'error', 'msg': 'could not start: ' + repr(e)[:200]}); call.errors.append('start: ' + repr(e)[:200])
            return ws
        t_end = time.monotonic() + 20 * 60          # hard cap per call: 20 minutes
        async for m in ws:
            if m.type == aiohttp.WSMsgType.BINARY:
                await call.on_mic(m.data)
            elif m.type == aiohttp.WSMsgType.TEXT:
                d = json.loads(m.data)
                if d.get('t') == 'hangup': break
                await call.on_client(d)
            if time.monotonic() > t_end:
                await ws.send_json({'t': 'error', 'msg': '20-minute call limit'}); break
    except asyncio.TimeoutError:
        pass
    except Exception as e:
        log.exception('ws')
        if call: call.errors.append('ws: ' + repr(e)[:200])
    finally:
        if call is not None:
            await call.close()
            try: await asyncio.wait_for(remember(call), 20)
            except Exception: pass
            d = f'{DATA}/calls/{call.id}'; os.makedirs(d, exist_ok=True)
            dur = call.rec.write(f'{d}/call.wav')
            summ = call.summary(); summ['audio_s'] = round(dur, 1)
            json.dump(summ, open(f'{d}/meta.json', 'w'), ensure_ascii=False, indent=1)
            try: await ws.send_json({'t': 'ended', 'summary': {k: summ[k] for k in ('id', 'duration_s', 'inr', 'inr_per_min', 'latency_p50_ms', 'replies', 'talk_over', 'barge_ins', 'components', 'preset', 'cost_parts_inr')}})
            except Exception: pass
            LAB.calls.pop(call.id, None)
            await ws.close()
    return ws

async def on_start(app):
    LAB.http = aiohttp.ClientSession(connector=aiohttp.TCPConnector(limit=64, keepalive_timeout=120))
    pv.GKEYS.load(f'{DATA}/gemini-paid.jsonl')
    async def warm():
        loop = asyncio.get_running_loop()
        for v in ('hi-IN-SwaraNeural', 'en-IN-Aarti:DragonHDLatestNeural'):
            try: await loop.run_in_executor(None, pv.POOL.warm, v, 2)
            except Exception as e: log.warning('warm %s %r', v, e)
    asyncio.ensure_future(warm())
async def on_stop(app):
    await LAB.http.close()

def build():
    app = web.Application(middlewares=[auth_mw], client_max_size=2 * 1024 * 1024)
    app.router.add_get('/', index)
    app.router.add_get('/api/ping', ping)
    app.router.add_get('/api/catalog', catalog)
    app.router.add_get('/api/calls', calls_list)
    app.router.add_get('/api/calls/{id}', call_detail)
    app.router.add_get('/api/calls/{id}/audio', call_audio)
    app.router.add_post('/api/rate', rate)
    app.router.add_get('/api/results', results)
    app.router.add_get('/api/testers', testers)
    app.router.add_route('*', '/api/memory', memory)
    app.router.add_get('/ws', ws_call)
    app.router.add_static('/static/', WEB, show_index=False)
    app.on_startup.append(on_start); app.on_cleanup.append(on_stop)
    return app

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')
    web.run_app(build(), host=os.environ.get('LAB_HOST', '127.0.0.1'), port=int(os.environ.get('LAB_PORT', '8080')), access_log=None)
