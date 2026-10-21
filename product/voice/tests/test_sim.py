import asyncio, json, unittest
from tests.fixtures import SECRET, Clock, FakeBrain, bodies, components, sink, ticket
from vpvoice import signing
from vpvoice.session import SimSession


def run(coro): return asyncio.run(coro)


async def call(script, lines, t=None, env=None, clock=None, brain=None, fallback_brain=None, hang_up=True):
    t = t or ticket()
    s, p = sink(t['conversationId'])
    comp = components(t['stack']['id'], brain=brain or FakeBrain(script), fallback_brain=fallback_brain)
    sess = SimSession(t, comp, s, clock=clock or Clock(), env=env or {}, watchdog_s=0.01)
    replies = [await sess.start()]
    for line in lines:
        if sess.ended: break
        replies.append(await sess.caller_says(line))
    if hang_up and not sess.ended: await sess.hang_up()
    return sess, p, replies


def evs(p): return [e for b in bodies(p) for e in b['events']]
def of(p, type_): return [e for e in evs(p) if e['type'] == type_]


class EndToEnd(unittest.TestCase):
    def test_sim_call_events_in_order_signed(self):
        script = ['नमस्ते, Suraksha की AI असिस्टेंट Riya बोल रही हूँ, क्या मेरी बात Asha जी से हो रही है?',
                  'बढ़िया! अच्छी ख़बर ये है कि आपका cover बढ़ गया है। Renewal 2 November को due है।',
                  'ठीक है, मैं link भेज देती हूँ। <goal:renewal_intent=link> <tool:send_whatsapp_link>',
                  'बहुत शुक्रिया Asha जी, अपना ख्याल रखिए, bye! <end_call>']
        sess, p, replies = run(call(script, ['हाँ जी, बोलिए', 'अच्छा, link भेज दो', 'ठीक है, thank you']))
        e = evs(p)
        self.assertEqual([x['seq'] for x in e], list(range(1, len(e) + 1)))
        self.assertEqual(e[0]['type'], 'call.started')
        self.assertEqual(e[-1]['type'], 'call.ended')
        self.assertEqual(bodies(p)[-1]['events'], [e[-1]], 'call.ended goes alone, last')
        for b, h in zip(p.bodies, p.headers): signing.verify(SECRET, h, b)
        for b in bodies(p): self.assertEqual((b['protocol'], b['conversationId']), (1, '0b6f6e1a-1c2d-4e5f-8a9b-000000000001'))
        turns = of(p, 'turn')
        self.assertEqual([t['speaker'] for t in turns], ['agent', 'caller', 'agent', 'caller', 'agent', 'caller', 'agent'])
        self.assertNotIn('<', ''.join(t['text'] for t in turns), 'markers are never spoken or recorded')
        self.assertTrue(of(p, 'cost'))
        self.assertTrue(all(isinstance(c['inrMilli'], int) and c['component'] == 'brain' and c['unit'] == 'token' for c in of(p, 'cost')))
        self.assertEqual([m['kind'] for m in of(p, 'moment')], ['commitment'])
        self.assertEqual([x['name'] for x in of(p, 'tool')], ['send_whatsapp_link'])
        end = e[-1]
        self.assertEqual(end['endReason'], 'agent_ended')
        self.assertEqual(end['manifest']['fallbacksUsed'], [])
        self.assertEqual(end['manifest']['combinationId'], 'v2|gemini+gemini-3.5-flash-lite+gemini-lite~Despina')
        self.assertEqual(end['manifest']['agentVersionHash'], 'a' * 64)
        self.assertEqual(len(end['transcript']), 7)
        self.assertNotIn('recordingUri', end)

    def test_brief_used_as_given_and_tail_goes_last(self):
        brain = FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'जी, premium 18,450 है।', 'ठीक है।'])
        t = ticket(); t['contact']['memoryBrief'] = 'prefers short calls'; t['contact']['memoryStatus'] = 'loaded'
        run(call(None, ['हाँ जी', 'premium कितना है?'], t=t, brain=brain))
        msgs = brain.calls[-1]
        self.assertEqual(msgs[0], {'role': 'system', 'content': t['brief']['text']})
        self.assertIn('prefers short calls', msgs[1]['content'])
        self.assertEqual(msgs[-1]['role'], 'system')
        last = msgs[-1]['content']
        self.assertIn('Ledger of this call so far', last)
        self.assertIn('already said (spent):', last); self.assertIn('premium', last)
        self.assertIn('goals still open: renewal_intent', last)
        self.assertIn('<end_call>', last)
        self.assertEqual(sum(1 for m in msgs if m['content'] == t['brief']['text']), 1)

    def test_contact_rows_reach_the_model_after_brief_and_memory_before_the_tail(self):
        brain = FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ, क्या Asha जी बोल रही हैं?', 'जी, आपकी EMI 4,200 rupaye 5 November ko due hai.'])
        t = ticket(); t['contact']['memoryBrief'] = 'prefers short calls'; t['contact']['memoryStatus'] = 'loaded'
        t['contact']['facts'] = {'policy_no': 'SH-DEMO-0042', 'emi_due_date': '5 November', 'emi_amount': '₹4,200'}
        sess, p, replies = run(call(None, ['हाँ जी, बोलिए'], t=t, brain=brain))
        msgs = brain.calls[-1]
        self.assertEqual([m['role'] for m in msgs[:3]], ['system', 'system', 'system'])
        self.assertEqual(msgs[0]['content'], t['brief']['text'])
        self.assertIn('prefers short calls', msgs[1]['content'])
        self.assertEqual(msgs[2]['content'], 'Contact rows for this call (data, not lines):\n'
                         'emi amount: ₹4,200\nemi due date: 5 November\npolicy no: SH-DEMO-0042')
        self.assertTrue(msgs[-1]['content'].startswith('Ledger of this call so far'))
        # the amount is in the contact facts, so once identity is confirmed she may say it
        self.assertEqual(replies[1], ['जी, आपकी EMI 4,200 rupaye 5 November ko due hai.'])

    def test_contact_rows_none(self):
        brain = FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'])
        t = ticket(); t['contact']['facts'] = {}
        run(call(None, [], t=t, brain=brain))
        self.assertEqual(brain.calls[0][1]['content'], 'Contact rows for this call (data, not lines):\nnone')

    def test_contact_amounts_wait_for_identity(self):
        t = ticket(); t['contact']['facts'] = {'emi_amount': '₹4,200'}
        sess, p, replies = run(call(['नमस्ते, Suraksha की AI असिस्टेंट बोल रही हूँ, आपकी EMI 4,200 rupaye due hai.'], [], t=t))
        self.assertIn('RD11', [x['rule'] for x in of(p, 'safety')])

    def test_memory_not_used_unless_loaded(self):
        brain = FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'])
        t = ticket(); t['contact']['memoryBrief'] = 'secret-ish note'; t['contact']['memoryStatus'] = 'not_loaded_timeout'
        run(call(None, [], t=t, brain=brain))
        self.assertFalse(any('secret-ish note' in m['content'] for m in brain.calls[0]))


