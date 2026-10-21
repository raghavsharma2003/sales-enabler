# The audio cascade with fake ears and a fake voice: real VAD state machine (energy VAD), real turn-taking, real
# playback clock. No network.
import asyncio, json, os, unittest
import numpy as np
from tests.fixtures import FakeBrain, components, sink, ticket, bodies

os.environ['VP_VAD'] = 'energy'
from vpvoice.cascade import CascadeSession, Line, incomplete      # noqa: E402


class FakeLine(Line):
    def __init__(self): self.audio = 0; self.flushes = []; self.msgs = []; self.closed = False
    async def send_audio(self, rid, pcm24): self.audio += len(pcm24)
    async def flush(self, rid): self.flushes.append(rid)
    async def send_json(self, obj): self.msgs.append(obj)
    async def close(self): self.closed = True


class FakeEars:
    def __init__(self, on_p, on_f, on_e, lang='hi-IN'):
        self.on_p, self.on_f, self.on_e = on_p, on_f, on_e; self.audio_s = 0.0; self.closed = False
    async def start(self): pass
    def write(self, pcm, is_speech):
        if is_speech: self.audio_s += len(pcm) / 32000
    def end_of_speech(self): pass
    async def close(self): self.closed = True


class FakeVoice:
    """0.12 s of quiet audio per 10 characters, in 40 ms chunks."""
    whole_reply = False; styled = False; sounds = False
    def __init__(self): self.said = []; self.resets = 0
    async def warm(self): pass
    def reset(self): self.resets += 1
    async def close(self): pass
    async def speak(self, text, style, usage, timing):
        self.said.append(text); n = max(1, len(text) // 10) * 3
        usage['audio_s'] = usage.get('audio_s', 0) + n * 0.04; usage['chars'] = usage.get('chars', 0) + len(text)
        for _ in range(n):
            await asyncio.sleep(0)
            yield b'\x01\x00' * 960


SPEECH = (np.sin(np.arange(320) / 3.0) * 8000).astype('<i2').tobytes()
QUIET = b'\x00\x00' * 320


async def feed(s, frames, chunk=SPEECH):
    for _ in range(frames):
        await s.on_mic(chunk); await asyncio.sleep(0.002)


async def wait_until(cond, timeout=5.0):
    t = asyncio.get_running_loop().time() + timeout
    while not cond():
        if asyncio.get_running_loop().time() > t: raise AssertionError('timed out')
        await asyncio.sleep(0.01)


def make(script, t=None):
    t = t or ticket(transport={'kind': 'webrtc', 'offerUrl': 'https://control.example/join'})
    ears = {}
    def make_ears(p, f, e, lang='hi-IN'):
        ears['e'] = FakeEars(p, f, e); return ears['e']
    comp = components(brain=FakeBrain(script), ears=make_ears, voice=FakeVoice())
    s, p = sink(t['conversationId'])
    line = FakeLine()
    sess = CascadeSession(t, comp, s, line, env={}, watchdog_s=0.02, tick_s=0.01)
    return sess, p, line, ears, comp


def evs(p): return [e for b in bodies(p) for e in b['events']]


class Cascade(unittest.TestCase):
    def test_incomplete(self):
        self.assertTrue(incomplete('मैं सोच रहा था कि'))
        self.assertTrue(incomplete('haan, lekin'))
        self.assertFalse(incomplete('ठीक है।'))

    def test_full_call_turns_costs_and_her_hangup(self):
        script = ['नमस्ते, Suraksha की AI असिस्टेंट Riya बोल रही हूँ।', 'जी, renewal 2 November को है।',
                  'बहुत शुक्रिया, अपना ख्याल रखिए, bye! <end_call>']
        async def go():
            sess, p, line, ears, comp = make(script)
            await sess.start()
            await wait_until(lambda: sess.conv.agent_turns == 1)
            await feed(sess, 25)                              # 0.5 s of speech
            ears['e'].on_f('हाँ जी, बोलिए')
            await feed(sess, 20, QUIET)
            await wait_until(lambda: sess.conv.agent_turns == 2)
            await feed(sess, 25); ears['e'].on_f('ठीक है, thank you'); await feed(sess, 20, QUIET)
            await asyncio.wait_for(sess.done.wait(), 8)
            return sess, p, line, comp
        sess, p, line, comp = asyncio.run(go())
        e = evs(p)
        self.assertEqual([x['seq'] for x in e], list(range(1, len(e) + 1)))
        self.assertEqual(e[0]['type'], 'call.started'); self.assertEqual(e[-1]['type'], 'call.ended')
        self.assertEqual(e[-1]['endReason'], 'agent_ended')
        turns = [x for x in e if x['type'] == 'turn']
        self.assertEqual([t['speaker'] for t in turns], ['agent', 'caller', 'agent', 'caller', 'agent'])
        self.assertIsNone(turns[0].get('latencyMs'))
        self.assertIsInstance(turns[2].get('latencyMs'), int)
        comps = {(c['component'], c['unit']) for c in e if c['type'] == 'cost'}
        self.assertIn(('brain', 'token'), comps); self.assertIn(('voice', 'second'), comps); self.assertIn(('ears', 'second'), comps)
        self.assertEqual(e[-1]['manifest']['components'], {'stt': 'gemini', 'llm': 'gemini-3.5-flash-lite', 'tts': 'gemini-lite', 'voice': 'Despina'})
        self.assertGreater(line.audio, 0); self.assertTrue(line.closed)
        self.assertEqual(comp.voice.said[-1], 'बहुत शुक्रिया, अपना ख्याल रखिए, bye!')

    def test_barge_in_records_what_was_heard(self):
        long = 'ये एक बहुत लंबा जवाब है जो काफ़ी देर तक चलता रहेगा। ' * 6
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ। ' + long]
        async def go():
            sess, p, line, ears, comp = make(script)
            await sess.start()
            await wait_until(lambda: sess.active is not None and sess.active.first is not None)
            await asyncio.sleep(0.3)
            ears['e'].on_p('रुकिए रुकिए एक मिनट')
            await feed(sess, 40)                               # 0.8 s of speech while she talks
            await wait_until(lambda: line.flushes)
            await sess.end('caller_hung_up')
            return sess, p, line
        sess, p, line = asyncio.run(go())
        agent = [x for x in evs(p) if x['type'] == 'turn' and x['speaker'] == 'agent']
        self.assertTrue(agent[0].get('interrupted'))
        self.assertLess(len(agent[0]['text']), len(script[0]))

    def test_caller_reading_an_otp_is_stopped_mid_number(self):
        async def go():
            sess, p, line, ears, comp = make(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'])
            await sess.start()
            await wait_until(lambda: sess.conv.agent_turns == 1)
            await feed(sess, 10); ears['e'].on_p('मेरा OTP है 4 8 2 9')
            await wait_until(lambda: any('mat bataiye' in x for x in comp.voice.said))
            ears['e'].on_f('मेरा OTP है 4 8 2 9 1 7'); await feed(sess, 30, QUIET)
            await wait_until(lambda: any(t['speaker'] == 'caller' for t in sess.conv.transcript))
            await sess.end('caller_hung_up')
            return p, comp
        p, comp = asyncio.run(go())
        caller = [x for x in evs(p) if x['type'] == 'turn' and x['speaker'] == 'caller']
        self.assertIn('[OTP]', caller[0]['text'])
        self.assertEqual(sum('mat bataiye' in x for x in comp.voice.said), 1, 'stopped once, not twice')

    def test_secrets_never_reach_the_brain_on_the_speculative_path(self):
        async def go():
            sess, p, line, ears, comp = make(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'जी।'])
            await sess.start()
            await wait_until(lambda: sess.conv.agent_turns == 1)
            await feed(sess, 20); ears['e'].on_f('mera ATM pin 4321 hai yaar'); await feed(sess, 30, QUIET)
            await wait_until(lambda: sess.conv.agent_turns >= 2)
            await sess.end('caller_hung_up')
            return comp
        comp = asyncio.run(go())
        self.assertNotIn('4321', json.dumps(comp.brain.calls, ensure_ascii=False))

    def test_voice_failure_on_a_test_call_ends_it(self):
        class Broken(FakeVoice):
            async def speak(self, text, style, usage, timing):
                raise RuntimeError('503 unavailable (fake)'); yield b''
        async def go():
            t = ticket(transport={'kind': 'webrtc', 'offerUrl': 'https://control.example/join'})
            comp = components(brain=FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।']), ears=lambda *a: FakeEars(*a), voice=Broken())
            s, p = sink(t['conversationId'])
            sess = CascadeSession(t, comp, s, FakeLine(), env={'VP_FALLBACKS': '1'}, watchdog_s=0.02, tick_s=0.01)
            await sess.start(); await asyncio.wait_for(sess.done.wait(), 3)
            return sess, p
        sess, p = asyncio.run(go())
        end = evs(p)[-1]
        self.assertEqual(end['endReason'], 'error'); self.assertEqual(end['manifest']['fallbacksUsed'], [])
        self.assertIn('voice', sess.error)


if __name__ == '__main__':
    unittest.main()
