# VP staging (2026-10-24, 6b0d859): barge-in on the PRODUCT runtime, through the product, with synthetic caller clips.
# Same caller as replygap.py (test.browser_call, never dials a phone; sign-in, agents, clips and the browser media socket
# unchanged), but some caller clips are played OVER her while she speaks:
#   nod    a backchannel clip ("हम्म", "हाँ", "ok", 160-460 ms of speech) starts 1.2 s (opening: 2.0 s) into her reply's
#          playback. She should keep her place: carry on, or pause and resume. A false stop = she gives way: that reply
#          never plays again after the flush and never completes.
#   barge  a real caller turn ("Sorry sorry, एक second...", "बेटा रुको...", or any question) starts the same way.
#          Stop time = the clip's speech onset (its first 20 ms frame above -38 dBFS, the turn bench's rule) sent on the
#          socket -> her 'flush' for that reply received. Missed = no flush within 1.5 s (the bench's rule). Resumed
#          over = her reply plays again after the flush (she went back to talking over a real interruption).
#   When the clip starts, at least 1.5 s (barge) or 1.2 s (nod) of her audio is still queued. A barge with no flush
#   counts as missed only if she was still playing 1.5 s after its onset; if her reply ran out first, it is
#   'ended_unstopped' and left out of the barge n (inconclusive).
# Her playback is simulated as in replygap.py (each audio frame queues its duration; a flush drops the queue), so "how
# much of her is queued" is what a far-end player would hold. Both sides run on one VM, so socket times are the
# runtime's times within a few ms.
# Each call also reads the runtime's own timing (barge pauses / resumes / stops, speculation, pre-warm, partial lags),
# for a cross-check against what the socket saw.
# Usage: python bargein.py STACK N_CALLS OUT.jsonl [FIRST_CALL_INDEX]
#        (local dry run against devsim: python bargein.py --local BASE_URL SECRET OUT.jsonl, see dry_devsim.sh)
import asyncio, json, os, struct, sys, time, types
import numpy as np
import aiohttp

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.environ.get('VPS_TOOLS', '/opt/vp-stage/tools')
_p = os.path.join(TOOLS, 'replygap.py')
R = types.ModuleType('replygap')                      # replygap.py ends in an unguarded asyncio.run(main()): load without it
exec(compile(open(_p).read().replace('\nasyncio.run(main())', '\n'), _p, 'exec'), R.__dict__)

NODS = ['P1_t02', 'P4_t02', 'P4_t08', 'P1_t05', 'P3_t02', 'P2_t02', 'P3_t05']      # हम्म, हाँ, हम्म…, ok, Ok, हँ, ம்ம்ம்
BARGES = ['P1_t04', 'P4_t05', 'P1_t09', 'P4_t09', 'P2_t04', 'P1_t08', 'P4_t10', 'P3_t04', 'P4_t06']
# Two plans, alternating by call: (kind, clip). 'say' = a normal caller turn after she has finished (replygap's wait);
# 'nod' / 'barge' = played over the reply now playing (the opening for the first step, else her latest reply).
def plan(k):
    n = lambda i: NODS[(3 * k + i) % len(NODS)]; b = lambda i: BARGES[(3 * k + i) % len(BARGES)]
    if k % 2 == 0:
        return [('nod', n(0)), ('say', 'P1_t03'), ('barge', b(0)), ('nod', n(1)), ('say', 'P1_t06'), ('barge', b(1)), ('nod', n(2)), ('say', 'P1_t11')]
    return [('barge', b(0)), ('nod', n(0)), ('say', 'P4_t04'), ('barge', b(1)), ('nod', n(1)), ('say', 'P4_t06'), ('barge', b(2)), ('nod', n(2)), ('say', 'P4_t11')]

OFFSET_OPENING, OFFSET_REPLY = 2.0, 1.2
MIN_LEFT = {'nod': 1.2, 'barge': 1.5}      # her audio still queued when the clip starts
MISSED_S, FALSE_STOP_S = 1.5, 3.0


def onset_frame(pcm):
    """Index of the first 20 ms frame above -38 dBFS (the turn bench's speech rule), and the clip's speech seconds."""
    x = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768; n = len(x) // 320
    db = 20 * np.log10(np.sqrt(np.mean(x[:n * 320].reshape(-1, 320) ** 2, axis=1)) + 1e-9)
    on = np.nonzero(db > -38.0)[0]
    return (int(on[0]) if len(on) else 0), round(float((db > -38.0).sum()) * 0.02, 2)


