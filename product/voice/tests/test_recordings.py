# GET /v1/recordings/{id}: a signed, short-lived link plays and seeks; anything else is refused (recordings.py).
import asyncio, json, os, tempfile, time, unittest
from aiohttp.test_utils import TestClient, TestServer
from tests.fixtures import SECRET, FakeBrain, components, sink, ticket
from vpvoice import recordings
from vpvoice.server import Runtime
from vpvoice.session import SimSession

CALL = '0b6f6e1a-1c2d-4e5f-8a9b-000000000001'
WS = '11111111-2222-4333-8444-555555555555'
OTHER_WS = '99999999-2222-4333-8444-555555555555'


class Signature(unittest.TestCase):
    def test_vector_shared_with_the_control_plane(self):
        # The same vector is asserted in product/tests/calls-recording.test.ts: both sides sign the same bytes.
        self.assertEqual(recordings.signature('test-secret', CALL, WS, 1700000600),
                         'a0c6a565e5c61a7dbb74033fe0fd5eaf771ed3008fccb9a4b434c1972d5c72b7')

    def test_check_refuses_every_malformed_or_stale_link(self):
        now = 1700000000; exp = str(now + 600); sig = recordings.signature(SECRET, CALL, WS, exp)
        recordings.check(SECRET, CALL, WS, exp, sig, now=now)
        for args, why in [((SECRET, CALL, WS, exp, sig[:-1] + ('0' if sig[-1] != '0' else '1')), 'mismatch'),
                          ((SECRET, CALL, WS, str(now - 1), recordings.signature(SECRET, CALL, WS, now - 1)), 'expired'),
                          ((SECRET, CALL, WS, str(now + 7200), recordings.signature(SECRET, CALL, WS, now + 7200)), 'too long'),
                          ((SECRET, CALL, OTHER_WS, exp, sig), 'another workspace in the link'),
                          ((SECRET, '../' + CALL, WS, exp, sig), 'path'), (('', CALL, WS, exp, sig), 'no secret'),
                          ((SECRET, CALL, WS, '1e9', sig), 'expiry not digits'), ((SECRET, CALL, WS, exp, sig.upper()), 'not lower hex')]:
            with self.assertRaises(recordings.RecordingError, msg=why): recordings.check(*args, now=now)

    def test_paths_never_leave_the_folder(self):
        with tempfile.TemporaryDirectory() as d:
            for bad in ('../etc/passwd', CALL + '/../x', '', CALL.upper() + 'x', '%2e%2e'):
                with self.assertRaises(recordings.RecordingError): recordings.paths(d, bad)
            wav, meta = recordings.paths(d, CALL)
            self.assertEqual(os.path.dirname(wav), os.path.realpath(d))


class Route(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.uri = recordings.save(self.dir.name, CALL, WS, lambda p: recordings.tone_wav(p, seconds=1.0))
        self.size = os.path.getsize(os.path.join(self.dir.name, f'{CALL}.wav'))
        self.client = TestClient(TestServer(Runtime(env={'VP_RUNTIME_SECRET': SECRET, 'VP_RECORDINGS_DIR': self.dir.name}).app()))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close(); self.dir.cleanup()

    def link(self, call=CALL, ws=WS, exp=None, secret=SECRET):
        exp = str(int(time.time()) + 600 if exp is None else exp)
        return f'/v1/recordings/{call}?ws={ws}&exp={exp}&sig={recordings.signature(secret, call, ws, exp)}'

    async def test_a_signed_link_plays_and_seeks(self):
        r = await self.client.get(self.link())
        self.assertEqual(r.status, 200)
        self.assertEqual(r.headers['Content-Type'], 'audio/wav')
        self.assertIn('no-store', r.headers['Cache-Control'])
        body = await r.read(); self.assertEqual(body[:4], b'RIFF'); self.assertEqual(len(body), self.size)
        r = await self.client.get(self.link(), headers={'Range': 'bytes=0-99'})
        self.assertEqual(r.status, 206)
        self.assertEqual(len(await r.read()), 100)
        self.assertEqual(r.headers['Content-Range'], f'bytes 0-99/{self.size}')
        r = await self.client.get(self.link(), headers={'Range': 'bytes=1000-'})
        self.assertEqual(r.status, 206); self.assertEqual(len(await r.read()), self.size - 1000)
        self.assertTrue(self.uri.startswith('file://'))

    async def test_forged_expired_and_other_workspace_links_are_403(self):
        good = self.link()
        forged = good[:-1] + ('0' if good[-1] != '0' else '1')
        self.assertEqual((await self.client.get(forged)).status, 403)
        self.assertEqual((await self.client.get(self.link(exp=int(time.time()) - 5))).status, 403, 'expired')
        self.assertEqual((await self.client.get(self.link(secret='another-secret'))).status, 403, 'signed with another key')
        r = await self.client.get(self.link(ws=OTHER_WS))
        self.assertEqual(r.status, 403, "a valid link for another workspace never opens this workspace's recording")
        self.assertEqual((await self.client.get(f'/v1/recordings/{CALL}')).status, 403, 'unsigned')
        self.assertEqual((await self.client.get(self.link(call='0b6f6e1a-1c2d-4e5f-8a9b-000000000999'))).status, 404, 'signed, but no such recording')
        self.assertEqual((await self.client.get('/v1/recordings/..%2f..%2fetc%2fpasswd?ws=x&exp=1&sig=x')).status, 403)
        self.assertIn((await self.client.get('/v1/recordings/')).status, (404, 405), 'no listing')


class SimRecording(unittest.IsolatedAsyncioTestCase):
    async def test_devsim_style_text_call_saves_a_tone_with_its_workspace(self):
        with tempfile.TemporaryDirectory() as d:
            t = ticket(); t['workspaceId'] = WS; t['agent']['recording'] = {'enabled': True, 'announce': True}
            s, p = sink(t['conversationId'])
            comp = components(brain=FakeBrain(['नमस्ते, मैं AI असिस्टेंट हूँ।', 'जी।'])); comp.sim_recording = lambda path: recordings.tone_wav(path, 0.5)
            sess = SimSession(t, comp, s, env={'VP_RECORDINGS_DIR': d}, watchdog_s=0.01)
            await sess.start(); await sess.caller_says('haan ji'); await sess.hang_up()
            ended = [e for b in p.bodies for e in json.loads(b)['events'] if e['type'] == 'call.ended'][0]
            self.assertTrue(ended['recordingUri'].endswith(f"{t['conversationId']}.wav"))
            with open(os.path.join(d, f"{t['conversationId']}.json")) as f: self.assertEqual(json.load(f)['workspaceId'], WS)

    async def test_no_recording_when_the_agent_does_not_record(self):
        with tempfile.TemporaryDirectory() as d:
            t = ticket(); t['workspaceId'] = WS; t['agent']['recording'] = {'enabled': False, 'announce': False}
            s, p = sink(t['conversationId'])
            comp = components(brain=FakeBrain(['नमस्ते, मैं AI असिस्टेंट हूँ।'])); comp.sim_recording = lambda path: recordings.tone_wav(path, 0.5)
            sess = SimSession(t, comp, s, env={'VP_RECORDINGS_DIR': d}, watchdog_s=0.01)
            await sess.start(); await sess.hang_up()
            ended = [e for b in p.bodies for e in json.loads(b)['events'] if e['type'] == 'call.ended'][0]
            self.assertNotIn('recordingUri', ended); self.assertEqual(os.listdir(d), [])


if __name__ == '__main__':
    unittest.main()
