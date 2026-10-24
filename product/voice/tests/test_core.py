import asyncio, json, os, re, unittest
from tests.fixtures import SECRET, ticket, sink
from vpvoice import signing, stacks, catalog
from vpvoice import ticket as tk
from vpvoice.cost import CostMeter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


class Signing(unittest.TestCase):
    body = b'{"protocol":1,"conversationId":"0b6f6e1a-1c2d-4e5f-8a9b-000000000001"}'

    def test_roundtrip(self):
        h = signing.sign(SECRET, self.body)
        self.assertRegex(h, r'^t=\d+,v1=[0-9a-f]{64}$')
        signing.verify(SECRET, h, self.body)

    def test_matches_the_contract_formula(self):
        import hashlib, hmac
        h = signing.sign(SECRET, self.body, t_ms=1700000000000)
        want = hmac.new(SECRET.encode(), b'1700000000000.' + self.body, hashlib.sha256).hexdigest()
        self.assertEqual(h, f't=1700000000000,v1={want}')

    def test_rejects_tampered_body(self):
        h = signing.sign(SECRET, self.body)
        with self.assertRaises(signing.SignatureError): signing.verify(SECRET, h, self.body + b' ')

    def test_rejects_tampered_signature_and_timestamp(self):
        h = signing.sign(SECRET, self.body)
        t, v = h.split(',')
        bad = v[:-1] + ('0' if v[-1] != '0' else '1')
        with self.assertRaises(signing.SignatureError): signing.verify(SECRET, f'{t},{bad}', self.body)
        t2 = 't=' + str(int(t[2:]) + 1)
        with self.assertRaises(signing.SignatureError): signing.verify(SECRET, f'{t2},{v}', self.body)

    def test_rejects_wrong_secret(self):
        with self.assertRaises(signing.SignatureError): signing.verify('other', signing.sign(SECRET, self.body), self.body)

    def test_skew(self):
        now = 1_800_000_000_000
        ok = signing.sign(SECRET, self.body, t_ms=now - 4 * 60 * 1000)
        signing.verify(SECRET, ok, self.body, now_ms=now)
        for skew in (5 * 60 * 1000 + 1, -(5 * 60 * 1000 + 1)):
            with self.assertRaises(signing.SignatureError):
                signing.verify(SECRET, signing.sign(SECRET, self.body, t_ms=now - skew), self.body, now_ms=now)

    def test_rejects_missing_malformed_and_unconfigured(self):
        for h in (None, '', 'v1=abc', 't=abc,v1=00', 't=1', 't=1,v1=' + 'é' * 64, 't=١٢٣,v1=' + '0' * 64):
            with self.assertRaises(signing.SignatureError): signing.verify(SECRET, h, self.body)
        with self.assertRaises(signing.SignatureError): signing.verify('', signing.sign(SECRET, self.body), self.body)


