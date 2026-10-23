#!/bin/bash
echo "== $(date -u)"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql
systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
curl -s -m 5 http://127.0.0.1:8080/api/ping; echo
curl -s -m 10 -o /dev/null -w "lab public %{http_code} %{time_total}s\n" https://vp-voicelab-1019.centralindia.cloudapp.azure.com/api/ping
curl -s -m 10 -o /dev/null -w "staging no-auth %{http_code}\n" https://vp-voicelab-1019.centralindia.cloudapp.azure.com:8443/
curl -s -m 10 -o /dev/null -w "staging auth %{http_code}\n" -u "${VP_STAGE_USER:-vp}:$VP_STAGE_PASS" https://vp-voicelab-1019.centralindia.cloudapp.azure.com:8443/v1/health
curl -s -m 5 http://127.0.0.1:8090/v1/health | /opt/vp-stage/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime activeCalls', d['activeCalls'], {k: v['available'] for k, v in d['stacks'].items()})"
grep '^VERTEX_OFF=' /opt/vp-stage/.env
cat /proc/loadavg; free -m | head -2; df -h / | tail -1
ss -ltn | awk '{print $4}' | grep -E ':(8080|8090|8091|5432|8443|443|80)$' | sort | tr '\n' ' '; echo
journalctl -u voicelab --since "2026-10-23 19:00" --no-pager | grep -ciE 'error|traceback'
