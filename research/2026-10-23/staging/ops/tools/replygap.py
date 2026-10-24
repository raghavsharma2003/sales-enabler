# VP staging: reply gap of the PRODUCT runtime, through the product. For one stack: sign in to the staging control plane,
# make (or reuse) an agent from the renewal template on that stack, then place N test calls with test.browser_call (never
# dials a phone) and play synthetic Hinglish caller clips into the runtime's browser media socket in real time, simulating
# playback of her audio. The reply gap is the runtime's own number: caller end of speech (VAD) -> first agent audio frame
# sent (`reply.latencyMs` on the socket, and `turn.latency` in the control plane's call record). Calls run one at a time.
# Usage: python replygap.py STACK N_CALLS OUT.jsonl [FIRST_CALL_INDEX]
import asyncio, json, os, re, struct, sys, time
import aiohttp
CP = os.environ.get('VPS_CP', 'http://127.0.0.1:8091'); RT = os.environ.get('VPS_RT', 'ws://127.0.0.1:8090')
CLIPS = os.environ.get('VPS_CLIPS', '/opt/vp-stage/app/research/2026-10-18/lanes/g5-gemini-paid/harness/audio_phone16k')
PACE = os.environ.get('VP_STAGE_PACE_LOG', '/opt/vp-stage/data/vertex-pace.jsonl')
EMAIL, PASSWORD = 'asha@saanjh.example', 'sample-password-1234'      # synthetic seed account (web/dev/seed.ts)
SCRIPTS = [['P1_t01', 'P1_t03', 'P1_t06', 'P1_t08', 'P1_t10', 'P1_t11'],
           ['P4_t01', 'P4_t03', 'P4_t04', 'P4_t06', 'P4_t09', 'P4_t11'],
           ['P1_t01', 'P1_t03', 'P1_t09', 'P1_t06', 'P1_t08', 'P1_t11'],
           ['P4_t01', 'P4_t04', 'P4_t06', 'P4_t09', 'P4_t10', 'P4_t11']]
CLAUSE = ['']     # the agent's opening.disclosureClause, read at start
AI_RE = re.compile(r'\bAI\b|ए\.?आई|artificial intelligence', re.I)

class CP_:
    def __init__(self, s): self.s = s; self.cookie = ''
    async def http(self, method, path, body=None):
        h = {'content-type': 'application/json'}
        if self.cookie: h['cookie'] = self.cookie
        async with self.s.request(method, CP + path, headers=h, data=None if body is None else json.dumps(body)) as r:
            sc = r.headers.get('set-cookie')
            if sc: self.cookie = sc.split(';')[0]
            try: j = await r.json(content_type=None)
            except Exception: j = {}
            return r.status, j
    async def tool(self, name, args):
        st, j = await self.http('POST', '/v1/tools/' + name, {'args': args})
        if j.get('status') == 'needs_approval':
            st, j = await self.http('POST', f"/v1/actions/{j['actionId']}/decide", {'approve': True})
        if j.get('status') != 'confirmed': raise RuntimeError(f'{name}: {json.dumps(j)[:400]}')
        return j['result']

async def agent_for(cp, stack):
    name = f'Reply gap {stack}'
    for a in (await cp.tool('agent.list', {}))['agents']:
        if a.get('name') == name: return a['id']
    aid = (await cp.tool('agent.create', {'name': name, 'templateId': 'insurance-renewal'}))['agentId']
    if stack.startswith('custom:'):          # a built stack for a dry run: custom:EARS,BRAIN,VOICE
        e, b, v = stack[7:].split(',')
        r = await cp.tool('stack.set', {'agentId': aid, 'stackId': 'custom', 'components': {'ears': e, 'brain': b, 'voice': v}})
    else:
        r = await cp.tool('stack.set', {'agentId': aid, 'stackId': stack})
    g = await cp.tool('agent.get', {'agentId': aid})
    voice = ((g.get('draft') or {}).get('voice') or {})
    if r.get('voiceCleared') or not voice.get('voiceId'):
        vp = (r.get('stack') or {}).get('components', {}).get('voice')     # the voice part's own default (stack.list)
        dv = next((c.get('defaultVoice') for c in (await cp.tool('stack.list', {}))['components'] if c.get('part') == 'voice' and c.get('id') == vp), None)
        if dv: await cp.tool('voice.set', {'agentId': aid, 'voiceId': dv})
    return aid

