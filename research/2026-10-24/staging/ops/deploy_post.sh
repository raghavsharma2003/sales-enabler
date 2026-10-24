
# Redeploy wrapper, part 3 of 3: what was deployed, the latency flags and judge config the runtime runs with, and
# whether the probes loaded. Prints no secret values.
echo "== post $(date -u)"
S=/opt/vp-stage
echo "deployed now: $(cat $S/app/BUNDLE_SHA)"; grep '^VERTEX_OFF=' $S/.env
echo "migrations in tree: $(ls $S/app/product/db/migrations/*.sql | wc -l)"
echo "latency flag overrides in env (none means code defaults): $(grep -cE '^VP_(SPECULATE_PARTIAL|PREWARM|FIRST_CLAUSE|BARGE_NOD|BARGE_LONG_MS)=' $S/.env)"
cd $S/app/product/voice && $S/venv/bin/python -c "
from vpvoice.cascade import CascadeSession as C
print('code defaults: SPECULATE_PARTIAL', C.SPECULATE_PARTIAL, 'PREWARM', C.PREWARM, 'FIRST_CLAUSE', C.FIRST_CLAUSE, 'BARGE_NOD', C.BARGE_NOD, 'BARGE_LONG_MS', C.BARGE_LONG_MS)
from vpvoice import judge as J
import os
print('judge: timeout_ms', J.SPEC['timeout_ms'], 'threshold', J.SPEC['threshold'], 'mode_default', J.SPEC['mode_default'])"
echo "judge env lines now: $(grep -c '^VP_LLM_SAFETY_JUDGE_' $S/.env) (0 = no judge model configured, no judge calls)"
sleep 2
journalctl -u vp-stage-runtime --since "-2min" --no-pager | grep -E 'Traceback|Error|probes' | grep -v aiohttp.access | tail -5 | cut -c1-240
systemctl show vp-stage-runtime -p ActiveEnterTimestamp -p NRestarts; systemctl show vp-stage-control -p ActiveEnterTimestamp
echo "lab ping after: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping after %{http_code}\n" https://vp-voicelab-1019.centralindia.cloudapp.azure.com/api/ping
systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
