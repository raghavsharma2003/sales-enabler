"""Render caller lines with Azure neural TTS (vp-research-ai-sea, southeastasia).

Usage as a module: synth(ssml, out_wav) -> billed_chars
Reads VP_AI_KEY / VP_AI_REGION from the env file named by VP_AZURE_ENV. Never prints the key.
"""
import os, re, json, urllib.request, time

ENV = os.environ.get('VP_AZURE_ENV', '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/vp-azure.env')


def _env():
    d = {}
    for line in open(ENV):
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            d[k] = v.strip().strip('"')
    return d


_E = _env()
REGION = _E.get('VP_AI_REGION', 'southeastasia')
URL = f'https://{REGION}.tts.speech.microsoft.com/cognitiveservices/v1'
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tts-usage.jsonl')


def billed_chars(ssml: str) -> int:
    # Azure bills the text inside <speak>, excluding most tags; approximate as text with tags stripped.
    return len(re.sub(r'<[^>]+>', '', ssml).strip())


def synth(ssml: str, out_wav: str, fmt='riff-24khz-16bit-mono-pcm', retries=3) -> int:
    req = urllib.request.Request(URL, data=ssml.encode('utf-8'), method='POST', headers={
        'Ocp-Apim-Subscription-Key': _E['VP_AI_KEY'],
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': fmt,
        'User-Agent': 'vp-research-l4b',
    })
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            with open(out_wav, 'wb') as f:
                f.write(data)
            n = billed_chars(ssml)
            with open(LOG, 'a') as f:
                f.write(json.dumps({'ts': time.strftime('%Y-%m-%dT%H:%M:%S'), 'out': os.path.basename(out_wav), 'chars': n}) + '\n')
            return n
        except Exception as e:  # noqa
            if i == retries - 1:
                raise
            time.sleep(2 * (i + 1))
    return 0
