#!/bin/bash
# VM hygiene before the 6b0d859 remeasure (2026-10-24). At 06:25 UTC today unattended-upgrades installed zlib1g and its
# needrestart hook then restarted every service linked against the old library: postgresql, voicelab, vp-stage-runtime
# and (by crashing on the dropped DB connection) vp-stage-control, mid-run (../../judge-blind10, vm11-diag).
# This changes two things and nothing else:
#   1. needrestart lists, never restarts: /etc/needrestart/conf.d/90-vp-list-only.conf sets $nrconf{restart} = 'l'.
#   2. Unattended-Upgrade::Automatic-Reboot "false", in its own file /etc/apt/apt.conf.d/52vp-no-auto-reboot.
# Security updates keep installing: 20auto-upgrades and 50unattended-upgrades are not touched, and the timers stay on.
# Residual risk, not removed here: a package's own maintainer script still restarts its own service when that package
# is upgraded (a postgresql-16 security update restarts PostgreSQL). Before and after: the state, plus read-only checks
# (lab health, staging active calls, today's test spend). Prints no secret values.
S=/opt/vp-stage; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
echo "== $(date -u)"
lsb_release -ds 2>/dev/null; dpkg-query -W -f='needrestart ${Version}\nunattended-upgrades ${Version}\n' needrestart unattended-upgrades
echo "== before"
ls -la --time-style=long-iso /etc/needrestart/conf.d/ 2>/dev/null | tail -n +2
grep -nE '^\s*\$nrconf\{restart\}' /etc/needrestart/needrestart.conf /etc/needrestart/conf.d/*.conf 2>/dev/null || echo "no active \$nrconf{restart} line (package default)"
eff() { perl -e 'our %nrconf = (restart => "i"); for my $f ("/etc/needrestart/needrestart.conf", sort glob("/etc/needrestart/conf.d/*.conf")) { do $f; } print "needrestart effective restart mode: $nrconf{restart}\n"'; }
eff
echo "apt hook: $(grep -h needrestart /etc/apt/apt.conf.d/* 2>/dev/null | head -2 | tr -s ' ' | cut -c1-160)"
apt-config dump | grep -E '^(Unattended-Upgrade::Automatic-Reboot|APT::Periodic::(Update-Package-Lists|Unattended-Upgrade|Download-Upgradeable-Packages))' || true
echo "Automatic-Reboot lines in apt.conf.d: $(grep -hn 'Automatic-Reboot "' /etc/apt/apt.conf.d/* 2>/dev/null | grep -v '^\s*//' | tr '\n' ' ')"
systemctl is-enabled unattended-upgrades apt-daily-upgrade.timer apt-daily.timer 2>&1 | tr '\n' ' '; echo
systemctl list-timers apt-daily-upgrade.timer apt-daily.timer --no-pager 2>/dev/null | head -4

echo "== change"
umask 022
mkdir -p /etc/needrestart/conf.d
cat > /etc/needrestart/conf.d/90-vp-list-only.conf <<'EOF'
# VP lab VM vl-vm-cin (2026-10-24): list services that need a restart after an upgrade, never restart them.
# Why: on 2026-10-24 06:25 UTC unattended-upgrades (zlib1g) made needrestart restart PostgreSQL, the voice lab and the
# VP staging services mid-run. Services are restarted by the job that owns them. Security updates still install.
$nrconf{restart} = 'l';
EOF
cat > /etc/apt/apt.conf.d/52vp-no-auto-reboot <<'EOF'
// VP lab VM vl-vm-cin (2026-10-24): security updates keep installing (20auto-upgrades, 50unattended-upgrades
// unchanged); the VM is never rebooted automatically after one. A reboot is the owner's or a job's decision.
Unattended-Upgrade::Automatic-Reboot "false";
EOF
chmod 644 /etc/needrestart/conf.d/90-vp-list-only.conf /etc/apt/apt.conf.d/52vp-no-auto-reboot
sha256sum /etc/needrestart/conf.d/90-vp-list-only.conf /etc/apt/apt.conf.d/52vp-no-auto-reboot | cut -c1-16,65-

echo "== verify"
eff
apt-config dump | grep -E '^(Unattended-Upgrade::Automatic-Reboot|APT::Periodic::(Update-Package-Lists|Unattended-Upgrade))'
apt-config dump | grep -A6 '^Unattended-Upgrade::Allowed-Origins' | head -7
apt-config dump | grep -cE '^Unattended-Upgrade::Origins-Pattern' | sed 's/^/Origins-Pattern entries: /'
echo "needrestart -b (batch, list only; restarts nothing):"
needrestart -b -r l > /tmp/vps7-nr.txt 2>&1; echo "needrestart -b exit $?"
grep -vE '^NEEDRESTART-(UCSTA|UCCUR|UCEXP)' /tmp/vps7-nr.txt | head -20; rm -f /tmp/vps7-nr.txt
systemctl is-enabled unattended-upgrades apt-daily-upgrade.timer 2>&1 | tr '\n' ' '; echo

echo "== read-only: health, active calls, today's test spend"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql | tr '\n' ' '; echo
for u in voicelab vp-stage-runtime vp-stage-control postgresql@16-main; do echo "$u since $(systemctl show $u -p ActiveEnterTimestamp --value), restarts $(systemctl show $u -p NRestarts --value)"; done
echo "lab ping local: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping %{http_code} %{time_total}s\n" https://$FQDN/api/ping
echo "deployed: $(cat $S/app/BUNDLE_SHA 2>/dev/null)"
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime activeCalls', d['activeCalls'])"
cd /tmp && runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "SELECT 'IST day began ' || to_char(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC'"
runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "SELECT 'workspace ' || left(workspace_id::text, 8), count(*) || ' test calls', 'INR ' || round(coalesce(sum(cost_inr_milli),0)/1000.0, 2), 'last started ' || to_char(max(started_at) AT TIME ZONE 'UTC', 'HH24:MI') || ' UTC' FROM conversation WHERE channel = 'test' AND started_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' GROUP BY workspace_id"
runuser -u vpstage -- psql -d vp_stage -At -c "SELECT 'workspaces: ' || count(*) FROM workspace" 2>/dev/null || true
cat /proc/loadavg; free -m | head -2 | tail -1; df -h / | tail -1
echo "== done $(date -u)"
exit 0
