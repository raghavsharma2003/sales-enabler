#!/bin/bash
# End of the vm11 job (adapted from ../../judge-optout-b/ops/final_health10.sh). Lab and staging health, and that staging
# is left as deployed at 04:22:59 UTC (680c5e6): no runtime drop-ins, no judge model in the runtime, code-default latency
# flags, no restarts. Counts Vertex use by the staging runtime and the lab since this job started (__JOB__). Removes this
# job's VM-only copies: the eval trees /tmp/je11 and /tmp/je11t and this job's outputs in /tmp/judge-eval/ (uploaded to
# blob first by the runs). Ends with exit 0. Prints no secret values.
S=/opt/vp-stage; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com; SINCE='2026-10-24 04:22:59'; JOB='__JOB__'
echo "== $(date -u)"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql
systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
systemctl show vp-stage-runtime -p ActiveEnterTimestamp -p NRestarts; systemctl show vp-stage-control -p ActiveEnterTimestamp -p NRestarts
curl -s -m 5 http://127.0.0.1:8080/api/ping; echo
curl -s -m 10 -o /dev/null -w "lab public %{http_code} %{time_total}s\n" https://$FQDN/api/ping
curl -s -m 10 -o /dev/null -w "staging no-auth %{http_code}\n" https://$FQDN:8443/
curl -s -m 10 -o /dev/null -w "staging auth %{http_code}\n" -u "${VP_STAGE_USER:-vp}:$VP_STAGE_PASS" https://$FQDN:8443/v1/health
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime activeCalls', d['activeCalls'], {k: v['available'] for k, v in d['stacks'].items()})"
echo "deployed: $(cat $S/app/BUNDLE_SHA)"; grep '^VERTEX_OFF=' $S/.env
echo "runtime drop-ins: $(ls /etc/systemd/system/vp-stage-runtime.service.d 2>/dev/null | wc -l); judge env file: $( [ -f $S/judge-shadow.env ] && echo present || echo absent )"
P=$(systemctl show vp-stage-runtime -p MainPID --value)
echo "runtime process: judge env vars $(tr '\0' '\n' < /proc/$P/environ | grep -c '^VP_LLM_SAFETY_JUDGE_'), latency flag overrides $(tr '\0' '\n' < /proc/$P/environ | grep -cE '^VP_(SPECULATE_PARTIAL|PREWARM|FIRST_CLAUSE|BARGE_NOD|BARGE_LONG_MS)=')"
echo "runtime tracebacks since the deploy: $(journalctl -u vp-stage-runtime --since "$SINCE" --no-pager | grep -c Traceback)"
echo "control errors since the deploy: $(journalctl -u vp-stage-control --since "$SINCE" --no-pager | grep -ciE 'error|traceback')"
echo "staging runtime Vertex requests since the job start (pace log): $(awk -v t=$(date -d "$JOB" +%s) -F'"t": ' 'NF>1 {split($2,a,","); if (a[1]+0 >= t) n++} END {print n+0}' $S/data/vertex-pace.jsonl 2>/dev/null)"
echo "lab Vertex ledger rows since the job start: $($S/venv/bin/python -c "
import json, time, calendar
t0 = calendar.timegm(time.strptime('$JOB', '%Y-%m-%d %H:%M:%S')); n = 0
for l in open('/opt/voicelab/data/vertex-spend.jsonl'):
    try: n += json.loads(l).get('ts', 0) >= t0
    except Exception: pass
print(n)" 2>/dev/null)"
cd /tmp && runuser -u vpstage -- psql -d vp_stage -At -c "SELECT 'test calls since the deploy: ' || count(*) FROM conversation WHERE channel = 'test' AND started_at >= '2026-10-24 04:22:59+00'"
cat /proc/loadavg; free -m | head -2; df -h / | tail -1
ss -ltn | awk '{print $4}' | grep -E ':(8080|8090|8091|5432|8443|443|80)$' | sort | tr '\n' ' '; echo
echo "lab journal error lines since the job start: $(journalctl -u voicelab --since "$JOB" --no-pager | grep -ciE 'error|traceback')"
rm -rf /tmp/je11 /tmp/je11t /tmp/je11-bundle.tgz __OUTDIRS__
echo "removed /tmp/je11 and /tmp/je11t: $( [ -e /tmp/je11 ] || [ -e /tmp/je11t ] && echo no || echo yes); left in /tmp/judge-eval: $(ls /tmp/judge-eval 2>/dev/null | tr '\n' ' ')"
exit 0
