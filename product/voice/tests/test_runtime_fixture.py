# One source, both doors (as rules.json / cases.json): representative sim calls produce every RuntimeEvent type the
# runtime sends, including all three judge outcomes. The batches are written to tests/vectors/runtime_events.json and
#   - product/tests/voice-runtime-events.test.ts runs the committed fixture through calls' real validateRuntimeBatch;
#   - this file checks the runtime still produces what the fixture holds, and (when node + tsx are installed) runs the
#     live batches through the same validator.
# The fixture lives in tests/vectors/, not tests/data/: the root .gitignore ignores every data/ (it protects private
# files such as data/blueprint/), which once kept this file out of a commit.
# Regenerate after an intended change: VP_WRITE_FIXTURES=1 python -m unittest tests.test_runtime_fixture
import asyncio, json, os, shutil, subprocess, unittest
from tests.fixtures import FakeBrain, components, sink, ticket
from tests.test_judge import DISCLOSED, ENV_ON, INDIRECT, OPTOUT_MISSED, both, fake, verdict

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(HERE, 'vectors', 'runtime_events.json')     # tests/fixtures.py is the helpers module
PRODUCT = os.path.abspath(os.path.join(HERE, '..', '..'))
AT = '2026-10-21T00:00:00.000Z'
CALLS = [
    # (name, judge mode, judge reply, brain script, caller lines)
    ('goal_tool_hangup', 'off', None,
     ['नमस्ते, Suraksha की AI असिस्टेंट Riya बोल रही हूँ, क्या मेरी बात Asha जी से हो रही है?', 'जी, renewal 2 November को है।',
      'ठीक है, मैं link भेज देती हूँ। <goal:renewal_intent=link> <tool:send_whatsapp_link>', 'बहुत शुक्रिया Asha जी, अपना ख्याल रखिए, bye! <end_call>'],
     ['हाँ जी, बोलिए', 'mera OTP hai 4 8 2 9 1 7', 'अच्छा, link भेज दो', 'ठीक है, thank you']),
    ('judge_raised', 'raise', verdict(True, 0.8, 'indirect'), [DISCLOSED, 'Achha, waise aapka renewal 2 November ko hai.', 'Main yahin hoon.'],
     [INDIRECT, 'pata nahi']),
    ('judge_shadow', 'shadow', verdict(True, 0.9, 'indirect'), [DISCLOSED, 'Achha, waise aapka renewal 2 November ko hai.'], [INDIRECT]),
    ('judge_unavailable', 'raise', 'I think the caller may be sad.', [DISCLOSED, 'Achha, waise aapka renewal 2 November ko hai.'], [INDIRECT]),
    ('opt_out_raised', 'raise', both(False, 0.05, 'none', True, 0.9), [DISCLOSED, 'Achha, waise aapka renewal 2 November ko hai.'], [OPTOUT_MISSED]),
    ('opt_out_shadow', 'shadow', both(False, 0.05, 'none', True, 0.9), [DISCLOSED, 'Achha, waise aapka renewal 2 November ko hai.'], [OPTOUT_MISSED]),
    ('human_hand_off', 'off', None, [DISCLOSED], ['mujhe dobara call mat karna, kisi insaan se baat karao']),
]
LIVE = ('supervisor_live', [DISCLOSED, 'Ji, aapka renewal 2 November ko hai.'], ['haan ji, boliye', 'achha'])


def run_calls():
    from vpvoice.session import SimSession
    out = {}
    for i, (name, mode, reply, script, lines) in enumerate(CALLS):
        t = ticket(); t['conversationId'] = f'0b6f6e1a-1c2d-4e5f-8a9b-{i + 1:012d}'
        s, p = sink(t['conversationId'])
        comp = components(brain=FakeBrain(script))
        env = {}
        if reply is not None:
            comp.judge_complete, _ = fake(reply); env = {**ENV_ON, 'VP_SAFETY_JUDGE_MODE': mode}
        async def go():
            sess = SimSession(t, comp, s, env=env, watchdog_s=0.01)
            await sess.start()
            for line in lines:
                if sess.ended: break
                await sess.caller_says(line)
            if not sess.ended: await sess.hang_up()
        asyncio.run(go())
        out[name] = [json.loads(b) for b in p.bodies]
    out[LIVE[0]] = live_call(len(CALLS) + 1)
    return out


