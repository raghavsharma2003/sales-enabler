# The reply gap, stage by stage, and the cuts made to it (each behind a flag): fake ears, brain and voice, the real
# energy VAD, turn-taking and playback clock. No network. Deterministic: the fakes answer at once, so every assertion is
# about order and flags, never about wall-clock speed.
import asyncio, os, unittest
from tests.fixtures import FakeBrain, components, sink, ticket
from tests.test_cascade import FakeEars, FakeLine, FakeVoice, QUIET, SPEECH, feed, wait_until

os.environ['VP_VAD'] = 'energy'
from vpvoice.cascade import CascadeSession, same_words      # noqa: E402

OPEN = 'नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'


def make(script, env=None):
    t = ticket(transport={'kind': 'webrtc', 'offerUrl': 'https://control.example/join'})
    ears = {}
    def make_ears(p, f, e, lang='hi-IN'):
        ears['e'] = FakeEars(p, f, e); return ears['e']
    comp = components(brain=FakeBrain(script), ears=make_ears, voice=FakeVoice())
    s, p = sink(t['conversationId'])
    sess = CascadeSession(t, comp, s, FakeLine(), env=env or {}, watchdog_s=0.02, tick_s=0.01)
    return sess, ears, comp


async def quiet_until(sess, cond, frames=200):
    for _ in range(frames):
        if cond(): return True
        await feed(sess, 1, QUIET)
    return cond()


async def caller_turn(sess, ears, partial, final, env_wait=True):
    """The caller says `partial` (heard as a partial), stops; once she is quiet, the recogniser's `final` arrives."""
    await feed(sess, 25); ears['e'].on_p(partial)
    spec = await quiet_until(sess, lambda: sess.pending is not None and sess.pending.speculative, frames=40)
    await feed(sess, 10, QUIET)                       # the recogniser's final lags the VAD's end of speech
    ears['e'].on_f(final)
    return spec


class Breakdown(unittest.TestCase):
    def test_every_reply_gets_a_stage_breakdown(self):
        async def go():
            sess, ears, comp = make([OPEN, 'जी, renewal 2 November को है।'], env={'VP_SPECULATE_PARTIAL': '0'})
            await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
            await feed(sess, 25); ears['e'].on_f('हाँ जी, बोलिए'); await quiet_until(sess, lambda: sess.conv.agent_turns == 2)
            await wait_until(lambda: sess.timing)
            await sess.end('caller_hung_up')
            return sess
        sess = asyncio.run(go())
        self.assertEqual(len(sess.timing), 1, 'the opening has no gap and no row')
        row = sess.timing[0]
        self.assertEqual(set(row['stages']), {n for n, _, _ in CascadeSession.STAGES})
        self.assertIsInstance(row['gapMs'], int); self.assertFalse(row['speculative'])
        at = row['at']
        for k in ('brain_req', 'brain_first', 'sentence', 'tts_req', 'tts_first', 'release', 'audio'):
            self.assertIsNotNone(at[k], k)
        # the marks happen in pipeline order, and the last one is the gap itself
        self.assertLessEqual(at['brain_req'], at['brain_first']); self.assertLessEqual(at['brain_first'], at['sentence'])
        self.assertLessEqual(at['sentence'], at['tts_req']); self.assertLessEqual(at['tts_req'], at['tts_first'])
        self.assertLessEqual(at['tts_first'], at['audio']); self.assertLessEqual(abs(at['audio'] - row['gapMs']), 2)
        # the hold waits for STATEMENT_HOLD_MS of silence after a statement: it is where this gap went
        self.assertGreaterEqual(row['stages']['hold'], 0)
        summ = sess.timing_summary()
        self.assertEqual(summ['n'], 1); self.assertEqual(summ['gapMs'], row['gapMs'])
        self.assertEqual(set(summ['stagesMs']), set(row['stages']))

    def test_summary_of_a_call_with_no_replies(self):
        sess, _, _ = make([OPEN])
        async def go():
            s = sess; await s.start(); await wait_until(lambda: s.conv.agent_turns == 1); await s.end('caller_hung_up')
        asyncio.run(go())
        self.assertEqual(sess.timing_summary()['n'], 0); self.assertIsNone(sess.timing_summary()['gapMs'])


