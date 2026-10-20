"""Build a dated changelog table from the per-date Fern changelog pages (docs-md/changelog__YYYY__M__D.md).
Usage: python3 -I changelog.py <docs-md dir> <out.csv>"""
import csv, glob, os, re, sys
rows = []
for f in sorted(glob.glob(os.path.join(sys.argv[1], "changelog__*.md"))):
    m = re.search(r"changelog__(\d{4})__(\d+)__(\d+)\.md$", f)
    if not m:
        continue
    date = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    txt = open(f, encoding="utf-8").read()
    titles = re.findall(r"^#{1,3} (.+)$", txt, re.M)
    subs = re.findall(r"^> (?!For a complete)(.+)$", txt, re.M)
    body = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", txt)
    body = re.sub(r"^>.*$", "", body, flags=re.M)
    body = re.sub(r"^#.*$", "", body, flags=re.M)
    body = re.sub(r"\s+", " ", body).strip()
    rows.append({"date": date, "titles": " | ".join(titles), "subtitle": " | ".join(subs)[:400],
                 "first_para": body[:500], "file": os.path.basename(f),
                 "url": f"https://docs.synthflow.ai/changelog/{m.group(1)}/{int(m.group(2))}/{int(m.group(3))}"})
rows.sort(key=lambda r: r["date"])
with open(sys.argv[2], "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)
print(len(rows), "entries")
