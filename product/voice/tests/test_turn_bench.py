# The turn-taking bench's own logic (scoring, labels, CIs) on synthetic timelines, and the hold rule it tunes. No audio.
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'bench'))
import turn_bench as tb
from tests.test_cascade import make


def clip(speech, text='नमस्ते, मैं प्रिया बोल रही हूँ। आपने form भरा था। अभी बात कर सकते हैं?'):
    return {'id': 'x', 'split': 'dev', 'pcm': b'\x00\x00' * 16000 * 15, 'dur': 15, 'speech': speech, 'text': text}


class Line(tb.Line):
    def __init__(self, segs, flushes=()): super().__init__(lambda: 0); self.segs = [list(s) for s in segs]; self.flushes = list(flushes)


class Scoring(unittest.TestCase):
    C = clip([[0.0, 2.0], [3.0, 5.0], [6.0, 8.0]])

    def test_a_reply_after_the_last_speech_is_on_time(self):
        r = tb.score({'kind': 'turn', 'id': 'x', 'start': 100.0, 'clip': self.C, 'line': Line([[108.9, 111.0, 2]]), 'burst': None})
        self.assertEqual((r['premature'], r['talk_over'], r['no_reply'], r['eot_ms']), (False, False, False, 900))

    def test_a_reply_in_a_mid_thought_pause_is_a_cut_in_and_talks_over(self):
        r = tb.score({'kind': 'turn', 'id': 'x', 'start': 100.0, 'clip': self.C, 'line': Line([[105.5, 107.0, 2]]), 'burst': None})
        self.assertTrue(r['premature']); self.assertEqual(r['cut_pauses'], 1); self.assertTrue(r['talk_over']); self.assertIsNone(r['eot_ms'])

    def test_barge_in_and_backchannel(self):
        b = tb.score({'kind': 'barge', 'id': 'x', 'start': 100.0, 'clip': self.C, 'line': Line([], [100.7]), 'burst': None})
        self.assertEqual((b['missed'], b['barge_ms']), (False, 700))
        m = tb.score({'kind': 'barge', 'id': 'x', 'start': 100.0, 'clip': self.C, 'line': Line([], [101.9]), 'burst': None})
        self.assertTrue(m['missed'])
        f = tb.score({'kind': 'backchannel', 'id': 'x', 'start': 100.0, 'clip': self.C, 'line': Line([], [100.4]), 'burst': (b'', 'haan')})
        self.assertEqual((f['what'], f['false_barge']), ('haan', True))

    def test_a_pause_she_resumes_from_is_not_a_stop(self):
        # backchannel: she yields at 100.3 and carries on at 100.9: paused, not a false stop, a 600 ms gap
        f = tb.score({'kind': 'backchannel', 'id': 'x', 'start': 100.0, 'clip': self.C, 'line': Line([[99.0, 100.3, 1], [100.9, 103.0, 1]], [100.3]),
                      'burst': (b'', 'haan ji')})
        self.assertEqual((f['what'], f['paused'], f['false_barge'], f['resume_gap_ms']), ('nod500', True, False, 600))
        # a real interruption she resumes over while they still talk (speech to 108.0) is missed
        b = tb.score({'kind': 'barge', 'id': 'x', 'start': 100.0, 'clip': self.C, 'line': Line([[99.0, 100.25, 1], [101.0, 104.0, 1]], [100.25]),
                      'burst': None})
        self.assertEqual((b['barge_ms'], b['resumed_over'], b['missed']), (250, True, True))

    def test_labels_and_stats(self):
        self.assertEqual(tb.pauses(self.C), [(2.0, 3.0), (5.0, 6.0)])
        self.assertEqual(tb.words_until(self.C, 2.0, at_pause=True)[-1], 'हूँ।', 'a final at a pause snaps to punctuation')
        sc = tb.statement_cut(self.C)
        self.assertEqual((sc['speech'][-1][1], sc['text'].split()[-1]), (5.0, 'था।'), 'cut at the last pause after a full stop')
        self.assertEqual(tb.wilson(0, 47), [0.0, 0.076]); self.assertEqual(tb.wilson(47, 47)[1], 1.0)


class HoldRule(unittest.TestCase):
    def test_hold_by_how_the_words_end(self):
        s = make([''])[0]
        self.assertEqual(s.hold_ms('अभी बात कर सकते हैं?'), s.HOLD_MS)
        self.assertEqual(s.hold_ms('आपने form भरा था।'), s.STATEMENT_HOLD_MS)
        self.assertEqual(s.hold_ms('मैं सोच रहा था कि'), s.LONG_HOLD_MS)
        self.assertEqual(s.hold_ms('नमस्ते, मैं प्रिया,'), s.LONG_HOLD_MS)


if __name__ == '__main__':
    unittest.main()
