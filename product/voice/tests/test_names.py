# The contact's name in both scripts in the brief, and the guard on the name she addresses them by (staging
# 2026-10-23: one v2-flashlite opening asked for "अक्षरा जी" when the contact was Asha). Fake brain, no network.
import unittest
from tests.fixtures import FakeBrain, components, sink, ticket
from tests.test_sim import call, of, run
from vpvoice import names
from vpvoice.session import SimSession

OPEN_OK = 'नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'


class Transliteration(unittest.TestCase):
    def test_forms(self):
        self.assertEqual(names.forms('Asha'), ('Asha', 'आशा'))
        self.assertEqual(names.forms('Asha Verma'), ('Asha Verma', 'आशा वर्मा'))
        self.assertEqual(names.forms('आशा'), ('Aashaa', 'आशा'))
        self.assertEqual(names.forms(''), ('', ''))
        self.assertEqual(names.to_devanagari('Tanvi'), 'तन्वि')            # the rules, for names not in KNOWN

    def test_keys_match_across_scripts(self):
        for a, b in (('Asha', 'आशा'), ('Aasha', 'Asha'), ('Priya', 'प्रिया'), ('Rahul', 'राहुल'), ('Verma', 'वर्मा')):
            self.assertEqual(names.key(a), names.key(b), (a, b))
        self.assertNotEqual(names.key('Asha'), names.key('अक्षरा'))


class Guard(unittest.TestCase):
    def test_wrong_name_is_repaired_to_the_contact(self):
        self.assertEqual(names.repair('क्या मैं अक्षरा जी से बात कर रही हूँ?', 'Asha')[0], 'क्या मैं आशा जी से बात कर रही हूँ?')
        self.assertEqual(names.repair('Kya main Akshara ji se baat kar rahi hoon?', 'Asha')[0], 'Kya main Asha ji se baat kar rahi hoon?')
        self.assertEqual(names.repair('नमस्ते अक्षराजी,', 'Asha')[0], 'नमस्ते आशाजी,')

    def test_right_names_and_honorifics_pass(self):
        for t in ('क्या मैं आशा जी से बात कर रही हूँ?', 'Namaste Asha ji!', 'क्या मैं आशाजी से बात कर रही हूँ?',
                  'Kya main Asha Verma se baat kar rahi hoon?', 'Verma ji, ek baat batani thi.', 'Haan ji, bilkul.',
                  'अच्छा जी, धन्यवाद।', 'Namaste, main Riya bol rahi hoon.', 'शुक्रिया जी।', 'Sir ji, ek minute.'):
            self.assertEqual(names.repair(t, 'Asha Verma', own=['Riya', 'Suraksha']), (t, []), t)

    def test_no_contact_name_drops_it(self):
        self.assertEqual(names.repair('क्या मैं अक्षरा जी से बात कर रही हूँ?', '')[0], 'क्या अभी आपसे दो मिनट बात हो सकती है?')
        self.assertEqual(names.repair('नमस्ते अक्षरा जी, कैसी हैं?', '')[0], 'नमस्ते जी, कैसी हैं?')


class OnACall(unittest.TestCase):
    def test_the_brief_gives_the_name_in_both_scripts(self):
        t = ticket(); s, _ = sink(t['conversationId']); b = FakeBrain([OPEN_OK])
        sess = SimSession(t, components(brain=b), s, env={}, watchdog_s=0.01)
        async def go(): await sess.start(); await sess.hang_up()
        run(go())
        last = b.calls[0][-1]['content']
        self.assertIn('the person you are calling: Asha', last); self.assertIn('आशा', last)

    def test_an_opening_with_the_wrong_name_is_repaired_and_logged(self):
        sess, p, replies = run(call([OPEN_OK + ' क्या मैं अक्षरा जी से बात कर रही हूँ?'], []))
        said = ' '.join(replies[0])
        self.assertNotIn('अक्षरा', said); self.assertIn('आशा जी', said)
        ev = [e for e in of(p, 'safety') if e['rule'] == 'RD11' and e['action'] == 'replaced']
        self.assertEqual(len(ev), 1); self.assertNotIn('अक्षरा', ev[0]['detail'])

    def test_identity_confirmed_on_a_devanagari_question(self):
        sess, p, _ = run(call([OPEN_OK + ' क्या मैं आशा जी से बात कर रही हूँ?', 'जी, धन्यवाद।'], ['हाँ जी, बोलिए']))
        self.assertTrue(sess.conv.state['identity_verified'])

    def test_identity_is_checked_on_the_repaired_line(self):
        sess = run(call([OPEN_OK + ' क्या मैं अक्षरा जी से बात कर रही हूँ?', 'जी।'], ['हाँ']))[0]
        tr = [t['text'] for t in sess.conv.transcript if t['speaker'] == 'agent']
        self.assertIn('आशा', tr[0])                    # what she said after the repair is what identity is checked on
        self.assertTrue(sess.conv.state['identity_verified'])


