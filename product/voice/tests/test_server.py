# The HTTP surface on a local test server (no outside network): signed intake, refusals, idempotency, single-use
# join tokens, the sim websocket end to end, the browser media socket, the end route, health.
import asyncio, copy, json, os, struct, unittest
from aiohttp.test_utils import TestClient, TestServer
from tests.fixtures import SECRET, FakeBrain, components, ticket
from tests.test_cascade import FakeEars, FakeVoice, SPEECH
from vpvoice import signing
from vpvoice.events import MemoryPoster
from vpvoice.server import Runtime

os.environ['VP_VAD'] = 'energy'
ENV = {'VP_RUNTIME_SECRET': SECRET, 'VP_PUBLIC_URL': 'https://voice.example.test', 'VP_CONTROL_URL': 'https://control.example.test'}


def signed(obj, t_ms=None, secret=SECRET):
    body = json.dumps(obj, ensure_ascii=False).encode()
    return body, {'content-type': 'application/json', signing.HEADER: signing.sign(secret, body, t_ms)}


class Base(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.posters = []; self.brains = []

        def make_components(sid, voice, t, http, env):
            b = FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'जी, renewal 2 November को है।', 'शुक्रिया, अपना ख्याल रखिए, bye! <end_call>'])
            self.brains.append(b)
            return components(sid, brain=b, voice=FakeVoice(), ears=lambda *a: FakeEars(*a))

        def make_poster(http):
            p = MemoryPoster(SECRET); self.posters.append(p); return p

        self.rt = Runtime(env=dict(ENV), make_components=make_components, make_poster=make_poster, watchdog_s=0.02)
        self.client = TestClient(TestServer(self.rt.app()))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()

    async def post_ticket(self, t, **kw):
        body, hdr = signed(t, **kw)
        return await self.client.post('/v1/calls', data=body, headers=hdr)


