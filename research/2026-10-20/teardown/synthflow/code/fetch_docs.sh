#!/usr/bin/env bash
# Fetch every page in docs.synthflow.ai/llms.txt as Markdown (Fern serves <page>.md), plus OpenAPI.
# Usage: fetch_docs.sh <llms.txt> <outdir>
set -u
LLMS="$1"; OUT="$2"; mkdir -p "$OUT"
grep -oE 'https://docs\.synthflow\.ai/[^)]+' "$LLMS" | sort -u | while read -r u; do
  slug=$(echo "${u#https://docs.synthflow.ai/}" | sed 's#/#__#g')
  [ -s "$OUT/$slug.md" ] && continue
  code=$(curl -sS -L --max-time 30 -A "Mozilla/5.0 (research; public docs read)" -o "$OUT/$slug.md" -w "%{http_code}" "$u.md")
  echo "$code $u"
  sleep 0.3
done
