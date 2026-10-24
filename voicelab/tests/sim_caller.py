# VP voice lab: headless caller. Streams real-time 16 kHz mic audio (synthetic Hinglish caller clips from the g5
# battery, silence in between) into /ws for one preset, simulates playback of the agent's audio, and prints per-turn
# latency and captions. Usage: python sim_caller.py BASE_URL PASSCODE PRESET [scenario] [n_turns] [--brain X]
import asyncio, json, sys, time, struct, os, argparse
import aiohttp
HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(HERE, '..', '..', 'research', '2026-10-18', 'lanes', 'g5-gemini-paid', 'harness', 'audio_phone16k')
ORDER = ['P1_t01', 'P1_t03', 'P1_t05', 'P1_t08', 'P1_t09']

async def main():
    ap = argparse.ArgumentParser(); ap.add_argument('base'); ap.add_argument('key'); ap.add_argument('preset')
    ap.add_argument('--scenario', default='renewal'); ap.add_argument('--turns', type=int, default=3); ap.add_argument('--brain'); ap.add_argument('--voice')
    ap.add_argument('--tester', default='sim'); ap.add_argument('--clips', default=','.join(ORDER))
    ap.add_argument('--custom', help='a page-built stack: stt,brain,tts[,voice] or s2s:ENGINE[,voice]')
    a = ap.parse_args()
    url = a.base.replace('https://', 'wss://').replace('http://', 'ws://').rstrip('/') + '/ws?k=' + a.key
    clips = [open(os.path.join(CLIPS, c + '.pcm'), 'rb').read() for c in a.clips.split(',')[:a.turns]]
    out = asyncio.Queue(); play_until = [0.0]; replies = {}; t0 = time.monotonic(); res = {'errors': [], 'turns': []}
    sent = [0]
    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(url, max_msg_size=0, heartbeat=20) as ws:
            custom = None
            if a.custom:
                parts = a.custom.split(',')
                custom = ({'s2s': parts[0][4:], 'voice': (parts[1:] or [None])[0]} if parts[0].startswith('s2s:')
                          else dict(zip(('stt', 'brain', 'tts', 'voice'), parts)))
            await ws.send_json({'t': 'start', 'preset': a.preset, 'scenario': a.scenario, 'tester': a.tester, 'brain': a.brain, 'voice': a.voice, 'custom': custom})
            async def mic():
                nxt = time.monotonic()
                while not ws.closed:
                    try: fr = out.get_nowait()
                    except asyncio.QueueEmpty: fr = b'\x00\x00' * 320
                    await ws.send_bytes(fr); sent[0] += 320
                    nxt += 0.02; await asyncio.sleep(max(0, nxt - time.monotonic()))
            async def recv():
                async for m in ws:
                    now = time.monotonic()
                    if m.type == aiohttp.WSMsgType.BINARY:
                        rid = struct.unpack('<I', m.data[:4])[0]; dur = (len(m.data) - 4) / 48000
                        play_until[0] = max(now, play_until[0]) + dur
                        replies.setdefault(rid, {'first': now}); replies[rid]['audio_s'] = replies[rid].get('audio_s', 0) + dur
                    else:
                        d = json.loads(m.data); t = d.get('t')
                        if t == 'reply': res['turns'].append({'rid': d['rid'], 'server_ms': d.get('server_ms')}); print(f"  [{now - t0:6.2f}s] reply rid={d['rid']} server_ms={d.get('server_ms')}", flush=True)
                        elif t == 'cap' and d.get('final'): print(f"  [{now - t0:6.2f}s] {d['who']:6s}: {d['text'][:150]}", flush=True)
                        elif t == 'flush': play_until[0] = now; print(f'  [{now - t0:6.2f}s] flush rid={d["rid"]}', flush=True)
                        elif t == 'error': res['errors'].append(d['msg']); print('  ERROR', d['msg'], flush=True)
                        elif t == 'ready': print('  ready', d.get('label'), d.get('components'), flush=True)
                        elif t == 'ended': res['summary'] = d['summary']; print('  ended', json.dumps(d['summary'], ensure_ascii=False)[:600], flush=True); return
                        elif t == 'cost': res['cost'] = d
            mt = asyncio.ensure_future(mic()); rt = asyncio.ensure_future(recv())
            # wait for the opening line to finish
            await asyncio.sleep(1.0)
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline and (not replies or time.monotonic() < play_until[0] + 0.8): await asyncio.sleep(0.1)
            for c in clips:
                await asyncio.sleep(0.4)
                for i in range(0, len(c), 640): await out.put(c[i:i + 640].ljust(640, b'\x00'))
                n_before = len(replies)
                deadline = time.monotonic() + len(c) / 32000 + 15
                while time.monotonic() < deadline and (len(replies) == n_before or time.monotonic() < play_until[0] + 0.8): await asyncio.sleep(0.1)
            await ws.send_json({'t': 'hangup'})
            try: await asyncio.wait_for(rt, 40)
            except asyncio.TimeoutError: pass
            mt.cancel()
    print(json.dumps({'preset': a.preset, 'server_ms': [t['server_ms'] for t in res['turns']], 'errors': res['errors'][:5],
                      'inr_per_min': (res.get('summary') or {}).get('inr_per_min')}, ensure_ascii=False))

asyncio.run(main())
