# Run (from a clean checkout, no network, no keys):
#   cd voicelab/server && python3 -m unittest discover -s ../tests -p 'test_vertex*.py' -v
# Gemini on Vertex only (decision.2026-10-21.gemini-vertex-only), and only from India. Nothing here reaches a provider:
# the token is faked, text calls hit a fake http object, and the Live websocket is a local fake Vertex on 127.0.0.1
# (providers.vertex_live_url is pointed at it before anything connects).
import asyncio, base64, json, os, sys, tempfile, types, unittest
from unittest import mock
SERVER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'server')
sys.path.insert(0, SERVER)
try: import onnxruntime  # noqa: F401  (the VAD's runtime; not needed to test routing)
except ImportError: sys.modules['onnxruntime'] = types.ModuleType('onnxruntime')
os.environ.setdefault('LAB_DATA', tempfile.mkdtemp(prefix='vl-test-'))     # app.py makes its data dirs at import
from aiohttp import WSMsgType, web
from aiohttp.test_utils import TestServer
import providers as pv
import catalog, calls, app

PROJECT = 'fictional-project'
def read(*parts):
    with open(os.path.join(SERVER, *parts)) as f: return f.read()
P = {p['id']: p for p in catalog.PRESETS}


class Base(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ, {'VP_REGION': 'centralindia'}); env.start(); self.addCleanup(env.stop)
        for k in ('VERTEX_OFF', 'LAB_TEST_503'): os.environ.pop(k, None)
        for name, val in (('VERTEX_PROJECT', PROJECT), ('VERTEX_LOCATION', 'global'), ('VERTEX_LIVE_LOCATION', 'us-central1'),
                          ('VERTEX_LIVE_AUDIO', 'mediaChunks'), ('VERTEX_MAP', pv.model_map(None)), ('VERTEX_LAST_DAY', '2999-12-31'),
                          ('VERTEX_CAP_USD', 100.0)):
            p = mock.patch.object(pv, name, val); p.start(); self.addCleanup(p.stop)
        for name, val in (('sa', {'project_id': PROJECT, 'client_email': 'x@fictional.test'}), ('spent', 0.0), ('blocked_until', 0.0),
                          ('ledger', None), ('token', mock.AsyncMock(return_value='tok-fake'))):
            p = mock.patch.object(pv.VERTEX, name, val); p.start(); self.addCleanup(p.stop)
        pv._T503.clear()


class FakeHttp:
    """Records every POST; answers with one status. Anything that is not a POST would fail loudly."""
    def __init__(self, status=200): self.posts = []; self.status = status
    async def post(self, url, headers=None, json=None, **kw):
        self.posts.append((url, headers, json)); st = self.status
        class R:
            status = st; content = []
            def release(self): pass
            async def text(self): return 'refused'
        return R()


class IndiaOnly(Base):
    def test_indian_regions_have_a_route(self):
        for region in ('centralindia', 'CentralIndia', 'asia-south1', ' india '):
            os.environ['VP_REGION'] = region
            self.assertTrue(pv.VERTEX.usable(), region)

    def test_outside_india_nothing_goes_to_vertex(self):
        for region in (None, '', 'eastus', 'westeurope', 'us-central1'):
            os.environ.pop('VP_REGION', None)
            if region is not None: os.environ['VP_REGION'] = region
            self.assertFalse(pv.VERTEX.usable(), region)
            self.assertIn('only from India', pv.unavailable(P['v2-flashlite']))
            http = FakeHttp(); timing = {}
            self.assertIsNone(asyncio.run(pv.vertex_post(http, 'gemini-3.5-flash-lite', {'contents': []}, timing)))
            self.assertEqual(http.posts, []); self.assertIn('only from India', timing['err'])
            with self.assertRaises(RuntimeError): asyncio.run(pv.vertex_live(http, 'gemini-3.5-transcribe-live'))

    def test_off_breaker_and_cap_still_hold(self):
        os.environ['VERTEX_OFF'] = '1'; self.assertIn('switched off', pv.VERTEX.why()); del os.environ['VERTEX_OFF']
        http = FakeHttp(403); timing = {}
        self.assertIsNone(asyncio.run(pv.vertex_post(http, 'gemini-3.5-flash-lite', {'contents': []}, timing)))
        self.assertIn('refused the lab', pv.VERTEX.why()); pv.VERTEX.blocked_until = 0.0
        pv.VERTEX.spent = 100.0; self.assertIn('cap', pv.VERTEX.why())


class NoApiKeyPath(unittest.TestCase):
    def test_sources_have_no_gemini_api_key_route(self):
        for f in ('providers.py', 'calls.py', 'app.py', 'catalog.py'):
            src = read(f)
            for bad in ('generativelanguage.googleapis.com', 'x-goog-api-key', 'GEMINI_TEST_KEY', 'GEMINI_PAID_KEY', 'GKEYS', 'or_tts'):
                self.assertNotIn(bad, src, f'{bad} in {f}')
        for gone in ('GEM', 'GEM_WS', 'GKEYS', 'GeminiKeys', 'gemini_post', 'or_tts'):
            self.assertFalse(hasattr(pv, gone), gone)


