# In-call HTTP tools, runtime half (must-be audit brief 3; contract product/shared/contracts/http-tool.ts): the marker,
# argument checks, the holding line, the result back to the brain as data, figures only from that data, and the
# graceful line on failure. The control plane is a fake runner; no network. Synthetic data only.
import json, unittest
from tests.fixtures import FakeBrain, ticket
from tests.test_sim import call, of, run
from vpvoice import brief, safety, tools

SPEC = {'contract': 1, 'kind': 'http', 'name': 'order_status', 'description': 'Where an order is, when they ask about delivery.',
        'input': {'type': 'object', 'properties': {'order_id': {'type': 'string', 'maxLength': 20}, 'detail': {'type': 'boolean'}}, 'required': ['order_id']},
        'request': {'method': 'GET', 'url': 'https://api.example.test/orders/{order_id}'}, 'auth': None, 'timeoutMs': 2000, 'risk': 'read',
        'result': {'fields': ['status', 'eta', 'balance']}}
OPEN = 'नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ। क्या मैं आशा जी से बात कर रही हूँ?'


def agent_ticket():
    t = ticket(); t['agent']['tools'] = [{'name': 'order_status', 'risk': 'read', 'config': {'spec': SPEC}}, {'name': 'end_call', 'risk': 'A0'}]
    return t


class Runner:
    def __init__(self, answer): self.answer = answer; self.calls = []
    async def __call__(self, cid, name, args): self.calls.append((name, args)); return self.answer


def tool_call(script, lines, answer, runner=True):
    """A sim call whose session has a fake control-plane runner."""
    import asyncio
    from tests.fixtures import components, sink
    from tests.fixtures import Clock
    from vpvoice.session import SimSession
    t = agent_ticket(); s, p = sink(t['conversationId'])
    b = FakeBrain(script); r = Runner(answer)
    sess = SimSession(t, components(brain=b), s, clock=Clock(), env={}, watchdog_s=0.01)
    if runner: sess.run_tool = r
    async def go():
        replies = [await sess.start()]
        for line in lines: replies.append(await sess.caller_says(line))
        await sess.hang_up()
        return replies
    return sess, p, asyncio.run(go()), r, b


class Contract(unittest.TestCase):
    def test_validate_args_like_the_contract(self):
        with self.assertRaisesRegex(tools.ToolArgError, 'order_id: is required'): tools.validate_args(SPEC, {})
        with self.assertRaisesRegex(tools.ToolArgError, 'must be a string'): tools.validate_args(SPEC, {'order_id': 42})
        with self.assertRaisesRegex(tools.ToolArgError, 'not an argument'): tools.validate_args(SPEC, {'order_id': 'A1', 'extra': 1})
        with self.assertRaisesRegex(tools.ToolArgError, 'too long'): tools.validate_args(SPEC, {'order_id': 'A' * 21})
        self.assertEqual(tools.validate_args(SPEC, {'order_id': 'GF2817', 'detail': True}), {'order_id': 'GF2817', 'detail': True})

    def test_marker_and_rules(self):
        m = brief.markers('Ek second. <tool:order_status {"order_id": "GF2817"}>')
        self.assertEqual(m['tool_calls'], [('order_status', '{"order_id": "GF2817"}')]); self.assertEqual(m['tools'], ['order_status'])
        self.assertEqual(brief.spoken('Ek second. <tool:order_status {"order_id": "GF2817"}>').strip(), 'Ek second.')
        rules = brief.marker_rules(agent_ticket()['agent'])
        self.assertIn('order_status(order_id: string, detail: boolean?): Where an order is', rules)
        self.assertIn('<tool:NAME {"arg": value}>', rules)


