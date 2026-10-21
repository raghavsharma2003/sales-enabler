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


if __name__ == '__main__':
    unittest.main()
