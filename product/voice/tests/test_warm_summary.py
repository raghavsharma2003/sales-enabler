# The warm summary (must-be audit brief 6): on a Plivo transfer with agent handOff.warmSummary, the colleague who
# answers hears a short English summary before the caller is connected (Dial confirmSound -> a signed whisper hook).
# Plivo REST is faked; no network. Phone numbers are synthetic.
import asyncio, unittest
from tests.fixtures import FakeBrain, components, ticket
from tests.test_sim import call, run
from vpvoice import transports


class Line(unittest.TestCase):
    def sess(self, warm=True, says='मुझे किसी इंसान से बात करनी है'):
        t = ticket(); t['agent']['handOff'] = {'when': ['asks_for_human'], 'target': {'kind': 'callback'}, 'warmSummary': warm}
        return run(call(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'], [says], t=t))[0]

    def test_the_summary(self):
        w = self.sess().whisper_line()
        self.assertTrue(w.startswith("Transfer from Riya, Suraksha's AI assistant. The caller is Asha."), w)
        self.assertIn('Why: they asked to speak to a person.', w)
        self.assertNotIn('इंसान', w, "the carrier's English voice is not given Devanagari")

    def test_latin_words_are_kept_and_off_means_none(self):
        self.assertIn('They last said: I want to talk to a human', self.sess(says='I want to talk to a human').whisper_line())
        self.assertIsNone(self.sess(warm=False).whisper_line())

    def test_xml(self):
        x = transports.transfer_xml('+91 90000 00013', 'https://voice.example.test/v1/media/sip/whisper/c/h&x')
        self.assertIn('<Dial confirmSound="https://voice.example.test/v1/media/sip/whisper/c/h&amp;x"><Number>919000000013</Number></Dial>', x)
        self.assertNotIn('confirmSound', transports.transfer_xml('+919000000013'))
        self.assertIn('<Speak voice="WOMAN" language="en-IN">Caller &lt;Asha&gt;</Speak>', transports.whisper_xml('Caller <Asha>'))


class PlivoBridge(unittest.IsolatedAsyncioTestCase):
    async def test_transfer_dial_and_whisper_hooks(self):
        from aiohttp.test_utils import TestClient, TestServer
        from tests.test_server import ENV
        from vpvoice.server import CallRecord, Runtime
        sent = []
        async def fake_request(http, env, method, path, data=None):
            sent.append((method, path, data)); return 200, {}
        saved = transports.plivo_request; transports.plivo_request = fake_request
        try:
            rt = Runtime(env=dict(ENV), make_components=lambda *a: components(), watchdog_s=0.02)
            client = TestClient(TestServer(rt.app())); await client.start_server()
            t = ticket(transport={'kind': 'sip', 'trunk': 'plivo', 'to': '+919000000011', 'from': '+919000000012'})
            cid = t['conversationId']
            rec = CallRecord(t, 'h', None, None, 'tok', {}); rec.call_uuid = 'uuid-1'; rt.calls[cid] = rec
            class S:
                ended = None
                def whisper_line(self): return 'Transfer from Riya. The caller is Asha.'
                async def end(self, reason): self.ended = reason
            rec.session = S()
            self.assertTrue(await rt.transfer(rec, 'phone', '+919000000013'))
            self.assertEqual(sent[0][0], 'POST'); self.assertEqual(sent[0][1], 'Call/uuid-1/')
            url = sent[0][2]['aleg_url'].split('voice.example.test', 1)[1]
            xml = await (await client.post(url)).text()
            self.assertIn('<Number>919000000013</Number>', xml)
            whisper = xml.split('confirmSound="', 1)[1].split('"', 1)[0].split('voice.example.test', 1)[1]
            r = await client.post(whisper); self.assertEqual(r.status, 200)
            self.assertIn('The caller is Asha.', await r.text())
            r = await client.post(whisper.rsplit('/', 1)[0] + '/bad'); self.assertEqual(r.status, 403, 'the hook is signed')
            self.assertEqual(rec.session.ended, 'handed_off')
            await client.close()
        finally:
            transports.plivo_request = saved


if __name__ == '__main__':
    unittest.main()
