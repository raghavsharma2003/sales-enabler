# CPU ASR mini-benchmark: FLEURS hi_in test (n=60, wideband + 8 kHz mu-law phone band) + non-speech probe (n=30).
# Usage: python asr_bench.py MODEL_KEY DATA_DIR OUT_JSONL
import sys, os, json, time, glob
import torch, soundfile as sf, numpy as np
torch.set_num_threads(4)
key, R, out = sys.argv[1], sys.argv[2], sys.argv[3]
man = [l.rstrip('\n').split('\t') for l in open(os.path.join(R, 'sel/manifest.tsv'))]
items = [('wb', f, ref) for f, ref in man] + [('nb', f, ref) for f, ref in man] + [('probe', os.path.basename(p), '') for p in sorted(glob.glob(os.path.join(R, 'probe/*.wav')))]
def load(cond, f):
    p = os.path.join(R, 'probe' if cond == 'probe' else cond, f)
    a, sr = sf.read(p, dtype='float32')
    if a.ndim > 1: a = a.mean(1)
    assert sr == 16000, (p, sr)
    return a
if key == 'whisper-turbo':
    from transformers import WhisperForConditionalGeneration, WhisperProcessor
    mid = 'openai/whisper-large-v3-turbo'
    proc = WhisperProcessor.from_pretrained(mid); model = WhisperForConditionalGeneration.from_pretrained(mid, torch_dtype=torch.float32).eval()
    def run(a):
        feats = proc(a, sampling_rate=16000, return_tensors='pt').input_features
        with torch.inference_mode():
            ids = model.generate(feats, language='hi', task='transcribe', max_new_tokens=200)
        return proc.batch_decode(ids, skip_special_tokens=True)[0]
elif key == 'qwen3-asr-0.6b':
    from transformers import AutoProcessor, AutoModelForMultimodalLM
    mid = 'Qwen/Qwen3-ASR-0.6B-hf'
    proc = AutoProcessor.from_pretrained(mid); model = AutoModelForMultimodalLM.from_pretrained(mid, torch_dtype=torch.float32).eval()
    def run(a):
        inp = proc.apply_transcription_request(audio=a, language='Hindi')
        inp = inp.to(model.device)
        with torch.inference_mode():
            o = model.generate(**inp, max_new_tokens=200)
        g = o[:, inp['input_ids'].shape[1]:]
        return proc.decode(g, return_format='transcription_only')[0]
else:
    raise SystemExit('unknown model')
CONDS = set(os.environ.get('CONDS', 'wb,nb,probe').split(','))
items = [it for it in items if it[0] in CONDS]
if os.environ.get('PROBE_FIRST'): items = [it for it in items if it[0] == 'probe'] + [it for it in items if it[0] != 'probe']
done = set()
if os.path.exists(out):
    for l in open(out):
        d = json.loads(l); done.add((d['cond'], d['file']))
with open(out, 'a') as fo:
    for cond, f, ref in items:
        if (cond, f) in done: continue
        a = load(cond, f)
        t0 = time.time()
        try: hyp = run(a); err = None
        except Exception as e: hyp = ''; err = str(e)[:300]
        dt = time.time() - t0
        fo.write(json.dumps({'model': key, 'cond': cond, 'file': f, 'ref': ref, 'hyp': hyp, 'audio_s': len(a)/16000, 'proc_s': dt, 'err': err}, ensure_ascii=False) + '\n'); fo.flush()
print('done', key)
