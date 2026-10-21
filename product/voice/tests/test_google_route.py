# The Vertex route is picked only in India (appeal commitment, decision.2026-10-21.appeal-commitments-binding). No
# network: GoogleRoute is only constructed; nothing is sent.
import json, os, tempfile, unittest
from vpvoice.providers import google


class VertexIndiaOnly(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.sa = os.path.join(self.d.name, 'sa.json')
        with open(self.sa, 'w') as f: json.dump({'project_id': 'fictional-project', 'client_email': 'x@fictional.test', 'private_key': 'not-a-key'}, f)
        google._REFUSED.clear()

    def tearDown(self): self.d.cleanup()

    def route(self, **env): return google.GoogleRoute({'VERTEX_SA_FILE': self.sa, 'GEMINI_PAID_KEY': 'fake', **env})

    def test_india_regions_pick_vertex(self):
        for region in ('centralindia', 'CentralIndia', 'asia-south1', ' india '):
            self.assertEqual(self.route(VP_REGION=region).name, 'vertex', region)

    def test_outside_india_or_unset_falls_back_to_the_gemini_api_with_one_reason(self):
        with self.assertLogs('vp.voice.google', 'WARNING') as logs:
            for region in (None, '', 'eastus', 'westeurope', 'us-central1'):
                env = {} if region is None else {'VP_REGION': region}
                r = self.route(**env)
                self.assertEqual(r.name, 'gemini_api', region); self.assertFalse(r.uses_vertex('gemini-3.5-flash-lite'))
            self.route(VP_REGION='eastus')                                    # the same reason is logged once
        self.assertEqual(len(logs.output), 4)
        self.assertTrue(all('not an Indian region' in m for m in logs.output))

    def test_vertex_off_still_wins_in_india(self):
        self.assertEqual(self.route(VP_REGION='centralindia', VERTEX_OFF='1').name, 'gemini_api')


if __name__ == '__main__':
    unittest.main()
