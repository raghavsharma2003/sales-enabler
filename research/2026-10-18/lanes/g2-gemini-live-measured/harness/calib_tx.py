# Calibrate transcript text tokens per character with countTokens (free endpoint) on a Gemini text model, using the
# actual input/output transcripts of our calls. Output: results/transcript_token_calibration.json
import json, glob, os, sys, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from live_call import load_key
RES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'results')
texts = {'in': [], 'out': []}
for d in sys.argv[1:]:
    for f in glob.glob(os.path.join(d, '*', 'turns.jsonl')):
        if '__fail' in f: continue
        for l in open(f):
            t = json.loads(l)
            if t.get('intx'): texts['in'].append(t['intx'])
            if t.get('outtx'): texts['out'].append(t['outtx'])
res = {}
for model in ['gemini-2.5-flash', 'gemini-3.5-flash-lite']:
    for k, arr in texts.items():
        s = '\n'.join(arr)[:60000]
        r = requests.post(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:countTokens', headers={'x-goog-api-key': load_key()},
                          json={'contents': [{'parts': [{'text': s}]}]}, timeout=60)
        n = r.json().get('totalTokens')
        res[f'{model}:{k}'] = {'chars': len(s), 'tokens': n, 'tok_per_char': round(n / len(s), 4) if n else None, 'status': r.status_code}
tpc = [v['tok_per_char'] for v in res.values() if v['tok_per_char']]
out = {'method': 'countTokens on concatenated real transcripts (input and output) from g2 calls', 'date': '2026-10-18', 'detail': res,
       'tokens_per_char': round(max(tpc), 4) if tpc else 0.5, 'note': 'max over models/directions used (conservative)'}
json.dump(out, open(os.path.join(RES, 'transcript_token_calibration.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))
