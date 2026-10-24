# Stack selection (directive.2026-10-22.full-stack-selection): every ticket carries its parts; a curated id must carry
# exactly its own, 'custom' is built from catalog parts, nothing is substituted; a built stack's call files under what
# ran. Parity with product/shared/components.ts (ids, part, route, requires, voices). No network.
import asyncio, json, os, re, unittest
from tests.fixtures import SECRET, FakeBrain, components, ticket
from tests.test_server import Base, signed
from vpvoice import catalog, stacks, ticket as tk
from vpvoice.server import Runtime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
BUILT = {'ears': 'sarvam', 'brain': 'kimi-k2.6', 'voice': 'azure-mai', 'gatedEars': True}


class Intake(unittest.TestCase):
    def refused(self, t, code):
        with self.assertRaises(tk.TicketError) as e: tk.validate(t)
        self.assertEqual(e.exception.code, code, str(e.exception))

    def test_curated_id_must_carry_its_own_parts(self):
        t = ticket(); t['stack']['components']['brain'] = 'gemini-3.8-flash'; self.refused(t, 'stack_mismatch')
        t = ticket(); t['stack']['components']['gatedEars'] = False; self.refused(t, 'stack_mismatch')
        t = ticket(); del t['stack']['components']; self.refused(t, 'bad_stack')
        stack, voice = tk.validate(ticket())
        self.assertEqual((stack['id'], voice), ('v2-flashlite', 'Despina'))

    def test_custom_parts_are_checked_never_substituted(self):
        stack, voice = tk.validate(ticket('custom', parts=BUILT))
        self.assertEqual((stack['kind'], stack['components'], voice), ('cascade', BUILT, 'hi-IN-Kavya:MAI-Voice-2.1-Flash'))
        self.assertEqual(stack['requires'], ['SARVAM', 'AZURE_OPENAI_SEA', 'AZURE_SPEECH'])
        self.refused(ticket('custom', parts={**BUILT, 'brain': 'gpt-99'}), 'unknown_component')
        self.refused(ticket('custom', parts={k: v for k, v in BUILT.items() if k != 'voice'}), 'bad_stack')
        self.refused(ticket('custom', parts={'s2s': 'gemini-3.8-live', 'brain': 'kimi-k2.6'}), 'bad_stack')
        self.refused(ticket('custom', parts={'s2s': 'made-up-live'}), 'unknown_component')
        t = ticket('custom', parts=BUILT); t['agent']['voice']['components'] = {**BUILT, 'voice': 'azure'}; self.refused(t, 'stack_mismatch')
        t = ticket('custom', parts=BUILT); t['agent']['voice']['voiceId'] = 'Despina'; self.refused(t, 'unknown_voice')
        s2s, v = tk.validate(ticket('custom', parts={'s2s': 'gemini-3.8-live'}))
        self.assertEqual((s2s['kind'], s2s['requires'], v), ('s2s', ['GEMINI'], 'Despina'))

    def test_combination_id_is_the_same_algorithm_over_parts(self):
        self.assertEqual(stacks.combination_id(tk.validate(ticket('custom', parts=BUILT))[0], 'x'), 'v2|sarvam+kimi-k2.6+azure-mai~x')
        self.assertEqual(stacks.combination_id(stacks.resolve({'id': 'custom', 'components': dict(stacks.STACKS['v2-flashlite']['components'])})),
                         stacks.combination_id('v2-flashlite'), 'a built copy of a curated stack files under the same combination')


