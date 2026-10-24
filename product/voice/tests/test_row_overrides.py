# A row's own opening and voice (intake rowOverrides, shared/runtime-protocol.ts CallTicket.contact.rowOverrides): the
# runtime leads with the row's useful first thing under the same rules (RD1 and the door unchanged), and uses a row
# voice only if the stack offers it. Fake brain, no network.
import re, unittest
from tests.fixtures import FakeBrain, ticket
from tests.test_sim import call, of, run
from vpvoice import stacks, ticket as tk

ROW = 'aapki policy par is saal 5% no-claim bonus juda hai'


def opener(messages):
    """Like an obedient model: open with the useful thing the LAST block names for this person, else the brief's."""
    last = messages[-1]['content']
    m = re.search(r'the useful thing to open with is: (.+?) \(this replaces', last)
    return 'Namaste Asha ji. ' + (m.group(1) if m else 'aapka renewal paas aa raha hai') + '.'


class Opening(unittest.TestCase):
    def test_a_row_opening_leads_and_the_rules_hold(self):
        t = ticket(); t['contact']['rowOverrides'] = {'applied': ['first_message'], 'usefulFirst': ROW}
        b = FakeBrain(opener); sess, p, replies = run(call(None, [], t=t, brain=b))
        self.assertIn(ROW, b.calls[0][-1]['content'])
        self.assertIn(ROW, ' '.join(replies[0]))
        self.assertTrue(replies[0][0].startswith('Main Suraksha ki AI assistant hoon.'), 'RD1 still carries the disclosure first')
        self.assertEqual(of(p, 'safety')[0]['rule'], 'RD1')

    def test_without_one_she_opens_with_the_brief(self):
        b = FakeBrain(opener); sess, p, replies = run(call(None, [], brain=b))
        self.assertNotIn('the useful thing to open with', b.calls[0][-1]['content'])
        self.assertIn('aapka renewal paas aa raha hai', ' '.join(replies[0]))

    def test_only_the_opening_carries_it(self):
        t = ticket(); t['contact']['rowOverrides'] = {'applied': ['first_message'], 'usefulFirst': ROW}
        b = FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'जी।']); run(call(None, ['haan'], t=t, brain=b))
        self.assertNotIn('the useful thing to open with', b.calls[1][-1]['content'])


class Voice(unittest.TestCase):
    def test_a_row_voice_is_used_only_if_the_stack_offers_it(self):
        offered = stacks.voices(stacks.spec('v2-flashlite'))[0]
        t = ticket(); t['agent']['voice']['voiceId'] = offered[2]
        t['contact']['rowOverrides'] = {'applied': ['voice'], 'voiceId': offered[2]}
        t['stack']['combinationId'] = stacks.combination_id(stacks.spec('v2-flashlite'), offered[2])
        self.assertEqual(tk.validate(t)[1], offered[2])
        t['agent']['voice']['voiceId'] = 'NotAVoice'; t['contact']['rowOverrides']['voiceId'] = 'NotAVoice'
        t['stack']['combinationId'] = stacks.combination_id(stacks.spec('v2-flashlite'), 'NotAVoice')
        self.assertEqual(tk.validate(t)[1], stacks.voices(stacks.spec('v2-flashlite'))[1], "the stack's default instead")
        del t['contact']['rowOverrides']
        with self.assertRaises(tk.TicketError): tk.validate(t)


if __name__ == '__main__':
    unittest.main()
