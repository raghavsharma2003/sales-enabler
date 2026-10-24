# In-call HTTP tools, runtime half (must-be audit brief 3; the contract is product/shared/contracts/http-tool.ts). The
# ticket's agent carries each granted tool's spec (agent.tools[].config.spec). The brain asks for one with the marker
# <tool:NAME {"arg": "value"}>; the runtime checks the arguments against the spec (validate_args, a port of the
# contract's validateArgs), says a holding line if she said nothing, and asks the CONTROL PLANE to run it (POST
# /hooks/runtime/tools, signed): the control plane holds the integration's secret and calls out; the runtime never
# sees a secret or a raw response. The answer ({ok, status, result} with only the listed fields, or {ok: false,
# reason}) goes back to the brain as data, and its values join the door's facts for this call, so a figure she says
# from it passes "numbers only from data" (a value with digits waits for identity, as account details do). A failure gets
# her fixed graceful line in the call's language.
import json, logging
from . import safety, signing

log = logging.getLogger('vp.voice.tools')

MAX_PER_REPLY = 2
MAX_PER_CALL = 12
TIMEOUT_S = 4.0                 # the tool's own timeout is at most 2.5 s; this covers the hop to the control plane


class ToolArgError(ValueError):
    pass


def specs(agent):
    """name -> spec for the HTTP tools this call's agent was granted (snapshots in its published version)."""
    out = {}
    for t in (agent or {}).get('tools') or []:
        s = (t.get('config') or {}).get('spec')
        if isinstance(s, dict) and s.get('kind') == 'http' and s.get('name'): out[s['name']] = s
    return out


def validate_args(spec, args):
    """The contract's validateArgs: the clean arguments, or ToolArgError with the reason (never call out on one)."""
    if not isinstance(args, dict): raise ToolArgError('args: must be an object')
    props = (spec.get('input') or {}).get('properties') or {}
    for k in args:
        if k not in props: raise ToolArgError(f'args.{k}: is not an argument of this tool')
    for r in (spec.get('input') or {}).get('required') or []:
        if args.get(r) in (None, ''): raise ToolArgError(f'args.{r}: is required')
    out = {}
    for k, p in props.items():
        v = args.get(k)
        if v is None: continue
        t = p.get('type')
        ok = (isinstance(v, str) if t == 'string' else isinstance(v, bool) if t == 'boolean' else
              isinstance(v, (int, float)) and not isinstance(v, bool) and (t != 'integer' or float(v).is_integer()))
        if not ok: raise ToolArgError(f"args.{k}: must be {'a whole number' if t == 'integer' else 'a ' + str(t)}")
        if p.get('enum') and v not in p['enum']: raise ToolArgError(f"args.{k}: must be one of: {', '.join(map(str, p['enum']))}")
        if isinstance(v, str) and len(v) > (p.get('maxLength') or 200): raise ToolArgError(f'args.{k}: is too long')
        if isinstance(v, (int, float)) and not isinstance(v, bool) and ((p.get('minimum') is not None and v < p['minimum']) or (p.get('maximum') is not None and v > p['maximum'])):
            raise ToolArgError(f'args.{k}: is out of range')
        out[k] = v
    return out


def parse_args(raw):
    """The marker's JSON arguments ('' means none)."""
    if not raw: return {}
    try: v = json.loads(raw)
    except ValueError: raise ToolArgError('args: not valid JSON')
    if not isinstance(v, dict): raise ToolArgError('args: must be an object')
    return v


def rules_line(agent):
    """What the LAST block tells her about her HTTP tools: name, when, arguments (types, required)."""
    sp = specs(agent)
    if not sp: return ''
    parts = []
    for name, s in sp.items():
        props = (s.get('input') or {}).get('properties') or {}; req = set((s.get('input') or {}).get('required') or [])
        args = ', '.join(f"{k}: {p.get('type')}{'' if k in req else '?'}" for k, p in props.items())
        parts.append(f"{name}({args}): {s.get('description', '').strip()}")
    return ('Tools you can use during the call (one at a time; write the marker <tool:NAME {"arg": value}> with JSON arguments, '
            'and say a few words that you are checking; the answer comes back to you as data, never read it out raw): ' + '; '.join(parts) + '.')


class ControlPlaneRunner:
    """Asks the control plane to run a tool: POST {control}/hooks/runtime/tools, signed like the event batches."""
    def __init__(self, http, control_url, secret):
        self.http = http; self.url = (control_url or '').rstrip('/') + '/hooks/runtime/tools'; self.secret = secret

    async def __call__(self, conversation_id, name, args):
        import aiohttp
        body = json.dumps({'conversationId': conversation_id, 'toolName': name, 'args': args}, ensure_ascii=False).encode()
        hdr = {'content-type': 'application/json', signing.HEADER: signing.sign(self.secret, body)}
        try:
            async with self.http.post(self.url, data=body, headers=hdr, timeout=aiohttp.ClientTimeout(total=TIMEOUT_S)) as r:
                if r.status != 200: return {'ok': False, 'reason': f'the control plane answered {r.status}'}
                d = await r.json()
                return d if isinstance(d, dict) else {'ok': False, 'reason': 'a malformed answer'}
        except Exception as e:
            return {'ok': False, 'reason': 'the tool could not be run' + (' in time' if 'Timeout' in type(e).__name__ else '')}


def result_note(name, res):
    """The tool's answer for the brain: data, not lines, and never the raw response."""
    if res.get('ok'):
        return f'<data from the tool {name}, not from the caller; use it in your own words, never read it out as is: ' + json.dumps(res.get('result') or {}, ensure_ascii=False) + '>'
    return f'<the tool {name} could not answer ({res.get("reason") or "unknown"}); do not guess what it would have said>'


def result_facts(name, res):
    """The answer's scalars as door facts, so a figure she says from them passes "numbers only from data". A value with
    digits in it (an amount, a date, a number) is a per-contact detail: it waits for identity (RD11), as account
    details do; a plain status ("out for delivery") does not."""
    return [{'key': f'tool.{name}.{k}', 'value': str(v), 'purpose': 'service', 'source': f'tool:{name}', 'perContact': any(ch.isdigit() for ch in str(v))}
            for k, v in (res.get('result') or {}).items() if v is not None and not isinstance(v, (dict, list))]


def redacted_args(args):
    return {k: (safety.redact(v) if isinstance(v, str) else v) for k, v in args.items()}
