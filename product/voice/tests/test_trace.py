# The per-call trace (vpvoice/trace.py) on call.ended: turn by turn timing, ASR confidence, TTS, door verdicts, barge-ins,
# and never a word of the call. Synthetic data only.
import asyncio, json, unittest
from tests.test_cascade import QUIET, evs, feed, make, wait_until
from tests.test_sim import call, of, run
from vpvoice.trace import MAX_EVENTS, MAX_TURNS, Trace


class TraceShape(unittest.TestCase):
    def test_extras_join_their_turn_and_bounds_are_counted(self):
        t = Trace()
        t.note(1, gapMs=420, tts={'provider': 'azure', 'voice': 'v', 'style': None}); t.note(1, door={'rule': 'RD1', 'action': 'replaced'})
        t.caller(0, 0, 900, 0.91, 120); t.agent(1, rid=1, start_ms=1320)
        self.assertEqual(t.turns, [{'i': 0, 'speaker': 'caller', 'startMs': 0, 'endMs': 900, 'asrConfidence': 0.91, 'partialLagMs': 120},
                                   {'i': 1, 'speaker': 'agent', 'rid': 1, 'startMs': 1320, 'interrupted': False,
                                    'door': [{'rule': 'RD1', 'action': 'replaced'}], 'gapMs': 420, 'tts': {'provider': 'azure', 'voice': 'v', 'style': None}}])
        self.assertEqual(t.pending, {}, 'committed extras are released')
        for i in range(MAX_TURNS + 3): t.caller(i)
        for i in range(MAX_EVENTS + 2): t.event(i, 'judge')
        j = t.to_json({'stackId': 's', 'combinationId': 'c', 'components': {'stt': 'azure', 'tts': None}})
        self.assertEqual((len(j['turns']), len(j['events']), j['dropped']), (MAX_TURNS, MAX_EVENTS, {'turns': 5, 'events': 2}))
        self.assertEqual((j['schema'], j['stack'], j['components']), (1, {'id': 's', 'combinationId': 'c'}, {'stt': 'azure'}))


class TraceOnCalls(unittest.TestCase):
    def test_sim_call_carries_a_wordless_trace(self):
        script = ['नमस्ते, Suraksha की AI असिस्टेंट Riya बोल रही हूँ।', 'जी, renewal 2 November को है।', 'शुक्रिया, bye! <end_call>']
        sess, p, _ = run(call(script, ['हाँ जी, बोलिए', 'ठीक है']))
        end = of(p, 'call.ended')[0]; tr = end['trace']
        self.assertEqual(tr['schema'], 1)
        self.assertEqual(tr['stack'], {'id': end['manifest']['stackId'], 'combinationId': end['manifest']['combinationId']})
        self.assertEqual([r['speaker'] for r in tr['turns']], [x['speaker'] for x in end['transcript']])
        self.assertEqual([r['i'] for r in tr['turns']], list(range(len(end['transcript']))))
        blob = json.dumps(tr, ensure_ascii=False)
        for line in end['transcript']: self.assertNotIn(line['text'], blob, 'the trace never copies the words')

    def test_cascade_trace_has_gap_tts_and_asr(self):
        script = ['नमस्ते, Suraksha की AI असिस्टेंट Riya बोल रही हूँ।', 'जी, renewal 2 November को है।', 'शुक्रिया, bye! <end_call>']
        async def go():
            sess, p, line, ears, comp = make(script)
            await sess.start()
            await wait_until(lambda: sess.conv.agent_turns == 1)
            await feed(sess, 25); ears['e'].on_f('हाँ जी, बोलिए'); await feed(sess, 80, QUIET)
            await wait_until(lambda: sess.conv.agent_turns == 2)
            await feed(sess, 25); ears['e'].on_f('ठीक है'); await feed(sess, 80, QUIET)
            await asyncio.wait_for(sess.done.wait(), 8)
            return p
        p = asyncio.run(go())
        tr = [x for x in evs(p) if x['type'] == 'call.ended'][0]['trace']
        agent = [r for r in tr['turns'] if r['speaker'] == 'agent']; caller = [r for r in tr['turns'] if r['speaker'] == 'caller']
        self.assertEqual(agent[0]['tts']['provider'], 'gemini-lite')
        self.assertTrue(all(isinstance(r.get('gapMs'), int) and r['gapMs'] >= 0 for r in agent[1:]), agent)
        self.assertTrue(all(abs(r['firstAudioMs'] - r['callerEndMs'] - r['gapMs']) <= 2 for r in agent[1:]), agent)   # ms truncation
        self.assertTrue(all('endMs' in r for r in caller))
        self.assertTrue(all(isinstance(r['door'], list) and r['interrupted'] is False for r in agent))


if __name__ == '__main__':
    unittest.main()
