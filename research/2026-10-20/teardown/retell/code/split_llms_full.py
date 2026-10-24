"""Split Retell's docs llms-full.txt into one markdown file per page (read-only).

usage: python3 -I split_llms_full.py <llms-full.txt> <out_dir>
Each page in the corpus starts with "# <title>" followed by "Source: <url>".
"""
import os
import re
import sys

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
text = open(src, encoding="utf-8").read()
marks = list(re.finditer(r"^# (.+)\nSource: (https://docs\.retellai\.com/\S+)", text, re.M))
index = []
for i, m in enumerate(marks):
    end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
    url = m.group(2)
    slug = url.replace("https://docs.retellai.com/", "").strip("/").replace("/", "__") or "root"
    path = os.path.join(out, slug + ".md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text[m.start():end])
    index.append((slug, m.group(1), end - m.start()))
with open(os.path.join(out, "_index.tsv"), "w", encoding="utf-8") as f:
    for slug, title, n in index:
        f.write(f"{slug}\t{title}\t{n}\n")
print(len(index), "pages")
