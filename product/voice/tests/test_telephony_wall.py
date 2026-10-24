# The runtime's half of the live phone path (telephony builder's asks, 2026-10-24): Plivo's V3 signature on every
# carrier callback (the shared vectors), a nonce seen twice is refused, the dial allowlist in front of Plivo, a fake Plivo
# on this machine via VP_PLIVO_API_BASE (and nowhere else), and a stream URL that lives 60 s from its answer XML.
# Synthetic numbers only (90000000xx).
import json, os, time, unittest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from tests.fixtures import ticket
from tests.test_server import ENV, Base, signed
from vpvoice import plivo_sig, transports

VECTORS = json.load(open(os.path.join(os.path.dirname(__file__), '..', '..', 'tests', 'fixtures', 'plivo-v3-vectors.json')))
TOKEN = 'synthetic-plivo-token-abcdef'
TO = '+919000000011'


class Signature(unittest.TestCase):
    def test_shared_vectors(self):
        for v in VECTORS['vectors']:
            b = plivo_sig.base(v['method'], v['url'], v['params'])
            self.assertEqual(b, v['base'], v['url'])
            self.assertEqual(plivo_sig.sign(VECTORS['token'], b, v['nonce']), v['signature'])
            self.assertTrue(plivo_sig.valid(VECTORS['token'], v['method'], v['url'], v['params'], v['nonce'], 'junk, ' + v['signature']))
            self.assertFalse(plivo_sig.valid('other-token', v['method'], v['url'], v['params'], v['nonce'], v['signature']))

    def test_nonce_once(self):
        now = [1000.0]; n = plivo_sig.Nonces(clock=lambda: now[0])
        self.assertTrue(n.fresh('a')); self.assertFalse(n.fresh('a'))
        now[0] += plivo_sig.NONCE_TTL_S + 1; self.assertTrue(n.fresh('a'))


class Walls(unittest.TestCase):
    def test_api_base_only_on_this_machine(self):
        self.assertEqual(transports.plivo_api({'PLIVO_AUTH_ID': 'MA1', 'VP_PLIVO_API_BASE': 'http://127.0.0.1:9999/'}), 'http://127.0.0.1:9999/v1/Account/MA1/')
        self.assertEqual(transports.plivo_api({'PLIVO_AUTH_ID': 'MA1', 'VP_PLIVO_API_BASE': 'http://localhost:1'}), 'http://localhost:1/v1/Account/MA1/')
        for b in ('https://evil.example.test', 'http://127.0.0.1.example.test', ''):
            self.assertEqual(transports.plivo_api({'PLIVO_AUTH_ID': 'MA1', 'VP_PLIVO_API_BASE': b}), 'https://api.plivo.com/v1/Account/MA1/')

    def test_allowlist(self):
        A = transports.allowed_to
        self.assertIsNone(A({}, TO), 'no carrier credentials: devsim and tests')
        self.assertIn('VP_TELEPHONY_ALLOWED_TO', A({'PLIVO_AUTH_ID': 'MA1'}, TO), 'credentials and no list: refused')
        self.assertIsNone(A({'PLIVO_AUTH_ID': 'MA1', 'VP_TELEPHONY_ALLOWLIST': 'off'}, TO))
        self.assertIsNone(A({'VP_TELEPHONY_ALLOWED_TO': '+919000000012, +91 90000 00011'}, TO))
        self.assertIsNotNone(A({'VP_TELEPHONY_ALLOWED_TO': '+919000000012'}, TO))


