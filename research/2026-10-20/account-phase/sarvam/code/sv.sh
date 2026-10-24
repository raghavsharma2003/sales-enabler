#!/bin/bash
# usage: sv.sh KEYVAR METHOD URL OUTFILE HEADERNAME [BODYFILE]
set -u
ENVF=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/vp-teardown-accounts.env
KEY=$(grep "^$1=" $ENVF | cut -d= -f2- | tr -d "'\"")
M=$2; U=$3; O=$4; H=$5; B=${6:-}
HN="${H%%|*}"; HP=""; [[ "$H" == *"|"* ]] && HP="${H#*|} "; args=(-sS --max-time 40 -X "$M" -H "$HN: $HP$KEY" -H "Accept: application/json" -D "$O.hdr" -o "$O.body" -w "%{http_code} %{size_download} %{time_total}\n")
[ -n "$B" ] && args+=(-H "Content-Type: application/json" --data @"$B")
code=$(curl "${args[@]}" "$U" 2>&1)
# redact key in saved header file
sed -i "s/$KEY/[REDACTED]/g" "$O.hdr" "$O.body" 2>/dev/null
echo "$M $U -> $code"
