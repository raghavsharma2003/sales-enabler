# CallTicket intake (product/shared/runtime-protocol.ts). The runtime checks what it relies on and refuses the rest:
# a ticket it cannot run exactly as written is refused, never patched up.
import hashlib, re
from . import stacks

BRIEF_MAX_BYTES = 1200       # memory brief limit (agent-config.ts BRIEF_MAX_BYTES)
TRANSPORTS = ('webrtc', 'sip', 'sim')
MEMORY_STATUS = ('loaded', 'none', 'not_loaded_timeout', 'disabled')
HEX64 = re.compile(r'^(sha256:)?[0-9a-f]{64}$')
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.I)     # as shared/validate.ts uuid()


class TicketError(Exception):
    def __init__(self, code, message, status=422):
        super().__init__(message); self.code = code; self.status = status


def _need(cond, code, msg):
    if not cond: raise TicketError(code, msg)


def validate(t):
    """Returns (stack, voice_name) for a ticket the runtime can run; raises TicketError otherwise."""
    _need(isinstance(t, dict), 'bad_ticket', 'ticket must be a JSON object')
    _need(t.get('protocol') == 1, 'bad_protocol', 'protocol must be 1')
    for k in ('conversationId', 'workspaceId'):
        _need(isinstance(t.get(k), str) and 0 < len(t[k]) <= 128, 'bad_ticket', f'{k} is required')
    # the control plane mints it from conversation.id, and ingest refuses any batch whose id is not a uuid: a non-uuid
    # id is a bug or a forged ticket, refused before the call opens rather than losing every event to a 422
    _need(UUID.fullmatch(t['conversationId']) is not None, 'bad_ticket', 'conversationId must be a uuid')
    _need(t.get('direction') in ('outbound', 'inbound'), 'bad_ticket', 'direction must be outbound or inbound')
    _need(isinstance(t.get('test'), bool), 'bad_ticket', 'test must be a boolean')
    tr = t.get('transport') or {}
    _need(tr.get('kind') in TRANSPORTS, 'bad_transport', 'transport.kind must be webrtc, sip or sim')
    if tr['kind'] == 'sip':
        _need(all(isinstance(tr.get(k), str) and tr[k] for k in ('to', 'from', 'trunk')), 'bad_transport', 'sip needs to, from and trunk')
    if tr['kind'] == 'webrtc':
        _need(isinstance(tr.get('offerUrl'), str), 'bad_transport', 'webrtc needs offerUrl')

    st = t.get('stack') or {}
    try:
        stack = stacks.require_stack(st.get('id'))
    except stacks.StackError as e:
        raise TicketError(e.code, str(e))
    agent = t.get('agent') or {}
    _need(agent.get('schema') == 1, 'bad_agent', 'agent.schema must be 1')
    _need((agent.get('voice') or {}).get('stackId') == st['id'], 'stack_mismatch', 'agent.voice.stackId differs from ticket.stack.id')
    try:
        voice = stacks.resolve_voice(st['id'], (agent.get('voice') or {}).get('voiceId'))
    except stacks.StackError as e:
        raise TicketError(e.code, str(e))
    cid = st.get('combinationId')
    _need(cid in (stacks.combination_id(st['id']), stacks.combination_id(st['id'], voice)), 'combination_mismatch',
          'ticket.stack.combinationId is not the combination this stack and voice run')

    b = t.get('brief') or {}
    text = b.get('text')
    _need(isinstance(text, str) and text.strip(), 'bad_brief', 'brief.text is required (compiled by the control plane)')
    raw = text.encode('utf-8')
    _need(b.get('bytes') == len(raw), 'bad_brief', 'brief.bytes does not match the text')
    h = str(b.get('hash') or '')
    _need(HEX64.match(h) is not None and h.split(':')[-1] == hashlib.sha256(raw).hexdigest(), 'bad_brief', 'brief.hash is not the sha256 of the text')

    c = t.get('contact') or {}
    _need(isinstance(c.get('displayName', ''), str), 'bad_contact', 'contact.displayName must be text')
    _need(isinstance(c.get('facts', {}), dict), 'bad_contact', 'contact.facts must be an object')
    _need(c.get('memoryStatus') in MEMORY_STATUS, 'bad_contact', 'contact.memoryStatus is required')
    mem = c.get('memoryBrief', '')
    _need(isinstance(mem, str) and len(mem.encode('utf-8')) <= BRIEF_MAX_BYTES, 'bad_memory', 'contact.memoryBrief is over 1200 bytes')

    lim = t.get('limits') or {}
    for k in ('maxDurationS', 'maxCostInrMilli'):
        _need(isinstance(lim.get(k), int) and not isinstance(lim.get(k), bool) and lim[k] > 0, 'bad_limits', f'limits.{k} must be a positive integer')
    return stack, voice


def memory_block(ticket):
    """The memory brief exactly as the memory module compiled it, or '' when it is not to be used."""
    c = ticket.get('contact') or {}
    if c.get('memoryStatus') != 'loaded': return ''
    return c.get('memoryBrief') or ''
