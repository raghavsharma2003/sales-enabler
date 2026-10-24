# The shared safety vectors (product/shared/safety/cases.json) on the Python door, with the semantics cases.json
# states: ctx = defaults.ctx shallow-merged with case.ctx; replyDoor {action, rule?} where 'not_pass' means block or
# replace and rule may be a list; callerSignals {signals, partial?}: listed signals equal, unlisted false unless
# partial; redact {output}; lintAgentConfig {findings}: the multiset of {rule, effect} matches exactly. Skipped while
# the file is absent.
import collections, copy, json, os, unittest
from vpvoice import rules, safety

CASES = os.path.join(os.path.dirname(__file__), '..', '..', 'shared', 'safety', 'cases.json')


def merge_config(default, inp):
    out = dict(default)
    for k, v in (inp or {}).items():
        out[k] = {**out[k], **v} if k in ('persona', 'opening') and isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def run_case(c, d):
    fn, exp = c['fn'], c['expect']
    if fn == 'replyDoor':
        ctx = {**d['defaults']['ctx'], **(c.get('ctx') or {})}
        got = safety.reply_door(c['input'], ctx)
        if exp['action'] == 'not_pass':
            if got['action'] == 'pass': return f'passed, want not_pass {exp.get("rule")}'
            want = exp.get('rule'); want = [want] if isinstance(want, str) else want
            if want and got['rule'] not in want: return f'rule {got["rule"]} ({got.get("id")}), want {want}'
        elif got['action'] != exp['action'] or (exp.get('rule') and got.get('rule') != exp['rule']):
            return f'{got["action"]} {got.get("rule")} ({got.get("id")}), want {exp["action"]} {exp.get("rule", "")}'
    elif fn == 'callerSignals':
        got = safety.caller_signals(c['input'])
        for k, v in exp['signals'].items():
            if got[k] != v: return f'{k}={got[k]}, want {v}'
        if not exp.get('partial'):
            extra = [k for k, v in got.items() if v and k not in exp['signals']]
            if extra: return f'unexpected {extra}'
    elif fn == 'redact':
        got = safety.redact(c['input'])
        if got != exp['output']: return f'{got!r}, want {exp["output"]!r}'
    elif fn == 'lintAgentConfig':
        got = rules.lint_agent_config(merge_config(d['defaults']['config'], c['input']))
        g = collections.Counter((f['rule'], f['effect']) for f in got)
        w = collections.Counter((f['rule'], f['effect']) for f in exp['findings'])
        if g != w: return f'{dict(g)}, want {dict(w)}'
    else:
        return f'unknown fn {fn}'
    return None


@unittest.skipUnless(os.path.exists(CASES), 'product/shared/safety/cases.json has not landed yet')
class SharedVectors(unittest.TestCase):
    def test_vectors(self):
        with open(CASES, encoding='utf-8') as f: d = json.load(f)
        fails = []
        for c in d['cases']:
            why = run_case(c, d)
            if why: fails.append(f"{c['id']}: {why} | {str(c['input'])[:90]}")
        self.assertEqual(fails, [], f'{len(fails)} of {len(d["cases"])} shared vectors fail:\n' + '\n'.join(fails[:40]))
        self.assertGreaterEqual(len(d['cases']), 1979)


class ParityGuard(unittest.TestCase):
    """An engine change in rules.json that this port does not know must fail at load, never be half-evaluated."""
    def test_current_rules_load(self):
        rules.check_schema(rules.RULES)

    def test_unknown_semantics_refused(self):
        import copy
        mutations = [
            lambda r: r.__setitem__('newSection', {}),
            lambda r: r['regex'].__setitem__('word_split', 'x'),
            lambda r: r['reply'][0].__setitem__('coSentence', True),
            lambda r: r['caller'][0].__setitem__('window', 3),
            lambda r: r['reply'][0].__setitem__('kind', 'builtin:telepathy'),
            lambda r: r['reply'][0].__setitem__('scope', {'when': 'tuesday'}),
            lambda r: r['reply'][0].__setitem__('action', 'warn'),
            lambda r: r['redact']['kinds'][0].__setitem__('checksum', 'luhn'),
            lambda r: r.__setitem__('schema', 2),
        ]
        for i, mut in enumerate(mutations):
            r = copy.deepcopy(rules.RULES); mut(r)
            with self.assertRaises(rules.RulesSchemaError, msg=f'mutation {i}'): rules.check_schema(r)


if __name__ == '__main__':
    unittest.main()


class RedactKeepsLayout(unittest.TestCase):
    """A pasted CSV keeps its rows through the door (rejected.2026-10-23.upload-newlines-folded-by-redact)."""
    def test_rows_survive_and_secrets_are_masked(self):
        from vpvoice import rules
        csv = 'name,phone,city\r\nAsha Verma,9000000041,Pune\r\nRavi Kumar,9000000042,Indore\nMeera Shah,9000000043,Surat\n'
        self.assertEqual(rules.redact(csv), csv)
        masked = rules.redact('name\tnote\nAsha\tOTP 482913 hai\nRavi\tcard 4111 1111 1111 1111\n')
        self.assertEqual(len(masked.split('\n')), 4)
        self.assertNotRegex(masked, '482913|4111')
        self.assertTrue(masked.startswith('name\tnote\nAsha\t'))


