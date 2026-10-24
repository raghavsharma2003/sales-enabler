# The Plivo payloads as Plivo's public docs give them (tests/plivo_fixtures.json, research/2026-10-24/plivo-amd):
# the hang-up causes, the machine-detection callback, the stream's dtmf event and the Send DTMF call. Plivo is faked.
import asyncio, json, os, unittest
from tests.fixtures import FakeBrain, components, ticket
from tests.test_cascade import FakeEars, FakeVoice
from vpvoice import transports

F = json.load(open(os.path.join(os.path.dirname(__file__), 'plivo_fixtures.json'), encoding='utf-8'))
SIP = {'kind': 'sip', 'trunk': 'plivo', 'to': '+919000000011', 'from': '+919000000012'}


class Causes(unittest.TestCase):
    def test_every_documented_cause(self):
        for c in F['hangup_callbacks']['cases']:
            self.assertEqual(transports.hangup_reason(c.get('HangupCauseName') or c.get('HangupCause'), c.get('HangupCauseCode')), c['want'], c)
            if c.get('HangupCause'): self.assertEqual(transports.hangup_reason(c['HangupCause']), c['want'], ('cause alone', c))

    def test_stream_dtmf_event(self):
        self.assertEqual(transports.PlivoLine.__new__(transports.PlivoLine).on_event(F['stream_dtmf_event']['event']), ('dtmf', '5'))


class Hooks(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from aiohttp.test_utils import TestClient, TestServer
        from tests.test_server import ENV, signed
        from vpvoice.events import MemoryPoster
        from vpvoice.server import Runtime
        self.signed = signed; self.sent = []; self.posters = []
        async def dial(*a, **kw): return 'req-1', None
        async def req(http, env, method, path, data=None): self.sent.append((method, path, data)); return 200, F['send_dtmf']['response']
        self.saved = transports.plivo_dial, transports.plivo_request
        transports.plivo_dial, transports.plivo_request = dial, req
        def poster(http):
            p = MemoryPoster('test-secret'); self.posters.append(p); return p
        mk = lambda sid, voice, t, http, env: components(sid, brain=FakeBrain(['नमस्ते']), voice=FakeVoice(), ears=lambda *a: FakeEars(*a))
        self.rt = Runtime(env=dict(ENV), make_components=mk, make_poster=poster, watchdog_s=0.02)
        self.client = TestClient(TestServer(self.rt.app())); await self.client.start_server()

    async def asyncTearDown(self):
        transports.plivo_dial, transports.plivo_request = self.saved
        await self.client.close()

    async def place(self, n):
        t = ticket(transport=dict(SIP)); t['conversationId'] = f'0b6f6e1a-1c2d-4e5f-8a9b-{n:012d}'
        body, hdr = self.signed(t)
        d = await (await self.client.post('/v1/calls', data=body, headers=hdr)).json()
        return t['conversationId'], d['join']

    async def test_the_documented_machine_callback_ends_as_voicemail(self):
        cid, join = await self.place(11)
        path = join['machineUrl'].split('voice.example.test', 1)[1]
        self.assertEqual((await self.client.post(path, data=F['machine_detection_callback']['form'])).status, 200)
        await asyncio.sleep(0.05)
        self.assertEqual([e['endReason'] for e in self.posters[0].events() if e['type'] == 'call.ended'], ['voicemail'])

    async def test_a_documented_hangup_before_join(self):
        cid, join = await self.place(12)
        path = join['hangupUrl'].split('voice.example.test', 1)[1]
        form = dict(F['hangup_callbacks']['base'], HangupCause='UNALLOCATED_NUMBER', HangupCauseName='Unallocated number', HangupCauseCode='3050')
        self.assertEqual((await self.client.post(path, data=form)).status, 200)
        await asyncio.sleep(0.05)
        self.assertEqual([e['endReason'] for e in self.posters[0].events() if e['type'] == 'call.ended'], ['invalid_number'])

    async def test_send_dtmf_as_documented(self):
        from vpvoice.server import CallRecord
        rec = CallRecord(ticket(transport=dict(SIP)), 'h', None, None, 'tok', {}); rec.call_uuid = 'uuid-3'
        self.assertTrue(await self.rt.send_dtmf(rec, '1'))
        self.assertEqual(self.sent, [('POST', 'Call/uuid-3/DTMF/', F['send_dtmf']['body'])])


if __name__ == '__main__':
    unittest.main()
