# R13 sample QA, offline (sandbox): word and character error of each clip's Azure Speech transcript (qa.json, from
# render.sh on the VM) against the manifest's text (vpvoice.samples.TEXT), plus the product's own checks on what was
# heard: safety.affirms_ai (the AI disclosure) and names.repair against "Asha" (no wrong name).
#   cd product/voice && python3 ../../research/2026-10-24/samples/ops/asr_wer.py QA_JSON CLIP_DIR > asr-wer.json
# Normalisation: punctuation removed, words split on spaces. "wer_raw" compares as is. "wer_ai_translit" reads the
# reference "AI" as "एआई" (hi-IN ASR writes the English letters in Devanagari). "cer_nospace_ai_translit" also ignores
# word spacing ("आप से" vs "आपसे" are the same spoken words). Numbers use the lexical form ("दो", not "2").
import hashlib, json, os, re, sys
sys.path.insert(0, os.getcwd())
from vpvoice import names, safety, samples
qa = json.load(open(sys.argv[1], encoding='utf-8')); clips = sys.argv[2]
def toks(s): return re.sub(r'[।,?.!…—\-"\']+', ' ', s or '').split()
def lev(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, y in enumerate(b, 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (x != y))
    return d[len(b)]
ref = toks(samples.TEXT); refn = ['एआई' if w == 'AI' else w for w in ref]
out = {'text': samples.TEXT, 'ref_words': len(ref), 'clips': {}}
for f, r in sorted(qa['clips'].items()):
    hyp = toks(r['asr']['lexical']); disp = r['asr']['display'] or ''
    a, b = ''.join(refn), ''.join(hyp)
    out['clips'][f] = {
        'asr_display': disp, 'asr_lexical': r['asr']['lexical'], 'asr_confidence': r['asr']['confidence'],
        'word_errors_raw': lev(ref, hyp), 'wer_raw': round(lev(ref, hyp) / len(ref), 3),
        'word_errors_ai_translit': lev(refn, hyp), 'wer_ai_translit': round(lev(refn, hyp) / len(refn), 3),
        'cer_nospace_ai_translit': round(lev(list(a), list(b)) / len(a), 3),
        'disclosure_heard_affirms_ai': bool(safety.affirms_ai(disp)), 'asha_heard': 'आशा' in disp,
        'name_repairs_vs_asha': names.repair(disp, 'Asha')[1],
        'sha256': hashlib.sha256(open(os.path.join(clips, f), 'rb').read()).hexdigest()}
json.dump(out, sys.stdout, ensure_ascii=False, indent=1); print()
