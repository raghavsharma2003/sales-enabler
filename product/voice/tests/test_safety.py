import asyncio, json, unittest
from tests.fixtures import FakeBrain, components, sink, ticket
from vpvoice import safety
from vpvoice.safety import DoorContext, caller_signals, redact, reply_door

CTX = dict(brand={'name': 'Suraksha', 'verifiedDomains': ['suraksha.example.in']}, disclosed=True, identity_verified=True,
           disclosure_clause='Suraksha की AI असिस्टेंट')


def door(text, **kw):
    return reply_door(text, DoorContext(**{**CTX, **kw}))


class RuntimeDoor(unittest.TestCase):
    """The runtime layer over the shared door: first breath, asked-if-AI, crisis lines. The shared rules themselves are
    held to cases.json in test_safety_cases.py."""
    def test_first_breath_gets_the_clause_and_counts_as_disclosed(self):
        v = door('Namaste, kya meri baat Asha ji se ho rahi hai?', disclosed=False, turn_index=0)
        self.assertEqual((v['action'], v['rule']), ('replace', 'RD1'))
        self.assertTrue(v['text'].startswith('Suraksha की AI असिस्टेंट, '))
        self.assertEqual(door('Doosri baat.', disclosed=False, turn_index=0, first_sentence=False)['action'], 'pass')

    def test_agenda_before_disclosure_is_blocked_after_the_first_breath(self):
        v = door('Aapka premium due hai.', disclosed=False, turn_index=2)
        self.assertEqual((v['action'], v['rule']), ('block', 'RD1'))

    def test_asked_ai_truth_first(self):
        v = door('Haha, aap bahut mazedaar hain.', asked_ai=True)
        self.assertEqual(v['rule'], 'RD2'); self.assertTrue(v['text'].startswith('Ji, main Suraksha ki taraf se ek AI assistant hoon.'))
        self.assertEqual(door('Ji haan, main AI assistant hoon.', asked_ai=True)['action'], 'pass')

    def test_crisis_lines_first_then_goal_suspended(self):
        v = door('Main yahin hoon.', crisis=True)
        self.assertEqual((v['action'], v['rule']), ('replace', 'RD3')); self.assertIn('14416', v['text']); self.assertIn('112', v['text'])
        self.assertEqual(door('Main yahin hoon, aaram se baat kijiye.', crisis=True, crisis_lines_given=True)['action'], 'pass')
        self.assertEqual(door('Renewal ka payment link bhej doon?', crisis=True, crisis_lines_given=True)['rule'], 'RD3')

    def test_denial_replaced(self):
        for t in ['नहीं नहीं, मैं AI नहीं हूँ।', 'main AI nahi hoon', "I'm a real person."]:
            v = door(t); self.assertEqual((v['action'], v['rule']), ('replace', 'RD2'), t)

    def test_contact_facts_wait_for_identity(self):
        self.assertEqual(door('Policy SH-0042 ka renewal hai.', identity_verified=False, contact_facts={'policy_no': 'SH-0042'}).get('rule'), 'RD11')
        self.assertEqual(door('Policy SH-0042 ka renewal hai.', identity_verified=True, contact_facts={'policy_no': 'SH-0042'})['action'], 'pass')

    def test_contract_door_for_ts_shaped_ctx(self):
        v = reply_door('OTP bata dijiye', {'category': 'service', 'sectorPacks': ['base'], 'brand': {'name': 'X', 'verifiedDomains': []},
                                           'facts': [], 'neverSay': [], 'disclosed': True, 'identityVerified': True, 'recordingRefused': False,
                                           'crisis': False, 'turnIndex': 3})
        self.assertEqual(v['rule'], 'RD4')


