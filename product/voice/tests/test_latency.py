# The reply gap, stage by stage, and the cuts made to it (each behind a flag): fake ears, brain and voice, the real
# energy VAD, turn-taking and playback clock. No network. Deterministic: the fakes answer at once, so every assertion is
# about order and flags, never about wall-clock speed.
import asyncio, os, unittest
from tests.fixtures import FakeBrain, components, sink, ticket
from tests.test_cascade import FakeEars, FakeLine, FakeVoice, QUIET, SPEECH, feed, wait_until

os.environ['VP_VAD'] = 'energy'
from vpvoice.cascade import CascadeSession, same_words      # noqa: E402

OPEN = 'नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।'


# These tests exercise the flags themselves, so no provider counts as paced unless a test says so (Provider below
# covers the provider-aware defaults), and a partial counts as settled at once unless a test says otherwise.
UNPACED = {'VP_PACED_PROVIDERS': 'none', 'VP_SPECULATE_STABLE_MS': '0', 'VP_SPECULATE_PARTIAL': '1'}


def make(script, env=None, stack='v2-flashlite', raw_env=False):
    env = dict(env or {}) if raw_env else {**UNPACED, **(env or {})}
    t = ticket(stack, transport={'kind': 'webrtc', 'offerUrl': 'https://control.example/join'})
    ears = {}
    def make_ears(p, f, e, lang='hi-IN'):
        ears['e'] = FakeEars(p, f, e); return ears['e']
    comp = components(stack, brain=FakeBrain(script), ears=make_ears, voice=FakeVoice())
    s, p = sink(t['conversationId'])
    sess = CascadeSession(t, comp, s, FakeLine(), env=env, watchdog_s=0.02, tick_s=0.01)
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
        self.assertEqual(self.run_turns({'VP_PREWARM': '0'}), 0, 'none, not even at the start of the call')

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

    WORDS = {'VP_BARGE_AUDIO': '0'}                 # the word-based rule (before BARGE_AUDIO)

    def test_words_stop_her_soon_after_barge_ms(self):
        ms = self.talk_over('ek minute ruko', env=self.WORDS)
        self.assertIsNotNone(ms)
        self.assertGreaterEqual(ms, CascadeSession.BARGE_MS - 40)
        self.assertLessEqual(ms, CascadeSession.BARGE_MS + 200, 'stopped within the VAD onset of BARGE_MS')

    def test_a_nod_does_not_stop_her(self):
        self.assertIsNone(self.talk_over('haan ji', frames=50, env=self.WORDS))              # 1 s of "haan ji" over her
        self.assertIsNotNone(self.talk_over('haan ji', frames=50, env={**self.WORDS, 'VP_BARGE_NOD': '0'}), 'old rule: two words stop her')

    def test_partial_lag_and_threshold_override(self):
        async def go():
            sess, ears, comp = make([OPEN, 'जी।'], env={'VP_BARGE_LONG_MS': '500'})
            await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
            await feed(sess, 20); ears['e'].on_p('ek minute'); await feed(sess, 5); ears['e'].on_p('ek minute ruko')
            await sess.end('caller_hung_up')
            return sess
        sess = asyncio.run(go()); summ = sess.timing_summary()
        self.assertEqual(summ['partialLagN'], 1, 'one lag per stretch of speech, at its first partial')
        self.assertGreater(summ['partialLagMs'], 0); self.assertEqual(summ['bargeLongMs'], 500)
        self.assertEqual(CascadeSession.BARGE_LONG_MS, 700, 'the override is per call, never the class default')

    def test_a_long_nod_still_stops_her_eventually(self):
        ms = self.talk_over('haan ji', frames=100, env=self.WORDS)
        self.assertIsNotNone(ms); self.assertGreaterEqual(ms, CascadeSession.BARGE_NOD_LONG_MS - 40)


