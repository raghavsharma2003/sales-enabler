# g3: Azure fast transcription (centralindia, g3-cin key read via ARM listKeys at runtime) for TTS round-trip checks.
import sys, json, requests
sys.argv, files = sys.argv[:1], sys.argv[1:]
import vm_ops
K = vm_ops.acct_key('g3-cin')
def transcribe(path, locales=('hi-IN', 'en-IN')):
  r = requests.post('https://centralindia.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15', headers={'Ocp-Apim-Subscription-Key': K},
                    files={'audio': open(path, 'rb'), 'definition': (None, json.dumps({'locales': list(locales)}))}, timeout=120)
  d = r.json(); return ' '.join(p['text'] for p in d.get('combinedPhrases', [])), d.get('durationMilliseconds')
if __name__ == '__main__':
  for f in files: print(f.split('/')[-1], '|', *transcribe(f))
