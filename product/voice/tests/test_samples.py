# The stack voice-sample renderer, offline on devsim's fake voice: no network, no keys. Real renders run on the VM.
import asyncio, datetime, json, os, shutil, subprocess, tempfile, unittest
from vpvoice import names, safety, samples, stacks

HAVE_FFMPEG = shutil.which('ffmpeg') is not None


@unittest.skipUnless(HAVE_FFMPEG, 'ffmpeg not installed')
class Render(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(); self.out = os.path.join(self.root, 'samples')
    def tearDown(self): shutil.rmtree(self.root)

    def render(self, ids=None):
        when = datetime.datetime(2026, 10, 24, 1, 0, tzinfo=datetime.timezone.utc)
        return asyncio.run(samples.run(self.out, ids or samples.curated(), samples.Fake(), now=when))

    def test_one_entry_per_curated_stack_shaped_for_web(self):
        manifest, errors = self.render()
        self.assertEqual(errors, {})
        self.assertEqual(set(manifest), set(samples.curated()))
        self.assertIn('v2-live', manifest, 's2s gets a sample too')
        for sid, e in manifest.items():
            self.assertEqual(set(e) - {'spokenText'}, {'file', 'sources', 'durationS', 'text', 'recordedAt', 'combinationId', 'voice', 'tts'})
            self.assertEqual([x['type'] for x in e['sources']], ['audio/ogg; codecs=opus', 'audio/mpeg'], 'Opus first, MP3 for Safari')
            self.assertEqual(e['sources'][0]['file'], e['file'])
            for x in e['sources']: self.assertTrue(os.path.isfile(os.path.join(self.out, x['file'])), x)
            self.assertTrue(os.path.isfile(os.path.join(self.out, e['file'])), sid)
            self.assertGreater(e['durationS'], 0); self.assertLessEqual(e['durationS'], samples.MAX_S)
            self.assertEqual(e['recordedAt'], '2026-10-24T01:00:00Z'); self.assertEqual(e['text'], samples.TEXT)
            self.assertEqual(e['combinationId'], stacks.combination_id(stacks.spec(sid), stacks.voices(stacks.spec(sid))[1]))
        self.assertEqual(json.load(open(os.path.join(self.out, 'manifest.json'), encoding='utf-8')), manifest)
        # stacks that share a voice share one clip (one provider request, not one per stack)
        self.assertEqual(manifest['v2-flashlite']['file'], manifest['v2-54mini']['file'])
        self.assertNotEqual(manifest['v2-flashlite']['file'], manifest['v2-mai']['file'])
        self.assertEqual(sorted(os.listdir(self.out)), sorted({x['file'] for e in manifest.values() for x in e['sources']} | {'manifest.json'}))

    def test_files_are_opus_and_loudness_normalised(self):
        manifest, _ = self.render(['v2-flashlite'])
        f = os.path.join(self.out, manifest['v2-flashlite']['file'])
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,channels', '-of', 'json', f], capture_output=True, text=True)
        st = json.loads(probe.stdout)['streams'][0]
        self.assertEqual((st['codec_name'], st['channels']), ('opus', 1))
        mp3 = os.path.join(self.out, manifest['v2-flashlite']['sources'][1]['file'])
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,channels', '-of', 'json', mp3], capture_output=True, text=True)
        self.assertEqual(json.loads(probe.stdout)['streams'][0]['codec_name'], 'mp3')
        meas = subprocess.run(['ffmpeg', '-hide_banner', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
        lufs = float(meas.rsplit('I:', 1)[1].split('LUFS')[0])
        self.assertAlmostEqual(lufs, -16, delta=2.5)

    def test_a_subset_keeps_the_other_entries(self):
        self.render(['v2-flashlite', 'v2-mai'])
        manifest, _ = self.render(['v2-mai'])
        self.assertEqual(set(manifest), {'v2-flashlite', 'v2-mai'})

    def test_a_failing_voice_is_reported_and_left_out(self):
        class Broken(samples.Fake):
            async def render(self, s, v):
                if s['id'] == 'v2-mai': raise RuntimeError('Azure Speech is not set up on this server')
                return await super().render(s, v)
        manifest, errors = asyncio.run(samples.run(self.out, ['v2-flashlite', 'v2-mai'], Broken()))
        self.assertEqual(set(manifest), {'v2-flashlite'}); self.assertIn('v2-mai', errors)

    def test_real_adapters_without_keys_say_why_and_call_nothing(self):
        manifest, errors = asyncio.run(samples.run(self.out, ['v2-flashlite', 'v2-mai', 'v2-live'], samples.Real(None, {})))
        self.assertEqual(manifest, {})
        self.assertEqual(set(errors), {'v2-flashlite', 'v2-mai', 'v2-live'})
        self.assertIn('Azure Speech', errors['v2-mai'])

    def test_too_long_is_refused(self):
        class Long(samples.Fake):
            async def render(self, s, v): return b'\x00\x10' * int(samples.RATE * 13), None
        manifest, errors = asyncio.run(samples.run(self.out, ['v2-flashlite'], Long()))
        self.assertEqual(manifest, {}); self.assertIn('over 12', errors['v2-flashlite'])

    def test_cli_devsim(self):
        env = {'VP_DEVSIM': '1'}
        self.assertEqual(samples.main(['--out', self.out, '--devsim', '--stack', 'v2-flashlite'], env=env), 0)
        self.assertEqual(set(json.load(open(os.path.join(self.out, 'manifest.json')))), {'v2-flashlite'})


class LiveReading(unittest.TestCase):
    """The first VM render had the whole line in the v2-live audio and spokenText "": the transcription came late."""
    def test_the_transcription_after_turn_complete_is_kept(self):
        import base64
        msgs = [{'serverContent': {'modelTurn': {'parts': [{'inlineData': {'data': base64.b64encode(b'\x01\x00' * 100).decode()}}]}}},
                {'serverContent': {'outputTranscription': {'text': 'नमस्ते आशा जी। '}}},
                {'serverContent': {'turnComplete': True}},
                {'serverContent': {'outputTranscription': {'text': 'मैं एक AI असिस्टेंट हूँ।'}}}]
        class WS:
            def __init__(self): self.q = list(msgs)
            async def receive(self, timeout=None):
                if not self.q: await asyncio.sleep(min(timeout, 0.05)); raise asyncio.TimeoutError
                return json.dumps(self.q.pop(0))
        pcm, said = asyncio.run(samples.read_live(WS(), lambda m: m))
        self.assertEqual(len(pcm), 200); self.assertEqual(said, 'नमस्ते आशा जी। मैं एक AI असिस्टेंट हूँ।')


class Rules(unittest.TestCase):
    def test_the_line(self):
        self.assertTrue(safety.affirms_ai(samples.TEXT), 'the AI disclosure is in it')
        self.assertEqual(names.repair(samples.TEXT, 'Asha'), (samples.TEXT, []), 'it calls the person Asha')
        self.assertNotIn('Suraksha', samples.TEXT)

    def test_refuses_production_and_unknown_stacks(self):
        out = tempfile.mkdtemp()
        try:
            for env in ({'NODE_ENV': 'production'}, {'VP_ENV': 'production', 'VP_DEVSIM': '1'}):
                self.assertEqual(samples.main(['--out', out, '--devsim'], env=env), 2)
            self.assertEqual(samples.main(['--out', out, '--devsim'], env={}), 2, '--devsim needs VP_DEVSIM=1')
            self.assertEqual(samples.main(['--out', out, '--devsim', '--stack', 'custom'], env={'VP_DEVSIM': '1'}), 2)
            self.assertEqual(os.listdir(out), [], 'nothing written')
        finally:
            shutil.rmtree(out)

    def test_never_writes_outside_out(self):
        out = tempfile.mkdtemp()
        try:
            for bad in ('../x.ogg', '/etc/x', 'a/../../x', 'sub/x.ogg'):
                with self.assertRaises(ValueError): samples.inside(out, bad)
            self.assertEqual(samples.inside(out, 'gemini-lite-Despina.ogg'), os.path.join(os.path.realpath(out), 'gemini-lite-Despina.ogg'))
            self.assertEqual(samples.safe_name('azure-mai-hi-IN-Kavya:MAI-Voice-2.1-Flash'), 'azure-mai-hi-IN-Kavya_MAI-Voice-2.1-Flash')
        finally:
            shutil.rmtree(out)


if __name__ == '__main__':
    unittest.main()
