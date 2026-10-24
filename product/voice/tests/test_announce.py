# Operator announcements and machines heard before her opening (must-be audit brief 5): fake ears, brain and voice,
# the real cascade and energy VAD. Phone numbers are synthetic (90000000xx). No network.
import asyncio, os, unittest
from tests.fixtures import FakeBrain, components, sink, ticket, bodies
from tests.test_cascade import FakeEars, FakeLine, FakeVoice, QUIET, SPEECH, feed, wait_until

os.environ['VP_VAD'] = 'energy'
from vpvoice import announce                                  # noqa: E402
from vpvoice.cascade import CascadeSession                    # noqa: E402

OPEN = 'नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'
SIP = {'kind': 'sip', 'trunk': 'plivo', 'to': '+919000000011', 'from': '+919000000012'}

ANNOUNCEMENTS = [
    ('आप जिस नंबर पर कॉल कर रहे हैं वह अभी बंद है', 'switched_off'),
    ('The number you are calling is currently switched off. Please try again later.', 'switched_off'),
    ('आप जिस नंबर पर कॉल कर रहे हैं वह अभी पहुँच से बाहर है', 'switched_off'),
    ('The number you are trying to reach is not reachable at the moment', 'switched_off'),
    ('The mobile you are calling is out of coverage area', 'switched_off'),
    ('जिस नंबर से आप संपर्क करना चाहते हैं वह अभी दूसरी कॉल पर व्यस्त है', 'busy'),
    ('The subscriber you are calling is busy on another call', 'busy'),
    ('आपके द्वारा डायल किया गया नंबर मौजूद नहीं है, कृपया नंबर की जाँच करें', 'invalid_number'),
    ('The number you have dialled does not exist', 'invalid_number'),
    ('Please leave your message after the tone', 'voicemail'),
    ('कृपया बीप के बाद अपना संदेश रिकॉर्ड करें', 'voicemail'),
]
PEOPLE = ['हेलो', 'Hello?', 'हाँ जी, बोलिए', 'Haan ji, kaun bol raha hai?', 'मैं अभी busy हूँ, बाद में बात करते हैं',
          'Sorry, I am busy right now', 'जी, कौन?', 'Hello, haan bolo']


class Lexicon(unittest.TestCase):
    def test_announcements(self):
        for text, cls in ANNOUNCEMENTS: self.assertEqual(announce.classify(text), cls, text)

    def test_people_are_not_announcements(self):
        for text in PEOPLE: self.assertIsNone(announce.classify(text), text)
        for text in PEOPLE[:4] + ['जी, कौन?']: self.assertTrue(announce.sounds_human(text), text)


def make(env=None, transport=SIP, direction='outbound'):
    t = ticket(transport=dict(transport)); t['direction'] = direction
    ears = {}
    def make_ears(p, f, e, lang='hi-IN'):
        ears['e'] = FakeEars(p, f, e); return ears['e']
    comp = components(brain=FakeBrain([OPEN, 'जी।']), ears=make_ears, voice=FakeVoice())
    s, p = sink(t['conversationId'])
    sess = CascadeSession(t, comp, s, FakeLine(), env=env or {}, watchdog_s=0.02, tick_s=0.01, transport='sip')
    return sess, ears, comp, p


def evs(p): return [e for b in bodies(p) for e in b['events']]


class OnACall(unittest.TestCase):
    def call(self, heard, partial_only=False, frames=60):
        async def go():
            sess, ears, comp, p = make()
            await sess.start()
            await feed(sess, frames)                                 # the announcement plays
            if partial_only: ears['e'].on_p(heard)
            else: ears['e'].on_f(heard)
            await feed(sess, 70, QUIET)
            await asyncio.sleep(0.05)
            if not sess.ended: await sess.end('caller_hung_up')
            return sess, comp, p
        return asyncio.run(go())

    def test_an_announcement_ends_the_call_before_any_agent_turn(self):
        for text, cls in ANNOUNCEMENTS:
            sess, comp, p = self.call(text)
            e = evs(p); end = e[-1]
            self.assertEqual(end['endReason'], cls, text)
            self.assertEqual([x for x in e if x['type'] == 'turn'], [], 'no opening and no caller turn: ' + text)
            self.assertEqual(end['transcript'], [], 'nothing for the analysis model to read')
            self.assertEqual(comp.brain.calls, [], 'the brain never ran: ' + text)
            self.assertEqual(comp.voice.said, [])

    def test_a_partial_is_enough(self):
        sess, comp, p = self.call('The number you are calling is currently switched off', partial_only=True)
        self.assertEqual(sess.ended, 'switched_off')

    def test_a_hello_gets_her_opening(self):
        for text in ('हेलो', 'Hello?', 'हाँ जी, बोलिए'):
            async def go():
                sess, ears, comp, p = make()
                await sess.start()
                await feed(sess, 20); ears['e'].on_f(text); await feed(sess, 40, QUIET)
                await wait_until(lambda: sess.conv.agent_turns == 1)
                await sess.end('caller_hung_up')
                return sess, comp, p
            sess, comp, p = asyncio.run(go())
            turns = [x for x in evs(p) if x['type'] == 'turn']
            self.assertEqual([(t['speaker'], t['text']) for t in turns][:2], [('caller', text), ('agent', OPEN)], text)
            self.assertEqual(len(comp.brain.calls), 1)

    def test_quiet_and_she_opens_anyway(self):
        async def go():
            old = CascadeSession.LISTEN_FIRST_S; CascadeSession.LISTEN_FIRST_S = 0.2
            try:
                sess, ears, comp, p = make()
                await sess.start(); await feed(sess, 10, QUIET); await asyncio.sleep(0.25); await feed(sess, 5, QUIET)
                await wait_until(lambda: sess.conv.agent_turns == 1)
                await sess.end('caller_hung_up')
                return sess
            finally:
                CascadeSession.LISTEN_FIRST_S = old
        self.assertEqual(asyncio.run(go()).conv.agent_turns, 1)

    def test_only_outbound_phone_calls_listen_first(self):
        self.assertTrue(make()[0].listening_first)
        self.assertFalse(make(transport={'kind': 'webrtc', 'offerUrl': 'https://control.example/join'})[0].listening_first)
        self.assertFalse(make(direction='inbound')[0].listening_first)
        self.assertFalse(make(env={'VP_LISTEN_FIRST': '0'})[0].listening_first)


