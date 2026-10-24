# Staging bug 2026-10-23: on v2-mai, 2 event batches were refused (422) and dropped whole, so turns went missing from the
# call record. Cause, confirmed: brief.py accepts a [tone: ...] note of up to 80 characters, and calls/ingest.ts allows
# tone up to 50. The runtime now trims every string field to ingest's limit before sending (events.FIELD_MAX).
import asyncio, json, subprocess, unittest
from tests.fixtures import FakeBrain, components, sink, ticket
from tests.test_runtime_fixture import PRODUCT, node_validator
from vpvoice import events
from vpvoice.session import SimSession

TONE = 'warm, reassuring, a little slower than usual, smiling, unhurried, very gentle!!'   # 79 characters


class Limits(unittest.TestCase):
    def test_a_79_character_tone_round_trips(self):
        self.assertEqual(len(TONE), 79)
        t = ticket(); s, p = sink(t['conversationId'])
        brain = FakeBrain([f'[tone: {TONE}] नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'जी।'])
        async def go():
            sess = SimSession(t, components(brain=brain), s, env={}, watchdog_s=0.01)
            await sess.start(); await sess.caller_says('haan'); await sess.hang_up()
        asyncio.run(go())
        batches = [json.loads(b) for b in p.bodies]
        turn = next(e for b in batches for e in b['events'] if e['type'] == 'turn' and e['speaker'] == 'agent')
        self.assertLessEqual(len(turn['tone']), 50); self.assertTrue(TONE.startswith(turn['tone'].rstrip('…')), turn['tone'])
        cmd = node_validator()
        if cmd is None: self.skipTest('node + tsx not installed: ingest validator not run here')
        r = subprocess.run(cmd + [json.dumps(batches, ensure_ascii=False)], cwd=PRODUCT, capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, 'ingest refuses a batch: ' + r.stderr[-600:])

    def test_every_limited_field_is_trimmed(self):
        f = events.sanitise('hand_off', {'reason': 'x' * 900, 'target': 'member:' + 'y' * 300, 'summary': 'z ' * 1500})
        self.assertEqual((len(f['reason']) <= 500, len(f['target']) <= 200, len(f['summary']) <= 2000), (True, True, True))
        self.assertEqual(events.fit('short', 50), 'short')
        self.assertTrue(events.fit('एक दो तीन चार पाँच छह सात आठ नौ दस ' * 3, 50).endswith('…'))
        ended = events.sanitise('call.ended', {'transcript': [{'speaker': 'agent', 'text': 'a', 'startMs': 0}] * 6000})
        self.assertEqual(len(ended['transcript']), events.TRANSCRIPT_MAX)


if __name__ == '__main__':
    unittest.main()
