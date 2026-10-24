"""Azure AI Speech fast transcription (api-version 2024-11-15) with an on-disk cache.

transcribe(path, locales) -> dict with 'text', 'phrases' [{start_ms, dur_ms, text, locale, words}], 'duration_ms'
Billing: fast transcription is metered per audio hour (USD 0.36/h list, centralindia, Retail Prices API 2026-10-17).
Usage log: ../data/stt-usage.jsonl (audio seconds per call). Never prints the key.
"""
import hashlib, json, os, sys, time, uuid, urllib.request, wave

ENV = os.environ.get('VP_AZURE_ENV', '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/vp-azure.env')
CACHE = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/r2comp/stt-cache'
HERE = os.path.dirname(os.path.abspath(__file__))
USAGE = os.path.join(HERE, '..', 'data', 'stt-usage.jsonl')
os.makedirs(CACHE, exist_ok=True)


def _env():
    d = {}
    for line in open(ENV):
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            d[k] = v.strip().strip('"')
    return d


_E = _env()
URL = _E['VP_AI_ENDPOINT'].rstrip('/') + '/speechtotext/transcriptions:transcribe?api-version=2024-11-15'


def _dur(path):
    try:
        with wave.open(path) as w:
            return w.getnframes() / w.getframerate()
    except Exception:
        return None


def transcribe(path, locales=('hi-IN', 'en-IN'), phrase_list=None):
    data = open(path, 'rb').read()
    key = hashlib.sha256(data + json.dumps([list(locales), phrase_list]).encode()).hexdigest()[:24]
    cp = os.path.join(CACHE, key + '.json')
    if os.path.exists(cp):
        return json.load(open(cp))
    definition = {'locales': list(locales), 'profanityFilterMode': 'None'}
    if phrase_list:
        definition['phraseList'] = {'phrases': phrase_list}
    b = uuid.uuid4().hex
    body = (f'--{b}\r\nContent-Disposition: form-data; name="definition"\r\nContent-Type: application/json\r\n\r\n'
            f'{json.dumps(definition)}\r\n--{b}\r\nContent-Disposition: form-data; name="audio"; filename="{os.path.basename(path)}"\r\n'
            f'Content-Type: application/octet-stream\r\n\r\n').encode() + data + f'\r\n--{b}--\r\n'.encode()
    req = urllib.request.Request(URL, data=body, method='POST', headers={'Ocp-Apim-Subscription-Key': _E['VP_AI_KEY'], 'Content-Type': f'multipart/form-data; boundary={b}'})
    last = None
    for i in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                res = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            last = f'HTTP {e.code} {e.read()[:300]!r}'
            if e.code in (429, 500, 502, 503):
                time.sleep(3 * (i + 1)); continue
            raise RuntimeError(last)
        except Exception as e:  # noqa
            last = str(e); time.sleep(3 * (i + 1))
    else:
        raise RuntimeError(last)
    out = {'duration_ms': res.get('durationMilliseconds'), 'text': ' '.join(c.get('text', '') for c in res.get('combinedPhrases', [])).strip(), 'phrases': []}
    for ph in res.get('phrases', []):
        out['phrases'].append({'start_ms': ph.get('offsetMilliseconds'), 'dur_ms': ph.get('durationMilliseconds'), 'text': ph.get('text', ''), 'locale': ph.get('locale'),
                               'conf': ph.get('confidence'), 'words': [{'w': w.get('text'), 's': w.get('offsetMilliseconds'), 'd': w.get('durationMilliseconds')} for w in ph.get('words', [])]})
    json.dump(out, open(cp, 'w'), ensure_ascii=False)
    os.makedirs(os.path.dirname(USAGE), exist_ok=True)
    with open(USAGE, 'a') as f:
        f.write(json.dumps({'ts': time.strftime('%Y-%m-%dT%H:%M:%S'), 'file': os.path.basename(path), 'audio_s': _dur(path) or (out['duration_ms'] or 0) / 1000, 'locales': list(locales)}) + '\n')
    return out


if __name__ == '__main__':
    loc = sys.argv[2].split(',') if len(sys.argv) > 2 else ['hi-IN', 'en-IN']
    print(json.dumps(transcribe(sys.argv[1], loc), ensure_ascii=False, indent=1))
