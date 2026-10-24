# CallTicket intake (product/shared/runtime-protocol.ts). The runtime checks what it relies on and refuses the rest:
# a ticket it cannot run exactly as written is refused, never patched up.
import hashlib, re
from . import stacks

BRIEF_MAX_BYTES = 1200       # memory brief limit (agent-config.ts BRIEF_MAX_BYTES)
TRANSPORTS = ('webrtc', 'sip', 'sim', 'sip_inbound')
PHONE = ('sip', 'sip_inbound')             # a carrier's leg: dialled by us (sip) or answered (sip_inbound)


def phone(t):
    return ((t or {}).get('transport') or {}).get('kind') in PHONE
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
    _need(tr.get('kind') in TRANSPORTS, 'bad_transport', 'transport.kind must be webrtc, sip, sip_inbound or sim')
    if tr['kind'] == 'sip':
        _need(all(isinstance(tr.get(k), str) and tr[k] for k in ('to', 'from', 'trunk')), 'bad_transport', 'sip needs to, from and trunk')
    if tr['kind'] == 'sip_inbound':        # from may be '' (an erased caller's number is not passed on)
        _need(all(isinstance(tr.get(k), str) and tr[k] for k in ('to', 'trunk', 'carrierCallId')) and isinstance(tr.get('from', ''), str),
              'bad_transport', 'sip_inbound needs to, trunk and carrierCallId')
        _need(t.get('direction') == 'inbound', 'bad_transport', 'sip_inbound is an inbound call')
    if tr['kind'] == 'webrtc':
        _need(isinstance(tr.get('offerUrl'), str), 'bad_transport', 'webrtc needs offerUrl')

    st = t.get('stack') or {}
    try:
        stack = stacks.resolve(st)                 # a curated id with its exact parts, or 'custom' built from its parts
    except stacks.StackError as e:
        raise TicketError(e.code, str(e))
    agent = t.get('agent') or {}
    _need(agent.get('schema') == 1, 'bad_agent', 'agent.schema must be 1')
    av = agent.get('voice') or {}
    _need(av.get('stackId') == st['id'], 'stack_mismatch', 'agent.voice.stackId differs from ticket.stack.id')
    if st['id'] == stacks.CUSTOM:
        _need(isinstance(av.get('components'), dict) and stacks.parts(av['components']) == stacks.parts(stack['components']),
              'stack_mismatch', "agent.voice.components differ from ticket.stack.components")
    row = ((t.get('contact') or {}).get('rowOverrides') or {})
    asked = av.get('voiceId'); row_voice = 'voice' in (row.get('applied') or [])
    try:
        voice = stacks.resolve_voice(stack, asked)
    except stacks.StackError as e:
        # a row's own voice (intake rowOverrides) is used only if the stack offers it; otherwise the stack's default
        if not row_voice: raise TicketError(e.code, str(e))
        voice = stacks.resolve_voice(stack, None)
    cid = st.get('combinationId')
    allowed = {stacks.combination_id(stack), stacks.combination_id(stack, voice)}
    if row_voice and asked: allowed.add(stacks.combination_id(stack, asked))      # what the control plane computed for the row
    _need(cid in allowed, 'combination_mismatch', 'ticket.stack.combinationId is not the combination this stack and voice run')

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