async def run_socket(s, url, steps, clips_dir):
    pcm = {c: open(os.path.join(clips_dir, c + '.pcm'), 'rb').read() for _, c in steps}
    out = asyncio.Queue(); sent = {}; t0 = time.monotonic()
    st = {'play_until': 0.0, 'last_rid': None}
    rids = {}            # rid -> {'first', 'frames': [(t, dur)], 'flush': [t], 'cap': t or None, 'latencyMs'}
    states = []; caps = []; errors = []; ended = [None]

    def R_(rid): return rids.setdefault(rid, {'first': None, 'frames': [], 'flush': [], 'cap': None, 'latencyMs': None})

    async with s.ws_connect(url, max_msg_size=0, heartbeat=20) as ws:
        async def mic():
            nxt = time.monotonic()
            while not ws.closed:
                try: fr, tag = out.get_nowait()
                except asyncio.QueueEmpty: fr, tag = b'\x00\x00' * 320, None
                try: await ws.send_bytes(fr)
                except Exception: return
                if tag is not None: sent[tag] = time.monotonic()
                nxt += 0.02; await asyncio.sleep(max(0, nxt - time.monotonic()))

        async def recv():
            async for m in ws:
                now = time.monotonic()
                if m.type == aiohttp.WSMsgType.BINARY:
                    rid = struct.unpack('<I', m.data[:4])[0]; dur = (len(m.data) - 4) / 48000
                    r = R_(rid)
                    if r['first'] is None: r['first'] = now
                    r['frames'].append((now, dur)); st['last_rid'] = rid
                    st['play_until'] = max(now, st['play_until']) + dur
                elif m.type == aiohttp.WSMsgType.TEXT:
                    d = json.loads(m.data); t = d.get('t')
                    if t == 'flush': R_(d.get('rid'))['flush'].append(now); st['play_until'] = now
                    elif t == 'reply': R_(d['rid'])['latencyMs'] = d.get('latencyMs')
                    elif t == 'state': states.append((now, d.get('s')))
                    elif t == 'cap' and d.get('final'):
                        caps.append({'who': d.get('who'), 'text': d.get('text', ''), 'rid': d.get('rid'), 't': now})
                        if d.get('who') == 'agent' and d.get('rid') is not None: R_(d['rid'])['cap'] = now
                    elif t == 'error': errors.append(str(d)[:200])
                    elif t == 'ended': ended[0] = d.get('endReason'); return
                elif m.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR): return

        mt = asyncio.ensure_future(mic()); rt = asyncio.ensure_future(recv())
        now = time.monotonic
        def playing(): return now() < st['play_until']
        async def wait(cond, timeout):
            dl = now() + timeout
            while now() < dl and not rt.done():
                if cond(): return True
                await asyncio.sleep(0.02)
            return cond()
        async def wait_done(timeout=45):
            """replygap's rule: she has stopped for 0.8 s."""
            return await wait(lambda: now() >= st['play_until'] + 0.8, timeout)
        async def play(c, tag=None, onset=0):
            p = pcm[c]
            for j, i in enumerate(range(0, len(p), 640)):
                await out.put((p[i:i + 640].ljust(640, b'\x00'), tag if j == onset else None))

        events = []; seen = set()
        await asyncio.sleep(1.0)
        await wait(lambda: any(r['first'] for r in rids.values()), 60)           # her opening starts
        started = [k for k in rids if rids[k]['first'] is not None]
        current = min(started, key=lambda k: rids[k]['first']) if started else None
        offset = OFFSET_OPENING
        for idx, (kind, c) in enumerate(steps):
            if rt.done(): break
            seen |= set(rids)
            if kind == 'say':
                await wait_done(); await asyncio.sleep(0.5)
                before = set(rids); await play(c)
                await wait(lambda: any(k not in before and rids[k]['first'] for k in rids), len(pcm[c]) / 32000 + 45)
                new = [k for k in rids if k not in before and rids[k]['first']]
                current = min(new, key=lambda k: rids[k]['first']) if new else current; offset = OFFSET_REPLY
                continue
            ev = {'i': idx, 'kind': kind, 'clip': c, 'rid': current, 'onReply': 'opening' if offset == OFFSET_OPENING else 'reply'}
            on_i, speech_s = onset_frame(pcm[c]); ev['speechS'] = speech_s
            r = rids.get(current) if current is not None else None
            ready = False
            if r and r['first']:
                ready = await wait(lambda: now() - r['first'] >= offset and st['play_until'] - now() >= MIN_LEFT[kind] and st['last_rid'] == current,
                                   max(0.5, r['first'] + offset + 8 - now()))
            if not ready:
                ev['skipped'] = 'her reply was not playing long enough' if r else 'no reply to play over'
                events.append(ev)
                if kind == 'barge':                       # still say it, as a normal turn, so the call goes on
                    await wait_done(); await asyncio.sleep(0.5); before = set(rids); await play(c)
                    await wait(lambda: any(k not in before and rids[k]['first'] for k in rids), len(pcm[c]) / 32000 + 45)
                    new = [k for k in rids if k not in before and rids[k]['first']]
                    current = min(new, key=lambda k: rids[k]['first']) if new else current; offset = OFFSET_REPLY
                continue
            ev['elapsedInReplyS'] = round(now() - r['first'], 2); ev['queuedS'] = round(st['play_until'] - now(), 2)
            tag = f'ev{idx}'; before = set(rids)
            await play(c, tag, on_i)
            await wait(lambda: tag in sent, 5)
            t_on = sent.get(tag); probe = {}
            async def sample():
                if t_on is None: return
                await asyncio.sleep(max(0.0, t_on + MISSED_S - now())); probe['leftAtMissedS'] = round(st['play_until'] - now(), 3)
            sp = asyncio.ensure_future(sample())
            if kind == 'nod':
                await wait(lambda: False, FALSE_STOP_S + speech_s)            # observe
                await wait_done(30)
            else:
                await wait(lambda: any(k not in before and rids[k]['first'] for k in rids), len(pcm[c]) / 32000 + 45)
            try: await asyncio.wait_for(sp, 5)
            except asyncio.TimeoutError: pass
            ev.update(probe)
            fl = [t for t in r['flush'] if t_on is not None and t >= t_on - 0.05]
            first_fl = fl[0] if fl else None
            after = [t for t, _ in r['frames'] if first_fl is not None and t > first_fl + 0.005]
            ev.update({'onsetAt': None if t_on is None else round(t_on - t0, 3),
                       'flushMs': None if first_fl is None else int(round((first_fl - t_on) * 1000)),
                       'flushes': len(fl), 'resumed': bool(after), 'pauseMs': int(round((after[0] - first_fl) * 1000)) if after else None,
                       'completed': r['cap'] is not None, 'lastFlushMs': None if not fl else int(round((fl[-1] - t_on) * 1000))})
            gave_way = first_fl is not None and r['cap'] is None and not [t for t, _ in r['frames'] if t > fl[-1] + 0.005]
            ev['gaveWay'] = gave_way
            if kind == 'nod':
                ev['outcome'] = ('kept_talking' if first_fl is None or ev['flushMs'] > FALSE_STOP_S * 1000 else
                                 'false_stop' if gave_way and ev['lastFlushMs'] <= (FALSE_STOP_S + speech_s) * 1000 else
                                 'paused_resumed' if ev['resumed'] else 'paused_other')
            else:
                unstopped = first_fl is None or ev['flushMs'] > MISSED_S * 1000
                ev['outcome'] = (('missed' if (probe.get('leftAtMissedS') or 0) > 0 or (first_fl is not None) else 'ended_unstopped') if unstopped else
                                 'stopped_gave_way' if gave_way and not ev['resumed'] else
                                 'stopped_resumed_then_stopped' if gave_way and ev['resumed'] else 'stopped_resumed_over')
                new = [k for k in rids if k not in before and rids[k]['first']]
                if new: current = min(new, key=lambda k: rids[k]['first']); offset = OFFSET_REPLY
            events.append(ev)
        await wait_done(30)
        if not rt.done():
            try: await ws.send_str(json.dumps({'t': 'hangup'}))
            except Exception: pass
        try: await asyncio.wait_for(rt, 30)
        except asyncio.TimeoutError: pass
        mt.cancel()
    replies = {k: {'firstAt': None if v['first'] is None else round(v['first'] - t0, 3), 'audioS': round(sum(d for _, d in v['frames']), 2),
                   'flushAt': [round(t - t0, 3) for t in v['flush']], 'completed': v['cap'] is not None, 'latencyMs': v['latencyMs']} for k, v in rids.items()}
    return {'events': events, 'replies': replies, 'caps': caps, 'errors': errors, 'socketEnded': ended[0],
            'states': [[round(t - t0, 3), s_] for t, s_ in states]}


