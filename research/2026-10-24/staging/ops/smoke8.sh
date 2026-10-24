#!/bin/bash
# Stage 8, step 4: the buyer-journey smoke, ON THE VM (one Run Command). Guards first, then smoke8.py from the kit, then
# the spend after, the journal around any 5xx, lab health. Uploads the smoke's JSON (no secrets: the synthetic email,
# ids, statuses and short notes) to blob. Placeholders filled by drive8.sh: __KIT_SHA__ __JOB__.
# Spend: this job's cap is INR 80. The only metered step here is one browser test call, which the product caps at INR 50
# (TEST_CALL_MAX_COST_INR_MILLI) inside the workspace's INR 200 / IST day test budget (never bypassed: the call goes
# through test.browser_call, which enforces it). No control-plane model is configured on staging (VP_LLM_* unset), so
# the simulate, chat and Operator steps make no model call. Prints no secret values.
S=/opt/vp-stage; B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
JOB="__JOB__"; K=/tmp/vps8
echo "== smoke8 $(date -u) (job start $JOB UTC)"
cd /tmp
q() { runuser -u vpstage -- psql -d vp_stage -At -c "$1" 2>&1; }
spend() {
  echo "  conversation cost since job start (INR milli): $(q "SELECT coalesce(sum(cost_inr_milli),0) FROM conversation WHERE started_at >= '$JOB+00'")"
  echo "  cost lines without a call since job start (Operator, insights; INR milli): $(q "SELECT coalesce(sum(inr_milli),0) || ' in ' || count(*) || ' lines' FROM cost_line WHERE conversation_id IS NULL AND created_at >= '$JOB+00'")"
  echo "  test runs since job start (simulate / chat kept): $(q "SELECT count(*) || ' runs, tokens in ' || coalesce(sum((usage->>'inputTokens')::int),0) || ' out ' || coalesce(sum((usage->>'outputTokens')::int),0) FROM agent_test_run WHERE created_at >= '$JOB+00'")"
  echo "  test calls today (IST) by workspace (INR milli): $(q "SELECT coalesce(string_agg(w.name || '=' || s || ' (' || n || ' calls)', ', '), 'none') FROM (SELECT workspace_id, sum(cost_inr_milli) s, count(*) n FROM conversation WHERE channel = 'test' AND started_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' GROUP BY 1) x JOIN workspace w ON w.id = x.workspace_id")"; }
echo "== guards"
D=$(cat $S/app/BUNDLE_SHA); echo "deployed: $D"; [ "$D" = 9b34ff7 ] || { echo "STOP: staging is not at 9b34ff7"; exit 3; }
AC=$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])'); echo "active staging calls: $AC"
[ "$AC" = 0 ] || { echo "STOP: staging calls active"; exit 5; }
TC=$(q 'SELECT trial_credit_inr_milli FROM money_config'); echo "trial credit: $TC milli"; [ "$TC" = 5000000 ] || { echo "STOP: the test credit is not on"; exit 3; }
echo "control-plane model env vars (names): $(grep -c '^VP_LLM_' $S/.env) in .env; $(tr '\0' '\n' < /proc/$(systemctl show vp-stage-control -p MainPID --value)/environ | grep -c '^VP_LLM_') in the control process"
JS=$(q "SELECT coalesce(sum(cost_inr_milli),0) FROM conversation WHERE started_at >= '$JOB+00'")
[ $((JS + 50000)) -le 80000 ] || { echo "STOP: job spend $JS + one test call's INR 50 cap would pass INR 80"; exit 4; }
echo "job spend so far $JS milli; + one call's INR 50 cap = $((JS + 50000)) <= 80000: go"
for i in $(seq 1 20); do
  last=$(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0)
  age=$(( $(date +%s) - last )); [ $age -gt 180 ] && break; echo "lab used Vertex ${age}s ago; waiting"; sleep 30
done
[ $age -gt 180 ] || { echo "STOP: the lab is still on Vertex"; exit 4; }
echo "lab Vertex idle ${age}s; lab ping $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
systemctl show vp-stage-control vp-stage-runtime -p ActiveEnterTimestamp -p NRestarts | paste - - - - - | tr '\t' ' ' | sed 's/^/units before: /'
echo "== spend before"; spend
echo "== kit"
rm -rf $K && mkdir -p $K && curl -fsS -o $K/kit.tgz -H "x-ms-version: 2022-11-02" "$B/vps8-kit.tgz?$SAS" || { echo "STOP: kit download failed"; exit 6; }
[ "$(sha256sum $K/kit.tgz | cut -c1-64)" = "__KIT_SHA__" ] || { echo "STOP: kit sha256 mismatch"; exit 6; }
tar xzf $K/kit.tgz -C $K && echo "kit ok: $(ls $K | tr '\n' ' ')"
echo "== smoke $(date -u +%H:%M:%S)"
T0=$(date -u '+%Y-%m-%d %H:%M:%S')
cd $K && timeout 1500 $S/venv/bin/python $K/smoke8.py $K/smoke8.json 2>&1 | cut -c1-400
echo "smoke exit ${PIPESTATUS[0]} $(date -u +%H:%M:%S)"
cd /tmp
echo "== spend after"; spend
echo "== journal since $T0 UTC (no bodies; emails redacted)"
red() { sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/<email>/g' | cut -c1-240; }
echo "control error/warn lines: $(journalctl -u vp-stage-control --since "$T0" --no-pager | grep -ciE 'error|warn|traceback')"
journalctl -u vp-stage-control --since "$T0" --no-pager | grep -iE 'error|warn|traceback' | head -12 | red
echo "runtime tracebacks: $(journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -c Traceback); runtime 5xx access lines: $(journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -cE 'HTTP/1\.[01]" 5[0-9][0-9] ')"
journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -E 'Traceback|ERROR|HTTP/1\.[01]" 5[0-9][0-9] |control plane answered|gave up' | head -12 | red
F=$($S/venv/bin/python -c "import json; d=json.load(open('$K/smoke8.json')); print(' '.join(x['at'] for x in d['fiveXX']))" 2>/dev/null)
if [ -n "$F" ]; then
  for t in $F; do echo "-- around 5xx at $t"; journalctl -u vp-stage-control -u vp-stage-runtime --since "$(date -u -d "today $t 30 seconds ago" '+%Y-%m-%d %H:%M:%S')" --until "$(date -u -d "today $t 30 seconds" '+%Y-%m-%d %H:%M:%S')" --no-pager | grep -v aiohttp.access | tail -20 | red; done
else echo "no 5xx answered during the smoke"; fi
echo "== upload"
curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$K/smoke8.json "$B/runlogs/vps8-smoke8.json?$SAS" -o /dev/null -w "upload smoke8.json %{http_code}\n"
echo "== after"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql | tr '\n' ' '; echo
systemctl show vp-stage-control vp-stage-runtime voicelab -p ActiveEnterTimestamp -p NRestarts | paste - - - - - - - - | tr '\t' ' ' | sed 's/^/units after: /'
echo "lab ping: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"; curl -s -m 10 -o /dev/null -w "lab public ping %{http_code}\n" https://$FQDN/api/ping
echo "== smoke8 done $(date -u)"