async def one_call(s, cp, aid, clips, stack, k):
    t_place = time.time()
    st = await cp.tool('test.browser_call', {'agentId': aid, 'useDraft': True})
    cid = st['conversationId']; join = st['join']
    url = RT + '/v1/media/browser/' + cid + '?token=' + join['token']
    pcm = [open(os.path.join(CLIPS, c + '.pcm'), 'rb').read() for c in clips]
    out = asyncio.Queue(); play_until = [0.0]; replies = {}; res = {'replies': [], 'agent': [], 'caller': [], 'errors': [], 'ended': None}
    t0 = time.monotonic()
    async with s.ws_connect(url, max_msg_size=0, heartbeat=20) as ws:
        async def mic():
            nxt = time.monotonic()
            while not ws.closed:
                try: fr = out.get_nowait()
                except asyncio.QueueEmpty: fr = b'\x00\x00' * 320
                try: await ws.send_bytes(fr)
                except Exception: return
                nxt += 0.02; await asyncio.sleep(max(0, nxt - time.monotonic()))
        async def recv():
            async for m in ws:
                now = time.monotonic()
                if m.type == aiohttp.WSMsgType.BINARY:
                    rid = struct.unpack('<I', m.data[:4])[0]; dur = (len(m.data) - 4) / 48000
                    play_until[0] = max(now, play_until[0]) + dur
                    replies.setdefault(rid, {'first': now, 'audio_s': 0}); replies[rid]['audio_s'] += dur
                elif m.type == aiohttp.WSMsgType.TEXT:
                    d = json.loads(m.data); t = d.get('t')
                    if t == 'reply': res['replies'].append({'rid': d['rid'], 'latencyMs': d.get('latencyMs'), 'wall': time.time(), 'at_s': round(now - t0, 2)})
                    elif t == 'cap' and d.get('final'): res['agent' if d.get('who') == 'agent' else 'caller'].append(d.get('text', ''))
                    elif t == 'flush': play_until[0] = now
                    elif t == 'error': res['errors'].append(str(d)[:200])
                    elif t == 'ended': res['ended'] = d.get('endReason'); return
                elif m.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR): return
        mt = asyncio.ensure_future(mic()); rt = asyncio.ensure_future(recv())
        await asyncio.sleep(1.0)
        dl = time.monotonic() + 60          # the opening can start late (a slow first sentence); never talk over it
        while time.monotonic() < dl and (not replies or time.monotonic() < play_until[0] + 0.8) and not rt.done(): await asyncio.sleep(0.1)
        for c in pcm:
            if rt.done(): break
            await asyncio.sleep(0.5)
            for i in range(0, len(c), 640): await out.put(c[i:i + 640].ljust(640, b'\x00'))
            n0 = len(replies); dl = time.monotonic() + len(c) / 32000 + 45
            while time.monotonic() < dl and (len(replies) == n0 or time.monotonic() < play_until[0] + 0.8) and not rt.done(): await asyncio.sleep(0.1)
        if not rt.done():
            try: await ws.send_str(json.dumps({'t': 'hangup'}))
            except Exception: pass
        try: await asyncio.wait_for(rt, 30)
        except asyncio.TimeoutError: pass
        mt.cancel()
    await asyncio.sleep(4)          # let call.ended reach the control plane
    rec = await cp.tool('call.get', {'conversationId': cid})
    turns = rec.get('turns') or []
    agent_turns = [t for t in turns if t.get('speaker') == 'agent']
    lines = rec.get('cost', {}).get('lines') or []
    total = rec.get('cost', {}).get('totalInrMilli') or sum(int(x.get('inr_milli') or 0) for x in lines)
    dur = rec.get('durationS') or 0
    said = ' '.join([t.get('text') or '' for t in agent_turns] or res['agent'])
    first = (agent_turns[0].get('text') if agent_turns else (res['agent'][0] if res['agent'] else '')) or ''
    return {'stack': stack, 'k': k, 'conversationId': cid, 'clips': clips, 'socketGaps': [r['latencyMs'] for r in res['replies']],
            'replyWall': [[r['wall'], r['latencyMs']] for r in res['replies']],
            'turnGaps': [((t.get('latency') or {}).get('latencyMs') if isinstance(t.get('latency'), dict) else t.get('latency')) for t in agent_turns], 'endReason': rec.get('endReason'), 'socketEnded': res['ended'],
            'durationS': dur, 'costInrMilli': total, 'costByComponent': {c: sum(int(x.get('inr_milli') or 0) for x in lines if x.get('component') == c) for c in {x.get('component') for x in lines}},
            'aiSaid': bool(AI_RE.search(said)), 'aiInFirstReply': bool(AI_RE.search(first)), 'combinationId': (rec.get('runManifest') or {}).get('combinationId'),
            'fallbacksUsed': (rec.get('runManifest') or {}).get('fallbacksUsed'), 'errors': res['errors'], 'agentTurns': len(agent_turns),
            'callerTurns': len([t for t in turns if t.get('speaker') == 'caller']), 'placedAt': t_place,
            'firstAgentText': first[:100], 'openingClausePrefixed': bool(CLAUSE[0]) and first.strip().lower().startswith(CLAUSE[0].strip().lower()[:24])}

async def main():
    stack, n, outp = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    off = int(sys.argv[4]) if len(sys.argv) > 4 else 0      # call index to start from (a top-up run continues the numbering)
    async with aiohttp.ClientSession() as s:
        cp = CP_(s)
        st, j = await cp.http('POST', '/v1/login', {'email': EMAIL, 'password': PASSWORD})
        if st != 200: raise SystemExit(f'login {st} {j}')
        aid = await agent_for(cp, stack)
        CLAUSE[0] = (((await cp.tool('agent.get', {'agentId': aid})).get('draft') or {}).get('opening') or {}).get('disclosureClause') or ''
        for k in range(off, off + n):
            try: r = await one_call(s, cp, aid, SCRIPTS[k % len(SCRIPTS)], stack, k)
            except Exception as e: r = {'stack': stack, 'k': k, 'fatal': repr(e)[:400]}
            with open(outp, 'a') as f: f.write(json.dumps(r, ensure_ascii=False) + '\n')
            print(json.dumps({x: r.get(x) for x in ('stack', 'k', 'socketGaps', 'turnGaps', 'endReason', 'durationS', 'costInrMilli', 'aiSaid', 'aiInFirstReply', 'errors', 'fatal')}, ensure_ascii=False), flush=True)
            await asyncio.sleep(3)

asyncio.run(main())
