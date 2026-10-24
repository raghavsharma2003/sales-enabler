#!/usr/bin/env bash
# Usage: fetch.sh <url> <relative-out-path under data/teardown/elevenlabs> [extra curl args]
# Saves a public URL and appends {path,url,fetched_at,http_code,bytes} to fetchlog.jsonl (for manifest.csv).
set -u
ROOT=/home/user/sales-enabler/data/teardown/elevenlabs
LOG=$ROOT/_fetchlog.jsonl
url="$1"; rel="$2"; shift 2
out="$ROOT/$rel"; mkdir -p "$(dirname "$out")"
code=$(curl -sS -L --compressed -m 90 -A 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' -o "$out" -w '%{http_code}' "$@" "$url")
bytes=$(stat -c %s "$out" 2>/dev/null || echo 0)
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"path":"data/teardown/elevenlabs/%s","url":"%s","fetched_at":"%s","http":"%s","bytes":%s}\n' "$rel" "$url" "$ts" "$code" "$bytes" >> "$LOG"
echo "$code $bytes $rel"
