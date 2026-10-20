#!/bin/bash
# usage: vapi_probe.sh METHOD PATH OUTNAME [JSON_BODY]
set -u
set -a; source /tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/vp-teardown-accounts.env; set +a
OUT=${OUTDIR:-/home/user/sales-enabler/data/account-phase/vapi/api-reads2}
M="$1"; P="$2"; N="$3"; B="${4:-}"
args=(-sS -m 30 -X "$M" -H "Authorization: Bearer $VAPI_API_KEY" -D "$OUT/$N.headers.txt" -o "$OUT/$N.json" -w "%{http_code}")
if [ -n "$B" ]; then args+=(-H "Content-Type: application/json" -d "$B"); fi
code=$(curl "${args[@]}" "https://api.vapi.ai$P")
# scrub any authorization-looking material from headers
sed -i -E 's/(authorization|set-cookie|cookie):.*/\1: [REDACTED]/I' "$OUT/$N.headers.txt"
echo "$M $P -> $code ($(wc -c < "$OUT/$N.json") bytes)"
sleep 1