class Catalog(unittest.TestCase):
    def test_openrouter_gemini_is_retired(self):
        for b in ('gemini-3.5-flash-lite@or', 'gemini-3.6-flash@or', 'gemini-3.8-flash@or'): self.assertNotIn(b, catalog.BRAINS)
        for t in ('gemini-lite-or', 'gemini-or'): self.assertNotIn(t, catalog.TTS)
        self.assertNotIn('v2-flashlite-or', P)
        self.assertFalse([k for k, v in catalog.BRAINS.items() if v['host'] == 'or' and 'gemini' in v['model']])
        self.assertFalse([k for k, v in catalog.TTS.items() if v['kind'] == 'or_tts'])
        self.assertIn('gpt-6-luna@or', catalog.BRAINS, 'non-Gemini OpenRouter brains stay')

    def test_nothing_points_at_a_removed_id(self):
        for p in catalog.PRESETS:
            if p.get('s2s'): self.assertIn(p['s2s'], catalog.S2S); continue
            self.assertIn(p['stt'], catalog.STT); self.assertIn(p['brain'], catalog.BRAINS); self.assertIn(p['tts'], catalog.TTS)
        for a, b in calls.BRAIN_FALLBACK.items():
            self.assertIn(a, catalog.BRAINS); self.assertIn(b, catalog.BRAINS)
            self.assertNotEqual(catalog.BRAINS[b]['host'], 'gm')
        web = read('..', 'web', 'app.js')
        for gone in ('gemini-lite-or', 'gemini-or', 'flashlite-or', '@or'): self.assertNotIn(gone, web)


class NotRerouted(Base):
    def test_live_without_a_location_makes_ears_and_s2s_unavailable(self):
        pv.VERTEX_LIVE_LOCATION = ''
        self.assertEqual(pv.unavailable(P['v2-flashlite']), pv.NOT_OFFERED['ears'])
        self.assertEqual(pv.unavailable(P['v2-live']), pv.NOT_OFFERED['s2s'])
        self.assertIsNone(pv.unavailable(P['sarvam-india']), 'a stack with no Google part does not care')
        self.assertIsNone(pv.unavailable(P['azure-stream']))
        with self.assertRaises(RuntimeError) as e: asyncio.run(pv.vertex_live(FakeHttp(), 'gemini-3.8-live'))
        self.assertIn('not offered', str(e.exception))

    def test_a_model_vertex_does_not_offer_names_its_component(self):
        pv.VERTEX_MAP = pv.model_map(json.dumps({'gemini-3.8-flash-lite-tts': None}))
        self.assertEqual(pv.unavailable(P['v2-flashlite']), pv.NOT_OFFERED['voice'])
        self.assertIsNone(pv.unavailable(P['v2-mai']), 'the Azure voice stack still runs')
        self.assertIn(pv.NOT_OFFERED['voice'], app.preflight(P['v2-flashlite'], {}))
        self.assertEqual(pv.unavailable(P['azure-stream'], 'gemini-3.1-flash-lite'), pv.NOT_OFFERED['brain'], 'a swapped-in brain is checked too')

    def test_every_gemini_preset_runs_when_vertex_offers_it(self):
        for pid, p in P.items():
            if pid == 'gemini-3.1-live': self.assertEqual(pv.unavailable(p), pv.NOT_OFFERED['s2s'], 'not in the default map'); continue
            self.assertIsNone(pv.unavailable(p), pid); self.assertIsNone(app.preflight(p, {}), pid)

    def test_keys_in_the_env_never_stand_in(self):
        os.environ.update({'GEMINI_PAID_KEY': 'k', 'GEMINI_TEST_KEY': 'k', 'OPENROUTER_API_KEY': 'k', 'VERTEX_OFF': '1'})
        self.assertIsNotNone(app.preflight(P['v2-flashlite'], {}))
        http = FakeHttp(); usage, timing = {}, {}
        async def go(): return [d async for d in pv.llm_stream(http, 'gemini-3.5-flash-lite', [{'role': 'user', 'content': 'hi'}], usage, timing)]
        self.assertEqual(asyncio.run(go()), []); self.assertEqual(http.posts, [], 'no request to any host')
        self.assertIn('switched off', timing['err'])

    def test_lab_test_503_hook_applies_on_vertex(self):
        os.environ['LAB_TEST_503'] = 'gemini-3.5-flash-lite:0'; http = FakeHttp(); timing = {}
        self.assertIsNone(asyncio.run(pv.vertex_post(http, 'gemini-3.5-flash-lite', {'contents': []}, timing)))
        self.assertTrue(timing['err'].startswith('503')); self.assertEqual(http.posts, [])


