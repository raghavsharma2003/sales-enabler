#!/bin/bash
# Remove the VP private staging from the lab VM. Leaves the voice lab (voicelab, caddy's lab site) untouched.
# Afterwards, from the sandbox, delete the NSG rule: PUT/DELETE .../networkSecurityGroups/vl-nsg/securityRules/allow-8443.
set -e
export HOME=/root
systemctl disable --now vp-stage-runtime vp-stage-control 2>/dev/null || true
rm -f /etc/systemd/system/vp-stage-runtime.service /etc/systemd/system/vp-stage-control.service; systemctl daemon-reload
sed -i '\#import /etc/caddy/vp-stage.caddy#d' /etc/caddy/Caddyfile; rm -f /etc/caddy/vp-stage.caddy
/usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && /usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
su postgres -c "dropdb --if-exists vp_stage"; su postgres -c "psql -q -c 'DROP ROLE IF EXISTS vpstage'"
rm -rf /opt/vp-stage; userdel vpstage 2>/dev/null || true
# Postgres 16 itself was installed for staging only: apt-get purge -y postgresql-16 postgresql-common  (optional)
systemctl is-active voicelab caddy; curl -s -m 5 http://127.0.0.1:8080/api/ping; echo
