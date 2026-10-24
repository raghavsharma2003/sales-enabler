#!/bin/bash
# Stage 8 config fix, step 5: verify the control-plane models and the recordings on staging, ON THE VM (one Run Command).
# Guards first (9b34ff7, no active call, the config names present, the judge off on both sides, the lab idle on Vertex),
# then verify9.py from the kit, the journal, and the upload of its JSON (ids, statuses, short texts; no secrets).
# Placeholders filled by drive8.sh: __KIT_SHA__ __JOB__. The basic-auth passcode arrives as a protected parameter and is
# used only by verify9.py in a request header. Prints no secret values.
S=/opt/vp-stage; B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
JOB="__JOB__"; K=/tmp/vps9
echo "== verify9 $(date -u) (job start $JOB UTC)"
cd /tmp
q() { runuser -u vpstage -- psql -d vp_stage -At -c "$1" 2>&1; }
D=$(cat $S/app/BUNDLE_SHA); echo "deployed: $D"; [ "$D" = 9b34ff7 ] || { echo "STOP: staging is not at 9b34ff7"; exit 3; }
AC=$(curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])'); echo "active staging calls: $AC"; [ "$AC" = 0 ] || { echo "STOP: staging calls active"; exit 5; }
CP=$(systemctl show vp-stage-control -p MainPID --value); RP=$(systemctl show vp-stage-runtime -p MainPID --value)
for n in VP_LLM_DEFAULT_URL VP_LLM_DEFAULT_KEY VP_LLM_DEFAULT_MODEL VP_RECORDINGS_DIR VP_RUNTIME_PUBLIC_URL; do
  tr '\0' '\n' < /proc/$CP/environ | grep -q "^$n=" && tr '\0' '\n' < /proc/$RP/environ | grep -q "^$n=" || { echo "STOP: $n not in both processes"; exit 3; }
done
[ "$(tr '\0' '\n' < /proc/$CP/environ | grep -c '^VP_SAFETY_JUDGE_MODE=off$')$(tr '\0' '\n' < /proc/$RP/environ | grep -c '^VP_SAFETY_JUDGE_MODE=off$')" = 11 ] || { echo "STOP: the judge is not off in both processes"; exit 3; }
echo "config names present in both processes; judge mode off in both; VP_LLM_SAFETY_JUDGE_* names: $(tr '\0' '\n' < /proc/$RP/environ | grep -c '^VP_LLM_SAFETY_JUDGE_')"
for i in $(seq 1 20); do
  last=$(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0)
  age=$(( $(date +%s) - last )); [ $age -gt 180 ] && break; echo "lab used Vertex ${age}s ago; waiting"; sleep 30
done
[ $age -gt 180 ] || { echo "STOP: the lab is still on Vertex"; exit 4; }
echo "workspaces before: $(q 'SELECT count(*) FROM workspace'); 'Config Check' already: $(q "SELECT count(*) FROM workspace WHERE name = 'Config Check'")"
OWS=fb5d0663-3726-4eac-bda4-8bc7a99107e1
own() { echo "agents $(q "SELECT count(*) FROM agent WHERE workspace_id = '$OWS'"), contacts $(q "SELECT count(*) FROM contact WHERE workspace_id = '$OWS'"), campaigns $(q "SELECT count(*) FROM campaign WHERE workspace_id = '$OWS'"), calls $(q "SELECT count(*) FROM conversation WHERE workspace_id = '$OWS'"), audit rows $(q "SELECT count(*) FROM audit_event WHERE workspace_id = '$OWS'"), wallet $(q "SELECT balance_inr_milli FROM wallet WHERE workspace_id = '$OWS'")"; }
echo "owner's workspace before: $(own)"
rm -rf $K && mkdir -p $K && curl -fsS -o $K/kit.tgz -H "x-ms-version: 2022-11-02" "$B/vps9-kit.tgz?$SAS" || { echo "STOP: kit download failed"; exit 6; }
[ "$(sha256sum $K/kit.tgz | cut -c1-64)" = "__KIT_SHA__" ] || { echo "STOP: kit sha256 mismatch"; exit 6; }
tar xzf $K/kit.tgz -C $K && echo "kit ok: $(ls $K | tr '\n' ' ')"
T0=$(date -u '+%Y-%m-%d %H:%M:%S')
cd $K && timeout 1500 $S/venv/bin/python -W ignore $K/verify9.py $K/verify9.json "$JOB" 2>&1 | cut -c1-600
echo "verify9 exit ${PIPESTATUS[0]} $(date -u +%H:%M:%S)"
cd /tmp
echo "owner's workspace after: $(own)"
W=$($S/venv/bin/python -c "import json; print(json.load(open('$K/verify9.json')).get('workspaceId') or '')" 2>/dev/null)
C=$($S/venv/bin/python -c "import json; print((json.load(open('$K/verify9.json')).get('call') or {}).get('conversationId') or '')" 2>/dev/null)
if [ -n "$C" ]; then
  echo "the call in the DB: $(q "SELECT status || ', ' || coalesce(end_reason,'') || ', ' || duration_s || ' s, ' || cost_inr_milli || ' milli, recording ' || (recording_uri IS NOT NULL) || ', analysis ' || coalesce(analysis->>'status','') FROM conversation WHERE id = '$C'")"
  echo "  judge events $(q "SELECT count(*) FROM call_judge_event WHERE conversation_id = '$C'") (0 = judge off); safety events $(q "SELECT coalesce(string_agg(rule || ' ' || action, ', ' ORDER BY seq), 'none') FROM call_safety_event WHERE conversation_id = '$C'"); analysis cost lines $(q "SELECT count(*) || ' (' || coalesce(sum(quantity),0) || ' tokens)' FROM cost_line WHERE conversation_id = '$C' AND component = 'analysis'")"
  echo "  recordings folder: $(ls -l $S/data/recordings | tail -n +2 | wc -l) file(s), $(du -sh $S/data/recordings | cut -f1); $(stat -c '%U:%G %a' $S/data/recordings)"
fi
echo "== journal since $T0 UTC (emails redacted)"
red() { sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/<email>/g' | cut -c1-240; }
echo "control: error lines $(journalctl -u vp-stage-control --since "$T0" --no-pager | grep -ciE 'error|traceback'), setup warnings $(journalctl -u vp-stage-control --since "$T0" --no-pager | grep -c 'setup: no model')"
journalctl -u vp-stage-control --since "$T0" --no-pager | grep -iE 'error|traceback|warn' | head -8 | red
echo "runtime: tracebacks $(journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -c Traceback), 5xx $(journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -cE 'HTTP/1\.[01]" 5[0-9][0-9] '), refused batches $(journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -cE 'control plane answered|gave up'), judge lines $(journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -ci 'judge')"
journalctl -u vp-stage-runtime --since "$T0" --no-pager | grep -E 'Traceback|ERROR|HTTP/1\.[01]" 5[0-9][0-9] ' | head -8 | red
curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @$K/verify9.json "$B/runlogs/vps9-verify9.json?$SAS" -o /dev/null -w "upload verify9.json %{http_code}\n"
rm -rf $K
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql | tr '\n' ' '; echo
echo "lab ping: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"; curl -s -m 10 -o /dev/null -w "lab public ping %{http_code}\n" https://$FQDN/api/ping
echo "== verify9 done $(date -u)"
