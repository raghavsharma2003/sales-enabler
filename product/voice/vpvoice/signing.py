# The seam's signature (product/shared/runtime-protocol.ts):
#   x-vp-signature: t=<unix_ms>,v1=<hex hmac_sha256(VP_RUNTIME_SECRET, t + '.' + raw_body)>
# Reject when |now - t| > 5 min or the signature does not match (constant-time compare).
import hashlib, hmac, time

HEADER = 'x-vp-signature'
MAX_SKEW_MS = 5 * 60 * 1000


class SignatureError(Exception):
    pass


def _mac(secret: str, t: str, body: bytes) -> str:
    return hmac.new(secret.encode(), t.encode() + b'.' + body, hashlib.sha256).hexdigest()


def sign(secret: str, body: bytes, t_ms: int | None = None) -> str:
    if not secret: raise SignatureError('no secret configured')
    t = str(int(time.time() * 1000) if t_ms is None else int(t_ms))
    return f't={t},v1={_mac(secret, t, body)}'


def verify(secret: str, header: str | None, body: bytes, now_ms: int | None = None, max_skew_ms: int = MAX_SKEW_MS) -> int:
    """Returns the signed timestamp; raises SignatureError otherwise. An empty secret refuses everything."""
    if not secret: raise SignatureError('runtime secret not configured')
    if not header: raise SignatureError('missing signature')
    parts = {}
    for p in header.split(','):
        k, _, v = p.strip().partition('=')
        if k and v: parts.setdefault(k, v)
    t, v1 = parts.get('t'), parts.get('v1')
    if not t or not v1 or not t.isdigit(): raise SignatureError('malformed signature')
    now = int(time.time() * 1000) if now_ms is None else now_ms
    if abs(now - int(t)) > max_skew_ms: raise SignatureError('signature timestamp outside the 5 minute window')
    if not hmac.compare_digest(_mac(secret, t, body), v1.lower()): raise SignatureError('signature mismatch')
    return int(t)