async def staging_call(s, cp, aid, stack, k):
    t_place = time.time()
    stc = await cp.tool('test.browser_call', {'agentId': aid, 'useDraft': True})
    cid = stc['conversationId']; join = stc['join']
    url = R.RT + '/v1/media/browser/' + cid + '?token=' + join['token']
    res = await run_socket(s, url, plan(k), R.CLIPS)
    await asyncio.sleep(4)                        # let call.ended reach the control plane
    rtt = await R.runtime_timing(s, cid)
    rec = await cp.tool('call.get', {'conversationId': cid})
    turns = rec.get('turns') or []
    lines = rec.get('cost', {}).get('lines') or []
    total = rec.get('cost', {}).get('totalInrMilli') or sum(int(x.get('inr_milli') or 0) for x in lines)
    tm = rtt.get('timing') or {}
    return {'stack': stack, 'k': k, 'conversationId': cid, 'placedAt': t_place, 'plan': plan(k), **res,
            'endReason': rec.get('endReason'), 'durationS': rec.get('durationS'), 'costInrMilli': total,
            'combinationId': (rec.get('runManifest') or {}).get('combinationId'), 'fallbacksUsed': (rec.get('runManifest') or {}).get('fallbacksUsed'),
            'agentTurns': [{'text': (t.get('text') or '')[:300], 'interrupted': t.get('interrupted')} for t in turns if t.get('speaker') == 'agent'],
            'callerTurns': [(t.get('text') or '')[:200] for t in turns if t.get('speaker') == 'caller'],
            'rtBarge': tm.get('barge'), 'rtSpeculation': tm.get('speculation'), 'rtPrewarm': tm.get('prewarm'),
            'rtPartialLagMs': tm.get('partialLagMs'), 'rtPartialLagN': tm.get('partialLagN'), 'rtTimingError': rtt.get('error'),
            'rtTiming': tm}


