# The caller-crisis judge behind the deterministic floor, the Python twin of product/shared/safety/judge.ts. The
# contract (prompt, schema, modes, threshold, timeout, events) is data in product/shared/safety/judge.json.
# One rule above all: a judge can only ADD the crisis signal. The floor's verdict always stands; a missing model, a
# timeout, an error or bad output leaves it unchanged. With no VP_LLM_SAFETY_JUDGE_* (or VP_LLM_DEFAULT_*) URL + KEY
# + MODEL, it is never called and spends nothing. Production 'raise' mode only on the owner's go.
import asyncio, json, os, re, time
from . import rules

HERE = os.path.dirname(os.path.abspath(__file__))


def _judge_path():
    for p in (os.environ.get('VP_SAFETY_JUDGE'), os.path.join(HERE, 'judge.json'),
              os.path.join(HERE, '..', '..', 'shared', 'safety', 'judge.json')):
        if p and os.path.exists(p): return p
    raise FileNotFoundError('product/shared/safety/judge.json not found (set VP_SAFETY_JUDGE)')


with open(_judge_path(), encoding='utf-8') as _f:
    JUDGES = json.load(_f)

# Parity guard, as for rules.json: a key this port does not implement fails at import, never half-evaluated.
KNOWN_TOP = {'schema', 'about', 'judges'}
KNOWN_SPEC = {'purpose', 'signal', 'labels', 'llm_purpose', 'llm_env', 'modes', 'mode_default', 'mode_env', 'mode_note', 'threshold', 'opt_out_threshold', 'timeout_ms',
              'max_input_chars', 'max_tokens', 'temperature', 'skip_when_floor_fires', 'input', 'system_prompt', 'user_template',
              'output_schema', 'raise_when', 'never', 'events', 'runtime_note'}
KNOWN_JUDGES = {'caller_crisis'}
KNOWN_EVENTS = {'judge_unavailable', 'judge_raised', 'judge_shadow'}


class JudgeSchemaError(Exception):
    pass


def check_schema(d):
    bad = []
    if d.get('schema') != 1: bad.append(f"schema {d.get('schema')!r}")
    if set(d) - KNOWN_TOP: bad.append(f'judge.json: {sorted(set(d) - KNOWN_TOP)}')
    if set(d.get('judges') or {}) - KNOWN_JUDGES: bad.append(f"judges: {sorted(set(d['judges']) - KNOWN_JUDGES)}")
    for name, spec in (d.get('judges') or {}).items():
        if set(spec) - KNOWN_SPEC: bad.append(f'judges.{name}: {sorted(set(spec) - KNOWN_SPEC)}')
        if set(spec.get('events') or {}) - KNOWN_EVENTS: bad.append(f"judges.{name}.events: {sorted(set(spec['events']) - KNOWN_EVENTS)}")
        if set(spec.get('modes') or []) - {'off', 'shadow', 'raise'}: bad.append(f"judges.{name}.modes {spec['modes']}")
        if spec.get('mode_default') not in (spec.get('modes') or []): bad.append(f"judges.{name}.mode_default {spec.get('mode_default')!r}")
        if not ('{prev}' in spec.get('user_template', '') and '{text}' in spec.get('user_template', '')): bad.append(f'judges.{name}.user_template placeholders')
    if bad: raise JudgeSchemaError('judge.json has semantics vpvoice/judge.py does not implement: ' + '; '.join(bad))


check_schema(JUDGES)
SPEC = JUDGES['judges']['caller_crisis']
PURPOSE = SPEC['llm_purpose']


def config(env=None):
    """The model for the judge's purpose: VP_LLM_SAFETY_JUDGE_* falling back to VP_LLM_DEFAULT_* (server/llm.ts cfg)."""
    env = os.environ if env is None else env
    P = PURPOSE.upper()
    get = lambda k: env.get(f'VP_LLM_{P}_{k}') or env.get(f'VP_LLM_DEFAULT_{k}')
    return {'url': get('URL'), 'key': get('KEY'), 'model': get('MODEL'), 'header': get('KEY_HEADER') or 'authorization',
            'usd_in': get('USD_IN_1M'), 'usd_out': get('USD_OUT_1M')}


def configured(env=None):
    c = config(env)
    return bool(c['url'] and c['key'] and c['model'])


def mode(override=None, env=None):
    env = os.environ if env is None else env
    m = override or env.get(SPEC['mode_env']) or SPEC['mode_default']
    return m if m in SPEC['modes'] else 'off'


def judge_input(text):
    """The text a judge may see: redacted first, whitespace folded, cut to the contract's length."""
    return re.sub(r'\s+', ' ', rules.redact(text or '')).strip()[:SPEC['max_input_chars']]


