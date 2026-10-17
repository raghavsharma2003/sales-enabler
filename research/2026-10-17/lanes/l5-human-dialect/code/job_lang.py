# Count language/dialect requirements in L3's anonymous Apna crawl (6,454 job details, 2026-10-17). Usage: python3 -I job_lang.py APNA_JSONL OUT_CSV
import sys, json, re, csv, collections
LANGS = ["hindi","english","tamil","telugu","kannada","malayalam","marathi","bengali","bangla","gujarati","punjabi","odia","oriya","assamese","urdu",
         "bhojpuri","maithili","magahi","awadhi","haryanvi","rajasthani","marwari","chhattisgarhi","bundeli","garhwali","kumaoni","konkani","tulu","sindhi","nepali"]
PHR = ["local language","regional language","mother tongue","vernacular","native language","any south indian","south indian language","multilingual"]
rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
tot = len(rows); c = collections.Counter(); cp = collections.Counter(); city_req = collections.defaultdict(collections.Counter); city_tot = collections.Counter()
examples = collections.defaultdict(list)
for r in rows:
    t = ((r.get("text") or "") + " " + " ".join(r.get("skills") or []) + " " + (r.get("title") or "")).lower()
    city = r.get("city") or "?"; city_tot[city] += 1
    found = set()
    for L in LANGS:
        if re.search(r"\b" + L + r"\b", t): found.add(L)
    for L in found:
        c[L] += 1; city_req[city][L] += 1
        if L in ("bhojpuri","maithili","magahi","awadhi","haryanvi","rajasthani","marwari","chhattisgarhi","bundeli","garhwali","kumaoni","tulu","konkani") and len(examples[L]) < 5:
            i = t.find(L); examples[L].append({"title": r.get("title"), "city": city, "company": r.get("company"), "snippet": t[max(0,i-120):i+80].replace("\n"," "), "path": r.get("path")})
    for p in PHR:
        if p in t: cp[p] += 1
    regional = found - {"hindi","english"}
    if regional: c["_any_regional_non_hindi"] += 1
print("total job details", tot)
for k, v in c.most_common(): print(k, v, f"{100*v/tot:.2f}%")
for k, v in cp.most_common(): print("phrase", k, v)
print(json.dumps(examples, ensure_ascii=False, indent=1)[:4000])
with open(sys.argv[2], "w", newline="") as f:
    w = csv.writer(f); w.writerow(["city","n_jobs"] + LANGS)
    for city, n in city_tot.most_common(40): w.writerow([city, n] + [city_req[city][L] for L in LANGS])
