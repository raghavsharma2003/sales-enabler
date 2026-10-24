# How the caller sounds (caller_state.py): read from words and cut-ins, shapes her next reply (a ledger row, never a
# line), sets a delivery note for styled voices, and is logged per agent turn in the trace. Synthetic data only.
import unittest
from tests.test_sim import call, of, run
from vpvoice import brief, caller_state
from vpvoice.conversation import Draft


class Reading(unittest.TestCase):
    def test_states_by_precedence(self):
        R = caller_state.read
        self.assertEqual(R([]), 'neutral')
        self.assertEqual(R(['हाँ जी, बोलिए']), 'neutral')
        self.assertEqual(R(['ये क्या बकवास है, spam call है']), 'upset')
        self.assertEqual(R(['मुझे बहुत tension है, क्या होगा']), 'upset')
        self.assertEqual(R(['sorry?']), 'confused'); self.assertEqual(R(['फिर से बोलिए']), 'confused')
        self.assertEqual(R(['मैं meeting में हूँ, जल्दी बोलो']), 'rushed')
        self.assertEqual(R(['ok', 'हाँ', 'ठीक'], cut_ins=2), 'rushed', 'they keep cutting in')
        self.assertEqual(R(['हाहा, बढ़िया भाई']), 'warm')
        self.assertEqual(R(['spam है ये, जल्दी बोलो']), 'upset', 'upset wins over rushed')

    def test_ledger_row_is_a_shape_and_crisis_adds_none(self):
        tr = [{'speaker': 'agent', 'text': 'नमस्ते।'}, {'speaker': 'caller', 'text': 'sorry?'}]
        led = brief.ledger(tr, {}, {}, {'caller_state': 'confused'})
        self.assertIn(caller_state.SHAPES['confused'], led)
        self.assertNotIn(caller_state.SHAPES['confused'], brief.ledger(tr, {}, {}, {'caller_state': 'confused', 'crisis': True}))
        self.assertNotIn('they sound', brief.ledger(tr, {}, {}, {'caller_state': 'neutral'}).replace('lately they sound', ''))
        for s in caller_state.SHAPES.values():
            self.assertNotRegex(s, r'["“]', 'a shape, never a line to recite')


class OnACall(unittest.TestCase):
    def test_state_per_agent_turn_in_the_trace_and_tone_for_styled_voices(self):
        script = ['नमस्ते, Suraksha की AI असिस्टेंट Riya बोल रही हूँ।', 'माफ़ कीजिए, renewal 2 November को है।', 'ठीक है। <end_call>']
        sess, p, _ = run(call(script, ['ये क्या spam call है', 'हाँ ठीक है']))
        tr = of(p, 'call.ended')[0]['trace']
        self.assertEqual([r.get('state') for r in tr['turns'] if r['speaker'] == 'agent'], ['neutral', 'upset', 'upset'], 'upset holds for one more turn')
        turns = [t for t in of(p, 'turn') if t['speaker'] == 'agent']
        self.assertEqual(turns[1].get('tone'), 'gentle', 'the delivery note for an upset caller (styled voices use it)')
        self.assertIsNone(turns[0].get('tone'))

    def test_brain_tone_note_wins(self):
        sess, p, _ = run(call(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', '[tone: warm, apologetic] माफ़ कीजिए।'], ['ये क्या spam है']))
        self.assertEqual([t for t in of(p, 'turn') if t['speaker'] == 'agent'][1].get('tone'), 'warm, apologetic')


if __name__ == '__main__':
    unittest.main()
