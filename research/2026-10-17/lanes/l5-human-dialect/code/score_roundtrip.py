"""Consolidate the l5 ASR round-trip: Devanagari token recall and Bhojpuri marker survival under hi-IN and bho-IN ASR,
CER for Tamil variants. Usage: python3 -I score_roundtrip.py SAMPLES_DIR OUT_CSV
Orthographic/segmentation equivalences (researcher judgement, listed so they can be challenged):
  रउआ~रउवा~रवा, काल्हे~कालहे, कईले~कइले~'कई ले', भरले~'भर ले', अउर~और."""
import sys, json, re, csv, unicodedata
D = sys.argv[1]
st = json.load(open(f"{D}/stimuli-text.json"))["content"]
tts = {(r["text_key"], r["voice"]): r for r in json.load(open(f"{D}/tts-runs.json"))["runs"]}
hi = {(r["text_key"], r["voice"]): r for r in json.load(open(f"{D}/asr-roundtrip.json"))}
bho = {(r["text_key"], r["voice"]): r for r in json.load(open(f"{D}/asr-bho-IN.json"))}
STRICT = ["बोलत", "बानी", "काल्हे", "रउआ", "भरले", "ओही", "खातिर", "कईले", "एह", "बा", "अउर", "शनिचर", "दोसरा"]
EQ = {"रउआ": ["रउआ", "रउवा", "रवा"], "काल्हे": ["काल्हे", "कालहे"], "कईले": ["कईले", "कइले", "कई ले"], "भरले": ["भरले", "भर ले"], "अउर": ["अउर", "और"]}
def toks(s):
    s = unicodedata.normalize("NFC", s.replace("़", ""))  # drop nukta so फ़ोन==फोन
    s = re.sub(r"[\.,\?\!।\"'’:;()\-]", " ", s); return s.split()
def deva(t): return all(0x900 <= ord(c) <= 0x97F for c in t)
def present(x, ht):
    hs = set(ht); j = " ".join(ht)
    return any((" " in v and v in j) or v in hs for v in EQ.get(x, [x]))
def lev(a, b):
    d = list(range(len(b)+1))
    for i, x in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, y in enumerate(b, 1):
            p, d[j] = d[j], min(d[j]+1, d[j-1]+1, p + (x != y))
    return d[len(b)]
rows = []
for (k, v), t in tts.items():
    row = {"text_key": k, "voice": v, "audio_s": t["audio_s"], "words_per_min": t["words_per_min"], "rest_first_4KB_ms": t["ttfb_ms"]}
    if k in ("bhojpuri_mix", "neutral_hinglish"):
        src = [x for x in toks(st[k]) if deva(x)]
        for tag, srcd in (("hiIN", hi), ("bhoIN", bho)):
            r = srcd.get((k, v), {}); txt = (r.get("fixed") or r.get("bho") or {}).get("text")
            if txt is None: row[f"{tag}_deva_recall"] = ""; continue
            ht = toks(txt)
            row[f"{tag}_deva_recall"] = round(sum(present(x, ht) for x in src)/len(src), 3)
            if k == "bhojpuri_mix":
                lost = [m for m in STRICT if not present(m, ht)]
                row[f"{tag}_markers_survived"] = f"{13-len(lost)}/13"; row[f"{tag}_markers_lost"] = " ".join(lost)
        row["lid_hi_en_ta_bn"] = "|".join(hi[(k, v)]["lid"].get("phrase_locales") or [])
        row["lid_hi_bho"] = "|".join(bho.get((k, v), {}).get("lid_hi_bho", {}).get("phrase_locales") or [])
    else:
        txt = hi[(k, v)]["fixed"]["text"]; s = "".join(toks(st[k])); h = "".join(toks(txt))
        row["taIN_cer_vs_source"] = round(lev(list(s), list(h))/len(s), 3)
        row["lid_hi_en_ta_bn"] = "|".join(hi[(k, v)]["lid"].get("phrase_locales") or [])
        miss = [w for w in ("Motors", "Plus", "months") if w in st[k]]
        row["latin_tokens_glued_to_tamil_suffix"] = " ".join(miss)
    rows.append(row)
keys = []
for r in rows:
    for kk in r:
        if kk not in keys: keys.append(kk)
with open(sys.argv[2], "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=keys); w.writeheader(); w.writerows(rows)
for r in rows: print({k: r.get(k) for k in ("text_key", "voice", "hiIN_deva_recall", "bhoIN_deva_recall", "hiIN_markers_survived", "bhoIN_markers_survived", "bhoIN_markers_lost", "taIN_cer_vs_source")})
