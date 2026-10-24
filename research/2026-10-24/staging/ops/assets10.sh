#!/bin/bash
# ead1bc8 check 4 (read-only): through Caddy on :8443, 401 without auth, 200 with it and the app's title, and each JS and
# CSS asset the page references (basic auth from the protected parameters; nothing printed). The curl block of
# smoke8b.sh, unchanged.
FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
U="${VP_STAGE_USER:-vp}:$VP_STAGE_PASS"
echo "== assets10 $(date -u); deployed $(cat /opt/vp-stage/app/BUNDLE_SHA)"
curl -s -m 10 -o /dev/null -w ":8443 / without auth %{http_code}\n" https://$FQDN:8443/
curl -s -m 10 -o /tmp/vps10-index.html -w ":8443 / with auth %{http_code}\n" -u "$U" https://$FQDN:8443/; echo "  title: $(grep -o '<title>[^<]*' /tmp/vps10-index.html | cut -c8-)"
for a in $(grep -oE '(src|href)="/assets/[^"]+\.(js|css)"' /tmp/vps10-index.html | cut -d'"' -f2 | sort -u); do
  curl -s -m 10 -o /dev/null -w "  asset $a %{http_code} %{size_download} bytes %{content_type}\n" -u "$U" https://$FQDN:8443$a
done
rm -f /tmp/vps10-index.html
curl -s -m 10 -o /dev/null -w ":8443 /v1/health %{http_code}\n" -u "$U" https://$FQDN:8443/v1/health
curl -s -m 10 -o /dev/null -w ":8443 /rt/v1/health %{http_code}\n" -u "$U" https://$FQDN:8443/rt/v1/health
curl -s -m 10 -o /dev/null -w ":8443 /v1/health without auth %{http_code}\n" https://$FQDN:8443/v1/health
echo "== assets10 done $(date -u)"
