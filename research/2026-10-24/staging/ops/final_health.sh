#!/bin/bash
# End of the 2026-10-24 job: lab and staging health, and that staging is left as deployed. Prints no secret values.
# Left as deployed means: no runtime drop-ins, no judge model in the runtime, code-default latency flags.
S=/opt/vp-stage; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
echo "== $(date -u)"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql
systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
curl -s -m 5 http://127.0.0.1:8080/api/ping; echo
curl -s -m 10 -o /dev/null -w "lab public %{http_code} %{time_total}s\n" https://$FQDN/api/ping
curl -s -m 10 -o /dev/null -w "staging no-auth %{http_code}\n" https://$FQDN:8443/
curl -s -m 10 -o /dev/null -w "staging auth %{http_code}\n" -u "${VP_STAGE_USER:-vp}:$VP_STAGE_PASS" https://$FQDN:8443/v1/health
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime activeCalls', d['activeCalls'], {k: v['available'] for k, v in d['stacks'].items()})"
echo "deployed: $(cat $S/app/BUNDLE_SHA)"; grep '^VERTEX_OFF=' $S/.env
echo "runtime drop-ins: $(ls /etc/systemd/system/vp-stage-runtime.service.d 2>/dev/null | wc -l); judge env file: $( [ -f $S/judge-shadow.env ] && echo present || echo absent )"
P=$(systemctl show vp-stage-runtime -p MainPID --value)
echo "runtime process: judge env vars $(tr '\0' '\n' < /proc/$P/environ | grep -c '^VP_LLM_SAFETY_JUDGE_'), latency flag overrides $(tr '\0' '\n' < /proc/$P/environ | grep -cE '^VP_(SPECULATE_PARTIAL|PREWARM|FIRST_CLAUSE|BARGE_NOD|BARGE_LONG_MS)=')"
echo "event batches since the deploy (00:40:29): runtime non-2xx $(journalctl -u vp-stage-runtime --since '2026-10-24 00:40:29' --no-pager | grep -c 'control plane answered'), gave up $(journalctl -u vp-stage-runtime --since '2026-10-24 00:40:29' --no-pager | grep -c 'gave up'), control 422 $(journalctl -u vp-stage-control --since '2026-10-24 00:40:29' --no-pager | grep -c ' 422')"
echo "runtime tracebacks since the deploy: $(journalctl -u vp-stage-runtime --since '2026-10-24 00:40:29' --no-pager | grep -c Traceback)"
cd /tmp && runuser -u vpstage -- psql -d vp_stage -At -c "SELECT 'test spend today (IST) INR ' || round(coalesce(sum(cost_inr_milli),0)/1000.0, 2) || ' over ' || count(*) || ' test calls' FROM conversation WHERE channel = 'test' AND started_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'"
runuser -u vpstage -- psql -d vp_stage -At -c "SELECT 'test spend since the deploy INR ' || round(coalesce(sum(cost_inr_milli),0)/1000.0, 2) || ' over ' || count(*) || ' test calls' FROM conversation WHERE channel = 'test' AND started_at >= '2026-10-24 00:40:29+00'"
cat /proc/loadavg; free -m | head -2; df -h / | tail -1
ss -ltn | awk '{print $4}' | grep -E ':(8080|8090|8091|5432|8443|443|80)$' | sort | tr '\n' ' '; echo
journalctl -u voicelab --since "2026-10-24 00:40" --no-pager | grep -ciE 'error|traceback'