class Server(Base):
    async def test_health(self):
        r = await self.client.get('/v1/health'); d = await r.json()
        self.assertEqual(r.status, 200)
        self.assertEqual(len(d['stacks']), 7)
        self.assertTrue(d['signing'])
        self.assertNotIn(SECRET, json.dumps(d))

    async def test_unsigned_tampered_and_stale_refused(self):
        body = json.dumps(ticket()).encode()
        r = await self.client.post('/v1/calls', data=body); self.assertEqual(r.status, 401)
        _, hdr = signed(ticket())
        r = await self.client.post('/v1/calls', data=body + b' ', headers=hdr); self.assertEqual(r.status, 401)
        r = await self.post_ticket(ticket(), t_ms=1_000_000_000_000); self.assertEqual(r.status, 401)
        r = await self.post_ticket(ticket(), secret='wrong'); self.assertEqual(r.status, 401)

    async def test_non_uuid_conversation_id_refused_before_the_call_opens(self):
        t = ticket(); t['conversationId'] = 'conv_test_1'
        r = await self.post_ticket(t); d = await r.json()
        self.assertEqual((r.status, d['error']), (422, 'bad_ticket'))
        self.assertEqual(self.rt.calls, {}); self.assertEqual(self.posters, [], 'no call, no event sink, no events')

    async def test_unknown_stack_refused(self):
        t = ticket(); t['stack']['id'] = 'v0-default'; t['agent']['voice']['stackId'] = 'v0-default'
        r = await self.post_ticket(t); d = await r.json()
        self.assertEqual((r.status, d['error']), (422, 'unknown_stack'))

    async def test_missing_credentials_refused(self):
        rt = Runtime(env=dict(ENV))              # real adapter registry, no provider keys in env
        c = TestClient(TestServer(rt.app())); await c.start_server()
        try:
            body, hdr = signed(ticket('sarvam-india'))
            r = await c.post('/v1/calls', data=body, headers=hdr); d = await r.json()
            self.assertEqual((r.status, d['error'], d['missing']), (503, 'stack_unavailable', ['SARVAM']))
        finally:
            await c.close()

    async def test_idempotent_retry_and_conflict(self):
        t = ticket()
        r1 = await self.post_ticket(t); d1 = await r1.json()
        r2 = await self.post_ticket(t); d2 = await r2.json()
        self.assertEqual((r1.status, r2.status), (202, 202))
        self.assertEqual(d1['join']['token'], d2['join']['token'])
        t2 = copy.deepcopy(t); t2['limits']['maxCostInrMilli'] = 1234
        r3 = await self.post_ticket(t2); self.assertEqual(r3.status, 409)

    async def test_sim_call_over_the_socket(self):
        r = await self.post_ticket(ticket()); d = await r.json()
        self.assertEqual(r.status, 202)
        j = d['join']; self.assertEqual(j['kind'], 'sim')
        with self.assertRaises(Exception): await self.client.ws_connect('/v1/media/sim/0b6f6e1a-1c2d-4e5f-8a9b-000000000001?token=nope')
        ws = await self.client.ws_connect(f"/v1/media/sim/0b6f6e1a-1c2d-4e5f-8a9b-000000000001?token={j['token']}")
        m = await ws.receive_json(); self.assertIn('AI', m['sentences'][0])
        await ws.send_json({'t': 'say', 'text': 'हाँ जी, बोलिए'}); m = await ws.receive_json()
        self.assertEqual(m['sentences'], ['जी, renewal 2 November को है।'])
        await ws.send_json({'t': 'say', 'text': 'ठीक है, thank you'}); m = await ws.receive_json()
        self.assertEqual(m['ended'], 'agent_ended')
        await ws.close()
        with self.assertRaises(Exception): await self.client.ws_connect(f"/v1/media/sim/0b6f6e1a-1c2d-4e5f-8a9b-000000000001?token={j['token']}")   # single use
        await asyncio.sleep(0.05)
        p = self.posters[0]
        e = p.events()
        self.assertEqual(e[0]['type'], 'call.started'); self.assertEqual(e[-1]['type'], 'call.ended')
        self.assertEqual([x['seq'] for x in e], list(range(1, len(e) + 1)))
        for b, h in zip(p.bodies, p.headers): signing.verify(SECRET, h, b)

    async def test_end_route(self):
        r = await self.post_ticket(ticket()); j = (await r.json())['join']
        ws = await self.client.ws_connect(f"/v1/media/sim/0b6f6e1a-1c2d-4e5f-8a9b-000000000001?token={j['token']}")
        await ws.receive_json()
        body, hdr = signed({'conversationId': '0b6f6e1a-1c2d-4e5f-8a9b-000000000001', 'endReason': 'completed'})
        r = await self.client.post('/v1/calls/0b6f6e1a-1c2d-4e5f-8a9b-000000000001/end', data=body, headers=hdr)
        self.assertEqual((r.status, (await r.json())['endReason']), (200, 'completed'))
        r = await self.client.post('/v1/calls/0b6f6e1a-1c2d-4e5f-8a9b-000000000001/end', data=body); self.assertEqual(r.status, 401)
        _, hdr = signed({}); hdr[signing.HEADER] = signing.sign(SECRET, b'')
        r = await self.client.get('/v1/calls/0b6f6e1a-1c2d-4e5f-8a9b-000000000001', headers=hdr); d = await r.json()
        self.assertEqual(d['ended'], 'completed')
        await ws.close()

    async def test_unjoined_call_still_reports(self):
        r = await self.post_ticket(ticket()); self.assertEqual(r.status, 202)
        token = (await r.json())['join']['token']
        body, hdr = signed({'conversationId': '0b6f6e1a-1c2d-4e5f-8a9b-000000000001'})
        await self.client.post('/v1/calls/0b6f6e1a-1c2d-4e5f-8a9b-000000000001/end', data=body, headers=hdr)
        await asyncio.sleep(0.05)
        e = self.posters[0].events()
        self.assertEqual([x['type'] for x in e], ['call.started', 'call.ended'])
        with self.assertRaises(Exception): await self.client.ws_connect(f'/v1/media/sim/0b6f6e1a-1c2d-4e5f-8a9b-000000000001?token={token}')   # ended: no join

    async def test_end_signature_cannot_be_replayed_onto_another_call(self):
        await self.post_ticket(ticket())
        hdr = {signing.HEADER: signing.sign(SECRET, b'')}                    # e.g. captured from a status GET
        r = await self.client.post('/v1/calls/0b6f6e1a-1c2d-4e5f-8a9b-000000000001/end', data=b'', headers=hdr); self.assertEqual(r.status, 400)
        body, hdr = signed({'conversationId': '0b6f6e1a-1c2d-4e5f-8a9b-0000000000ff'})
        r = await self.client.post('/v1/calls/0b6f6e1a-1c2d-4e5f-8a9b-000000000001/end', data=body, headers=hdr); self.assertEqual(r.status, 400)

    async def test_garbage_signature_is_401_not_500(self):
        body = json.dumps(ticket()).encode()
        r = await self.client.post('/v1/calls', data=body, headers={signing.HEADER: 't=1,v1=' + 'é' * 64}); self.assertEqual(r.status, 401)

    async def test_browser_media_socket(self):
        t = ticket(transport={'kind': 'webrtc', 'offerUrl': 'https://control.example.test/join/abc'})
        r = await self.post_ticket(t); j = (await r.json())['join']
        self.assertEqual(j['url'], 'wss://voice.example.test/v1/media/browser/0b6f6e1a-1c2d-4e5f-8a9b-000000000001')
        ws = await self.client.ws_connect(f"/v1/media/browser/0b6f6e1a-1c2d-4e5f-8a9b-000000000001?token={j['token']}")
        ready = json.loads((await ws.receive()).data); self.assertEqual(ready['t'], 'ready')
        got_audio = False
        for _ in range(200):
            m = await asyncio.wait_for(ws.receive(), 3)
            if m.type.name == 'BINARY':
                rid = struct.unpack('<I', m.data[:4])[0]; self.assertEqual(rid, 1); got_audio = True; break
        self.assertTrue(got_audio)
        for _ in range(5): await ws.send_bytes(SPEECH)
        await ws.send_str(json.dumps({'t': 'hangup'}))
        await ws.close(); await asyncio.sleep(0.1)
        e = self.posters[0].events()
        self.assertEqual(e[-1]['type'], 'call.ended'); self.assertEqual(e[-1]['endReason'], 'caller_hung_up')

    async def test_sip_inbound_offers_a_stream_url(self):
        t = ticket(transport={'kind': 'sip', 'to': '+919000000001', 'from': '+919000000002', 'trunk': 'exotel'}, direction='inbound')
        r = await self.post_ticket(t); d = await r.json()
        self.assertEqual(r.status, 202)
        self.assertTrue(d['join']['streamUrl'].startswith('wss://voice.example.test/v1/media/sip/stream/0b6f6e1a-1c2d-4e5f-8a9b-000000000001?token='))
        t2 = ticket(transport={'kind': 'sip', 'to': '+919000000001', 'from': '+919000000002', 'trunk': 'exotel'}); t2['conversationId'] = '0b6f6e1a-1c2d-4e5f-8a9b-000000000002'
        r = await self.post_ticket(t2); self.assertEqual((r.status, (await r.json())['error']), (422, 'unsupported_trunk'))