class Speculation(unittest.TestCase):
    def test_same_words(self):
        self.assertTrue(same_words('Haan ji, boliye.', 'haan ji boliye'))
        self.assertTrue(same_words('हाँ जी, बोलिए।', 'हाँ जी बोलिए'))
        self.assertFalse(same_words('हाँ जी', 'हाँ जी बोलिए'))
        self.assertFalse(same_words('do hazaar', 'dus hazaar'))

    def test_a_matching_final_keeps_the_early_reply(self):
        async def go():
            sess, ears, comp = make([OPEN, 'जी, renewal 2 November को है।'])
            await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
            spec = await caller_turn(sess, ears, 'हाँ जी बोलिए', 'हाँ जी, बोलिए।')
            await quiet_until(sess, lambda: sess.conv.agent_turns == 2); await wait_until(lambda: sess.timing)
            await sess.end('caller_hung_up')
            return sess, comp, spec
        sess, comp, spec = asyncio.run(go())
        self.assertTrue(spec, 'a reply started on the partial before the final arrived')
        self.assertEqual(len(comp.brain.calls), 2, 'one brain request for the reply, not two')
        row = sess.timing[0]
        self.assertTrue(row['speculative'])
        self.assertLess(row['at']['brain_req'], row['at']['final'], 'the brain started before the final')
        caller = [t for t in sess.conv.transcript if t['speaker'] == 'caller']
        self.assertEqual(caller[-1]['text'], 'हाँ जी, बोलिए।', 'the turn records the final, not the partial')

    def test_a_different_final_discards_it(self):
        async def go():
            sess, ears, comp = make([OPEN, 'SPECULATIVE जवाब।', 'जी, कोई बात नहीं।'])
            await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
            spec = await caller_turn(sess, ears, 'हाँ जी', 'नहीं जी, अभी नहीं।')
            await quiet_until(sess, lambda: sess.conv.agent_turns == 2); await wait_until(lambda: sess.timing)
            await sess.end('caller_hung_up')
            return sess, comp, spec
        sess, comp, spec = asyncio.run(go())
        self.assertTrue(spec)
        self.assertEqual(len(comp.brain.calls), 3, 'the discarded draft, then the reply to the final')
        agent = ' '.join(t['text'] for t in sess.conv.transcript if t['speaker'] == 'agent')
        self.assertNotIn('SPECULATIVE', agent, 'nothing of the discarded draft was heard')
        self.assertIn('कोई बात नहीं', agent)
        self.assertIn('नहीं जी, अभी नहीं।', str(comp.brain.calls[-1]))
        self.assertFalse(sess.timing[0]['speculative'])

    def test_no_speculation_on_digits_or_when_off(self):
        for env, partial in (({}, 'mera pin 4321 hai'), ({'VP_SPECULATE_PARTIAL': '0'}, 'हाँ जी बोलिए')):
            async def go():
                sess, ears, comp = make([OPEN, 'जी।', 'जी।'], env=env)
                await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
                spec = await caller_turn(sess, ears, partial, partial)
                await sess.end('caller_hung_up')
                return sess, comp, spec
            sess, comp, spec = asyncio.run(go())
            self.assertFalse(spec, (env, partial))
            self.assertNotIn('4321', str(comp.brain.calls))


class Prewarm(unittest.TestCase):
    def counting(self):
        class Warm(FakeVoice):
            def __init__(self): super().__init__(); self.warms = 0
            async def warm(self): self.warms += 1
        return Warm()

    def run_turns(self, env):
        voice = self.counting()
        async def go():
            sess, ears, comp = make([OPEN, 'जी।', 'जी।'], env=env); comp.voice = voice
            await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
            for _ in range(2):
                await feed(sess, 25); await feed(sess, 30, QUIET)
            await asyncio.sleep(0.05); await sess.end('caller_hung_up')
        asyncio.run(go())
        return voice.warms

    def test_each_caller_turn_warms_the_voice(self):
        self.assertEqual(self.run_turns({}), 3, 'at the start, then once per caller turn')
        self.assertEqual(self.run_turns({'VP_PREWARM': '0'}), 1, 'only the start-of-call warm')

    def test_warm_hosts_is_throttled_and_never_raises(self):
        from vpvoice.providers import warm
        warm._last.clear()
        class Http:
            def __init__(self): self.heads = []
            def head(self, url, **kw):
                self.heads.append(url); raise OSError('offline (fake)')
        async def go():
            h = Http()
            warm.warm_hosts(h, ['a.example', 'a.example', 'b.example', None])
            warm.warm_hosts(h, ['a.example'])                    # inside MIN_GAP_S: skipped
            await asyncio.sleep(0.01)
            return h.heads
        self.assertEqual(asyncio.run(go()), ['https://a.example/', 'https://b.example/'])
        self.assertTrue(warm.due('a.example', now=1e12))
        warm.warm_hosts(None, ['c.example'])                     # no session: nothing

    def test_google_route_without_vertex_does_nothing(self):
        from vpvoice.providers.google import GoogleRoute
        r = GoogleRoute(env={})
        self.assertFalse(r.usable)
        asyncio.run(r.warm(object()))                            # no token request, no host warm


