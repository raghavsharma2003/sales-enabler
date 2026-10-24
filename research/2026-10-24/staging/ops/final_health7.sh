#!/bin/bash
# End of the 6b0d859 remeasure (2026-10-24): lab and staging health, the VM's needrestart / reboot settings, and that
# staging is left as deployed (no runtime drop-ins, no judge model in the runtime, code-default turn-taking and latency
# flags). Prints no secret values.
S=/opt/vp-stage; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com; DEPLOY='2026-10-24 07:02:07'
echo "== $(date -u)"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql | tr '\n' ' '; echo
for u in postgresql@16-main voicelab vp-stage-control vp-stage-runtime; do echo "  $u since $(systemctl show $u -p ActiveEnterTimestamp --value) restarts $(systemctl show $u -p NRestarts --value)"; done
curl -s -m 5 http://127.0.0.1:8080/api/ping; echo
curl -s -m 10 -o /dev/null -w "lab public %{http_code} %{time_total}s\n" https://$FQDN/api/ping
curl -s -m 10 -o /dev/null -w "staging no-auth %{http_code}\n" https://$FQDN:8443/
curl -s -m 10 -o /dev/null -w "staging auth %{http_code}\n" -u "${VP_STAGE_USER:-vp}:$VP_STAGE_PASS" https://$FQDN:8443/v1/health
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime activeCalls', d['activeCalls'], {k: v['available'] for k, v in d['stacks'].items()})"
echo "deployed: $(cat $S/app/BUNDLE_SHA)"; grep '^VERTEX_OFF=' $S/.env
echo "runtime drop-ins: $(ls /etc/systemd/system/vp-stage-runtime.service.d 2>/dev/null | wc -l); judge env lines: $(grep -c '^VP_LLM_SAFETY_JUDGE_' $S/.env)"
P=$(systemctl show vp-stage-runtime -p MainPID --value)
echo "runtime process: judge env vars $(tr '\0' '\n' < /proc/$P/environ | grep -c '^VP_LLM_SAFETY_JUDGE_'), turn-taking / latency overrides $(tr '\0' '\n' < /proc/$P/environ | grep -cE '^VP_(SPECULATE_PARTIAL|SPECULATE_STABLE_MS|PREWARM|FIRST_CLAUSE|BARGE_[A-Z_]+|RESUME_MS|PACED_PROVIDERS|LISTEN_FIRST)=')"
echo "since the deploy ($DEPLOY): runtime non-2xx $(journalctl -u vp-stage-runtime --since "$DEPLOY" --no-pager | grep -c 'control plane answered'), gave up $(journalctl -u vp-stage-runtime --since "$DEPLOY" --no-pager | grep -c 'gave up'), control 422 $(journalctl -u vp-stage-control --since "$DEPLOY" --no-pager | grep -c ' 422'), runtime tracebacks $(journalctl -u vp-stage-runtime --since "$DEPLOY" --no-pager | grep -c Traceback), control error lines $(journalctl -u vp-stage-control --since "$DEPLOY" --no-pager | grep -ciE 'error|traceback')"
echo "lab error lines since the deploy: $(journalctl -u voicelab --since "$DEPLOY" --no-pager | grep -ciE 'error|traceback')"
cd /tmp && runuser -u vpstage -- psql -d vp_stage -At -c "SELECT 'test spend today (IST) INR ' || round(coalesce(sum(cost_inr_milli),0)/1000.0, 2) || ' over ' || count(*) || ' test calls' FROM conversation WHERE channel = 'test' AND started_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'"
runuser -u vpstage -- psql -d vp_stage -At -c "SELECT 'test spend since the deploy INR ' || round(coalesce(sum(cost_inr_milli),0)/1000.0, 2) || ' over ' || count(*) || ' test calls' FROM conversation WHERE channel = 'test' AND started_at >= '$DEPLOY+00'"
echo "needrestart effective restart mode: $(perl -e 'our %nrconf = (restart => "i"); for my $f ("/etc/needrestart/needrestart.conf", sort glob("/etc/needrestart/conf.d/*.conf")) { do $f; } print $nrconf{restart}')"
apt-config dump | grep -E '^(Unattended-Upgrade::Automatic-Reboot|APT::Periodic::Unattended-Upgrade) '
grep -h "$(date -u +%Y-%m-%d)" /var/log/unattended-upgrades/unattended-upgrades.log 2>/dev/null | grep -E 'Packages that will be upgraded|All upgrades installed' | tail -4 | cut -c1-200
cat /proc/loadavg; free -m | head -2 | tail -1; df -h / | tail -1
ss -ltn | awk '{print $4}' | grep -E ':(8080|8090|8091|5432|8443|443|80)$' | sort | tr '\n' ' '; echo
