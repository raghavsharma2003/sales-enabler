#!/bin/bash
# usage: rt.sh METHOD PATH OUTDIR NAME [BODYFILE]   -- authorized read/create call with OUR key; key never printed/saved
set -u
ENVF=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/vp-teardown-accounts.env
KEY=$(grep '^RETELL_API_KEY=' "$ENVF" | head -1 | cut -d= -f2- | tr -d "'\"")
M=$1; P=$2; D=$3; N=$4; B=${5:-}
OUT=/home/user/sales-enabler/data/account-phase/retell/$D
mkdir -p "$OUT"
ARGS=(-sS --max-time 60 -X "$M" -H "Authorization: Bearer $KEY" -H "Accept: application/json" -D "$OUT/$N.headers.txt" -o "$OUT/$N.json" -w "%{http_code}")
if [ -n "$B" ]; then ARGS+=(-H "Content-Type: application/json" --data @"$B"); fi
CODE=$(curl "${ARGS[@]}" "https://api.retellai.com$P")
# redact key if echoed anywhere
sed -i "s/$KEY/<REDACTED_KEY>/g" "$OUT/$N.json" "$OUT/$N.headers.txt" 2>/dev/null
echo "$M $P -> $CODE ($(wc -c < "$OUT/$N.json") bytes) $D/$N"
sleep 1.5
