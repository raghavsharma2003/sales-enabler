#!/bin/bash
# Redeploy wrapper, part 1 of 3 (2026-10-24, e9fdde3). It is sent as ONE Run Command:
#   deploy_pre.sh + ../../2026-10-23/staging/ops/stage_setup.sh (verbatim) + deploy_post.sh
# Pre-checks first. Then VERTEX_OFF_WANT=0, so the Gemini stacks stay available as they were (stage_setup.sh defaults
# to 1). Prints no secret values.
echo "== pre $(date -u)"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql
systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
echo "lab ping before: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping before %{http_code}\n" https://vp-voicelab-1019.centralindia.cloudapp.azure.com/api/ping
echo "deployed before: $(cat /opt/vp-stage/app/BUNDLE_SHA 2>/dev/null)"; grep '^VERTEX_OFF=' /opt/vp-stage/.env
echo "judge env lines before: $(grep -c '^VP_LLM_SAFETY_JUDGE_' /opt/vp-stage/.env)"; ls /etc/systemd/system/vp-stage-runtime.service.d 2>/dev/null || echo "no runtime drop-ins"
cat /proc/loadavg; free -m | head -2; df -h / | tail -1
AC=$(curl -s -m 5 http://127.0.0.1:8090/v1/health | /opt/vp-stage/venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["activeCalls"])')
[ "$AC" = 0 ] || { echo "staging calls active ($AC); not redeploying"; exit 5; }
echo "deploy start $(date -u +%H:%M:%S)"
export VERTEX_OFF_WANT=0
