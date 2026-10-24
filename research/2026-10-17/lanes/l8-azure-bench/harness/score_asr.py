# Score the ASR bench (l8-azure-bench, 2026-10-17).
# Indic-safe normalisation (harvest law 29): NFC, lowercase, punctuation/symbols -> space, format chars removed,
# combining marks (\p{M}: matras, virama, anusvara, nukta) KEPT. "lenient" additionally folds nukta and
# chandrabindu->anusvara. WER/CER = summed edits / summed reference length per group (corpus-level), with a
# 1,000-resample utterance bootstrap 95% CI. Code-switched (MUCS) also gets a script-agnostic "skeleton CER":
# Devanagari romanised by a fixed table, both sides reduced to a consonant skeleton, so "स्लाइड" and "slide"
# match. Non-speech: a clip counts as fabricated if the normalised hypothesis has any letter or digit.
# Usage: python score_asr.py MANIFEST ASR_DIR OUT_DIR
import os, sys, json, csv, glob, unicodedata, random, re, collections
import numpy as np

MAN, ASR, OUT = sys.argv[1:4]
man = {r['uid']: r for r in csv.DictReader(open(MAN, encoding='utf-8'))}

def norm(s, lenient=False):
  s = unicodedata.normalize('NFC', s or '').lower()
  out = []
  for ch in s:
    cat = unicodedata.category(ch)
    if cat[0] in 'PS': out.append(' ')
    elif cat == 'Cf': continue
    else: out.append(ch)
  s = ''.join(out)
  if lenient:
    s = unicodedata.normalize('NFD', s).replace('़', '').replace('়', '').replace('ँ', 'ं')
    s = unicodedata.normalize('NFC', s)
  return ' '.join(s.split())

def ed(a, b):
  # Levenshtein distance between sequences
  if len(a) < len(b): a, b = b, a
  prev = list(range(len(b) + 1))
  for i, x in enumerate(a, 1):
    cur = [i]
    for j, y in enumerate(b, 1):
      cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
    prev = cur
  return prev[-1]

# --- script-agnostic skeleton for Hindi-English code-switching ---
DEV = {'क': 'k', 'ख': 'k', 'ग': 'g', 'घ': 'g', 'ङ': 'n', 'च': 'c', 'छ': 'c', 'ज': 'j', 'झ': 'j', 'ञ': 'n', 'ट': 't', 'ठ': 't', 'ड': 'd', 'ढ': 'd', 'ण': 'n',
       'त': 't', 'थ': 't', 'द': 'd', 'ध': 'd', 'न': 'n', 'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'b', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 's',
       'ष': 's', 'स': 's', 'ह': '', 'ळ': 'l', 'क़': 'k', 'ख़': 'k', 'ग़': 'g', 'ज़': 'j', 'ड़': 'r', 'ढ़': 'r', 'फ़': 'f', 'य़': 'y', 'ं': 'n', 'ँ': 'n'}
def skel(s):
  s = unicodedata.normalize('NFC', norm(s))
  out = []
  for ch in s:
    if ch in DEV: out.append(DEV[ch])
    elif 'ऀ' <= ch <= 'ॿ': continue          # vowels, matras, virama, nukta dropped
    else: out.append(ch)
  t = ''.join(out)
  t = re.sub(r'ph', 'f', t); t = re.sub(r'(?<=[a-z])h|^h|\bh', '', t)
  t = t.replace('q', 'k').replace('x', 'ks').replace('w', 'v').replace('z', 'j')
  t = re.sub(r'c(?=[eiy])', 's', t).replace('c', 'k')
  t = re.sub(r'[aeiouy]', '', t)
  t = re.sub(r'(.)\1+', r'\1', t)
  return ' '.join(t.split())

rows = []
for p in sorted(glob.glob(os.path.join(ASR, '*.jsonl'))):
  for l in open(p, encoding='utf-8'):
    try: rows.append(json.loads(l))
    except Exception: pass
print('rows', len(rows))

# per-utterance table
per = []
for r in rows:
  m = man.get(r['uid'])
  if not m: continue
  hyp = r.get('hyp'); err = hyp is None
  ref = m['ref']
  d = {'engine': r['engine'], 'band': r['band'], 'set': m['set'], 'lang': m['lang'], 'uid': r['uid'], 'dur_s': float(m['dur_s']), 'label': m['label'],
       'proc_s': r.get('proc_s'), 'detected': r.get('detected', ''), 'api_error': err, 'hyp': hyp or '', 'ref': ref}
  if m['set'] == 'nonspeech':
    h = norm(hyp)
    d['fabricated'] = (not err) and bool(re.search(r'\w', h))
  else:
    for tag, lenient in (('', False), ('_len', True)):
      rw, hw = norm(ref, lenient).split(), norm(hyp, lenient).split()
      d['w_err' + tag] = ed(rw, hw); d['w_n' + tag] = len(rw)
      rc, hc = norm(ref, lenient).replace(' ', ''), norm(hyp, lenient).replace(' ', '')
      d['c_err' + tag] = ed(list(rc), list(hc)); d['c_n' + tag] = len(rc)
    if m['set'] == 'mucs_hien':
      rs, hs = skel(ref).replace(' ', ''), skel(hyp).replace(' ', '')
      d['s_err'] = ed(list(rs), list(hs)); d['s_n'] = len(rs)
    d['hyp_has_digit'] = bool(re.search(r'\d', hyp or ''))
    d['empty'] = (not err) and not norm(hyp)
  per.append(d)

