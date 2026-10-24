# Her fixed lines in the agent's language (must-be audit brief 10): shared/safety/fixed-lines.json through
# safety.fixed_line, on a sim call. Parity with product/tests/safety-fixed-lines.test.ts. Fake brain, no network.
import json, unittest
from tests.fixtures import ticket
from tests.test_sim import call, of, run
from vpvoice import safety

DEVA = lambda s: sum('ऀ' <= ch <= 'ॿ' for ch in s)
TAMIL = lambda s: sum('஀' <= ch <= '௿' for ch in s)


class Table(unittest.TestCase):
    def test_every_language_every_line_both_genders(self):
        for lang in json.load(open(safety.rules.HERE + '/../../shared/safety/fixed-lines.json', encoding='utf-8'))['scripts']:
            for key in safety.FIXED['keys']:
                f, m = safety.fixed_line(key, lang, 'female'), safety.fixed_line(key, lang, 'male')
                self.assertTrue(f and m, (lang, key))
        self.assertIn('करवाती', safety.fixed_line('bridge_now', 'hi-IN', 'female'))
        self.assertIn('करवाता', safety.fixed_line('bridge_now', 'hi-IN', 'male'))
        self.assertIn('ਰਿਹਾ', safety.fixed_line('takeover', 'pa-IN', 'male'))

    def test_language_and_script(self):
        agent = {'languages': {'primary': 'ta-IN', 'allowed': ['ta-IN', 'en-IN']}}
        self.assertEqual(safety.call_language(agent, {'language': 'en-IN'}), 'en-IN', "the contact's language, when allowed")
        self.assertEqual(safety.call_language(agent, {'language': 'hi-IN'}), 'ta-IN', 'not allowed: the primary')
        self.assertEqual(safety.call_language(agent, {}), 'ta-IN')
        self.assertGreater(DEVA(safety.fixed_line('limit', 'hinglish', said='नमस्ते, मैं रिया हूँ')), 10, 'hinglish in Devanagari follows her script')
        self.assertEqual(DEVA(safety.fixed_line('limit', 'hinglish', said='Namaste, main Riya hoon')), 0)
        self.assertEqual(safety.fixed_line('limit', 'xx-IN'), safety.fixed_line('limit', 'hinglish'), 'unknown: the fallback')


class OnACall(unittest.TestCase):
    def test_a_tamil_english_agents_hand_off_line_is_not_devanagari(self):
        t = ticket(); t['agent']['languages'] = {'primary': 'ta-IN', 'allowed': ['ta-IN', 'en-IN'], 'mirrorCaller': True}
        t['contact']['language'] = 'ta-IN'
        script = ['வணக்கம், நான் Suraksha வின் AI உதவியாளர்.']
        sess, p, replies = run(call(script, ['I want to talk to a human'], t=t))
        self.assertEqual([x['reason'] for x in of(p, 'hand_off')], ['asks_for_human'])
        line = replies[1][0]
        self.assertEqual(DEVA(line), 0, line); self.assertGreater(TAMIL(line), 10, line)
        self.assertEqual(line, safety.fixed_line('bridge_callback', 'ta-IN'))

    def test_every_line_passes_the_door_on_a_call(self):
        sess = run(call(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'], []))[0]
        for lang in safety.FIXED['lines']:
            for key in safety.FIXED['keys']:
                for g in ('female', 'male'):
                    s = safety.fixed_line(key, lang, g)
                    self.assertEqual(sess.doored(s), s, (lang, key, g))


if __name__ == '__main__':
    unittest.main()
