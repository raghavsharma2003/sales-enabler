# VP voice lab: fake Plivo. Arms dial-in on the lab, then plays Plivo's part of an inbound call: the answer webhook,
# the Stream XML, and the bidirectional 8 kHz mu-law websocket, with the synthetic caller clips as the caller. Prints
# per-turn timing and captions from the page's event poll, and writes what the "phone" heard to a WAV. Proves the
# phone path end to end except the PSTN leg itself (Plivo <-> the handset), which only a real call can.
# Usage: python plivo_sim.py BASE_URL PASSCODE PRESET [--turns 3] [--wav out.wav] [--verify MOBILE] (needs PLIVO_* env)
import asyncio, json, sys, time, os, re, argparse, uuid, base64, wave
import numpy as np
import aiohttp
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ.get('LAB_SERVER_DIR') or os.path.join(HERE, '..', 'server'))
import phone
CLIPS = os.path.join(HERE, '..', '..', 'research', '2026-10-18', 'lanes', 'g5-gemini-paid', 'harness', 'audio_phone16k')
ORDER = ['P1_t01', 'P1_t03', 'P1_t05', 'P1_t08', 'P1_t09']

def to_ulaw8k(pcm16k):
    x = np.frombuffer(pcm16k, dtype='<i2').astype(np.float32)
    y = np.convolve(x, phone.lowpass(63, 3600, 16000), mode='same')[::2]
    return phone.ulaw_encode(np.clip(y, -32768, 32767).astype(np.int16))