class Tickets(unittest.TestCase):
    def test_valid(self):
        stack, voice = tk.validate(ticket())
        self.assertEqual(voice, 'Despina')

    def test_conversation_id_must_be_a_uuid(self):
        for bad in ['conv_test_1', '0b6f6e1a-1c2d-4e5f-8a9b-00000000001', 'x' * 36, '../../etc', '']:
            t = ticket(); t['conversationId'] = bad
            with self.assertRaises(tk.TicketError, msg=bad): tk.validate(t)
        t = ticket(); t['conversationId'] = t['conversationId'].upper(); tk.validate(t)

    def test_every_stack_is_accepted(self):
        for sid in stacks.STACKS: tk.validate(ticket(sid))

    def test_unknown_or_missing_stack_refused(self):
        t = ticket(); t['stack']['id'] = 'v9-imaginary'; t['agent']['voice']['stackId'] = 'v9-imaginary'
        with self.assertRaises(tk.TicketError) as e: tk.validate(t)
        self.assertEqual(e.exception.code, 'unknown_stack')
        t = ticket(); t['stack'] = {}
        with self.assertRaises(tk.TicketError) as e: tk.validate(t)
        self.assertEqual(e.exception.code, 'no_stack')

    def test_mismatches_refused(self):
        t = ticket(); t['agent']['voice']['stackId'] = 'v2-luna'
        with self.assertRaises(tk.TicketError) as e: tk.validate(t)
        self.assertEqual(e.exception.code, 'stack_mismatch')
        t = ticket(); t['stack']['combinationId'] = 'v2|something-else'
        with self.assertRaises(tk.TicketError) as e: tk.validate(t)
        self.assertEqual(e.exception.code, 'combination_mismatch')
        t = ticket(); t['agent']['voice']['voiceId'] = 'NotAVoice'
        with self.assertRaises(tk.TicketError) as e: tk.validate(t)
        self.assertEqual(e.exception.code, 'unknown_voice')

    def test_brief_integrity(self):
        t = ticket(); t['brief']['text'] += ' reworded'
        with self.assertRaises(tk.TicketError): tk.validate(t)
        t = ticket(); t['brief']['hash'] = '0' * 64
        with self.assertRaises(tk.TicketError): tk.validate(t)

    def test_memory_limit(self):
        t = ticket(); t['contact']['memoryBrief'] = 'x' * 1201; t['contact']['memoryStatus'] = 'loaded'
        with self.assertRaises(tk.TicketError) as e: tk.validate(t)
        self.assertEqual(e.exception.code, 'bad_memory')
        t['contact']['memoryBrief'] = 'likes short calls'
        tk.validate(t)
        self.assertEqual(tk.memory_block(t), 'likes short calls')
        t['contact']['memoryStatus'] = 'not_loaded_timeout'
        self.assertEqual(tk.memory_block(t), '')

    def test_limits_required(self):
        t = ticket(); t['limits'] = {'maxDurationS': 0, 'maxCostInrMilli': 100}
        with self.assertRaises(tk.TicketError): tk.validate(t)


class StackParity(unittest.TestCase):
    """product/shared/stacks.ts is the contract; this mirror must name the same stacks with the same components."""
    def test_same_stacks_and_combination_ids(self):
        with open(os.path.join(ROOT, 'product', 'shared', 'stacks.ts')) as f: src = f.read()
        # The literals live in WRITTEN since the speed gate (f8448dd); STACKS maps them. Read whichever holds them.
        start = src.index('const WRITTEN') if 'const WRITTEN' in src else src.index('export const STACKS')
        body = src[start:src.index('export function getStack')]
        ts = {}
        for m in re.finditer(r"id:\s*'([^']+)'.*?kind:\s*'(\w+)'.*?components:\s*\{([^}]*)\}", body, re.S):
            comps = dict(re.findall(r"(\w+):\s*'([^']+)'", m.group(3)))
            comps['gatedEars'] = 'gatedEars: true' in m.group(3)
            ts[m.group(1)] = (m.group(2), comps)
        self.assertEqual(set(ts), set(stacks.STACKS))
        for sid, (kind, comps) in ts.items():
            py = stacks.STACKS[sid]
            self.assertEqual(kind, py['kind'], sid)
            for k in ('ears', 'brain', 'voice', 's2s'):
                self.assertEqual(comps.get(k), py['components'].get(k), f'{sid}.{k}')
            self.assertEqual(comps['gatedEars'], bool(py['components'].get('gatedEars')), sid)
            core = comps['s2s'] if kind == 's2s' else f"{comps['ears']}{'' if comps['gatedEars'] else '/ungated'}+{comps['brain']}+{comps['voice']}"
            self.assertEqual(stacks.combination_id(sid, 'Despina'), f'v2|{core}~Despina')

    def test_every_component_is_priced(self):
        for sid, s in stacks.STACKS.items():
            c = s['components']
            if 's2s' in c: self.assertIn(c['s2s'], catalog.S2S)
            else:
                self.assertIn(c['ears'], catalog.STT); self.assertIn(c['brain'], catalog.BRAINS); self.assertIn(c['voice'], catalog.TTS)

    def test_no_default(self):
        with self.assertRaises(stacks.StackError): stacks.require_stack(None)
        with self.assertRaises(stacks.StackError): stacks.require_stack('')

    def test_credentials(self):
        self.assertEqual(stacks.missing_credentials('sarvam-india', {}), ['SARVAM'])
        self.assertEqual(stacks.missing_credentials('sarvam-india', {'SARVAM_API_KEY': 'x'}), [])
        self.assertEqual(stacks.missing_credentials('v2-54mini', {'VERTEX_SA_FILE': 'x'}), ['AZURE_SPEECH', 'AZURE_OPENAI'])
        self.assertEqual(stacks.missing_credentials('v2-flashlite', {'GEMINI_PAID_KEY': 'x', 'LAB_SPEECH_KEY': 'x'}), ['GEMINI'], 'a Gemini API key no longer counts')