class FirstClause(unittest.TestCase):
    def test_splitter_cuts_the_first_clause_only(self):
        from vpvoice.brief import Splitter
        text = 'Ji bilkul, aapka renewal 2 November ko hai, aur premium 18,450 rupaye hai. Kuch aur poochna hai?'
        sp = Splitter(first_clause_at=24); out = []
        for k in range(0, len(text), 5): out += sp.feed(text[k:k + 5])
        out += sp.flush()
        self.assertEqual(out, ['Ji bilkul, aapka renewal 2 November ko hai,', 'aur premium 18,450 rupaye hai.', 'Kuch aur poochna hai?'])
        plain = Splitter(); got = []
        for k in range(0, len(text), 5): got += plain.feed(text[k:k + 5])
        self.assertEqual(got + plain.flush(), ['Ji bilkul, aapka renewal 2 November ko hai, aur premium 18,450 rupaye hai.', 'Kuch aur poochna hai?'])

    def test_on_a_reply_but_never_the_opening(self):
        said = {}
        for env in ({'VP_FIRST_CLAUSE': '1'}, {}):
            async def go():
                sess, ears, comp = make(['नमस्ते, मैं Suraksha Health की AI असिस्टेंट हूँ, आपसे दो मिनट बात हो सकती है?',
                                         'जी बिल्कुल, आपका renewal 2 November को है, और premium वही है।'], env=env)
                await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
                await feed(sess, 25); ears['e'].on_f('हाँ जी, बताइए'); await quiet_until(sess, lambda: sess.conv.agent_turns == 2)
                await wait_until(lambda: len(comp.voice.said) >= 2 and not sess.active)
                await sess.end('caller_hung_up')
                return comp.voice.said
            said[bool(env)] = asyncio.run(go())
        on, off = said[True], said[False]
        self.assertEqual(on[0], off[0], 'the opening is never cut (RD1 reads its first sentence)')
        self.assertEqual(on[1], 'जी बिल्कुल, आपका renewal 2 November को है,')
        self.assertEqual(off[1], 'जी बिल्कुल, आपका renewal 2 November को है, और premium वही है।')


class BargeIn(unittest.TestCase):
    LONG = OPEN + ' ' + 'ये एक बहुत लंबा जवाब है जो काफ़ी देर तक चलता रहेगा। ' * 8

    def talk_over(self, heard, frames=60, env=None):
        """She is mid-opening; the caller talks over her for up to `frames` x 20 ms, heard as `heard`. Returns the ms of
        caller speech fed when her audio was flushed (None: she kept going)."""
        async def go():
            sess, ears, comp = make([self.LONG], env=env); line = sess.line
            await sess.start()
            await wait_until(lambda: sess.active is not None and sess.active.first is not None)
            await asyncio.sleep(0.2)
            for i in range(frames):
                if i == 3: ears['e'].on_p(heard)                  # the recogniser's first partial, 60 ms in
                await feed(sess, 1)
                if line.flushes:
                    await sess.end('caller_hung_up'); return (i + 1) * 20
            await sess.end('caller_hung_up')
            return None
        return asyncio.run(go())

    def test_turn_words(self):
        from vpvoice.cascade import turn_words
        self.assertEqual(turn_words('Haan ji, achha.'), [])
        self.assertEqual(turn_words('हाँ जी, एक मिनट'), ['एक', 'मिनट'])
        self.assertEqual(turn_words('nahi nahi'), ['nahi', 'nahi'])

    def test_words_stop_her_soon_after_barge_ms(self):
        ms = self.talk_over('ek minute ruko')
        self.assertIsNotNone(ms)
        self.assertGreaterEqual(ms, CascadeSession.BARGE_MS - 40)
        self.assertLessEqual(ms, CascadeSession.BARGE_MS + 200, 'stopped within the VAD onset of BARGE_MS')

    def test_a_nod_does_not_stop_her(self):
        self.assertIsNone(self.talk_over('haan ji', frames=50))              # 1 s of "haan ji" over her
        self.assertIsNotNone(self.talk_over('haan ji', frames=50, env={'VP_BARGE_NOD': '0'}), 'old rule: two words stop her')

    def test_a_long_nod_still_stops_her_eventually(self):
        ms = self.talk_over('haan ji', frames=100)
        self.assertIsNotNone(ms); self.assertGreaterEqual(ms, CascadeSession.BARGE_NOD_LONG_MS - 40)


if __name__ == '__main__':
    unittest.main()