class Provider(unittest.TestCase):
    """Staging 2026-10-24: on a paced Vertex the extra speculative and warm requests queued ahead of the real one."""
    def flags(self, stack, env=None):
        sess, _, _ = make([OPEN], env=env, stack=stack, raw_env=True)
        return sess.speculate, sess.prewarm_brain, sess.prewarm_voice

    def test_paced_vertex_turns_them_off_and_unpaced_azure_keeps_them(self):
        self.assertEqual(self.flags('v2-flashlite'), (False, False, False), 'Vertex brain and voice: paced by default')
        self.assertEqual(self.flags('v2-54mini'), (False, True, False), 'Azure brain unpaced (warm); Gemini voice paced')
        self.assertEqual(self.flags('v2-mai'), (False, False, True), 'Vertex brain; Azure voice')
        self.assertEqual(self.flags('v2-flashlite', {'VP_PACED_PROVIDERS': 'none'}), (False, True, True), 'speculation is off by default')
        self.assertEqual(self.flags('v2-54mini', {'VP_SPECULATE_PARTIAL': '1'}), (True, True, False), 'on when asked, where unpaced')
        self.assertEqual(self.flags('v2-flashlite', {'VP_SPECULATE_PARTIAL': '1'}), (True, False, False), 'an explicit flag wins over pacing')
        self.assertEqual(self.flags('v2-54mini', {'VP_PACED_PROVIDERS': 'vertex,azure'}), (False, False, False))
        self.assertEqual(self.flags('v2-flashlite', {'VP_SPECULATE_PARTIAL': '1', 'VP_PREWARM': '1'}), (True, True, True), 'an explicit flag wins')

    def test_the_call_start_warm_obeys_the_flag(self):
        for env, want in (({}, 0), ({'VP_PREWARM': '1'}, 1), ({'VP_PACED_PROVIDERS': 'none'}, 1)):
            class Warm(FakeVoice):
                warms = 0
                async def warm(self): Warm.warms += 1
            async def go():
                sess, ears, comp = make([OPEN], env=env, raw_env=True); comp.voice = Warm()
                await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1); await sess.end('caller_hung_up')
            asyncio.run(go())
            self.assertEqual(Warm.warms, want, env)


class KeepRate(unittest.TestCase):
    def test_outcomes_are_counted(self):
        async def go():
            sess, ears, comp = make([OPEN, 'जी।', 'जी।', 'जी।'])
            await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
            await caller_turn(sess, ears, 'हाँ जी बोलिए', 'हाँ जी, बोलिए।'); await quiet_until(sess, lambda: sess.conv.agent_turns == 2)
            await caller_turn(sess, ears, 'हाँ जी', 'नहीं जी, अभी नहीं।'); await quiet_until(sess, lambda: sess.conv.agent_turns == 3)
            await sess.end('caller_hung_up')
            return sess.timing_summary()['speculation']
        sp = asyncio.run(go())
        self.assertEqual((sp['started'], sp['kept'], sp['discarded']), (2, 1, 1)); self.assertEqual(sp['keepRate'], 0.5)
        self.assertTrue(sp['enabled'])

    def test_a_partial_still_moving_is_not_speculated_on(self):
        async def go():
            sess, ears, comp = make([OPEN, 'जी।'], env={'VP_SPECULATE_STABLE_MS': '300'})
            await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
            await feed(sess, 25); ears['e'].on_p('हाँ जी')
            await feed(sess, 30, QUIET)                       # end of speech, but the partial changed just now
            early = sess.pending is not None and sess.pending.speculative
            await asyncio.sleep(0.35); await feed(sess, 2, QUIET)
            late = sess.pending is not None and sess.pending.speculative
            ears['e'].on_p('हाँ जी, बोलिए')                    # ends at a clause boundary: settled at once
            await sess.end('caller_hung_up')
            return early, late
        early, late = asyncio.run(go())
        self.assertFalse(early, 'not before the partial has held still for SPECULATE_STABLE_MS')
        self.assertTrue(late)