if __name__ == '__main__':
    unittest.main()


class Brand(unittest.TestCase):
    """Staging 2026-10-24: the brain wrote the brand "Saanjh Services" as "सांच सर्विसेज" in 2 of 3 openings."""
    B = {'name': 'Saanjh Services Pvt Ltd', 'spokenName': 'Saanjh Services', 'verifiedDomains': []}

    def test_forms(self):
        self.assertEqual(names.brand_forms(self.B), ('Saanjh Services', 'सांझ सर्विसेज', False))
        self.assertEqual(names.brand_forms(dict(self.B, spokenNameDevanagari='सांझ सर्विसेस'))[1:], ('सांझ सर्विसेस', True))

    def test_respelled_brand_is_repaired(self):
        self.assertEqual(names.repair_brand('मैं सांच सर्विसेज से रिया हूँ', self.B), ('मैं Saanjh सर्विसेज से रिया हूँ', ['सांच']),
                         'no workspace form: the Latin word, never an unsure transliteration')
        self.assertEqual(names.repair_brand('मैं सांच सर्विसेज से', dict(self.B, spokenNameDevanagari='सांझ सर्विसेज'))[0], 'मैं सांझ सर्विसेज से')
        self.assertEqual(names.repair_brand('Main Saanch Services se Riya', self.B)[0], 'Main Saanjh Services se Riya')

    def test_right_spellings_inflections_and_other_words_pass(self):
        for t, b in (('मैं सांझ सर्विसेज की AI असिस्टेंट', self.B), ('समझ गई, धन्यवाद', self.B), ('Saanjh Services se', self.B),
                     ('घराने की बात', {'spokenName': 'Gharana Foods'}), ('सुरक्षा हेल्थ की AI असिस्टेंट', {'spokenName': 'Suraksha Health'}),
                     ('सहज है', {'spokenName': 'Sahaj Finance'})):
            self.assertEqual(names.repair_brand(t, b), (t, []), t)

    def brand_call(self, opening, brand):
        t = ticket(); t['agent']['brand'] = dict(brand)
        return run(call([opening], [], t=t))

    def test_on_a_call(self):
        sess, p, replies = self.brand_call('नमस्ते आशा जी, मैं सांच सर्विसेज की AI असिस्टेंट हूँ।', self.B)
        self.assertIn('Saanjh सर्विसेज', ' '.join(replies[0])); self.assertNotIn('सांच', ' '.join(replies[0]))

    def test_the_brief_says_how_to_write_it(self):
        t = ticket(); t['agent']['brand'] = dict(self.B); s, _ = sink(t['conversationId']); b = FakeBrain([OPEN_OK])
        sess = SimSession(t, components(brain=b), s, env={}, watchdog_s=0.01)
        async def go(): await sess.start(); await sess.hang_up()
        run(go())
        self.assertIn('the brand, as you write it: Saanjh Services (keep it in these Latin letters', b.calls[0][-1]['content'])
        t['agent']['brand']['spokenNameDevanagari'] = 'सांझ सर्विसेज'; b = FakeBrain([OPEN_OK]); s, _ = sink(t['conversationId'])
        sess = SimSession(t, components(brain=b), s, env={}, watchdog_s=0.01); run(go())
        self.assertIn('(in Devanagari exactly: सांझ सर्विसेज)', b.calls[0][-1]['content'])