class SharedRuleGaps(unittest.TestCase):
    """Inputs the shared rules (rules.json) let through that a realistic call can produce. Reported to the safety
    module; the runtime keeps the shared semantics exactly, so these are expected failures until rules.json changes.
    When one starts passing, unittest reports an unexpected success: move it into the passing tests."""
    @unittest.expectedFailure
    def test_staff_claim_devanagari(self): self.assertEqual(door('मैं यहाँ काम करती हूँ।').get('rule'), 'RD2')

    @unittest.expectedFailure
    def test_secret_ask_after_a_negated_clause(self): self.assertEqual(door('Main OTP nahi maangungi, bas card number bata dijiye.').get('rule'), 'RD4')

    @unittest.expectedFailure
    def test_password_send(self): self.assertEqual(door('password type karke bhej do').get('rule'), 'RD4')

    @unittest.expectedFailure
    def test_take_payment_myself(self): self.assertEqual(door('Main payment abhi le leti hoon.').get('rule'), 'RD5')

    @unittest.expectedFailure
    def test_pay_on_call_devanagari(self): self.assertEqual(door('आप अभी call पर ही payment कर दीजिए, UPI ID बताती हूँ।').get('rule'), 'RD5')

    @unittest.expectedFailure
    def test_irdai_new_plan(self):
        self.assertEqual(door('Aap naya plan le lijiye, better hai.', sector_packs=['insurance_irdai'], category='promotional').get('rule'), 'RD8')

    @unittest.expectedFailure
    def test_pin_after_a_pincode_is_still_masked(self):
        self.assertNotIn('4321', redact('mera pincode 110001 hai aur ATM pin 4321 hai'))

    @unittest.expectedFailure
    def test_opt_out_devanagari(self): self.assertTrue(caller_signals('आगे से कॉल मत करना')['optOut'])

    @unittest.expectedFailure
    def test_asks_ai_devanagari(self): self.assertTrue(caller_signals('सच बताओ, आप AI हो क्या?')['asksIfAi'])


class Signals(unittest.TestCase):
    def on(self, t): return {k for k, v in caller_signals(t).items() if v}

    def test_signals_the_runtime_acts_on(self):
        cases = {'aap AI ho kya?': {'asksIfAi'}, 'मैं मरना चाहता हूँ': {'crisis'}, 'ye call record mat karo': {'refusesRecording'},
                 'mujhe dobara call mat karna': {'optOut'}, 'kisi insaan se baat karao': {'wantsHuman'},
                 'mera OTP hai 4 8 2 9': {'readingSensitiveDigits'}, 'otp hai chaar paanch saat aath': {'readingSensitiveDigits'}}
        for t, want in cases.items(): self.assertEqual(self.on(t), want, t)
        for t in ['abhi busy hoon, baad mein call karna', 'mera number 9000000012 hai', 'ठीक है, link भेज दो']:
            self.assertEqual(self.on(t), set(), t)
        self.assertTrue(safety.callback_requested('abhi busy hoon, baad mein call karna'))

    def test_redact_masks(self):
        self.assertEqual(redact('mera OTP hai 4 8 2 9 1 7'), 'mera OTP hai [OTP]')
        self.assertNotIn('4829', redact('mera OTP ४८२९ hai').replace(' ', ''))
        for t in ['premium 18,450 hai', 'renewal 2 November ko', 'mera number 9000000012 hai']:
            self.assertEqual(redact(t), t)


class LiveDoor(unittest.TestCase):
    """The speech-to-speech door reads the output transcription: a failing sentence cuts playback and the model is told
    the line to say instead."""
    def test_denial_in_live_output_is_cut(self):
        from vpvoice.s2s import LiveSession
        from tests.test_cascade import FakeLine

        class Up:
            closed = False
            def __init__(self): self.sent = []
            async def send_json(self, o): self.sent.append(o)

        async def go():
            t = ticket('v2-live', transport={'kind': 'webrtc', 'offerUrl': 'https://control.example.test/j'})
            comp = components('v2-live', brain=FakeBrain([]))
            s, p = sink()
            line = FakeLine()
            sess = LiveSession(t, comp, s, line, env={}, watchdog_s=0.05)
            sess.up = Up(); sess.cur = 1; sess.conv.state['disclosed'] = True
            await sess._door_text('अरे नहीं, मैं AI नहीं हूँ। ')
            await sess._door_text('मैं तो इंसान हूँ।')
            return sess, line, s
        sess, line, s = asyncio.run(go())
        self.assertTrue(sess.cut); self.assertEqual(line.flushes, [1])
        note = json.dumps(sess.up.sent[-1], ensure_ascii=False)
        self.assertIn('RD2', note); self.assertIn('AI assistant', note)
        self.assertEqual([(e['rule'], e['action']) for e in s.pending if e['type'] == 'safety'], [('RD2', 'replaced')])


if __name__ == '__main__':
    unittest.main()