class BuiltCall(Base):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        def make_components(sid, voice, t, http, env):
            b = FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'शुक्रिया, अपना ख्याल रखिए, bye! <end_call>'])
            self.brains.append(b)
            return components(stacks.resolve(t['stack']), brain=b)
        self.rt.make_components = make_components

    async def test_custom_sim_call_manifest_names_what_ran(self):
        t = ticket('custom', parts=BUILT); cid = t['conversationId']
        r = await self.post_ticket(t); d = await r.json(); self.assertEqual(r.status, 202, d)
        ws = await self.client.ws_connect(f"/v1/media/sim/{cid}?token={d['join']['token']}"); await ws.receive_json()
        await ws.send_json({'t': 'say', 'text': 'ठीक है, thank you'}); await ws.receive_json(); await ws.close(); await asyncio.sleep(0.05)
        m = self.posters[0].events()[-1]['manifest']
        self.assertEqual((m['stackId'], m['combinationId']), ('custom', 'v2|sarvam+kimi-k2.6+azure-mai~hi-IN-Kavya:MAI-Voice-2.1-Flash'))
        self.assertEqual(m['components'], {'stt': 'sarvam', 'llm': 'kimi-k2.6', 'tts': 'azure-mai', 'voice': 'hi-IN-Kavya:MAI-Voice-2.1-Flash'})

    async def test_custom_ticket_missing_credentials_is_refused_by_part(self):
        rt = Runtime(env={'VP_RUNTIME_SECRET': SECRET, 'SARVAM_API_KEY': 'k'})
        from aiohttp.test_utils import TestClient, TestServer
        c = TestClient(TestServer(rt.app())); await c.start_server()
        try:
            body, hdr = signed(ticket('custom', parts=BUILT))
            r = await c.post('/v1/calls', data=body, headers=hdr); d = await r.json()
            self.assertEqual((r.status, d['error'], d['missing']), (503, 'stack_unavailable', ['AZURE_OPENAI_SEA', 'AZURE_SPEECH']))
        finally:
            await c.close()


def ts_components():
    with open(os.path.join(ROOT, 'product', 'shared', 'components.ts'), encoding='utf-8') as f: src = f.read()
    consts = {m.group(1): re.findall(r"'([^']+)'", m.group(2)) for m in re.finditer(r"const (\w+) = \[([^\]]*)\] as const", src)}
    body = src[src.index('export const COMPONENTS'):src.index('export function getComponent')]
    out = []
    for chunk in re.split(r"\n  \{ id: ", body)[1:]:
        g = lambda k: (re.search(k + r":\s*'([^']*)'", chunk) or [None, None])[1]
        req = re.findall(r"'([^']+)'", re.search(r"requires:\s*\[([^\]]*)\]", chunk).group(1))
        vm = re.search(r"voices:\s*(\[[^\]]*\]|\w+)", chunk)
        voices = None if not vm else (re.findall(r"'([^']+)'", vm.group(1)) if vm.group(1).startswith('[') else consts[vm.group(1)])
        out.append({'id': chunk.split("'")[1], 'part': g('part'), 'route': g('route'), 'requires': req, 'voices': voices, 'defaultVoice': g('defaultVoice')})
    return out


class ComponentsParity(unittest.TestCase):
    """product/shared/components.ts is what a person can pick; every part must be one this runtime knows, on the same route."""
    TABLE = {'ears': catalog.STT, 'brain': catalog.BRAINS, 'voice': catalog.TTS, 's2s': catalog.S2S}

    def test_ids_parts_routes_requires_and_voices_match(self):
        ts = ts_components()
        self.assertGreater(len(ts), 15)
        for c in ts:
            spec = self.TABLE[c['part']].get(c['id'])
            self.assertIsNotNone(spec, f"{c['part']} {c['id']} is not in catalog.py")
            self.assertEqual(c['route'], spec['route'], c['id'])
            own = stacks.KIND_REQUIRES.get(spec.get('kind')) if c['part'] != 'brain' else stacks.BRAIN_REQUIRES[spec['host']]
            self.assertEqual(c['requires'], [own], c['id'])
            for r in c['requires']: self.assertIn(r, stacks.REQUIRES_ENV, c['id'])
            if c['part'] in ('voice', 's2s'):
                allowed = spec['voices']; default = spec.get('default_voice') or spec.get('voice')
                self.assertTrue(set(c['voices']) <= set(allowed), f"{c['id']}: voices the runtime does not offer: {set(c['voices']) - set(allowed)}")
                self.assertEqual(c['defaultVoice'], default, c['id'])

    def test_every_curated_stack_is_built_from_offered_parts(self):
        ts = {(c['part'], c['id']) for c in ts_components()}
        for sid, s in stacks.STACKS.items():
            for part, cid in stacks.parts(s['components']).items():
                if part != 'gatedEars': self.assertIn((part, cid), ts, f'{sid} uses {part} {cid}, which components.ts does not offer')


if __name__ == '__main__':
    unittest.main()
