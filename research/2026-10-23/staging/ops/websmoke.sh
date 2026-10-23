#!/bin/bash
# Web shell through the public hostname on 8443: page, its JS/CSS assets, sign-in with the synthetic seed account, /v1/me.
F=https://vp-voicelab-1019.centralindia.cloudapp.azure.com:8443
A="${VP_STAGE_USER:-vp}:$VP_STAGE_PASS"
cd /tmp && rm -f vps-cj vps-idx.html
curl -s -m 10 -u "$A" -o vps-idx.html -w "index %{http_code}\n" $F/
for a in $(grep -oE '/assets/[^"]+' vps-idx.html); do curl -s -m 10 -u "$A" -o /dev/null -w "$a %{http_code} %{size_download}B\n" $F$a; done
curl -s -m 10 -u "$A" -c vps-cj -o /dev/null -w "login %{http_code}\n" -H 'content-type: application/json' -d '{"email":"asha@saanjh.example","password":"sample-password-1234"}' $F/v1/login
grep -c . vps-cj >/dev/null && awk 'NF>=7 {print "cookie", $6, "secure="$4, "httponly=" ($1 ~ /HttpOnly/)}' vps-cj | cut -c1-80
curl -s -m 10 -u "$A" -b vps-cj $F/v1/me | head -c 300 | sed -E 's/"[a-f0-9-]{36}"/"<id>"/g'; echo
curl -s -m 10 -u "$A" -b vps-cj -H 'content-type: application/json' -d '{"args":{}}' $F/v1/tools/agent.list | python3 -c "import json,sys; d=json.load(sys.stdin); print('agents', d['status'], [a['name'] for a in d['result']['agents']])"
curl -s -m 10 -u "$A" -b vps-cj -H 'content-type: application/json' -d '{"args":{}}' $F/v1/tools/stack.list | python3 -c "import json,sys; d=json.load(sys.stdin); print('stack.list default', d['result']['default'], [(s['id'], s['availability'].get('state')) for s in d['result']['stacks']])"
rm -f vps-cj vps-idx.html