async def main():
    if sys.argv[1] == '--local':                  # dry run against a local devsim (fake providers): mechanics only
        base, secret, outp = sys.argv[2], sys.argv[3], sys.argv[4]
        sys.path.insert(0, os.environ['VPS_VOICE']); from vpvoice import signing
        from tests.fixtures import ticket
        async with aiohttp.ClientSession() as s:
            for k in range(int(os.environ.get('VPS_LOCAL_N', '2'))):
                t = ticket(transport={'kind': 'webrtc', 'offerUrl': '/v1/test-calls/x/offer'})
                t['conversationId'] = f'0b6f6e1a-1c2d-4e5f-8a9b-00000000{k:04d}'
                body = json.dumps(t).encode()
                async with s.post(base + '/v1/calls', data=body, headers={signing.HEADER: signing.sign(secret, body)}) as r:
                    d = await r.json()
                url = base.replace('http', 'ws', 1) + f"/v1/media/browser/{t['conversationId']}?token={d['join']['token']}"
                res = await run_socket(s, url, plan(k), R.CLIPS)
                with open(outp, 'a') as f: f.write(json.dumps({'k': k, 'plan': plan(k), **res}, ensure_ascii=False) + '\n')
                print(json.dumps({'k': k, 'events': [{x: e.get(x) for x in ('kind', 'clip', 'onReply', 'outcome', 'flushMs', 'pauseMs', 'skipped')} for e in res['events']]}))
        return
    stack, n, outp = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    off = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    async with aiohttp.ClientSession() as s:
        cp = R.CP_(s)
        st_, j = await cp.http('POST', '/v1/login', {'email': R.EMAIL, 'password': R.PASSWORD})
        if st_ != 200: raise SystemExit(f'login {st_}')
        aid = await R.agent_for(cp, stack)
        for k in range(off, off + n):
            try: r = await staging_call(s, cp, aid, stack, k)
            except Exception as e: r = {'stack': stack, 'k': k, 'fatal': repr(e)[:400]}
            with open(outp, 'a') as f: f.write(json.dumps(r, ensure_ascii=False) + '\n')
            print(json.dumps({'stack': stack, 'k': k, 'cost': r.get('costInrMilli'), 'end': r.get('endReason'), 'rtBarge': r.get('rtBarge'), 'fatal': r.get('fatal'),
                              'events': [{x: e.get(x) for x in ('kind', 'clip', 'onReply', 'outcome', 'flushMs', 'pauseMs', 'skipped')} for e in r.get('events') or []]},
                             ensure_ascii=False), flush=True)
            await asyncio.sleep(3)

asyncio.run(main())
