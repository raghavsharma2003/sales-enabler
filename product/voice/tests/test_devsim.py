# The development runtime (python -m vpvoice.devsim) as a real process: refuses to start without VP_DEVSIM=1, then
# serves a signed sim call with fake providers, whisper and takeover included. This is what calls' cross-process test of
# its live.* tools runs against.
import asyncio, json, os, subprocess, sys, unittest
import aiohttp
from tests.fixtures import ticket
from tests.test_launch import free_base
from vpvoice import signing

VOICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECRET = 'devsim-test-secret-not-real'


class DevSim(unittest.IsolatedAsyncioTestCase):
    def test_refuses_without_the_flag(self):
        env = {k: v for k, v in os.environ.items() if k != 'VP_DEVSIM'}
        r = subprocess.run([sys.executable, '-m', 'vpvoice.devsim'], cwd=VOICE, env=env, capture_output=True, text=True, timeout=60)
        self.assertNotEqual(r.returncode, 0); self.assertIn('VP_DEVSIM=1', r.stderr)

    async def test_sim_call_with_whisper_and_takeover(self):
        port = free_base(1)
        env = {**os.environ, 'VP_DEVSIM': '1', 'VP_RUNTIME_SECRET': SECRET, 'VP_CONTROL_URL': 'http://127.0.0.1:9', 'PORT': str(port), 'VP_LOG_LEVEL': 'WARNING'}
        p = subprocess.Popen([sys.executable, '-m', 'vpvoice.devsim'], cwd=VOICE, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        base = f'http://127.0.0.1:{port}'
        try:
            async with aiohttp.ClientSession() as http:
                for _ in range(200):
                    try:
                        async with http.get(base + '/v1/health') as r:
                            if r.status == 200: break
                    except aiohttp.ClientError: pass
                    await asyncio.sleep(0.05)
                async def post(path, obj):
                    body = json.dumps(obj).encode()
                    async with http.post(base + path, data=body, headers={signing.HEADER: signing.sign(SECRET, body)}) as r:
                        return r.status, await r.json()
                built = ticket('custom', parts={'ears': 'sarvam', 'brain': 'kimi-k2.6', 'voice': 'azure-mai', 'gatedEars': True})
                built['conversationId'] = '0b6f6e1a-1c2d-4e5f-8a9b-0000000000c1'
                st, d = await post('/v1/calls', built); self.assertEqual(st, 202, f'a built stack runs on devsim too: {d}')
                t = ticket(); cid = t['conversationId']
                st, d = await post('/v1/calls', t); self.assertEqual(st, 202, d)
                caller = await http.ws_connect(base + f"/v1/media/sim/{cid}?token={d['join']['token']}")
                opening = await caller.receive_json(); self.assertTrue(opening['sentences'])
                st, d = await post(f'/v1/calls/{cid}/whisper', {'conversationId': cid, 'text': 'renewal date batao', 'by': 'u1'})
                self.assertEqual((st, d), (200, {'ok': True}))
                st, d = await post(f'/v1/calls/{cid}/takeover', {'conversationId': cid, 'memberId': 'm1'})
                self.assertEqual((st, d['join']['kind']), (200, 'takeover'))
                member = await http.ws_connect(base + f"/v1/media/takeover/{cid}?token={d['join']['token']}")
                self.assertEqual((await member.receive_json())['t'], 'ready')
                await member.send_json({'t': 'hangup'}); await member.close(); await asyncio.sleep(0.1)
                body = b''
                async with http.get(base + f'/v1/calls/{cid}', headers={signing.HEADER: signing.sign(SECRET, body)}) as r:
                    self.assertEqual((await r.json())['ended'], 'handed_off')
                await caller.close()
        finally:
            p.terminate()               # shutdown retries undeliverable events (no control plane here), so do not wait long
            try: p.wait(3)
            except subprocess.TimeoutExpired: p.kill(); p.wait(5)


    async def test_browser_call_captions_from_both_sides(self):
        """What the web's "Call me in the browser" relies on: the browser media socket with devsim's fakes. Speech in, her
        audio and both sides' captions out, and a clean hang-up."""
        import numpy as np
        port = free_base(1)
        env = {**os.environ, 'VP_DEVSIM': '1', 'VP_RUNTIME_SECRET': SECRET, 'VP_CONTROL_URL': 'http://127.0.0.1:9', 'PORT': str(port),
               'VP_PUBLIC_URL': f'http://127.0.0.1:{port}', 'VP_LOG_LEVEL': 'WARNING'}
        p = subprocess.Popen([sys.executable, '-m', 'vpvoice.devsim'], cwd=VOICE, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        base = f'http://127.0.0.1:{port}'
        speech = (np.sin(np.arange(320) / 3.0) * 8000).astype('<i2').tobytes(); quiet = b'\x00\x00' * 320
        try:
            async with aiohttp.ClientSession() as http:
                for _ in range(200):
                    try:
                        async with http.get(base + '/v1/health') as r:
                            if r.status == 200: break
                    except aiohttp.ClientError: pass
                    await asyncio.sleep(0.05)
                t = ticket(transport={'kind': 'webrtc', 'offerUrl': '/v1/test-calls/x/offer'}); cid = t['conversationId']
                body = json.dumps(t).encode()
                async with http.post(base + '/v1/calls', data=body, headers={signing.HEADER: signing.sign(SECRET, body)}) as r:
                    d = await r.json(); self.assertEqual(r.status, 202, d)
                j = d['join']; self.assertEqual((j['kind'], j['url']), ('webrtc', f'ws://127.0.0.1:{port}/v1/media/browser/{cid}'))
                ws = await http.ws_connect(f"{j['url']}?token={j['token']}")
                caps, audio = [], 0
                async def read_until(cond, s=8.0):
                    nonlocal audio
                    end = asyncio.get_running_loop().time() + s
                    while not cond():
                        m = await asyncio.wait_for(ws.receive(), max(0.05, end - asyncio.get_running_loop().time()))
                        if m.type == aiohttp.WSMsgType.BINARY: audio += len(m.data) - 4
                        elif m.type == aiohttp.WSMsgType.TEXT:
                            x = json.loads(m.data)
                            if x.get('t') == 'cap': caps.append(x)
                            if os.environ.get('DBG'): print(x, flush=True)
                        else: return
                await read_until(lambda: any(c['who'] == 'agent' for c in caps))           # her opening
                for _ in range(40): await ws.send_bytes(speech)                          # 0.8 s of "speech"
                for _ in range(80): await ws.send_bytes(quiet)
                await read_until(lambda: any(c['who'] == 'caller' and c['final'] for c in caps) and sum(c['who'] == 'agent' for c in caps) >= 2)
                await ws.send_str(json.dumps({'t': 'hangup'})); await ws.close(); await asyncio.sleep(0.2)
                async with http.get(base + f'/v1/calls/{cid}', headers={signing.HEADER: signing.sign(SECRET, b'')}) as r:
                    st = await r.json()
            self.assertGreater(audio, 24000, 'her audio reached the page')
            self.assertIn('Haan ji, boliye.', [c['text'] for c in caps if c['who'] == 'caller' and c['final']])
            self.assertEqual(st['ended'], 'caller_hung_up')
        finally:
            p.terminate()
            try: p.wait(3)
            except subprocess.TimeoutExpired: p.kill(); p.wait(5)


if __name__ == '__main__':
    unittest.main()
