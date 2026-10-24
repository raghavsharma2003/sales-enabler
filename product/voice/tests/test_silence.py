# The silence hang-up (must-be audit gap C): after limits.maxSilenceS of quiet she says the silence line in the
# agent's language and ends the call as silence_timeout, on the cascade and on the speech-to-speech path. A caller who
# speaks keeps the call. Fake ears/brain/voice and a fake Gemini Live socket; no network.
import asyncio, base64, json, os, unittest
import aiohttp
from tests.fixtures import FakeBrain, components, sink, ticket, bodies
from tests.test_cascade import FakeEars, FakeLine, FakeVoice, QUIET, SPEECH, feed, wait_until

os.environ['VP_VAD'] = 'energy'
from vpvoice import s2s, safety                       # noqa: E402
from vpvoice.cascade import CascadeSession            # noqa: E402

OPEN = 'नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'
TAMIL_OPEN = 'வணக்கம், நான் Suraksha வின் AI உதவியாளர்.'


def evs(p): return [e for b in bodies(p) for e in b['events']]


def agent_ticket(lang=None, silence=0.4, stack='v2-flashlite'):
    t = ticket(stack, transport={'kind': 'webrtc', 'offerUrl': 'https://control.example/join'})
    t['agent']['limits'] = {'maxDurationS': 600, 'maxSilenceS': silence, 'maxTurns': 40}
    if lang: t['agent']['languages'] = {'primary': lang, 'allowed': [lang], 'mirrorCaller': False}; t['contact']['language'] = lang
    return t


class Cascade(unittest.TestCase):
    def run_call(self, t, opening, talk=False):
        async def go():
            comp = components(brain=FakeBrain([opening, 'जी।']), ears=lambda p, f, e, lang='hi-IN': FakeEars(p, f, e), voice=FakeVoice())
            s, p = sink(t['conversationId'])
            sess = CascadeSession(t, comp, s, FakeLine(), env={}, watchdog_s=0.02, tick_s=0.01)
            await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
            lim = asyncio.get_running_loop().time() + 6
            while not sess.ended and asyncio.get_running_loop().time() < lim:
                await feed(sess, 5, SPEECH if talk else QUIET); await asyncio.sleep(0.02)
            ended = sess.ended
            if not sess.ended: await sess.end('caller_hung_up')
            return ended, comp, p
        return asyncio.run(go())

    def test_silence_ends_politely_at_the_limit(self):
        ended, comp, p = self.run_call(agent_ticket(), OPEN)
        self.assertEqual(ended, 'silence_timeout')
        self.assertEqual(comp.voice.said[-1], safety.fixed_line('silence', 'hinglish', 'female', said=OPEN))
        self.assertEqual(evs(p)[-1]['endReason'], 'silence_timeout')

    def test_in_the_agents_language(self):
        ended, comp, p = self.run_call(agent_ticket('ta-IN'), TAMIL_OPEN)
        self.assertEqual(ended, 'silence_timeout')
        self.assertEqual(comp.voice.said[-1], safety.fixed_line('silence', 'ta-IN'))
        self.assertTrue(any('஀' <= ch <= '௿' for ch in comp.voice.said[-1]))

    def test_a_caller_who_speaks_keeps_the_call(self):
        ended, comp, p = self.run_call(agent_ticket(), OPEN, talk=True)
        self.assertNotEqual(ended, 'silence_timeout')

    def test_no_limit_no_hang_up(self):
        ended, comp, p = self.run_call(agent_ticket(silence=0), OPEN)
        self.assertIsNone(ended)


class Msg:
    def __init__(self, obj): self.type = aiohttp.WSMsgType.TEXT; self.data = json.dumps(obj, ensure_ascii=False)


