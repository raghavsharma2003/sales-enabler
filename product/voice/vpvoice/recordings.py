# Call recordings a browser can play: GET /v1/recordings/{call_id}?ws=<workspace>&exp=<unix s>&sig=<hex>.
#
# The control plane signs a short-lived link (product/shared/runtime-protocol.ts recordingSignature, the same bytes):
#   sig = hex hmac_sha256(VP_RUNTIME_SECRET, 'vp-recording.v1\n' + call_id + '\n' + workspace_id + '\n' + exp)
# The runtime serves the file only while exp is in the future (and at most MAX_TTL_S ahead, so no long-lived link can be
# minted), only when the signature matches (constant-time compare), and only when the workspace in the link is the one
# the recording was made for (the .json beside each .wav, written when it was saved). Call ids are validated as UUIDs and
# never joined raw, so no path can leave the recordings folder; there is no listing. aiohttp's FileResponse answers Range
# requests (206), so the page can seek.
import hashlib, hmac, json, os, re, time

UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
MAX_TTL_S = 3600
PREFIX = 'vp-recording.v1'


class RecordingError(Exception):
    pass


def _ok_id(v):
    return isinstance(v, str) and bool(UUID.match(v))


def signature(secret, call_id, workspace_id, exp):
    msg = f'{PREFIX}\n{call_id}\n{workspace_id}\n{int(exp)}'.encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def check(secret, call_id, workspace_id, exp, sig, now=None):
    """Raises RecordingError unless the link is valid now. The caller still checks the workspace against the recording."""
    if not secret: raise RecordingError('runtime secret not configured')
    if not _ok_id(call_id) or not _ok_id(workspace_id): raise RecordingError('malformed id')
    if not isinstance(exp, str) or not exp.isascii() or not exp.isdigit() or len(exp) > 12: raise RecordingError('malformed expiry')
    if not isinstance(sig, str) or len(sig) != 64 or not all(c in '0123456789abcdef' for c in sig): raise RecordingError('malformed signature')
    now = time.time() if now is None else now
    if int(exp) <= now: raise RecordingError('link expired')
    if int(exp) > now + MAX_TTL_S: raise RecordingError('link lives too long')
    if not hmac.compare_digest(signature(secret, call_id, workspace_id, exp), sig): raise RecordingError('signature mismatch')


def paths(folder, call_id):
    """The .wav and .json for one call, inside folder. Only a validated UUID is ever joined."""
    if not folder or not _ok_id(call_id): raise RecordingError('no such recording')
    base = os.path.realpath(folder)
    wav, meta = os.path.join(base, f'{call_id}.wav'), os.path.join(base, f'{call_id}.json')
    if os.path.dirname(os.path.realpath(wav)) != base: raise RecordingError('no such recording')
    return wav, meta


def save(folder, call_id, workspace_id, write):
    """Write one recording with write(path) and record whose it is. Returns the uri reported in call.ended."""
    wav, meta = paths(folder, call_id)
    os.makedirs(os.path.dirname(wav), exist_ok=True)
    write(wav)
    with open(meta, 'w', encoding='utf-8') as f: json.dump({'workspaceId': workspace_id, 'callId': call_id}, f)
    return 'file://' + wav


def tone_wav(path, seconds=3.0, rate=16000):
    """A short, soft two-channel tone: devsim's stand-in recording (no microphone or voice in a text call)."""
    import wave
    import numpy as np
    t = np.arange(int(seconds * rate)) / rate
    left = (0.12 * 32767 * np.sin(2 * np.pi * 220 * t)).astype(np.int16)
    right = (0.12 * 32767 * np.sin(2 * np.pi * 330 * t)).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(np.column_stack([left, right]).tobytes())


def handler(secret_of, folder_of):
    """The aiohttp handler. secret_of() and folder_of() are read per request (tests change them)."""
    from aiohttp import web
    async def serve(req):
        cid = req.match_info.get('id', '')
        q = req.query
        try:
            check(secret_of(), cid, q.get('ws', ''), q.get('exp', ''), q.get('sig', ''))
        except RecordingError as e:
            return web.json_response({'error': 'forbidden', 'reason': str(e)}, status=403)
        try:
            wav, meta = paths(folder_of(), cid)
            with open(meta, encoding='utf-8') as f: owner = json.load(f).get('workspaceId')
        except (RecordingError, OSError, ValueError):
            return web.json_response({'error': 'not_found'}, status=404)
        if not isinstance(owner, str) or not hmac.compare_digest(owner, q.get('ws', '')):
            return web.json_response({'error': 'forbidden', 'reason': 'not this workspace\'s recording'}, status=403)
        if not os.path.isfile(wav): return web.json_response({'error': 'not_found'}, status=404)
        return web.FileResponse(wav, headers={'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store',
                                              'X-Content-Type-Options': 'nosniff'})
    return serve