def parse_verdict(raw):
    t = re.sub(r'^```(?:json)?\s*|\s*```$', '', (raw or '').strip())
    try: o = json.loads(t)
    except (ValueError, TypeError): return None
    if not isinstance(o, dict): return None
    c, conf, kind = o.get('crisis'), o.get('confidence'), o.get('kind')
    if not isinstance(c, bool) or isinstance(conf, bool) or not isinstance(conf, (int, float)) or conf != conf or conf in (float('inf'), float('-inf')): return None
    if conf < 0 or conf > 1 or kind not in ('direct', 'indirect', 'none'): return None
    if (kind == 'none') == c: return None                       # crisis and kind must agree
    v = {'crisis': c, 'confidence': conf, 'kind': kind}
    # opt_out is optional: a malformed or half pair is ignored (it can never raise); the crisis label still counts.
    oo, oc = o.get('opt_out'), o.get('opt_out_confidence')
    if isinstance(oo, bool) and not isinstance(oc, bool) and isinstance(oc, (int, float)) and oc == oc and 0 <= oc <= 1:
        v['optOut'] = {'value': oo, 'confidence': oc}
    return v


def messages(text, prev=''):
    user = SPEC['user_template'].replace('{prev}', judge_input(prev) if prev else '').replace('{text}', judge_input(text))
    return [{'role': 'system', 'content': SPEC['system_prompt']}, {'role': 'user', 'content': user}]


def http_complete(http, env=None):
    """An OpenAI-compatible chat completion, the same request server/llm.ts complete() sends (json mode)."""
    c = config(env)

    async def complete(msgs):
        body = {'model': c['model'], 'messages': msgs, 'max_completion_tokens': SPEC['max_tokens'], 'temperature': SPEC['temperature'],
                'response_format': {'type': 'json_object'}}
        hdr = {'content-type': 'application/json', c['header']: ('Bearer ' + c['key']) if c['header'] == 'authorization' else c['key']}
        async with http.post(c['url'], json=body, headers=hdr) as r:
            if r.status != 200: raise RuntimeError(f'judge model answered {r.status}')
            j = await r.json()
        u = j.get('usage') or {}
        return {'text': ((j.get('choices') or [{}])[0].get('message') or {}).get('content') or '',
                'usage': {'inputTokens': u.get('prompt_tokens', 0) or 0, 'outputTokens': u.get('completion_tokens', 0) or 0}}
    return complete


async def judge_caller_crisis(text, complete=None, prev='', mode_override=None, env=None, timeout_ms=None, assume_configured=False, floor=None, floor_opt_out=None):
    """Read one caller utterance with the floor and, when configured and on, the judge's two labels (crisis, opt_out).
    Raise-only by construction: crisis = floor or raised, opt_out = floor or raised (never in a crisis), and nothing
    here can set either false once the floor said true."""
    sig = rules.caller_signals(text) if floor is None or floor_opt_out is None else None
    floor = sig['crisis'] if floor is None else floor
    floor_opt_out = sig['optOut'] if floor_opt_out is None else floor_opt_out
    m = mode(mode_override, env)
    base = {'crisis': floor, 'floor': floor, 'optOut': floor_opt_out, 'floorOptOut': floor_opt_out, 'optOutEvent': None,
            'mode': m, 'called': False, 'judge': None, 'event': None, 'latencyMs': 0, 'usage': None}
    if m == 'off' or complete is None or not (assume_configured or configured(env)): return base
    if floor and SPEC['skip_when_floor_fires']: return base
    t0 = time.perf_counter()
    try:
        reply = await asyncio.wait_for(complete(messages(text, prev)), (timeout_ms if timeout_ms is not None else SPEC['timeout_ms']) / 1000)
    except asyncio.TimeoutError:
        return {**base, 'called': True, 'latencyMs': (time.perf_counter() - t0) * 1000, 'event': {'type': 'judge_unavailable', 'reason': 'timeout'}}
    except asyncio.CancelledError:
        raise
    except Exception:
        return {**base, 'called': True, 'latencyMs': (time.perf_counter() - t0) * 1000, 'event': {'type': 'judge_unavailable', 'reason': 'error'}}
    latency = (time.perf_counter() - t0) * 1000
    v = parse_verdict(reply.get('text', ''))
    if v is None:
        return {**base, 'called': True, 'latencyMs': latency, 'usage': reply.get('usage'), 'event': {'type': 'judge_unavailable', 'reason': 'bad_output'}}
    says = v['crisis'] and v['kind'] != 'none' and v['confidence'] >= SPEC['threshold']
    raised = says and m == 'raise' and not floor
    event = None if (not says or floor) else {'type': 'judge_raised' if m == 'raise' else 'judge_shadow', 'kind': v['kind'], 'confidence': v['confidence']}
    # Opt-out, the second label: raise-only too, and never while the call is in crisis (a crisis call is never ended).
    crisis_now = floor or raised
    oo = v.get('optOut') or {}
    opt_says = bool(oo.get('value')) and oo.get('confidence', 0) >= SPEC['opt_out_threshold'] and not crisis_now and not says
    opt_raised = opt_says and m == 'raise' and not floor_opt_out
    opt_event = None if (not opt_says or floor_opt_out) else {'type': 'judge_raised' if m == 'raise' else 'judge_shadow', 'confidence': oo['confidence']}
    return {**base, 'crisis': crisis_now, 'optOut': floor_opt_out or opt_raised, 'optOutEvent': opt_event, 'called': True, 'judge': v,
            'event': event, 'latencyMs': latency, 'usage': reply.get('usage')}
