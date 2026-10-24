# DTMF (must-be audit 8): keypad presses in, as a caller turn (never the digits of a PIN or OTP), and her <dtmf N> out
# to an automated menu she reached, through Plivo's send-digits API (faked). Fake ears/brain/voice; no network.
import asyncio, json, os, unittest
from tests.fixtures import FakeBrain, components, sink, ticket
from tests.test_cascade import FakeEars, FakeLine, FakeVoice, QUIET, feed, wait_until

os.environ['VP_VAD'] = 'energy'
from vpvoice import brief, transports                 # noqa: E402
from vpvoice.cascade import CascadeSession             # noqa: E402

OPEN = 'नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'


def make(script):
    t = ticket(transport={'kind': 'webrtc', 'offerUrl': 'https://control.example/join'})
    comp = components(brain=FakeBrain(script), ears=lambda p, f, e, lang='hi-IN': FakeEars(p, f, e), voice=FakeVoice())
    s, p = sink(t['conversationId'])
    sess = CascadeSession(t, comp, s, FakeLine(), env={}, watchdog_s=0.02, tick_s=0.01)
    sess.DTMF_GAP_S = 0.05
    return sess, comp


class Markers(unittest.TestCase):
    def test_dtmf_marker(self):
        m = brief.markers('<dtmf 1>'); self.assertEqual(m['dtmf'], '1')
        self.assertEqual(brief.markers('Ji. <dtmf: 2#>')['dtmf'], '2#')
        self.assertEqual(brief.markers('<dtmf 123456>')['dtmf'], '', 'more than 4 keys is not a menu choice')
        self.assertEqual(brief.spoken('<dtmf 1>').strip(), '')

    def test_menu(self):
        for t in ('For renewals press 1, for claims press 2', 'नवीनीकरण के लिए 1 दबाएं', 'claim ke liye 2 dabaiye'):
            self.assertTrue(brief.MENU.search(t), t)
        for t in ('Hello?', 'press karke dekho', 'मैंने बटन दबा दिया'):
            self.assertFalse(brief.MENU.search(t), t)

    def test_carrier_events(self):
        for cls in (transports.PlivoLine, transports.ExotelLine):
            line = cls.__new__(cls)
            self.assertEqual(line.on_event({'event': 'dtmf', 'dtmf': {'digit': '5'}}), ('dtmf', '5'))


class KeypadIn(unittest.TestCase):
    def test_a_choice_is_a_caller_turn(self):
        async def go():
            sess, comp = make([OPEN, 'जी, आपने 1 चुना।'])
            await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
            await sess.on_dtmf('1'); await asyncio.sleep(0.1); await feed(sess, 70, QUIET)
            await wait_until(lambda: sess.conv.agent_turns == 2)
            await sess.end('caller_hung_up')
            return sess, comp
        sess, comp = asyncio.run(go())
        self.assertIn('[keypad: 1]', json.dumps(comp.brain.calls[-1], ensure_ascii=False))
        self.assertEqual([t['text'] for t in sess.conv.transcript if t['speaker'] == 'caller'], ['[keypad: 1]'])

    def test_a_pin_never_reaches_the_brain_or_the_transcript(self):
        async def go():
            sess, comp = make([OPEN, 'जी।'])
            await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
            for d in '4829#': await sess.on_dtmf(d)
            await feed(sess, 70, QUIET); await asyncio.sleep(0.1)
            await sess.end('caller_hung_up')
            return sess, comp
        sess, comp = asyncio.run(go())
        self.assertNotIn('4829', json.dumps(comp.brain.calls, ensure_ascii=False))
        self.assertNotIn('4829', json.dumps(sess.conv.transcript, ensure_ascii=False))
        self.assertIn('[keypad: 4 keys, not shown]', [t['text'] for t in sess.conv.transcript])
        self.assertTrue(any('mat bataiye' in x for x in comp.voice.said), 'she says the stop-digits line')
        self.assertEqual(len(comp.brain.calls), 1, 'no reply is written to it')

    def test_junk_is_ignored(self):
        async def go():
            sess, comp = make([OPEN])
            await sess.start(); await sess.on_dtmf('x'); await sess.on_dtmf(''); await sess.end('caller_hung_up')
            return sess
        self.assertEqual(asyncio.run(go()).keys, '')


class KeysOut(unittest.TestCase):
    def run_press(self, caller_said, marker='<dtmf 1>'):
        sent = []
        async def go():
            sess, comp = make([OPEN])
            async def send(keys): sent.append(keys); return True
            sess.send_dtmf = send
            await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
            sess.conv.commit_caller(caller_said)
            await sess.after_reply(brief.markers(marker))
            await sess.end('caller_hung_up')
        asyncio.run(go())
        return sent

    def test_she_presses_only_on_a_menu(self):
        self.assertEqual(self.run_press('For renewals press 1, for claims press 2'), ['1'])
        self.assertEqual(self.run_press('Hello, haan boliye'), [], 'no menu heard: a stray marker sends nothing')

    def test_the_brief_tells_her_how_on_a_menu(self):
        rows = brief.ledger([{'speaker': 'caller', 'text': 'For renewals press 1, for claims press 2'}], {}, {}, {})
        self.assertIn('<dtmf N>', rows)
        self.assertNotIn('<dtmf N>', brief.ledger([{'speaker': 'caller', 'text': 'Hello?'}], {}, {}, {}))


class PlivoSend(unittest.IsolatedAsyncioTestCase):
    async def test_send_digits_api(self):
        from tests.test_server import ENV
        from vpvoice.server import CallRecord, Runtime
        sent = []
        async def fake_request(http, env, method, path, data=None): sent.append((method, path, data)); return 202, {}
        saved = transports.plivo_request; transports.plivo_request = fake_request
        try:
            rt = Runtime(env=dict(ENV), make_components=lambda *a: components(), watchdog_s=0.02)
            t = ticket(transport={'kind': 'sip', 'trunk': 'plivo', 'to': '+919000000011', 'from': '+919000000012'})
            rec = CallRecord(t, 'h', None, None, 'tok', {}); rec.call_uuid = 'uuid-2'
            self.assertTrue(await rt.send_dtmf(rec, '1'))
            self.assertEqual(sent, [('POST', 'Call/uuid-2/DTMF/', {'digits': '1', 'leg': 'aleg'})])
            rec2 = CallRecord(ticket(), 'h', None, None, 'tok', {})
            self.assertFalse(await rt.send_dtmf(rec2, '1'), 'not a Plivo call')
        finally:
            transports.plivo_request = saved


if __name__ == '__main__':
    unittest.main()