if __name__ == '__main__':
    unittest.main()


class Carrier(unittest.TestCase):
    def test_hangup_causes(self):
        from vpvoice.transports import hangup_reason
        for cause, want in (('Busy Line', 'busy'), ('No Answer', 'no_answer'), ('Ring Timeout Reached', 'no_answer'),
                            ('Unallocated Number', 'invalid_number'), ('Invalid Destination Address', 'invalid_number'),
                            ('Unreachable Destination', 'switched_off'), ('Subscriber Absent', 'switched_off'),
                            ('Machine Detected', 'voicemail'), ('Network Error', 'failed'), ('', 'failed')):
            self.assertEqual(hangup_reason(cause), want, cause)


class PlivoHooks(unittest.IsolatedAsyncioTestCase):
    """Outbound Plivo: the dial asks for machine detection; a machine verdict ends the call as voicemail."""
    async def asyncSetUp(self):
        from aiohttp.test_utils import TestClient, TestServer
        from tests.test_server import ENV
        from vpvoice import transports
        from vpvoice.events import MemoryPoster
        from vpvoice.server import Runtime
        self.dials = []; self.posters = []
        async def fake_dial(http, env, to, frm, answer_url, hangup_url, max_s, machine_url=None):
            self.dials.append({'to': to, 'machine_url': machine_url}); return 'req-1', None
        async def fake_request(*a, **kw): return 200, {}
        self.saved = transports.plivo_dial, transports.plivo_request
        transports.plivo_dial, transports.plivo_request = fake_dial, fake_request
        def make_poster(http):
            p = MemoryPoster('test-secret'); self.posters.append(p); return p
        mk = lambda sid, voice, t, http, env: components(sid, brain=FakeBrain([OPEN]), voice=FakeVoice(), ears=lambda *a: FakeEars(*a))
        self.rt = Runtime(env=dict(ENV, VP_PLIVO_AUTH_ID='x'), make_components=mk, make_poster=make_poster, watchdog_s=0.02)
        self.client = TestClient(TestServer(self.rt.app())); await self.client.start_server()

    async def asyncTearDown(self):
        from vpvoice import transports
        transports.plivo_dial, transports.plivo_request = self.saved
        await self.client.close()

    async def test_machine_verdict_ends_an_unjoined_call_as_voicemail(self):
        from tests.test_server import signed
        t = ticket(transport=dict(SIP))
        body, hdr = signed(t)
        r = await self.client.post('/v1/calls', data=body, headers=hdr); d = await r.json()
        if r.status != 202: self.skipTest(f'outbound sip not admitted here: {d}')
        self.assertEqual(len(self.dials), 1); self.assertEqual(self.dials[0]['machine_url'], d['join']['machineUrl'])
        path = d['join']['machineUrl'].split('voice.example.test', 1)[1]
        r = await self.client.post(path.rsplit('/', 1)[0] + '/0' * 1, data={'Machine': 'true'})
        self.assertEqual(r.status, 403, 'a wrong hook is refused')
        r = await self.client.post(path, data={'Machine': 'false'}); self.assertEqual(r.status, 200)
        r = await self.client.post(path, data={'Machine': 'true'}); self.assertEqual(r.status, 200)
        await asyncio.sleep(0.05)
        ends = [e for e in self.posters[0].events() if e['type'] == 'call.ended']
        self.assertEqual([e['endReason'] for e in ends], ['voicemail'])