class TextRoute(Base):
    def test_stream_goes_to_vertex_with_the_bearer_token(self):
        http = FakeHttp(); body = {'contents': [{'parts': [{'text': 'hi'}]}]}
        self.assertIsNotNone(asyncio.run(pv.vertex_post(http, 'gemini-3.5-flash-lite', body, {})))
        url, hdr, sent = http.posts[0]
        self.assertEqual(url, f'https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/publishers/google/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse')
        self.assertEqual(hdr, {'Authorization': 'Bearer tok-fake'}); self.assertEqual(sent['contents'][0]['role'], 'user')

    def test_model_map_renames_and_regional_hosts(self):
        pv.VERTEX_MAP = pv.model_map(json.dumps({'gemini-3.8-live': 'gemini-3.8-live-001'})); pv.VERTEX_LOCATION = 'asia-south1'
        self.assertEqual(pv.vertex_resource('gemini-3.8-live'), f'projects/{PROJECT}/locations/us-central1/publishers/google/models/gemini-3.8-live-001')
        self.assertEqual(pv.vertex_resource('gemini-3.5-transcribe-live'), f'projects/{PROJECT}/locations/us-central1/publishers/google/models/gemini-3.5-transcribe-live-preview')
        self.assertEqual(pv.vertex_resource('gemini-3.5-flash-lite'), f'projects/{PROJECT}/locations/asia-south1/publishers/google/models/gemini-3.5-flash-lite')
        self.assertEqual(pv.vertex_live_url(), 'wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent')
        self.assertEqual(pv.model_map('not json'), pv.DEFAULT_MODELS)


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
            elif 'realtimeInput' in d:
                await ws.send_bytes(json.dumps({'serverContent': {'inputTranscription': {'text': 'haan ji'}}}).encode())
        return ws

    async def __aenter__(self):
        a = web.Application(); a.router.add_get(pv.LIVE_PATH, self.handler)
        self.server = TestServer(a, host='127.0.0.1'); await self.server.start_server()
        return self

    async def __aexit__(self, *a): await self.server.close()

    def url(self): return f'ws://127.0.0.1:{self.server.port}{pv.LIVE_PATH}'


class LiveRoute(Base):
    def ears(self):
        async def go():
            import aiohttp
            async with FakeVertexLive() as fake, aiohttp.ClientSession() as http:
                with mock.patch.object(pv, 'vertex_live_url', fake.url):
                    finals = []
                    stt = pv.GeminiSTT(http, lambda t: None, finals.append, lambda e: finals.append(('error', e)))
                    await stt.start()
                    stt.write(b'\x01\x00' * 640, True)
                    for _ in range(200):
                        if finals: break
                        await asyncio.sleep(0.01)
                    await stt.close()
            return fake, finals
        return asyncio.run(go())

    def test_ears_path_token_and_setup_against_a_fake_vertex(self):
        fake, finals = self.ears()
        self.assertEqual(fake.path, pv.LIVE_PATH)
        self.assertEqual(fake.headers.get('Authorization'), 'Bearer tok-fake')
        self.assertNotIn('x-goog-api-key', {k.lower() for k in fake.headers})
        setup = fake.msgs[0]['setup']
        self.assertEqual(setup['model'], f'projects/{PROJECT}/locations/us-central1/publishers/google/models/gemini-3.5-transcribe-live-preview')
        self.assertEqual(setup['generationConfig'], {'responseModalities': ['TEXT']})
        self.assertIn('inputAudioTranscription', setup)
        chunk = fake.msgs[1]['realtimeInput']['mediaChunks'][0]
        self.assertEqual((chunk['mimeType'], len(base64.b64decode(chunk['data']))), ('audio/pcm;rate=16000', 1280))
        self.assertEqual(finals, ['haan ji'])

    def test_audio_field_switch(self):
        pv.VERTEX_LIVE_AUDIO = 'audio'
        fake, _ = self.ears()
        self.assertEqual(fake.msgs[1]['realtimeInput']['audio']['mimeType'], 'audio/pcm;rate=16000')

    def test_speech_to_speech_connects_to_vertex(self):
        async def go():
            import aiohttp
            async with FakeVertexLive() as fake, aiohttp.ClientSession() as http:
                with mock.patch.object(pv, 'vertex_live_url', fake.url):
                    c = object.__new__(calls.GeminiLiveCall)
                    c.spec = catalog.S2S['gemini-3.8-live']; c.preset = P['v2-live']; c.cfg = {'scenario': 'renewal'}
                    c.voice = 'Despina'; c.system = 'brief text'; c.handle = None; c.http = http
                    ws = await c.connect(); await ws.close()
            return fake
        fake = asyncio.run(go())
        self.assertEqual((fake.path, fake.headers.get('Authorization')), (pv.LIVE_PATH, 'Bearer tok-fake'))
        s = fake.msgs[0]['setup']
        self.assertEqual(s['model'], f'projects/{PROJECT}/locations/us-central1/publishers/google/models/gemini-3.8-live')
        self.assertEqual(s['generationConfig']['speechConfig']['voiceConfig']['prebuiltVoiceConfig']['voiceName'], 'Despina')
        self.assertEqual(s['tools'][0]['functionDeclarations'][0]['name'], 'end_call')


if __name__ == '__main__':
    unittest.main()
