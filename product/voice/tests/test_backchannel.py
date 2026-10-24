# Her backchannels (cascade BACKCHANNEL, duplex.py): one short "haan" in a pause of a long caller turn, never over
# their speech, never after a question or in crisis, cut the moment they speak again. Not a turn. Synthetic data only.
import asyncio, os, unittest
import numpy as np
from tests.fixtures import FakeBrain, components, sink, ticket, bodies
from tests.test_cascade import FakeLine, QUIET, SPEECH, feed, wait_until

os.environ['VP_VAD'] = 'energy'
from vpvoice import duplex                                          # noqa: E402
from vpvoice.cascade import BACKCHANNEL_RID, CascadeSession         # noqa: E402

TONE = (np.sin(np.arange(24000 * 3 // 10) / 4.0) * 6000).astype('<i2').tobytes()      # 0.3 s


class LoudVoice:
    """Each sentence as 0.1 s of quiet, 0.3 s of tone, 0.1 s of quiet (a TTS pads its audio)."""
    whole_reply = False; styled = False; sounds = False
    def __init__(self): self.said = []
    async def warm(self): pass
    def reset(self): pass
    async def close(self): pass
    async def speak(self, text, style, usage, timing):
        self.said.append(text); usage['chars'] = usage.get('chars', 0) + len(text); usage['audio_s'] = usage.get('audio_s', 0) + 0.5
        pad = b'\x00\x00' * 2400
        for ch in (pad, TONE, pad):
            await asyncio.sleep(0); yield ch


class BcLine(FakeLine):
    def __init__(self): super().__init__(); self.rids = []
    async def send_audio(self, rid, pcm24): self.audio += len(pcm24); self.rids.append(rid)


def make(script, env=None):
    t = ticket(transport={'kind': 'webrtc', 'offerUrl': 'https://control.example/join'})
    ears = {}
    def make_ears(p, f, e, lang='hi-IN'):
        from tests.test_cascade import FakeEars
        ears['e'] = FakeEars(p, f, e); return ears['e']
    voice = LoudVoice()
    comp = components(brain=FakeBrain(script), ears=make_ears, voice=voice)
    s, p = sink(t['conversationId']); line = BcLine()
    sess = CascadeSession(t, comp, s, line, env={'VP_BACKCHANNEL': '1'} if env is None else env, watchdog_s=0.02, tick_s=0.01)
    return sess, p, line, ears, voice


async def long_turn(sess, ears, words, pause_frames=25, resume=True):
    """4.4 s of speech, a pause of pause_frames x 20 ms (audio clock), then more speech if resume."""
    await feed(sess, 220); ears['e'].on_p(words)
    for _ in range(pause_frames):
        await sess.on_mic(QUIET); await asyncio.sleep(0.02)
    if resume: await feed(sess, 30)


class Backchannel(unittest.TestCase):
    def test_trim_drops_the_padding_and_long_renders(self):
        clip = duplex.trim(b'\x00\x00' * 2400 + TONE + b'\x00\x00' * 2400)
        self.assertAlmostEqual(len(clip) / 48000, 0.34, delta=0.01)
        self.assertIsNone(duplex.trim(b'\x00\x00' * 24000))
        self.assertIsNone(duplex.trim(TONE * 4), 'over MAX_CLIP_S is not a backchannel')

    def run_turn(self, words, env=None, resume=True, crisis=False):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'जी, समझ गई।']
        async def go():
            sess, p, line, ears, voice = make(script, env)
            await sess.start()
            await wait_until(lambda: sess.conv.agent_turns == 1 and (len(sess.bc_clips) == 2 or not sess.backchannel))
            await asyncio.sleep(0.05)
            if crisis: sess.conv.state['crisis'] = True
            await long_turn(sess, ears, words, resume=resume)
            await asyncio.sleep(0.05)
            await sess.end('caller_hung_up')
            return sess, p, line, voice
        return asyncio.run(go())

    def test_one_backchannel_in_a_pause_of_a_long_turn_and_cut_when_they_go_on(self):
        sess, p, line, voice = self.run_turn('तो मैंने पिछले महीने भी बात की थी और फिर')
        self.assertEqual(voice.said[1:3], ['हाँ', 'हम्म'], 'rendered once, in her voice, in the script she speaks')
        self.assertEqual(line.rids.count(BACKCHANNEL_RID), 1)
        self.assertEqual(sess.bc_n, 1)
        self.assertEqual(sess.bc_cut, 1, 'they spoke again while it played: cut')
        self.assertIn(BACKCHANNEL_RID, line.flushes)
        kinds = [e['kind'] for e in sess.conv.trace.events]
        self.assertIn('backchannel', kinds); self.assertIn('backchannel_cut', kinds)
        self.assertNotIn('हाँ', [t['text'] for t in sess.conv.transcript], 'never a turn')
        self.assertEqual(sess.timing_summary()['backchannel'], {'enabled': True, 'clips': 2, 'played': 1, 'cut': 1})

    def test_never_after_a_question_in_crisis_or_when_off(self):
        for words, env, crisis in [('और मेरा premium कितना है?', None, False), ('तो मैंने पिछले महीने भी बात की थी और फिर', {'VP_BACKCHANNEL': '0'}, False),
                                   ('तो मैंने पिछले महीने भी बात की थी और फिर', None, True), ('मुझे अब जीना नहीं है और फिर', None, False)]:
            sess, p, line, voice = self.run_turn(words, env=env, crisis=crisis)
            self.assertEqual(line.rids.count(BACKCHANNEL_RID), 0, (words, env, crisis))

    def test_not_in_a_short_turn(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'जी।']
        async def go():
            sess, p, line, ears, voice = make(script)
            await sess.start()
            await wait_until(lambda: sess.conv.agent_turns == 1 and len(sess.bc_clips) == 2)
            await feed(sess, 60); ears['e'].on_p('हाँ जी बोलिए')
            for _ in range(25): await sess.on_mic(QUIET); await asyncio.sleep(0.02)
            await sess.end('caller_hung_up')
            return line
        self.assertEqual(asyncio.run(go()).rids.count(BACKCHANNEL_RID), 0)


if __name__ == '__main__':
    unittest.main()