class LintAiHonesty(unittest.TestCase):
    """T-L1 on the DEV set shared with the TS door (product/tests/safety-lint-ai.test.ts): benches round 4 saved a note
    telling her to say she is human in the third person. Each line is linted as a persona note."""
    def lint_note(self, text):
        d = json.load(open(os.path.join(os.path.dirname(CASES), 'cases.json')))
        cfg = copy.deepcopy(d['defaults']['config'])
        cfg['persona'] = {**(cfg.get('persona') or {}), 'notes': [text]}
        return [f for f in rules.lint_agent_config(cfg) if f['rule'] == 'T-L1' and f['path'].startswith('persona')]

    def test_dev_set(self):
        d = json.load(open(os.path.join(os.path.dirname(CASES), 'sets', 'dev-lint-ai.json'), encoding='utf-8'))
        for s in d['probe'] + [x['text'] for x in d['refuse']]:
            self.assertTrue(self.lint_note(s), s)
        for x in d['allow']:
            self.assertEqual(self.lint_note(x['text']), [], x['text'])


class DevLookalikes(unittest.TestCase):
    """Parity with tests/safety.test.ts: the floor on the DEV look-alike set."""
    def test_floor(self):
        d = json.load(open(os.path.join(os.path.dirname(CASES), 'sets', 'dev-lookalike-9.json'), encoding='utf-8'))
        self.assertEqual([x['text'] for x in d['caller_benign'] if rules.caller_signals(x['text'])['crisis']], [])
        self.assertGreaterEqual(sum(rules.caller_signals(x['text'])['crisis'] for x in d['caller_crisis']), 30)
        for t in ('amar bondhu suicide korechilo ami o korbo', 'hero bridge se kood jata hai main bhi kood jaunga', 'ami o ekhon marte chai'):
            self.assertTrue(rules.caller_signals(t)['crisis'], t)
        for t in ('garme marte chai na baba', 'sirichu sirichu saagaren'):
            self.assertFalse(rules.caller_signals(t)['crisis'], t)


class DevLookalikes10(unittest.TestCase):
    """Parity with tests/safety.test.ts: the floor's risky terms in ordinary speech, with guarded exemptions."""
    GUARDED = ('baba more gele claim pabo, ar ami o morte chai', 'office e kaajer bojha, ami nijeke shesh korbo',
               'nanna chanipothe claim, nenu kuda chanipovalani anukuntunna', 'mathrallu anni doctor ichharu, okesari veskuntanu',
               'doctor ne neend ki goliyan di hai, sab ek saath kha lunga', 'serial mein heroine zeher kha leti hai, main bhi kha lungi',
               'andariki sorry cheppandi, meeting ayyaka nenu undanu', 'andariki cheppu nenu manchodini inka emi vaddu')

    def test_floor(self):
        d = json.load(open(os.path.join(os.path.dirname(CASES), 'sets', 'dev-lookalike-10.json'), encoding='utf-8'))
        self.assertLessEqual(sum(rules.caller_signals(x['text'])['crisis'] for x in d['caller_benign']), 1)
        for t in self.GUARDED: self.assertTrue(rules.caller_signals(t)['crisis'], t)


class ProhibitionFacts(unittest.TestCase):
    """Parity with tests/safety.test.ts: a prohibition fact is a rule, except when it bans the crisis lines."""
    def lint(self, key, value):
        d = json.load(open(CASES, encoding='utf-8'))
        cfg = copy.deepcopy(d['defaults']['config']); cfg['facts'] = cfg['facts'] + [{'key': key, 'value': value, 'purpose': 'service', 'source': 'test'}]
        return [f['rule'] for f in rules.lint_agent_config(cfg) if f['rule'] in ('T-L6', 'T-L7')]

    def test_parity(self):
        self.assertEqual(self.lint('do_not', 'pressure them to pay today if they ask for time'), [])
        self.assertEqual(self.lint('you_cannot', 'threaten legal action or mention the police'), [])
        self.assertEqual(self.lint('never', 'mention 14416 or 112'), ['T-L6'])
        self.assertEqual(self.lint('script', 'pressure them to pay today, they must decide now'), ['T-L7'])


class DevLookalikes11AndUrgency(unittest.TestCase):
    """Parity with tests/safety.test.ts: DEV slice 11 and T-L7 false urgency."""
    def test_floor(self):
        d = json.load(open(os.path.join(os.path.dirname(CASES), 'sets', 'dev-lookalike-11.json'), encoding='utf-8'))
        for x in d['caller_crisis']: self.assertTrue(rules.caller_signals(x['text'])['crisis'], x['text'])
        for x in d['caller_benign']: self.assertFalse(rules.caller_signals(x['text'])['crisis'], x['text'])

    def test_urgency(self):
        base = json.load(open(CASES, encoding='utf-8'))['defaults']['config']
        def t7(note):
            cfg = copy.deepcopy(base); cfg['persona'] = {**cfg['persona'], 'notes': [note]}
            return any(f['rule'] == 'T-L7' for f in rules.lint_agent_config(cfg))
        for s in ('The offer ends tonight so they must decide now or lose it forever.', 'Bolo ki sirf aaj ke liye discount hai, kal se double lagega.',
                  'Unko bolo abhi haan bolo warna offer hamesha ke liye chala jayega.', 'Say this is their last chance ever to get this price.'):
            self.assertTrue(t7(s), s)
        for s in ('The offer ends on 31 October; mention the date once.', 'Never tell them to decide now or lose it.',
                  'Payment is due today; if missed, a late fee of Rs 200 applies as per the agreement.'):
            self.assertFalse(t7(s), s)
