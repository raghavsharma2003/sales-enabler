# Count language/dialect requirements in L3's anonymous Apna crawl (6,454 job details, 2026-10-17).
# Usage: python3 -I job_lang.py APNA_JSONL OUT_CSV [OUT_STRUCTURED_CSV]
#
# Round-2 correction (2026-10-17, package r2-model-corrections, critic item A10 / l5 verify.md claim 4):
#   Round 1 matched r"\btamil\b" against the whole page text, which includes Apna's "Work location" and company
#   "Address" blocks ("..., Chennai, Tamil Nadu 600083"). Nearly every Tamil Nadu posting therefore "required Tamil"
#   (Chennai 82.8%, Coimbatore 91.0%). This version
#     1. drops the "Work location" and company "Address" blocks before matching,
#     2. removes place names that contain a language word anywhere in the text (Tamil Nadu, Punjabi Bagh,
#        Bengali Square, Sindhi Camp/Colony, Marwari Katra, Gujarati Samaj),
#     3. stops counting Apna's structured field header "Regional language" as the phrase "regional language",
#     4. separately tabulates Apna's structured "Regional language" field (OUT_STRUCTURED_CSV), which is what the
#        employer actually selected, as the stricter measure.
#   The round-1 script is kept verbatim as job_lang.round1.py.
#   A mention is still not a requirement ("Tamil preferred" counts), so the free-text column is an upper bound.
import sys, json, re, csv, collections

LANGS = ["hindi","english","tamil","telugu","kannada","malayalam","marathi","bengali","bangla","gujarati","punjabi","odia","oriya","assamese","urdu",
         "bhojpuri","maithili","magahi","awadhi","haryanvi","rajasthani","marwari","chhattisgarhi","bundeli","garhwali","kumaoni","konkani","tulu","sindhi","nepali"]
DIALECTS = ("bhojpuri","maithili","magahi","awadhi","haryanvi","rajasthani","marwari","chhattisgarhi","bundeli","garhwali","kumaoni","tulu","konkani")
# 29 Hindi-belt cities in the crawl (UP, Bihar, Jharkhand, MP, Chhattisgarh, Rajasthan, Haryana, Uttarakhand), excluding
# Delhi-NCR. The round-1 report's "about 460" denominator could not be reproduced; the l5 verifier counted 828.
HINDI_BELT = {"Jaipur","Indore","Lucknow","Patna","Bhopal","Kanpur","Prayagraj","Raipur","Ranchi","Meerut","Agra","Varanasi",
              "Dehradun","Gwalior","Jodhpur","Gorakhpur","Ujjain","Ajmer","Jabalpur","Bareilly","Kota","Aligarh","Jamshedpur",
              "Dhanbad","Saharanpur","Udaipur","Bikaner","Bhilai","Panipat"}
PHR = ["local language","regional language","mother tongue","vernacular","native language","any south indian","south indian language","multilingual"]
# Place names that contain a language word (checked against the crawl: tamil nadu 403 postings, the rest 1-3 each).
PLACE_COLLISIONS = [r"tamil\s*nadu", r"punjabi\s+bagh", r"bengali\s+square", r"sindhi\s+camp", r"sindhi\s+colony",
                    r"marwari\s+katra", r"gujarati\s+samaj"]
PLACE_RE = re.compile(r"\b(?:" + "|".join(PLACE_COLLISIONS) + r")\b")
# Section headers that end an address block on Apna detail pages.
STOP_HEADERS = {"department", "role / category", "employment type", "shift", "job requirements", "job posted by", "name",
                "about company", "job role", "experience", "education", "skills", "english level", "regional language",
                "gender", "age limit", "walk-in interview details", "other instructions"}

def strip_address_blocks(text):
    """Drop the lines under 'Work location' and 'Address' headers until the next section header."""
    out, skipping = [], False
    for line in text.split("\n"):
        s = line.strip().lower()
        if s in ("work location", "address"):
            skipping = True; continue
        if skipping and s in STOP_HEADERS:
            skipping = False
        if not skipping:
            out.append(line)
    return "\n".join(out)

def structured_regional(text):
    """Value of Apna's structured 'Regional language' field (the line after the header), lower-cased, or ''."""
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if line.strip().lower() == "regional language" and i + 1 < len(lines):
            return lines[i + 1].strip().lower()
    return ""

def main():
    rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
    tot = len(rows); c = collections.Counter(); cp = collections.Counter(); city_req = collections.defaultdict(collections.Counter)
    city_tot = collections.Counter(); city_any = collections.Counter(); examples = collections.defaultdict(list)
    st_city = collections.defaultdict(collections.Counter); st_c = collections.Counter(); st_city_has = collections.Counter()
    for r in rows:
        raw = r.get("text") or ""
        body = strip_address_blocks(raw)
        # the structured field header is not a phrase the employer wrote
        body_for_phrases = "\n".join(l for l in body.split("\n") if l.strip().lower() != "regional language")
        t = (body_for_phrases + " " + " ".join(r.get("skills") or []) + " " + (r.get("title") or "")).lower()
        t = PLACE_RE.sub(" ", t)
        city = r.get("city") or "?"; city_tot[city] += 1
        found = set()
        for L in LANGS:
            if re.search(r"\b" + L + r"\b", t): found.add(L)
        for L in found:
            c[L] += 1; city_req[city][L] += 1
            if L in DIALECTS and len(examples[L]) < 5:
                i = t.find(L); examples[L].append({"title": r.get("title"), "city": city, "company": r.get("company"),
                                                   "snippet": t[max(0, i - 120):i + 80].replace("\n", " "), "path": r.get("path")})
        for p in PHR:
            if p in t: cp[p] += 1
        regional = found - {"hindi", "english"}
        if regional: c["_any_regional_non_hindi"] += 1; city_any[city] += 1
        sv = structured_regional(raw)
        if sv:
            st_city_has[city] += 1
            for L in LANGS:
                if re.search(r"\b" + L + r"\b", sv): st_c[L] += 1; st_city[city][L] += 1
    print("total job details", tot)
    for k, v in c.most_common(): print(k, v, f"{100*v/tot:.2f}%")
    for k, v in cp.most_common(): print("phrase", k, v)
    print("structured 'Regional language' field present:", sum(st_city_has.values()))
    for k, v in st_c.most_common(): print("structured", k, v)
    hb_n = sum(city_tot[c0] for c0 in HINDI_BELT)
    hb_d = sum(city_req[c0][L] for c0 in HINDI_BELT for L in DIALECTS)
    print(f"hindi-belt cities {len(HINDI_BELT)} (excl. Delhi-NCR): postings {hb_n}; dialect mentions {hb_d}")
    print(json.dumps(examples, ensure_ascii=False, indent=1)[:4000])
    with open(sys.argv[2], "w", newline="") as f:
        w = csv.writer(f); w.writerow(["city", "n_jobs"] + LANGS + ["any_regional_non_hindi"])
        for city, n in city_tot.most_common(40): w.writerow([city, n] + [city_req[city][L] for L in LANGS] + [city_any[city]])
    if len(sys.argv) > 3:
        with open(sys.argv[3], "w", newline="") as f:
            w = csv.writer(f); w.writerow(["city", "n_jobs", "n_with_regional_language_field"] + LANGS)
            for city, n in city_tot.most_common(40): w.writerow([city, n, st_city_has[city]] + [st_city[city][L] for L in LANGS])

if __name__ == "__main__":
    main()