class Cost(unittest.TestCase):
    def test_deltas_sum_to_total_in_integer_milli(self):
        m = CostMeter(10_000)
        for _ in range(7): m.add('brain', 'gemini', 'token', 120, usd=0.0000777)
        evs = m.drain()
        m.add('brain', 'gemini', 'token', 120, usd=0.0000777); m.add('voice', 'gemini', 'second', 2.5, usd=catalog.voice_usd('gemini-lite', audio_s=2.5))
        evs += m.drain()
        self.assertEqual(m.drain(), [])
        for e in evs:
            self.assertIsInstance(e['inrMilli'], int)
            self.assertIn(e['component'], ('telephony', 'ears', 'brain', 'voice', 'platform'))
            self.assertIn(e['unit'], ('second', 'token', 'char', 'call', 'request'))
        self.assertEqual(sum(e['inrMilli'] for e in evs), m.total_milli())
        self.assertEqual(sum(e['quantity'] for e in evs if e['component'] == 'brain'), 960)
        self.assertEqual(m.total_milli(), round((8 * 0.0000777 + catalog.voice_usd('gemini-lite', audio_s=2.5)) * 95 * 1000))

    def test_fx_and_limit(self):
        m = CostMeter(95)
        m.add('brain', 'x', 'token', 1, usd=0.00098); self.assertFalse(m.over_limit())
        m.add('brain', 'x', 'token', 1, usd=0.00002); self.assertTrue(m.over_limit())       # $0.001 = ₹0.095 = 95 milli

    def test_telephony_pulse(self):
        self.assertEqual(catalog.telephony_inr('plivo', 'outbound', 61), (0.76, 120))
        self.assertEqual(catalog.telephony_inr('plivo', 'inbound', 1)[1], 60)


class Events(unittest.TestCase):
    def test_retry_resends_the_same_batch_and_ended_is_alone_and_last(self):
        async def go():
            s, p = sink(fail_first=2)
            s.emit('turn', speaker='agent', text='x', startMs=0, endMs=1)
            s.emit('cost', component='brain', provider='g', quantity=1, unit='token', inrMilli=1)
            await s.flush()
            await s.end(endReason='completed', durationS=1.0, transcript=[], manifest={})
            return p
        p = asyncio.run(go())
        self.assertEqual(p.calls, 4)                   # 2 failures, then the batch, then call.ended
        batches = [json.loads(b) for b in p.bodies]
        self.assertEqual([e['seq'] for e in batches[0]['events']], [1, 2])
        self.assertEqual([e['type'] for e in batches[-1]['events']], ['call.ended'])
        self.assertEqual(batches[-1]['events'][0]['seq'], 3)
        for b, h in zip(p.bodies, p.headers): signing.verify(SECRET, h, b)

    def test_no_event_after_end(self):
        async def go():
            s, p = sink()
            await s.end(endReason='completed', durationS=0, transcript=[], manifest={})
            self.assertIsNone(s.emit('turn', speaker='agent', text='late'))
            await s.flush()
            return p
        p = asyncio.run(go())
        self.assertEqual([e['type'] for e in p.events()], ['call.ended'])


if __name__ == '__main__':
    unittest.main()
