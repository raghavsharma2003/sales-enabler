# Test vectors for X-Plivo-Signature-V3, from a transcription of Plivo's own SDK (plivo-python
# plivo/utils/signature_v3.py, read 2026-10-24: get_sorted_query_string, get_sorted_params_string, construct_get_url,
# construct_post_url, get_signature_v3), Python 3 branch only, no SDK install. The control plane's verifier
# (server/modules/campaigns/plivo-signature.ts) and the runtime's must both reproduce every vector.
#   python3 product/scripts/plivo-v3-vectors.py > product/tests/fixtures/plivo-v3-vectors.json
# Synthetic tokens, nonces and 90000000xx numbers only.
import json
from base64 import encodebytes as encode
from hashlib import sha256
from hmac import new as sign
from urllib.parse import parse_qs, urlparse, urlunparse


def get_map_from_query(query):
    return {k: v for k, v in parse_qs(query, keep_blank_values=True).items()}


def get_sorted_query_string(params):
    out = []
    for key in sorted(params.keys()):
        value = params[key]
        if isinstance(value, list): out.append('&'.join('{}={}'.format(key, v) for v in sorted(value)))
        else: out.append('{}={}'.format(key, value))
    return '&'.join(out)


def get_sorted_params_string(params):
    out = []
    for key in sorted(params.keys()):
        value = params[key]
        if isinstance(value, list): out.append(''.join('{}{}'.format(key, v) for v in sorted(value)))
        elif isinstance(value, dict): out.append('{}{}'.format(key, get_sorted_params_string(value)))
        else: out.append('{}{}'.format(key, value))
    return ''.join(out)


def construct_get_url(uri, params, empty_post_params=True):
    p = urlparse(uri.encode('utf-8'))
    base_url = urlunparse((p.scheme.decode(), p.netloc.decode(), p.path.decode(), '', '', '')).encode('utf-8')
    params.update(get_map_from_query(p.query.decode()))
    q = get_sorted_query_string(params)
    if len(q) > 0 or not empty_post_params: base_url = base_url + bytearray('?' + q, 'utf-8')
    if len(q) > 0 and not empty_post_params: base_url = base_url + bytearray('.', 'utf-8')
    return base_url


def construct_post_url(uri, params):
    base_url = construct_get_url(uri, dict(), True if len(params) == 0 else False)
    return base_url + bytearray(get_sorted_params_string(params), 'utf-8')


def signature(token, method, uri, nonce, params):
    base = construct_get_url(uri, dict(params)).decode() if method == 'GET' else construct_post_url(uri, dict(params)).decode()
    return base, encode(sign(token.encode(), (base + '.' + nonce).encode(), sha256).digest()).strip().decode()


CASES = [
    ('POST', 'https://vyakti.example.test/hooks/telephony/plivo/speak/tok123', 'n0nce-1',
     {'CallUUID': 'call-uuid-1', 'From': '+919000000001', 'To': '+919000000011', 'Direction': 'outbound', 'CallStatus': 'in-progress'}),
    ('POST', 'https://vyakti.example.test/hooks/telephony/plivo/hangup?app=vp&z=1', 'n0nce-2',
     {'CallUUID': 'call-uuid-2', 'Duration': '42', 'BillDuration': '60', 'HangupCauseName': 'Normal Hangup', 'HangupCauseCode': '4000', 'HangupSource': 'Callee'}),
    ('POST', 'https://vyakti.example.test:8443/rt/v1/media/sip/answer/cid/hook', 'n0nce-3', {}),
    ('POST', 'https://vyakti.example.test/x?b=2&a=1&a=0', 'n0nce-4', {'Digits': ['9', '1'], 'Event': 'Hangup'}),
    ('GET', 'https://vyakti.example.test/hooks/telephony/plivo/speak/tok123?CallUUID=call-uuid-5&From=%2B919000000001', 'n0nce-5', {}),
    ('POST', 'https://vyakti.example.test/hooks/x', 'n0nce-6', {'Note': 'a b+c&d=é'}),
]

if __name__ == '__main__':
    token = 'synthetic-auth-token-0123456789'
    out = []
    for method, uri, nonce, params in CASES:
        base, sig = signature(token, method, uri, nonce, params)
        out.append({'method': method, 'url': uri, 'nonce': nonce, 'params': params, 'base': base, 'signature': sig})
    print(json.dumps({'source': 'plivo-python plivo/utils/signature_v3.py (transcribed 2026-10-24)', 'token': token, 'vectors': out}, indent=1, ensure_ascii=False))