class OnACall(unittest.TestCase):
    def test_a_tool_runs_and_she_answers_from_its_data(self):
        script = [OPEN, 'Ji, boliye.', 'Ek second, main dekhti hoon. <tool:order_status {"order_id": "GF2817"}>',
                  'Aapka order out for delivery hai, 25 October tak aa jayega.']
        sess, p, replies, r, b = tool_call(script, ['haan ji, main hi hoon', 'mera order kahan hai, GF2817'],
                                           {'ok': True, 'status': 200, 'result': {'status': 'out for delivery', 'eta': '25 October'}})
        self.assertEqual(r.calls, [('order_status', {'order_id': 'GF2817'})])
        self.assertEqual(replies[2], ['Ek second, main dekhti hoon.', 'Aapka order out for delivery hai, 25 October tak aa jayega.'])
        data = [m['content'] for m in b.calls[-1] if 'data from the tool order_status' in (m.get('content') or '')]
        self.assertEqual(len(data), 1); self.assertIn('"status": "out for delivery"', data[0])
        self.assertEqual([(e['name'], e['status']) for e in of(p, 'tool')], [('order_status', 'requested'), ('order_status', 'done')])

    def test_figures_only_from_the_data(self):
        ans = {'ok': True, 'status': 200, 'result': {'balance': '₹1,250'}}
        said = lambda reply: tool_call([OPEN, 'Ji, boliye.', '<tool:order_status {"order_id": "GF2817"}>', reply],
                                       ['haan ji, main hi hoon', 'mera balance kitna hai, order GF2817'], ans)
        sess, p, replies, r, b = said('Aapka balance ₹1,250 hai.')
        self.assertIn('Aapka balance ₹1,250 hai.', replies[2], 'a figure the tool gave passes the door')
        sess, p, replies, r, b = said('Aapka balance ₹9,999 hai.')
        self.assertNotIn('₹9,999', ' '.join(replies[2]), 'a figure from nowhere does not')
        sess, p, replies, r, b = tool_call([OPEN, 'Ji, boliye.', '<tool:order_status {"order_id": "GF2817"}>', 'Aapka balance ₹1,250 hai.'],
                                           ['kaun?', 'mera balance kitna hai, order GF2817'], ans)
        self.assertNotIn('₹1,250', ' '.join(replies[2]), "the tool's figure still waits for identity (RD11)")

    def test_she_said_nothing_so_the_holding_line_is_said(self):
        sess, p, replies, r, b = tool_call([OPEN, 'Ji, boliye.', '<tool:order_status {"order_id": "GF2817"}>', 'Order out for delivery hai.'],
                                           ['haan', 'order GF2817 kahan hai'], {'ok': True, 'status': 200, 'result': {'status': 'out for delivery'}})
        self.assertEqual(replies[2][0], sess.fixed('tool_hold'))

    def test_a_failure_gets_the_graceful_line_and_no_guess(self):
        sess, p, replies, r, b = tool_call([OPEN, 'Ji, boliye.', 'Ek second. <tool:order_status {"order_id": "GF2817"}>', 'SHOULD NOT RUN'],
                                           ['haan', 'order GF2817 kahan hai'], {'ok': False, 'reason': 'the tool took longer than 2000 ms'})
        self.assertEqual(replies[2], ['Ek second.', sess.fixed('tool_failed')])
        self.assertNotIn('SHOULD NOT RUN', ' '.join(replies[2]))
        self.assertEqual([e['status'] for e in of(p, 'tool')], ['requested', 'failed'])

    def test_bad_arguments_never_call_out(self):
        sess, p, replies, r, b = tool_call([OPEN, 'Ji, boliye.', 'Ek second. <tool:order_status {"order": 1}>', 'Ji.'],
                                           ['haan', 'order kahan hai'], {'ok': True, 'result': {}})
        self.assertEqual(r.calls, [])
        self.assertTrue(any('could not answer (args.order: is not an argument' in (m.get('content') or '') for m in sess.conv.history))

    def test_no_runner_means_the_graceful_line(self):
        sess, p, replies, r, b = tool_call([OPEN, 'Ji, boliye.', 'Ek second. <tool:order_status {"order_id": "A1"}>'], ['haan', 'order A1'], {}, runner=False)
        self.assertEqual(replies[2][-1], sess.fixed('tool_failed'))

    def test_secrets_in_arguments_are_redacted_in_events(self):
        sess, p, replies, r, b = tool_call([OPEN, 'Ji, boliye.', 'Ek second. <tool:order_status {"order_id": "4111111111111111"}>', 'Ji.'],
                                           ['haan', 'order'], {'ok': True, 'result': {'status': 'x'}})
        self.assertNotIn('4111111111111111', json.dumps(of(p, 'tool')))


if __name__ == '__main__':
    unittest.main()


class OnAPhoneCall(unittest.TestCase):
    def test_the_cascade_answers_from_the_data(self):
        import asyncio, os
        os.environ['VP_VAD'] = 'energy'
        from tests.fixtures import components, sink
        from tests.test_cascade import FakeEars, FakeLine, FakeVoice, QUIET, feed, wait_until
        from vpvoice.cascade import CascadeSession
        t = agent_ticket(); t['transport'] = {'kind': 'webrtc', 'offerUrl': 'https://control.example/join'}
        ears = {}
        def mk(p, f, e, lang='hi-IN'): ears['e'] = FakeEars(p, f, e); return ears['e']
        b = FakeBrain(['नमस्ते, मैं Suraksha की AI असिस्टेंट हूँ।', 'Ek second. <tool:order_status {"order_id": "GF2817"}>', 'Aapka order out for delivery hai.'])
        comp = components(brain=b, ears=mk, voice=FakeVoice()); s, p = sink(t['conversationId'])
        sess = CascadeSession(t, comp, s, FakeLine(), env={}, watchdog_s=0.02, tick_s=0.01)
        r = Runner({'ok': True, 'status': 200, 'result': {'status': 'out for delivery'}}); sess.run_tool = r
        async def go():
            await sess.start(); await wait_until(lambda: sess.conv.agent_turns == 1)
            await feed(sess, 25); ears['e'].on_f('order GF2817 kahan hai?'); await feed(sess, 60, QUIET)
            await wait_until(lambda: sess.conv.agent_turns == 3, timeout=8)
            await sess.end('caller_hung_up')
        asyncio.run(go())
        self.assertEqual(r.calls, [('order_status', {'order_id': 'GF2817'})])
        self.assertEqual(comp.voice.said[-1], 'Aapka order out for delivery hai.')


class Runner_(unittest.IsolatedAsyncioTestCase):
    async def test_the_runner_posts_signed_to_the_control_plane(self):
        import aiohttp
        from aiohttp import web
        from aiohttp.test_utils import TestServer
        from vpvoice import signing
        got = []
        async def hook(req):
            body = await req.read(); signing.verify('s' * 40, req.headers.get(signing.HEADER), body); got.append(json.loads(body))
            return web.json_response({'ok': True, 'status': 200, 'result': {'status': 'shipped'}})
        app = web.Application(); app.router.add_post('/hooks/runtime/tools', hook)
        srv = TestServer(app); await srv.start_server()
        async with aiohttp.ClientSession() as http:
            r = tools.ControlPlaneRunner(http, str(srv.make_url('')), 's' * 40)
            self.assertEqual(await r('c1', 'order_status', {'order_id': 'A1'}), {'ok': True, 'status': 200, 'result': {'status': 'shipped'}})
            self.assertEqual(got, [{'conversationId': 'c1', 'toolName': 'order_status', 'args': {'order_id': 'A1'}}])
            bad = tools.ControlPlaneRunner(http, str(srv.make_url('/nope')), 's' * 40)
            self.assertFalse((await bad('c1', 'order_status', {}))['ok'])
        await srv.close()
