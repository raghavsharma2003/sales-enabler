# g5-gemini-paid: verbatim transcription of agent audio clips with gemini-3.5-flash-lite (paid key; ~$0.3/1M input
# tokens), used only to check what was spoken (e.g. whether a TTS style instruction was read aloud). Ledger line per call.
# Usage: python transcribe_check.py LEDGER file1.wav [file2.wav ...]
import base64, json, os, sys, time, requests
SP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad'
def key():
    k = os.environ.get('GEMINI_PAID_KEY')
    if k: return k
    env = dict(l.strip().split('=', 1) for l in open(f'{SP}/vp-gemini-or.env') if '=' in l and not l.startswith('#'))
    return env['GEMINI_PAID_KEY']
M = 'gemini-3.5-flash-lite'
ledger = sys.argv[1]
for f in sys.argv[2:]:
    b = base64.b64encode(open(f, 'rb').read()).decode()
    body = {'contents': [{'parts': [{'inlineData': {'mimeType': 'audio/wav', 'data': b}},
                                    {'text': 'Transcribe this audio verbatim, in the script it is spoken (Devanagari for Hindi, Latin for English). Output only the transcript.'}]}],
            'generationConfig': {'temperature': 0}}
    r = requests.post(f'https://generativelanguage.googleapis.com/v1beta/models/{M}:generateContent', json=body, headers={'x-goog-api-key': key()}, timeout=120)
    d = r.json()
    txt = ''.join(p.get('text', '') for c in d.get('candidates', []) for p in (c.get('content') or {}).get('parts', []))
    um = d.get('usageMetadata', {})
    usd = (um.get('promptTokenCount', 0) * 0.3 + (um.get('candidatesTokenCount', 0) + (um.get('thoughtsTokenCount', 0) or 0)) * 2.5) / 1e6
    with open(ledger, 'a') as lf:
        lf.write(json.dumps({'utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'lane': 'g5-gemini-paid', 'tag': 'transcribe_' + os.path.basename(f),
                             'model': M, 'kind': 'transcribe-check', 'tokens': {'in': um.get('promptTokenCount', 0), 'out': um.get('candidatesTokenCount', 0)}, 'usd': round(usd, 7)}) + '\n')
    print(json.dumps({'file': os.path.basename(f), 'http': r.status_code, 'transcript': txt.strip(), 'usd': round(usd, 6)}, ensure_ascii=False))
