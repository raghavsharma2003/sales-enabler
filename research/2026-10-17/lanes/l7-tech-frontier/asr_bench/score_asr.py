#!/usr/bin/env python3
"""Score the CPU ASR mini-benchmark (lane l7, 2026-10-17).

Data: FLEURS hi_in test (google/fleurs, CC-BY-4.0), 20 utterances sampled with seed 20261017
(one per sentence id), in two conditions: 'wb' = 16 kHz original; 'nb' = 300-3400 Hz band-pass,
8 kHz mu-law, resampled to 16 kHz (a phone-channel proxy). Plus 30 non-speech probes (silence,
white/brown noise, mains hum, ringback-like tone, reversed-speech babble; 4 s each).
Runner: asr_bench.py (CPU, fp32, transformers 5.20.1, torch 2.14.1+cpu), language forced to Hindi.

Normalisation: NFC; strip punctuation and symbols but KEEP combining marks (\\p{M}) - harvest law 29;
collapse whitespace. Danda (U+0964/0965) removed. WER and CER via jiwer (corpus level).
A probe counts as a fabrication when the hypothesis has >= 1 token after normalisation.
Usage: python score_asr.py RESULTS_DIR OUT_CSV
"""
import sys, json, glob, os, unicodedata, regex as re
import jiwer

def norm(t):
    t = unicodedata.normalize('NFC', t or '')
    t = t.replace('।', ' ').replace('॥', ' ')
    t = re.sub(r'[^\p{L}\p{M}\p{N}\s]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip().lower()

R, out = sys.argv[1], sys.argv[2]
rows = []
for f in sorted(glob.glob(os.path.join(R, 'res_*.jsonl'))):
    recs, seen = [], set()
    for l in open(f):
        r = json.loads(l)
        if (r['cond'], r['file']) in seen: continue   # parallel/resumed runs can duplicate a row
        seen.add((r['cond'], r['file'])); recs.append(r)
    model = recs[0]['model'] if recs else os.path.basename(f)
    man = {l.split('\t')[0] for l in open(os.path.join(R, 'sel/manifest.tsv'))}
    for cond in ('wb', 'nb'):
        rs = [r for r in recs if r['cond'] == cond and r['file'] in man and not r['err']]
        if not rs: continue
        refs = [norm(r['ref']) for r in rs]; hyps = [norm(r['hyp']) for r in rs]
        wer = jiwer.wer(refs, hyps); cer = jiwer.cer(refs, hyps)
        rtf = sum(r['proc_s'] for r in rs) / sum(r['audio_s'] for r in rs)
        rows.append([model, cond, len(rs), round(wer * 100, 1), round(cer * 100, 1), round(rtf, 2), ''])
    ps = [r for r in recs if r['cond'] == 'probe' and not r['err']]
    if ps:
        fab = [r for r in ps if norm(r['hyp'])]
        ex = '; '.join(sorted({f"{r['file'].split('_')[0]}:{norm(r['hyp'])[:30]}" for r in fab})[:6])
        rows.append([model, 'non-speech probe', len(ps), '', '', '', f'{len(fab)}/{len(ps)} fabricated; e.g. {ex}'])
with open(out, 'w') as fo:
    fo.write('model,condition,n,wer_pct,cer_pct,cpu_rtf,note\n')
    for r in rows:
        fo.write(','.join(str(x).replace(',', ';') for x in r) + '\n')
print(open(out).read())