class FakeLive:
    """Gemini Live, scripted: the kickoff gets the opening; a 'say exactly this now' note gets that line, spoken."""
    def __init__(self, opening): self.opening = opening; self.sent = []; self.q = asyncio.Queue(); self.closed = False
    def turn(self, text):
        audio = base64.b64encode(b'\x01\x00' * 2400).decode()
        for m in ({'serverContent': {'modelTurn': {'parts': [{'inlineData': {'data': audio}}]}}},
                  {'serverContent': {'outputTranscription': {'text': text}}}, {'serverContent': {'turnComplete': True}}):
            self.q.put_nowait(Msg(m))
    async def send_json(self, o):
        self.sent.append(o)
        turns = (o.get('clientContent') or {}).get('turns') or []
        text = ' '.join(p.get('text', '') for t in turns for p in t.get('parts', []))
        if '(call connected' in text: self.turn(self.opening)
        elif 'say exactly this now: "' in text: self.turn(text.split('say exactly this now: "', 1)[1].rsplit('"', 1)[0])
    def __aiter__(self): return self
    async def __anext__(self):
        if self.closed: raise StopAsyncIteration
        return await self.q.get()
    async def close(self): self.closed = True


class Live(unittest.TestCase):
    def run_call(self, t, opening, speak_at=None, env=None):
        fake = FakeLive(opening)
        async def connect(http, google, setup, model): return fake
        saved = s2s.connect; s2s.connect = connect
        try:
            async def go():
                comp = components('v2-live', brain=FakeBrain([]))
                class G:
                    def resource(self, m): return m
                comp.make_s2s = lambda system, tools=(): {'google': G(), 'spec': {'model': 'gemini-live'}, 'http': None, 'voice': 'Despina'}
                s, p = sink(t['conversationId']); line = FakeLine()
                sess = s2s.LiveSession(t, comp, s, line, env=env or {}, watchdog_s=0.05)
                await sess.start()
                if speak_at is not None:
                    await asyncio.sleep(speak_at); fake.q.put_nowait(Msg({'serverContent': {'inputTranscription': {'text': 'haan ji'}}}))
                lim = asyncio.get_running_loop().time() + (0.9 if speak_at is not None else 8)
                while not sess.ended and asyncio.get_running_loop().time() < lim: await asyncio.sleep(0.05)
                ended = sess.ended
                if not sess.ended: await sess.end('caller_hung_up')
                return ended, fake, p
            return asyncio.run(go())
        finally:
            s2s.connect = saved

    def test_silence_on_the_speech_to_speech_path(self):
        t = agent_ticket(stack='v2-live', silence=0.5); t['agent']['voice'] = {'stackId': 'v2-live'}
        ended, fake, p = self.run_call(t, OPEN)
        self.assertEqual(ended, 'silence_timeout')
        line = safety.fixed_line('silence', 'hinglish', 'female', said=OPEN)
        self.assertTrue(any(line in json.dumps(o, ensure_ascii=False) for o in fake.sent), 'the model was given the silence line')
        agent = [e['text'] for e in evs(p) if e['type'] == 'turn' and e['speaker'] == 'agent']
        self.assertEqual(agent[-1], line, 'and she said it before the call ended')

    def test_speech_to_speech_call_saves_its_recording(self):
        import tempfile
        t = agent_ticket(stack='v2-live', silence=0.5); t['agent']['voice'] = {'stackId': 'v2-live'}; t['agent']['recording'] = {'enabled': True}
        with tempfile.TemporaryDirectory() as d:
            ended, fake, p = self.run_call(t, OPEN, env={'VP_RECORDINGS_DIR': d})
            end = [e for e in evs(p) if e['type'] == 'call.ended'][0]
            self.assertTrue(end.get('recordingUri'), 'both legs saved, as the cascade does (telephony ask 6)')
            self.assertTrue(any(f.endswith('.wav') for _, _, fs in os.walk(d) for f in fs))

    def test_tamil_on_the_speech_to_speech_path(self):
        t = agent_ticket('ta-IN', stack='v2-live', silence=0.5); t['agent']['voice'] = {'stackId': 'v2-live'}
        ended, fake, p = self.run_call(t, TAMIL_OPEN)
        self.assertEqual(ended, 'silence_timeout')
        self.assertTrue(any(safety.fixed_line('silence', 'ta-IN') in json.dumps(o, ensure_ascii=False) for o in fake.sent))

    def test_caller_words_reset_it(self):
        t = agent_ticket(stack='v2-live', silence=1.2); t['agent']['voice'] = {'stackId': 'v2-live'}
        ended, fake, p = self.run_call(t, OPEN, speak_at=0.8)
        # without the words she would have ended at 1.2 s; the test watches to 1.7 s, before 0.8 + 1.2 s
        self.assertIsNone(ended, 'the caller spoke inside the limit')


if __name__ == '__main__':
    unittest.main()