class AudioBarge(unittest.TestCase):
    """BARGE_AUDIO: she yields on the audio alone and resumes after a nod (staging partialLagMs median 858 ms)."""
    LONG = BargeIn.LONG

    def over(self, speech_frames, heard=None, heard_at=3, quiet_frames=40, env=None):
        """She is mid-opening; the caller speaks `speech_frames` x 20 ms, heard as `heard` at frame `heard_at` (counted
        from the first speech frame, so it may fall in the quiet after), then is quiet. Returns what happened."""
        async def go():
            sess, ears, comp = make([self.LONG], env=env); line = sess.line
            await sess.start()
            await wait_until(lambda: sess.active is not None and sess.active.first is not None)
            await asyncio.sleep(0.2)
            pause_ms = None; audio_at_pause = None
            for i in range(speech_frames + quiet_frames):
                if heard is not None and i == heard_at: ears['e'].on_p(heard)
                await feed(sess, 1, SPEECH if i < speech_frames else QUIET); await asyncio.sleep(0.004)
                if line.flushes and pause_ms is None: pause_ms = (i + 1) * 20; audio_at_pause = line.audio
            await asyncio.sleep(0.05)
            out = {'pause_ms': pause_ms, 'stopped': sess.barge_ins > 0, 'resumed': sess.resumes > 0,
                   'played_on': audio_at_pause is not None and line.audio > audio_at_pause, 'summary': sess.timing_summary()['barge']}
            await sess.end('caller_hung_up')
            return out
        return asyncio.run(go())

    def test_she_yields_within_barge_audio_ms_without_any_words(self):
        r = self.over(40)                                     # 0.8 s of speech, no words yet (the recogniser trails)
        self.assertIsNotNone(r['pause_ms'])
        self.assertLessEqual(r['pause_ms'], CascadeSession.BARGE_AUDIO_MS + 120, 'yields on the audio, before any word')

    def test_a_nod_pauses_her_and_she_carries_on(self):
        r = self.over(30, 'haan ji', heard_at=20)             # 0.6 s nod; its words arrive while it is still going
        self.assertIsNotNone(r['pause_ms']); self.assertTrue(r['resumed']); self.assertFalse(r['stopped'])
        self.assertTrue(r['played_on'], 'her audio continues after the nod')

    def test_a_noise_or_cough_with_no_words_pauses_and_resumes(self):
        r = self.over(15)                                     # 0.3 s, never any words
        self.assertTrue(r['resumed']); self.assertFalse(r['stopped'])

    def test_real_words_stop_her(self):
        r = self.over(40, 'ek minute ruko', heard_at=20)
        self.assertTrue(r['stopped']); self.assertFalse(r['resumed'])

    def test_long_speech_with_no_words_yet_stops_her(self):
        r = self.over(int(CascadeSession.BARGE_PAUSED_MS / 20) + 10)
        self.assertTrue(r['stopped'])

    def test_late_words_that_are_not_a_nod_stop_her_after_she_resumed(self):
        r = self.over(15, 'ruko', heard_at=15 + int(CascadeSession.RESUME_MS / 20) + 5)
        self.assertTrue(r['resumed']); self.assertTrue(r['stopped'])

    def test_heard_text_counts_only_what_played(self):
        async def go():
            sess, ears, comp = make([self.LONG]); line = sess.line
            await sess.start()
            await wait_until(lambda: sess.active is not None and sess.active.first is not None)
            await asyncio.sleep(0.2); a = sess.active
            await a.pause(); at_pause = a.played(); await asyncio.sleep(0.2)
            self.assertEqual(a.played(), at_pause, 'nothing plays while she is paused')
            await a.resume(); await asyncio.sleep(0.1)
            self.assertGreater(a.played(), at_pause)
            await sess.end('caller_hung_up')
        asyncio.run(go())


if __name__ == '__main__':
    unittest.main()