async def main():
    ap = argparse.ArgumentParser(); ap.add_argument('base'); ap.add_argument('key'); ap.add_argument('preset')
    ap.add_argument('--scenario', default='renewal'); ap.add_argument('--turns', type=int, default=3); ap.add_argument('--tester', default='sim-phone')
    ap.add_argument('--caller', default=(phone.ALLOWED or [''])[0], help='an allow-listed number (default: the first in PLIVO_ALLOWED_TO)')
    ap.add_argument('--verify', help="add this mobile as the tester's own phone first (missed-call verification), then call from it"); ap.add_argument('--wav')
    a = ap.parse_args(); base = a.base.rstrip('/'); H = {'x-lab-key': a.key}
    clips = [to_ulaw8k(open(os.path.join(CLIPS, c + '.pcm'), 'rb').read()) for c in ORDER[:a.turns]]
    t0 = time.monotonic(); play_until = [0.0]; heard = bytearray(); replies = []; bursts = []; res = {'errors': [], 'server_ms': []}
    async with aiohttp.ClientSession() as http:
        if a.verify:      # a tester adds their own mobile: the page asks, then the "missed call" from it proves it
            caller = phone.india(a.verify)
            r = await http.post(base + '/api/phone/verify', json={'number': a.verify, 'tester': a.tester}, headers=H); v = await r.json(); print('verify', r.status, v, flush=True)
            if not v.get('verified'):
                r = await http.post(f'{base}/plivo/answer/{phone.HOOK}', data={'CallUUID': 'sim-v', 'From': caller, 'To': phone.NUMBER, 'Direction': 'inbound'})
                print('missed call ->', 'rejected (unanswered)' if 'rejected' in await r.text() else 'ANSWERED', flush=True)
            nid = v['id']
        else:
            caller = a.caller
            async with http.get(base + '/api/phone/numbers?tester=' + a.tester, headers=H) as r: nid = (await r.json())['numbers'][0]['id']   # the lab test phone
        async with http.get(base + '/api/phone/numbers?tester=' + a.tester, headers=H) as r: print('my numbers', [n['label'] for n in (await r.json())['numbers']], flush=True)
        r = await http.post(base + '/api/phone/dialin', json={'preset': a.preset, 'scenario': a.scenario, 'tester': a.tester, 'consent': True, 'from_id': nid}, headers=H)
        d = await r.json(); print('dialin', r.status, d, flush=True); tok = d['token']
        # a caller who is not on the allow-list is turned away without answering
        r = await http.post(f'{base}/plivo/answer/{phone.HOOK}', data={'CallUUID': 'sim-x', 'From': '919999900000', 'To': phone.NUMBER, 'Direction': 'inbound'})
        print('stranger ->', 'rejected' if 'rejected' in await r.text() else 'NOT REJECTED', flush=True)
        r = await http.post(f'{base}/plivo/answer/{phone.HOOK}', data={'CallUUID': 'sim-' + uuid.uuid4().hex[:8], 'From': '+' + caller, 'To': phone.NUMBER, 'Direction': 'inbound'})
        xml = await r.text(); url = re.search(r'<Stream[^>]*>([^<]+)</Stream>', xml).group(1).replace('&amp;', '&').strip()
        print('answer xml ok:', 'bidirectional="true"' in xml and 'audio/x-mulaw;rate=8000' in xml, flush=True)
        if url.startswith('wss://') and base.startswith('http://'): url = 'ws://' + base.split('://', 1)[1] + '/plivo/' + url.split('/plivo/', 1)[1]
        out = asyncio.Queue()
        async with http.ws_connect(url, max_msg_size=0, heartbeat=20) as ws:
            sid = 'sim-stream-' + uuid.uuid4().hex[:6]
            await ws.send_json({'event': 'start', 'sequenceNumber': 1, 'start': {'callId': 'sim', 'streamId': sid, 'accountId': 'sim', 'tracks': ['inbound'],
                                'mediaFormat': {'encoding': 'audio/x-mulaw', 'sampleRate': 8000}}})
            async def mic():
                nxt = time.monotonic(); seq = 1; chunk = 0
                while not ws.closed:
                    try: fr = out.get_nowait()
                    except asyncio.QueueEmpty: fr = b'\xff' * 160          # mu-law silence
                    seq += 1; chunk += 1
                    await ws.send_json({'event': 'media', 'sequenceNumber': seq, 'streamId': sid,
                                        'media': {'track': 'inbound', 'timestamp': str(chunk * 20), 'chunk': chunk, 'payload': base64.b64encode(fr).decode()}})
                    nxt += 0.02; await asyncio.sleep(max(0, nxt - time.monotonic()))
            async def recv():
                async for m in ws:
                    if m.type != aiohttp.WSMsgType.TEXT: continue
                    d = json.loads(m.data); now = time.monotonic()
                    if d.get('event') == 'playAudio':
                        b = base64.b64decode(d['media']['payload']); heard.extend(b)
                        assert d['media']['contentType'] == 'audio/x-mulaw' and d['media']['sampleRate'] == 8000
                        if now >= play_until[0] + 0.3: bursts.append(now)            # a new reply became audible
                        play_until[0] = max(now, play_until[0]) + len(b) / 8000
                    elif d.get('event') == 'clearAudio':
                        play_until[0] = now; print(f'  [{now - t0:6.2f}s] clearAudio', flush=True)
                        await ws.send_json({'event': 'clearedAudio', 'sequenceNumber': 0, 'streamId': sid})
            async def poll():
                after = 0
                while True:
                    async with http.get(f'{base}/api/phone/events?p={tok}&after={after}', headers=H) as r: d = await r.json()
                    for e in d['events']:
                        after = max(after, e['n']); now = time.monotonic(); t = e.get('t')
                        if t == 'reply': replies.append(now); res['server_ms'].append(e.get('server_ms')); print(f"  [{now - t0:6.2f}s] reply rid={e['rid']} server_ms={e.get('server_ms')}", flush=True)
                        elif t == 'cap' and e.get('final'): print(f"  [{now - t0:6.2f}s] {e['who']:6s}: {e['text'][:150]}", flush=True)
                        elif t == 'error': res['errors'].append(e['msg']); print('  ERROR', e['msg'], flush=True)
                        elif t == 'ready': print('  ready', e.get('label'), e.get('components'), flush=True)
                        elif t == 'state' and e['s'][0].isupper(): print('  state', e['s'], flush=True)
                        elif t == 'ended': res['summary'] = e['summary']; print('  ended', json.dumps(e['summary'], ensure_ascii=False)[:700], flush=True); return
                        elif t == 'phone_end': print('  phone_end', e, flush=True); return
                    await asyncio.sleep(0.4)
            mt = asyncio.ensure_future(mic()); rt = asyncio.ensure_future(recv()); pt = asyncio.ensure_future(poll())
            await asyncio.sleep(1.0)
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline and (not bursts or time.monotonic() < play_until[0] + 0.8): await asyncio.sleep(0.1)
            for c in clips:
                await asyncio.sleep(0.4)
                for i in range(0, len(c), 160): await out.put(c[i:i + 160].ljust(160, b'\xff'))
                n0 = len(bursts); deadline = time.monotonic() + len(c) / 8000 + 30
                while time.monotonic() < deadline and (len(bursts) == n0 or time.monotonic() < play_until[0] + 0.8): await asyncio.sleep(0.1)
            mt.cancel(); await ws.close()                                  # the caller hangs up
        try: await asyncio.wait_for(pt, 40)
        except asyncio.TimeoutError: print('  no ended event', flush=True)
    if a.wav:
        with wave.open(a.wav, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000); w.writeframes(phone.ulaw_decode(bytes(heard)).tobytes())
    x = phone.ulaw_decode(bytes(heard)).astype(np.float32)
    print(json.dumps({'preset': a.preset, 'server_ms': res['server_ms'], 'errors': res['errors'][:5], 'heard_s': round(len(heard) / 8000, 1),
                      'heard_rms': round(float(np.sqrt((x ** 2).mean())) if len(x) else 0, 1), 'inr_per_min': (res.get('summary') or {}).get('inr_per_min'),
                      'cost_parts_inr': (res.get('summary') or {}).get('cost_parts_inr')}, ensure_ascii=False))

asyncio.run(main())