class Door(unittest.TestCase):
    def test_rd1_first_breath_gets_the_ai_clause(self):
        sess, p, replies = run(call(['नमस्ते, क्या मेरी बात Asha जी से हो रही है?'], []))
        self.assertTrue(replies[0][0].startswith('Suraksha की AI असिस्टेंट'))
        self.assertEqual(of(p, 'safety')[0]['rule'], 'RD1')
        self.assertTrue(sess.conv.state['disclosed'])

    def test_rd1_not_repeated(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'जी, बताइए।']
        sess, p, _ = run(call(script, ['हाँ']))
        self.assertEqual([x for x in of(p, 'safety') if x['rule'] == 'RD1'], [])

    def test_rd2_denial_is_replaced_by_the_truth(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'अरे नहीं, मैं AI नहीं हूँ, मैं इंसान हूँ।']
        sess, p, replies = run(call(script, ['सच बताओ, आप AI हो क्या?']))
        said = ' '.join(replies[1])
        self.assertIn('AI', said); self.assertNotIn('नहीं हूँ', said)
        self.assertIn(('RD2', 'replaced'), [(x['rule'], x['action']) for x in of(p, 'safety')])

    def test_rd2_asked_always_gets_the_truth_first(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'हाहा, आप बहुत मज़ेदार हैं।']
        sess, p, replies = run(call(script, ['aap AI ho kya?']))
        self.assertTrue(replies[1][0].startswith('Ji, main Suraksha ki taraf se ek AI assistant hoon.'))

    def test_rd3_crisis(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'अच्छा, वैसे renewal link भेज दूँ? <end_call>', 'मैं यहीं हूँ। <end_call>']
        sess, p, replies = run(call(script, ['सच कहूँ तो मैं मरना चाहता हूँ', 'पता नहीं']))
        said = ' '.join(replies[1])
        self.assertIn('14416', said); self.assertIn('112', said)
        self.assertIn(('RD3', 'suspended_goal'), [(x['rule'], x['action']) for x in of(p, 'safety')])
        self.assertEqual([h['reason'] for h in of(p, 'hand_off')], ['crisis'])
        self.assertEqual(sess.ended, 'caller_hung_up', 'she never ends a crisis call first: her <end_call> was ignored')
        self.assertNotIn('link', ' '.join(replies[1] + replies[2]), 'the goal is suspended')

    def test_rd4_never_asks_for_an_otp(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'ठीक है, आपके phone पर आया OTP बता दीजिए।', 'जी, link SMS पर भेज रही हूँ।']
        sess, p, replies = run(call(script, ['renew कैसे करूँ?']))
        self.assertNotIn('OTP', ' '.join(replies[1]))
        self.assertIn(('RD4', 'blocked'), [(x['rule'], x['action']) for x in of(p, 'safety')])
        self.assertEqual(replies[1], ['जी, link SMS पर भेज रही हूँ।'])

    def test_rd4_caller_reading_digits_is_stopped_and_redacted(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।']
        sess, p, replies = run(call(script, ['मेरा OTP है 4 8 2 9 1 7']))
        self.assertIn('mat bataiye', replies[1][0])
        caller = [t for t in of(p, 'turn') if t['speaker'] == 'caller'][0]
        self.assertNotIn('4 8 2 9', caller['text']); self.assertIn('[OTP]', caller['text'])
        self.assertIn(('RD4', 'redacted'), [(x['rule'], x['action']) for x in of(p, 'safety')])
        self.assertNotIn('4 8 2 9', json.dumps(evs(p), ensure_ascii=False))

    def test_rd5_no_payment_on_the_call(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'Aap abhi call par hi payment kar dijiye.', 'मैं secure link भेज देती हूँ।']
        sess, p, replies = run(call(script, ['ठीक है, pay कैसे करूँ?']))
        self.assertIn(('RD5', 'blocked'), [(x['rule'], x['action']) for x in of(p, 'safety')])
        self.assertEqual(replies[1], ['मैं secure link भेज देती हूँ।'])

    def test_second_block_ends_with_a_safe_line(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'OTP बता दीजिए।', 'CVV बता दीजिए।']
        sess, p, replies = run(call(script, ['हाँ']))
        self.assertEqual(replies[1], ['Ji, ye main pakka karke aapko batati hoon.'])

    def test_rd7_promotion_fence_on_a_service_call(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'Is baar renewal par 10 percent discount bhi hai!', 'Renewal 2 November को है।']
        sess, p, replies = run(call(script, ['हाँ']))
        self.assertEqual(replies[1], ['Renewal 2 November को है।'])
        self.assertIn('RD7', [x['rule'] for x in of(p, 'safety')])

    def test_rd10_recording_refusal(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'जी, बिल्कुल।']
        sess, p, _ = run(call(script, ['ये call record mat karo']))
        self.assertIn(('RD10', 'flagged'), [(x['rule'], x['action']) for x in of(p, 'safety')])
        self.assertTrue(sess.conv.state['recording_refused'])
        self.assertNotIn('recordingUri', of(p, 'call.ended')[0])

    def test_rd11_account_details_wait_for_identity(self):
        script = ['नमस्ते, Suraksha की AI असिस्टेंट बोल रही हूँ, policy SH-DEMO-0042 के बारे में।', 'ठीक है।']
        sess, p, replies = run(call(script, []))
        self.assertIn('RD11', [x['rule'] for x in of(p, 'safety')])
        self.assertNotIn('SH-DEMO-0042', json.dumps(evs(p), ensure_ascii=False))

    def test_opt_out(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'जी, बिल्कुल, आपको आगे से call नहीं आएगा। शुक्रिया।']
        sess, p, _ = run(call(script, ['मुझे दोबारा कॉल मत करना']))
        self.assertEqual([m['kind'] for m in of(p, 'moment')], ['opt_out'])
        self.assertEqual(sess.ended, 'opt_out')

    def test_wants_human_hands_off(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।']
        sess, p, replies = run(call(script, ['मुझे किसी इंसान से बात करनी है']))
        h = of(p, 'hand_off')
        self.assertEqual([x['reason'] for x in h], ['asks_for_human'])
        self.assertEqual(h[0]['target'], 'callback')
        self.assertEqual(sess.ended, 'handed_off')
        self.assertIn('साथी', replies[1][0])

    def test_crisis_caller_who_accepts_a_human_is_not_hung_up_on(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'Tele-MANAS 14416 और 112 पर बात हो सकती है। मैं यहीं हूँ।', 'जी, हमारी team आपसे जुड़ेगी, मैं तब तक यहीं हूँ।']
        sess, p, replies = run(call(script, ['main marna chahta hoon', 'haan, kisi insaan se baat karao please']))
        self.assertEqual(sess.ended, 'caller_hung_up', 'she never ends a crisis call')
        self.assertTrue(replies[2], 'the caller hears something')
        self.assertEqual([h['reason'] for h in of(p, 'hand_off')], ['crisis'])

    def test_digits_in_a_crisis_still_raise_the_alert(self):
        sess, p, replies = run(call(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'], ['main mar jaana chahti hoon, mera OTP 1 2 3 4 5 6 hai']))
        self.assertEqual([h['reason'] for h in of(p, 'hand_off')], ['crisis'])
        self.assertIn('mat bataiye', replies[1][0])

    def test_end_call_ignored_without_a_goodbye_or_mid_question(self):
        script = ['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'Premium 18,450 है। <end_call>']
        sess, p, _ = run(call(script, ['premium कितना है?'], hang_up=False))
        self.assertIsNone(sess.ended)


class Limits(unittest.TestCase):
    def test_max_cost_ends_the_call(self):
        t = ticket(); t['limits']['maxCostInrMilli'] = 1      # one brain reply already costs more
        sess, p, _ = run(call(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'जी।'], ['हाँ'], t=t))
        self.assertEqual(of(p, 'call.ended')[0]['endReason'], 'max_cost')
        self.assertEqual(len([x for x in of(p, 'turn') if x['speaker'] == 'caller']), 0)

    def test_max_duration_ends_the_call(self):
        clock = Clock()
        async def go():
            t = ticket(); t['limits']['maxDurationS'] = 30
            s, p = sink()
            sess = SimSession(t, components(brain=FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'])), s, clock=clock, env={}, watchdog_s=0.01)
            await sess.start()
            clock.advance(31)
            await asyncio.wait_for(sess.done.wait(), 2)
            return sess, p
        sess, p = run(go())
        self.assertEqual(sess.ended, 'max_duration')
        self.assertEqual(of(p, 'call.ended')[0]['durationS'], 31.0)

    def test_crisis_stretches_limits_then_hands_off(self):
        clock = Clock()
        async def go():
            t = ticket(); t['limits']['maxDurationS'] = 30
            s, p = sink()
            sess = SimSession(t, components(brain=FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'मैं यहीं हूँ।'])), s, clock=clock, env={}, watchdog_s=0.01)
            await sess.start(); await sess.caller_says('मैं खुद को खत्म करना चाहती हूँ')
            clock.advance(31); await asyncio.sleep(0.05)
            alive = sess.ended is None
            clock.advance(30); await asyncio.wait_for(sess.done.wait(), 2)
            return sess, p, alive
        sess, p, alive = run(go())
        self.assertTrue(alive)
        self.assertEqual(sess.ended, 'crisis_handoff')


class Fallbacks(unittest.TestCase):
    def test_test_call_never_falls_back(self):
        sess, p, _ = run(call(None, ['हाँ'], brain=FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'], fail_at=1),
                              env={'VP_FALLBACKS': '1'}, fallback_brain=FakeBrain(['जी।'])))
        end = of(p, 'call.ended')[0]
        self.assertEqual(end['endReason'], 'error')
        self.assertEqual(end['manifest']['fallbacksUsed'], [])
        self.assertIn('brain', sess.error)

    def test_live_call_falls_back_only_when_enabled_and_records_it(self):
        # no same-model pair exists since OpenRouter Gemini was retired; the mechanism is held by a fictional one
        from unittest import mock
        from vpvoice import catalog
        alt = 'gemini-3.5-flash-lite@other-host'
        with mock.patch.dict(catalog.BRAIN_FALLBACK, {'gemini-3.5-flash-lite': alt}), \
             mock.patch.dict(catalog.BRAINS, {alt: dict(catalog.BRAINS['gemini-3.5-flash-lite'])}):
            self._falls_back(alt)

    def _falls_back(self, alt):
        t = ticket(test=False)
        sess, p, replies = run(call(None, ['हाँ'], t=t, brain=FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'], fail_at=1),
                                    env={'VP_FALLBACKS': '1'}, fallback_brain=FakeBrain(['जी, बताइए।'])))
        fb = of(p, 'call.ended')[0]['manifest']['fallbacksUsed']
        self.assertEqual([(f['component'], f['from'], f['to']) for f in fb], [('brain', 'gemini-3.5-flash-lite', alt)])
        self.assertEqual(replies[1], ['जी, बताइए।'])
        sess, p, _ = run(call(None, ['हाँ'], t=ticket(test=False), brain=FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'], fail_at=1),
                              env={}, fallback_brain=FakeBrain(['जी।'])))
        self.assertEqual(sess.ended, 'error')


if __name__ == '__main__':
    unittest.main()