def cid(i): return f'0b6f6e1a-1c2d-4e5f-8a9b-{i:012d}'


class Admission(Base):
    """VP_MAX_CALLS_PER_PROCESS: past the cap a ticket is refused at intake, before any record, sink or event."""
    async def asyncSetUp(self):
        ENV['VP_MAX_CALLS_PER_PROCESS'] = '2'; ENV['VP_WORKER_ID'] = 'w3'
        try: await super().asyncSetUp()
        finally: del ENV['VP_MAX_CALLS_PER_PROCESS'], ENV['VP_WORKER_ID']

    async def ticket_for(self, i):
        t = ticket(); t['conversationId'] = cid(i); return t

    async def capacity(self):
        return (await (await self.client.get('/v1/health')).json())

    async def test_cap_refuses_before_any_record_sink_or_event(self):
        for i in (1, 2): self.assertEqual((await self.post_ticket(await self.ticket_for(i))).status, 202)
        h = await self.capacity()
        self.assertEqual((h['capacity'], h['worker']), ({'admitted': 2, 'max': 2, 'free': 0}, 'w3'))
        r = await self.post_ticket(await self.ticket_for(3)); d = await r.json()
        self.assertEqual((r.status, d['error'], d['placed'], r.headers['Retry-After']), (503, 'at_capacity', False, str(d['retryAfterS'])))
        self.assertNotIn(cid(3), self.rt.calls)
        self.assertEqual((len(self.posters), len(self.brains)), (2, 2), 'no sink and no components for the refused call')
        self.assertEqual(sum(len(p.bodies) for p in self.posters), 0, 'unjoined calls have posted nothing yet; the refusal posted nothing')
        # a retry of an accepted ticket is not a new call: it still gets its join, cap or no cap
        self.assertEqual((await self.post_ticket(await self.ticket_for(1))).status, 202)

    async def test_slot_frees_when_a_call_ends(self):
        r = await self.post_ticket(await self.ticket_for(1)); j = (await r.json())['join']
        await self.post_ticket(await self.ticket_for(2))
        self.assertEqual((await self.post_ticket(await self.ticket_for(3))).status, 503)
        ws = await self.client.ws_connect(f"/v1/media/sim/{cid(1)}?token={j['token']}")
        await ws.receive_json()
        self.assertEqual((await self.capacity())['capacity']['admitted'], 2, 'a joined call still holds its slot')
        await ws.send_json({'t': 'hangup'}); await ws.close(); await asyncio.sleep(0.05)
        self.assertEqual((await self.capacity())['capacity'], {'admitted': 1, 'max': 2, 'free': 1})
        self.assertEqual((await self.post_ticket(await self.ticket_for(3))).status, 202)
        # an unjoined call ended by the control plane frees its slot too
        body, hdr = signed({'conversationId': cid(2)})
        await self.client.post(f'/v1/calls/{cid(2)}/end', data=body, headers=hdr); await asyncio.sleep(0.05)
        self.assertEqual((await self.capacity())['capacity']['admitted'], 1)
        self.assertEqual((await self.post_ticket(await self.ticket_for(4))).status, 202)

    async def test_default_cap_is_20(self):
        self.assertEqual(Runtime(env=dict(ENV)).max_calls, 20)


if __name__ == '__main__':
    unittest.main()
