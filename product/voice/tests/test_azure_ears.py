# Azure Speech ears with a fake Speech SDK: no Azure host is reachable (the fake records the config and replays events
# from the SDK's own threads, as the real one does). Covers partials, finals, the error path, Gate's pre-roll and that
# only gated audio is counted; build() picks AzureEars for an 'azure' ears stack (never Sarvam's).
import asyncio, os, threading, types, unittest
from vpvoice.providers.stt import AzureEars, Gate


class Signal:
    def __init__(self): self.cbs = []
    def connect(self, cb): self.cbs.append(cb)
    def fire(self, ev):
        t = threading.Thread(target=lambda: [cb(ev) for cb in self.cbs]); t.start(); t.join()   # the SDK calls back off-loop


class Future:
    def get(self): return None


def fake_sdk():
    sp = types.SimpleNamespace()
    sp.made = {}
    class SpeechConfig:
        def __init__(self, subscription, region): sp.made['config'] = self; self.subscription = subscription; self.region = region; self.props = {}
        def set_property(self, k, v): self.props[k] = v
    class Push:
        def __init__(self, stream_format): self.data = b''; self.closed = False; self.fmt = stream_format
        def write(self, b): self.data += b
        def close(self): self.closed = True
    class Recognizer:
        def __init__(self, speech_config, audio_config):
            sp.made['rec'] = self; self.recognizing = Signal(); self.recognized = Signal(); self.canceled = Signal(); self.running = False
        def start_continuous_recognition_async(self): self.running = True; return Future()
        def stop_continuous_recognition_async(self): self.running = False; return Future()
    sp.SpeechConfig = SpeechConfig; sp.SpeechRecognizer = Recognizer
    sp.PropertyId = types.SimpleNamespace(Speech_SegmentationSilenceTimeoutMs='seg')
    sp.ResultReason = types.SimpleNamespace(RecognizedSpeech='speech', NoMatch='nomatch')
    sp.CancellationReason = types.SimpleNamespace(Error='error', EndOfStream='eos')
    sp.audio = types.SimpleNamespace(PushAudioInputStream=lambda stream_format: sp.made.setdefault('stream', Push(stream_format)),
                                     AudioStreamFormat=lambda **kw: kw, AudioConfig=lambda stream: stream)
    return sp


def ev(text=None, reason='speech', cancel=None):
    return types.SimpleNamespace(result=types.SimpleNamespace(text=text, reason=reason),
                                 cancellation_details=types.SimpleNamespace(reason=cancel, error_details='auth failed (fake)'))


class AzureEarsFake(unittest.TestCase):
    def test_partials_finals_errors_and_config(self):
        async def go():
            sp = fake_sdk(); got = []
            ears = AzureEars(lambda t: got.append(('p', t)), lambda t: got.append(('f', t)), lambda e: got.append(('e', e)),
                             env={'LAB_SPEECH_KEY': 'fake-key', 'LAB_SPEECH_REGION': 'centralindia'}, sdk=sp)
            await ears.start()
            rec = sp.made['rec']; self.assertTrue(rec.running)
            ears.write(b'\x01\x00' * 320, True)
            rec.recognizing.fire(ev('haan ji bol'))
            rec.recognized.fire(ev('haan ji boliye'))
            rec.recognized.fire(ev('', reason='nomatch'))                  # no match: nothing reaches the call
            rec.canceled.fire(ev(cancel='error'))
            rec.canceled.fire(ev(cancel='eos'))                            # a normal end of stream is not an error
            await asyncio.sleep(0.05)
            await ears.close()
            return sp, ears, got
        sp, ears, got = asyncio.run(go())
        c = sp.made['config']
        self.assertEqual((c.subscription, c.region, c.speech_recognition_language, c.props['seg']), ('fake-key', 'centralindia', 'hi-IN', '500'))
        self.assertEqual(sp.made['stream'].fmt, {'samples_per_second': 16000, 'bits_per_sample': 16, 'channels': 1})
        self.assertEqual(got, [('p', 'haan ji bol'), ('f', 'haan ji boliye'), ('e', 'auth failed (fake)')])
        self.assertAlmostEqual(ears.audio_s, 0.02)
        self.assertTrue(sp.made['stream'].closed); self.assertFalse(sp.made['rec'].running)

    def test_through_the_gate_only_speech_is_sent_and_metered(self):
        async def go():
            sp = fake_sdk()
            g = Gate(AzureEars(lambda t: None, lambda t: None, lambda e: None, env={}, sdk=sp), tail_ms=40)
            await g.start()
            quiet, speech = b'\x00\x00' * 320, b'\x05\x00' * 320
            for _ in range(20): g.write(quiet, False)                       # 400 ms of quiet: only the 200 ms pre-roll is kept
            for _ in range(5): g.write(speech, True)
            for _ in range(10): g.write(quiet, False)                       # tail of 2 frames, then closed
            await g.close()
            return sp, g
        sp, g = asyncio.run(go())
        self.assertAlmostEqual(g.audio_s, (10 + 5 + 2) * 0.02)
        self.assertEqual(sp.made['config'].region, 'centralindia', 'Central India by default')

    def test_build_picks_azure_ears_for_an_azure_stack(self):
        import json, tempfile
        from vpvoice.providers import build, google
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump({'project_id': 'fictional-project', 'client_email': 'x@fictional.test', 'private_key': 'not-a-key'}, f)
        try:
            env = {'LAB_SPEECH_KEY': 'k', 'VERTEX_SA_FILE': f.name, 'VP_REGION': 'centralindia'}
            for sid, voice in (('v2-flashlite', 'Despina'), ('v2-mai', 'hi-IN-Kavya:MAI-Voice-2.1-Flash')):
                ears = build(sid, voice, None, env).make_ears(None, None, None)
                self.assertEqual((type(ears).__name__, type(ears.inner).__name__), ('Gate', 'AzureEars'), sid)
            ears = build('sarvam-india', 'ishita_enhi_customer_expressive', None, {'SARVAM_API_KEY': 'k'}).make_ears(None, None, None)
            self.assertEqual(type(ears.inner).__name__, 'SarvamEars')
        finally:
            os.unlink(f.name); google._VERTEX.clear()

if __name__ == '__main__':
    unittest.main()
