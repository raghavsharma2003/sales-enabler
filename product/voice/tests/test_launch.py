# The multi-process launcher: two real worker processes (the bench's fake-provider worker, so no keys and no network
# beyond localhost) behind the front, each capped at one call. Tickets spread across workers, overflow when one is
# full, are refused with at_capacity only when all are; a retried ticket goes back to its owner; /end reaches the owner
# and frees its slot; health sums the workers; a worker's media socket is reachable through /w/<i>/.
import asyncio, json, os, socket, sys, time, unittest
import aiohttp
from aiohttp.test_utils import TestClient, TestServer
from tests.fixtures import ticket
from vpvoice import signing
from vpvoice.launch import Front, nginx_conf

HERE = os.path.dirname(os.path.abspath(__file__))
BENCH = os.path.join(os.path.dirname(HERE), 'bench', 'audio_bench.py')
SECRET = 'bench-secret-not-real'           # the bench worker's own test secret


def free_base(n):
    for base in range(23000, 60000, 97):
        try:
            socks = []
            for i in range(n):
                s = socket.socket(); socks.append(s); s.bind(('127.0.0.1', base + i))
            return base
        except OSError:
            continue
        finally:
            for s in socks: s.close()
    raise RuntimeError('no free ports')


def cid(i): return f'0b6f6e1a-1c2d-4e5f-8a9b-{i:012d}'


class Launcher(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        base = free_base(2)
        env = {**os.environ, 'VP_MAX_CALLS_PER_PROCESS': '1', 'VP_VAD': 'energy'}
        self.front = Front(2, base, [sys.executable, BENCH, '--serve', '{port}'], env, poll_s=0.1)
        self.client = TestClient(TestServer(self.front.app('http://front.example.test')))
        await self.client.start_server()
        for _ in range(300):                               # worker start-up (imports) takes a few seconds
            h = await (await self.client.get('/v1/health')).json()
            if h.get('ok'): break
            await asyncio.sleep(0.1)
        self.assertTrue(h['ok'], h)

    async def asyncTearDown(self):
        await self.client.close()
        self.assertTrue(all(p.returncode is not None for p in self.front.procs), 'workers stop with the front')

    async def post(self, path, obj):
        body = json.dumps(obj).encode()
        return await self.client.post(path, data=body, headers={'content-type': 'application/json', signing.HEADER: signing.sign(SECRET, body)})

    async def settle(self):
        await asyncio.sleep(0.4)                           # two health polls

    async def test_spread_overflow_refuse_retry_end(self):
        h = await (await self.client.get('/v1/health')).json()
        self.assertEqual((h['capacity'], [w['worker'] for w in h['workers']]), ({'admitted': 0, 'max': 2, 'free': 2}, ['w0', 'w1']))
        self.assertIs(h['customStacks'], True, 'forwarded from the workers')
        self.assertEqual(set(h['components']), {'ears', 'brain', 'voice', 's2s'})
        self.assertEqual(h['components']['ears']['azure']['missing'], ['AZURE_SPEECH'])
        joins = []
        for i in (1, 2):
            t = ticket(); t['conversationId'] = cid(i)
            r = await self.post('/v1/calls', t); d = await r.json()
            self.assertEqual(r.status, 202, d); joins.append(d['join'])
        self.assertEqual({j['url'].split('/w/')[1].split('/')[0] for j in joins}, {'0', '1'}, 'one call on each worker, URLs name it')
        t = ticket(); t['conversationId'] = cid(3)
        r = await self.post('/v1/calls', t); d = await r.json()
        self.assertEqual((r.status, d['error'], d['placed']), (503, 'at_capacity', False))
        self.assertIn('Retry-After', r.headers)
        # the retry of an accepted ticket goes to its owner and gets the same join, even with every worker full
        t1 = ticket(); t1['conversationId'] = cid(1)
        r = await self.post('/v1/calls', t1); self.assertEqual((r.status, (await r.json())['join']), (202, joins[0]))
        await self.settle()
        self.assertEqual((await (await self.client.get('/v1/health')).json())['capacity'], {'admitted': 2, 'max': 2, 'free': 0})
        r = await self.post(f'/v1/calls/{cid(2)}/whisper', {'conversationId': cid(2), 'text': 'x'})
        self.assertEqual((r.status, (await r.json())['reason']), (409, 'call is not joined'), 'live controls reach the owner')
        r = await self.post(f'/v1/calls/{cid(2)}/end', {'conversationId': cid(2)}); self.assertEqual(r.status, 200)
        r = await self.post(f'/v1/calls/{cid(9)}/end', {'conversationId': cid(9)}); self.assertEqual(r.status, 404)
        await self.settle()
        self.assertEqual((await (await self.client.get('/v1/health')).json())['capacity']['free'], 1)
        r = await self.post('/v1/calls', t); self.assertEqual(r.status, 202, 'the freed slot takes the refused call')

    async def test_media_socket_through_the_worker_prefix(self):
        t = ticket(); t['conversationId'] = cid(5)
        j = (await (await self.post('/v1/calls', t)).json())['join']
        path = j['url'].split('front.example.test', 1)[1]
        ws = await self.client.ws_connect(f"{path}?token={j['token']}")
        m = await ws.receive_json(); self.assertEqual(m['t'], 'agent')
        await ws.send_json({'t': 'hangup'}); await ws.close()
        with self.assertRaises(aiohttp.WSServerHandshakeError): await self.client.ws_connect(f"{path}?token={j['token']}")



class NginxConf(unittest.TestCase):
    def test_nginx_conf_routes_each_worker(self):
        conf = nginx_conf({'PORT': '8080', 'VP_WORKERS': '3'})
        for i, p in enumerate((8081, 8082, 8083)): self.assertIn(f'location /w/{i}/ {{ proxy_pass http://127.0.0.1:{p}/;', conf)
        self.assertIn('proxy_pass http://127.0.0.1:8084;', conf)


if __name__ == '__main__':
    unittest.main()
