#!/bin/bash
# Read-only: lab health + VM headroom. Prints no secret values.
echo "== date"; date -u
echo "== units"; systemctl is-active voicelab caddy; systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
echo "== lab ping local"; curl -s -m 5 http://127.0.0.1:8080/api/ping; echo
echo "== lab public"; curl -s -m 10 -o /dev/null -w "https %{http_code} %{time_total}s\n" https://vp-voicelab-1019.centralindia.cloudapp.azure.com/api/ping
echo "== cpu"; nproc; uptime; cat /proc/loadavg
read a b c d e f g h rest < <(grep '^cpu ' /proc/stat); t1=$((a+b+c+d+e+f+g+h)); i1=$((d+e)); sleep 10
read a b c d e f g h rest < <(grep '^cpu ' /proc/stat); t2=$((a+b+c+d+e+f+g+h)); i2=$((d+e))
echo "cpu_busy_10s_pct $(( 100*((t2-t1)-(i2-i1))/(t2-t1) ))"
echo "== mem"; free -m
echo "== disk"; df -h / /opt 2>/dev/null; du -sh /opt/voicelab/data /opt/voicelab/venv 2>/dev/null
echo "== top procs"; ps -eo pid,user,%cpu,%mem,rss,etime,comm --sort=-rss | head -12
echo "== listen"; ss -ltnp | awk '{print $4, $6}' | sed 's/users:((//' | cut -c1-80
echo "== software"; lsb_release -ds 2>/dev/null; python3 --version; command -v node && node --version; command -v psql && psql --version; command -v ffmpeg; ls /usr/lib/postgresql 2>/dev/null
echo "== caddy"; cat /etc/caddy/Caddyfile
echo "== lab env names + non-secret values"; cut -d= -f1 /opt/voicelab/.env | tr '\n' ' '; echo
grep -E '^(VERTEX_OFF|VP_REGION|VERTEX_LOCATION|VERTEX_LIVE_LOCATION|VERTEX_LIVE_AUDIO|LAB_SPEECH_REGION|LAB_HOST|LAB_PORT|LAB_DAILY_USD|VERTEX_CAP_USD|VERTEX_LAST_DAY|LAB_PUBLIC_URL)=' /opt/voicelab/.env
grep -c '^VERTEX_MODEL_MAP=' /opt/voicelab/.env; grep '^VERTEX_MODEL_MAP=' /opt/voicelab/.env | cut -c1-400
ls -la /opt/voicelab/vertex-sa.json /opt/ 2>&1
echo "== lab calls today"; ls /opt/voicelab/data/calls 2>/dev/null | wc -l; find /opt/voicelab/data/calls -newermt "$(date -u +%F)" -maxdepth 1 2>/dev/null | wc -l
echo "== lab vertex spend tail"; tail -3 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | cut -c1-300
echo "== journal errors (counts)"; journalctl -u voicelab --since "-2h" --no-pager | grep -ciE 'error|traceback'