class LivePath(Base):
    """Control plane -> runtime -> a fake Plivo on this machine, then Plivo's callbacks, signed."""
    async def asyncSetUp(self):
        self.dials = []
        async def call(req):
            self.dials.append((req.match_info['acct'], await req.json(), req.headers.get('Authorization', '')))
            return web.json_response({'request_uuid': 'req-uuid-1', 'message': 'call fired'}, status=201)
        app = web.Application(); app.router.add_post('/v1/Account/{acct}/Call/', call)
        self.plivo = TestServer(app, host='127.0.0.1'); await self.plivo.start_server()
        ENV.update({'PLIVO_AUTH_ID': 'MA_SYNTH', 'PLIVO_AUTH_TOKEN': TOKEN, 'VP_PLIVO_API_BASE': str(self.plivo.make_url('')), 'VP_TELEPHONY_ALLOWED_TO': TO})
        try: await super().asyncSetUp()
        finally:
            for k in ('PLIVO_AUTH_ID', 'PLIVO_AUTH_TOKEN', 'VP_PLIVO_API_BASE', 'VP_TELEPHONY_ALLOWED_TO'): ENV.pop(k)

    async def asyncTearDown(self):
        await super().asyncTearDown(); await self.plivo.close()

    def t(self, to=TO, i=1):
        t = ticket(transport={'kind': 'sip', 'to': to, 'from': '+919000000001', 'trunk': 'plivo'}); t['conversationId'] = f'0b6f6e1a-1c2d-4e5f-8a9b-{i:012d}'
        return t

    async def carrier(self, url, form, nonce, sig=None):
        path = url.replace(ENV['VP_PUBLIC_URL'], '')
        s = sig if sig is not None else plivo_sig.sign(TOKEN, plivo_sig.base('POST', url, form), nonce)
        return await self.client.post(path, data=form, headers={'X-Plivo-Signature-V3': s, 'X-Plivo-Signature-V3-Nonce': nonce})

    async def test_dial_through_the_fake_plivo_then_signed_callbacks(self):
        r = await self.post_ticket(self.t()); d = await r.json()
        self.assertEqual(r.status, 202, d)
        self.assertEqual(len(self.dials), 1)
        acct, body, auth = self.dials[0]
        self.assertEqual((acct, body['to'], body['answer_method']), ('MA_SYNTH', '919000000011', 'POST'))
        self.assertTrue(auth.startswith('Basic '))
        ans = d['join']['answerUrl']; form = {'CallUUID': 'call-uuid-1', 'From': '919000000001', 'To': '919000000011'}
        self.assertEqual((await self.carrier(ans, form, 'n-1', sig='')).status, 401, 'unsigned')
        self.assertEqual((await self.carrier(ans, form, 'n-1', sig=plivo_sig.sign('wrong', 'x', 'n-1'))).status, 401, 'wrong token')
        ok = await self.carrier(ans, form, 'n-1')
        self.assertEqual(ok.status, 200); self.assertIn('<Stream', await ok.text())
        self.assertEqual((await self.carrier(ans, form, 'n-1')).status, 401, 'a replayed nonce')
        rec = self.rt.calls[self.t()['conversationId']]
        self.assertEqual(rec.call_uuid, 'call-uuid-1')
        self.assertAlmostEqual(rec.stream_from, time.time(), delta=5)
        # the stream token: single use, and only within STREAM_TTL_S of the answer XML
        rec.stream_from -= 61
        ws = await self.client.get(f"/v1/media/sip/stream/{rec.t['conversationId']}?token={rec.token}")
        self.assertEqual(ws.status, 403)
        hang = await self.carrier(d['join']['hangupUrl'], {'CallUUID': 'call-uuid-1', 'HangupCauseName': 'Normal Hangup', 'HangupCauseCode': '4000'}, 'n-2')
        self.assertEqual(hang.status, 200)

    async def test_number_off_the_list_is_never_dialled(self):
        r = await self.post_ticket(self.t(to='+919000000099', i=2)); d = await r.json()
        self.assertEqual((r.status, d['error']), (422, 'not_allowlisted'))
        self.assertEqual(self.dials, []); self.assertNotIn(self.t(i=2)['conversationId'], self.rt.calls)

    async def test_stream_before_any_answer_is_refused(self):
        r = await self.post_ticket(self.t(i=3)); d = await r.json()
        rec = self.rt.calls[self.t(i=3)['conversationId']]
        ws = await self.client.get(f"/v1/media/sip/stream/{rec.t['conversationId']}?token={rec.token}")
        self.assertEqual(ws.status, 403, 'no answer XML was handed out yet')


if __name__ == '__main__':
    unittest.main()
