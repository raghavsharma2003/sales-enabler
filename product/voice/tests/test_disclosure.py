# Staging bug 2026-10-23 (research/2026-10-23/staging/reply-gap.md): every opening began by reading the agent's
# disclosureClause aloud ("that you are its AI assistant, mentioned in passing, ...") because RD1's first-breath fallback
# prefixed the clause verbatim and affirms_ai missed the brain's own Devanagari disclosure. The clause is guidance; the
# fallback now says a fixed, speakable line from shared/safety/disclosure.json, and the lexicon knows the scripts the
# brains write. The same vectors run on the TS side (product/tests/safety-disclosure.test.ts).
import json, os, unittest
from tests.fixtures import FakeBrain, components, sink, ticket
from vpvoice import safety
from vpvoice.session import SimSession

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
D = json.load(open(os.path.join(ROOT, 'product', 'shared', 'safety', 'disclosure.json'), encoding='utf-8'))
GUIDANCE = 'that you are its AI assistant, mentioned in passing'
STAGING = 'नमस्ते, मैं रिया हूँ — सुरक्षा हेल्थ की AI असिस्टेंट। आपकी पॉलिसी का रिन्यूअल अगले हफ़्ते है।'


def opening(first, clause=GUIDANCE, language='hinglish'):
    import asyncio
    t = ticket(); t['agent']['opening'] = {'disclosureClause': clause, 'usefulFirst': 'x'}; t['contact']['language'] = language
    s, _ = sink(t['conversationId'])
    sess = SimSession(t, components(brain=FakeBrain([first])), s, env={}, watchdog_s=0.01)
    async def go():
        out = await sess.start(); await sess.hang_up(); return out
    return asyncio.run(go())


class Disclosure(unittest.TestCase):
    def test_affirm_vectors(self):
        for v in D['affirm_vectors']:
            self.assertEqual(safety.affirms_ai(v['text']), v['affirms'], v['text'])

    def test_every_line_renders_and_affirms(self):
        for v in D['render_vectors']:
            self.assertEqual(safety.disclosure_line(v['brand'], v['language']), v['line'])
        for lang, l in D['lines'].items():
            for k in ('brand', 'nobrand'):
                self.assertTrue(safety.affirms_ai(l[k].replace('{brand}', 'Suraksha Health')), (lang, k))

    def test_the_staging_opening_passes_with_no_prefix(self):
        out = opening(STAGING)
        self.assertTrue(out[0].startswith('नमस्ते, मैं रिया हूँ'), out)
        self.assertNotIn('mentioned in passing', ' '.join(out))

    def test_an_opening_without_disclosure_gets_the_fixed_line_never_the_guidance(self):
        out = opening('Namaste Asha ji, aapki policy ka renewal agle hafte hai.')
        self.assertTrue(out[0].startswith('Main Suraksha ki AI assistant hoon.'), out)
        self.assertNotIn(GUIDANCE, ' '.join(out))
        out = opening('नमस्ते आशा जी, आपकी पॉलिसी का रिन्यूअल अगले हफ़्ते है।', language='hi-IN')
        self.assertTrue(out[0].startswith('मैं Suraksha की AI असिस्टेंट हूँ।'), out)
        out = opening('नमस्ते आशा जी, आपकी पॉलिसी का रिन्यूअल अगले हफ़्ते है।')
        self.assertTrue(out[0].startswith('मैं Suraksha की AI असिस्टेंट हूँ।'), 'a Hinglish call written in Devanagari gets the Devanagari line')
        out = opening('Namaste Asha ji.', clause='')
        self.assertTrue(out[0].startswith('Main Suraksha ki AI assistant hoon.'), 'no clause still discloses')



class NameSlot(unittest.TestCase):
    """Staging bug 2026-10-23: test calls carry no contact name and she said "क्या मैं ___ से बात कर रही हूँ?"."""
    def last_block(self, name):
        import asyncio
        t = ticket(); t['contact']['displayName'] = name; s, _ = sink(t['conversationId'])
        b = FakeBrain(['Namaste, main Suraksha ki AI assistant hoon.'])
        sess = SimSession(t, components(brain=b), s, env={}, watchdog_s=0.01)
        async def go(): await sess.start(); await sess.hang_up()
        asyncio.run(go())
        return b.calls[0][-1]['content']

    def test_no_name_means_a_phrasing_that_needs_none(self):
        last = self.last_block('')
        self.assertIn('their name is not known: never ask for anyone by name and never leave a blank', last)

    def test_a_name_reaches_her(self):
        self.assertIn('the person you are calling: Asha', self.last_block('Asha'))


if __name__ == '__main__':
    unittest.main()
