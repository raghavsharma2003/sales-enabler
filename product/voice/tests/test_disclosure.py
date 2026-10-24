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


    def test_opening_vectors(self):
        self.assertEqual(sum(1 for v in D['opening_vectors'] if v['note'].startswith('staging')), 7)
        for v in D['opening_vectors']:
            self.assertEqual(safety.opening_discloses(v['sentences']), v['discloses'], v['note'])


class WholeOpening(unittest.TestCase):
    """rejected.2026-10-23.rd1-first-sentence-window-double-disclosure: RD1 judged her first sentence only, so a
    disclosure after a greeting, a question or a "..." got the fixed line prefixed and she disclosed twice (3/6 staging
    calls). The runtime now holds the opening until a sentence discloses or the reply ends."""
    STAGING = [v for v in D['opening_vectors'] if v['note'].startswith('staging')]

    def test_the_six_staging_openings_are_said_as_written_with_one_disclosure(self):
        for v in self.STAGING:
            out = opening(' '.join(v['sentences']), clause='')
            said = ' '.join(out)
            self.assertTrue(said.endswith(v['sentences'][0][-12:]) or v['sentences'][0][-12:] in out[0], (v['note'], out))   # her own words first (names.repair may fix a wrong name)
            self.assertNotIn('Suraksha', said, (v['note'], out))                          # and no fixed line anywhere

    def test_a_disclosure_after_a_greeting_is_not_doubled(self):
        out = opening('Hello Asha ji! Main Suraksha ki AI assistant hoon, Riya. Aapki policy ka renewal agle hafte hai.')
        self.assertEqual(out[0], 'Hello Asha ji!', out)
        self.assertEqual(sum(1 for s in out if 'AI assistant' in s), 1, out)

    def test_an_opening_that_never_discloses_still_gets_the_line_first(self):
        out = opening('Hello Asha ji! Main Riya hoon. Aapki policy ka renewal agle hafte hai.')
        self.assertTrue(out[0].startswith('Main Suraksha ki AI assistant hoon. Hello Asha ji!'), out)

    def test_only_the_opening_is_held(self):
        from vpvoice.conversation import Conversation, Draft
        t = ticket(); s, _ = sink(t['conversationId'])
        c = Conversation(t, FakeBrain([]), s, meter=None, clock=lambda: 0.0)
        self.assertTrue(c.holds_opening(Draft('x')))
        c.agent_turns = 1
        self.assertFalse(c.holds_opening(Draft('x')))
        c.agent_turns = 0; c.state['disclosed'] = True
        self.assertFalse(c.holds_opening(Draft('x')))


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
