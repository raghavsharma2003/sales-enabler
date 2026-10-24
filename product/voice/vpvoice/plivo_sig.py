# Plivo's request signature (X-Plivo-Signature-V3 with X-Plivo-Signature-V3-Nonce) on every Plivo-facing route of the
# runtime: the answer, hang-up, machine, transfer, whisper and inbound callbacks. The algorithm is Plivo's own SDK's
# (plivo-python plivo/utils/signature_v3.py, read by the telephony builder 2026-10-24) and mirrors the control plane's
# server/modules/campaigns/plivo-signature.ts; both are pinned by product/tests/fixtures/plivo-v3-vectors.json.
#   base (GET, or POST without body params) = scheme://host[:port]/path + ('?' + sorted query, when there is one)
#   base (POST with body params)            = scheme://host[:port]/path + '?' + sorted query + ('.' if a query)
#                                             + key1value1key2value2... (keys sorted, a repeated key's values sorted)
#   signature = base64(hmac_sha256(auth token, base + '.' + nonce)); the header may carry several, comma-separated
# The URL is the PUBLIC one Plivo was given (VP_PUBLIC_URL + path + query), never the host the proxy forwarded to.
import base64, hashlib, hmac, time
from urllib.parse import parse_qsl

NONCE_TTL_S = 600


def _multi(pairs):
    m = {}
    for k, v in pairs: m.setdefault(k, []).append(v)
    return m


def base(method, url, params=None):
    """params: {key: value or [values]} from the form body."""
    url = url.split('#')[0]
    head, _, qs = url.partition('?')
    query = _multi(parse_qsl(qs, keep_blank_values=True))
    body = {k: (list(v) if isinstance(v, (list, tuple)) else [v]) for k, v in (params or {}).items()}
    if method.upper() == 'GET':
        for k, v in body.items(): query.setdefault(k, []).extend(v)
    q = '&'.join('&'.join(f'{k}={v}' for v in sorted(query[k])) for k in sorted(query))
    if method.upper() == 'GET' or not body: return f'{head}?{q}' if q else head
    return f"{head}?{q}{'.' if q else ''}" + ''.join(''.join(k + v for v in sorted(body[k])) for k in sorted(body))


def sign(token, b, nonce):
    return base64.b64encode(hmac.new(token.encode(), f'{b}.{nonce}'.encode(), hashlib.sha256).digest()).decode()


def valid(token, method, url, params, nonce, header):
    if not token or not nonce or not header: return False
    want = sign(token, base(method, url, params), nonce).encode()
    return any(hmac.compare_digest(g.strip().encode(), want) for g in header.split(',') if g.strip())


class Nonces:
    """Each nonce is accepted once within NONCE_TTL_S: a captured callback replayed later is refused."""
    def __init__(self, clock=time.time): self.seen = {}; self.clock = clock

    def fresh(self, nonce):
        now = self.clock()
        if len(self.seen) > 5000: self.seen = {k: t for k, t in self.seen.items() if now - t < NONCE_TTL_S}
        t = self.seen.get(nonce)
        if t is not None and now - t < NONCE_TTL_S: return False
        self.seen[nonce] = now
        return True
