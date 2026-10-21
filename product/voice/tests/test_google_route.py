# Gemini on Vertex only (decision.2026-10-21.gemini-vertex-only), and only from India (appeal commitment). No network:
# the token is faked, the Live websocket is a local fake Vertex server, and text calls hit a fake http object. Nothing
# here can reach a Google host: GoogleRoute.live_url / host are pointed at 127.0.0.1 before anything connects.
import asyncio, base64, json, os, tempfile, unittest
from unittest import mock
from aiohttp import WSMsgType, web
from aiohttp.test_utils import TestServer
from vpvoice import stacks
from vpvoice.providers import ProviderUnavailable, build, google
from vpvoice.providers.stt import GeminiEars
from vpvoice import s2s, catalog

PROJECT = 'fictional-project'


class Base(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.sa = os.path.join(self.d.name, 'sa.json')
        with open(self.sa, 'w') as f: json.dump({'project_id': PROJECT, 'client_email': 'x@fictional.test', 'private_key': 'not-a-key'}, f)
        google._REFUSED.clear(); google._VERTEX.clear()
        p = mock.patch.object(google.VertexToken, 'get', new=mock.AsyncMock(return_value='tok-fake')); p.start(); self.addCleanup(p.stop)

    def tearDown(self): self.d.cleanup()

    def env(self, **kw): return {'VERTEX_SA_FILE': self.sa, 'VP_REGION': 'centralindia', 'VERTEX_LIVE_LOCATION': 'us-central1', **kw}


class IndiaOnly(Base):
    def test_india_regions_have_a_route(self):
        for region in ('centralindia', 'CentralIndia', 'asia-south1', ' india '):
            self.assertTrue(google.GoogleRoute(self.env(VP_REGION=region)).usable, region)

    def test_outside_india_there_is_no_route_and_one_reason_per_cause(self):
        with self.assertLogs('vp.voice.google', 'WARNING') as logs:
            for region in (None, '', 'eastus', 'westeurope', 'us-central1'):
                env = self.env(); env.pop('VP_REGION')
                if region is not None: env['VP_REGION'] = region
                r = google.GoogleRoute(env)
                self.assertFalse(r.usable, region)
                self.assertEqual(google.unavailable('v2-flashlite', r), google.NO_ROUTE)
            google.GoogleRoute(self.env(VP_REGION='eastus'))                      # the same reason is logged once
        self.assertEqual(len(logs.output), 4)
        self.assertTrue(all('not an Indian region' in m for m in logs.output))

    def test_vertex_off_still_wins_in_india(self):
        self.assertFalse(google.GoogleRoute(self.env(VERTEX_OFF='1')).usable)


class NotRerouted(Base):
    def test_a_gemini_api_key_or_openrouter_never_stands_in(self):
        other = {'GEMINI_PAID_KEY': 'k', 'OPENROUTER_API_KEY': 'k'}
        self.assertEqual(stacks.missing_credentials('v2-flashlite', other), ['GEMINI'])
        with self.assertRaises(ProviderUnavailable) as e: build('v2-flashlite', 'Despina', None, {**other, 'VERTEX_SA_FILE': self.sa, 'VP_REGION': 'eastus'})
        self.assertEqual(e.exception.reason, google.NO_ROUTE)

    def test_live_without_a_location_makes_ears_and_s2s_unavailable(self):
        env = self.env(); env.pop('VERTEX_LIVE_LOCATION')
        r = google.GoogleRoute(env)
        self.assertEqual(google.unavailable('v2-flashlite', r), google.NOT_OFFERED['ears'])
        self.assertEqual(google.unavailable('v2-live', r), google.NOT_OFFERED['s2s'])
        self.assertIsNone(google.unavailable('sarvam-india', r), 'a stack with no Google part does not care')

    def test_a_model_vertex_does_not_offer_names_its_component(self):
        r = google.GoogleRoute(self.env(VERTEX_MODEL_MAP=json.dumps({'gemini-3.8-flash-lite-tts': None})))
        self.assertEqual(google.unavailable('v2-flashlite', r), "This voice isn't offered on our Google Cloud route yet")
        self.assertIsNone(google.unavailable('v2-mai', r), 'the Azure voice stack still runs')
        with self.assertRaises(ProviderUnavailable) as e: build('v2-flashlite', 'Despina', None, self.env(VERTEX_MODEL_MAP=json.dumps({'gemini-3.8-flash-lite-tts': None})))
        self.assertEqual(str(e.exception), google.NOT_OFFERED['voice'])

    def test_every_gemini_stack_runs_when_vertex_offers_it(self):
        r = google.GoogleRoute(self.env())
        for sid in stacks.STACKS: self.assertIsNone(google.unavailable(sid, r), sid)

    def test_model_map_renames(self):
        r = google.GoogleRoute(self.env(VERTEX_MODEL_MAP=json.dumps({'gemini-3.8-live': 'gemini-3.8-live-001'})))
        self.assertEqual(r.resource('gemini-3.8-live'), f'projects/{PROJECT}/locations/us-central1/publishers/google/models/gemini-3.8-live-001')
        self.assertEqual(r.resource('gemini-3.5-flash-lite'), f'projects/{PROJECT}/locations/global/publishers/google/models/gemini-3.5-flash-lite')


class FakeHttp:
    def __init__(self): self.posts = []
    async def post(self, url, headers=None, json=None, **kw):
        self.posts.append((url, headers, json))
        class R:
            status = 200
            def release(self): pass
        return R()


class TextRoute(Base):
    def test_stream_goes_to_vertex_with_the_bearer_token(self):
        r = google.GoogleRoute(self.env(VERTEX_LOCATION='asia-south1')); http = FakeHttp()
        asyncio.run(r.stream(http, 'gemini-3.5-flash-lite', {'contents': [{'parts': [{'text': 'hi'}]}]}, {}))
        url, hdr, body = http.posts[0]
        self.assertEqual(url, f'https://asia-south1-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/asia-south1/publishers/google/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse')
        self.assertEqual(hdr, {'Authorization': 'Bearer tok-fake'})

    def test_a_model_not_offered_is_never_sent(self):
        r = google.GoogleRoute(self.env()); http = FakeHttp(); timing = {}
        self.assertIsNone(asyncio.run(r.stream(http, 'gemini-3.1-flash-lite', {'contents': []}, timing)))
        self.assertEqual(http.posts, []); self.assertIn('not offered on Vertex', timing['err'])


class FakeVertexLive:
    """A local stand-in for the Vertex Live websocket: records the upgrade headers, the path and every message."""
    def __init__(self): self.headers = None; self.path = None; self.msgs = []

    async def handler(self, req):
        self.headers = dict(req.headers); self.path = req.path
        ws = web.WebSocketResponse(); await ws.prepare(req)
        async for m in ws:
            if m.type != WSMsgType.TEXT: continue
            d = json.loads(m.data); self.msgs.append(d)
            if 'setup' in d: await ws.send_bytes(json.dumps({'setupComplete': {}}).encode())       # Vertex sends JSON in binary frames
            elif 'mediaChunks' in (d.get('realtimeInput') or {}):
                await ws.send_bytes(json.dumps({'serverContent': {'inputTranscription': {'text': 'haan ji'}}}).encode())
        return ws

    async def __aenter__(self):
        app = web.Application(); app.router.add_get(google.LIVE_PATH, self.handler)
        self.server = TestServer(app); await self.server.start_server()
        return self

    async def __aexit__(self, *a): await self.server.close()

    def url(self): return f'ws://127.0.0.1:{self.server.port}{google.LIVE_PATH}'


class LiveRoute(Base):
    def test_live_url_is_regional_vertex(self):
        self.assertEqual(google.GoogleRoute(self.env()).live_url(),
                         'wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent')

    def test_ears_setup_token_and_audio_against_a_fake_vertex(self):
        async def go():
            import aiohttp
            async with FakeVertexLive() as fake, aiohttp.ClientSession() as http:
                r = google.GoogleRoute(self.env()); r.live_url = fake.url
                finals = []
                ears = GeminiEars(http, r, lambda t: None, finals.append, lambda e: finals.append(('error', e)))
                await ears.start()
                ears.write(b'\x01\x00' * 640, True)
                for _ in range(100):
                    if finals: break
                    await asyncio.sleep(0.01)
                await ears.close()
                return fake, finals
        fake, finals = asyncio.run(go())
        self.assertEqual(fake.path, google.LIVE_PATH)
        self.assertEqual(fake.headers.get('Authorization'), 'Bearer tok-fake')
        self.assertNotIn('x-goog-api-key', {k.lower() for k in fake.headers})
        setup = fake.msgs[0]['setup']
        self.assertEqual(setup['model'], f'projects/{PROJECT}/locations/us-central1/publishers/google/models/gemini-3.5-transcribe-live-preview')
        self.assertEqual(setup['generationConfig'], {'responseModalities': ['TEXT']})
        self.assertIn('inputAudioTranscription', setup)
        chunk = fake.msgs[1]['realtimeInput']['mediaChunks'][0]
        self.assertEqual((chunk['mimeType'], len(base64.b64decode(chunk['data']))), ('audio/pcm;rate=16000', 1280))
        self.assertEqual(finals, ['haan ji'])

    def test_speech_to_speech_setup_shape(self):
        r = google.GoogleRoute(self.env()); spec = catalog.S2S['gemini-3.8-live']
        m = s2s.setup_msg(spec, 'Despina', 'brief text', model=r.resource(spec['model']))['setup']
        self.assertEqual(m['model'], f'projects/{PROJECT}/locations/us-central1/publishers/google/models/gemini-3.8-live')
        self.assertEqual(m['generationConfig']['speechConfig']['voiceConfig']['prebuiltVoiceConfig']['voiceName'], 'Despina')
        self.assertEqual(m['generationConfig']['responseModalities'], ['AUDIO'])
        self.assertEqual((m['inputAudioTranscription'], m['outputAudioTranscription']), ({}, {}))
        self.assertEqual(m['systemInstruction'], {'parts': [{'text': 'brief text'}]})
        self.assertEqual(m['tools'][0]['functionDeclarations'][0]['name'], 'end_call')

    def test_audio_field_is_configurable(self):
        r = google.GoogleRoute(self.env(VERTEX_LIVE_AUDIO='audio'))
        self.assertEqual(r.audio_chunk('QQ=='), {'realtimeInput': {'audio': {'data': 'QQ==', 'mimeType': 'audio/pcm;rate=16000'}}})


if __name__ == '__main__':
    unittest.main()
