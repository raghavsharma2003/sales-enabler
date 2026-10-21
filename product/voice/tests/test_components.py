# Per-component availability (GET /v1/health components) and the routing policy on every brain. No network.
import json, os, tempfile, unittest
from vpvoice import catalog
from vpvoice.providers import components, google


class Components(unittest.TestCase):
    def setUp(self):
        self.f = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False)
        json.dump({'project_id': 'fictional-project', 'client_email': 'x@fictional.test', 'private_key': 'not-a-key'}, self.f); self.f.close()
        google._VERTEX.clear()

    def tearDown(self): os.unlink(self.f.name); google._VERTEX.clear()

    def h(self, **env): return components.health(env, google.GoogleRoute(env))

    def test_every_catalog_component_has_an_answer(self):
        h = self.h()
        for part, table in components.PARTS.items():
            self.assertEqual(set(h[part]), set(table), part)
            for cid, v in h[part].items():
                self.assertEqual(v['available'], v['reason'] is None, (part, cid))
                if v['missing']: self.assertFalse(v['available'], (part, cid))
        self.assertEqual(h['brain']['kimi-k2.6']['missing'], ['AZURE_OPENAI_SEA'])
        self.assertEqual(self.h(VP_AI_ENDPOINT='https://fictional.test', VP_AI_KEY='k')['brain']['kimi-k2.6'], {'available': True, 'reason': None, 'missing': []})

    def test_plain_reasons_and_no_reroute(self):
        none = self.h()
        self.assertEqual(none['ears']['azure']['reason'], "Azure Speech isn't set up on this server")
        self.assertEqual(none['brain']['gemini-3.5-flash-lite']['reason'], "Our Google Cloud route isn't set up on this server")
        self.assertEqual(none['brain']['gpt-5.4-mini']['reason'], "Our Azure AI Foundry isn't set up on this server")
        self.assertEqual(none['brain']['gpt-6-luna@or']['reason'], "OpenRouter isn't set up on this server")
        self.assertEqual(none['ears']['asha']['reason'], components.NOT_BUILT)
        on = self.h(VERTEX_SA_FILE=self.f.name, VP_REGION='centralindia', LAB_SPEECH_KEY='k', GEMINI_PAID_KEY='k', OPENROUTER_API_KEY='k')
        self.assertTrue(on['ears']['azure']['available'])
        self.assertEqual(on['ears']['gemini']['reason'], "Gemini listening isn't offered on Google Cloud", 'never rerouted to an API key')
        for cid in ('gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash'): self.assertTrue(on['brain'][cid]['available'], cid)
        self.assertEqual(on['brain']['gemini-3.1-flash-lite']['reason'], "This model isn't offered on our Google Cloud route yet")
        for cid in ('gemini', 'gemini-lite'): self.assertTrue(on['voice'][cid]['available'], cid)
        self.assertTrue(on['s2s']['gemini-3.8-live']['available'])
        self.assertEqual(on['s2s']['gemini-3.1-live']['reason'], "This speech-to-speech model isn't offered on our Google Cloud route yet")
        self.assertEqual(on['s2s']['azure-rt-mini']['reason'], components.NOT_BUILT)

    def test_every_brain_has_its_route(self):
        expect = {'gm': 'vertex', 'sin': 'azure-foundry', 'sea': 'azure-foundry', 'or': 'openrouter', 'sv': 'sarvam'}
        for cid, b in catalog.BRAINS.items(): self.assertEqual(b['route'], expect[b['host']], cid)
        self.assertNotIn('gpt-oss-120b@groq', catalog.BRAINS, 'gpt-oss-120b runs on our Foundry, not Groq')
        self.assertEqual(catalog.BRAINS['gpt-oss-120b']['route'], 'azure-foundry')
        self.assertFalse(any(b['route'] == 'openrouter' and b['model'].startswith('google/') for b in catalog.BRAINS.values()), 'no Gemini via OpenRouter')


if __name__ == '__main__':
    unittest.main()