os.makedirs(OUT, exist_ok=True)
keys = sorted({k for d in per for k in d})
with open(os.path.join(OUT, 'asr_per_utt.csv'), 'w', newline='', encoding='utf-8') as f:
  w = csv.DictWriter(f, fieldnames=keys); w.writeheader(); w.writerows(per)

# utterances where some engine wrote digits (number-format sensitivity)
digit_uids = {d['uid'] for d in per if d.get('hyp_has_digit')}

def boot(errs, ns, B=1000, seed=1):
  errs, ns = np.array(errs, float), np.array(ns, float)
  if len(errs) == 0 or ns.sum() == 0: return (None, None, None)
  rng = np.random.default_rng(seed); idx = rng.integers(0, len(errs), (B, len(errs)))
  bs = errs[idx].sum(1) / np.maximum(ns[idx].sum(1), 1)
  return (errs.sum() / ns.sum(), np.percentile(bs, 2.5), np.percentile(bs, 97.5))

summ = []
groups = collections.defaultdict(list)
for d in per:
  groups[(d['engine'], d['band'], d['set'], d['lang'])].append(d)
for (e, b, s, lg), ds in sorted(groups.items()):
  row = {'engine': e, 'band': b, 'set': s, 'lang': lg, 'n': len(ds), 'api_errors': sum(d['api_error'] for d in ds),
         'audio_min': round(sum(d['dur_s'] for d in ds) / 60, 2),
         'median_proc_s': round(float(np.median([d['proc_s'] for d in ds if d['proc_s'] is not None])), 3),
         'median_rtf': round(float(np.median([d['proc_s'] / d['dur_s'] for d in ds if d['proc_s'] is not None and d['dur_s'] > 0])), 3)}
  if s == 'nonspeech':
    fab = [d for d in ds if d['fabricated']]
    row.update({'fabricated': len(fab), 'fabrication_rate': round(len(fab) / len(ds), 3),
                'fab_examples': ' | '.join(f"{d['label'][:18]}:{d['hyp'][:40]}" for d in fab[:6])})
  else:
    ok = [d for d in ds if not d['api_error']]
    for tag in ('', '_len'):
      v, lo, hi = boot([d['w_err' + tag] for d in ok], [d['w_n' + tag] for d in ok])
      row['wer' + tag] = round(v * 100, 2) if v is not None else None
      if tag == '': row['wer_ci95'] = f'{lo*100:.1f}-{hi*100:.1f}' if v is not None else ''
      v, lo, hi = boot([d['c_err' + tag] for d in ok], [d['c_n' + tag] for d in ok])
      row['cer' + tag] = round(v * 100, 2) if v is not None else None
      if tag == '': row['cer_ci95'] = f'{lo*100:.1f}-{hi*100:.1f}' if v is not None else ''
    nd = [d for d in ok if d['uid'] not in digit_uids]
    v, _, _ = boot([d['w_err'] for d in nd], [d['w_n'] for d in nd])
    row['wer_no_digit_utts'] = round(v * 100, 2) if v is not None else None; row['n_no_digit'] = len(nd)
    if s == 'mucs_hien':
      v, lo, hi = boot([d['s_err'] for d in ok], [d['s_n'] for d in ok])
      row['skeleton_cer'] = round(v * 100, 2); row['skeleton_cer_ci95'] = f'{lo*100:.1f}-{hi*100:.1f}'
    row['empty_hyps'] = sum(d['empty'] for d in ok)
    if e in ('rt_lid', 'mai2', 'fast_llm'):
      exp = {'hi': 'hi', 'ta': 'ta', 'bn': 'bn', 'mr': 'mr', 'te': 'te', 'en': 'en', 'hi-en': 'hi|en'}[lg]
      got = [d['detected'] for d in ok if d['detected']]
      if got:
        hit = sum(any(x.split('-')[0] in exp.split('|') for x in g.split(',') if x) and all(x.split('-')[0] in exp.split('|') + ['en'] for x in g.split(',') if x) for g in got)
        row['lid_correct'] = f'{hit}/{len(got)}'
  summ.append(row)
keys = []
for r in summ:
  for k in r:
    if k not in keys: keys.append(k)
with open(os.path.join(OUT, 'asr_summary.csv'), 'w', newline='', encoding='utf-8') as f:
  w = csv.DictWriter(f, fieldnames=keys); w.writeheader(); w.writerows(summ)
for r in summ:
  print({k: r.get(k) for k in ('engine', 'band', 'set', 'lang', 'n', 'wer', 'wer_ci95', 'cer', 'skeleton_cer', 'fabricated', 'empty_hyps', 'median_rtf', 'lid_correct', 'api_errors')})
