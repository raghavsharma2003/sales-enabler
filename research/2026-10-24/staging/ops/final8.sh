#!/bin/bash
# Stage 8, end of job: health after, the job's spend from the DB, the workspaces this job left, and the safety events of
# the smoke's test call (rule, action and detail; the detail names rules, not secrets). Read-only. Placeholders filled by
# the caller: __JOB__ __WS__ __OWS__ __CALL__. Prints no secret values.
S=/opt/vp-stage; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com; JOB="__JOB__"; WS=__WS__; OWS=__OWS__; CALL=__CALL__
echo "== final8 $(date -u)"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql | tr '\n' ' '; echo
for u in voicelab vp-stage-control vp-stage-runtime postgresql caddy; do echo "$u since $(systemctl show $u -p ActiveEnterTimestamp --value), restarts $(systemctl show $u -p NRestarts --value)"; done
echo "deployed: $(cat $S/app/BUNDLE_SHA)"; grep '^VERTEX_OFF=' $S/.env
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime activeCalls', d['activeCalls'])"
echo "lab ping: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"; curl -s -m 10 -o /dev/null -w "lab public ping %{http_code} %{time_total}s\n" https://$FQDN/api/ping
echo "lab journal error lines since the job start: $(journalctl -u voicelab --since "$JOB" --no-pager | grep -ciE 'error|traceback')"
echo "staging: control error lines since the deploy $(journalctl -u vp-stage-control --since '2026-10-24 09:32:30' --no-pager | grep -ciE 'error|traceback'), warnings $(journalctl -u vp-stage-control --since '2026-10-24 09:32:30' --no-pager | grep -ci 'warning'); runtime tracebacks $(journalctl -u vp-stage-runtime --since '2026-10-24 09:32:30' --no-pager | grep -c Traceback), refused event batches $(journalctl -u vp-stage-runtime --since '2026-10-24 09:32:30' --no-pager | grep -cE 'control plane answered|gave up')"
journalctl -u vp-stage-control --since '2026-10-24 09:32:30' --no-pager | grep -iE 'warning|error' | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/<email>/g' | cut -c1-220 | head -6
cd /tmp
q() { runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "$1" 2>&1; }
echo "== spend since the job start ($JOB UTC), from the DB"
echo "calls: $(q "SELECT count(*) || ' calls, ' || coalesce(sum(cost_inr_milli),0) || ' INR milli' FROM conversation WHERE started_at >= '$JOB+00'")"
echo "cost lines (all, since job start): $(q "SELECT coalesce(string_agg(component || '=' || s, ', '), 'none') FROM (SELECT component, sum(inr_milli) s FROM cost_line WHERE created_at >= '$JOB+00' GROUP BY 1) x")"
echo "cost lines without a call (Operator, insights): $(q "SELECT count(*) || ' lines, ' || coalesce(sum(inr_milli),0) || ' INR milli' FROM cost_line WHERE conversation_id IS NULL AND created_at >= '$JOB+00'")"
echo "test runs (simulate/chat kept): $(q "SELECT count(*) FROM agent_test_run WHERE created_at >= '$JOB+00'")"
echo "smoke workspace test spend today (IST): $(q "SELECT coalesce(sum(cost_inr_milli),0) FROM conversation WHERE workspace_id = '$WS' AND channel = 'test' AND started_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'") of the INR 200 (200000 milli) daily test budget"
echo "== workspaces"
q "SELECT name, id, created_at FROM workspace ORDER BY created_at" | sed 's/^/  /'
echo "smoke workspace: proposed actions $(q "SELECT string_agg(tool || ' ' || status, ', ') FROM action WHERE workspace_id = '$WS' AND status = 'proposed'"); attempts $(q "SELECT count(*) FROM attempt WHERE workspace_id = '$WS'"); campaign state $(q "SELECT string_agg(state, ',') FROM campaign WHERE workspace_id = '$WS'")"
echo "owner workspace: members $(q "SELECT count(*) FROM member WHERE workspace_id = '$OWS'"), agents $(q "SELECT count(*) FROM agent WHERE workspace_id = '$OWS'"), contacts $(q "SELECT count(*) FROM contact WHERE workspace_id = '$OWS'"), campaigns $(q "SELECT count(*) FROM campaign WHERE workspace_id = '$OWS'"), calls $(q "SELECT count(*) FROM conversation WHERE workspace_id = '$OWS'"), wallet $(q "SELECT balance_inr_milli || ' ' || state FROM wallet WHERE workspace_id = '$OWS'")"
echo "money_config: $(q 'SELECT trial_credit_inr_milli, updated_at FROM money_config')"
echo "== the smoke call's safety events"
q "SELECT seq, rule, action, left(coalesce(detail::text, ''), 200) FROM call_safety_event WHERE conversation_id = '$CALL' ORDER BY seq" | sed 's/^/  /'
echo "agent turns (index, first 200 characters):"
q "SELECT idx, left(text, 200) FROM turn WHERE conversation_id = '$CALL' AND speaker = 'agent' ORDER BY idx" | sed 's/^/  /'
cat /proc/loadavg; free -m | head -2; df -h / | tail -1
ss -ltnp | grep -E ':(8090|8091|5432|8080) ' | awk '{print $4}' | tr '\n' ' '; echo
echo "== final8 done $(date -u)"
