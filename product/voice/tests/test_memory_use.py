# Relational memory in the call (memory_use.py; seam with the memory module): the identity gate, at most one item, a
# mid-call forget, the ask-to-keep shape. A scripted brain; the prompt it was given is the evidence. Synthetic data only.
import unittest
from tests.fixtures import FakeBrain, ticket
from tests.test_sim import call, of, run
from vpvoice import memory_use

BRIEF = ('callback: they_asked_for=Wed 11:00 am (said yesterday)\nprefs: language=hinglish, short calls\n'
         'open: promise_to_pay=5 November (said 3 days ago)\npersonal: life_event=daughter\'s wedding (said 2 weeks ago)')
ASK = 'नमस्ते, Suraksha की AI असिस्टेंट Riya बोल रही हूँ, क्या मेरी बात Asha जी से हो रही है?'


def t_with(brief=BRIEF, job=None):
    t = ticket(); t['contact']['memoryBrief'] = brief; t['contact']['memoryStatus'] = 'loaded'
    if job: t['agent']['job'] = job
    return t


def mem_msg(msgs): return next((m['content'] for m in msgs if m['role'] == 'system' and m['content'].startswith('Memory brief')), '')
def last(msgs): return msgs[-1]['content'] if msgs[-1]['role'] == 'system' else msgs[-2]['content']


class Gate(unittest.TestCase):
    def test_prefs_only_until_verified_then_one_item_then_used(self):
        brain = FakeBrain([ASK, 'जी, आपने 5 November का कहा था, बस वही याद दिला रही थी।', 'ठीक है जी।', 'शुक्रिया।'])
        run(call(None, ['हाँ, मैं Asha बोल रही हूँ', 'हाँ याद है', 'ठीक है'], t=t_with(), brain=brain))
        opening = brain.calls[0]
        self.assertEqual(mem_msg(opening), 'Memory brief for this person (from earlier calls):\nprefs: language=hinglish, short calls')
        self.assertNotIn(memory_use.SHAPES['one_item'], last(opening))
        verified = brain.calls[1]
        self.assertIn('promise_to_pay', mem_msg(verified)); self.assertIn("daughter's wedding", mem_msg(verified))
        self.assertIn(memory_use.SHAPES['one_item'], last(verified))
        self.assertIn(memory_use.SHAPES['used'], last(brain.calls[2]), 'she used one: the shape turns to "already used"')

    def test_never_verified_never_sees_more_than_prefs(self):
        brain = FakeBrain([ASK, 'जी, कोई बात नहीं।', 'ठीक है।'])
        run(call(None, ['नहीं, आपने गलत नंबर लगाया है', 'ok'], t=t_with(), brain=brain))
        for msgs in brain.calls: self.assertNotIn('promise_to_pay', mem_msg(msgs))


class Forget(unittest.TestCase):
    def test_forget_drops_the_brief_acknowledges_once_and_marks_the_call(self):
        brain = FakeBrain([ASK, 'जी।', 'ठीक है, नहीं रखूँगी।', 'जी, बताइए।', 'शुक्रिया।'])
        sess, p, _ = run(call(None, ['हाँ, मैं Asha हूँ', 'और हाँ, ये यह बात याद मत रखना', 'अच्छा, renewal कब है?', 'ok'], t=t_with(), brain=brain))
        self.assertIn('promise_to_pay', mem_msg(brain.calls[1]))
        self.assertEqual(mem_msg(brain.calls[2]), '', 'gone from the prompt for the rest of the call')
        self.assertIn(memory_use.SHAPES['forget_ack'], last(brain.calls[2]))
        self.assertNotIn(memory_use.SHAPES['forget_ack'], last(brain.calls[3]), 'acknowledged once')
        self.assertEqual(mem_msg(brain.calls[3]), '')
        self.assertEqual([(m['kind'], m.get('note')) for m in of(p, 'moment') if m['kind'] == 'forget_request'], [('forget_request', 'call')])


class KeepAsk(unittest.TestCase):
    def test_once_for_a_personal_detail_never_sensitive_never_on_collections(self):
        brain = FakeBrain([ASK, 'अरे वाह, बधाई हो!', 'जी।', 'शुक्रिया।'])
        run(call(None, ['हाँ, मैं Asha हूँ, अगले महीने मेरी बेटी की शादी है', 'हाँ, और फिर शादी के बाद', 'ok'], t=t_with(''), brain=brain))
        self.assertIn(memory_use.SHAPES['keep_ask'], last(brain.calls[1]))
        self.assertNotIn(memory_use.SHAPES['keep_ask'], last(brain.calls[2]), 'once per call')
        for words, job in [('पापा अस्पताल में हैं, बीमार हैं, शादी टल गई', None), ('अगले महीने मेरी शादी है', 'emi_collections')]:
            brain = FakeBrain([ASK, 'जी।', 'ठीक है।'])
            run(call(None, ['हाँ, मैं Asha हूँ, ' + words, 'ok'], t=t_with('', job=job), brain=brain))
            self.assertNotIn(memory_use.SHAPES['keep_ask'], last(brain.calls[1]), (words, job))


if __name__ == '__main__':
    unittest.main()
