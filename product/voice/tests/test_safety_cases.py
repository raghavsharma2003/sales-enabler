# The shared safety vectors (product/shared/safety/cases.json) on the Python door, with the semantics cases.json
# states: ctx = defaults.ctx shallow-merged with case.ctx; replyDoor {action, rule?} where 'not_pass' means block or
# replace and rule may be a list; callerSignals {signals, partial?}: listed signals equal, unlisted false unless
# partial; redact {output}; lintAgentConfig {findings}: the multiset of {rule, effect} matches exactly. Skipped while
# the file is absent.
import collections, json, os, unittest
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