def live_call(i):
    """A supervisor listens, whispers, then takes over; the member hangs up."""
    from vpvoice.session import SimSession
    name, script, lines = LIVE
    t = ticket(); t['conversationId'] = f'0b6f6e1a-1c2d-4e5f-8a9b-{i:012d}'
    s, p = sink(t['conversationId'])
    async def go():
        sess = SimSession(t, components(brain=FakeBrain(script)), s, env={}, watchdog_s=0.01)
        await sess.start()
        async def listener(b): pass
        sess.listener_added(listener)
        sess.whisper('renewal date pehle batao')
        await sess.caller_says(lines[0])
        sess.listener_removed(listener)
        await sess.takeover('0b6f6e1a-1c2d-4e5f-8a9b-0000000000aa')
        await sess.caller_says(lines[1])
        await sess.end('handed_off')
    asyncio.run(go())
    return [json.loads(b) for b in p.bodies]


ZERO = {'latencyMs': 0, 'startMs': 0, 'endMs': 0, 'atMs': 0, 'durationS': 0.0, 'at_ms': 0}


def normalise(obj):
    if isinstance(obj, dict):
        return {k: (AT if k == 'at' else ZERO[k] if k in ZERO else normalise(v)) for k, v in obj.items()}
    if isinstance(obj, list): return [normalise(x) for x in obj]
    return obj


def signature(calls):
    """Order-insensitive: background judge events may interleave differently from run to run."""
    return {name: sorted(json.dumps({k: v for k, v in e.items() if k != 'seq'}, sort_keys=True, ensure_ascii=False)
                         for b in batches for e in normalise(b)['events']) for name, batches in calls.items()}


def node_validator():
    if not shutil.which('node'): return None
    if not any(os.path.isdir(os.path.join(d, 'node_modules', 'tsx')) for d in (PRODUCT, os.path.dirname(PRODUCT))): return None
    return ['node', '--import', 'tsx', '--input-type=module', '-e',
            "const m = await import('./server/modules/calls/ingest.ts'); const v = (m.default ?? m).validateRuntimeBatch;"
            " for (const b of JSON.parse(process.argv[1])) v(b);"]


class RuntimeEventsFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.calls = run_calls()
        if os.environ.get('VP_WRITE_FIXTURES') == '1':
            with open(FIXTURE, 'w', encoding='utf-8') as f:
                json.dump({name: [normalise(b) for b in batches] for name, batches in cls.calls.items()}, f, ensure_ascii=False, indent=1)
                f.write('\n')

    def test_every_event_type_and_judge_outcome_is_covered(self):
        events = [e for batches in self.calls.values() for b in batches for e in b['events']]
        self.assertEqual({e['type'] for e in events}, {'call.started', 'turn', 'cost', 'safety', 'moment', 'tool', 'hand_off', 'judge', 'call.ended'})
        self.assertEqual({e['outcome'] for e in events if e['type'] == 'judge'}, {'raised', 'shadow', 'unavailable'})
        self.assertEqual({e['outcome'] for e in events if e['type'] == 'judge' and e.get('label') == 'opt_out'}, {'raised', 'shadow'})
        live = {e['kind'] for e in events if e['type'] == 'moment'} & {'live_listen_started', 'live_listen_ended', 'whisper', 'takeover'}
        self.assertEqual(live, {'live_listen_started', 'live_listen_ended', 'whisper', 'takeover'})
        self.assertTrue(all(not e.get('note') for e in events if e['type'] == 'moment' and e['kind'] == 'whisper'), 'a whisper moment never carries it')

    def test_runtime_still_produces_the_committed_fixture(self):
        with open(FIXTURE, encoding='utf-8') as f: committed = json.load(f)
        self.assertEqual(signature(self.calls), signature(committed),
                         'runtime output changed: if intended, regenerate with VP_WRITE_FIXTURES=1 and commit the fixture')

    def test_live_batches_pass_calls_real_validator(self):
        cmd = node_validator()
        if cmd is None: self.skipTest('node + tsx not installed (product/tests/voice-runtime-events.test.ts checks the fixture in CI)')
        for name, batches in self.calls.items():
            r = subprocess.run(cmd + [json.dumps(batches, ensure_ascii=False)], cwd=PRODUCT, capture_output=True, text=True, timeout=120)
            self.assertEqual(r.returncode, 0, f'{name}: calls/ingest.ts refused a batch: {r.stderr[-800:]}')


if __name__ == '__main__':
    unittest.main()
