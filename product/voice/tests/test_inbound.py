# Inbound calls, runtime half (must-be audit brief 8), end to end on devsim's fake providers: a fake carrier rings one of
# our numbers (Plivo's answer request), the runtime relays it to a fake control plane (signed like
# /hooks/telephony/inbound), which mints a sip_inbound ticket and starts it on the runtime; the carrier is answered
# with the call's stream, connects it like Plivo's bidirectional stream, and she opens with the inbound opening.
# Synthetic numbers only (90000000xx). No network beyond localhost.
import asyncio, base64, json, os, unittest
import numpy as np
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from tests.fixtures import SECRET, ticket
from vpvoice import signing
from vpvoice.audio import ulaw_encode
from vpvoice.devsim import make_components
from vpvoice.events import MemoryPoster
from vpvoice.server import Runtime

os.environ['VP_VAD'] = 'energy'
TEL_SECRET = 't' * 40
CALLED, CALLER = '+919000000020', '+919000000021'


class Inbound(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.posters = []; self.tickets = []; self.answer = {'who': 'known'}
        # the fake control plane: verifies the relay's signature, mints a sip_inbound ticket, starts it on the runtime
        async def hook(req):
            raw = await req.read(); signing.verify(TEL_SECRET, req.headers.get(signing.HEADER), raw); e = json.loads(raw)
            if self.answer.get('refuse'): return web.json_response({'accepted': False, 'code': 'not_answering', 'message': 'x'}, status=409)
            t = ticket(transport={'kind': 'sip_inbound', 'from': e['from'], 'to': e['to'], 'carrierCallId': e['callId'], 'trunk': 'plivo'}, direction='inbound')
            t['consent'] = {'basis': 'inbound'}; t['attemptId'] = None
            who = self.answer['who']
            t['inbound'] = {'who': who, 'noMarketing': who in ('suppressed', 'erased'), 'calledNumber': e['to']}
            if who == 'unknown_caller': t['contact'].update(displayName='', facts={}, memoryBrief='', memoryStatus='none')
            self.tickets.append(t)
            body = json.dumps(t, ensure_ascii=False).encode()
            r = await self.rt_client.post('/v1/calls', data=body, headers={'content-type': 'application/json', signing.HEADER: signing.sign(SECRET, body)})
            d = await r.json()
            return web.json_response({'accepted': r.status == 202, 'conversationId': t['conversationId'],
                                      'stream': {'url': d['join']['url'], 'token': d['join']['token']}})
        cp = web.Application(); cp.router.add_post('/hooks/telephony/inbound', hook)
        self.cp = TestServer(cp); await self.cp.start_server()
        env = {'VP_RUNTIME_SECRET': SECRET, 'VP_PUBLIC_URL': 'https://voice.example.test', 'VP_CONTROL_URL': str(self.cp.make_url('')).rstrip('/'),
               'VP_TELEPHONY_WEBHOOK_SECRET': TEL_SECRET, 'VP_DEVSIM': '1'}
        def poster(http):
            p = MemoryPoster(SECRET); self.posters.append(p); return p
        self.rt = Runtime(env=env, make_components=make_components, make_poster=poster, watchdog_s=0.05)
        self.rt_client = TestClient(TestServer(self.rt.app())); await self.rt_client.start_server()

    async def asyncTearDown(self):
        await self.rt_client.close(); await self.cp.close()

    def answer_path(self): return self.rt.inbound_answer_url().split('voice.example.test', 1)[1]

    async def ring(self):
        r = await self.rt_client.post(self.answer_path(), data={'From': CALLER, 'To': CALLED, 'CallUUID': 'carrier-call-1', 'Direction': 'inbound'})
        return r.status, await r.text()

    async def carrier_stream(self, xml, speak_s=0.0):
        """Connect the leg like Plivo: start, then 20 ms mu-law frames (quiet, or a tone as speech); collect what she plays."""
        url = xml.split('>wss://voice.example.test', 1)[1].split('</Stream>', 1)[0].replace('&amp;', '&')
        ws = await self.rt_client.ws_connect(url)
        await ws.send_json({'event': 'start', 'sequenceNumber': 1, 'start': {'callId': 'carrier-call-1', 'streamId': 's-1',
                                                                             'mediaFormat': {'encoding': 'audio/x-mulaw', 'sampleRate': 8000}}})
        quiet = base64.b64encode(ulaw_encode(np.zeros(160, dtype=np.float32))).decode()
        played = []
        async def read():
            async for m in ws:
                d = json.loads(m.data)
                if d.get('event') == 'playAudio': played.append(d)
        reader = asyncio.ensure_future(read())
        for i in range(int(2.5 / 0.02)):
            await ws.send_json({'event': 'media', 'media': {'payload': quiet}}); await asyncio.sleep(0.02)
            if played and i > 40: break
        await ws.send_json({'event': 'stop'}); await asyncio.sleep(0.2)
        reader.cancel(); await ws.close()
        return played

    def events(self): return [e for p in self.posters for e in p.events()]

    async def test_a_known_caller_is_answered_and_she_opens(self):
        status, xml = await self.ring()
        self.assertEqual(status, 200); self.assertIn('<Stream bidirectional="true"', xml)
        t = self.tickets[0]
        self.assertEqual((t['transport']['kind'], t['transport']['from'], t['transport']['carrierCallId']), ('sip_inbound', CALLER, 'carrier-call-1'))
        played = await self.carrier_stream(xml)
        self.assertTrue(played, 'her opening reached the caller as playAudio')
        await asyncio.sleep(0.2)
        e = self.events()
        self.assertEqual(e[0]['type'], 'call.started'); self.assertEqual(e[-1]['type'], 'call.ended')
        self.assertEqual(e[-1]['endReason'], 'caller_hung_up')
        agent = [x['text'] for x in e if x['type'] == 'turn' and x['speaker'] == 'agent']
        self.assertTrue(agent and 'AI' in agent[0], 'she opens, disclosure included')
        rec = self.rt.calls[t['conversationId']]
        self.assertEqual(rec.session.conv.history[0]['content'], '(call connected; they phoned you)', 'the inbound opening, not an outbound one')
        self.assertFalse(getattr(rec.session, 'listening_first', False), 'inbound does not listen first for announcements')
        self.assertEqual(rec.call_uuid, 'carrier-call-1', 'transfer, keys and hang-up act on the carrier call')

    async def test_an_unknown_caller_gets_no_name_and_no_identity(self):
        self.answer['who'] = 'unknown_caller'
        status, xml = await self.ring(); await self.carrier_stream(xml)
        sess = self.rt.calls[self.tickets[0]['conversationId']].session
        self.assertFalse(sess.conv.state['identity_verified'])
        self.assertIn('their name is not known', sess.conv.messages_for(None)[-1]['content'])

    async def test_no_marketing_caller(self):
        self.answer['who'] = 'suppressed'
        status, xml = await self.ring(); await self.carrier_stream(xml)
        conv = self.rt.calls[self.tickets[0]['conversationId']].session.conv
        self.assertTrue(conv.no_marketing)
        self.assertIn('must not be offered or sold anything', conv.messages_for(None)[-1]['content'])
        self.assertEqual(conv.door_ctx(False).category, 'service', 'the door holds her to service rules')

    async def test_a_refused_call_is_told_and_hung_up(self):
        self.answer['refuse'] = True
        status, xml = await self.ring()
        self.assertEqual(status, 200); self.assertIn('<Hangup/>', xml); self.assertNotIn('<Stream', xml)

    async def test_the_answer_url_is_signed(self):
        r = await self.rt_client.post('/v1/media/sip/inbound/plivo/' + '0' * 32, data={'From': CALLER, 'To': CALLED, 'CallUUID': 'x'})
        self.assertEqual(r.status, 403)


if __name__ == '__main__':
    unittest.main()
